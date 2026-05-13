import type { AppCurrency, AppLanguage } from '@shared/inventory';
import { DEFAULT_USD_TO_KHR_EXCHANGE_RATE } from '@shared/ipc';
import type {
  SenaCatalog,
  SenaDiagnostics,
  SenaObservationRecord,
  SenaService,
  SenaServiceDetail,
  SenaSku,
  SenaSkuDetail,
  SenaSkuSummary,
  SenaWorkspaceSummary,
} from '@shared/sena';
import {
  buildServiceCommercialSnapshots,
  buildSkuCommercialSnapshots,
  filterObservationsForDays,
  observationCommercialSummary,
} from '@/lib/commercial-flow';
import { formatCurrency, formatWholeNumber } from '@/lib/format';
import { translateUiLiteral } from '@/lib/translations';
import { getTranslation } from '@/lib/translations';
import {
  formatSenaReorderQuantity,
  type SenaReorderQuantityDisplay,
} from '@/lib/sena-reorder-quantity';
import type { StatusPillTone } from '@/lib/state-tones';
import { formatSenaDate, formatSenaDays, formatSenaPercent } from '@/routes/sku-detail/format';
import { daysBetween } from '@/lib/date-input-utils';

export type PerformanceScope = 'all' | 'services' | 'skus';
export type PerformanceTimeRange = '7d' | '30d' | '90d' | 'custom';

type TrendTone = 'up' | 'flat' | 'down';
type BusinessStatus = 'push' | 'unblock' | 'review' | 'clear' | 'steady';
type CustomWindowRange = { startAt: string; endAt: string };

export interface PerformanceTrendSignal {
  label: string;
  points: number[];
  splitIndex?: number;
  tone: TrendTone;
}

interface PriceSignal {
  at: string;
  current: number;
  delta: number;
  previous: number;
}

interface ReceiptSignal {
  ageDays: number | null;
  dueAt: string | null;
  inTransitUnits: number;
  orderProbability: number;
  receiptUnits: number;
  remainingDays: number | null;
  state: 'on_the_way' | 'overdue' | 'partial_received' | 'due_soon';
  stateLabel: string;
}

interface SkuBusinessRow {
  id: string;
  name: string;
  imagePath: string | null;
  href: string;
  detailHref: string;
  type: 'sku';
  supplierName: string | null;
  demandPerDay: number;
  linkedServiceNames: string[];
  linkedServiceRevenue: number;
  marginRatio: number | null;
  marginLabel: string;
  pipelineLabel: string;
  priceSignal: PriceSignal | null;
  receiptSignal: ReceiptSignal | null;
  reorderRecommendation: SenaReorderQuantityDisplay;
  restockGuidance: string | null;
  revenueAtRisk: number;
  status: BusinessStatus;
  statusLabel: string;
  statusTone: StatusPillTone;
  supportLabel: string;
  trendLabel: string;
  trendTone: TrendTone;
  unitsLabel: string;
  daysOfCover: number | null;
  daysOfCoverLabel: string;
  stockoutRisk: number;
}

interface ServiceBusinessRow {
  id: string;
  name: string;
  imagePath: string | null;
  href: string;
  type: 'service';
  activityMean: number;
  bottleneckProbability: number;
  grossMarginRatio: number;
  grossMarginLabel: string;
  pipelineLabel: string;
  priceSignal: PriceSignal | null;
  revenueAtRisk: number;
  sellableUnits: number;
  sellableLabel: string;
  status: BusinessStatus;
  statusLabel: string;
  statusTone: StatusPillTone;
  supportLabel: string;
  trendLabel: string;
  trendTone: TrendTone;
  coverageRatio: number;
}

export interface PerformanceRibbonMetric {
  key: string;
  label: string;
  value: string;
  detail: string;
  trendSignal?: PerformanceTrendSignal;
}

export interface PerformanceMoveRow {
  id: string;
  move: string;
  moveEntityName: string;
  moveEntityType: 'service' | 'sku';
  imagePath: string | null;
  moveVerb: string;
  whyNow: string;
  expectedEffect: string;
  restockGuidance: string | null;
  ctaLabel: 'Open queue' | 'Open SKU' | 'Open service' | 'See evidence';
  ctaHref: string;
  tone: StatusPillTone;
}

export interface PerformanceBoardRow {
  id: string;
  entity: string;
  entityHref: string;
  imagePath: string | null;
  type: string;
  supplierName: string | null;
  demandTrend: string;
  demandTrendSignal?: PerformanceTrendSignal;
  supportStatus: string;
  pipelineSupport: string;
  restockGuidance: string | null;
  priceMarginTone: string;
  statusLabel: string;
  statusTone: StatusPillTone;
  compareEnabled: boolean;
  hasMaterialChange: boolean;
  changeScore: number;
  compareTone: StatusPillTone;
  demandCompareText: string | null;
  supportCompareText: string | null;
  pipelineCompareText: string | null;
  priceMarginCompareText: string | null;
  previousStatusLabel: string | null;
  previousStatusTone: StatusPillTone | null;
  statusCompareText: string | null;
  rowCompareSummary: string | null;
}

export interface PerformanceBandEntry {
  id: string;
  entityType: 'service' | 'sku';
  label: string;
  imagePath: string | null;
  href: string;
  summary: string;
  tone: StatusPillTone;
}

export interface PerformanceTimelineEvent {
  id: string;
  title: string;
  subtitle: string;
  detail: string;
}

export interface PerformanceViewModel {
  ribbon: PerformanceRibbonMetric[];
  moves: PerformanceMoveRow[];
  boardRows: PerformanceBoardRow[];
  winners: PerformanceBandEntry[];
  blockedProfit: PerformanceBandEntry[];
  cashTraps: PerformanceBandEntry[];
  operationalDrag: string[];
  recoveryPipeline: Array<{ id: string; label: string; detail: string; href: string }>;
  priceWatch: Array<{ id: string; label: string; detail: string; href: string }>;
  confidence: {
    coverageLabel: string;
    evidenceLabel: string;
    weakSpotLabel: string;
  };
  timeline: PerformanceTimelineEvent[];
  lastUpdatedLabel: string;
  windowLabel: string;
  previousWindowLabel: string;
}

function translate(language: AppLanguage, key: Parameters<typeof getTranslation>[1], variables?: Parameters<typeof getTranslation>[2]) {
  return getTranslation(language, key, variables);
}

function literal(language: AppLanguage, englishTemplate: string, variables?: Record<string, string | number | null | undefined>) {
  return translateUiLiteral(language, englishTemplate, variables);
}

function daysForTimeRange(timeRange: PerformanceTimeRange) {
  if (timeRange === '7d') {
    return 7;
  }
  if (timeRange === '90d') {
    return 90;
  }
  return 30;
}

function windowLabel(timeRange: PerformanceTimeRange, language: AppLanguage, customRange: { startAt: string; endAt: string } | null) {
  if (timeRange === 'custom' && customRange) {
    return translateUiLiteral(language, 'custom range');
  }
  return translateUiLiteral(language, 'last {days}d', {
    days: daysForTimeRange(timeRange),
  });
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(Math.max(value, minimum), maximum);
}

function filterObservationsForWindow({
  observations,
  endAt,
  offsetDays = 0,
  startAt = null,
  windowDays,
}: {
  observations: SenaObservationRecord[];
  endAt: string | null;
  offsetDays?: number;
  startAt?: string | null;
  windowDays: number;
}) {
  if (!endAt) {
    return observations;
  }

  const endTime = new Date(endAt).getTime();
  if (Number.isNaN(endTime)) {
    return observations;
  }

  const windowEnd = endTime - offsetDays * 24 * 60 * 60 * 1000;
  const parsedStartTime = startAt ? new Date(startAt).getTime() : Number.NaN;
  const windowStart = Number.isFinite(parsedStartTime)
    ? parsedStartTime
    : windowEnd - windowDays * 24 * 60 * 60 * 1000;

  return observations.filter((observation) => {
    const observedTime = new Date(observation.input.observedAt).getTime();
    if (Number.isNaN(observedTime)) {
      return false;
    }
    return observedTime > windowStart && observedTime <= windowEnd;
  });
}

function observationActivityScore(observation: SenaObservationRecord) {
  const orderScore = observation.input.orderSignals.reduce((sum, signal) => {
    return sum + (signal.orderPlaced ? 0.4 : 0) + (signal.receiptArrived ? 0.3 : 0);
  }, 0);

  return (
    observation.input.serviceRankings.length * 1.25 +
    observation.input.retailRankings.length +
    observation.input.serviceStockouts.length * 0.9 +
    observation.input.retailStockouts.length * 0.6 +
    observation.input.servicePrices.length * 0.45 +
    observation.input.retailPrices.length * 0.35 +
    observation.input.stockSnapshot.length * 0.25 +
    orderScore
  );
}

function activityRate(observations: SenaObservationRecord[], days: number) {
  return observations.reduce((sum, observation) => sum + observationActivityScore(observation), 0) / Math.max(1, days);
}

type WindowPipelineState = 'quiet' | 'inbound-open' | 'receipt-arrived';

function windowDemandScoreForService(serviceId: string, observations: SenaObservationRecord[]) {
  return observations.reduce((sum, observation) => {
    const rankingCount = observation.input.serviceRankings.filter((entry) => entry === serviceId).length;
    const stockoutCount = observation.input.serviceStockouts.filter((entry) => entry === serviceId).length;
    return sum + rankingCount * 1.25 + stockoutCount * 0.75;
  }, 0);
}

