import { useEffect, useRef } from 'react';
import { useHotkeys } from 'react-hotkeys-hook';

interface KeyboardActions {
  onNextFile: () => void;
  onPrevFile: () => void;
  onNextHunk: () => void;
  onPrevHunk: () => void;
  onToggleCollapse: () => void;
  onCollapseAll: () => void;
  onToggleReviewed: () => void;
  onUnifiedView: () => void;
  onSplitView: () => void;
  onShowHelp: () => void;
  onFocusSearch: () => void;
  onEscape: () => void;
}

const HOTKEY_OPTIONS = { preventDefault: true };

function isInputFocused(): boolean {
  const tag = document.activeElement?.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA';
}

export function useKeyboard(actions: KeyboardActions) {
  const actionsRef = useRef(actions);
  actionsRef.current = actions;

  useHotkeys('j', actions.onNextFile, HOTKEY_OPTIONS);
  useHotkeys('k', actions.onPrevFile, HOTKEY_OPTIONS);
  useHotkeys('n', actions.onNextHunk, HOTKEY_OPTIONS);
  useHotkeys('p', actions.onPrevHunk, HOTKEY_OPTIONS);
  useHotkeys('x', actions.onToggleCollapse, HOTKEY_OPTIONS);
  useHotkeys('shift+x', actions.onCollapseAll, HOTKEY_OPTIONS);
  useHotkeys('r', actions.onToggleReviewed, HOTKEY_OPTIONS);
  useHotkeys('u', actions.onUnifiedView, HOTKEY_OPTIONS);
  useHotkeys('s', actions.onSplitView, HOTKEY_OPTIONS);
  useHotkeys('escape', actions.onEscape, { enableOnFormTags: ['INPUT', 'TEXTAREA'] });

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === '/' && !isInputFocused()) {
        e.preventDefault();
        actionsRef.current.onFocusSearch();
      }
      if (e.key === '?' && !isInputFocused()) {
        e.preventDefault();
        actionsRef.current.onShowHelp();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);
}
