import type { ComponentType } from 'react';
import { cn } from '../../lib/cn';
import { CommandIcon, ReturnIcon, ShiftIcon, type GlyphProps } from './icon';

const GLYPHS: Record<string, { Icon: ComponentType<GlyphProps>; name: string }> = {
  '↵': { Icon: ReturnIcon, name: 'Return' },
  '⌘': { Icon: CommandIcon, name: 'Command' },
  '⇧': { Icon: ShiftIcon, name: 'Shift' },
};

/** A key or chord as shown on the keyboard: ⌘, ⇧ and ↵ as glyphs, everything else as text. */
export function KeyLabel(props: { keys: string | undefined; size?: number; className?: string }) {
  const { keys, size = 11, className } = props;
  if (!keys) {
    return null;
  }
  const parts: string[] = [];
  for (const char of keys) {
    const last = parts.length - 1;
    if (!GLYPHS[char] && last >= 0 && !GLYPHS[parts[last]]) {
      parts[last] += char;
      continue;
    }
    parts.push(char);
  }

  return (
    <span className={cn('inline-flex items-center gap-[1px] align-[-0.125em]', className)} aria-label={parts.map((part) => GLYPHS[part]?.name ?? part).join(' ')}>
      {parts.map((part, index) => {
        const glyph = GLYPHS[part];
        if (!glyph) {
          return <span key={index}>{part}</span>;
        }
        return <glyph.Icon key={index} size={size} />;
      })}
    </span>
  );
}
