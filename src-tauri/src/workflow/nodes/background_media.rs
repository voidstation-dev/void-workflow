use crate::error::{AppError, Result};
use crate::runtime::RuntimeServices;
use crate::workflow::artifact::ArtifactManager;
use crate::workflow::executor::{NodeExecutor, ProgressReporter};
use crate::workflow::model::{MediaRef, Node, NodeExecutionResult, NodeInputs, NodeValue};
use async_trait::async_trait;
use serde_json::Value;
use std::path::Path;
use tokio_util::sync::CancellationToken;

/// BackgroundMediaNode — resolves the background layer for the visualizer
/// pipeline. Receives the upstream `cover` MediaRef (the Audio & Cover node's
/// image) and either:
///   - `mode == "image"`  → the cover IS the background (static image), or
///   - `mode == "video"`  → a short looping .mp4 at `videoPath` is the
///     background instead.
///
/// Emits a single `background` MediaRef carrying the resolved path + a `mode`
/// marker in metadata so the Visualizer knows whether to treat it as an image
/// (loop one frame for the audio duration) or a video (loop the clip).
///
/// No FFmpeg runs here — this is a pure resolution/validation step. The
/// Visualizer composes background + audio + visualizer in one filtergraph, so
/// keeping the background path raw lets that one command `scale`+`loop` it
/// correctly.
pub struct BackgroundMediaNode;

fn resolve_existing_path(node: &Node, key: &str, error_code: &str, label: &str) -> Result<String> {
    let path = node
        .data
        .extra
        .get(key)
        .and_then(Value::as_str)
        .unwrap_or("")
        .trim()
        .to_string();
    if path.is_empty() {
        return Err(AppError::validation(
            error_code,
            format!("{label} is not set."),
            serde_json::json!({ "nodeId": node.id, "field": key }),
        ));
    }
    let canonical = Path::new(&path).canonicalize().map_err(|_| {
        AppError::validation(
            error_code,
            format!("{label} could not be opened."),
            serde_json::json!({ "nodeId": node.id, "path": path }),
        )
    })?;
    if !canonical.is_file() {
        return Err(AppError::validation(
            error_code,
            format!("{label} is not a regular file."),
            serde_json::json!({ "nodeId": node.id, "path": path }),
        ));
    }
    Ok(canonical.to_string_lossy().into_owned())
}

#[async_trait]
impl NodeExecutor for BackgroundMediaNode {
    async fn execute(
        &self,
        node: &Node,
        inputs: &NodeInputs,
        _cancel_token: CancellationToken,
        _artifact_manager: &ArtifactManager,
        _runtime: &RuntimeServices,
        progress: ProgressReporter,
    ) -> Result<NodeExecutionResult> {
        let mode = node
            .data
            .extra
            .get("mode")
            .and_then(Value::as_str)
            .unwrap_or("image");
        if !matches!(mode, "image" | "video") {
            return Err(AppError::validation(
                "BACKGROUND_MODE_INVALID",
                format!("Unsupported background mode: {mode}."),
                serde_json::json!({ "nodeId": node.id, "mode": mode }),
            ));
        }
        let fit = node
            .data
            .extra
            .get("fit")
            .and_then(Value::as_str)
            .unwrap_or("cover");
        if !matches!(fit, "cover" | "contain" | "stretch") {
            return Err(AppError::validation(
                "BACKGROUND_FIT_INVALID",
                format!("Unsupported fit: {fit}."),
                serde_json::json!({ "nodeId": node.id, "fit": fit }),
            ));
        }
        let scale_height = node
            .data
            .extra
            .get("scaleHeight")
            .and_then(Value::as_str)
            .and_then(|v| v.parse::<u32>().ok())
            .unwrap_or(1080);
        if ![480, 720, 1080].contains(&scale_height) {
            return Err(AppError::validation(
                "BACKGROUND_SCALE_INVALID",
                format!("Unsupported output height: {scale_height}."),
                serde_json::json!({ "nodeId": node.id, "scaleHeight": scale_height }),
            ));
        }

        progress(0.4);

        let (background_path, source_label) = if mode == "video" {
            let p = resolve_existing_path(node, "videoPath", "BACKGROUND_VIDEO_MISSING", "Loop video")?;
            (p, "video")
        } else {
            // Image mode: the background is the incoming cover. The cover port
            // is required (contract), so a missing binding fails validation
            // before the executor runs; defend in depth anyway.
            let cover = inputs
                .get("cover")
                .and_then(NodeValue::as_path)
                .filter(|p| !p.is_empty())
                .ok_or_else(|| {
                    AppError::validation(
                        "COVER_INPUT_MISSING",
                        "Background Media requires an incoming cover connection in image mode.",
                        serde_json::json!({ "nodeId": node.id }),
                    )
                })?;
            let canonical = Path::new(cover).canonicalize().map_err(|_| {
                AppError::validation(
                    "COVER_INPUT_INVALID",
                    "The incoming cover file could not be opened.",
                    serde_json::json!({ "nodeId": node.id, "path": cover }),
                )
            })?;
            if !canonical.is_file() {
                return Err(AppError::validation(
                    "COVER_INPUT_NOT_FILE",
                    "The incoming cover is not a regular file.",
                    serde_json::json!({ "nodeId": node.id, "path": cover }),
                ));
            }
            (canonical.to_string_lossy().into_owned(), "image")
        };

        progress(0.95);

        let background_ref = MediaRef {
            path: background_path,
            mime: None, // resolved by the Visualizer's input decoders
            metadata: serde_json::json!({
                "mode": mode,
                "source": source_label,
                "fit": fit,
                "scaleHeight": scale_height,
            }),
        };
        Ok(NodeExecutionResult {
            outputs: [("background".into(), NodeValue::Media(background_ref))].into(),
            ..NodeExecutionResult::default()
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::workflow::model::{FileRef, NodeInputs};
    use crate::workflow::test_support::{harness, node, progress};
    use std::collections::HashMap;

    fn cover_input(directory: &tempfile::TempDir) -> NodeInputs {
        let path = directory.path().join("cover.jpg");
        std::fs::write(&path, b"jpg").unwrap();
        let file = FileRef {
            path: path.to_string_lossy().into(),
            name: "cover.jpg".into(),
            size: 3,
            mime: Some("image/jpeg".into()),
        };
        [("cover".into(), NodeValue::File(file))].into_iter().collect::<HashMap<_, _>>()
    }

    #[tokio::test]
    async fn image_mode_uses_incoming_cover_as_background() {
        let (directory, runtime, artifacts) = harness();
        let inputs = cover_input(&directory);
        let result = BackgroundMediaNode
            .execute(
                &node("backgroundMedia", serde_json::json!({ "mode": "image", "fit": "cover", "scaleHeight": "1080" })),
                &inputs,
                CancellationToken::new(),
                &artifacts,
                &runtime,
                progress(),
            )
            .await
            .unwrap();
        let NodeValue::Media(bg) = &result.outputs["background"] else { panic!("expected media") };
        assert_eq!(bg.metadata["mode"], "image");
        assert_eq!(bg.metadata["source"], "image");
        assert!(bg.path.ends_with("cover.jpg"));
    }

    #[tokio::test]
    async fn image_mode_without_cover_fails() {
        let (_directory, runtime, artifacts) = harness();
        let err = BackgroundMediaNode
            .execute(
                &node("backgroundMedia", serde_json::json!({ "mode": "image" })),
                &NodeInputs::new(),
                CancellationToken::new(),
                &artifacts,
                &runtime,
                progress(),
            )
            .await
            .unwrap_err();
        assert!(err.to_string().contains("incoming cover"));
    }
}