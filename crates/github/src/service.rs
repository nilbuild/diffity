use std::collections::{HashMap, HashSet};
use std::sync::{Arc, Mutex};

use diffity_core::store::Store;
use diffity_core::types::{AuthorType, ReviewState, Thread, ThreadStatus};
use diffity_core::{AppError, Result};
use serde_json::json;

use crate::auth::{self, CLIENT_ID_KEY, TOKEN_SOURCE_KEY};
use crate::db::{self, NewComment, NewRemoteThread};
use crate::gitcli;
use crate::graphql::*;
use crate::remote::{self, RepoSlug};
use crate::review::{self, PushCandidate, PushComment};
use crate::types::*;

struct FullThread {
    thread: RemoteThread,
    comments: Vec<RemoteComment>,
}

pub struct GithubService {
    store: Arc<Store>,
    http: Http,
    token: Mutex<Option<String>>,
    login: Mutex<Option<String>>,
}

fn lock<T>(m: &Mutex<T>) -> Result<std::sync::MutexGuard<'_, T>> {
    m.lock().map_err(|_| AppError::internal("github state poisoned"))
}

impl GithubService {
    pub fn new(store: Arc<Store>) -> Self {
        Self {
            store,
            http: Http::new(),
            token: Mutex::new(None),
            login: Mutex::new(None),
        }
    }

    fn client_id(&self) -> Option<String> {
        if let Ok(id) = std::env::var(CLIENT_ID_KEY) {
            if !id.trim().is_empty() {
                return Some(id.trim().to_string());
            }
        }
        db::get_setting(&self.store, CLIENT_ID_KEY)
            .ok()
            .flatten()
            .filter(|s| !s.trim().is_empty())
    }

    async fn token(&self) -> Result<Option<String>> {
        if let Some(token) = lock(&self.token)?.clone() {
            return Ok(Some(token));
        }
        // A token imported from `gh` is re-read from `gh auth token` instead of being copied into the
        // keychain: gh stays the source of truth (rotation, logout) and dev rebuilds don't hit keychain
        // access prompts (their ad-hoc signature changes on every build).
        let token = if self.token_source().as_deref() == Some("gh") {
            auth::gh_auth_token().await.ok()
        } else {
            match auth::keychain_read().await {
                Ok(token) => token,
                Err(e) => {
                    tracing::warn!("github: keychain read failed: {}", e.message);
                    None
                }
            }
        };
        *lock(&self.token)? = token.clone();
        Ok(token)
    }

    async fn require_token(&self) -> Result<String> {
        self.token()
            .await?
            .ok_or_else(|| AppError::new("unauthenticated", "Not signed in to GitHub"))
    }

    fn token_source(&self) -> Option<String> {
        db::get_setting(&self.store, TOKEN_SOURCE_KEY).ok().flatten()
    }

    async fn store_token(&self, token: &str, source: &str) -> Result<GithubAuthStatus> {
        let login = self.http.get_login(token).await?;
        if source != "gh" {
            auth::keychain_write(token.to_string()).await?;
        }
        db::set_setting(&self.store, TOKEN_SOURCE_KEY, source)?;
        *lock(&self.token)? = Some(token.to_string());
        *lock(&self.login)? = Some(login.clone());
        Ok(self.status_with(Some(login)))
    }

    fn status_with(&self, login: Option<String>) -> GithubAuthStatus {
        let source = login.as_ref().map(|_| match db::get_setting(&self.store, TOKEN_SOURCE_KEY) {
            Ok(Some(s)) if s == "gh" => AuthSource::Gh,
            _ => AuthSource::Keychain,
        });
        GithubAuthStatus {
            authenticated: login.is_some(),
            login,
            source,
            device_flow_available: self.client_id().is_some(),
        }
    }

    pub async fn auth_status(&self) -> Result<GithubAuthStatus> {
        let Some(token) = self.token().await? else {
            return Ok(self.status_with(None));
        };
        if let Some(login) = lock(&self.login)?.clone() {
            return Ok(self.status_with(Some(login)));
        }
        match self.http.get_login(&token).await {
            Ok(login) => {
                *lock(&self.login)? = Some(login.clone());
                Ok(self.status_with(Some(login)))
            }
            Err(e) if e.code == "unauthorized" => Ok(self.status_with(None)),
            Err(e) => Err(e),
        }
    }

    pub async fn import_gh_token(&self) -> Result<GithubAuthStatus> {
        let token = auth::gh_auth_token().await?;
        self.store_token(&token, "gh").await
    }

    pub async fn set_token(&self, token: String) -> Result<GithubAuthStatus> {
        let token = token.trim().to_string();
        if token.is_empty() {
            return Err(AppError::invalid("token is empty"));
        }
        self.store_token(&token, "keychain").await
    }

    pub async fn device_start(&self) -> Result<DeviceCode> {
        let client_id = self
            .client_id()
            .ok_or_else(|| AppError::new("device_flow_unavailable", "DIFFITY_GITHUB_CLIENT_ID is not set"))?;
        auth::device_start(&self.http, &client_id).await
    }

    pub async fn device_poll(&self, device_code: String) -> Result<GithubAuthStatus> {
        let client_id = self
            .client_id()
            .ok_or_else(|| AppError::new("device_flow_unavailable", "DIFFITY_GITHUB_CLIENT_ID is not set"))?;
        let token = auth::device_poll(&self.http, &client_id, &device_code).await?;
        self.store_token(&token, "keychain").await
    }

