use serde::{Serialize, Serializer};
use serde_json::Value;
use thiserror::Error;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ErrorPayload {
    pub code: String,
    pub title: String,
    pub message: String,
    pub hint: Option<String>,
    pub details: Value,
    pub retryable: bool,
}

#[derive(Error, Debug)]
pub enum AppError {
    #[error("Database error: {0}")]
    Db(#[from] rusqlite::Error),

    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),

    #[error("{}", .0.message)]
    Structured(Box<ErrorPayload>),

    #[error("Internal error: {0}")]
    Internal(String),

    #[error("Cancelled: {0}")]
    Cancelled(String),
}

impl AppError {
    pub fn validation(code: &str, message: impl Into<String>, details: Value) -> Self {
        Self::Structured(Box::new(ErrorPayload {
            code: code.into(),
            title: "Workflow needs attention".into(),
            message: message.into(),
            hint: Some("Open Problems, fix the highlighted items, then run again.".into()),
            details,
            retryable: false,
        }))
    }

    pub fn environment(code: &str, title: &str, message: impl Into<String>, hint: &str) -> Self {
        Self::Structured(Box::new(ErrorPayload {
            code: code.into(),
            title: title.into(),
            message: message.into(),
            hint: Some(hint.into()),
            details: Value::Null,
            retryable: false,
        }))
    }

    pub fn external(code: &str, title: &str, message: impl Into<String>, retryable: bool) -> Self {
        Self::Structured(Box::new(ErrorPayload {
            code: code.into(),
            title: title.into(),
            message: message.into(),
            hint: retryable.then(|| "Check the connection and try again.".into()),
            details: Value::Null,
            retryable,
        }))
    }

    pub fn payload(&self) -> ErrorPayload {
        match self {
            Self::Structured(payload) => payload.as_ref().clone(),
            Self::Db(error) => ErrorPayload {
                code: "DATABASE_ERROR".into(),
                title: "Database operation failed".into(),
                message: error.to_string(),
                hint: Some("Retry the operation. If it keeps failing, check the application data directory.".into()),
                details: Value::Null,
                retryable: true,
            },
            Self::Io(error) => ErrorPayload {
                code: "IO_ERROR".into(),
                title: "File operation failed".into(),
                message: error.to_string(),
                hint: Some("Check that the path exists and is writable.".into()),
                details: Value::Null,
                retryable: true,
            },
            Self::Cancelled(message) => ErrorPayload {
                code: "CANCELLED".into(),
                title: "Operation cancelled".into(),
                message: message.clone(),
                hint: None,
                details: Value::Null,
                retryable: true,
            },
            Self::Internal(message) => ErrorPayload {
                code: "INTERNAL_ERROR".into(),
                title: "Unexpected runtime error".into(),
                message: message.clone(),
                hint: Some("Review the run log and retry.".into()),
                details: Value::Null,
                retryable: false,
            },
        }
    }
}

impl Serialize for AppError {
    fn serialize<S>(&self, serializer: S) -> std::result::Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        self.payload().serialize(serializer)
    }
}

pub type Result<T> = std::result::Result<T, AppError>;

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn structured_errors_keep_actionable_fields() {
        let error = AppError::environment(
            "FFMPEG_NOT_FOUND",
            "FFmpeg was not found",
            "No executable is configured.",
            "Install FFmpeg or set its path in Settings.",
        );
        let json = serde_json::to_value(error).unwrap();
        assert_eq!(json["code"], "FFMPEG_NOT_FOUND");
        assert_eq!(json["retryable"], false);
        assert!(json["hint"].as_str().unwrap().contains("Settings"));
    }
}