function windowDemandScoreForSku({
  linkedServiceIds,
  observations,
  skuId,
}: {
  linkedServiceIds: string[];
  observations: SenaObservationRecord[];
  skuId: string;
}) {
  const linkedServices = new Set(linkedServiceIds);
  return observations.reduce((sum, observation) => {
    const retailRankingCount = observation.input.retailRankings.filter((entry) => entry === skuId).length;
    const retailStockoutCount = observation.input.retailStockouts.filter((entry) => entry === skuId).length;
    const linkedServiceRankingCount = observation.input.serviceRankings.filter((entry) => linkedServices.has(entry)).length;
    const linkedServiceStockoutCount = observation.input.serviceStockouts.filter((entry) => linkedServices.has(entry)).length;
    const orderPlacedCount = observation.input.orderSignals.filter((entry) => entry.skuId === skuId && entry.orderPlaced).length;
    const receiptArrivedCount = observation.input.orderSignals.filter((entry) => entry.skuId === skuId && entry.receiptArrived).length;
    return (
      sum +
      retailRankingCount * 1.1 +
      retailStockoutCount * 0.85 +
      linkedServiceRankingCount * 0.55 +
      linkedServiceStockoutCount * 0.7 +
      orderPlacedCount * 0.35 +
      receiptArrivedCount * 0.2
    );
  }, 0);
}

function relativeFactor(currentScore: number, previousScore: number) {
  if (currentScore <= 0 && previousScore <= 0) {
    return 1;
  }
  if (previousScore <= 0) {
    return 1.2;
  }
  if (currentScore <= 0) {
    return 0.8;
  }
  return clamp(currentScore / previousScore, 0.65, 1.45);
}

function compareToneFromDelta(delta: number, neutralThreshold = 0.08): StatusPillTone {
  if (delta > neutralThreshold) {
    return 'success';
  }
  if (delta < neutralThreshold * -1) {
    return 'warning';
  }
  return 'neutral';
}

function compareTrendText(
  currentScore: number,
  previousScore: number,
  language: AppLanguage,
): { delta: number; direction: TrendTone; text: string; tone: StatusPillTone } {
  if (currentScore <= 0 && previousScore <= 0) {
    return { direction: 'flat', text: literal(language, 'Limited comparison'), tone: 'neutral' as const, delta: 0 };
  }
  const deltaRatio = previousScore <= 0 ? 0.2 : (currentScore - previousScore) / Math.max(previousScore, 0.25);
  if (deltaRatio > 0.18) {
    return {
      direction: 'up',
      text: literal(language, 'vs prior {glyph} stronger', { glyph: trendGlyph('up') }),
      tone: 'success' as const,
      delta: deltaRatio,
    };
  }
  if (deltaRatio < -0.18) {
    return {
      direction: 'down',
      text: literal(language, 'vs prior {glyph} softer', { glyph: trendGlyph('down') }),
      tone: 'warning' as const,
      delta: deltaRatio,
    };
  }
  return {
    direction: 'flat',
    text: literal(language, 'vs prior {glyph} flat', { glyph: trendGlyph('flat') }),
    tone: 'neutral' as const,
    delta: deltaRatio,
  };
}

function signalLabelForTone(language: AppLanguage, tone: TrendTone) {
  if (tone === 'up') {
    return literal(language, 'Strong');
  }
  if (tone === 'down') {
    return literal(language, 'Soft');
  }
  return literal(language, 'Steady');
}

function previousToneFromCompare({
  compareDirection,
  currentTone,
}: {
  compareDirection: 'up' | 'down' | 'flat';
  currentTone: TrendTone;
}): TrendTone {
  if (compareDirection === 'flat') {
    return currentTone;
  }

  const ladder: TrendTone[] = ['down', 'flat', 'up'];
  const currentIndex = ladder.indexOf(currentTone);
  const shift = compareDirection === 'up' ? -1 : 1;
  return ladder[clamp(currentIndex + shift, 0, ladder.length - 1)];
}

function latestRetailPriceSignalForWindow(skuId: string, sku: SenaSku, observations: SenaObservationRecord[]) {
  return latestRetailPriceSignal(skuId, sku, observations);
}

function latestServicePriceSignalForWindow(serviceId: string, service: SenaService, observations: SenaObservationRecord[]) {
  return latestServicePriceSignal(serviceId, service, observations);
}

function windowPipelineStateForSku(skuId: string, observations: SenaObservationRecord[]): WindowPipelineState {
  const hasReceipt = observations.some((observation) =>
    observation.input.orderSignals.some((signal) => signal.skuId === skuId && signal.receiptArrived),
  );
  if (hasReceipt) {
    return 'receipt-arrived';
  }
  const hasOrder = observations.some((observation) =>
    observation.input.orderSignals.some((signal) => signal.skuId === skuId && signal.orderPlaced),
  );
  return hasOrder ? 'inbound-open' : 'quiet';
}

function windowPipelineStateForService(linkedSkuIds: string[], observations: SenaObservationRecord[]): WindowPipelineState {
  const states = linkedSkuIds.map((skuId) => windowPipelineStateForSku(skuId, observations));
  if (states.includes('receipt-arrived')) {
    return 'receipt-arrived';
  }
  if (states.includes('inbound-open')) {
    return 'inbound-open';
  }
  return 'quiet';
}

function pipelineCompareText(currentState: WindowPipelineState, previousState: WindowPipelineState, language: AppLanguage) {
  if (currentState === previousState) {
    return { text: literal(language, 'no change'), tone: 'neutral' as const, delta: 0 };
  }
  if (currentState === 'inbound-open' && previousState === 'quiet') {
    return { text: literal(language, 'new inbound'), tone: 'success' as const, delta: 0.7 };
  }
  if (currentState === 'receipt-arrived' && previousState === 'inbound-open') {
    return { text: literal(language, 'receipt closed'), tone: 'success' as const, delta: 0.8 };
  }
  if (currentState === 'quiet' && previousState !== 'quiet') {
    return { text: literal(language, 'pipeline slipped'), tone: 'warning' as const, delta: -0.7 };
  }
  if (currentState === 'receipt-arrived') {
    return { text: literal(language, 'recovery landed'), tone: 'success' as const, delta: 0.6 };
  }
  return { text: literal(language, 'window shifted'), tone: 'info' as const, delta: 0.15 };
}

function statusTransitionText(currentLabel: string, previousLabel: string, language: AppLanguage) {
  if (currentLabel === previousLabel) {
    return { text: null, delta: 0 };
  }
  return { text: literal(language, '{current} from {previous}', { current: currentLabel, previous: previousLabel }), delta: 1 };
}

function coverCompareText({
  currentDays,
  previousDays,
  language,
}: {
  currentDays: number | null;
  previousDays: number | null;
  language: AppLanguage;
}) {
  if (currentDays == null || previousDays == null) {
    return { text: literal(language, 'Limited comparison'), tone: 'neutral' as const, delta: 0 };
  }
  const delta = currentDays - previousDays;
  if (Math.abs(delta) < 0.75) {
    return {
      text: literal(language, 'from {value} cover', { value: formatSenaDays(previousDays, language) }),
      tone: 'neutral' as const,
      delta,
    };
  }
  return {
    text: literal(language, 'cover {direction} {value}', {
      direction: literal(language, delta > 0 ? 'up' : 'down'),
      value: formatSenaDays(Math.abs(delta), language),
    }),
    tone: delta > 0 ? ('success' as const) : ('warning' as const),
    delta,
  };
}

function coverageCompareText(currentRatio: number, previousRatio: number, previousSupportLabel: string, language: AppLanguage) {
  if (Number.isNaN(previousRatio)) {
    return { text: literal(language, 'Limited comparison'), tone: 'neutral' as const, delta: 0 };
  }
  const deltaPoints = Math.round((currentRatio - previousRatio) * 100);
  if (Math.abs(deltaPoints) < 6) {
    return {
      text: literal(language, 'from {value}', { value: previousSupportLabel.toLowerCase() }),
      tone: 'neutral' as const,
      delta: deltaPoints / 100,
    };
  }
  return {
    text: literal(language, 'cover {direction} {value} pts', {
      direction: literal(language, deltaPoints > 0 ? 'up' : 'down'),
      value: Math.abs(deltaPoints),
    }),
    tone: deltaPoints > 0 ? ('success' as const) : ('warning' as const),
    delta: deltaPoints / 100,
  };
}

function priceCompareText({
  current,
  previous,
  language,
}: {
  current: PriceSignal | null;
  previous: PriceSignal | null;
  language: AppLanguage;
}) {
  if (!current && !previous) {
    return { text: literal(language, 'unchanged'), tone: 'neutral' as const, delta: 0 };
  }
  if (current && !previous) {
    return { text: literal(language, 'new price move'), tone: current.delta < 0 ? ('warning' as const) : ('success' as const), delta: 0.7 };
  }
  if (!current && previous) {
    return { text: literal(language, 'unchanged'), tone: 'neutral' as const, delta: -0.25 };
  }
  const currentDelta = current?.delta ?? 0;
  const previousDelta = previous?.delta ?? 0;
  const shift = currentDelta - previousDelta;
  if (Math.abs(shift) < 0.5) {
    return { text: literal(language, 'unchanged'), tone: 'neutral' as const, delta: 0 };
  }
  if (currentDelta < previousDelta) {
    return { text: literal(language, 'price drag worsened'), tone: 'warning' as const, delta: -0.6 };
  }
  if (currentDelta > previousDelta) {
    return {
      text: literal(language, currentDelta > 0 ? 'margin recovered' : 'price drag eased'),
      tone: 'success' as const,
      delta: 0.6,
    };
  }
  return { text: literal(language, 'unchanged'), tone: 'neutral' as const, delta: 0 };
}

function compareSummary(language: AppLanguage, parts: string[]) {
  const filtered = parts.filter(Boolean);
  if (filtered.length === 0) {
    return null;
  }
  const [first, second, third] = filtered;
  return [first, second, third].filter(Boolean).join(` ${literal(language, 'while')} `);
}

function dominantRegime(summary: SenaSkuSummary | null) {
  if (!summary) {
    return 'normal';
  }

  const ordered = Object.entries(summary.regimeProbabilities).sort((left, right) => right[1] - left[1]);
  return ordered[0]?.[0] ?? 'normal';
}

function regimeMomentum(summary: SenaSkuSummary | null) {
  if (!summary) {
    return 0;
  }

  const positive = (summary.regimeProbabilities.promo ?? 0) + (summary.regimeProbabilities.spike ?? 0);
  const negative = (summary.regimeProbabilities.lull ?? 0) + (summary.regimeProbabilities.correction ?? 0);
  return positive - negative;
}

