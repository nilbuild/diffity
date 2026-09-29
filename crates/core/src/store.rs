use std::path::Path;
use std::sync::{Mutex, MutexGuard};

use rusqlite::{params, Connection, OptionalExtension, Row};

use crate::error::{AppError, Result};
use crate::mentions;
use crate::types::{
    AuthorType, Comment, NewThread, RecentRepo, Review, ReviewSession, ReviewState, ReviewVerdict, Severity, Side,
    Thread, ThreadStatus, ViewedFile,
};

const SCHEMA: &str = r#"
CREATE TABLE IF NOT EXISTS repos (
  id TEXT PRIMARY KEY,
  path TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  last_opened_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS review_sessions (
  id TEXT PRIMARY KEY,
  repo_path TEXT NOT NULL,
  ref TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE(repo_path, ref)
);

CREATE TABLE IF NOT EXISTS threads (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES review_sessions(id) ON DELETE CASCADE,
  file_path TEXT NOT NULL,
  side TEXT NOT NULL,
  start_line INTEGER NOT NULL,
  end_line INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  severity TEXT NULL,
  anchor_content TEXT NULL,
  github_thread_id TEXT NULL,
  github_comment_id INTEGER NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_threads_session ON threads(session_id);

CREATE TABLE IF NOT EXISTS comments (
  id TEXT PRIMARY KEY,
  thread_id TEXT NOT NULL REFERENCES threads(id) ON DELETE CASCADE,
  author_type TEXT NOT NULL,
  author_name TEXT NOT NULL,
  body TEXT NOT NULL,
  github_comment_id INTEGER NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_comments_thread ON comments(thread_id);

CREATE TABLE IF NOT EXISTS viewed_files (
  session_id TEXT NOT NULL,
  file_path TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  PRIMARY KEY(session_id, file_path)
);

CREATE TABLE IF NOT EXISTS chats (
  id TEXT PRIMARY KEY,
  repo_path TEXT NOT NULL,
  agent_id TEXT NOT NULL,
  acp_session_id TEXT NULL,
  mode TEXT NOT NULL,
  title TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_chats_repo ON chats(repo_path);

CREATE TABLE IF NOT EXISTS chat_messages (
  id TEXT PRIMARY KEY,
  chat_id TEXT NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
  role TEXT NOT NULL,
  content_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_chat_messages_chat ON chat_messages(chat_id);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
"#;

const MIGRATION_V2: &str = r#"
CREATE TABLE IF NOT EXISTS reviews (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES review_sessions(id) ON DELETE CASCADE,
  state TEXT NOT NULL DEFAULT 'pending',
  body TEXT NOT NULL DEFAULT '',
  verdict TEXT NULL,
  created_at TEXT NOT NULL,
  submitted_at TEXT NULL
);
CREATE INDEX IF NOT EXISTS idx_reviews_session ON reviews(session_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_reviews_one_pending ON reviews(session_id) WHERE state = 'pending';
ALTER TABLE threads ADD COLUMN review_id TEXT NULL REFERENCES reviews(id) ON DELETE SET NULL;
ALTER TABLE comments ADD COLUMN pending INTEGER NOT NULL DEFAULT 0;
ALTER TABLE comments ADD COLUMN review_id TEXT NULL REFERENCES reviews(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_comments_review ON comments(review_id);
"#;

const SCHEMA_VERSION: i64 = 2;

pub struct Store {
    conn: Mutex<Connection>,
}

impl Store {
    pub fn open(path: impl AsRef<Path>) -> Result<Store> {
        let path = path.as_ref();
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent)?;
        }
        let conn = Connection::open(path)?;
        Self::init(conn)
    }

    pub fn open_in_memory() -> Result<Store> {
        Self::init(Connection::open_in_memory()?)
    }

    fn init(conn: Connection) -> Result<Store> {
        conn.pragma_update(None, "journal_mode", "WAL")?;
        conn.pragma_update(None, "foreign_keys", "ON")?;
        conn.pragma_update(None, "busy_timeout", 5000)?;
        Self::migrate(&conn)?;
        Ok(Store {
            conn: Mutex::new(conn),
        })
    }

    fn migrate(conn: &Connection) -> Result<()> {
        let version: i64 = conn.pragma_query_value(None, "user_version", |r| r.get(0))?;
        if version >= SCHEMA_VERSION {
            return Ok(());
        }
        conn.execute_batch("BEGIN")?;
        let applied = (|| -> Result<()> {
            if version < 1 {
                conn.execute_batch(SCHEMA)?;
            }
            if version < 2 {
                conn.execute_batch(MIGRATION_V2)?;
            }
            conn.pragma_update(None, "user_version", SCHEMA_VERSION)?;
            Ok(())
        })();
        if let Err(e) = applied {
            let _ = conn.execute_batch("ROLLBACK");
            return Err(e);
        }
        conn.execute_batch("COMMIT")?;
        Ok(())
    }

    /// Locks the underlying connection. Keep the guard short-lived; never hold it across `.await`.
    pub fn conn(&self) -> Result<MutexGuard<'_, Connection>> {
        self.conn
            .lock()
            .map_err(|_| AppError::internal("store mutex poisoned"))
    }
}


pub fn now() -> String {
    chrono::Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Millis, true)
}

pub fn new_id() -> String {
    uuid::Uuid::new_v4().to_string()
}

pub fn side_str(s: Side) -> &'static str {
    match s {
        Side::Old => "old",
        Side::New => "new",
    }
}

fn parse_side(s: &str) -> Side {
    if s == "old" {
        return Side::Old;
    }
    Side::New
}

pub fn status_str(s: ThreadStatus) -> &'static str {
    match s {
        ThreadStatus::Open => "open",
        ThreadStatus::Resolved => "resolved",
        ThreadStatus::Dismissed => "dismissed",
    }
}

fn parse_status(s: &str) -> ThreadStatus {
    match s {
        "resolved" => ThreadStatus::Resolved,
        "dismissed" => ThreadStatus::Dismissed,
        _ => ThreadStatus::Open,
    }
}

pub fn severity_str(s: Severity) -> &'static str {
    match s {
        Severity::MustFix => "must-fix",
        Severity::Suggestion => "suggestion",
        Severity::Nit => "nit",
        Severity::Question => "question",
    }
}

