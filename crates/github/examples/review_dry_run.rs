//! Prints which of your comments would be posted to a PR and the GitHub mutation payload, without sending it.
//! `DIFFITY_GITHUB_DRY_RUN=1 cargo run -p diffity-github --example review_dry_run -- <db> <repo> <pr>`
//! (use a copy of the app database; only GitHub queries are sent, mutations are logged).

use std::sync::Arc;

use diffity_core::store::Store;
use diffity_github::{GithubService, ReviewEvent};

#[tokio::main]
async fn main() {
    let args: Vec<String> = std::env::args().collect();
    let [_, db, repo, pr] = args.as_slice() else {
        eprintln!("usage: review_dry_run <db> <repo> <pr>");
        std::process::exit(2);
    };
    if !diffity_github::graphql::dry_run() {
        eprintln!("refusing to run without DIFFITY_GITHUB_DRY_RUN=1");
        std::process::exit(2);
    }
    let pr: u64 = pr.parse().expect("pr number");
    let store = Arc::new(Store::open(db).expect("open db"));
    let service = GithubService::new(store);
    let found = service.review_candidates(repo, pr).await.expect("candidates");
    println!("blocker: {:?}\ngithub pending review: {:?}", found.blocker, found.github_pending);
    for c in &found.candidates {
        let t = &c.thread;
        println!(
            "{} [{}{}] {}:{}-{} {:?} -> {}",
            &t.id[..8],
            c.session_ref,
            if c.draft { ", draft" } else { "" },
            t.file_path,
            t.start_line,
            t.end_line,
            t.side,
            c.blocked_reason.as_deref().unwrap_or("postable")
        );
    }
    let ids: Vec<String> = found
        .candidates
        .iter()
        .filter(|c| c.blocked_reason.is_none())
        .map(|c| c.thread.id.clone())
        .collect();
    let session = found.candidates.first().map(|c| c.thread.session_id.clone()).unwrap_or_default();
    match service
        .push_review(repo, &session, pr, ReviewEvent::Comment, None, Some(ids), None, None)
        .await
    {
        Ok(result) => println!("{}", serde_json::to_string_pretty(&result).unwrap()),
        Err(e) => println!("push_review error: [{}] {}", e.code, e.message),
    }
}
