import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { AlertTriangle, ChevronRight, CircleHelp, RefreshCcw, SquarePen } from 'lucide-react';
import type {
  SenaCatalog,
  SenaDiagnostics,
  SenaObservationRecord,
  SenaServiceDetail,
  SenaSkuDetail,
  SenaWorkspaceSummary,
} from '@shared/sena';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DescriptionText } from '@/components/system/description-text';
import { RouteBackButton } from '@/components/system/page-navigation';
import {
  MetricStrip,
  MetricStripItem,
  WorkspaceEmpty,
  WorkspacePage,
  WorkspacePanel,
} from '@/components/system/workspace';
import { formatCurrency, formatNumber, formatQuantityForDisplay, formatWholeNumber } from '@/lib/format';
import { cn } from '@/lib/utils';
import { useInventory } from '@/state/inventory';
import { usePreferences } from '@/state/preferences';
import {
  buildFlowDecompositionRows,
  buildHeartbeatModel,
  buildRecommendationModel,
  buildRegimePriceLane,
  catalogNeedsSync,
  deriveSenaCatalog,
  estimateReceiptEtaIso,
  extractSenaEvidence,
  latestRetailPrice,
  linkedSenaServiceIds,
  summarizePipelineState,
} from './sku-detail-sena';

type SenaRouteState = {
  status: 'idle' | 'loading' | 'ready' | 'error';
  error: string | null;
  catalog: SenaCatalog | null;
  workspace: SenaWorkspaceSummary | null;
  detail: SenaSkuDetail | null;
  diagnostics: SenaDiagnostics | null;
  observations: SenaObservationRecord[];
  serviceDetails: Record<string, SenaServiceDetail>;
  triggeredRun: boolean;
};

function emptySenaState(): SenaRouteState {
  return {
    status: 'idle',
    error: null,
    catalog: null,
    workspace: null,
    detail: null,
    diagnostics: null,
    observations: [],
    serviceDetails: {},
    triggeredRun: false,
  };
}

