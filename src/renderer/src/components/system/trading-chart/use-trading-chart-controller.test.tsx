import { act, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ChartCustomTimeframeRange } from '@/components/system/chart-timeframe';
import {
  defaultChartLayoutPreferences,
  writeEntityChartLayoutPreferences,
  writeSubtypeDefaultChartLayoutPreferences,
  type PersistedChartLayoutPreferences,
} from '@/lib/chart-layout-preferences';
import type { ChartSettingsSubtype } from '@/lib/chart-settings-memory';
import {
  useHeldTradingChartBusy,
  useTradingChartController,
  type TradingChartController,
} from './use-trading-chart-controller';

const ENTITY_LAYOUT_STORAGE_KEY = 'banji:chart-layout:entity:v1';

function makeStorageMock() {
  const state = new Map<string, string>();
  return {
    clear() {
      state.clear();
    },
    getItem(key: string) {
      return state.get(key) ?? null;
    },
    removeItem(key: string) {
      state.delete(key);
    },
    setItem(key: string, value: string) {
      state.set(key, value);
    },
  };
}

const localStorageMock = makeStorageMock();
const sessionStorageMock = makeStorageMock();

function controllerRecorder({
  initialTimeframe,
  onChange,
  onTimeframeChange,
  subjectId,
  subtype,
}: {
  initialTimeframe?: TradingChartController['timeframe'];
  onChange: (controller: TradingChartController) => void;
  onTimeframeChange?: (timeframe: TradingChartController['timeframe']) => void;
  subjectId: string;
  subtype: ChartSettingsSubtype;
}) {
  return function ControllerRecorder() {
    const controller = useTradingChartController({
      initialTimeframe,
      onTimeframeChange,
      subjectId,
      subtype,
    });
    onChange(controller);
    return null;
  };
}

function makePreferences(overrides: Partial<PersistedChartLayoutPreferences>) {
  return {
    ...defaultChartLayoutPreferences(),
    ...overrides,
  };
}

function HeldBusyRecorder({
  holdMs,
  isBusy,
  onChange,
}: {
  holdMs: number;
  isBusy: boolean;
  onChange: (heldBusy: boolean) => void;
}) {
  const heldBusy = useHeldTradingChartBusy(isBusy, holdMs);
  onChange(heldBusy);
  return null;
}

