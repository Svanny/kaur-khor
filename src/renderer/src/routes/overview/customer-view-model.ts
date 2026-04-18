import type { AppLanguage } from '@shared/inventory';
import type { SenaCatalog, SenaObservationRecord } from '@shared/sena';
import {
  buildServiceCommercialSnapshots,
  buildSkuCommercialSnapshots,
  filterObservationsForDays,
  observationCommercialSummary,
} from '@/lib/commercial-flow';
import {
  RECORD_UPDATE_CUSTOMER_COMPLETED_PATH,
  RECORD_UPDATE_CUSTOMER_PENDING_PATH,
  type OverviewTaskAction,
} from '@/lib/record-update-routes';
import { translateUiLiteral } from '@/lib/translations';

export type OverviewCustomerFilter =
  | 'all'
  | 'open'
  | 'need_stock'
  | 'ready_to_complete'
  | 'completed_today'
  | 'canceled_today';

export interface OverviewCustomerTask {
  id: string;
  entityId: string;
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
  whyNow: string;
  whyDetail: string;
}

export interface OverviewCustomerModel {
  tasks: OverviewCustomerTask[];
  counts: Record<Exclude<OverviewCustomerFilter, 'all'>, number>;
  signals: Array<{ id: string; text: string }>;
}

function literal(language: AppLanguage, englishTemplate: string, variables?: Record<string, string | number | null | undefined>) {
  return translateUiLiteral(language, englishTemplate, variables);
}

export function shouldShowCustomerTask(task: OverviewCustomerTask, filter: OverviewCustomerFilter) {
  return filter === 'all' ? true : task.state === filter;
}

