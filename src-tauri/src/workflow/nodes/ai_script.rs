use crate::error::{AppError, Result};
use crate::runtime::ai::{AiProvider, GenerateRequest, GenerateResponse};
use crate::runtime::RuntimeServices;
use crate::workflow::artifact::ArtifactManager;
use crate::workflow::executor::{NodeExecutor, ProgressReporter};
use crate::workflow::model::{Node, NodeExecutionResult, NodeInputs, NodeValue};
use async_trait::async_trait;
use serde_json::Value;
use tokio_util::sync::CancellationToken;

pub struct AIScriptNode;

pub fn interpolate_prompt(mut prompt: String, inputs: &NodeInputs) -> String {
    for (key, value) in inputs {
        prompt = prompt.replace(&format!("{{{{{key}}}}}"), &value.as_text());
    }
    prompt
}

#[async_trait]
impl NodeExecutor for AIScriptNode {
    async fn execute(
        &self,
        node: &Node,
        inputs: &NodeInputs,
        cancel_token: CancellationToken,
        _artifact_manager: &ArtifactManager,
        runtime: &RuntimeServices,
        _progress: ProgressReporter,
    ) -> Result<NodeExecutionResult> {
        let data = &node.data.extra;
        let prompt_template = data
            .get("prompt")
            .and_then(Value::as_str)
            .unwrap_or("")
            .to_string();
        let mut prompt = interpolate_prompt(prompt_template, inputs);
        if !prompt.contains("{{input}}") {
            if let Some(value) = inputs.get("input") {
                let upstream = value.as_text();
                if !upstream.is_empty() {
                    prompt = if prompt.trim().is_empty() {
                        upstream
                    } else {
                        format!("{prompt}\n\n{upstream}")
                    };
                }
            }
        }
        if prompt.trim().is_empty() {
            return Err(AppError::validation(
                "AI_PROMPT_EMPTY",
                "AI Script needs a prompt or upstream input.",
                serde_json::json!({ "nodeId": node.id }),
            ));
        }

        let output_format = data
            .get("outputFormat")
            .and_then(Value::as_str)
            .unwrap_or("text")
            .to_string();
        let schema = data
            .get("schema")
            .and_then(Value::as_str)
            .filter(|value| !value.trim().is_empty())
            .map(serde_json::from_str)
            .transpose()
            .map_err(|error| {
                AppError::validation(
                    "AI_SCHEMA_INVALID",
                    format!("Response schema is not valid JSON: {error}"),
                    serde_json::json!({ "nodeId": node.id, "field": "schema" }),
                )
            })?;
        let request = GenerateRequest {
            model: data
                .get("model")
                .and_then(Value::as_str)
                .unwrap_or("gemini-2.5-flash")
                .to_string(),
            prompt,
            system_instructions: data
                .get("systemInstructions")
                .and_then(Value::as_str)
                .unwrap_or("")
                .to_string(),
            output_format: output_format.clone(),
            temperature: data
                .get("temperature")
                .and_then(Value::as_f64)
                .unwrap_or(0.7),
            timeout_seconds: data
                .get("timeout")
                .or_else(|| data.get("timeoutSeconds"))
                .and_then(Value::as_u64)
                .unwrap_or(60),
            schema,
        };
        let response = runtime
            .gemini_provider()?
            .generate(request, cancel_token)
            .await?;
        Ok(match response {
            GenerateResponse::Text(text) => {
                NodeExecutionResult::output("text", NodeValue::Text(text))
            }
            GenerateResponse::Json(value) => {
                NodeExecutionResult::output("json", NodeValue::Json(value))
            }
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn prompt_interpolation_uses_port_names() {
        let mut inputs = NodeInputs::new();
        inputs.insert("input".into(), NodeValue::Text("Alice".into()));
        assert_eq!(
            interpolate_prompt("Hello {{input}}".into(), &inputs),
            "Hello Alice"
        );
    }
}
