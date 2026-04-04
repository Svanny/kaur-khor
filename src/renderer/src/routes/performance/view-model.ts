import type { AppCurrency, AppLanguage } from '@shared/inventory';
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
import { formatCurrency, formatWholeNumber } from '@/lib/format';
import type { StatusPillTone } from '@/lib/status-pill';
import { formatSenaDate, formatSenaDays, formatSenaPercent } from '@/routes/sku-detail/format';

export type PerformanceScope = 'all' | 'services' | 'skus';
export type PerformanceTimeRange = '7d' | '30d' | '90d';

type TrendTone = 'up' | 'flat' | 'down';
type BusinessStatus = 'push' | 'unblock' | 'review' | 'clear' | 'steady';

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
  stateLabel: string;
}

interface SkuBusinessRow {
  id: string;
  name: string;
  href: string;
  detailHref: string;
  type: 'sku';
  demandPerDay: number;
  linkedServiceNames: string[];
  linkedServiceRevenue: number;
  marginRatio: number | null;
  marginLabel: string;
  pipelineLabel: string;
  priceSignal: PriceSignal | null;
  receiptSignal: ReceiptSignal | null;
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
}

export interface PerformanceMoveRow {
  id: string;
  move: string;
  whyNow: string;
  expectedEffect: string;
  ctaLabel: 'Open queue' | 'Open SKU' | 'Open service' | 'See evidence';
  ctaHref: string;
  tone: StatusPillTone;
}

export interface PerformanceBoardRow {
  id: string;
  entity: string;
  entityHref: string;
  type: string;
  demandTrend: string;
  supportStatus: string;
  pipelineSupport: string;
  priceMarginTone: string;
  statusLabel: string;
  statusTone: StatusPillTone;
}

export interface PerformanceBandEntry {
  id: string;
  label: string;
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
}: {
  detail: SenaSkuDetail | null | undefined;
  observedAt: string | null;
}): ReceiptSignal | null {
  const latest = detail?.pipelinePosterior.at(-1) ?? null;
  if (!latest || latest.inTransitMean <= 0 || latest.orderProbability <= 0.25) {
    return null;
  }

  const meanDays = detail?.summary.leadTimeMeanDays ?? null;
  const remainingDays = meanDays != null && latest.ageDaysMean != null ? meanDays - latest.ageDaysMean : null;
  const dueAt = addDays(observedAt, remainingDays);

  let stateLabel = 'In transit';
  if (remainingDays != null && remainingDays < 0) {
    stateLabel = 'Overdue';
  } else if (latest.receiptQuantityMean <= 0) {
    stateLabel = 'Partial received';
  } else if (remainingDays != null && remainingDays <= 3) {
    stateLabel = 'Due soon';
  }

  return {
    ageDays: latest.ageDaysMean,
    dueAt,
    inTransitUnits: latest.inTransitMean,
    orderProbability: latest.orderProbability,
    receiptUnits: latest.receiptQuantityMean,
    remainingDays,
    stateLabel,
  };
}

function statusForSku({
  demandPerDay,
  daysOfCover,
  linkedServiceRevenue,
  marginRatio,
  priceSignal,
  receiptSignal,
  stockoutRisk,
  units,
}: {
  demandPerDay: number;
  daysOfCover: number | null;
  linkedServiceRevenue: number;
  marginRatio: number | null;
  priceSignal: PriceSignal | null;
  receiptSignal: ReceiptSignal | null;
  stockoutRisk: number;
  units: number;
}): { status: BusinessStatus; label: string; tone: StatusPillTone } {
  const priceDrag = priceSignal != null && priceSignal.delta < 0;
  const slowMover = demandPerDay <= 1.2 && units >= 12;

  if (stockoutRisk >= 0.65 || (daysOfCover != null && daysOfCover <= 3 && linkedServiceRevenue > 0)) {
    return { status: 'unblock', label: 'Unblock', tone: 'danger' };
  }
  if (priceDrag || (marginRatio != null && marginRatio < 0.4)) {
    return { status: 'review', label: 'Review price', tone: 'warning' };
  }
  if (slowMover && (!receiptSignal || receiptSignal.inTransitUnits <= 0)) {
    return { status: 'clear', label: 'Clear cash', tone: 'neutral' };
  }
  if (demandPerDay >= 2.8 && stockoutRisk < 0.45) {
    return { status: 'push', label: 'Push', tone: 'success' };
  }
  return { status: 'steady', label: 'Stable', tone: 'info' };
}

