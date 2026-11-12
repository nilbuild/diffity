// The library is the Tauri app; without the `app` feature it is empty so the `diffity-mcp`
// sidecar (src/bin/diffity-mcp) builds without the app's dependencies.
#![cfg(feature = "app")]

pub mod agents;
#[cfg(any(target_os = "macos", target_os = "linux"))]
mod cli_install;
mod commands;
pub mod core;
mod env_fix;
pub mod github;
mod open_link;
mod state;
#[cfg(target_os = "macos")]
mod traffic_lights;

use std::sync::Arc;

use crate::agents::AgentManager;
use crate::core::store::Store;
use crate::github::GithubService;
#[cfg(target_os = "macos")]
use tauri::menu::{Menu, MenuItem, HELP_SUBMENU_ID};
use tauri::{AppHandle, Emitter, EventTarget, Manager, Runtime};
use tauri_plugin_deep_link::DeepLinkExt;

pub use state::AppState;

/// The "Diffity Dev" test build: built with `DIFFITY_CHANNEL=dev` and tauri.dev.conf.json, installed next to
/// the release with its own data, link scheme and command, and no self-updates.
pub fn dev_build() -> bool {
    option_env!("DIFFITY_CHANNEL") == Some("dev")
}

/// `diffity-mcp` is bundled as a Tauri `externalBin`: Tauri places it next to the main executable
/// (`target/<profile>/` in dev, `Diffity.app/Contents/MacOS/` when bundled).
fn mcp_binary_path() -> std::path::PathBuf {
    let name = if cfg!(windows) { "diffity-mcp.exe" } else { "diffity-mcp" };
    std::env::current_exe()
        .ok()
        .and_then(|p| p.parent().map(|d| d.join(name)))
        .filter(|p| p.exists())
        .or_else(|| crate::agents::detect::find_in_path(name))
        .unwrap_or_else(|| name.into())
}

fn init_state(app: &tauri::App) -> anyhow::Result<AppState> {
    let data_dir = app.path().app_data_dir()?;
    std::fs::create_dir_all(&data_dir)?;
    let store = Arc::new(Store::open(data_dir.join("diffity.db")).map_err(|e| anyhow::anyhow!(e))?);
    if let Err(e) = crate::core::task::fail_interrupted(&store) {
        tracing::warn!("could not reset interrupted tasks: {}", e.message);
    }
    let agents = Arc::new(AgentManager::new(store.clone(), data_dir.clone(), mcp_binary_path()));
    let handle = app.handle().clone();
    agents.on_threads_changed(Arc::new(move |session_id: &str| {
        let _ = handle.emit("threads-changed", serde_json::json!({ "sessionId": session_id }));
    }));
    let github = Arc::new(GithubService::new(store.clone()));
    let bridge_agents = agents.clone();
    tauri::async_runtime::spawn(async move {
        if let Err(e) = bridge_agents.start_bridge().await {
            tracing::warn!("could not start the MCP socket: {}", e.message);
        }
    });
    let worktrees_root = crate::core::task::default_root(dev_build());
    Ok(AppState { store, agents, github, worktrees_root })
}

/// Asks before quitting while agents are working, since quitting stops them. Returns true when it asked:
/// the caller holds the quit and the dialog quits for real on confirm.
fn confirm_stop_agents<R: Runtime>(app: &AppHandle<R>) -> bool {
    use tauri_plugin_dialog::{DialogExt, MessageDialogButtons, MessageDialogKind};

    let working = app.try_state::<AppState>().map(|state| state.agents.working_count()).unwrap_or(0);
    if working == 0 {
        return false;
    }
    let running = if working == 1 { "An agent or setup command is".to_string() } else { format!("{working} agents or setup commands are") };
    let handle = app.clone();
    app.dialog()
        .message(format!("{running} still running. Quitting stops them; their edits so far stay in the folder."))
        .title("Quit Diffity?")
        .kind(MessageDialogKind::Warning)
        .buttons(MessageDialogButtons::OkCancelCustom("Quit".into(), "Cancel".into()))
        .show(move |quit| {
            if quit {
                handle.exit(0);
            }
        });
    true
}

const QUIT_MENU_ID: &str = "quit";
const REPORT_ISSUE_MENU_ID: &str = "report-issue";
const WHATS_NEW_MENU_ID: &str = "whats-new";
const CHECK_UPDATES_MENU_ID: &str = "check-for-updates";
#[cfg(target_os = "macos")]
const INSTALL_CLI_MENU_ID: &str = "install-cli";

