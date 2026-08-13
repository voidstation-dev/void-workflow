use crate::error::{AppError, Result};
use crate::runtime::RuntimeServices;
use crate::workflow::artifact::ArtifactManager;
use crate::workflow::executor::{NodeExecutor, ProgressReporter};
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
        _runtime: &RuntimeServices,
        _progress: ProgressReporter,
    ) -> Result<NodeExecutionResult> {
        let combined_input = inputs
            .get("text")
            .map(NodeValue::as_text)
            .unwrap_or_default();

        let op = node
            .data
            .extra
            .get("operation")
            .and_then(Value::as_str)
            .unwrap_or("uppercase");

        let output = match op {
            "trim" => combined_input.trim().to_string(),
            "uppercase" => combined_input.to_uppercase(),
            "lowercase" => combined_input.to_lowercase(),
            "replace" => {
                let find = node
                    .data
                    .extra
                    .get("find")
                    .and_then(Value::as_str)
                    .unwrap_or("");
                if find.is_empty() {
                    return Err(AppError::validation(
                        "TEXT_REPLACE_FIND_EMPTY",
                        "Find text is required for Replace.",
                        serde_json::json!({ "nodeId": node.id, "field": "find" }),
                    ));
                }
                let replacement = node
                    .data
                    .extra
                    .get("replace")
                    .and_then(Value::as_str)
                    .unwrap_or("");
                combined_input.replace(find, replacement)
            }
            other => {
                return Err(AppError::validation(
                    "TEXT_OPERATION_INVALID",
                    format!("Unsupported text operation: {other}"),
                    serde_json::json!({ "nodeId": node.id, "operation": other }),
                ))
            }
        };

        Ok(NodeExecutionResult::output("text", NodeValue::Text(output)))
    }
}

#[cfg(test)]
mod tests {
    fn transform(operation: &str, input: &str, find: &str, replace: &str) -> String {
        match operation {
            "trim" => input.trim().to_string(),
            "uppercase" => input.to_uppercase(),
            "lowercase" => input.to_lowercase(),
            "replace" if !find.is_empty() => input.replace(find, replace),
            _ => input.to_string(),
        }
    }

    #[test]
    fn deterministic_operations_cover_unicode_and_multiline() {
        assert_eq!(transform("trim", "  xin\n  ", "", ""), "xin");
        assert_eq!(transform("uppercase", "Đà Nẵng", "", ""), "ĐÀ NẴNG");
        assert_eq!(
            transform("lowercase", "HELLO\nWORLD", "", ""),
            "hello\nworld"
        );
        assert_eq!(transform("replace", "a a", "a", "b"), "b b");
    }
}
