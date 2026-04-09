import type { AppLanguage } from '@shared/inventory';
import type {
  SenaCatalog,
  SenaLeadTimeVariabilityClass,
  SenaObservationRecord,
  SenaSkuDetail,
  SenaSkuSummary,
  SenaWorkspaceSummary,
} from '@shared/sena';
import { deriveLeadTimeVariabilityClass } from '@shared/sena-lead-time';
import { formatWholeNumber } from '@/lib/format';
import {
  formatSenaReorderQuantity,
  isSenaReorderQuantityIssued,
  type SenaReorderQuantityDisplay,
} from '@/lib/sena-reorder-quantity';
import { latestObservationAt } from '@/routes/observation-payload';
import { formatSenaDate, formatSenaDays, formatSenaPercent, formatSenaUnits } from '@/routes/sku-detail/format';
import { getTranslation } from '@/lib/translations';

export type OverviewTaskFilter =
  | 'all'
  | 'to_order'
  | 'awaiting_receipt'
  | 'follow_up_today'
  | 'ready_to_receive'
  | 'received_today';

export type OverviewTaskAction =
  | 'log_order'
  | 'update_eta'
  | 'follow_up'
  | 'receive'
  | 'review'
  | 'start_update'
  | 'remind_tomorrow';

export type OverviewTaskDrawerMode =
  | 'not_ordered'
  | 'ordered_waiting'
  | 'eta_changed'
  | 'goods_received';

export type OverviewDrawerBandId =
  | 'real_life'
  | 'timing'
  | 'order_shape'
  | 'optional_learning'
  | 'receipt_details'
  | 'preview'
  | 'note'
  | 'next_steps';

interface OverviewTaskBase {
  id: string;
  kind: 'sku' | 'stale_update_reminder';
  stateLabel: string;
  statusTone: 'danger' | 'warning' | 'success' | 'info' | 'neutral';
  action: OverviewTaskAction;
  actionLabel: string;
  whyNow: string;
  whyDetail: string;
  etaLabel: string;
  etaDetail: string;
  confidenceCue: string;
  heartbeat: string[];
  nextSteps: string[];
}

export interface OverviewSkuTask extends OverviewTaskBase {
  kind: 'sku';
  id: string;
  skuId: string;
  skuName: string;
  state: Exclude<OverviewTaskFilter, 'all'>;
  stateLabel: string;
  statusTone: 'danger' | 'warning' | 'success' | 'info' | 'neutral';
  action: OverviewTaskAction;
  actionLabel: string;
  defaultDrawerMode: OverviewTaskDrawerMode;
  serviceImpact: string;
  whyNow: string;
  whyDetail: string;
  etaLabel: string;
  etaDetail: string;
  confidenceCue: string;
  heartbeat: string[];
  nextSteps: string[];
  linkedServiceNames: string[];
  currentStock: number;
  costPerUnit: number;
  productPrice: number | null;
  soldAsProduct: boolean;
  expectedArrivalDate: string | null;
  arrivalWindowStart: string | null;
  arrivalWindowEnd: string | null;
  leadTimeMeanDays: number | null;
  leadTimeStdDays: number | null;
  variabilityClass: SenaLeadTimeVariabilityClass | null;
  suggestedOrderQuantity: number;
  recentOrderQuantity: number | null;
  recentReceiptQuantity: number | null;
  latestObservationAt: string | null;
  latestOrderAt: string | null;
  latestReceiptAt: string | null;
  hasRecentPriceSignal: boolean;
  regimeKey: string;
  regimeLabel: string;
  stockoutRisk: number;
  reorderTriggerProbability: number;
  reorderRecommendation: SenaReorderQuantityDisplay;
  daysOfCover: number | null;
}

export interface OverviewStaleUpdateReminderTask extends OverviewTaskBase {
  kind: 'stale_update_reminder';
  snoozeAction: 'remind_tomorrow';
  snoozeActionLabel: string;
  staleDays: number;
  latestObservationAt: string;
}

export type OverviewTask = OverviewSkuTask | OverviewStaleUpdateReminderTask;

export interface OverviewInTransitRow {
  id: string;
  skuId: string;
  name: string;
  etaLabel: string;
}

export interface OverviewReceiptRow {
  id: string;
  skuId: string;
  name: string;
  quantityLabel: string;
  receivedAt: string;
  receivedLabel: string;
}

export interface OverviewSignalRow {
  id: string;
  text: string;
}

export interface OverviewModel {
  tasks: OverviewTask[];
  inTransit: OverviewInTransitRow[];
  recentReceipts: OverviewReceiptRow[];
  signals: OverviewSignalRow[];
  todayCounts: {
    toOrder: number;
    followUpToday: number;
    readyToReceive: number;
  };
}

