export const RECORD_UPDATE_HUB_PATH = '/work/capture';
export const RECORD_UPDATE_STOCK_COUNT_PATH = '/work/capture/stock-count';
export const RECORD_UPDATE_CUSTOMER_PENDING_PATH = '/work/capture/customer-order';
export const RECORD_UPDATE_CUSTOMER_COMPLETED_PATH = '/work/capture/immediate-sale';
export const RECORD_UPDATE_SUPPLIER_PENDING_PATH = '/work/capture/supplier-order';
export const RECORD_UPDATE_CUSTOM_PATH = '/work/capture/custom';

export type CaptureSessionAction =
  | 'stock'
  | 'supplier-order'
  | 'customer-order'
  | 'immediate-sale'
  | 'sku-price'
  | 'service-price';
export type CaptureSessionTargetType = 'sku' | 'service';

export interface CaptureSessionTarget {
  action: CaptureSessionAction;
  targetId: string;
  targetType: CaptureSessionTargetType;
}

export type BaseRecordUpdateLaneId =
  | 'stock-count'
  | 'customer-order-pending'
  | 'customer-order-completed'
  | 'supplier-order-pending';

export type RecordUpdateLaneId = BaseRecordUpdateLaneId | 'custom';

export interface RecordUpdateLaneDefinition {
  id: RecordUpdateLaneId;
  path: string;
  title: string;
  draftStorageKey: string;
}

export const RECORD_UPDATE_LANES: RecordUpdateLaneDefinition[] = [
  {
    id: 'stock-count',
    path: RECORD_UPDATE_STOCK_COUNT_PATH,
    title: 'Stock Count',
    draftStorageKey: 'banji:record-update:draft:stock-count:v1',
  },
  {
    id: 'customer-order-pending',
    path: RECORD_UPDATE_CUSTOMER_PENDING_PATH,
    title: 'Customer Order',
    draftStorageKey: 'banji:record-update:draft:customer-order-pending:v1',
  },
  {
    id: 'customer-order-completed',
    path: RECORD_UPDATE_CUSTOMER_COMPLETED_PATH,
    title: 'Immediate Sale',
    draftStorageKey: 'banji:record-update:draft:customer-order-completed:v1',
  },
  {
    id: 'supplier-order-pending',
    path: RECORD_UPDATE_SUPPLIER_PENDING_PATH,
    title: 'Supplier Order',
    draftStorageKey: 'banji:record-update:draft:supplier-order-pending:v1',
  },
  {
    id: 'custom',
    path: RECORD_UPDATE_CUSTOM_PATH,
    title: 'Custom',
    draftStorageKey: 'banji:record-update:draft:custom:v1',
  },
];

export const BASE_RECORD_UPDATE_LANES = RECORD_UPDATE_LANES.filter(
  (lane): lane is RecordUpdateLaneDefinition & { id: BaseRecordUpdateLaneId } =>
    lane.id !== 'custom',
);

const recordUpdateLaneByPath = new Map(RECORD_UPDATE_LANES.map((lane) => [lane.path, lane] as const));
const baseRecordUpdateLaneIds = new Set(BASE_RECORD_UPDATE_LANES.map((lane) => lane.id));
const captureSessionActions = new Set<CaptureSessionAction>([
  'stock',
  'supplier-order',
  'customer-order',
  'immediate-sale',
  'sku-price',
  'service-price',
]);
const captureSessionTargetTypes = new Set<CaptureSessionTargetType>(['sku', 'service']);

export function draftStorageKeyForLane(laneId: RecordUpdateLaneId) {
  return RECORD_UPDATE_LANES.find((lane) => lane.id === laneId)?.draftStorageKey ?? null;
}

export function getRecordUpdateLane(pathname: string) {
  return recordUpdateLaneByPath.get(pathname) ?? RECORD_UPDATE_LANES[0];
}

export function isBaseRecordUpdateLaneId(value: unknown): value is BaseRecordUpdateLaneId {
  return typeof value === 'string' && baseRecordUpdateLaneIds.has(value as BaseRecordUpdateLaneId);
}

