import { describe, expect, test } from 'vitest';
import type { RankingEntry } from '@shared/inventory';
import {
  buildRankChangeByEntryKey,
  buildRankingEntryId,
  reorderRankingEntries,
} from './ranking-order';

describe('ranking-order', () => {
  test('builds a stable sortable id from the entry type and id', () => {
    expect(
      buildRankingEntryId({
        entryType: 'service',
        entryId: 'service-1',
        position: 0,
      }),
    ).toBe('service:service-1');
  });

  test('reorders entries and rewrites positions after a drop', () => {
    const entries: RankingEntry[] = [
      { entryType: 'service', entryId: 'service-1', position: 0 },
      { entryType: 'service', entryId: 'service-2', position: 1 },
      { entryType: 'sku', entryId: 'sku-1', position: 2 },
    ];

    expect(
      reorderRankingEntries(entries, 'service:service-1', 'sku:sku-1'),
    ).toEqual([
      { entryType: 'service', entryId: 'service-2', position: 0 },
      { entryType: 'sku', entryId: 'sku-1', position: 1 },
      { entryType: 'service', entryId: 'service-1', position: 2 },
    ]);
  });

  test('returns the existing order when ids are unchanged or missing', () => {
    const entries: RankingEntry[] = [
      { entryType: 'service', entryId: 'service-1', position: 0 },
      { entryType: 'sku', entryId: 'sku-1', position: 1 },
    ];

    expect(reorderRankingEntries(entries, 'service:service-1', 'service:service-1')).toBe(entries);
    expect(reorderRankingEntries(entries, 'service:missing', 'sku:sku-1')).toBe(entries);
  });

  test('builds signed rank movement against the seeded baseline order', () => {
    expect(
      buildRankChangeByEntryKey({
        displayedIds: ['service-1', 'service-4', 'service-2', 'service-3'],
        entryType: 'service',
        seedIds: ['service-1', 'service-2', 'service-3', 'service-4'],
        valuesActive: true,
      }),
    ).toEqual({
      'service:service-1': null,
      'service:service-2': 'down',
      'service:service-3': 'down',
      'service:service-4': 'up',
    });
  });

  test('suppresses rank movement when there is no explicit ranking override', () => {
    expect(
      buildRankChangeByEntryKey({
        displayedIds: ['sku-1', 'sku-2'],
        entryType: 'sku',
        seedIds: ['sku-2', 'sku-1'],
        valuesActive: false,
      }),
    ).toEqual({
      'sku:sku-1': null,
      'sku:sku-2': null,
    });
  });
});
