use crate::error::Result;
use crate::runtime::RuntimeServices;
use crate::workflow::artifact::ArtifactManager;
use crate::workflow::executor::{NodeExecutor, ProgressReporter};
use crate::workflow::model::{Node, NodeExecutionResult, NodeInputs, NodeValue};
use async_trait::async_trait;
use serde_json::Value;
use tokio_util::sync::CancellationToken;

pub struct TextInputNode;

#[async_trait]
impl NodeExecutor for TextInputNode {
    async fn execute(
        &self,
        node: &Node,
        _inputs: &NodeInputs,
        _cancel_token: CancellationToken,
        _artifact_manager: &ArtifactManager,
        _runtime: &RuntimeServices,
        _progress: ProgressReporter,
    ) -> Result<NodeExecutionResult> {
        let text = node
            .data
            .extra
            .get("content")
            .or_else(|| node.data.extra.get("text"))
            .and_then(Value::as_str)
            .unwrap_or("");
        Ok(NodeExecutionResult::output(
            "text",
            NodeValue::Text(text.into()),
        ))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::workflow::test_support::{harness, node, progress};

    #[tokio::test]
    async fn returns_exact_multiline_content() {
        let (_directory, runtime, artifacts) = harness();
        let result = TextInputNode
            .execute(
                &node("textInput", serde_json::json!({ "content": " one\ntwo " })),
                &NodeInputs::new(),
                CancellationToken::new(),
                &artifacts,
                &runtime,
                progress(),
            )
            .await
            .unwrap();
        assert_eq!(result.outputs["text"], NodeValue::Text(" one\ntwo ".into()));
    }
}
