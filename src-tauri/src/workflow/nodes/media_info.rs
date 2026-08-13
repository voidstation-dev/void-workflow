use crate::error::{AppError, Result};
use crate::runtime::RuntimeServices;
use crate::workflow::artifact::ArtifactManager;
use crate::workflow::executor::{NodeExecutor, ProgressReporter};
use crate::workflow::model::{Node, NodeExecutionResult, NodeInputs, NodeValue};
use async_trait::async_trait;
use serde_json::Value;
use tokio_util::sync::CancellationToken;

pub struct MediaInfoNode;

pub fn extract_media_info(stdout: &str) -> Result<Value> {
    let parsed: Value = serde_json::from_str(stdout)
        .map_err(|e| AppError::Internal(format!("Failed to parse ffprobe json: {}", e)))?;

    let format = parsed.get("format").cloned().unwrap_or(Value::Null);
    let duration_ms = format
        .get("duration")
        .and_then(Value::as_str)
        .and_then(|value| value.parse::<f64>().ok())
        .map(|seconds| (seconds * 1000.0).round() as u64);
    let parse_number = |key: &str| {
        format
            .get(key)
            .and_then(Value::as_str)
            .and_then(|value| value.parse::<u64>().ok())
    };
    let streams = parsed
        .get("streams")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();
    let video = streams
        .iter()
        .find(|stream| stream.get("codec_type").and_then(Value::as_str) == Some("video"));
    let audio = streams
        .iter()
        .find(|stream| stream.get("codec_type").and_then(Value::as_str) == Some("audio"));
    let fps = video
        .and_then(|stream| stream.get("avg_frame_rate"))
        .and_then(Value::as_str)
        .and_then(parse_rate);

    Ok(serde_json::json!({
        "durationMs": duration_ms,
        "format": format.get("format_name").and_then(Value::as_str),
        "sizeBytes": parse_number("size"),
        "bitRate": parse_number("bit_rate"),
        "video": video.map(|stream| serde_json::json!({
            "codec": stream.get("codec_name").and_then(Value::as_str),
            "width": stream.get("width").and_then(Value::as_u64),
            "height": stream.get("height").and_then(Value::as_u64),
            "fps": fps,
            "pixelFormat": stream.get("pix_fmt").and_then(Value::as_str),
            "colorSpace": stream.get("color_space").and_then(Value::as_str),
        })),
        "audio": audio.map(|stream| serde_json::json!({
            "codec": stream.get("codec_name").and_then(Value::as_str),
            "sampleRate": stream.get("sample_rate").and_then(Value::as_str).and_then(|value| value.parse::<u64>().ok()),
            "channels": stream.get("channels").and_then(Value::as_u64),
            "bitRate": stream.get("bit_rate").and_then(Value::as_str).and_then(|value| value.parse::<u64>().ok()),
        })),
        "raw": parsed,
    }))
}

fn parse_rate(value: &str) -> Option<f64> {
    let (numerator, denominator) = value.split_once('/')?;
    let denominator = denominator.parse::<f64>().ok()?;
    (denominator != 0.0)
        .then(|| {
            numerator
                .parse::<f64>()
                .ok()
                .map(|value| value / denominator)
        })
        .flatten()
}

#[async_trait]
impl NodeExecutor for MediaInfoNode {
    async fn execute(
        &self,
        _node: &Node,
        inputs: &NodeInputs,
        cancel_token: CancellationToken,
        _artifact_manager: &ArtifactManager,
        runtime: &RuntimeServices,
        progress: ProgressReporter,
    ) -> Result<NodeExecutionResult> {
        let file_path = inputs
            .get("media")
            .and_then(NodeValue::as_path)
            .unwrap_or_default()
            .to_string();

        if file_path.is_empty() {
            return Err(AppError::Internal(
                "No file_path provided to MediaInfoNode".to_string(),
            ));
        }

        progress(0.1);
        let raw = runtime.probe_media_json(&file_path, cancel_token).await?;
        let mut info = extract_media_info(&serde_json::to_string(&raw).map_err(|error| {
            AppError::Internal(format!("Failed to normalize FFprobe output: {error}"))
        })?)?;
        info["path"] = Value::String(file_path);
        progress(0.95);

        let media_value = inputs
            .get("media")
            .cloned()
            .unwrap_or(NodeValue::Any(Value::Null));
        Ok(NodeExecutionResult {
            outputs: [
                ("metadata".into(), NodeValue::Json(info.clone())),
                ("media".into(), media_value),
            ]
            .into(),
            metadata: info,
            ..NodeExecutionResult::default()
        })
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
        assert_eq!(info["durationMs"].as_u64().unwrap(), 12_340);
        assert_eq!(info["video"]["width"].as_u64().unwrap(), 1920);
        assert_eq!(info["video"]["height"].as_u64().unwrap(), 1080);
        assert_eq!(info["video"]["codec"].as_str().unwrap(), "h264");
        assert_eq!(info["audio"]["codec"].as_str().unwrap(), "aac");
    }
}
