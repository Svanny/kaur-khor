import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import type { SenaSkuDetail, SenaTicketEvent, SenaTicketLine, SenaWorkspaceSummary } from '@shared/sena';
import {
  ActionClipboardClockIcon,
  ActionCloseIcon,
  ActionConfirmIcon,
  ActionOpenExternalIcon,
  ActionSearchOffIcon,
} from '@icons/actions';
import {
  overviewCustomerFilterIcons,
  overviewTaskActionIcons,
  overviewTaskFilterIcons,
} from '@icons/domain';
import {
  EntityCustomerIcon,
  EntityReceiptDocumentIcon,
  EntityServiceIcon,
  EntitySignalIcon,
  EntitySkuIcon,
  EntityTransitIcon,
} from '@icons/entities';
import { NavigationCatalogIcon, NavigationTaskListIcon } from '@icons/navigation';
import {
  WorkspaceActionRow,
  WorkspaceEmpty,
  WorkspacePage,
  WorkspaceTitleCard,
} from '@/components/system/workspace';
import { BatchActionPrompt, type TaskGroup } from '@/components/system/batch-action-prompt';
import type { IconComponent } from '@icons';
import { compactFilterControlClassName } from '@/components/system/compact-controls';
import { FilterControlRow } from '@/components/system/filter-control-row';
import { LoadingMoreIntervalsIsland } from '@/components/system/loading-more-intervals-island';
import { RouteBackButton } from '@/components/system/page-navigation';
import { CreateFirstSkuButton } from '@/components/system/create-first-sku-button';
import { ItemIdentityBlock } from '@/components/system/item-identity';
import { rightRailLayoutClassName } from '@/components/system/right-rail-layout';
import {
  createHeaderedTableLayout,
  hasRenderableRows,
  HeaderedTable,
  HeaderedTableBody,
  HeaderedTableHeader,
  HeaderedTableHeaderCell,
  HeaderedTableMobileLabel,
  HeaderedTableRow,
} from '@/components/system/headered-table';
import { SearchInput } from '@/components/system/search-input';
import { SupplierBadge, SupplierFilter, supplierFilterQueryValue, supplierFilterValueForQuery } from '@/components/system/supplier';
import { ResponsiveToggleFilter } from '@/components/system/responsive-toggle-filter';
import { Button } from '@/components/ui/button';
import { cardFrameClassName, cardSurfaceClassName } from '@/components/ui/card';
import { ChromeTabs, ChromeTabsList, ChromeTabsTrigger } from '@/components/ui/chrome-tabs';
import { Input } from '@/components/ui/input';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { rowHoverClassName } from '@/lib/interactive-surface';
import { recordTicketOptions, sortRecordTicketOptionsByRecent } from '@/lib/record-activity';
import {
  clampDateInputToObservedDate,
  dateInputToIsoOnOrAfterObserved,
  formatLocalDateTimeInputValue,
  observedLocalDateInputValue,
  parseLocalDateTimeInputIso,
} from '@/lib/date-input-utils';
import { parseEditableNumberWithCommas } from '@/lib/format';
import { buildOverviewSearchParams, buildSkuDetailHref, readOverviewRouteState } from '@/lib/navigation-state';
import { createAnimationFrameScheduler } from '@/lib/animation-frame-scheduler';
import { deriveAvailableObservationCount } from '@/lib/observation-count';
import { buildRememberedCatalogHref } from '@/lib/page-state-memory';
import { useBenchmarkRouteReady } from '@/lib/benchmark-route-ready';
import { matchesSupplierName, type SupplierFilterValue } from '@/lib/sena-catalog';
import { normalizeSkuDetailPage } from '@/lib/sena-detail-pages';
import { statusPillClassName } from '@/lib/state-tones';
import { translateUiLiteral } from '@/lib/translations';
import { stockSnapshotForTicketInventoryDeltas } from '@/lib/ticket-inventory-reconciliation';
import {
  buildCustomerTicketCaptureHref,
  buildSupplierTicketCaptureHref,
  type CaptureSessionFlashTarget,
  type CaptureSessionTargetType,
} from '@/lib/record-update-routes';
import { useAutomation } from '@/state/automation';
import { useInventoryActions, useInventoryState } from '@/state/inventory';
import { buildKaurKhorNavigationState } from '@/state/navigation-history';
import { usePreferences } from '@/state/preferences';
import { AutomationsRoute } from './automations';
import { AutomationIntakeDrawer } from './automations/intake-drawer';
import { createEmptyObservationInput } from './observation-payload';
import { OverviewTaskDrawer } from './overview/task-drawer';
import {
  buildOverviewModel,
  isOverviewSupplierTicketTask,
  isOverviewSkuTask,
  supplierTicketTaskForSkuTask,
  shouldShowTask,
  type OverviewSkuTask,
  type OverviewSupplierTicketTask,
  type OverviewTask,
  type OverviewTaskDrawerMode,
  type OverviewTaskFilter,
} from './overview/view-model';
import {
  buildCustomerOverviewModel,
  shouldShowCustomerTask,
  type OverviewCustomerFilter,
  type OverviewCustomerTask,
} from './overview/customer-view-model';

const overviewQueueTableLayout = createHeaderedTableLayout({
  breakpoint: 'lg',
  columns: 'minmax(18rem,1.15fr) minmax(14rem,0.95fr) minmax(16rem,1fr) minmax(10rem,0.7fr)',
  gap: 5,
});

const WORK_QUEUE_BATCH_DEBUG_STORAGE_KEY = 'KAUR_KHOR_DEBUG_WORK_QUEUE_BATCH';

function isWorkQueueBatchDebugEnabled() {
  if (typeof window === 'undefined') {
    return false;
  }
  try {
    const globalDebug = (window as Window & { __KAUR_KHOR_DEBUG_WORK_QUEUE_BATCH__?: boolean }).__KAUR_KHOR_DEBUG_WORK_QUEUE_BATCH__;
    return globalDebug === true || window.localStorage.getItem(WORK_QUEUE_BATCH_DEBUG_STORAGE_KEY) === '1' || (import.meta.env.DEV && import.meta.env.MODE !== 'test');
  } catch {
    return false;
  }
}

function logWorkQueueBatchDebug(event: string, detail: Record<string, unknown>) {
  if (!isWorkQueueBatchDebugEnabled()) {
    return;
  }
  console.debug(`[work-queue-batch] ${event}`, detail);
}

function initialCustomerCompletionQuantity(task: OverviewCustomerTask | null) {
  if (!task) {
    return '1';
  }
  return String(Math.max(1, Math.round(task.pendingQuantity || task.completedToday || 1)));
}

function customerLineQuantity(line: SenaTicketLine) {
  const quantity = line.quantityDelta ?? line.orderedQuantity ?? line.receivedQuantity ?? 1;
  return typeof quantity === 'number' && Number.isFinite(quantity) && quantity > 0 ? Math.abs(quantity) : null;
}

function customerCompletionLines(task: OverviewCustomerTask, fallbackQuantity: number): SenaTicketLine[] {
  if (task.ticket?.lines.length) {
    return task.ticket.lines;
  }
  if (!task.entityId) {
    return [];
  }
  return [{
    entityType: task.entityType,
    entityId: task.entityId,
    quantityDelta: fallbackQuantity,
  }];
}

function isCustomerTicketTask(task: OverviewCustomerTask | null): task is OverviewCustomerTask & { ticket: NonNullable<OverviewCustomerTask['ticket']>; ticketId: string } {
  return Boolean(task?.source === 'customer_ticket' && task.ticket && task.ticketId);
}

function CustomerQueueDrawer({
  error,
  isSaving,
  language,
  open,
  task,
  onOpenChange,
  onSubmit,
  onSubmitTicket,
}: {
  error: string | null;
  isSaving: boolean;
  language: ReturnType<typeof usePreferences>['language'];
  open: boolean;
  task: OverviewCustomerTask | null;
  onOpenChange: (open: boolean) => void;
  onSubmit: (input: { notes: string; observedAt: string; quantity: number }) => Promise<boolean>;
  onSubmitTicket: (input: { action: 'follow_up' | 'cancel' | 'fulfill'; nextTouchAt: string; notes: string; observedAt: string }) => Promise<boolean>;
}) {
  const [quantity, setQuantity] = useState(() => initialCustomerCompletionQuantity(task));
  const [observedAt, setObservedAt] = useState(() => formatLocalDateTimeInputValue());
  const [nextTouchAt, setNextTouchAt] = useState('');
  const [notes, setNotes] = useState('');
  const [ticketAction, setTicketAction] = useState<'follow_up' | 'cancel' | 'fulfill'>('follow_up');

  useEffect(() => {
    if (!open) {
      return;
    }
    setQuantity(initialCustomerCompletionQuantity(task));
    setObservedAt(formatLocalDateTimeInputValue());
    setNextTouchAt('');
    setNotes('');
    setTicketAction('follow_up');
  }, [open, task]);
  useEffect(() => {
    setNextTouchAt((current) => clampDateInputToObservedDate(current, observedAt));
  }, [observedAt]);

  const parsedQuantity = parseEditableNumberWithCommas(quantity);
  const isTicketTask = isCustomerTicketTask(task);
  const observedDateInput = observedLocalDateInputValue(observedAt);
  const canComplete = task?.action === 'mark_completed' && !isTicketTask;
  const submitDisabled = !task || !canComplete || !Number.isFinite(parsedQuantity) || parsedQuantity <= 0 || isSaving;
  const ticketSubmitDisabled = !isTicketTask || isSaving;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full max-w-2xl gap-0 overflow-hidden border-l border-border/70 bg-white px-0 shadow-[0_28px_72px_rgba(48,31,20,0.18)] sm:max-w-2xl">
        <SheetHeader className="shrink-0 border-b border-border/50 px-8 py-7 text-left">
          <SheetTitle className="text-3xl font-semibold tracking-[-0.04em]">
            {task?.label ?? translateUiLiteral(language, 'Customer queue')}
          </SheetTitle>
          <SheetDescription className="mt-3 text-base leading-7">
            {task
              ? translateUiLiteral(language, 'Review customer ticket metadata and choose the next queue action.')
              : translateUiLiteral(language, 'Review customer work from the queue.')}
          </SheetDescription>
        </SheetHeader>
        <div className="grid min-h-0 flex-1 gap-6 overflow-y-auto px-8 py-7" data-slot="customer-queue-drawer-scroll">
          {task ? (
            <div className="grid gap-3 rounded-[1.5rem] border border-border/70 bg-[#fbf8f4] p-5">
              <div className="flex flex-wrap items-center gap-2">
                <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[0.72rem] font-medium ${statusPillClassName(task.sourceBadgeTone)}`}>
                  {task.sourceLabel}
                </span>
                <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[0.72rem] font-medium ${statusPillClassName(task.stateBadgeTone)}`}>
                  {task.stateLabel}
                </span>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted-foreground">
                  {translateUiLiteral(language, 'Contact')}
                </p>
                <p className="mt-2 text-lg font-semibold text-foreground">{task.contactSummary}</p>
                {task.contactDetail ? (
                  <p className="mt-1 text-sm leading-6 text-muted-foreground">{task.contactDetail}</p>
                ) : null}
              </div>
              <div className="border-t border-border/60 pt-3">
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted-foreground">
                  {translateUiLiteral(language, 'Request')}
                </p>
                <p className="mt-2 text-base font-medium text-foreground">{task.requestSummary}</p>
              </div>
              {task.requestDetail ? (
                <div className="border-t border-border/60 pt-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted-foreground">
                    {translateUiLiteral(language, 'ETA')}
                  </p>
                  <p className="mt-2 text-base font-medium text-foreground">{task.requestDetail}</p>
                </div>
              ) : null}
              {task.ticket?.note ? (
                <div className="border-t border-border/60 pt-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted-foreground">
                    {translateUiLiteral(language, 'Notes')}
                  </p>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">{task.ticket.note}</p>
                </div>
              ) : null}
            </div>
          ) : null}
          {isTicketTask ? (
            <>
              <div className="grid gap-2">
                <p className="text-sm font-medium text-foreground">
                  {translateUiLiteral(language, 'Quick update')}
                </p>
                <div className="grid gap-2 sm:grid-cols-3">
                  {[
                    {
                      icon: ActionClipboardClockIcon,
                      label: translateUiLiteral(language, 'Follow up'),
                      value: 'follow_up' as const,
                    },
                    {
                      icon: ActionCloseIcon,
                      label: translateUiLiteral(language, 'Cancel ticket'),
                      value: 'cancel' as const,
                    },
                    {
                      icon: ActionConfirmIcon,
                      label: translateUiLiteral(language, 'Mark fulfilled'),
                      value: 'fulfill' as const,
                    },
                  ].map((option) => {
                    const OptionIcon = option.icon;
                    return (
                      <Button
                        key={option.value}
                        type="button"
                        variant={ticketAction === option.value ? 'default' : 'outline'}
                        onClick={() => setTicketAction(option.value)}
                      >
                        <OptionIcon data-icon="inline-start" />
                        {option.label}
                      </Button>
                    );
                  })}
                </div>
              </div>
              <label className="grid gap-2 text-sm font-medium text-foreground">
                {translateUiLiteral(language, 'Update date and time')}
                <Input
                  aria-label={translateUiLiteral(language, 'Update date and time')}
                  className="h-12 rounded-full"
                  type="datetime-local"
                  value={observedAt}
                  onChange={(event) => setObservedAt(event.target.value)}
                />
              </label>
              {ticketAction === 'follow_up' ? (
                <label className="grid gap-2 text-sm font-medium text-foreground">
                  {translateUiLiteral(language, 'Next touch date')}
                  <Input
                    aria-label={translateUiLiteral(language, 'Next touch date')}
                    className="h-12 rounded-full"
                    min={observedDateInput}
                    type="date"
                    value={nextTouchAt}
                    onChange={(event) => setNextTouchAt(clampDateInputToObservedDate(event.target.value, observedAt))}
                  />
                </label>
              ) : null}
              <label className="grid gap-2 text-sm font-medium text-foreground">
                {translateUiLiteral(language, 'Update notes')}
                <Textarea
                  aria-label={translateUiLiteral(language, 'Update notes')}
                  className="min-h-28 rounded-[1.5rem]"
                  value={notes}
                  onChange={(event) => setNotes(event.target.value)}
                />
              </label>
            </>
          ) : null}
          {canComplete ? (
            <>
              <label className="grid gap-2 text-sm font-medium text-foreground">
                {translateUiLiteral(language, 'Quantity completed')}
                <Input
                  aria-label={translateUiLiteral(language, 'Quantity completed')}
                  className="h-12 rounded-full"
                  inputMode="decimal"
                  min="0"
                  step="1"
                  type="text"
                  value={quantity}
                  onChange={(event) => setQuantity(event.target.value)}
                />
              </label>
              <label className="grid gap-2 text-sm font-medium text-foreground">
                {translateUiLiteral(language, 'Completed date and time')}
                <Input
                  aria-label={translateUiLiteral(language, 'Completed date and time')}
                  className="h-12 rounded-full"
                  type="datetime-local"
                  value={observedAt}
                  onChange={(event) => setObservedAt(event.target.value)}
                />
              </label>
              <label className="grid gap-2 text-sm font-medium text-foreground">
                {translateUiLiteral(language, 'Completion notes')}
                <Textarea
                  aria-label={translateUiLiteral(language, 'Completion notes')}
                  className="min-h-28 rounded-[1.5rem]"
                  value={notes}
                  onChange={(event) => setNotes(event.target.value)}
                />
              </label>
            </>
          ) : null}
          {error ? (
            <p className="rounded-[1.25rem] border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              {error}
            </p>
          ) : null}
        </div>
        <SheetFooter className="shrink-0 gap-3 border-t border-border/50 bg-[#f8f4ef]/96 px-8 py-5 shadow-[0_-14px_34px_rgba(48,31,20,0.08)] sm:justify-between" data-slot="customer-queue-drawer-footer">
          {isTicketTask ? (
            <Button asChild className="w-full sm:w-auto" size="lg" type="button" variant="outline">
              <Link to={`/work/capture/customer-order?ticketMode=edit&ticketId=${encodeURIComponent(task.ticketId)}`}>
                <ActionOpenExternalIcon data-icon="inline-start" />
                {translateUiLiteral(language, 'Edit in Capture')}
              </Link>
            </Button>
          ) : <span />}
          {isTicketTask ? (
            <Button
              className="w-full sm:w-auto sm:min-w-[13rem]"
              disabled={ticketSubmitDisabled}
              size="lg"
              type="button"
              onClick={() => void onSubmitTicket({ action: ticketAction, nextTouchAt, notes, observedAt })}
            >
              <ActionConfirmIcon data-icon="inline-start" />
              {isSaving ? translateUiLiteral(language, 'Saving…') : translateUiLiteral(language, 'Save quick update')}
            </Button>
          ) : null}
          {canComplete ? (
            <Button
              className="w-full sm:w-auto sm:min-w-[13rem]"
              disabled={submitDisabled}
              size="lg"
              type="button"
              onClick={() => void onSubmit({ notes, observedAt, quantity: parsedQuantity })}
            >
              <ActionConfirmIcon data-icon="inline-start" />
              {isSaving ? translateUiLiteral(language, 'Saving…') : translateUiLiteral(language, 'Mark completed')}
            </Button>
          ) : null}
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

