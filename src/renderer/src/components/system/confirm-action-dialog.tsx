import type { ReactNode } from 'react';
import { ActionCloseIcon, ActionConfirmIcon, ActionDeleteIcon } from '@icons/actions';
import { StatusAlertIcon } from '@icons/status';
import { Button } from '@/components/ui/button';

export function ConfirmActionDialog({
  open,
  title,
  description,
  confirmLabel,
  confirmIcon,
  cancelLabel = 'Cancel',
  destructiveActionLabel,
  confirmVariant = 'destructive',
  hideCancel = false,
  hideIcon = false,
  isDestructiveActionDisabled = false,
  isConfirmDisabled = false,
  isSubmitting = false,
  icon,
  iconTone = 'destructive',
  onCancel,
  onDestructiveAction,
  onConfirm,
}: {
  open: boolean;
  title: string;
  description?: ReactNode;
  confirmLabel: string;
  confirmIcon?: ReactNode;
  cancelLabel?: string;
  destructiveActionLabel?: string;
  confirmVariant?: 'default' | 'destructive';
  hideCancel?: boolean;
  hideIcon?: boolean;
  isDestructiveActionDisabled?: boolean;
  isConfirmDisabled?: boolean;
  isSubmitting?: boolean;
  icon?: ReactNode;
  iconTone?: 'default' | 'destructive' | 'success';
  onCancel: () => void;
  onDestructiveAction?: () => void;
  onConfirm: () => void;
}) {
  if (!open) {
    return null;
  }

  const hasDestructiveAction = Boolean(destructiveActionLabel && onDestructiveAction);
  const wrappedActionClassName = 'min-w-max flex-[1_0_max-content] justify-center';

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
        aria-label={title}
        aria-modal="true"
        className={`max-h-[calc(100dvh-2rem)] overflow-y-auto rounded-[1.75rem] border border-border/70 bg-background p-6 shadow-[0_24px_80px_rgba(0,0,0,0.18)] ${hasDestructiveAction ? 'w-full max-w-2xl' : 'w-full max-w-md'}`}
        role="dialog"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start gap-3">
          {hideIcon ? null : (
            <span
              className={`mt-0.5 rounded-full p-2 ${
                iconTone === 'success'
                  ? 'border border-emerald-500/20 bg-emerald-500/10 text-emerald-700'
                  : iconTone === 'default'
                    ? 'border border-border/70 bg-muted/50 text-foreground'
                    : 'border border-destructive/20 bg-destructive/10 text-destructive'
              }`}
              data-slot="confirm-action-dialog-icon"
            >
              {icon ?? (iconTone === 'success' ? <ActionConfirmIcon className="size-4" /> : <StatusAlertIcon className="size-4" />)}
            </span>
          )}
          <div className={hasDestructiveAction ? 'min-w-0 max-w-lg' : 'min-w-0'}>
            <p className="text-lg font-semibold tracking-[-0.03em] text-foreground">{title}</p>
            {description ? (
              <div className="mt-2 text-sm leading-6 text-muted-foreground">{description}</div>
            ) : null}
          </div>
        </div>
        <div
          className={hasDestructiveAction ? 'mt-6 flex flex-wrap items-center gap-3' : 'mt-6 flex flex-wrap justify-end gap-3'}
          data-slot="confirm-action-dialog-actions"
        >
          {hasDestructiveAction ? (
            <Button
              className={wrappedActionClassName}
              disabled={isDestructiveActionDisabled || isSubmitting}
              type="button"
              variant="destructive-outline"
              onClick={onDestructiveAction!}
            >
              <ActionDeleteIcon data-icon="inline-start" />
              {destructiveActionLabel}
            </Button>
          ) : null}
          {hideCancel ? null : (
            <Button
              className={hasDestructiveAction ? wrappedActionClassName : undefined}
              disabled={isSubmitting}
              type="button"
              variant="ghost"
              onClick={onCancel}
            >
              <ActionCloseIcon data-icon="inline-start" />
              {cancelLabel}
            </Button>
          )}
          <div className={hasDestructiveAction ? wrappedActionClassName : undefined}>
            <Button
              className={hasDestructiveAction ? 'w-full min-w-max justify-center' : 'min-w-0'}
              disabled={isConfirmDisabled || isSubmitting}
              type="button"
              variant={confirmVariant}
              onClick={onConfirm}
            >
              <span data-icon="inline-start" className="contents">
                {confirmIcon ?? <ActionConfirmIcon />}
              </span>
              {isSubmitting ? 'Working…' : confirmLabel}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
