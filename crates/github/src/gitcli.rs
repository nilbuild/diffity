use std::process::Stdio;

use diffity_core::{AppError, Result};
use tokio::process::Command;

pub struct GitOutput {
    pub ok: bool,
    pub output: String,
}

pub async fn run(repo: &str, args: &[&str]) -> Result<GitOutput> {
    let out = Command::new("git")
        .args(["-c", "core.quotepath=off"])
        .args(args)
        .current_dir(repo)
        .env("GIT_TERMINAL_PROMPT", "0")
        .env("GIT_ASKPASS", "")
        .env("GCM_INTERACTIVE", "never")
        .stdin(Stdio::null())
        .output()
        .await
        .map_err(|e| AppError::new("git", format!("failed to run git: {e}")))?;
    let stdout = String::from_utf8_lossy(&out.stdout);
    let stderr = String::from_utf8_lossy(&out.stderr);
    let output = match (stdout.trim().is_empty(), stderr.trim().is_empty()) {
        (false, false) => format!("{}\n{}", stdout.trim_end(), stderr.trim_end()),
        (false, true) => stdout.trim_end().to_string(),
        _ => stderr.trim_end().to_string(),
    };
    Ok(GitOutput {
        ok: out.status.success(),
        output,
    })
}

pub async fn run_ok(repo: &str, args: &[&str]) -> Result<String> {
    let out = run(repo, args).await?;
    if !out.ok {
        return Err(AppError::new("git", out.output));
    }
    Ok(out.output)
}

pub async fn current_branch(repo: &str) -> Result<Option<String>> {
    let out = run(repo, &["symbolic-ref", "--quiet", "--short", "HEAD"]).await?;
    if !out.ok || out.output.is_empty() {
        return Ok(None);
    }
    Ok(Some(out.output))
}

pub async fn head_sha(repo: &str) -> Result<String> {
    run_ok(repo, &["rev-parse", "HEAD"]).await
}

pub async fn is_dirty(repo: &str) -> Result<bool> {
    let out = run_ok(repo, &["status", "--porcelain", "--untracked-files=no"]).await?;
    Ok(!out.trim().is_empty())
}

/// Paths whose working-tree (or index) content differs from HEAD, including untracked files.
pub async fn changed_files(repo: &str) -> Result<std::collections::HashSet<String>> {
    let tracked = run_ok(repo, &["diff", "HEAD", "--name-only", "--no-renames"]).await?;
    let untracked = run_ok(repo, &["ls-files", "--others", "--exclude-standard"]).await?;
    Ok(tracked
        .lines()
        .chain(untracked.lines())
        .map(str::trim)
        .filter(|l| !l.is_empty())
        .map(str::to_string)
        .collect())
}

pub async fn ensure_clean(repo: &str, action: &str) -> Result<()> {
    if is_dirty(repo).await? {
        return Err(AppError::new(
            "dirty",
            format!("Working tree has uncommitted changes. Commit or stash them before {action}."),
        ));
    }
    Ok(())
}

pub async fn has_upstream(repo: &str) -> Result<bool> {
    let out = run(repo, &["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"]).await?;
    Ok(out.ok)
}

pub async fn origin_url(repo: &str) -> Result<String> {
    let out = run(repo, &["remote", "get-url", "origin"]).await?;
    if !out.ok {
        return Err(AppError::new(
            "not_github",
            "This repository has no `origin` remote. Add a github.com remote to use pull requests.",
        ));
    }
    Ok(out.output)
}

pub async fn branch_exists(repo: &str, branch: &str) -> Result<bool> {
    let refname = format!("refs/heads/{branch}");
    Ok(run(repo, &["show-ref", "--verify", "--quiet", &refname]).await?.ok)
}

async fn stash_top(repo: &str) -> Result<Option<String>> {
    let out = run(repo, &["rev-parse", "--verify", "--quiet", "refs/stash"]).await?;
    Ok(out.ok.then(|| out.output.trim().to_string()).filter(|sha| !sha.is_empty()))
}

/// `git stash push --include-untracked -m <message>`; returns the new stash commit, `None` when there was nothing to stash.
pub async fn stash_push(repo: &str, message: &str) -> Result<Option<String>> {
    let before = stash_top(repo).await?;
    run_ok(repo, &["stash", "push", "--include-untracked", "-m", message]).await?;
    let after = stash_top(repo).await?;
    if after.is_none() || after == before {
        return Ok(None);
    }
    Ok(after)
}

/// Pops the stash entry whose commit is `sha` (restoring the index when possible).
pub async fn stash_restore(repo: &str, sha: &str) -> Result<()> {
    let list = run_ok(repo, &["stash", "list", "--format=%H"]).await?;
    let index = list.lines().position(|line| line.trim() == sha).ok_or_else(|| {
        AppError::not_found("That stash no longer exists. It may have been restored or dropped already.")
    })?;
    let entry = format!("stash@{{{index}}}");
    if run(repo, &["stash", "pop", "--index", &entry]).await?.ok {
        return Ok(());
    }
    if is_dirty(repo).await? {
        return Err(AppError::new(
            "stash_conflict",
            format!("Could not restore {entry} cleanly. Resolve the conflicts, then run `git stash drop {entry}`."),
        ));
    }
    run_ok(repo, &["stash", "pop", &entry]).await?;
    Ok(())
}

