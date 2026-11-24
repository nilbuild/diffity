import { PROJECT_COLORS, type ProjectColor } from '../welcome/project-colors';
import type { ProjectGroup } from './groups';

/** Words in a group's name that suggest its emoji. Short words must match a whole word, longer ones its start. */
const HINTS: [string, string[]][] = [
  ['🛒', ['shop', 'store', 'cart', 'commerce', 'market', 'checkout']],
  ['💳', ['pay', 'payment', 'billing', 'invoice', 'stripe', 'checkout']],
  ['🏦', ['bank', 'finance', 'ledger', 'account']],
  ['📦', ['package', 'pkg', 'lib', 'sdk', 'monorepo', 'shared', 'common']],
  ['🚚', ['ship', 'delivery', 'logistic', 'order']],
  ['🏠', ['home', 'house', 'real', 'estate', 'rent']],
  ['🍕', ['food', 'recipe', 'restaurant', 'menu']],
  ['✈️', ['travel', 'trip', 'flight', 'booking']],
  ['🌐', ['web', 'site', 'www', 'frontend', 'landing']],
  ['📱', ['mobile', 'ios', 'android', 'native']],
  ['🖥️', ['desktop', 'electron', 'tauri', 'mac']],
  ['⚙️', ['api', 'server', 'backend', 'service', 'core']],
  ['🛠️', ['tool', 'cli', 'util', 'script', 'devtool']],
  ['🧩', ['plugin', 'extension', 'addon', 'widget']],
  ['☁️', ['cloud', 'infra', 'deploy', 'ops', 'k8s', 'terraform']],
  ['🤖', ['ai', 'ml', 'bot', 'agent', 'llm', 'gpt', 'claude']],
  ['📊', ['data', 'analytic', 'metric', 'dashboard', 'report', 'stats']],
  ['🗄️', ['db', 'database', 'sql', 'storage']],
  ['🔒', ['auth', 'security', 'login', 'identity']],
  ['🧪', ['test', 'qa', 'lab', 'experiment']],
  ['📚', ['doc', 'docs', 'wiki', 'guide', 'handbook']],
  ['📝', ['blog', 'note', 'writing', 'cms', 'content']],
  ['✉️', ['mail', 'email', 'newsletter']],
  ['💬', ['chat', 'message', 'support', 'forum']],
  ['🎨', ['design', 'ui', 'brand', 'theme', 'style']],
  ['🎮', ['game', 'play']],
  ['🎵', ['music', 'audio', 'sound', 'podcast']],
  ['🎬', ['video', 'media', 'film', 'stream']],
  ['📷', ['photo', 'image', 'img', 'camera']],
  ['🎓', ['learn', 'course', 'edu', 'school', 'tutorial']],
  ['🗺️', ['map', 'geo', 'location']],
];

const AUTO_COLORS = PROJECT_COLORS.filter((color) => color.id !== 'gray');

/** An emoji that fits the group's name, from the first word in it that gives one away. */
export function guessEmoji(name: string): string | null {
  const words = name.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  for (const word of words) {
    const hit = HINTS.find(([, hints]) => hints.some((hint) => (hint.length <= 3 ? word === hint : word.startsWith(hint))));
    if (hit) {
      return hit[0];
    }
  }
  return null;
}

/** The group's emoji: the one picked, else one guessed from its name. An empty pick means none. */
export function groupEmoji(group: ProjectGroup): string | null {
  if (group.emoji !== undefined) {
    return group.emoji || null;
  }
  return guessEmoji(group.name);
}

export function groupColor(group: ProjectGroup): ProjectColor {
  const picked = PROJECT_COLORS.find((color) => color.id === group.color);
  if (picked) {
    return picked;
  }
  let hash = 0;
  for (const char of group.id) {
    hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  }
  return AUTO_COLORS[hash % AUTO_COLORS.length];
}

export function styleGroup(groups: ProjectGroup[], groupId: string, look: { color?: string; emoji?: string }): ProjectGroup[] {
  return groups.map((group) => (group.id === groupId ? { ...group, ...look } : group));
}
