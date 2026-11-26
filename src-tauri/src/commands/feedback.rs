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
    feedback_url("bug", "", version, macos, arch)
}

/// A new-issue link on the matching template: an idea fills `feature_request.yml`'s proposal, a bug fills
/// `bug_report.yml`'s "what happened" plus the version fields.
fn feedback_url(kind: &str, text: &str, version: &str, macos: &str, arch: &str) -> String {
    let text = text.trim();
    let params: Vec<(&str, &str)> = if kind == "idea" {
        vec![("template", "feature_request.yml"), ("proposal", text)]
    } else {
        vec![
            ("template", "bug_report.yml"),
            ("what-happened", text),
            ("version", version),
            ("macos", macos),
            ("arch", arch),
        ]
    };
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

/// Opens a pre-filled GitHub issue for an idea or a bug written in the app's feedback form.
#[tauri::command]
pub fn send_feedback(app: AppHandle, kind: String, text: String) -> Result<(), AppError> {
    let version = app.package_info().version.to_string();
    let url = feedback_url(&kind, &text, &version, &os_version(), chip());
    app.opener()
        .open_url(url, None::<&str>)
        .map_err(|e| AppError::new("open_failed", e.to_string()))
}

#[cfg(test)]
mod tests {
    use super::{bug_report_url, feedback_url};

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

    #[test]
    fn prefills_an_idea_and_a_bug() {
        assert_eq!(
            feedback_url("idea", "  Stage with S  ", "0.11.3", "15.5", "Intel"),
            "https://github.com/nilbuild/diffity/issues/new?template=feature_request.yml&proposal=Stage+with+S"
        );
        assert_eq!(
            feedback_url("bug", "Crash & burn", "0.11.3", "15.5", "Intel"),
            "https://github.com/nilbuild/diffity/issues/new?template=bug_report.yml&what-happened=Crash+%26+burn&version=0.11.3&macos=15.5&arch=Intel"
        );
    }
}
