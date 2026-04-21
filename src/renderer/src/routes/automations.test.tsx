import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AutomationContextValue } from '@/state/automation';
import { AutomationsRoute } from './automations';

const automationHook = vi.fn<() => AutomationContextValue>();
const preferencesHook = vi.fn();
const deriveAutomationViewModel = vi.fn();

vi.mock('@/state/automation', () => ({
  useAutomation: () => automationHook(),
}));

vi.mock('@/state/preferences', () => ({
  usePreferences: () => preferencesHook(),
}));

vi.mock('./automations/view-model', () => ({
  deriveAutomationViewModel: (...args: unknown[]) => deriveAutomationViewModel(...args),
}));

vi.mock('./automations/connection-card', () => ({
  AutomationConnectionCard: () => <div>Connection card</div>,
}));

vi.mock('./automations/exposure-table', () => ({
  AutomationExposureTable: () => <div>Exposure table</div>,
}));

vi.mock('./automations/intake-table', () => ({
  AutomationIntakeTable: () => <div>Intake table</div>,
}));

vi.mock('./automations/exception-table', () => ({
  AutomationExceptionTable: () => <div>Exception table</div>,
}));

vi.mock('./automations/intake-drawer', () => ({
  AutomationIntakeDrawer: () => null,
}));

vi.mock('./automations/recent-activity-rail', () => ({
  RecentAutomationActivityRail: () => <div>Recent automation activity</div>,
}));

function renderRoute() {
  return render(
    <MemoryRouter initialEntries={['/automations']}>
      <AutomationsRoute />
    </MemoryRouter>,
  );
}

function makeAutomationState(hasBotToken: boolean): AutomationContextValue {
  return {
    connection: {
      channel: 'telegram',
      status: hasBotToken ? 'connected' : 'disconnected',
      hasBotToken,
      botDisplayName: hasBotToken ? 'Configured bot' : null,
      botUsername: hasBotToken ? 'configured_bot' : null,
      externalLink: hasBotToken ? 'https://t.me/configured_bot' : null,
      connectedAt: hasBotToken ? '2026-04-21T00:00:00.000Z' : null,
      pausedAt: null,
      lastWebhookAt: null,
      lastErrorAt: null,
      lastErrorMessage: null,
    },
    conversations: [],
    exposures: [],
    intakes: [],
    metrics: {
      ordersToday: 0,
      needsReview: 0,
      quotedToday: 0,
      ticketedToday: 0,
      completedToday: 0,
      exposedSellables: 0,
    },
    error: null,
    isLoading: false,
    isSaving: false,
    reload: vi.fn(),
    loadWorkspace: vi.fn(),
    saveConnection: vi.fn(),
    patchExposureRow: vi.fn(),
    readConversation: vi.fn(),
    listIntakes: vi.fn(),
    readIntake: vi.fn(),
    resolveIntake: vi.fn(),
    promoteIntake: vi.fn(),
    testTelegramConnection: vi.fn(),
  };
}

describe('AutomationsRoute', () => {
  beforeEach(() => {
    preferencesHook.mockReturnValue({
      currency: 'USD',
      language: 'en',
      usdToKhrExchangeRate: 4000,
      t: (key: string) => (key === 'navAutomations' ? 'Automations' : key),
    });

    deriveAutomationViewModel.mockReturnValue({
      ribbon: [
        {
          key: 'connection',
          label: 'Connection',
          value: 'Connected',
          detail: 'Saved Telegram bot settings',
          tone: 'positive',
          href: '/automations?section=settings',
        },
      ],
      today: [],
      recentActivity: [],
      coverage: [],
      intakeRows: [],
      exceptionRows: [],
    });
  });

  it('shows only the settings surface before telegram bot settings are saved', () => {
    automationHook.mockReturnValue(makeAutomationState(false));

    renderRoute();

    expect(screen.getByText('Configuration')).toBeInTheDocument();
    expect(screen.getByText('Connection card')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Disconnect bot' })).not.toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: /Overview/i })).not.toBeInTheDocument();
    expect(screen.queryByText('Connection')).not.toBeInTheDocument();
  });

  it('shows hero actions, tabs, and ribbon after telegram bot settings are saved', () => {
    automationHook.mockReturnValue(makeAutomationState(true));

    renderRoute();

    expect(screen.getByRole('button', { name: 'Disconnect bot' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Overview/i })).toBeInTheDocument();
    expect(screen.getByText('Connection')).toBeInTheDocument();
  });
});
