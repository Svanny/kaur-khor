import { useDeferredValue, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Search } from 'lucide-react';
import type { InventorySnapshot, ServiceRecord, SkuRecord, StockReport } from '@shared/inventory';
import { DescriptionText } from '@/components/system/description-text';
import { WorkspacePage, WorkspacePanel } from '@/components/system/workspace';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
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
import {
  computeServiceSellableUnits,
  linkedServicesForSku,
  serviceCoverageState,
  serviceLinkedSkus,
  sortByName,
} from '@/lib/catalog';
import { formatCurrency, formatNumber, localeFor } from '@/lib/format';
import {
  rankingSignalCount,
  stockReportSourceKey,
  summarizeCount,
  summarizeNotes,
} from '@/lib/stock-report-summary';
import { matchesRecentActivityFilter, type RecentActivityFilter } from '@/lib/recent-activity';
import { cn } from '@/lib/utils';
import { traceRenderer } from '@/lib/trace';
import { useInventory } from '@/state/inventory';
import { usePreferences } from '@/state/preferences';

type SellableView = 'services' | 'sellable-skus';
type OverviewTab = 'summary' | 'sellable-health' | 'sku-levels' | 'recent-activity';
type SkuLevelsFilter =
  | 'all'
  | 'low-stock'
  | 'out-of-stock'
  | 'affects-services'
  | 'no-service-impact'
  | 'recently-updated';
type ServiceHealthState = 'available' | 'constrained' | 'blocked' | 'unlinked';
type SkuLevelState = 'healthy' | 'low-stock' | 'out-of-stock';

type ServiceHealthRow = {
  service: ServiceRecord;
  status: ServiceHealthState;
  sellableUnits: number;
  linkedSkuCount: number;
  bottleneck: string;
  lastRelevantUpdate: string;
};

type SellableSkuRow = {
  sku: SkuRecord;
  status: ServiceHealthState;
  linkedServiceCount: number;
  lastRelevantUpdate: string;
};

type InventoryLevelRow = {
  sku: SkuRecord;
  status: SkuLevelState;
  linkedServiceCount: number;
  inventoryValue: number;
  lastUpdated: string;
};

type ActivityRow = {
  report: StockReport;
  preview: string | null;
};

const copy = {
  monitoringSubtitle: 'Monitor sellable readiness, service availability, and stock levels.',
  recordStockUpdate: 'Record stock update',
  openCatalog: 'Open catalog',
  metrics: {
    sellableReady: ['Sellable SKUs ready', 'In stock and ready to sell.'],
    servicesAvailable: ['Services available', 'Can be fulfilled from current stock.'],
    blockedServices: ['Blocked services', 'Need a linked SKU before they can sell.'],
    lowStockSkus: ['Low-stock SKUs', 'Need a closer stock review.'],
    latestStockUpdate: ['Latest stock update', 'No updates yet.'],
  },
  noUpdatesYet: 'No updates yet',
  tabs: {
    summary: 'Summary',
    sellableHealth: 'Sellable health',
    skuLevels: 'SKU levels',
    recentActivity: 'Recent activity',
  },
  summary: {
    title: 'Summary',
    description:
      'Use the current snapshot to spot blocked services, constrained readiness, and the latest stock movement.',
    currentState: 'Current state',
    serviceAvailability: 'Service availability',
    latestUpdate: 'Latest update',
    sentenceBlocked: 'Most services are available, but {blocked} are blocked and {lowStock} SKUs need review.',
    sentenceLowStock: '{available} services are available, but {lowStock} SKUs still need review.',
    sentenceHealthy: '{available} services are available and no SKU is currently flagged for review.',
    noBlockedService: 'No blocked service',
    noBlockedServiceBody: 'Everything linked to services is currently sellable.',
    noConstrainedService: 'No constrained service',
    noConstrainedServiceBody: 'No service is near a readiness constraint right now.',
    noLowStockSku: 'No low-stock SKU',
    noLowStockSkuBody: 'SKU stock levels look steady right now.',
  },
  sellableHealth: {
    title: 'Sellable health',
    description: 'Monitor which services and direct-sell SKUs are ready, constrained, or blocked.',
    body: 'Use one table surface to compare readiness, bottlenecks, and the latest relevant stock update.',
    toggleLabel: 'Sellable health view',
    sellableSkusLabel: 'Sellable SKUs',
    bottleneck: 'Bottleneck',
    lastRelevantUpdate: 'Last relevant update',
    affectedServices: 'Affected services',
    action: 'Action',
    distributionSummary: 'Distribution summary',
    topBlockers: 'Top blockers',
  },
  skuLevels: {
    title: 'SKU levels',
    description:
      'Monitor all SKU inventory levels in one dense table with search and lightweight status filters.',
    searchLabel: 'Search SKU levels',
    searchPlaceholder: 'Search SKU id or name…',
    filtersLabel: 'SKU level filters',
    affectsServices: 'Affects services',
    noServiceImpact: 'No service impact',
    recentlyUpdated: 'Recently updated',
    lastUpdated: 'Last updated',
    action: 'Action',
  },
  recentActivity: {
    description: 'Review the latest stock, service, and price changes without leaving Overview.',
    body:
      'Keep this lighter than Operations while still showing what changed, when it changed, and which item moved.',
    filtersLabel: 'Recent activity filters',
    stockChanges: 'Stock changes',
    serviceUpdates: 'Service updates',
    priceChanges: 'Price changes',
  },
  status: {
    available: 'Available',
    constrained: 'Constrained',
    blocked: 'Blocked',
    unlinked: 'Unlinked',
    healthy: 'Healthy',
    lowStock: 'Low stock',
    outOfStock: 'Out of stock',
  },
  actions: {
    reviewService: 'Review service',
    reviewSku: 'Review SKU',
  },
} as const;

