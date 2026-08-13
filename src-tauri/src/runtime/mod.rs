use crate::error::{AppError, Result};
use keyring::Entry;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::RwLock;
use std::time::Duration;
use tokio::process::Command;
use tokio::time::timeout;

pub mod ai;
pub mod media;

const KEYRING_SERVICE: &str = "com.phongvudzz.void-workflow";
const GEMINI_ACCOUNT: &str = "gemini-api-key";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeSettings {
    #[serde(default)]
    pub output_directory: String,
    #[serde(default)]
    pub ffmpeg_path: String,
    #[serde(default)]
    pub ffprobe_path: String,
    #[serde(default = "default_concurrency")]
    pub concurrency: usize,
}

fn default_concurrency() -> usize {
    2
}

impl Default for RuntimeSettings {
    fn default() -> Self {
        Self {
            output_directory: String::new(),
            ffmpeg_path: String::new(),
            ffprobe_path: String::new(),
            concurrency: default_concurrency(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HealthProbe {
    pub state: String,
    pub detail: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EnvironmentHealth {
    pub backend: HealthProbe,
    pub sqlite: HealthProbe,
    pub storage: HealthProbe,
    pub ffmpeg: HealthProbe,
    pub ffprobe: HealthProbe,
    pub gemini: HealthProbe,
}

pub struct RuntimeServices {
    app_dir: PathBuf,
    settings: RwLock<RuntimeSettings>,
}

impl RuntimeServices {
    pub fn new(app_dir: PathBuf) -> Result<Self> {
        let settings_path = app_dir.join("runtime-settings.json");
        let settings = if settings_path.exists() {
            serde_json::from_str(&fs::read_to_string(&settings_path)?).map_err(|error| {
                AppError::validation(
                    "INVALID_RUNTIME_SETTINGS",
                    format!("Runtime settings could not be parsed: {error}"),
                    serde_json::Value::Null,
                )
            })?
        } else {
            RuntimeSettings::default()
        };
        Ok(Self {
            app_dir,
            settings: RwLock::new(settings),
        })
    }

    pub fn settings(&self) -> RuntimeSettings {
        self.settings.read().unwrap().clone()
    }

    pub fn update_settings(&self, settings: RuntimeSettings) -> Result<RuntimeSettings> {
        if !(1..=16).contains(&settings.concurrency) {
            return Err(AppError::validation(
                "INVALID_CONCURRENCY",
                "Concurrency must be between 1 and 16.",
                serde_json::json!({ "field": "concurrency" }),
            ));
        }
        for (field, value) in [
            ("ffmpegPath", &settings.ffmpeg_path),
            ("ffprobePath", &settings.ffprobe_path),
        ] {
            if !value.trim().is_empty() && !Path::new(value).is_file() {
                return Err(AppError::validation(
                    "EXECUTABLE_PATH_NOT_FOUND",
                    format!("{field} does not point to a file: {value}"),
                    serde_json::json!({ "field": field, "path": value }),
                ));
            }
        }
        if !settings.output_directory.trim().is_empty() {
            fs::create_dir_all(&settings.output_directory)?;
        }
        fs::create_dir_all(&self.app_dir)?;
        let json = serde_json::to_string_pretty(&settings).map_err(|error| {
            AppError::Internal(format!("Failed to serialize runtime settings: {error}"))
        })?;
        fs::write(self.app_dir.join("runtime-settings.json"), json)?;
        *self.settings.write().unwrap() = settings.clone();
        Ok(settings)
    }

    pub fn set_gemini_api_key(&self, api_key: &str) -> Result<()> {
        let api_key = api_key.trim();
        if api_key.is_empty() {
            return Err(AppError::validation(
                "GEMINI_KEY_EMPTY",
                "Gemini API key cannot be empty.",
                serde_json::Value::Null,
            ));
        }
        Entry::new(KEYRING_SERVICE, GEMINI_ACCOUNT)
            .map_err(|error| {
                AppError::Internal(format!(
                    "Could not access secure credential storage: {error}"
                ))
            })?
            .set_password(api_key)
            .map_err(|error| {
                AppError::Internal(format!(
                    "Could not save Gemini credential securely: {error}"
                ))
            })?;
        Ok(())
    }

    pub fn clear_gemini_api_key(&self) -> Result<()> {
        if let Ok(entry) = Entry::new(KEYRING_SERVICE, GEMINI_ACCOUNT) {
            let _ = entry.delete_credential();
        }
        Ok(())
    }

    pub fn gemini_api_key(&self) -> Option<String> {
        Entry::new(KEYRING_SERVICE, GEMINI_ACCOUNT)
            .ok()
            .and_then(|entry| entry.get_password().ok())
            .or_else(|| std::env::var("GEMINI_API_KEY").ok())
            .filter(|value| !value.trim().is_empty())
    }

    pub fn gemini_provider(&self) -> Result<ai::GeminiProvider> {
        let api_key = self.gemini_api_key().ok_or_else(|| {
            AppError::environment(
                "AUTH_MISSING",
                "Gemini is not connected",
                "No Gemini API key is configured.",
                "Add a Gemini API key in Settings, then retry the run.",
            )
        })?;
        Ok(ai::GeminiProvider::new(api_key))
    }

    pub fn ffmpeg_program(&self) -> String {
        let settings = self.settings();
        if settings.ffmpeg_path.trim().is_empty() {
            "ffmpeg".into()
        } else {
            settings.ffmpeg_path
        }
    }

    pub fn ffprobe_program(&self) -> String {
        let settings = self.settings();
        if settings.ffprobe_path.trim().is_empty() {
            "ffprobe".into()
        } else {
            settings.ffprobe_path
        }
    }

    pub fn output_root(&self) -> PathBuf {
        let settings = self.settings();
        if settings.output_directory.trim().is_empty() {
            self.app_dir.join("runs")
        } else {
            PathBuf::from(settings.output_directory)
        }
    }

    pub async fn probe_environment(&self, sqlite_ready: bool) -> EnvironmentHealth {
        let storage = self.probe_storage().await;
        let ffmpeg = probe_program(&self.ffmpeg_program(), "FFmpeg").await;
        let ffprobe = probe_program(&self.ffprobe_program(), "FFprobe").await;
        let gemini = if self.gemini_api_key().is_some() {
            HealthProbe {
                state: "configured".into(),
                detail: "API key stored in secure credential storage.".into(),
            }
        } else {
            HealthProbe {
                state: "degraded".into(),
                detail: "No API key configured.".into(),
            }
        };
        EnvironmentHealth {
            backend: HealthProbe {
                state: "ready".into(),
                detail: "Tauri command host is responding.".into(),
            },
            sqlite: HealthProbe {
                state: if sqlite_ready { "ready" } else { "down" }.into(),
                detail: if sqlite_ready {
                    "Database query succeeded."
                } else {
                    "Database is unavailable."
                }
                .into(),
            },
            storage,
            ffmpeg,
            ffprobe,
            gemini,
        }
    }

    async fn probe_storage(&self) -> HealthProbe {
        let root = self.output_root();
        let result = async {
            tokio::fs::create_dir_all(&root).await?;
            let probe = root.join(".void-write-probe");
            tokio::fs::write(&probe, b"ok").await?;
            tokio::fs::remove_file(probe).await?;
            std::io::Result::Ok(())
        }
        .await;
        match result {
            Ok(()) => HealthProbe {
                state: "ready".into(),
                detail: root.to_string_lossy().into_owned(),
            },
            Err(error) => HealthProbe {
                state: "down".into(),
                detail: error.to_string(),
            },
        }
    }
}

async fn probe_program(program: &str, label: &str) -> HealthProbe {
    match timeout(
        Duration::from_secs(3),
        Command::new(program).arg("-version").output(),
    )
    .await
    {
        Ok(Ok(output)) if output.status.success() => {
            let first_line = String::from_utf8_lossy(&output.stdout)
                .lines()
                .next()
                .unwrap_or(label)
                .to_string();
            HealthProbe {
                state: "ready".into(),
                detail: first_line,
            }
        }
        Ok(Ok(output)) => HealthProbe {
            state: "down".into(),
            detail: format!("{label} exited with {}.", output.status),
        },
        Ok(Err(error)) => HealthProbe {
            state: "down".into(),
            detail: format!("{label} was not found: {error}"),
        },
        Err(_) => HealthProbe {
            state: "degraded".into(),
            detail: format!("{label} probe timed out."),
        },
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[test]
    fn settings_validate_and_persist_without_secrets() {
        let directory = tempdir().unwrap();
        let services = RuntimeServices::new(directory.path().to_path_buf()).unwrap();
        let updated = services
            .update_settings(RuntimeSettings {
                concurrency: 4,
                ..RuntimeSettings::default()
            })
            .unwrap();
        assert_eq!(updated.concurrency, 4);
        let contents = fs::read_to_string(directory.path().join("runtime-settings.json")).unwrap();
        assert!(!contents.to_lowercase().contains("api_key"));
    }

    #[test]
    fn concurrency_outside_bounds_is_rejected() {
        let directory = tempdir().unwrap();
        let services = RuntimeServices::new(directory.path().to_path_buf()).unwrap();
        assert!(services
            .update_settings(RuntimeSettings {
                concurrency: 0,
                ..RuntimeSettings::default()
            })
            .is_err());
    }
}
