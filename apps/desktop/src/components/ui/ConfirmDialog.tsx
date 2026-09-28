import { useEffect, useRef } from 'react';
import { create } from 'zustand';
import { Button } from './Button';
import { Dialog } from './Dialog';

interface ConfirmRequest {
  title: string;
  message: string;
  confirmLabel?: string;
  danger?: boolean;
  resolve: (ok: boolean) => void;
}

const useConfirmStore = create<{ request: ConfirmRequest | null }>(() => ({ request: null }));

export function confirmDialog(options: Omit<ConfirmRequest, 'resolve'>): Promise<boolean> {
  return new Promise((resolve) => {
    useConfirmStore.setState({ request: { ...options, resolve } });
  });
}

export function ConfirmDialogHost() {
  const request = useConfirmStore((s) => s.request);
  const confirmRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!request) {
      return;
    }
    confirmRef.current?.focus();
  }, [request]);

  const close = (ok: boolean) => {
    request?.resolve(ok);
    useConfirmStore.setState({ request: null });
  };

  return (
    <Dialog
      open={request !== null}
      onOpenChange={(open) => {
        if (!open) {
          close(false);
        }
      }}
      title={request?.title}
      footer={
        <>
          <Button onClick={() => close(false)}>Cancel</Button>
          <Button ref={confirmRef} variant={request?.danger ? 'danger' : 'primary'} onClick={() => close(true)}>
            {request?.confirmLabel ?? 'Confirm'}
          </Button>
        </>
      }
    >
      <p className="text-sm text-fg-muted">{request?.message}</p>
    </Dialog>
  );
}