    pub async fn logout(&self) -> Result<()> {
        if self.token_source().as_deref() != Some("gh") {
            auth::keychain_delete().await?;
        }
        db::delete_setting(&self.store, TOKEN_SOURCE_KEY)?;
        *lock(&self.token)? = None;
        *lock(&self.login)? = None;
        Ok(())
    }

    pub async fn git_fetch(&self, repo_path: &str) -> Result<GitOpResult> {
        let out = gitcli::run(repo_path, &["fetch", "--prune"]).await?;
        Ok(GitOpResult {
            ok: out.ok,
            output: out.output,
        })
    }

    pub async fn git_pull(&self, repo_path: &str) -> Result<GitOpResult> {
        gitcli::ensure_clean(repo_path, "pulling").await?;
        let out = gitcli::run(repo_path, &["pull", "--ff-only"]).await?;
        Ok(GitOpResult {
            ok: out.ok,
            output: out.output,
        })
    }

    pub async fn git_push(&self, repo_path: &str) -> Result<GitOpResult> {
        let out = if gitcli::has_upstream(repo_path).await? {
            gitcli::run(repo_path, &["push"]).await?
        } else {
            let branch = gitcli::current_branch(repo_path)
                .await?
                .ok_or_else(|| AppError::new("detached_head", "Cannot push from a detached HEAD"))?;
            gitcli::run(repo_path, &["push", "-u", "origin", &branch]).await?
        };
        Ok(GitOpResult {
            ok: out.ok,
            output: out.output,
        })
    }

    async fn origin_slug(&self, repo_path: &str) -> Result<RepoSlug> {
        let url = gitcli::origin_url(repo_path).await?;
        remote::parse_remote_url(&url).ok_or_else(remote::not_github)
    }

    async fn fetch_pr(&self, token: &str, slug: &RepoSlug, number: u64) -> Result<PrNode> {
        let data: RepositoryData<PullRequestField<PrNode>> = self
            .http
            .query(
                token,
                &get_pr_query(),
                json!({ "owner": slug.owner, "name": slug.name, "number": number }),
            )
            .await?;
        data.repository
            .and_then(|r| r.pull_request)
            .ok_or_else(|| AppError::not_found(format!("PR #{number} not found in {}", slug.full_name())))
    }

    async fn fetch_pr_files(&self, token: &str, slug: &RepoSlug, number: u64) -> Result<HashSet<String>> {
        let mut files = HashSet::new();
        let mut after: Option<String> = None;
        loop {
            let data: RepositoryData<PullRequestField<FilesField>> = self
                .http
                .query(
                    token,
                    FILES_QUERY,
                    json!({ "owner": slug.owner, "name": slug.name, "number": number, "after": after }),
                )
                .await?;
            let conn = data
                .repository
                .and_then(|r| r.pull_request)
                .ok_or_else(|| AppError::not_found(format!("PR #{number} not found")))?
                .files;
            let next = conn.next_cursor();
            files.extend(conn.into_items().into_iter().map(|f| f.path));
            match next {
                Some(cursor) => after = Some(cursor),
                None => return Ok(files),
            }
        }
    }

    async fn fetch_threads(&self, token: &str, slug: &RepoSlug, number: u64) -> Result<Vec<FullThread>> {
        let query = threads_query();
        let mut out = Vec::new();
        let mut after: Option<String> = None;
        loop {
            let data: RepositoryData<PullRequestField<ThreadsField>> = self
                .http
                .query(
                    token,
                    &query,
                    json!({ "owner": slug.owner, "name": slug.name, "number": number, "after": after }),
                )
                .await?;
            let conn = data
                .repository
                .and_then(|r| r.pull_request)
                .ok_or_else(|| AppError::not_found(format!("PR #{number} not found")))?
                .review_threads;
            let next = conn.next_cursor();
            for mut thread in conn.into_items() {
                let comments_conn = std::mem::replace(
                    &mut thread.comments,
                    Connection {
                        nodes: Vec::new(),
                        page_info: None,
                    },
                );
                let mut cursor = comments_conn.next_cursor();
                let mut comments = comments_conn.into_items();
                while let Some(c) = cursor {
                    let more = self.fetch_more_comments(token, &thread.id, &c).await?;
                    cursor = more.next_cursor();
                    comments.extend(more.into_items());
                }
                out.push(FullThread { thread, comments });
            }
            match next {
                Some(cursor) => after = Some(cursor),
                None => return Ok(out),
            }
        }
    }

    async fn fetch_more_comments(&self, token: &str, thread_id: &str, after: &str) -> Result<Connection<RemoteComment>> {
        let data: NodeData = self
            .http
            .query(token, &thread_comments_query(), json!({ "id": thread_id, "after": after }))
            .await?;
        data.node
            .and_then(|n| n.comments)
            .ok_or_else(|| AppError::not_found("review thread not found"))
    }

    pub async fn find_pr(&self, repo_path: &str) -> Result<Option<PullRequest>> {
        let slug = self.origin_slug(repo_path).await?;
        let token = self.require_token().await?;
        let Some(branch) = gitcli::current_branch(repo_path).await? else {
            return Ok(None);
        };
        // Fork PRs are checked out as a local `pr-<n>` branch (see `checkout_pr`), whose name doesn't
        // match the PR's head branch, so look the PR up by number.
        if let Some(number) = linked_pr_number(repo_path, &branch).await {
            if let Ok(pr) = self.fetch_pr(&token, &slug, number).await {
                return Ok(Some(pr.to_pull_request()));
            }
        }
        let data: RepositoryData<PullRequestsField> = self
            .http
            .query(
                &token,
                &find_pr_query(),
                json!({ "owner": slug.owner, "name": slug.name, "branch": branch }),
            )
            .await?;
        let full = slug.full_name();
        let head_repo = branch_head_repo(repo_path, &branch).await.map(|s| s.full_name());
        let found = data
            .repository
            .map(|r| r.pull_requests.into_items())
            .unwrap_or_default()
            .into_iter()
            .find(|pr| {
                pr.head_ref_name == branch
                    && pr.head_repo_full_name().is_some_and(|name| {
                        name.eq_ignore_ascii_case(&full)
                            || head_repo.as_deref().is_some_and(|h| name.eq_ignore_ascii_case(h))
                    })
            });
        Ok(found.map(|pr| pr.to_pull_request()))
    }

