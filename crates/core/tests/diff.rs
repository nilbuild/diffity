mod common;

use common::Repo;
use diffity_core::diff;
use diffity_core::types::{FileStatus, Side};

fn file<'a>(res: &'a diffity_core::types::DiffResult, path: &str) -> &'a diffity_core::types::DiffFileSummary {
    res.files
        .iter()
        .find(|f| f.path == path)
        .unwrap_or_else(|| panic!("{path} missing from {:?}", res.files))
}

fn has(res: &diffity_core::types::DiffResult, path: &str) -> bool {
    res.files.iter().any(|f| f.path == path)
}

fn dirty_repo() -> Repo {
    let repo = Repo::with_commit();
    repo.write("README.md", "hello\nworld\n");
    repo.write("staged.txt", "staged\n");
    repo.git(&["add", "staged.txt"]);
    repo.write("new.txt", "one\ntwo\n");
    repo
}

#[test]
fn work_includes_tracked_staged_and_untracked() {
    let repo = dirty_repo();
    for r in ["work", "."] {
        let res = diff::get_diff(&repo.path, r, false).unwrap();
        assert_eq!(res.resolved.label, "Uncommitted changes");
        assert!(res.resolved.can_revert);
        assert_eq!(file(&res, "README.md").status, FileStatus::Modified);
        assert_eq!(file(&res, "README.md").additions, 1);
        assert_eq!(file(&res, "staged.txt").status, FileStatus::Added);
        let untracked = file(&res, "new.txt");
        assert_eq!(untracked.status, FileStatus::Untracked);
        assert_eq!(untracked.additions, 2);
        assert!(res.patch.contains("+++ b/new.txt"));
        assert!(res.patch.contains("+++ b/README.md"));
        assert!(!res.fingerprint.is_empty());
    }
}

#[test]
fn staged_and_unstaged() {
    let repo = dirty_repo();
    let staged = diff::get_diff(&repo.path, "staged", false).unwrap();
    assert_eq!(staged.resolved.label, "Staged changes");
    assert!(has(&staged, "staged.txt"));
    assert!(!has(&staged, "README.md"));
    assert!(!has(&staged, "new.txt"));

    let unstaged = diff::get_diff(&repo.path, "unstaged", false).unwrap();
    assert_eq!(unstaged.resolved.label, "Unstaged changes");
    assert!(has(&unstaged, "README.md"));
    assert!(has(&unstaged, "new.txt"));
    assert!(!has(&unstaged, "staged.txt"));
}

fn diverged() -> (Repo, String, String, String) {
    let repo = Repo::with_commit();
    let base = repo.git(&["rev-parse", "HEAD"]);
    repo.git(&["checkout", "-q", "-b", "feature"]);
    repo.write("feature.txt", "feature\n");
    let feature = repo.commit("feature work");
    repo.git(&["checkout", "-q", "main"]);
    repo.write("main-only.txt", "main\n");
    let main = repo.commit("main work");
    repo.git(&["checkout", "-q", "feature"]);
    (repo, base, feature, main)
}

#[test]
fn single_ref_diffs_merge_base_against_working_tree() {
    let (repo, base, _feature, _main) = diverged();
    repo.write("wip.txt", "wip\n");
    let res = diff::get_diff(&repo.path, "main", false).unwrap();
    assert_eq!(res.resolved.label, "Changes from main");
    assert_eq!(res.resolved.base_sha.as_deref(), Some(base.as_str()));
    assert!(!res.resolved.can_revert);
    assert!(has(&res, "feature.txt"));
    assert!(has(&res, "wip.txt"));
    assert!(!has(&res, "main-only.txt"));
}

#[test]
fn two_and_three_dot_ranges() {
    let (repo, base, feature, _main) = diverged();
    repo.write("wip.txt", "wip\n");
    for r in ["main..feature", "main...feature", "main.."] {
        let res = diff::get_diff(&repo.path, r, false).unwrap();
        assert_eq!(res.resolved.label, r);
        assert_eq!(res.resolved.base_sha.as_deref(), Some(base.as_str()));
        assert_eq!(res.resolved.head_sha.as_deref(), Some(feature.as_str()));
        assert!(has(&res, "feature.txt"), "{r}");
        assert!(!has(&res, "main-only.txt"), "{r}");
        assert!(!has(&res, "wip.txt"), "{r}");
    }
}

