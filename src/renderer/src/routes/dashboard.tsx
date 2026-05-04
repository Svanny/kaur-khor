import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useSearchParams } from 'react-router-dom';
import type { SenaSkuDetail, SenaWorkspaceSummary } from '@shared/sena';
import {
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
  useWorkspaceWindowMinHeight,
} from '@/components/system/workspace';
import type { IconComponent } from '@icons';
import { compactFilterControlClassName } from '@/components/system/compact-controls';
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
import { Skeleton } from '@/components/ui/skeleton';
import { rowHoverClassName } from '@/lib/interactive-surface';
import { buildOverviewSearchParams, buildSkuDetailHref, readOverviewRouteState } from '@/lib/navigation-state';
import { deriveAvailableObservationCount } from '@/lib/observation-count';
import { buildRememberedCatalogHref } from '@/lib/page-state-memory';
import { useBenchmarkRouteReady } from '@/lib/benchmark-route-ready';
import { matchesSupplierName, type SupplierFilterValue } from '@/lib/sena-catalog';
import { normalizeSkuDetailPage } from '@/lib/sena-detail-pages';
import { statusPillClassName } from '@/lib/state-tones';
import { translateUiLiteral } from '@/lib/translations';
import { useAutomation } from '@/state/automation';
import { useInventoryActions, useInventoryState } from '@/state/inventory';
import { buildKaurKhorNavigationState } from '@/state/navigation-history';
import { usePreferences } from '@/state/preferences';
import { AutomationsRoute } from './automations';
import { AutomationIntakeDrawer } from './automations/intake-drawer';
import { OverviewTaskDrawer } from './overview/task-drawer';
import {
  buildOverviewModel,
  isOverviewSkuTask,
  shouldShowTask,
  type OverviewSkuTask,
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
  const id = window.setTimeout(task, 0);
  return () => window.clearTimeout(id);
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
    const handleViewportChange = () => updateRange();
    handleViewportChange();
    container.addEventListener('scroll', handleViewportChange, { passive: true });
    window.addEventListener('resize', handleViewportChange);
    return () => {
      container.removeEventListener('scroll', handleViewportChange);
      window.removeEventListener('resize', handleViewportChange);
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
  return `${cardFrameClassName} ${cardSurfaceClassName} flex min-h-0 flex-1 flex-col overflow-hidden rounded-[2rem]`;
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
  ]
    .join(' ')
    .toLowerCase()
    .includes(normalized);
}

function matchesOverviewSupplier(task: OverviewTask, supplierFilter: SupplierFilterValue) {
  if (!isOverviewSkuTask(task) || supplierFilter === 'all') {
    return true;
  }

  return matchesSupplierName(task.supplierName, supplierFilter);
}

