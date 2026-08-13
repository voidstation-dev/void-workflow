use crate::error::{AppError, Result};
use crate::runtime::RuntimeServices;
use crate::workflow::artifact::ArtifactManager;
use crate::workflow::executor::{NodeExecutor, ProgressReporter};
use crate::workflow::model::{MediaRef, Node, NodeExecutionResult, NodeInputs, NodeValue};
use async_trait::async_trait;
use serde_json::Value;
use tokio_util::sync::CancellationToken;
use uuid::Uuid;

pub struct MediaMergeNode;

fn codec(value: &str, video: bool) -> Option<&'static str> {
    match (video, value) {
        (true, "h264") => Some("libx264"),
        (true, "h265") => Some("libx265"),
        (true, "vp9") => Some("libvpx-vp9"),
        (true, "av1") => Some("libaom-av1"),
        (false, "aac") => Some("aac"),
        (false, "mp3") => Some("libmp3lame"),
        (false, "opus") => Some("libopus"),
        _ => None,
    }
}

fn build_args(
    node: &Node,
    video_path: &str,
    audio_path: Option<&str>,
    output: &str,
) -> Result<Vec<String>> {
    let data = &node.data.extra;
    let mut args = vec!["-y".into()];
    let duration = data
        .get("duration")
        .and_then(Value::as_str)
        .unwrap_or("shortest");
    if duration == "audio" && audio_path.is_some() {
        args.extend(["-stream_loop".into(), "-1".into()]);
    }
    args.extend(["-i".into(), video_path.into()]);
    if let Some(audio_path) = audio_path {
        args.extend(["-i".into(), audio_path.into()]);
        let audio_mode = data
            .get("audioMode")
            .and_then(Value::as_str)
            .unwrap_or("replace");
        if audio_mode == "mix" {
            args.extend([
                "-filter_complex".into(),
                "[0:a:0][1:a:0]amix=inputs=2:duration=longest[aout]".into(),
                "-map".into(),
                "0:v:0".into(),
                "-map".into(),
                "[aout]".into(),
            ]);
        } else {
            args.extend(["-map".into(), "0:v:0".into(), "-map".into(), "1:a:0".into()]);
        }
        if duration == "shortest" || duration == "audio" {
            args.push("-shortest".into());
        }
    } else {
        args.extend(["-map".into(), "0:v:0".into(), "-map".into(), "0:a?".into()]);
    }

    let resolution = data
        .get("resolution")
        .and_then(Value::as_str)
        .unwrap_or("source");
    if resolution != "source" {
        let height = match resolution {
            "480p" => 480,
            "720p" => 720,
            "1080p" => 1080,
            _ => {
                return Err(AppError::validation(
                    "MEDIA_RESOLUTION_INVALID",
                    format!("Unsupported resolution: {resolution}"),
                    serde_json::json!({ "nodeId": node.id }),
                ))
            }
        };
        args.extend(["-vf".into(), format!("scale=-2:{height}")]);
    }
    let fps = data.get("fps").and_then(Value::as_str).unwrap_or("source");
    if fps != "source" {
        if !matches!(fps, "24" | "30" | "60") {
            return Err(AppError::validation(
                "MEDIA_FPS_INVALID",
                format!("Unsupported frame rate: {fps}"),
                serde_json::json!({ "nodeId": node.id }),
            ));
        }
        args.extend(["-r".into(), fps.into()]);
    }
    let video_codec = data
        .get("videoCodec")
        .and_then(Value::as_str)
        .unwrap_or("h264");
    let audio_codec = data
        .get("audioCodec")
        .and_then(Value::as_str)
        .unwrap_or("aac");
    args.extend([
        "-c:v".into(),
        codec(video_codec, true)
            .ok_or_else(|| {
                AppError::validation(
                    "VIDEO_CODEC_INVALID",
                    "Unsupported video codec.",
                    Value::Null,
                )
            })?
            .into(),
        "-c:a".into(),
        codec(audio_codec, false)
            .ok_or_else(|| {
                AppError::validation(
                    "AUDIO_CODEC_INVALID",
                    "Unsupported audio codec.",
                    Value::Null,
                )
            })?
            .into(),
    ]);
    let bitrate = data
        .get("bitrate")
        .and_then(Value::as_str)
        .unwrap_or("auto")
        .trim();
    if !bitrate.is_empty() && bitrate != "auto" {
        let valid = bitrate
            .strip_suffix(['k', 'K', 'm', 'M'])
            .unwrap_or(bitrate)
            .parse::<u32>()
            .is_ok();
        if !valid {
            return Err(AppError::validation(
                "MEDIA_BITRATE_INVALID",
                "Bitrate must be Auto or a value such as 8M or 2500k.",
                serde_json::json!({ "nodeId": node.id, "bitrate": bitrate }),
            ));
        }
        args.extend(["-b:v".into(), bitrate.into()]);
    }
    args.extend([
        "-movflags".into(),
        "+faststart".into(),
        "-progress".into(),
        "pipe:1".into(),
        "-nostats".into(),
        output.into(),
    ]);
    Ok(args)
}

