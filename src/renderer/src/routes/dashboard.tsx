import { useDeferredValue, useEffect, useState } from 'react';
import type { DesktopTaskBatchUpdatePreferences } from '@shared/ipc';
import { Link, useSearchParams } from 'react-router-dom';
import type { SenaSkuDetail } from '@shared/sena';
import {
  ActionOpenExternalIcon,
  ActionSearchOffIcon,
} from '@icons/actions';
import {
  overviewTaskActionIcons,
  overviewTaskFilterIcons,
} from '@icons/domain';
import {
  EntityLayersIcon,
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
import { CreateFirstSkuButton } from '@/components/system/create-first-sku-button';
import { ItemIdentityBlock } from '@/components/system/item-identity';
import { rightRailLayoutClassName } from '@/components/system/right-rail-layout';
import {
  createHeaderedTableLayout,
  HeaderedTable,
  HeaderedTableBody,
  HeaderedTableHeader,
  HeaderedTableHeaderCell,
  HeaderedTableMobileLabel,
  HeaderedTableRow,
} from '@/components/system/headered-table';
import { SearchInput } from '@/components/system/search-input';
import { SupplierBadge, SupplierFilter, supplierFilterQueryValue, supplierFilterValueForQuery } from '@/components/system/supplier';
import { Button } from '@/components/ui/button';
import { cardFrameClassName, cardSurfaceClassName } from '@/components/ui/card';
import { ChromeTabs, ChromeTabsList, ChromeTabsTrigger } from '@/components/ui/chrome-tabs';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { rowHoverClassName } from '@/lib/interactive-surface';
import { buildOverviewSearchParams, readOverviewRouteState } from '@/lib/navigation-state';
import { matchesSupplierName, type SupplierFilterValue } from '@/lib/sena-catalog';
import { normalizeSkuDetailPage } from '@/lib/sena-detail-pages';
import { buildBatchUpdateHref, getLaneForTaskAction, type RecordUpdateLaneId } from '@/lib/record-update-routes';
import { statusPillClassName } from '@/lib/state-tones';
import { translateUiLiteral } from '@/lib/translations';
import { useInventory } from '@/state/inventory';
import { usePreferences } from '@/state/preferences';
import { OverviewTaskDrawer } from './overview/task-drawer';
import { BatchActionPrompt, type TaskGroup } from '@/components/system/batch-action-prompt';
import {
  buildOverviewModel,
  isOverviewSkuTask,
  shouldShowTask,
  type OverviewSkuTask,
  type OverviewTask,
  type OverviewTaskFilter,
} from './overview/view-model';

const overviewQueueTableLayout = createHeaderedTableLayout({
  breakpoint: 'lg',
  columns: 'minmax(18rem,1.15fr) minmax(14rem,0.95fr) minmax(16rem,1fr) minmax(10rem,0.7fr)',
  gap: 5,
});

type OverviewSearchScope = 'all' | 'skus' | 'services';

function boardClassName() {
  return `${cardFrameClassName} ${cardSurfaceClassName} overflow-hidden rounded-[2rem]`;
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

function matchesOverviewSupplier(task: OverviewTask, supplierFilter: SupplierFilterValue) {
  if (!isOverviewSkuTask(task) || supplierFilter === 'all') {
    return true;
  }

  return matchesSupplierName(task.supplierName, supplierFilter);
}

function preferenceKeyForTaskAction(
  action: OverviewSkuTask['action'],
): keyof DesktopTaskBatchUpdatePreferences {
  switch (action) {
    case 'log_order':
      return 'logOrder';
    case 'update_eta':
      return 'updateEta';
    case 'follow_up':
      return 'followUp';
    case 'receive':
      return 'receive';
    case 'review':
    default:
      return 'review';
  }
}

export function DashboardRoute() {
  const inventory = useInventory();
  const {
    language,
    overviewStaleUpdateReminderSnoozeUntil,
    showExplanatoryTooltips,
    showOverviewTaskTabs,
    showRightRailCards,
    savePreferences,
    t,
    taskBatchUpdatePreferences,
  } = usePreferences();
  const [searchParams, setSearchParams] = useSearchParams();
  const [query, setQuery] = useState('');
  const deferredQuery = useDeferredValue(query);
  const [detailBySkuId, setDetailBySkuId] = useState<Record<string, SenaSkuDetail | null>>({});
  const [isHydratingDetails, setIsHydratingDetails] = useState(false);
  const [selectedTaskGroup, setSelectedTaskGroup] = useState<{
    group: TaskGroup;
    laneId: RecordUpdateLaneId;
    preferenceKey: keyof DesktopTaskBatchUpdatePreferences;
    selectedTask: Pick<OverviewSkuTask, 'id' | 'defaultDrawerMode'>;
  } | null>(null);
  const [rememberBatchChoice, setRememberBatchChoice] = useState(false);
  const routeState = readOverviewRouteState(searchParams);
  const searchScope = routeState.scope;
  const supplierFilter = supplierFilterValueForQuery(routeState.supplier);
  const filter = routeState.filter as OverviewTaskFilter;
  const activeFilter: OverviewTaskFilter = showOverviewTaskTabs ? filter : 'all';
  const selectedTaskId = routeState.taskId;
  const filterOptions = buildFilterOptions(language);
  const todayFilterRows = buildTodayFilterRows(language);

  function updateRouteState(nextState: Parameters<typeof buildOverviewSearchParams>[1], replace = false) {
    setSearchParams(buildOverviewSearchParams(searchParams, nextState), { replace });
  }

  function openSingleTask(task: Pick<OverviewSkuTask, 'id' | 'defaultDrawerMode'>) {
    updateRouteState({ taskId: task.id, taskMode: task.defaultDrawerMode });
  }

  function openBatchTaskGroup(group: TaskGroup, laneId: RecordUpdateLaneId) {
    const firstTask = group.tasks[0] ?? null;
    const batchHref = buildBatchUpdateHref(
      group.action === 'log_order'
        ? { skuIds: group.tasks.map((t) => t.skuId), laneId }
        : {
            batchOrderId: firstTask?.batchOrderId ?? null,
            childOrderId: firstTask?.childOrderId ?? null,
            skuIds: group.tasks.map((t) => t.skuId),
            laneId,
          },
    );
    window.location.href = batchHref;
  }

  async function persistRememberedBatchChoice(
    preferenceKey: keyof DesktopTaskBatchUpdatePreferences,
    nextValue: DesktopTaskBatchUpdatePreferences[keyof DesktopTaskBatchUpdatePreferences],
  ) {
    await savePreferences({
      taskBatchUpdatePreferences: {
        ...taskBatchUpdatePreferences,
        [preferenceKey]: nextValue,
      },
    });
  }

  function handleTaskActionClick(task: OverviewSkuTask) {
    const { action, supplierName } = task;
    const sameGroupTasks = visibleTasks.filter(
      (t): t is OverviewSkuTask =>
        isOverviewSkuTask(t) &&
        t.action === action &&
        (action === 'log_order'
          ? t.supplierName === supplierName
          : task.batchOrderId != null
            ? t.batchOrderId === task.batchOrderId
            : t.id === task.id),
    );
    const group: TaskGroup = {
      action,
      supplierName,
      tasks: sameGroupTasks.map((t) => ({
        id: t.id,
        skuId: t.skuId,
        skuName: t.skuName,
        batchOrderId: t.batchOrderId,
        childOrderId: t.childOrderId,
      })),
    };
    if (group.tasks.length <= 1) {
      openSingleTask(task);
      return;
    }
    const laneId = getLaneForTaskAction(action as never);
    const preferenceKey = preferenceKeyForTaskAction(action);
    const taskBatchUpdatePreference = taskBatchUpdatePreferences[preferenceKey];
    if (taskBatchUpdatePreference === 'always_batch') {
      openBatchTaskGroup(group, laneId);
      return;
    }
    if (taskBatchUpdatePreference === 'always_alone') {
      openSingleTask(task);
      return;
    }
    setRememberBatchChoice(false);
    setSelectedTaskGroup({
      group,
      laneId,
      preferenceKey,
      selectedTask: {
        id: task.id,
        defaultDrawerMode: task.defaultDrawerMode,
      },
    });
  }

  useEffect(() => {
    const skuIds = inventory.workspaceSummary?.skuSummaries.map((summary) => summary.skuId) ?? [];
    if (skuIds.length === 0) {
      setDetailBySkuId({});
      setIsHydratingDetails(false);
      return;
    }

    let active = true;
    setIsHydratingDetails(true);

    void Promise.all(
      skuIds.map(async (skuId) => {
        try {
          return [skuId, normalizeSkuDetailPage(await inventory.loadSenaSkuDetail(skuId))?.detail ?? null] as const;
        } catch {
          return [skuId, null] as const;
        }
      }),
    ).then((entries) => {
      if (!active) {
        return;
      }
      setDetailBySkuId(Object.fromEntries(entries));
      setIsHydratingDetails(false);
    });

    return () => {
      active = false;
    };
  }, [inventory, inventory.workspaceSummary?.runId]);

  const model = buildOverviewModel({
    catalog: inventory.catalog,
    detailBySkuId,
    forceStaleUpdateReminder: import.meta.env.MODE === 'development',
    language,
    observations: inventory.observations,
    orderBatches: inventory.orderBatches,
    staleUpdateReminderSnoozeUntil: overviewStaleUpdateReminderSnoozeUntil,
    workspaceSummary: inventory.workspaceSummary,
  });

  const scopedTasks = model.tasks.filter(
    (task) =>
      isOverviewSkuTask(task)
        ? matchesOverviewEntityScope(task, searchScope) && matchesOverviewQuery(task, deferredQuery, searchScope) && matchesOverviewSupplier(task, supplierFilter)
        : searchScope === 'all' && matchesOverviewQuery(task, deferredQuery, searchScope),
  );
  const visibleTasks = scopedTasks.filter((task) => shouldShowTask(task, activeFilter));
  const selectedTask = scopedTasks.find(
    (task): task is OverviewSkuTask => task.id === selectedTaskId && isOverviewSkuTask(task),
  ) ?? null;

  useEffect(() => {
    if (selectedTaskId && !selectedTask) {
      updateRouteState({ taskId: null, taskMode: null }, true);
    }
  }, [selectedTask, selectedTaskId]);

  if (!inventory.catalog) {
    return (
      <WorkspacePage>
        <WorkspaceEmpty
          title={translateUiLiteral(language, 'Overview needs the catalog first')}
          hint={translateUiLiteral(language, 'Create the first SKU so Banji can build an action list from real stock work.')}
          action={<CreateFirstSkuButton />}
        />
      </WorkspacePage>
    );
  }

  if (!inventory.workspaceSummary) {
    return (
      <WorkspacePage>
        <WorkspaceEmpty
          title={translateUiLiteral(language, 'Overview needs your first update')}
          hint={translateUiLiteral(language, 'Capture a live observation so Banji can build the order, receipt, and follow-up queue.')}
          action={
            <WorkspaceActionRow>
              <Button asChild className={overviewStartUpdateButtonClassName}>
                <Link to="/record-update">
                  <NavigationTaskListIcon data-icon="inline-start" />
                  {translateUiLiteral(language, 'Start update')}
                </Link>
              </Button>
              <Button asChild variant="outline">
                <Link to="/catalog">
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
    <WorkspacePage className="gap-5">
      <WorkspaceTitleCard
        eyebrow={translateUiLiteral(language, 'Overview')}
        title={translateUiLiteral(language, 'Mission Control')}
        descriptor={translateUiLiteral(language, 'See what needs attention next, what is already in motion, and when Banji will check back.')}
        actions={
          <WorkspaceActionRow>
            <Button asChild className={overviewStartUpdateButtonClassName}>
              <Link to="/record-update">
                <NavigationTaskListIcon className="size-4" />
                {translateUiLiteral(language, 'Start update')}
              </Link>
            </Button>
          </WorkspaceActionRow>
        }
      >
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-start lg:gap-4">
          <div className="w-full max-w-xl">
            <SearchInput
              ariaLabel={translateUiLiteral(language, 'Search overview')}
              placeholder={t('searchPlaceholder')}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>
          <ToggleGroup
            aria-label={t('searchItems')}
            className="inline-flex max-w-full justify-start overflow-x-auto rounded-2xl"
            spacing={1}
            type="single"
            value={searchScope}
            onValueChange={(nextValue) => {
              if (nextValue) {
                updateRouteState({ scope: nextValue as OverviewSearchScope });
              }
            }}
          >
            <ToggleGroupItem value="all">
              <EntityLayersIcon data-icon="inline-start" />
              {translateUiLiteral(language, 'All')}
            </ToggleGroupItem>
            <ToggleGroupItem value="skus">
              <EntitySkuIcon data-icon="inline-start" />
              {t('filterSku')}
            </ToggleGroupItem>
            <ToggleGroupItem value="services">
              <EntityServiceIcon data-icon="inline-start" />
              {t('filterService')}
            </ToggleGroupItem>
          </ToggleGroup>
          <SupplierFilter
            catalog={inventory.catalog}
            className="h-12 w-full rounded-full px-4 data-[size=default]:h-12 sm:w-auto"
            value={supplierFilter}
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

      <ChromeTabs
        className="relative gap-0"
        value={activeFilter}
        onValueChange={(nextValue) => updateRouteState({ filter: nextValue as OverviewTaskFilter })}
      >
        {showOverviewTaskTabs ? (
          <div className={`relative flex overflow-hidden px-5 sm:px-6 ${showRightRailCards ? 'lg:pr-[calc(320px+1.5rem)]' : ''}`}>
            <ChromeTabsList aria-label={translateUiLiteral(language, 'Filter overview tasks')} className="min-w-0" collapseBehavior="progressive">
              {filterOptions.map((option) => {
                const FilterTabIcon = overviewTaskFilterIcons[option.value];
                return (
                  <ChromeTabsTrigger
                    key={option.value}
                    leading={<FilterTabIcon className="size-4" />}
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
          style={{
            marginTop: showOverviewTaskTabs ? 'calc(var(--chrome-tabs-surface-overlap) * -2.75)' : undefined,
          }}
        >
          <div className={showRightRailCards ? 'grid gap-0 lg:grid-cols-[minmax(0,1fr)_320px]' : 'grid gap-0'}>
          <div className="min-w-0 border-b border-border/60 lg:border-r lg:border-b-0">
            <div className="border-b border-border/60 px-5 py-5 sm:px-6">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <h2 className="text-xl font-semibold tracking-[-0.03em] text-foreground">
                    {translateUiLiteral(language, 'Task queue')}
                  </h2>
                  <p className="text-sm text-muted-foreground">
                    {translateUiLiteral(language, "The task list built from Banji's orders, deliveries, and arrival timing.")}
                  </p>
                </div>
                <p className="text-sm text-muted-foreground">
                  {translateUiLiteral(language, '{count} visible', { count: visibleTasks.length })}
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
                  <HeaderedTableBody className={overviewQueueTableLayout.bodyClassName}>
                    {visibleTasks.map((task) => {
                      const TaskActionIcon = overviewTaskActionIcons[task.action];

                      return (
                        <HeaderedTableRow
                          key={task.id}
                          className={`${rowHoverClassName} ${overviewQueueTableLayout.rowClassName}`}
                          data-slot="overview-task-row"
                        >
                          <div className="min-w-0">
                            {isOverviewSkuTask(task) ? (
                              <button
                                className="group min-w-0 text-left"
                                type="button"
                                onClick={() => updateRouteState({ taskId: task.id, taskMode: task.defaultDrawerMode })}
                              >
                                <ItemIdentityBlock
                                  align="center"
                                  description={showExplanatoryTooltips ? task.serviceImpact : undefined}
                                  imagePath={task.imagePath}
                                  metadata={
                                    <>
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
                              </button>
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
                                className="w-[136px] justify-center"
                                size="sm"
                                type="button"
                                variant={task.action === 'log_order' || task.action === 'receive' ? 'default' : 'outline'}
                                onClick={() => handleTaskActionClick(task)}
                              >
                                {TaskActionIcon ? <TaskActionIcon className="size-4" /> : null}
                                {task.actionLabel}
                              </Button>
                            ) : (
                              <Button asChild className="w-[136px] justify-center" size="sm">
                                <Link to="/record-update">
                                  {TaskActionIcon ? <TaskActionIcon className="size-4" /> : null}
                                  {task.actionLabel}
                                </Link>
                              </Button>
                            )}
                          </div>
                        </HeaderedTableRow>
                      );
                    })}
                  </HeaderedTableBody>
                </div>
              </HeaderedTable>
            ) : (
              <div className="grid place-items-center px-5 py-16 sm:px-6">
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
                      : translateUiLiteral(language, 'Banji is not seeing an immediate reorder, receipt, or follow-up action. Keep logs moving or capture the next live signal.')}
                  </p>
                </div>
              </div>
            )}
          </div>

          {showRightRailCards ? (
          <aside className="flex h-full flex-col bg-secondary/15">
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
                      className={`flex w-full items-center justify-between rounded-[1rem] px-3 py-3 text-left text-sm transition-colors ${rowHoverClassName}`}
                      type="button"
                      onClick={() => updateRouteState({ filter: row.filter })}
                    >
                      <span className="text-muted-foreground">{row.label}</span>
                      <span className="font-semibold text-foreground">{model.todayCounts[row.countKey]}</span>
                    </button>
                  );
                })}
              </div>
            </section>

            <section className={railBlockClassName()}>
              <div className="mb-4 flex items-center gap-2">
                <EntityTransitIcon className="size-4 text-primary" />
                <h2 className="text-lg font-semibold tracking-[-0.02em] text-foreground">
                  {translateUiLiteral(language, 'In transit')}
                </h2>
              </div>
              <div className="divide-y divide-border/50">
                {model.inTransit.length > 0 ? (
                  model.inTransit.map((row) => (
                    <button
                      key={row.id}
                      className={`flex w-full items-center justify-between rounded-[1rem] px-3 py-3 text-left transition-colors ${rowHoverClassName}`}
                      data-slot="overview-rail-row"
                      type="button"
                      onClick={() => updateRouteState({ taskId: row.id })}
                    >
                      <span className="min-w-0 pr-3 text-sm font-medium text-foreground">{row.name}</span>
                      <span className="shrink-0 text-sm text-muted-foreground">{row.etaLabel}</span>
                    </button>
                  ))
                ) : (
                  <p className="py-3 text-sm text-muted-foreground">
                    {translateUiLiteral(language, 'No active receipt windows are open right now.')}
                  </p>
                )}
              </div>
            </section>

            <section className={railBlockClassName()}>
              <div className="mb-4 flex items-center gap-2">
                <EntityReceiptDocumentIcon className="size-4 text-primary" />
                <h2 className="text-lg font-semibold tracking-[-0.02em] text-foreground">
                  {translateUiLiteral(language, 'Recent receipts')}
                </h2>
              </div>
              <div className="divide-y divide-border/50">
                {model.recentReceipts.length > 0 ? (
                  model.recentReceipts.map((row) => (
                    <button
                      key={row.id}
                      className={`flex w-full items-center justify-between rounded-[1rem] px-3 py-3 text-left transition-colors ${rowHoverClassName}`}
                      data-slot="overview-rail-row"
                      type="button"
                      onClick={() => updateRouteState({ taskId: row.skuId, taskMode: 'goods_received' })}
                    >
                      <div className="min-w-0 pr-3">
                        <p className="truncate text-sm font-medium text-foreground">
                          {row.quantityLabel} {row.name}
                        </p>
                      </div>
                      <span className="shrink-0 text-sm text-muted-foreground">{row.receivedLabel}</span>
                    </button>
                  ))
                ) : (
                  <p className="py-3 text-sm text-muted-foreground">
                    {translateUiLiteral(language, 'Confirmed receipts will appear here as inventory closes the loop.')}
                  </p>
                )}
              </div>
            </section>

            <section className={`${railBlockClassName()} border-b border-border/60`}>
              <div className="mb-4 flex items-center gap-2">
                <EntitySignalIcon className="size-4 text-primary" />
                <h2 className="text-lg font-semibold tracking-[-0.02em] text-foreground">
                  {translateUiLiteral(language, 'Business signals')}
                </h2>
              </div>
              <div className="divide-y divide-border/50">
                {model.signals.length > 0 ? (
                  model.signals.map((signal) => (
                    <div
                      key={signal.id}
                      className="py-3 text-sm leading-6 text-foreground"
                    >
                      {signal.text}
                    </div>
                  ))
                ) : (
                  <p className="py-3 text-sm text-muted-foreground">
                    {translateUiLiteral(language, 'Sales-pattern and price changes will appear here once Banji has enough activity to explain them.')}
                  </p>
                )}
              </div>
            </section>

            <section className="mt-auto flex justify-center px-5 py-5">
              <Button asChild variant="outline">
                <Link to="/operations">
                  <ActionOpenExternalIcon className="size-4" />
                  {translateUiLiteral(language, 'Open logs')}
                </Link>
              </Button>
            </section>
          </aside>
          ) : null}
        </div>
        </section>
      </ChromeTabs>

      <OverviewTaskDrawer
        mode={routeState.taskMode ?? selectedTask?.defaultDrawerMode ?? null}
        open={selectedTask != null}
        task={selectedTask}
        onModeChange={(nextMode) => updateRouteState({ taskMode: nextMode }, true)}
        onOpenChange={(open) => {
          if (!open) {
            updateRouteState({ taskId: null, taskMode: null }, true);
          }
        }}
      />

      <BatchActionPrompt
        open={selectedTaskGroup != null}
        rememberChoice={rememberBatchChoice}
        taskGroup={selectedTaskGroup?.group ?? { action: '', supplierName: null, tasks: [] }}
        onBatchUpdate={() => {
          if (!selectedTaskGroup) {
            return;
          }
          const run = async () => {
            if (rememberBatchChoice) {
              await persistRememberedBatchChoice(selectedTaskGroup.preferenceKey, 'always_batch');
            }
            openBatchTaskGroup(selectedTaskGroup.group, selectedTaskGroup.laneId);
          };
          void run();
          setSelectedTaskGroup(null);
          setRememberBatchChoice(false);
        }}
        onClose={() => {
          setSelectedTaskGroup(null);
          setRememberBatchChoice(false);
        }}
        onRememberChoiceChange={setRememberBatchChoice}
        onUpdateIndividually={() => {
          if (!selectedTaskGroup) {
            return;
          }
          const run = async () => {
            if (rememberBatchChoice) {
              await persistRememberedBatchChoice(selectedTaskGroup.preferenceKey, 'always_alone');
            }
            openSingleTask(selectedTaskGroup.selectedTask);
          };
          void run();
          setSelectedTaskGroup(null);
          setRememberBatchChoice(false);
        }}
      />
    </WorkspacePage>
  );
}
