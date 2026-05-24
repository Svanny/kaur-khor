import type { StockReport, StockReportServicePriceAdjustment, StockReportSkuObservation } from '@shared/inventory';
import type { SenaObservationRecord } from '@shared/sena';

function sortObservationsAscending(observations: SenaObservationRecord[]) {
  return [...observations].sort((left, right) => {
    const leftTime = new Date(left.input.observedAt).getTime();
    const rightTime = new Date(right.input.observedAt).getTime();
    const leftSort = Number.isFinite(leftTime) ? leftTime : Number.POSITIVE_INFINITY;
    const rightSort = Number.isFinite(rightTime) ? rightTime : Number.POSITIVE_INFINITY;
    if (leftSort !== rightSort) {
      return leftSort - rightSort;
    }
    return left.observationId.localeCompare(right.observationId);
  });
}

function nonNegativeFiniteOrFallback(value: number | null | undefined, fallback: number) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : fallback;
}

function optionalNonNegativeFiniteOrFallback(value: number | null | undefined, fallback: number | null) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : fallback;
}

function finiteOrNull(value: number | null | undefined) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

export function projectStockReportsFromSena(observations: SenaObservationRecord[]): StockReport[] {
  const previousRetailPriceBySkuId = new Map<string, number | null>();
  const previousServicePriceByServiceId = new Map<string, number | null>();
  const reports = sortObservationsAscending(observations).map<StockReport>((observation) => {
    const skuObservationBySkuId = new Map(
      observation.input.stockSnapshot.map((entry) => [entry.skuId, entry]),
    );
    const retailPriceBySkuId = new Map(
      (observation.input.retailPrices ?? []).map((entry) => [entry.skuId, entry.price]),
    );
    const orderSignalBySkuId = new Map(
      (observation.input.orderSignals ?? []).map((entry) => [entry.skuId, entry]),
    );
    const adjustmentBySkuId = new Map(
      (observation.input.adjustmentSignals ?? []).map((entry) => [entry.skuId, entry]),
    );
    const retailStockoutSkuIds = new Set(observation.input.retailStockouts ?? []);

    const skuIds = new Set<string>([
      ...skuObservationBySkuId.keys(),
      ...retailPriceBySkuId.keys(),
      ...orderSignalBySkuId.keys(),
      ...adjustmentBySkuId.keys(),
      ...retailStockoutSkuIds,
    ]);

    const skuObservations = [...skuIds]
      .sort((left, right) => left.localeCompare(right))
      .map<StockReportSkuObservation>((skuId) => {
        const stockSnapshot = skuObservationBySkuId.get(skuId);
        const retailPrice = retailPriceBySkuId.get(skuId);
        const orderSignal = orderSignalBySkuId.get(skuId);
        const adjustment = adjustmentBySkuId.get(skuId);
        const nextObservation: StockReportSkuObservation = {
          skuId,
          unitsInStock: nonNegativeFiniteOrFallback(stockSnapshot?.unitsInStock, 0),
          costPerUnit: nonNegativeFiniteOrFallback(stockSnapshot?.costPerUnit, 0),
        };
        if (stockSnapshot?.productPrice != null || retailPrice != null) {
          nextObservation.productPrice = optionalNonNegativeFiniteOrFallback(
            retailPrice,
            optionalNonNegativeFiniteOrFallback(stockSnapshot?.productPrice, null),
          );
        }
        const previousPrice = previousRetailPriceBySkuId.get(skuId);
        if (previousPrice !== undefined) {
          nextObservation.previousProductPrice = previousPrice;
        }
        if (orderSignal) {
          nextObservation.restockIncluded = orderSignal.receiptArrived;
          nextObservation.approximateOrderQuantity = orderSignal.approximateOrderQuantity ?? null;
          nextObservation.approximateReceiptQuantity = orderSignal.approximateReceiptQuantity ?? null;
        }
        if (retailStockoutSkuIds.has(skuId)) {
          nextObservation.retailStockout = true;
        }
        if (adjustment) {
          nextObservation.adjustmentDelta = finiteOrNull(adjustment.quantityDelta);
          nextObservation.notes = adjustment.reason;
        }
        previousRetailPriceBySkuId.set(skuId, nextObservation.productPrice ?? null);
        return nextObservation;
      });

    const servicePriceAdjustments = (observation.input.servicePrices ?? [])
      .map<StockReportServicePriceAdjustment>((entry) => {
        const price = nonNegativeFiniteOrFallback(entry.price, 0);
        const nextAdjustment: StockReportServicePriceAdjustment = {
          serviceId: entry.serviceId,
          price,
        };
        const previousPrice = previousServicePriceByServiceId.get(entry.serviceId);
        if (previousPrice !== undefined) {
          nextAdjustment.previousPrice = previousPrice;
        }
        previousServicePriceByServiceId.set(entry.serviceId, price);
        return nextAdjustment;
      });

    return {
      reportId: observation.observationId,
      reportSource: 'manual',
      reportedAt: observation.input.observedAt,
      skuObservations,
      serviceSignals: (observation.input.serviceStockouts ?? []).map((serviceId) => ({
        serviceId,
        stockout: true,
      })),
      servicePriceAdjustments,
      topServiceRanking: observation.input.serviceRankings ?? [],
      topRetailRanking: observation.input.retailRankings ?? [],
      notes: observation.input.notes,
    };
  });

  return reports.reverse();
}
