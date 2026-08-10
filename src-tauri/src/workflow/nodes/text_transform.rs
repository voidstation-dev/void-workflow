use crate::error::Result;
use crate::workflow::artifact::ArtifactManager;
use crate::workflow::executor::NodeExecutor;
use crate::workflow::model::Node;
use async_trait::async_trait;
use serde_json::Value;
use std::collections::HashMap;
use tokio_util::sync::CancellationToken;

pub struct TextTransformNode;

#[async_trait]
impl NodeExecutor for TextTransformNode {
    async fn execute(
        &self,
        node: &Node,
        inputs: &HashMap<String, Value>,
        _cancel_token: CancellationToken,
        _artifact_manager: &ArtifactManager,
    ) -> Result<Value> {
        let mut combined_input = String::new();
        for val in inputs.values() {
            if let Some(obj) = val.as_object() {
                if let Some(out) = obj.get("output").and_then(Value::as_str) {
                    combined_input.push_str(out);
                }
            }
        }

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

        Ok(serde_json::json!({ "output": output }))
    }
}
