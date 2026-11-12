//! `diffity`: opens a repository, a diff or a file in the Diffity app through a `diffity://open` link.
//! It ships inside the app bundle (Contents/MacOS/diffity-cli, or /usr/bin/diffity-cli on Linux);
//! Settings → Terminal links it into PATH as `diffity`.

use std::path::{Path, PathBuf};
use std::process::{Command, ExitCode};

const HELP: &str = "\
Open a repository, a diff or a file in Diffity.

Usage:
  diffity [path | pull request URL] [options]

Arguments:
  path              A folder or file inside a Git repository (default: current folder).
                    A file opens in the Files tab unless --ref is given.
  pull request URL  A GitHub pull request to check out and review, in the current
                    repository or the local clone Diffity knows about.

Options:
  -r, --ref <ref>   The diff to show: work (uncommitted, the default), staged, unstaged,
                    <ref> (everything since HEAD left it, uncommitted included),
                    <a>..<b> or <a>...<b> (commits only)
  -n, --new-window  Open in a new window
  -h, --help        Show this help

Examples:
  diffity                       Uncommitted changes in the current repository
  diffity ~/code/app            Uncommitted changes in ~/code/app
  diffity --ref main            Everything on this branch since it left main
  diffity --ref HEAD~1..HEAD    The last commit
  diffity https://github.com/owner/repo/pull/42
                                Pull request #42
  diffity src/app.ts            src/app.ts in the Files tab
";

#[derive(Default)]
struct Options {
    path: Option<String>,
    git_ref: Option<String>,
    pr: Option<String>,
    new_window: bool,
}

enum Action {
    Help,
    Open(Options),
}

fn parse(args: &[String]) -> Result<Action, String> {
    let mut options = Options::default();
    let mut it = args.iter();
    while let Some(arg) = it.next() {
        let mut value = |name: &str| {
            it.next()
                .cloned()
                .filter(|v| !v.is_empty())
                .ok_or_else(|| format!("{name} needs a value"))
        };
        match arg.as_str() {
            "-h" | "--help" => return Ok(Action::Help),
            "-r" | "--ref" => options.git_ref = Some(value("--ref")?),
            "-n" | "--new-window" => options.new_window = true,
            flag if flag.starts_with('-') => return Err(format!("unknown option {flag}")),
            target => {
                if options.path.is_some() || options.pr.is_some() {
                    return Err(format!("unexpected argument {target}"));
                }
                if let Some(url) = pr_url(target) {
                    options.pr = Some(url);
                } else {
                    options.path = Some(target.to_string());
                }
            }
        }
    }
    if options.git_ref.is_some() && options.pr.is_some() {
        return Err("--ref does not apply to a pull request".into());
    }
    Ok(Action::Open(options))
}

/// `https://github.com/<owner>/<repo>/pull/<number>` from a PR link, with or without the scheme or a
/// trailing `/files` etc.
fn pr_url(value: &str) -> Option<String> {
    let rest = value
        .trim_start_matches("https://")
        .trim_start_matches("http://")
        .trim_start_matches("www.");
    let parts: Vec<&str> = rest.strip_prefix("github.com/")?.split('/').collect();
    let [owner, repo, "pull", number, ..] = parts.as_slice() else {
        return None;
    };
    let valid = !owner.is_empty()
        && !repo.is_empty()
        && !number.is_empty()
        && number.chars().all(|c| c.is_ascii_digit());
    valid.then(|| format!("https://github.com/{owner}/{repo}/pull/{number}"))
}

fn repo_root(dir: &Path) -> Result<PathBuf, String> {
    let out = Command::new("git")
        .arg("-C")
        .arg(dir)
        .args(["rev-parse", "--show-toplevel"])
        .output()
        .map_err(|e| format!("could not run git: {e}"))?;
    if !out.status.success() {
        return Err(format!("{} is not inside a Git repository", dir.display()));
    }
    Ok(PathBuf::from(String::from_utf8_lossy(&out.stdout).trim()))
}

fn encode(value: &str) -> String {
    let mut out = String::with_capacity(value.len());
    for byte in value.bytes() {
        if byte.is_ascii_alphanumeric() || b"-._~/".contains(&byte) {
            out.push(byte as char);
        } else {
            out.push_str(&format!("%{byte:02X}"));
        }
    }
    out
}

fn link(params: &[(&str, String)]) -> String {
    let query: Vec<String> = params
        .iter()
        .map(|(key, value)| format!("{key}={}", encode(value)))
        .collect();
    format!("{}://open?{}", scheme(), query.join("&"))
}

/// The dev build ships a CLI that talks to "Diffity Dev" over its own scheme.
fn scheme() -> &'static str {
    if option_env!("DIFFITY_CHANNEL") == Some("dev") {
        "diffity-dev"
    } else {
        "diffity"
    }
}

/// The app checks out the PR in the current repository when its remote matches, else in a clone it knows.
fn pr_link(pr: String, new_window: bool) -> String {
    let mut params = Vec::new();
    let root = std::env::current_dir().ok().and_then(|dir| repo_root(&dir).ok());
    if let Some(root) = root {
        params.push(("path", root.to_string_lossy().into_owned()));
    }
    params.push(("pr", pr));
    if new_window {
        params.push(("window", "new".into()));
    }
    link(&params)
}

