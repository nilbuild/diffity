import { useState, useEffect, useCallback } from 'react';
import { createHighlighter, type Highlighter, type BundledLanguage, type GrammarState } from 'shiki';
import type { SyntaxToken } from '../lib/syntax-token';

/** Lines longer than this are left plain: tokenizing minified code is slow and unreadable anyway. */
const TOKENIZE_MAX_LINE_LENGTH = 1000;

const LANG_MAP: Record<string, BundledLanguage> = {
  ts: 'typescript',
  tsx: 'tsx',
  mts: 'typescript',
  cts: 'typescript',
  js: 'javascript',
  mjs: 'javascript',
  cjs: 'javascript',
  jsx: 'jsx',
  json: 'json',
  css: 'css',
  html: 'html',
  md: 'markdown',
  mdx: 'mdx',
  py: 'python',
  rb: 'ruby',
  rs: 'rust',
  go: 'go',
  java: 'java',
  sh: 'bash',
  bash: 'bash',
  zsh: 'bash',
  fish: 'fish',
  ps1: 'powershell',
  yml: 'yaml',
  yaml: 'yaml',
  xml: 'xml',
  svg: 'xml',
  sql: 'sql',
  graphql: 'graphql',
  gql: 'graphql',
  dockerfile: 'dockerfile',
  toml: 'toml',
  ini: 'ini',
  lua: 'lua',
  c: 'c',
  cpp: 'cpp',
  cc: 'cpp',
  cxx: 'cpp',
  h: 'c',
  hpp: 'cpp',
  cs: 'csharp',
  swift: 'swift',
  kt: 'kotlin',
  kts: 'kotlin',
  scala: 'scala',
  vue: 'vue',
  svelte: 'svelte',
  php: 'php',
  r: 'r',
  scss: 'scss',
  less: 'less',
  sass: 'sass',
  styl: 'stylus',
  dart: 'dart',
  ex: 'elixir',
  exs: 'elixir',
  erl: 'erlang',
  hs: 'haskell',
  clj: 'clojure',
  cljs: 'clojure',
  pl: 'perl',
  pm: 'perl',
  zig: 'zig',
  nim: 'nim',
  ml: 'ocaml',
  mli: 'ocaml',
  fs: 'fsharp',
  fsx: 'fsharp',
  groovy: 'groovy',
  gradle: 'groovy',
  tf: 'hcl',
  hcl: 'hcl',
  proto: 'protobuf',
  prisma: 'prisma',
  astro: 'astro',
  m: 'objective-c',
  mm: 'objective-cpp',
  tex: 'latex',
  latex: 'latex',
  diff: 'diff',
  patch: 'diff',
  nginx: 'nginx',
  conf: 'ini',
  cfg: 'ini',
  env: 'dotenv',
  bat: 'bat',
  cmd: 'bat',
  asm: 'asm',
  s: 'asm',
  jsonc: 'jsonc',
  json5: 'json5',
  csv: 'csv',
  tsv: 'csv',
  wasm: 'wasm',
  ejs: 'html',
  hbs: 'handlebars',
  pug: 'pug',
  jade: 'pug',
  rst: 'rst',
  jl: 'julia',
  v: 'v',
  sol: 'solidity',
  luau: 'luau',
  glsl: 'glsl',
  hlsl: 'hlsl',
  wgsl: 'wgsl',
};

const FILENAME_MAP: Record<string, BundledLanguage> = {
  dockerfile: 'dockerfile',
  makefile: 'makefile',
  cmakelists: 'cmake',
  gemfile: 'ruby',
  rakefile: 'ruby',
  justfile: 'just',
  vagrantfile: 'ruby',
};

export function getLang(filePath: string): BundledLanguage | null {
  const ext = filePath.split('.').pop()?.toLowerCase() || '';
  const fileName = filePath.split('/').pop()?.toLowerCase() || '';

  const fileNameMatch = FILENAME_MAP[fileName];
  if (fileNameMatch) {
    return fileNameMatch;
  }

  return LANG_MAP[ext] || null;
}

export function canHighlight(filePath: string): boolean {
  return getLang(filePath) !== null;
}

let highlighterPromise: Promise<Highlighter> | null = null;
let loadedHighlighter: Highlighter | null = null;

function getHighlighter(): Promise<Highlighter> {
  if (!highlighterPromise) {
    // No grammars up front: each loads the first time a file or code block in it is shown (issue #55).
    highlighterPromise = createHighlighter({
      themes: ['github-light', 'github-dark'],
      langs: [],
    }).then((instance) => {
      loadedHighlighter = instance;
      return instance;
    });
  }
  return highlighterPromise;
}

