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
    /// Directory holding the bundled FFmpeg/FFprobe sidecar binaries (the
    /// platform-specific `binaries/` folder packaged via `bundle.externalBin`).
    /// `None` in tests / when no sidecar is present → resolution falls through
    /// to PATH. The resolution order is: Settings override → bundled sidecar →
    /// bare program name on PATH.
    bundled_bin_dir: Option<PathBuf>,
    settings: RwLock<RuntimeSettings>,
}

impl RuntimeServices {
    pub fn new(app_dir: PathBuf) -> Result<Self> {
        Self::with_bundled_bin_dir(app_dir, None)
    }

    /// Construct with an explicit bundled-binary directory (the packaged
    /// sidecar location). `RuntimeServices::new` keeps its existing signature
    /// for the test harness; production wiring in `lib.rs::setup` calls this
    /// with the Tauri-resolved `binaries` directory.
    pub fn with_bundled_bin_dir(app_dir: PathBuf, bundled_bin_dir: Option<PathBuf>) -> Result<Self> {
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
            bundled_bin_dir,
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
        self.resolve_program("ffmpeg", |s| &s.ffmpeg_path)
    }

    pub fn ffprobe_program(&self) -> String {
        self.resolve_program("ffprobe", |s| &s.ffprobe_path)
    }