/// Tauri's default menu plus Diffity → Check for Updates… and Install 'diffity' Command, and Help → What's New
/// and Report an Issue….
#[cfg(target_os = "macos")]
fn app_menu<R: Runtime>(handle: &AppHandle<R>) -> tauri::Result<Menu<R>> {
    let menu = Menu::default(handle)?;
    if let Some(app_submenu) = menu.items()?.first().and_then(|item| item.as_submenu().cloned()) {
        let mut position = 1;
        if !dev_build() {
            let check = MenuItem::with_id(handle, CHECK_UPDATES_MENU_ID, "Check for Updates…", true, None::<&str>)?;
            app_submenu.insert(&check, position)?;
            position += 1;
        }
        #[cfg(target_os = "macos")]
        {
            let label = format!("Install ‘{}’ Command…", cli_install::command_name());
            let install = MenuItem::with_id(handle, INSTALL_CLI_MENU_ID, label, true, None::<&str>)?;
            app_submenu.insert(&install, position)?;
        }
        // The stock Quit item terminates the app without an event the app can hold, so ⌘Q gets our own item that
        // asks first while agents are working.
        let items = app_submenu.items()?;
        if let Some(index) = items
            .iter()
            .position(|item| item.as_predefined_menuitem().and_then(|p| p.text().ok()).is_some_and(|text| text.starts_with("Quit")))
        {
            app_submenu.remove_at(index)?;
            let name = handle.package_info().name.clone();
            let quit = MenuItem::with_id(handle, QUIT_MENU_ID, format!("Quit {name}"), true, Some("CmdOrCtrl+Q"))?;
            app_submenu.insert(&quit, index)?;
        }
    }
    let whats_new = MenuItem::with_id(handle, WHATS_NEW_MENU_ID, "What’s New in Diffity", true, None::<&str>)?;
    let report = MenuItem::with_id(handle, REPORT_ISSUE_MENU_ID, "Report an Issue…", true, None::<&str>)?;
    if let Some(help) = menu.get(HELP_SUBMENU_ID).and_then(|item| item.as_submenu().cloned()) {
        help.append(&whats_new)?;
        help.append(&report)?;
    }
    Ok(menu)
}

/// Ctrl+Q on Linux, where there is no app menu to carry ⌘Q: asks first while agents are working, like the menu item.
#[tauri::command]
fn quit_app(app: AppHandle) {
    if !confirm_stop_agents(&app) {
        app.exit(0);
    }
}

