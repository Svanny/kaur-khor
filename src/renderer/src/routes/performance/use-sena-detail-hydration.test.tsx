import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { deriveSenaDetailCacheFreshnessFingerprint, writePersistedSenaDetailPage } from '@/lib/sena-detail-page-cache';
import { useSenaDetailHydration } from './use-sena-detail-hydration';

const inventoryHook = vi.fn();

function createStorageMock(): Storage {
  const values = new Map<string, string>();
  return {
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => Array.from(values.keys())[index] ?? null,
    get length() {
      return values.size;
    },
    removeItem: (key) => {
      values.delete(key);
    },
    setItem: (key, value) => {
      values.set(key, value);
    },
  };
}

vi.mock('@/state/inventory', () => ({
  useInventoryActions: () => inventoryHook(),
  useInventoryState: () => inventoryHook(),
}));

function makeDemandPosterior(start: number, count: number) {
  return Array.from({ length: count }, (_, index) => {
    const intervalIndex = start + index;
    return {
      adjustmentsMean: 0,
      deltaDays: 7,
      endAt: `2026-03-${String((intervalIndex % 28) + 1).padStart(2, '0')}T08:00:00.000Z`,
      intervalIndex,
      realizedConsumptionMean: 1,
      receiptsMean: 0,
      retailDemandMean: 1,
      serviceDemandMean: 0,
      startAt: `2026-02-${String((intervalIndex % 28) + 1).padStart(2, '0')}T08:00:00.000Z`,
      unconstrainedDemandMean: 1,
    };
  });
}

function makeSkuPage(
  start: number,
  count: number,
  nextBeforeIntervalIndex: number | null,
  latestPosteriorUnits = 9,
) {
  return {
    detail: {
      demandPosterior: makeDemandPosterior(start, count),
      inventoryPosterior: makeDemandPosterior(start, count).map((entry) => ({
        at: entry.endAt,
        high: 10,
        low: 8,
        mean: 9,
      })),
      leadTimePosterior: makeDemandPosterior(start, count).map((entry) => ({
        intervalIndex: entry.intervalIndex,
        logMeanDays: 1,
        logStdDays: 0.1,
        meanDays: 3,
        observedRelativeWidth: 0.2,
        observedVariabilityClass: 'tight',
        stdDays: 1,
      })),
      pipelinePosterior: makeDemandPosterior(start, count).map((entry) => ({
        ageDaysMean: 1,
        inTransitMean: 2,
        intervalIndex: entry.intervalIndex,
        orderProbability: 0.5,
        orderQuantityMean: 2,
        receiptQuantityMean: 0,
      })),
      summary: {
        credibleIntervalHigh: 12,
        credibleIntervalLow: 6,
        daysOfCover: 4,
        demandPerDayMean: 1,
        expectedLeadTimeDemand: 5,
        latestPosteriorUnits,
        leadTimeMeanDays: 3,
        leadTimeStdDays: 1,
        reorderPoint: 7,
        reorderTriggerProbability: 0.2,
        regimeProbabilities: { normal: 1 },
        safetyStock: 2,
        skuId: 'sku-1',
        stockoutRisk: 0.1,
      },
    },
    hasOlder: nextBeforeIntervalIndex != null,
    latestIntervalIndex: start + count - 1,
    nextBeforeIntervalIndex,
    pageLimit: count,
  };
}

function makeRegimeTimeline(start: number, count: number, activityMean: number) {
  return Array.from({ length: count }, (_, index) => {
    const intervalIndex = start + index;
    return {
      activityIntervalHigh: activityMean + 1,
      activityIntervalLow: activityMean - 1,
      activityMean,
      bottleneckProbability: 0.2,
      demandMean: activityMean,
      endAt: `2026-03-${String((intervalIndex % 28) + 1).padStart(2, '0')}T08:00:00.000Z`,
      intervalIndex,
      priceMean: 10,
      regime: 'normal',
      sellableCapacityMean: 20,
      startAt: `2026-02-${String((intervalIndex % 28) + 1).padStart(2, '0')}T08:00:00.000Z`,
    };
  });
}

