import { Link, useSearchParams } from 'react-router-dom';
import type { InventorySnapshot, StockReport } from '@shared/inventory';
import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ChevronDown, ChevronUp, ClipboardPen, Eye, Flag, Play, Radio, Search, Triangle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  InputGroupText,
} from '@/components/ui/input-group';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  WorkspaceEmpty,
  WorkspacePage,
  WorkspacePageTitle,
  WorkspacePanel,
} from '@/components/system/workspace';
import { computeServiceSellableUnits } from '@/lib/catalog';
import { formatCurrency, localeFor } from '@/lib/format';
import {
  matchesRecentActivityFilter,
  type RecentActivityFilter,
} from '@/lib/recent-activity';
import {
  rankingSignalCount,
  summarizeCount,
  summarizeNotes,
} from '@/lib/stock-report-summary';
import { cn } from '@/lib/utils';
import { traceRenderer } from '@/lib/trace';
import { useInventory } from '@/state/inventory';
import {
  useOperationsSession,
  type OperationsSessionDraft,
  type OperationsSessionStepId,
} from '@/state/operations-session';
import { usePreferences } from '@/state/preferences';

function buildReportSearchText(report: StockReport, skuNames: Map<string, string>, serviceNames: Map<string, string>) {
  return [
    report.notes ?? '',
    ...report.skuObservations.flatMap((observation) => [
      observation.skuId,
      skuNames.get(observation.skuId) ?? '',
      observation.notes ?? '',
    ]),
    ...report.serviceSignals.flatMap((signal) => [
      signal.serviceId,
      serviceNames.get(signal.serviceId) ?? '',
    ]),
    ...report.servicePriceAdjustments.flatMap((adjustment) => [
      adjustment.serviceId,
      serviceNames.get(adjustment.serviceId) ?? '',
    ]),
    ...report.topServiceRanking.flatMap((serviceId) => [serviceId, serviceNames.get(serviceId) ?? '']),
    ...report.topRetailRanking.flatMap((skuId) => [skuId, skuNames.get(skuId) ?? '']),
  ]
    .join(' ')
    .toLowerCase();
}

function formatIncludesHint(name: string | null, t: ReturnType<typeof usePreferences>['t']) {
  return name ? `${t('operationsHistoryIncludes')} ${name}` : null;
}

function changedSkuPreviewName(
  report: StockReport,
  skusById: Map<string, InventorySnapshot['skus'][number]>,
  skuNames: Map<string, string>,
) {
  if (report.skuObservations.length === 0) {
    return null;
  }

  const topChangedSku = report.skuObservations.reduce((currentMax, observation) => {
    const currentSku = skusById.get(observation.skuId);
    const currentInventoryValue = currentSku ? currentSku.unitsInStock * currentSku.costPerUnit : 0;
    const observedInventoryValue = observation.unitsInStock * observation.costPerUnit;
    const absoluteDelta = Math.abs(observedInventoryValue - currentInventoryValue);

    if (!currentMax || absoluteDelta > currentMax.absoluteDelta) {
      return {
        absoluteDelta,
        skuId: observation.skuId,
      };
    }

    return currentMax;
  }, null as { absoluteDelta: number; skuId: string } | null);

  return topChangedSku ? (skuNames.get(topChangedSku.skuId) ?? topChangedSku.skuId) : null;
}

function serviceFlagPreviewName(
  report: StockReport,
  snapshot: InventorySnapshot,
  serviceNames: Map<string, string>,
) {
  const topFlaggedService = report.serviceSignals
    .filter((signal) => signal.stockout !== false)
    .reduce((currentMax, signal) => {
      const service = snapshot.services.find((entry) => entry.serviceId === signal.serviceId);
      if (!service) {
        return currentMax;
      }

      const potentialRevenueChange = Math.abs(service.price * computeServiceSellableUnits(service, snapshot));
      if (!currentMax || potentialRevenueChange > currentMax.potentialRevenueChange) {
        return {
          potentialRevenueChange,
          serviceId: signal.serviceId,
        };
      }

      return currentMax;
    }, null as { potentialRevenueChange: number; serviceId: string } | null);

  return topFlaggedService
    ? (serviceNames.get(topFlaggedService.serviceId) ?? topFlaggedService.serviceId)
    : null;
}

