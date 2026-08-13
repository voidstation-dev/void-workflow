use crate::error::{AppError, Result};
use crate::runtime::RuntimeServices;
use crate::workflow::artifact::ArtifactManager;
use crate::workflow::executor::{NodeExecutor, ProgressReporter};
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
        _runtime: &RuntimeServices,
        _progress: ProgressReporter,
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

        let path = Path::new(file_path);
        if !path.exists() {
            return Err(AppError::Internal(format!(
                "File does not exist: {}",
                file_path
            )));
        }

        if !path.is_file() {
            return Err(AppError::validation(
                "FILE_INPUT_NOT_FILE",
                "The selected path is not a regular file.",
                serde_json::json!({ "nodeId": node.id, "path": file_path }),
            ));
        }
        let path = path.canonicalize()?;
        let metadata = std::fs::metadata(&path)?;
        let mime = mime_guess::from_path(&path).first_raw().map(str::to_string);
        let file = FileRef {
            path: path.to_string_lossy().into_owned(),
            name: path
                .file_name()
                .and_then(|value| value.to_str())
                .unwrap_or(file_path)
                .into(),
            size: metadata.len(),
            mime,
        };
        Ok(NodeExecutionResult::output("file", NodeValue::File(file)))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::workflow::test_support::{harness, node, progress};

    #[tokio::test]
    async fn returns_canonical_file_reference_without_reading_content() {
        let (directory, runtime, artifacts) = harness();
        let path = directory.path().join("sample.txt");
        std::fs::write(&path, "hello").unwrap();
        let result = FileInputNode
            .execute(
                &node("fileInput", serde_json::json!({ "path": path })),
                &NodeInputs::new(),
                CancellationToken::new(),
                &artifacts,
                &runtime,
                progress(),
            )
            .await
            .unwrap();
        let NodeValue::File(file) = &result.outputs["file"] else {
            panic!("expected file")
        };
        assert_eq!(file.size, 5);
        assert_eq!(file.mime.as_deref(), Some("text/plain"));
        assert!(Path::new(&file.path).is_absolute());
    }
}