function makeServicePage(
  start: number,
  count: number,
  nextBeforeIntervalIndex: number | null,
  activityMean = 3,
) {
  return {
    detail: {
      activityIntervalHigh: activityMean + 1,
      activityIntervalLow: activityMean - 1,
      activityMean,
      bottleneckProbability: 0.2,
      contributors: [],
      regimeTimeline: makeRegimeTimeline(start, count, activityMean),
      serviceId: 'service-1',
    },
    hasOlder: nextBeforeIntervalIndex != null,
    latestIntervalIndex: start + count - 1,
    nextBeforeIntervalIndex,
    pageLimit: count,
  };
}

function TestHarness() {
  const { loadOlderIntervals, skuDetailsById } = useSenaDetailHydration('1M');
  const length = skuDetailsById['sku-1']?.demandPosterior.length ?? 0;

  return (
    <div>
      <span data-testid="length">{length}</span>
      <button
        type="button"
        onClick={() => {
          void (async () => {
            await loadOlderIntervals(10);
            await loadOlderIntervals(10);
          })();
        }}
      >
        Load twice
      </button>
    </div>
  );
}

function MaxHydrationHarness() {
  const { isHydratingDetails, skuDetailsById, timeframeHydrationProgress } = useSenaDetailHydration('MAX');
  const length = skuDetailsById['sku-1']?.demandPosterior.length ?? 0;

  return (
    <div>
      <span data-testid="max-length">{length}</span>
      <span data-testid="max-hydrating">{String(isHydratingDetails)}</span>
      <span data-testid="max-progress">
        {timeframeHydrationProgress ? `${timeframeHydrationProgress.current}/${timeframeHydrationProgress.total}` : 'idle'}
      </span>
    </div>
  );
}

function AnalysisCacheHarness({
  boundary,
  cacheKey,
}: {
  boundary?: Date | null;
  cacheKey?: string;
}) {
  const { isHydratingDetails, resolvedTimeframeCacheKey, skuDetailsById } = useSenaDetailHydration('Recent', {
    timeframeBoundaryOverride: boundary,
    timeframeCacheKey: cacheKey,
  });
  const length = skuDetailsById['sku-1']?.demandPosterior.length ?? 0;

  return (
    <div>
      <span data-testid="cache-length">{length}</span>
      <span data-testid="cache-hydrating">{String(isHydratingDetails)}</span>
      <span data-testid="cache-key">{resolvedTimeframeCacheKey ?? 'none'}</span>
    </div>
  );
}

function FreshnessHarness() {
  const { isHydratingDetails, serviceDetailsById, skuDetailsById } = useSenaDetailHydration('Recent');
  const latestPosteriorUnits = skuDetailsById['sku-1']?.summary.latestPosteriorUnits ?? 0;
  const serviceActivityMean = serviceDetailsById['service-1']?.activityMean ?? 0;

  return (
    <div>
      <span data-testid="freshness-hydrating">{String(isHydratingDetails)}</span>
      <span data-testid="freshness-sku-units">{latestPosteriorUnits}</span>
      <span data-testid="freshness-service-activity">{serviceActivityMean}</span>
    </div>
  );
}

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((nextResolve) => {
    resolve = nextResolve;
  });
  return { promise, resolve };
}