function formatIsoDate(value: string | null, language: 'en' | 'km') {
  if (!value) {
    return 'n/a';
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return 'n/a';
  }
  return new Intl.DateTimeFormat(language === 'km' ? 'km-KH' : 'en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

function statePillClassName(tone: 'neutral' | 'success' | 'warning' | 'danger') {
  if (tone === 'danger') {
    return 'border-destructive/25 bg-destructive/8 text-destructive';
  }
  if (tone === 'warning') {
    return 'border-amber-500/30 bg-amber-500/10 text-amber-700';
  }
  if (tone === 'success') {
    return 'border-emerald-500/25 bg-emerald-500/10 text-emerald-700';
  }
  return 'border-border/70 bg-background text-foreground';
}

export function SkuDetailRoute() {
  const { skuId = '' } = useParams();
  const inventory = useInventory();
  const { snapshot } = inventory;
  const {
    loadSenaCatalog,
    upsertSenaCatalog,
    loadSenaWorkspaceSummary,
    loadSenaSkuDetail,
    loadSenaDiagnostics,
    loadSenaObservations,
    triggerSenaRun,
    loadSenaServiceDetail,
  } = inventory;
  const { currency, language, t } = usePreferences();
  const [routeState, setRouteState] = useState<SenaRouteState>(() => emptySenaState());
  const [refreshToken, setRefreshToken] = useState(0);

  const sku = snapshot?.skus.find((entry) => entry.skuId === skuId) ?? null;

  useEffect(() => {
    if (!snapshot || !sku) {
      return;
    }

    let cancelled = false;

    const load = async () => {
      setRouteState((current) => ({
        ...current,
        status: 'loading',
        error: null,
      }));

      try {
        const derivedCatalog = deriveSenaCatalog(snapshot);
        let catalog = await loadSenaCatalog();
        if (catalogNeedsSync(catalog, derivedCatalog)) {
          catalog = await upsertSenaCatalog(derivedCatalog);
        }

        let [workspace, detail, diagnostics, observations] = await Promise.all([
          loadSenaWorkspaceSummary(),
          loadSenaSkuDetail(skuId),
          loadSenaDiagnostics(),
          loadSenaObservations(),
        ]);

        let triggeredRun = false;
        let bootstrapError: string | null = null;

        if (!workspace || !detail) {
          try {
            await triggerSenaRun({ algorithmVersion: 'sena-analysis-v1' });
            triggeredRun = true;
            [workspace, detail, diagnostics, observations] = await Promise.all([
              loadSenaWorkspaceSummary(),
              loadSenaSkuDetail(skuId),
              loadSenaDiagnostics(),
              loadSenaObservations(),
            ]);
          } catch (error) {
            bootstrapError = error instanceof Error ? error.message : 'SENA analysis failed';
          }
        }

        const linkedServiceIds = linkedSenaServiceIds(catalog, skuId);
        const servicePairs = await Promise.all(
          linkedServiceIds.map(async (serviceId) => [
            serviceId,
            await loadSenaServiceDetail(serviceId),
          ] as const),
        );
        const serviceDetails = Object.fromEntries(
          servicePairs.filter((pair): pair is readonly [string, SenaServiceDetail] => pair[1] != null),
        );

        if (cancelled) {
          return;
        }

        setRouteState({
          status: 'ready',
          error: bootstrapError,
          catalog,
          workspace,
          detail,
          diagnostics,
          observations,
          serviceDetails,
          triggeredRun,
        });
      } catch (error) {
        if (cancelled) {
          return;
        }
        setRouteState((current) => ({
          ...current,
          status: 'error',
          error: error instanceof Error ? error.message : 'Failed to load SENA detail',
        }));
      }
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, [refreshToken, sku, skuId, snapshot]);

  const latestPipelinePoint = routeState.detail?.pipelinePosterior.at(-1) ?? null;
  const latestLeadTimePoint = routeState.detail?.leadTimePosterior.at(-1) ?? null;
  const latestInventoryPoint = routeState.detail?.inventoryPosterior.at(-1) ?? null;
  const latestPrice = latestRetailPrice(routeState.observations, skuId, sku?.productPrice ?? null);
  const receiptEtaIso = estimateReceiptEtaIso({
    workspace: routeState.workspace,
    pipeline: latestPipelinePoint,
    leadTime: latestLeadTimePoint,
  });
  const heartbeat = routeState.detail
    ? buildHeartbeatModel({
        summary: routeState.detail.summary,
        latestPriceNow: latestPrice,
        receiptEtaIso,
        language,
        currency,
      })
    : null;
  const recommendation = routeState.detail
    ? buildRecommendationModel(routeState.detail.summary, latestPipelinePoint)
    : null;
  const lane = useMemo(
    () => buildRegimePriceLane(routeState.diagnostics, routeState.observations, skuId),
    [routeState.diagnostics, routeState.observations, skuId],
  );
  const flowRows = useMemo(
    () => buildFlowDecompositionRows(routeState.detail?.demandPosterior ?? []),
    [routeState.detail],
  );
  const pipelineSummary = useMemo(
    () => summarizePipelineState(latestPipelinePoint),
    [latestPipelinePoint],
  );
  const evidence = useMemo(
    () => extractSenaEvidence(routeState.observations, skuId),
    [routeState.observations, skuId],
  );
  const exposureEntries = useMemo(
    () =>
      Object.values(routeState.serviceDetails).sort(
        (left, right) => right.bottleneckProbability - left.bottleneckProbability,
      ),
    [routeState.serviceDetails],
  );
  const nextTouch = useMemo(() => {
    if (!routeState.detail) {
      return 'Wait for the first completed SENA run.';
    }
    if (routeState.detail.summary.stockoutRisk >= 0.35) {
      return 'Touch today: stockout risk is elevated.';
    }
    if (receiptEtaIso) {
      return `Touch by ${formatIsoDate(receiptEtaIso, language)} to confirm the expected receipt horizon.`;
    }
    if (routeState.workspace?.latestObservedAt) {
      return `Touch after ${formatIsoDate(routeState.workspace.latestObservedAt, language)} if no new observation arrives.`;
    }
    return 'Touch after the next observation cycle.';
  }, [language, receiptEtaIso, routeState.detail, routeState.workspace]);

  if (!snapshot) {
    return (
      <WorkspacePage>
        <WorkspaceEmpty title={t('apiUnavailable')} description="Inventory snapshot is still loading." />
      </WorkspacePage>
    );
  }

  if (!sku) {
    return (
      <WorkspacePage>
        <WorkspaceEmpty
          title={t('catalogSkuDetailNotFoundTitle')}
          description={t('catalogSkuDetailNotFoundDescription')}
          action={
            <Button asChild variant="outline">
              <Link to="/catalog?view=skus">{t('backToCatalog')}</Link>
            </Button>
          }
        />
      </WorkspacePage>
    );
  }

  return (
    <WorkspacePage data-testid="sku-detail-route">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <RouteBackButton />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="truncate text-3xl font-semibold tracking-[-0.05em] text-foreground">
                {sku.name}
              </h1>
              {heartbeat ? (
                <Badge className={cn('rounded-full border', statePillClassName(heartbeat.statusTone))}>
                  {heartbeat.statusLabel}
                </Badge>
              ) : null}
              <Badge variant="outline" className="rounded-full">
                Identifier: {skuId}
              </Badge>
            </div>
            <DescriptionText className="mt-2 max-w-3xl text-sm text-muted-foreground">
              {sku.description}
            </DescriptionText>
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              setRefreshToken((current) => current + 1);
            }}
          >
            <RefreshCcw className="size-4" />
            Run / refresh analysis
          </Button>
          <Button asChild>
            <Link to={`/operations/session?step=observations&focusSku=${skuId}`}>
              Record stock
            </Link>
          </Button>
          <Button disabled variant="outline">
            Log order
            <Badge variant="secondary" className="rounded-full">Staged</Badge>
          </Button>
          <Button disabled variant="outline">
            Log receipt
            <Badge variant="secondary" className="rounded-full">Staged</Badge>
          </Button>
          <Button disabled variant="outline">
            Update price
            <Badge variant="secondary" className="rounded-full">Staged</Badge>
          </Button>
          <Button asChild variant="outline">
            <Link to={`/catalog/skus/${skuId}/edit`}>
              <SquarePen className="size-4" />
              Edit SKU
            </Link>
          </Button>
        </div>
      </div>

      {routeState.error ? (
        <WorkspacePanel className="border-amber-500/30 bg-amber-500/5" contentClassName="pt-0">
          <div className="flex items-start gap-3 text-sm text-muted-foreground">
            <AlertTriangle className="mt-0.5 size-4 text-amber-700" />
            <p>
              {routeState.detail
                ? `SENA loaded with a partial warning: ${routeState.error}`
                : `SENA detail is not ready yet. ${routeState.error}`}
            </p>
          </div>
        </WorkspacePanel>
      ) : null}

      <WorkspacePanel
        className="overflow-hidden rounded-[1.75rem] border-border/70 bg-background/85"
        contentClassName="space-y-4"
      >
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
              SENA heartbeat
            </p>
            <p className="mt-2 text-3xl font-semibold tracking-[-0.05em] text-foreground">
              {heartbeat?.headline ?? 'SENA detail is still initializing'}
            </p>
            <DescriptionText className="mt-2 max-w-4xl text-sm text-muted-foreground">
              {heartbeat?.subheadline ??
                'The page is seeded from the current Banji snapshot and waits for a completed SENA run to populate aggregate posterior state.'}
            </DescriptionText>
          </div>
          <div className="flex flex-col items-end gap-2 text-right text-sm text-muted-foreground">
            <span>Observed: {formatIsoDate(routeState.workspace?.latestObservedAt ?? null, language)}</span>
            <span>Receipt ETA est.: {formatIsoDate(receiptEtaIso, language)}</span>
            <span>Run triggered now: {routeState.triggeredRun ? 'yes' : 'no'}</span>
          </div>
        </div>
      </WorkspacePanel>

      <MetricStrip className="xl:grid-cols-6" data-testid="sku-detail-ribbon">
        <MetricStripItem
          label="On hand"
          value={routeState.detail ? formatWholeNumber(routeState.detail.summary.latestPosteriorUnits, language) : 'n/a'}
          detail="Latest posterior units"
        />
        <MetricStripItem
          label="In transit"
          value={pipelineSummary ? formatWholeNumber(pipelineSummary.inTransitMean, language) : 'n/a'}
          detail="Aggregate pipeline state"
        />
        <MetricStripItem
          label="Demand / day"
          value={routeState.detail ? formatNumber(routeState.detail.summary.demandPerDayMean, language) : 'n/a'}
          detail="Posterior mean"
        />
        <MetricStripItem
          label="Receipt ETA est."
          value={receiptEtaIso ? formatIsoDate(receiptEtaIso, language) : 'n/a'}
          detail="Lead time minus pipeline age"
          valueClassName="text-lg"
        />
        <MetricStripItem
          label="Price now"
          value={latestPrice != null ? formatCurrency(latestPrice, currency, language) : 'n/a'}
          detail="Latest retail price evidence"
          valueClassName="text-2xl"
        />
        <MetricStripItem
          label="Service exposure"
          value={formatWholeNumber(exposureEntries.length, language)}
          detail="Linked services sharing mask"
        />
      </MetricStrip>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(320px,1fr)]">
        <div className="space-y-6">
          <WorkspacePanel
            title="SENA ledger"
            description="Posterior lanes are aligned on interval index and current aggregate pipeline state."
          >
            {routeState.detail ? (
              <div className="space-y-4" data-testid="sku-detail-ledger">
                <div className="rounded-2xl border border-border/60 bg-background/70 p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                    Regime + price lane
                  </p>
                  <div className="mt-3 space-y-3">
                    {lane.regimes.length > 0 ? (
                      lane.regimes.map((regime) => (
                        <div key={`${regime.intervalIndex}-${regime.startAt}`} className="flex items-start justify-between gap-4 border-t border-border/40 pt-3 first:border-t-0 first:pt-0">
                          <div>
                            <p className="font-medium text-foreground">{regime.dominantRegime}</p>
                            <p className="text-sm text-muted-foreground">
                              Interval {regime.intervalIndex} · {formatIsoDate(regime.startAt, language)} to {formatIsoDate(regime.endAt, language)}
                            </p>
                          </div>
                          <p className="text-sm text-muted-foreground">
                            Price markers: {lane.prices.filter((point) => point.observedAt >= regime.startAt && point.observedAt <= regime.endAt).length}
                          </p>
                        </div>
                      ))
                    ) : (
                      <p className="text-sm text-muted-foreground">No regime history is available yet.</p>
                    )}
                  </div>
                </div>

                <div className="rounded-2xl border border-border/60 bg-background/70 p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                    Inventory posterior lane
                  </p>
                  <div className="mt-3 space-y-3">
                    {routeState.detail.inventoryPosterior.map((point) => (
                      <div key={point.at} className="flex items-center justify-between gap-4 border-t border-border/40 pt-3 first:border-t-0 first:pt-0">
                        <p className="text-sm text-foreground">{formatIsoDate(point.at, language)}</p>
                        <p className="text-sm text-muted-foreground">
                          {formatQuantityForDisplay(point.mean, language)} mean · {formatQuantityForDisplay(point.low, language)}-{formatQuantityForDisplay(point.high, language)}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="rounded-2xl border border-border/60 bg-background/70 p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                    Flow decomposition lane
                  </p>
                  <div className="mt-3 space-y-3">
                    {flowRows.map((row) => (
                      <div key={`${row.intervalIndex}-${row.startAt}`} className="grid gap-2 border-t border-border/40 pt-3 first:border-t-0 first:pt-0 sm:grid-cols-2 xl:grid-cols-4">
                        <p className="text-sm text-foreground">
                          Interval {row.intervalIndex}
                          <span className="block text-muted-foreground">{formatIsoDate(row.startAt, language)}</span>
                        </p>
                        <p className="text-sm text-muted-foreground">Service {formatNumber(row.serviceDemandMean, language)} · Retail {formatNumber(row.retailDemandMean, language)}</p>
                        <p className="text-sm text-muted-foreground">Receipts {formatNumber(row.receiptsMean, language)} · Adjustments {formatNumber(row.adjustmentsMean, language)}</p>
                        <p className="text-sm text-muted-foreground">Realized {formatNumber(row.realizedConsumptionMean, language)} · Unconstrained {formatNumber(row.unconstrainedDemandMean, language)}</p>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="rounded-2xl border border-border/60 bg-background/70 p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                    Pipeline state lane
                  </p>
                  <div className="mt-3 space-y-3">
                    {routeState.detail.pipelinePosterior.map((point) => (
                      <div key={`pipeline-${point.intervalIndex}`} className="grid gap-2 border-t border-border/40 pt-3 first:border-t-0 first:pt-0 sm:grid-cols-2 xl:grid-cols-4">
                        <p className="text-sm text-foreground">Interval {point.intervalIndex}</p>
                        <p className="text-sm text-muted-foreground">In transit {formatNumber(point.inTransitMean, language)} · order p {formatNumber(point.orderProbability * 100, language)}%</p>
                        <p className="text-sm text-muted-foreground">Receipt qty {formatNumber(point.receiptQuantityMean, language)} · order qty {formatNumber(point.orderQuantityMean, language)}</p>
                        <p className="text-sm text-muted-foreground">Age trend {formatNumber(point.ageDaysMean, language)} days</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                No completed SENA detail exists for this SKU yet. The page stays on the current Banji snapshot until a run succeeds.
              </p>
            )}
          </WorkspacePanel>

          <WorkspacePanel
            title="Dependency impact"
            description="Exposure is driven by the SENA sharing mask and linked service bottleneck detail."
          >
            {exposureEntries.length > 0 ? (
              <div className="space-y-3" data-testid="sku-detail-exposure">
                {exposureEntries.map((service) => (
                  <div key={service.serviceId} className="flex items-start justify-between gap-4 rounded-2xl border border-border/50 bg-background/70 px-4 py-3">
                    <div>
                      <p className="font-medium text-foreground">{service.serviceId}</p>
                      <p className="text-sm text-muted-foreground">
                        Activity {formatNumber(service.activityMean, language)} · contributors {service.contributors.length}
                      </p>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Bottleneck {formatNumber(service.bottleneckProbability * 100, language)}%
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No linked SENA service details are available yet.</p>
            )}
          </WorkspacePanel>

          <WorkspacePanel
            title="Evidence timeline"
            description="SENA-native observations are used for stock snapshots, order and receipt signals, price changes, stockouts, lead-time hints, and notes."
          >
            {evidence.length > 0 ? (
              <div className="space-y-3" data-testid="sku-detail-evidence">
                {evidence.map((entry, index) => (
                  <div key={`${entry.observedAt}-${entry.type}-${index}`} className="flex items-start gap-4 rounded-2xl border border-border/50 bg-background/70 px-4 py-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-medium text-foreground">{entry.title}</p>
                        <Badge variant="outline" className="rounded-full">{entry.type}</Badge>
                      </div>
                      <p className="mt-1 text-sm text-muted-foreground">{entry.detail}</p>
                    </div>
                    <p className="text-xs text-muted-foreground">{formatIsoDate(entry.observedAt, language)}</p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No SENA observations exist for this SKU yet.</p>
            )}
          </WorkspacePanel>
        </div>

        <div className="space-y-6">
          <WorkspacePanel title="Act now" description="Recommendation derived from reorder pressure, stockout risk, days of cover, and aggregate pipeline state.">
            <div data-testid="sku-detail-act-now">
              <p className="text-xl font-semibold tracking-[-0.03em] text-foreground">
                {recommendation?.title ?? 'Await first run'}
              </p>
              <DescriptionText className="mt-2 text-sm text-muted-foreground">
                {recommendation?.body ?? 'SENA needs at least one completed run before a recommendation can be issued.'}
              </DescriptionText>
            </div>
          </WorkspacePanel>

          <WorkspacePanel title="Pipeline state" description="Aggregate posterior pipeline metrics, not purchase-order rows.">
            {pipelineSummary ? (
              <div className="space-y-2" data-testid="sku-detail-pipeline">
                <p className="text-sm text-muted-foreground">In transit: {formatNumber(pipelineSummary.inTransitMean, language)}</p>
                <p className="text-sm text-muted-foreground">Order probability: {formatNumber(pipelineSummary.orderProbability * 100, language)}%</p>
                <p className="text-sm text-muted-foreground">Receipt quantity mean: {formatNumber(pipelineSummary.receiptQuantityMean, language)}</p>
                <p className="text-sm text-muted-foreground">Age-days trend: {formatNumber(pipelineSummary.ageDaysMean, language)}</p>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No aggregate pipeline posterior is available yet.</p>
            )}
          </WorkspacePanel>

          <WorkspacePanel title="Exposure" description="Linked services are sorted by bottleneck probability.">
            {exposureEntries.length > 0 ? (
              <div className="space-y-2">
                {exposureEntries.map((service) => (
                  <div key={`rail-${service.serviceId}`} className="flex items-center justify-between gap-3 border-t border-border/40 pt-2 first:border-t-0 first:pt-0">
                    <div>
                      <p className="font-medium text-foreground">{service.serviceId}</p>
                      <p className="text-xs text-muted-foreground">{formatNumber(service.activityMean, language)} activity mean</p>
                    </div>
                    <p className="text-sm text-muted-foreground">{formatNumber(service.bottleneckProbability * 100, language)}%</p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No linked service detail is available yet.</p>
            )}
          </WorkspacePanel>

          <WorkspacePanel title="Next touch" description="Derived from reorder urgency, estimated receipt horizon, and observation freshness.">
            <DescriptionText className="text-sm text-muted-foreground">
              {nextTouch}
            </DescriptionText>
          </WorkspacePanel>

          <WorkspacePanel title="Diagnostics" description="Current SENA diagnostics and latest posterior state.">
            {routeState.diagnostics ? (
              <div className="space-y-2 text-sm text-muted-foreground">
                <p>ESS mean: {formatNumber(routeState.diagnostics.effectiveSampleSizeMean, language)}</p>
                <p>Coverage estimate: {formatNumber(routeState.diagnostics.coverageEstimate * 100, language)}%</p>
                <p>Change-point probability: {formatNumber(routeState.diagnostics.changePointProbability * 100, language)}%</p>
                <p>Posterior predictive error: {formatNumber(routeState.diagnostics.posteriorPredictiveErrorMean, language)}</p>
                <p>Latest posterior mean: {latestInventoryPoint ? formatNumber(latestInventoryPoint.mean, language) : 'n/a'}</p>
              </div>
            ) : (
              <div className="flex items-start gap-3 text-sm text-muted-foreground">
                <CircleHelp className="mt-0.5 size-4" />
                <p>SENA diagnostics are unavailable until a completed run exists.</p>
              </div>
            )}
          </WorkspacePanel>
        </div>
      </div>

      {routeState.status === 'loading' ? (
        <p className="text-sm text-muted-foreground">Bootstrapping SENA detail for this SKU…</p>
      ) : null}

      <div className="flex items-center justify-between gap-3 rounded-[1.5rem] border border-border/50 bg-background/40 px-5 py-4 text-sm text-muted-foreground">
        <span>SENA route-local bootstrap seeds catalog data from the current Banji snapshot only when needed.</span>
        <div className="flex items-center gap-2">
          <span>Legacy stock writes still live in operations session.</span>
          <ChevronRight className="size-4" />
        </div>
      </div>
    </WorkspacePage>
  );
}
