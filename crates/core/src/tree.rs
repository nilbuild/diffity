use std::collections::{BTreeMap, HashSet};
use std::path::{Component, Path, PathBuf};

use base64::Engine;

use crate::error::{AppError, Result};
use crate::git;
use crate::types::{FileContent, TreeEntry, TreeEntryKind};

pub const MAX_TEXT_BYTES: u64 = 2 * 1024 * 1024;
pub const MAX_BASE64_BYTES: u64 = 50 * 1024 * 1024;
pub const MAX_TREE_ENTRIES: usize = 200_000;
const SNIFF_BYTES: usize = 8 * 1024;

pub fn is_binary(data: &[u8]) -> bool {
    data[..data.len().min(SNIFF_BYTES)].contains(&0)
}

/// Joins a repo-relative path onto `repo`, rejecting absolute paths, `..` and symlinks escaping the repo.
/// Returns `not_found` when the path does not exist.
pub fn resolve_in_repo(repo: &Path, rel: &str) -> Result<PathBuf> {
    let rel_path = Path::new(rel);
    if rel.is_empty() {
        return Err(AppError::invalid("empty path"));
    }
    for c in rel_path.components() {
        match c {
            Component::Normal(_) | Component::CurDir => {}
            _ => return Err(AppError::invalid(format!("path '{rel}' escapes the repository"))),
        }
    }
    let joined = repo.join(rel_path);
    if std::fs::symlink_metadata(&joined).is_err() {
        return Err(AppError::not_found(format!("{rel} not found")));
    }
    let root = repo.canonicalize()?;
    let Ok(canonical) = joined.canonicalize() else {
        return Err(AppError::not_found(format!("{rel} not found")));
    };
    if !canonical.starts_with(&root) {
        return Err(AppError::invalid(format!("path '{rel}' escapes the repository")));
    }
    Ok(canonical)
}

fn push_with_parents(files: impl IntoIterator<Item = String>) -> Vec<TreeEntry> {
    let mut entries: BTreeMap<String, TreeEntryKind> = BTreeMap::new();
    for file in files {
        let mut idx = 0;
        while let Some(pos) = file[idx..].find('/') {
            let dir = &file[..idx + pos];
            entries.entry(dir.to_string()).or_insert(TreeEntryKind::Dir);
            idx += pos + 1;
        }
        entries.insert(file, TreeEntryKind::File);
        if entries.len() >= MAX_TREE_ENTRIES {
            break;
        }
    }
    entries
        .into_iter()
        .map(|(path, kind)| TreeEntry { path, kind })
        .collect()
}

fn git_tree(repo: &Path) -> Result<Vec<TreeEntry>> {
    let listed = git::run_bytes(repo, &["ls-files", "-z", "--cached", "--others", "--exclude-standard"])?;
    let deleted: HashSet<String> = git::split_nul(&git::run_bytes(repo, &["ls-files", "-z", "--deleted"])?)
        .into_iter()
        .collect();
    let files = git::split_nul(&listed)
        .into_iter()
        .filter(|f| !f.ends_with('/') && !deleted.contains(f));
    Ok(push_with_parents(files))
}

fn walk_tree(root: &Path) -> Vec<TreeEntry> {
    let walker = ignore::WalkBuilder::new(root)
        .hidden(false)
        .require_git(false)
        .filter_entry(|e| e.file_name() != ".git")
        .build();
    let files = walker
        .filter_map(|e| e.ok())
        .filter(|e| e.file_type().is_some_and(|t| !t.is_dir()))
        .filter_map(|e| {
            let rel = e.path().strip_prefix(root).ok()?;
            let parts: Vec<String> = rel
                .components()
                .map(|c| c.as_os_str().to_string_lossy().into_owned())
                .collect();
            Some(parts.join("/"))
        })
        .take(MAX_TREE_ENTRIES);
    push_with_parents(files)
}

/// Files (tracked + untracked-not-ignored) and derived directories, sorted by path.
/// Non-git folders are walked respecting `.gitignore`/`.ignore` files.
pub fn list_tree(repo: &Path) -> Result<Vec<TreeEntry>> {
    if !repo.is_dir() {
        return Err(AppError::not_found(format!("{} is not a directory", repo.display())));
    }
    if git::is_git_repo(repo) {
        return git_tree(repo);
    }
    Ok(walk_tree(repo))
}

pub fn read_file(repo: &Path, path: &str) -> Result<FileContent> {
    let full = resolve_in_repo(repo, path)?;
    let meta = std::fs::metadata(&full)?;
    if !meta.is_file() {
        return Err(AppError::invalid(format!("{path} is not a file")));
    }
    let size = meta.len();
    if size > MAX_TEXT_BYTES {
        let mut head = vec![0u8; SNIFF_BYTES];
        let n = {
            use std::io::Read;
            let mut f = std::fs::File::open(&full)?;
            f.read(&mut head)?
        };
        head.truncate(n);
        return Ok(FileContent {
            path: path.to_string(),
            contents: None,
            binary: is_binary(&head),
            size,
        });
    }
    let data = std::fs::read(&full)?;
    if is_binary(&data) {
        return Ok(FileContent {
            path: path.to_string(),
            contents: None,
            binary: true,
            size,
        });
    }
    Ok(FileContent {
        path: path.to_string(),
        contents: Some(String::from_utf8_lossy(&data).into_owned()),
        binary: false,
        size,
    })
}

pub fn read_file_base64(repo: &Path, path: &str) -> Result<String> {
    let full = resolve_in_repo(repo, path)?;
    if !full.is_file() {
        return Err(AppError::invalid(format!("{path} is not a file")));
    }
    let size = std::fs::metadata(&full)?.len();
    if size > MAX_BASE64_BYTES {
        return Err(AppError::invalid(format!("{path} is too large to preview ({size} bytes)")));
    }
    let data = std::fs::read(&full)?;
    Ok(base64::engine::general_purpose::STANDARD.encode(data))
}
