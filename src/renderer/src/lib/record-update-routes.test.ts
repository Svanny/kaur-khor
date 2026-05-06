import { describe, expect, it } from 'vitest';
import {
  RECORD_UPDATE_CUSTOMER_COMPLETED_PATH,
  RECORD_UPDATE_CUSTOMER_PENDING_PATH,
  RECORD_UPDATE_CUSTOM_PATH,
  getRecordUpdateLane,
  parseCustomRecordUpdateLaneIds,
  RECORD_UPDATE_LANES,
  RECORD_UPDATE_STOCK_COUNT_PATH,
  RECORD_UPDATE_SUPPLIER_PENDING_PATH,
  buildCaptureSessionHref,
  draftStorageKeyForLane,
  laneForCaptureSessionAction,
  readCaptureSessionTarget,
} from './record-update-routes';

describe('record update routes', () => {
  it('gives each lane a unique session path and draft storage key', () => {
    expect(RECORD_UPDATE_LANES.map((lane) => lane.path)).toEqual([
      RECORD_UPDATE_STOCK_COUNT_PATH,
      RECORD_UPDATE_CUSTOMER_PENDING_PATH,
      RECORD_UPDATE_CUSTOMER_COMPLETED_PATH,
      RECORD_UPDATE_SUPPLIER_PENDING_PATH,
      RECORD_UPDATE_CUSTOM_PATH,
    ]);
    expect(new Set(RECORD_UPDATE_LANES.map((lane) => lane.draftStorageKey)).size).toBe(RECORD_UPDATE_LANES.length);
  });

  it('parses only known base lanes for custom updates', () => {
    expect(parseCustomRecordUpdateLaneIds('stock-count,custom,unknown,stock-count')).toEqual([
      'stock-count',
    ]);
  });

  it('falls back to the stock count lane for unknown paths', () => {
    expect(getRecordUpdateLane('/record-update/unknown').id).toBe('stock-count');
  });

  it('builds targeted capture-session hrefs for detail actions', () => {
    expect(buildCaptureSessionHref({ action: 'stock', targetId: 'sku-1', targetType: 'sku' })).toBe(
      `${RECORD_UPDATE_STOCK_COUNT_PATH}?targetAction=stock&targetType=sku&targetId=sku-1`,
    );
    expect(buildCaptureSessionHref({ action: 'supplier-order', targetId: 'sku-1', targetType: 'sku' })).toBe(
      `${RECORD_UPDATE_SUPPLIER_PENDING_PATH}?targetAction=supplier-order&targetType=sku&targetId=sku-1&ticketMode=new`,
    );
    expect(buildCaptureSessionHref({ action: 'customer-order', targetId: 'service-1', targetType: 'service' })).toBe(
      `${RECORD_UPDATE_CUSTOMER_PENDING_PATH}?targetAction=customer-order&targetType=service&targetId=service-1&ticketMode=new`,
    );
    expect(buildCaptureSessionHref({ action: 'immediate-sale', targetId: 'sku-1', targetType: 'sku' })).toBe(
      `${RECORD_UPDATE_CUSTOMER_COMPLETED_PATH}?targetAction=immediate-sale&targetType=sku&targetId=sku-1&ticketMode=new`,
    );
    expect(buildCaptureSessionHref({ action: 'service-price', targetId: 'service-1', targetType: 'service' })).toBe(
      `${RECORD_UPDATE_CUSTOM_PATH}?targetAction=service-price&targetType=service&targetId=service-1&lanes=stock-count`,
    );
  });

  it('parses targeted capture-session query params', () => {
    expect(readCaptureSessionTarget('?targetAction=sku-price&targetType=sku&targetId=sku-1')).toEqual({
      action: 'sku-price',
      targetId: 'sku-1',
      targetType: 'sku',
    });
    expect(readCaptureSessionTarget('?targetAction=missing&targetType=sku&targetId=sku-1')).toBeNull();
  });

  it('exposes lane metadata for direct-action draft prompts', () => {
    expect(laneForCaptureSessionAction('service-price')).toBe('custom');
    expect(draftStorageKeyForLane('stock-count')).toBe('kaur-khor:record-update:draft:stock-count:v1');
  });
});