function latestRetailPriceSignal(skuId: string, sku: SenaSku, observations: SenaObservationRecord[]): PriceSignal | null {
  const latest = observations
    .flatMap((observation) =>
      observation.input.retailPrices
        .filter((entry) => entry.skuId === skuId)
        .map((entry) => ({ at: observation.input.observedAt, current: entry.price })),
    )
    .sort((left, right) => new Date(right.at).getTime() - new Date(left.at).getTime())[0];

  if (!latest || sku.productPrice == null) {
    return null;
  }

  return {
    at: latest.at,
    current: latest.current,
    delta: latest.current - sku.productPrice,
    previous: sku.productPrice,
  };
}

function latestServicePriceSignal(serviceId: string, service: SenaService, observations: SenaObservationRecord[]): PriceSignal | null {
  const latest = observations
    .flatMap((observation) =>
      observation.input.servicePrices
        .filter((entry) => entry.serviceId === serviceId)
        .map((entry) => ({ at: observation.input.observedAt, current: entry.price })),
    )
    .sort((left, right) => new Date(right.at).getTime() - new Date(left.at).getTime())[0];

  if (!latest) {
    return null;
  }

  return {
    at: latest.at,
    current: latest.current,
    delta: latest.current - service.price,
    previous: service.price,
  };
}

function addDays(at: string | null, days: number | null) {
  if (!at || days == null || Number.isNaN(days)) {
    return null;
  }

  const date = new Date(at);
  if (Number.isNaN(date.valueOf())) {
    return null;
  }
  date.setDate(date.getDate() + Math.round(days));
  return date.toISOString();
}

function buildReceiptSignal({
  detail,
  observedAt,
  language,
}: {
  detail: SenaSkuDetail | null | undefined;
  observedAt: string | null;
  language: AppLanguage;
}): ReceiptSignal | null {
  const latest = detail?.pipelinePosterior.at(-1) ?? null;
  if (!latest || latest.inTransitMean <= 0 || latest.orderProbability <= 0.25) {
    return null;
  }

  const meanDays = detail?.summary.leadTimeMeanDays ?? null;
  const remainingDays = meanDays != null && latest.ageDaysMean != null ? meanDays - latest.ageDaysMean : null;
  const dueAt = addDays(observedAt, remainingDays);

  let stateLabel = translate(language, 'performanceVmOnTheWay');
  let state: ReceiptSignal['state'] = 'on_the_way';
  if (remainingDays != null && remainingDays < 0) {
    state = 'overdue';
    stateLabel = translate(language, 'performanceVmOverdue');
  } else if (latest.receiptQuantityMean <= 0) {
    state = 'partial_received';
    stateLabel = translate(language, 'performanceVmPartialReceived');
  } else if (remainingDays != null && remainingDays <= 3) {
    state = 'due_soon';
    stateLabel = translate(language, 'performanceVmDueSoon');
  }

  return {
    ageDays: latest.ageDaysMean,
    dueAt,
    inTransitUnits: latest.inTransitMean,
    orderProbability: latest.orderProbability,
    receiptUnits: latest.receiptQuantityMean,
    remainingDays,
    state,
    stateLabel,
  };
}

function statusForSku({
  demandPerDay,
  daysOfCover,
  language,
  linkedServiceRevenue,
  marginRatio,
  priceSignal,
  receiptSignal,
  reorderRecommendationIssued = false,
  stockoutRisk,
  units,
}: {
  demandPerDay: number;
  daysOfCover: number | null;
  language: AppLanguage;
  linkedServiceRevenue: number;
  marginRatio: number | null;
  priceSignal: PriceSignal | null;
  receiptSignal: ReceiptSignal | null;
  reorderRecommendationIssued?: boolean;
  stockoutRisk: number;
  units: number;
}): { status: BusinessStatus; label: string; tone: StatusPillTone } {
  const priceDrag = priceSignal != null && priceSignal.delta < 0;
  const slowMover = demandPerDay <= 1.2 && units >= 12;

  if (reorderRecommendationIssued || stockoutRisk >= 0.65 || (daysOfCover != null && daysOfCover <= 3 && linkedServiceRevenue > 0)) {
    return { status: 'unblock', label: literal(language, 'Unblock'), tone: 'danger' };
  }
  if (priceDrag || (marginRatio != null && marginRatio < 0.4)) {
    return { status: 'review', label: literal(language, 'Review price'), tone: 'warning' };
  }
  if (slowMover && (!receiptSignal || receiptSignal.inTransitUnits <= 0)) {
    return { status: 'clear', label: literal(language, 'Clear cash'), tone: 'neutral' };
  }
  if (demandPerDay >= 2.8 && stockoutRisk < 0.45) {
    return { status: 'push', label: literal(language, 'Push'), tone: 'success' };
  }
  return { status: 'steady', label: literal(language, 'Stable'), tone: 'info' };
}

function statusForService({
  activityMean,
  coverageRatio,
  grossMarginRatio,
  language,
  priceSignal,
}: {
  activityMean: number;
  coverageRatio: number;
  grossMarginRatio: number;
  language: AppLanguage;
  priceSignal: PriceSignal | null;
}): { status: BusinessStatus; label: string; tone: StatusPillTone } {
  if (coverageRatio < 0.7) {
    return { status: 'unblock', label: literal(language, 'Unblock'), tone: 'danger' };
  }
  if ((priceSignal && priceSignal.delta < 0) || grossMarginRatio < 0.42) {
    return { status: 'review', label: literal(language, 'Review price'), tone: 'warning' };
  }
  if (activityMean >= 2.5 && coverageRatio >= 0.9 && grossMarginRatio >= 0.5) {
    return { status: 'push', label: literal(language, 'Push'), tone: 'success' };
  }
  return { status: 'steady', label: literal(language, 'Stable'), tone: 'info' };
}

function trendFromScore(score: number, language: AppLanguage): { tone: TrendTone; label: string } {
  if (score > 0.2) {
    return { tone: 'up', label: literal(language, 'Rising') };
  }
  if (score < -0.15) {
    return { tone: 'down', label: literal(language, 'Softening') };
  }
  return { tone: 'flat', label: literal(language, 'Steady') };
}

function sparklinePointsFromValues(values: number[], targetLength = 6) {
  if (values.length === 0) {
    return Array.from({ length: targetLength }, () => 0);
  }
  if (values.length === 1) {
    return Array.from({ length: targetLength }, () => values[0] ?? 0);
  }

  return Array.from({ length: targetLength }, (_, index) => {
    const position = (index / Math.max(1, targetLength - 1)) * (values.length - 1);
    const lowerIndex = Math.floor(position);
    const upperIndex = Math.ceil(position);
    const lowerValue = values[lowerIndex] ?? values.at(-1) ?? 0;
    const upperValue = values[upperIndex] ?? lowerValue;
    const ratio = position - lowerIndex;
    return lowerValue + (upperValue - lowerValue) * ratio;
  });
}

function aggregateActivityScore(observation: SenaObservationRecord) {
  const demandCount =
    observation.input.serviceRankings.length * 1.2 +
    observation.input.retailRankings.length +
    observation.input.serviceStockouts.length * 0.75 +
    observation.input.retailStockouts.length * 0.6;
  const commercialCount = observation.input.servicePrices.length * 0.2 + observation.input.retailPrices.length * 0.16;
  const supplyCount = observation.input.orderSignals.length * 0.14;
  return demandCount + commercialCount + supplyCount;
}

function orderedObservations(observations: SenaObservationRecord[]) {
  return [...observations].sort((left, right) => {
    return new Date(left.input.observedAt).getTime() - new Date(right.input.observedAt).getTime();
  });
}

function ribbonDemandSeries(observations: SenaObservationRecord[], targetLength = 6) {
  return sparklinePointsFromValues(orderedObservations(observations).map((observation) => aggregateActivityScore(observation)), targetLength);
}

function serviceDemandSeries(serviceId: string, observations: SenaObservationRecord[], targetLength = 6) {
  return sparklinePointsFromValues(
    orderedObservations(observations).map((observation) => {
      const rankingCount = observation.input.serviceRankings.filter((entry) => entry === serviceId).length;
      const stockoutCount = observation.input.serviceStockouts.filter((entry) => entry === serviceId).length;
      return rankingCount * 1.2 + stockoutCount * 0.8;
    }),
    targetLength,
  );
}

function skuDemandSeries({
  linkedServiceIds,
  observations,
  skuId,
  targetLength = 6,
}: {
  linkedServiceIds: string[];
  observations: SenaObservationRecord[];
  skuId: string;
  targetLength?: number;
}) {
  const linkedServices = new Set(linkedServiceIds);
  return sparklinePointsFromValues(
    orderedObservations(observations).map((observation) => {
      const retailRankingCount = observation.input.retailRankings.filter((entry) => entry === skuId).length;
      const retailStockoutCount = observation.input.retailStockouts.filter((entry) => entry === skuId).length;
      const linkedServiceRankingCount = observation.input.serviceRankings.filter((entry) => linkedServices.has(entry)).length;
      const linkedServiceStockoutCount = observation.input.serviceStockouts.filter((entry) => linkedServices.has(entry)).length;
      return (
        retailRankingCount * 1.05 +
        retailStockoutCount * 0.8 +
        linkedServiceRankingCount * 0.5 +
        linkedServiceStockoutCount * 0.68
      );
    }),
    targetLength,
  );
}

function compareTrendSignal({
  compareDirection,
  currentPoints,
  currentTone,
  language,
  previousPoints,
}: {
  compareDirection: 'up' | 'down' | 'flat';
  currentPoints: number[];
  currentTone: TrendTone;
  language: AppLanguage;
  previousPoints: number[];
}) {
  const previousTone = previousToneFromCompare({ compareDirection, currentTone });
  return {
    label: `${signalLabelForTone(language, previousTone)} -> ${signalLabelForTone(language, currentTone)}`,
    points: [...previousPoints, ...currentPoints],
    splitIndex: previousPoints.length,
    tone: currentTone,
  } satisfies PerformanceTrendSignal;
}

