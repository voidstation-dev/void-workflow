use crate::error::{AppError, Result};
use crate::runtime::RuntimeServices;
use crate::workflow::artifact::ArtifactManager;
use crate::workflow::executor::{NodeExecutor, ProgressReporter};
use crate::workflow::model::{MediaRef, Node, NodeExecutionResult, NodeInputs, NodeValue};
use async_trait::async_trait;
use serde_json::Value;
use std::path::Path;
use tokio_util::sync::CancellationToken;

/// AudioCoverNode — source node for the YouTube visualizer pipeline. Reads
/// `audioPath` + `coverPath` from the node's editor state (selected through the
/// inline body renderer's native file dialog), validates both exist, probes the
/// audio with FFprobe for the metadata the downstream Visualizer needs, and
/// emits three outputs:
///   - `audio`     → Audio MediaRef (path + probed metadata)
///   - `metadata`  → Json (durationMs / sampleRate / codec / channels / bitRate)
///   - `cover`     → Media MediaRef (the cover/thumbnail image)
///
/// No inputs — this is the entry point of the pipeline. The frontend's edit-time
/// `probeAudioMetadata` fills the same fields on `node.data` for live card
/// readouts; here we re-probe at run time so the output metadata is always the
/// authoritative FFprobe result, never a stale editor value.
pub struct AudioCoverNode;

fn require_existing_file(node: &Node, key: &str, error_code: &str, label: &str) -> Result<String> {
    let path = node
        .data
        .extra
        .get(key)
        .and_then(Value::as_str)
        .unwrap_or("")
        .trim()
        .to_string();
    if path.is_empty() {
        return Err(AppError::validation(
            error_code,
            format!("{label} is not set."),
            serde_json::json!({ "nodeId": node.id, "field": key }),
        ));
    }
    let canonical = Path::new(&path)
        .canonicalize()
        .map_err(|_| {
            AppError::validation(
                error_code,
                format!("{label} could not be opened."),
                serde_json::json!({ "nodeId": node.id, "path": path }),
            )
        })?;
    if !canonical.is_file() {
        return Err(AppError::validation(
            error_code,
            format!("{label} is not a regular file."),
            serde_json::json!({ "nodeId": node.id, "path": path }),
        ));
    }
    Ok(canonical.to_string_lossy().into_owned())
}

#[async_trait]
impl NodeExecutor for AudioCoverNode {
    async fn execute(
        &self,
        node: &Node,
        _inputs: &NodeInputs,
        cancel_token: CancellationToken,
        _artifact_manager: &ArtifactManager,
        runtime: &RuntimeServices,
        progress: ProgressReporter,
    ) -> Result<NodeExecutionResult> {
        let audio_path = require_existing_file(node, "audioPath", "AUDIO_PATH_MISSING", "Audio file")?;
        let cover_path = require_existing_file(node, "coverPath", "COVER_PATH_MISSING", "Cover image")?;

        progress(0.2);
        // Authoritative run-time probe. Reuses the same FFprobe path used by the
        // edit-time probe so a successful editor readout guarantees this works.
        let probe = runtime.probe_media_json(&audio_path, cancel_token.clone()).await?;
        let audio_stream = probe
            .get("streams")
            .and_then(Value::as_array)
            .and_then(|streams| {
                streams
                    .iter()
                    .find(|s| s.get("codec_type").and_then(Value::as_str) == Some("audio"))
            })
            .ok_or_else(|| {
                AppError::validation(
                    "AUDIO_STREAM_MISSING",
                    "The selected audio file has no audio stream.",
                    serde_json::json!({ "nodeId": node.id, "path": audio_path }),
                )
            })?;
        let duration_ms = probe
            .pointer("/format/duration")
            .and_then(Value::as_str)
            .and_then(|v| v.parse::<f64>().ok())
            .map(|s| (s * 1000.0).round() as u64)
            .unwrap_or(0);
        let metadata = serde_json::json!({
            "durationMs": duration_ms,
            "sampleRate": audio_stream.get("sample_rate").and_then(Value::as_str).and_then(|v| v.parse::<u64>().ok()),
            "audioCodec": audio_stream.get("codec_name").and_then(Value::as_str),
            "channels": audio_stream.get("channels").and_then(Value::as_u64),
            "bitRate": audio_stream.get("bit_rate").and_then(Value::as_str).and_then(|v| v.parse::<u64>().ok()),
        });
        progress(0.95);

        let audio_ref = MediaRef {
            path: audio_path.clone(),
            mime: mime_guess::from_path(&audio_path).first_raw().map(str::to_string),
            metadata: metadata.clone(),
        };
        let cover_ref = MediaRef {
            path: cover_path.clone(),
            mime: mime_guess::from_path(&cover_path).first_raw().map(str::to_string),
            metadata: serde_json::json!({}),
        };

        Ok(NodeExecutionResult {
            outputs: [
                ("audio".into(), NodeValue::Audio(audio_ref)),
                ("metadata".into(), NodeValue::Json(metadata.clone())),
                ("cover".into(), NodeValue::Media(cover_ref)),
            ]
            .into(),
            metadata,
            ..NodeExecutionResult::default()
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::workflow::test_support::{harness, node, progress};
    use std::collections::HashMap;

    #[tokio::test]
    async fn rejects_missing_audio_path() {
        let (_dir, runtime, artifacts) = harness();
        let err = AudioCoverNode
            .execute(
                &node("audioCover", serde_json::json!({ "coverPath": "x.jpg" })),
                &NodeInputs::new(),
                CancellationToken::new(),
                &artifacts,
                &runtime,
                progress(),
            )
            .await
            .unwrap_err();
        assert!(err.to_string().contains("Audio file is not set"));
    }

    #[test]
    fn require_existing_file_rejects_nonexistent() {
        let n = Node {
            id: "x".into(),
            node_type: "audioCover".into(),
            version: 2,
            data: crate::workflow::model::NodeData {
                label: "x".into(),
                extra: serde_json::json!({ "audioPath": "does-not-exist.mp3" }),
            },
            extra: HashMap::new(),
        };
        let err = require_existing_file(&n, "audioPath", "AUDIO_PATH_MISSING", "Audio file").unwrap_err();
        assert!(err.to_string().contains("Audio file could not be opened"));
    }
}