fn parse_severity(s: &str) -> Option<Severity> {
    match s {
        "must-fix" => Some(Severity::MustFix),
        "suggestion" => Some(Severity::Suggestion),
        "nit" => Some(Severity::Nit),
        "question" => Some(Severity::Question),
        _ => None,
    }
}

pub fn author_str(a: AuthorType) -> &'static str {
    match a {
        AuthorType::User => "user",
        AuthorType::Agent => "agent",
        AuthorType::Github => "github",
    }
}

fn parse_author(s: &str) -> AuthorType {
    match s {
        "agent" => AuthorType::Agent,
        "github" => AuthorType::Github,
        _ => AuthorType::User,
    }
}

fn default_author_name(a: AuthorType) -> &'static str {
    match a {
        AuthorType::User => "You",
        AuthorType::Agent => "Agent",
        AuthorType::Github => "GitHub",
    }
}

/// Result of an idempotent GitHub import.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum UpsertOutcome {
    Inserted,
    Updated,
    Unchanged,
}

const THREAD_COLS: &str = "id, session_id, file_path, side, start_line, end_line, status, severity, anchor_content, github_thread_id, created_at, updated_at, review_id";
const COMMENT_COLS: &str = "id, thread_id, author_type, author_name, body, github_comment_id, created_at, pending, review_id";
const REVIEW_COLS: &str = "id, session_id, state, body, verdict, created_at, submitted_at";

fn row_to_thread(r: &Row) -> rusqlite::Result<Thread> {
    let side: String = r.get(3)?;
    let status: String = r.get(6)?;
    let severity: Option<String> = r.get(7)?;
    Ok(Thread {
        id: r.get(0)?,
        session_id: r.get(1)?,
        file_path: r.get(2)?,
        side: parse_side(&side),
        start_line: r.get(4)?,
        end_line: r.get(5)?,
        status: parse_status(&status),
        severity: severity.as_deref().and_then(parse_severity),
        anchor_content: r.get(8)?,
        github_thread_id: r.get(9)?,
        comments: Vec::new(),
        created_at: r.get(10)?,
        updated_at: r.get(11)?,
        pending: false,
        review_id: r.get(12)?,
    })
}

fn row_to_comment(r: &Row) -> rusqlite::Result<Comment> {
    let author: String = r.get(2)?;
    let author_type = parse_author(&author);
    let body: String = r.get(4)?;
    let mentions_agent = author_type == AuthorType::User && mentions::mentions_agent(&body);
    Ok(Comment {
        id: r.get(0)?,
        thread_id: r.get(1)?,
        author_type,
        author_name: r.get(3)?,
        body,
        github_comment_id: r.get(5)?,
        created_at: r.get(6)?,
        pending: r.get::<_, i64>(7)? != 0,
        review_id: r.get(8)?,
        mentions_agent,
    })
}

fn with_comments(conn: &Connection, thread: Thread) -> Result<Thread> {
    let comments = load_comments(conn, &thread.id)?;
    let pending = comments.first().is_some_and(|c| c.pending);
    Ok(Thread {
        comments,
        pending,
        ..thread
    })
}

fn load_comments(conn: &Connection, thread_id: &str) -> Result<Vec<Comment>> {
    let mut stmt = conn.prepare_cached(&format!(
        "SELECT {COMMENT_COLS} FROM comments WHERE thread_id = ?1 ORDER BY created_at, rowid"
    ))?;
    let rows = stmt.query_map([thread_id], row_to_comment)?;
    Ok(rows.collect::<rusqlite::Result<Vec<_>>>()?)
}

fn load_thread(conn: &Connection, thread_id: &str) -> Result<Thread> {
    let thread = conn
        .query_row(
            &format!("SELECT {THREAD_COLS} FROM threads WHERE id = ?1"),
            [thread_id],
            row_to_thread,
        )
        .optional()?
        .ok_or_else(|| AppError::not_found(format!("thread {thread_id} not found")))?;
    with_comments(conn, thread)
}

