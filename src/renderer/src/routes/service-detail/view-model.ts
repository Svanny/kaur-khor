import type { AppCurrency, AppLanguage, InventorySnapshot, ServiceRecord, StockReport } from '@shared/inventory';
import type { SenaObservationRecord, SenaRegimePosteriorPoint, SenaServiceDetail, SenaWorkspaceSummary } from '@shared/sena';
import { computeServiceSellableUnits, serviceLinkedSkus } from '@/lib/catalog';
import {
  deriveFragilitySummary,
  mapServiceTimelineEvents,
  rankedServiceContributors,
  serviceStateLabel,
  type RankedContributor,
} from '@/lib/service-control-panel';
import { formatCurrency, formatNumber, formatWholeNumber } from '@/lib/format';
import { formatSenaDate, formatSenaDays, formatSenaPercent } from '@/routes/sku-detail/format';

type ServiceIntervalTone = 'safe' | 'tight' | 'blocked';
type RestorationEventState = 'open' | 'logged';

export interface ServiceInspectorSelection {
  type: 'overview' | 'contributor' | 'interval';
  skuId?: string;
  intervalIndex?: number;
}

export interface ServiceIntervalViewModel {
  key: string;
  intervalIndex: number;
  label: string;
  caption: string;
  dominantRegime: string;
  endAt: string | null;
  priceLabel: string;
  priceValue: number;
  demandValue: number;
  demandLabel: string;
  sellableValue: number;
  sellableLabel: string;
  gapLabel: string;
  tensionLabel: string;
  tone: ServiceIntervalTone;
  evidenceSummary: string;
  bindingLabel: string;
  changeHeadline: string;
  changeLines: string[];
}

export interface ServiceContributorViewModel {
  skuId: string;
  name: string;
  statusLabel: string;
  roleLabel: string;
  probabilityLabel: string;
  usageLabel: string;
  daysOfCoverLabel: string;
  stockLabel: string;
  healthLabel: string;
  inboundLabel: string;
  recentSignal: string;
  recoveryNote: string;
  limitingProbability: number;
  orderRank: number;
  openSkuHref: string;
}

export interface ServiceRestorationEventViewModel {
  key: string;
  skuId: string;
  skuName: string;
  state: RestorationEventState;
  headline: string;
  timingLabel: string;
  quantityLabel: string;
  detail: string;
  openSkuHref: string;
}

export interface ServiceEvidenceEntryViewModel {
  id: string;
  title: string;
  observedAt: string;
  detail: string;
  chips: string[];
}

export interface ServiceDependencyImpactRow {
  skuId: string;
  name: string;
  role: string;
  status: string;
  daysOfCover: string;
  limitingProbability: string;
  inboundRecoveryNote: string;
  openSkuHref: string;
}

