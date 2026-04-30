import { useMemo } from 'react';
import type { ChartCustomTimeframeRange } from '@/components/system/chart-timeframe';
import type { ChartCustomResolution, ChartResolutionOption } from '@/components/system/chart-resolution';
import { TradingChartLedger } from '@/components/system/trading-chart/ledger';
import { defaultChartLayoutPreferences, type ChartLayoutPreferenceMergeOptions, type PersistedChartLayoutPreferences } from '@/lib/chart-layout-preferences';
import type { AnalysisSelection, AnalysisWorkbenchViewModel } from './analysis-view-model';
import type { AnalysisTimeframe } from './analysis-timeframe';
import { deriveAnalysisTradingChartModel } from './trading-chart-adapter';

export function AnalysisTradingChartLedger({
  chartZoomResetToken = 0,
  chartLayoutPreferences = defaultChartLayoutPreferences(),
  chartResolution,
  customChartResolution,
  customTimeframeRange = null,
  expanded = false,
  hasOlderIntervals,
  isBusy = false,
  isVisuallyBusy,
  isLoadingOlderIntervals,
  loadOlderIntervals,
  model,
  onChartLayoutPreferencesChange = () => {},
  onChartResolutionChange = () => {},
  onCustomTimeframeChange = () => {},
  onOlderLoadProgressChange,
  onResetCharts,
  onTimeframeChange,
  onToggleExpand,
  selectedIntervalIndex,
  setSelection,
}: {
  chartZoomResetToken?: number;
  chartLayoutPreferences?: PersistedChartLayoutPreferences;
  chartResolution?: ChartResolutionOption;
  customChartResolution?: ChartCustomResolution | null;
  customTimeframeRange?: ChartCustomTimeframeRange | null;
  expanded?: boolean;
  hasOlderIntervals: boolean;
  isBusy?: boolean;
  isVisuallyBusy?: boolean;
  isLoadingOlderIntervals: boolean;
  loadOlderIntervals: (limit?: number) => Promise<number>;
  model: AnalysisWorkbenchViewModel;
  onChartLayoutPreferencesChange?: (next: Partial<PersistedChartLayoutPreferences>, options?: ChartLayoutPreferenceMergeOptions) => void;
  onChartResolutionChange?: (value: ChartResolutionOption, custom: ChartCustomResolution | null) => void;
  onCustomTimeframeChange?: (value: ChartCustomTimeframeRange | null) => void;
  onOlderLoadProgressChange?: (progress: { current: number; total: number } | null) => void;
  onResetCharts?: () => Promise<void> | void;
  onTimeframeChange: (value: AnalysisTimeframe) => void;
  onToggleExpand?: () => void;
  selectedIntervalIndex: number | null;
  setSelection: (value: AnalysisSelection) => void;
  timeframe: AnalysisTimeframe;
}) {
  const chartModel = useMemo(() => deriveAnalysisTradingChartModel(model), [model]);

  return (
    <TradingChartLedger
      chartLayoutPreferences={chartLayoutPreferences}
      chartModel={chartModel}
      chartResolution={chartResolution ?? chartLayoutPreferences.chartResolution}
      chartZoomResetToken={chartZoomResetToken}
      additionalPaneMinRenderHeight={30}
      baseMinRenderHeight={160}
      chartRenderHeight={expanded ? undefined : 'clamp(300px, calc(100svh - 360px), 520px)'}
      className={expanded ? 'h-full' : 'h-auto'}
      customChartResolution={customChartResolution ?? chartLayoutPreferences.customChartResolution}
      customTimeframeRange={customTimeframeRange ?? chartLayoutPreferences.customTimeframeRange}
      expanded={expanded}
      fillAvailableHeight={expanded}
      hasOlderIntervals={hasOlderIntervals}
      isBusy={isBusy}
      isVisuallyBusy={isVisuallyBusy}
      isLoadingOlderIntervals={isLoadingOlderIntervals}
      loadOlderIntervals={loadOlderIntervals}
      selectedIntervalIndex={selectedIntervalIndex}
      subjectId="workbench"
      subtype="analysis"
      title="System timeline"
      tooltip="Shared analysis chart workspace across inventory, orders, and lead time indicators."
      onChartLayoutPreferencesChange={onChartLayoutPreferencesChange}
      onChartResolutionChange={onChartResolutionChange}
      onCustomTimeframeChange={onCustomTimeframeChange}
      onOlderLoadProgressChange={onOlderLoadProgressChange}
      onResetCharts={() => onResetCharts?.()}
      onSelectInterval={(intervalIndex) => setSelection({ type: 'interval', intervalIndex })}
      onTimeframeChange={(value) => onTimeframeChange(value as AnalysisTimeframe)}
      onToggleExpand={onToggleExpand}
    />
  );
}
