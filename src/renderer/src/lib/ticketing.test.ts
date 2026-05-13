import { describe, expect, test } from 'vitest';
import type { SenaObservationRecord } from '@shared/sena';
import {
  buildDeliveryFeeMetadata,
  buildDiscountMetadata,
  buildCustomerLinkDirectory,
  buildTicketPartyMetadata,
  customerLinkWarning,
  deliveryFeeBucketForWorkflow,
  latestDeliveryFeeMetadata,
  makeNewTicketId,
  makeTicketId,
  normalizeTicketPhone,
  summarizeDiscount,
  summarizeDeliveryFee,
} from './ticketing';

describe('ticketing phone normalization', () => {
  test('keeps deterministic ticket ids stable for edit and selected ticket references', () => {
    const ticket: Parameters<typeof makeTicketId>[0] = {
      eventType: 'created',
      family: 'customer',
      observedAt: '2026-04-22T12:34:00.000Z',
      lines: [
        { entityType: 'sku', entityId: 'sku-1' },
        { entityType: 'service', entityId: 'service-1' },
      ],
    };

    expect(makeTicketId(ticket)).toBe(makeTicketId({
      ...ticket,
      lines: [...ticket.lines].reverse(),
    }));
  });

  test('adds a per-ticket nonce for new ticket ids with the same minute and line identity', () => {
    const ticket: Parameters<typeof makeTicketId>[0] = {
      eventType: 'created',
      family: 'supplier',
      observedAt: '2026-04-22T12:34:00.000Z',
      lines: [{ entityType: 'sku', entityId: 'sku-1' }],
    };
    const deterministicTicketId = makeTicketId(ticket);
    const firstTicketId = makeNewTicketId({ ...ticket, nonce: 'first-order' });
    const secondTicketId = makeNewTicketId({ ...ticket, nonce: 'second-order' });

    expect(firstTicketId).not.toBe(secondTicketId);
    expect(firstTicketId).toBe(`${deterministicTicketId}:first-order`);
    expect(secondTicketId).toBe(`${deterministicTicketId}:second-order`);
  });

  test('keeps generated ticket ids within the desktop core storage limit', () => {
    const ticket: Parameters<typeof makeTicketId>[0] = {
      eventType: 'fulfilled_immediate',
      family: 'customer',
      observedAt: '2026-04-22T12:34:00.000Z',
      lines: [{
        entityType: 'service',
        entityId: 'service-very-long-generated-identifier-that-would-otherwise-overflow-ticket-storage-validation',
      }],
    };

    expect(makeTicketId(ticket).length).toBeLessThanOrEqual(80);
    expect(makeNewTicketId({ ...ticket, nonce: 'very-long-ui-matrix-nonce-for-new-ticket' }).length).toBeLessThanOrEqual(80);
  });

  test('stores customer ticket phone metadata in canonical spaced format', () => {
    expect(buildTicketPartyMetadata({
      channel: 'Telegram',
      customChannel: '',
      customerName: 'Sokha',
      phone: '012345678',
      location: 'https://maps.google.com/?q=Phnom+Penh',
    })).toMatchObject({
      phone: '+855 12345678',
      phoneKey: '+85512345678',
      location: 'https://maps.google.com/?q=Phnom+Penh',
    });

    expect(normalizeTicketPhone('+855 12345678')).toBe('+85512345678');
    expect(normalizeTicketPhone('012345678')).toBe('+85512345678');
  });

  test('matches customer link warnings across local and international phone formats', () => {
    const observations = [{
      input: {
        observedAt: '2026-04-22T00:00:00.000Z',
        ticketEvents: [{
          ticketId: 'ticket-1',
          ticketFamily: 'customer',
          lifecycle: 'open',
          stage: 'pending',
          revision: 1,
          eventType: 'created',
          occurredAt: '2026-04-22T00:00:00.000Z',
          party: {
            role: 'customer',
            customerName: 'Sokha',
            customerNameKey: 'sokha',
            phone: '+855 12345678',
            phoneKey: '+85512345678',
          },
          lines: [],
        }],
      },
    }] as unknown as SenaObservationRecord[];
    observations[0]!.input.ticketEvents!.push({
      ticketId: 'ticket-2',
      ticketFamily: 'customer',
      lifecycle: 'open',
      stage: 'pending',
      revision: 1,
      eventType: 'created',
      occurredAt: '2026-04-23T00:00:00.000Z',
      party: {
        role: 'customer',
        customerName: 'Sokha',
        customerNameKey: 'sokha',
        phone: '+855 98765432',
        phoneKey: '+85598765432',
      },
      lines: [],
    } as unknown as NonNullable<SenaObservationRecord['input']['ticketEvents']>[number]);

    const directory = buildCustomerLinkDirectory(observations);

    expect(customerLinkWarning({
      channel: 'Telegram',
      customChannel: '',
      customerName: 'Sokha',
      phone: '012345678',
      location: '',
    }, directory)).toBeNull();
    expect(customerLinkWarning({
      channel: 'Telegram',
      customChannel: '',
      customerName: 'Dara',
      phone: '012345678',
      location: '',
    }, directory)).toBe('This phone was previously linked to a different customer. Save if this is intentional.');
    expect(customerLinkWarning({
      channel: 'Telegram',
      customChannel: '',
      customerName: 'Sokha',
      phone: '+85598765432',
      location: '',
    }, directory)).toBeNull();
    expect(directory.entries).toEqual([
      { name: 'Sokha', phone: '+855 12345678' },
      { name: 'Sokha', phone: '+855 98765432' },
    ]);
    expect(directory.nameToPhone.get('sokha')).toBe('+855 12345678');
  });

  test('maps workflow buckets and summarizes merchant-paid customer delivery', () => {
    expect(deliveryFeeBucketForWorkflow({
      customerCompletedMode: 'immediate_sale',
      isCustomerCompletedLane: true,
      isCustomerPendingLane: false,
      isSupplierPendingLane: false,
      isSupplierReceiptLane: false,
    })).toBe('immediate_sale');
    expect(deliveryFeeBucketForWorkflow({
      customerCompletedMode: 'from_pending',
      isCustomerCompletedLane: true,
      isCustomerPendingLane: false,
      isSupplierPendingLane: false,
      isSupplierReceiptLane: false,
    })).toBe('customer_order');
    expect(deliveryFeeBucketForWorkflow({
      customerCompletedMode: 'refund_reversal',
      isCustomerCompletedLane: true,
      isCustomerPendingLane: false,
      isSupplierPendingLane: false,
      isSupplierReceiptLane: false,
    })).toBeNull();

    expect(summarizeDeliveryFee({
      bucket: 'customer_order',
      feeUsd: 3,
      payer: 'merchant',
      subtotalUsd: 20,
    })).toEqual({
      subtotalUsd: 20,
      displayDeliveryUsd: 0,
      displayTotalUsd: 20,
      netSettlementUsd: 17,
    });
    expect(summarizeDeliveryFee({
      bucket: 'supplier',
      feeUsd: 3,
      payer: 'merchant',
      subtotalUsd: 20,
    })).toEqual({
      subtotalUsd: 20,
      displayDeliveryUsd: 3,
      displayTotalUsd: 23,
      netSettlementUsd: 23,
    });
  });

  test('prefers the latest delivery fee metadata in the matching bucket', () => {
    const observations = [{
      input: {
        observedAt: '2026-04-20T00:00:00.000Z',
        deliveryFee: buildDeliveryFeeMetadata({
          bucket: 'customer_order',
          feeUsd: 1,
          payer: 'customer',
          subtotalUsd: 10,
        }),
        ticketEvents: [{
          ticketId: 'ticket-1',
          ticketFamily: 'customer',
          lifecycle: 'open',
          stage: 'pending',
          revision: 1,
          eventType: 'created',
          occurredAt: '2026-04-22T00:00:00.000Z',
          lines: [],
          deliveryFee: buildDeliveryFeeMetadata({
            bucket: 'customer_order',
            feeUsd: 4,
            payer: 'merchant',
            subtotalUsd: 15,
          }),
        }],
      },
    }] as unknown as SenaObservationRecord[];

    expect(latestDeliveryFeeMetadata(observations, 'customer_order')).toMatchObject({
      feeUsd: 4,
      payer: 'merchant',
    });
    expect(latestDeliveryFeeMetadata(observations, 'supplier')).toBeNull();
  });

  test('summarizes flat amount discounts against subtotal', () => {
    expect(summarizeDiscount({
      amountUsd: 5,
      mode: 'amount',
      percent: null,
      subtotalUsd: 20,
    })).toEqual({
      subtotalUsd: 20,
      displayDiscountUsd: 5,
      discountedSubtotalUsd: 15,
    });
  });

  test('summarizes percent discounts and clamps at subtotal', () => {
    expect(buildDiscountMetadata({
      amountUsd: null,
      mode: 'percent',
      percent: 10,
      subtotalUsd: 50,
    })).toEqual({
      mode: 'percent',
      amountUsd: null,
      percent: 10,
      subtotalUsd: 50,
      displayDiscountUsd: 5,
      discountedSubtotalUsd: 45,
    });
    expect(summarizeDiscount({
      amountUsd: null,
      mode: 'percent',
      percent: 250,
      subtotalUsd: 12,
    })).toMatchObject({
      displayDiscountUsd: 12,
      discountedSubtotalUsd: 0,
    });
  });

  test('applies delivery after discount', () => {
    const discount = buildDiscountMetadata({
      amountUsd: 5,
      mode: 'amount',
      percent: null,
      subtotalUsd: 20,
    });

    expect(buildDeliveryFeeMetadata({
      bucket: 'customer_order',
      feeUsd: 2,
      payer: 'customer',
      subtotalUsd: discount.discountedSubtotalUsd,
    })).toMatchObject({
      subtotalUsd: 15,
      displayDeliveryUsd: 2,
      displayTotalUsd: 17,
      netSettlementUsd: 17,
    });
  });

  test('treats invalid or empty discount values as zero', () => {
    expect(summarizeDiscount({
      amountUsd: Number.NaN,
      mode: 'amount',
      percent: null,
      subtotalUsd: 20,
    })).toMatchObject({
      displayDiscountUsd: 0,
      discountedSubtotalUsd: 20,
    });
    expect(summarizeDiscount({
      amountUsd: null,
      mode: 'percent',
      percent: null,
      subtotalUsd: 20,
    })).toMatchObject({
      displayDiscountUsd: 0,
      discountedSubtotalUsd: 20,
    });
  });
});
