import type { StockReport, StockReportServicePriceAdjustment, StockReportSkuObservation } from '@shared/inventory';
import type { SenaObservationRecord } from '@shared/sena';

function sortObservationsAscending(observations: SenaObservationRecord[]) {
  return [...observations].sort((left, right) => {
    const observedDelta = new Date(left.input.observedAt).getTime() - new Date(right.input.observedAt).getTime();
    if (observedDelta !== 0) {
      return observedDelta;
    }
    return left.observationId.localeCompare(right.observationId);
  });
}

export function projectStockReportsFromSena(observations: SenaObservationRecord[]): StockReport[] {
  const previousRetailPriceBySkuId = new Map<string, number | null>();
  const previousServicePriceByServiceId = new Map<string, number>();
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
          unitsInStock: stockSnapshot?.unitsInStock ?? 0,
          costPerUnit: stockSnapshot?.costPerUnit ?? 0,
        };
        if (stockSnapshot?.productPrice != null || retailPrice != null) {
          nextObservation.productPrice = retailPrice ?? stockSnapshot?.productPrice ?? null;
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
          nextObservation.adjustmentDelta = adjustment.quantityDelta;
          nextObservation.notes = adjustment.reason;
        }
        previousRetailPriceBySkuId.set(skuId, nextObservation.productPrice ?? null);
        return nextObservation;
      });

    const servicePriceAdjustments = (observation.input.servicePrices ?? [])
      .map<StockReportServicePriceAdjustment>((entry) => {
        const nextAdjustment: StockReportServicePriceAdjustment = {
          serviceId: entry.serviceId,
          price: entry.price,
        };
        const previousPrice = previousServicePriceByServiceId.get(entry.serviceId);
        if (previousPrice !== undefined) {
          nextAdjustment.previousPrice = previousPrice;
        }
        previousServicePriceByServiceId.set(entry.serviceId, entry.price);
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
      regimeHint: observation.input.regimeHint ?? null,
      notes: observation.input.notes,
    };
  });

  return reports.reverse();
}
