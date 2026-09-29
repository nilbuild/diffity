import { useState } from 'react';
import type { DiffLine } from '@diffity/parser';
import { WordDiff } from '../components/diff/word-diff';
import type { SyntaxToken } from '../lib/syntax-token';

/** Lines longer than this (minified code) show their start and a button for the rest. */
const TRUNCATE_AT = 1000;

function TruncatedLine(props: { content: string }) {
  const { content } = props;
  const [expanded, setExpanded] = useState(false);

  if (expanded) {
    return <span>{content}</span>;
  }
  const rest = content.length - TRUNCATE_AT;
  return (
    <>
      <span>{content.slice(0, TRUNCATE_AT)}</span>
      <button
        type="button"
        onMouseDown={(event) => event.stopPropagation()}
        onClick={(event) => {
          event.stopPropagation();
          setExpanded(true);
        }}
        className="ml-1.5 inline-flex h-[18px] items-center rounded px-1.5 align-baseline font-sans text-[11px] text-text-secondary bg-fill hover:bg-fill-hover hover:text-text cursor-pointer select-none"
        title="The rest of this line is hidden to keep the diff fast"
      >
        … {rest.toLocaleString()} more characters · Show all
      </button>
    </>
  );
}

export function renderContent(line: DiffLine, syntaxTokens?: SyntaxToken[]) {
  if (line.wordDiff && line.wordDiff.length > 0) {
    return <WordDiff line={line} syntaxTokens={syntaxTokens} />;
  }

  if (line.content.length > TRUNCATE_AT) {
    return <TruncatedLine content={line.content} />;
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