fn open_link(options: Options) -> Result<String, String> {
    if let Some(pr) = options.pr {
        return Ok(pr_link(pr, options.new_window));
    }
    let given = options.path.unwrap_or_else(|| ".".into());
    let target = std::fs::canonicalize(&given).map_err(|e| format!("{given}: {e}"))?;
    let dir = if target.is_dir() {
        target.clone()
    } else {
        target.parent().map(Path::to_path_buf).unwrap_or_default()
    };
    let root = repo_root(&dir)?;
    let root = std::fs::canonicalize(&root).unwrap_or(root);
    let file = if target.is_file() {
        target
            .strip_prefix(&root)
            .ok()
            .map(|p| p.to_string_lossy().into_owned())
    } else {
        None
    };

    let mut params = vec![("path", root.to_string_lossy().into_owned())];
    if let Some(git_ref) = options.git_ref {
        params.push(("ref", git_ref));
        if let Some(file) = file {
            params.push(("file", file));
        }
    } else if let Some(file) = file {
        params.push(("view", "files".into()));
        params.push(("file", file));
    }
    if options.new_window {
        params.push(("window", "new".into()));
    }
    Ok(link(&params))
}

/// The real binary, with any `/usr/local/bin/diffity` symlink resolved.
fn own_path() -> Option<PathBuf> {
    std::env::current_exe().ok().and_then(|p| std::fs::canonicalize(p).ok())
}

/// The `.app` this binary ships in, so the link opens that copy of Diffity rather than whichever
/// one macOS has registered for `diffity://`.
#[cfg(target_os = "macos")]
fn own_bundle() -> Option<PathBuf> {
    own_path()?
        .ancestors()
        .find(|p| p.extension().is_some_and(|ext| ext == "app"))
        .map(Path::to_path_buf)
}

/// Runs the app installed next to this binary with the link: a running Diffity gets it from that second copy
/// (single-instance), so this install's app opens it rather than whichever one is registered for the scheme.
#[cfg(not(target_os = "macos"))]
fn launch(url: &str) -> Result<(), String> {
    use std::os::unix::process::CommandExt;
    use std::process::Stdio;

    let app = own_path().and_then(|p| p.parent().map(|dir| dir.join("diffity-desktop"))).filter(|p| p.exists());
    let Some(app) = app else {
        let status = Command::new("xdg-open").arg(url).status().map_err(|e| format!("could not run xdg-open: {e}"))?;
        if !status.success() {
            return Err("could not open Diffity. Is it installed?".into());
        }
        return Ok(());
    };
    Command::new(&app)
        .arg(url)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .process_group(0)
        .spawn()
        .map_err(|e| format!("could not start {}: {e}", app.display()))?;
    Ok(())
}

#[cfg(target_os = "macos")]
fn launch(url: &str) -> Result<(), String> {
    let mut command = Command::new("open");
    if let Some(bundle) = own_bundle() {
        command.arg("-a").arg(bundle);
    }
    let status = command
        .arg(url)
        .status()
        .map_err(|e| format!("could not run open: {e}"))?;
    if !status.success() {
        return Err("could not open Diffity. Is it installed?".into());
    }
    Ok(())
}

fn main() -> ExitCode {
    let args: Vec<String> = std::env::args().skip(1).collect();
    let result = match parse(&args) {
        Ok(Action::Help) => {
            print!("{HELP}");
            Ok(())
        }
        Ok(Action::Open(options)) => open_link(options).and_then(|url| launch(&url)),
        Err(message) => Err(format!("{message}\n\nRun `diffity --help` for usage.")),
    };
    match result {
        Ok(()) => ExitCode::SUCCESS,
        Err(message) => {
            eprintln!("diffity: {message}");
            ExitCode::FAILURE
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn args(list: &[&str]) -> Vec<String> {
        list.iter().map(|s| s.to_string()).collect()
    }

    #[test]
    fn encodes_query_values() {
        assert_eq!(
            link(&[("path", "/Users/me/my repo".into()), ("ref", "main...HEAD".into())]),
            "diffity://open?path=/Users/me/my%20repo&ref=main...HEAD"
        );
        assert_eq!(encode("a&b=c#d?é"), "a%26b%3Dc%23d%3F%C3%A9");
    }

    #[test]
    fn parses_options() {
        let Ok(Action::Open(options)) = parse(&args(&["~/code", "-r", "HEAD~1", "-n"])) else {
            panic!("expected open");
        };
        assert_eq!(options.path.as_deref(), Some("~/code"));
        assert_eq!(options.git_ref.as_deref(), Some("HEAD~1"));
        assert!(options.new_window);
    }

    #[test]
    fn rejects_bad_input() {
        assert!(parse(&args(&["--ref"])).is_err());
        assert!(parse(&args(&["--bogus"])).is_err());
        assert!(parse(&args(&["a", "b"])).is_err());
    }

    #[test]
    fn detects_pull_request_urls() {
        let Ok(Action::Open(options)) = parse(&args(&["https://github.com/o/r/pull/42"])) else {
            panic!("expected open");
        };
        assert_eq!(options.pr.as_deref(), Some("https://github.com/o/r/pull/42"));
        assert_eq!(options.path, None);
        assert_eq!(pr_url("github.com/o/r/pull/7/files").as_deref(), Some("https://github.com/o/r/pull/7"));
        assert_eq!(pr_url("https://github.com/o/r"), None);
        assert_eq!(pr_url("https://github.com/o/r/pull/abc"), None);
        assert_eq!(pr_url("pull/42"), None);
        assert!(parse(&args(&["https://github.com/o/r/pull/1", "--ref", "main"])).is_err());
    }
}
