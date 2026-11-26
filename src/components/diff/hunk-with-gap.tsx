import type { DiffHunk, DiffLine as DiffLineType } from '@/lib/diff-parser';
import type { CodeHighlighter } from '../../hooks/use-highlighter';
import type { ViewMode } from '../../lib/diff-utils';
import type { SyntaxToken } from '../../lib/syntax-token';
import type { ExpandControls } from './hunk-header';
import type { LineRenderProps } from '../comments/types';
import { HunkBlock } from './hunk-block';
import { HunkBlockSplit } from './hunk-block-split';
import type { ChangeActionsConfig } from './change-actions';
import { buildExpansionSyntaxMap, renderExpansionRows } from './render-expansion-rows';

interface GapExpansion {
  fromTop: number;
  fromBottom: number;
  linesFromTop: DiffLineType[];
  linesFromBottom: DiffLineType[];
}

interface HunkWithGapProps extends LineRenderProps {
  hunk: DiffHunk;
  viewMode: ViewMode;
  syntaxMap?: Map<string, SyntaxToken[]>;
  expandControls?: ExpandControls;
  topExpansionLines?: DiffLineType[];
  gapExpansion?: GapExpansion;
  gapId?: string;
  highlightCode?: CodeHighlighter;
  changeActions?: ChangeActionsConfig;
}

export function HunkWithGap(props: HunkWithGapProps) {
  const {
    hunk, viewMode, syntaxMap, expandControls, topExpansionLines, gapExpansion, gapId, highlightCode, changeActions,
    ...commentProps
  } = props;

  const HunkComponent = viewMode === 'split' ? HunkBlockSplit : HunkBlock;

  const allExpansionLines = [
    ...(topExpansionLines || []),
    ...(gapExpansion?.linesFromTop || []),
    ...(gapExpansion?.linesFromBottom || []),
  ];
  const expansionSyntaxMap = allExpansionLines.length > 0
    ? buildExpansionSyntaxMap(allExpansionLines, syntaxMap, highlightCode)
    : undefined;

  return (
    <>
      {gapExpansion && gapExpansion.linesFromTop.length > 0 && (
        <tbody>
          {renderExpansionRows(
            gapExpansion.linesFromTop,
            viewMode,
            `${gapId}-top`,
            expansionSyntaxMap,
            commentProps,
          )}
        </tbody>
      )}
      <HunkComponent
        {...commentProps}
        hunk={hunk}
        syntaxMap={syntaxMap}
        expandControls={expandControls}
        topExpansionLines={topExpansionLines && topExpansionLines.length > 0 ? topExpansionLines : undefined}
        bottomExpansionLines={gapExpansion && gapExpansion.linesFromBottom.length > 0 ? gapExpansion.linesFromBottom : undefined}
        expansionSyntaxMap={expansionSyntaxMap}
        changeActions={changeActions}
      />
    </>
  );
}
