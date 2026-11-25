import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { toast } from 'sonner';
import { cn } from '../../lib/cn';
import { errorMessage } from '../../lib/api';
import { modKey } from '../../lib/platform';
import { buttonClaudeSolid, buttonGhost, inputField } from '../../components/ui/button-styles';
import { ContextMenu, MenuItem, MenuSeparator } from '../../components/ui/popover';
import { GrowingTextarea } from '../../components/ui/growing-textarea';
import { PencilIcon, PlusIcon, TrashIcon, UndoIcon } from '../../components/ui/icon';
import { BUILT_IN_INSTRUCTIONS, REVIEW_FOCUSES, focusesForRepo, isBuiltIn, nameProblem, overrideFor, useCustomFocuses, type CustomFocus } from './review-focuses';

interface FocusChipsProps {
  repoPath: string;
  selected: string[];
  onSelectedChange: (selected: string[]) => void;
}

interface ChipMenu {
  name: string;
  x: number;
  y: number;
}

const chipClass = (active: boolean) =>
  cn(
    'h-6 px-2.5 rounded-full border text-xs transition-colors cursor-pointer select-none',
    active ? 'border-claude/40 bg-claude/12 text-claude font-medium' : 'border-control-border bg-raised text-text-secondary hover:text-text',
  );

/** The built-in focus chips and the user's own; + writes a new one, and right-click edits any of them. */
export function FocusChips(props: FocusChipsProps) {
  const { repoPath, selected, onSelectedChange } = props;
  const { all, upsert, remove } = useCustomFocuses();
  const shown = focusesForRepo(all, repoPath);
  const custom = shown.filter((focus) => !focus.builtIn);
  const [editing, setEditing] = useState<CustomFocus | null>(null);
  const [menu, setMenu] = useState<ChipMenu | null>(null);

  const toggle = (name: string) => {
    onSelectedChange(selected.includes(name) ? selected.filter((item) => item !== name) : [...selected, name]);
  };

  // A built-in chip opens as its own instructions, or the default ones until it's edited.
  const focusFor = (name: string): CustomFocus | null => {
    if (isBuiltIn(name)) {
      return overrideFor(shown, name) ?? { id: crypto.randomUUID(), name, instructions: BUILT_IN_INSTRUCTIONS[name], repoPath: null, builtIn: true };
    }
    return custom.find((focus) => focus.name === name) ?? null;
  };

  const failed = (what: string) => (error: unknown) => toast.error(`Could not ${what} the focus`, { description: errorMessage(error) });

  const save = (focus: CustomFocus) => {
    setEditing(null);
    if (focus.builtIn && isBuiltIn(focus.name) && focus.instructions === BUILT_IN_INSTRUCTIONS[focus.name]) {
      const existing = overrideFor(shown, focus.name);
      if (existing) {
        remove(existing.id).catch(failed('reset'));
      }
      return;
    }
    const previous = all.find((item) => item.id === focus.id)?.name ?? null;
    upsert(focus).then(() => {
      const rest = selected.filter((item) => item !== previous);
      onSelectedChange(rest.includes(focus.name) ? rest : [...rest, focus.name]);
    }, failed('save'));
  };

  const drop = (focus: CustomFocus) => {
    setEditing(null);
    if (!focus.builtIn) {
      onSelectedChange(selected.filter((item) => item !== focus.name));
    }
    remove(focus.id).catch(failed(focus.builtIn ? 'reset' : 'delete'));
  };

  const chip = (name: string, title: string) => {
    const active = selected.includes(name);
    return (
      <button
        key={name}
        type="button"
        aria-pressed={active}
        onClick={() => toggle(name)}
        onContextMenu={(event) => {
          event.preventDefault();
          setMenu({ name, x: event.clientX, y: event.clientY });
        }}
        title={`${title}\nRight-click to edit`}
        className={cn(chipClass(active), menu?.name === name && !active && 'bg-hover text-text')}
      >
        {name}
      </button>
    );
  };

  const menuFocus = menu ? focusFor(menu.name) : null;
  const menuSaved = !!menuFocus && all.some((item) => item.id === menuFocus.id);

  return (
    <>
      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Focus areas">
        {REVIEW_FOCUSES.map((name) => chip(name, overrideFor(shown, name)?.instructions ?? BUILT_IN_INSTRUCTIONS[name]))}
        {custom.map((focus) => chip(focus.name, focus.instructions))}
        <button
          type="button"
          onClick={() => setEditing({ id: crypto.randomUUID(), name: '', instructions: '', repoPath: null })}
          className={cn(chipClass(false), 'w-6 px-0 inline-flex items-center justify-center')}
          title="Add your own focus, such as a team checklist or a skill to use"
          aria-label="Add your own focus"
        >
          <PlusIcon className="w-3 h-3" />
        </button>
      </div>
      {menu && menuFocus && (
        <ContextMenu position={{ x: menu.x, y: menu.y }} onClose={() => setMenu(null)}>
          <MenuItem
            icon={<PencilIcon size="sm" />}
            label="Edit…"
            onSelect={() => {
              setMenu(null);
              setEditing(menuFocus);
            }}
          />
          {menuSaved && (
            <>
              <MenuSeparator />
              <MenuItem
                icon={menuFocus.builtIn ? <UndoIcon size="sm" /> : <TrashIcon size="sm" />}
                label={menuFocus.builtIn ? 'Reset to default' : 'Delete'}
                onSelect={() => {
                  setMenu(null);
                  drop(menuFocus);
                }}
              />
            </>
          )}
        </ContextMenu>
      )}
      {editing && (
        <FocusDialog
          key={editing.id}
          focus={editing}
          saved={all.some((item) => item.id === editing.id)}
          repoPath={repoPath}
          shown={shown}
          onSave={save}
          onDrop={() => drop(editing)}
          onCancel={() => setEditing(null)}
        />
      )}
    </>
  );
}

