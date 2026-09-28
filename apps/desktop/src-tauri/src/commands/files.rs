use diffity_core::types::{FileContent, TreeEntry};
use diffity_core::AppError;

#[tauri::command]
pub async fn list_tree(repo_path: String) -> Result<Vec<TreeEntry>, AppError> {
    let _ = repo_path;
    Err(AppError::not_implemented())
}

#[tauri::command]
pub async fn read_file(repo_path: String, path: String) -> Result<FileContent, AppError> {
    let _ = (repo_path, path);
    Err(AppError::not_implemented())
}

#[tauri::command]
pub async fn read_file_base64(repo_path: String, path: String) -> Result<String, AppError> {
    let _ = (repo_path, path);
    Err(AppError::not_implemented())
}
