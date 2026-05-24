import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { ActionCloseIcon, ActionConfirmIcon, ActionDeleteIcon } from '@icons/actions';
import { StatusAlertIcon } from '@icons/status';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const contentFitActionClassName = 'min-w-max justify-center';
const wrappedActionClassName = 'min-w-max flex-[1_0_max-content] justify-center';

export function shouldFillWrappedConfirmActionRow({
  containerWidth,
  gap,
  itemWidths,
}: {
  containerWidth: number;
  gap: number;
  itemWidths: number[];
}) {
  if (containerWidth <= 0 || itemWidths.length <= 1) {
    return false;
  }
  const contentWidth = itemWidths.reduce((sum, width) => sum + width, 0) + gap * (itemWidths.length - 1);
  return contentWidth > containerWidth + 0.5;
}

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
  const actionsRef = useRef<HTMLDivElement | null>(null);
  const [actionsNeedRowFill, setActionsNeedRowFill] = useState(false);
  const hasDestructiveAction = Boolean(destructiveActionLabel && onDestructiveAction);

  useLayoutEffect(() => {
    if (!open || !hasDestructiveAction) {
      setActionsNeedRowFill(false);
      return;
    }

    const measureActions = () => {
      const actions = actionsRef.current;
      if (!actions) {
        return;
      }
      const actionItems = Array.from(actions.querySelectorAll<HTMLElement>('[data-slot="confirm-action-dialog-action-item"]'));
      const gap = Number.parseFloat(window.getComputedStyle(actions).columnGap || '0') || 0;
      setActionsNeedRowFill(
        shouldFillWrappedConfirmActionRow({
          containerWidth: actions.clientWidth,
          gap,
          itemWidths: actionItems.map((item) => item.scrollWidth),
        }),
      );
    };

    let measureFrame: number | null = null;
    const scheduleNaturalWidthMeasure = () => {
      setActionsNeedRowFill(false);
      if (measureFrame !== null) {
        window.cancelAnimationFrame(measureFrame);
      }
      measureFrame = window.requestAnimationFrame(() => {
        measureFrame = null;
        measureActions();
      });
    };

    measureActions();
    const resizeObserver = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(scheduleNaturalWidthMeasure);
    if (resizeObserver && actionsRef.current) {
      resizeObserver.observe(actionsRef.current);
    }
    window.addEventListener('resize', scheduleNaturalWidthMeasure);
    return () => {
      if (measureFrame !== null) {
        window.cancelAnimationFrame(measureFrame);
      }
      resizeObserver?.disconnect();
      window.removeEventListener('resize', scheduleNaturalWidthMeasure);
    };
  }, [hasDestructiveAction, open, destructiveActionLabel, cancelLabel, confirmLabel]);

  if (!open) {
    return null;
  }

  const actionClassName = actionsNeedRowFill ? wrappedActionClassName : contentFitActionClassName;
  const actionsClassName = hasDestructiveAction
    ? 'mt-6 flex flex-wrap items-center gap-3'
    : 'mt-6 flex flex-wrap justify-end gap-3';

  return (
    <div
      className="pointer-events-auto fixed inset-0 z-[130] flex items-center justify-center bg-black/30 px-4 py-6 backdrop-blur-none"
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
        className="max-h-[calc(100dvh-2rem)] w-full max-w-md overflow-y-auto rounded-[1.75rem] border border-border/70 bg-background p-6 shadow-[0_24px_80px_rgba(0,0,0,0.18)]"
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
          ref={actionsRef}
          className={actionsClassName}
          data-slot="confirm-action-dialog-actions"
        >
          {hasDestructiveAction ? (
            <div className={cn(actionClassName, !actionsNeedRowFill && 'mr-auto')} data-slot="confirm-action-dialog-action-item">
              <Button
                className={cn('min-w-max justify-center', actionsNeedRowFill && 'w-full')}
                disabled={isDestructiveActionDisabled || isSubmitting}
                type="button"
                variant="destructive-outline"
                onClick={onDestructiveAction!}
              >
                <ActionDeleteIcon data-icon="inline-start" />
                {destructiveActionLabel}
              </Button>
            </div>
          ) : null}
          {hideCancel ? null : (
            hasDestructiveAction ? (
              <div className={actionClassName} data-slot="confirm-action-dialog-action-item">
                <Button
                  className={cn('min-w-max justify-center', actionsNeedRowFill && 'w-full')}
                  disabled={isSubmitting}
                  type="button"
                  variant="ghost"
                  onClick={onCancel}
                >
                  <ActionCloseIcon data-icon="inline-start" />
                  {cancelLabel}
                </Button>
              </div>
            ) : (
              <Button disabled={isSubmitting} type="button" variant="ghost" onClick={onCancel}>
                <ActionCloseIcon data-icon="inline-start" />
                {cancelLabel}
              </Button>
            )
          )}
          {hasDestructiveAction ? (
            <div className={actionClassName} data-slot="confirm-action-dialog-action-item">
              <Button
                className={cn('min-w-max justify-center', actionsNeedRowFill && 'w-full')}
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
          ) : (
            <Button
              className="min-w-0"
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
          )}
        </div>
      </div>
    </div>
  );
}
