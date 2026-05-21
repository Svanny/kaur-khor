import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ChartCustomTimeframeRange, ChartTimeframe } from '@/components/system/chart-timeframe';
import {
  DEFAULT_CHART_RESOLUTION,
  type ChartCustomResolution,
  type ChartResolutionOption,
} from '@/components/system/chart-resolution';
import {
  chartLayoutPreferencesEqual,
  mergeChartLayoutPreferencesWithViewportSync,
  resolveEntityChartLayoutPreferences,
  writeEntityChartLayoutPreferences,
  type ChartLayoutPreferenceMergeOptions,
  type PersistedChartLayoutPreferences,
} from '@/lib/chart/chart-layout-preferences';
import type { ChartSettingsSubtype } from '@/lib/chart/chart-settings-memory';
import { traceRenderer } from '@/lib/ui/trace';

export type TradingChartHydrationProgress = { current: number; total: number } | null;
const DEFAULT_CHART_BUSY_HOLD_MS = 450;

export function customTimeframeCacheKey(range: ChartCustomTimeframeRange | null) {
  return range ? `Custom:${range.startAt}:${range.endAt}` : undefined;
}

export function useHeldTradingChartBusy(isBusy: boolean, holdMs = DEFAULT_CHART_BUSY_HOLD_MS) {
  const [heldBusy, setHeldBusy] = useState(isBusy);

  useEffect(() => {
    if (isBusy) {
      setHeldBusy((current) => (current ? current : true));
      return undefined;
    }
    const timer = window.setTimeout(() => {
      setHeldBusy((current) => (current ? false : current));
    }, holdMs);
    return () => window.clearTimeout(timer);
  }, [holdMs, isBusy]);

  return heldBusy;
}

