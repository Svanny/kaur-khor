import { describe, expect, test } from 'vitest';
import type { SenaObservationRecord } from '@shared/sena';
import { createEmptyObservationInput, latestObservationAt, observationCompositionParts, observationSignalCounts } from './observation-payload';

describe('observation payload helpers', () => {
  test('sorts malformed observation timestamps after valid observations', () => {
    const observations = [
      { input: { observedAt: 'not-a-date' } },
      { input: { observedAt: '2026-04-22T00:00:00.000Z' } },
      { input: { observedAt: '2026-04-23T00:00:00.000Z' } },
    ] as unknown as SenaObservationRecord[];

    expect(latestObservationAt(observations)).toBe('2026-04-23T00:00:00.000Z');
  });

  test('summarizes pending reductions as completions without new pending copy', () => {
    const input = createEmptyObservationInput({
      notes: null,
      observedAt: '2026-04-23T00:00:00.000Z',
    });
    input.commercialEvents = [
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
    ];

    expect(observationSignalCounts(input)).toMatchObject({
      customerPending: 0,
      customerCompleted: 1,
      supplierPending: 0,
      supplierReceipts: 1,
    });
    expect(observationCompositionParts(input)).toEqual([
      '1 customer completion',
      '1 supplier receipt',
    ]);
  });
});
