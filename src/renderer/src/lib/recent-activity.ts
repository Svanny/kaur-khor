import type { StockReport } from '@shared/inventory';

export type RecentActivityFilter = 'all' | 'stock-changes' | 'service-updates' | 'price-changes';

export function matchesRecentActivityFilter(
  report: StockReport,
  filter: RecentActivityFilter,
) {
  if (filter === 'all') {
    return true;
  }
  if (filter === 'stock-changes') {
    return report.skuObservations.length > 0;
  }
  if (filter === 'service-updates') {
    return report.serviceSignals.length > 0;
  }
  return (
    report.servicePriceAdjustments.length > 0 ||
    report.skuObservations.some((observation) => observation.productPrice != null)
  );
}
