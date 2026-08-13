use crate::error::{AppError, Result};
use crate::workflow::artifact::ArtifactManager;
use crate::workflow::executor::NodeExecutor;
use crate::workflow::model::{FileRef, Node, NodeExecutionResult, NodeInputs, NodeValue};
use async_trait::async_trait;
use serde_json::Value;
use std::path::Path;
use tokio_util::sync::CancellationToken;

pub struct FileInputNode;

#[async_trait]
impl NodeExecutor for FileInputNode {
    async fn execute(
        &self,
        node: &Node,
        _inputs: &NodeInputs,
        _cancel_token: CancellationToken,
        _artifact_manager: &ArtifactManager,
    ) -> Result<NodeExecutionResult> {
        let file_path = node
            .data
            .extra
            .get("path")
            .or_else(|| node.data.extra.get("file_path"))
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

        let path = Path::new(file_path);
        let metadata = std::fs::metadata(path)?;
        let file = FileRef {
            path: file_path.into(),
            name: path
                .file_name()
                .and_then(|value| value.to_str())
                .unwrap_or(file_path)
                .into(),
            size: metadata.len(),
            mime: None,
        };
        Ok(NodeExecutionResult::output("out", NodeValue::File(file)))
    }
}
