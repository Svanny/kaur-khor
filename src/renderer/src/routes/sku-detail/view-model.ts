import type { AppCurrency, AppLanguage, InventorySnapshot } from '@shared/inventory';
import type {
  SenaDiagnostics,
  SenaLeadTimeVariabilityClass,
  SenaObservationRecord,
  SenaPipelinePosteriorPoint,
  SenaRegimePosteriorPoint,
  SenaServiceDetail,
  SenaSkuDetail,
  SenaWorkspaceSummary,
} from '@shared/sena';
import { DEFAULT_USD_TO_KHR_EXCHANGE_RATE } from '@shared/ipc';
import { deriveLeadTimeVariabilityClass, leadTimeVariabilityLabel } from '@shared/sena-lead-time';
import { getTranslation } from '@/lib/translations';
import {
  formatSenaReorderQuantity,
  isSenaReorderQuantityIssued,
  type SenaReorderQuantityDisplay,
} from '@/lib/sena-reorder-quantity';
import { displayMoneyFromUsd } from '@/lib/format';
import { formatSenaCurrency, formatSenaDate, formatSenaDateTime, formatSenaDays, formatSenaPercent, formatSenaQuantity, formatSenaUnits } from './format';

export type SkuStatusTone = 'neutral' | 'success' | 'warning' | 'danger';

export interface SenaSkuDetailViewModel {
  identity: {
    skuId: string;
    name: string;
    description: string;
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
      reorderPointLabel: string;
      safetyStockLabel: string;
    };
    flowLane: {
      summary: string;
      intervals: SenaSkuDetail['demandPosterior'];
    };
    pipelineLane: {
      summary: string;
      intervals: SenaSkuDetail['pipelinePosterior'];
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
      summary: [string, string, string, string];
      events: Array<{ key: string; observedAt: string; timestamp: string; state: string; quantity: string }>;
    };
    exposure: Array<{
      serviceId: string;
      serviceName: string;
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
    severity: 'limiting_now' | 'at_risk' | 'linked';
    usageProbability: string;
    bottleneckProbability: string;
  }>;
  evidence: Array<{
    id: string;
    observedAt: string;
    title: string;
    detail: string;
    type: 'stock_reported' | 'order_placed' | 'receipt_logged' | 'price_changed' | 'retail_stockout' | 'lead_time_hint' | 'notes';
  }>;
  actionContext: {
    currentStock: number;
    costPerUnit: number;
    leadTimeVariability: SenaLeadTimeVariabilityClass | null;
    productPrice: number | null;
    latestObservationAt: string | null;
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
    label: leadTimeVariabilityLabel(value),
  });
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
        })),
    )
    .sort((left, right) => left.observedAt.localeCompare(right.observedAt));

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
  const latestInTransit = latestPipeline?.inTransitMean ?? 0;
  const lowGap = detail.summary.reorderPoint - detail.summary.credibleIntervalHigh - latestInTransit;
  const highGap = detail.summary.reorderPoint + detail.summary.safetyStock - detail.summary.credibleIntervalLow - latestInTransit;
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
    (summary.reorderQuantity == null && summary.reorderTriggerProbability >= 0.5)
  ) {
    return { label: translate(language, 'skuVmStatusReorder'), tone: 'danger' as SkuStatusTone };
  }
  if ((latestPipeline?.inTransitMean ?? 0) > 0.5) {
    return { label: translate(language, 'skuVmStatusAwaitingReceipt'), tone: 'warning' as SkuStatusTone };
  }
  if (summary.stockoutRisk < 0.15) {
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
                label: leadTimeVariabilityLabel(variabilityClass),
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
    .sort((left, right) => right.observedAt.localeCompare(left.observedAt));
}

function extractSkuEvidence(
  observations: SenaObservationRecord[],
  skuId: string,
  soldAsProduct: boolean,
  language: AppLanguage,
) {
  return extractEvidence(observations, skuId, language).filter((entry) => soldAsProduct || entry.type !== 'price_changed');
}

