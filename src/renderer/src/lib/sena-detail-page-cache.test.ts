import { beforeEach, describe, expect, it } from 'vitest';
import type { SenaServiceDetailPage, SenaSkuDetailPage } from '@shared/sena';
import {
  clearPersistedSenaDetailPagesForEntity,
  deriveSenaDetailCacheFreshnessFingerprint,
  prunePersistedSenaDetailPages,
  readPersistedSenaDetailPage,
  writePersistedSenaDetailPage,
} from './sena-detail-page-cache';

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

function makeSkuPage(intervalIndex: number): SenaSkuDetailPage {
  return {
    detail: {
      demandPosterior: [
        {
          adjustmentsMean: 0,
          deltaDays: 1,
          endAt: '2026-04-02T00:00:00Z',
          intervalIndex,
          realizedConsumptionMean: 1,
          receiptsMean: 0,
          retailDemandMean: 1,
          serviceDemandMean: 0,
          startAt: '2026-04-01T00:00:00Z',
          unconstrainedDemandMean: 1,
        },
      ],
      inventoryPosterior: [{ at: '2026-04-02T00:00:00Z', high: 10, low: 8, mean: 9 }],
      leadTimePosterior: [{
        intervalIndex,
        logMeanDays: 1,
        logStdDays: 0.1,
        meanDays: 3,
        observedRelativeWidth: 0.2,
        observedVariabilityClass: 'tight',
        stdDays: 1,
      }],
      pipelinePosterior: [{
        ageDaysMean: 1,
        inTransitMean: 2,
        intervalIndex,
        orderProbability: 0.5,
        orderQuantityMean: 2,
        receiptQuantityMean: 1,
      }],
      summary: {
        credibleIntervalHigh: 12,
        credibleIntervalLow: 6,
        daysOfCover: 4,
        demandPerDayMean: 1,
        expectedLeadTimeDemand: 5,
        latestPosteriorUnits: 9,
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
    hasOlder: intervalIndex > 0,
    latestIntervalIndex: intervalIndex,
    nextBeforeIntervalIndex: intervalIndex - 1,
    pageLimit: 20,
  };
}

function makeServicePage(intervalIndex: number): SenaServiceDetailPage {
  return {
    detail: {
      activityIntervalHigh: 4,
      activityIntervalLow: 2,
      activityMean: 3,
      bottleneckProbability: 0.3,
      contributors: [],
      regimeTimeline: [{
        activityIntervalHigh: 4,
        activityIntervalLow: 2,
        activityMean: 3,
        bottleneckProbability: 0.3,
        demandMean: 1,
        endAt: '2026-04-02T00:00:00Z',
        intervalIndex,
        priceMean: 2,
        regime: 'normal',
        sellableCapacityMean: 5,
        startAt: '2026-04-01T00:00:00Z',
      }],
      serviceId: 'service-1',
    },
    hasOlder: false,
    latestIntervalIndex: intervalIndex,
    nextBeforeIntervalIndex: null,
    pageLimit: 20,
  };
}

const freshness = deriveSenaDetailCacheFreshnessFingerprint({
  latestObservedAt: '2026-04-02T00:00:00Z',
  runId: 'run-1',
});

describe('sena detail page cache', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      value: createStorageMock(),
    });
  });

  it('reads and writes persisted sku and service pages', () => {
    writePersistedSenaDetailPage({
      beforeIntervalIndex: null,
      entityId: 'sku-1',
      entityType: 'sku',
      freshnessFingerprint: freshness,
      limit: 20,
      page: makeSkuPage(20),
      storage: window.localStorage,
    });
    writePersistedSenaDetailPage({
      beforeIntervalIndex: null,
      entityId: 'service-1',
      entityType: 'service',
      freshnessFingerprint: freshness,
      limit: 20,
      page: makeServicePage(20),
      storage: window.localStorage,
    });

    expect(readPersistedSenaDetailPage<SenaSkuDetailPage>({
      beforeIntervalIndex: null,
      entityId: 'sku-1',
      entityType: 'sku',
      freshnessFingerprint: freshness,
      limit: 20,
      storage: window.localStorage,
    })?.latestIntervalIndex).toBe(20);
    expect(readPersistedSenaDetailPage<SenaServiceDetailPage>({
      beforeIntervalIndex: null,
      entityId: 'service-1',
      entityType: 'service',
      freshnessFingerprint: freshness,
      limit: 20,
      storage: window.localStorage,
    })?.latestIntervalIndex).toBe(20);
  });

  it('ignores malformed payloads and stale fingerprints', () => {
    window.localStorage.setItem('kaur-khor:sena:detail-pages:v1', '{bad json');
    expect(readPersistedSenaDetailPage<SenaSkuDetailPage>({
      beforeIntervalIndex: null,
      entityId: 'sku-1',
      entityType: 'sku',
      freshnessFingerprint: freshness,
      limit: 20,
      storage: window.localStorage,
    })).toBeNull();

    writePersistedSenaDetailPage({
      beforeIntervalIndex: null,
      entityId: 'sku-1',
      entityType: 'sku',
      freshnessFingerprint: freshness,
      limit: 20,
      page: makeSkuPage(20),
      storage: window.localStorage,
    });

    expect(readPersistedSenaDetailPage<SenaSkuDetailPage>({
      beforeIntervalIndex: null,
      entityId: 'sku-1',
      entityType: 'sku',
      freshnessFingerprint: '1:run-2:2026-04-03T00:00:00Z',
      limit: 20,
      storage: window.localStorage,
    })).toBeNull();
  });

  it('prunes stale fingerprints and clears per entity', () => {
    writePersistedSenaDetailPage({
      beforeIntervalIndex: null,
      entityId: 'sku-1',
      entityType: 'sku',
      freshnessFingerprint: '1:run-0:2026-04-01T00:00:00Z',
      limit: 20,
      page: makeSkuPage(10),
      storage: window.localStorage,
    });
    writePersistedSenaDetailPage({
      beforeIntervalIndex: null,
      entityId: 'sku-1',
      entityType: 'sku',
      freshnessFingerprint: freshness,
      limit: 20,
      page: makeSkuPage(20),
      storage: window.localStorage,
    });

    prunePersistedSenaDetailPages({
      activeFreshnessFingerprint: freshness,
      storage: window.localStorage,
    });

    expect(readPersistedSenaDetailPage<SenaSkuDetailPage>({
      beforeIntervalIndex: null,
      entityId: 'sku-1',
      entityType: 'sku',
      freshnessFingerprint: '1:run-0:2026-04-01T00:00:00Z',
      limit: 20,
      storage: window.localStorage,
    })).toBeNull();

    clearPersistedSenaDetailPagesForEntity({
      entityId: 'sku-1',
      entityType: 'sku',
      storage: window.localStorage,
    });

    expect(readPersistedSenaDetailPage<SenaSkuDetailPage>({
      beforeIntervalIndex: null,
      entityId: 'sku-1',
      entityType: 'sku',
      freshnessFingerprint: freshness,
      limit: 20,
      storage: window.localStorage,
    })).toBeNull();
  });

  it('limits older windows per entity while keeping the recent page', () => {
    writePersistedSenaDetailPage({
      beforeIntervalIndex: null,
      entityId: 'sku-1',
      entityType: 'sku',
      freshnessFingerprint: freshness,
      limit: 20,
      page: makeSkuPage(50),
      storage: window.localStorage,
    });
    for (const intervalIndex of [40, 30, 20, 10, 0]) {
      writePersistedSenaDetailPage({
        beforeIntervalIndex: intervalIndex,
        entityId: 'sku-1',
        entityType: 'sku',
        freshnessFingerprint: freshness,
        limit: 20,
        page: makeSkuPage(intervalIndex),
        storage: window.localStorage,
      });
    }

    expect(readPersistedSenaDetailPage<SenaSkuDetailPage>({
      beforeIntervalIndex: null,
      entityId: 'sku-1',
      entityType: 'sku',
      freshnessFingerprint: freshness,
      limit: 20,
      storage: window.localStorage,
    })?.latestIntervalIndex).toBe(50);
    const remainingOlderWindowCount = [40, 30, 20, 10, 0].filter((beforeIntervalIndex) =>
      readPersistedSenaDetailPage<SenaSkuDetailPage>({
        beforeIntervalIndex,
        entityId: 'sku-1',
        entityType: 'sku',
        freshnessFingerprint: freshness,
        limit: 20,
        storage: window.localStorage,
      }) != null,
    ).length;
    expect(remainingOlderWindowCount).toBe(3);
  });
});