type OverviewSearchScope = 'all' | 'skus' | 'services';
const DASHBOARD_INITIAL_DETAIL_HYDRATION_LIMIT = 0;
const DASHBOARD_DETAIL_HYDRATION_CONCURRENCY = 2;
const DASHBOARD_DETAIL_HYDRATION_DELAY_MS = 750;
const OVERVIEW_QUEUE_VIRTUALIZATION_THRESHOLD = 60;
const OVERVIEW_QUEUE_VIRTUALIZATION_ROW_HEIGHT = 168;
const OVERVIEW_QUEUE_VIRTUALIZATION_OVERSCAN = 6;
const OVERVIEW_QUEUE_VIRTUALIZATION_FALLBACK_ROWS = 8;

export function orderedDashboardSkuDetailIds(workspaceSummary: SenaWorkspaceSummary | null) {
  if (!workspaceSummary) {
    return [];
  }
  const ids = new Set<string>();
  for (const skuId of workspaceSummary.highRiskSkuIds) {
    ids.add(skuId);
  }
  for (const summary of workspaceSummary.skuSummaries) {
    ids.add(summary.skuId);
  }
  return Array.from(ids);
}

async function hydrateSkuDetailsWithLimit<T>(
  skuIds: string[],
  limit: number,
  load: (skuId: string) => Promise<T>,
  onLoaded: (batch: Record<string, T>) => void,
  isActive: () => boolean,
) {
  let nextIndex = 0;
  let completedInBatch = 0;
  let bufferedResults: Record<string, T> = {};

  const flushBufferedResults = () => {
    if (!isActive() || Object.keys(bufferedResults).length === 0) {
      return;
    }
    const batch = bufferedResults;
    bufferedResults = {};
    completedInBatch = 0;
    onLoaded(batch);
  };

  await Promise.all(
    Array.from({ length: Math.min(limit, skuIds.length) }, async () => {
      while (isActive() && nextIndex < skuIds.length) {
        const skuId = skuIds[nextIndex];
        nextIndex += 1;
        const detail = await load(skuId);
        if (!isActive()) {
          return;
        }
        bufferedResults = {
          ...bufferedResults,
          [skuId]: detail,
        };
        completedInBatch += 1;
        if (completedInBatch >= limit) {
          flushBufferedResults();
        }
      }
    }),
  );

  flushBufferedResults();
}

function scheduleBackgroundTask(task: () => void) {
  if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
    const id = window.requestIdleCallback(task, { timeout: 1_000 });
    return () => window.cancelIdleCallback(id);
  }
  const id = globalThis.setTimeout(task, 0);
  return () => globalThis.clearTimeout(id);
}

function scheduleDeferredBackgroundTask(task: () => void, delayMs = DASHBOARD_DETAIL_HYDRATION_DELAY_MS) {
  let cancelBackgroundTask: (() => void) | null = null;
  const timeoutId = window.setTimeout(() => {
    cancelBackgroundTask = scheduleBackgroundTask(task);
  }, delayMs);
  return () => {
    window.clearTimeout(timeoutId);
    cancelBackgroundTask?.();
  };
}

function WorkSupportLoadingBoard() {
  return (
    <section
      className={`${cardFrameClassName} ${cardSurfaceClassName} flex min-h-[28rem] flex-col rounded-[2rem] px-5 py-5 sm:px-6`}
      data-slot="overview-support-loading"
    >
      <div className="flex items-end justify-between gap-4 border-b border-border/60 pb-5">
        <div className="grid gap-3">
          <Skeleton className="h-7 w-36 rounded-full" />
          <Skeleton className="h-4 w-80 max-w-full rounded-full" />
        </div>
        <Skeleton className="h-4 w-24 rounded-full" />
      </div>
      <div className="grid flex-1 gap-0 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0 border-border/60 lg:border-r">
          {Array.from({ length: 4 }, (_, index) => (
            <div key={`queue-loading-row-${index}`} className="grid gap-4 border-b border-border/60 px-4 py-6 lg:grid-cols-[minmax(18rem,1.15fr)_minmax(14rem,0.95fr)_minmax(16rem,1fr)_minmax(10rem,0.7fr)]">
              <div className="flex items-center gap-4">
                <Skeleton className="size-12 shrink-0 rounded-full" />
                <div className="grid min-w-0 flex-1 gap-2">
                  <Skeleton className="h-5 w-40 rounded-full" />
                  <Skeleton className="h-4 w-56 max-w-full rounded-full" />
                </div>
              </div>
              <div className="grid content-center gap-2">
                <Skeleton className="h-4 w-36 rounded-full" />
                <Skeleton className="h-4 w-48 max-w-full rounded-full" />
              </div>
              <div className="grid content-center gap-2">
                <Skeleton className="h-4 w-32 rounded-full" />
                <Skeleton className="h-4 w-52 max-w-full rounded-full" />
              </div>
              <div className="flex items-center justify-center">
                <Skeleton className="h-9 w-32 rounded-full" />
              </div>
            </div>
          ))}
        </div>
        <aside className="hidden px-5 py-5 lg:block">
          <Skeleton className="h-6 w-24 rounded-full" />
          {Array.from({ length: 3 }, (_, index) => (
            <div key={`queue-loading-rail-${index}`} className="mt-6 flex items-center justify-between gap-4 border-b border-border/60 pb-5">
              <Skeleton className="h-4 w-36 rounded-full" />
              <Skeleton className="h-5 w-8 rounded-full" />
            </div>
          ))}
        </aside>
      </div>
    </section>
  );
}

function useVirtualizedQueueRows<T>(
  rows: T[],
  focusedIndex: number | null,
) {
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const [range, setRange] = useState<{ start: number; end: number }>({
    start: 0,
    end: rows.length,
  });
  const isVirtualized = rows.length > OVERVIEW_QUEUE_VIRTUALIZATION_THRESHOLD;

  const updateRange = useCallback(() => {
    if (!isVirtualized) {
      setRange({ start: 0, end: rows.length });
      return;
    }
    const container = bodyRef.current;
    const viewportHeight = container?.clientHeight
      ?? OVERVIEW_QUEUE_VIRTUALIZATION_ROW_HEIGHT * OVERVIEW_QUEUE_VIRTUALIZATION_FALLBACK_ROWS;
    const visibleCount = Math.max(
      OVERVIEW_QUEUE_VIRTUALIZATION_FALLBACK_ROWS,
      Math.ceil(viewportHeight / OVERVIEW_QUEUE_VIRTUALIZATION_ROW_HEIGHT),
    );
    const rawStart = Math.max(
      0,
      Math.floor((container?.scrollTop ?? 0) / OVERVIEW_QUEUE_VIRTUALIZATION_ROW_HEIGHT),
    );
    let start = Math.max(0, rawStart - OVERVIEW_QUEUE_VIRTUALIZATION_OVERSCAN);
    let end = Math.min(rows.length, rawStart + visibleCount + OVERVIEW_QUEUE_VIRTUALIZATION_OVERSCAN);
    if (focusedIndex != null && focusedIndex >= 0) {
      start = Math.min(start, Math.max(0, focusedIndex - OVERVIEW_QUEUE_VIRTUALIZATION_OVERSCAN));
      end = Math.max(end, Math.min(rows.length, focusedIndex + OVERVIEW_QUEUE_VIRTUALIZATION_OVERSCAN + 1));
    }
    setRange((current) =>
      current.start === start && current.end === end
        ? current
        : { start, end });
  }, [focusedIndex, isVirtualized, rows.length]);

  useEffect(() => {
    if (!isVirtualized) {
      setRange({ start: 0, end: rows.length });
      return;
    }
    const container = bodyRef.current;
    const initialEnd = Math.min(
      rows.length,
      OVERVIEW_QUEUE_VIRTUALIZATION_FALLBACK_ROWS + OVERVIEW_QUEUE_VIRTUALIZATION_OVERSCAN,
    );
    setRange({ start: 0, end: initialEnd });
    if (!container) {
      return;
    }
    const scheduler = createAnimationFrameScheduler(updateRange);
    scheduler.flush();
    container.addEventListener('scroll', scheduler.schedule, { passive: true });
    window.addEventListener('resize', scheduler.schedule);
    return () => {
      container.removeEventListener('scroll', scheduler.schedule);
      window.removeEventListener('resize', scheduler.schedule);
      scheduler.cancel();
    };
  }, [isVirtualized, rows.length, updateRange]);

  useEffect(() => {
    if (!isVirtualized || focusedIndex == null || focusedIndex < 0) {
      return;
    }
    updateRange();
  }, [focusedIndex, isVirtualized, updateRange]);

  const startIndex = isVirtualized ? range.start : 0;
  const endIndex = isVirtualized ? range.end : rows.length;
  const renderedRows = rows.slice(startIndex, endIndex);
  const topSpacerHeight = isVirtualized ? startIndex * OVERVIEW_QUEUE_VIRTUALIZATION_ROW_HEIGHT : 0;
  const bottomSpacerHeight = isVirtualized
    ? Math.max(0, (rows.length - endIndex) * OVERVIEW_QUEUE_VIRTUALIZATION_ROW_HEIGHT)
    : 0;

  return {
    bodyRef,
    bottomSpacerHeight,
    isVirtualized,
    renderedRows,
    topSpacerHeight,
  };
}

