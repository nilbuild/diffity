use std::collections::{HashMap, HashSet};

use diffity_core::types::{Severity, Side, Thread, ThreadStatus, GENERAL_FILE_PATH};
use serde::Serialize;

use crate::graphql::{Actor, RemoteThread};

pub fn side_to_github(side: Side) -> &'static str {
    match side {
        Side::Old => "LEFT",
        Side::New => "RIGHT",
    }
}

pub fn side_from_github(side: Option<&str>) -> Side {
    match side {
        Some("LEFT") => Side::Old,
        _ => Side::New,
    }
}

pub fn severity_label(severity: Severity) -> &'static str {
    match severity {
        Severity::MustFix => "must-fix",
        Severity::Suggestion => "suggestion",
        Severity::Nit => "nit",
        Severity::Question => "question",
    }
}

#[derive(Clone, Debug)]
pub struct PushComment {
    pub author_name: String,
    pub body: String,
}

#[derive(Clone, Debug)]
pub struct PushCandidate {
    pub thread_id: String,
    pub file_path: String,
    pub side: Side,
    pub start_line: u32,
    pub end_line: u32,
    pub severity: Option<Severity>,
    pub comments: Vec<PushComment>,
}

#[derive(Serialize, Clone, Debug, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct DraftThread {
    pub path: String,
    pub body: String,
    pub line: u32,
    pub side: &'static str,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub start_line: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub start_side: Option<&'static str>,
}

#[derive(Debug, Default)]
pub struct ReviewPlan {
    pub drafts: Vec<(String, DraftThread)>,
    pub body_sections: Vec<String>,
    pub in_body: Vec<String>,
    pub skipped: Vec<String>,
}

pub fn first_comment_body(candidate: &PushCandidate) -> String {
    let body = candidate.comments.first().map(|c| c.body.as_str()).unwrap_or("");
    match candidate.severity {
        Some(sev) => format!("**[{}]** {}", severity_label(sev), body),
        None => body.to_string(),
    }
}

pub fn build_review_plan(candidates: &[PushCandidate], pr_files: &HashSet<String>) -> ReviewPlan {
    let mut plan = ReviewPlan::default();
    for candidate in candidates {
        if candidate.comments.is_empty() {
            plan.skipped.push(format!("{} — thread has no comments", candidate.file_path));
            continue;
        }
        if candidate.file_path == GENERAL_FILE_PATH {
            plan.body_sections.push(first_comment_body(candidate));
            plan.in_body.push(candidate.thread_id.clone());
            continue;
        }
        if !pr_files.contains(&candidate.file_path) {
            plan.skipped
                .push(format!("{} — not in PR diff (push your changes first)", candidate.file_path));
            continue;
        }
        if candidate.end_line == 0 {
            plan.body_sections
                .push(format!("`{}`: {}", candidate.file_path, first_comment_body(candidate)));
            plan.in_body.push(candidate.thread_id.clone());
            continue;
        }
        let side = side_to_github(candidate.side);
        let multi = candidate.start_line > 0 && candidate.start_line < candidate.end_line;
        plan.drafts.push((
            candidate.thread_id.clone(),
            DraftThread {
                path: candidate.file_path.clone(),
                body: first_comment_body(candidate),
                line: candidate.end_line,
                side,
                start_line: multi.then_some(candidate.start_line),
                start_side: multi.then_some(side),
            },
        ));
    }
    plan
}

pub fn compose_review_body(user_body: Option<&str>, sections: &[String]) -> String {
    let mut parts: Vec<String> = Vec::new();
    if let Some(body) = user_body.map(str::trim).filter(|b| !b.is_empty()) {
        parts.push(body.to_string());
    }
    parts.extend(sections.iter().map(|s| s.trim().to_string()).filter(|s| !s.is_empty()));
    parts.join("\n\n")
}

#[derive(Debug, PartialEq, Eq)]
pub struct LocalThreadSpec {
    pub file_path: String,
    pub side: Side,
    pub start_line: u32,
    pub end_line: u32,
    pub status: ThreadStatus,
}

pub fn map_remote_thread(thread: &RemoteThread) -> Option<LocalThreadSpec> {
    let end_line = thread.line.or(thread.original_line)?;
    let start_line = thread
        .start_line
        .or(thread.original_start_line)
        .filter(|s| *s > 0 && *s <= end_line)
        .unwrap_or(end_line);
    Some(LocalThreadSpec {
        file_path: thread.path.clone(),
        side: side_from_github(thread.diff_side.as_deref()),
        start_line,
        end_line,
        status: if thread.is_resolved {
            ThreadStatus::Resolved
        } else {
            ThreadStatus::Open
        },
    })
}

