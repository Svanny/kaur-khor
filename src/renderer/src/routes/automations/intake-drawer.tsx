import { useEffect, useMemo, useState, type ComponentType } from 'react';
import type {
  AutomationMessageRecord,
  AutomationOrderIntake,
  PromoteAutomationIntakeResult,
} from '@shared/automation';
import type {
  AutomationReadConversationPayload,
  AutomationResolveIntakePayload,
  PromoteAutomationIntakePayload,
} from '@shared/ipc';
import { formatPhoneForDisplay, normalizePhoneNumber } from '@shared/phone';
import { ActionClipboardAddIcon, ActionCloseIcon, ActionEditIcon, ActionOpenExternalIcon } from '@icons/actions';
import { StatusWarningIcon } from '@icons/status';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
import {
  ActionSheetField,
  actionSheetInputClassName,
  actionSheetTextareaClassName,
} from '@/routes/detail-action-sheet';

type DrawerAction = 'create_ticket' | 'append_ticket' | 'needs_review' | 'canceled';

const drawerActionOptions = [
  { value: 'create_ticket', label: 'Create customer ticket', icon: ActionClipboardAddIcon },
  { value: 'append_ticket', label: 'Append to existing customer ticket', icon: ActionOpenExternalIcon },
  { value: 'needs_review', label: 'Keep in review', icon: StatusWarningIcon },
  { value: 'canceled', label: 'Cancel intake', icon: ActionCloseIcon },
] satisfies Array<{ value: DrawerAction; label: string; icon: ComponentType<{ className?: string }> }>;

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
  title,
}: {
  children: React.ReactNode;
  className?: string;
  title: string;
}) {
  return (
    <section className={cn(drawerBandClassName(), className)}>
      <div className="mb-4 flex items-center gap-2.5">
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

function lastInboundMessage(messages: AutomationMessageRecord[]) {
  return messages.find((message) => message.direction === 'inbound') ?? messages[0] ?? null;
}

function canPromote(intake: AutomationOrderIntake | null) {
  if (!intake || intake.quotedTotal == null) {
    return false;
  }
  return intake.lines.every((line) => line.entityId != null && line.quantity != null && line.quantity > 0 && line.unitPrice != null);
}

export function AutomationIntakeDrawer({
  conversationId,
  intake,
  isSaving,
  open,
  onClose,
  onPromote,
  onReadConversation,
  onResolve,
}: {
  conversationId: string | null;
  intake: AutomationOrderIntake | null;
  isSaving: boolean;
  open: boolean;
  onClose: () => void;
  onPromote: (payload: PromoteAutomationIntakePayload) => Promise<PromoteAutomationIntakeResult>;
  onReadConversation: (payload: AutomationReadConversationPayload) => Promise<{
    conversation: { conversationId: string };
    messages: AutomationMessageRecord[];
    intakes: AutomationOrderIntake[];
  }>;
  onResolve: (payload: AutomationResolveIntakePayload) => Promise<AutomationOrderIntake>;
}) {
  const [action, setAction] = useState<DrawerAction>('create_ticket');
  const [appendTicketId, setAppendTicketId] = useState('');
  const [customerNameOverride, setCustomerNameOverride] = useState('');
  const [phoneOverride, setPhoneOverride] = useState('');
  const [operatorNote, setOperatorNote] = useState('');
  const [messages, setMessages] = useState<AutomationMessageRecord[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isLoadingConversation, setIsLoadingConversation] = useState(false);
  const [showDetailBody, setShowDetailBody] = useState(false);

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
    setError(null);
    return () => window.cancelAnimationFrame(frameId);
  }, [intake, open]);

  useEffect(() => {
    if (!open || !conversationId) {
      setMessages([]);
      return;
    }
    let active = true;
    const timeoutId = window.setTimeout(() => {
      if (!active) {
        return;
      }
      setIsLoadingConversation(true);
      void onReadConversation({ conversationId })
        .then((result) => {
          if (!active) {
            return;
          }
          setMessages(result.messages);
        })
        .catch((nextError) => {
          if (!active) {
            return;
          }
          setError(nextError instanceof Error ? nextError.message : String(nextError));
        })
        .finally(() => {
          if (active) {
            setIsLoadingConversation(false);
          }
        });
    }, 150);
    return () => {
      active = false;
      window.clearTimeout(timeoutId);
    };
  }, [conversationId, onReadConversation, open]);

  const inboundMessage = useMemo(() => lastInboundMessage(messages), [messages]);
  const promotionAllowed = canPromote(intake);

  async function handleSubmit() {
    if (!intake) {
      return;
    }
    setError(null);
    try {
      if (action === 'needs_review') {
        await onResolve({
          intakeId: intake.intakeId,
          note: operatorNote || null,
          status: 'needs_review',
        });
        onClose();
        return;
      }
      if (action === 'canceled') {
        await onResolve({
          intakeId: intake.intakeId,
          note: operatorNote || null,
          status: 'canceled',
        });
        onClose();
        return;
      }
      if (!promotionAllowed) {
        setError('Every line must resolve to a priced sellable before banj can create a customer ticket.');
        return;
      }
      if (action === 'append_ticket' && !appendTicketId.trim()) {
        setError('Choose a customer ticket before appending Telegram intake.');
        return;
      }
      await onPromote({
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
      setError(nextError instanceof Error ? nextError.message : String(nextError));
    }
  }

  const submitLabel =
    action === 'append_ticket'
      ? 'Append to existing ticket'
      : action === 'needs_review'
        ? 'Keep in review'
        : action === 'canceled'
          ? 'Cancel intake'
          : 'Create customer ticket';

  return (
    <Sheet open={open} onOpenChange={(nextOpen) => { if (!nextOpen) onClose(); }}>
      <SheetContent className="w-full max-w-3xl gap-0 overflow-hidden border-l border-border/70 bg-[#f8f4ef] px-0 shadow-[0_28px_72px_rgba(48,31,20,0.18)] sm:max-w-3xl">
        <SheetHeader className="sticky top-0 z-20 gap-4 border-b border-border/40 bg-[#f8f4ef]/96 px-8 py-7 backdrop-blur-sm">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <SheetTitle className="text-[2rem] leading-tight tracking-[-0.04em]">Telegram intake</SheetTitle>
              <SheetDescription className="mt-3 max-w-2xl text-[0.98rem] leading-7">
                Review Telegram order intake before banj turns it into customer ticket truth.
              </SheetDescription>
            </div>
            <SheetClose className="mt-1 inline-flex size-9 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-secondary/65 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50">
              <ActionCloseIcon className="size-5" />
              <span className="sr-only">Close</span>
            </SheetClose>
          </div>
        </SheetHeader>

        {showDetailBody ? (
        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="px-8 py-6 pb-44">
            <section className={drawerCanvasClassName()}>
              <DrawerBand title="What came in">
            {intake ? (
              <div className="grid gap-4">
                <div className="grid gap-2 sm:grid-cols-2">
                  <div className="rounded-[1rem] border border-border/60 bg-background/70 p-4">
                    <p className={sectionTitleClassName()}>Customer</p>
                    <div className="mt-2">
                    <p className="text-sm font-medium text-foreground">{intake.customerDisplayName ?? 'Telegram customer'}</p>
                    <p className="text-sm text-muted-foreground">{intake.customerHandle ?? 'No Telegram handle captured'}</p>
                    </div>
                  </div>
                  <div className="rounded-[1rem] border border-border/60 bg-background/70 p-4">
                    <p className={sectionTitleClassName()}>Phone</p>
                    <div className="mt-2">
                    <p className="text-sm font-medium text-foreground">
                      {intake.phone ? formatPhoneForDisplay(intake.phone) : 'No phone captured'}
                    </p>
                    <span className={`mt-2 inline-flex items-center rounded-full border px-2.5 py-1 text-[0.72rem] font-medium ${statusPillClassName(confidenceTone(intake))}`}>
                      {intake.parseConfidence.toUpperCase()} confidence
                    </span>
                    </div>
                  </div>
                </div>

                    <div className="rounded-[1rem] border border-border/60 bg-background/70 p-4">
                      <p className={sectionTitleClassName()}>Raw incoming text</p>
                      <p className="mt-2 text-sm leading-6 text-foreground">
                        {inboundMessage?.rawText ?? (isLoadingConversation ? 'Loading latest Telegram message…' : 'No Telegram message captured yet.')}
                      </p>
                    </div>

                    <div className="space-y-3">
                      {intake.lines.map((line) => (
                        <div key={line.lineId} className="rounded-[1rem] border border-border/60 bg-background/70 p-4">
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div>
                              <p className="font-medium text-foreground">{line.resolvedLabel ?? line.requestedLabel}</p>
                              <p className="mt-1 text-sm text-muted-foreground">
                                Requested: {line.requestedLabel}
                                {line.quantity != null ? ` · Qty ${line.quantity}` : ' · Quantity unresolved'}
                              </p>
                            </div>
                            <div className="text-right">
                              <p className="font-medium text-foreground">
                                {line.lineTotal == null ? 'Pending line total' : `$${line.lineTotal.toFixed(2)}`}
                              </p>
                              <p className="mt-1 text-sm text-muted-foreground">
                                {line.unitPrice == null ? 'No unit price' : `$${line.unitPrice.toFixed(2)} each`}
                              </p>
                            </div>
                          </div>
                          {line.ambiguityReason ? (
                            <p className="mt-3 text-sm text-amber-700">Issue: {line.ambiguityReason.replaceAll('_', ' ')}</p>
                          ) : null}
                        </div>
                      ))}
                    </div>

                <div className="grid gap-2 sm:grid-cols-3">
                  <div className="rounded-[1rem] border border-border/60 bg-background/70 p-4">
                    <p className={sectionTitleClassName()}>Quoted subtotal</p>
                    <p className="mt-2 text-lg font-semibold text-foreground">{intake.quotedSubtotal == null ? 'Pending' : `$${intake.quotedSubtotal.toFixed(2)}`}</p>
                  </div>
                  <div className="rounded-[1rem] border border-border/60 bg-background/70 p-4">
                    <p className={sectionTitleClassName()}>Quoted total</p>
                    <p className="mt-2 text-lg font-semibold text-foreground">{intake.quotedTotal == null ? 'Pending' : `$${intake.quotedTotal.toFixed(2)}`}</p>
                  </div>
                  <div className="rounded-[1rem] border border-border/60 bg-background/70 p-4">
                    <p className={sectionTitleClassName()}>Source</p>
                    <span className={`mt-2 inline-flex items-center rounded-full border px-2.5 py-1 text-[0.72rem] font-medium ${statusPillClassName('info')}`}>
                      Telegram
                    </span>
                  </div>
                </div>
              </div>
            ) : (
              <p className="mt-4 text-sm text-muted-foreground">No intake selected.</p>
            )}
              </DrawerBand>

              <DrawerBand title="What do you want to do?">
            <div className="grid gap-3 sm:grid-cols-2">
              {drawerActionOptions.map((option) => {
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
                <ActionSheetField label="Existing customer ticket id">
                  <Input
                    className={actionSheetInputClassName}
                    placeholder="Existing customer ticket id"
                    value={appendTicketId}
                    onChange={(event) => setAppendTicketId(event.target.value)}
                  />
                </ActionSheetField>
              ) : null}
              <ActionSheetField label="Customer name override">
                <Input
                  className={actionSheetInputClassName}
                  placeholder="Customer name override"
                  value={customerNameOverride}
                  onChange={(event) => setCustomerNameOverride(event.target.value)}
                />
              </ActionSheetField>
              <ActionSheetField label="Phone override">
                <Input
                  className={actionSheetInputClassName}
                  placeholder="Phone override"
                  value={phoneOverride}
                  onChange={(event) => setPhoneOverride(event.target.value)}
                  onBlur={() => setPhoneOverride(normalizePhoneNumber(phoneOverride))}
                />
              </ActionSheetField>
              <ActionSheetField label="Operator note">
                <Textarea
                  className={cn('min-h-28', actionSheetTextareaClassName)}
                  placeholder="Operator note"
                  value={operatorNote}
                  onChange={(event) => setOperatorNote(event.target.value)}
                />
              </ActionSheetField>
            </div>
              </DrawerBand>

              <DrawerBand title="What banj will do next">
            <div className="rounded-[1.35rem] border border-border/65 bg-secondary/35 px-4 py-4">
              <div className="grid gap-3">
              <p>banj will write a customer-side ticket event instead of creating a parallel Telegram order system.</p>
              <p>banj will write customer commercial events that flow into Overview, Record Update, and Financials.</p>
              <p>banj will attach Telegram channel metadata to the customer ticket party.</p>
              <p>banj will keep this intake out of supplier workflows and raw stock-count truth.</p>
              </div>
            </div>
              </DrawerBand>

              {error ? (
                <p className="mt-5 rounded-[1.25rem] border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                  {error}
                </p>
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
                  ? 'This intake can promote into a customer ticket.'
                  : 'Resolve every line and compute a quote before banj can promote this intake.'}
              </p>
            </div>
            <div className="flex flex-wrap justify-end gap-2">
              <Button type="button" variant="outline" onClick={onClose}>
                <ActionCloseIcon className="size-4" />
                Close
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
