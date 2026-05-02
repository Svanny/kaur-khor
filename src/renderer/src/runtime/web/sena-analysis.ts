import { DEFAULT_SENA_ENGINE_PARAMETERS, normalizeSenaEngineParameters } from '@shared/ipc';
import type { SenaEngineParameters, SenaTriggerRunPayload } from '@shared/ipc';
import type {
  SenaAnalysisRunRecord,
  SenaCatalog,
  SenaDiagnostics,
  SenaIntervalPosterior,
  SenaLeadTimeHint,
  SenaLeadTimePosteriorPoint,
  SenaObservationFingerprint,
  SenaObservationPage,
  SenaObservationPageRequest,
  SenaObservationRecord,
  SenaOrderSignal,
  SenaRecordActivityEntry,
  SenaRecordUpdateAnchor,
  SenaRecordUpdateContext,
  SenaRegimePosteriorPoint,
  SenaReorderQuantityRecommendation,
  SenaServiceDetail,
  SenaServiceSalesSnapshot,
  SenaSkuDetail,
  SenaSkuSummary,
  SenaStockSnapshot,
  SenaTrajectoryPoint,
  SenaWorkspaceSummary,
} from '@shared/sena';

const DEFAULT_OWNER_SUB = 'browser-owner';
const MS_PER_DAY = 86_400_000;

export type BrowserSenaAnalysisInput = {
  ownerSub?: string;
  runId: string;
  createdAt: string;
  catalog: SenaCatalog;
  observations: SenaObservationRecord[];
  payload?: SenaTriggerRunPayload;
};

export type BrowserSenaAnalysisOutput = {
  run: SenaAnalysisRunRecord;
  workspaceSummary: SenaWorkspaceSummary;
  diagnostics: SenaDiagnostics;
  skuDetails: Record<string, SenaSkuDetail>;
  serviceDetails: Record<string, SenaServiceDetail>;
};

function clone<T>(value: T): T {
  return structuredClone(value);
}

function clamp(value: number, min = 0, max = 1) {
  return Math.min(max, Math.max(min, value));
}

function finite(value: number | null | undefined, fallback = 0) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function sortedObservations(observations: SenaObservationRecord[], direction: 'asc' | 'desc' = 'asc') {
  const multiplier = direction === 'asc' ? 1 : -1;
  return [...observations].sort((left, right) => {
    const timeDelta = left.input.observedAt.localeCompare(right.input.observedAt);
    if (timeDelta !== 0) {
      return timeDelta * multiplier;
    }
    return left.observationId.localeCompare(right.observationId) * multiplier;
  });
}

export function browserSenaObservationFingerprint(
  observations: SenaObservationRecord[],
): SenaObservationFingerprint {
  const latest = sortedObservations(observations, 'desc')[0];
  return {
    count: observations.length,
    latestObservedAt: latest?.input.observedAt ?? null,
    latestObservationId: latest?.observationId ?? null,
  };
}

function recordUpdateAnchor<T>(
  observation: SenaObservationRecord,
  value: T,
): SenaRecordUpdateAnchor<T> {
  return {
    observationId: observation.observationId,
    observedAt: observation.input.observedAt,
    value: clone(value),
  };
}

