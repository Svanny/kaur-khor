import type { DesktopSeenUnlockedNavItemId, DesktopSeenUnlockedNavItems } from '@shared/ipc';
import { hasAutomationEligibleSellable } from '@shared/automation-sellables';
import type { InventoryContextValue } from '@/state/inventory';
import { activeSenaCatalog } from './sena-catalog';

export type NavigationAvailability = {
  hasCatalogTab: boolean;
  hasHistory: boolean;
  hasInsights: boolean;
  hasWork: boolean;
  hasWorkCapture: boolean;
  hasWorkIntake: boolean;
};

export const GATED_NAV_ITEM_IDS: DesktopSeenUnlockedNavItemId[] = [
  'catalog',
  'insights',
  'work',
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
    hasHistory: observationCount >= 1,
    hasInsights: observationCount >= 2,
    hasWork: activeSkuCount + activeServiceCount >= 1,
    hasWorkCapture: activeSkuCount + activeServiceCount >= 1,
    hasWorkIntake:
      observationCount >= 1 &&
      hasAutomationEligibleSellable(visibleCatalog),
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
    case 'insights':
      return availability.hasInsights;
    case 'work':
      return availability.hasWork;
    default:
      return false;
  }
}