    pub async fn list_prs(&self, repo_path: &str) -> Result<Vec<PullRequest>> {
        let slug = self.origin_slug(repo_path).await?;
        let token = self.require_token().await?;
        let data: RepositoryData<PullRequestsField> = self
            .http
            .query(&token, &list_prs_query(), json!({ "owner": slug.owner, "name": slug.name }))
            .await?;
        Ok(data
            .repository
            .map(|r| r.pull_requests.into_items())
            .unwrap_or_default()
            .iter()
            .map(PrNode::to_pull_request)
            .collect())
    }

    pub async fn checkout_pr(&self, repo_path: &str, url_or_number: String) -> Result<PullRequest> {
        let slug = self.origin_slug(repo_path).await?;
        let input = url_or_number.trim();
        let number = if let Some(pr_ref) = remote::parse_pr_url(input) {
            if !pr_ref.slug.matches(&slug) {
                return Err(AppError::new(
                    "wrong_repo",
                    format!(
                        "PR belongs to {} but this repository's origin is {}",
                        pr_ref.slug.full_name(),
                        slug.full_name()
                    ),
                ));
            }
            pr_ref.number
        } else {
            input
                .trim_start_matches('#')
                .parse::<u64>()
                .map_err(|_| AppError::invalid("expected a PR number or GitHub PR URL"))?
        };
        let token = self.require_token().await?;
        gitcli::ensure_clean(repo_path, "checking out a PR").await?;
        let pr = self.fetch_pr(&token, &slug, number).await?;
        let full = slug.full_name();
        let same_repo = pr
            .head_repo_full_name()
            .is_some_and(|name| name.eq_ignore_ascii_case(&full));
        // The PR diff is `origin/<base>...HEAD`, so the base must be current too.
        let base = pr.base_ref_name.as_str();
        let base_refspec = format!("+refs/heads/{base}:refs/remotes/origin/{base}");
        gitcli::run_ok(repo_path, &["fetch", "origin", &base_refspec]).await?;
        let head = pr.head_ref_name.as_str();
        let head_refspec = format!("+refs/heads/{head}:refs/remotes/origin/{head}");
        // A merged PR's branch is often deleted: fall back to `pull/<n>/head`, like fork PRs.
        let fetched_branch = same_repo && gitcli::run(repo_path, &["fetch", "origin", &head_refspec]).await?.ok;
        if fetched_branch {
            let remote_ref = format!("origin/{head}");
            if gitcli::branch_exists(repo_path, head).await? {
                gitcli::run_ok(repo_path, &["checkout", head]).await?;
                gitcli::run_ok(repo_path, &["merge", "--ff-only", &remote_ref]).await?;
            } else {
                gitcli::run_ok(repo_path, &["checkout", "-b", head, "--track", &remote_ref]).await?;
            }
        } else {
            let pull_ref = format!("pull/{number}/head");
            let branch = format!("pr-{number}");
            gitcli::run_ok(repo_path, &["fetch", "origin", &pull_ref]).await?;
            gitcli::run_ok(repo_path, &["checkout", "-B", &branch, "FETCH_HEAD"]).await?;
            let key = format!("branch.{branch}.{PR_BRANCH_CONFIG}");
            gitcli::run_ok(repo_path, &["config", &key, &number.to_string()]).await?;
        }
        Ok(pr.to_pull_request())
    }

    pub async fn stash_push(&self, repo_path: &str, message: &str) -> Result<StashResult> {
        let sha = gitcli::stash_push(repo_path, message).await?;
        Ok(StashResult {
            sha,
            message: message.to_string(),
        })
    }

    pub async fn stash_restore(&self, repo_path: &str, sha: &str) -> Result<()> {
        gitcli::stash_restore(repo_path, sha).await
    }

    pub async fn checkout(&self, repo_path: &str, target: &str) -> Result<()> {
        gitcli::checkout(repo_path, target).await
    }

