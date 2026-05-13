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
  RECORD_UPDATE_SUPPLIER_RECEIPT_PATH,
  buildCaptureSessionHref,
  buildCustomerTicketCaptureHref,
  buildSupplierTicketCaptureHref,
  draftStorageKeyForLane,
  laneForCaptureSessionAction,
  readCaptureSessionFlashTargetKeys,
  readCaptureSessionTarget,
} from './record-update-routes';

describe('record update routes', () => {
  it('gives each lane a unique session path and draft storage key', () => {
    expect(RECORD_UPDATE_LANES.map((lane) => lane.path)).toEqual([
      RECORD_UPDATE_STOCK_COUNT_PATH,
      RECORD_UPDATE_CUSTOMER_PENDING_PATH,
      RECORD_UPDATE_CUSTOMER_COMPLETED_PATH,
      RECORD_UPDATE_SUPPLIER_PENDING_PATH,
      RECORD_UPDATE_SUPPLIER_RECEIPT_PATH,
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

  it('builds explicit supplier ticket capture-session hrefs', () => {
    expect(buildSupplierTicketCaptureHref({ mode: 'edit', ticketId: 'supplier-ticket-1' })).toBe(
      `${RECORD_UPDATE_SUPPLIER_PENDING_PATH}?ticketMode=edit&ticketId=supplier-ticket-1`,
    );
    expect(buildSupplierTicketCaptureHref({ mode: 'edit', ticketId: 'supplier-ticket-1', targetType: 'sku', targetId: 'sku-1' })).toBe(
      `${RECORD_UPDATE_SUPPLIER_PENDING_PATH}?ticketMode=edit&ticketId=supplier-ticket-1&targetAction=supplier-order&targetType=sku&targetId=sku-1`,
    );
    expect(buildSupplierTicketCaptureHref({ mode: 'new', targetType: 'sku', targetId: 'sku-1' })).toBe(
      `${RECORD_UPDATE_SUPPLIER_PENDING_PATH}?targetAction=supplier-order&targetType=sku&targetId=sku-1&ticketMode=new`,
    );
    expect(
      buildSupplierTicketCaptureHref({
        mode: 'edit',
        ticketId: 'supplier-ticket-1',
        skuIds: ['sku-1', 'sku-2'],
        flashTargets: [
          { action: 'supplier-order', targetId: 'sku-1', targetType: 'sku' },
          { action: 'supplier-order', targetId: 'sku-2', targetType: 'sku' },
        ],
      }),
    ).toBe(
      `${RECORD_UPDATE_SUPPLIER_PENDING_PATH}?ticketMode=edit&ticketId=supplier-ticket-1&skus=sku-1%2Csku-2&flashTargets=supplier-order%3Asku-1%2Csupplier-order%3Asku-2`,
    );
  });

  it('builds explicit customer ticket capture-session hrefs', () => {
    expect(buildCustomerTicketCaptureHref({ mode: 'edit', ticketId: 'customer-ticket-1' })).toBe(
      `${RECORD_UPDATE_CUSTOMER_PENDING_PATH}?ticketMode=edit&ticketId=customer-ticket-1`,
    );
    expect(buildCustomerTicketCaptureHref({ mode: 'edit', ticketId: 'customer-ticket-1', targetType: 'service', targetId: 'service-1' })).toBe(
      `${RECORD_UPDATE_CUSTOMER_PENDING_PATH}?ticketMode=edit&ticketId=customer-ticket-1&targetAction=customer-order&targetType=service&targetId=service-1`,
    );
    expect(buildCustomerTicketCaptureHref({ mode: 'new', targetType: 'sku', targetId: 'sku-1' })).toBe(
      `${RECORD_UPDATE_CUSTOMER_PENDING_PATH}?targetAction=customer-order&targetType=sku&targetId=sku-1&ticketMode=new`,
    );
    expect(
      buildCustomerTicketCaptureHref({
        mode: 'edit',
        ticketId: 'customer-ticket-1',
        flashTargets: [
          { action: 'customer-order', targetId: 'service-1', targetType: 'service' },
          { action: 'customer-order', targetId: 'sku-1', targetType: 'sku' },
        ],
      }),
    ).toBe(
      `${RECORD_UPDATE_CUSTOMER_PENDING_PATH}?ticketMode=edit&ticketId=customer-ticket-1&flashTargets=service%3Aservice-1%2Cretail%3Asku-1`,
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

  it('parses persistent POS flash target keys', () => {
    expect(readCaptureSessionFlashTargetKeys('?flashTargets=supplier-order%3Asku-1%2Csupplier-order%3Asku-1%2Cbogus')).toEqual([
      'supplier-order:sku-1',
    ]);
  });

  it('exposes lane metadata for direct-action draft prompts', () => {
    expect(laneForCaptureSessionAction('service-price')).toBe('custom');
    expect(draftStorageKeyForLane('stock-count')).toBe('kaur-khor:record-update:draft:stock-count:v1');
  });
});
