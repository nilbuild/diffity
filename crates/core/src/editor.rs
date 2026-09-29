use std::path::Path;
use std::process::{Command, Stdio};

use crate::error::{AppError, Result};
use crate::tree::resolve_in_repo;

pub const KNOWN_EDITORS: [&str; 3] = ["code", "cursor", "zed"];

fn spawn_detached(mut cmd: Command) -> std::io::Result<()> {
    let mut child = cmd
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()?;
    std::thread::spawn(move || {
        let _ = child.wait();
    });
    Ok(())
}

fn editor_command(editor: &str, file: &str, line: Option<u32>) -> Command {
    let mut cmd = Command::new(editor);
    let target = match line {
        Some(l) if l > 0 => format!("{file}:{l}"),
        _ => file.to_string(),
    };
    match editor {
        "code" | "cursor" => {
            cmd.arg("--goto").arg(target);
        }
        "zed" => {
            cmd.arg(target);
        }
        _ => {
            cmd.arg(file);
        }
    }
    cmd
}

fn system_open(file: &str) -> std::io::Result<()> {
    let opener = if cfg!(target_os = "macos") {
        "open"
    } else if cfg!(target_os = "windows") {
        "explorer"
    } else {
        "xdg-open"
    };
    let mut cmd = Command::new(opener);
    cmd.arg(file);
    spawn_detached(cmd)
}

/// An empty path or "." means the repository root.
fn resolve_target(repo: &Path, path: &str) -> Result<std::path::PathBuf> {
    let trimmed = path.trim();
    if trimmed.is_empty() || trimmed == "." {
        return Ok(repo.canonicalize()?);
    }
    resolve_in_repo(repo, trimmed)
}

/// Opens `path` in `editor` (`code`, `cursor`, `zed`, or any command taking a file argument),
/// falling back to the OS default opener when no editor is given or it cannot be launched.
pub fn open_in_editor(repo: &Path, path: &str, line: Option<u32>, editor: Option<&str>) -> Result<()> {
    let full = resolve_target(repo, path)?;
    let file = full.to_string_lossy().into_owned();
    let editor = editor.map(str::trim).filter(|e| !e.is_empty());
    if let Some(editor) = editor {
        let mut cmd = if full.is_dir() {
            let mut cmd = Command::new(editor);
            cmd.arg(&file);
            cmd
        } else {
            editor_command(editor, &file, line)
        };
        cmd.current_dir(repo);
        if spawn_detached(cmd).is_ok() {
            return Ok(());
        }
        tracing::warn!("failed to launch editor '{editor}', falling back to system opener");
    }
    system_open(&file).map_err(|e| AppError::io(format!("failed to open {path}: {e}")))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn empty_or_dot_path_resolves_to_repo_root() {
        let dir = std::env::temp_dir().join(format!("diffity-editor-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let root = dir.canonicalize().unwrap();
        assert_eq!(resolve_target(&dir, "").unwrap(), root);
        assert_eq!(resolve_target(&dir, " . ").unwrap(), root);
        assert!(resolve_target(&dir, "../outside").is_err());
        std::fs::remove_dir_all(&dir).ok();
    }
}
