mod common;

use common::Repo;
use diffity_desktop_lib::core::types::TreeEntryKind;
use diffity_desktop_lib::core::{git, tree};

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
    assert_eq!((all[0].files_changed, all[0].additions, all[0].deletions), (1, 1, 0));
    assert_eq!(all[2].files_changed, 2);
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
fn tree_listing_marks_diff_ignored_files() {
    let repo = Repo::with_commit();
    repo.write(".diffityignore", "generated/\n*.snap\n");
    repo.write("generated/api/client.ts", "x");
    repo.write("tests/a.snap", "x");
    repo.commit("more");
    let entries = tree::list_tree(&repo.path).unwrap();
    let ignored = |p: &str| entries.iter().find(|e| e.path == p).map(|e| e.diff_ignored);
    assert_eq!(ignored("generated"), Some(true));
    assert_eq!(ignored("generated/api/client.ts"), Some(true));
    assert_eq!(ignored("tests/a.snap"), Some(true));
    assert_eq!(ignored("tests"), Some(false));
    assert_eq!(ignored("src/lib.rs"), Some(false));
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
    use diffity_desktop_lib::core::watch::is_relevant;
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
    let registry = diffity_desktop_lib::core::watch::WatcherRegistry::new();
    let (tx, rx) = mpsc::channel::<String>();
    let tx = std::sync::Mutex::new(tx);
    let key = repo.path.to_string_lossy().into_owned();
    let cb: diffity_desktop_lib::core::watch::ChangeCallback = Arc::new(move |p: &str| {
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
    assert!(registry.is_watching(&key), "one watch is still held");
    registry.unwatch(&key).unwrap();
    assert!(!registry.is_watching(&key));
}

#[test]
fn watcher_skips_ignored_changes() {
    use std::sync::mpsc;
    use std::sync::Arc;
    use std::time::Duration;
    let repo = Repo::with_commit();
    repo.write(".gitignore", "node_modules/\n");
    repo.write("node_modules/pkg/index.js", "a\n");
    let registry = diffity_desktop_lib::core::watch::WatcherRegistry::new();
    let (tx, rx) = mpsc::channel::<()>();
    let tx = std::sync::Mutex::new(tx);
    let key = repo.path.to_string_lossy().into_owned();
    let cb: diffity_desktop_lib::core::watch::ChangeCallback = Arc::new(move |_: &str| {
        let _ = tx.lock().unwrap().send(());
    });
    registry.watch(&key, cb).unwrap();
    // FSEvents on a busy runner can deliver the setup's own writes (the commit, .gitignore) late, after any fixed
    // sleep, so wait until the watcher has been quiet for a full second before writing ignored files.
    let deadline = std::time::Instant::now() + Duration::from_secs(10);
    while rx.recv_timeout(Duration::from_secs(1)).is_ok() {
        assert!(std::time::Instant::now() < deadline, "watcher never went quiet after setup");
    }
    for i in 0..50 {
        repo.write(&format!("node_modules/pkg/f{i}.js"), "b\n");
    }
    assert!(rx.recv_timeout(Duration::from_millis(800)).is_err(), "ignored writes fired");
    repo.write("probe.txt", "probe\n");
    rx.recv_timeout(Duration::from_secs(5)).expect("repo-changed");
    registry.unwatch(&key).unwrap();
}

#[test]
fn watcher_survives_out_of_order_unwatch() {
    use std::sync::Arc;
    let repo = Repo::with_commit();
    let registry = diffity_desktop_lib::core::watch::WatcherRegistry::new();
    let key = repo.path.to_string_lossy().into_owned();
    let cb: diffity_desktop_lib::core::watch::ChangeCallback = Arc::new(|_: &str| {});
    // A remount: the first unmount's unwatch lands after the second mount's watch.
    registry.watch(&key, cb.clone()).unwrap();
    registry.watch(&key, cb.clone()).unwrap();
    registry.unwatch(&key).unwrap();
    assert!(registry.is_watching(&key));
    registry.unwatch(&key).unwrap();
    assert!(!registry.is_watching(&key));

    // The unwatch lands before the watch it pairs with.
    registry.unwatch(&key).unwrap();
    registry.watch(&key, cb.clone()).unwrap();
    assert!(!registry.is_watching(&key));
    registry.watch(&key, cb).unwrap();
    assert!(registry.is_watching(&key));
    registry.unwatch(&key).unwrap();
    assert!(!registry.is_watching(&key));
}

#[test]
fn overview_reports_staged_modified_and_untracked() {
    use diffity_desktop_lib::core::types::OverviewStatus;
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

#[test]
fn lists_worktrees() {
    let repo = Repo::with_commit();
    let parent = tempfile::tempdir().unwrap();
    let parent = parent.path().canonicalize().unwrap();
    let feature = parent.join("feature");
    let detached = parent.join("detached");
    let gone = parent.join("gone");
    common::git(&repo.path, &["worktree", "add", "-q", "-b", "feature", feature.to_str().unwrap()]);
    common::git(&repo.path, &["worktree", "add", "-q", "--detach", detached.to_str().unwrap()]);
    common::git(&repo.path, &["worktree", "add", "-q", "-b", "gone", gone.to_str().unwrap()]);
    std::fs::remove_dir_all(&gone).unwrap();

    let list = git::list_worktrees(&repo.path).unwrap();
    assert_eq!(list.len(), 3);
    assert_eq!(list[0].path, repo.path.to_string_lossy());
    assert!(list[0].is_main && list[0].is_current);
    assert_eq!(list[0].branch.as_deref(), Some("main"));
    let find = |list: &[diffity_desktop_lib::core::types::Worktree], path: &std::path::Path| {
        list.iter().find(|tree| tree.path == path.to_string_lossy()).cloned().unwrap()
    };
    let on_feature = find(&list, &feature);
    assert_eq!(on_feature.branch.as_deref(), Some("feature"));
    assert!(!on_feature.is_main && !on_feature.is_current);
    let on_detached = find(&list, &detached);
    assert!(on_detached.branch.is_none());
    assert_eq!(on_detached.head.as_ref().map(String::len), Some(7));

    let from_feature = git::list_worktrees(&feature).unwrap();
    assert!(!from_feature[0].is_current);
    assert!(find(&from_feature, &feature).is_current);

    let plain = tempfile::tempdir().unwrap();
    assert_eq!(git::list_worktrees(plain.path()).unwrap_err().code, "not_a_repo");
}

#[test]
fn branch_commits_exclude_base_history() {
    let repo = Repo::with_commit();
    repo.write("a.txt", "a\n");
    repo.commit("On main");
    repo.git(&["checkout", "-b", "feature"]);
    repo.write("b.txt", "b\n");
    repo.commit("Feature one");
    repo.write("c.txt", "c\n");
    repo.commit("Feature two");

    let commits = git::list_branch_commits(&repo.path, "main", 10, 0).unwrap();
    let subjects: Vec<_> = commits.iter().map(|c| c.subject.as_str()).collect();
    assert_eq!(subjects, ["Feature two", "Feature one"]);
    assert_eq!(git::list_branch_commits(&repo.path, "main", 1, 1).unwrap()[0].subject, "Feature one");
    assert!(git::list_branch_commits(&repo.path, "missing", 10, 0).unwrap().is_empty());
    assert!(git::list_branch_commits(&repo.path, "--all", 10, 0).unwrap().is_empty());
}
