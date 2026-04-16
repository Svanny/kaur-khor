import { useEffect, useMemo, useRef, useState } from 'react';
import { StatusLoadingIcon } from '@icons/status';
import type { ChartCustomTimeframeRange } from '@/components/system/chart-timeframe';
import {
  DEFAULT_CHART_RESOLUTION,
  type ChartCustomResolution,
  type ChartResolutionOption,
} from '@/components/system/chart-resolution';
import {
  defaultChartLayoutPreferences,
  normalizeChartLayoutPreferences,
  readEntityChartLayoutPreferences,
  readSubtypeDefaultChartLayoutPreferences,
  writeEntityChartLayoutPreferences,
  writeSubtypeDefaultChartLayoutPreferences,
  type PersistedChartLayoutPreferences,
} from '@/lib/chart-layout-preferences';
import {
  readEntityChartSettings,
  readSubtypeDefaultChartSettings,
  writeEntityChartSettings,
  writeSubtypeDefaultChartSettings,
} from '@/lib/chart-settings-memory';
import { cn } from '@/lib/utils';
import { cardFrameClassName, cardSurfaceClassName } from '@/components/ui/card';
import { SectionTitle } from '@/routes/sku-detail/section-heading';
import { SkuTradingChart } from '@/routes/sku-detail/trading-chart';
import {
  defaultAnalysisTradingChartIndicators,
  normalizeTradingChartIndicatorSettings,
  type TradingChartIndicatorSettings,
} from '@/routes/sku-detail/trading-chart-model';
import type { AnalysisSelection, AnalysisWorkbenchViewModel } from './analysis-view-model';
import type { AnalysisTimeframe } from './analysis-timeframe';
import { deriveAnalysisTradingChartModel } from './trading-chart-adapter';

function resolveAnalysisChartSettings(subjectId: string) {
  const defaultIndicatorSettings =
    readSubtypeDefaultChartSettings('analysis', normalizeTradingChartIndicatorSettings) ?? defaultAnalysisTradingChartIndicators();
  const indicatorSettings =
    readEntityChartSettings('analysis', subjectId, normalizeTradingChartIndicatorSettings) ??
    structuredClone(defaultIndicatorSettings);
  return {
    defaultIndicatorSettings,
    indicatorSettings,
  };
}

function resolveAnalysisChartLayoutPreferences(subjectId: string) {
  return normalizeChartLayoutPreferences(
    readEntityChartLayoutPreferences('analysis', subjectId) ??
    readSubtypeDefaultChartLayoutPreferences('analysis') ??
    defaultChartLayoutPreferences(),
  );
}

