import type { AppCurrency, AppLanguage, InventorySnapshot, ServiceRecord, StockReport } from '@shared/inventory';
import { DEFAULT_USD_TO_KHR_EXCHANGE_RATE } from '@shared/ipc';
import type { SenaObservationRecord, SenaRegimePosteriorPoint, SenaServiceDetail, SenaWorkspaceSummary } from '@shared/sena';
import { computeServiceSellableUnits, serviceLinkedSkus } from '@/lib/catalog';
import { buildCommercialEntitySnapshots } from '@/lib/commercial-flow';
import { translateRegimeLabel } from '@/lib/localized-display';
import { getTranslation, translateUiLiteral } from '@/lib/translations';
import {
  deriveFragilitySummary,
  mapServiceTimelineEvents,
  rankedServiceContributors,
  serviceStateLabel,
  type RankedContributor,
} from '@/lib/service-control-panel';
import { displayMoneyFromUsd, formatCurrency, formatNumber, formatWholeNumber } from '@/lib/format';
import { formatSenaReorderQuantity } from '@/lib/sena-reorder-quantity';
import { formatSenaDate, formatSenaDays, formatSenaPercent } from '@/routes/sku-detail/format';

type ServiceIntervalTone = 'safe' | 'tight' | 'blocked';
type RestorationEventState = 'open' | 'logged';

function translate(language: AppLanguage, key: Parameters<typeof getTranslation>[1], variables?: Parameters<typeof getTranslation>[2]) {
  return getTranslation(language, key, variables);
}

function formatCompactUnits(value: number, language: AppLanguage) {
  return translateUiLiteral(language, '{count}u', {
    count: formatWholeNumber(value, language),
  });
}

function formatCompactDays(value: number, language: AppLanguage) {
  return translateUiLiteral(language, '{count}d', {
    count: formatWholeNumber(value, language),
  });
}

