import type { AppCurrency, AppLanguage, InventorySnapshot } from '@shared/inventory';
import type {
  SenaDiagnostics,
  SenaLeadTimeVariabilityClass,
  SenaObservationRecord,
  SenaOrderBatchRecord,
  SenaPipelinePosteriorPoint,
  SenaRegimePosteriorPoint,
  SenaServiceDetail,
  SenaSkuDetail,
  SenaWorkspaceSummary,
} from '@shared/sena';
import { DEFAULT_USD_TO_KHR_EXCHANGE_RATE } from '@shared/ipc';
import { deriveLeadTimeVariabilityClass } from '@shared/sena-lead-time';
import { buildSkuCommercialSnapshots } from '@/lib/commercial-flow';
import { translateLeadTimeVariabilityLabel } from '@/lib/localized-display';
import { getTranslation, translateUiLiteral } from '@/lib/translations';
import { latestObservationAt as latestObservationAtForRecords } from '@/routes/observation-payload';
import {
  formatSenaReorderQuantity,
  isSenaReorderQuantityIssued,
  type SenaReorderQuantityDisplay,
} from '@/lib/sena-reorder-quantity';
import { displayMoneyFromUsd } from '@/lib/format';
import { formatSenaCurrency, formatSenaDate, formatSenaDateTime, formatSenaDays, formatSenaPercent, formatSenaQuantity, formatSenaUnits } from './format';

export type SkuStatusTone = 'neutral' | 'success' | 'warning' | 'danger';

export interface SenaSkuDetailPipelineChartInterval extends SenaPipelinePosteriorPoint {
  ordersLateMean: number;
  ordersReadyToReceiveMean: number;
  ordersReceivedMean: number;
  newOrderFlag: number;
  newReceiptFlag: number;
}

export interface SenaSkuDetailViewModel {
  identity: {
    skuId: string;
    name: string;
    description: string;
    supplierName: string | null;
    soldAsProduct: boolean;
    statusLabel: string;
    statusTone: SkuStatusTone;
    topRegime: string;
    legacyFallbackAvailable: boolean;
  };
  heartbeat: {
    headlineUnits: string;
    credibleBandLabel: string;
    coverLabel: string;
    reorderLabel: string;
    pipelineLabel: string;
    receiptWindowLabel: string;
    variabilityLabel: string;
    heroSentence: string;
  };
  ribbon: Array<{ key: string; label: string; value: string }>;
  selectedInterval: {
    index: number | null;
    label: string;
  };
  lanes: {
    regimePriceLane: {
      intervals: SenaRegimePosteriorPoint[];
      priceMarkers: Array<{ observedAt: string; price: number; intervalIndex: number }>;
      summary: string;
      currentPriceLabel: string;
    };
    inventoryLane: {
      summary: string;
      points: SenaSkuDetail['inventoryPosterior'];
      reorderPoint?: number | null;
      reorderPointLabel: string;
      safetyStock?: number | null;
      safetyStockLabel: string;
    };
    flowLane: {
      summary: string;
      intervals: SenaSkuDetail['demandPosterior'];
    };
    pipelineLane: {
      summary: string;
      intervals: SenaSkuDetailPipelineChartInterval[];
    };
  };
  rail: {
    selectedIntervalSummary: {
      headline: string;
      label: string;
      dominantRegime: string;
      serviceDemand: string;
      retailDemand: string;
      receipts: string;
      adjustments: string;
      notes: string[];
    };
    actNow: {
      headline: string;
      quantityBand: string;
      rationale: [string, string, string];
    };
    openPipeline: {
      summary: string[];
      events: Array<{ key: string; observedAt: string; timestamp: string; state: string; quantity: string }>;
    };
    customerDemand: {
      summary: [string, string, string, string];
    };
    exposure: Array<{
      serviceId: string;
      serviceName: string;
      imagePath: string | null;
      usageProbability: string;
      bottleneckProbability: string;
      severity: 'limiting_now' | 'at_risk' | 'linked';
    }>;
    nextTouch: {
      dateLabel: string;
      reason: string;
    };
  };
  dependencyImpact: Array<{
    serviceId: string;
    name: string;
    imagePath: string | null;
    severity: 'limiting_now' | 'at_risk' | 'linked';
    usageProbability: string;
    bottleneckProbability: string;
  }>;
  evidence: Array<{
    id: string;
    observedAt: string;
    title: string;
    detail: string;
    type: 'stock_reported' | 'order_placed' | 'receipt_logged' | 'price_changed' | 'retail_stockout' | 'lead_time_hint' | 'customer_pending' | 'customer_completed' | 'ticket_event' | 'notes';
  }>;
  actionContext: {
    currentStock: number;
    costPerUnit: number;
    leadTimeVariability: SenaLeadTimeVariabilityClass | null;
    productPrice: number | null;
    latestObservationAt: string | null;
    supplierName?: string | null;
    soldAsProduct: boolean;
    recommendedOrderQuantity: number;
    reorderRecommendation: SenaReorderQuantityDisplay;
  };
  uiState: 'ready' | 'bootstrapping' | 'running' | 'needs_observations' | 'degraded';
}

function translate(language: AppLanguage, key: Parameters<typeof getTranslation>[1], variables?: Parameters<typeof getTranslation>[2]) {
  return getTranslation(language, key, variables);
}

function topRegime(summary: SenaSkuDetail['summary'] | null, diagnostics: SenaDiagnostics | null, language: AppLanguage) {
  const summaryWinner = summary
    ? Object.entries(summary.regimeProbabilities).sort((left, right) => right[1] - left[1])[0]?.[0]
    : null;
  return summaryWinner ?? diagnostics?.regimeHistory.at(-1)?.dominantRegime ?? translate(language, 'skuVmUnknown');
}

