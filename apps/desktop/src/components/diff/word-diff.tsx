import type { DiffLine } from '@diffity/parser';
import type { SyntaxToken } from '../../lib/syntax-token';

interface WordDiffProps {
  line: DiffLine;
  syntaxTokens?: SyntaxToken[];
}

function applySyntaxToText(text: string, offset: number, syntaxTokens: SyntaxToken[]): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  let textPos = 0;
  let tokenIdx = 0;
  let tokenCharPos = 0;

  for (let i = 0; i < syntaxTokens.length; i++) {
    tokenCharPos += syntaxTokens[i].text.length;
    if (tokenCharPos > offset) {
      tokenIdx = i;
      tokenCharPos = tokenCharPos - syntaxTokens[i].text.length;
      break;
    }
  }

  while (textPos < text.length && tokenIdx < syntaxTokens.length) {
    const token = syntaxTokens[tokenIdx];
    const tokenStart = tokenCharPos;
    const tokenEnd = tokenStart + token.text.length;
    const overlapStart = Math.max(offset + textPos, tokenStart);
    const overlapEnd = Math.min(offset + text.length, tokenEnd);

    if (overlapStart >= overlapEnd) {
      tokenIdx++;
      tokenCharPos = tokenEnd;
      continue;
    }

    const sliceStart = overlapStart - offset;
    const sliceEnd = overlapEnd - offset;
    const slice = text.slice(sliceStart, sliceEnd);

    if (sliceStart > textPos) {
      nodes.push(<span key={`gap-${textPos}`}>{text.slice(textPos, sliceStart)}</span>);
    }

    nodes.push(
      <span key={`${tokenIdx}-${sliceStart}`} style={token.color ? { color: token.color } : undefined}>
        {slice}
      </span>
    );

    textPos = sliceEnd;

    if (overlapEnd >= tokenEnd) {
      tokenIdx++;
      tokenCharPos = tokenEnd;
    } else {
      break;
    }
  }

  if (textPos < text.length) {
    nodes.push(<span key={`rest-${textPos}`}>{text.slice(textPos)}</span>);
  }

  return nodes;
}

export function WordDiff(props: WordDiffProps) {
  const { line, syntaxTokens } = props;

  if (!line.wordDiff || line.wordDiff.length === 0) {
    return <span>{line.content || '\n'}</span>;
  }

  let charOffset = 0;

  return (
    <>
      {line.wordDiff.map((seg, i) => {
        const segOffset = charOffset;

        if (seg.type === 'equal') {
          charOffset += seg.text.length;
          if (syntaxTokens && syntaxTokens.length > 0) {
            return <span key={i}>{applySyntaxToText(seg.text, segOffset, syntaxTokens)}</span>;
          }
          return <span key={i}>{seg.text}</span>;
        }

        if (seg.type === 'delete' && line.type === 'delete') {
          charOffset += seg.text.length;
          if (syntaxTokens && syntaxTokens.length > 0) {
            return (
              <span key={i} className="bg-diff-del-word rounded-sm">
                {applySyntaxToText(seg.text, segOffset, syntaxTokens)}
              </span>
            );
          }
          return (
            <span key={i} className="bg-diff-del-word rounded-sm">
              {seg.text}
            </span>
          );
        }

        if (seg.type === 'insert' && line.type === 'add') {
          charOffset += seg.text.length;
          if (syntaxTokens && syntaxTokens.length > 0) {
            return (
              <span key={i} className="bg-diff-add-word rounded-sm">
                {applySyntaxToText(seg.text, segOffset, syntaxTokens)}
              </span>
            );
          }
          return (
            <span key={i} className="bg-diff-add-word rounded-sm">
              {seg.text}
            </span>
          );
        }

        return null;
      })}
    </>
  );
}
