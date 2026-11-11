//! Code search for the sidebar: every file the Files view lists (tracked and untracked, not ignored), searched in
//! parallel with the `regex` crate. A newer search of the same repository stops an older one between files.

use std::collections::{HashMap, HashSet};
use std::path::Path;
use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};
use std::sync::{Arc, Mutex, OnceLock};
use std::time::{Duration, Instant};

use regex::{Regex, RegexBuilder};
use serde::{Deserialize, Serialize};

use crate::core::diffignore::DiffIgnore;
use crate::core::error::{AppError, Result};
use crate::core::{git, tree};

/// Matching lines returned at most; the search stops claiming files once it has found this many.
pub const MAX_RESULTS: usize = 2_000;
/// Larger files are skipped, like most editors' search.
pub const MAX_FILE_BYTES: u64 = 1024 * 1024;
const MAX_WORKERS: usize = 12;
const SNIFF_BYTES: usize = 8 * 1024;
/// Longer lines are cut down to a window around their first match.
const PREVIEW_CHARS: usize = 300;
const PREVIEW_LEAD: usize = 60;
const MAX_RANGES_PER_LINE: usize = 50;
/// The file list is reused for this long, so each keystroke of a query doesn't list the repository again.
const LIST_TTL: Duration = Duration::from_secs(5);

#[derive(Deserialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct SearchOptions {
    pub query: String,
    #[serde(default)]
    pub case_sensitive: bool,
    #[serde(default)]
    pub whole_word: bool,
    #[serde(default)]
    pub regex: bool,
    /// Searches only these repo-relative paths (the files in a diff).
    #[serde(default)]
    pub paths: Option<Vec<String>>,
}

#[derive(Serialize, Clone, Debug, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SearchMatch {
    pub line: u32,
    /// The line, or a window of it around the first match when it is long.
    pub text: String,
    /// Match ranges in `text`, as UTF-16 offsets `[start, end)` so the UI can slice JS strings with them.
    pub ranges: Vec<[u32; 2]>,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct SearchFile {
    pub path: String,
    pub matches: Vec<SearchMatch>,
    #[serde(skip_serializing_if = "std::ops::Not::not")]
    pub diff_ignored: bool,
}

#[derive(Serialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct SearchResult {
    pub files: Vec<SearchFile>,
    /// Matching lines in `files`.
    pub total: usize,
    /// More lines matched than were returned.
    pub truncated: bool,
    /// A newer search of the same repository started before this one finished.
    pub cancelled: bool,
}

fn generations() -> &'static Mutex<HashMap<String, Arc<AtomicBool>>> {
    static MAP: OnceLock<Mutex<HashMap<String, Arc<AtomicBool>>>> = OnceLock::new();
    MAP.get_or_init(|| Mutex::new(HashMap::new()))
}

/// Cancels the running search of `repo` (if any) and returns the flag of the new one.
fn start_generation(repo: &Path) -> Arc<AtomicBool> {
    let flag = Arc::new(AtomicBool::new(false));
    let mut map = generations().lock().unwrap_or_else(|e| e.into_inner());
    if let Some(previous) = map.insert(repo.to_string_lossy().into_owned(), flag.clone()) {
        previous.store(true, Ordering::Relaxed);
    }
    flag
}

/// The query as a regex: escaped unless `regex`, wrapped in word boundaries for `whole_word`.
pub fn build_regex(options: &SearchOptions) -> Result<Regex> {
    let source = if options.regex {
        options.query.clone()
    } else {
        regex::escape(&options.query)
    };
    let source = if options.whole_word {
        format!(r"\b(?:{source})\b")
    } else {
        source
    };
    RegexBuilder::new(&source)
        .case_insensitive(!options.case_sensitive)
        .size_limit(20 * 1024 * 1024)
        .build()
        .map_err(|e| AppError::invalid(regex_error_message(&e)))
}

/// The last line of the regex crate's multi-line error ("error: unclosed group"), capitalised.
fn regex_error_message(error: &regex::Error) -> String {
    let text = error.to_string();
    let last = text
        .lines()
        .rev()
        .find(|line| !line.trim().is_empty())
        .unwrap_or("invalid pattern")
        .trim();
    let message = last.strip_prefix("error:").unwrap_or(last).trim();
    let mut chars = message.chars();
    match chars.next() {
        Some(first) => first.to_uppercase().chain(chars).collect(),
        None => "Invalid pattern".to_string(),
    }
}

fn utf16_len(text: &str) -> u32 {
    text.encode_utf16().count() as u32
}

fn floor_char(text: &str, mut index: usize) -> usize {
    while index > 0 && !text.is_char_boundary(index) {
        index -= 1;
    }
    index
}

fn ceil_char(text: &str, mut index: usize) -> usize {
    while index < text.len() && !text.is_char_boundary(index) {
        index += 1;
    }
    index
}

