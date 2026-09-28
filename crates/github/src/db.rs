use diffity_core::store::Store;
use diffity_core::types::{AuthorType, Comment, Severity, Side, Thread, ThreadStatus};
use diffity_core::{AppError, Result};
use rusqlite::{params, Connection, OptionalExtension};
use serde::de::DeserializeOwned;
use serde::Serialize;

fn enum_to_string<T: Serialize>(value: &T) -> String {
    serde_json::to_value(value)
        .ok()
        .and_then(|v| v.as_str().map(str::to_string))
        .unwrap_or_default()
}

fn enum_from_string<T: DeserializeOwned>(value: &str) -> Result<T> {
    serde_json::from_value(serde_json::Value::String(value.to_string()))
        .map_err(|e| AppError::internal(format!("bad stored value '{value}': {e}")))
}

fn now() -> String {
    chrono::Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Millis, true)
}

pub fn get_setting(store: &Store, key: &str) -> Result<Option<String>> {
    let conn = store.conn()?;
    Ok(conn
        .query_row("SELECT value FROM settings WHERE key = ?1", [key], |r| r.get(0))
        .optional()?)
}

pub fn set_setting(store: &Store, key: &str, value: &str) -> Result<()> {
    let conn = store.conn()?;
    conn.execute(
        "INSERT INTO settings(key, value) VALUES(?1, ?2) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        params![key, value],
    )?;
    Ok(())
}

pub fn delete_setting(store: &Store, key: &str) -> Result<()> {
    let conn = store.conn()?;
    conn.execute("DELETE FROM settings WHERE key = ?1", [key])?;
    Ok(())
}

fn load_comments(conn: &Connection, thread_id: &str) -> Result<Vec<Comment>> {
    let mut stmt = conn.prepare(
        "SELECT id, thread_id, author_type, author_name, body, created_at, github_comment_id
         FROM comments WHERE thread_id = ?1 ORDER BY created_at, rowid",
    )?;
    let rows = stmt.query_map([thread_id], |r| {
        Ok((
            r.get::<_, String>(0)?,
            r.get::<_, String>(1)?,
            r.get::<_, String>(2)?,
            r.get::<_, String>(3)?,
            r.get::<_, String>(4)?,
            r.get::<_, String>(5)?,
            r.get::<_, Option<i64>>(6)?,
        ))
    })?;
    let mut out = Vec::new();
    for row in rows {
        let (id, thread_id, author_type, author_name, body, created_at, github_comment_id) = row?;
        out.push(Comment {
            id,
            thread_id,
            author_type: enum_from_string::<AuthorType>(&author_type)?,
            author_name,
            body,
            created_at,
            github_comment_id,
        });
    }
    Ok(out)
}

const THREAD_COLUMNS: &str = "id, session_id, file_path, side, start_line, end_line, status, severity, \
     anchor_content, github_thread_id, created_at, updated_at";

fn thread_from_row(conn: &Connection, r: &rusqlite::Row<'_>) -> Result<Thread> {
    let id: String = r.get(0)?;
    let side: String = r.get(3)?;
    let status: String = r.get(6)?;
    let severity: Option<String> = r.get(7)?;
    let comments = load_comments(conn, &id)?;
    Ok(Thread {
        id,
        session_id: r.get(1)?,
        file_path: r.get(2)?,
        side: enum_from_string::<Side>(&side)?,
        start_line: r.get(4)?,
        end_line: r.get(5)?,
        status: enum_from_string::<ThreadStatus>(&status)?,
        severity: severity.map(|s| enum_from_string::<Severity>(&s)).transpose()?,
        anchor_content: r.get(8)?,
        github_thread_id: r.get(9)?,
        comments,
        created_at: r.get(10)?,
        updated_at: r.get(11)?,
    })
}

pub fn get_thread(store: &Store, thread_id: &str) -> Result<Thread> {
    let conn = store.conn()?;
    let sql = format!("SELECT {THREAD_COLUMNS} FROM threads WHERE id = ?1");
    let mut stmt = conn.prepare(&sql)?;
    let mut rows = stmt.query([thread_id])?;
    match rows.next()? {
        Some(row) => thread_from_row(&conn, row),
        None => Err(AppError::not_found(format!("thread {thread_id} not found"))),
    }
}

pub fn list_session_threads(store: &Store, session_id: &str) -> Result<Vec<Thread>> {
    let conn = store.conn()?;
    let sql = format!("SELECT {THREAD_COLUMNS} FROM threads WHERE session_id = ?1 ORDER BY created_at, rowid");
    let mut stmt = conn.prepare(&sql)?;
    let mut rows = stmt.query([session_id])?;
    let mut out = Vec::new();
    while let Some(row) = rows.next()? {
        out.push(thread_from_row(&conn, row)?);
    }
    Ok(out)
}

pub fn set_thread_github_ids(store: &Store, thread_id: &str, github_thread_id: &str, first_comment_id: Option<i64>) -> Result<()> {
    let conn = store.conn()?;
    conn.execute(
        "UPDATE threads SET github_thread_id = ?2, github_comment_id = ?3, updated_at = ?4 WHERE id = ?1",
        params![thread_id, github_thread_id, first_comment_id, now()],
    )?;
    Ok(())
}

