import type { ReactNode } from 'react';
import { ActionCloseIcon, ActionConfirmIcon } from '@icons/actions';
import { StatusAlertIcon } from '@icons/status';
import { Button } from '@/components/ui/button';

export function ConfirmActionDialog({
  open,
  title,
  description,
  confirmLabel,
  cancelLabel = 'Cancel',
  confirmVariant = 'destructive',
  hideCancel = false,
  isConfirmDisabled = false,
  isSubmitting = false,
  icon,
  iconTone = 'destructive',
  onCancel,
  onConfirm,
}: {
  open: boolean;
  title: string;
  description?: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  confirmVariant?: 'default' | 'destructive';
  hideCancel?: boolean;
  isConfirmDisabled?: boolean;
  isSubmitting?: boolean;
  icon?: ReactNode;
  iconTone?: 'default' | 'destructive' | 'success';
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
          <span
            className={`mt-0.5 rounded-full p-2 ${
              iconTone === 'success'
                ? 'border border-emerald-500/20 bg-emerald-500/10 text-emerald-700'
                : iconTone === 'default'
                  ? 'border border-border/70 bg-muted/50 text-foreground'
                  : 'border border-destructive/20 bg-destructive/10 text-destructive'
            }`}
          >
            {icon ?? (iconTone === 'success' ? <ActionConfirmIcon className="size-4" /> : <StatusAlertIcon className="size-4" />)}
          </span>
          <div className="min-w-0">
            <p className="text-lg font-semibold tracking-[-0.03em] text-foreground">{title}</p>
            {description ? (
              <div className="mt-2 text-sm leading-6 text-muted-foreground">{description}</div>
            ) : null}
          </div>
        </div>
        <div className="mt-6 flex flex-wrap justify-end gap-3">
          {hideCancel ? null : (
            <Button disabled={isSubmitting} type="button" variant="ghost" onClick={onCancel}>
              <ActionCloseIcon data-icon="inline-start" />
              {cancelLabel}
            </Button>
          )}
          <Button
            disabled={isConfirmDisabled || isSubmitting}
            type="button"
            variant={confirmVariant}
            onClick={onConfirm}
          >
            <ActionConfirmIcon data-icon="inline-start" />
            {isSubmitting ? 'Working…' : confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
