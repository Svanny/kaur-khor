export const RECORD_UPDATE_HUB_PATH = '/record-update';
export const RECORD_UPDATE_STOCK_COUNT_PATH = '/record-update/stock-count';
export const RECORD_UPDATE_SALES_UPDATE_PATH = '/record-update/sales-update';
export const RECORD_UPDATE_RECORD_ORDER_PATH = '/record-update/record-order';
export const RECORD_UPDATE_RECORD_RECEIPT_PATH = '/record-update/record-receipt';

export type RecordUpdateLaneId = 'stock-count' | 'sales-update' | 'record-order' | 'record-receipt';

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
    id: 'sales-update',
    path: RECORD_UPDATE_SALES_UPDATE_PATH,
    title: 'Sales Update',
    draftStorageKey: 'banji:record-update:draft:sales-update:v1',
  },
  {
    id: 'record-order',
    path: RECORD_UPDATE_RECORD_ORDER_PATH,
    title: 'Record Order',
    draftStorageKey: 'banji:record-update:draft:record-order:v1',
  },
  {
    id: 'record-receipt',
    path: RECORD_UPDATE_RECORD_RECEIPT_PATH,
    title: 'Record Receipt',
    draftStorageKey: 'banji:record-update:draft:record-receipt:v1',
  },
];

const recordUpdateLaneByPath = new Map(RECORD_UPDATE_LANES.map((lane) => [lane.path, lane]));

export function getRecordUpdateLane(pathname: string) {
  return recordUpdateLaneByPath.get(pathname) ?? RECORD_UPDATE_LANES[0];
}

export type OverviewTaskAction = 'log_order' | 'update_eta' | 'follow_up' | 'receive' | 'review' | 'start_update' | 'remind_tomorrow';

const ACTION_TO_LANE: Record<OverviewTaskAction, RecordUpdateLaneId> = {
  log_order: 'record-order',
  update_eta: 'record-order',
  follow_up: 'sales-update',
  receive: 'record-receipt',
  review: 'stock-count',
  start_update: 'stock-count',
  remind_tomorrow: 'stock-count',
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