function priceEditPreviewName(
  report: StockReport,
  servicesById: Map<string, InventorySnapshot['services'][number]>,
  serviceNames: Map<string, string>,
) {
  const topPriceEditedService = report.servicePriceAdjustments.reduce((currentMax, adjustment) => {
    const service = servicesById.get(adjustment.serviceId);
    if (!service) {
      return currentMax;
    }

    const absolutePriceChange = Math.abs(adjustment.price - service.price);
    if (!currentMax || absolutePriceChange > currentMax.absolutePriceChange) {
      return {
        absolutePriceChange,
        serviceId: adjustment.serviceId,
      };
    }

    return currentMax;
  }, null as { absolutePriceChange: number; serviceId: string } | null);

  return topPriceEditedService
    ? (serviceNames.get(topPriceEditedService.serviceId) ?? topPriceEditedService.serviceId)
    : null;
}

function formatReportCount(count: number, t: ReturnType<typeof usePreferences>['t']) {
  return summarizeCount(count, t('operationsReportSingular'), t('operationsReportPlural'));
}

function observationBadgeClass(
  state: 'restock' | 'stockout' | 'units-up' | 'units-down' | 'price-up' | 'price-down',
) {
  switch (state) {
    case 'restock':
      return 'border-emerald-200 bg-emerald-50 text-emerald-800';
    case 'stockout':
      return 'border-rose-200 bg-rose-50 text-rose-800';
    case 'units-up':
      return 'border-sky-200 bg-sky-50 text-sky-800';
    case 'units-down':
      return 'border-amber-200 bg-amber-50 text-amber-800';
    case 'price-up':
      return 'border-violet-200 bg-violet-50 text-violet-800';
    case 'price-down':
      return 'border-fuchsia-200 bg-fuchsia-50 text-fuchsia-800';
    default:
      return '';
  }
}

function titleCaseLabel(label: string) {
  return label.replace(/\b\p{L}/gu, (character) => character.toUpperCase());
}

function activityFilterLabel(
  filter: RecentActivityFilter,
  t: ReturnType<typeof usePreferences>['t'],
) {
  switch (filter) {
    case 'stock-changes':
      return t('operationsFilterStockChanges').toLowerCase();
    case 'service-updates':
      return t('operationsFilterServiceUpdates').toLowerCase();
    case 'price-changes':
      return t('operationsFilterPriceChanges').toLowerCase();
    case 'all':
    default:
      return null;
  }
}

function countDraftChangedRows(snapshot: InventorySnapshot, draft: OperationsSessionDraft) {
  return snapshot.skus.filter((sku) => {
    const row = draft.rows[sku.skuId];
    if (!row) {
      return false;
    }

    return (
      Number(row.unitsInStock) !== sku.unitsInStock ||
      Number(row.costPerUnit) !== sku.costPerUnit ||
      row.restockIncluded ||
      row.retailStockout ||
      row.notes.trim().length > 0
    );
  }).length;
}

function countDraftServiceChanges(snapshot: InventorySnapshot, draft: OperationsSessionDraft) {
  return snapshot.services.filter((service) => {
    const serviceDraft = draft.serviceDrafts[service.serviceId];
    if (!serviceDraft) {
      return false;
    }

    return serviceDraft.stockout || Number(serviceDraft.price) !== service.price;
  }).length;
}

function operationsResumeStepKey(lastStep: OperationsSessionStepId) {
  switch (lastStep) {
    case 'review':
      return 'operationsResumeReview';
    case 'services':
      return 'operationsResumeServices';
    case 'observations':
      return 'operationsResumeObservations';
    case 'details':
    default:
      return 'operationsResumeDetails';
  }
}

