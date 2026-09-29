use std::collections::HashMap;
use std::path::Path;
use std::time::UNIX_EPOCH;

use sha2::{Digest, Sha256};

use crate::error::{AppError, Result};
use crate::git::{self, EMPTY_TREE_SHA};
use crate::tree::{is_binary, resolve_in_repo};
use crate::types::{DiffFileSummary, DiffResult, FileStatus, FileVersions, ResolvedRef, Side};

pub const WORKING_TREE_REFS: [&str; 4] = ["work", ".", "staged", "unstaged"];

/// Where one side of a diff reads file contents from.
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum Source {
    Commit(String),
    EmptyTree,
    Index,
    WorkTree,
}

/// A ref string turned into concrete `git diff` arguments.
#[derive(Clone, Debug)]
pub struct DiffPlan {
    pub resolved: ResolvedRef,
    pub args: Vec<String>,
    pub include_untracked: bool,
    pub old: Source,
    pub new: Source,
}

fn split_range<'a>(r: &'a str, sep: &str) -> Option<(&'a str, &'a str)> {
    let idx = r.find(sep)?;
    let left = &r[..idx];
    let right = &r[idx + sep.len()..];
    Some((
        if left.is_empty() { "HEAD" } else { left },
        if right.is_empty() { "HEAD" } else { right },
    ))
}

fn verify(repo: &Path, rev: &str) -> Result<String> {
    git::verify_commit(repo, rev)?.ok_or_else(|| AppError::invalid_ref(format!("unknown revision '{rev}'")))
}

/// `<sha>~1` / `<sha>^` of a root commit has no parent; those ranges diff the commit against the empty tree.
fn root_parent_of(repo: &Path, left: &str) -> Result<Option<String>> {
    let Some(child) = left.strip_suffix("~1").or_else(|| left.strip_suffix('^')) else {
        return Ok(None);
    };
    let Some(sha) = git::verify_commit(repo, child)? else {
        return Ok(None);
    };
    let parents = git::run_trim(repo, &["rev-list", "--parents", "-n1", &sha])?;
    if parents.split_whitespace().count() > 1 {
        return Ok(None);
    }
    Ok(Some(sha))
}

fn root_commit_plan(r: &str, sha: String) -> DiffPlan {
    DiffPlan {
        resolved: ResolvedRef {
            r#ref: r.to_string(),
            label: r.to_string(),
            can_revert: false,
            base_sha: None,
            head_sha: Some(sha.clone()),
        },
        args: vec![EMPTY_TREE_SHA.to_string(), sha.clone()],
        include_untracked: false,
        old: Source::EmptyTree,
        new: Source::Commit(sha),
    }
}

fn range_plan(repo: &Path, r: &str, left: &str, right: &str) -> Result<DiffPlan> {
    if git::verify_commit(repo, left)?.is_none() {
        if let Some(root) = root_parent_of(repo, left)? {
            let right_sha = verify(repo, right)?;
            if right_sha == root {
                return Ok(root_commit_plan(r, root));
            }
        }
    }
    let left_sha = verify(repo, left)?;
    let right_sha = verify(repo, right)?;
    let base = git::merge_base(repo, &left_sha, &right_sha)?
        .ok_or_else(|| AppError::invalid_ref(format!("'{left}' and '{right}' have no common ancestor")))?;
    Ok(DiffPlan {
        resolved: ResolvedRef {
            r#ref: r.to_string(),
            label: r.to_string(),
            can_revert: false,
            base_sha: Some(base.clone()),
            head_sha: Some(right_sha.clone()),
        },
        args: vec![base.clone(), right_sha.clone()],
        include_untracked: false,
        old: Source::Commit(base),
        new: Source::Commit(right_sha),
    })
}

