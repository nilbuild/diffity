use diffity_core::AppError;

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct RepoSlug {
    pub owner: String,
    pub name: String,
}

impl RepoSlug {
    pub fn matches(&self, other: &RepoSlug) -> bool {
        self.owner.eq_ignore_ascii_case(&other.owner) && self.name.eq_ignore_ascii_case(&other.name)
    }

    pub fn full_name(&self) -> String {
        format!("{}/{}", self.owner, self.name)
    }
}

const GITHUB_HOSTS: [&str; 3] = ["github.com", "www.github.com", "ssh.github.com"];

pub fn parse_remote_url(url: &str) -> Option<RepoSlug> {
    let url = url.trim();
    let (host, path) = if let Some((_, rest)) = url.split_once("://") {
        let (authority, path) = rest.split_once('/')?;
        let authority = authority.rsplit_once('@').map(|(_, h)| h).unwrap_or(authority);
        let host = authority.split(':').next().unwrap_or(authority);
        (host.to_string(), path.to_string())
    } else {
        let rest = url.rsplit_once('@').map(|(_, r)| r).unwrap_or(url);
        let (host, path) = rest.split_once(':')?;
        (host.to_string(), path.to_string())
    };
    if !GITHUB_HOSTS.contains(&host.to_ascii_lowercase().as_str()) {
        return None;
    }
    slug_from_path(&path)
}

fn slug_from_path(path: &str) -> Option<RepoSlug> {
    let path = path.trim_matches('/');
    let path = path.strip_suffix(".git").unwrap_or(path);
    let mut parts = path.split('/');
    let owner = parts.next()?;
    let name = parts.next()?;
    if owner.is_empty() || name.is_empty() || parts.next().is_some() {
        return None;
    }
    Some(RepoSlug {
        owner: owner.to_string(),
        name: name.to_string(),
    })
}

pub fn not_github() -> AppError {
    AppError::new("not_github", "origin remote is not a github.com repository")
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct PrRef {
    pub slug: RepoSlug,
    pub number: u64,
}

pub fn parse_pr_url(input: &str) -> Option<PrRef> {
    let input = input.trim();
    let rest = input
        .strip_prefix("https://")
        .or_else(|| input.strip_prefix("http://"))
        .unwrap_or(input);
    let rest = rest
        .strip_prefix("www.github.com/")
        .or_else(|| rest.strip_prefix("github.com/"))?;
    let mut parts = rest.split('/');
    let owner = parts.next()?;
    let name = parts.next()?;
    if parts.next()? != "pull" {
        return None;
    }
    let number_part = parts.next()?;
    let digits: String = number_part.chars().take_while(|c| c.is_ascii_digit()).collect();
    let number = digits.parse().ok()?;
    if owner.is_empty() || name.is_empty() {
        return None;
    }
    Some(PrRef {
        slug: RepoSlug {
            owner: owner.to_string(),
            name: name.strip_suffix(".git").unwrap_or(name).to_string(),
        },
        number,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn slug(o: &str, n: &str) -> Option<RepoSlug> {
        Some(RepoSlug {
            owner: o.into(),
            name: n.into(),
        })
    }

    #[test]
    fn parses_remote_forms() {
        assert_eq!(parse_remote_url("https://github.com/a/b.git"), slug("a", "b"));
        assert_eq!(parse_remote_url("https://github.com/a/b"), slug("a", "b"));
        assert_eq!(parse_remote_url("https://github.com/a/b/"), slug("a", "b"));
        assert_eq!(parse_remote_url("https://user:tok@github.com/a/b.git"), slug("a", "b"));
        assert_eq!(parse_remote_url("git@github.com:a/b.git"), slug("a", "b"));
        assert_eq!(parse_remote_url("ssh://git@github.com/a/b.git"), slug("a", "b"));
        assert_eq!(parse_remote_url("ssh://git@ssh.github.com:443/a/b.git"), slug("a", "b"));
        assert_eq!(parse_remote_url("git://github.com/a/b"), slug("a", "b"));
        assert_eq!(parse_remote_url("git@github.com:a/my.repo.git"), slug("a", "my.repo"));
    }

    #[test]
    fn rejects_non_github() {
        assert_eq!(parse_remote_url("git@gitlab.com:a/b.git"), None);
        assert_eq!(parse_remote_url("https://example.com/a/b"), None);
        assert_eq!(parse_remote_url("https://github.com/a"), None);
        assert_eq!(parse_remote_url("/local/path/repo"), None);
        assert_eq!(parse_remote_url(""), None);
    }

    #[test]
    fn parses_pr_urls() {
        let pr = parse_pr_url("https://github.com/o/r/pull/42").unwrap();
        assert_eq!(pr.number, 42);
        assert_eq!(pr.slug.full_name(), "o/r");
        assert_eq!(parse_pr_url("github.com/o/r/pull/7/files").unwrap().number, 7);
        assert_eq!(parse_pr_url("https://github.com/o/r/pull/9#discussion_r1").unwrap().number, 9);
        assert!(parse_pr_url("https://github.com/o/r/issues/9").is_none());
        assert!(parse_pr_url("42").is_none());
    }
}
