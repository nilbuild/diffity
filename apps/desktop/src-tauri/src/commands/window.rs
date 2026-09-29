/// Re-centres the macOS traffic lights. The frontend calls this when the window regains focus or visibility, which
/// covers cases AppKit does not report as window events (Space switches, occlusion, returning from sleep).
#[tauri::command]
pub fn realign_window_chrome(window: tauri::Window) {
    #[cfg(target_os = "macos")]
    crate::traffic_lights::center(&window);
    #[cfg(not(target_os = "macos"))]
    let _ = window;
}
