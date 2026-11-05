use std::collections::{BTreeMap, BTreeSet, HashSet};
use std::path::Path;

use crate::core::error::Result;
use crate::core::tree::{self, MAX_TEXT_BYTES};
use crate::core::types::TreeEntryKind;

const MAX_SOURCE_FILES: usize = 5_000;
const CODE_EXTENSIONS: [&str; 6] = ["ts", "tsx", "js", "jsx", "mjs", "cjs"];
/// Where `@/` and `~/` imports point when there is no tsconfig to say otherwise.
const ALIAS_ROOTS: [&str; 2] = ["src/", ""];

/// A file outside the diff and the changed files it imports.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Importer {
    pub path: String,
    pub imports: Vec<String>,
}

fn is_code(path: &str) -> bool {
    path.rsplit_once('.').is_some_and(|(_, ext)| CODE_EXTENSIONS.contains(&ext))
}

/// The module specifiers a source file imports, re-exports or requires, in order of appearance.
pub fn import_specs(source: &str) -> Vec<String> {
    let mut specs = Vec::new();
    for line in source.lines() {
        let line = line.trim_start();
        if line.starts_with("//") || line.starts_with('*') {
            continue;
        }
        if line.starts_with("import") || line.starts_with("export ") || line.starts_with('}') {
            if let Some(spec) = spec_after(line, "from ") {
                specs.push(spec);
                continue;
            }
            if let Some(rest) = line.strip_prefix("import ") {
                if let Some(spec) = quoted(rest.trim_start()) {
                    specs.push(spec);
                    continue;
                }
            }
        }
        for marker in ["require(", "import("] {
            let mut rest = line;
            while let Some(at) = rest.find(marker) {
                rest = &rest[at + marker.len()..];
                if let Some(spec) = quoted(rest.trim_start()) {
                    specs.push(spec);
                }
            }
        }
    }
    specs
}

fn spec_after(line: &str, marker: &str) -> Option<String> {
    let at = line.rfind(marker)?;
    quoted(line[at + marker.len()..].trim_start())
}

fn quoted(text: &str) -> Option<String> {
    let quote = text.chars().next().filter(|c| matches!(c, '\'' | '"' | '`'))?;
    let rest = &text[1..];
    Some(rest[..rest.find(quote)?].to_string())
}

fn normalize(path: &str) -> Option<String> {
    let mut parts: Vec<&str> = Vec::new();
    for part in path.split('/') {
        match part {
            "" | "." => {}
            ".." => {
                parts.pop()?;
            }
            other => parts.push(other),
        }
    }
    Some(parts.join("/"))
}

/// The repo file a relative or `@/` import points at. Package imports resolve to nothing.
fn resolve(files: &HashSet<String>, from: &str, spec: &str) -> Option<String> {
    if spec.starts_with('.') {
        let dir = from.rsplit_once('/').map(|(dir, _)| dir).unwrap_or("");
        return probe(files, &normalize(&format!("{dir}/{spec}"))?);
    }
    let rest = spec.strip_prefix("@/").or_else(|| spec.strip_prefix("~/"))?;
    ALIAS_ROOTS.iter().find_map(|root| probe(files, &format!("{root}{rest}")))
}

fn probe(files: &HashSet<String>, base: &str) -> Option<String> {
    if is_code(base) && files.contains(base) {
        return Some(base.to_string());
    }
    let with_ext = CODE_EXTENSIONS.iter().map(|ext| format!("{base}.{ext}"));
    let as_index = CODE_EXTENSIONS.iter().map(|ext| format!("{base}/index.{ext}"));
    with_ext.chain(as_index).find(|candidate| files.contains(candidate))
}

/// Source files outside `changed` that import a file in it. `changed` should hold deleted and renamed-away paths
/// too: their importers are the ones most likely to break.
pub fn outside_importers(repo: &Path, changed: &[String]) -> Result<Vec<Importer>> {
    let changed: HashSet<&str> = changed.iter().map(String::as_str).filter(|p| is_code(p)).collect();
    if changed.is_empty() {
        return Ok(Vec::new());
    }
    let present: Vec<String> = tree::list_tree(repo)?
        .into_iter()
        .filter(|e| e.kind == TreeEntryKind::File && is_code(&e.path))
        .map(|e| e.path)
        .collect();
    let mut known: HashSet<String> = present.iter().cloned().collect();
    known.extend(changed.iter().map(|p| p.to_string()));

    let mut sources: Vec<&String> = present.iter().filter(|p| !changed.contains(p.as_str())).collect();
    sources.sort();
    let mut found: BTreeMap<String, BTreeSet<String>> = BTreeMap::new();
    for path in sources.into_iter().take(MAX_SOURCE_FILES) {
        let full = repo.join(path);
        if std::fs::metadata(&full).map_or(true, |m| m.len() > MAX_TEXT_BYTES) {
            continue;
        }
        let Ok(source) = std::fs::read_to_string(&full) else { continue };
        for spec in import_specs(&source) {
            if let Some(target) = resolve(&known, path, &spec).filter(|t| changed.contains(t.as_str())) {
                found.entry(path.clone()).or_default().insert(target);
            }
        }
    }
    Ok(found
        .into_iter()
        .map(|(path, imports)| Importer { path, imports: imports.into_iter().collect() })
        .collect())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn write(root: &Path, path: &str, contents: &str) {
        let full = root.join(path);
        std::fs::create_dir_all(full.parent().unwrap()).unwrap();
        std::fs::write(full, contents).unwrap();
    }

    #[test]
    fn finds_import_forms() {
        let source = "import a from './a';\nimport { b } from \"../b\";\nimport './side';\nexport * from './c';\n\
                      const d = require('./d');\nconst e = await import('./e');\nimport type { F } from './f';\n// import x from './nope';\n\
                      import {\n  g,\n  h,\n} from './gh';\n";
        assert_eq!(import_specs(source), vec!["./a", "../b", "./side", "./c", "./d", "./e", "./f", "./gh"]);
    }

    #[test]
    fn lists_files_outside_the_diff_that_import_changed_ones() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();
        write(root, "src/lib/orders.ts", "export const x = 1;\n");
        write(root, "src/lib/index.ts", "export * from './orders';\n");
        write(root, "src/app/api/orders/route.ts", "import { x } from '@/lib/orders';\nimport { y } from 'react';\n");
        write(root, "src/app/page.tsx", "import { x } from '../lib/orders';\n");
        write(root, "src/unrelated.ts", "import { z } from './lib';\n");

        let found = outside_importers(root, &["src/lib/orders.ts".into(), "src/app/page.tsx".into()]).unwrap();
        assert_eq!(
            found,
            vec![
                Importer { path: "src/app/api/orders/route.ts".into(), imports: vec!["src/lib/orders.ts".into()] },
                Importer { path: "src/lib/index.ts".into(), imports: vec!["src/lib/orders.ts".into()] },
            ]
        );
    }

    #[test]
    fn importers_of_a_deleted_file_are_found() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();
        write(root, "src/caller.ts", "import { gone } from './gone';\n");

        let found = outside_importers(root, &["src/gone.ts".into()]).unwrap();
        assert_eq!(found, vec![Importer { path: "src/caller.ts".into(), imports: vec!["src/gone.ts".into()] }]);
    }
}
