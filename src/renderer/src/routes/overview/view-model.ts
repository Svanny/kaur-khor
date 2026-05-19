import type { AppLanguage } from '@shared/inventory';
import type {
  SenaCatalog,
  SenaLeadTimeVariabilityClass,
  SenaObservationRecord,
  SenaOrderBatchRecord,
  SenaRecordUpdateContext,
  SenaSkuDetail,
  SenaSkuSummary,
  SenaTicketSummary,
  SenaWorkspaceSummary,
} from '@shared/sena';
import { activeSenaCatalog } from '@/lib/sena-catalog';
import { deriveLeadTimeVariabilityClass } from '@shared/sena-lead-time';
import { formatLocalDateInputValue } from '@/lib/date-input-utils';
import { formatWholeNumber } from '@/lib/format';
import { translateRegimeLabel } from '@/lib/localized-display';
import {
  formatSenaReorderQuantity,
  isSenaReorderQuantityIssued,
  type SenaReorderQuantityDisplay,
} from '@/lib/sena-reorder-quantity';
import { latestObservationAt } from '@/routes/observation-payload';
import { formatSenaDate, formatSenaDateTime, formatSenaDays, formatSenaPercent, formatSenaUnits } from '@/routes/sku-detail/format';
import { getTranslation, translateUiLiteral } from '@/lib/translations';

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
  | 'order_canceled'
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
  kind: 'sku' | 'supplier_ticket' | 'stale_update_reminder';
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
  imagePath: string | null;
  supplierName: string | null;
  batchOrderId: string | null;
  childOrderId: string | null;
  supplierTicket: SenaTicketSummary | null;
  supplierTicketId: string | null;
  batchChildCount: number;
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

export interface OverviewSupplierTicketTask extends OverviewTaskBase {
  kind: 'supplier_ticket';
  id: string;
  ticketId: string;
  displayTicketId: string;
  displayTicketLabel: string;
  ticket: SenaTicketSummary;
  childTasks: OverviewSkuTask[];
  supplierName: string | null;
  skuCount: number;
  skuSummaryLabel: string;
  skuNames: string[];
  imagePath: string | null;
  state: Exclude<OverviewTaskFilter, 'all'>;
  stateLabel: string;
  statusTone: 'danger' | 'warning' | 'success' | 'info' | 'neutral';
  action: OverviewTaskAction;
  actionLabel: string;
  defaultDrawerMode: Exclude<OverviewTaskDrawerMode, 'not_ordered'>;
  latestObservationAt: string | null;
  latestOrderAt: string | null;
  latestReceiptAt: string | null;
  expectedArrivalDate: string | null;
  arrivalWindowStart: string | null;
  arrivalWindowEnd: string | null;
  leadTimeMeanDays: number | null;
  leadTimeStdDays: number | null;
  variabilityClass: SenaLeadTimeVariabilityClass | null;
}

export type OverviewTask = OverviewSkuTask | OverviewSupplierTicketTask | OverviewStaleUpdateReminderTask;

export const DRAFT_SUPPLIER_TICKET_ID_PREFIX = 'draft-supplier-ticket:';

export function draftSupplierTicketForSkuTask({
  latestObservedAt,
  task,
}: {
  latestObservedAt: string | null | undefined;
  task: OverviewSkuTask;
}): SenaTicketSummary {
  return task.supplierTicket ?? {
    ticketId: `${DRAFT_SUPPLIER_TICKET_ID_PREFIX}${task.skuId}`,
    ticketFamily: 'supplier',
    lifecycle: 'open',
    stage: task.defaultDrawerMode === 'goods_received' ? 'ordered_waiting' : 'to_order',
    revision: 0,
    eventType: 'created',
    occurredAt: task.latestOrderAt ?? task.latestObservationAt ?? latestObservedAt ?? new Date().toISOString(),
    nextTouchAt: task.expectedArrivalDate,
    party: {
      role: 'supplier',
      supplierName: task.supplierName,
    },
    lines: [{
      entityType: 'sku',
      entityId: task.skuId,
      orderedQuantity: task.recentOrderQuantity ?? task.suggestedOrderQuantity ?? null,
      receivedQuantity: task.recentReceiptQuantity ?? null,
      expectedArrivalAt: task.expectedArrivalDate,
    }],
    note: null,
  };
}