function receiptWindow(
  point: SenaPipelinePosteriorPoint | null,
  leadTime: SenaSkuDetail['leadTimePosterior'][number] | null,
  language: AppLanguage,
) {
  if (!point || !leadTime || point.inTransitMean <= 0.5) {
    const label = translate(language, 'skuVmNoActiveReceiptWindow');
    return { label, detailLabel: label, midpointDays: null, overdue: false };
  }
  if (point.ageDaysMean > leadTime.meanDays + leadTime.stdDays) {
    const label = translate(language, 'skuVmOverdue');
    return { label, detailLabel: label, midpointDays: 0, overdue: true };
  }
  const daysUntilEtaMidpoint = Math.max(0, leadTime.meanDays - point.ageDaysMean);
  const windowLow = Math.max(0, daysUntilEtaMidpoint - leadTime.stdDays);
  const windowHigh = daysUntilEtaMidpoint + leadTime.stdDays;
  return {
    label: translate(language, 'skuVmReceiptWindowDays', {
      low: Math.round(windowLow),
      high: Math.round(windowHigh),
    }),
    detailLabel: translate(language, 'skuVmReceiptWindowMidpoint', {
      midpoint: Math.round(daysUntilEtaMidpoint),
      spread: Math.round(leadTime.stdDays),
    }),
    midpointDays: daysUntilEtaMidpoint,
    overdue: false,
  };
}

function observedVariabilityLabel(value: SenaLeadTimeVariabilityClass | null, language: AppLanguage) {
  if (!value) {
    return translate(language, 'skuVmNoRecentVariabilitySignal');
  }
  return translate(language, 'skuVmVariability', {
    label: translateLeadTimeVariabilityLabel(language, value),
  });
}

function parseTimestamp(value: string | null | undefined) {
  if (!value) {
    return null;
  }
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : null;
}

function timestampSortValue(value: string | null | undefined, invalidFallback = Number.NEGATIVE_INFINITY) {
  return parseTimestamp(value) ?? invalidFallback;
}

function compareObservedAtAsc(leftAt: string, rightAt: string) {
  return timestampSortValue(leftAt) - timestampSortValue(rightAt) || leftAt.localeCompare(rightAt);
}

function compareObservedAtDesc(leftAt: string, rightAt: string) {
  return timestampSortValue(rightAt) - timestampSortValue(leftAt) || rightAt.localeCompare(leftAt);
}

function safeNonNegativeNumber(value: number | null | undefined, fallback = 0): number {
  return value != null && Number.isFinite(value) && value >= 0 ? value : fallback;
}

function safeOptionalNonNegativeNumber(value: number | null | undefined): number | null {
  return value != null && Number.isFinite(value) && value >= 0 ? value : null;
}

function safeProbability(value: number | null | undefined, fallback = 0): number {
  return value != null && Number.isFinite(value) && value >= 0 && value <= 1 ? value : fallback;
}

export function deriveIntervalPriceMarkers({
  intervals,
  observations,
  skuId,
}: {
  intervals: SenaRegimePosteriorPoint[];
  observations: SenaObservationRecord[];
  skuId: string;
}) {
  const retailPriceObservations = observations
    .flatMap((observation) =>
      observation.input.retailPrices
        .filter((entry) => entry.skuId === skuId)
        .map((entry) => ({
          observedAt: observation.input.observedAt,
          price: entry.price,
        }))
        .filter((entry) => Number.isFinite(entry.price) && entry.price >= 0),
    )
    .sort((left, right) => compareObservedAtAsc(left.observedAt, right.observedAt));

  return intervals.flatMap((interval) => {
    const marker = retailPriceObservations
      .filter((entry) => entry.observedAt >= interval.startAt && entry.observedAt <= interval.endAt)
      .at(-1);

    return marker
      ? [{ ...marker, intervalIndex: interval.intervalIndex }]
      : [];
  });
}

export function deriveRecommendedOrderBand(detail: SenaSkuDetail | null) {
  if (!detail) {
    return { low: 0, high: 0 };
  }
  const latestPipeline = detail.pipelinePosterior.at(-1) ?? null;
  const latestInTransit = safeNonNegativeNumber(latestPipeline?.inTransitMean);
  const reorderPoint = safeNonNegativeNumber(detail.summary.reorderPoint);
  const credibleIntervalLow = safeNonNegativeNumber(detail.summary.credibleIntervalLow);
  const credibleIntervalHigh = safeNonNegativeNumber(detail.summary.credibleIntervalHigh);
  const safetyStock = safeNonNegativeNumber(detail.summary.safetyStock);
  const lowGap = reorderPoint - credibleIntervalHigh - latestInTransit;
  const highGap = reorderPoint + safetyStock - credibleIntervalLow - latestInTransit;
  const low = Math.ceil(Math.max(0, lowGap));
  const high = Math.ceil(Math.max(low, highGap));
  return { low, high };
}

function deriveStatus(detail: SenaSkuDetail | null, language: AppLanguage) {
  const summary = detail?.summary;
  const latestPipeline = detail?.pipelinePosterior.at(-1) ?? null;
  if (!summary) {
    return { label: translate(language, 'skuVmStatusDegraded'), tone: 'neutral' as SkuStatusTone };
  }
  if (
    isSenaReorderQuantityIssued(summary.reorderQuantity) ||
    (summary.reorderQuantity == null && safeProbability(summary.reorderTriggerProbability) >= 0.5)
  ) {
    return { label: translate(language, 'skuVmStatusReorder'), tone: 'danger' as SkuStatusTone };
  }
  if (safeNonNegativeNumber(latestPipeline?.inTransitMean) > 0.5) {
    return { label: translate(language, 'skuVmStatusAwaitingReceipt'), tone: 'warning' as SkuStatusTone };
  }
  if (safeProbability(summary.stockoutRisk, 1) < 0.15) {
    return { label: translate(language, 'skuVmStatusHealthy'), tone: 'success' as SkuStatusTone };
  }
  return { label: translate(language, 'skuVmStatusWatch'), tone: 'warning' as SkuStatusTone };
}

