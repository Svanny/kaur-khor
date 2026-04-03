import { describe, expect, test } from 'vitest';
import {
  classifyLeadTimeVariability,
  deriveLeadTimeVariabilityClass,
  impliedLeadTimeRangeFromMeanStd,
  leadTimeVariabilityLabel,
  relativeLeadTimeWidth,
} from './sena-lead-time';

describe('sena lead-time mapping', () => {
  test('derives implied range from mean and std', () => {
    expect(impliedLeadTimeRangeFromMeanStd(4, 1)).toEqual({ lowDays: 3, highDays: 5 });
  });

  test('maps relative width thresholds to ordinal classes', () => {
    expect(classifyLeadTimeVariability(0.19)).toBe('very_tight');
    expect(classifyLeadTimeVariability(0.20)).toBe('tight');
    expect(classifyLeadTimeVariability(0.40)).toBe('normal');
    expect(classifyLeadTimeVariability(0.70)).toBe('wide');
    expect(classifyLeadTimeVariability(1.10)).toBe('very_wide');
  });

  test('derives class from low and high when explicit class is absent', () => {
    const width = relativeLeadTimeWidth(3, 5);
    expect(deriveLeadTimeVariabilityClass({ lowDays: 3, highDays: 5, variabilityClass: null })).toBe(
      classifyLeadTimeVariability(width),
    );
  });

  test('preserves explicit class over derived range', () => {
    expect(
      deriveLeadTimeVariabilityClass({
        lowDays: 3,
        highDays: 5,
        variabilityClass: 'very_wide',
      }),
    ).toBe('very_wide');
  });

  test('exposes stable display labels for all classes', () => {
    expect(leadTimeVariabilityLabel('very_tight')).toBe('Very tight');
    expect(leadTimeVariabilityLabel('tight')).toBe('Tight');
    expect(leadTimeVariabilityLabel('normal')).toBe('Normal');
    expect(leadTimeVariabilityLabel('wide')).toBe('Wide');
    expect(leadTimeVariabilityLabel('very_wide')).toBe('Very wide');
  });
});
