import type { TreeEntry } from '@/lib/types';

export interface TreeNode {
  path: string;
  name: string;
  kind: 'file' | 'dir';
  depth: number;
  children: TreeNode[];
}

export interface TreeRow {
  node: TreeNode;
  expanded: boolean;
}

export function buildTree(entries: TreeEntry[]): TreeNode {
  const root: TreeNode = { path: '', name: '', kind: 'dir', depth: -1, children: [] };
  const dirs = new Map<string, TreeNode>([['', root]]);

  const ensureDir = (path: string): TreeNode => {
    const existing = dirs.get(path);
    if (existing) {
      return existing;
    }
    const slash = path.lastIndexOf('/');
    const parent = ensureDir(slash === -1 ? '' : path.slice(0, slash));
    const node: TreeNode = { path, name: path.slice(slash + 1), kind: 'dir', depth: parent.depth + 1, children: [] };
    parent.children.push(node);
    dirs.set(path, node);
    return node;
  };

  for (const entry of entries) {
    if (entry.kind === 'dir') {
      ensureDir(entry.path);
      continue;
    }
    const slash = entry.path.lastIndexOf('/');
    const parent = ensureDir(slash === -1 ? '' : entry.path.slice(0, slash));
    parent.children.push({ path: entry.path, name: entry.path.slice(slash + 1), kind: 'file', depth: parent.depth + 1, children: [] });
  }

  const sort = (node: TreeNode) => {
    node.children.sort((a, b) => {
      if (a.kind !== b.kind) {
        return a.kind === 'dir' ? -1 : 1;
      }
      return a.name.localeCompare(b.name);
    });
    for (const child of node.children) {
      sort(child);
    }
  };
  sort(root);
  return root;
}

export function findNode(root: TreeNode, path: string): TreeNode | null {
  if (path === '') {
    return root;
  }
  let node: TreeNode | undefined = root;
  const parts = path.split('/');
  for (let i = 0; i < parts.length && node; i++) {
    const prefix = parts.slice(0, i + 1).join('/');
    node = node.children.find((c) => c.path === prefix);
  }
  return node ?? null;
}

/** Visible rows. With a `keep` predicate, only files passing it (and their ancestor dirs) are shown, fully expanded. */
export function flattenTree(root: TreeNode, expanded: Set<string>, keep: ((path: string) => boolean) | null): TreeRow[] {
  const rows: TreeRow[] = [];
  const visit = (node: TreeNode): boolean => {
    if (node.kind === 'file') {
      if (keep && !keep(node.path)) {
        return false;
      }
      rows.push({ node, expanded: false });
      return true;
    }
    const isOpen = keep !== null || expanded.has(node.path);
    const index = rows.length;
    rows.push({ node, expanded: isOpen });
    if (!isOpen) {
      return keep === null;
    }
    let any = false;
    for (const child of node.children) {
      any = visit(child) || any;
    }
    if (keep && !any) {
      rows.splice(index);
      return false;
    }
    return true;
  };
  for (const child of root.children) {
    visit(child);
  }
  return rows;
}

export function allDirPaths(root: TreeNode): Set<string> {
  const result = new Set<string>();
  const visit = (node: TreeNode) => {
    if (node.kind !== 'dir') {
      return;
    }
    if (node.path) {
      result.add(node.path);
    }
    node.children.forEach(visit);
  };
  visit(root);
  return result;
}