/// The line (or a window around its first match) and the matches in it as UTF-16 ranges.
fn preview(line: &str, ranges: &[(usize, usize)]) -> (String, Vec<[u32; 2]>) {
    let char_count = line.chars().count();
    let (start, end, lead) = if char_count <= PREVIEW_CHARS {
        (0, line.len(), "")
    } else {
        let first = ranges.first().map(|r| r.0).unwrap_or(0);
        let lead_bytes = line[..first].chars().rev().take(PREVIEW_LEAD).map(char::len_utf8).sum::<usize>();
        let start = floor_char(line, first - lead_bytes);
        let end_bytes = line[start..].chars().take(PREVIEW_CHARS).map(char::len_utf8).sum::<usize>();
        let end = ceil_char(line, start + end_bytes);
        (start, end, if start > 0 { "…" } else { "" })
    };
    let window = &line[start..end];
    let mut text = String::with_capacity(window.len() + lead.len() + 3);
    text.push_str(lead);
    text.push_str(window);
    if end < line.len() {
        text.push('…');
    }
    let offset = utf16_len(lead);
    let mut out = Vec::new();
    for &(a, b) in ranges {
        if b <= start || a >= end {
            continue;
        }
        let a = a.max(start);
        let b = b.min(end);
        let from = offset + utf16_len(&line[start..a]);
        let to = from + utf16_len(&line[a..b]);
        out.push([from, to]);
    }
    (text, out)
}

/// The file's matching lines, or `None` when it is unreadable, binary or too large.
fn search_file(full: &Path, re: &Regex) -> Option<Vec<SearchMatch>> {
    use std::io::Read;
    let mut file = std::fs::File::open(full).ok()?;
    let meta = file.metadata().ok()?;
    if !meta.is_file() || meta.len() > MAX_FILE_BYTES {
        return None;
    }
    let mut data = Vec::with_capacity(meta.len() as usize);
    file.read_to_end(&mut data).ok()?;
    if tree::is_binary(&data[..data.len().min(SNIFF_BYTES)]) {
        return None;
    }
    let text = String::from_utf8_lossy(&data);
    if !re.is_match(&text) {
        return Some(Vec::new());
    }
    let mut matches = Vec::new();
    for (index, raw) in text.split('\n').enumerate() {
        let line = raw.strip_suffix('\r').unwrap_or(raw);
        let ranges: Vec<(usize, usize)> = re
            .find_iter(line)
            .filter(|m| m.start() < m.end())
            .take(MAX_RANGES_PER_LINE)
            .map(|m| (m.start(), m.end()))
            .collect();
        if ranges.is_empty() {
            continue;
        }
        let (text, ranges) = preview(line, &ranges);
        matches.push(SearchMatch {
            line: index as u32 + 1,
            text,
            ranges,
        });
    }
    Some(matches)
}

/// Searches the files the Files view lists, in path order, returning up to [`MAX_RESULTS`] matching lines.
pub fn search_code(repo: &Path, options: &SearchOptions) -> Result<SearchResult> {
    if options.query.is_empty() {
        return Ok(SearchResult::default());
    }
    let re = build_regex(options)?;
    let cancelled = start_generation(repo);
    let listed = list_files(repo)?;
    let files: Vec<&str> = match &options.paths {
        Some(paths) => {
            let only: HashSet<&str> = paths.iter().map(String::as_str).collect();
            listed.iter().map(String::as_str).filter(|p| only.contains(p)).collect()
        }
        None => listed.iter().map(String::as_str).collect(),
    };
    let mut result = search_files(repo, &files, &re, &cancelled);
    if !result.files.is_empty() {
        let rules = DiffIgnore::load(repo)?;
        if !rules.is_empty() {
            for file in &mut result.files {
                file.diff_ignored = rules.is_ignored(&file.path, false);
            }
        }
    }
    Ok(result)
}

/// Per repository: when its files were listed, and the list.
type ListCache = Mutex<HashMap<String, (Instant, Arc<Vec<String>>)>>;

fn list_cache() -> &'static ListCache {
    static CACHE: OnceLock<ListCache> = OnceLock::new();
    CACHE.get_or_init(|| Mutex::new(HashMap::new()))
}

/// Tracked and untracked files that aren't ignored, sorted. Unlike the Files tree this skips the `--deleted` pass
/// (a stat of every file) and folder entries: a deleted file simply fails to open and is skipped.
fn list_files(repo: &Path) -> Result<Arc<Vec<String>>> {
    let key = repo.to_string_lossy().into_owned();
    if let Some((at, files)) = list_cache().lock().unwrap_or_else(|e| e.into_inner()).get(&key) {
        if at.elapsed() < LIST_TTL {
            return Ok(files.clone());
        }
    }
    let mut files = if git::is_git_repo(repo) {
        git::split_nul(&git::run_bytes(repo, &["ls-files", "-z", "--cached", "--others", "--exclude-standard"])?)
    } else {
        tree::list_tree(repo)?
            .into_iter()
            .filter(|e| e.kind == crate::core::types::TreeEntryKind::File)
            .map(|e| e.path)
            .collect()
    };
    files.sort_unstable();
    files.dedup();
    let files = Arc::new(files);
    list_cache()
        .lock()
        .unwrap_or_else(|e| e.into_inner())
        .insert(key, (Instant::now(), files.clone()));
    Ok(files)
}

