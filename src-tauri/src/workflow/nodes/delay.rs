use crate::error::Result;
use crate::workflow::artifact::ArtifactManager;
use crate::workflow::executor::NodeExecutor;
use crate::workflow::model::Node;
use async_trait::async_trait;
use serde_json::Value;
use std::collections::HashMap;
use tokio::time::{sleep, Duration};
use tokio_util::sync::CancellationToken;

pub struct DelayNode;

#[async_trait]
impl NodeExecutor for DelayNode {
    async fn execute(
        &self,
        node: &Node,
        inputs: &HashMap<String, Value>,
        cancel_token: CancellationToken,
        _artifact_manager: &ArtifactManager,
    ) -> Result<Value> {
        let ms = node
            .data
            .extra
            .get("duration")
            .and_then(Value::as_u64)
            .unwrap_or(1000);

        tokio::select! {
            _ = sleep(Duration::from_millis(ms)) => {
                // Pass through the first input's output
                let pass_through = inputs.values().next().cloned().unwrap_or(serde_json::json!({}));
                Ok(pass_through)
            }
            _ = cancel_token.cancelled() => {
                Err(crate::error::AppError::Internal("Cancelled during delay".to_string()))
            }
        }
    }
}