    /// Everything needed to decide which local comments can be posted to PR `pr_number`.
    async fn pr_context(&self, repo_path: &str, pr_number: u64) -> Result<PrContext> {
        let slug = self.origin_slug(repo_path).await?;
        let token = self.require_token().await?;
        let pr = self.fetch_pr(&token, &slug, pr_number).await?;
        let files = self.fetch_pr_files(&token, &slug, pr_number).await?;
        let head = gitcli::head_sha(repo_path).await?;
        let locally_changed = gitcli::changed_files(repo_path).await?;
        let store = self.store.clone();
        let repo = repo_path.to_string();
        let pr_ref = format!("origin/{}...HEAD", pr.base_ref_name);
        let head_for_anchor = head.clone();
        let (threads, sessions, anchors, lines) = tokio::task::spawn_blocking(move || -> Result<_> {
            let repo_dir = std::path::Path::new(&repo);
            let pr_base = diffity_core::diff::resolve_ref(repo_dir, &pr_ref)
                .ok()
                .and_then(|r| r.base_sha);
            let mut anchors = HashMap::new();
            let mut sessions = HashMap::new();
            for (session_id, session_ref) in db::list_repo_sessions(&store, &repo)? {
                let anchor = session_anchor(repo_dir, &session_ref, &pr_ref, &head_for_anchor, pr_base.as_deref());
                anchors.insert(session_id.clone(), anchor);
                sessions.insert(session_id, session_ref);
            }
            let threads = db::list_repo_threads(&store, &repo)?;
            let mut lines = HashMap::new();
            let commented: HashSet<&str> = threads
                .iter()
                .filter(|t| t.github_thread_id.is_none() && t.file_path != diffity_core::types::GENERAL_FILE_PATH)
                .map(|t| t.file_path.as_str())
                .collect();
            for path in commented {
                if let Ok(patch) = diffity_core::diff::get_file_patch(repo_dir, &pr_ref, path, None, false) {
                    if let Some(file) = diffity_core::repo_threads::index_patch(&patch).remove(path) {
                        lines.insert(path.to_string(), file);
                    }
                }
            }
            Ok((threads, sessions, anchors, lines))
        })
        .await
        .map_err(|e| AppError::internal(e.to_string()))??;
        let head_mismatch = (!head.eq_ignore_ascii_case(&pr.head_ref_oid)).then(|| {
            format!(
                "Your local branch is at {} but PR #{pr_number}'s head is {}. Pull or push so they match, then try again.",
                short(&head),
                short(&pr.head_ref_oid)
            )
        });
        Ok(PrContext {
            slug,
            token,
            pr,
            head_mismatch,
            anchors,
            sessions,
            threads,
            diff: review::PrDiff { files, lines, locally_changed },
        })
    }

    async fn fetch_pending_review(&self, token: &str, slug: &RepoSlug, number: u64) -> Result<Option<GithubPendingReview>> {
        let data: RepositoryData<PullRequestField<PendingReviewsField>> = self
            .http
            .query(
                token,
                PENDING_REVIEWS_QUERY,
                json!({ "owner": slug.owner, "name": slug.name, "number": number }),
            )
            .await?;
        let reviews = data
            .repository
            .and_then(|r| r.pull_request)
            .map(|p| p.reviews.into_items())
            .unwrap_or_default();
        Ok(reviews.into_iter().find(|r| r.viewer_did_author).map(|r| GithubPendingReview {
            id: r.id,
            comment_count: r.comments.total_count,
            url: r.url,
        }))
    }

    /// Your open comments not yet on GitHub (drafts and local threads from every view of the repo), each marked
    /// postable or with the reason it can't be posted to the PR.
    pub async fn review_candidates(&self, repo_path: &str, pr_number: u64) -> Result<ReviewCandidates> {
        let ctx = self.pr_context(repo_path, pr_number).await?;
        let github_pending = match self.fetch_pending_review(&ctx.token, &ctx.slug, pr_number).await {
            Ok(pending) => pending,
            Err(e) => {
                tracing::warn!("github: pending review lookup failed: {}", e.message);
                None
            }
        };
        let mut candidates = review::review_candidates(ctx.threads, &ctx.sessions, &ctx.anchors, &ctx.diff);
        if let Some(blocker) = &ctx.head_mismatch {
            for c in candidates.iter_mut().filter(|c| c.blocked_reason.is_none()) {
                c.blocked_reason = Some(format!("Can't be posted: {blocker}"));
            }
        }
        Ok(ReviewCandidates {
            candidates,
            blocker: ctx.head_mismatch,
            github_pending,
            pr_url: ctx.pr.url,
        })
    }

    /// Runs a GitHub mutation, or in dry-run mode records it in `result` and returns `None`.
    async fn mutate<T: serde::de::DeserializeOwned>(
        &self,
        token: &str,
        name: &str,
        query: &str,
        variables: serde_json::Value,
        result: &mut PushResult,
    ) -> Result<Option<T>> {
        if dry_run() {
            tracing::info!(target: "github_dry_run", "{name}: {}", serde_json::to_string_pretty(&variables).unwrap_or_default());
            result.dry_run = true;
            result.dry_run_mutations.push(json!({ "mutation": name, "variables": variables }));
            return Ok(None);
        }
        self.http.query(token, query, variables).await.map(Some)
    }