pub fn is_bot(actor: Option<&Actor>) -> bool {
    actor.and_then(|a| a.typename.as_deref()) == Some("Bot")
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::graphql::{parse_response, PullRequestField, RepositoryData, ThreadsField};

    fn candidate(path: &str, side: Side, start: u32, end: u32, sev: Option<Severity>) -> PushCandidate {
        PushCandidate {
            thread_id: format!("t-{path}-{end}"),
            file_path: path.into(),
            side,
            start_line: start,
            end_line: end,
            severity: sev,
            comments: vec![PushComment {
                author_name: "me".into(),
                body: "fix this".into(),
            }],
        }
    }

    #[test]
    fn maps_sides() {
        assert_eq!(side_to_github(Side::Old), "LEFT");
        assert_eq!(side_to_github(Side::New), "RIGHT");
        assert_eq!(side_from_github(Some("LEFT")), Side::Old);
        assert_eq!(side_from_github(Some("RIGHT")), Side::New);
        assert_eq!(side_from_github(None), Side::New);
    }

    #[test]
    fn builds_plan() {
        let files: HashSet<String> = ["a.rs".to_string()].into();
        let cands = vec![
            candidate("a.rs", Side::New, 3, 7, Some(Severity::MustFix)),
            candidate("a.rs", Side::Old, 5, 5, None),
            candidate("b.rs", Side::New, 1, 1, None),
            candidate(GENERAL_FILE_PATH, Side::New, 0, 0, None),
            candidate("a.rs", Side::New, 0, 0, None),
        ];
        let plan = build_review_plan(&cands, &files);
        assert_eq!(plan.drafts.len(), 2);
        let (_, multi) = &plan.drafts[0];
        assert_eq!(multi.body, "**[must-fix]** fix this");
        assert_eq!((multi.line, multi.start_line), (7, Some(3)));
        assert_eq!((multi.side, multi.start_side), ("RIGHT", Some("RIGHT")));
        let (_, single) = &plan.drafts[1];
        assert_eq!((single.side, single.start_line, single.start_side), ("LEFT", None, None));
        assert_eq!(plan.skipped.len(), 1);
        assert!(plan.skipped[0].starts_with("b.rs"));
        assert_eq!(plan.body_sections, vec!["fix this".to_string(), "`a.rs`: fix this".to_string()]);
        assert_eq!(plan.in_body.len(), 2);
    }

    #[test]
    fn draft_serializes_camel_case() {
        let files: HashSet<String> = ["a.rs".to_string()].into();
        let plan = build_review_plan(&[candidate("a.rs", Side::New, 2, 4, None)], &files);
        let v = serde_json::to_value(&plan.drafts[0].1).unwrap();
        assert_eq!(
            v,
            serde_json::json!({"path":"a.rs","body":"fix this","line":4,"side":"RIGHT","startLine":2,"startSide":"RIGHT"})
        );
        let single = build_review_plan(&[candidate("a.rs", Side::Old, 4, 4, None)], &files);
        let v = serde_json::to_value(&single.drafts[0].1).unwrap();
        assert!(v.get("startLine").is_none());
    }

    #[test]
    fn composes_body() {
        assert_eq!(compose_review_body(None, &[]), "");
        assert_eq!(
            compose_review_body(Some(" hello "), &["a".into(), "".into(), "b".into()]),
            "hello\n\na\n\nb"
        );
    }

    #[test]
    fn maps_remote_thread_lines() {
        let text = r#"{"data":{"repository":{"pullRequest":{"reviewThreads":{"pageInfo":null,"nodes":[
          {"id":"T1","isResolved":false,"isOutdated":true,"path":"a.rs","line":null,"startLine":null,
           "originalLine":12,"originalStartLine":10,"diffSide":"LEFT","startDiffSide":"LEFT",
           "comments":{"nodes":[]}},
          {"id":"T2","isResolved":true,"isOutdated":false,"path":"b.rs","line":5,"startLine":null,
           "originalLine":5,"originalStartLine":null,"diffSide":"RIGHT","startDiffSide":null,
           "comments":{"nodes":[]}},
          {"id":"T3","isResolved":false,"isOutdated":true,"path":"c.rs","line":null,"startLine":null,
           "originalLine":null,"originalStartLine":null,"diffSide":"RIGHT","startDiffSide":null,
           "comments":{"nodes":[]}}]}}}}}"#;
        let data: RepositoryData<PullRequestField<ThreadsField>> = parse_response(text).unwrap();
        let items = data.repository.unwrap().pull_request.unwrap().review_threads.into_items();
        assert_eq!(
            map_remote_thread(&items[0]),
            Some(LocalThreadSpec {
                file_path: "a.rs".into(),
                side: Side::Old,
                start_line: 10,
                end_line: 12,
                status: ThreadStatus::Open
            })
        );
        let second = map_remote_thread(&items[1]).unwrap();
        assert_eq!((second.start_line, second.end_line, second.status), (5, 5, ThreadStatus::Resolved));
        assert_eq!(map_remote_thread(&items[2]), None);
    }
}

