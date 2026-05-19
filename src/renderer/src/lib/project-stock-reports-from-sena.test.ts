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

  test('contains non-finite numeric values while projecting stock reports', () => {
    const dirty = observation('dirty', '2026-05-09T00:00:00.000Z', Number.NaN);
    dirty.input.stockSnapshot = [{
      skuId: 'sku-1',
      unitsInStock: Number.NaN,
      costPerUnit: Infinity,
      productPrice: Number.NaN,
    }];
    dirty.input.retailPrices = [{ skuId: 'sku-1', price: Infinity }];
    dirty.input.adjustmentSignals = [{ skuId: 'sku-1', quantityDelta: Number.NaN, reason: 'dirty' }];
    dirty.input.servicePrices = [{ serviceId: 'service-1', price: Number.NaN }];

    const [report] = projectStockReportsFromSena([dirty]);

    expect(report?.skuObservations[0]).toMatchObject({
      adjustmentDelta: null,
      costPerUnit: 0,
      productPrice: null,
      unitsInStock: 0,
    });
    expect(report?.servicePriceAdjustments[0]).toMatchObject({
      price: 0,
      serviceId: 'service-1',
    });
  });

  test('does not propagate non-finite service prices into later previous prices', () => {
    const dirty = observation('dirty', '2026-05-09T00:00:00.000Z', 5);
    dirty.input.servicePrices = [{ serviceId: 'service-1', price: Number.NaN }];
    const later = observation('later', '2026-05-10T00:00:00.000Z', 5);
    later.input.servicePrices = [{ serviceId: 'service-1', price: 12 }];

    const reports = projectStockReportsFromSena([dirty, later]);

    expect(reports.find((report) => report.reportId === 'later')?.servicePriceAdjustments[0]).toMatchObject({
      price: 12,
      previousPrice: 0,
    });
  });

  test('sorts dirty observation dates by id when timestamps are invalid', () => {
    const reports = projectStockReportsFromSena([
      observation('dirty-b', 'not-a-date', 7),
      observation('dirty-a', 'also-not-a-date', 5),
    ]);

    expect(reports.map((report) => report.reportId)).toEqual(['dirty-b', 'dirty-a']);
  });
});
