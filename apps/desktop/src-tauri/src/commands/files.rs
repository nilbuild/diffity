use std::path::Path;

use diffity_core::tree;
use diffity_core::types::{FileContent, TreeEntry};
use diffity_core::AppError;

use super::repo::blocking;

#[tauri::command]
pub async fn list_tree(repo_path: String) -> Result<Vec<TreeEntry>, AppError> {
    blocking(move || tree::list_tree(Path::new(&repo_path))).await
}

#[tauri::command]
pub async fn read_file(repo_path: String, path: String) -> Result<FileContent, AppError> {
    blocking(move || tree::read_file(Path::new(&repo_path), &path)).await
}

#[tauri::command]
pub async fn read_file_base64(repo_path: String, path: String) -> Result<String, AppError> {
    blocking(move || tree::read_file_base64(Path::new(&repo_path), &path)).await
}
