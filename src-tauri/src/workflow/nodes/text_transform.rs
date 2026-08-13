use crate::error::Result;
use crate::workflow::artifact::ArtifactManager;
use crate::workflow::executor::NodeExecutor;
use crate::workflow::model::{Node, NodeExecutionResult, NodeInputs, NodeValue};
use async_trait::async_trait;
use serde_json::Value;
use tokio_util::sync::CancellationToken;

pub struct TextTransformNode;

#[async_trait]
impl NodeExecutor for TextTransformNode {
    async fn execute(
        &self,
        node: &Node,
        inputs: &NodeInputs,
        _cancel_token: CancellationToken,
        _artifact_manager: &ArtifactManager,
    ) -> Result<NodeExecutionResult> {
        let combined_input = inputs.get("in").map(NodeValue::as_text).unwrap_or_default();

        let op = node
            .data
            .extra
            .get("operation")
            .and_then(Value::as_str)
            .unwrap_or("uppercase");

        let output = match op {
            "uppercase" => combined_input.to_uppercase(),
            "lowercase" => combined_input.to_lowercase(),
            _ => combined_input,
        };

        Ok(NodeExecutionResult::output("out", NodeValue::Text(output)))
    }
}