/** Grammars that finished loading, or failed to (their code then shows plain). */
const settledLangs = new Set<BundledLanguage>();
const loadingLangs = new Set<BundledLanguage>();
const langListeners = new Set<() => void>();

function loadLang(lang: BundledLanguage) {
  if (settledLangs.has(lang) || loadingLangs.has(lang)) {
    return;
  }
  loadingLangs.add(lang);
  getHighlighter()
    .then((instance) => instance.loadLanguage(lang))
    .catch(() => {})
    .then(() => {
      loadingLangs.delete(lang);
      settledLangs.add(lang);
      for (const listener of langListeners) {
        listener();
      }
    });
}

export interface HighlightedTokens {
  tokens: { text: string; color?: string }[];
}

/** A highlighted code block: its lines, and the theme's text color, which tokens without a color of their own show in. */
export interface HighlightedCode {
  lines: HighlightedTokens[];
  fg: string;
}

/**
 * Tokens of code blocks already highlighted, so opening a markdown preview or comment again does not tokenize it
 * again: WebKit is slow to collect the garbage each pass leaves behind.
 */
const highlightCache = new Map<string, HighlightedCode>();

function rememberHighlight(key: string, code: HighlightedCode) {
  if (highlightCache.size >= 300) {
    const first = highlightCache.keys().next().value;
    if (first !== undefined) {
      highlightCache.delete(first);
    }
  }
  highlightCache.set(key, code);
}

/** Tokens of a run of lines, plus the grammar state to carry into the next run of the same file. */
export interface HighlightChunk {
  lines: SyntaxToken[][];
  state: GrammarState | undefined;
}

export type CodeHighlighter = (code: string, state?: GrammarState) => HighlightChunk | null;

export function useHighlighter() {
  const [highlighter, setHighlighter] = useState<Highlighter | null>(() => loadedHighlighter);
  const [langCount, setLangCount] = useState(() => settledLangs.size);

  useEffect(() => {
    const listener = () => setLangCount(settledLangs.size);
    langListeners.add(listener);
    listener();
    if (!loadedHighlighter) {
      getHighlighter().then(setHighlighter);
    }
    return () => {
      langListeners.delete(listener);
    };
  }, []);

  /**
   * Whether `tokenize` can highlight this file now. Until its grammar has loaded it says no and starts the load; the
   * component renders again once it lands. Files with no grammar are ready at once (they show plain).
   */
  const languageReady = useCallback((filePath: string): boolean => {
    if (!highlighter) {
      return false;
    }
    const lang = getLang(filePath);
    if (!lang || settledLangs.has(lang)) {
      return true;
    }
    loadLang(lang);
    return false;
    // langCount gives this a new identity once a grammar lands, so memos and effects that use it run again.
  }, [highlighter, langCount]);

  /** Tokens of a code block, or null while its grammar loads (the caller renders again once it has). */
  const highlight = useCallback((code: string, filePath: string, theme: 'light' | 'dark'): HighlightedCode | null => {
    const lang = getLang(filePath);
    if (!highlighter || !lang || !languageReady(filePath)) {
      return null;
    }

    const shikiTheme = theme === 'dark' ? 'github-dark' : 'github-light';
    const key = `${shikiTheme}\0${lang}\0${code}`;
    const cached = highlightCache.get(key);
    if (cached) {
      return cached;
    }

    try {
      const result = highlighter.codeToTokens(code, {
        lang,
        theme: shikiTheme,
      });

      // About half the tokens are in the theme's text color; leaving their color to the block saves a span each.
      const fg = (result.fg ?? '').toLowerCase();
      const lines = result.tokens.map(line => ({
        tokens: line.map(token => ({
          text: token.content,
          color: token.color?.toLowerCase() === fg ? undefined : token.color,
        })),
      }));
      const highlighted = { lines, fg: result.fg ?? '' };
      rememberHighlight(key, highlighted);
      return highlighted;
    } catch {
      return null;
    }
  }, [highlighter, languageReady]);

  const tokenize = useCallback((code: string, filePath: string, theme: 'light' | 'dark', state?: GrammarState): HighlightChunk | null => {
    if (!highlighter) {
      return null;
    }
    const lang = getLang(filePath);
    if (!lang) {
      return null;
    }
    try {
      const result = highlighter.codeToTokens(code, {
        lang,
        theme: theme === 'dark' ? 'github-dark' : 'github-light',
        grammarState: state,
        tokenizeMaxLineLength: TOKENIZE_MAX_LINE_LENGTH,
      });
      return {
        lines: result.tokens.map((line) => line.map((token) => ({ text: token.content, color: token.color }))),
        state: result.grammarState,
      };
    } catch {
      return null;
    }
  }, [highlighter]);

  return { highlight, tokenize, languageReady };
}
