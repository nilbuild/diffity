import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { create } from 'zustand';
import { toast } from 'sonner';
import { openUrl } from '@tauri-apps/plugin-opener';
import * as tauri from '../../lib/tauri';
import { isTauri } from '../../lib/platform';
import { buttonGhost, buttonPrimary, inputField } from '../../components/ui/button-styles';
import { SegmentedToggle } from '../../components/ui/segmented-toggle';
import { GrowingTextarea } from '../../components/ui/growing-textarea';
import { cn } from '../../lib/cn';
import { chord } from '../../lib/shortcuts';
import { feedbackUrl, REPO_URL, type FeedbackKind } from './feedback';

const useFeedbackDialog = create<{ open: boolean; kind: FeedbackKind }>(() => ({ open: false, kind: 'idea' }));

export function openFeedback(kind: FeedbackKind = 'idea') {
  useFeedbackDialog.setState({ open: true, kind });
}

/** Opens Diffity's GitHub page, where the star button is. */
export function openRepoPage() {
  if (!isTauri) {
    window.open(REPO_URL, '_blank', 'noopener');
    return;
  }
  openUrl(REPO_URL).catch((error) => toast.error('Could not open GitHub', { description: tauri.errorMessage(error) }));
}

function closeFeedback() {
  useFeedbackDialog.setState({ open: false });
}

export function FeedbackDialog() {
  const open = useFeedbackDialog((state) => state.open);
  const kind = useFeedbackDialog((state) => state.kind);

  if (!open) {
    return null;
  }
  return <FeedbackDialogBody initialKind={kind} />;
}

const PLACEHOLDERS: Record<FeedbackKind, string> = {
  idea: 'What would make Diffity better for you?',
  bug: 'What happened, and what did you expect?',
};

function FeedbackDialogBody(props: { initialKind: FeedbackKind }) {
  const { initialKind } = props;
  const [kind, setKind] = useState<FeedbackKind>(initialKind);
  const [text, setText] = useState('');
  const textRef = useRef<HTMLTextAreaElement>(null);
  const empty = text.trim().length === 0;

  useEffect(() => {
    textRef.current?.focus();
    const handler = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        closeFeedback();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const send = async () => {
    if (empty) {
      return;
    }
    try {
      if (isTauri) {
        await tauri.sendFeedback(kind, text);
      } else {
        window.open(feedbackUrl(kind, text), '_blank', 'noopener');
      }
      toast.success('Opened GitHub', { description: 'Submit the issue there to send it.' });
      closeFeedback();
    } catch (error) {
      toast.error('Could not open GitHub', { description: tauri.errorMessage(error) });
    }
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/45 p-6 font-sans"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          closeFeedback();
        }
      }}
    >
      <form
        aria-label="Send feedback"
        className="flex w-[480px] max-w-full flex-col gap-4 rounded-xl border border-overlay-border bg-overlay p-5 animate-fade-in"
        onSubmit={(event) => {
          event.preventDefault();
          void send();
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
            event.preventDefault();
            void send();
          }
        }}
      >
        <div className="flex flex-col gap-1">
          <h3 className="text-[15px] font-semibold text-text">Send feedback</h3>
          <p className="text-[13px] text-text-secondary">It becomes a GitHub issue. Every one gets read.</p>
        </div>
        <div className="self-start">
          <SegmentedToggle
            options={[
              { value: 'idea', label: 'Idea' },
              { value: 'bug', label: 'Bug' },
            ]}
            value={kind}
            onChange={setKind}
          />
        </div>
        <GrowingTextarea
          ref={textRef}
          value={text}
          onChange={(event) => setText(event.target.value)}
          rows={5}
          growTo={280}
          placeholder={PLACEHOLDERS[kind]}
          aria-label={PLACEHOLDERS[kind]}
          className={cn(inputField, 'h-auto py-2 leading-5')}
        />
        <div className="flex items-center gap-2">
          <span className="mr-auto min-w-0 truncate text-xs text-text-muted">
            {kind === 'bug' ? 'Adds the app and OS versions' : 'Opens in your browser'}
          </span>
          <button type="button" onClick={closeFeedback} className={buttonGhost}>Cancel</button>
          <button type="submit" disabled={empty} className={buttonPrimary} title={chord('↵')}>Continue on GitHub</button>
        </div>
      </form>
    </div>,
    document.body,
  );
}
