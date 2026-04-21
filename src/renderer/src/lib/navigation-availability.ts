import type { DesktopSeenUnlockedNavItemId, DesktopSeenUnlockedNavItems } from '@shared/ipc';
import type { InventoryContextValue } from '@/state/inventory';
import { activeSenaCatalog } from './sena-catalog';

export type NavigationAvailability = {
  hasCatalogTab: boolean;
  hasLogsTab: boolean;
  hasPerformanceTab: boolean;
  hasFinancialsTab: boolean;
  hasRecordUpdateTab: boolean;
};

export const GATED_NAV_ITEM_IDS: DesktopSeenUnlockedNavItemId[] = [
  'catalog',
  'operations',
  'performance',
  'financials',
];

function deriveAvailableObservationCount(
  inventory: Pick<InventoryContextValue, 'latestRun' | 'observations' | 'workspaceSummary'>,
) {
  return Math.max(
    inventory.observations?.length ?? 0,
    inventory.latestRun?.observationCount ?? 0,
    inventory.workspaceSummary?.intervalCount ?? 0,
  );
}

export function deriveNavigationAvailability(
  inventory: Pick<InventoryContextValue, 'catalog' | 'latestRun' | 'observations' | 'workspaceSummary'>,
): NavigationAvailability {
  const visibleCatalog = activeSenaCatalog(inventory.catalog) ?? inventory.catalog;
  const activeSkuCount = visibleCatalog?.skus.filter((sku) => !sku.archived).length ?? 0;
  const activeServiceCount = visibleCatalog?.services.filter((service) => !service.archived).length ?? 0;
  const observationCount = deriveAvailableObservationCount(inventory);

  return {
    hasCatalogTab: activeSkuCount >= 1,
    hasLogsTab: observationCount >= 1,
    hasPerformanceTab: observationCount >= 2,
    hasFinancialsTab: observationCount >= 2,
    hasRecordUpdateTab: activeSkuCount + activeServiceCount >= 1,
  };
}

export function isUnlockedNavItemNew(
  itemId: DesktopSeenUnlockedNavItemId,
  availability: NavigationAvailability,
  seenUnlockedNavItems: DesktopSeenUnlockedNavItems,
) {
  return isUnlockedNavItemVisible(itemId, availability) && !seenUnlockedNavItems[itemId];
}

export function isUnlockedNavItemVisible(
  itemId: DesktopSeenUnlockedNavItemId,
  availability: NavigationAvailability,
) {
  switch (itemId) {
    case 'catalog':
      return availability.hasCatalogTab;
    case 'operations':
      return availability.hasLogsTab;
    case 'performance':
      return availability.hasPerformanceTab;
    case 'financials':
      return availability.hasFinancialsTab;
    default:
      return false;
  }
}
