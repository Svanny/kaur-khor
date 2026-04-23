import type { CSSProperties } from 'react';
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { formatPhoneForDisplay } from '@shared/phone';
import {
  ActionAddBadgeIcon,
  ActionCloseIcon,
  ActionConfirmIcon,
  ActionCreatePackageIcon,
  ActionEditIcon,
  ActionLayoutGridIcon,
  ActionResumeIcon,
} from '@icons/actions';
import { EntityRevenueIcon, EntityServiceIcon, EntitySkuIcon } from '@icons/entities';
import type { IconComponent } from '@icons';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { ConfirmActionDialog } from '@/components/system/confirm-action-dialog';
import { WorkspacePage, WorkspaceTitleCard } from '@/components/system/workspace';
import {
  BASE_RECORD_UPDATE_LANES,
  RECORD_UPDATE_CUSTOM_PATH,
  RECORD_UPDATE_CUSTOMER_COMPLETED_PATH,
  RECORD_UPDATE_CUSTOMER_PENDING_PATH,
  RECORD_UPDATE_LANES,
  RECORD_UPDATE_STOCK_COUNT_PATH,
  RECORD_UPDATE_SUPPLIER_PENDING_PATH,
  type BaseRecordUpdateLaneId,
  type RecordUpdateLaneId,
} from '@/lib/record-update-routes';
import { writeRecordUpdateSessionViewMode } from '@/lib/record-update-session-view';
import { latestTicketEvents, ticketLabel } from '@/lib/ticketing';
import { tintedSurfaceClassName, type TintedSurfaceTone } from '@/lib/state-tones';
import { translateUiLiteral } from '@/lib/translations';
import { cn } from '@/lib/utils';
import { useInventory } from '@/state/inventory';
import { usePreferences } from '@/state/preferences';

interface RecordUpdateHubCard {
  title: string;
  description: string;
  href?: string;
  icon: IconComponent;
  laneId: RecordUpdateLaneId;
  tone: TintedSurfaceTone;
  rainbow?: boolean;
}

interface TicketEntryPromptState {
  canEdit: boolean;
  canResumeDraft: boolean;
  family: 'customer' | 'supplier';
  href: string;
  laneId: RecordUpdateLaneId;
  mode: 'actions' | 'edit';
  options: TicketPickerOption[];
  showEdit: boolean;
}

interface TicketPickerOption {
  description: string;
  id: string;
  label: string;
  metadata: string;
  queryParam: 'batchOrderId' | 'ticketId';
}

const draftStorageKeyByLaneId = new Map(RECORD_UPDATE_LANES.map((lane) => [lane.id, lane.draftStorageKey]));

const RECORD_UPDATE_HUB_CARDS: RecordUpdateHubCard[] = [
  {
    title: 'Stock Count',
    description: 'Count what is physically on hand and reconcile mistakes.',
    href: RECORD_UPDATE_STOCK_COUNT_PATH,
    icon: EntitySkuIcon,
    laneId: 'stock-count',
    tone: 'info',
  },
  {
    title: 'Customer Order',
    description: 'Create a ticket-backed customer commitment or update an existing customer ticket.',
    icon: EntityRevenueIcon,
    laneId: 'customer-order-pending',
    tone: 'success',
  },
  {
    title: 'Immediate Sale',
    description: 'Record a same-session sale as realized demand without framing it as order fulfillment.',
    href: RECORD_UPDATE_CUSTOMER_COMPLETED_PATH,
    icon: EntityServiceIcon,
    laneId: 'customer-order-completed',
    tone: 'danger',
  },
  {
    title: 'Supplier Order',
    description: 'Create a supplier ticket or update an existing supplier ticket, including receipts.',
    icon: ActionCreatePackageIcon,
    laneId: 'supplier-order-pending',
    tone: 'warning',
  },
  {
    title: 'Custom',
    description: 'Choose multiple ticket-backed update lanes for one combined capture flow.',
    href: RECORD_UPDATE_CUSTOM_PATH,
    icon: ActionLayoutGridIcon,
    laneId: 'custom',
    tone: 'info',
    rainbow: true,
  },
];
const VISIBLE_HUB_CARDS: RecordUpdateHubCard[] = [
  RECORD_UPDATE_HUB_CARDS[0]!,
  RECORD_UPDATE_HUB_CARDS[3]!,
  RECORD_UPDATE_HUB_CARDS[2]!,
  RECORD_UPDATE_HUB_CARDS[1]!,
];
const hubCardByLaneId = new Map(RECORD_UPDATE_HUB_CARDS.map((card) => [card.laneId, card]));

