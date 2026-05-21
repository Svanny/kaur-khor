import type { AppLanguage } from '@shared/inventory';
import type { AutomationIntakeLine, AutomationOrderIntake } from '@shared/automation';
import { formatPhoneForDisplay } from '@shared/phone';
import type { SenaCatalog, SenaObservationRecord, SenaRecordUpdateContext, SenaTicketLine, SenaTicketSummary } from '@shared/sena';
import {
  buildServiceCommercialSnapshots,
  buildSkuCommercialSnapshots,
  filterObservationsForDays,
  observationCommercialSummary,
} from '@/lib/records/commercial-flow';
import {
  buildCaptureSessionHref,
  RECORD_UPDATE_CUSTOMER_COMPLETED_PATH,
  RECORD_UPDATE_CUSTOMER_PENDING_PATH,
  type OverviewTaskAction,
} from '@/lib/navigation/record-update-routes';
import { formatLocalDateInputValue } from '@/lib/formatting/date-input-utils';
import { buildAutomationHref } from '@/lib/navigation/navigation-state';
import type { StatusPillTone } from '@/lib/ui/state-tones';
import { translateUiLiteral } from '@/lib/localization/translations';

export type OverviewCustomerFilter =
  | 'all'
  | 'review'
  | 'quoted'
  | 'open'
  | 'closed';

export interface OverviewCustomerTask {
  id: string;
  entityId: string | null;
  entityType: 'sku' | 'service';
  label: string;
  displayTicketId?: string;
  displayTicketLabel?: string;
  imagePath: string | null;
  action: OverviewTaskAction;
  actionLabel: string;
  href: string;
  pendingQuantity: number;
  completedToday: number;
  canceledToday: number;
  blockedQuantity: number;
  state: Exclude<OverviewCustomerFilter, 'all'>;
  stateLabel: string;
  stateBadgeTone: StatusPillTone;
  whyNow: string;
  whyDetail: string;
  summary: string | null;
  contactSummary: string;
  contactDetail: string | null;
  requestSummary: string;
  requestDetail: string | null;
  source: 'customer_aggregate' | 'customer_ticket' | 'telegram_intake';
  sourceLabel: string;
  queueEnteredAt: string | null;
  ticket?: SenaTicketSummary;
  ticketId?: string | null;
  ticketLineCount?: number;
  ticketLineSummaryLabel?: string;
  ticketLineNames?: string[];
  isLegacyFallback?: boolean;
  automationIntakeId?: string;
  promotedTicketId?: string | null;
  sourceBadgeTone: StatusPillTone;
}

export interface OverviewCustomerModel {
  tasks: OverviewCustomerTask[];
  counts: Record<Exclude<OverviewCustomerFilter, 'all'>, number>;
  signals: Array<{ id: string; text: string }>;
}

function literal(language: AppLanguage, englishTemplate: string, variables?: Record<string, string | number | null | undefined>) {
  return translateUiLiteral(language, englishTemplate, variables);
}

function buildTicketEditHref(ticketId: string) {
  return `${RECORD_UPDATE_CUSTOMER_PENDING_PATH}?ticketMode=edit&ticketId=${encodeURIComponent(ticketId)}`;
}

function customerLabel(intake: AutomationOrderIntake, language: AppLanguage) {
  return (intake.customerDisplayName ?? intake.customerHandle ?? formatPhoneForDisplay(intake.phone)) || literal(language, 'Telegram customer');
}

function requestSummary(lines: AutomationIntakeLine[], language: AppLanguage) {
  const visible = lines.slice(0, 2).map((line) => {
    const label = line.resolvedLabel ?? line.requestedLabel;
    return line.quantity != null
      ? literal(language, '{quantity} x {label}', { label, quantity: line.quantity })
      : label;
  });
  const overflow = lines.length - visible.length;
  const summary = overflow > 0
    ? literal(language, '{items} +{overflow} more', { items: visible.join(', '), overflow })
    : visible.join(', ');
  return summary || literal(language, 'Telegram intake');
}