interface ObservationSkuSignals {
  latestObservationAt: string | null;
  latestOrderAt: string | null;
  latestOrderQuantity: number | null;
  latestReceiptAt: string | null;
  latestReceiptQuantity: number | null;
  latestPriceAt: string | null;
  latestLeadTimeObservedAt: string | null;
}

interface ReceiptWindowSummary {
  etaLabel: string;
  etaDetail: string;
  confidenceCue: string;
  arrivalWindowStart: string | null;
  arrivalWindowEnd: string | null;
  expectedArrivalDate: string | null;
  overdue: boolean;
  dueNow: boolean;
}

function enabledLinkedServices(catalog: SenaCatalog, skuId: string) {
  return catalog.sharingMask
    .filter((entry) => entry.enabled && entry.skuId === skuId)
    .map((entry) => catalog.services.find((service) => service.serviceId === entry.serviceId)?.name)
    .filter((value): value is string => Boolean(value));
}

function compactList(values: string[], max = 2) {
  if (values.length === 0) {
    return 'unmapped services';
  }
  if (values.length <= max) {
    return values.join(values.length === 2 ? ' and ' : ', ');
  }
  return `${values.slice(0, max).join(', ')} +${values.length - max} more`;
}

function translate(language: AppLanguage, key: Parameters<typeof getTranslation>[1], variables?: Parameters<typeof getTranslation>[2]) {
  return getTranslation(language, key, variables);
}

function todayStart() {
  const value = new Date();
  return new Date(value.getFullYear(), value.getMonth(), value.getDate());
}

function startOfLocalDay(value: string | Date) {
  const date = value instanceof Date ? new Date(value) : new Date(value);
  if (Number.isNaN(date.valueOf())) {
    return null;
  }
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function diffCalendarDays(value: string | null, reference = new Date()) {
  if (!value) {
    return null;
  }
  const valueStart = startOfLocalDay(value);
  const referenceStart = startOfLocalDay(reference);
  if (!valueStart || !referenceStart) {
    return null;
  }
  return Math.round((referenceStart.getTime() - valueStart.getTime()) / 86_400_000);
}

function isSameLocalDay(value: string | null, reference = new Date()) {
  if (!value) {
    return false;
  }
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) {
    return false;
  }
  return (
    date.getFullYear() === reference.getFullYear() &&
    date.getMonth() === reference.getMonth() &&
    date.getDate() === reference.getDate()
  );
}

function addDays(value: string | null, days: number | null) {
  if (!value || days == null || !Number.isFinite(days)) {
    return null;
  }
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) {
    return null;
  }
  date.setDate(date.getDate() + days);
  return date.toISOString();
}

function diffDaysFromNow(value: string | null) {
  if (!value) {
    return null;
  }
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) {
    return null;
  }
  return (date.getTime() - Date.now()) / 86_400_000;
}

