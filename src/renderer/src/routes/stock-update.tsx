import { Link } from 'react-router-dom';
import type { InventorySnapshot, StockReport } from '@shared/inventory';
import { Fragment, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
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
import {
  useOperationsSession,
  type OperationsSessionDraft,
  type OperationsSessionStepId,
} from '@/state/operations-session';
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

function formatIncludesHint(name: string | null, t: ReturnType<typeof usePreferences>['t']) {
  return name ? `${t('operationsHistoryIncludes')} ${name}` : null;
}

function formatReportCount(count: number, t: ReturnType<typeof usePreferences>['t']) {
  return summarizeCount(count, t('operationsReportSingular'), t('operationsReportPlural'));
}

function titleCaseLabel(label: string) {
  return label.replace(/\b\p{L}/gu, (character) => character.toUpperCase());
}

function sourceFilterLabel(
  sourceFilter: ReportSourceFilter,
  t: ReturnType<typeof usePreferences>['t'],
) {
  switch (sourceFilter) {
    case 'manual':
      return t('operationsFilterManual').toLowerCase();
    case 'compat-stock-update':
      return t('operationsFilterImported').toLowerCase();
    case 'legacy-baseline':
      return t('operationsFilterBaseline').toLowerCase();
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

function countDraftServiceChanges(
  snapshot: InventorySnapshot,
  draft: OperationsSessionDraft,
) {
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
          {hasDraft ? t('operationsResumeSession') : t('operationsStartSession')}
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
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="space-y-3">
      <p className="text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
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
  const activeSourceFilterLabel = sourceFilterLabel(sourceFilter, t);
  const historyResultsSummary =
    filteredReports.length === 0 && normalizedSearchQuery
      ? `${t('operationsResultsNoneMatch')} "${normalizedSearchQuery}"`
      : filteredReports.length === 0 && sourceFilter !== 'all'
        ? `${t('operationsResultsShowing')} 0 ${activeSourceFilterLabel} ${t('operationsReportPlural')}`
        : sourceFilter === 'all'
          ? `${t('operationsResultsShowing')} ${formatReportCount(filteredReports.length, t)}`
          : `${t('operationsResultsShowing')} ${filteredReports.length} ${activeSourceFilterLabel} ${filteredReports.length === 1 ? t('operationsReportSingular') : t('operationsReportPlural')}`;

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
          <div
            className="overflow-hidden rounded-3xl border border-border/70 bg-card/55 p-2"
            data-testid="operations-history-ledger"
          >
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{titleCaseLabel(t('stockReportedAt'))}</TableHead>
                  <TableHead>{titleCaseLabel(t('operationsHistorySourceColumn'))}</TableHead>
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
                  const notesSnippet = summarizeNotes(report.notes) ?? t('stockHistoryNoNotes');
                  const firstChangedSkuName =
                    report.skuObservations.length > 0
                      ? (skuNames.get(report.skuObservations[0]?.skuId) ?? report.skuObservations[0]?.skuId)
                      : null;
                  const firstFlaggedServiceName =
                    serviceFlagCount > 0
                      ? (() => {
                          const firstFlaggedService = report.serviceSignals.find(
                            (signal) => signal.stockout !== false,
                          );
                          return firstFlaggedService
                            ? (serviceNames.get(firstFlaggedService.serviceId) ?? firstFlaggedService.serviceId)
                            : null;
                        })()
                      : null;
                  const firstPriceEditedServiceName =
                    report.servicePriceAdjustments.length > 0
                      ? (serviceNames.get(report.servicePriceAdjustments[0]?.serviceId) ??
                        report.servicePriceAdjustments[0]?.serviceId)
                      : null;

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
                        <OperationsLedgerSummaryCell
                          preview={formatIncludesHint(firstChangedSkuName, t)}
                          summary={summarizeCount(
                            report.skuObservations.length,
                            t('stockHistoryChangedRowSingular'),
                            t('stockHistoryChangedRowPlural'),
                          )}
                        />
                        <OperationsLedgerSummaryCell
                          preview={formatIncludesHint(firstFlaggedServiceName, t)}
                          summary={summarizeCount(
                            serviceFlagCount,
                            t('stockHistoryServiceFlagSingular'),
                            t('stockHistoryServiceFlagPlural'),
                          )}
                        />
                        <OperationsLedgerSummaryCell
                          preview={formatIncludesHint(firstPriceEditedServiceName, t)}
                          summary={summarizeCount(
                            report.servicePriceAdjustments.length,
                            t('stockHistoryPriceEditSingular'),
                            t('stockHistoryPriceEditPlural'),
                          )}
                        />
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
                            aria-label={isExpanded ? t('operationsInspectHide') : t('operationsInspectAction')}
                            size="sm"
                            type="button"
                            variant="ghost"
                            onClick={() =>
                              setExpandedReportId((current) =>
                                current === report.reportId ? null : report.reportId,
                              )
                            }
                          >
                            {isExpanded ? <ChevronUp aria-hidden="true" /> : <ChevronDown aria-hidden="true" />}
                          </Button>
                        </TableCell>
                      </TableRow>

                      {isExpanded ? (
                        <TableRow data-testid="operations-history-detail">
                          <TableCell className="bg-background/40 py-4" colSpan={8}>
                            <div className="space-y-5">
                              <OperationsDetailSection title={t('stockTableTitle')}>
                                {report.skuObservations.length > 0 ? (
                                  <div className="divide-y divide-border/60 rounded-2xl border border-border/60 bg-background/55">
                                    {report.skuObservations.map((entry) => {
                                      const sku = skusById.get(entry.skuId);

                                      return (
                                        <div
                                          className="space-y-2 px-4 py-3"
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

                              <OperationsDetailSection title={t('stockServiceSignalsTitle')}>
                                {serviceFlagCount > 0 || report.servicePriceAdjustments.length > 0 ? (
                                  <div className="divide-y divide-border/60 rounded-2xl border border-border/60 bg-background/55">
                                    {report.serviceSignals
                                      .filter((signal) => signal.stockout !== false)
                                      .map((signal) => (
                                        <div
                                          className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
                                          key={`${report.reportId}-${signal.serviceId}-flag`}
                                        >
                                          <div>
                                            <p className="font-medium text-foreground">
                                              {servicesById.get(signal.serviceId)?.name ?? signal.serviceId}
                                            </p>
                                            <p className="text-sm text-muted-foreground">{t('stockServiceStockoutToggle')}</p>
                                          </div>
                                          <Badge variant="outline">{t('stockRetailStockout')}</Badge>
                                        </div>
                                      ))}
                                    {report.servicePriceAdjustments.map((adjustment) => (
                                      <div
                                        className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
                                        key={`${report.reportId}-${adjustment.serviceId}-price`}
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
                                    ))}
                                  </div>
                                ) : (
                                  <p className="text-sm text-muted-foreground">{t('stockNoServiceSignals')}</p>
                                )}
                              </OperationsDetailSection>

                              <OperationsDetailSection title={t('stockRankingTitle')}>
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
