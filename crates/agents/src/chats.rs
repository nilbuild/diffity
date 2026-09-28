use diffity_core::store::Store;
use diffity_core::{AppError, Result};
use rusqlite::{params, OptionalExtension, Row};

use crate::types::{AgentMode, Chat, ChatMessage, ChatMessageContent, ChatRole};

const EXTRA_SCHEMA: &str = "CREATE TABLE IF NOT EXISTS agent_chat_sessions (
  chat_id TEXT PRIMARY KEY REFERENCES chats(id) ON DELETE CASCADE,
  session_id TEXT NOT NULL
);";

#[derive(Debug, Clone)]
pub struct ChatRecord {
    pub chat: Chat,
    pub acp_session_id: Option<String>,
    pub review_session_id: Option<String>,
}

fn now() -> String {
    chrono::Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Millis, true)
}

fn mode_str(mode: AgentMode) -> &'static str {
    match mode {
        AgentMode::Ask => "ask",
        AgentMode::Review => "review",
        AgentMode::Resolve => "resolve",
        AgentMode::Edit => "edit",
    }
}

fn parse_mode(s: &str) -> AgentMode {
    match s {
        "review" => AgentMode::Review,
        "resolve" => AgentMode::Resolve,
        "edit" => AgentMode::Edit,
        _ => AgentMode::Ask,
    }
}

pub fn init(store: &Store) -> Result<()> {
    store.conn()?.execute_batch(EXTRA_SCHEMA)?;
    Ok(())
}

pub fn insert(
    store: &Store,
    repo_path: &str,
    agent_id: &str,
    mode: AgentMode,
    title: &str,
    review_session_id: &str,
) -> Result<Chat> {
    let ts = now();
    let chat = Chat {
        id: uuid::Uuid::new_v4().to_string(),
        repo_path: repo_path.into(),
        agent_id: agent_id.into(),
        mode,
        title: title.into(),
        created_at: ts.clone(),
        updated_at: ts,
    };
    let mut conn = store.conn()?;
    let tx = conn.transaction()?;
    tx.execute(
        "INSERT INTO chats(id, repo_path, agent_id, acp_session_id, mode, title, created_at, updated_at) VALUES (?1, ?2, ?3, NULL, ?4, ?5, ?6, ?7)",
        params![chat.id, chat.repo_path, chat.agent_id, mode_str(mode), chat.title, chat.created_at, chat.updated_at],
    )?;
    if !review_session_id.is_empty() {
        tx.execute(
            "INSERT INTO agent_chat_sessions(chat_id, session_id) VALUES (?1, ?2)",
            params![chat.id, review_session_id],
        )?;
    }
    tx.commit()?;
    Ok(chat)
}

fn chat_from_row(row: &Row<'_>) -> rusqlite::Result<ChatRecord> {
    let mode: String = row.get("mode")?;
    Ok(ChatRecord {
        chat: Chat {
            id: row.get("id")?,
            repo_path: row.get("repo_path")?,
            agent_id: row.get("agent_id")?,
            mode: parse_mode(&mode),
            title: row.get("title")?,
            created_at: row.get("created_at")?,
            updated_at: row.get("updated_at")?,
        },
        acp_session_id: row.get("acp_session_id")?,
        review_session_id: row.get("session_id")?,
    })
}

const SELECT: &str = "SELECT c.id, c.repo_path, c.agent_id, c.acp_session_id, c.mode, c.title, c.created_at, c.updated_at, s.session_id
  FROM chats c LEFT JOIN agent_chat_sessions s ON s.chat_id = c.id";

pub fn get(store: &Store, chat_id: &str) -> Result<ChatRecord> {
    let conn = store.conn()?;
    conn.query_row(
        &format!("{SELECT} WHERE c.id = ?1"),
        params![chat_id],
        chat_from_row,
    )
    .optional()?
    .ok_or_else(|| AppError::not_found(format!("chat {chat_id} not found")))
}

pub fn list(store: &Store, repo_path: &str) -> Result<Vec<Chat>> {
    let conn = store.conn()?;
    let mut stmt = conn.prepare(&format!(
        "{SELECT} WHERE c.repo_path = ?1 ORDER BY c.updated_at DESC"
    ))?;
    let rows = stmt.query_map(params![repo_path], chat_from_row)?;
    let mut out = Vec::new();
    for row in rows {
        out.push(row?.chat);
    }
    Ok(out)
}

pub fn set_acp_session(store: &Store, chat_id: &str, acp_session_id: &str) -> Result<()> {
    store.conn()?.execute(
        "UPDATE chats SET acp_session_id = ?2 WHERE id = ?1",
        params![chat_id, acp_session_id],
    )?;
    Ok(())
}

