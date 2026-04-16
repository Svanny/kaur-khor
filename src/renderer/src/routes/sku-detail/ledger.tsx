import { useEffect, useMemo, useRef, useState } from 'react';
import type { SenaSkuDetailPage } from '@shared/sena';
import { StatusLoadingIcon } from '@icons/status';
import type { ChartCustomTimeframeRange, ChartTimeframe } from '@/components/system/chart-timeframe';
import {
  DEFAULT_CHART_RESOLUTION,
  type ChartCustomResolution,
  type ChartResolutionOption,
} from '@/components/system/chart-resolution';
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
import { cardFrameClassName, cardSurfaceClassName } from '@/components/ui/card';
import {
  readEntityChartSettings,
  readSubtypeDefaultChartSettings,
  writeEntityChartSettings,
  writeSubtypeDefaultChartSettings,
  type ChartSettingsSubtype,
} from '@/lib/chart-settings-memory';
import type { PersistedChartLayoutPreferences } from '@/lib/chart-layout-preferences';
import { cn } from '@/lib/utils';
import { usePreferences } from '@/state/preferences';
import { SectionTitle } from './section-heading';
import { SkuTradingChart } from './trading-chart';
import {
  defaultTradingChartIndicators,
  deriveTradingChartModel,
  normalizeTradingChartIndicatorSettings,
  type TradingChartIndicatorSettings,
} from './trading-chart-model';
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

function resolveTradingChartSettings(
  subtype: ChartSettingsSubtype,
  subjectId: string,
): {
  defaultIndicatorSettings: TradingChartIndicatorSettings;
  indicatorSettings: TradingChartIndicatorSettings;
} {
  const defaultIndicatorSettings =
    readSubtypeDefaultChartSettings(subtype, normalizeTradingChartIndicatorSettings) ?? defaultTradingChartIndicators();
  const indicatorSettings =
    readEntityChartSettings(subtype, subjectId, normalizeTradingChartIndicatorSettings) ??
    structuredClone(defaultIndicatorSettings);
  return {
    defaultIndicatorSettings,
    indicatorSettings,
  };
}

