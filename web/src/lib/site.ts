import { LINKS } from './links';

export const SITE = {
  name: 'Diffity',
  title: 'Diffity: code review on Mac and Linux, with Claude Code and Codex',
  description:
    "Free, open source app for Mac and Linux to review code changes, yours or your agent's, like a pull request. Comment on any line and let Claude Code or Codex fix it.",
  twitter: '@nilbuild',
  themeColor: '#ffffff',
  ogImage: { path: '/og.png', width: 1200, height: 630, alt: 'Diffity: review your code like a pull request, let your agent fix what you find' },
};

/** schema.org data so search engines can show Diffity as a free macOS and Linux app. */
export function softwareJsonLd(siteUrl: URL) {
  return {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: SITE.name,
    description: SITE.description,
    url: siteUrl.href,
    image: new URL(SITE.ogImage.path, siteUrl).href,
    applicationCategory: 'DeveloperApplication',
    operatingSystem: 'macOS 13.3 or later, Linux',
    downloadUrl: LINKS.download,
    license: LINKS.license,
    offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
    author: { '@type': 'Person', name: 'Kamran Ahmed' },
  };
}
