use crate::error::{AppError, Result};
use crate::runtime::RuntimeServices;
use crate::workflow::artifact::ArtifactManager;
use crate::workflow::executor::{NodeExecutor, ProgressReporter};
use crate::workflow::model::{MediaRef, Node, NodeExecutionResult, NodeInputs, NodeValue};
use async_trait::async_trait;
use serde_json::Value;
use std::path::Path;
use tokio_util::sync::CancellationToken;
use uuid::Uuid;

/// SoundwaveVisualizerNode — the rendering heart of the YouTube pipeline.
///
/// Composes the background layer + the audio + an audio-reactive visualizer
/// into one MP4 with a single FFmpeg invocation. The filtergraph:
///
///   [1:a] volume=<sensitivity> [a];
///   [a] <visualizer>=...:colors=0xRRGGBB[:...] [vis];
///   [0:v] scale=<W>:<H>:force_original_aspect_ratio=<fit>,
///         (crop|pad to <W>x<H>), setsar=1, fps=<fps> [bg];
///   [bg][vis] overlay=<x>:<y> [v];
///
/// Inputs:
///   0 = background (image → `-loop 1`, video → `-stream_loop -1`)
///   1 = audio
/// Output: `video` MediaRef (the rendered MP4) + an artifact.
///
/// Visualizer mapping (validated against FFmpeg 8.1.1 — each filter's option
/// names + value enums were probed empirically; the previously-used
/// `showspectrum=mode=bar` / `showwaves=mode=pcl` / `showspectrum=mode=circle`
/// syntaxes were ALL invalid and FFmpeg rejected them, so the pipeline never
/// actually rendered):
///   frequencyBars    → showfreqs=mode=bar:colors=0x<accent>:win_size=<ws>
///                      (showfreqs has no `slide` option; win_size need not be
///                       a power of two — `showspectrum` did require pow2, but
///                       showfreqs accepts arbitrary sizes.)
///   waveform         → showwaves=mode=cline:rate=<fps>:colors=0x<accent>
///                      (real showwaves modes are point/line/p2p/cline, NOT pcl)
///   circularSpectrum → avectorscope=s=<S>x<S>:rate=<fps>:rc/gc/bc=<0..1>
///                      (showspectrum has no `circle` mode and no `colors`
///                       option — only `color=` presets. avectorscope renders
///                       the stereo phase as a centered Lissajous and tints to
///                       the accent via its per-channel rc/gc/bc multipliers.)
///
/// Sensitivity pre-amplifies the audio before the visualizer filter so the
/// bars/wave react more strongly. Progress streams through `run_ffmpeg`'s
/// `-progress pipe:1` parser, scaled by the audio duration from the upstream
/// `metadata` input (or a fresh FFprobe if metadata is absent).
pub struct SoundwaveVisualizerNode;

/// Normalise an accent colour to FFmpeg's `0xRRGGBB` form (the syntax the
/// showfreqs / showwaves `colors` option expects). Accepts `#RRGGBB` or the
/// bare hex; returns the default accent when parsing fails so the filter never
/// emits an empty/invalid colour token.
fn accent_to_hex(accent: &str) -> String {
    let hex = accent.trim_start_matches('#');
    if hex.len() == 6 && hex.chars().all(|c| c.is_ascii_hexdigit()) {
        format!("0x{}", hex.to_ascii_lowercase())
    } else {
        "0x7669de".to_string()
    }
}

/// RGB components in [0.0, 1.0] for the `avectorscope` rc/gc/bc multipliers.
fn accent_to_rgb(accent: &str) -> (f64, f64, f64) {
    let hex = accent.trim_start_matches('#');
    if hex.len() == 6 && hex.chars().all(|c| c.is_ascii_hexdigit()) {
        let r = u8::from_str_radix(&hex[0..2], 16).unwrap_or(0) as f64 / 255.0;
        let g = u8::from_str_radix(&hex[2..4], 16).unwrap_or(0) as f64 / 255.0;
        let b = u8::from_str_radix(&hex[4..6], 16).unwrap_or(0) as f64 / 255.0;
        (r, g, b)
    } else {
        (0.463, 0.412, 0.871) // #7669DE
    }
}

