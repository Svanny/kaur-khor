import { useMemo } from 'react';
import type { SenaServiceDetailPage } from '@shared/sena';
import type { ChartCustomTimeframeRange, ChartTimeframe } from '@/components/system/chart-timeframe';
import type { ChartCustomResolution, ChartResolutionOption } from '@/components/system/chart-resolution';
import { TradingChartLedger } from '@/components/system/trading-chart/ledger';
import { defaultChartLayoutPreferences, type ChartLayoutPreferenceMergeOptions, type PersistedChartLayoutPreferences } from '@/lib/chart-layout-preferences';
import { translateUiLiteral } from '@/lib/translations';
import { usePreferences } from '@/state/preferences';
import { deriveServiceTradingChartModel } from './trading-chart-adapter';
import type { ServiceDetailViewModel, ServiceInspectorSelection } from './view-model';

function selectedIntervalIndexFromSelection(model: ServiceDetailViewModel, selection: ServiceInspectorSelection) {
  if (selection.type === 'interval' && selection.intervalIndex != null) {
    return selection.intervalIndex;
  }
  return model.intervals.at(-1)?.intervalIndex ?? null;
}

export function ServiceTradingChartLedger({
  chartZoomResetToken = 0,
  expanded = false,
  hasOlderIntervals = false,
  isHydratingDetails = false,
  isVisuallyBusy,
  isLoadingOlderIntervals = false,
  loadOlderIntervals = async () => null,
  model,
  onOlderLoadProgressChange,
  onChartLayoutPreferencesChange = () => {},
  onChartResolutionChange = () => {},
  onCustomTimeframeChange = () => {},
  onResetCharts = () => {},
  onTimeframeChange = () => {},
  onToggleExpand,
  selection,
  setSelection,
  chartResolution,
  chartLayoutPreferences = defaultChartLayoutPreferences(),
  customChartResolution,
  customTimeframeRange = null,
}: {
  chartZoomResetToken?: string | number;
  chartLayoutPreferences?: PersistedChartLayoutPreferences;
  chartResolution?: ChartResolutionOption;
  customChartResolution?: ChartCustomResolution | null;
  customTimeframeRange?: ChartCustomTimeframeRange | null;
  expanded?: boolean;
  hasOlderIntervals: boolean;
  isHydratingDetails: boolean;
  isVisuallyBusy?: boolean;
  isLoadingOlderIntervals: boolean;
  loadOlderIntervals: (limit?: number) => Promise<SenaServiceDetailPage | null>;
  model: ServiceDetailViewModel;
  onChartLayoutPreferencesChange?: (next: Partial<PersistedChartLayoutPreferences>, options?: ChartLayoutPreferenceMergeOptions) => void;
  onChartResolutionChange?: (value: ChartResolutionOption, custom: ChartCustomResolution | null) => void;
  onCustomTimeframeChange?: (value: ChartCustomTimeframeRange | null) => void;
  onOlderLoadProgressChange?: (progress: { current: number; total: number } | null) => void;
  onResetCharts: () => void;
  onTimeframeChange: (value: ChartTimeframe) => void;
  onToggleExpand?: () => void;
  selection: ServiceInspectorSelection;
  setSelection: (value: ServiceInspectorSelection) => void;
  timeframe: ChartTimeframe;
}) {
  const { language, t } = usePreferences();
  const chartModel = useMemo(() => deriveServiceTradingChartModel(model), [model]);

  return (
    <TradingChartLedger
      chartLayoutPreferences={chartLayoutPreferences}
      chartModel={chartModel}
      chartResolution={chartResolution ?? chartLayoutPreferences.chartResolution}
      chartZoomResetToken={chartZoomResetToken}
      customChartResolution={customChartResolution ?? chartLayoutPreferences.customChartResolution}
      customTimeframeRange={customTimeframeRange ?? chartLayoutPreferences.customTimeframeRange}
      expanded={expanded}
      hasOlderIntervals={hasOlderIntervals}
      isBusy={isHydratingDetails || isLoadingOlderIntervals}
      isVisuallyBusy={isVisuallyBusy}
      isLoadingOlderIntervals={isLoadingOlderIntervals}
      loadOlderIntervals={loadOlderIntervals}
      selectedIntervalIndex={selectedIntervalIndexFromSelection(model, selection)}
      subjectId={model.identity.serviceId}
      subtype="service"
      title={translateUiLiteral(language, 'Ledger for {name}', { name: model.identity.name })}
      tooltip={t('catalogServiceLedgerTooltip')}
      onChartLayoutPreferencesChange={onChartLayoutPreferencesChange}
      onChartResolutionChange={onChartResolutionChange}
      onCustomTimeframeChange={onCustomTimeframeChange}
      onOlderLoadProgressChange={onOlderLoadProgressChange}
      onResetCharts={onResetCharts}
      onSelectInterval={(intervalIndex) => setSelection({ type: 'interval', intervalIndex })}
      onTimeframeChange={onTimeframeChange}
      onToggleExpand={onToggleExpand}
    />
  );
}
