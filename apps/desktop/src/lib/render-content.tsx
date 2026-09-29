import type { DiffLine } from '@diffity/parser';
import { WordDiff } from '../components/diff/word-diff';
import type { SyntaxToken } from '../lib/syntax-token';

export function renderContent(line: DiffLine, syntaxTokens?: SyntaxToken[]) {
  if (line.wordDiff && line.wordDiff.length > 0) {
    return <WordDiff line={line} syntaxTokens={syntaxTokens} />;
  }

  if (syntaxTokens && syntaxTokens.length > 0) {
    return (
      <>
        {syntaxTokens.map((token, i) => (
          <span key={i} style={token.color ? { color: token.color } : undefined}>
            {token.text}
          </span>
        ))}
      </>
    );
  }

  return <span>{line.content || '\n'}</span>;
}
