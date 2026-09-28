use std::path::Path;
use std::sync::{Mutex, MutexGuard};

use rusqlite::{params, Connection, OptionalExtension, Row};

use crate::error::{AppError, Result};
use crate::types::{
    AuthorType, Comment, NewThread, RecentRepo, ReviewSession, Severity, Side, Thread, ThreadStatus, ViewedFile,
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

const SCHEMA_VERSION: i64 = 1;

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
        let version: i64 = conn.pragma_query_value(None, "user_version", |r| r.get(0))?;
        if version < SCHEMA_VERSION {
            conn.execute_batch(SCHEMA)?;
            conn.pragma_update(None, "user_version", SCHEMA_VERSION)?;
        }
        Ok(Store {
            conn: Mutex::new(conn),
        })
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

const THREAD_COLS: &str = "id, session_id, file_path, side, start_line, end_line, status, severity, anchor_content, github_thread_id, created_at, updated_at";
const COMMENT_COLS: &str = "id, thread_id, author_type, author_name, body, github_comment_id, created_at";

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
    })
}

fn row_to_comment(r: &Row) -> rusqlite::Result<Comment> {
    let author: String = r.get(2)?;
    Ok(Comment {
        id: r.get(0)?,
        thread_id: r.get(1)?,
        author_type: parse_author(&author),
        author_name: r.get(3)?,
        body: r.get(4)?,
        github_comment_id: r.get(5)?,
        created_at: r.get(6)?,
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
    let comments = load_comments(conn, thread_id)?;
    Ok(Thread { comments, ..thread })
}

fn insert_comment(
    conn: &Connection,
    thread_id: &str,
    author_type: AuthorType,
    author_name: &str,
    body: &str,
    github_comment_id: Option<i64>,
    created_at: &str,
) -> Result<Comment> {
    let id = new_id();
    conn.execute(
        "INSERT INTO comments (id, thread_id, author_type, author_name, body, github_comment_id, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        params![id, thread_id, author_str(author_type), author_name, body, github_comment_id, created_at],
    )?;
    Ok(Comment {
        id,
        thread_id: thread_id.to_string(),
        author_type,
        author_name: author_name.to_string(),
        body: body.to_string(),
        created_at: created_at.to_string(),
        github_comment_id,
    })
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
            .map(|t| {
                let comments = load_comments(&conn, &t.id)?;
                Ok(Thread { comments, ..t })
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
        tx.execute(
            "INSERT INTO threads (id, session_id, file_path, side, start_line, end_line, status, severity, anchor_content, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, 'open', ?7, ?8, ?9, ?9)",
            params![
                id,
                input.session_id,
                input.file_path,
                side_str(input.side),
                start,
                end,
                input.severity.map(severity_str),
                input.anchor_content,
                ts
            ],
        )?;
        let author_type = input.author_type.unwrap_or(AuthorType::User);
        let author_name = input
            .author_name
            .clone()
            .filter(|n| !n.trim().is_empty())
            .unwrap_or_else(|| default_author_name(author_type).to_string());
        insert_comment(&tx, &id, author_type, &author_name, &input.body, None, &ts)?;
        let thread = load_thread(&tx, &id)?;
        tx.commit()?;
        Ok(thread)
    }

    /// Appends a comment. A user reply to a resolved/dismissed thread reopens it.
    pub fn add_reply(
        &self,
        thread_id: &str,
        body: &str,
        author_type: AuthorType,
        author_name: Option<&str>,
    ) -> Result<Thread> {
        if body.trim().is_empty() {
            return Err(AppError::invalid("comment body is empty"));
        }
        let mut conn = self.conn()?;
        let tx = conn.transaction()?;
        thread_session(&tx, thread_id)?;
        let ts = now();
        let name = author_name
            .filter(|n| !n.trim().is_empty())
            .unwrap_or(default_author_name(author_type));
        insert_comment(&tx, thread_id, author_type, name, body, None, &ts)?;
        if author_type == AuthorType::User {
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
            insert_comment(&tx, thread_id, author_type, name, summary, None, &ts)?;
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
                insert_comment(&tx, thread_id, AuthorType::Github, author_name, body, Some(github_comment_id), &ts)?;
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
        assert_eq!(n, 8);
    }
}
