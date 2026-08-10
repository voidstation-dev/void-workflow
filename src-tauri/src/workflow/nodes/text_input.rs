use crate::error::Result;
use crate::workflow::artifact::ArtifactManager;
use crate::workflow::executor::NodeExecutor;
use crate::workflow::model::Node;
use async_trait::async_trait;
use serde_json::Value;
use std::collections::HashMap;
use tokio_util::sync::CancellationToken;

pub struct TextInputNode;

#[async_trait]
impl NodeExecutor for TextInputNode {
    async fn execute(
        &self,
        node: &Node,
        _inputs: &HashMap<String, Value>,
        _cancel_token: CancellationToken,
        _artifact_manager: &ArtifactManager,
    ) -> Result<Value> {
        let text = node
            .data
            .extra
            .get("text")
            .and_then(Value::as_str)
            .unwrap_or("");
        Ok(serde_json::json!({ "output": text }))
    }
}