pub fn set_comment_github_id(store: &Store, comment_id: &str, github_comment_id: i64) -> Result<()> {
    let conn = store.conn()?;
    conn.execute(
        "UPDATE comments SET github_comment_id = ?2 WHERE id = ?1",
        params![comment_id, github_comment_id],
    )?;
    Ok(())
}

pub fn set_thread_status(store: &Store, thread_id: &str, status: ThreadStatus) -> Result<()> {
    let conn = store.conn()?;
    conn.execute(
        "UPDATE threads SET status = ?2, updated_at = ?3 WHERE id = ?1",
        params![thread_id, enum_to_string(&status), now()],
    )?;
    Ok(())
}

pub struct NewComment<'a> {
    pub author_type: AuthorType,
    pub author_name: &'a str,
    pub body: &'a str,
    pub github_comment_id: Option<i64>,
    pub created_at: Option<&'a str>,
}

pub fn insert_comment(store: &Store, thread_id: &str, comment: &NewComment<'_>) -> Result<String> {
    let conn = store.conn()?;
    let id = uuid::Uuid::new_v4().to_string();
    let ts = now();
    conn.execute(
        "INSERT INTO comments(id, thread_id, author_type, author_name, body, github_comment_id, created_at)
         VALUES(?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        params![
            id,
            thread_id,
            enum_to_string(&comment.author_type),
            comment.author_name,
            comment.body,
            comment.github_comment_id,
            comment.created_at.unwrap_or(&ts),
        ],
    )?;
    conn.execute("UPDATE threads SET updated_at = ?2 WHERE id = ?1", params![thread_id, ts])?;
    Ok(id)
}

pub struct NewRemoteThread<'a> {
    pub session_id: &'a str,
    pub file_path: &'a str,
    pub side: Side,
    pub start_line: u32,
    pub end_line: u32,
    pub status: ThreadStatus,
    pub github_thread_id: &'a str,
    pub first_comment_id: Option<i64>,
    pub created_at: &'a str,
}

pub fn insert_remote_thread(store: &Store, thread: &NewRemoteThread<'_>) -> Result<String> {
    let conn = store.conn()?;
    let id = uuid::Uuid::new_v4().to_string();
    conn.execute(
        "INSERT INTO threads(id, session_id, file_path, side, start_line, end_line, status, severity,
                             anchor_content, github_thread_id, github_comment_id, created_at, updated_at)
         VALUES(?1, ?2, ?3, ?4, ?5, ?6, ?7, NULL, NULL, ?8, ?9, ?10, ?11)",
        params![
            id,
            thread.session_id,
            thread.file_path,
            enum_to_string(&thread.side),
            thread.start_line,
            thread.end_line,
            enum_to_string(&thread.status),
            thread.github_thread_id,
            thread.first_comment_id,
            thread.created_at,
            now(),
        ],
    )?;
    Ok(id)
}

pub fn reopen_thread(store: &Store, thread_id: &str) -> Result<()> {
    set_thread_status(store, thread_id, ThreadStatus::Open)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn seed(store: &Store) {
        let conn = store.conn().unwrap();
        conn.execute(
            "INSERT INTO review_sessions(id, repo_path, ref, created_at) VALUES('s1', '/r', 'work', 'x')",
            [],
        )
        .unwrap();
    }

    #[test]
    fn remote_thread_roundtrip() {
        let store = Store::open_in_memory().unwrap();
        seed(&store);
        let id = insert_remote_thread(
            &store,
            &NewRemoteThread {
                session_id: "s1",
                file_path: "a.rs",
                side: Side::Old,
                start_line: 1,
                end_line: 2,
                status: ThreadStatus::Resolved,
                github_thread_id: "T1",
                first_comment_id: Some(5),
                created_at: "2024-01-01T00:00:00Z",
            },
        )
        .unwrap();
        insert_comment(
            &store,
            &id,
            &NewComment {
                author_type: AuthorType::Github,
                author_name: "bob",
                body: "hi",
                github_comment_id: Some(5),
                created_at: Some("2024-01-01T00:00:00Z"),
            },
        )
        .unwrap();
        let t = get_thread(&store, &id).unwrap();
        assert_eq!(t.side, Side::Old);
        assert_eq!(t.status, ThreadStatus::Resolved);
        assert_eq!(t.github_thread_id.as_deref(), Some("T1"));
        assert_eq!(t.comments.len(), 1);
        assert_eq!(t.comments[0].author_type, AuthorType::Github);
        assert_eq!(t.comments[0].github_comment_id, Some(5));
        assert_eq!(list_session_threads(&store, "s1").unwrap().len(), 1);
        set_thread_status(&store, &id, ThreadStatus::Open).unwrap();
        assert_eq!(get_thread(&store, &id).unwrap().status, ThreadStatus::Open);
    }
}
