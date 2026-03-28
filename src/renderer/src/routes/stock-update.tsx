import { Link } from 'react-router-dom';
import type { StockReport } from '@shared/inventory';
import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
  WorkspacePanel,
} from '@/components/system/workspace';
import { formatCurrency, localeFor } from '@/lib/format';
import {
  rankingSignalCount,
  stockReportSourceKey,
  summarizeCount,
  summarizeNotes,
} from '@/lib/stock-report-summary';
import { useInventory } from '@/state/inventory';
import { useOperationsSession } from '@/state/operations-session';
import { usePreferences } from '@/state/preferences';

type ReportSourceFilter = 'all' | 'manual' | 'compat-stock-update' | 'legacy-baseline';

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

export function StockUpdateRoute() {
  const { snapshot, listStockReports } = useInventory();
  const { hasDraft } = useOperationsSession();
  const { currency, language, t } = usePreferences();
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [reports, setReports] = useState<StockReport[]>([]);
  const [expandedReportId, setExpandedReportId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [sourceFilter, setSourceFilter] = useState<ReportSourceFilter>('all');

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
    setHistoryLoading(true);
    setHistoryError(null);

    try {
      const nextReports = await listStockReports();
      setReports(
        [...nextReports].sort(
          (left, right) =>
            new Date(right.reportedAt).getTime() - new Date(left.reportedAt).getTime(),
        ),
      );
    } catch (error) {
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
      if (sourceFilter !== 'all' && report.reportSource !== sourceFilter) {
        return false;
      }
      if (!normalizedQuery) {
        return true;
      }

      return buildReportSearchText(report, skuNames, serviceNames).includes(normalizedQuery);
    });
  }, [reports, searchQuery, serviceNames, skuNames, sourceFilter]);

  const latestReport = reports[0] ?? null;
  const latestChangedRowCount = latestReport?.skuObservations.length ?? 0;

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
        action={
          <Button asChild>
            <Link to="/operations/session">
              {hasDraft ? t('operationsResumeSession') : t('operationsStartSession')}
            </Link>
          </Button>
        }
        description={t('operationsBody')}
        title={t('operationsTitle')}
      >
        <div className="grid gap-4 md:grid-cols-3">
          <div className="rounded-3xl border border-border/70 bg-card/55 p-4">
            <p className="text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
              {t('operationsSummaryLatestReport')}
            </p>
            <p className="mt-2 text-sm text-foreground">
              {latestReport
                ? new Intl.DateTimeFormat(localeFor(language), {
                    dateStyle: 'medium',
                    timeStyle: 'short',
                  }).format(new Date(latestReport.reportedAt))
                : t('operationsSummaryNone')}
            </p>
          </div>
          <div className="rounded-3xl border border-border/70 bg-card/55 p-4">
            <p className="text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
              {t('operationsSummarySavedUpdates')}
            </p>
            <p className="mt-2 text-sm text-foreground">{reports.length}</p>
          </div>
          <div className="rounded-3xl border border-border/70 bg-card/55 p-4">
            <p className="text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
              {t('operationsSummaryLatestChangeCount')}
            </p>
            <p className="mt-2 text-sm text-foreground">
              {latestReport
                ? summarizeCount(
                    latestChangedRowCount,
                    t('stockHistoryChangedRowSingular'),
                    t('stockHistoryChangedRowPlural'),
                  )
                : t('operationsSummaryNone')}
            </p>
          </div>
        </div>
      </WorkspacePanel>

      <WorkspacePanel
        description={t('operationsHistoryDescription')}
        title={t('operationsHistoryTitle')}
      >
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <div className="flex-1">
            <label className="sr-only" htmlFor="operations-history-search">
              {t('operationsSearchLabel')}
            </label>
            <Input
              id="operations-history-search"
              placeholder={t('operationsSearchPlaceholder')}
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
            />
          </div>
          <div className="flex flex-wrap gap-2">
            {(
              [
                ['all', t('operationsFilterAll')],
                ['manual', t('operationsFilterManual')],
                ['compat-stock-update', t('operationsFilterImported')],
                ['legacy-baseline', t('operationsFilterBaseline')],
              ] as Array<[ReportSourceFilter, string]>
            ).map(([value, label]) => (
              <Button
                key={value}
                type="button"
                variant={sourceFilter === value ? 'default' : 'outline'}
                onClick={() => setSourceFilter(value)}
              >
                {label}
              </Button>
            ))}
          </div>
        </div>

        {historyLoading ? (
          <p className="text-sm text-muted-foreground">{t('operationsHistoryLoading')}</p>
        ) : historyError ? (
          <div className="space-y-4">
            <p className="text-sm text-destructive">{historyError}</p>
            <Button asChild>
              <Link to="/operations/session">
                {hasDraft ? t('operationsResumeSession') : t('operationsStartSession')}
              </Link>
            </Button>
          </div>
        ) : reports.length === 0 ? (
          <WorkspaceEmpty
            action={
              <Button asChild>
                <Link to="/operations/session">
                  {hasDraft ? t('operationsResumeSession') : t('operationsStartSession')}
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
                setSourceFilter('all');
              }}
              >
                {t('operationsSearchClear')}
              </Button>
            }
            description={t('operationsHistoryNoResultsDescription')}
            title={t('operationsHistoryNoResultsTitle')}
          />
        ) : (
          <div className="overflow-hidden rounded-3xl border border-border/70 bg-card/55" data-testid="operations-history-ledger">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('stockReportedAt')}</TableHead>
                  <TableHead>{t('operationsHistorySourceColumn')}</TableHead>
                  <TableHead>{t('stockHistoryChangedRowPlural')}</TableHead>
                  <TableHead>{t('stockHistoryServiceFlagPlural')}</TableHead>
                  <TableHead>{t('stockHistoryPriceEditPlural')}</TableHead>
                  <TableHead>{t('stockHistoryRankingSignalPlural')}</TableHead>
                  <TableHead>{t('stockReportNotes')}</TableHead>
                  <TableHead className="text-right">{t('operationsInspectAction')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredReports.map((report) => {
                  const isExpanded = expandedReportId === report.reportId;
                  const serviceFlagCount = report.serviceSignals.filter(
                    (signal) => signal.stockout !== false,
                  ).length;
                  const merchandisingCount = rankingSignalCount(report);
                  const notesSnippet = summarizeNotes(report.notes) ?? t('stockHistoryNoNotes');

                  return (
                    <Fragment key={report.reportId}>
                      <TableRow data-state={isExpanded ? 'selected' : undefined} key={report.reportId}>
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
                        <TableCell className="align-top">
                          <Badge className="w-fit" variant="secondary">
                            {t(stockReportSourceKey(report.reportSource))}
                          </Badge>
                        </TableCell>
                        <TableCell className="align-top text-sm text-muted-foreground">
                          {summarizeCount(
                            report.skuObservations.length,
                            t('stockHistoryChangedRowSingular'),
                            t('stockHistoryChangedRowPlural'),
                          )}
                        </TableCell>
                        <TableCell className="align-top text-sm text-muted-foreground">
                          {summarizeCount(
                            serviceFlagCount,
                            t('stockHistoryServiceFlagSingular'),
                            t('stockHistoryServiceFlagPlural'),
                          )}
                        </TableCell>
                        <TableCell className="align-top text-sm text-muted-foreground">
                          {summarizeCount(
                            report.servicePriceAdjustments.length,
                            t('stockHistoryPriceEditSingular'),
                            t('stockHistoryPriceEditPlural'),
                          )}
                        </TableCell>
                        <TableCell className="align-top text-sm text-muted-foreground">
                          {summarizeCount(
                            merchandisingCount,
                            t('stockHistoryRankingSignalSingular'),
                            t('stockHistoryRankingSignalPlural'),
                          )}
                        </TableCell>
                        <TableCell className="max-w-72 align-top text-sm text-muted-foreground">
                          <span className="block truncate">{notesSnippet}</span>
                        </TableCell>
                        <TableCell className="text-right align-top">
                          <Button
                            size="sm"
                            type="button"
                            variant="ghost"
                            onClick={() =>
                              setExpandedReportId((current) =>
                                current === report.reportId ? null : report.reportId,
                              )
                            }
                          >
                            {isExpanded ? t('operationsInspectHide') : t('operationsInspectAction')}
                          </Button>
                        </TableCell>
                      </TableRow>

                      {isExpanded ? (
                        <TableRow data-testid="operations-history-detail">
                          <TableCell className="bg-background/40 py-4" colSpan={8}>
                            <div className="grid gap-4 lg:grid-cols-2">
                              <div className="grid gap-4">
                                <div className="rounded-2xl border border-border/60 bg-background/60 p-4">
                                  <p className="text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                                    {t('stockTableTitle')}
                                  </p>
                                  {report.skuObservations.length > 0 ? (
                                    <div className="mt-3 grid gap-3">
                                      {report.skuObservations.map((entry) => {
                                        const sku = skusById.get(entry.skuId);

                                        return (
                                          <div
                                            className="rounded-xl border border-border/60 bg-card/70 px-3 py-3"
                                            key={`${report.reportId}-${entry.skuId}`}
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
                                                  <Badge variant="outline">{t('stockRestockIncluded')}</Badge>
                                                ) : null}
                                                {entry.retailStockout ? (
                                                  <Badge variant="outline">{t('stockRetailStockout')}</Badge>
                                                ) : null}
                                              </div>
                                            </div>
                                            <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-sm text-muted-foreground">
                                              <span>{t('fieldUnitsInStock')}: {entry.unitsInStock}</span>
                                              <span>
                                                {t('fieldCostPerUnit')}: {formatCurrency(entry.costPerUnit, currency, language)}
                                              </span>
                                            </div>
                                            {entry.notes ? (
                                              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                                                {entry.notes}
                                              </p>
                                            ) : null}
                                          </div>
                                        );
                                      })}
                                    </div>
                                  ) : (
                                    <p className="mt-3 text-sm text-muted-foreground">
                                      {t('stockHistoryNoObservations')}
                                    </p>
                                  )}
                                </div>
                              </div>

                              <div className="grid gap-4">
                                <div className="rounded-2xl border border-border/60 bg-background/60 p-4">
                                  <p className="text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                                    {t('stockServiceSignalsTitle')}
                                  </p>
                                  {serviceFlagCount > 0 ? (
                                    <div className="mt-3 flex flex-wrap gap-2">
                                      {report.serviceSignals
                                        .filter((signal) => signal.stockout !== false)
                                        .map((signal) => (
                                          <Badge key={`${report.reportId}-${signal.serviceId}`} variant="outline">
                                            {servicesById.get(signal.serviceId)?.name ?? signal.serviceId}
                                          </Badge>
                                        ))}
                                    </div>
                                  ) : (
                                    <p className="mt-3 text-sm text-muted-foreground">{t('stockNoServiceSignals')}</p>
                                  )}
                                </div>

                                <div className="rounded-2xl border border-border/60 bg-background/60 p-4">
                                  <p className="text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                                    {t('stockServicePriceAdjustmentsTitle')}
                                  </p>
                                  {report.servicePriceAdjustments.length > 0 ? (
                                    <div className="mt-3 grid gap-3">
                                      {report.servicePriceAdjustments.map((adjustment) => (
                                        <div
                                          className="rounded-xl border border-border/60 bg-card/70 px-3 py-3"
                                          key={`${report.reportId}-${adjustment.serviceId}`}
                                        >
                                          <p className="font-medium text-foreground">
                                            {servicesById.get(adjustment.serviceId)?.name ?? adjustment.serviceId}
                                          </p>
                                          <p className="mt-1 text-sm text-muted-foreground">
                                            {formatCurrency(adjustment.price, currency, language)}
                                          </p>
                                        </div>
                                      ))}
                                    </div>
                                  ) : (
                                    <p className="mt-3 text-sm text-muted-foreground">{t('stockHistoryNoPriceEdits')}</p>
                                  )}
                                </div>

                                <div className="rounded-2xl border border-border/60 bg-background/60 p-4">
                                  <p className="text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                                    {t('stockRankingTitle')}
                                  </p>
                                  <div className="mt-3 grid gap-3">
                                    <div>
                                      <p className="text-sm font-medium text-foreground">{t('stockTopServiceRanking')}</p>
                                      {report.topServiceRanking.length > 0 ? (
                                        <div className="mt-2 flex flex-wrap gap-2">
                                          {report.topServiceRanking.map((serviceId) => (
                                            <Badge key={`${report.reportId}-${serviceId}`} variant="outline">
                                              {servicesById.get(serviceId)?.name ?? serviceId}
                                            </Badge>
                                          ))}
                                        </div>
                                      ) : (
                                        <p className="mt-2 text-sm text-muted-foreground">{t('stockHistoryNoRanking')}</p>
                                      )}
                                    </div>
                                    <div>
                                      <p className="text-sm font-medium text-foreground">{t('stockTopRetailRanking')}</p>
                                      {report.topRetailRanking.length > 0 ? (
                                        <div className="mt-2 flex flex-wrap gap-2">
                                          {report.topRetailRanking.map((skuId) => (
                                            <Badge key={`${report.reportId}-${skuId}`} variant="outline">
                                              {skusById.get(skuId)?.name ?? skuId}
                                            </Badge>
                                          ))}
                                        </div>
                                      ) : (
                                        <p className="mt-2 text-sm text-muted-foreground">{t('stockHistoryNoRanking')}</p>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              </div>
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