function reportDateLabel(reportedAt: string, language: 'en' | 'km') {
  return new Intl.DateTimeFormat(localeFor(language), {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(reportedAt));
}

function latestReportSummary(report: StockReport, t: (key: string) => string) {
  const serviceFlagCount = report.serviceSignals.filter((signal) => signal.stockout !== false).length;

  return [
    summarizeCount(
      report.skuObservations.length,
      t('stockHistoryChangedRowSingular'),
      t('stockHistoryChangedRowPlural'),
    ),
    summarizeCount(
      serviceFlagCount,
      t('stockHistoryServiceFlagSingular'),
      t('stockHistoryServiceFlagPlural'),
    ),
    summarizeCount(
      report.servicePriceAdjustments.length,
      t('stockHistoryPriceEditSingular'),
      t('stockHistoryPriceEditPlural'),
    ),
    summarizeCount(
      rankingSignalCount(report),
      t('stockHistoryRankingSignalSingular'),
      t('stockHistoryRankingSignalPlural'),
    ),
  ].join(' · ');
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

function latestRelevantLabel(report: StockReport | null, language: 'en' | 'km') {
  return report ? reportDateLabel(report.reportedAt, language) : '—';
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

function serviceHealthState(snapshot: InventorySnapshot, service: ServiceRecord): ServiceHealthState {
  const state = serviceCoverageState(service, snapshot);

  if (state === 'blocked') {
    return 'blocked';
  }
  if (state === 'at-risk') {
    return 'constrained';
  }
  if (state === 'unlinked') {
    return 'unlinked';
  }
  return 'available';
}

function sellableSkuHealthState(snapshot: InventorySnapshot, sku: SkuRecord): ServiceHealthState {
  if (sku.unitsInStock <= 0) {
    return 'blocked';
  }
  if (lightweightLowStock(snapshot, sku)) {
    return 'constrained';
  }
  return 'available';
}

function skuLevelState(snapshot: InventorySnapshot, sku: SkuRecord): SkuLevelState {
  if (sku.unitsInStock <= 0) {
    return 'out-of-stock';
  }
  if (lightweightLowStock(snapshot, sku)) {
    return 'low-stock';
  }
  return 'healthy';
}

function serviceStatusLabel(status: ServiceHealthState) {
  if (status === 'available') {
    return copy.status.available;
  }
  if (status === 'constrained') {
    return copy.status.constrained;
  }
  if (status === 'blocked') {
    return copy.status.blocked;
  }
  return copy.status.unlinked;
}

function skuStatusLabel(status: SkuLevelState) {
  if (status === 'healthy') {
    return copy.status.healthy;
  }
  if (status === 'low-stock') {
    return copy.status.lowStock;
  }
  return copy.status.outOfStock;
}

function badgeVariant(status: ServiceHealthState | SkuLevelState) {
  return status === 'available' || status === 'healthy' ? 'secondary' : 'outline';
}

function serviceBottleneck(snapshot: InventorySnapshot, service: ServiceRecord) {
  const linkedSkus = serviceLinkedSkus(service, snapshot);
  if (linkedSkus.length === 0) {
    return '—';
  }

  const lowestStockSku = [...linkedSkus].sort((left, right) => left.unitsInStock - right.unitsInStock)[0];
  return `${lowestStockSku.name} · ${lowestStockSku.unitsInStock}`;
}

function activityPreview(report: StockReport, snapshot: InventorySnapshot) {
  const firstSkuId = report.skuObservations[0]?.skuId;
  if (firstSkuId) {
    return snapshot.skus.find((sku) => sku.skuId === firstSkuId)?.name ?? firstSkuId;
  }

  const firstServiceId = report.serviceSignals[0]?.serviceId ?? report.servicePriceAdjustments[0]?.serviceId;
  if (firstServiceId) {
    return snapshot.services.find((service) => service.serviceId === firstServiceId)?.name ?? firstServiceId;
  }

  return null;
}

function currentStateSentence({
  blockedServices,
  lowStockSkus,
  servicesAvailable,
}: {
  blockedServices: number;
  lowStockSkus: number;
  servicesAvailable: number;
}) {
  if (blockedServices > 0) {
    return copy.summary.sentenceBlocked
      .replace('{blocked}', String(blockedServices))
      .replace('{lowStock}', String(lowStockSkus));
  }
  if (lowStockSkus > 0) {
    return copy.summary.sentenceLowStock
      .replace('{available}', String(servicesAvailable))
      .replace('{lowStock}', String(lowStockSkus));
  }

  return copy.summary.sentenceHealthy.replace('{available}', String(servicesAvailable));
}

function watchlistRows({
  blockedServices,
  constrainedServices,
  language,
  lowStockSkus,
}: {
  blockedServices: ServiceHealthRow[];
  constrainedServices: ServiceHealthRow[];
  language: 'en' | 'km';
  lowStockSkus: InventoryLevelRow[];
}) {
  const topBlocked = blockedServices[0];
  const topConstrained = constrainedServices[0];
  const topLowStock = lowStockSkus[0];

  return [
    topBlocked
      ? {
          title: topBlocked.service.name,
          body: `${serviceStatusLabel(topBlocked.status)} · ${formatNumber(topBlocked.sellableUnits, language)} sellable units`,
          href: `/catalog/services/${topBlocked.service.serviceId}`,
          action: copy.actions.reviewService,
        }
      : {
          title: copy.summary.noBlockedService,
          body: copy.summary.noBlockedServiceBody,
          href: '/catalog?view=services',
          action: copy.openCatalog,
        },
    topConstrained
      ? {
          title: topConstrained.service.name,
          body: `${serviceStatusLabel(topConstrained.status)} · ${topConstrained.bottleneck}`,
          href: `/catalog/services/${topConstrained.service.serviceId}`,
          action: copy.actions.reviewService,
        }
      : {
          title: copy.summary.noConstrainedService,
          body: copy.summary.noConstrainedServiceBody,
          href: '/catalog?view=services',
          action: copy.openCatalog,
        },
    topLowStock
      ? {
          title: topLowStock.sku.name,
          body: `${skuStatusLabel(topLowStock.status)} · ${formatNumber(topLowStock.sku.unitsInStock, language)} units in stock`,
          href: `/catalog/skus/${topLowStock.sku.skuId}`,
          action: copy.actions.reviewSku,
        }
      : {
          title: copy.summary.noLowStockSku,
          body: copy.summary.noLowStockSkuBody,
          href: '/catalog?view=skus',
          action: copy.openCatalog,
        },
  ];
}

function serviceHealthRows(snapshot: InventorySnapshot, reports: StockReport[], language: 'en' | 'km') {
  return sortByName(snapshot.services).map((service) => ({
    service,
    status: serviceHealthState(snapshot, service),
    sellableUnits: computeServiceSellableUnits(service, snapshot),
    linkedSkuCount: service.skuIds.length,
    bottleneck: serviceBottleneck(snapshot, service),
    lastRelevantUpdate: latestRelevantLabel(
      latestRelevantServiceReport(reports, service.serviceId),
      language,
    ),
  }));
}

function sellableSkuRows(snapshot: InventorySnapshot, reports: StockReport[], language: 'en' | 'km') {
  return sortByName(snapshot.skus.filter((sku) => sku.soldAsProduct)).map((sku) => ({
    sku,
    status: sellableSkuHealthState(snapshot, sku),
    linkedServiceCount: linkedServicesForSku(sku.skuId, snapshot).length,
    lastRelevantUpdate: latestRelevantLabel(latestRelevantSkuReport(reports, sku.skuId), language),
  }));
}

function inventoryLevelRows(snapshot: InventorySnapshot, reports: StockReport[], language: 'en' | 'km') {
  return sortByName(snapshot.skus).map((sku) => ({
    sku,
    status: skuLevelState(snapshot, sku),
    linkedServiceCount: linkedServicesForSku(sku.skuId, snapshot).length,
    inventoryValue: sku.unitsInStock * sku.costPerUnit,
    lastUpdated: latestRelevantLabel(latestRelevantSkuReport(reports, sku.skuId), language),
  }));
}

function matchesSkuLevelsFilter(row: InventoryLevelRow, filter: SkuLevelsFilter, recentSkuIds: Set<string>) {
  if (filter === 'all') {
    return true;
  }
  if (filter === 'low-stock') {
    return row.status === 'low-stock';
  }
  if (filter === 'out-of-stock') {
    return row.status === 'out-of-stock';
  }
  if (filter === 'affects-services') {
    return row.linkedServiceCount > 0;
  }
  if (filter === 'no-service-impact') {
    return row.linkedServiceCount === 0;
  }
  return recentSkuIds.has(row.sku.skuId);
}

function SummaryMetric({
  caption,
  label,
  value,
}: {
  caption: string;
  label: string;
  value: string;
}) {
  return (
    <div className="min-w-[190px] shrink-0 px-5 py-4 first:pl-0 last:pr-0">
      <p className="text-[0.72rem] font-medium tracking-[0.08em] text-muted-foreground/85">{label}</p>
      <p className="mt-2 text-2xl font-semibold tracking-[-0.04em] text-foreground">{value}</p>
      <p className="mt-1 text-sm text-muted-foreground">{caption}</p>
    </div>
  );
}

function overviewTabClass(isActive: boolean) {
  return cn(
    'relative inline-flex h-8 shrink-0 items-center justify-center rounded-md border border-transparent px-3 py-1 text-sm font-medium whitespace-nowrap text-foreground/60 transition-all hover:text-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-1 focus-visible:outline-ring',
    'after:absolute after:inset-x-0 after:bottom-[-5px] after:h-0.5 after:bg-foreground after:opacity-0 after:transition-opacity',
    isActive && 'bg-transparent text-foreground after:opacity-100',
  );
}

export function DashboardRoute() {
  const { listStockReports, snapshot } = useInventory();
  const { currency, language, t } = usePreferences();
  const [reports, setReports] = useState<StockReport[]>([]);
  const [reportsError, setReportsError] = useState<string | null>(null);
  const [reportsLoading, setReportsLoading] = useState(true);
  const [overviewTab, setOverviewTab] = useState<OverviewTab>('summary');
  const [sellableView, setSellableView] = useState<SellableView>('services');
  const [skuLevelsQuery, setSkuLevelsQuery] = useState('');
  const [skuLevelsFilter, setSkuLevelsFilter] = useState<SkuLevelsFilter>('all');
  const [activityFilter, setActivityFilter] = useState<RecentActivityFilter>('all');
  const deferredSkuLevelsQuery = useDeferredValue(skuLevelsQuery.trim().toLowerCase());

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
        <WorkspacePanel description={t('overviewBody')} title={t('overviewHeading')}>
          <p className="text-sm text-muted-foreground">{t('overviewLoading')}</p>
        </WorkspacePanel>
      </WorkspacePage>
    );
  }

  const latestReport = reports[0] ?? null;
  const serviceRows = serviceHealthRows(snapshot, reports, language);
  const sellableRows = sellableSkuRows(snapshot, reports, language);
  const skuRows = inventoryLevelRows(snapshot, reports, language);
  const activityRows: ActivityRow[] = reports.map((report) => ({
    report,
    preview: activityPreview(report, snapshot),
  }));

  const availableServices = serviceRows.filter((row) => row.status === 'available');
  const constrainedServices = serviceRows.filter((row) => row.status === 'constrained');
  const blockedServices = serviceRows.filter((row) => row.status === 'blocked');
  const lowStockSkus = skuRows.filter((row) => row.status !== 'healthy');
  const sellableSkusReady = sellableRows.filter((row) => row.status === 'available');
  const recentSkuIds = new Set(
    reports.slice(0, 3).flatMap((report) => report.skuObservations.map((entry) => entry.skuId)),
  );
  const filteredSkuRows = skuRows.filter((row) => {
    const matchesQuery =
      !deferredSkuLevelsQuery ||
      row.sku.name.toLowerCase().includes(deferredSkuLevelsQuery) ||
      row.sku.skuId.toLowerCase().includes(deferredSkuLevelsQuery);

    return matchesQuery && matchesSkuLevelsFilter(row, skuLevelsFilter, recentSkuIds);
  });
  const filteredActivity = activityRows.filter((row) =>
    matchesRecentActivityFilter(row.report, activityFilter),
  );
  const visibleActivity = filteredActivity.slice(0, 4);
  const watchlist = watchlistRows({
    blockedServices,
    constrainedServices,
    language,
    lowStockSkus,
  });

  const summaryMetrics = [
    {
      label: copy.metrics.sellableReady[0],
      value: formatNumber(sellableSkusReady.length, language),
      caption: copy.metrics.sellableReady[1],
    },
    {
      label: copy.metrics.servicesAvailable[0],
      value: formatNumber(availableServices.length, language),
      caption: copy.metrics.servicesAvailable[1],
    },
    {
      label: copy.metrics.blockedServices[0],
      value: formatNumber(blockedServices.length, language),
      caption: copy.metrics.blockedServices[1],
    },
    {
      label: copy.metrics.lowStockSkus[0],
      value: formatNumber(lowStockSkus.length, language),
      caption: copy.metrics.lowStockSkus[1],
    },
    {
      label: copy.metrics.latestStockUpdate[0],
      value: latestReport ? reportDateLabel(latestReport.reportedAt, language) : copy.noUpdatesYet,
      caption: latestReport ? latestReportSummary(latestReport, t) : copy.metrics.latestStockUpdate[1],
    },
  ];

  return (
    <WorkspacePage data-testid="overview-route">
      <div className="flex flex-col gap-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-2">
            <h1 className="text-2xl font-semibold tracking-[-0.04em] text-foreground">
              {t('overviewHeading')}
            </h1>
            <DescriptionText className="max-w-2xl text-sm leading-6 text-muted-foreground">
              {copy.monitoringSubtitle}
            </DescriptionText>
          </div>
          <div className="flex flex-wrap gap-3">
            <Button asChild>
              <Link to="/operations/session">
                {copy.recordStockUpdate}
                <ArrowRight data-icon="inline-end" />
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link to="/catalog">{copy.openCatalog}</Link>
            </Button>
          </div>
        </div>

        <div className="editorial-panel overflow-hidden rounded-3xl px-5">
          <div className="overflow-x-auto">
            <div className="flex min-w-max divide-x divide-border/60">
              {summaryMetrics.map((metric) => (
                <SummaryMetric
                  caption={metric.caption}
                  key={metric.label}
                  label={metric.label}
                  value={metric.value}
                />
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-4">
        <div
          aria-label="Overview sections"
          className="inline-flex w-full items-center gap-1 overflow-x-auto rounded-none bg-transparent p-[3px] text-muted-foreground"
          role="tablist"
        >
          {([
            ['summary', copy.tabs.summary],
            ['sellable-health', copy.tabs.sellableHealth],
            ['sku-levels', copy.tabs.skuLevels],
            ['recent-activity', copy.tabs.recentActivity],
          ] as const).map(([value, label]) => (
            <button
              aria-selected={overviewTab === value}
              className={overviewTabClass(overviewTab === value)}
              data-state={overviewTab === value ? 'active' : 'inactive'}
              key={value}
              role="tab"
              type="button"
              onClick={() => setOverviewTab(value)}
            >
              {label}
            </button>
          ))}
        </div>

        {overviewTab === 'summary' ? (
          <WorkspacePanel description={copy.summary.description} title={copy.summary.title}>
            <div className="grid gap-6 xl:grid-cols-[minmax(0,1.45fr)_320px]">
              <div className="space-y-5 rounded-3xl border border-border/70 bg-background/45 p-5">
                <div className="space-y-3">
                  <p className="text-lg font-semibold tracking-[-0.03em] text-foreground">
                    {copy.summary.currentState}
                  </p>
                  <DescriptionText className="text-sm leading-6 text-muted-foreground">
                    {currentStateSentence({
                      blockedServices: blockedServices.length,
                      lowStockSkus: lowStockSkus.length,
                      servicesAvailable: availableServices.length,
                    })}
                  </DescriptionText>
                </div>

                <div className="divide-y divide-border/60 rounded-2xl border border-border/60">
                  {watchlist.map((row) => (
                    <div className="flex items-start justify-between gap-4 px-4 py-4" key={row.title}>
                      <div className="min-w-0">
                        <p className="truncate font-medium text-foreground">{row.title}</p>
                        <p className="mt-1 text-sm text-muted-foreground">{row.body}</p>
                      </div>
                      <Button asChild size="sm" variant="outline">
                        <Link to={row.href}>{row.action}</Link>
                      </Button>
                    </div>
                  ))}
                </div>
              </div>

              <div className="grid gap-4">
                <div className="rounded-3xl border border-border/70 bg-background/45 p-5">
                  <p className="text-lg font-semibold tracking-[-0.03em] text-foreground">
                    {copy.summary.serviceAvailability}
                  </p>
                  <div className="mt-4 grid gap-3">
                    {[
                      [copy.status.available, availableServices.length],
                      [copy.status.constrained, constrainedServices.length],
                      [copy.status.blocked, blockedServices.length],
                    ].map(([label, count]) => (
                      <div className="flex items-center justify-between text-sm" key={label}>
                        <span className="text-muted-foreground">{label}</span>
                        <span className="font-medium text-foreground">{formatNumber(Number(count), language)}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="rounded-3xl border border-border/70 bg-background/45 p-5">
                  <p className="text-lg font-semibold tracking-[-0.03em] text-foreground">
                    {copy.summary.latestUpdate}
                  </p>
                  {reportsError ? (
                    <p className="mt-3 text-sm text-muted-foreground">{t('overviewRecentActivityFallback')}</p>
                  ) : latestReport ? (
                    <div className="mt-3 space-y-2">
                      <p className="text-sm font-medium text-foreground">
                        {reportDateLabel(latestReport.reportedAt, language)}
                      </p>
                      <p className="text-sm text-muted-foreground">{latestReportSummary(latestReport, t)}</p>
                      <p className="text-sm text-muted-foreground">
                        {summarizeNotes(latestReport.notes) ?? t('stockHistoryNoNotes')}
                      </p>
                    </div>
                  ) : reportsLoading ? (
                    <p className="mt-3 text-sm text-muted-foreground">{t('overviewRecentActivityLoading')}</p>
                  ) : (
                    <p className="mt-3 text-sm text-muted-foreground">{copy.noUpdatesYet}</p>
                  )}
                </div>
              </div>
            </div>
          </WorkspacePanel>
        ) : null}

        {overviewTab === 'sellable-health' ? (
          <WorkspacePanel description={copy.sellableHealth.description} title={copy.sellableHealth.title}>
            <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
              <DescriptionText className="max-w-2xl text-sm leading-6 text-muted-foreground">
                {copy.sellableHealth.body}
              </DescriptionText>
              <ToggleGroup
                aria-label={copy.sellableHealth.toggleLabel}
                type="single"
                value={sellableView}
                onValueChange={(nextValue) => {
                  if (nextValue) {
                    setSellableView(nextValue as SellableView);
                  }
                }}
              >
                <ToggleGroupItem value="services">{t('servicesHeading')}</ToggleGroupItem>
                <ToggleGroupItem value="sellable-skus">{copy.sellableHealth.sellableSkusLabel}</ToggleGroupItem>
              </ToggleGroup>
            </div>

            <div className="grid gap-6 xl:grid-cols-[minmax(0,1.6fr)_320px]">
              <div className="rounded-3xl border border-border/70 bg-background/45 p-3">
                {sellableView === 'services' ? (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t('servicesHeading')}</TableHead>
                        <TableHead>{t('inventoryColumnStatus')}</TableHead>
                        <TableHead className="text-center">{t('inventoryColumnSellable')}</TableHead>
                        <TableHead>{copy.sellableHealth.bottleneck}</TableHead>
                        <TableHead className="text-center">{t('inventoryColumnLinkedSkus')}</TableHead>
                        <TableHead>{copy.sellableHealth.lastRelevantUpdate}</TableHead>
                        <TableHead className="text-center">{copy.sellableHealth.action}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {serviceRows.map((row) => (
                        <TableRow key={row.service.serviceId}>
                          <TableCell className="min-w-0">
                            <Link className="group inline-flex min-w-0 flex-col" to={`/catalog/services/${row.service.serviceId}`}>
                              <span className="truncate font-medium text-foreground group-hover:text-primary">
                                {row.service.name}
                              </span>
                              <span className="truncate text-sm text-muted-foreground">{row.service.serviceId}</span>
                            </Link>
                          </TableCell>
                          <TableCell>
                            <Badge className="rounded-full" variant={badgeVariant(row.status)}>
                              {serviceStatusLabel(row.status)}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-center">{formatNumber(row.sellableUnits, language)}</TableCell>
                          <TableCell>{row.bottleneck}</TableCell>
                          <TableCell className="text-center">{formatNumber(row.linkedSkuCount, language)}</TableCell>
                          <TableCell>{row.lastRelevantUpdate}</TableCell>
                          <TableCell className="text-center">
                            <Button asChild size="sm" variant="outline">
                              <Link to={`/catalog/services/${row.service.serviceId}`}>{copy.actions.reviewService}</Link>
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t('skuLabel')}</TableHead>
                        <TableHead>{t('inventoryColumnStatus')}</TableHead>
                        <TableHead className="text-center">{t('fieldUnitsInStock')}</TableHead>
                        <TableHead>{t('catalogSkuDirectSellStatus')}</TableHead>
                        <TableHead className="text-center">{copy.sellableHealth.affectedServices}</TableHead>
                        <TableHead>{copy.sellableHealth.lastRelevantUpdate}</TableHead>
                        <TableHead className="text-center">{copy.sellableHealth.action}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {sellableRows.map((row) => (
                        <TableRow key={row.sku.skuId}>
                          <TableCell className="min-w-0">
                            <Link className="group inline-flex min-w-0 flex-col" to={`/catalog/skus/${row.sku.skuId}`}>
                              <span className="truncate font-medium text-foreground group-hover:text-primary">
                                {row.sku.name}
                              </span>
                              <span className="truncate text-sm text-muted-foreground">{row.sku.skuId}</span>
                            </Link>
                          </TableCell>
                          <TableCell>
                            <Badge className="rounded-full" variant={badgeVariant(row.status)}>
                              {serviceStatusLabel(row.status)}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-center">{formatNumber(row.sku.unitsInStock, language)}</TableCell>
                          <TableCell>
                            <Badge className="rounded-full" variant={row.sku.soldAsProduct ? 'secondary' : 'outline'}>
                              {row.sku.soldAsProduct ? t('inventorySoldAsProduct') : t('inventoryNotSoldAsProduct')}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-center">{formatNumber(row.linkedServiceCount, language)}</TableCell>
                          <TableCell>{row.lastRelevantUpdate}</TableCell>
                          <TableCell className="text-center">
                            <Button asChild size="sm" variant="outline">
                              <Link to={`/catalog/skus/${row.sku.skuId}`}>{copy.actions.reviewSku}</Link>
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </div>

              <div className="grid gap-4">
                <div className="rounded-3xl border border-border/70 bg-background/45 p-5">
                  <p className="text-lg font-semibold tracking-[-0.03em] text-foreground">
                    {copy.sellableHealth.distributionSummary}
                  </p>
                  <div className="mt-4 grid gap-3">
                    {(sellableView === 'services'
                      ? [
                          [copy.status.available, serviceRows.filter((row) => row.status === 'available').length],
                          [copy.status.constrained, serviceRows.filter((row) => row.status === 'constrained').length],
                          [copy.status.blocked, serviceRows.filter((row) => row.status === 'blocked').length],
                          [copy.status.unlinked, serviceRows.filter((row) => row.status === 'unlinked').length],
                        ]
                      : [
                          [copy.status.available, sellableRows.filter((row) => row.status === 'available').length],
                          [copy.status.constrained, sellableRows.filter((row) => row.status === 'constrained').length],
                          [copy.status.blocked, sellableRows.filter((row) => row.status === 'blocked').length],
                        ]
                    ).map(([label, count]) => (
                      <div className="flex items-center justify-between text-sm" key={label}>
                        <span className="text-muted-foreground">{label}</span>
                        <span className="font-medium text-foreground">{formatNumber(Number(count), language)}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="rounded-3xl border border-border/70 bg-background/45 p-5">
                  <p className="text-lg font-semibold tracking-[-0.03em] text-foreground">
                    {copy.sellableHealth.topBlockers}
                  </p>
                  <div className="mt-4 grid gap-3">
                    {(sellableView === 'services'
                      ? serviceRows
                          .filter((row) => row.status !== 'available')
                          .slice(0, 3)
                          .map((row) => ({
                            key: row.service.serviceId,
                            name: row.service.name,
                            note: row.bottleneck,
                          }))
                      : sellableRows
                          .filter((row) => row.status !== 'available')
                          .slice(0, 3)
                          .map((row) => ({
                            key: row.sku.skuId,
                            name: row.sku.name,
                            note: `${formatNumber(row.linkedServiceCount, language)} ${copy.sellableHealth.affectedServices.toLowerCase()}`,
                          }))
                    ).map((row) => (
                      <div className="text-sm" key={row.key}>
                        <p className="font-medium text-foreground">{row.name}</p>
                        <p className="text-muted-foreground">{row.note}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </WorkspacePanel>
        ) : null}

        {overviewTab === 'sku-levels' ? (
          <WorkspacePanel description={copy.skuLevels.description} title={copy.skuLevels.title}>
            <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
              <InputGroup className="xl:max-w-xl">
                <InputGroupAddon align="inline-start">
                  <InputGroupText>
                    <Search />
                  </InputGroupText>
                </InputGroupAddon>
                <InputGroupInput
                  aria-label={copy.skuLevels.searchLabel}
                  placeholder={copy.skuLevels.searchPlaceholder}
                  value={skuLevelsQuery}
                  onChange={(event) => setSkuLevelsQuery(event.target.value)}
                />
              </InputGroup>
              <ToggleGroup
                aria-label={copy.skuLevels.filtersLabel}
                type="single"
                value={skuLevelsFilter}
                onValueChange={(nextValue) => {
                  if (nextValue) {
                    setSkuLevelsFilter(nextValue as SkuLevelsFilter);
                  }
                }}
              >
                <ToggleGroupItem value="all">{t('filterAll')}</ToggleGroupItem>
                <ToggleGroupItem value="low-stock">{copy.status.lowStock}</ToggleGroupItem>
                <ToggleGroupItem value="out-of-stock">{copy.status.outOfStock}</ToggleGroupItem>
                <ToggleGroupItem value="affects-services">{copy.skuLevels.affectsServices}</ToggleGroupItem>
                <ToggleGroupItem value="no-service-impact">{copy.skuLevels.noServiceImpact}</ToggleGroupItem>
                <ToggleGroupItem value="recently-updated">{copy.skuLevels.recentlyUpdated}</ToggleGroupItem>
              </ToggleGroup>
            </div>

            <div className="rounded-3xl border border-border/70 bg-background/45 p-3">
              <Table>
                <TableHeader className="[&_th]:sticky [&_th]:top-0 [&_th]:z-10 [&_th]:bg-background">
                  <TableRow>
                    <TableHead>{t('skuLabel')}</TableHead>
                    <TableHead className="text-center">{t('fieldUnitsInStock')}</TableHead>
                    <TableHead>{t('inventoryColumnStatus')}</TableHead>
                    <TableHead className="text-center">{t('catalogLinkedServicesTitle')}</TableHead>
                    <TableHead className="text-center">{t('dashboardTotalValue')}</TableHead>
                    <TableHead>{copy.skuLevels.lastUpdated}</TableHead>
                    <TableHead className="text-center">{copy.skuLevels.action}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredSkuRows.map((row) => (
                    <TableRow key={row.sku.skuId}>
                      <TableCell className="min-w-0">
                        <Link className="group inline-flex min-w-0 flex-col" to={`/catalog/skus/${row.sku.skuId}`}>
                          <span className="truncate font-medium text-foreground group-hover:text-primary">
                            {row.sku.name}
                          </span>
                          <span className="truncate text-sm text-muted-foreground">{row.sku.skuId}</span>
                        </Link>
                      </TableCell>
                      <TableCell className="text-center">{formatNumber(row.sku.unitsInStock, language)}</TableCell>
                      <TableCell>
                        <Badge className="rounded-full" variant={badgeVariant(row.status)}>
                          {skuStatusLabel(row.status)}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-center">{formatNumber(row.linkedServiceCount, language)}</TableCell>
                      <TableCell className="text-center font-medium">
                        {formatCurrency(row.inventoryValue, currency, language)}
                      </TableCell>
                      <TableCell>{row.lastUpdated}</TableCell>
                      <TableCell className="text-center">
                        <Button asChild size="sm" variant="outline">
                          <Link to={`/catalog/skus/${row.sku.skuId}`}>{copy.actions.reviewSku}</Link>
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </WorkspacePanel>
        ) : null}

        {overviewTab === 'recent-activity' ? (
          <WorkspacePanel description={copy.recentActivity.description} title={copy.tabs.recentActivity}>
            <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
              <DescriptionText className="max-w-2xl text-sm leading-6 text-muted-foreground">
                {copy.recentActivity.body}
              </DescriptionText>
              <ToggleGroup
                aria-label={copy.recentActivity.filtersLabel}
                type="single"
                value={activityFilter}
                onValueChange={(nextValue) => {
                  if (nextValue) {
                    setActivityFilter(nextValue as RecentActivityFilter);
                  }
                }}
              >
                <ToggleGroupItem value="all">{t('filterAll')}</ToggleGroupItem>
                <ToggleGroupItem value="stock-changes">{copy.recentActivity.stockChanges}</ToggleGroupItem>
                <ToggleGroupItem value="service-updates">{copy.recentActivity.serviceUpdates}</ToggleGroupItem>
                <ToggleGroupItem value="price-changes">{copy.recentActivity.priceChanges}</ToggleGroupItem>
              </ToggleGroup>
            </div>

            {reportsLoading ? (
              <p className="text-sm text-muted-foreground">{t('overviewRecentActivityLoading')}</p>
            ) : reportsError ? (
              <div className="rounded-3xl border border-dashed border-border/70 bg-background/45 p-5 text-sm text-muted-foreground">
                {t('overviewRecentActivityFallback')}
              </div>
            ) : filteredActivity.length === 0 ? (
              <div className="rounded-3xl border border-dashed border-border/70 bg-background/45 p-5 text-sm text-muted-foreground">
                {t('overviewRecentActivityEmpty')}
              </div>
            ) : (
              <div className="divide-y divide-border/60 rounded-3xl border border-border/70 bg-background/45">
                {visibleActivity.map((row) => (
                  <div className="flex flex-col gap-3 px-5 py-4" key={row.report.reportId}>
                    <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
                      <div className="space-y-1">
                        <p className="text-sm font-medium text-foreground">
                          {reportDateLabel(row.report.reportedAt, language)}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          {t(stockReportSourceKey(row.report.reportSource))}
                        </p>
                      </div>
                      {row.preview ? (
                        <Badge className="rounded-full" variant="outline">
                          {row.preview}
                        </Badge>
                      ) : null}
                    </div>
                    <p className="text-sm text-foreground">{latestReportSummary(row.report, t)}</p>
                    <p className="text-sm text-muted-foreground">
                      {summarizeNotes(row.report.notes) ?? t('stockHistoryNoNotes')}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </WorkspacePanel>
        ) : null}
      </div>
    </WorkspacePage>
  );
}
