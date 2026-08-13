use crate::error::{AppError, Result};
use async_trait::async_trait;
use reqwest::{Client, StatusCode};
use serde_json::{json, Value};
use std::time::Duration;
use tokio::time::timeout;
use tokio_util::sync::CancellationToken;

#[derive(Debug, Clone)]
pub struct GenerateRequest {
    pub model: String,
    pub prompt: String,
    pub system_instructions: String,
    pub output_format: String,
    pub temperature: f64,
    pub timeout_seconds: u64,
    pub schema: Option<Value>,
}

#[derive(Debug, Clone)]
pub enum GenerateResponse {
    Text(String),
    Json(Value),
}

#[async_trait]
pub trait AiProvider: Send + Sync {
    async fn generate(
        &self,
        request: GenerateRequest,
        cancel: CancellationToken,
    ) -> Result<GenerateResponse>;
}

pub struct GeminiProvider {
    api_key: String,
    client: Client,
}

impl GeminiProvider {
    pub fn new(api_key: String) -> Self {
        Self {
            api_key,
            client: Client::new(),
        }
    }
}

#[async_trait]
impl AiProvider for GeminiProvider {
    async fn generate(
        &self,
        request: GenerateRequest,
        cancel: CancellationToken,
    ) -> Result<GenerateResponse> {
        if request.model.is_empty()
            || !request.model.chars().all(|character| {
                character.is_ascii_alphanumeric() || matches!(character, '-' | '_' | '.')
            })
        {
            return Err(AppError::validation(
                "MODEL_INVALID",
                "The selected Gemini model identifier is invalid.",
                json!({ "model": request.model }),
            ));
        }
        if !(0.0..=2.0).contains(&request.temperature) || !request.temperature.is_finite() {
            return Err(AppError::validation(
                "TEMPERATURE_INVALID",
                "Temperature must be between 0 and 2.",
                json!({ "temperature": request.temperature }),
            ));
        }
        if !(1..=600).contains(&request.timeout_seconds) {
            return Err(AppError::validation(
                "AI_TIMEOUT_INVALID",
                "AI timeout must be between 1 and 600 seconds.",
                json!({ "timeoutSeconds": request.timeout_seconds }),
            ));
        }

        let mut generation_config = json!({ "temperature": request.temperature });
        if request.output_format != "text" {
            generation_config["responseMimeType"] = Value::String("application/json".into());
            if let Some(schema) = &request.schema {
                generation_config["responseSchema"] = schema.clone();
            }
        }
        let mut body = json!({
            "contents": [{ "role": "user", "parts": [{ "text": request.prompt }] }],
            "generationConfig": generation_config,
        });
        if !request.system_instructions.trim().is_empty() {
            body["systemInstruction"] = json!({
                "parts": [{ "text": request.system_instructions }]
            });
        }

        let url = format!(
            "https://generativelanguage.googleapis.com/v1beta/models/{}:generateContent",
            request.model
        );
        let send = self
            .client
            .post(url)
            .header("x-goog-api-key", &self.api_key)
            .json(&body)
            .send();
        let response = tokio::select! {
            _ = cancel.cancelled() => {
                return Err(AppError::Cancelled("Gemini request cancelled.".into()));
            }
            result = timeout(Duration::from_secs(request.timeout_seconds), send) => {
                match result {
                    Err(_) => return Err(AppError::external("TIMEOUT", "Gemini request timed out", "The provider did not respond before the configured timeout.", true)),
                    Ok(Err(error)) => return Err(AppError::external("NETWORK", "Gemini request failed", error.to_string(), true)),
                    Ok(Ok(response)) => response,
                }
            }
        };

        let status = response.status();
        let payload: Value = response.json().await.map_err(|error| {
            AppError::external(
                "PROVIDER_ERROR",
                "Gemini returned an invalid response",
                error.to_string(),
                true,
            )
        })?;
        if !status.is_success() {
            let message = payload
                .pointer("/error/message")
                .and_then(Value::as_str)
                .unwrap_or("Gemini rejected the request.");
            let (code, title, retryable) = match status {
                StatusCode::UNAUTHORIZED | StatusCode::FORBIDDEN => {
                    ("AUTH_INVALID", "Gemini authentication failed", false)
                }
                StatusCode::TOO_MANY_REQUESTS => ("RATE_LIMIT", "Gemini rate limit reached", true),
                StatusCode::NOT_FOUND => {
                    ("MODEL_UNAVAILABLE", "Gemini model is unavailable", false)
                }
                _ => (
                    "PROVIDER_ERROR",
                    "Gemini request failed",
                    status.is_server_error(),
                ),
            };
            return Err(AppError::external(code, title, message, retryable));
        }

        let text = payload
            .pointer("/candidates/0/content/parts/0/text")
            .and_then(Value::as_str)
            .ok_or_else(|| {
                AppError::external(
                    "PROVIDER_ERROR",
                    "Gemini returned no content",
                    "The response did not include a text candidate.",
                    true,
                )
            })?
            .to_string();

        if request.output_format == "text" {
            return Ok(GenerateResponse::Text(text));
        }
        let parsed: Value = serde_json::from_str(&text).map_err(|error| {
            AppError::external(
                "INVALID_STRUCTURED_OUTPUT",
                "Gemini returned invalid JSON",
                error.to_string(),
                true,
            )
        })?;
        if let Some(schema) = &request.schema {
            validate_basic_schema(&parsed, schema)?;
        }
        Ok(GenerateResponse::Json(parsed))
    }
}

fn validate_basic_schema(value: &Value, schema: &Value) -> Result<()> {
    if schema.get("type").and_then(Value::as_str) == Some("object") && !value.is_object() {
        return Err(AppError::external(
            "INVALID_STRUCTURED_OUTPUT",
            "Gemini output does not match the schema",
            "Expected a JSON object.",
            true,
        ));
    }
    if let Some(required) = schema.get("required").and_then(Value::as_array) {
        let object = value.as_object().ok_or_else(|| {
            AppError::external(
                "INVALID_STRUCTURED_OUTPUT",
                "Gemini output does not match the schema",
                "Required properties can only be checked on a JSON object.",
                true,
            )
        })?;
        for field in required.iter().filter_map(Value::as_str) {
            if !object.contains_key(field) {
                return Err(AppError::external(
                    "INVALID_STRUCTURED_OUTPUT",
                    "Gemini output does not match the schema",
                    format!("Required property `{field}` is missing."),
                    true,
                ));
            }
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn schema_validation_rejects_missing_required_property() {
        let error = validate_basic_schema(
            &json!({ "title": "Hello" }),
            &json!({ "type": "object", "required": ["title", "body"] }),
        )
        .unwrap_err();
        assert_eq!(error.payload().code, "INVALID_STRUCTURED_OUTPUT");
    }
}
