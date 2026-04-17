import { useEffect, useMemo, useState } from 'react';
import { ActionResetIcon } from '@icons/actions';
import { EntityLayersIcon, EntityServiceIcon, EntitySkuIcon } from '@icons/entities';
import { SupplierFilter } from '@/components/system/supplier';
import { WorkspaceActionRow, WorkspacePage, WorkspaceTitleCard } from '@/components/system/workspace';
import { Button } from '@/components/ui/button';
import { LoadingMoreIntervalsIsland } from '@/components/system/loading-more-intervals-island';
import { ChartLedgerOverlay, useHeldTradingChartBusy, useTradingChartController, type TradingChartController } from '@/components/system/trading-chart';
import type { ChartCustomTimeframeRange, ChartTimeframe } from '@/components/system/chart-timeframe';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { activeSenaCatalog, filterCatalogBySupplier, type SupplierFilterValue } from '@/lib/sena-catalog';
import { usePreferences } from '@/state/preferences';
import { AnalysisWorkbench } from './analysis-workbench';
import { AnalysisTradingChartLedger } from './trading-chart-ledger';
import {
  type AnalysisScope,
  type AnalysisSection,
  type AnalysisSelection,
  deriveAnalysisViewModel,
} from './analysis-view-model';
import type { InventoryContextValue } from '@/state/inventory';
import type { AnalysisTimeframe } from './analysis-timeframe';

type AnalysisContentProps = {
  currency: string;
  hasOlderIntervals: boolean;
  inventory: InventoryContextValue;
  isHydratingDetails: boolean;
  isLoadingOlderIntervals: boolean;
  language: string;
  loadOlderIntervals: (limit?: number) => Promise<number>;
  resetHydratedDetails: () => Promise<void>;
  resolvedTimeframeCacheKey?: string | null;
  scope: AnalysisScope;
  section: AnalysisSection;
  chartController?: TradingChartController;
  isLedgerExpanded?: boolean;
  serviceDetailsById: Record<string, import('@shared/sena').SenaServiceDetail | null>;
  setCustomTimeframeRange?: (range: ChartCustomTimeframeRange | null) => void;
  setLedgerExpanded?: (expanded: boolean, replace?: boolean) => void;
  setScope: (scope: AnalysisScope) => void;
  setSection: (section: AnalysisSection) => void;
  setSupplierFilter?: (supplierFilter: SupplierFilterValue) => void;
  setTimeframe?: (timeframe: ChartTimeframe) => void;
  showRightRailCards: boolean;
  skuDetailsById: Record<string, import('@shared/sena').SenaSkuDetail | null>;
  supplierFilter?: SupplierFilterValue;
  timeframe?: ChartTimeframe;
  timeframeHydrationProgress: { current: number; total: number } | null;
};

type AnalysisContentInnerProps = Omit<
  AnalysisContentProps,
  'chartController' | 'isLedgerExpanded' | 'setLedgerExpanded' | 'setTimeframe' | 'timeframe'
> & {
  chartController: TradingChartController;
  isLedgerExpanded: boolean;
  setLedgerExpanded: (expanded: boolean, replace?: boolean) => void;
};

export function AnalysisContent(props: AnalysisContentProps) {
  if (props.chartController) {
    return (
      <AnalysisContentInner
        {...props}
        chartController={props.chartController}
        isLedgerExpanded={props.isLedgerExpanded ?? false}
        setLedgerExpanded={props.setLedgerExpanded ?? (() => {})}
      />
    );
  }
  return <AnalysisContentFallback {...props} />;
}

function AnalysisContentFallback(props: AnalysisContentProps) {
  const [fallbackLedgerExpanded, setFallbackLedgerExpanded] = useState(false);
  const chartController = useTradingChartController({
    initialTimeframe: props.timeframe,
    onTimeframeChange: props.setTimeframe,
    subjectId: 'workbench',
    subtype: 'analysis',
  });
  return (
    <AnalysisContentInner
      {...props}
      chartController={chartController}
      isLedgerExpanded={props.isLedgerExpanded ?? fallbackLedgerExpanded}
      setLedgerExpanded={props.setLedgerExpanded ?? setFallbackLedgerExpanded}
    />
  );
}