function titleCase(value: string | null | undefined) {
  if (!value) {
    return 'Normal';
  }
  return value
    .split(/[_\s-]+/g)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function summarizeObservations(observations: SenaObservationRecord[], skuId: string): ObservationSkuSignals {
  const sorted = [...observations].sort(
    (left, right) =>
      new Date(right.input.observedAt).getTime() - new Date(left.input.observedAt).getTime(),
  );

  let latestObservationAt: string | null = null;
  let latestOrderAt: string | null = null;
  let latestOrderQuantity: number | null = null;
  let latestReceiptAt: string | null = null;
  let latestReceiptQuantity: number | null = null;
  let latestPriceAt: string | null = null;
  let latestLeadTimeObservedAt: string | null = null;

  for (const observation of sorted) {
    const observedAt = observation.input.observedAt;
    const hasSkuSnapshot = observation.input.stockSnapshot.some((entry) => entry.skuId === skuId);
    const hasSkuSignal = observation.input.orderSignals.some((entry) => entry.skuId === skuId);
    const hasSkuPrice = observation.input.retailPrices.some((entry) => entry.skuId === skuId);
    const hasSkuLeadTime = observation.input.leadTimeHints.some((entry) => entry.skuId === skuId);

    if (!latestObservationAt && (hasSkuSnapshot || hasSkuSignal || hasSkuPrice || hasSkuLeadTime)) {
      latestObservationAt = observedAt;
    }

    const orderSignal = observation.input.orderSignals.find((entry) => entry.skuId === skuId && entry.orderPlaced);
    if (!latestOrderAt && orderSignal) {
      latestOrderAt = observedAt;
      latestOrderQuantity = orderSignal.approximateOrderQuantity ?? null;
    }

    const receiptSignal = observation.input.orderSignals.find((entry) => entry.skuId === skuId && entry.receiptArrived);
    if (!latestReceiptAt && receiptSignal) {
      latestReceiptAt = observedAt;
      latestReceiptQuantity = receiptSignal.approximateReceiptQuantity ?? null;
    }

    if (!latestPriceAt && hasSkuPrice) {
      latestPriceAt = observedAt;
    }

    if (!latestLeadTimeObservedAt && hasSkuLeadTime) {
      latestLeadTimeObservedAt = observedAt;
    }
  }

  return {
    latestObservationAt,
    latestOrderAt,
    latestOrderQuantity,
    latestReceiptAt,
    latestReceiptQuantity,
    latestPriceAt,
    latestLeadTimeObservedAt,
  };
}

function latestVariabilityClass(summary: SenaSkuSummary, detail: SenaSkuDetail | null) {
  const latestLeadTime = detail?.leadTimePosterior.at(-1) ?? null;
  if (latestLeadTime?.observedVariabilityClass) {
    return latestLeadTime.observedVariabilityClass;
  }
  const rangeLow = Math.max(summary.leadTimeMeanDays - summary.leadTimeStdDays, 0.5);
  const rangeHigh = Math.max(summary.leadTimeMeanDays + summary.leadTimeStdDays, rangeLow);
  return deriveLeadTimeVariabilityClass({
    lowDays: rangeLow,
    highDays: rangeHigh,
    variabilityClass: null,
  });
}

function confidenceCue(value: SenaLeadTimeVariabilityClass | null, overdue: boolean, language: AppLanguage) {
  if (overdue) {
    return translate(language, 'overviewTimingLate');
  }
  switch (value) {
    case 'very_tight':
    case 'tight':
      return translate(language, 'overviewTimingTight');
    case 'wide':
    case 'very_wide':
      return translate(language, 'overviewTimingWide');
    case 'normal':
      return translate(language, 'overviewTimingNormal');
    default:
      return translate(language, 'overviewTimingPending');
  }
}

function receiptWindowSummary({
  detail,
  language,
  latestOrderAt,
  summary,
  workspaceLatestObservedAt,
}: {
  detail: SenaSkuDetail | null;
  language: AppLanguage;
  latestOrderAt: string | null;
  summary: SenaSkuSummary;
  workspaceLatestObservedAt: string | null;
}): ReceiptWindowSummary | null {
  const latestPipeline = detail?.pipelinePosterior.at(-1) ?? null;
  const latestLeadTime = detail?.leadTimePosterior.at(-1) ?? null;
  const inTransitMean = latestPipeline?.inTransitMean ?? 0;
  const hasOpenPipeline = inTransitMean > 0.5 || latestOrderAt != null;

  if (!hasOpenPipeline) {
    return null;
  }

  const meanDays = latestLeadTime?.meanDays ?? summary.leadTimeMeanDays;
  const stdDays = latestLeadTime?.stdDays ?? summary.leadTimeStdDays;
  const baseDate = latestOrderAt ?? workspaceLatestObservedAt;

  if (meanDays == null || stdDays == null || !baseDate) {
    return {
      etaLabel: translate(language, 'overviewReceiptAwaitingSupplierUpdate'),
      etaDetail: translate(language, 'overviewReceiptAwaitingSupplierDetail'),
      confidenceCue: translate(language, 'overviewTimingPending'),
      arrivalWindowStart: null,
      arrivalWindowEnd: null,
      expectedArrivalDate: null,
      overdue: false,
      dueNow: false,
    };
  }

  const expectedArrivalDate = addDays(baseDate, meanDays);
  const arrivalWindowStart = addDays(baseDate, Math.max(meanDays - stdDays, 0));
  const arrivalWindowEnd = addDays(baseDate, meanDays + stdDays);
  const dueNow = (() => {
    if (!arrivalWindowStart || !arrivalWindowEnd) {
      return false;
    }
    const now = Date.now();
    return now >= new Date(arrivalWindowStart).getTime() && now <= new Date(arrivalWindowEnd).getTime();
  })();
  const overdue = arrivalWindowEnd ? Date.now() > new Date(arrivalWindowEnd).getTime() : false;
  const variabilityClass = latestVariabilityClass(summary, detail);

  return {
    etaLabel: overdue
      ? translate(language, 'overviewEtaExpectedOn', {
          date: formatSenaDate(expectedArrivalDate, language),
        })
      : translate(language, 'overviewEtaExpectedWindow', {
          date: formatSenaDate(expectedArrivalDate, language),
          days: formatWholeNumber(stdDays, language),
        }),
    etaDetail: overdue
      ? translate(language, 'overviewReceiptWindowPassed')
      : dueNow
        ? translate(language, 'overviewReceiptWindowOpen')
        : arrivalWindowStart && arrivalWindowEnd
          ? translate(language, 'overviewReceiptWindowRange', {
              start: formatSenaDate(arrivalWindowStart, language),
              end: formatSenaDate(arrivalWindowEnd, language),
            })
          : translate(language, 'overviewReceiptWindowPending'),
    confidenceCue: confidenceCue(variabilityClass, overdue, language),
    arrivalWindowStart,
    arrivalWindowEnd,
    expectedArrivalDate,
    overdue,
    dueNow,
  };
}

function taskStateLabel(value: Exclude<OverviewTaskFilter, 'all'>, language: AppLanguage) {
  switch (value) {
    case 'to_order':
      return translate(language, 'overviewTaskStateToOrder');
    case 'awaiting_receipt':
      return translate(language, 'overviewTaskStateAwaitingReceipt');
    case 'follow_up_today':
      return translate(language, 'overviewTaskStateFollowUpToday');
    case 'ready_to_receive':
      return translate(language, 'overviewTaskStateReadyToReceive');
    case 'received_today':
      return translate(language, 'overviewTaskStateReceivedToday');
  }
}

function taskPriority(value: Exclude<OverviewTaskFilter, 'all'>) {
  switch (value) {
    case 'to_order':
      return 0;
    case 'follow_up_today':
      return 1;
    case 'ready_to_receive':
      return 2;
    case 'awaiting_receipt':
      return 3;
    case 'received_today':
      return 4;
  }
}

function fallbackRecommendedOrderQuantity(summary: SenaSkuSummary, detail: SenaSkuDetail | null) {
  const inTransit = detail?.pipelinePosterior.at(-1)?.inTransitMean ?? 0;
  const lowGap = summary.reorderPoint - summary.credibleIntervalHigh - inTransit;
  const highGap = summary.reorderPoint + summary.safetyStock - summary.credibleIntervalLow - inTransit;
  return Math.max(0, Math.ceil(Math.max(lowGap, highGap)));
}

function serviceImpactLine({
  language,
  linkedServiceNames,
  state,
  stockoutRisk,
}: {
  language: AppLanguage;
  linkedServiceNames: string[];
  state: Exclude<OverviewTaskFilter, 'all'>;
  stockoutRisk: number;
}) {
  const names = compactList(linkedServiceNames);

  if (linkedServiceNames.length === 0) {
    return translate(language, 'overviewTaskServiceImpactNone');
  }

  if (state === 'ready_to_receive' || state === 'received_today') {
    return translate(language, 'overviewTaskServiceImpactMayRestore', { services: names });
  }

  if (state === 'to_order' && stockoutRisk >= 0.7) {
    return translate(language, 'overviewTaskServiceImpactBlocks', { services: names });
  }

  return translate(language, 'overviewTaskServiceImpactAffects', { services: names });
}

function nextStepsForTask({
  language,
  expectedArrivalDate,
  arrivalWindowStart,
  arrivalWindowEnd,
  state,
}: {
  language: AppLanguage;
  expectedArrivalDate: string | null;
  arrivalWindowStart: string | null;
  arrivalWindowEnd: string | null;
  state: Exclude<OverviewTaskFilter, 'all'>;
}) {
  if (state === 'to_order') {
    const reviewDate = addDays(new Date().toISOString(), 1);
    return [
      translate(language, 'overviewTaskNextOrderWaiting'),
      reviewDate
        ? translate(language, 'overviewTaskNextOrderReviewOn', {
            date: formatSenaDate(reviewDate, language),
          })
        : translate(language, 'overviewTaskNextOrderReviewSoon'),
      translate(language, 'overviewTaskNextOrderUrgent'),
    ];
  }

  const arrivalWindowLabel =
    arrivalWindowStart && arrivalWindowEnd
      ? `${formatSenaDate(arrivalWindowStart, 'en')}-${formatSenaDate(arrivalWindowEnd, 'en')}`
      : expectedArrivalDate
        ? formatSenaDate(expectedArrivalDate, 'en')
        : 'pending';

  return [
    expectedArrivalDate
      ? translate(language, 'overviewTaskNextArrivalRemindOn', {
          date: formatSenaDate(expectedArrivalDate, language),
        })
      : translate(language, 'overviewTaskNextArrivalWatch'),
    translate(language, 'overviewTaskNextArrivalWindow', { window: arrivalWindowLabel }),
    translate(language, 'overviewTaskNextArrivalFollowUp'),
  ];
}

function taskNarrative({
  language,
  linkedServiceNames,
  receiptWindow,
  summary,
  taskState,
}: {
  language: AppLanguage;
  linkedServiceNames: string[];
  receiptWindow: ReceiptWindowSummary | null;
  summary: SenaSkuSummary;
  taskState: Exclude<OverviewTaskFilter, 'all'>;
}) {
  switch (taskState) {
    case 'to_order':
      return {
        action: 'log_order' as OverviewTaskAction,
        actionLabel: translate(language, 'overviewTaskActionLogOrder'),
        defaultDrawerMode: 'not_ordered' as OverviewTaskDrawerMode,
        statusTone: 'danger' as const,
        whyNow:
          summary.stockoutRisk >= 0.7 && linkedServiceNames.length > 0
            ? translate(language, 'overviewTaskWhyOrderBlocksService')
            : translate(language, 'overviewTaskWhyOrderSoon'),
        whyDetail: translate(language, 'overviewTaskWhyDetailOrder', {
          cover: summary.daysOfCover != null ? formatSenaDays(summary.daysOfCover, language) : '—',
          probability: formatSenaPercent(summary.reorderTriggerProbability, language),
        }),
      };
    case 'awaiting_receipt':
      return {
        action: 'update_eta' as OverviewTaskAction,
        actionLabel: translate(language, 'overviewTaskActionUpdateEta'),
        defaultDrawerMode: 'ordered_waiting' as OverviewTaskDrawerMode,
        statusTone: 'warning' as const,
        whyNow: translate(language, 'overviewTaskWhyOrderedAlready'),
        whyDetail: receiptWindow?.etaDetail ?? translate(language, 'overviewTaskWhyReceiptLoop'),
      };
    case 'follow_up_today':
      return {
        action: 'follow_up' as OverviewTaskAction,
        actionLabel: translate(language, 'overviewTaskActionFollowUp'),
        defaultDrawerMode: 'eta_changed' as OverviewTaskDrawerMode,
        statusTone: 'warning' as const,
        whyNow: translate(language, 'overviewTaskWhyCheckSupplier'),
        whyDetail: receiptWindow?.etaDetail ?? translate(language, 'overviewTaskWhyReceiptWindowPassed'),
      };
    case 'ready_to_receive':
      return {
        action: 'receive' as OverviewTaskAction,
        actionLabel: translate(language, 'overviewTaskActionReceive'),
        defaultDrawerMode: 'goods_received' as OverviewTaskDrawerMode,
        statusTone: 'info' as const,
        whyNow: translate(language, 'overviewTaskWhyReceiptDue'),
        whyDetail: receiptWindow?.etaDetail ?? translate(language, 'overviewTaskWhyReceiptWindowOpen'),
      };
    case 'received_today':
      return {
        action: 'review' as OverviewTaskAction,
        actionLabel: translate(language, 'overviewTaskActionReview'),
        defaultDrawerMode: 'goods_received' as OverviewTaskDrawerMode,
        statusTone: 'success' as const,
        whyNow: translate(language, 'overviewTaskWhyReceiptLogged'),
        whyDetail: translate(language, 'overviewTaskWhyReceiptLoggedDetail'),
      };
  }
}

function deriveTaskState({
  latestOrderAt,
  latestReceiptAt,
  receiptWindow,
  summary,
}: {
  latestOrderAt: string | null;
  latestReceiptAt: string | null;
  receiptWindow: ReceiptWindowSummary | null;
  summary: SenaSkuSummary;
}): Exclude<OverviewTaskFilter, 'all'> | null {
  const hasOpenOrder =
    latestOrderAt != null &&
    (latestReceiptAt == null || new Date(latestOrderAt).getTime() > new Date(latestReceiptAt).getTime());
  const receiptLoggedToday =
    latestReceiptAt != null &&
    isSameLocalDay(latestReceiptAt) &&
    (latestOrderAt == null || new Date(latestReceiptAt).getTime() >= new Date(latestOrderAt).getTime());

  if (receiptLoggedToday) {
    return 'received_today';
  }

  if (isSenaReorderQuantityIssued(summary.reorderQuantity)) {
    return 'to_order';
  }

  if (hasOpenOrder || receiptWindow != null) {
    if (receiptWindow?.overdue) {
      return 'follow_up_today';
    }
    if (receiptWindow?.dueNow) {
      return 'ready_to_receive';
    }
    return 'awaiting_receipt';
  }

  if (
    summary.reorderTriggerProbability >= 0.55 ||
    summary.stockoutRisk >= 0.65 ||
    (summary.daysOfCover != null && summary.daysOfCover <= 2.5)
  ) {
    return 'to_order';
  }

  return null;
}

function buildTask({
  catalog,
  detail,
  language,
  observations,
  summary,
  workspaceLatestObservedAt,
}: {
  catalog: SenaCatalog;
  detail: SenaSkuDetail | null;
  language: AppLanguage;
  observations: SenaObservationRecord[];
  summary: SenaSkuSummary;
  workspaceLatestObservedAt: string | null;
}) {
  const sku = catalog.skus.find((entry) => entry.skuId === summary.skuId);
  if (!sku) {
    return null;
  }

  const observationSignals = summarizeObservations(observations, summary.skuId);
  const receiptWindow = receiptWindowSummary({
    detail,
    language,
    latestOrderAt: observationSignals.latestOrderAt,
    summary,
    workspaceLatestObservedAt,
  });
  const state = deriveTaskState({
    latestOrderAt: observationSignals.latestOrderAt,
    latestReceiptAt: observationSignals.latestReceiptAt,
    receiptWindow,
    summary,
  });

  if (!state) {
    return null;
  }

  const linkedServiceNames = enabledLinkedServices(catalog, summary.skuId);
  const fallbackOrderQuantity = fallbackRecommendedOrderQuantity(summary, detail);
  const reorderRecommendation = formatSenaReorderQuantity(
    summary.reorderQuantity,
    language,
    fallbackOrderQuantity,
  );
  const narrative = taskNarrative({
    language,
    linkedServiceNames,
    receiptWindow,
    summary,
    taskState: state,
  });
  const variabilityClass = latestVariabilityClass(summary, detail);
  const dominantRegime = Object.entries(summary.regimeProbabilities).sort(
    (left, right) => right[1] - left[1],
  )[0]?.[0] ?? 'normal';
  const etaLabel =
    state === 'to_order'
      ? translate(language, 'overviewTaskEtaNotOrderedYet')
      : state === 'received_today'
        ? translate(language, 'overviewTaskEtaReceivedToday')
        : (receiptWindow?.etaLabel ?? translate(language, 'overviewReceiptAwaitingSupplierUpdate'));
  const etaDetail =
    state === 'to_order'
      ? translate(language, 'overviewTaskEtaNotOrderedDetail')
      : state === 'received_today'
        ? observationSignals.latestReceiptAt
          ? translate(language, 'overviewTaskEtaReceivedLogged', {
              date: formatSenaDate(observationSignals.latestReceiptAt, language),
            })
          : translate(language, 'overviewTaskEtaReceivedFallback')
        : (receiptWindow?.etaDetail ?? translate(language, 'overviewTaskEtaWaitingSignal'));

  return {
    kind: 'sku',
    id: summary.skuId,
    skuId: summary.skuId,
    skuName: sku.name,
    state,
    stateLabel: taskStateLabel(state, language),
    statusTone: narrative.statusTone,
    action: narrative.action,
    actionLabel: narrative.actionLabel,
    defaultDrawerMode: narrative.defaultDrawerMode,
    serviceImpact: serviceImpactLine({
      language,
      linkedServiceNames,
      state,
      stockoutRisk: summary.stockoutRisk,
    }),
    whyNow: narrative.whyNow,
    whyDetail: narrative.whyDetail,
    etaLabel,
    etaDetail,
    confidenceCue:
      state === 'to_order' || state === 'received_today'
        ? summary.stockoutRisk >= 0.7
          ? translate(language, 'overviewTaskConfidencePriority')
          : translate(language, 'overviewTaskConfidenceWatch')
        : (receiptWindow?.confidenceCue ?? confidenceCue(variabilityClass, false, language)),
    heartbeat: [
      translate(language, 'overviewTaskHeartbeatOnHand', {
        low: formatSenaUnits(summary.credibleIntervalLow, language),
        high: formatSenaUnits(summary.credibleIntervalHigh, language),
      }),
      translate(language, 'overviewTaskHeartbeatCover', {
        cover: summary.daysOfCover != null ? formatSenaDays(summary.daysOfCover, language) : '—',
      }),
      translate(language, 'overviewTaskHeartbeatReorder', {
        probability: formatSenaPercent(summary.reorderTriggerProbability, language),
      }),
      linkedServiceNames.length > 0
        ? serviceImpactLine({ language, linkedServiceNames, state, stockoutRisk: summary.stockoutRisk })
        : translate(language, 'overviewTaskHeartbeatNoServiceExposure'),
      observationSignals.latestPriceAt
        ? translate(language, 'overviewTaskHeartbeatRecentPrice', {
            date: formatSenaDate(observationSignals.latestPriceAt, language),
          })
        : translate(language, 'overviewTaskHeartbeatPattern', {
            pattern: titleCase(dominantRegime),
          }),
    ],
    nextSteps: nextStepsForTask({
      language,
      expectedArrivalDate: receiptWindow?.expectedArrivalDate ?? null,
      arrivalWindowStart: receiptWindow?.arrivalWindowStart ?? null,
      arrivalWindowEnd: receiptWindow?.arrivalWindowEnd ?? null,
      state,
    }),
    linkedServiceNames,
    currentStock: summary.latestPosteriorUnits,
    costPerUnit: sku.costPerUnit,
    productPrice: sku.productPrice,
    soldAsProduct: sku.soldAsProduct,
    expectedArrivalDate: receiptWindow?.expectedArrivalDate ?? null,
    arrivalWindowStart: receiptWindow?.arrivalWindowStart ?? null,
    arrivalWindowEnd: receiptWindow?.arrivalWindowEnd ?? null,
    leadTimeMeanDays: detail?.leadTimePosterior.at(-1)?.meanDays ?? summary.leadTimeMeanDays,
    leadTimeStdDays: detail?.leadTimePosterior.at(-1)?.stdDays ?? summary.leadTimeStdDays,
    variabilityClass,
    suggestedOrderQuantity: reorderRecommendation.recommendedUnits,
    recentOrderQuantity: observationSignals.latestOrderQuantity,
    recentReceiptQuantity: observationSignals.latestReceiptQuantity,
    latestObservationAt: observationSignals.latestObservationAt,
    latestOrderAt: observationSignals.latestOrderAt,
    latestReceiptAt: observationSignals.latestReceiptAt,
    hasRecentPriceSignal: Boolean(observationSignals.latestPriceAt),
    regimeKey: dominantRegime,
    regimeLabel: titleCase(dominantRegime),
    stockoutRisk: summary.stockoutRisk,
    reorderTriggerProbability: summary.reorderTriggerProbability,
    reorderRecommendation,
    daysOfCover: summary.daysOfCover,
  } satisfies OverviewSkuTask;
}

function buildStaleUpdateReminderTask({
  forceVisible,
  language,
  observations,
  snoozeUntil,
}: {
  forceVisible?: boolean;
  language: AppLanguage;
  observations: SenaObservationRecord[];
  snoozeUntil: string | null;
}): OverviewStaleUpdateReminderTask | null {
  const latestRecordedUpdateAt = latestObservationAt(observations);
  if (!latestRecordedUpdateAt) {
    return null;
  }

  const staleDays = diffCalendarDays(latestRecordedUpdateAt);
  if (staleDays == null || (!forceVisible && staleDays <= 7)) {
    return null;
  }

  if (snoozeUntil) {
    const snoozeUntilStart = startOfLocalDay(snoozeUntil);
    const currentDayStart = todayStart();
    if (snoozeUntilStart && snoozeUntilStart.getTime() > currentDayStart.getTime()) {
      return null;
    }
  }

  return {
    kind: 'stale_update_reminder',
    id: 'overview:stale-update-reminder',
    stateLabel: translate(language, 'overviewStaleReminderStateLabel'),
    statusTone: 'warning',
    action: 'start_update',
    actionLabel: translate(language, 'overviewStaleReminderAction'),
    snoozeAction: 'remind_tomorrow',
    snoozeActionLabel: translate(language, 'overviewStaleReminderSnoozeAction'),
    staleDays,
    latestObservationAt: latestRecordedUpdateAt,
    whyNow: translate(language, 'overviewStaleReminderWhyNow'),
    whyDetail: translate(language, 'overviewStaleReminderWhyDetail', {
      days: formatWholeNumber(staleDays, language),
    }),
    etaLabel: translate(language, 'overviewStaleReminderEtaLabel', {
      date: formatSenaDate(latestRecordedUpdateAt, language),
    }),
    etaDetail: translate(language, 'overviewStaleReminderEtaDetail'),
    confidenceCue: translate(language, 'overviewStaleReminderConfidence'),
    heartbeat: [
      translate(language, 'overviewStaleReminderHeartbeatUpdated', {
        date: formatSenaDate(latestRecordedUpdateAt, language),
      }),
      translate(language, 'overviewStaleReminderHeartbeatAge', {
        days: formatWholeNumber(staleDays, language),
      }),
    ],
    nextSteps: [
      translate(language, 'overviewStaleReminderNextStart'),
      translate(language, 'overviewStaleReminderNextSnooze'),
    ],
  };
}

function buildSignals(tasks: OverviewSkuTask[], language: AppLanguage) {
  const rows: OverviewSignalRow[] = [];

  const priceSignalTask = tasks.find((task) => task.hasRecentPriceSignal);
  if (priceSignalTask) {
    rows.push({
      id: `price:${priceSignalTask.skuId}`,
      text: translate(language, 'overviewSignalPriceMove', { name: priceSignalTask.skuName }),
    });
  }

  const promoTask = tasks.find((task) => task.regimeKey === 'promo');
  if (promoTask) {
    rows.push({
      id: `promo:${promoTask.skuId}`,
      text: translate(language, 'overviewSignalPromo', { name: promoTask.skuName }),
    });
  }

  const residualRiskTask = tasks.find(
    (task) => task.state === 'received_today' && task.reorderTriggerProbability >= 0.45,
  );
  if (residualRiskTask) {
    rows.push({
      id: `residual:${residualRiskTask.skuId}`,
      text: translate(language, 'overviewSignalResidualRisk', { name: residualRiskTask.skuName }),
    });
  }

  const overdueTask = tasks.find((task) => task.state === 'follow_up_today');
  if (overdueTask) {
    rows.push({
      id: `late:${overdueTask.skuId}`,
      text: `${overdueTask.skuName} ${translate(language, 'overviewTimingLate')}.`,
    });
  }

  return rows.slice(0, 3);
}

export function buildOverviewModel({
  catalog,
  detailBySkuId,
  forceStaleUpdateReminder,
  language,
  observations,
  staleUpdateReminderSnoozeUntil,
  workspaceSummary,
}: {
  catalog: SenaCatalog | null;
  detailBySkuId: Record<string, SenaSkuDetail | null>;
  forceStaleUpdateReminder?: boolean;
  language: AppLanguage;
  observations: SenaObservationRecord[];
  staleUpdateReminderSnoozeUntil?: string | null;
  workspaceSummary: SenaWorkspaceSummary | null;
}): OverviewModel {
  if (!catalog || !workspaceSummary) {
    return {
      tasks: [],
      inTransit: [],
      recentReceipts: [],
      signals: [],
      todayCounts: {
        toOrder: 0,
        followUpToday: 0,
        readyToReceive: 0,
      },
    };
  }

  const tasks = workspaceSummary.skuSummaries
    .map((summary) =>
      buildTask({
        catalog,
        detail: detailBySkuId[summary.skuId] ?? null,
        language,
        observations,
        summary,
        workspaceLatestObservedAt: workspaceSummary.latestObservedAt,
      }),
    )
    .filter((value): value is OverviewSkuTask => value != null)
    .sort((left, right) => {
      const priorityGap = taskPriority(left.state) - taskPriority(right.state);
      if (priorityGap !== 0) {
        return priorityGap;
      }
      return right.stockoutRisk - left.stockoutRisk;
    });
  const staleUpdateReminderTask = buildStaleUpdateReminderTask({
    forceVisible: forceStaleUpdateReminder ?? false,
    language,
    observations,
    snoozeUntil: staleUpdateReminderSnoozeUntil ?? null,
  });
  const allTasks = staleUpdateReminderTask ? [staleUpdateReminderTask, ...tasks] : tasks;

  const inTransit = tasks
    .filter((task) =>
      task.state === 'awaiting_receipt' ||
      task.state === 'follow_up_today' ||
      task.state === 'ready_to_receive',
    )
    .map((task) => ({
      id: task.id,
      skuId: task.skuId,
      name: task.skuName,
      etaLabel: task.etaLabel,
    }))
    .slice(0, 4);

  const recentReceipts = tasks
    .filter((task) => task.latestReceiptAt)
    .sort((left, right) => new Date(right.latestReceiptAt ?? '').getTime() - new Date(left.latestReceiptAt ?? '').getTime())
    .map((task) => ({
      id: `receipt:${task.skuId}`,
      skuId: task.skuId,
      name: task.skuName,
      quantityLabel:
        task.recentReceiptQuantity != null
          ? `+${formatWholeNumber(task.recentReceiptQuantity, language)}`
          : 'Receipt',
      receivedAt: task.latestReceiptAt ?? '',
      receivedLabel: isSameLocalDay(task.latestReceiptAt) ? 'Today' : formatSenaDate(task.latestReceiptAt, language),
    }))
    .slice(0, 4);

  return {
    tasks: allTasks,
    inTransit,
    recentReceipts,
    signals: buildSignals(tasks, language),
    todayCounts: {
      toOrder: tasks.filter((task) => task.state === 'to_order').length,
      followUpToday: tasks.filter((task) => task.state === 'follow_up_today').length,
      readyToReceive: tasks.filter((task) => task.state === 'ready_to_receive').length,
    },
  };
}

export function taskMatchesQuery(task: OverviewTask, query: string) {
  const normalized = query.trim().toLowerCase();
  if (!normalized) {
    return true;
  }

  if (task.kind === 'stale_update_reminder') {
    return [
      task.stateLabel,
      task.actionLabel,
      task.snoozeActionLabel,
      task.whyNow,
      task.whyDetail,
      task.etaLabel,
      task.etaDetail,
    ]
      .join(' ')
      .toLowerCase()
      .includes(normalized);
  }

  return [
    task.skuName,
    task.serviceImpact,
    task.whyNow,
    task.whyDetail,
    task.reorderRecommendation.compactLabel ?? '',
    task.reorderRecommendation.recommendedOrderLabel,
    task.etaLabel,
    task.stateLabel,
    ...task.linkedServiceNames,
  ]
    .join(' ')
    .toLowerCase()
    .includes(normalized);
}

export function shouldShowTask(task: OverviewTask, filter: OverviewTaskFilter) {
  if (task.kind === 'stale_update_reminder') {
    return filter === 'all';
  }
  return filter === 'all' || task.state === filter;
}

export function isOverviewSkuTask(task: OverviewTask): task is OverviewSkuTask {
  return task.kind === 'sku';
}

export function relativeReceiptLabel(value: string | null) {
  if (!value) {
    return 'Recent';
  }
  if (isSameLocalDay(value)) {
    return 'Today';
  }
  const start = todayStart();
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) {
    return 'Recent';
  }
  const diffDays = Math.round((date.getTime() - start.getTime()) / 86_400_000);
  if (diffDays === -1) {
    return 'Yesterday';
  }
  return diffDays <= -2 ? formatSenaDate(value, 'en') : 'Recent';
}

export function nextCheckLabel(value: string | null) {
  const days = diffDaysFromNow(value);
  if (days == null) {
    return 'Next check pending';
  }
  if (days <= 0.5) {
    return 'Check today';
  }
  if (days <= 1.5) {
    return 'Check tomorrow';
  }
  return `Check ${formatSenaDate(value, 'en')}`;
}
