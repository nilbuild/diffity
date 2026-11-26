import { describe, it, expect } from 'vitest';
import { parseDiff } from '@/lib/diff-parser';
import {
  changeActionsDisabledReason,
  changeActionsFor,
  changeActionToast,
  discardChangeCopy,
  revertFileCopy,
  revertFileMenuLabel,
  workingView,
} from '../src/lib/change-actions';
import { buildChangeGroupPatch, getChangeGroups, getFilePath } from '../src/lib/diff-utils';
import { createStagingMock } from '../src/lib/mock-api-staging';

describe('change actions per view', () => {
  it('maps refs to views', () => {
    expect(workingView('work')).toBe('all');
    expect(workingView('.')).toBe('all');
    expect(workingView(undefined)).toBe('all');
    expect(workingView('staged')).toBe('staged');
    expect(workingView('unstaged')).toBe('unstaged');
  });

  it('offers Unstage only in Staged, Stage and Discard elsewhere', () => {
    expect(changeActionsFor('staged')).toEqual(['unstage']);
    expect(changeActionsFor('unstaged')).toEqual(['stage', 'discard']);
    expect(changeActionsFor('all')).toEqual(['stage', 'discard']);
  });

  it('turns the buttons off while whitespace is hidden', () => {
    expect(changeActionsDisabledReason('all', false)).toBeNull();
    expect(changeActionsDisabledReason('unstaged', true)).toBe('Show whitespace changes to discard or stage parts of a file');
    expect(changeActionsDisabledReason('staged', true)).toBe('Show whitespace changes to unstage parts of a file');
  });

  it('says what stays and what changes', () => {
    expect(discardChangeCopy('unstaged', 'src/server.ts', 'modified').message).toBe(
      "Discard this change in server.ts? Your staged edits to this file stay. This can't be undone.",
    );
    expect(discardChangeCopy('all', 'src/server.ts', 'modified').message).toContain('restores these lines from the last commit');
    expect(revertFileCopy('unstaged', 'a/b/server.ts', 'modified').title).toBe('Discard unstaged changes');
    expect(revertFileCopy('unstaged', 'a/b/server.ts', 'modified').message).toContain('Your staged edits stay');
    expect(revertFileCopy('all', 'server.ts', 'modified').message).toContain('staged and unstaged');
    expect(revertFileCopy('all', 'new.ts', 'untracked').confirmLabel).toBe('Delete');
    expect(revertFileMenuLabel('unstaged')).toBe('Discard unstaged changes…');
    expect(revertFileMenuLabel('all')).toBe('Revert file…');
    expect(changeActionToast('stage', 'src/server.ts')).toBe('Staged 1 change in server.ts');
  });
});

describe('browser mock staging', () => {
  const firstGroupPatch = (patch: string, path: string, hunkIndex = 0) => {
    const file = parseDiff(patch).files.find((item) => getFilePath(item) === path)!;
    const hunk = file.hunks[hunkIndex];
    const group = getChangeGroups(hunk.lines)[0];
    return buildChangeGroupPatch(file, hunk, group.startIndex, group.endIndex);
  };
  const paths = (files: { path: string }[]) => files.map((file) => file.path);

  it('moves a hunk between Unstaged and Staged', () => {
    const mock = createStagingMock(() => {});
    expect(paths(mock.view('staged').files)).toEqual(['README.md', 'config.json']);
    expect(paths(mock.view('unstaged').files)).not.toContain('README.md');

    const unstaged = mock.view('unstaged');
    mock.handlers.stage_hunk({ patch: firstGroupPatch(unstaged.patch, 'src/server.ts', 1) });
    const staged = mock.view('staged');
    const server = staged.files.find((file) => file.path === 'src/server.ts')!;
    expect(server.additions).toBe(1);
    expect(staged.patch).toContain('@@ -15,6 +15,7 @@');
    expect(mock.view('unstaged').patch).toContain('@@ -2,12 +2,14 @@');
    expect(mock.view('unstaged').patch).toContain('@@ -26,7 +28,10 @@');
    expect(mock.counts().staged).toBe(3);

    mock.handlers.unstage_file({ path: 'src/server.ts' });
    expect(paths(mock.view('staged').files)).not.toContain('src/server.ts');
  });

  it('refuses to stage a hunk that is already staged, like git apply --cached', () => {
    const mock = createStagingMock(() => {});
    const patch = firstGroupPatch(mock.view('work').patch, 'README.md');
    expect(() => mock.handlers.stage_hunk({ patch })).toThrow();
  });

  it('discards only unstaged changes from the Unstaged view', () => {
    const mock = createStagingMock(() => {});
    mock.handlers.stage_hunk({ patch: firstGroupPatch(mock.view('unstaged').patch, 'src/utils/format.ts') });
    mock.handlers.revert_file({ path: 'src/utils/format.ts', ref: 'unstaged' });
    expect(paths(mock.view('unstaged').files)).not.toContain('src/utils/format.ts');
    expect(paths(mock.view('staged').files)).toContain('src/utils/format.ts');
    expect(() => mock.handlers.revert_file({ path: 'README.md', ref: 'staged' })).toThrow();
  });
});
