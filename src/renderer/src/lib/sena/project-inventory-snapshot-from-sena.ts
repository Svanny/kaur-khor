import type { InventorySnapshot, SistRegime } from '@shared/inventory';
import type { SenaCatalog, SenaObservationRecord, SenaWorkspaceSummary } from '@shared/sena';
import { linkedSkuIdsForService } from '@/lib/catalog/sena-catalog';

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

function observedAtSortValue(observation: SenaObservationRecord) {
  const time = new Date(observation.input.observedAt).getTime();
  return Number.isFinite(time) ? time : Number.NEGATIVE_INFINITY;
}

function latestObservationByObservedAt(observations: SenaObservationRecord[]) {
  return [...observations].sort((left, right) =>
    observedAtSortValue(right) - observedAtSortValue(left) ||
    right.observationId.localeCompare(left.observationId),
  )[0] ?? null;
}

function observationsAscending(observations: SenaObservationRecord[]) {
  return [...observations].sort((left, right) =>
    observedAtSortValue(left) - observedAtSortValue(right) ||
    left.observationId.localeCompare(right.observationId),
  );
}

function nonNegativeFiniteOrFallback(value: number | null | undefined, fallback: number) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : fallback;
}

function optionalNonNegativeFiniteOrFallback(value: number | null | undefined, fallback: number | null) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : fallback;
}

interface LatestSkuSnapshot {
  unitsInStock?: number;
  costPerUnit?: number;
  productPrice?: number;
}

function latestObservedSnapshotValues(observations: SenaObservationRecord[]) {
  const stockBySkuId = new Map<string, LatestSkuSnapshot>();
  const retailPriceBySkuId = new Map<string, number>();
  const servicePriceByServiceId = new Map<string, number>();

  for (const observation of observationsAscending(observations)) {
    for (const entry of observation.input.stockSnapshot) {
      const current = stockBySkuId.get(entry.skuId) ?? {};
      if (typeof entry.unitsInStock === 'number' && Number.isFinite(entry.unitsInStock) && entry.unitsInStock >= 0) {
        current.unitsInStock = entry.unitsInStock;
      }
      if (typeof entry.costPerUnit === 'number' && Number.isFinite(entry.costPerUnit) && entry.costPerUnit >= 0) {
        current.costPerUnit = entry.costPerUnit;
      }
      if (typeof entry.productPrice === 'number' && Number.isFinite(entry.productPrice) && entry.productPrice >= 0) {
        current.productPrice = entry.productPrice;
        retailPriceBySkuId.set(entry.skuId, entry.productPrice);
      }
      stockBySkuId.set(entry.skuId, current);
    }
    for (const entry of observation.input.retailPrices) {
      if (typeof entry.price === 'number' && Number.isFinite(entry.price) && entry.price >= 0) {
        retailPriceBySkuId.set(entry.skuId, entry.price);
      }
    }
    for (const entry of observation.input.servicePrices) {
      if (typeof entry.price === 'number' && Number.isFinite(entry.price) && entry.price >= 0) {
        servicePriceByServiceId.set(entry.serviceId, entry.price);
      }
    }
  }

  return { stockBySkuId, retailPriceBySkuId, servicePriceByServiceId };
}

export function projectInventorySnapshotFromSena(
  catalog: SenaCatalog,
  observations: SenaObservationRecord[],
  workspaceSummary: SenaWorkspaceSummary | null = null,
): InventorySnapshot {
  const latestObservation = latestObservationByObservedAt(observations);
  const { stockBySkuId, retailPriceBySkuId, servicePriceByServiceId } = latestObservedSnapshotValues(observations);

  return {
    skus: catalog.skus.map((sku) => {
      const latestStock = stockBySkuId.get(sku.skuId);
      return {
        skuId: sku.skuId,
        name: sku.name,
        description: sku.description,
        unitsInStock: nonNegativeFiniteOrFallback(latestStock?.unitsInStock, 0),
        costPerUnit: nonNegativeFiniteOrFallback(latestStock?.costPerUnit, sku.costPerUnit),
        soldAsProduct: sku.soldAsProduct,
        productPrice: optionalNonNegativeFiniteOrFallback(
          retailPriceBySkuId.get(sku.skuId),
          optionalNonNegativeFiniteOrFallback(latestStock?.productPrice, sku.productPrice),
        ),
        leadTimeMeanDays: sku.leadTimeMeanDaysHint,
        leadTimeStdDays: sku.leadTimeStdDaysHint,
      };
    }),
    services: catalog.services.map((service) => ({
      serviceId: service.serviceId,
      name: service.name,
      description: service.description,
      price: nonNegativeFiniteOrFallback(servicePriceByServiceId.get(service.serviceId), service.price),
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
