import { describe, expect, test } from 'vitest';
import { etaVariationDaysFromParts } from './lead-time-variability-field';

describe('lead-time variability field helpers', () => {
  test('parses comma-formatted custom ETA variation parts', () => {
    expect(etaVariationDaysFromParts('1,000', '12')).toBe(1000.5);
  });
});
