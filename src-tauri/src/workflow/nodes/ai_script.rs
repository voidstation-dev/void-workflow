use crate::error::{AppError, Result};
use crate::workflow::artifact::ArtifactManager;
use crate::workflow::executor::NodeExecutor;
use crate::workflow::model::Node;
use async_trait::async_trait;
use serde_json::Value;
use std::collections::HashMap;
use std::env;
use tokio_util::sync::CancellationToken;

pub struct AIScriptNode;

pub fn interpolate_prompt(mut prompt: String, inputs: &HashMap<String, Value>) -> String {
    for (key, val) in inputs {
        let val_str = if let Some(s) = val.as_str() {
            s.to_string()
        } else if let Some(obj) = val.as_object() {
            if let Some(s) = obj.get("output").and_then(Value::as_str) {
                s.to_string()
            } else {
                val.to_string()
            }
        } else {
            val.to_string()
        };

        let target = format!("{{{{{}}}}}", key); // e.g. {{text}}
        prompt = prompt.replace(&target, &val_str);
    }
    prompt
}

#[async_trait]
impl NodeExecutor for AIScriptNode {
    async fn execute(
        &self,
        node: &Node,
        inputs: &HashMap<String, Value>,
        _cancel_token: CancellationToken,
        _artifact_manager: &ArtifactManager,
    ) -> Result<Value> {
        let system_prompt = node
            .data
            .extra
            .get("system_prompt")
            .and_then(Value::as_str)
            .unwrap_or("");
        let user_prompt_template = node
            .data
            .extra
            .get("user_prompt")
            .and_then(Value::as_str)
            .unwrap_or("")
            .to_string();

        let user_prompt = interpolate_prompt(user_prompt_template, inputs);

        // For MVP1, we'll try to read from the environment, or fail if not found.
        let api_key = env::var("GEMINI_API_KEY").map_err(|_| {
            AppError::Internal("GEMINI_API_KEY environment variable not set".into())
        })?;

        let url = format!("https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key={}", api_key);

        let mut contents = vec![];
        if !system_prompt.is_empty() {
            contents.push(serde_json::json!({
                "role": "user",
                "parts": [{ "text": format!("System instructions: {}\n\nUser request: {}", system_prompt, user_prompt) }]
            }));
        } else {
            contents.push(serde_json::json!({
                "role": "user",
                "parts": [{ "text": user_prompt }]
            }));
        }

        let body = serde_json::json!({
            "contents": contents,
        });

        let client = reqwest::Client::new();
        let res = client
            .post(&url)
            .header("Content-Type", "application/json")
            .json(&body)
            .send()
            .await
            .map_err(|e| AppError::Internal(format!("Gemini API request failed: {}", e)))?;

        if !res.status().is_success() {
            let status = res.status();
            let text = res.text().await.unwrap_or_default();
            return Err(AppError::Internal(format!(
                "Gemini API error ({}): {}",
                status, text
            )));
        }

        let res_json: Value = res
            .json()
            .await
            .map_err(|e| AppError::Internal(format!("Failed to parse Gemini response: {}", e)))?;

        let generated_text = res_json["candidates"][0]["content"]["parts"][0]["text"]
            .as_str()
            .unwrap_or("")
            .to_string();

        Ok(serde_json::json!({
            "output": generated_text
        }))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_prompt_interpolation_only() {
        let template =
            "Hello {{name}}, you are {{age}} years old. Here is your text: {{text}}".to_string();
        let mut inputs = HashMap::new();
        inputs.insert("name".to_string(), serde_json::json!("Alice"));
        inputs.insert("age".to_string(), serde_json::json!(30));
        inputs.insert(
            "text".to_string(),
            serde_json::json!({ "output": "Some generated text" }),
        );

        let result = interpolate_prompt(template, &inputs);
        assert_eq!(
            result,
            "Hello Alice, you are 30 years old. Here is your text: Some generated text"
        );
    }
}
