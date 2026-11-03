//! Settings → Terminal → diffity command: links the bundled `diffity-cli` into /usr/local/bin, asking for an
//! administrator password when that folder is not writable. The dev build installs `diffity-dev` instead.

use std::path::{Path, PathBuf};
use std::process::Command;


const BIN_DIR: &str = "/usr/local/bin";

/// `diffity`, or `diffity-dev` for the dev build so it never replaces the release's command.
pub fn command_name() -> &'static str {
    if crate::dev_build() {
        "diffity-dev"
    } else {
        "diffity"
    }
}

fn bundled_cli() -> Result<PathBuf, String> {
    let exe = std::env::current_exe().and_then(std::fs::canonicalize).map_err(|e| e.to_string())?;
    let cli = exe.parent().map(|dir| dir.join("diffity-cli")).ok_or("could not locate the app")?;
    if !cli.exists() {
        return Err(format!("{} is missing", cli.display()));
    }
    Ok(cli)
}

/// Only a link to some copy of `diffity-cli` is ours to replace; anything else (e.g. the npm `diffity`) is left alone.
fn check_existing(link: &Path) -> Result<(), String> {
    let Ok(meta) = std::fs::symlink_metadata(link) else {
        return Ok(());
    };
    let ours = meta.file_type().is_symlink()
        && std::fs::read_link(link).is_ok_and(|target| target.file_name().is_some_and(|name| name == "diffity-cli"));
    if ours {
        return Ok(());
    }
    Err(format!("{} already exists and is not Diffity's. Remove it first, then try again.", link.display()))
}

fn link_directly(cli: &Path, link: &Path) -> std::io::Result<()> {
    if let Some(dir) = link.parent() {
        std::fs::create_dir_all(dir)?;
    }
    if std::fs::symlink_metadata(link).is_ok() {
        std::fs::remove_file(link)?;
    }
    std::os::unix::fs::symlink(cli, link)
}

fn applescript_string(value: &str) -> String {
    format!("\"{}\"", value.replace('\\', "\\\\").replace('"', "\\\""))
}

fn link_as_admin(cli: &Path, link: &Path) -> Result<(), String> {
    let dir = link.parent().unwrap_or(Path::new("/usr/local/bin"));
    let script = format!(
        "do shell script \"mkdir -p \" & quoted form of {dir} & \" && ln -sf \" & quoted form of {cli} & \" \" & quoted form of {link} \
         with prompt \"Diffity wants to install the diffity command.\" with administrator privileges",
        dir = applescript_string(&dir.to_string_lossy()),
        cli = applescript_string(&cli.to_string_lossy()),
        link = applescript_string(&link.to_string_lossy()),
    );
    let out = Command::new("osascript").args(["-e", &script]).output().map_err(|e| e.to_string())?;
    if out.status.success() {
        return Ok(());
    }
    let stderr = String::from_utf8_lossy(&out.stderr);
    if stderr.contains("-128") {
        return Err("Cancelled.".into());
    }
    Err(stderr.trim().to_string())
}

/// The first command of this name on PATH when it is not the one just installed, e.g. the npm package.
fn shadowing(link: &Path) -> Option<PathBuf> {
    let path = std::env::var_os("PATH")?;
    let first = std::env::split_paths(&path).map(|dir| dir.join(command_name())).find(|p| p.exists())?;
    (first != link).then_some(first)
}

pub fn install() -> Result<String, String> {
    let cli = bundled_cli()?;
    let name = command_name();
    let link_path = Path::new(BIN_DIR).join(name);
    let link = link_path.as_path();
    check_existing(link)?;
    if let Err(e) = link_directly(&cli, link) {
        if e.kind() != std::io::ErrorKind::PermissionDenied {
            return Err(e.to_string());
        }
        link_as_admin(&cli, link)?;
    }
    let mut message = format!(
        "Run `{name}` in a repository to open it in Diffity. `{name} --help` lists the options.\n\nInstalled at {}.",
        link.display()
    );
    if let Some(other) = shadowing(link) {
        message.push_str(&format!(
            "\n\n{} comes first in your PATH, so `{name}` runs that one. Remove it or put {BIN_DIR} before it.",
            other.display()
        ));
    }
    Ok(message)
}

/// Where the command is linked, and whether that link is Diffity's and still points at an existing app.
pub struct CliStatus {
    pub name: &'static str,
    pub path: PathBuf,
    pub installed: bool,
    pub broken: bool,
}

pub fn status() -> CliStatus {
    let path = Path::new(BIN_DIR).join(command_name());
    let ours = std::fs::read_link(&path).ok().filter(|target| target.file_name().is_some_and(|name| name == "diffity-cli"));
    CliStatus { name: command_name(), installed: ours.is_some(), broken: ours.is_some_and(|target| !target.exists()), path }
}

/// Removes the command when it is Diffity's link, asking for an administrator password when needed.
pub fn uninstall() -> Result<(), String> {
    let link = Path::new(BIN_DIR).join(command_name());
    if !status().installed {
        return Ok(());
    }
    match std::fs::remove_file(&link) {
        Ok(()) => Ok(()),
        Err(e) if e.kind() == std::io::ErrorKind::PermissionDenied => {
            let script = format!(
                "do shell script \"rm -f \" & quoted form of {link} with prompt \"Diffity wants to remove the {name} command.\" with administrator privileges",
                link = applescript_string(&link.to_string_lossy()),
                name = command_name(),
            );
            let out = Command::new("osascript").args(["-e", &script]).output().map_err(|e| e.to_string())?;
            if out.status.success() {
                return Ok(());
            }
            let stderr = String::from_utf8_lossy(&out.stderr);
            Err(if stderr.contains("-128") { "Cancelled.".into() } else { stderr.trim().to_string() })
        }
        Err(e) => Err(e.to_string()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn escapes_applescript_strings() {
        assert_eq!(applescript_string(r#"/Apps/My "D"\x.app"#), r#""/Apps/My \"D\"\\x.app""#);
    }

    #[test]
    fn leaves_foreign_commands_alone() {
        let dir = tempfile::tempdir().unwrap();
        let link = dir.path().join("diffity");
        assert!(check_existing(&link).is_ok());
        std::fs::write(&link, "#!/bin/sh").unwrap();
        assert!(check_existing(&link).is_err());
        std::fs::remove_file(&link).unwrap();
        std::os::unix::fs::symlink("/Applications/Diffity.app/Contents/MacOS/diffity-cli", &link).unwrap();
        assert!(check_existing(&link).is_ok());
    }
}
