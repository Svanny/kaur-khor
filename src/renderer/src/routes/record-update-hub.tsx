import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
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
import { CenteredTileGrid } from '@/components/system/centered-tile-grid';
import { LiquidGridCardLayer, liquidGridCardBaseClassName } from '@/components/system/liquid-grid-card';
import { WorkspacePage, WorkspaceTitleCard } from '@/components/system/workspace';
import { RouteBackButton } from '@/components/system/page-navigation';
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
import { recordTicketOptions, openTicketSummaries, ticketLineMetadataLabel } from '@/lib/record-activity';
import { gridCardSurfaceClassName, type GridCardColorKey } from '@/lib/grid-card-colors';
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
  tone: GridCardColorKey;
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

function recordUpdateDraftStorage() {
  if (typeof window === 'undefined') {
    return null;
  }
  try {
    return window.localStorage ?? null;
  } catch {
    return null;
  }
}

function supplierBatchOptionDescription(language: ReturnType<typeof usePreferences>['language'], count: number, status: string) {
  return translateUiLiteral(language, '{count} {noun} · {status}', {
    count,
    noun: translateUiLiteral(language, count === 1 ? 'SKU' : 'SKUs'),
    status: translateUiLiteral(language, status.replaceAll('_', ' ')),
  });
}

const RECORD_UPDATE_HUB_CARDS: RecordUpdateHubCard[] = [
  {
    title: 'Stock Count',
    description: 'Count what is physically on hand and reconcile mistakes.',
    href: RECORD_UPDATE_STOCK_COUNT_PATH,
    icon: EntitySkuIcon,
    laneId: 'stock-count',
    tone: 'stock-count',
  },
  {
    title: 'Customer Order',
    description: 'Create a ticket-backed customer commitment or update an existing customer ticket.',
    icon: EntityRevenueIcon,
    laneId: 'customer-order-pending',
    tone: 'customer-order',
  },
  {
    title: 'Immediate Sale',
    description: 'Record a same-session sale as realized demand without framing it as order fulfillment.',
    href: RECORD_UPDATE_CUSTOMER_COMPLETED_PATH,
    icon: EntityServiceIcon,
    laneId: 'customer-order-completed',
    tone: 'immediate-sale',
  },
  {
    title: 'Supplier Order',
    description: 'Create a supplier ticket or update an existing supplier ticket, including receipts.',
    icon: ActionCreatePackageIcon,
    laneId: 'supplier-order-pending',
    tone: 'supplier-order',
  },
  {
    title: 'Custom',
    description: 'Choose multiple ticket-backed update lanes for one combined capture flow.',
    href: RECORD_UPDATE_CUSTOM_PATH,
    icon: ActionLayoutGridIcon,
    laneId: 'custom',
    tone: 'capture-update',
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

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasNonEmptyString(value: unknown) {
  return typeof value === 'string' && value.trim() !== '';
}

function hasObjectEntries(value: unknown) {
  return isObjectRecord(value) && Object.keys(value).length > 0;
}

function hasArrayEntries(value: unknown) {
  return Array.isArray(value) && value.length > 0;
}

function hasMeaningfulTicketDraftValue(draft: Record<string, unknown>) {
  return (
    hasNonEmptyString(draft.notes) ||
    hasNonEmptyString(draft.recordOrderExpectedArrivalDate) ||
    hasNonEmptyString(draft.recordOrderLeadTimeMeanDays) ||
    hasNonEmptyString(draft.recordOrderLeadTimeVariability) ||
    hasNonEmptyString(draft.recordReceiptReceivedDate) ||
    hasNonEmptyString(draft.deliveryFeeAmount) ||
    hasObjectEntries(draft.retailSalesDrafts) ||
    hasObjectEntries(draft.serviceSalesDrafts) ||
    hasObjectEntries(draft.skuSignalDrafts) ||
    hasObjectEntries(draft.serviceSignalDrafts) ||
    hasNonEmptyString(draft.regimeHint) ||
    hasArrayEntries(draft.serviceRankings) ||
    hasArrayEntries(draft.retailRankings) ||
    hasObjectEntries(draft.refundStockReturnDrafts) ||
    (
      isObjectRecord(draft.customerIdentity) &&
      (
        hasNonEmptyString(draft.customerIdentity.channel) ||
        hasNonEmptyString(draft.customerIdentity.customChannel) ||
        hasNonEmptyString(draft.customerIdentity.customerName) ||
        hasNonEmptyString(draft.customerIdentity.phone)
      )
    )
  );
}

function isSavedDraftMeaningful(rawDraft: string, laneId: RecordUpdateLaneId) {
  try {
    const parsed = JSON.parse(rawDraft) as unknown;
    if (!isObjectRecord(parsed) || parsed.version !== 1) {
      return false;
    }
    if (laneId !== 'customer-order-pending' && laneId !== 'supplier-order-pending') {
      return true;
    }
    return hasMeaningfulTicketDraftValue(parsed);
  } catch {
    return false;
  }
}

function hasMultipleTicketEntryActions({
  canEdit,
  canResumeDraft,
  showEdit,
}: Pick<TicketEntryPromptState, 'canEdit' | 'canResumeDraft' | 'showEdit'>) {
  return canResumeDraft || (showEdit && canEdit);
}

function hasDraftSavedForLane(laneId: RecordUpdateLaneId) {
  const storage = recordUpdateDraftStorage();
  if (!storage || typeof storage.getItem !== 'function') {
    return false;
  }
  const draftStorageKey = draftStorageKeyByLaneId.get(laneId);
  try {
    if (!draftStorageKey) {
      return false;
    }
    const rawDraft = storage.getItem(draftStorageKey);
    if (!rawDraft) {
      return false;
    }
    if (isSavedDraftMeaningful(rawDraft, laneId)) {
      return true;
    }
    storage.removeItem(draftStorageKey);
    return false;
  } catch {
    return false;
  }
}

function removeDraftSavedForLane(laneId: RecordUpdateLaneId) {
  const storage = recordUpdateDraftStorage();
  if (!storage || typeof storage.removeItem !== 'function') {
    return;
  }
  const draftStorageKey = draftStorageKeyByLaneId.get(laneId);
  if (draftStorageKey) {
    storage.removeItem(draftStorageKey);
  }
}

function HubCard({ card, onClick }: { card: RecordUpdateHubCard; onClick?: () => void }) {
  const CardIcon = card.icon;
  const { language } = usePreferences();
  const hasDraftSaved = hasDraftSavedForLane(card.laneId);
  const title = translateUiLiteral(language, card.title);
  const description = translateUiLiteral(language, card.description);
  const className = cn(
    liquidGridCardBaseClassName,
    card.rainbow
      ? 'border-fuchsia-200/80 bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.62),rgba(255,255,255,0.18)_34%,rgba(255,255,255,0.02)_100%),linear-gradient(135deg,rgba(239,68,68,0.16),rgba(245,158,11,0.15)_18%,rgba(234,179,8,0.15)_34%,rgba(34,197,94,0.14)_50%,rgba(14,165,233,0.15)_66%,rgba(99,102,241,0.15)_82%,rgba(217,70,239,0.16))]'
      : gridCardSurfaceClassName(card.tone),
  );
  const contents = (
    <>
      <LiquidGridCardLayer />
      <div className="relative z-10 flex h-full flex-col items-center justify-center gap-4 px-4 py-5 text-center sm:px-6 md:gap-6 md:px-8 md:py-6">
        <CardIcon className="size-12 shrink-0 sm:size-16 md:size-20" />
        <div className="space-y-2 md:space-y-3">
          <h2
            className="khmer-safe-display text-lg font-semibold text-foreground sm:text-xl md:text-2xl"
            data-slot="centered-tile-card-title"
          >
            {title}
          </h2>
          <p
            className="min-h-[3.75rem] max-w-[18rem] text-xs leading-5 text-muted-foreground sm:text-sm sm:leading-6 md:min-h-[4.5rem]"
            data-slot="centered-tile-card-summary"
          >
            {description}
          </p>
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
    </>
  );

  if (onClick) {
    return (
      <button
        aria-label={title}
        className={cn(className, 'h-full w-full min-w-0 cursor-pointer')}
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
      className={cn(className, 'h-full w-full min-w-0')}
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
                : 'Kaur Khor will create or update a durable ticket and append ticket events instead of writing a disconnected batch.',
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

export function RecordUpdateHubRoute({ embedded = false }: { embedded?: boolean } = {}) {
  const { language } = usePreferences();
  const { catalog, loadWorkSupportData, orderBatches, recordUpdateContext } = useInventory();
  const navigate = useNavigate();
  const [supportDataRequested, setSupportDataRequested] = useState(false);
  const [customDialogOpen, setCustomDialogOpen] = useState(false);
  const [confirmNewDiscardDraftOpen, setConfirmNewDiscardDraftOpen] = useState(false);
  const [ticketEntryPrompt, setTicketEntryPrompt] = useState<TicketEntryPromptState | null>(null);
  const [selectedCustomLaneIds, setSelectedCustomLaneIds] = useState<BaseRecordUpdateLaneId[]>([]);
  const baseCustomLanes = useMemo(() => BASE_RECORD_UPDATE_LANES, []);
  const canEditCustomerTicket = useMemo(
    () => openTicketSummaries(recordUpdateContext, 'customer').length > 0,
    [recordUpdateContext],
  );
  const canEditSupplierTicket = useMemo(
    () =>
      openTicketSummaries(recordUpdateContext, 'supplier').length > 0
      || orderBatches.some((batch) => batch.status !== 'received' && batch.status !== 'reviewed'),
    [orderBatches, recordUpdateContext],
  );
  const customerTicketOptions = useMemo<TicketPickerOption[]>(() => {
    return recordTicketOptions(recordUpdateContext, 'customer', catalog).map((option) => ({
      ...option,
      queryParam: 'ticketId',
    }));
  }, [catalog, recordUpdateContext]);
  const supplierTicketOptions = useMemo<TicketPickerOption[]>(() => {
    const fromTicketEvents = recordTicketOptions(recordUpdateContext, 'supplier', catalog).map((option) => ({
      ...option,
      queryParam: 'ticketId' as const,
    }));
    const fromLegacyBatches = orderBatches.flatMap((batch) => {
      if (batch.status === 'received' || batch.status === 'reviewed') {
        return [];
      }
      return [{
        id: batch.batchOrderId,
        label: batch.supplierName ?? batch.batchOrderId,
        description: supplierBatchOptionDescription(language, batch.children.length, batch.status),
        metadata: batch.children.length > 0
          ? batch.children.map((child) =>
              ticketLineMetadataLabel({
                entityType: 'sku',
                entityId: child.skuId,
                orderedQuantity: child.effective?.orderedQuantity ?? null,
              }, catalog),
            ).join(', ')
          : batch.shared.expectedArrivalAt ?? batch.updatedAt,
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
  }, [catalog, language, orderBatches, recordUpdateContext]);

  useEffect(() => {
    writeRecordUpdateSessionViewMode('pos');
  }, []);

  useEffect(() => {
    if (supportDataRequested || typeof loadWorkSupportData !== 'function') {
      return;
    }
    setSupportDataRequested(true);
    void loadWorkSupportData().catch((error) => {
      setSupportDataRequested(false);
      console.warn('[record-update-hub] work support data load failed', error);
    });
  }, [loadWorkSupportData, supportDataRequested]);

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
      const promptState: TicketEntryPromptState = {
        canEdit: canEditCustomerTicket,
        canResumeDraft: hasDraftSavedForLane(card.laneId),
        family: 'customer',
        href: RECORD_UPDATE_CUSTOMER_PENDING_PATH,
        laneId: card.laneId,
        mode: 'actions',
        options: customerTicketOptions,
        showEdit: true,
      };
      if (!hasMultipleTicketEntryActions(promptState)) {
        navigate(`${promptState.href}?ticketMode=new`);
        return;
      }
      setTicketEntryPrompt(promptState);
      return;
    }
    if (card.laneId === 'customer-order-completed') {
      const promptState: TicketEntryPromptState = {
        canEdit: false,
        canResumeDraft: hasDraftSavedForLane(card.laneId),
        family: 'customer',
        href: RECORD_UPDATE_CUSTOMER_COMPLETED_PATH,
        laneId: card.laneId,
        mode: 'actions',
        options: [],
        showEdit: false,
      };
      if (!hasMultipleTicketEntryActions(promptState)) {
        navigate(`${promptState.href}?ticketMode=new`);
        return;
      }
      setTicketEntryPrompt(promptState);
      return;
    }
    if (card.laneId === 'supplier-order-pending') {
      const promptState: TicketEntryPromptState = {
        canEdit: canEditSupplierTicket,
        canResumeDraft: hasDraftSavedForLane(card.laneId),
        family: 'supplier',
        href: RECORD_UPDATE_SUPPLIER_PENDING_PATH,
        laneId: card.laneId,
        mode: 'actions',
        options: supplierTicketOptions,
        showEdit: true,
      };
      if (!hasMultipleTicketEntryActions(promptState)) {
        navigate(`${promptState.href}?ticketMode=new`);
        return;
      }
      setTicketEntryPrompt(promptState);
    }
  }

  return (
    <WorkspacePage fitViewport className={embedded ? 'gap-4 p-0' : 'gap-5'}>
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
      {!embedded ? (
        <WorkspaceTitleCard
          title={
            <span className="flex min-w-0 items-center gap-3">
              <RouteBackButton className="shrink-0" />
              <span className="truncate">{translateUiLiteral(language, 'Capture')}</span>
            </span>
          }
          descriptor={translateUiLiteral(
            language,
            'Choose the physical, customer, or supplier ticket flow that matches the work you are recording.',
          )}
          helperExemptReason="Record update hub title is route framing; each selectable lane card carries the actionable workflow explanation."
        />
      ) : null}
      <CenteredTileGrid>
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
      </CenteredTileGrid>
    </WorkspacePage>
  );
}