export function browserSenaRecordUpdateContext(
  observations: SenaObservationRecord[],
): SenaRecordUpdateContext {
  const sorted = sortedObservations(observations, 'desc');
  const latestStockBySku: SenaRecordUpdateContext['latestStockBySku'] = {};
  const latestRetailSaleBySku: SenaRecordUpdateContext['latestRetailSaleBySku'] = {};
  const latestServiceSaleByService: SenaRecordUpdateContext['latestServiceSaleByService'] = {};
  const latestOrderBySku: SenaRecordUpdateContext['latestOrderBySku'] = {};
  const latestReceiptBySku: SenaRecordUpdateContext['latestReceiptBySku'] = {};
  const latestTicketsById: SenaRecordUpdateContext['latestTicketsById'] = {};
  const latestDeliveryFeeByBucket: SenaRecordUpdateContext['latestDeliveryFeeByBucket'] = {};
  const recentActivity: SenaRecordActivityEntry[] = [];

  for (const observation of sorted) {
    for (const snapshot of observation.input.stockSnapshot) {
      latestStockBySku[snapshot.skuId] ??= recordUpdateAnchor(observation, snapshot);
      recentActivity.push({
        activityId: `${observation.observationId}:stock:${snapshot.skuId}`,
        activityType: 'stock',
        entityId: snapshot.skuId,
        observationId: observation.observationId,
        observedAt: observation.input.observedAt,
        summary: 'Stock counted',
      });
    }
    for (const sale of observation.input.retailSalesSnapshot ?? []) {
      if (sale.unitsSold > 0) {
        latestRetailSaleBySku[sale.skuId] ??= recordUpdateAnchor(observation, sale);
        recentActivity.push({
          activityId: `${observation.observationId}:retail-sale:${sale.skuId}`,
          activityType: 'retail_sale',
          entityId: sale.skuId,
          observationId: observation.observationId,
          observedAt: observation.input.observedAt,
          summary: 'Retail sale captured',
        });
      }
    }
    for (const sale of observation.input.serviceSalesSnapshot ?? []) {
      if (sale.unitsSold > 0) {
        latestServiceSaleByService[sale.serviceId] ??= recordUpdateAnchor(observation, sale);
        recentActivity.push({
          activityId: `${observation.observationId}:service-sale:${sale.serviceId}`,
          activityType: 'service_sale',
          entityId: sale.serviceId,
          observationId: observation.observationId,
          observedAt: observation.input.observedAt,
          summary: 'Service sale captured',
        });
      }
    }
    for (const signal of observation.input.orderSignals ?? []) {
      if (signal.orderPlaced || signal.approximateOrderQuantity != null) {
        latestOrderBySku[signal.skuId] ??= {
          ...recordUpdateAnchor(observation, signal),
          observedAt: signal.placementTimestamp ?? observation.input.observedAt,
        };
        recentActivity.push({
          activityId: `${observation.observationId}:order:${signal.skuId}`,
          activityType: 'order',
          entityId: signal.skuId,
          observationId: observation.observationId,
          observedAt: signal.placementTimestamp ?? observation.input.observedAt,
          summary: 'Supplier order captured',
        });
      }
      if (signal.receiptArrived || signal.approximateReceiptQuantity != null) {
        latestReceiptBySku[signal.skuId] ??= {
          ...recordUpdateAnchor(observation, signal),
          observedAt: signal.receiptTimestamp ?? observation.input.observedAt,
        };
        recentActivity.push({
          activityId: `${observation.observationId}:receipt:${signal.skuId}`,
          activityType: 'receipt',
          entityId: signal.skuId,
          observationId: observation.observationId,
          observedAt: signal.receiptTimestamp ?? observation.input.observedAt,
          summary: 'Supplier receipt captured',
        });
      }
    }
    if (observation.input.deliveryFee) {
      latestDeliveryFeeByBucket[observation.input.deliveryFee.bucket] ??= recordUpdateAnchor(
        observation,
        observation.input.deliveryFee,
      );
      recentActivity.push({
        activityId: `${observation.observationId}:delivery-fee:${observation.input.deliveryFee.bucket}`,
        activityType: 'delivery_fee',
        entityId: observation.input.deliveryFee.bucket,
        observationId: observation.observationId,
        observedAt: observation.input.observedAt,
        summary: 'Delivery fee captured',
      });
    }
    for (const event of observation.input.ticketEvents ?? []) {
      const summary = {
        ticketId: event.ticketId,
        ticketFamily: event.ticketFamily,
        lifecycle: event.lifecycle,
        stage: event.stage,
        revision: event.revision,
        eventType: event.eventType,
        occurredAt: event.occurredAt,
        nextTouchAt: event.nextTouchAt,
        party: event.party,
        lines: event.lines,
        deliveryFee: event.deliveryFee,
        note: event.note,
      };
      latestTicketsById[event.ticketId] ??= {
        observationId: observation.observationId,
        observedAt: event.occurredAt,
        value: summary,
      };
      recentActivity.push({
        activityId: `${observation.observationId}:ticket:${event.ticketId}:${event.revision}`,
        activityType: 'ticket',
        entityId: event.ticketId,
        eventType: event.eventType,
        lifecycle: event.lifecycle,
        observationId: observation.observationId,
        observedAt: event.occurredAt,
        summary: `${event.ticketFamily === 'customer' ? 'Customer' : event.ticketFamily === 'supplier' ? 'Supplier' : 'Adjustment'} ticket updated`,
        ticketFamily: event.ticketFamily,
        ticketId: event.ticketId,
        detail: event.note,
      });
      if (event.deliveryFee) {
        latestDeliveryFeeByBucket[event.deliveryFee.bucket] ??= {
          observationId: observation.observationId,
          observedAt: event.occurredAt,
          value: event.deliveryFee,
        };
      }
    }
  }

  const fingerprint = browserSenaObservationFingerprint(observations);
  const openTicketSummaries = Object.values(latestTicketsById)
    .map((anchor) => anchor.value)
    .filter((ticket) => ticket.lifecycle === 'open')
    .sort((left, right) => right.occurredAt.localeCompare(left.occurredAt) || right.ticketId.localeCompare(left.ticketId));
  return {
    observationFingerprint: fingerprint,
    latestObservedAt: fingerprint.latestObservedAt,
    latestStockBySku,
    latestRetailSaleBySku,
    latestServiceSaleByService,
    latestOrderBySku,
    latestReceiptBySku,
    openTicketsByFamily: {
      customer: openTicketSummaries.filter((ticket) => ticket.ticketFamily === 'customer'),
      supplier: openTicketSummaries.filter((ticket) => ticket.ticketFamily === 'supplier'),
    },
    latestTicketsById,
    latestDeliveryFeeByBucket,
    recentActivity: recentActivity
      .sort((left, right) => right.observedAt.localeCompare(left.observedAt) || right.activityId.localeCompare(left.activityId))
      .slice(0, 24),
  };
}

