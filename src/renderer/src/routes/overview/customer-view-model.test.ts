import { describe, expect, test } from 'vitest';
import { buildCustomerOverviewModel } from './customer-view-model';

const emptyCatalog = {
  schemaVersion: 1,
  skus: [],
  services: [],
  suppliers: [],
} as const;

describe('buildCustomerOverviewModel', () => {
  test('keeps aggregate customer rows open when completed work lands alongside pending quantity', () => {
    const model = buildCustomerOverviewModel({
      catalog: {
        ...emptyCatalog,
        skus: [
          {
            skuId: 'sku-1',
            name: 'Cotton pads',
            description: '',
            costPerUnit: 2,
            soldAsProduct: true,
            productPrice: 5,
          },
        ],
      } as never,
      language: 'en',
      observations: [
        {
          observationId: 'obs-today',
          ownerSub: 'desktop-owner',
          input: {
            observedAt: '2026-04-03T10:00:00.000Z',
            stockSnapshot: [{ skuId: 'sku-1', unitsInStock: 10, costPerUnit: 2, productPrice: 5 }],
            serviceRankings: [],
            retailRankings: [],
            serviceStockouts: [],
            retailStockouts: [],
            orderSignals: [],
            servicePrices: [],
            retailPrices: [],
            leadTimeHints: [],
            commercialEvents: [
              {
                party: 'customer',
                entityType: 'sku',
                entityId: 'sku-1',
                stage: 'pending',
                quantityDelta: 3,
              },
              {
                party: 'customer',
                entityType: 'sku',
                entityId: 'sku-1',
                stage: 'realized',
                quantityDelta: 1,
              },
            ],
            notes: null,
          },
        },
      ] as never,
    });

    expect(model.tasks.find((task) => task.id === 'customer:sku:sku-1')).toMatchObject({
      completedToday: 1,
      pendingQuantity: 3,
      state: 'open',
      stateLabel: 'Open',
    });
  });

  test('routes completed service rows to pending fulfillment review instead of immediate sale', () => {
    const model = buildCustomerOverviewModel({
      catalog: {
        ...emptyCatalog,
        services: [
          {
            serviceId: 'service-1',
            name: 'Hair wash',
            description: '',
            price: 8,
          },
        ],
        sharingMask: [],
      } as never,
      language: 'en',
      observations: [
        {
          observationId: 'obs-today',
          ownerSub: 'desktop-owner',
          input: {
            observedAt: '2026-04-03T10:00:00.000Z',
            stockSnapshot: [],
            serviceRankings: [],
            retailRankings: [],
            serviceStockouts: [],
            retailStockouts: [],
            orderSignals: [],
            servicePrices: [],
            retailPrices: [],
            leadTimeHints: [],
            commercialEvents: [
              {
                party: 'customer',
                entityType: 'service',
                entityId: 'service-1',
                stage: 'realized',
                quantityDelta: 1,
              },
            ],
            notes: null,
          },
        },
      ] as never,
    });

    const task = model.tasks.find((entry) => entry.id === 'customer:service:service-1');
    expect(task).toMatchObject({
      actionLabel: 'Review completion',
      href: '/work/capture/customer-order?targetAction=customer-order&targetType=service&targetId=service-1&ticketMode=new',
    });
    expect(task?.href).not.toBe('/work/capture/immediate-sale');
  });

  test('adds Telegram intake rows to the customer queue with intake-aware states and source metadata', () => {
    const model = buildCustomerOverviewModel({
      automationIntakes: [
        {
          intakeId: 'intake-new',
          conversationId: 'conv-new',
          channel: 'telegram',
          status: 'new',
          parseConfidence: 'high',
          customerDisplayName: 'Sokha',
          customerHandle: '@sokha',
          phone: null,
          notes: null,
          quotedSubtotal: null,
          currencyCode: 'USD',
          deliveryFee: null,
          quotedTotal: null,
          createdAt: '2026-04-03T10:00:00.000Z',
          updatedAt: '2026-04-03T10:00:00.000Z',
          promotedTicketId: null,
          lines: [
            {
              lineId: 'line-new',
              entityType: 'sku',
              entityId: 'sku-1',
              requestedLabel: 'Cotton pads',
              resolvedLabel: 'Cotton pads',
              quantity: 2,
              unitPrice: 5,
              lineTotal: 10,
              availabilityStatus: 'available',
              ambiguityReason: null,
            },
          ],
        },
        {
          intakeId: 'intake-review',
          conversationId: 'conv-review',
          channel: 'telegram',
          status: 'needs_review',
          parseConfidence: 'low',
          customerDisplayName: 'Malis',
          customerHandle: null,
          phone: null,
          notes: 'ambiguous',
          quotedSubtotal: null,
          currencyCode: 'USD',
          deliveryFee: null,
          quotedTotal: null,
          createdAt: '2026-04-03T10:00:00.000Z',
          updatedAt: '2026-04-03T10:00:00.000Z',
          promotedTicketId: null,
          lines: [
            {
              lineId: 'line-review',
              entityType: 'service',
              entityId: null,
              requestedLabel: 'Hair wash',
              resolvedLabel: null,
              quantity: null,
              unitPrice: null,
              lineTotal: null,
              availabilityStatus: 'unknown',
              ambiguityReason: 'item_not_found',
            },
          ],
        },
        {
          intakeId: 'intake-quoted',
          conversationId: 'conv-quoted',
          channel: 'telegram',
          status: 'quoted',
          parseConfidence: 'high',
          customerDisplayName: 'Dara',
          customerHandle: '@dara',
          phone: null,
          notes: null,
          quotedSubtotal: 12,
          currencyCode: 'USD',
          deliveryFee: null,
          quotedTotal: 12,
          createdAt: '2026-04-03T10:00:00.000Z',
          updatedAt: '2026-04-03T10:00:00.000Z',
          promotedTicketId: null,
          lines: [
            {
              lineId: 'line-quoted',
              entityType: 'sku',
              entityId: 'sku-2',
              requestedLabel: 'Comb',
              resolvedLabel: 'Comb',
              quantity: 3,
              unitPrice: 4,
              lineTotal: 12,
              availabilityStatus: 'available',
              ambiguityReason: null,
            },
          ],
        },
        {
          intakeId: 'intake-ticketed',
          conversationId: 'conv-ticketed',
          channel: 'telegram',
          status: 'ticketed',
          parseConfidence: 'high',
          customerDisplayName: 'Bora',
          customerHandle: null,
          phone: null,
          notes: null,
          quotedSubtotal: 8,
          currencyCode: 'USD',
          deliveryFee: null,
          quotedTotal: 8,
          createdAt: '2026-04-03T10:00:00.000Z',
          updatedAt: '2026-04-03T10:00:00.000Z',
          promotedTicketId: 'ticket-1',
          lines: [
            {
              lineId: 'line-ticketed',
              entityType: 'service',
              entityId: 'service-1',
              requestedLabel: 'Blow dry',
              resolvedLabel: 'Blow dry',
              quantity: 1,
              unitPrice: 8,
              lineTotal: 8,
              availabilityStatus: 'available',
              ambiguityReason: null,
            },
          ],
        },
        {
          intakeId: 'intake-completed',
          conversationId: 'conv-completed',
          channel: 'telegram',
          status: 'completed',
          parseConfidence: 'high',
          customerDisplayName: 'Pich',
          customerHandle: null,
          phone: null,
          notes: null,
          quotedSubtotal: 9,
          currencyCode: 'USD',
          deliveryFee: null,
          quotedTotal: 9,
          createdAt: '2026-04-03T10:00:00.000Z',
          updatedAt: '2026-04-03T10:00:00.000Z',
          promotedTicketId: 'ticket-2',
          lines: [
            {
              lineId: 'line-completed',
              entityType: 'sku',
              entityId: 'sku-3',
              requestedLabel: 'Scarf',
              resolvedLabel: 'Scarf',
              quantity: 1,
              unitPrice: 9,
              lineTotal: 9,
              availabilityStatus: 'available',
              ambiguityReason: null,
            },
          ],
        },
        {
          intakeId: 'intake-canceled',
          conversationId: 'conv-canceled',
          channel: 'telegram',
          status: 'canceled',
          parseConfidence: 'medium',
          customerDisplayName: 'Vanna',
          customerHandle: null,
          phone: null,
          notes: null,
          quotedSubtotal: null,
          currencyCode: 'USD',
          deliveryFee: null,
          quotedTotal: null,
          createdAt: '2026-04-03T10:00:00.000Z',
          updatedAt: '2026-04-03T10:00:00.000Z',
          promotedTicketId: null,
          lines: [
            {
              lineId: 'line-canceled',
              entityType: 'sku',
              entityId: 'sku-4',
              requestedLabel: 'Brush',
              resolvedLabel: 'Brush',
              quantity: 1,
              unitPrice: null,
              lineTotal: null,
              availabilityStatus: 'unavailable',
              ambiguityReason: null,
            },
          ],
        },
      ],
      catalog: emptyCatalog as never,
      language: 'en',
      observations: [],
    });

    expect(model.tasks.map((task) => task.id)).toEqual([
      'automation:intake:intake-new',
      'automation:intake:intake-review',
      'automation:intake:intake-quoted',
      'automation:intake:intake-ticketed',
      'automation:intake:intake-completed',
      'automation:intake:intake-canceled',
    ]);
    expect(model.tasks.map((task) => task.state)).toEqual([
      'review',
      'review',
      'quoted',
      'open',
      'closed',
      'closed',
    ]);
    expect(model.tasks.map((task) => task.stateBadgeTone)).toEqual([
      'warning',
      'warning',
      'info',
      'success',
      'neutral',
      'neutral',
    ]);
    expect(model.tasks.every((task) => task.source === 'telegram_intake')).toBe(true);
    expect(model.tasks.every((task) => task.sourceLabel === 'Telegram')).toBe(true);
    expect(model.tasks.find((task) => task.id === 'automation:intake:intake-quoted')?.href).toBe(
      '/work/intake?section=intake&conversation=conv-quoted&intake=intake-quoted',
    );
    expect(model.tasks.find((task) => task.id === 'automation:intake:intake-ticketed')).toMatchObject({
      actionLabel: 'Open ticket',
      href: '/work/capture/customer-order?ticketMode=edit&ticketId=ticket-1',
    });
    expect(model.tasks.find((task) => task.id === 'automation:intake:intake-completed')).toMatchObject({
      actionLabel: 'Open ticket',
      href: '/work/capture/customer-order?ticketMode=edit&ticketId=ticket-2',
    });
    expect(model.tasks.find((task) => task.id === 'automation:intake:intake-canceled')).toMatchObject({
      actionLabel: 'Open intake',
      href: '/work/intake?section=intake&conversation=conv-canceled&intake=intake-canceled',
    });
    expect(model.counts).toEqual({
      review: 2,
      quoted: 1,
      open: 1,
      closed: 2,
    });
  });
});
