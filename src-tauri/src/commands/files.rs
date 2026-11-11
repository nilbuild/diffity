use std::path::Path;

use crate::core::search::{self, SearchOptions, SearchResult};
use crate::core::tree;
use crate::core::types::{FileContent, TreeEntry};
use crate::core::AppError;

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

#[tauri::command]
pub async fn search_code(repo_path: String, options: SearchOptions) -> Result<SearchResult, AppError> {
    blocking(move || search::search_code(Path::new(&repo_path), &options)).await
}