/// Resolves a ref string (`work`, `.`, `staged`, `unstaged`, `<ref>`, `<a>..<b>`, `<a>...<b>`).
///
/// - `work`/`.`: HEAD vs working tree, including untracked files.
/// - `staged`: HEAD vs index. `unstaged`: index vs working tree, including untracked files.
/// - `<ref>`: merge-base(ref, HEAD) vs working tree, including untracked files.
/// - `<a>..<b>` and `<a>...<b>`: merge-base(a, b) vs b.
///
/// Repos without commits diff against the empty tree.
pub fn plan(repo: &Path, r: &str) -> Result<DiffPlan> {
    git::require_repo(repo)?;
    let r = r.trim();
    if r.is_empty() {
        return Err(AppError::invalid_ref("empty ref"));
    }
    let head = git::head_sha(repo)?;
    let base_source = head.clone().map(Source::Commit).unwrap_or(Source::EmptyTree);
    let base_arg = head.clone().unwrap_or_else(|| EMPTY_TREE_SHA.to_string());
    let working = |label: &str, args: Vec<String>, untracked: bool, old: Source, new: Source| DiffPlan {
        resolved: ResolvedRef {
            r#ref: r.to_string(),
            label: label.to_string(),
            can_revert: true,
            base_sha: head.clone(),
            head_sha: head.clone(),
        },
        args,
        include_untracked: untracked,
        old,
        new,
    };
    match r {
        "work" | "." => {
            return Ok(working(
                "Uncommitted changes",
                vec![base_arg],
                true,
                base_source,
                Source::WorkTree,
            ))
        }
        "staged" => {
            return Ok(working(
                "Staged changes",
                vec!["--cached".to_string(), base_arg],
                false,
                base_source,
                Source::Index,
            ))
        }
        "unstaged" => {
            return Ok(working("Unstaged changes", vec![], true, Source::Index, Source::WorkTree))
        }
        _ => {}
    }
    if let Some((left, right)) = split_range(r, "...") {
        return range_plan(repo, r, left, right);
    }
    if let Some((left, right)) = split_range(r, "..") {
        return range_plan(repo, r, left, right);
    }
    let sha = verify(repo, r)?;
    let Some(head) = head else {
        return Err(AppError::invalid_ref("repository has no commits"));
    };
    let base = git::merge_base(repo, &sha, "HEAD")?.unwrap_or(sha);
    Ok(DiffPlan {
        resolved: ResolvedRef {
            r#ref: r.to_string(),
            label: format!("Changes from {r}"),
            can_revert: false,
            base_sha: Some(base.clone()),
            head_sha: Some(head),
        },
        args: vec![base.clone()],
        include_untracked: true,
        old: Source::Commit(base),
        new: Source::WorkTree,
    })
}

pub fn resolve_ref(repo: &Path, r: &str) -> Result<ResolvedRef> {
    Ok(plan(repo, r)?.resolved)
}