#[test]
fn invalid_refs_and_non_repos() {
    let repo = Repo::with_commit();
    assert_eq!(diff::resolve_ref(&repo.path, "nope").unwrap_err().code, "invalid_ref");
    assert_eq!(diff::resolve_ref(&repo.path, "main..nope").unwrap_err().code, "invalid_ref");
    assert_eq!(diff::resolve_ref(&repo.path, "--output=x").unwrap_err().code, "invalid_ref");
    let dir = tempfile::tempdir().unwrap();
    assert_eq!(diff::resolve_ref(dir.path(), "work").unwrap_err().code, "not_a_repo");
}

#[test]
fn repo_without_commits() {
    let repo = Repo::empty();
    repo.write("a.txt", "a\n");
    repo.git(&["add", "a.txt"]);
    repo.write("b.txt", "b\n");
    let work = diff::get_diff(&repo.path, "work", false).unwrap();
    assert!(work.resolved.base_sha.is_none());
    assert_eq!(file(&work, "a.txt").status, FileStatus::Added);
    assert_eq!(file(&work, "b.txt").status, FileStatus::Untracked);
    let staged = diff::get_diff(&repo.path, "staged", false).unwrap();
    assert!(has(&staged, "a.txt"));
    assert!(!has(&staged, "b.txt"));
    let v = diff::get_file_versions(&repo.path, "work", "a.txt", None).unwrap();
    assert!(v.old_contents.is_none());
    assert_eq!(v.new_contents.as_deref(), Some("a\n"));
    assert_eq!(diff::resolve_ref(&repo.path, "main").unwrap_err().code, "invalid_ref");
}

#[test]
fn renames_are_detected() {
    let repo = Repo::empty();
    let body: String = (0..50).map(|i| format!("line {i}\n")).collect();
    repo.write("old/name.txt", &body);
    repo.commit("init");
    std::fs::create_dir_all(repo.path.join("new")).unwrap();
    repo.git(&["mv", "old/name.txt", "new/name.txt"]);
    repo.write("new/name.txt", &format!("{body}extra\n"));
    let res = diff::get_diff(&repo.path, "work", false).unwrap();
    let f = file(&res, "new/name.txt");
    assert_eq!(f.status, FileStatus::Renamed);
    assert_eq!(f.old_path.as_deref(), Some("old/name.txt"));
    assert_eq!(f.additions, 1);
    assert_eq!(res.files.len(), 1);

    let v = diff::get_file_versions(&repo.path, "work", "new/name.txt", Some("old/name.txt")).unwrap();
    assert_eq!(v.old_contents.as_deref(), Some(body.as_str()));
    assert!(v.new_contents.unwrap().ends_with("extra\n"));
}

#[test]
fn binary_files_are_flagged() {
    let repo = Repo::with_commit();
    repo.write_bytes("img.bin", &[0, 1, 2, 3, 0, 5]);
    repo.commit("bin");
    repo.write_bytes("img.bin", &[0, 9, 9, 9]);
    repo.write_bytes("untracked.bin", &[1, 0, 1]);
    let res = diff::get_diff(&repo.path, "work", false).unwrap();
    assert!(file(&res, "img.bin").binary);
    assert!(file(&res, "untracked.bin").binary);
    let v = diff::get_file_versions(&repo.path, "work", "img.bin", None).unwrap();
    assert!(v.old_contents.is_none() && v.new_contents.is_none());
}

#[test]
fn file_versions_follow_ref_semantics() {
    let (repo, _base, _feature, _main) = diverged();
    repo.write("README.md", "hello\nlocal\n");
    repo.write("src/lib.rs", "fn a() {}\n");
    repo.git(&["add", "src/lib.rs"]);
    repo.write("src/lib.rs", "fn a() {}\nfn z() {}\n");

    let work = diff::get_file_versions(&repo.path, "work", "README.md", None).unwrap();
    assert_eq!(work.old_contents.as_deref(), Some("hello\n"));
    assert_eq!(work.new_contents.as_deref(), Some("hello\nlocal\n"));

    let staged = diff::get_file_versions(&repo.path, "staged", "src/lib.rs", None).unwrap();
    assert_eq!(staged.old_contents.as_deref(), Some("fn a() {}\nfn b() {}\nfn c() {}\n"));
    assert_eq!(staged.new_contents.as_deref(), Some("fn a() {}\n"));

    let unstaged = diff::get_file_versions(&repo.path, "unstaged", "src/lib.rs", None).unwrap();
    assert_eq!(unstaged.old_contents.as_deref(), Some("fn a() {}\n"));
    assert_eq!(unstaged.new_contents.as_deref(), Some("fn a() {}\nfn z() {}\n"));

    let range = diff::get_file_versions(&repo.path, "main..feature", "feature.txt", None).unwrap();
    assert!(range.old_contents.is_none());
    assert_eq!(range.new_contents.as_deref(), Some("feature\n"));

    std::fs::remove_file(repo.path.join("feature.txt")).unwrap();
    let deleted = diff::get_file_versions(&repo.path, "main", "feature.txt", None).unwrap();
    assert!(deleted.old_contents.is_none());
    assert!(deleted.new_contents.is_none());

    assert_eq!(diff::side_line_count(&repo.path, "work", "README.md", None, Side::New).unwrap(), Some(2));
    assert!(diff::get_file_versions(&repo.path, "work", "../etc/passwd", None).is_err());
}