function formatPipelineSupport(signal: ReceiptSignal | null, language: AppLanguage) {
  if (!signal) {
    return translate(language, 'performanceVmNoIncomingRelief');
  }
  if (signal.stateLabel === translate(language, 'performanceVmOverdue')) {
    return translateUiLiteral(language, '{state} · {count} units', {
      state: translate(language, 'performanceVmOverdue'),
      count: formatWholeNumber(signal.inTransitUnits, language),
    });
  }
  if (signal.stateLabel === translate(language, 'performanceVmPartialReceived')) {
    return translateUiLiteral(language, '{state} · {count} in motion', {
      state: translate(language, 'performanceVmPartialReceived'),
      count: formatWholeNumber(signal.inTransitUnits, language),
    });
  }
  if (signal.dueAt) {
    return translateUiLiteral(language, '{state} · {date}', {
      state: signal.stateLabel,
      date: formatSenaDate(signal.dueAt, language),
    });
  }
  return translateUiLiteral(language, '{state} · {count} units', {
    state: signal.stateLabel,
    count: formatWholeNumber(signal.inTransitUnits, language),
  });
}

function marginToneLabel({
  currency,
  marginRatio,
  priceSignal,
  language,
  usdToKhrExchangeRate,
}: {
  currency: AppCurrency;
  marginRatio: number | null;
  priceSignal: PriceSignal | null;
  language: AppLanguage;
  usdToKhrExchangeRate: number;
}) {
  const marginText =
    marginRatio == null
      ? translate(language, 'performanceVmMarginUnknown')
      : marginRatio >= 0.55
        ? translate(language, 'performanceVmHealthyMargin')
        : marginRatio >= 0.42
          ? translate(language, 'performanceVmStableMargin')
          : translate(language, 'performanceVmMarginPressure');

  if (!priceSignal || priceSignal.delta === 0) {
    return marginText;
  }

  const priceLabel = priceSignal.delta > 0
    ? translate(language, 'performanceVmPriceUp')
    : translate(language, 'performanceVmPriceDrag');
  return `${marginText} · ${priceLabel} ${formatCurrency(Math.abs(priceSignal.delta), currency, language, usdToKhrExchangeRate)}`;
}

function trendGlyph(tone: TrendTone) {
  if (tone === 'up') {
    return '↗';
  }
  if (tone === 'down') {
    return '↘';
  }
  return '→';
}

function toBoardRow(
  row: SkuBusinessRow | ServiceBusinessRow,
  compare: {
    compareEnabled: boolean;
    compareTone: StatusPillTone;
    changeScore: number;
    demandCompareText: string | null;
    supportCompareText: string | null;
    pipelineCompareText: string | null;
    priceMarginCompareText: string | null;
    previousStatusLabel: string | null;
    previousStatusTone: StatusPillTone | null;
    statusCompareText: string | null;
    rowCompareSummary: string | null;
  },
  demandTrendSignal?: PerformanceTrendSignal,
): PerformanceBoardRow {
  return {
    id: row.id,
    entity: row.name,
    entityHref: row.href,
    imagePath: row.imagePath,
    supplierName: row.type === 'sku' ? row.supplierName : null,
    type: row.type === 'service' ? 'Service' : 'SKU',
    demandTrend: `${trendGlyph(row.trendTone)} ${row.trendLabel}`,
    demandTrendSignal,
    supportStatus: row.supportLabel,
    pipelineSupport: row.pipelineLabel,
    restockGuidance: row.type === 'sku' ? row.restockGuidance : null,
    priceMarginTone: row.type === 'service' ? row.grossMarginLabel : row.marginLabel,
    statusLabel: row.statusLabel,
    statusTone: row.statusTone,
    compareEnabled: compare.compareEnabled,
    hasMaterialChange: compare.changeScore >= 0.75,
    changeScore: compare.changeScore,
    compareTone: compare.compareTone,
    demandCompareText: compare.demandCompareText,
    supportCompareText: compare.supportCompareText,
    pipelineCompareText: compare.pipelineCompareText,
    priceMarginCompareText: compare.priceMarginCompareText,
    previousStatusLabel: compare.previousStatusLabel,
    previousStatusTone: compare.previousStatusTone,
    statusCompareText: compare.statusCompareText,
    rowCompareSummary: compare.rowCompareSummary,
  };
}

function latestObservationObservedAt(observations: SenaObservationRecord[]) {
  return observations.reduce<string | null>((latest, observation) => {
    const observedAt = observation.input.observedAt;
    const observedTime = new Date(observedAt).getTime();
    if (!Number.isFinite(observedTime)) {
      return latest;
    }
    if (!latest) {
      return observedAt;
    }
    return observedTime > new Date(latest).getTime() ? observedAt : latest;
  }, null);
}

function lastUpdatedAt(workspaceSummary: SenaWorkspaceSummary | null, observations: SenaObservationRecord[]) {
  const summaryObservedAt = workspaceSummary?.latestObservedAt ?? null;
  const latestObservationAt = latestObservationObservedAt(observations);
  if (!summaryObservedAt) {
    return latestObservationAt;
  }
  if (!latestObservationAt) {
    return summaryObservedAt;
  }
  return new Date(latestObservationAt).getTime() > new Date(summaryObservedAt).getTime()
    ? latestObservationAt
    : summaryObservedAt;
}

function actionForRow(
  row: SkuBusinessRow | ServiceBusinessRow,
  language: AppLanguage,
): { label: PerformanceMoveRow['ctaLabel']; href: string } {
  if (row.type === 'service') {
    return { label: 'Open service', href: row.href };
  }
  if (row.status === 'unblock') {
    return { label: 'Open queue', href: '/' };
  }
  return { label: 'Open SKU', href: row.href };
}

function moveDescription(row: SkuBusinessRow | ServiceBusinessRow, language: AppLanguage) {
  if (row.type === 'service') {
    if (row.status === 'push') {
      return {
        moveEntityName: row.name,
        moveEntityType: row.type,
        imagePath: row.imagePath,
        moveVerb: translateUiLiteral(language, 'Push'),
        move: translateUiLiteral(language, 'Push {name}', { name: row.name }),
        whyNow: translateUiLiteral(language, '{trend} demand, {support}, {margin}', {
          trend: row.trendLabel.toLowerCase(),
          support: row.supportLabel.toLowerCase(),
          margin: row.grossMarginLabel.toLowerCase(),
        }),
        expectedEffect: translateUiLiteral(language, 'Capture upside while capacity is still holding'),
        restockGuidance: null,
      };
    }
    if (row.status === 'unblock') {
      return {
        moveEntityName: row.name,
        moveEntityType: row.type,
        imagePath: row.imagePath,
        moveVerb: translateUiLiteral(language, 'Recover'),
        move: translateUiLiteral(language, 'Recover {name}', { name: row.name }),
        whyNow: translateUiLiteral(language, '{support} with {pipeline}', {
          support: row.supportLabel.toLowerCase(),
          pipeline: row.pipelineLabel.toLowerCase(),
        }),
        expectedEffect: translateUiLiteral(language, 'Restore sellable capacity and recover blocked revenue'),
        restockGuidance: null,
      };
    }
    return {
      moveEntityName: row.name,
      moveEntityType: row.type,
      imagePath: row.imagePath,
      moveVerb: translateUiLiteral(language, 'Review'),
      move: translateUiLiteral(language, 'Review {name} pricing', { name: row.name }),
      whyNow: translateUiLiteral(language, '{margin} and {trend} demand', {
        margin: row.grossMarginLabel.toLowerCase(),
        trend: row.trendLabel.toLowerCase(),
      }),
      expectedEffect: translateUiLiteral(language, 'Protect margin without stalling service demand'),
      restockGuidance: null,
    };
  }

  if (row.status === 'unblock') {
    return {
      moveEntityName: row.name,
      moveEntityType: row.type,
      imagePath: row.imagePath,
      moveVerb: translateUiLiteral(language, 'Restock'),
      move: translateUiLiteral(language, 'Restock {name}', { name: row.name }),
      whyNow: translateUiLiteral(language, '{support} with {pipeline}', {
        support: row.supportLabel.toLowerCase(),
        pipeline: row.pipelineLabel.toLowerCase(),
      }),
      expectedEffect: row.restockGuidance
        ? translateUiLiteral(language, 'Restore service capacity and stop revenue leakage · {value}', {
            value: row.restockGuidance,
          })
        : translateUiLiteral(language, 'Restore service capacity and stop revenue leakage'),
      restockGuidance: row.restockGuidance,
    };
  }
  if (row.status === 'review') {
    return {
      moveEntityName: row.name,
      moveEntityType: row.type,
      imagePath: row.imagePath,
      moveVerb: translateUiLiteral(language, 'Review'),
      move: translateUiLiteral(language, 'Review {name} pricing', { name: row.name }),
      whyNow: translateUiLiteral(language, '{margin} while {trend} demand is visible', {
        margin: row.marginLabel.toLowerCase(),
        trend: row.trendLabel.toLowerCase(),
      }),
      expectedEffect: translateUiLiteral(language, 'Recover velocity or margin before the drag hardens'),
      restockGuidance: null,
    };
  }
  if (row.status === 'clear') {
    return {
      moveEntityName: row.name,
      moveEntityType: row.type,
      imagePath: row.imagePath,
      moveVerb: translateUiLiteral(language, 'Clear'),
      move: translateUiLiteral(language, 'Clear {name}', { name: row.name }),
      whyNow: translateUiLiteral(language, '{trend} demand with {units}', {
        trend: row.trendLabel.toLowerCase(),
        units: row.unitsLabel.toLowerCase(),
      }),
      expectedEffect: translateUiLiteral(language, 'Free cash tied up in slow-moving stock'),
      restockGuidance: null,
    };
  }
  return {
    moveEntityName: row.name,
    moveEntityType: row.type,
    imagePath: row.imagePath,
    moveVerb: translateUiLiteral(language, 'Push'),
    move: translateUiLiteral(language, 'Push {name}', { name: row.name }),
    whyNow: translateUiLiteral(language, '{trend} demand with {margin}', {
      trend: row.trendLabel.toLowerCase(),
      margin: row.marginLabel.toLowerCase(),
    }),
    expectedEffect: translateUiLiteral(language, 'Capture stronger retail or service-led demand'),
    restockGuidance: null,
  };
}

