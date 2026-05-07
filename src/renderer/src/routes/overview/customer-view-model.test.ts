import { describe, expect, test } from 'vitest';
import type { SenaRecordUpdateContext, SenaTicketSummary } from '@shared/sena';
import { buildCustomerOverviewModel, shouldShowCustomerTask } from './customer-view-model';

const emptyCatalog = {
  schemaVersion: 1,
  skus: [],
  services: [],
  suppliers: [],
} as const;

function recordUpdateContextWithCustomerTickets(tickets: SenaTicketSummary[]): SenaRecordUpdateContext {
  const latestObservedAt = tickets[0]?.occurredAt ?? null;
  return {
    observationFingerprint: {
      count: tickets.length,
      latestObservedAt,
      latestObservationId: tickets.length > 0 ? 'obs-ticket' : null,
    },
    latestObservedAt,
    latestStockBySku: {},
    latestRetailSaleBySku: {},
    latestServiceSaleByService: {},
    latestOrderBySku: {},
    latestReceiptBySku: {},
    openTicketsByFamily: { customer: tickets.filter((ticket) => ticket.lifecycle === 'open'), supplier: [] },
    latestTicketsById: Object.fromEntries(
      tickets.map((ticket) => [
        ticket.ticketId,
        {
          observationId: `obs-${ticket.ticketId}`,
          observedAt: ticket.occurredAt,
          value: ticket,
        },
      ]),
    ),
    latestDeliveryFeeByBucket: {},
    recentActivity: [],
  };
}

