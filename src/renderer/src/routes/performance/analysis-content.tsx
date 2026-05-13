import { useEffect, useMemo, useState } from 'react';
import { ActionResetIcon } from '@icons/actions';
import type { IconComponent } from '@icons';
import { EntityLayersIcon, EntityServiceIcon, EntitySkuIcon } from '@icons/entities';
import { compactFilterControlClassName } from '@/components/system/compact-controls';
import { ResponsiveToggleFilter } from '@/components/system/responsive-toggle-filter';
import { SupplierFilter } from '@/components/system/supplier';
import { RouteBackButton } from '@/components/system/page-navigation';
import { WorkspaceActionRow, WorkspacePage, WorkspaceTitleCard } from '@/components/system/workspace';
import { Button } from '@/components/ui/button';
import { LoadingMoreIntervalsIsland } from '@/components/system/loading-more-intervals-island';
import { ChartLedgerOverlay, useHeldTradingChartBusy, useTradingChartController, type TradingChartController } from '@/components/system/trading-chart';
import type { ChartCustomTimeframeRange, ChartTimeframe } from '@/components/system/chart-timeframe';
import type { AppCurrency, AppLanguage } from '@shared/inventory';
import { activeSenaCatalog, filterCatalogBySupplier, type SupplierFilterValue } from '@/lib/sena-catalog';
import { deriveSavedObservationCount } from '@/lib/observation-count';
import { translateUiLiteral } from '@/lib/translations';
import { usePreferences } from '@/state/preferences';
import { AnalysisWorkbench } from './analysis-workbench';
import { AnalysisTradingChartLedger } from './trading-chart-ledger';
import {
  type AnalysisScope,
  type AnalysisSection,
  type AnalysisSelection,
  deriveAnalysisViewModel,
} from './analysis-view-model';
import { MetricRibbon } from '@/components/system/metric-ribbon';
import type { InventoryContextValue } from '@/state/inventory';
import type { AnalysisTimeframe } from './analysis-timeframe';

type AnalysisContentProps = {
  currency: AppCurrency;
  hasOlderIntervals: boolean;
  inventory: InventoryContextValue;
  isHydratingDetails: boolean;
  isLoadingOlderIntervals: boolean;
  language: AppLanguage;
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
  const { t, showHeartbeatRibbons } = usePreferences();
  const analysisScopeOptions = [
    { icon: EntityLayersIcon, label: t('analysisRouteScopeAll'), value: 'all' },
    { icon: EntityServiceIcon, label: t('analysisRouteScopeServices'), value: 'services' },
    { icon: EntitySkuIcon, label: t('analysisRouteScopeSkus'), value: 'skus' },
  ] satisfies Array<{ icon: IconComponent; label: string; value: AnalysisScope }>;
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
      availableObservationCount: deriveSavedObservationCount(inventory),
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
    <WorkspacePage fitViewport className="gap-5">
      {!isLedgerExpanded ? (
        <LoadingMoreIntervalsIsland
          currentBatch={(timeframeHydrationProgress ?? chartController.olderLoadProgress)?.current ?? null}
          totalBatches={(timeframeHydrationProgress ?? chartController.olderLoadProgress)?.total ?? null}
          visible={heldShowsLoadingIsland}
        />
      ) : null}
      <WorkspaceTitleCard
        helperExemptReason="Analysis title card descriptor supplies route-level guidance."
        title={
          <span className="flex min-w-0 items-center gap-3">
            <RouteBackButton className="shrink-0" />
            <span className="truncate">{t('analysisRouteTitle')}</span>
          </span>
        }
        descriptor={t('analysisRouteDescriptor')}
        actions={(
          <WorkspaceActionRow className="justify-end">
            {section === 'fragility' ? null : (
              <ResponsiveToggleFilter
                ariaLabel={t('analysisRouteScopeAria')}
                toggleClassName="rounded-full"
                options={analysisScopeOptions}
                value={scope}
                onValueChange={setScope}
              />
            )}
            <SupplierFilter
              catalog={baseCatalog}
              className={compactFilterControlClassName}
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
        {showHeartbeatRibbons && model.ribbon ? (
          <MetricRibbon
            columns={6}
            items={model.ribbon.map((metric) => ({
              key: metric.key,
              label: metric.label,
              value: metric.value,
              detail: metric.detail,
            }))}
          />
        ) : null}
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
      ) : null}
      {isLedgerExpanded ? (
        <ChartLedgerOverlay
          ariaLabel={translateUiLiteral(language, 'Expanded system ledger')}
          closeAriaLabel={translateUiLiteral(language, 'Close expanded chart overlay')}
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
