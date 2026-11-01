import type { BundledLanguage } from 'shiki';
import type { SyntaxToken } from './syntax-token';
import type { SyntaxSide, SyntaxSource } from './syntax-lines';

export interface HighlightRequest {
  type: 'highlight';
  id: number;
  lang: BundledLanguage;
  theme: 'light' | 'dark';
  sources: SyntaxSource[];
}

export type HighlightResponse =
  | { type: 'tokens'; id: number; batch: { side: SyntaxSide; numbers: number[]; tokens: SyntaxToken[][] }[] }
  | { type: 'done'; id: number; ok: boolean };
