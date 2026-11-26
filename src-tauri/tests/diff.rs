mod common;

use common::Repo;
use diffity_desktop_lib::core::{diff, diffignore};
use diffity_desktop_lib::core::types::{FileStatus, Side};

fn file<'a>(res: &'a diffity_desktop_lib::core::types::DiffResult, path: &str) -> &'a diffity_desktop_lib::core::types::DiffFileSummary {
    res.files
        .iter()
        .find(|f| f.path == path)
        .unwrap_or_else(|| panic!("{path} missing from {:?}", res.files))
}

fn has(res: &diffity_desktop_lib::core::types::DiffResult, path: &str) -> bool {
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
        assert!(res.resolved.can_edit);
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
    assert!(!staged.resolved.can_edit);

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
    assert!(res.resolved.can_edit);
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
fn merged_branch_still_shows_its_changes() {
    let (repo, base, feature, _main) = diverged();
    repo.git(&["checkout", "-q", "main"]);
    repo.git(&["merge", "-q", "--no-ff", "-m", "Merge feature", "feature"]);
    repo.write("after.txt", "after\n");
    repo.commit("after the merge");
    repo.git(&["checkout", "-q", "feature"]);
    let res = diff::get_diff(&repo.path, "main...HEAD", false).unwrap();
    assert_eq!(res.resolved.base_sha.as_deref(), Some(base.as_str()));
    assert_eq!(res.resolved.head_sha.as_deref(), Some(feature.as_str()));
    assert!(has(&res, "feature.txt"));
    assert!(!has(&res, "main-only.txt"));
    assert!(!has(&res, "after.txt"));
    assert!(diff::get_diff(&repo.path, "main..HEAD", false).unwrap().files.is_empty());
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

    let b = diff::get_binary_versions(&repo.path, "work", "img.bin", None, true).unwrap();
    let old = b.old.unwrap();
    let new = b.new.unwrap();
    assert_eq!((old.size, new.size), (6, 4));
    assert_eq!(new.base64.as_deref(), Some("AAkJCQ=="));
    let sizes_only = diff::get_binary_versions(&repo.path, "work", "untracked.bin", None, false).unwrap();
    assert!(sizes_only.old.is_none());
    assert!(sizes_only.new.unwrap().base64.is_none());
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
    let a = diff::diff_fingerprint(&repo.path, "work", false).unwrap();
    assert_eq!(a, diff::diff_fingerprint(&repo.path, "work", false).unwrap());
    assert_eq!(diff::get_diff(&repo.path, "work", false).unwrap().fingerprint, a, "the diff carries the same fingerprint");
    std::thread::sleep(std::time::Duration::from_millis(20));
    repo.write("README.md", "hello thar!\n");
    let b = diff::diff_fingerprint(&repo.path, "work", false).unwrap();
    assert_ne!(a, b);
    repo.write("x.txt", "x\n");
    assert_ne!(b, diff::diff_fingerprint(&repo.path, "work", false).unwrap());
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

/// The shape the UI sends: `---`/`+++` headers and one hunk, no `diff --git` line.
fn ui_hunk_patch(file_patch: &str, hunk: usize) -> String {
    let header_start = file_patch.find("\n--- ").expect("--- header") + 1;
    let first_hunk = file_patch.find("\n@@").expect("hunk") + 1;
    let starts: Vec<usize> = file_patch.match_indices("\n@@").map(|(i, _)| i + 1).collect();
    let start = starts[hunk];
    let end = starts.get(hunk + 1).copied().unwrap_or(file_patch.len());
    format!("{}{}", &file_patch[header_start..first_hunk], &file_patch[start..end])
}

fn forty_lines(repo: &Repo) -> Vec<String> {
    let lines: Vec<String> = (1..=40).map(|i| format!("line {i}")).collect();
    repo.write("f.txt", &(lines.join("\n") + "\n"));
    repo.commit("init");
    let mut changed = lines.clone();
    changed[1] = "CHANGED 2".into();
    changed[35] = "CHANGED 36".into();
    repo.write("f.txt", &(changed.join("\n") + "\n"));
    changed
}

#[test]
fn stage_hunk_stages_only_that_hunk() {
    let repo = Repo::empty();
    forty_lines(&repo);
    let res = diff::get_diff(&repo.path, "unstaged", false).unwrap();
    diff::stage_hunk(&repo.path, &ui_hunk_patch(&file_patch(&res.patch, "f.txt"), 0)).unwrap();

    let cached = repo.git(&["diff", "--cached"]);
    assert!(cached.contains("+CHANGED 2"));
    assert!(!cached.contains("CHANGED 36"));
    let unstaged = repo.git(&["diff"]);
    assert!(unstaged.contains("+CHANGED 36"));
    assert!(!unstaged.contains("CHANGED 2"));
    assert!(repo.read("f.txt").contains("CHANGED 2"));
}

#[test]
fn stage_hunk_adds_a_new_file() {
    let repo = Repo::with_commit();
    repo.write("new.txt", "one\ntwo\n");
    diff::stage_hunk(&repo.path, "--- /dev/null\n+++ b/new.txt\n@@ -0,0 +1,2 @@\n+one\n+two\n").unwrap();
    assert_eq!(repo.git(&["status", "--porcelain"]), "A  new.txt");
}

#[test]
fn unstage_hunk_keeps_the_working_tree() {
    let repo = Repo::empty();
    forty_lines(&repo);
    repo.git(&["add", "f.txt"]);
    let res = diff::get_diff(&repo.path, "staged", false).unwrap();
    diff::unstage_hunk(&repo.path, &ui_hunk_patch(&file_patch(&res.patch, "f.txt"), 1)).unwrap();

    let cached = repo.git(&["diff", "--cached"]);
    assert!(cached.contains("+CHANGED 2"));
    assert!(!cached.contains("CHANGED 36"));
    assert!(repo.git(&["diff"]).contains("+CHANGED 36"));
    let now = repo.read("f.txt");
    assert!(now.contains("CHANGED 2") && now.contains("CHANGED 36"));
}

#[test]
fn discarding_unstaged_changes_keeps_staged_ones() {
    let repo = Repo::with_commit();
    repo.write("README.md", "staged\n");
    repo.git(&["add", "README.md"]);
    repo.write("README.md", "staged and more\n");
    repo.write("untracked.txt", "u\n");

    diff::revert_file_for(&repo.path, "README.md", "unstaged").unwrap();
    assert_eq!(repo.read("README.md"), "staged\n");
    assert!(repo.git(&["diff", "--cached"]).contains("+staged"));
    assert!(repo.git(&["diff"]).is_empty());

    diff::revert_file_for(&repo.path, "untracked.txt", "unstaged").unwrap();
    assert!(!repo.path.join("untracked.txt").exists());

    assert_eq!(diff::revert_file_for(&repo.path, "README.md", "staged").unwrap_err().code, "invalid");
    diff::revert_file_for(&repo.path, "README.md", "work").unwrap();
    assert_eq!(repo.read("README.md"), "hello\n");
    assert!(repo.git(&["status", "--porcelain"]).is_empty());
}

#[test]
fn discarding_an_unstaged_hunk_keeps_staged_lines() {
    let repo = Repo::empty();
    let changed = forty_lines(&repo);
    repo.git(&["add", "f.txt"]);
    let mut more = changed.clone();
    more[1] = "MORE 2".into();
    repo.write("f.txt", &(more.join("\n") + "\n"));

    let res = diff::get_diff(&repo.path, "unstaged", false).unwrap();
    diff::revert_hunk(&repo.path, &ui_hunk_patch(&file_patch(&res.patch, "f.txt"), 0)).unwrap();
    assert_eq!(repo.read("f.txt"), changed.join("\n") + "\n");
    assert!(repo.git(&["diff", "--cached"]).contains("+CHANGED 36"));
}

#[test]
fn stage_and_unstage_whole_files() {
    let repo = Repo::with_commit();
    repo.write("README.md", "changed\n");
    repo.write("new.txt", "n\n");
    std::fs::remove_file(repo.path.join("src/lib.rs")).unwrap();

    diff::stage_file(&repo.path, &["README.md"]).unwrap();
    diff::stage_file(&repo.path, &["new.txt"]).unwrap();
    diff::stage_file(&repo.path, &["src/lib.rs"]).unwrap();
    assert_eq!(repo.git(&["diff", "--cached", "--name-status"]), "M\tREADME.md\nA\tnew.txt\nD\tsrc/lib.rs");

    diff::unstage_file(&repo.path, &["README.md", "new.txt", "src/lib.rs"]).unwrap();
    assert!(repo.git(&["diff", "--cached"]).is_empty());
    assert_eq!(repo.read("README.md"), "changed\n");
    assert!(repo.path.join("new.txt").exists());
    assert_eq!(diff::stage_file(&repo.path, &["../x"]).unwrap_err().code, "invalid");
}

#[test]
fn rename_stages_with_its_old_path_and_unstages_before_first_commit() {
    let repo = Repo::with_commit();
    repo.git(&["mv", "README.md", "README2.md"]);
    repo.git(&["reset", "-q"]);
    diff::stage_file(&repo.path, &["README2.md", "README.md"]).unwrap();
    assert!(repo.git(&["diff", "--cached", "-M", "--name-status"]).starts_with("R"));
    diff::stage_file(&repo.path, &["README2.md", "README.md"]).unwrap();

    let empty = Repo::empty();
    empty.write("a.txt", "a\n");
    diff::stage_file(&empty.path, &["a.txt"]).unwrap();
    diff::unstage_file(&empty.path, &["a.txt"]).unwrap();
    assert_eq!(empty.git(&["status", "--porcelain"]), "?? a.txt");
}

#[test]
fn old_line_counts_cover_every_old_side_file() {
    let repo = Repo::with_commit();
    repo.write("src/lib.rs", "fn a() {}\nfn b() {}\nfn c() {}\nfn d() {}\n");
    repo.write("README.md", "hello\nagain");
    repo.git(&["add", "README.md"]);
    repo.write("new.txt", "x\n");
    let work = diff::get_diff(&repo.path, "work", false).unwrap();
    assert_eq!(file(&work, "src/lib.rs").old_line_count, Some(3));
    assert_eq!(file(&work, "README.md").old_line_count, Some(1));
    assert_eq!(file(&work, "new.txt").old_line_count, None);

    let unstaged = diff::get_diff(&repo.path, "unstaged", false).unwrap();
    assert_eq!(file(&unstaged, "src/lib.rs").old_line_count, Some(3));
    let staged = diff::get_diff(&repo.path, "staged", false).unwrap();
    assert_eq!(file(&staged, "README.md").old_line_count, Some(1));
}

#[test]
fn root_commit_range_diffs_against_empty_tree() {
    let repo = Repo::with_commit();
    let root = repo.git(&["rev-parse", "HEAD"]);
    let r = format!("{root}~1..{root}");
    let res = diff::get_diff(&repo.path, &r, false).unwrap();
    assert!(res.resolved.base_sha.is_none());
    assert_eq!(file(&res, "README.md").status, FileStatus::Added);
    let versions = diff::get_file_versions(&repo.path, &r, "README.md", None).unwrap();
    assert!(versions.old_contents.is_none());
    assert_eq!(versions.new_contents.as_deref(), Some("hello\n"));

    repo.write("README.md", "hello\nagain\n");
    repo.commit("second");
    let head = repo.git(&["rev-parse", "HEAD"]);
    let res = diff::get_diff(&repo.path, &format!("{head}~1..{head}"), false).unwrap();
    assert_eq!(res.resolved.base_sha.as_deref(), Some(root.as_str()));
    assert_eq!(file(&res, "README.md").status, FileStatus::Modified);
}

fn without_index_lines(patch: &str) -> String {
    patch.lines().filter(|l| !l.starts_with("index ")).map(|l| format!("{l}\n")).collect()
}

#[test]
fn untracked_patches_match_git_no_index() {
    let repo = Repo::with_commit();
    repo.write("multi.txt", "one\ntwo\nthree\n");
    repo.write("single.txt", "only\n");
    repo.write("no-eol.txt", "a\nb");
    repo.write("empty.txt", "");
    repo.write_bytes("blob.bin", &[1, 0, 2]);
    let res = diff::get_diff(&repo.path, "work", false).unwrap();
    for name in ["multi.txt", "single.txt", "no-eol.txt", "empty.txt", "blob.bin"] {
        let out = std::process::Command::new("git")
            .current_dir(&repo.path)
            .args(["diff", "--no-index", "--no-color", "--src-prefix=a/", "--dst-prefix=b/", "--", "/dev/null", name])
            .output()
            .unwrap();
        let expected = String::from_utf8_lossy(&out.stdout).into_owned();
        assert_eq!(without_index_lines(&file_patch(&res.patch, name)), without_index_lines(&expected), "{name}");
        assert_eq!(without_index_lines(&diff::get_file_patch(&repo.path, "work", name, None, false).unwrap()), without_index_lines(&expected), "{name}");
    }
    assert_eq!(file(&res, "multi.txt").additions, 3);
}

#[test]
fn large_file_patches_are_withheld_and_fetched_per_file() {
    let repo = Repo::with_commit();
    repo.write("big.txt", &(0..200).map(|i| format!("line {i}\n")).collect::<String>());
    repo.write("small.txt", "a\n");
    repo.commit("base");
    repo.write("big.txt", &(0..200).map(|i| format!("changed {i}\n")).collect::<String>());
    repo.write("small.txt", "b\n");
    repo.write("new big.txt", &(0..200).map(|i| format!("new {i}\n")).collect::<String>());
    let res = diff::get_diff_with_limit(&repo.path, "work", false, 1024).unwrap();
    assert!(file(&res, "big.txt").patch_omitted);
    assert!(file(&res, "new big.txt").patch_omitted);
    assert!(!file(&res, "small.txt").patch_omitted);
    assert!(res.patch.contains("diff --git a/big.txt b/big.txt"));
    assert!(!res.patch.contains("changed 5"));
    assert!(res.patch.contains("+b"));
    let full = diff::get_file_patch(&repo.path, "work", "big.txt", None, false).unwrap();
    assert!(full.contains("+changed 199"));
    let untracked = diff::get_file_patch(&repo.path, "work", "new big.txt", None, false).unwrap();
    assert!(untracked.contains("+new 199"));
    let full_res = diff::get_diff(&repo.path, "work", false).unwrap();
    assert!(full_res.files.iter().all(|f| !f.patch_omitted));
}

#[test]
fn viewed_snapshot_diffs_against_current_contents() {
    let repo = Repo::with_commit();
    repo.write("app.ts", "one\ntwo\n");
    let blob = diff::snapshot_blob(&repo.path, "work", "app.ts").unwrap().unwrap();
    assert_eq!(repo.git(&["cat-file", "-p", &blob]).trim_end(), "one\ntwo");
    assert_eq!(diff::changes_since_blob(&repo.path, "work", "app.ts", &blob).unwrap(), "");

    repo.write("app.ts", "one\nTWO\nthree\n");
    let patch = diff::changes_since_blob(&repo.path, "work", "app.ts", &blob).unwrap();
    assert!(patch.starts_with("diff --git a/app.ts b/app.ts\n"), "{patch}");
    assert!(patch.contains("--- a/app.ts\n+++ b/app.ts\n"), "{patch}");
    assert!(patch.contains("-two\n+TWO\n+three\n"), "{patch}");
    assert!(!patch.contains(&blob));

    assert!(diff::snapshot_blob(&repo.path, "work", "missing.ts").unwrap().is_none());
    repo.write_bytes("image.bin", &[0, 1, 2, 0]);
    assert!(diff::snapshot_blob(&repo.path, "work", "image.bin").unwrap().is_none());
    repo.write("huge.txt", &"x".repeat(diff::VIEWED_SNAPSHOT_MAX_BYTES + 1));
    assert!(diff::snapshot_blob(&repo.path, "work", "huge.txt").unwrap().is_none());

    let gone = "0123456789abcdef0123456789abcdef01234567";
    assert_eq!(diff::changes_since_blob(&repo.path, "work", "app.ts", gone).unwrap_err().code, "not_found");
    assert_eq!(diff::changes_since_blob(&repo.path, "work", "app.ts", "HEAD").unwrap_err().code, "invalid");
}

#[test]
fn viewed_snapshot_of_a_commit_ref_reads_the_commit() {
    let repo = Repo::with_commit();
    repo.write("a.txt", "v1\n");
    let sha = repo.commit("v1");
    let blob = diff::snapshot_blob(&repo.path, &sha, "a.txt").unwrap().unwrap();
    assert_eq!(repo.git(&["rev-parse", &format!("{sha}:a.txt")]).trim(), blob);
}

#[test]
fn diffityignore_hides_files_before_patching() {
    let repo = Repo::with_commit();
    repo.write("dist/bundle.js", "a\n");
    repo.write("src/app.ts", "a\n");
    repo.write("schema.gen.ts", "a\n");
    repo.commit("base");
    repo.write(".diffityignore", "# generated\ndist/\n*.gen.ts\n!keep.gen.ts\n");
    repo.write("dist/bundle.js", "b\n");
    repo.write("dist/new.js", "new\n");
    repo.write("src/app.ts", "b\n");
    repo.write("schema.gen.ts", "b\n");
    repo.write("keep.gen.ts", "kept\n");

    let res = diff::get_diff(&repo.path, "work", false).unwrap();
    assert!(has(&res, "src/app.ts"));
    assert!(has(&res, ".diffityignore"));
    assert!(has(&res, "keep.gen.ts"));
    for hidden in ["dist/bundle.js", "dist/new.js", "schema.gen.ts"] {
        assert!(!has(&res, hidden), "{hidden} should be hidden");
        assert!(!res.patch.contains(hidden), "{hidden} leaked into the patch");
        assert!(res.hidden_files.iter().any(|f| f == hidden), "{hidden} not reported");
    }
    assert_eq!(res.hidden_files.len(), 3);

    let all = diff::get_diff_with(
        &repo.path,
        "work",
        &diff::DiffOptions {
            show_ignored: true,
            ..diff::DiffOptions::new(false)
        },
    )
    .unwrap();
    assert!(has(&all, "dist/bundle.js") && has(&all, "dist/new.js") && has(&all, "schema.gen.ts"));
    assert!(all.hidden_files.is_empty());
    assert_eq!(all.fingerprint, diff::diff_fingerprint(&repo.path, "work", true).unwrap());

    let before = diff::diff_fingerprint(&repo.path, "work", false).unwrap();
    repo.write("dist/bundle.js", "c\nd\n");
    assert_eq!(diff::diff_fingerprint(&repo.path, "work", false).unwrap(), before);
    repo.write("src/app.ts", "c\n");
    assert_ne!(diff::diff_fingerprint(&repo.path, "work", false).unwrap(), before);
}

#[test]
fn local_ignore_list_applies_to_commit_ranges() {
    let repo = Repo::with_commit();
    let base = repo.git(&["rev-parse", "HEAD"]).trim().to_string();
    repo.write("gen/api.ts", "a\n");
    repo.write("pnpm-lock.yaml", "lock\n");
    repo.write("src/main.ts", "main\n");
    let head = repo.commit("add");
    diffignore::write_local_rules(&repo.path, "gen/\npnpm-lock.yaml").unwrap();
    assert_eq!(diffignore::read_local_rules(&repo.path).unwrap(), "gen/\npnpm-lock.yaml\n");
    assert!(repo.path.join(".git/info/diffityignore").is_file());

    let res = diff::get_diff(&repo.path, &format!("{base}..{head}"), false).unwrap();
    assert!(has(&res, "src/main.ts"));
    assert!(!has(&res, "gen/api.ts") && !has(&res, "pnpm-lock.yaml"));
    assert_eq!(res.hidden_files.len(), 2);
    assert!(!res.patch.contains("gen/api.ts"));

    diffignore::write_local_rules(&repo.path, "  \n").unwrap();
    assert!(!repo.path.join(".git/info/diffityignore").exists());
    assert!(has(&diff::get_diff(&repo.path, &format!("{base}..{head}"), false).unwrap(), "gen/api.ts"));
}

#[test]
fn renames_into_an_ignored_folder_are_hidden_whole() {
    let repo = Repo::with_commit();
    repo.write("src/old.js", &(0..20).map(|i| format!("line {i}\n")).collect::<String>());
    repo.commit("base");
    repo.write(".diffityignore", "dist/\n");
    repo.commit("ignore");
    std::fs::create_dir_all(repo.path.join("dist")).unwrap();
    repo.git(&["mv", "src/old.js", "dist/old.js"]);
    let res = diff::get_diff(&repo.path, "staged", false).unwrap();
    assert!(res.files.is_empty(), "{:?}", res.files);
    assert_eq!(res.hidden_files, vec!["dist/old.js".to_string()]);
}

#[test]
fn head_commit_resolves_to_checked_out_sha() {
    let repo = Repo::with_commit();
    repo.write("a.txt", "one\n");
    let older = repo.commit("older");
    repo.write("a.txt", "two\n");
    let head = repo.commit("head");
    let work = diff::resolve_ref(&repo.path, "work").unwrap().head_sha;
    let head_view = diff::resolve_ref(&repo.path, &format!("{head}~1..{head}")).unwrap().head_sha;
    let older_view = diff::resolve_ref(&repo.path, &format!("{older}~1..{older}")).unwrap().head_sha;
    assert_eq!(work.as_deref(), Some(head.as_str()));
    assert_eq!(head_view, work);
    assert_ne!(older_view, work);
}

#[test]
fn only_ranges_ending_at_head_are_editable() {
    let (repo, _base, feature, _main) = diverged();
    assert!(diff::get_diff(&repo.path, "main...HEAD", false).unwrap().resolved.can_edit);
    assert!(diff::get_diff(&repo.path, &format!("main...{feature}"), false).unwrap().resolved.can_edit);
    assert!(!diff::get_diff(&repo.path, "feature...main", false).unwrap().resolved.can_edit);
}

#[test]
fn in_checkout_covers_head_and_its_history_only() {
    let repo = Repo::with_commit();
    repo.write("a.txt", "one\n");
    let old = repo.commit("old");
    repo.write("a.txt", "two\n");
    let head = repo.commit("head");
    repo.git(&["checkout", "-q", "-b", "side", &old]);
    repo.write("b.txt", "side\n");
    let side = repo.commit("side");
    repo.git(&["checkout", "-q", "-"]);
    let range = |sha: &str| format!("{sha}~1..{sha}");
    assert!(diff::in_checkout(&repo.path, &range(&head)).unwrap());
    assert!(diff::in_checkout(&repo.path, &range(&old)).unwrap());
    assert!(!diff::in_checkout(&repo.path, &range(&side)).unwrap());
}

#[test]
fn diff_is_empty_sees_changes_new_files_and_gone_refs() {
    let repo = Repo::with_commit();
    assert!(diff::diff_is_empty(&repo.path, "work").unwrap());
    repo.write("new.txt", "hi\n");
    assert!(!diff::diff_is_empty(&repo.path, "work").unwrap());
    let head = repo.commit("add new");
    assert!(diff::diff_is_empty(&repo.path, "work").unwrap());
    assert!(!diff::diff_is_empty(&repo.path, &format!("{head}~1..{head}")).unwrap());
    assert!(diff::diff_is_empty(&repo.path, "no-such-branch...HEAD").is_err());
}