/// How a review session's line numbers relate to the PR on GitHub.
#[derive(Debug, Clone, Default)]
pub struct SessionAnchor {
    /// The session's new side is the PR head (e.g. `work`, `HEAD`, the PR ref, the file browser).
    pub new_matches: bool,
    /// The session's old side is the PR base (merge-base of base branch and head).
    pub old_matches: bool,
    pub is_pr_session: bool,
}

/// Open, unsynced threads from any of the repo's sessions whose anchors line up with the PR:
/// the file is part of the PR (or it is a general comment) and the commented side is anchored to the
/// same commit GitHub uses (new side → PR head, old side → PR base). PR-session threads come first.
pub fn select_pushable(
    threads: Vec<Thread>,
    anchors: &HashMap<String, SessionAnchor>,
    pr_files: &HashSet<String>,
) -> Vec<Thread> {
    let mut out: Vec<Thread> = threads
        .into_iter()
        .filter(|t| t.status == ThreadStatus::Open && t.github_thread_id.is_none() && !t.pending)
        .filter(|t| {
            let Some(anchor) = anchors.get(&t.session_id) else {
                return false;
            };
            if t.file_path == GENERAL_FILE_PATH {
                return anchor.is_pr_session || anchor.new_matches;
            }
            if !pr_files.contains(&t.file_path) {
                return false;
            }
            if t.start_line == 0 {
                return anchor.new_matches || anchor.old_matches;
            }
            match t.side {
                Side::New => anchor.new_matches,
                Side::Old => anchor.old_matches,
            }
        })
        .collect();
    out.sort_by_key(|t| {
        let pr_first = anchors.get(&t.session_id).is_some_and(|a| a.is_pr_session);
        (!pr_first, t.created_at.clone())
    });
    out
}

/// What pushing a submitted local review sends to GitHub.
#[derive(Debug, Default)]
pub struct ReviewSelection {
    /// Unsynced threads the review started (any status), oldest first.
    pub threads: Vec<Thread>,
    /// `(github_thread_id, local comment id, body)` for review replies on threads already on GitHub.
    pub replies: Vec<(String, String, String)>,
}

/// Selects the threads and replies of review `review_id` from the repo's threads. Pending (draft) comments
/// and comments already on GitHub are never selected.
pub fn select_review(threads: Vec<Thread>, review_id: &str) -> ReviewSelection {
    let mut out = ReviewSelection::default();
    for thread in threads {
        if thread.pending {
            continue;
        }
        let started_here = thread.review_id.as_deref() == Some(review_id);
        if started_here && thread.github_thread_id.is_none() {
            out.threads.push(thread);
            continue;
        }
        let Some(github_thread_id) = thread.github_thread_id.as_deref() else {
            continue;
        };
        for c in &thread.comments {
            let in_review = c.review_id.as_deref() == Some(review_id);
            if in_review && !c.pending && c.github_comment_id.is_none() {
                out.replies.push((github_thread_id.to_string(), c.id.clone(), c.body.clone()));
            }
        }
    }
    out.threads.sort_by(|a, b| a.created_at.cmp(&b.created_at));
    out
}

#[cfg(test)]
mod pushable_tests {
    use super::*;

    fn thread(id: &str, session: &str, path: &str, side: Side, line: u32) -> Thread {
        Thread {
            id: id.into(),
            session_id: session.into(),
            file_path: path.into(),
            side,
            start_line: line,
            end_line: line,
            status: ThreadStatus::Open,
            severity: None,
            anchor_content: None,
            github_thread_id: None,
            comments: vec![],
            created_at: format!("2026-01-01T00:00:0{}Z", id.len()),
            updated_at: String::new(),
            pending: false,
            review_id: None,
        }
    }