export function browserSenaObservationPage(
  observations: SenaObservationRecord[],
  request?: SenaObservationPageRequest,
): SenaObservationPage {
  const limit = Math.min(500, Math.max(1, request?.limit ?? 100));
  const sorted = sortedObservations(observations, 'desc');
  const filtered = request?.beforeObservedAt
    ? sorted.filter((observation) => {
        if (observation.input.observedAt < request.beforeObservedAt!) {
          return true;
        }
        return observation.input.observedAt === request.beforeObservedAt
          && request.beforeObservationId != null
          && observation.observationId < request.beforeObservationId;
      })
    : sorted;
  const rows = filtered.slice(0, limit + 1);
  const pageObservations = rows.slice(0, limit);
  const hasOlder = rows.length > limit;
  const last = hasOlder ? pageObservations.at(-1) : null;
  const fingerprint = browserSenaObservationFingerprint(observations);
  return {
    observations: clone(pageObservations),
    nextCursor: last ? { observedAt: last.input.observedAt, observationId: last.observationId } : null,
    hasOlder,
    totalCount: observations.length,
    latestObservedAt: fingerprint.latestObservedAt,
  };
}

function elapsedDays(observations: SenaObservationRecord[]) {
  if (observations.length < 2) {
    return Math.max(1, observations.length);
  }
  const first = Date.parse(observations[0]!.input.observedAt);
  const last = Date.parse(observations[observations.length - 1]!.input.observedAt);
  if (!Number.isFinite(first) || !Number.isFinite(last) || last <= first) {
    return Math.max(1, observations.length - 1);
  }
  return Math.max(1, (last - first) / MS_PER_DAY);
}

function latestStock(observations: SenaObservationRecord[], skuId: string, fallbackCost: number, fallbackPrice: number | null): SenaStockSnapshot {
  for (const observation of sortedObservations(observations, 'desc')) {
    const snapshot = observation.input.stockSnapshot.find((entry) => entry.skuId === skuId);
    if (snapshot) {
      return snapshot;
    }
  }
  return {
    skuId,
    unitsInStock: 0,
    costPerUnit: fallbackCost,
    productPrice: fallbackPrice,
  };
}

function latestLeadTimeHint(observations: SenaObservationRecord[], skuId: string): SenaLeadTimeHint | null {
  for (const observation of sortedObservations(observations, 'desc')) {
    const hint = observation.input.leadTimeHints.find((entry) => entry.skuId === skuId);
    if (hint) {
      return hint;
    }
  }
  return null;
}

function leadTimeForSku(
  observations: SenaObservationRecord[],
  skuId: string,
  skuHintMean: number | null,
  skuHintStd: number | null,
) {
  const latestHint = latestLeadTimeHint(observations, skuId);
  const mean = Math.max(1, finite(latestHint?.typicalDays, finite(skuHintMean, 7)));
  const hintedStd = latestHint?.highDays != null && latestHint.lowDays != null
    ? Math.max(0.5, (latestHint.highDays - latestHint.lowDays) / 4)
    : finite(skuHintStd, mean * 0.25);
  return {
    mean,
    std: Math.max(0.5, hintedStd),
    variabilityClass: latestHint?.variabilityClass ?? null,
  };
}