    #[allow(clippy::too_many_arguments)]
    pub async fn push_review(
        &self,
        repo_path: &str,
        session_id: &str,
        pr_number: u64,
        event: ReviewEvent,
        body: Option<String>,
        thread_ids: Option<Vec<String>>,
        review_id: Option<String>,
        pending_action: Option<GithubPendingAction>,
    ) -> Result<PushResult> {
        let ctx = self.pr_context(repo_path, pr_number).await?;
        if let Some(message) = &ctx.head_mismatch {
            return Err(AppError::new("head_mismatch", message.clone()));
        }
        let token = ctx.token.as_str();

        let mut review_replies: Vec<(String, String, String)> = Vec::new();
        if let Some(rid) = &review_id {
            let review = self.store.get_review(rid)?;
            if review.state != ReviewState::Submitted {
                return Err(AppError::invalid("submit the review before pushing it to GitHub"));
            }
            review_replies = review::select_review(ctx.threads.clone(), rid).replies;
        }
        // Explicit thread ids may come from any of the repo's sessions (see `review_candidates`).
        let threads: Vec<Thread> = match (&thread_ids, &review_id) {
            (Some(ids), _) => {
                let wanted: HashSet<&str> = ids.iter().map(String::as_str).collect();
                ctx.threads
                    .iter()
                    .filter(|t| wanted.contains(t.id.as_str()) && t.github_thread_id.is_none() && !t.pending)
                    .cloned()
                    .collect()
            }
            (None, Some(rid)) => review::select_review(ctx.threads.clone(), rid).threads,
            (None, None) => ctx
                .threads
                .iter()
                .filter(|t| t.session_id == session_id)
                .filter(|t| t.status == ThreadStatus::Open && t.github_thread_id.is_none() && !t.pending)
                .cloned()
                .collect(),
        };

        let mut result = PushResult::default();
        let mut postable: Vec<&Thread> = Vec::new();
        for thread in &threads {
            match review::postable_reason(thread, ctx.anchors.get(&thread.session_id), &ctx.diff) {
                None => postable.push(thread),
                Some(reason) => {
                    result.skipped += 1;
                    result.errors.push(format!("{} — {reason}", location(thread)));
                }
            }
        }
        let by_id: HashMap<&str, &Thread> = postable.iter().map(|t| (t.id.as_str(), *t)).collect();
        let candidates: Vec<PushCandidate> = postable.iter().map(|t| candidate_from_thread(t)).collect();
        let plan = review::build_review_plan(&candidates, &ctx.diff.files);
        result.skipped += plan.skipped.len() as u32;
        result.errors.extend(plan.skipped.iter().cloned());

        let review_body = review::compose_review_body(body.as_deref(), &plan.body_sections);
        if plan.drafts.is_empty() && review_body.is_empty() && event == ReviewEvent::Comment && review_replies.is_empty() {
            if result.skipped > 0 {
                return Err(AppError::invalid(format!(
                    "Nothing was posted. {}",
                    result.errors.join("; ")
                )));
            }
            return Ok(result);
        }

        let pending = self.fetch_pending_review(token, &ctx.slug, pr_number).await?;
        let draft_values: Vec<&review::DraftThread> = plan.drafts.iter().map(|(_, d)| d).collect();
        let mut mapped: Vec<(String, String, Option<i64>)> = Vec::new();
        let github_review_id: Option<String>;

        match (pending, pending_action) {
            (Some(existing), None) => {
                return Err(pending_exists_error(pr_number, existing.comment_count));
            }
            (Some(existing), Some(GithubPendingAction::AddToExisting)) => {
                for (thread_id, draft) in &plan.drafts {
                    let mut input = serde_json::to_value(draft).unwrap_or_default();
                    input["pullRequestReviewId"] = json!(existing.id);
                    let added: Option<AddThreadData> = self
                        .mutate(token, "addPullRequestReviewThread", ADD_THREAD_MUTATION, json!({ "input": input }), &mut result)
                        .await
                        .map_err(|e| github_rejected(&e))?;
                    if let Some(thread) = added.and_then(|d| d.add_pull_request_review_thread.thread) {
                        let first = thread.comments.into_items().into_iter().next().and_then(|c| c.database_id);
                        mapped.push((thread_id.clone(), thread.id, first));
                    }
                }
                let submitted: Option<SubmitReviewData> = self
                    .mutate(
                        token,
                        "submitPullRequestReview",
                        SUBMIT_REVIEW_MUTATION,
                        json!({ "input": { "pullRequestReviewId": existing.id, "event": event_name(event), "body": review_body } }),
                        &mut result,
                    )
                    .await
                    .map_err(|e| github_rejected(&e))?;
                let node = submitted.and_then(|d| d.submit_pull_request_review.pull_request_review);
                result.review_url = node.as_ref().and_then(|n| n.url.clone()).or(existing.url);
                github_review_id = node.map(|n| n.id);
            }
            (existing, _) => {
                if let Some(existing) = existing {
                    let _: Option<serde_json::Value> = self
                        .mutate(
                            token,
                            "deletePullRequestReview",
                            DELETE_REVIEW_MUTATION,
                            json!({ "input": { "pullRequestReviewId": existing.id } }),
                            &mut result,
                        )
                        .await
                        .map_err(|e| github_rejected(&e))?;
                }
                let input = json!({
                    "pullRequestId": ctx.pr.id,
                    "commitOID": ctx.pr.head_ref_oid,
                    "event": event_name(event),
                    "body": review_body,
                    "threads": draft_values,
                });
                let created: Option<AddReviewData> = self
                    .mutate(token, "addPullRequestReview", ADD_REVIEW_MUTATION, json!({ "input": input }), &mut result)
                    .await
                    .map_err(|e| {
                        if is_pending_conflict(&e.message) {
                            return pending_exists_error(pr_number, 0);
                        }
                        github_rejected(&e)
                    })?;
                let node = created.and_then(|d| d.add_pull_request_review.pull_request_review);
                if node.is_none() && !result.dry_run {
                    return Err(AppError::new("github", "GitHub did not return a review"));
                }
                result.review_url = node.as_ref().and_then(|n| n.url.clone());
                github_review_id = node.map(|n| n.id);
            }
        }

        for (github_thread_id, comment_id, reply_body) in &review_replies {
            let variables = json!({ "input": { "pullRequestReviewThreadId": github_thread_id, "body": reply_body } });
            match self.mutate::<ReplyData>(token, "addPullRequestReviewThreadReply", REPLY_MUTATION, variables, &mut result).await {
                Ok(Some(data)) => {
                    if let Some(id) = data.add_pull_request_review_thread_reply.comment.and_then(|c| c.database_id) {
                        db::set_comment_github_id(&self.store, comment_id, id)?;
                    }
                    result.pushed += 1;
                }
                Ok(None) => result.pushed += 1,
                Err(e) => {
                    result.failed += 1;
                    result.errors.push(format!("reply not synced: {}", e.message));
                }
            }
        }

        result.pushed += (plan.in_body.len() + plan.drafts.len()) as u32;
        if result.dry_run {
            return Ok(result);
        }
        result.posted_thread_ids.extend(plan.in_body.iter().cloned());

        if mapped.is_empty() && !plan.drafts.is_empty() {
            let review_id = github_review_id.unwrap_or_default();
            let remote_threads = self.fetch_threads(token, &ctx.slug, pr_number).await?;
            let mut remote: Vec<&FullThread> = remote_threads
                .iter()
                .filter(|ft| {
                    ft.comments
                        .first()
                        .and_then(|c| c.pull_request_review.as_ref())
                        .is_some_and(|r| r.id == review_id)
                })
                .collect();
            for (thread_id, draft) in &plan.drafts {
                let position = remote.iter().position(|ft| {
                    ft.thread.path == draft.path && ft.comments.first().is_some_and(|c| c.body.trim() == draft.body.trim())
                });
                let Some(position) = position else {
                    result
                        .errors
                        .push(format!("{}:{} — review created but thread could not be mapped", draft.path, draft.line));
                    continue;
                };
                let ft = remote.remove(position);
                mapped.push((thread_id.clone(), ft.thread.id.clone(), ft.comments.first().and_then(|c| c.database_id)));
            }
        }

        for (thread_id, github_thread_id, first_id) in &mapped {
            let Some(local) = by_id.get(thread_id.as_str()) else {
                continue;
            };
            db::set_thread_github_ids(&self.store, thread_id, github_thread_id, *first_id)?;
            result.posted_thread_ids.push(thread_id.clone());
            if let (Some(first_local), Some(id)) = (local.comments.first(), first_id) {
                db::set_comment_github_id(&self.store, &first_local.id, *id)?;
            }
            for extra in local.comments.iter().skip(1).filter(|c| !c.pending) {
                match self.post_reply(token, github_thread_id, &extra.body).await {
                    Ok(Some(id)) => db::set_comment_github_id(&self.store, &extra.id, id)?,
                    Ok(None) => {}
                    Err(e) => result.errors.push(format!("{} — reply not synced: {}", location(local), e.message)),
                }
            }
        }
        Ok(result)
    }

