import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
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
  );
}

function automationWorkspace() {
  return {
    connection: null,
    conversations: [],
    exposures: [],
    intakes: [],
    metrics: null,
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
});
