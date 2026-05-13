import type { InventorySnapshot, SistRegime } from '@shared/inventory';
import type { SenaCatalog, SenaObservationRecord, SenaWorkspaceSummary } from '@shared/sena';
import { linkedSkuIdsForService } from '@/lib/sena-catalog';

const SIST_REGIMES = new Set<string>([
  'normal',
  'spike',
  'lull',
  'stockout_constrained',
  'promo',
  'correction',
]);

function toSistRegime(value: string | null | undefined): SistRegime | null {
  return value && SIST_REGIMES.has(value) ? (value as SistRegime) : null;
}

export function projectInventorySnapshotFromSena(
  catalog: SenaCatalog,
  observations: SenaObservationRecord[],
  workspaceSummary: SenaWorkspaceSummary | null = null,
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
      topRegime: toSistRegime(workspaceSummary?.topRegime),
      pendingReorderCount: workspaceSummary?.pendingReorderCount ?? 0,
      highRiskSkuIds: workspaceSummary?.highRiskSkuIds ?? [],
      skuInsights: (workspaceSummary?.skuSummaries ?? []).map((summary) => ({
        skuId: summary.skuId,
        latestPosteriorUnits: summary.latestPosteriorUnits,
        credibleIntervalLow: summary.credibleIntervalLow,
        credibleIntervalHigh: summary.credibleIntervalHigh,
        daysOfCover: summary.daysOfCover,
        stockoutRisk: summary.stockoutRisk,
        reorderPoint: summary.reorderPoint,
        safetyStock: summary.safetyStock,
        reorderTriggerProbability: summary.reorderTriggerProbability,
        expectedDemandPerDay: summary.demandPerDayMean,
        demandIntervalLow: summary.demandPerDayMean,
        demandIntervalHigh: summary.demandPerDayMean,
        leadTime: {
          meanDays: summary.leadTimeMeanDays,
          stdDays: summary.leadTimeStdDays,
          source: 'inferred',
        },
        regimeProbabilities: summary.regimeProbabilities,
        confidence: observations.length >= 2 ? 'medium' : 'low',
      })),
    },
  };
}
