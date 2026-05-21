import { arrayMove } from '@dnd-kit/sortable';

type StockRowIdentity = {
  skuId: string;
};

export const MAX_STOCK_ROW_ORDER_ENTRIES = 500;

export function buildStockRowOrderStorageKey(laneId: string) {
  return `kaur-khor:record-update:stock-row-order:${laneId}:v1`;
}

export function sanitizeStockRowOrder(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  const seenSkuIds = new Set<string>();
  const orderedSkuIds: string[] = [];
  for (const entry of value) {
    const skuId = typeof entry === 'string' ? entry.trim() : '';
    if (
      seenSkuIds.size >= MAX_STOCK_ROW_ORDER_ENTRIES ||
      !skuId ||
      seenSkuIds.has(skuId)
    ) {
      continue;
    }
    seenSkuIds.add(skuId);
    orderedSkuIds.push(skuId);
    if (seenSkuIds.size >= MAX_STOCK_ROW_ORDER_ENTRIES) {
      break;
    }
  }
  return orderedSkuIds;
}

export function applyStockRowOrder<Row extends StockRowIdentity>(
  rows: Row[],
  orderedSkuIds: string[],
) {
  if (rows.length <= 1 || orderedSkuIds.length === 0) {
    return rows;
  }

  const rowBySkuId = new Map(rows.map((row) => [row.skuId, row]));
  const orderedSkuIdSet = new Set(orderedSkuIds);
  const orderedRows = orderedSkuIds.flatMap((skuId) => {
    const row = rowBySkuId.get(skuId);
    return row ? [row] : [];
  });
  const remainingRows = rows.filter((row) => !orderedSkuIdSet.has(row.skuId));
  return [...orderedRows, ...remainingRows];
}

export function reorderStockRows<Row extends StockRowIdentity>(
  rows: Row[],
  activeSkuId: string,
  overSkuId: string,
) {
  if (activeSkuId === overSkuId) {
    return rows;
  }

  const oldIndex = rows.findIndex((row) => row.skuId === activeSkuId);
  const newIndex = rows.findIndex((row) => row.skuId === overSkuId);
  if (oldIndex === -1 || newIndex === -1 || oldIndex === newIndex) {
    return rows;
  }

  return arrayMove(rows, oldIndex, newIndex);
}

function getBrowserStorage() {
  if (typeof window === 'undefined') {
    return null;
  }
  try {
    const storage = window.localStorage;
    return storage &&
      typeof storage.getItem === 'function' &&
      typeof storage.setItem === 'function'
      ? storage
      : null;
  } catch {
    return null;
  }
}

export function readStockRowOrder(storageKey: string) {
  const storage = getBrowserStorage();
  if (!storage) {
    return [];
  }

  let rawValue: string | null;
  try {
    rawValue = storage.getItem(storageKey);
  } catch {
    return [];
  }
  if (!rawValue) {
    return [];
  }

  try {
    return sanitizeStockRowOrder(JSON.parse(rawValue));
  } catch {
    return [];
  }
}

export function writeStockRowOrder(storageKey: string, orderedSkuIds: string[]) {
  const storage = getBrowserStorage();
  if (!storage) {
    return;
  }

  try {
    storage.setItem(storageKey, JSON.stringify(sanitizeStockRowOrder(orderedSkuIds)));
  } catch {
    // Persisted row order is a convenience preference; failures should not block updates.
  }
}
