use std::io::Write;
use std::path::{Path, PathBuf};
use std::process::{Command, Output, Stdio};

use crate::error::{AppError, Result};
use crate::types::{Branch, Commit, GitStatus, RepoInfo};

pub const EMPTY_TREE_SHA: &str = "4b825dc642cb6eb9a060e54bf8d69288fbee4904";

fn base_command(repo: &Path) -> Command {
    let mut cmd = Command::new("git");
    cmd.current_dir(repo)
        .arg("-c")
        .arg("core.quotepath=off")
        .env("GIT_TERMINAL_PROMPT", "0")
        .env("GIT_OPTIONAL_LOCKS", "0")
        .env("LC_ALL", "C")
        .stdin(Stdio::null());
    cmd
}

fn spawn_output(mut cmd: Command) -> Result<Output> {
    cmd.output().map_err(|e| {
        if e.kind() == std::io::ErrorKind::NotFound {
            return AppError::git_failed("git executable not found on PATH");
        }
        AppError::io(format!("failed to run git: {e}"))
    })
}

fn failure(args: &[&str], out: &Output) -> AppError {
    let stderr = String::from_utf8_lossy(&out.stderr);
    let cmd = args.first().copied().unwrap_or("");
    AppError::git_failed(format!("git {cmd} failed: {}", stderr.trim()))
}

/// Runs git and returns raw stdout bytes, erroring on non-zero exit.
pub fn run_bytes(repo: &Path, args: &[&str]) -> Result<Vec<u8>> {
    let mut cmd = base_command(repo);
    cmd.args(args);
    let out = spawn_output(cmd)?;
    if !out.status.success() {
        return Err(failure(args, &out));
    }
    Ok(out.stdout)
}

/// Runs git and returns stdout (lossy UTF-8), erroring on non-zero exit.
pub fn run(repo: &Path, args: &[&str]) -> Result<String> {
    let bytes = run_bytes(repo, args)?;
    Ok(String::from_utf8_lossy(&bytes).into_owned())
}

/// Runs git and returns stdout trimmed of trailing whitespace.
pub fn run_trim(repo: &Path, args: &[&str]) -> Result<String> {
    Ok(run(repo, args)?.trim_end().to_string())
}

/// Runs git; returns `Some(stdout)` on success and `None` on non-zero exit.
pub fn run_opt(repo: &Path, args: &[&str]) -> Result<Option<Vec<u8>>> {
    let mut cmd = base_command(repo);
    cmd.args(args);
    let out = spawn_output(cmd)?;
    if !out.status.success() {
        return Ok(None);
    }
    Ok(Some(out.stdout))
}

/// Runs git accepting any of `ok_codes` as success.
pub fn run_with_codes(repo: &Path, args: &[&str], ok_codes: &[i32]) -> Result<Vec<u8>> {
    let mut cmd = base_command(repo);
    cmd.args(args);
    let out = spawn_output(cmd)?;
    let code = out.status.code().unwrap_or(-1);
    if !ok_codes.contains(&code) {
        return Err(failure(args, &out));
    }
    Ok(out.stdout)
}

/// Runs git feeding `input` on stdin.
pub fn run_with_stdin(repo: &Path, args: &[&str], input: &[u8]) -> Result<String> {
    let mut cmd = base_command(repo);
    cmd.args(args)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    let mut child = cmd
        .spawn()
        .map_err(|e| AppError::io(format!("failed to run git: {e}")))?;
    if let Some(mut stdin) = child.stdin.take() {
        stdin.write_all(input)?;
    }
    let out = child.wait_with_output()?;
    if !out.status.success() {
        return Err(failure(args, &out));
    }
    Ok(String::from_utf8_lossy(&out.stdout).into_owned())
}

pub fn split_nul(bytes: &[u8]) -> Vec<String> {
    bytes
        .split(|b| *b == 0)
        .filter(|s| !s.is_empty())
        .map(|s| String::from_utf8_lossy(s).into_owned())
        .collect()
}

/// Returns the repository top-level for `path`, or `None` when it is not inside a git work tree.
pub fn find_repo_root(path: &Path) -> Result<Option<PathBuf>> {
    if !path.is_dir() {
        return Ok(None);
    }
    let Some(out) = run_opt(path, &["rev-parse", "--show-toplevel"])? else {
        return Ok(None);
    };
    let root = String::from_utf8_lossy(&out).trim().to_string();
    if root.is_empty() {
        return Ok(None);
    }
    Ok(Some(PathBuf::from(root)))
}

pub fn is_git_repo(path: &Path) -> bool {
    matches!(find_repo_root(path), Ok(Some(_)))
}

pub fn require_repo(path: &Path) -> Result<()> {
    if !path.is_dir() {
        return Err(AppError::not_found(format!("{} does not exist", path.display())));
    }
    if !is_git_repo(path) {
        return Err(AppError::not_a_repo(format!("{} is not a git repository", path.display())));
    }
    Ok(())
}

pub fn head_sha(repo: &Path) -> Result<Option<String>> {
    verify_commit(repo, "HEAD")
}

