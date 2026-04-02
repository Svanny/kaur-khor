import type { AppCurrency, AppLanguage, InventorySnapshot } from '@shared/inventory';
import {
  SENA_SCHEMA_VERSION,
  type SenaCatalog,
  type SenaDiagnostics,
  type SenaIntervalPosterior,
  type SenaLeadTimePosteriorPoint,
  type SenaObservationRecord,
  type SenaPipelinePosteriorPoint,
  type SenaRegimePosteriorPoint,
  type SenaSkuSummary,
  type SenaWorkspaceSummary,
} from '@shared/sena';

export interface SenaHeartbeatModel {
  headline: string;
  subheadline: string;
  statusLabel: string;
  statusTone: 'neutral' | 'success' | 'warning' | 'danger';
}

export interface SenaRecommendationModel {
  title: string;
  body: string;
  urgency: 'stable' | 'watch' | 'urgent';
}

export interface SenaPriceMarker {
  observedAt: string;
  price: number;
}

export interface SenaRegimePriceLane {
  regimes: SenaRegimePosteriorPoint[];
  prices: SenaPriceMarker[];
}

export interface SenaFlowRow {
  intervalIndex: number;
  startAt: string;
  endAt: string;
  serviceDemandMean: number;
  retailDemandMean: number;
  receiptsMean: number;
  adjustmentsMean: number;
  unconstrainedDemandMean: number;
  realizedConsumptionMean: number;
}

export interface SenaPipelineSummary {
  inTransitMean: number;
  orderProbability: number;
  orderQuantityMean: number;
  receiptQuantityMean: number;
  ageDaysMean: number;
}

export interface SenaEvidenceItem {
  observedAt: string;
  type:
    | 'stock_snapshot'
    | 'order_placed'
    | 'receipt_arrived'
    | 'price_change'
    | 'stockout_flag'
    | 'lead_time_hint'
    | 'note';
  title: string;
  detail: string;
}

function normalizeCatalog(catalog: SenaCatalog): SenaCatalog {
  return {
    ...catalog,
    skus: [...catalog.skus].sort((left, right) => left.skuId.localeCompare(right.skuId)),
    services: [...catalog.services].sort((left, right) => left.serviceId.localeCompare(right.serviceId)),
    bundles: [...catalog.bundles].sort((left, right) => left.bundleId.localeCompare(right.bundleId)),
    sharingMask: [...catalog.sharingMask].sort((left, right) =>
      `${left.serviceId}:${left.skuId}`.localeCompare(`${right.serviceId}:${right.skuId}`),
    ),
  };
}

export function deriveSenaCatalog(snapshot: InventorySnapshot): SenaCatalog {
  return normalizeCatalog({
    schemaVersion: SENA_SCHEMA_VERSION,
    skus: snapshot.skus.map((sku) => ({
      skuId: sku.skuId,
      name: sku.name,
      description: sku.description,
      costPerUnit: sku.costPerUnit,
      soldAsProduct: sku.soldAsProduct,
      productPrice: sku.productPrice,
      leadTimeMeanDaysHint: sku.leadTimeMeanDays,
      leadTimeStdDaysHint: sku.leadTimeStdDays,
    })),
    services: snapshot.services.map((service) => ({
      serviceId: service.serviceId,
      name: service.name,
      description: service.description,
      price: service.price,
      bundle: false,
    })),
    bundles: [],
    sharingMask: snapshot.services.flatMap((service) =>
      service.skuIds.map((skuId) => ({
        serviceId: service.serviceId,
        skuId,
        enabled: true,
        usageProbability: null,
      })),
    ),
  });
}

export function catalogNeedsSync(current: SenaCatalog | null, next: SenaCatalog) {
  if (!current) {
    return true;
  }
  return JSON.stringify(normalizeCatalog(current)) !== JSON.stringify(normalizeCatalog(next));
}

export function linkedSenaServiceIds(catalog: SenaCatalog | null, skuId: string) {
  if (!catalog) {
    return [];
  }
  return catalog.sharingMask
    .filter((entry) => entry.skuId === skuId && entry.enabled)
    .map((entry) => entry.serviceId)
    .filter((serviceId, index, all) => all.indexOf(serviceId) === index)
    .sort((left, right) => left.localeCompare(right));
}

export function latestRetailPrice(
  observations: SenaObservationRecord[],
  skuId: string,
  fallbackPrice: number | null,
) {
  for (let index = observations.length - 1; index >= 0; index -= 1) {
    const price = observations[index]?.input.retailPrices.find((entry) => entry.skuId === skuId)?.price;
    if (price != null) {
      return price;
    }
  }
  return fallbackPrice;
}