export function parseCustomRecordUpdateLaneIds(value: string | null): BaseRecordUpdateLaneId[] {
  const selected = (value ?? '')
    .split(',')
    .filter(isBaseRecordUpdateLaneId);
  return [...new Set(selected)];
}

export type OverviewTaskAction =
  | 'log_order'
  | 'update_eta'
  | 'follow_up'
  | 'receive'
  | 'review'
  | 'start_update'
  | 'remind_tomorrow'
  | 'open_pending'
  | 'mark_completed'
  | 'review_cancellation';

const ACTION_TO_LANE: Record<OverviewTaskAction, RecordUpdateLaneId> = {
  log_order: 'supplier-order-pending',
  update_eta: 'supplier-order-pending',
  follow_up: 'customer-order-pending',
  receive: 'supplier-order-pending',
  review: 'stock-count',
  start_update: 'stock-count',
  remind_tomorrow: 'stock-count',
  open_pending: 'customer-order-pending',
  mark_completed: 'customer-order-completed',
  review_cancellation: 'customer-order-pending',
};

export function getLaneForTaskAction(action: OverviewTaskAction): RecordUpdateLaneId {
  return ACTION_TO_LANE[action];
}

export function buildBatchUpdateHref(
  options:
    | string[]
    | {
        skuIds?: string[];
        batchOrderId?: string | null;
        childOrderId?: string | null;
        laneId?: RecordUpdateLaneId;
      },
  laneId?: RecordUpdateLaneId,
): string {
  const resolved =
    Array.isArray(options)
      ? { skuIds: options, laneId }
      : options;
  const lane = laneId ?? 'stock-count';
  const nextLane = resolved.laneId ?? lane;
  const basePath = RECORD_UPDATE_LANES.find((l) => l.id === nextLane)?.path ?? RECORD_UPDATE_HUB_PATH;
  const params = new URLSearchParams();
  if (resolved.skuIds && resolved.skuIds.length > 0) {
    params.set('skus', resolved.skuIds.join(','));
  }
  if (resolved.batchOrderId) {
    params.set('batchOrderId', resolved.batchOrderId);
  }
  if (resolved.childOrderId) {
    params.set('childOrderId', resolved.childOrderId);
  }
  const query = params.toString();
  return query ? `${basePath}?${query}` : basePath;
}

export function laneForCaptureSessionAction(action: CaptureSessionAction): RecordUpdateLaneId {
  if (action === 'customer-order') {
    return 'customer-order-pending';
  }
  if (action === 'immediate-sale') {
    return 'customer-order-completed';
  }
  if (action === 'supplier-order') {
    return 'supplier-order-pending';
  }
  if (action === 'service-price') {
    return 'custom';
  }
  return 'stock-count';
}

export function buildCaptureSessionHref(target: CaptureSessionTarget) {
  const laneId = laneForCaptureSessionAction(target.action);
  const lane = RECORD_UPDATE_LANES.find((candidate) => candidate.id === laneId);
  const params = new URLSearchParams();
  params.set('targetAction', target.action);
  params.set('targetType', target.targetType);
  params.set('targetId', target.targetId);
  if (target.action === 'customer-order' || target.action === 'immediate-sale' || target.action === 'supplier-order') {
    params.set('ticketMode', 'new');
  }
  if (target.action === 'service-price') {
    params.set('lanes', 'stock-count');
  }
  return `${lane?.path ?? RECORD_UPDATE_HUB_PATH}?${params.toString()}`;
}

export function readCaptureSessionTarget(search: string): CaptureSessionTarget | null {
  const params = new URLSearchParams(search);
  const action = params.get('targetAction');
  const targetType = params.get('targetType');
  const targetId = params.get('targetId')?.trim() ?? '';
  if (
    !captureSessionActions.has(action as CaptureSessionAction) ||
    !captureSessionTargetTypes.has(targetType as CaptureSessionTargetType) ||
    targetId === ''
  ) {
    return null;
  }
  return {
    action: action as CaptureSessionAction,
    targetId,
    targetType: targetType as CaptureSessionTargetType,
  };
}