function selectedIntervalHeadline(interval: SenaSkuDetail['demandPosterior'][number] | null, language: AppLanguage) {
  if (!interval) {
    return translate(language, 'skuVmNoIntervalSelected');
  }

  const serviceDemand = interval.serviceDemandMean ?? 0;
  const retailDemand = interval.retailDemandMean ?? 0;
  const receipts = interval.receiptsMean ?? 0;
  const adjustments = Math.abs(interval.adjustmentsMean ?? 0);
  const totalDemand = serviceDemand + retailDemand;

  if (receipts > totalDemand && receipts > 0) {
    return translate(language, 'skuVmSelectedReceiptsLed');
  }
  if (adjustments > Math.max(totalDemand, receipts)) {
    return translate(language, 'skuVmSelectedAdjustmentsLed');
  }
  if (serviceDemand > retailDemand * 1.5 && serviceDemand > 0) {
    return translate(language, 'skuVmSelectedServiceDemandLed');
  }
  if (retailDemand > serviceDemand * 1.5 && retailDemand > 0) {
    return translate(language, 'skuVmSelectedRetailDemandLed');
  }
  if (totalDemand > 0) {
    return translate(language, 'skuVmSelectedDemandMoved');
  }
  return translate(language, 'skuVmSelectedNoDemand');
}

function selectedIntervalNotes(interval: SenaSkuDetail['demandPosterior'][number] | null, language: AppLanguage) {
  if (!interval) {
    return [translate(language, 'skuVmSelectedChooseInterval')];
  }

  const notes: string[] = [];
  const receipts = interval.receiptsMean ?? 0;
  const adjustments = interval.adjustmentsMean ?? 0;
  const totalDemand = (interval.serviceDemandMean ?? 0) + (interval.retailDemandMean ?? 0);

  if (receipts > 0 || Math.abs(adjustments) > 0) {
    notes.push(
      translate(language, 'skuVmSelectedReceiptsAdjustments', {
        receipts: formatSenaQuantity(receipts, language),
        adjustments: formatSenaQuantity(adjustments, language),
      }),
    );
  } else {
    notes.push(translate(language, 'skuVmSelectedNoReceiptsAdjustments'));
  }

  if (totalDemand > 0) {
    notes.push(
      translate(language, 'skuVmSelectedTotalDemand', {
        demand: formatSenaQuantity(totalDemand, language),
      }),
    );
  }

  return notes;
}

function evidenceLineQuantity(line: { quantityDelta?: number | null; orderedQuantity?: number | null; receivedQuantity?: number | null }) {
  const quantity = line.quantityDelta ?? line.orderedQuantity ?? line.receivedQuantity ?? 0;
  return typeof quantity === 'number' && Number.isFinite(quantity) ? Math.abs(quantity) : 0;
}

