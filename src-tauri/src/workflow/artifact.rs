use crate::error::{AppError, Result};
use crate::workflow::model::ArtifactRef;
use std::fs;
use std::path::{Path, PathBuf};
use uuid::Uuid;

#[derive(Clone)]
pub struct ArtifactManager {
    base_dir: PathBuf,
}

impl ArtifactManager {
    pub fn new(app_dir: &Path, run_id: i64) -> Result<Self> {
        Self::new_in(&app_dir.join("runs"), run_id)
    }

    pub fn new_in(runs_root: &Path, run_id: i64) -> Result<Self> {
        let run_dir = runs_root.join(run_id.to_string());
        fs::create_dir_all(run_dir.join("output"))?;
        fs::create_dir_all(run_dir.join("temp"))?;
        Ok(Self { base_dir: run_dir })
    }

    pub fn run_dir(&self) -> &PathBuf {
        &self.base_dir
    }

    pub fn get_output_path(&self, filename: &str) -> PathBuf {
        self.base_dir.join("output").join(filename)
    }

    pub fn resolve_output_path(&self, filename: &str, behavior: &str) -> Result<Option<PathBuf>> {
        resolve_in_directory(&self.base_dir.join("output"), filename, behavior)
    }

    pub fn resolve_destination(
        &self,
        directory: &str,
        filename: &str,
        behavior: &str,
    ) -> Result<Option<PathBuf>> {
        if directory.trim().is_empty() {
            return self.resolve_output_path(filename, behavior);
        }
        resolve_in_directory(Path::new(directory), filename, behavior)
    }

    pub fn get_temp_path(&self, filename: &str) -> PathBuf {
        self.base_dir.join("temp").join(filename)
    }

    pub fn describe(
        &self,
        path: &Path,
        kind: &str,
        created_by_node: &str,
        mime: Option<&str>,
    ) -> Result<ArtifactRef> {
        let size = fs::metadata(path)?.len();
        Ok(ArtifactRef {
            id: Uuid::new_v4().to_string(),
            kind: kind.into(),
            path: path.to_string_lossy().into_owned(),
            mime: mime.map(str::to_string),
            size,
            metadata: serde_json::Value::Null,
            created_by_node: created_by_node.into(),
        })
    }
}

fn resolve_in_directory(
    directory: &Path,
    filename: &str,
    behavior: &str,
) -> Result<Option<PathBuf>> {
    fs::create_dir_all(directory)?;
    let filename = sanitize_filename(filename)?;
    let desired = directory.join(&filename);
    if !desired.exists() || behavior == "overwrite" {
        return Ok(Some(desired));
    }
    if behavior == "skip" {
        return Ok(None);
    }

    let stem = desired
        .file_stem()
        .and_then(|value| value.to_str())
        .unwrap_or("output");
    let extension = desired.extension().and_then(|value| value.to_str());
    for index in 1..=10_000 {
        let candidate_name = match extension {
            Some(extension) => format!("{stem}-{index}.{extension}"),
            None => format!("{stem}-{index}"),
        };
        let candidate = desired.with_file_name(candidate_name);
        if !candidate.exists() {
            return Ok(Some(candidate));
        }
    }

    Err(AppError::Internal(
        "Could not allocate a unique output filename.".into(),
    ))
}

fn sanitize_filename(filename: &str) -> Result<String> {
    let trimmed = filename.trim();
    if trimmed.is_empty() || trimmed == "." || trimmed == ".." {
        return Err(AppError::validation(
            "INVALID_FILENAME",
            "Output filename cannot be empty.",
            serde_json::Value::Null,
        ));
    }
    let contains_separator = trimmed
        .chars()
        .any(|character| matches!(character, '/' | '\\' | '\0'));
    if Path::new(trimmed).components().count() != 1 || contains_separator {
        return Err(AppError::validation(
            "INVALID_FILENAME",
            "Output filename must not contain directories or path traversal.",
            serde_json::json!({ "filename": trimmed }),
        ));
    }
    Ok(trimmed.into())
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[test]
    fn test_artifact_manager_creates_dirs() {
        let temp = tempdir().unwrap();
        let manager = ArtifactManager::new(temp.path(), 123).unwrap();

        assert!(temp.path().join("runs/123/output").exists());
        assert!(temp.path().join("runs/123/temp").exists());
        assert_eq!(
            manager.get_output_path("test.txt"),
            temp.path().join("runs/123/output/test.txt")
        );
    }

    #[test]
    fn output_collision_policy_is_deterministic_and_blocks_traversal() {
        let temp = tempdir().unwrap();
        let manager = ArtifactManager::new(temp.path(), 1).unwrap();
        let first = manager
            .resolve_output_path("result.txt", "rename")
            .unwrap()
            .unwrap();
        fs::write(&first, "first").unwrap();

        assert!(manager
            .resolve_output_path("result.txt", "skip")
            .unwrap()
            .is_none());
        assert!(manager
            .resolve_output_path("../result.txt", "rename")
            .is_err());
        assert!(manager
            .resolve_output_path("result.txt", "rename")
            .unwrap()
            .unwrap()
            .ends_with("result-1.txt"));
    }
}