#[async_trait]
impl NodeExecutor for MediaMergeNode {
    async fn execute(
        &self,
        node: &Node,
        inputs: &NodeInputs,
        cancel_token: CancellationToken,
        artifact_manager: &ArtifactManager,
        runtime: &RuntimeServices,
        progress: ProgressReporter,
    ) -> Result<NodeExecutionResult> {
        let video_path = inputs
            .get("video")
            .and_then(NodeValue::as_path)
            .filter(|value| !value.is_empty())
            .ok_or_else(|| {
                AppError::validation(
                    "MEDIA_VIDEO_MISSING",
                    "Media Merge requires a video input.",
                    serde_json::json!({ "nodeId": node.id }),
                )
            })?;
        let audio_path = inputs.get("audio").and_then(NodeValue::as_path);
        let output_path =
            artifact_manager.get_output_path(&format!("merged-{}.mp4", Uuid::new_v4()));
        let output_path_string = output_path.to_string_lossy().into_owned();
        let args = build_args(node, video_path, audio_path, &output_path_string)?;
        let probe = runtime
            .probe_media_json(video_path, cancel_token.child_token())
            .await
            .ok();
        let duration_ms = probe
            .as_ref()
            .and_then(|value| value.pointer("/format/duration"))
            .and_then(Value::as_str)
            .and_then(|value| value.parse::<f64>().ok())
            .map(|seconds| (seconds * 1000.0).round() as u64);
        runtime
            .run_ffmpeg(&args, duration_ms, cancel_token, progress)
            .await?;

        let artifact =
            artifact_manager.describe(&output_path, "video", &node.id, Some("video/mp4"))?;
        let media = MediaRef {
            path: output_path_string,
            mime: Some("video/mp4".into()),
            metadata: serde_json::json!({ "container": "mp4" }),
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
            id: "merge".into(),
            node_type: "mediaMerge".into(),
            version: 2,
            data: NodeData {
                label: "Merge".into(),
                extra: config,
            },
            extra: HashMap::new(),
        }
    }

    #[test]
    fn replace_audio_maps_explicit_video_and_audio_ports() {
        let args = build_args(
            &node(serde_json::json!({
                "audioMode": "replace", "duration": "shortest",
                "resolution": "source", "fps": "source",
                "videoCodec": "h264", "audioCodec": "aac", "bitrate": "auto"
            })),
            "video.mp4",
            Some("audio.wav"),
            "output.mp4",
        )
        .unwrap();
        assert!(args.windows(2).any(|pair| pair == ["-map", "0:v:0"]));
        assert!(args.windows(2).any(|pair| pair == ["-map", "1:a:0"]));
        assert!(args.contains(&"-shortest".into()));
    }
}
