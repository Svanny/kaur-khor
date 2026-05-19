import { describe, expect, test } from 'vitest';
import type { SenaObservationRecord } from '@shared/sena';
import { filterObservationsForDays } from './commercial-flow';

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
});
