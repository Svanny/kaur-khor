import { describe, expect, test } from 'vitest';
import type { SenaCatalog, SenaObservationRecord, SenaOrderBatchRecord, SenaService, SenaSku } from '@shared/sena';
import {
  catalogEntityActivityBlockers,
  createServiceAttributeVariants,
  createSkuAttributeVariants,
  duplicateSenaService,
  duplicateSenaSku,
  nextCatalogCopyName,
} from './sena-catalog';

const sku: SenaSku = {
  archived: false,
  costPerUnit: 4,
  description: 'Thread',
  imagePath: '/thread.png',
  leadTimeMeanDaysHint: 5,
  leadTimeStdDaysHint: 1,
  name: 'Thread',
  productPrice: 9,
  skuId: 'sku-1',
  soldAsProduct: true,
  supplierName: 'Supplier A',
};

const service: SenaService = {
  archived: false,
  bundle: false,
  description: 'Repair service',
  imagePath: '/repair.png',
  name: 'Repair',
  price: 12,
  serviceId: 'service-1',
};

function catalog(overrides: Partial<SenaCatalog> = {}): SenaCatalog {
  return {
    bundles: [],
    schemaVersion: 1,
    services: [service],
    sharingMask: [],
    skus: [sku],
    ...overrides,
  };
}

function observation(input: Partial<SenaObservationRecord['input']>): SenaObservationRecord {
  return {
    input: {
      adjustmentSignals: [],
      commercialEvents: [],
      leadTimeHints: [],
      notes: null,
      observedAt: '2026-05-01T00:00:00Z',
      orderSignals: [],
      recipeUsageHints: [],
      retailPrices: [],
      retailRankings: [],
      retailStockouts: [],
      servicePrices: [],
      serviceRankings: [],
      serviceStockouts: [],
      stockSnapshot: [],
      ticketEvents: [],
      ...input,
    },
    observationId: 'obs-1',
    ownerSub: 'owner',
  };
}

describe('sena catalog product helpers', () => {
  test('generates copy names with incrementing conflicts', () => {
    expect(nextCatalogCopyName(['Thread'], 'Thread')).toBe('Thread (copy)');
    expect(nextCatalogCopyName(['Thread', 'Thread (copy)'], 'Thread')).toBe('Thread (copy) (1)');
    expect(nextCatalogCopyName(['Thread', 'Thread (copy)', 'Thread (copy) (1)'], 'Thread')).toBe(
      'Thread (copy) (2)',
    );
  });

  test('duplicates SKU metadata without service links or activity references', () => {
    const nextCatalog = duplicateSenaSku(
      catalog({
        sharingMask: [{ enabled: true, serviceId: 'service-1', skuId: 'sku-1', usageProbability: null }],
      }),
      sku,
      () => 'sku-copy',
    );

    const copy = nextCatalog.skus.find((entry) => entry.skuId === 'sku-copy');
    expect(copy).toEqual({
      ...sku,
      archived: false,
      name: 'Thread (copy)',
      skuId: 'sku-copy',
    });
    expect(nextCatalog.sharingMask).toEqual([
      { enabled: true, serviceId: 'service-1', skuId: 'sku-1', usageProbability: null },
    ]);
  });

  test('duplicates service metadata and linked SKUs without activity references', () => {
    const nextCatalog = duplicateSenaService(
      catalog({
        sharingMask: [{ enabled: true, serviceId: 'service-1', skuId: 'sku-1', usageProbability: null }],
      }),
      service,
      () => 'service-copy',
    );

    const copy = nextCatalog.services.find((entry) => entry.serviceId === 'service-copy');
    expect(copy).toEqual({
      ...service,
      archived: false,
      name: 'Repair (copy)',
      serviceId: 'service-copy',
    });
    expect(nextCatalog.sharingMask).toEqual([
      { enabled: true, serviceId: 'service-1', skuId: 'sku-1', usageProbability: null },
      { enabled: true, serviceId: 'service-copy', skuId: 'sku-1', usageProbability: null },
    ]);
  });

  test('creates SKU attribute variants from metadata only', () => {
    const nextCatalog = createSkuAttributeVariants(
      catalog({
        sharingMask: [{ enabled: true, serviceId: 'service-1', skuId: 'sku-1', usageProbability: null }],
      }),
      sku,
      [[{ name: 'Size', option: 'XXL' }]],
      () => 'sku-variant',
    );

    const variant = nextCatalog.skus.find((entry) => entry.skuId === 'sku-variant');
    expect(variant).toEqual({
      ...sku,
      archived: false,
      name: 'Thread (Size: XXL)',
      skuId: 'sku-variant',
    });
    expect(nextCatalog.sharingMask).toEqual([
      { enabled: true, serviceId: 'service-1', skuId: 'sku-1', usageProbability: null },
    ]);
  });

  test('creates service attribute variants with selected linked SKUs', () => {
    const nextCatalog = createServiceAttributeVariants(
      catalog(),
      service,
      ['sku-1'],
      [[{ name: 'Location', option: 'On-site' }]],
      () => 'service-variant',
    );

    const variant = nextCatalog.services.find((entry) => entry.serviceId === 'service-variant');
    expect(variant).toEqual({
      ...service,
      archived: false,
      name: 'Repair (Location: On-site)',
      serviceId: 'service-variant',
    });
    expect(nextCatalog.sharingMask).toEqual([
      { enabled: true, serviceId: 'service-variant', skuId: 'sku-1', usageProbability: null },
    ]);
  });

  test('blocks SKU delete for activity, linked services, order batches, and last SKU', () => {
    const blockers = catalogEntityActivityBlockers({
      catalog: catalog({
        sharingMask: [{ enabled: true, serviceId: 'service-1', skuId: 'sku-1', usageProbability: null }],
      }),
      entityId: 'sku-1',
      entityType: 'sku',
      observations: [
        observation({
          ticketEvents: [{
            eventType: 'created',
            lifecycle: 'open',
            lines: [{ entityId: 'sku-1', entityType: 'sku' }],
            occurredAt: '2026-05-01T00:00:00Z',
            revision: 1,
            stage: 'pending',
            ticketFamily: 'customer',
            ticketId: 'ticket-1',
          }],
        }),
      ],
      orderBatches: [{
        batchOrderId: 'batch-1',
        children: [{
          childOrderId: 'child-1',
          createdAt: '2026-05-01T00:00:00Z',
          effective: {} as SenaOrderBatchRecord['children'][number]['effective'],
          inheritedFromBatch: true,
          overrides: {},
          skuId: 'sku-1',
          status: 'open',
          updatedAt: '2026-05-01T00:00:00Z',
        }],
        createdAt: '2026-05-01T00:00:00Z',
        ownerSub: 'owner',
        shared: {} as SenaOrderBatchRecord['shared'],
        status: 'open',
        supplierName: null,
        updatedAt: '2026-05-01T00:00:00Z',
      }],
    });

    expect(blockers).toEqual(['last-sku', 'linked-service', 'activity']);
  });

  test('blocks service delete for saved activity references', () => {
    expect(
      catalogEntityActivityBlockers({
        catalog: catalog(),
        entityId: 'service-1',
        entityType: 'service',
        observations: [observation({ servicePrices: [{ price: 12, serviceId: 'service-1' }] })],
        orderBatches: [],
      }),
    ).toEqual(['activity']);
  });
});