function serviceSkuUsage(catalog: SenaCatalog, serviceId: string, skuId: string) {
  const mask = catalog.sharingMask.find((entry) =>
    entry.enabled && entry.serviceId === serviceId && entry.skuId === skuId
  );
  return mask?.usageProbability ?? 0;
}

function skuDemandForObservation(catalog: SenaCatalog, observation: SenaObservationRecord, skuId: string) {
  const retail = observation.input.retailSalesSnapshot
    ?.filter((sale) => sale.skuId === skuId)
    .reduce((sum, sale) => sum + finite(sale.unitsSold), 0) ?? 0;
  const service = observation.input.serviceSalesSnapshot
    ?.reduce((sum, sale) => sum + finite(sale.unitsSold) * serviceSkuUsage(catalog, sale.serviceId, skuId), 0) ?? 0;
  return { retail, service, total: retail + service };
}

function orderSignalForObservation(observation: SenaObservationRecord, skuId: string): SenaOrderSignal | null {
  return observation.input.orderSignals.find((signal) => signal.skuId === skuId) ?? null;
}

function reorderQuantity(
  requiredUnits: number,
  needProbability: number,
  parameters: SenaEngineParameters,
): SenaReorderQuantityRecommendation {
  const ungated = Math.max(0, requiredUnits);
  const issued = needProbability >= parameters.needProbabilityGate && ungated > 0;
  return {
    recommendedUnits: issued ? Math.ceil(ungated) : 0,
    ungatedRecommendedUnits: ungated,
    likelyRangeLow: Math.max(0, Math.floor(ungated * Math.max(0.5, parameters.intervalLowQuantile + 0.5))),
    likelyRangeHigh: Math.max(0, Math.ceil(ungated * (1 + parameters.intervalHighQuantile * 0.5))),
    needProbability,
    recommendationIssued: issued,
    recommendationQuantile: parameters.recommendationQuantile,
    intervalLowQuantile: parameters.intervalLowQuantile,
    intervalHighQuantile: parameters.intervalHighQuantile,
    needProbabilityGate: parameters.needProbabilityGate,
    reviewDelayDays: parameters.reviewDelayDays,
  };
}

function regimeForObservation(observation: SenaObservationRecord, stockoutRisk: number) {
  if (observation.input.regimeHint) {
    return observation.input.regimeHint;
  }
  if (stockoutRisk >= 0.8) {
    return 'stockout_constrained';
  }
  return 'normal';
}

function regimeProbabilities(dominantRegime: string, stockoutRisk: number) {
  const stockout = dominantRegime === 'stockout_constrained' ? Math.max(0.55, stockoutRisk) : stockoutRisk * 0.25;
  const normal = dominantRegime === 'normal' ? Math.max(0.55, 1 - stockoutRisk) : Math.max(0.05, 1 - stockout);
  return {
    normal,
    spike: dominantRegime === 'spike' ? 0.7 : 0.05,
    lull: dominantRegime === 'lull' ? 0.7 : 0.05,
    stockout_constrained: stockout,
    promo: dominantRegime === 'promo' ? 0.7 : 0.05,
    correction: dominantRegime === 'correction' ? 0.7 : 0.02,
  };
}

function detailWindow<T>(items: T[], beforeIntervalIndex: number | null | undefined, limit = 20, getIndex: (item: T) => number) {
  const boundedLimit = Math.max(1, Math.min(250, limit));
  const filtered = beforeIntervalIndex == null
    ? items
    : items.filter((item) => getIndex(item) < beforeIntervalIndex);
  const page = filtered.slice(-boundedLimit);
  return {
    page,
    hasOlder: filtered.length > page.length,
    nextBeforeIntervalIndex: filtered.length > page.length ? getIndex(page[0]!) : null,
    latestIntervalIndex: items.length > 0 ? getIndex(items[items.length - 1]!) : null,
  };
}