/// Output canvas for a given target height (16:9, even-pixel-safe). For the
/// circular visualizer the overlay is square (min canvas dimension) so the
/// Lissajous isn't squashed — `output_dims` still gives the full 16:9 frame.
fn output_dims(scale_height: u32) -> (u32, u32) {
    match scale_height {
        480 => (854, 480),
        720 => (1280, 720),
        _ => (1920, 1080),
    }
}

/// Window size for `showfreqs`. Unlike `showspectrum` (which required a power
/// of two), `showfreqs` accepts any value; we still round bar_count up to a
/// reasonable granularity so very small counts render a few distinct bars
/// rather than a single column. Clamped to [16, 65536] as a sane range.
fn win_size(count: u32) -> u32 {
    let size = if count < 16 { 16 } else { count };
    size.clamp(16, 65536)
}

/// Y offset for the visualizer overlay given its height + vertical position.
fn overlay_y(out_h: u32, vis_h: u32, position: &str, margin: u32) -> String {
    match position {
        "top" => margin.to_string(),
        "center" => format!("{}", (out_h.saturating_sub(vis_h)) / 2),
        _ => format!("{}", out_h.saturating_sub(vis_h).saturating_sub(margin)), // bottom
    }
}

/// X offset — visualizer is full canvas width, so horizontally centered.
fn overlay_x(out_w: u32, vis_w: u32) -> String {
    format!("{}", (out_w.saturating_sub(vis_w)) / 2)
}

#[allow(clippy::too_many_arguments)]
fn build_filtergraph(
    visualizer_type: &str,
    accent: &str,
    bar_count: u32,
    sensitivity: f64,
    fit: &str,
    position: &str,
    (out_w, out_h): (u32, u32),
    fps: u32,
) -> Result<String> {
    let hex = accent_to_hex(accent);
    // The rectangular visualizers (bars, waves) span full canvas width and a
    // quarter of its height. The circular one is a square sized to the smaller
    // canvas dimension so the Lissajous stays round, not stretched.
    let (vis_w, vis_h) = match visualizer_type {
        "circularSpectrum" => {
            let side = (out_w.min(out_h) / 3).max(200);
            (side, side)
        }
        _ => (out_w, (out_h / 4).max(120)),
    };
    let margin = out_h / 24;

    // Background scaling per fit policy.
    let bg_scale = match fit {
        "contain" => format!(
            "scale={out_w}:{out_h}:force_original_aspect_ratio=decrease,pad={out_w}:{out_h}:(ow-iw)/2:(oh-ih)/2:color=black"
        ),
        "stretch" => format!("scale={out_w}:{out_h}"),
        _ => format!( // "cover"
            "scale={out_w}:{out_h}:force_original_aspect_ratio=increase,crop={out_w}:{out_h}"
        ),
    };

    let visualizer_filter = match visualizer_type {
        "waveform" => format!(
            "showwaves=s={vis_w}x{vis_h}:mode=cline:rate={fps}:colors={hex}"
        ),
        "circularSpectrum" => {
            let (r, g, b) = accent_to_rgb(accent);
            format!(
                "avectorscope=s={vis_w}x{vis_h}:rate={fps}:rc={r}:gc={g}:bc={b}:zoom=0.5"
            )
        }
        // "frequencyBars" (default)
        _ => format!(
            "showfreqs=s={vis_w}x{vis_h}:mode=bar:colors={hex}:win_size={}",
            win_size(bar_count)
        ),
    };

    let x = overlay_x(out_w, vis_w);
    let y = overlay_y(out_h, vis_h, position, margin);

    Ok(format!(
        "[1:a]volume={sensitivity}[a];\
         [a]{visualizer_filter}[vis];\
         [0:v]{bg_scale},setsar=1,fps={fps}[bg];\
         [bg][vis]overlay={x}:{y}[v]"
    ))
}

