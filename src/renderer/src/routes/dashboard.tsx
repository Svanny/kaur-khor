import { useDeferredValue, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowDown, ArrowUp, BrainCircuit, ClipboardPen, PackagePlus, Play, Search } from 'lucide-react';
import type { InventorySnapshot, SkuRecord, StockReport } from '@shared/inventory';
import { NewServiceIcon } from '@/components/system/new-service-icon';
import { WorkspacePage, WorkspacePageTitle, WorkspacePanel } from '@/components/system/workspace';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  InputGroupText,
} from '@/components/ui/input-group';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { linkedServicesForSku, sortByName } from '@/lib/catalog';
import { formatNumber, localeFor } from '@/lib/format';
import { summarizeNotes } from '@/lib/stock-report-summary';
import { cn } from '@/lib/utils';
import { traceRenderer } from '@/lib/trace';
import { useInventory } from '@/state/inventory';
import { useOperationsSession } from '@/state/operations-session';
import { usePreferences } from '@/state/preferences';

type OverviewQueueStatus = 'low-stock' | 'out-of-stock' | 'not-updated' | 'needs-check';
type OverviewQueueFilter = 'all' | 'need-update' | 'low-stock' | 'out' | 'updated-today';
type OverviewSortColumn = 'status' | 'item' | 'stock' | 'last-updated';
type OverviewSortDirection = 'asc' | 'desc';
type OverviewSortMode = {
  column: OverviewSortColumn;
  direction: OverviewSortDirection;
};
type OverviewActionKind = 'update' | 'review';

type OverviewQueueRow = {
  sku: SkuRecord;
  linkedServiceNames: string[];
  linkedServiceCount: number;
  stockDisplay: string;
  status: OverviewQueueStatus | null;
  lastUpdated: string;
  lastUpdatedAt: string | null;
  lastReportId: string | null;
  actionKind: OverviewActionKind;
  matchesUpdatedToday: boolean;
};

type RecentChangeRow = {
  key: string;
  itemName: string;
  href: string;
  reportHref: string;
  detail: string;
  timestamp: string;
  reportedAt: string;
};

type InsightRow = {
  key: string;
  body: string;
};

const copy = {
  title: 'Overview',
  loadingTitle: 'Overview',
  loadingBody: 'Loading the current queue…',
  searchLabel: 'Search queue',
  searchPlaceholder: 'Search item, SKU, or service',
  startUpdate: 'Start new update',
  resumeDraft: 'Resume draft',
  filtersLabel: 'Today filters',
  filters: {
    all: 'All',
    needUpdate: 'Need update',
    lowStock: 'Low stock',
    out: 'Out',
    updatedToday: 'Updated today',
  },
  worklistTitle: 'SKU worklist',
  worklistBody: 'Work through the queue from stock corrections first, then review-only checks.',
  recentChangesTitle: 'Recent changes',
  insightsTitle: 'Insights',
  openAnalysis: 'Open analysis',
  noQueueRows: 'No items are waiting in the queue.',
  noUpdatedToday: 'No items were updated today.',
  recentChangesLoading: 'Loading recent changes…',
  recentChangesFallback: 'Recent changes are unavailable right now.',
  recentChangesEmpty: 'No notable changes have been captured yet.',
  insightsFallback: 'Insight history is limited right now.',
  status: {
    lowStock: 'Low stock',
    outOfStock: 'Out of stock',
    notUpdated: 'Not updated',
    needsCheck: 'Needs check',
    updatedToday: 'Updated today',
  },
  actions: {
    update: 'Update',
    review: 'Review',
  },
  table: {
    item: 'Item',
    stock: 'Stock',
    status: 'Status',
    lastUpdate: 'Last update',
    action: 'Action',
  },
} as const;

