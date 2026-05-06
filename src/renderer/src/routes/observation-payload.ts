import type { AppLanguage } from '@shared/inventory';
import type { SenaObservationInput, SenaObservationRecord } from '@shared/sena';
import { formatWholeNumber } from '@/lib/format';
import { translateUiLiteral } from '@/lib/translations';

export interface ObservationSignalCounts {
  stockSnapshot: number;
  retailSalesSnapshot: number;
  serviceSalesSnapshot: number;
  serviceRankings: number;
  retailRankings: number;
  stockouts: number;
  orderPlaced: number;
  receiptArrived: number;
  servicePrices: number;
  retailPrices: number;
  leadTimeHints: number;
  adjustments: number;
  commercialEvents: number;
  customerPending: number;
  customerCompleted: number;
  supplierPending: number;
  supplierReceipts: number;
  ticketEvents: number;
  recipeUsageHints: number;
  regime: number;
  notes: number;
}

export function createEmptyObservationInput({
  notes,
  observedAt,
}: {
  notes: string | null;
  observedAt: string;
}): SenaObservationInput {
  return {
    observedAt,
    stockSnapshot: [],
    retailSalesSnapshot: [],
    serviceSalesSnapshot: [],
    serviceRankings: [],
    retailRankings: [],
    serviceStockouts: [],
    retailStockouts: [],
    orderSignals: [],
    servicePrices: [],
    retailPrices: [],
    leadTimeHints: [],
    adjustmentSignals: [],
    commercialEvents: [],
    ticketEvents: [],
    recipeUsageHints: [],
    deliveryFee: null,
    notes,
  };
}

export function observationSignalCounts(input: SenaObservationInput): ObservationSignalCounts {
  const commercialEvents = input.commercialEvents ?? [];
  const customerPending = commercialEvents.filter((event) => event.party === 'customer' && event.stage === 'pending').length;
  const customerCompleted = commercialEvents.filter((event) => event.party === 'customer' && event.stage === 'realized').length;
  const supplierPending = commercialEvents.filter((event) => event.party === 'supplier' && event.stage === 'pending').length;
  const supplierReceipts = commercialEvents.filter((event) => event.party === 'supplier' && event.stage === 'realized').length;

  return {
    stockSnapshot: input.stockSnapshot.length,
    retailSalesSnapshot: input.retailSalesSnapshot?.length ?? 0,
    serviceSalesSnapshot: input.serviceSalesSnapshot?.length ?? 0,
    serviceRankings: input.serviceRankings.length,
    retailRankings: input.retailRankings.length,
    stockouts: input.serviceStockouts.length + input.retailStockouts.length,
    orderPlaced: input.orderSignals.filter((signal) => signal.orderPlaced).length,
    receiptArrived: input.orderSignals.filter((signal) => signal.receiptArrived).length,
    servicePrices: input.servicePrices.length,
    retailPrices: input.retailPrices.length,
    leadTimeHints: input.leadTimeHints.length,
    adjustments: input.adjustmentSignals?.length ?? 0,
    commercialEvents: commercialEvents.length,
    customerPending,
    customerCompleted,
    supplierPending,
    supplierReceipts,
    ticketEvents: input.ticketEvents?.length ?? 0,
    recipeUsageHints: input.recipeUsageHints?.length ?? 0,
    regime: input.regimeHint ? 1 : 0,
    notes: input.notes?.trim() ? 1 : 0,
  };
}

export function hasStructuredObservationSignal(input: SenaObservationInput) {
  const counts = observationSignalCounts(input);
  return (
    counts.stockSnapshot > 0 ||
    counts.retailSalesSnapshot > 0 ||
    counts.serviceSalesSnapshot > 0 ||
    counts.serviceRankings > 0 ||
    counts.retailRankings > 0 ||
    counts.stockouts > 0 ||
    counts.orderPlaced > 0 ||
    counts.receiptArrived > 0 ||
    counts.servicePrices > 0 ||
    counts.retailPrices > 0 ||
    counts.leadTimeHints > 0 ||
    counts.adjustments > 0 ||
    counts.commercialEvents > 0 ||
    counts.ticketEvents > 0 ||
    counts.recipeUsageHints > 0 ||
    counts.regime > 0
  );
}

