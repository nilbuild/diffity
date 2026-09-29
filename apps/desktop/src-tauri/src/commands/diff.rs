use std::path::Path;

use diffity_core::diff;
use diffity_core::types::{DiffResult, FileVersions, ResolvedRef};
use diffity_core::AppError;

use super::repo::blocking;

#[tauri::command]
pub async fn resolve_ref(repo_path: String, r#ref: String) -> Result<ResolvedRef, AppError> {
    blocking(move || diff::resolve_ref(Path::new(&repo_path), &r#ref)).await
}

#[tauri::command]
pub async fn get_diff(repo_path: String, r#ref: String, ignore_whitespace: bool) -> Result<DiffResult, AppError> {
    blocking(move || diff::get_diff(Path::new(&repo_path), &r#ref, ignore_whitespace)).await
}

#[tauri::command]
pub async fn get_file_patch(
    repo_path: String,
    r#ref: String,
    path: String,
    old_path: Option<String>,
    ignore_whitespace: bool,
) -> Result<String, AppError> {
    blocking(move || diff::get_file_patch(Path::new(&repo_path), &r#ref, &path, old_path.as_deref(), ignore_whitespace)).await
}

#[tauri::command]
pub async fn get_file_versions(
    repo_path: String,
    r#ref: String,
    path: String,
    old_path: Option<String>,
) -> Result<FileVersions, AppError> {
    blocking(move || diff::get_file_versions(Path::new(&repo_path), &r#ref, &path, old_path.as_deref())).await
}

#[tauri::command]
pub async fn diff_fingerprint(repo_path: String, r#ref: String) -> Result<String, AppError> {
    blocking(move || diff::diff_fingerprint(Path::new(&repo_path), &r#ref)).await
}

#[tauri::command]
pub async fn revert_file(repo_path: String, path: String) -> Result<(), AppError> {
    blocking(move || diff::revert_file(Path::new(&repo_path), &path)).await
}

#[tauri::command]
pub async fn revert_hunk(repo_path: String, patch: String) -> Result<(), AppError> {
    blocking(move || diff::revert_hunk(Path::new(&repo_path), &patch)).await
}
