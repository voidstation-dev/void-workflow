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
        let run_dir = app_dir.join("runs").join(run_id.to_string());
        let output_dir = run_dir.join("output");
        let temp_dir = run_dir.join("temp");

        fs::create_dir_all(&output_dir)
            .map_err(|e| AppError::Internal(format!("Failed to create output dir: {}", e)))?;
        fs::create_dir_all(&temp_dir)
            .map_err(|e| AppError::Internal(format!("Failed to create temp dir: {}", e)))?;

        Ok(Self { base_dir: run_dir })
    }

    pub fn run_dir(&self) -> &PathBuf {
        &self.base_dir
    }

    pub fn get_output_path(&self, filename: &str) -> PathBuf {
        self.base_dir.join("output").join(filename)
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

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[test]
    fn test_artifact_manager_creates_dirs() {
        let temp = tempdir().unwrap();
        let am = ArtifactManager::new(temp.path(), 123).unwrap();

        assert!(temp.path().join("runs").join("123").join("output").exists());
        assert!(temp.path().join("runs").join("123").join("temp").exists());

        let out_file = am.get_output_path("test.txt");
        assert_eq!(
            out_file,
            temp.path()
                .join("runs")
                .join("123")
                .join("output")
                .join("test.txt")
        );
    }
}
