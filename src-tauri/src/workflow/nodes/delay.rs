use crate::error::Result;
use crate::workflow::artifact::ArtifactManager;
use crate::workflow::executor::NodeExecutor;
use crate::workflow::model::{Node, NodeExecutionResult, NodeInputs, NodeValue};
use async_trait::async_trait;
use serde_json::Value;
use tokio::time::{sleep, Duration};
use tokio_util::sync::CancellationToken;

pub struct DelayNode;

#[async_trait]
impl NodeExecutor for DelayNode {
    async fn execute(
        &self,
        node: &Node,
        inputs: &NodeInputs,
        cancel_token: CancellationToken,
        _artifact_manager: &ArtifactManager,
    ) -> Result<NodeExecutionResult> {
        let ms = node
            .data
            .extra
            .get("seconds")
            .and_then(Value::as_f64)
            .map(|seconds| (seconds.max(0.0) * 1000.0) as u64)
            .or_else(|| node.data.extra.get("duration").and_then(Value::as_u64))
            .unwrap_or(1000);

        tokio::select! {
            _ = sleep(Duration::from_millis(ms)) => {
                let pass_through = inputs.get("in").cloned().unwrap_or(NodeValue::Any(Value::Null));
                Ok(NodeExecutionResult::output("out", pass_through))
            }
            _ = cancel_token.cancelled() => {
                Err(crate::error::AppError::Cancelled("Cancelled during delay".to_string()))
            }
        }
    }
}
