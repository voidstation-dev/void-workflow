//! End-to-end integration test for the YouTube visualizer pipeline — the real
//! proof that the 4 Phase 2 executors produce an actual MP4 through FFmpeg, not
//! just unit-test filtergraph strings. Skipped unless real audio + image
//! fixtures exist at the paths below (generated out-of-band with `ffmpeg -f
//! lavfi`), so it never fails on a machine without FFmpeg/fixtures.
//!
//! Run with:  cargo test --test youtube_pipeline_integration -- --include-ignored

use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use tauri_app_lib::runtime::RuntimeServices;
use tauri_app_lib::workflow::artifact::ArtifactManager;
use tauri_app_lib::workflow::executor::NodeExecutor;
use tauri_app_lib::workflow::model::{Node, NodeData, NodeInputs, NodeValue};
use tauri_app_lib::workflow::nodes::{
    audio_cover::AudioCoverNode, background_media::BackgroundMediaNode,
    preview_export::PreviewExportNode, soundwave_visualizer::SoundwaveVisualizerNode,
};
use tokio_util::sync::CancellationToken;

fn fixture(name: &str) -> PathBuf {
    // Fixtures generated into this temp dir by the test runner script.
    let base = std::env::var("VW_TEST_FIXTURES")
        .map(PathBuf::from)
        .unwrap_or_else(|_| PathBuf::from("/tmp/vw-test"));
    base.join(name)
}

fn audio_present() -> bool {
    fixture("track.mp3").is_file() && fixture("cover.jpg").is_file()
}

// Inlined from workflow::test_support (which is #[cfg(test)]-gated and thus
// invisible to integration tests, which compile in a separate crate graph).
fn harness() -> (tempfile::TempDir, RuntimeServices, ArtifactManager) {
    let directory = tempfile::tempdir().unwrap();
    let runtime = RuntimeServices::new(directory.path().to_path_buf()).unwrap();
    // The cargo test runner resets PATH to build dirs + system32 only, so the
    // bare `ffprobe`/`ffmpeg` names do NOT resolve to the user's install in this
    // process (unlike the real Tauri app, which inherits the user shell PATH).
    // Allow the test to point at explicit FFmpeg/FFprobe executables via env
    // vars so the pipeline can actually run end-to-end here.
    if let Ok(ffmpeg) = std::env::var("VW_FFMPEG") {
        let mut settings = runtime.settings();
        settings.ffmpeg_path = ffmpeg;
        let _ = runtime.update_settings(settings);
    }
    if let Ok(ffprobe) = std::env::var("VW_FFPROBE") {
        let mut settings = runtime.settings();
        settings.ffprobe_path = ffprobe;
        let _ = runtime.update_settings(settings);
    }
    let artifacts = ArtifactManager::new(directory.path(), 1).unwrap();
    (directory, runtime, artifacts)
}

fn dummy_node(node_type: &str, config: serde_json::Value) -> Node {
    Node {
        id: format!("{node_type}-integration"),
        node_type: node_type.into(),
        version: 2,
        data: NodeData {
            label: node_type.into(),
            extra: config,
        },
        extra: HashMap::new(),
    }
}

fn progress() -> Arc<dyn Fn(f32) + Send + Sync> {
    Arc::new(|_| {})
}