describe('useTradingChartController', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      value: localStorageMock,
    });
    Object.defineProperty(window, 'sessionStorage', {
      configurable: true,
      value: sessionStorageMock,
    });
    window.localStorage.clear();
    window.sessionStorage.clear();
  });

  afterEach(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
  });

  it('loads entity preferences first, then subtype defaults, then built-in defaults', async () => {
    const seen: TradingChartController[] = [];
    writeSubtypeDefaultChartLayoutPreferences('service', makePreferences({ timeframe: '1Y' }));
    writeEntityChartLayoutPreferences('service', 'service-1', makePreferences({ timeframe: '3M' }));

    const ServiceOneRecorder = controllerRecorder({
      onChange: (controller) => seen.push(controller),
      subjectId: 'service-1',
      subtype: 'service',
    });
    const { rerender, unmount } = render(<ServiceOneRecorder />);

    expect(seen.at(-1)?.timeframe).toBe('3M');

    const ServiceTwoRecorder = controllerRecorder({
      onChange: (controller) => seen.push(controller),
      subjectId: 'service-2',
      subtype: 'service',
    });
    rerender(<ServiceTwoRecorder />);
    await waitFor(() => expect(seen.at(-1)?.timeframe).toBe('1Y'));

    unmount();
    const AnalysisRecorder = controllerRecorder({
      onChange: (controller) => seen.push(controller),
      subjectId: 'workbench',
      subtype: 'analysis',
    });
    render(<AnalysisRecorder />);

    expect(seen.at(-1)?.timeframe).toBe('Recent');
  });

  it('writes entity layout preferences when chart layout changes', async () => {
    let latest: TradingChartController | null = null;
    const Recorder = controllerRecorder({
      onChange: (controller) => {
        latest = controller;
      },
      subjectId: 'sku-1',
      subtype: 'sku',
    });
    render(<Recorder />);

    act(() => {
      latest?.handleChartLayoutPreferencesChange({ paneHeights: { main: 360 } });
    });

    await waitFor(() => {
      const record = JSON.parse(window.sessionStorage.getItem(ENTITY_LAYOUT_STORAGE_KEY) ?? '{}');
      expect(record['sku:sku-1']?.paneHeights).toEqual({ main: 360 });
    });
  });

  it('resets zoom token on timeframe, committed custom range, resolution, and explicit reset', async () => {
    let latest: TradingChartController | null = null;
    const resetHydratedDetails = vi.fn(async () => {});
    const Recorder = controllerRecorder({
      onChange: (controller) => {
        latest = controller;
      },
      subjectId: 'service-1',
      subtype: 'service',
    });
    render(<Recorder />);

    expect(latest?.chartZoomResetToken).toBe(0);

    act(() => latest?.handleTimeframeChange('YTD'));
    await waitFor(() => expect(latest?.chartZoomResetToken).toBe(1));

    act(() => {
      latest?.handleCustomTimeframeChange({
        startAt: '2026-03-01T00:00:00.000Z',
        endAt: '2026-03-31T23:59:59.999Z',
      });
    });
    act(() => latest?.settlePendingTimeframe({
      isHydratingDetails: true,
      resolvedTimeframe: 'YTD',
      timeframeHydrationProgress: null,
    }));
    act(() => latest?.settlePendingTimeframe({
      isHydratingDetails: false,
      resolvedTimeframe: 'YTD',
      timeframeHydrationProgress: null,
    }));
    await waitFor(() => expect(latest?.chartZoomResetToken).toBe(2));

    act(() => latest?.handleChartResolutionChange('1W', null));
    await waitFor(() => expect(latest?.chartZoomResetToken).toBe(3));

    await act(async () => {
      await latest?.handleResetCharts(resetHydratedDetails);
    });
    expect(resetHydratedDetails).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(latest?.chartZoomResetToken).toBe(4));
  });

  it('emits custom timeframe boundary override and cache key', async () => {
    let latest: TradingChartController | null = null;
    const range: ChartCustomTimeframeRange = {
      startAt: '2026-02-01T00:00:00.000Z',
      endAt: '2026-03-01T00:00:00.000Z',
    };
    const Recorder = controllerRecorder({
      onChange: (controller) => {
        latest = controller;
      },
      subjectId: 'workbench',
      subtype: 'analysis',
    });
    render(<Recorder />);

    act(() => latest?.handleCustomTimeframeChange(range));

    await waitFor(() => {
      expect(latest?.customTimeframeRange).toBeNull();
      expect(latest?.pendingCustomTimeframeRange).toEqual(range);
      expect(latest?.timeframeBoundaryOverride?.toISOString()).toBe(range.startAt);
      expect(latest?.timeframeCacheKey).toBe(`Custom:${range.startAt}:${range.endAt}`);
    });
  });

  it('applies a selected custom range after hydration completes', async () => {
    let latest: TradingChartController | null = null;
    const range: ChartCustomTimeframeRange = {
      startAt: '2026-02-01T00:00:00.000Z',
      endAt: '2026-03-01T00:00:00.000Z',
    };
    const Recorder = controllerRecorder({
      onChange: (controller) => {
        latest = controller;
      },
      subjectId: 'workbench',
      subtype: 'analysis',
    });
    render(<Recorder />);

    act(() => latest?.handleCustomTimeframeChange(range));

    expect(latest?.customTimeframeRange).toBeNull();
    expect(latest?.pendingCustomTimeframeRange).toEqual(range);

    act(() => latest?.settlePendingTimeframe({
      isHydratingDetails: true,
      resolvedTimeframe: 'Recent',
      timeframeHydrationProgress: null,
    }));

    expect(latest?.customTimeframeRange).toBeNull();

    act(() => latest?.settlePendingTimeframe({
      isHydratingDetails: false,
      resolvedTimeframe: 'Recent',
      timeframeHydrationProgress: null,
    }));

    await waitFor(() => {
      expect(latest?.pendingCustomTimeframeRange).toBeNull();
      expect(latest?.customTimeframeRange).toEqual(range);
      expect(latest?.chartLayoutPreferences.customTimeframeRange).toEqual(range);
      expect(latest?.chartLayoutPreferences.visibleDateRange).toEqual(range);
    });
  });

  it('applies a selected custom range when the requested range is already cached', async () => {
    let latest: TradingChartController | null = null;
    const range: ChartCustomTimeframeRange = {
      startAt: '2026-02-01T00:00:00.000Z',
      endAt: '2026-03-01T00:00:00.000Z',
    };
    const Recorder = controllerRecorder({
      onChange: (controller) => {
        latest = controller;
      },
      subjectId: 'sku-1',
      subtype: 'sku',
    });
    render(<Recorder />);

    act(() => latest?.handleCustomTimeframeChange(range));
    expect(latest?.pendingCustomTimeframeRange).toEqual(range);

    act(() => latest?.settlePendingTimeframe({
      isHydratingDetails: false,
      resolvedTimeframe: 'Recent',
      resolvedTimeframeCacheKey: `Custom:${range.startAt}:${range.endAt}`,
      timeframeHydrationProgress: null,
    }));

    await waitFor(() => {
      expect(latest?.pendingCustomTimeframeRange).toBeNull();
      expect(latest?.customTimeframeRange).toEqual(range);
      expect(latest?.timeframeCacheKey).toBeUndefined();
    });
  });

  it('promotes fixed-timeframe viewport extension into a custom range without starting custom hydration', async () => {
    let latest: TradingChartController | null = null;
    writeEntityChartLayoutPreferences('service', 'service-1', makePreferences({
      timeframe: '1M',
      visibleDateRange: {
        startAt: '2026-03-10T00:00:00.000Z',
        endAt: '2026-03-20T00:00:00.000Z',
      },
    }));
    const Recorder = controllerRecorder({
      onChange: (controller) => {
        latest = controller;
      },
      subjectId: 'service-1',
      subtype: 'service',
    });
    render(<Recorder />);

    act(() => latest?.handleChartLayoutPreferencesChange({
      visibleDateRange: {
        startAt: '2026-03-01T00:00:00.000Z',
        endAt: '2026-03-20T00:00:00.000Z',
      },
    }));

    await waitFor(() => {
      expect(latest?.timeframe).toBe('1M');
      expect(latest?.customTimeframeRange).toEqual({
        startAt: '2026-03-01T00:00:00.000Z',
        endAt: '2026-03-20T00:00:00.000Z',
      });
      expect(latest?.pendingCustomTimeframeRange).toBeNull();
      expect(latest?.timeframeBoundaryOverride).toBeUndefined();
      expect(latest?.timeframeCacheKey).toBeUndefined();
    });
  });

  it('does not change an existing custom range from passive viewport observations', async () => {
    let latest: TradingChartController | null = null;
    const range: ChartCustomTimeframeRange = {
      startAt: '2026-02-01T00:00:00.000Z',
      endAt: '2026-03-01T00:00:00.000Z',
    };
    writeEntityChartLayoutPreferences('service', 'service-1', makePreferences({
      customTimeframeRange: range,
      visibleDateRange: range,
    }));
    const Recorder = controllerRecorder({
      onChange: (controller) => {
        latest = controller;
      },
      subjectId: 'service-1',
      subtype: 'service',
    });
    render(<Recorder />);

    act(() => latest?.handleChartLayoutPreferencesChange(
      {
        visibleDateRange: {
          startAt: '2026-01-15T00:00:00.000Z',
          endAt: '2026-03-15T00:00:00.000Z',
        },
      },
      { syncCustomTimeframeRange: false },
    ));

    await waitFor(() => {
      expect(latest?.customTimeframeRange).toEqual(range);
      expect(latest?.timeframeBoundaryOverride?.toISOString()).toBe(range.startAt);
      expect(latest?.timeframeCacheKey).toBe(`Custom:${range.startAt}:${range.endAt}`);
      expect(latest?.chartLayoutPreferences.visibleDateRange).toEqual({
        startAt: '2026-01-15T00:00:00.000Z',
        endAt: '2026-03-15T00:00:00.000Z',
      });
    });
  });

  it('holds the chart busy state across short idle gaps', async () => {
    vi.useFakeTimers();
    try {
      const seen: boolean[] = [];
      const { rerender } = render(
        <HeldBusyRecorder
          holdMs={300}
          isBusy={false}
          onChange={(heldBusy) => seen.push(heldBusy)}
        />,
      );

      expect(seen.at(-1)).toBe(false);

      rerender(
        <HeldBusyRecorder
          holdMs={300}
          isBusy
          onChange={(heldBusy) => seen.push(heldBusy)}
        />,
      );
      expect(seen.at(-1)).toBe(true);

      rerender(
        <HeldBusyRecorder
          holdMs={300}
          isBusy={false}
          onChange={(heldBusy) => seen.push(heldBusy)}
        />,
      );
      await act(async () => {
        await vi.advanceTimersByTimeAsync(299);
      });
      expect(seen.at(-1)).toBe(true);

      rerender(
        <HeldBusyRecorder
          holdMs={300}
          isBusy
          onChange={(heldBusy) => seen.push(heldBusy)}
        />,
      );
      rerender(
        <HeldBusyRecorder
          holdMs={300}
          isBusy={false}
          onChange={(heldBusy) => seen.push(heldBusy)}
        />,
      );

      await act(async () => {
        await vi.advanceTimersByTimeAsync(299);
      });
      expect(seen.at(-1)).toBe(true);

      await act(async () => {
        await vi.advanceTimersByTimeAsync(1);
      });
      expect(seen.at(-1)).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it('syncs explicit custom range clears from chart layout updates', async () => {
    let latest: TradingChartController | null = null;
    const range: ChartCustomTimeframeRange = {
      startAt: '2026-02-01T00:00:00.000Z',
      endAt: '2026-03-01T00:00:00.000Z',
    };
    writeEntityChartLayoutPreferences('sku', 'sku-1', makePreferences({
      customTimeframeRange: range,
      visibleDateRange: range,
    }));
    const Recorder = controllerRecorder({
      onChange: (controller) => {
        latest = controller;
      },
      subjectId: 'sku-1',
      subtype: 'sku',
    });
    render(<Recorder />);

    expect(latest?.customTimeframeRange).toEqual(range);

    act(() => latest?.handleChartLayoutPreferencesChange({
      customTimeframeRange: null,
      visibleDateRange: null,
    }));

    await waitFor(() => {
      expect(latest?.customTimeframeRange).toBeNull();
      expect(latest?.timeframeBoundaryOverride).toBeUndefined();
      expect(latest?.timeframeCacheKey).toBeUndefined();
    });
  });
});
