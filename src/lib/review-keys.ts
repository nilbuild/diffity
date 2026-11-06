import { useEffect } from 'react';

export type ReviewKeyAction = 'next' | 'previous' | 'reply' | 'resolve' | 'ask' | 'review';

interface KeyLike {
  key: string;
  shiftKey: boolean;
  altKey: boolean;
  metaKey: boolean;
  ctrlKey: boolean;
}

/** The review-loop key a keydown stands for; ] and [ stay with the comment bar (and the guide's chapters). */
export function reviewKeyAction(event: KeyLike): ReviewKeyAction | null {
  const mod = event.metaKey || event.ctrlKey;
  if (mod && event.shiftKey && !event.altKey && event.key === 'Enter') {
    return 'review';
  }
  if (mod || event.altKey) {
    return null;
  }
  if (event.key === '}') {
    return 'next';
  }
  if (event.key === '{') {
    return 'previous';
  }
  if (event.shiftKey) {
    return event.key === 'R' ? 'reply' : null;
  }
  if (event.key === 'e') {
    return 'resolve';
  }
  if (event.key === 'a') {
    return 'ask';
  }
  return null;
}

const reviewOpeners: (() => void)[] = [];

/** Lets the Submit review popover open from ⇧⌘↵ while it is on screen. */
export function useOpenReviewHandler(setOpen: (open: boolean) => void) {
  useEffect(() => {
    const opener = () => setOpen(true);
    reviewOpeners.push(opener);
    return () => {
      const index = reviewOpeners.indexOf(opener);
      if (index !== -1) {
        reviewOpeners.splice(index, 1);
      }
    };
  }, [setOpen]);
}

/** Opens the newest Submit review popover; false when none is on screen. */
export function requestOpenReview(): boolean {
  const opener = reviewOpeners[reviewOpeners.length - 1];
  if (!opener) {
    return false;
  }
  opener();
  return true;
}