export function useTradingChartController({
  initialTimeframe,
  onTimeframeChange,
  subjectId,
  subtype,
  traceScope = 'trading-chart-controller',
}: {
  initialTimeframe?: ChartTimeframe;
  onTimeframeChange?: (timeframe: ChartTimeframe) => void;
  subjectId: string;
  subtype: ChartSettingsSubtype;
  traceScope?: string;
}) {
  const initialChartLayoutPreferences = useMemo(
    () => resolveEntityChartLayoutPreferences(subtype, subjectId),
    [subjectId, subtype],
  );
  const [timeframe, setTimeframe] = useState<ChartTimeframe>(initialChartLayoutPreferences.timeframe);
  const [customTimeframeRange, setCustomTimeframeRange] = useState<ChartCustomTimeframeRange | null>(
    initialChartLayoutPreferences.customTimeframeRange,
  );
  const [customTimeframeRequiresHydration, setCustomTimeframeRequiresHydration] = useState(
    initialChartLayoutPreferences.customTimeframeRange != null,
  );
  const [customTimeframeHydrationStarted, setCustomTimeframeHydrationStarted] = useState(false);
  const [pendingCustomTimeframeRange, setPendingCustomTimeframeRange] = useState<ChartCustomTimeframeRange | null>(null);
  const [pendingCustomTimeframeHydrationStarted, setPendingCustomTimeframeHydrationStarted] = useState(false);
  const [chartResolution, setChartResolution] = useState<ChartResolutionOption>(
    initialChartLayoutPreferences.chartResolution ?? DEFAULT_CHART_RESOLUTION,
  );
  const [customChartResolution, setCustomChartResolution] = useState<ChartCustomResolution | null>(
    initialChartLayoutPreferences.customChartResolution,
  );
  const [chartLayoutPreferences, setChartLayoutPreferences] = useState<PersistedChartLayoutPreferences>(
    initialChartLayoutPreferences,
  );
  const [pendingTimeframe, setPendingTimeframe] = useState<ChartTimeframe | null>(null);
  const [chartZoomResetToken, setChartZoomResetToken] = useState(0);
  const [olderLoadProgress, setOlderLoadProgress] = useState<TradingChartHydrationProgress>(null);

  useEffect(() => {
    const nextPreferences = initialTimeframe && initialChartLayoutPreferences.timeframe !== initialTimeframe
      ? { ...initialChartLayoutPreferences, timeframe: initialTimeframe }
      : initialChartLayoutPreferences;
    traceRenderer(traceScope, 'reset subject preferences', {
      chartResolution: nextPreferences.chartResolution,
      customTimeframeRange: nextPreferences.customTimeframeRange,
      initialTimeframe,
      subjectId,
      subtype,
      timeframe: nextPreferences.timeframe,
      visibleDateRange: nextPreferences.visibleDateRange,
    });
    setChartLayoutPreferences(nextPreferences);
    setTimeframe(nextPreferences.timeframe);
    setCustomTimeframeRange(initialChartLayoutPreferences.customTimeframeRange);
    setCustomTimeframeRequiresHydration(initialChartLayoutPreferences.customTimeframeRange != null);
    setCustomTimeframeHydrationStarted(false);
    setPendingCustomTimeframeRange(null);
    setPendingCustomTimeframeHydrationStarted(false);
    setChartResolution(initialChartLayoutPreferences.chartResolution ?? DEFAULT_CHART_RESOLUTION);
    setCustomChartResolution(initialChartLayoutPreferences.customChartResolution);
    setChartZoomResetToken(0);
    setOlderLoadProgress(null);
    setPendingTimeframe(null);
  }, [initialChartLayoutPreferences, initialTimeframe, subjectId, subtype, traceScope]);

  useEffect(() => {
    if (!initialTimeframe || initialTimeframe === timeframe) {
      return;
    }
    setTimeframe(initialTimeframe);
    setChartLayoutPreferences((current) => ({
      ...current,
      timeframe: initialTimeframe,
    }));
  }, [initialTimeframe, timeframe]);

  useEffect(() => {
    if (!subjectId) {
      return;
    }
    writeEntityChartLayoutPreferences(subtype, subjectId, chartLayoutPreferences);
  }, [chartLayoutPreferences, subjectId, subtype]);

  const handleTimeframeChange = useCallback((nextTimeframe: ChartTimeframe) => {
    traceRenderer(traceScope, 'timeframe change requested', {
      currentTimeframe: timeframe,
      customTimeframeRange,
      nextTimeframe,
      subjectId,
      subtype,
    });
    if (nextTimeframe === timeframe) {
      if (customTimeframeRange == null) {
        return;
      }
    } else {
      setPendingTimeframe(nextTimeframe);
      setTimeframe(nextTimeframe);
      onTimeframeChange?.(nextTimeframe);
    }
    setOlderLoadProgress(null);
    setCustomTimeframeRange(null);
    setCustomTimeframeRequiresHydration(false);
    setCustomTimeframeHydrationStarted(false);
    setPendingCustomTimeframeRange(null);
    setPendingCustomTimeframeHydrationStarted(false);
    setChartLayoutPreferences((current) => ({
      ...current,
      timeframe: nextTimeframe,
      customTimeframeRange: null,
      visibleDateRange: null,
    }));
    setChartZoomResetToken((current) => current + 1);
  }, [customTimeframeRange, onTimeframeChange, subjectId, subtype, timeframe, traceScope]);

  const handleCustomTimeframeChange = useCallback((nextRange: ChartCustomTimeframeRange | null) => {
    traceRenderer(traceScope, 'custom timeframe change requested', {
      currentCustomTimeframeRange: customTimeframeRange,
      nextRange,
      subjectId,
      subtype,
      timeframe,
    });
    setOlderLoadProgress(null);
    if (nextRange) {
      setPendingCustomTimeframeRange(nextRange);
      setPendingCustomTimeframeHydrationStarted(false);
      return;
    }
    setPendingCustomTimeframeRange(null);
    setPendingCustomTimeframeHydrationStarted(false);
    setCustomTimeframeRange(null);
    setCustomTimeframeRequiresHydration(false);
    setCustomTimeframeHydrationStarted(false);
    setChartLayoutPreferences((current) => ({
      ...current,
      customTimeframeRange: null,
      visibleDateRange: null,
    }));
    if (timeframe === 'Recent') {
      return;
    }
    setChartZoomResetToken((current) => current + 1);
  }, [customTimeframeRange, subjectId, subtype, timeframe, traceScope]);

  const handleChartResolutionChange = useCallback((
    nextResolution: ChartResolutionOption,
    nextCustom: ChartCustomResolution | null,
  ) => {
    setChartResolution(nextResolution);
    setCustomChartResolution(nextResolution === 'Custom' ? nextCustom : null);
    setChartLayoutPreferences((current) => ({
      ...current,
      chartResolution: nextResolution,
      customChartResolution: nextResolution === 'Custom' ? nextCustom : null,
    }));
    setChartZoomResetToken((current) => current + 1);
  }, []);

  const handleChartLayoutPreferencesChange = useCallback((
    next: Partial<PersistedChartLayoutPreferences>,
    options?: ChartLayoutPreferenceMergeOptions,
  ) => {
    traceRenderer(traceScope, 'layout preference change requested', {
      next,
      options,
      subjectId,
      subtype,
      timeframe,
    });
    setChartLayoutPreferences((current) => {
      const { preferences, promotedCustomTimeframeRange } = mergeChartLayoutPreferencesWithViewportSync(current, next, timeframe, options);
      traceRenderer(traceScope, 'layout preference merge result', {
        changed: !chartLayoutPreferencesEqual(current, preferences),
        currentCustomTimeframeRange: current.customTimeframeRange,
        nextCustomTimeframeRange: preferences.customTimeframeRange,
        promotedCustomTimeframeRange,
        subjectId,
        subtype,
        timeframe,
      });
      if (Object.prototype.hasOwnProperty.call(next, 'customTimeframeRange')) {
        setCustomTimeframeRange(preferences.customTimeframeRange);
        setCustomTimeframeRequiresHydration(preferences.customTimeframeRange != null);
        setCustomTimeframeHydrationStarted(false);
        setPendingCustomTimeframeRange(null);
        setPendingCustomTimeframeHydrationStarted(false);
      } else if (promotedCustomTimeframeRange) {
        setCustomTimeframeRange(promotedCustomTimeframeRange);
        setCustomTimeframeRequiresHydration(false);
        setCustomTimeframeHydrationStarted(false);
        setPendingCustomTimeframeRange(null);
        setPendingCustomTimeframeHydrationStarted(false);
      }
      if (next.chartResolution) {
        setChartResolution(preferences.chartResolution);
        setCustomChartResolution(preferences.customChartResolution);
        setChartZoomResetToken((currentToken) => currentToken + 1);
      }
      return chartLayoutPreferencesEqual(current, preferences) ? current : preferences;
    });
  }, [subjectId, subtype, timeframe, traceScope]);

  const handleResetCharts = useCallback(async (resetHydratedDetails: () => Promise<unknown> | unknown) => {
    setOlderLoadProgress(null);
    await resetHydratedDetails();
    setChartZoomResetToken((current) => current + 1);
  }, []);

  const settlePendingTimeframe = useCallback(({
    isHydratingDetails,
    resolvedTimeframeCacheKey,
    resolvedTimeframe,
    timeframeHydrationProgress,
  }: {
    isHydratingDetails: boolean;
    resolvedTimeframeCacheKey?: string | null;
    resolvedTimeframe?: ChartTimeframe | null;
    timeframeHydrationProgress: TradingChartHydrationProgress;
  }) => {
    traceRenderer(traceScope, 'settle pending timeframe', {
      customTimeframeHydrationStarted,
      customTimeframeRange,
      customTimeframeRequiresHydration,
      isHydratingDetails,
      pendingCustomTimeframeHydrationStarted,
      pendingCustomTimeframeRange,
      pendingTimeframe,
      resolvedTimeframe,
      resolvedTimeframeCacheKey,
      subjectId,
      subtype,
      timeframe,
      timeframeHydrationProgress,
    });
    if (customTimeframeRequiresHydration && customTimeframeRange) {
      const hydrationCacheKey = customTimeframeCacheKey(customTimeframeRange);
      if (isHydratingDetails || timeframeHydrationProgress != null) {
        setCustomTimeframeHydrationStarted((current) => (current ? current : true));
      } else if (customTimeframeHydrationStarted || resolvedTimeframeCacheKey === hydrationCacheKey) {
        const nextRange = customTimeframeRange;
        setCustomTimeframeRequiresHydration((current) => (current ? false : current));
        setCustomTimeframeHydrationStarted((current) => (current ? false : current));
        setChartLayoutPreferences((current) => ({
          ...current,
          customTimeframeRange: nextRange,
          visibleDateRange: current.visibleDateRange ?? nextRange,
        }));
        setChartZoomResetToken((current) => current + 1);
      }
    }
    if (pendingCustomTimeframeRange) {
      const pendingCustomTimeframeCacheKey = customTimeframeCacheKey(pendingCustomTimeframeRange);
      if (isHydratingDetails || timeframeHydrationProgress != null) {
        setPendingCustomTimeframeHydrationStarted((current) => (current ? current : true));
      } else if (pendingCustomTimeframeHydrationStarted || resolvedTimeframeCacheKey === pendingCustomTimeframeCacheKey) {
        const nextRange = pendingCustomTimeframeRange;
        setCustomTimeframeRange(nextRange);
        setCustomTimeframeRequiresHydration((current) => (current ? false : current));
        setChartLayoutPreferences((current) => ({
          ...current,
          customTimeframeRange: nextRange,
          visibleDateRange: nextRange,
        }));
        setPendingCustomTimeframeRange(null);
        setPendingCustomTimeframeHydrationStarted((current) => (current ? false : current));
        setChartZoomResetToken((current) => current + 1);
      }
    }
    if (pendingTimeframe == null || timeframe !== pendingTimeframe) {
      return;
    }
    if (resolvedTimeframe === pendingTimeframe || isHydratingDetails || timeframeHydrationProgress != null) {
      setPendingTimeframe(null);
    }
  }, [
    customTimeframeHydrationStarted,
    customTimeframeRange,
    customTimeframeRequiresHydration,
    pendingCustomTimeframeHydrationStarted,
    pendingCustomTimeframeRange,
    pendingTimeframe,
    subjectId,
    subtype,
    timeframe,
    traceScope,
  ]);

  const hydrationCustomTimeframeRange =
    pendingCustomTimeframeRange ?? (customTimeframeRequiresHydration ? customTimeframeRange : null);
  const timeframeBoundaryOverride = useMemo(
    () => hydrationCustomTimeframeRange ? new Date(hydrationCustomTimeframeRange.startAt) : undefined,
    [hydrationCustomTimeframeRange?.startAt],
  );

  return {
    chartLayoutPreferences,
    chartResolution,
    chartZoomResetToken,
    customChartResolution,
    customTimeframeRange,
    handleChartLayoutPreferencesChange,
    handleChartResolutionChange,
    handleCustomTimeframeChange,
    handleResetCharts,
    handleTimeframeChange,
    olderLoadProgress,
    pendingCustomTimeframeRange,
    pendingTimeframe,
    setOlderLoadProgress,
    settlePendingTimeframe,
    timeframe,
    timeframeBoundaryOverride,
    timeframeCacheKey: customTimeframeCacheKey(hydrationCustomTimeframeRange),
  };
}

export type TradingChartController = ReturnType<typeof useTradingChartController>;
