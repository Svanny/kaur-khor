import { describe, expect, it } from 'vitest';
import type { SenaObservationInput, SenaTicketEvent } from '@shared/sena';
import {
  RECORD_UPDATE_SUPPLIER_PENDING_PATH,
  RECORD_UPDATE_SUPPLIER_RECEIPT_PATH,
} from '@/lib/record-update-routes';
import {
  recordUpdateEditSessionFlashTargetKeysForInput,
  recordUpdateEditSessionPathForInput,
  recordUpdateEditSessionSearchForInput,
} from './observation-edit-session';

function baseInput(ticketEvents: SenaTicketEvent[]): SenaObservationInput {
  return {
    observedAt: '2026-04-21T00:00:00.000Z',
    stockSnapshot: [],
    retailSalesSnapshot: [],
    serviceSalesSnapshot: [],
    serviceRankings: [],
    retailRankings: [],
    serviceStockouts: [],
    retailStockouts: [],
    orderSignals: [],
    servicePrices: [],
    retailPrices: [],
    leadTimeHints: [],
    adjustmentSignals: [],
    commercialEvents: [],
    ticketEvents,
    recipeUsageHints: [],
    notes: null,
  };
}

function ticketEvent(overrides: Partial<SenaTicketEvent>): SenaTicketEvent {
  return {
    ticketId: 'ticket-customer-1',
    ticketFamily: 'customer',
    lifecycle: 'open',
    stage: 'pending',
    revision: 1,
    eventType: 'created',
    occurredAt: '2026-04-21T00:00:00.000Z',
    nextTouchAt: null,
    party: null,
    lines: [{ entityType: 'service', entityId: 'service-1', quantityDelta: 1 }],
    note: null,
    ...overrides,
  };
}

describe('observation edit session routing', () => {
  it('keeps supplier ticket id and flash targets aligned when a customer ticket appears first', () => {
    const input = baseInput([
      ticketEvent({
        ticketId: 'ticket-customer-1',
        ticketFamily: 'customer',
        lines: [{ entityType: 'service', entityId: 'service-1', quantityDelta: 1 }],
      }),
      ticketEvent({
        ticketId: 'ticket-supplier-1',
        ticketFamily: 'supplier',
        stage: 'ordered_waiting',
        eventType: 'revised',
        lines: [{ entityType: 'sku', entityId: 'sku-1', orderedQuantity: 4 }],
      }),
    ]);

    expect(recordUpdateEditSessionPathForInput(input)).toBe(RECORD_UPDATE_SUPPLIER_PENDING_PATH);
    expect(recordUpdateEditSessionSearchForInput(input)).toBe(
      '?ticketMode=edit&ticketId=ticket-supplier-1&flashTargets=supplier-order%3Asku-1',
    );
    expect(recordUpdateEditSessionFlashTargetKeysForInput(input)).toEqual(['supplier-order:sku-1']);
  });

  it('uses supplier receipt flash targets for receipt edit sessions', () => {
    const input = baseInput([
      ticketEvent({
        ticketId: 'ticket-supplier-receipt-1',
        ticketFamily: 'supplier',
        stage: 'partial_received',
        eventType: 'partial_received',
        lines: [{ entityType: 'sku', entityId: 'sku-2', receivedQuantity: 2 }],
      }),
    ]);

    expect(recordUpdateEditSessionPathForInput(input)).toBe(RECORD_UPDATE_SUPPLIER_RECEIPT_PATH);
    expect(recordUpdateEditSessionFlashTargetKeysForInput(input)).toEqual(['supplier-receipt:sku-2']);
  });

  it('bounds edit-session flash targets from unusually large ticket line lists', () => {
    const oversizedId = 'x'.repeat(129);
    const input = baseInput([
      ticketEvent({
        ticketId: 'ticket-supplier-1',
        ticketFamily: 'supplier',
        stage: 'ordered_waiting',
        eventType: 'revised',
        lines: [
          { entityType: 'sku', entityId: 'sku-1', orderedQuantity: 1 },
          { entityType: 'sku', entityId: 'sku-1', orderedQuantity: 1 },
          { entityType: 'sku', entityId: oversizedId, orderedQuantity: 1 },
          ...Array.from({ length: 70 }, (_, index) => ({
            entityType: 'sku' as const,
            entityId: `sku-${index + 2}`,
            orderedQuantity: 1,
          })),
        ],
      }),
    ]);

    const flashTargets = recordUpdateEditSessionFlashTargetKeysForInput(input);

    expect(flashTargets).toHaveLength(64);
    expect(flashTargets.slice(0, 3)).toEqual(['supplier-order:sku-1', 'supplier-order:sku-2', 'supplier-order:sku-3']);
    expect(flashTargets).not.toContain(`supplier-order:${oversizedId}`);
  });
});
