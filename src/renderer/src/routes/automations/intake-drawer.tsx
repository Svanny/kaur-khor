import { useEffect, useMemo, useRef, useState, type ComponentType } from 'react';
import type {
  AutomationOrderIntake,
  PromoteAutomationIntakeResult,
} from '@shared/automation';
import type {
  AutomationResolveIntakePayload,
  PromoteAutomationIntakePayload,
} from '@shared/ipc';
import type { AppLanguage } from '@shared/inventory';
import { formatPhoneForDisplay, normalizePhoneNumber } from '@shared/phone';
import { ActionClipboardAddIcon, ActionCloseIcon, ActionEditIcon, ActionOpenExternalIcon } from '@icons/actions';
import { StatusNarrativeIcon, StatusWarningIcon } from '@icons/status';
import { Button } from '@/components/ui/button';
import { SaveErrorFlash } from '@/components/system/save-error-flash';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { statusPillClassName } from '@/lib/state-tones';
import { translateUiLiteral } from '@/lib/translations';
import {
  ActionSheetField,
  actionSheetInputClassName,
  actionSheetSelectTriggerClassName,
  actionSheetTextareaClassName,
} from '@/routes/detail-action-sheet';

type DrawerAction = 'create_ticket' | 'append_ticket' | 'needs_review' | 'canceled';
export interface AutomationIntakeTicketOption {
  description: string;
  id: string;
  label: string;
  metadata: string;
}

function drawerActionOptions(language: AppLanguage) {
  return [
    { value: 'create_ticket', label: translateUiLiteral(language, 'Create customer ticket'), icon: ActionClipboardAddIcon },
    { value: 'append_ticket', label: translateUiLiteral(language, 'Append to existing customer ticket'), icon: ActionOpenExternalIcon },
    { value: 'needs_review', label: translateUiLiteral(language, 'Keep in review'), icon: StatusWarningIcon },
    { value: 'canceled', label: translateUiLiteral(language, 'Cancel intake'), icon: ActionCloseIcon },
  ] satisfies Array<{ value: DrawerAction; label: string; icon: ComponentType<{ className?: string }> }>;
}

function drawerCanvasClassName() {
  return 'rounded-[1.8rem] border border-border/70 bg-white/84 px-6 py-6 shadow-[0_1px_0_rgba(255,255,255,0.9)]';
}

function drawerBandClassName() {
  return 'border-t border-border/50 py-5 first:border-t-0 first:pt-0';
}

function sectionTitleClassName() {
  return 'text-[0.72rem] font-semibold uppercase tracking-[0.18em] text-muted-foreground';
}

function DrawerBand({
  children,
  className,
  icon: Icon,
  title,
}: {
  children: React.ReactNode;
  className?: string;
  icon: ComponentType<{ className?: string }>;
  title: string;
}) {
  return (
    <section className={cn(drawerBandClassName(), className)}>
      <div className="mb-4 flex items-center gap-2.5">
        <Icon className="size-4 text-primary" />
        <p className={sectionTitleClassName()}>{title}</p>
      </div>
      {children}
    </section>
  );
}

function confidenceTone(intake: AutomationOrderIntake | null) {
  if (!intake) {
    return 'neutral';
  }
  if (intake.parseConfidence === 'high') {
    return 'success';
  }
  if (intake.parseConfidence === 'medium') {
    return 'warning';
  }
  return 'danger';
}

function canPromote(intake: AutomationOrderIntake | null) {
  if (!intake || intake.quotedTotal == null) {
    return false;
  }
  return intake.lines.every((line) => line.entityId != null && line.quantity != null && line.quantity > 0 && line.unitPrice != null);
}

function moneyLabel(value: number | null | undefined) {
  return value == null ? 'Pending' : `$${value.toFixed(2)}`;
}

