import { describe, expect, test } from 'vitest';
import type { SenaSkuDetail } from '@shared/sena';
import { normalizeSkuDetailPage } from './sena-detail-pages';

function makeDetail(count: number): SenaSkuDetail {
  return {
    summary: {
      credibleIntervalHigh: 0,
      credibleIntervalLow: 0,
      daysOfCover: null,
      demandPerDayMean: 0,
      expectedLeadTimeDemand: 0,
      latestPosteriorUnits: 0,
      leadTimeMeanDays: 0,
      leadTimeStdDays: 0,
      regimeProbabilities: {},
      reorderPoint: 0,
      reorderTriggerProbability: 0,
      safetyStock: 0,
      skuId: 'sku-1',
      stockoutRisk: 0,
    },
    demandPosterior: Array.from({ length: count }, (_, index) => ({
      adjustmentsMean: 0,
      deltaDays: 1,
      endAt: `2026-03-${String(index + 1).padStart(2, '0')}T23:00:00.000Z`,
      intervalIndex: index,
      realizedConsumptionMean: 0,
      receiptsMean: 0,
      retailDemandMean: 0,
      serviceDemandMean: 0,
      startAt: `2026-03-${String(index + 1).padStart(2, '0')}T00:00:00.000Z`,
      unconstrainedDemandMean: 0,
    })),
    inventoryPosterior: Array.from({ length: count }, (_, index) => ({
      at: `2026-03-${String(index + 1).padStart(2, '0')}T12:00:00.000Z`,
      high: index + 1,
      low: index,
      mean: index,
    })),
    leadTimePosterior: Array.from({ length: count }, (_, index) => ({
      intervalIndex: index,
      logMeanDays: 0,
      logStdDays: 0,
      meanDays: 0,
      observedRelativeWidth: null,
      observedVariabilityClass: null,
      stdDays: 0,
    })),
    pipelinePosterior: Array.from({ length: count }, (_, index) => ({
      ageDaysMean: 0,
      inTransitMean: index,
      intervalIndex: index,
      orderProbability: 0,
      orderQuantityMean: 0,
      receiptQuantityMean: 0,
    })),
  };
}

describe('normalizeSkuDetailPage', () => {
  test('windows raw SKU detail to the requested latest page limit', () => {
    const page = normalizeSkuDetailPage(makeDetail(8), 5);

    expect(page?.detail.demandPosterior.map((point) => point.intervalIndex)).toEqual([3, 4, 5, 6, 7]);
    expect(page?.detail.pipelinePosterior.map((point) => point.intervalIndex)).toEqual([3, 4, 5, 6, 7]);
    expect(page?.detail.leadTimePosterior.map((point) => point.intervalIndex)).toEqual([3, 4, 5, 6, 7]);
    expect(page?.detail.inventoryPosterior.map((point) => point.at)).toEqual([
      '2026-03-04T12:00:00.000Z',
      '2026-03-05T12:00:00.000Z',
      '2026-03-06T12:00:00.000Z',
      '2026-03-07T12:00:00.000Z',
      '2026-03-08T12:00:00.000Z',
    ]);
    expect(page?.hasOlder).toBe(true);
    expect(page?.nextBeforeIntervalIndex).toBe(3);
    expect(page?.latestIntervalIndex).toBe(7);
  });
});
