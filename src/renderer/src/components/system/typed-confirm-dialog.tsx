import type { ReactNode } from 'react';
import { ActionCloseIcon, ActionConfirmIcon } from '@icons/actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export function TypedConfirmDialog({
  open,
  title,
  description,
  confirmationToken,
  value,
  confirmLabel,
  cancelLabel,
  isConfirmDisabled,
  isSubmitting,
  onValueChange,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  title: string;
  description?: ReactNode;
  confirmationToken: string;
  value: string;
  confirmLabel: string;
  cancelLabel: string;
  isConfirmDisabled?: boolean;
  isSubmitting?: boolean;
  onValueChange: (value: string) => void;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  if (!open) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4 py-6"
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
        <p className="text-lg font-semibold tracking-[-0.03em] text-foreground">{title}</p>
        {description ? (
          <div className="mt-3 text-sm leading-6 text-muted-foreground">{description}</div>
        ) : null}
        <Input
          aria-label="Deletion confirmation token"
          autoFocus
          className="mt-5"
          placeholder={confirmationToken}
          value={value}
          onChange={(event) => onValueChange(event.target.value)}
        />
        <div className="mt-5 flex justify-end gap-3">
          <Button type="button" variant="ghost" onClick={onCancel}>
            <ActionCloseIcon data-icon="inline-start" />
            {cancelLabel}
          </Button>
          <Button
            disabled={isConfirmDisabled || isSubmitting}
            type="button"
            variant="destructive"
            onClick={onConfirm}
          >
            <ActionConfirmIcon data-icon="inline-start" />
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