function hasDraftSavedForLane(laneId: RecordUpdateLaneId) {
  if (
    typeof window === 'undefined' ||
    !window.localStorage ||
    typeof window.localStorage.getItem !== 'function'
  ) {
    return false;
  }
  const draftStorageKey = draftStorageKeyByLaneId.get(laneId);
  try {
    return draftStorageKey ? window.localStorage.getItem(draftStorageKey) !== null : false;
  } catch {
    return false;
  }
}

function removeDraftSavedForLane(laneId: RecordUpdateLaneId) {
  if (
    typeof window === 'undefined' ||
    !window.localStorage ||
    typeof window.localStorage.removeItem !== 'function'
  ) {
    return;
  }
  const draftStorageKey = draftStorageKeyByLaneId.get(laneId);
  if (draftStorageKey) {
    window.localStorage.removeItem(draftStorageKey);
  }
}

function HubCard({ card, onClick }: { card: RecordUpdateHubCard; onClick?: () => void }) {
  const CardIcon = card.icon;
  const { language } = usePreferences();
  const hasDraftSaved = hasDraftSavedForLane(card.laneId);
  const title = translateUiLiteral(language, card.title);
  const description = translateUiLiteral(language, card.description);
  const className = cn(
    'group flex aspect-square w-[var(--hub-tile-size)] min-h-0 flex-col rounded-[2rem] border px-8 py-6 shadow-[0_22px_50px_rgba(48,31,20,0.10)] transition duration-200 hover:-translate-y-1 hover:border-foreground/30 hover:shadow-[0_28px_60px_rgba(48,31,20,0.16)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/70',
    card.rainbow
      ? 'border-fuchsia-200/80 bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.62),rgba(255,255,255,0.18)_34%,rgba(255,255,255,0.02)_100%),linear-gradient(135deg,rgba(239,68,68,0.16),rgba(245,158,11,0.15)_18%,rgba(234,179,8,0.15)_34%,rgba(34,197,94,0.14)_50%,rgba(14,165,233,0.15)_66%,rgba(99,102,241,0.15)_82%,rgba(217,70,239,0.16))]'
      : tintedSurfaceClassName(card.tone),
    !card.rainbow
      ? 'bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.55),rgba(255,255,255,0.16)_36%,rgba(255,255,255,0.02)_100%)]'
      : null,
  );
  const contents = (
    <div className="flex h-full flex-col items-center justify-center gap-6 text-center">
      <CardIcon className="size-20 shrink-0" />
      <div className="space-y-3">
        <h2 className="text-2xl font-semibold tracking-[-0.04em] text-foreground">{title}</h2>
        <p className="min-h-[4.5rem] max-w-[18rem] text-sm leading-6 text-muted-foreground">{description}</p>
        <p
          aria-hidden={!hasDraftSaved}
          className={cn(
            'mx-auto inline-flex min-h-[1.625rem] min-w-[6.75rem] items-center justify-center rounded-full border border-primary/25 bg-primary/10 px-3 py-1 text-xs font-semibold text-primary',
            hasDraftSaved ? null : 'invisible',
          )}
        >
          {hasDraftSaved ? translateUiLiteral(language, 'Draft saved') : null}
        </p>
      </div>
    </div>
  );

  if (onClick) {
    return (
      <button
        aria-label={title}
        className={cn(className, 'cursor-pointer')}
        type="button"
        onClick={onClick}
      >
        {contents}
      </button>
    );
  }

  return (
    <Link
      aria-label={title}
      className={className}
      to={card.href ?? RECORD_UPDATE_CUSTOM_PATH}
    >
      {contents}
    </Link>
  );
}

