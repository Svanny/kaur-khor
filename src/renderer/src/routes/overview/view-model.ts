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
import { formatSenaDate, formatSenaDays, formatSenaPercent, formatSenaUnits } from '@/routes/sku-detail/format';

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
  | 'review';

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

export interface OverviewTask {
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
  regimeLabel: string;
  stockoutRisk: number;
  reorderTriggerProbability: number;
  reorderRecommendation: SenaReorderQuantityDisplay;
  daysOfCover: number | null;
}

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

function todayStart() {
  const value = new Date();
  return new Date(value.getFullYear(), value.getMonth(), value.getDate());
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

function confidenceCue(value: SenaLeadTimeVariabilityClass | null, overdue: boolean) {
  if (overdue) {
    return 'late beyond expected range';
  }
  switch (value) {
    case 'very_tight':
    case 'tight':
      return 'tight window';
    case 'wide':
    case 'very_wide':
      return 'wide window';
    case 'normal':
      return 'normal window';
    default:
      return 'timing pending';
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
      etaLabel: 'Awaiting supplier update',
      etaDetail: 'Banji is carrying in-transit exposure without a stable window yet.',
      confidenceCue: 'timing pending',
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
      ? `Expected ${formatSenaDate(expectedArrivalDate, language)}`
      : `${formatSenaDate(expectedArrivalDate, language)} ± ${formatWholeNumber(stdDays, language)}d`,
    etaDetail: overdue
      ? 'Expected window passed without a confirmed receipt.'
      : dueNow
        ? 'Receipt window is open right now.'
        : arrivalWindowStart && arrivalWindowEnd
          ? `${formatSenaDate(arrivalWindowStart, language)}-${formatSenaDate(arrivalWindowEnd, language)} arrival window`
          : 'Arrival window pending',
    confidenceCue: confidenceCue(variabilityClass, overdue),
    arrivalWindowStart,
    arrivalWindowEnd,
    expectedArrivalDate,
    overdue,
    dueNow,
  };
}

function taskStateLabel(value: Exclude<OverviewTaskFilter, 'all'>) {
  switch (value) {
    case 'to_order':
      return 'To order';
    case 'awaiting_receipt':
      return 'Awaiting receipt';
    case 'follow_up_today':
      return 'Follow up today';
    case 'ready_to_receive':
      return 'Ready to receive';
    case 'received_today':
      return 'Received today';
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
  linkedServiceNames,
  state,
  stockoutRisk,
}: {
  linkedServiceNames: string[];
  state: Exclude<OverviewTaskFilter, 'all'>;
  stockoutRisk: number;
}) {
  const names = compactList(linkedServiceNames);

  if (linkedServiceNames.length === 0) {
    return 'No linked service impact mapped yet';
  }

  if (state === 'ready_to_receive' || state === 'received_today') {
    return `May restore ${names}`;
  }

  if (state === 'to_order' && stockoutRisk >= 0.7) {
    return `Blocks ${names}`;
  }

  return `Affects ${names}`;
}

function nextStepsForTask({
  expectedArrivalDate,
  arrivalWindowStart,
  arrivalWindowEnd,
  state,
}: {
  expectedArrivalDate: string | null;
  arrivalWindowStart: string | null;
  arrivalWindowEnd: string | null;
  state: Exclude<OverviewTaskFilter, 'all'>;
}) {
  if (state === 'to_order') {
    const reviewDate = addDays(new Date().toISOString(), 1);
    return [
      `Banji will keep this in To order until an order is logged.`,
      reviewDate ? `Banji will prompt another review on ${formatSenaDate(reviewDate, 'en')}.` : 'Banji will prompt another review soon.',
      'The task stays urgent while the reorder trigger remains active.',
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
      ? `Banji will remind you on ${formatSenaDate(expectedArrivalDate, 'en')}.`
      : 'Banji will keep watching the current receipt window.',
    `Current arrival window ${arrivalWindowLabel}.`,
    'Task will move to Follow up today if no receipt is recorded.',
  ];
}

function taskNarrative({
  linkedServiceNames,
  receiptWindow,
  summary,
  taskState,
}: {
  linkedServiceNames: string[];
  receiptWindow: ReceiptWindowSummary | null;
  summary: SenaSkuSummary;
  taskState: Exclude<OverviewTaskFilter, 'all'>;
}) {
  switch (taskState) {
    case 'to_order':
      return {
        action: 'log_order' as OverviewTaskAction,
        actionLabel: 'Log order',
        defaultDrawerMode: 'not_ordered' as OverviewTaskDrawerMode,
        statusTone: 'danger' as const,
        whyNow:
          summary.stockoutRisk >= 0.7 && linkedServiceNames.length > 0
            ? 'Stockout blocks service'
            : 'Reorder soon',
        whyDetail: `${summary.daysOfCover != null ? formatSenaDays(summary.daysOfCover, 'en') : '—'} cover · reorder trigger ${formatSenaPercent(summary.reorderTriggerProbability, 'en')}`,
      };
    case 'awaiting_receipt':
      return {
        action: 'update_eta' as OverviewTaskAction,
        actionLabel: 'Update ETA',
        defaultDrawerMode: 'ordered_waiting' as OverviewTaskDrawerMode,
        statusTone: 'warning' as const,
        whyNow: 'Ordered already',
        whyDetail: receiptWindow?.etaDetail ?? 'Banji is holding this in the active receipt loop.',
      };
    case 'follow_up_today':
      return {
        action: 'follow_up' as OverviewTaskAction,
        actionLabel: 'Follow up',
        defaultDrawerMode: 'eta_changed' as OverviewTaskDrawerMode,
        statusTone: 'warning' as const,
        whyNow: 'Check supplier update',
        whyDetail: receiptWindow?.etaDetail ?? 'Expected window passed without a new update.',
      };
    case 'ready_to_receive':
      return {
        action: 'receive' as OverviewTaskAction,
        actionLabel: 'Receive',
        defaultDrawerMode: 'goods_received' as OverviewTaskDrawerMode,
        statusTone: 'info' as const,
        whyNow: 'Receipt due',
        whyDetail: receiptWindow?.etaDetail ?? 'The current arrival window is open.',
      };
    case 'received_today':
      return {
        action: 'review' as OverviewTaskAction,
        actionLabel: 'Review',
        defaultDrawerMode: 'goods_received' as OverviewTaskDrawerMode,
        statusTone: 'success' as const,
        whyNow: 'Receipt logged today',
        whyDetail: 'Inventory was updated recently and service recovery should be checked.',
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
      ? 'Not ordered yet'
      : state === 'received_today'
        ? 'Received today'
        : (receiptWindow?.etaLabel ?? 'Awaiting supplier update');
  const etaDetail =
    state === 'to_order'
      ? 'No open order is recorded yet.'
      : state === 'received_today'
        ? observationSignals.latestReceiptAt
          ? `Logged ${formatSenaDate(observationSignals.latestReceiptAt, language)}`
          : 'Receipt logged today.'
        : (receiptWindow?.etaDetail ?? 'Banji is waiting for the next supplier signal.');

  return {
    id: summary.skuId,
    skuId: summary.skuId,
    skuName: sku.name,
    state,
    stateLabel: taskStateLabel(state),
    statusTone: narrative.statusTone,
    action: narrative.action,
    actionLabel: narrative.actionLabel,
    defaultDrawerMode: narrative.defaultDrawerMode,
    serviceImpact: serviceImpactLine({
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
          ? 'priority elevated'
          : 'watch posture'
        : (receiptWindow?.confidenceCue ?? confidenceCue(variabilityClass, false)),
    heartbeat: [
      `Posterior on hand ${formatSenaUnits(summary.credibleIntervalLow, language)}-${formatSenaUnits(summary.credibleIntervalHigh, language)}`,
      `${summary.daysOfCover != null ? formatSenaDays(summary.daysOfCover, language) : '—'} cover`,
      `Reorder trigger ${formatSenaPercent(summary.reorderTriggerProbability, language)}`,
      linkedServiceNames.length > 0 ? serviceImpactLine({ linkedServiceNames, state, stockoutRisk: summary.stockoutRisk }) : 'No linked service exposure',
      observationSignals.latestPriceAt ? `Recent price signal ${formatSenaDate(observationSignals.latestPriceAt, language)}` : `Regime ${titleCase(dominantRegime)}`,
    ],
    nextSteps: nextStepsForTask({
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
    regimeLabel: titleCase(dominantRegime),
    stockoutRisk: summary.stockoutRisk,
    reorderTriggerProbability: summary.reorderTriggerProbability,
    reorderRecommendation,
    daysOfCover: summary.daysOfCover,
  } satisfies OverviewTask;
}

function buildSignals(tasks: OverviewTask[]) {
  const rows: OverviewSignalRow[] = [];

  const priceSignalTask = tasks.find((task) => task.heartbeat.some((entry) => entry.startsWith('Recent price signal')));
  if (priceSignalTask) {
    rows.push({
      id: `price:${priceSignalTask.skuId}`,
      text: `Demand rose after a recent price move on ${priceSignalTask.skuName}.`,
    });
  }

  const promoTask = tasks.find((task) => task.regimeLabel === 'Promo');
  if (promoTask) {
    rows.push({
      id: `promo:${promoTask.skuId}`,
      text: `Promo window lifted draw on ${promoTask.skuName}.`,
    });
  }

  const residualRiskTask = tasks.find(
    (task) => task.state === 'received_today' && task.reorderTriggerProbability >= 0.45,
  );
  if (residualRiskTask) {
    rows.push({
      id: `residual:${residualRiskTask.skuId}`,
      text: `Service risk remains active on ${residualRiskTask.skuName} even after today's receipt.`,
    });
  }

  const overdueTask = tasks.find((task) => task.state === 'follow_up_today');
  if (overdueTask) {
    rows.push({
      id: `late:${overdueTask.skuId}`,
      text: `${overdueTask.skuName} is late beyond the expected arrival range.`,
    });
  }

  return rows.slice(0, 3);
}

export function buildOverviewModel({
  catalog,
  detailBySkuId,
  language,
  observations,
  workspaceSummary,
}: {
  catalog: SenaCatalog | null;
  detailBySkuId: Record<string, SenaSkuDetail | null>;
  language: AppLanguage;
  observations: SenaObservationRecord[];
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
    .filter((value): value is OverviewTask => value != null)
    .sort((left, right) => {
      const priorityGap = taskPriority(left.state) - taskPriority(right.state);
      if (priorityGap !== 0) {
        return priorityGap;
      }
      return right.stockoutRisk - left.stockoutRisk;
    });

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
    tasks,
    inTransit,
    recentReceipts,
    signals: buildSignals(tasks),
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
  return filter === 'all' || task.state === filter;
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
