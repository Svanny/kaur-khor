import { useMemo } from 'react';
import type { SenaSkuDetailPage } from '@shared/sena';
import type { ChartCustomTimeframeRange, ChartTimeframe } from '@/components/system/chart-timeframe';
import type { ChartCustomResolution, ChartResolutionOption } from '@/components/system/chart-resolution';
import {
  classifyWheelIntent,
  deriveAnchoredZoomScrollLeft,
  deriveAxisContentWidth,
  deriveCenteredIntervalScrollLeft,
  deriveSlotCenterX,
  deriveSlotLeftX,
  deriveVisibleWindow,
  intervalLabelForWidth,
  intervalTooltipLabel,
  isPinchZoomGesture,
  responsivePillLabel,
} from '@/components/system/interval-strip';
import {
  buildSparsePolylineSegments,
  deriveLabelGutterOffset,
} from '@/components/system/timeline-chart';
import { TradingChartLedger } from '@/components/system/trading-chart/ledger';
import type { ChartSettingsSubtype } from '@/lib/chart/chart-settings-memory';
import { defaultChartLayoutPreferences, type ChartLayoutPreferenceMergeOptions, type PersistedChartLayoutPreferences } from '@/lib/chart/chart-layout-preferences';
import { translateUiLiteral } from '@/lib/localization/translations';
import { usePreferences } from '@/state/preferences';
import { deriveTradingChartModel } from './trading-chart-model';
import type { SenaSkuDetailViewModel } from './view-model';

export {
  classifyWheelIntent,
  deriveAnchoredZoomScrollLeft,
  deriveAxisContentWidth,
  deriveCenteredIntervalScrollLeft,
  deriveSlotCenterX,
  deriveSlotLeftX,
  deriveVisibleWindow,
  isPinchZoomGesture,
  intervalLabelForWidth,
  intervalTooltipLabel,
  responsivePillLabel,
} from '@/components/system/interval-strip';
export {
  buildSparsePolylineSegments,
  deriveLabelGutterOffset,
} from '@/components/system/timeline-chart';

export function SkuDetailLedger({
  chartSettingsSubtype = 'sku',
  chartLayoutPreferences = defaultChartLayoutPreferences(),
  chartResolution,
  chartZoomResetToken = 0,
  customTimeframeRange = null,
  customChartResolution = null,
  expanded = false,
  hasOlderIntervals = false,
  isHydratingDetails = false,
  isVisuallyBusy,
  isLoadingOlderIntervals = false,
  loadOlderIntervals = async () => null,
  model,
  onOlderLoadProgressChange,
  onCustomTimeframeChange,
  onChartResolutionChange = () => {},
  onChartLayoutPreferencesChange = () => {},
  onResetCharts = () => {},
  onSaveDefaultChartLayoutPreferences = () => {},
  onTimeframeChange = () => {},
  onToggleExpand,
  selectedIntervalIndex,
  setSelectedIntervalIndex,
}: {
  chartSettingsSubtype?: ChartSettingsSubtype;
  chartLayoutPreferences: PersistedChartLayoutPreferences;
  chartResolution?: ChartResolutionOption;
  chartZoomResetToken?: string | number;
  customChartResolution?: ChartCustomResolution | null;
  customTimeframeRange?: ChartCustomTimeframeRange | null;
  expanded?: boolean;
  hasOlderIntervals: boolean;
  isHydratingDetails: boolean;
  isVisuallyBusy?: boolean;
  isLoadingOlderIntervals: boolean;
  loadOlderIntervals: (limit?: number) => Promise<SenaSkuDetailPage | null>;
  model: SenaSkuDetailViewModel;
  onOlderLoadProgressChange?: (progress: { current: number; total: number } | null) => void;
  onChartResolutionChange?: (value: ChartResolutionOption, custom: ChartCustomResolution | null) => void;
  onChartLayoutPreferencesChange?: (next: Partial<PersistedChartLayoutPreferences>, options?: ChartLayoutPreferenceMergeOptions) => void;
  onCustomTimeframeChange?: (range: ChartCustomTimeframeRange | null) => void;
  onResetCharts: () => void;
  onSaveDefaultChartLayoutPreferences?: (next: PersistedChartLayoutPreferences) => void;
  onTimeframeChange: (value: ChartTimeframe) => void;
  onToggleExpand?: () => void;
  selectedIntervalIndex: number | null;
  setSelectedIntervalIndex: (index: number) => void;
  timeframe: ChartTimeframe;
}) {
  const { language, t } = usePreferences();
  const chartModel = useMemo(() => deriveTradingChartModel(model), [model]);

  return (
    <TradingChartLedger
      chartLayoutPreferences={chartLayoutPreferences}
      chartModel={chartModel}
      chartResolution={chartResolution}
      chartZoomResetToken={chartZoomResetToken}
      customChartResolution={customChartResolution}
      customTimeframeRange={customTimeframeRange}
      expanded={expanded}
      fillAvailableHeight={expanded}
      hasOlderIntervals={hasOlderIntervals}
      isBusy={isHydratingDetails || isLoadingOlderIntervals}
      isVisuallyBusy={isVisuallyBusy}
      isLoadingOlderIntervals={isLoadingOlderIntervals}
      loadOlderIntervals={loadOlderIntervals}
      selectedIntervalIndex={selectedIntervalIndex}
      subjectId={model.identity.skuId}
      subtype={chartSettingsSubtype}
      title={translateUiLiteral(language, 'Ledger for {name}', { name: model.identity.name })}
      tooltip={t('catalogSenaSkuLedgerTooltip')}
      onChartLayoutPreferencesChange={onChartLayoutPreferencesChange}
      onChartResolutionChange={onChartResolutionChange}
      onCustomTimeframeChange={onCustomTimeframeChange}
      onOlderLoadProgressChange={onOlderLoadProgressChange}
      onResetCharts={onResetCharts}
      onSelectInterval={setSelectedIntervalIndex}
      onTimeframeChange={onTimeframeChange}
      onToggleExpand={onToggleExpand}
    />
  );
}
