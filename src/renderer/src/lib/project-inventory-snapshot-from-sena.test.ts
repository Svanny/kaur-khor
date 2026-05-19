import { describe, expect, it } from 'vitest';
import type { SenaCatalog, SenaObservationRecord } from '@shared/sena';
import { projectInventorySnapshotFromSena } from './project-inventory-snapshot-from-sena';

const catalog: SenaCatalog = {
  schemaVersion: 1,
  skus: [{
    skuId: 'sku-1',
    name: 'Tea',
    description: 'Tea leaves',
    costPerUnit: 2,
    archived: false,
    soldAsProduct: true,
    productPrice: 5,
    leadTimeMeanDaysHint: null,
    leadTimeStdDaysHint: null,
  }],
  services: [{
    serviceId: 'service-1',
    name: 'Tea Pairing',
    description: 'Pairing service',
    price: 10,
    archived: false,
    bundle: false,
  }],
  bundles: [],
  sharingMask: [{ serviceId: 'service-1', skuId: 'sku-1', enabled: true, usageProbability: null }],
};

function observation(observationId: string, input: Partial<SenaObservationRecord['input']>): SenaObservationRecord {
  return {
    observationId,
    ownerSub: 'owner',
    input: {
      observedAt: '2026-04-21T00:00:00.000Z',
      stockSnapshot: [],
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
      notes: null,
      ...input,
    },
  };
}

describe('projectInventorySnapshotFromSena', () => {
  it('applies latest service price observations to the inventory snapshot', () => {
    const snapshot = projectInventorySnapshotFromSena(catalog, [
      observation('obs-1', {
        servicePrices: [{ serviceId: 'service-1', price: 14 }],
      }),
    ]);

    expect(snapshot.services.find((service) => service.serviceId === 'service-1')?.price).toBe(14);
  });

  it('uses the latest observation by timestamp instead of array order', () => {
    const snapshot = projectInventorySnapshotFromSena(catalog, [
      observation('new', {
        observedAt: '2026-04-22T00:00:00.000Z',
        stockSnapshot: [{ skuId: 'sku-1', unitsInStock: 9, costPerUnit: 3, productPrice: 6 }],
        retailPrices: [{ skuId: 'sku-1', price: 7 }],
        servicePrices: [{ serviceId: 'service-1', price: 16 }],
      }),
      observation('old', {
        observedAt: '2026-04-21T00:00:00.000Z',
        stockSnapshot: [{ skuId: 'sku-1', unitsInStock: 1, costPerUnit: 2, productPrice: 5 }],
        retailPrices: [{ skuId: 'sku-1', price: 5 }],
        servicePrices: [{ serviceId: 'service-1', price: 10 }],
      }),
    ]);

    expect(snapshot.skus.find((sku) => sku.skuId === 'sku-1')).toMatchObject({
      unitsInStock: 9,
      costPerUnit: 3,
      productPrice: 7,
    });
    expect(snapshot.services.find((service) => service.serviceId === 'service-1')?.price).toBe(16);
  });

  it('falls back when latest observation values are non-finite', () => {
    const snapshot = projectInventorySnapshotFromSena(catalog, [
      observation('dirty', {
        observedAt: '2026-04-22T00:00:00.000Z',
        stockSnapshot: [{
          skuId: 'sku-1',
          unitsInStock: Number.NaN,
          costPerUnit: Infinity,
          productPrice: Number.NaN,
        }],
        retailPrices: [{ skuId: 'sku-1', price: Infinity }],
        servicePrices: [{ serviceId: 'service-1', price: Number.NaN }],
      }),
    ]);

    expect(snapshot.skus.find((sku) => sku.skuId === 'sku-1')).toMatchObject({
      unitsInStock: 0,
      costPerUnit: 2,
      productPrice: 5,
    });
    expect(snapshot.services.find((service) => service.serviceId === 'service-1')?.price).toBe(10);
  });

  it('preserves latest SKU state when a newer service-only observation is projected', () => {
    const snapshot = projectInventorySnapshotFromSena(catalog, [
      observation('stock', {
        observedAt: '2026-04-21T00:00:00.000Z',
        stockSnapshot: [{ skuId: 'sku-1', unitsInStock: 9, costPerUnit: 3, productPrice: 6 }],
        retailPrices: [{ skuId: 'sku-1', price: 7 }],
        servicePrices: [{ serviceId: 'service-1', price: 12 }],
      }),
      observation('service-only', {
        observedAt: '2026-04-22T00:00:00.000Z',
        servicePrices: [{ serviceId: 'service-1', price: 16 }],
        serviceStockouts: ['service-1'],
      }),
    ]);

    expect(snapshot.skus.find((sku) => sku.skuId === 'sku-1')).toMatchObject({
      unitsInStock: 9,
      costPerUnit: 3,
      productPrice: 7,
    });
    expect(snapshot.services.find((service) => service.serviceId === 'service-1')?.price).toBe(16);
  });

  it('does not let newer non-finite values erase earlier valid snapshot values', () => {
    const snapshot = projectInventorySnapshotFromSena(catalog, [
      observation('valid', {
        observedAt: '2026-04-21T00:00:00.000Z',
        stockSnapshot: [{ skuId: 'sku-1', unitsInStock: 9, costPerUnit: 3, productPrice: 6 }],
        retailPrices: [{ skuId: 'sku-1', price: 7 }],
        servicePrices: [{ serviceId: 'service-1', price: 12 }],
      }),
      observation('dirty', {
        observedAt: '2026-04-22T00:00:00.000Z',
        stockSnapshot: [{
          skuId: 'sku-1',
          unitsInStock: Number.NaN,
          costPerUnit: Infinity,
          productPrice: Number.NaN,
        }],
        retailPrices: [{ skuId: 'sku-1', price: Infinity }],
        servicePrices: [{ serviceId: 'service-1', price: Number.NaN }],
      }),
    ]);

    expect(snapshot.skus.find((sku) => sku.skuId === 'sku-1')).toMatchObject({
      unitsInStock: 9,
      costPerUnit: 3,
      productPrice: 7,
    });
    expect(snapshot.services.find((service) => service.serviceId === 'service-1')?.price).toBe(12);
  });
});