export function DashboardRoute({ embedded = false }: { embedded?: boolean } = {}) {
  const inventory = useInventoryState();
  const { loadSenaSkuDetail, loadWorkSupportData } = useInventoryActions();
  const automation = useAutomation();
  const {
    language,
    overviewStaleUpdateReminderSnoozeUntil,
    showExplanatoryTooltips,
    showOverviewTaskTabs,
    showRightRailCards,
    t,
  } = usePreferences();
  const location = useLocation();
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
  const workWindow = useWorkspaceWindowMinHeight<HTMLDivElement>(`${overviewScope}:${overviewScope === 'customer' ? customerFilter : activeFilter}:${showRightRailCards}`);
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

  function updateRouteState(nextState: Parameters<typeof buildOverviewSearchParams>[1], replace = false) {
    setSearchParams(buildOverviewSearchParams(searchParams, nextState), { replace });
  }

  function openSingleTask(task: Pick<OverviewSkuTask, 'id' | 'defaultDrawerMode'>, mode = task.defaultDrawerMode) {
    setSelectedTaskRequest({ taskId: task.id, mode });
  }

  function handleTaskActionClick(task: OverviewSkuTask) {
    openSingleTask(task);
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
  }), [
    automation.intakes,
    inventory.catalog,
    inventory.observations,
    language,
  ]);

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
    () => selectedTaskRequest
      ? scopedTasks.find(
        (task): task is OverviewSkuTask => task.id === selectedTaskRequest.taskId && isOverviewSkuTask(task),
      ) ?? null
      : null,
    [scopedTasks, selectedTaskRequest],
  );
  const selectedAutomationIntake = useMemo(
    () => selectedAutomationIntakeId
      ? automation.intakes.find((intake) => intake.intakeId === selectedAutomationIntakeId) ?? null
      : null,
    [automation.intakes, selectedAutomationIntakeId],
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
    if (task.source !== 'telegram_intake' || !task.automationIntakeId || task.promotedTicketId) {
      return;
    }
    setSelectedAutomationIntakeId(task.automationIntakeId);
  }

  if (routeState.section === 'intake') {
    return <AutomationsRoute forcedSection="intake" />;
  }

  if (!inventory.catalog) {
    return (
      <WorkspacePage>
        <WorkspaceEmpty
          title={translateUiLiteral(language, 'Work needs the catalog first')}
          hint={translateUiLiteral(language, 'Create the first SKU or service so Kaur Khor can build an action list from real catalog work.')}
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
                  {translateUiLiteral(language, 'Open catalog')}
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
          title={
            <span className="flex min-w-0 items-center gap-3">
              <RouteBackButton className="shrink-0" />
              <span className="truncate">{translateUiLiteral(language, 'Queue')}</span>
            </span>
          }
          descriptor={translateUiLiteral(language, 'Review customer and supplier work that needs attention next.')}
        >
          <div className="grid min-w-0 gap-3 lg:grid-cols-[minmax(12rem,1fr)_auto_minmax(8rem,10.5rem)] lg:items-center lg:gap-4">
            <div className="min-w-0">
              <SearchInput
                ariaLabel={translateUiLiteral(language, 'Search queue')}
                placeholder={t('searchPlaceholder')}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </div>
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
            <SupplierFilter
              catalog={inventory.catalog}
              className={compactFilterControlClassName}
              value={supplierFilter}
              disabled={overviewScope === 'customer'}
              onChange={(nextSupplier) =>
                updateRouteState({
                  supplier: supplierFilterQueryValue(nextSupplier),
                  taskId: null,
                  taskMode: null,
                })
              }
            />
          </div>
        </WorkspaceTitleCard>
      ) : null}

      {showWorkSupportLoading ? (
        <WorkSupportLoadingBoard />
      ) : (
      <div className="flex min-h-0 flex-1 flex-col" data-work-window-root="queue">
        <div
          ref={workWindow.ref}
          className="flex min-h-0 shrink-0 flex-col"
          data-work-window="queue"
          style={workWindow.style}
        >
          <ChromeTabs
            className="relative min-h-0 flex-1 gap-0"
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
            <div className={showRightRailCards ? 'grid h-full min-h-0 items-stretch gap-0 lg:grid-cols-[minmax(0,1fr)_320px]' : 'grid h-full min-h-0 gap-0'}>
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
                        <HeaderedTableHeaderCell>{translateUiLiteral(language, 'Customer work')}</HeaderedTableHeaderCell>
                        <HeaderedTableHeaderCell>{translateUiLiteral(language, 'Why now')}</HeaderedTableHeaderCell>
                        <HeaderedTableHeaderCell>{translateUiLiteral(language, 'Open / today')}</HeaderedTableHeaderCell>
                        <HeaderedTableHeaderCell align="center">{translateUiLiteral(language, 'Action')}</HeaderedTableHeaderCell>
                      </HeaderedTableHeader>
                      <HeaderedTableBody
                        className={`${overviewQueueTableLayout.bodyClassName}${customerQueue.isVirtualized ? ' max-h-[68vh] overflow-y-auto' : ''}`}
                        ref={customerQueue.bodyRef}
                      >
                        {customerQueue.topSpacerHeight > 0 ? (
                          <div aria-hidden style={{ height: customerQueue.topSpacerHeight }} />
                        ) : null}
                        {customerQueue.renderedRows.map((task) => (
                          <HeaderedTableRow
                            key={task.id}
                            className={`${rowHoverClassName} ${overviewQueueTableLayout.rowClassName} ${routeState.customerTaskId === task.id ? 'ring-2 ring-emerald-300 ring-offset-2 ring-offset-background bg-emerald-50/40' : ''}`}
                            data-customer-task-id={task.id}
                          >
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="text-base font-semibold text-foreground">{task.label}</span>
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
                                {translateUiLiteral(language, 'Why now')}
                              </HeaderedTableMobileLabel>
                              <p className="font-medium text-foreground">{task.whyNow}</p>
                              <p className="mt-1 text-sm leading-6 text-muted-foreground">{task.whyDetail}</p>
                            </div>
                            <div className="min-w-0">
                              <HeaderedTableMobileLabel className={overviewQueueTableLayout.mobileLabelClassName}>
                                {translateUiLiteral(language, 'Open / today')}
                              </HeaderedTableMobileLabel>
                              <p className="font-medium text-foreground">
                                {translateUiLiteral(language, '{open} open · {done} completed today', {
                                  open: task.pendingQuantity,
                                  done: task.completedToday,
                                })}
                              </p>
                              <p className="mt-1 text-sm leading-6 text-muted-foreground">
                                {translateUiLiteral(language, '{blocked} blocked · {canceled} canceled today', {
                                  blocked: task.blockedQuantity,
                                  canceled: task.canceledToday,
                                })}
                              </p>
                            </div>
                            <div className="flex items-start lg:justify-center">
                              {task.source === 'telegram_intake' && task.automationIntakeId && !task.promotedTicketId ? (
                                <Button
                                  className="w-[168px] justify-center"
                                  size="sm"
                                  type="button"
                                  variant={task.action === 'mark_completed' ? 'default' : 'outline'}
                                  onClick={() => openCustomerTask(task)}
                                >
                                  <ActionOpenExternalIcon data-icon="inline-start" />
                                  {task.actionLabel}
                                </Button>
                              ) : (
                                <Button asChild className="w-[168px] justify-center" size="sm" variant={task.action === 'mark_completed' ? 'default' : 'outline'}>
                                  <Link to={task.href}>
                                    <ActionOpenExternalIcon data-icon="inline-start" />
                                    {task.actionLabel}
                                  </Link>
                                </Button>
                              )}
                            </div>
                          </HeaderedTableRow>
                        ))}
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
                <aside className="flex h-full min-h-0 flex-col bg-secondary/15" data-slot="overview-right-rail">
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
            <div className={showRightRailCards ? 'grid h-full min-h-0 items-stretch gap-0 lg:grid-cols-[minmax(0,1fr)_320px]' : 'grid h-full min-h-0 gap-0'}>
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
                    <HeaderedTableHeaderCell>{translateUiLiteral(language, 'Item / impact')}</HeaderedTableHeaderCell>
                    <HeaderedTableHeaderCell>{translateUiLiteral(language, 'Why now')}</HeaderedTableHeaderCell>
                    <HeaderedTableHeaderCell>{translateUiLiteral(language, 'ETA / window')}</HeaderedTableHeaderCell>
                    <HeaderedTableHeaderCell align="center">{translateUiLiteral(language, 'Action')}</HeaderedTableHeaderCell>
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
                            {isOverviewSkuTask(task) ? (
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
                            {isOverviewSkuTask(task) ? (
                              <Button
                                className="min-w-[9.5rem] justify-center"
                                size="sm"
                                type="button"
                                variant={task.action === 'log_order' || task.action === 'receive' ? 'default' : 'outline'}
                                onClick={() => handleTaskActionClick(task)}
                              >
                                {TaskActionIcon ? <TaskActionIcon className="size-4" /> : null}
                                {task.actionLabel}
                              </Button>
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
          <aside className="flex h-full min-h-0 flex-col bg-secondary/15" data-slot="overview-right-rail">
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

      {overviewScope === 'supplier' ? (
        <>
          <OverviewTaskDrawer
            mode={selectedTaskRequest?.mode ?? selectedTask?.defaultDrawerMode ?? null}
            open={selectedTask != null}
            task={selectedTask}
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
      <AutomationIntakeDrawer
        conversationId={selectedAutomationIntake?.conversationId ?? null}
        intake={selectedAutomationIntake}
        isSaving={automation.isSaving}
        open={selectedAutomationIntake != null}
        onClose={() => setSelectedAutomationIntakeId(null)}
        onPromote={automation.promoteIntake}
        onReadConversation={automation.readConversation}
        onResolve={automation.resolveIntake}
      />
    </WorkspacePage>
  );
}
