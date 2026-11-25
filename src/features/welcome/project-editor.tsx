import { useRef, useState } from 'react';
import { create } from 'zustand';
import { Popover } from '../../components/ui/popover';
import { buttonOutline } from '../../components/ui/button-styles';
import { cn } from '../../lib/cn';
import { shortPath } from './recent-repos';
import { useProjectInitials } from './repo-badge';
import { ColorSwatches } from './color-swatches';
import { colorStyle, setProjectColor, useProjectColor } from './project-colors';
import { setLogoShown, useProjectLogo } from './project-icons';
import { setProjectEmoji, useProjectEmoji } from './project-emojis';
import { EmojiGrid, type IconChoice } from './emoji-grid';

interface EditorState {
  path: string | null;
  at: { x: number; y: number } | null;
}

const useProjectEditor = create<EditorState>(() => ({ path: null, at: null }));

/** Opens the editor beside a project's rail tile. */
export function openProjectEditorAt(path: string, element: HTMLElement) {
  const rect = element.getBoundingClientRect();
  useProjectEditor.setState({ path, at: { x: rect.right + 8, y: rect.top - 6 } });
}

export function useProjectEditorPath(): string | null {
  return useProjectEditor((state) => state.path);
}

function closeProjectEditor() {
  useProjectEditor.setState({ path: null, at: null });
}

export function ProjectEditorHost() {
  const path = useProjectEditor((state) => state.path);
  const at = useProjectEditor((state) => state.at);
  const anchorRef = useRef<HTMLSpanElement>(null);

  return (
    <>
      {at && <span ref={anchorRef} aria-hidden className="fixed w-0 h-0 pointer-events-none" style={{ left: at.x, top: at.y }} />}
      <Popover open={!!path && !!at} onClose={closeProjectEditor} anchorRef={anchorRef} width={320} className="p-0">
        {path && <ProjectEditor key={path} path={path} />}
      </Popover>
    </>
  );
}

function ProjectEditor(props: { path: string }) {
  const { path } = props;
  const name = path.split('/').filter(Boolean).pop() ?? 'project';

  return (
    <div className="flex flex-col gap-3 p-3">
      <div className="flex flex-col gap-0.5 min-w-0">
        <span className="text-[13px] font-medium text-text truncate">{name}</span>
        <span className="text-xs text-text-muted truncate" title={path}>{shortPath(path)}</span>
      </div>
      <ProjectLook path={path} name={name} />
      <div className="flex items-center pt-2 border-t border-border">
        <span className="flex-1" />
        <button type="button" onClick={closeProjectEditor} className={buttonOutline}>
          Done
        </button>
      </div>
    </div>
  );
}

/** The project's icon (initials, logo or an emoji) and colour, as they show on the rail. */
function ProjectLook(props: { path: string; name: string }) {
  const { path, name } = props;
  const [picking, setPicking] = useState(false);
  const emoji = useProjectEmoji(path);
  const color = useProjectColor(path);
  const initials = useProjectInitials(name);
  const { logo, fill, shown } = useProjectLogo(path);
  const showLogo = !!logo && shown && !emoji;
  const filled = showLogo && fill;

  const pick = (look: { emoji: string; logo?: boolean }) => {
    setProjectEmoji(path, look.emoji);
    if (logo && look.logo !== undefined) {
      setLogoShown(path, look.logo);
    }
    setPicking(false);
  };

  const choices: IconChoice[] = [
    { key: 'initials', label: initials, title: 'Initials', selected: !emoji && !showLogo, onPick: () => pick({ emoji: '', logo: false }) },
  ];
  if (logo) {
    choices.push({
      key: 'logo',
      label: <img alt="" src={logo} decoding="sync" className={cn('w-[18px] h-[18px]', fill ? 'rounded-[5px] object-cover' : 'object-contain')} />,
      title: 'Project logo',
      selected: showLogo,
      onPick: () => pick({ emoji: '', logo: true }),
    });
  }

  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs font-medium text-text-secondary">Icon and colour</span>
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => setPicking((value) => !value)}
          aria-expanded={picking}
          aria-label="Choose an icon"
          title="Choose an icon"
          style={colorStyle(color)}
          className={cn('relative w-9 h-9 shrink-0 rounded-[10px] flex items-center justify-center cursor-pointer', !filled && 'project-tint hover:project-tint-strong', picking && 'ring-2 ring-focus')}
        >
          {emoji && <span className="text-[18px] leading-none">{emoji}</span>}
          {showLogo && <img alt="" src={logo} decoding="sync" className={filled ? 'absolute inset-0 w-full h-full rounded-[inherit] object-cover' : 'w-6 h-6 object-contain'} />}
          {!emoji && !showLogo && <span className="text-[12px] font-semibold">{initials}</span>}
        </button>
        <ColorSwatches value={color.id} onPick={(id) => setProjectColor(path, id)} className="flex-1" />
      </div>
      {picking && <EmojiGrid value={emoji} choices={choices} onPick={(value) => pick({ emoji: value })} className="mt-1 p-1 rounded-lg bg-hover" />}
    </div>
  );
}
