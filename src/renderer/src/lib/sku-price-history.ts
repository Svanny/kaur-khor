import type { StockReport } from '@shared/inventory';

type StockReportSkuObservation = StockReport['skuObservations'][number];

export function reportedSkuProductPrice(entry: StockReportSkuObservation) {
  return entry.productPrice ?? null;
}

export function previousSkuPriceObservation(
  reports: StockReport[],
  reportId: string,
  skuId: string,
) {
  const reportIndex = reports.findIndex((report) => report.reportId === reportId);
  if (reportIndex === -1) {
    return null;
  }

  for (const olderReport of reports.slice(reportIndex + 1)) {
    const observation = olderReport.skuObservations.find((entry) => entry.skuId === skuId);
    if (observation?.productPrice !== undefined && observation.productPrice !== null) {
      return observation;
    }
  }

  return null;
}

export function skuPriceBaseline(
  entry: StockReportSkuObservation,
  previousObservation: StockReportSkuObservation | null,
) {
  if (entry.previousProductPrice !== undefined) {
    return entry.previousProductPrice ?? null;
  }

  return previousObservation?.productPrice ?? null;
}
