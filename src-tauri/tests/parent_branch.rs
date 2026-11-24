mod common;

use common::Repo;
use diffity_desktop_lib::core::git;

fn stack() -> Repo {
    let repo = Repo::with_commit();
    repo.git(&["checkout", "-q", "-b", "feat-a"]);
    repo.write("a.txt", "a\n");
    repo.commit("a1");
    repo.write("a.txt", "a\nb\n");
    repo.commit("a2");
    repo.git(&["checkout", "-q", "-b", "feat-b"]);
    repo.write("b.txt", "b\n");
    repo.commit("b1");
    repo
}

#[test]
fn finds_the_branch_below_in_a_stack() {
    let repo = stack();
    assert_eq!(git::parent_branch(&repo.path, "main").unwrap().as_deref(), Some("feat-a"));
}

#[test]
fn picks_the_nearest_of_several_branches_below() {
    let repo = stack();
    repo.git(&["checkout", "-q", "-b", "feat-c"]);
    repo.write("c.txt", "c\n");
    repo.commit("c1");
    assert_eq!(git::parent_branch(&repo.path, "main").unwrap().as_deref(), Some("feat-b"));
}

#[test]
fn none_for_a_branch_straight_on_trunk() {
    let repo = Repo::with_commit();
    repo.git(&["checkout", "-q", "-b", "feat-a"]);
    repo.write("a.txt", "a\n");
    repo.commit("a1");
    repo.git(&["branch", "copy"]);
    assert_eq!(git::parent_branch(&repo.path, "main").unwrap(), None);
}

#[test]
fn ignores_a_parent_already_merged_into_trunk() {
    let repo = stack();
    repo.git(&["checkout", "-q", "main"]);
    repo.git(&["merge", "-q", "--ff-only", "feat-a"]);
    repo.git(&["checkout", "-q", "feat-b"]);
    assert_eq!(git::parent_branch(&repo.path, "main").unwrap(), None);
}

#[test]
fn none_for_an_unknown_trunk() {
    let repo = stack();
    assert_eq!(git::parent_branch(&repo.path, "nope").unwrap(), None);
}
