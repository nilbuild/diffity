use diffity_core::types::Side;

#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct Hunk {
    pub old_start: u32,
    pub old_count: u32,
    pub new_start: u32,
    pub new_count: u32,
    /// (old line number, new line number, text without the +/-/space prefix)
    pub lines: Vec<(Option<u32>, Option<u32>, String)>,
}

#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct FilePatch {
    pub old_path: Option<String>,
    pub new_path: Option<String>,
    pub hunks: Vec<Hunk>,
}

fn strip_path(raw: &str, prefix: &str) -> Option<String> {
    let raw = raw.trim_end_matches('\t').trim();
    if raw == "/dev/null" {
        return None;
    }
    let unquoted = raw
        .strip_prefix('"')
        .and_then(|s| s.strip_suffix('"'))
        .unwrap_or(raw);
    Some(
        unquoted
            .strip_prefix(prefix)
            .unwrap_or(unquoted)
            .to_string(),
    )
}

fn parse_range(s: &str) -> (u32, u32) {
    let mut it = s.splitn(2, ',');
    let start = it.next().and_then(|v| v.parse().ok()).unwrap_or(0);
    let count = it.next().map(|v| v.parse().unwrap_or(0)).unwrap_or(1);
    (start, count)
}

fn parse_hunk_header(line: &str) -> Option<Hunk> {
    let rest = line.strip_prefix("@@ -")?;
    let end = rest.find(" @@")?;
    let mut parts = rest[..end].split(" +");
    let (old_start, old_count) = parse_range(parts.next()?);
    let (new_start, new_count) = parse_range(parts.next()?);
    Some(Hunk {
        old_start,
        old_count,
        new_start,
        new_count,
        lines: vec![],
    })
}

pub fn parse(patch: &str) -> Vec<FilePatch> {
    let mut files: Vec<FilePatch> = Vec::new();
    let mut old_no = 0u32;
    let mut new_no = 0u32;
    let mut in_hunk = false;
    for line in patch.lines() {
        if line.starts_with("diff --git ") {
            files.push(FilePatch::default());
            in_hunk = false;
            continue;
        }
        if !in_hunk {
            if let Some(rest) = line.strip_prefix("--- ") {
                if files.is_empty() {
                    files.push(FilePatch::default());
                }
                if let Some(f) = files.last_mut() {
                    f.old_path = strip_path(rest, "a/");
                }
                continue;
            }
            if let Some(rest) = line.strip_prefix("+++ ") {
                if let Some(f) = files.last_mut() {
                    f.new_path = strip_path(rest, "b/");
                }
                continue;
            }
        }
        if line.starts_with("@@ ") {
            let Some(hunk) = parse_hunk_header(line) else {
                continue;
            };
            old_no = hunk.old_start;
            new_no = hunk.new_start;
            if let Some(f) = files.last_mut() {
                f.hunks.push(hunk);
                in_hunk = true;
            }
            continue;
        }
        if !in_hunk {
            continue;
        }
        let Some(hunk) = files.last_mut().and_then(|f| f.hunks.last_mut()) else {
            continue;
        };
        match line.as_bytes().first() {
            Some(b'+') => {
                hunk.lines.push((None, Some(new_no), line[1..].to_string()));
                new_no += 1;
            }
            Some(b'-') => {
                hunk.lines.push((Some(old_no), None, line[1..].to_string()));
                old_no += 1;
            }
            Some(b' ') => {
                hunk.lines
                    .push((Some(old_no), Some(new_no), line[1..].to_string()));
                old_no += 1;
                new_no += 1;
            }
            Some(b'\\') => {}
            _ => in_hunk = false,
        }
    }
    files
}

impl FilePatch {
    pub fn matches(&self, path: &str) -> bool {
        self.new_path.as_deref() == Some(path) || self.old_path.as_deref() == Some(path)
    }

    fn hunk_range(h: &Hunk, side: Side) -> (u32, u32) {
        match side {
            Side::Old => (h.old_start, h.old_start + h.old_count),
            Side::New => (h.new_start, h.new_start + h.new_count),
        }
    }

    /// Returns the text of lines `start..=end` on `side` when the whole range lies inside a single hunk.
    pub fn anchor(&self, side: Side, start: u32, end: u32) -> Option<String> {
        let hunk = self.hunks.iter().find(|h| {
            let (lo, hi) = Self::hunk_range(h, side);
            start >= lo && end < hi
        })?;
        let texts: Vec<&str> = hunk
            .lines
            .iter()
            .filter_map(|(o, n, text)| {
                let no = match side {
                    Side::Old => *o,
                    Side::New => *n,
                }?;
                (no >= start && no <= end).then_some(text.as_str())
            })
            .collect();
        Some(texts.join("\n"))
    }

    pub fn ranges(&self, side: Side) -> Vec<(u32, u32)> {
        self.hunks
            .iter()
            .map(|h| Self::hunk_range(h, side))
            .filter(|(lo, hi)| hi > lo)
            .map(|(lo, hi)| (lo, hi - 1))
            .collect()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const PATCH: &str = "diff --git a/src/a.rs b/src/a.rs
index 111..222 100644
--- a/src/a.rs
+++ b/src/a.rs
@@ -1,4 +1,5 @@
 fn main() {
-    old();
+    new();
+    more();
     done();
 }
diff --git a/new.txt b/new.txt
new file mode 100644
--- /dev/null
+++ b/new.txt
@@ -0,0 +1,2 @@
+hello
+world
diff --git a/gone.txt b/gone.txt
deleted file mode 100644
--- a/gone.txt
+++ /dev/null
@@ -1 +0,0 @@
-bye
";

    #[test]
    fn parses_files_and_hunks() {
        let files = parse(PATCH);
        assert_eq!(files.len(), 3);
        assert_eq!(files[0].new_path.as_deref(), Some("src/a.rs"));
        assert_eq!(files[1].old_path, None);
        assert_eq!(files[2].new_path, None);
        assert!(files[2].matches("gone.txt"));
        assert_eq!(files[0].ranges(Side::New), vec![(1, 5)]);
        assert_eq!(files[0].ranges(Side::Old), vec![(1, 4)]);
        assert_eq!(files[1].ranges(Side::Old), vec![]);
        assert_eq!(files[2].ranges(Side::Old), vec![(1, 1)]);
    }

    #[test]
    fn anchors_by_side() {
        let files = parse(PATCH);
        assert_eq!(
            files[0].anchor(Side::New, 2, 3).as_deref(),
            Some("    new();\n    more();")
        );
        assert_eq!(
            files[0].anchor(Side::Old, 2, 2).as_deref(),
            Some("    old();")
        );
        assert_eq!(files[0].anchor(Side::New, 5, 6), None);
        assert_eq!(
            files[1].anchor(Side::New, 1, 2).as_deref(),
            Some("hello\nworld")
        );
        assert_eq!(files[1].anchor(Side::Old, 1, 1), None);
    }
}
