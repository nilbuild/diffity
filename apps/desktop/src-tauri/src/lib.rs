mod commands;
mod env_fix;
mod state;
#[cfg(target_os = "macos")]
mod traffic_lights;

use std::sync::Arc;

use diffity_agents::AgentManager;
use diffity_core::store::Store;
use diffity_github::GithubService;
use tauri::{Emitter, Manager};

pub use state::AppState;

/// `diffity-mcp` is bundled as a Tauri `externalBin`: Tauri places it next to the main executable
/// (`target/<profile>/` in dev, `Diffity.app/Contents/MacOS/` when bundled).
fn mcp_binary_path() -> std::path::PathBuf {
    let name = if cfg!(windows) { "diffity-mcp.exe" } else { "diffity-mcp" };
    std::env::current_exe()
        .ok()
        .and_then(|p| p.parent().map(|d| d.join(name)))
        .filter(|p| p.exists())
        .or_else(|| diffity_agents::detect::find_in_path(name))
        .unwrap_or_else(|| name.into())
}

fn init_state(app: &tauri::App) -> anyhow::Result<AppState> {
    let data_dir = app.path().app_data_dir()?;
    std::fs::create_dir_all(&data_dir)?;
    let store = Arc::new(Store::open(data_dir.join("diffity.db")).map_err(|e| anyhow::anyhow!(e))?);
    let agents = Arc::new(AgentManager::new(store.clone(), data_dir.clone(), mcp_binary_path()));
    let handle = app.handle().clone();
    agents.on_threads_changed(Arc::new(move |session_id: &str| {
        let _ = handle.emit("threads-changed", serde_json::json!({ "sessionId": session_id }));
    }));
    let github = Arc::new(GithubService::new(store.clone()));
    Ok(AppState { store, agents, github })
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let _ = tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env().unwrap_or_else(|_| {
                tracing_subscriber::EnvFilter::new(if cfg!(debug_assertions) { "info" } else { "warn" })
            }),
        )
        .try_init();
    env_fix::load_login_shell_env();

    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.unminimize();
                let _ = window.set_focus();
            }
        }))
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .setup(|app| {
            let state = init_state(app)?;
            app.manage(state);
            #[cfg(target_os = "macos")]
            if let Some(window) = app.get_webview_window("main") {
                traffic_lights::center(&window.as_ref().window());
            }
            Ok(())
        })
        // AppKit rebuilds the title bar (and reclaims the buttons) on any of these.
        .on_window_event(|window, event| {
            #[cfg(target_os = "macos")]
            if matches!(
                event,
                tauri::WindowEvent::Resized(_)
                    | tauri::WindowEvent::Moved(_)
                    | tauri::WindowEvent::Focused(_)
                    | tauri::WindowEvent::ThemeChanged(_)
                    | tauri::WindowEvent::ScaleFactorChanged { .. }
            ) {
                traffic_lights::center(window);
            }
            #[cfg(not(target_os = "macos"))]
            let _ = (window, event);
        })
        // Covers `repo-*` windows opened from the frontend via `new WebviewWindow`.
        .on_page_load(|webview, _payload| {
            #[cfg(target_os = "macos")]
            traffic_lights::center(&webview.window());
            #[cfg(not(target_os = "macos"))]
            let _ = webview;
        })
        .invoke_handler(tauri::generate_handler![
            commands::repo::open_repo,
            commands::repo::recent_repos,
            commands::repo::watch_repo,
            commands::repo::unwatch_repo,
            commands::repo::list_commits,
            commands::repo::list_branches,
            commands::repo::git_status,
            commands::repo::repo_overview,
            commands::repo::open_in_editor,
            commands::repo::get_setting,
            commands::repo::set_setting,
            commands::diff::resolve_ref,
            commands::diff::get_diff,
            commands::diff::get_file_versions,
            commands::diff::diff_fingerprint,
            commands::diff::revert_file,
            commands::diff::revert_hunk,
            commands::files::list_tree,
            commands::files::read_file,
            commands::files::read_file_base64,
            commands::comments::get_session,
            commands::comments::list_threads,
            commands::comments::list_repo_threads,
            commands::comments::create_thread,
            commands::comments::add_reply,
            commands::comments::edit_comment,
            commands::comments::delete_comment,
            commands::comments::delete_thread,
            commands::comments::delete_all_threads,
            commands::comments::set_thread_status,
            commands::comments::list_viewed,
            commands::comments::set_viewed,
            commands::comments::get_pending_review,
            commands::comments::start_review,
            commands::comments::get_review,
            commands::comments::list_reviews,
            commands::comments::submit_review,
            commands::comments::discard_review,
            commands::dev::log_frontend,
            commands::dev::dev_launch_target,
            commands::agents::list_agents,
            commands::agents::start_chat,
            commands::agents::list_chats,
            commands::agents::get_chat_messages,
            commands::agents::send_prompt,
            commands::agents::cancel_prompt,
            commands::agents::respond_permission,
            commands::agents::delete_chat,
            commands::github::github_auth_status,
            commands::github::github_import_gh_token,
            commands::github::github_set_token,
            commands::github::github_device_start,
            commands::github::github_device_poll,
            commands::github::github_logout,
            commands::github::git_fetch,
            commands::github::git_pull,
            commands::github::git_push,
            commands::github::find_pr,
            commands::github::list_prs,
            commands::github::checkout_pr,
            commands::github::push_review,
            commands::github::pull_review,
            commands::github::github_pushable_threads,
            commands::github::github_reply,
            commands::github::github_set_resolved,
        ])
        .build(tauri::generate_context!())
        .expect("error while building diffity")
        .run(|app, event| {
            if let tauri::RunEvent::Exit = event {
                if let Some(state) = app.try_state::<AppState>() {
                    tauri::async_runtime::block_on(state.agents.shutdown());
                }
            }
        });
}
