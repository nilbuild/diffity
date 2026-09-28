#![allow(dead_code)]

use std::path::{Path, PathBuf};
use std::process::Command;

pub struct Repo {
    _dir: tempfile::TempDir,
    pub path: PathBuf,
}

pub fn git(repo: &Path, args: &[&str]) -> String {
    let out = Command::new("git")
        .current_dir(repo)
        .args(args)
        .env("GIT_AUTHOR_NAME", "Test")
        .env("GIT_AUTHOR_EMAIL", "test@example.com")
        .env("GIT_COMMITTER_NAME", "Test")
        .env("GIT_COMMITTER_EMAIL", "test@example.com")
        .output()
        .expect("git runs");
    assert!(
        out.status.success(),
        "git {:?} failed: {}",
        args,
        String::from_utf8_lossy(&out.stderr)
    );
    String::from_utf8_lossy(&out.stdout).trim().to_string()
}

impl Repo {
    pub fn empty() -> Repo {
        let dir = tempfile::tempdir().expect("tempdir");
        let path = dir.path().canonicalize().expect("canonical");
        git(&path, &["init", "-q", "-b", "main"]);
        git(&path, &["config", "commit.gpgsign", "false"]);
        Repo { _dir: dir, path }
    }

    pub fn with_commit() -> Repo {
        let repo = Repo::empty();
        repo.write("README.md", "hello\n");
        repo.write("src/lib.rs", "fn a() {}\nfn b() {}\nfn c() {}\n");
        repo.commit("initial");
        repo
    }

    pub fn write(&self, rel: &str, contents: &str) {
        self.write_bytes(rel, contents.as_bytes());
    }

    pub fn write_bytes(&self, rel: &str, contents: &[u8]) {
        let p = self.path.join(rel);
        if let Some(parent) = p.parent() {
            std::fs::create_dir_all(parent).expect("mkdir");
        }
        std::fs::write(p, contents).expect("write");
    }

    pub fn read(&self, rel: &str) -> String {
        std::fs::read_to_string(self.path.join(rel)).expect("read")
    }

    pub fn git(&self, args: &[&str]) -> String {
        git(&self.path, args)
    }

    pub fn commit(&self, msg: &str) -> String {
        self.git(&["add", "-A"]);
        self.git(&["commit", "-q", "-m", msg]);
        self.git(&["rev-parse", "HEAD"])
    }
}
