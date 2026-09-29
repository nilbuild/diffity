//! Path completion for the quick-open palette: `~` expansion, child folders of the typed directory, and git
//! detection that only touches the file system (no `git` process per entry).

use std::fs;
use std::path::{Path, PathBuf};

use serde::Serialize;

const MAX_SUGGESTIONS: usize = 60;

#[derive(Serialize, Clone, Debug, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct DirSuggestion {
    pub path: String,
    pub name: String,
    pub is_git: bool,
    pub branch: Option<String>,
}

#[derive(Serialize, Clone, Debug, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct DirSuggestions {
    /// The directory whose children are listed (absolute, no trailing slash except `/`).
    pub dir: String,
    /// The partial last segment the suggestions were filtered by.
    pub segment: String,
    pub entries: Vec<DirSuggestion>,
}

/// `~`, `~/x` and paths relative to home become absolute; absolute paths are kept.
pub fn expand_path(input: &str, home: &Path) -> PathBuf {
    let input = input.trim();
    if input.is_empty() || input == "~" {
        return home.to_path_buf();
    }
    if let Some(rest) = input.strip_prefix("~/") {
        return home.join(rest);
    }
    if input.starts_with('/') {
        return PathBuf::from(input);
    }
    home.join(input)
}

/// Splits typed input into the directory to list and the partial segment after the last `/`.
pub fn split_prefix(input: &str, home: &Path) -> (PathBuf, String) {
    let trimmed = input.trim();
    if trimmed.is_empty() || trimmed == "~" {
        return (home.to_path_buf(), String::new());
    }
    if trimmed.ends_with('/') {
        return (expand_path(trimmed, home), String::new());
    }
    match trimmed.rfind('/') {
        Some(index) => {
            let dir = &trimmed[..=index];
            (expand_path(dir, home), trimmed[index + 1..].to_string())
        }
        None => (home.to_path_buf(), trimmed.to_string()),
    }
}

/// The branch checked out in `repo` (`HEAD` file), or a short sha when detached; `None` if it is not a repo.
pub fn git_info(repo: &Path) -> Option<Option<String>> {
    let dot_git = repo.join(".git");
    let git_dir = if dot_git.is_dir() {
        dot_git
    } else if dot_git.is_file() {
        let content = fs::read_to_string(&dot_git).ok()?;
        let target = content.trim().strip_prefix("gitdir:")?.trim();
        let target = PathBuf::from(target);
        if target.is_absolute() { target } else { repo.join(target) }
    } else {
        return None;
    };
    let head = fs::read_to_string(git_dir.join("HEAD")).ok();
    let branch = head.and_then(|head| {
        let head = head.trim();
        match head.strip_prefix("ref: refs/heads/") {
            Some(name) => Some(name.to_string()),
            None => head.get(..7).map(str::to_string),
        }
    });
    Some(branch)
}

pub fn list_dir_suggestions(input: &str, home: &Path) -> DirSuggestions {
    let (dir, segment) = split_prefix(input, home);
    let needle = segment.to_lowercase();
    let show_hidden = segment.starts_with('.');
    let mut entries: Vec<DirSuggestion> = Vec::new();
    if let Ok(read) = fs::read_dir(&dir) {
        for entry in read.flatten() {
            let name = entry.file_name().to_string_lossy().into_owned();
            if name.starts_with('.') && !show_hidden {
                continue;
            }
            if !needle.is_empty() && !name.to_lowercase().starts_with(&needle) {
                continue;
            }
            let path = entry.path();
            let is_dir = entry.file_type().map(|kind| kind.is_dir() || (kind.is_symlink() && path.is_dir())).unwrap_or(false);
            if !is_dir {
                continue;
            }
            let git = git_info(&path);
            entries.push(DirSuggestion {
                path: path.to_string_lossy().into_owned(),
                name,
                is_git: git.is_some(),
                branch: git.flatten(),
            });
        }
    }
    entries.sort_by(|a, b| b.is_git.cmp(&a.is_git).then_with(|| a.name.to_lowercase().cmp(&b.name.to_lowercase())));
    entries.truncate(MAX_SUGGESTIONS);
    DirSuggestions { dir: dir.to_string_lossy().into_owned(), segment, entries }
}

/// The nearest ancestor (or the folder itself) that is a git work tree.
pub fn resolve_repo_root(path: &Path) -> Option<PathBuf> {
    let mut current = Some(path);
    while let Some(dir) = current {
        if git_info(dir).is_some() {
            return Some(dir.to_path_buf());
        }
        current = dir.parent();
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn expands_home_and_relative_paths() {
        let home = Path::new("/Users/me");
        assert_eq!(expand_path("~", home), PathBuf::from("/Users/me"));
        assert_eq!(expand_path("~/lab/x", home), PathBuf::from("/Users/me/lab/x"));
        assert_eq!(expand_path("lab", home), PathBuf::from("/Users/me/lab"));
        assert_eq!(expand_path("/tmp/a", home), PathBuf::from("/tmp/a"));
    }

    #[test]
    fn splits_directory_and_segment() {
        let home = Path::new("/Users/me");
        assert_eq!(split_prefix("~/la", home), (PathBuf::from("/Users/me/"), "la".to_string()));
        assert_eq!(split_prefix("~/lab/", home), (PathBuf::from("/Users/me/lab/"), String::new()));
        assert_eq!(split_prefix("", home), (PathBuf::from("/Users/me"), String::new()));
        assert_eq!(split_prefix("/tmp/fo", home), (PathBuf::from("/tmp/"), "fo".to_string()));
    }

    #[test]
    fn lists_matching_folders_and_marks_repos() {
        let home = tempfile::tempdir().unwrap();
        let base = home.path();
        fs::create_dir_all(base.join("lab/alpha/.git")).unwrap();
        fs::write(base.join("lab/alpha/.git/HEAD"), "ref: refs/heads/main\n").unwrap();
        fs::create_dir_all(base.join("lab/beta")).unwrap();
        fs::create_dir_all(base.join("lab/.hidden")).unwrap();
        fs::write(base.join("lab/file.txt"), "x").unwrap();

        let all = list_dir_suggestions("~/lab/", base);
        let names: Vec<&str> = all.entries.iter().map(|entry| entry.name.as_str()).collect();
        assert_eq!(names, ["alpha", "beta"]);
        assert!(all.entries[0].is_git);
        assert_eq!(all.entries[0].branch.as_deref(), Some("main"));
        assert!(!all.entries[1].is_git);

        let filtered = list_dir_suggestions("~/lab/b", base);
        assert_eq!(filtered.entries.len(), 1);
        assert_eq!(filtered.segment, "b");

        let hidden = list_dir_suggestions("~/lab/.h", base);
        assert_eq!(hidden.entries.len(), 1);
    }

    #[test]
    fn finds_repo_root_from_subfolder() {
        let home = tempfile::tempdir().unwrap();
        let repo = home.path().join("r");
        fs::create_dir_all(repo.join(".git")).unwrap();
        fs::write(repo.join(".git/HEAD"), "ref: refs/heads/dev\n").unwrap();
        fs::create_dir_all(repo.join("src/deep")).unwrap();
        assert_eq!(resolve_repo_root(&repo.join("src/deep")), Some(repo.clone()));
        assert_eq!(resolve_repo_root(home.path()), None);
    }
}