describe('useSenaDetailHydration', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      value: createStorageMock(),
    });
  });

  test('renders cached first pages before live detail hydration resolves', async () => {
    const workspaceSummary = {
      highRiskSkuIds: [],
      intervalCount: 40,
      latestObservedAt: '2026-03-21T08:00:00.000Z',
      ownerSub: 'desktop-owner',
      pendingReorderCount: 0,
      runId: 'run-1',
      serviceCount: 0,
      skuCount: 1,
      skuSummaries: [],
      topRegime: 'normal',
    };
    const freshnessFingerprint = deriveSenaDetailCacheFreshnessFingerprint(workspaceSummary);
    writePersistedSenaDetailPage({
      beforeIntervalIndex: null,
      entityId: 'sku-1',
      entityType: 'sku',
      freshnessFingerprint,
      limit: 20,
      page: makeSkuPage(10, 10, 10),
      storage: window.localStorage,
    });
    const livePage = deferred<ReturnType<typeof makeSkuPage>>();
    const loadSenaSkuDetail = vi.fn(async () => livePage.promise);

    inventoryHook.mockReturnValue({
      catalog: {
        bundles: [],
        schemaVersion: 1,
        services: [],
        sharingMask: [],
        skus: [
          {
            costPerUnit: 1,
            description: 'sku',
            leadTimeMeanDaysHint: 1,
            leadTimeStdDaysHint: 1,
            name: 'sku',
            productPrice: 1,
            skuId: 'sku-1',
            soldAsProduct: true,
          },
        ],
      },
      loadSenaServiceDetail: vi.fn(),
      loadSenaSkuDetail,
      workspaceSummary,
    });

    render(<TestHarness />);

    await waitFor(() => expect(screen.getByTestId('length')).toHaveTextContent('10'));

    await act(async () => {
      livePage.resolve(makeSkuPage(20, 20, 20));
      await livePage.promise;
    });

    await waitFor(() => expect(screen.getByTestId('length')).toHaveTextContent('20'));
  });

  test('advances older-page cursors across sequential 10-interval loads in one gesture', async () => {
    const loadSenaSkuDetail = vi.fn(async (_skuId: string, options?: { beforeIntervalIndex?: number | null; limit?: number }) => {
      if (options?.beforeIntervalIndex === 20) {
        return makeSkuPage(10, 10, 10);
      }
      if (options?.beforeIntervalIndex === 10) {
        return makeSkuPage(0, 10, null);
      }
      return makeSkuPage(20, 20, 20);
    });

    inventoryHook.mockReturnValue({
      catalog: {
        bundles: [],
        schemaVersion: 1,
        services: [],
        sharingMask: [],
        skus: [
          {
            costPerUnit: 1,
            description: 'sku',
            leadTimeMeanDaysHint: 1,
            leadTimeStdDaysHint: 1,
            name: 'sku',
            productPrice: 1,
            skuId: 'sku-1',
            soldAsProduct: true,
          },
        ],
      },
      loadSenaServiceDetail: vi.fn(),
      loadSenaSkuDetail,
      workspaceSummary: {
        highRiskSkuIds: [],
        intervalCount: 40,
        latestObservedAt: '2026-03-21T08:00:00.000Z',
        ownerSub: 'desktop-owner',
        pendingReorderCount: 0,
        runId: 'run-1',
        serviceCount: 0,
        skuCount: 1,
        skuSummaries: [],
        topRegime: 'normal',
      },
    });

    const user = userEvent.setup();
    render(<TestHarness />);

    await waitFor(() => expect(screen.getByTestId('length')).toHaveTextContent('20'));

    await user.click(screen.getByRole('button', { name: 'Load twice' }));

    await waitFor(() => expect(screen.getByTestId('length')).toHaveTextContent('40'));
    expect(loadSenaSkuDetail).toHaveBeenNthCalledWith(1, 'sku-1', { limit: 20 });
    expect(loadSenaSkuDetail).toHaveBeenNthCalledWith(2, 'sku-1', { beforeIntervalIndex: 20, limit: 10, strategy: 'network-only' });
    expect(loadSenaSkuDetail).toHaveBeenNthCalledWith(3, 'sku-1', { beforeIntervalIndex: 10, limit: 10, strategy: 'network-only' });
  });

  test('loads estimated MAX timeframe hydration in one expanded older request', async () => {
    const olderPage = deferred<ReturnType<typeof makeSkuPage>>();
    const loadSenaSkuDetail = vi.fn(async (_skuId: string, options?: { beforeIntervalIndex?: number | null; limit?: number }) => {
      if (options?.beforeIntervalIndex === 20) {
        return olderPage.promise;
      }
      return makeSkuPage(20, 20, 20);
    });

    inventoryHook.mockReturnValue({
      catalog: {
        bundles: [],
        schemaVersion: 1,
        services: [],
        sharingMask: [],
        skus: [
          {
            costPerUnit: 1,
            description: 'sku',
            leadTimeMeanDaysHint: 1,
            leadTimeStdDaysHint: 1,
            name: 'sku',
            productPrice: 1,
            skuId: 'sku-1',
            soldAsProduct: true,
          },
        ],
      },
      loadSenaServiceDetail: vi.fn(),
      loadSenaSkuDetail,
      workspaceSummary: {
        highRiskSkuIds: [],
        intervalCount: 40,
        latestObservedAt: '2026-03-21T08:00:00.000Z',
        ownerSub: 'desktop-owner',
        pendingReorderCount: 0,
        runId: 'run-1',
        serviceCount: 0,
        skuCount: 1,
        skuSummaries: [],
        topRegime: 'normal',
      },
    });

    render(<MaxHydrationHarness />);

    await waitFor(() => expect(screen.getByTestId('max-length')).toHaveTextContent('20'));
    expect(screen.getByTestId('max-progress')).toHaveTextContent('1/2');
    expect(loadSenaSkuDetail).toHaveBeenCalledWith('sku-1', { beforeIntervalIndex: 20, limit: 20, strategy: 'network-only' });

    await act(async () => {
      olderPage.resolve(makeSkuPage(0, 20, null));
      await olderPage.promise;
    });

    await waitFor(() => expect(screen.getByTestId('max-length')).toHaveTextContent('40'));
    await waitFor(() => expect(screen.getByTestId('max-progress')).toHaveTextContent('idle'));
    expect(screen.getByTestId('max-hydrating')).toHaveTextContent('false');
    expect(loadSenaSkuDetail).toHaveBeenCalledTimes(2);
  });

  test('reuses hydrated custom range pages instead of rebuilding analysis data for the same cache key', async () => {
    const loadSenaSkuDetail = vi.fn(async (_skuId: string, options?: { beforeIntervalIndex?: number | null; limit?: number }) => {
      if (options?.beforeIntervalIndex === 20) {
        return makeSkuPage(0, 20, null);
      }
      return makeSkuPage(20, 20, 20);
    });
    const workspaceSummary = {
      highRiskSkuIds: [],
      intervalCount: 40,
      latestObservedAt: '2026-03-21T08:00:00.000Z',
      ownerSub: 'desktop-owner',
      pendingReorderCount: 0,
      runId: 'run-1',
      serviceCount: 0,
      skuCount: 1,
      skuSummaries: [],
      topRegime: 'normal',
    };

    inventoryHook.mockReturnValue({
      catalog: {
        bundles: [],
        schemaVersion: 1,
        services: [],
        sharingMask: [],
        skus: [
          {
            costPerUnit: 1,
            description: 'sku',
            leadTimeMeanDaysHint: 1,
            leadTimeStdDaysHint: 1,
            name: 'sku',
            productPrice: 1,
            skuId: 'sku-1',
            soldAsProduct: true,
          },
        ],
      },
      loadSenaServiceDetail: vi.fn(),
      loadSenaSkuDetail,
      workspaceSummary,
    });

    const customBoundary = new Date('2026-02-05T00:00:00.000Z');
    const customCacheKey = 'Custom:2026-02-05T00:00:00.000Z:2026-03-21T08:00:00.000Z';
    const { rerender } = render(<AnalysisCacheHarness boundary={customBoundary} cacheKey={customCacheKey} />);

    await waitFor(() => expect(screen.getByTestId('cache-length')).toHaveTextContent('40'));
    await waitFor(() => expect(screen.getByTestId('cache-hydrating')).toHaveTextContent('false'));
    expect(screen.getByTestId('cache-key')).toHaveTextContent(customCacheKey);
    expect(loadSenaSkuDetail).toHaveBeenCalledTimes(2);

    rerender(<AnalysisCacheHarness boundary={null} cacheKey={undefined} />);
    await waitFor(() => expect(screen.getByTestId('cache-key')).toHaveTextContent('Recent'));
    expect(loadSenaSkuDetail).toHaveBeenCalledTimes(3);

    rerender(<AnalysisCacheHarness boundary={customBoundary} cacheKey={customCacheKey} />);
    await waitFor(() => expect(screen.getByTestId('cache-length')).toHaveTextContent('40'));
    await waitFor(() => expect(screen.getByTestId('cache-key')).toHaveTextContent(customCacheKey));
    expect(loadSenaSkuDetail).toHaveBeenCalledTimes(3);
  });

  test('reloads same timeframe details when workspace freshness changes', async () => {
    const catalog = {
      bundles: [],
      schemaVersion: 1,
      services: [
        {
          archived: false,
          bundle: false,
          description: 'service',
          name: 'service',
          price: 10,
          serviceId: 'service-1',
        },
      ],
      sharingMask: [],
      skus: [
        {
          costPerUnit: 1,
          description: 'sku',
          leadTimeMeanDaysHint: 1,
          leadTimeStdDaysHint: 1,
          name: 'sku',
          productPrice: 1,
          skuId: 'sku-1',
          soldAsProduct: true,
        },
      ],
    };
    const firstWorkspaceSummary = {
      highRiskSkuIds: [],
      intervalCount: 20,
      latestObservedAt: '2026-03-21T08:00:00.000Z',
      ownerSub: 'desktop-owner',
      pendingReorderCount: 0,
      runId: 'run-1',
      serviceCount: 1,
      skuCount: 1,
      skuSummaries: [],
      topRegime: 'normal',
    };
    const secondWorkspaceSummary = {
      ...firstWorkspaceSummary,
      latestObservedAt: '2026-03-22T08:00:00.000Z',
      runId: 'run-2',
    };
    const loadSenaSkuDetail = vi
      .fn()
      .mockResolvedValueOnce(makeSkuPage(20, 20, null, 9))
      .mockResolvedValueOnce(makeSkuPage(20, 20, null, 42));
    const loadSenaServiceDetail = vi
      .fn()
      .mockResolvedValueOnce(makeServicePage(20, 20, null, 3))
      .mockResolvedValueOnce(makeServicePage(20, 20, null, 11));

    inventoryHook.mockReturnValue({
      catalog,
      loadSenaServiceDetail,
      loadSenaSkuDetail,
      workspaceSummary: firstWorkspaceSummary,
    });

    const { rerender } = render(<FreshnessHarness />);

    await waitFor(() => expect(screen.getByTestId('freshness-sku-units')).toHaveTextContent('9'));
    await waitFor(() => expect(screen.getByTestId('freshness-service-activity')).toHaveTextContent('3'));
    await waitFor(() => expect(screen.getByTestId('freshness-hydrating')).toHaveTextContent('false'));
    expect(loadSenaSkuDetail).toHaveBeenCalledTimes(1);
    expect(loadSenaServiceDetail).toHaveBeenCalledTimes(1);

    inventoryHook.mockReturnValue({
      catalog,
      loadSenaServiceDetail,
      loadSenaSkuDetail,
      workspaceSummary: secondWorkspaceSummary,
    });

    rerender(<FreshnessHarness />);

    await waitFor(() => expect(screen.getByTestId('freshness-sku-units')).toHaveTextContent('42'));
    await waitFor(() => expect(screen.getByTestId('freshness-service-activity')).toHaveTextContent('11'));
    await waitFor(() => expect(screen.getByTestId('freshness-hydrating')).toHaveTextContent('false'));
    expect(loadSenaSkuDetail).toHaveBeenCalledTimes(2);
    expect(loadSenaServiceDetail).toHaveBeenCalledTimes(2);
  });
});
