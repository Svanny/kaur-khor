import type { AppLanguage } from '@shared/inventory';
import type { AutomationIntakeLine, AutomationOrderIntake } from '@shared/automation';
import { formatPhoneForDisplay } from '@shared/phone';
import type { SenaCatalog, SenaObservationRecord } from '@shared/sena';
import {
  buildServiceCommercialSnapshots,
  buildSkuCommercialSnapshots,
  filterObservationsForDays,
  observationCommercialSummary,
} from '@/lib/commercial-flow';
import {
  buildCaptureSessionHref,
  RECORD_UPDATE_CUSTOMER_COMPLETED_PATH,
  RECORD_UPDATE_CUSTOMER_PENDING_PATH,
  type OverviewTaskAction,
} from '@/lib/record-update-routes';
import { buildAutomationHref } from '@/lib/navigation-state';
import type { StatusPillTone } from '@/lib/state-tones';
import { translateUiLiteral } from '@/lib/translations';

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
  source: 'customer_aggregate' | 'telegram_intake';
  sourceLabel: string;
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

function customerLabel(intake: AutomationOrderIntake) {
  return (intake.customerDisplayName ?? intake.customerHandle ?? formatPhoneForDisplay(intake.phone)) || 'Telegram customer';
}

function requestSummary(lines: AutomationIntakeLine[]) {
  const visible = lines.slice(0, 2).map((line) => {
    const quantity = line.quantity != null ? `${line.quantity} x ` : '';
    return `${quantity}${line.resolvedLabel ?? line.requestedLabel}`;
  });
  const overflow = lines.length - visible.length;
  const summary = overflow > 0 ? `${visible.join(', ')} +${overflow} more` : visible.join(', ');
  return summary || 'Telegram intake';
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
    return literal(language, 'banji kept this intake in Automations because the request is ambiguous, unsafe, or incomplete.');
  }
  if (state === 'quoted') {
    return literal(language, 'banji already computed a quote, but promotion into ticket truth still needs an operator decision.');
  }
  if (state === 'open') {
    return literal(language, intake.promotedTicketId ? 'This Telegram intake already created customer ticket truth and now belongs to the main customer queue.' : 'This Telegram intake is still tracked from Automations.');
  }
  if (state === 'closed') {
    return literal(language, intake.promotedTicketId ? 'banji keeps the ticket path as the source of truth after Telegram-origin work changes state.' : 'banji still keeps the intake context in Automations because no customer ticket exists yet.');
  }
  return literal(language, 'banji is holding this Telegram request in the intake queue until an operator decides what to do next.');
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

function buildAutomationCustomerTasks(intakes: AutomationOrderIntake[], language: AppLanguage): OverviewCustomerTask[] {
  return intakes.map((intake) => {
    const firstLine = intake.lines[0] ?? null;
    const state = automationTaskState(intake);
    const action = automationTaskAction(intake, language, state);
    const entityType = firstLine?.entityType ?? 'sku';
    const pendingQuantity = intake.status === 'ticketed' ? Math.max(1, intake.lines.length) : ['new', 'needs_review', 'quoted', 'failed'].includes(intake.status) ? 1 : 0;
    const completedToday = intake.status === 'completed' ? 1 : 0;
    const canceledToday = intake.status === 'canceled' ? 1 : 0;

    return {
      id: `automation:intake:${intake.intakeId}`,
      entityId: firstLine?.entityId ?? null,
      entityType,
      label: customerLabel(intake),
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
      summary: requestSummary(intake.lines),
      source: 'telegram_intake',
      sourceLabel: 'Telegram',
      automationIntakeId: intake.intakeId,
      promotedTicketId: intake.promotedTicketId,
      sourceBadgeTone: 'info',
    };
  });
}

export function shouldShowCustomerTask(task: OverviewCustomerTask, filter: OverviewCustomerFilter) {
  return filter === 'all' ? true : task.state === filter;
}

export function buildCustomerOverviewModel({
  automationIntakes = [],
  catalog,
  language,
  observations,
}: {
  automationIntakes?: AutomationOrderIntake[];
  catalog: SenaCatalog | null;
  language: AppLanguage;
  observations: SenaObservationRecord[];
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
    .filter((event) => event.party === 'customer' && event.stage === 'pending' && event.quantityDelta < 0)
    .reduce((sum, event) => sum + Math.abs(event.quantityDelta), 0);
  const tasks: OverviewCustomerTask[] = [];

  for (const sku of catalog.skus.filter((entry) => !entry.archived && entry.soldAsProduct)) {
    const snapshot = skuSnapshots.get(sku.skuId);
    if (!snapshot) {
      continue;
    }
    const completedToday = dayEvents
      .filter((event) => event.party === 'customer' && event.entityType === 'sku' && event.entityId === sku.skuId && event.stage === 'realized' && event.quantityDelta > 0)
      .reduce((sum, event) => sum + event.quantityDelta, 0);
    const canceledToday = dayEvents
      .filter((event) => event.party === 'customer' && event.entityType === 'sku' && event.entityId === sku.skuId && event.stage === 'pending' && event.quantityDelta < 0)
      .reduce((sum, event) => sum + Math.abs(event.quantityDelta), 0);
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
        state === 'closed' && completedToday > 0
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
      whyDetail: literal(language, 'banji is tracking this from customer order signals recorded in Record Updates.'),
      summary: null,
      source: 'customer_aggregate',
      sourceLabel: literal(language, 'Customer queue'),
      promotedTicketId: null,
      sourceBadgeTone: 'neutral',
    });
  }

  for (const service of catalog.services.filter((entry) => !entry.archived)) {
    const snapshot = serviceSnapshots.get(service.serviceId);
    if (!snapshot) {
      continue;
    }
    const completedToday = dayEvents
      .filter((event) => event.party === 'customer' && event.entityType === 'service' && event.entityId === service.serviceId && event.stage === 'realized' && event.quantityDelta > 0)
      .reduce((sum, event) => sum + event.quantityDelta, 0);
    const canceledToday = dayEvents
      .filter((event) => event.party === 'customer' && event.entityType === 'service' && event.entityId === service.serviceId && event.stage === 'pending' && event.quantityDelta < 0)
      .reduce((sum, event) => sum + Math.abs(event.quantityDelta), 0);
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
        state === 'closed' && completedToday > 0
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
      whyDetail: literal(language, 'banji is tracking this from customer order signals recorded in Record Updates.'),
      summary: null,
      source: 'customer_aggregate',
      sourceLabel: literal(language, 'Customer queue'),
      promotedTicketId: null,
      sourceBadgeTone: 'neutral',
    });
  }

  tasks.push(...buildAutomationCustomerTasks(automationIntakes, language));

  const counts = {
    review: tasks.filter((task) => task.state === 'review').length,
    quoted: tasks.filter((task) => task.state === 'quoted').length,
    open: tasks.filter((task) => task.state === 'open').length,
    closed: tasks.filter((task) => task.state === 'closed').length,
  };

  return {
    tasks,
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
