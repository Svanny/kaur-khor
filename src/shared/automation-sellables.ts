import type { AutomationExposureRow } from './automation';
import type { SenaCatalog, SenaService, SenaSku } from './sena';

function isFiniteNonNegativePrice(value: number | null | undefined) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

export function isAutomationEligibleSku(sku: SenaSku) {
  return !sku.archived && sku.soldAsProduct && isFiniteNonNegativePrice(sku.productPrice);
}

export function isAutomationEligibleService(service: SenaService) {
  return !service.archived && isFiniteNonNegativePrice(service.price);
}

export function isAutomationEligibleExposureRow(row: AutomationExposureRow) {
  return !row.archived && row.availabilityStatus !== 'hidden' && isFiniteNonNegativePrice(row.price);
}

export function hasAutomationEligibleSellable(catalog: SenaCatalog | null | undefined) {
  if (!catalog) {
    return false;
  }

  return (
    catalog.skus.some((sku) => isAutomationEligibleSku(sku)) ||
    catalog.services.some((service) => isAutomationEligibleService(service))
  );
}