#[test]
fn ignore_whitespace() {
    let repo = Repo::with_commit();
    repo.write("src/lib.rs", "fn a() {}\n  fn b() {}\nfn c() {}\n");
    let normal = diff::get_diff(&repo.path, "work", false).unwrap();
    assert!(has(&normal, "src/lib.rs"));
    let ws = diff::get_diff(&repo.path, "work", true).unwrap();
    assert!(!ws.patch.contains("fn b"));
}

#[test]
fn fingerprint_tracks_changes() {
    let repo = Repo::with_commit();
    repo.write("README.md", "hello there\n");
    let a = diff::diff_fingerprint(&repo.path, "work").unwrap();
    assert_eq!(a, diff::diff_fingerprint(&repo.path, "work").unwrap());
    std::thread::sleep(std::time::Duration::from_millis(20));
    repo.write("README.md", "hello thar!\n");
    let b = diff::diff_fingerprint(&repo.path, "work").unwrap();
    assert_ne!(a, b);
    repo.write("x.txt", "x\n");
    assert_ne!(b, diff::diff_fingerprint(&repo.path, "work").unwrap());
}

fn file_patch(patch: &str, path: &str) -> String {
    let header = format!("diff --git a/{path} b/{path}");
    let start = patch.find(&header).expect("file in patch");
    let rest = &patch[start..];
    let end = rest[1..].find("\ndiff --git ").map(|i| i + 2).unwrap_or(rest.len());
    rest[..end].to_string()
}

#[test]
fn revert_hunk_reverses_one_hunk() {
    let repo = Repo::empty();
    let lines: Vec<String> = (1..=40).map(|i| format!("line {i}")).collect();
    repo.write("f.txt", &(lines.join("\n") + "\n"));
    repo.commit("init");
    let mut changed = lines.clone();
    changed[1] = "CHANGED 2".into();
    changed[35] = "CHANGED 36".into();
    repo.write("f.txt", &(changed.join("\n") + "\n"));

    let res = diff::get_diff(&repo.path, "work", false).unwrap();
    let fp = file_patch(&res.patch, "f.txt");
    let second = fp.rfind("\n@@").expect("second hunk");
    let header_end = fp.find("\n@@").expect("first hunk");
    let one_hunk = format!("{}{}", &fp[..header_end + 1], &fp[second + 1..]);
    diff::revert_hunk(&repo.path, &one_hunk).unwrap();

    let now = repo.read("f.txt");
    assert!(now.contains("CHANGED 2"));
    assert!(!now.contains("CHANGED 36"));
    assert!(now.contains("line 36"));
}

#[test]
fn revert_file_variants() {
    let repo = Repo::with_commit();
    repo.write("README.md", "changed\n");
    repo.write("untracked.txt", "u\n");
    repo.write("added.txt", "a\n");
    repo.git(&["add", "added.txt"]);

    diff::revert_file(&repo.path, "README.md").unwrap();
    assert_eq!(repo.read("README.md"), "hello\n");
    diff::revert_file(&repo.path, "untracked.txt").unwrap();
    assert!(!repo.path.join("untracked.txt").exists());
    diff::revert_file(&repo.path, "added.txt").unwrap();
    assert!(!repo.path.join("added.txt").exists());
    assert!(repo.git(&["status", "--porcelain"]).is_empty());
    assert_eq!(diff::revert_file(&repo.path, "../x").unwrap_err().code, "invalid");
}
