import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { ChevronLeftIcon, ChevronRightIcon, PauseIcon, PlayIcon } from '../../components/ui/icon';

const PLAY_INTERVAL_MS = 2400;

export interface Stepper {
  active: number | null;
  playing: boolean;
  /** Jumps to a step and stops playing. */
  select: (index: number) => void;
  step: (offset: number) => void;
  togglePlay: () => void;
  /** ←/→/↑/↓ step, space plays or pauses. */
  onKeyDown: (event: KeyboardEvent) => void;
}

/** Steps through `count` items one at a time, by hand or on a timer; `onGo` runs for every step reached. */
export function useStepper(count: number, onGo: (index: number) => void): Stepper {
  const [active, setActive] = useState<number | null>(null);
  const [playing, setPlaying] = useState(false);

  const goTo = (index: number) => {
    if (index < 0 || index >= count) {
      return;
    }
    setActive(index);
    onGo(index);
  };
  const goToRef = useRef(goTo);
  goToRef.current = goTo;
  const activeRef = useRef(active);
  activeRef.current = active;

  useEffect(() => {
    if (!playing) {
      return;
    }
    const timer = setInterval(() => {
      const next = (activeRef.current ?? -1) + 1;
      if (next >= count) {
        setPlaying(false);
        return;
      }
      goToRef.current(next);
    }, PLAY_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [playing, count]);

  const select = (index: number) => {
    setPlaying(false);
    goTo(index);
  };
  const step = (offset: number) => {
    setPlaying(false);
    goTo(Math.max(0, Math.min(count - 1, (active ?? -1) + offset)));
  };
  const togglePlay = () => {
    if (playing) {
      setPlaying(false);
      return;
    }
    if (active === null || active >= count - 1) {
      goTo(0);
    }
    setPlaying(true);
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
      return;
    }
    if (event.key === ' ') {
      event.preventDefault();
      togglePlay();
    }
  };

  return { active, playing, select, step, togglePlay, onKeyDown };
}

const controlButton = 'inline-flex items-center justify-center w-6 h-6 rounded-md text-text-secondary hover:text-text hover:bg-hover disabled:opacity-40 disabled:pointer-events-none cursor-pointer';

/** "N / M", previous, play and next, for a `useStepper`. */
export function StepControls(props: { stepper: Stepper; count: number; idleLabel: string; noun: string }) {
  const { stepper, count, idleLabel, noun } = props;
  const { active, playing } = stepper;

  return (
    <>
      <span className="mr-1 text-[11px] text-text-muted tabular-nums">{active !== null ? `${active + 1} / ${count}` : idleLabel}</span>
      <button onClick={() => stepper.step(-1)} disabled={active === null || active === 0} className={controlButton} title={`Previous ${noun} (←)`} aria-label={`Previous ${noun}`}>
        <ChevronLeftIcon size="xs" />
      </button>
      <button onClick={stepper.togglePlay} className={controlButton} title={playing ? 'Pause (space)' : `Step through each ${noun} (space)`} aria-label={playing ? 'Pause' : 'Play'}>
        {playing ? <PauseIcon size="xs" /> : <PlayIcon size="xs" />}
      </button>
      <button onClick={() => stepper.step(1)} disabled={active === count - 1} className={controlButton} title={`Next ${noun} (→)`} aria-label={`Next ${noun}`}>
        <ChevronRightIcon size="xs" />
      </button>
    </>
  );
}
