import { describe, expect, test } from 'vitest';
import type { SenaObservationRecord } from '@shared/sena';
import { projectStockReportsFromSena } from './project-stock-reports-from-sena';

function observation(
  observationId: string,
  observedAt: string,
  price: number,
): SenaObservationRecord {
  return {
    observationId,
    ownerSub: 'owner',
    input: {
      observedAt,
      stockSnapshot: [{ skuId: 'sku-1', unitsInStock: 1, costPerUnit: 2, productPrice: price }],
      retailSalesSnapshot: [],
      serviceSalesSnapshot: [],
      serviceRankings: [],
      retailRankings: [],
      serviceStockouts: [],
      retailStockouts: [],
      orderSignals: [],
      servicePrices: [],
      retailPrices: [],
      leadTimeHints: [],
      adjustmentSignals: [],
      commercialEvents: [],
      ticketEvents: [],
      recipeUsageHints: [],
      deliveryFee: null,
      notes: null,
    },
  };
}

describe('projectStockReportsFromSena', () => {
  test('sorts dirty observation dates after valid history before projecting reports', () => {
    const reports = projectStockReportsFromSena([
      observation('dirty', 'not-a-date', 7),
      observation('valid', '2026-05-08T00:00:00.000Z', 5),
    ]);

    expect(reports.map((report) => report.reportId)).toEqual(['dirty', 'valid']);
    expect(reports[0]?.skuObservations[0]?.previousProductPrice).toBe(5);
  });

  test('sorts dirty observation dates by id when timestamps are invalid', () => {
    const reports = projectStockReportsFromSena([
      observation('dirty-b', 'not-a-date', 7),
      observation('dirty-a', 'also-not-a-date', 5),
    ]);

    expect(reports.map((report) => report.reportId)).toEqual(['dirty-b', 'dirty-a']);
  });
});
