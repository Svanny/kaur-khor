import { useEffect, useMemo, useRef, useState } from 'react';
import type { SenaServiceDetailPage } from '@shared/sena';
import { StatusLoadingIcon } from '@icons/status';
import type { ChartCustomTimeframeRange, ChartTimeframe } from '@/components/system/chart-timeframe';
import type { ChartCustomResolution, ChartResolutionOption } from '@/components/system/chart-resolution';
import {
  defaultChartLayoutPreferences,
  normalizeChartLayoutPreferences,
  readEntityChartLayoutPreferences,
  readSubtypeDefaultChartLayoutPreferences,
  writeEntityChartLayoutPreferences,
  writeSubtypeDefaultChartLayoutPreferences,
  type PersistedChartLayoutPreferences,
} from '@/lib/chart-layout-preferences';
import { cn } from '@/lib/utils';
import { usePreferences } from '@/state/preferences';
import { cardFrameClassName, cardSurfaceClassName } from '@/components/ui/card';
import {
  readEntityChartSettings,
  readSubtypeDefaultChartSettings,
  writeEntityChartSettings,
  writeSubtypeDefaultChartSettings,
} from '@/lib/chart-settings-memory';
import { SectionTitle } from '@/routes/sku-detail/section-heading';
import { SkuTradingChart } from '@/routes/sku-detail/trading-chart';
import {
  defaultServiceTradingChartIndicators,
  normalizeTradingChartIndicatorSettings,
  type TradingChartIndicatorSettings,
} from '@/routes/sku-detail/trading-chart-model';
import { deriveServiceTradingChartModel } from './trading-chart-adapter';
import type { ServiceDetailViewModel, ServiceInspectorSelection } from './view-model';

function resolveServiceChartSettings(serviceId: string) {
  const defaultIndicatorSettings =
    readSubtypeDefaultChartSettings('service', normalizeTradingChartIndicatorSettings) ?? defaultServiceTradingChartIndicators();
  const indicatorSettings =
    readEntityChartSettings('service', serviceId, normalizeTradingChartIndicatorSettings) ??
    structuredClone(defaultIndicatorSettings);
  return {
    defaultIndicatorSettings,
    indicatorSettings,
  };
}