export function pageBrowserSenaSkuDetail(
  detail: SenaSkuDetail,
  beforeIntervalIndex?: number | null,
  limit = 20,
) {
  const demand = detailWindow(detail.demandPosterior, beforeIntervalIndex, limit, (item) => item.intervalIndex);
  const indexes = new Set(demand.page.map((item) => item.intervalIndex));
  return {
    detail: {
      ...detail,
      inventoryPosterior: detail.inventoryPosterior.filter((_, index) => indexes.has(index)),
      demandPosterior: demand.page,
      pipelinePosterior: detail.pipelinePosterior.filter((item) => indexes.has(item.intervalIndex)),
      leadTimePosterior: detail.leadTimePosterior.filter((item) => indexes.has(item.intervalIndex)),
    },
    pageLimit: Math.max(1, Math.min(250, limit)),
    hasOlder: demand.hasOlder,
    nextBeforeIntervalIndex: demand.nextBeforeIntervalIndex,
    latestIntervalIndex: demand.latestIntervalIndex,
  };
}

export function pageBrowserSenaServiceDetail(
  detail: SenaServiceDetail,
  beforeIntervalIndex?: number | null,
  limit = 20,
) {
  const timeline = detailWindow(detail.regimeTimeline, beforeIntervalIndex, limit, (item) => item.intervalIndex);
  return {
    detail: {
      ...detail,
      regimeTimeline: timeline.page,
    },
    pageLimit: Math.max(1, Math.min(250, limit)),
    hasOlder: timeline.hasOlder,
    nextBeforeIntervalIndex: timeline.nextBeforeIntervalIndex,
    latestIntervalIndex: timeline.latestIntervalIndex,
  };
}

