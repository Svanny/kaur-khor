import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, test, vi } from 'vitest';
import type { AutomationOrderIntake } from '@shared/automation';
import { AutomationIntakeDrawer } from './intake-drawer';

function makeIntake(): AutomationOrderIntake {
  return {
    channel: 'telegram',
    conversationId: 'conversation-1',
    createdAt: '2026-04-21T00:00:00.000Z',
    customerDisplayName: 'Dara',
    customerHandle: '@dara',
    intakeId: 'intake-1',
    lines: [
      {
        ambiguityReason: null,
        entityId: 'sku-1',
        entityType: 'sku',
        lineId: 'line-1',
        lineTotal: 12,
        quantity: 2,
        requestedLabel: 'soap',
        resolvedLabel: 'Soap',
        unitPrice: 6,
      },
    ],
    notes: null,
    parseConfidence: 'high',
    phone: null,
    promotedTicketId: null,
    quotedSubtotal: 12,
    quotedTotal: 12,
    rawText: 'soap 2',
    status: 'quoted',
    updatedAt: '2026-04-21T00:00:00.000Z',
  };
}

describe('AutomationIntakeDrawer', () => {
  test('localizes the source badge in Khmer', async () => {
    render(
      <AutomationIntakeDrawer
        conversationId={null}
        intake={makeIntake()}
        isSaving={false}
        language="km"
        open
        onClose={vi.fn()}
        onPromote={vi.fn()}
        onReadConversation={vi.fn()}
        onResolve={vi.fn()}
      />,
    );

    await waitFor(() => expect(screen.getByText('ប្រភព')).toBeInTheDocument());
    expect(screen.getByText('តេលេក្រាម')).toBeInTheDocument();
    expect(screen.queryByText('Telegram')).not.toBeInTheDocument();
  });
});