export interface ServiceDetailViewModel {
  identity: {
    name: string;
    serviceId: string;
    availabilityLabel: string;
    fragilityLabel: string;
    confidenceLabel: string;
  };
  hero: {
    headline: string;
    summary: string;
  };
  actions: {
    primarySkuHref: string;
    editServiceHref: string;
    latestObservedAt: string | null;
    noBottleneckHint: string;
    bottleneckSku:
      | {
          skuId: string;
          name: string;
          unitsInStock: number;
          costPerUnit: number;
          soldAsProduct: boolean;
          productPrice: number | null;
        }
      | null;
    servicePrice: {
      serviceId: string;
      serviceName: string;
      currentPrice: number;
    };
  };
  ribbon: Array<{ key: string; label: string; value: string }>;
  intervals: ServiceIntervalViewModel[];
  contributors: ServiceContributorViewModel[];
  restoration: ServiceRestorationEventViewModel[];
  dependencyImpact: ServiceDependencyImpactRow[];
  evidence: ServiceEvidenceEntryViewModel[];
  rail: {
    overviewTitle: string;
    overviewReason: string[];
    bottleneckStack: Array<{ skuId: string; label: string; role: string }>;
    recoveryPath: string[];
    nextTouch: {
      dateLabel: string;
      reason: string;
    };
  };
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function titleCaseRegime(value: string | null | undefined) {
  if (!value) {
    return 'Normal';
  }
  return value
    .split(/[_\s-]+/g)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function regimeFactor(value: string | null | undefined) {
  switch (value) {
    case 'promo':
      return 1.18;
    case 'spike':
      return 1.28;
    case 'lull':
      return 0.78;
    case 'stockout_constrained':
      return 0.72;
    case 'correction':
      return 0.9;
    default:
      return 1;
  }
}

function startOfDay(dateLike: Date) {
  return new Date(dateLike.getFullYear(), dateLike.getMonth(), dateLike.getDate());
}

function addDays(value: string | null, days: number | null) {
  if (!value || days == null) {
    return null;
  }
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) {
    return null;
  }
  date.setDate(date.getDate() + days);
  return date.toISOString();
}

function relativeDayLabel(value: string | null, language: AppLanguage) {
  if (!value) {
    return 'Next review';
  }
  const target = new Date(value);
  if (Number.isNaN(target.valueOf())) {
    return formatSenaDate(value, language);
  }
  const today = startOfDay(new Date());
  const targetDay = startOfDay(target);
  const diffDays = Math.round((targetDay.getTime() - today.getTime()) / 86_400_000);
  if (diffDays <= 0) {
    return 'Today';
  }
  if (diffDays === 1) {
    return 'Tomorrow';
  }
  return formatSenaDate(value, language);
}

function latestRelevantPrice({
  service,
  observations,
  reports,
  cutoff,
}: {
  service: ServiceRecord;
  observations: SenaObservationRecord[];
  reports: StockReport[];
  cutoff: string | null;
}) {
  const cutoffTime = cutoff ? new Date(cutoff).getTime() : Number.POSITIVE_INFINITY;
  const observationPrice = [...observations]
    .sort((left, right) => new Date(right.input.observedAt).getTime() - new Date(left.input.observedAt).getTime())
    .flatMap((entry) =>
      entry.input.servicePrices
        .filter((price) => price.serviceId === service.serviceId && new Date(entry.input.observedAt).getTime() <= cutoffTime)
        .map((price) => ({ price: price.price, at: entry.input.observedAt })),
    )[0];

  if (observationPrice) {
    return observationPrice.price;
  }

  const reportPrice = [...reports]
    .sort((left, right) => new Date(right.reportedAt).getTime() - new Date(left.reportedAt).getTime())
    .flatMap((report) =>
      report.servicePriceAdjustments
        .filter((entry) => entry.serviceId === service.serviceId && new Date(report.reportedAt).getTime() <= cutoffTime)
        .map((entry) => ({ price: entry.price, at: report.reportedAt })),
    )[0];

  return reportPrice?.price ?? service.price;
}

function sellableFromStockSnapshot({
  linkedSkuIds,
  stockSnapshot,
}: {
  linkedSkuIds: string[];
  stockSnapshot: SenaObservationRecord['input']['stockSnapshot'];
}) {
  const linked = linkedSkuIds
    .map((skuId) => stockSnapshot.find((entry) => entry.skuId === skuId))
    .filter((entry): entry is NonNullable<typeof entry> => entry != null);

  if (linked.length === 0) {
    return null;
  }

  return linked.reduce((minimum, entry) => Math.min(minimum, entry.unitsInStock), linked[0].unitsInStock);
}

function buildRestorationEvents({
  language,
  linkedSkuIds,
  observations,
  rankedContributors,
}: {
  language: AppLanguage;
  linkedSkuIds: string[];
  observations: SenaObservationRecord[];
  rankedContributors: RankedContributor[];
}) {
  const contributorBySkuId = new Map(rankedContributors.map((entry) => [entry.sku.skuId, entry]));
  const openSignals = new Map<
    string,
    {
      observedAt: string;
      quantity: number | null;
    }
  >();
  const events: ServiceRestorationEventViewModel[] = [];

  const orderedObservations = [...observations].sort(
    (left, right) => new Date(left.input.observedAt).getTime() - new Date(right.input.observedAt).getTime(),
  );

  for (const entry of orderedObservations) {
    for (const signal of entry.input.orderSignals) {
      if (!linkedSkuIds.includes(signal.skuId)) {
        continue;
      }

      if (signal.orderPlaced) {
        openSignals.set(signal.skuId, {
          observedAt: entry.input.observedAt,
          quantity: signal.approximateOrderQuantity,
        });
      }

      if (signal.receiptArrived) {
        const contributor = contributorBySkuId.get(signal.skuId);
        if (contributor) {
          events.push({
            key: `receipt:${signal.skuId}:${entry.observationId}`,
            skuId: signal.skuId,
            skuName: contributor.sku.name,
            state: 'logged',
            headline: `Receipt logged for ${contributor.sku.name}`,
            timingLabel: formatSenaDate(entry.input.observedAt, language),
            quantityLabel:
              signal.approximateReceiptQuantity != null
                ? `+${formatWholeNumber(signal.approximateReceiptQuantity, language)} units`
                : 'Receipt confirmed',
            detail: 'Recent stock evidence improved recovery confidence.',
            openSkuHref: `/catalog/skus/${signal.skuId}`,
          });
        }
        openSignals.delete(signal.skuId);
      }
    }
  }

  for (const [skuId, signal] of openSignals.entries()) {
    const contributor = contributorBySkuId.get(skuId);
    if (!contributor) {
      continue;
    }

    const expectedReceiptAt = addDays(signal.observedAt, contributor.sku.leadTimeMeanDays);
    const timingLabel = expectedReceiptAt
      ? `${formatSenaDate(expectedReceiptAt, language)}${contributor.sku.leadTimeStdDays != null ? ` ± ${formatWholeNumber(contributor.sku.leadTimeStdDays, language)}d` : ''}`
      : 'ETA pending';

    events.push({
      key: `open:${skuId}:${signal.observedAt}`,
      skuId,
      skuName: contributor.sku.name,
      state: 'open',
      headline: `${contributor.sku.name} inbound may restore capacity`,
      timingLabel,
      quantityLabel:
        signal.quantity != null ? `~${formatWholeNumber(signal.quantity, language)} units inbound` : 'Inbound quantity pending',
      detail: contributor.isBottleneck
        ? 'Current bottleneck receipt would lift service sellability first.'
        : 'This receipt supports the next likely restoration step.',
      openSkuHref: `/catalog/skus/${skuId}`,
    });
  }

  return events.sort((left, right) => {
    if (left.state !== right.state) {
      return left.state === 'open' ? -1 : 1;
    }
    return left.timingLabel.localeCompare(right.timingLabel);
  });
}

function deriveCredibleBand({
  detail,
  sellableNow,
}: {
  detail: SenaServiceDetail | null;
  sellableNow: number;
}) {
  const lowAnchor = detail?.activityIntervalLow ?? sellableNow;
  const highAnchor = detail?.activityIntervalHigh ?? sellableNow;
  const low = Math.max(0, Math.floor(Math.min(lowAnchor, sellableNow)));
  const high = Math.max(low, Math.ceil(Math.max(highAnchor, sellableNow)));
  return { low, high };
}

function collectRelevantIntervalEvidence({
  interval,
  reports,
  timelineEvidence,
}: {
  interval: SenaRegimePosteriorPoint;
  reports: StockReport[];
  timelineEvidence: ReturnType<typeof mapServiceTimelineEvents>;
}) {
  const start = new Date(interval.startAt).getTime();
  const end = new Date(interval.endAt).getTime();
  const relevantReports = reports.filter((report) => {
    const at = new Date(report.reportedAt).getTime();
    return at >= start && at <= end;
  });
  const relevantEvidence = timelineEvidence.filter((entry) => {
    const at = new Date(entry.report.reportedAt).getTime();
    return at >= start && at <= end;
  });
  return { relevantReports, relevantEvidence };
}

function intervalTone({ demandValue, sellableValue }: { demandValue: number; sellableValue: number }): ServiceIntervalTone {
  if (sellableValue <= 0) {
    return 'blocked';
  }
  if (sellableValue <= demandValue * 1.15) {
    return 'tight';
  }
  return 'safe';
}

function formatServiceEvidenceObservedAt(value: string | null, language: AppLanguage) {
  return formatSenaDate(value, language);
}

function fallbackInterval({
  service,
  workspaceSummary,
}: {
  service: ServiceRecord;
  workspaceSummary: SenaWorkspaceSummary | null;
}): SenaRegimePosteriorPoint {
  const anchor = workspaceSummary?.latestObservedAt ?? new Date().toISOString();
  return {
    intervalIndex: 0,
    startAt: anchor,
    endAt: anchor,
    dominantRegime: workspaceSummary?.topRegime ?? 'normal',
    regimeProbabilities: { normal: 1 },
  };
}

export function deriveServiceDetailViewModel({
  currency,
  detail,
  language,
  observations,
  reports,
  service,
  snapshot,
  workspaceSummary,
}: {
  currency: AppCurrency;
  detail: SenaServiceDetail | null;
  language: AppLanguage;
  observations: SenaObservationRecord[];
  reports: StockReport[];
  service: ServiceRecord;
  snapshot: InventorySnapshot;
  workspaceSummary: SenaWorkspaceSummary | null;
}): ServiceDetailViewModel {
  const linkedSkus = serviceLinkedSkus(service, snapshot);
  const rankedContributors = rankedServiceContributors(service, snapshot);
  const contributorBySkuId = new Map(rankedContributors.map((entry) => [entry.sku.skuId, entry]));
  const sellableNow = computeServiceSellableUnits(service, snapshot);
  const fragility = deriveFragilitySummary(service, snapshot);
  const activityMean = detail?.activityMean ?? Math.max(1, Math.min(sellableNow, Math.max(linkedSkus.length, 1)));
  const credibleBand = deriveCredibleBand({ detail, sellableNow });
  const disruptionRisk = detail?.bottleneckProbability ?? rankedContributors[0]?.insight?.stockoutRisk ?? 0;
  const topContributor = rankedContributors.find((entry) => entry.isBottleneck) ?? rankedContributors[0] ?? null;
  const actionBottleneck = rankedContributors.find((entry) => entry.isBottleneck) ?? null;
  const currentServicePrice = latestRelevantPrice({
    cutoff: null,
    observations,
    reports,
    service,
  });
  const topRegime =
    detail?.regimeTimeline.at(-1)?.dominantRegime ??
    workspaceSummary?.topRegime ??
    snapshot.sist.topRegime ??
    'normal';
  const restoration = buildRestorationEvents({
    language,
    linkedSkuIds: linkedSkus.map((sku) => sku.skuId),
    observations,
    rankedContributors,
  });
  const healthyCount = rankedContributors.filter((entry) => entry.health === 'healthy').length;
  const riskCount = rankedContributors.length - healthyCount;
  const nextDisruptionDays = fragility.disruptionWindowDays ?? topContributor?.insight?.daysOfCover ?? null;
  const revenueAtRiskValue = Math.max(
    0,
    service.price * activityMean * Math.max(1, Math.min(nextDisruptionDays ?? 1, 7)) * Math.max(disruptionRisk, sellableNow <= 0 ? 1 : 0.3),
  );
  const timelineEvidence = mapServiceTimelineEvents({
    currency,
    language,
    reports,
    service,
    snapshot,
  });

  const contributors = rankedContributors.map<ServiceContributorViewModel>((entry, index) => {
    const relatedInbound = restoration.find((event) => event.skuId === entry.sku.skuId && event.state === 'open');
    const relatedReceipt = restoration.find((event) => event.skuId === entry.sku.skuId && event.state === 'logged');
    const roleLabel = entry.isBottleneck
      ? 'Limiting now'
      : index === 1
        ? 'Next likely limiter'
        : 'Safe contributor';

    return {
      skuId: entry.sku.skuId,
      name: entry.sku.name,
      statusLabel: roleLabel,
      roleLabel,
      probabilityLabel: formatSenaPercent(entry.insight?.stockoutRisk ?? entry.insight?.reorderTriggerProbability ?? detail?.contributors.find((contributor) => contributor.skuId === entry.sku.skuId)?.bottleneckProbability ?? 0, language),
      usageLabel: formatSenaPercent(detail?.contributors.find((contributor) => contributor.skuId === entry.sku.skuId)?.usageProbability ?? 0, language),
      daysOfCoverLabel: entry.insight?.daysOfCover != null ? formatSenaDays(entry.insight.daysOfCover, language) : 'Coverage pending',
      stockLabel: `${formatWholeNumber(entry.sku.unitsInStock, language)} in stock`,
      healthLabel: serviceStateLabel(fragility.currentState),
      inboundLabel: relatedInbound?.timingLabel ?? relatedReceipt?.timingLabel ?? 'No linked inbound',
      recentSignal:
        relatedReceipt?.headline ??
        (entry.isBottleneck ? `${entry.sku.name} is the current binding SKU.` : `${entry.sku.name} is not binding yet.`),
      recoveryNote:
        relatedInbound?.detail ??
        (entry.isBottleneck
          ? 'Recording stock or confirming the next receipt will change sellability fastest.'
          : 'Keep this SKU monitored behind the current bottleneck.'),
      limitingProbability: clamp(
        detail?.contributors.find((contributor) => contributor.skuId === entry.sku.skuId)?.bottleneckProbability ??
          entry.insight?.stockoutRisk ??
          0,
        0,
        1,
      ),
      orderRank: index + 1,
      openSkuHref: `/catalog/skus/${entry.sku.skuId}`,
    };
  });

  const intervalsSource = detail?.regimeTimeline.length ? detail.regimeTimeline : [fallbackInterval({ service, workspaceSummary })];
  const intervals = intervalsSource.map<ServiceIntervalViewModel>((interval) => {
    const { relevantEvidence, relevantReports } = collectRelevantIntervalEvidence({
      interval,
      reports,
      timelineEvidence,
    });

    const snapshotFromObservation = [...observations]
      .sort((left, right) => new Date(right.input.observedAt).getTime() - new Date(left.input.observedAt).getTime())
      .find((entry) => {
        const observedAt = new Date(entry.input.observedAt).getTime();
        return observedAt <= new Date(interval.endAt).getTime();
      });

    const snapshotSellable =
      (snapshotFromObservation
        ? sellableFromStockSnapshot({
            linkedSkuIds: linkedSkus.map((sku) => sku.skuId),
            stockSnapshot: snapshotFromObservation.input.stockSnapshot,
          })
        : null) ?? sellableNow;

    const demandValue = activityMean * regimeFactor(interval.dominantRegime);
    const price = latestRelevantPrice({
      cutoff: interval.endAt,
      observations,
      reports,
      service,
    });
    const tone = intervalTone({ demandValue, sellableValue: snapshotSellable });
    const evidenceSummary = relevantEvidence[0]?.summary ?? 'No direct evidence in this interval.';
    const changeLines = relevantEvidence.length
      ? relevantEvidence.slice(0, 3).map((entry) => entry.summary)
      : relevantReports.length
        ? ['Stock evidence adjusted contributor pressure.']
        : ['No material change recorded in this interval.'];

    return {
      key: `interval:${interval.intervalIndex}`,
      intervalIndex: interval.intervalIndex,
      label: formatSenaDate(interval.endAt, language),
      caption: titleCaseRegime(interval.dominantRegime),
      dominantRegime: titleCaseRegime(interval.dominantRegime),
      endAt: interval.endAt,
      priceLabel: formatCurrency(price, currency, language),
      priceValue: price,
      demandValue,
      demandLabel: formatNumber(demandValue, language),
      sellableValue: snapshotSellable,
      sellableLabel: formatWholeNumber(snapshotSellable, language),
      gapLabel:
        snapshotSellable > 0
          ? `${formatWholeNumber(Math.max(0, Math.round(demandValue - snapshotSellable)), language)} at risk`
          : 'Blocked',
      tensionLabel:
        tone === 'blocked'
          ? 'Demand outruns capacity'
          : tone === 'tight'
            ? 'Demand is close to service capacity'
            : 'Capacity stays ahead of demand',
      tone,
      evidenceSummary,
      bindingLabel: topContributor?.sku.name ?? 'No active bottleneck',
      changeHeadline:
        tone === 'blocked'
          ? 'Service was constrained in this interval'
          : tone === 'tight'
            ? 'The service was close to a disruption threshold'
            : 'Capacity remained resilient in this interval',
      changeLines,
    };
  });

  const evidence = timelineEvidence.slice(0, 7).map<ServiceEvidenceEntryViewModel>((entry) => ({
    id: entry.report.reportId,
    title: entry.summary,
    observedAt: formatServiceEvidenceObservedAt(entry.report.reportedAt, language),
    detail: entry.secondary ?? 'Evidence incorporated into service viability.',
    chips: entry.types.map((type) => {
      switch (type) {
        case 'service-unavailable':
          return 'Service unavailable';
        case 'price-adjustment':
          return 'Price changed';
        case 'linked-sku-change':
          return 'Stock report';
        case 'ranking-update':
          return 'Ranking update';
        case 'limiter-shift':
          return 'Blocker emerged';
      }
    }),
  }));

  const dependencyImpact = contributors.map<ServiceDependencyImpactRow>((entry) => ({
    skuId: entry.skuId,
    name: entry.name,
    role: entry.roleLabel,
    status: `${entry.stockLabel} · ${entry.statusLabel.toLowerCase()}`,
    daysOfCover: entry.daysOfCoverLabel,
    limitingProbability: entry.probabilityLabel,
    inboundRecoveryNote: entry.inboundLabel,
    openSkuHref: entry.openSkuHref,
  }));

  const primarySkuHref = topContributor ? `/catalog/skus/${topContributor.sku.skuId}` : '/catalog';
  const inboundCount = restoration.filter((entry) => entry.state === 'open').length;
  const overviewReason = [
    `${formatSenaPercent(disruptionRisk, language)} disruption risk with ${topContributor?.sku.name ?? 'no active bottleneck'} in front.`,
    nextDisruptionDays != null
      ? `${topContributor?.sku.name ?? 'Next blocker'} may constrain the service in ${formatSenaDays(nextDisruptionDays, language)}.`
      : 'Cover timing is still being inferred from the latest evidence.',
    inboundCount > 0
      ? `${formatWholeNumber(inboundCount, language)} linked inbound ${inboundCount === 1 ? 'signal' : 'signals'} may restore capacity.`
      : 'No open inbound is visible for the current bottleneck chain.',
  ];
  const nextTouchDate = restoration.find((entry) => entry.state === 'open')?.timingLabel ?? null;

  return {
    identity: {
      name: service.name,
      serviceId: service.serviceId,
      availabilityLabel: fragility.currentState === 'blocked' ? 'Blocked' : 'Available',
      fragilityLabel: fragility.currentState === 'available' ? 'Stable' : fragility.currentState === 'blocked' ? 'Fragile' : 'Fragile',
      confidenceLabel:
        fragility.confidence === 'high'
          ? 'High confidence'
          : fragility.confidence === 'medium'
            ? 'Medium confidence'
            : 'Low confidence',
    },
    hero: {
      headline: `${formatWholeNumber(sellableNow, language)} service units likely sellable today`,
      summary: `${formatWholeNumber(credibleBand.low, language)}-${formatWholeNumber(credibleBand.high, language)} credible band · bottleneck: ${topContributor?.sku.name ?? 'none'} · disruption risk ${formatSenaPercent(disruptionRisk, language)} · next blocker ${nextDisruptionDays != null ? `in ${formatSenaDays(nextDisruptionDays, language)}` : 'timing pending'} · ${inboundCount > 0 ? `${formatWholeNumber(inboundCount, language)} inbound ${inboundCount === 1 ? 'receipt may' : 'receipts may'} restore capacity` : 'no inbound recovery visible yet'}`,
    },
    actions: {
      primarySkuHref,
      editServiceHref: `/catalog/services/${service.serviceId}/edit`,
      latestObservedAt: workspaceSummary?.latestObservedAt ?? observations.at(-1)?.input.observedAt ?? reports.at(-1)?.reportedAt ?? null,
      noBottleneckHint: 'No limiting contributor is active right now.',
      bottleneckSku: actionBottleneck
        ? {
            skuId: actionBottleneck.sku.skuId,
            name: actionBottleneck.sku.name,
            unitsInStock: actionBottleneck.sku.unitsInStock,
            costPerUnit: actionBottleneck.sku.costPerUnit,
            soldAsProduct: actionBottleneck.sku.soldAsProduct,
            productPrice: actionBottleneck.sku.productPrice,
          }
        : null,
      servicePrice: {
        serviceId: service.serviceId,
        serviceName: service.name,
        currentPrice: currentServicePrice,
      },
    },
    ribbon: [
      { key: 'sellable-now', label: 'Sellable now', value: formatWholeNumber(sellableNow, language) },
      { key: 'demand-per-day', label: 'Demand/day', value: formatNumber(activityMean, language) },
      { key: 'bottleneck', label: 'Bottleneck SKU', value: topContributor?.sku.name ?? '—' },
      { key: 'revenue-at-risk', label: 'Revenue at risk', value: formatCurrency(revenueAtRiskValue, currency, language) },
      { key: 'next-disruption', label: 'Next disruption', value: nextDisruptionDays != null ? formatSenaDays(nextDisruptionDays, language) : 'Pending' },
      {
        key: 'linked-health',
        label: 'Linked SKUs health',
        value: rankedContributors.length ? `${formatWholeNumber(riskCount, language)} risk / ${formatWholeNumber(rankedContributors.length, language)}` : 'No links',
      },
    ],
    intervals,
    contributors,
    restoration,
    dependencyImpact,
    evidence,
    rail: {
      overviewTitle:
        fragility.currentState === 'blocked'
          ? `Unblock ${service.name.toLowerCase()}`
          : `Protect ${service.name.toLowerCase()}`,
      overviewReason,
      bottleneckStack: contributors.slice(0, 4).map((entry) => ({
        skuId: entry.skuId,
        label: entry.name,
        role: entry.roleLabel,
      })),
      recoveryPath:
        restoration.length > 0
          ? restoration.slice(0, 3).map((entry) => `${entry.headline} · ${entry.timingLabel}`)
          : contributors.slice(0, 3).map((entry) => `${entry.name} · ${entry.daysOfCoverLabel}`),
      nextTouch: {
        dateLabel: relativeDayLabel(nextTouchDate, language),
        reason:
          restoration.find((entry) => entry.state === 'open')?.headline ??
          (topContributor ? `Review ${topContributor.sku.name} before it binds the service.` : 'Review linked SKU health.'),
      },
    },
  };
}