/// Sends a menu command to the focused window, or the main one when none has focus.
fn emit_to_focused<R: Runtime>(app: &AppHandle<R>, event: &str) {
    let windows = app.webview_windows();
    let label = windows
        .values()
        .find(|window| window.is_focused().unwrap_or(false))
        .map(|window| window.label().to_string())
        .unwrap_or_else(|| "main".to_string());
    if let Err(e) = app.emit_to(EventTarget::webview_window(label), event, ()) {
        tracing::warn!("could not send {event}: {e}");
    }
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

    let builder = tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.unminimize();
                let _ = window.set_focus();
            }
        }))
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_system_fonts::init())
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_notification::init());
    // Linux draws an app menu as a menu bar inside every window; the app's own title bar and palette carry
    // those commands there instead.
    #[cfg(target_os = "macos")]
    let builder = builder.menu(app_menu);
    builder
        .on_menu_event(|app, event| {
            if event.id() == QUIT_MENU_ID {
                if !confirm_stop_agents(app) {
                    app.exit(0);
                }
                return;
            }
            if event.id() == WHATS_NEW_MENU_ID {
                emit_to_focused(app, "open-whats-new");
                return;
            }
            if event.id() == CHECK_UPDATES_MENU_ID {
                emit_to_focused(app, "check-for-updates");
                return;
            }
            #[cfg(target_os = "macos")]
            if event.id() == INSTALL_CLI_MENU_ID {
                emit_to_focused(app, "open-terminal-settings");
                return;
            }
            if event.id() != REPORT_ISSUE_MENU_ID {
                return;
            }
            if let Err(e) = commands::feedback::open_bug_report(app) {
                tracing::warn!("could not open the issue form: {}", e.message);
            }
        })
        .setup(|app| {
            let state = init_state(app)?;
            app.manage(state);
            app.manage(open_link::PendingOpens::default());
            let handle = app.handle().clone();
            app.deep_link().on_open_url(move |event| open_link::handle_urls(&handle, event.urls()));
            // The link that launched the app can arrive before the listener above exists.
            if let Ok(Some(urls)) = app.deep_link().get_current() {
                open_link::handle_urls(app.handle(), urls);
            }
            // The window draws its own title bar and window buttons, as on macOS (tauri.linux.conf.json turns the
            // decorations off too; the dev build's window config doesn't).
            #[cfg(target_os = "linux")]
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.set_decorations(false);
            }
            #[cfg(target_os = "macos")]
            if let Some(window) = app.get_webview_window("main") {
                traffic_lights::install(&window.as_ref().window());
            }
            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                let app = window.app_handle();
                if app.webview_windows().len() == 1 && confirm_stop_agents(app) {
                    api.prevent_close();
                }
            }
            #[cfg(target_os = "macos")]
            match event {
                tauri::WindowEvent::ThemeChanged(_) => traffic_lights::install(window),
                tauri::WindowEvent::Destroyed => traffic_lights::uninstall(window),
                _ => {}
            }
            #[cfg(not(target_os = "macos"))]
            let _ = (window, event);
        })
        // Covers `repo-*` windows opened from the frontend via `new WebviewWindow`.
        .on_page_load(|webview, _payload| {
            #[cfg(target_os = "macos")]
            traffic_lights::install(&webview.window());
            #[cfg(not(target_os = "macos"))]
            let _ = webview;
        })
        .invoke_handler(tauri::generate_handler![
            quit_app,
            commands::terminal::terminal_status,
            commands::terminal::terminal_set_allowed,
            commands::terminal::terminal_connect,
            commands::terminal::terminal_disconnect,
            commands::terminal::terminal_install_cli,
            commands::terminal::terminal_uninstall_cli,
            commands::repo::open_repo,
            commands::repo::quick_open_roots,
            commands::repo::list_dir_suggestions,
            commands::repo::resolve_repo_root,
            commands::repo::clone_repo,
            commands::repo::recent_repos,
            commands::repo::project_data,
            commands::repo::clear_project_data,
            commands::repo::reset_all_data,
            commands::repo::repo_remote_urls,
            commands::repo::watch_repo,
            commands::repo::unwatch_repo,
            commands::repo::list_commits,
            commands::repo::list_branch_commits,
            commands::repo::list_branches,
            commands::repo::list_worktrees,
            commands::tasks::list_tasks,
            commands::tasks::main_checkout,
            commands::tasks::create_task,
            commands::tasks::set_task_state,
            commands::tasks::rename_task,
            commands::tasks::finish_task_run,
            commands::tasks::archive_task,
            commands::tasks::notify_task,
            commands::tasks::set_task_badge,
            commands::tasks::mark_task_reviewed,
            commands::tasks::task_config,
            commands::tasks::run_task_setup,
            commands::tasks::task_base_status,
            commands::tasks::update_task_from_base,
            commands::tasks::ship_task_pr,
            commands::tasks::merge_task_locally,
            commands::tasks::restore_task,
            commands::tasks::list_archived_tasks,
            commands::tasks::task_storage,
            commands::tasks::refresh_task_prs,
            commands::tasks::adopt_worktree,
            commands::repo::git_status,
            commands::repo::repo_overview,
            commands::repo::open_in_editor,
            commands::repo::get_setting,
            commands::repo::set_setting,
            commands::diff::resolve_ref,
            commands::diff::get_diff,
            commands::diff::get_file_patch,
            commands::diff::get_file_versions,
            commands::diff::diff_fingerprint,
            commands::diff::revert_file,
            commands::diff::revert_hunk,
            commands::diff::apply_suggestion,
            commands::diff::get_diff_ignore_rules,
            commands::diff::set_diff_ignore_rules,
            commands::files::list_tree,
            commands::files::read_file,
            commands::files::read_file_base64,
            commands::files::search_code,
            commands::comments::get_session,
            commands::comments::list_threads,
            commands::comments::list_repo_threads,
            commands::comments::create_thread,
            commands::comments::add_reply,
            commands::comments::edit_comment,
            commands::comments::delete_comment,
            commands::comments::delete_thread,
            commands::comments::restore_thread,
            commands::comments::keep_thread_on_branch,
            commands::comments::delete_all_threads,
            commands::comments::set_thread_status,
            commands::comments::list_viewed,
            commands::comments::get_guide,
            commands::comments::delete_guide,
            commands::comments::set_viewed,
            commands::comments::viewed_changes,
            commands::comments::get_pending_review,
            commands::comments::start_review,
            commands::comments::get_review,
            commands::comments::list_reviews,
            commands::comments::submit_review,
            commands::comments::discard_review,
            commands::dev::log_frontend,
            commands::dev::dev_launch_target,
            open_link::take_open_requests,
            commands::feedback::report_issue,
            commands::agents::list_agents,
            commands::agents::agent_models,
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
            commands::github::git_commit_all,
            commands::github::github_post_comment,
            commands::github::find_pr,
            commands::github::list_prs,
            commands::github::github_pr_inbox,
            commands::github::checkout_pr,
            commands::github::update_pr_branch,
            commands::github::git_stash_push,
            commands::github::git_stash_restore,
            commands::github::git_checkout,
            commands::github::git_clone,
            commands::github::push_review,
            commands::github::pull_review,
            commands::github::github_pushable_threads,
            commands::github::github_review_candidates,
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