export function deriveSenaSkuDetailViewModel({
  currency,
  usdToKhrExchangeRate = DEFAULT_USD_TO_KHR_EXCHANGE_RATE,
  diagnostics,
  observations,
  linkedServiceDetails,
  selectedIntervalIndex,
  skuId,
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
  selectedIntervalIndex: number | null;
  skuId: string;
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
  const latestObservationAt = observations.at(-1)?.input.observedAt ?? null;
  const currentStock = summary?.latestPosteriorUnits ?? sku.unitsInStock;
  const status = deriveStatus(detail, language);
  const receipt = receiptWindow(latestPipeline, latestLeadTime, language);
  const orderBand = deriveRecommendedOrderBand(detail);
  const reorderRecommendation = formatSenaReorderQuantity(
    summary?.reorderQuantity,
    language,
    orderBand.high,
  );
  const openPipelineCount = (latestPipeline?.inTransitMean ?? 0) > 0.5 ? 1 : 0;
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

  let nextTouchDate = latestObservationAt;
  let nextTouchReason = translate(language, 'skuVmNextTouchMonitor');
  if (observations.length < 2) {
    nextTouchDate = new Date().toISOString();
    nextTouchReason = translate(language, 'skuVmNextTouchCaptureSecond');
  } else if ((summary?.reorderTriggerProbability ?? 0) >= 0.5) {
    nextTouchDate = new Date().toISOString();
    nextTouchReason = translate(language, 'skuVmNextTouchThresholdCrossed');
  } else if (receipt.midpointDays != null && latestObservationAt) {
    nextTouchDate = new Date(Date.parse(latestObservationAt) + receipt.midpointDays * 24 * 60 * 60 * 1000).toISOString();
    nextTouchReason = receipt.overdue
      ? translate(language, 'skuVmNextTouchReceiptOverdue')
      : translate(language, 'skuVmNextTouchExpectedReceipt');
  } else if (latestObservationAt && Date.now() - Date.parse(latestObservationAt) > 7 * 24 * 60 * 60 * 1000) {
    nextTouchDate = new Date().toISOString();
    nextTouchReason = translate(language, 'skuVmNextTouchObservationStale');
  } else if (latestObservationAt) {
    const days = Math.max(1, Math.min(7, Math.ceil(((summary?.daysOfCover ?? 4) as number) / 2)));
    nextTouchDate = new Date(Date.parse(latestObservationAt) + days * 24 * 60 * 60 * 1000).toISOString();
    nextTouchReason = translate(language, 'skuVmNextTouchRoutineCheck');
  }

  const dependencyImpact = snapshot.services
    .filter((service) => service.skuIds.includes(skuId))
    .map((service) => {
      const detailEntry = linkedServiceDetails.find((entry) => entry.serviceId === service.serviceId);
      const usageProbability = null;
      const bottleneck = detailEntry?.bottleneckProbability ?? 0;
      const severity =
        bottleneck >= 0.6 ? 'limiting_now' : bottleneck >= 0.3 ? 'at_risk' : 'linked';
      return {
        serviceId: service.serviceId,
        name: service.name,
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
    .sort((left, right) => right.observedAt.localeCompare(left.observedAt))
    .slice(0, 5);

  const currentPrice = observations
    .flatMap((observation) =>
      observation.input.retailPrices
        .filter((entry) => entry.skuId === skuId)
        .map((entry) => entry.price),
    )
    .at(-1) ?? sku.productPrice;
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
    receipt.midpointDays != null && latestObservationAt
      ? `${formatSenaDate(new Date(Date.parse(latestObservationAt) + receipt.midpointDays * 24 * 60 * 60 * 1000).toISOString(), language)} · ${observedVariabilityLabel(latestVariabilityClass, language)}`
      : receipt.label;
  const openOrderCountLabel = translate(
    language,
    openPipelineCount === 1 ? 'skuVmOpenOrderSingular' : 'skuVmOpenOrderPlural',
    { count: openPipelineCount },
  );

  return {
    identity: {
      skuId: sku.skuId,
      name: sku.name,
      description: sku.description,
      soldAsProduct: sku.soldAsProduct,
      statusLabel: status.label,
      statusTone: status.tone,
      topRegime: topRegime(summary, diagnostics, language),
      legacyFallbackAvailable: true,
    },
    heartbeat: {
      headlineUnits: translate(language, 'skuVmHeadlineUnits', {
        units: formatSenaUnits(summary?.latestPosteriorUnits ?? sku.unitsInStock, language),
      }),
      credibleBandLabel: `${formatSenaUnits(summary?.credibleIntervalLow ?? sku.unitsInStock, language)}-${formatSenaUnits(summary?.credibleIntervalHigh ?? sku.unitsInStock, language)}`,
      coverLabel: summary?.daysOfCover != null ? formatSenaDays(summary.daysOfCover, language) : '—',
      reorderLabel: formatSenaPercent(summary?.reorderTriggerProbability ?? null, language),
      pipelineLabel: openOrderCountLabel,
      receiptWindowLabel: receiptLabel,
      variabilityLabel: observedVariabilityLabel(latestVariabilityClass, language),
      heroSentence: translate(language, 'skuVmHeroSentence', {
        low: formatSenaUnits(summary?.credibleIntervalLow ?? sku.unitsInStock, language),
        high: formatSenaUnits(summary?.credibleIntervalHigh ?? sku.unitsInStock, language),
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
          inventory: formatSenaUnits(summary?.latestPosteriorUnits ?? sku.unitsInStock, language),
          reorderPoint: formatSenaUnits(summary?.reorderPoint ?? null, language),
          safetyStock: formatSenaUnits(summary?.safetyStock ?? null, language),
        }),
        points: detail?.inventoryPosterior ?? [],
        reorderPointLabel: formatSenaUnits(summary?.reorderPoint ?? null, language),
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
          count: (detail?.pipelinePosterior ?? []).length,
        }),
        intervals: detail?.pipelinePosterior ?? [],
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
          translate(language, 'skuVmOpenPipelineAge', {
            age: formatSenaDays(intervalPipeline?.ageDaysMean ?? latestPipeline?.ageDaysMean ?? null, language),
          }),
          observedVariabilityLabel(latestVariabilityClass, language),
          translate(language, 'skuVmOpenPipelineReceipt', { receipt: receiptLabel }),
        ],
        events: pipelineEvents,
      },
      exposure: dependencyImpact.map((entry) => ({
        serviceId: entry.serviceId,
        serviceName: entry.name,
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
      costPerUnit: sku.costPerUnit,
      leadTimeVariability: latestVariabilityClass,
      productPrice: sku.productPrice,
      latestObservationAt,
      soldAsProduct: sku.soldAsProduct,
      recommendedOrderQuantity: reorderRecommendation.recommendedUnits,
      reorderRecommendation,
    },
    uiState,
  };
}
