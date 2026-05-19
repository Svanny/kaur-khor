import { describe, expect, it } from 'vitest';
import {
  MAX_DESKTOP_WORKBENCH_TILE_ORDER_ENTRIES,
  normalizeDesktopWorkbenchTileOrderByLane,
} from './ipc';

describe('shared IPC preference normalizers', () => {
  it('trims and deduplicates persisted workbench tile order ids', () => {
    expect(
      normalizeDesktopWorkbenchTileOrderByLane({
        'supplier-order-pending': [
          ' supplier-order:sku-1 ',
          'supplier-order:sku-1',
          '',
          'supplier-order:sku-2',
        ],
      }),
    ).toEqual({
      'supplier-order-pending': ['supplier-order:sku-1', 'supplier-order:sku-2'],
    });
  });

  it('caps persisted workbench tile order lanes', () => {
    const oversizedOrder = Array.from(
      { length: MAX_DESKTOP_WORKBENCH_TILE_ORDER_ENTRIES + 5 },
      (_, index) => `supplier-order:sku-${index}`,
    );

    expect(
      normalizeDesktopWorkbenchTileOrderByLane({
        'supplier-order-pending': oversizedOrder,
      })['supplier-order-pending'],
    ).toHaveLength(MAX_DESKTOP_WORKBENCH_TILE_ORDER_ENTRIES);
  });
});
