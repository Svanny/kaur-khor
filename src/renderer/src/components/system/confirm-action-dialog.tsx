import type { ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function ConfirmActionDialog({
  open,
  title,
  description,
  confirmLabel,
  cancelLabel = 'Cancel',
  confirmVariant = 'destructive',
  isConfirmDisabled = false,
  isSubmitting = false,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  title: string;
  description?: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  confirmVariant?: 'default' | 'destructive';
  isConfirmDisabled?: boolean;
  isSubmitting?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  if (!open) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/30 px-4 py-6"
      role="presentation"
      onClick={() => {
        if (!isSubmitting) {
          onCancel();
        }
      }}
    >
      <div
        aria-modal="true"
        className="w-full max-w-md rounded-[1.75rem] border border-border/70 bg-background p-6 shadow-[0_24px_80px_rgba(0,0,0,0.18)]"
        role="dialog"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start gap-3">
          <span className="mt-0.5 rounded-full border border-destructive/20 bg-destructive/10 p-2 text-destructive">
            <AlertTriangle className="size-4" />
          </span>
          <div className="min-w-0">
            <p className="text-lg font-semibold tracking-[-0.03em] text-foreground">{title}</p>
            {description ? (
              <div className="mt-2 text-sm leading-6 text-muted-foreground">{description}</div>
            ) : null}
          </div>
        </div>
        <div className="mt-6 flex flex-wrap justify-end gap-3">
          <Button disabled={isSubmitting} type="button" variant="ghost" onClick={onCancel}>
            {cancelLabel}
          </Button>
          <Button
            disabled={isConfirmDisabled || isSubmitting}
            type="button"
            variant={confirmVariant}
            onClick={onConfirm}
          >
            {isSubmitting ? 'Working…' : confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
