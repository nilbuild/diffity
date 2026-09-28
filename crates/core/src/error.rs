use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Clone, Debug, thiserror::Error)]
#[serde(rename_all = "camelCase")]
#[error("{code}: {message}")]
pub struct AppError {
    pub code: String,
    pub message: String,
}

pub type Result<T, E = AppError> = std::result::Result<T, E>;

impl AppError {
    pub fn new(code: impl Into<String>, message: impl Into<String>) -> Self {
        Self {
            code: code.into(),
            message: message.into(),
        }
    }

    pub fn not_implemented() -> Self {
        Self::new("not_implemented", "not implemented")
    }

    pub fn not_found(message: impl Into<String>) -> Self {
        Self::new("not_found", message)
    }

    pub fn invalid(message: impl Into<String>) -> Self {
        Self::new("invalid", message)
    }

    pub fn internal(message: impl Into<String>) -> Self {
        Self::new("internal", message)
    }

    pub fn not_a_repo(message: impl Into<String>) -> Self {
        Self::new("not_a_repo", message)
    }

    pub fn invalid_ref(message: impl Into<String>) -> Self {
        Self::new("invalid_ref", message)
    }

    pub fn git_failed(message: impl Into<String>) -> Self {
        Self::new("git_failed", message)
    }

    pub fn io(message: impl Into<String>) -> Self {
        Self::new("io", message)
    }
}

impl From<std::io::Error> for AppError {
    fn from(e: std::io::Error) -> Self {
        Self::new("io", e.to_string())
    }
}

impl From<anyhow::Error> for AppError {
    fn from(e: anyhow::Error) -> Self {
        Self::new("internal", format!("{e:#}"))
    }
}

impl From<rusqlite::Error> for AppError {
    fn from(e: rusqlite::Error) -> Self {
        Self::new("db", e.to_string())
    }
}

impl From<serde_json::Error> for AppError {
    fn from(e: serde_json::Error) -> Self {
        Self::new("json", e.to_string())
    }
}
