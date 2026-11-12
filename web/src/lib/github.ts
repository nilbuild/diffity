import { LINKS } from './links';

const API = 'https://api.github.com/repos/nilbuild/diffity';

export interface RepoStats {
  version: string | null;
  releaseUrl: string | null;
  stars: number | null;
  downloads: Downloads;
}

/** Direct links to the latest release's installers, or the release page when one is missing. */
export interface Downloads {
  mac: string;
  deb: string;
  rpm: string;
}

interface Release {
  tag_name: string;
  html_url: string;
  assets: { name: string; browser_download_url: string }[];
}

async function getJson<T>(url: string): Promise<T | null> {
  const headers: Record<string, string> = { Accept: 'application/vnd.github+json' };
  const token = process.env.GITHUB_TOKEN;
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  try {
    const response = await fetch(url, { headers });
    if (!response.ok) {
      console.warn(`[github] ${url} answered ${response.status}`);
      return null;
    }
    return (await response.json()) as T;
  } catch (error) {
    console.warn(`[github] ${url} failed`, error);
    return null;
  }
}

function findAsset(release: Release | null, suffix: string) {
  const asset = release?.assets.find((candidate) => candidate.name.endsWith(suffix));
  return asset?.browser_download_url ?? LINKS.download;
}

async function loadRepoStats(): Promise<RepoStats> {
  const [release, repo] = await Promise.all([getJson<Release>(`${API}/releases/latest`), getJson<{ stargazers_count: number }>(API)]);

  return {
    version: release?.tag_name ?? null,
    releaseUrl: release?.html_url ?? null,
    stars: repo?.stargazers_count ?? null,
    downloads: {
      mac: findAsset(release, '.dmg'),
      deb: findAsset(release, '_amd64.deb'),
      rpm: findAsset(release, '.x86_64.rpm'),
    },
  };
}

let stats: Promise<RepoStats> | null = null;

/** Read once per build. Anything GitHub does not answer is left out of the page rather than failing the build. */
export function getRepoStats(): Promise<RepoStats> {
  stats ??= loadRepoStats();
  return stats;
}

export function formatStars(stars: number) {
  if (stars < 1000) {
    return String(stars);
  }
  return `${(stars / 1000).toFixed(1).replace(/\.0$/, '')}k`;
}
