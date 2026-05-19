import { describe, expect, test } from 'vitest';
import type { SenaObservationRecord } from '@shared/sena';
import { latestObservationAt } from './observation-payload';

describe('observation payload helpers', () => {
  test('sorts malformed observation timestamps after valid observations', () => {
    const observations = [
      { input: { observedAt: 'not-a-date' } },
      { input: { observedAt: '2026-04-22T00:00:00.000Z' } },
      { input: { observedAt: '2026-04-23T00:00:00.000Z' } },
    ] as unknown as SenaObservationRecord[];

    expect(latestObservationAt(observations)).toBe('2026-04-23T00:00:00.000Z');
  });
});