pub fn has_commits(repo: &Path) -> Result<bool> {
    Ok(head_sha(repo)?.is_some())
}

/// `rev-parse --verify <rev>^{commit}`; `None` if it does not resolve.
pub fn verify_commit(repo: &Path, rev: &str) -> Result<Option<String>> {
    if rev.is_empty() || rev.starts_with('-') {
        return Ok(None);
    }
    let spec = format!("{rev}^{{commit}}");
    let out = run_opt(repo, &["rev-parse", "--verify", "--quiet", &spec])?;
    Ok(out.map(|b| String::from_utf8_lossy(&b).trim().to_string()).filter(|s| !s.is_empty()))
}

pub fn merge_base(repo: &Path, a: &str, b: &str) -> Result<Option<String>> {
    let out = run_opt(repo, &["merge-base", a, b])?;
    Ok(out.map(|b| String::from_utf8_lossy(&b).trim().to_string()).filter(|s| !s.is_empty()))
}

pub fn current_branch(repo: &Path) -> Result<Option<String>> {
    let out = run_opt(repo, &["symbolic-ref", "--quiet", "--short", "HEAD"])?;
    Ok(out.map(|b| String::from_utf8_lossy(&b).trim().to_string()).filter(|s| !s.is_empty()))
}

pub fn remote_url(repo: &Path) -> Result<Option<String>> {
    let out = run_opt(repo, &["remote", "get-url", "origin"])?;
    if let Some(url) = out.map(|b| String::from_utf8_lossy(&b).trim().to_string()).filter(|s| !s.is_empty()) {
        return Ok(Some(url));
    }
    let remotes = run_opt(repo, &["remote"])?.unwrap_or_default();
    let first = String::from_utf8_lossy(&remotes).lines().next().map(str::to_string);
    let Some(first) = first else {
        return Ok(None);
    };
    let out = run_opt(repo, &["remote", "get-url", &first])?;
    Ok(out.map(|b| String::from_utf8_lossy(&b).trim().to_string()).filter(|s| !s.is_empty()))
}

fn dir_name(path: &Path) -> String {
    path.file_name()
        .map(|n| n.to_string_lossy().into_owned())
        .unwrap_or_else(|| path.to_string_lossy().into_owned())
}

/// Inspects `path`. Git repos are reported at their top-level; plain folders are returned as-is.
pub fn repo_info(path: &Path) -> Result<RepoInfo> {
    if !path.is_dir() {
        return Err(AppError::not_found(format!("{} is not a directory", path.display())));
    }
    let Some(root) = find_repo_root(path)? else {
        let canonical = path.canonicalize()?;
        return Ok(RepoInfo {
            path: canonical.to_string_lossy().into_owned(),
            name: dir_name(&canonical),
            is_git: false,
            branch: None,
            head_sha: None,
            remote_url: None,
        });
    };
    Ok(RepoInfo {
        path: root.to_string_lossy().into_owned(),
        name: dir_name(&root),
        is_git: true,
        branch: current_branch(&root)?,
        head_sha: head_sha(&root)?,
        remote_url: remote_url(&root)?,
    })
}

const LOG_FORMAT: &str = "--format=%H%x1f%h%x1f%s%x1f%an%x1f%aI%x1e";

fn parse_log(out: &str) -> Vec<Commit> {
    out.split('\x1e')
        .map(|r| r.trim_matches(|c| c == '\n' || c == '\r'))
        .filter(|r| !r.is_empty())
        .filter_map(|r| {
            let mut parts = r.split('\x1f');
            Some(Commit {
                sha: parts.next()?.to_string(),
                short_sha: parts.next()?.to_string(),
                subject: parts.next()?.to_string(),
                author: parts.next()?.to_string(),
                date: parts.next()?.to_string(),
            })
        })
        .collect()
}

fn log_query(repo: &Path, limit: u32, filter: Option<String>) -> Result<Vec<Commit>> {
    let n = format!("-n{limit}");
    let mut args = vec!["log", LOG_FORMAT, &n];
    let filter_arg;
    if let Some(f) = filter {
        filter_arg = f;
        args.push(&filter_arg);
        args.push("-i");
        args.push("--fixed-strings");
    }
    let Some(out) = run_opt(repo, &args)? else {
        return Ok(Vec::new());
    };
    Ok(parse_log(&String::from_utf8_lossy(&out)))
}

