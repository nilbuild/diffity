import { cn } from '../../lib/cn';
import { PROJECT_COLORS } from './project-colors';

export function ColorSwatches(props: { value: string; onPick: (id: string) => void; className?: string }) {
  const { value, onPick, className } = props;

  return (
    <div role="radiogroup" aria-label="Color" className={cn('flex items-center justify-between h-8', className)}>
      {PROJECT_COLORS.map((option) => (
        <button
          key={option.id}
          type="button"
          role="radio"
          aria-checked={option.id === value}
          aria-label={option.label}
          title={option.label}
          onClick={() => onPick(option.id)}
          style={{ backgroundColor: option.value }}
          className={cn('w-4 h-4 rounded-full cursor-pointer transition-transform hover:scale-110', option.id === value && 'ring-2 ring-text ring-offset-2 ring-offset-overlay')}
        />
      ))}
    </div>
  );
}