    /// Resolve an executable path with a four-tier fallback:
    ///   1. The Settings override (`ffmpegPath`/`ffprobePath`) if set + exists.
    ///   2. The bundled sidecar in `bundled_bin_dir` if present + exists + is a
    ///      real binary (size ≥ 256 KiB — placeholder stubs the build needs to
    ///      generate context are too small to be FFmpeg and are skipped).
    ///   3. Auto-detect on the filesystem: scan well-known install locations
    ///      (WinGet, Program Files, Chocolatey, scoop, the process's own PATH)
    ///      for a real binary whose PE machine matches the host arch, and verify
    ///      it actually spawns (avoids WindowsApps reparse-point stubs that throw
    ///      `os error 216` / ERROR_EXE_MACHINE_TYPE_MISMATCH when a launched
    ///      desktop app does NOT inherit the user's shell PATH).
    ///   4. The bare program name (`ffmpeg`/`ffprobe`) → resolved from PATH.
    ///      Last resort; may hit 216 if PATH lacks a real FFmpeg bin and Windows
    ///      resolves the bare name to a WindowsApps stub.
    ///
    /// The Settings override wins so a user-supplied FFmpeg build always
    /// shadows the others. Auto-detect (tier 3) is what makes a double-clicked
    /// desktop install work without manual Settings config: a GUI-launched app
    /// does not inherit the user's terminal PATH, so bare-name resolution
    /// frequently fails — scanning the real install dirs fixes that.
    fn resolve_program(&self, name: &str, settings_path: impl Fn(&RuntimeSettings) -> &String) -> String {
        const MIN_REAL_BINARY_BYTES: u64 = 256 * 1024;
        let exe_suffix = std::env::consts::EXE_SUFFIX;
        let settings = self.settings();
        let configured = settings_path(&settings).trim();
        if !configured.is_empty() && Path::new(configured).is_file() {
            return configured.to_string();
        }
        if let Some(dir) = &self.bundled_bin_dir {
            // Tauri appends `-$target_triple` to externalBin names at bundle
            // time (e.g. `ffmpeg-x86_64-pc-windows-msvc.exe`). At RUN time the
            // resolved sidecar lives in the install dir under its bare platform
            // name, so probe both the suffixed and bare candidates. Skip any
            // candidate smaller than MIN_REAL_BINARY_BYTES — the committed
            // placeholder stubs exist only so `generate_context!` resolves; a
            // 223-byte file is clearly not FFmpeg.
            for candidate in [
                dir.join(format!("{name}{exe_suffix}")),
                dir.join(name),
            ] {
                if candidate.is_file()
                    && fs::metadata(&candidate).map(|m| m.len()).unwrap_or(0)
                        >= MIN_REAL_BINARY_BYTES
                {
                    return candidate.to_string_lossy().into_owned();
                }
            }
        }
        // Tier 3: auto-detect on the filesystem. A GUI-launched desktop app
        // does not inherit the user's shell PATH, so `ffmpeg`/`ffprobe` often
        // resolve to a WindowsApps reparse point and spawn fails with os error
        // 216. Scan the real install locations (WinGet, Program Files, scoop,
        // Chocolatey) + the process PATH for a binary that (a) is large enough
        // to be real, (b) has a PE machine field matching the host arch, and
        // (c) actually spawns `-version` without error. This is the fix for the
        // 216 reported when running the built app.
        if let Some(found) = autodetect_program(name, exe_suffix, MIN_REAL_BINARY_BYTES) {
            return found;
        }
        name.to_string()
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

/// Auto-detect an FFmpeg-family executable on the filesystem when the Settings
/// override and bundled sidecar are both absent. A GUI-launched desktop app
/// does NOT inherit the user's shell PATH, so a bare `ffmpeg`/`ffprobe` name
/// often resolves to a WindowsApps reparse-point stub and spawn fails with
/// `os error 216` (ERROR_EXE_MACHINE_TYPE_MISMATCH). This scans the real
/// install locations + the process PATH for a binary that:
///   (a) is large enough to be a real FFmpeg (≥ MIN_REAL_BINARY_BYTES),
///   (b) has a PE machine field matching the host architecture, and
///   (c) actually spawns `-version` and exits successfully.
/// Returns the absolute path on success, or `None` if nothing usable is found
/// (caller then falls back to the bare name as a last resort).
///
/// The scan is bounded and cheap: a handful of well-known dirs + the PATH
/// entries, each a single `is_file` + size + PE-header peek, with a spawn test
/// only on the first plausible candidate. Synchronous because callers
/// (`ffmpeg_program`/`ffprobe_program`) are sync; the spawn test uses
/// `std::process::Command` (blocking) which is fine for a one-shot startup
/// resolution cached effectively by the caller.
fn autodetect_program(name: &str, exe_suffix: &str, min_bytes: u64) -> Option<String> {
    let target_filename = format!("{name}{exe_suffix}");

    // Candidate directories to scan, in priority order. Well-known Windows
    // install roots first (WinGet, Program Files, Chocolatey, scoop), then the
    // process's own PATH (which MAY carry the FFmpeg dir even for GUI-launched
    // apps in some setups).
    let mut candidate_dirs: Vec<PathBuf> = Vec::new();
    if let Some(local_app) = std::env::var_os("LOCALAPPDATA") {
        // WinGet installs FFmpeg under
        // %LOCALAPPDATA%\Microsoft\WinGet\Packages\Gyan.FFmpeg_*\<build>\bin
        let winget = PathBuf::from(&local_app)
            .join("Microsoft")
            .join("WinGet")
            .join("Packages");
        if winget.is_dir() {
            if let Ok(entries) = fs::read_dir(&winget) {
                for entry in entries.flatten() {
                    let p = entry.path();
                    if !p.is_dir() {
                        continue;
                    }
                    let dir_name = p.file_name().and_then(|s| s.to_str()).unwrap_or("");
                    if dir_name.to_ascii_uppercase().contains("FFMPEG") {
                        // Recurse one or two levels to find a `bin` subdir.
                        if let Some(bin) = find_bin_dir(&p) {
                            candidate_dirs.push(bin);
                        }
                    }
                }
            }
        }
    }
    for program_files in ["C:\\Program Files", "C:\\Program Files (x86)"] {
        let pf = PathBuf::from(program_files);
        for sub in ["FFmpeg", "ffmpeg", "FFmpeg\\bin"] {
            candidate_dirs.push(pf.join(sub));
        }
    }
    if let Ok(choco) = std::env::var("ChocolateyInstall") {
        candidate_dirs.push(PathBuf::from(choco).join("bin"));
    }
    if let Some(home) = std::env::var_os("USERPROFILE") {
        candidate_dirs.push(PathBuf::from(&home).join("scoop").join("apps").join("ffmpeg").join("current").join("bin"));
        candidate_dirs.push(PathBuf::from(&home).join("scoop").join("shims"));
    }
    // Process PATH entries (may include the FFmpeg bin dir in some setups).
    if let Ok(path) = std::env::var("PATH") {
        for dir in path.split(';') {
            if !dir.is_empty() {
                candidate_dirs.push(PathBuf::from(dir));
            }
        }
    }

    let host_machine = host_pe_machine();

    for dir in candidate_dirs {
        if !dir.is_dir() {
            continue;
        }
        // Try the bare-name file in this dir.
        let candidate = dir.join(&target_filename);
        if !candidate.is_file() {
            continue;
        }
        let size = fs::metadata(&candidate).map(|m| m.len()).unwrap_or(0);
        if size < min_bytes {
            continue; // stub / too small
        }
        // PE machine check: skip binaries whose arch doesn't match the host
        // (this is exactly what triggers os error 216 — e.g. an ARM64 FFmpeg on
        // an x86_64 host, or a WindowsApps reparse point that isn't a real PE).
        if let Some(machine) = read_pe_machine(&candidate) {
            if let Some(host) = host_machine {
                if machine != host {
                    continue;
                }
            }
        } else {
            // No readable PE header — likely a reparse point / store stub. Skip.
            continue;
        }
        // Final gate: actually spawn `-version`. A matching PE arch that still
        // fails to run (corrupt, signed-stub, etc.) is rejected here so we fall
        // through to the next candidate instead of returning a broken path.
        if spawn_version_ok(&candidate) {
            return Some(candidate.to_string_lossy().into_owned());
        }
    }
    None
}

/// Find a `bin` subdirectory under an FFmpeg install root (WinGet lays it out
/// as `Gyan.FFmpeg_*\ffmpeg-X.Y-build\bin`). Searches up to two levels deep.
fn find_bin_dir(root: &Path) -> Option<PathBuf> {
    let direct = root.join("bin");
    if direct.is_dir() {
        return Some(direct);
    }
    if let Ok(entries) = fs::read_dir(root) {
        for entry in entries.flatten() {
            let p = entry.path();
            if p.is_dir() {
                let bin = p.join("bin");
                if bin.is_dir() {
                    return Some(bin);
                }
            }
        }
    }
    None
}

/// Read the PE machine field from a file's header. Returns `None` if the file
/// isn't a readable PE image (reparse points, stubs, non-PE files).
fn read_pe_machine(path: &Path) -> Option<u16> {
    let bytes = fs::read(path).ok()?;
    if bytes.len() < 0x40 || &bytes[0..2] != b"MZ" {
        return None;
    }
    let pe_offset = usize::try_from(u32::from_le_bytes([
        bytes[0x3c], bytes[0x3d], bytes[0x3e], bytes[0x3f],
    ]))
    .ok()?;
    let sig_off = pe_offset + 4;
    if bytes.len() < sig_off + 2 {
        return None;
    }
    // Confirm the "PE\0\0" signature precedes the machine field.
    if &bytes[pe_offset..pe_offset + 4] != b"PE\0\0" {
        return None;
    }
    Some(u16::from_le_bytes([bytes[sig_off], bytes[sig_off + 1]]))
}

/// The PE machine code for the host architecture (x86_64 / ARM64 / x86), used
/// to reject FFmpeg binaries built for a different arch (the root cause of
/// `os error 216`). `None` on non-Windows (no PE check there).
fn host_pe_machine() -> Option<u16> {
    match std::env::consts::ARCH {
        "x86_64" => Some(0x8664), // IMAGE_FILE_MACHINE_AMD64
        "aarch64" => Some(0xAA64), // IMAGE_FILE_MACHINE_ARM64
        "x86" => Some(0x014C), // IMAGE_FILE_MACHINE_I386
        _ => None,
    }
}

/// Blocking spawn gate: run `<candidate> -version` and accept only a clean
/// exit. This is the authority that the binary actually runs on this host —
/// PE-arch match is necessary but not sufficient (corrupt/stub binaries can
/// still fail). One-shot, cached effectively by the caller's usage pattern.
fn spawn_version_ok(candidate: &Path) -> bool {
    std::process::Command::new(candidate)
        .arg("-version")
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null())
        .status()
        .map(|s| s.success())
        .unwrap_or(false)
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
    fn autodetect_finds_real_ffmpeg_on_this_host() {
        // On a developer machine with FFmpeg installed (WinGet/Program Files),
        // autodetect should locate a real, arch-matching, spawnable binary.
        // On CI without FFmpeg it returns None — both are valid, so we only
        // assert the contract: a returned path must exist + spawn cleanly.
        let found = autodetect_program("ffprobe", std::env::consts::EXE_SUFFIX, 256 * 1024);
        if let Some(path) = found {
            assert!(Path::new(&path).is_file(), "autodetected path missing: {path}");
            assert!(spawn_version_ok(Path::new(&path)), "autodetected ffprobe won't run: {path}");
            // PE machine must match the host (the whole point of the 216 fix).
            if let Some(host) = host_pe_machine() {
                assert_eq!(read_pe_machine(Path::new(&path)), Some(host),
                    "autodetected ffprobe PE arch ≠ host — would hit os error 216");
            }
        }
        // No assertion when None — a clean machine without FFmpeg is fine; the
        // caller falls back to the bare name and surfaces a clear error.
    }

    #[test]
    fn read_pe_machine_rejects_non_pe_file() {
        let dir = tempdir().unwrap();
        let not_pe = dir.path().join("notpe.exe");
        fs::write(&not_pe, b"this is not a PE image").unwrap();
        assert_eq!(read_pe_machine(&not_pe), None);
        // A tiny file can't even hold the MZ + PE offset.
        let tiny = dir.path().join("tiny.exe");
        fs::write(&tiny, b"MZ").unwrap();
        assert_eq!(read_pe_machine(&tiny), None);
    }

    #[test]
    fn host_pe_machine_matches_constants() {
        // The mapping is the load-bearing check against os error 216 — pin it.
        match std::env::consts::ARCH {
            "x86_64" => assert_eq!(host_pe_machine(), Some(0x8664)),
            "aarch64" => assert_eq!(host_pe_machine(), Some(0xAA64)),
            "x86" => assert_eq!(host_pe_machine(), Some(0x014C)),
            _ => {}
        }
    }

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
