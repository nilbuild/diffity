import { cn } from '../../lib/cn';

const TONES = ['#4a7fc1', '#4d8a5f', '#a07f3c', '#8069b8', '#b0628c', '#b35f5f', '#3f8a91', '#7a8591'];

export function repoInitials(name: string) {
  const parts = name.split(/[-_.\s]+/).filter(Boolean);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return name.slice(0, 2).toUpperCase();
}

export function repoTone(name: string) {
  let hash = 0;
  for (const char of name) {
    hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  }
  return TONES[hash % TONES.length];
}

export function RepoBadge(props: { name: string; className?: string }) {
  const { name, className } = props;
  const tone = repoTone(name);

  return (
    <span
      aria-hidden
      className={cn('inline-flex items-center justify-center shrink-0 font-semibold', className)}
      style={{ backgroundColor: `color-mix(in srgb, ${tone} 18%, transparent)`, color: tone }}
    >
      {repoInitials(name)}
    </span>
  );
}
