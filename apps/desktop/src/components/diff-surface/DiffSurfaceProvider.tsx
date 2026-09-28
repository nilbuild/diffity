import { useEffect, type ReactNode } from 'react';
import { WorkerPoolContextProvider, useWorkerPool } from '@pierre/diffs/react';
import DiffsWorker from '@pierre/diffs/worker/worker.js?worker';
import { DIFF_THEMES } from './theme';

const poolOptions = {
  workerFactory: () => new DiffsWorker(),
  poolSize: Math.min(4, Math.max(1, (navigator.hardwareConcurrency ?? 4) - 1)),
};

const highlighterOptions = {
  theme: DIFF_THEMES,
  lineDiffType: 'word-alt' as const,
};

export interface DiffSurfaceProviderProps {
  wordDiff: boolean;
  children: ReactNode;
}

export function DiffSurfaceProvider(props: DiffSurfaceProviderProps) {
  const { wordDiff, children } = props;
  return (
    <WorkerPoolContextProvider poolOptions={poolOptions} highlighterOptions={highlighterOptions}>
      <WordDiffSync wordDiff={wordDiff} />
      {children}
    </WorkerPoolContextProvider>
  );
}

function WordDiffSync(props: { wordDiff: boolean }) {
  const { wordDiff } = props;
  const pool = useWorkerPool();

  useEffect(() => {
    if (!pool) {
      return;
    }
    void pool.setRenderOptions({ lineDiffType: wordDiff ? 'word-alt' : 'none' });
  }, [pool, wordDiff]);

  return null;
}
