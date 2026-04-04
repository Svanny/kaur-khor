import { useDeferredValue, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { SenaSkuDetail } from '@shared/sena';
import {
  ArrowUpRight,
  ClipboardList,
  Layers3,
  Package,
  ReceiptText,
  Radio,
  SearchSlash,
  Store,
  Truck,
} from 'lucide-react';
import {
  WorkspaceActionRow,
  WorkspaceEmpty,
  WorkspacePage,
  WorkspaceTitleCard,
} from '@/components/system/workspace';
import { SearchInput } from '@/components/system/search-input';
import { Button } from '@/components/ui/button';
import { cardFrameClassName, cardSurfaceClassName } from '@/components/ui/card';
import { ChromeTabs, ChromeTabsList, ChromeTabsTrigger } from '@/components/ui/chrome-tabs';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { overviewTaskActionIconMap, overviewTaskFilterIconMap } from '@/lib/icon-mappings';
import { rowHoverClassName } from '@/lib/interactive-surface';
import { statusPillClassName } from '@/lib/status-pill';
import { useInventory } from '@/state/inventory';
import { usePreferences } from '@/state/preferences';
import { OverviewTaskDrawer } from './overview/task-drawer';
import {
  buildOverviewModel,
  shouldShowTask,
  type OverviewTask,
  type OverviewTaskFilter,
} from './overview/view-model';

const FILTER_OPTIONS: Array<{ value: OverviewTaskFilter; label: string }> = [
  { value: 'all', label: 'All Tasks' },
  { value: 'to_order', label: 'To order' },
  { value: 'awaiting_receipt', label: 'Awaiting receipt' },
  { value: 'follow_up_today', label: 'Follow up today' },
  { value: 'ready_to_receive', label: 'Ready to receive' },
  { value: 'received_today', label: 'Received today' },
];

const TODAY_FILTER_ROWS: Array<{
  countKey: 'toOrder' | 'followUpToday' | 'readyToReceive';
  filter: OverviewTaskFilter;
  label: string;
}> = [
  { countKey: 'toOrder', filter: 'to_order', label: 'To order' },
  { countKey: 'followUpToday', filter: 'follow_up_today', label: 'Follow up today' },
  { countKey: 'readyToReceive', filter: 'ready_to_receive', label: 'Ready to receive' },
];

type OverviewSearchScope = 'all' | 'skus' | 'services';

function boardClassName() {
  return `${cardFrameClassName} ${cardSurfaceClassName} overflow-hidden rounded-[2rem]`;
}

function railBlockClassName() {
  return 'border-t border-border/60 px-5 py-5 first:border-t-0';
}

function matchesOverviewEntityScope(task: OverviewTask, scope: OverviewSearchScope) {
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

  const parts =
    scope === 'skus'
      ? [task.skuId, task.skuName, task.whyNow, task.whyDetail, task.etaLabel, task.stateLabel]
      : scope === 'services'
        ? [task.serviceImpact, ...task.linkedServiceNames, task.whyNow, task.whyDetail, task.etaLabel, task.stateLabel]
        : [
            task.skuId,
            task.skuName,
            task.serviceImpact,
            task.whyNow,
            task.whyDetail,
            task.etaLabel,
            task.stateLabel,
            ...task.linkedServiceNames,
          ];

  return parts.join(' ').toLowerCase().includes(normalized);
}

function QueueColumnHeading({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <p className={`text-[0.72rem] font-semibold uppercase tracking-[0.18em] text-muted-foreground ${className ?? ''}`}>
      {children}
    </p>
  );
}

export function DashboardRoute() {
  const inventory = useInventory();
  const { language, t } = usePreferences();
  const [query, setQuery] = useState('');
  const deferredQuery = useDeferredValue(query);
  const [searchScope, setSearchScope] = useState<OverviewSearchScope>('all');
  const [filter, setFilter] = useState<OverviewTaskFilter>('all');
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [detailBySkuId, setDetailBySkuId] = useState<Record<string, SenaSkuDetail | null>>({});
  const [isHydratingDetails, setIsHydratingDetails] = useState(false);

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
          return [skuId, await inventory.loadSenaSkuDetail(skuId)] as const;
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
    language,
    observations: inventory.observations,
    workspaceSummary: inventory.workspaceSummary,
  });

  const scopedTasks = model.tasks.filter(
    (task) => matchesOverviewEntityScope(task, searchScope) && matchesOverviewQuery(task, deferredQuery, searchScope),
  );
  const visibleTasks = scopedTasks.filter((task) => shouldShowTask(task, filter));
  const selectedTask = scopedTasks.find((task) => task.id === selectedTaskId) ?? null;

  useEffect(() => {
    if (selectedTaskId && !selectedTask) {
      setSelectedTaskId(null);
    }
  }, [selectedTask, selectedTaskId]);

  if (!inventory.catalog) {
    return (
      <WorkspacePage>
        <WorkspaceEmpty
          title="Overview needs the catalog first"
          description="Create the first SKU so Banji can turn SENA signals into a working task ledger."
          action={
            <Button asChild>
              <Link to="/catalog/skus/new">Create first SKU</Link>
            </Button>
          }
        />
      </WorkspacePage>
    );
  }

  if (!inventory.workspaceSummary) {
    return (
      <WorkspacePage>
        <WorkspaceEmpty
          title="Overview needs the first SENA run"
          description="Capture a live observation or log a SKU action so Banji can build the order, receipt, and follow-up queue."
          action={
            <WorkspaceActionRow>
              <Button asChild>
                <Link to="/operations/session">New observation</Link>
              </Button>
              <Button asChild variant="outline">
                <Link to="/catalog">Open catalog</Link>
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
        eyebrow="Overview"
        title="Mission Control"
        description="What needs attention next, what is already in motion, and when Banji will check back."
      >
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-start lg:gap-4">
          <div className="w-full max-w-xl">
            <SearchInput
              ariaLabel="Search overview"
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
                setSearchScope(nextValue as OverviewSearchScope);
              }
            }}
          >
            <ToggleGroupItem value="all">
              <Layers3 data-icon="inline-start" />
              All
            </ToggleGroupItem>
            <ToggleGroupItem value="skus">
              <Package data-icon="inline-start" />
              {t('filterSku')}
            </ToggleGroupItem>
            <ToggleGroupItem value="services">
              <Store data-icon="inline-start" />
              {t('filterService')}
            </ToggleGroupItem>
          </ToggleGroup>
        </div>
      </WorkspaceTitleCard>

      <ChromeTabs
        className="relative gap-0"
        value={filter}
        onValueChange={(nextValue) => setFilter(nextValue as OverviewTaskFilter)}
      >
        <div className="relative flex overflow-x-auto px-5 sm:px-6">
          <ChromeTabsList aria-label="Filter overview tasks" className="min-w-max">
            {FILTER_OPTIONS.map((option) => {
              const FilterTabIcon = overviewTaskFilterIconMap[option.value];
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

        <section
          className={`relative z-[1] ${boardClassName()}`}
          style={{ 
            marginTop: 'calc(var(--chrome-tabs-surface-overlap) * -2.75)', 
            marginLeft: '-10px',
          }}
        >
          <div className="grid lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="min-w-0 border-b border-border/60 lg:border-r lg:border-b-0">
            <div className="border-b border-border/60 px-5 py-5 sm:px-6">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <h2 className="text-xl font-semibold tracking-[-0.03em] text-foreground">Task queue</h2>
                  <p className="text-sm text-muted-foreground">
                    The human task ledger on top of SENA&apos;s order, receipt, and lead-time loop.
                  </p>
                </div>
                <p className="text-sm text-muted-foreground">
                  {visibleTasks.length} visible
                  {isHydratingDetails ? ' · refining receipt windows…' : null}
                </p>
              </div>
            </div>

            <div className="hidden border-b border-border/60 px-5 py-3 text-left lg:grid lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)] lg:gap-5">
              <QueueColumnHeading>Item / impact</QueueColumnHeading>
              <QueueColumnHeading>Why now</QueueColumnHeading>
              <QueueColumnHeading>ETA / window</QueueColumnHeading>
              <QueueColumnHeading className="text-center">Action</QueueColumnHeading>
            </div>

            {visibleTasks.length > 0 ? (
              <div className="divide-y divide-border/60">
                {visibleTasks.map((task) => {
                  const TaskActionIcon = overviewTaskActionIconMap[task.action];

                  return (
                    <div
                      key={task.id}
                      className={`grid gap-4 px-5 py-5 transition-colors ${rowHoverClassName} sm:px-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)] lg:gap-5`}
                      data-slot="overview-task-row"
                    >
                    <div className="min-w-0">
                      <button
                        className="group min-w-0 text-left"
                        type="button"
                        onClick={() => setSelectedTaskId(task.id)}
                      >
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-base font-semibold text-foreground transition-colors group-hover:text-primary">
                            {task.skuName}
                          </span>
                          <span
                            className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[0.72rem] font-medium ${statusPillClassName(task.statusTone)}`}
                          >
                            {task.stateLabel}
                          </span>
                        </div>
                        <p className="mt-1 text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground/75">
                          {task.skuId}
                        </p>
                        <p className="mt-2 text-sm leading-6 text-muted-foreground">{task.serviceImpact}</p>
                      </button>
                    </div>

                    <div className="min-w-0">
                      <QueueColumnHeading className="mb-1 lg:hidden">Why now</QueueColumnHeading>
                      <p className="font-medium text-foreground">{task.whyNow}</p>
                      <p className="mt-1 text-sm leading-6 text-muted-foreground">{task.whyDetail}</p>
                    </div>

                    <div className="min-w-0">
                      <QueueColumnHeading className="mb-1 lg:hidden">ETA / window</QueueColumnHeading>
                      <p className="font-medium text-foreground">{task.etaLabel}</p>
                      <p className="mt-1 text-sm leading-6 text-muted-foreground">
                        {task.confidenceCue} · {task.etaDetail}
                      </p>
                    </div>

                      <div className="flex items-start lg:justify-center">
                        <Button
                          className="w-[136px] justify-center"
                          size="sm"
                          type="button"
                          variant={task.action === 'log_order' || task.action === 'receive' ? 'default' : 'outline'}
                          onClick={() => setSelectedTaskId(task.id)}
                        >
                          {TaskActionIcon ? <TaskActionIcon className="size-4" /> : null}
                          {task.actionLabel}
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="grid place-items-center px-5 py-16 sm:px-6">
                <div className="max-w-md text-center">
                  <SearchSlash className="mx-auto size-9 text-muted-foreground/70" />
                  <h3 className="mt-4 text-lg font-semibold tracking-[-0.02em] text-foreground">
                    {query || filter !== 'all' ? 'No tasks match this view' : 'No urgent tasks are crowding the queue'}
                  </h3>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">
                    {query || filter !== 'all'
                      ? 'Try a broader query or switch filters to bring more of the task ledger back into view.'
                      : 'Banji is not seeing an immediate reorder, receipt, or follow-up action. Keep operations moving or capture the next live signal.'}
                  </p>
                </div>
              </div>
            )}
          </div>

          <aside className="flex h-full flex-col bg-secondary/15">
            <section className={railBlockClassName()}>
              <div className="mb-4 flex items-center gap-2">
                <ClipboardList className="size-4 text-primary" />
                <h2 className="text-lg font-semibold tracking-[-0.02em] text-foreground">Today</h2>
              </div>
              <div className="divide-y divide-border/50">
                {TODAY_FILTER_ROWS.map((row) => {
                  return (
                    <button
                      key={row.filter}
                      aria-pressed={filter === row.filter}
                      className={`flex w-full items-center justify-between rounded-[1rem] px-3 py-3 text-left text-sm transition-colors ${rowHoverClassName}`}
                      type="button"
                      onClick={() => setFilter(row.filter)}
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
                <Truck className="size-4 text-primary" />
                <h2 className="text-lg font-semibold tracking-[-0.02em] text-foreground">In transit</h2>
              </div>
              <div className="divide-y divide-border/50">
                {model.inTransit.length > 0 ? (
                  model.inTransit.map((row) => (
                    <button
                      key={row.id}
                      className={`flex w-full items-center justify-between rounded-[1rem] px-3 py-3 text-left transition-colors ${rowHoverClassName}`}
                      data-slot="overview-rail-row"
                      type="button"
                      onClick={() => setSelectedTaskId(row.id)}
                    >
                      <span className="min-w-0 pr-3 text-sm font-medium text-foreground">{row.name}</span>
                      <span className="shrink-0 text-sm text-muted-foreground">{row.etaLabel}</span>
                    </button>
                  ))
                ) : (
                  <p className="py-3 text-sm text-muted-foreground">
                    No active receipt windows are open right now.
                  </p>
                )}
              </div>
            </section>

            <section className={railBlockClassName()}>
              <div className="mb-4 flex items-center gap-2">
                <ReceiptText className="size-4 text-primary" />
                <h2 className="text-lg font-semibold tracking-[-0.02em] text-foreground">Recent receipts</h2>
              </div>
              <div className="divide-y divide-border/50">
                {model.recentReceipts.length > 0 ? (
                  model.recentReceipts.map((row) => (
                    <button
                      key={row.id}
                      className={`flex w-full items-center justify-between rounded-[1rem] px-3 py-3 text-left transition-colors ${rowHoverClassName}`}
                      data-slot="overview-rail-row"
                      type="button"
                      onClick={() => setSelectedTaskId(row.skuId)}
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-foreground">
                          {row.quantityLabel} {row.name}
                        </p>
                      </div>
                      <span className="shrink-0 text-sm text-muted-foreground">{row.receivedLabel}</span>
                    </button>
                  ))
                ) : (
                  <p className="py-3 text-sm text-muted-foreground">
                    Confirmed receipts will appear here as inventory closes the loop.
                  </p>
                )}
              </div>
            </section>

            <section className={`${railBlockClassName()} border-b border-border/60`}>
              <div className="mb-4 flex items-center gap-2">
                <Radio className="size-4 text-primary" />
                <h2 className="text-lg font-semibold tracking-[-0.02em] text-foreground">SENA signals</h2>
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
                    Regime and price shifts will surface here once SENA sees enough motion to narrate them.
                  </p>
                )}
              </div>
            </section>

            <section className="mt-auto flex justify-center px-5 py-5">
              <Button asChild variant="outline">
                <Link to="/operations">
                  <ArrowUpRight className="size-4" />
                  Open operations
                </Link>
              </Button>
            </section>
          </aside>
        </div>
        </section>
      </ChromeTabs>

      <OverviewTaskDrawer
        open={selectedTask != null}
        task={selectedTask}
        onOpenChange={(open) => setSelectedTaskId(open ? selectedTaskId : null)}
      />
    </WorkspacePage>
  );
}