interface FocusDialogProps {
  focus: CustomFocus;
  /** Already stored: a custom focus being edited, or a built-in one edited before. */
  saved: boolean;
  repoPath: string;
  shown: CustomFocus[];
  onSave: (focus: CustomFocus) => void;
  /** Deletes a custom focus, or resets a built-in one to its default. */
  onDrop: () => void;
  onCancel: () => void;
}

function FocusDialog(props: FocusDialogProps) {
  const { focus, saved, repoPath, shown, onSave, onDrop, onCancel } = props;
  const builtIn = !!focus.builtIn;
  const [name, setName] = useState(focus.name);
  const [instructions, setInstructions] = useState(focus.instructions);
  const [thisRepo, setThisRepo] = useState(focus.repoPath !== null);
  const [touched, setTouched] = useState(false);
  const problem = (builtIn ? null : nameProblem(name, shown, focus.id)) ?? (instructions.trim() ? null : 'Say what the review should look for');

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopImmediatePropagation();
        onCancel();
      }
    };
    window.addEventListener('keydown', handleKey, true);
    return () => window.removeEventListener('keydown', handleKey, true);
  }, [onCancel]);

  const save = () => {
    setTouched(true);
    if (problem) {
      return;
    }
    onSave({ ...focus, name: builtIn ? focus.name : name.trim(), instructions: instructions.trim(), repoPath: thisRepo ? repoPath : null });
  };

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={onCancel}>
      <div
        role="dialog"
        aria-label={builtIn ? `Edit ${focus.name}` : saved ? `Edit ${focus.name}` : 'New focus'}
        className="flex flex-col gap-3 w-full max-w-md mx-4 p-5 rounded-xl bg-overlay ring-1 ring-overlay-border font-sans"
        onClick={(event) => event.stopPropagation()}
        onKeyDown={(event) => {
          const submit = event.key === 'Enter' && (event.metaKey || event.ctrlKey || event.target instanceof HTMLInputElement);
          if (submit) {
            event.preventDefault();
            save();
          }
        }}
      >
        <div>
          <h3 className="text-sm font-semibold text-text">{builtIn || saved ? `Edit ${focus.name}` : 'New review focus'}</h3>
          <p className="mt-0.5 text-xs leading-5 text-text-secondary">
            {builtIn ? 'What reviews look for when this chip is on.' : 'A chip next to the built-in ones. Its instructions go into the review when it’s on.'}
          </p>
        </div>
        {!builtIn && (
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Name, for example “Perf review”"
            maxLength={40}
            autoFocus
            autoComplete="off"
            spellCheck={false}
            aria-label="Focus name"
            className={inputField}
          />
        )}
        <GrowingTextarea
          value={instructions}
          onChange={(event) => setInstructions(event.target.value)}
          rows={4}
          autoFocus={builtIn}
          placeholder="What to look for, for example “Use the perf-review skill. Check allocations in hot paths.”"
          aria-label="Focus instructions"
          growTo={240}
          className={cn(inputField, 'h-auto py-2 leading-5 min-h-[92px]')}
        />
        {!builtIn && (
          <label className="inline-flex items-center gap-2 text-xs text-text-secondary cursor-pointer">
            <input type="checkbox" checked={thisRepo} onChange={(event) => setThisRepo(event.target.checked)} className="accent-claude cursor-pointer" />
            Only in this repository
          </label>
        )}
        <div className="flex items-center gap-2 pt-1">
          {saved && (
            <button type="button" onClick={onDrop} className={cn(buttonGhost, builtIn ? '' : 'text-deleted hover:text-deleted')}>
              {builtIn ? 'Reset to default' : 'Delete'}
            </button>
          )}
          <span className="min-w-0 flex-1 truncate text-xs text-deleted">{touched ? problem : null}</span>
          <button type="button" onClick={onCancel} className={buttonGhost}>
            Cancel
          </button>
          <button type="button" onClick={save} className={buttonClaudeSolid} title={`${modKey}↵`}>
            {builtIn || saved ? 'Save' : 'Add focus'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
