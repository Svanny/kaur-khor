import { arrayMove } from '@dnd-kit/sortable';
import { MAX_DESKTOP_WORKBENCH_TILE_ORDER_ENTRIES } from '@shared/ipc';

export function sanitizeWorkbenchTileOrder(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  const seenIds = new Set<string>();
  return value.flatMap((entry): string[] => {
    const tileKey = typeof entry === 'string' ? entry.trim() : '';
    if (
      seenIds.size >= MAX_DESKTOP_WORKBENCH_TILE_ORDER_ENTRIES ||
      !tileKey ||
      seenIds.has(tileKey)
    ) {
      return [];
    }
    seenIds.add(tileKey);
    return [tileKey];
  });
}

export function applyWorkbenchTileOrder<T extends { key: string }>(
  tiles: T[],
  orderedTileKeys: string[],
) {
  if (tiles.length <= 1 || orderedTileKeys.length === 0) {
    return tiles;
  }

  const tileByKey = new Map(tiles.map((tile) => [tile.key, tile] as const));
  const orderedKeySet = new Set(orderedTileKeys);
  const orderedTiles = orderedTileKeys.flatMap((tileKey) => {
    const tile = tileByKey.get(tileKey);
    return tile ? [tile] : [];
  });
  const remainingTiles = tiles.filter((tile) => !orderedKeySet.has(tile.key));

  return [...orderedTiles, ...remainingTiles];
}

export function reorderWorkbenchTileKeys(
  tileKeys: string[],
  activeTileKey: string,
  overTileKey: string,
) {
  if (activeTileKey === overTileKey) {
    return tileKeys;
  }

  const oldIndex = tileKeys.indexOf(activeTileKey);
  const newIndex = tileKeys.indexOf(overTileKey);

  if (oldIndex === -1 || newIndex === -1 || oldIndex === newIndex) {
    return tileKeys;
  }

  return arrayMove(tileKeys, oldIndex, newIndex);
}

export function mergeWorkbenchTileOrderForVisibleSubset({
  activeTileKey,
  allTileKeys,
  overTileKey,
  visibleTileKeys,
}: {
  activeTileKey: string;
  allTileKeys: string[];
  overTileKey: string;
  visibleTileKeys: string[];
}) {
  const sanitizedAllTileKeys = sanitizeWorkbenchTileOrder(allTileKeys);
  const sanitizedVisibleTileKeys = sanitizeWorkbenchTileOrder(visibleTileKeys).filter((tileKey) =>
    sanitizedAllTileKeys.includes(tileKey),
  );

  if (sanitizedVisibleTileKeys.length <= 1) {
    return sanitizedAllTileKeys;
  }

  const reorderedVisibleTileKeys = reorderWorkbenchTileKeys(
    sanitizedVisibleTileKeys,
    activeTileKey,
    overTileKey,
  );

  if (reorderedVisibleTileKeys === sanitizedVisibleTileKeys) {
    return sanitizedAllTileKeys;
  }

  const visibleTileKeySet = new Set(reorderedVisibleTileKeys);
  const nextTileKeys: string[] = [];
  let visibleIndex = 0;

  for (const tileKey of sanitizedAllTileKeys) {
    if (!visibleTileKeySet.has(tileKey)) {
      nextTileKeys.push(tileKey);
      continue;
    }
    nextTileKeys.push(reorderedVisibleTileKeys[visibleIndex] ?? tileKey);
    visibleIndex += 1;
  }

  return nextTileKeys;
}
