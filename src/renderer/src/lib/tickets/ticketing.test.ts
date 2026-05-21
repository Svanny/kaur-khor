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
  latestTicketEvents,
  makeNewTicketId,
  makeTicketId,
  normalizeTicketPhone,
  summarizeDiscount,
  summarizeDeliveryFee,
  ticketLabel,
} from '../tickets/ticketing';

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

  test('uses canonical phone keys when building customer link directories from partial party metadata', () => {
    const observations = [{
      input: {
        observedAt: '2026-04-22T00:00:00.000Z',
        ticketEvents: [{
          ticketId: 'ticket-key-only',
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
            phone: null,
            phoneKey: '+85512345678',
          },
          lines: [],
        }],
      },
    }] as unknown as SenaObservationRecord[];

    const directory = buildCustomerLinkDirectory(observations);

    expect(directory.entries).toEqual([{ name: 'Sokha', phone: '+855 12345678' }]);
    expect(directory.nameToPhone.get('sokha')).toBe('+855 12345678');
    expect(directory.phoneToName.get('+85512345678')).toBe('Sokha');
  });

  test('derives customer directory name keys from display names instead of persisted keys', () => {
    const observations = [{
      input: {
        observedAt: '2026-04-22T00:00:00.000Z',
        ticketEvents: [{
          ticketId: 'ticket-dirty-key',
          ticketFamily: 'customer',
          lifecycle: 'open',
          stage: 'pending',
          revision: 1,
          eventType: 'created',
          occurredAt: '2026-04-22T00:00:00.000Z',
          party: {
            role: 'customer',
            customerName: 'Dara',
            customerNameKey: 'sokha',
            phone: '+855 12345678',
            phoneKey: '+85512345678',
          },
          lines: [],
        }],
      },
    }] as unknown as SenaObservationRecord[];

    const directory = buildCustomerLinkDirectory(observations);

    expect(directory.nameToPhone.get('dara')).toBe('+855 12345678');
    expect(directory.nameToPhone.has('sokha')).toBe(false);
    expect(customerLinkWarning({
      channel: 'Telegram',
      customChannel: '',
      customerName: 'Sokha',
      phone: '+85512345678',
      location: '',
    }, directory)).toBe('This phone was previously linked to a different customer. Save if this is intentional.');
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

  test('keeps dirty delivery fee totals from propagating non-finite values', () => {
    expect(summarizeDeliveryFee({
      bucket: 'customer_order',
      feeUsd: Number.POSITIVE_INFINITY,
      payer: 'customer',
      subtotalUsd: Number.NaN,
    })).toEqual({
      subtotalUsd: null,
      displayDeliveryUsd: null,
      displayTotalUsd: null,
      netSettlementUsd: null,
    });
    expect(summarizeDeliveryFee({
      bucket: 'customer_order',
      feeUsd: Number.NaN,
      payer: 'merchant',
      subtotalUsd: -5,
    })).toEqual({
      subtotalUsd: 0,
      displayDeliveryUsd: 0,
      displayTotalUsd: 0,
      netSettlementUsd: 0,
    });
  });

  test('normalizes dirty raw delivery fee metadata values before storage', () => {
    expect(buildDeliveryFeeMetadata({
      bucket: 'customer_order',
      feeUsd: Number.POSITIVE_INFINITY,
      payer: 'customer',
      subtotalUsd: 20,
    })).toMatchObject({
      feeUsd: null,
      displayDeliveryUsd: 0,
      displayTotalUsd: 20,
      netSettlementUsd: 20,
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

  test('sorts dirty delivery fee timestamps after valid ticket metadata', () => {
    const observations = [{
      input: {
        observedAt: 'zzzz',
        deliveryFee: buildDeliveryFeeMetadata({
          bucket: 'customer_order',
          feeUsd: 9,
          payer: 'customer',
          subtotalUsd: 10,
        }),
        ticketEvents: [{
          ticketId: 'ticket-valid',
          ticketFamily: 'customer',
          lifecycle: 'open',
          stage: 'pending',
          revision: 1,
          eventType: 'created',
          occurredAt: '2026-04-22T00:00:00.000Z',
          lines: [],
          deliveryFee: buildDeliveryFeeMetadata({
            bucket: 'customer_order',
            feeUsd: 2,
            payer: 'customer',
            subtotalUsd: 10,
          }),
        }],
      },
    }] as unknown as SenaObservationRecord[];

    expect(latestDeliveryFeeMetadata(observations, 'customer_order')).toMatchObject({
      feeUsd: 2,
    });
  });

  test('sorts dirty ticket event dates after valid events', () => {
    const observations = [{
      input: {
        ticketEvents: [
          {
            ticketId: 'ticket-dirty',
            ticketFamily: 'customer',
            lifecycle: 'open',
            stage: 'pending',
            revision: 1,
            eventType: 'created',
            occurredAt: 'zzzz',
            lines: [],
          },
          {
            ticketId: 'ticket-valid',
            ticketFamily: 'customer',
            lifecycle: 'open',
            stage: 'pending',
            revision: 1,
            eventType: 'created',
            occurredAt: '2026-04-22T00:00:00.000Z',
            lines: [],
          },
        ],
      },
    }] as unknown as SenaObservationRecord[];

    expect(latestTicketEvents(observations).map((event) => event.ticketId)).toEqual([
      'ticket-valid',
      'ticket-dirty',
    ]);
  });

  test('falls back to ticket id when a ticket has no party or lines', () => {
    expect(ticketLabel({
      ticketId: 'ticket-empty',
      ticketFamily: 'customer',
      lifecycle: 'open',
      stage: 'pending',
      revision: 1,
      eventType: 'created',
      occurredAt: '2026-04-22T00:00:00.000Z',
      lines: [],
    })).toBe('ticket-empty');
  });

  test('falls back from dirty blank ticket party names to line labels', () => {
    expect(ticketLabel({
      ticketId: 'ticket-dirty-name',
      ticketFamily: 'customer',
      lifecycle: 'open',
      stage: 'pending',
      revision: 1,
      eventType: 'created',
      occurredAt: '2026-04-22T00:00:00.000Z',
      party: {
        role: 'customer',
        customerName: '   ',
      },
      lines: [{ entityType: 'sku', entityId: 'sku-1' }],
    })).toBe('sku-1');
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

  test('normalizes dirty raw discount metadata values before storage', () => {
    expect(buildDiscountMetadata({
      amountUsd: Number.NaN,
      mode: 'amount',
      percent: null,
      subtotalUsd: 20,
    })).toMatchObject({
      amountUsd: null,
      displayDiscountUsd: 0,
      discountedSubtotalUsd: 20,
    });
    expect(buildDiscountMetadata({
      amountUsd: null,
      mode: 'percent',
      percent: 250,
      subtotalUsd: 20,
    })).toMatchObject({
      percent: 100,
      displayDiscountUsd: 20,
      discountedSubtotalUsd: 0,
    });
  });
});