export function extractEvidence(observations: SenaObservationRecord[], skuId: string, language: AppLanguage = 'en') {
  return observations
    .flatMap((observation) => {
      const rows: SenaSkuDetailViewModel['evidence'] = [];
      const observedAt = observation.input.observedAt;
      const snapshot = observation.input.stockSnapshot.find((entry) => entry.skuId === skuId);
      if (snapshot) {
        rows.push({
          id: `${observation.observationId}:stock`,
          observedAt,
          title: translate(language, 'skuVmEvidenceStockReported'),
          detail: translate(language, 'skuVmEvidenceUnits', { count: snapshot.unitsInStock }),
          type: 'stock_reported',
        });
      }
      for (const signal of observation.input.orderSignals.filter((entry) => entry.skuId === skuId)) {
        if (signal.orderPlaced) {
          rows.push({
            id: `${observation.observationId}:order`,
            observedAt,
            title: translate(language, 'skuVmEvidenceOrderPlaced'),
            detail:
              signal.approximateOrderQuantity != null
                ? translate(language, 'skuVmEvidenceUnits', { count: signal.approximateOrderQuantity })
                : translate(language, 'skuVmEvidenceOrderSignalRecorded'),
            type: 'order_placed',
          });
        }
        if (signal.receiptArrived) {
          rows.push({
            id: `${observation.observationId}:receipt`,
            observedAt,
            title: translate(language, 'skuVmEvidenceReceiptLogged'),
            detail:
              signal.approximateReceiptQuantity != null
                ? translate(language, 'skuVmEvidenceUnits', { count: signal.approximateReceiptQuantity })
                : translate(language, 'skuVmEvidenceReceiptSignalRecorded'),
            type: 'receipt_logged',
          });
        }
      }
      for (const price of observation.input.retailPrices.filter((entry) => entry.skuId === skuId)) {
        rows.push({
          id: `${observation.observationId}:price:${price.price}`,
          observedAt,
          title: translate(language, 'skuVmEvidencePriceChanged'),
          detail: `${price.price}`,
          type: 'price_changed',
        });
      }
      if (observation.input.retailStockouts.includes(skuId)) {
        rows.push({
          id: `${observation.observationId}:stockout`,
          observedAt,
          title: translate(language, 'skuVmEvidenceRetailStockout'),
          detail: translate(language, 'skuVmEvidenceRetailStockoutDetail'),
          type: 'retail_stockout',
        });
      }
      const leadTimeHint = observation.input.leadTimeHints.find((entry) => entry.skuId === skuId);
      if (leadTimeHint) {
        const variabilityClass = deriveLeadTimeVariabilityClass({
          lowDays: leadTimeHint.lowDays,
          highDays: leadTimeHint.highDays,
          variabilityClass: leadTimeHint.variabilityClass,
        });
        const summaryParts = [
          leadTimeHint.typicalDays != null
            ? translate(language, 'skuVmEvidenceLeadTimeTypical', { days: leadTimeHint.typicalDays })
            : null,
          leadTimeHint.lowDays != null && leadTimeHint.highDays != null
            ? translate(language, 'skuVmEvidenceLeadTimeRange', {
                low: leadTimeHint.lowDays,
                high: leadTimeHint.highDays,
              })
            : null,
          variabilityClass
            ? translate(language, 'skuVmVariability', {
                label: translateLeadTimeVariabilityLabel(language, variabilityClass),
              })
            : null,
        ].filter((value): value is string => value != null);
        rows.push({
          id: `${observation.observationId}:lead-time`,
          observedAt,
          title: translate(language, 'skuVmEvidenceLeadTimeHint'),
          detail: summaryParts.join(' · ') || translate(language, 'skuVmEvidenceLeadTimeCaptured'),
          type: 'lead_time_hint',
        });
      }
      for (const event of observation.input.commercialEvents?.filter((entry) => entry.entityType === 'sku' && entry.entityId === skuId) ?? []) {
        rows.push({
          id: `${observation.observationId}:commercial:${event.party}:${event.stage}:${event.quantityDelta}`,
          observedAt,
          title:
            event.party === 'customer'
              ? event.stage === 'pending'
                ? translateUiLiteral(language, 'Customer order updated')
                : translateUiLiteral(language, 'Customer order completed')
              : event.stage === 'pending'
                ? translateUiLiteral(language, 'Supplier order updated')
                : translateUiLiteral(language, 'Supplier receipt updated'),
          detail: translateUiLiteral(language, '{count} units · {reason}', {
            count: Number.isFinite(event.quantityDelta) ? Math.abs(event.quantityDelta) : 0,
            reason: event.reason ?? event.flow,
          }),
          type: event.party === 'customer' && event.stage === 'pending' ? 'customer_pending' : 'customer_completed',
        });
      }
      for (const event of observation.input.ticketEvents?.filter((entry) =>
        entry.lines.some((line) => line.entityType === 'sku' && line.entityId === skuId),
      ) ?? []) {
        const matchedQuantity = event.lines
          .filter((line) => line.entityType === 'sku' && line.entityId === skuId)
          .reduce((total, line) => total + evidenceLineQuantity(line), 0);
        const title = (() => {
          switch (event.eventType) {
            case 'fulfilled_immediate':
              return translateUiLiteral(language, 'Immediate sale');
            case 'partial_received':
              return translateUiLiteral(language, 'Partial receipt');
            case 'fully_received':
              return translateUiLiteral(language, 'Full receipt');
            case 'eta_updated':
              return translateUiLiteral(language, 'ETA changed');
            case 'canceled':
              return translateUiLiteral(language, 'Ticket canceled');
            case 'created':
              return event.ticketFamily === 'customer'
                ? translateUiLiteral(language, 'Customer order created')
                : event.ticketFamily === 'supplier'
                  ? translateUiLiteral(language, 'Supplier order placed')
                  : translateUiLiteral(language, 'Adjustment created');
            default:
              return event.ticketFamily === 'customer'
                ? translateUiLiteral(language, 'Customer ticket updated')
                : event.ticketFamily === 'supplier'
                  ? translateUiLiteral(language, 'Supplier ticket updated')
                  : translateUiLiteral(language, 'Adjustment updated');
          }
        })();
        rows.push({
          id: `${observation.observationId}:ticket:${event.ticketId}:${event.eventType}:${event.revision}`,
          observedAt,
          title,
          detail: translateUiLiteral(language, '{count} units · {reason}', {
            count: matchedQuantity,
            reason: event.note?.trim() || event.stage,
          }),
          type: 'ticket_event',
        });
      }
      if (observation.input.notes?.trim()) {
        rows.push({
          id: `${observation.observationId}:notes`,
          observedAt,
          title: translate(language, 'skuVmEvidenceNotes'),
          detail: observation.input.notes.trim(),
          type: 'notes',
        });
      }
      return rows;
    })
    .sort((left, right) => compareObservedAtDesc(left.observedAt, right.observedAt));
}

function extractSkuEvidence(
  observations: SenaObservationRecord[],
  skuId: string,
  soldAsProduct: boolean,
  language: AppLanguage,
) {
  return extractEvidence(observations, skuId, language).filter((entry) => soldAsProduct || entry.type !== 'price_changed');
}

function addDaysToTimestampIso(timestamp: number | null, days: number | null) {
  if (timestamp == null || days == null || !Number.isFinite(days)) {
    return null;
  }
  const nextTime = timestamp + days * 24 * 60 * 60 * 1000;
  return Number.isFinite(nextTime) ? new Date(nextTime).toISOString() : null;
}

function intervalIndexForTimestamp(
  timestamp: number | null,
  intervals: Array<{ intervalIndex: number; startAt: string; endAt: string }>,
) {
  if (timestamp == null) {
    return null;
  }
  const exact = intervals.find((interval) => {
    const start = parseTimestamp(interval.startAt);
    const end = parseTimestamp(interval.endAt);
    if (start == null || end == null) {
      return false;
    }
    return timestamp >= start && timestamp <= end;
  });
  if (exact) {
    return exact.intervalIndex;
  }
  const nearestFuture = intervals.find((interval) => {
    const end = parseTimestamp(interval.endAt);
    return end != null && timestamp <= end;
  });
  return nearestFuture?.intervalIndex ?? intervals.at(-1)?.intervalIndex ?? null;
}

