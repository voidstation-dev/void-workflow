use crate::error::{AppError, Result};
use crate::workflow::artifact::ArtifactManager;
use crate::workflow::executor::NodeExecutor;
use crate::workflow::model::Node;
use async_trait::async_trait;
use serde_json::Value;
use std::collections::HashMap;
use std::fs;
use tokio_util::sync::CancellationToken;

pub struct SaveJsonNode;

#[async_trait]
impl NodeExecutor for SaveJsonNode {
    async fn execute(
        &self,
        node: &Node,
        inputs: &HashMap<String, Value>,
        _cancel_token: CancellationToken,
        artifact_manager: &ArtifactManager,
    ) -> Result<Value> {
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

        Ok(serde_json::json!({
            "artifact_path": output_path.to_string_lossy(),
        }))
    }
}