function statusForService({
  activityMean,
  coverageRatio,
  grossMarginRatio,
  priceSignal,
}: {
  activityMean: number;
  coverageRatio: number;
  grossMarginRatio: number;
  priceSignal: PriceSignal | null;
}): { status: BusinessStatus; label: string; tone: StatusPillTone } {
  if (coverageRatio < 0.7) {
    return { status: 'unblock', label: 'Unblock', tone: 'danger' };
  }
  if ((priceSignal && priceSignal.delta < 0) || grossMarginRatio < 0.42) {
    return { status: 'review', label: 'Review price', tone: 'warning' };
  }
  if (activityMean >= 2.5 && coverageRatio >= 0.9 && grossMarginRatio >= 0.5) {
    return { status: 'push', label: 'Push', tone: 'success' };
  }
  return { status: 'steady', label: 'Stable', tone: 'info' };
}

function trendFromScore(score: number): { tone: TrendTone; label: string } {
  if (score > 0.2) {
    return { tone: 'up', label: 'Rising' };
  }
  if (score < -0.15) {
    return { tone: 'down', label: 'Softening' };
  }
  return { tone: 'flat', label: 'Steady' };
}

function formatPipelineSupport(signal: ReceiptSignal | null, language: AppLanguage) {
  if (!signal) {
    return 'No inbound relief';
  }
  if (signal.stateLabel === 'Overdue') {
    return `Overdue · ${formatWholeNumber(signal.inTransitUnits, language)} units`;
  }
  if (signal.stateLabel === 'Partial received') {
    return `Partial received · ${formatWholeNumber(signal.inTransitUnits, language)} in motion`;
  }
  if (signal.dueAt) {
    return `${signal.stateLabel} · ${formatSenaDate(signal.dueAt, language)}`;
  }
  return `${signal.stateLabel} · ${formatWholeNumber(signal.inTransitUnits, language)} units`;
}

function marginToneLabel({
  currency,
  marginRatio,
  priceSignal,
  language,
}: {
  currency: AppCurrency;
  marginRatio: number | null;
  priceSignal: PriceSignal | null;
  language: AppLanguage;
}) {
  const marginText =
    marginRatio == null
      ? 'Margin unknown'
      : marginRatio >= 0.55
        ? 'Healthy margin'
        : marginRatio >= 0.42
          ? 'Stable margin'
          : 'Margin pressure';

  if (!priceSignal || priceSignal.delta === 0) {
    return marginText;
  }

  const priceLabel = priceSignal.delta > 0 ? 'price up' : 'price drag';
  return `${marginText} · ${priceLabel} ${formatCurrency(Math.abs(priceSignal.delta), currency, language)}`;
}

function trendGlyph(tone: TrendTone) {
  if (tone === 'up') {
    return '↑';
  }
  if (tone === 'down') {
    return '↓';
  }
  return '→';
}

function toBoardRow(row: SkuBusinessRow | ServiceBusinessRow): PerformanceBoardRow {
  return {
    id: row.id,
    entity: row.name,
    entityHref: row.href,
    type: row.type === 'service' ? 'Service' : 'SKU',
    demandTrend: `${trendGlyph(row.trendTone)} ${row.trendLabel}`,
    supportStatus: row.supportLabel,
    pipelineSupport: row.pipelineLabel,
    priceMarginTone: row.type === 'service' ? row.grossMarginLabel : row.marginLabel,
    statusLabel: row.statusLabel,
    statusTone: row.statusTone,
  };
}

function lastUpdatedAt(workspaceSummary: SenaWorkspaceSummary | null, observations: SenaObservationRecord[]) {
  return workspaceSummary?.latestObservedAt ?? observations[0]?.input.observedAt ?? null;
}

function actionForRow(row: SkuBusinessRow | ServiceBusinessRow): { label: PerformanceMoveRow['ctaLabel']; href: string } {
  if (row.type === 'service') {
    return { label: 'Open service', href: row.href };
  }
  if (row.status === 'unblock') {
    return { label: 'Open queue', href: '/' };
  }
  return { label: 'Open SKU', href: row.href };
}