function buildPipelineChartIntervals({
  detail,
  observations,
  orderBatches,
  skuId,
}: {
  detail: SenaSkuDetail | null;
  observations: SenaObservationRecord[];
  orderBatches: SenaOrderBatchRecord[];
  skuId: string;
}) {
  const flowIntervals = detail?.demandPosterior ?? [];
  const pipelineIntervals = detail?.pipelinePosterior ?? [];
  const latestObservationTimestamp = parseTimestamp(latestObservationAtForRecords(observations)) ?? Date.now();
  const byInterval = new Map<number, SenaSkuDetailPipelineChartInterval>();

  for (const interval of pipelineIntervals) {
    byInterval.set(interval.intervalIndex, {
      ...interval,
      inTransitMean: safeNonNegativeNumber(interval.inTransitMean),
      orderProbability: safeProbability(interval.orderProbability),
      orderQuantityMean: safeNonNegativeNumber(interval.orderQuantityMean),
      receiptQuantityMean: safeNonNegativeNumber(interval.receiptQuantityMean),
      ageDaysMean: safeNonNegativeNumber(interval.ageDaysMean),
      ordersLateMean: 0,
      ordersReadyToReceiveMean: 0,
      ordersReceivedMean: safeNonNegativeNumber(interval.receiptQuantityMean),
      newOrderFlag: 0,
      newReceiptFlag: 0,
    });
  }

  const ensureInterval = (intervalIndex: number) => {
    const current = byInterval.get(intervalIndex);
    if (current) {
      return current;
    }
    const fallback = pipelineIntervals.find((entry) => entry.intervalIndex === intervalIndex);
    const next: SenaSkuDetailPipelineChartInterval = {
      intervalIndex,
      inTransitMean: safeNonNegativeNumber(fallback?.inTransitMean),
      orderProbability: safeProbability(fallback?.orderProbability),
      orderQuantityMean: safeNonNegativeNumber(fallback?.orderQuantityMean),
      receiptQuantityMean: safeNonNegativeNumber(fallback?.receiptQuantityMean),
      ageDaysMean: safeNonNegativeNumber(fallback?.ageDaysMean),
      ordersLateMean: 0,
      ordersReadyToReceiveMean: 0,
      ordersReceivedMean: safeNonNegativeNumber(fallback?.receiptQuantityMean),
      newOrderFlag: 0,
      newReceiptFlag: 0,
    };
    byInterval.set(intervalIndex, next);
    return next;
  };

  for (const observation of observations) {
    for (const signal of observation.input.orderSignals.filter((entry) => entry.skuId === skuId)) {
      if (signal.orderPlaced) {
        const intervalIndex = intervalIndexForTimestamp(
          parseTimestamp(signal.placementTimestamp ?? observation.input.observedAt),
          flowIntervals,
        );
        if (intervalIndex != null) {
          ensureInterval(intervalIndex).newOrderFlag = 1;
        }
      }
      if (signal.receiptArrived) {
        const intervalIndex = intervalIndexForTimestamp(
          parseTimestamp(signal.receiptTimestamp ?? observation.input.observedAt),
          flowIntervals,
        );
        if (intervalIndex != null) {
          ensureInterval(intervalIndex).newReceiptFlag = 1;
        }
      }
    }
  }

  for (const batch of orderBatches) {
    for (const child of (batch.children ?? []).filter((entry) => entry.skuId === skuId)) {
      if (child.status === 'received' || child.status === 'reviewed') {
        continue;
      }
      const orderedQuantity = safeNonNegativeNumber(child.effective.orderedQuantity);
      const receivedQuantity = safeNonNegativeNumber(child.effective.receivedQuantity);
      const outstandingQuantity = Math.max(0, orderedQuantity - receivedQuantity);
      if (outstandingQuantity <= 0) {
        continue;
      }
      const etaTimestamp = parseTimestamp(child.effective.expectedArrivalAt);
      const intervalIndex = intervalIndexForTimestamp(etaTimestamp ?? latestObservationTimestamp, flowIntervals);
      if (intervalIndex == null) {
        continue;
      }
      const interval = ensureInterval(intervalIndex);
      if (child.status === 'awaiting_receipt') {
        interval.ordersReadyToReceiveMean += outstandingQuantity;
        continue;
      }
      const isLate = etaTimestamp != null && etaTimestamp < latestObservationTimestamp;
      if (child.status === 'follow_up' || isLate) {
        interval.ordersLateMean += outstandingQuantity;
      }
    }
  }

  return [...byInterval.values()].sort((left, right) => left.intervalIndex - right.intervalIndex);
}

