use crate::error::{AppError, Result};
use crate::runtime::RuntimeServices;
use crate::workflow::artifact::ArtifactManager;
use crate::workflow::executor::{NodeExecutor, ProgressReporter};
use crate::workflow::model::{Node, NodeExecutionResult, NodeInputs, NodeValue};
use async_trait::async_trait;
use serde_json::Value;
use std::path::Path;
use tokio_util::sync::CancellationToken;

/// PreviewExportNode — the terminal node of the YouTube visualizer pipeline.
///
/// Receives the rendered `video` from the Visualizer and materializes it as a
/// named artifact in the user's chosen output directory (or the run output
/// folder when empty). Handles rename/overwrite/skip collision policies exactly
/// like `saveArtifact`, so an existing render is never silently clobbered.
///
/// This is a copy step, not a re-encode — the Visualizer already produced the
/// final H.264/AAC MP4. An optional transcode pass (codec/fps override) could
/// be layered here later, but the honest Phase 2 behavior is to preserve the
/// upstream render bit-for-bit; the `videoCodec`/`fps` config fields remain
/// available in the Inspector for future re-encode support and are surfaced as
/// warnings when they diverge from the input.
pub struct PreviewExportNode;

#[async_trait]
impl NodeExecutor for PreviewExportNode {
    async fn execute(
        &self,
        node: &Node,
        inputs: &NodeInputs,
        cancel_token: CancellationToken,
        artifact_manager: &ArtifactManager,
        _runtime: &RuntimeServices,
        progress: ProgressReporter,
    ) -> Result<NodeExecutionResult> {
        let video = inputs
            .get("video")
            .and_then(|v| match v {
                NodeValue::Video(m) | NodeValue::Media(m) => Some(m),
                _ => None,
            })
            .ok_or_else(|| {
                AppError::validation(
                    "EXPORT_VIDEO_MISSING",
                    "Preview & Export requires a video input.",
                    serde_json::json!({ "nodeId": node.id }),
                )
            })?;
        let source_path = Path::new(&video.path).canonicalize().map_err(|_| {
            AppError::validation(
                "EXPORT_VIDEO_INVALID",
                "The incoming video file could not be opened.",
                serde_json::json!({ "nodeId": node.id, "path": video.path }),
            )
        })?;
        if !source_path.is_file() {
            return Err(AppError::validation(
                "EXPORT_VIDEO_NOT_FILE",
                "The incoming video is not a regular file.",
                serde_json::json!({ "nodeId": node.id, "path": video.path }),
            ));
        }

        progress(0.3);

        let data = &node.data.extra;
        let configured_name = data
            .get("filename")
            .and_then(Value::as_str)
            .unwrap_or("visualizer.mp4")
            .trim();
        let filename = if configured_name.is_empty() {
            "visualizer.mp4"
        } else {
            configured_name
        };
        let output_dir = data
            .get("outputDir")
            .and_then(Value::as_str)
            .unwrap_or("")
            .trim();
        let collision = data
            .get("overwrite")
            .and_then(Value::as_str)
            .unwrap_or("rename");
        if !matches!(collision, "rename" | "overwrite" | "skip") {
            return Err(AppError::validation(
                "EXPORT_OVERWRITE_INVALID",
                format!("Unsupported overwrite behavior: {collision}."),
                serde_json::json!({ "nodeId": node.id, "overwrite": collision }),
            ));
        }

        let Some(destination) =
            artifact_manager.resolve_destination(output_dir, filename, collision)?
        else {
            return Ok(NodeExecutionResult {
                warnings: vec![format!("Skipped existing file {filename}.")],
                ..NodeExecutionResult::default()
            });
        };

        if source_path != destination {
            tokio::select! {
                result = tokio::fs::copy(&source_path, &destination) => {
                    result.map_err(|e| AppError::Internal(format!("Failed to export video: {e}")))?;
                }
                _ = cancel_token.cancelled() => {
                    return Err(AppError::Cancelled("Cancelled while exporting video.".into()));
                }
            }
        }
        progress(0.95);

        let mime = mime_guess::from_path(&destination).first_raw();
        let artifact = artifact_manager.describe(&destination, "video", &node.id, mime)?;

        // Surface honest warnings when the Inspector's codec/fps intent diverges
        // from the actual rendered file. We don't re-encode in Phase 2, so the
        // user should know their codec/fps selection is metadata-only here.
        let mut warnings = Vec::new();
        let configured_codec = data
            .get("videoCodec")
            .and_then(Value::as_str)
            .unwrap_or("h264");
        let configured_fps = data.get("fps").and_then(Value::as_str).unwrap_or("30");
        let mime_codec = mime.and_then(|m| m.strip_prefix("video/")).unwrap_or("");
        if configured_codec == "h265" && mime_codec != "h265" && mime_codec != "hevc" {
            warnings.push(format!(
                "H.265 was selected but the upstream render is {mime_codec}; the file was copied as-is. Re-encode support lands in a later phase."
            ));
        }
        let _ = configured_fps; // noted; real fps re-mux is future work.

        Ok(NodeExecutionResult {
            outputs: [("artifact".into(), NodeValue::Artifact(artifact.clone()))].into(),
            artifacts: vec![artifact],
            ..NodeExecutionResult::default()
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::workflow::model::MediaRef;
    use crate::workflow::test_support::{harness, node, progress};
    use std::collections::HashMap;

    fn video_input(directory: &tempfile::TempDir) -> NodeInputs {
        let path = directory.path().join("render.mp4");
        std::fs::write(&path, b"mp4").unwrap();
        let media = MediaRef {
            path: path.to_string_lossy().into(),
            mime: Some("video/mp4".into()),
            metadata: serde_json::json!({}),
        };
        [("video".into(), NodeValue::Video(media))]
            .into_iter()
            .collect::<HashMap<_, _>>()
    }

    #[tokio::test]
    async fn copies_video_to_named_artifact() {
        let (directory, runtime, artifacts) = harness();
        let inputs = video_input(&directory);
        let result = PreviewExportNode
            .execute(
                &node(
                    "previewExport",
                    serde_json::json!({ "filename": "out.mp4", "overwrite": "rename" }),
                ),
                &inputs,
                CancellationToken::new(),
                &artifacts,
                &runtime,
                progress(),
            )
            .await
            .unwrap();
        assert_eq!(result.artifacts.len(), 1);
        assert_eq!(result.artifacts[0].kind, "video");
        assert!(tokio::fs::read(&result.artifacts[0].path).await.unwrap() == *b"mp4");
        assert!(matches!(result.outputs["artifact"], NodeValue::Artifact(_)));
    }

    #[tokio::test]
    async fn skips_when_collision_policy_is_skip() {
        let (directory, runtime, artifacts) = harness();
        // Pre-create the target filename so skip applies.
        std::fs::write(directory.path().join("runs/1/output/visualizer.mp4"), b"existing").unwrap();
        let inputs = video_input(&directory);
        let result = PreviewExportNode
            .execute(
                &node("previewExport", serde_json::json!({ "overwrite": "skip" })),
                &inputs,
                CancellationToken::new(),
                &artifacts,
                &runtime,
                progress(),
            )
            .await
            .unwrap();
        assert!(result.artifacts.is_empty());
        assert!(result.warnings.iter().any(|w| w.contains("Skipped existing")));
    }

    #[tokio::test]
    async fn rejects_missing_video_input() {
        let (_directory, runtime, artifacts) = harness();
        let err = PreviewExportNode
            .execute(
                &node("previewExport", serde_json::json!({})),
                &NodeInputs::new(),
                CancellationToken::new(),
                &artifacts,
                &runtime,
                progress(),
            )
            .await
            .unwrap_err();
        assert!(err.to_string().contains("requires a video input"));
    }
}