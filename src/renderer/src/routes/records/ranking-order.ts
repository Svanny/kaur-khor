import { arrayMove } from '@dnd-kit/sortable';
import type { RankingEntry, RankingEntryType } from '@shared/inventory';

export function buildRankingEntryId(entry: RankingEntry) {
  return `${entry.entryType}:${entry.entryId}`;
}

export function reorderRankingEntries(
  entries: RankingEntry[],
  activeId: string,
  overId: string,
) {
  if (activeId === overId) {
    return entries;
  }

  const oldIndex = entries.findIndex((entry) => buildRankingEntryId(entry) === activeId);
  const newIndex = entries.findIndex((entry) => buildRankingEntryId(entry) === overId);

  if (oldIndex === -1 || newIndex === -1 || oldIndex === newIndex) {
    return entries;
  }

  return arrayMove(entries, oldIndex, newIndex).map((entry, position) => ({
    ...entry,
    position,
  }));
}

export function buildRankChangeByEntryKey({
  displayedIds,
  entryType,
  seedIds,
  valuesActive,
}: {
  displayedIds: string[];
  entryType: RankingEntryType;
  seedIds: string[];
  valuesActive: boolean;
}) {
  if (!valuesActive) {
    return Object.fromEntries(
      displayedIds.map((entryId) => [`${entryType}:${entryId}`, null]),
    ) as Record<string, 'up' | 'down' | null>;
  }

  const baselineIndexById = new Map(seedIds.map((entryId, index) => [entryId, index]));

  return Object.fromEntries(
    displayedIds.map((entryId, currentIndex) => {
      const baselineIndex = baselineIndexById.get(entryId);
      const direction =
        baselineIndex == null || baselineIndex === currentIndex
          ? null
          : baselineIndex > currentIndex
            ? 'up'
            : 'down';
      return [`${entryType}:${entryId}`, direction];
    }),
  ) as Record<string, 'up' | 'down' | null>;
}
