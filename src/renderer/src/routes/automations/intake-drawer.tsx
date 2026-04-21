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
import { ActionClipboardAddIcon, ActionCloseIcon, ActionEditIcon, ActionOpenExternalIcon } from '@icons/actions';
import { StatusWarningIcon } from '@icons/status';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Textarea } from '@/components/ui/textarea';
import { statusPillClassName } from '@/lib/state-tones';

type DrawerAction = 'create_ticket' | 'append_ticket' | 'needs_review' | 'canceled';

const drawerActionOptions = [
  { value: 'create_ticket', label: 'Create customer ticket', icon: ActionClipboardAddIcon },
  { value: 'append_ticket', label: 'Append to existing customer ticket', icon: ActionOpenExternalIcon },
  { value: 'needs_review', label: 'Keep in review', icon: StatusWarningIcon },
  { value: 'canceled', label: 'Cancel intake', icon: ActionCloseIcon },
] satisfies Array<{ value: DrawerAction; label: string; icon: ComponentType<{ className?: string }> }>;

function bandClassName() {
  return 'rounded-[1.2rem] border border-border/60 bg-background/70 p-4';
}

function sectionTitleClassName() {
  return 'text-[0.72rem] font-semibold uppercase tracking-[0.18em] text-muted-foreground';
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

  useEffect(() => {
    if (!open || !intake) {
      return;
    }
    setAction(intake.status === 'quoted' ? 'create_ticket' : intake.status === 'canceled' ? 'canceled' : 'needs_review');
    setAppendTicketId(intake.promotedTicketId ?? '');
    setCustomerNameOverride(intake.customerDisplayName ?? '');
    setPhoneOverride(intake.phone ?? '');
    setOperatorNote(intake.notes ?? '');
    setError(null);
  }, [intake, open]);

  useEffect(() => {
    if (!open || !conversationId) {
      setMessages([]);
      return;
    }
    let active = true;
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
    return () => {
      active = false;
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
          phone: phoneOverride.trim() || null,
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
      <SheetContent className="w-full max-w-3xl gap-0 overflow-y-auto border-l border-border/70 bg-white px-0 shadow-[0_28px_72px_rgba(48,31,20,0.18)] sm:max-w-3xl">
        <SheetHeader className="gap-3 border-b border-border/60 px-8 py-7">
          <SheetTitle className="text-[2rem] leading-tight tracking-[-0.04em]">Telegram intake</SheetTitle>
          <SheetDescription className="max-w-2xl text-base leading-7">
            Review Telegram order intake before banj turns it into customer ticket truth.
          </SheetDescription>
        </SheetHeader>

        <div className="grid gap-5 px-8 py-7">
          <section className={bandClassName()}>
            <p className={sectionTitleClassName()}>What came in</p>
            {intake ? (
              <div className="mt-4 grid gap-4">
                <div className="grid gap-2 sm:grid-cols-2">
                  <div>
                    <p className="text-sm font-medium text-foreground">{intake.customerDisplayName ?? 'Telegram customer'}</p>
                    <p className="text-sm text-muted-foreground">{intake.customerHandle ?? 'No Telegram handle captured'}</p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-foreground">{intake.phone ?? 'No phone captured'}</p>
                    <span className={`mt-2 inline-flex items-center rounded-full border px-2.5 py-1 text-[0.72rem] font-medium ${statusPillClassName(confidenceTone(intake))}`}>
                      {intake.parseConfidence.toUpperCase()} confidence
                    </span>
                  </div>
                </div>

                <div className="rounded-[1rem] border border-border/60 bg-card/60 p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Raw incoming text</p>
                  <p className="mt-2 text-sm leading-6 text-foreground">
                    {inboundMessage?.rawText ?? (isLoadingConversation ? 'Loading latest Telegram message…' : 'No Telegram message captured yet.')}
                  </p>
                </div>

                <div className="space-y-3">
                  {intake.lines.map((line) => (
                    <div key={line.lineId} className="rounded-[1rem] border border-border/60 bg-card/60 p-4">
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
                  <div className="rounded-[1rem] border border-border/60 bg-card/60 p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Quoted subtotal</p>
                    <p className="mt-2 text-lg font-semibold text-foreground">{intake.quotedSubtotal == null ? 'Pending' : `$${intake.quotedSubtotal.toFixed(2)}`}</p>
                  </div>
                  <div className="rounded-[1rem] border border-border/60 bg-card/60 p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Quoted total</p>
                    <p className="mt-2 text-lg font-semibold text-foreground">{intake.quotedTotal == null ? 'Pending' : `$${intake.quotedTotal.toFixed(2)}`}</p>
                  </div>
                  <div className="rounded-[1rem] border border-border/60 bg-card/60 p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Source</p>
                    <span className={`mt-2 inline-flex items-center rounded-full border px-2.5 py-1 text-[0.72rem] font-medium ${statusPillClassName('info')}`}>
                      Telegram
                    </span>
                  </div>
                </div>
              </div>
            ) : (
              <p className="mt-4 text-sm text-muted-foreground">No intake selected.</p>
            )}
          </section>

          <section className={bandClassName()}>
            <p className={sectionTitleClassName()}>What do you want to do?</p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
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

            <div className="mt-4 grid gap-3">
              {action === 'append_ticket' ? (
                <Input
                  placeholder="Existing customer ticket id"
                  value={appendTicketId}
                  onChange={(event) => setAppendTicketId(event.target.value)}
                />
              ) : null}
              <Input
                placeholder="Customer name override"
                value={customerNameOverride}
                onChange={(event) => setCustomerNameOverride(event.target.value)}
              />
              <Input
                placeholder="Phone override"
                value={phoneOverride}
                onChange={(event) => setPhoneOverride(event.target.value)}
              />
              <Textarea
                placeholder="Operator note"
                value={operatorNote}
                onChange={(event) => setOperatorNote(event.target.value)}
              />
            </div>
          </section>

          <section className={bandClassName()}>
            <p className={sectionTitleClassName()}>What banj will do next</p>
            <div className="mt-4 grid gap-2 text-sm leading-6 text-muted-foreground">
              <p>banj will write a customer-side ticket event instead of creating a parallel Telegram order system.</p>
              <p>banj will write customer commercial events that flow into Overview, Record Update, and Financials.</p>
              <p>banj will attach Telegram channel metadata to the customer ticket party.</p>
              <p>banj will keep this intake out of supplier workflows and raw stock-count truth.</p>
            </div>
          </section>

          {error ? <p className="text-sm text-rose-700">{error}</p> : null}
        </div>

        <SheetFooter className="sticky bottom-0 z-10 border-t border-border/60 bg-white px-8 py-5">
          <div className="flex w-full flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-muted-foreground">
              {promotionAllowed
                ? 'This intake can promote into a customer ticket.'
                : 'Resolve every line and compute a quote before banj can promote this intake.'}
            </p>
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
      </SheetContent>
    </Sheet>
  );
}
