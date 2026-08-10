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
use uuid::Uuid;

pub struct MediaMergeNode;

#[async_trait]
impl NodeExecutor for MediaMergeNode {
    async fn execute(
        &self,
        _node: &Node,
        inputs: &HashMap<String, Value>,
        cancel_token: CancellationToken,
        artifact_manager: &ArtifactManager,
    ) -> Result<Value> {
        let mut video1_path = String::new();
        let mut video2_path = String::new();

        // Extract video1 and video2 paths from inputs
        for (key, val) in inputs {
            let path_str = if let Some(obj) = val.as_object() {
                obj.get("file_path").and_then(Value::as_str).unwrap_or("")
            } else {
                val.as_str().unwrap_or_default()
            };

            if key == "video1" || (video1_path.is_empty() && key != "video2") {
                video1_path = path_str.to_string();
            } else if key == "video2" {
                video2_path = path_str.to_string();
            }
        }

        if video1_path.is_empty() {
            return Err(AppError::Internal(
                "No input video provided to MediaMergeNode".to_string(),
            ));
        }

        let output_filename = format!("merged_{}.mp4", Uuid::new_v4());
        let output_path = artifact_manager.run_dir().join(&output_filename);
        let output_path_str = output_path.to_string_lossy().to_string();

        let mut cmd = Command::new("ffmpeg");
        cmd.arg("-y"); // Overwrite if exists

        if !video1_path.is_empty() && !video2_path.is_empty() {
            // Side-by-side merge
            cmd.arg("-i")
                .arg(&video1_path)
                .arg("-i")
                .arg(&video2_path)
                .arg("-filter_complex")
                .arg("[0:v][1:v]hstack=inputs=2[v]")
                .arg("-map")
                .arg("[v]")
                .arg("-map")
                .arg("0:a?") // Keep audio from first if available
                .arg("-c:v")
                .arg("libx264")
                .arg(&output_path_str);
        } else {
            // Just copy/transcode the single video
            cmd.arg("-i")
                .arg(&video1_path)
                .arg("-c:v")
                .arg("copy")
                .arg("-c:a")
                .arg("copy")
                .arg(&output_path_str);
        }

        cmd.stdout(Stdio::piped()).stderr(Stdio::piped());

        let mut child = cmd
            .spawn()
            .map_err(|e| AppError::Internal(format!("Failed to spawn ffmpeg: {}", e)))?;

        let mut stderr_stream = child.stderr.take().unwrap();

        let status = tokio::select! {
            _ = cancel_token.cancelled() => {
                let _ = child.kill().await;
                return Err(AppError::Internal("Workflow Cancelled (FFmpeg killed)".to_string()));
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

        Ok(serde_json::json!({
            "file_path": output_path_str
        }))
    }
}
