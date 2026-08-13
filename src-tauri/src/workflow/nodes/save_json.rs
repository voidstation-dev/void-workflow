use crate::error::{AppError, Result};
use crate::workflow::artifact::ArtifactManager;
use crate::workflow::executor::NodeExecutor;
use crate::workflow::model::{Node, NodeExecutionResult, NodeInputs};
use async_trait::async_trait;
use serde_json::Value;
use std::fs;
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
    ) -> Result<NodeExecutionResult> {
        let filename = node
            .data
            .extra
            .get("filename")
            .and_then(Value::as_str)
            .unwrap_or("output.json");

        let output_path = artifact_manager.get_output_path(filename);
        let content = serde_json::to_string_pretty(inputs)
            .map_err(|e| AppError::Internal(format!("Failed to serialize JSON: {}", e)))?;

        fs::write(&output_path, content)
            .map_err(|e| AppError::Internal(format!("Failed to write JSON file: {}", e)))?;

        let artifact =
            artifact_manager.describe(&output_path, "json", &node.id, Some("application/json"))?;
        Ok(NodeExecutionResult {
            artifacts: vec![artifact],
            ..NodeExecutionResult::default()
        })
    }
}
