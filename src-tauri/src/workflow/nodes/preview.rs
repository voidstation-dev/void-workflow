use crate::error::{AppError, Result};
use crate::runtime::RuntimeServices;
use crate::workflow::artifact::ArtifactManager;
use crate::workflow::executor::{NodeExecutor, ProgressReporter};
use crate::workflow::model::{Node, NodeExecutionResult, NodeInputs};
use async_trait::async_trait;
use tokio_util::sync::CancellationToken;

pub struct PreviewNode;

#[async_trait]
impl NodeExecutor for PreviewNode {
    async fn execute(
        &self,
        node: &Node,
        inputs: &NodeInputs,
        _cancel_token: CancellationToken,
        _artifact_manager: &ArtifactManager,
        _runtime: &RuntimeServices,
        _progress: ProgressReporter,
    ) -> Result<NodeExecutionResult> {
        let value = inputs.get("input").cloned().ok_or_else(|| {
            AppError::validation(
                "PREVIEW_INPUT_MISSING",
                "Preview requires one connected input.",
                serde_json::json!({ "nodeId": node.id }),
            )
        })?;
        Ok(NodeExecutionResult::output("preview", value))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::workflow::model::NodeValue;
    use crate::workflow::test_support::{harness, node, progress};

    #[tokio::test]
    async fn captures_input_as_preview_result() {
        let (_directory, runtime, artifacts) = harness();
        let inputs = [("input".into(), NodeValue::Text("hello".into()))].into();
        let result = PreviewNode
            .execute(
                &node("preview", serde_json::json!({})),
                &inputs,
                CancellationToken::new(),
                &artifacts,
                &runtime,
                progress(),
            )
            .await
            .unwrap();
        assert_eq!(result.outputs["preview"], NodeValue::Text("hello".into()));
    }
}
