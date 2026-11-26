import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import * as tauri from '../../lib/tauri';
import { isTauri } from '../../lib/platform';
import { buttonPrimary } from '../../components/ui/button-styles';
import { StarIcon, XIcon } from '../../components/ui/icon';
import { cn } from '../../lib/cn';
import { openRepoPage } from './feedback-dialog';
import { launchCount, markStarPromptShown, shouldShowStarPrompt, starPromptShown } from './star';

const SHOW_AFTER_MS = 2500;

/** Stars Diffity with the GitHub sign-in; without one (or when GitHub refuses), opens the repo page instead. */
export async function starDiffity(): Promise<boolean> {
  if (!isTauri) {
    openRepoPage();
    return false;
  }
  try {
    await tauri.githubStarDiffity();
    toast.success('Thanks for the star!');
    return true;
  } catch {
    openRepoPage();
    return false;
  }
}

async function alreadyStarred(): Promise<boolean> {
  if (!isTauri) {
    return false;
  }
  try {
    return (await tauri.githubDiffityStarred()) === true;
  } catch {
    return false;
  }
}

/** A one-time card on the third launch, bottom-left so it never covers Chat or Comments on the right. */
export function StarPrompt() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!shouldShowStarPrompt(launchCount(), starPromptShown())) {
      return;
    }
    let cancelled = false;
    const timer = window.setTimeout(() => {
      void alreadyStarred().then((starred) => {
        if (cancelled) {
          return;
        }
        markStarPromptShown();
        if (!starred) {
          setVisible(true);
        }
      });
    }, SHOW_AFTER_MS);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, []);

  if (!visible) {
    return null;
  }
  return (
    <section
      aria-label="Star Diffity on GitHub"
      className="fixed left-[64px] bottom-11 z-[60] w-[248px] flex flex-col items-center gap-4 px-4 pt-6 pb-4 rounded-[14px] border border-overlay-border bg-overlay animate-fade-in"
    >
      <button
        onClick={() => setVisible(false)}
        aria-label="Close"
        className="absolute top-2 right-2 w-6 h-6 flex items-center justify-center rounded-md text-text-muted hover:text-text hover:bg-hover cursor-pointer"
      >
        <XIcon size="xs" />
      </button>
      <div className="w-12 h-12 rounded-full bg-modified/15 flex items-center justify-center text-modified">
        <StarIcon size="xl" />
      </div>
      <div className="flex flex-col items-center gap-1 text-center">
        <h2 className="text-sm font-semibold text-text">Enjoying Diffity?</h2>
        <p className="text-[12.5px] text-text-secondary">Leave a Star on GitHub</p>
      </div>
      <button
        onClick={() => {
          setVisible(false);
          void starDiffity();
        }}
        className={cn(buttonPrimary, 'w-full h-8')}
      >
        <StarIcon size="sm" />
        Star on GitHub
      </button>
    </section>
  );
}
