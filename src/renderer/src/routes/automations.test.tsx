import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AutomationContextValue } from '@/state/automation';
import { AutomationsRoute, buildTelegramOpenUrl } from './automations';

const automationHook = vi.fn<() => AutomationContextValue>();
const inventoryHook = vi.fn();
const preferencesHook = vi.fn();
const deriveAutomationViewModel = vi.fn();

vi.mock('@/state/automation', () => ({
  useAutomation: () => automationHook(),
}));

vi.mock('@/state/inventory', () => ({
  useInventory: () => inventoryHook(),
}));

vi.mock('@/state/preferences', () => ({
  usePreferences: () => preferencesHook(),
}));

vi.mock('./automations/view-model', () => ({
  deriveAutomationViewModel: (...args: unknown[]) => deriveAutomationViewModel(...args),
}));

vi.mock('./automations/connection-card', () => ({
  AutomationConnectionCard: ({
    onBotTokenChange,
    onSave,
  }: {
    onBotTokenChange: (value: string) => void;
    onSave: () => void;
  }) => (
    <div>
      <div>Connection card</div>
      <button type="button" onClick={() => onBotTokenChange('telegram-token')}>Set token</button>
      <button type="button" onClick={onSave}>Save Telegram settings</button>
    </div>
  ),
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

function renderRoute(initialEntry = '/automations') {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <AutomationsRoute />
    </MemoryRouter>,
  );
}

function makeAutomationState(hasBotToken: boolean, overrides: Partial<AutomationContextValue> = {}): AutomationContextValue {
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
    ...overrides,
  };
}

describe('AutomationsRoute', () => {
  beforeEach(() => {
    vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined);
    inventoryHook.mockReturnValue({
      catalog: {
        schemaVersion: 1,
        bundles: [],
        services: [],
        sharingMask: [],
        skus: [{
          archived: false,
          costPerUnit: 4,
          description: 'SKU',
          leadTimeMeanDaysHint: 5,
          leadTimeStdDaysHint: 1,
          name: 'SKU 1',
          productPrice: 9,
          skuId: 'sku-1',
          soldAsProduct: true,
        }],
      },
      latestRun: null,
      observations: [{ observationId: 'obs-1' }],
      reports: [{ reportId: 'report-1' }],
      workspaceSummary: null,
    });
    preferencesHook.mockReturnValue({
      currency: 'USD',
      language: 'en',
      showAutomationsPage: true,
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

  it('redirects back to overview when the automations page is hidden in preferences', async () => {
    preferencesHook.mockReturnValue({
      currency: 'USD',
      language: 'en',
      showAutomationsPage: false,
      usdToKhrExchangeRate: 4000,
      t: (key: string) => (key === 'navAutomations' ? 'Automations' : key),
    });

    render(
      <MemoryRouter initialEntries={['/automations']}>
        <Routes>
          <Route element={<div>Overview screen</div>} path="/" />
          <Route element={<AutomationsRoute />} path="/automations" />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByText('Overview screen')).toBeInTheDocument();
  });

  it('shows hero actions, tabs, and ribbon after telegram bot settings are saved', () => {
    automationHook.mockReturnValue(makeAutomationState(true));

    renderRoute();

    expect(screen.getByRole('button', { name: 'Disconnect bot' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Overview/i })).toBeInTheDocument();
    expect(screen.getByText('Connection')).toBeInTheDocument();
  });

  it('warns in overview when unavailable sellables are still exposed to Telegram', () => {
    automationHook.mockReturnValue(makeAutomationState(true, {
      exposures: [
        {
          entityType: 'sku',
          entityId: 'sku-1',
          label: 'Handwoven Belt',
          archived: false,
          exposed: true,
          price: 25,
          availabilityStatus: 'unavailable',
          availabilityLabel: 'Unavailable',
          alias: null,
          sortOrder: 0,
        },
      ],
    }));

    renderRoute();

    expect(screen.getByText('Unavailable sellables are still exposed')).toBeInTheDocument();
    expect(screen.getByText(/1 customer-facing Telegram item is unavailable but still toggled on/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Review exposed sellables/i })).toBeInTheDocument();
  });

  it('opens the bot through the Telegram app deep link instead of a browser window', () => {
    const openExternalUrl = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(window, 'banjiDesktop', {
      configurable: true,
      value: {
        system: {
          openExternalUrl,
        },
      },
    });
    automationHook.mockReturnValue(makeAutomationState(true));

    renderRoute();
    fireEvent.click(screen.getByRole('button', { name: 'Open bot' }));

    expect(openExternalUrl).toHaveBeenCalledWith('tg://resolve?domain=configured_bot');
  });

  it('builds the Telegram app link from the current bot username draft', () => {
    expect(buildTelegramOpenUrl('@draft_bot', 'https://t.me/configured_bot')).toBe(
      'tg://resolve?domain=draft_bot',
    );
  });

  it('falls back to a valid Telegram link when the username is invalid', () => {
    expect(buildTelegramOpenUrl('bad/user', 'https://t.me/fallback_bot')).toBe(
      'tg://resolve?domain=fallback_bot',
    );
  });

  it('shows a success popup, unlocks automations, and scrolls to the top after saving telegram settings', async () => {
    const saveConnection = vi.fn().mockResolvedValue({
      channel: 'telegram',
      status: 'connected',
      hasBotToken: true,
      botDisplayName: 'Configured bot',
      botUsername: 'configured_bot',
      externalLink: 'https://t.me/configured_bot',
      connectedAt: '2026-04-21T00:00:00.000Z',
      pausedAt: null,
      lastWebhookAt: null,
      lastErrorAt: null,
      lastErrorMessage: null,
    });
    automationHook.mockReturnValue(makeAutomationState(false, { saveConnection }));

    renderRoute();
    fireEvent.click(screen.getByRole('button', { name: 'Set token' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save Telegram settings' }));

    await waitFor(() => expect(screen.getByText('Telegram settings saved')).toBeInTheDocument());
    expect(screen.getByRole('tab', { name: /Overview/i })).toBeInTheDocument();
    expect(window.scrollTo).toHaveBeenCalledWith({ top: 0, behavior: 'smooth' });
    expect(saveConnection).toHaveBeenCalledTimes(1);
  });

  it('shows a failure popup when saving without a telegram bot token', async () => {
    automationHook.mockReturnValue(makeAutomationState(false));

    renderRoute();
    fireEvent.click(screen.getByRole('button', { name: 'Save Telegram settings' }));

    await waitFor(() => expect(screen.getByText('Telegram settings not saved')).toBeInTheDocument());
    expect(screen.queryByRole('tab', { name: /Overview/i })).not.toBeInTheDocument();
  });
});
