import { describe, expect, test } from 'vitest';
import {
  classifyLeadTimeVariability,
  deriveLeadTimeFromStdDays,
  deriveLeadTimeFromVariabilityClass,
  deriveLeadTimeVariabilityClass,
  impliedLeadTimeRangeFromMeanStd,
  leadTimeVariabilityLabel,
  leadTimeVariabilityOptions,
  relativeLeadTimeWidth,
  uniqueLeadTimePresetStdDays,
} from './sena-lead-time';

describe('sena lead-time mapping', () => {
  test('derives implied range from mean and std', () => {
    expect(impliedLeadTimeRangeFromMeanStd(4, 1)).toEqual({ lowDays: 3, highDays: 5 });
  });

  test('uses zero as the lower range bound', () => {
    expect(impliedLeadTimeRangeFromMeanStd(0.2, 0.5)).toEqual({ lowDays: 0, highDays: 0.7 });
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

  test('derives compatible std and range from an ordinal class', () => {
    expect(deriveLeadTimeFromVariabilityClass(5, 'wide')).toEqual({
      highDays: 7.3,
      lowDays: 2.7,
      stdDays: 2.3,
      variabilityClass: 'wide',
    });
  });

  test('jittered presets stay monotonic and unique after one-decimal rounding', () => {
    const presetStdDays = uniqueLeadTimePresetStdDays(1);
    const values = leadTimeVariabilityOptions().map((option) => presetStdDays[option]);

    expect(values).toEqual([0.1, 0.2, 0.3, 0.5, 0.7]);
    expect(new Set(values).size).toBe(values.length);
    const numericValues = values as number[];
    for (let index = 1; index < numericValues.length; index += 1) {
      expect(numericValues[index]).toBeGreaterThan(numericValues[index - 1]);
    }
  });

  test('duplicate-prone means still produce unique preset values', () => {
    const values = leadTimeVariabilityOptions().map((option) => uniqueLeadTimePresetStdDays(0)[option]);

    expect(values).toEqual([0, 0.1, 0.2, 0.3, 0.4]);
    expect(new Set(values).size).toBe(values.length);
  });

  test('derives class and range from mean plus std', () => {
    expect(deriveLeadTimeFromStdDays(5, 1)).toEqual({
      highDays: 6,
      lowDays: 4,
      stdDays: 1,
      variabilityClass: 'normal',
    });
  });

  test('round-trips class compatibility through the derived std range', () => {
    for (const variabilityClass of ['very_tight', 'tight', 'normal', 'wide', 'very_wide'] as const) {
      const compatible = deriveLeadTimeFromVariabilityClass(5, variabilityClass);
      expect(deriveLeadTimeFromStdDays(5, compatible.stdDays)?.variabilityClass).toBe(variabilityClass);
    }
  });

  test('exposes stable display labels for all classes', () => {
    expect(leadTimeVariabilityLabel('very_tight')).toBe('Very tight');
    expect(leadTimeVariabilityLabel('tight')).toBe('Tight');
    expect(leadTimeVariabilityLabel('normal')).toBe('Normal');
    expect(leadTimeVariabilityLabel('wide')).toBe('Wide');
    expect(leadTimeVariabilityLabel('very_wide')).toBe('Very wide');
  });
});
