use crate::error::{AppError, Result};
use crate::workflow::artifact::ArtifactManager;
use crate::workflow::executor::NodeExecutor;
use crate::workflow::model::Node;
use async_trait::async_trait;
use serde_json::Value;
use std::collections::HashMap;
use std::fs;
use tokio_util::sync::CancellationToken;

pub struct SaveTextNode;

#[async_trait]
impl NodeExecutor for SaveTextNode {
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
            .unwrap_or("output.txt");

        let mut text = String::new();
        // Collect text from inputs
        for val in inputs.values() {
            if let Some(obj) = val.as_object() {
                if let Some(t) = obj.get("output").and_then(Value::as_str) {
                    text.push_str(t);
                    text.push('\n');
                }
            } else if let Some(t) = val.as_str() {
                text.push_str(t);
                text.push('\n');
            }
        }

        let output_path = artifact_manager.get_output_path(filename);
        fs::write(&output_path, text)
            .map_err(|e| AppError::Internal(format!("Failed to write text file: {}", e)))?;

        Ok(serde_json::json!({
            "artifact_path": output_path.to_string_lossy(),
        }))
    }
}