export function supplierTicketTaskForSkuTask({
  latestObservedAt,
  task,
  translate,
}: {
  latestObservedAt: string | null | undefined;
  task: OverviewSkuTask;
  translate: (value: string) => string;
}): OverviewSupplierTicketTask {
  const ticket = draftSupplierTicketForSkuTask({ latestObservedAt, task });
  const displayTicketId = task.supplierTicket
    ? `${ticketDisplayDate(ticket.occurredAt)}-#1`
    : task.skuId;
  const displayTicketLabel = task.supplierTicket
    ? `Supplier Ticket ID: ${displayTicketId}`
    : translate('Supplier order');
  return {
    ...task,
    id: task.supplierTicketId ? `supplier-ticket:${task.supplierTicketId}` : `${DRAFT_SUPPLIER_TICKET_ID_PREFIX}${task.skuId}`,
    kind: 'supplier_ticket',
    ticketId: ticket.ticketId,
    displayTicketId,
    displayTicketLabel,
    ticket,
    childTasks: [task],
    skuCount: 1,
    skuSummaryLabel: `1 SKU: ${task.skuName}`,
    skuNames: [task.skuName],
    defaultDrawerMode: task.defaultDrawerMode === 'not_ordered' ? 'ordered_waiting' : task.defaultDrawerMode,
    heartbeat: task.supplierTicket ? task.heartbeat : [task.skuName, ...task.heartbeat.slice(0, 2)],
  };
}

export interface OverviewInTransitRow {
  id: string;
  skuId: string;
  name: string;
  imagePath: string | null;
  supplierName: string | null;
  etaLabel: string;
}