type OverviewWorkflowScope = 'customer' | 'supplier';

function boardClassName() {
  return `${cardFrameClassName} ${cardSurfaceClassName} flex min-h-0 flex-col overflow-hidden rounded-[2rem]`;
}

function railBlockClassName() {
  return 'border-t border-border/60 px-5 py-5 first:border-t-0';
}

const overviewStartUpdateButtonClassName =
  'border-[#b87745] bg-[#b87745] text-white shadow-xs hover:bg-[#a66a3b]';

function buildFilterOptions(language: 'en' | 'km'): Array<{ value: OverviewTaskFilter; label: string }> {
  return [
    { value: 'all', label: translateUiLiteral(language, 'All Tasks') },
    { value: 'to_order', label: translateUiLiteral(language, 'To order') },
    { value: 'awaiting_receipt', label: translateUiLiteral(language, 'Awaiting receipt') },
    { value: 'follow_up_today', label: translateUiLiteral(language, 'Follow up today') },
    { value: 'ready_to_receive', label: translateUiLiteral(language, 'Ready to receive') },
    { value: 'received_today', label: translateUiLiteral(language, 'Received today') },
  ];
}

function buildTodayFilterRows(language: 'en' | 'km'): Array<{
  countKey: 'toOrder' | 'followUpToday' | 'readyToReceive';
  filter: OverviewTaskFilter;
  label: string;
}> {
  return [
    { countKey: 'toOrder', filter: 'to_order', label: translateUiLiteral(language, 'To order') },
    {
      countKey: 'followUpToday',
      filter: 'follow_up_today',
      label: translateUiLiteral(language, 'Follow up today'),
    },
    {
      countKey: 'readyToReceive',
      filter: 'ready_to_receive',
      label: translateUiLiteral(language, 'Ready to receive'),
    },
  ];
}

function buildCustomerFilterOptions(language: 'en' | 'km'): Array<{ value: OverviewCustomerFilter; label: string }> {
  return [
    { value: 'all', label: translateUiLiteral(language, 'All Tasks') },
    { value: 'review', label: translateUiLiteral(language, 'Review') },
    { value: 'quoted', label: translateUiLiteral(language, 'Quoted') },
    { value: 'open', label: translateUiLiteral(language, 'Open') },
    { value: 'closed', label: translateUiLiteral(language, 'Closed') },
  ];
}

function matchesOverviewEntityScope(task: OverviewTask, scope: OverviewSearchScope) {
  if (isOverviewSupplierTicketTask(task)) {
    return scope === 'all' || scope === 'skus';
  }

  if (!isOverviewSkuTask(task)) {
    return scope === 'all';
  }

  if (scope === 'all') {
    return true;
  }

  if (scope === 'skus') {
    return task.soldAsProduct;
  }

  return task.linkedServiceNames.length > 0;
}

function matchesOverviewQuery(task: OverviewTask, query: string, scope: OverviewSearchScope) {
  const normalized = query.trim().toLowerCase();
  if (!normalized) {
    return true;
  }

  if (isOverviewSupplierTicketTask(task)) {
    const parts =
      scope === 'services'
        ? [task.whyNow, task.whyDetail, task.etaLabel, task.stateLabel]
        : [task.displayTicketLabel, task.displayTicketId, task.ticketId, task.supplierName, task.skuSummaryLabel, ...task.skuNames, task.whyNow, task.whyDetail, task.etaLabel, task.stateLabel];

    return parts.join(' ').toLowerCase().includes(normalized);
  }

  if (!isOverviewSkuTask(task)) {
    return [
      task.stateLabel,
      task.actionLabel,
      task.snoozeActionLabel,
      task.whyNow,
      task.whyDetail,
      task.etaLabel,
      task.etaDetail,
    ]
      .join(' ')
      .toLowerCase()
      .includes(normalized);
  }

  const parts =
    scope === 'skus'
      ? [task.skuName, task.supplierName, task.whyNow, task.whyDetail, task.etaLabel, task.stateLabel]
      : scope === 'services'
        ? [task.serviceImpact, ...task.linkedServiceNames, task.whyNow, task.whyDetail, task.etaLabel, task.stateLabel]
        : [
            task.skuName,
            task.supplierName,
            task.serviceImpact,
            task.whyNow,
            task.whyDetail,
            task.etaLabel,
            task.stateLabel,
            ...task.linkedServiceNames,
          ];

  return parts.join(' ').toLowerCase().includes(normalized);
}

function matchesCustomerOverviewQuery(task: OverviewCustomerTask, query: string) {
  const normalized = query.trim().toLowerCase();
  if (!normalized) {
    return true;
  }

  return [
    task.label,
    task.stateLabel,
    task.actionLabel,
    task.whyNow,
    task.whyDetail,
    task.sourceLabel,
    task.summary,
    task.contactSummary,
    task.contactDetail,
    task.requestSummary,
    task.requestDetail,
  ]
    .join(' ')
    .toLowerCase()
    .includes(normalized);
}

function matchesOverviewSupplier(task: OverviewTask, supplierFilter: SupplierFilterValue) {
  if (supplierFilter === 'all') {
    return true;
  }

  if (isOverviewSkuTask(task) || isOverviewSupplierTicketTask(task)) {
    return matchesSupplierName(task.supplierName, supplierFilter);
  }

  return true;
}

