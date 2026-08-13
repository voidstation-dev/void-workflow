use crate::error::{AppError, Result};
use crate::workflow::artifact::ArtifactManager;
use crate::workflow::executor::NodeExecutor;
use crate::workflow::model::{MediaRef, Node, NodeExecutionResult, NodeInputs, NodeValue};
use async_trait::async_trait;
use std::process::Stdio;
use tokio::io::AsyncReadExt;
use tokio::process::Command;
use tokio_util::sync::CancellationToken;
use uuid::Uuid;

pub struct MediaMergeNode;

#[async_trait]
impl NodeExecutor for MediaMergeNode {
    async fn execute(
        &self,
        _node: &Node,
        inputs: &NodeInputs,
        cancel_token: CancellationToken,
        artifact_manager: &ArtifactManager,
    ) -> Result<NodeExecutionResult> {
        let video1_path = inputs
            .get("in")
            .and_then(NodeValue::as_path)
            .unwrap_or_default()
            .to_string();

        if video1_path.is_empty() {
            return Err(AppError::Internal(
                "No input video provided to MediaMergeNode".to_string(),
            ));
        }

        let output_filename = format!("merged_{}.mp4", Uuid::new_v4());
        let output_path = artifact_manager.get_output_path(&output_filename);
        let output_path_str = output_path.to_string_lossy().to_string();

        let mut cmd = Command::new("ffmpeg");
        cmd.arg("-y"); // Overwrite if exists

        cmd.arg("-i")
            .arg(&video1_path)
            .arg("-c:v")
            .arg("copy")
            .arg("-c:a")
            .arg("copy")
            .arg(&output_path_str);

        cmd.stdout(Stdio::piped()).stderr(Stdio::piped());

        let mut child = cmd
            .spawn()
            .map_err(|e| AppError::Internal(format!("Failed to spawn ffmpeg: {}", e)))?;

        let mut stderr_stream = child.stderr.take().unwrap();

        let status = tokio::select! {
            _ = cancel_token.cancelled() => {
                let _ = child.kill().await;
                return Err(AppError::Cancelled("Workflow cancelled (FFmpeg killed)".to_string()));
            }
            res = child.wait() => res
        };

        let status =
            status.map_err(|e| AppError::Internal(format!("ffmpeg execution failed: {}", e)))?;

        let mut stderr_bytes = Vec::new();
        let _ = stderr_stream.read_to_end(&mut stderr_bytes).await;

        if !status.success() {
            let err_str = String::from_utf8_lossy(&stderr_bytes);
            return Err(AppError::Internal(format!("ffmpeg error: {}", err_str)));
        }

        let artifact =
            artifact_manager.describe(&output_path, "media", &_node.id, Some("video/mp4"))?;
        let media = MediaRef {
            path: output_path_str,
            mime: Some("video/mp4".into()),
            metadata: serde_json::Value::Null,
        };
        Ok(NodeExecutionResult {
            outputs: [("out".into(), NodeValue::Media(media))].into(),
            artifacts: vec![artifact],
            ..NodeExecutionResult::default()
        })
    }
}
