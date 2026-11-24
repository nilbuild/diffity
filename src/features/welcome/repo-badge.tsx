import { cn } from '../../lib/cn';
import { useProjectDirectory } from '../groups/project-directory';
import { colorStyle, projectColor, useProjectColors } from './project-colors';
import { useProjectLogo } from './project-icons';
import { useProjectEmoji } from './project-emojis';

const SEPARATORS = /[-_.\s]+/;

export function repoInitials(name: string) {
  const parts = name.split(SEPARATORS).filter(Boolean);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return name.slice(0, 2).toUpperCase();
}

/** Initials that tell `name` apart from the `others` it sits with: "shop-web" next to "shop-api" is WE, not SW. */
export function projectInitials(name: string, others: string[]) {
  const parts = name.split(SEPARATORS).filter(Boolean);
  const first = parts[0]?.toLowerCase();
  const shared = parts.length >= 2 && others.some((other) => other !== name && other.split(SEPARATORS)[0]?.toLowerCase() === first);
  if (!shared) {
    return repoInitials(name);
  }
  const rest = parts.slice(1);
  return (rest.length >= 2 ? rest[0][0] + rest[1][0] : rest[0].slice(0, 2)).toUpperCase();
}

export function useProjectInitials(name: string) {
  return useProjectDirectory((state) => projectInitials(name, state.rail.map((path) => path.split('/').filter(Boolean).pop() ?? '')));
}

/** A project's emoji or logo, or its initials on its colour; `solid` fills it, for the project that's open. */
export function RepoBadge(props: { name: string; path?: string; solid?: boolean; className?: string }) {
  const { name, path, solid, className } = props;
  const initials = useProjectInitials(name);
  const color = useProjectColors((state) => (path ? projectColor(path, state.byPath) : null));
  const { logo, shown } = useProjectLogo(path);
  const emoji = useProjectEmoji(path);

  if (logo && shown && !emoji) {
    return <img aria-hidden alt="" src={logo} decoding="sync" draggable={false} className={cn('shrink-0 object-contain', className)} />;
  }

  return (
    <span
      aria-hidden
      style={color ? colorStyle(color) : undefined}
      className={cn(
        'inline-flex items-center justify-center shrink-0 font-semibold',
        !color && 'bg-fill text-text-secondary',
        color && (solid ? 'project-solid' : 'project-tint'),
        className,
      )}
    >
      {emoji ? <span className="text-[1.5em] leading-none">{emoji}</span> : initials}
    </span>
  );
}
