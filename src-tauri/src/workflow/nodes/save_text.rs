use crate::error::{AppError, Result};
use crate::runtime::RuntimeServices;
use crate::workflow::artifact::ArtifactManager;
use crate::workflow::executor::{NodeExecutor, ProgressReporter};
use crate::workflow::model::{Node, NodeExecutionResult, NodeInputs, NodeValue};
use async_trait::async_trait;
use serde_json::Value;
use tokio::fs;
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
        _runtime: &RuntimeServices,
        _progress: ProgressReporter,
    ) -> Result<NodeExecutionResult> {
        let filename = node
            .data
            .extra
            .get("filename")
            .and_then(Value::as_str)
            .unwrap_or("output.txt");

        let text = inputs
            .get("text")
            .map(|value| value.as_text())
            .unwrap_or_default();
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
        fs::write(&output_path, text)
            .await
            .map_err(|e| AppError::Internal(format!("Failed to write text file: {}", e)))?;

        let artifact =
            artifact_manager.describe(&output_path, "text", &node.id, Some("text/plain"))?;
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
    async fn writes_exact_text_and_returns_artifact_output() {
        let (_directory, runtime, artifacts) = harness();
        let inputs = [("text".into(), NodeValue::Text("hello\n".into()))].into();
        let result = SaveTextNode
            .execute(
                &node(
                    "saveText",
                    serde_json::json!({ "filename": "result.txt", "overwrite": "rename" }),
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
            "hello\n"
        );
        assert!(matches!(result.outputs["artifact"], NodeValue::Artifact(_)));
    }
}
