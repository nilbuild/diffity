/// <reference lib="webworker" />
import { createHighlighter, type BundledLanguage, type GrammarState, type Highlighter } from 'shiki';
import type { SyntaxToken } from './syntax-token';
import type { SyntaxSource } from './syntax-lines';
import type { HighlightRequest, HighlightResponse } from './highlight-protocol';

/** Lines longer than this are left plain: tokenizing minified code is slow and unreadable anyway. */
const TOKENIZE_MAX_LINE_LENGTH = 1000;
const CHUNK_LINES = 60;
/** Tokens are sent back at least this often, so a long file colours in as it goes. */
const POST_EVERY_MS = 60;

const scope = self as unknown as DedicatedWorkerGlobalScope;

let highlighter: Promise<Highlighter> | null = null;
const langs = new Map<BundledLanguage, Promise<boolean>>();

function getHighlighter(): Promise<Highlighter> {
  if (!highlighter) {
    highlighter = createHighlighter({ themes: ['github-light', 'github-dark'], langs: [] });
  }
  return highlighter;
}

function loadLang(instance: Highlighter, lang: BundledLanguage): Promise<boolean> {
  let loaded = langs.get(lang);
  if (!loaded) {
    loaded = instance.loadLanguage(lang).then(() => true, () => false);
    langs.set(lang, loaded);
  }
  return loaded;
}

const queue: HighlightRequest[] = [];
const cancelled = new Set<number>();
let running = false;

const post = (message: HighlightResponse) => scope.postMessage(message);
const yieldToMessages = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

async function run(job: HighlightRequest) {
  const instance = await getHighlighter();
  if (!(await loadLang(instance, job.lang))) {
    post({ type: 'done', id: job.id, ok: false });
    return;
  }
  const theme = job.theme === 'dark' ? 'github-dark' : 'github-light';
  let batch: { side: SyntaxSource['side']; numbers: number[]; tokens: SyntaxToken[][] }[] = [];
  let lastPost = performance.now();
  const flush = () => {
    if (batch.length > 0) {
      post({ type: 'tokens', id: job.id, batch });
      batch = [];
    }
    lastPost = performance.now();
  };
  for (const source of job.sources) {
    let state: GrammarState | undefined;
    for (let start = 0; start < source.lines.length; start += CHUNK_LINES) {
      if (cancelled.has(job.id)) {
        return;
      }
      const end = Math.min(start + CHUNK_LINES, source.lines.length);
      const result = instance.codeToTokens(source.lines.slice(start, end).join('\n'), {
        lang: job.lang,
        theme,
        grammarState: state,
        tokenizeMaxLineLength: TOKENIZE_MAX_LINE_LENGTH,
      });
      state = result.grammarState;
      batch.push({
        side: source.side,
        numbers: source.numbers.slice(start, end),
        tokens: result.tokens.map((line) => line.map((token) => ({ text: token.content, color: token.color }))),
      });
      if (performance.now() - lastPost > POST_EVERY_MS) {
        flush();
        await yieldToMessages();
      }
    }
  }
  flush();
  post({ type: 'done', id: job.id, ok: true });
}

async function drain() {
  if (running) {
    return;
  }
  running = true;
  while (queue.length > 0) {
    const job = queue.shift()!;
    if (cancelled.delete(job.id)) {
      continue;
    }
    try {
      await run(job);
    } catch {
      post({ type: 'done', id: job.id, ok: false });
    }
    cancelled.delete(job.id);
  }
  running = false;
}

scope.onmessage = (event: MessageEvent<HighlightRequest | { type: 'cancel'; id: number }>) => {
  const message = event.data;
  if (message.type === 'cancel') {
    cancelled.add(message.id);
    return;
  }
  queue.push(message);
  void drain();
};
