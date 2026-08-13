use crate::error::{AppError, Result};
use crate::runtime::RuntimeServices;
use crate::workflow::artifact::ArtifactManager;
use crate::workflow::executor::{NodeExecutor, ProgressReporter};
use crate::workflow::model::{Node, NodeExecutionResult, NodeInputs, NodeValue};
use async_trait::async_trait;
use serde_json::Value;
use std::path::Path;
use tokio_util::sync::CancellationToken;

pub struct SaveArtifactNode;

#[async_trait]
impl NodeExecutor for SaveArtifactNode {
    async fn execute(
        &self,
        node: &Node,
        inputs: &NodeInputs,
        cancel_token: CancellationToken,
        artifact_manager: &ArtifactManager,
        _runtime: &RuntimeServices,
        _progress: ProgressReporter,
    ) -> Result<NodeExecutionResult> {
        let input = inputs.get("artifact").ok_or_else(|| {
            AppError::validation(
                "ARTIFACT_INPUT_MISSING",
                "Save Artifact requires a file or artifact input.",
                serde_json::json!({ "nodeId": node.id }),
            )
        })?;
        let source_path = input.as_path().ok_or_else(|| {
            AppError::validation(
                "ARTIFACT_INPUT_INVALID",
                "Save Artifact input does not reference a local file.",
                serde_json::json!({ "nodeId": node.id }),
            )
        })?;
        let source = Path::new(source_path).canonicalize()?;
        if !source.is_file() {
            return Err(AppError::validation(
                "ARTIFACT_SOURCE_NOT_FILE",
                "The artifact source is not a regular file.",
                serde_json::json!({ "nodeId": node.id, "path": source_path }),
            ));
        }

        let configured_name = node
            .data
            .extra
            .get("filename")
            .and_then(Value::as_str)
            .unwrap_or("")
            .trim();
        let filename = if configured_name.is_empty() || configured_name == "artifact" {
            source
                .file_name()
                .and_then(|value| value.to_str())
                .unwrap_or("artifact")
        } else {
            configured_name
        };
        let output_dir = node
            .data
            .extra
            .get("outputDir")
            .and_then(Value::as_str)
            .unwrap_or("");
        let collision = node
            .data
            .extra
            .get("overwrite")
            .and_then(Value::as_str)
            .unwrap_or("rename");
        let Some(destination) =
            artifact_manager.resolve_destination(output_dir, filename, collision)?
        else {
            return Ok(NodeExecutionResult {
                warnings: vec![format!("Skipped existing file {filename}.")],
                ..NodeExecutionResult::default()
            });
        };

        if source != destination {
            tokio::select! {
                result = tokio::fs::copy(&source, &destination) => {
                    result.map_err(|error| AppError::Internal(format!("Failed to copy artifact: {error}")))?;
                }
                _ = cancel_token.cancelled() => {
                    return Err(AppError::Cancelled("Cancelled while copying artifact.".into()));
                }
            }
        }

        let mime = mime_guess::from_path(&destination).first_raw();
        let kind = mime
            .and_then(|value| value.split('/').next())
            .unwrap_or("file");
        let artifact = artifact_manager.describe(&destination, kind, &node.id, mime)?;
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
    use crate::workflow::model::FileRef;
    use crate::workflow::test_support::{harness, node, progress};

    #[tokio::test]
    async fn copies_file_and_registers_new_artifact() {
        let (directory, runtime, artifacts) = harness();
        let source = directory.path().join("input.png");
        tokio::fs::write(&source, b"png").await.unwrap();
        let input = FileRef {
            path: source.to_string_lossy().into(),
            name: "input.png".into(),
            size: 3,
            mime: Some("image/png".into()),
        };
        let inputs = [("artifact".into(), NodeValue::File(input))].into();
        let result = SaveArtifactNode
            .execute(
                &node(
                    "saveArtifact",
                    serde_json::json!({ "filename": "copy.png", "overwrite": "rename" }),
                ),
                &inputs,
                CancellationToken::new(),
                &artifacts,
                &runtime,
                progress(),
            )
            .await
            .unwrap();
        assert_eq!(
            tokio::fs::read(&result.artifacts[0].path).await.unwrap(),
            b"png"
        );
        assert_eq!(result.artifacts[0].kind, "image");
    }
}
