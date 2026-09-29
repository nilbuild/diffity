mod common;

use common::Repo;
use diffity_core::types::TreeEntryKind;
use diffity_core::{git, tree};

#[test]
fn repo_info_and_detection() {
    let repo = Repo::with_commit();
    std::fs::create_dir_all(repo.path.join("src/deep")).unwrap();
    let info = git::repo_info(&repo.path.join("src/deep")).unwrap();
    assert!(info.is_git);
    assert_eq!(info.path, repo.path.to_string_lossy());
    assert_eq!(info.branch.as_deref(), Some("main"));
    assert!(info.head_sha.is_some());
    assert!(info.remote_url.is_none());

    let plain = tempfile::tempdir().unwrap();
    let info = git::repo_info(plain.path()).unwrap();
    assert!(!info.is_git);
    assert_eq!(git::list_branches(plain.path()).unwrap_err().code, "not_a_repo");

    let empty = Repo::empty();
    let info = git::repo_info(&empty.path).unwrap();
    assert!(info.is_git);
    assert!(info.head_sha.is_none());
    assert!(git::list_commits(&empty.path, 10, 0, None).unwrap().is_empty());
}

#[test]
fn commits_branches_status() {
    let repo = Repo::with_commit();
    repo.write("a.txt", "a\n");
    repo.commit("Add alpha feature");
    repo.write("b.txt", "b\n");
    repo.commit("fix bug in beta");

    let all = git::list_commits(&repo.path, 10, 0, None).unwrap();
    assert_eq!(all.len(), 3);
    assert_eq!(all[0].subject, "fix bug in beta");
    assert_eq!(all[0].author, "Test");
    let page = git::list_commits(&repo.path, 1, 1, None).unwrap();
    assert_eq!(page[0].subject, "Add alpha feature");
    let found = git::list_commits(&repo.path, 10, 0, Some("ALPHA")).unwrap();
    assert_eq!(found.len(), 1);
    let by_author = git::list_commits(&repo.path, 10, 0, Some("test")).unwrap();
    assert_eq!(by_author.len(), 3);

    repo.git(&["branch", "other"]);
    let branches = git::list_branches(&repo.path).unwrap();
    assert!(branches.iter().any(|b| b.name == "main" && b.is_current && !b.is_remote));
    assert!(branches.iter().any(|b| b.name == "other" && !b.is_current));

    repo.write("README.md", "changed\n");
    repo.write("staged.txt", "s\n");
    repo.git(&["add", "staged.txt"]);
    repo.write("u1.txt", "u\n");
    repo.write("dir/u2.txt", "u\n");
    let st = git::status(&repo.path).unwrap();
    assert_eq!(st.branch.as_deref(), Some("main"));
    assert_eq!(st.staged, 1);
    assert_eq!(st.unstaged, 1);
    assert_eq!(st.untracked, 2);
    assert!(st.dirty);
}

#[test]
fn upstream_ahead_behind() {
    let origin = Repo::with_commit();
    let clone_dir = tempfile::tempdir().unwrap();
    let clone_path = clone_dir.path().join("clone");
    common::git(
        clone_dir.path(),
        &["clone", "-q", origin.path.to_str().unwrap(), clone_path.to_str().unwrap()],
    );
    common::git(&clone_path, &["config", "commit.gpgsign", "false"]);
    std::fs::write(clone_path.join("x.txt"), "x\n").unwrap();
    common::git(&clone_path, &["add", "-A"]);
    common::git(&clone_path, &["commit", "-q", "-m", "local"]);
    let st = git::status(&clone_path).unwrap();
    assert_eq!(st.upstream.as_deref(), Some("origin/main"));
    assert_eq!(st.ahead, 1);
    let branches = git::list_branches(&clone_path).unwrap();
    let main = branches.iter().find(|b| b.name == "main").unwrap();
    assert_eq!(main.upstream.as_deref(), Some("origin/main"));
    assert_eq!(main.ahead, 1);
    assert_eq!(main.behind, 0);
    assert!(branches.iter().any(|b| b.name == "origin/main" && b.is_remote));
    assert!(!branches.iter().any(|b| b.name.ends_with("HEAD")));
    assert!(git::repo_info(&clone_path).unwrap().remote_url.is_some());
}

#[test]
fn tree_listing_git() {
    let repo = Repo::with_commit();
    repo.write(".gitignore", "target/\n*.log\n");
    repo.write("target/out.o", "x");
    repo.write("debug.log", "x");
    repo.write("docs/guide/intro.md", "# hi\n");
    repo.write("gone.txt", "g\n");
    repo.commit("more");
    std::fs::remove_file(repo.path.join("gone.txt")).unwrap();

    let entries = tree::list_tree(&repo.path).unwrap();
    let paths: Vec<(&str, TreeEntryKind)> = entries.iter().map(|e| (e.path.as_str(), e.kind)).collect();
    assert!(paths.contains(&("docs", TreeEntryKind::Dir)));
    assert!(paths.contains(&("docs/guide", TreeEntryKind::Dir)));
    assert!(paths.contains(&("docs/guide/intro.md", TreeEntryKind::File)));
    assert!(paths.contains(&("src/lib.rs", TreeEntryKind::File)));
    assert!(paths.contains(&(".gitignore", TreeEntryKind::File)));
    assert!(!paths.iter().any(|(p, _)| p.starts_with("target")));
    assert!(!paths.iter().any(|(p, _)| *p == "debug.log"));
    assert!(!paths.iter().any(|(p, _)| *p == "gone.txt"));
    let mut sorted = entries.iter().map(|e| e.path.clone()).collect::<Vec<_>>();
    sorted.sort();
    assert_eq!(sorted, entries.iter().map(|e| e.path.clone()).collect::<Vec<_>>());
}

