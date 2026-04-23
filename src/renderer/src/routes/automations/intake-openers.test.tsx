import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, test, vi } from 'vitest';
import { AutomationExceptionTable } from './exception-table';
import { AutomationIntakeTable } from './intake-table';
import { RecentAutomationActivityRail } from './recent-activity-rail';
import type { AutomationExceptionRow, AutomationIntakeTableRow, AutomationRailRow } from './view-model';

const intakeRow: AutomationIntakeTableRow = {
  actionLabel: 'Open intake',
  conversationId: 'conv-1',
  createdLabel: 'Created today',
  customerLabel: 'Ada',
  customerMeta: '@ada',
  href: '/automations?section=intake&conversation=conv-1&intake=intake-1',
  intakeId: 'intake-1',
  overviewHref: '/?workflow=customer&customerFilter=review&customerTask=automation%3Aintake%3Aintake-1',
  quoteLabel: null,
  requestLabel: '2 scarves',
  statusLabel: 'New',
  statusTone: 'info',
  ticketHref: null,
};

const exceptionRow: AutomationExceptionRow = {
  actionLabel: 'Open intake',
  confidenceLabel: 'LOW',
  confidenceTone: 'warning',
  conversationId: 'conv-2',
  customerLabel: 'Bora',
  href: '/automations?section=exceptions&conversation=conv-2&intake=intake-2',
  intakeId: 'intake-2',
  issueLabel: 'Parser failed',
  messageSnippet: 'unclear request',
  overviewHref: '/?workflow=customer&customerFilter=review&customerTask=automation%3Aintake%3Aintake-2',
  ticketHref: null,
};

const ticketedExceptionRow: AutomationExceptionRow = {
  ...exceptionRow,
  actionLabel: 'Open ticket',
  intakeId: 'intake-3',
  overviewHref: '/?workflow=customer&customerFilter=open&customerTask=automation%3Aintake%3Aintake-3',
  ticketHref: '/record-update/customer-orders-pending?ticketMode=edit&ticketId=ticket-3',
};

const railRow: AutomationRailRow = {
  conversationId: 'conv-3',
  detail: 'just now',
  href: '/automations?section=intake&conversation=conv-3&intake=intake-3',
  id: 'intake-3',
  intakeId: 'intake-3',
  label: 'Received Telegram intake from Dara',
  overviewHref: '/?workflow=customer&customerFilter=open&customerTask=automation%3Aintake%3Aintake-3',
  valueLabel: '$12',
};

describe('automation popup openers', () => {
  test('opens intake drawers locally instead of navigating through row links', async () => {
    const user = userEvent.setup();
    const onOpenIntake = vi.fn();

    render(
      <MemoryRouter>
        <AutomationIntakeTable rows={[intakeRow]} onOpenIntake={onOpenIntake} />
      </MemoryRouter>,
    );

    expect(screen.queryByRole('link', { name: /Ada/i })).not.toBeInTheDocument();
    const intakeButton = screen.getByRole('button', { name: /Open intake/i });
    const intakeButtonClassTokens = intakeButton.className.split(/\s+/);
    expect(intakeButtonClassTokens).toContain('min-w-[152px]');
    expect(intakeButtonClassTokens).not.toContain('w-[152px]');

    await user.click(screen.getByRole('button', { name: /Ada/i }));
    expect(onOpenIntake).toHaveBeenCalledWith(intakeRow);
  });

  test('opens exception drawers locally from the action button', async () => {
    const user = userEvent.setup();
    const onOpenIntake = vi.fn();

    render(<AutomationExceptionTable rows={[exceptionRow]} onOpenIntake={onOpenIntake} />);

    const actionButton = screen.getByRole('button', { name: 'Open intake' });
    const buttonClassTokens = actionButton.className.split(/\s+/);
    expect(buttonClassTokens).toContain('min-w-[152px]');
    expect(buttonClassTokens).not.toContain('w-[152px]');

    await user.click(actionButton);
    expect(onOpenIntake).toHaveBeenCalledWith(exceptionRow);
  });

  test('links promoted exception rows to the existing customer ticket edit flow', () => {
    render(
      <MemoryRouter>
        <AutomationExceptionTable rows={[ticketedExceptionRow]} onOpenIntake={vi.fn()} />
      </MemoryRouter>,
    );

    expect(screen.getByRole('link', { name: 'Open ticket' })).toHaveAttribute(
      'href',
      ticketedExceptionRow.ticketHref,
    );
  });

  test('links recent automation activity to the Overview customer queue', () => {
    const onOpenIntake = vi.fn();

    render(
      <MemoryRouter>
        <RecentAutomationActivityRail rows={[railRow]} onOpenIntake={onOpenIntake} />
      </MemoryRouter>,
    );

    expect(screen.getByRole('link', { name: /Received Telegram intake/i })).toHaveAttribute(
      'href',
      railRow.overviewHref,
    );
  });
});
