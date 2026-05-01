import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import type { ChartCustomTimeframeRange, ChartTimeframe } from '@/components/system/chart-timeframe';
import {
  DEFAULT_CHART_RESOLUTION,
  type ChartCustomResolution,
  type ChartResolutionOption,
} from '@/components/system/chart-resolution';
import { cardFrameClassName, cardSurfaceClassName } from '@/components/ui/card';
import {
  defaultChartLayoutPreferences,
  type ChartLayoutPreferenceMergeOptions,
  writeSubtypeDefaultChartLayoutPreferences,
  type PersistedChartLayoutPreferences,
} from '@/lib/chart-layout-preferences';
import {
  readEntityChartSettings,
  readSubtypeDefaultChartSettings,
  writeEntityChartSettings,
  writeSubtypeDefaultChartSettings,
  type ChartSettingsSubtype,
} from '@/lib/chart-settings-memory';
import { cn } from '@/lib/utils';
import { SectionTitle } from '@/routes/sku-detail/section-heading';
import { SkuTradingChart } from './chart';
import {
  defaultAnalysisTradingChartIndicators,
  defaultServiceTradingChartIndicators,
  defaultTradingChartIndicators,
  normalizeTradingChartIndicatorSettings,
  type TradingChartIndicatorSettings,
  type TradingChartModel,
} from './model';

function defaultTradingChartIndicatorsForSubtype(subtype: ChartSettingsSubtype) {
  if (subtype === 'analysis') {
    return defaultAnalysisTradingChartIndicators();
  }
  if (subtype === 'service') {
    return defaultServiceTradingChartIndicators();
  }
  return defaultTradingChartIndicators();
}

function resolveTradingChartSettings(
  subtype: ChartSettingsSubtype,
  subjectId: string,
): {
  defaultIndicatorSettings: TradingChartIndicatorSettings;
  indicatorSettings: TradingChartIndicatorSettings;
} {
  const defaultIndicatorSettings =
    readSubtypeDefaultChartSettings(subtype, normalizeTradingChartIndicatorSettings) ??
    defaultTradingChartIndicatorsForSubtype(subtype);
  const indicatorSettings =
    readEntityChartSettings(subtype, subjectId, normalizeTradingChartIndicatorSettings) ??
    structuredClone(defaultIndicatorSettings);
  return {
    defaultIndicatorSettings,
    indicatorSettings,
  };
}