function sortBusinessRows<T extends SkuBusinessRow | ServiceBusinessRow>(rows: T[]): T[] {
  const statusWeight: Record<BusinessStatus, number> = {
    unblock: 0,
    push: 1,
    review: 2,
    clear: 3,
    steady: 4,
  };

  return [...rows].sort((left, right) => {
    const statusDelta = statusWeight[left.status] - statusWeight[right.status];
    if (statusDelta !== 0) {
      return statusDelta;
    }

    const revenueLeft = left.type === 'service' ? left.revenueAtRisk : left.revenueAtRisk + left.linkedServiceRevenue;
    const revenueRight = right.type === 'service' ? right.revenueAtRisk : right.revenueAtRisk + right.linkedServiceRevenue;
    if (revenueLeft !== revenueRight) {
      return revenueRight - revenueLeft;
    }

    const demandLeft = left.type === 'service' ? left.activityMean : left.demandPerDay;
    const demandRight = right.type === 'service' ? right.activityMean : right.demandPerDay;
    if (demandLeft !== demandRight) {
      return demandRight - demandLeft;
    }

    return left.name.localeCompare(right.name);
  });
}

function sortBoardRowsForCompare(rows: PerformanceBoardRow[]) {
  return [...rows].sort((left, right) => {
    const materialDelta = Number(right.hasMaterialChange) - Number(left.hasMaterialChange);
    if (materialDelta !== 0) {
      return materialDelta;
    }
    if (left.changeScore !== right.changeScore) {
      return right.changeScore - left.changeScore;
    }
    if (left.statusCompareText && !right.statusCompareText) {
      return -1;
    }
    if (!left.statusCompareText && right.statusCompareText) {
      return 1;
    }
    return left.entity.localeCompare(right.entity);
  });
}