fn diff_args<'a>(plan: &'a DiffPlan, extra: &[&'a str], ignore_whitespace: bool) -> Vec<&'a str> {
    let mut args = vec![
        "diff",
        "--no-color",
        "--no-ext-diff",
        "--no-textconv",
        "--no-relative",
        "--src-prefix=a/",
        "--dst-prefix=b/",
        "-M",
    ];
    if ignore_whitespace {
        args.push("-w");
    }
    args.extend_from_slice(extra);
    args.extend(plan.args.iter().map(String::as_str));
    args
}

fn untracked_for(repo: &Path, plan: &DiffPlan) -> Result<Vec<String>> {
    if !plan.include_untracked {
        return Ok(Vec::new());
    }
    Ok(git::untracked_files(repo)?
        .into_iter()
        .filter(|f| !f.ends_with('/'))
        .collect())
}

fn untracked_patch(repo: &Path, file: &str) -> Result<String> {
    let out = git::run_with_codes(
        repo,
        &[
            "diff",
            "--no-index",
            "--no-color",
            "--no-ext-diff",
            "--no-textconv",
            "--src-prefix=a/",
            "--dst-prefix=b/",
            "--",
            "/dev/null",
            file,
        ],
        &[0, 1],
    )?;
    Ok(String::from_utf8_lossy(&out).into_owned())
}

fn parse_name_status(bytes: &[u8]) -> Vec<(FileStatus, Option<String>, String)> {
    let tokens = git::split_nul(bytes);
    let mut out = Vec::new();
    let mut i = 0;
    while i < tokens.len() {
        let code = tokens[i].as_str();
        i += 1;
        let letter = code.chars().next().unwrap_or('M');
        if letter == 'R' || letter == 'C' {
            if i + 1 >= tokens.len() {
                break;
            }
            let old = tokens[i].clone();
            let new = tokens[i + 1].clone();
            i += 2;
            let status = if letter == 'R' { FileStatus::Renamed } else { FileStatus::Copied };
            out.push((status, Some(old), new));
            continue;
        }
        let Some(path) = tokens.get(i).cloned() else {
            break;
        };
        i += 1;
        let status = match letter {
            'A' => FileStatus::Added,
            'D' => FileStatus::Deleted,
            _ => FileStatus::Modified,
        };
        out.push((status, None, path));
    }
    out
}

fn parse_numstat(bytes: &[u8]) -> HashMap<String, (u32, u32, bool)> {
    let tokens = git::split_nul(bytes);
    let mut map = HashMap::new();
    let mut i = 0;
    while i < tokens.len() {
        let mut parts = tokens[i].splitn(3, '\t');
        i += 1;
        let adds = parts.next().unwrap_or("");
        let dels = parts.next().unwrap_or("");
        let mut path = parts.next().unwrap_or("").to_string();
        if path.is_empty() {
            if i + 1 >= tokens.len() {
                break;
            }
            path = tokens[i + 1].clone();
            i += 2;
        }
        let binary = adds == "-" && dels == "-";
        map.insert(path, (adds.parse().unwrap_or(0), dels.parse().unwrap_or(0), binary));
    }
    map
}

fn count_lines(data: &[u8]) -> u32 {
    if data.is_empty() {
        return 0;
    }
    let newlines = data.iter().filter(|b| **b == b'\n').count() as u32;
    if data.last() == Some(&b'\n') {
        return newlines;
    }
    newlines + 1
}

fn untracked_summary(repo: &Path, file: &str) -> DiffFileSummary {
    let data = std::fs::read(repo.join(file)).unwrap_or_default();
    let binary = is_binary(&data);
    DiffFileSummary {
        path: file.to_string(),
        old_path: None,
        status: FileStatus::Untracked,
        additions: if binary { 0 } else { count_lines(&data) },
        deletions: 0,
        binary,
        old_line_count: None,
    }
}

fn file_summaries(repo: &Path, plan: &DiffPlan, untracked: &[String], ignore_whitespace: bool) -> Result<Vec<DiffFileSummary>> {
    let ns = git::run_bytes(repo, &diff_args(plan, &["--name-status", "-z"], false))?;
    let num = git::run_bytes(repo, &diff_args(plan, &["--numstat", "-z"], ignore_whitespace))?;
    let counts = parse_numstat(&num);
    let mut files: Vec<DiffFileSummary> = parse_name_status(&ns)
        .into_iter()
        .map(|(status, old_path, path)| {
            let (additions, deletions, binary) = counts.get(&path).copied().unwrap_or((0, 0, false));
            DiffFileSummary {
                path,
                old_path,
                status,
                additions,
                deletions,
                binary,
                old_line_count: None,
            }
        })
        .collect();
    files.extend(untracked.iter().map(|f| untracked_summary(repo, f)));
    Ok(files)
}

fn fingerprint_with(repo: &Path, plan: &DiffPlan, untracked: &[String]) -> Result<String> {
    let stat = git::run_bytes(repo, &diff_args(plan, &["--stat"], false))?;
    let mut hasher = Sha256::new();
    hasher.update(&stat);
    hasher.update([0u8]);
    for f in untracked {
        hasher.update(f.as_bytes());
        hasher.update([0u8]);
    }
    hasher.update(git::head_sha(repo)?.unwrap_or_default().as_bytes());
    if plan.new == Source::WorkTree {
        let names = git::run_bytes(repo, &diff_args(plan, &["--name-only", "-z"], false))?;
        let mut paths = git::split_nul(&names);
        paths.extend(untracked.iter().cloned());
        for p in paths {
            let Ok(meta) = std::fs::symlink_metadata(repo.join(&p)) else {
                continue;
            };
            let mtime = meta
                .modified()
                .ok()
                .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
                .map(|d| d.as_nanos())
                .unwrap_or(0);
            hasher.update(format!("{p}:{}:{mtime}\0", meta.len()).as_bytes());
        }
    }
    Ok(format!("{:x}", hasher.finalize()))
}

/// Cheap change detector: sha256 of `git diff --stat`, the untracked list, HEAD and working-tree file stats.
pub fn diff_fingerprint(repo: &Path, r: &str) -> Result<String> {
    let plan = plan(repo, r)?;
    let untracked = untracked_for(repo, &plan)?;
    fingerprint_with(repo, &plan, &untracked)
}

/// Full diff for a ref: unified patch (untracked files appended), per-file summaries and fingerprint.
pub fn get_diff(repo: &Path, r: &str, ignore_whitespace: bool) -> Result<DiffResult> {
    let plan = plan(repo, r)?;
    let untracked = untracked_for(repo, &plan)?;
    let mut patch = git::run(repo, &diff_args(&plan, &[], ignore_whitespace))?;
    for file in &untracked {
        let p = untracked_patch(repo, file)?;
        if p.is_empty() {
            continue;
        }
        if !patch.is_empty() && !patch.ends_with('\n') {
            patch.push('\n');
        }
        patch.push_str(&p);
    }
    let mut files = file_summaries(repo, &plan, &untracked, ignore_whitespace)?;
    fill_old_line_counts(repo, &plan, &mut files)?;
    let fingerprint = fingerprint_with(repo, &plan, &untracked)?;
    Ok(DiffResult {
        resolved: plan.resolved,
        files,
        patch,
        fingerprint,
    })
}

/// Parses `git cat-file --batch` output into one line count per requested object (`None` when missing).
fn parse_batch_line_counts(out: &[u8], expected: usize) -> Vec<Option<u32>> {
    let mut counts = Vec::with_capacity(expected);
    let mut pos = 0;
    while counts.len() < expected && pos < out.len() {
        let Some(nl) = out[pos..].iter().position(|b| *b == b'\n') else {
            break;
        };
        let header = String::from_utf8_lossy(&out[pos..pos + nl]).into_owned();
        pos += nl + 1;
        let mut parts = header.rsplitn(2, ' ');
        let last = parts.next().unwrap_or("");
        if header.ends_with(" missing") || header.ends_with(" ambiguous") {
            counts.push(None);
            continue;
        }
        let Ok(size) = last.parse::<usize>() else {
            counts.push(None);
            continue;
        };
        let end = (pos + size).min(out.len());
        let data = &out[pos..end];
        counts.push(if is_binary(data) { None } else { Some(count_lines(data)) });
        pos = end + 1;
    }
    counts.resize(expected, None);
    counts
}

/// Sets `old_line_count` for every file that exists on the old side, reading all blobs in one `git cat-file --batch`.
fn fill_old_line_counts(repo: &Path, plan: &DiffPlan, files: &mut [DiffFileSummary]) -> Result<()> {
    let rev = match &plan.old {
        Source::Commit(sha) => sha.clone(),
        Source::Index => String::new(),
        _ => return Ok(()),
    };
    let targets: Vec<usize> = files
        .iter()
        .enumerate()
        .filter(|(_, f)| !f.binary && !matches!(f.status, FileStatus::Added | FileStatus::Untracked))
        .map(|(i, _)| i)
        .collect();
    if targets.is_empty() {
        return Ok(());
    }
    let mut input = String::new();
    for i in &targets {
        let f = &files[*i];
        input.push_str(&format!("{rev}:{}\n", f.old_path.as_deref().unwrap_or(&f.path)));
    }
    let out = git::run_with_stdin_bytes(repo, &["cat-file", "--batch"], input.as_bytes())?;
    let counts = parse_batch_line_counts(&out, targets.len());
    for (i, count) in targets.into_iter().zip(counts) {
        files[i].old_line_count = count;
    }
    Ok(())
}

fn read_source(repo: &Path, source: &Source, path: &str) -> Result<Option<Vec<u8>>> {
    match source {
        Source::EmptyTree => Ok(None),
        Source::Commit(sha) => git::show_file(repo, sha, path),
        Source::Index => git::show_file(repo, "", path),
        Source::WorkTree => {
            let full = match resolve_in_repo(repo, path) {
                Ok(p) => p,
                Err(e) if e.code == "not_found" => return Ok(None),
                Err(e) => return Err(e),
            };
            if !full.is_file() {
                return Ok(None);
            }
            Ok(Some(std::fs::read(full)?))
        }
    }
}

fn to_text(data: Option<Vec<u8>>) -> Option<String> {
    let data = data?;
    if is_binary(&data) {
        return None;
    }
    Some(String::from_utf8_lossy(&data).into_owned())
}

/// Full old/new contents of one file for hunk expansion. `None` for a side where the file does not exist (or is binary).
pub fn get_file_versions(repo: &Path, r: &str, path: &str, old_path: Option<&str>) -> Result<FileVersions> {
    let plan = plan(repo, r)?;
    let old = read_source(repo, &plan.old, old_path.unwrap_or(path))?;
    let new = read_source(repo, &plan.new, path)?;
    Ok(FileVersions {
        old_contents: to_text(old),
        new_contents: to_text(new),
    })
}

/// Number of lines of `path` on `side` for this ref, or `None` when the file does not exist on that side.
pub fn side_line_count(repo: &Path, r: &str, path: &str, old_path: Option<&str>, side: Side) -> Result<Option<u32>> {
    let plan = plan(repo, r)?;
    let data = match side {
        Side::Old => read_source(repo, &plan.old, old_path.unwrap_or(path))?,
        Side::New => read_source(repo, &plan.new, path)?,
    };
    Ok(data.map(|d| count_lines(&d)))
}

/// Discards working-tree changes to `path`: restores it from HEAD, or deletes it when HEAD does not have it.
pub fn revert_file(repo: &Path, path: &str) -> Result<()> {
    git::require_repo(repo)?;
    let full = resolve_in_repo(repo, path).or_else(|e| {
        if e.code == "not_found" {
            return Ok(repo.join(path));
        }
        Err(e)
    })?;
    let spec = format!("HEAD:{path}");
    if git::run_opt(repo, &["cat-file", "-e", &spec])?.is_some() {
        git::run(repo, &["checkout", "HEAD", "--", path])?;
        return Ok(());
    }
    let in_index = git::run_opt(repo, &["ls-files", "--error-unmatch", "--", path])?.is_some();
    if in_index {
        git::run(repo, &["rm", "--cached", "--quiet", "--", path])?;
    }
    if full.is_file() || full.is_symlink() {
        std::fs::remove_file(&full)?;
    }
    Ok(())
}

/// Reverse-applies a zero-context-tolerant patch to the working tree.
pub fn revert_hunk(repo: &Path, patch: &str) -> Result<()> {
    git::require_repo(repo)?;
    if patch.trim().is_empty() {
        return Err(AppError::invalid("empty patch"));
    }
    let mut input = patch.to_string();
    if !input.ends_with('\n') {
        input.push('\n');
    }
    git::run_with_stdin(repo, &["apply", "--reverse", "--unidiff-zero", "-"], input.as_bytes())?;
    Ok(())
}