function itemName(catalog: SenaCatalog, line: Pick<SenaTicketLine, 'entityId' | 'entityType'>, language: AppLanguage) {
  if (line.entityType === 'sku') {
    return catalog.skus.find((sku) => sku.skuId === line.entityId)?.name ?? literal(language, 'SKU');
  }
  return catalog.services.find((service) => service.serviceId === line.entityId)?.name ?? literal(language, 'Service');
}

function lineQuantity(line: SenaTicketLine) {
  const quantity = line.quantityDelta ?? line.orderedQuantity ?? line.receivedQuantity ?? 1;
  return Number.isFinite(quantity) ? Math.abs(quantity) : 0;
}

function commercialEventQuantity(event: { quantityDelta: number }) {
  return Number.isFinite(event.quantityDelta) ? event.quantityDelta : 0;
}

function ticketLineSummary(catalog: SenaCatalog, lines: SenaTicketLine[], language: AppLanguage) {
  const visible = lines.slice(0, 2).map((line) =>
    literal(language, '{quantity} x {label}', {
      label: itemName(catalog, line, language),
      quantity: lineQuantity(line),
    }),
  );
  const overflow = lines.length - visible.length;
  if (visible.length === 0) {
    return literal(language, 'No line items');
  }
  return overflow > 0
    ? literal(language, '{items} +{overflow} more', { items: visible.join(', '), overflow })
    : visible.join(', ');
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

function ticketDisplaySortValue(value: string | null | undefined) {
  if (!value) {
    return Number.POSITIVE_INFINITY;
  }
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : Number.POSITIVE_INFINITY;
}

function customerTicketDisplayLabels(recordUpdateContext: SenaRecordUpdateContext | null | undefined) {
  const labels = new Map<string, string>();
  const tickets = Object.values(recordUpdateContext?.latestTicketsById ?? {})
    .map((anchor) => anchor.value)
    .filter((ticket) => ticket.ticketFamily === 'customer')
    .sort((left, right) =>
      ticketDisplaySortValue(left.occurredAt) - ticketDisplaySortValue(right.occurredAt) ||
      ticketDisplayDate(left.occurredAt).localeCompare(ticketDisplayDate(right.occurredAt)) ||
      left.ticketId.localeCompare(right.ticketId),
    );
  const countByDate = new Map<string, number>();

  for (const ticket of tickets) {
    const date = ticketDisplayDate(ticket.occurredAt);
    const count = (countByDate.get(date) ?? 0) + 1;
    countByDate.set(date, count);
    labels.set(ticket.ticketId, `${date}-#${count}`);
  }

  return labels;
}

function ticketContactSummary(ticket: SenaTicketSummary, language: AppLanguage) {
  return ticket.party?.customerName
    ?? (ticket.party?.phone ? formatPhoneForDisplay(ticket.party.phone) : null)
    ?? ticket.party?.channelLabel
    ?? ticket.party?.channelKey
    ?? literal(language, 'No customer details');
}

function ticketContactDetail(ticket: SenaTicketSummary) {
  const parts = [
    ticket.party?.phone ? formatPhoneForDisplay(ticket.party.phone) : null,
    ticket.party?.channelLabel ?? ticket.party?.channelKey ?? null,
    ticket.party?.location ?? null,
  ].filter((value): value is string => Boolean(value));
  return parts.length > 0 ? parts.join(' · ') : null;
}

function ticketTimingDetail(ticket: SenaTicketSummary, language: AppLanguage) {
  const expectedArrival = ticket.lines.find((line) => line.expectedArrivalAt)?.expectedArrivalAt;
  if (expectedArrival) {
    const expectedArrivalDate = new Date(expectedArrival);
    return Number.isNaN(expectedArrivalDate.valueOf())
      ? ticket.note ?? null
      : literal(language, 'ETA {value}', { value: expectedArrivalDate.toLocaleDateString() });
  }
  if (ticket.nextTouchAt) {
    const nextTouchDate = new Date(ticket.nextTouchAt);
    return Number.isNaN(nextTouchDate.valueOf())
      ? ticket.note ?? null
      : literal(language, 'Next touch {value}', { value: nextTouchDate.toLocaleDateString() });
  }
  return null;
}

function isSameLocalDay(value: string | null | undefined, reference = new Date()) {
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

function automationTaskState(intake: AutomationOrderIntake): Exclude<OverviewCustomerFilter, 'all'> {
  switch (intake.status) {
    case 'new':
    case 'needs_review':
    case 'failed':
      return 'review';
    case 'quoted':
      return 'quoted';
    case 'ticketed':
      return 'open';
    case 'completed':
    case 'canceled':
      return 'closed';
    default:
      return 'review';
  }
}

function automationTaskHref(intake: AutomationOrderIntake, state: Exclude<OverviewCustomerFilter, 'all'>) {
  if (intake.promotedTicketId && (state === 'open' || state === 'closed')) {
    return buildTicketEditHref(intake.promotedTicketId);
  }

  return buildAutomationHref({
    section: state === 'review' && (intake.status === 'needs_review' || intake.status === 'failed') ? 'exceptions' : 'intake',
    conversationId: intake.conversationId,
    intakeId: intake.intakeId,
    ticketId: intake.promotedTicketId,
  });
}

function automationTaskAction(intake: AutomationOrderIntake, language: AppLanguage, state: Exclude<OverviewCustomerFilter, 'all'>) {
  if (intake.promotedTicketId && state === 'open') {
    return {
      action: 'open_pending' as const,
      actionLabel: literal(language, 'Open ticket'),
    };
  }

  if (intake.promotedTicketId && state === 'closed') {
    return {
      action: 'review_cancellation' as const,
      actionLabel: literal(language, 'Open ticket'),
    };
  }

  if (state === 'closed') {
    return {
      action: 'review_cancellation' as const,
      actionLabel: literal(language, 'Open intake'),
    };
  }

  return {
    action: 'review' as const,
    actionLabel: literal(language, 'Open intake'),
  };
}

function automationTaskWhyNow(
  intake: AutomationOrderIntake,
  language: AppLanguage,
  state: Exclude<OverviewCustomerFilter, 'all'>,
) {
  switch (state) {
    case 'review':
      return intake.status === 'new'
        ? literal(language, 'Telegram intake is waiting for the first operator pass')
        : literal(language, 'Telegram intake needs operator review before quoting');
    case 'quoted':
      return literal(language, 'Telegram quote is ready for operator confirmation');
    case 'open':
      return literal(language, intake.promotedTicketId ? 'Telegram intake was promoted and is now live customer work' : 'Telegram intake is waiting for customer follow-through');
    case 'closed':
      return intake.status === 'completed'
        ? literal(language, 'Telegram-origin customer work completed today')
        : literal(language, 'Telegram-origin customer work was canceled today');
    default:
      return literal(language, 'Telegram intake is waiting for the first operator pass');
  }
}

function automationTaskWhyDetail(
  intake: AutomationOrderIntake,
  language: AppLanguage,
  state: Exclude<OverviewCustomerFilter, 'all'>,
) {
  if (state === 'review' && (intake.status === 'needs_review' || intake.status === 'failed')) {
    return literal(language, 'Kaur Khor kept this intake in Automations because the request is ambiguous, unsafe, or incomplete.');
  }
  if (state === 'quoted') {
    return literal(language, 'Kaur Khor already computed a quote, but promotion into ticket truth still needs an operator decision.');
  }
  if (state === 'open') {
    return literal(language, intake.promotedTicketId ? 'This Telegram intake already created customer ticket truth and now belongs to the main customer queue.' : 'This Telegram intake is still tracked from Automations.');
  }
  if (state === 'closed') {
    return literal(language, intake.promotedTicketId ? 'Kaur Khor keeps the ticket path as the source of truth after Telegram-origin work changes state.' : 'Kaur Khor still keeps the intake context in Automations because no customer ticket exists yet.');
  }
  return literal(language, 'Kaur Khor is holding this Telegram request in the intake queue until an operator decides what to do next.');
}

function customerTaskStateTone(state: Exclude<OverviewCustomerFilter, 'all'>): StatusPillTone {
  switch (state) {
    case 'review':
      return 'warning';
    case 'quoted':
      return 'info';
    case 'open':
      return 'success';
    case 'closed':
      return 'neutral';
    default:
      return 'neutral';
  }
}

function buildAutomationCustomerTasks({
  catalog,
  intakes,
  language,
  ticketById,
}: {
  catalog: SenaCatalog;
  intakes: AutomationOrderIntake[];
  language: AppLanguage;
  ticketById: Map<string, SenaTicketSummary>;
}): OverviewCustomerTask[] {
  return intakes.map((intake) => {
    const promotedTicket = intake.promotedTicketId ? ticketById.get(intake.promotedTicketId) ?? null : null;
    const firstLine = intake.lines[0] ?? null;
    const state = automationTaskState(intake);
    const action = automationTaskAction(intake, language, state);
    const entityType = promotedTicket?.lines[0]?.entityType ?? firstLine?.entityType ?? 'sku';
    const pendingQuantity = intake.status === 'ticketed' ? Math.max(1, intake.lines.length) : ['new', 'needs_review', 'quoted', 'failed'].includes(intake.status) ? 1 : 0;
    const completedToday = intake.status === 'completed' ? 1 : 0;
    const canceledToday = intake.status === 'canceled' ? 1 : 0;
    const contactSummary = promotedTicket ? ticketContactSummary(promotedTicket, language) : customerLabel(intake, language);
    const contactDetail = promotedTicket
      ? ticketContactDetail(promotedTicket)
      : [intake.customerHandle, intake.phone ? formatPhoneForDisplay(intake.phone) : null, intake.channel].filter(Boolean).join(' · ') || null;
    const promotedRequestSummary = promotedTicket ? ticketLineSummary(catalog, promotedTicket.lines, language) : null;

    return {
      id: `automation:intake:${intake.intakeId}`,
      entityId: promotedTicket?.lines[0]?.entityId ?? firstLine?.entityId ?? null,
      entityType,
      label: contactSummary,
      imagePath: null,
      action: action.action,
      actionLabel: action.actionLabel,
      href: automationTaskHref(intake, state),
      pendingQuantity,
      completedToday,
      canceledToday,
      blockedQuantity: state === 'review' && (intake.status === 'needs_review' || intake.status === 'failed') ? 1 : 0,
      state,
      stateLabel:
        state === 'review'
          ? literal(language, 'Review')
          : state === 'quoted'
            ? literal(language, 'Quoted')
            : state === 'closed'
              ? literal(language, 'Closed')
              : literal(language, 'Open'),
      stateBadgeTone: customerTaskStateTone(state),
      whyNow: automationTaskWhyNow(intake, language, state),
      whyDetail: automationTaskWhyDetail(intake, language, state),
      summary: promotedRequestSummary ?? requestSummary(intake.lines, language),
      contactSummary,
      contactDetail,
      requestSummary: promotedRequestSummary ?? requestSummary(intake.lines, language),
      requestDetail: promotedTicket ? ticketTimingDetail(promotedTicket, language) : intake.notes,
      source: 'telegram_intake',
      sourceLabel: literal(language, 'Telegram'),
      queueEnteredAt: intake.createdAt ?? intake.updatedAt,
      ticket: promotedTicket ?? undefined,
      ticketId: intake.promotedTicketId,
      automationIntakeId: intake.intakeId,
      promotedTicketId: intake.promotedTicketId,
      sourceBadgeTone: 'info',
    };
  });
}

function queueTimestamp(value: string | null | undefined) {
  if (!value) {
    return Number.POSITIVE_INFINITY;
  }
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? timestamp : Number.POSITIVE_INFINITY;
}

function compareCustomerTasksFifo(left: OverviewCustomerTask, right: OverviewCustomerTask) {
  const timestampGap = queueTimestamp(left.queueEnteredAt) - queueTimestamp(right.queueEnteredAt);
  if (timestampGap !== 0) {
    return timestampGap;
  }
  return 0;
}

export function shouldShowCustomerTask(task: OverviewCustomerTask, filter: OverviewCustomerFilter) {
  return filter === 'all' ? task.state !== 'closed' : task.state === filter;
}

function ticketTaskState(ticket: SenaTicketSummary): Exclude<OverviewCustomerFilter, 'all'> | null {
  if (ticket.lifecycle === 'open') {
    return ticket.stage === 'ready' ? 'review' : 'open';
  }
  if (isSameLocalDay(ticket.occurredAt)) {
    return 'closed';
  }
  return null;
}

function ticketTaskAction(ticket: SenaTicketSummary, language: AppLanguage) {
  if (ticket.lifecycle === 'open') {
    return {
      action: 'mark_completed' as const,
      actionLabel: literal(language, 'Review'),
    };
  }
  return {
    action: ticket.lifecycle === 'canceled' ? ('review_cancellation' as const) : ('review' as const),
    actionLabel: literal(language, 'Review'),
  };
}

function buildCustomerTicketTasks({
  catalog,
  displayLabels,
  language,
  tickets,
}: {
  catalog: SenaCatalog;
  displayLabels: Map<string, string>;
  language: AppLanguage;
  tickets: SenaTicketSummary[];
}) {
  return tickets.flatMap((ticket): OverviewCustomerTask[] => {
    if (ticket.ticketFamily !== 'customer') {
      return [];
    }
    const state = ticketTaskState(ticket);
    if (!state) {
      return [];
    }
    const action = ticketTaskAction(ticket, language);
    const firstLine = ticket.lines[0] ?? null;
    const pendingQuantity = ticket.lifecycle === 'open'
      ? ticket.lines.reduce((sum, line) => sum + lineQuantity(line), 0)
      : 0;
    const completedToday = ticket.lifecycle === 'resolved' && isSameLocalDay(ticket.occurredAt)
      ? ticket.lines.reduce((sum, line) => sum + lineQuantity(line), 0)
      : 0;
    const canceledToday = ticket.lifecycle === 'canceled' && isSameLocalDay(ticket.occurredAt)
      ? ticket.lines.reduce((sum, line) => sum + lineQuantity(line), 0)
      : 0;
    const contactSummary = ticketContactSummary(ticket, language);
    const request = ticketLineSummary(catalog, ticket.lines, language);
    const displayTicketId = displayLabels.get(ticket.ticketId) ?? `${ticketDisplayDate(ticket.occurredAt)}-#1`;
    const ticketLineNames = ticket.lines.map((line) => itemName(catalog, line, language));

    return [{
      id: `customer:ticket:${ticket.ticketId}`,
      entityId: firstLine?.entityId ?? null,
      entityType: firstLine?.entityType ?? 'sku',
      label: `Customer Ticket ID: ${displayTicketId}`,
      displayTicketId,
      displayTicketLabel: `Customer Ticket ID: ${displayTicketId}`,
      imagePath: null,
      action: action.action,
      actionLabel: action.actionLabel,
      href: buildTicketEditHref(ticket.ticketId),
      pendingQuantity,
      completedToday,
      canceledToday,
      blockedQuantity: state === 'review' ? pendingQuantity : 0,
      state,
      stateLabel:
        state === 'closed'
          ? literal(language, 'Closed')
          : state === 'review'
            ? literal(language, 'Review')
            : literal(language, 'Open'),
      stateBadgeTone: customerTaskStateTone(state),
      whyNow: request,
      whyDetail: ticket.note ?? '',
      summary: request,
      contactSummary,
      contactDetail: ticketContactDetail(ticket),
      requestSummary: request,
      requestDetail: ticketTimingDetail(ticket, language) ?? ticket.note ?? null,
      source: 'customer_ticket',
      sourceLabel: literal(language, 'Customer ticket'),
      queueEnteredAt: ticket.lifecycle === 'open' ? ticket.occurredAt : ticket.occurredAt,
      ticket,
      ticketId: ticket.ticketId,
      ticketLineCount: ticket.lines.length,
      ticketLineSummaryLabel: request,
      ticketLineNames,
      promotedTicketId: null,
      sourceBadgeTone: 'neutral',
    }];
  });
}

export function buildCustomerOverviewModel({
  automationIntakes = [],
  catalog,
  language,
  observations,
  recordUpdateContext,
}: {
  automationIntakes?: AutomationOrderIntake[];
  catalog: SenaCatalog | null;
  language: AppLanguage;
  observations: SenaObservationRecord[];
  recordUpdateContext?: SenaRecordUpdateContext | null;
}): OverviewCustomerModel {
  if (!catalog) {
    return {
      tasks: [],
      counts: {
        review: 0,
        quoted: 0,
        open: 0,
        closed: 0,
      },
      signals: [],
    };
  }

  const skuSnapshots = buildSkuCommercialSnapshots({ observations, rangeDays: 30 });
  const serviceSnapshots = buildServiceCommercialSnapshots({ catalog, observations, rangeDays: 30 });
  const daySnapshots = filterObservationsForDays(observations, 1);
  const dayEvents = daySnapshots.flatMap((observation) => observation.input.commercialEvents ?? []);
  const daySummary = observationCommercialSummary(dayEvents);
  const customerCanceledToday = dayEvents
    .filter((event) => event.party === 'customer' && event.stage === 'pending' && commercialEventQuantity(event) < 0)
    .reduce((sum, event) => sum + Math.abs(commercialEventQuantity(event)), 0);
  const tasks: OverviewCustomerTask[] = [];
  const latestCustomerTickets = Object.values(recordUpdateContext?.latestTicketsById ?? {})
    .map((anchor) => anchor.value)
    .filter((ticket) => ticket.ticketFamily === 'customer');
  const ticketById = new Map(latestCustomerTickets.map((ticket) => [ticket.ticketId, ticket]));
  const displayLabels = customerTicketDisplayLabels(recordUpdateContext);
  const ticketEntityKeys = new Set(
    latestCustomerTickets.flatMap((ticket) =>
      ticket.lines.map((line) => `${line.entityType}:${line.entityId}`),
    ),
  );

  tasks.push(...buildCustomerTicketTasks({
    catalog,
    displayLabels,
    language,
    tickets: latestCustomerTickets,
  }));

  for (const sku of catalog.skus.filter((entry) => !entry.archived && entry.soldAsProduct)) {
    const snapshot = skuSnapshots.get(sku.skuId);
    if (!snapshot) {
      continue;
    }
    if (ticketEntityKeys.has(`sku:${sku.skuId}`)) {
      continue;
    }
    const completedToday = dayEvents
      .filter((event) => event.party === 'customer' && event.entityType === 'sku' && event.entityId === sku.skuId && event.stage === 'realized' && commercialEventQuantity(event) > 0)
      .reduce((sum, event) => sum + commercialEventQuantity(event), 0);
    const canceledToday = dayEvents
      .filter((event) => event.party === 'customer' && event.entityType === 'sku' && event.entityId === sku.skuId && event.stage === 'pending' && commercialEventQuantity(event) < 0)
      .reduce((sum, event) => sum + Math.abs(commercialEventQuantity(event)), 0);
    const state: OverviewCustomerTask['state'] =
      snapshot.pendingQuantity > 0
        ? snapshot.blockedPendingQuantity > 0
          ? 'review'
          : 'open'
        : completedToday > 0 || canceledToday > 0
          ? 'closed'
          : 'open';
    if (snapshot.pendingQuantity <= 0 && completedToday <= 0 && canceledToday <= 0) {
      continue;
    }
    tasks.push({
      id: `customer:sku:${sku.skuId}`,
      entityId: sku.skuId,
      entityType: 'sku',
      label: sku.name,
      imagePath: sku.imagePath ?? null,
      action: state === 'closed' ? (canceledToday > 0 ? 'review_cancellation' : 'mark_completed') : state === 'review' ? 'open_pending' : 'mark_completed',
      actionLabel:
        state === 'closed'
          ? (canceledToday > 0 ? literal(language, 'Review cancellation') : literal(language, 'Review completion'))
          : state === 'review'
            ? literal(language, 'Open pending')
            : literal(language, 'Mark completed'),
      href:
        state === 'open'
          ? buildCaptureSessionHref({ action: 'immediate-sale', targetId: sku.skuId, targetType: 'sku' })
          : state === 'closed' && completedToday > 0
          ? `${RECORD_UPDATE_CUSTOMER_COMPLETED_PATH}?skus=${encodeURIComponent(sku.skuId)}`
          : `${RECORD_UPDATE_CUSTOMER_PENDING_PATH}?skus=${encodeURIComponent(sku.skuId)}`,
      pendingQuantity: snapshot.pendingQuantity,
      completedToday,
      canceledToday,
      blockedQuantity: snapshot.blockedPendingQuantity,
      state,
      stateLabel:
        state === 'closed'
          ? literal(language, 'Closed')
          : state === 'review'
            ? literal(language, 'Review')
            : literal(language, 'Open'),
      stateBadgeTone: customerTaskStateTone(state),
      whyNow:
        state === 'review'
          ? literal(language, '{count} open customer order{suffix} blocked by stock', {
              count: snapshot.blockedPendingQuantity,
              suffix: snapshot.blockedPendingQuantity === 1 ? '' : 's',
            })
          : state === 'closed'
            ? canceledToday > 0
              ? literal(language, '{count} retail order{suffix} canceled today', {
                  count: canceledToday,
                  suffix: canceledToday === 1 ? '' : 's',
                })
              : literal(language, '{count} retail order{suffix} completed today', {
                  count: completedToday,
                  suffix: completedToday === 1 ? '' : 's',
                })
              : literal(language, '{count} open retail order{suffix}', {
                  count: snapshot.pendingQuantity,
                  suffix: snapshot.pendingQuantity === 1 ? '' : 's',
                }),
      whyDetail: literal(language, 'Kaur Khor is tracking this from customer order signals recorded in Record Updates.'),
      summary: null,
      contactSummary: literal(language, 'Legacy customer signal'),
      contactDetail: null,
      requestSummary: sku.name,
      requestDetail: literal(language, 'No ticket metadata saved for this row.'),
      source: 'customer_aggregate',
      sourceLabel: literal(language, 'Legacy signal'),
      queueEnteredAt: snapshot.oldestOpenPendingAt ?? snapshot.latestObservedAt,
      ticketId: null,
      isLegacyFallback: true,
      promotedTicketId: null,
      sourceBadgeTone: 'warning',
    });
  }

  for (const service of catalog.services.filter((entry) => !entry.archived)) {
    const snapshot = serviceSnapshots.get(service.serviceId);
    if (!snapshot) {
      continue;
    }
    if (ticketEntityKeys.has(`service:${service.serviceId}`)) {
      continue;
    }
    const completedToday = dayEvents
      .filter((event) => event.party === 'customer' && event.entityType === 'service' && event.entityId === service.serviceId && event.stage === 'realized' && commercialEventQuantity(event) > 0)
      .reduce((sum, event) => sum + commercialEventQuantity(event), 0);
    const canceledToday = dayEvents
      .filter((event) => event.party === 'customer' && event.entityType === 'service' && event.entityId === service.serviceId && event.stage === 'pending' && commercialEventQuantity(event) < 0)
      .reduce((sum, event) => sum + Math.abs(commercialEventQuantity(event)), 0);
    const state: OverviewCustomerTask['state'] =
      snapshot.pendingQuantity > 0
        ? snapshot.blockedPendingQuantity > 0
          ? 'review'
          : 'open'
        : completedToday > 0 || canceledToday > 0
          ? 'closed'
          : 'open';
    if (snapshot.pendingQuantity <= 0 && completedToday <= 0 && canceledToday <= 0) {
      continue;
    }
    tasks.push({
      id: `customer:service:${service.serviceId}`,
      entityId: service.serviceId,
      entityType: 'service',
      label: service.name,
      imagePath: service.imagePath ?? null,
      action: state === 'closed' ? (canceledToday > 0 ? 'review_cancellation' : 'mark_completed') : state === 'review' ? 'open_pending' : 'mark_completed',
      actionLabel:
        state === 'closed'
          ? (canceledToday > 0 ? literal(language, 'Review cancellation') : literal(language, 'Review completion'))
          : state === 'review'
            ? literal(language, 'Open pending')
            : literal(language, 'Mark completed'),
      href:
        state === 'open'
          ? buildCaptureSessionHref({ action: 'immediate-sale', targetId: service.serviceId, targetType: 'service' })
          : state === 'closed' && completedToday > 0
          ? buildCaptureSessionHref({ action: 'customer-order', targetId: service.serviceId, targetType: 'service' })
          : buildCaptureSessionHref({ action: 'customer-order', targetId: service.serviceId, targetType: 'service' }),
      pendingQuantity: snapshot.pendingQuantity,
      completedToday,
      canceledToday,
      blockedQuantity: snapshot.blockedPendingQuantity,
      state,
      stateLabel:
        state === 'closed'
          ? literal(language, 'Closed')
          : state === 'review'
            ? literal(language, 'Review')
            : literal(language, 'Open'),
      stateBadgeTone: customerTaskStateTone(state),
      whyNow:
        state === 'review'
          ? literal(language, '{count} open service order{suffix} blocked by availability', {
              count: snapshot.blockedPendingQuantity,
              suffix: snapshot.blockedPendingQuantity === 1 ? '' : 's',
            })
          : state === 'closed'
            ? canceledToday > 0
              ? literal(language, '{count} service order{suffix} canceled today', {
                  count: canceledToday,
                  suffix: canceledToday === 1 ? '' : 's',
                })
              : literal(language, '{count} service order{suffix} completed today', {
                  count: completedToday,
                  suffix: completedToday === 1 ? '' : 's',
                })
              : literal(language, '{count} open service order{suffix}', {
                  count: snapshot.pendingQuantity,
                  suffix: snapshot.pendingQuantity === 1 ? '' : 's',
                }),
      whyDetail: literal(language, 'Kaur Khor is tracking this from customer order signals recorded in Record Updates.'),
      summary: null,
      contactSummary: literal(language, 'Legacy customer signal'),
      contactDetail: null,
      requestSummary: service.name,
      requestDetail: literal(language, 'No ticket metadata saved for this row.'),
      source: 'customer_aggregate',
      sourceLabel: literal(language, 'Legacy signal'),
      queueEnteredAt: snapshot.oldestOpenPendingAt ?? snapshot.latestObservedAt,
      ticketId: null,
      isLegacyFallback: true,
      promotedTicketId: null,
      sourceBadgeTone: 'warning',
    });
  }

  tasks.push(...buildAutomationCustomerTasks({ catalog, intakes: automationIntakes, language, ticketById }));

  const counts = {
    review: tasks.filter((task) => task.state === 'review').length,
    quoted: tasks.filter((task) => task.state === 'quoted').length,
    open: tasks.filter((task) => task.state === 'open').length,
    closed: tasks.filter((task) => task.state === 'closed').length,
  };

  return {
    tasks: [...tasks].sort(compareCustomerTasksFifo),
    counts,
    signals: [
      {
        id: 'customer-completed',
        text: literal(language, '{count} customer completion signal{suffix} landed today', {
          count: daySummary.customerCompleted,
          suffix: daySummary.customerCompleted === 1 ? '' : 's',
        }),
      },
      {
        id: 'customer-canceled',
        text: literal(language, '{count} customer cancellation change{suffix} landed today', {
          count: customerCanceledToday,
          suffix: customerCanceledToday === 1 ? '' : 's',
        }),
      },
    ],
  };
}
