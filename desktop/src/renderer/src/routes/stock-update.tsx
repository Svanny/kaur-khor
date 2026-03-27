import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { RankingEntry, StockReport } from '@shared/inventory';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
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
  buildDefaultReportRanking,
  hasRankingChanged,
  MerchandisingEditor,
  rankingIdsByType,
} from '@/components/system/merchandising-editor';
import {
  WorkspaceActionRow,
  WorkspaceEmpty,
  WorkspacePage,
  WorkspacePanel,
} from '@/components/system/workspace';
import { formatCurrency, localeFor } from '@/lib/format';
import { useInventory } from '@/state/inventory';
import { usePreferences } from '@/state/preferences';

type Preset = 'small' | 'medium' | 'big';

const presetSteps: Record<Preset, { units: number; cost: number }> = {
  small: { units: 1, cost: 0.25 },
  medium: { units: 5, cost: 0.5 },
  big: { units: 20, cost: 1 },
};

function toLocalDateTimeValue(value?: string) {
  const date = value ? new Date(value) : new Date();
  const offset = date.getTimezoneOffset();
  const local = new Date(date.getTime() - offset * 60_000);
  return local.toISOString().slice(0, 16);
}

function toIsoTimestamp(value: string) {
  if (!value.trim()) {
    return null;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed.toISOString();
}

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
  const { snapshot, submitReport, listStockReports, isSaving } = useInventory();
  const { currency, language, t } = usePreferences();
  const [searchParams, setSearchParams] = useSearchParams();
  const [rows, setRows] = useState<
    Record<
      string,
      {
        unitsInStock: string;
        costPerUnit: string;
        restockIncluded: boolean;
        retailStockout: boolean;
        notes: string;
      }
    >
  >({});
  const [error, setError] = useState<string | null>(null);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [preset, setPreset] = useState<Preset>('small');
  const [reportedAt, setReportedAt] = useState(() => toLocalDateTimeValue());
  const [reportNotes, setReportNotes] = useState('');
  const [reportRanking, setReportRanking] = useState<RankingEntry[]>([]);
  const [reports, setReports] = useState<StockReport[]>([]);
  const [serviceSignals, setServiceSignals] = useState<Record<string, boolean>>({});
  const [expandedReportIds, setExpandedReportIds] = useState<Record<string, boolean>>({});
  const merchandisingSectionRef = useRef<HTMLDivElement | null>(null);

  const composerOpen = searchParams.get('compose') === '1';
  const requestedSection = searchParams.get('section');

  const loadReports = useCallback(async () => {
    setHistoryLoading(true);
    setHistoryError(null);

    try {
      const nextReports = await listStockReports();
      setReports(nextReports);
    } catch (loadError) {
      setHistoryError(loadError instanceof Error ? loadError.message : t('apiUnavailable'));
    } finally {
      setHistoryLoading(false);
    }
  }, [listStockReports, t]);

  useEffect(() => {
    void loadReports();
  }, [loadReports]);

  useEffect(() => {
    if (!snapshot) {
      return;
    }

    setRows(
      Object.fromEntries(
        snapshot.skus.map((sku) => [
          sku.skuId,
          {
            unitsInStock: String(sku.unitsInStock),
            costPerUnit: String(sku.costPerUnit),
            restockIncluded: false,
            retailStockout: false,
            notes: '',
          },
        ]),
      ),
    );
    setServiceSignals(
      Object.fromEntries(snapshot.services.map((service) => [service.serviceId, false])),
    );
    setReportRanking(buildDefaultReportRanking(snapshot));
    setReportedAt(toLocalDateTimeValue());
    setReportNotes('');
    setError(null);
  }, [snapshot]);

  useEffect(() => {
    if (!composerOpen || requestedSection !== 'merchandising') {
      return;
    }

    const frame = window.requestAnimationFrame(() => {
      merchandisingSectionRef.current?.scrollIntoView({
        behavior: 'smooth',
        block: 'start',
      });
    });

    return () => window.cancelAnimationFrame(frame);
  }, [composerOpen, requestedSection]);

  const changedEntries = useMemo(
    () =>
      snapshot?.skus
        .map((sku) => ({
          sku,
          unitsInStock: Number(rows[sku.skuId]?.unitsInStock ?? sku.unitsInStock),
          costPerUnit: Number(rows[sku.skuId]?.costPerUnit ?? sku.costPerUnit),
          restockIncluded: rows[sku.skuId]?.restockIncluded ?? false,
          retailStockout: rows[sku.skuId]?.retailStockout ?? false,
          notes: rows[sku.skuId]?.notes?.trim() ?? '',
        }))
        .filter(
          (entry) =>
            entry.unitsInStock !== entry.sku.unitsInStock ||
            entry.costPerUnit !== entry.sku.costPerUnit ||
            entry.restockIncluded ||
            entry.retailStockout ||
            entry.notes.length > 0,
        ) ?? [],
    [rows, snapshot],
  );

  const selectedServiceSignals = useMemo(
    () => Object.entries(serviceSignals).filter(([, value]) => value).map(([serviceId]) => serviceId),
    [serviceSignals],
  );

  const baselineRanking = useMemo(
    () => (snapshot ? buildDefaultReportRanking(snapshot) : []),
    [snapshot],
  );
  const rankingChanged = useMemo(
    () => hasRankingChanged(baselineRanking, reportRanking),
    [baselineRanking, reportRanking],
  );
  const hasChanges =
    changedEntries.length > 0 ||
    selectedServiceSignals.length > 0 ||
    reportNotes.trim().length > 0 ||
    rankingChanged;

  const servicesById = useMemo(
    () => new Map(snapshot?.services.map((service) => [service.serviceId, service]) ?? []),
    [snapshot],
  );
  const skusById = useMemo(
    () => new Map(snapshot?.skus.map((sku) => [sku.skuId, sku]) ?? []),
    [snapshot],
  );

  function patchComposerState(nextOpen: boolean, section?: string | null) {
    const next = new URLSearchParams(searchParams);

    if (nextOpen) {
      next.set('compose', '1');
      if (section) {
        next.set('section', section);
      } else {
        next.delete('section');
      }
    } else {
      next.delete('compose');
      next.delete('section');
    }

    setSearchParams(next, { replace: true });
  }

  function resetComposer(nextSnapshot = snapshot) {
    if (!nextSnapshot) {
      return;
    }

    setRows(
      Object.fromEntries(
        nextSnapshot.skus.map((sku) => [
          sku.skuId,
          {
            unitsInStock: String(sku.unitsInStock),
            costPerUnit: String(sku.costPerUnit),
            restockIncluded: false,
            retailStockout: false,
            notes: '',
          },
        ]),
      ),
    );
    setServiceSignals(
      Object.fromEntries(nextSnapshot.services.map((service) => [service.serviceId, false])),
    );
    setReportedAt(toLocalDateTimeValue());
    setReportNotes('');
    setReportRanking(buildDefaultReportRanking(nextSnapshot));
    setError(null);
  }

  function openComposer(section?: string) {
    patchComposerState(true, section);
    setError(null);
  }

  function closeComposer() {
    resetComposer();
    patchComposerState(false);
  }

  function setField(
    skuId: string,
    key: 'unitsInStock' | 'costPerUnit' | 'notes',
    value: string,
  ) {
    setRows((current) => ({
      ...current,
      [skuId]: {
        ...current[skuId],
        [key]: value,
      },
    }));
  }

  function toggleField(skuId: string, key: 'restockIncluded' | 'retailStockout', value: boolean) {
    setRows((current) => ({
      ...current,
      [skuId]: {
        ...current[skuId],
        [key]: value,
      },
    }));
  }

  function adjustValue(
    skuId: string,
    key: 'unitsInStock' | 'costPerUnit',
    direction: -1 | 1,
  ) {
    if (!snapshot) {
      return;
    }

    const currentSku = snapshot.skus.find((sku) => sku.skuId === skuId);
    if (!currentSku) {
      return;
    }

    const step = key === 'unitsInStock' ? presetSteps[preset].units : presetSteps[preset].cost;
    const currentValue = Number(rows[skuId]?.[key] ?? currentSku[key]);
    setField(skuId, key, String(Math.max(0, currentValue + step * direction)));
  }

  async function handleSaveUpdate() {
    const isoReportedAt = toIsoTimestamp(reportedAt);

    if (!hasChanges) {
      setError(t('validationStockChanges'));
      return;
    }

    if (!isoReportedAt) {
      setError(t('validationTimestamp'));
      return;
    }

    setError(null);

    await submitReport({
      reportedAt: isoReportedAt,
      skuObservations: changedEntries.map((entry) => ({
        skuId: entry.sku.skuId,
        unitsInStock: entry.unitsInStock,
        costPerUnit: entry.costPerUnit,
        restockIncluded: entry.restockIncluded,
        retailStockout: entry.retailStockout,
        notes: entry.notes || null,
      })),
      serviceSignals: selectedServiceSignals.map((serviceId) => ({ serviceId, stockout: true })),
      notes: reportNotes.trim() || null,
      ...(rankingChanged
        ? {
            topServiceRanking: rankingIdsByType(reportRanking, 'service'),
            topRetailRanking: rankingIdsByType(reportRanking, 'sku'),
          }
        : {}),
    });

    await loadReports();
    resetComposer();
    patchComposerState(false);
  }

  if (!snapshot) {
    return (
      <WorkspacePage>
        <WorkspaceEmpty description={t('apiUnavailable')} title={t('stockChangesTitle')} />
      </WorkspacePage>
    );
  }

  return (
    <WorkspacePage>
      <WorkspaceActionRow className="justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          {composerOpen ? (
            <Button type="button" variant="outline" onClick={closeComposer}>
              {t('stockComposerCancel')}
            </Button>
          ) : (
            <Button type="button" onClick={() => openComposer()}>
              {t('stockAddUpdate')}
            </Button>
          )}
          {composerOpen ? (
            <Button
              disabled={isSaving}
              type="button"
              onClick={() => {
                void handleSaveUpdate();
              }}
            >
              {t('stockDone')}
            </Button>
          ) : null}
        </div>
      </WorkspaceActionRow>

      <WorkspacePanel description={t('stockHistoryDescription')} title={t('stockHistoryTitle')}>
        {historyLoading ? (
          <p className="text-sm text-muted-foreground">{t('backendStarting')}</p>
        ) : historyError ? (
          <p className="text-sm text-destructive">{historyError}</p>
        ) : reports.length === 0 ? (
          <WorkspaceEmpty
            action={
              <Button type="button" onClick={() => openComposer()}>
                {t('stockAddUpdate')}
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
                        {merchandisingCount > 0 ? (
                          <Badge variant="outline">
                            {summarizeCount(
                              merchandisingCount,
                              t('stockHistoryMerchandisingSignalSingular'),
                              t('stockHistoryMerchandisingSignalPlural'),
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
                              {t('validationStockChanges')}
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
                            {t('productRankingTitle')}
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
                                  {t('stockHistoryNoMerchandising')}
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
                                  {t('stockHistoryNoMerchandising')}
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

      {composerOpen ? (
        <>
          <WorkspacePanel
            description={t('stockComposerDescription')}
            title={t('stockComposerTitle')}
          >
            <div className="grid gap-4 lg:grid-cols-2">
              <div className="rounded-3xl border border-border/70 bg-card/55 p-4">
                <label className="text-sm font-medium text-foreground" htmlFor="reported-at">
                  {t('stockReportedAt')}
                </label>
                <Input
                  className="mt-2 rounded-2xl"
                  id="reported-at"
                  type="datetime-local"
                  value={reportedAt}
                  onChange={(event) => setReportedAt(event.target.value)}
                />
              </div>
              <div className="rounded-3xl border border-border/70 bg-card/55 p-4">
                <label className="text-sm font-medium text-foreground" htmlFor="report-notes">
                  {t('stockReportNotes')}
                </label>
                <Textarea
                  className="mt-2 min-h-24 rounded-2xl"
                  id="report-notes"
                  value={reportNotes}
                  onChange={(event) => setReportNotes(event.target.value)}
                />
              </div>
            </div>
            {error ? <p className="text-sm text-destructive">{error}</p> : null}
          </WorkspacePanel>

          <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
            <WorkspacePanel description={t('stockUpdateHint')} title={t('stockTableTitle')}>
              <div className="flex flex-wrap items-center gap-4">
                <ToggleGroup
                  spacing={1}
                  type="single"
                  value={preset}
                  onValueChange={(value) => {
                    if (!value) return;
                    setPreset(value as Preset);
                  }}
                >
                  <ToggleGroupItem value="small">{t('stockPresetSmall')}</ToggleGroupItem>
                  <ToggleGroupItem value="medium">{t('stockPresetMedium')}</ToggleGroupItem>
                  <ToggleGroupItem value="big">{t('stockPresetBig')}</ToggleGroupItem>
                </ToggleGroup>
              </div>

              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('inventoryColumnItem')}</TableHead>
                    <TableHead>{t('fieldUnitsInStock')}</TableHead>
                    <TableHead>{t('fieldCostPerUnit')}</TableHead>
                    <TableHead>{t('stockRestockIncluded')}</TableHead>
                    <TableHead>{t('stockRetailStockout')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {snapshot.skus.map((sku) => (
                    <TableRow key={sku.skuId}>
                      <TableCell className="min-w-0">
                        <div className="min-w-0">
                          <p className="truncate font-medium text-foreground">{sku.name}</p>
                          <p className="truncate text-sm text-muted-foreground">{sku.skuId}</p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Button
                            size="icon-sm"
                            type="button"
                            variant="outline"
                            onClick={() => adjustValue(sku.skuId, 'unitsInStock', -1)}
                          >
                            −
                          </Button>
                          <Input
                            className="min-w-24 rounded-full text-center"
                            inputMode="decimal"
                            value={rows[sku.skuId]?.unitsInStock ?? ''}
                            onChange={(event) => setField(sku.skuId, 'unitsInStock', event.target.value)}
                          />
                          <Button
                            size="icon-sm"
                            type="button"
                            variant="outline"
                            onClick={() => adjustValue(sku.skuId, 'unitsInStock', 1)}
                          >
                            +
                          </Button>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Button
                            size="icon-sm"
                            type="button"
                            variant="outline"
                            onClick={() => adjustValue(sku.skuId, 'costPerUnit', -1)}
                          >
                            −
                          </Button>
                          <Input
                            className="min-w-24 rounded-full text-center"
                            inputMode="decimal"
                            value={rows[sku.skuId]?.costPerUnit ?? ''}
                            onChange={(event) => setField(sku.skuId, 'costPerUnit', event.target.value)}
                          />
                          <Button
                            size="icon-sm"
                            type="button"
                            variant="outline"
                            onClick={() => adjustValue(sku.skuId, 'costPerUnit', 1)}
                          >
                            +
                          </Button>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Checkbox
                          checked={rows[sku.skuId]?.restockIncluded ?? false}
                          onCheckedChange={(checked) =>
                            toggleField(sku.skuId, 'restockIncluded', checked === true)
                          }
                        />
                      </TableCell>
                      <TableCell>
                        <Checkbox
                          checked={rows[sku.skuId]?.retailStockout ?? false}
                          onCheckedChange={(checked) =>
                            toggleField(sku.skuId, 'retailStockout', checked === true)
                          }
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </WorkspacePanel>

            <div className="flex flex-col gap-6">
              <WorkspacePanel description={t('stockSignalsHint')} title={t('stockServiceSignalsTitle')}>
                {snapshot.services.length > 0 ? (
                  <div className="flex flex-col gap-3">
                    {snapshot.services.map((service) => (
                      <label
                        className="flex items-start gap-3 rounded-2xl border border-border/75 bg-card/70 px-4 py-3"
                        key={service.serviceId}
                      >
                        <Checkbox
                          checked={serviceSignals[service.serviceId] ?? false}
                          onCheckedChange={(checked) =>
                            setServiceSignals((current) => ({
                              ...current,
                              [service.serviceId]: checked === true,
                            }))
                          }
                        />
                        <div className="min-w-0">
                          <p className="truncate font-medium text-foreground">{service.name}</p>
                          <p className="truncate text-sm text-muted-foreground">{service.serviceId}</p>
                        </div>
                      </label>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">{t('stockNoServiceSignals')}</p>
                )}
              </WorkspacePanel>

              <div ref={merchandisingSectionRef}>
                <WorkspacePanel
                  description={t('stockMerchandisingDescription')}
                  title={t('stockMerchandisingTitle')}
                >
                  <MerchandisingEditor
                    entries={reportRanking}
                    snapshot={snapshot}
                    titleLabel={t('stockMerchandisingTitle')}
                    onChange={setReportRanking}
                  />
                </WorkspacePanel>
              </div>
            </div>
          </div>
        </>
      ) : null}
    </WorkspacePage>
  );
}
