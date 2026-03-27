import { Link } from 'react-router-dom';
import type { StockReport } from '@shared/inventory';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  WorkspaceEmpty,
  WorkspacePage,
  WorkspacePanel,
} from '@/components/system/workspace';
import { formatCurrency, localeFor } from '@/lib/format';
import { useInventory } from '@/state/inventory';
import { usePreferences } from '@/state/preferences';

function reportSourceLabel(
  source: StockReport['reportSource'],
  t: (key: string) => string,
) {
  if (source === 'legacy-baseline') {
    return t('stockHistorySourceLegacy');
  }
  if (source === 'compat-stock-update') {
    return t('stockHistorySourceCompat');
  }
  return t('stockHistorySourceManual');
}

function summarizeCount(count: number, singular: string, plural: string) {
  return `${count} ${count === 1 ? singular : plural}`;
}

export function StockUpdateRoute() {
  const { snapshot, listStockReports } = useInventory();
  const { currency, language, t } = usePreferences();
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [reports, setReports] = useState<StockReport[]>([]);
  const [expandedReportIds, setExpandedReportIds] = useState<Record<string, boolean>>({});

  const servicesById = useMemo(
    () => new Map(snapshot?.services.map((service) => [service.serviceId, service]) ?? []),
    [snapshot],
  );
  const skusById = useMemo(
    () => new Map(snapshot?.skus.map((sku) => [sku.skuId, sku]) ?? []),
    [snapshot],
  );

  const loadReports = useCallback(async () => {
    setHistoryLoading(true);
    setHistoryError(null);

    try {
      const nextReports = await listStockReports();
      setReports(nextReports);
    } catch (error) {
      setHistoryError(error instanceof Error ? error.message : t('apiUnavailable'));
    } finally {
      setHistoryLoading(false);
    }
  }, [listStockReports, t]);

  useEffect(() => {
    void loadReports();
  }, [loadReports]);

  if (!snapshot) {
    return (
      <WorkspacePage>
        <WorkspaceEmpty description={t('apiUnavailable')} title={t('stockChangesTitle')} />
      </WorkspacePage>
    );
  }

  return (
    <WorkspacePage>
      <div className="flex justify-end">
        <Button asChild>
          <Link to="/inventory/stock/session">{t('stockAddUpdate')}</Link>
        </Button>
      </div>

      <WorkspacePanel description={t('stockHistoryDescription')} title={t('stockHistoryTitle')}>
        {historyLoading ? (
          <p className="text-sm text-muted-foreground">{t('backendStarting')}</p>
        ) : historyError ? (
          <p className="text-sm text-destructive">{historyError}</p>
        ) : reports.length === 0 ? (
          <WorkspaceEmpty
            action={
              <Button asChild>
                <Link to="/inventory/stock/session">{t('stockAddUpdate')}</Link>
              </Button>
            }
            description={t('stockHistoryEmptyDescription')}
            title={t('stockHistoryEmptyTitle')}
          />
        ) : (
          <div className="grid gap-4">
            {reports.map((report) => {
              const isExpanded = expandedReportIds[report.reportId] ?? false;
              const serviceFlagCount = report.serviceSignals.filter(
                (signal) => signal.stockout !== false,
              ).length;
              const merchandisingCount =
                report.topServiceRanking.length + report.topRetailRanking.length;

              return (
                <div
                  className="rounded-3xl border border-border/70 bg-card/55 p-5"
                  key={report.reportId}
                >
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="space-y-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="outline">
                          {new Intl.DateTimeFormat(localeFor(language), {
                            dateStyle: 'medium',
                            timeStyle: 'short',
                          }).format(new Date(report.reportedAt))}
                        </Badge>
                        <Badge variant="secondary">
                          {reportSourceLabel(report.reportSource, t)}
                        </Badge>
                        <Badge variant="outline">
                          {summarizeCount(
                            report.skuObservations.length,
                            t('stockHistoryChangedRowSingular'),
                            t('stockHistoryChangedRowPlural'),
                          )}
                        </Badge>
                        <Badge variant="outline">
                          {summarizeCount(
                            serviceFlagCount,
                            t('stockHistoryServiceFlagSingular'),
                            t('stockHistoryServiceFlagPlural'),
                          )}
                        </Badge>
                        <Badge variant="outline">
                          {summarizeCount(
                            report.servicePriceAdjustments.length,
                            t('stockHistoryPriceEditSingular'),
                            t('stockHistoryPriceEditPlural'),
                          )}
                        </Badge>
                        {merchandisingCount > 0 ? (
                          <Badge variant="outline">
                            {summarizeCount(
                              merchandisingCount,
                              t('stockHistoryRankingSignalSingular'),
                              t('stockHistoryRankingSignalPlural'),
                            )}
                          </Badge>
                        ) : null}
                      </div>
                      {report.notes ? (
                        <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
                          {report.notes}
                        </p>
                      ) : (
                        <p className="text-sm text-muted-foreground">{t('stockHistoryNoNotes')}</p>
                      )}
                    </div>

                    <Button
                      size="sm"
                      type="button"
                      variant="ghost"
                      onClick={() =>
                        setExpandedReportIds((current) => ({
                          ...current,
                          [report.reportId]: !isExpanded,
                        }))
                      }
                    >
                      {isExpanded ? t('stockHistoryHideDetails') : t('stockHistoryViewDetails')}
                    </Button>
                  </div>

                  {isExpanded ? (
                    <div className="mt-5 grid gap-4 border-t border-border/60 pt-5 xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.95fr)]">
                      <div className="grid gap-4">
                        <div className="rounded-3xl border border-border/70 bg-background/50 p-4">
                          <p className="text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                            {t('stockTableTitle')}
                          </p>
                          {report.skuObservations.length > 0 ? (
                            <div className="mt-4 grid gap-3">
                              {report.skuObservations.map((entry) => {
                                const sku = skusById.get(entry.skuId);

                                return (
                                  <div
                                    className="rounded-2xl border border-border/60 bg-card/70 px-4 py-3"
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
                                    <div className="mt-3 flex flex-wrap gap-x-6 gap-y-2 text-sm text-muted-foreground">
                                      <span>
                                        {t('fieldUnitsInStock')}: {entry.unitsInStock}
                                      </span>
                                      <span>
                                        {t('fieldCostPerUnit')}:{' '}
                                        {formatCurrency(entry.costPerUnit, currency, language)}
                                      </span>
                                    </div>
                                    {entry.notes ? (
                                      <p className="mt-3 text-sm leading-6 text-muted-foreground">
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
                        <div className="rounded-3xl border border-border/70 bg-background/50 p-4">
                          <p className="text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                            {t('stockServiceSignalsTitle')}
                          </p>
                          {serviceFlagCount > 0 ? (
                            <div className="mt-4 flex flex-wrap gap-2">
                              {report.serviceSignals
                                .filter((signal) => signal.stockout !== false)
                                .map((signal) => (
                                  <Badge key={`${report.reportId}-${signal.serviceId}`} variant="outline">
                                    {servicesById.get(signal.serviceId)?.name ?? signal.serviceId}
                                  </Badge>
                                ))}
                            </div>
                          ) : (
                            <p className="mt-3 text-sm text-muted-foreground">
                              {t('stockNoServiceSignals')}
                            </p>
                          )}
                        </div>

                        <div className="rounded-3xl border border-border/70 bg-background/50 p-4">
                          <p className="text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                            {t('stockServicePriceAdjustmentsTitle')}
                          </p>
                          {report.servicePriceAdjustments.length > 0 ? (
                            <div className="mt-4 grid gap-3">
                              {report.servicePriceAdjustments.map((adjustment) => (
                                <div
                                  className="rounded-2xl border border-border/60 bg-card/70 px-4 py-3"
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
                            <p className="mt-3 text-sm text-muted-foreground">
                              {t('stockHistoryNoPriceEdits')}
                            </p>
                          )}
                        </div>

                        <div className="rounded-3xl border border-border/70 bg-background/50 p-4">
                          <p className="text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                            {t('stockRankingTitle')}
                          </p>
                          <div className="mt-4 grid gap-4">
                            <div>
                              <p className="text-sm font-medium text-foreground">
                                {t('stockTopServiceRanking')}
                              </p>
                              {report.topServiceRanking.length > 0 ? (
                                <div className="mt-2 flex flex-wrap gap-2">
                                  {report.topServiceRanking.map((serviceId) => (
                                    <Badge key={`${report.reportId}-${serviceId}`} variant="outline">
                                      {servicesById.get(serviceId)?.name ?? serviceId}
                                    </Badge>
                                  ))}
                                </div>
                              ) : (
                                <p className="mt-2 text-sm text-muted-foreground">
                                  {t('stockHistoryNoRanking')}
                                </p>
                              )}
                            </div>
                            <div>
                              <p className="text-sm font-medium text-foreground">
                                {t('stockTopRetailRanking')}
                              </p>
                              {report.topRetailRanking.length > 0 ? (
                                <div className="mt-2 flex flex-wrap gap-2">
                                  {report.topRetailRanking.map((skuId) => (
                                    <Badge key={`${report.reportId}-${skuId}`} variant="outline">
                                      {skusById.get(skuId)?.name ?? skuId}
                                    </Badge>
                                  ))}
                                </div>
                              ) : (
                                <p className="mt-2 text-sm text-muted-foreground">
                                  {t('stockHistoryNoRanking')}
                                </p>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
      </WorkspacePanel>
    </WorkspacePage>
  );
}