pub fn set_review_session(store: &Store, chat_id: &str, session_id: &str) -> Result<()> {
    store.conn()?.execute(
        "INSERT INTO agent_chat_sessions(chat_id, session_id) VALUES (?1, ?2)
         ON CONFLICT(chat_id) DO UPDATE SET session_id = excluded.session_id",
        params![chat_id, session_id],
    )?;
    Ok(())
}

pub fn delete(store: &Store, chat_id: &str) -> Result<()> {
    store
        .conn()?
        .execute("DELETE FROM chats WHERE id = ?1", params![chat_id])?;
    Ok(())
}

pub fn add_message(
    store: &Store,
    chat_id: &str,
    role: ChatRole,
    content: &ChatMessageContent,
) -> Result<ChatMessage> {
    let msg = ChatMessage {
        id: uuid::Uuid::new_v4().to_string(),
        chat_id: chat_id.into(),
        role,
        content: content.clone(),
        created_at: now(),
    };
    let role_str = match role {
        ChatRole::User => "user",
        ChatRole::Agent => "agent",
    };
    let json = serde_json::to_string(content)?;
    let conn = store.conn()?;
    conn.execute(
        "INSERT INTO chat_messages(id, chat_id, role, content_json, created_at) VALUES (?1, ?2, ?3, ?4, ?5)",
        params![msg.id, chat_id, role_str, json, msg.created_at],
    )?;
    conn.execute(
        "UPDATE chats SET updated_at = ?2 WHERE id = ?1",
        params![chat_id, msg.created_at],
    )?;
    Ok(msg)
}

pub fn count_messages(store: &Store, chat_id: &str) -> Result<i64> {
    let conn = store.conn()?;
    Ok(conn.query_row(
        "SELECT count(*) FROM chat_messages WHERE chat_id = ?1",
        params![chat_id],
        |r| r.get(0),
    )?)
}

pub fn messages(store: &Store, chat_id: &str) -> Result<Vec<ChatMessage>> {
    let conn = store.conn()?;
    let mut stmt = conn.prepare(
        "SELECT id, chat_id, role, content_json, created_at FROM chat_messages WHERE chat_id = ?1 ORDER BY created_at, rowid",
    )?;
    let rows = stmt.query_map(params![chat_id], |row| {
        Ok((
            row.get::<_, String>(0)?,
            row.get::<_, String>(1)?,
            row.get::<_, String>(2)?,
            row.get::<_, String>(3)?,
            row.get::<_, String>(4)?,
        ))
    })?;
    let mut out = Vec::new();
    for row in rows {
        let (id, chat_id, role, json, created_at) = row?;
        let role = if role == "user" {
            ChatRole::User
        } else {
            ChatRole::Agent
        };
        let content: ChatMessageContent = serde_json::from_str(&json)?;
        out.push(ChatMessage {
            id,
            chat_id,
            role,
            content,
            created_at,
        });
    }
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::types::{AgentEvent, UserMessageContent};

    #[test]
    fn chat_crud_and_messages() {
        let store = Store::open_in_memory().unwrap();
        init(&store).unwrap();
        let chat = insert(&store, "/r", "claude", AgentMode::Review, "Review", "sess").unwrap();
        let rec = get(&store, &chat.id).unwrap();
        assert_eq!(rec.review_session_id.as_deref(), Some("sess"));
        assert_eq!(rec.chat.mode, AgentMode::Review);
        set_acp_session(&store, &chat.id, "acp-1").unwrap();
        assert_eq!(
            get(&store, &chat.id).unwrap().acp_session_id.as_deref(),
            Some("acp-1")
        );

        add_message(
            &store,
            &chat.id,
            ChatRole::User,
            &ChatMessageContent::User(UserMessageContent {
                text: "hi".into(),
                context: vec![],
            }),
        )
        .unwrap();
        add_message(
            &store,
            &chat.id,
            ChatRole::Agent,
            &ChatMessageContent::Agent(vec![AgentEvent::Done {
                stop_reason: "end_turn".into(),
            }]),
        )
        .unwrap();
        let msgs = messages(&store, &chat.id).unwrap();
        assert_eq!(msgs.len(), 2);
        assert!(matches!(msgs[0].content, ChatMessageContent::User(_)));
        assert!(matches!(msgs[1].content, ChatMessageContent::Agent(_)));

        assert_eq!(list(&store, "/r").unwrap().len(), 1);
        delete(&store, &chat.id).unwrap();
        assert!(get(&store, &chat.id).is_err());
    }
}
