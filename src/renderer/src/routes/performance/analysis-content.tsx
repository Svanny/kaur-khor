import { useEffect, useMemo, useState } from 'react';
import { Layers3, Package, RefreshCcw, Store } from 'lucide-react';
import { WorkspaceActionRow, WorkspacePage, WorkspaceTitleCard } from '@/components/system/workspace';
import { Button } from '@/components/ui/button';
import { LoadingMoreIntervalsIsland } from '@/components/system/loading-more-intervals-island';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { AnalysisWorkbench } from './analysis-workbench';
import {
  type AnalysisScope,
  type AnalysisSection,
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
  scope: AnalysisScope;
  section: AnalysisSection;
  serviceDetailsById: Record<string, import('@shared/sena').SenaServiceDetail | null>;
  setScope: (scope: AnalysisScope) => void;
  setSection: (section: AnalysisSection) => void;
  setTimeframe: (timeframe: AnalysisTimeframe) => void;
  showRightRailCards: boolean;
  skuDetailsById: Record<string, import('@shared/sena').SenaSkuDetail | null>;
  timeframe: AnalysisTimeframe;
  timeframeHydrationProgress: { current: number; total: number } | null;
};

export function AnalysisContent({
  currency,
  hasOlderIntervals,
  inventory,
  isHydratingDetails,
  isLoadingOlderIntervals,
  language,
  loadOlderIntervals,
  resetHydratedDetails,
  scope,
  section,
  serviceDetailsById,
  setScope,
  setSection,
  setTimeframe,
  showRightRailCards,
  skuDetailsById,
  timeframe,
  timeframeHydrationProgress,
}: AnalysisContentProps) {
  const [isRunningAnalysis, setIsRunningAnalysis] = useState(false);
  const [chartZoomResetToken, setChartZoomResetToken] = useState(0);
  const [olderLoadProgress, setOlderLoadProgress] = useState<{ current: number; total: number } | null>(null);
  const [pendingTimeframe, setPendingTimeframe] = useState<AnalysisTimeframe | null>(null);
  const model = useMemo(() => {
    if (!inventory.catalog || !inventory.workspaceSummary) {
      return null;
    }

    return deriveAnalysisViewModel({
      catalog: inventory.catalog,
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
    inventory.catalog,
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
      await inventory.triggerSenaRun({ algorithmVersion: 'sena-analysis-v1' });
    } finally {
      setIsRunningAnalysis(false);
    }
  }

  async function handleResetChartZooms() {
    setOlderLoadProgress(null);
    await resetHydratedDetails();
    setChartZoomResetToken((current) => current + 1);
  }

  function handleTimeframeChange(nextTimeframe: AnalysisTimeframe) {
    if (nextTimeframe === timeframe) {
      return;
    }
    setOlderLoadProgress(null);
    setPendingTimeframe(nextTimeframe);
    setTimeframe(nextTimeframe);
    setChartZoomResetToken((current) => current + 1);
  }

  useEffect(() => {
    if (pendingTimeframe == null) {
      return;
    }
    if (timeframe !== pendingTimeframe) {
      return;
    }
    if (isHydratingDetails || timeframeHydrationProgress != null) {
      setPendingTimeframe(null);
    }
  }, [isHydratingDetails, pendingTimeframe, timeframe, timeframeHydrationProgress]);

  const showsLoadingIsland =
    isLoadingOlderIntervals ||
    isHydratingDetails ||
    olderLoadProgress != null ||
    pendingTimeframe != null;
  const activeLoadProgress = timeframeHydrationProgress ?? olderLoadProgress;

  return (
    <WorkspacePage className="gap-5">
      <LoadingMoreIntervalsIsland
        currentBatch={activeLoadProgress?.current ?? null}
        totalBatches={activeLoadProgress?.total ?? null}
        visible={showsLoadingIsland}
      />
      <WorkspaceTitleCard
        eyebrow="Analysis"
        title="Deep Review"
        description="Inspect how SENA reconstructed demand, order flow, receipts, lead-time drift, and price effects from sparse observations."
        actions={(
          <WorkspaceActionRow className="justify-end">
            {section === 'fragility' ? null : (
              <ToggleGroup
                aria-label="Select analysis scope"
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
                  <Layers3 data-icon="inline-start" />
                  All
                </ToggleGroupItem>
                <ToggleGroupItem value="services">
                  <Store data-icon="inline-start" />
                  Services
                </ToggleGroupItem>
                <ToggleGroupItem value="skus">
                  <Package data-icon="inline-start" />
                  SKUs
                </ToggleGroupItem>
                </ToggleGroup>
            )}
            <Button
              aria-busy={isRunningAnalysis}
              disabled={inventory.isSaving || isRunningAnalysis}
              type="button"
              variant="outline"
              onClick={() => void handleRun()}
            >
              <span aria-hidden="true" className={isRunningAnalysis ? 'inline-flex animate-spin' : 'inline-flex'}>
                <RefreshCcw className="size-4 -scale-x-100" />
              </span>
              {inventory.latestRun ? 'Re-run analysis' : 'Run analysis'}
            </Button>
          </WorkspaceActionRow>
        )}
      >
        <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
          <span>{model.lastUpdatedLabel}</span>
          {isHydratingDetails ? <span>Hydrating entity posteriors…</span> : null}
          <span>{model.internalNavSummary}</span>
        </div>
      </WorkspaceTitleCard>

      <AnalysisWorkbench
        chartZoomResetToken={chartZoomResetToken}
        hasOlderIntervals={hasOlderIntervals}
        isLoadingOlderIntervals={isLoadingOlderIntervals}
        loadOlderIntervals={loadOlderIntervals}
        model={model}
        onOlderLoadProgressChange={setOlderLoadProgress}
        onResetCharts={handleResetChartZooms}
        section={section}
        setSection={setSection}
        setTimeframe={handleTimeframeChange}
        showRightRailCards={showRightRailCards}
        timeframe={timeframe}
      />
    </WorkspacePage>
  );
}