function resolveServiceChartLayoutPreferences(serviceId: string) {
  return normalizeChartLayoutPreferences(
    readEntityChartLayoutPreferences('service', serviceId) ??
    readSubtypeDefaultChartLayoutPreferences('service') ??
    defaultChartLayoutPreferences(),
  );
}

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
  isLoadingOlderIntervals = false,
  loadOlderIntervals = async () => null,
  model,
  onOlderLoadProgressChange,
  onResetCharts = () => {},
  onTimeframeChange = () => {},
  onToggleExpand,
  selection,
  setSelection,
  timeframe = 'Recent',
}: {
  chartZoomResetToken?: string | number;
  expanded?: boolean;
  hasOlderIntervals: boolean;
  isHydratingDetails: boolean;
  isLoadingOlderIntervals: boolean;
  loadOlderIntervals: (limit?: number) => Promise<SenaServiceDetailPage | null>;
  model: ServiceDetailViewModel;
  onOlderLoadProgressChange?: (progress: { current: number; total: number } | null) => void;
  onResetCharts: () => void;
  onTimeframeChange: (value: ChartTimeframe) => void;
  onToggleExpand?: () => void;
  selection: ServiceInspectorSelection;
  setSelection: (value: ServiceInspectorSelection) => void;
  timeframe: ChartTimeframe;
}) {
  const { t } = usePreferences();
  const subjectId = model.identity.serviceId;
  const initialSettings = useMemo(() => resolveServiceChartSettings(subjectId), [subjectId]);
  const initialLayoutPreferences = useMemo(() => resolveServiceChartLayoutPreferences(subjectId), [subjectId]);
  const [settingsSubjectKey, setSettingsSubjectKey] = useState(`service:${subjectId}`);
  const [defaultIndicatorSettings, setDefaultIndicatorSettings] = useState(() => initialSettings.defaultIndicatorSettings);
  const [indicatorSettings, setIndicatorSettings] = useState(() => initialSettings.indicatorSettings);
  const [chartLayoutPreferences, setChartLayoutPreferences] = useState<PersistedChartLayoutPreferences>(() => initialLayoutPreferences);
  const [chartResolution, setChartResolution] = useState<ChartResolutionOption>(() => initialLayoutPreferences.chartResolution);
  const [customChartResolution, setCustomChartResolution] = useState<ChartCustomResolution | null>(() => initialLayoutPreferences.customChartResolution);
  const [customTimeframeRange, setCustomTimeframeRange] = useState<ChartCustomTimeframeRange | null>(() => initialLayoutPreferences.customTimeframeRange);
  const pendingIndicatorSettingsRef = useRef<TradingChartIndicatorSettings | null>(null);
  const indicatorSettingsWriteTimerRef = useRef<number | null>(null);

  const chartModel = useMemo(() => deriveServiceTradingChartModel(model), [model]);
  const isBusy = isHydratingDetails || isLoadingOlderIntervals;
  const selectedIntervalIndex = selectedIntervalIndexFromSelection(model, selection);

  useEffect(() => {
    const subjectKey = `service:${subjectId}`;
    if (subjectKey === settingsSubjectKey) {
      return;
    }
    const nextSettings = resolveServiceChartSettings(subjectId);
    const nextLayoutPreferences = resolveServiceChartLayoutPreferences(subjectId);
    setSettingsSubjectKey(subjectKey);
    setDefaultIndicatorSettings(nextSettings.defaultIndicatorSettings);
    setIndicatorSettings(nextSettings.indicatorSettings);
    setChartLayoutPreferences(nextLayoutPreferences);
    setChartResolution(nextLayoutPreferences.chartResolution);
    setCustomChartResolution(nextLayoutPreferences.customChartResolution);
    setCustomTimeframeRange(nextLayoutPreferences.customTimeframeRange);
  }, [settingsSubjectKey, subjectId]);

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
      writeEntityChartSettings('service', subjectId, pendingIndicatorSettingsRef.current, normalizeTradingChartIndicatorSettings);
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
      writeEntityChartSettings('service', subjectId, pendingIndicatorSettingsRef.current, normalizeTradingChartIndicatorSettings);
      pendingIndicatorSettingsRef.current = null;
    };
  }, [indicatorSettings, subjectId]);

  useEffect(() => {
    writeEntityChartLayoutPreferences('service', subjectId, chartLayoutPreferences);
  }, [chartLayoutPreferences, subjectId]);

  function saveDefaultIndicatorSettings(next: TradingChartIndicatorSettings) {
    const normalized = normalizeTradingChartIndicatorSettings(next);
    setDefaultIndicatorSettings(normalized);
    writeSubtypeDefaultChartSettings('service', normalized, normalizeTradingChartIndicatorSettings);
    writeSubtypeDefaultChartLayoutPreferences('service', chartLayoutPreferences);
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
        'relative isolate flex min-w-0 flex-col',
        expanded
          ? `${cardFrameClassName} ${cardSurfaceClassName} h-full min-h-0 w-full rounded-[2rem] px-6 py-5`
          : `${cardFrameClassName} ${cardSurfaceClassName} rounded-[2rem] px-6 py-5`,
      )}
    >
      <div className="flex flex-col gap-2 border-b border-border/60 pb-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">Banji</p>
          <div className="mt-1">
            <SectionTitle title={`Ledger for ${model.identity.name}`} tooltip={t('catalogServiceLedgerTooltip')} />
          </div>
        </div>
      </div>
      <div className="mt-4 min-h-0">
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
          onReset={onResetCharts}
          onSaveDefaultIndicatorSettings={saveDefaultIndicatorSettings}
          onSelectInterval={(intervalIndex) => setSelection({ type: 'interval', intervalIndex })}
          onToggleExpand={onToggleExpand}
          onTimeframeChange={(value) => {
            updateChartLayoutPreferences({ timeframe: value });
            onTimeframeChange(value);
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