#[tokio::test]
#[ignore = "requires real FFmpeg + fixtures in VW_TEST_FIXTURES (or /tmp/vw-test)"]
async fn youtube_pipeline_renders_real_mp4() {
    if !audio_present() {
        eprintln!("skipping: fixtures missing (set VW_TEST_FIXTURES or generate with ffmpeg)");
        return;
    }
    let audio = fixture("track.mp3");
    let cover = fixture("cover.jpg");
    let (dir, runtime, artifacts) = harness();

    // 1. audioCover — source node, no inputs.
    let cover_node = dummy_node(
        "audioCover",
        serde_json::json!({
            "audioPath": audio.to_string_lossy(),
            "coverPath": cover.to_string_lossy(),
        }),
    );
    let audio_result = AudioCoverNode
        .execute(&cover_node, &NodeInputs::new(), CancellationToken::new(), &artifacts, &runtime, progress())
        .await
        .expect("audioCover failed");
    let audio_ref = match &audio_result.outputs["audio"] {
        NodeValue::Audio(m) => m.clone(),
        other => panic!("expected audio output, got {other:?}"),
    };
    let metadata = audio_result.outputs["metadata"].clone();
    let cover_out = match &audio_result.outputs["cover"] {
        NodeValue::Media(m) => m.clone(),
        other => panic!("expected cover output, got {other:?}"),
    };
    assert!(!audio_ref.path.is_empty(), "audio path empty");
    eprintln!("audioCover OK: {} (metadata present)", audio_ref.path);

    // 2. backgroundMedia — image mode, cover in → background out.
    let bg_node = dummy_node(
        "backgroundMedia",
        serde_json::json!({ "mode": "image", "fit": "cover", "scaleHeight": "720" }),
    );
    let mut bg_inputs: NodeInputs = HashMap::new();
    bg_inputs.insert("cover".into(), NodeValue::Media(cover_out));
    let bg_result = BackgroundMediaNode
        .execute(&bg_node, &bg_inputs, CancellationToken::new(), &artifacts, &runtime, progress())
        .await
        .expect("backgroundMedia failed");
    let background = match &bg_result.outputs["background"] {
        NodeValue::Media(m) => m.clone(),
        other => panic!("expected background output, got {other:?}"),
    };
    eprintln!("backgroundMedia OK: {} (mode={})", background.path, background.metadata["mode"]);

    // 3. soundwaveVisualizer — audio + metadata + background → video MP4.
    let vis_node = dummy_node(
        "soundwaveVisualizer",
        serde_json::json!({
            "visualizerType": "frequencyBars", "barCount": 48,
            "colorAccent": "#7669DE", "sensitivity": 1.5,
            "fit": "cover", "position": "bottom", "fps": 30,
            "scaleHeight": "720", "opacity": 1.0
        }),
    );
    let mut vis_inputs: NodeInputs = HashMap::new();
    vis_inputs.insert("audio".into(), NodeValue::Audio(audio_ref));
    vis_inputs.insert("metadata".into(), metadata);
    vis_inputs.insert("background".into(), NodeValue::Media(background));
    let vis_result = SoundwaveVisualizerNode
        .execute(&vis_node, &vis_inputs, CancellationToken::new(), &artifacts, &runtime, progress())
        .await
        .expect("soundwaveVisualizer failed");
    let video = match &vis_result.outputs["video"] {
        NodeValue::Video(m) => m.clone(),
        other => panic!("expected video output, got {other:?}"),
    };
    assert!(!vis_result.artifacts.is_empty(), "visualizer produced no artifact");
    let video_file = PathBuf::from(&video.path);
    assert!(video_file.is_file(), "rendered video file missing: {}", video.path);
    let size = std::fs::metadata(&video_file).map(|m| m.len()).unwrap_or(0);
    assert!(size > 1024, "rendered video suspiciously small: {size} bytes");
    eprintln!("soundwaveVisualizer OK: {} ({} bytes, 1 artifact)", video.path, size);

    // 4. previewExport — video in → named artifact out.
    let export_node = dummy_node(
        "previewExport",
        serde_json::json!({ "filename": "final-visualizer.mp4", "overwrite": "rename" }),
    );
    let mut export_inputs: NodeInputs = HashMap::new();
    export_inputs.insert("video".into(), NodeValue::Video(video));
    let export_result = PreviewExportNode
        .execute(&export_node, &export_inputs, CancellationToken::new(), &artifacts, &runtime, progress())
        .await
        .expect("previewExport failed");
    assert!(!export_result.artifacts.is_empty(), "export produced no artifact");
    let exported = PathBuf::from(&export_result.artifacts[0].path);
    assert!(exported.is_file(), "exported file missing: {}", exported.display());
    assert!(exported.file_name().map(|f| f == "final-visualizer.mp4").unwrap_or(false),
        "exported filename wrong: {}", exported.display());
    eprintln!("previewExport OK: {} (final artifact)", exported.display());

    let _ = dir; // keep temp dir alive for the test
}