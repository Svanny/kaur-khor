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