export function AnalysisTradingChartLedger({
  chartZoomResetToken = 0,
  expanded = false,
  hasOlderIntervals,
  isBusy = false,
  isLoadingOlderIntervals,
  loadOlderIntervals,
  model,
  onOlderLoadProgressChange,
  onResetCharts,
  onTimeframeChange,
  onToggleExpand,
  selectedIntervalIndex,
  setSelection,
  timeframe,
}: {
  chartZoomResetToken?: number;
  expanded?: boolean;
  hasOlderIntervals: boolean;
  isBusy?: boolean;
  isLoadingOlderIntervals: boolean;
  loadOlderIntervals: (limit?: number) => Promise<number>;
  model: AnalysisWorkbenchViewModel;
  onOlderLoadProgressChange?: (progress: { current: number; total: number } | null) => void;
  onResetCharts?: () => Promise<void> | void;
  onTimeframeChange: (value: AnalysisTimeframe) => void;
  onToggleExpand?: () => void;
  selectedIntervalIndex: number | null;
  setSelection: (value: AnalysisSelection) => void;
  timeframe: AnalysisTimeframe;
}) {
  const subjectId = 'workbench';
  const initialSettings = useMemo(() => resolveAnalysisChartSettings(subjectId), [subjectId]);
  const initialLayoutPreferences = useMemo(() => resolveAnalysisChartLayoutPreferences(subjectId), [subjectId]);
  const [defaultIndicatorSettings, setDefaultIndicatorSettings] = useState(() => initialSettings.defaultIndicatorSettings);
  const [indicatorSettings, setIndicatorSettings] = useState(() => initialSettings.indicatorSettings);
  const [chartLayoutPreferences, setChartLayoutPreferences] = useState<PersistedChartLayoutPreferences>(() => initialLayoutPreferences);
  const [chartResolution, setChartResolution] = useState<ChartResolutionOption>(() => initialLayoutPreferences.chartResolution);
  const [customChartResolution, setCustomChartResolution] = useState<ChartCustomResolution | null>(() => initialLayoutPreferences.customChartResolution);
  const [customTimeframeRange, setCustomTimeframeRange] = useState<ChartCustomTimeframeRange | null>(() => initialLayoutPreferences.customTimeframeRange);
  const pendingIndicatorSettingsRef = useRef<TradingChartIndicatorSettings | null>(null);
  const indicatorSettingsWriteTimerRef = useRef<number | null>(null);
  const chartModel = useMemo(() => deriveAnalysisTradingChartModel(model), [model]);

  useEffect(() => {
    pendingIndicatorSettingsRef.current = indicatorSettings;
    if (indicatorSettingsWriteTimerRef.current != null) {
      window.clearTimeout(indicatorSettingsWriteTimerRef.current);
    }
    indicatorSettingsWriteTimerRef.current = window.setTimeout(() => {
      indicatorSettingsWriteTimerRef.current = null;
      if (!pendingIndicatorSettingsRef.current) {
        return;
      }
      writeEntityChartSettings('analysis', subjectId, pendingIndicatorSettingsRef.current, normalizeTradingChartIndicatorSettings);
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
      writeEntityChartSettings('analysis', subjectId, pendingIndicatorSettingsRef.current, normalizeTradingChartIndicatorSettings);
      pendingIndicatorSettingsRef.current = null;
    };
  }, [indicatorSettings, subjectId]);

  useEffect(() => {
    writeEntityChartLayoutPreferences('analysis', subjectId, chartLayoutPreferences);
  }, [chartLayoutPreferences, subjectId]);

  function saveDefaultIndicatorSettings(next: TradingChartIndicatorSettings) {
    const normalized = normalizeTradingChartIndicatorSettings(next);
    setDefaultIndicatorSettings(normalized);
    writeSubtypeDefaultChartSettings('analysis', normalized, normalizeTradingChartIndicatorSettings);
    writeSubtypeDefaultChartLayoutPreferences('analysis', chartLayoutPreferences);
  }

  function updateChartLayoutPreferences(next: Partial<PersistedChartLayoutPreferences>) {
    setChartLayoutPreferences((current) => normalizeChartLayoutPreferences({
      ...current,
      ...next,
    }));
  }

  return (
    <section
      className={cn(
        'relative isolate flex w-full min-w-0 flex-col',
        expanded
          ? `${cardFrameClassName} ${cardSurfaceClassName} h-full min-h-0 rounded-[2rem] px-6 py-5`
          : `${cardFrameClassName} ${cardSurfaceClassName} rounded-[2rem] px-6 py-5`,
      )}
    >
      <div className="flex flex-col gap-2 border-b border-border/60 pb-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">Banji</p>
          <div className="mt-1">
            <SectionTitle title="System ledger" tooltip="Shared analysis chart workspace across inventory, orders, and lead time indicators." />
          </div>
        </div>
      </div>
      <div className="mt-4 min-h-0 w-full">
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
          onChartResolutionChange={(value, custom) => {
            setChartResolution(value);
            setCustomChartResolution(custom);
            updateChartLayoutPreferences({ chartResolution: value, customChartResolution: custom });
          }}
          onCustomTimeframeChange={(range) => {
            setCustomTimeframeRange(range);
            updateChartLayoutPreferences({ customTimeframeRange: range });
          }}
          onOlderLoadProgressChange={onOlderLoadProgressChange}
          onPaneHeightsChange={(paneHeights) => updateChartLayoutPreferences({ paneHeights })}
          onReset={() => onResetCharts?.()}
          onSaveDefaultIndicatorSettings={saveDefaultIndicatorSettings}
          onSelectInterval={(intervalIndex) => setSelection({ type: 'interval', intervalIndex })}
          onToggleExpand={onToggleExpand}
          onTimeframeChange={(value) => {
            updateChartLayoutPreferences({ timeframe: value });
            onTimeframeChange(value as AnalysisTimeframe);
          }}
          onVisibleDateRangeChange={(visibleDateRange) => updateChartLayoutPreferences({ visibleDateRange })}
          selectedIntervalIndex={selectedIntervalIndex}
          setIndicatorSettings={setIndicatorSettings}
          timeframe={timeframe}
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
