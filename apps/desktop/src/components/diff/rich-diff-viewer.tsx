import { useQuery } from '@tanstack/react-query';
import { fileVersionsOptions } from '../../queries/file';
import { isMarkdownFile } from '../../lib/file-types';
import { MarkdownPreview } from '../tree/markdown-preview';
import { SvgPreview } from '../tree/svg-preview';
import { Spinner } from '../icons/spinner';

interface RichDiffViewerProps {
  filePath: string;
  oldPath: string | undefined;
  status: string;
  baseRef?: string;
}

export function RichDiffViewer(props: RichDiffViewerProps) {
  const { filePath, oldPath, status, baseRef } = props;

  const isAdded = status === 'added';
  const isDeleted = status === 'deleted';
  const oldFilePath = oldPath || filePath;

  const { data, isLoading } = useQuery(fileVersionsOptions(filePath, oldPath, baseRef));

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Spinner className="w-5 h-5 text-text-muted" />
      </div>
    );
  }

  const oldContent = data?.oldLines ?? [];
  const newContent = data?.newLines ?? [];
  const isMarkdown = isMarkdownFile(filePath) || isMarkdownFile(oldFilePath);

  if (isAdded || !data?.oldLines) {
    return (
      <div className="p-4">
        {isMarkdown ? (
          <MarkdownPreview content={newContent} filePath={filePath} />
        ) : (
          <SvgPreview content={newContent} />
        )}
      </div>
    );
  }

  if (isDeleted || !data?.newLines) {
    return (
      <div className="p-4">
        {isMarkdown ? (
          <MarkdownPreview content={oldContent} filePath={oldFilePath} />
        ) : (
          <SvgPreview content={oldContent} />
        )}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-4 p-4">
      <div className="min-w-0">
        <div className="text-xs text-text-muted font-medium mb-2 px-1">Before</div>
        {isMarkdown ? (
          <MarkdownPreview content={oldContent} filePath={oldFilePath} />
        ) : (
          <SvgPreview content={oldContent} />
        )}
      </div>
      <div className="min-w-0">
        <div className="text-xs text-text-muted font-medium mb-2 px-1">After</div>
        {isMarkdown ? (
          <MarkdownPreview content={newContent} filePath={filePath} />
        ) : (
          <SvgPreview content={newContent} />
        )}
      </div>
    </div>
  );
}
