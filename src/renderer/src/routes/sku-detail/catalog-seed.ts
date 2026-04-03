import type { InventorySnapshot } from '@shared/inventory';
import { SENA_SCHEMA_VERSION, type SenaCatalog, type SenaObservationRecord } from '@shared/sena';
import { linkedSkuIdsForService } from '@/lib/sena-catalog';

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

export function projectInventorySnapshotFromSena(
  catalog: SenaCatalog,
  observations: SenaObservationRecord[],
): InventorySnapshot {
  const latestObservation = observations.at(-1) ?? null;
  const stockBySkuId = new Map(
    latestObservation?.input.stockSnapshot.map((entry) => [entry.skuId, entry]) ?? [],
  );
  const retailPriceBySkuId = new Map(
    latestObservation?.input.retailPrices.map((entry) => [entry.skuId, entry.price]) ?? [],
  );

  return {
    skus: catalog.skus.map((sku) => {
      const latestStock = stockBySkuId.get(sku.skuId);
      return {
        skuId: sku.skuId,
        name: sku.name,
        description: sku.description,
        unitsInStock: latestStock?.unitsInStock ?? 0,
        costPerUnit: latestStock?.costPerUnit ?? sku.costPerUnit,
        soldAsProduct: sku.soldAsProduct,
        productPrice: retailPriceBySkuId.get(sku.skuId) ?? latestStock?.productPrice ?? sku.productPrice,
        leadTimeMeanDays: sku.leadTimeMeanDaysHint,
        leadTimeStdDays: sku.leadTimeStdDaysHint,
      };
    }),
    services: catalog.services.map((service) => ({
      serviceId: service.serviceId,
      name: service.name,
      description: service.description,
      price: service.price,
      skuIds: linkedSkuIdsForService(catalog, service.serviceId),
    })),
    ranking: [],
    sist: {
      status: {
        state: 'ready',
        updatedAt: latestObservation?.input.observedAt ?? null,
        reportCount: observations.length,
        confidence: observations.length >= 2 ? 'medium' : 'low',
        reason: null,
      },
      settings: {
        targetServiceLevel: 0.95,
        forecastHorizonDays: 14,
        particleCount: 512,
        smoothingWindowReports: 90,
      },
      asOf: latestObservation?.input.observedAt ?? null,
      topRegime: null,
      pendingReorderCount: 0,
      highRiskSkuIds: [],
      skuInsights: [],
    },
  };
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
