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
        return Err(crate::remote::not_github());
    }
    Ok(out.output)
}

pub async fn branch_exists(repo: &str, branch: &str) -> Result<bool> {
    let refname = format!("refs/heads/{branch}");
    Ok(run(repo, &["show-ref", "--verify", "--quiet", &refname]).await?.ok)
}