export function buildCustomerOverviewModel({
  catalog,
  language,
  observations,
}: {
  catalog: SenaCatalog | null;
  language: AppLanguage;
  observations: SenaObservationRecord[];
}): OverviewCustomerModel {
  if (!catalog) {
    return {
      tasks: [],
      counts: {
        open: 0,
        need_stock: 0,
        ready_to_complete: 0,
        completed_today: 0,
        canceled_today: 0,
      },
      signals: [],
    };
  }

  const skuSnapshots = buildSkuCommercialSnapshots({ observations, rangeDays: 30 });
  const serviceSnapshots = buildServiceCommercialSnapshots({ catalog, observations, rangeDays: 30 });
  const daySnapshots = filterObservationsForDays(observations, 1);
  const dayEvents = daySnapshots.flatMap((observation) => observation.input.commercialEvents ?? []);
  const daySummary = observationCommercialSummary(dayEvents);
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
      completedToday > 0
        ? 'completed_today'
        : canceledToday > 0
          ? 'canceled_today'
          : snapshot.blockedPendingQuantity > 0
            ? 'need_stock'
            : snapshot.pendingQuantity > 0
              ? 'ready_to_complete'
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
      action: state === 'completed_today' ? 'mark_completed' : state === 'canceled_today' ? 'review_cancellation' : state === 'need_stock' ? 'open_pending' : 'mark_completed',
      actionLabel:
        state === 'completed_today'
          ? literal(language, 'Review completion')
          : state === 'canceled_today'
            ? literal(language, 'Review cancellation')
            : state === 'need_stock'
              ? literal(language, 'Open pending')
              : literal(language, 'Mark completed'),
      href:
        state === 'completed_today'
          ? `${RECORD_UPDATE_CUSTOMER_COMPLETED_PATH}?skus=${encodeURIComponent(sku.skuId)}`
          : `${RECORD_UPDATE_CUSTOMER_PENDING_PATH}?skus=${encodeURIComponent(sku.skuId)}`,
      pendingQuantity: snapshot.pendingQuantity,
      completedToday,
      canceledToday,
      blockedQuantity: snapshot.blockedPendingQuantity,
      state,
      stateLabel:
        state === 'completed_today'
          ? literal(language, 'Completed today')
          : state === 'canceled_today'
            ? literal(language, 'Canceled today')
            : state === 'need_stock'
              ? literal(language, 'Need stock')
              : state === 'ready_to_complete'
                ? literal(language, 'Ready to complete')
                : literal(language, 'Open'),
      whyNow:
        state === 'need_stock'
          ? literal(language, '{count} open customer order{suffix} blocked by stock', {
              count: snapshot.blockedPendingQuantity,
              suffix: snapshot.blockedPendingQuantity === 1 ? '' : 's',
            })
          : state === 'completed_today'
            ? literal(language, '{count} retail order{suffix} completed today', {
                count: completedToday,
                suffix: completedToday === 1 ? '' : 's',
              })
            : state === 'canceled_today'
              ? literal(language, '{count} retail order{suffix} canceled today', {
                  count: canceledToday,
                  suffix: canceledToday === 1 ? '' : 's',
                })
              : literal(language, '{count} open retail order{suffix}', {
                  count: snapshot.pendingQuantity,
                  suffix: snapshot.pendingQuantity === 1 ? '' : 's',
                }),
      whyDetail: literal(language, 'Banji is tracking this from customer order signals recorded in Record Updates.'),
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
      completedToday > 0
        ? 'completed_today'
        : canceledToday > 0
          ? 'canceled_today'
          : snapshot.blockedPendingQuantity > 0
            ? 'need_stock'
            : snapshot.pendingQuantity > 0
              ? 'ready_to_complete'
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
      action: state === 'completed_today' ? 'mark_completed' : state === 'canceled_today' ? 'review_cancellation' : state === 'need_stock' ? 'open_pending' : 'mark_completed',
      actionLabel:
        state === 'completed_today'
          ? literal(language, 'Review completion')
          : state === 'canceled_today'
            ? literal(language, 'Review cancellation')
            : state === 'need_stock'
              ? literal(language, 'Open pending')
              : literal(language, 'Mark completed'),
      href: state === 'completed_today' ? RECORD_UPDATE_CUSTOMER_COMPLETED_PATH : RECORD_UPDATE_CUSTOMER_PENDING_PATH,
      pendingQuantity: snapshot.pendingQuantity,
      completedToday,
      canceledToday,
      blockedQuantity: snapshot.blockedPendingQuantity,
      state,
      stateLabel:
        state === 'completed_today'
          ? literal(language, 'Completed today')
          : state === 'canceled_today'
            ? literal(language, 'Canceled today')
            : state === 'need_stock'
              ? literal(language, 'Need stock')
              : state === 'ready_to_complete'
                ? literal(language, 'Ready to complete')
                : literal(language, 'Open'),
      whyNow:
        state === 'need_stock'
          ? literal(language, '{count} open service order{suffix} blocked by availability', {
              count: snapshot.blockedPendingQuantity,
              suffix: snapshot.blockedPendingQuantity === 1 ? '' : 's',
            })
          : state === 'completed_today'
            ? literal(language, '{count} service order{suffix} completed today', {
                count: completedToday,
                suffix: completedToday === 1 ? '' : 's',
              })
            : state === 'canceled_today'
              ? literal(language, '{count} service order{suffix} canceled today', {
                  count: canceledToday,
                  suffix: canceledToday === 1 ? '' : 's',
                })
              : literal(language, '{count} open service order{suffix}', {
                  count: snapshot.pendingQuantity,
                  suffix: snapshot.pendingQuantity === 1 ? '' : 's',
                }),
      whyDetail: literal(language, 'Banji is tracking this from customer order signals recorded in Record Updates.'),
    });
  }

  const counts = {
    open: tasks.filter((task) => task.pendingQuantity > 0).length,
    need_stock: tasks.filter((task) => task.state === 'need_stock').length,
    ready_to_complete: tasks.filter((task) => task.state === 'ready_to_complete').length,
    completed_today: tasks.filter((task) => task.state === 'completed_today').length,
    canceled_today: tasks.filter((task) => task.state === 'canceled_today').length,
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
          count: daySummary.customerPending,
          suffix: daySummary.customerPending === 1 ? '' : 's',
        }),
      },
    ],
  };
}