fn search_files(repo: &Path, files: &[&str], re: &Regex, cancelled: &AtomicBool) -> SearchResult {
    let slots: Vec<Mutex<Option<Vec<SearchMatch>>>> = files.iter().map(|_| Mutex::new(None)).collect();
    let next = AtomicUsize::new(0);
    let found = AtomicUsize::new(0);
    let workers = std::thread::available_parallelism()
        .map(|n| n.get())
        .unwrap_or(4)
        .clamp(1, MAX_WORKERS)
        .min(files.len().max(1));

    std::thread::scope(|scope| {
        for _ in 0..workers {
            scope.spawn(|| loop {
                if cancelled.load(Ordering::Relaxed) || found.load(Ordering::Relaxed) > MAX_RESULTS {
                    return;
                }
                let index = next.fetch_add(1, Ordering::Relaxed);
                let Some(path) = files.get(index) else {
                    return;
                };
                let Some(matches) = search_file(&repo.join(path), re) else {
                    continue;
                };
                if matches.is_empty() {
                    continue;
                }
                found.fetch_add(matches.len(), Ordering::Relaxed);
                *slots[index].lock().unwrap_or_else(|e| e.into_inner()) = Some(matches);
            });
        }
    });

    if cancelled.load(Ordering::Relaxed) {
        return SearchResult {
            cancelled: true,
            ..SearchResult::default()
        };
    }

    // Files are claimed in order, so every file before the last claimed one was searched in full.
    let claimed = next.load(Ordering::Relaxed).min(files.len());
    let mut result = SearchResult {
        truncated: claimed < files.len(),
        ..SearchResult::default()
    };
    for (slot, path) in slots.into_iter().zip(files).take(claimed) {
        let Some(mut matches) = slot.into_inner().unwrap_or_else(|e| e.into_inner()) else {
            continue;
        };
        let room = MAX_RESULTS - result.total;
        if room == 0 {
            result.truncated = true;
            break;
        }
        if matches.len() > room {
            matches.truncate(room);
            result.truncated = true;
        }
        result.total += matches.len();
        result.files.push(SearchFile {
            path: path.to_string(),
            matches,
            diff_ignored: false,
        });
    }
    result
}

#[cfg(test)]
mod tests {
    use super::*;

    fn options(query: &str) -> SearchOptions {
        SearchOptions {
            query: query.to_string(),
            ..SearchOptions::default()
        }
    }

    #[test]
    fn literal_queries_are_escaped() {
        let re = build_regex(&options("a.b(")).unwrap();
        assert!(re.is_match("x a.b( y"));
        assert!(!re.is_match("axb("));
    }

    #[test]
    fn case_and_word_options() {
        let mut opts = options("State");
        assert!(build_regex(&opts).unwrap().is_match("setstate"));
        opts.case_sensitive = true;
        assert!(!build_regex(&opts).unwrap().is_match("setstate"));
        opts.whole_word = true;
        assert!(!build_regex(&opts).unwrap().is_match("setState"));
        assert!(build_regex(&opts).unwrap().is_match("the State here"));
    }

    #[test]
    fn invalid_regex_reports_the_reason() {
        let mut opts = options("foo(");
        opts.regex = true;
        let error = build_regex(&opts).unwrap_err();
        assert_eq!(error.code, "invalid");
        assert_eq!(error.message, "Unclosed group");
    }

    #[test]
    fn ranges_are_utf16_offsets() {
        let (text, ranges) = preview("é😀 foo", &[(7, 10)]);
        assert_eq!(text, "é😀 foo");
        let units: Vec<u16> = text.encode_utf16().collect();
        let [a, b] = ranges[0];
        assert_eq!(String::from_utf16(&units[a as usize..b as usize]).unwrap(), "foo");
    }

    #[test]
    fn long_lines_are_cut_around_the_match() {
        let line = format!("{}needle{}", "x".repeat(1000), "y".repeat(1000));
        let (text, ranges) = preview(&line, &[(1000, 1006)]);
        assert!(text.starts_with('…') && text.ends_with('…'));
        let units: Vec<u16> = text.encode_utf16().collect();
        let [a, b] = ranges[0];
        assert_eq!(String::from_utf16(&units[a as usize..b as usize]).unwrap(), "needle");
    }
}
