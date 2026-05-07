import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AutomationProvider, useAutomation } from './automation';

const loadWorkSupportData = vi.fn();

vi.mock('./inventory', () => ({
  useInventoryActions: () => ({
    loadWorkSupportData,
  }),
}));

function Harness() {
  const automation = useAutomation();
  return (
    <>
      <p data-testid="intake-count">{automation.intakes.length}</p>
      <button
        type="button"
        onClick={() =>
          void automation.promoteIntake({
            intakeId: 'intake-1',
            mode: 'create_ticket',
          })
        }
      >
        promote
      </button>
    </>
  );
}

function automationWorkspace(intakes: unknown[] = []) {
  return {
    connection: {
      channel: 'telegram',
      status: 'connected',
      hasBotToken: true,
      botDisplayName: null,
      botUsername: null,
      externalLink: null,
      connectedAt: null,
      pausedAt: null,
      lastErrorAt: null,
      lastErrorMessage: null,
      lastWebhookAt: null,
    },
    conversations: [],
    exposures: [],
    intakes,
    metrics: {
      completedToday: 0,
      exposedSellables: 0,
      needsReview: 0,
      ordersToday: intakes.length,
      quotedToday: 0,
      ticketedToday: 0,
    },
  };
}

describe('AutomationProvider', () => {
  beforeEach(() => {
    loadWorkSupportData.mockReset();
    loadWorkSupportData.mockResolvedValue(null);
    window.kaurKhorDesktop = {
      automation: {
        getWorkspace: vi.fn(async () => automationWorkspace()),
        promoteIntake: vi.fn(async () => ({
          commercialEvents: [],
          intake: {
            intakeId: 'intake-1',
            conversationId: 'conversation-1',
            status: 'ticketed',
          },
          ticketEvent: null,
        })),
      },
    } as never;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('refreshes inventory Work support data after promoting an intake', async () => {
    render(
      <AutomationProvider>
        <Harness />
      </AutomationProvider>,
    );

    fireEvent.click(screen.getByText('promote'));

    await waitFor(() => {
          expect(window.kaurKhorDesktop.automation?.promoteIntake).toHaveBeenCalledWith({
        intakeId: 'intake-1',
        mode: 'create_ticket',
      });
      expect(loadWorkSupportData).toHaveBeenCalledWith({ includeObservations: true });
    });
  });

  it('refreshes the workspace while Telegram intake is connected', async () => {
    vi.useFakeTimers();
    const getWorkspace = vi.fn()
      .mockResolvedValueOnce(automationWorkspace())
      .mockResolvedValueOnce(automationWorkspace([{ intakeId: 'intake-1' }]));
    window.kaurKhorDesktop = {
      automation: {
        getWorkspace,
      },
    } as never;

    render(
      <AutomationProvider>
        <Harness />
      </AutomationProvider>,
    );

    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.getByTestId('intake-count')).toHaveTextContent('0');

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2_000);
    });

    expect(getWorkspace).toHaveBeenCalledTimes(2);
    expect(screen.getByTestId('intake-count')).toHaveTextContent('1');
  });
});
