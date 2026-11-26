use std::path::Path;

use crate::core::suggestion::{self, AppliedSuggestion};
use crate::core::{diff, diffignore};
use crate::core::types::{BinaryVersions, DiffResult, FileVersions, ResolvedRef};
use crate::core::AppError;

use super::repo::blocking;

#[tauri::command]
pub async fn resolve_ref(repo_path: String, r#ref: String) -> Result<ResolvedRef, AppError> {
    blocking(move || diff::resolve_ref(Path::new(&repo_path), &r#ref)).await
}

#[tauri::command]
pub async fn ref_in_checkout(repo_path: String, r#ref: String) -> Result<bool, AppError> {
    blocking(move || diff::in_checkout(Path::new(&repo_path), &r#ref)).await
}

#[tauri::command]
pub async fn get_diff(
    repo_path: String,
    r#ref: String,
    ignore_whitespace: bool,
    show_ignored: Option<bool>,
) -> Result<DiffResult, AppError> {
    let opts = diff::DiffOptions {
        show_ignored: show_ignored.unwrap_or(false),
        ..diff::DiffOptions::new(ignore_whitespace)
    };
    blocking(move || diff::get_diff_with(Path::new(&repo_path), &r#ref, &opts)).await
}

/// The repo's local "hide from diffs" list (gitignore syntax), kept in the git dir.
#[tauri::command]
pub async fn get_diff_ignore_rules(repo_path: String) -> Result<String, AppError> {
    blocking(move || diffignore::read_local_rules(Path::new(&repo_path))).await
}

#[tauri::command]
pub async fn set_diff_ignore_rules(repo_path: String, rules: String) -> Result<(), AppError> {
    blocking(move || diffignore::write_local_rules(Path::new(&repo_path), &rules)).await
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
pub async fn get_binary_versions(
    repo_path: String,
    r#ref: String,
    path: String,
    old_path: Option<String>,
    with_data: bool,
) -> Result<BinaryVersions, AppError> {
    blocking(move || diff::get_binary_versions(Path::new(&repo_path), &r#ref, &path, old_path.as_deref(), with_data)).await
}

#[tauri::command]
pub async fn diff_is_empty(repo_path: String, r#ref: String) -> Result<bool, AppError> {
    blocking(move || diff::diff_is_empty(Path::new(&repo_path), &r#ref)).await
}

#[tauri::command]
pub async fn diff_fingerprint(
    repo_path: String,
    r#ref: String,
    show_ignored: Option<bool>,
) -> Result<String, AppError> {
    blocking(move || diff::diff_fingerprint(Path::new(&repo_path), &r#ref, show_ignored.unwrap_or(false))).await
}

/// `ref` is the view the file was reverted from: Unstaged restores from the index, the others from HEAD.
#[tauri::command]
pub async fn revert_file(repo_path: String, path: String, r#ref: Option<String>) -> Result<(), AppError> {
    blocking(move || diff::revert_file_for(Path::new(&repo_path), &path, r#ref.as_deref().unwrap_or("work"))).await
}

#[tauri::command]
pub async fn apply_suggestion(
    repo_path: String,
    path: String,
    start_line: u32,
    end_line: u32,
    expected: String,
    replacement: String,
) -> Result<AppliedSuggestion, AppError> {
    blocking(move || suggestion::apply(Path::new(&repo_path), &path, start_line, end_line, &expected, &replacement)).await
}

#[tauri::command]
pub async fn revert_hunk(repo_path: String, patch: String) -> Result<(), AppError> {
    blocking(move || diff::revert_hunk(Path::new(&repo_path), &patch)).await
}

#[tauri::command]
pub async fn stage_hunk(repo_path: String, patch: String) -> Result<(), AppError> {
    blocking(move || diff::stage_hunk(Path::new(&repo_path), &patch)).await
}

#[tauri::command]
pub async fn unstage_hunk(repo_path: String, patch: String) -> Result<(), AppError> {
    blocking(move || diff::unstage_hunk(Path::new(&repo_path), &patch)).await
}

fn file_paths(path: &str, old_path: Option<&str>) -> Vec<String> {
    let mut paths = vec![path.to_string()];
    if let Some(old) = old_path.filter(|old| !old.is_empty() && *old != path) {
        paths.push(old.to_string());
    }
    paths
}

/// Stages the whole file; `old_path` (a rename's source) is staged with it.
#[tauri::command]
pub async fn stage_file(repo_path: String, path: String, old_path: Option<String>) -> Result<(), AppError> {
    blocking(move || {
        let paths = file_paths(&path, old_path.as_deref());
        let refs: Vec<&str> = paths.iter().map(String::as_str).collect();
        diff::stage_file(Path::new(&repo_path), &refs)
    })
    .await
}

#[tauri::command]
pub async fn unstage_file(repo_path: String, path: String, old_path: Option<String>) -> Result<(), AppError> {
    blocking(move || {
        let paths = file_paths(&path, old_path.as_deref());
        let refs: Vec<&str> = paths.iter().map(String::as_str).collect();
        diff::unstage_file(Path::new(&repo_path), &refs)
    })
    .await
}