struct CommentRow<'a> {
    author_type: AuthorType,
    author_name: &'a str,
    body: &'a str,
    github_comment_id: Option<i64>,
    created_at: &'a str,
    review_id: Option<&'a str>,
}

impl<'a> CommentRow<'a> {
    fn new(author_type: AuthorType, author_name: &'a str, body: &'a str, created_at: &'a str) -> Self {
        CommentRow {
            author_type,
            author_name,
            body,
            github_comment_id: None,
            created_at,
            review_id: None,
        }
    }
}

/// Inserts a comment; it is a pending draft when `review_id` is set.
fn insert_comment(conn: &Connection, thread_id: &str, c: CommentRow<'_>) -> Result<()> {
    conn.execute(
        "INSERT INTO comments (id, thread_id, author_type, author_name, body, github_comment_id, created_at, pending, review_id)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
        params![
            new_id(),
            thread_id,
            author_str(c.author_type),
            c.author_name,
            c.body,
            c.github_comment_id,
            c.created_at,
            c.review_id.is_some() as i64,
            c.review_id
        ],
    )?;
    Ok(())
}

fn thread_is_pending(conn: &Connection, thread_id: &str) -> Result<bool> {
    let pending: Option<i64> = conn
        .query_row(
            "SELECT pending FROM comments WHERE thread_id = ?1 ORDER BY created_at, rowid LIMIT 1",
            [thread_id],
            |r| r.get(0),
        )
        .optional()?;
    Ok(pending.unwrap_or(0) != 0)
}

fn parse_review_state(s: &str) -> ReviewState {
    if s == "submitted" {
        return ReviewState::Submitted;
    }
    ReviewState::Pending
}

pub fn verdict_str(v: ReviewVerdict) -> &'static str {
    match v {
        ReviewVerdict::Comment => "comment",
        ReviewVerdict::Approve => "approve",
        ReviewVerdict::RequestChanges => "requestChanges",
    }
}

fn parse_verdict(s: &str) -> Option<ReviewVerdict> {
    match s {
        "comment" => Some(ReviewVerdict::Comment),
        "approve" => Some(ReviewVerdict::Approve),
        "requestChanges" => Some(ReviewVerdict::RequestChanges),
        _ => None,
    }
}

fn row_to_review(r: &Row) -> rusqlite::Result<Review> {
    let state: String = r.get(2)?;
    let verdict: Option<String> = r.get(4)?;
    let body: String = r.get(3)?;
    Ok(Review {
        id: r.get(0)?,
        session_id: r.get(1)?,
        state: parse_review_state(&state),
        body_mentions_agent: mentions::mentions_agent(&body),
        body,
        verdict: verdict.as_deref().and_then(parse_verdict),
        pending_count: 0,
        comment_count: 0,
        thread_ids: Vec::new(),
        mentioned_thread_ids: Vec::new(),
        created_at: r.get(5)?,
        submitted_at: r.get(6)?,
    })
}

fn fill_review(conn: &Connection, review: Review) -> Result<Review> {
    let mut stmt = conn.prepare_cached(
        "SELECT thread_id, pending, author_type, body FROM comments WHERE review_id = ?1 ORDER BY created_at, rowid",
    )?;
    let rows = stmt
        .query_map([&review.id], |r| {
            Ok((
                r.get::<_, String>(0)?,
                r.get::<_, i64>(1)? != 0,
                r.get::<_, String>(2)?,
                r.get::<_, String>(3)?,
            ))
        })?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    let mut out = review;
    for (thread_id, pending, author, body) in rows {
        out.comment_count += 1;
        if pending {
            out.pending_count += 1;
        }
        if !out.thread_ids.contains(&thread_id) {
            out.thread_ids.push(thread_id.clone());
        }
        let mentions = parse_author(&author) == AuthorType::User && mentions::mentions_agent(&body);
        if mentions && !out.mentioned_thread_ids.contains(&thread_id) {
            out.mentioned_thread_ids.push(thread_id);
        }
    }
    Ok(out)
}

fn load_review(conn: &Connection, review_id: &str) -> Result<Review> {
    let review = conn
        .query_row(
            &format!("SELECT {REVIEW_COLS} FROM reviews WHERE id = ?1"),
            [review_id],
            row_to_review,
        )
        .optional()?
        .ok_or_else(|| AppError::not_found(format!("review {review_id} not found")))?;
    fill_review(conn, review)
}

fn pending_review_id(conn: &Connection, session_id: &str) -> Result<Option<String>> {
    Ok(conn
        .query_row(
            "SELECT id FROM reviews WHERE session_id = ?1 AND state = 'pending'",
            [session_id],
            |r| r.get(0),
        )
        .optional()?)
}

fn ensure_pending_review(conn: &Connection, session_id: &str) -> Result<String> {
    if let Some(id) = pending_review_id(conn, session_id)? {
        return Ok(id);
    }
    let id = new_id();
    conn.execute(
        "INSERT INTO reviews (id, session_id, state, body, created_at) VALUES (?1, ?2, 'pending', '', ?3)",
        params![id, session_id, now()],
    )?;
    Ok(id)
}