function TicketEntryPromptDialog({
  canEdit,
  canResumeDraft,
  family,
  href,
  mode,
  options,
  showEdit,
  onClose,
  onOpenEdit,
  onRequestNewWithDraft,
}: Omit<TicketEntryPromptState, 'mode'> & {
  mode: 'actions' | 'edit';
  onClose: () => void;
  onOpenEdit: () => void;
  onRequestNewWithDraft: () => void;
}) {
  const { language } = usePreferences();
  const navigate = useNavigate();
  const newLabel = 'New';
  const resumeDraftLabel = 'Resume draft';
  const editLabel = 'Edit/Update';
  const title = mode === 'edit'
    ? translateUiLiteral(language, family === 'customer' ? 'Edit / update existing customer order' : 'Edit / update existing supplier order')
    : translateUiLiteral(language, 'What do you want to do?');

  function openTicketRoute(mode: 'new' | 'edit' | 'draft') {
    navigate(mode === 'draft' ? href : `${href}?ticketMode=${mode}`);
  }

  function openExistingTicket(option: TicketPickerOption) {
    navigate(`${href}?ticketMode=edit&${option.queryParam}=${encodeURIComponent(option.id)}`);
  }

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/30 px-4 py-6"
      role="presentation"
      onClick={onClose}
    >
      <section
        aria-describedby="record-update-ticket-entry-description"
        aria-labelledby="record-update-ticket-entry-title"
        aria-modal="true"
        className="w-full max-w-lg rounded-[1.75rem] border border-border/70 bg-background p-6 shadow-[0_24px_80px_rgba(0,0,0,0.18)]"
        role="dialog"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="space-y-2">
          <p id="record-update-ticket-entry-title" className="text-lg font-semibold tracking-[-0.03em] text-foreground">
            {title}
          </p>
          <p id="record-update-ticket-entry-description" className="text-sm leading-6 text-muted-foreground">
            {translateUiLiteral(
              language,
              mode === 'edit'
                ? 'Select the existing ticket you want to update.'
                : 'banj will create or update a durable ticket and append ticket events instead of writing a disconnected batch.',
            )}
          </p>
        </div>
        {mode === 'actions' ? (
          <div className="mt-6 flex flex-wrap justify-end gap-3">
            <Button type="button" variant="outline" onClick={canResumeDraft ? onRequestNewWithDraft : () => openTicketRoute('new')}>
              <ActionAddBadgeIcon className="size-4" />
              {translateUiLiteral(language, newLabel)}
            </Button>
            <Button disabled={!canResumeDraft} type="button" variant="outline" onClick={() => openTicketRoute('draft')}>
              <ActionResumeIcon className="size-4" />
              {translateUiLiteral(language, resumeDraftLabel)}
            </Button>
            {showEdit ? (
              <Button disabled={!canEdit} type="button" variant="outline" onClick={onOpenEdit}>
                <ActionEditIcon className="size-4" />
                {translateUiLiteral(language, editLabel)}
              </Button>
            ) : null}
          </div>
        ) : (
          <div className="mt-5 grid gap-3">
            <div className="max-h-72 overflow-auto rounded-2xl border border-border/70 bg-white">
              {options.length > 0 ? options.map((option) => (
                <button
                  key={`${option.queryParam}:${option.id}`}
                  className="grid w-full gap-1 border-b border-border/60 px-4 py-3 text-left last:border-b-0 hover:bg-muted/50"
                  type="button"
                  onClick={() => openExistingTicket(option)}
                >
                  <span className="flex items-center gap-2 font-medium text-foreground">
                    <ActionConfirmIcon className="size-4 text-muted-foreground" />
                    <span>{option.label}</span>
                  </span>
                  <span className="text-sm text-muted-foreground">{option.description}</span>
                  <span className="text-xs text-muted-foreground">{option.metadata}</span>
                </button>
              )) : (
                <p className="px-4 py-6 text-sm text-muted-foreground">
                  {translateUiLiteral(language, 'No existing open tickets were found. Start a new ticket instead.')}
                </p>
              )}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

export function RecordUpdateHubRoute() {
  const { language } = usePreferences();
  const { observations, orderBatches } = useInventory();
  const navigate = useNavigate();
  const [customDialogOpen, setCustomDialogOpen] = useState(false);
  const [confirmNewDiscardDraftOpen, setConfirmNewDiscardDraftOpen] = useState(false);
  const [ticketEntryPrompt, setTicketEntryPrompt] = useState<TicketEntryPromptState | null>(null);
  const [selectedCustomLaneIds, setSelectedCustomLaneIds] = useState<BaseRecordUpdateLaneId[]>([]);
  const baseCustomLanes = useMemo(() => BASE_RECORD_UPDATE_LANES, []);
  const ticketEvents = useMemo(() => latestTicketEvents(observations), [observations]);
  const canEditCustomerTicket = useMemo(
    () => ticketEvents.some((event) => event.ticketFamily === 'customer' && event.lifecycle === 'open'),
    [ticketEvents],
  );
  const canEditSupplierTicket = useMemo(
    () =>
      ticketEvents.some((event) => event.ticketFamily === 'supplier' && event.lifecycle === 'open')
      || orderBatches.some((batch) => batch.status !== 'received' && batch.status !== 'reviewed'),
    [orderBatches, ticketEvents],
  );
  const customerTicketOptions = useMemo<TicketPickerOption[]>(() => {
    const seen = new Set<string>();
    return ticketEvents.flatMap((event) => {
      if (event.ticketFamily !== 'customer' || event.lifecycle !== 'open' || seen.has(event.ticketId)) {
        return [];
      }
      seen.add(event.ticketId);
      const channel = event.party?.channelLabel ?? event.party?.channelKey ?? 'No channel';
      return [{
        id: event.ticketId,
        label: ticketLabel(event),
        description: `${channel} · ${event.lines.length} item${event.lines.length === 1 ? '' : 's'}`,
        metadata: event.party?.phone ? formatPhoneForDisplay(event.party.phone) : event.note ?? event.occurredAt,
        queryParam: 'ticketId',
      }];
    });
  }, [ticketEvents]);
  const supplierTicketOptions = useMemo<TicketPickerOption[]>(() => {
    const fromTicketEvents = ticketEvents.flatMap((event) => {
      if (event.ticketFamily !== 'supplier' || event.lifecycle !== 'open') {
        return [];
      }
      return [{
        id: event.ticketId,
        label: ticketLabel(event),
        description: event.party?.supplierName ?? event.stage,
        metadata: event.lines.map((line) => `${line.entityId}${line.orderedQuantity ? ` · ${line.orderedQuantity}u` : ''}`).join(', '),
        queryParam: 'ticketId' as const,
      }];
    });
    const fromLegacyBatches = orderBatches.flatMap((batch) => {
      if (batch.status === 'received' || batch.status === 'reviewed') {
        return [];
      }
      return [{
        id: batch.batchOrderId,
        label: batch.supplierName ?? batch.batchOrderId,
        description: `${batch.children.length} SKU${batch.children.length === 1 ? '' : 's'} · ${batch.status.replaceAll('_', ' ')}`,
        metadata: batch.shared.expectedArrivalAt ?? batch.updatedAt,
        queryParam: 'batchOrderId' as const,
      }];
    });
    const seen = new Set<string>();
    return [...fromTicketEvents, ...fromLegacyBatches].filter((option) => {
      if (seen.has(`${option.queryParam}:${option.id}`)) {
        return false;
      }
      seen.add(`${option.queryParam}:${option.id}`);
      return true;
    });
  }, [orderBatches, ticketEvents]);

  useEffect(() => {
    writeRecordUpdateSessionViewMode('pos');
  }, []);

  function toggleCustomLane(laneId: BaseRecordUpdateLaneId) {
    setSelectedCustomLaneIds((current) =>
      current.includes(laneId)
        ? current.filter((id) => id !== laneId)
        : [...current, laneId],
    );
  }

  function startCustomUpdate() {
    if (selectedCustomLaneIds.length === 0) {
      return;
    }
    const params = new URLSearchParams();
    params.set('lanes', selectedCustomLaneIds.join(','));
    setCustomDialogOpen(false);
    navigate(`${RECORD_UPDATE_CUSTOM_PATH}?${params.toString()}`);
  }

  function handleHubCardClick(card: RecordUpdateHubCard) {
    if (card.laneId === 'custom') {
      setCustomDialogOpen(true);
      return;
    }
    if (card.laneId === 'customer-order-pending') {
      setTicketEntryPrompt({
        canEdit: canEditCustomerTicket,
        canResumeDraft: hasDraftSavedForLane(card.laneId),
        family: 'customer',
        href: RECORD_UPDATE_CUSTOMER_PENDING_PATH,
        laneId: card.laneId,
        mode: 'actions',
        options: customerTicketOptions,
        showEdit: true,
      });
      return;
    }
    if (card.laneId === 'customer-order-completed') {
      setTicketEntryPrompt({
        canEdit: false,
        canResumeDraft: hasDraftSavedForLane(card.laneId),
        family: 'customer',
        href: RECORD_UPDATE_CUSTOMER_COMPLETED_PATH,
        laneId: card.laneId,
        mode: 'actions',
        options: [],
        showEdit: false,
      });
      return;
    }
    if (card.laneId === 'supplier-order-pending') {
      setTicketEntryPrompt({
        canEdit: canEditSupplierTicket,
        canResumeDraft: hasDraftSavedForLane(card.laneId),
        family: 'supplier',
        href: RECORD_UPDATE_SUPPLIER_PENDING_PATH,
        laneId: card.laneId,
        mode: 'actions',
        options: supplierTicketOptions,
        showEdit: true,
      });
    }
  }

  return (
    <WorkspacePage className="gap-5">
      {ticketEntryPrompt && !confirmNewDiscardDraftOpen ? (
        <TicketEntryPromptDialog
          canEdit={ticketEntryPrompt.canEdit}
          canResumeDraft={ticketEntryPrompt.canResumeDraft}
          family={ticketEntryPrompt.family}
          href={ticketEntryPrompt.href}
          laneId={ticketEntryPrompt.laneId}
          mode={ticketEntryPrompt.mode}
          options={ticketEntryPrompt.options}
          showEdit={ticketEntryPrompt.showEdit}
          onClose={() => setTicketEntryPrompt(null)}
          onOpenEdit={() =>
            setTicketEntryPrompt((current) => (current ? { ...current, mode: 'edit' } : current))
          }
          onRequestNewWithDraft={() => setConfirmNewDiscardDraftOpen(true)}
        />
      ) : null}
      <ConfirmActionDialog
        cancelLabel={translateUiLiteral(language, 'Keep draft')}
        confirmLabel={translateUiLiteral(language, 'Delete draft and start new')}
        description={translateUiLiteral(language, 'Starting a new update will permanently delete the saved draft for this lane. Resume the draft instead if you want to keep it.')}
        open={confirmNewDiscardDraftOpen}
        title={translateUiLiteral(language, 'Delete saved draft?')}
        onCancel={() => setConfirmNewDiscardDraftOpen(false)}
        onConfirm={() => {
          if (!ticketEntryPrompt) {
            setConfirmNewDiscardDraftOpen(false);
            return;
          }
          const nextHref = ticketEntryPrompt.href;
          removeDraftSavedForLane(ticketEntryPrompt.laneId);
          setTicketEntryPrompt(null);
          setConfirmNewDiscardDraftOpen(false);
          navigate(`${nextHref}?ticketMode=new`);
        }}
      />
      {customDialogOpen ? (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/30 px-4 py-6"
          role="presentation"
          onClick={() => setCustomDialogOpen(false)}
        >
          <div
            aria-describedby="custom-update-dialog-description"
            aria-labelledby="custom-update-dialog-title"
            aria-modal="true"
            className="w-full max-w-lg rounded-[1.75rem] border border-border/70 bg-background p-6 shadow-[0_24px_80px_rgba(0,0,0,0.18)]"
            role="dialog"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="space-y-2">
              <p id="custom-update-dialog-title" className="text-lg font-semibold tracking-[-0.03em] text-foreground">
                {translateUiLiteral(language, 'Build a custom update')}
              </p>
              <p id="custom-update-dialog-description" className="text-sm leading-6 text-muted-foreground">
                {translateUiLiteral(language, 'Choose any lanes to include in one combined update wizard.')}
              </p>
            </div>
            <div className="mt-5 grid gap-1">
              {baseCustomLanes.map((lane) => {
                const checked = selectedCustomLaneIds.includes(lane.id);
                const checkboxId = `custom-lane-${lane.id}`;
                const LaneIcon = hubCardByLaneId.get(lane.id)?.icon ?? ActionLayoutGridIcon;
                return (
                  <div
                    key={lane.id}
                    className={cn(
                      'flex min-h-12 cursor-pointer items-center gap-3 px-1 py-2 text-sm font-medium text-foreground transition hover:bg-muted/35 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/70',
                      checked ? 'text-primary' : null,
                    )}
                    role="button"
                    tabIndex={0}
                    onClick={() => toggleCustomLane(lane.id)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        toggleCustomLane(lane.id);
                      }
                    }}
                  >
                    <Checkbox
                      aria-label={translateUiLiteral(language, lane.title)}
                      checked={checked}
                      id={checkboxId}
                      onClick={(event) => event.stopPropagation()}
                      onCheckedChange={() => toggleCustomLane(lane.id)}
                    />
                    <LaneIcon className="size-5 shrink-0 text-current" />
                    <span>{translateUiLiteral(language, lane.title)}</span>
                  </div>
                );
              })}
            </div>
            {selectedCustomLaneIds.length === 0 ? (
              <p className="mt-4 text-sm text-muted-foreground">
                {translateUiLiteral(language, 'Choose at least one update lane.')}
              </p>
            ) : null}
            <div className="mt-6 flex flex-wrap justify-end gap-3">
              <Button type="button" variant="ghost" onClick={() => setCustomDialogOpen(false)}>
                <ActionCloseIcon data-icon="inline-start" />
                {translateUiLiteral(language, 'Cancel')}
              </Button>
              <Button
                disabled={selectedCustomLaneIds.length === 0}
                type="button"
                onClick={startCustomUpdate}
              >
                <ActionConfirmIcon data-icon="inline-start" />
                {translateUiLiteral(language, 'Start custom update')}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
      <WorkspaceTitleCard
        eyebrow={translateUiLiteral(language, 'Record update')}
        title={translateUiLiteral(language, 'Choose an update lane')}
        descriptor={translateUiLiteral(
          language,
          'banj removes the legacy batch update system in favor of a ticketing system. Choose the physical, customer, or supplier ticket flow that matches the work you are recording.',
        )}
      />
      <div className="flex min-h-[calc(100svh-20rem)] items-center justify-center">
        <div
          className="grid w-full max-w-[46rem] grid-cols-1 justify-items-center gap-4 md:grid-cols-2"
          style={
            {
              '--hub-tile-size': 'min(22rem, calc((100vw - 9rem) / 2), calc((100svh - 19rem) / 2))',
            } as CSSProperties
          }
        >
          {VISIBLE_HUB_CARDS.map((card) => (
            <HubCard
              key={card.title}
              card={card}
              onClick={
                card.laneId === 'customer-order-pending' || card.laneId === 'customer-order-completed' || card.laneId === 'supplier-order-pending'
                  ? () => handleHubCardClick(card)
                  : undefined
              }
            />
          ))}
        </div>
      </div>
    </WorkspacePage>
  );
}
