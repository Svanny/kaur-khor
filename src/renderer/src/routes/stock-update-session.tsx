import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState, type CSSProperties, type FormEvent, type ReactNode, type Ref } from 'react';
import { createPortal } from 'react-dom';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Dialog as DialogPrimitive } from 'radix-ui';
import {
  closestCenter,
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragCancelEvent,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import {
  defaultAnimateLayoutChanges,
  SortableContext,
  arrayMove,
  rectSortingStrategy,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  ActionAddBadgeIcon,
  ActionClipboardAddIcon,
  ActionCloseIcon,
  ActionConfirmIcon,
  ActionCreatePackageIcon,
  ActionDragHandleIcon,
  ActionDeleteIcon,
  ActionEditIcon,
  ActionReceiveInventoryIcon,
  ActionSaveIcon,
  ActionUndoIcon,
  ActionZoomInIcon,
  ActionZoomOutIcon,
} from '@icons/actions';
import { getRegimeIcon } from '@icons/domain';
import {
  EntityCallChannelIcon,
  EntityCustomChannelIcon,
  EntityCustomerIcon,
  EntityDeliveryIcon,
  EntityFacebookChannelIcon,
  EntityFlagIcon,
  EntityLayersIcon,
  EntityNoChannelIcon,
  EntityOverflowMenuIcon,
  EntityReceiptDocumentIcon,
  EntityServiceIcon,
  EntitySkuIcon,
  EntitySmsChannelIcon,
  EntityTelegramChannelIcon,
  EntityWalkInChannelIcon,
  EntityWhatsAppChannelIcon,
} from '@icons/entities';
import { NavigationBackIcon, NavigationNextIcon, NavigationPreviousIcon } from '@icons/navigation';
import {
  StatusGaugeIcon,
  StatusReadyIcon,
  StatusScheduleIcon,
  StatusTimingIcon,
  StatusUnavailableIcon,
  StatusWarningIcon,
} from '@icons/status';
import type { IconComponent } from '@icons';
import type {
  SenaCatalog,
  SenaDeliveryFeeBucket,
  SenaDeliveryFeeMetadata,
  SenaDeliveryFeePayer,
  SenaLeadTimeVariabilityClass,
  SenaObservationInput,
  SenaObservationRegimeHint,
  SenaStockSnapshot,
  SenaTicketEvent,
  SenaTicketEventType,
  SenaTicketLifecycle,
  SenaTicketStage,
} from '@shared/sena';
import type { AppLanguage, InventorySnapshot, RankingEntry, RankingEntryType, SistOverview } from '@shared/inventory';
import {
  DESKTOP_WORKBENCH_TILE_ORDER_LANE_IDS,
  type DesktopWorkbenchTileOrderLaneId,
} from '@shared/ipc';
import { formatPhoneForDisplay, normalizePhoneNumber } from '@shared/phone';
import {
  classifyLeadTimeVariability,
  compatibilityRangeForClass,
  impliedLeadTimeRangeFromMeanStd,
  leadTimeVariabilityOptions,
} from '@shared/sena-lead-time';
import { HelpTooltip } from '@/components/system/help-tooltip';
import { AutoFitContainer } from '@/components/system/auto-fit-text';
import { ItemAvatar } from '@/components/system/item-identity';
import { MerchandisingEditor } from '@/components/system/merchandising-editor';
import { SearchInput } from '@/components/system/search-input';
import { headerActionSurfaceClassName } from '@/components/system/floating-title-actions';
import {
  createHeaderedTableLayout,
  HeaderedTable,
  HeaderedTableBody,
  HeaderedTableHeader,
  HeaderedTableHeaderCell,
  HeaderedTableMobileLabel,
  HeaderedTableRow,
  HeaderedTableCellStack,
} from '@/components/system/headered-table';
import {
  recordUpdateTableCellClassName,
  recordUpdateTableHeadClassName,
  recordUpdateTableHeaderClassName,
  recordUpdateTableRowClassName,
} from '@/components/system/record-update-table-styles';
import { StepWizard } from '@/components/system/step-wizard';
import { ServiceIdentityCell, SkuIdentityCell, SupplierFilter } from '@/components/system/supplier';
import { ConfirmActionDialog } from '@/components/system/confirm-action-dialog';
import { MetricRibbon } from '@/components/system/metric-ribbon';
import { WorkspaceActionRow, WorkspacePage, WorkspacePanel, WorkspaceTitleCard } from '@/components/system/workspace';
import { useDiscardChangesConfirm } from '@/hooks/use-route-leave-confirm';
import { Button } from '@/components/ui/button';
import { AnchoredMenu } from '@/components/ui/anchored-menu';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { buildCommercialEntitySnapshots } from '@/lib/commercial-flow';
import { displayMoneyFromUsd, formatCurrency, moneyInputStep, reformatMoneyDraftValue, usdMoneyFromDisplay } from '@/lib/format';
import { leadTimeVariabilityPlaceholderValue } from '@/lib/lead-time-variability-select';
import { translateLeadTimeVariabilityDescription, translateLeadTimeVariabilityLabel } from '@/lib/localized-display';
import { readRecordUpdateEditSession } from '@/lib/observation-edit-session';
import {
  getRecordUpdateLane,
  isBaseRecordUpdateLaneId,
  parseCustomRecordUpdateLaneIds,
  RECORD_UPDATE_HUB_PATH,
  type BaseRecordUpdateLaneId,
} from '@/lib/record-update-routes';
import { readRecordUpdateSessionViewMode, type SessionViewMode } from '@/lib/record-update-session-view';
import { activeSenaCatalog, matchesServiceSupplier, matchesSkuSupplier, type SupplierFilterValue } from '@/lib/sena-catalog';
import { translateUiLiteral, type TranslationKey } from '@/lib/translations';
import {
  buildCustomerLinkDirectory,
  buildDeliveryFeeMetadata,
  buildTicketPartyMetadata,
  customerLinkWarning,
  deliveryFeeBucketForWorkflow,
  latestDeliveryFeeMetadata,
  latestTicketEvents,
  makeTicketId,
  normalizeTicketLookupValue,
  normalizeTicketPhone,
  summarizeDeliveryFee,
  TICKET_CHANNEL_PRESETS,
  ticketLabel,
  type CustomerIdentityDraft,
} from '@/lib/ticketing';
import { cn } from '@/lib/utils';
import { useInventory } from '@/state/inventory';
import { usePreferences } from '@/state/preferences';
import { actionSheetTextareaClassName } from './detail-action-sheet';
import { buildRankChangeByEntryKey } from './ranking-order';
import {
  applyStockRowOrder,
  buildStockRowOrderStorageKey,
  readStockRowOrder,
  reorderStockRows,
  writeStockRowOrder,
} from './stock-row-order';
import {
  applyWorkbenchTileOrder,
  mergeWorkbenchTileOrderForVisibleSubset,
} from './workbench-tile-order';
import { SectionLabel } from './sku-detail/section-heading';
import { formatSenaDateTime, formatSenaLongDate } from './sku-detail/format';
import {
  createEmptyObservationInput,
  hasStructuredObservationSignal,
  intervalDaysBetween,
  latestObservationAt,
  observationSignalCounts,
  observationCompositionParts,
} from './observation-payload';

type StockView = 'priority' | 'counted' | 'all';
type PosMetadataPopupId = 'timing' | 'customer' | 'notes' | 'context' | 'delivery';
type PosWorkbenchFilterId = 'all' | 'services' | 'skus' | 'recent' | 'touched';
type StockoutFlagValue = 'blocked' | 'stockout';
type StockEventDropdownValue = 'none' | StockoutFlagValue;
type StockUpdateStepId =
  | 'observed-at'
  | 'report-notes'
  | 'stock'
  | 'reorder'
  | 'receipt'
  | 'retail-sales'
  | 'service-sales'
  | 'stock-cost'
  | 'stock-price'
  | 'stock-flags'
  | 'service'
  | 'rankings'
  | 'context'
  | 'review';
type SkuFlagId = 'ordered' | 'received' | 'blocked';
type ServiceFlagId = 'price' | 'blocked';
type OptionalStockStepChoice = 'unset' | 'yes' | 'no';
type OptionalStockStepId = 'stock-cost' | 'stock-price' | 'stock-flags';
type CustomerPendingMode = 'new_pending' | 'modify_pending' | 'cancel_pending';
type CustomerCompletedMode = 'from_pending' | 'immediate_sale' | 'refund_reversal';
type SupplierPendingMode = 'new_supplier_order' | 'update_pending_supplier_order' | 'cancel_supplier_order';
type SupplierReceiptMode = 'against_pending_supplier_order' | 'immediate_purchase' | 'return_receipt_reversal';
type RefundStockReturnChoice = 'later' | 'now';
type TicketAuthoringMode = 'new' | 'edit';
type SupplierTicketUpdateAction = 'revise_order' | 'revise_eta' | 'partial_received' | 'fully_received' | 'followup_logged' | 'canceled';
type WorkflowStateFilterValue = CustomerPendingMode | CustomerCompletedMode | SupplierPendingMode | SupplierReceiptMode;
type WorkflowStateFilterKind = 'order' | 'receipt';
type WorkbenchReorderLaneId = DesktopWorkbenchTileOrderLaneId;

const WORKBENCH_REORDERABLE_LANE_IDS: WorkbenchReorderLaneId[] = [...DESKTOP_WORKBENCH_TILE_ORDER_LANE_IDS];
const WORKBENCH_REORDER_HOLD_DELAY_MS = 320;

interface PosWorkbenchTile {
  key: string;
  entityId: string;
  title: string;
  imagePath: string | null;
  itemType: 'sku' | 'service';
  kind: 'stock' | 'retail' | 'service' | 'supplier-order' | 'supplier-receipt';
  stepId: StockUpdateStepId;
  typeLabel: string;
  metaLabel: string;
  currentQuantity: number;
  baselineQuantity: number;
  unitAmount: number | null;
  recentAt: string | null;
  touched: boolean;
}

interface PosActiveLine {
  key: string;
  itemType: 'sku' | 'service';
  title: string;
  quantity: number;
  unitAmount: number | null;
  amountLabel: string;
  stepId: StockUpdateStepId;
  setQuantity: (value: number) => void;
  increment: () => void;
  decrement: () => void;
  remove: () => void;
}

interface PosReceiptTextLine {
  title: string;
  quantity: number;
  unitPriceLabel: string;
  totalLabel: string;
}

interface StockCountPosChangeField {
  key: 'units' | 'cost' | 'price' | 'flags';
  label: string;
  value: string;
}

interface StockCountPosChangeRow {
  key: string;
  skuId: string;
  title: string;
  imagePath: string | null;
  changedFields: StockCountPosChangeField[];
}

interface DeliveryFeeDraftState {
  amount: string;
  payer: SenaDeliveryFeePayer;
}

const posReceiptConfirmTableLayout = createHeaderedTableLayout({
  breakpoint: 'lg',
  columns: 'minmax(0, 0.9fr) 4rem minmax(0, 1.25fr)',
  gap: 4,
});

const stockCountPosSummaryTableLayout = createHeaderedTableLayout({
  breakpoint: 'lg',
  columns: 'minmax(0, 0.82fr) 7rem minmax(0, 1.24fr)',
  gap: 4,
});

function posDialogQuantityValue(quantity: number) {
  return String(Math.max(1, Math.trunc(quantity || 0)));
}

function parsePosQuantityInput(value: string, minimum = 0) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return minimum;
  }
  return Math.max(minimum, Math.trunc(parsed));
}

function StockCountPosChangeTable({
  changedRows,
  emptyState,
  language,
  onOpenRow,
}: {
  changedRows: StockCountPosChangeRow[];
  emptyState: string;
  language: AppLanguage;
  onOpenRow?: (row: StockCountPosChangeRow) => void;
}) {
  if (changedRows.length === 0) {
    return (
      <p className="rounded-2xl border border-dashed border-border/70 bg-background/80 px-3 py-4 text-sm text-muted-foreground">
        {emptyState}
      </p>
    );
  }

  return (
    <div style={stockCountPosSummaryTableLayout.style}>
      <HeaderedTable className={stockCountPosSummaryTableLayout.containerClassName} variant="overview">
        <HeaderedTableHeader className={stockCountPosSummaryTableLayout.headerClassName}>
          <HeaderedTableHeaderCell>{translateUiLiteral(language, 'Item')}</HeaderedTableHeaderCell>
          <HeaderedTableHeaderCell align="center">{translateUiLiteral(language, 'Changed')}</HeaderedTableHeaderCell>
          <HeaderedTableHeaderCell>{translateUiLiteral(language, 'Details')}</HeaderedTableHeaderCell>
        </HeaderedTableHeader>
        <HeaderedTableBody className={stockCountPosSummaryTableLayout.bodyClassName}>
          {changedRows.map((row) => {
            const interactive = Boolean(onOpenRow);
            return (
              <HeaderedTableRow
                aria-label={interactive ? translateUiLiteral(language, 'Edit {name} changed item', { name: row.title }) : undefined}
                key={row.key}
                className={cn(
                  stockCountPosSummaryTableLayout.rowClassName,
                  'items-start',
                  interactive &&
                    'cursor-pointer transition-colors hover:bg-emerald-50/80 focus-visible:bg-emerald-50/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600/35',
                )}
                role={interactive ? 'button' : undefined}
                tabIndex={interactive ? 0 : undefined}
                onClick={interactive ? () => onOpenRow?.(row) : undefined}
                onKeyDown={
                  interactive
                    ? (event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault();
                          onOpenRow?.(row);
                        }
                      }
                    : undefined
                }
              >
                <HeaderedTableCellStack
                  primary={row.title}
                  primaryClassName="font-semibold tracking-[-0.02em]"
                />
                <div className="min-w-0">
                  <HeaderedTableMobileLabel className={stockCountPosSummaryTableLayout.mobileLabelClassName}>
                    {translateUiLiteral(language, 'Changed')}
                  </HeaderedTableMobileLabel>
                  <p className="text-center font-medium text-foreground tabular-nums">
                    {translateUiLiteral(language, '{count} field{suffix}', {
                      count: row.changedFields.length,
                      suffix: row.changedFields.length === 1 ? '' : 's',
                    })}
                  </p>
                </div>
                <div className="grid gap-1 text-sm">
                  <HeaderedTableMobileLabel className={stockCountPosSummaryTableLayout.mobileLabelClassName}>
                    {translateUiLiteral(language, 'Details')}
                  </HeaderedTableMobileLabel>
                  {row.changedFields.map((field) => (
                    <p key={field.key} className="flex items-baseline justify-between gap-3 whitespace-nowrap">
                      <span className="text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                        {field.label}
                      </span>
                      <span className="text-right font-medium text-foreground tabular-nums">{field.value}</span>
                    </p>
                  ))}
                </div>
              </HeaderedTableRow>
            );
          })}
        </HeaderedTableBody>
      </HeaderedTable>
    </div>
  );
}

function isWorkbenchReorderLaneId(value: string): value is WorkbenchReorderLaneId {
  return WORKBENCH_REORDERABLE_LANE_IDS.includes(value as WorkbenchReorderLaneId);
}

function WorkbenchTileCard({
  tile,
}: {
  tile: PosWorkbenchTile;
}) {
  return (
    <>
      <div className="flex min-h-0 w-full flex-1 items-center justify-center">
        <ItemAvatar
          className="size-full rounded-[1.8rem] border-border/60 bg-white text-muted-foreground shadow-sm"
          imagePath={tile.imagePath}
          name={tile.title}
          size="hero"
          type={tile.itemType}
        />
      </div>
      <div className="flex min-h-[4.5rem] w-full items-center justify-center">
        <p
          className={cn(
            'mx-auto max-w-[12rem] text-balance text-center text-lg font-semibold tracking-[-0.03em]',
            tile.touched ? 'text-background' : 'text-foreground',
          )}
        >
          {tile.itemType === 'service' ? (
            <EntityServiceIcon data-icon="inline-start" className="mr-1 inline size-4 align-[-0.125em]" />
          ) : (
            <EntitySkuIcon data-icon="inline-start" className="mr-1 inline size-4 align-[-0.125em]" />
          )}
          <span>{tile.title}</span>
        </p>
      </div>
    </>
  );
}

function WorkbenchTileQuantityPill({
  tile,
}: {
  tile: PosWorkbenchTile;
}) {
  if (tile.currentQuantity <= 0) {
    return null;
  }

  return (
    <span className="absolute right-2 top-2 z-20 translate-x-[28%] -translate-y-[28%]" data-slot="workbench-quantity-pill">
      <span
        className="inline-flex size-10 items-center justify-center rounded-full border border-foreground/45 bg-background text-foreground shadow-[0_8px_20px_rgba(48,31,20,0.12)]"
      >
        {tile.currentQuantity}
      </span>
    </span>
  );
}

function workbenchTileButtonClassName({
  isDragging = false,
  reorderMode = false,
}: {
  isDragging?: boolean;
  reorderMode?: boolean;
}) {
  return cn(
    'relative block w-full aspect-square min-h-0 h-auto overflow-visible',
    reorderMode && 'cursor-grab touch-none select-none',
    isDragging && 'z-20 cursor-grabbing',
  );
}

function workbenchTileShellClassName({
  isDragging = false,
  reorderMode = false,
  touched,
}: {
  isDragging?: boolean;
  reorderMode?: boolean;
  touched: boolean;
}) {
  return cn(
    'relative flex size-full min-h-0 flex-col items-center overflow-visible rounded-[1.45rem] border p-5 text-center transition-all',
    touched
      ? 'border-foreground/70 bg-foreground text-background shadow-[0_16px_44px_rgba(48,31,20,0.14)]'
      : 'border-border/70 bg-white hover:-translate-y-0.5 hover:border-foreground/30 hover:shadow-[0_14px_38px_rgba(48,31,20,0.10)]',
    reorderMode && !isDragging && 'motion-safe:animate-[banji-workbench-jiggle_120ms_cubic-bezier(0.36,0,0.22,1)_infinite_alternate]',
    isDragging && 'shadow-[0_24px_50px_rgba(48,31,20,0.22)]',
  );
}

function workbenchTileInnerClassName() {
  return 'relative flex size-full min-h-0 flex-col items-center justify-start overflow-visible text-inherit';
}

function WorkbenchTileVisual({
  isDragging = false,
  reorderMode = false,
  tile,
}: {
  isDragging?: boolean;
  reorderMode?: boolean;
  tile: PosWorkbenchTile;
}) {
  return (
    <div
      className={workbenchTileShellClassName({ isDragging, reorderMode, touched: tile.touched })}
      data-slot="workbench-tile-visual"
    >
      <div className={workbenchTileInnerClassName()}>
        <WorkbenchTileQuantityPill tile={tile} />
        <WorkbenchTileCard tile={tile} />
      </div>
    </div>
  );
}

function SortableWorkbenchTile({
  onHoldStart,
  onHoldEnd,
  tile,
  reorderMode,
  onActivate,
}: {
  onHoldStart: (tileKey: string) => void;
  onHoldEnd: () => void;
  tile: PosWorkbenchTile;
  reorderMode: boolean;
  onActivate: (tile: PosWorkbenchTile) => void;
}) {
  const {
    attributes,
    isDragging,
    listeners,
    setNodeRef,
    transform,
    transition,
  } = useSortable({
    id: tile.key,
    animateLayoutChanges: (args) => defaultAnimateLayoutChanges({ ...args, wasDragging: true }),
    transition: {
      duration: 240,
      easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
    },
  });

  return (
    <button
      {...attributes}
      {...listeners}
      className={cn(
        workbenchTileButtonClassName({ isDragging, reorderMode }),
        isDragging && 'opacity-0',
      )}
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
      }}
      type="button"
      onClick={() => {
        if (reorderMode) {
          return;
        }
        onActivate(tile);
      }}
      onPointerCancelCapture={onHoldEnd}
      onPointerDownCapture={() => onHoldStart(tile.key)}
      onPointerLeave={onHoldEnd}
      onPointerUpCapture={onHoldEnd}
    >
      <WorkbenchTileVisual isDragging={isDragging} reorderMode={reorderMode} tile={tile} />
    </button>
  );
}

function PosQuantityEditor({
  decrementLabel,
  incrementLabel,
  inputClassName,
  inputLabel,
  inputValue,
  language,
  onDecrement,
  onIncrement,
  onInputChange,
  showLabel = false,
  size = 'default',
}: {
  decrementLabel: string;
  incrementLabel: string;
  inputClassName?: string;
  inputLabel: string;
  inputValue: string;
  language: AppLanguage;
  onDecrement: () => void;
  onIncrement: () => void;
  onInputChange: (value: string) => void;
  showLabel?: boolean;
  size?: 'compact' | 'default';
}) {
  const buttonClassName =
    size === 'compact'
      ? 'inline-flex shrink-0 items-center justify-center rounded-full border border-border/70 bg-background text-foreground transition-colors hover:border-foreground/30'
      : 'inline-flex shrink-0 items-center justify-center rounded-full border border-border/70 bg-background text-foreground transition-colors hover:border-foreground/30';
  const resolvedInputClassName =
    size === 'compact'
      ? 'min-w-0 basis-0 rounded-full border-border/70 px-[0.65em] text-center shadow-none !text-[1em] md:!text-[1em] [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none'
      : 'min-w-0 rounded-full border-border/70 text-center shadow-none !text-[1em] md:!text-[1em] [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none';
  const controlsClassName =
    size === 'compact'
      ? 'mx-auto flex w-full max-w-[12em] items-center gap-[0.5em]'
      : 'grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3';
  const buttonStyle =
    size === 'compact'
      ? { width: '2em', height: '2em' }
      : { width: '2.75em', height: '2.75em' };
  const inputStyle =
    size === 'compact'
      ? { height: '2.25em', fontSize: 'inherit' }
      : { height: '2.75em', fontSize: 'inherit' };

  return (
    <div className="grid gap-2">
      {showLabel ? (
        <p className="text-center text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
          {translateUiLiteral(language, 'Qty')}
        </p>
      ) : null}
      <div className={controlsClassName}>
        <button aria-label={decrementLabel} className={buttonClassName} style={buttonStyle} type="button" onClick={onDecrement}>
          <ActionZoomOutIcon data-icon="inline-start" style={{ height: '1em', width: '1em' }} />
        </button>
        <Input
          aria-label={inputLabel}
          className={cn(resolvedInputClassName, inputClassName)}
          inputMode="numeric"
          style={inputStyle}
          type="number"
          value={inputValue}
          onChange={(event) => onInputChange(event.target.value)}
        />
        <button aria-label={incrementLabel} className={buttonClassName} style={buttonStyle} type="button" onClick={onIncrement}>
          <ActionZoomInIcon data-icon="inline-start" style={{ height: '1em', width: '1em' }} />
        </button>
      </div>
    </div>
  );
}

function PosReceiptLineEditor({
  currency,
  language,
  line,
  onOpen,
  usdToKhrExchangeRate,
}: {
  currency: 'USD' | 'KHR';
  language: AppLanguage;
  line: PosActiveLine;
  onOpen: () => void;
  usdToKhrExchangeRate: number;
}) {
  const unitPriceLabel =
    line.unitAmount == null
      ? translateUiLiteral(language, 'n/a')
      : formatCurrency(line.unitAmount, currency, language, usdToKhrExchangeRate);
  const totalLabel =
    line.unitAmount == null
      ? translateUiLiteral(language, '{count} units', { count: line.quantity })
      : formatCurrency(line.quantity * line.unitAmount, currency, language, usdToKhrExchangeRate);

  return (
    <AutoFitContainer
      aria-label={translateUiLiteral(language, 'Edit {name} receipt line', { name: line.title })}
      className="grid min-w-0 cursor-pointer items-center gap-3 rounded-2xl px-3 py-4 text-left transition-colors hover:bg-emerald-50/80 focus-visible:bg-emerald-50/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600/35"
      maxFontSizePx={16}
      minFontSizePx={8}
      role="button"
      tabIndex={0}
      style={{ gridTemplateColumns: 'minmax(0, 0.86fr) 3.5em minmax(0, 1.34fr)' }}
      onClick={onOpen}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onOpen();
        }
      }}
    >
      <div className="min-w-0">
        <p className="font-semibold leading-tight text-foreground" style={{ fontSize: '1em' }}>
          {line.title}
        </p>
      </div>
      <p className="min-w-0 text-center font-medium text-foreground tabular-nums" style={{ fontSize: '1em' }}>
        {line.quantity}
      </p>
      <div className="min-w-0">
        <div className="grid gap-[0.6em]" style={{ fontSize: '1em' }}>
          <div className="flex min-w-0 items-baseline justify-between gap-[0.75em] whitespace-nowrap">
            <span className="shrink-0 font-semibold uppercase tracking-[0.16em] text-muted-foreground" style={{ fontSize: '0.68em' }}>
              {translateUiLiteral(language, 'Unit price')}
            </span>
            <span className="min-w-0 text-right font-medium text-foreground tabular-nums">
              {unitPriceLabel}
            </span>
          </div>
          <div className="flex min-w-0 items-baseline justify-between gap-[0.75em] whitespace-nowrap">
            <span className="shrink-0 font-semibold uppercase tracking-[0.16em] text-muted-foreground" style={{ fontSize: '0.68em' }}>
              {translateUiLiteral(language, 'Total price')}
            </span>
            <span className="min-w-0 text-right font-semibold text-foreground tabular-nums">
              {totalLabel}
            </span>
          </div>
        </div>
      </div>
    </AutoFitContainer>
  );
}

const CUSTOMER_PENDING_MODE_OPTIONS = ['new_pending', 'modify_pending', 'cancel_pending'] as const satisfies readonly CustomerPendingMode[];
const CUSTOMER_COMPLETED_MODE_OPTIONS = ['immediate_sale', 'refund_reversal'] as const satisfies readonly CustomerCompletedMode[];
const SUPPLIER_PENDING_MODE_OPTIONS = ['new_supplier_order', 'update_pending_supplier_order', 'cancel_supplier_order'] as const satisfies readonly SupplierPendingMode[];
const SUPPLIER_RECEIPT_MODE_OPTIONS = ['immediate_purchase', 'against_pending_supplier_order', 'return_receipt_reversal'] as const satisfies readonly SupplierReceiptMode[];
const SUPPLIER_TICKET_UPDATE_ACTIONS = [
  'revise_order',
  'revise_eta',
  'partial_received',
  'fully_received',
  'followup_logged',
  'canceled',
] as const satisfies readonly SupplierTicketUpdateAction[];
const DEFAULT_CUSTOMER_IDENTITY: CustomerIdentityDraft = {
  channel: '',
  customChannel: '',
  customerName: '',
  phone: '',
};

type StockRow = SenaStockSnapshot;
type SalesCountDrafts = Record<string, string>;

interface SkuSignalDraft {
  orderEnabled: boolean;
  orderedQuantity: string;
  leadTimeMeanDays: string;
  leadTimeVariability: SenaLeadTimeVariabilityClass | '';
  expectedArrivalDate: string;
  receiptEnabled: boolean;
  receiptQuantity: string;
  blockedEnabled: boolean;
  blockedState: StockoutFlagValue;
}

interface ServiceSignalDraft {
  priceEnabled: boolean;
  price: string;
  blockedEnabled: boolean;
  blockedState: StockoutFlagValue;
}

interface StockUpdateSessionDraft {
  version: 1;
  savedAt: string;
  customSelectedLaneIds: BaseRecordUpdateLaneId[];
  currentStepId: StockUpdateStepId;
  unlockedStepCount: number;
  observedAt: string;
  notes: string;
  stockView: StockView;
  rows: StockRow[];
  recordOrderExpectedArrivalDate: string;
  recordOrderLeadTimeMeanDays: string;
  recordOrderLeadTimeVariability: SenaLeadTimeVariabilityClass | '';
  recordReceiptReceivedDate: string;
  deliveryFeeAmount: string;
  deliveryFeePayer: SenaDeliveryFeePayer;
  retailSalesChoice: OptionalStockStepChoice;
  serviceSalesChoice: OptionalStockStepChoice;
  retailSalesDrafts: SalesCountDrafts;
  serviceSalesDrafts: SalesCountDrafts;
  skuSignalDrafts: Record<string, SkuSignalDraft>;
  stockStepChoices: Record<OptionalStockStepId, OptionalStockStepChoice>;
  serviceSignalDrafts: Record<string, ServiceSignalDraft>;
  regimeHint: SenaObservationRegimeHint | '';
  serviceRankings: string[];
  retailRankings: string[];
  customerPendingMode: CustomerPendingMode;
  customerCompletedMode: CustomerCompletedMode;
  supplierPendingMode: SupplierPendingMode;
  supplierReceiptMode: SupplierReceiptMode;
  customerTicketMode: TicketAuthoringMode | null;
  supplierTicketMode: TicketAuthoringMode | null;
  selectedCustomerTicketId: string | null;
  selectedSupplierTicketId: string | null;
  supplierTicketUpdateAction: SupplierTicketUpdateAction;
  customerIdentity: CustomerIdentityDraft;
  refundStockReturnDrafts: Record<string, RefundStockReturnChoice>;
}

interface StockUpdateDraftState {
  catalog: SenaCatalog | null;
  customSelectedLaneIds: BaseRecordUpdateLaneId[];
  currentStepId: StockUpdateStepId;
  initialObservedAt: string;
  notes: string;
  observedAt: string;
  regimeHint: SenaObservationRegimeHint | '';
  retailSalesChoice: OptionalStockStepChoice;
  retailSalesDrafts: SalesCountDrafts;
  retailRankings: string[];
  rows: StockRow[];
  recordOrderExpectedArrivalDate: string;
  recordOrderLeadTimeMeanDays: string;
  recordOrderLeadTimeVariability: SenaLeadTimeVariabilityClass | '';
  recordReceiptReceivedDate: string;
  deliveryFeeAmount: string;
  deliveryFeePayer: SenaDeliveryFeePayer;
  deliveryFeeBaselineAmount: string;
  deliveryFeeBaselinePayer: SenaDeliveryFeePayer;
  serviceSalesChoice: OptionalStockStepChoice;
  serviceSalesDrafts: SalesCountDrafts;
  serviceRankings: string[];
  serviceSignalDrafts: Record<string, ServiceSignalDraft>;
  skuSignalDrafts: Record<string, SkuSignalDraft>;
  stockStepChoices: Record<OptionalStockStepId, OptionalStockStepChoice>;
  stockBySku: Map<string, SenaStockSnapshot>;
  stockView: StockView;
  unlockedStepCount: number;
  customerPendingMode: CustomerPendingMode;
  customerCompletedMode: CustomerCompletedMode;
  supplierPendingMode: SupplierPendingMode;
  supplierReceiptMode: SupplierReceiptMode;
  customerTicketMode: TicketAuthoringMode | null;
  supplierTicketMode: TicketAuthoringMode | null;
  selectedCustomerTicketId: string | null;
  selectedSupplierTicketId: string | null;
  supplierTicketUpdateAction: SupplierTicketUpdateAction;
  customerIdentity: CustomerIdentityDraft;
  refundStockReturnDrafts: Record<string, RefundStockReturnChoice>;
}

type HydratedStockUpdateState = Omit<StockUpdateDraftState, 'catalog' | 'initialObservedAt' | 'stockBySku'>;

interface EditSessionState {
  observationId: string;
  input: ReturnType<typeof createEmptyObservationInput>;
}

interface PendingNavigationState {
  continueNavigation: () => void;
}

const EMPTY_SIST_OVERVIEW: SistOverview = {
  status: {
    state: 'empty',
    updatedAt: null,
    reportCount: 0,
    confidence: 'low',
    reason: null,
  },
  settings: {
    targetServiceLevel: 0.95,
    reviewPeriodDays: 7,
    maxLeadTimeDays: 30,
    changePointThreshold: 0.5,
    lowStockoutRiskThreshold: 0.1,
    highStockoutRiskThreshold: 0.5,
    lowCoverageDaysThreshold: 3,
    highCoverageDaysThreshold: 14,
    staleAfterHours: 48,
    forecastHorizonDays: 30,
    reportSmoothWindow: 8,
  },
  asOf: null,
  topRegime: null,
  pendingReorderCount: 0,
  highRiskSkuIds: [],
  skuInsights: [],
  metadata: null,
};

const STOCK_UPDATE_FULL_STEP_ORDER: StockUpdateStepId[] = ['observed-at', 'report-notes', 'stock', 'service', 'rankings', 'context', 'review'];
const STOCK_COUNT_STEP_ORDER: StockUpdateStepId[] = ['observed-at', 'report-notes', 'stock', 'stock-cost', 'stock-price', 'stock-flags', 'context', 'review'];
const CUSTOMER_ORDER_PENDING_STEP_ORDER: StockUpdateStepId[] = ['observed-at', 'report-notes', 'retail-sales', 'service-sales', 'context', 'review'];
const CUSTOMER_ORDER_COMPLETED_STEP_ORDER: StockUpdateStepId[] = ['observed-at', 'report-notes', 'retail-sales', 'service-sales', 'stock-flags', 'context', 'review'];
const SUPPLIER_ORDER_PENDING_STEP_ORDER: StockUpdateStepId[] = ['observed-at', 'report-notes', 'reorder', 'receipt', 'stock-flags', 'context', 'review'];
const SUPPLIER_RECEIPT_STEP_ORDER: StockUpdateStepId[] = ['observed-at', 'report-notes', 'receipt', 'stock-flags', 'context', 'review'];
const BASE_RECORD_UPDATE_STEP_ORDER_BY_LANE: Record<BaseRecordUpdateLaneId, StockUpdateStepId[]> = {
  'stock-count': STOCK_COUNT_STEP_ORDER,
  'customer-order-pending': CUSTOMER_ORDER_PENDING_STEP_ORDER,
  'customer-order-completed': CUSTOMER_ORDER_COMPLETED_STEP_ORDER,
  'supplier-order-pending': SUPPLIER_ORDER_PENDING_STEP_ORDER,
  'supplier-receipt': SUPPLIER_RECEIPT_STEP_ORDER,
};
const BASE_RECORD_UPDATE_LANE_ORDER: BaseRecordUpdateLaneId[] = [
  'stock-count',
  'customer-order-pending',
  'customer-order-completed',
  'supplier-order-pending',
];
const POST_SAVE_RERUN_DELAY_MS = 5_000;
const OPTIONAL_STOCK_STEP_IDS: OptionalStockStepId[] = ['stock-cost', 'stock-price', 'stock-flags'];
const REPORT_NOTE_PLACEHOLDER_KEYS = [
  'stockUpdateNotesPlaceholderShiftContext',
  'stockUpdateNotesPlaceholderSupplierDelay',
  'stockUpdateNotesPlaceholderDisplayChange',
  'stockUpdateNotesPlaceholderNothingSpecial',
] as const satisfies readonly TranslationKey[];

function randomReportNotePlaceholderKey(): TranslationKey {
  return REPORT_NOTE_PLACEHOLDER_KEYS[Math.floor(Math.random() * REPORT_NOTE_PLACEHOLDER_KEYS.length)]!;
}

const STOCK_UPDATE_STEP_COPY: Record<
  StockUpdateStepId,
  {
    descriptionKey:
      | 'stockUpdateStepObservedAtDescription'
      | 'stockUpdateStepReportNotesDescription'
      | 'stockUpdateStepContextDescription'
      | 'stockUpdateStepStockDescription'
      | 'stockUpdateStepServiceDescription'
      | 'stockUpdateStepRankingsDescription'
      | 'stockUpdateStepReviewDescription';
    titleKey:
      | 'stockUpdateStepObservedAtTitle'
      | 'stockUpdateStepReportNotesTitle'
      | 'stockUpdateStepContextTitle'
      | 'stockUpdateStepStockTitle'
      | 'stockUpdateStepServiceTitle'
      | 'stockUpdateStepRankingsTitle'
      | 'stockUpdateStepReviewTitle';
  }
> = {
  'observed-at': {
    titleKey: 'stockUpdateStepObservedAtTitle',
    descriptionKey: 'stockUpdateStepObservedAtDescription',
  },
  'report-notes': {
    titleKey: 'stockUpdateStepReportNotesTitle',
    descriptionKey: 'stockUpdateStepReportNotesDescription',
  },
  context: {
    titleKey: 'stockUpdateStepContextTitle',
    descriptionKey: 'stockUpdateStepContextDescription',
  },
  stock: {
    titleKey: 'stockUpdateStepStockTitle',
    descriptionKey: 'stockUpdateStepStockDescription',
  },
  reorder: {
    titleKey: 'stockUpdateStepStockTitle',
    descriptionKey: 'stockUpdateStepStockDescription',
  },
  receipt: {
    titleKey: 'stockUpdateStepStockTitle',
    descriptionKey: 'stockUpdateStepStockDescription',
  },
  service: {
    titleKey: 'stockUpdateStepServiceTitle',
    descriptionKey: 'stockUpdateStepServiceDescription',
  },
  rankings: {
    titleKey: 'stockUpdateStepRankingsTitle',
    descriptionKey: 'stockUpdateStepRankingsDescription',
  },
  review: {
    titleKey: 'stockUpdateStepReviewTitle',
    descriptionKey: 'stockUpdateStepReviewDescription',
  },
};

function localDateTimeInputValue(value: string | null) {
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) {
    return '';
  }

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

function dateTimeInputToIso(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return date.toISOString();
}

function dateInputValue(value: string | null) {
  if (!value) {
    return '';
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '';
  }
  return date.toISOString().slice(0, 10);
}

function dateInputToIso(value: string) {
  if (!value) {
    return null;
  }
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return date.toISOString();
}

function addDaysToDateInput(observedAtIso: string | null, days: number | null) {
  if (!observedAtIso || days == null || !Number.isFinite(days) || days < 0) {
    return '';
  }
  const date = new Date(observedAtIso);
  if (Number.isNaN(date.getTime())) {
    return '';
  }
  date.setUTCDate(date.getUTCDate() + Math.round(days));
  return date.toISOString().slice(0, 10);
}

function expectedArrivalDaysFromLeadTime(
  meanDays: number | null,
  variabilityClass: SenaLeadTimeVariabilityClass | null,
) {
  if (meanDays == null || !Number.isFinite(meanDays) || meanDays < 0) {
    return null;
  }
  return compatibilityRangeForClass(meanDays, variabilityClass)?.highDays ?? meanDays;
}

function createEmptySkuSignalDraft(): SkuSignalDraft {
  return {
    orderEnabled: false,
    orderedQuantity: '',
    leadTimeMeanDays: '',
    leadTimeVariability: '',
    expectedArrivalDate: '',
    receiptEnabled: false,
    receiptQuantity: '',
    blockedEnabled: false,
    blockedState: 'blocked',
  };
}

function createEmptyServiceSignalDraft(): ServiceSignalDraft {
  return {
    priceEnabled: false,
    price: '',
    blockedEnabled: false,
    blockedState: 'blocked',
  };
}

function skuEventOnlyDraft(draft: SkuSignalDraft): SkuSignalDraft {
  return {
    ...draft,
    orderEnabled: false,
    orderedQuantity: '',
    leadTimeMeanDays: '',
    leadTimeVariability: '',
    expectedArrivalDate: '',
    receiptEnabled: false,
    receiptQuantity: '',
  };
}

function skuEventOnlyDrafts(drafts: Record<string, SkuSignalDraft>) {
  return Object.fromEntries(
    Object.entries(drafts).map(([skuId, draft]) => [skuId, skuEventOnlyDraft(draft)]),
  );
}

function skuWithoutEventDraft(draft: SkuSignalDraft): SkuSignalDraft {
  return {
    ...draft,
    blockedEnabled: false,
    blockedState: 'blocked',
  };
}

function skuWithoutEventDrafts(drafts: Record<string, SkuSignalDraft>) {
  return Object.fromEntries(
    Object.entries(drafts).map(([skuId, draft]) => [skuId, skuWithoutEventDraft(draft)]),
  );
}

function activeSkuFlagIds(draft: SkuSignalDraft | undefined): SkuFlagId[] {
  if (!draft) {
    return [];
  }
  return [
    ...(draft.orderEnabled ? (['ordered'] as const) : []),
    ...(draft.receiptEnabled ? (['received'] as const) : []),
    ...(draft.blockedEnabled ? (['blocked'] as const) : []),
  ];
}

function activeServiceFlagIds(draft: ServiceSignalDraft | undefined): ServiceFlagId[] {
  if (!draft) {
    return [];
  }
  return [
    ...(draft.priceEnabled ? (['price'] as const) : []),
    ...(draft.blockedEnabled ? (['blocked'] as const) : []),
  ];
}

function hasSkuFlags(draft: SkuSignalDraft | undefined) {
  return activeSkuFlagIds(draft).length > 0;
}

function hasServiceFlags(draft: ServiceSignalDraft | undefined) {
  return activeServiceFlagIds(draft).length > 0;
}

function skuDraftHasEmptyRequiredValue(draft: SkuSignalDraft | undefined) {
  if (!draft) {
    return false;
  }
  return (draft.orderEnabled && draft.orderedQuantity.trim() === '') || (draft.receiptEnabled && draft.receiptQuantity.trim() === '');
}

function serviceDraftHasEmptyRequiredValue(draft: ServiceSignalDraft | undefined) {
  if (!draft) {
    return false;
  }
  return draft.priceEnabled && draft.price.trim() === '';
}

function anySkuFlags(drafts: Record<string, SkuSignalDraft>) {
  return Object.values(drafts).some((draft) => hasSkuFlags(draft));
}

function anyServiceFlags(drafts: Record<string, ServiceSignalDraft>) {
  return Object.values(drafts).some((draft) => hasServiceFlags(draft));
}

function skuFlagsHaveEmptyRequiredValues(drafts: Record<string, SkuSignalDraft>) {
  return Object.values(drafts).some((draft) => skuDraftHasEmptyRequiredValue(draft));
}

function serviceFlagsHaveEmptyRequiredValues(drafts: Record<string, ServiceSignalDraft>) {
  return Object.values(drafts).some((draft) => serviceDraftHasEmptyRequiredValue(draft));
}

function serviceDisplayPriceChanged(
  catalog: SenaCatalog | null,
  serviceId: string,
  draft: ServiceSignalDraft | undefined,
  currency: 'USD' | 'KHR',
  usdToKhrExchangeRate: number,
) {
  if (!draft?.priceEnabled || draft.price === '') {
    return false;
  }
  const baseline = catalog?.services.find((service) => service.serviceId === serviceId)?.price ?? null;
  const price = usdMoneyFromDisplay(Number(draft.price), currency, usdToKhrExchangeRate);
  return baseline == null || price !== baseline;
}

function canUseBrowserStorage() {
  return (
    typeof window !== 'undefined' &&
    Boolean(window.localStorage) &&
    typeof window.localStorage.getItem === 'function' &&
    typeof window.localStorage.setItem === 'function' &&
    typeof window.localStorage.removeItem === 'function'
  );
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isStockUpdateStepId(value: unknown): value is StockUpdateStepId {
  return (
    typeof value === 'string' &&
    [
      ...STOCK_UPDATE_FULL_STEP_ORDER,
      ...STOCK_COUNT_STEP_ORDER,
      ...CUSTOMER_ORDER_PENDING_STEP_ORDER,
      ...CUSTOMER_ORDER_COMPLETED_STEP_ORDER,
      ...SUPPLIER_ORDER_PENDING_STEP_ORDER,
      ...SUPPLIER_RECEIPT_STEP_ORDER,
    ].includes(value as StockUpdateStepId)
  );
}

function buildCustomStepOrder(selectedLaneIds: BaseRecordUpdateLaneId[]) {
  const selectedLaneSet = new Set(selectedLaneIds);
  const selectedSteps = BASE_RECORD_UPDATE_LANE_ORDER.filter((laneId) => selectedLaneSet.has(laneId)).flatMap((laneId) =>
    BASE_RECORD_UPDATE_STEP_ORDER_BY_LANE[laneId].filter(
      (stepId) => stepId !== 'observed-at' && stepId !== 'report-notes' && stepId !== 'context' && stepId !== 'review',
    ),
  );
  return [
    'observed-at',
    'report-notes',
    ...new Set(selectedSteps),
    'context',
    'review',
  ] satisfies StockUpdateStepId[];
}

function stepOrderForLane(laneId: ReturnType<typeof getRecordUpdateLane>['id'], selectedLaneIds: BaseRecordUpdateLaneId[] = []) {
  if (laneId === 'custom') {
    return buildCustomStepOrder(selectedLaneIds.length > 0 ? selectedLaneIds : ['stock-count']);
  }
  if (laneId === 'stock-count') {
    return STOCK_COUNT_STEP_ORDER;
  }
  if (laneId === 'customer-order-pending') {
    return CUSTOMER_ORDER_PENDING_STEP_ORDER;
  }
  if (laneId === 'customer-order-completed') {
    return CUSTOMER_ORDER_COMPLETED_STEP_ORDER;
  }
  if (laneId === 'supplier-order-pending') {
    return SUPPLIER_ORDER_PENDING_STEP_ORDER;
  }
  if (laneId === 'supplier-receipt') {
    return SUPPLIER_RECEIPT_STEP_ORDER;
  }
  return STOCK_UPDATE_FULL_STEP_ORDER;
}

function normalizeStepIdForOrder(currentStepId: StockUpdateStepId, stepOrder: StockUpdateStepId[]) {
  if (stepOrder.includes(currentStepId)) {
    return currentStepId;
  }
  if (stepOrder.includes('context')) {
    return 'context';
  }
  return stepOrder[0] ?? 'stock';
}

function isStockView(value: unknown): value is StockView {
  return value === 'priority' || value === 'counted' || value === 'all';
}

function isRegimeHint(value: unknown): value is SenaObservationRegimeHint | '' {
  return (
    value === '' ||
    value === 'normal' ||
    value === 'spike' ||
    value === 'lull' ||
    value === 'stockout_constrained' ||
    value === 'promo' ||
    value === 'correction'
  );
}

function sanitizeCustomSelectedLaneIds(value: unknown): BaseRecordUpdateLaneId[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return [...new Set(value.filter(isBaseRecordUpdateLaneId))];
}

function isStockoutFlagValue(value: unknown): value is StockoutFlagValue {
  return value === 'blocked' || value === 'stockout';
}

function isOptionalStockStepChoice(value: unknown): value is OptionalStockStepChoice {
  return value === 'unset' || value === 'yes' || value === 'no';
}

function isCustomerPendingMode(value: unknown): value is CustomerPendingMode {
  return CUSTOMER_PENDING_MODE_OPTIONS.includes(value as CustomerPendingMode);
}

function isCustomerCompletedMode(value: unknown): value is CustomerCompletedMode {
  return CUSTOMER_COMPLETED_MODE_OPTIONS.includes(value as CustomerCompletedMode);
}

function isSupplierPendingMode(value: unknown): value is SupplierPendingMode {
  return SUPPLIER_PENDING_MODE_OPTIONS.includes(value as SupplierPendingMode);
}

function isSupplierReceiptMode(value: unknown): value is SupplierReceiptMode {
  return SUPPLIER_RECEIPT_MODE_OPTIONS.includes(value as SupplierReceiptMode);
}

function isTicketAuthoringMode(value: unknown): value is TicketAuthoringMode {
  return value === 'new' || value === 'edit';
}

function isSupplierTicketUpdateAction(value: unknown): value is SupplierTicketUpdateAction {
  return SUPPLIER_TICKET_UPDATE_ACTIONS.includes(value as SupplierTicketUpdateAction);
}

function isDeliveryFeePayer(value: unknown): value is SenaDeliveryFeePayer {
  return value === 'customer' || value === 'merchant';
}

function sanitizeCustomerIdentity(value: unknown): CustomerIdentityDraft {
  if (!value || typeof value !== 'object') {
    return DEFAULT_CUSTOMER_IDENTITY;
  }
  const record = value as Record<string, unknown>;
  return {
    channel: typeof record.channel === 'string' ? record.channel : '',
    customChannel: typeof record.customChannel === 'string' ? record.customChannel : '',
    customerName: typeof record.customerName === 'string' ? record.customerName : '',
    phone: typeof record.phone === 'string' ? normalizePhoneNumber(record.phone) : '',
  };
}

function defaultDeliveryFeePayer(bucket: SenaDeliveryFeeBucket | null): SenaDeliveryFeePayer {
  return bucket === 'supplier' ? 'merchant' : 'customer';
}

function sanitizeDeliveryFeeAmount(value: unknown) {
  return typeof value === 'string' ? value : '';
}

function deliveryFeeHelpText(language: AppLanguage) {
  return translateUiLiteral(language, 'If the customer pays, delivery is added to the receipt total. If the merchant pays, the receipt shows $0 delivery and banji deducts the fee from the final net amount settled.');
}

function isRefundStockReturnChoice(value: unknown): value is RefundStockReturnChoice {
  return value === 'later' || value === 'now';
}

function workflowStateLabel(language: AppLanguage, value: WorkflowStateFilterValue) {
  switch (value) {
    case 'new_pending':
      return translateUiLiteral(language, 'New pending');
    case 'modify_pending':
      return translateUiLiteral(language, 'Modify pending');
    case 'cancel_pending':
      return translateUiLiteral(language, 'Cancel pending');
    case 'from_pending':
      return translateUiLiteral(language, 'From pending');
    case 'immediate_sale':
      return translateUiLiteral(language, 'Immediate sale');
    case 'refund_reversal':
      return translateUiLiteral(language, 'Refund / reversal');
    case 'new_supplier_order':
      return translateUiLiteral(language, 'New supplier order');
    case 'update_pending_supplier_order':
      return translateUiLiteral(language, 'Update pending');
    case 'cancel_supplier_order':
      return translateUiLiteral(language, 'Cancel supplier order');
    case 'against_pending_supplier_order':
      return translateUiLiteral(language, 'Against pending');
    case 'immediate_purchase':
      return translateUiLiteral(language, 'Immediate purchase');
    case 'return_receipt_reversal':
      return translateUiLiteral(language, 'Return / reversal');
  }
}

function workflowStateIcon(value: WorkflowStateFilterValue): IconComponent {
  switch (value) {
    case 'new_pending':
    case 'new_supplier_order':
      return ActionCreatePackageIcon;
    case 'modify_pending':
    case 'update_pending_supplier_order':
      return StatusScheduleIcon;
    case 'cancel_pending':
    case 'cancel_supplier_order':
      return StatusUnavailableIcon;
    case 'from_pending':
    case 'against_pending_supplier_order':
      return StatusReadyIcon;
    case 'immediate_sale':
    case 'immediate_purchase':
      return ActionCreatePackageIcon;
    case 'refund_reversal':
    case 'return_receipt_reversal':
      return ActionUndoIcon;
  }
}

function workflowStateFilterKindLabel(language: AppLanguage, kind: WorkflowStateFilterKind) {
  return kind === 'receipt'
    ? translateUiLiteral(language, 'Receipt')
    : translateUiLiteral(language, 'Order');
}

function workflowStateFilterIcon(kind: WorkflowStateFilterKind): IconComponent {
  return kind === 'receipt' ? ActionReceiveInventoryIcon : ActionCreatePackageIcon;
}

function workflowStateTriggerIcon<TValue extends WorkflowStateFilterValue>(
  kind: WorkflowStateFilterKind,
  values: readonly TValue[],
  selectedValues: readonly TValue[],
): IconComponent {
  if (selectedValues.length === values.length) {
    return EntityLayersIcon;
  }
  return workflowStateFilterIcon(kind);
}

function workflowStateFilterSummary<TValue extends WorkflowStateFilterValue>(
  language: AppLanguage,
  kind: WorkflowStateFilterKind,
  values: readonly TValue[],
  selectedValues: readonly TValue[],
) {
  if (selectedValues.length === values.length) {
    return translateUiLiteral(language, 'All {kind} States', {
      kind: workflowStateFilterKindLabel(language, kind),
    });
  }
  if (selectedValues.length === 1) {
    return workflowStateLabel(language, selectedValues[0]!);
  }
  return translateUiLiteral(language, '{count} {kind} States', {
    count: selectedValues.length,
    kind: workflowStateFilterKindLabel(language, kind),
  });
}

function WorkflowStateColumnHeader({
  state,
  children,
}: {
  state: WorkflowStateFilterValue;
  children: ReactNode;
}) {
  const StateIcon = workflowStateIcon(state);

  return (
    <span className="inline-flex items-center gap-2">
      <StateIcon aria-hidden="true" className="size-4 text-muted-foreground" />
      <span>{children}</span>
    </span>
  );
}

function WorkflowStateFilter<TValue extends WorkflowStateFilterValue>({
  kind,
  label,
  options,
  selectedValues,
  onChange,
}: {
  kind: WorkflowStateFilterKind;
  label: string;
  options: readonly TValue[];
  selectedValues: readonly TValue[];
  onChange: (values: TValue[]) => void;
}) {
  const { language } = usePreferences();
  const TriggerIcon = workflowStateTriggerIcon(kind, options, selectedValues);

  function toggleValue(value: TValue, checked: boolean) {
    const next = checked
      ? Array.from(new Set([...selectedValues, value]))
      : selectedValues.filter((entry) => entry !== value);
    onChange(next.length > 0 ? next : [...options]);
  }

  return (
    <div className="flex items-center">
      <AnchoredMenu
        align="left"
        className="w-72 p-2"
        label={label}
        triggerClassName="h-10 rounded-xl px-3"
        triggerIcon={
          <span className="inline-flex items-center gap-2 text-sm font-medium">
            <TriggerIcon className="size-4" />
            {workflowStateFilterSummary(language, kind, options, selectedValues)}
          </span>
        }
        triggerSize="default"
      >
        {() => (
          <div className="grid gap-1 p-1">
            {options.map((option) => {
              const checked = selectedValues.includes(option);
              const optionLabel = workflowStateLabel(language, option);
              const OptionIcon = workflowStateIcon(option);
              return (
                <label
                  key={option}
                  className="flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2 text-sm text-foreground hover:bg-muted"
                >
                  <Checkbox
                    aria-label={optionLabel}
                    checked={checked}
                    onCheckedChange={(value) => toggleValue(option, value === true)}
                  />
                  <OptionIcon className="size-4 text-muted-foreground" />
                  <span>{optionLabel}</span>
                </label>
              );
            })}
          </div>
        )}
      </AnchoredMenu>
    </div>
  );
}

function RecordUpdateFilterRow({
  stateFilterControl,
  supplierFilterControl,
}: {
  stateFilterControl?: ReactNode;
  supplierFilterControl?: ReactNode;
}) {
  const { language } = usePreferences();
  if (!stateFilterControl && !supplierFilterControl) {
    return null;
  }
  return (
    <div className="grid gap-2">
      <span className="text-[0.72rem] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
        {translateUiLiteral(language, 'Filter')}
      </span>
      <div className="flex flex-wrap items-center gap-3">
        {supplierFilterControl}
        {stateFilterControl}
      </div>
    </div>
  );
}

function readStockUpdateDraft(draftStorageKey: string) {
  if (!canUseBrowserStorage()) {
    return null;
  }

  const rawDraft = window.localStorage.getItem(draftStorageKey);
  if (!rawDraft) {
    return null;
  }

  try {
    const parsed = JSON.parse(rawDraft) as unknown;
    if (!isObjectRecord(parsed) || parsed.version !== 1) {
      window.localStorage.removeItem(draftStorageKey);
      return null;
    }
    return parsed;
  } catch {
    window.localStorage.removeItem(draftStorageKey);
    return null;
  }
}

function hasStoredStockUpdateDraft(draftStorageKey: string) {
  return readStockUpdateDraft(draftStorageKey) !== null;
}

function removeStockUpdateDraft(draftStorageKey: string) {
  if (canUseBrowserStorage()) {
    window.localStorage.removeItem(draftStorageKey);
  }
}

function sanitizeStockRow(row: unknown, baseline: StockRow): StockRow {
  if (!isObjectRecord(row)) {
    return baseline;
  }
  return {
    skuId: baseline.skuId,
    unitsInStock: typeof row.unitsInStock === 'number' ? row.unitsInStock : baseline.unitsInStock,
    costPerUnit:
      typeof row.costPerUnit === 'number' || row.costPerUnit === null ? row.costPerUnit : baseline.costPerUnit,
    productPrice:
      typeof row.productPrice === 'number' || row.productPrice === null ? row.productPrice : baseline.productPrice,
  };
}

function sanitizeSkuSignalDraft(draft: unknown): SkuSignalDraft | null {
  if (!isObjectRecord(draft)) {
    return null;
  }
  return {
    orderEnabled: draft.orderEnabled === true,
    orderedQuantity: typeof draft.orderedQuantity === 'string' ? draft.orderedQuantity : '',
    leadTimeMeanDays: typeof draft.leadTimeMeanDays === 'string' ? draft.leadTimeMeanDays : '',
    leadTimeVariability:
      typeof draft.leadTimeVariability === 'string' &&
      ['very_tight', 'tight', 'normal', 'wide', 'very_wide'].includes(draft.leadTimeVariability)
        ? (draft.leadTimeVariability as SenaLeadTimeVariabilityClass)
        : '',
    expectedArrivalDate: typeof draft.expectedArrivalDate === 'string' ? draft.expectedArrivalDate : '',
    receiptEnabled: draft.receiptEnabled === true,
    receiptQuantity: typeof draft.receiptQuantity === 'string' ? draft.receiptQuantity : '',
    blockedEnabled: draft.blockedEnabled === true,
    blockedState: isStockoutFlagValue(draft.blockedState) ? draft.blockedState : 'blocked',
  };
}

function sanitizeServiceSignalDraft(draft: unknown): ServiceSignalDraft | null {
  if (!isObjectRecord(draft)) {
    return null;
  }
  return {
    priceEnabled: draft.priceEnabled === true,
    price: typeof draft.price === 'string' ? draft.price : '',
    blockedEnabled: draft.blockedEnabled === true,
    blockedState: isStockoutFlagValue(draft.blockedState) ? draft.blockedState : 'blocked',
  };
}

function sanitizeDraftSignalRecord<T>(
  value: unknown,
  allowedIds: Set<string>,
  sanitizer: (draft: unknown) => T | null,
) {
  if (!isObjectRecord(value)) {
    return {};
  }
  return Object.fromEntries(
    Object.entries(value).flatMap(([id, draft]) => {
      if (!allowedIds.has(id)) {
        return [];
      }
      const sanitizedDraft = sanitizer(draft);
      return sanitizedDraft ? [[id, sanitizedDraft]] : [];
    }),
  ) as Record<string, T>;
}

function sanitizeStockStepChoices(value: unknown) {
  if (!isObjectRecord(value)) {
    return {
      'stock-cost': 'unset',
      'stock-price': 'unset',
      'stock-flags': 'unset',
    } satisfies Record<OptionalStockStepId, OptionalStockStepChoice>;
  }

  return {
    'stock-cost': isOptionalStockStepChoice(value['stock-cost']) ? value['stock-cost'] : 'unset',
    'stock-price': isOptionalStockStepChoice(value['stock-price']) ? value['stock-price'] : 'unset',
    'stock-flags': isOptionalStockStepChoice(value['stock-flags']) ? value['stock-flags'] : 'unset',
  } satisfies Record<OptionalStockStepId, OptionalStockStepChoice>;
}

function sanitizeDraftRanking(value: unknown, allowedIds: Set<string>) {
  if (!Array.isArray(value)) {
    return [];
  }
  const seenIds = new Set<string>();
  return value.filter((id): id is string => {
    if (typeof id !== 'string' || !allowedIds.has(id) || seenIds.has(id)) {
      return false;
    }
    seenIds.add(id);
    return true;
  });
}

function sanitizeSalesCountDrafts(value: unknown, allowedIds: Set<string>) {
  if (!isObjectRecord(value)) {
    return {};
  }
  return Object.fromEntries(
    Object.entries(value).flatMap(([id, draft]) => {
      if (!allowedIds.has(id) || typeof draft !== 'string') {
        return [];
      }
      return [[id, draft]];
    }),
  ) as SalesCountDrafts;
}

function sanitizeRefundStockReturnDrafts(value: unknown, allowedIds: Set<string>) {
  if (!isObjectRecord(value)) {
    return {};
  }
  return Object.fromEntries(
    Object.entries(value).flatMap(([id, nextValue]) => {
      if (!allowedIds.has(id) || !isRefundStockReturnChoice(nextValue)) {
        return [];
      }
      return [[id, nextValue]];
    }),
  ) as Record<string, RefundStockReturnChoice>;
}

function sanitizeLeadTimeVariability(value: unknown): SenaLeadTimeVariabilityClass | '' {
  return typeof value === 'string' && ['very_tight', 'tight', 'normal', 'wide', 'very_wide'].includes(value)
    ? (value as SenaLeadTimeVariabilityClass)
    : '';
}

function hydrateStockUpdateDraft({
  baselineRows,
  catalog,
  draft,
  stepOrder,
}: {
  baselineRows: StockRow[];
  catalog: SenaCatalog;
  draft: unknown;
  stepOrder: StockUpdateStepId[];
}): StockUpdateSessionDraft | null {
  if (!isObjectRecord(draft) || draft.version !== 1) {
    return null;
  }

  const allowedSkuIds = new Set(catalog.skus.map((sku) => sku.skuId));
  const allowedServiceIds = new Set(catalog.services.map((service) => service.serviceId));
  const retailSkuIds = new Set(catalog.skus.filter((sku) => sku.soldAsProduct).map((sku) => sku.skuId));
  const draftRowsBySku = new Map(
    (Array.isArray(draft.rows) ? draft.rows : [])
      .filter((row): row is Record<string, unknown> => isObjectRecord(row) && typeof row.skuId === 'string')
      .map((row) => [row.skuId as string, row]),
  );
  const stockStepChoices = sanitizeStockStepChoices(draft.stockStepChoices);
  const retailSalesChoice = isOptionalStockStepChoice(draft.retailSalesChoice) ? draft.retailSalesChoice : 'unset';
  const serviceSalesChoice = isOptionalStockStepChoice(draft.serviceSalesChoice) ? draft.serviceSalesChoice : 'unset';

  return {
    version: 1,
    savedAt: typeof draft.savedAt === 'string' ? draft.savedAt : new Date().toISOString(),
    customSelectedLaneIds: sanitizeCustomSelectedLaneIds(draft.customSelectedLaneIds),
    currentStepId: normalizeStepIdForOrder(
      isStockUpdateStepId(draft.currentStepId) ? draft.currentStepId : 'stock',
      stepOrder,
    ),
    unlockedStepCount:
      typeof draft.unlockedStepCount === 'number'
        ? Math.min(stepOrder.length, Math.max(1, Math.floor(draft.unlockedStepCount)))
        : 1,
    observedAt: typeof draft.observedAt === 'string' ? draft.observedAt : localDateTimeInputValue(null),
    notes: typeof draft.notes === 'string' ? draft.notes : '',
    stockView: isStockView(draft.stockView) ? draft.stockView : 'priority',
    rows: baselineRows.map((row) => sanitizeStockRow(draftRowsBySku.get(row.skuId), row)),
    recordOrderExpectedArrivalDate: typeof draft.recordOrderExpectedArrivalDate === 'string' ? draft.recordOrderExpectedArrivalDate : '',
    recordOrderLeadTimeMeanDays: typeof draft.recordOrderLeadTimeMeanDays === 'string' ? draft.recordOrderLeadTimeMeanDays : '',
    recordOrderLeadTimeVariability: sanitizeLeadTimeVariability(draft.recordOrderLeadTimeVariability),
    recordReceiptReceivedDate: typeof draft.recordReceiptReceivedDate === 'string' ? draft.recordReceiptReceivedDate : '',
    deliveryFeeAmount: sanitizeDeliveryFeeAmount(draft.deliveryFeeAmount),
    deliveryFeePayer: isDeliveryFeePayer(draft.deliveryFeePayer) ? draft.deliveryFeePayer : 'customer',
    retailSalesChoice,
    serviceSalesChoice,
    retailSalesDrafts: sanitizeSalesCountDrafts(draft.retailSalesDrafts, retailSkuIds),
    serviceSalesDrafts: sanitizeSalesCountDrafts(draft.serviceSalesDrafts, allowedServiceIds),
    skuSignalDrafts: sanitizeDraftSignalRecord(draft.skuSignalDrafts, allowedSkuIds, sanitizeSkuSignalDraft),
    stockStepChoices,
    serviceSignalDrafts: sanitizeDraftSignalRecord(
      draft.serviceSignalDrafts,
      allowedServiceIds,
      sanitizeServiceSignalDraft,
    ),
    regimeHint: isRegimeHint(draft.regimeHint) ? draft.regimeHint : '',
    serviceRankings: sanitizeDraftRanking(draft.serviceRankings, allowedServiceIds),
    retailRankings: sanitizeDraftRanking(draft.retailRankings, retailSkuIds),
    customerPendingMode: isCustomerPendingMode(draft.customerPendingMode) ? draft.customerPendingMode : 'new_pending',
    customerCompletedMode: isCustomerCompletedMode(draft.customerCompletedMode) ? draft.customerCompletedMode : 'immediate_sale',
    supplierPendingMode: isSupplierPendingMode(draft.supplierPendingMode) ? draft.supplierPendingMode : 'new_supplier_order',
    supplierReceiptMode: isSupplierReceiptMode(draft.supplierReceiptMode) ? draft.supplierReceiptMode : 'against_pending_supplier_order',
    customerTicketMode: isTicketAuthoringMode(draft.customerTicketMode) ? draft.customerTicketMode : null,
    supplierTicketMode: isTicketAuthoringMode(draft.supplierTicketMode) ? draft.supplierTicketMode : null,
    selectedCustomerTicketId: typeof draft.selectedCustomerTicketId === 'string' ? draft.selectedCustomerTicketId : null,
    selectedSupplierTicketId: typeof draft.selectedSupplierTicketId === 'string' ? draft.selectedSupplierTicketId : null,
    supplierTicketUpdateAction: isSupplierTicketUpdateAction(draft.supplierTicketUpdateAction) ? draft.supplierTicketUpdateAction : 'revise_order',
    customerIdentity: sanitizeCustomerIdentity(draft.customerIdentity),
    refundStockReturnDrafts: sanitizeRefundStockReturnDrafts(draft.refundStockReturnDrafts, retailSkuIds),
  };
}

function hasMeaningfulStockUpdateChanges({
  catalog,
  initialObservedAt,
  notes,
  observedAt,
  regimeHint,
  retailSalesChoice,
  retailSalesDrafts,
  retailRankings,
  recordOrderExpectedArrivalDate,
  recordOrderLeadTimeMeanDays,
  recordOrderLeadTimeVariability,
  recordReceiptReceivedDate,
  deliveryFeeAmount,
  deliveryFeePayer,
  deliveryFeeBaselineAmount,
  deliveryFeeBaselinePayer,
  rows,
  serviceSalesChoice,
  serviceSalesDrafts,
  serviceRankings,
  serviceSignalDrafts,
  skuSignalDrafts,
  stockStepChoices,
  stockBySku,
  customerTicketMode,
  supplierTicketMode,
  selectedCustomerTicketId,
  selectedSupplierTicketId,
  supplierTicketUpdateAction,
  customerIdentity,
  refundStockReturnDrafts,
}: StockUpdateDraftState) {
  return (
    rows.some((row) => stockRowChanged(catalog, stockBySku, row)) ||
    recordOrderExpectedArrivalDate.trim() !== '' ||
    recordOrderLeadTimeMeanDays.trim() !== '' ||
    recordOrderLeadTimeVariability !== '' ||
    recordReceiptReceivedDate.trim() !== '' ||
    deliveryFeeAmount.trim() !== deliveryFeeBaselineAmount.trim() ||
    deliveryFeePayer !== deliveryFeeBaselinePayer ||
    Object.keys(retailSalesDrafts).length > 0 ||
    Object.keys(serviceSalesDrafts).length > 0 ||
    retailSalesChoice !== 'unset' ||
    serviceSalesChoice !== 'unset' ||
    anySkuFlags(skuSignalDrafts) ||
    anyServiceFlags(serviceSignalDrafts) ||
    Object.values(stockStepChoices).some((choice) => choice !== 'unset') ||
    regimeHint !== '' ||
    serviceRankings.length > 0 ||
    retailRankings.length > 0 ||
    customerTicketMode !== null ||
    supplierTicketMode !== null ||
    selectedCustomerTicketId !== null ||
    selectedSupplierTicketId !== null ||
    supplierTicketUpdateAction !== 'revise_order' ||
    customerIdentity.channel.trim() !== '' ||
    customerIdentity.customChannel.trim() !== '' ||
    customerIdentity.customerName.trim() !== '' ||
    customerIdentity.phone.trim() !== '' ||
    Object.keys(refundStockReturnDrafts).length > 0 ||
    notes.trim() !== '' ||
    observedAt !== initialObservedAt
  );
}

function buildStockUpdateDraft(state: StockUpdateDraftState): StockUpdateSessionDraft {
  return {
    version: 1,
    savedAt: new Date().toISOString(),
    customSelectedLaneIds: state.customSelectedLaneIds,
    currentStepId: state.currentStepId,
    unlockedStepCount: state.unlockedStepCount,
    observedAt: state.observedAt,
    notes: state.notes,
    stockView: state.stockView,
    rows: state.rows,
    recordOrderExpectedArrivalDate: state.recordOrderExpectedArrivalDate,
    recordOrderLeadTimeMeanDays: state.recordOrderLeadTimeMeanDays,
    recordOrderLeadTimeVariability: state.recordOrderLeadTimeVariability,
    recordReceiptReceivedDate: state.recordReceiptReceivedDate,
    deliveryFeeAmount: state.deliveryFeeAmount,
    deliveryFeePayer: state.deliveryFeePayer,
    retailSalesChoice: state.retailSalesChoice,
    serviceSalesChoice: state.serviceSalesChoice,
    retailSalesDrafts: state.retailSalesDrafts,
    serviceSalesDrafts: state.serviceSalesDrafts,
    skuSignalDrafts: state.skuSignalDrafts,
    stockStepChoices: state.stockStepChoices,
    serviceSignalDrafts: state.serviceSignalDrafts,
    regimeHint: state.regimeHint,
    serviceRankings: state.serviceRankings,
    retailRankings: state.retailRankings,
    customerPendingMode: state.customerPendingMode,
    customerCompletedMode: state.customerCompletedMode,
    supplierPendingMode: state.supplierPendingMode,
    supplierReceiptMode: state.supplierReceiptMode,
    customerTicketMode: state.customerTicketMode,
    supplierTicketMode: state.supplierTicketMode,
    selectedCustomerTicketId: state.selectedCustomerTicketId,
    selectedSupplierTicketId: state.selectedSupplierTicketId,
    supplierTicketUpdateAction: state.supplierTicketUpdateAction,
    customerIdentity: state.customerIdentity,
    refundStockReturnDrafts: state.refundStockReturnDrafts,
  };
}

function writeStockUpdateDraft(state: StockUpdateDraftState, draftStorageKey: string) {
  if (!canUseBrowserStorage() || !state.catalog) {
    return false;
  }
  if (!hasMeaningfulStockUpdateChanges(state)) {
    removeStockUpdateDraft(draftStorageKey);
    return false;
  }
  window.localStorage.setItem(draftStorageKey, JSON.stringify(buildStockUpdateDraft(state)));
  return true;
}

function buildFullObservationPayload({
  currency,
  deliveryFee,
  editSession,
  notes,
  observedAtIso,
  regimeHint,
  retailRankings,
  rows,
  serviceRankings,
  serviceSignalDrafts,
  skuSignalDrafts,
  usdToKhrExchangeRate,
  catalog,
  stockBySku,
}: {
  currency: 'USD' | 'KHR';
  deliveryFee: SenaDeliveryFeeMetadata | null;
  editSession: EditSessionState;
  notes: string;
  observedAtIso: string | null;
  regimeHint: SenaObservationRegimeHint | '';
  retailRankings: string[];
  rows: StockRow[];
  serviceRankings: string[];
  serviceSignalDrafts: Record<string, ServiceSignalDraft>;
  skuSignalDrafts: Record<string, SkuSignalDraft>;
  usdToKhrExchangeRate: number;
  catalog: SenaCatalog | null;
  stockBySku: Map<string, SenaStockSnapshot>;
}) {
  const payload = createEmptyObservationInput({
    observedAt: observedAtIso ?? new Date().toISOString(),
    notes: notes.trim() || null,
  });
  payload.deliveryFee = deliveryFee;
  payload.stockSnapshot = rows
    .filter((row) => shouldIncludeStockRowInEditPayload({ editSession, row, stockBySku }))
    .map((row) => ({
      skuId: row.skuId,
      unitsInStock: row.unitsInStock,
      costPerUnit: row.costPerUnit,
      productPrice: row.productPrice,
    }));
  payload.serviceRankings = serviceRankings;
  payload.retailRankings = retailRankings;
  payload.orderSignals = Object.entries(skuSignalDrafts).flatMap(([skuId, draft]) => {
    const nextSignals = [];
    if (draft.orderEnabled) {
      nextSignals.push({
        skuId,
        orderPlaced: true,
        receiptArrived: false,
        approximateOrderQuantity: draft.orderedQuantity.trim() === '' ? null : Number(draft.orderedQuantity),
        approximateReceiptQuantity: null,
      });
    }
    if (draft.receiptEnabled) {
      nextSignals.push({
        skuId,
        orderPlaced: false,
        receiptArrived: true,
        approximateOrderQuantity: null,
        approximateReceiptQuantity: draft.receiptQuantity.trim() === '' ? null : Number(draft.receiptQuantity),
      });
    }
    return nextSignals;
  });
  payload.servicePrices = Object.entries(serviceSignalDrafts)
    .filter(([, draft]) => draft.priceEnabled)
    .map(([serviceId, draft]) => ({
      serviceId,
      price: usdMoneyFromDisplay(Number(draft.price), currency, usdToKhrExchangeRate),
    }));
  payload.retailPrices = [];
  payload.retailStockouts = Object.entries(skuSignalDrafts)
    .filter(([skuId, draft]) => draft.blockedEnabled && Boolean(catalog?.skus.find((sku) => sku.skuId === skuId)?.soldAsProduct))
    .map(([skuId]) => skuId);
  payload.serviceStockouts = Object.entries(serviceSignalDrafts)
    .filter(([, draft]) => draft.blockedEnabled)
    .map(([serviceId]) => serviceId);
  payload.adjustmentSignals = [];
  payload.regimeHint = regimeHint || null;
  return payload;
}

const tableDebugTrackClassName = '[&>*]:outline [&>*]:outline-1 [&>*]:outline-rose-500/50 [&>*]:outline-offset-[-1px]';
const tableDebugFlushClassName = 'outline outline-1 outline-amber-500/40 outline-offset-[-1px]';

function latestStockBySku(catalog: SenaCatalog | null, observations: ReturnType<typeof useInventory>['observations']) {
  const latest = [...observations].sort(
    (left, right) => new Date(right.input.observedAt).getTime() - new Date(left.input.observedAt).getTime(),
  );
  const stockBySku = new Map<string, SenaStockSnapshot>();
  for (const observation of latest) {
    for (const snapshot of observation.input.stockSnapshot) {
      if (!stockBySku.has(snapshot.skuId)) {
        stockBySku.set(snapshot.skuId, snapshot);
      }
    }
  }
  return new Map(
    (catalog?.skus ?? []).map((sku) => [
      sku.skuId,
      stockBySku.get(sku.skuId) ?? {
        skuId: sku.skuId,
        unitsInStock: 0,
        costPerUnit: sku.costPerUnit,
        productPrice: sku.productPrice,
      },
    ]),
  );
}

function latestCountedAtBySku(observations: ReturnType<typeof useInventory>['observations']) {
  const values = new Map<string, string>();
  const latest = [...observations].sort(
    (left, right) => new Date(right.input.observedAt).getTime() - new Date(left.input.observedAt).getTime(),
  );
  for (const observation of latest) {
    for (const snapshot of observation.input.stockSnapshot) {
      if (!values.has(snapshot.skuId)) {
        values.set(snapshot.skuId, observation.input.observedAt);
      }
    }
  }
  return values;
}

function latestRetailSalesBySku(catalog: SenaCatalog | null, observations: ReturnType<typeof useInventory>['observations']) {
  const values = new Map<string, number>();
  const latest = [...observations].sort(
    (left, right) => new Date(right.input.observedAt).getTime() - new Date(left.input.observedAt).getTime(),
  );
  for (const observation of latest) {
    for (const snapshot of observation.input.retailSalesSnapshot ?? []) {
      if (!values.has(snapshot.skuId)) {
        values.set(snapshot.skuId, snapshot.unitsSold);
      }
    }
  }
  return new Map((catalog?.skus ?? []).filter((sku) => sku.soldAsProduct).map((sku) => [sku.skuId, values.get(sku.skuId) ?? null]));
}

function latestRetailSalesAtBySku(observations: ReturnType<typeof useInventory>['observations']) {
  const values = new Map<string, string>();
  const latest = [...observations].sort(
    (left, right) => new Date(right.input.observedAt).getTime() - new Date(left.input.observedAt).getTime(),
  );
  for (const observation of latest) {
    for (const snapshot of observation.input.retailSalesSnapshot ?? []) {
      if (!values.has(snapshot.skuId)) {
        values.set(snapshot.skuId, observation.input.observedAt);
      }
    }
  }
  return values;
}

function latestServiceSalesByService(catalog: SenaCatalog | null, observations: ReturnType<typeof useInventory>['observations']) {
  const values = new Map<string, number>();
  const latest = [...observations].sort(
    (left, right) => new Date(right.input.observedAt).getTime() - new Date(left.input.observedAt).getTime(),
  );
  for (const observation of latest) {
    for (const snapshot of observation.input.serviceSalesSnapshot ?? []) {
      if (!values.has(snapshot.serviceId)) {
        values.set(snapshot.serviceId, snapshot.unitsSold);
      }
    }
  }
  return new Map((catalog?.services ?? []).map((service) => [service.serviceId, values.get(service.serviceId) ?? null]));
}

function latestServiceSalesAtByService(observations: ReturnType<typeof useInventory>['observations']) {
  const values = new Map<string, string>();
  const latest = [...observations].sort(
    (left, right) => new Date(right.input.observedAt).getTime() - new Date(left.input.observedAt).getTime(),
  );
  for (const observation of latest) {
    for (const snapshot of observation.input.serviceSalesSnapshot ?? []) {
      if (!values.has(snapshot.serviceId)) {
        values.set(snapshot.serviceId, observation.input.observedAt);
      }
    }
  }
  return values;
}

function latestOrderQuantityBySku(catalog: SenaCatalog | null, observations: ReturnType<typeof useInventory>['observations']) {
  const values = new Map<string, number>();
  const latest = [...observations].sort(
    (left, right) => new Date(right.input.observedAt).getTime() - new Date(left.input.observedAt).getTime(),
  );
  for (const observation of latest) {
    for (const signal of observation.input.orderSignals) {
      if (signal.orderPlaced && signal.approximateOrderQuantity != null && !values.has(signal.skuId)) {
        values.set(signal.skuId, signal.approximateOrderQuantity);
      }
    }
  }
  return new Map((catalog?.skus ?? []).map((sku) => [sku.skuId, values.get(sku.skuId) ?? null]));
}

function latestOrderAtBySku(observations: ReturnType<typeof useInventory>['observations']) {
  const values = new Map<string, string>();
  const latest = [...observations].sort(
    (left, right) => new Date(right.input.observedAt).getTime() - new Date(left.input.observedAt).getTime(),
  );
  for (const observation of latest) {
    for (const signal of observation.input.orderSignals) {
      if (signal.orderPlaced && signal.approximateOrderQuantity != null && !values.has(signal.skuId)) {
        values.set(signal.skuId, signal.placementTimestamp ?? observation.input.observedAt);
      }
    }
  }
  return values;
}

function latestReceiptQuantityBySku(catalog: SenaCatalog | null, observations: ReturnType<typeof useInventory>['observations']) {
  const values = new Map<string, number>();
  const latest = [...observations].sort(
    (left, right) => new Date(right.input.observedAt).getTime() - new Date(left.input.observedAt).getTime(),
  );
  for (const observation of latest) {
    for (const signal of observation.input.orderSignals) {
      if (signal.receiptArrived && signal.approximateReceiptQuantity != null && !values.has(signal.skuId)) {
        values.set(signal.skuId, signal.approximateReceiptQuantity);
      }
    }
  }
  return new Map((catalog?.skus ?? []).map((sku) => [sku.skuId, values.get(sku.skuId) ?? null]));
}

function latestReceiptAtBySku(observations: ReturnType<typeof useInventory>['observations']) {
  const values = new Map<string, string>();
  const latest = [...observations].sort(
    (left, right) => new Date(right.input.observedAt).getTime() - new Date(left.input.observedAt).getTime(),
  );
  for (const observation of latest) {
    for (const signal of observation.input.orderSignals) {
      if (signal.receiptArrived && signal.approximateReceiptQuantity != null && !values.has(signal.skuId)) {
        values.set(signal.skuId, signal.receiptTimestamp ?? observation.input.observedAt);
      }
    }
  }
  return values;
}

function reorderRecommendationBySku(workspaceSummary: ReturnType<typeof useInventory>['workspaceSummary']) {
  return new Map(
    (workspaceSummary?.skuSummaries ?? []).map((summary) => {
      const recommendation = summary.reorderQuantity?.recommendationIssued
        ? summary.reorderQuantity.recommendedUnits
        : summary.reorderQuantity?.ungatedRecommendedUnits ?? 0;
      return [summary.skuId, recommendation];
    }),
  );
}

function leadTimeMeanBySku(catalog: SenaCatalog | null, workspaceSummary: ReturnType<typeof useInventory>['workspaceSummary']) {
  const summaryMap = new Map((workspaceSummary?.skuSummaries ?? []).map((summary) => [summary.skuId, summary]));
  return new Map(
    (catalog?.skus ?? []).map((sku) => [sku.skuId, summaryMap.get(sku.skuId)?.leadTimeMeanDays ?? sku.leadTimeMeanDaysHint ?? null]),
  );
}

function leadTimeVariabilityBySku(catalog: SenaCatalog | null, workspaceSummary: ReturnType<typeof useInventory>['workspaceSummary']) {
  const summaryMap = new Map((workspaceSummary?.skuSummaries ?? []).map((summary) => [summary.skuId, summary]));
  return new Map(
    (catalog?.skus ?? []).map((sku) => {
      const mean = summaryMap.get(sku.skuId)?.leadTimeMeanDays ?? sku.leadTimeMeanDaysHint ?? null;
      const std = summaryMap.get(sku.skuId)?.leadTimeStdDays ?? sku.leadTimeStdDaysHint ?? null;
      const range = mean != null && std != null ? impliedLeadTimeRangeFromMeanStd(mean, std) : null;
      return [sku.skuId, classifyLeadTimeVariability(range ? (range.highDays - range.lowDays) / Math.max((range.highDays + range.lowDays) / 2, 0.5) : null)];
    }),
  );
}

function buildInitialRows(catalog: SenaCatalog | null, observations: ReturnType<typeof useInventory>['observations']) {
  const stockBySku = latestStockBySku(catalog, observations);
  return (catalog?.skus ?? []).map<StockRow>((sku) => ({
    ...(stockBySku.get(sku.skuId) ?? {
      skuId: sku.skuId,
      unitsInStock: 0,
      costPerUnit: sku.costPerUnit,
      productPrice: sku.productPrice,
    }),
  }));
}

function createDefaultStockStepChoices(): Record<OptionalStockStepId, OptionalStockStepChoice> {
  return {
    'stock-cost': 'unset',
    'stock-price': 'unset',
    'stock-flags': 'unset',
  };
}

function stockCostChanged(catalog: SenaCatalog | null, stockBySku: Map<string, SenaStockSnapshot>, row: StockRow) {
  const baseline = baselineStockRow(catalog, stockBySku, row.skuId);
  if (!baseline) {
    return false;
  }
  return baseline.costPerUnit !== row.costPerUnit;
}

function stockRetailPriceChanged(catalog: SenaCatalog | null, stockBySku: Map<string, SenaStockSnapshot>, row: StockRow) {
  const baseline = baselineStockRow(catalog, stockBySku, row.skuId);
  if (!baseline) {
    return false;
  }
  return baseline.productPrice !== row.productPrice;
}

function changedRowCount(
  rows: StockRow[],
  predicate: (row: StockRow) => boolean,
) {
  return rows.reduce((count, row) => count + (predicate(row) ? 1 : 0), 0);
}

function buildDraftsFromObservationInput({
  baselineRows,
  catalog,
  currency,
  input,
  stepOrder,
  usdToKhrExchangeRate,
}: {
  baselineRows: StockRow[];
  catalog: SenaCatalog;
  currency: 'USD' | 'KHR';
  input: ReturnType<typeof createEmptyObservationInput>;
  stepOrder: StockUpdateStepId[];
  usdToKhrExchangeRate: number;
}): HydratedStockUpdateState {
  const rowsBySkuId = new Map(baselineRows.map((row) => [row.skuId, row]));
  const leadTimeHintsBySkuId = new Map(input.leadTimeHints.map((hint) => [hint.skuId, hint]));
  for (const snapshot of input.stockSnapshot) {
    rowsBySkuId.set(snapshot.skuId, {
      skuId: snapshot.skuId,
      unitsInStock: snapshot.unitsInStock,
      costPerUnit: snapshot.costPerUnit,
      productPrice: snapshot.productPrice,
    });
  }

  const skuSignalDrafts: Record<string, SkuSignalDraft> = {};
  for (const signal of input.orderSignals) {
    const existing = skuSignalDrafts[signal.skuId] ?? createEmptySkuSignalDraft();
    skuSignalDrafts[signal.skuId] = {
      ...existing,
      orderEnabled: existing.orderEnabled || signal.orderPlaced,
      orderedQuantity:
        signal.orderPlaced && signal.approximateOrderQuantity != null
          ? String(signal.approximateOrderQuantity)
          : existing.orderedQuantity,
      leadTimeMeanDays:
        signal.orderPlaced && signal.leadTimeDaysHint != null
          ? String(signal.leadTimeDaysHint)
          : existing.leadTimeMeanDays,
      expectedArrivalDate:
        signal.orderPlaced && signal.receiptTimestamp
          ? dateInputValue(signal.receiptTimestamp)
          : existing.expectedArrivalDate,
      receiptEnabled: existing.receiptEnabled || signal.receiptArrived,
      receiptQuantity:
        signal.receiptArrived && signal.approximateReceiptQuantity != null
          ? String(signal.approximateReceiptQuantity)
          : existing.receiptQuantity,
    };
  }
  for (const skuId of input.retailStockouts) {
    skuSignalDrafts[skuId] = {
      ...(skuSignalDrafts[skuId] ?? createEmptySkuSignalDraft()),
      blockedEnabled: true,
      blockedState: 'stockout',
    };
  }
  for (const [skuId, hint] of leadTimeHintsBySkuId) {
    const existing = skuSignalDrafts[skuId] ?? createEmptySkuSignalDraft();
    skuSignalDrafts[skuId] = {
      ...existing,
      leadTimeMeanDays:
        hint.typicalDays != null && existing.leadTimeMeanDays === ''
          ? String(hint.typicalDays)
          : existing.leadTimeMeanDays,
      leadTimeVariability: hint.variabilityClass ?? existing.leadTimeVariability,
    };
  }
  const firstOrderSignal = input.orderSignals.find((signal) => signal.orderPlaced) ?? null;
  const firstReceiptSignal = input.orderSignals.find((signal) => signal.receiptArrived) ?? null;
  const firstLeadTimeHint = input.leadTimeHints[0] ?? null;
  const recordOrderExpectedArrivalDate = firstOrderSignal?.receiptTimestamp
    ? dateInputValue(firstOrderSignal.receiptTimestamp)
    : '';
  const recordReceiptReceivedDate = firstReceiptSignal?.receiptTimestamp
    ? dateInputValue(firstReceiptSignal.receiptTimestamp)
    : '';
  const recordOrderLeadTimeMeanDays =
    firstOrderSignal?.leadTimeDaysHint != null
      ? String(firstOrderSignal.leadTimeDaysHint)
      : firstLeadTimeHint?.typicalDays != null
        ? String(firstLeadTimeHint.typicalDays)
        : '';
  const recordOrderLeadTimeVariability = firstLeadTimeHint?.variabilityClass ?? '';
  const deliveryFeeAmount =
    input.deliveryFee?.feeUsd != null
      ? String(displayMoneyFromUsd(input.deliveryFee.feeUsd, currency, usdToKhrExchangeRate))
      : '';
  const deliveryFeePayer = input.deliveryFee?.payer ?? 'customer';

  const serviceSignalDrafts: Record<string, ServiceSignalDraft> = {};
  for (const servicePrice of input.servicePrices) {
    serviceSignalDrafts[servicePrice.serviceId] = {
      ...(serviceSignalDrafts[servicePrice.serviceId] ?? createEmptyServiceSignalDraft()),
      priceEnabled: true,
      price: String(displayMoneyFromUsd(servicePrice.price, currency, usdToKhrExchangeRate)),
    };
  }
  for (const serviceId of input.serviceStockouts) {
    serviceSignalDrafts[serviceId] = {
      ...(serviceSignalDrafts[serviceId] ?? createEmptyServiceSignalDraft()),
      blockedEnabled: true,
      blockedState: 'stockout',
    };
  }

  const retailSkuIds = new Set(catalog.skus.filter((sku) => sku.soldAsProduct).map((sku) => sku.skuId));
  const retailSalesDrafts = Object.fromEntries(
    (input.retailSalesSnapshot ?? []).map((snapshot) => [snapshot.skuId, String(snapshot.unitsSold)]),
  ) as SalesCountDrafts;
  const serviceSalesDrafts = Object.fromEntries(
    (input.serviceSalesSnapshot ?? []).map((snapshot) => [snapshot.serviceId, String(snapshot.unitsSold)]),
  ) as SalesCountDrafts;
  const baselineRowIds = new Set(baselineRows.map((row) => row.skuId));
  const appendedRows = input.stockSnapshot
    .filter((snapshot) => !baselineRowIds.has(snapshot.skuId))
    .map<StockRow>((snapshot) => ({
      skuId: snapshot.skuId,
      unitsInStock: snapshot.unitsInStock,
      costPerUnit: snapshot.costPerUnit,
      productPrice: snapshot.productPrice,
    }));

  return {
    customSelectedLaneIds: [],
    currentStepId: (
      stepOrder.includes('stock')
        ? 'stock'
        : stepOrder.includes('reorder')
          ? 'reorder'
          : stepOrder.includes('receipt')
            ? 'receipt'
            : stepOrder.includes('retail-sales')
              ? 'retail-sales'
              : 'observed-at'
    ) as StockUpdateStepId,
    unlockedStepCount: stepOrder.length,
    observedAt: localDateTimeInputValue(input.observedAt),
    notes: input.notes ?? '',
    stockView: 'counted' as const,
    rows: [...baselineRows.map((row) => rowsBySkuId.get(row.skuId) ?? row), ...appendedRows],
    recordOrderExpectedArrivalDate,
    recordOrderLeadTimeMeanDays,
    recordOrderLeadTimeVariability,
    recordReceiptReceivedDate,
    deliveryFeeAmount,
    deliveryFeePayer,
    deliveryFeeBaselineAmount: deliveryFeeAmount,
    deliveryFeeBaselinePayer: deliveryFeePayer,
    retailSalesChoice:
      Object.keys(retailSalesDrafts).length > 0 ? 'yes' : input.retailRankings.length > 0 ? 'no' : 'unset',
    serviceSalesChoice:
      Object.keys(serviceSalesDrafts).length > 0 ? 'yes' : input.serviceRankings.length > 0 ? 'no' : 'unset',
    retailSalesDrafts,
    serviceSalesDrafts,
    skuSignalDrafts,
    stockStepChoices: {
      'stock-cost': appendedRows.length > 0 || baselineRows.some((row) => {
        const nextRow = rowsBySkuId.get(row.skuId) ?? row;
        return nextRow.costPerUnit !== row.costPerUnit;
      }) ? 'yes' : 'unset',
      'stock-price': appendedRows.some((row) => row.productPrice != null) || baselineRows.some((row) => {
        const nextRow = rowsBySkuId.get(row.skuId) ?? row;
        return nextRow.productPrice !== row.productPrice;
      }) ? 'yes' : 'unset',
      'stock-flags': anySkuFlags(skuSignalDrafts) ? 'yes' : 'unset',
    },
    serviceSignalDrafts,
    regimeHint: input.regimeHint ?? '',
    serviceRankings: input.serviceRankings.filter((serviceId) =>
      catalog.services.some((service) => service.serviceId === serviceId),
    ),
    retailRankings: input.retailRankings.filter((skuId) => retailSkuIds.has(skuId)),
    customerPendingMode: 'new_pending' as const,
    customerCompletedMode: 'immediate_sale' as const,
    supplierPendingMode: 'new_supplier_order' as const,
    supplierReceiptMode: 'against_pending_supplier_order' as const,
    customerTicketMode: null,
    supplierTicketMode: null,
    selectedCustomerTicketId: null,
    selectedSupplierTicketId: null,
    supplierTicketUpdateAction: 'revise_order' as const,
    customerIdentity: DEFAULT_CUSTOMER_IDENTITY,
    refundStockReturnDrafts: {},
  };
}

function shouldIncludeStockRowInEditPayload({
  editSession,
  row,
  stockBySku,
}: {
  editSession: EditSessionState;
  row: StockRow;
  stockBySku: Map<string, SenaStockSnapshot>;
}) {
  const originalRow = editSession.input.stockSnapshot.find((snapshot) => snapshot.skuId === row.skuId) ?? null;
  const liveBaseline = stockBySku.get(row.skuId) ?? null;
  if (originalRow) {
    return true;
  }

  return (
    liveBaseline == null ||
    row.unitsInStock !== liveBaseline.unitsInStock ||
    row.costPerUnit !== liveBaseline.costPerUnit ||
    row.productPrice !== liveBaseline.productPrice
  );
}

function baselineStockRow(
  catalog: SenaCatalog | null,
  stockBySku: Map<string, SenaStockSnapshot>,
  skuId: string,
) {
  const sku = catalog?.skus.find((entry) => entry.skuId === skuId);
  if (!sku) {
    return null;
  }
  return (
    stockBySku.get(skuId) ?? {
      skuId,
      unitsInStock: 0,
      costPerUnit: sku.costPerUnit,
      productPrice: sku.productPrice,
    }
  );
}

function stockRowChanged(
  catalog: SenaCatalog | null,
  stockBySku: Map<string, SenaStockSnapshot>,
  row: StockRow,
) {
  const baseline = baselineStockRow(catalog, stockBySku, row.skuId);
  if (!baseline) {
    return false;
  }
  return (
    row.unitsInStock !== baseline.unitsInStock ||
    row.costPerUnit !== baseline.costPerUnit ||
    row.productPrice !== baseline.productPrice
  );
}

function buildRankingEntries(ids: string[], entryType: RankingEntryType) {
  return ids.map<RankingEntry>((entryId, position) => ({
    entryType,
    entryId,
    position,
  }));
}

function reorderIdsFromEntries(entries: RankingEntry[]) {
  return [...entries].sort((left, right) => left.position - right.position).map((entry) => entry.entryId);
}

function reorderStringIds(ids: string[], activeId: string, overId: string) {
  if (activeId === overId) {
    return ids;
  }
  const oldIndex = ids.indexOf(activeId);
  const newIndex = ids.indexOf(overId);
  if (oldIndex === -1 || newIndex === -1 || oldIndex === newIndex) {
    return ids;
  }
  return arrayMove(ids, oldIndex, newIndex);
}

function buildRankingSnapshot({
  catalog,
  entryType,
  rankedIds,
}: {
  catalog: SenaCatalog | null;
  entryType: RankingEntryType;
  rankedIds: string[];
}): InventorySnapshot {
  const services = (catalog?.services ?? []).map((service) => ({
    serviceId: service.serviceId,
    name: service.name,
    description: service.description,
    price: service.price,
    skuIds: (catalog?.sharingMask ?? []).filter((entry) => entry.enabled && entry.serviceId === service.serviceId).map((entry) => entry.skuId),
  }));
  const skus = (catalog?.skus ?? []).map((sku) => ({
    skuId: sku.skuId,
    name: sku.name,
    description: sku.description,
    unitsInStock: 0,
    costPerUnit: sku.costPerUnit,
    soldAsProduct: sku.soldAsProduct,
    productPrice: sku.productPrice,
    leadTimeMeanDays: sku.leadTimeMeanDaysHint,
    leadTimeStdDays: sku.leadTimeStdDaysHint,
  }));

  return {
    services,
    skus,
    ranking: buildRankingEntries(rankedIds, entryType),
    sist: EMPTY_SIST_OVERVIEW,
  };
}

function RankingSignalEditor({
  catalog,
  entryType,
  label,
  onChange,
  seedValues,
  values,
}: {
  catalog: SenaCatalog | null;
  entryType: RankingEntryType;
  label: string;
  onChange: (values: string[]) => void;
  seedValues: string[];
  values: string[];
}) {
  const { t } = usePreferences();
  const displayedValues = values.length > 0 ? values : seedValues;
  const rankingTooltip =
    entryType === 'service'
      ? t('stockUpdateTopServicesLabel')
      : t('stockUpdateTopRetailItemsLabel');
  const snapshot = useMemo(
    () => buildRankingSnapshot({ catalog, entryType, rankedIds: displayedValues }),
    [catalog, displayedValues, entryType],
  );
  const eligibleItemCount = useMemo(
    () =>
      entryType === 'service'
        ? snapshot.services.length
        : snapshot.skus.filter((sku) => sku.soldAsProduct && sku.productPrice !== null).length,
    [entryType, snapshot.services.length, snapshot.skus],
  );
  const entries = useMemo(() => buildRankingEntries(displayedValues, entryType), [displayedValues, entryType]);
  const rankChangeByEntryKey = useMemo(
    () =>
      buildRankChangeByEntryKey({
        displayedIds: displayedValues,
        entryType,
        seedIds: seedValues,
        valuesActive: values.length > 0,
      }),
    [displayedValues, entryType, seedValues, values.length],
  );

  return (
    <div className="grid gap-5">
      <div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-foreground">
            <SectionLabel tooltip={rankingTooltip} tooltipLabel={`${label} details`}>{label}</SectionLabel>
          </p>
          <p className="mt-1 text-sm text-muted-foreground">{t('stockUpdateRankingOptional')}</p>
          {eligibleItemCount === 0 ? (
            <p className="mt-2 text-sm text-muted-foreground">
              {t(entryType === 'service' ? 'stockUpdateNoServicesRankingHelper' : 'stockUpdateNoRetailRankingHelper')}
            </p>
          ) : null}
        </div>
        {values.length > 0 ? (
          <Button type="button" variant="ghost" onClick={() => onChange([])}>
            <ActionUndoIcon className="size-4" />
            {t('stockUpdateClearRanking')}
          </Button>
        ) : null}
      </div>
      {eligibleItemCount > 0 ? (
        <MerchandisingEditor
          entries={entries}
          rankChangeByEntryKey={rankChangeByEntryKey}
          snapshot={snapshot}
          titleLabel={label}
          onChange={(nextEntries) => onChange(reorderIdsFromEntries(nextEntries))}
        />
      ) : null}
    </div>
  );
}

function FlagActionMenu({
  actions,
  label,
}: {
  actions: Array<{ key: string; label: string; icon: ReactNode; onSelect: () => void }>;
  label: string;
}) {
  return (
    <div className="flex justify-end">
      <AnchoredMenu
        label={label}
        triggerIcon={<EntityFlagIcon className="size-4" />}
      >
        {(closeMenu) =>
          actions.map((action) => (
            <button
              key={action.key}
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-foreground transition-colors hover:bg-accent"
              role="menuitem"
              type="button"
              onClick={() => {
                action.onSelect();
                closeMenu();
              }}
            >
              <span className="text-muted-foreground">{action.icon}</span>
              {action.label}
            </button>
          ))
        }
      </AnchoredMenu>
    </div>
  );
}

function FlagSection({
  children,
  label,
  removeLabel,
  onRemove,
}: {
  children: ReactNode;
  label: string;
  removeLabel: string;
  onRemove: () => void;
}) {
  return (
    <div className="grid min-w-0 grid-cols-[8.5rem_minmax(0,12rem)_auto] items-center gap-2 border-b border-border/60 py-3 last:border-b-0 last:pb-0 first:pt-0">
      <p className="shrink-0 whitespace-nowrap text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">{label}</p>
      {children}
      <Button
        aria-label={removeLabel}
        size="icon-sm"
        type="button"
        variant="destructive-outline"
        onClick={onRemove}
      >
        <ActionDeleteIcon className="size-4" />
      </Button>
    </div>
  );
}

const recordUpdateInputClassName = 'bg-input/30 text-left shadow-none';
const recordUpdateSelectTriggerClassName = 'bg-input/30 shadow-none';
const flagControlClassName = `min-w-0 w-full max-w-[12rem] ${recordUpdateInputClassName}`;
const discardChangesButtonClassName = 'hover:bg-destructive/12 hover:text-destructive focus-visible:ring-destructive/20';

function StockSkuSummaryCell({
  sku,
  skuName,
}: {
  sku?: SenaCatalog['skus'][number] | null;
  skuName: string;
}) {
  return <SkuIdentityCell align="center" sku={sku} skuName={skuName} />;
}

function StockLatestUnitsCell({
  countedAtBySku,
  row,
  stockBySku,
}: {
  countedAtBySku: Map<string, string>;
  row: StockRow;
  stockBySku: Map<string, SenaStockSnapshot>;
}) {
  const { t } = usePreferences();
  const latestCountedAt = countedAtBySku.get(row.skuId);
  const latestStock = stockBySku.get(row.skuId);

  return (
    <div className="min-w-0">
      <span className="block font-medium text-foreground">{t('stockUpdateLatestUnitsValue', { count: latestStock?.unitsInStock ?? 0 })}</span>
      <span className="mt-2 block text-sm leading-6 text-muted-foreground">
        {latestCountedAt
          ? t('stockUpdateAsOfDate', { date: formatSenaLongDate(latestCountedAt, 'en') })
          : t('stockUpdateNotCounted')}
      </span>
    </div>
  );
}

function StockLatestMoneyCell({
  countedAtBySku,
  latestValue,
  skuId,
}: {
  countedAtBySku: Map<string, string>;
  latestValue: number | null | undefined;
  skuId: string;
}) {
  const { currency, language, t, usdToKhrExchangeRate } = usePreferences();
  const latestCountedAt = countedAtBySku.get(skuId);

  return (
    <div className="min-w-0">
      <span className="block font-medium text-foreground">
        {latestValue == null ? t('stockUpdateNoMoneyValue') : formatCurrency(latestValue, currency, language, usdToKhrExchangeRate)}
      </span>
      <span className="mt-2 block text-sm leading-6 text-muted-foreground">
        {latestCountedAt
          ? t('stockUpdateAsOfDate', { date: formatSenaLongDate(latestCountedAt, 'en') })
          : t('stockUpdateNotCounted')}
      </span>
    </div>
  );
}

function ServiceSummaryCell({
  service,
  serviceName,
}: {
  service?: SenaCatalog['services'][number] | null;
  serviceName: string;
}) {
  return <ServiceIdentityCell align="center" service={service} serviceName={serviceName} />;
}

function SalesLatestCountCell({
  countLabel,
  latestAt,
  latestValue,
}: {
  countLabel: string;
  latestAt: string | null | undefined;
  latestValue: number | null | undefined;
}) {
  const { language, t } = usePreferences();

  return (
    <div className="min-w-0">
      <span className="block font-medium text-foreground">
        {latestValue == null ? translateUiLiteral(language, 'No prior count') : `${latestValue} ${translateUiLiteral(language, countLabel)}`}
      </span>
      <span className="mt-2 block text-sm leading-6 text-muted-foreground">
        {latestAt
          ? t('stockUpdateAsOfDate', { date: formatSenaLongDate(latestAt, 'en') })
          : translateUiLiteral(language, 'not counted')}
      </span>
    </div>
  );
}

function orderDraftHasContent(draft: SkuSignalDraft | undefined) {
  return draft?.orderedQuantity.trim() !== '';
}

function receiptDraftHasContent(draft: SkuSignalDraft | undefined) {
  return draft?.receiptQuantity.trim() !== '';
}

function LastOrderCell({
  latestAt,
  latestValue,
}: {
  latestAt: string | null | undefined;
  latestValue: number | null | undefined;
}) {
  const { language, t } = usePreferences();

  return (
    <div className="min-w-0">
      <span className="block font-medium text-foreground">
        {latestValue == null ? translateUiLiteral(language, 'No prior order') : translateUiLiteral(language, '{count} units', { count: latestValue })}
      </span>
      <span className="mt-2 block text-sm leading-6 text-muted-foreground">
        {latestAt
          ? t('stockUpdateAsOfDate', { date: formatSenaLongDate(latestAt, 'en') })
          : translateUiLiteral(language, 'not ordered')}
      </span>
    </div>
  );
}

function LastReceiptCell({
  latestAt,
  latestValue,
}: {
  latestAt: string | null | undefined;
  latestValue: number | null | undefined;
}) {
  const { language, t } = usePreferences();

  return (
    <div className="min-w-0">
      <span className="block font-medium text-foreground">
        {latestValue == null ? translateUiLiteral(language, 'No prior receipt') : translateUiLiteral(language, '{count} units', { count: latestValue })}
      </span>
      <span className="mt-2 block text-sm leading-6 text-muted-foreground">
        {latestAt
          ? t('stockUpdateAsOfDate', { date: formatSenaLongDate(latestAt, 'en') })
          : translateUiLiteral(language, 'not received')}
      </span>
    </div>
  );
}

const leadTimeVariabilityIcons: Record<SenaLeadTimeVariabilityClass, IconComponent> = {
  very_tight: StatusReadyIcon,
  tight: StatusTimingIcon,
  normal: StatusGaugeIcon,
  wide: StatusScheduleIcon,
  very_wide: StatusWarningIcon,
};

function RecordOrderTimingFields({
  expectedArrivalValue,
  expectedArrivalPlaceholder,
  leadTimeMeanValue,
  leadTimeMeanPlaceholder,
  onExpectedArrivalChange,
  onLeadTimeMeanChange,
  onVariabilityChange,
  variabilityPlaceholder,
  variabilityValue,
}: {
  expectedArrivalValue: string;
  expectedArrivalPlaceholder: string;
  leadTimeMeanValue: string;
  leadTimeMeanPlaceholder: string;
  onExpectedArrivalChange: (value: string) => void;
  onLeadTimeMeanChange: (value: string) => void;
  onVariabilityChange: (value: SenaLeadTimeVariabilityClass | '') => void;
  variabilityPlaceholder: SenaLeadTimeVariabilityClass | '';
  variabilityValue: SenaLeadTimeVariabilityClass | '';
}) {
  const { language } = usePreferences();
  const expectedArrivalId = 'record-order-expected-arrival';
  const leadTimeMeanId = 'record-order-lead-time-mean';
  const leadTimeVariabilityId = 'record-order-lead-time-variability';
  const selectedVariabilityValue = variabilityValue || variabilityPlaceholder || leadTimeVariabilityPlaceholderValue;

  return (
    <div className="grid gap-3">
      <div className="grid gap-3 xl:grid-cols-3">
        <div className="min-w-0">
          <RecordUpdateFieldLabel htmlFor={leadTimeMeanId}>
            {translateUiLiteral(language, 'Lead time mean')}
          </RecordUpdateFieldLabel>
          <Input
            aria-label={translateUiLiteral(language, 'Lead time mean')}
            className={`w-full ${recordUpdateInputClassName}`}
            id={leadTimeMeanId}
            min="0"
            placeholder={leadTimeMeanPlaceholder}
            step="1"
            type="number"
            value={leadTimeMeanValue}
            onChange={(event) => onLeadTimeMeanChange(event.target.value)}
          />
        </div>
        <div className="min-w-0">
          <RecordUpdateFieldLabel htmlFor={leadTimeVariabilityId}>
            {translateUiLiteral(language, 'Lead time variability')}
          </RecordUpdateFieldLabel>
          <Select
            value={selectedVariabilityValue}
            onValueChange={(value) =>
              onVariabilityChange(value === leadTimeVariabilityPlaceholderValue ? '' : (value as SenaLeadTimeVariabilityClass))
            }
          >
            <SelectTrigger
              aria-label={translateUiLiteral(language, 'Lead time variability')}
              className={cn(recordUpdateSelectTriggerClassName, 'w-full justify-between')}
              id={leadTimeVariabilityId}
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {selectedVariabilityValue === leadTimeVariabilityPlaceholderValue ? (
                <SelectItem value={leadTimeVariabilityPlaceholderValue}>
                  {translateUiLiteral(language, 'Select variability')}
                </SelectItem>
              ) : null}
              {leadTimeVariabilityOptions().map((option) => (
                <SelectItem
                  className="[&_[data-slot=lead-time-description]]:text-xs [&_[data-slot=lead-time-option-copy]]:grid [&_[data-slot=lead-time-option-copy]]:gap-0.5 [&_[data-slot=lead-time-separator]]:hidden"
                  key={option}
                  value={option}
                >
                  <span className="flex min-w-0 items-center gap-2" data-slot="lead-time-option">
                    {(() => {
                      const LeadTimeVariabilityIcon = leadTimeVariabilityIcons[option];

                      return (
                        <LeadTimeVariabilityIcon
                          aria-hidden="true"
                          className="size-4 shrink-0 text-muted-foreground"
                          strokeWidth={1.8}
                        />
                      );
                    })()}
                    <span className="min-w-0 truncate" data-slot="lead-time-option-copy">
                      <span>{translateLeadTimeVariabilityLabel(language, option)}</span>
                      <span data-slot="lead-time-separator">{': '}</span>
                      <span className="text-muted-foreground" data-slot="lead-time-description">
                        {translateLeadTimeVariabilityDescription(language, option)}
                      </span>
                    </span>
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="min-w-0">
          <RecordUpdateFieldLabel htmlFor={expectedArrivalId}>
            {translateUiLiteral(language, 'Expected date of arrival')}
          </RecordUpdateFieldLabel>
          <Input
            aria-label={translateUiLiteral(language, 'Expected date of arrival')}
            className={`w-full ${recordUpdateInputClassName}`}
            id={expectedArrivalId}
            placeholder={expectedArrivalPlaceholder}
            type="date"
            value={expectedArrivalValue}
            onChange={(event) => onExpectedArrivalChange(event.target.value)}
          />
        </div>
      </div>
    </div>
  );
}

function OrderQuantityField({
  ariaLabel,
  orderQuantityPlaceholder,
  orderQuantityValue,
  rowName,
  setOrderQuantity,
}: {
  ariaLabel?: string;
  orderQuantityPlaceholder: string;
  orderQuantityValue: string;
  rowName: string;
  setOrderQuantity: (value: string) => void;
}) {
  const { language } = usePreferences();

  return (
    <div className="min-w-0">
      <RecordUpdateMobileLabel>{translateUiLiteral(language, 'Current order')}</RecordUpdateMobileLabel>
      <Input
        aria-label={ariaLabel ?? translateUiLiteral(language, 'Current order for {name}', { name: rowName })}
        className={`w-full max-w-[18rem] ${recordUpdateInputClassName}`}
        min="0"
        placeholder={orderQuantityPlaceholder}
        step="1"
        type="number"
        value={orderQuantityValue}
        onChange={(event) => setOrderQuantity(event.target.value)}
      />
    </div>
  );
}

function RecordReceiptDateField({
  receivedDatePlaceholder,
  receivedDateValue,
  setReceivedDate,
}: {
  receivedDatePlaceholder: string;
  receivedDateValue: string;
  setReceivedDate: (value: string) => void;
}) {
  const { language } = usePreferences();
  const receivedDateId = 'record-receipt-received-date';

  return (
    <div className="grid gap-3 xl:grid-cols-3">
      <div className="min-w-0">
        <RecordUpdateFieldLabel htmlFor={receivedDateId}>
          {translateUiLiteral(language, 'Received date')}
        </RecordUpdateFieldLabel>
        <Input
          aria-label={translateUiLiteral(language, 'Received date')}
          className={`w-full ${recordUpdateInputClassName}`}
          id={receivedDateId}
          placeholder={receivedDatePlaceholder}
          type="date"
          value={receivedDateValue}
          onChange={(event) => setReceivedDate(event.target.value)}
        />
      </div>
    </div>
  );
}

function ReceiptQuantityField({
  ariaLabel,
  receiptQuantityValue,
  rowName,
  setReceiptQuantity,
}: {
  ariaLabel?: string;
  receiptQuantityValue: string;
  rowName: string;
  setReceiptQuantity: (value: string) => void;
}) {
  const { language } = usePreferences();

  return (
    <div className="min-w-0">
      <RecordUpdateMobileLabel>{translateUiLiteral(language, 'Current receipt')}</RecordUpdateMobileLabel>
      <Input
        aria-label={ariaLabel ?? translateUiLiteral(language, 'Current receipt for {name}', { name: rowName })}
        className={`w-full max-w-[18rem] ${recordUpdateInputClassName}`}
        min="0"
        step="1"
        type="number"
        value={receiptQuantityValue}
        onChange={(event) => setReceiptQuantity(event.target.value)}
      />
    </div>
  );
}

type RecordUpdateTableColumn = {
  header: ReactNode;
  ariaLabel?: string;
  className?: string;
  headClassName?: string;
  width?: string;
};

const recordUpdateWhiteCardClassName = '![background:white]';
const recordUpdateWhiteCardStyle = { background: 'white' } satisfies CSSProperties;

function RecordUpdateTable({
  children,
  columns,
  testId,
}: {
  children: ReactNode;
  columns: RecordUpdateTableColumn[];
  testId?: string;
}) {
  return (
    <div className="-mx-6 overflow-x-auto bg-white">
      <Table className="min-w-[760px] table-fixed bg-white">
        <colgroup>
          {columns.map((column, index) => (
            <col key={index} style={column.width ? { width: column.width } : undefined} />
          ))}
        </colgroup>
        <TableHeader>
          <TableRow className={cn(recordUpdateTableRowClassName, 'hover:bg-transparent')}>
            {columns.map((column, index) => (
              <TableHead
                aria-label={column.ariaLabel}
                aria-hidden={column.header == null ? true : undefined}
                className={cn(recordUpdateTableHeadClassName, recordUpdateTableHeaderClassName, column.className, column.headClassName)}
                key={index}
              >
                {column.header}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody data-testid={testId}>
          {children}
        </TableBody>
      </Table>
    </div>
  );
}

function RecordUpdateMobileLabel({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <p className={cn(recordUpdateTableHeaderClassName, 'mb-1 xl:hidden')}>
      {children}
    </p>
  );
}

function RecordUpdateFieldLabel({
  children,
  className,
  htmlFor,
}: {
  children: ReactNode;
  className?: string;
  htmlFor?: string;
}) {
  return (
    <label className={cn(recordUpdateTableHeaderClassName, 'mb-2 block', className)} htmlFor={htmlFor}>
      {children}
    </label>
  );
}

function DeliveryFeeFields({
  amountId,
  amountInputRef,
  amountLabel,
  amountValue,
  lockedPayer,
  payer,
  onAmountChange,
  onPayerChange,
}: {
  amountId: string;
  amountInputRef?: Ref<HTMLInputElement>;
  amountLabel: string;
  amountValue: string;
  lockedPayer: boolean;
  payer: SenaDeliveryFeePayer;
  onAmountChange: (value: string) => void;
  onPayerChange: (payer: SenaDeliveryFeePayer) => void;
}) {
  const { currency, language } = usePreferences();
  return (
    <div className="grid gap-4">
      <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto]">
        <div className="grid gap-2">
          <RecordUpdateFieldLabel htmlFor={amountId}>
            <span className="inline-flex items-center gap-2">
              <span>{amountLabel}</span>
              <HelpTooltip
                content={deliveryFeeHelpText(language)}
                label={translateUiLiteral(language, 'Delivery fee')}
              />
            </span>
          </RecordUpdateFieldLabel>
          <Input
            ref={amountInputRef}
            id={amountId}
            aria-label={amountLabel}
            inputMode="decimal"
            min="0"
            step={moneyInputStep(currency)}
            type="number"
            value={amountValue}
            onChange={(event) => onAmountChange(event.target.value)}
          />
        </div>
        <div className="grid gap-2">
          <RecordUpdateFieldLabel>{translateUiLiteral(language, 'Paid by')}</RecordUpdateFieldLabel>
          {lockedPayer ? (
            <div className="inline-flex h-10 w-fit items-center gap-2 rounded-full border border-border/70 bg-muted/40 px-4 text-sm font-medium text-foreground">
              <EntityServiceIcon data-icon="inline-start" className="size-4" />
              {translateUiLiteral(language, 'Merchant')}
            </div>
          ) : (
            <ToggleGroup
              aria-label={translateUiLiteral(language, 'Select who pays delivery')}
              className="max-w-full justify-start self-start overflow-x-auto rounded-full bg-muted/40"
              spacing={1}
              type="single"
              value={payer}
              onValueChange={(value) => {
                if (isDeliveryFeePayer(value)) {
                  onPayerChange(value);
                }
              }}
            >
              <ToggleGroupItem className="rounded-full border border-transparent px-4 text-sm" value="customer">
                <EntityCustomerIcon data-icon="inline-start" className="size-4" />
                {translateUiLiteral(language, 'Customer')}
              </ToggleGroupItem>
              <ToggleGroupItem className="rounded-full border border-transparent px-4 text-sm" value="merchant">
                <EntityServiceIcon data-icon="inline-start" className="size-4" />
                {translateUiLiteral(language, 'Merchant')}
              </ToggleGroupItem>
            </ToggleGroup>
          )}
        </div>
      </div>
    </div>
  );
}

function OptionalStockDecisionCard({
  choice,
  helper,
  onNo,
  onYes,
  question,
}: {
  choice: OptionalStockStepChoice;
  helper: string;
  onNo: () => void;
  onYes: () => void;
  question: string;
}) {
  const { t } = usePreferences();

  return (
    <div className="grid justify-items-center gap-4 py-5 text-center">
      <div className="grid max-w-[34rem] gap-1">
        <p className="text-sm font-medium text-foreground">{question}</p>
        <p className="text-sm text-muted-foreground">{helper}</p>
      </div>
      <div className="flex items-center justify-center gap-2">
        <Button type="button" variant={choice === 'yes' ? 'default' : 'outline'} onClick={onYes}>
          <ActionConfirmIcon data-icon="inline-start" />
          {t('stockUpdateOptionalStepYes')}
        </Button>
        <Button type="button" variant={choice === 'no' ? 'secondary' : 'outline'} onClick={onNo}>
          <ActionCloseIcon data-icon="inline-start" />
          {t('stockUpdateOptionalStepNo')}
        </Button>
      </div>
    </div>
  );
}

type SortableStockTableRowConfig = {
  cells: ReactNode[];
  dragLabel: string;
  highlight?: boolean;
  inputCellIndexes: number[];
};

function StockReorderHint() {
  const { t } = usePreferences();

  return (
    <p className="text-sm text-muted-foreground">
      {t('stockUpdateStockRowOrderHint')}
    </p>
  );
}

function SortableStockTable({
  bodyTestId,
  debugCellBoundaries,
  columns,
  renderRow,
  rows,
  onReorderRows,
}: {
  bodyTestId?: string;
  debugCellBoundaries: boolean;
  columns: RecordUpdateTableColumn[];
  renderRow: (row: StockRow) => SortableStockTableRowConfig;
  rows: StockRow[];
  onReorderRows: (activeSkuId: string, overSkuId: string) => void;
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 6,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );
  const debugTrackClassName = debugCellBoundaries ? tableDebugTrackClassName : '';
  const debugFlushClassName = debugCellBoundaries ? tableDebugFlushClassName : '';

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over) {
      return;
    }

    onReorderRows(String(active.id), String(over.id));
  }

  return (
    <DndContext collisionDetection={closestCenter} onDragEnd={handleDragEnd} sensors={sensors}>
      <RecordUpdateTable columns={columns} testId={bodyTestId}>
        <SortableContext items={rows.map((row) => row.skuId)} strategy={verticalListSortingStrategy}>
          {rows.map((row) => {
            const rowConfig = renderRow(row);

            return (
              <SortableStockTableRow
                cells={rowConfig.cells}
                className={cn(debugTrackClassName, debugFlushClassName)}
                dragLabel={rowConfig.dragLabel}
                highlight={rowConfig.highlight}
                id={row.skuId}
                inputCellIndexes={rowConfig.inputCellIndexes}
                key={row.skuId}
              />
            );
          })}
        </SortableContext>
      </RecordUpdateTable>
    </DndContext>
  );
}

function SortableIdTable({
  bodyTestId,
  debugCellBoundaries,
  columns,
  ids,
  onReorderRows,
  renderRow,
}: {
  bodyTestId?: string;
  debugCellBoundaries: boolean;
  columns: RecordUpdateTableColumn[];
  ids: string[];
  onReorderRows: (activeId: string, overId: string) => void;
  renderRow: (id: string) => SortableStockTableRowConfig;
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 6,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );
  const debugTrackClassName = debugCellBoundaries ? tableDebugTrackClassName : '';
  const debugFlushClassName = debugCellBoundaries ? tableDebugFlushClassName : '';

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over) {
      return;
    }

    onReorderRows(String(active.id), String(over.id));
  }

  return (
    <DndContext collisionDetection={closestCenter} onDragEnd={handleDragEnd} sensors={sensors}>
      <RecordUpdateTable columns={columns} testId={bodyTestId}>
        <SortableContext items={ids} strategy={verticalListSortingStrategy}>
          {ids.map((id) => {
            const rowConfig = renderRow(id);

            return (
              <SortableStockTableRow
                cells={rowConfig.cells}
                className={cn(debugTrackClassName, debugFlushClassName)}
                dragLabel={rowConfig.dragLabel}
                highlight={rowConfig.highlight}
                id={id}
                inputCellIndexes={rowConfig.inputCellIndexes}
                key={id}
              />
            );
          })}
        </SortableContext>
      </RecordUpdateTable>
    </DndContext>
  );
}

function SortableStockTableRow({
  cells,
  className,
  dragLabel,
  highlight = false,
  id,
  inputCellIndexes,
}: {
  cells: ReactNode[];
  className?: string;
  dragLabel: string;
  highlight?: boolean;
  id: string;
  inputCellIndexes: number[];
}) {
  const {
    attributes,
    isDragging,
    listeners,
    setActivatorNodeRef,
    setNodeRef,
    transform,
    transition,
  } = useSortable({ id });
  const inputIndexSet = new Set(inputCellIndexes);

  return (
    <TableRow
      className={cn(
        recordUpdateTableRowClassName,
        className,
        highlight && 'bg-muted/20',
        isDragging && 'relative z-10 bg-white shadow-[0_16px_40px_rgba(27,15,7,0.12)]',
      )}
      ref={setNodeRef}
      style={
        transform
          ? {
              transform: CSS.Transform.toString(transform),
              transition,
            }
          : { transition }
      }
    >
      <TableCell className={cn(recordUpdateTableCellClassName, 'w-12 px-3 text-center')}>
        <button
          {...attributes}
          {...listeners}
          aria-label={dragLabel}
          className="mx-auto flex size-8 shrink-0 touch-none items-center justify-center rounded-md text-muted-foreground transition-[background-color,color,transform,opacity] duration-150 ease-out group-hover/row:text-foreground hover:bg-accent/60 hover:text-foreground focus-visible:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 active:scale-95 active:cursor-grabbing motion-reduce:transition-none"
          ref={setActivatorNodeRef}
          type="button"
        >
          <ActionDragHandleIcon aria-hidden="true" className="size-4 shrink-0 cursor-grab" />
        </button>
      </TableCell>
      {cells.map((cell, index) => {
        const draggable = !inputIndexSet.has(index);

        return (
          <TableCell
            key={index}
            {...(draggable ? listeners : {})}
            className={cn(recordUpdateTableCellClassName, 'min-w-0', draggable && 'cursor-grab active:cursor-grabbing')}
          >
            {cell}
          </TableCell>
        );
      })}
    </TableRow>
  );
}

function StockCountStep({
  catalog,
  countedAtBySku,
  debugCellBoundaries,
  rows,
  guidance,
  onReorderRows,
  stockBySku,
  updateRow,
  visibleRows,
  supplierFilterControl,
}: {
  catalog: SenaCatalog | null;
  countedAtBySku: Map<string, string>;
  debugCellBoundaries: boolean;
  guidance?: string | null;
  onReorderRows: (activeSkuId: string, overSkuId: string) => void;
  rows: StockRow[];
  stockBySku: Map<string, SenaStockSnapshot>;
  updateRow: (skuId: string, patch: Partial<StockRow>) => void;
  visibleRows: StockRow[];
  supplierFilterControl?: ReactNode;
}) {
  const { t } = usePreferences();

  return (
    <WorkspacePanel
      action={null}
      className={recordUpdateWhiteCardClassName}
      descriptor={t(STOCK_UPDATE_STEP_COPY.stock.descriptionKey)}
      style={recordUpdateWhiteCardStyle}
      title={
        <SectionLabel
          tooltip={t('stockUpdateStockStepTooltip')}
          tooltipLabel={t('stockUpdateStockStepTooltipLabel')}
        >
          {t(STOCK_UPDATE_STEP_COPY.stock.titleKey)}
        </SectionLabel>
      }
    >
      <div className="grid gap-3">
        {guidance ? <p className="text-sm text-destructive">{guidance}</p> : null}
        <RecordUpdateFilterRow supplierFilterControl={supplierFilterControl} />
        {(catalog?.skus ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('stockUpdateNoSkusHelper')}</p>
        ) : (
          <>
            <SortableStockTable
              bodyTestId="stock-count-list"
              debugCellBoundaries={debugCellBoundaries}
              columns={[
                {
                  header: null,
                  className: 'w-12 px-3 text-center',
                  width: '3.5rem',
                },
                { header: t('stockUpdateSkuLatestObservation'), width: '37%' },
                { header: t('stockUpdateLatestUnits'), width: '24%' },
                { header: t('stockUpdateCurrentUnits'), width: '31%' },
              ]}
              rows={visibleRows}
              onReorderRows={onReorderRows}
              renderRow={(row) => {
                const sku = catalog?.skus.find((entry) => entry.skuId === row.skuId);
                const latestUnits = stockBySku.get(row.skuId)?.unitsInStock ?? 0;
                const unitsChanged = stockRowChanged(catalog, stockBySku, row);

                return {
                  dragLabel: t('stockUpdateReorderSkuRow', { name: sku?.name ?? row.skuId }),
                  highlight: unitsChanged,
                  inputCellIndexes: [2],
                  cells: [
                    <StockSkuSummaryCell sku={sku} skuName={sku?.name ?? row.skuId} />,
                    <StockLatestUnitsCell countedAtBySku={countedAtBySku} row={row} stockBySku={stockBySku} />,
                    <>
                      <RecordUpdateMobileLabel>{t('stockUpdateCurrentUnits')}</RecordUpdateMobileLabel>
                      <div className="pr-3">
                        <Input
                          aria-label={t('stockUpdateCurrentUnits')}
                          className={`w-full max-w-[18rem] ${recordUpdateInputClassName}`}
                          min="0"
                          placeholder={String(latestUnits)}
                          step="1"
                          type="number"
                          value={unitsChanged ? String(row.unitsInStock) : ''}
                          onChange={(event) =>
                            updateRow(row.skuId, {
                              unitsInStock: event.target.value === '' ? latestUnits : Number(event.target.value),
                            })
                          }
                        />
                      </div>
                    </>,
                  ],
                };
              }}
            />
            <StockReorderHint />
          </>
        )}
        {(catalog?.skus ?? []).length > 0 && visibleRows.length === 0 ? (
          <p className="rounded-[1.25rem] border border-dashed border-border/70 px-4 py-5 text-sm text-muted-foreground">
            {t('stockUpdateNoSkuMatches')}
          </p>
        ) : null}
      </div>
    </WorkspacePanel>
  );
}

function StockCostStep(props: {
  catalog: SenaCatalog | null;
  choice: OptionalStockStepChoice;
  countedAtBySku: Map<string, string>;
  currency: 'USD' | 'KHR';
  debugCellBoundaries: boolean;
  guidance?: string | null;
  onReorderRows: (activeSkuId: string, overSkuId: string) => void;
  rows: StockRow[];
  stockBySku: Map<string, SenaStockSnapshot>;
  usdToKhrExchangeRate: number;
  updateRow: (skuId: string, patch: Partial<StockRow>) => void;
  visibleRows: StockRow[];
  onChooseNo: () => void;
  onChooseYes: () => void;
  supplierFilterControl?: ReactNode;
}) {
  const { t } = usePreferences();
  const { catalog, choice, countedAtBySku, currency, debugCellBoundaries, guidance, onReorderRows, stockBySku, usdToKhrExchangeRate, updateRow, visibleRows, onChooseNo, onChooseYes, supplierFilterControl } = props;

  return (
    <WorkspacePanel
      action={null}
      className={recordUpdateWhiteCardClassName}
      descriptor={t('stockUpdateCostStepDescription')}
      style={recordUpdateWhiteCardStyle}
      title={<SectionLabel tooltip={t('stockUpdateCostStepTooltip')} tooltipLabel={t('stockUpdateCostIfChanged')}>{t('stockUpdateCostIfChanged')}</SectionLabel>}
    >
      <div className="grid gap-3">
        {guidance ? <p className="text-sm text-destructive">{guidance}</p> : null}
        <OptionalStockDecisionCard choice={choice} helper={t('stockUpdateCostStepHelper')} onNo={onChooseNo} onYes={onChooseYes} question={t('stockUpdateCostStepQuestion')} />
        {choice === 'yes' ? <RecordUpdateFilterRow supplierFilterControl={supplierFilterControl} /> : null}
        {choice === 'yes' ? (
          (catalog?.skus ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">{t('stockUpdateNoSkusHelper')}</p>
          ) : (
            <>
              <SortableStockTable
                debugCellBoundaries={debugCellBoundaries}
                columns={[
                  {
                    header: null,
                    className: 'w-12 px-3 text-center',
                    width: '3.5rem',
                  },
                  { header: t('stockUpdateSkuLatestObservation'), width: '37%' },
                  { header: t('stockUpdateLatestCost'), width: '24%' },
                  { header: t('stockUpdateCurrentCost'), width: '31%' },
                ]}
                rows={visibleRows}
                onReorderRows={onReorderRows}
                renderRow={(row) => {
                  const sku = catalog?.skus.find((entry) => entry.skuId === row.skuId);
                  const latestCost = stockBySku.get(row.skuId)?.costPerUnit ?? null;
                  const costChanged = stockCostChanged(catalog, stockBySku, row);
                  const latestCostPlaceholder =
                    latestCost == null ? '' : String(displayMoneyFromUsd(latestCost, currency, usdToKhrExchangeRate));

                  return {
                    dragLabel: t('stockUpdateReorderSkuRow', { name: sku?.name ?? row.skuId }),
                    highlight: costChanged,
                    inputCellIndexes: [2],
                    cells: [
                      <StockSkuSummaryCell sku={sku} skuName={sku?.name ?? row.skuId} />,
                      <StockLatestMoneyCell countedAtBySku={countedAtBySku} latestValue={latestCost} skuId={row.skuId} />,
                      <>
                        <RecordUpdateMobileLabel>{t('stockUpdateCurrentCost')}</RecordUpdateMobileLabel>
                        <div className="flex justify-start pr-3">
                          <Input
                            aria-label={t('stockUpdateCurrentCost')}
                            className={`w-full max-w-[18rem] ${recordUpdateInputClassName}`}
                            min="0"
                            placeholder={latestCostPlaceholder}
                            step={moneyInputStep(currency)}
                            type="number"
                            value={costChanged && row.costPerUnit != null ? displayMoneyFromUsd(row.costPerUnit, currency, usdToKhrExchangeRate) : ''}
                            onChange={(event) =>
                              updateRow(row.skuId, {
                                costPerUnit: event.target.value ? usdMoneyFromDisplay(Number(event.target.value), currency, usdToKhrExchangeRate) : latestCost,
                              })
                            }
                          />
                        </div>
                      </>,
                    ],
                  };
                }}
              />
              <StockReorderHint />
            </>
          )
        ) : null}
      </div>
    </WorkspacePanel>
  );
}

function StockRetailPriceStep(props: {
  catalog: SenaCatalog | null;
  choice: OptionalStockStepChoice;
  countedAtBySku: Map<string, string>;
  currency: 'USD' | 'KHR';
  debugCellBoundaries: boolean;
  guidance?: string | null;
  onReorderRows: (activeSkuId: string, overSkuId: string) => void;
  stockBySku: Map<string, SenaStockSnapshot>;
  rows: StockRow[];
  usdToKhrExchangeRate: number;
  updateRow: (skuId: string, patch: Partial<StockRow>) => void;
  visibleRows: StockRow[];
  onChooseNo: () => void;
  onChooseYes: () => void;
  supplierFilterControl?: ReactNode;
}) {
  const { t } = usePreferences();
  const { catalog, choice, countedAtBySku, currency, debugCellBoundaries, guidance, onReorderRows, stockBySku, usdToKhrExchangeRate, updateRow, visibleRows, onChooseNo, onChooseYes, supplierFilterControl } = props;

  return (
    <WorkspacePanel
      action={null}
      className={recordUpdateWhiteCardClassName}
      descriptor={t('stockUpdateRetailPriceStepDescription')}
      style={recordUpdateWhiteCardStyle}
      title={<SectionLabel tooltip={t('stockUpdateRetailPriceStepTooltip')} tooltipLabel={t('stockUpdateRetailPriceIfChanged')}>{t('stockUpdateRetailPriceIfChanged')}</SectionLabel>}
    >
      <div className="grid gap-3">
        {guidance ? <p className="text-sm text-destructive">{guidance}</p> : null}
        <OptionalStockDecisionCard choice={choice} helper={t('stockUpdateRetailPriceStepHelper')} onNo={onChooseNo} onYes={onChooseYes} question={t('stockUpdateRetailPriceStepQuestion')} />
        {choice === 'yes' ? <RecordUpdateFilterRow supplierFilterControl={supplierFilterControl} /> : null}
        {choice === 'yes' ? (
          (catalog?.skus ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">{t('stockUpdateNoSkusHelper')}</p>
          ) : (
            <>
              <SortableStockTable
                debugCellBoundaries={debugCellBoundaries}
                columns={[
                  {
                    header: null,
                    className: 'w-12 px-3 text-center',
                    width: '3.5rem',
                  },
                  { header: t('stockUpdateSkuLatestObservation'), width: '37%' },
                  { header: t('stockUpdateLatestRetailPrice'), width: '24%' },
                  { header: t('stockUpdateCurrentRetailPrice'), width: '31%' },
                ]}
                rows={visibleRows}
                onReorderRows={onReorderRows}
                renderRow={(row) => {
                  const sku = catalog?.skus.find((entry) => entry.skuId === row.skuId);
                  const latestRetailPrice = stockBySku.get(row.skuId)?.productPrice ?? null;
                  const retailPriceChanged = stockRetailPriceChanged(catalog, stockBySku, row);
                  const latestRetailPricePlaceholder =
                    latestRetailPrice == null ? '' : String(displayMoneyFromUsd(latestRetailPrice, currency, usdToKhrExchangeRate));

                  return {
                    dragLabel: t('stockUpdateReorderSkuRow', { name: sku?.name ?? row.skuId }),
                    highlight: retailPriceChanged,
                    inputCellIndexes: [2],
                    cells: [
                      <StockSkuSummaryCell sku={sku} skuName={sku?.name ?? row.skuId} />,
                      <StockLatestMoneyCell countedAtBySku={countedAtBySku} latestValue={latestRetailPrice} skuId={row.skuId} />,
                      <>
                        <RecordUpdateMobileLabel>{t('stockUpdateCurrentRetailPrice')}</RecordUpdateMobileLabel>
                        <div className="flex justify-start pr-3">
                          <Input
                            aria-label={t('stockUpdateCurrentRetailPrice')}
                            className={`w-full max-w-[18rem] ${recordUpdateInputClassName}`}
                            disabled={!sku?.soldAsProduct}
                            min="0"
                            placeholder={latestRetailPricePlaceholder}
                            step={moneyInputStep(currency)}
                            type="number"
                            value={retailPriceChanged && row.productPrice != null ? displayMoneyFromUsd(row.productPrice, currency, usdToKhrExchangeRate) : ''}
                            onChange={(event) =>
                              updateRow(row.skuId, {
                                productPrice: event.target.value ? usdMoneyFromDisplay(Number(event.target.value), currency, usdToKhrExchangeRate) : latestRetailPrice,
                              })
                            }
                          />
                        </div>
                      </>,
                    ],
                  };
                }}
              />
              <StockReorderHint />
            </>
          )
        ) : null}
      </div>
    </WorkspacePanel>
  );
}

function StockFlagsStep(props: {
  catalog: SenaCatalog | null;
  choice: OptionalStockStepChoice;
  countedAtBySku: Map<string, string>;
  debugCellBoundaries: boolean;
  guidance?: string | null;
  onReorderRows: (activeSkuId: string, overSkuId: string) => void;
  skuSignalDrafts: Record<string, SkuSignalDraft>;
  stockBySku: Map<string, SenaStockSnapshot>;
  updateSkuSignalDraft: (skuId: string, updater: (draft: SkuSignalDraft) => SkuSignalDraft) => void;
  visibleRows: StockRow[];
  onChooseNo: () => void;
  onChooseYes: () => void;
  supplierFilterControl?: ReactNode;
}) {
  const { t } = usePreferences();
  const { catalog, choice, countedAtBySku, debugCellBoundaries, guidance, onReorderRows, skuSignalDrafts, stockBySku, updateSkuSignalDraft, visibleRows, onChooseNo, onChooseYes, supplierFilterControl } = props;
  const stockEventOptions: Array<{
    value: StockEventDropdownValue;
    label: string;
    icon: ReactNode;
  }> = [
    {
      value: 'none',
      label: t('stockUpdateNoEventInterval'),
      icon: <StatusReadyIcon aria-hidden="true" className="size-4" />,
    },
    {
      value: 'blocked',
      label: t('stockUpdateBlockedEvent'),
      icon: <StatusWarningIcon aria-hidden="true" className="size-4" />,
    },
    {
      value: 'stockout',
      label: t('stockUpdateStockoutEvent'),
      icon: <EntityFlagIcon aria-hidden="true" className="size-4" />,
    },
  ];

  return (
    <WorkspacePanel
      action={null}
      className={recordUpdateWhiteCardClassName}
      descriptor={t('stockUpdateFlagsStepDescription')}
      style={recordUpdateWhiteCardStyle}
      title={<SectionLabel tooltip={t('stockUpdateSkuFlagsTooltip')} tooltipLabel={t('stockUpdateSkuFlagsTooltipLabel')}>{t('stockUpdateAddFlags')}</SectionLabel>}
    >
      <div className="grid gap-3">
        {guidance ? <p className="text-sm text-destructive">{guidance}</p> : null}
        <OptionalStockDecisionCard choice={choice} helper={t('stockUpdateFlagsStepHelper')} onNo={onChooseNo} onYes={onChooseYes} question={t('stockUpdateFlagsStepQuestion')} />
        {choice === 'yes' ? <RecordUpdateFilterRow supplierFilterControl={supplierFilterControl} /> : null}
        {choice === 'yes' ? (
          (catalog?.skus ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">{t('stockUpdateNoSkusHelper')}</p>
          ) : (
            <>
              <SortableStockTable
                debugCellBoundaries={debugCellBoundaries}
                columns={[
                  {
                    header: null,
                    className: 'w-12 px-3 text-center',
                    width: '3.5rem',
                  },
                  { header: t('stockUpdateSkuLatestObservation'), width: '52%' },
                  { header: t('stockUpdateEventColumn'), width: '40%' },
                ]}
                rows={visibleRows}
                onReorderRows={onReorderRows}
                renderRow={(row) => {
                  const sku = catalog?.skus.find((entry) => entry.skuId === row.skuId);
                  const draft = skuSignalDrafts[row.skuId];
                  const eventValue = draft?.blockedEnabled ? draft.blockedState : 'none';

                  return {
                    dragLabel: t('stockUpdateReorderSkuRow', { name: sku?.name ?? row.skuId }),
                    highlight: Boolean(draft?.blockedEnabled),
                    inputCellIndexes: [1],
                    cells: [
                      <StockSkuSummaryCell sku={sku} skuName={sku?.name ?? row.skuId} />,
                      <div className="min-w-0">
                        <RecordUpdateMobileLabel>{t('stockUpdateEventColumn')}</RecordUpdateMobileLabel>
                        <Select
                          value={eventValue}
                          onValueChange={(value) =>
                            updateSkuSignalDraft(row.skuId, (current) => ({
                              ...skuEventOnlyDraft(current),
                              blockedEnabled: value !== 'none',
                              blockedState: value === 'stockout' ? 'stockout' : 'blocked',
                            }))
                          }
                        >
                          <SelectTrigger
                            aria-label={t('stockUpdateEventFor', { name: sku?.name ?? row.skuId })}
                            className={cn('min-w-0 w-full max-w-[18rem]', recordUpdateSelectTriggerClassName, 'justify-between')}
                          >
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {stockEventOptions.map((option) => (
                              <SelectItem key={option.value} value={option.value}>
                                <span className="flex items-center gap-2">
                                  {option.icon}
                                  <span>{option.label}</span>
                                </span>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>,
                    ],
                  };
                }}
              />
              <StockReorderHint />
            </>
          )
        ) : null}
      </div>
    </WorkspacePanel>
  );
}

function SalesRankingFallback({
  catalog,
  entryType,
  helper,
  label,
  seedValues,
  values,
  onChange,
}: {
  catalog: SenaCatalog | null;
  entryType: RankingEntryType;
  helper: string;
  label: string;
  seedValues: string[];
  values: string[];
  onChange: (values: string[]) => void;
}) {
  return (
    <div className="grid gap-4">
      <p className="text-sm text-muted-foreground">{helper}</p>
      <RankingSignalEditor
        catalog={catalog}
        entryType={entryType}
        label={label}
        seedValues={seedValues}
        values={values}
        onChange={onChange}
      />
    </div>
  );
}

function customerPendingResultQuantity({
  mode,
  previousOpen,
  value,
}: {
  mode: CustomerPendingMode;
  previousOpen: number;
  value: string;
}) {
  const quantity = value.trim() === '' ? null : Number(value);
  if (quantity == null || !Number.isFinite(quantity) || quantity < 0) {
    return previousOpen;
  }
  if (mode === 'modify_pending') {
    return quantity;
  }
  if (mode === 'cancel_pending') {
    return Math.max(0, previousOpen - quantity);
  }
  return previousOpen + quantity;
}

function customerPendingInputLabel(language: AppLanguage, mode: CustomerPendingMode, name: string) {
  if (mode === 'modify_pending') {
    return translateUiLiteral(language, 'New open quantity for {name}', { name });
  }
  if (mode === 'cancel_pending') {
    return translateUiLiteral(language, 'Cancel quantity for {name}', { name });
  }
  return translateUiLiteral(language, 'New pending quantity for {name}', { name });
}

function workflowInputIndexes(startIndex: number, count: number) {
  return Array.from({ length: count }, (_, index) => startIndex + index);
}

function customerCompletedInputLabel(language: AppLanguage, mode: CustomerCompletedMode, activeMode: CustomerCompletedMode, name: string) {
  if (mode === activeMode) {
    return translateUiLiteral(language, 'Current interval sales for {name}', { name });
  }
  return translateUiLiteral(language, "{state} for {name}", { state: workflowStateLabel(language, mode), name });
}

function CustomerPendingRetailStep({
  catalog,
  debugCellBoundaries,
  filterControl,
  guidance,
  latestOpenBySku,
  mode,
  modes,
  onReorderRows,
  retailSalesDrafts,
  retailSkuIds,
  setMode,
  setRetailSalesDraft,
  supplierFilterControl,
}: {
  catalog: SenaCatalog | null;
  debugCellBoundaries: boolean;
  filterControl?: ReactNode;
  guidance?: string | null;
  latestOpenBySku: Map<string, number>;
  mode: CustomerPendingMode;
  modes: CustomerPendingMode[];
  onReorderRows: (activeId: string, overId: string) => void;
  retailSalesDrafts: SalesCountDrafts;
  retailSkuIds: string[];
  setMode: (mode: CustomerPendingMode) => void;
  setRetailSalesDraft: (skuId: string, value: string) => void;
  supplierFilterControl?: ReactNode;
}) {
  const { language } = usePreferences();

  return (
    <WorkspacePanel
      className={recordUpdateWhiteCardClassName}
      descriptor={translateUiLiteral(language, 'Record open retail commitments without changing physical stock on hand.')}
      style={recordUpdateWhiteCardStyle}
      title={translateUiLiteral(language, 'Open retail / sellable SKU orders')}
    >
      <div className="grid gap-3">
        {guidance ? <p className="text-sm text-destructive">{guidance}</p> : null}
        <RecordUpdateFilterRow stateFilterControl={filterControl} supplierFilterControl={supplierFilterControl} />
        {retailSkuIds.length === 0 ? (
          <p className="text-sm text-muted-foreground">{translateUiLiteral(language, 'No sellable SKUs available.')}</p>
        ) : (
          <>
            <SortableIdTable
              bodyTestId="customer-pending-retail-list"
              columns={[
                { header: null, className: 'w-12 px-3 text-center', width: '3.5rem' },
                { header: translateUiLiteral(language, 'SKU'), width: '30%' },
                { header: translateUiLiteral(language, 'Open now'), width: '18%' },
                ...modes.map((nextMode) => ({
                  header: (
                    <WorkflowStateColumnHeader state={nextMode}>
                      {workflowStateLabel(language, nextMode)}
                    </WorkflowStateColumnHeader>
                  ),
                  width: `${Math.floor(52 / Math.max(1, modes.length))}%`,
                })),
              ]}
              debugCellBoundaries={debugCellBoundaries}
              ids={retailSkuIds}
              onReorderRows={onReorderRows}
              renderRow={(skuId) => {
                const sku = catalog?.skus.find((entry) => entry.skuId === skuId);
                const latestValue = latestOpenBySku.get(skuId) ?? 0;
                const resultingOpen = customerPendingResultQuantity({
                  mode,
                  previousOpen: latestValue,
                  value: retailSalesDrafts[skuId] ?? '',
                });
                return {
                  dragLabel: translateUiLiteral(language, 'Reorder {name}', { name: sku?.name ?? skuId }),
                  highlight: (retailSalesDrafts[skuId]?.trim() ?? '') !== '',
                  inputCellIndexes: workflowInputIndexes(2, modes.length),
                  cells: [
                    <StockSkuSummaryCell sku={sku} skuName={sku?.name ?? skuId} />,
                    <SalesLatestCountCell countLabel="open" latestAt={null} latestValue={latestValue} />,
                    ...modes.map((nextMode) => (
                      <div key={nextMode} className="grid gap-2 pr-3">
                        <Input
                          aria-label={customerPendingInputLabel(language, nextMode, sku?.name ?? skuId)}
                          className={`w-full max-w-[18rem] ${recordUpdateInputClassName}`}
                          min="0"
                          placeholder={nextMode === 'modify_pending' ? String(latestValue) : ''}
                          step="1"
                          type="number"
                          value={nextMode === mode ? retailSalesDrafts[skuId] ?? '' : ''}
                          onChange={(event) => {
                            setMode(nextMode);
                            setRetailSalesDraft(skuId, event.target.value);
                          }}
                        />
                        {nextMode === mode ? (
                          <p className="text-xs text-muted-foreground">
                            {translateUiLiteral(language, 'Resulting open: {count}', { count: resultingOpen })}
                          </p>
                        ) : null}
                      </div>
                    )),
                  ],
                };
              }}
            />
            <StockReorderHint />
          </>
        )}
      </div>
    </WorkspacePanel>
  );
}

function CustomerPendingServiceStep({
  catalog,
  debugCellBoundaries,
  filterControl,
  guidance,
  latestOpenByService,
  mode,
  modes,
  onReorderRows,
  serviceIds,
  serviceSalesDrafts,
  setMode,
  setServiceSalesDraft,
  supplierFilterControl,
}: {
  catalog: SenaCatalog | null;
  debugCellBoundaries: boolean;
  filterControl?: ReactNode;
  guidance?: string | null;
  latestOpenByService: Map<string, number>;
  mode: CustomerPendingMode;
  modes: CustomerPendingMode[];
  onReorderRows: (activeId: string, overId: string) => void;
  serviceIds: string[];
  serviceSalesDrafts: SalesCountDrafts;
  setMode: (mode: CustomerPendingMode) => void;
  setServiceSalesDraft: (serviceId: string, value: string) => void;
  supplierFilterControl?: ReactNode;
}) {
  const { language } = usePreferences();

  return (
    <WorkspacePanel
      className={recordUpdateWhiteCardClassName}
      descriptor={translateUiLiteral(language, 'Record open service commitments without marking them fulfilled yet.')}
      style={recordUpdateWhiteCardStyle}
      title={translateUiLiteral(language, 'Open service orders')}
    >
      <div className="grid gap-3">
        {guidance ? <p className="text-sm text-destructive">{guidance}</p> : null}
        <RecordUpdateFilterRow stateFilterControl={filterControl} supplierFilterControl={supplierFilterControl} />
        {serviceIds.length === 0 ? (
          <p className="text-sm text-muted-foreground">{translateUiLiteral(language, 'No services available.')}</p>
        ) : (
          <>
            <SortableIdTable
              bodyTestId="customer-pending-service-list"
              columns={[
                { header: null, className: 'w-12 px-3 text-center', width: '3.5rem' },
                { header: translateUiLiteral(language, 'Service'), width: '30%' },
                { header: translateUiLiteral(language, 'Open now'), width: '18%' },
                ...modes.map((nextMode) => ({
                  header: (
                    <WorkflowStateColumnHeader state={nextMode}>
                      {workflowStateLabel(language, nextMode)}
                    </WorkflowStateColumnHeader>
                  ),
                  width: `${Math.floor(52 / Math.max(1, modes.length))}%`,
                })),
              ]}
              debugCellBoundaries={debugCellBoundaries}
              ids={serviceIds}
              onReorderRows={onReorderRows}
              renderRow={(serviceId) => {
                const service = catalog?.services.find((entry) => entry.serviceId === serviceId);
                const latestValue = latestOpenByService.get(serviceId) ?? 0;
                const resultingOpen = customerPendingResultQuantity({
                  mode,
                  previousOpen: latestValue,
                  value: serviceSalesDrafts[serviceId] ?? '',
                });
                return {
                  dragLabel: translateUiLiteral(language, 'Reorder {name}', { name: service?.name ?? serviceId }),
                  highlight: (serviceSalesDrafts[serviceId]?.trim() ?? '') !== '',
                  inputCellIndexes: workflowInputIndexes(2, modes.length),
                  cells: [
                    <ServiceSummaryCell service={service} serviceName={service?.name ?? serviceId} />,
                    <SalesLatestCountCell countLabel="open" latestAt={null} latestValue={latestValue} />,
                    ...modes.map((nextMode) => (
                      <div key={nextMode} className="grid gap-2 pr-3">
                        <Input
                          aria-label={customerPendingInputLabel(language, nextMode, service?.name ?? serviceId)}
                          className={`w-full max-w-[18rem] ${recordUpdateInputClassName}`}
                          min="0"
                          placeholder={nextMode === 'modify_pending' ? String(latestValue) : ''}
                          step="1"
                          type="number"
                          value={nextMode === mode ? serviceSalesDrafts[serviceId] ?? '' : ''}
                          onChange={(event) => {
                            setMode(nextMode);
                            setServiceSalesDraft(serviceId, event.target.value);
                          }}
                        />
                        {nextMode === mode ? (
                          <p className="text-xs text-muted-foreground">
                            {translateUiLiteral(language, 'Resulting open: {count}', { count: resultingOpen })}
                          </p>
                        ) : null}
                      </div>
                    )),
                  ],
                };
              }}
            />
            <StockReorderHint />
          </>
        )}
      </div>
    </WorkspacePanel>
  );
}

function SalesRetailStep({
  catalog,
  choice,
  debugCellBoundaries,
  descriptor,
  filterControl,
  guidance,
  helper,
  question,
  latestSalesAtBySku,
  latestSalesBySku,
  mode,
  modes,
  onChooseNo,
  onChooseYes,
  onReorderRows,
  retailRankingSeedValues,
  retailSalesDrafts,
  retailSkuIds,
  refundMode = false,
  refundStockReturnDrafts,
  setMode,
  setRetailRankings,
  setRetailSalesDraft,
  setRefundStockReturnDraft,
  retailRankings,
  supplierFilterControl,
  title,
}: {
  catalog: SenaCatalog | null;
  choice: OptionalStockStepChoice;
  debugCellBoundaries: boolean;
  descriptor?: string;
  filterControl?: ReactNode;
  guidance?: string | null;
  helper?: string;
  question?: string;
  latestSalesAtBySku: Map<string, string>;
  latestSalesBySku: Map<string, number | null>;
  mode: CustomerCompletedMode;
  modes: CustomerCompletedMode[];
  onChooseNo: () => void;
  onChooseYes: () => void;
  onReorderRows: (activeId: string, overId: string) => void;
  retailRankingSeedValues: string[];
  retailSalesDrafts: SalesCountDrafts;
  retailSkuIds: string[];
  retailRankings: string[];
  refundMode?: boolean;
  refundStockReturnDrafts?: Record<string, RefundStockReturnChoice>;
  setMode: (mode: CustomerCompletedMode) => void;
  setRetailRankings: (values: string[]) => void;
  setRetailSalesDraft: (skuId: string, value: string) => void;
  setRefundStockReturnDraft?: (skuId: string, value: RefundStockReturnChoice) => void;
  supplierFilterControl?: ReactNode;
  title?: string;
}) {
  const { language } = usePreferences();
  const resolvedDescriptor = descriptor ?? translateUiLiteral(language, 'Capture exact retail SKU sales when you know them. Otherwise, save an ordinal fallback for SENA.');
  const resolvedHelper = helper ?? translateUiLiteral(language, 'Choose Yes when you know exact sellable SKU sales for this interval. Choose No to record only ordinal ranking for SENA.');
  const resolvedQuestion = question ?? translateUiLiteral(language, 'Do you know the exact count of sellable SKUs sold this interval?');
  const resolvedTitle = title ?? translateUiLiteral(language, 'Retail / sellable SKU sales');

  return (
    <WorkspacePanel
      className={recordUpdateWhiteCardClassName}
      descriptor={resolvedDescriptor}
      style={recordUpdateWhiteCardStyle}
      title={resolvedTitle}
    >
      <div className="grid gap-3">
        {guidance ? <p className="text-sm text-destructive">{guidance}</p> : null}
        <RecordUpdateFilterRow stateFilterControl={filterControl} supplierFilterControl={supplierFilterControl} />
        <OptionalStockDecisionCard
          choice={choice}
          helper={resolvedHelper}
          question={resolvedQuestion}
          onNo={onChooseNo}
          onYes={onChooseYes}
        />
        {choice === 'yes' ? (
          retailSkuIds.length === 0 ? (
            <p className="text-sm text-muted-foreground">{translateUiLiteral(language, 'No sellable SKUs available.')}</p>
          ) : (
            <>
              <SortableIdTable
                bodyTestId="sales-retail-list"
                columns={[
                  { header: null, className: 'w-12 px-3 text-center', width: '3.5rem' },
                  { header: translateUiLiteral(language, 'SKU'), width: '30%' },
                  { header: translateUiLiteral(language, 'Sold last interval'), width: '18%' },
                  ...modes.map((nextMode) => ({
                    ariaLabel: nextMode === mode ? translateUiLiteral(language, 'Current interval sales') : undefined,
                    header: (
                      <WorkflowStateColumnHeader state={nextMode}>
                        {workflowStateLabel(language, nextMode)}
                      </WorkflowStateColumnHeader>
                    ),
                    width: `${Math.floor(52 / Math.max(1, modes.length))}%`,
                  })),
                ]}
                debugCellBoundaries={debugCellBoundaries}
                ids={retailSkuIds}
                onReorderRows={onReorderRows}
                renderRow={(skuId) => {
                  const sku = catalog?.skus.find((entry) => entry.skuId === skuId);
                  const latestValue = latestSalesBySku.get(skuId) ?? null;
                  return {
                    dragLabel: translateUiLiteral(language, 'Reorder {name}', { name: sku?.name ?? skuId }),
                    highlight: (retailSalesDrafts[skuId]?.trim() ?? '') !== '',
                    inputCellIndexes: workflowInputIndexes(2, modes.length),
                    cells: [
                      <StockSkuSummaryCell sku={sku} skuName={sku?.name ?? skuId} />,
                      <SalesLatestCountCell countLabel="sold" latestAt={latestSalesAtBySku.get(skuId)} latestValue={latestValue} />,
                      ...modes.map((nextMode) => (
                        <div key={nextMode} className="grid gap-2 pr-3">
                          <RecordUpdateMobileLabel>{workflowStateLabel(language, nextMode)}</RecordUpdateMobileLabel>
                          <Input
                            aria-label={customerCompletedInputLabel(language, nextMode, mode, sku?.name ?? skuId)}
                            className={`w-full max-w-[18rem] ${recordUpdateInputClassName}`}
                            min="0"
                            placeholder={latestValue == null ? '' : String(latestValue)}
                            step="1"
                            type="number"
                            value={nextMode === mode ? retailSalesDrafts[skuId] ?? '' : ''}
                            onChange={(event) => {
                              setMode(nextMode);
                              setRetailSalesDraft(skuId, event.target.value);
                            }}
                          />
                          {nextMode === 'refund_reversal' ? (
                            <Select
                              value={refundStockReturnDrafts?.[skuId] ?? 'later'}
                              onValueChange={(value) => setRefundStockReturnDraft?.(skuId, value as RefundStockReturnChoice)}
                            >
                              <SelectTrigger className={cn(recordUpdateSelectTriggerClassName, 'w-full max-w-[18rem] justify-between')}>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="later">{translateUiLiteral(language, 'Handle later in Stock Count')}</SelectItem>
                                <SelectItem value="now">{translateUiLiteral(language, 'Add returned stock now')}</SelectItem>
                              </SelectContent>
                            </Select>
                          ) : null}
                        </div>
                      )),
                    ],
                  };
                }}
              />
              <StockReorderHint />
            </>
          )
        ) : null}
        {choice === 'no' ? (
          <SalesRankingFallback
            catalog={catalog}
            entryType="sku"
            helper={translateUiLiteral(language, 'Use ranking when exact sellable SKU sales are unknown. This remains linked to SENA ordinal ranking.')}
            label={translateUiLiteral(language, 'Retail SKU ranking')}
            seedValues={retailRankingSeedValues}
            values={retailRankings}
            onChange={setRetailRankings}
          />
        ) : null}
      </div>
    </WorkspacePanel>
  );
}

function SalesServiceStep({
  catalog,
  choice,
  debugCellBoundaries,
  descriptor,
  filterControl,
  guidance,
  helper,
  latestSalesAtByService,
  latestSalesByService,
  mode,
  modes,
  onChooseNo,
  onChooseYes,
  onReorderRows,
  question,
  serviceIds,
  serviceRankingSeedValues,
  serviceSalesDrafts,
  serviceRankings,
  setMode,
  setServiceRankings,
  setServiceSalesDraft,
  supplierFilterControl,
  title,
}: {
  catalog: SenaCatalog | null;
  choice: OptionalStockStepChoice;
  debugCellBoundaries: boolean;
  descriptor?: string;
  filterControl?: ReactNode;
  guidance?: string | null;
  helper?: string;
  latestSalesAtByService: Map<string, string>;
  latestSalesByService: Map<string, number | null>;
  mode: CustomerCompletedMode;
  modes: CustomerCompletedMode[];
  onChooseNo: () => void;
  onChooseYes: () => void;
  onReorderRows: (activeId: string, overId: string) => void;
  question?: string;
  serviceIds: string[];
  serviceRankingSeedValues: string[];
  serviceSalesDrafts: SalesCountDrafts;
  serviceRankings: string[];
  setMode: (mode: CustomerCompletedMode) => void;
  setServiceRankings: (values: string[]) => void;
  setServiceSalesDraft: (serviceId: string, value: string) => void;
  supplierFilterControl?: ReactNode;
  title?: string;
}) {
  const { language } = usePreferences();
  const resolvedDescriptor = descriptor ?? translateUiLiteral(language, 'Capture exact service sales when you know them. Otherwise, save an ordinal fallback for SENA.');
  const resolvedHelper = helper ?? translateUiLiteral(language, 'Choose Yes when you know exact service sales for this interval. Choose No to record only ordinal ranking for SENA.');
  const resolvedQuestion = question ?? translateUiLiteral(language, 'Do you know the exact count of sellable services sold this interval?');
  const resolvedTitle = title ?? translateUiLiteral(language, 'Sellable services');

  return (
    <WorkspacePanel
      className={recordUpdateWhiteCardClassName}
      descriptor={resolvedDescriptor}
      style={recordUpdateWhiteCardStyle}
      title={resolvedTitle}
    >
      <div className="grid gap-3">
        {guidance ? <p className="text-sm text-destructive">{guidance}</p> : null}
        <RecordUpdateFilterRow stateFilterControl={filterControl} supplierFilterControl={supplierFilterControl} />
        <OptionalStockDecisionCard
          choice={choice}
          helper={resolvedHelper}
          question={resolvedQuestion}
          onNo={onChooseNo}
          onYes={onChooseYes}
        />
        {choice === 'yes' ? (
          serviceIds.length === 0 ? (
            <p className="text-sm text-muted-foreground">{translateUiLiteral(language, 'No services available.')}</p>
          ) : (
            <>
              <SortableIdTable
                bodyTestId="sales-service-list"
                columns={[
                  { header: null, className: 'w-12 px-3 text-center', width: '3.5rem' },
                  { header: translateUiLiteral(language, 'Service'), width: '30%' },
                  { header: translateUiLiteral(language, 'Sold last interval'), width: '18%' },
                  ...modes.map((nextMode) => ({
                    ariaLabel: nextMode === mode ? translateUiLiteral(language, 'Current interval sales') : undefined,
                    header: (
                      <WorkflowStateColumnHeader state={nextMode}>
                        {workflowStateLabel(language, nextMode)}
                      </WorkflowStateColumnHeader>
                    ),
                    width: `${Math.floor(52 / Math.max(1, modes.length))}%`,
                  })),
                ]}
                debugCellBoundaries={debugCellBoundaries}
                ids={serviceIds}
                onReorderRows={onReorderRows}
                renderRow={(serviceId) => {
                  const service = catalog?.services.find((entry) => entry.serviceId === serviceId);
                  const latestValue = latestSalesByService.get(serviceId) ?? null;
                  return {
                    dragLabel: translateUiLiteral(language, 'Reorder {name}', { name: service?.name ?? serviceId }),
                    highlight: (serviceSalesDrafts[serviceId]?.trim() ?? '') !== '',
                    inputCellIndexes: workflowInputIndexes(2, modes.length),
                    cells: [
                      <ServiceSummaryCell service={service} serviceName={service?.name ?? serviceId} />,
                      <SalesLatestCountCell countLabel="sold" latestAt={latestSalesAtByService.get(serviceId)} latestValue={latestValue} />,
                      ...modes.map((nextMode) => (
                        <div key={nextMode} className="pr-3">
                          <RecordUpdateMobileLabel>{workflowStateLabel(language, nextMode)}</RecordUpdateMobileLabel>
                          <Input
                            aria-label={customerCompletedInputLabel(language, nextMode, mode, service?.name ?? serviceId)}
                            className={`w-full max-w-[18rem] ${recordUpdateInputClassName}`}
                            min="0"
                            placeholder={latestValue == null ? '' : String(latestValue)}
                            step="1"
                            type="number"
                            value={nextMode === mode ? serviceSalesDrafts[serviceId] ?? '' : ''}
                            onChange={(event) => {
                              setMode(nextMode);
                              setServiceSalesDraft(serviceId, event.target.value);
                            }}
                          />
                        </div>
                      )),
                    ],
                  };
                }}
              />
              <StockReorderHint />
            </>
          )
        ) : null}
        {choice === 'no' ? (
          <SalesRankingFallback
            catalog={catalog}
            entryType="service"
            helper={translateUiLiteral(language, 'Use ranking when exact service sales are unknown. This remains linked to SENA ordinal ranking.')}
            label={translateUiLiteral(language, 'Service ranking')}
            seedValues={serviceRankingSeedValues}
            values={serviceRankings}
            onChange={setServiceRankings}
          />
        ) : null}
      </div>
    </WorkspacePanel>
  );
}

function RecordOrderStep({
  catalog,
  debugCellBoundaries,
  filterControl,
  guidance,
  latestOrderAtBySku,
  latestOrderQuantity,
  leadTimeMeanDefaults,
  leadTimeVariabilityDefaults,
  mode,
  modes,
  observedAtIso,
  onReorderRows,
  orderRecommendationBySku,
  recordOrderExpectedArrivalDate,
  recordOrderLeadTimeMeanDays,
  recordOrderLeadTimeVariability,
  rows,
  setRecordOrderExpectedArrivalDate,
  setRecordOrderLeadTimeMeanDays,
  setRecordOrderLeadTimeVariability,
  setMode,
  skuSignalDrafts,
  updateSkuSignalDraft,
  supplierFilterControl,
}: {
  catalog: SenaCatalog | null;
  debugCellBoundaries: boolean;
  filterControl?: ReactNode;
  guidance?: string | null;
  latestOrderAtBySku: Map<string, string>;
  latestOrderQuantity: Map<string, number | null>;
  leadTimeMeanDefaults: Map<string, number | null>;
  leadTimeVariabilityDefaults: Map<string, SenaLeadTimeVariabilityClass | null>;
  mode: SupplierPendingMode;
  modes: SupplierPendingMode[];
  observedAtIso: string | null;
  onReorderRows: (activeSkuId: string, overSkuId: string) => void;
  orderRecommendationBySku: Map<string, number>;
  recordOrderExpectedArrivalDate: string;
  recordOrderLeadTimeMeanDays: string;
  recordOrderLeadTimeVariability: SenaLeadTimeVariabilityClass | '';
  rows: StockRow[];
  setRecordOrderExpectedArrivalDate: (value: string) => void;
  setRecordOrderLeadTimeMeanDays: (value: string) => void;
  setRecordOrderLeadTimeVariability: (value: SenaLeadTimeVariabilityClass | '') => void;
  setMode: (mode: SupplierPendingMode) => void;
  skuSignalDrafts: Record<string, SkuSignalDraft>;
  updateSkuSignalDraft: (skuId: string, updater: (draft: SkuSignalDraft) => SkuSignalDraft) => void;
  supplierFilterControl?: ReactNode;
}) {
  const { language } = usePreferences();
  const leadTimeMeanPlaceholder = rows.map((row) => leadTimeMeanDefaults.get(row.skuId)).find((value) => value != null) ?? null;
  const leadTimeVariabilityPlaceholder = rows.map((row) => leadTimeVariabilityDefaults.get(row.skuId)).find((value) => value != null) ?? '';
  const effectiveLeadTimeMean =
    recordOrderLeadTimeMeanDays.trim() !== ''
      ? Number(recordOrderLeadTimeMeanDays)
      : leadTimeMeanPlaceholder;
  const effectiveLeadTimeVariability = recordOrderLeadTimeVariability || leadTimeVariabilityPlaceholder || null;
  const expectedArrivalEstimate = addDaysToDateInput(
    observedAtIso,
    expectedArrivalDaysFromLeadTime(effectiveLeadTimeMean, effectiveLeadTimeVariability),
  );
  useEffect(() => {
    if (!recordOrderLeadTimeVariability && leadTimeVariabilityPlaceholder) {
      setRecordOrderLeadTimeVariability(leadTimeVariabilityPlaceholder);
    }
  }, [leadTimeVariabilityPlaceholder, recordOrderLeadTimeVariability, setRecordOrderLeadTimeVariability]);
  useEffect(() => {
    if (expectedArrivalEstimate) {
      setRecordOrderExpectedArrivalDate(expectedArrivalEstimate);
    }
  }, [expectedArrivalEstimate, setRecordOrderExpectedArrivalDate]);

  return (
    <WorkspacePanel
      className={recordUpdateWhiteCardClassName}
      descriptor={translateUiLiteral(language, 'Log new orders, confirm expected arrival timing, and optionally adjust lead time assumptions before saving.')}
      style={recordUpdateWhiteCardStyle}
      title={translateUiLiteral(language, 'Reorder table')}
    >
      <div className="grid gap-3">
        {guidance ? <p className="text-sm text-destructive">{guidance}</p> : null}
        {(catalog?.skus ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">{translateUiLiteral(language, 'No SKUs are in the catalog yet. Add a SKU first if you need to record a reorder.')}</p>
        ) : (
          <>
            <RecordOrderTimingFields
              expectedArrivalPlaceholder={expectedArrivalEstimate}
              expectedArrivalValue={recordOrderExpectedArrivalDate}
              leadTimeMeanPlaceholder={leadTimeMeanPlaceholder == null ? '' : String(Math.round(leadTimeMeanPlaceholder * 10) / 10)}
              leadTimeMeanValue={recordOrderLeadTimeMeanDays}
              onExpectedArrivalChange={setRecordOrderExpectedArrivalDate}
              onLeadTimeMeanChange={setRecordOrderLeadTimeMeanDays}
              onVariabilityChange={setRecordOrderLeadTimeVariability}
              variabilityPlaceholder={leadTimeVariabilityPlaceholder}
              variabilityValue={recordOrderLeadTimeVariability}
            />
            <RecordUpdateFilterRow stateFilterControl={filterControl} supplierFilterControl={supplierFilterControl} />
            <SortableStockTable
              bodyTestId="record-order-list"
              debugCellBoundaries={debugCellBoundaries}
              columns={[
                { header: null, className: 'w-12 px-3 text-center', width: '3.5rem' },
                { header: translateUiLiteral(language, 'SKU'), width: '30%' },
                { header: translateUiLiteral(language, 'Last order'), width: '18%' },
                ...modes.map((nextMode) => ({
                  ariaLabel: nextMode === mode ? translateUiLiteral(language, 'Current order') : undefined,
                  header: (
                    <WorkflowStateColumnHeader state={nextMode}>
                      {workflowStateLabel(language, nextMode)}
                    </WorkflowStateColumnHeader>
                  ),
                  width: `${Math.floor(52 / Math.max(1, modes.length))}%`,
                })),
              ]}
              onReorderRows={onReorderRows}
              rows={rows}
              renderRow={(row) => {
                const sku = catalog?.skus.find((entry) => entry.skuId === row.skuId);
                const draft = skuSignalDrafts[row.skuId] ?? createEmptySkuSignalDraft();
                const recommendedUnits = orderRecommendationBySku.get(row.skuId);

                return {
                  dragLabel: translateUiLiteral(language, 'Reorder {name}', { name: sku?.name ?? row.skuId }),
                  highlight: orderDraftHasContent(draft),
                  inputCellIndexes: workflowInputIndexes(2, modes.length),
                  cells: [
                    <StockSkuSummaryCell sku={sku} skuName={sku?.name ?? row.skuId} />,
                    <LastOrderCell latestAt={latestOrderAtBySku.get(row.skuId)} latestValue={latestOrderQuantity.get(row.skuId) ?? null} />,
                    ...modes.map((nextMode) => (
                      <OrderQuantityField
                        ariaLabel={nextMode === mode
                          ? translateUiLiteral(language, 'Current order for {name}', { name: sku?.name ?? row.skuId })
                          : undefined}
                        key={nextMode}
                        orderQuantityPlaceholder={recommendedUnits && recommendedUnits > 0
                          ? translateUiLiteral(language, 'banji recommends {count} units.', { count: Math.round(recommendedUnits) })
                          : ''}
                        orderQuantityValue={nextMode === mode ? draft.orderedQuantity : ''}
                        rowName={`${workflowStateLabel(language, nextMode)} ${sku?.name ?? row.skuId}`}
                        setOrderQuantity={(value) => {
                          setMode(nextMode);
                          updateSkuSignalDraft(row.skuId, (current) => ({
                            ...current,
                            orderEnabled: value.trim() !== '',
                            orderedQuantity: value,
                          }));
                        }}
                      />
                    )),
                  ],
                };
              }}
            />
            <StockReorderHint />
          </>
        )}
      </div>
    </WorkspacePanel>
  );
}

function RecordReceiptStep({
  catalog,
  debugCellBoundaries,
  filterControl,
  guidance,
  latestReceiptAtBySku,
  latestReceiptQuantity,
  mode,
  modes,
  observedAtIso,
  onReorderRows,
  recordReceiptReceivedDate,
  rows,
  setRecordReceiptReceivedDate,
  setMode,
  skuSignalDrafts,
  updateSkuSignalDraft,
  supplierFilterControl,
}: {
  catalog: SenaCatalog | null;
  debugCellBoundaries: boolean;
  filterControl?: ReactNode;
  guidance?: string | null;
  latestReceiptAtBySku: Map<string, string>;
  latestReceiptQuantity: Map<string, number | null>;
  mode: SupplierReceiptMode;
  modes: SupplierReceiptMode[];
  observedAtIso: string | null;
  onReorderRows: (activeSkuId: string, overSkuId: string) => void;
  recordReceiptReceivedDate: string;
  rows: StockRow[];
  setRecordReceiptReceivedDate: (value: string) => void;
  setMode: (mode: SupplierReceiptMode) => void;
  skuSignalDrafts: Record<string, SkuSignalDraft>;
  updateSkuSignalDraft: (skuId: string, updater: (draft: SkuSignalDraft) => SkuSignalDraft) => void;
  supplierFilterControl?: ReactNode;
}) {
  const { language } = usePreferences();
  const observedDate = dateInputValue(observedAtIso);
  useEffect(() => {
    if (!recordReceiptReceivedDate && observedDate) {
      setRecordReceiptReceivedDate(observedDate);
    }
  }, [observedDate, recordReceiptReceivedDate, setRecordReceiptReceivedDate]);

  return (
    <WorkspacePanel
      className={recordUpdateWhiteCardClassName}
      descriptor={translateUiLiteral(language, 'Record the stock that physically arrived and confirm the received date before saving.')}
      style={recordUpdateWhiteCardStyle}
      title={translateUiLiteral(language, 'Record receipt')}
    >
      <div className="grid gap-3">
        {guidance ? <p className="text-sm text-destructive">{guidance}</p> : null}
        {(catalog?.skus ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">{translateUiLiteral(language, 'No SKUs are in the catalog yet. Add a SKU first if you need to record a receipt.')}</p>
        ) : (
          <>
            <RecordReceiptDateField
              receivedDatePlaceholder={observedDate}
              receivedDateValue={recordReceiptReceivedDate}
              setReceivedDate={setRecordReceiptReceivedDate}
            />
            <RecordUpdateFilterRow stateFilterControl={filterControl} supplierFilterControl={supplierFilterControl} />
            <SortableStockTable
              bodyTestId="record-receipt-list"
              debugCellBoundaries={debugCellBoundaries}
              columns={[
                { header: null, className: 'w-12 px-3 text-center', width: '3.5rem' },
                { header: translateUiLiteral(language, 'SKU'), width: '30%' },
                { header: translateUiLiteral(language, 'Last receipt'), width: '18%' },
                ...modes.map((nextMode) => ({
                  ariaLabel: nextMode === mode ? translateUiLiteral(language, 'Current receipt') : undefined,
                  header: (
                    <WorkflowStateColumnHeader state={nextMode}>
                      {workflowStateLabel(language, nextMode)}
                    </WorkflowStateColumnHeader>
                  ),
                  width: `${Math.floor(52 / Math.max(1, modes.length))}%`,
                })),
              ]}
              onReorderRows={onReorderRows}
              rows={rows}
              renderRow={(row) => {
                const sku = catalog?.skus.find((entry) => entry.skuId === row.skuId);
                const draft = skuSignalDrafts[row.skuId] ?? createEmptySkuSignalDraft();

                return {
                  dragLabel: translateUiLiteral(language, 'Reorder {name}', { name: sku?.name ?? row.skuId }),
                  highlight: receiptDraftHasContent(draft),
                  inputCellIndexes: workflowInputIndexes(2, modes.length),
                  cells: [
                    <StockSkuSummaryCell sku={sku} skuName={sku?.name ?? row.skuId} />,
                    <LastReceiptCell latestAt={latestReceiptAtBySku.get(row.skuId)} latestValue={latestReceiptQuantity.get(row.skuId) ?? null} />,
                    ...modes.map((nextMode) => (
                      <ReceiptQuantityField
                        ariaLabel={nextMode === mode
                          ? translateUiLiteral(language, 'Current receipt for {name}', { name: sku?.name ?? row.skuId })
                          : undefined}
                        key={nextMode}
                        receiptQuantityValue={nextMode === mode ? draft.receiptQuantity : ''}
                        rowName={`${workflowStateLabel(language, nextMode)} ${sku?.name ?? row.skuId}`}
                        setReceiptQuantity={(value) => {
                          setMode(nextMode);
                          updateSkuSignalDraft(row.skuId, (current) => ({
                            ...current,
                            receiptEnabled: value.trim() !== '',
                            receiptQuantity: value,
                          }));
                        }}
                      />
                    )),
                  ],
                };
              }}
            />
            <StockReorderHint />
          </>
        )}
      </div>
    </WorkspacePanel>
  );
}

interface TicketPickerOption {
  id: string;
  label: string;
  description: string;
  metadata: string;
}

const customerChannelIconByValue: Record<string, IconComponent> = {
  none: EntityNoChannelIcon,
  'Walk-in': EntityWalkInChannelIcon,
  Call: EntityCallChannelIcon,
  Telegram: EntityTelegramChannelIcon,
  WhatsApp: EntityWhatsAppChannelIcon,
  Facebook: EntityFacebookChannelIcon,
  SMS: EntitySmsChannelIcon,
  Other: EntityOverflowMenuIcon,
  custom: EntityCustomChannelIcon,
};

function CustomerMetadataFields({
  compact = false,
  directory,
  identity,
  warning,
  onChange,
}: {
  compact?: boolean;
  directory: ReturnType<typeof buildCustomerLinkDirectory>;
  identity: CustomerIdentityDraft;
  warning: string | null;
  onChange: (next: CustomerIdentityDraft) => void;
}) {
  const { language } = usePreferences();
  const channelValue = identity.channel || 'none';
  const SelectedChannelIcon = customerChannelIconByValue[channelValue] ?? EntityOverflowMenuIcon;
  return (
    <div className={cn('grid gap-4', compact ? '' : 'rounded-2xl border border-border/70 bg-muted/20 p-4')}>
      {!compact ? (
        <div>
          <p className="text-sm font-semibold text-foreground">{translateUiLiteral(language, 'Customer metadata')}</p>
          <p className="text-sm leading-6 text-muted-foreground">
            {translateUiLiteral(language, 'Channel, customer name, and phone live in notes, but are stored as structured ticket fields.')}
          </p>
        </div>
      ) : null}
      <div className={cn('grid gap-3', compact ? '' : 'md:grid-cols-3')}>
        <div className="grid gap-2">
          <label className="text-sm font-medium text-foreground" htmlFor="ticket-channel">
            {translateUiLiteral(language, 'Communication channel')}
          </label>
          <Select
            value={channelValue}
            onValueChange={(value) =>
              onChange({
                ...identity,
                channel: value === 'none' ? '' : value,
              })
            }
          >
            <SelectTrigger id="ticket-channel" className={recordUpdateSelectTriggerClassName}>
              <SelectValue>
                <span className="flex items-center gap-2">
                  <SelectedChannelIcon className="size-4 text-muted-foreground" />
                  <span>
                    {channelValue === 'none'
                      ? translateUiLiteral(language, 'No channel')
                      : channelValue === 'custom'
                        ? translateUiLiteral(language, 'Custom')
                        : translateUiLiteral(language, channelValue)}
                  </span>
                </span>
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">
                <EntityNoChannelIcon className="size-4" />
                <span>{translateUiLiteral(language, 'No channel')}</span>
              </SelectItem>
              {TICKET_CHANNEL_PRESETS.map((channel) => (
                <SelectItem key={channel} value={channel}>
                  {(() => {
                    const ChannelIcon = customerChannelIconByValue[channel] ?? EntityOverflowMenuIcon;
                    return (
                      <>
                        <ChannelIcon className="size-4" />
                        <span>{translateUiLiteral(language, channel)}</span>
                      </>
                    );
                  })()}
                </SelectItem>
              ))}
              <SelectItem value="custom">
                <EntityCustomChannelIcon className="size-4" />
                <span>{translateUiLiteral(language, 'Custom')}</span>
              </SelectItem>
            </SelectContent>
          </Select>
          {identity.channel === 'custom' ? (
            <Input
              aria-label={translateUiLiteral(language, 'Custom communication channel')}
              className={recordUpdateInputClassName}
              value={identity.customChannel}
              onChange={(event) => onChange({ ...identity, customChannel: event.target.value })}
            />
          ) : null}
        </div>
        <div className="grid gap-2">
          <label className="text-sm font-medium text-foreground" htmlFor="ticket-customer-name">
            {translateUiLiteral(language, 'Customer name')}
          </label>
          <Input
            aria-label={translateUiLiteral(language, 'Customer name')}
            className={recordUpdateInputClassName}
            id="ticket-customer-name"
            list="ticket-customer-name-hints"
            value={identity.customerName}
            onChange={(event) => onChange({ ...identity, customerName: event.target.value })}
          />
          <datalist id="ticket-customer-name-hints">
            {directory.names.map((name) => (
              <option key={name} value={name} />
            ))}
          </datalist>
        </div>
        <div className="grid gap-2">
          <label className="text-sm font-medium text-foreground" htmlFor="ticket-phone">
            {translateUiLiteral(language, 'Phone number')}
          </label>
          <Input
            aria-label={translateUiLiteral(language, 'Phone number')}
            className={recordUpdateInputClassName}
            id="ticket-phone"
            value={identity.phone}
            onChange={(event) => onChange({ ...identity, phone: event.target.value })}
            onBlur={() => onChange({ ...identity, phone: normalizePhoneNumber(identity.phone) })}
          />
        </div>
      </div>
      {warning ? <p className="text-sm text-amber-700">{translateUiLiteral(language, warning)}</p> : null}
    </div>
  );
}

function TicketEntryPrompt({
  family,
  mode,
  options,
  onBeginEdit,
  onBeginNew,
  onDismiss,
  selectedTicketId,
  onModeChange,
  onSelectTicket,
}: {
  family: 'customer' | 'supplier';
  mode: TicketAuthoringMode | null;
  options: TicketPickerOption[];
  onBeginEdit?: () => void;
  onBeginNew?: () => void;
  onDismiss?: () => void;
  selectedTicketId: string | null;
  onModeChange: (mode: TicketAuthoringMode) => void;
  onSelectTicket: (ticketId: string) => void;
}) {
  const { language } = usePreferences();
  if (mode === 'new' || (mode === 'edit' && selectedTicketId)) {
    return null;
  }
  const title = mode === 'edit'
    ? translateUiLiteral(language, family === 'customer' ? 'Edit / update existing customer order' : 'Edit / update existing supplier order')
    : translateUiLiteral(language, 'What do you want to do?');
  const newLabel = 'New';
  const editLabel = 'Edit/Update';
  const canEdit = options.length > 0;
  return createPortal(
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center bg-black/30 px-4 py-6"
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          onDismiss?.();
        }
      }}
    >
      <section
        aria-label={title}
        className="w-full max-w-lg rounded-[1.75rem] border border-border/70 bg-background p-6 shadow-[0_24px_80px_rgba(0,0,0,0.18)]"
        role="dialog"
      >
        <div className="space-y-2">
          <p className="text-lg font-semibold tracking-[-0.03em] text-foreground">{title}</p>
          <p className="text-sm leading-6 text-muted-foreground">
            {translateUiLiteral(
              language,
              mode === 'edit'
                ? 'Select the existing ticket you want to update.'
                : 'banj will create or update a durable ticket and append ticket events instead of writing a disconnected batch.',
            )}
          </p>
        </div>
        {mode == null ? (
          <div className="mt-6 flex flex-wrap justify-end gap-3">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                onBeginNew?.();
                onModeChange('new');
              }}
            >
              <ActionAddBadgeIcon className="size-4" />
              {translateUiLiteral(language, newLabel)}
            </Button>
            <Button
              disabled={!canEdit}
              type="button"
              variant="outline"
              onClick={() => {
                onBeginEdit?.();
                onModeChange('edit');
              }}
            >
              <ActionEditIcon className="size-4" />
              {translateUiLiteral(language, editLabel)}
            </Button>
          </div>
        ) : null}
        {mode === 'edit' ? (
          <div className="mt-5 grid gap-3">
            <div className="max-h-72 overflow-auto rounded-2xl border border-border/70">
              {options.length > 0 ? options.map((option) => (
                <button
                  key={option.id}
                  className="grid w-full gap-1 border-b border-border/60 px-4 py-3 text-left last:border-b-0 hover:bg-muted/50"
                  type="button"
                  onClick={() => onSelectTicket(option.id)}
                >
                  <span className="flex items-center gap-2 font-medium text-foreground">
                    <EntityFlagIcon data-icon="inline-start" className="size-4 shrink-0" />
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
        ) : null}
      </section>
    </div>,
    document.body,
  );
}

function ServiceSignalsStep({
  catalog,
  currency,
  debugCellBoundaries,
  guidance,
  language,
  serviceSignalDrafts,
  usdToKhrExchangeRate,
  updateServiceSignalDraft,
  onToggleDebugCellBoundaries,
}: {
  catalog: SenaCatalog | null;
  currency: 'USD' | 'KHR';
  debugCellBoundaries: boolean;
  guidance?: string | null;
  language: 'en' | 'km';
  serviceSignalDrafts: Record<string, ServiceSignalDraft>;
  usdToKhrExchangeRate: number;
  updateServiceSignalDraft: (serviceId: string, updater: (draft: ServiceSignalDraft) => ServiceSignalDraft) => void;
  onToggleDebugCellBoundaries: () => void;
}) {
  const { t } = usePreferences();
  const showFlagColumn = anyServiceFlags(serviceSignalDrafts);
  const debugTrackClassName = debugCellBoundaries ? tableDebugTrackClassName : '';
  const debugFlushClassName = debugCellBoundaries ? tableDebugFlushClassName : '';

  return (
    <WorkspacePanel
      action={
        <Button
          aria-pressed={debugCellBoundaries}
          className="hidden"
          hidden
          type="button"
          variant={debugCellBoundaries ? 'secondary' : 'outline'}
          onClick={onToggleDebugCellBoundaries}
        >
          <ActionEditIcon data-icon="inline-start" />
          Cell boundaries
        </Button>
      }
      className={recordUpdateWhiteCardClassName}
      descriptor={t(STOCK_UPDATE_STEP_COPY.service.descriptionKey)}
      style={recordUpdateWhiteCardStyle}
      title={
        <SectionLabel
          tooltip={t('stockUpdateServiceStepTooltip')}
          tooltipLabel={t('stockUpdateServiceStepTooltipLabel')}
        >
          {t(STOCK_UPDATE_STEP_COPY.service.titleKey)}
        </SectionLabel>
      }
    >
      <div className="grid gap-3">
        {guidance ? <p className="text-sm text-destructive">{guidance}</p> : null}
        {(catalog?.services ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('stockUpdateNoServicesHelper')}</p>
        ) : (
          <RecordUpdateTable
            columns={[
              { header: t('stockUpdateServiceHeader'), width: showFlagColumn ? '30%' : '42%' },
              { header: t('stockUpdateLatestPrice'), className: 'text-center', width: '18%' },
              ...(showFlagColumn ? [{ header: t('stockUpdateFlags'), width: '34%' } satisfies RecordUpdateTableColumn] : []),
              {
                header: (
                  <SectionLabel
                    tooltip={t('stockUpdateServiceFlagsTooltip')}
                    tooltipLabel={t('stockUpdateServiceFlagsTooltipLabel')}
                  >
                    {t('stockUpdateAddFlags')}
                  </SectionLabel>
                ),
                className: 'text-right',
                width: showFlagColumn ? '18%' : '40%',
              },
            ]}
          >
            {(catalog?.services ?? []).map((service) => {
              const draft = serviceSignalDrafts[service.serviceId];
              const flagIds = activeServiceFlagIds(draft);
              const linkedSkuCount = (catalog?.sharingMask ?? []).filter(
                (entry) => entry.enabled && entry.serviceId === service.serviceId,
              ).length;

              return (
                <TableRow
                  key={service.serviceId}
                  className={cn(
                    recordUpdateTableRowClassName,
                    debugTrackClassName,
                    debugFlushClassName,
                    flagIds.length > 0 && 'bg-primary/[0.04]',
                  )}
                >
                  <TableCell className={recordUpdateTableCellClassName}>
                    <ServiceIdentityCell
                      align="center"
                      service={service}
                      serviceName={service.name}
                      secondary={
                        <>
                          <span className="block text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground/75">
                            {service.serviceId}
                          </span>
                          <span className="block text-sm text-muted-foreground">
                            {t('stockUpdateLinkedSkuCount', { count: linkedSkuCount, suffix: linkedSkuCount === 1 ? '' : 's' })}
                          </span>
                        </>
                      }
                    />
                  </TableCell>

                  <TableCell className={cn(recordUpdateTableCellClassName, 'text-center')}>
                    <div className="min-w-0">
                      <RecordUpdateMobileLabel>{t('stockUpdateLatestPrice')}</RecordUpdateMobileLabel>
                      <p className="text-sm font-medium text-foreground">
                        {formatCurrency(service.price, currency, language, usdToKhrExchangeRate)}
                      </p>
                    </div>
                  </TableCell>

                  {showFlagColumn ? (
                    <TableCell className={recordUpdateTableCellClassName}>
                      <div className="min-w-0">
                        <RecordUpdateMobileLabel>{t('stockUpdateFlags')}</RecordUpdateMobileLabel>
                        {flagIds.length > 0 ? (
                          <div className="grid">
                            {draft.priceEnabled ? (
                              <FlagSection
                                label={t('stockUpdatePriceIfChanged')}
                                removeLabel={t('stockUpdateRemovePriceFlagFor', { name: service.name })}
                                onRemove={() =>
                                  updateServiceSignalDraft(service.serviceId, (current) => ({
                                    ...current,
                                    priceEnabled: false,
                                    price: '',
                                  }))
                                }
                              >
                                <Input
                                  aria-label={t('stockUpdatePriceChangedAria', { name: service.name })}
                                  className={flagControlClassName}
                                  min="0"
                                  placeholder={t('stockUpdateNewPrice')}
                                  step={moneyInputStep(currency)}
                                  type="number"
                                  value={draft.price}
                                  onChange={(event) =>
                                    updateServiceSignalDraft(service.serviceId, (current) => ({
                                      ...current,
                                      priceEnabled: true,
                                      price: event.target.value,
                                    }))
                                  }
                                />
                              </FlagSection>
                            ) : null}
                            {draft.blockedEnabled ? (
                              <FlagSection
                                label={t('stockUpdateEventFlag')}
                                removeLabel={t('stockUpdateRemoveEventFlagFor', { name: service.name })}
                                onRemove={() =>
                                  updateServiceSignalDraft(service.serviceId, (current) => ({
                                    ...current,
                                    blockedEnabled: false,
                                    blockedState: 'blocked',
                                  }))
                                }
                              >
                                <Select
                                  value={draft.blockedState}
                                  onValueChange={(value) =>
                                    updateServiceSignalDraft(service.serviceId, (current) => ({
                                      ...current,
                                      blockedEnabled: true,
                                      blockedState: value as StockoutFlagValue,
                                    }))
                                  }
                                >
                                  <SelectTrigger
                                    aria-label={t('stockUpdateBlockedStateAria', { name: service.name })}
                                    className={cn(flagControlClassName, recordUpdateSelectTriggerClassName, 'justify-between')}
                                  >
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="blocked">{t('stockUpdateBlocked')}</SelectItem>
                                    <SelectItem value="stockout">{t('stockUpdateStockout')}</SelectItem>
                                  </SelectContent>
                                </Select>
                              </FlagSection>
                            ) : null}
                          </div>
                        ) : (
                          <p className="text-sm text-muted-foreground">{t('stockUpdateNoRowFlags')}</p>
                        )}
                      </div>
                    </TableCell>
                  ) : null}

                  <TableCell className={cn(recordUpdateTableCellClassName, 'text-right')}>
                    <div className="min-w-0">
                      <RecordUpdateMobileLabel>{t('stockUpdateAddFlags')}</RecordUpdateMobileLabel>
                      <FlagActionMenu
                        actions={[
                          {
                            key: 'price',
                            label: draft?.priceEnabled ? t('stockUpdateRemovePriceChange') : t('stockUpdateAddPriceChange'),
                            icon: <ActionCreatePackageIcon className="size-4" />,
                            onSelect: () =>
                              updateServiceSignalDraft(service.serviceId, (current) => ({
                                ...current,
                                priceEnabled: !current.priceEnabled,
                                price: current.priceEnabled ? '' : current.price,
                              })),
                          },
                          {
                            key: 'blocked',
                            label: draft?.blockedEnabled ? t('stockUpdateRemoveEvent') : t('stockUpdateAddEvent'),
                            icon: <StatusUnavailableIcon className="size-4" />,
                            onSelect: () =>
                              updateServiceSignalDraft(service.serviceId, (current) => ({
                                ...current,
                                blockedEnabled: !current.blockedEnabled,
                                blockedState: current.blockedEnabled ? 'blocked' : current.blockedState,
                              })),
                          },
                        ]}
                        label={t('stockUpdateAddFlagsFor', { name: service.name })}
                      />
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </RecordUpdateTable>
        )}
      </div>
    </WorkspacePanel>
  );
}

function RegimeFields({
  regimeHint,
  setRegimeHint,
}: {
  regimeHint: SenaObservationRegimeHint | '';
  setRegimeHint: (value: SenaObservationRegimeHint | '') => void;
}) {
  const { t } = usePreferences();
  const regimeOptions: Array<{ value: SenaObservationRegimeHint; label: string; detail: string }> = [
    { value: 'normal', label: t('stockUpdateRegimeNormal'), detail: t('stockUpdateRegimeNormalDetail') },
    { value: 'spike', label: t('stockUpdateRegimeSpike'), detail: t('stockUpdateRegimeSpikeDetail') },
    { value: 'lull', label: t('stockUpdateRegimeLull'), detail: t('stockUpdateRegimeLullDetail') },
    { value: 'stockout_constrained', label: t('stockUpdateRegimeStockout'), detail: t('stockUpdateRegimeStockoutDetail') },
    { value: 'promo', label: t('stockUpdateRegimePromo'), detail: t('stockUpdateRegimePromoDetail') },
    { value: 'correction', label: t('stockUpdateRegimeCorrection'), detail: t('stockUpdateRegimeCorrectionDetail') },
  ];
  const selectedRegime = regimeOptions.find((option) => option.value === regimeHint) ?? null;
  const NoSignalIcon = getRegimeIcon('none');
  const SelectedIcon = getRegimeIcon(selectedRegime?.value ?? 'none');
  const regimeDescription = selectedRegime?.detail ?? t('stockUpdateRegimeDescriptionEmpty');

  return (
    <div className="grid gap-2">
      <div className="grid gap-1 text-sm font-medium text-foreground">
        <Select value={regimeHint || 'none'} onValueChange={(value) => setRegimeHint(value === 'none' ? '' : (value as SenaObservationRegimeHint))}>
          <SelectTrigger
            aria-label={`${t('stockUpdateOverallRegime')} ${t('stockUpdateOptional')}`}
            className={cn('w-full', recordUpdateSelectTriggerClassName)}
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">
              <span className="flex items-center gap-2">
                <NoSignalIcon className="size-4 text-muted-foreground" />
                <span>{t('stockUpdateNoRegimeSignal')}</span>
              </span>
            </SelectItem>
            {regimeOptions.map((option) => {
              const Icon = getRegimeIcon(option.value);
              return (
                <SelectItem key={option.value} value={option.value}>
                  <span className="flex items-center gap-2">
                    <Icon className="size-4 text-muted-foreground" />
                    <span>{option.label}</span>
                  </span>
                </SelectItem>
              );
            })}
          </SelectContent>
        </Select>
      </div>
      <div className="grid gap-1 text-sm leading-6 text-muted-foreground">
        <p className="flex items-start gap-2">
          <SelectedIcon className="mt-1 size-4 shrink-0 text-primary" />
          <span>{regimeDescription}</span>
        </p>
      </div>
    </div>
  );
}

function ReviewStep({
  blockers,
  catalog,
  error,
  previewParts,
  serviceSignalDrafts,
  skuSignalDrafts,
  payload,
}: {
  blockers: string[];
  catalog: SenaCatalog | null;
  error: string | null;
  previewParts: string[];
  serviceSignalDrafts: Record<string, ServiceSignalDraft>;
  skuSignalDrafts: Record<string, SkuSignalDraft>;
  payload: ReturnType<typeof createEmptyObservationInput>;
}) {
  const { t } = usePreferences();
  return (
    <WorkspacePanel
      className={recordUpdateWhiteCardClassName}
      descriptor={t(STOCK_UPDATE_STEP_COPY.review.descriptionKey)}
      style={recordUpdateWhiteCardStyle}
      title={
        <SectionLabel
          tooltip={t('stockUpdateReviewTooltip')}
          tooltipLabel={t('stockUpdateReviewTooltipLabel')}
        >
          {t(STOCK_UPDATE_STEP_COPY.review.titleKey)}
        </SectionLabel>
      }
    >
      <div className="grid gap-4">
        {blockers.length > 0 ? (
          <div className="grid gap-2">
            {blockers.map((blocker) => (
              <p key={blocker} className="text-sm text-destructive">
                {blocker}
              </p>
            ))}
          </div>
        ) : null}
        <div className="rounded-[1.25rem] border border-border/70 bg-secondary/25 px-4 py-4">
          <p className="font-medium text-foreground">
            {previewParts.length > 0 ? previewParts.join(' · ') : t('stockUpdateNoStructuredSignals')}
          </p>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            {t('stockUpdateReviewBody')}
          </p>
        </div>
        {payload.retailStockouts.length > 0 || payload.serviceStockouts.length > 0 || payload.servicePrices.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {[
              ...payload.servicePrices.map(
                (event) =>
                  t('stockUpdatePriceBadge', {
                    name: catalog?.services.find((service) => service.serviceId === event.serviceId)?.name ?? event.serviceId,
                  }),
              ),
              ...payload.retailStockouts.map(
                (skuId) =>
                  t('stockUpdateStockoutBadge', {
                    name: catalog?.skus.find((sku) => sku.skuId === skuId)?.name ?? skuId,
                  }),
              ),
              ...payload.serviceStockouts.map(
                (serviceId) =>
                  t('stockUpdateStockoutBadge', {
                    name: catalog?.services.find((service) => service.serviceId === serviceId)?.name ?? serviceId,
                  }),
              ),
            ].map((label) => (
              <span key={label} className="rounded-full border border-border/70 bg-background px-3 py-1 text-xs text-muted-foreground">
                {label}
              </span>
            ))}
          </div>
        ) : null}
        {Object.values(skuSignalDrafts).some((draft) => draft.orderEnabled || draft.receiptEnabled) ? (
          <p className="text-sm text-muted-foreground">{t('stockUpdateOrderSignalSaved')}</p>
        ) : null}
        {Object.values(serviceSignalDrafts).some((draft) => draft.priceEnabled) ? (
          <p className="text-sm text-muted-foreground">{t('stockUpdateServicePriceSaved')}</p>
        ) : null}
        {error ? (
          <p className="rounded-[1.25rem] border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {error}
          </p>
        ) : null}
      </div>
    </WorkspacePanel>
  );
}

export function StockUpdateSessionRoute() {
  const {
    catalog,
    createSenaOrderBatch,
    ingestSenaObservation,
    isSaving,
    loadSenaOrderBatches,
    loadSenaRecordUpdateContext,
    observations,
    orderBatches,
    triggerSenaRun,
    updateSenaObservation,
    updateSenaOrderBatch,
    updateSenaOrderChild,
    workspaceSummary,
  } = useInventory();
  const {
    currency,
    language,
    savePreferences,
    showHeartbeatRibbons = true,
    t,
    usdToKhrExchangeRate,
    workbenchTileOrderByLane,
  } = usePreferences();
  const location = useLocation();
  const navigate = useNavigate();
  const lane = useMemo(() => getRecordUpdateLane(location.pathname), [location.pathname]);
  const workbenchReorderLaneId = isWorkbenchReorderLaneId(lane.id) ? lane.id : null;
  const posViewAvailable = lane.id !== 'custom';
  const [sessionViewMode, setSessionViewMode] = useState<SessionViewMode>(() => (posViewAvailable ? readRecordUpdateSessionViewMode() : 'form'));
  const routeCustomSelectedLaneIds = useMemo(() => {
    if (lane.id !== 'custom') {
      return [];
    }
    const selected = parseCustomRecordUpdateLaneIds(new URLSearchParams(location.search).get('lanes'));
    return selected.length > 0 ? selected : (['stock-count'] satisfies BaseRecordUpdateLaneId[]);
  }, [lane.id, location.search]);
  const routeTicketMode = useMemo(() => {
    const value = new URLSearchParams(location.search).get('ticketMode');
    return isTicketAuthoringMode(value) ? value : null;
  }, [location.search]);
  const routeTicketId = useMemo(() => new URLSearchParams(location.search).get('ticketId'), [location.search]);
  const initialSkuIds = useMemo(() => {
    const search = location.search;
    const urlParams = new URLSearchParams(search);
    const skusParam = urlParams.get('skus');
    return skusParam ? new Set(skusParam.split(',').filter(Boolean)) : null;
  }, [location.search]);
  const routeBatchOrderId = useMemo(() => new URLSearchParams(location.search).get('batchOrderId'), [location.search]);
  const routeChildOrderId = useMemo(() => new URLSearchParams(location.search).get('childOrderId'), [location.search]);
  const draftStorageKey = lane.draftStorageKey;
  const stockRowOrderStorageKey = useMemo(() => buildStockRowOrderStorageKey(lane.id), [lane.id]);
  const retailSalesRowOrderStorageKey = useMemo(() => buildStockRowOrderStorageKey(`${lane.id}:retail-sales`), [lane.id]);
  const serviceSalesRowOrderStorageKey = useMemo(() => buildStockRowOrderStorageKey(`${lane.id}:service-sales`), [lane.id]);
  const [customSelectedLaneIds, setCustomSelectedLaneIds] = useState<BaseRecordUpdateLaneId[]>(() => routeCustomSelectedLaneIds);
  const activeStepOrder = useMemo(() => stepOrderForLane(lane.id, customSelectedLaneIds), [customSelectedLaneIds, lane.id]);
  const selectedBaseLaneIds = useMemo(
    () => (lane.id === 'custom' ? customSelectedLaneIds : isBaseRecordUpdateLaneId(lane.id) ? [lane.id] : []),
    [customSelectedLaneIds, lane.id],
  );
  const latestAt = latestObservationAt(observations);
  const incomingEditSession = useMemo(() => readRecordUpdateEditSession(location.state), [location.state]);
  const initialObservedAtRef = useRef(localDateTimeInputValue(null));
  const requestedOrderBatchesRef = useRef(false);
  const requestedRecordUpdateContextRef = useRef(false);
  const draftHydrationCheckedRef = useRef(false);
  const latestDraftStateRef = useRef<StockUpdateDraftState | null>(null);
  const skipNextDraftPersistRef = useRef(false);
  const previousMoneyPreferencesRef = useRef({ currency, usdToKhrExchangeRate });
  const posDeliveryFeeInputRef = useRef<HTMLInputElement | null>(null);
  const posReviewCancelButtonRef = useRef<HTMLButtonElement | null>(null);
  const [editSession, setEditSession] = useState<EditSessionState | null>(() =>
    incomingEditSession
      ? {
          observationId: incomingEditSession.observationId,
          input: incomingEditSession.input,
        }
      : null,
  );
  const [pendingEditSession, setPendingEditSession] = useState<EditSessionState | null>(null);
  const [replaceDraftDialogOpen, setReplaceDraftDialogOpen] = useState(false);
  const [currentStepId, setCurrentStepId] = useState<StockUpdateStepId>('observed-at');
  const [unlockedStepCount, setUnlockedStepCount] = useState(1);
  const [observedAt, setObservedAt] = useState(() => initialObservedAtRef.current);
  const [notes, setNotes] = useState('');
  const [notesPlaceholderKey, setNotesPlaceholderKey] = useState<TranslationKey>(() => randomReportNotePlaceholderKey());
  const [stockView, setStockView] = useState<StockView>('priority');
  const [supplierFilter, setSupplierFilter] = useState<SupplierFilterValue>('all');
  const [persistedStockRowOrder, setPersistedStockRowOrder] = useState(() => readStockRowOrder(stockRowOrderStorageKey));
  const [persistedRetailSalesRowOrder, setPersistedRetailSalesRowOrder] = useState(() => readStockRowOrder(retailSalesRowOrderStorageKey));
  const [persistedServiceSalesRowOrder, setPersistedServiceSalesRowOrder] = useState(() => readStockRowOrder(serviceSalesRowOrderStorageKey));
  const [workbenchTileOrderDraftByLane, setWorkbenchTileOrderDraftByLane] = useState(workbenchTileOrderByLane);
  const [rows, setRows] = useState(() => buildInitialRows(catalog, observations));
  const selectedOrderBatch = useMemo(
    () =>
      orderBatches.find((batch) =>
        routeBatchOrderId
          ? batch.batchOrderId === routeBatchOrderId
          : routeChildOrderId
            ? batch.children.some((child) => child.childOrderId === routeChildOrderId)
            : false,
      ) ?? null,
    [orderBatches, routeBatchOrderId, routeChildOrderId],
  );
  const selectedOrderChildren = useMemo(
    () =>
      selectedOrderBatch == null
        ? []
        : routeChildOrderId
          ? selectedOrderBatch.children.filter((child) => child.childOrderId === routeChildOrderId)
          : selectedOrderBatch.children,
    [routeChildOrderId, selectedOrderBatch],
  );

  useEffect(() => {
    if (typeof loadSenaRecordUpdateContext !== 'function' || requestedRecordUpdateContextRef.current) {
      return;
    }
    requestedRecordUpdateContextRef.current = true;
    void loadSenaRecordUpdateContext().catch((error) => {
      requestedRecordUpdateContextRef.current = false;
      console.warn('[stock-update] record update context load failed', error);
    });
  }, [loadSenaRecordUpdateContext]);

  useEffect(() => {
    if (
      typeof loadSenaOrderBatches !== 'function'
      || requestedOrderBatchesRef.current
      || (orderBatches?.length ?? 0) > 0
    ) {
      return;
    }
    requestedOrderBatchesRef.current = true;
    void loadSenaOrderBatches().catch((error) => {
      requestedOrderBatchesRef.current = false;
      console.warn('[stock-update] order batches load failed', error);
    });
  }, [loadSenaOrderBatches, orderBatches.length]);

  useEffect(() => {
    const scopedIds =
      initialSkuIds ??
      (selectedOrderChildren.length > 0 ? new Set(selectedOrderChildren.map((child) => child.skuId)) : null);
    if (scopedIds && catalog) {
      const filtered = buildInitialRows(catalog, observations).filter((row) => scopedIds.has(row.skuId));
      setRows(applyStockRowOrder(filtered, readStockRowOrder(stockRowOrderStorageKey)));
    }
  }, [initialSkuIds, catalog, observations, selectedOrderChildren, stockRowOrderStorageKey]);

  const [retailSalesChoice, setRetailSalesChoice] = useState<OptionalStockStepChoice>('unset');
  const [serviceSalesChoice, setServiceSalesChoice] = useState<OptionalStockStepChoice>('unset');
  const [retailSalesDrafts, setRetailSalesDrafts] = useState<SalesCountDrafts>({});
  const [serviceSalesDrafts, setServiceSalesDrafts] = useState<SalesCountDrafts>({});
  const [customerPendingMode, setCustomerPendingMode] = useState<CustomerPendingMode>('new_pending');
  const [customerCompletedMode, setCustomerCompletedMode] = useState<CustomerCompletedMode>('immediate_sale');
  const [supplierPendingMode, setSupplierPendingMode] = useState<SupplierPendingMode>('new_supplier_order');
  const [supplierReceiptMode, setSupplierReceiptMode] = useState<SupplierReceiptMode>('against_pending_supplier_order');
  const [deliveryFeeAmount, setDeliveryFeeAmount] = useState('');
  const [deliveryFeePayer, setDeliveryFeePayer] = useState<SenaDeliveryFeePayer>('customer');
  const [deliveryFeeBaselineAmount, setDeliveryFeeBaselineAmount] = useState('');
  const [deliveryFeeBaselinePayer, setDeliveryFeeBaselinePayer] = useState<SenaDeliveryFeePayer>('customer');
  const [customerTicketMode, setCustomerTicketMode] = useState<TicketAuthoringMode | null>(
    () => (lane.id === 'customer-order-pending' ? routeTicketMode : null),
  );
  const [supplierTicketMode, setSupplierTicketMode] = useState<TicketAuthoringMode | null>(
    () => (lane.id === 'supplier-order-pending' ? routeTicketMode : null),
  );
  const [selectedCustomerTicketId, setSelectedCustomerTicketId] = useState<string | null>(
    lane.id === 'customer-order-pending' ? routeTicketId : null,
  );
  const [selectedSupplierTicketId, setSelectedSupplierTicketId] = useState<string | null>(
    routeBatchOrderId ?? routeChildOrderId ?? (lane.id === 'supplier-order-pending' ? routeTicketId : null),
  );
  const [supplierTicketUpdateAction, setSupplierTicketUpdateAction] = useState<SupplierTicketUpdateAction>('revise_order');
  const [customerIdentity, setCustomerIdentity] = useState<CustomerIdentityDraft>(DEFAULT_CUSTOMER_IDENTITY);
  const [activePosMetadataPopup, setActivePosMetadataPopup] = useState<PosMetadataPopupId | null>(null);
  const [activePosTileKey, setActivePosTileKey] = useState<string | null>(null);
  const [activeWorkbenchDragTileKey, setActiveWorkbenchDragTileKey] = useState<string | null>(null);
  const [posTileDialogQuantity, setPosTileDialogQuantity] = useState('1');
  const [posReceiptConfirmOpen, setPosReceiptConfirmOpen] = useState(false);
  const [posReceiptCopyStatus, setPosReceiptCopyStatus] = useState<'idle' | 'copied' | 'failed'>('idle');
  const [posWorkbenchSearch, setPosWorkbenchSearch] = useState('');
  const [posWorkbenchFilter, setPosWorkbenchFilter] = useState<PosWorkbenchFilterId>('all');
  const [workbenchReorderMode, setWorkbenchReorderMode] = useState(false);
  const [workbenchReorderPromptOpen, setWorkbenchReorderPromptOpen] = useState(false);
  const [posTouchedLineKeys, setPosTouchedLineKeys] = useState<string[]>([]);
  const [customerPendingModeFilters, setCustomerPendingModeFilters] = useState<CustomerPendingMode[]>(() => [...CUSTOMER_PENDING_MODE_OPTIONS]);
  const [customerCompletedModeFilters, setCustomerCompletedModeFilters] = useState<CustomerCompletedMode[]>(() => [...CUSTOMER_COMPLETED_MODE_OPTIONS]);
  const [supplierPendingModeFilters, setSupplierPendingModeFilters] = useState<SupplierPendingMode[]>(() => [...SUPPLIER_PENDING_MODE_OPTIONS]);
  const [supplierReceiptModeFilters, setSupplierReceiptModeFilters] = useState<SupplierReceiptMode[]>(() => [...SUPPLIER_RECEIPT_MODE_OPTIONS]);
  const [refundStockReturnDrafts, setRefundStockReturnDrafts] = useState<Record<string, RefundStockReturnChoice>>({});
  const [skuSignalDrafts, setSkuSignalDrafts] = useState<Record<string, SkuSignalDraft>>({});
  const [recordOrderExpectedArrivalDate, setRecordOrderExpectedArrivalDate] = useState('');
  const [recordOrderLeadTimeMeanDays, setRecordOrderLeadTimeMeanDays] = useState('');
  const [recordOrderLeadTimeVariability, setRecordOrderLeadTimeVariability] = useState<SenaLeadTimeVariabilityClass | ''>('');
  const [recordReceiptReceivedDate, setRecordReceiptReceivedDate] = useState('');
  const [stockStepChoices, setStockStepChoices] = useState<Record<OptionalStockStepId, OptionalStockStepChoice>>(
    () => createDefaultStockStepChoices(),
  );
  const [serviceSignalDrafts, setServiceSignalDrafts] = useState<Record<string, ServiceSignalDraft>>({});
  const [regimeHint, setRegimeHint] = useState<SenaObservationRegimeHint | ''>('');
  const [serviceRankings, setServiceRankings] = useState<string[]>([]);
  const [retailRankings, setRetailRankings] = useState<string[]>([]);
  const [debugCellBoundaries, setDebugCellBoundaries] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasSavedDraft, setHasSavedDraft] = useState(() => hasStoredStockUpdateDraft(draftStorageKey));
  const [draftWasRestored, setDraftWasRestored] = useState(false);
  const [leaveDraftDialogOpen, setLeaveDraftDialogOpen] = useState(false);
  const workbenchHoldTimerRef = useRef<number | null>(null);
  const pendingWorkbenchInteractionRef = useRef<null | (() => void)>(null);
  const visibleCatalog = useMemo(() => activeSenaCatalog(catalog), [catalog]);
  const workingCatalog = editSession ? catalog : visibleCatalog;
  useEffect(() => {
    setWorkbenchTileOrderDraftByLane(workbenchTileOrderByLane);
  }, [workbenchTileOrderByLane]);
  useEffect(() => {
    if (sessionViewMode === 'pos' && workbenchReorderLaneId) {
      return;
    }
    setWorkbenchReorderMode(false);
    setWorkbenchReorderPromptOpen(false);
    setActiveWorkbenchDragTileKey(null);
  }, [sessionViewMode, workbenchReorderLaneId]);
  useEffect(() => {
    if (!workbenchReorderMode) {
      return;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== 'Escape') {
        return;
      }
      pendingWorkbenchInteractionRef.current = null;
      setWorkbenchReorderPromptOpen(false);
      setWorkbenchReorderMode(false);
      setActiveWorkbenchDragTileKey(null);
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [workbenchReorderMode]);
  useEffect(() => {
    setSessionViewMode(posViewAvailable ? readRecordUpdateSessionViewMode() : 'form');
  }, [lane.id, posViewAvailable]);
  useEffect(() => {
    setPosWorkbenchSearch('');
    setPosWorkbenchFilter('all');
    setPosTouchedLineKeys([]);
    setActivePosMetadataPopup(null);
    setActivePosTileKey(null);
    setPosTileDialogQuantity('1');
    setPosReceiptConfirmOpen(false);
    setPosReceiptCopyStatus('idle');
  }, [lane.id]);
  useEffect(() => {
    if (selectedOrderChildren.length === 0 || draftWasRestored || editSession) {
      return;
    }
    const draftMap = Object.fromEntries(
      selectedOrderChildren.map((child) => [
        child.skuId,
        {
          ...createEmptySkuSignalDraft(),
          orderEnabled: Boolean(child.effective.orderedQuantity && selectedBaseLaneIds.includes('supplier-order-pending')),
          orderedQuantity: child.effective.orderedQuantity?.toString() ?? '',
          expectedArrivalDate: dateInputValue(child.effective.expectedArrivalAt ?? selectedOrderBatch?.shared.expectedArrivalAt ?? null),
          receiptEnabled: Boolean(child.effective.receivedQuantity && selectedBaseLaneIds.includes('supplier-receipt')),
          receiptQuantity: child.effective.receivedQuantity?.toString() ?? '',
          leadTimeMeanDays: child.effective.leadTimeDaysHint?.toString() ?? '',
          leadTimeVariability: child.effective.leadTimeVariability ?? '',
        } satisfies SkuSignalDraft,
      ]),
    );
    setSkuSignalDrafts((current) => ({ ...draftMap, ...current }));
    setNotes((current) => current || selectedOrderBatch?.shared.supplierNote || '');
    setRecordOrderExpectedArrivalDate(
      dateInputValue(selectedOrderBatch?.shared.expectedArrivalAt ?? selectedOrderChildren[0]?.effective.expectedArrivalAt ?? null),
    );
    setRecordReceiptReceivedDate(
      dateInputValue(selectedOrderChildren[0]?.effective.receiptTimestamp ?? null),
    );
  }, [draftWasRestored, editSession, selectedBaseLaneIds, selectedOrderBatch, selectedOrderChildren]);
  const buildOrderedInitialRows = useCallback(
    (nextCatalog: SenaCatalog | null) =>
      applyStockRowOrder(buildInitialRows(nextCatalog, observations), persistedStockRowOrder),
    [observations, persistedStockRowOrder],
  );

  const stockBySku = useMemo(() => latestStockBySku(workingCatalog, observations), [observations, workingCatalog]);
  const countedAtBySku = useMemo(() => latestCountedAtBySku(observations), [observations]);
  const latestOrderedQuantity = useMemo(() => latestOrderQuantityBySku(workingCatalog, observations), [observations, workingCatalog]);
  const latestOrderedAt = useMemo(() => latestOrderAtBySku(observations), [observations]);
  const latestReceiptQuantity = useMemo(() => latestReceiptQuantityBySku(workingCatalog, observations), [observations, workingCatalog]);
  const latestReceiptAt = useMemo(() => latestReceiptAtBySku(observations), [observations]);
  const latestRetailSales = useMemo(() => latestRetailSalesBySku(workingCatalog, observations), [observations, workingCatalog]);
  const latestRetailSalesAt = useMemo(() => latestRetailSalesAtBySku(observations), [observations]);
  const latestServiceSales = useMemo(() => latestServiceSalesByService(workingCatalog, observations), [observations, workingCatalog]);
  const latestServiceSalesAt = useMemo(() => latestServiceSalesAtByService(observations), [observations]);
  const customerCommercialSnapshots = useMemo(
    () => buildCommercialEntitySnapshots({ observations, party: 'customer', rangeDays: 30 }),
    [observations],
  );
  const latestCustomerPendingBySku = useMemo(
    () =>
      new Map(
        [...customerCommercialSnapshots.pendingQuantityByEntity.entries()]
          .filter(([key]) => key.startsWith('sku:'))
          .map(([key, quantity]) => [key.slice(4), Math.max(0, quantity)]),
      ),
    [customerCommercialSnapshots.pendingQuantityByEntity],
  );
  const latestCustomerPendingByService = useMemo(
    () =>
      new Map(
        [...customerCommercialSnapshots.pendingQuantityByEntity.entries()]
          .filter(([key]) => key.startsWith('service:'))
          .map(([key, quantity]) => [key.slice(8), Math.max(0, quantity)]),
      ),
    [customerCommercialSnapshots.pendingQuantityByEntity],
  );
  const recommendedOrderBySku = useMemo(() => reorderRecommendationBySku(workspaceSummary), [workspaceSummary]);
  const leadTimeMeanDefaults = useMemo(() => leadTimeMeanBySku(workingCatalog, workspaceSummary), [workingCatalog, workspaceSummary]);
  const leadTimeVariabilityDefaults = useMemo(() => leadTimeVariabilityBySku(workingCatalog, workspaceSummary), [workingCatalog, workspaceSummary]);
  const visibleSkuSignalDrafts = useMemo(
    () => (lane.id === 'stock-count' ? skuEventOnlyDrafts(skuSignalDrafts) : skuSignalDrafts),
    [lane.id, skuSignalDrafts],
  );
  const supplierFilteredRows = useMemo(
    () => rows.filter((row) => {
      const sku = workingCatalog?.skus.find((entry) => entry.skuId === row.skuId);
      return sku ? matchesSkuSupplier(sku, supplierFilter) : true;
    }),
    [rows, supplierFilter, workingCatalog?.skus],
  );
  const supplierFilterControl = (
    <div className="flex justify-start">
      <SupplierFilter
        catalog={workingCatalog}
        className={cn('h-10 rounded-xl px-3 data-[size=default]:h-10')}
        value={supplierFilter}
        onChange={setSupplierFilter}
      />
    </div>
  );
  const retailSkuIds = useMemo(
    () =>
      applyStockRowOrder(
        (workingCatalog?.skus ?? [])
          .filter((sku) => sku.soldAsProduct && matchesSkuSupplier(sku, supplierFilter))
          .map((sku) => ({ skuId: sku.skuId })),
        persistedRetailSalesRowOrder,
      ).map((row) => row.skuId),
    [persistedRetailSalesRowOrder, supplierFilter, workingCatalog],
  );
  const serviceIds = useMemo(
    () =>
      applyStockRowOrder(
        (workingCatalog?.services ?? [])
          .filter((service) => matchesServiceSupplier(service, workingCatalog, supplierFilter))
          .map((service) => ({ skuId: service.serviceId })),
        persistedServiceSalesRowOrder,
      ).map((row) => row.skuId),
    [persistedServiceSalesRowOrder, supplierFilter, workingCatalog],
  );
  const highRiskIds = new Set(workspaceSummary?.highRiskSkuIds ?? []);
  const serviceLinkedSkuIds = useMemo(
    () => new Set((workingCatalog?.sharingMask ?? []).filter((entry) => entry.enabled).map((entry) => entry.skuId)),
    [workingCatalog],
  );
  const prioritySkuIds = useMemo(() => {
    const scored = (workingCatalog?.skus ?? []).map((sku, index) => ({
      skuId: sku.skuId,
      score:
        (highRiskIds.has(sku.skuId) ? 100 : 0) +
        (serviceLinkedSkuIds.has(sku.skuId) ? 20 : 0) +
        (countedAtBySku.has(sku.skuId) ? 0 : 10) -
        index / 100,
    }));
    return new Set(scored.sort((left, right) => right.score - left.score).slice(0, 8).map((entry) => entry.skuId));
  }, [countedAtBySku, highRiskIds, serviceLinkedSkuIds, workingCatalog?.skus]);

  const visibleRows = lane.id === 'stock-count'
    ? supplierFilteredRows
    : supplierFilteredRows.filter((row) => {
        if (stockView === 'counted') {
          return stockRowChanged(workingCatalog, stockBySku, row) || hasSkuFlags(skuSignalDrafts[row.skuId]);
        }
        if (stockView === 'priority') {
          return prioritySkuIds.has(row.skuId);
        }
        return true;
      });
  const salesFlagRows = useMemo(
    () => rows.filter((row) => retailSkuIds.includes(row.skuId)),
    [retailSkuIds, rows],
  );

  const observedAtIso = dateTimeInputToIso(observedAt);
  const intervalDays = intervalDaysBetween(latestAt, observedAtIso);
  const isFirstObservation = observations.length === 0;
  const countedSkuCount = rows.filter((row) => stockRowChanged(workingCatalog, stockBySku, row)).length;
  const retailSalesCount = Object.values(retailSalesDrafts).filter((value) => value.trim() !== '').length;
  const serviceSalesCount = Object.values(serviceSalesDrafts).filter((value) => value.trim() !== '').length;
  const orderSignalCount = Object.values(skuSignalDrafts).filter((draft) => draft.orderedQuantity.trim() !== '').length;
  const receiptSignalCount = Object.values(skuSignalDrafts).filter((draft) => draft.receiptQuantity.trim() !== '').length;
  const fullUpdate = rows.length > 0 && rows.every((row) => stockRowChanged(workingCatalog, stockBySku, row));
  const defaultServiceRankingIds = (workingCatalog?.services ?? [])
    .filter((service) => matchesServiceSupplier(service, workingCatalog, supplierFilter))
    .map((service) => service.serviceId);
  const defaultRetailRankingIds = (workingCatalog?.skus ?? [])
    .filter((sku) => sku.soldAsProduct && matchesSkuSupplier(sku, supplierFilter))
    .map((sku) => sku.skuId);
  const currentStepIndex = activeStepOrder.indexOf(currentStepId);
  const normalizedCurrentStepIndex = currentStepIndex >= 0 ? currentStepIndex : 0;
  const isLastStep = normalizedCurrentStepIndex === activeStepOrder.length - 1;
  const skuFlagCount = Object.values(visibleSkuSignalDrafts).reduce((count, draft) => count + activeSkuFlagIds(draft).length, 0);
  const serviceFlagCount = Object.values(serviceSignalDrafts).reduce((count, draft) => count + activeServiceFlagIds(draft).length, 0);
  const rankingSignalCount = serviceRankings.length + retailRankings.length;
  const costChangedCount = changedRowCount(rows, (row) => stockCostChanged(workingCatalog, stockBySku, row));
  const retailPriceChangedCount = changedRowCount(rows, (row) => stockRetailPriceChanged(workingCatalog, stockBySku, row));
  const serviceStepIndex = activeStepOrder.indexOf('service');
  const rankingsStepIndex = activeStepOrder.indexOf('rankings');
  const retailSalesStepIndex = activeStepOrder.indexOf('retail-sales');
  const serviceSalesStepIndex = activeStepOrder.indexOf('service-sales');
  const stockStepSatisfied = !isFirstObservation || countedSkuCount > 0;
  const skuFlagsValid = !skuFlagsHaveEmptyRequiredValues(visibleSkuSignalDrafts);
  const serviceFlagsValid = !serviceFlagsHaveEmptyRequiredValues(serviceSignalDrafts);
  const isCustomLane = lane.id === 'custom';
  const hasStockCountLane = selectedBaseLaneIds.includes('stock-count');
  const stockCountPosMode = sessionViewMode === 'pos' && lane.id === 'stock-count';
  const isCustomerPendingLane = selectedBaseLaneIds.includes('customer-order-pending');
  const isCustomerCompletedLane = selectedBaseLaneIds.includes('customer-order-completed');
  const isSupplierPendingLane = selectedBaseLaneIds.includes('supplier-order-pending');
  const isSupplierReceiptLane = selectedBaseLaneIds.includes('supplier-receipt');
  const isCustomerTicketLane = isCustomerPendingLane || isCustomerCompletedLane;
  const deliveryFeeBucket = useMemo(
    () =>
      deliveryFeeBucketForWorkflow({
        customerCompletedMode,
        isCustomerCompletedLane,
        isCustomerPendingLane,
        isSupplierPendingLane,
        isSupplierReceiptLane,
      }),
    [customerCompletedMode, isCustomerCompletedLane, isCustomerPendingLane, isSupplierPendingLane, isSupplierReceiptLane],
  );
  const deliveryFeeEnabled = deliveryFeeBucket != null;
  const deliveryFeePayerLocked = deliveryFeeBucket === 'supplier';
  const deliveryFeeDefaultPayer = defaultDeliveryFeePayer(deliveryFeeBucket);
  const skipsFirstStockRequirement = !hasStockCountLane;
  const customerDirectory = useMemo(() => buildCustomerLinkDirectory(observations), [observations]);
  const customerIdentityWarning = useMemo(
    () => customerLinkWarning(customerIdentity, customerDirectory),
    [customerDirectory, customerIdentity],
  );
  const ticketEvents = useMemo(() => latestTicketEvents(observations), [observations]);
  const latestHistoricalDeliveryFee = useMemo(
    () => (deliveryFeeBucket == null ? null : latestDeliveryFeeMetadata(observations, deliveryFeeBucket)),
    [deliveryFeeBucket, observations],
  );
  useEffect(() => {
    if (draftWasRestored || editSession) {
      return;
    }
    const sourceMetadata =
      selectedOrderBatch?.shared.deliveryFee
      ?? latestHistoricalDeliveryFee;
    const nextAmount =
      sourceMetadata?.feeUsd != null
        ? String(displayMoneyFromUsd(sourceMetadata.feeUsd, currency, usdToKhrExchangeRate))
        : '';
    const nextPayer = deliveryFeePayerLocked
      ? 'merchant'
      : sourceMetadata?.payer ?? deliveryFeeDefaultPayer;
    setDeliveryFeeAmount(nextAmount);
    setDeliveryFeePayer(nextPayer);
    setDeliveryFeeBaselineAmount(nextAmount);
    setDeliveryFeeBaselinePayer(nextPayer);
  }, [
    currency,
    deliveryFeeDefaultPayer,
    deliveryFeePayerLocked,
    draftWasRestored,
    editSession,
    latestHistoricalDeliveryFee,
    selectedOrderBatch,
    usdToKhrExchangeRate,
  ]);
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
      }];
    });
    const seen = new Set<string>();
    return [...fromTicketEvents, ...fromLegacyBatches].filter((option) => {
      if (seen.has(option.id)) {
        return false;
      }
      seen.add(option.id);
      return true;
    });
  }, [orderBatches, ticketEvents]);
  const deferredPosWorkbenchSearch = useDeferredValue(posWorkbenchSearch);
  const posTouchedLineKeySet = useMemo(() => new Set(posTouchedLineKeys), [posTouchedLineKeys]);
  const workbenchTileOrder = useMemo(
    () => (workbenchReorderLaneId ? workbenchTileOrderDraftByLane[workbenchReorderLaneId] ?? [] : []),
    [workbenchReorderLaneId, workbenchTileOrderDraftByLane],
  );
  const skuById = useMemo(() => new Map((workingCatalog?.skus ?? []).map((sku) => [sku.skuId, sku] as const)), [workingCatalog?.skus]);
  const serviceById = useMemo(() => new Map((workingCatalog?.services ?? []).map((service) => [service.serviceId, service] as const)), [workingCatalog?.services]);
  const deliveryFeeUsd = useMemo(() => {
    const trimmed = deliveryFeeAmount.trim();
    if (!trimmed) {
      return null;
    }
    const parsed = Number(trimmed);
    if (!Number.isFinite(parsed) || parsed < 0) {
      return null;
    }
    return usdMoneyFromDisplay(parsed, currency, usdToKhrExchangeRate);
  }, [currency, deliveryFeeAmount, usdToKhrExchangeRate]);
  const deliverySubtotalUsd = useMemo(() => {
    if (!deliveryFeeEnabled) {
      return null;
    }
    if (isSupplierPendingLane || isSupplierReceiptLane) {
      return Object.entries(skuSignalDrafts).reduce((sum, [skuId, draft]) => {
        const quantityText = isSupplierPendingLane ? draft.orderedQuantity.trim() : draft.receiptQuantity.trim();
        if (!quantityText) {
          return sum;
        }
        const quantity = Number(quantityText);
        if (!Number.isFinite(quantity) || quantity <= 0) {
          return sum;
        }
        const row = rows.find((entry) => entry.skuId === skuId);
        const unitCost = row?.costPerUnit ?? skuById.get(skuId)?.costPerUnit ?? null;
        return unitCost == null ? sum : sum + unitCost * quantity;
      }, 0);
    }
    if (isCustomerPendingLane || isCustomerCompletedLane) {
      return [
        ...Object.entries(retailSalesDrafts).map(([skuId, value]) => {
          const quantity = Number(value.trim());
          const unitAmount = skuById.get(skuId)?.productPrice ?? null;
          return Number.isFinite(quantity) && quantity > 0 && unitAmount != null ? quantity * unitAmount : 0;
        }),
        ...Object.entries(serviceSalesDrafts).map(([serviceId, value]) => {
          const quantity = Number(value.trim());
          const unitAmount = serviceById.get(serviceId)?.price ?? null;
          return Number.isFinite(quantity) && quantity > 0 && unitAmount != null ? quantity * unitAmount : 0;
        }),
      ].reduce((sum, value) => sum + value, 0);
    }
    return null;
  }, [
    deliveryFeeEnabled,
    isCustomerCompletedLane,
    isCustomerPendingLane,
    isSupplierPendingLane,
    isSupplierReceiptLane,
    retailSalesDrafts,
    rows,
    serviceById,
    serviceSalesDrafts,
    skuById,
    skuSignalDrafts,
  ]);
  const activeDeliveryFeeMetadata = useMemo(() => {
    if (!deliveryFeeEnabled || deliveryFeeBucket == null) {
      return null;
    }
    return buildDeliveryFeeMetadata({
      bucket: deliveryFeeBucket,
      feeUsd: deliveryFeeUsd,
      payer: deliveryFeePayerLocked ? 'merchant' : deliveryFeePayer,
      subtotalUsd: deliverySubtotalUsd,
    });
  }, [deliveryFeeBucket, deliveryFeeEnabled, deliveryFeePayer, deliveryFeePayerLocked, deliveryFeeUsd, deliverySubtotalUsd]);
  const activeDeliverySummary = useMemo(
    () =>
      activeDeliveryFeeMetadata == null
        ? summarizeDeliveryFee({
            bucket: deliveryFeeBucket ?? 'customer_order',
            feeUsd: null,
            payer: deliveryFeePayerLocked ? 'merchant' : deliveryFeePayer,
            subtotalUsd: deliverySubtotalUsd,
          })
        : {
            subtotalUsd: activeDeliveryFeeMetadata.subtotalUsd,
            displayDeliveryUsd: activeDeliveryFeeMetadata.displayDeliveryUsd,
            displayTotalUsd: activeDeliveryFeeMetadata.displayTotalUsd,
            netSettlementUsd: activeDeliveryFeeMetadata.netSettlementUsd,
          },
    [activeDeliveryFeeMetadata, deliveryFeeBucket, deliveryFeePayer, deliveryFeePayerLocked, deliverySubtotalUsd],
  );
  const deliverySubtotalLabel = useMemo(
    () =>
      activeDeliverySummary.subtotalUsd == null
        ? translateUiLiteral(language, 'n/a')
        : formatCurrency(activeDeliverySummary.subtotalUsd, currency, language, usdToKhrExchangeRate),
    [activeDeliverySummary.subtotalUsd, currency, language, usdToKhrExchangeRate],
  );
  const deliveryDisplayLabel = useMemo(
    () =>
      activeDeliverySummary.displayDeliveryUsd == null
        ? translateUiLiteral(language, 'n/a')
        : formatCurrency(activeDeliverySummary.displayDeliveryUsd, currency, language, usdToKhrExchangeRate),
    [activeDeliverySummary.displayDeliveryUsd, currency, language, usdToKhrExchangeRate],
  );
  const deliveryTotalLabel = useMemo(
    () =>
      activeDeliverySummary.displayTotalUsd == null
        ? translateUiLiteral(language, 'n/a')
        : formatCurrency(activeDeliverySummary.displayTotalUsd, currency, language, usdToKhrExchangeRate),
    [activeDeliverySummary.displayTotalUsd, currency, language, usdToKhrExchangeRate],
  );

  const markPosLineTouched = useCallback((key: string) => {
    setPosTouchedLineKeys((current) => (current.includes(key) ? current : [...current, key]));
  }, []);

  const clearPosLineTouched = useCallback((key: string) => {
    setPosTouchedLineKeys((current) => current.filter((entry) => entry !== key));
  }, []);

  function updateCustomerPendingModeFilters(values: CustomerPendingMode[]) {
    setCustomerPendingModeFilters(values);
    if (!values.includes(customerPendingMode)) {
      setCustomerPendingMode(values[0] ?? 'new_pending');
    }
  }

  function updateCustomerCompletedModeFilters(values: CustomerCompletedMode[]) {
    setCustomerCompletedModeFilters(values);
    if (!values.includes(customerCompletedMode)) {
      setCustomerCompletedMode(values[0] ?? 'immediate_sale');
    }
  }

  function updateSupplierPendingModeFilters(values: SupplierPendingMode[]) {
    setSupplierPendingModeFilters(values);
    if (!values.includes(supplierPendingMode)) {
      setSupplierPendingMode(values[0] ?? 'new_supplier_order');
    }
  }

  function updateSupplierReceiptModeFilters(values: SupplierReceiptMode[]) {
    setSupplierReceiptModeFilters(values);
    if (!values.includes(supplierReceiptMode)) {
      setSupplierReceiptMode(values[0] ?? 'against_pending_supplier_order');
    }
  }

  function updateCustomerIdentity(nextIdentity: CustomerIdentityDraft) {
    setCustomerIdentity((current) => {
      const next = { ...nextIdentity };
      const nextNameKey = normalizeTicketLookupValue(next.customerName);
      const nextPhoneKey = normalizeTicketPhone(next.phone);
      const currentNameKey = normalizeTicketLookupValue(current.customerName);
      const currentPhoneKey = normalizeTicketPhone(current.phone);
      if (nextNameKey && nextNameKey !== currentNameKey && !next.phone.trim()) {
        next.phone = customerDirectory.nameToPhone.get(nextNameKey) ?? next.phone;
      }
      if (nextPhoneKey && nextPhoneKey !== currentPhoneKey && !next.customerName.trim()) {
        next.customerName = customerDirectory.phoneToName.get(nextPhoneKey) ?? next.customerName;
      }
      return next;
    });
  }
  const draftState = useMemo<StockUpdateDraftState>(
    () => ({
      catalog: workingCatalog,
      customSelectedLaneIds,
      currentStepId,
      initialObservedAt: initialObservedAtRef.current,
      notes,
      observedAt,
      regimeHint,
      retailSalesChoice,
      retailSalesDrafts,
      retailRankings,
      customerPendingMode,
      customerCompletedMode,
      recordOrderExpectedArrivalDate,
      recordOrderLeadTimeMeanDays,
      recordOrderLeadTimeVariability,
      recordReceiptReceivedDate,
      deliveryFeeAmount,
      deliveryFeePayer,
      deliveryFeeBaselineAmount,
      deliveryFeeBaselinePayer,
      supplierPendingMode,
      supplierReceiptMode,
      customerTicketMode,
      supplierTicketMode,
      selectedCustomerTicketId,
      selectedSupplierTicketId,
      supplierTicketUpdateAction,
      customerIdentity,
      refundStockReturnDrafts,
      rows,
      serviceSalesChoice,
      serviceSalesDrafts,
      serviceRankings,
      serviceSignalDrafts,
      skuSignalDrafts: visibleSkuSignalDrafts,
      stockStepChoices,
      stockBySku,
      stockView,
      unlockedStepCount,
    }),
    [
      workingCatalog,
      customSelectedLaneIds,
      currentStepId,
      notes,
      observedAt,
      regimeHint,
      retailSalesChoice,
      retailSalesDrafts,
      retailRankings,
      customerPendingMode,
      customerCompletedMode,
      recordOrderExpectedArrivalDate,
      recordOrderLeadTimeMeanDays,
      recordOrderLeadTimeVariability,
      recordReceiptReceivedDate,
      deliveryFeeAmount,
      deliveryFeePayer,
      deliveryFeeBaselineAmount,
      deliveryFeeBaselinePayer,
      supplierPendingMode,
      supplierReceiptMode,
      customerTicketMode,
      supplierTicketMode,
      selectedCustomerTicketId,
      selectedSupplierTicketId,
      supplierTicketUpdateAction,
      customerIdentity,
      refundStockReturnDrafts,
      rows,
      serviceSalesChoice,
      serviceSalesDrafts,
      serviceRankings,
      serviceSignalDrafts,
      visibleSkuSignalDrafts,
      stockStepChoices,
      stockBySku,
      stockView,
      unlockedStepCount,
    ],
  );
  const hasMeaningfulChanges = useMemo(() => hasMeaningfulStockUpdateChanges(draftState), [draftState]);
  const canDiscardChanges = hasMeaningfulChanges || hasSavedDraft || draftWasRestored;
  const hasAnyLiveDraft = canDiscardChanges;

  function persistStockRowOrder(nextRows: StockRow[]) {
    const orderedSkuIds = nextRows.map((row) => row.skuId);
    setPersistedStockRowOrder(orderedSkuIds);
    writeStockRowOrder(stockRowOrderStorageKey, orderedSkuIds);
  }

  function handleStockRowReorder(activeSkuId: string, overSkuId: string) {
    setRows((currentRows) => {
      const nextRows = reorderStockRows(currentRows, activeSkuId, overSkuId);
      if (nextRows !== currentRows) {
        persistStockRowOrder(nextRows);
      }
      return nextRows;
    });
  }

  function handleRetailSalesRowReorder(activeId: string, overId: string) {
    const nextIds = reorderStringIds(retailSkuIds, activeId, overId);
    setPersistedRetailSalesRowOrder(nextIds);
    writeStockRowOrder(retailSalesRowOrderStorageKey, nextIds);
  }

  function handleServiceSalesRowReorder(activeId: string, overId: string) {
    const nextIds = reorderStringIds(serviceIds, activeId, overId);
    setPersistedServiceSalesRowOrder(nextIds);
    writeStockRowOrder(serviceSalesRowOrderStorageKey, nextIds);
  }

  function applyHydratedDraftState({
    hydratedState,
    nextEditSession,
  }: {
    hydratedState: HydratedStockUpdateState;
    nextEditSession: EditSessionState | null;
  }) {
    initialObservedAtRef.current = hydratedState.observedAt;
    setEditSession(nextEditSession);
    setCustomSelectedLaneIds(hydratedState.customSelectedLaneIds ?? []);
    setCurrentStepId(hydratedState.currentStepId);
    setUnlockedStepCount(hydratedState.unlockedStepCount);
    setObservedAt(hydratedState.observedAt);
    setNotes(hydratedState.notes);
    setStockView(hydratedState.stockView);
    setRows(hydratedState.rows);
    setRetailSalesChoice(hydratedState.retailSalesChoice);
    setServiceSalesChoice(hydratedState.serviceSalesChoice);
    setRetailSalesDrafts(hydratedState.retailSalesDrafts);
    setServiceSalesDrafts(hydratedState.serviceSalesDrafts);
    setCustomerPendingMode(hydratedState.customerPendingMode);
    setCustomerCompletedMode(hydratedState.customerCompletedMode);
    setSupplierPendingMode(hydratedState.supplierPendingMode);
    setSupplierReceiptMode(hydratedState.supplierReceiptMode);
    setCustomerTicketMode(hydratedState.customerTicketMode);
    setSupplierTicketMode(hydratedState.supplierTicketMode);
    setSelectedCustomerTicketId(hydratedState.selectedCustomerTicketId);
    setSelectedSupplierTicketId(hydratedState.selectedSupplierTicketId);
    setSupplierTicketUpdateAction(hydratedState.supplierTicketUpdateAction);
    setCustomerIdentity(hydratedState.customerIdentity);
    setSkuSignalDrafts(hydratedState.skuSignalDrafts);
    setRecordOrderExpectedArrivalDate(hydratedState.recordOrderExpectedArrivalDate);
    setRecordOrderLeadTimeMeanDays(hydratedState.recordOrderLeadTimeMeanDays);
    setRecordOrderLeadTimeVariability(hydratedState.recordOrderLeadTimeVariability);
    setRecordReceiptReceivedDate(hydratedState.recordReceiptReceivedDate);
    setDeliveryFeeAmount(hydratedState.deliveryFeeAmount);
    setDeliveryFeePayer(hydratedState.deliveryFeePayer);
    setDeliveryFeeBaselineAmount(hydratedState.deliveryFeeBaselineAmount);
    setDeliveryFeeBaselinePayer(hydratedState.deliveryFeeBaselinePayer);
    setStockStepChoices(hydratedState.stockStepChoices);
    setServiceSignalDrafts(hydratedState.serviceSignalDrafts);
    setRegimeHint(hydratedState.regimeHint);
    setServiceRankings(hydratedState.serviceRankings);
    setRetailRankings(hydratedState.retailRankings);
    setRefundStockReturnDrafts(hydratedState.refundStockReturnDrafts);
  }

  function hydrateEditSession(nextEditSession: EditSessionState, baselineRows: StockRow[]) {
    const editCatalog = catalog ?? visibleCatalog;
    if (!editCatalog) {
      return;
    }
    const hydratedEditState = buildDraftsFromObservationInput({
      baselineRows,
      catalog: editCatalog,
      currency,
      input: nextEditSession.input,
      stepOrder: activeStepOrder,
      usdToKhrExchangeRate,
    });
    applyHydratedDraftState({
      hydratedState: hydratedEditState,
      nextEditSession,
    });
    setHasSavedDraft(false);
    setDraftWasRestored(false);
    setPendingEditSession(null);
    setReplaceDraftDialogOpen(false);
    navigate(location.pathname, { replace: true, state: null });
  }

  useEffect(() => {
    setPersistedStockRowOrder(readStockRowOrder(stockRowOrderStorageKey));
  }, [stockRowOrderStorageKey]);

  useEffect(() => {
    setPersistedRetailSalesRowOrder(readStockRowOrder(retailSalesRowOrderStorageKey));
  }, [retailSalesRowOrderStorageKey]);

  useEffect(() => {
    setPersistedServiceSalesRowOrder(readStockRowOrder(serviceSalesRowOrderStorageKey));
  }, [serviceSalesRowOrderStorageKey]);

  useEffect(() => {
    if (lane.id !== 'custom') {
      setCustomSelectedLaneIds([]);
      return;
    }
    if (!draftWasRestored) {
      setCustomSelectedLaneIds(routeCustomSelectedLaneIds);
    }
  }, [draftWasRestored, lane.id, routeCustomSelectedLaneIds]);

  useEffect(() => {
    if (lane.id === 'customer-order-pending' && routeTicketMode) {
      setCustomerTicketMode(routeTicketMode);
      if (routeTicketMode === 'new') {
        setSelectedCustomerTicketId(null);
      } else if (routeTicketId) {
        setSelectedCustomerTicketId(routeTicketId);
      }
      return;
    }
    if (lane.id === 'supplier-order-pending' && routeTicketMode) {
      setSupplierTicketMode(routeTicketMode);
      if (routeTicketMode === 'new') {
        setSelectedSupplierTicketId(routeBatchOrderId ?? routeChildOrderId);
      } else if (routeTicketId) {
        setSelectedSupplierTicketId(routeTicketId);
      }
    }
  }, [lane.id, routeBatchOrderId, routeChildOrderId, routeTicketId, routeTicketMode]);

  useEffect(() => {
    if (!workingCatalog) {
      setRows(buildOrderedInitialRows(workingCatalog));
      return;
    }

    const baselineRows = buildOrderedInitialRows(workingCatalog);
    const nextEditSession = incomingEditSession
      ? {
          observationId: incomingEditSession.observationId,
          input: incomingEditSession.input,
        }
      : null;
    if (!draftHydrationCheckedRef.current) {
      draftHydrationCheckedRef.current = true;
      if (nextEditSession) {
        if (hasAnyLiveDraft) {
          setPendingEditSession(nextEditSession);
          setReplaceDraftDialogOpen(true);
          return;
        }
        hydrateEditSession(nextEditSession, baselineRows);
        return;
      }

      const hydratedDraft = hydrateStockUpdateDraft({
        baselineRows,
        catalog: workingCatalog,
        draft: readStockUpdateDraft(draftStorageKey),
        stepOrder: activeStepOrder,
      });

      if (hydratedDraft) {
        setCustomSelectedLaneIds(
          lane.id === 'custom' && hydratedDraft.customSelectedLaneIds && hydratedDraft.customSelectedLaneIds.length > 0
            ? hydratedDraft.customSelectedLaneIds
            : routeCustomSelectedLaneIds,
        );
        setCurrentStepId(hydratedDraft.currentStepId);
        setUnlockedStepCount(hydratedDraft.unlockedStepCount);
        setObservedAt(hydratedDraft.observedAt);
        setNotes(hydratedDraft.notes);
        setStockView(hydratedDraft.stockView);
        setRows(hydratedDraft.rows);
        setRetailSalesChoice(hydratedDraft.retailSalesChoice);
        setServiceSalesChoice(hydratedDraft.serviceSalesChoice);
        setRetailSalesDrafts(hydratedDraft.retailSalesDrafts);
        setServiceSalesDrafts(hydratedDraft.serviceSalesDrafts);
        setCustomerPendingMode(hydratedDraft.customerPendingMode);
        setCustomerCompletedMode(hydratedDraft.customerCompletedMode);
        setSupplierPendingMode(hydratedDraft.supplierPendingMode);
        setSupplierReceiptMode(hydratedDraft.supplierReceiptMode);
        setCustomerTicketMode(hydratedDraft.customerTicketMode);
        setSupplierTicketMode(hydratedDraft.supplierTicketMode);
        setSelectedCustomerTicketId(hydratedDraft.selectedCustomerTicketId);
        setSelectedSupplierTicketId(hydratedDraft.selectedSupplierTicketId);
        setSupplierTicketUpdateAction(hydratedDraft.supplierTicketUpdateAction);
        setCustomerIdentity(hydratedDraft.customerIdentity);
        setSkuSignalDrafts(hydratedDraft.skuSignalDrafts);
        setRecordOrderExpectedArrivalDate(hydratedDraft.recordOrderExpectedArrivalDate);
        setRecordOrderLeadTimeMeanDays(hydratedDraft.recordOrderLeadTimeMeanDays);
        setRecordOrderLeadTimeVariability(hydratedDraft.recordOrderLeadTimeVariability);
        setRecordReceiptReceivedDate(hydratedDraft.recordReceiptReceivedDate);
        setDeliveryFeeAmount(hydratedDraft.deliveryFeeAmount);
        setDeliveryFeePayer(hydratedDraft.deliveryFeePayer);
        setDeliveryFeeBaselineAmount(hydratedDraft.deliveryFeeAmount);
        setDeliveryFeeBaselinePayer(hydratedDraft.deliveryFeePayer);
        setStockStepChoices(hydratedDraft.stockStepChoices);
        setServiceSignalDrafts(hydratedDraft.serviceSignalDrafts);
        setRegimeHint(hydratedDraft.regimeHint);
        setServiceRankings(hydratedDraft.serviceRankings);
        setRetailRankings(hydratedDraft.retailRankings);
        setRefundStockReturnDrafts(hydratedDraft.refundStockReturnDrafts);
        setHasSavedDraft(true);
        setDraftWasRestored(true);
        return;
      }

      removeStockUpdateDraft(draftStorageKey);
      setHasSavedDraft(false);
      setDraftWasRestored(false);
    }

    if (!hasAnyLiveDraft && !editSession) {
      setRows(baselineRows);
    }
  }, [activeStepOrder, buildOrderedInitialRows, currency, draftStorageKey, editSession, hasAnyLiveDraft, incomingEditSession, lane.id, location.pathname, navigate, observations, routeCustomSelectedLaneIds, usdToKhrExchangeRate, workingCatalog]);

  useEffect(() => {
    if (!(catalog ?? visibleCatalog) || !draftHydrationCheckedRef.current || !incomingEditSession) {
      return;
    }

    const nextEditSession = {
      observationId: incomingEditSession.observationId,
      input: incomingEditSession.input,
    } satisfies EditSessionState;
    if (editSession?.observationId === nextEditSession.observationId) {
      navigate(location.pathname, { replace: true, state: null });
      return;
    }
    if (pendingEditSession?.observationId === nextEditSession.observationId) {
      return;
    }
    if (hasAnyLiveDraft) {
      setPendingEditSession(nextEditSession);
      setReplaceDraftDialogOpen(true);
      return;
    }

    hydrateEditSession(nextEditSession, buildOrderedInitialRows(catalog ?? visibleCatalog));
  }, [
    buildOrderedInitialRows,
    catalog,
    editSession?.observationId,
    hasAnyLiveDraft,
    incomingEditSession,
    location.pathname,
    navigate,
    observations,
    pendingEditSession?.observationId,
    visibleCatalog,
  ]);

  useEffect(() => {
    latestDraftStateRef.current = draftState;
    if (!hasMeaningfulChanges) {
      skipNextDraftPersistRef.current = false;
    }
  }, [draftState, hasMeaningfulChanges]);

  useEffect(() => {
    const previous = previousMoneyPreferencesRef.current;
    if (previous.currency === currency && previous.usdToKhrExchangeRate === usdToKhrExchangeRate) {
      return;
    }

    setServiceSignalDrafts((current) =>
      Object.fromEntries(
        Object.entries(current).map(([serviceId, draft]) => [
          serviceId,
          {
            ...draft,
            price: reformatMoneyDraftValue({
              value: draft.price,
              previousCurrency: previous.currency,
              previousUsdToKhrExchangeRate: previous.usdToKhrExchangeRate,
              nextCurrency: currency,
              nextUsdToKhrExchangeRate: usdToKhrExchangeRate,
            }),
          },
        ]),
      ),
    );
    setDeliveryFeeAmount((current) =>
      reformatMoneyDraftValue({
        value: current,
        previousCurrency: previous.currency,
        previousUsdToKhrExchangeRate: previous.usdToKhrExchangeRate,
        nextCurrency: currency,
        nextUsdToKhrExchangeRate: usdToKhrExchangeRate,
      }),
    );
    setDeliveryFeeBaselineAmount((current) =>
      reformatMoneyDraftValue({
        value: current,
        previousCurrency: previous.currency,
        previousUsdToKhrExchangeRate: previous.usdToKhrExchangeRate,
        nextCurrency: currency,
        nextUsdToKhrExchangeRate: usdToKhrExchangeRate,
      }),
    );
    previousMoneyPreferencesRef.current = { currency, usdToKhrExchangeRate };
  }, [currency, usdToKhrExchangeRate]);

  useEffect(() => {
    function persistLatestDraft() {
      if (skipNextDraftPersistRef.current) {
        skipNextDraftPersistRef.current = false;
        return;
      }
      const latestState = latestDraftStateRef.current;
      if (latestState) {
        writeStockUpdateDraft(latestState, draftStorageKey);
      }
    }

    function handleBeforeUnload() {
      persistLatestDraft();
    }

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      persistLatestDraft();
    };
  }, [draftStorageKey]);

  function updateRow(skuId: string, patch: Partial<StockRow>) {
    setRows((current) => current.map((row) => (row.skuId === skuId ? { ...row, ...patch } : row)));
  }

  function updateSkuSignalDraft(skuId: string, updater: (draft: SkuSignalDraft) => SkuSignalDraft) {
    setSkuSignalDrafts((current) => ({
      ...current,
      [skuId]: updater(current[skuId] ?? createEmptySkuSignalDraft()),
    }));
  }

  function updateRetailSalesDraft(skuId: string, value: string) {
    setRetailSalesDrafts((current) => {
      if (value === '') {
        const next = { ...current };
        delete next[skuId];
        return next;
      }
      return { ...current, [skuId]: value };
    });
  }

  function updateServiceSalesDraft(serviceId: string, value: string) {
    setServiceSalesDrafts((current) => {
      if (value === '') {
        const next = { ...current };
        delete next[serviceId];
        return next;
      }
      return { ...current, [serviceId]: value };
    });
  }

  function updateRefundStockReturnDraft(skuId: string, value: RefundStockReturnChoice) {
    setRefundStockReturnDrafts((current) => ({ ...current, [skuId]: value }));
  }

  function updateServiceSignalDraft(serviceId: string, updater: (draft: ServiceSignalDraft) => ServiceSignalDraft) {
    setServiceSignalDrafts((current) => ({
      ...current,
      [serviceId]: updater(current[serviceId] ?? createEmptyServiceSignalDraft()),
    }));
  }

  function updateStockStepChoice(stepId: OptionalStockStepId, choice: OptionalStockStepChoice) {
    setStockStepChoices((current) => ({
      ...current,
      [stepId]: choice,
    }));
  }

  function resetCostStepRows() {
    setRows((current) => current.map((row) => ({ ...row, costPerUnit: baselineStockRow(workingCatalog, stockBySku, row.skuId).costPerUnit })));
  }

  function resetRetailPriceStepRows() {
    setRows((current) => current.map((row) => ({ ...row, productPrice: baselineStockRow(workingCatalog, stockBySku, row.skuId).productPrice })));
  }

  function resetSkuFlagRows() {
    setSkuSignalDrafts((current) => (lane.id === 'supplier-order-pending' || lane.id === 'supplier-receipt' ? skuWithoutEventDrafts(current) : {}));
  }

  function handleSkipOptionalStockStep(stepId: OptionalStockStepId) {
    const shouldAdvanceAfterSkip = stockStepChoices[stepId] === 'unset';
    updateStockStepChoice(stepId, 'no');
    if (stepId === 'stock-cost') {
      resetCostStepRows();
    }
    if (stepId === 'stock-price') {
      resetRetailPriceStepRows();
    }
    if (stepId === 'stock-flags') {
      resetSkuFlagRows();
    }
    if (!shouldAdvanceAfterSkip) {
      return;
    }
    const targetIndex = activeStepOrder.indexOf(stepId);
    if (targetIndex >= 0 && targetIndex < activeStepOrder.length - 1) {
      const nextIndex = targetIndex + 1;
      setUnlockedStepCount((current) => Math.max(current, nextIndex + 1));
      setCurrentStepId(activeStepOrder[nextIndex]!);
    }
  }

  function ticketLinesFromCommercialEvents(payload: SenaObservationInput, party: 'customer' | 'supplier') {
    return (payload.commercialEvents ?? [])
      .filter((event) => event.party === party)
      .map((event) => ({
        entityType: event.entityType,
        entityId: event.entityId,
        quantityDelta: event.quantityDelta,
        note: event.note ?? null,
      }));
  }

  function ticketLinesFromSupplierSignals(payload: SenaObservationInput) {
    return payload.orderSignals.flatMap((signal) => {
      if (!signal.orderPlaced && !signal.receiptArrived) {
        return [];
      }
      return [{
        entityType: 'sku' as const,
        entityId: signal.skuId,
        orderedQuantity: signal.approximateOrderQuantity,
        receivedQuantity: signal.approximateReceiptQuantity,
        expectedArrivalAt: signal.receiptTimestamp ?? null,
      }];
    });
  }

  function finalizeTicketPayload(payload: SenaObservationInput) {
    const observedAtValue = payload.observedAt || observedAtIso || new Date().toISOString();
    const nextTicketEvents: SenaTicketEvent[] = [...(payload.ticketEvents ?? [])];
    payload.deliveryFee = activeDeliveryFeeMetadata;

    if (isCustomerPendingLane) {
      const lines = ticketLinesFromCommercialEvents(payload, 'customer');
      if (lines.length > 0) {
        const eventType: SenaTicketEventType =
          customerPendingMode === 'cancel_pending'
            ? 'canceled'
            : (customerTicketMode ?? 'new') === 'edit' || customerPendingMode === 'modify_pending'
              ? 'revised'
              : 'created';
        const lifecycle: SenaTicketLifecycle = eventType === 'canceled' ? 'canceled' : 'open';
        const stage: SenaTicketStage = 'pending';
        nextTicketEvents.push({
          ticketId: selectedCustomerTicketId ?? makeTicketId({ eventType, family: 'customer', lines, observedAt: observedAtValue }),
          ticketFamily: 'customer',
          lifecycle,
          stage,
          revision: selectedCustomerTicketId ? 2 : 1,
          eventType,
          occurredAt: observedAtValue,
          nextTouchAt: null,
          party: buildTicketPartyMetadata(customerIdentity),
          lines,
          deliveryFee: activeDeliveryFeeMetadata,
          note: notes.trim() || null,
        });
      }
    }

    if (isCustomerCompletedLane) {
      const lines = ticketLinesFromCommercialEvents(payload, 'customer');
      if (lines.length > 0) {
        nextTicketEvents.push({
          ticketId: makeTicketId({ eventType: 'fulfilled_immediate', family: 'customer', lines, observedAt: observedAtValue }),
          ticketFamily: 'customer',
          lifecycle: 'resolved',
          stage: 'fulfilled_immediate',
          revision: 1,
          eventType: 'fulfilled_immediate',
          occurredAt: observedAtValue,
          nextTouchAt: null,
          party: buildTicketPartyMetadata(customerIdentity),
          lines,
          deliveryFee: activeDeliveryFeeMetadata,
          note: notes.trim() || null,
        });
      }
    }

    if (isSupplierPendingLane || isSupplierReceiptLane) {
      const commercialLines = ticketLinesFromCommercialEvents(payload, 'supplier');
      const signalLines = ticketLinesFromSupplierSignals(payload);
      const lines = commercialLines.length > 0 ? commercialLines : signalLines;
      if (lines.length > 0) {
        const hasReceipt = payload.orderSignals.some((signal) => signal.receiptArrived);
        const eventType: SenaTicketEventType =
          supplierPendingMode === 'cancel_supplier_order' || supplierTicketUpdateAction === 'canceled'
            ? 'canceled'
            : hasReceipt
              ? supplierTicketUpdateAction === 'fully_received'
                ? 'fully_received'
                : 'partial_received'
              : supplierTicketUpdateAction === 'revise_eta'
                ? 'eta_updated'
                : supplierTicketUpdateAction === 'followup_logged'
                  ? 'followup_logged'
                  : (supplierTicketMode ?? 'new') === 'edit' || supplierPendingMode === 'update_pending_supplier_order'
                    ? 'revised'
                    : 'created';
        const lifecycle: SenaTicketLifecycle =
          eventType === 'canceled'
            ? 'canceled'
            : eventType === 'fully_received'
              ? 'resolved'
              : 'open';
        const stage: SenaTicketStage =
          eventType === 'fully_received'
            ? 'received'
            : eventType === 'partial_received'
              ? 'partial_received'
              : eventType === 'canceled'
                ? 'ordered_waiting'
                : 'ordered_waiting';
        nextTicketEvents.push({
          ticketId: selectedSupplierTicketId ?? makeTicketId({ eventType, family: 'supplier', lines, observedAt: observedAtValue }),
          ticketFamily: 'supplier',
          lifecycle,
          stage,
          revision: selectedSupplierTicketId ? 2 : 1,
          eventType,
          occurredAt: observedAtValue,
          nextTouchAt: recordOrderExpectedArrivalDate ? dateInputToIso(recordOrderExpectedArrivalDate) : null,
          party: {
            role: 'supplier',
            supplierName: workingCatalog?.skus.find((sku) => sku.skuId === lines[0]?.entityId)?.supplierName ?? null,
          },
          lines,
          deliveryFee: activeDeliveryFeeMetadata,
          note: notes.trim() || null,
        });
      }
    }

    payload.ticketEvents = nextTicketEvents;
    return payload;
  }

  function buildPayload() {
    if (isCustomLane) {
      const payload = createEmptyObservationInput({
        observedAt: observedAtIso ?? new Date().toISOString(),
        notes: notes.trim() || null,
      });

      if (isCustomerPendingLane) {
        (payload.commercialEvents ??= []).push(
          ...retailSkuIds.flatMap((skuId) => {
            const value = retailSalesDrafts[skuId]?.trim();
            if (!value) {
              return [];
            }
            const quantity = Number(value);
            if (!Number.isFinite(quantity) || quantity < 0) {
              return [];
            }
            const previousOpen = latestCustomerPendingBySku.get(skuId) ?? 0;
            const quantityDelta =
              customerPendingMode === 'cancel_pending'
                ? -Math.min(previousOpen, quantity)
                : customerPendingMode === 'modify_pending'
                  ? quantity - previousOpen
                  : quantity;
            if (quantityDelta === 0) {
              return [];
            }
            return [{
              party: 'customer' as const,
              entityType: 'sku' as const,
              entityId: skuId,
              stage: 'pending' as const,
              quantityDelta,
              flow: 'scheduled' as const,
              reason: customerPendingMode,
              note: notes.trim() || null,
            }];
          }),
          ...serviceIds.flatMap((serviceId) => {
            const value = serviceSalesDrafts[serviceId]?.trim();
            if (!value) {
              return [];
            }
            const quantity = Number(value);
            if (!Number.isFinite(quantity) || quantity < 0) {
              return [];
            }
            const previousOpen = latestCustomerPendingByService.get(serviceId) ?? 0;
            const quantityDelta =
              customerPendingMode === 'cancel_pending'
                ? -Math.min(previousOpen, quantity)
                : customerPendingMode === 'modify_pending'
                  ? quantity - previousOpen
                  : quantity;
            if (quantityDelta === 0) {
              return [];
            }
            return [{
              party: 'customer' as const,
              entityType: 'service' as const,
              entityId: serviceId,
              stage: 'pending' as const,
              quantityDelta,
              flow: 'scheduled' as const,
              reason: customerPendingMode,
              note: notes.trim() || null,
            }];
          }),
        );
      }

      if (isCustomerCompletedLane) {
        const retailSalesSnapshot = retailSkuIds.flatMap((skuId) => {
          const value = retailSalesDrafts[skuId]?.trim();
          if (!value) {
            return [];
          }
          return [{ skuId, unitsSold: Number(value) }];
        }).filter((entry) => Number.isFinite(entry.unitsSold) && entry.unitsSold >= 0);
        const serviceSalesSnapshot = serviceIds.flatMap((serviceId) => {
          const value = serviceSalesDrafts[serviceId]?.trim();
          if (!value) {
            return [];
          }
          return [{ serviceId, unitsSold: Number(value) }];
        }).filter((entry) => Number.isFinite(entry.unitsSold) && entry.unitsSold >= 0);
        const derivedRetailRankings = [...retailSalesSnapshot]
          .sort((left, right) => right.unitsSold - left.unitsSold || left.skuId.localeCompare(right.skuId))
          .map((entry) => entry.skuId);
        const derivedServiceRankings = [...serviceSalesSnapshot]
          .sort((left, right) => right.unitsSold - left.unitsSold || left.serviceId.localeCompare(right.serviceId))
          .map((entry) => entry.serviceId);
        if (customerCompletedMode !== 'refund_reversal') {
          payload.retailSalesSnapshot = retailSalesSnapshot;
          payload.serviceSalesSnapshot = serviceSalesSnapshot;
        }
        payload.retailRankings = retailSalesChoice === 'yes' ? derivedRetailRankings : retailRankings;
        payload.serviceRankings = serviceSalesChoice === 'yes' ? derivedServiceRankings : serviceRankings;
        (payload.adjustmentSignals ??= []).push(
          ...retailSkuIds.flatMap((skuId) => {
            if (customerCompletedMode !== 'refund_reversal' || refundStockReturnDrafts[skuId] !== 'now') {
              return [];
            }
            const value = retailSalesDrafts[skuId]?.trim();
            if (!value) {
              return [];
            }
            const quantity = Number(value);
            if (!Number.isFinite(quantity) || quantity <= 0) {
              return [];
            }
            return [{
              skuId,
              quantityDelta: quantity,
              reason: 'return_to_stock',
            }];
          }),
        );
        (payload.commercialEvents ??= []).push(
          ...retailSkuIds.flatMap((skuId) => {
            const value = retailSalesDrafts[skuId]?.trim();
            if (!value) {
              return [];
            }
            const quantity = Number(value);
            if (!Number.isFinite(quantity) || quantity <= 0) {
              return [];
            }
            const pendingBefore = latestCustomerPendingBySku.get(skuId) ?? 0;
            const realizedDelta = customerCompletedMode === 'refund_reversal' ? -quantity : quantity;
            return [
              ...(customerCompletedMode === 'from_pending' && quantity > 0
                ? [{
                    party: 'customer' as const,
                    entityType: 'sku' as const,
                    entityId: skuId,
                    stage: 'pending' as const,
                    quantityDelta: -Math.min(pendingBefore, quantity),
                    flow: 'scheduled' as const,
                    reason: customerCompletedMode,
                    note: notes.trim() || null,
                  }]
                : []),
              {
                party: 'customer' as const,
                entityType: 'sku' as const,
                entityId: skuId,
                stage: 'realized' as const,
                quantityDelta: realizedDelta,
                flow:
                  customerCompletedMode === 'immediate_sale'
                    ? ('immediate' as const)
                    : customerCompletedMode === 'refund_reversal'
                      ? ('reversal' as const)
                      : ('scheduled' as const),
                reason: customerCompletedMode,
                note: notes.trim() || null,
              },
            ];
          }),
          ...serviceIds.flatMap((serviceId) => {
            const value = serviceSalesDrafts[serviceId]?.trim();
            if (!value) {
              return [];
            }
            const quantity = Number(value);
            if (!Number.isFinite(quantity) || quantity <= 0) {
              return [];
            }
            const pendingBefore = latestCustomerPendingByService.get(serviceId) ?? 0;
            const realizedDelta = customerCompletedMode === 'refund_reversal' ? -quantity : quantity;
            return [
              ...(customerCompletedMode === 'from_pending' && quantity > 0
                ? [{
                    party: 'customer' as const,
                    entityType: 'service' as const,
                    entityId: serviceId,
                    stage: 'pending' as const,
                    quantityDelta: -Math.min(pendingBefore, quantity),
                    flow: 'scheduled' as const,
                    reason: customerCompletedMode,
                    note: notes.trim() || null,
                  }]
                : []),
              {
                party: 'customer' as const,
                entityType: 'service' as const,
                entityId: serviceId,
                stage: 'realized' as const,
                quantityDelta: realizedDelta,
                flow:
                  customerCompletedMode === 'immediate_sale'
                    ? ('immediate' as const)
                    : customerCompletedMode === 'refund_reversal'
                      ? ('reversal' as const)
                      : ('scheduled' as const),
                reason: customerCompletedMode,
                note: notes.trim() || null,
              },
            ];
          }),
        );
      }

      if (isSupplierPendingLane) {
        const tableMeanDays =
          recordOrderLeadTimeMeanDays.trim() === ''
            ? null
            : Number(recordOrderLeadTimeMeanDays);
        const orderedEntries = Object.entries(visibleSkuSignalDrafts).filter(([, draft]) => {
          const quantity = draft.orderedQuantity.trim();
          return quantity !== '' && Number(quantity) > 0;
        });
        payload.orderSignals.push(
          ...(supplierPendingMode === 'cancel_supplier_order'
            ? []
            : Object.entries(visibleSkuSignalDrafts).flatMap(([skuId, draft]) => {
                const signals = [];
                const quantity = draft.orderedQuantity.trim();
                if (quantity !== '' && Number(quantity) > 0) {
                  signals.push({
                    skuId,
                    orderPlaced: true,
                    receiptArrived: false,
                    approximateOrderQuantity: Number(quantity),
                    approximateReceiptQuantity: null,
                    placementTimestamp: observedAtIso ?? new Date().toISOString(),
                    receiptTimestamp: dateInputToIso(recordOrderExpectedArrivalDate),
                    leadTimeDaysHint: tableMeanDays,
                  });
                }
                const receivedQuantity = draft.receiptQuantity.trim();
                if (receivedQuantity !== '' && Number(receivedQuantity) > 0) {
                  signals.push({
                    skuId,
                    orderPlaced: false,
                    receiptArrived: true,
                    approximateOrderQuantity: null,
                    approximateReceiptQuantity: Number(receivedQuantity),
                    receiptTimestamp: dateInputToIso(recordReceiptReceivedDate) ?? observedAtIso,
                  });
                }
                return signals;
              })),
        );
        payload.leadTimeHints.push(
          ...(supplierPendingMode === 'cancel_supplier_order'
            ? []
            : orderedEntries.flatMap(([skuId]) => {
                const variabilityClass =
                  recordOrderLeadTimeVariability ||
                  (tableMeanDays != null ? leadTimeVariabilityDefaults.get(skuId) : null) ||
                  null;
                if ((tableMeanDays == null || !Number.isFinite(tableMeanDays) || tableMeanDays < 0) && variabilityClass == null) {
                  return [];
                }
                const compatibilityRange = compatibilityRangeForClass(tableMeanDays, variabilityClass);
                return [{
                  skuId,
                  typicalDays: tableMeanDays,
                  lowDays: compatibilityRange?.lowDays ?? null,
                  highDays: compatibilityRange?.highDays ?? null,
                  variabilityClass,
                }];
              })),
        );
        (payload.commercialEvents ??= []).push(
          ...Object.entries(visibleSkuSignalDrafts).flatMap(([skuId, draft]) => {
            const quantity = draft.orderedQuantity.trim();
            const receiptQuantity = draft.receiptQuantity.trim();
            const events = [];
            if (quantity !== '' && Number(quantity) > 0) {
              events.push({
                party: 'supplier' as const,
                entityType: 'sku' as const,
                entityId: skuId,
                stage: 'pending' as const,
                quantityDelta: supplierPendingMode === 'cancel_supplier_order' ? -Number(quantity) : Number(quantity),
                flow: 'scheduled' as const,
                reason: supplierPendingMode,
                note: notes.trim() || null,
              });
            }
            if (receiptQuantity !== '' && Number(receiptQuantity) > 0) {
              const numericReceipt = Number(receiptQuantity);
              events.push(
                {
                  party: 'supplier' as const,
                  entityType: 'sku' as const,
                  entityId: skuId,
                  stage: 'pending' as const,
                  quantityDelta: -numericReceipt,
                  flow: 'scheduled' as const,
                  reason: supplierTicketUpdateAction,
                  note: notes.trim() || null,
                },
                {
                  party: 'supplier' as const,
                  entityType: 'sku' as const,
                  entityId: skuId,
                  stage: 'realized' as const,
                  quantityDelta: numericReceipt,
                  flow: 'scheduled' as const,
                  reason: supplierTicketUpdateAction,
                  note: notes.trim() || null,
                },
              );
            }
            return events;
          }),
        );
      }

      if (isSupplierReceiptLane) {
        payload.orderSignals.push(
          ...(supplierReceiptMode === 'return_receipt_reversal'
            ? []
            : Object.entries(visibleSkuSignalDrafts).flatMap(([skuId, draft]) => {
                const quantity = draft.receiptQuantity.trim();
                if (quantity === '' || Number(quantity) <= 0) {
                  return [];
                }
                return [{
                  skuId,
                  orderPlaced: false,
                  receiptArrived: true,
                  approximateOrderQuantity: null,
                  approximateReceiptQuantity: Number(quantity),
                  receiptTimestamp: dateInputToIso(recordReceiptReceivedDate),
                }];
              })),
        );
        (payload.commercialEvents ??= []).push(
          ...Object.entries(visibleSkuSignalDrafts).flatMap(([skuId, draft]) => {
            const quantity = draft.receiptQuantity.trim();
            if (quantity === '' || Number(quantity) <= 0) {
              return [];
            }
            const numericQuantity = Number(quantity);
            return [
              ...(supplierReceiptMode === 'against_pending_supplier_order'
                ? [{
                    party: 'supplier' as const,
                    entityType: 'sku' as const,
                    entityId: skuId,
                    stage: 'pending' as const,
                    quantityDelta: -numericQuantity,
                    flow: 'scheduled' as const,
                    reason: supplierReceiptMode,
                    note: notes.trim() || null,
                  }]
                : []),
              {
                party: 'supplier' as const,
                entityType: 'sku' as const,
                entityId: skuId,
                stage: 'realized' as const,
                quantityDelta: supplierReceiptMode === 'return_receipt_reversal' ? -numericQuantity : numericQuantity,
                flow:
                  supplierReceiptMode === 'immediate_purchase'
                    ? ('immediate' as const)
                    : supplierReceiptMode === 'return_receipt_reversal'
                      ? ('reversal' as const)
                      : ('scheduled' as const),
                reason: supplierReceiptMode,
                note: notes.trim() || null,
              },
            ];
          }),
        );
      }

      if (hasStockCountLane) {
        payload.stockSnapshot = rows.filter((row) =>
          editSession
            ? shouldIncludeStockRowInEditPayload({ editSession, row, stockBySku })
            : stockRowChanged(catalog, stockBySku, row),
        );
        if (!isSupplierPendingLane && !isSupplierReceiptLane) {
          payload.orderSignals.push(
            ...Object.entries(visibleSkuSignalDrafts).flatMap(([skuId, draft]) => {
              const nextSignals = [];
              if (draft.orderEnabled && Number(draft.orderedQuantity) > 0) {
                nextSignals.push({
                  skuId,
                  orderPlaced: true,
                  receiptArrived: false,
                  approximateOrderQuantity: Number(draft.orderedQuantity),
                  approximateReceiptQuantity: null,
                });
              }
              if (draft.receiptEnabled && Number(draft.receiptQuantity) > 0) {
                nextSignals.push({
                  skuId,
                  orderPlaced: false,
                  receiptArrived: true,
                  approximateOrderQuantity: null,
                  approximateReceiptQuantity: Number(draft.receiptQuantity),
                });
              }
              return nextSignals;
            }),
          );
        }
        payload.servicePrices = Object.entries(serviceSignalDrafts)
          .filter(([serviceId, draft]) =>
            serviceDisplayPriceChanged(catalog, serviceId, draft, currency, usdToKhrExchangeRate),
          )
          .map(([serviceId, draft]) => ({
            serviceId,
            price: usdMoneyFromDisplay(Number(draft.price), currency, usdToKhrExchangeRate),
          }));
        payload.serviceStockouts = Object.entries(serviceSignalDrafts)
          .filter(([, draft]) => draft.blockedEnabled && Boolean(draft.blockedState))
          .map(([serviceId]) => serviceId);
      }

      payload.retailStockouts = [
        ...new Set([
          ...payload.retailStockouts,
          ...Object.entries(visibleSkuSignalDrafts)
            .filter(([skuId, draft]) => draft.blockedEnabled && Boolean(draft.blockedState) && Boolean(workingCatalog?.skus.find((sku) => sku.skuId === skuId)?.soldAsProduct))
            .map(([skuId]) => skuId),
        ]),
      ];
      payload.regimeHint = regimeHint || null;
      return finalizeTicketPayload(payload);
    }

    if (lane.id === 'customer-order-pending') {
      const payload = createEmptyObservationInput({
        observedAt: observedAtIso ?? new Date().toISOString(),
        notes: notes.trim() || null,
      });
      payload.commercialEvents = [
        ...retailSkuIds.flatMap((skuId) => {
          const value = retailSalesDrafts[skuId]?.trim();
          if (!value) {
            return [];
          }
          const quantity = Number(value);
          if (!Number.isFinite(quantity) || quantity < 0) {
            return [];
          }
          const previousOpen = latestCustomerPendingBySku.get(skuId) ?? 0;
          const quantityDelta =
            customerPendingMode === 'cancel_pending'
              ? -Math.min(previousOpen, quantity)
              : customerPendingMode === 'modify_pending'
                ? quantity - previousOpen
                : quantity;
          if (quantityDelta === 0) {
            return [];
          }
          return [{
            party: 'customer' as const,
            entityType: 'sku' as const,
            entityId: skuId,
            stage: 'pending' as const,
            quantityDelta,
            flow: 'scheduled' as const,
            reason: customerPendingMode,
            note: notes.trim() || null,
          }];
        }),
        ...serviceIds.flatMap((serviceId) => {
          const value = serviceSalesDrafts[serviceId]?.trim();
          if (!value) {
            return [];
          }
          const quantity = Number(value);
          if (!Number.isFinite(quantity) || quantity < 0) {
            return [];
          }
          const previousOpen = latestCustomerPendingByService.get(serviceId) ?? 0;
          const quantityDelta =
            customerPendingMode === 'cancel_pending'
              ? -Math.min(previousOpen, quantity)
              : customerPendingMode === 'modify_pending'
                ? quantity - previousOpen
                : quantity;
          if (quantityDelta === 0) {
            return [];
          }
          return [{
            party: 'customer' as const,
            entityType: 'service' as const,
            entityId: serviceId,
            stage: 'pending' as const,
            quantityDelta,
            flow: 'scheduled' as const,
            reason: customerPendingMode,
            note: notes.trim() || null,
          }];
        }),
      ];
      payload.regimeHint = regimeHint || null;
      return finalizeTicketPayload(payload);
    }
    if (lane.id === 'customer-order-completed') {
      const payload = createEmptyObservationInput({
        observedAt: observedAtIso ?? new Date().toISOString(),
        notes: notes.trim() || null,
      });
      const retailSalesSnapshot = retailSkuIds.flatMap((skuId) => {
        const value = retailSalesDrafts[skuId]?.trim();
        if (!value) {
          return [];
        }
        return [{ skuId, unitsSold: Number(value) }];
      }).filter((entry) => Number.isFinite(entry.unitsSold) && entry.unitsSold >= 0);
      const serviceSalesSnapshot = serviceIds.flatMap((serviceId) => {
        const value = serviceSalesDrafts[serviceId]?.trim();
        if (!value) {
          return [];
        }
        return [{ serviceId, unitsSold: Number(value) }];
      }).filter((entry) => Number.isFinite(entry.unitsSold) && entry.unitsSold >= 0);
      const derivedRetailRankings = [...retailSalesSnapshot]
        .sort((left, right) => right.unitsSold - left.unitsSold || left.skuId.localeCompare(right.skuId))
        .map((entry) => entry.skuId);
      const derivedServiceRankings = [...serviceSalesSnapshot]
        .sort((left, right) => right.unitsSold - left.unitsSold || left.serviceId.localeCompare(right.serviceId))
        .map((entry) => entry.serviceId);
      if (customerCompletedMode !== 'refund_reversal') {
        payload.retailSalesSnapshot = retailSalesSnapshot;
        payload.serviceSalesSnapshot = serviceSalesSnapshot;
      }
      payload.retailRankings = retailSalesChoice === 'yes' ? derivedRetailRankings : retailRankings;
      payload.serviceRankings = serviceSalesChoice === 'yes' ? derivedServiceRankings : serviceRankings;
      payload.retailStockouts = Object.entries(visibleSkuSignalDrafts)
        .filter(([skuId, draft]) => draft.blockedEnabled && Boolean(workingCatalog?.skus.find((sku) => sku.skuId === skuId)?.soldAsProduct))
        .map(([skuId]) => skuId);
      payload.serviceStockouts = [];
      payload.adjustmentSignals = retailSkuIds.flatMap((skuId) => {
        if (customerCompletedMode !== 'refund_reversal' || refundStockReturnDrafts[skuId] !== 'now') {
          return [];
        }
        const value = retailSalesDrafts[skuId]?.trim();
        if (!value) {
          return [];
        }
        const quantity = Number(value);
        if (!Number.isFinite(quantity) || quantity <= 0) {
          return [];
        }
        return [{
          skuId,
          quantityDelta: quantity,
          reason: 'return_to_stock',
        }];
      });
      payload.commercialEvents = [
        ...retailSkuIds.flatMap((skuId) => {
          const value = retailSalesDrafts[skuId]?.trim();
          if (!value) {
            return [];
          }
          const quantity = Number(value);
          if (!Number.isFinite(quantity) || quantity <= 0) {
            return [];
          }
          const pendingBefore = latestCustomerPendingBySku.get(skuId) ?? 0;
          const realizedDelta = customerCompletedMode === 'refund_reversal' ? -quantity : quantity;
          return [
            ...(customerCompletedMode === 'from_pending' && quantity > 0
              ? [{
                  party: 'customer' as const,
                  entityType: 'sku' as const,
                  entityId: skuId,
                  stage: 'pending' as const,
                  quantityDelta: -Math.min(pendingBefore, quantity),
                  flow: 'scheduled' as const,
                  reason: customerCompletedMode,
                  note: notes.trim() || null,
                }]
              : []),
            {
              party: 'customer' as const,
              entityType: 'sku' as const,
              entityId: skuId,
              stage: 'realized' as const,
              quantityDelta: realizedDelta,
              flow:
                customerCompletedMode === 'immediate_sale'
                  ? ('immediate' as const)
                  : customerCompletedMode === 'refund_reversal'
                    ? ('reversal' as const)
                    : ('scheduled' as const),
              reason: customerCompletedMode,
              note: notes.trim() || null,
            },
          ];
        }),
        ...serviceIds.flatMap((serviceId) => {
          const value = serviceSalesDrafts[serviceId]?.trim();
          if (!value) {
            return [];
          }
          const quantity = Number(value);
          if (!Number.isFinite(quantity) || quantity <= 0) {
            return [];
          }
          const pendingBefore = latestCustomerPendingByService.get(serviceId) ?? 0;
          const realizedDelta = customerCompletedMode === 'refund_reversal' ? -quantity : quantity;
          return [
            ...(customerCompletedMode === 'from_pending' && quantity > 0
              ? [{
                  party: 'customer' as const,
                  entityType: 'service' as const,
                  entityId: serviceId,
                  stage: 'pending' as const,
                  quantityDelta: -Math.min(pendingBefore, quantity),
                  flow: 'scheduled' as const,
                  reason: customerCompletedMode,
                  note: notes.trim() || null,
                }]
              : []),
            {
              party: 'customer' as const,
              entityType: 'service' as const,
              entityId: serviceId,
              stage: 'realized' as const,
              quantityDelta: realizedDelta,
              flow:
                customerCompletedMode === 'immediate_sale'
                  ? ('immediate' as const)
                  : customerCompletedMode === 'refund_reversal'
                    ? ('reversal' as const)
                    : ('scheduled' as const),
              reason: customerCompletedMode,
              note: notes.trim() || null,
            },
          ];
        }),
      ];
      payload.regimeHint = regimeHint || null;
      return finalizeTicketPayload(payload);
    }
    if (lane.id === 'supplier-order-pending') {
      const payload = createEmptyObservationInput({
        observedAt: observedAtIso ?? new Date().toISOString(),
        notes: notes.trim() || null,
      });
      const tableMeanDays =
        recordOrderLeadTimeMeanDays.trim() === ''
          ? null
          : Number(recordOrderLeadTimeMeanDays);
      const orderedEntries = Object.entries(visibleSkuSignalDrafts).filter(([, draft]) => {
        const quantity = draft.orderedQuantity.trim();
        return quantity !== '' && Number(quantity) > 0;
      });
      payload.orderSignals = supplierPendingMode === 'cancel_supplier_order' ? [] : Object.entries(visibleSkuSignalDrafts).flatMap(([skuId, draft]) => {
        const signals = [];
        const orderedQuantity = draft.orderedQuantity.trim();
        if (orderedQuantity !== '' && Number(orderedQuantity) > 0) {
          signals.push({
            skuId,
            orderPlaced: true,
            receiptArrived: false,
            approximateOrderQuantity: Number(orderedQuantity),
            approximateReceiptQuantity: null,
            placementTimestamp: observedAtIso ?? new Date().toISOString(),
            receiptTimestamp: dateInputToIso(recordOrderExpectedArrivalDate),
            leadTimeDaysHint: tableMeanDays,
          });
        }
        const receivedQuantity = draft.receiptQuantity.trim();
        if (receivedQuantity !== '' && Number(receivedQuantity) > 0) {
          signals.push({
            skuId,
            orderPlaced: false,
            receiptArrived: true,
            approximateOrderQuantity: null,
            approximateReceiptQuantity: Number(receivedQuantity),
            receiptTimestamp: dateInputToIso(recordReceiptReceivedDate) ?? observedAtIso,
          });
        }
        return signals;
      });
      payload.leadTimeHints = supplierPendingMode === 'cancel_supplier_order' ? [] : orderedEntries.flatMap(([skuId]) => {
        const variabilityClass =
          recordOrderLeadTimeVariability ||
          (tableMeanDays != null ? leadTimeVariabilityDefaults.get(skuId) : null) ||
          null;
        if ((tableMeanDays == null || !Number.isFinite(tableMeanDays) || tableMeanDays < 0) && variabilityClass == null) {
          return [];
        }
        const compatibilityRange = compatibilityRangeForClass(tableMeanDays, variabilityClass);
        return [{
          skuId,
          typicalDays: tableMeanDays,
          lowDays: compatibilityRange?.lowDays ?? null,
          highDays: compatibilityRange?.highDays ?? null,
          variabilityClass,
        }];
      });
      payload.commercialEvents = Object.entries(visibleSkuSignalDrafts).flatMap(([skuId, draft]) => {
        const quantity = draft.orderedQuantity.trim();
        const receiptQuantity = draft.receiptQuantity.trim();
        const events = [];
        if (quantity !== '' && Number(quantity) > 0) {
          events.push({
          party: 'supplier' as const,
          entityType: 'sku' as const,
          entityId: skuId,
          stage: 'pending' as const,
          quantityDelta: supplierPendingMode === 'cancel_supplier_order' ? -Number(quantity) : Number(quantity),
          flow: 'scheduled' as const,
          reason: supplierPendingMode,
          note: notes.trim() || null,
          });
        }
        if (receiptQuantity !== '' && Number(receiptQuantity) > 0) {
          const numericReceipt = Number(receiptQuantity);
          events.push(
            {
              party: 'supplier' as const,
              entityType: 'sku' as const,
              entityId: skuId,
              stage: 'pending' as const,
              quantityDelta: -numericReceipt,
              flow: 'scheduled' as const,
              reason: supplierTicketUpdateAction,
              note: notes.trim() || null,
            },
            {
              party: 'supplier' as const,
              entityType: 'sku' as const,
              entityId: skuId,
              stage: 'realized' as const,
              quantityDelta: numericReceipt,
              flow: 'scheduled' as const,
              reason: supplierTicketUpdateAction,
              note: notes.trim() || null,
            },
          );
        }
        return events;
      });
      payload.retailStockouts = Object.entries(visibleSkuSignalDrafts)
        .filter(([skuId, draft]) => draft.blockedEnabled && Boolean(workingCatalog?.skus.find((sku) => sku.skuId === skuId)?.soldAsProduct))
        .map(([skuId]) => skuId);
      payload.regimeHint = regimeHint || null;
      return finalizeTicketPayload(payload);
    }
    if (lane.id === 'supplier-receipt') {
      const payload = createEmptyObservationInput({
        observedAt: observedAtIso ?? new Date().toISOString(),
        notes: notes.trim() || null,
      });
      payload.orderSignals = supplierReceiptMode === 'return_receipt_reversal' ? [] : Object.entries(visibleSkuSignalDrafts).flatMap(([skuId, draft]) => {
        const quantity = draft.receiptQuantity.trim();
        if (quantity === '' || Number(quantity) <= 0) {
          return [];
        }
        return [{
          skuId,
          orderPlaced: false,
          receiptArrived: true,
          approximateOrderQuantity: null,
          approximateReceiptQuantity: Number(quantity),
          receiptTimestamp: dateInputToIso(recordReceiptReceivedDate),
        }];
      });
      payload.commercialEvents = Object.entries(visibleSkuSignalDrafts).flatMap(([skuId, draft]) => {
        const quantity = draft.receiptQuantity.trim();
        if (quantity === '' || Number(quantity) <= 0) {
          return [];
        }
        const numericQuantity = Number(quantity);
        return [
          ...(supplierReceiptMode === 'against_pending_supplier_order'
            ? [{
                party: 'supplier' as const,
                entityType: 'sku' as const,
                entityId: skuId,
                stage: 'pending' as const,
                quantityDelta: -numericQuantity,
                flow: 'scheduled' as const,
                reason: supplierReceiptMode,
                note: notes.trim() || null,
              }]
            : []),
          {
            party: 'supplier' as const,
            entityType: 'sku' as const,
            entityId: skuId,
            stage: 'realized' as const,
            quantityDelta: supplierReceiptMode === 'return_receipt_reversal' ? -numericQuantity : numericQuantity,
            flow:
              supplierReceiptMode === 'immediate_purchase'
                ? ('immediate' as const)
                : supplierReceiptMode === 'return_receipt_reversal'
                  ? ('reversal' as const)
                  : ('scheduled' as const),
            reason: supplierReceiptMode,
            note: notes.trim() || null,
          },
        ];
      });
      payload.retailStockouts = Object.entries(visibleSkuSignalDrafts)
        .filter(([skuId, draft]) => draft.blockedEnabled && Boolean(workingCatalog?.skus.find((sku) => sku.skuId === skuId)?.soldAsProduct))
        .map(([skuId]) => skuId);
      payload.regimeHint = regimeHint || null;
      return finalizeTicketPayload(payload);
    }
    if (editSession) {
      return buildFullObservationPayload({
        currency,
        deliveryFee: activeDeliveryFeeMetadata,
        editSession,
        notes,
        observedAtIso,
        regimeHint,
        retailRankings,
        rows,
        serviceRankings,
        serviceSignalDrafts,
        skuSignalDrafts: visibleSkuSignalDrafts,
        usdToKhrExchangeRate,
        catalog: workingCatalog,
        stockBySku,
      });
    }
    const payload = createEmptyObservationInput({
      observedAt: observedAtIso ?? new Date().toISOString(),
      notes: notes.trim() || null,
    });
    payload.stockSnapshot = rows.filter((row) =>
      editSession
        ? shouldIncludeStockRowInEditPayload({ editSession, row, stockBySku })
        : stockRowChanged(catalog, stockBySku, row),
    );
    payload.serviceRankings = serviceRankings;
    payload.retailRankings = retailRankings;
    payload.orderSignals = Object.entries(visibleSkuSignalDrafts).flatMap(([skuId, draft]) => {
      const nextSignals = [];
      if (draft.orderEnabled && Number(draft.orderedQuantity) > 0) {
        nextSignals.push({
          skuId,
          orderPlaced: true,
          receiptArrived: false,
          approximateOrderQuantity: Number(draft.orderedQuantity),
          approximateReceiptQuantity: null,
        });
      }
      if (draft.receiptEnabled && Number(draft.receiptQuantity) > 0) {
        nextSignals.push({
          skuId,
          orderPlaced: false,
          receiptArrived: true,
          approximateOrderQuantity: null,
          approximateReceiptQuantity: Number(draft.receiptQuantity),
        });
      }
      return nextSignals;
    });
    payload.retailPrices = [];
    payload.servicePrices = Object.entries(serviceSignalDrafts)
      .filter(([serviceId, draft]) =>
        serviceDisplayPriceChanged(catalog, serviceId, draft, currency, usdToKhrExchangeRate),
      )
      .map(([serviceId, draft]) => ({
        serviceId,
        price: usdMoneyFromDisplay(Number(draft.price), currency, usdToKhrExchangeRate),
      }));
    payload.retailStockouts = Object.entries(visibleSkuSignalDrafts)
      .filter(([skuId, draft]) => draft.blockedEnabled && Boolean(draft.blockedState) && Boolean(workingCatalog?.skus.find((sku) => sku.skuId === skuId)?.soldAsProduct))
      .map(([skuId]) => skuId);
    payload.serviceStockouts = Object.entries(serviceSignalDrafts)
      .filter(([, draft]) => draft.blockedEnabled && Boolean(draft.blockedState))
      .map(([serviceId]) => serviceId);
    payload.adjustmentSignals = [];
    payload.regimeHint = regimeHint || null;
    return finalizeTicketPayload(payload);
  }

  const previewPayload = buildPayload();
  const previewParts = observationCompositionParts(previewPayload);
  const previewCounts = observationSignalCounts(previewPayload);
  const requiresFirstStockSnapshot = isFirstObservation && previewPayload.stockSnapshot.length === 0;
  const submitDisabled =
    isSaving ||
    (stockStepChoices['stock-flags'] === 'yes' && !skuFlagsValid) ||
    (lane.id !== 'stock-count' && !serviceFlagsValid) ||
    !hasStructuredObservationSignal(previewPayload) ||
    (!skipsFirstStockRequirement && requiresFirstStockSnapshot);

  const stepStates = [
    {
      id: 'observed-at' as const,
      title: t(STOCK_UPDATE_STEP_COPY['observed-at'].titleKey),
      description: observedAtIso ? t('stockUpdateStepObservedAtReady') : t('stockUpdateStepObservedAtMissing'),
      complete: Boolean(observedAtIso),
    },
    {
      id: 'report-notes' as const,
      title: t(STOCK_UPDATE_STEP_COPY['report-notes'].titleKey),
      description: notes.trim() ? t('stockUpdateStepNotesAdded') : t('stockUpdateStepNotesOptional'),
      complete: true,
    },
    ...(isSupplierPendingLane
      ? [
          {
            id: 'reorder' as const,
            title: 'Supplier orders',
            description:
              orderSignalCount > 0
                ? translateUiLiteral(language, '{count} supplier order row{suffix}', {
                    count: orderSignalCount,
                    suffix: orderSignalCount === 1 ? '' : 's',
                  })
                : translateUiLiteral(language, 'Pending supplier commitments'),
            complete: true,
          },
        ]
      : []),
    ...(isSupplierReceiptLane || isSupplierPendingLane
      ? [
          {
            id: 'receipt' as const,
            title: 'Supplier ticket receipt',
            description:
              receiptSignalCount > 0
                ? translateUiLiteral(language, '{count} supplier receipt row{suffix}', {
                    count: receiptSignalCount,
                    suffix: receiptSignalCount === 1 ? '' : 's',
                  })
                : translateUiLiteral(language, 'Realized supplier arrivals'),
            complete: true,
          },
        ]
      : []),
    ...(isCustomerPendingLane || isCustomerCompletedLane
      ? [
          {
            id: 'retail-sales' as const,
            title: translateUiLiteral(language, isCustomerPendingLane ? 'Open retail / sellable SKU orders' : 'Completed retail / sellable orders'),
            description:
              retailSalesChoice === 'yes'
                ? retailSalesCount > 0
                  ? translateUiLiteral(language, '{count} retail row{suffix}', { count: retailSalesCount, suffix: retailSalesCount === 1 ? '' : 's' })
                  : translateUiLiteral(language, isCustomerPendingLane ? 'Pending quantities' : 'Exact counts')
                : isCustomerCompletedLane && retailSalesChoice === 'no'
                  ? retailRankings.length > 0
                    ? translateUiLiteral(language, '{count} ranked retail item{suffix}', { count: retailRankings.length, suffix: retailRankings.length === 1 ? '' : 's' })
                    : translateUiLiteral(language, 'Ranking fallback')
                  : isCustomerPendingLane
                    ? translateUiLiteral(language, 'Open quantity changes')
                    : t('stockUpdateStepChooseYesNo'),
            complete:
              isCustomerPendingLane
                ? true
                : retailSalesChoice === 'yes'
                ? true
                : retailSalesChoice === 'no'
                  ? true
                  : false,
          },
          {
            id: 'service-sales' as const,
            title: translateUiLiteral(language, isCustomerPendingLane ? 'Open service orders' : 'Completed service orders'),
            description:
              serviceSalesChoice === 'yes'
                ? serviceSalesCount > 0
                  ? translateUiLiteral(language, '{count} service row{suffix}', { count: serviceSalesCount, suffix: serviceSalesCount === 1 ? '' : 's' })
                  : translateUiLiteral(language, isCustomerPendingLane ? 'Pending quantities' : 'Exact counts')
                : isCustomerCompletedLane && serviceSalesChoice === 'no'
                  ? serviceRankings.length > 0
                    ? translateUiLiteral(language, '{count} ranked service{suffix}', { count: serviceRankings.length, suffix: serviceRankings.length === 1 ? '' : 's' })
                    : translateUiLiteral(language, 'Ranking fallback')
                  : isCustomerPendingLane
                    ? translateUiLiteral(language, 'Open quantity changes')
                    : t('stockUpdateStepChooseYesNo'),
            complete:
              isCustomerPendingLane
                ? true
                : serviceSalesChoice === 'yes'
                ? true
                : serviceSalesChoice === 'no'
                  ? true
                  : false,
          },
        ]
      : []),
    ...(hasStockCountLane
      ? [{
          id: 'stock' as const,
          title: t(STOCK_UPDATE_STEP_COPY.stock.titleKey),
          description:
            isFirstObservation
              ? t('stockUpdateStepCountAtLeastOneSku')
              : t('stockUpdateStepOptionalLater'),
          complete: stockStepSatisfied,
        }]
      : []),
    {
      id: 'stock-cost' as const,
      title: t('stockUpdateCostIfChanged'),
      description:
        stockStepChoices['stock-cost'] === 'no'
          ? t('stockUpdateStepSkipped')
          : costChangedCount > 0
            ? t('stockUpdateStepRowsChanged', { count: costChangedCount, suffix: costChangedCount === 1 ? '' : 's' })
            : stockStepChoices['stock-cost'] === 'yes'
              ? t('stockUpdateStepOptional')
              : t('stockUpdateStepChooseYesNo'),
      complete: stockStepChoices['stock-cost'] !== 'unset',
    },
    {
      id: 'stock-price' as const,
      title: t('stockUpdateRetailPriceIfChanged'),
      description:
        stockStepChoices['stock-price'] === 'no'
          ? t('stockUpdateStepSkipped')
          : retailPriceChangedCount > 0
            ? t('stockUpdateStepRowsChanged', { count: retailPriceChangedCount, suffix: retailPriceChangedCount === 1 ? '' : 's' })
            : stockStepChoices['stock-price'] === 'yes'
              ? t('stockUpdateStepOptional')
              : t('stockUpdateStepChooseYesNo'),
      complete: stockStepChoices['stock-price'] !== 'unset',
    },
    {
      id: 'stock-flags' as const,
      title: t('stockUpdateAddFlags'),
      description:
        stockStepChoices['stock-flags'] === 'no'
          ? t('stockUpdateStepSkipped')
          : skuFlagCount > 0
            ? t('stockUpdateStepSignalsAdded', { count: skuFlagCount, suffix: skuFlagCount === 1 ? '' : 's' })
            : stockStepChoices['stock-flags'] === 'yes'
              ? t('stockUpdateStepOptional')
              : t('stockUpdateStepChooseYesNo'),
      complete: stockStepChoices['stock-flags'] !== 'unset' && (stockStepChoices['stock-flags'] !== 'yes' || skuFlagsValid),
    },
    {
      id: 'service' as const,
      title: t(STOCK_UPDATE_STEP_COPY.service.titleKey),
      description: serviceFlagCount > 0 ? t('stockUpdateStepSignalsAdded', { count: serviceFlagCount, suffix: serviceFlagCount === 1 ? '' : 's' }) : t('stockUpdateStepOptional'),
      complete: (serviceFlagCount > 0 && serviceFlagsValid) || (serviceStepIndex >= 0 && normalizedCurrentStepIndex > serviceStepIndex),
    },
    {
      id: 'rankings' as const,
      title: t(STOCK_UPDATE_STEP_COPY.rankings.titleKey),
      description: rankingSignalCount > 0 ? t('stockUpdateStepSignalsAdded', { count: rankingSignalCount, suffix: rankingSignalCount === 1 ? '' : 's' }) : t('stockUpdateStepOptional'),
      complete: rankingSignalCount > 0 || (rankingsStepIndex >= 0 && normalizedCurrentStepIndex > rankingsStepIndex),
    },
    {
      id: 'context' as const,
      title: t(STOCK_UPDATE_STEP_COPY.context.titleKey),
      description: regimeHint ? t('stockUpdateStepRegimeSummary', { value: regimeHint.replaceAll('_', ' ') }) : t('stockUpdateStepRegimeOptional'),
      complete: true,
    },
    {
      id: 'review' as const,
      title: t(STOCK_UPDATE_STEP_COPY.review.titleKey),
      description: submitDisabled ? t('stockUpdateStepNotReady') : t('stockUpdateStepReadyToSave'),
      complete: !submitDisabled,
    },
  ].filter((step) => activeStepOrder.includes(step.id)) satisfies Array<{ id: StockUpdateStepId; title: string; description: string; complete: boolean }>;

  const canContinueCurrentStep =
    currentStepId === 'observed-at'
      ? Boolean(observedAtIso)
      : currentStepId === 'context' || currentStepId === 'report-notes'
        ? true
        : currentStepId === 'retail-sales'
          ? isCustomerPendingLane
            ? true
            : retailSalesChoice !== 'unset'
          : currentStepId === 'service-sales'
            ? isCustomerPendingLane
              ? true
              : serviceSalesChoice !== 'unset'
            : currentStepId === 'reorder'
              ? true
            : currentStepId === 'receipt'
              ? true
              : currentStepId === 'stock'
                ? stockStepSatisfied
                : currentStepId === 'stock-cost'
                  ? stockStepChoices['stock-cost'] !== 'unset'
                  : currentStepId === 'stock-price'
                    ? stockStepChoices['stock-price'] !== 'unset'
                    : currentStepId === 'stock-flags'
                      ? stockStepChoices['stock-flags'] !== 'unset' && (stockStepChoices['stock-flags'] !== 'yes' || skuFlagsValid)
        : currentStepId === 'service'
          ? serviceFlagsValid
          : true;

  const addSignalGuidanceText =
    hasStockCountLane
      ? t('stockUpdateGuidanceAddStockCountSignal')
      : isCustomerPendingLane
        ? translateUiLiteral(language, 'Add at least one open customer order change before saving.')
        : isCustomerCompletedLane
          ? translateUiLiteral(language, 'Add at least one completed customer order, refund, row event, ranking, or sales pattern before saving.')
          : isSupplierPendingLane
            ? translateUiLiteral(language, 'Add at least one supplier order change, row event, or sales pattern before saving.')
            : isSupplierReceiptLane
              ? translateUiLiteral(language, 'Add at least one supplier receipt, reversal, row event, or sales pattern before saving.')
        : t('stockUpdateGuidanceAddSignal');

  const stepGuidance =
    currentStepId === 'observed-at' && !observedAtIso
      ? t('stockUpdateGuidanceChooseObservedAt')
      : currentStepId === 'reorder'
        ? null
        : currentStepId === 'receipt'
          ? null
      : currentStepId === 'retail-sales' && !isCustomerPendingLane && retailSalesChoice === 'unset'
        ? t('stockUpdateGuidanceChooseOptionalStep')
        : currentStepId === 'service-sales' && !isCustomerPendingLane && serviceSalesChoice === 'unset'
          ? t('stockUpdateGuidanceChooseOptionalStep')
      : currentStepId === 'stock' && !stockStepSatisfied
        ? t('stockUpdateGuidanceCountOneSku')
        : currentStepId === 'stock-cost' && stockStepChoices['stock-cost'] === 'unset'
          ? t('stockUpdateGuidanceChooseOptionalStep')
          : currentStepId === 'stock-price' && stockStepChoices['stock-price'] === 'unset'
            ? t('stockUpdateGuidanceChooseOptionalStep')
            : currentStepId === 'stock-flags' && stockStepChoices['stock-flags'] === 'unset'
              ? t('stockUpdateGuidanceChooseOptionalStep')
              : currentStepId === 'stock-flags' && stockStepChoices['stock-flags'] === 'yes' && !skuFlagsValid
                ? t('stockUpdateGuidanceFillSkuFlags')
          : currentStepId === 'service' && lane.id !== 'stock-count' && !serviceFlagsValid
            ? t('stockUpdateGuidanceFillServiceFlags')
        : currentStepId === 'review' && stockStepChoices['stock-flags'] === 'yes' && !skuFlagsValid
            ? t('stockUpdateGuidanceFillSkuFlagsSave')
            : currentStepId === 'review' && lane.id !== 'stock-count' && !serviceFlagsValid
              ? t('stockUpdateGuidanceFillServiceFlagsSave')
          : currentStepId === 'review' && !hasStructuredObservationSignal(previewPayload)
                ? addSignalGuidanceText
          : currentStepId === 'review' && !skipsFirstStockRequirement && isFirstObservation && previewPayload.stockSnapshot.length === 0
            ? t('stockUpdateGuidanceFirstUpdateNeedsCount')
            : null;

  const reviewBlockers = [
    ...(stockStepChoices['stock-flags'] === 'yes' && !skuFlagsValid ? [t('stockUpdateGuidanceFillSkuFlagsSave')] : []),
    ...(lane.id !== 'stock-count' && !serviceFlagsValid ? [t('stockUpdateGuidanceFillServiceFlagsSave')] : []),
    ...(!hasStructuredObservationSignal(previewPayload)
      ? [addSignalGuidanceText]
      : []),
    ...(!skipsFirstStockRequirement && requiresFirstStockSnapshot
      ? [t('stockUpdateGuidanceFirstUpdateNeedsCount')]
      : []),
  ];

  function selectStep(stepId: StockUpdateStepId) {
    const targetIndex = activeStepOrder.indexOf(stepId);
    if (targetIndex >= 0 && targetIndex < unlockedStepCount) {
      setCurrentStepId(stepId);
    }
  }

  function goToNextStep() {
    if (!canContinueCurrentStep || isLastStep) {
      return;
    }
    const nextIndex = normalizedCurrentStepIndex + 1;
    setUnlockedStepCount((current) => Math.max(current, nextIndex + 1));
    setCurrentStepId(activeStepOrder[nextIndex]!);
  }

  function goToPreviousStep() {
    if (normalizedCurrentStepIndex === 0) {
      return;
    }
    setCurrentStepId(activeStepOrder[normalizedCurrentStepIndex - 1]!);
  }

  function resetRecordUpdateState() {
    const nextObservedAt = localDateTimeInputValue(null);
    const resetDeliverySource = selectedOrderBatch?.shared.deliveryFee ?? latestHistoricalDeliveryFee;
    const resetDeliveryAmount =
      resetDeliverySource?.feeUsd != null
        ? String(displayMoneyFromUsd(resetDeliverySource.feeUsd, currency, usdToKhrExchangeRate))
        : '';
    const resetDeliveryPayer = deliveryFeePayerLocked
      ? 'merchant'
      : resetDeliverySource?.payer ?? deliveryFeeDefaultPayer;
    initialObservedAtRef.current = nextObservedAt;
    setEditSession(null);
    setPendingEditSession(null);
    setReplaceDraftDialogOpen(false);
    setActivePosMetadataPopup(null);
    setActivePosTileKey(null);
    setPosTileDialogQuantity('1');
    setPosReceiptConfirmOpen(false);
    setPosReceiptCopyStatus('idle');
    setPosWorkbenchSearch('');
    setPosWorkbenchFilter('all');
    setPosTouchedLineKeys([]);
    setCustomSelectedLaneIds(lane.id === 'custom' ? routeCustomSelectedLaneIds : []);
    setCurrentStepId('observed-at');
    setUnlockedStepCount(1);
    setObservedAt(nextObservedAt);
    setNotes('');
    setNotesPlaceholderKey(randomReportNotePlaceholderKey());
    setStockView('priority');
    setRows(buildOrderedInitialRows(catalog));
    setRetailSalesChoice('unset');
    setServiceSalesChoice('unset');
    setRetailSalesDrafts({});
    setServiceSalesDrafts({});
    setCustomerPendingMode('new_pending');
    setCustomerCompletedMode('immediate_sale');
    setSupplierPendingMode('new_supplier_order');
    setSupplierReceiptMode('against_pending_supplier_order');
    setCustomerTicketMode(lane.id === 'customer-order-pending' ? routeTicketMode : null);
    setSupplierTicketMode(lane.id === 'supplier-order-pending' ? routeTicketMode : null);
    setSelectedCustomerTicketId(lane.id === 'customer-order-pending' ? routeTicketId : null);
    setSelectedSupplierTicketId(
      lane.id === 'supplier-order-pending' ? routeBatchOrderId ?? routeChildOrderId ?? routeTicketId : null,
    );
    setSupplierTicketUpdateAction('revise_order');
    setCustomerIdentity(DEFAULT_CUSTOMER_IDENTITY);
    setRefundStockReturnDrafts({});
    setSkuSignalDrafts({});
    setRecordOrderExpectedArrivalDate('');
    setRecordOrderLeadTimeMeanDays('');
    setRecordOrderLeadTimeVariability('');
    setRecordReceiptReceivedDate('');
    setDeliveryFeeAmount(resetDeliveryAmount);
    setDeliveryFeePayer(resetDeliveryPayer);
    setDeliveryFeeBaselineAmount(resetDeliveryAmount);
    setDeliveryFeeBaselinePayer(resetDeliveryPayer);
    setStockStepChoices(createDefaultStockStepChoices());
    setServiceSignalDrafts({});
    setRegimeHint('');
    setServiceRankings([]);
    setRetailRankings([]);
    setError(null);
  }

  function clearCurrentSession() {
    skipNextDraftPersistRef.current = true;
    removeStockUpdateDraft(draftStorageKey);
    setHasSavedDraft(false);
    setDraftWasRestored(false);
    resetRecordUpdateState();
  }

  function handleDiscardChanges() {
    clearCurrentSession();
    navigate(RECORD_UPDATE_HUB_PATH, { replace: true });
  }

  function submitValidationError(payload: SenaObservationInput) {
    if (!observedAtIso) {
      return t('stockUpdateSaveObservedAtError');
    }
    if (stockStepChoices['stock-flags'] === 'yes' && !skuFlagsValid) {
      return t('stockUpdateGuidanceFillSkuFlagsSave');
    }
    if (lane.id !== 'stock-count' && !serviceFlagsValid) {
      return t('stockUpdateGuidanceFillServiceFlagsSave');
    }
    if (!hasStructuredObservationSignal(payload)) {
      return addSignalGuidanceText;
    }
    if (!skipsFirstStockRequirement && isFirstObservation && payload.stockSnapshot.length === 0) {
      return t('stockUpdateGuidanceFirstUpdateNeedsCount');
    }
    if (deliveryFeeAmount.trim() !== '') {
      const parsed = Number(deliveryFeeAmount);
      if (!Number.isFinite(parsed) || parsed < 0) {
        return translateUiLiteral(language, 'Delivery fee must be a non-negative amount.');
      }
    }
    return null;
  }

  async function saveCurrentSession() {
    setError(null);
    const payload = buildPayload();
    const validationError = submitValidationError(payload);
    if (validationError) {
      setError(validationError);
      return;
    }
    try {
      if (lane.id === 'supplier-order-pending' && supplierPendingMode !== 'cancel_supplier_order') {
        const tableMeanDays =
          recordOrderLeadTimeMeanDays.trim() === ''
            ? null
            : Number(recordOrderLeadTimeMeanDays);
        const sharedFields = {
          supplierNote: notes.trim() || null,
          expectedArrivalAt: dateInputToIso(recordOrderExpectedArrivalDate),
          placementTimestamp: observedAtIso,
          leadTimeDaysHint: tableMeanDays,
          leadTimeVariability: recordOrderLeadTimeVariability || null,
          deliveryFee: activeDeliveryFeeMetadata,
        };
        if (selectedOrderBatch && routeBatchOrderId) {
          if (routeChildOrderId) {
            const selectedChild = selectedOrderChildren[0] ?? null;
            const draft = selectedChild ? visibleSkuSignalDrafts[selectedChild.skuId] : null;
            await updateSenaOrderBatch({
              batchOrderId: routeBatchOrderId,
              supplierName: selectedOrderBatch.supplierName,
              shared: sharedFields,
            });
            await updateSenaOrderChild({
              childOrderId: routeChildOrderId,
              overrides: {
                orderedQuantity: draft?.orderedQuantity ? Number(draft.orderedQuantity) : null,
              },
            });
          } else {
            await updateSenaOrderBatch({
              batchOrderId: routeBatchOrderId,
              supplierName: selectedOrderBatch.supplierName,
              shared: sharedFields,
            });
          }
        } else {
          const orderedEntries = Object.entries(visibleSkuSignalDrafts)
            .filter(([, draft]) => draft.orderedQuantity.trim() !== '' && Number(draft.orderedQuantity) > 0)
            .map(([skuId, draft]) => ({ skuId, draft }));
          const entriesBySupplier = orderedEntries.reduce<Map<string, typeof orderedEntries>>((map, entry) => {
            const supplierName = workingCatalog?.skus.find((sku) => sku.skuId === entry.skuId)?.supplierName?.trim() || '';
            const existing = map.get(supplierName) ?? [];
            existing.push(entry);
            map.set(supplierName, existing);
            return map;
          }, new Map());
          for (const [supplierName, entries] of entriesBySupplier) {
            await createSenaOrderBatch({
              supplierName: supplierName || null,
              shared: {
                ...sharedFields,
                supplierName: supplierName || null,
              },
              children: entries.map(({ skuId, draft }) => {
                const row = rows.find((entry) => entry.skuId === skuId);
                return {
                  skuId,
                  overrides: {
                    orderedQuantity: Number(draft.orderedQuantity),
                    costPerUnit: row?.costPerUnit ?? null,
                  },
                };
              }),
            });
          }
        }
      }
      if (lane.id === 'supplier-receipt' && supplierReceiptMode !== 'return_receipt_reversal' && routeBatchOrderId) {
        const targetChildren = selectedOrderChildren.length > 0 ? selectedOrderChildren : [];
        await updateSenaOrderBatch({
          batchOrderId: routeBatchOrderId,
          supplierName: selectedOrderBatch?.supplierName ?? null,
          shared: {
            deliveryFee: activeDeliveryFeeMetadata,
          },
        });
        for (const child of targetChildren) {
          const draft = visibleSkuSignalDrafts[child.skuId];
          const quantity = draft?.receiptQuantity?.trim() ? Number(draft.receiptQuantity) : null;
          await updateSenaOrderChild({
            childOrderId: child.childOrderId,
            overrides: {
              receivedQuantity: quantity,
              receiptTimestamp: dateInputToIso(recordReceiptReceivedDate) ?? observedAtIso,
            },
            status: 'received',
          });
        }
      }
      if (lane.id === 'stock-count' && routeBatchOrderId) {
        for (const child of selectedOrderChildren) {
          await updateSenaOrderChild({
            childOrderId: child.childOrderId,
            status: 'reviewed',
          });
        }
      }
      if (editSession) {
        await updateSenaObservation({
          observationId: editSession.observationId,
          input: payload,
        });
      } else {
        await ingestSenaObservation(payload);
      }
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : t('stockUpdateSaveFailed'));
      return;
    }

    skipNextDraftPersistRef.current = true;
    removeStockUpdateDraft(draftStorageKey);
    setHasSavedDraft(false);
    setDraftWasRestored(false);
    resetRecordUpdateState();
    navigate('/', { replace: true, state: null });
    const schedulePostSaveRerun = () => {
      const currentRoute = window.location.hash.replace(/^#/, '') || window.location.pathname || '/';
      if (currentRoute.startsWith('/work/capture')) {
        window.setTimeout(schedulePostSaveRerun, POST_SAVE_RERUN_DELAY_MS);
        return;
      }
      void triggerSenaRun({ algorithmVersion: 'sena-analysis-v3' }).catch((nextError: unknown) => {
        console.error('[record-update] failed to rerun SENA after save', nextError);
      });
    };
    window.setTimeout(schedulePostSaveRerun, POST_SAVE_RERUN_DELAY_MS);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const payload = buildPayload();
    const validationError = submitValidationError(payload);
    if (validationError) {
      setError(validationError);
      return;
    }
    if (sessionViewMode === 'pos') {
      setPosReceiptCopyStatus('idle');
      setPosReceiptConfirmOpen(true);
      return;
    }
    await saveCurrentSession();
  }

  async function copyPosReceiptPlainText() {
    try {
      await navigator.clipboard.writeText(posReceiptPlainText);
      setPosReceiptCopyStatus('copied');
    } catch {
      setPosReceiptCopyStatus('failed');
    }
  }

  const discardChangesDescription =
    t('stockSessionDiscardDescription');
  const { discardConfirmDialog, requestDiscard } = useDiscardChangesConfirm({
    enabled: canDiscardChanges,
    description: discardChangesDescription,
    onDiscard: handleDiscardChanges,
  });
  const pendingNavigationRef = useRef<PendingNavigationState | null>(null);

  function persistDraftForLater() {
    const latestState = latestDraftStateRef.current;
    if (!latestState) {
      return;
    }
    const wroteDraft = writeStockUpdateDraft(latestState, draftStorageKey);
    setHasSavedDraft(wroteDraft);
    setDraftWasRestored(false);
  }

  useEffect(() => {
    function resolveTargetPath(anchor: HTMLAnchorElement) {
      const url = new URL(anchor.href, window.location.href);
      if (url.origin !== window.location.origin) {
        return null;
      }
      if (url.hash.startsWith('#/')) {
        return url.hash.slice(1);
      }
      return `${url.pathname}${url.search}${url.hash}`;
    }

    function currentBrowserPath() {
      if (window.location.hash.startsWith('#/')) {
        return window.location.hash.slice(1);
      }
      return `${window.location.pathname}${window.location.search}${window.location.hash}`;
    }

    function queueNavigation(continueNavigation: () => void) {
      pendingNavigationRef.current = { continueNavigation };
      setLeaveDraftDialogOpen(true);
    }

    function handleDocumentClick(event: MouseEvent) {
      if (!canDiscardChanges || event.defaultPrevented || event.button !== 0) {
        return;
      }
      if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) {
        return;
      }

      const target = event.target;
      if (!(target instanceof Element)) {
        return;
      }

      const anchor = target.closest('a[href]');
      if (!(anchor instanceof HTMLAnchorElement)) {
        return;
      }

      const currentPath = `${location.pathname}${location.search}${location.hash}`;
      const nextPath = resolveTargetPath(anchor);
      if (!nextPath || nextPath === currentPath) {
        return;
      }

      event.preventDefault();
      queueNavigation(() => navigate(nextPath));
    }

    function handleHistoryNavigation() {
      if (!canDiscardChanges) {
        return;
      }

      const previousPath = `${location.pathname}${location.search}${location.hash}`;
      const nextPath = currentBrowserPath();
      if (nextPath === previousPath) {
        return;
      }

      navigate(previousPath, { replace: true });
      queueNavigation(() => navigate(nextPath));
    }

    document.addEventListener('click', handleDocumentClick, true);
    window.addEventListener('popstate', handleHistoryNavigation);
    window.addEventListener('hashchange', handleHistoryNavigation);

    return () => {
      document.removeEventListener('click', handleDocumentClick, true);
      window.removeEventListener('popstate', handleHistoryNavigation);
      window.removeEventListener('hashchange', handleHistoryNavigation);
    };
  }, [canDiscardChanges, location.hash, location.pathname, location.search, navigate]);
  const draftStatusLabel = draftWasRestored
    ? t('stockSessionDraftResumed')
    : hasMeaningfulChanges
      ? t('stockSessionDraftWillSaveOnExit')
      : hasSavedDraft
        ? t('stockSessionDraftAvailable')
        : null;

  const navigationActions = (
    <>
      {currentStepIndex > 0 ? (
        <Button type="button" variant="outline" onClick={goToPreviousStep}>
          <NavigationPreviousIcon className="size-4" />
          {t('stockSessionBack')}
        </Button>
      ) : null}
      {isLastStep ? (
        <Button disabled={submitDisabled} form="stock-update-session-form" type="submit">
          <ActionSaveIcon className="size-4" />
          {isSaving ? t('catalogSenaSkuSaving') : t('stockDone')}
        </Button>
      ) : (
        <Button disabled={!canContinueCurrentStep} type="button" onClick={goToNextStep}>
          {t('stockSessionNext')}
          <NavigationNextIcon className="size-4" />
        </Button>
      )}
    </>
  );
  const [bottomNavigationIslandLeft, setBottomNavigationIslandLeft] = useState<number | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    let frameElement: HTMLElement | null = null;
    let resizeObserver: ResizeObserver | null = null;
    let animationFrame = 0;

    const updateIslandLeft = () => {
      window.cancelAnimationFrame(animationFrame);
      animationFrame = window.requestAnimationFrame(() => {
        frameElement =
          document.querySelector<HTMLElement>('[data-testid="shell-main-frame"]') ??
          document.getElementById('main-content');
        const rect = frameElement?.getBoundingClientRect();
        setBottomNavigationIslandLeft(rect ? rect.left + rect.width / 2 : null);
      });
    };

    updateIslandLeft();
    window.addEventListener('resize', updateIslandLeft);
    window.addEventListener('scroll', updateIslandLeft, { passive: true });

    frameElement =
      document.querySelector<HTMLElement>('[data-testid="shell-main-frame"]') ??
      document.getElementById('main-content');
    if (frameElement && typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(updateIslandLeft);
      resizeObserver.observe(frameElement);
    }

    return () => {
      window.cancelAnimationFrame(animationFrame);
      window.removeEventListener('resize', updateIslandLeft);
      window.removeEventListener('scroll', updateIslandLeft);
      resizeObserver?.disconnect();
    };
  }, []);

  const titleActions = (
    <WorkspaceActionRow>
      {draftStatusLabel ? <span className="px-1 text-sm text-muted-foreground">{draftStatusLabel}</span> : null}
      <Button
        className={discardChangesButtonClassName}
        disabled={!canDiscardChanges}
        title={canDiscardChanges ? undefined : t('stockSessionNoChangesToDiscard')}
        type="button"
        variant="destructive-outline"
        onClick={() => requestDiscard()}
      >
        <ActionDeleteIcon className="size-4" />
        {t('stockUpdateDiscardChanges')}
      </Button>
    </WorkspaceActionRow>
  );

  const floatingTitleActions = (
    <WorkspaceActionRow>
      <Button
        className={discardChangesButtonClassName}
        disabled={!canDiscardChanges}
        title={canDiscardChanges ? undefined : t('stockSessionNoChangesToDiscard')}
        type="button"
        variant="destructive-outline"
        onClick={() => requestDiscard()}
      >
        <ActionDeleteIcon className="size-4" />
        {t('stockUpdateDiscardChanges')}
      </Button>
    </WorkspaceActionRow>
  );

  const bottomNavigationIsland =
    typeof document !== 'undefined'
      ? createPortal(
          <div
            className="fixed bottom-4 z-40 max-w-[calc(100vw-2rem)] -translate-x-1/2 md:bottom-6"
            style={{ left: bottomNavigationIslandLeft == null ? '50vw' : `${bottomNavigationIslandLeft}px` }}
          >
            <div className="editorial-panel rounded-[1.5rem] border-white/70 bg-background/92 p-2 shadow-[var(--shadow-float)] backdrop-blur-[10px]">
              <WorkspaceActionRow className={cn('justify-center', headerActionSurfaceClassName)}>
                {navigationActions}
              </WorkspaceActionRow>
            </div>
          </div>,
          document.body,
        )
      : null;

  const summaryRibbonItems = [
    {
      key: 'latest-update',
      label: t('stockUpdateSummaryLastConfirmed'),
      value: latestAt ? formatSenaLongDate(latestAt, 'en') : t('stockUpdateSummaryNoPriorUpdate'),
    },
    {
      key: 'interval-length',
      label: t('stockUpdateSummaryIntervalLength'),
      value: intervalDays == null ? t('stockUpdateSummaryFirstInterval') : t('stockUpdateSummaryIntervalDays', { days: intervalDays }),
    },
    {
      key: 'coverage',
      label: t('stockUpdateSummaryUntouchedSkus'),
      value: fullUpdate ? t('stockUpdateSummaryFullUpdate') : t('stockUpdateSummaryPartialUpdate'),
    },
  ];
  const customerPendingStateFilterControl = (
    <WorkflowStateFilter
      kind="order"
      label={translateUiLiteral(language, 'Customer pending states')}
      options={CUSTOMER_PENDING_MODE_OPTIONS}
      selectedValues={customerPendingModeFilters}
      onChange={updateCustomerPendingModeFilters}
    />
  );
  const customerCompletedStateFilterControl = (
    <WorkflowStateFilter
      kind="order"
      label={translateUiLiteral(language, 'Customer completion states')}
      options={CUSTOMER_COMPLETED_MODE_OPTIONS}
      selectedValues={customerCompletedModeFilters}
      onChange={updateCustomerCompletedModeFilters}
    />
  );
  const supplierPendingStateFilterControl = (
    <WorkflowStateFilter
      kind="order"
      label={translateUiLiteral(language, 'Supplier pending states')}
      options={SUPPLIER_PENDING_MODE_OPTIONS}
      selectedValues={supplierPendingModeFilters}
      onChange={updateSupplierPendingModeFilters}
    />
  );
  const supplierReceiptStateFilterControl = (
    <WorkflowStateFilter
      kind="receipt"
      label={translateUiLiteral(language, 'Supplier receipt states')}
      options={SUPPLIER_RECEIPT_MODE_OPTIONS}
      selectedValues={supplierReceiptModeFilters}
      onChange={updateSupplierReceiptModeFilters}
    />
  );
  const notesSummary = notes.trim() ? t('stockUpdateStepNotesAdded') : t('stockUpdateOptional');
  const customerSummaryParts = [
    customerIdentity.channel === 'custom'
      ? customerIdentity.customChannel.trim()
      : customerIdentity.channel.trim(),
    customerIdentity.customerName.trim(),
    formatPhoneForDisplay(customerIdentity.phone),
  ].filter(Boolean);
  const partyAndNotesSummary = customerSummaryParts.length > 0
    ? customerSummaryParts.join(' · ')
    : notesSummary;
  const metadataSections: Array<{
    id: PosMetadataPopupId;
    stepId: Extract<StockUpdateStepId, 'observed-at' | 'report-notes' | 'context'>;
    icon: IconComponent;
    label: string;
    summary: string;
  }> = [
    {
      id: 'timing',
      stepId: 'observed-at',
      icon: StatusTimingIcon,
      label: t('stockUpdateSessionTiming'),
      summary: observedAtIso ? formatSenaDateTime(observedAtIso, language) : t('stockStepStatusRequired'),
    },
    ...(isCustomerTicketLane
      ? [
          {
            id: 'customer' as const,
            stepId: 'report-notes' as const,
            icon: ActionEditIcon,
            label: translateUiLiteral(language, 'Customer'),
            summary: customerSummaryParts.length > 0 ? customerSummaryParts.join(' · ') : t('stockUpdateOptional'),
          },
        ]
      : []),
    {
      id: 'notes',
      stepId: 'report-notes',
      icon: ActionEditIcon,
      label: t('stockUpdateSessionNotes'),
      summary: notesSummary,
    },
    {
      id: 'context',
      stepId: 'context',
      icon: EntityLayersIcon,
      label: t('stockUpdateSessionMetaContext'),
      summary: regimeHint ? regimeHint.replaceAll('_', ' ') : t('stockUpdateOptional'),
    },
    ...(deliveryFeeEnabled
      ? [{
          id: 'delivery' as const,
          stepId: 'context' as const,
          icon: EntityDeliveryIcon,
          label: translateUiLiteral(language, 'Delivery'),
          summary: deliveryFeeAmount.trim() ? `${deliveryDisplayLabel} · ${translateUiLiteral(language, deliveryFeePayerLocked ? 'Merchant' : deliveryFeePayer === 'customer' ? 'Customer' : 'Merchant')}` : t('stockUpdateOptional'),
        }]
      : []),
  ];
  const activatePosStep = useCallback((stepId: StockUpdateStepId) => {
    const targetIndex = activeStepOrder.indexOf(stepId);
    if (targetIndex < 0) {
      return;
    }
    setUnlockedStepCount((current) => Math.max(current, targetIndex + 1));
    setCurrentStepId(stepId);
  }, [activeStepOrder]);
  const posTiles = useMemo<PosWorkbenchTile[]>(() => {
    const nextTiles: PosWorkbenchTile[] = [];

    if (hasStockCountLane) {
      for (const row of supplierFilteredRows) {
        const sku = skuById.get(row.skuId);
        if (!sku) {
          continue;
        }
        const baselineUnits = stockBySku.get(row.skuId)?.unitsInStock ?? 0;
        const changed = stockRowChanged(workingCatalog, stockBySku, row);
        nextTiles.push({
          key: `stock:${row.skuId}`,
          entityId: row.skuId,
          title: sku.name,
          imagePath: sku.imagePath ?? null,
          itemType: 'sku',
          kind: 'stock',
          stepId: 'stock',
          typeLabel: translateUiLiteral(language, 'SKU'),
          metaLabel: changed
            ? translateUiLiteral(language, 'Counted {count}', { count: row.unitsInStock })
            : countedAtBySku.get(row.skuId)
              ? translateUiLiteral(language, 'Last count {date}', { date: formatSenaLongDate(countedAtBySku.get(row.skuId)!, language) })
              : translateUiLiteral(language, 'Not counted yet'),
          currentQuantity: row.unitsInStock,
          baselineQuantity: baselineUnits,
          unitAmount: row.costPerUnit,
          recentAt: countedAtBySku.get(row.skuId) ?? null,
          touched: changed || posTouchedLineKeySet.has(`stock:${row.skuId}`),
        });
      }
    }

    if (isCustomerPendingLane || isCustomerCompletedLane) {
      for (const skuId of retailSkuIds) {
        const sku = skuById.get(skuId);
        if (!sku) {
          continue;
        }
        const quantity = Number(retailSalesDrafts[skuId] ?? 0);
        const previousPending = latestCustomerPendingBySku.get(skuId) ?? 0;
        nextTiles.push({
          key: `retail:${skuId}`,
          entityId: skuId,
          title: sku.name,
          imagePath: sku.imagePath ?? null,
          itemType: 'sku',
          kind: 'retail',
          stepId: 'retail-sales',
          typeLabel: translateUiLiteral(language, 'SKU'),
          metaLabel: isCustomerPendingLane
            ? translateUiLiteral(language, 'Open {count}', { count: previousPending })
            : translateUiLiteral(language, 'Price {amount}', {
                amount: sku.productPrice == null ? t('stockUpdateNoMoneyValue') : formatCurrency(sku.productPrice, currency, language, usdToKhrExchangeRate),
              }),
          currentQuantity: Number.isFinite(quantity) ? quantity : 0,
          baselineQuantity: 0,
          unitAmount: sku.productPrice ?? null,
          recentAt: latestRetailSalesAt.get(skuId) ?? null,
          touched: (Number.isFinite(quantity) ? quantity : 0) > 0 || posTouchedLineKeySet.has(`retail:${skuId}`),
        });
      }
      for (const serviceId of serviceIds) {
        const service = serviceById.get(serviceId);
        if (!service) {
          continue;
        }
        const quantity = Number(serviceSalesDrafts[serviceId] ?? 0);
        const previousPending = latestCustomerPendingByService.get(serviceId) ?? 0;
        nextTiles.push({
          key: `service:${serviceId}`,
          entityId: serviceId,
          title: service.name,
          imagePath: service.imagePath ?? null,
          itemType: 'service',
          kind: 'service',
          stepId: 'service-sales',
          typeLabel: translateUiLiteral(language, 'Service'),
          metaLabel: isCustomerPendingLane
            ? translateUiLiteral(language, 'Open {count}', { count: previousPending })
            : translateUiLiteral(language, 'Price {amount}', {
                amount: formatCurrency(service.price, currency, language, usdToKhrExchangeRate),
              }),
          currentQuantity: Number.isFinite(quantity) ? quantity : 0,
          baselineQuantity: 0,
          unitAmount: service.price,
          recentAt: latestServiceSalesAt.get(serviceId) ?? null,
          touched: (Number.isFinite(quantity) ? quantity : 0) > 0 || posTouchedLineKeySet.has(`service:${serviceId}`),
        });
      }
    }

    if (isSupplierPendingLane) {
      for (const row of supplierFilteredRows) {
        const sku = skuById.get(row.skuId);
        if (!sku) {
          continue;
        }
        const quantity = Number(skuSignalDrafts[row.skuId]?.orderedQuantity ?? 0);
        nextTiles.push({
          key: `supplier-order:${row.skuId}`,
          entityId: row.skuId,
          title: sku.name,
          imagePath: sku.imagePath ?? null,
          itemType: 'sku',
          kind: 'supplier-order',
          stepId: 'reorder',
          typeLabel: translateUiLiteral(language, 'SKU'),
          metaLabel: latestOrderedAt.get(row.skuId)
            ? translateUiLiteral(language, 'Last order {date}', { date: formatSenaLongDate(latestOrderedAt.get(row.skuId)!, language) })
            : translateUiLiteral(language, 'No pending order'),
          currentQuantity: Number.isFinite(quantity) ? quantity : 0,
          baselineQuantity: 0,
          unitAmount: row.costPerUnit,
          recentAt: latestOrderedAt.get(row.skuId) ?? null,
          touched: (Number.isFinite(quantity) ? quantity : 0) > 0 || posTouchedLineKeySet.has(`supplier-order:${row.skuId}`),
        });
      }
    }

    if (isSupplierReceiptLane) {
      for (const row of supplierFilteredRows) {
        const sku = skuById.get(row.skuId);
        if (!sku) {
          continue;
        }
        const quantity = Number(skuSignalDrafts[row.skuId]?.receiptQuantity ?? 0);
        nextTiles.push({
          key: `supplier-receipt:${row.skuId}`,
          entityId: row.skuId,
          title: sku.name,
          imagePath: sku.imagePath ?? null,
          itemType: 'sku',
          kind: 'supplier-receipt',
          stepId: 'receipt',
          typeLabel: translateUiLiteral(language, 'SKU'),
          metaLabel: latestReceiptAt.get(row.skuId)
            ? translateUiLiteral(language, 'Last receipt {date}', { date: formatSenaLongDate(latestReceiptAt.get(row.skuId)!, language) })
            : translateUiLiteral(language, 'Awaiting receipt'),
          currentQuantity: Number.isFinite(quantity) ? quantity : 0,
          baselineQuantity: 0,
          unitAmount: row.costPerUnit,
          recentAt: latestReceiptAt.get(row.skuId) ?? null,
          touched: (Number.isFinite(quantity) ? quantity : 0) > 0 || posTouchedLineKeySet.has(`supplier-receipt:${row.skuId}`),
        });
      }
    }

    return workbenchReorderLaneId ? applyWorkbenchTileOrder(nextTiles, workbenchTileOrder) : nextTiles;
  }, [
    countedAtBySku,
    currency,
    hasStockCountLane,
    isCustomerCompletedLane,
    isCustomerPendingLane,
    isSupplierPendingLane,
    isSupplierReceiptLane,
    language,
    latestCustomerPendingByService,
    latestCustomerPendingBySku,
    latestOrderedAt,
    latestReceiptAt,
    latestRetailSalesAt,
    latestServiceSalesAt,
    posTouchedLineKeySet,
    retailSalesDrafts,
    retailSkuIds,
    rows,
    serviceIds,
    serviceSalesDrafts,
    serviceById,
    skuById,
    skuSignalDrafts,
    stockBySku,
    supplierFilteredRows,
    t,
    usdToKhrExchangeRate,
    workbenchReorderLaneId,
    workbenchTileOrder,
    workingCatalog,
  ]);
  const posFilterOptions = useMemo(() => {
    const hasSkuTiles = posTiles.some((tile) => tile.itemType === 'sku');
    const hasServiceTiles = posTiles.some((tile) => tile.itemType === 'service');
    const options: Array<{ icon: IconComponent; id: PosWorkbenchFilterId; label: string }> = [
      { icon: EntityLayersIcon, id: 'all', label: translateUiLiteral(language, 'All') },
    ];
    if (hasServiceTiles) {
      options.push({ icon: EntityServiceIcon, id: 'services', label: translateUiLiteral(language, 'Services') });
    }
    if (hasSkuTiles && !stockCountPosMode) {
      options.push({ icon: EntitySkuIcon, id: 'skus', label: translateUiLiteral(language, 'SKUs') });
    }
    options.push(
      { icon: StatusScheduleIcon, id: 'recent', label: translateUiLiteral(language, 'Recent') },
      { icon: StatusReadyIcon, id: 'touched', label: translateUiLiteral(language, 'Touched') },
    );
    return options;
  }, [language, posTiles, stockCountPosMode]);
  const filteredPosTiles = useMemo(() => {
    const search = deferredPosWorkbenchSearch.trim().toLowerCase();
    const matchesSearch = (tile: PosWorkbenchTile) =>
      search.length === 0 || [tile.title, tile.typeLabel, tile.metaLabel].some((value) => value.toLowerCase().includes(search));
    const matchesFilter = (tile: PosWorkbenchTile) => {
      if (posWorkbenchFilter === 'services') {
        return tile.itemType === 'service';
      }
      if (posWorkbenchFilter === 'skus') {
        return tile.itemType === 'sku';
      }
      if (posWorkbenchFilter === 'recent') {
        return tile.recentAt != null;
      }
      if (posWorkbenchFilter === 'touched') {
        return tile.touched;
      }
      return true;
    };
    return posTiles.filter((tile) => matchesSearch(tile) && matchesFilter(tile));
  }, [deferredPosWorkbenchSearch, posTiles, posWorkbenchFilter]);
  const activeWorkbenchDragTile = useMemo(
    () => (activeWorkbenchDragTileKey == null ? null : posTiles.find((tile) => tile.key === activeWorkbenchDragTileKey) ?? null),
    [activeWorkbenchDragTileKey, posTiles],
  );
  const clearWorkbenchHoldTimer = useCallback(() => {
    if (workbenchHoldTimerRef.current != null) {
      window.clearTimeout(workbenchHoldTimerRef.current);
      workbenchHoldTimerRef.current = null;
    }
  }, []);
  const finishWorkbenchReorderMode = useCallback((resumePendingAction: boolean) => {
    clearWorkbenchHoldTimer();
    setWorkbenchReorderMode(false);
    setWorkbenchReorderPromptOpen(false);
    setActiveWorkbenchDragTileKey(null);
    const pendingAction = pendingWorkbenchInteractionRef.current;
    pendingWorkbenchInteractionRef.current = null;
    if (resumePendingAction) {
      pendingAction?.();
    }
  }, [clearWorkbenchHoldTimer]);
  const requestWorkbenchReorderPrompt = useCallback((pendingAction?: () => void) => {
    pendingWorkbenchInteractionRef.current = pendingAction ?? null;
    setWorkbenchReorderPromptOpen(true);
  }, []);
  const guardWorkbenchReorderInteraction = useCallback((pendingAction?: () => void) => {
    if (!workbenchReorderMode) {
      pendingAction?.();
      return false;
    }
    requestWorkbenchReorderPrompt(pendingAction);
    return true;
  }, [requestWorkbenchReorderPrompt, workbenchReorderMode]);
  const persistWorkbenchTileOrder = useCallback(
    (nextTileOrder: string[]) => {
      if (!workbenchReorderLaneId) {
        return;
      }

      const nextOrderByLane = {
        ...workbenchTileOrderDraftByLane,
        [workbenchReorderLaneId]: nextTileOrder,
      };
      setWorkbenchTileOrderDraftByLane(nextOrderByLane);
      void savePreferences({
        workbenchTileOrderByLane: nextOrderByLane,
      });
    },
    [savePreferences, workbenchReorderLaneId, workbenchTileOrderDraftByLane],
  );
  const beginWorkbenchHold = useCallback((tileKey: string) => {
    if (!workbenchReorderLaneId || workbenchReorderMode) {
      return;
    }
    clearWorkbenchHoldTimer();
    workbenchHoldTimerRef.current = window.setTimeout(() => {
      setWorkbenchReorderMode(true);
      workbenchHoldTimerRef.current = null;
    }, WORKBENCH_REORDER_HOLD_DELAY_MS);
  }, [clearWorkbenchHoldTimer, workbenchReorderLaneId, workbenchReorderMode]);
  const endWorkbenchHold = useCallback(() => {
    clearWorkbenchHoldTimer();
  }, [clearWorkbenchHoldTimer]);
  const handleWorkbenchDragStart = useCallback((event: DragStartEvent) => {
    if (!workbenchReorderLaneId) {
      return;
    }
    clearWorkbenchHoldTimer();
    setWorkbenchReorderMode(true);
    setActiveWorkbenchDragTileKey(String(event.active.id));
  }, [clearWorkbenchHoldTimer, workbenchReorderLaneId]);
  const clearWorkbenchDragState = useCallback(() => {
    setActiveWorkbenchDragTileKey(null);
  }, []);
  const handleWorkbenchDragCancel = useCallback((_event: DragCancelEvent) => {
    clearWorkbenchDragState();
  }, [clearWorkbenchDragState]);
  const handleWorkbenchDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    clearWorkbenchDragState();
    if (!workbenchReorderLaneId || !over) {
      return;
    }

    const nextTileOrder = mergeWorkbenchTileOrderForVisibleSubset({
      allTileKeys: posTiles.map((tile) => tile.key),
      visibleTileKeys: filteredPosTiles.map((tile) => tile.key),
      activeTileKey: String(active.id),
      overTileKey: String(over.id),
    });

    if (JSON.stringify(nextTileOrder) === JSON.stringify(posTiles.map((tile) => tile.key))) {
      return;
    }

    persistWorkbenchTileOrder(nextTileOrder);
  }, [clearWorkbenchDragState, filteredPosTiles, persistWorkbenchTileOrder, posTiles, workbenchReorderLaneId]);
  const workbenchDndSensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: workbenchReorderMode ? 4 : 6,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );
  const posLineControllers = useMemo(() => {
    const nextLines = new Map<string, PosActiveLine>();

    for (const tile of posTiles) {
      if (tile.kind === 'stock') {
        const row = rows.find((entry) => entry.skuId === tile.entityId);
        const baseline = baselineStockRow(workingCatalog, stockBySku, tile.entityId);
        if (!row || !baseline) {
          continue;
        }
        const currentQuantity = row.unitsInStock;
        nextLines.set(tile.key, {
          key: tile.key,
          itemType: tile.itemType,
          title: tile.title,
          quantity: currentQuantity,
          unitAmount: row.costPerUnit,
          amountLabel: translateUiLiteral(language, 'Cost'),
          stepId: tile.stepId,
          setQuantity: (value) => {
            markPosLineTouched(tile.key);
            activatePosStep('stock');
            updateRow(tile.entityId, { unitsInStock: Math.max(0, value) });
          },
          increment: () => {
            markPosLineTouched(tile.key);
            activatePosStep('stock');
            updateRow(tile.entityId, { unitsInStock: currentQuantity + 1 });
          },
          decrement: () => {
            markPosLineTouched(tile.key);
            activatePosStep('stock');
            updateRow(tile.entityId, { unitsInStock: Math.max(0, currentQuantity - 1) });
          },
          remove: () => {
            clearPosLineTouched(tile.key);
            updateRow(tile.entityId, { unitsInStock: baseline.unitsInStock, costPerUnit: baseline.costPerUnit, productPrice: baseline.productPrice });
          },
        });
        continue;
      }

      if (tile.kind === 'retail') {
        const currentQuantity = Number(retailSalesDrafts[tile.entityId] ?? 0);
        const safeQuantity = Number.isFinite(currentQuantity) ? currentQuantity : 0;
        nextLines.set(tile.key, {
          key: tile.key,
          itemType: tile.itemType,
          title: tile.title,
          quantity: safeQuantity,
          unitAmount: tile.unitAmount,
          amountLabel: translateUiLiteral(language, 'Unit price'),
          stepId: tile.stepId,
          setQuantity: (value) => {
            const nextValue = Math.max(0, value);
            markPosLineTouched(tile.key);
            activatePosStep('retail-sales');
            updateRetailSalesDraft(tile.entityId, nextValue === 0 ? '' : String(nextValue));
            if (nextValue === 0) {
              clearPosLineTouched(tile.key);
            }
          },
          increment: () => {
            markPosLineTouched(tile.key);
            activatePosStep('retail-sales');
            updateRetailSalesDraft(tile.entityId, String(safeQuantity + 1));
          },
          decrement: () => {
            const nextValue = Math.max(0, safeQuantity - 1);
            markPosLineTouched(tile.key);
            activatePosStep('retail-sales');
            updateRetailSalesDraft(tile.entityId, nextValue === 0 ? '' : String(nextValue));
            if (nextValue === 0) {
              clearPosLineTouched(tile.key);
            }
          },
          remove: () => {
            clearPosLineTouched(tile.key);
            updateRetailSalesDraft(tile.entityId, '');
          },
        });
        continue;
      }

      if (tile.kind === 'service') {
        const currentQuantity = Number(serviceSalesDrafts[tile.entityId] ?? 0);
        const safeQuantity = Number.isFinite(currentQuantity) ? currentQuantity : 0;
        nextLines.set(tile.key, {
          key: tile.key,
          itemType: tile.itemType,
          title: tile.title,
          quantity: safeQuantity,
          unitAmount: tile.unitAmount,
          amountLabel: translateUiLiteral(language, 'Unit price'),
          stepId: tile.stepId,
          setQuantity: (value) => {
            const nextValue = Math.max(0, value);
            markPosLineTouched(tile.key);
            activatePosStep('service-sales');
            updateServiceSalesDraft(tile.entityId, nextValue === 0 ? '' : String(nextValue));
            if (nextValue === 0) {
              clearPosLineTouched(tile.key);
            }
          },
          increment: () => {
            markPosLineTouched(tile.key);
            activatePosStep('service-sales');
            updateServiceSalesDraft(tile.entityId, String(safeQuantity + 1));
          },
          decrement: () => {
            const nextValue = Math.max(0, safeQuantity - 1);
            markPosLineTouched(tile.key);
            activatePosStep('service-sales');
            updateServiceSalesDraft(tile.entityId, nextValue === 0 ? '' : String(nextValue));
            if (nextValue === 0) {
              clearPosLineTouched(tile.key);
            }
          },
          remove: () => {
            clearPosLineTouched(tile.key);
            updateServiceSalesDraft(tile.entityId, '');
          },
        });
        continue;
      }

      const currentQuantity = Number(
        tile.kind === 'supplier-order'
          ? skuSignalDrafts[tile.entityId]?.orderedQuantity ?? 0
          : skuSignalDrafts[tile.entityId]?.receiptQuantity ?? 0,
      );
      const safeQuantity = Number.isFinite(currentQuantity) ? currentQuantity : 0;
      const quantityField = tile.kind === 'supplier-order' ? 'orderedQuantity' : 'receiptQuantity';
      const stepId = tile.kind === 'supplier-order' ? 'reorder' : 'receipt';
      nextLines.set(tile.key, {
        key: tile.key,
        itemType: tile.itemType,
        title: tile.title,
        quantity: safeQuantity,
        unitAmount: tile.unitAmount,
        amountLabel: translateUiLiteral(language, 'Unit cost'),
        stepId,
        setQuantity: (value) => {
          const nextValue = Math.max(0, value);
          markPosLineTouched(tile.key);
          activatePosStep(stepId);
          updateSkuSignalDraft(tile.entityId, (draft) => ({
            ...draft,
            [quantityField]: nextValue === 0 ? '' : String(nextValue),
            ...(tile.kind === 'supplier-order' ? { orderEnabled: nextValue > 0 } : { receiptEnabled: nextValue > 0 }),
          }));
          if (nextValue === 0) {
            clearPosLineTouched(tile.key);
          }
        },
        increment: () => {
          markPosLineTouched(tile.key);
          activatePosStep(stepId);
          updateSkuSignalDraft(tile.entityId, (draft) => ({
            ...draft,
            [quantityField]: String(safeQuantity + 1),
            ...(tile.kind === 'supplier-order' ? { orderEnabled: true } : { receiptEnabled: true }),
          }));
        },
        decrement: () => {
          const nextValue = Math.max(0, safeQuantity - 1);
          markPosLineTouched(tile.key);
          activatePosStep(stepId);
          updateSkuSignalDraft(tile.entityId, (draft) => ({
            ...draft,
            [quantityField]: nextValue === 0 ? '' : String(nextValue),
            ...(tile.kind === 'supplier-order' ? { orderEnabled: nextValue > 0 } : { receiptEnabled: nextValue > 0 }),
          }));
          if (nextValue === 0) {
            clearPosLineTouched(tile.key);
          }
        },
        remove: () => {
          clearPosLineTouched(tile.key);
          updateSkuSignalDraft(tile.entityId, (draft) => ({
            ...draft,
            [quantityField]: '',
            ...(tile.kind === 'supplier-order' ? { orderEnabled: false } : { receiptEnabled: false }),
          }));
        },
      });
    }

    return nextLines;
  }, [
    activatePosStep,
    clearPosLineTouched,
    isCustomerPendingLane,
    language,
    markPosLineTouched,
    posTiles,
    retailSalesDrafts,
    rows,
    serviceSalesDrafts,
    skuSignalDrafts,
    stockBySku,
    updateRetailSalesDraft,
    updateRow,
    updateServiceSalesDraft,
    updateSkuSignalDraft,
    workingCatalog,
  ]);
  const posActiveLines = useMemo(
    () => [...posLineControllers.values()].filter((line) => line.quantity > 0).sort((left, right) => left.title.localeCompare(right.title)),
    [posLineControllers],
  );
  const posReceiptTextLines = useMemo<PosReceiptTextLine[]>(
    () =>
      posActiveLines.map((line) => ({
        title: line.title,
        quantity: line.quantity,
        unitPriceLabel:
          line.unitAmount == null
            ? translateUiLiteral(language, 'n/a')
            : formatCurrency(line.unitAmount, currency, language, usdToKhrExchangeRate),
        totalLabel:
          line.unitAmount == null
            ? translateUiLiteral(language, '{count} units', { count: line.quantity })
            : formatCurrency(line.unitAmount * line.quantity, currency, language, usdToKhrExchangeRate),
      })),
    [currency, language, posActiveLines, usdToKhrExchangeRate],
  );
  const posReceiptTotalLabel = useMemo(() => {
    if (deliveryFeeEnabled) {
      return deliveryTotalLabel;
    }
    const totalAmount = posActiveLines.reduce<number | null>((sum, line) => {
      if (line.unitAmount == null) {
        return sum;
      }
      return (sum ?? 0) + line.unitAmount * line.quantity;
    }, null);

    return totalAmount == null
      ? translateUiLiteral(language, 'n/a')
      : formatCurrency(totalAmount, currency, language, usdToKhrExchangeRate);
  }, [currency, deliveryFeeEnabled, deliveryTotalLabel, language, posActiveLines, usdToKhrExchangeRate]);
  const posReceiptPlainText = useMemo(() => {
    const lines = [
      translateUiLiteral(language, 'Receipt'),
      '',
      ...posReceiptTextLines.map((line) => `${line.title} (${line.quantity})`),
      '',
      ...(deliveryFeeEnabled
        ? [
            `${translateUiLiteral(language, 'Subtotal')}: ${deliverySubtotalLabel}`,
            `${translateUiLiteral(language, 'Delivery')}: ${deliveryDisplayLabel}`,
          ]
        : []),
      `${translateUiLiteral(language, 'Total')}: ${posReceiptTotalLabel}`,
    ];
    return lines.join('\n');
  }, [deliveryDisplayLabel, deliveryFeeEnabled, deliverySubtotalLabel, language, posReceiptTextLines, posReceiptTotalLabel]);
  const posDownstreamEffects = isCustomerPendingLane
    ? [
        translateUiLiteral(language, 'Pending customer queue will refresh.'),
        translateUiLiteral(language, 'Open quantity commitments will update.'),
      ]
    : isCustomerCompletedLane
      ? [
          translateUiLiteral(language, 'Realized customer sales will refresh.'),
          translateUiLiteral(language, 'Pending customer quantities will net down where relevant.'),
        ]
      : isSupplierPendingLane
        ? [
            translateUiLiteral(language, 'Pending supplier queue will refresh.'),
            translateUiLiteral(language, 'Incoming inventory commitments will update.'),
          ]
        : isSupplierReceiptLane
          ? [
              translateUiLiteral(language, 'Inventory on hand will refresh.'),
              translateUiLiteral(language, 'Pending supplier quantities will net down where relevant.'),
            ]
          : [
              translateUiLiteral(language, 'Inventory truth will refresh for touched SKUs.'),
              translateUiLiteral(language, 'Availability and reorder guidance will update after save.'),
            ];
  const activePosTile = useMemo(
    () => (activePosTileKey == null ? null : posTiles.find((tile) => tile.key === activePosTileKey) ?? null),
    [activePosTileKey, posTiles],
  );
  const stockCountPosChangedRows = useMemo<StockCountPosChangeRow[]>(() => {
    if (!stockCountPosMode) {
      return [];
    }

    return supplierFilteredRows.flatMap((row) => {
      const sku = skuById.get(row.skuId);
      const baseline = baselineStockRow(workingCatalog, stockBySku, row.skuId);
      if (!sku || !baseline) {
        return [];
      }

      const changedFields: StockCountPosChangeField[] = [];
      if (row.unitsInStock !== baseline.unitsInStock) {
        changedFields.push({
          key: 'units',
          label: translateUiLiteral(language, 'Units'),
          value: `${baseline.unitsInStock} → ${row.unitsInStock}`,
        });
      }
      if (row.costPerUnit !== baseline.costPerUnit) {
        changedFields.push({
          key: 'cost',
          label: translateUiLiteral(language, 'Cost'),
          value: `${
            baseline.costPerUnit == null
              ? translateUiLiteral(language, 'n/a')
              : formatCurrency(baseline.costPerUnit, currency, language, usdToKhrExchangeRate)
          } → ${
            row.costPerUnit == null
              ? translateUiLiteral(language, 'n/a')
              : formatCurrency(row.costPerUnit, currency, language, usdToKhrExchangeRate)
          }`,
        });
      }
      if (sku.soldAsProduct && row.productPrice !== baseline.productPrice) {
        changedFields.push({
          key: 'price',
          label: translateUiLiteral(language, 'Retail'),
          value: `${
            baseline.productPrice == null
              ? translateUiLiteral(language, 'n/a')
              : formatCurrency(baseline.productPrice, currency, language, usdToKhrExchangeRate)
          } → ${
            row.productPrice == null
              ? translateUiLiteral(language, 'n/a')
              : formatCurrency(row.productPrice, currency, language, usdToKhrExchangeRate)
          }`,
        });
      }
      if (skuSignalDrafts[row.skuId]?.blockedEnabled) {
        changedFields.push({
          key: 'flags',
          label: translateUiLiteral(language, 'Flags'),
          value:
            skuSignalDrafts[row.skuId]?.blockedState === 'stockout'
              ? translateUiLiteral(language, 'Stockout')
              : translateUiLiteral(language, 'Blocked'),
        });
      }

      return changedFields.length > 0
        ? [{
            key: `stock-change:${row.skuId}`,
            skuId: row.skuId,
            title: sku.name,
            imagePath: sku.imagePath ?? null,
            changedFields,
          }]
        : [];
    });
  }, [
    currency,
    language,
    skuById,
    skuSignalDrafts,
    stockBySku,
    stockCountPosMode,
    supplierFilteredRows,
    usdToKhrExchangeRate,
    workingCatalog,
  ]);
  const activePosTileLine = useMemo(
    () => (activePosTileKey == null ? null : posLineControllers.get(activePosTileKey) ?? null),
    [activePosTileKey, posLineControllers],
  );
  const activePosStockCountRow = useMemo(() => {
    if (!stockCountPosMode || activePosTile?.kind !== 'stock') {
      return null;
    }

    const sku = skuById.get(activePosTile.entityId);
    const row = rows.find((entry) => entry.skuId === activePosTile.entityId);
    const baseline = baselineStockRow(workingCatalog, stockBySku, activePosTile.entityId);
    if (!sku || !row || !baseline) {
      return null;
    }

    const flagDraft = skuSignalDrafts[activePosTile.entityId] ?? createEmptySkuSignalDraft();
    return {
      baseline,
      flagDraft,
      row,
      sku,
    };
  }, [activePosTile, rows, skuById, skuSignalDrafts, stockBySku, stockCountPosMode, workingCatalog]);
  useEffect(() => {
    if (activePosTileKey == null || !activePosTileLine) {
      setPosTileDialogQuantity('1');
      return;
    }
    setPosTileDialogQuantity(posDialogQuantityValue(activePosTileLine.quantity));
  }, [activePosTileKey]);
  const closePosTileDialog = useCallback(() => {
    setActivePosTileKey(null);
    setPosTileDialogQuantity('1');
  }, []);
  const resetActivePosStockCountChanges = useCallback(() => {
    if (!activePosStockCountRow) {
      return;
    }
    clearPosLineTouched(`stock:${activePosStockCountRow.sku.skuId}`);
    updateRow(activePosStockCountRow.sku.skuId, {
      unitsInStock: activePosStockCountRow.baseline.unitsInStock,
      costPerUnit: activePosStockCountRow.baseline.costPerUnit,
      productPrice: activePosStockCountRow.baseline.productPrice,
    });
    updateSkuSignalDraft(activePosStockCountRow.sku.skuId, (draft) => skuWithoutEventDraft(skuEventOnlyDraft(draft)));
  }, [activePosStockCountRow, clearPosLineTouched, updateRow, updateSkuSignalDraft]);
  const commitPosTileDialog = useCallback(() => {
    if (!activePosTileLine) {
      return;
    }
    const nextQuantity = parsePosQuantityInput(posTileDialogQuantity);
    activePosTileLine.setQuantity(nextQuantity);
    closePosTileDialog();
  }, [activePosTileLine, closePosTileDialog, posTileDialogQuantity]);
  const netStockDelta = rows.reduce((sum, row) => {
    if (!stockRowChanged(workingCatalog, stockBySku, row)) {
      return sum;
    }
    return sum + (row.unitsInStock - (stockBySku.get(row.skuId)?.unitsInStock ?? 0));
  }, 0);
  const retailUnits = Object.values(retailSalesDrafts).reduce((sum, value) => {
    if (value.trim() === '') {
      return sum;
    }
    const parsed = Number(value);
    return Number.isFinite(parsed) ? sum + parsed : sum;
  }, 0);
  const serviceUnits = Object.values(serviceSalesDrafts).reduce((sum, value) => {
    if (value.trim() === '') {
      return sum;
    }
    const parsed = Number(value);
    return Number.isFinite(parsed) ? sum + parsed : sum;
  }, 0);
  const orderUnits = Object.values(skuSignalDrafts).reduce((sum, draft) => {
    if (draft.orderedQuantity.trim() === '') {
      return sum;
    }
    const parsed = Number(draft.orderedQuantity);
    return Number.isFinite(parsed) ? sum + parsed : sum;
  }, 0);
  const receiptUnits = Object.values(skuSignalDrafts).reduce((sum, draft) => {
    if (draft.receiptQuantity.trim() === '') {
      return sum;
    }
    const parsed = Number(draft.receiptQuantity);
    return Number.isFinite(parsed) ? sum + parsed : sum;
  }, 0);
  const posSummaryMetrics =
    lane.id === 'stock-count'
      ? [
          { label: t('stockUpdateSessionRowsTouched'), value: String(countedSkuCount) },
          { label: t('stockUpdateSessionInventoryEffect'), value: netStockDelta >= 0 ? `+${netStockDelta}` : String(netStockDelta) },
          { label: t('stockUpdateAddFlags'), value: String(previewCounts.stockouts) },
        ]
      : isCustomerPendingLane
        ? [
            { label: t('stockUpdateSessionRetailLines'), value: String(retailSalesCount) },
            { label: t('stockUpdateSessionServiceLines'), value: String(serviceSalesCount) },
            { label: t('stockUpdateSessionOpenQuantityImpact'), value: String(retailUnits + serviceUnits) },
          ]
        : isCustomerCompletedLane
          ? [
              { label: t('stockUpdateSessionRetailLines'), value: String(retailSalesCount) },
              { label: t('stockUpdateSessionServiceLines'), value: String(serviceSalesCount) },
              { label: t('stockUpdateSessionRealizedCount'), value: String(previewCounts.customerCompleted) },
            ]
          : isSupplierPendingLane
            ? [
                { label: t('stockUpdateSessionOrderedRows'), value: String(orderSignalCount) },
                { label: t('stockUpdateSessionOrderedUnits'), value: String(orderUnits) },
                { label: t('stockUpdateSessionSupplierTicketEvents'), value: String(previewCounts.ticketEvents) },
              ]
            : [
                { label: t('stockUpdateSessionReceiptRows'), value: String(receiptSignalCount) },
                { label: t('stockUpdateSessionReceivedUnits'), value: String(receiptUnits) },
                { label: t('stockUpdateSessionInventoryIncreasePreview'), value: String(previewCounts.receiptArrived) },
              ];
  const observedAtPanel = (
    <WorkspacePanel
      className={recordUpdateWhiteCardClassName}
      descriptor={t(STOCK_UPDATE_STEP_COPY['observed-at'].descriptionKey)}
      style={recordUpdateWhiteCardStyle}
      footer={
        stepGuidance ? (
          <p className="text-sm text-muted-foreground">{stepGuidance}</p>
        ) : (
          <p className="text-sm text-muted-foreground">{t('stockUpdateObservedAtHelp')}</p>
        )
      }
      title={
        <SectionLabel
          tooltip={t('stockUpdateObservedAtTooltip')}
          tooltipLabel={t('stockUpdateObservedAt')}
        >
          {t(STOCK_UPDATE_STEP_COPY['observed-at'].titleKey)}
        </SectionLabel>
      }
    >
      <div className="grid gap-2">
        <Input
          aria-label={t('stockUpdateObservedAt')}
          required
          type="datetime-local"
          value={observedAt}
          onChange={(event) => setObservedAt(event.target.value)}
        />
      </div>
    </WorkspacePanel>
  );
  const reportNotesPanel = (
    <WorkspacePanel
      className={recordUpdateWhiteCardClassName}
      descriptor={t(STOCK_UPDATE_STEP_COPY['report-notes'].descriptionKey)}
      style={recordUpdateWhiteCardStyle}
      footer={<p className="text-sm text-muted-foreground">{t('stockUpdateNotesHelp')}</p>}
      title={
        <SectionLabel
          tooltip={t('stockUpdateNotesTooltip')}
          tooltipLabel={t('stockReportNotes')}
        >
          {t(STOCK_UPDATE_STEP_COPY['report-notes'].titleKey)}
        </SectionLabel>
      }
    >
      <div className="grid gap-2">
        {isCustomerTicketLane ? (
          <CustomerMetadataFields
            directory={customerDirectory}
            identity={customerIdentity}
            warning={customerIdentityWarning}
            onChange={updateCustomerIdentity}
          />
        ) : null}
        <Textarea
          aria-label={t('stockReportNotes')}
          className="min-h-32"
          placeholder={t(notesPlaceholderKey)}
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
        />
      </div>
    </WorkspacePanel>
  );
  const notesOnlyPanel = (
    <WorkspacePanel
      className={recordUpdateWhiteCardClassName}
      descriptor={t(STOCK_UPDATE_STEP_COPY['report-notes'].descriptionKey)}
      style={recordUpdateWhiteCardStyle}
      footer={<p className="text-sm text-muted-foreground">{t('stockUpdateNotesHelp')}</p>}
      title={
        <SectionLabel
          tooltip={t('stockUpdateNotesTooltip')}
          tooltipLabel={t('stockReportNotes')}
        >
          {t(STOCK_UPDATE_STEP_COPY['report-notes'].titleKey)}
        </SectionLabel>
      }
    >
      <Textarea
        aria-label={t('stockReportNotes')}
        className={cn('min-h-40', actionSheetTextareaClassName)}
        placeholder={t(notesPlaceholderKey)}
        value={notes}
        onChange={(event) => setNotes(event.target.value)}
      />
    </WorkspacePanel>
  );
  const customerMetadataPanel = isCustomerTicketLane ? (
    <WorkspacePanel
      className={recordUpdateWhiteCardClassName}
      descriptor={translateUiLiteral(language, 'Channel, customer name, and phone live in notes, but are stored as structured ticket fields.')}
      style={recordUpdateWhiteCardStyle}
      title={translateUiLiteral(language, 'Customer metadata')}
    >
      <CustomerMetadataFields
        directory={customerDirectory}
        identity={customerIdentity}
        warning={customerIdentityWarning}
        onChange={updateCustomerIdentity}
      />
    </WorkspacePanel>
  ) : null;
  const deliveryMetadataPanel = deliveryFeeEnabled ? (
    <WorkspacePanel
      className={recordUpdateWhiteCardClassName}
      descriptor={translateUiLiteral(language, 'Store the default delivery charge and who covers it for this order.')}
      style={recordUpdateWhiteCardStyle}
      title={translateUiLiteral(language, 'Delivery')}
    >
      <DeliveryFeeFields
        amountId="record-delivery-fee"
        amountLabel={translateUiLiteral(language, 'Fee amount')}
        amountValue={deliveryFeeAmount}
        lockedPayer={deliveryFeePayerLocked}
        payer={deliveryFeePayerLocked ? 'merchant' : deliveryFeePayer}
        onAmountChange={setDeliveryFeeAmount}
        onPayerChange={setDeliveryFeePayer}
      />
    </WorkspacePanel>
  ) : null;
  const contextPanel = (
    <WorkspacePanel
      className={recordUpdateWhiteCardClassName}
      descriptor={t(STOCK_UPDATE_STEP_COPY.context.descriptionKey)}
      style={recordUpdateWhiteCardStyle}
      footer={<p className="text-sm text-muted-foreground">{t('stockUpdateContextFooterEmpty')}</p>}
      title={
        <SectionLabel
          tooltip={t('stockUpdateRegimeHelp')}
          tooltipLabel={t('stockUpdateOverallRegime')}
        >
          {t('stockUpdateOverallRegime')} <span className="font-normal text-muted-foreground">{t('stockUpdateOptional')}</span>
        </SectionLabel>
      }
    >
      <RegimeFields regimeHint={regimeHint} setRegimeHint={setRegimeHint} />
    </WorkspacePanel>
  );
  const currentMetadataPanel =
    currentStepId === 'observed-at'
      ? observedAtPanel
      : currentStepId === 'report-notes'
        ? (
            <div className="grid gap-6">
              {reportNotesPanel}
              {deliveryMetadataPanel}
            </div>
          )
        : currentStepId === 'context'
          ? (
              <div className="grid gap-6">
                {deliveryMetadataPanel}
                {contextPanel}
              </div>
            )
          : null;
  const posTimingMetadataContent = (
    <div className="grid gap-2">
      <RecordUpdateFieldLabel htmlFor="pos-observed-at">{translateUiLiteral(language, 'Date and time')}</RecordUpdateFieldLabel>
      <Input
        aria-label={t('stockUpdateObservedAt')}
        id="pos-observed-at"
        required
        type="datetime-local"
        value={observedAt}
        onChange={(event) => setObservedAt(event.target.value)}
      />
    </div>
  );
  const posCustomerMetadataContent = isCustomerTicketLane ? (
    <CustomerMetadataFields
      compact
      directory={customerDirectory}
      identity={customerIdentity}
      warning={customerIdentityWarning}
      onChange={updateCustomerIdentity}
    />
  ) : null;
  const posNotesMetadataContent = (
    <div className="grid gap-2">
      <RecordUpdateFieldLabel htmlFor="pos-report-notes">{translateUiLiteral(language, 'Notes text')}</RecordUpdateFieldLabel>
      <Textarea
        aria-label={t('stockReportNotes')}
        className={cn('min-h-40', actionSheetTextareaClassName)}
        id="pos-report-notes"
        placeholder={t(notesPlaceholderKey)}
        value={notes}
        onChange={(event) => setNotes(event.target.value)}
      />
    </div>
  );
  const posContextMetadataContent = (
    <div className="grid gap-2">
      <RecordUpdateFieldLabel>{translateUiLiteral(language, 'Regime signal')}</RecordUpdateFieldLabel>
      <RegimeFields regimeHint={regimeHint} setRegimeHint={setRegimeHint} />
    </div>
  );
  const posDeliveryMetadataContent = deliveryFeeEnabled ? (
    <DeliveryFeeFields
      amountId="pos-delivery-fee"
      amountInputRef={posDeliveryFeeInputRef}
      amountLabel={translateUiLiteral(language, 'Fee amount')}
      amountValue={deliveryFeeAmount}
      lockedPayer={deliveryFeePayerLocked}
      payer={deliveryFeePayerLocked ? 'merchant' : deliveryFeePayer}
      onAmountChange={setDeliveryFeeAmount}
      onPayerChange={setDeliveryFeePayer}
    />
  ) : null;
  const activePosMetadataContent =
    activePosMetadataPopup === 'timing'
      ? posTimingMetadataContent
      : activePosMetadataPopup === 'customer'
        ? posCustomerMetadataContent
        : activePosMetadataPopup === 'notes'
          ? posNotesMetadataContent
          : activePosMetadataPopup === 'context'
            ? posContextMetadataContent
            : activePosMetadataPopup === 'delivery'
              ? posDeliveryMetadataContent
            : null;
  const activePosMetadataTitle =
    activePosMetadataPopup === 'timing'
      ? t('stockUpdateObservedAt')
      : activePosMetadataPopup === 'customer'
        ? translateUiLiteral(language, 'Customer metadata')
        : activePosMetadataPopup === 'notes'
          ? t('stockReportNotes')
          : activePosMetadataPopup === 'context'
            ? t('stockUpdateOverallRegime')
            : activePosMetadataPopup === 'delivery'
              ? translateUiLiteral(language, 'Delivery')
            : '';
  const activePosMetadataDescription =
    activePosMetadataPopup === 'timing'
      ? t('stockUpdateObservedAtHelp')
      : activePosMetadataPopup === 'customer'
        ? translateUiLiteral(language, 'Channel, customer name, and phone live in notes, but are stored as structured ticket fields.')
        : activePosMetadataPopup === 'notes'
          ? t('stockUpdateNotesHelp')
          : activePosMetadataPopup === 'context'
            ? t('stockUpdateContextFooterEmpty')
            : activePosMetadataPopup === 'delivery'
              ? translateUiLiteral(language, 'Set the delivery charge and choose whether the customer or merchant covers it.')
            : '';
  const posSummaryTitle = stockCountPosMode ? translateUiLiteral(language, 'Changed items') : translateUiLiteral(language, 'Receipt');
  const posSummaryDescriptor = stockCountPosMode
    ? translateUiLiteral(language, 'Changed SKU fields for the current record update.')
    : translateUiLiteral(language, 'Editable receipt for the current record update.');
  const posSummaryEmptyState = stockCountPosMode
    ? translateUiLiteral(language, 'No SKU changes yet. Open a tile to update units, cost, retail price, or flags.')
    : t('stockUpdateSessionNoLineItems');
  const posReviewActionLabel = stockCountPosMode
    ? translateUiLiteral(language, 'Review update')
    : translateUiLiteral(language, 'Review receipt');
  const posReviewDialogTitle = stockCountPosMode
    ? translateUiLiteral(language, 'Review update')
    : translateUiLiteral(language, 'Confirm receipt');
  const posReviewDialogDescription = stockCountPosMode
    ? translateUiLiteral(language, 'Review these stock-count changes before saving the record update. This is the final confirmation step.')
    : translateUiLiteral(language, 'Review this receipt before saving the record update. This is the final confirmation step.');
  const currentWorkbenchPanel =
    currentStepId === 'stock' ? (
      <StockCountStep
        catalog={workingCatalog}
        countedAtBySku={countedAtBySku}
        debugCellBoundaries={debugCellBoundaries}
        guidance={currentStepId === 'stock' ? stepGuidance : null}
        onReorderRows={handleStockRowReorder}
        rows={rows}
        stockBySku={stockBySku}
        supplierFilterControl={supplierFilterControl}
        updateRow={updateRow}
        visibleRows={visibleRows}
      />
    ) : currentStepId === 'reorder' ? (
      <RecordOrderStep
        catalog={workingCatalog}
        debugCellBoundaries={debugCellBoundaries}
        filterControl={supplierPendingStateFilterControl}
        guidance={currentStepId === 'reorder' ? stepGuidance : null}
        latestOrderAtBySku={latestOrderedAt}
        latestOrderQuantity={latestOrderedQuantity}
        leadTimeMeanDefaults={leadTimeMeanDefaults}
        leadTimeVariabilityDefaults={leadTimeVariabilityDefaults}
        mode={supplierPendingMode}
        modes={supplierPendingModeFilters}
        observedAtIso={observedAtIso}
        onReorderRows={handleStockRowReorder}
        orderRecommendationBySku={recommendedOrderBySku}
        recordOrderExpectedArrivalDate={recordOrderExpectedArrivalDate}
        recordOrderLeadTimeMeanDays={recordOrderLeadTimeMeanDays}
        recordOrderLeadTimeVariability={recordOrderLeadTimeVariability}
        rows={supplierFilteredRows}
        setRecordOrderExpectedArrivalDate={setRecordOrderExpectedArrivalDate}
        setRecordOrderLeadTimeMeanDays={setRecordOrderLeadTimeMeanDays}
        setRecordOrderLeadTimeVariability={setRecordOrderLeadTimeVariability}
        setMode={setSupplierPendingMode}
        skuSignalDrafts={skuSignalDrafts}
        supplierFilterControl={supplierFilterControl}
        updateSkuSignalDraft={updateSkuSignalDraft}
      />
    ) : currentStepId === 'receipt' ? (
      <RecordReceiptStep
        catalog={workingCatalog}
        debugCellBoundaries={debugCellBoundaries}
        filterControl={supplierReceiptStateFilterControl}
        guidance={currentStepId === 'receipt' ? stepGuidance : null}
        latestReceiptAtBySku={latestReceiptAt}
        latestReceiptQuantity={latestReceiptQuantity}
        mode={supplierReceiptMode}
        modes={supplierReceiptModeFilters}
        observedAtIso={observedAtIso}
        onReorderRows={handleStockRowReorder}
        recordReceiptReceivedDate={recordReceiptReceivedDate}
        rows={supplierFilteredRows}
        setRecordReceiptReceivedDate={setRecordReceiptReceivedDate}
        setMode={setSupplierReceiptMode}
        skuSignalDrafts={skuSignalDrafts}
        supplierFilterControl={supplierFilterControl}
        updateSkuSignalDraft={updateSkuSignalDraft}
      />
    ) : currentStepId === 'retail-sales' ? (
      isCustomerPendingLane ? (
        <CustomerPendingRetailStep
          catalog={workingCatalog}
          debugCellBoundaries={debugCellBoundaries}
          filterControl={customerPendingStateFilterControl}
          guidance={currentStepId === 'retail-sales' ? stepGuidance : null}
          latestOpenBySku={latestCustomerPendingBySku}
          mode={customerPendingMode}
          modes={customerPendingModeFilters}
          onReorderRows={handleRetailSalesRowReorder}
          retailSalesDrafts={retailSalesDrafts}
          retailSkuIds={retailSkuIds}
          setMode={setCustomerPendingMode}
          setRetailSalesDraft={updateRetailSalesDraft}
          supplierFilterControl={supplierFilterControl}
        />
      ) : (
        <SalesRetailStep
          catalog={workingCatalog}
          choice={retailSalesChoice}
          debugCellBoundaries={debugCellBoundaries}
          descriptor={customerCompletedMode === 'refund_reversal'
            ? translateUiLiteral(language, 'Record reversed customer completions and choose whether usable stock should return now or later.')
            : translateUiLiteral(language, 'Record fulfilled retail orders or immediate retail sales.')}
          filterControl={customerCompletedStateFilterControl}
          guidance={currentStepId === 'retail-sales' ? stepGuidance : null}
          helper={customerCompletedMode === 'refund_reversal'
            ? translateUiLiteral(language, 'Choose Yes when you know exact retail refunds or reversals for this interval. Choose No to keep only ordinal retail demand ranking.')
            : translateUiLiteral(language, 'Choose Yes when you know exact fulfilled retail counts for this interval. Choose No to record only ordinal ranking for SENA.')}
          latestSalesAtBySku={latestRetailSalesAt}
          latestSalesBySku={customerCompletedMode === 'from_pending' ? latestCustomerPendingBySku : latestRetailSales}
          mode={customerCompletedMode}
          modes={customerCompletedModeFilters}
          onChooseNo={() => setRetailSalesChoice('no')}
          onChooseYes={() => setRetailSalesChoice('yes')}
          onReorderRows={handleRetailSalesRowReorder}
          question={customerCompletedMode === 'refund_reversal'
            ? translateUiLiteral(language, 'Do you know the exact count of retail refunds or reversals this interval?')
            : translateUiLiteral(language, 'Do you know the exact count of completed retail orders this interval?')}
          refundMode={customerCompletedMode === 'refund_reversal'}
          refundStockReturnDrafts={refundStockReturnDrafts}
          retailRankingSeedValues={defaultRetailRankingIds}
          retailSalesDrafts={retailSalesDrafts}
          retailSkuIds={retailSkuIds}
          retailRankings={retailRankings}
          setRefundStockReturnDraft={updateRefundStockReturnDraft}
          setMode={setCustomerCompletedMode}
          setRetailRankings={setRetailRankings}
          setRetailSalesDraft={updateRetailSalesDraft}
          supplierFilterControl={supplierFilterControl}
          title={translateUiLiteral(language, customerCompletedMode === 'refund_reversal' ? 'Retail refunds / reversals' : 'Completed retail / sellable orders')}
        />
      )
    ) : currentStepId === 'service-sales' ? (
      isCustomerPendingLane ? (
        <CustomerPendingServiceStep
          catalog={workingCatalog}
          debugCellBoundaries={debugCellBoundaries}
          filterControl={customerPendingStateFilterControl}
          guidance={currentStepId === 'service-sales' ? stepGuidance : null}
          latestOpenByService={latestCustomerPendingByService}
          mode={customerPendingMode}
          modes={customerPendingModeFilters}
          onReorderRows={handleServiceSalesRowReorder}
          serviceIds={serviceIds}
          serviceSalesDrafts={serviceSalesDrafts}
          setMode={setCustomerPendingMode}
          setServiceSalesDraft={updateServiceSalesDraft}
          supplierFilterControl={supplierFilterControl}
        />
      ) : (
        <SalesServiceStep
          catalog={workingCatalog}
          choice={serviceSalesChoice}
          debugCellBoundaries={debugCellBoundaries}
          descriptor={customerCompletedMode === 'refund_reversal'
            ? translateUiLiteral(language, 'Record reversed service completions or refunds.')
            : translateUiLiteral(language, 'Record fulfilled service orders or immediate service sales.')}
          filterControl={customerCompletedStateFilterControl}
          guidance={currentStepId === 'service-sales' ? stepGuidance : null}
          helper={customerCompletedMode === 'refund_reversal'
            ? translateUiLiteral(language, 'Choose Yes when you know exact service refunds or reversals for this interval. Choose No to keep only ordinal service ranking.')
            : translateUiLiteral(language, 'Choose Yes when you know exact completed service counts for this interval. Choose No to record only ordinal ranking for SENA.')}
          latestSalesAtByService={latestServiceSalesAt}
          latestSalesByService={customerCompletedMode === 'from_pending' ? latestCustomerPendingByService : latestServiceSales}
          mode={customerCompletedMode}
          modes={customerCompletedModeFilters}
          onChooseNo={() => setServiceSalesChoice('no')}
          onChooseYes={() => setServiceSalesChoice('yes')}
          onReorderRows={handleServiceSalesRowReorder}
          question={customerCompletedMode === 'refund_reversal'
            ? translateUiLiteral(language, 'Do you know the exact count of service refunds or reversals this interval?')
            : translateUiLiteral(language, 'Do you know the exact count of completed service orders this interval?')}
          serviceIds={serviceIds}
          serviceRankingSeedValues={defaultServiceRankingIds}
          serviceSalesDrafts={serviceSalesDrafts}
          serviceRankings={serviceRankings}
          setMode={setCustomerCompletedMode}
          setServiceRankings={setServiceRankings}
          setServiceSalesDraft={updateServiceSalesDraft}
          supplierFilterControl={supplierFilterControl}
          title={translateUiLiteral(language, customerCompletedMode === 'refund_reversal' ? 'Service refunds / reversals' : 'Completed service orders')}
        />
      )
    ) : currentStepId === 'stock-cost' ? (
      <StockCostStep
        catalog={workingCatalog}
        choice={stockStepChoices['stock-cost']}
        countedAtBySku={countedAtBySku}
        currency={currency}
        debugCellBoundaries={debugCellBoundaries}
        guidance={currentStepId === 'stock-cost' ? stepGuidance : null}
        onReorderRows={handleStockRowReorder}
        rows={rows}
        stockBySku={stockBySku}
        usdToKhrExchangeRate={usdToKhrExchangeRate}
        updateRow={updateRow}
        visibleRows={visibleRows}
        supplierFilterControl={supplierFilterControl}
        onChooseNo={() => handleSkipOptionalStockStep('stock-cost')}
        onChooseYes={() => updateStockStepChoice('stock-cost', 'yes')}
      />
    ) : currentStepId === 'stock-price' ? (
      <StockRetailPriceStep
        catalog={workingCatalog}
        choice={stockStepChoices['stock-price']}
        countedAtBySku={countedAtBySku}
        currency={currency}
        debugCellBoundaries={debugCellBoundaries}
        guidance={currentStepId === 'stock-price' ? stepGuidance : null}
        onReorderRows={handleStockRowReorder}
        rows={rows}
        stockBySku={stockBySku}
        usdToKhrExchangeRate={usdToKhrExchangeRate}
        updateRow={updateRow}
        visibleRows={visibleRows}
        supplierFilterControl={supplierFilterControl}
        onChooseNo={() => handleSkipOptionalStockStep('stock-price')}
        onChooseYes={() => updateStockStepChoice('stock-price', 'yes')}
      />
    ) : currentStepId === 'stock-flags' ? (
      <StockFlagsStep
        catalog={workingCatalog}
        choice={stockStepChoices['stock-flags']}
        countedAtBySku={countedAtBySku}
        debugCellBoundaries={debugCellBoundaries}
        guidance={currentStepId === 'stock-flags' ? stepGuidance : null}
        onReorderRows={handleStockRowReorder}
        skuSignalDrafts={skuSignalDrafts}
        stockBySku={stockBySku}
        updateSkuSignalDraft={updateSkuSignalDraft}
        visibleRows={isCustomerCompletedLane ? salesFlagRows : visibleRows}
        supplierFilterControl={supplierFilterControl}
        onChooseNo={() => handleSkipOptionalStockStep('stock-flags')}
        onChooseYes={() => updateStockStepChoice('stock-flags', 'yes')}
      />
    ) : currentStepId === 'service' ? (
      <ServiceSignalsStep
        catalog={workingCatalog}
        currency={currency}
        debugCellBoundaries={debugCellBoundaries}
        guidance={currentStepId === 'service' ? stepGuidance : null}
        language={language}
        serviceSignalDrafts={serviceSignalDrafts}
        usdToKhrExchangeRate={usdToKhrExchangeRate}
        updateServiceSignalDraft={updateServiceSignalDraft}
        onToggleDebugCellBoundaries={() => setDebugCellBoundaries((current) => !current)}
      />
    ) : currentStepId === 'rankings' ? (
      <WorkspacePanel
        className={recordUpdateWhiteCardClassName}
        descriptor={t(STOCK_UPDATE_STEP_COPY.rankings.descriptionKey)}
        style={recordUpdateWhiteCardStyle}
        title={
          <SectionLabel
            tooltip={t('stockUpdateRankingsTooltip')}
            tooltipLabel={t('stockUpdateRankingsTooltipLabel')}
          >
            {t(STOCK_UPDATE_STEP_COPY.rankings.titleKey)}
          </SectionLabel>
        }
      >
        <div className="grid items-start gap-6 lg:grid-cols-2">
          <RankingSignalEditor
            catalog={workingCatalog}
            entryType="service"
            label={t('stockUpdateTopServicesLabel')}
            seedValues={defaultServiceRankingIds}
            values={serviceRankings}
            onChange={setServiceRankings}
          />
          <RankingSignalEditor
            catalog={workingCatalog}
            entryType="sku"
            label={t('stockUpdateTopRetailItemsLabel')}
            seedValues={defaultRetailRankingIds}
            values={retailRankings}
            onChange={setRetailRankings}
          />
        </div>
      </WorkspacePanel>
    ) : currentStepId === 'review' ? (
      <ReviewStep
        blockers={reviewBlockers}
        catalog={workingCatalog}
        error={error}
        payload={previewPayload}
        previewParts={previewParts}
        serviceSignalDrafts={serviceSignalDrafts}
        skuSignalDrafts={skuSignalDrafts}
      />
    ) : null;

  return (
    <WorkspacePage className="relative pb-32 md:pb-36">
      {isCustomerPendingLane ? (
        <TicketEntryPrompt
          family="customer"
          mode={customerTicketMode}
          onBeginEdit={() => setSelectedCustomerTicketId(null)}
          onBeginNew={() => setSelectedCustomerTicketId(null)}
          onDismiss={() => {
            setCustomerTicketMode(null);
            setSelectedCustomerTicketId(null);
            navigate(RECORD_UPDATE_HUB_PATH);
          }}
          options={customerTicketOptions}
          selectedTicketId={selectedCustomerTicketId}
          onModeChange={setCustomerTicketMode}
          onSelectTicket={(ticketId) => {
            setSelectedCustomerTicketId(ticketId);
            setCustomerTicketMode('edit');
          }}
        />
      ) : null}
      {isSupplierPendingLane ? (
        <TicketEntryPrompt
          family="supplier"
          mode={supplierTicketMode}
          onBeginEdit={() => setSelectedSupplierTicketId(null)}
          onBeginNew={() => setSelectedSupplierTicketId(null)}
          onDismiss={() => {
            setSupplierTicketMode(null);
            setSelectedSupplierTicketId(null);
            navigate(RECORD_UPDATE_HUB_PATH);
          }}
          options={supplierTicketOptions}
          selectedTicketId={selectedSupplierTicketId}
          onModeChange={setSupplierTicketMode}
          onSelectTicket={(ticketId) => {
            setSelectedSupplierTicketId(ticketId);
            setSupplierTicketMode('edit');
          }}
        />
      ) : null}
      <ConfirmActionDialog
        cancelLabel={translateUiLiteral(language, 'Cancel')}
        confirmLabel={translateUiLiteral(language, 'Replace draft')}
        confirmVariant="default"
        description={translateUiLiteral(language, 'You already have an in-progress logs update on this device. Replace it with the saved report you chose to edit?')}
        open={replaceDraftDialogOpen}
        title={translateUiLiteral(language, 'Replace saved draft?')}
        onCancel={() => {
          draftHydrationCheckedRef.current = false;
          setPendingEditSession(null);
          setReplaceDraftDialogOpen(false);
          navigate(location.pathname, { replace: true, state: null });
        }}
        onConfirm={() => {
          if (!(catalog ?? visibleCatalog) || !pendingEditSession) {
            setReplaceDraftDialogOpen(false);
            return;
          }
          skipNextDraftPersistRef.current = true;
          removeStockUpdateDraft(draftStorageKey);
          hydrateEditSession(pendingEditSession, buildOrderedInitialRows(catalog ?? visibleCatalog));
        }}
      />
      {discardConfirmDialog}
      <ConfirmActionDialog
        cancelLabel={translateUiLiteral(language, 'Keep editing')}
        confirmLabel={translateUiLiteral(language, 'Save draft and leave')}
        confirmVariant="default"
        description={translateUiLiteral(language, 'Save this in-progress record update as a draft before leaving?')}
        open={leaveDraftDialogOpen}
        title={translateUiLiteral(language, 'Leave record update?')}
        onCancel={() => {
          pendingNavigationRef.current = null;
          setLeaveDraftDialogOpen(false);
        }}
        onConfirm={() => {
          const pendingNavigation = pendingNavigationRef.current;
          pendingNavigationRef.current = null;
          persistDraftForLater();
          setLeaveDraftDialogOpen(false);
          pendingNavigation?.continueNavigation();
        }}
      />
      <ConfirmActionDialog
        cancelLabel={translateUiLiteral(language, 'Keep reordering')}
        confirmLabel={translateUiLiteral(language, 'Done')}
        confirmVariant="default"
        description={translateUiLiteral(language, 'Finish and save this card ordering before doing anything else in POS view.')}
        open={workbenchReorderPromptOpen}
        title={translateUiLiteral(language, 'Save ordering first?')}
        onCancel={() => {
          pendingWorkbenchInteractionRef.current = null;
          setWorkbenchReorderPromptOpen(false);
        }}
        onConfirm={() => {
          finishWorkbenchReorderMode(true);
        }}
      />
      <WorkspaceTitleCard
        actions={titleActions}
        floatingActions={floatingTitleActions}
        descriptor={
          latestAt
            ? t('stockUpdateDescriptorWithHistory', {
                date: formatSenaDateTime(latestAt, language),
                suffix:
                  intervalDays == null
                    ? ''
                    : t('stockUpdateDescriptorIntervalSuffix', { days: intervalDays }),
              })
            : t('stockUpdateDescriptorFirst')
        }
        title={
          <span className="flex min-w-0 items-center gap-4">
            <Link
              aria-label={t('stockSessionBack')}
              className="inline-flex size-10 shrink-0 items-center justify-center rounded-full text-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/70"
              to={RECORD_UPDATE_HUB_PATH}
            >
              <NavigationBackIcon className="size-5" />
            </Link>
            <span className="min-w-0">{translateUiLiteral(language, lane.title)}</span>
          </span>
        }
      >
        <div className="grid gap-5">
          {sessionViewMode === 'pos' ? (
            <div className="flex w-full flex-wrap gap-3">
              {metadataSections.map((section) => {
                const active = activePosMetadataPopup === section.id;
                const Icon = section.icon;
                return (
                  <Button
                    key={section.id}
                    className={cn(
                      'h-auto min-w-[12rem] flex-1 items-start justify-start rounded-[1.25rem] px-4 py-3 text-left',
                      active ? 'text-background' : 'bg-white',
                    )}
                    type="button"
                    variant={active ? 'default' : 'outline'}
                    onClick={() => {
                      guardWorkbenchReorderInteraction(() => {
                        selectStep(section.stepId);
                        setActivePosMetadataPopup(section.id);
                      });
                    }}
                  >
                    <span className="grid gap-1">
                      <span className="flex items-center gap-2">
                        <Icon className={cn('size-4 shrink-0', active ? 'text-background/80' : 'text-muted-foreground')} />
                        <span className={cn('text-[11px] font-semibold uppercase tracking-[0.2em]', active ? 'text-background/80' : 'text-muted-foreground')}>
                          {section.label}
                        </span>
                      </span>
                      <span className={cn('text-sm font-medium', active ? 'text-background' : 'text-foreground')}>
                        {section.summary}
                      </span>
                    </span>
                  </Button>
                );
              })}
            </div>
          ) : null}
          <div className={sessionViewMode === 'pos' ? 'sr-only' : undefined}>
            <StepWizard
              currentStepId={currentStepId}
              percentComplete={(unlockedStepCount / activeStepOrder.length) * 100}
              steps={stepStates}
              unlockedStepCount={unlockedStepCount}
              onStepSelect={(stepId) => selectStep(stepId as StockUpdateStepId)}
            />

            {showHeartbeatRibbons ? <MetricRibbon items={summaryRibbonItems} /> : null}
          </div>
        </div>
      </WorkspaceTitleCard>

      <form id="stock-update-session-form" className="grid gap-6" onSubmit={(event) => void handleSubmit(event)}>
        {sessionViewMode === 'pos' ? (
          <div className="grid gap-6">
            <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_clamp(28rem,31vw,34rem)]">
              <section
                className={cn(
                  'min-w-0 overflow-hidden rounded-[1.9rem] border border-border/70 bg-white shadow-[0_18px_60px_rgba(48,31,20,0.08)]',
                  workbenchReorderMode && 'relative z-30',
                )}
              >
                <div className="border-b border-border/60 px-5 py-5">
                  <div className="flex flex-col gap-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted-foreground">
                          {translateUiLiteral(language, 'Main workbench')}
                        </p>
                        <p className="mt-1 text-sm text-muted-foreground">
                          {workbenchReorderLaneId
                            ? translateUiLiteral(
                                language,
                                workbenchReorderMode
                                  ? 'Drag cards to rearrange this bucket. Tap Done, press Escape, or tap empty space to exit.'
                                  : stockCountPosMode
                                    ? 'Tap a tile to update this SKU. Drag a card to rearrange this bucket.'
                                    : 'Tap a tile to set quantity. Drag a card to rearrange this bucket.',
                              )
                            : translateUiLiteral(
                                language,
                                stockCountPosMode
                                  ? 'Tap a tile to update units, price, cost, or flags, then review the changed SKU summary.'
                                  : 'Tap a tile to set quantity, then review the line in the receipt.',
                              )}
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center justify-end gap-3">
                        {stepGuidance ? (
                          <p className="max-w-sm text-sm leading-6 text-muted-foreground">{stepGuidance}</p>
                        ) : null}
                        {workbenchReorderLaneId && workbenchReorderMode ? (
                          <Button
                            size="sm"
                            type="button"
                            variant="outline"
                            onClick={() => {
                              finishWorkbenchReorderMode(false);
                            }}
                          >
                            <ActionConfirmIcon className="size-4" />
                            {translateUiLiteral(language, 'Done')}
                          </Button>
                        ) : null}
                      </div>
                    </div>
                    <div className="flex flex-col gap-3 xl:flex-row xl:items-center">
                      <SearchInput
                        aria-label={translateUiLiteral(language, 'Search workbench items')}
                        className="h-11 min-w-[18rem] max-w-xl rounded-full border border-border/70 bg-white shadow-none"
                        inputClassName="bg-transparent"
                        placeholder={translateUiLiteral(language, 'Search items, services, or SKUs')}
                        value={posWorkbenchSearch}
                        onFocus={(event) => {
                          if (workbenchReorderMode) {
                            event.target.blur();
                            requestWorkbenchReorderPrompt();
                          }
                        }}
                        onPointerDown={(event) => {
                          if (!workbenchReorderMode) {
                            return;
                          }
                          event.preventDefault();
                          requestWorkbenchReorderPrompt();
                        }}
                        onChange={(event) => setPosWorkbenchSearch(event.target.value)}
                      />
                      <ToggleGroup
                        aria-label={translateUiLiteral(language, 'Workbench filters')}
                        className="max-w-full justify-start self-start overflow-x-auto rounded-full bg-muted/40"
                        size="lg"
                        spacing={1}
                        type="single"
                        value={posWorkbenchFilter}
                        onValueChange={(nextValue) => {
                          if (workbenchReorderMode) {
                            requestWorkbenchReorderPrompt();
                            return;
                          }
                          if (nextValue) {
                            setPosWorkbenchFilter(nextValue as PosWorkbenchFilterId);
                          }
                        }}
                      >
                        {posFilterOptions.map((option) => (
                          <ToggleGroupItem
                            key={option.id}
                            className="rounded-full border border-transparent px-4 text-sm"
                            value={option.id}
                          >
                            <option.icon data-icon="inline-start" className="size-4" />
                            {option.label}
                          </ToggleGroupItem>
                        ))}
                      </ToggleGroup>
                    </div>
                  </div>
                </div>

                <div
                  className="px-5 py-5"
                  onClick={(event) => {
                    if (event.target !== event.currentTarget) {
                      return;
                    }
                    if (!workbenchReorderMode) {
                      return;
                    }
                    requestWorkbenchReorderPrompt();
                  }}
                >
                  {filteredPosTiles.length > 0 ? (
                    workbenchReorderLaneId ? (
                      <DndContext
                        collisionDetection={closestCenter}
                        sensors={workbenchDndSensors}
                        onDragCancel={handleWorkbenchDragCancel}
                        onDragEnd={handleWorkbenchDragEnd}
                        onDragStart={handleWorkbenchDragStart}
                      >
                        <SortableContext items={filteredPosTiles.map((tile) => tile.key)} strategy={rectSortingStrategy}>
                          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                            {filteredPosTiles.map((tile) => (
                              <SortableWorkbenchTile
                                key={tile.key}
                                onHoldEnd={endWorkbenchHold}
                                onHoldStart={beginWorkbenchHold}
                                reorderMode={workbenchReorderMode}
                                tile={tile}
                                onActivate={(nextTile) => {
                                  guardWorkbenchReorderInteraction(() => {
                                    activatePosStep(nextTile.stepId);
                                    setActivePosTileKey(nextTile.key);
                                  });
                                }}
                              />
                            ))}
                          </div>
                        </SortableContext>
                        {createPortal(
                          <DragOverlay>
                            {activeWorkbenchDragTile ? (
                              <div
                                className={cn(
                                  workbenchTileButtonClassName({ isDragging: true, reorderMode: true }),
                                  'w-[min(20rem,32vw)]',
                                )}
                              >
                                <WorkbenchTileVisual isDragging reorderMode tile={activeWorkbenchDragTile} />
                              </div>
                            ) : null}
                          </DragOverlay>,
                          document.body,
                        )}
                      </DndContext>
                    ) : (
                      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                        {filteredPosTiles.map((tile) => (
                          <button
                            key={tile.key}
                            className={workbenchTileButtonClassName({})}
                            type="button"
                            onClick={() => {
                              guardWorkbenchReorderInteraction(() => {
                                activatePosStep(tile.stepId);
                                setActivePosTileKey(tile.key);
                              });
                            }}
                          >
                            <WorkbenchTileVisual tile={tile} />
                          </button>
                        ))}
                      </div>
                    )
                  ) : (
                    <div className="rounded-[1.45rem] border border-dashed border-border/70 bg-background/75 px-4 py-8 text-sm text-muted-foreground">
                      {translateUiLiteral(language, 'No workbench items match the current search and filter.')}
                    </div>
                  )}
                </div>

              </section>

              <div className="min-w-0 grid gap-4">
                <WorkspacePanel
                  className={recordUpdateWhiteCardClassName}
                  descriptor={posSummaryDescriptor}
                  style={recordUpdateWhiteCardStyle}
                  title={posSummaryTitle}
                >
                  <div className="grid gap-4">
                    <div className="grid gap-2">
                      {stockCountPosMode ? (
                        <StockCountPosChangeTable
                          changedRows={stockCountPosChangedRows}
                          emptyState={posSummaryEmptyState}
                          language={language}
                          onOpenRow={(row) => guardWorkbenchReorderInteraction(() => setActivePosTileKey(`stock:${row.skuId}`))}
                        />
                      ) : posActiveLines.length > 0 ? (
                        <div className="grid gap-0">
                          <div className="grid grid-cols-[minmax(0,0.86fr)_3.5rem_minmax(0,1.34fr)] items-end gap-3 border-b border-border/60 px-3 py-2">
                            <p className="text-[0.72rem] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                              {translateUiLiteral(language, 'Item')}
                            </p>
                            <p className="text-center text-[0.72rem] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                              {translateUiLiteral(language, 'Qty')}
                            </p>
                            <p className="text-[0.72rem] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                              {translateUiLiteral(language, 'Pricing')}
                            </p>
                          </div>
                          <div className="divide-y divide-border/60">
                            {posActiveLines.map((line) => (
                              <PosReceiptLineEditor
                                key={line.key}
                                currency={currency}
                                language={language}
                                line={line}
                                onOpen={() => guardWorkbenchReorderInteraction(() => setActivePosTileKey(line.key))}
                                usdToKhrExchangeRate={usdToKhrExchangeRate}
                              />
                            ))}
                          </div>
                          <div className="mt-3 border-t border-border/60 px-3 pt-3">
                            {deliveryFeeEnabled ? (
                              <div className="grid gap-2">
                                <div className="grid grid-cols-[minmax(0,0.86fr)_3.5rem_minmax(0,1.34fr)] items-center gap-3">
                                  <p className="text-sm text-muted-foreground">{translateUiLiteral(language, 'Subtotal')}</p>
                                  <span aria-hidden="true" />
                                  <p className="text-right font-medium text-foreground tabular-nums">{deliverySubtotalLabel}</p>
                                </div>
                                <div className="grid grid-cols-[minmax(0,0.86fr)_3.5rem_minmax(0,1.34fr)] items-center gap-3">
                                  <p className="text-sm text-muted-foreground">{translateUiLiteral(language, 'Delivery')}</p>
                                  <span aria-hidden="true" />
                                  <p className="text-right font-medium text-foreground tabular-nums">{deliveryDisplayLabel}</p>
                                </div>
                                <div className="grid grid-cols-[minmax(0,0.86fr)_3.5rem_minmax(0,1.34fr)] items-center gap-3">
                                  <p className="text-base font-semibold text-foreground">
                                    {translateUiLiteral(language, 'Total')}
                                  </p>
                                  <span aria-hidden="true" />
                                  <p className="text-right text-lg font-semibold text-foreground tabular-nums">
                                    {posReceiptTotalLabel}
                                  </p>
                                </div>
                              </div>
                            ) : (
                              <div className="grid grid-cols-[minmax(0,0.86fr)_3.5rem_minmax(0,1.34fr)] items-center gap-3">
                                <p className="text-base font-semibold text-foreground">
                                  {translateUiLiteral(language, 'Total')}
                                </p>
                                <span aria-hidden="true" />
                                <p className="text-right text-lg font-semibold text-foreground tabular-nums">
                                  {posReceiptTotalLabel}
                                </p>
                              </div>
                            )}
                          </div>
                        </div>
                      ) : (
                        <p className="rounded-2xl border border-dashed border-border/70 bg-background/80 px-3 py-4 text-sm text-muted-foreground">
                          {posSummaryEmptyState}
                        </p>
                      )}
                    </div>

                    <div className="grid gap-2">
                      {error ? (
                        <p className="rounded-2xl border border-destructive/30 bg-destructive/10 px-3 py-3 text-sm text-destructive">
                          {error}
                        </p>
                      ) : null}
                      {reviewBlockers.length > 0 ? (
                        <div className="grid gap-2">
                          {reviewBlockers.map((blocker) => (
                            <p key={blocker} className="text-sm text-muted-foreground">
                              {blocker}
                            </p>
                          ))}
                        </div>
                      ) : null}
                      <div className="flex flex-wrap justify-end gap-2">
                        <Button
                          disabled={!canDiscardChanges}
                          type="button"
                          variant="destructive-outline"
                          onClick={() => {
                            guardWorkbenchReorderInteraction(() => clearCurrentSession());
                          }}
                        >
                          <ActionDeleteIcon className="size-4" />
                          {translateUiLiteral(language, 'Clear session')}
                        </Button>
                        <Button
                          disabled={submitDisabled}
                          form="stock-update-session-form"
                          type="submit"
                          onClick={(event) => {
                            if (!workbenchReorderMode) {
                              return;
                            }
                            event.preventDefault();
                            requestWorkbenchReorderPrompt();
                          }}
                        >
                          <EntityReceiptDocumentIcon className="size-4" />
                          {isSaving ? t('catalogSenaSkuSaving') : posReviewActionLabel}
                        </Button>
                      </div>
                    </div>
                  </div>
                </WorkspacePanel>
              </div>
            </div>
          </div>
        ) : (
          currentMetadataPanel ?? currentWorkbenchPanel
        )}
      </form>
      {sessionViewMode === 'pos' && workbenchReorderMode ? (
        <button
          aria-label={translateUiLiteral(language, 'Save ordering first')}
          className="fixed inset-0 z-20 bg-transparent"
          type="button"
          onClick={() => requestWorkbenchReorderPrompt()}
        />
      ) : null}
      <DialogPrimitive.Root
        open={sessionViewMode === 'pos' && activePosTile != null && (stockCountPosMode ? activePosStockCountRow != null : activePosTileLine != null)}
        onOpenChange={(open) => {
          if (!open) {
            closePosTileDialog();
          }
        }}
      >
        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay className="fixed inset-0 z-[90] bg-[rgba(29,20,12,0.42)] backdrop-blur-sm data-[state=open]:animate-in data-[state=open]:fade-in-0" />
          {activePosTile && stockCountPosMode && activePosStockCountRow ? (
            <DialogPrimitive.Content className="fixed left-1/2 top-1/2 z-[100] grid w-[calc(100vw-2rem)] max-w-2xl -translate-x-1/2 -translate-y-1/2 gap-6 rounded-[1.9rem] border border-border/70 bg-white p-6 shadow-[0_28px_90px_rgba(48,31,20,0.18)]">
              <div className="flex items-start justify-between gap-4">
                <div className="flex min-w-0 items-center gap-4">
                  <ItemAvatar imagePath={activePosTile.imagePath} name={activePosTile.title} size="hero" type={activePosTile.itemType} />
                  <div className="min-w-0">
                    <DialogPrimitive.Title className="truncate text-3xl font-semibold tracking-[-0.04em] text-foreground">
                      {activePosTile.title}
                    </DialogPrimitive.Title>
                    <DialogPrimitive.Description className="mt-1 text-base leading-7 text-muted-foreground">
                      {translateUiLiteral(language, 'Review and update this SKU directly from POS view.')}
                    </DialogPrimitive.Description>
                  </div>
                </div>
              </div>

              <div className="grid gap-5">
                <div className="grid gap-3">
                  <RecordUpdateFieldLabel className="text-sm tracking-[0.24em]" htmlFor="pos-stock-units">{translateUiLiteral(language, 'Units in stock')}</RecordUpdateFieldLabel>
                  <Input
                    aria-label={translateUiLiteral(language, 'Units in stock')}
                    className={cn(recordUpdateInputClassName, '!h-13 rounded-[1.15rem] px-5 !text-lg md:!text-lg')}
                    id="pos-stock-units"
                    min="0"
                    type="number"
                    value={String(activePosStockCountRow.row.unitsInStock)}
                    onChange={(event) => {
                      markPosLineTouched(activePosTile.key);
                      activatePosStep('stock');
                      updateRow(activePosStockCountRow.sku.skuId, {
                        unitsInStock:
                          event.target.value === ''
                            ? activePosStockCountRow.baseline.unitsInStock
                            : Math.max(0, Number(event.target.value)),
                      });
                    }}
                  />
                  <p className="text-sm text-muted-foreground">
                    {translateUiLiteral(language, 'Baseline: {count}', { count: activePosStockCountRow.baseline.unitsInStock })}
                  </p>
                </div>
                <div className="grid gap-3">
                  <RecordUpdateFieldLabel className="text-sm tracking-[0.24em]" htmlFor="pos-stock-cost">{translateUiLiteral(language, 'Cost per unit')}</RecordUpdateFieldLabel>
                  <Input
                    aria-label={translateUiLiteral(language, 'Cost per unit')}
                    className={cn(recordUpdateInputClassName, '!h-13 rounded-[1.15rem] px-5 !text-lg md:!text-lg')}
                    id="pos-stock-cost"
                    min="0"
                    step={moneyInputStep(currency)}
                    type="number"
                    value={
                      activePosStockCountRow.row.costPerUnit == null
                        ? ''
                        : displayMoneyFromUsd(activePosStockCountRow.row.costPerUnit, currency, usdToKhrExchangeRate)
                    }
                    onChange={(event) => {
                      markPosLineTouched(activePosTile.key);
                      activatePosStep('stock');
                      updateRow(activePosStockCountRow.sku.skuId, {
                        costPerUnit: event.target.value === ''
                          ? activePosStockCountRow.baseline.costPerUnit
                          : usdMoneyFromDisplay(Number(event.target.value), currency, usdToKhrExchangeRate),
                      });
                    }}
                  />
                  <p className="text-sm text-muted-foreground">
                    {translateUiLiteral(language, 'Baseline: {amount}', {
                      amount:
                        activePosStockCountRow.baseline.costPerUnit == null
                          ? translateUiLiteral(language, 'n/a')
                          : formatCurrency(activePosStockCountRow.baseline.costPerUnit, currency, language, usdToKhrExchangeRate),
                    })}
                  </p>
                </div>
                {activePosStockCountRow.sku.soldAsProduct ? (
                  <div className="grid gap-3">
                    <RecordUpdateFieldLabel className="text-sm tracking-[0.24em]" htmlFor="pos-stock-price">{translateUiLiteral(language, 'Retail price')}</RecordUpdateFieldLabel>
                    <Input
                      aria-label={translateUiLiteral(language, 'Retail price')}
                      className={cn(recordUpdateInputClassName, '!h-13 rounded-[1.15rem] px-5 !text-lg md:!text-lg')}
                      id="pos-stock-price"
                      min="0"
                      step={moneyInputStep(currency)}
                      type="number"
                      value={
                        activePosStockCountRow.row.productPrice == null
                          ? ''
                          : displayMoneyFromUsd(activePosStockCountRow.row.productPrice, currency, usdToKhrExchangeRate)
                      }
                      onChange={(event) => {
                        markPosLineTouched(activePosTile.key);
                        activatePosStep('stock');
                        updateRow(activePosStockCountRow.sku.skuId, {
                          productPrice: event.target.value === ''
                            ? activePosStockCountRow.baseline.productPrice
                            : usdMoneyFromDisplay(Number(event.target.value), currency, usdToKhrExchangeRate),
                        });
                      }}
                    />
                    <p className="text-sm text-muted-foreground">
                      {translateUiLiteral(language, 'Baseline: {amount}', {
                        amount:
                          activePosStockCountRow.baseline.productPrice == null
                            ? translateUiLiteral(language, 'n/a')
                            : formatCurrency(activePosStockCountRow.baseline.productPrice, currency, language, usdToKhrExchangeRate),
                      })}
                    </p>
                  </div>
                ) : null}
                <div className="grid gap-3">
                  <RecordUpdateFieldLabel className="text-sm tracking-[0.24em]">{translateUiLiteral(language, 'Flags')}</RecordUpdateFieldLabel>
                  <Select
                    value={activePosStockCountRow.flagDraft.blockedEnabled ? activePosStockCountRow.flagDraft.blockedState : 'none'}
                    onValueChange={(value) => {
                      markPosLineTouched(activePosTile.key);
                      activatePosStep('stock');
                      updateSkuSignalDraft(activePosStockCountRow.sku.skuId, (draft) => ({
                        ...skuEventOnlyDraft(draft),
                        blockedEnabled: value !== 'none',
                        blockedState: value === 'stockout' ? 'stockout' : 'blocked',
                      }));
                    }}
                  >
                    <SelectTrigger
                      aria-label={translateUiLiteral(language, 'Flags')}
                      className={cn(recordUpdateSelectTriggerClassName, 'w-full justify-between !h-13 rounded-[1.15rem] px-5 !text-lg md:!text-lg')}
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="z-[110] text-base">
                      <SelectItem className="py-2.5 pl-3 pr-9 !text-base" value="none">
                        <span className="flex items-center gap-2">
                          <StatusReadyIcon aria-hidden="true" className="size-4" />
                          <span>{translateUiLiteral(language, 'No event')}</span>
                        </span>
                      </SelectItem>
                      <SelectItem className="py-2.5 pl-3 pr-9 !text-base" value="blocked">
                        <span className="flex items-center gap-2">
                          <StatusWarningIcon aria-hidden="true" className="size-4" />
                          <span>{translateUiLiteral(language, 'Blocked')}</span>
                        </span>
                      </SelectItem>
                      <SelectItem className="py-2.5 pl-3 pr-9 !text-base" value="stockout">
                        <span className="flex items-center gap-2">
                          <EntityFlagIcon aria-hidden="true" className="size-4" />
                          <span>{translateUiLiteral(language, 'Stockout')}</span>
                        </span>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3">
                <Button className="h-12 rounded-xl px-5 text-base" type="button" variant="outline" onClick={resetActivePosStockCountChanges}>
                  <ActionUndoIcon data-icon="inline-start" />
                  {translateUiLiteral(language, 'Reset changes')}
                </Button>
                <div className="flex flex-wrap gap-2">
                  <Button className="h-12 rounded-xl px-6 text-base" type="button" onClick={closePosTileDialog}>
                    <ActionConfirmIcon data-icon="inline-start" />
                    {translateUiLiteral(language, 'Done')}
                  </Button>
                </div>
              </div>
            </DialogPrimitive.Content>
          ) : activePosTile && activePosTileLine ? (
            <DialogPrimitive.Content className="fixed left-1/2 top-1/2 z-[100] grid w-[calc(100vw-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 gap-6 rounded-[1.9rem] border border-border/70 bg-white p-6 shadow-[0_28px_90px_rgba(48,31,20,0.18)]">
              <div className="flex items-start justify-between gap-4">
                <div className="flex min-w-0 items-center gap-4">
                  <ItemAvatar imagePath={activePosTile.imagePath} name={activePosTile.title} size="hero" type={activePosTile.itemType} />
                  <div className="min-w-0">
                    <DialogPrimitive.Title className="truncate text-2xl font-semibold tracking-[-0.04em] text-foreground">
                      {activePosTile.title}
                    </DialogPrimitive.Title>
                    <DialogPrimitive.Description className="mt-1 text-sm text-muted-foreground">
                      {translateUiLiteral(language, 'Choose the quantity for this receipt line and review the pricing before adding it.')}
                    </DialogPrimitive.Description>
                  </div>
                </div>
              </div>

              <div className="grid gap-3">
                <PosQuantityEditor
                  decrementLabel={translateUiLiteral(language, 'Decrease {name}', { name: activePosTile.title })}
                  incrementLabel={translateUiLiteral(language, 'Increase {name}', { name: activePosTile.title })}
                  inputLabel={translateUiLiteral(language, 'Quantity for {name}', { name: activePosTile.title })}
                  inputValue={posTileDialogQuantity}
                  language={language}
                  onDecrement={() =>
                    setPosTileDialogQuantity((current) => String(Math.max(0, parsePosQuantityInput(current) - 1)))
                  }
                  onIncrement={() =>
                    setPosTileDialogQuantity((current) => String(Math.max(0, parsePosQuantityInput(current) + 1)))
                  }
                  onInputChange={setPosTileDialogQuantity}
                />
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-[1.35rem] border border-border/70 bg-background/70 px-4 py-4">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{activePosTileLine.amountLabel}</p>
                  <p className="mt-2 text-lg font-semibold text-foreground">
                    {activePosTileLine.unitAmount == null
                      ? translateUiLiteral(language, 'n/a')
                      : formatCurrency(activePosTileLine.unitAmount, currency, language, usdToKhrExchangeRate)}
                  </p>
                </div>
                <div className="rounded-[1.35rem] border border-border/70 bg-background/70 px-4 py-4">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                    {translateUiLiteral(language, 'Item subtotal')}
                  </p>
                  <p className="mt-2 text-lg font-semibold text-foreground">
                    {activePosTileLine.unitAmount == null
                      ? translateUiLiteral(language, '{count} units', {
                          count: Number.isFinite(Number(posTileDialogQuantity)) ? Math.max(0, Math.trunc(Number(posTileDialogQuantity))) : 0,
                        })
                      : formatCurrency(
                          Math.max(0, Math.trunc(Number(posTileDialogQuantity) || 0)) * activePosTileLine.unitAmount,
                          currency,
                          language,
                          usdToKhrExchangeRate,
                        )}
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3">
                {activePosTileLine.quantity > 0 ? (
                  <Button type="button" variant="destructive-outline" onClick={() => {
                    activePosTileLine.remove();
                    closePosTileDialog();
                  }}>
                    <ActionDeleteIcon className="size-4" />
                    {translateUiLiteral(language, 'Remove line')}
                  </Button>
                ) : (
                  <span />
                )}
                <div className="flex flex-wrap gap-2">
                  <Button type="button" variant="outline" onClick={closePosTileDialog}>
                    <ActionCloseIcon data-icon="inline-start" />
                    {translateUiLiteral(language, 'Cancel')}
                  </Button>
                  <Button type="button" onClick={commitPosTileDialog}>
                    <ActionConfirmIcon data-icon="inline-start" />
                    {translateUiLiteral(language, activePosTileLine.quantity > 0 ? 'Update line' : 'Add line')}
                  </Button>
                </div>
              </div>
            </DialogPrimitive.Content>
          ) : null}
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>
      <DialogPrimitive.Root
        open={sessionViewMode === 'pos' && posReceiptConfirmOpen}
        onOpenChange={(open) => {
          setPosReceiptConfirmOpen(open);
          if (!open && !stockCountPosMode) {
            setPosReceiptCopyStatus('idle');
          }
        }}
      >
        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay className="fixed inset-0 z-[90] bg-[rgba(29,20,12,0.42)] backdrop-blur-sm data-[state=open]:animate-in data-[state=open]:fade-in-0" />
          <DialogPrimitive.Content
            className="fixed left-1/2 top-1/2 z-[100] grid max-h-[calc(100vh-2rem)] w-[calc(100vw-2rem)] max-w-2xl -translate-x-1/2 -translate-y-1/2 gap-5 overflow-y-auto rounded-[1.9rem] border border-border/70 bg-white p-6 shadow-[0_28px_90px_rgba(48,31,20,0.18)]"
            onOpenAutoFocus={(event) => {
              event.preventDefault();
              window.requestAnimationFrame(() => {
                posReviewCancelButtonRef.current?.focus({ preventScroll: true });
              });
            }}
          >
            <div className="grid gap-2">
              <DialogPrimitive.Title className="text-2xl font-semibold tracking-[-0.04em] text-foreground">
                {posReviewDialogTitle}
              </DialogPrimitive.Title>
              <DialogPrimitive.Description className="text-sm leading-6 text-muted-foreground">
                {posReviewDialogDescription}
              </DialogPrimitive.Description>
            </div>

            {stockCountPosMode ? (
              <StockCountPosChangeTable
                changedRows={stockCountPosChangedRows}
                emptyState={posSummaryEmptyState}
                language={language}
              />
            ) : (
              <div style={posReceiptConfirmTableLayout.style}>
                <HeaderedTable
                  className={posReceiptConfirmTableLayout.containerClassName}
                  variant="overview"
                >
                  <HeaderedTableHeader className={posReceiptConfirmTableLayout.headerClassName}>
                    <HeaderedTableHeaderCell>{translateUiLiteral(language, 'Item')}</HeaderedTableHeaderCell>
                    <HeaderedTableHeaderCell align="center">{translateUiLiteral(language, 'Qty')}</HeaderedTableHeaderCell>
                    <HeaderedTableHeaderCell>{translateUiLiteral(language, 'Pricing')}</HeaderedTableHeaderCell>
                  </HeaderedTableHeader>
                  <HeaderedTableBody className={posReceiptConfirmTableLayout.bodyClassName}>
                    {posReceiptTextLines.map((line) => (
                      <HeaderedTableRow
                        key={`${line.title}:${line.quantity}:${line.totalLabel}`}
                        className={cn(posReceiptConfirmTableLayout.rowClassName, 'items-center')}
                      >
                        <HeaderedTableCellStack
                          primary={line.title}
                          primaryClassName="font-semibold tracking-[-0.02em]"
                        />
                        <div className="min-w-0">
                          <HeaderedTableMobileLabel className={posReceiptConfirmTableLayout.mobileLabelClassName}>
                            {translateUiLiteral(language, 'Qty')}
                          </HeaderedTableMobileLabel>
                          <p className="font-medium text-foreground tabular-nums lg:text-center">{line.quantity}</p>
                        </div>
                        <div className="grid gap-1 text-sm">
                          <HeaderedTableMobileLabel className={posReceiptConfirmTableLayout.mobileLabelClassName}>
                            {translateUiLiteral(language, 'Pricing')}
                          </HeaderedTableMobileLabel>
                          <p className="flex items-baseline justify-between gap-3 whitespace-nowrap">
                            <span className="text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                              {translateUiLiteral(language, 'Unit price')}
                            </span>
                            <span className="font-medium text-foreground tabular-nums">{line.unitPriceLabel}</span>
                          </p>
                          <p className="flex items-baseline justify-between gap-3 whitespace-nowrap">
                            <span className="text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                              {translateUiLiteral(language, 'Total price')}
                            </span>
                            <span className="font-semibold text-foreground tabular-nums">{line.totalLabel}</span>
                          </p>
                        </div>
                      </HeaderedTableRow>
                    ))}
                    {deliveryFeeEnabled ? (
                      <>
                        <HeaderedTableRow className={cn(posReceiptConfirmTableLayout.rowClassName, 'items-center border-t border-border/60')}>
                          <HeaderedTableCellStack
                            primary={translateUiLiteral(language, 'Subtotal')}
                            primaryClassName="font-medium tracking-[-0.02em]"
                          />
                          <span aria-hidden="true" />
                          <p className="text-right font-medium text-foreground tabular-nums">{deliverySubtotalLabel}</p>
                        </HeaderedTableRow>
                        <HeaderedTableRow className={cn(posReceiptConfirmTableLayout.rowClassName, 'items-center')}>
                          <div className="flex min-w-0 items-center gap-2">
                            <HeaderedTableCellStack
                              primary={translateUiLiteral(language, 'Delivery')}
                              primaryClassName="font-medium tracking-[-0.02em]"
                            />
                            <HelpTooltip
                              content={deliveryFeeHelpText(language)}
                              label={translateUiLiteral(language, 'Delivery fee')}
                            />
                          </div>
                          <span aria-hidden="true" />
                          <p className="text-right font-medium text-foreground tabular-nums">{deliveryDisplayLabel}</p>
                        </HeaderedTableRow>
                      </>
                    ) : null}
                    <HeaderedTableRow className={cn(posReceiptConfirmTableLayout.rowClassName, 'items-center', deliveryFeeEnabled ? '' : 'border-t border-border/60')}>
                      <HeaderedTableCellStack
                        primary={translateUiLiteral(language, 'Total')}
                        primaryClassName="font-semibold tracking-[-0.02em]"
                      />
                      <span aria-hidden="true" />
                      <p className="text-right text-lg font-semibold text-foreground tabular-nums">{posReceiptTotalLabel}</p>
                    </HeaderedTableRow>
                  </HeaderedTableBody>
                </HeaderedTable>
              </div>
            )}

            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-3">
                {!stockCountPosMode ? (
                  <>
                    <Button type="button" variant="outline" onClick={() => void copyPosReceiptPlainText()}>
                      <ActionClipboardAddIcon className="size-4" />
                      {translateUiLiteral(language, 'Copy receipt')}
                    </Button>
                    {posReceiptCopyStatus === 'copied' ? (
                      <p className="text-sm text-emerald-700">{translateUiLiteral(language, 'Copied receipt to clipboard.')}</p>
                    ) : posReceiptCopyStatus === 'failed' ? (
                      <p className="text-sm text-destructive">{translateUiLiteral(language, 'Could not copy receipt to clipboard.')}</p>
                    ) : null}
                  </>
                ) : null}
              </div>
              <div className="flex flex-wrap justify-end gap-2">
                <Button ref={posReviewCancelButtonRef} type="button" variant="outline" onClick={() => setPosReceiptConfirmOpen(false)}>
                  <ActionCloseIcon data-icon="inline-start" />
                  {translateUiLiteral(language, 'Cancel')}
                </Button>
                <Button disabled={isSaving} type="button" onClick={() => void saveCurrentSession()}>
                  <ActionSaveIcon className="size-4" />
                  {isSaving ? t('catalogSenaSkuSaving') : translateUiLiteral(language, 'Confirm save')}
                </Button>
              </div>
            </div>
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>
      <Sheet open={sessionViewMode === 'pos' && activePosMetadataPopup != null} onOpenChange={(open) => {
        if (!open) {
          setActivePosMetadataPopup(null);
        }
      }}>
        <SheetContent
          aria-describedby={undefined}
          className="w-full max-w-2xl gap-0 overflow-y-auto border-l border-border/70 bg-white px-0 shadow-[0_28px_72px_rgba(48,31,20,0.18)] sm:max-w-2xl"
          onOpenAutoFocus={(event) => {
            if (activePosMetadataPopup !== 'delivery') {
              return;
            }

            event.preventDefault();
            window.requestAnimationFrame(() => {
              posDeliveryFeeInputRef.current?.focus({ preventScroll: true });
            });
          }}
        >
          <SheetHeader className="gap-3 border-b border-border/60 px-8 py-7">
            <SheetTitle className="text-[2rem] leading-tight tracking-[-0.04em]">{activePosMetadataTitle}</SheetTitle>
            <SheetDescription className="max-w-2xl text-base leading-7">
              {activePosMetadataDescription}
            </SheetDescription>
          </SheetHeader>
          <div className="grid gap-6 px-8 py-7">
            {activePosMetadataContent}
          </div>
        </SheetContent>
      </Sheet>
      {sessionViewMode === 'form' ? bottomNavigationIsland : null}
    </WorkspacePage>
  );
}