fn touch_thread(conn: &Connection, thread_id: &str, ts: &str) -> Result<()> {
    conn.execute("UPDATE threads SET updated_at = ?1 WHERE id = ?2", params![ts, thread_id])?;
    Ok(())
}

fn thread_session(conn: &Connection, thread_id: &str) -> Result<String> {
    conn.query_row("SELECT session_id FROM threads WHERE id = ?1", [thread_id], |r| r.get(0))
        .optional()?
        .ok_or_else(|| AppError::not_found(format!("thread {thread_id} not found")))
}

impl Store {
    // ---- repos ----

    /// Records a repo open (insert or bump `last_opened_at`).
    pub fn touch_repo(&self, path: &str, name: &str) -> Result<()> {
        self.conn()?.execute(
            "INSERT INTO repos (id, path, name, last_opened_at) VALUES (?1, ?2, ?3, ?4)
             ON CONFLICT(path) DO UPDATE SET name = excluded.name, last_opened_at = excluded.last_opened_at",
            params![new_id(), path, name, now()],
        )?;
        Ok(())
    }

    pub fn recent_repos(&self, limit: u32) -> Result<Vec<RecentRepo>> {
        let conn = self.conn()?;
        let mut stmt = conn.prepare(
            "SELECT path, name, last_opened_at FROM repos ORDER BY last_opened_at DESC LIMIT ?1",
        )?;
        let rows = stmt.query_map([limit], |r| {
            Ok(RecentRepo {
                path: r.get(0)?,
                name: r.get(1)?,
                last_opened_at: r.get(2)?,
            })
        })?;
        Ok(rows.collect::<rusqlite::Result<Vec<_>>>()?)
    }

    pub fn remove_repo(&self, path: &str) -> Result<()> {
        self.conn()?.execute("DELETE FROM repos WHERE path = ?1", [path])?;
        Ok(())
    }

    // ---- sessions ----

