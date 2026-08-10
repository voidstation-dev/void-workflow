use crate::error::{AppError, Result};
use crate::workflow::artifact::ArtifactManager;
use crate::workflow::executor::NodeExecutor;
use crate::workflow::model::Node;
use async_trait::async_trait;
use serde_json::Value;
use std::collections::HashMap;
use std::path::Path;
use tokio_util::sync::CancellationToken;

pub struct FileInputNode;

#[async_trait]
impl NodeExecutor for FileInputNode {
    async fn execute(
        &self,
        node: &Node,
        _inputs: &HashMap<String, Value>,
        _cancel_token: CancellationToken,
        _artifact_manager: &ArtifactManager,
    ) -> Result<Value> {
        let file_path = node
            .data
            .extra
            .get("file_path")
            .and_then(Value::as_str)
            .unwrap_or("");

        if file_path.is_empty() {
            return Err(AppError::Internal("File path is empty".to_string()));
        }

        if !Path::new(file_path).exists() {
            return Err(AppError::Internal(format!(
                "File does not exist: {}",
                file_path
            )));
        }

        Ok(serde_json::json!({
            "file_path": file_path
        }))
    }
}