    async fn post_reply(&self, token: &str, github_thread_id: &str, body: &str) -> Result<Option<i64>> {
        let data: ReplyData = self
            .http
            .query(
                token,
                REPLY_MUTATION,
                json!({ "input": { "pullRequestReviewThreadId": github_thread_id, "body": body } }),
            )
            .await?;
        Ok(data.add_pull_request_review_thread_reply.comment.and_then(|c| c.database_id))
    }

    /// Open, unsynced threads from all of the repo's review sessions that can be pushed to the PR:
    /// the file is in the PR and the commented side is anchored like GitHub's PR diff.
    pub async fn pushable_threads(&self, repo_path: &str, pr_number: u64) -> Result<Vec<Thread>> {
        let slug = self.origin_slug(repo_path).await?;
        let token = self.require_token().await?;
        let pr = self.fetch_pr(&token, &slug, pr_number).await?;
        let pr_files = self.fetch_pr_files(&token, &slug, pr_number).await?;
        let head = gitcli::head_sha(repo_path).await?;
        let store = self.store.clone();
        let repo = repo_path.to_string();
        let pr_ref = format!("origin/{}...HEAD", pr.base_ref_name);
        let (threads, anchors) = tokio::task::spawn_blocking(move || -> Result<_> {
            let repo_dir = std::path::Path::new(&repo);
            let pr_base = diffity_core::diff::resolve_ref(repo_dir, &pr_ref)
                .ok()
                .and_then(|r| r.base_sha);
            let mut anchors = HashMap::new();
            for (session_id, session_ref) in db::list_repo_sessions(&store, &repo)? {
                let anchor = session_anchor(repo_dir, &session_ref, &pr_ref, &head, pr_base.as_deref());
                anchors.insert(session_id, anchor);
            }
            Ok((db::list_repo_threads(&store, &repo)?, anchors))
        })
        .await
        .map_err(|e| AppError::internal(e.to_string()))??;
        Ok(review::select_pushable(threads, &anchors, &pr_files))
    }

    pub async fn pull_review(&self, repo_path: &str, session_id: &str, pr_number: u64) -> Result<PullResult> {
        let slug = self.origin_slug(repo_path).await?;
        let token = self.require_token().await?;
        let remote_threads = self.fetch_threads(&token, &slug, pr_number).await?;
        // Threads already linked to GitHub may live in any session of the repo (e.g. pushed from `work`);
        // update them in place and only create new remote threads in `session_id`.
        let local: HashMap<String, Thread> = db::list_repo_threads(&self.store, repo_path)?
            .into_iter()
            .filter_map(|t| t.github_thread_id.clone().map(|id| (id, t)))
            .collect();
        let mut result = PullResult::default();

        for full in &remote_threads {
            if let Some(existing) = local.get(&full.thread.id) {
                if self.merge_into_existing(existing, full)? {
                    result.updated += 1;
                } else {
                    result.skipped += 1;
                }
                continue;
            }
            let Some(spec) = review::map_remote_thread(&full.thread) else {
                result.skipped += 1;
                continue;
            };
            if full.comments.is_empty() {
                result.skipped += 1;
                continue;
            }
            let created_at = full.comments[0].created_at.as_str();
            let thread_id = db::insert_remote_thread(
                &self.store,
                &NewRemoteThread {
                    session_id,
                    file_path: &spec.file_path,
                    side: spec.side,
                    start_line: spec.start_line,
                    end_line: spec.end_line,
                    status: spec.status,
                    github_thread_id: &full.thread.id,
                    first_comment_id: full.comments[0].database_id,
                    created_at,
                },
            )?;
            for comment in &full.comments {
                insert_remote_comment(&self.store, &thread_id, comment)?;
            }
            result.pulled += 1;
        }
        Ok(result)
    }