function moveDescription(row: SkuBusinessRow | ServiceBusinessRow) {
  if (row.type === 'service') {
    if (row.status === 'push') {
      return {
        move: `Push ${row.name}`,
        whyNow: `${row.trendLabel.toLowerCase()} demand, ${row.supportLabel.toLowerCase()}, ${row.grossMarginLabel.toLowerCase()}`,
        expectedEffect: 'Capture upside while capacity is still holding',
      };
    }
    if (row.status === 'unblock') {
      return {
        move: `Recover ${row.name}`,
        whyNow: `${row.supportLabel.toLowerCase()} with ${row.pipelineLabel.toLowerCase()}`,
        expectedEffect: 'Restore sellable capacity and recover blocked revenue',
      };
    }
    return {
      move: `Review ${row.name} pricing`,
      whyNow: `${row.grossMarginLabel.toLowerCase()} and ${row.trendLabel.toLowerCase()} demand`,
      expectedEffect: 'Protect margin without stalling service demand',
    };
  }

  if (row.status === 'unblock') {
    return {
      move: `Restock ${row.name}`,
      whyNow: `${row.supportLabel.toLowerCase()} with ${row.pipelineLabel.toLowerCase()}`,
      expectedEffect: 'Restore service capacity and stop revenue leakage',
    };
  }
  if (row.status === 'review') {
    return {
      move: `Review ${row.name} pricing`,
      whyNow: `${row.marginLabel.toLowerCase()} while ${row.trendLabel.toLowerCase()} demand is visible`,
      expectedEffect: 'Recover velocity or margin before the drag hardens',
    };
  }
  if (row.status === 'clear') {
    return {
      move: `Clear ${row.name}`,
      whyNow: `${row.trendLabel.toLowerCase()} demand with ${row.unitsLabel.toLowerCase()}`,
      expectedEffect: 'Free cash tied up in slow-moving stock',
    };
  }
  return {
    move: `Push ${row.name}`,
    whyNow: `${row.trendLabel.toLowerCase()} demand with ${row.marginLabel.toLowerCase()}`,
    expectedEffect: 'Capture stronger retail or service-led demand',
  };
}