function buildCustomerMessageDraft(
  intake: AutomationOrderIntake | null,
  action: DrawerAction,
) {
  if (!intake) {
    return '';
  }
  const lineSummary = intake.lines
    .map((line) => {
      const label = line.resolvedLabel ?? line.requestedLabel;
      const quantity = line.quantity ?? 1;
      const total = moneyLabel(line.lineTotal);
      return `- ${quantity} x ${label}: ${total}`;
    })
    .join('\n');
  const total = moneyLabel(intake.quotedTotal ?? intake.quotedSubtotal);
  if (action === 'create_ticket') {
    return `Your order has been approved.\n\n${lineSummary}\n\nTotal: ${total}\n\nKaur Khor will continue tracking this order with our operator team.`;
  }
  if (action === 'append_ticket') {
    return `Your new request has been added to your existing customer ticket.\n\n${lineSummary}\n\nTotal: ${total}\n\nKaur Khor will continue the follow-up from that ticket.`;
  }
  if (action === 'canceled') {
    return 'Your order request has been canceled. Message us again if you want to start a new order.';
  }
  return 'Your order request needs a little more review before we can approve it. Kaur Khor will follow up after an operator checks it.';
}

export function AutomationIntakeDrawer({
  intake,
  isSaving,
  language,
  open,
  onClose,
  onPromote,
  onResolve,
  onViewChat,
  ticketOptions = [],
}: {
  intake: AutomationOrderIntake | null;
  isSaving: boolean;
  language: AppLanguage;
  open: boolean;
  onClose: () => void;
  onPromote: (payload: PromoteAutomationIntakePayload) => Promise<PromoteAutomationIntakeResult>;
  onResolve: (payload: AutomationResolveIntakePayload) => Promise<AutomationOrderIntake>;
  onViewChat?: (intakeId: string) => void;
  ticketOptions?: AutomationIntakeTicketOption[];
}) {
  const [action, setAction] = useState<DrawerAction>('create_ticket');
  const [appendTicketId, setAppendTicketId] = useState('');
  const [customerNameOverride, setCustomerNameOverride] = useState('');
  const [phoneOverride, setPhoneOverride] = useState('');
  const [operatorNote, setOperatorNote] = useState('');
  const [customerMessageText, setCustomerMessageText] = useState('');
  const [customerMessageEdited, setCustomerMessageEdited] = useState(false);
  const [sendCustomerMessage, setSendCustomerMessage] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saveErrorFlashKey, setSaveErrorFlashKey] = useState(0);
  const [showDetailBody, setShowDetailBody] = useState(false);
  const errorRef = useRef<HTMLParagraphElement | null>(null);
  const errorScrollTokenRef = useRef(0);

  useEffect(() => {
    if (!open || !intake) {
      setShowDetailBody(false);
      return;
    }
    const frameId = window.requestAnimationFrame(() => {
      setShowDetailBody(true);
    });
    setAction(intake.status === 'quoted' ? 'create_ticket' : intake.status === 'canceled' ? 'canceled' : 'needs_review');
    setAppendTicketId(intake.promotedTicketId ?? '');
    setCustomerNameOverride(intake.customerDisplayName ?? '');
    setPhoneOverride(formatPhoneForDisplay(intake.phone));
    setOperatorNote(intake.notes ?? '');
    setCustomerMessageText(buildCustomerMessageDraft(intake, intake.status === 'quoted' ? 'create_ticket' : intake.status === 'canceled' ? 'canceled' : 'needs_review'));
    setCustomerMessageEdited(false);
    setSendCustomerMessage(true);
    setError(null);
    setSaveErrorFlashKey(0);
    return () => window.cancelAnimationFrame(frameId);
  }, [intake, open]);

  const promotionAllowed = canPromote(intake);
  const actionOptions = useMemo(() => drawerActionOptions(language), [language]);
  const literal = (value: string) => translateUiLiteral(language, value);

  useEffect(() => {
    if (!customerMessageEdited) {
      setCustomerMessageText(buildCustomerMessageDraft(intake, action));
    }
  }, [action, customerMessageEdited, intake]);

  function showError(nextError: string) {
    setError(nextError);
    setSaveErrorFlashKey(0);
  }

  useEffect(() => {
    if (!error) {
      return;
    }
    const token = errorScrollTokenRef.current + 1;
    errorScrollTokenRef.current = token;
    let playTimeoutId: number | null = null;
    let fallbackTimeoutId: number | null = null;
    let observer: IntersectionObserver | null = null;
    const playFlash = () => {
      if (errorScrollTokenRef.current !== token) {
        return;
      }
      setSaveErrorFlashKey((current) => current + 1);
    };
    const frameId = window.requestAnimationFrame(() => {
      const node = errorRef.current;
      if (!node) {
        playFlash();
        return;
      }
      node.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      if (typeof IntersectionObserver === 'undefined') {
        playTimeoutId = window.setTimeout(playFlash, 250);
        return;
      }
      observer = new IntersectionObserver((entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) {
          return;
        }
        observer?.disconnect();
        if (fallbackTimeoutId != null) {
          window.clearTimeout(fallbackTimeoutId);
        }
        playTimeoutId = window.setTimeout(playFlash, 80);
      }, { threshold: 0.9 });
      observer.observe(node);
      fallbackTimeoutId = window.setTimeout(() => {
        observer?.disconnect();
        playFlash();
      }, 600);
    });

    return () => {
      window.cancelAnimationFrame(frameId);
      if (playTimeoutId != null) {
        window.clearTimeout(playTimeoutId);
      }
      if (fallbackTimeoutId != null) {
        window.clearTimeout(fallbackTimeoutId);
      }
      observer?.disconnect();
    };
  }, [error]);

  async function handleSubmit() {
    if (!intake) {
      return;
    }
    setError(null);
    try {
      if (action === 'needs_review') {
        await onResolve({
          customerMessage: {
            send: sendCustomerMessage,
            text: customerMessageText.trim() || null,
          },
          intakeId: intake.intakeId,
          note: operatorNote || null,
          status: 'needs_review',
        });
        onClose();
        return;
      }
      if (action === 'canceled') {
        await onResolve({
          customerMessage: {
            send: sendCustomerMessage,
            text: customerMessageText.trim() || null,
          },
          intakeId: intake.intakeId,
          note: operatorNote || null,
          status: 'canceled',
        });
        onClose();
        return;
      }
      if (!promotionAllowed) {
        showError(literal('Every line must resolve to a priced sellable before Kaur Khor can create a customer ticket.'));
        return;
      }
      if (action === 'append_ticket' && !appendTicketId.trim()) {
        showError(literal('Choose a customer ticket before appending Telegram intake.'));
        return;
      }
      await onPromote({
        customerMessage: {
          send: sendCustomerMessage,
          text: customerMessageText.trim() || null,
        },
        intakeId: intake.intakeId,
        mode: action,
        note: operatorNote || null,
        ticketId: action === 'append_ticket' ? appendTicketId.trim() : null,
        customerIdentityOverride: {
          customerName: customerNameOverride.trim() || null,
          phone: normalizePhoneNumber(phoneOverride) || null,
        },
      });
      onClose();
    } catch (nextError) {
      showError(nextError instanceof Error ? nextError.message : String(nextError));
    }
  }

  const submitLabel =
    action === 'append_ticket'
      ? literal('Append to existing ticket')
      : action === 'needs_review'
        ? literal('Keep in review')
        : action === 'canceled'
          ? literal('Cancel intake')
          : literal('Create customer ticket');

  return (
    <Sheet open={open} onOpenChange={(nextOpen) => { if (!nextOpen) onClose(); }}>
      <SheetContent
        className="w-full max-w-3xl gap-0 overflow-hidden border-l border-border/70 bg-[#f8f4ef] px-0 shadow-[0_28px_72px_rgba(48,31,20,0.18)] sm:max-w-3xl"
        showCloseButton={false}
      >
        <SheetHeader className="sticky top-0 z-20 gap-4 border-b border-border/40 bg-[#f8f4ef]/96 px-8 py-7 backdrop-blur-sm">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <SheetTitle className="text-[2rem] leading-tight tracking-[-0.04em]">{literal('Telegram intake')}</SheetTitle>
              <SheetDescription className="mt-3 max-w-2xl text-[0.98rem] leading-7">
                {literal('Review Telegram order intake before Kaur Khor turns it into customer ticket truth.')}
              </SheetDescription>
            </div>
            <SheetClose className="mt-1 inline-flex size-9 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-secondary/65 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50">
              <ActionCloseIcon className="size-5" />
              <span className="sr-only">{literal('Close')}</span>
            </SheetClose>
          </div>
        </SheetHeader>

        {showDetailBody ? (
        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="px-8 py-6 pb-44">
            <section className={drawerCanvasClassName()}>
              <DrawerBand icon={StatusNarrativeIcon} title={literal('What came in')}>
            {intake ? (
              <div className="grid gap-4">
                <div className="grid gap-4 rounded-[1rem] border border-border/60 bg-background/70 p-4 sm:grid-cols-[minmax(0,1fr)_1px_minmax(0,1fr)] sm:items-start">
                  <div className="min-w-0">
                    <p className={sectionTitleClassName()}>{literal('Customer')}</p>
                    <div className="mt-2">
                      <p className="text-sm font-medium text-foreground">{intake.customerDisplayName ?? literal('Telegram customer')}</p>
                      <p className="text-sm font-semibold text-primary">{intake.customerHandle ?? literal('No Telegram handle captured')}</p>
                    </div>
                  </div>
                  <div className="hidden h-full min-h-16 w-px bg-border/60 sm:block" aria-hidden="true" />
                  <div className="min-w-0 border-t border-border/60 pt-4 sm:border-t-0 sm:pt-0">
                    <p className={sectionTitleClassName()}>{literal('Phone')}</p>
                    <div className="mt-2">
                      <p className="text-sm font-medium text-foreground">
                        {intake.phone ? formatPhoneForDisplay(intake.phone) : literal('No phone captured')}
                      </p>
                    </div>
                  </div>
                </div>
                {onViewChat ? (
                  <Button className="w-full justify-center" type="button" variant="outline" onClick={() => onViewChat(intake.intakeId)}>
                    <ActionOpenExternalIcon className="size-4" />
                    {literal('View chat')}
                  </Button>
                ) : null}

                <div className="rounded-[1rem] border border-border/60 bg-background/70 p-4">
                  <div className="space-y-4">
                    {intake.lines.map((line) => (
                      <div key={line.lineId} className="border-b border-border/50 pb-4 last:border-b-0 last:pb-0">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <p className="font-medium text-foreground">{line.resolvedLabel ?? line.requestedLabel}</p>
                            <p className="mt-1 text-sm text-muted-foreground">
                              {translateUiLiteral(language, 'Requested: {label}', { label: line.requestedLabel })}
                              {line.quantity != null
                                ? ` · ${translateUiLiteral(language, 'Qty {quantity}', { quantity: line.quantity })}`
                                : ` · ${literal('Quantity unresolved')}`}
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="font-medium text-foreground">
                              {line.lineTotal == null ? literal('Pending line total') : `$${line.lineTotal.toFixed(2)}`}
                            </p>
                            <p className="mt-1 text-sm text-muted-foreground">
                              {line.unitPrice == null ? literal('No unit price') : translateUiLiteral(language, '{price} each', { price: `$${line.unitPrice.toFixed(2)}` })}
                            </p>
                          </div>
                        </div>
                        {line.ambiguityReason ? (
                          <p className="mt-3 text-sm text-amber-700">{translateUiLiteral(language, 'Issue: {issue}', { issue: line.ambiguityReason.replaceAll('_', ' ') })}</p>
                        ) : null}
                      </div>
                    ))}
                  </div>
                  <div className="mt-4 border-t border-border/60 pt-4">
                    <p className={sectionTitleClassName()}>{literal('Quoted total')}</p>
                    <p className="mt-2 text-lg font-semibold text-foreground">{intake.quotedTotal == null ? literal('Pending') : `$${intake.quotedTotal.toFixed(2)}`}</p>
                  </div>
                </div>
              </div>
            ) : (
              <p className="mt-4 text-sm text-muted-foreground">{literal('No intake selected.')}</p>
            )}
              </DrawerBand>

              <DrawerBand icon={ActionClipboardAddIcon} title={literal('What do you want to do?')}>
            <div className="grid gap-3 sm:grid-cols-2">
              {actionOptions.map((option) => {
                const OptionIcon = option.icon;
                return (
                  <Button
                    key={option.value}
                    aria-pressed={action === option.value}
                    className="justify-start"
                    type="button"
                    variant={action === option.value ? 'default' : 'outline'}
                    onClick={() => setAction(option.value)}
                  >
                    <OptionIcon className="size-4" />
                    {option.label}
                  </Button>
                );
              })}
            </div>

            <div className="mt-5 grid gap-5">
              {action === 'append_ticket' ? (
                <ActionSheetField
                  description={
                    ticketOptions.length === 0
                      ? literal('No open customer tickets available.')
                      : undefined
                  }
                  label={literal('Existing customer ticket')}
                >
                  <Select
                    disabled={ticketOptions.length === 0}
                    value={appendTicketId}
                    onValueChange={setAppendTicketId}
                  >
                    <SelectTrigger
                      aria-label={literal('Existing customer ticket')}
                      className={cn(
                        actionSheetSelectTriggerClassName,
                        '*:data-[slot=select-value]:flex-1 *:data-[slot=select-value]:justify-start *:data-[slot=select-value]:text-left',
                      )}
                    >
                      <SelectValue placeholder={literal('Choose a customer ticket')} />
                    </SelectTrigger>
                    <SelectContent align="start">
                      {ticketOptions.map((option) => (
                        <SelectItem key={option.id} value={option.id}>
                          <span className="flex min-w-0 flex-col">
                            <span className="truncate font-medium">{option.label}</span>
                            <span className="truncate text-xs text-muted-foreground">
                              {option.description}
                              {option.metadata ? ` · ${option.metadata}` : ''}
                            </span>
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </ActionSheetField>
              ) : null}
              <ActionSheetField label={literal('Customer name override')}>
                <Input
                  className={actionSheetInputClassName}
                  placeholder={literal('Customer name override')}
                  value={customerNameOverride}
                  onChange={(event) => setCustomerNameOverride(event.target.value)}
                />
              </ActionSheetField>
              <ActionSheetField label={literal('Phone override')}>
                <Input
                  className={actionSheetInputClassName}
                  placeholder={literal('Phone override')}
                  value={phoneOverride}
                  onChange={(event) => setPhoneOverride(event.target.value)}
                  onBlur={() => setPhoneOverride(normalizePhoneNumber(phoneOverride))}
                />
              </ActionSheetField>
              <ActionSheetField label={literal('Operator note')}>
                <Textarea
                  className={cn('min-h-28', actionSheetTextareaClassName)}
                  placeholder={literal('Operator note')}
                  value={operatorNote}
                  onChange={(event) => setOperatorNote(event.target.value)}
                />
              </ActionSheetField>
              <label className="flex items-center gap-3 text-sm font-medium text-foreground">
                <Checkbox
                  checked={sendCustomerMessage}
                  onCheckedChange={(value) => setSendCustomerMessage(Boolean(value))}
                />
                {literal('Send message to customer')}
              </label>
              <ActionSheetField label={literal('Message to customer')}>
                <Textarea
                  className={cn('min-h-36', actionSheetTextareaClassName)}
                  disabled={!sendCustomerMessage}
                  placeholder={literal('Message to customer')}
                  value={customerMessageText}
                  onChange={(event) => {
                    setCustomerMessageEdited(true);
                    setCustomerMessageText(event.target.value);
                  }}
                />
              </ActionSheetField>
            </div>
              </DrawerBand>
              {error ? (
                <SaveErrorFlash ref={errorRef} as="p" className="mt-5 rounded-[1.25rem] border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive" flashKey={saveErrorFlashKey}>
                  {error}
                </SaveErrorFlash>
              ) : null}
            </section>
          </div>
        </div>
        ) : null}

        {showDetailBody ? (
        <SheetFooter className="sticky bottom-0 z-20 border-t border-border/50 bg-[#f8f4ef]/96 px-8 py-5 shadow-[0_-10px_24px_rgba(48,31,20,0.06)] backdrop-blur-sm">
          <div className="flex w-full flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0 sm:max-w-[20rem]">
              <p className="text-sm font-medium text-foreground">{submitLabel}</p>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">
                {promotionAllowed
                  ? literal('This intake can promote into a customer ticket.')
                  : literal('Resolve every line and compute a quote before Kaur Khor can promote this intake.')}
              </p>
            </div>
            <div className="flex flex-wrap justify-end gap-2">
              <Button type="button" variant="outline" onClick={onClose}>
                <ActionCloseIcon className="size-4" />
                {literal('Close')}
              </Button>
              <Button
                disabled={isSaving || !intake || ((action === 'create_ticket' || action === 'append_ticket') && !promotionAllowed)}
                type="button"
                onClick={() => { void handleSubmit(); }}
              >
                {action === 'create_ticket'
                  ? <ActionClipboardAddIcon className="size-4" />
                  : action === 'append_ticket'
                    ? <ActionOpenExternalIcon className="size-4" />
                    : action === 'needs_review'
                      ? <ActionEditIcon className="size-4" />
                      : <ActionCloseIcon className="size-4" />}
                {submitLabel}
              </Button>
            </div>
          </div>
        </SheetFooter>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