export function deriveSenaSkuDetailViewModel({
  currency,
  usdToKhrExchangeRate = DEFAULT_USD_TO_KHR_EXCHANGE_RATE,
  diagnostics,
  observations,
  linkedServiceDetails,
  orderBatches = [],
  selectedIntervalIndex,
  skuId,
  supplierName = null,
  snapshot,
  detail,
  uiState,
  workspaceSummary,
  language,
}: {
  currency: AppCurrency;
  usdToKhrExchangeRate?: number;
  diagnostics: SenaDiagnostics | null;
  observations: SenaObservationRecord[];
  linkedServiceDetails: SenaServiceDetail[];
  orderBatches?: SenaOrderBatchRecord[];
  selectedIntervalIndex: number | null;
  skuId: string;
  supplierName?: string | null;
  snapshot: InventorySnapshot;
  detail: SenaSkuDetail | null;
  uiState: SenaSkuDetailViewModel['uiState'];
  workspaceSummary: SenaWorkspaceSummary | null;
  language: AppLanguage;
}): SenaSkuDetailViewModel {
  const sku = snapshot.skus.find((entry) => entry.skuId === skuId);
  if (!sku) {
    throw new Error(`Unknown sku ${skuId}`);
  }

  const summary = detail?.summary ?? null;
  const latestPipeline = detail?.pipelinePosterior.at(-1) ?? null;
  const latestLeadTime = detail?.leadTimePosterior.at(-1) ?? null;
  const latestVariabilityClass = latestLeadTime?.observedVariabilityClass ?? null;
  const latestObservationAt = latestObservationAtForRecords(observations);
  const currentStock = safeNonNegativeNumber(summary?.latestPosteriorUnits, safeNonNegativeNumber(sku.unitsInStock));
  const status = deriveStatus(detail, language);
  const receipt = receiptWindow(latestPipeline, latestLeadTime, language);
  const orderBand = deriveRecommendedOrderBand(detail);
  const latestObservationTime = parseTimestamp(latestObservationAt);
  const latestObservationIso = latestObservationTime == null ? null : new Date(latestObservationTime).toISOString();
  const reorderRecommendation = formatSenaReorderQuantity(
    summary?.reorderQuantity,
    language,
    orderBand.high,
  );
  const pendingOrderBatches = orderBatches.filter((batch) =>
    (batch.children ?? []).some((child) => child.skuId === skuId && child.status !== 'reviewed'),
  );
  const pendingBatchCount = pendingOrderBatches.length;
  const visibleIntervalIndices = new Set((detail?.demandPosterior ?? []).map((entry) => entry.intervalIndex));
  const visibleRegimeHistory =
    diagnostics?.regimeHistory.filter((entry) => visibleIntervalIndices.size === 0 || visibleIntervalIndices.has(entry.intervalIndex)) ?? [];
  const effectiveSelectedIndex =
    selectedIntervalIndex ?? detail?.demandPosterior.at(-1)?.intervalIndex ?? diagnostics?.regimeHistory.at(-1)?.intervalIndex ?? null;
  const interval =
    detail?.demandPosterior.find((entry) => entry.intervalIndex === effectiveSelectedIndex) ?? null;
  const intervalRegime =
    visibleRegimeHistory.find((entry) => entry.intervalIndex === effectiveSelectedIndex) ?? null;
  const intervalPipeline =
    detail?.pipelinePosterior.find((entry) => entry.intervalIndex === effectiveSelectedIndex) ?? null;

  const actNowHeadline =
    observations.length < 2
      ? translate(language, 'skuVmActCaptureMore')
      : reorderRecommendation.recommendationIssued
        ? translate(language, 'skuVmActReorderNow')
        : (latestPipeline?.inTransitMean ?? 0) > 0.5
          ? translate(language, 'skuVmActAwaitIncoming')
          : translate(language, 'skuVmActMonitor');

  let nextTouchDate = latestObservationIso ?? new Date().toISOString();
  let nextTouchReason = translate(language, 'skuVmNextTouchMonitor');
  if (observations.length < 2) {
    nextTouchDate = new Date().toISOString();
    nextTouchReason = translate(language, 'skuVmNextTouchCaptureSecond');
  } else if (safeProbability(summary?.reorderTriggerProbability) >= 0.5) {
    nextTouchDate = new Date().toISOString();
    nextTouchReason = translate(language, 'skuVmNextTouchThresholdCrossed');
  } else if (receipt.midpointDays != null && latestObservationTime != null) {
    nextTouchDate = addDaysToTimestampIso(latestObservationTime, receipt.midpointDays) ?? nextTouchDate;
    nextTouchReason = receipt.overdue
      ? translate(language, 'skuVmNextTouchReceiptOverdue')
      : translate(language, 'skuVmNextTouchExpectedReceipt');
  } else if (latestObservationTime != null && Date.now() - latestObservationTime > 7 * 24 * 60 * 60 * 1000) {
    nextTouchDate = new Date().toISOString();
    nextTouchReason = translate(language, 'skuVmNextTouchObservationStale');
  } else if (latestObservationTime != null) {
    const days = Math.max(1, Math.min(7, Math.ceil(((summary?.daysOfCover ?? 4) as number) / 2)));
    nextTouchDate = addDaysToTimestampIso(latestObservationTime, days) ?? nextTouchDate;
    nextTouchReason = translate(language, 'skuVmNextTouchRoutineCheck');
  }

  const dependencyImpact = snapshot.services
    .filter((service) => service.skuIds.includes(skuId))
    .map((service) => {
      const detailEntry = linkedServiceDetails.find((entry) => entry.serviceId === service.serviceId);
      const usageProbability = null;
      const bottleneck = safeProbability(detailEntry?.bottleneckProbability);
      const severity: 'limiting_now' | 'at_risk' | 'linked' =
        bottleneck >= 0.6 ? 'limiting_now' : bottleneck >= 0.3 ? 'at_risk' : 'linked';
      return {
        serviceId: service.serviceId,
        name: service.name,
        imagePath: 'imagePath' in service && typeof service.imagePath === 'string' ? service.imagePath.trim() || null : null,
        severity,
        usageProbability: usageProbability == null ? '—' : formatSenaPercent(usageProbability, language),
        bottleneckProbability: formatSenaPercent(bottleneck, language),
      };
    })
    .sort((left, right) => {
      const rank = { limiting_now: 0, at_risk: 1, linked: 2 } as const;
      return rank[left.severity] - rank[right.severity] || left.name.localeCompare(right.name);
    });

  const pipelineEvents = observations
    .flatMap((observation) =>
      observation.input.orderSignals
        .filter((entry) => entry.skuId === skuId && (entry.orderPlaced || entry.receiptArrived))
        .map((entry, index) => ({
          key: `${observation.observationId}:${index}`,
          observedAt: observation.input.observedAt,
          timestamp: formatSenaDateTime(observation.input.observedAt, language),
          state: entry.receiptArrived
            ? translate(language, 'skuVmPipelineEventReceived')
            : translate(language, 'skuVmPipelineEventPlaced'),
          quantity:
            entry.approximateReceiptQuantity != null
              ? formatSenaUnits(entry.approximateReceiptQuantity, language)
              : entry.approximateOrderQuantity != null
                ? formatSenaUnits(entry.approximateOrderQuantity, language)
                : '—',
        })),
    )
    .sort((left, right) => compareObservedAtDesc(left.observedAt, right.observedAt))
    .slice(0, 5);
  const pipelineChartIntervals = buildPipelineChartIntervals({
    detail,
    observations,
    orderBatches,
    skuId,
  });

  const currentPrice = observations
    .flatMap((observation) =>
      observation.input.retailPrices
        .filter((entry) => entry.skuId === skuId)
        .map((entry) => ({
          observedAt: observation.input.observedAt,
          price: entry.price,
        }))
        .filter((entry) => Number.isFinite(entry.price) && entry.price >= 0),
    )
    .sort((left, right) => compareObservedAtDesc(left.observedAt, right.observedAt))[0]?.price ?? safeOptionalNonNegativeNumber(sku.productPrice);
  const intervalPriceMarkers = sku.soldAsProduct
    ? deriveIntervalPriceMarkers({
        intervals: visibleRegimeHistory,
        observations,
        skuId,
      }).map((marker) => ({
        ...marker,
        price: displayMoneyFromUsd(marker.price, currency, usdToKhrExchangeRate),
      }))
    : [];

  const receiptLabel =
    receipt.midpointDays != null && latestObservationTime != null
      ? `${formatSenaDate(addDaysToTimestampIso(latestObservationTime, receipt.midpointDays) ?? latestObservationIso, language)} · ${observedVariabilityLabel(latestVariabilityClass, language)}`
      : receipt.label;
  const openOrderCountLabel = translate(
    language,
    pendingBatchCount === 1 ? 'skuVmOpenOrderSingular' : 'skuVmOpenOrderPlural',
    { count: pendingBatchCount },
  );
  const customerCommercial = buildSkuCommercialSnapshots({ observations, rangeDays: 30 }).get(skuId) ?? null;

  return {
    identity: {
      skuId: sku.skuId,
      name: sku.name,
      description: sku.description,
      supplierName,
      soldAsProduct: sku.soldAsProduct,
      statusLabel: status.label,
      statusTone: status.tone,
      topRegime: topRegime(summary, diagnostics, language),
      legacyFallbackAvailable: true,
    },
    heartbeat: {
      headlineUnits: translate(language, 'skuVmHeadlineUnits', {
        units: formatSenaUnits(currentStock, language),
      }),
      credibleBandLabel: `${formatSenaUnits(safeNonNegativeNumber(summary?.credibleIntervalLow, currentStock), language)}-${formatSenaUnits(safeNonNegativeNumber(summary?.credibleIntervalHigh, currentStock), language)}`,
      coverLabel: summary?.daysOfCover != null ? formatSenaDays(summary.daysOfCover, language) : '—',
      reorderLabel: formatSenaPercent(summary?.reorderTriggerProbability ?? null, language),
      pipelineLabel: openOrderCountLabel,
      receiptWindowLabel: receiptLabel,
      variabilityLabel: observedVariabilityLabel(latestVariabilityClass, language),
      heroSentence: translate(language, 'skuVmHeroSentence', {
        low: formatSenaUnits(safeNonNegativeNumber(summary?.credibleIntervalLow, currentStock), language),
        high: formatSenaUnits(safeNonNegativeNumber(summary?.credibleIntervalHigh, currentStock), language),
        cover: summary?.daysOfCover != null ? formatSenaDays(summary.daysOfCover, language) : '—',
        reorder: formatSenaPercent(summary?.reorderTriggerProbability ?? null, language),
        openOrders: openOrderCountLabel,
        variability: observedVariabilityLabel(latestVariabilityClass, language).toLowerCase(),
        receipt: receiptLabel,
      }),
    },
    ribbon: [
      { key: 'onHand', label: translate(language, 'skuVmRibbonOnHand'), value: formatSenaUnits(currentStock, language) },
      { key: 'inTransit', label: translate(language, 'skuVmRibbonOnTheWay'), value: formatSenaUnits(latestPipeline?.inTransitMean ?? 0, language) },
      { key: 'demandPerDay', label: translate(language, 'skuVmRibbonDemandPerDay'), value: formatSenaQuantity(summary?.demandPerDayMean ?? null, language) },
      { key: 'nextReceipt', label: translate(language, 'skuVmRibbonNextDelivery'), value: receiptLabel },
      { key: 'serviceExposure', label: translate(language, 'skuVmRibbonServiceImpact'), value: `${dependencyImpact.length}` },
      { key: 'customerPending', label: translateUiLiteral(language, 'Customer pending'), value: formatSenaUnits(customerCommercial?.pendingQuantity ?? 0, language) },
      { key: 'customerCompleted', label: translateUiLiteral(language, 'Customer completed'), value: formatSenaUnits(customerCommercial?.realizedWindowQuantity ?? 0, language) },
    ].concat(
      sku.soldAsProduct
        ? [{ key: 'priceNow', label: translate(language, 'skuVmRibbonPriceNow'), value: formatSenaCurrency(currentPrice, currency, language, usdToKhrExchangeRate) }]
        : [],
    ),
    selectedInterval: {
      index: effectiveSelectedIndex,
      label: interval
        ? `${formatSenaDate(interval.startAt, language)}-${formatSenaDate(interval.endAt, language)}`
        : translate(language, 'skuVmLatestInterval'),
    },
    lanes: {
      regimePriceLane: {
        intervals: visibleRegimeHistory,
        priceMarkers: intervalPriceMarkers,
        summary: translate(language, 'skuVmLaneRegimeSummary', {
          intervals: visibleRegimeHistory.length,
          markers: intervalPriceMarkers.length,
        }),
        currentPriceLabel: formatSenaCurrency(currentPrice, currency, language, usdToKhrExchangeRate),
      },
      inventoryLane: {
        summary: translate(language, 'skuVmLaneInventorySummary', {
          inventory: formatSenaUnits(currentStock, language),
          reorderPoint: formatSenaUnits(summary?.reorderPoint ?? null, language),
          safetyStock: formatSenaUnits(summary?.safetyStock ?? null, language),
        }),
        points: detail?.inventoryPosterior ?? [],
        reorderPoint: summary?.reorderPoint ?? null,
        reorderPointLabel: formatSenaUnits(summary?.reorderPoint ?? null, language),
        safetyStock: summary?.safetyStock ?? null,
        safetyStockLabel: formatSenaUnits(summary?.safetyStock ?? null, language),
      },
      flowLane: {
        summary: translate(language, 'skuVmLaneFlowSummary', {
          count: (detail?.demandPosterior ?? []).length,
        }),
        intervals: detail?.demandPosterior ?? [],
      },
      pipelineLane: {
        summary: translate(language, 'skuVmLanePipelineSummary', {
          count: pipelineChartIntervals.length,
        }),
        intervals: pipelineChartIntervals,
      },
    },
    rail: {
      selectedIntervalSummary: {
        headline: selectedIntervalHeadline(interval, language),
        label: interval
          ? `${formatSenaDate(interval.startAt, language)}-${formatSenaDate(interval.endAt, language)}`
          : translate(language, 'skuVmNoIntervalSelected'),
        dominantRegime: intervalRegime?.dominantRegime ?? '—',
        serviceDemand: formatSenaQuantity(interval?.serviceDemandMean ?? null, language),
        retailDemand: formatSenaQuantity(interval?.retailDemandMean ?? null, language),
        receipts: formatSenaQuantity(interval?.receiptsMean ?? null, language),
        adjustments: formatSenaQuantity(interval?.adjustmentsMean ?? null, language),
        notes: selectedIntervalNotes(interval, language),
      },
      actNow: {
        headline: actNowHeadline,
        quantityBand: reorderRecommendation.recommendedOrderLabel,
        rationale: [
          reorderRecommendation.likelyRangeLabel,
          reorderRecommendation.needProbabilityLabel,
          translate(language, 'skuVmActWhy', {
            cover: summary?.daysOfCover != null ? formatSenaDays(summary.daysOfCover, language) : '—',
            inTransit: formatSenaUnits(latestPipeline?.inTransitMean ?? 0, language),
          }),
        ],
      },
      openPipeline: {
        summary: [
          translate(language, 'skuVmOpenPipelineOnTheWay', {
            units: formatSenaUnits(intervalPipeline?.inTransitMean ?? latestPipeline?.inTransitMean ?? 0, language),
          }),
          translate(language, 'skuVmOpenPipelineOrderProbability', {
            probability: formatSenaPercent(intervalPipeline?.orderProbability ?? latestPipeline?.orderProbability ?? 0, language),
          }),
          translate(language, 'skuVmOpenOrderPlural', { count: pendingBatchCount }),
          translate(language, 'skuVmOpenPipelineAge', {
            age: formatSenaDays(intervalPipeline?.ageDaysMean ?? latestPipeline?.ageDaysMean ?? null, language),
          }),
          observedVariabilityLabel(latestVariabilityClass, language),
          translate(language, 'skuVmOpenPipelineReceipt', { receipt: receiptLabel }),
        ],
        events: pipelineEvents,
      },
      customerDemand: {
        summary: [
          translateUiLiteral(language, 'Open customer orders {count}', {
            count: formatSenaUnits(customerCommercial?.pendingQuantity ?? 0, language),
          }),
          translateUiLiteral(language, 'Completed in window {count}', {
            count: formatSenaUnits(customerCommercial?.realizedWindowQuantity ?? 0, language),
          }),
          translateUiLiteral(language, 'Blocked commitments {count}', {
            count: formatSenaUnits(customerCommercial?.blockedPendingQuantity ?? 0, language),
          }),
          translateUiLiteral(language, 'Refund / reversal pressure {count}', {
            count: formatSenaUnits(customerCommercial?.reversalWindowQuantity ?? 0, language),
          }),
        ],
      },
      exposure: dependencyImpact.map((entry) => ({
        serviceId: entry.serviceId,
        serviceName: entry.name,
        imagePath: entry.imagePath,
        usageProbability: entry.usageProbability,
        bottleneckProbability: entry.bottleneckProbability,
        severity: entry.severity,
      })),
      nextTouch: {
        dateLabel: formatSenaDate(nextTouchDate, language),
        reason: nextTouchReason,
      },
    },
    dependencyImpact,
    evidence: extractSkuEvidence(observations, skuId, sku.soldAsProduct, language),
    actionContext: {
      currentStock: currentStock ?? 0,
      costPerUnit: safeNonNegativeNumber(sku.costPerUnit),
      leadTimeVariability: latestVariabilityClass,
      productPrice: safeOptionalNonNegativeNumber(sku.productPrice),
      latestObservationAt,
      supplierName,
      soldAsProduct: sku.soldAsProduct,
      recommendedOrderQuantity: reorderRecommendation.recommendedUnits,
      reorderRecommendation,
    },
    uiState,
  };
}
