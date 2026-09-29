mod common;

use common::Repo;
use diffity_core::repo_threads::{commit_ref, list_repo_threads};
use diffity_core::types::{AuthorType, NewThread, RepoThread, Side, ThreadAnchor, TREE_REF};
use diffity_core::Store;

fn thread(session_id: &str, file: &str, side: Side, lines: (u32, u32), anchor: Option<&str>, body: &str) -> NewThread {
    NewThread {
        session_id: session_id.to_string(),
        file_path: file.into(),
        side,
        start_line: lines.0,
        end_line: lines.1,
        body: body.into(),
        severity: None,
        anchor_content: anchor.map(str::to_string),
        author_type: Some(AuthorType::Agent),
        author_name: Some("Claude Code".into()),
        pending: None,
    }
}

fn find<'a>(threads: &'a [RepoThread], id: &str) -> &'a RepoThread {
    threads.iter().find(|t| t.id == id).expect("thread listed")
}

#[test]
fn anchors_and_labels_threads_across_views() {
    let repo = Repo::with_commit();
    let path = repo.path.to_string_lossy().to_string();
    let store = Store::open_in_memory().unwrap();

    repo.write("src/lib.rs", "fn a() {}\nfn b2() {}\nfn c() {}\n");
    repo.write("notes.txt", "one\ntwo\n");
    let work = store.get_or_create_session(&path, "work").unwrap();
    let on_line = store
        .create_thread(&thread(&work.id, "src/lib.rs", Side::New, (2, 2), Some("fn b2() {}"), "rename b2"))
        .unwrap();
    let far = store
        .create_thread(&thread(&work.id, "src/lib.rs", Side::New, (40, 41), None, "way below"))
        .unwrap();
    let untouched = store
        .create_thread(&thread(&work.id, "README.md", Side::New, (1, 1), None, "readme"))
        .unwrap();
    let head = repo.git(&["rev-parse", "HEAD"]);
    let commit_session = store.get_or_create_session(&path, &commit_ref(&head)).unwrap();
    let in_commit = store
        .create_thread(&thread(&commit_session.id, "README.md", Side::New, (1, 1), None, "hello?"))
        .unwrap();
    let tree = store.get_or_create_session(&path, TREE_REF).unwrap();
    let tree_thread = store
        .create_thread(&thread(&tree.id, "__path__:src", Side::New, (0, 0), None, "folder note"))
        .unwrap();
    let gone = store.get_or_create_session(&path, "no-such-branch...HEAD").unwrap();
    let gone_thread = store
        .create_thread(&thread(&gone.id, "src/lib.rs", Side::New, (1, 1), None, "lost"))
        .unwrap();

    let threads = list_repo_threads(&store, &path).unwrap();
    assert_eq!(threads.len(), 6);
    let t = find(&threads, &on_line.id);
    assert_eq!(t.anchor, ThreadAnchor::Current);
    assert_eq!(t.ref_label, "Uncommitted changes");
    assert_eq!(t.r#ref, "work");
    assert_eq!(t.excerpt, "rename b2");
    assert_eq!(t.author_type, AuthorType::Agent);
    assert_eq!(t.reply_count, 0);
    assert_eq!(find(&threads, &far.id).anchor, ThreadAnchor::Outdated);
    assert_eq!(find(&threads, &untouched.id).anchor, ThreadAnchor::FileGone);
    let c = find(&threads, &in_commit.id);
    assert_eq!(c.anchor, ThreadAnchor::Current);
    assert_eq!(c.ref_label, format!("Commit {} · initial", &head[..7]));
    assert_eq!(find(&threads, &tree_thread.id).anchor, ThreadAnchor::Current);
    assert_eq!(find(&threads, &tree_thread.id).ref_label, "Files");
    assert_eq!(find(&threads, &gone_thread.id).anchor, ThreadAnchor::Unknown);

    let sha = repo.commit("rename b");
    let threads = list_repo_threads(&store, &path).unwrap();
    let t = find(&threads, &on_line.id);
    assert_eq!(t.anchor, ThreadAnchor::ViewEmpty);
    let moved = t.moved_to.as_ref().expect("points at the new commit");
    assert_eq!(moved.sha, sha);
    assert_eq!(moved.r#ref, commit_ref(&sha));
    assert_eq!(moved.subject, "rename b");
    assert_eq!(find(&threads, &far.id).moved_to, None);
    assert_eq!(find(&threads, &untouched.id).anchor, ThreadAnchor::ViewEmpty);
    assert_eq!(find(&threads, &untouched.id).moved_to, None);
}