function restockGuidanceLabel(language: AppLanguage, name: string, units: number, mode: 'recommended' | 'optional') {
  return mode === 'recommended'
    ? translateUiLiteral(language, '{name} · order {count}', {
        name,
        count: formatCompactUnits(units, language),
      })
    : translateUiLiteral(language, '{name} · keep watching · optional order {count}', {
        name,
        count: formatCompactUnits(units, language),
      });
}

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
  regimeKey: string;
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
  imagePath: string | null;
  statusLabel: string;
  roleKey: 'limiting_now' | 'next_likely_limiter' | 'safe_contributor';
  roleLabel: string;
  probabilityLabel: string;
  usageLabel: string;
  daysOfCoverLabel: string;
  stockLabel: string;
  healthLabel: string;
  inboundLabel: string;
  recentSignal: string;
  recoveryNote: string;
  restockGuidance: string | null;
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
  imagePath: string | null;
  role: string;
  status: string;
  blockedOpenOrders: string;
  daysOfCover: string;
  limitingProbability: string;
  inboundRecoveryNote: string;
  pendingSupplyRelief: string;
  restockGuidance: string | null;
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
    customerCommitments: string[];
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
    return translate(language, 'serviceVmNextReview');
  }
  const target = new Date(value);
  if (Number.isNaN(target.valueOf())) {
    return formatSenaDate(value, language);
  }
  const today = startOfDay(new Date());
  const targetDay = startOfDay(target);
  const diffDays = Math.round((targetDay.getTime() - today.getTime()) / 86_400_000);
  if (diffDays <= 0) {
    return translate(language, 'serviceVmToday');
  }
  if (diffDays === 1) {
    return translate(language, 'serviceVmTomorrow');
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

function contributorRolePriority(roleKey: ServiceContributorViewModel['roleKey']) {
  switch (roleKey) {
    case 'limiting_now':
      return 0;
    case 'next_likely_limiter':
      return 1;
    default:
      return 2;
  }
}

function contributorRoleKeyAtIndex(index: number): ServiceContributorViewModel['roleKey'] {
  if (index === 0) {
    return 'limiting_now';
  }
  if (index === 1) {
    return 'next_likely_limiter';
  }
  return 'safe_contributor';
}

function contributorRoleLabel(
  language: AppLanguage,
  roleKey: ServiceContributorViewModel['roleKey'],
) {
  if (roleKey === 'limiting_now') {
    return translate(language, 'serviceVmRoleLimitingNow');
  }
  if (roleKey === 'next_likely_limiter') {
    return translate(language, 'serviceVmRoleNextLikelyLimiter');
  }
  return translate(language, 'serviceVmRoleSafeContributor');
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
            headline: translate(language, 'serviceVmReceiptLoggedFor', {
              name: contributor.sku.name,
            }),
            timingLabel: formatSenaDate(entry.input.observedAt, language),
            quantityLabel:
              signal.approximateReceiptQuantity != null
                ? translate(language, 'serviceVmReceiptQuantity', {
                    count: formatWholeNumber(signal.approximateReceiptQuantity, language),
                  })
                : translate(language, 'serviceVmReceiptLoggedFallback'),
            detail: translate(language, 'serviceVmRestorationReceiptDetail'),
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
      ? contributor.sku.leadTimeStdDays != null
        ? translateUiLiteral(language, '{date} ± {days}', {
            date: formatSenaDate(expectedReceiptAt, language),
            days: formatCompactDays(contributor.sku.leadTimeStdDays, language),
          })
        : formatSenaDate(expectedReceiptAt, language)
      : translate(language, 'serviceVmEtaPending');

    events.push({
      key: `open:${skuId}:${signal.observedAt}`,
      skuId,
      skuName: contributor.sku.name,
      state: 'open',
      headline: translate(language, 'serviceVmInboundMayRestore', {
        name: contributor.sku.name,
      }),
      timingLabel,
      quantityLabel:
        signal.quantity != null
          ? translate(language, 'serviceVmInboundQuantity', {
              count: formatWholeNumber(signal.quantity, language),
            })
          : translate(language, 'serviceVmInboundQuantityPending'),
      detail: contributor.isBottleneck
        ? translate(language, 'serviceVmRestorationBottleneckDetail')
        : translate(language, 'serviceVmRestorationSupportDetail'),
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
  usdToKhrExchangeRate = DEFAULT_USD_TO_KHR_EXCHANGE_RATE,
  detail,
  language,
  observations,
  reports,
  service,
  snapshot,
  workspaceSummary,
}: {
  currency: AppCurrency;
  usdToKhrExchangeRate?: number;
  detail: SenaServiceDetail | null;
  language: AppLanguage;
  observations: SenaObservationRecord[];
  reports: StockReport[];
  service: ServiceRecord;
  snapshot: InventorySnapshot;
  workspaceSummary: SenaWorkspaceSummary | null;
}): ServiceDetailViewModel {
  const customerCommercial = buildCommercialEntitySnapshots({
    observations,
    party: 'customer',
    rangeDays: 30,
    endAt: workspaceSummary?.latestObservedAt ?? observations.at(-1)?.input.observedAt ?? null,
  });
  const linkedSkus = serviceLinkedSkus(service, snapshot);
  const rankedContributors = rankedServiceContributors(service, snapshot);
  const contributorBySkuId = new Map(rankedContributors.map((entry) => [entry.sku.skuId, entry]));
  const sellableNow = computeServiceSellableUnits(service, snapshot);
  const commercialKey = `service:${service.serviceId}`;
  const openCustomerOrders = Math.max(0, customerCommercial.pendingQuantityByEntity.get(commercialKey) ?? 0);
  const completedCustomerOrders = Math.max(0, customerCommercial.realizedWindowQuantityByEntity.get(commercialKey) ?? 0);
  const refundedCustomerOrders = Math.max(0, customerCommercial.reversalWindowQuantityByEntity.get(commercialKey) ?? 0);
  const canceledCustomerOrders = Math.max(0, customerCommercial.canceledWindowQuantityByEntity.get(commercialKey) ?? 0);
  const blockedOpenOrders = openCustomerOrders > 0 && sellableNow <= 0 ? openCustomerOrders : 0;
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
    usdToKhrExchangeRate,
  });

  const contributorDrafts = rankedContributors.map((entry, index) => {
    const relatedInbound = restoration.find((event) => event.skuId === entry.sku.skuId && event.state === 'open');
    const relatedReceipt = restoration.find((event) => event.skuId === entry.sku.skuId && event.state === 'logged');
    const contributorDetail = detail?.contributors.find((contributor) => contributor.skuId === entry.sku.skuId) ?? null;
    const reorderRecommendation = formatSenaReorderQuantity(contributorDetail?.reorderQuantity, language);
    const restockGuidance = reorderRecommendation.recommendationIssued
      ? restockGuidanceLabel(language, entry.sku.name, reorderRecommendation.recommendedUnits, 'recommended')
      : reorderRecommendation.optionalOrderLabel
        ? restockGuidanceLabel(language, entry.sku.name, reorderRecommendation.recommendedUnits, 'optional')
        : null;
    const limitingProbability = clamp(
      contributorDetail?.bottleneckProbability ?? entry.insight?.stockoutRisk ?? entry.insight?.reorderTriggerProbability ?? 0,
      0,
      1,
    );
    const usageProbability = clamp(contributorDetail?.usageProbability ?? 0, 0, 1);

    return {
      skuId: entry.sku.skuId,
      name: entry.sku.name,
      imagePath: entry.sku.imagePath?.trim() || null,
      baseRank: index + 1,
      limitingProbability,
      usageProbability,
      snapshotIsBottleneck: entry.isBottleneck,
      daysOfCoverLabel: entry.insight?.daysOfCover != null ? formatSenaDays(entry.insight.daysOfCover, language) : translate(language, 'serviceVmCoveragePending'),
      stockLabel: translate(language, 'serviceVmInStock', {
        count: formatWholeNumber(entry.sku.unitsInStock, language),
      }),
      healthLabel: serviceStateLabel(fragility.currentState),
      inboundLabel: relatedInbound?.timingLabel ?? relatedReceipt?.timingLabel ?? translate(language, 'serviceVmNoLinkedInbound'),
      recentSignal:
        relatedReceipt?.headline ??
        (entry.isBottleneck
          ? translate(language, 'serviceVmBindingNow', { name: entry.sku.name })
          : translate(language, 'serviceVmNotBindingYet', { name: entry.sku.name })),
      recoveryNote:
        relatedInbound?.detail ??
        (entry.isBottleneck
          ? translate(language, 'serviceVmRecoveryFast')
          : translate(language, 'serviceVmRecoveryMonitor')),
      restockGuidance,
      openSkuHref: `/catalog/skus/${entry.sku.skuId}`,
    };
  });
  const contributors = [...contributorDrafts]
    .sort((left, right) => {
      if (right.limitingProbability !== left.limitingProbability) {
        return right.limitingProbability - left.limitingProbability;
      }
      if (right.usageProbability !== left.usageProbability) {
        return right.usageProbability - left.usageProbability;
      }
      if (left.snapshotIsBottleneck !== right.snapshotIsBottleneck) {
        return Number(right.snapshotIsBottleneck) - Number(left.snapshotIsBottleneck);
      }
      return left.baseRank - right.baseRank;
    })
    .map<ServiceContributorViewModel>((entry, index) => {
      const roleKey = contributorRoleKeyAtIndex(index);
      const roleLabel = contributorRoleLabel(language, roleKey);
      return {
        skuId: entry.skuId,
        name: entry.name,
        statusLabel: roleLabel,
        roleKey,
        roleLabel,
        probabilityLabel: formatSenaPercent(entry.limitingProbability, language),
        usageLabel: formatSenaPercent(entry.usageProbability, language),
        daysOfCoverLabel: entry.daysOfCoverLabel,
        stockLabel: entry.stockLabel,
        healthLabel: entry.healthLabel,
        inboundLabel: entry.inboundLabel,
        recentSignal: entry.recentSignal,
        recoveryNote: entry.recoveryNote,
        restockGuidance: entry.restockGuidance,
        limitingProbability: entry.limitingProbability,
        orderRank: index + 1,
        openSkuHref: entry.openSkuHref,
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
    const evidenceSummary =
      relevantEvidence[0]?.summary ?? translateUiLiteral(language, 'No direct evidence in this period.');
    const changeLines = relevantEvidence.length
      ? relevantEvidence.slice(0, 3).map((entry) => entry.summary)
      : relevantReports.length
        ? [translateUiLiteral(language, 'A stock update changed contributor pressure.')]
        : [translateUiLiteral(language, 'No meaningful change was recorded in this period.')];

    return {
      key: `interval:${interval.intervalIndex}`,
      intervalIndex: interval.intervalIndex,
      label: formatSenaDate(interval.endAt, language),
      caption: translateRegimeLabel(language, interval.dominantRegime),
      regimeKey: interval.dominantRegime,
      dominantRegime: translateRegimeLabel(language, interval.dominantRegime),
      endAt: interval.endAt,
      priceLabel: formatCurrency(price, currency, language, usdToKhrExchangeRate),
      priceValue: displayMoneyFromUsd(price, currency, usdToKhrExchangeRate),
      demandValue,
      demandLabel: formatNumber(demandValue, language),
      sellableValue: snapshotSellable,
      sellableLabel: formatWholeNumber(snapshotSellable, language),
      gapLabel:
        snapshotSellable > 0
          ? translateUiLiteral(language, '{count} at risk', {
              count: formatWholeNumber(Math.max(0, Math.round(demandValue - snapshotSellable)), language),
            })
          : translate(language, 'serviceVmAvailabilityBlocked'),
      tensionLabel:
        tone === 'blocked'
          ? translateUiLiteral(language, 'Demand is higher than service capacity')
          : tone === 'tight'
            ? translateUiLiteral(language, 'Demand is close to service capacity')
            : translateUiLiteral(language, 'Service capacity stays ahead of demand'),
      tone,
      evidenceSummary,
      bindingLabel: topContributor?.sku.name ?? translateUiLiteral(language, 'No active blocker'),
      changeHeadline:
        tone === 'blocked'
          ? translateUiLiteral(language, 'Service capacity was constrained in this period')
          : tone === 'tight'
            ? translateUiLiteral(language, 'Service capacity was close to being constrained')
            : translateUiLiteral(language, 'Service capacity stayed resilient in this period'),
      changeLines,
    };
  });

  const evidence = timelineEvidence.slice(0, 7).map<ServiceEvidenceEntryViewModel>((entry) => ({
    id: entry.report.reportId,
    title: entry.summary,
    observedAt: formatServiceEvidenceObservedAt(entry.report.reportedAt, language),
    detail: entry.secondary ?? translateUiLiteral(language, 'This update was included in the service availability picture.'),
    chips: entry.types.map((type) => {
      switch (type) {
        case 'service-unavailable':
          return translateUiLiteral(language, 'Service unavailable');
        case 'price-adjustment':
          return translateUiLiteral(language, 'Price changed');
        case 'linked-sku-change':
          return translateUiLiteral(language, 'Stock update');
        case 'ranking-update':
          return translateUiLiteral(language, 'Selling order update');
        case 'limiter-shift':
          return translateUiLiteral(language, 'Main blocker changed');
      }
    }),
  }));
  if (openCustomerOrders > 0 || completedCustomerOrders > 0 || refundedCustomerOrders > 0 || canceledCustomerOrders > 0) {
    evidence.unshift({
      id: `commercial:${service.serviceId}`,
      title: blockedOpenOrders > 0
        ? translateUiLiteral(language, '{count} open service orders are blocked', {
            count: formatWholeNumber(blockedOpenOrders, language),
          })
        : translateUiLiteral(language, '{count} open service orders are active', {
            count: formatWholeNumber(openCustomerOrders, language),
          }),
      observedAt: customerCommercial.latestObservedAtByEntity.get(commercialKey)
        ? formatServiceEvidenceObservedAt(customerCommercial.latestObservedAtByEntity.get(commercialKey)!, language)
        : translateUiLiteral(language, 'Recent'),
      detail: translateUiLiteral(language, '{completed} completed recently · {issues} refund or cancellation signal', {
        completed: formatWholeNumber(completedCustomerOrders, language),
        issues: formatWholeNumber(refundedCustomerOrders + canceledCustomerOrders, language),
      }),
      chips: [
        translateUiLiteral(language, 'Customer pending'),
        ...(completedCustomerOrders > 0 ? [translateUiLiteral(language, 'Customer completed')] : []),
        ...(refundedCustomerOrders > 0 || canceledCustomerOrders > 0 ? [translateUiLiteral(language, 'Refund / cancel')] : []),
      ],
    });
  }

  const dependencyImpact = contributors.map<ServiceDependencyImpactRow>((entry) => ({
    skuId: entry.skuId,
    name: entry.name,
    imagePath: entry.imagePath,
    role: entry.roleLabel,
    status: `${entry.stockLabel} · ${entry.statusLabel.toLowerCase()}`,
    blockedOpenOrders: blockedOpenOrders > 0
      ? translateUiLiteral(language, '{count} open order{suffix} exposed here', {
          count: formatWholeNumber(blockedOpenOrders, language),
          suffix: blockedOpenOrders === 1 ? '' : 's',
        })
      : translateUiLiteral(language, 'No blocked open orders tied to this SKU right now'),
    daysOfCover: entry.daysOfCoverLabel,
    limitingProbability: entry.probabilityLabel,
    inboundRecoveryNote: entry.inboundLabel,
    pendingSupplyRelief: entry.restockGuidance
      ? translateUiLiteral(language, 'Supplier relief is available if this contributor is reordered')
      : translateUiLiteral(language, 'No supplier relief has been logged yet'),
    restockGuidance: entry.restockGuidance,
    openSkuHref: entry.openSkuHref,
  }));

  const primarySkuHref = topContributor ? `/catalog/skus/${topContributor.sku.skuId}` : '/catalog';
  const inboundCount = restoration.filter((entry) => entry.state === 'open').length;
  const overviewReason = [
    translate(language, 'serviceVmOverviewRisk', {
      risk: formatSenaPercent(disruptionRisk, language),
      name: topContributor?.sku.name ?? translate(language, 'serviceVmNoActiveBottleneck'),
    }),
    nextDisruptionDays != null
      ? translate(language, 'serviceVmOverviewNextBlocker', {
          name: topContributor?.sku.name ?? translate(language, 'serviceVmRoleNextLikelyLimiter'),
          days: formatSenaDays(nextDisruptionDays, language),
        })
      : translate(language, 'serviceVmOverviewTimingPending'),
    inboundCount > 0
      ? translate(language, 'serviceVmOverviewIncoming', {
          count: formatWholeNumber(inboundCount, language),
          noun: translate(language, inboundCount === 1 ? 'serviceVmOverviewIncomingSingular' : 'serviceVmOverviewIncomingPlural'),
        })
      : translate(language, 'serviceVmOverviewNoIncoming'),
  ];
  const nextTouchDate = restoration.find((entry) => entry.state === 'open')?.timingLabel ?? null;
  const restockRecoveryPath = contributors
    .filter((entry) => entry.restockGuidance)
    .map((entry) => entry.restockGuidance as string);

  return {
    identity: {
      name: service.name,
      serviceId: service.serviceId,
      availabilityLabel: fragility.currentState === 'blocked' ? translate(language, 'serviceVmAvailabilityBlocked') : translate(language, 'serviceVmAvailabilityAvailable'),
      fragilityLabel: fragility.currentState === 'available' ? translate(language, 'serviceVmFragilityStable') : translate(language, 'serviceVmFragilityFragile'),
      confidenceLabel:
        fragility.confidence === 'high'
          ? translate(language, 'serviceVmConfidenceHigh')
          : fragility.confidence === 'medium'
            ? translate(language, 'serviceVmConfidenceMedium')
            : translate(language, 'serviceVmConfidenceLow'),
    },
    hero: {
      headline: translate(language, 'serviceVmHeroHeadline', {
        count: formatWholeNumber(sellableNow, language),
      }),
      summary: translate(language, 'serviceVmHeroSummary', {
        low: formatWholeNumber(credibleBand.low, language),
        high: formatWholeNumber(credibleBand.high, language),
        bottleneck: topContributor?.sku.name ?? translate(language, 'serviceVmNoActiveBottleneck'),
        risk: formatSenaPercent(disruptionRisk, language),
        nextBlocker: nextDisruptionDays != null
          ? translate(language, 'serviceVmHeroNextBlockerTimed', {
              days: formatSenaDays(nextDisruptionDays, language),
            })
          : translate(language, 'serviceVmHeroNextBlockerPending'),
        inbound: inboundCount > 0
          ? translate(language, 'serviceVmHeroInboundVisible', {
              count: formatWholeNumber(inboundCount, language),
              noun: translate(language, inboundCount === 1 ? 'serviceVmInboundSingular' : 'serviceVmInboundPlural'),
            })
          : translate(language, 'serviceVmHeroNoInboundVisible'),
      }),
    },
    actions: {
      primarySkuHref,
      editServiceHref: `/catalog/services/${service.serviceId}/edit`,
      latestObservedAt: workspaceSummary?.latestObservedAt ?? observations.at(-1)?.input.observedAt ?? reports.at(-1)?.reportedAt ?? null,
      noBottleneckHint: translate(language, 'serviceVmNoLimitingContributor'),
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
      { key: 'sellable-now', label: translate(language, 'serviceVmRibbonSellableNow'), value: formatWholeNumber(sellableNow, language) },
      { key: 'open-orders', label: translateUiLiteral(language, 'Open orders'), value: formatWholeNumber(openCustomerOrders, language) },
      { key: 'completed-window', label: translateUiLiteral(language, 'Completed'), value: formatWholeNumber(completedCustomerOrders, language) },
      { key: 'demand-per-day', label: translate(language, 'serviceVmRibbonDemandPerDay'), value: formatNumber(activityMean, language) },
      { key: 'bottleneck', label: translate(language, 'serviceVmRibbonMainBlocker'), value: topContributor?.sku.name ?? '—' },
      { key: 'revenue-at-risk', label: translate(language, 'serviceVmRibbonRevenueAtRisk'), value: formatCurrency(revenueAtRiskValue, currency, language, usdToKhrExchangeRate) },
      { key: 'next-disruption', label: translate(language, 'serviceVmRibbonNextRiskPoint'), value: nextDisruptionDays != null ? formatSenaDays(nextDisruptionDays, language) : translate(language, 'serviceVmPending') },
      {
        key: 'linked-health',
        label: translate(language, 'serviceVmRibbonLinkedSkuHealth'),
        value: rankedContributors.length ? `${formatWholeNumber(riskCount, language)} risk / ${formatWholeNumber(rankedContributors.length, language)}` : translate(language, 'serviceVmNoLinks'),
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
          ? translate(language, 'serviceVmOverviewTitleUnblock', { name: service.name.toLowerCase() })
          : translate(language, 'serviceVmOverviewTitleProtect', { name: service.name.toLowerCase() }),
      overviewReason,
      customerCommitments: [
        translateUiLiteral(language, '{count} open service order{suffix}', {
          count: formatWholeNumber(openCustomerOrders, language),
          suffix: openCustomerOrders === 1 ? '' : 's',
        }),
        translateUiLiteral(language, '{count} completed in the recent window', {
          count: formatWholeNumber(completedCustomerOrders, language),
        }),
        blockedOpenOrders > 0
          ? translateUiLiteral(language, '{count} blocked by linked SKU pressure', {
              count: formatWholeNumber(blockedOpenOrders, language),
            })
          : translateUiLiteral(language, 'No open service order is currently blocked'),
        refundedCustomerOrders > 0 || canceledCustomerOrders > 0
          ? translateUiLiteral(language, '{count} refunds or cancellations need review', {
              count: formatWholeNumber(refundedCustomerOrders + canceledCustomerOrders, language),
            })
          : translateUiLiteral(language, 'No recent refund or cancellation signal'),
      ],
      bottleneckStack: [...contributors]
        .sort((left, right) => {
          const roleDelta = contributorRolePriority(left.roleKey) - contributorRolePriority(right.roleKey);
          if (roleDelta !== 0) {
            return roleDelta;
          }
          return left.orderRank - right.orderRank;
        })
        .slice(0, 4)
        .map((entry) => ({
          skuId: entry.skuId,
          label: entry.name,
          role: entry.roleLabel,
        })),
      recoveryPath:
        restockRecoveryPath.length > 0
          ? [
              ...restockRecoveryPath,
              ...restoration.map((entry) => `${entry.headline} · ${entry.timingLabel}`),
            ].slice(0, 3)
          : restoration.length > 0
            ? restoration.slice(0, 3).map((entry) => `${entry.headline} · ${entry.timingLabel}`)
            : contributors.slice(0, 3).map((entry) => `${entry.name} · ${entry.daysOfCoverLabel}`),
      nextTouch: {
        dateLabel: relativeDayLabel(nextTouchDate, language),
        reason:
          restoration.find((entry) => entry.state === 'open')?.headline ??
          (topContributor
            ? translate(language, 'serviceVmNextTouchReview', { name: topContributor.sku.name })
            : translate(language, 'serviceVmNextTouchReviewLinks')),
      },
    },
  };
}
