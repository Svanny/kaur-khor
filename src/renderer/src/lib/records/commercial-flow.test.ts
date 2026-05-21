import { describe, expect, test } from 'vitest';
import type { SenaObservationRecord } from '@shared/sena';
import { buildSkuCommercialSnapshots, filterObservationsForDays, observationCommercialSummary } from './commercial-flow';

function makeObservation(observedAt: string): SenaObservationRecord {
  return {
    observationId: observedAt,
    ownerSub: 'local',
    input: {
      commercialEvents: [],
      leadTimeHints: [],
      notes: '',
      observedAt,
      orderSignals: [],
      retailPrices: [],
      retailRankings: [],
      retailStockouts: [],
      servicePrices: [],
      serviceRankings: [],
      serviceStockouts: [],
      stockSnapshot: [],
    },
  };
}

describe('commercial-flow', () => {
  test('anchors default recent windows to the latest observation', () => {
    const observations = [
      makeObservation('2026-04-01T00:00:00.000Z'),
      makeObservation('2026-04-10T00:00:00.000Z'),
      makeObservation('2026-04-11T00:00:00.000Z'),
    ];

    expect(filterObservationsForDays(observations, 2).map((observation) => observation.input.observedAt)).toEqual([
      '2026-04-10T00:00:00.000Z',
      '2026-04-11T00:00:00.000Z',
    ]);
  });

  test('falls back to latest valid observation when the explicit end anchor is malformed', () => {
    const observations = [
      makeObservation('2026-04-01T00:00:00.000Z'),
      makeObservation('not-a-date'),
      makeObservation('2026-04-10T00:00:00.000Z'),
      makeObservation('2026-04-11T00:00:00.000Z'),
    ];

    expect(filterObservationsForDays(observations, 2, 'bad-anchor').map((observation) => observation.input.observedAt)).toEqual([
      '2026-04-10T00:00:00.000Z',
      '2026-04-11T00:00:00.000Z',
    ]);
  });

  test('contains non-finite commercial quantities and stock snapshots', () => {
    const olderStock = makeObservation('2026-04-09T00:00:00.000Z');
    olderStock.input.stockSnapshot = [{ skuId: 'sku-1', unitsInStock: 2, costPerUnit: 1, productPrice: 3 }];
    const dirtyLatestStock = makeObservation('2026-04-10T00:00:00.000Z');
    dirtyLatestStock.input.stockSnapshot = [{ skuId: 'sku-1', unitsInStock: Number.NaN, costPerUnit: 1, productPrice: 3 }];
    dirtyLatestStock.input.commercialEvents = [
      {
        party: 'customer',
        flow: 'scheduled',
        entityType: 'sku',
        entityId: 'sku-1',
        stage: 'pending',
        quantityDelta: Number.NaN,
      },
      {
        party: 'customer',
        flow: 'scheduled',
        entityType: 'sku',
        entityId: 'sku-1',
        stage: 'pending',
        quantityDelta: 5,
      },
    ];

    const snapshot = buildSkuCommercialSnapshots({
      observations: [olderStock, dirtyLatestStock],
      rangeDays: 30,
    }).get('sku-1');

    expect(snapshot).toMatchObject({
      blockedPendingQuantity: 3,
      pendingQuantity: 5,
    });
  });

  test('does not let negative dirty stock inflate blocked pending demand', () => {
    const olderStock = makeObservation('2026-04-09T00:00:00.000Z');
    olderStock.input.stockSnapshot = [{ skuId: 'sku-1', unitsInStock: 2, costPerUnit: 1, productPrice: 3 }];
    const dirtyLatestStock = makeObservation('2026-04-10T00:00:00.000Z');
    dirtyLatestStock.input.stockSnapshot = [{ skuId: 'sku-1', unitsInStock: -5, costPerUnit: 1, productPrice: 3 }];
    dirtyLatestStock.input.commercialEvents = [
      {
        party: 'customer',
        flow: 'scheduled',
        entityType: 'sku',
        entityId: 'sku-1',
        stage: 'pending',
        quantityDelta: 5,
      },
    ];

    const snapshot = buildSkuCommercialSnapshots({
      observations: [olderStock, dirtyLatestStock],
      rangeDays: 30,
    }).get('sku-1');

    expect(snapshot).toMatchObject({
      blockedPendingQuantity: 3,
      pendingQuantity: 5,
    });
  });

  test('uses observation id as a stable tiebreaker for same-time stock snapshots', () => {
    const lowerId = makeObservation('2026-04-10T00:00:00.000Z');
    lowerId.observationId = 'a';
    lowerId.input.stockSnapshot = [{ skuId: 'sku-1', unitsInStock: 1, costPerUnit: 1, productPrice: 3 }];
    const higherId = makeObservation('2026-04-10T00:00:00.000Z');
    higherId.observationId = 'b';
    higherId.input.stockSnapshot = [{ skuId: 'sku-1', unitsInStock: 4, costPerUnit: 1, productPrice: 3 }];
    higherId.input.commercialEvents = [
      {
        party: 'customer',
        flow: 'scheduled',
        entityType: 'sku',
        entityId: 'sku-1',
        stage: 'pending',
        quantityDelta: 5,
      },
    ];

    const snapshot = buildSkuCommercialSnapshots({
      observations: [lowerId, higherId],
      rangeDays: 30,
    }).get('sku-1');

    expect(snapshot).toMatchObject({
      blockedPendingQuantity: 1,
      pendingQuantity: 5,
    });
  });

  test('does not count pending reductions as new pending summary events', () => {
    expect(observationCommercialSummary([
      {
        party: 'customer',
        flow: 'scheduled',
        entityType: 'sku',
        entityId: 'sku-1',
        stage: 'pending',
        quantityDelta: -2,
      },
      {
        party: 'customer',
        flow: 'scheduled',
        entityType: 'sku',
        entityId: 'sku-1',
        stage: 'realized',
        quantityDelta: 2,
      },
      {
        party: 'supplier',
        flow: 'scheduled',
        entityType: 'sku',
        entityId: 'sku-1',
        stage: 'pending',
        quantityDelta: -1,
      },
      {
        party: 'supplier',
        flow: 'scheduled',
        entityType: 'sku',
        entityId: 'sku-1',
        stage: 'realized',
        quantityDelta: 1,
      },
    ])).toMatchObject({
      customerPending: 0,
      customerCompleted: 1,
      supplierPending: 0,
      supplierReceived: 1,
    });
  });
});