export function estimateReceiptEtaIso({
  workspace,
  pipeline,
  leadTime,
}: {
  workspace: SenaWorkspaceSummary | null;
  pipeline: SenaPipelinePosteriorPoint | null;
  leadTime: SenaLeadTimePosteriorPoint | null;
}) {
  if (!workspace?.latestObservedAt || !leadTime) {
    return null;
  }
  const latestObservedAt = Date.parse(workspace.latestObservedAt);
  if (Number.isNaN(latestObservedAt)) {
    return null;
  }
  const ageDays = pipeline?.ageDaysMean ?? 0;
  const remainingDays = Math.max(leadTime.meanDays - ageDays, 0);
  return new Date(latestObservedAt + remainingDays * 24 * 60 * 60 * 1000).toISOString();
}

function formatUnits(value: number, language: AppLanguage) {
  return new Intl.NumberFormat(language === 'km' ? 'km-KH' : 'en-US', {
    maximumFractionDigits: 0,
  }).format(Math.round(value));
}

function formatPercent(value: number, language: AppLanguage) {
  return new Intl.NumberFormat(language === 'km' ? 'km-KH' : 'en-US', {
    style: 'percent',
    maximumFractionDigits: 0,
  }).format(value);
}

function formatDays(value: number | null, language: AppLanguage) {
  if (value == null) {
    return 'n/a';
  }
  return new Intl.NumberFormat(language === 'km' ? 'km-KH' : 'en-US', {
    maximumFractionDigits: value < 10 ? 1 : 0,
  }).format(value);
}

function formatMoney(value: number | null, language: AppLanguage, currency: AppCurrency) {
  if (value == null) {
    return 'n/a';
  }
  return new Intl.NumberFormat(language === 'km' ? 'km-KH' : 'en-US', {
    style: 'currency',
    currency,
    maximumFractionDigits: currency === 'KHR' ? 0 : 2,
  }).format(value);
}

export function buildHeartbeatModel({
  summary,
  latestPriceNow,
  receiptEtaIso,
  language,
  currency,
}: {
  summary: SenaSkuSummary;
  latestPriceNow: number | null;
  receiptEtaIso: string | null;
  language: AppLanguage;
  currency: AppCurrency;
}): SenaHeartbeatModel {
  const topRegime =
    Object.entries(summary.regimeProbabilities).sort((left, right) => right[1] - left[1])[0]?.[0] ?? 'unknown';
  const statusTone =
    summary.stockoutRisk >= 0.35
      ? 'danger'
      : summary.reorderTriggerProbability >= 0.5 || (summary.daysOfCover != null && summary.daysOfCover <= 5)
        ? 'warning'
        : 'success';
  const statusLabel =
    statusTone === 'danger' ? 'At risk' : statusTone === 'warning' ? 'Watch closely' : 'Stable';
  const etaLabel = receiptEtaIso ? receiptEtaIso.slice(0, 10) : 'n/a';

  return {
    headline: `${formatUnits(summary.latestPosteriorUnits, language)} posterior units on hand`,
    subheadline: `${formatUnits(summary.credibleIntervalLow, language)}-${formatUnits(summary.credibleIntervalHigh, language)} credible band · ${formatDays(summary.daysOfCover, language)} days cover · ${formatPercent(summary.reorderTriggerProbability, language)} reorder trigger · ${topRegime} regime · ETA ${etaLabel} · price ${formatMoney(latestPriceNow, language, currency)}`,
    statusLabel,
    statusTone,
  };
}

export function buildRecommendationModel(
  summary: SenaSkuSummary,
  pipeline: SenaPipelinePosteriorPoint | null,
): SenaRecommendationModel {
  const inTransitMean = pipeline?.inTransitMean ?? 0;
  if (summary.stockoutRisk >= 0.35 || (summary.daysOfCover != null && summary.daysOfCover <= 4)) {
    return {
      title: 'Act now',
      body:
        inTransitMean > 0
          ? 'Risk is elevated even with inventory already in transit. Expedite the next receipt or place a top-up order.'
          : 'Risk is elevated and no meaningful pipeline cover is visible. Place an order now.',
      urgency: 'urgent',
    };
  }
  if (summary.reorderTriggerProbability >= 0.5 || (summary.daysOfCover != null && summary.daysOfCover <= 7)) {
    return {
      title: 'Prepare the next touch',
      body: 'Reorder pressure is building. Confirm supplier timing and queue the next replenishment.',
      urgency: 'watch',
    };
  }
  return {
    title: 'Hold steady',
    body: 'Coverage is currently holding. Keep monitoring the pipeline and the next observation cycle.',
    urgency: 'stable',
  };
}

