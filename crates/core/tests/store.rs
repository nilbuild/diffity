use diffity_core::store::UpsertOutcome;
use diffity_core::types::{AuthorType, NewThread, Severity, Side, ThreadStatus};
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
