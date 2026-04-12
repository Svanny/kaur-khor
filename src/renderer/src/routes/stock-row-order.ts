import { arrayMove } from '@dnd-kit/sortable';

type StockRowIdentity = {
  skuId: string;
};

export function buildStockRowOrderStorageKey(laneId: string) {
  return `banji:record-update:stock-row-order:${laneId}:v1`;
}

export function sanitizeStockRowOrder(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  const seenSkuIds = new Set<string>();
  return value.filter((entry): entry is string => {
    if (typeof entry !== 'string' || entry.length === 0 || seenSkuIds.has(entry)) {
      return false;
    }
    seenSkuIds.add(entry);
    return true;
  });
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

function canUseBrowserStorage() {
  return (
    typeof window !== 'undefined' &&
    typeof window.localStorage !== 'undefined' &&
    typeof window.localStorage.getItem === 'function' &&
    typeof window.localStorage.setItem === 'function'
  );
}

export function readStockRowOrder(storageKey: string) {
  if (!canUseBrowserStorage()) {
    return [];
  }

  const rawValue = window.localStorage.getItem(storageKey);
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
  if (!canUseBrowserStorage()) {
    return;
  }

  window.localStorage.setItem(storageKey, JSON.stringify(sanitizeStockRowOrder(orderedSkuIds)));
}
