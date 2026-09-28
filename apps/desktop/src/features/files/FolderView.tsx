import { FileIcon, FolderIcon } from '@/components/ui/icons';
import { useFilesStore } from './files-store';
import type { TreeNode } from './tree-model';

export function FolderView(props: { node: TreeNode }) {
  const { node } = props;
  const select = useFilesStore((s) => s.select);
  const expandTo = useFilesStore((s) => s.expandTo);

  return (
    <div className="h-full overflow-auto p-4">
      <div className="mx-auto max-w-3xl overflow-hidden rounded-lg border border-border">
        <div className="border-b border-border bg-bg-subtle px-4 py-2 text-xs font-medium text-fg-muted">
          {node.path || 'Repository root'} · {node.children.length} items
        </div>
        {node.children.map((child) => (
          <button
            key={child.path}
            type="button"
            onClick={() => {
              expandTo(child.path);
              select(child.path);
            }}
            className="flex w-full cursor-default items-center gap-2 border-b border-border px-4 py-1.5 text-left text-[13px] last:border-b-0 hover:bg-bg-muted"
          >
            {child.kind === 'dir' ? (
              <FolderIcon size={14} className="text-accent/80" />
            ) : (
              <FileIcon size={14} className="text-fg-subtle" />
            )}
            {child.name}
          </button>
        ))}
      </div>
    </div>
  );
}
