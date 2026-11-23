//! Finds the logo a project ships (its app icon, favicon or logo file) to show it on the rail.

use std::path::{Path, PathBuf};

use base64::Engine;

/// Best first: square app icons, then favicons, then logos (often wide wordmarks), then `.ico` files.
const CANDIDATES: &[&str] = &[
    "src-tauri/icons/128x128@2x.png",
    "src-tauri/icons/icon.png",
    "src-tauri/icons/128x128.png",
    "build/icon.png",
    "app/icon.svg",
    "src/app/icon.svg",
    "app/icon.png",
    "src/app/icon.png",
    "app/apple-icon.png",
    "src/app/apple-icon.png",
    "public/favicon.svg",
    "static/favicon.svg",
    "public/icon.svg",
    "public/apple-touch-icon.png",
    "public/icon.png",
    "public/logo192.png",
    "public/favicon.png",
    "static/favicon.png",
    "favicon.svg",
    "favicon.png",
    "static/img/logo.svg",
    "icon.svg",
    "icon.png",
    "assets/icon.svg",
    "assets/icon.png",
    "resources/icon.png",
    "public/logo.svg",
    "logo.svg",
    ".github/logo.svg",
    "assets/logo.svg",
    "public/logo.png",
    "logo.png",
    ".github/logo.png",
    "assets/logo.png",
    "public/favicon.ico",
    "static/favicon.ico",
    "app/favicon.ico",
    "src/app/favicon.ico",
    "favicon.ico",
];

/// Folders a project's site or front end often lives in, checked after the project root.
const SITES: &[&str] = &["docs", "site", "website", "web", "www", "frontend", "client"];
/// Workspace folders whose packages are checked last.
const WORKSPACES: &[&str] = &["apps", "packages"];
const MAX_PACKAGES: usize = 8;
const MAX_BYTES: u64 = 256 * 1024;

/// The project's logo as a `data:` URL, or `None` when it has none we recognise.
pub fn find(root: &Path) -> Option<String> {
    let mut bases = vec![root.to_path_buf()];
    bases.extend(SITES.iter().map(|site| root.join(site)).filter(|path| path.is_dir()));
    for workspace in WORKSPACES {
        let Ok(entries) = std::fs::read_dir(root.join(workspace)) else {
            continue;
        };
        let mut packages: Vec<PathBuf> = entries.filter_map(|entry| entry.ok()).map(|entry| entry.path()).filter(|path| path.is_dir()).collect();
        packages.sort();
        bases.extend(packages.into_iter().take(MAX_PACKAGES));
    }
    bases.iter().find_map(|base| CANDIDATES.iter().find_map(|candidate| data_url(&base.join(candidate))))
}

fn data_url(file: &Path) -> Option<String> {
    let mime = match file.extension()?.to_str()?.to_ascii_lowercase().as_str() {
        "svg" => "image/svg+xml",
        "png" => "image/png",
        "ico" => "image/x-icon",
        _ => return None,
    };
    let meta = std::fs::metadata(file).ok()?;
    if !meta.is_file() || meta.len() == 0 || meta.len() > MAX_BYTES {
        return None;
    }
    let data = std::fs::read(file).ok()?;
    Some(format!("data:{mime};base64,{}", base64::engine::general_purpose::STANDARD.encode(data)))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn prefers_app_icons_and_looks_in_workspace_packages() {
        let dir = tempfile::tempdir().unwrap();
        assert_eq!(find(dir.path()), None);

        std::fs::create_dir_all(dir.path().join("apps/web/public")).unwrap();
        std::fs::write(dir.path().join("apps/web/public/favicon.svg"), "<svg/>").unwrap();
        assert!(find(dir.path()).unwrap().starts_with("data:image/svg+xml;base64,"));

        std::fs::create_dir_all(dir.path().join("docs")).unwrap();
        std::fs::write(dir.path().join("docs/favicon.ico"), [0, 0, 1, 0]).unwrap();
        assert!(find(dir.path()).unwrap().starts_with("data:image/x-icon;base64,"));

        std::fs::write(dir.path().join("logo.png"), [1, 2, 3]).unwrap();
        assert!(find(dir.path()).unwrap().starts_with("data:image/png;base64,"));

        std::fs::create_dir_all(dir.path().join("public")).unwrap();
        std::fs::write(dir.path().join("public/favicon.svg"), "<svg/>").unwrap();
        assert!(find(dir.path()).unwrap().starts_with("data:image/svg+xml;base64,"));
    }
}