export function DashboardRoute({ embedded = false }: { embedded?: boolean } = {}) {
  const inventory = useInventoryState();
  const {
    ingestSenaObservation,
    loadSenaSkuDetail,
    loadWorkSupportData,
    triggerSenaRun,
  } = useInventoryActions();
  const automation = useAutomation();
  const {
    language,
    overviewStaleUpdateReminderSnoozeUntil,
    showExplanatoryTooltips,
    showOverviewTaskTabs,
    showRightRailCards,
    savePreferences,
    taskBatchUpdatePreferences,
    t,
  } = usePreferences();
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [query, setQuery] = useState('');
  const deferredQuery = useDeferredValue(query);
  const [detailBySkuId, setDetailBySkuId] = useState<Record<string, SenaSkuDetail | null>>({});
  const [isHydratingDetails, setIsHydratingDetails] = useState(false);
  const [selectedTaskRequest, setSelectedTaskRequest] = useState<{
    mode: OverviewTaskDrawerMode | null;
    routeLinked?: boolean;
    taskId: string;
  } | null>(null);
  const [selectedCustomerCompletionTaskId, setSelectedCustomerCompletionTaskId] = useState<string | null>(null);
  const [customerCompletionError, setCustomerCompletionError] = useState<string | null>(null);
  const [isQueueSaving, setIsQueueSaving] = useState(false);
  const [batchPromptRequest, setBatchPromptRequest] = useState<{
    rememberChoice: boolean;
    scope: 'customer' | 'supplier';
    task: OverviewSkuTask | OverviewSupplierTicketTask | OverviewCustomerTask;
    taskGroup: TaskGroup;
  } | null>(null);
  const [selectedAutomationIntakeId, setSelectedAutomationIntakeId] = useState<string | null>(null);
  const [hasLoadedInitialWorkSupportData, setHasLoadedInitialWorkSupportData] = useState(false);
  const [isLoadingWorkSupportData, setIsLoadingWorkSupportData] = useState(false);
  const requestedOrderBatchesRef = useRef(false);
  const routeState = readOverviewRouteState(searchParams);
  const overviewScope = routeState.workflow;
  const overviewScopeOptions = [
    { icon: EntityCustomerIcon, label: translateUiLiteral(language, 'Customer'), value: 'customer' },
    { icon: EntityTransitIcon, label: translateUiLiteral(language, 'Supplier'), value: 'supplier' },
  ] satisfies Array<{ icon: IconComponent; label: string; value: OverviewWorkflowScope }>;
  const customerFilter = routeState.customerFilter;
  const searchScope = routeState.scope;
  const supplierFilter = supplierFilterValueForQuery(routeState.supplier);
  const filter = routeState.filter as OverviewTaskFilter;
  const activeFilter: OverviewTaskFilter = showOverviewTaskTabs ? filter : 'all';
  const availableObservationCount = deriveAvailableObservationCount(inventory);
  const needsInitialWorkSupportData = Boolean(
    inventory.catalog &&
      inventory.workspaceSummary &&
      availableObservationCount > 0 &&
      inventory.observations.length === 0 &&
      !hasLoadedInitialWorkSupportData,
  );
  const showWorkSupportLoading = needsInitialWorkSupportData || isLoadingWorkSupportData;
  const filterOptions = useMemo(() => buildFilterOptions(language), [language]);
  const customerFilterOptions = useMemo(() => buildCustomerFilterOptions(language), [language]);
  const todayFilterRows = useMemo(() => buildTodayFilterRows(language), [language]);

  async function refreshQueueAfterSave() {
    setIsQueueSaving(true);
    try {
      await triggerSenaRun({ algorithmVersion: 'sena-analysis-v3' });
      await loadWorkSupportData({ includeObservations: true }).catch((error) => {
        console.warn('[dashboard] work support refresh failed after save', error);
      });
    } finally {
      setIsQueueSaving(false);
    }
  }

  function updateRouteState(nextState: Parameters<typeof buildOverviewSearchParams>[1], replace = false) {
    setSearchParams(buildOverviewSearchParams(searchParams, nextState), { replace });
  }

  function openSingleTask(task: Pick<OverviewSkuTask | OverviewSupplierTicketTask, 'id' | 'defaultDrawerMode'>, mode = task.defaultDrawerMode) {
    setSelectedTaskRequest({ taskId: task.id, mode });
  }

  function taskBatchPreferenceKeyForAction(action: OverviewSkuTask['action'] | OverviewCustomerTask['action']): keyof typeof taskBatchUpdatePreferences | null {
    if (action === 'log_order') {
      return 'logOrder';
    }
    if (action === 'update_eta') {
      return 'updateEta';
    }
    if (action === 'follow_up') {
      return 'followUp';
    }
    if (action === 'receive') {
      return 'receive';
    }
    if (action === 'review') {
      return 'review';
    }
    if (action === 'open_pending') {
      return 'followUp';
    }
    if (action === 'mark_completed') {
      return 'receive';
    }
    if (action === 'review_cancellation') {
      return 'review';
    }
    return null;
  }

  function taskBatchPreferenceForAction(action: OverviewSkuTask['action'] | OverviewCustomerTask['action']) {
    const key = taskBatchPreferenceKeyForAction(action);
    return key ? taskBatchUpdatePreferences[key] : 'ask';
  }

  function supplierSkuIdsForTask(task: OverviewSkuTask | OverviewSupplierTicketTask) {
    return isOverviewSupplierTicketTask(task) ? task.childTasks.map((childTask) => childTask.skuId) : [task.skuId];
  }

  function batchSkuTasksForTask(task: OverviewSkuTask | OverviewSupplierTicketTask) {
    return isOverviewSupplierTicketTask(task)
      ? task.childTasks
      : visibleTasks.filter((candidate): candidate is OverviewSkuTask =>
        isOverviewSkuTask(candidate) &&
        candidate.action === task.action &&
        candidate.supplierTicketId === task.supplierTicketId &&
        candidate.supplierName === task.supplierName,
      );
  }

  function supplierCaptureIntentForTask(task: OverviewSkuTask | OverviewSupplierTicketTask): 'order' | 'receipt' {
    return task.action === 'receive' ? 'receipt' : 'order';
  }

  function supplierCaptureFlashTargetsForTask(task: OverviewSkuTask | OverviewSupplierTicketTask): CaptureSessionFlashTarget[] {
    return supplierCaptureFlashTargetsForSkuIds(supplierSkuIdsForTask(task), supplierCaptureIntentForTask(task));
  }

  function supplierCaptureFlashTargetsForSkuIds(skuIds: string[], intent: 'order' | 'receipt'): CaptureSessionFlashTarget[] {
    return skuIds.map((skuId) => ({
      action: intent === 'receipt' ? 'supplier-receipt' : 'supplier-order',
      targetId: skuId,
      targetType: 'sku',
    }));
  }

  function customerTicketLinesForTask(task: OverviewCustomerTask) {
    return task.ticket?.lines ?? [];
  }

  function customerLineTargetType(line: SenaTicketLine): CaptureSessionTargetType {
    return line.entityType === 'service' ? 'service' : 'sku';
  }

  function customerTicketFlashTargetsForTask(task: OverviewCustomerTask): CaptureSessionFlashTarget[] {
    return customerTicketLinesForTask(task).map((line) => ({
      action: 'customer-order',
      targetId: line.entityId,
      targetType: customerLineTargetType(line),
    }));
  }

  function stockSnapshotForCustomerSales(salesBySku: Map<string, number>) {
    const deltasBySkuId = new Map(
      [...salesBySku]
        .filter(([, quantity]) => Number.isFinite(quantity) && quantity > 0)
        .map(([skuId, quantity]) => [skuId, -quantity] as const),
    );
    return stockSnapshotForTicketInventoryDeltas({
      catalog: inventory.catalog,
      deltasBySkuId,
      recordUpdateContext: inventory.recordUpdateContext,
      snapshot: inventory.snapshot,
    });
  }

  function buildSupplierQueueCaptureHref(task: OverviewSkuTask | OverviewSupplierTicketTask, mode: 'single' | 'batch') {
    const intent = supplierCaptureIntentForTask(task);
    if (isOverviewSupplierTicketTask(task)) {
      const skuIds = mode === 'batch' ? batchSkuTasksForTask(task).map((batchTask) => batchTask.skuId) : supplierSkuIdsForTask(task);
      const singleSkuId = skuIds[0];
      return buildSupplierTicketCaptureHref({
        mode: 'edit',
        intent,
        ticketId: task.ticketId,
        targetId: mode === 'single' ? singleSkuId : undefined,
        targetType: mode === 'single' && singleSkuId ? 'sku' : undefined,
        skuIds: mode === 'batch' ? skuIds : undefined,
        flashTargets: mode === 'batch' ? supplierCaptureFlashTargetsForSkuIds(skuIds, intent) : undefined,
      });
    }

    const skuIds = mode === 'batch' ? batchSkuTasksForTask(task).map((batchTask) => batchTask.skuId) : supplierSkuIdsForTask(task);
    if (task.supplierTicketId) {
      return buildSupplierTicketCaptureHref({
        mode: 'edit',
        intent,
        ticketId: task.supplierTicketId,
        targetId: mode === 'single' ? task.skuId : undefined,
        targetType: mode === 'single' ? 'sku' : undefined,
        skuIds: mode === 'batch' ? skuIds : undefined,
        flashTargets: mode === 'batch' ? supplierCaptureFlashTargetsForSkuIds(skuIds, intent) : undefined,
      });
    }
    return buildSupplierTicketCaptureHref({
      mode: 'new',
      intent,
      targetId: task.skuId,
      targetType: 'sku',
      skuIds: mode === 'batch' ? skuIds : undefined,
      flashTargets: mode === 'batch' ? supplierCaptureFlashTargetsForSkuIds(skuIds, intent) : undefined,
    });
  }

  function buildCustomerTicketCaptureQueueHref(task: OverviewCustomerTask, mode: 'single' | 'batch') {
    if (!isCustomerTicketTask(task)) {
      return task.href;
    }
    return buildCustomerTicketCaptureHref({
      mode: 'edit',
      ticketId: task.ticketId,
      targetId: undefined,
      targetType: undefined,
      flashTargets: mode === 'batch' ? customerTicketFlashTargetsForTask(task) : undefined,
    });
  }

  function buildBatchTaskGroup(task: OverviewSkuTask | OverviewSupplierTicketTask): TaskGroup {
    const groupTasks = batchSkuTasksForTask(task);

    return {
      action: task.action,
      supplierName: task.supplierName,
      tasks: groupTasks.map((groupTask) => ({
        batchOrderId: groupTask.batchOrderId,
        childOrderId: groupTask.childOrderId,
        id: groupTask.id,
        skuId: groupTask.skuId,
        skuName: groupTask.skuName,
      })),
    };
  }

  function buildCustomerBatchTaskGroup(task: OverviewCustomerTask): TaskGroup {
    return {
      action: task.action,
      supplierName: task.contactSummary,
      tasks: [{
        id: task.id,
        skuId: task.entityId ?? task.ticketId ?? task.id,
        skuName: task.ticketLineSummaryLabel ?? task.requestSummary,
      }],
    };
  }

  function routeSupplierQueueTask(task: OverviewSkuTask | OverviewSupplierTicketTask, mode: 'single' | 'batch', reason: string) {
    const href = buildSupplierQueueCaptureHref(task, mode);
    logWorkQueueBatchDebug('action-decision', {
      action: task.action,
      decision: mode === 'batch' ? 'navigate_capture_batch' : 'navigate_capture_single',
      href,
      reason,
      flashTargets: supplierCaptureFlashTargetsForTask(task).map((target) => `${target.action}:${target.targetId}`),
      skuIds: supplierSkuIdsForTask(task),
      supplierName: task.supplierName,
      taskId: task.id,
      taskKind: task.kind,
    });
    navigate(href);
  }

  function routeCustomerTicketQueueTask(task: OverviewCustomerTask, mode: 'single' | 'batch', reason: string) {
    const href = buildCustomerTicketCaptureQueueHref(task, mode);
    logWorkQueueBatchDebug('customer-action-decision', {
      action: task.action,
      decision: mode === 'batch' ? 'navigate_capture_batch' : 'navigate_capture_single',
      flashTargets: customerTicketFlashTargetsForTask(task).map((target) => `${target.targetType}:${target.targetId}`),
      href,
      lineCount: customerTicketLinesForTask(task).length,
      reason,
      taskId: task.id,
      ticketId: task.ticketId,
    });
    navigate(href);
  }

  async function rememberBatchActionChoice(task: OverviewSkuTask | OverviewSupplierTicketTask | OverviewCustomerTask, preference: 'always_batch' | 'always_alone') {
    const key = taskBatchPreferenceKeyForAction(task.action);
    if (!key) {
      return;
    }
    await savePreferences({
      taskBatchUpdatePreferences: {
        ...taskBatchUpdatePreferences,
        [key]: preference,
      },
    });
  }

  function submitBatchPrompt(mode: 'single' | 'batch') {
    const request = batchPromptRequest;
    if (!request) {
      return;
    }
    setBatchPromptRequest(null);
    if (request.rememberChoice) {
      void rememberBatchActionChoice(request.task, mode === 'batch' ? 'always_batch' : 'always_alone');
    }
    if (request.scope === 'customer') {
      routeCustomerTicketQueueTask(request.task as OverviewCustomerTask, mode, mode === 'batch' ? 'prompt_batch_selected' : 'prompt_single_selected');
      return;
    }
    routeSupplierQueueTask(request.task as OverviewSkuTask | OverviewSupplierTicketTask, mode, mode === 'batch' ? 'prompt_batch_selected' : 'prompt_single_selected');
  }

  function handleTaskActionClick(task: OverviewSkuTask | OverviewSupplierTicketTask) {
    if (isOverviewSupplierTicketTask(task)) {
      openSingleTask(task);
      return;
    }
    if (task.action === 'log_order' && !task.supplierTicketId) {
      const preference = taskBatchPreferenceForAction(task.action);
      const taskGroup = buildBatchTaskGroup(task);
      const debugBase = {
        action: task.action,
        actionLabel: task.actionLabel,
        flashTargets: supplierCaptureFlashTargetsForTask(task).map((target) => `${target.action}:${target.targetId}`),
        groupedTaskIds: taskGroup.tasks.map((groupTask) => groupTask.id),
        preference,
        skuIds: supplierSkuIdsForTask(task),
        taskId: task.id,
      };
      logWorkQueueBatchDebug('action-click', debugBase);
      if (preference === 'always_batch') {
        routeSupplierQueueTask(task, 'batch', 'stored_preference_always_batch');
        return;
      }
      if (preference === 'always_alone') {
        routeSupplierQueueTask(task, 'single', 'stored_preference_always_alone');
        return;
      }
      if (taskGroup.tasks.length > 1) {
        logWorkQueueBatchDebug('action-decision', {
          ...debugBase,
          decision: 'open_batch_prompt',
          reason: 'ask_preference_with_grouped_tasks',
        });
        setBatchPromptRequest({ rememberChoice: false, scope: 'supplier', task, taskGroup });
        return;
      }
      routeSupplierQueueTask(task, 'single', 'ask_preference_single_task');
      return;
    }

    openSingleTask(task, task.defaultDrawerMode === 'not_ordered' ? 'ordered_waiting' : task.defaultDrawerMode);
  }

  function handleCustomerTicketActionClick(task: OverviewCustomerTask) {
    const preference = taskBatchPreferenceForAction(task.action);
    const taskGroup = buildCustomerBatchTaskGroup(task);
    const debugBase = {
      action: task.action,
      actionLabel: task.actionLabel,
      flashTargets: customerTicketFlashTargetsForTask(task).map((target) => `${target.targetType}:${target.targetId}`),
      lineCount: taskGroup.tasks.length,
      preference,
      taskId: task.id,
      ticketId: task.ticketId,
    };
    logWorkQueueBatchDebug('customer-action-click', debugBase);
    if (preference === 'always_batch') {
      routeCustomerTicketQueueTask(task, 'batch', 'stored_preference_always_batch');
      return;
    }
    if (preference === 'always_alone') {
      routeCustomerTicketQueueTask(task, 'single', 'stored_preference_always_alone');
      return;
    }
    if (taskGroup.tasks.length > 1) {
      logWorkQueueBatchDebug('customer-action-decision', {
        ...debugBase,
        decision: 'open_batch_prompt',
        groupedTaskIds: taskGroup.tasks.map((groupTask) => groupTask.id),
        reason: 'ask_preference_with_grouped_tasks',
      });
      setBatchPromptRequest({ rememberChoice: false, scope: 'customer', task, taskGroup });
      return;
    }
    routeCustomerTicketQueueTask(task, 'single', 'ask_preference_single_task');
  }

  useEffect(() => {
    if (
      typeof loadWorkSupportData !== 'function' ||
      requestedOrderBatchesRef.current ||
      inventory.isLoading ||
      !inventory.catalog ||
      !inventory.workspaceSummary
    ) {
      return undefined;
    }
    requestedOrderBatchesRef.current = true;
    setIsLoadingWorkSupportData(needsInitialWorkSupportData);
    void loadWorkSupportData({ includeObservations: true })
      .then(() => {
        setHasLoadedInitialWorkSupportData(true);
      })
      .catch((error) => {
        requestedOrderBatchesRef.current = false;
        setHasLoadedInitialWorkSupportData(true);
        console.warn('[dashboard] work support data load failed', error);
      })
      .finally(() => {
        setIsLoadingWorkSupportData(false);
      });
    return undefined;
  }, [inventory.catalog, inventory.isLoading, inventory.workspaceSummary, loadWorkSupportData, needsInitialWorkSupportData]);

  useEffect(() => {
    const skuIds = orderedDashboardSkuDetailIds(inventory.workspaceSummary);
    if (skuIds.length === 0) {
      setDetailBySkuId({});
      setIsHydratingDetails(false);
      return;
    }

    let active = true;
    let cancelBackgroundTask: (() => void) | null = null;
    setIsHydratingDetails(true);
    setDetailBySkuId({});
    const initialSkuIds = skuIds.slice(0, DASHBOARD_INITIAL_DETAIL_HYDRATION_LIMIT);
    const backgroundSkuIds = skuIds.slice(DASHBOARD_INITIAL_DETAIL_HYDRATION_LIMIT);
    const loadDetail = async (skuId: string) => {
      try {
        return normalizeSkuDetailPage(await loadSenaSkuDetail(skuId))?.detail ?? null;
      } catch {
        return null;
      }
    };
    const applyDetailBatch = (batch: Record<string, SenaSkuDetail | null>) => {
      setDetailBySkuId((current) => ({ ...current, ...batch }));
    };
    const isActive = () => active;

    void hydrateSkuDetailsWithLimit(
      initialSkuIds,
      DASHBOARD_DETAIL_HYDRATION_CONCURRENCY,
      loadDetail,
      applyDetailBatch,
      isActive,
    ).then(() => {
      if (!active) {
        return;
      }
      if (backgroundSkuIds.length === 0) {
        setIsHydratingDetails(false);
        return;
      }
      cancelBackgroundTask = scheduleDeferredBackgroundTask(() => {
        void hydrateSkuDetailsWithLimit(
          backgroundSkuIds,
          DASHBOARD_DETAIL_HYDRATION_CONCURRENCY,
          loadDetail,
          applyDetailBatch,
          isActive,
        ).finally(() => {
          if (active) {
            setIsHydratingDetails(false);
          }
        });
      });
    });

    return () => {
      active = false;
      cancelBackgroundTask?.();
    };
  }, [inventory.workspaceSummary, loadSenaSkuDetail]);

  const model = useMemo(() => buildOverviewModel({
    catalog: inventory.catalog,
    detailBySkuId,
    forceStaleUpdateReminder: import.meta.env.MODE === 'development',
    language,
    observations: inventory.observations,
    orderBatches: inventory.orderBatches ?? [],
    recordUpdateContext: inventory.recordUpdateContext,
    staleUpdateReminderSnoozeUntil: overviewStaleUpdateReminderSnoozeUntil,
    workspaceSummary: inventory.workspaceSummary,
  }), [
    detailBySkuId,
    inventory.catalog,
    inventory.observations,
    inventory.orderBatches,
    inventory.recordUpdateContext,
    inventory.workspaceSummary,
    language,
    overviewStaleUpdateReminderSnoozeUntil,
  ]);
  const customerModel = useMemo(() => buildCustomerOverviewModel({
    automationIntakes: automation.intakes,
    catalog: inventory.catalog,
    language,
    observations: inventory.observations,
    recordUpdateContext: inventory.recordUpdateContext,
  }), [
    automation.intakes,
    inventory.catalog,
    inventory.observations,
    inventory.recordUpdateContext,
    language,
  ]);
  const customerTicketOptions = useMemo(
    () => sortRecordTicketOptionsByRecent(recordTicketOptions(inventory.recordUpdateContext, 'customer', inventory.catalog)),
    [inventory.catalog, inventory.recordUpdateContext],
  );

  const scopedTasks = useMemo(() => model.tasks.filter(
    (task) =>
      isOverviewSkuTask(task)
        ? matchesOverviewEntityScope(task, searchScope) && matchesOverviewQuery(task, deferredQuery, searchScope) && matchesOverviewSupplier(task, supplierFilter)
        : searchScope === 'all' && matchesOverviewQuery(task, deferredQuery, searchScope),
  ), [deferredQuery, model.tasks, searchScope, supplierFilter]);
  const visibleTasks = useMemo(
    () => scopedTasks.filter((task) => shouldShowTask(task, activeFilter)),
    [activeFilter, scopedTasks],
  );
  const visibleCustomerTasks = useMemo(
    () => customerModel.tasks.filter((task) =>
      shouldShowCustomerTask(task, customerFilter) && matchesCustomerOverviewQuery(task, deferredQuery),
    ),
    [customerFilter, customerModel.tasks, deferredQuery],
  );
  const selectedTask = useMemo(
    () => {
      if (!selectedTaskRequest) {
        return null;
      }
      const task = scopedTasks.find((candidate) => candidate.id === selectedTaskRequest.taskId) ?? null;
      if (!task) {
        return null;
      }
      if (isOverviewSupplierTicketTask(task)) {
        return task;
      }
      if (isOverviewSkuTask(task)) {
        return supplierTicketTaskForSkuTask({
          latestObservedAt: inventory.workspaceSummary?.latestObservedAt,
          task,
          translate: (value) => translateUiLiteral(language, value),
        });
      }
      return null;
    },
    [inventory.workspaceSummary?.latestObservedAt, language, scopedTasks, selectedTaskRequest],
  );
  const selectedAutomationIntake = useMemo(
    () => selectedAutomationIntakeId
      ? automation.intakes.find((intake) => intake.intakeId === selectedAutomationIntakeId) ?? null
      : null,
    [automation.intakes, selectedAutomationIntakeId],
  );
  const selectedCustomerCompletionTask = useMemo(
    () => selectedCustomerCompletionTaskId
      ? visibleCustomerTasks.find((task) => task.id === selectedCustomerCompletionTaskId) ?? null
      : null,
    [selectedCustomerCompletionTaskId, visibleCustomerTasks],
  );
  useBenchmarkRouteReady('work.queue', !inventory.isLoading && model != null, {
    hasWorkspaceSummary: Boolean(inventory.workspaceSummary),
    workflow: overviewScope,
  });
  const focusedCustomerTaskIndex = useMemo(
    () => routeState.customerTaskId
      ? visibleCustomerTasks.findIndex((task) => task.id === routeState.customerTaskId)
      : -1,
    [routeState.customerTaskId, visibleCustomerTasks],
  );
  const supplierQueue = useVirtualizedQueueRows(visibleTasks, null);
  const customerQueue = useVirtualizedQueueRows(
    visibleCustomerTasks,
    focusedCustomerTaskIndex >= 0 ? focusedCustomerTaskIndex : null,
  );

  useEffect(() => {
    if (overviewScope !== 'supplier' || !routeState.taskId) {
      return;
    }
    setSelectedTaskRequest((current) =>
      current?.taskId === routeState.taskId && current.mode === routeState.taskMode && current.routeLinked
        ? current
        : { taskId: routeState.taskId!, mode: routeState.taskMode, routeLinked: true },
    );
  }, [overviewScope, routeState.taskId, routeState.taskMode]);

  useEffect(() => {
    if (overviewScope !== 'customer' || !routeState.customerTaskId) {
      return;
    }
    const target = Array.from(document.querySelectorAll<HTMLElement>('[data-customer-task-id]'))
      .find((element) => element.dataset.customerTaskId === routeState.customerTaskId);
    if (!(target instanceof HTMLElement)) {
      return;
    }
    target.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [customerQueue.renderedRows, overviewScope, routeState.customerTaskId, visibleCustomerTasks]);

  useEffect(() => {
    if (selectedTaskRequest && !selectedTask) {
      setSelectedTaskRequest(null);
      if (selectedTaskRequest.routeLinked) {
        updateRouteState({ taskId: null, taskMode: null }, true);
      }
    }
  }, [selectedTask, selectedTaskRequest]);

  useEffect(() => {
    if (selectedAutomationIntakeId && !selectedAutomationIntake) {
      setSelectedAutomationIntakeId(null);
    }
  }, [selectedAutomationIntake, selectedAutomationIntakeId]);

  function openCustomerTask(task: (typeof visibleCustomerTasks)[number]) {
    if (task.source === 'telegram_intake' && task.automationIntakeId && !task.promotedTicketId) {
      setSelectedAutomationIntakeId(task.automationIntakeId);
      return;
    }
    openCustomerCompletionTask(task);
  }

  function openCustomerCompletionTask(task: OverviewCustomerTask) {
    setCustomerCompletionError(null);
    setSelectedCustomerCompletionTaskId(task.id);
    updateRouteState({ customerTaskId: task.id });
  }

  function openCustomerTicketQuickDrawer(task: OverviewCustomerTask) {
    setCustomerCompletionError(null);
    setSelectedCustomerCompletionTaskId(task.id);
  }

  function nextTouchDateInputToIso(value: string, observedAtValue: string) {
    return dateInputToIsoOnOrAfterObserved(value, observedAtValue);
  }

  async function submitCustomerCompletion(input: { notes: string; observedAt: string; quantity: number }) {
    if (!selectedCustomerCompletionTask || !Number.isFinite(input.quantity) || input.quantity <= 0) {
      return false;
    }
    setCustomerCompletionError(null);
    const observedAtIso = parseLocalDateTimeInputIso(input.observedAt);
    if (!observedAtIso) {
      setCustomerCompletionError(translateUiLiteral(language, 'Update date and time is required.'));
      return false;
    }
    const note = input.notes.trim() || null;
    const payload = createEmptyObservationInput({
      observedAt: observedAtIso,
      notes: note,
    });
    const completedQuantity = input.quantity;
    const pendingQuantity = Math.max(0, selectedCustomerCompletionTask.pendingQuantity);
    const completionLines = customerCompletionLines(selectedCustomerCompletionTask, completedQuantity);
    payload.commercialEvents = completionLines.flatMap((line) => {
      const lineQuantity = customerLineQuantity(line);
      if (lineQuantity == null) {
        return [];
      }
      const appliedQuantity = selectedCustomerCompletionTask.ticket ? lineQuantity : completedQuantity;
      return [
        ...(pendingQuantity > 0
          ? [{
              party: 'customer' as const,
              entityType: line.entityType,
              entityId: line.entityId,
              stage: 'pending' as const,
              quantityDelta: -Math.min(lineQuantity, appliedQuantity),
              flow: 'scheduled' as const,
              reason: 'from_pending',
              note,
            }]
          : []),
        {
          party: 'customer' as const,
          entityType: line.entityType,
          entityId: line.entityId,
          stage: 'realized' as const,
          quantityDelta: appliedQuantity,
          flow: pendingQuantity > 0 ? ('scheduled' as const) : ('immediate' as const),
          reason: pendingQuantity > 0 ? 'from_pending' : 'immediate_sale',
          note,
        },
      ];
    });
    const salesBySku = new Map<string, number>();
    const salesByService = new Map<string, number>();
    for (const event of payload.commercialEvents) {
      if (event.stage !== 'realized' || event.quantityDelta <= 0) {
        continue;
      }
      if (event.entityType === 'sku') {
        salesBySku.set(event.entityId, (salesBySku.get(event.entityId) ?? 0) + event.quantityDelta);
      } else {
        salesByService.set(event.entityId, (salesByService.get(event.entityId) ?? 0) + event.quantityDelta);
      }
    }
    payload.retailSalesSnapshot = [...salesBySku].map(([skuId, unitsSold]) => ({ skuId, unitsSold }));
    payload.retailRankings = [...salesBySku.keys()];
    payload.serviceSalesSnapshot = [...salesByService].map(([serviceId, unitsSold]) => ({ serviceId, unitsSold }));
    payload.serviceRankings = [...salesByService.keys()];
    payload.stockSnapshot = stockSnapshotForCustomerSales(salesBySku);

    if (selectedCustomerCompletionTask.ticket) {
      const ticket = selectedCustomerCompletionTask.ticket;
      const ticketEvent: SenaTicketEvent = {
        ticketId: ticket.ticketId,
        ticketFamily: 'customer',
        lifecycle: 'resolved',
        stage: 'fulfilled_immediate',
        revision: ticket.revision + 1,
        eventType: 'fulfilled_immediate',
        occurredAt: observedAtIso,
        nextTouchAt: null,
        party: ticket.party ?? null,
        lines: ticket.lines,
        deliveryFee: ticket.deliveryFee ?? null,
        discount: ticket.discount ?? null,
        note,
      };
      payload.ticketEvents = [...(payload.ticketEvents ?? []), ticketEvent];
    }
    if (!selectedCustomerCompletionTask.ticket && selectedCustomerCompletionTask.entityId) {
      payload.commercialEvents = [
        ...(pendingQuantity > 0
          ? [{
              party: 'customer' as const,
              entityType: selectedCustomerCompletionTask.entityType,
              entityId: selectedCustomerCompletionTask.entityId,
              stage: 'pending' as const,
              quantityDelta: -Math.min(pendingQuantity, completedQuantity),
              flow: 'scheduled' as const,
              reason: 'from_pending',
              note,
            }]
          : []),
        {
          party: 'customer' as const,
          entityType: selectedCustomerCompletionTask.entityType,
          entityId: selectedCustomerCompletionTask.entityId,
          stage: 'realized' as const,
          quantityDelta: completedQuantity,
          flow: pendingQuantity > 0 ? ('scheduled' as const) : ('immediate' as const),
          reason: pendingQuantity > 0 ? 'from_pending' : 'immediate_sale',
          note,
        },
      ];
      if (selectedCustomerCompletionTask.entityType === 'sku') {
        payload.retailSalesSnapshot = [{ skuId: selectedCustomerCompletionTask.entityId, unitsSold: completedQuantity }];
        payload.retailRankings = [selectedCustomerCompletionTask.entityId];
        payload.serviceSalesSnapshot = [];
        payload.serviceRankings = [];
      } else {
        payload.serviceSalesSnapshot = [{ serviceId: selectedCustomerCompletionTask.entityId, unitsSold: completedQuantity }];
        payload.serviceRankings = [selectedCustomerCompletionTask.entityId];
        payload.retailSalesSnapshot = [];
        payload.retailRankings = [];
      }
    }

    try {
      setIsQueueSaving(true);
      await ingestSenaObservation(payload);
      await triggerSenaRun({ algorithmVersion: 'sena-analysis-v3' });
      await loadWorkSupportData({ includeObservations: true }).catch((error) => {
        console.warn('[dashboard] work support refresh failed after customer completion', error);
      });
      setSelectedCustomerCompletionTaskId(null);
      updateRouteState({ customerTaskId: null }, true);
      return true;
    } catch (nextError) {
      setCustomerCompletionError(nextError instanceof Error ? nextError.message : translateUiLiteral(language, 'Unable to save customer completion.'));
      return false;
    } finally {
      setIsQueueSaving(false);
    }
  }

  async function submitCustomerTicketQuickUpdate(input: { action: 'follow_up' | 'cancel' | 'fulfill'; nextTouchAt: string; notes: string; observedAt: string }) {
    if (!isCustomerTicketTask(selectedCustomerCompletionTask)) {
      return false;
    }
    setCustomerCompletionError(null);
    const ticket = selectedCustomerCompletionTask.ticket;
    const observedAtIso = parseLocalDateTimeInputIso(input.observedAt);
    if (!observedAtIso) {
      setCustomerCompletionError(translateUiLiteral(language, 'Update date and time is required.'));
      return false;
    }
    const note = input.notes.trim() || null;
    const nextTouchAtIso = input.action === 'follow_up' ? nextTouchDateInputToIso(input.nextTouchAt, input.observedAt) : null;
    if (input.action === 'follow_up') {
      if (!nextTouchAtIso) {
        setCustomerCompletionError(translateUiLiteral(language, 'Next touch date is required.'));
        return false;
      }
      if (clampDateInputToObservedDate(input.nextTouchAt, input.observedAt) !== input.nextTouchAt) {
        setCustomerCompletionError(translateUiLiteral(language, 'Next touch date cannot be before the observed date.'));
        return false;
      }
    }
    const payload = createEmptyObservationInput({
      observedAt: observedAtIso,
      notes: note,
    });
    const lifecycle = input.action === 'cancel' ? 'canceled' : input.action === 'fulfill' ? 'resolved' : 'open';
    const stage = input.action === 'fulfill' ? 'fulfilled_immediate' : ticket.stage;
    const eventType = input.action === 'cancel' ? 'canceled' : input.action === 'fulfill' ? 'fulfilled_immediate' : 'note_added';
    const ticketEvent: SenaTicketEvent = {
      ticketId: ticket.ticketId,
      ticketFamily: 'customer',
      lifecycle,
      stage,
      revision: ticket.revision + 1,
      eventType,
      occurredAt: observedAtIso,
      nextTouchAt: nextTouchAtIso,
      party: ticket.party ?? null,
      lines: ticket.lines,
      deliveryFee: ticket.deliveryFee ?? null,
      discount: ticket.discount ?? null,
      note,
    };
    payload.ticketEvents = [ticketEvent];

    if (input.action === 'fulfill') {
      payload.commercialEvents = ticket.lines.flatMap((line) => {
        const quantity = customerLineQuantity(line);
        if (quantity == null) {
          return [];
        }
        return [
          {
            party: 'customer' as const,
            entityType: line.entityType,
            entityId: line.entityId,
            stage: 'pending' as const,
            quantityDelta: -quantity,
            flow: 'scheduled' as const,
            reason: 'from_pending',
            note,
          },
          {
            party: 'customer' as const,
            entityType: line.entityType,
            entityId: line.entityId,
            stage: 'realized' as const,
            quantityDelta: quantity,
            flow: 'scheduled' as const,
            reason: 'from_pending',
            note,
          },
        ];
      });
      const salesBySku = new Map<string, number>();
      const salesByService = new Map<string, number>();
      for (const event of payload.commercialEvents) {
        if (event.stage !== 'realized' || event.quantityDelta <= 0) {
          continue;
        }
        if (event.entityType === 'sku') {
          salesBySku.set(event.entityId, (salesBySku.get(event.entityId) ?? 0) + event.quantityDelta);
        } else {
          salesByService.set(event.entityId, (salesByService.get(event.entityId) ?? 0) + event.quantityDelta);
        }
      }
      payload.retailSalesSnapshot = [...salesBySku].map(([skuId, unitsSold]) => ({ skuId, unitsSold }));
      payload.retailRankings = [...salesBySku.keys()];
      payload.serviceSalesSnapshot = [...salesByService].map(([serviceId, unitsSold]) => ({ serviceId, unitsSold }));
      payload.serviceRankings = [...salesByService.keys()];
      payload.stockSnapshot = stockSnapshotForCustomerSales(salesBySku);
    }

    try {
      setIsQueueSaving(true);
      await ingestSenaObservation(payload);
      await triggerSenaRun({ algorithmVersion: 'sena-analysis-v3' });
      await loadWorkSupportData({ includeObservations: true }).catch((error) => {
        console.warn('[dashboard] work support refresh failed after customer ticket update', error);
      });
      setSelectedCustomerCompletionTaskId(null);
      updateRouteState({ customerTaskId: null }, true);
      return true;
    } catch (nextError) {
      setCustomerCompletionError(nextError instanceof Error ? nextError.message : translateUiLiteral(language, 'Unable to save customer ticket update.'));
      return false;
    } finally {
      setIsQueueSaving(false);
    }
  }

  if (routeState.section === 'intake') {
    return <AutomationsRoute forcedSection="intake" />;
  }

  if (!inventory.catalog) {
    return (
      <WorkspacePage>
        <WorkspaceEmpty
          title={translateUiLiteral(language, 'Work needs products first')}
          hint={translateUiLiteral(language, 'Create the first SKU or service so Kaur Khor can build an action list from real products work.')}
          action={
            <WorkspaceActionRow>
              <CreateFirstSkuButton />
              <Button asChild variant="outline">
                <Link to="/catalog/services/new">
                  <EntityServiceIcon data-icon="inline-start" />
                  {translateUiLiteral(language, 'Create first service')}
                </Link>
              </Button>
            </WorkspaceActionRow>
          }
        />
      </WorkspacePage>
    );
  }

  if (!inventory.workspaceSummary) {
    return (
      <WorkspacePage>
        <WorkspaceEmpty
          title={translateUiLiteral(language, 'Work needs your first update')}
          hint={translateUiLiteral(language, 'Capture a live observation so Kaur Khor can build the order, receipt, and follow-up queue.')}
          action={
            <WorkspaceActionRow>
              <Button asChild className={overviewStartUpdateButtonClassName}>
                <Link to="/work/capture">
                  <NavigationTaskListIcon data-icon="inline-start" />
                  {translateUiLiteral(language, 'Start update')}
                </Link>
              </Button>
              <Button asChild variant="outline">
                <Link to={buildRememberedCatalogHref()}>
                  <NavigationCatalogIcon data-icon="inline-start" />
                  {translateUiLiteral(language, 'Open products')}
                </Link>
              </Button>
            </WorkspaceActionRow>
          }
        />
      </WorkspacePage>
    );
  }

  return (
    <WorkspacePage fitViewport className={embedded ? 'gap-4 p-0' : 'gap-5'}>
      {!embedded ? (
        <WorkspaceTitleCard
          helperExemptReason="Queue route copy and filter controls provide the desktop overview context."
          title={
            <span className="flex min-w-0 items-center gap-3">
              <RouteBackButton className="shrink-0" />
              <span className="truncate">{translateUiLiteral(language, 'Queue')}</span>
            </span>
          }
          descriptor={translateUiLiteral(language, 'Review customer and supplier work that needs attention next.')}
        >
          <FilterControlRow
            search={
              <SearchInput
                ariaLabel={translateUiLiteral(language, 'Search queue')}
                placeholder={t('searchPlaceholder')}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            }
            primaryFilter={
              <ResponsiveToggleFilter
                ariaLabel={translateUiLiteral(language, 'Select overview ticket family')}
                options={overviewScopeOptions}
                value={overviewScope}
                onValueChange={(nextValue) => {
                  updateRouteState({
                    workflow: nextValue,
                    customerFilter: nextValue === 'customer' ? customerFilter : 'all',
                    customerTaskId: nextValue === 'customer' ? routeState.customerTaskId : null,
                    taskId: nextValue === 'supplier' ? routeState.taskId : null,
                    taskMode: nextValue === 'supplier' ? routeState.taskMode : null,
                  });
                }}
              />
            }
            secondaryFilter={
              overviewScope === 'supplier' ? (
                <SupplierFilter
                  catalog={inventory.catalog}
                  className={compactFilterControlClassName}
                  value={supplierFilter}
                  onChange={(nextSupplier) =>
                    updateRouteState({
                      supplier: supplierFilterQueryValue(nextSupplier),
                      taskId: null,
                      taskMode: null,
                    })
                  }
                />
              ) : null
            }
          />
        </WorkspaceTitleCard>
      ) : null}

      {showWorkSupportLoading ? (
        <WorkSupportLoadingBoard />
      ) : (
      <div className="flex min-h-0 flex-col" data-work-window-root="queue">
        <div
          className="flex min-h-0 shrink-0 flex-col"
          data-work-window="queue"
        >
          <ChromeTabs
            className="relative min-h-0 gap-0"
            value={overviewScope === 'customer' ? customerFilter : activeFilter}
            onValueChange={(nextValue) => {
              if (overviewScope === 'customer') {
                updateRouteState({
                  customerFilter: nextValue as OverviewCustomerFilter,
                  customerTaskId: null,
                });
                return;
              }
              updateRouteState({ filter: nextValue as OverviewTaskFilter });
            }}
          >
        {showOverviewTaskTabs ? (
          <div className={`relative flex overflow-hidden px-5 sm:pl-8 sm:pr-6 ${showRightRailCards ? 'lg:pr-[calc(320px+1.5rem)]' : ''}`}>
            <ChromeTabsList aria-label={translateUiLiteral(language, 'Filter overview tasks')} className="min-w-0" collapseBehavior="progressive">
              {(overviewScope === 'customer'
                ? customerFilterOptions
                : filterOptions).map((option) => {
                const FilterTabIcon =
                  overviewScope === 'customer'
                    ? overviewCustomerFilterIcons[option.value as OverviewCustomerFilter]
                    : overviewTaskFilterIcons[option.value as OverviewTaskFilter];
                return (
                  <ChromeTabsTrigger
                    key={option.value}
                    leading={FilterTabIcon ? <FilterTabIcon className="size-4" /> : undefined}
                    value={option.value}
                  >
                    {option.label}
                  </ChromeTabsTrigger>
                );
              })}
            </ChromeTabsList>
          </div>
        ) : null}

        <section
          className={`relative z-[1] ${boardClassName()}`}
          data-slot="overview-board"
          style={{
            marginTop: showOverviewTaskTabs ? 'calc(var(--chrome-tabs-surface-overlap) * -3)' : undefined,
          }}
        >
          {overviewScope === 'customer' ? (
            <div className={showRightRailCards ? 'grid min-h-0 gap-0 lg:grid-cols-[minmax(0,1fr)_320px]' : 'grid min-h-0 gap-0'}>
              <div className="flex min-h-0 min-w-0 flex-col border-b border-border/60 lg:border-r lg:border-b-0">
                <div className="border-b border-border/60 px-5 py-5 sm:px-6">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                    <div>
                      <h2 className="text-xl font-semibold tracking-[-0.03em] text-foreground">
                        {translateUiLiteral(language, 'Customer queue')}
                      </h2>
                      <p className="text-sm text-muted-foreground">
                        {translateUiLiteral(language, 'Open customer commitments, blocked work, and today’s completion signals.')}
                      </p>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {translateUiLiteral(language, '{count} visible', { count: visibleCustomerTasks.length })}
                    </p>
                  </div>
                </div>
                {visibleCustomerTasks.length > 0 ? (
                  <HeaderedTable>
                    <div className={overviewQueueTableLayout.containerClassName} style={overviewQueueTableLayout.style}>
                      <HeaderedTableHeader className={overviewQueueTableLayout.headerClassName}>
                        <HeaderedTableHeaderCell data-helper-exempt>{translateUiLiteral(language, 'Customer work')}</HeaderedTableHeaderCell>
                        <HeaderedTableHeaderCell data-helper-exempt>{translateUiLiteral(language, 'Contact')}</HeaderedTableHeaderCell>
                        <HeaderedTableHeaderCell data-helper-exempt>{translateUiLiteral(language, 'Request')}</HeaderedTableHeaderCell>
                        <HeaderedTableHeaderCell align="center" data-helper-exempt>{translateUiLiteral(language, 'Action')}</HeaderedTableHeaderCell>
                      </HeaderedTableHeader>
                      <HeaderedTableBody
                        className={`${overviewQueueTableLayout.bodyClassName}${customerQueue.isVirtualized ? ' max-h-[68vh] overflow-y-auto' : ''}`}
                        ref={customerQueue.bodyRef}
                      >
                        {customerQueue.topSpacerHeight > 0 ? (
                          <div aria-hidden style={{ height: customerQueue.topSpacerHeight }} />
                        ) : null}
                        {customerQueue.renderedRows.map((task) => {
                          const CustomerTaskActionIcon = task.actionLabel === translateUiLiteral(language, 'Review')
                            ? overviewTaskActionIcons.review
                            : ActionOpenExternalIcon;

                          return (
                            <HeaderedTableRow
                              key={task.id}
                              className={`${rowHoverClassName} ${overviewQueueTableLayout.rowClassName}`}
                              data-customer-task-id={task.id}
                            >
                              <div className="min-w-0">
                                <div className="flex flex-wrap items-center gap-2">
                                  {isCustomerTicketTask(task) ? (
                                    <button
                                      className="inline-flex items-center gap-1.5 text-left text-base font-semibold text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                                      type="button"
                                      onClick={() => openCustomerTicketQuickDrawer(task)}
                                    >
                                      <EntityCustomerIcon aria-hidden="true" className="size-4 shrink-0" />
                                      {task.displayTicketLabel ?? task.label}
                                    </button>
                                  ) : (
                                    <span className="text-base font-semibold text-foreground">{task.label}</span>
                                  )}
                                  <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[0.72rem] font-medium ${statusPillClassName(task.sourceBadgeTone)}`}>
                                    {task.sourceLabel}
                                  </span>
                                  <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[0.72rem] font-medium ${statusPillClassName(task.stateBadgeTone)}`}>
                                    {task.stateLabel}
                                  </span>
                                </div>
                                {task.summary ? (
                                  <p className="mt-2 text-sm leading-6 text-muted-foreground">{task.summary}</p>
                                ) : null}
                              </div>
                              <div className="min-w-0">
                                <HeaderedTableMobileLabel className={overviewQueueTableLayout.mobileLabelClassName}>
                                  {translateUiLiteral(language, 'Contact')}
                                </HeaderedTableMobileLabel>
                                <p className="font-medium text-foreground">{task.contactSummary}</p>
                                {task.contactDetail ? (
                                  <p className="mt-1 text-sm leading-6 text-muted-foreground">{task.contactDetail}</p>
                                ) : null}
                              </div>
                              <div className="min-w-0">
                                <HeaderedTableMobileLabel className={overviewQueueTableLayout.mobileLabelClassName}>
                                  {translateUiLiteral(language, 'Request')}
                                </HeaderedTableMobileLabel>
                                <p className="font-medium text-foreground">{task.requestSummary}</p>
                                {task.requestDetail ? (
                                  <p className="mt-1 text-sm leading-6 text-muted-foreground">{task.requestDetail}</p>
                                ) : null}
                              </div>
                              <div className="flex items-start lg:justify-center">
                                <Button
                                  className="w-[168px] justify-center"
                                  size="sm"
                                  type="button"
                                  variant={task.action === 'mark_completed' ? 'default' : 'outline'}
                                  onClick={() => {
                                    if (isCustomerTicketTask(task)) {
                                      openCustomerTicketQuickDrawer(task);
                                      return;
                                    }
                                    openCustomerTask(task);
                                  }}
                                >
                                  {CustomerTaskActionIcon ? <CustomerTaskActionIcon data-icon="inline-start" /> : null}
                                  {task.actionLabel}
                                </Button>
                              </div>
                            </HeaderedTableRow>
                          );
                        })}
                        {customerQueue.bottomSpacerHeight > 0 ? (
                          <div aria-hidden style={{ height: customerQueue.bottomSpacerHeight }} />
                        ) : null}
                      </HeaderedTableBody>
                    </div>
                  </HeaderedTable>
                ) : (
                  <div className="grid flex-1 place-items-center px-5 py-16 sm:px-6">
                    <div className="max-w-md text-center">
                      <ActionSearchOffIcon className="mx-auto size-9 text-muted-foreground/70" />
                      <h3 className="mt-4 text-lg font-semibold tracking-[-0.02em] text-foreground">
                        {translateUiLiteral(language, 'No customer tasks match this view')}
                      </h3>
                      <p className="mt-2 text-sm leading-6 text-muted-foreground">
                        {translateUiLiteral(language, 'Record pending or completed customer orders to bring the customer queue into view.')}
                      </p>
                    </div>
                  </div>
                )}
              </div>
              {showRightRailCards ? (
                <aside className="flex min-h-0 flex-col bg-secondary/15" data-slot="overview-right-rail">
                  <section className={railBlockClassName()}>
                    <div className="mb-4 flex items-center gap-2">
                      <NavigationTaskListIcon className="size-4 text-primary" />
                      <h2 className="text-lg font-semibold tracking-[-0.02em] text-foreground">
                        {translateUiLiteral(language, 'Today')}
                      </h2>
                    </div>
                    <div className="divide-y divide-border/50">
                      {[
                        ['review', translateUiLiteral(language, 'Review')],
                        ['quoted', translateUiLiteral(language, 'Quoted')],
                        ['open', translateUiLiteral(language, 'Open')],
                        ['closed', translateUiLiteral(language, 'Closed')],
                      ].map(([key, label]) => (
                        <button
                          key={key}
                          aria-pressed={customerFilter === key}
                          className={`flex w-full items-center justify-between px-3 py-3 text-left text-sm transition-colors ${rowHoverClassName}`}
                          type="button"
                          onClick={() => updateRouteState({ customerFilter: key as OverviewCustomerFilter, customerTaskId: null })}
                        >
                          <span className="flex min-w-0 items-center gap-2 text-muted-foreground">
                            <NavigationTaskListIcon data-icon="inline-start" className="size-4 shrink-0" />
                            <span className="truncate">{label}</span>
                          </span>
                          <span className="font-semibold text-foreground">
                            {customerModel.counts[key as keyof typeof customerModel.counts]}
                          </span>
                        </button>
                      ))}
                    </div>
                  </section>
                  <section className={railBlockClassName()}>
                    <div className="mb-4 flex items-center gap-2">
                      <EntitySignalIcon className="size-4 text-primary" />
                      <h2 className="text-lg font-semibold tracking-[-0.02em] text-foreground">
                        {translateUiLiteral(language, 'Customer signals')}
                      </h2>
                    </div>
                    <div className="divide-y divide-border/50">
                      {customerModel.signals.map((signal) => (
                        <div key={signal.id} className="py-3 text-sm leading-6 text-foreground">
                          {signal.text}
                        </div>
                      ))}
                    </div>
                  </section>
                  <section className="mt-auto flex justify-center px-5 py-5">
                    <Button asChild variant="outline">
                      <Link to="/work/capture">
                        <ActionOpenExternalIcon className="size-4" />
                        {translateUiLiteral(language, 'Open record updates')}
                      </Link>
                    </Button>
                  </section>
                </aside>
              ) : null}
            </div>
          ) : (
            <div className={showRightRailCards ? 'grid min-h-0 gap-0 lg:grid-cols-[minmax(0,1fr)_320px]' : 'grid min-h-0 gap-0'}>
          <div className="flex min-h-0 min-w-0 flex-col border-b border-border/60 lg:border-r lg:border-b-0">
            <div className="border-b border-border/60 px-5 py-5 sm:px-6">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <h2 className="text-xl font-semibold tracking-[-0.03em] text-foreground">
                    {translateUiLiteral(language, 'Task queue')}
                  </h2>
                  <p className="text-sm text-muted-foreground">
                    {translateUiLiteral(language, "The task list built from Kaur Khor's orders, deliveries, and arrival timing.")}
                  </p>
                </div>
                <p className="text-sm text-muted-foreground">
                  {translateUiLiteral(language, '{count} visible', {
                    count: visibleTasks.length,
                  })}
                  {isHydratingDetails ? ` · ${translateUiLiteral(language, 'refining receipt windows…')}` : null}
                </p>
              </div>
            </div>

            {visibleTasks.length > 0 ? (
              <HeaderedTable>
                <div className={overviewQueueTableLayout.containerClassName} style={overviewQueueTableLayout.style}>
                  <HeaderedTableHeader className={overviewQueueTableLayout.headerClassName}>
                    <HeaderedTableHeaderCell data-helper-exempt>{translateUiLiteral(language, 'Item / impact')}</HeaderedTableHeaderCell>
                    <HeaderedTableHeaderCell data-helper-exempt>{translateUiLiteral(language, 'Why now')}</HeaderedTableHeaderCell>
                    <HeaderedTableHeaderCell data-helper-exempt>{translateUiLiteral(language, 'ETA / window')}</HeaderedTableHeaderCell>
                    <HeaderedTableHeaderCell align="center" data-helper-exempt>{translateUiLiteral(language, 'Action')}</HeaderedTableHeaderCell>
                  </HeaderedTableHeader>
                  <HeaderedTableBody
                    className={`${overviewQueueTableLayout.bodyClassName}${supplierQueue.isVirtualized ? ' max-h-[68vh] overflow-y-auto' : ''}`}
                    ref={supplierQueue.bodyRef}
                  >
                    {supplierQueue.topSpacerHeight > 0 ? (
                      <div aria-hidden style={{ height: supplierQueue.topSpacerHeight }} />
                    ) : null}
                    {supplierQueue.renderedRows.map((task) => {
                      const TaskActionIcon = overviewTaskActionIcons[task.action];

                      return (
                        <HeaderedTableRow
                          key={task.id}
                          className={`${rowHoverClassName} ${overviewQueueTableLayout.rowClassName}`}
                          data-slot="overview-task-row"
                        >
                          <div className="min-w-0">
                            {isOverviewSupplierTicketTask(task) ? (
                              <button
                                className="group block min-w-0 text-left"
                                type="button"
                                onClick={() => openSingleTask(task)}
                              >
                                <ItemIdentityBlock
                                  align="center"
                                  description={showExplanatoryTooltips ? task.skuSummaryLabel : undefined}
                                  imagePath={task.imagePath}
                                  metadata={
                                    <>
                                      <span className="inline-flex items-center rounded-full border border-sky-200 bg-sky-50 px-2.5 py-1 text-[0.72rem] font-semibold text-sky-800">
                                        {translateUiLiteral(language, 'Supplier ticket')}
                                      </span>
                                      <SupplierBadge supplierName={task.supplierName} />
                                      <span
                                        className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[0.72rem] font-medium ${statusPillClassName(task.statusTone)}`}
                                      >
                                        {task.stateLabel}
                                      </span>
                                    </>
                                  }
                                  name={
                                    <span className="text-base font-semibold text-foreground transition-colors group-hover:text-primary">
                                      {task.displayTicketLabel}
                                    </span>
                                  }
                                  type="sku"
                                />
                              </button>
                            ) : isOverviewSkuTask(task) ? (
                              <Link
                                className="group block min-w-0 text-left"
                                state={buildKaurKhorNavigationState(location, '/catalog')}
                                to={buildSkuDetailHref(task.skuId)}
                              >
                                <ItemIdentityBlock
                                  align="center"
                                  description={showExplanatoryTooltips ? task.serviceImpact : undefined}
                                  imagePath={task.imagePath}
                                  metadata={
                                    <>
                                      <span className="inline-flex items-center rounded-full border border-sky-200 bg-sky-50 px-2.5 py-1 text-[0.72rem] font-semibold text-sky-800">
                                        {translateUiLiteral(language, 'Supplier')}
                                      </span>
                                      <SupplierBadge supplierName={task.supplierName} />
                                      <span
                                        className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[0.72rem] font-medium ${statusPillClassName(task.statusTone)}`}
                                      >
                                        {task.stateLabel}
                                      </span>
                                    </>
                                  }
                                  name={
                                    <span className="text-base font-semibold text-foreground transition-colors group-hover:text-primary">
                                      {task.skuName}
                                    </span>
                                  }
                                  type="sku"
                                />
                              </Link>
                            ) : (
                              <div className="min-w-0">
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className="text-base font-semibold text-foreground">
                                    {translateUiLiteral(language, 'Capture a fresh update')}
                                  </span>
                                  <span
                                    className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[0.72rem] font-medium ${statusPillClassName(task.statusTone)}`}
                                  >
                                    {task.stateLabel}
                                  </span>
                                </div>
                                {showExplanatoryTooltips ? (
                                  <p className="mt-2 text-sm leading-6 text-muted-foreground">{task.whyDetail}</p>
                                ) : null}
                              </div>
                            )}
                          </div>

                          <div className="min-w-0">
                            <HeaderedTableMobileLabel className={overviewQueueTableLayout.mobileLabelClassName}>
                              {translateUiLiteral(language, 'Why now')}
                            </HeaderedTableMobileLabel>
                            <p className="font-medium text-foreground">{task.whyNow}</p>
                            {showExplanatoryTooltips ? (
                              <p className="mt-1 text-sm leading-6 text-muted-foreground">{task.whyDetail}</p>
                            ) : null}
                            {showExplanatoryTooltips && isOverviewSupplierTicketTask(task) ? (
                              <p className="mt-1 text-sm leading-6 text-muted-foreground">{task.skuSummaryLabel}</p>
                            ) : null}
                            {showExplanatoryTooltips && isOverviewSkuTask(task) && task.reorderRecommendation.compactLabel ? (
                              <p className="mt-1 text-sm leading-6 text-muted-foreground">{task.reorderRecommendation.compactLabel}</p>
                            ) : null}
                          </div>

                          <div className="min-w-0">
                            <HeaderedTableMobileLabel className={overviewQueueTableLayout.mobileLabelClassName}>
                              {translateUiLiteral(language, 'ETA / window')}
                            </HeaderedTableMobileLabel>
                            <p className="font-medium text-foreground">{task.etaLabel}</p>
                            {showExplanatoryTooltips ? (
                              <p className="mt-1 text-sm leading-6 text-muted-foreground">
                                {task.confidenceCue} · {task.etaDetail}
                              </p>
                            ) : null}
                          </div>

                          <div className="flex items-start lg:justify-center">
                            {isOverviewSupplierTicketTask(task) ? (
                              <Button
                                className="min-w-[9.5rem] justify-center"
                                size="sm"
                                type="button"
                                variant={task.action === 'receive' ? 'default' : 'outline'}
                                onClick={() => handleTaskActionClick(task)}
                              >
                                {TaskActionIcon ? <TaskActionIcon className="size-4" /> : null}
                                {task.actionLabel}
                              </Button>
                            ) : isOverviewSkuTask(task) ? (
                              task.action === 'log_order' && !task.supplierTicketId ? (
                                <Button
                                  className="min-w-[9.5rem] justify-center"
                                  size="sm"
                                  type="button"
                                  onClick={() => handleTaskActionClick(task)}
                                >
                                  {TaskActionIcon ? <TaskActionIcon className="size-4" /> : null}
                                  {task.actionLabel}
                                </Button>
                              ) : (
                                <Button
                                  className="min-w-[9.5rem] justify-center"
                                  size="sm"
                                  type="button"
                                  variant={task.action === 'receive' ? 'default' : 'outline'}
                                  onClick={() => handleTaskActionClick(task)}
                                >
                                  {TaskActionIcon ? <TaskActionIcon className="size-4" /> : null}
                                  {task.actionLabel}
                                </Button>
                              )
                            ) : (
                              <Button asChild className="min-w-[9.5rem] justify-center" size="sm">
                                <Link to="/work/capture">
                                  {TaskActionIcon ? <TaskActionIcon className="size-4" /> : null}
                                  {task.actionLabel}
                                </Link>
                              </Button>
                            )}
                          </div>
                        </HeaderedTableRow>
                      );
                    })}
                    {supplierQueue.bottomSpacerHeight > 0 ? (
                      <div aria-hidden style={{ height: supplierQueue.bottomSpacerHeight }} />
                    ) : null}
                  </HeaderedTableBody>
                </div>
              </HeaderedTable>
            ) : (
              <div className="grid flex-1 place-items-center px-5 py-16 sm:px-6">
                <div className="max-w-md text-center">
                    <ActionSearchOffIcon className="mx-auto size-9 text-muted-foreground/70" />
                  <h3 className="mt-4 text-lg font-semibold tracking-[-0.02em] text-foreground">
                    {query || filter !== 'all'
                      ? translateUiLiteral(language, 'No tasks match this view')
                      : translateUiLiteral(language, 'No urgent tasks are crowding the queue')}
                  </h3>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">
                    {query || filter !== 'all'
                      ? translateUiLiteral(language, 'Try a broader query or switch filters to bring more of the task ledger back into view.')
                      : translateUiLiteral(language, 'Kaur Khor is not seeing an immediate reorder, receipt, or follow-up action. Keep logs moving or capture the next live signal.')}
                  </p>
                </div>
              </div>
            )}
          </div>

          {showRightRailCards ? (
          <aside className="flex min-h-0 flex-col bg-secondary/15" data-slot="overview-right-rail">
            <section className={railBlockClassName()}>
              <div className="mb-4 flex items-center gap-2">
                <NavigationTaskListIcon className="size-4 text-primary" />
                <h2 className="text-lg font-semibold tracking-[-0.02em] text-foreground">
                  {translateUiLiteral(language, 'Today')}
                </h2>
              </div>
              <div className="divide-y divide-border/50">
                {todayFilterRows.map((row) => {
                  return (
                    <button
                      key={row.filter}
                      aria-pressed={filter === row.filter}
                      className={`flex w-full items-center justify-between px-3 py-3 text-left text-sm transition-colors ${rowHoverClassName}`}
                      type="button"
                      onClick={() => updateRouteState({ filter: row.filter })}
                    >
                      <span className="flex min-w-0 items-center gap-2 text-muted-foreground">
                        <NavigationTaskListIcon data-icon="inline-start" className="size-4 shrink-0" />
                        <span className="truncate">{row.label}</span>
                      </span>
                      <span className="font-semibold text-foreground">{model.todayCounts[row.countKey]}</span>
                    </button>
                  );
                })}
              </div>
            </section>

            {hasRenderableRows(model.inTransit) ? (
            <section className={railBlockClassName()}>
              <div className="mb-4 flex items-center gap-2">
                <EntityTransitIcon className="size-4 text-primary" />
                <h2 className="text-lg font-semibold tracking-[-0.02em] text-foreground">
                  {translateUiLiteral(language, 'In transit')}
                </h2>
              </div>
              <div className="divide-y divide-border/50">
                {model.inTransit.map((row) => (
                    <button
                      key={row.id}
                      className={`flex w-full items-center justify-between px-3 py-3 text-left transition-colors ${rowHoverClassName}`}
                      data-slot="overview-rail-row"
                      type="button"
                      onClick={() => {
                        const task = scopedTasks.find(
                          (candidate): candidate is OverviewSkuTask => candidate.id === row.id && isOverviewSkuTask(candidate),
                        );
                        if (task) {
                          openSingleTask(task);
                        }
                      }}
                    >
                      <span className="flex min-w-0 items-center gap-2 pr-3 text-sm font-medium text-foreground">
                        <EntityTransitIcon data-icon="inline-start" className="size-4 shrink-0 text-muted-foreground" />
                        <span className="truncate">{row.name}</span>
                      </span>
                      <span className="shrink-0 text-sm text-muted-foreground">{row.etaLabel}</span>
                    </button>
                  ))}
              </div>
            </section>
            ) : null}

            {hasRenderableRows(model.recentReceipts) ? (
            <section className={railBlockClassName()}>
              <div className="mb-4 flex items-center gap-2">
                <EntityReceiptDocumentIcon className="size-4 text-primary" />
                <h2 className="text-lg font-semibold tracking-[-0.02em] text-foreground">
                  {translateUiLiteral(language, 'Recent receipts')}
                </h2>
              </div>
              <div className="divide-y divide-border/50">
                {model.recentReceipts.map((row) => (
                    <button
                      key={row.id}
                      className={`flex w-full items-center justify-between px-3 py-3 text-left transition-colors ${rowHoverClassName}`}
                      data-slot="overview-rail-row"
                      type="button"
                      onClick={() => {
                        const task = scopedTasks.find(
                          (candidate): candidate is OverviewSkuTask => candidate.id === row.skuId && isOverviewSkuTask(candidate),
                        );
                        if (task) {
                          openSingleTask(task, 'goods_received');
                        }
                      }}
                    >
                      <div className="min-w-0 pr-3">
                        <p className="flex items-center gap-2 truncate text-sm font-medium text-foreground">
                          <EntityReceiptDocumentIcon data-icon="inline-start" className="size-4 shrink-0 text-muted-foreground" />
                          {row.quantityLabel} {row.name}
                        </p>
                      </div>
                      <span className="shrink-0 text-sm text-muted-foreground">{row.receivedLabel}</span>
                    </button>
                  ))}
              </div>
            </section>
            ) : null}

            {hasRenderableRows(model.signals) ? (
            <section className={`${railBlockClassName()} border-b border-border/60`}>
              <div className="mb-4 flex items-center gap-2">
                <EntitySignalIcon className="size-4 text-primary" />
                <h2 className="text-lg font-semibold tracking-[-0.02em] text-foreground">
                  {translateUiLiteral(language, 'Business signals')}
                </h2>
              </div>
              <div className="divide-y divide-border/50">
                {model.signals.map((signal) => (
                    <div
                      key={signal.id}
                      className="py-3 text-sm leading-6 text-foreground"
                    >
                      {signal.text}
                    </div>
                  ))}
              </div>
            </section>
            ) : null}

            <section className="mt-auto flex justify-center px-5 py-5">
              <Button asChild variant="outline">
                <Link state={buildKaurKhorNavigationState(location)} to="/settings/history">
                  <ActionOpenExternalIcon className="size-4" />
                  {translateUiLiteral(language, 'Open logs')}
                </Link>
              </Button>
            </section>
          </aside>
          ) : null}
        </div>
          )}
        </section>
          </ChromeTabs>
        </div>
        <div aria-hidden="true" className="h-32 shrink-0 md:h-36" data-work-bottom-breathing-room="queue" />
      </div>
      )}

      {batchPromptRequest ? (
        <BatchActionPrompt
          open
          rememberChoice={batchPromptRequest.rememberChoice}
          taskGroup={batchPromptRequest.taskGroup}
          onBatchUpdate={() => submitBatchPrompt('batch')}
          onClose={() => setBatchPromptRequest(null)}
          onRememberChoiceChange={(checked) => {
            setBatchPromptRequest((current) => current ? { ...current, rememberChoice: checked } : current);
          }}
          onUpdateIndividually={() => submitBatchPrompt('single')}
        />
      ) : null}

      {overviewScope === 'supplier' ? (
        <>
          <OverviewTaskDrawer
            mode={selectedTaskRequest?.mode ?? selectedTask?.defaultDrawerMode ?? null}
            open={selectedTask != null}
            task={selectedTask}
            onPrepareAfterSave={refreshQueueAfterSave}
            onModeChange={(nextMode) => {
              setSelectedTaskRequest((current) => current ? { ...current, mode: nextMode } : current);
            }}
            onOpenChange={(open) => {
              if (!open) {
                setSelectedTaskRequest(null);
                if (routeState.taskId) {
                  updateRouteState({ taskId: null, taskMode: null }, true);
                }
              }
            }}
          />

        </>
      ) : null}
      <CustomerQueueDrawer
        error={customerCompletionError}
        isSaving={inventory.isSaving || isQueueSaving}
        language={language}
        open={selectedCustomerCompletionTask != null}
        task={selectedCustomerCompletionTask}
        onOpenChange={(open) => {
          if (!open) {
            setSelectedCustomerCompletionTaskId(null);
            setCustomerCompletionError(null);
            if (routeState.customerTaskId) {
              updateRouteState({ customerTaskId: null }, true);
            }
          }
        }}
        onSubmit={submitCustomerCompletion}
        onSubmitTicket={submitCustomerTicketQuickUpdate}
      />
      <LoadingMoreIntervalsIsland label="Saving..." visible={isQueueSaving} />
      <AutomationIntakeDrawer
        intake={selectedAutomationIntake}
        isSaving={automation.isSaving}
        language={language}
        open={selectedAutomationIntake != null}
        onClose={() => setSelectedAutomationIntakeId(null)}
        onPromote={automation.promoteIntake}
        onResolve={automation.resolveIntake}
        ticketOptions={customerTicketOptions}
      />
    </WorkspacePage>
  );
}