/// Lists commits reachable from HEAD. `search` matches the message (case-insensitive) or the author.
pub fn list_commits(repo: &Path, count: u32, skip: u32, search: Option<&str>) -> Result<Vec<Commit>> {
    require_repo(repo)?;
    if !has_commits(repo)? {
        return Ok(Vec::new());
    }
    let search = search.map(str::trim).filter(|s| !s.is_empty());
    let Some(search) = search else {
        let n = format!("-n{count}");
        let s = format!("--skip={skip}");
        let out = run(repo, &["log", LOG_FORMAT, &n, &s])?;
        return Ok(parse_log(&out));
    };
    let limit = count.saturating_add(skip);
    let mut merged = log_query(repo, limit, Some(format!("--grep={search}")))?;
    merged.extend(log_query(repo, limit, Some(format!("--author={search}")))?);
    let lower = search.to_lowercase();
    if lower.len() >= 4 && lower.chars().all(|c| c.is_ascii_hexdigit()) {
        if let Some(sha) = verify_commit(repo, &lower)? {
            let out = run(repo, &["log", LOG_FORMAT, "-n1", &sha])?;
            merged.extend(parse_log(&out));
        }
    }
    merged.sort_by(|a, b| b.date.cmp(&a.date));
    let mut seen = std::collections::HashSet::new();
    merged.retain(|c| seen.insert(c.sha.clone()));
    Ok(merged
        .into_iter()
        .skip(skip as usize)
        .take(count as usize)
        .collect())
}

fn parse_track(track: &str) -> (u32, u32) {
    let mut ahead = 0;
    let mut behind = 0;
    for part in track.split(',') {
        let part = part.trim();
        if let Some(n) = part.strip_prefix("ahead ") {
            ahead = n.trim().parse().unwrap_or(0);
        } else if let Some(n) = part.strip_prefix("behind ") {
            behind = n.trim().parse().unwrap_or(0);
        }
    }
    (ahead, behind)
}

pub fn list_branches(repo: &Path) -> Result<Vec<Branch>> {
    require_repo(repo)?;
    let out = run(
        repo,
        &[
            "for-each-ref",
            "--format=%(refname)%1f%(refname:short)%1f%(HEAD)%1f%(upstream:short)%1f%(upstream:track,nobracket)%1f%(symref)",
            "--sort=-committerdate",
            "refs/heads",
            "refs/remotes",
        ],
    )?;
    let mut branches = Vec::new();
    for line in out.lines() {
        let parts: Vec<&str> = line.split('\x1f').collect();
        if parts.len() < 6 {
            continue;
        }
        let (full, short, head, upstream, track, symref) =
            (parts[0], parts[1], parts[2], parts[3], parts[4], parts[5]);
        if !symref.is_empty() {
            continue;
        }
        let is_remote = full.starts_with("refs/remotes/");
        let (ahead, behind) = parse_track(track);
        branches.push(Branch {
            name: short.to_string(),
            is_remote,
            is_current: head == "*",
            upstream: (!upstream.is_empty()).then(|| upstream.to_string()),
            ahead,
            behind,
        });
    }
    branches.sort_by_key(|b| (!b.is_current, b.is_remote));
    Ok(branches)
}

pub fn status(repo: &Path) -> Result<GitStatus> {
    require_repo(repo)?;
    let out = run_bytes(
        repo,
        &["status", "--porcelain=v2", "--branch", "-z", "--untracked-files=all"],
    )?;
    let records = split_nul(&out);
    let mut st = GitStatus {
        branch: None,
        upstream: None,
        ahead: 0,
        behind: 0,
        staged: 0,
        unstaged: 0,
        untracked: 0,
        dirty: false,
    };
    let mut i = 0;
    while i < records.len() {
        let rec = &records[i];
        i += 1;
        if let Some(header) = rec.strip_prefix("# ") {
            if let Some(head) = header.strip_prefix("branch.head ") {
                if head != "(detached)" {
                    st.branch = Some(head.to_string());
                }
            } else if let Some(up) = header.strip_prefix("branch.upstream ") {
                st.upstream = Some(up.to_string());
            } else if let Some(ab) = header.strip_prefix("branch.ab ") {
                for part in ab.split_whitespace() {
                    if let Some(n) = part.strip_prefix('+') {
                        st.ahead = n.parse().unwrap_or(0);
                    } else if let Some(n) = part.strip_prefix('-') {
                        st.behind = n.parse().unwrap_or(0);
                    }
                }
            }
            continue;
        }
        let kind = rec.chars().next().unwrap_or(' ');
        match kind {
            '1' | '2' => {
                let xy: Vec<char> = rec.chars().skip(2).take(2).collect();
                if xy.first().is_some_and(|c| *c != '.') {
                    st.staged += 1;
                }
                if xy.get(1).is_some_and(|c| *c != '.') {
                    st.unstaged += 1;
                }
                if kind == '2' {
                    i += 1;
                }
            }
            'u' => st.unstaged += 1,
            '?' => st.untracked += 1,
            _ => {}
        }
    }
    st.dirty = st.staged + st.unstaged + st.untracked > 0;
    Ok(st)
}

/// Untracked, not-ignored files relative to the repo root.
pub fn untracked_files(repo: &Path) -> Result<Vec<String>> {
    let out = run_bytes(repo, &["ls-files", "-z", "--others", "--exclude-standard"])?;
    Ok(split_nul(&out))
}

/// `git show <rev>:<path>`; `None` when the path does not exist at that revision.
pub fn show_file(repo: &Path, rev: &str, path: &str) -> Result<Option<Vec<u8>>> {
    let spec = format!("{rev}:{path}");
    run_opt(repo, &["show", "--no-textconv", &spec])
}