    fn merge_into_existing(&self, existing: &Thread, full: &FullThread) -> Result<bool> {
        let mut changed = false;
        let known: HashSet<i64> = existing.comments.iter().filter_map(|c| c.github_comment_id).collect();
        let mut unlinked: Vec<&diffity_core::types::Comment> = existing
            .comments
            .iter()
            .filter(|c| c.github_comment_id.is_none())
            .collect();
        for comment in &full.comments {
            let Some(id) = comment.database_id else {
                continue;
            };
            if known.contains(&id) {
                continue;
            }
            if let Some(pos) = unlinked.iter().position(|c| c.body.trim() == comment.body.trim()) {
                let local = unlinked.remove(pos);
                db::set_comment_github_id(&self.store, &local.id, id)?;
                continue;
            }
            insert_remote_comment(&self.store, &existing.id, comment)?;
            changed = true;
        }
        match (full.thread.is_resolved, existing.status) {
            (true, ThreadStatus::Open) => {
                db::set_thread_status(&self.store, &existing.id, ThreadStatus::Resolved)?;
                changed = true;
            }
            (false, ThreadStatus::Resolved) => {
                db::set_thread_status(&self.store, &existing.id, ThreadStatus::Open)?;
                changed = true;
            }
            _ => {}
        }
        Ok(changed)
    }

    pub async fn reply(&self, thread_id: &str, body: String) -> Result<Thread> {
        let thread = db::get_thread(&self.store, thread_id)?;
        let author = lock(&self.login)?.clone().unwrap_or_else(|| "you".to_string());
        let mut github_comment_id = None;
        if let Some(github_thread_id) = &thread.github_thread_id {
            let token = self.require_token().await?;
            github_comment_id = self.post_reply(&token, github_thread_id, &body).await?;
        }
        db::insert_comment(
            &self.store,
            thread_id,
            &NewComment {
                author_type: AuthorType::User,
                author_name: &author,
                body: &body,
                github_comment_id,
                created_at: None,
            },
        )?;
        if thread.github_thread_id.is_none() && thread.status != ThreadStatus::Open {
            db::reopen_thread(&self.store, thread_id)?;
        }
        db::get_thread(&self.store, thread_id)
    }

    /// Posts an existing local comment (e.g. Claude's reply) to its GitHub review thread as a reply.
    pub async fn post_comment_to_github(&self, comment_id: &str) -> Result<Thread> {
        let comment = self.store.get_comment(comment_id)?;
        if comment.github_comment_id.is_some() {
            return db::get_thread(&self.store, &comment.thread_id);
        }
        let thread = db::get_thread(&self.store, &comment.thread_id)?;
        let Some(github_thread_id) = thread.github_thread_id.clone() else {
            return Err(AppError::invalid("this thread is not on GitHub"));
        };
        let token = self.require_token().await?;
        let body = if comment.author_type == AuthorType::Agent {
            format!("{}\n\n<sub>Reply drafted by {} in Diffity.</sub>", comment.body.trim_end(), comment.author_name)
        } else {
            comment.body.clone()
        };
        if let Some(id) = self.post_reply(&token, &github_thread_id, &body).await? {
            db::set_comment_github_id(&self.store, comment_id, id)?;
        }
        db::get_thread(&self.store, &comment.thread_id)
    }

    /// Stages everything and commits it (no amend, no hooks bypass).
    pub async fn git_commit_all(&self, repo_path: &str, message: &str) -> Result<GitOpResult> {
        let message = message.trim();
        if message.is_empty() {
            return Err(AppError::invalid("a commit message is required"));
        }
        let add = gitcli::run(repo_path, &["add", "-A"]).await?;
        if !add.ok {
            return Ok(GitOpResult { ok: false, output: add.output });
        }
        let out = gitcli::run(repo_path, &["commit", "-m", message]).await?;
        Ok(GitOpResult { ok: out.ok, output: out.output })
    }

    pub async fn set_resolved(&self, thread_id: &str, resolved: bool) -> Result<Thread> {
        let thread = db::get_thread(&self.store, thread_id)?;
        if let Some(github_thread_id) = &thread.github_thread_id {
            let token = self.require_token().await?;
            let mutation = if resolved { RESOLVE_MUTATION } else { UNRESOLVE_MUTATION };
            let _: serde_json::Value = self
                .http
                .query(&token, mutation, json!({ "id": github_thread_id }))
                .await?;
        }
        let status = if resolved { ThreadStatus::Resolved } else { ThreadStatus::Open };
        db::set_thread_status(&self.store, thread_id, status)?;
        db::get_thread(&self.store, thread_id)
    }
}

struct PrContext {
    slug: RepoSlug,
    token: String,
    pr: PrNode,
    head_mismatch: Option<String>,
    anchors: HashMap<String, review::SessionAnchor>,
    sessions: HashMap<String, String>,
    threads: Vec<Thread>,
    diff: review::PrDiff,
}

fn location(thread: &Thread) -> String {
    if thread.file_path == diffity_core::types::GENERAL_FILE_PATH {
        return "General comment".into();
    }
    if thread.start_line == 0 || thread.start_line == thread.end_line {
        return format!("{}:{}", thread.file_path, thread.end_line);
    }
    format!("{}:{}-{}", thread.file_path, thread.start_line, thread.end_line)
}