function AnalysisContentInner({
  currency,
  hasOlderIntervals,
  inventory,
  isHydratingDetails,
  isLoadingOlderIntervals,
  language,
  loadOlderIntervals,
  resetHydratedDetails,
  resolvedTimeframeCacheKey,
  scope,
  section,
  chartController,
  isLedgerExpanded,
  serviceDetailsById,
  setLedgerExpanded,
  setScope,
  setSection,
  setSupplierFilter = () => {},
  showRightRailCards,
  skuDetailsById,
  supplierFilter = 'all',
  timeframeHydrationProgress,
}: AnalysisContentInnerProps) {
  const { t } = usePreferences();
  const [isRunningAnalysis, setIsRunningAnalysis] = useState(false);
  const [expandedLedgerSelection, setExpandedLedgerSelection] = useState<AnalysisSelection>({ type: 'overview' });
  const baseCatalog = useMemo(() => activeSenaCatalog(inventory.catalog), [inventory.catalog]);
  const visibleCatalog = useMemo(
    () => filterCatalogBySupplier(baseCatalog, supplierFilter),
    [baseCatalog, supplierFilter],
  );
  const model = useMemo(() => {
    if (!visibleCatalog || !inventory.workspaceSummary) {
      return null;
    }

    return deriveAnalysisViewModel({
      catalog: visibleCatalog,
      currency,
      diagnostics: inventory.diagnostics,
      language,
      observations: inventory.observations,
      scope,
      serviceDetailsById,
      skuDetailsById,
      workspaceSummary: inventory.workspaceSummary,
    });
  }, [
    currency,
    visibleCatalog,
    inventory.diagnostics,
    inventory.observations,
    inventory.workspaceSummary,
    language,
    scope,
    serviceDetailsById,
    skuDetailsById,
  ]);

  if (!model) {
    return null;
  }

  const expandedSelectedIntervalIndex =
    expandedLedgerSelection.type === 'interval'
      ? expandedLedgerSelection.intervalIndex
      : model.intervals?.at(-1)?.intervalIndex ?? null;

  async function handleRun() {
    if (isRunningAnalysis) {
      return;
    }

    setIsRunningAnalysis(true);
    try {
      if (inventory.workspaceSummary?.runId) {
        await inventory.retrySenaRun({ runId: inventory.workspaceSummary.runId });
        return;
      }
      await inventory.triggerSenaRun({ algorithmVersion: 'sena-analysis-v3' });
    } finally {
      setIsRunningAnalysis(false);
    }
  }

  async function handleResetChartZooms() {
    await chartController.handleResetCharts(resetHydratedDetails);
  }

  useEffect(() => {
    chartController.settlePendingTimeframe({
      isHydratingDetails,
      resolvedTimeframe: chartController.timeframe,
      resolvedTimeframeCacheKey,
      timeframeHydrationProgress,
    });
  }, [chartController, isHydratingDetails, resolvedTimeframeCacheKey, timeframeHydrationProgress]);

  function handleCustomTimeframeChange(range: ChartCustomTimeframeRange | null) {
    chartController.handleCustomTimeframeChange(range);
  }

  const showsLoadingIsland =
    isLoadingOlderIntervals ||
    isHydratingDetails ||
    chartController.olderLoadProgress != null ||
    chartController.pendingTimeframe != null ||
    chartController.pendingCustomTimeframeRange != null;
  const heldShowsLoadingIsland = useHeldTradingChartBusy(showsLoadingIsland);

  return (
    <WorkspacePage className="gap-5">
      <LoadingMoreIntervalsIsland
        currentBatch={(timeframeHydrationProgress ?? chartController.olderLoadProgress)?.current ?? null}
        totalBatches={(timeframeHydrationProgress ?? chartController.olderLoadProgress)?.total ?? null}
        visible={heldShowsLoadingIsland}
      />
      <WorkspaceTitleCard
        eyebrow={t('analysisRouteEyebrow')}
        title={t('analysisRouteTitle')}
        descriptor={t('analysisRouteDescriptor')}
        actions={(
          <WorkspaceActionRow className="justify-end">
            {section === 'fragility' ? null : (
              <ToggleGroup
                aria-label={t('analysisRouteScopeAria')}
                className="rounded-full"
                spacing={1}
                type="single"
                value={scope}
                onValueChange={(nextValue) => {
                  if (nextValue) {
                    setScope(nextValue as AnalysisScope);
                  }
                }}
              >
                <ToggleGroupItem value="all">
                  <EntityLayersIcon data-icon="inline-start" />
                  {t('analysisRouteScopeAll')}
                </ToggleGroupItem>
                <ToggleGroupItem value="services">
                  <EntityServiceIcon data-icon="inline-start" />
                  {t('analysisRouteScopeServices')}
                </ToggleGroupItem>
                <ToggleGroupItem value="skus">
                  <EntitySkuIcon data-icon="inline-start" />
                  {t('analysisRouteScopeSkus')}
                </ToggleGroupItem>
                </ToggleGroup>
            )}
            <SupplierFilter
              catalog={baseCatalog}
              className="h-12 w-full rounded-full px-4 data-[size=default]:h-12 sm:w-auto"
              value={supplierFilter}
              onChange={setSupplierFilter}
            />
            <Button
              aria-busy={isRunningAnalysis}
              disabled={inventory.isSaving || isRunningAnalysis}
              type="button"
              onClick={() => void handleRun()}
            >
              <span aria-hidden="true" className={isRunningAnalysis ? 'inline-flex animate-spin' : 'inline-flex'}>
                <ActionResetIcon className="size-4 -scale-x-100" />
              </span>
              {inventory.latestRun ? t('analysisRouteRerunAnalysis') : t('analysisRouteRunAnalysis')}
            </Button>
          </WorkspaceActionRow>
        )}
      >
        <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
          <span>{model.lastUpdatedLabel}</span>
          {isHydratingDetails ? <span>{t('analysisRouteLoadingDetails')}</span> : null}
          <span>{model.internalNavSummary}</span>
        </div>
      </WorkspaceTitleCard>

      {!isLedgerExpanded ? (
        <AnalysisWorkbench
          chartZoomResetToken={chartController.chartZoomResetToken}
          chartLayoutPreferences={chartController.chartLayoutPreferences}
          chartResolution={chartController.chartResolution}
          customChartResolution={chartController.customChartResolution}
          hasOlderIntervals={hasOlderIntervals}
          isHydratingDetails={showsLoadingIsland}
          isVisuallyBusy={heldShowsLoadingIsland}
          isLoadingOlderIntervals={isLoadingOlderIntervals}
          loadOlderIntervals={loadOlderIntervals}
          model={model}
          onChartLayoutPreferencesChange={chartController.handleChartLayoutPreferencesChange}
          onChartResolutionChange={chartController.handleChartResolutionChange}
          customTimeframeRange={chartController.customTimeframeRange}
          onCustomTimeframeChange={handleCustomTimeframeChange}
          onOlderLoadProgressChange={chartController.setOlderLoadProgress}
          onResetCharts={handleResetChartZooms}
          onToggleExpand={() => setLedgerExpanded(true)}
          section={section}
          setSection={setSection}
          setTimeframe={(nextTimeframe) => chartController.handleTimeframeChange(nextTimeframe)}
          showRightRailCards={showRightRailCards}
          timeframe={chartController.timeframe as AnalysisTimeframe}
        />
      ) : (
        <div aria-hidden="true" className="min-h-[100svh] rounded-[2rem]" />
      )}
      {isLedgerExpanded ? (
        <ChartLedgerOverlay
          ariaLabel="Expanded system ledger"
          onClose={() => setLedgerExpanded(false, true)}
        >
            <AnalysisTradingChartLedger
              chartZoomResetToken={chartController.chartZoomResetToken}
              chartLayoutPreferences={chartController.chartLayoutPreferences}
              chartResolution={chartController.chartResolution}
              customChartResolution={chartController.customChartResolution}
              expanded
              hasOlderIntervals={hasOlderIntervals}
              isBusy={showsLoadingIsland}
              isVisuallyBusy={heldShowsLoadingIsland}
              isLoadingOlderIntervals={isLoadingOlderIntervals}
              loadOlderIntervals={loadOlderIntervals}
              model={model}
              onChartLayoutPreferencesChange={chartController.handleChartLayoutPreferencesChange}
              onChartResolutionChange={chartController.handleChartResolutionChange}
              customTimeframeRange={chartController.customTimeframeRange}
              onCustomTimeframeChange={handleCustomTimeframeChange}
              onOlderLoadProgressChange={chartController.setOlderLoadProgress}
              onResetCharts={handleResetChartZooms}
              onToggleExpand={() => setLedgerExpanded(false, true)}
              onTimeframeChange={(nextTimeframe) => chartController.handleTimeframeChange(nextTimeframe)}
              selectedIntervalIndex={expandedSelectedIntervalIndex}
              setSelection={setExpandedLedgerSelection}
              timeframe={chartController.timeframe as AnalysisTimeframe}
            />
        </ChartLedgerOverlay>
      ) : null}
    </WorkspacePage>
  );
}
