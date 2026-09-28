use diffity_github::auth::gh_auth_token;
use diffity_github::graphql::*;
use serde_json::json;

#[tokio::test]
#[ignore = "hits api.github.com with the local gh token (read-only)"]
async fn live_read_only_queries() {
    let token = gh_auth_token().await.unwrap();
    let http = Http::new();
    let login = http.get_login(&token).await.unwrap();
    assert!(!login.is_empty());

    let vars = json!({ "owner": "cli", "name": "cli" });
    let prs: RepositoryData<PullRequestsField> = http.query(&token, &list_prs_query(), vars).await.unwrap();
    let prs = prs.repository.unwrap().pull_requests.into_items();
    assert!(!prs.is_empty());
    println!("{:?}", prs[0].to_pull_request().checks);

    let mut found = None;
    for pr in &prs {
        let vars = json!({ "owner": "cli", "name": "cli", "number": pr.number, "after": null });
        let files: RepositoryData<PullRequestField<FilesField>> =
            http.query(&token, FILES_QUERY, vars.clone()).await.unwrap();
        assert!(files.repository.unwrap().pull_request.is_some());
        let threads: RepositoryData<PullRequestField<ThreadsField>> =
            http.query(&token, &threads_query(), vars).await.unwrap();
        let items = threads.repository.unwrap().pull_request.unwrap().review_threads.into_items();
        if let Some(first) = items.into_iter().next() {
            found = Some(first);
            break;
        }
    }
    let thread = found.expect("no PR with review threads in first 30");
    println!("thread {} comments {}", thread.id, thread.comments.into_items().len());
    let more: NodeData = http
        .query(&token, &thread_comments_query(), json!({ "id": thread.id, "after": null }))
        .await
        .unwrap();
    assert!(more.node.unwrap().comments.is_some());
}