export interface OverviewReceiptRow {
  id: string;
  skuId: string;
  name: string;
  imagePath: string | null;
  supplierName: string | null;
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

function timestampSortValue(value: string | null | undefined) {
  if (!value) {
    return Number.NEGATIVE_INFINITY;
  }
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : Number.NEGATIVE_INFINITY;
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

function summarizeObservations(observations: SenaObservationRecord[], skuId: string): ObservationSkuSignals {
  const sorted = [...observations].sort(
    (left, right) =>
      timestampSortValue(right.input.observedAt) - timestampSortValue(left.input.observedAt),
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

function orderBatchesForSku(orderBatches: SenaOrderBatchRecord[] | undefined, skuId: string) {
  return (orderBatches ?? [])
    .filter((batch) => batch.children.some((child) => child.skuId === skuId))
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}

function latestOrderContext(orderBatches: SenaOrderBatchRecord[], skuId: string) {
  const batch = orderBatchesForSku(orderBatches, skuId)[0] ?? null;
  if (!batch) {
    return null;
  }
  const child = batch.children.find((entry) => entry.skuId === skuId) ?? null;
  if (!child) {
    return null;
  }
  return {
    batch,
    child,
    effective: child.effective,
  };
}

function resolveSupplierTicketIdForOrderContext({
  observations,
  orderContext,
  recordUpdateContext,
  skuId,
  supplierName,
}: {
  observations: SenaObservationRecord[];
  orderContext: ReturnType<typeof latestOrderContext>;
  recordUpdateContext: SenaRecordUpdateContext | null | undefined;
  skuId: string;
  supplierName: string | null;
}) {
  const placementTimestamp = orderContext?.effective.placementTimestamp;
  if (!placementTimestamp) {
    return null;
  }

  const matchingTicketIds = new Set<string>();
  for (const observation of observations) {
    for (const event of observation.input.ticketEvents ?? []) {
      if (
        event.ticketFamily === 'supplier' &&
        event.occurredAt === placementTimestamp &&
        event.lines.some((line) => line.entityType === 'sku' && line.entityId === skuId) &&
        (!supplierName || !event.party?.supplierName || event.party.supplierName === supplierName)
      ) {
        matchingTicketIds.add(event.ticketId);
      }
    }
  }

  if (matchingTicketIds.size === 0) {
    return null;
  }

  const openMatch = recordUpdateContext?.openTicketsByFamily.supplier.find((ticket) =>
    matchingTicketIds.has(ticket.ticketId),
  );
  return openMatch?.ticketId ?? matchingTicketIds.values().next().value ?? null;
}

function supplierTicketMatchesSku(ticket: SenaTicketSummary, skuId: string, supplierName: string | null) {
  return (
    ticket.ticketFamily === 'supplier' &&
    ticket.lines.some((line) => line.entityType === 'sku' && line.entityId === skuId) &&
    (!supplierName || !ticket.party?.supplierName || ticket.party.supplierName === supplierName)
  );
}

function latestSupplierTicketForSku({
  observations,
  recordUpdateContext,
  skuId,
  supplierName,
}: {
  observations: SenaObservationRecord[];
  recordUpdateContext: SenaRecordUpdateContext | null | undefined;
  skuId: string;
  supplierName: string | null;
}) {
  const tickets = new Map<string, SenaTicketSummary>();
  const rememberTicket = (ticket: SenaTicketSummary) => {
    if (!supplierTicketMatchesSku(ticket, skuId, supplierName)) {
      return;
    }
    const current = tickets.get(ticket.ticketId);
    if (
      !current ||
      timestampSortValue(ticket.occurredAt) > timestampSortValue(current.occurredAt) ||
      (ticket.occurredAt === current.occurredAt && ticket.revision > current.revision)
    ) {
      tickets.set(ticket.ticketId, ticket);
    }
  };

  for (const ticket of Object.values(recordUpdateContext?.latestTicketsById ?? {}).map((anchor) => anchor.value)) {
    rememberTicket(ticket);
  }

  for (const observation of observations) {
    for (const ticket of observation.input.ticketEvents ?? []) {
      rememberTicket(ticket);
    }
  }

  return [...tickets.values()].sort(
    (left, right) =>
      timestampSortValue(right.occurredAt) - timestampSortValue(left.occurredAt) ||
      right.revision - left.revision ||
      right.ticketId.localeCompare(left.ticketId),
  )[0] ?? null;
}

function latestVariabilityClass(summary: SenaSkuSummary, detail: SenaSkuDetail | null) {
  const latestLeadTime = detail?.leadTimePosterior.at(-1) ?? null;
  if (latestLeadTime?.observedVariabilityClass) {
    return latestLeadTime.observedVariabilityClass;
  }
  const meanDays = safeOptionalNonNegativeNumber(latestLeadTime?.meanDays ?? summary.leadTimeMeanDays);
  const stdDays = safeOptionalNonNegativeNumber(latestLeadTime?.stdDays ?? summary.leadTimeStdDays);
  if (meanDays == null || stdDays == null) {
    return null;
  }
  const rangeLow = Math.max(meanDays - stdDays, 0.5);
  const rangeHigh = Math.max(meanDays + stdDays, rangeLow);
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
}: {
  detail: SenaSkuDetail | null;
  language: AppLanguage;
  latestOrderAt: string | null;
  summary: SenaSkuSummary;
}): ReceiptWindowSummary | null {
  const latestPipeline = detail?.pipelinePosterior.at(-1) ?? null;
  const latestLeadTime = detail?.leadTimePosterior.at(-1) ?? null;
  if (!latestOrderAt) {
    return null;
  }

  const meanDays = safeOptionalNonNegativeNumber(latestLeadTime?.meanDays ?? summary.leadTimeMeanDays);
  const stdDays = safeOptionalNonNegativeNumber(latestLeadTime?.stdDays ?? summary.leadTimeStdDays);
  const baseDate = latestOrderAt;

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

function fallbackRecommendedOrderQuantity(summary: SenaSkuSummary, detail: SenaSkuDetail | null) {
  const inTransit = safeNonNegativeNumber(detail?.pipelinePosterior.at(-1)?.inTransitMean);
  const reorderPoint = safeNonNegativeNumber(summary.reorderPoint);
  const credibleIntervalLow = safeNonNegativeNumber(summary.credibleIntervalLow);
  const credibleIntervalHigh = safeNonNegativeNumber(summary.credibleIntervalHigh);
  const safetyStock = safeNonNegativeNumber(summary.safetyStock);
  const lowGap = reorderPoint - credibleIntervalHigh - inTransit;
  const highGap = reorderPoint + safetyStock - credibleIntervalLow - inTransit;
  return Math.max(0, Math.ceil(Math.max(lowGap, highGap)));
}

function queueTimestamp(value: string | null | undefined) {
  if (!value) {
    return Number.POSITIVE_INFINITY;
  }
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? timestamp : Number.POSITIVE_INFINITY;
}

function overviewTaskFifoTimestamp(task: OverviewTask) {
  if (task.kind === 'stale_update_reminder') {
    return task.latestObservationAt;
  }

  switch (task.state) {
    case 'awaiting_receipt':
    case 'follow_up_today':
    case 'ready_to_receive':
      return task.latestOrderAt ?? task.arrivalWindowStart ?? task.expectedArrivalDate ?? task.latestObservationAt;
    case 'received_today':
      return task.latestReceiptAt ?? task.latestObservationAt;
    case 'to_order':
      return task.latestObservationAt ?? task.expectedArrivalDate;
  }
}

function compareOverviewTasksFifo(left: OverviewTask, right: OverviewTask) {
  const timestampGap = queueTimestamp(overviewTaskFifoTimestamp(left)) - queueTimestamp(overviewTaskFifoTimestamp(right));
  if (timestampGap !== 0) {
    return timestampGap;
  }
  return 0;
}

function supplierTaskUrgencyRank(task: OverviewSkuTask) {
  switch (task.state) {
    case 'ready_to_receive':
      return 0;
    case 'follow_up_today':
      return 1;
    case 'awaiting_receipt':
      return 2;
    case 'to_order':
      return 3;
    case 'received_today':
      return 4;
  }
}

function compareSupplierChildTasks(left: OverviewSkuTask, right: OverviewSkuTask) {
  const urgencyGap = supplierTaskUrgencyRank(left) - supplierTaskUrgencyRank(right);
  if (urgencyGap !== 0) {
    return urgencyGap;
  }
  return compareOverviewTasksFifo(left, right);
}

function ticketSkuSummaryLabel(children: OverviewSkuTask[], language: AppLanguage) {
  const names = children.map((task) => task.skuName);
  if (names.length === 0) {
    return translateUiLiteral(language, 'No SKU lines');
  }
  const visibleNames = names.slice(0, 3).join(', ');
  const hiddenCount = names.length - 3;
  const suffix = hiddenCount > 0 ? ` +${formatWholeNumber(hiddenCount, language)} more` : '';
  return `${formatWholeNumber(names.length, language)} ${names.length === 1 ? 'SKU' : 'SKUs'}: ${visibleNames}${suffix}`;
}

function ticketDisplayDate(value: string | null | undefined) {
  if (!value) {
    return formatLocalDateInputValue(new Date());
  }
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) {
    return value.slice(0, 10);
  }
  return formatLocalDateInputValue(date);
}

function compareSupplierTicketsByDisplayOrder(left: SenaTicketSummary, right: SenaTicketSummary) {
  return ticketDisplaySortValue(left.occurredAt) - ticketDisplaySortValue(right.occurredAt) ||
    ticketDisplayDate(left.occurredAt).localeCompare(ticketDisplayDate(right.occurredAt)) ||
    left.ticketId.localeCompare(right.ticketId);
}

function ticketDisplaySortValue(value: string | null | undefined) {
  if (!value) {
    return Number.POSITIVE_INFINITY;
  }
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : Number.POSITIVE_INFINITY;
}

function compareSupplierTicketsByFreshness(left: SenaTicketSummary, right: SenaTicketSummary) {
  return timestampSortValue(right.occurredAt) - timestampSortValue(left.occurredAt) ||
    right.revision - left.revision ||
    right.ticketId.localeCompare(left.ticketId);
}

function newerSupplierTicket(left: SenaTicketSummary, right: SenaTicketSummary) {
  return compareSupplierTicketsByFreshness(left, right) <= 0 ? left : right;
}

function collectSupplierTickets({
  observations,
  recordUpdateContext,
}: {
  observations: SenaObservationRecord[];
  recordUpdateContext: SenaRecordUpdateContext | null | undefined;
}) {
  const ticketsById = new Map<string, SenaTicketSummary>();
  const rememberTicket = (ticket: SenaTicketSummary) => {
    if (ticket.ticketFamily !== 'supplier') {
      return;
    }
    const current = ticketsById.get(ticket.ticketId);
    ticketsById.set(ticket.ticketId, current ? newerSupplierTicket(ticket, current) : ticket);
  };

  for (const ticket of Object.values(recordUpdateContext?.latestTicketsById ?? {}).map((anchor) => anchor.value)) {
    rememberTicket(ticket);
  }
  for (const ticket of recordUpdateContext?.openTicketsByFamily.supplier ?? []) {
    rememberTicket(ticket);
  }
  for (const observation of observations) {
    for (const ticket of observation.input.ticketEvents ?? []) {
      rememberTicket(ticket);
    }
  }

  return [...ticketsById.values()];
}

function supplierTicketDisplayLabels(tickets: SenaTicketSummary[]) {
  const labels = new Map<string, string>();
  const sortedTickets = [...tickets].sort(compareSupplierTicketsByDisplayOrder);
  const countByDate = new Map<string, number>();

  for (const ticket of sortedTickets) {
    const date = ticketDisplayDate(ticket.occurredAt);
    const count = (countByDate.get(date) ?? 0) + 1;
    countByDate.set(date, count);
    labels.set(ticket.ticketId, `${date}-#${count}`);
  }

  return labels;
}

function orderedTimestampDetail(value: string | null | undefined, language: AppLanguage) {
  return value
    ? translate(language, 'overviewTaskWhyOrderedAt', {
        date: formatSenaDateTime(value, language),
      })
    : translate(language, 'overviewTaskWhyReceiptLoop');
}

function buildSupplierTicketTask({
  children,
  displayTicketId,
  language,
  ticket,
}: {
  children: OverviewSkuTask[];
  displayTicketId: string;
  language: AppLanguage;
  ticket: SenaTicketSummary;
}): OverviewSupplierTicketTask {
  const sortedChildren = [...children].sort(compareSupplierChildTasks);
  const representative = sortedChildren[0]!;
  const isCanceled = ticket.lifecycle === 'canceled';
  const state = isCanceled ? 'to_order' : representative.state;
  const defaultDrawerMode = isCanceled ? 'order_canceled' : representative.defaultDrawerMode === 'not_ordered' ? 'ordered_waiting' : representative.defaultDrawerMode;
  const etaLabel = isCanceled ? translateUiLiteral(language, 'Order canceled') : representative.etaLabel;
  const etaDetail = isCanceled
    ? translateUiLiteral(language, 'The supplier ticket was canceled; keep it closed or edit it in Capture.')
    : representative.etaDetail;
  const stateLabel = isCanceled ? translateUiLiteral(language, 'Order canceled') : representative.stateLabel;
  const actionLabel = isCanceled ? translateUiLiteral(language, 'Review ticket') : representative.actionLabel;
  const whyDetail = !isCanceled && (representative.action === 'update_eta' || ticket.stage === 'ordered_waiting')
    ? orderedTimestampDetail(representative.latestOrderAt ?? ticket.occurredAt, language)
    : representative.whyDetail;

  return {
    ...representative,
    id: `supplier-ticket:${ticket.ticketId}`,
    kind: 'supplier_ticket',
    ticketId: ticket.ticketId,
    displayTicketId,
    displayTicketLabel: `Supplier Ticket ID: ${displayTicketId}`,
    ticket,
    childTasks: sortedChildren,
    supplierName: ticket.party?.supplierName ?? representative.supplierName,
    skuCount: sortedChildren.length,
    skuSummaryLabel: ticketSkuSummaryLabel(sortedChildren, language),
    skuNames: sortedChildren.map((task) => task.skuName),
    imagePath: representative.imagePath,
    state,
    stateLabel,
    statusTone: isCanceled ? 'neutral' : representative.statusTone,
    action: isCanceled ? 'review' : representative.action,
    actionLabel,
    defaultDrawerMode,
    etaLabel,
    etaDetail,
    whyDetail,
    confidenceCue: representative.confidenceCue,
    heartbeat: [
      `Supplier Ticket ID: ${displayTicketId}`,
      ticketSkuSummaryLabel(sortedChildren, language),
      ...representative.heartbeat.slice(0, 1),
    ],
    nextSteps: isCanceled
      ? [translateUiLiteral(language, 'This supplier ticket is canceled. Use Capture to reopen or create a new supplier order.')]
      : representative.nextSteps,
  };
}

function supplierTicketMatchesTaskLine(ticket: SenaTicketSummary, task: OverviewSkuTask) {
  return ticket.lines.some((line) => line.entityType === 'sku' && line.entityId === task.skuId);
}

function supplierTicketIsActive(ticket: SenaTicketSummary) {
  return ticket.lifecycle === 'open';
}

function supplierTicketForTask(task: OverviewSkuTask, tickets: SenaTicketSummary[]) {
  const lineMatches = tickets.filter((ticket) => supplierTicketMatchesTaskLine(ticket, task));
  const activeMatch = lineMatches.filter(supplierTicketIsActive).sort(compareSupplierTicketsByFreshness)[0] ?? null;
  const resolvedMatch = lineMatches.filter((ticket) => ticket.lifecycle === 'resolved').sort(compareSupplierTicketsByFreshness)[0] ?? null;
  const canceledMatch = lineMatches.filter((ticket) => ticket.lifecycle === 'canceled').sort(compareSupplierTicketsByFreshness)[0] ?? null;
  return activeMatch ?? resolvedMatch ?? canceledMatch;
}

function groupSupplierTicketTasks(tasks: OverviewSkuTask[], language: AppLanguage, tickets: SenaTicketSummary[]) {
  const groups = new Map<string, { ticket: SenaTicketSummary; children: OverviewSkuTask[] }>();
  const ungrouped: OverviewSkuTask[] = [];
  const displayLabels = supplierTicketDisplayLabels(tickets);

  for (const task of tasks) {
    const ticket = supplierTicketForTask(task, tickets);
    if (!ticket) {
      ungrouped.push(task);
      continue;
    }

    const current = groups.get(ticket.ticketId);
    if (current) {
      current.children.push(task);
    } else {
      groups.set(ticket.ticketId, { ticket, children: [task] });
    }
  }

  return [
    ...ungrouped,
    ...[...groups.values()].map((group) =>
      buildSupplierTicketTask({
        children: group.children,
        displayTicketId: displayLabels.get(group.ticket.ticketId) ?? `${ticketDisplayDate(group.ticket.occurredAt)}-#1`,
        language,
        ticket: group.ticket,
      }),
    ),
  ];
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
      ? `${formatSenaDate(arrivalWindowStart, language)}-${formatSenaDate(arrivalWindowEnd, language)}`
      : expectedArrivalDate
        ? formatSenaDate(expectedArrivalDate, language)
        : translate(language, 'overviewReceiptWindowPending');

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
  latestOrderAt,
  orderCanceled,
  receiptWindow,
  summary,
  taskState,
}: {
  language: AppLanguage;
  linkedServiceNames: string[];
  latestOrderAt: string | null;
  orderCanceled: boolean;
  receiptWindow: ReceiptWindowSummary | null;
  summary: SenaSkuSummary;
  taskState: Exclude<OverviewTaskFilter, 'all'>;
}) {
  const stockoutRisk = safeProbability(summary.stockoutRisk);
  const daysOfCover = safeOptionalNonNegativeNumber(summary.daysOfCover);
  const reorderTriggerProbability = safeProbability(summary.reorderTriggerProbability);
  switch (taskState) {
    case 'to_order':
      return {
        action: 'log_order' as OverviewTaskAction,
        actionLabel: translate(language, 'overviewTaskActionLogOrder'),
        defaultDrawerMode: (orderCanceled ? 'order_canceled' : 'not_ordered') as OverviewTaskDrawerMode,
        statusTone: 'danger' as const,
        whyNow:
          stockoutRisk >= 0.7 && linkedServiceNames.length > 0
            ? translate(language, 'overviewTaskWhyOrderBlocksService')
            : translate(language, 'overviewTaskWhyOrderSoon'),
        whyDetail: translate(language, 'overviewTaskWhyDetailOrder', {
          cover: daysOfCover != null ? formatSenaDays(daysOfCover, language) : '—',
          probability: formatSenaPercent(reorderTriggerProbability, language),
        }),
      };
    case 'awaiting_receipt':
      return {
        action: 'update_eta' as OverviewTaskAction,
        actionLabel: translate(language, 'overviewTaskActionUpdateEta'),
        defaultDrawerMode: 'ordered_waiting' as OverviewTaskDrawerMode,
        statusTone: 'warning' as const,
        whyNow: translate(language, 'overviewTaskWhyOrderedAlready'),
        whyDetail: orderedTimestampDetail(latestOrderAt, language),
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
  const latestOrderTimestamp = timestampSortValue(latestOrderAt);
  const latestReceiptTimestamp = timestampSortValue(latestReceiptAt);
  const hasOpenOrder =
    latestOrderAt != null &&
    (latestReceiptAt == null || latestOrderTimestamp > latestReceiptTimestamp);
  const receiptLoggedToday =
    latestReceiptAt != null &&
    isSameLocalDay(latestReceiptAt) &&
    (latestOrderAt == null || latestReceiptTimestamp >= latestOrderTimestamp);

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

  const daysOfCover = safeOptionalNonNegativeNumber(summary.daysOfCover);
  if (
    safeProbability(summary.reorderTriggerProbability) >= 0.55 ||
    safeProbability(summary.stockoutRisk) >= 0.65 ||
    (daysOfCover != null && daysOfCover <= 2.5)
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
  orderBatches,
  recordUpdateContext,
  summary,
  workspaceLatestObservedAt,
}: {
  catalog: SenaCatalog;
  detail: SenaSkuDetail | null;
  language: AppLanguage;
  observations: SenaObservationRecord[];
  orderBatches: SenaOrderBatchRecord[];
  recordUpdateContext?: SenaRecordUpdateContext | null;
  summary: SenaSkuSummary;
  workspaceLatestObservedAt: string | null;
}): OverviewSkuTask | null {
  const sku = catalog.skus.find((entry) => entry.skuId === summary.skuId);
  if (!sku) {
    return null;
  }

  const observationSignals = summarizeObservations(observations, summary.skuId);
  const orderContext = latestOrderContext(orderBatches, summary.skuId);
  const supplierName = sku.supplierName?.trim() || null;
  const latestSupplierTicket = latestSupplierTicketForSku({
    observations,
    recordUpdateContext,
    skuId: summary.skuId,
    supplierName,
  });
  const orderCanceled = latestSupplierTicket?.lifecycle === 'canceled';
  const orderResolved = latestSupplierTicket?.lifecycle === 'resolved';
  const supplierTicketId = resolveSupplierTicketIdForOrderContext({
    observations,
    orderContext,
    recordUpdateContext,
    skuId: summary.skuId,
    supplierName,
  }) ?? latestSupplierTicket?.ticketId ?? null;
  const latestOrderAt = orderCanceled || orderResolved ? null : (orderContext?.effective.placementTimestamp ?? observationSignals.latestOrderAt);
  const latestReceiptAt = orderResolved
    ? latestSupplierTicket.occurredAt
    : orderContext?.effective.receiptTimestamp ?? observationSignals.latestReceiptAt;
  const receiptWindow = receiptWindowSummary({
    detail,
    language,
    latestOrderAt,
    summary,
  });
  const state = orderResolved
    ? isSameLocalDay(latestReceiptAt) ? ('received_today' as const) : null
    : orderContext
    ? (() => {
        switch (orderContext.child.status) {
          case 'reviewed':
            return null;
          case 'received':
            return isSameLocalDay(latestReceiptAt) ? ('received_today' as const) : null;
          case 'follow_up':
            return 'follow_up_today' as const;
          case 'awaiting_receipt':
          case 'open':
            return receiptWindow?.dueNow ? ('ready_to_receive' as const) : ('awaiting_receipt' as const);
        }
      })()
    : deriveTaskState({
        latestOrderAt: observationSignals.latestOrderAt,
        latestReceiptAt: observationSignals.latestReceiptAt,
        receiptWindow,
        summary,
      });

  if (!state) {
    return null;
  }

  const linkedServiceNames = enabledLinkedServices(catalog, summary.skuId);
  const currentStock = safeNonNegativeNumber(summary.latestPosteriorUnits);
  const credibleIntervalLow = safeNonNegativeNumber(summary.credibleIntervalLow, currentStock);
  const credibleIntervalHigh = safeNonNegativeNumber(summary.credibleIntervalHigh, currentStock);
  const daysOfCover = safeOptionalNonNegativeNumber(summary.daysOfCover);
  const stockoutRisk = safeProbability(summary.stockoutRisk);
  const reorderTriggerProbability = safeProbability(summary.reorderTriggerProbability);
  const leadTimeMeanDays = safeOptionalNonNegativeNumber(detail?.leadTimePosterior.at(-1)?.meanDays ?? summary.leadTimeMeanDays);
  const leadTimeStdDays = safeOptionalNonNegativeNumber(detail?.leadTimePosterior.at(-1)?.stdDays ?? summary.leadTimeStdDays);
  const recentOrderQuantity = safeOptionalNonNegativeNumber(orderContext?.effective.orderedQuantity ?? observationSignals.latestOrderQuantity);
  const recentReceiptQuantity = safeOptionalNonNegativeNumber(orderContext?.effective.receivedQuantity ?? observationSignals.latestReceiptQuantity);
  const fallbackOrderQuantity = fallbackRecommendedOrderQuantity(summary, detail);
  const reorderRecommendation = formatSenaReorderQuantity(
    summary.reorderQuantity,
    language,
    fallbackOrderQuantity,
  );
  const narrative = taskNarrative({
    language,
    latestOrderAt,
    linkedServiceNames,
    orderCanceled,
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
      ? orderCanceled
        ? translate(language, 'overviewTaskEtaOrderCanceled')
        : translate(language, 'overviewTaskEtaNotOrderedYet')
      : state === 'received_today'
        ? translate(language, 'overviewTaskEtaReceivedToday')
        : (receiptWindow?.etaLabel ?? translate(language, 'overviewReceiptAwaitingSupplierUpdate'));
  const etaDetail =
    state === 'to_order'
      ? orderCanceled
        ? translate(language, 'overviewTaskEtaOrderCanceledDetail')
        : translate(language, 'overviewTaskEtaNotOrderedDetail')
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
    imagePath: sku.imagePath?.trim() || null,
    supplierName,
    batchOrderId: orderContext?.batch.batchOrderId ?? null,
    childOrderId: orderContext?.child.childOrderId ?? null,
    supplierTicket: latestSupplierTicket,
    supplierTicketId,
    batchChildCount: orderContext?.batch.children.length ?? 0,
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
      stockoutRisk,
    }),
    whyNow: narrative.whyNow,
    whyDetail: narrative.whyDetail,
    etaLabel,
    etaDetail,
    confidenceCue:
      state === 'to_order' || state === 'received_today'
        ? stockoutRisk >= 0.7
          ? translate(language, 'overviewTaskConfidencePriority')
          : translate(language, 'overviewTaskConfidenceWatch')
        : (receiptWindow?.confidenceCue ?? confidenceCue(variabilityClass, false, language)),
    heartbeat: [
      translate(language, 'overviewTaskHeartbeatOnHand', {
        low: formatSenaUnits(credibleIntervalLow, language),
        high: formatSenaUnits(credibleIntervalHigh, language),
      }),
      translate(language, 'overviewTaskHeartbeatCover', {
        cover: daysOfCover != null ? formatSenaDays(daysOfCover, language) : '—',
      }),
      translate(language, 'overviewTaskHeartbeatReorder', {
        probability: formatSenaPercent(reorderTriggerProbability, language),
      }),
      linkedServiceNames.length > 0
        ? serviceImpactLine({ language, linkedServiceNames, state, stockoutRisk })
        : translate(language, 'overviewTaskHeartbeatNoServiceExposure'),
      observationSignals.latestPriceAt
        ? translate(language, 'overviewTaskHeartbeatRecentPrice', {
            date: formatSenaDate(observationSignals.latestPriceAt, language),
          })
        : translate(language, 'overviewTaskHeartbeatPattern', {
            pattern: translateRegimeLabel(language, dominantRegime),
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
    currentStock,
    costPerUnit: safeNonNegativeNumber(sku.costPerUnit),
    productPrice: safeOptionalNonNegativeNumber(sku.productPrice),
    soldAsProduct: sku.soldAsProduct,
    expectedArrivalDate: receiptWindow?.expectedArrivalDate ?? null,
    arrivalWindowStart: receiptWindow?.arrivalWindowStart ?? null,
    arrivalWindowEnd: receiptWindow?.arrivalWindowEnd ?? null,
    leadTimeMeanDays,
    leadTimeStdDays,
    variabilityClass,
    suggestedOrderQuantity: reorderRecommendation.recommendedUnits,
    recentOrderQuantity,
    recentReceiptQuantity,
    latestObservationAt: observationSignals.latestObservationAt,
    latestOrderAt,
    latestReceiptAt,
    hasRecentPriceSignal: Boolean(observationSignals.latestPriceAt),
    regimeKey: dominantRegime,
    regimeLabel: translateRegimeLabel(language, dominantRegime),
    stockoutRisk,
    reorderTriggerProbability,
    reorderRecommendation,
    daysOfCover,
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
  orderBatches,
  recordUpdateContext,
  staleUpdateReminderSnoozeUntil,
  workspaceSummary,
}: {
  catalog: SenaCatalog | null;
  detailBySkuId: Record<string, SenaSkuDetail | null>;
  forceStaleUpdateReminder?: boolean;
  language: AppLanguage;
  observations: SenaObservationRecord[];
  orderBatches: SenaOrderBatchRecord[];
  recordUpdateContext?: SenaRecordUpdateContext | null;
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

  const visibleCatalog = activeSenaCatalog(catalog);
  if (!visibleCatalog) {
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

  const skuTasks = workspaceSummary.skuSummaries
    .map((summary) =>
      buildTask({
        catalog: visibleCatalog,
        detail: detailBySkuId[summary.skuId] ?? null,
        language,
        observations,
        orderBatches,
        recordUpdateContext,
        summary,
        workspaceLatestObservedAt: workspaceSummary.latestObservedAt,
      }),
    )
    .filter((value): value is OverviewSkuTask => value != null);
  const supplierTickets = collectSupplierTickets({ observations, recordUpdateContext });
  const tasks = groupSupplierTicketTasks(skuTasks, language, supplierTickets);
  const staleUpdateReminderTask = buildStaleUpdateReminderTask({
    forceVisible: forceStaleUpdateReminder ?? false,
    language,
    observations,
    snoozeUntil: staleUpdateReminderSnoozeUntil ?? null,
  });
  const allTasks = (staleUpdateReminderTask ? [staleUpdateReminderTask, ...tasks] : tasks).sort(compareOverviewTasksFifo);

  const inTransit = skuTasks
    .filter((task) =>
      task.state === 'awaiting_receipt' ||
      task.state === 'follow_up_today' ||
      task.state === 'ready_to_receive',
    )
    .map((task) => ({
      id: task.id,
      skuId: task.skuId,
      name: task.skuName,
      imagePath: task.imagePath,
      supplierName: task.supplierName,
      etaLabel: task.etaLabel,
    }))
    .slice(0, 4);

  const recentReceipts = skuTasks
    .filter((task) => task.latestReceiptAt)
    .sort((left, right) => timestampSortValue(right.latestReceiptAt) - timestampSortValue(left.latestReceiptAt))
    .map((task) => ({
      id: `receipt:${task.skuId}`,
      skuId: task.skuId,
      name: task.skuName,
      imagePath: task.imagePath,
      supplierName: task.supplierName,
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
    signals: buildSignals(skuTasks, language),
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

  if (task.kind === 'supplier_ticket') {
    return [
      task.displayTicketLabel,
      task.displayTicketId,
      task.ticketId,
      task.supplierName,
      task.skuSummaryLabel,
      ...task.skuNames,
      task.whyNow,
      task.whyDetail,
      task.etaLabel,
      task.stateLabel,
    ]
      .join(' ')
      .toLowerCase()
      .includes(normalized);
  }

  return [
    task.skuName,
    task.supplierName,
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
  if (task.state === 'received_today') {
    return filter === 'received_today';
  }
  return filter === 'all' || task.state === filter;
}

export function isOverviewSkuTask(task: OverviewTask): task is OverviewSkuTask {
  return task.kind === 'sku';
}

export function isOverviewSupplierTicketTask(task: OverviewTask): task is OverviewSupplierTicketTask {
  return task.kind === 'supplier_ticket';
}

export function relativeReceiptLabel(value: string | null, language: AppLanguage) {
  if (!value) {
    return translateUiLiteral(language, 'Recent');
  }
  if (isSameLocalDay(value)) {
    return translateUiLiteral(language, 'Today');
  }
  const start = todayStart();
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) {
    return translateUiLiteral(language, 'Recent');
  }
  const diffDays = Math.round((date.getTime() - start.getTime()) / 86_400_000);
  if (diffDays === -1) {
    return translateUiLiteral(language, 'Yesterday');
  }
  return diffDays <= -2 ? formatSenaDate(value, language) : translateUiLiteral(language, 'Recent');
}

export function nextCheckLabel(value: string | null, language: AppLanguage) {
  const days = diffDaysFromNow(value);
  if (days == null) {
    return translateUiLiteral(language, 'Next check pending');
  }
  if (days <= 0.5) {
    return translateUiLiteral(language, 'Check today');
  }
  if (days <= 1.5) {
    return translateUiLiteral(language, 'Check tomorrow');
  }
  return translateUiLiteral(language, 'Check {date}', { date: formatSenaDate(value, language) });
}
