import type { BundledLanguage } from 'shiki';
import type { HighlightRequest, HighlightResponse } from './highlight-protocol';
import type { SideTokens, SyntaxSource } from './syntax-lines';

interface Job {
  into: SideTokens;
  onProgress: () => void;
  onDone: (ok: boolean) => void;
}

/** `undefined` until first use; `null` once workers turned out not to work here, so callers highlight inline. */
let worker: Worker | null | undefined;
let nextId = 1;
const jobs = new Map<number, Job>();

function failAll() {
  worker?.terminate();
  worker = null;
  const pending = [...jobs.values()];
  jobs.clear();
  for (const job of pending) {
    job.onDone(false);
  }
}

function getWorker(): Worker | null {
  if (worker !== undefined) {
    return worker;
  }
  if (typeof Worker === 'undefined') {
    worker = null;
    return null;
  }
  try {
    worker = new Worker(new URL('./highlight-worker.ts', import.meta.url), { type: 'module', name: 'highlight' });
  } catch {
    worker = null;
    return null;
  }
  worker.onmessage = (event: MessageEvent<HighlightResponse>) => {
    const message = event.data;
    const job = jobs.get(message.id);
    if (!job) {
      return;
    }
    if (message.type === 'done') {
      jobs.delete(message.id);
      job.onDone(message.ok);
      return;
    }
    for (const run of message.batch) {
      const target = job.into[run.side];
      run.numbers.forEach((number, index) => {
        const tokens = run.tokens[index];
        if (tokens) {
          target.set(number, tokens);
        }
      });
    }
    job.onProgress();
  };
  worker.onerror = failAll;
  return worker;
}

/**
 * Highlights `sources` off the main thread, filling `into` as tokens arrive. `onDone(false)` means the worker could
 * not do it and the caller should highlight inline. Returns a cancel function, or null when no worker is available.
 */
export function highlightInWorker(
  lang: BundledLanguage,
  theme: 'light' | 'dark',
  sources: SyntaxSource[],
  into: SideTokens,
  onProgress: () => void,
  onDone: (ok: boolean) => void,
): (() => void) | null {
  const instance = getWorker();
  if (!instance) {
    return null;
  }
  const id = nextId++;
  jobs.set(id, { into, onProgress, onDone });
  const request: HighlightRequest = { type: 'highlight', id, lang, theme, sources };
  instance.postMessage(request);
  return () => {
    if (jobs.delete(id)) {
      worker?.postMessage({ type: 'cancel', id });
    }
  };
}