#[test]
fn tree_listing_plain_folder() {
    let dir = tempfile::tempdir().unwrap();
    let root = dir.path().canonicalize().unwrap();
    std::fs::create_dir_all(root.join("a/b")).unwrap();
    std::fs::write(root.join("a/b/c.txt"), "c").unwrap();
    std::fs::write(root.join(".gitignore"), "skip.txt\n").unwrap();
    std::fs::write(root.join("skip.txt"), "s").unwrap();
    let entries = tree::list_tree(&root).unwrap();
    let paths: Vec<&str> = entries.iter().map(|e| e.path.as_str()).collect();
    assert!(paths.contains(&"a"));
    assert!(paths.contains(&"a/b"));
    assert!(paths.contains(&"a/b/c.txt"));
    assert!(!paths.contains(&"skip.txt"));
}

#[test]
fn read_files_and_guard_paths() {
    let repo = Repo::with_commit();
    repo.write_bytes("img.png", &[137, 80, 78, 71, 0, 0, 1]);
    let text = tree::read_file(&repo.path, "README.md").unwrap();
    assert_eq!(text.contents.as_deref(), Some("hello\n"));
    assert!(!text.binary);
    assert_eq!(text.size, 6);

    let bin = tree::read_file(&repo.path, "img.png").unwrap();
    assert!(bin.binary);
    assert!(bin.contents.is_none());
    assert_eq!(tree::read_file_base64(&repo.path, "img.png").unwrap(), "iVBORwAAAQ==");

    let big = "x".repeat((tree::MAX_TEXT_BYTES + 1) as usize);
    repo.write("big.txt", &big);
    let big = tree::read_file(&repo.path, "big.txt").unwrap();
    assert!(big.contents.is_none());
    assert!(!big.binary);

    assert_eq!(tree::read_file(&repo.path, "../secret").unwrap_err().code, "invalid");
    assert_eq!(tree::read_file(&repo.path, "/etc/passwd").unwrap_err().code, "invalid");
    assert_eq!(tree::read_file(&repo.path, "missing.txt").unwrap_err().code, "not_found");

    let outside = tempfile::tempdir().unwrap();
    std::fs::write(outside.path().join("s.txt"), "secret").unwrap();
    std::os::unix::fs::symlink(outside.path().join("s.txt"), repo.path.join("link.txt")).unwrap();
    assert_eq!(tree::read_file(&repo.path, "link.txt").unwrap_err().code, "invalid");
}

#[test]
fn watcher_filters_paths() {
    use diffity_core::watch::is_relevant;
    let repo = Repo::with_commit();
    repo.write(".gitignore", "target/\n");
    let mut b = ignore::gitignore::GitignoreBuilder::new(&repo.path);
    b.add(repo.path.join(".gitignore"));
    let m = b.build().unwrap();
    let p = |s: &str| repo.path.join(s);
    assert!(is_relevant(&repo.path, &m, &p("src/lib.rs")));
    assert!(is_relevant(&repo.path, &m, &p(".git/HEAD")));
    assert!(is_relevant(&repo.path, &m, &p(".git/index")));
    assert!(is_relevant(&repo.path, &m, &p(".git/refs/heads/main")));
    assert!(!is_relevant(&repo.path, &m, &p(".git/objects/ab/cdef")));
    assert!(!is_relevant(&repo.path, &m, &p(".git/index.lock")));
    assert!(!is_relevant(&repo.path, &m, &p("target/debug/x")));
}

#[test]
fn watcher_emits_changes() {
    use std::sync::mpsc;
    use std::sync::Arc;
    let repo = Repo::with_commit();
    let registry = diffity_core::watch::WatcherRegistry::new();
    let (tx, rx) = mpsc::channel::<String>();
    let tx = std::sync::Mutex::new(tx);
    let key = repo.path.to_string_lossy().into_owned();
    let cb: diffity_core::watch::ChangeCallback = Arc::new(move |p: &str| {
        let _ = tx.lock().unwrap().send(p.to_string());
    });
    registry.watch(&key, cb.clone()).unwrap();
    registry.watch(&key, cb).unwrap();
    assert!(registry.is_watching(&key));
    std::thread::sleep(std::time::Duration::from_millis(300));
    repo.write("src/lib.rs", "changed\n");
    let got = rx.recv_timeout(std::time::Duration::from_secs(5)).expect("repo-changed");
    assert_eq!(got, key);
    registry.unwatch(&key).unwrap();
    assert!(!registry.is_watching(&key));
}

#[test]
fn overview_reports_staged_modified_and_untracked() {
    use diffity_core::types::OverviewStatus;
    let repo = Repo::with_commit();
    repo.write("staged.txt", "s\n");
    repo.git(&["add", "staged.txt"]);
    repo.write("README.md", "changed\n");
    repo.write("new/file.txt", "n\n");
    let files = git::overview(&repo.path).unwrap();
    let status = |p: &str| files.iter().find(|f| f.path == p).map(|f| f.status);
    assert_eq!(status("staged.txt"), Some(OverviewStatus::Staged));
    assert_eq!(status("README.md"), Some(OverviewStatus::Modified));
    assert_eq!(status("new/file.txt"), Some(OverviewStatus::Added));
    assert_eq!(files.len(), 3);

    let empty = Repo::empty();
    empty.write("a.txt", "a\n");
    empty.git(&["add", "a.txt"]);
    let files = git::overview(&empty.path).unwrap();
    assert_eq!(files[0].status, OverviewStatus::Staged);
}
