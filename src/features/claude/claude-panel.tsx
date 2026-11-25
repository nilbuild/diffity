import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import * as tauri from '../../lib/tauri';
import { goToThread } from '../../lib/thread-location';
import { useRepoPath } from '../../hooks/use-repo';
import { useCurrentViewRef } from '../../hooks/use-current-view';
import { Spinner } from '../../components/icons/spinner';
import { buttonIcon } from '../../components/ui/button-styles';
import { ArrowLeftIcon, HistoryIcon, PlusIcon, SparkleIcon, XIcon } from '../../components/ui/icon';
import { agentMeta } from './agents';
import { runLabel, runViewLabel, showRun, useRunningRuns } from './claude-runner';
import { ChatComposer } from './chat-composer';
import { ChatStream } from './chat-stream';
import { addChip, focusComposer } from './composer-state';
import { continueConversation, isConversation, sameView, startNewConversation } from './conversation';
import { useRunPick } from './model-setting';
import { closeClaudeCard, closeClaudePanel, openClaudeHistory, openClaudePanel, showRunDetails, usePanel } from './panel-store';
import { HistoryList, RunView, useRepoChats } from './run-details';
import { chipFromSelection } from './selection-chip';

/** Docked beside the page: chat with the agent about the view, and what its runs here did. */
export function ClaudePanel() {
  const open = usePanel((state) => state.open);
  useChatShortcut();
  if (!open) {
    return null;
  }
  return <ClaudePanelBody />;
}

/** ⌘L opens the panel and puts the cursor in the message box, bringing the diff lines selected along. */
function useChatShortcut() {
  const repoPath = useRepoPath();
  const viewRef = useCurrentViewRef();

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.shiftKey || event.altKey || event.key.toLowerCase() !== 'l') {
        return;
      }
      event.preventDefault();
      const chip = viewRef ? chipFromSelection() : null;
      if (chip) {
        addChip(repoPath, viewRef, chip);
        window.getSelection()?.removeAllRanges();
      }
      if (!usePanel.getState().open) {
        openClaudePanel();
      }
      closeClaudeCard();
      focusComposer();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [repoPath, viewRef]);
}

function useViewChats(repoPath: string, viewRef: string | null) {
  return useQuery({
    queryKey: ['chats', repoPath, viewRef],
    queryFn: () => tauri.listChats(repoPath, viewRef ?? undefined),
    enabled: !!viewRef,
  });
}

/** A conversation picked in History opens in its own view, ready to continue; other runs open in full. */
function useOpenPickedChat(repoPath: string, viewRef: string | null) {
  const details = usePanel((state) => state.details);
  const { data: chats = [] } = useRepoChats(repoPath);
  const picked = details ? chats.find((chat) => chat.id === details) ?? null : null;
  const conversation = !!picked && isConversation(picked);

  useEffect(() => {
    if (!picked || !conversation) {
      return;
    }
    const ref = picked.ref ?? viewRef;
    if (ref && !sameView(ref, viewRef)) {
      goToThread(repoPath, { ref, threadId: null });
    }
    continueConversation(repoPath, ref, picked);
    showRunDetails(null);
  }, [picked, conversation, repoPath, viewRef]);

  return details && !conversation ? details : null;
}

function ClaudePanelBody() {
  const repoPath = useRepoPath();
  const viewRef = useCurrentViewRef();
  const history = usePanel((state) => state.history);
  const details = useOpenPickedChat(repoPath, viewRef);
  const { data: chats = [] } = useViewChats(repoPath, viewRef);
  const agent = agentMeta(useRunPick('fix', repoPath).agent);
  const showDetails = !history && !!details;
  const showChat = !history && !details;
  const back = history || showDetails;

  return (
    <aside className="flex flex-col w-[420px] max-w-[45vw] shrink-0 h-screen bg-bg border-l border-frame-border font-sans text-xs text-text animate-slide-in-right" aria-label="Chat panel">
      <div data-tauri-drag-region className="flex items-center gap-1 h-[45px] shrink-0 pl-2 pr-2 bg-frame border-b border-frame-border">
        {back ? (
          <button type="button" onClick={() => showRunDetails(null)} className={buttonIcon} aria-label="Back to the chat" title="Back">
            <ArrowLeftIcon size="sm" />
          </button>
        ) : (
          <span className="flex items-center justify-center w-7 h-7">
            <SparkleIcon size="md" className="text-claude" />
          </span>
        )}
        <span className="text-[13px] font-semibold">{history ? 'History' : 'Chat'}</span>
        {!history && viewRef && <span className="min-w-0 truncate text-[13px] text-text-muted">· {runViewLabel(repoPath, viewRef)}</span>}
        <span data-tauri-drag-region className="flex-1 self-stretch" />
        {showChat && viewRef && (
          <button
            type="button"
            onClick={() => {
              startNewConversation(repoPath, viewRef);
              focusComposer();
            }}
            className={buttonIcon}
            aria-label="New chat"
            title="New chat"
          >
            <PlusIcon size="sm" />
          </button>
        )}
        {!history && (
          <button type="button" onClick={openClaudeHistory} className={buttonIcon} aria-label="History" title="History">
            <HistoryIcon size="sm" />
          </button>
        )}
        <button type="button" onClick={closeClaudePanel} className={buttonIcon} aria-label="Close" title="Close">
          <XIcon size="sm" />
        </button>
      </div>

      {history && <HistoryList repoPath={repoPath} currentKey={details} />}
      {showDetails && <RunView repoPath={repoPath} selected={details} />}
      {showChat && !viewRef && <RunView repoPath={repoPath} selected={null} />}
      {showChat && viewRef && (
        <>
          <ElsewhereBanner repoPath={repoPath} viewRef={viewRef} />
          <ChatStream repoPath={repoPath} viewRef={viewRef} chats={chats} agentName={agent.short} />
          <ChatComposer repoPath={repoPath} viewRef={viewRef} />
        </>
      )}
    </aside>
  );
}

/** Runs going in other views of the project, which this view's chat would otherwise say nothing about. */
function ElsewhereBanner(props: { repoPath: string; viewRef: string }) {
  const { repoPath, viewRef } = props;
  const runs = useRunningRuns(repoPath).filter((run) => !!run.ref && !sameView(run.ref, viewRef));

  if (runs.length === 0) {
    return null;
  }
  return (
    <div className="flex flex-col shrink-0 mx-3 mt-3 rounded-lg border border-border bg-bg-secondary divide-y divide-border-muted">
      {runs.map((run) => {
        const ref = run.ref ?? 'work';
        return (
          <div key={run.id} className="flex items-center gap-2 px-3 py-2">
            <Spinner className="text-claude" />
            <span className="flex-1 min-w-0 truncate text-text-secondary">
              {runLabel(run.action, agentMeta(run.agentId ?? 'claude').short, !!run.context.conversation)} in {runViewLabel(repoPath, ref)}
            </span>
            <button type="button" onClick={() => showRun(run)} className="shrink-0 text-text hover:underline cursor-pointer">
              Go there
            </button>
          </div>
        );
      })}
    </div>
  );
}
