import type { InventorySnapshot } from '@shared/inventory';
import { SENA_SCHEMA_VERSION, type SenaCatalog } from '@shared/sena';
export { projectInventorySnapshotFromSena } from '@/lib/project-inventory-snapshot-from-sena';

function normalizeCatalog(catalog: SenaCatalog): SenaCatalog {
  return {
    ...catalog,
    skus: [...catalog.skus].sort((left, right) => left.skuId.localeCompare(right.skuId)),
    services: [...catalog.services].sort((left, right) => left.serviceId.localeCompare(right.serviceId)),
    bundles: [...catalog.bundles].sort((left, right) => left.bundleId.localeCompare(right.bundleId)),
    sharingMask: [...catalog.sharingMask].sort((left, right) =>
      `${left.serviceId}:${left.skuId}`.localeCompare(`${right.serviceId}:${right.skuId}`),
    ),
  };
}

export function seedSenaCatalogFromSnapshot(snapshot: InventorySnapshot): SenaCatalog {
  return normalizeCatalog({
    schemaVersion: SENA_SCHEMA_VERSION,
    skus: snapshot.skus.map((sku) => ({
      skuId: sku.skuId,
      name: sku.name,
      description: sku.description,
      costPerUnit: sku.costPerUnit,
      soldAsProduct: sku.soldAsProduct,
      productPrice: sku.productPrice,
      leadTimeMeanDaysHint: sku.leadTimeMeanDays,
      leadTimeStdDaysHint: sku.leadTimeStdDays,
    })),
    services: snapshot.services.map((service) => ({
      serviceId: service.serviceId,
      name: service.name,
      description: service.description,
      price: service.price,
      bundle: false,
    })),
    bundles: [],
    sharingMask: snapshot.services.flatMap((service) =>
      service.skuIds.map((skuId) => ({
        serviceId: service.serviceId,
        skuId,
        enabled: true,
        usageProbability: null,
      })),
    ),
  });
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableStringify(entry)).join(',')}]`;
  }
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => `${JSON.stringify(key)}:${stableStringify(entry)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

export function hashSenaCatalog(catalog: SenaCatalog) {
  const normalized = stableStringify(normalizeCatalog(catalog));
  let hash = 2166136261;
  for (let index = 0; index < normalized.length; index += 1) {
    hash ^= normalized.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `catalog-${(hash >>> 0).toString(16)}`;
}