export function buildRegimePriceLane(
  diagnostics: SenaDiagnostics | null,
  observations: SenaObservationRecord[],
  skuId: string,
): SenaRegimePriceLane {
  return {
    regimes: diagnostics?.regimeHistory ?? [],
    prices: observations.flatMap((observation) =>
      observation.input.retailPrices
        .filter((entry) => entry.skuId === skuId)
        .map((entry) => ({
          observedAt: observation.input.observedAt,
          price: entry.price,
        })),
    ),
  };
}

export function buildFlowDecompositionRows(intervals: SenaIntervalPosterior[]): SenaFlowRow[] {
  return intervals.map((interval) => ({
    intervalIndex: interval.intervalIndex,
    startAt: interval.startAt,
    endAt: interval.endAt,
    serviceDemandMean: interval.serviceDemandMean,
    retailDemandMean: interval.retailDemandMean,
    receiptsMean: interval.receiptsMean,
    adjustmentsMean: interval.adjustmentsMean,
    unconstrainedDemandMean: interval.unconstrainedDemandMean,
    realizedConsumptionMean: interval.realizedConsumptionMean,
  }));
}

export function summarizePipelineState(
  point: SenaPipelinePosteriorPoint | null,
): SenaPipelineSummary | null {
  if (!point) {
    return null;
  }
  return {
    inTransitMean: point.inTransitMean,
    orderProbability: point.orderProbability,
    orderQuantityMean: point.orderQuantityMean,
    receiptQuantityMean: point.receiptQuantityMean,
    ageDaysMean: point.ageDaysMean,
  };
}

export function extractSenaEvidence(
  observations: SenaObservationRecord[],
  skuId: string,
): SenaEvidenceItem[] {
  const items = observations.flatMap((observation) => {
    const evidence: SenaEvidenceItem[] = [];
    const stockSnapshot = observation.input.stockSnapshot.find((entry) => entry.skuId === skuId);
    if (stockSnapshot) {
      evidence.push({
        observedAt: observation.input.observedAt,
        type: 'stock_snapshot',
        title: 'Stock snapshot',
        detail: `${stockSnapshot.unitsInStock} units observed`,
      });
    }
    for (const signal of observation.input.orderSignals.filter((entry) => entry.skuId === skuId)) {
      if (signal.orderPlaced) {
        evidence.push({
          observedAt: observation.input.observedAt,
          type: 'order_placed',
          title: 'Order placed',
          detail: signal.approximateOrderQuantity != null ? `${signal.approximateOrderQuantity} units signaled` : 'Order signal recorded',
        });
      }
      if (signal.receiptArrived) {
        evidence.push({
          observedAt: observation.input.observedAt,
          type: 'receipt_arrived',
          title: 'Receipt arrived',
          detail: signal.approximateReceiptQuantity != null ? `${signal.approximateReceiptQuantity} units signaled` : 'Receipt signal recorded',
        });
      }
    }
    for (const price of observation.input.retailPrices.filter((entry) => entry.skuId === skuId)) {
      evidence.push({
        observedAt: observation.input.observedAt,
        type: 'price_change',
        title: 'Retail price',
        detail: `${price.price}`,
      });
    }
    if (observation.input.retailStockouts.includes(skuId)) {
      evidence.push({
        observedAt: observation.input.observedAt,
        type: 'stockout_flag',
        title: 'Retail stockout flag',
        detail: 'SKU was flagged as stocked out in retail.',
      });
    }
    for (const hint of observation.input.leadTimeHints.filter((entry) => entry.skuId === skuId)) {
      evidence.push({
        observedAt: observation.input.observedAt,
        type: 'lead_time_hint',
        title: 'Lead-time hint',
        detail: `Typical ${hint.typicalDays ?? 'n/a'} days`,
      });
    }
    if (observation.input.notes?.trim()) {
      evidence.push({
        observedAt: observation.input.observedAt,
        type: 'note',
        title: 'Observation note',
        detail: observation.input.notes.trim(),
      });
    }
    return evidence;
  });

  return items.sort((left, right) => right.observedAt.localeCompare(left.observedAt));
}
