use crate::error::{AppError, Result};
use crate::workflow::artifact::ArtifactManager;
use crate::workflow::executor::NodeExecutor;
use crate::workflow::model::{Node, NodeExecutionResult, NodeInputs};
use async_trait::async_trait;
use serde_json::Value;
use std::fs;
use tokio_util::sync::CancellationToken;

pub struct SaveTextNode;

#[async_trait]
impl NodeExecutor for SaveTextNode {
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
            .unwrap_or("output.txt");

        let text = inputs
            .get("in")
            .map(|value| value.as_text())
            .unwrap_or_default();

        let output_path = artifact_manager.get_output_path(filename);
        fs::write(&output_path, text)
            .map_err(|e| AppError::Internal(format!("Failed to write text file: {}", e)))?;

        let artifact =
            artifact_manager.describe(&output_path, "text", &node.id, Some("text/plain"))?;
        Ok(NodeExecutionResult {
            artifacts: vec![artifact],
            ..NodeExecutionResult::default()
        })
    }
}
