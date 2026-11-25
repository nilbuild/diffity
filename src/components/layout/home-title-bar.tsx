import { useTheme } from '../../hooks/use-theme';
import { CommentsButton } from '../../features/comments/comments-button';
import { ClaudeStatus } from '../../features/claude/claude-toolbar';
import { Breadcrumb, CurrentCrumb, TitleBar } from './title-bar';
import { OptionsMenu } from './options-menu';

/** Home's title bar; also drawn while Home loads, so the chrome doesn't change when the content arrives. */
export function HomeTitleBar(props: { name: string | null | undefined }) {
  const { name } = props;
  const { theme, toggleTheme } = useTheme();

  return (
    <TitleBar sidebarToggle={false}>
      <div data-tauri-drag-region className="flex items-center gap-2.5 min-w-0 shrink">
        <Breadcrumb name={name}>
          <CurrentCrumb>Home</CurrentCrumb>
        </Breadcrumb>
      </div>
      <div data-tauri-drag-region className="flex-1 min-w-2 self-stretch" />
      <div className="flex items-center gap-2 shrink-0">
        <ClaudeStatus />
        <CommentsButton />
        <OptionsMenu theme={theme} onToggleTheme={toggleTheme} />
      </div>
    </TitleBar>
  );
}
