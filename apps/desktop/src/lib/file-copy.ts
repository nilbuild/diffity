import type { DiffFile } from '@diffity/parser';
import { toast } from 'sonner';
import * as tauri from './tauri';
import { getRepoPath, parseCommitRef } from './api';

const LARGE_BYTES = 1024 * 1024;
const WORKING_REFS = new Set(['work', 'staged', 'unstaged', '.', '__tree__']);

/** "Copy contents" for the working tree, or "Copy contents at abc1234" / "at PR head" for other views. */
export function contentsLabel(ref: string | null | undefined): string {
  if (!ref || WORKING_REFS.has(ref)) {
    return 'Copy file contents';
  }
  const commit = parseCommitRef(ref);
  if (commit) {
    return `Copy contents at ${commit.slice(0, 7)}`;
  }
  const head = ref.split(/\.{2,3}/)[1];
  if (head && head !== 'HEAD') {
    return `Copy contents at ${/^[0-9a-f]{8,40}$/i.test(head) ? head.slice(0, 7) : head}`;
  }
  return 'Copy file contents';
}

function lineCount(text: string): number {
  if (!text) {
    return 0;
  }
  return text.split('\n').length - (text.endsWith('\n') ? 1 : 0);
}

async function writeClipboard(text: string, what: string) {
  await navigator.clipboard.writeText(text);
  toast.success(`Copied ${what}`);
}

export function copyRelativePath(path: string) {
  void writeClipboard(path, 'relative path');
}

export function copyAbsolutePath(path: string) {
  void writeClipboard(`${getRepoPath().replace(/\/$/, '')}/${path}`, 'absolute path');
}

async function loadContents(path: string, ref: string | null | undefined): Promise<{ text: string | null; binary: boolean; size: number }> {
  if (!ref || WORKING_REFS.has(ref)) {
    const file = await tauri.readFile(getRepoPath(), path);
    return { text: file.contents, binary: file.binary, size: file.size };
  }
  const versions = await tauri.getFileVersions(getRepoPath(), ref, path, path);
  const text = versions.newContents;
  const binary = text !== null && text.includes('\u0000');
  return { text: binary ? null : text, binary, size: text?.length ?? 0 };
}

export async function copyFileContents(path: string, ref?: string | null, confirmed = false) {
  try {
    const { text, binary, size } = await loadContents(path, ref);
    if (binary) {
      toast.error('Binary file', { description: 'Only text files can be copied as contents.' });
      return;
    }
    if (text === null) {
      toast.error('File too large or missing in this version', { description: `${path} (${Math.round(size / 1024)} KB)` });
      return;
    }
    if (!confirmed && size > LARGE_BYTES) {
      toast(`${path} is ${(size / LARGE_BYTES).toFixed(1)} MB`, {
        description: 'Copy it anyway?',
        action: { label: 'Copy anyway', onClick: () => void copyFileContents(path, ref, true) },
      });
      return;
    }
    const lines = lineCount(text);
    await writeClipboard(text, `${lines} line${lines === 1 ? '' : 's'}`);
  } catch (error) {
    toast.error('Could not copy the file', { description: tauri.errorMessage(error) });
  }
}

/** A unified patch of one file, as `git diff` would print it. */
export function filePatch(file: DiffFile): string {
  const oldName = file.status === 'added' ? '/dev/null' : `a/${file.oldPath}`;
  const newName = file.status === 'deleted' ? '/dev/null' : `b/${file.newPath}`;
  const out = [`diff --git a/${file.oldPath} b/${file.newPath}`, `--- ${oldName}`, `+++ ${newName}`];
  for (const hunk of file.hunks) {
    out.push(hunk.header.startsWith('@@') ? hunk.header : `@@ -${hunk.oldStart},${hunk.oldCount} +${hunk.newStart},${hunk.newCount} @@${hunk.context ? ` ${hunk.context}` : ''}`);
    for (const line of hunk.lines) {
      const prefix = line.type === 'add' ? '+' : line.type === 'delete' ? '-' : ' ';
      out.push(`${prefix}${line.content}`);
    }
  }
  return `${out.join('\n')}\n`;
}

export function copyFileDiff(file: DiffFile) {
  if (file.isBinary) {
    toast.error('Binary file', { description: 'There is no text diff to copy.' });
    return;
  }
  const lines = file.hunks.reduce((sum, hunk) => sum + hunk.lines.length, 0);
  void writeClipboard(filePatch(file), `diff (${lines} line${lines === 1 ? '' : 's'})`);
}

/** ⌥⌘C copies the focused file's path, ⇧⌥⌘C its contents. */
export function handleCopyShortcut(event: KeyboardEvent, path: string | null, ref?: string | null): boolean {
  if (!path || !(event.metaKey || event.ctrlKey) || !event.altKey || event.code !== 'KeyC') {
    return false;
  }
  event.preventDefault();
  if (event.shiftKey) {
    void copyFileContents(path, ref);
    return true;
  }
  copyRelativePath(path);
  return true;
}