/// Switches to a local branch or commit; refuses when tracked files have uncommitted changes.
pub async fn checkout(repo: &str, target: &str) -> Result<()> {
    let target = target.trim();
    if target.is_empty() || target.starts_with('-') {
        return Err(AppError::invalid("invalid branch name"));
    }
    ensure_clean(repo, "switching branches").await?;
    run_ok(repo, &["checkout", target, "--"]).await?;
    Ok(())
}

/// `https://github.com/o/r`, `git@github.com:o/r.git` or `o/r` → a clone URL and the folder name it creates.
pub fn clone_target(input: &str) -> Result<(String, String)> {
    let input = input.trim().trim_end_matches('/');
    if input.is_empty() || input.starts_with('-') || input.chars().any(char::is_whitespace) {
        return Err(AppError::invalid("Enter a repository URL, e.g. https://github.com/owner/repo"));
    }
    let url = if input.contains("://") || input.starts_with("git@") {
        input.to_string()
    } else if input.split('/').count() == 2 && !input.starts_with('.') {
        format!("https://github.com/{input}.git")
    } else {
        return Err(AppError::invalid("Enter a repository URL, e.g. https://github.com/owner/repo"));
    };
    let name = url
        .rsplit(['/', ':'])
        .next()
        .unwrap_or_default()
        .trim_end_matches(".git")
        .to_string();
    if name.is_empty() || name == "." || name == ".." {
        return Err(AppError::invalid("Could not work out a folder name from that URL"));
    }
    Ok((url, name))
}

/// Clones `input` into a new folder inside `parent`; returns the new repository path.
pub async fn clone(parent: &str, input: &str) -> Result<String> {
    let (url, name) = clone_target(input)?;
    let dest = std::path::Path::new(parent).join(&name);
    if dest.exists() {
        return Err(AppError::new("exists", format!("{} already exists", dest.display())));
    }
    run_ok(parent, &["clone", "--", &url, &name]).await?;
    Ok(dest.to_string_lossy().into_owned())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn clone_target_accepts_common_forms() {
        assert_eq!(
            clone_target("https://github.com/o/repo").unwrap(),
            ("https://github.com/o/repo".to_string(), "repo".to_string())
        );
        assert_eq!(
            clone_target("git@github.com:o/repo.git").unwrap(),
            ("git@github.com:o/repo.git".to_string(), "repo".to_string())
        );
        assert_eq!(
            clone_target("o/repo").unwrap(),
            ("https://github.com/o/repo.git".to_string(), "repo".to_string())
        );
        assert!(clone_target("--upload-pack=x").is_err());
        assert!(clone_target("just words").is_err());
    }

    fn git(dir: &std::path::Path, args: &[&str]) {
        let status = std::process::Command::new("git")
            .args(args)
            .current_dir(dir)
            .env("GIT_AUTHOR_NAME", "t")
            .env("GIT_AUTHOR_EMAIL", "t@t")
            .env("GIT_COMMITTER_NAME", "t")
            .env("GIT_COMMITTER_EMAIL", "t@t")
            .status()
            .unwrap();
        assert!(status.success(), "git {args:?}");
    }

    fn scratch() -> tempfile::TempDir {
        let dir = tempfile::tempdir().unwrap();
        git(dir.path(), &["init", "-q", "-b", "main"]);
        std::fs::write(dir.path().join("a.txt"), "one\n").unwrap();
        git(dir.path(), &["add", "."]);
        git(dir.path(), &["commit", "-qm", "init"]);
        git(dir.path(), &["branch", "other"]);
        dir
    }

    #[tokio::test]
    async fn stash_round_trip_with_untracked() {
        let dir = scratch();
        let repo = dir.path().to_str().unwrap();
        assert_eq!(stash_push(repo, "nothing").await.unwrap(), None);
        std::fs::write(dir.path().join("a.txt"), "two\n").unwrap();
        std::fs::write(dir.path().join("new.txt"), "n\n").unwrap();
        git(dir.path(), &["add", "a.txt"]);
        let sha = stash_push(repo, "diffity: test").await.unwrap().expect("stashed");
        assert!(!is_dirty(repo).await.unwrap());
        assert!(!dir.path().join("new.txt").exists());
        checkout(repo, "other").await.unwrap();
        assert_eq!(current_branch(repo).await.unwrap().as_deref(), Some("other"));
        checkout(repo, "main").await.unwrap();
        stash_restore(repo, &sha).await.unwrap();
        assert_eq!(std::fs::read_to_string(dir.path().join("a.txt")).unwrap(), "two\n");
        assert!(dir.path().join("new.txt").exists());
        let staged = run_ok(repo, &["diff", "--cached", "--name-only"]).await.unwrap();
        assert_eq!(staged, "a.txt");
        assert_eq!(stash_restore(repo, &sha).await.unwrap_err().code, "not_found");
    }

    #[tokio::test]
    async fn checkout_refuses_dirty_tree_and_options() {
        let dir = scratch();
        let repo = dir.path().to_str().unwrap();
        assert_eq!(checkout(repo, "--orphan").await.unwrap_err().code, "invalid");
        std::fs::write(dir.path().join("a.txt"), "dirty\n").unwrap();
        assert_eq!(checkout(repo, "other").await.unwrap_err().code, "dirty");
    }
}
