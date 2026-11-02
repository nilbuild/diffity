import { useState, type KeyboardEvent } from 'react';
import { ChevronLeftIcon, ChevronRightIcon } from '../../components/ui/icon';

export interface Stepper {
  active: number | null;
  select: (index: number) => void;
  step: (offset: number) => void;
  /** ←/→/↑/↓ step. */
  onKeyDown: (event: KeyboardEvent) => void;
}

/** Steps through `count` items one at a time; `onGo` runs for every step reached. */
export function useStepper(count: number, onGo: (index: number) => void): Stepper {
  const [active, setActive] = useState<number | null>(null);

  const goTo = (index: number) => {
    if (index < 0 || index >= count) {
      return;
    }
    setActive(index);
    onGo(index);
  };
  const step = (offset: number) => {
    goTo(Math.max(0, Math.min(count - 1, (active ?? -1) + offset)));
  };
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
      event.preventDefault();
      step(1);
      return;
    }
    if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
      event.preventDefault();
      step(-1);
    }
  };

  return { active, select: goTo, step, onKeyDown };
}

const controlButton = 'inline-flex items-center justify-center w-6 h-6 rounded-md text-text-secondary hover:text-text hover:bg-hover disabled:opacity-40 disabled:pointer-events-none cursor-pointer';

/** "N / M", previous and next, for a `useStepper`. */
export function StepControls(props: { stepper: Stepper; count: number; idleLabel: string; noun: string }) {
  const { stepper, count, idleLabel, noun } = props;
  const { active } = stepper;

  return (
    <>
      <span className="mr-1 text-[11px] text-text-muted tabular-nums">{active !== null ? `${active + 1} / ${count}` : idleLabel}</span>
      <button onClick={() => stepper.step(-1)} disabled={active === null || active === 0} className={controlButton} title={`Previous ${noun} (←)`} aria-label={`Previous ${noun}`}>
        <ChevronLeftIcon size="xs" />
      </button>
      <button onClick={() => stepper.step(1)} disabled={active === count - 1} className={controlButton} title={`Next ${noun} (→)`} aria-label={`Next ${noun}`}>
        <ChevronRightIcon size="xs" />
      </button>
    </>
  );
}
