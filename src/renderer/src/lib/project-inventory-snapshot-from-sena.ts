import type { InventorySnapshot } from '@shared/inventory';
import type { SenaCatalog, SenaObservationRecord } from '@shared/sena';
import { linkedSkuIdsForService } from '@/lib/sena-catalog';

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