    /// Get-or-create the review session keyed by (repo_path, ref).
    pub fn get_or_create_session(&self, repo_path: &str, r#ref: &str) -> Result<ReviewSession> {
        let conn = self.conn()?;
        conn.execute(
            "INSERT OR IGNORE INTO review_sessions (id, repo_path, ref, created_at) VALUES (?1, ?2, ?3, ?4)",
            params![new_id(), repo_path, r#ref, now()],
        )?;
        let id: String = conn.query_row(
            "SELECT id FROM review_sessions WHERE repo_path = ?1 AND ref = ?2",
            params![repo_path, r#ref],
            |r| r.get(0),
        )?;
        Ok(ReviewSession {
            id,
            repo_path: repo_path.to_string(),
            r#ref: r#ref.to_string(),
        })
    }

    pub fn get_session_by_id(&self, session_id: &str) -> Result<ReviewSession> {
        self.conn()?
            .query_row(
                "SELECT id, repo_path, ref FROM review_sessions WHERE id = ?1",
                [session_id],
                |r| {
                    Ok(ReviewSession {
                        id: r.get(0)?,
                        repo_path: r.get(1)?,
                        r#ref: r.get(2)?,
                    })
                },
            )
            .optional()?
            .ok_or_else(|| AppError::not_found(format!("session {session_id} not found")))
    }

    // ---- threads ----

    /// Threads of a session (oldest first) with their comments, optionally filtered by status.
    pub fn list_threads(&self, session_id: &str, status: Option<ThreadStatus>) -> Result<Vec<Thread>> {
        let conn = self.conn()?;
        let mut stmt = conn.prepare_cached(&format!(
            "SELECT {THREAD_COLS} FROM threads WHERE session_id = ?1 AND (?2 IS NULL OR status = ?2) ORDER BY created_at, rowid"
        ))?;
        let threads = stmt
            .query_map(params![session_id, status.map(status_str)], row_to_thread)?
            .collect::<rusqlite::Result<Vec<_>>>()?;
        threads
            .into_iter()
            .map(|t| with_comments(&conn, t))
            .collect()
    }

    /// Every thread in every review session of a repo, with its session, most recently updated first.
    pub fn list_repo_threads(&self, repo_path: &str) -> Result<Vec<(ReviewSession, Thread)>> {
        let conn = self.conn()?;
        let cols = THREAD_COLS
            .split(", ")
            .map(|c| format!("t.{c}"))
            .collect::<Vec<_>>()
            .join(", ");
        let mut stmt = conn.prepare_cached(&format!(
            "SELECT {cols}, s.ref FROM threads t JOIN review_sessions s ON s.id = t.session_id \
             WHERE s.repo_path = ?1 ORDER BY t.updated_at DESC, t.rowid DESC"
        ))?;
        let rows = stmt
            .query_map([repo_path], |r| Ok((row_to_thread(r)?, r.get::<_, String>(13)?)))?
            .collect::<rusqlite::Result<Vec<_>>>()?;
        rows.into_iter()
            .map(|(thread, r#ref)| {
                let session = ReviewSession {
                    id: thread.session_id.clone(),
                    repo_path: repo_path.to_string(),
                    r#ref,
                };
                Ok((session, with_comments(&conn, thread)?))
            })
            .collect()
    }

    pub fn get_thread(&self, thread_id: &str) -> Result<Thread> {
        load_thread(&*self.conn()?, thread_id)
    }

    /// Finds a thread by full id or unique prefix (>= 8 chars), optionally scoped to a session.
    pub fn find_thread_by_prefix(&self, prefix: &str, session_id: Option<&str>) -> Result<Thread> {
        let prefix = prefix.trim();
        let conn = self.conn()?;
        let exact: Option<String> = conn
            .query_row(
                "SELECT id FROM threads WHERE id = ?1 AND (?2 IS NULL OR session_id = ?2)",
                params![prefix, session_id],
                |r| r.get(0),
            )
            .optional()?;
        if let Some(id) = exact {
            return load_thread(&conn, &id);
        }
        if prefix.len() < 8 {
            return Err(AppError::not_found(format!(
                "thread '{prefix}' not found (use at least 8 characters of the id)"
            )));
        }
        let escaped = prefix.replace('\\', "\\\\").replace('%', "\\%").replace('_', "\\_");
        let mut stmt = conn.prepare(
            "SELECT id FROM threads WHERE id LIKE ?1 ESCAPE '\\' AND (?2 IS NULL OR session_id = ?2) LIMIT 2",
        )?;
        let ids = stmt
            .query_map(params![format!("{escaped}%"), session_id], |r| r.get::<_, String>(0))?
            .collect::<rusqlite::Result<Vec<_>>>()?;
        match ids.as_slice() {
            [id] => load_thread(&conn, id),
            [] => Err(AppError::not_found(format!("thread '{prefix}' not found"))),
            _ => Err(AppError::invalid(format!("thread id prefix '{prefix}' is ambiguous"))),
        }
    }

    pub fn create_thread(&self, input: &NewThread) -> Result<Thread> {
        if input.body.trim().is_empty() {
            return Err(AppError::invalid("comment body is empty"));
        }
        let mut conn = self.conn()?;
        let tx = conn.transaction()?;
        let exists: bool = tx
            .query_row("SELECT 1 FROM review_sessions WHERE id = ?1", [&input.session_id], |_| Ok(true))
            .optional()?
            .unwrap_or(false);
        if !exists {
            return Err(AppError::not_found(format!("session {} not found", input.session_id)));
        }
        let id = new_id();
        let ts = now();
        let (start, end) = if input.end_line < input.start_line {
            (input.end_line, input.start_line)
        } else {
            (input.start_line, input.end_line)
        };
        let author_type = input.author_type.unwrap_or(AuthorType::User);
        let pending = input.pending.unwrap_or(false);
        if pending && author_type != AuthorType::User {
            return Err(AppError::invalid("only user comments can be pending"));
        }
        let review_id = if pending {
            Some(ensure_pending_review(&tx, &input.session_id)?)
        } else {
            None
        };
        tx.execute(
            "INSERT INTO threads (id, session_id, file_path, side, start_line, end_line, status, severity, anchor_content, created_at, updated_at, review_id)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, 'open', ?7, ?8, ?9, ?9, ?10)",
            params![
                id,
                input.session_id,
                input.file_path,
                side_str(input.side),
                start,
                end,
                input.severity.map(severity_str),
                input.anchor_content,
                ts,
                review_id
            ],
        )?;
        let author_name = input
            .author_name
            .clone()
            .filter(|n| !n.trim().is_empty())
            .unwrap_or_else(|| default_author_name(author_type).to_string());
        insert_comment(
            &tx,
            &id,
            CommentRow {
                review_id: review_id.as_deref(),
                ..CommentRow::new(author_type, &author_name, &input.body, &ts)
            },
        )?;
        let thread = load_thread(&tx, &id)?;
        tx.commit()?;
        Ok(thread)
    }

    /// Appends a published comment. A user reply to a resolved/dismissed thread reopens it.
    pub fn add_reply(
        &self,
        thread_id: &str,
        body: &str,
        author_type: AuthorType,
        author_name: Option<&str>,
    ) -> Result<Thread> {
        self.add_reply_with(thread_id, body, author_type, author_name, false)
    }

    /// Appends a comment. `pending` adds a user draft to the session's pending review (created on demand);
    /// replies to a pending thread are always pending. Published user replies reopen resolved/dismissed threads.
    pub fn add_reply_with(
        &self,
        thread_id: &str,
        body: &str,
        author_type: AuthorType,
        author_name: Option<&str>,
        pending: bool,
    ) -> Result<Thread> {
        if body.trim().is_empty() {
            return Err(AppError::invalid("comment body is empty"));
        }
        let mut conn = self.conn()?;
        let tx = conn.transaction()?;
        let session_id = thread_session(&tx, thread_id)?;
        let pending = author_type == AuthorType::User && (pending || thread_is_pending(&tx, thread_id)?);
        let review_id = if pending {
            Some(ensure_pending_review(&tx, &session_id)?)
        } else {
            None
        };
        let ts = now();
        let name = author_name
            .filter(|n| !n.trim().is_empty())
            .unwrap_or(default_author_name(author_type));
        insert_comment(
            &tx,
            thread_id,
            CommentRow {
                review_id: review_id.as_deref(),
                ..CommentRow::new(author_type, name, body, &ts)
            },
        )?;
        if pending {
            touch_thread(&tx, thread_id, &ts)?;
        } else if author_type == AuthorType::User {
            tx.execute(
                "UPDATE threads SET status = 'open', updated_at = ?1 WHERE id = ?2",
                params![ts, thread_id],
            )?;
        } else {
            touch_thread(&tx, thread_id, &ts)?;
        }
        let thread = load_thread(&tx, thread_id)?;
        tx.commit()?;
        Ok(thread)
    }

    /// Edits a comment body. Returns the owning session id.
    pub fn edit_comment(&self, comment_id: &str, body: &str) -> Result<String> {
        if body.trim().is_empty() {
            return Err(AppError::invalid("comment body is empty"));
        }
        let conn = self.conn()?;
        let thread_id = self.comment_thread(&conn, comment_id)?;
        conn.execute("UPDATE comments SET body = ?1 WHERE id = ?2", params![body, comment_id])?;
        touch_thread(&conn, &thread_id, &now())?;
        thread_session(&conn, &thread_id)
    }

    /// Deletes a comment; deleting the last comment deletes the thread. Returns the owning session id.
    pub fn delete_comment(&self, comment_id: &str) -> Result<String> {
        let mut conn = self.conn()?;
        let tx = conn.transaction()?;
        let thread_id = self.comment_thread(&tx, comment_id)?;
        let session_id = thread_session(&tx, &thread_id)?;
        tx.execute("DELETE FROM comments WHERE id = ?1", [comment_id])?;
        let remaining: i64 =
            tx.query_row("SELECT count(*) FROM comments WHERE thread_id = ?1", [&thread_id], |r| r.get(0))?;
        if remaining == 0 {
            tx.execute("DELETE FROM threads WHERE id = ?1", [&thread_id])?;
        } else {
            touch_thread(&tx, &thread_id, &now())?;
        }
        tx.commit()?;
        Ok(session_id)
    }

    /// Deletes a thread and its comments. Returns the owning session id.
    pub fn delete_thread(&self, thread_id: &str) -> Result<String> {
        let conn = self.conn()?;
        let session_id = thread_session(&conn, thread_id)?;
        conn.execute("DELETE FROM threads WHERE id = ?1", [thread_id])?;
        Ok(session_id)
    }

    pub fn delete_all_threads(&self, session_id: &str) -> Result<usize> {
        Ok(self
            .conn()?
            .execute("DELETE FROM threads WHERE session_id = ?1", [session_id])?)
    }

    /// Sets status; a non-empty `summary` is appended as a comment by `Agent`.
    pub fn set_thread_status(&self, thread_id: &str, status: ThreadStatus, summary: Option<&str>) -> Result<Thread> {
        self.set_thread_status_as(thread_id, status, summary, AuthorType::Agent, None)
    }

    /// Like `set_thread_status` but with an explicit author for the summary comment.
    pub fn set_thread_status_as(
        &self,
        thread_id: &str,
        status: ThreadStatus,
        summary: Option<&str>,
        author_type: AuthorType,
        author_name: Option<&str>,
    ) -> Result<Thread> {
        let mut conn = self.conn()?;
        let tx = conn.transaction()?;
        thread_session(&tx, thread_id)?;
        let ts = now();
        tx.execute(
            "UPDATE threads SET status = ?1, updated_at = ?2 WHERE id = ?3",
            params![status_str(status), ts, thread_id],
        )?;
        if let Some(summary) = summary.filter(|s| !s.trim().is_empty()) {
            let name = author_name
                .filter(|n| !n.trim().is_empty())
                .unwrap_or(default_author_name(author_type));
            insert_comment(&tx, thread_id, CommentRow::new(author_type, name, summary, &ts))?;
        }
        let thread = load_thread(&tx, thread_id)?;
        tx.commit()?;
        Ok(thread)
    }

    fn comment_thread(&self, conn: &Connection, comment_id: &str) -> Result<String> {
        conn.query_row("SELECT thread_id FROM comments WHERE id = ?1", [comment_id], |r| r.get(0))
            .optional()?
            .ok_or_else(|| AppError::not_found(format!("comment {comment_id} not found")))
    }

    pub fn get_comment(&self, comment_id: &str) -> Result<Comment> {
        self.conn()?
            .query_row(
                &format!("SELECT {COMMENT_COLS} FROM comments WHERE id = ?1"),
                [comment_id],
                row_to_comment,
            )
            .optional()?
            .ok_or_else(|| AppError::not_found(format!("comment {comment_id} not found")))
    }

    // ---- reviews ----

    pub fn get_pending_review(&self, session_id: &str) -> Result<Option<Review>> {
        let conn = self.conn()?;
        pending_review_id(&conn, session_id)?
            .map(|id| load_review(&conn, &id))
            .transpose()
    }

    /// Get-or-create the session's pending review (at most one per session).
    pub fn start_review(&self, session_id: &str) -> Result<Review> {
        let mut conn = self.conn()?;
        let tx = conn.transaction()?;
        let exists: bool = tx
            .query_row("SELECT 1 FROM review_sessions WHERE id = ?1", [session_id], |_| Ok(true))
            .optional()?
            .unwrap_or(false);
        if !exists {
            return Err(AppError::not_found(format!("session {session_id} not found")));
        }
        let id = ensure_pending_review(&tx, session_id)?;
        let review = load_review(&tx, &id)?;
        tx.commit()?;
        Ok(review)
    }

    pub fn get_review(&self, review_id: &str) -> Result<Review> {
        load_review(&*self.conn()?, review_id)
    }

    /// Reviews of a session, oldest first (the pending one included).
    pub fn list_reviews(&self, session_id: &str) -> Result<Vec<Review>> {
        let conn = self.conn()?;
        let mut stmt = conn.prepare_cached(&format!(
            "SELECT {REVIEW_COLS} FROM reviews WHERE session_id = ?1 ORDER BY created_at, rowid"
        ))?;
        let reviews = stmt
            .query_map([session_id], row_to_review)?
            .collect::<rusqlite::Result<Vec<_>>>()?;
        reviews.into_iter().map(|r| fill_review(&conn, r)).collect()
    }

    /// Publishes every pending comment of the session's review and stamps it submitted.
    /// Published comments are re-stamped with the submit time; replies reopen resolved/dismissed threads.
    /// Without a pending review, a non-empty body or a non-comment verdict submits a body-only review.
    /// A `None` verdict is a local review (no pull request): it only publishes the comments.
    pub fn submit_review(
        &self,
        session_id: &str,
        body: &str,
        verdict: impl Into<Option<ReviewVerdict>>,
    ) -> Result<Review> {
        let verdict: Option<ReviewVerdict> = verdict.into();
        let body = body.trim();
        let mut conn = self.conn()?;
        let tx = conn.transaction()?;
        let pending_id = pending_review_id(&tx, session_id)?;
        let pending_count: i64 = match &pending_id {
            Some(id) => tx.query_row(
                "SELECT count(*) FROM comments WHERE review_id = ?1 AND pending = 1",
                [id],
                |r| r.get(0),
            )?,
            None => 0,
        };
        if pending_count == 0 && body.is_empty() && matches!(verdict, None | Some(ReviewVerdict::Comment)) {
            return Err(AppError::invalid("the review has no comments and no summary"));
        }
        let review_id = match pending_id {
            Some(id) => id,
            None => {
                let exists: bool = tx
                    .query_row("SELECT 1 FROM review_sessions WHERE id = ?1", [session_id], |_| Ok(true))
                    .optional()?
                    .unwrap_or(false);
                if !exists {
                    return Err(AppError::not_found(format!("session {session_id} not found")));
                }
                ensure_pending_review(&tx, session_id)?
            }
        };
        let ts = now();
        tx.execute(
            "UPDATE threads SET status = 'open', updated_at = ?2
             WHERE id IN (SELECT thread_id FROM comments WHERE review_id = ?1 AND pending = 1)",
            params![review_id, ts],
        )?;
        tx.execute(
            "UPDATE comments SET pending = 0, created_at = ?2 WHERE review_id = ?1 AND pending = 1",
            params![review_id, ts],
        )?;
        tx.execute(
            "UPDATE reviews SET state = 'submitted', body = ?2, verdict = ?3, submitted_at = ?4 WHERE id = ?1",
            params![review_id, body, verdict.map(verdict_str), ts],
        )?;
        let review = load_review(&tx, &review_id)?;
        tx.commit()?;
        Ok(review)
    }

    /// Deletes the session's pending review with its draft threads and replies. Returns whether one existed.
    pub fn discard_review(&self, session_id: &str) -> Result<bool> {
        let mut conn = self.conn()?;
        let tx = conn.transaction()?;
        let Some(review_id) = pending_review_id(&tx, session_id)? else {
            return Ok(false);
        };
        tx.execute("DELETE FROM threads WHERE review_id = ?1", [&review_id])?;
        tx.execute("DELETE FROM comments WHERE review_id = ?1 AND pending = 1", [&review_id])?;
        tx.execute("DELETE FROM reviews WHERE id = ?1", [&review_id])?;
        tx.commit()?;
        Ok(true)
    }

    // ---- github sync ----

    /// Sets the GitHub review-thread node id and/or the root review comment's database id.
    /// `None` leaves the existing value untouched.
    pub fn update_thread_github_ids(
        &self,
        thread_id: &str,
        github_thread_id: Option<&str>,
        github_comment_id: Option<i64>,
    ) -> Result<()> {
        let n = self.conn()?.execute(
            "UPDATE threads SET github_thread_id = COALESCE(?1, github_thread_id), github_comment_id = COALESCE(?2, github_comment_id) WHERE id = ?3",
            params![github_thread_id, github_comment_id, thread_id],
        )?;
        if n == 0 {
            return Err(AppError::not_found(format!("thread {thread_id} not found")));
        }
        Ok(())
    }

    /// Root GitHub review comment id of a synced thread.
    pub fn thread_github_comment_id(&self, thread_id: &str) -> Result<Option<i64>> {
        self.conn()?
            .query_row("SELECT github_comment_id FROM threads WHERE id = ?1", [thread_id], |r| r.get(0))
            .optional()?
            .ok_or_else(|| AppError::not_found(format!("thread {thread_id} not found")))
    }

    pub fn set_comment_github_id(&self, comment_id: &str, github_comment_id: i64) -> Result<()> {
        let n = self.conn()?.execute(
            "UPDATE comments SET github_comment_id = ?1 WHERE id = ?2",
            params![github_comment_id, comment_id],
        )?;
        if n == 0 {
            return Err(AppError::not_found(format!("comment {comment_id} not found")));
        }
        Ok(())
    }

    pub fn find_thread_by_github_id(&self, session_id: &str, github_thread_id: &str) -> Result<Option<Thread>> {
        let conn = self.conn()?;
        let id: Option<String> = conn
            .query_row(
                "SELECT id FROM threads WHERE session_id = ?1 AND github_thread_id = ?2",
                params![session_id, github_thread_id],
                |r| r.get(0),
            )
            .optional()?;
        id.map(|id| load_thread(&conn, &id)).transpose()
    }

    pub fn find_comment_by_github_id(&self, github_comment_id: i64) -> Result<Option<Comment>> {
        Ok(self
            .conn()?
            .query_row(
                &format!("SELECT {COMMENT_COLS} FROM comments WHERE github_comment_id = ?1"),
                [github_comment_id],
                row_to_comment,
            )
            .optional()?)
    }

    /// Imports a GitHub comment into `thread_id` idempotently, keyed by `github_comment_id`.
    /// Existing comments get their body updated when it changed.
    pub fn add_github_comment(
        &self,
        thread_id: &str,
        github_comment_id: i64,
        author_name: &str,
        body: &str,
        created_at: Option<&str>,
    ) -> Result<UpsertOutcome> {
        let mut conn = self.conn()?;
        let tx = conn.transaction()?;
        thread_session(&tx, thread_id)?;
        let existing: Option<(String, String)> = tx
            .query_row(
                "SELECT id, body FROM comments WHERE github_comment_id = ?1",
                [github_comment_id],
                |r| Ok((r.get(0)?, r.get(1)?)),
            )
            .optional()?;
        let outcome = match existing {
            Some((_, old_body)) if old_body == body => UpsertOutcome::Unchanged,
            Some((id, _)) => {
                tx.execute("UPDATE comments SET body = ?1 WHERE id = ?2", params![body, id])?;
                touch_thread(&tx, thread_id, &now())?;
                UpsertOutcome::Updated
            }
            None => {
                let ts = created_at.map(str::to_string).unwrap_or_else(now);
                insert_comment(
                    &tx,
                    thread_id,
                    CommentRow {
                        github_comment_id: Some(github_comment_id),
                        ..CommentRow::new(AuthorType::Github, author_name, body, &ts)
                    },
                )?;
                touch_thread(&tx, thread_id, &now())?;
                UpsertOutcome::Inserted
            }
        };
        tx.commit()?;
        Ok(outcome)
    }

    // ---- viewed files ----

    pub fn list_viewed(&self, session_id: &str) -> Result<Vec<ViewedFile>> {
        let conn = self.conn()?;
        let mut stmt = conn.prepare(
            "SELECT file_path, content_hash FROM viewed_files WHERE session_id = ?1 ORDER BY file_path",
        )?;
        let rows = stmt.query_map([session_id], |r| {
            Ok(ViewedFile {
                file_path: r.get(0)?,
                content_hash: r.get(1)?,
            })
        })?;
        Ok(rows.collect::<rusqlite::Result<Vec<_>>>()?)
    }

    pub fn set_viewed(&self, session_id: &str, file_path: &str, content_hash: &str, viewed: bool) -> Result<()> {
        let conn = self.conn()?;
        if !viewed {
            conn.execute(
                "DELETE FROM viewed_files WHERE session_id = ?1 AND file_path = ?2",
                params![session_id, file_path],
            )?;
            return Ok(());
        }
        conn.execute(
            "INSERT INTO viewed_files (session_id, file_path, content_hash) VALUES (?1, ?2, ?3)
             ON CONFLICT(session_id, file_path) DO UPDATE SET content_hash = excluded.content_hash",
            params![session_id, file_path, content_hash],
        )?;
        Ok(())
    }

    // ---- settings ----

    pub fn get_setting(&self, key: &str) -> Result<Option<String>> {
        Ok(self
            .conn()?
            .query_row("SELECT value FROM settings WHERE key = ?1", [key], |r| r.get(0))
            .optional()?)
    }

    pub fn set_setting(&self, key: &str, value: &str) -> Result<()> {
        self.conn()?.execute(
            "INSERT INTO settings (key, value) VALUES (?1, ?2) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            params![key, value],
        )?;
        Ok(())
    }

    pub fn delete_setting(&self, key: &str) -> Result<()> {
        self.conn()?.execute("DELETE FROM settings WHERE key = ?1", [key])?;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn migrates_in_memory() {
        let store = Store::open_in_memory().unwrap();
        let n: i64 = store
            .conn()
            .unwrap()
            .query_row(
                "SELECT count(*) FROM sqlite_master WHERE type='table'",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(n, 9);
    }
}