function buildOperationsDraftSummary(
  changedRowCount: number,
  changedServiceCount: number,
  t: ReturnType<typeof usePreferences>['t'],
) {
  const parts: string[] = [];

  if (changedRowCount > 0) {
    parts.push(
      summarizeCount(
        changedRowCount,
        t('stockHistoryChangedRowSingular'),
        t('stockHistoryChangedRowPlural'),
      ),
    );
  }

  if (changedServiceCount > 0) {
    parts.push(
      summarizeCount(
        changedServiceCount,
        t('operationsResumeServiceChangeSingular'),
        t('operationsResumeServiceChangePlural'),
      ),
    );
  }

  if (parts.length === 0) {
    return t('operationsResumeSummaryEmpty');
  }

  return `${parts.join(' • ')} ${t('operationsResumeSummaryQueued')}`;
}

function OperationsSessionButtonLabel({
  isResume,
  t,
}: {
  isResume: boolean;
  t: ReturnType<typeof usePreferences>['t'];
}) {
  if (isResume) {
    return (
      <>
        <Play data-icon="inline-start" />
        {t('operationsResumeSession')}
      </>
    );
  }

  return (
    <>
      <ClipboardPen data-icon="inline-start" />
      {t('operationsStartSession')}
    </>
  );
}

function OperationsSessionAction({
  hasDraft,
  statusLine,
  t,
}: {
  hasDraft: boolean;
  statusLine?: string | null;
  t: ReturnType<typeof usePreferences>['t'];
}) {
  return (
    <div className="flex flex-col items-start gap-2">
      <Button asChild>
        <Link to="/operations/session">
          <OperationsSessionButtonLabel isResume={hasDraft} t={t} />
        </Link>
      </Button>
      {hasDraft && statusLine ? (
        <p className="max-w-56 text-xs leading-5 text-muted-foreground" data-testid="operations-draft-status">
          {statusLine}
        </p>
      ) : null}
    </div>
  );
}

function OperationsLedgerSummaryCell({
  summary,
  preview,
}: {
  summary: string;
  preview?: string | null;
}) {
  return (
    <TableCell className="align-top text-sm text-muted-foreground">
      <p>{summary}</p>
      {preview ? <p className="mt-1 text-xs leading-5 text-foreground/75">{preview}</p> : null}
    </TableCell>
  );
}

function OperationsDetailSection({
  icon: Icon,
  title,
  children,
}: {
  icon: typeof Eye;
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="space-y-3">
      <p className="flex items-center gap-2 text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
        <Icon className="size-3.5" />
        {title}
      </p>
      {children}
    </section>
  );
}

