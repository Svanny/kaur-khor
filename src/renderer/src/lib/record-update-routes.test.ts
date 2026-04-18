import { describe, expect, it } from 'vitest';
import {
  RECORD_UPDATE_CUSTOMER_COMPLETED_PATH,
  RECORD_UPDATE_CUSTOM_PATH,
  getRecordUpdateLane,
  parseCustomRecordUpdateLaneIds,
  RECORD_UPDATE_LANES,
  RECORD_UPDATE_RECORD_ORDER_PATH,
  RECORD_UPDATE_RECORD_RECEIPT_PATH,
  RECORD_UPDATE_SALES_UPDATE_PATH,
  RECORD_UPDATE_STOCK_COUNT_PATH,
} from './record-update-routes';

describe('record update routes', () => {
  it('gives each lane a unique session path and draft storage key', () => {
    expect(RECORD_UPDATE_LANES.map((lane) => lane.path)).toEqual([
      RECORD_UPDATE_STOCK_COUNT_PATH,
      RECORD_UPDATE_SALES_UPDATE_PATH,
      RECORD_UPDATE_CUSTOMER_COMPLETED_PATH,
      RECORD_UPDATE_RECORD_ORDER_PATH,
      RECORD_UPDATE_RECORD_RECEIPT_PATH,
      RECORD_UPDATE_CUSTOM_PATH,
    ]);
    expect(new Set(RECORD_UPDATE_LANES.map((lane) => lane.draftStorageKey)).size).toBe(RECORD_UPDATE_LANES.length);
  });

  it('parses only known base lanes for custom updates', () => {
    expect(parseCustomRecordUpdateLaneIds('stock-count,custom,supplier-receipt,unknown,stock-count')).toEqual([
      'stock-count',
      'supplier-receipt',
    ]);
  });

  it('falls back to the stock count lane for unknown paths', () => {
    expect(getRecordUpdateLane('/record-update/unknown').id).toBe('stock-count');
  });
});
