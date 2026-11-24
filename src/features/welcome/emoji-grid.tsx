import type { ReactNode } from 'react';
import { cn } from '../../lib/cn';

/** Emojis offered for a project or group, roughly by what it's about. */
export const EMOJIS = [
  '🛒', '💳', '🏦', '📦', '🚚', '🏠', '🍕', '✈️',
  '🌐', '📱', '🖥️', '⚙️', '🛠️', '🧩', '🔌', '☁️',
  '🤖', '🧠', '📊', '🗄️', '🔒', '🧪', '🐛', '🚀',
  '📚', '📝', '✉️', '💬', '🎨', '🎮', '🎵', '🎬',
  '📷', '🎓', '🗺️', '🌱', '⚡', '🔥', '⭐',
];

/** A choice shown before the emojis, like initials or a logo. */
export interface IconChoice {
  key: string;
  label: ReactNode;
  title: string;
  selected: boolean;
  onPick: () => void;
}

export function EmojiGrid(props: { value: string | null; choices: IconChoice[]; onPick: (emoji: string) => void; className?: string }) {
  const { value, choices, onPick, className } = props;

  return (
    <div role="listbox" aria-label="Icon" className={cn('grid grid-cols-8 gap-0.5', className)}>
      {choices.map((choice) => (
        <button
          key={choice.key}
          type="button"
          role="option"
          aria-selected={choice.selected}
          onClick={choice.onPick}
          title={choice.title}
          className={cn('h-8 flex items-center justify-center rounded-md text-[11px] font-semibold text-text-secondary hover:bg-fill-hover cursor-pointer', choice.selected && 'bg-selected text-text')}
        >
          {choice.label}
        </button>
      ))}
      {EMOJIS.map((option) => (
        <button
          key={option}
          type="button"
          role="option"
          aria-selected={option === value}
          onClick={() => onPick(option)}
          className={cn('h-8 rounded-md text-[18px] leading-none hover:bg-fill-hover cursor-pointer', option === value && 'bg-selected')}
        >
          {option}
        </button>
      ))}
    </div>
  );
}
