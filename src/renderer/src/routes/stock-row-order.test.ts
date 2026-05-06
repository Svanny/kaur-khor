import { beforeEach, describe, expect, it } from 'vitest';
import {
  applyStockRowOrder,
  buildStockRowOrderStorageKey,
  readStockRowOrder,
  reorderStockRows,
  writeStockRowOrder,
} from './stock-row-order';

function installMemoryLocalStorage() {
  const storage = new Map<string, string>();
  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    value: {
      clear: () => storage.clear(),
      getItem: (key: string) => storage.get(key) ?? null,
      key: (index: number) => Array.from(storage.keys())[index] ?? null,
      removeItem: (key: string) => storage.delete(key),
      setItem: (key: string, value: string) => storage.set(key, value),
      get length() {
        return storage.size;
      },
    },
  });
}

describe('stock-row-order', () => {
  beforeEach(() => {
    installMemoryLocalStorage();
  });

  it('reapplies a saved sku order and appends new rows', () => {
    const rows = [
      { skuId: 'sku-1', unitsInStock: 1 },
      { skuId: 'sku-2', unitsInStock: 2 },
      { skuId: 'sku-3', unitsInStock: 3 },
    ];

    expect(applyStockRowOrder(rows, ['sku-3', 'sku-1']).map((row) => row.skuId)).toEqual([
      'sku-3',
      'sku-1',
      'sku-2',
    ]);
  });

  it('reorders rows by drag ids', () => {
    const rows = [{ skuId: 'sku-1' }, { skuId: 'sku-2' }, { skuId: 'sku-3' }];

    expect(reorderStockRows(rows, 'sku-3', 'sku-1').map((row) => row.skuId)).toEqual([
      'sku-3',
      'sku-1',
      'sku-2',
    ]);
  });

  it('writes and reads the persisted sku order with duplicate ids removed', () => {
    const storageKey = buildStockRowOrderStorageKey('stock-count');
    writeStockRowOrder(storageKey, ['sku-2', 'sku-2', 'sku-1']);

    expect(readStockRowOrder(storageKey)).toEqual(['sku-2', 'sku-1']);
  });

  it('ignores unavailable browser storage while reading and writing row order', () => {
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      get() {
        throw new Error('storage blocked');
      },
    });

    expect(readStockRowOrder(buildStockRowOrderStorageKey('stock-count'))).toEqual([]);
    expect(() => writeStockRowOrder(buildStockRowOrderStorageKey('stock-count'), ['sku-1'])).not.toThrow();
  });

  it('ignores row-order storage operation failures', () => {
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      value: {
        getItem: () => {
          throw new Error('read blocked');
        },
        setItem: () => {
          throw new Error('write blocked');
        },
      },
    });

    expect(readStockRowOrder(buildStockRowOrderStorageKey('stock-count'))).toEqual([]);
    expect(() => writeStockRowOrder(buildStockRowOrderStorageKey('stock-count'), ['sku-1'])).not.toThrow();
  });
});
