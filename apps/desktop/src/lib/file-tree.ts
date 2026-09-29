import type { DiffFile } from '@diffity/parser';
import { getFilePath } from './diff-utils';

export interface FileNode {
  type: 'file';
  name: string;
  path: string;
  file?: DiffFile;
}

export interface DirNode {
  type: 'dir';
  name: string;
  path: string;
  children: TreeNode[];
}

export type TreeNode = FileNode | DirNode;

function getOrCreateDir(children: TreeNode[], name: string, path: string): DirNode {
  let dir = children.find(c => c.type === 'dir' && c.name === name) as DirNode | undefined;
  if (!dir) {
    dir = { type: 'dir', name, path, children: [] };
    children.push(dir);
  }
  return dir;
}

export function buildFileTree(files: DiffFile[]): TreeNode[] {
  const root: TreeNode[] = [];

  for (const file of files) {
    const fullPath = getFilePath(file);
    const parts = fullPath.split('/');

    let currentChildren = root;
    for (let i = 0; i < parts.length - 1; i++) {
      const dirPath = parts.slice(0, i + 1).join('/');
      const dir = getOrCreateDir(currentChildren, parts[i], dirPath);
      currentChildren = dir.children;
    }

    currentChildren.push({
      type: 'file',
      name: parts[parts.length - 1],
      path: fullPath,
      file,
    });
  }

  return root;
}

export function buildFileTreeFromPaths(paths: string[]): TreeNode[] {
  const root: TreeNode[] = [];

  for (const fullPath of paths) {
    const parts = fullPath.split('/');

    let currentChildren = root;
    for (let i = 0; i < parts.length - 1; i++) {
      const dirPath = parts.slice(0, i + 1).join('/');
      const dir = getOrCreateDir(currentChildren, parts[i], dirPath);
      currentChildren = dir.children;
    }

    currentChildren.push({
      type: 'file',
      name: parts[parts.length - 1],
      path: fullPath,
    });
  }

  return root;
}

export function collapseSingleChildDirs(nodes: TreeNode[]): TreeNode[] {
  return nodes.map(node => {
    if (node.type !== 'dir') {
      return node;
    }

    let current = node;
    let collapsedName = current.name;

    while (current.children.length === 1 && current.children[0].type === 'dir') {
      current = current.children[0] as DirNode;
      collapsedName += '/' + current.name;
    }

    return {
      type: 'dir' as const,
      name: collapsedName,
      path: current.path,
      children: collapseSingleChildDirs(current.children),
    };
  });
}

export function sortTree(nodes: TreeNode[]): TreeNode[] {
  const sorted = [...nodes].sort((a, b) => {
    if (a.type !== b.type) {
      return a.type === 'dir' ? -1 : 1;
    }
    return a.name.localeCompare(b.name);
  });

  return sorted.map(node => {
    if (node.type === 'dir') {
      return { ...node, children: sortTree(node.children) };
    }
    return node;
  });
}

export function filterTree(nodes: TreeNode[], search: string): TreeNode[] {
  const lower = search.toLowerCase();
  const result: TreeNode[] = [];

  for (const node of nodes) {
    if (node.type === 'file') {
      if (node.path.toLowerCase().includes(lower)) {
        result.push(node);
      }
    } else {
      const filteredChildren = filterTree(node.children, search);
      if (filteredChildren.length > 0) {
        result.push({ ...node, children: filteredChildren });
      }
    }
  }

  return result;
}

export function filterTreeToPaths(nodes: TreeNode[], allowedPaths: Set<string>): TreeNode[] {
  const result: TreeNode[] = [];

  for (const node of nodes) {
    if (node.type === 'file') {
      if (allowedPaths.has(node.path)) {
        result.push(node);
      }
    } else {
      const filteredChildren = filterTreeToPaths(node.children, allowedPaths);
      if (filteredChildren.length > 0) {
        result.push({ ...node, children: filteredChildren });
      }
    }
  }

  return result;
}

export function collectAllDirPaths(nodes: TreeNode[]): string[] {
  const paths: string[] = [];
  for (const node of nodes) {
    if (node.type === 'dir') {
      paths.push(node.path);
      paths.push(...collectAllDirPaths(node.children));
    }
  }
  return paths;
}
