import { useState, useEffect } from 'react';
import { Dialog as DialogPrimitive } from 'radix-ui';
import { ActionCloseIcon, ActionConfirmIcon, ActionResetIcon } from '@icons/actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { translateUiLiteral } from '@/lib/translations';
import { dateInputValueFromIsoString, isoStringFromDateInput } from '@/lib/date-input-utils';
import type { AppLanguage } from '@/lib/translations';

export interface CustomTimeframeDialogProps {
  language: AppLanguage;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentStart: string | null;
  currentEnd: string | null;
  previousStart: string | null;
  previousEnd: string | null;
  compareMode: boolean;
  onApply: (currentStart: string, currentEnd: string, previousStart: string | null, previousEnd: string | null) => void;
  onClear: () => void;
}

export function CustomTimeframeDialog({
  language,
  open,
  onOpenChange,
  currentStart,
  currentEnd,
  previousStart,
  previousEnd,
  compareMode,
  onApply,
  onClear,
}: CustomTimeframeDialogProps) {
  const [draftCurrentStart, setDraftCurrentStart] = useState('');
  const [draftCurrentEnd, setDraftCurrentEnd] = useState('');
  const [draftPreviousStart, setDraftPreviousStart] = useState('');
  const [draftPreviousEnd, setDraftPreviousEnd] = useState('');

  useEffect(() => {
    if (open) {
      setDraftCurrentStart(dateInputValueFromIsoString(currentStart));
      setDraftCurrentEnd(dateInputValueFromIsoString(currentEnd));
      setDraftPreviousStart(dateInputValueFromIsoString(previousStart));
      setDraftPreviousEnd(dateInputValueFromIsoString(previousEnd));
    }
  }, [open, currentStart, currentEnd, previousStart, previousEnd]);

  function handleApply() {
    const start = isoStringFromDateInput(draftCurrentStart, 'start');
    const end = isoStringFromDateInput(draftCurrentEnd, 'end');
    if (!start || !end || draftCurrentStart > draftCurrentEnd) {
      return;
    }
    let prevStart: string | null = null;
    let prevEnd: string | null = null;
    if (compareMode) {
      prevStart = isoStringFromDateInput(draftPreviousStart, 'start');
      prevEnd = isoStringFromDateInput(draftPreviousEnd, 'end');
      if (!prevStart || !prevEnd || draftPreviousStart > draftPreviousEnd) {
        return;
      }
    }
    onApply(start, end, prevStart, prevEnd);
    onOpenChange(false);
  }

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-[100] bg-black/30 data-[state=open]:animate-in data-[state=open]:fade-in-0" />
        <DialogPrimitive.Content className="fixed left-1/2 top-1/2 z-[110] w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-[1.75rem] border border-border/70 bg-background p-6 shadow-[0_24px_80px_rgba(0,0,0,0.18)]">
          <DialogPrimitive.Title className="text-lg font-semibold tracking-[-0.03em] text-foreground">
            {translateUiLiteral(language, 'Custom timeframe')}
          </DialogPrimitive.Title>
          <DialogPrimitive.Description className="mt-3 text-sm leading-6 text-muted-foreground">
            {translateUiLiteral(language, 'Choose a start and end date for this window.')}
          </DialogPrimitive.Description>
          <div className="mt-5 grid gap-4">
            <div className="text-sm font-medium text-foreground">
              {translateUiLiteral(language, 'Current interval')}
            </div>
            <label className="grid gap-2 text-sm font-medium text-foreground">
              <span>{translateUiLiteral(language, 'Start date')}</span>
              <Input
                aria-label={translateUiLiteral(language, 'Custom timeframe start date')}
                className="h-11 rounded-[1rem] bg-background px-4"
                max={draftCurrentEnd || undefined}
                type="date"
                value={draftCurrentStart}
                onChange={(event) => setDraftCurrentStart(event.currentTarget.value)}
              />
            </label>
            <label className="grid gap-2 text-sm font-medium text-foreground">
              <span>{translateUiLiteral(language, 'End date')}</span>
              <Input
                aria-label={translateUiLiteral(language, 'Custom timeframe end date')}
                className="h-11 rounded-[1rem] bg-background px-4"
                min={draftCurrentStart || undefined}
                type="date"
                value={draftCurrentEnd}
                onChange={(event) => setDraftCurrentEnd(event.currentTarget.value)}
              />
            </label>
            {compareMode ? (
              <>
                <div className="text-sm font-medium text-foreground pt-2 border-t border-border/50">
                  {translateUiLiteral(language, 'Previous interval')}
                </div>
                <label className="grid gap-2 text-sm font-medium text-foreground">
                  <span>{translateUiLiteral(language, 'Start date')}</span>
                  <Input
                    aria-label={translateUiLiteral(language, 'Previous interval start date')}
                    className="h-11 rounded-[1rem] bg-background px-4"
                    max={draftPreviousEnd || undefined}
                    type="date"
                    value={draftPreviousStart}
                    onChange={(event) => setDraftPreviousStart(event.currentTarget.value)}
                  />
                </label>
                <label className="grid gap-2 text-sm font-medium text-foreground">
                  <span>{translateUiLiteral(language, 'End date')}</span>
                  <Input
                    aria-label={translateUiLiteral(language, 'Previous interval end date')}
                    className="h-11 rounded-[1rem] bg-background px-4"
                    min={draftPreviousStart || undefined}
                    type="date"
                    value={draftPreviousEnd}
                    onChange={(event) => setDraftPreviousEnd(event.currentTarget.value)}
                  />
                </label>
              </>
            ) : null}
          </div>
          <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
            <Button type="button" variant="ghost" onClick={onClear}>
              <ActionResetIcon data-icon="inline-start" />
              {translateUiLiteral(language, 'Clear')}
            </Button>
            <div className="flex flex-wrap items-center justify-end gap-3">
              <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
                <ActionCloseIcon data-icon="inline-start" />
                {translateUiLiteral(language, 'Cancel')}
              </Button>
              <Button
                disabled={!draftCurrentStart || !draftCurrentEnd || draftCurrentStart > draftCurrentEnd || (compareMode && (!draftPreviousStart || !draftPreviousEnd || draftPreviousStart > draftPreviousEnd))}
                type="button"
                onClick={handleApply}
              >
                <ActionConfirmIcon data-icon="inline-start" />
                {translateUiLiteral(language, 'Apply')}
              </Button>
            </div>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