function reportDateLabel(reportedAt: string, language: 'en' | 'km') {
  return new Intl.DateTimeFormat(localeFor(language), {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(reportedAt));
}

function timeLabel(reportedAt: string, language: 'en' | 'km') {
  return new Intl.DateTimeFormat(localeFor(language), {
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(reportedAt));
}

function latestRelevantSkuReport(reports: StockReport[], skuId: string) {
  return reports.find((report) => report.skuObservations.some((entry) => entry.skuId === skuId)) ?? null;
}

function latestRelevantServiceReport(reports: StockReport[], serviceId: string) {
  return (
    reports.find(
      (report) =>
        report.serviceSignals.some((entry) => entry.serviceId === serviceId) ||
        report.servicePriceAdjustments.some((entry) => entry.serviceId === serviceId),
    ) ?? null
  );
}

function lightweightLowStock(snapshot: InventorySnapshot, sku: SkuRecord) {
  const insight = snapshot.sist.skuInsights.find((entry) => entry.skuId === sku.skuId) ?? null;
  if (!insight) {
    return sku.unitsInStock <= 2;
  }

  return (
    sku.unitsInStock > 0 &&
    (insight.latestPosteriorUnits <= insight.reorderPoint ||
      insight.reorderTriggerProbability >= 0.5 ||
      (insight.daysOfCover != null && insight.daysOfCover <= 5))
  );
}

function latestRelevantLabel(report: StockReport | null, language: 'en' | 'km') {
  return report ? reportDateLabel(report.reportedAt, language) : '—';
}

function startOfLocalDay(value: string | Date) {
  const date = new Date(value);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function isSameLocalDay(left: string, right: string) {
  return startOfLocalDay(left).getTime() === startOfLocalDay(right).getTime();
}

function dayDistance(referenceAt: string, candidateAt: string) {
  return Math.floor(
    (startOfLocalDay(referenceAt).getTime() - startOfLocalDay(candidateAt).getTime()) / 86_400_000,
  );
}

function overviewStatusLabel(status: OverviewQueueStatus | null) {
  if (status === 'low-stock') {
    return copy.status.lowStock;
  }
  if (status === 'out-of-stock') {
    return copy.status.outOfStock;
  }
  if (status === 'not-updated') {
    return copy.status.notUpdated;
  }
  if (status === 'needs-check') {
    return copy.status.needsCheck;
  }
  return copy.status.updatedToday;
}

function queueBadgeVariant(status: OverviewQueueStatus | null) {
  return status === 'out-of-stock' ? 'destructive' : 'outline';
}

function queueBadgeClassName(status: OverviewQueueStatus | null) {
  if (status === 'out-of-stock') {
    return 'border-red-200 bg-red-50 text-red-700 hover:border-red-300 hover:text-red-800';
  }
  if (status === 'low-stock') {
    return 'border-amber-200 bg-amber-50 text-amber-800 hover:border-amber-300 hover:text-amber-900';
  }
  if (status === 'needs-check') {
    return 'border-sky-200 bg-sky-50 text-sky-700 hover:border-sky-300 hover:text-sky-800';
  }
  if (status === 'not-updated') {
    return 'border-stone-200 bg-stone-100 text-stone-700 hover:border-stone-300 hover:text-stone-800';
  }
  return 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:border-emerald-300 hover:text-emerald-800';
}

function queueActionHref(row: OverviewQueueRow) {
  if (row.actionKind === 'update') {
    return `/operations/session?step=observations&focusSku=${row.sku.skuId}`;
  }
  return `/catalog/skus/${row.sku.skuId}`;
}

function queueActionLabel(row: OverviewQueueRow) {
  return row.actionKind === 'update' ? copy.actions.update : copy.actions.review;
}

function urgencyRank(row: OverviewQueueRow) {
  if (row.status === 'out-of-stock') {
    return 0;
  }
  if (row.status === 'low-stock') {
    return 1;
  }
  if (row.status === 'needs-check') {
    return 2;
  }
  if (row.status === 'not-updated') {
    return 3;
  }
  if (row.matchesUpdatedToday) {
    return 4;
  }
  return 5;
}

function buildQueueRows(
  snapshot: InventorySnapshot,
  reports: StockReport[],
  referenceAt: string,
  language: 'en' | 'km',
) {
  return sortByName(snapshot.skus).flatMap((sku): OverviewQueueRow[] => {
    const linkedServiceNames = linkedServicesForSku(sku.skuId, snapshot).map((service) => service.name);
    const latestReport = latestRelevantSkuReport(reports, sku.skuId);
    const latestReportAt = latestReport?.reportedAt ?? null;
    const skuInsight = snapshot.sist.skuInsights.find((entry) => entry.skuId === sku.skuId) ?? null;
    const status: OverviewQueueStatus | null =
      sku.unitsInStock <= 0
        ? 'out-of-stock'
        : lightweightLowStock(snapshot, sku)
          ? 'low-stock'
          : latestReportAt == null || dayDistance(referenceAt, latestReportAt) > 7
            ? 'not-updated'
            : skuInsight?.confidence === 'low' ||
                (linkedServiceNames.length > 0 && (skuInsight?.stockoutRisk ?? 0) >= 0.3)
              ? 'needs-check'
              : null;
    const matchesUpdatedToday = latestReportAt != null && isSameLocalDay(referenceAt, latestReportAt);

    if (status == null && !matchesUpdatedToday) {
      return [];
    }

    return [
      {
        sku,
        linkedServiceNames,
        linkedServiceCount: linkedServiceNames.length,
        stockDisplay: formatNumber(sku.unitsInStock, language),
        status,
        lastUpdated: latestRelevantLabel(latestReport, language),
        lastUpdatedAt: latestReportAt,
        lastReportId: latestReport?.reportId ?? null,
        actionKind: status === 'out-of-stock' || status === 'low-stock' ? 'update' : 'review',
        matchesUpdatedToday,
      },
    ];
  });
}

function matchesQueueFilter(row: OverviewQueueRow, filter: OverviewQueueFilter) {
  if (filter === 'all') {
    return true;
  }
  if (filter === 'need-update') {
    return row.status != null;
  }
  if (filter === 'low-stock') {
    return row.status === 'low-stock';
  }
  if (filter === 'out') {
    return row.status === 'out-of-stock';
  }
  return row.matchesUpdatedToday;
}

function countForFilter(rows: OverviewQueueRow[], filter: OverviewQueueFilter) {
  return rows.filter((row) => matchesQueueFilter(row, filter)).length;
}

function matchesQueueSearch(row: OverviewQueueRow, query: string) {
  if (!query) {
    return true;
  }

  return (
    row.sku.name.toLowerCase().includes(query) ||
    row.sku.skuId.toLowerCase().includes(query) ||
    row.linkedServiceNames.some((name) => name.toLowerCase().includes(query))
  );
}

function compareQueueRows(left: OverviewQueueRow, right: OverviewQueueRow) {
  const urgencyDelta = urgencyRank(left) - urgencyRank(right);
  if (urgencyDelta !== 0) {
    return urgencyDelta;
  }

  const rightChangedAt = right.lastUpdatedAt ? new Date(right.lastUpdatedAt).getTime() : 0;
  const leftChangedAt = left.lastUpdatedAt ? new Date(left.lastUpdatedAt).getTime() : 0;
  if (rightChangedAt !== leftChangedAt) {
    return rightChangedAt - leftChangedAt;
  }

  if (right.linkedServiceCount !== left.linkedServiceCount) {
    return right.linkedServiceCount - left.linkedServiceCount;
  }

  return left.sku.name.localeCompare(right.sku.name);
}

function compareQueueRowsBySort(
  left: OverviewQueueRow,
  right: OverviewQueueRow,
  sortMode: OverviewSortMode,
) {
  if (sortMode.column === 'item') {
    return sortMode.direction === 'asc'
      ? left.sku.name.localeCompare(right.sku.name)
      : right.sku.name.localeCompare(left.sku.name);
  }

  if (sortMode.column === 'stock') {
    const delta = left.sku.unitsInStock - right.sku.unitsInStock;
    if (delta !== 0) {
      return sortMode.direction === 'asc' ? delta : -delta;
    }
    return compareQueueRows(left, right);
  }

  if (sortMode.column === 'last-updated') {
    const leftTime = left.lastUpdatedAt ? new Date(left.lastUpdatedAt).getTime() : 0;
    const rightTime = right.lastUpdatedAt ? new Date(right.lastUpdatedAt).getTime() : 0;
    const delta = leftTime - rightTime;
    if (delta !== 0) {
      return sortMode.direction === 'asc' ? delta : -delta;
    }
    return compareQueueRows(left, right);
  }

  const delta = urgencyRank(left) - urgencyRank(right);
  if (delta !== 0) {
    return sortMode.direction === 'asc' ? delta : -delta;
  }
  return compareQueueRows(left, right);
}

function buildRecentChanges(
  snapshot: InventorySnapshot,
  reports: StockReport[],
  language: 'en' | 'km',
) {
  const skuNames = new Map(snapshot.skus.map((sku) => [sku.skuId, sku.name]));
  const serviceNames = new Map(snapshot.services.map((service) => [service.serviceId, service.name]));

  const changes: RecentChangeRow[] = reports.flatMap((report) => {
    const skuChanges = report.skuObservations.map((entry) => {
      const previous = reports
        .slice(reports.indexOf(report) + 1)
        .find((candidate) => candidate.skuObservations.some((observation) => observation.skuId === entry.skuId))
        ?.skuObservations.find((observation) => observation.skuId === entry.skuId);

      return {
        key: `${report.reportId}-sku-${entry.skuId}`,
        itemName: skuNames.get(entry.skuId) ?? entry.skuId,
        href: `/catalog/skus/${entry.skuId}`,
        reportHref: `/operations?reportId=${encodeURIComponent(report.reportId)}&focusSku=${encodeURIComponent(entry.skuId)}`,
        detail: previous
          ? `${formatNumber(previous.unitsInStock, language)} -> ${formatNumber(entry.unitsInStock, language)}`
          : `Stock checked · ${formatNumber(entry.unitsInStock, language)}`,
        timestamp: timeLabel(report.reportedAt, language),
        reportedAt: report.reportedAt,
      };
    });

    const serviceSignals = report.serviceSignals
      .filter((entry) => entry.stockout !== false)
      .map((entry) => ({
        key: `${report.reportId}-signal-${entry.serviceId}`,
        itemName: serviceNames.get(entry.serviceId) ?? entry.serviceId,
        href: `/catalog/services/${entry.serviceId}`,
        reportHref: `/operations?reportId=${encodeURIComponent(report.reportId)}&focusService=${encodeURIComponent(entry.serviceId)}`,
        detail: 'Service flagged',
        timestamp: timeLabel(report.reportedAt, language),
        reportedAt: report.reportedAt,
      }));

    const priceChanges = report.servicePriceAdjustments.map((entry) => ({
      key: `${report.reportId}-price-${entry.serviceId}`,
      itemName: serviceNames.get(entry.serviceId) ?? entry.serviceId,
      href: `/catalog/services/${entry.serviceId}`,
      reportHref: `/operations?reportId=${encodeURIComponent(report.reportId)}&focusService=${encodeURIComponent(entry.serviceId)}`,
      detail: 'Price edited',
      timestamp: timeLabel(report.reportedAt, language),
      reportedAt: report.reportedAt,
    }));

    return [...skuChanges, ...serviceSignals, ...priceChanges];
  });

  return changes
    .sort((left, right) => new Date(right.reportedAt).getTime() - new Date(left.reportedAt).getTime())
    .slice(0, 3);
}

function buildInsights(
  snapshot: InventorySnapshot,
  reports: StockReport[],
) {
  const fragileServiceCount = snapshot.services.filter((service) => {
    const relatedReport = latestRelevantServiceReport(reports, service.serviceId);
    return service.skuIds.length === 0 || relatedReport != null;
  }).length;
  const latestRankShift = reports.some(
    (report) => report.topRetailRanking.length > 0 || report.topServiceRanking.length > 0,
  );

  return [
    {
      key: 'reorder-soon',
      body: `${snapshot.sist.pendingReorderCount} items need reorder soon`,
    },
    {
      key: 'fragile-services',
      body: `${fragileServiceCount} services flagged as fragile`,
    },
    {
      key: 'ranking-shift',
      body: latestRankShift ? 'Demand ranking shifted' : 'Demand ranking stayed steady',
    },
  ] satisfies InsightRow[];
}

function QueueTable({
  sortMode,
  onSortChange,
  rows,
}: {
  sortMode: OverviewSortMode;
  onSortChange: (column: OverviewSortColumn) => void;
  rows: OverviewQueueRow[];
}) {
  function skuDetailHref(skuId: string) {
    return `/catalog/skus/${skuId}`;
  }

  function reportHref(row: OverviewQueueRow) {
    if (!row.lastReportId) {
      return '/operations';
    }

    return `/operations?reportId=${encodeURIComponent(row.lastReportId)}&focusSku=${encodeURIComponent(row.sku.skuId)}`;
  }

  function SortHeader({
    column,
    label,
    align = 'left',
  }: {
    column: OverviewSortColumn;
    label: string;
    align?: 'left' | 'center';
  }) {
    const isActive = sortMode.column === column;
    const icon = sortMode.direction === 'asc' ? (
      <ArrowUp className="size-3.5" />
    ) : (
      <ArrowDown className="size-3.5" />
    );

    return (
      <button
        className={cn(
          'inline-flex items-center gap-1 text-left font-medium text-foreground transition-colors hover:text-foreground/80',
          align === 'center' && 'justify-center',
        )}
        type="button"
        onClick={() => onSortChange(column)}
      >
        <span>{label}</span>
        {isActive ? (
          <span aria-hidden="true" className="text-muted-foreground">
            {icon}
          </span>
        ) : null}
        {isActive ? (
          <span className="sr-only">{sortMode.direction === 'asc' ? 'sorted ascending' : 'sorted descending'}</span>
        ) : null}
      </button>
    );
  }

  return (
    <>
      <div className="hidden md:block">
        <Table className="table-fixed">
          <TableHeader>
            <TableRow>
              <TableHead className="w-[49%]">
                <SortHeader column="item" label={copy.table.item} />
              </TableHead>
              <TableHead className="w-[10%] text-center">
                <SortHeader align="center" column="stock" label={copy.table.stock} />
              </TableHead>
              <TableHead className="w-[12%]">
                <SortHeader column="status" label={copy.table.status} />
              </TableHead>
              <TableHead className="w-[17%]">
                <SortHeader column="last-updated" label={copy.table.lastUpdate} />
              </TableHead>
              <TableHead className="w-[12%] px-1 text-center">{copy.table.action}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.sku.skuId}>
                <TableCell className="w-[49%]">
                  <div className="min-w-0">
                    <Link className="block min-w-0" to={skuDetailHref(row.sku.skuId)}>
                      <p className="truncate text-[0.95rem] font-medium text-foreground hover:text-primary">
                        {row.sku.name}
                      </p>
                      <p className="truncate text-sm text-muted-foreground">{row.sku.skuId}</p>
                    </Link>
                    {row.linkedServiceNames.length > 0 ? (
                      <p className="truncate whitespace-nowrap text-sm text-muted-foreground">
                        {row.linkedServiceNames.join(', ')}
                      </p>
                    ) : null}
                  </div>
                </TableCell>
                <TableCell className="w-[10%] text-center font-medium">
                  <Link className="inline-flex hover:text-primary" to={skuDetailHref(row.sku.skuId)}>
                    {row.stockDisplay}
                  </Link>
                </TableCell>
                <TableCell className="w-[12%]">
                  <Link className="inline-flex" to={skuDetailHref(row.sku.skuId)}>
                    <Badge
                      className={cn('rounded-full transition-colors', queueBadgeClassName(row.status))}
                      variant={queueBadgeVariant(row.status)}
                    >
                      {overviewStatusLabel(row.status)}
                    </Badge>
                  </Link>
                </TableCell>
                <TableCell className="w-[17%]">
                  <Link className="block truncate hover:text-primary" to={reportHref(row)}>
                    {row.lastUpdated}
                  </Link>
                </TableCell>
                <TableCell className="w-[12%] px-1 text-center">
                  <Button asChild size="sm" variant={row.actionKind === 'update' ? 'default' : 'outline'}>
                    <Link to={queueActionHref(row)}>{queueActionLabel(row)}</Link>
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <div className="grid gap-3 md:hidden">
        {rows.map((row) => (
          <div className="grid gap-3 border-b border-border/60 py-3 last:border-b-0" key={row.sku.skuId}>
            <div className="min-w-0">
              <Link className="block min-w-0" to={skuDetailHref(row.sku.skuId)}>
                <p className="truncate font-medium text-foreground hover:text-primary">{row.sku.name}</p>
                <p className="truncate text-sm text-muted-foreground">{row.sku.skuId}</p>
              </Link>
              {row.linkedServiceNames.length > 0 ? (
                <p className="truncate text-sm text-muted-foreground">{row.linkedServiceNames.join(', ')}</p>
              ) : null}
            </div>
            <div className="flex items-center justify-between gap-3 text-sm">
              <span className="text-muted-foreground">{copy.table.stock}</span>
              <Link className="font-medium text-foreground hover:text-primary" to={skuDetailHref(row.sku.skuId)}>
                {row.stockDisplay}
              </Link>
            </div>
            <div className="flex items-center justify-between gap-3 text-sm">
              <span className="text-muted-foreground">{copy.table.lastUpdate}</span>
              <Link className="text-right text-foreground hover:text-primary" to={reportHref(row)}>
                {row.lastUpdated}
              </Link>
            </div>
            <div className="flex items-center justify-between gap-3">
              <Link className="inline-flex" to={skuDetailHref(row.sku.skuId)}>
                <Badge
                  className={cn('rounded-full transition-colors', queueBadgeClassName(row.status))}
                  variant={queueBadgeVariant(row.status)}
                >
                  {overviewStatusLabel(row.status)}
                </Badge>
              </Link>
              <Button asChild size="sm" variant={row.actionKind === 'update' ? 'default' : 'outline'}>
                <Link to={queueActionHref(row)}>{queueActionLabel(row)}</Link>
              </Button>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

export function DashboardRoute() {
  const { listStockReports, snapshot } = useInventory();
  const { draft, hasDraft } = useOperationsSession();
  const { language, t } = usePreferences();
  const [reports, setReports] = useState<StockReport[]>([]);
  const [reportsError, setReportsError] = useState<string | null>(null);
  const [reportsLoading, setReportsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeQueueFilter, setActiveQueueFilter] = useState<OverviewQueueFilter>('all');
  const [sortMode, setSortMode] = useState<OverviewSortMode>({
    column: 'status',
    direction: 'asc',
  });
  const deferredSearchQuery = useDeferredValue(searchQuery.trim().toLowerCase());

  useEffect(() => {
    let cancelled = false;

    async function loadReports() {
      traceRenderer('dashboard', 'reports-effect-start', {
        source: 'DashboardRoute.useEffect',
      });
      setReportsLoading(true);
      setReportsError(null);

      try {
        const nextReports = await listStockReports();
        if (!cancelled) {
          traceRenderer('dashboard', 'reports-effect-success', {
            count: nextReports.length,
          });
          setReports(nextReports);
        }
      } catch (error) {
        if (!cancelled) {
          traceRenderer('dashboard', 'reports-effect-error', {
            error: error instanceof Error ? error.message : t('overviewRecentActivityFallback'),
          });
          setReportsError(error instanceof Error ? error.message : t('overviewRecentActivityFallback'));
        }
      } finally {
        if (!cancelled) {
          setReportsLoading(false);
        }
      }
    }

    void loadReports();

    return () => {
      cancelled = true;
      traceRenderer('dashboard', 'reports-effect-cancel');
    };
  }, [listStockReports, t]);

  if (!snapshot) {
    return (
      <WorkspacePage data-testid="overview-route">
        <WorkspacePanel description={copy.loadingBody} title={copy.loadingTitle}>
          <p className="text-sm text-muted-foreground">{t('overviewLoading')}</p>
        </WorkspacePanel>
      </WorkspacePage>
    );
  }

  const referenceAt = snapshot.sist.asOf ?? reports[0]?.reportedAt ?? new Date().toISOString();
  const queueRows = buildQueueRows(snapshot, reports, referenceAt, language);
  const visibleQueueRows = [...queueRows]
    .filter((row) => matchesQueueFilter(row, activeQueueFilter))
    .filter((row) => matchesQueueSearch(row, deferredSearchQuery))
    .sort((left, right) => compareQueueRowsBySort(left, right, sortMode));
  const recentChanges = buildRecentChanges(snapshot, reports, language);
  const insights = buildInsights(snapshot, reports);
  const resumeStep = draft?.lastStep ?? 'details';

  const filterOptions: Array<{ value: OverviewQueueFilter; label: string; count: number }> = [
    {
      value: 'all',
      label: copy.filters.all,
      count: countForFilter(queueRows, 'all'),
    },
    {
      value: 'need-update',
      label: copy.filters.needUpdate,
      count: countForFilter(queueRows, 'need-update'),
    },
    {
      value: 'low-stock',
      label: copy.filters.lowStock,
      count: countForFilter(queueRows, 'low-stock'),
    },
    {
      value: 'out',
      label: copy.filters.out,
      count: countForFilter(queueRows, 'out'),
    },
    {
      value: 'updated-today',
      label: copy.filters.updatedToday,
      count: countForFilter(queueRows, 'updated-today'),
    },
  ];

  function handleSortChange(column: OverviewSortColumn) {
    setSortMode((current) => {
      if (current.column === column) {
        return {
          column,
          direction: current.direction === 'asc' ? 'desc' : 'asc',
        };
      }

      return {
        column,
        direction: column === 'status' ? 'asc' : 'asc',
      };
    });
  }

  return (
    <WorkspacePage data-testid="overview-route">
      <div className="flex flex-col gap-4">
        <WorkspacePanel
          action={
            <div className="flex flex-wrap gap-2">
              <Button asChild>
                <Link to="/operations/session">
                  <ClipboardPen data-icon="inline-start" />
                  {copy.startUpdate}
                </Link>
              </Button>
              {hasDraft ? (
                <Button asChild variant="outline">
                  <Link to={`/operations/session?step=${resumeStep}`}>
                    <Play data-icon="inline-start" />
                    {copy.resumeDraft}
                  </Link>
                </Button>
              ) : null}
            </div>
          }
          title={<WorkspacePageTitle>{copy.title}</WorkspacePageTitle>}
        >
          <div className="grid gap-4">
            <InputGroup className="h-12 rounded-full">
              <InputGroupAddon className="pl-4 text-muted-foreground" align="inline-start">
                <InputGroupText>
                  <Search />
                </InputGroupText>
              </InputGroupAddon>
              <InputGroupInput
                aria-label={copy.searchLabel}
                placeholder={copy.searchPlaceholder}
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
              />
            </InputGroup>
            <ToggleGroup
              aria-label={copy.filtersLabel}
              className="inline-flex max-w-full justify-start overflow-x-auto"
              spacing={1}
              type="single"
              value={activeQueueFilter}
              onValueChange={(nextValue) => {
                if (nextValue) {
                  setActiveQueueFilter(nextValue as OverviewQueueFilter);
                }
              }}
            >
              {filterOptions.map((option) => (
                <ToggleGroupItem key={option.value} value={option.value}>
                  {option.value === 'all'
                    ? option.label
                    : `${option.label} (${formatNumber(option.count, language)})`}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </div>
        </WorkspacePanel>

        <Card className="border-white/70">
          <CardContent className="p-0">
            <div className="grid lg:grid-cols-[minmax(0,1fr)_300px]">
            <section className="min-w-0 px-4 pb-4 pt-0 sm:px-6 sm:pb-5 sm:pt-0">
              <div className="flex flex-col gap-4 border-b border-border/60 pb-4">
                <div>
                  <h2 className="text-lg font-semibold tracking-[-0.03em] text-foreground">
                    {copy.worklistTitle}
                  </h2>
                  <p className="text-sm text-muted-foreground">{copy.worklistBody}</p>
                </div>
              </div>

              <div className="pt-4">
                {visibleQueueRows.length > 0 ? (
                  <QueueTable onSortChange={handleSortChange} rows={visibleQueueRows} sortMode={sortMode} />
                ) : (
                  <div className="rounded-2xl border border-dashed border-border/70 px-4 py-8 text-sm text-muted-foreground">
                    {activeQueueFilter === 'updated-today' ? copy.noUpdatedToday : copy.noQueueRows}
                  </div>
                )}
              </div>
            </section>

            <aside className="border-t border-border/60 px-4 pb-4 pt-0 sm:px-6 sm:pb-5 sm:pt-0 lg:border-t-0 lg:border-l">
              <div className="grid gap-8">
                <section>
                  <div className="border-b border-border/60 pb-3">
                    <h2 className="text-base font-semibold tracking-[-0.02em] text-foreground">
                      {copy.recentChangesTitle}
                    </h2>
                  </div>
                  <div className="divide-y divide-border/60">
                    {reportsLoading ? (
                      <p className="pt-4 text-sm text-muted-foreground">{copy.recentChangesLoading}</p>
                    ) : reportsError ? (
                      <p className="pt-4 text-sm text-muted-foreground">{copy.recentChangesFallback}</p>
                    ) : recentChanges.length === 0 ? (
                      <p className="pt-4 text-sm text-muted-foreground">{copy.recentChangesEmpty}</p>
                    ) : (
                      recentChanges.map((change) => (
                        <div className="grid gap-1 py-3" key={change.key}>
                          <Link className="truncate font-medium text-foreground hover:text-primary" to={change.href}>
                            {change.itemName}
                          </Link>
                          <div className="flex items-center justify-between gap-3 text-sm text-muted-foreground">
                            <span className="truncate">{change.detail}</span>
                            <Link className="shrink-0 hover:text-primary" to={change.reportHref}>
                              {change.timestamp}
                            </Link>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </section>

                <section>
                  <div className="border-b border-border/60 pb-3">
                    <h2 className="text-base font-semibold tracking-[-0.02em] text-foreground">
                      {copy.insightsTitle}
                    </h2>
                  </div>
                  <div className="grid gap-3 pt-4">
                    {insights.slice(0, 3).map((insight) => (
                      <p className="text-sm text-muted-foreground" key={insight.key}>
                        {`\u2022 ${insight.body}`}
                      </p>
                    ))}
                    {reportsError ? (
                      <p className="text-sm text-muted-foreground">{copy.insightsFallback}</p>
                    ) : summarizeNotes(reports[0]?.notes ?? null) ? (
                      <p className="text-sm text-muted-foreground">{summarizeNotes(reports[0]?.notes ?? null)}</p>
                    ) : null}
                    <div className="pt-2">
                      <Button asChild className="w-full justify-center" size="sm" variant="outline">
                        <Link to="/sist">
                          <BrainCircuit data-icon="inline-start" />
                          {copy.openAnalysis}
                        </Link>
                      </Button>
                    </div>
                  </div>
                </section>

                <section className="pt-6">
                  <div className="border-b border-border/60 pb-3">
                    <h2 className="text-base font-semibold tracking-[-0.02em] text-foreground">
                      Add new item to Catalog
                    </h2>
                  </div>
                  <div className="flex flex-col gap-2 pt-4">
                    <Button asChild size="sm" variant="outline">
                      <Link to="/catalog/skus/new">
                        <PackagePlus data-icon="inline-start" />
                        {t('createSkuAction')}
                      </Link>
                    </Button>
                    <Button asChild size="sm" variant="outline">
                      <Link to="/catalog/services/new">
                        <NewServiceIcon className="relative inline-flex size-4 shrink-0" />
                        {t('createServiceAction')}
                      </Link>
                    </Button>
                  </div>
                </section>
              </div>
            </aside>
          </div>
          </CardContent>
        </Card>
      </div>
    </WorkspacePage>
  );
}
