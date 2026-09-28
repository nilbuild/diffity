use serde::Serialize;

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct LaunchTarget {
    pub path: String,
    pub tab: Option<String>,
}

/// Frontend console errors / unhandled rejections, forwarded to the terminal (installed in dev builds).
#[tauri::command]
pub fn log_frontend(level: String, message: String, window: tauri::Window) {
    let label = window.label().to_string();
    match level.as_str() {
        "error" => tracing::error!(target: "webview", "[{label}] {message}"),
        "warn" => tracing::warn!(target: "webview", "[{label}] {message}"),
        _ => tracing::info!(target: "webview", "[{label}] {message}"),
    }
}

/// Dev-only: `DIFFITY_OPEN=<path>` (+ optional `DIFFITY_TAB=changes|files|pr`) opens a repo on launch.
#[tauri::command]
pub fn dev_launch_target() -> Option<LaunchTarget> {
    if !cfg!(debug_assertions) {
        return None;
    }
    let path = std::env::var("DIFFITY_OPEN").ok().filter(|p| !p.trim().is_empty())?;
    let path = std::fs::canonicalize(&path)
        .map(|p| p.to_string_lossy().into_owned())
        .unwrap_or(path);
    let tab = std::env::var("DIFFITY_TAB").ok().filter(|t| !t.trim().is_empty());
    Some(LaunchTarget { path, tab })
}
