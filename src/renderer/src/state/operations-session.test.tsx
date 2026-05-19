import { describe, expect, test } from 'vitest';
import type { InventorySnapshot } from '@shared/inventory';
import {
  createOperationsSessionDraft,
  createOperationsSessionDraftFromReport,
  hasMeaningfulOperationsSessionChanges,
} from './operations-session';

const snapshot: InventorySnapshot = {
  skus: [
    {
      skuId: 'sku-1',
      name: 'Large stock item',
      description: '',
      unitsInStock: 1000,
      costPerUnit: 4,
      soldAsProduct: true,
      productPrice: 9,
      leadTimeMeanDays: null,
      leadTimeStdDays: null,
    },
  ],
  services: [
    {
      serviceId: 'service-1',
      name: 'Large price service',
      description: '',
      price: 1200,
      skuIds: ['sku-1'],
    },
  ],
  ranking: [],
  sist: {
    status: {
      state: 'empty',
      updatedAt: null,
      reportCount: 0,
      confidence: 'low',
      reason: null,
    },
    settings: {
      targetServiceLevel: 0.95,
      forecastHorizonDays: 30,
      particleCount: 256,
      smoothingWindowReports: 0,
    },
    asOf: null,
    topRegime: null,
    pendingReorderCount: 0,
    highRiskSkuIds: [],
    skuInsights: [],
  },
};

describe('operations session state', () => {
  test('does not mark comma-formatted equivalent stock or service drafts as changed', () => {
    const draft = createOperationsSessionDraft(snapshot);
    draft.rows['sku-1']!.unitsInStock = '1,000';
    draft.serviceDrafts['service-1']!.price = '1,200';

    expect(hasMeaningfulOperationsSessionChanges(snapshot, draft)).toBe(false);
  });

  test('does not mark a fresh draft from dirty non-finite money values as changed', () => {
    const dirtySnapshot: InventorySnapshot = {
      ...snapshot,
      skus: [{
        ...snapshot.skus[0]!,
        costPerUnit: Number.NaN,
        productPrice: Number.NaN,
      }],
      services: [{
        ...snapshot.services[0]!,
        price: Number.NaN,
      }],
    };
    const draft = createOperationsSessionDraft(dirtySnapshot);

    expect(draft.rows['sku-1']).toMatchObject({
      costPerUnit: '',
      productPrice: '',
    });
    expect(draft.serviceDrafts['service-1']?.price).toBe('');
    expect(hasMeaningfulOperationsSessionChanges(dirtySnapshot, draft)).toBe(false);
  });

  test('hydrates notes-only service signals without turning them into stockouts', () => {
    const draft = createOperationsSessionDraftFromReport(snapshot, {
      reportId: 'report-1',
      reportSource: 'manual',
      reportedAt: '2026-04-10T08:00:00.000Z',
      skuObservations: [],
      serviceSignals: [{ serviceId: 'service-1', notes: 'Watch tomorrow' }],
      servicePriceAdjustments: [],
      topRetailRanking: [],
      topServiceRanking: [],
      notes: null,
    });

    expect(draft.serviceDrafts['service-1']).toMatchObject({
      stockout: false,
      notes: 'Watch tomorrow',
    });
  });

  test('hydrates dirty non-finite report money values as blank drafts', () => {
    const draft = createOperationsSessionDraftFromReport(snapshot, {
      reportId: 'report-1',
      reportSource: 'manual',
      reportedAt: '2026-04-10T08:00:00.000Z',
      skuObservations: [{
        skuId: 'sku-1',
        unitsInStock: 12,
        costPerUnit: Number.NaN,
        productPrice: Number.NaN,
      }],
      serviceSignals: [],
      servicePriceAdjustments: [{ serviceId: 'service-1', price: Number.NaN }],
      topRetailRanking: [],
      topServiceRanking: [],
      notes: null,
    });

    expect(draft.rows['sku-1']).toMatchObject({
      costPerUnit: '',
      productPrice: '',
    });
    expect(draft.serviceDrafts['service-1']?.price).toBe('');
  });
});
