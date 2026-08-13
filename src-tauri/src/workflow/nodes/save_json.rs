use crate::error::{AppError, Result};
use crate::runtime::RuntimeServices;
use crate::workflow::artifact::ArtifactManager;
use crate::workflow::executor::{NodeExecutor, ProgressReporter};
use crate::workflow::model::{Node, NodeExecutionResult, NodeInputs, NodeValue};
use async_trait::async_trait;
use serde_json::Value;
use tokio::fs;
use tokio_util::sync::CancellationToken;

pub struct SaveJsonNode;

#[async_trait]
impl NodeExecutor for SaveJsonNode {
    async fn execute(
        &self,
        node: &Node,
        inputs: &NodeInputs,
        _cancel_token: CancellationToken,
        artifact_manager: &ArtifactManager,
        _runtime: &RuntimeServices,
        _progress: ProgressReporter,
    ) -> Result<NodeExecutionResult> {
        let filename = node
            .data
            .extra
            .get("filename")
            .and_then(Value::as_str)
            .unwrap_or("output.json");

        let value = match inputs.get("json") {
            Some(NodeValue::Json(value)) | Some(NodeValue::Any(value)) => value,
            Some(other) => {
                return Err(AppError::validation(
                    "SAVE_JSON_INPUT_INVALID",
                    "Save JSON requires a JSON input.",
                    serde_json::json!({ "nodeId": node.id, "received": format!("{other:?}") }),
                ))
            }
            None => &Value::Null,
        };
        let formatting = node
            .data
            .extra
            .get("formatting")
            .and_then(Value::as_str)
            .unwrap_or("pretty");
        let content = if formatting == "compact" {
            serde_json::to_string(value)
        } else {
            serde_json::to_string_pretty(value)
        }
        .map_err(|e| AppError::Internal(format!("Failed to serialize JSON: {}", e)))?;
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
        let Some(output_path) =
            artifact_manager.resolve_destination(output_dir, filename, collision)?
        else {
            return Ok(NodeExecutionResult {
                warnings: vec![format!("Skipped existing file {filename}.")],
                ..NodeExecutionResult::default()
            });
        };

        fs::write(&output_path, content)
            .await
            .map_err(|e| AppError::Internal(format!("Failed to write JSON file: {}", e)))?;

        let artifact =
            artifact_manager.describe(&output_path, "json", &node.id, Some("application/json"))?;
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
    use crate::workflow::test_support::{harness, node, progress};

    #[tokio::test]
    async fn compact_mode_serializes_only_the_json_port() {
        let (_directory, runtime, artifacts) = harness();
        let inputs = [(
            "json".into(),
            NodeValue::Json(serde_json::json!({ "ok": true })),
        )]
        .into();
        let result = SaveJsonNode
            .execute(
                &node(
                    "saveJson",
                    serde_json::json!({ "filename": "result.json", "formatting": "compact" }),
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
            tokio::fs::read_to_string(&result.artifacts[0].path)
                .await
                .unwrap(),
            "{\"ok\":true}"
        );
    }
}