export function observationCompositionParts(input: SenaObservationInput, language: AppLanguage = 'en') {
  const counts = observationSignalCounts(input);
  const parts: string[] = [];
  if (counts.stockSnapshot > 0) {
    parts.push(
      translateUiLiteral(language, '{count} counted SKU{suffix}', {
        count: formatWholeNumber(counts.stockSnapshot, language),
        suffix: counts.stockSnapshot === 1 ? '' : 's',
      }),
    );
  }
  if (counts.retailSalesSnapshot > 0) {
    parts.push(
      translateUiLiteral(language, '{count} retail sales count{suffix}', {
        count: formatWholeNumber(counts.retailSalesSnapshot, language),
        suffix: counts.retailSalesSnapshot === 1 ? '' : 's',
      }),
    );
  }
  if (counts.serviceSalesSnapshot > 0) {
    parts.push(
      translateUiLiteral(language, '{count} service sales count{suffix}', {
        count: formatWholeNumber(counts.serviceSalesSnapshot, language),
        suffix: counts.serviceSalesSnapshot === 1 ? '' : 's',
      }),
    );
  }
  if (counts.orderPlaced > 0) {
    parts.push(
      translateUiLiteral(language, '{count} order{suffix}', {
        count: formatWholeNumber(counts.orderPlaced, language),
        suffix: counts.orderPlaced === 1 ? '' : 's',
      }),
    );
  }
  if (counts.receiptArrived > 0) {
    parts.push(
      translateUiLiteral(language, '{count} receipt{suffix}', {
        count: formatWholeNumber(counts.receiptArrived, language),
        suffix: counts.receiptArrived === 1 ? '' : 's',
      }),
    );
  }
  if (counts.servicePrices > 0) {
    parts.push(
      translateUiLiteral(language, '{count} service price{suffix}', {
        count: formatWholeNumber(counts.servicePrices, language),
        suffix: counts.servicePrices === 1 ? '' : 's',
      }),
    );
  }
  if (counts.retailPrices > 0) {
    parts.push(
      translateUiLiteral(language, '{count} retail price{suffix}', {
        count: formatWholeNumber(counts.retailPrices, language),
        suffix: counts.retailPrices === 1 ? '' : 's',
      }),
    );
  }
  if (counts.serviceRankings > 0 && counts.serviceSalesSnapshot === 0) {
    parts.push(
      translateUiLiteral(language, '{count} ranked service{suffix}', {
        count: formatWholeNumber(counts.serviceRankings, language),
        suffix: counts.serviceRankings === 1 ? '' : 's',
      }),
    );
  }
  if (counts.retailRankings > 0 && counts.retailSalesSnapshot === 0) {
    parts.push(
      translateUiLiteral(language, '{count} ranked retail item{suffix}', {
        count: formatWholeNumber(counts.retailRankings, language),
        suffix: counts.retailRankings === 1 ? '' : 's',
      }),
    );
  }
  if (counts.stockouts > 0) {
    parts.push(
      translateUiLiteral(language, '{count} stockout flag{suffix}', {
        count: formatWholeNumber(counts.stockouts, language),
        suffix: counts.stockouts === 1 ? '' : 's',
      }),
    );
  }
  if (counts.leadTimeHints > 0) {
    parts.push(
      translateUiLiteral(language, '{count} delivery note{suffix}', {
        count: formatWholeNumber(counts.leadTimeHints, language),
        suffix: counts.leadTimeHints === 1 ? '' : 's',
      }),
    );
  }
  if (counts.adjustments > 0) {
    parts.push(
      translateUiLiteral(language, '{count} adjustment{suffix}', {
        count: formatWholeNumber(counts.adjustments, language),
        suffix: counts.adjustments === 1 ? '' : 's',
      }),
    );
  }
  if (counts.customerPending > 0) {
    parts.push(
      translateUiLiteral(language, '{count} customer pending change{suffix}', {
        count: formatWholeNumber(counts.customerPending, language),
        suffix: counts.customerPending === 1 ? '' : 's',
      }),
    );
  }
  if (counts.customerCompleted > 0) {
    parts.push(
      translateUiLiteral(language, '{count} customer completion{suffix}', {
        count: formatWholeNumber(counts.customerCompleted, language),
        suffix: counts.customerCompleted === 1 ? '' : 's',
      }),
    );
  }
  if (counts.supplierPending > 0) {
    parts.push(
      translateUiLiteral(language, '{count} supplier order change{suffix}', {
        count: formatWholeNumber(counts.supplierPending, language),
        suffix: counts.supplierPending === 1 ? '' : 's',
      }),
    );
  }
  if (counts.supplierReceipts > 0) {
    parts.push(
      translateUiLiteral(language, '{count} supplier receipt{suffix}', {
        count: formatWholeNumber(counts.supplierReceipts, language),
        suffix: counts.supplierReceipts === 1 ? '' : 's',
      }),
    );
  }
  if (counts.ticketEvents > 0) {
    parts.push(
      translateUiLiteral(language, '{count} ticket event{suffix}', {
        count: formatWholeNumber(counts.ticketEvents, language),
        suffix: counts.ticketEvents === 1 ? '' : 's',
      }),
    );
  }
  if (counts.regime > 0) {
    parts.push(translateUiLiteral(language, 'sales pattern'));
  }
  if (counts.notes > 0) {
    parts.push(translateUiLiteral(language, 'note'));
  }
  return parts;
}

export function observationCompositionLabel(input: SenaObservationInput, language: AppLanguage = 'en') {
  const parts = observationCompositionParts(input, language);
  return parts.length > 0 ? parts.join(' · ') : translateUiLiteral(language, 'No structured signals');
}

export function latestObservationAt(observations: SenaObservationRecord[]) {
  return observations
    .map((observation) => observation.input.observedAt)
    .filter(Boolean)
    .sort((left, right) => new Date(right).getTime() - new Date(left).getTime())[0] ?? null;
}

export function intervalDaysBetween(startAt: string | null, endAt: string | null) {
  if (!startAt || !endAt) {
    return null;
  }
  const start = new Date(startAt).getTime();
  const end = new Date(endAt).getTime();
  if (Number.isNaN(start) || Number.isNaN(end) || end < start) {
    return null;
  }
  return Math.max(0, Math.round((end - start) / 86_400_000));
}
