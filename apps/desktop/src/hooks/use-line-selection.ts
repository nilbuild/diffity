import { useState, useCallback, useRef, useEffect } from 'react';
import type { CommentSide, LineSelection } from '../components/comments/types';

interface UseLineSelectionOptions {
  filePath: string;
  onSelectionComplete: (selection: LineSelection) => void;
}

interface UseLineSelectionReturn {
  selectionState: {
    side: CommentSide;
    anchorLine: number;
    currentLine: number;
  } | null;
  handleLineMouseDown: (line: number, side: CommentSide) => void;
  handleLineMouseEnter: (line: number, side: CommentSide) => void;
  isLineInSelection: (line: number, side: CommentSide) => boolean;
  getSelectionRange: () => { startLine: number; endLine: number; side: CommentSide } | null;
}

function getLineNumberFromPoint(x: number, y: number): number | null {
  const el = document.elementFromPoint(x, y);
  if (!el) {
    return null;
  }

  const td = el.closest('td');
  if (!td) {
    return null;
  }

  const text = td.textContent?.trim();
  if (!text) {
    return null;
  }

  const num = parseInt(text, 10);
  if (isNaN(num)) {
    return null;
  }

  return num;
}

export function useLineSelection(options: UseLineSelectionOptions): UseLineSelectionReturn {
  const { filePath, onSelectionComplete } = options;
  const [selectionState, setSelectionState] = useState<{
    side: CommentSide;
    anchorLine: number;
    currentLine: number;
  } | null>(null);
  const isDragging = useRef(false);
  const anchorX = useRef(0);
  const selectionRef = useRef(selectionState);
  selectionRef.current = selectionState;

  const handleLineMouseDown = useCallback((line: number, side: CommentSide) => {
    isDragging.current = true;
    anchorX.current = 0;
    setSelectionState({ side, anchorLine: line, currentLine: line });
  }, []);

  const handleLineMouseEnter = useCallback((line: number, side: CommentSide) => {
    if (!isDragging.current || !selectionRef.current) {
      return;
    }
    if (side !== selectionRef.current.side) {
      return;
    }
    setSelectionState(prev => {
      if (!prev) {
        return prev;
      }
      return { ...prev, currentLine: line };
    });
  }, []);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging.current) {
        return;
      }

      if (anchorX.current === 0) {
        anchorX.current = e.clientX;
      }

      const lineNum = getLineNumberFromPoint(anchorX.current, e.clientY);
      if (lineNum !== null) {
        setSelectionState(prev => {
          if (!prev || prev.currentLine === lineNum) {
            return prev;
          }
          return { ...prev, currentLine: lineNum };
        });
      }
    };

    const handleMouseUp = () => {
      const state = selectionRef.current;
      if (!isDragging.current || !state) {
        isDragging.current = false;
        return;
      }
      isDragging.current = false;

      const startLine = Math.min(state.anchorLine, state.currentLine);
      const endLine = Math.max(state.anchorLine, state.currentLine);

      onSelectionComplete({
        filePath,
        side: state.side,
        startLine,
        endLine,
      });
      setSelectionState(null);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [filePath, onSelectionComplete]);

  const isLineInSelection = useCallback((line: number, side: CommentSide) => {
    if (!selectionState) {
      return false;
    }
    if (side !== selectionState.side) {
      return false;
    }
    const start = Math.min(selectionState.anchorLine, selectionState.currentLine);
    const end = Math.max(selectionState.anchorLine, selectionState.currentLine);
    return line >= start && line <= end;
  }, [selectionState]);

  const getSelectionRange = useCallback(() => {
    if (!selectionState) {
      return null;
    }
    return {
      startLine: Math.min(selectionState.anchorLine, selectionState.currentLine),
      endLine: Math.max(selectionState.anchorLine, selectionState.currentLine),
      side: selectionState.side,
    };
  }, [selectionState]);

  return {
    selectionState,
    handleLineMouseDown,
    handleLineMouseEnter,
    isLineInSelection,
    getSelectionRange,
  };
}
