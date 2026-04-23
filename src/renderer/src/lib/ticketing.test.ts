import { describe, expect, test } from 'vitest';
import type { SenaObservationRecord } from '@shared/sena';
import {
  buildDeliveryFeeMetadata,
  buildCustomerLinkDirectory,
  buildTicketPartyMetadata,
  customerLinkWarning,
  deliveryFeeBucketForWorkflow,
  latestDeliveryFeeMetadata,
  normalizeTicketPhone,
  summarizeDeliveryFee,
} from './ticketing';

describe('ticketing phone normalization', () => {
  test('stores customer ticket phone metadata in canonical spaced format', () => {
    expect(buildTicketPartyMetadata({
      channel: 'Telegram',
      customChannel: '',
      customerName: 'Sokha',
      phone: '012345678',
    })).toMatchObject({
      phone: '+855 12345678',
      phoneKey: '+85512345678',
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

    const directory = buildCustomerLinkDirectory(observations);

    expect(customerLinkWarning({
      channel: 'Telegram',
      customChannel: '',
      customerName: 'Sokha',
      phone: '012345678',
    }, directory)).toBeNull();
    expect(customerLinkWarning({
      channel: 'Telegram',
      customChannel: '',
      customerName: 'Dara',
      phone: '012345678',
    }, directory)).toBe('This phone was previously linked to a different customer. Save if this is intentional.');
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
});