fn build_args(
    node: &Node,
    background_path: &str,
    background_mode: &str,
    audio_path: &str,
    output: &str,
) -> Result<Vec<String>> {
    let data = &node.data.extra;
    let visualizer_type = data
        .get("visualizerType")
        .and_then(Value::as_str)
        .unwrap_or("frequencyBars");
    if !matches!(visualizer_type, "frequencyBars" | "waveform" | "circularSpectrum") {
        return Err(AppError::validation(
            "VISUALIZER_TYPE_INVALID",
            format!("Unsupported visualizer type: {visualizer_type}."),
            serde_json::json!({ "nodeId": node.id, "visualizerType": visualizer_type }),
        ));
    }
    let accent = data
        .get("colorAccent")
        .and_then(Value::as_str)
        .filter(|v| v.starts_with('#'))
        .unwrap_or("#7669DE");
    let bar_count = data
        .get("barCount")
        .and_then(|v| v.as_u64().or_else(|| v.as_str().and_then(|s| s.parse().ok())))
        .map(|v| v as u32)
        .unwrap_or(48)
        .clamp(4, 256);
    let sensitivity = data
        .get("sensitivity")
        .and_then(|v| v.as_f64().or_else(|| v.as_str().and_then(|s| s.parse().ok())))
        .unwrap_or(1.0)
        .clamp(0.1, 8.0);
    let opacity = data
        .get("opacity")
        .and_then(|v| v.as_f64().or_else(|| v.as_str().and_then(|s| s.parse().ok())))
        .unwrap_or(0.85)
        .clamp(0.1, 1.0);
    let position = data
        .get("position")
        .and_then(Value::as_str)
        .unwrap_or("bottom");
    if !matches!(position, "bottom" | "center" | "top") {
        return Err(AppError::validation(
            "VISUALIZER_POSITION_INVALID",
            format!("Unsupported position: {position}."),
            serde_json::json!({ "nodeId": node.id, "position": position }),
        ));
    }
    let fps = data
        .get("fps")
        .and_then(|v| {
            v.as_u64()
                .map(|n| n as u32)
                .or_else(|| v.as_str().and_then(|s| s.parse::<u32>().ok()))
        })
        .unwrap_or(30);
    if ![24, 30, 60].contains(&fps) {
        return Err(AppError::validation(
            "VISUALIZER_FPS_INVALID",
            format!("Unsupported frame rate: {fps}."),
            serde_json::json!({ "nodeId": node.id, "fps": fps }),
        ));
    }
    let scale_height = data
        .get("scaleHeight")
        .and_then(|v| {
            v.as_u64()
                .map(|n| n as u32)
                .or_else(|| v.as_str().and_then(|s| s.parse::<u32>().ok()))
        })
        .unwrap_or(1080);
    if ![480, 720, 1080].contains(&scale_height) {
        return Err(AppError::validation(
            "VISUALIZER_SCALE_INVALID",
            format!("Unsupported output height: {scale_height}."),
            serde_json::json!({ "nodeId": node.id, "scaleHeight": scale_height }),
        ));
    }

    let dims = output_dims(scale_height);
    let filtergraph = build_filtergraph(
        visualizer_type,
        accent,
        bar_count,
        sensitivity,
        data.get("fit").and_then(Value::as_str).unwrap_or("cover"),
        position,
        dims,
        fps,
    )?;

    let mut args = vec!["-y".to_string()];
    // Input 0: background. Static image loops forever; video loops via
    // -stream_loop. Both stop at -shortest (audio duration).
    if background_mode == "image" {
        args.extend(["-loop".into(), "1".into()]);
    } else {
        args.extend(["-stream_loop".into(), "-1".into()]);
    }
    args.extend(["-i".into(), background_path.into()]);
    // Input 1: audio.
    args.extend(["-i".into(), audio_path.into()]);

    args.extend([
        "-filter_complex".into(),
        filtergraph,
        "-map".into(),
        "[v]".into(),
        "-map".into(),
        "1:a".into(),
    ]);

    // Visualizer opacity is applied as a per-stream alpha via format=rgba when
    // below 1.0; otherwise skip the extra filter to keep the pipeline lean.
    if opacity < 1.0 {
        // Insert an alpha blend onto the visualizer before overlay by rewriting
        // is costly; instead express via the codec's global transparency on the
        // overlay pad. Simpler + safe: encode with the visualizer layer's
        // effective opacity baked via colorchannelmixer on [vis].
        // (Rebuild filtergraph tail with colorchannelmixer for accuracy.)
        args = rebuild_with_opacity(
            args,
            visualizer_type,
            accent,
            bar_count,
            sensitivity,
            data.get("fit").and_then(Value::as_str).unwrap_or("cover"),
            position,
            dims,
            fps,
            opacity,
        )?;
    }

    let preset = data
        .get("preset")
        .and_then(Value::as_str)
        .unwrap_or("ultrafast");

    args.extend([
        "-c:v".into(),
        "libx264".into(),
        "-preset".into(),
        preset.into(),
        "-tune".into(),
        "fastdecode".into(),
        "-threads".into(),
        "0".into(),
        "-pix_fmt".into(),
        "yuv420p".into(),
        "-c:a".into(),
        "aac".into(),
        "-b:a".into(),
        "192k".into(),
        "-shortest".into(),
        "-movflags".into(),
        "+faststart".into(),
        "-progress".into(),
        "pipe:1".into(),
        "-nostats".into(),
        output.into(),
    ]);
    Ok(args)
}

