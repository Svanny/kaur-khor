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
  buildBatchUpdateHref,
  buildCaptureSessionHref,
  buildCustomerTicketCaptureHref,
  buildSupplierTicketCaptureHref,
  draftStorageKeyForLane,
  getLaneForTaskAction,
  laneForCaptureSessionAction,
  parseRouteIdList,
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
    expect(parseCustomRecordUpdateLaneIds(' stock-count ,custom,unknown,stock-count')).toEqual([
      'stock-count',
    ]);
  });

  it('bounds and deduplicates route id lists', () => {
    const oversizedId = 'x'.repeat(129);
    const ids = [' sku-1 ', 'sku-1', '', oversizedId, ...Array.from({ length: 70 }, (_, index) => `sku-${index + 2}`)].join(',');

    const parsed = parseRouteIdList(ids);

    expect(parsed).toHaveLength(64);
    expect(parsed.slice(0, 3)).toEqual(['sku-1', 'sku-2', 'sku-3']);
    expect(parsed).not.toContain(oversizedId);
  });

  it('bounds SKU id lists when building batch update hrefs', () => {
    const oversizedId = 'x'.repeat(129);
    const href = buildBatchUpdateHref([
      'sku-1',
      'sku-1',
      oversizedId,
      ...Array.from({ length: 70 }, (_, index) => `sku-${index + 2}`),
    ]);
    const parsed = new URL(`https://kaur-khor.local${href}`).searchParams.get('skus')?.split(',') ?? [];

    expect(parsed).toHaveLength(64);
    expect(parsed.slice(0, 3)).toEqual(['sku-1', 'sku-2', 'sku-3']);
    expect(parsed).not.toContain(oversizedId);
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
    expect(buildCaptureSessionHref({ action: 'supplier-receipt', targetId: 'sku-1', targetType: 'sku' })).toBe(
      `${RECORD_UPDATE_SUPPLIER_RECEIPT_PATH}?targetAction=supplier-receipt&targetType=sku&targetId=sku-1`,
    );
    expect(buildCaptureSessionHref({ action: 'customer-order', targetId: 'service-1', targetType: 'service' })).toBe(
      `${RECORD_UPDATE_CUSTOMER_PENDING_PATH}?targetAction=customer-order&targetType=service&targetId=service-1&ticketMode=new`,
    );
    expect(buildCaptureSessionHref({ action: 'immediate-sale', targetId: 'sku-1', targetType: 'sku' })).toBe(
      `${RECORD_UPDATE_CUSTOMER_COMPLETED_PATH}?targetAction=immediate-sale&targetType=sku&targetId=sku-1&ticketMode=new`,
    );
    expect(buildCaptureSessionHref({ action: 'service-price', targetId: 'service-1', targetType: 'service' })).toBe(
      `${RECORD_UPDATE_STOCK_COUNT_PATH}?targetAction=service-price&targetType=service&targetId=service-1`,
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
        intent: 'receipt',
        ticketId: 'supplier-ticket-1',
        targetType: 'sku',
        targetId: 'sku-1',
      }),
    ).toBe(
      `${RECORD_UPDATE_SUPPLIER_RECEIPT_PATH}?ticketMode=edit&ticketId=supplier-ticket-1&targetAction=supplier-receipt&targetType=sku&targetId=sku-1`,
    );
    expect(
      buildSupplierTicketCaptureHref({
        mode: 'edit',
        intent: 'receipt',
        ticketId: 'supplier-ticket-1',
        skuIds: ['sku-1', 'sku-2'],
        flashTargets: [
          { action: 'supplier-receipt', targetId: 'sku-1', targetType: 'sku' },
          { action: 'supplier-receipt', targetId: 'sku-2', targetType: 'sku' },
        ],
      }),
    ).toBe(
      `${RECORD_UPDATE_SUPPLIER_RECEIPT_PATH}?ticketMode=edit&ticketId=supplier-ticket-1&skus=sku-1%2Csku-2&flashTargets=supplier-receipt%3Asku-1%2Csupplier-receipt%3Asku-2`,
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
    expect(readCaptureSessionTarget('?targetAction=supplier-receipt&targetType=sku&targetId=sku-1')).toEqual({
      action: 'supplier-receipt',
      targetId: 'sku-1',
      targetType: 'sku',
    });
    expect(readCaptureSessionTarget('?targetAction=service-price&targetType=service&targetId=service-1')).toEqual({
      action: 'service-price',
      targetId: 'service-1',
      targetType: 'service',
    });
    expect(readCaptureSessionTarget('?targetAction=service-price&targetType=sku&targetId=sku-1')).toBeNull();
    expect(readCaptureSessionTarget('?targetAction=sku-price&targetType=service&targetId=service-1')).toBeNull();
    expect(readCaptureSessionTarget('?targetAction=missing&targetType=sku&targetId=sku-1')).toBeNull();
  });

  it('parses persistent POS flash target keys', () => {
    expect(readCaptureSessionFlashTargetKeys('?flashTargets=supplier-order%3Asku-1%2Csupplier-order%3Asku-1%2Cbogus')).toEqual([
      'supplier-order:sku-1',
    ]);
    expect(readCaptureSessionFlashTargetKeys('?flashTargets=service-price%3Aservice-1')).toEqual(['service-price:service-1']);
  });

  it('bounds persistent POS flash target keys from dirty URLs', () => {
    const oversizedKey = `stock:${'x'.repeat(129)}`;
    const flashTargets = [
      'stock:sku-1',
      'stock:sku-1',
      oversizedKey,
      ...Array.from({ length: 70 }, (_, index) => `service-price:service-${index + 2}`),
    ].join(',');

    const parsed = readCaptureSessionFlashTargetKeys(`?flashTargets=${encodeURIComponent(flashTargets)}`);

    expect(parsed).toHaveLength(64);
    expect(parsed.slice(0, 3)).toEqual(['stock:sku-1', 'service-price:service-2', 'service-price:service-3']);
    expect(parsed).not.toContain(oversizedKey);
  });

  it('bounds SKU and flash target lists when building ticket capture hrefs', () => {
    const skuIds = ['sku-1', 'sku-1', ...Array.from({ length: 70 }, (_, index) => `sku-${index + 2}`)];
    const flashTargets = skuIds.map((skuId) => ({
      action: 'supplier-receipt' as const,
      targetId: skuId,
      targetType: 'sku' as const,
    }));
    const href = buildSupplierTicketCaptureHref({
      mode: 'edit',
      intent: 'receipt',
      ticketId: 'supplier-ticket-1',
      skuIds,
      flashTargets,
    });
    const params = new URL(`https://kaur-khor.local${href}`).searchParams;

    expect(params.get('skus')?.split(',')).toHaveLength(64);
    expect(params.get('flashTargets')?.split(',')).toHaveLength(64);
    expect(params.get('skus')?.split(',').slice(0, 3)).toEqual(['sku-1', 'sku-2', 'sku-3']);
  });

  it('exposes lane metadata for direct-action draft prompts', () => {
    expect(getLaneForTaskAction('receive')).toBe('supplier-receipt');
    expect(laneForCaptureSessionAction('supplier-receipt')).toBe('supplier-receipt');
    expect(draftStorageKeyForLane('stock-count')).toBe('kaur-khor:record-update:draft:stock-count:v1');
  });
});
