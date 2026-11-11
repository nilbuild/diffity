mod common;

use common::Repo;
use diffity_desktop_lib::core::search::{search_code, SearchOptions, MAX_RESULTS};

fn query(text: &str) -> SearchOptions {
    SearchOptions {
        query: text.to_string(),
        ..SearchOptions::default()
    }
}

#[test]
fn finds_lines_in_tracked_and_untracked_files() {
    let repo = Repo::with_commit();
    repo.write("notes/todo.txt", "first\nsecond fn b\n");
    repo.write(".gitignore", "build/\n");
    repo.write("build/out.rs", "fn b() {}\n");

    let result = search_code(&repo.path, &query("fn b")).unwrap();
    let paths: Vec<&str> = result.files.iter().map(|f| f.path.as_str()).collect();
    assert_eq!(paths, ["notes/todo.txt", "src/lib.rs"]);
    assert_eq!(result.total, 2);
    assert!(!result.truncated);
    let lib = &result.files[1];
    assert_eq!(lib.matches[0].line, 2);
    assert_eq!(lib.matches[0].text, "fn b() {}");
    assert_eq!(lib.matches[0].ranges, vec![[0, 4]]);
}

#[test]
fn skips_binary_files_and_limits_to_paths() {
    let repo = Repo::with_commit();
    repo.write_bytes("blob.bin", b"fn a\0\x01");
    let result = search_code(&repo.path, &query("fn a")).unwrap();
    assert_eq!(result.files.len(), 1);
    assert_eq!(result.files[0].path, "src/lib.rs");

    let mut only = query("hello");
    only.paths = Some(vec!["src/lib.rs".to_string()]);
    assert!(search_code(&repo.path, &only).unwrap().files.is_empty());
}

#[test]
fn stops_at_the_cap() {
    let repo = Repo::with_commit();
    let many = "hit\n".repeat(MAX_RESULTS + 10);
    repo.write("a.txt", &many);
    repo.write("b.txt", "hit\n");
    let result = search_code(&repo.path, &query("hit")).unwrap();
    assert_eq!(result.total, MAX_RESULTS);
    assert!(result.truncated);
    assert_eq!(result.files.len(), 1);
}

#[test]
fn invalid_regex_is_an_error() {
    let repo = Repo::with_commit();
    let mut options = query("fn (");
    options.regex = true;
    let error = search_code(&repo.path, &options).unwrap_err();
    assert_eq!(error.code, "invalid");
}
