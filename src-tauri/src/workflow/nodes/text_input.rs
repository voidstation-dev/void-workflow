use crate::error::Result;
use crate::workflow::artifact::ArtifactManager;
use crate::workflow::executor::NodeExecutor;
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
    ) -> Result<NodeExecutionResult> {
        let text = node
            .data
            .extra
            .get("content")
            .or_else(|| node.data.extra.get("text"))
            .and_then(Value::as_str)
            .unwrap_or("");
        Ok(NodeExecutionResult::output(
            "out",
            NodeValue::Text(text.into()),
        ))
    }
}
