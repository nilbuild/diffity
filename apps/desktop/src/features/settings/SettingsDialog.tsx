export interface SettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function SettingsDialog(props: SettingsDialogProps) {
  const { open, onOpenChange } = props;
  if (!open) {
    return null;
  }
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => onOpenChange(false)}>
      <div className="w-[480px] rounded-lg border border-border bg-bg-elevated p-6" onClick={(e) => e.stopPropagation()}>
        Settings (TODO)
      </div>
    </div>
  );
}
