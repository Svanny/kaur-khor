import { describe, expect, test } from 'vitest';
import type { RankingEntry } from '@shared/inventory';
import { buildRankingEntryId, reorderRankingEntries } from './ranking-order';

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
});
