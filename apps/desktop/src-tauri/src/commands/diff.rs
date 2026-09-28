use diffity_core::types::{DiffResult, FileVersions, ResolvedRef};
use diffity_core::AppError;

#[tauri::command]
pub async fn resolve_ref(repo_path: String, r#ref: String) -> Result<ResolvedRef, AppError> {
    let _ = (repo_path, r#ref);
    Err(AppError::not_implemented())
}

#[tauri::command]
pub async fn get_diff(repo_path: String, r#ref: String, ignore_whitespace: bool) -> Result<DiffResult, AppError> {
    let _ = (repo_path, r#ref, ignore_whitespace);
    Err(AppError::not_implemented())
}

#[tauri::command]
pub async fn get_file_versions(
    repo_path: String,
    r#ref: String,
    path: String,
    old_path: Option<String>,
) -> Result<FileVersions, AppError> {
    let _ = (repo_path, r#ref, path, old_path);
    Err(AppError::not_implemented())
}

#[tauri::command]
pub async fn diff_fingerprint(repo_path: String, r#ref: String) -> Result<String, AppError> {
    let _ = (repo_path, r#ref);
    Err(AppError::not_implemented())
}

#[tauri::command]
pub async fn revert_file(repo_path: String, path: String) -> Result<(), AppError> {
    let _ = (repo_path, path);
    Err(AppError::not_implemented())
}

#[tauri::command]
pub async fn revert_hunk(repo_path: String, patch: String) -> Result<(), AppError> {
    let _ = (repo_path, patch);
    Err(AppError::not_implemented())
}
