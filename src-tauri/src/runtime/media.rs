use crate::error::{AppError, Result};
use crate::runtime::RuntimeServices;
use crate::workflow::executor::ProgressReporter;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::process::Stdio;
use tokio::io::{AsyncBufReadExt, AsyncReadExt, BufReader};
use tokio::process::Command;
use tokio_util::sync::CancellationToken;

/// Edit-time audio metadata returned to the frontend for the Audio & Cover
/// node's inline code-block readout + downstream visualizer defaults. A focused
/// subset of the full `extract_media_info` output — only the audio-relevant
/// fields the UI needs before a run. `#[serde(rename_all = "camelCase")]` keeps
/// it in lockstep with the frontend `AudioMetadata` TS mirror.
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct AudioMetadata {
    pub duration_ms: u64,
    pub sample_rate: u64,
    pub audio_codec: String,
    pub channels: u64,
    pub bit_rate: Option<u64>,
}

impl RuntimeServices {
    pub async fn probe_media_json(&self, path: &str, cancel: CancellationToken) -> Result<Value> {
        let mut child = Command::new(self.ffprobe_program())
            .args([
                "-v",
                "quiet",
                "-print_format",
                "json",
                "-show_format",
                "-show_streams",
                path,
            ])
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .map_err(|error| {
                AppError::environment(
                    "FFPROBE_NOT_FOUND",
                    "FFprobe could not start",
                    error.to_string(),
                    "Install FFmpeg or configure FFprobe in Settings.",
                )
            })?;
        let mut stdout = child.stdout.take().expect("stdout is piped");
        let mut stderr = child.stderr.take().expect("stderr is piped");
        let status = tokio::select! {
            _ = cancel.cancelled() => {
                let _ = child.kill().await;
                return Err(AppError::Cancelled("Media probe cancelled.".into()));
            }
            result = child.wait() => result?
        };
        let mut stdout_bytes = Vec::new();
        let mut stderr_bytes = Vec::new();
        stdout.read_to_end(&mut stdout_bytes).await?;
        stderr.read_to_end(&mut stderr_bytes).await?;
        if !status.success() {
            return Err(AppError::external(
                "FFPROBE_FAILED",
                "Media probe failed",
                String::from_utf8_lossy(&stderr_bytes).trim().to_string(),
                false,
            ));
        }
        serde_json::from_slice(&stdout_bytes).map_err(|error| {
            AppError::external(
                "FFPROBE_INVALID_OUTPUT",
                "FFprobe returned invalid metadata",
                error.to_string(),
                false,
            )
        })
    }

    /// Edit-time audio metadata probe for the Audio & Cover node. Runs FFprobe
    /// on the selected audio file and returns the duration + sample rate +
    /// codec + channels the inline card-body renderer + downstream Visualizer
    /// need BEFORE any run. Reuses `probe_media_json` so the path/cancellation
    /// story is identical to the runtime `mediaInfo` executor. Returns a
    /// focused `AudioMetadata` subset; non-audio files yield a validation
    /// error so the UI can show an honest "not audio" message rather than
    /// zeros.
    pub async fn probe_audio_metadata(
        &self,
        path: &str,
        cancel: CancellationToken,
    ) -> Result<AudioMetadata> {
        let parsed = self.probe_media_json(path, cancel).await?;
        let duration_ms = parsed
            .pointer("/format/duration")
            .and_then(Value::as_str)
            .and_then(|value| value.parse::<f64>().ok())
            .map(|seconds| (seconds * 1000.0).round() as u64)
            .unwrap_or(0);
        let audio = parsed
            .get("streams")
            .and_then(Value::as_array)
            .and_then(|streams| {
                streams
                    .iter()
                    .find(|stream| stream.get("codec_type").and_then(Value::as_str) == Some("audio"))
            })
            .ok_or_else(|| {
                AppError::validation(
                    "AUDIO_STREAM_MISSING",
                    "The selected file has no audio stream.",
                    serde_json::json!({ "path": path }),
                )
            })?;
        Ok(AudioMetadata {
            duration_ms,
            sample_rate: audio
                .get("sample_rate")
                .and_then(Value::as_str)
                .and_then(|value| value.parse::<u64>().ok())
                .unwrap_or(0),
            audio_codec: audio
                .get("codec_name")
                .and_then(Value::as_str)
                .unwrap_or("")
                .to_string(),
            channels: audio.get("channels").and_then(Value::as_u64).unwrap_or(0),
            bit_rate: audio
                .get("bit_rate")
                .and_then(Value::as_str)
                .and_then(|value| value.parse::<u64>().ok()),
        })
    }

    pub async fn run_ffmpeg(
        &self,
        args: &[String],
        duration_ms: Option<u64>,
        cancel: CancellationToken,
        progress: ProgressReporter,
    ) -> Result<()> {
        let mut child = Command::new(self.ffmpeg_program())
            .args(args)
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .map_err(|error| {
                AppError::environment(
                    "FFMPEG_NOT_FOUND",
                    "FFmpeg could not start",
                    error.to_string(),
                    "Install FFmpeg or configure its executable path in Settings.",
                )
            })?;
        let stdout = child.stdout.take().expect("stdout is piped");
        let mut stderr = child.stderr.take().expect("stderr is piped");
        let progress_task = tokio::spawn(async move {
            let mut lines = BufReader::new(stdout).lines();
            while let Ok(Some(line)) = lines.next_line().await {
                if let (Some(position_ms), Some(duration_ms)) = (
                    parse_ffmpeg_progress(&line),
                    duration_ms.filter(|value| *value > 0),
                ) {
                    progress((position_ms as f32 / duration_ms as f32).clamp(0.0, 0.99));
                }
            }
        });
        let stderr_task = tokio::spawn(async move {
            let mut bytes = Vec::new();
            let _ = stderr.read_to_end(&mut bytes).await;
            bytes
        });
        let status = tokio::select! {
            _ = cancel.cancelled() => {
                let _ = child.kill().await;
                let _ = progress_task.await;
                let _ = stderr_task.await;
                return Err(AppError::Cancelled("Media render cancelled; FFmpeg was stopped.".into()));
            }
            result = child.wait() => result?
        };
        let _ = progress_task.await;
        let stderr = stderr_task.await.unwrap_or_default();
        if !status.success() {
            return Err(AppError::external(
                "FFMPEG_FAILED",
                "Media render failed",
                String::from_utf8_lossy(&stderr).trim().to_string(),
                false,
            ));
        }
        Ok(())
    }
}

pub fn parse_ffmpeg_progress(line: &str) -> Option<u64> {
    if let Some(value) = line.strip_prefix("out_time_ms=") {
        return value
            .parse::<u64>()
            .ok()
            .map(|microseconds| microseconds / 1_000);
    }
    let value = line.strip_prefix("out_time=")?;
    let mut parts = value.split(':');
    let hours = parts.next()?.parse::<f64>().ok()?;
    let minutes = parts.next()?.parse::<f64>().ok()?;
    let seconds = parts.next()?.parse::<f64>().ok()?;
    Some(((hours * 3600.0 + minutes * 60.0 + seconds) * 1000.0).round() as u64)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_machine_readable_ffmpeg_progress() {
        assert_eq!(parse_ffmpeg_progress("out_time_ms=1250000"), Some(1250));
        assert_eq!(
            parse_ffmpeg_progress("out_time=00:00:03.500000"),
            Some(3500)
        );
        assert_eq!(parse_ffmpeg_progress("progress=continue"), None);
    }
}