export function derivePerformanceViewModel({
  catalog,
  compareMode,
  currency,
  usdToKhrExchangeRate = DEFAULT_USD_TO_KHR_EXCHANGE_RATE,
  diagnostics,
  language,
  observations,
  scope,
  serviceDetailsById,
  skuDetailsById,
  timeRange,
  workspaceSummary,
  customRange,
  previousCustomRange,
}: {
  catalog: SenaCatalog;
  compareMode: boolean;
  currency: AppCurrency;
  usdToKhrExchangeRate?: number;
  diagnostics: SenaDiagnostics | null;
  language: AppLanguage;
  observations: SenaObservationRecord[];
  scope: PerformanceScope;
  serviceDetailsById: Record<string, SenaServiceDetail | null>;
  skuDetailsById: Record<string, SenaSkuDetail | null>;
  timeRange: PerformanceTimeRange;
  workspaceSummary: SenaWorkspaceSummary | null;
  customRange: CustomWindowRange | null;
  previousCustomRange?: CustomWindowRange | null;
}): PerformanceViewModel {
  const observedAt = lastUpdatedAt(workspaceSummary, observations);
  let rangeDays: number;
  let activeWindowEndAt: string;

  if (timeRange === 'custom' && customRange) {
    rangeDays = daysBetween(customRange.startAt, customRange.endAt);
    activeWindowEndAt = customRange.endAt;
  } else {
    rangeDays = daysForTimeRange(timeRange);
    activeWindowEndAt = observedAt ?? new Date().toISOString();
  }

  const activeWindowLabel = windowLabel(timeRange, language, customRange);
  const priorWindowLabel = timeRange === 'custom' && customRange
    ? literal(language, 'prior custom period')
    : translateUiLiteral(language, 'prior {days}d', { days: rangeDays });
  const recentObservations = filterObservationsForWindow({
    observations,
    endAt: activeWindowEndAt,
    windowDays: rangeDays,
  });
  const previousObservations = filterObservationsForWindow({
    observations,
    endAt: timeRange === 'custom' && previousCustomRange ? previousCustomRange.endAt : activeWindowEndAt,
    offsetDays: timeRange === 'custom' && previousCustomRange ? 0 : rangeDays,
    startAt: timeRange === 'custom' && previousCustomRange ? previousCustomRange.startAt : null,
    windowDays: timeRange === 'custom' && previousCustomRange
      ? daysBetween(previousCustomRange.startAt, previousCustomRange.endAt)
      : rangeDays,
  });
  const customerSkuSnapshots = buildSkuCommercialSnapshots({ observations, rangeDays, endAt: activeWindowEndAt });
  const customerServiceSnapshots = buildServiceCommercialSnapshots({ catalog, observations, rangeDays, endAt: activeWindowEndAt });
  const recentCommercialEvents = filterObservationsForDays(observations, rangeDays, activeWindowEndAt)
    .flatMap((observation) => observation.input.commercialEvents ?? []);
  const recentCommercialSummary = observationCommercialSummary(recentCommercialEvents);
  const blockedCustomerOrders = [...customerSkuSnapshots.values()].reduce((sum, snapshot) => sum + snapshot.blockedPendingQuantity, 0)
    + [...customerServiceSnapshots.values()].reduce((sum, snapshot) => sum + snapshot.blockedPendingQuantity, 0);
  const openCustomerOrders = [...customerSkuSnapshots.values()].reduce((sum, snapshot) => sum + snapshot.pendingQuantity, 0)
    + [...customerServiceSnapshots.values()].reduce((sum, snapshot) => sum + snapshot.pendingQuantity, 0);
  const completedCustomerOrders = [...customerSkuSnapshots.values()].reduce((sum, snapshot) => sum + snapshot.realizedWindowQuantity, 0)
    + [...customerServiceSnapshots.values()].reduce((sum, snapshot) => sum + snapshot.realizedWindowQuantity, 0);
  const canceledCustomerOrders = [...customerSkuSnapshots.values()].reduce((sum, snapshot) => sum + snapshot.canceledWindowQuantity, 0)
    + [...customerServiceSnapshots.values()].reduce((sum, snapshot) => sum + snapshot.canceledWindowQuantity, 0);
  const skuSummaryById = new Map(workspaceSummary?.skuSummaries.map((entry) => [entry.skuId, entry]) ?? []);
  const linkedServicesBySkuId = new Map<string, SenaService[]>();
  const linkedSkusByServiceId = new Map<string, SenaSku[]>();

  for (const sku of catalog.skus) {
    linkedServicesBySkuId.set(sku.skuId, []);
  }
  for (const service of catalog.services) {
    linkedSkusByServiceId.set(service.serviceId, []);
  }

  for (const link of catalog.sharingMask) {
    if (!link.enabled) {
      continue;
    }

    const sku = catalog.skus.find((entry) => entry.skuId === link.skuId);
    const service = catalog.services.find((entry) => entry.serviceId === link.serviceId);
    if (!sku || !service) {
      continue;
    }
    linkedServicesBySkuId.get(sku.skuId)?.push(service);
    linkedSkusByServiceId.get(service.serviceId)?.push(sku);
  }

  const skuRows: SkuBusinessRow[] = catalog.skus.map((sku) => {
    const summary = skuSummaryById.get(sku.skuId) ?? null;
    const priceSignal = latestRetailPriceSignal(sku.skuId, sku, recentObservations);
    const receiptSignal = buildReceiptSignal({ detail: skuDetailsById[sku.skuId], observedAt, language });
    const linkedServices = linkedServicesBySkuId.get(sku.skuId) ?? [];
    const marginRatio = sku.productPrice ? (sku.productPrice - sku.costPerUnit) / sku.productPrice : null;
    const trend = trendFromScore(
      regimeMomentum(summary) + ((summary?.demandPerDayMean ?? 0) >= 2.8 ? 0.12 : 0),
      language,
    );
    const linkedServiceRevenue = linkedServices.reduce((sum, service) => sum + service.price, 0);
    const units = summary?.latestPosteriorUnits ?? 0;
    const reorderRecommendation = formatSenaReorderQuantity(summary?.reorderQuantity, language);
    const restockGuidance = reorderRecommendation.recommendationIssued
      ? literal(language, 'Order {value}u', {
          value: formatWholeNumber(reorderRecommendation.recommendedUnits, language),
        })
      : reorderRecommendation.optionalOrderLabel
        ? literal(language, 'Keep watching · optional order {value}u', {
            value: formatWholeNumber(reorderRecommendation.recommendedUnits, language),
          })
        : null;
    const revenueAtRisk =
      Math.max(0, (summary?.expectedLeadTimeDemand ?? 0) - units) * (sku.productPrice ?? 0) +
      (linkedServices.length > 0 ? linkedServices.length * (summary?.stockoutRisk ?? 0) * 12 : 0);
    const supportLabel =
      summary?.daysOfCover != null && summary.daysOfCover <= 3
        ? literal(language, '{cover} cover · {count} service links', {
            cover: formatSenaDays(summary.daysOfCover, language),
            count: linkedServices.length,
          })
        : literal(language, '{count} on hand · {links} service links', {
            count: formatWholeNumber(units, language),
            links: linkedServices.length,
          });
    const status = statusForSku({
      demandPerDay: summary?.demandPerDayMean ?? 0,
      daysOfCover: summary?.daysOfCover ?? null,
      language,
      linkedServiceRevenue,
      marginRatio,
      priceSignal,
      receiptSignal,
      reorderRecommendationIssued: reorderRecommendation.recommendationIssued,
      stockoutRisk: summary?.stockoutRisk ?? 0,
      units,
    });

    return {
      daysOfCover: summary?.daysOfCover ?? null,
      daysOfCoverLabel: formatSenaDays(summary?.daysOfCover ?? null, language),
      demandPerDay: summary?.demandPerDayMean ?? 0,
      detailHref: `/catalog/skus/${sku.skuId}`,
      href: `/catalog/skus/${sku.skuId}`,
      id: sku.skuId,
      imagePath: sku.imagePath?.trim() || null,
      linkedServiceNames: linkedServices.map((service) => service.name),
      linkedServiceRevenue,
      marginLabel: marginToneLabel({ currency, marginRatio, priceSignal, language, usdToKhrExchangeRate }),
      marginRatio,
      name: sku.name,
      supplierName: sku.supplierName?.trim() || null,
      pipelineLabel: formatPipelineSupport(receiptSignal, language),
      priceSignal,
      receiptSignal,
      reorderRecommendation,
      restockGuidance,
      revenueAtRisk,
      status: status.status,
      statusLabel: status.label,
      statusTone: status.tone,
      stockoutRisk: summary?.stockoutRisk ?? 0,
      supportLabel,
      trendLabel: trend.label,
      trendTone: trend.tone,
      type: 'sku',
      unitsLabel: literal(language, '{count} units', { count: formatWholeNumber(units, language) }),
    };
  });

  const serviceDemandValues = catalog.services.map((service) => serviceDetailsById[service.serviceId]?.activityMean ?? 1);
  const averageServiceDemand =
    serviceDemandValues.reduce((sum, value) => sum + value, 0) / Math.max(1, serviceDemandValues.length);

  const serviceRows: ServiceBusinessRow[] = catalog.services.map((service) => {
    const linkedSkus = linkedSkusByServiceId.get(service.serviceId) ?? [];
    const serviceDetail = serviceDetailsById[service.serviceId];
    const sellableUnits = linkedSkus.reduce<number | null>((minimum, sku) => {
      const summary = skuSummaryById.get(sku.skuId) ?? null;
      const units = summary?.latestPosteriorUnits ?? 0;
      if (minimum == null) {
        return units;
      }
      return Math.min(minimum, units);
    }, null) ?? 0;
    const activityMean = serviceDetail?.activityMean ?? Math.max(1, linkedSkus.length);
    const coverageRatio = activityMean > 0 ? Math.min(1, sellableUnits / activityMean) : 1;
    const priceSignal = latestServicePriceSignal(service.serviceId, service, recentObservations);
    const grossMargin = service.price - linkedSkus.reduce((sum, sku) => sum + sku.costPerUnit, 0);
    const grossMarginRatio = service.price > 0 ? grossMargin / service.price : 0;
    const pipelineSignals = linkedSkus
      .map((sku) => skuRows.find((entry) => entry.id === sku.skuId)?.receiptSignal ?? null)
      .filter((entry): entry is ReceiptSignal => Boolean(entry));
    const pipelineLabel =
      pipelineSignals[0] != null
        ? formatPipelineSupport(
            [...pipelineSignals].sort((left, right) => (left.remainingDays ?? 999) - (right.remainingDays ?? 999))[0],
            language,
          )
        : translate(language, 'performanceVmNoIncomingSupport');
    const trend = trendFromScore((activityMean - averageServiceDemand) / Math.max(1, averageServiceDemand), language);
    const status = statusForService({
      activityMean,
      coverageRatio,
      grossMarginRatio,
      language,
      priceSignal,
    });

    return {
      activityMean,
      bottleneckProbability: serviceDetail?.bottleneckProbability ?? (coverageRatio < 0.8 ? 0.55 : 0.2),
      coverageRatio,
      grossMarginLabel:
        grossMarginRatio >= 0.55
          ? translate(language, 'performanceVmHealthyMargin')
          : grossMarginRatio >= 0.42
            ? translate(language, 'performanceVmStableMargin')
            : translate(language, 'performanceVmMarginPressure'),
      grossMarginRatio,
      href: `/catalog/services/${service.serviceId}`,
      id: service.serviceId,
      imagePath: service.imagePath?.trim() || null,
      name: service.name,
      pipelineLabel,
      priceSignal,
      revenueAtRisk: Math.max(0, activityMean - sellableUnits) * service.price,
      sellableLabel: literal(language, '{count} ready to serve · {ratio} can still be fulfilled', {
        count: formatWholeNumber(sellableUnits, language),
        ratio: formatSenaPercent(coverageRatio, language),
      }),
      sellableUnits,
      status: status.status,
      statusLabel: status.label,
      statusTone: status.tone,
      supportLabel:
        coverageRatio >= 0.9
          ? translate(language, 'performanceVmCapacityHolding')
          : coverageRatio >= 0.7
            ? translate(language, 'performanceVmPartiallyCoverable')
            : translate(language, 'performanceVmBlockedBySupply'),
      trendLabel: trend.label,
      trendTone: trend.tone,
      type: 'service',
    };
  });

  const allRows = sortBusinessRows(
    scope === 'services' ? serviceRows : scope === 'skus' ? skuRows : [...serviceRows, ...skuRows],
  );

  const moveCandidates = sortBusinessRows([...serviceRows, ...skuRows]).slice(0, 5);
  const moves = moveCandidates.map((row) => {
    const description = moveDescription(row, language);
    const action = actionForRow(row, language);
    return {
      id: row.id,
      move: description.move,
      moveEntityName: description.moveEntityName,
      moveEntityType: description.moveEntityType,
      imagePath: description.imagePath,
      moveVerb: description.moveVerb,
      whyNow: description.whyNow,
      expectedEffect: description.expectedEffect,
      restockGuidance: description.restockGuidance,
      ctaHref: action.href,
      ctaLabel: action.label,
      tone: row.statusTone,
    } satisfies PerformanceMoveRow;
  });
  const mostBlockedService = [...customerServiceSnapshots.values()]
    .sort((left, right) => right.blockedPendingQuantity - left.blockedPendingQuantity)[0] ?? null;
  const mostBlockedSku = [...customerSkuSnapshots.values()]
    .sort((left, right) => right.blockedPendingQuantity - left.blockedPendingQuantity)[0] ?? null;
  if ((mostBlockedService?.blockedPendingQuantity ?? 0) > 0) {
    const service = catalog.services.find((entry) => entry.serviceId === mostBlockedService?.entityId) ?? null;
    if (service) {
      moves.unshift({
        id: `customer-blocked:${service.serviceId}`,
        move: translateUiLiteral(language, 'Unblock customer orders'),
        moveEntityName: service.name,
        moveEntityType: 'service',
        imagePath: service.imagePath?.trim() || null,
        moveVerb: translateUiLiteral(language, 'Review pending'),
        whyNow: translateUiLiteral(language, '{count} open service order{suffix} are blocked', {
          count: formatWholeNumber(mostBlockedService.blockedPendingQuantity, language),
          suffix: mostBlockedService.blockedPendingQuantity === 1 ? '' : 's',
        }),
        expectedEffect: translateUiLiteral(language, 'This reopens stalled customer revenue without changing the current page contract.'),
        restockGuidance: null,
        ctaHref: `/catalog/services/${service.serviceId}`,
        ctaLabel: 'Open service',
        tone: 'danger',
      });
    }
  } else if ((mostBlockedSku?.blockedPendingQuantity ?? 0) > 0) {
    const sku = catalog.skus.find((entry) => entry.skuId === mostBlockedSku?.entityId) ?? null;
    if (sku) {
      moves.unshift({
        id: `customer-blocked:${sku.skuId}`,
        move: translateUiLiteral(language, 'Release blocked customer demand'),
        moveEntityName: sku.name,
        moveEntityType: 'sku',
        imagePath: sku.imagePath?.trim() || null,
        moveVerb: translateUiLiteral(language, 'Review SKU'),
        whyNow: translateUiLiteral(language, '{count} open customer order{suffix} are waiting on this SKU', {
          count: formatWholeNumber(mostBlockedSku.blockedPendingQuantity, language),
          suffix: mostBlockedSku.blockedPendingQuantity === 1 ? '' : 's',
        }),
        expectedEffect: translateUiLiteral(language, 'Restocking or correcting this SKU should free pending customer completions.'),
        restockGuidance: null,
        ctaHref: `/catalog/skus/${sku.skuId}`,
        ctaLabel: 'Open SKU',
        tone: 'danger',
      });
    }
  }
  const dedupedMoves = moves.filter((row, index, rows) => rows.findIndex((candidate) => candidate.id === row.id) === index).slice(0, 5);

  const serviceDemandTotal = serviceRows.reduce((sum, row) => sum + row.activityMean, 0);
  const coverableDemandTotal = serviceRows.reduce((sum, row) => sum + Math.min(row.activityMean, row.sellableUnits), 0);
  const sellableCapacityRatio = serviceDemandTotal > 0 ? coverableDemandTotal / serviceDemandTotal : 1;
  const regimeDemandScore =
    skuRows.reduce((sum, row) => sum + regimeMomentum(skuSummaryById.get(row.id) ?? null), 0) / Math.max(1, skuRows.length);
  const recentActivityRate = activityRate(recentObservations, rangeDays);
  const previousActivityRate = activityRate(previousObservations, rangeDays);
  const demandScore = regimeDemandScore + clamp((recentActivityRate - previousActivityRate) * 2.2, -0.6, 0.6);
  const demandTrend = trendFromScore(demandScore, language);
  const currentRibbonDemandPoints = ribbonDemandSeries(recentObservations);
  const previousRibbonDemandPoints = ribbonDemandSeries(previousObservations);
  const demandTrendSignal: PerformanceTrendSignal = compareMode
        ? compareTrendSignal({
        compareDirection: compareTrendText(recentActivityRate, previousActivityRate, language).direction,
        currentPoints: currentRibbonDemandPoints,
        currentTone: demandTrend.tone,
        language,
        previousPoints: previousRibbonDemandPoints,
      })
    : {
        label: demandTrend.label,
        points: currentRibbonDemandPoints,
        tone: demandTrend.tone,
      };
  const inboundRows = skuRows.filter((row) => row.receiptSignal != null);
  const overdueInboundCount = inboundRows.filter((row) => row.receiptSignal?.state === 'overdue').length;
  const priceWatchRows = [...serviceRows, ...skuRows]
    .filter((row) =>
      row.type === 'service'
        ? row.priceSignal != null || row.grossMarginRatio < 0.45
        : row.priceSignal != null || (row.marginRatio != null && row.marginRatio < 0.42),
    )
    .slice(0, 3);
  const revenueAtRisk =
    serviceRows.reduce((sum, row) => sum + row.revenueAtRisk, 0) +
    skuRows.reduce((sum, row) => sum + row.revenueAtRisk * 0.35, 0);

  const ribbon: PerformanceRibbonMetric[] = [
    {
      key: 'demand',
      label: translate(language, 'performanceVmRibbonDemandMomentum'),
      value: `${trendGlyph(demandTrend.tone)} ${demandTrend.label}`,
      trendSignal: demandTrendSignal,
      detail:
        demandTrend.tone === 'up'
          ? translateUiLiteral(language, '{count} entities pulling ahead across {window} · {completed} customer completions landed', {
              count: skuRows.filter((row) => row.trendTone === 'up').length,
              completed: formatWholeNumber(completedCustomerOrders, language),
              window: activeWindowLabel,
            })
          : demandTrend.tone === 'down'
            ? translateUiLiteral(language, '{count} entities softening across {window}', {
                count: skuRows.filter((row) => row.trendTone === 'down').length,
                window: activeWindowLabel,
              })
            : translateUiLiteral(language, 'Demand is broadly holding across {window} · {open} customer orders remain open', {
                open: formatWholeNumber(openCustomerOrders, language),
                window: activeWindowLabel,
              }),
    },
    {
      key: 'capacity',
      label: translate(language, 'performanceVmRibbonSellableCapacity'),
      value: literal(language, '{value} can still be fulfilled', {
        value: formatSenaPercent(sellableCapacityRatio, language),
      }),
      detail: blockedCustomerOrders > 0
        ? literal(language, '{count} open customer order{suffix} are blocked right now', {
            count: formatWholeNumber(blockedCustomerOrders, language),
            suffix: blockedCustomerOrders === 1 ? '' : 's',
          })
        : literal(language, '{window} service demand that can still be served', {
            window: activeWindowLabel,
          }),
    },
    {
      key: 'inbound',
      label: translate(language, 'performanceVmRibbonIncomingStock'),
      value: literal(language, '{count} receipts in motion', {
        count: formatWholeNumber(inboundRows.length, language),
      }),
      detail: overdueInboundCount > 0
        ? literal(language, '{count} overdue', { count: overdueInboundCount })
        : literal(language, 'Pipeline still within window'),
    },
    {
      key: 'margin',
      label: translate(language, 'performanceVmRibbonMarginHealth'),
      value: literal(language, priceWatchRows.length > 1 ? 'Watch' : 'Stable'),
      detail:
        recentCommercialSummary.customerRefunded > 0
          ? literal(language, '{count} refund or reversal signal{suffix} landed in {window}', {
              count: formatWholeNumber(recentCommercialSummary.customerRefunded, language),
              suffix: recentCommercialSummary.customerRefunded === 1 ? '' : 's',
              window: activeWindowLabel,
            })
          : priceWatchRows.length > 0
          ? literal(language, '{count} price or margin drags in {window}', {
              count: formatWholeNumber(priceWatchRows.length, language),
              window: activeWindowLabel,
            })
          : literal(language, 'No immediate margin drag detected in {window}', {
              window: activeWindowLabel,
            }),
    },
    {
      key: 'risk',
      label: translate(language, 'performanceVmRibbonRevenueAtRisk'),
      value: formatCurrency(revenueAtRisk, currency, language, usdToKhrExchangeRate),
      detail: blockedCustomerOrders > 0
        ? literal(language, 'Revenue currently blocked by {count} open customer order{suffix}', {
            count: formatWholeNumber(blockedCustomerOrders, language),
            suffix: blockedCustomerOrders === 1 ? '' : 's',
          })
        : literal(language, 'Revenue currently blocked by capacity or stock pressure in {window}', {
            window: activeWindowLabel,
          }),
    },
  ];

  const boardRows = (() => {
    const rows = allRows.slice(0, scope === 'all' ? 8 : 6).map((row) => {
      if (row.type === 'service') {
        const linkedSkuIds = linkedSkusByServiceId.get(row.id)?.map((entry) => entry.skuId) ?? [];
        const currentDemandScore = windowDemandScoreForService(row.id, recentObservations);
        const previousDemandScore = windowDemandScoreForService(row.id, previousObservations);
        const demandCompare = compareTrendText(currentDemandScore, previousDemandScore, language);
        const demandFactor = relativeFactor(currentDemandScore, previousDemandScore);
        const previousActivityMean = row.activityMean / demandFactor;
        const previousCoverageRatio = previousActivityMean > 0 ? Math.min(1, row.sellableUnits / previousActivityMean) : row.coverageRatio;
        const previousSupportLabel =
          previousCoverageRatio >= 0.9 ? 'Capacity holding' : previousCoverageRatio >= 0.7 ? 'Partially coverable' : 'Blocked by supply';
        const supportCompare = coverageCompareText(row.coverageRatio, previousCoverageRatio, previousSupportLabel, language);
        const currentPipelineState = windowPipelineStateForService(linkedSkuIds, recentObservations);
        const previousPipelineState = windowPipelineStateForService(linkedSkuIds, previousObservations);
        const pipelineCompare = pipelineCompareText(currentPipelineState, previousPipelineState, language);
        const previousPriceSignal = latestServicePriceSignalForWindow(row.id, catalog.services.find((entry) => entry.serviceId === row.id)!, previousObservations);
        const priceCompare = priceCompareText({ current: row.priceSignal, previous: previousPriceSignal, language });
        const previousStatus = statusForService({
          activityMean: previousActivityMean,
          coverageRatio: previousCoverageRatio,
          grossMarginRatio: row.grossMarginRatio,
          language,
          priceSignal: previousPriceSignal,
        });
        const statusCompare = statusTransitionText(row.statusLabel, previousStatus.label, language);
        const rowChangeScore =
          Math.abs(demandCompare.delta) * 1.4 +
          Math.abs(supportCompare.delta) * 1.2 +
          Math.abs(pipelineCompare.delta) * 1.1 +
          Math.abs(priceCompare.delta) +
          Math.abs(statusCompare.delta) * 2;
        const compareTone = compareToneFromDelta(
          demandCompare.delta + supportCompare.delta + pipelineCompare.delta + priceCompare.delta + statusCompare.delta,
          0.04,
        );

        const currentDemandPoints = serviceDemandSeries(row.id, recentObservations);
        const previousDemandPoints = serviceDemandSeries(row.id, previousObservations);
        const rowDemandTrendSignal: PerformanceTrendSignal = compareMode
          ? compareTrendSignal({
            compareDirection: demandCompare.direction,
            currentPoints: currentDemandPoints,
            currentTone: row.trendTone,
            language,
            previousPoints: previousDemandPoints,
          })
          : {
              label: row.trendLabel,
              points: currentDemandPoints,
              tone: row.trendTone,
            };

        return toBoardRow(row, {
          compareEnabled: compareMode,
          compareTone,
          changeScore: rowChangeScore,
          demandCompareText: demandCompare.text,
          supportCompareText: supportCompare.text,
          pipelineCompareText: pipelineCompare.text,
          priceMarginCompareText: priceCompare.text,
          previousStatusLabel: previousStatus.label,
          previousStatusTone: previousStatus.tone,
          statusCompareText: statusCompare.text,
          rowCompareSummary:
            rowChangeScore >= 0.75
              ? compareSummary(language, [
                  demandCompare.delta > 0.18 ? literal(language, 'Demand strengthened') : demandCompare.delta < -0.18 ? literal(language, 'Demand softened') : '',
                  supportCompare.delta > 0.06 ? literal(language, 'cover improved') : supportCompare.delta < -0.06 ? literal(language, 'cover fell') : '',
                  pipelineCompare.text === literal(language, 'pipeline slipped')
                    ? literal(language, 'pipeline slipped')
                    : pipelineCompare.text === literal(language, 'new inbound')
                      ? literal(language, 'new inbound arrived')
                      : pipelineCompare.text === literal(language, 'receipt closed')
                        ? literal(language, 'receipt landed')
                        : '',
                ])
              : null,
        }, rowDemandTrendSignal);
      }

      const linkedServiceIds = linkedServicesBySkuId.get(row.id)?.map((entry) => entry.serviceId) ?? [];
      const currentDemandScore = windowDemandScoreForSku({
        linkedServiceIds,
        observations: recentObservations,
        skuId: row.id,
      });
      const previousDemandScore = windowDemandScoreForSku({
        linkedServiceIds,
        observations: previousObservations,
        skuId: row.id,
      });
      const demandCompare = compareTrendText(currentDemandScore, previousDemandScore, language);
      const demandFactor = relativeFactor(currentDemandScore, previousDemandScore);
      const previousDemandPerDay = row.demandPerDay / demandFactor;
      const previousDaysOfCover = previousDemandPerDay > 0 ? (row.daysOfCover ?? 0) * (row.demandPerDay / previousDemandPerDay) : row.daysOfCover;
      const supportCompare = coverCompareText({
        currentDays: row.daysOfCover,
        previousDays: previousDaysOfCover,
        language,
      });
      const currentPipelineState = windowPipelineStateForSku(row.id, recentObservations);
      const previousPipelineState = windowPipelineStateForSku(row.id, previousObservations);
      const pipelineCompare = pipelineCompareText(currentPipelineState, previousPipelineState, language);
      const previousPriceSignal = latestRetailPriceSignalForWindow(row.id, catalog.skus.find((entry) => entry.skuId === row.id)!, previousObservations);
      const priceCompare = priceCompareText({ current: row.priceSignal, previous: previousPriceSignal, language });
      const previousReceiptSignal = previousPipelineState === 'quiet' ? null : row.receiptSignal;
      const previousStatus = statusForSku({
        demandPerDay: previousDemandPerDay,
        daysOfCover: previousDaysOfCover,
        language,
        linkedServiceRevenue: row.linkedServiceRevenue,
        marginRatio: row.marginRatio,
        priceSignal: previousPriceSignal,
        receiptSignal: previousReceiptSignal,
        stockoutRisk: row.stockoutRisk,
        units: row.daysOfCover && previousDaysOfCover ? (row.daysOfCover / previousDaysOfCover) * (row.daysOfCover ?? 0) : 0,
      });
      const statusCompare = statusTransitionText(row.statusLabel, previousStatus.label, language);
      const rowChangeScore =
        Math.abs(demandCompare.delta) * 1.4 +
        Math.abs(supportCompare.delta) * 1.25 +
        Math.abs(pipelineCompare.delta) * 1.1 +
        Math.abs(priceCompare.delta) +
        Math.abs(statusCompare.delta) * 2;
      const compareTone = compareToneFromDelta(
        demandCompare.delta + supportCompare.delta + pipelineCompare.delta + priceCompare.delta + statusCompare.delta,
        0.04,
      );
      const currentDemandPoints = skuDemandSeries({
        linkedServiceIds,
        observations: recentObservations,
        skuId: row.id,
      });
      const previousDemandPoints = skuDemandSeries({
        linkedServiceIds,
        observations: previousObservations,
        skuId: row.id,
      });
      const rowDemandTrendSignal: PerformanceTrendSignal = compareMode
        ? compareTrendSignal({
            compareDirection: demandCompare.direction,
            currentPoints: currentDemandPoints,
            currentTone: row.trendTone,
            language,
            previousPoints: previousDemandPoints,
          })
        : {
            label: row.trendLabel,
            points: currentDemandPoints,
            tone: row.trendTone,
          };

      return toBoardRow(row, {
        compareEnabled: compareMode,
        compareTone,
        changeScore: rowChangeScore,
        demandCompareText: demandCompare.text,
        supportCompareText: supportCompare.text,
        pipelineCompareText: pipelineCompare.text,
        priceMarginCompareText: priceCompare.text,
        previousStatusLabel: previousStatus.label,
        previousStatusTone: previousStatus.tone,
        statusCompareText: statusCompare.text,
        rowCompareSummary:
          rowChangeScore >= 0.75
            ? compareSummary(language, [
                demandCompare.delta > 0.18 ? literal(language, 'Demand strengthened') : demandCompare.delta < -0.18 ? literal(language, 'Demand softened') : '',
                supportCompare.delta > 0.75 ? literal(language, 'cover improved') : supportCompare.delta < -0.75 ? literal(language, 'cover fell') : '',
                pipelineCompare.text === literal(language, 'pipeline slipped')
                  ? literal(language, 'pipeline slipped')
                  : pipelineCompare.text === literal(language, 'new inbound')
                    ? literal(language, 'new inbound opened')
                    : pipelineCompare.text === literal(language, 'receipt closed')
                      ? literal(language, 'receipt landed')
                      : '',
                ])
              : null,
      }, rowDemandTrendSignal);
    });

    return compareMode ? sortBoardRowsForCompare(rows) : rows;
  })();

  const winners = sortBusinessRows([...serviceRows, ...skuRows])
    .filter((row) => row.status === 'push')
    .slice(0, 3)
    .map((row) => ({
      id: row.id,
      entityType: row.type,
      label: row.name,
      imagePath: row.imagePath,
      href: row.href,
      summary:
        row.type === 'service'
          ? `${row.supportLabel} · ${row.grossMarginLabel.toLowerCase()}`
          : `${row.marginLabel} · ${row.pipelineLabel.toLowerCase()}`,
      tone: 'success' as const,
    }));

  const blockedProfit = sortBusinessRows([...serviceRows, ...skuRows])
    .filter((row) => row.status === 'unblock')
    .slice(0, 3)
    .map((row) => ({
      id: row.id,
      entityType: row.type,
      label: row.name,
      imagePath: row.imagePath,
      href: row.href,
      summary:
        row.type === 'service'
          ? `${formatCurrency(row.revenueAtRisk, currency, language, usdToKhrExchangeRate)} blocked · ${row.pipelineLabel.toLowerCase()}`
          : `${row.supportLabel} · ${row.pipelineLabel.toLowerCase()}`,
      tone: 'danger' as const,
    }));

  const cashTraps = sortBusinessRows(skuRows)
    .filter((row) => row.status === 'clear' || (row.demandPerDay <= 1.2 && row.daysOfCover != null && row.daysOfCover >= 6))
    .slice(0, 3)
    .map((row) => ({
      id: row.id,
      entityType: row.type,
      label: row.name,
      imagePath: row.imagePath,
      href: row.href,
      summary: translateUiLiteral(language, '{units} · {trend} demand', {
        units: row.unitsLabel,
        trend: row.trendLabel.toLowerCase(),
      }),
      tone: 'neutral' as const,
    }));

  const operationalDrag = [
    translateUiLiteral(language, '{count} open customer order{suffix} blocked', {
      count: formatWholeNumber(blockedCustomerOrders, language),
      suffix: blockedCustomerOrders === 1 ? '' : 's',
    }),
    translateUiLiteral(language, '{count} overdue receipts', {
      count: formatWholeNumber(overdueInboundCount, language),
    }),
    translateUiLiteral(language, '{count} refund or cancellation signal{suffix}', {
      count: formatWholeNumber(recentCommercialSummary.customerRefunded + canceledCustomerOrders, language),
      suffix: recentCommercialSummary.customerRefunded + canceledCustomerOrders === 1 ? '' : 's',
    }),
  ];

  const recoveryPipeline = inboundRows.slice(0, 3).map((row) => ({
    id: row.id,
    href: row.href,
    label: row.name,
      detail:
      row.receiptSignal?.state === 'overdue'
        ? row.receiptSignal.stateLabel
        : row.receiptSignal?.dueAt
          ? `${formatSenaDate(row.receiptSignal.dueAt, language)} ± ${row.daysOfCoverLabel}`
          : row.pipelineLabel,
  }));

  const priceWatch = priceWatchRows.map((row) => ({
    id: row.id,
    href: row.href,
    label: row.name,
    detail: row.type === 'service' ? row.grossMarginLabel : row.marginLabel,
  }));

  const coverageEstimate = diagnostics?.coverageEstimate ?? 0;
  const coverageLabel = translateUiLiteral(
    language,
    coverageEstimate >= 0.85 ? 'Good' : coverageEstimate >= 0.7 ? 'Moderate' : 'Sparse',
  );
  const weakSpotLabel =
    sortBusinessRows(skuRows)
      .slice()
      .sort((left, right) => {
        const leftWidth = skuSummaryById.get(left.id);
        const rightWidth = skuSummaryById.get(right.id);
        const leftSpread = (leftWidth?.credibleIntervalHigh ?? 0) - (leftWidth?.credibleIntervalLow ?? 0);
        const rightSpread = (rightWidth?.credibleIntervalHigh ?? 0) - (rightWidth?.credibleIntervalLow ?? 0);
        return rightSpread - leftSpread;
      })
      .slice(0, 2)
      .map((row) => row.name)
      .join(' · ') || translateUiLiteral(language, 'Coverage concentrated in recent receipts');

  const timeline: PerformanceTimelineEvent[] = [
    {
      id: 'timeline-demand',
      title: translateUiLiteral(language, 'Demand change'),
      subtitle: translateUiLiteral(language, demandTrend.tone === 'up' ? 'Upside building' : demandTrend.tone === 'down' ? 'Demand easing' : 'Demand holding'),
      detail: ribbon[0].detail,
    },
    {
      id: 'timeline-stockout',
      title: translateUiLiteral(language, 'Stock-limited period'),
      subtitle:
        blockedProfit[0]?.label ??
        translateUiLiteral(language, '{count} services exposed', {
          count: formatWholeNumber(serviceRows.filter((row) => row.coverageRatio < 1).length, language),
        }),
      detail: blockedCustomerOrders > 0
        ? translateUiLiteral(language, '{count} open customer order{suffix} are waiting on stock or capacity', {
            count: formatWholeNumber(blockedCustomerOrders, language),
            suffix: blockedCustomerOrders === 1 ? '' : 's',
          })
        : translateUiLiteral(language, '{value} tied up in blocked demand', {
            value: formatCurrency(revenueAtRisk, currency, language, usdToKhrExchangeRate),
          }),
    },
    {
      id: 'timeline-receipt',
      title: translateUiLiteral(language, 'Delivery arrivals'),
      subtitle: recoveryPipeline[0]?.label ?? translateUiLiteral(language, 'No incoming delivery is active'),
      detail: recoveryPipeline[0]?.detail ?? translateUiLiteral(language, 'No incoming movement right now'),
    },
    {
      id: 'timeline-price',
      title: translateUiLiteral(language, 'Price change'),
      subtitle: recentCommercialSummary.customerRefunded > 0
        ? translateUiLiteral(language, 'Refund pressure is active')
        : priceWatch[0]?.label ?? translateUiLiteral(language, 'No recent price move'),
      detail: recentCommercialSummary.customerRefunded > 0
        ? translateUiLiteral(language, '{count} refund or reversal signal{suffix} landed in the current window', {
            count: formatWholeNumber(recentCommercialSummary.customerRefunded, language),
            suffix: recentCommercialSummary.customerRefunded === 1 ? '' : 's',
          })
        : priceWatch[0]?.detail ?? translateUiLiteral(language, 'Margin posture is stable'),
    },
    {
      id: 'timeline-recovery',
      title: translateUiLiteral(language, 'Promotion / recovery'),
      subtitle: winners[0]?.label ?? translateUiLiteral(language, 'Recovery still building'),
      detail: winners[0]?.summary ?? translateUiLiteral(language, 'Use the move list to pick the next commercial push'),
    },
  ];

  return {
    blockedProfit,
    boardRows,
    cashTraps,
    confidence: {
      coverageLabel,
      evidenceLabel: observedAt
        ? translateUiLiteral(language, '{count} observations in {window} · last strong evidence {date}', {
            count: formatWholeNumber(recentObservations.length, language),
            window: activeWindowLabel,
            date: formatSenaDate(observedAt, language),
          })
        : translateUiLiteral(language, 'No evidence window yet'),
      weakSpotLabel,
    },
    lastUpdatedLabel: observedAt
      ? translate(language, 'performanceVmLastUpdated', {
          date: formatSenaDate(observedAt, language),
          window: activeWindowLabel,
        })
      : translate(language, 'performanceVmWaitingForUpdates'),
    moves: dedupedMoves,
    operationalDrag,
    priceWatch,
    recoveryPipeline,
    ribbon,
    timeline,
    windowLabel: activeWindowLabel,
    previousWindowLabel: priorWindowLabel,
    winners,
  };
}
