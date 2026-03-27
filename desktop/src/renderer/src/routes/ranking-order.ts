import { arrayMove } from '@dnd-kit/sortable';
import type { RankingEntry } from '@shared/inventory';

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