export function SkuDetailLedger({
  chartSettingsSubtype = 'sku',
  chartLayoutPreferences,
  chartResolution = DEFAULT_CHART_RESOLUTION,
  chartZoomResetToken = 0,
  customTimeframeRange = null,
  customChartResolution = null,
  expanded = false,
  hasOlderIntervals = false,
  isHydratingDetails = false,
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
  timeframe = 'Recent',
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
  isLoadingOlderIntervals: boolean;
  loadOlderIntervals: (limit?: number) => Promise<SenaSkuDetailPage | null>;
  model: SenaSkuDetailViewModel;
  onOlderLoadProgressChange?: (progress: { current: number; total: number } | null) => void;
  onChartResolutionChange?: (value: ChartResolutionOption, custom: ChartCustomResolution | null) => void;
  onChartLayoutPreferencesChange?: (next: Partial<PersistedChartLayoutPreferences>) => void;
  onCustomTimeframeChange?: (range: ChartCustomTimeframeRange | null) => void;
  onResetCharts: () => void;
  onSaveDefaultChartLayoutPreferences?: (next: PersistedChartLayoutPreferences) => void;
  onTimeframeChange: (value: ChartTimeframe) => void;
  onToggleExpand?: () => void;
  selectedIntervalIndex: number | null;
  setSelectedIntervalIndex: (index: number) => void;
  timeframe: ChartTimeframe;
}) {
  const { t } = usePreferences();
  const initialPersistedSettings = resolveTradingChartSettings(chartSettingsSubtype, model.identity.skuId);
  const [settingsSubjectKey, setSettingsSubjectKey] = useState(`${chartSettingsSubtype}:${model.identity.skuId}`);
  const [defaultIndicatorSettings, setDefaultIndicatorSettings] = useState(
    () => initialPersistedSettings.defaultIndicatorSettings,
  );
  const [indicatorSettings, setIndicatorSettings] = useState(
    () => initialPersistedSettings.indicatorSettings,
  );
  const pendingIndicatorSettingsRef = useRef<TradingChartIndicatorSettings | null>(null);
  const indicatorSettingsWriteTimerRef = useRef<number | null>(null);
  const chartModel = useMemo(() => deriveTradingChartModel(model), [model]);
  const isBusy = isHydratingDetails || isLoadingOlderIntervals;

  useEffect(() => {
    const subjectKey = `${chartSettingsSubtype}:${model.identity.skuId}`;
    if (settingsSubjectKey === subjectKey) {
      return;
    }
    const nextSettings = resolveTradingChartSettings(chartSettingsSubtype, model.identity.skuId);
    setSettingsSubjectKey(subjectKey);
    setDefaultIndicatorSettings(nextSettings.defaultIndicatorSettings);
    setIndicatorSettings(nextSettings.indicatorSettings);
  }, [chartSettingsSubtype, model.identity.skuId, settingsSubjectKey]);

  useEffect(() => {
    const subjectKey = `${chartSettingsSubtype}:${model.identity.skuId}`;
    if (settingsSubjectKey !== subjectKey) {
      return;
    }
    pendingIndicatorSettingsRef.current = indicatorSettings;
    if (indicatorSettingsWriteTimerRef.current != null) {
      window.clearTimeout(indicatorSettingsWriteTimerRef.current);
    }
    indicatorSettingsWriteTimerRef.current = window.setTimeout(() => {
      indicatorSettingsWriteTimerRef.current = null;
      if (!pendingIndicatorSettingsRef.current) {
        return;
      }
      writeEntityChartSettings(
        chartSettingsSubtype,
        model.identity.skuId,
        pendingIndicatorSettingsRef.current,
        normalizeTradingChartIndicatorSettings,
      );
      pendingIndicatorSettingsRef.current = null;
    }, 120);
    return () => {
      if (indicatorSettingsWriteTimerRef.current != null) {
        window.clearTimeout(indicatorSettingsWriteTimerRef.current);
        indicatorSettingsWriteTimerRef.current = null;
      }
      if (!pendingIndicatorSettingsRef.current) {
        return;
      }
      writeEntityChartSettings(
        chartSettingsSubtype,
        model.identity.skuId,
        pendingIndicatorSettingsRef.current,
        normalizeTradingChartIndicatorSettings,
      );
      pendingIndicatorSettingsRef.current = null;
    };
  }, [chartSettingsSubtype, indicatorSettings, model.identity.skuId, settingsSubjectKey]);

  function saveDefaultIndicatorSettings(next: TradingChartIndicatorSettings) {
    const normalized = normalizeTradingChartIndicatorSettings(next);
    setDefaultIndicatorSettings(normalized);
    writeSubtypeDefaultChartSettings(chartSettingsSubtype, normalized, normalizeTradingChartIndicatorSettings);
    onSaveDefaultChartLayoutPreferences(chartLayoutPreferences);
  }

  return (
    <section
      className={cn(
        'relative isolate flex min-w-0 flex-col',
        expanded
          ? `${cardFrameClassName} ${cardSurfaceClassName} h-full min-h-0 w-full rounded-[2rem] px-6 py-5`
          : `${cardFrameClassName} ${cardSurfaceClassName} min-h-[100svh] self-start rounded-[2rem] px-6 py-5`,
      )}
    >
      <div className="flex flex-col gap-2 border-b border-border/60 pb-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">Banji</p>
          <div className="mt-1">
            <SectionTitle title={`Ledger for ${model.identity.name}`} tooltip={t('catalogSenaSkuLedgerTooltip')} />
          </div>
        </div>
      </div>

      <div className="mt-5 flex min-h-0 flex-1">
        <SkuTradingChart
          chartModel={chartModel}
          chartResolution={chartResolution}
          chartZoomResetToken={chartZoomResetToken}
          customChartResolution={customChartResolution}
          customTimeframeRange={customTimeframeRange}
          defaultIndicatorSettings={defaultIndicatorSettings}
          expanded={expanded}
          hasOlderIntervals={hasOlderIntervals}
          indicatorSettings={indicatorSettings}
          initialPaneHeights={chartLayoutPreferences.paneHeights}
          initialVisibleDateRange={chartLayoutPreferences.visibleDateRange}
          isBusy={isBusy}
          isLoadingOlderIntervals={isLoadingOlderIntervals}
          loadOlderIntervals={loadOlderIntervals}
          selectedIntervalIndex={selectedIntervalIndex}
          setIndicatorSettings={setIndicatorSettings}
          timeframe={timeframe}
          onCustomTimeframeChange={onCustomTimeframeChange}
          onChartResolutionChange={onChartResolutionChange}
          onPaneHeightsChange={(paneHeights) => onChartLayoutPreferencesChange({ paneHeights })}
          onOlderLoadProgressChange={onOlderLoadProgressChange}
          onReset={onResetCharts}
          onSaveDefaultIndicatorSettings={saveDefaultIndicatorSettings}
          onSelectInterval={setSelectedIntervalIndex}
          onTimeframeChange={onTimeframeChange}
          onToggleExpand={onToggleExpand}
          onVisibleDateRangeChange={(visibleDateRange) => onChartLayoutPreferencesChange({ visibleDateRange })}
        />
      </div>
      {expanded && isBusy ? (
        <div className="pointer-events-none absolute inset-0 z-[140] flex items-center justify-center bg-white/10">
          <div className="inline-flex items-center gap-3 rounded-[1.2rem] border border-[rgba(95,61,39,0.28)] bg-[rgba(63,39,25,0.96)] px-4 py-3 text-sm font-medium text-[rgba(255,248,241,0.98)] shadow-[0_20px_44px_rgba(48,31,20,0.28)] backdrop-blur-[14px]">
            <StatusLoadingIcon className="size-4 animate-spin text-[rgba(255,232,209,0.95)]" />
            <span>Loading data</span>
          </div>
        </div>
      ) : null}
    </section>
  );
}