function sortBusinessRows(rows: Array<SkuBusinessRow | ServiceBusinessRow>) {
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

export function derivePerformanceViewModel({
  catalog,
  currency,
  diagnostics,
  language,
  observations,
  scope,
  serviceDetailsById,
  skuDetailsById,
  workspaceSummary,
}: {
  catalog: SenaCatalog;
  currency: AppCurrency;
  diagnostics: SenaDiagnostics | null;
  language: AppLanguage;
  observations: SenaObservationRecord[];
  scope: PerformanceScope;
  serviceDetailsById: Record<string, SenaServiceDetail | null>;
  skuDetailsById: Record<string, SenaSkuDetail | null>;
  workspaceSummary: SenaWorkspaceSummary | null;
}): PerformanceViewModel {
  const observedAt = lastUpdatedAt(workspaceSummary, observations);
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
    const priceSignal = latestRetailPriceSignal(sku.skuId, sku, observations);
    const receiptSignal = buildReceiptSignal({ detail: skuDetailsById[sku.skuId], observedAt });
    const linkedServices = linkedServicesBySkuId.get(sku.skuId) ?? [];
    const marginRatio = sku.productPrice ? (sku.productPrice - sku.costPerUnit) / sku.productPrice : null;
    const trend = trendFromScore(regimeMomentum(summary) + ((summary?.demandPerDayMean ?? 0) >= 2.8 ? 0.12 : 0));
    const linkedServiceRevenue = linkedServices.reduce((sum, service) => sum + service.price, 0);
    const units = summary?.latestPosteriorUnits ?? 0;
    const revenueAtRisk =
      Math.max(0, (summary?.expectedLeadTimeDemand ?? 0) - units) * (sku.productPrice ?? 0) +
      (linkedServices.length > 0 ? linkedServices.length * (summary?.stockoutRisk ?? 0) * 12 : 0);
    const supportLabel =
      summary?.daysOfCover != null && summary.daysOfCover <= 3
        ? `${formatSenaDays(summary.daysOfCover, language)} cover · ${linkedServices.length} service links`
        : `${formatWholeNumber(units, language)} on hand · ${linkedServices.length} service links`;
    const status = statusForSku({
      demandPerDay: summary?.demandPerDayMean ?? 0,
      daysOfCover: summary?.daysOfCover ?? null,
      linkedServiceRevenue,
      marginRatio,
      priceSignal,
      receiptSignal,
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
      linkedServiceNames: linkedServices.map((service) => service.name),
      linkedServiceRevenue,
      marginLabel: marginToneLabel({ currency, marginRatio, priceSignal, language }),
      marginRatio,
      name: sku.name,
      pipelineLabel: formatPipelineSupport(receiptSignal, language),
      priceSignal,
      receiptSignal,
      revenueAtRisk,
      status: status.status,
      statusLabel: status.label,
      statusTone: status.tone,
      stockoutRisk: summary?.stockoutRisk ?? 0,
      supportLabel,
      trendLabel: trend.label,
      trendTone: trend.tone,
      type: 'sku',
      unitsLabel: `${formatWholeNumber(units, language)} units`,
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
    const priceSignal = latestServicePriceSignal(service.serviceId, service, observations);
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
        : 'No inbound support';
    const trend = trendFromScore((activityMean - averageServiceDemand) / Math.max(1, averageServiceDemand));
    const status = statusForService({
      activityMean,
      coverageRatio,
      grossMarginRatio,
      priceSignal,
    });

    return {
      activityMean,
      bottleneckProbability: serviceDetail?.bottleneckProbability ?? (coverageRatio < 0.8 ? 0.55 : 0.2),
      coverageRatio,
      grossMarginLabel:
        grossMarginRatio >= 0.55 ? 'Healthy margin' : grossMarginRatio >= 0.42 ? 'Stable margin' : 'Margin pressure',
      grossMarginRatio,
      href: `/catalog/services/${service.serviceId}`,
      id: service.serviceId,
      name: service.name,
      pipelineLabel,
      priceSignal,
      revenueAtRisk: Math.max(0, activityMean - sellableUnits) * service.price,
      sellableLabel: `${formatWholeNumber(sellableUnits, language)} sellable · ${formatSenaPercent(coverageRatio, language)} coverable`,
      sellableUnits,
      status: status.status,
      statusLabel: status.label,
      statusTone: status.tone,
      supportLabel: coverageRatio >= 0.9 ? 'Capacity holding' : coverageRatio >= 0.7 ? 'Partially coverable' : 'Blocked by supply',
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
    const description = moveDescription(row);
    const action = actionForRow(row);
    return {
      id: row.id,
      move: description.move,
      whyNow: description.whyNow,
      expectedEffect: description.expectedEffect,
      ctaHref: action.href,
      ctaLabel: action.label,
      tone: row.statusTone,
    } satisfies PerformanceMoveRow;
  });

  const serviceDemandTotal = serviceRows.reduce((sum, row) => sum + row.activityMean, 0);
  const coverableDemandTotal = serviceRows.reduce((sum, row) => sum + Math.min(row.activityMean, row.sellableUnits), 0);
  const sellableCapacityRatio = serviceDemandTotal > 0 ? coverableDemandTotal / serviceDemandTotal : 1;
  const demandScore =
    skuRows.reduce((sum, row) => sum + regimeMomentum(skuSummaryById.get(row.id) ?? null), 0) / Math.max(1, skuRows.length);
  const demandTrend = trendFromScore(demandScore);
  const inboundRows = skuRows.filter((row) => row.receiptSignal != null);
  const overdueInboundCount = inboundRows.filter((row) => row.receiptSignal?.stateLabel === 'Overdue').length;
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
      label: 'Demand momentum',
      value: `${trendGlyph(demandTrend.tone)} ${demandTrend.label}`,
      detail:
        demandTrend.tone === 'up'
          ? `${skuRows.filter((row) => row.trendTone === 'up').length} entities pulling ahead`
          : demandTrend.tone === 'down'
            ? `${skuRows.filter((row) => row.trendTone === 'down').length} entities softening`
            : 'Demand is broadly holding',
    },
    {
      key: 'capacity',
      label: 'Sellable capacity',
      value: `${formatSenaPercent(sellableCapacityRatio, language)} coverable`,
      detail: 'Current service demand that can still be served',
    },
    {
      key: 'inbound',
      label: 'Inbound relief',
      value: `${formatWholeNumber(inboundRows.length, language)} receipts in motion`,
      detail: overdueInboundCount > 0 ? `${overdueInboundCount} overdue` : 'Pipeline still within window',
    },
    {
      key: 'margin',
      label: 'Margin health',
      value: priceWatchRows.length > 1 ? 'Watch' : 'Stable',
      detail:
        priceWatchRows.length > 0
          ? `${formatWholeNumber(priceWatchRows.length, language)} price or margin drags`
          : 'No immediate margin drag detected',
    },
    {
      key: 'risk',
      label: 'Revenue at risk',
      value: formatCurrency(revenueAtRisk, currency, language),
      detail: 'Revenue currently blocked by capacity or stock pressure',
    },
  ];

  const boardRows = allRows.slice(0, scope === 'all' ? 8 : 6).map(toBoardRow);

  const winners = sortBusinessRows([...serviceRows, ...skuRows])
    .filter((row) => row.status === 'push')
    .slice(0, 3)
    .map((row) => ({
      id: row.id,
      label: row.name,
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
      label: row.name,
      href: row.href,
      summary:
        row.type === 'service'
          ? `${formatCurrency(row.revenueAtRisk, currency, language)} blocked · ${row.pipelineLabel.toLowerCase()}`
          : `${row.supportLabel} · ${row.pipelineLabel.toLowerCase()}`,
      tone: 'danger' as const,
    }));

  const cashTraps = sortBusinessRows(skuRows)
    .filter((row) => row.status === 'clear' || (row.demandPerDay <= 1.2 && row.daysOfCover != null && row.daysOfCover >= 6))
    .slice(0, 3)
    .map((row) => ({
      id: row.id,
      label: row.name,
      href: row.href,
      summary: `${row.unitsLabel} · ${row.trendLabel.toLowerCase()} demand`,
      tone: 'neutral' as const,
    }));

  const operationalDrag = [
    `${formatWholeNumber(serviceRows.filter((row) => row.coverageRatio < 1 && row.coverageRatio > 0).length, language)} services partially blocked`,
    `${formatWholeNumber(overdueInboundCount, language)} overdue receipts`,
    `${formatWholeNumber(skuRows.filter((row) => row.daysOfCover != null && row.daysOfCover <= 3).length, language)} SKUs below safe cover`,
  ];

  const recoveryPipeline = inboundRows.slice(0, 3).map((row) => ({
    id: row.id,
    href: row.href,
    label: row.name,
    detail:
      row.receiptSignal?.stateLabel === 'Overdue'
        ? 'Overdue'
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
  const coverageLabel = coverageEstimate >= 0.85 ? 'Good' : coverageEstimate >= 0.7 ? 'Moderate' : 'Sparse';
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
      .join(' · ') || 'Coverage concentrated in recent receipts';

  const timeline: PerformanceTimelineEvent[] = [
    {
      id: 'timeline-demand',
      title: 'Demand shift',
      subtitle: demandTrend.tone === 'up' ? 'Upside building' : demandTrend.tone === 'down' ? 'Velocity softening' : 'Demand holding',
      detail: ribbon[0].detail,
    },
    {
      id: 'timeline-stockout',
      title: 'Stockout episode',
      subtitle:
        blockedProfit[0]?.label ??
        `${formatWholeNumber(serviceRows.filter((row) => row.coverageRatio < 1).length, language)} services exposed`,
      detail: `${formatCurrency(revenueAtRisk, currency, language)} tied up in blocked demand`,
    },
    {
      id: 'timeline-receipt',
      title: 'Receipt arrival',
      subtitle: recoveryPipeline[0]?.label ?? 'No active inbound lane',
      detail: recoveryPipeline[0]?.detail ?? 'Pipeline is quiet right now',
    },
    {
      id: 'timeline-price',
      title: 'Price change',
      subtitle: priceWatch[0]?.label ?? 'No recent price move',
      detail: priceWatch[0]?.detail ?? 'Margin posture is stable',
    },
    {
      id: 'timeline-recovery',
      title: 'Promo / recovery',
      subtitle: winners[0]?.label ?? 'Recovery still building',
      detail: winners[0]?.summary ?? 'Use the move list to pick the next commercial push',
    },
  ];

  return {
    blockedProfit,
    boardRows,
    cashTraps,
    confidence: {
      coverageLabel,
      evidenceLabel: observedAt ? `Last strong evidence ${formatSenaDate(observedAt, language)}` : 'No evidence window yet',
      weakSpotLabel,
    },
    lastUpdatedLabel: observedAt ? `Updated ${formatSenaDate(observedAt, language)}` : 'Waiting for SENA evidence',
    moves,
    operationalDrag,
    priceWatch,
    recoveryPipeline,
    ribbon,
    timeline,
    winners,
  };
}
