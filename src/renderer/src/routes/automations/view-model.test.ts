import { describe, expect, test } from 'vitest';
import { deriveAutomationViewModel } from './view-model';

describe('deriveAutomationViewModel', () => {
  test('builds Overview deep links for automation task surfaces', () => {
    const model = deriveAutomationViewModel({
      currentSearchParams: new URLSearchParams('section=intake'),
      currency: 'USD',
      language: 'en',
      usdToKhrExchangeRate: 4000,
      workspace: {
        connection: {
          channel: 'telegram',
          status: 'connected',
          hasBotToken: true,
          botDisplayName: 'Configured bot',
          botUsername: 'configured_bot',
          externalLink: 'https://t.me/configured_bot',
          connectedAt: '2026-04-03T10:00:00.000Z',
          pausedAt: null,
          lastWebhookAt: '2026-04-03T11:00:00.000Z',
          lastErrorAt: null,
          lastErrorMessage: null,
        },
        metrics: {
          ordersToday: 1,
          needsReview: 1,
          quotedToday: 1,
          ticketedToday: 0,
          completedToday: 0,
          exposedSellables: 1,
        },
        exposures: [],
        conversations: [],
        intakes: [
          {
            intakeId: 'intake-1',
            conversationId: 'conv-1',
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
            updatedAt: '2026-04-03T11:00:00.000Z',
            promotedTicketId: null,
            lines: [
              {
                lineId: 'line-1',
                entityType: 'sku',
                entityId: 'sku-1',
                requestedLabel: 'Cotton pads',
                resolvedLabel: 'Cotton pads',
                quantity: 2,
                unitPrice: 6,
                lineTotal: 12,
                availabilityStatus: 'available',
                ambiguityReason: null,
              },
            ],
          },
          {
            intakeId: 'intake-2',
            conversationId: 'conv-2',
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
            updatedAt: '2026-04-03T11:00:00.000Z',
            promotedTicketId: null,
            lines: [
              {
                lineId: 'line-2',
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
        ],
      },
    });

    expect(model.intakeRows[0]?.overviewHref).toBe(
      '/?workflow=customer&customerFilter=quoted&customerTask=automation%3Aintake%3Aintake-1',
    );
    expect(model.exceptionRows[0]?.overviewHref).toBe(
      '/?workflow=customer&customerFilter=review&customerTask=automation%3Aintake%3Aintake-2',
    );
    expect(model.recentActivity[0]?.overviewHref).toBe(
      '/?workflow=customer&customerFilter=quoted&customerTask=automation%3Aintake%3Aintake-1',
    );
    expect(model.today.map((row) => row.href)).toEqual([
      '/?workflow=customer&customerFilter=review',
      '/?workflow=customer&customerFilter=review',
      '/?workflow=customer&customerFilter=quoted',
      '/?workflow=customer&customerFilter=closed',
    ]);
  });
});