#[allow(clippy::too_many_arguments)]
fn rebuild_with_opacity(
    mut args: Vec<String>,
    visualizer_type: &str,
    accent: &str,
    bar_count: u32,
    sensitivity: f64,
    fit: &str,
    position: &str,
    dims: (u32, u32),
    fps: u32,
    opacity: f64,
) -> Result<Vec<String>> {
    let (out_w, out_h) = dims;
    let hex = accent_to_hex(accent);
    let (vis_w, vis_h) = match visualizer_type {
        "circularSpectrum" => {
            let side = (out_w.min(out_h) / 3).max(200);
            (side, side)
        }
        _ => (out_w, (out_h / 4).max(120)),
    };
    let margin = out_h / 24;
    let visualizer_filter = match visualizer_type {
        "waveform" => format!("showwaves=s={vis_w}x{vis_h}:mode=cline:rate={fps}:colors={hex}"),
        "circularSpectrum" => {
            let (r, g, b) = accent_to_rgb(accent);
            format!("avectorscope=s={vis_w}x{vis_h}:rate={fps}:rc={r}:gc={g}:bc={b}:zoom=0.5")
        }
        _ => format!("showfreqs=s={vis_w}x{vis_h}:mode=bar:colors={hex}:win_size={}", win_size(bar_count)),
    };
    let bg_scale = match fit {
        "contain" => format!("scale={out_w}:{out_h}:force_original_aspect_ratio=decrease,pad={out_w}:{out_h}:(ow-iw)/2:(oh-ih)/2:color=black"),
        "stretch" => format!("scale={out_w}:{out_h}"),
        _ => format!("scale={out_w}:{out_h}:force_original_aspect_ratio=increase,crop={out_w}:{out_h}"),
    };
    let x = overlay_x(out_w, vis_w);
    let y = overlay_y(out_h, vis_h, position, margin);
    let graph = format!(
        "[1:a]volume={sensitivity}[a];\
         [a]{visualizer_filter},format=rgba,colorchannelmixer=aa={opacity}[vis];\
         [0:v]{bg_scale},setsar=1,fps={fps}[bg];\
         [bg][vis]overlay={x}:{y}:format=auto[v]"
    );
    // Replace the existing -filter_complex value (always at index after the flag).
    if let Some(pos) = args.iter().position(|a| a == "-filter_complex") {
        args[pos + 1] = graph;
    }
    Ok(args)
}

