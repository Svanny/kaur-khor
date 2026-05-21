import { describe, expect, it } from 'vitest';
import { MAX_DESKTOP_WORKBENCH_TILE_ORDER_ENTRIES } from '@shared/ipc';
import {
  applyWorkbenchTileOrder,
  mergeWorkbenchTileOrderForVisibleSubset,
  sanitizeWorkbenchTileOrder,
} from '../workspace/workbench-tile-order';

describe('workbench tile order helpers', () => {
  it('sanitizes invalid and duplicate tile ids', () => {
    expect(
      sanitizeWorkbenchTileOrder([' supplier-order:sku-1 ', '', 42, 'supplier-order:sku-1', 'supplier-order:sku-2']),
    ).toEqual(['supplier-order:sku-1', 'supplier-order:sku-2']);
  });

  it('caps dirty persisted tile orders before they inflate sorting work', () => {
    const oversizedOrder = Array.from(
      { length: MAX_DESKTOP_WORKBENCH_TILE_ORDER_ENTRIES + 25 },
      (_, index) => `supplier-order:sku-${index}`,
    );

    expect(sanitizeWorkbenchTileOrder(oversizedOrder)).toHaveLength(MAX_DESKTOP_WORKBENCH_TILE_ORDER_ENTRIES);
  });

  it('applies persisted order, prunes stale ids, and appends new tiles', () => {
    const tiles = [
      { key: 'supplier-order:sku-1', title: 'One' },
      { key: 'supplier-order:sku-2', title: 'Two' },
      { key: 'supplier-order:sku-3', title: 'Three' },
    ];

    expect(
      applyWorkbenchTileOrder(tiles, ['supplier-order:sku-3', 'missing', 'supplier-order:sku-1']),
    ).toEqual([
      { key: 'supplier-order:sku-3', title: 'Three' },
      { key: 'supplier-order:sku-1', title: 'One' },
      { key: 'supplier-order:sku-2', title: 'Two' },
    ]);
  });

  it('reorders only the visible subset while preserving hidden tile order', () => {
    expect(
      mergeWorkbenchTileOrderForVisibleSubset({
        allTileKeys: [
          'supplier-order:sku-1',
          'supplier-order:sku-2',
          'supplier-order:sku-3',
          'supplier-order:sku-4',
        ],
        visibleTileKeys: [
          'supplier-order:sku-1',
          'supplier-order:sku-3',
          'supplier-order:sku-4',
        ],
        activeTileKey: 'supplier-order:sku-4',
        overTileKey: 'supplier-order:sku-1',
      }),
    ).toEqual([
      'supplier-order:sku-4',
      'supplier-order:sku-2',
      'supplier-order:sku-1',
      'supplier-order:sku-3',
    ]);
  });
});
