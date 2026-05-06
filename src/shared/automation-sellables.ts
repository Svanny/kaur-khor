import type { SenaCatalog, SenaService, SenaSku } from './sena';

export function isAutomationEligibleSku(sku: SenaSku) {
  return !sku.archived && sku.soldAsProduct && sku.productPrice != null;
}

export function isAutomationEligibleService(service: SenaService) {
  return !service.archived;
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