export function StockUpdateRoute() {
  const { snapshot, listStockReports } = useInventory();
  const { draft, hasDraft } = useOperationsSession();
  const { currency, language, t } = usePreferences();
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [reports, setReports] = useState<StockReport[]>([]);
  const [expandedReportId, setExpandedReportId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [activityFilter, setActivityFilter] = useState<RecentActivityFilter>('all');
  const [searchParams, setSearchParams] = useSearchParams();
  const [pendingHistoryFocus] = useState(() => ({
    reportId: searchParams.get('reportId'),
    focusSku: searchParams.get('focusSku'),
    focusService: searchParams.get('focusService'),
  }));
  const focusedObservationRef = useRef<HTMLDivElement | null>(null);
  const appliedHistoryFocusRef = useRef(false);
  const [focusedObservationKey, setFocusedObservationKey] = useState<string | null>(null);

  const servicesById = useMemo(
    () => new Map(snapshot?.services.map((service) => [service.serviceId, service]) ?? []),
    [snapshot],
  );
  const skusById = useMemo(
    () => new Map(snapshot?.skus.map((sku) => [sku.skuId, sku]) ?? []),
    [snapshot],
  );
  const serviceNames = useMemo(
    () => new Map(snapshot?.services.map((service) => [service.serviceId, service.name]) ?? []),
    [snapshot],
  );
  const skuNames = useMemo(
    () => new Map(snapshot?.skus.map((sku) => [sku.skuId, sku.name]) ?? []),
    [snapshot],
  );

  const loadReports = useCallback(async () => {
    traceRenderer('stock-update', 'history-load-start', {
      source: 'StockUpdateRoute.loadReports',
    });
    setHistoryLoading(true);
    setHistoryError(null);

    try {
      const nextReports = await listStockReports();
      traceRenderer('stock-update', 'history-load-success', {
        count: nextReports.length,
      });
      setReports(
        [...nextReports].sort(
          (left, right) =>
            new Date(right.reportedAt).getTime() - new Date(left.reportedAt).getTime(),
        ),
      );
    } catch (error) {
      traceRenderer('stock-update', 'history-load-error', {
        error: error instanceof Error ? error.message : t('apiUnavailable'),
      });
      setHistoryError(error instanceof Error ? error.message : t('apiUnavailable'));
    } finally {
      setHistoryLoading(false);
    }
  }, [listStockReports, t]);

  useEffect(() => {
    void loadReports();
  }, [loadReports]);

  const filteredReports = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase();

    return reports.filter((report) => {
      if (!matchesRecentActivityFilter(report, activityFilter)) {
        return false;
      }
      if (!normalizedQuery) {
        return true;
      }

      return buildReportSearchText(report, skuNames, serviceNames).includes(normalizedQuery);
    });
  }, [activityFilter, reports, searchQuery, serviceNames, skuNames]);

  const normalizedSearchQuery = searchQuery.trim();
  const draftChangedRowCount = snapshot && draft ? countDraftChangedRows(snapshot, draft) : 0;
  const draftChangedServiceCount = snapshot && draft ? countDraftServiceChanges(snapshot, draft) : 0;
  const draftStatusLine =
    draft && hasDraft
      ? `${t(operationsResumeStepKey(draft.lastStep))}. ${buildOperationsDraftSummary(
          draftChangedRowCount,
          draftChangedServiceCount,
          t,
        )}`
      : null;
  const activeActivityFilterLabel = activityFilterLabel(activityFilter, t);
  const historyResultsSummary =
    filteredReports.length === 0 && normalizedSearchQuery
      ? `${t('operationsResultsNoneMatch')} "${normalizedSearchQuery}"`
      : activityFilter === 'all'
          ? `${t('operationsResultsShowing')} ${formatReportCount(filteredReports.length, t)}`
          : `${t('operationsResultsShowing')} ${formatReportCount(filteredReports.length, t)} that include ${activeActivityFilterLabel}`;

  useEffect(() => {
    if (!pendingHistoryFocus.reportId && !pendingHistoryFocus.focusSku && !pendingHistoryFocus.focusService) {
      return;
    }

    const nextParams = new URLSearchParams(searchParams);
    nextParams.delete('reportId');
    nextParams.delete('focusSku');
    nextParams.delete('focusService');
    setSearchParams(nextParams, { replace: true });
  }, [pendingHistoryFocus, searchParams, setSearchParams]);

  useEffect(() => {
    if (!pendingHistoryFocus.reportId || appliedHistoryFocusRef.current) {
      return;
    }

    const reportExists = reports.some((report) => report.reportId === pendingHistoryFocus.reportId);
    if (!reportExists) {
      return;
    }

    setExpandedReportId(pendingHistoryFocus.reportId);
    setFocusedObservationKey(
      pendingHistoryFocus.focusSku
        ? `${pendingHistoryFocus.reportId}:sku:${pendingHistoryFocus.focusSku}`
        : pendingHistoryFocus.focusService
          ? `${pendingHistoryFocus.reportId}:service:${pendingHistoryFocus.focusService}`
          : null,
    );
    appliedHistoryFocusRef.current = true;
  }, [pendingHistoryFocus, reports]);

  useEffect(() => {
    if (!focusedObservationKey) {
      return;
    }
    const [focusedReportId] = focusedObservationKey.split(':');
    if (expandedReportId !== focusedReportId) {
      return;
    }

    focusedObservationRef.current?.scrollIntoView({ block: 'center' });
  }, [expandedReportId, focusedObservationKey]);

  if (!snapshot) {
    return (
      <WorkspacePage>
        <WorkspaceEmpty description={t('apiUnavailable')} title={t('operationsTitle')} />
      </WorkspacePage>
    );
  }

  return (
    <WorkspacePage>
      <WorkspacePanel
        action={<OperationsSessionAction hasDraft={hasDraft} statusLine={draftStatusLine} t={t} />}
        description={t('operationsBody')}
        title={<WorkspacePageTitle>{t('operationsTitle')}</WorkspacePageTitle>}
      >
        <div className="grid gap-4">
          <InputGroup className="h-12 rounded-full">
            <InputGroupAddon className="pl-4 text-muted-foreground" align="inline-start">
              <InputGroupText>
                <Search />
              </InputGroupText>
            </InputGroupAddon>
            <InputGroupInput
              aria-label={t('operationsSearchLabel')}
              id="operations-history-search"
              placeholder={t('operationsSearchPlaceholder')}
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
            />
          </InputGroup>
          <ToggleGroup
            aria-label={t('operationsFiltersLabel')}
            onValueChange={(nextValue) => {
              if (nextValue) {
                setActivityFilter(nextValue as RecentActivityFilter);
              }
            }}
            spacing={1}
            type="single"
            value={activityFilter}
          >
            <ToggleGroupItem value="all">{t('operationsFilterEverything')}</ToggleGroupItem>
            <ToggleGroupItem value="stock-changes">{t('operationsFilterStockChanges')}</ToggleGroupItem>
            <ToggleGroupItem value="service-updates">{t('operationsFilterServiceUpdates')}</ToggleGroupItem>
            <ToggleGroupItem value="price-changes">{t('operationsFilterPriceChanges')}</ToggleGroupItem>
          </ToggleGroup>
        </div>
      </WorkspacePanel>

      <WorkspacePanel
        description={t('operationsHistoryDescription')}
        title={t('operationsHistoryTitle')}
      >
        <p className="text-sm text-muted-foreground" data-testid="operations-history-results-summary">
          {historyResultsSummary}
        </p>

        {historyLoading ? (
          <p className="text-sm text-muted-foreground">{t('operationsHistoryLoading')}</p>
        ) : historyError ? (
          <div className="space-y-4">
            <p className="text-sm text-destructive">{historyError}</p>
            <Button asChild>
              <Link to="/operations/session">
                <OperationsSessionButtonLabel isResume={hasDraft} t={t} />
              </Link>
            </Button>
          </div>
        ) : reports.length === 0 ? (
          <WorkspaceEmpty
            action={
              <Button asChild>
                <Link to="/operations/session">
                  <OperationsSessionButtonLabel isResume={hasDraft} t={t} />
                </Link>
              </Button>
            }
            description={t('operationsHistoryEmptyDescription')}
            title={t('operationsHistoryEmptyTitle')}
          />
        ) : filteredReports.length === 0 ? (
          <WorkspaceEmpty
            action={
              <Button type="button" variant="outline" onClick={() => {
                setSearchQuery('');
                setActivityFilter('all');
              }}
              >
                {t('operationsSearchClear')}
              </Button>
            }
            description={t('operationsHistoryNoResultsDescription')}
            title={t('operationsHistoryNoResultsTitle')}
          />
        ) : (
          <div
            className="overflow-hidden rounded-3xl border border-border/70 bg-card/55 p-2"
            data-testid="operations-history-ledger"
          >
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{titleCaseLabel(t('stockReportedAt'))}</TableHead>
                  <TableHead>{titleCaseLabel(t('stockHistoryChangedRowPlural'))}</TableHead>
                  <TableHead>{titleCaseLabel(t('stockHistoryServiceFlagPlural'))}</TableHead>
                  <TableHead>{titleCaseLabel(t('stockHistoryPriceEditPlural'))}</TableHead>
                  <TableHead>{titleCaseLabel(t('stockHistoryRankingSignalPlural'))}</TableHead>
                  <TableHead>{titleCaseLabel(t('stockReportNotes'))}</TableHead>
                  <TableHead aria-hidden="true" className="w-24 text-right" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredReports.map((report) => {
                  const isExpanded = expandedReportId === report.reportId;
                  const serviceFlagCount = report.serviceSignals.filter(
                    (signal) => signal.stockout !== false,
                  ).length;
                  const merchandisingCount = rankingSignalCount(report);
                  const notesSnippet = summarizeNotes(report.notes) ?? '-';
                  const firstChangedSkuName = changedSkuPreviewName(report, skusById, skuNames);
                  const firstFlaggedServiceName = serviceFlagPreviewName(report, snapshot, serviceNames);
                  const firstPriceEditedServiceName = priceEditPreviewName(report, servicesById, serviceNames);

                  return (
                    <Fragment key={report.reportId}>
                      <TableRow
                        className={isExpanded ? 'hover:bg-muted' : undefined}
                        data-state={isExpanded ? 'selected' : undefined}
                        key={report.reportId}
                      >
                        <TableCell className="align-top">
                          <div className="min-w-36">
                            <p className="font-medium text-foreground">
                              {new Intl.DateTimeFormat(localeFor(language), {
                                dateStyle: 'medium',
                                timeStyle: 'short',
                              }).format(new Date(report.reportedAt))}
                            </p>
                          </div>
                        </TableCell>
                        <OperationsLedgerSummaryCell
                          preview={
                            report.skuObservations.length > 0
                              ? formatIncludesHint(firstChangedSkuName, t)
                              : null
                          }
                          summary={
                            report.skuObservations.length > 0
                              ? summarizeCount(
                                  report.skuObservations.length,
                                  t('stockHistoryChangedRowSingular'),
                                  t('stockHistoryChangedRowPlural'),
                                )
                              : '-'
                          }
                        />
                        <OperationsLedgerSummaryCell
                          preview={serviceFlagCount > 0 ? formatIncludesHint(firstFlaggedServiceName, t) : null}
                          summary={
                            serviceFlagCount > 0
                              ? summarizeCount(
                                  serviceFlagCount,
                                  t('stockHistoryServiceFlagSingular'),
                                  t('stockHistoryServiceFlagPlural'),
                                )
                              : '-'
                          }
                        />
                        <OperationsLedgerSummaryCell
                          preview={
                            report.servicePriceAdjustments.length > 0
                              ? formatIncludesHint(firstPriceEditedServiceName, t)
                              : null
                          }
                          summary={
                            report.servicePriceAdjustments.length > 0
                              ? summarizeCount(
                                  report.servicePriceAdjustments.length,
                                  t('stockHistoryPriceEditSingular'),
                                  t('stockHistoryPriceEditPlural'),
                                )
                              : '-'
                          }
                        />
                        <TableCell className="align-top text-sm text-muted-foreground">
                          {merchandisingCount > 0
                            ? summarizeCount(
                                merchandisingCount,
                                t('stockHistoryRankingSignalSingular'),
                                t('stockHistoryRankingSignalPlural'),
                              )
                            : '-'}
                        </TableCell>
                        <TableCell className="max-w-72 align-top text-sm text-muted-foreground">
                          <span className="block truncate">{notesSnippet}</span>
                        </TableCell>
                        <TableCell className="text-right align-top">
                          <Button
                            aria-label={isExpanded ? t('operationsInspectHide') : t('operationsInspectAction')}
                            size="sm"
                            type="button"
                            variant="ghost"
                            onClick={() =>
                              setExpandedReportId((current) => {
                                setFocusedObservationKey(null);
                                return current === report.reportId ? null : report.reportId;
                              })
                            }
                          >
                            {isExpanded ? <ChevronUp aria-hidden="true" /> : <ChevronDown aria-hidden="true" />}
                          </Button>
                        </TableCell>
                      </TableRow>

                      {isExpanded ? (
                        <TableRow className="hover:bg-transparent" data-testid="operations-history-detail">
                          <TableCell className="bg-background/40 py-4" colSpan={7}>
                            <div className="space-y-5">
                              <OperationsDetailSection icon={Flag} title={t('stockServiceSignalsTitle')}>
                                {serviceFlagCount > 0 || report.servicePriceAdjustments.length > 0 ? (
                                  <div className="divide-y divide-border/60 rounded-2xl border border-border/60 bg-background/55">
                                    {report.serviceSignals
                                      .filter((signal) => signal.stockout !== false)
                                      .map((signal) => {
                                        const isFocusedService =
                                          focusedObservationKey === `${report.reportId}:service:${signal.serviceId}`;

                                        return (
                                          <div
                                            className={cn(
                                              'flex flex-wrap items-center justify-between gap-3 px-4 py-3',
                                              isFocusedService && 'bg-amber-50/80 ring-1 ring-amber-300',
                                            )}
                                            data-testid={isFocusedService ? 'operations-history-focused-service' : undefined}
                                            key={`${report.reportId}-${signal.serviceId}-flag`}
                                            ref={isFocusedService ? focusedObservationRef : null}
                                          >
                                            <div>
                                              <p className="font-medium text-foreground">
                                                {servicesById.get(signal.serviceId)?.name ?? signal.serviceId}
                                              </p>
                                              <p className="text-sm text-muted-foreground">{t('stockServiceStockoutToggle')}</p>
                                            </div>
                                            <Badge variant="outline">{t('stockRetailStockout')}</Badge>
                                          </div>
                                        );
                                      })}
                                    {report.servicePriceAdjustments.map((adjustment) => {
                                      const isFocusedService =
                                        focusedObservationKey === `${report.reportId}:service:${adjustment.serviceId}`;

                                      return (
                                        <div
                                          className={cn(
                                            'flex flex-wrap items-center justify-between gap-3 px-4 py-3',
                                            isFocusedService && 'bg-amber-50/80 ring-1 ring-amber-300',
                                          )}
                                          data-testid={isFocusedService ? 'operations-history-focused-service' : undefined}
                                          key={`${report.reportId}-${adjustment.serviceId}-price`}
                                          ref={isFocusedService ? focusedObservationRef : null}
                                        >
                                          <div>
                                            <p className="font-medium text-foreground">
                                              {servicesById.get(adjustment.serviceId)?.name ?? adjustment.serviceId}
                                            </p>
                                            <p className="text-sm text-muted-foreground">
                                              {t('stockServicePriceAdjustmentsTitle')}
                                            </p>
                                          </div>
                                          <p className="text-sm text-muted-foreground">
                                            {formatCurrency(adjustment.price, currency, language)}
                                          </p>
                                        </div>
                                      );
                                    })}
                                  </div>
                                ) : (
                                  <p className="text-sm text-muted-foreground">{t('stockNoServiceSignals')}</p>
                                )}
                              </OperationsDetailSection>

                              <OperationsDetailSection icon={Radio} title={t('stockRankingTitle')}>
                                {report.topServiceRanking.length > 0 || report.topRetailRanking.length > 0 ? (
                                  <div className="divide-y divide-border/60 rounded-2xl border border-border/60 bg-background/55">
                                    <div className="space-y-2 px-4 py-3">
                                      <p className="text-sm font-medium text-foreground">{t('stockTopServiceRanking')}</p>
                                      {report.topServiceRanking.length > 0 ? (
                                        <div className="flex flex-wrap gap-2">
                                          {report.topServiceRanking.map((serviceId) => (
                                            <Badge key={`${report.reportId}-${serviceId}`} variant="outline">
                                              {servicesById.get(serviceId)?.name ?? serviceId}
                                            </Badge>
                                          ))}
                                        </div>
                                      ) : (
                                        <p className="text-sm text-muted-foreground">{t('stockHistoryNoRanking')}</p>
                                      )}
                                    </div>
                                    <div className="space-y-2 px-4 py-3">
                                      <p className="text-sm font-medium text-foreground">{t('stockTopRetailRanking')}</p>
                                      {report.topRetailRanking.length > 0 ? (
                                        <div className="flex flex-wrap gap-2">
                                          {report.topRetailRanking.map((skuId) => (
                                            <Badge key={`${report.reportId}-${skuId}`} variant="outline">
                                              {skusById.get(skuId)?.name ?? skuId}
                                            </Badge>
                                          ))}
                                        </div>
                                      ) : (
                                        <p className="text-sm text-muted-foreground">{t('stockHistoryNoRanking')}</p>
                                      )}
                                    </div>
                                  </div>
                                ) : (
                                  <p className="text-sm text-muted-foreground">{t('stockHistoryNoRanking')}</p>
                                )}
                              </OperationsDetailSection>

                              <OperationsDetailSection icon={Eye} title={t('stockTableTitle')}>
                                {report.skuObservations.length > 0 ? (
                                  <div className="divide-y divide-border/60 rounded-2xl border border-border/60 bg-background/55">
                                    {report.skuObservations.map((entry) => {
                                      const sku = skusById.get(entry.skuId);
                                      const isFocusedObservation =
                                        focusedObservationKey === `${report.reportId}:sku:${entry.skuId}`;
                                      const unitsDirection =
                                        sku == null
                                          ? null
                                          : entry.unitsInStock > sku.unitsInStock
                                            ? 'up'
                                            : entry.unitsInStock < sku.unitsInStock
                                              ? 'down'
                                              : null;
                                      const priceDirection =
                                        sku == null
                                          ? null
                                          : entry.costPerUnit > sku.costPerUnit
                                            ? 'up'
                                            : entry.costPerUnit < sku.costPerUnit
                                              ? 'down'
                                              : null;

                                      return (
                                        <div
                                          className={cn(
                                            'space-y-2 px-4 py-3',
                                            isFocusedObservation && 'bg-amber-50/80 ring-1 ring-amber-300',
                                          )}
                                          data-testid={isFocusedObservation ? 'operations-history-focused-observation' : undefined}
                                          key={`${report.reportId}-${entry.skuId}`}
                                          ref={isFocusedObservation ? focusedObservationRef : null}
                                        >
                                          <div className="flex flex-wrap items-start justify-between gap-3">
                                            <div className="min-w-0">
                                              <p className="font-medium text-foreground">
                                                {sku?.name ?? entry.skuId}
                                              </p>
                                              <p className="text-sm text-muted-foreground">{entry.skuId}</p>
                                            </div>
                                            <div className="flex flex-wrap items-center gap-2">
                                              {entry.restockIncluded ? (
                                                <Badge className={observationBadgeClass('restock')} variant="outline">
                                                  {t('stockRestockIncluded')}
                                                </Badge>
                                              ) : null}
                                              {entry.retailStockout ? (
                                                <Badge className={observationBadgeClass('stockout')} variant="outline">
                                                  {t('stockRetailStockout')}
                                                </Badge>
                                              ) : null}
                                              {unitsDirection === 'up' ? (
                                                <Badge className={observationBadgeClass('units-up')} variant="outline">
                                                  Units
                                                  <Triangle className="!size-2 fill-current" />
                                                </Badge>
                                              ) : null}
                                              {unitsDirection === 'down' ? (
                                                <Badge className={observationBadgeClass('units-down')} variant="outline">
                                                  Units
                                                  <Triangle className="!size-2 fill-current rotate-180" />
                                                </Badge>
                                              ) : null}
                                              {priceDirection === 'up' ? (
                                                <Badge className={observationBadgeClass('price-up')} variant="outline">
                                                  Prices
                                                  <Triangle className="!size-2 fill-current" />
                                                </Badge>
                                              ) : null}
                                              {priceDirection === 'down' ? (
                                                <Badge className={observationBadgeClass('price-down')} variant="outline">
                                                  Prices
                                                  <Triangle className="!size-2 fill-current rotate-180" />
                                                </Badge>
                                              ) : null}
                                            </div>
                                          </div>
                                          <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm text-muted-foreground">
                                            <span>{t('fieldUnitsInStock')}: {entry.unitsInStock}</span>
                                            <span>
                                              {t('fieldCostPerUnit')}: {formatCurrency(entry.costPerUnit, currency, language)}
                                            </span>
                                          </div>
                                          {entry.notes ? (
                                            <p className="text-sm leading-6 text-muted-foreground">{entry.notes}</p>
                                          ) : null}
                                        </div>
                                      );
                                    })}
                                  </div>
                                ) : (
                                  <p className="text-sm text-muted-foreground">{t('stockHistoryNoObservations')}</p>
                                )}
                              </OperationsDetailSection>
                            </div>
                          </TableCell>
                        </TableRow>
                      ) : null}
                    </Fragment>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </WorkspacePanel>
    </WorkspacePage>
  );
}
