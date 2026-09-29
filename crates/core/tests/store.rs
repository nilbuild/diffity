use diffity_core::store::UpsertOutcome;
use diffity_core::types::{AuthorType, NewThread, ReviewState, ReviewVerdict, Severity, Side, ThreadStatus};
use diffity_core::Store;

fn new_thread(session_id: &str, body: &str) -> NewThread {
    NewThread {
        session_id: session_id.to_string(),
        file_path: "src/lib.rs".into(),
        side: Side::New,
        start_line: 5,
        end_line: 3,
        body: body.into(),
        severity: Some(Severity::Nit),
        anchor_content: Some("fn b() {}".into()),
        author_type: None,
        author_name: None,
        pending: None,
    }
}

fn pending_thread(session_id: &str, body: &str) -> NewThread {
    NewThread {
        pending: Some(true),
        ..new_thread(session_id, body)
    }
}

#[test]
fn sessions_are_get_or_create() {
    let store = Store::open_in_memory().unwrap();
    let a = store.get_or_create_session("/repo", "work").unwrap();
    let b = store.get_or_create_session("/repo", "work").unwrap();
    let c = store.get_or_create_session("/repo", "main").unwrap();
    assert_eq!(a.id, b.id);
    assert_ne!(a.id, c.id);
    assert_eq!(store.get_session_by_id(&a.id).unwrap().r#ref, "work");
    assert_eq!(store.get_session_by_id("nope").unwrap_err().code, "not_found");
}

#[test]
fn thread_lifecycle() {
    let store = Store::open_in_memory().unwrap();
    let s = store.get_or_create_session("/repo", "work").unwrap();
    let t = store.create_thread(&new_thread(&s.id, "first")).unwrap();
    assert_eq!((t.start_line, t.end_line), (3, 5));
    assert_eq!(t.status, ThreadStatus::Open);
    assert_eq!(t.severity, Some(Severity::Nit));
    assert_eq!(t.comments.len(), 1);
    assert_eq!(t.comments[0].author_type, AuthorType::User);

    let t = store.add_reply(&t.id, "agent reply", AuthorType::Agent, Some("Claude")).unwrap();
    assert_eq!(t.comments.len(), 2);
    assert_eq!(t.comments[1].author_name, "Claude");

    let t = store
        .set_thread_status_as(&t.id, ThreadStatus::Resolved, Some("fixed it"), AuthorType::Agent, Some("Claude"))
        .unwrap();
    assert_eq!(t.status, ThreadStatus::Resolved);
    assert_eq!(t.comments.len(), 3);
    assert_eq!(t.comments[2].body, "fixed it");

    assert_eq!(store.list_threads(&s.id, Some(ThreadStatus::Open)).unwrap().len(), 0);
    assert_eq!(store.list_threads(&s.id, Some(ThreadStatus::Resolved)).unwrap().len(), 1);

    let t = store.add_reply(&t.id, "still broken", AuthorType::User, None).unwrap();
    assert_eq!(t.status, ThreadStatus::Open);

    let t = store.set_thread_status(&t.id, ThreadStatus::Dismissed, None).unwrap();
    assert_eq!(t.comments.len(), 4);
    let t = store.add_reply(&t.id, "agent note", AuthorType::Agent, None).unwrap();
    assert_eq!(t.status, ThreadStatus::Dismissed);

    let first = t.comments[0].id.clone();
    assert_eq!(store.edit_comment(&first, "edited").unwrap(), s.id);
    assert_eq!(store.get_thread(&t.id).unwrap().comments[0].body, "edited");

    let found = store.find_thread_by_prefix(&t.id[..8], None).unwrap();
    assert_eq!(found.id, t.id);
    assert_eq!(store.find_thread_by_prefix(&t.id[..8], Some(&s.id)).unwrap().id, t.id);
    assert_eq!(store.find_thread_by_prefix(&t.id[..8], Some("other")).unwrap_err().code, "not_found");
    assert_eq!(store.find_thread_by_prefix(&t.id[..4], None).unwrap_err().code, "not_found");

    let ids: Vec<String> = store.get_thread(&t.id).unwrap().comments.iter().map(|c| c.id.clone()).collect();
    for id in &ids[..ids.len() - 1] {
        store.delete_comment(id).unwrap();
        assert!(store.get_thread(&t.id).is_ok());
    }
    assert_eq!(store.delete_comment(&ids[ids.len() - 1]).unwrap(), s.id);
    assert_eq!(store.get_thread(&t.id).unwrap_err().code, "not_found");
}

#[test]
fn delete_threads() {
    let store = Store::open_in_memory().unwrap();
    let s = store.get_or_create_session("/repo", "work").unwrap();
    let other = store.get_or_create_session("/repo", "staged").unwrap();
    let a = store.create_thread(&new_thread(&s.id, "a")).unwrap();
    store.create_thread(&new_thread(&s.id, "b")).unwrap();
    store.create_thread(&new_thread(&other.id, "c")).unwrap();
    let listed = store.list_threads(&s.id, None).unwrap();
    assert_eq!(listed.len(), 2);
    assert_eq!(listed[0].comments[0].body, "a");

    assert_eq!(store.delete_thread(&a.id).unwrap(), s.id);
    assert_eq!(store.list_threads(&s.id, None).unwrap().len(), 1);
    store.delete_all_threads(&s.id).unwrap();
    assert!(store.list_threads(&s.id, None).unwrap().is_empty());
    assert_eq!(store.list_threads(&other.id, None).unwrap().len(), 1);

    assert_eq!(store.create_thread(&new_thread("missing", "x")).unwrap_err().code, "not_found");
    assert_eq!(store.create_thread(&new_thread(&s.id, "  ")).unwrap_err().code, "invalid");
}

#[test]
fn github_helpers() {
    let store = Store::open_in_memory().unwrap();
    let s = store.get_or_create_session("/repo", "main..feature").unwrap();
    let t = store.create_thread(&new_thread(&s.id, "local")).unwrap();
    store.update_thread_github_ids(&t.id, Some("PRRT_abc"), Some(101)).unwrap();
    store.update_thread_github_ids(&t.id, None, None).unwrap();
    assert_eq!(store.thread_github_comment_id(&t.id).unwrap(), Some(101));
    let found = store.find_thread_by_github_id(&s.id, "PRRT_abc").unwrap().unwrap();
    assert_eq!(found.github_thread_id.as_deref(), Some("PRRT_abc"));
    assert!(store.find_thread_by_github_id(&s.id, "nope").unwrap().is_none());

    store.set_comment_github_id(&t.comments[0].id, 101).unwrap();
    assert_eq!(store.find_comment_by_github_id(101).unwrap().unwrap().id, t.comments[0].id);

    assert_eq!(store.add_github_comment(&t.id, 202, "octocat", "hi", Some("2026-01-01T00:00:00.000Z")).unwrap(), UpsertOutcome::Inserted);
    assert_eq!(store.add_github_comment(&t.id, 202, "octocat", "hi", None).unwrap(), UpsertOutcome::Unchanged);
    assert_eq!(store.add_github_comment(&t.id, 202, "octocat", "hi!", None).unwrap(), UpsertOutcome::Updated);
    let t = store.get_thread(&t.id).unwrap();
    let gh = t.comments.iter().find(|c| c.github_comment_id == Some(202)).unwrap();
    assert_eq!(gh.author_type, AuthorType::Github);
    assert_eq!(gh.body, "hi!");
}

#[test]
fn viewed_settings_repos() {
    let store = Store::open_in_memory().unwrap();
    store.set_viewed("s1", "a.rs", "h1", true).unwrap();
    store.set_viewed("s1", "a.rs", "h2", true).unwrap();
    store.set_viewed("s1", "b.rs", "h3", true).unwrap();
    let v = store.list_viewed("s1").unwrap();
    assert_eq!(v.len(), 2);
    assert_eq!(v[0].content_hash, "h2");
    store.set_viewed("s1", "a.rs", "", false).unwrap();
    assert_eq!(store.list_viewed("s1").unwrap().len(), 1);

    assert!(store.get_setting("editor").unwrap().is_none());
    store.set_setting("editor", "zed").unwrap();
    store.set_setting("editor", "cursor").unwrap();
    assert_eq!(store.get_setting("editor").unwrap().as_deref(), Some("cursor"));

    store.touch_repo("/a", "a").unwrap();
    std::thread::sleep(std::time::Duration::from_millis(5));
    store.touch_repo("/b", "b").unwrap();
    std::thread::sleep(std::time::Duration::from_millis(5));
    store.touch_repo("/a", "a").unwrap();
    let recent = store.recent_repos(10).unwrap();
    assert_eq!(recent.len(), 2);
    assert_eq!(recent[0].path, "/a");
}

#[test]
fn persists_to_disk() {
    let dir = tempfile::tempdir().unwrap();
    let db = dir.path().join("nested/diffity.db");
    let id = {
        let store = Store::open(&db).unwrap();
        let s = store.get_or_create_session("/repo", "work").unwrap();
        store.create_thread(&new_thread(&s.id, "persist")).unwrap().id
    };
    let store = Store::open(&db).unwrap();
    assert_eq!(store.get_thread(&id).unwrap().comments[0].body, "persist");
}

#[test]
fn pending_review_lifecycle() {
    let store = Store::open_in_memory().unwrap();
    let s = store.get_or_create_session("/repo", "work").unwrap();
    assert!(store.get_pending_review(&s.id).unwrap().is_none());

    let published = store.create_thread(&new_thread(&s.id, "published")).unwrap();
    let published = store
        .set_thread_status(&published.id, ThreadStatus::Resolved, None)
        .unwrap();
    assert!(!published.pending);
    assert!(published.review_id.is_none());

    let draft = store.create_thread(&pending_thread(&s.id, "draft @claude fix")).unwrap();
    assert!(draft.pending);
    assert!(draft.comments[0].pending);
    assert!(draft.comments[0].mentions_agent);
    let review = store.get_pending_review(&s.id).unwrap().unwrap();
    assert_eq!(review.state, ReviewState::Pending);
    assert_eq!(draft.review_id.as_deref(), Some(review.id.as_str()));
    assert_eq!(store.start_review(&s.id).unwrap().id, review.id);

    let draft = store.add_reply(&draft.id, "forced pending", AuthorType::User, None).unwrap();
    assert!(draft.comments[1].pending);

    let replied = store
        .add_reply_with(&published.id, "why this?", AuthorType::User, None, true)
        .unwrap();
    assert!(!replied.pending);
    assert!(replied.comments[1].pending);
    assert_eq!(replied.status, ThreadStatus::Resolved);

    let agent = store
        .add_reply_with(&published.id, "agent answer", AuthorType::Agent, Some("Claude Code"), true)
        .unwrap();
    assert!(!agent.comments[2].pending);
    assert_eq!(agent.status, ThreadStatus::Resolved);

    assert!(store.create_thread(&NewThread {
        author_type: Some(AuthorType::Agent),
        ..pending_thread(&s.id, "agent draft")
    })
    .is_err());

    let listed = store.list_threads(&s.id, None).unwrap();
    assert_eq!(listed.iter().filter(|t| t.pending).count(), 1);
    let review = store.get_pending_review(&s.id).unwrap().unwrap();
    assert_eq!(review.pending_count, 3);
    assert_eq!(review.thread_ids, vec![draft.id.clone(), published.id.clone()]);
    assert_eq!(review.mentioned_thread_ids, vec![draft.id.clone()]);

    std::thread::sleep(std::time::Duration::from_millis(5));
    let submitted = store
        .submit_review(&s.id, " looks good @claude ", ReviewVerdict::RequestChanges)
        .unwrap();
    assert_eq!(submitted.id, review.id);
    assert_eq!(submitted.state, ReviewState::Submitted);
    assert_eq!(submitted.verdict, Some(ReviewVerdict::RequestChanges));
    assert_eq!(submitted.body, "looks good @claude");
    assert!(submitted.body_mentions_agent);
    assert_eq!(submitted.pending_count, 0);
    assert_eq!(submitted.comment_count, 3);
    assert!(submitted.submitted_at.is_some());
    assert!(store.get_pending_review(&s.id).unwrap().is_none());

    let draft = store.get_thread(&draft.id).unwrap();
    assert!(!draft.pending);
    assert!(draft.comments.iter().all(|c| !c.pending));
    let published = store.get_thread(&published.id).unwrap();
    assert_eq!(published.status, ThreadStatus::Open);
    assert_eq!(published.comments.last().unwrap().body, "why this?");

    let next = store.create_thread(&pending_thread(&s.id, "second round")).unwrap();
    assert_ne!(next.review_id, Some(review.id.clone()));
    let reviews = store.list_reviews(&s.id).unwrap();
    assert_eq!(reviews.len(), 2);
    assert_eq!(reviews[1].state, ReviewState::Pending);
}

#[test]
fn discard_and_edit_pending() {
    let store = Store::open_in_memory().unwrap();
    let s = store.get_or_create_session("/repo", "work").unwrap();
    let keep = store.create_thread(&new_thread(&s.id, "keep")).unwrap();
    let draft = store.create_thread(&pending_thread(&s.id, "draft")).unwrap();
    store.add_reply_with(&keep.id, "draft reply", AuthorType::User, None, true).unwrap();
    let edited_id = draft.comments[0].id.clone();
    store.edit_comment(&edited_id, "edited").unwrap();
    assert_eq!(store.get_comment(&edited_id).unwrap().body, "edited");
    assert!(store.get_comment(&edited_id).unwrap().pending);

    assert!(store.discard_review(&s.id).unwrap());
    assert!(!store.discard_review(&s.id).unwrap());
    let threads = store.list_threads(&s.id, None).unwrap();
    assert_eq!(threads.len(), 1);
    assert_eq!(threads[0].comments.len(), 1);
    assert!(store.list_reviews(&s.id).unwrap().is_empty());
}

#[test]
fn submit_rules() {
    let store = Store::open_in_memory().unwrap();
    let s = store.get_or_create_session("/repo", "work").unwrap();
    assert_eq!(store.submit_review(&s.id, "  ", ReviewVerdict::Comment).unwrap_err().code, "invalid");
    let approved = store.submit_review(&s.id, "", ReviewVerdict::Approve).unwrap();
    assert_eq!(approved.comment_count, 0);
    assert_eq!(approved.state, ReviewState::Submitted);
    assert_eq!(store.submit_review("nope", "hi", ReviewVerdict::Comment).unwrap_err().code, "not_found");

    store.start_review(&s.id).unwrap();
    store.start_review(&s.id).unwrap();
    let pending: i64 = store
        .conn()
        .unwrap()
        .query_row("SELECT count(*) FROM reviews WHERE state = 'pending'", [], |r| r.get(0))
        .unwrap();
    assert_eq!(pending, 1);
    let dup = store.conn().unwrap().execute(
        "INSERT INTO reviews (id, session_id, state, body, created_at) VALUES ('x', ?1, 'pending', '', 'now')",
        [&s.id],
    );
    assert!(dup.is_err());
}

#[test]
fn migrates_v1_database() {
    let dir = tempfile::tempdir().unwrap();
    let db = dir.path().join("old.db");
    {
        let conn = rusqlite::Connection::open(&db).unwrap();
        conn.execute_batch(
            "CREATE TABLE review_sessions (id TEXT PRIMARY KEY, repo_path TEXT NOT NULL, ref TEXT NOT NULL, created_at TEXT NOT NULL, UNIQUE(repo_path, ref));
             CREATE TABLE threads (id TEXT PRIMARY KEY, session_id TEXT NOT NULL REFERENCES review_sessions(id) ON DELETE CASCADE,
               file_path TEXT NOT NULL, side TEXT NOT NULL, start_line INTEGER NOT NULL, end_line INTEGER NOT NULL,
               status TEXT NOT NULL DEFAULT 'open', severity TEXT NULL, anchor_content TEXT NULL, github_thread_id TEXT NULL,
               github_comment_id INTEGER NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
             CREATE TABLE comments (id TEXT PRIMARY KEY, thread_id TEXT NOT NULL REFERENCES threads(id) ON DELETE CASCADE,
               author_type TEXT NOT NULL, author_name TEXT NOT NULL, body TEXT NOT NULL, github_comment_id INTEGER NULL, created_at TEXT NOT NULL);
             INSERT INTO review_sessions VALUES ('s1', '/repo', 'work', '2026-01-01T00:00:00Z');
             INSERT INTO threads (id, session_id, file_path, side, start_line, end_line, created_at, updated_at)
               VALUES ('t1', 's1', 'a.rs', 'new', 1, 1, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z');
             INSERT INTO comments VALUES ('c1', 't1', 'user', 'You', 'old @claude', NULL, '2026-01-01T00:00:00Z');
             PRAGMA user_version = 1;",
        )
        .unwrap();
    }
    let store = Store::open(&db).unwrap();
    let version: i64 = store
        .conn()
        .unwrap()
        .pragma_query_value(None, "user_version", |r| r.get(0))
        .unwrap();
    assert_eq!(version, 2);
    let t = store.get_thread("t1").unwrap();
    assert!(!t.pending);
    assert!(t.review_id.is_none());
    assert!(!t.comments[0].pending);
    assert!(t.comments[0].mentions_agent);
    let t = store.add_reply_with("t1", "draft", AuthorType::User, None, true).unwrap();
    assert!(t.comments[1].pending);
    drop(store);
    let store = Store::open(&db).unwrap();
    assert_eq!(store.list_reviews("s1").unwrap().len(), 1);
}

#[test]
fn lists_threads_across_a_repos_sessions() {
    let store = Store::open_in_memory().unwrap();
    let work = store.get_or_create_session("/repo", "work").unwrap();
    let commit = store.get_or_create_session("/repo", "abc1234~1..abc1234").unwrap();
    let other = store.get_or_create_session("/other", "work").unwrap();
    let a = store.create_thread(&new_thread(&work.id, "in work")).unwrap();
    let b = store.create_thread(&new_thread(&commit.id, "in commit")).unwrap();
    store.create_thread(&new_thread(&other.id, "other repo")).unwrap();
    let a = store.add_reply(&a.id, "reply", AuthorType::Agent, Some("Claude")).unwrap();

    let rows = store.list_repo_threads("/repo").unwrap();
    assert_eq!(rows.len(), 2);
    let ids: Vec<&str> = rows.iter().map(|(_, t)| t.id.as_str()).collect();
    assert!(ids.contains(&a.id.as_str()) && ids.contains(&b.id.as_str()));
    let (session, thread) = rows.iter().find(|(_, t)| t.id == a.id).unwrap();
    assert_eq!(session.r#ref, "work");
    assert_eq!(session.repo_path, "/repo");
    assert_eq!(thread.comments.len(), 2);
    let (session, _) = rows.iter().find(|(_, t)| t.id == b.id).unwrap();
    assert_eq!(session.r#ref, "abc1234~1..abc1234");
    assert!(store.list_repo_threads("/nowhere").unwrap().is_empty());
}
