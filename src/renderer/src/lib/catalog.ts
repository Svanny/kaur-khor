import type { InventorySnapshot, ServiceRecord, SkuRecord } from '@shared/inventory';

export type CatalogView = 'all' | 'skus' | 'services';

const CATALOG_VIEWS: CatalogView[] = ['all', 'skus', 'services'];

export function normalizeCatalogView(value: string | null): CatalogView {
  return CATALOG_VIEWS.includes(value as CatalogView) ? (value as CatalogView) : 'all';
}

export function catalogViewFromSearchParams(searchParams: URLSearchParams): CatalogView {
  return normalizeCatalogView(searchParams.get('view'));
}

export function matchesCatalogQuery(value: string, query: string) {
  return !query || value.toLowerCase().includes(query.toLowerCase());
}

export function sortByName<T extends { name: string }>(rows: T[]) {
  return [...rows].sort((left, right) => left.name.localeCompare(right.name));
}

export function serviceLinkedSkus(service: ServiceRecord, snapshot: InventorySnapshot) {
  return service.skuIds
    .map((skuId) => snapshot.skus.find((sku) => sku.skuId === skuId))
    .filter((sku): sku is SkuRecord => Boolean(sku));
}

export function linkedServicesForSku(skuId: string, snapshot: InventorySnapshot) {
  return sortByName(snapshot.services.filter((service) => service.skuIds.includes(skuId)));
}

export function computeServiceSellableUnits(service: ServiceRecord, snapshot: InventorySnapshot) {
  const linkedSkus = serviceLinkedSkus(service, snapshot);
  if (linkedSkus.length === 0) {
    return 0;
  }

  return linkedSkus.reduce(
    (minimum, sku) => Math.min(minimum, sku.unitsInStock),
    linkedSkus[0].unitsInStock,
  );
}

export function serviceAvailabilityStatus(service: ServiceRecord, snapshot: InventorySnapshot) {
  const linkedSkus = serviceLinkedSkus(service, snapshot);
  const sellableUnits = computeServiceSellableUnits(service, snapshot);

  if (linkedSkus.length === 0) {
    return 'unlinked';
  }
  if (sellableUnits <= 0) {
    return 'stockout';
  }
  return 'available';
}

export function serviceCoverageState(service: ServiceRecord, snapshot: InventorySnapshot) {
  const availability = serviceAvailabilityStatus(service, snapshot);
  const hasHighRiskSku = service.skuIds.some((skuId) => snapshot.sist.highRiskSkuIds.includes(skuId));

  if (availability === 'stockout') {
    return 'blocked';
  }
  if (hasHighRiskSku) {
    return 'at-risk';
  }
  return availability === 'available' ? 'available' : 'unlinked';
}

export function serviceCoverageStateKey(service: ServiceRecord, snapshot: InventorySnapshot) {
  const availability = serviceAvailabilityStatus(service, snapshot);
  const coverageState = serviceCoverageState(service, snapshot);

  if (coverageState === 'blocked') {
    return 'catalogServiceBlockedState';
  }
  if (coverageState === 'at-risk') {
    return 'catalogServiceAtRiskState';
  }
  return availability === 'available'
    ? 'catalogServiceAvailabilityAvailable'
    : 'catalogServiceAvailabilityUnlinked';
}
