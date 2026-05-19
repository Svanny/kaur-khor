import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AutomationProvider, useAutomation } from './automation';

const loadWorkSupportData = vi.fn();
let inventoryState = {
  isLoading: false,
  isPreparingWorkspace: false,
};

vi.mock('./inventory', () => ({
  useInventoryState: () => inventoryState,
  useInventoryActions: () => ({
    loadWorkSupportData,
  }),
}));

function Harness() {
  const automation = useAutomation();
  return (
    <>
      <p data-testid="intake-count">{automation.intakes.length}</p>
      <p data-testid="saving">{String(automation.isSaving)}</p>
      <button type="button" onClick={() => void automation.reload()}>
        reload
      </button>
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
      <button
        type="button"
        onClick={() =>
          void automation.saveConnection({
            enabled: true,
          } as never)
        }
      >
        save connection
      </button>
    </>
  );
}

function deferredPromise<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((nextResolve, nextReject) => {
    resolve = nextResolve;
    reject = nextReject;
  });
  return { promise, reject, resolve };
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
    inventoryState = {
      isLoading: false,
      isPreparingWorkspace: false,
    };
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
        saveConnection: vi.fn(async () => automationWorkspace().connection),
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

  it('waits for inventory startup before the initial automation workspace load', async () => {
    inventoryState = {
      isLoading: true,
      isPreparingWorkspace: false,
    };
    const getWorkspace = vi.fn(async () => automationWorkspace());
    window.kaurKhorDesktop = {
      automation: {
        getWorkspace,
      },
    } as never;

    const { rerender } = render(
      <AutomationProvider>
        <Harness />
      </AutomationProvider>,
    );

    await act(async () => {
      await Promise.resolve();
    });
    expect(getWorkspace).not.toHaveBeenCalled();

    inventoryState = {
      isLoading: false,
      isPreparingWorkspace: false,
    };
    rerender(
      <AutomationProvider>
        <Harness />
      </AutomationProvider>,
    );

    await waitFor(() => {
      expect(getWorkspace).toHaveBeenCalledTimes(1);
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

  it('ignores stale automation workspace responses after a newer reload finishes', async () => {
    const initialWorkspace = automationWorkspace();
    const staleWorkspace = automationWorkspace([{ intakeId: 'stale-intake' }]);
    const latestWorkspace = automationWorkspace([{ intakeId: 'latest-intake' }, { intakeId: 'second-intake' }]);
    const staleRequest = deferredPromise<ReturnType<typeof automationWorkspace>>();
    const latestRequest = deferredPromise<ReturnType<typeof automationWorkspace>>();
    const getWorkspace = vi.fn()
      .mockResolvedValueOnce(initialWorkspace)
      .mockReturnValueOnce(staleRequest.promise)
      .mockReturnValueOnce(latestRequest.promise);
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

    await waitFor(() => {
      expect(getWorkspace).toHaveBeenCalledTimes(1);
    });
    fireEvent.click(screen.getByText('reload'));
    fireEvent.click(screen.getByText('reload'));

    await waitFor(() => {
      expect(getWorkspace).toHaveBeenCalledTimes(3);
    });

    await act(async () => {
      latestRequest.resolve(latestWorkspace);
      await Promise.resolve();
    });

    expect(screen.getByTestId('intake-count')).toHaveTextContent('2');

    await act(async () => {
      staleRequest.resolve(staleWorkspace);
      await Promise.resolve();
    });

    expect(screen.getByTestId('intake-count')).toHaveTextContent('2');
  });

  it('keeps saving state true until overlapping automation mutations finish', async () => {
    const promoteRequest = deferredPromise<{
      commercialEvents: [];
      intake: { conversationId: string; intakeId: string; status: string };
      ticketEvent: null;
    }>();
    const saveConnectionRequest = deferredPromise<ReturnType<typeof automationWorkspace>['connection']>();
    window.kaurKhorDesktop = {
      automation: {
        getWorkspace: vi.fn(async () => automationWorkspace()),
        promoteIntake: vi.fn(() => promoteRequest.promise),
        saveConnection: vi.fn(() => saveConnectionRequest.promise),
      },
    } as never;

    render(
      <AutomationProvider>
        <Harness />
      </AutomationProvider>,
    );

    fireEvent.click(screen.getByText('promote'));
    fireEvent.click(screen.getByText('save connection'));

    await waitFor(() => {
      expect(screen.getByTestId('saving')).toHaveTextContent('true');
    });

    await act(async () => {
      promoteRequest.resolve({
        commercialEvents: [],
        intake: {
          conversationId: 'conversation-1',
          intakeId: 'intake-1',
          status: 'ticketed',
        },
        ticketEvent: null,
      });
      await Promise.resolve();
    });

    expect(screen.getByTestId('saving')).toHaveTextContent('true');

    await act(async () => {
      saveConnectionRequest.resolve(automationWorkspace().connection);
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(screen.getByTestId('saving')).toHaveTextContent('false');
    });
  });
});
