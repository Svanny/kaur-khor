import type { SenaObservationInput, SenaObservationRecord } from '@shared/sena';

export interface ObservationSignalCounts {
  stockSnapshot: number;
  serviceRankings: number;
  retailRankings: number;
  stockouts: number;
  orderPlaced: number;
  receiptArrived: number;
  servicePrices: number;
  retailPrices: number;
  leadTimeHints: number;
  adjustments: number;
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
    serviceRankings: [],
    retailRankings: [],
    serviceStockouts: [],
    retailStockouts: [],
    orderSignals: [],
    servicePrices: [],
    retailPrices: [],
    leadTimeHints: [],
    adjustmentSignals: [],
    recipeUsageHints: [],
    notes,
  };
}

export function observationSignalCounts(input: SenaObservationInput): ObservationSignalCounts {
  return {
    stockSnapshot: input.stockSnapshot.length,
    serviceRankings: input.serviceRankings.length,
    retailRankings: input.retailRankings.length,
    stockouts: input.serviceStockouts.length + input.retailStockouts.length,
    orderPlaced: input.orderSignals.filter((signal) => signal.orderPlaced).length,
    receiptArrived: input.orderSignals.filter((signal) => signal.receiptArrived).length,
    servicePrices: input.servicePrices.length,
    retailPrices: input.retailPrices.length,
    leadTimeHints: input.leadTimeHints.length,
    adjustments: input.adjustmentSignals?.length ?? 0,
    recipeUsageHints: input.recipeUsageHints?.length ?? 0,
    regime: input.regimeHint ? 1 : 0,
    notes: input.notes?.trim() ? 1 : 0,
  };
}

export function hasStructuredObservationSignal(input: SenaObservationInput) {
  const counts = observationSignalCounts(input);
  return (
    counts.stockSnapshot > 0 ||
    counts.serviceRankings > 0 ||
    counts.retailRankings > 0 ||
    counts.stockouts > 0 ||
    counts.orderPlaced > 0 ||
    counts.receiptArrived > 0 ||
    counts.servicePrices > 0 ||
    counts.retailPrices > 0 ||
    counts.leadTimeHints > 0 ||
    counts.adjustments > 0 ||
    counts.recipeUsageHints > 0 ||
    counts.regime > 0
  );
}

export function observationCompositionParts(input: SenaObservationInput) {
  const counts = observationSignalCounts(input);
  const parts: string[] = [];
  if (counts.stockSnapshot > 0) {
    parts.push(`${counts.stockSnapshot} counted SKU${counts.stockSnapshot === 1 ? '' : 's'}`);
  }
  if (counts.orderPlaced > 0) {
    parts.push(`${counts.orderPlaced} order${counts.orderPlaced === 1 ? '' : 's'}`);
  }
  if (counts.receiptArrived > 0) {
    parts.push(`${counts.receiptArrived} receipt${counts.receiptArrived === 1 ? '' : 's'}`);
  }
  if (counts.servicePrices > 0) {
    parts.push(`${counts.servicePrices} service price${counts.servicePrices === 1 ? '' : 's'}`);
  }
  if (counts.retailPrices > 0) {
    parts.push(`${counts.retailPrices} retail price${counts.retailPrices === 1 ? '' : 's'}`);
  }
  if (counts.serviceRankings > 0) {
    parts.push(`${counts.serviceRankings} ranked service${counts.serviceRankings === 1 ? '' : 's'}`);
  }
  if (counts.retailRankings > 0) {
    parts.push(`${counts.retailRankings} ranked retail item${counts.retailRankings === 1 ? '' : 's'}`);
  }
  if (counts.stockouts > 0) {
    parts.push(`${counts.stockouts} stockout flag${counts.stockouts === 1 ? '' : 's'}`);
  }
  if (counts.leadTimeHints > 0) {
    parts.push(`${counts.leadTimeHints} lead-time hint${counts.leadTimeHints === 1 ? '' : 's'}`);
  }
  if (counts.adjustments > 0) {
    parts.push(`${counts.adjustments} correction${counts.adjustments === 1 ? '' : 's'}`);
  }
  if (counts.regime > 0) {
    parts.push('regime');
  }
  if (counts.notes > 0) {
    parts.push('note');
  }
  return parts;
}

export function observationCompositionLabel(input: SenaObservationInput) {
  const parts = observationCompositionParts(input);
  return parts.length > 0 ? parts.join(' · ') : 'No structured signals';
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
