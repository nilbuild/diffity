use tauri::{AppHandle, Runtime};
use tauri_plugin_opener::OpenerExt;

use crate::core::error::AppError;

const NEW_ISSUE_URL: &str = "https://github.com/nilbuild/diffity/issues/new";

#[cfg(target_os = "linux")]
fn os_version() -> String {
    let release = std::fs::read_to_string("/etc/os-release").unwrap_or_default();
    let name = release
        .lines()
        .find_map(|line| line.strip_prefix("PRETTY_NAME="))
        .map(|value| value.trim_matches('"').to_string())
        .unwrap_or_default();
    if name.is_empty() {
        return "Linux".into();
    }
    format!("Linux ({name})")
}

#[cfg(not(target_os = "linux"))]
fn os_version() -> String {
    std::process::Command::new("sw_vers")
        .arg("-productVersion")
        .output()
        .ok()
        .filter(|out| out.status.success())
        .map(|out| String::from_utf8_lossy(&out.stdout).trim().to_string())
        .unwrap_or_default()
}

fn chip() -> &'static str {
    match std::env::consts::ARCH {
        "aarch64" if cfg!(target_os = "macos") => "Apple Silicon",
        "x86_64" if cfg!(target_os = "macos") => "Intel",
        other => other,
    }
}

/// A bug-report link with the version fields of `.github/ISSUE_TEMPLATE/bug_report.yml` pre-filled.
fn bug_report_url(version: &str, macos: &str, arch: &str) -> String {
    let params = [
        ("template", "bug_report.yml"),
        ("version", version),
        ("macos", macos),
        ("arch", arch),
    ];
    reqwest::Url::parse_with_params(NEW_ISSUE_URL, params.iter().filter(|(_, value)| !value.is_empty()))
        .map(String::from)
        .unwrap_or_else(|_| NEW_ISSUE_URL.to_string())
}

pub fn open_bug_report<R: Runtime>(app: &AppHandle<R>) -> Result<(), AppError> {
    let version = app.package_info().version.to_string();
    let url = bug_report_url(&version, &os_version(), chip());
    app.opener()
        .open_url(url, None::<&str>)
        .map_err(|e| AppError::new("open_failed", e.to_string()))
}

#[tauri::command]
pub fn report_issue(app: AppHandle) -> Result<(), AppError> {
    open_bug_report(&app)
}

#[cfg(test)]
mod tests {
    use super::bug_report_url;

    #[test]
    fn prefills_the_bug_report_form() {
        assert_eq!(
            bug_report_url("0.2.0", "15.5", "Apple Silicon"),
            "https://github.com/nilbuild/diffity/issues/new?template=bug_report.yml&version=0.2.0&macos=15.5&arch=Apple+Silicon"
        );
    }

    #[test]
    fn skips_unknown_fields() {
        assert_eq!(
            bug_report_url("0.2.0", "", "Intel"),
            "https://github.com/nilbuild/diffity/issues/new?template=bug_report.yml&version=0.2.0&arch=Intel"
        );
    }
}