export function TradingChartLedger({
  chartLayoutPreferences = defaultChartLayoutPreferences(),
  chartModel,
  additionalPaneMinRenderHeight,
  baseMinRenderHeight,
  chartRenderHeight,
  chartResolution = DEFAULT_CHART_RESOLUTION,
  chartZoomResetToken = 0,
  customChartResolution = null,
  customTimeframeRange = null,
  expanded = false,
  fillAvailableHeight = true,
  hasOlderIntervals = false,
  isBusy = false,
  isVisuallyBusy,
  isLoadingOlderIntervals = false,
  loadOlderIntervals = async () => null,
  onChartLayoutPreferencesChange = () => {},
  onChartResolutionChange = () => {},
  onCustomTimeframeChange = () => {},
  onOlderLoadProgressChange,
  onResetCharts = () => {},
  onSelectInterval,
  onTimeframeChange = () => {},
  onToggleExpand,
  selectedIntervalIndex,
  subjectId,
  subtype,
  title,
  tooltip,
  className,
}: {
  chartLayoutPreferences: PersistedChartLayoutPreferences;
  chartModel: TradingChartModel;
  additionalPaneMinRenderHeight?: number;
  baseMinRenderHeight?: number;
  chartRenderHeight?: CSSProperties['height'];
  chartResolution?: ChartResolutionOption;
  chartZoomResetToken?: string | number;
  customChartResolution?: ChartCustomResolution | null;
  customTimeframeRange?: ChartCustomTimeframeRange | null;
  expanded?: boolean;
  fillAvailableHeight?: boolean;
  hasOlderIntervals: boolean;
  isBusy?: boolean;
  isVisuallyBusy?: boolean;
  isLoadingOlderIntervals: boolean;
  loadOlderIntervals: (limit?: number) => Promise<unknown>;
  onChartLayoutPreferencesChange?: (next: Partial<PersistedChartLayoutPreferences>, options?: ChartLayoutPreferenceMergeOptions) => void;
  onChartResolutionChange?: (value: ChartResolutionOption, custom: ChartCustomResolution | null) => void;
  onCustomTimeframeChange?: (range: ChartCustomTimeframeRange | null) => void;
  onOlderLoadProgressChange?: (progress: { current: number; total: number } | null) => void;
  onResetCharts?: () => Promise<void> | void;
  onSelectInterval: (index: number) => void;
  onTimeframeChange: (value: ChartTimeframe) => void;
  onToggleExpand?: () => void;
  selectedIntervalIndex: number | null;
  subjectId: string;
  subtype: ChartSettingsSubtype;
  title: string;
  tooltip: string;
  className?: string;
}) {
  const initialPersistedSettings = useMemo(
    () => resolveTradingChartSettings(subtype, subjectId),
    [subjectId, subtype],
  );
  const [settingsSubjectKey, setSettingsSubjectKey] = useState(`${subtype}:${subjectId}`);
  const [defaultIndicatorSettings, setDefaultIndicatorSettings] = useState(
    () => initialPersistedSettings.defaultIndicatorSettings,
  );
  const [indicatorSettings, setIndicatorSettings] = useState(
    () => initialPersistedSettings.indicatorSettings,
  );
  const pendingIndicatorSettingsRef = useRef<TradingChartIndicatorSettings | null>(null);
  const indicatorSettingsWriteTimerRef = useRef<number | null>(null);

  useEffect(() => {
    const subjectKey = `${subtype}:${subjectId}`;
    if (settingsSubjectKey === subjectKey) {
      return;
    }
    const nextSettings = resolveTradingChartSettings(subtype, subjectId);
    setSettingsSubjectKey(subjectKey);
    setDefaultIndicatorSettings(nextSettings.defaultIndicatorSettings);
    setIndicatorSettings(nextSettings.indicatorSettings);
  }, [settingsSubjectKey, subjectId, subtype]);

  useEffect(() => {
    const subjectKey = `${subtype}:${subjectId}`;
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
        subtype,
        subjectId,
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
        subtype,
        subjectId,
        pendingIndicatorSettingsRef.current,
        normalizeTradingChartIndicatorSettings,
      );
      pendingIndicatorSettingsRef.current = null;
    };
  }, [indicatorSettings, settingsSubjectKey, subjectId, subtype]);

  function saveDefaultIndicatorSettings(next: TradingChartIndicatorSettings) {
    const normalized = normalizeTradingChartIndicatorSettings(next);
    setDefaultIndicatorSettings(normalized);
    writeSubtypeDefaultChartSettings(subtype, normalized, normalizeTradingChartIndicatorSettings);
    writeSubtypeDefaultChartLayoutPreferences(subtype, chartLayoutPreferences);
  }

  return (
    <section
      className={cn(
        'relative isolate flex min-w-0 flex-col',
        expanded
          ? `${cardFrameClassName} ${cardSurfaceClassName} h-full min-h-0 w-full rounded-[2rem] px-6 py-5`
          : `${cardFrameClassName} ${cardSurfaceClassName} h-full min-h-0 w-full rounded-[2rem] px-6 py-5`,
        className,
      )}
    >
      <div className="flex flex-col gap-2 border-b border-border/60 pb-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-semibold leading-none tracking-normal text-muted-foreground">banji</p>
          <div className="mt-1">
            <SectionTitle helpHref="/settings/help#trading-chart-ledger" title={title} tooltip={tooltip} />
          </div>
        </div>
      </div>

      <div className={cn('mt-5 flex w-full', fillAvailableHeight && 'flex-1')}>
        <SkuTradingChart
          chartModel={chartModel}
          chartResolution={chartResolution}
          chartRenderHeight={chartRenderHeight}
          chartZoomResetToken={chartZoomResetToken}
          additionalPaneMinRenderHeight={additionalPaneMinRenderHeight}
          baseMinRenderHeight={baseMinRenderHeight}
          customChartResolution={customChartResolution}
          customTimeframeRange={customTimeframeRange}
          defaultIndicatorSettings={defaultIndicatorSettings}
          expanded={expanded}
          fillAvailableHeight={fillAvailableHeight}
          hasOlderIntervals={hasOlderIntervals}
          indicatorSettings={indicatorSettings}
          initialPaneHeights={chartLayoutPreferences.paneHeightsSource === 'manual' ? chartLayoutPreferences.paneHeights : {}}
          initialVisibleDateRange={chartLayoutPreferences.visibleDateRange}
          isBusy={isBusy}
          isVisuallyBusy={isVisuallyBusy}
          isLoadingOlderIntervals={isLoadingOlderIntervals}
          loadOlderIntervals={loadOlderIntervals}
          selectedIntervalIndex={selectedIntervalIndex}
          setIndicatorSettings={setIndicatorSettings}
          timeframe={chartLayoutPreferences.timeframe}
          onChartResolutionChange={onChartResolutionChange}
          onCustomTimeframeChange={onCustomTimeframeChange}
          onOlderLoadProgressChange={onOlderLoadProgressChange}
          onPaneHeightsChange={(paneHeights, source) => onChartLayoutPreferencesChange({ paneHeights, paneHeightsSource: source })}
          onReset={onResetCharts}
          onSaveDefaultIndicatorSettings={saveDefaultIndicatorSettings}
          onSelectInterval={onSelectInterval}
          onTimeframeChange={onTimeframeChange}
          onToggleExpand={onToggleExpand}
          onVisibleDateRangeChange={(visibleDateRange, options) => onChartLayoutPreferencesChange({ visibleDateRange }, options)}
        />
      </div>
    </section>
  );
}
