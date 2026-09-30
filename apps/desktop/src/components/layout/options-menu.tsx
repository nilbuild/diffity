import { useState, useRef, type ReactNode } from 'react';
import { Popover } from '../ui/popover';
import { useNavigate } from 'react-router';
import { openSettings, openShortcuts } from '../../lib/ui-store';
import { modKey } from '../../lib/platform';
import { buttonIconOutline } from '../ui/button-styles';
import { EllipsisIcon, FolderOpenIcon, GitHubIcon, KeyboardIcon, MoonIcon, SettingsIcon, SunIcon } from '../ui/icon';

export const menuItemClass = 'flex items-center gap-2.5 w-full h-8 px-2.5 rounded-md text-[13px] text-text hover:bg-hover transition-colors cursor-pointer text-left [&>svg]:text-text-secondary';

interface OptionsMenuProps {
  theme: 'light' | 'dark';
  onToggleTheme: () => void;
  renderExtraItems?: (close: () => void) => ReactNode;
  onShowHelp?: () => void;
}

export function OptionsMenu(props: OptionsMenuProps) {
  const { theme, onToggleTheme, renderExtraItems, onShowHelp } = props;
  const [showMenu, setShowMenu] = useState(false);
  const navigate = useNavigate();
  const menuRef = useRef<HTMLDivElement>(null);

  const close = () => setShowMenu(false);

  return (
    <div className="relative" ref={menuRef}>
      <button
        className={buttonIconOutline}
        onClick={() => setShowMenu(!showMenu)}
        title="More: shortcuts, theme, settings"
      >
        <EllipsisIcon size="md" />
      </button>
      <Popover open={showMenu} onClose={close} anchorRef={menuRef} align="end" width={248}>
        <>
          {renderExtraItems && renderExtraItems(close)}
          <button
            className={menuItemClass}
            onClick={() => {
              close();
              (onShowHelp ?? openShortcuts)();
            }}
          >
            <KeyboardIcon className="w-3.5 h-3.5" />
            Keyboard shortcuts
            <span className="ml-auto text-text-muted">?</span>
          </button>
          <button
            className={menuItemClass}
            onClick={() => {
              onToggleTheme();
              close();
            }}
          >
            {theme === 'light' ? <MoonIcon className="w-3.5 h-3.5" /> : <SunIcon className="w-3.5 h-3.5" />}
            {theme === 'light' ? 'Dark mode' : 'Light mode'}
          </button>
          <button
            className={menuItemClass}
            onClick={() => {
              close();
              openSettings();
            }}
          >
            <SettingsIcon className="w-3.5 h-3.5" />
            Settings…
            <span className="ml-auto text-text-muted">{modKey},</span>
          </button>
          <div className="border-t border-overlay-border my-1 -mx-1" />
          <button
            className={menuItemClass}
            onClick={() => {
              close();
              navigate('/');
            }}
          >
            <FolderOpenIcon className="w-3.5 h-3.5" />
            Open another repository…
          </button>
          <a
            href="https://github.com/kamranahmedse/diffity"
            target="_blank"
            rel="noopener noreferrer"
            className={menuItemClass}
            onClick={close}
          >
            <GitHubIcon className="w-3.5 h-3.5" />
            About Diffity
          </a>
        </>
      </Popover>
    </div>
  );
}
