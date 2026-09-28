import { FileTypeIcon, FolderTypeIcon } from './FileTypeIcon';
import { useFilesStore } from './files-store';
import type { TreeNode } from './tree-model';

export function FolderView(props: { node: TreeNode }) {
  const { node } = props;
  const select = useFilesStore((s) => s.select);
  const expandTo = useFilesStore((s) => s.expandTo);

  return (
    <div className="h-full overflow-auto p-4">
      <div className="mx-auto max-w-3xl overflow-hidden rounded-lg border border-border bg-raised">
        <div className="border-b border-border bg-panel px-4 py-2 text-xs font-medium text-fg-muted">
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
            className="flex h-8 w-full cursor-default items-center gap-2 border-b border-border-subtle px-4 text-left text-sm text-fg last:border-b-0 hover:bg-hover"
          >
            {child.kind === 'dir' ? <FolderTypeIcon open={false} /> : <FileTypeIcon name={child.name} />}
            {child.name}
          </button>
        ))}
      </div>
    </div>
  );
}