#[async_trait]
impl NodeExecutor for SoundwaveVisualizerNode {
    async fn execute(
        &self,
        node: &Node,
        inputs: &NodeInputs,
        cancel_token: CancellationToken,
        artifact_manager: &ArtifactManager,
        runtime: &RuntimeServices,
        progress: ProgressReporter,
    ) -> Result<NodeExecutionResult> {
        let audio_path = inputs
            .get("audio")
            .and_then(NodeValue::as_path)
            .filter(|v| !v.is_empty())
            .ok_or_else(|| {
                AppError::validation(
                    "VISUALIZER_AUDIO_MISSING",
                    "Soundwave Visualizer requires an audio input.",
                    serde_json::json!({ "nodeId": node.id }),
                )
            })?;
        let background = inputs
            .get("background")
            .and_then(|v| match v {
                NodeValue::Media(m) | NodeValue::Audio(m) | NodeValue::Video(m) => Some(m),
                _ => None,
            })
            .ok_or_else(|| {
                AppError::validation(
                    "VISUALIZER_BACKGROUND_MISSING",
                    "Soundwave Visualizer requires a background input.",
                    serde_json::json!({ "nodeId": node.id }),
                )
            })?;
        let background_path = Path::new(&background.path)
            .canonicalize()
            .map_err(|_| {
                AppError::validation(
                    "VISUALIZER_BACKGROUND_INVALID",
                    "The background file could not be opened.",
                    serde_json::json!({ "nodeId": node.id, "path": background.path }),
                )
            })?;
        let background_mode = background
            .metadata
            .get("mode")
            .and_then(Value::as_str)
            .unwrap_or("image");

        progress(0.05);

        // Audio duration drives progress. Prefer the upstream metadata input
        // (already probed by audioCover); fall back to a fresh FFprobe on the
        // audio path so progress still works when the metadata edge is absent.
        let from_metadata = inputs
            .get("metadata")
            .and_then(|v| match v {
                NodeValue::Json(value) => Some(value),
                _ => None,
            })
            .and_then(|v| v.get("durationMs"))
            .and_then(Value::as_u64)
            .filter(|v| *v > 0);
        let duration_ms = if from_metadata.is_some() {
            from_metadata
        } else {
            runtime
                .probe_media_json(audio_path, cancel_token.clone())
                .await
                .ok()
                .and_then(|v| {
                    v.pointer("/format/duration")
                        .and_then(Value::as_str)
                        .and_then(|s| s.parse::<f64>().ok())
                        .map(|s| (s * 1000.0).round() as u64)
                })
        };

        progress(0.1);

        let audio_canonical = Path::new(audio_path)
            .canonicalize()
            .map_err(|_| {
                AppError::validation(
                    "VISUALIZER_AUDIO_INVALID",
                    "The audio file could not be opened.",
                    serde_json::json!({ "nodeId": node.id, "path": audio_path }),
                )
            })?;
        let output_path =
            artifact_manager.get_output_path(&format!("visualizer-{}.mp4", Uuid::new_v4()));
        let output_path_string = output_path.to_string_lossy().into_owned();
        let args = build_args(
            node,
            &background_path.to_string_lossy(),
            background_mode,
            &audio_canonical.to_string_lossy(),
            &output_path_string,
        )?;

        runtime
            .run_ffmpeg(&args, duration_ms, cancel_token, progress)
            .await?;

        let artifact = artifact_manager.describe(
            &output_path,
            "video",
            &node.id,
            Some("video/mp4"),
        )?;
        let media = MediaRef {
            path: output_path_string,
            mime: Some("video/mp4".into()),
            metadata: serde_json::json!({ "container": "mp4", "visualizer": "rendered" }),
        };
        Ok(NodeExecutionResult {
            outputs: [("video".into(), NodeValue::Video(media))].into(),
            artifacts: vec![artifact],
            ..NodeExecutionResult::default()
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::workflow::model::NodeData;
    use std::collections::HashMap;

    fn node(config: Value) -> Node {
        Node {
            id: "vis".into(),
            node_type: "soundwaveVisualizer".into(),
            version: 2,
            data: NodeData {
                label: "Visualizer".into(),
                extra: config,
            },
            extra: HashMap::new(),
        }
    }

    #[test]
    fn frequency_bars_builds_showfreqs_bar_with_win_size() {
        let args = build_args(
            &node(serde_json::json!({
                "visualizerType": "frequencyBars", "barCount": 48,
                "colorAccent": "#7669DE", "sensitivity": 1.5,
                "fit": "cover", "position": "bottom", "fps": 30, "scaleHeight": 1080,
                "opacity": 1.0
            })),
            "bg.jpg",
            "image",
            "track.mp3",
            "out.mp4",
        )
        .unwrap();
        let graph = args
            .windows(2)
            .find(|p| p[0] == "-filter_complex")
            .map(|p| p[1].as_str())
            .unwrap();
        // frequencyBars → showfreqs (NOT showspectrum; showspectrum has no
        // `bar` mode). showfreqs uses `0xRRGGBB` colours, no `slide` option.
        assert!(graph.contains("showfreqs=s="));
        assert!(graph.contains("mode=bar"));
        assert!(graph.contains("volume=1.5"));
        assert!(graph.contains("colors=0x7669de"));
        assert!(graph.contains("win_size=48"));
        assert!(!graph.contains("slide="));
        assert!(args.contains(&"-shortest".to_string()));
        assert!(args.contains(&"libx264".to_string()));
        assert!(args.iter().any(|a| a == "-loop"));
        assert!(args.windows(2).any(|p| p[0] == "-map" && p[1] == "[v]"));
        assert!(args.windows(2).any(|p| p[0] == "-map" && p[1] == "1:a"));
    }

    #[test]
    fn waveform_builds_showwaves_cline_and_video_loop_input() {
        let args = build_args(
            &node(serde_json::json!({
                "visualizerType": "waveform", "opacity": 1.0, "fps": 60
            })),
            "loop.mp4",
            "video",
            "track.mp3",
            "out.mp4",
        )
        .unwrap();
        let graph = args
            .windows(2)
            .find(|p| p[0] == "-filter_complex")
            .map(|p| p[1].as_str())
            .unwrap();
        // waveform → showwaves with the valid `cline` mode (NOT `pcl`, which
        // FFmpeg rejects). Colours as 0xRRGGBB.
        assert!(graph.contains("showwaves=s="));
        assert!(graph.contains("mode=cline"));
        assert!(graph.contains("rate=60"));
        assert!(graph.contains("colors=0x7669de"));
        // Video background loops via -stream_loop, not -loop.
        assert!(args.windows(2).any(|p| p[0] == "-stream_loop" && p[1] == "-1"));
        assert!(!args.iter().any(|a| a == "-loop"));
    }

    #[test]
    fn circular_spectrum_uses_avectorscope_with_accent_tint() {
        let args = build_args(
            &node(serde_json::json!({
                "visualizerType": "circularSpectrum", "opacity": 1.0,
                "colorAccent": "#7669DE"
            })),
            "bg.jpg",
            "image",
            "track.mp3",
            "out.mp4",
        )
        .unwrap();
        let graph = args
            .windows(2)
            .find(|p| p[0] == "-filter_complex")
            .map(|p| p[1].as_str())
            .unwrap();
        // circularSpectrum → avectorscope (showspectrum has no `circle` mode
        // and no `colors` option). The accent is applied as rc/gc/bc tints.
        // #7669DE → R=0.463 G=0.412 B=0.871.
        assert!(graph.contains("avectorscope=s="));
        assert!(graph.contains("rc=0.46"));
        assert!(graph.contains("gc=0.41"));
        assert!(graph.contains("bc=0.87"));
        assert!(!graph.contains("showspectrum"));
    }

    #[test]
    fn opacity_below_one_adds_colorchannelmixer() {
        let args = build_args(
            &node(serde_json::json!({
                "visualizerType": "waveform", "opacity": 0.5
            })),
            "bg.jpg",
            "image",
            "track.mp3",
            "out.mp4",
        )
        .unwrap();
        let graph = args
            .windows(2)
            .find(|p| p[0] == "-filter_complex")
            .map(|p| p[1].as_str())
            .unwrap();
        assert!(graph.contains("colorchannelmixer=aa=0.5"));
    }

    #[test]
    fn rejects_invalid_visualizer_type() {
        let err = build_args(
            &node(serde_json::json!({ "visualizerType": "bogus", "opacity": 1.0 })),
            "bg.jpg",
            "image",
            "track.mp3",
            "out.mp4",
        )
        .unwrap_err();
        assert!(err.to_string().contains("Unsupported visualizer type"));
    }

    #[test]
    fn win_size_is_bounded_and_floors_small_counts() {
        // showfreqs win_size accepts arbitrary values (not pow2-constrained);
        // we floor tiny counts to 16 so a handful of bars still render.
        assert_eq!(win_size(4), 16);
        assert_eq!(win_size(48), 48);
        assert_eq!(win_size(256), 256);
        assert_eq!(win_size(65536), 65536);
        assert_eq!(win_size(100_000), 65536); // clamped
    }

    #[test]
    fn accent_to_hex_normalises_hash_form() {
        assert_eq!(accent_to_hex("#7669DE"), "0x7669de");
        assert_eq!(accent_to_hex("7669de"), "0x7669de");
        // garbage → safe default, never an empty/invalid colour token
        assert_eq!(accent_to_hex("not-a-color"), "0x7669de");
        assert_eq!(accent_to_hex("#12"), "0x7669de");
    }

    #[test]
    fn accent_to_rgb_unpacks_hex_channels() {
        let (r, g, b) = accent_to_rgb("#7669DE");
        assert!((r - 0.463).abs() < 0.01);
        assert!((g - 0.412).abs() < 0.01);
        assert!((b - 0.871).abs() < 0.01);
        // black / white boundaries
        assert_eq!(accent_to_rgb("#000000"), (0.0, 0.0, 0.0));
        assert_eq!(accent_to_rgb("#FFFFFF"), (1.0, 1.0, 1.0));
    }
}