function customerTicket(overrides: Partial<SenaTicketSummary> = {}): SenaTicketSummary {
  return {
    ticketId: 'ticket-1',
    ticketFamily: 'customer',
    lifecycle: 'open',
    stage: 'pending',
    revision: 2,
    eventType: 'created',
    occurredAt: '2026-04-01T09:00:00.000Z',
    nextTouchAt: '2026-04-04T09:00:00.000Z',
    party: {
      role: 'customer',
      channelKey: 'instagram',
      channelLabel: 'Instagram',
      customerName: 'Dara',
      phone: '+85512345678',
      location: 'Phnom Penh',
    },
    lines: [
      {
        entityType: 'sku',
        entityId: 'sku-1',
        quantityDelta: 2,
        expectedArrivalAt: '2026-04-05T09:00:00.000Z',
      },
    ],
    note: 'Prefers evening pickup',
    ...overrides,
  };
}

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
      href: '/work/capture/immediate-sale?targetAction=immediate-sale&targetType=sku&targetId=sku-1&ticketMode=new',
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

  test('keeps closed customer rows out of the default queue but visible in Closed', () => {
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
    expect(task).toMatchObject({ state: 'closed' });
    expect(task && shouldShowCustomerTask(task, 'all')).toBe(false);
    expect(task && shouldShowCustomerTask(task, 'closed')).toBe(true);
  });

  test('sorts aggregate customer queue rows by oldest open order first', () => {
    const model = buildCustomerOverviewModel({
      catalog: {
        ...emptyCatalog,
        skus: [
          {
            skuId: 'sku-newer',
            name: 'Newer customer order',
            description: '',
            costPerUnit: 2,
            soldAsProduct: true,
            productPrice: 5,
          },
          {
            skuId: 'sku-older',
            name: 'Older customer order',
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
          observationId: 'obs-older',
          ownerSub: 'desktop-owner',
          input: {
            observedAt: '2026-04-01T10:00:00.000Z',
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
                entityType: 'sku',
                entityId: 'sku-older',
                stage: 'pending',
                quantityDelta: 1,
              },
            ],
            notes: null,
          },
        },
        {
          observationId: 'obs-newer',
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
                entityType: 'sku',
                entityId: 'sku-newer',
                stage: 'pending',
                quantityDelta: 1,
              },
            ],
            notes: null,
          },
        },
      ] as never,
    });

    expect(model.tasks.map((task) => task.id)).toEqual(['customer:sku:sku-older', 'customer:sku:sku-newer']);
  });

  test('builds ticket-centered customer rows with contact metadata and FIFO ordering', () => {
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
          {
            skuId: 'sku-2',
            name: 'Comb',
            description: '',
            costPerUnit: 1,
            soldAsProduct: true,
            productPrice: 4,
          },
        ],
      } as never,
      language: 'en',
      observations: [],
      recordUpdateContext: recordUpdateContextWithCustomerTickets([
        customerTicket({
          ticketId: 'ticket-newer',
          occurredAt: '2026-04-02T09:00:00.000Z',
          party: { role: 'customer', customerName: 'Malis', channelLabel: 'Phone', phone: '+85599887766' },
          lines: [{ entityType: 'sku', entityId: 'sku-2', quantityDelta: 1 }],
        }),
        customerTicket({
          ticketId: 'ticket-older',
          occurredAt: '2026-04-01T09:00:00.000Z',
        }),
      ]),
    });

    expect(model.tasks.map((task) => task.id)).toEqual(['customer:ticket:ticket-older', 'customer:ticket:ticket-newer']);
    expect(model.tasks[0]).toMatchObject({
      actionLabel: 'Review',
      contactSummary: 'Dara',
      contactDetail: expect.stringContaining('Instagram'),
      displayTicketLabel: 'Customer Ticket ID: 2026-04-01-#1',
      id: 'customer:ticket:ticket-older',
      label: 'Customer Ticket ID: 2026-04-01-#1',
      requestSummary: '2 x Cotton pads',
      source: 'customer_ticket',
      sourceLabel: 'Customer ticket',
      state: 'open',
      ticketId: 'ticket-older',
    });
    expect(model.tasks[0]?.contactDetail).toContain('Phnom Penh');
    expect(model.tasks[0]?.requestDetail).toContain('ETA');
  });

  test('keeps resolved and canceled customer tickets from today and hides matching legacy aggregates', () => {
    const todayIso = new Date().toISOString();
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
          observationId: 'obs-legacy',
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
                entityType: 'sku',
                entityId: 'sku-1',
                stage: 'pending',
                quantityDelta: 1,
              },
            ],
            notes: null,
          },
        },
      ] as never,
      recordUpdateContext: recordUpdateContextWithCustomerTickets([
        customerTicket({
          ticketId: 'ticket-resolved-today',
          lifecycle: 'resolved',
          stage: 'fulfilled_immediate',
          eventType: 'fulfilled_immediate',
          occurredAt: todayIso,
        }),
        customerTicket({
          ticketId: 'ticket-canceled-today',
          lifecycle: 'canceled',
          stage: 'pending',
          eventType: 'canceled',
          occurredAt: todayIso,
          lines: [{ entityType: 'sku', entityId: 'sku-2', quantityDelta: 1 }],
        }),
      ]),
    });

    expect(model.tasks.map((task) => task.id).sort()).toEqual([
      'customer:ticket:ticket-canceled-today',
      'customer:ticket:ticket-resolved-today',
    ]);
    expect(model.tasks.map((task) => task.state)).toEqual(['closed', 'closed']);
    expect(model.tasks.some((task) => task.id === 'customer:sku:sku-1')).toBe(false);
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

  test('localizes Telegram source metadata and request summaries in Khmer', () => {
    const model = buildCustomerOverviewModel({
      automationIntakes: [
        {
          intakeId: 'intake-km',
          conversationId: 'conv-km',
          channel: 'telegram',
          status: 'new',
          parseConfidence: 'high',
          customerDisplayName: null,
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
              lineId: 'line-1',
              entityType: 'sku',
              entityId: 'sku-1',
              requestedLabel: 'Cotton pads',
              resolvedLabel: 'Cotton pads',
              quantity: 2,
              unitPrice: 5,
              lineTotal: 10,
            },
            {
              lineId: 'line-2',
              entityType: 'sku',
              entityId: 'sku-2',
              requestedLabel: 'Toner',
              resolvedLabel: 'Toner',
              quantity: null,
              unitPrice: null,
              lineTotal: null,
            },
            {
              lineId: 'line-3',
              entityType: 'service',
              entityId: 'service-1',
              requestedLabel: 'Facial',
              resolvedLabel: 'Facial',
              quantity: 1,
              unitPrice: 20,
              lineTotal: 20,
            },
          ],
        },
      ],
      catalog: emptyCatalog as never,
      language: 'km',
      observations: [],
    });

    expect(model.tasks[0]).toMatchObject({
      label: 'អតិថិជនតេលេក្រាម',
      sourceLabel: 'តេលេក្រាម',
      summary: '2 × Cotton pads, Toner និង 1 ទៀត',
    });
  });
});