export function runBrowserSenaAnalysis(input: BrowserSenaAnalysisInput): BrowserSenaAnalysisOutput {
  const ownerSub = input.ownerSub ?? DEFAULT_OWNER_SUB;
  const algorithmVersion = input.payload?.algorithmVersion ?? input.payload?.parameters?.algorithmVersion ?? DEFAULT_SENA_ENGINE_PARAMETERS.algorithmVersion;
  const parameters = normalizeSenaEngineParameters({
    ...input.payload?.parameters,
    algorithmVersion,
  });
  const observations = sortedObservations(input.observations, 'asc');
  const spanDays = elapsedDays(observations);
  const latestObservedAt = observations.at(-1)?.input.observedAt ?? null;
  const diagnosticsRegimeHistory: SenaRegimePosteriorPoint[] = [];
  const skuDetails: Record<string, SenaSkuDetail> = {};
  const skuSummaries: SenaSkuSummary[] = [];

  for (const sku of input.catalog.skus) {
    const stock = latestStock(observations, sku.skuId, sku.costPerUnit, sku.productPrice);
    const totalDemand = observations.reduce((sum, observation) =>
      sum + skuDemandForObservation(input.catalog, observation, sku.skuId).total, 0);
    const demandPerDayMean = totalDemand / spanDays;
    const leadTime = leadTimeForSku(observations, sku.skuId, sku.leadTimeMeanDaysHint, sku.leadTimeStdDaysHint);
    const expectedLeadTimeDemand = demandPerDayMean * leadTime.mean;
    const safetyStock = Math.max(0, 1.65 * leadTime.std * Math.max(0.1, demandPerDayMean));
    const reorderPoint = expectedLeadTimeDemand + safetyStock;
    const latestUnits = finite(stock.unitsInStock);
    const stockoutRisk = latestUnits <= 0
      ? 1
      : clamp((reorderPoint - latestUnits + demandPerDayMean) / Math.max(1, reorderPoint + demandPerDayMean));
    const daysOfCover = demandPerDayMean > 0 ? latestUnits / demandPerDayMean : null;
    const reorderTriggerProbability = stockoutRisk;
    const reorder = reorderQuantity(reorderPoint - latestUnits, reorderTriggerProbability, parameters);
    const latestRegime = regimeForObservation(observations.at(-1) ?? {
      observationId: 'empty',
      ownerSub,
      input: {
        observedAt: input.createdAt,
        stockSnapshot: [],
        serviceRankings: [],
        retailRankings: [],
        serviceStockouts: [],
        retailStockouts: [],
        orderSignals: [],
        servicePrices: [],
        retailPrices: [],
        leadTimeHints: [],
        notes: null,
      },
    }, stockoutRisk);
    const summary: SenaSkuSummary = {
      skuId: sku.skuId,
      latestPosteriorUnits: latestUnits,
      credibleIntervalLow: Math.max(0, latestUnits - Math.max(1, demandPerDayMean * 2)),
      credibleIntervalHigh: latestUnits + Math.max(1, demandPerDayMean * 2),
      demandPerDayMean,
      stockoutRisk,
      daysOfCover,
      expectedLeadTimeDemand,
      safetyStock,
      reorderPoint,
      reorderTriggerProbability,
      reorderQuantity: reorder,
      leadTimeMeanDays: leadTime.mean,
      leadTimeStdDays: leadTime.std,
      regimeProbabilities: regimeProbabilities(latestRegime, stockoutRisk),
    };
    const inventoryPosterior: SenaTrajectoryPoint[] = [];
    const demandPosterior: SenaIntervalPosterior[] = [];
    const pipelinePosterior = [] as SenaSkuDetail['pipelinePosterior'];
    const leadTimePosterior: SenaLeadTimePosteriorPoint[] = [];
    observations.forEach((observation, index) => {
      const observedStock = observation.input.stockSnapshot.find((entry) => entry.skuId === sku.skuId);
      const demand = skuDemandForObservation(input.catalog, observation, sku.skuId);
      const signal = orderSignalForObservation(observation, sku.skuId);
      const previous = observations[index - 1];
      const deltaDays = previous
        ? Math.max(1 / 24, (Date.parse(observation.input.observedAt) - Date.parse(previous.input.observedAt)) / MS_PER_DAY)
        : 1;
      const intervalRegime = regimeForObservation(observation, stockoutRisk);
      const probabilities = regimeProbabilities(intervalRegime, stockoutRisk);
      inventoryPosterior.push({
        at: observation.input.observedAt,
        mean: finite(observedStock?.unitsInStock, latestUnits),
        low: Math.max(0, finite(observedStock?.unitsInStock, latestUnits) - Math.max(1, demand.total)),
        high: finite(observedStock?.unitsInStock, latestUnits) + Math.max(1, demand.total),
      });
      demandPosterior.push({
        intervalIndex: index,
        startAt: previous?.input.observedAt ?? observation.input.observedAt,
        endAt: observation.input.observedAt,
        deltaDays,
        serviceDemandMean: demand.service / deltaDays,
        retailDemandMean: demand.retail / deltaDays,
        unconstrainedDemandMean: demand.total / deltaDays,
        realizedConsumptionMean: demand.total,
        lostDemandMean: stockoutRisk > 0.8 ? demandPerDayMean * deltaDays * stockoutRisk : 0,
        adjustmentsMean: observation.input.adjustmentSignals
          ?.filter((entry) => entry.skuId === sku.skuId)
          .reduce((sum, entry) => sum + finite(entry.quantityDelta), 0) ?? 0,
        receiptsMean: finite(signal?.approximateReceiptQuantity),
        preClampInventoryMean: finite(observedStock?.unitsInStock, latestUnits),
        inventoryPositionMean: finite(observedStock?.unitsInStock, latestUnits) + finite(signal?.approximateOrderQuantity),
      });
      pipelinePosterior.push({
        intervalIndex: index,
        inTransitMean: signal?.orderPlaced && !signal.receiptArrived ? finite(signal.approximateOrderQuantity) : 0,
        orderProbability: signal?.orderPlaced ? 1 : 0,
        orderQuantityMean: finite(signal?.approximateOrderQuantity),
        receiptQuantityMean: finite(signal?.approximateReceiptQuantity),
        ageDaysMean: signal?.placementTimestamp
          ? Math.max(0, (Date.parse(observation.input.observedAt) - Date.parse(signal.placementTimestamp)) / MS_PER_DAY)
          : 0,
      });
      leadTimePosterior.push({
        intervalIndex: index,
        logMeanDays: Math.log(leadTime.mean),
        logStdDays: Math.log(Math.max(1, leadTime.std)),
        logVarianceDaysSquared: Math.log(Math.max(1, leadTime.std ** 2)),
        meanDays: leadTime.mean,
        stdDays: leadTime.std,
        varianceDaysSquared: leadTime.std ** 2,
        shapeSigma: leadTime.std / leadTime.mean,
        observedVariabilityClass: leadTime.variabilityClass,
        observedRelativeWidth: leadTime.std / leadTime.mean,
      });
      if (!diagnosticsRegimeHistory[index]) {
        diagnosticsRegimeHistory[index] = {
          intervalIndex: index,
          startAt: previous?.input.observedAt ?? observation.input.observedAt,
          endAt: observation.input.observedAt,
          dominantRegime: intervalRegime,
          regimeProbabilities: probabilities,
        };
      }
    });
    skuSummaries.push(summary);
    skuDetails[sku.skuId] = {
      summary,
      inventoryPosterior,
      demandPosterior,
      pipelinePosterior,
      leadTimePosterior,
    };
  }

  const highRiskSkuIds = skuSummaries
    .filter((summary) => summary.stockoutRisk >= 0.5 || summary.reorderQuantity?.recommendationIssued)
    .sort((left, right) => right.stockoutRisk - left.stockoutRisk)
    .map((summary) => summary.skuId);
  const pendingReorderCount = skuSummaries.filter((summary) => summary.reorderQuantity?.recommendationIssued).length;
  const topRegime = diagnosticsRegimeHistory.at(-1)?.dominantRegime ?? 'not_enough_data';
  const workspaceSummary: SenaWorkspaceSummary = {
    ownerSub,
    runId: input.runId,
    latestObservedAt,
    skuCount: input.catalog.skus.length,
    serviceCount: input.catalog.services.length,
    intervalCount: observations.length,
    pendingReorderCount,
    topRegime,
    highRiskSkuIds,
    skuSummaries,
  };
  const serviceDetails: Record<string, SenaServiceDetail> = {};
  for (const service of input.catalog.services) {
    const totalUnits = observations.reduce((sum, observation) =>
      sum + finite(observation.input.serviceSalesSnapshot?.find((sale: SenaServiceSalesSnapshot) => sale.serviceId === service.serviceId)?.unitsSold), 0);
    const activityMean = totalUnits / spanDays;
    const contributors = input.catalog.sharingMask
      .filter((entry) => entry.enabled && entry.serviceId === service.serviceId)
      .map((entry) => {
        const summary = skuSummaries.find((skuSummary) => skuSummary.skuId === entry.skuId);
        return {
          skuId: entry.skuId,
          usageProbability: entry.usageProbability ?? 1,
          bottleneckProbability: summary?.stockoutRisk ?? 0,
          reorderQuantity: summary?.reorderQuantity ?? null,
        };
      });
    serviceDetails[service.serviceId] = {
      serviceId: service.serviceId,
      activityMean,
      activityIntervalLow: Math.max(0, activityMean * 0.75),
      activityIntervalHigh: activityMean * 1.25,
      bottleneckProbability: contributors.reduce((max, contributor) => Math.max(max, contributor.bottleneckProbability), 0),
      contributors,
      regimeTimeline: diagnosticsRegimeHistory,
    };
  }
  const diagnostics: SenaDiagnostics = {
    effectiveSampleSizeMean: Math.max(0, Math.min(parameters.particleCount, observations.length * 32)),
    resamplingCount: observations.length > 1 ? Math.floor(observations.length / 8) : 0,
    smoothingEnabled: parameters.smoothingEnabled,
    changePointProbability: topRegime === 'normal' || topRegime === 'not_enough_data' ? 0 : 0.65,
    latestChangePointProbability: topRegime === 'normal' || topRegime === 'not_enough_data' ? 0 : 0.65,
    seasonalityActive: observations.length >= 14,
    posteriorPredictiveErrorMean: skuSummaries.length > 0
      ? skuSummaries.reduce((sum, summary) => sum + summary.stockoutRisk, 0) / skuSummaries.length
      : 0,
    coverageEstimate: clamp(1 - highRiskSkuIds.length / Math.max(1, skuSummaries.length), 0, 1),
    regimeHistory: diagnosticsRegimeHistory,
  };
  const completedAt = input.createdAt;
  const run: SenaAnalysisRunRecord = {
    runId: input.runId,
    ownerSub,
    algorithmVersion,
    status: 'succeeded',
    observationCount: observations.length,
    createdAt: input.createdAt,
    completedAt,
    summary: workspaceSummary,
    diagnostics,
    primaryArtifactKey: null,
    error: null,
  };
  return {
    run,
    workspaceSummary,
    diagnostics,
    skuDetails,
    serviceDetails,
  };
}

export function runBrowserSenaAnalysisJson(inputJson: string): string {
  return JSON.stringify(runBrowserSenaAnalysis(JSON.parse(inputJson) as BrowserSenaAnalysisInput));
}