fn is_pending_conflict(message: &str) -> bool {
    let lower = message.to_ascii_lowercase();
    lower.contains("one pending review") || lower.contains("pending review per pull request")
}

fn pending_exists_error(pr_number: u64, comment_count: u32) -> AppError {
    let comments = match comment_count {
        0 => String::new(),
        1 => " (1 comment)".into(),
        n => format!(" ({n} comments)"),
    };
    AppError::new(
        "pending_review_exists",
        format!(
            "You already have a pending review on PR #{pr_number} on GitHub{comments}. Add these comments to it, or discard it and post a new review."
        ),
    )
}

fn github_rejected(e: &AppError) -> AppError {
    if e.code == "github" {
        return AppError::new("github", format!("GitHub rejected the review: {}", e.message));
    }
    e.clone()
}

fn short(sha: &str) -> &str {
    sha.get(..7).unwrap_or(sha)
}

fn event_name(event: ReviewEvent) -> &'static str {
    match event {
        ReviewEvent::Comment => "COMMENT",
        ReviewEvent::Approve => "APPROVE",
        ReviewEvent::RequestChanges => "REQUEST_CHANGES",
    }
}

/// Git config key (under `branch.<name>.`) recording which PR a `pr-<n>` branch was checked out from.
const PR_BRANCH_CONFIG: &str = "diffityPr";

/// The repository a branch tracks (`branch.<b>.remote`), e.g. a fork after `gh pr checkout`.
async fn branch_head_repo(repo_path: &str, branch: &str) -> Option<RepoSlug> {
    let key = format!("branch.{branch}.remote");
    let out = gitcli::run(repo_path, &["config", "--get", &key]).await.ok().filter(|out| out.ok)?;
    let remote = out.output.trim().to_string();
    if let Some(slug) = remote::parse_remote_url(&remote) {
        return Some(slug);
    }
    let url_key = format!("remote.{remote}.url");
    let url = gitcli::run(repo_path, &["config", "--get", &url_key]).await.ok().filter(|out| out.ok)?;
    remote::parse_remote_url(url.output.trim())
}

async fn linked_pr_number(repo_path: &str, branch: &str) -> Option<u64> {
    let merge_key = format!("branch.{branch}.merge");
    let merge = gitcli::run(repo_path, &["config", "--get", &merge_key])
        .await
        .ok()
        .filter(|out| out.ok)
        .map(|out| out.output.trim().to_string());
    if let Some(n) = merge
        .as_deref()
        .and_then(|m| m.strip_prefix("refs/pull/"))
        .and_then(|rest| rest.strip_suffix("/head"))
        .and_then(|n| n.parse::<u64>().ok())
    {
        return Some(n);
    }
    let key = format!("branch.{branch}.{PR_BRANCH_CONFIG}");
    let configured = gitcli::run(repo_path, &["config", "--get", &key])
        .await
        .ok()
        .filter(|out| out.ok)
        .and_then(|out| out.output.trim().parse::<u64>().ok());
    if configured.is_some() {
        return configured;
    }
    branch.strip_prefix("pr-").and_then(|n| n.parse::<u64>().ok())
}

fn session_anchor(
    repo: &std::path::Path,
    session_ref: &str,
    pr_ref: &str,
    head: &str,
    pr_base: Option<&str>,
) -> review::SessionAnchor {
    let is_pr_session = session_ref == pr_ref;
    if session_ref == diffity_core::types::TREE_REF {
        return review::SessionAnchor {
            new_matches: true,
            new_is_local: true,
            ..Default::default()
        };
    }
    let Ok(resolved) = diffity_core::diff::resolve_ref(repo, session_ref) else {
        return review::SessionAnchor {
            new_matches: is_pr_session,
            old_matches: is_pr_session,
            is_pr_session,
            new_is_local: false,
        };
    };
    let same = |a: Option<&str>, b: Option<&str>| matches!((a, b), (Some(a), Some(b)) if a.eq_ignore_ascii_case(b));
    review::SessionAnchor {
        new_matches: same(resolved.head_sha.as_deref(), Some(head)),
        old_matches: is_pr_session || same(resolved.base_sha.as_deref(), pr_base),
        is_pr_session,
        // `work`, `staged`, `unstaged` and bare refs compare against the working tree or index; ranges end at a commit.
        new_is_local: !session_ref.contains(".."),
    }
}

fn candidate_from_thread(thread: &Thread) -> PushCandidate {
    PushCandidate {
        thread_id: thread.id.clone(),
        file_path: thread.file_path.clone(),
        side: thread.side,
        start_line: thread.start_line,
        end_line: thread.end_line,
        severity: thread.severity,
        comments: thread
            .comments
            .iter()
            .map(|c| PushComment {
                author_name: c.author_name.clone(),
                body: c.body.clone(),
            })
            .collect(),
    }
}

fn insert_remote_comment(store: &Store, thread_id: &str, comment: &RemoteComment) -> Result<()> {
    let author_type = if review::is_bot(comment.author.as_ref()) {
        AuthorType::Agent
    } else {
        AuthorType::Github
    };
    let name = comment.author.as_ref().map(|a| a.login.as_str()).unwrap_or("ghost");
    db::insert_comment(
        store,
        thread_id,
        &NewComment {
            author_type,
            author_name: name,
            body: &comment.body,
            github_comment_id: comment.database_id,
            created_at: Some(&comment.created_at),
        },
    )?;
    Ok(())
}