    fn comment(id: &str, review: Option<&str>, pending: bool, github: Option<i64>) -> diffity_core::types::Comment {
        diffity_core::types::Comment {
            id: id.into(),
            thread_id: String::new(),
            author_type: diffity_core::types::AuthorType::User,
            author_name: "You".into(),
            body: format!("body {id}"),
            created_at: String::new(),
            github_comment_id: github,
            pending,
            review_id: review.map(String::from),
            mentions_agent: false,
        }
    }

    #[test]
    fn selects_review_threads_and_replies() {
        let mut started = thread("started", "work", "src/a.ts", Side::New, 3);
        started.review_id = Some("R".into());
        started.status = ThreadStatus::Resolved;
        let mut other_review = thread("other", "work", "src/a.ts", Side::New, 4);
        other_review.review_id = Some("R2".into());
        let mut draft = thread("draft", "work", "src/a.ts", Side::New, 5);
        draft.review_id = Some("R".into());
        draft.pending = true;
        let mut synced = thread("synced", "pr", "src/a.ts", Side::New, 6);
        synced.github_thread_id = Some("GT".into());
        synced.comments = vec![
            comment("root", None, false, Some(1)),
            comment("reply", Some("R"), false, None),
            comment("done", Some("R"), false, Some(2)),
            comment("wip", Some("R"), true, None),
            comment("elsewhere", Some("R2"), false, None),
        ];
        let mut local_only = thread("local", "work", "src/a.ts", Side::New, 7);
        local_only.comments = vec![comment("x", Some("R"), false, None)];

        let picked = select_review(vec![started, other_review, draft, synced, local_only], "R");
        let ids: Vec<&str> = picked.threads.iter().map(|t| t.id.as_str()).collect();
        assert_eq!(ids, vec!["started"]);
        assert_eq!(
            picked.replies,
            vec![("GT".to_string(), "reply".to_string(), "body reply".to_string())]
        );
    }

    #[test]
    fn pushable_skips_pending_threads() {
        let mut anchors = HashMap::new();
        anchors.insert("work".to_string(), SessionAnchor { new_matches: true, ..Default::default() });
        let files: HashSet<String> = ["src/a.ts".to_string()].into();
        let mut draft = thread("draft", "work", "src/a.ts", Side::New, 3);
        draft.pending = true;
        let picked = select_pushable(vec![draft, thread("ok", "work", "src/a.ts", Side::New, 3)], &anchors, &files);
        assert_eq!(picked.len(), 1);
        assert_eq!(picked[0].id, "ok");
    }

    #[test]
    fn picks_threads_from_matching_sessions_and_pr_files() {
        let mut anchors = HashMap::new();
        anchors.insert("work".to_string(), SessionAnchor { new_matches: true, ..Default::default() });
        anchors.insert(
            "pr".to_string(),
            SessionAnchor { new_matches: true, old_matches: true, is_pr_session: true },
        );
        anchors.insert("old-commit".to_string(), SessionAnchor::default());
        let files: HashSet<String> = ["src/a.ts".to_string()].into();
        let mut synced = thread("synced", "work", "src/a.ts", Side::New, 3);
        synced.github_thread_id = Some("T".into());
        let mut resolved = thread("resolved", "work", "src/a.ts", Side::New, 3);
        resolved.status = ThreadStatus::Resolved;
        let picked = select_pushable(
            vec![
                thread("w-new", "work", "src/a.ts", Side::New, 3),
                thread("w-old", "work", "src/a.ts", Side::Old, 3),
                thread("w-other", "work", "src/b.ts", Side::New, 3),
                thread("p-old", "pr", "src/a.ts", Side::Old, 2),
                thread("general", "work", GENERAL_FILE_PATH, Side::New, 0),
                thread("stale", "old-commit", "src/a.ts", Side::New, 3),
                thread("orphan", "missing", "src/a.ts", Side::New, 3),
                synced,
                resolved,
            ],
            &anchors,
            &files,
        );
        let ids: Vec<&str> = picked.iter().map(|t| t.id.as_str()).collect();
        assert_eq!(ids, vec!["p-old", "w-new", "general"]);
    }
}
