import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeAll, describe, expect, test, vi } from 'vitest';
import type { AutomationOrderIntake, PromoteAutomationIntakeResult } from '@shared/automation';
import type { SenaTicketEvent } from '@shared/sena';
import { AutomationIntakeDrawer } from './intake-drawer';

beforeAll(() => {
  Element.prototype.hasPointerCapture ??= vi.fn(() => false);
  Element.prototype.releasePointerCapture ??= vi.fn();
  Element.prototype.setPointerCapture ??= vi.fn();
  Element.prototype.scrollIntoView ??= vi.fn();
});

const promotedTicketEvent: SenaTicketEvent = {
  ticketId: 'ticket-customer-1',
  ticketFamily: 'customer',
  lifecycle: 'open',
  stage: 'pending',
  revision: 1,
  eventType: 'created',
  occurredAt: '2026-04-21T00:00:00.000Z',
  lines: [],
};

function promotedIntakeResult(): PromoteAutomationIntakeResult {
  return {
    intake: makeIntake(),
    ticketEvent: promotedTicketEvent,
    commercialEvents: [],
  };
}

function makeIntake(): AutomationOrderIntake {
  return {
    channel: 'telegram',
    conversationId: 'conversation-1',
    createdAt: '2026-04-21T00:00:00.000Z',
    customerDisplayName: 'Dara',
    customerHandle: '@dara',
    currencyCode: 'USD',
    deliveryFee: null,
    intakeId: 'intake-1',
    lines: [
      {
        ambiguityReason: null,
        availabilityStatus: 'available',
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
    status: 'quoted',
    updatedAt: '2026-04-21T00:00:00.000Z',
  };
}

describe('AutomationIntakeDrawer', () => {
  test('shows intake details without the raw source cards', async () => {
    render(
      <AutomationIntakeDrawer
        intake={makeIntake()}
        isSaving={false}
        language="en"
        open
        onClose={vi.fn()}
        onPromote={vi.fn()}
        onResolve={vi.fn()}
      />,
    );

    await waitFor(() => expect(screen.getByText('Dara')).toBeInTheDocument());
    expect(screen.queryByText('Quoted subtotal')).not.toBeInTheDocument();
    expect(screen.getByText('Quoted total')).toBeInTheDocument();
    expect(screen.queryByText('Raw incoming text')).not.toBeInTheDocument();
    expect(screen.queryByText('Source')).not.toBeInTheDocument();
  });

  test('selects an existing customer ticket before appending intake', async () => {
    const user = userEvent.setup();
    const onPromote = vi.fn(async () => promotedIntakeResult());

    render(
      <AutomationIntakeDrawer
        intake={makeIntake()}
        isSaving={false}
        language="en"
        open
        onClose={vi.fn()}
        onPromote={onPromote}
        onResolve={vi.fn()}
        ticketOptions={[
          {
            id: 'ticket-customer-1',
            label: 'Dara',
            description: 'Telegram · 1 item',
            metadata: '+855 12345678',
          },
        ]}
      />,
    );

    await user.click(await screen.findByRole('button', { name: 'Append to existing customer ticket' }));
    expect(screen.queryByPlaceholderText('Existing customer ticket id')).not.toBeInTheDocument();
    await user.click(screen.getByRole('combobox', { name: /Existing customer ticket/i }));
    await user.click(await screen.findByRole('option', { name: /Dara/i }));
    await user.click(screen.getByRole('button', { name: /^Append to existing ticket$/ }));

    await waitFor(() => expect(onPromote).toHaveBeenCalledWith(expect.objectContaining({
      customerMessage: expect.objectContaining({
        send: true,
        text: expect.stringContaining('added to your existing customer ticket'),
      }),
      mode: 'append_ticket',
      ticketId: 'ticket-customer-1',
    })));
  });

  test('shows telegram handle, chat link, and sends edited customer message payload', async () => {
    const user = userEvent.setup();
    const onPromote = vi.fn(async () => promotedIntakeResult());
    const onViewChat = vi.fn();

    render(
      <AutomationIntakeDrawer
        intake={makeIntake()}
        isSaving={false}
        language="en"
        open
        onClose={vi.fn()}
        onPromote={onPromote}
        onResolve={vi.fn()}
        onViewChat={onViewChat}
      />,
    );

    expect(await screen.findByText('@dara')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'View chat' }));
    expect(onViewChat).toHaveBeenCalledWith('intake-1');
    const messageBox = screen.getByPlaceholderText('Message to customer');
    await user.clear(messageBox);
    await user.type(messageBox, 'Custom approval message');
    const createButtons = screen.getAllByRole('button', { name: /^Create customer ticket$/ });
    await user.click(createButtons.at(-1)!);

    await waitFor(() => expect(onPromote).toHaveBeenCalledWith(expect.objectContaining({
      customerMessage: {
        send: true,
        text: 'Custom approval message',
      },
    })));
  });

  test('preserves selected action while the same intake refreshes', async () => {
    const user = userEvent.setup();
    const intake = makeIntake();
    const { rerender } = render(
      <AutomationIntakeDrawer
        intake={intake}
        isSaving={false}
        language="en"
        open
        onClose={vi.fn()}
        onPromote={vi.fn()}
        onResolve={vi.fn()}
      />,
    );

    await user.click(await screen.findByRole('button', { name: 'Cancel intake', pressed: false }));
    expect(screen.getByRole('button', { name: 'Cancel intake', pressed: true })).toBeInTheDocument();

    rerender(
      <AutomationIntakeDrawer
        intake={{ ...intake, updatedAt: '2026-04-21T00:01:00.000Z' }}
        isSaving={false}
        language="en"
        open
        onClose={vi.fn()}
        onPromote={vi.fn()}
        onResolve={vi.fn()}
      />,
    );

    expect(screen.getByRole('button', { name: 'Cancel intake', pressed: true })).toBeInTheDocument();
  });
});
