use crate::error::{AppError, Result};
use crate::workflow::artifact::ArtifactManager;
use crate::workflow::executor::NodeExecutor;
use crate::workflow::model::Node;
use async_trait::async_trait;
use serde_json::Value;
use std::collections::HashMap;
use std::process::Stdio;
use tokio::io::AsyncReadExt;
use tokio::process::Command;
use tokio_util::sync::CancellationToken;

pub struct MediaInfoNode;

pub fn extract_media_info(stdout: &str) -> Result<Value> {
    let parsed: Value = serde_json::from_str(stdout)
        .map_err(|e| AppError::Internal(format!("Failed to parse ffprobe json: {}", e)))?;

    let mut duration = 0.0;
    let mut width = 0;
    let mut height = 0;
    let mut vcodec = String::new();
    let mut acodec = String::new();

    if let Some(format) = parsed.get("format") {
        if let Some(d) = format.get("duration").and_then(Value::as_str) {
            duration = d.parse::<f64>().unwrap_or(0.0);
        }
    }

    if let Some(streams) = parsed.get("streams").and_then(Value::as_array) {
        for stream in streams {
            let codec_type = stream
                .get("codec_type")
                .and_then(Value::as_str)
                .unwrap_or("");
            if codec_type == "video" {
                vcodec = stream
                    .get("codec_name")
                    .and_then(Value::as_str)
                    .unwrap_or("")
                    .to_string();
                width = stream.get("width").and_then(Value::as_i64).unwrap_or(0);
                height = stream.get("height").and_then(Value::as_i64).unwrap_or(0);
            } else if codec_type == "audio" {
                acodec = stream
                    .get("codec_name")
                    .and_then(Value::as_str)
                    .unwrap_or("")
                    .to_string();
            }
        }
    }

    Ok(serde_json::json!({
        "duration": duration,
        "width": width,
        "height": height,
        "vcodec": vcodec,
        "acodec": acodec,
    }))
}

#[async_trait]
impl NodeExecutor for MediaInfoNode {
    async fn execute(
        &self,
        _node: &Node,
        inputs: &HashMap<String, Value>,
        cancel_token: CancellationToken,
        _artifact_manager: &ArtifactManager,
    ) -> Result<Value> {
        let mut file_path = String::new();
        for val in inputs.values() {
            if let Some(obj) = val.as_object() {
                if let Some(p) = obj.get("file_path").and_then(Value::as_str) {
                    file_path = p.to_string();
                    break;
                }
            } else if let Some(p) = val.as_str() {
                file_path = p.to_string();
                break;
            }
        }

        if file_path.is_empty() {
            return Err(AppError::Internal(
                "No file_path provided to MediaInfoNode".to_string(),
            ));
        }

        let mut child = Command::new("ffprobe")
            .arg("-v")
            .arg("quiet")
            .arg("-print_format")
            .arg("json")
            .arg("-show_format")
            .arg("-show_streams")
            .arg(&file_path)
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .map_err(|e| AppError::Internal(format!("Failed to spawn ffprobe: {}", e)))?;

        let mut stdout_stream = child.stdout.take().unwrap();
        let mut stderr_stream = child.stderr.take().unwrap();

        let status = tokio::select! {
            _ = cancel_token.cancelled() => {
                let _ = child.kill().await;
                return Err(AppError::Internal("Workflow Cancelled".to_string()));
            }
            res = child.wait() => res
        };

        let status =
            status.map_err(|e| AppError::Internal(format!("ffprobe execution failed: {}", e)))?;

        let mut stdout_bytes = Vec::new();
        let _ = stdout_stream.read_to_end(&mut stdout_bytes).await;

        let mut stderr_bytes = Vec::new();
        let _ = stderr_stream.read_to_end(&mut stderr_bytes).await;

        if !status.success() {
            let err_str = String::from_utf8_lossy(&stderr_bytes);
            return Err(AppError::Internal(format!("ffprobe error: {}", err_str)));
        }

        let stdout_str = String::from_utf8_lossy(&stdout_bytes);
        let info = extract_media_info(&stdout_str)?;

        // Append file_path so downstream nodes can still use it
        let mut out_obj = info.as_object().unwrap().clone();
        out_obj.insert("file_path".to_string(), serde_json::json!(file_path));

        Ok(serde_json::Value::Object(out_obj))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_extract_media_info() {
        let mock_json = r#"{
            "streams": [
                {
                    "codec_name": "h264",
                    "codec_type": "video",
                    "width": 1920,
                    "height": 1080
                },
                {
                    "codec_name": "aac",
                    "codec_type": "audio"
                }
            ],
            "format": {
                "duration": "12.34"
            }
        }"#;

        let info = extract_media_info(mock_json).unwrap();
        assert_eq!(info["duration"].as_f64().unwrap(), 12.34);
        assert_eq!(info["width"].as_i64().unwrap(), 1920);
        assert_eq!(info["height"].as_i64().unwrap(), 1080);
        assert_eq!(info["vcodec"].as_str().unwrap(), "h264");
        assert_eq!(info["acodec"].as_str().unwrap(), "aac");
    }
}
