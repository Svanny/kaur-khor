import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  AutomationConversationSummary,
  AutomationMessageRecord,
  AutomationOrderIntake,
} from '@shared/automation';
import type { AutomationContextValue } from '@/state/automation';
import { AutomationsRoute, buildTelegramOpenUrl } from './automations';

const automationHook = vi.fn<() => AutomationContextValue>();
const inventoryHook = vi.fn();
const preferencesHook = vi.fn();
const deriveAutomationViewModel = vi.fn();

interface AutomationThreadFixture {
  conversation: AutomationConversationSummary;
  intake: AutomationOrderIntake;
  messages: AutomationMessageRecord[];
}

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
  AutomationIntakeTable: ({ rows }: { rows: Array<{ intakeId: string; customerLabel: string }> }) => (
    <div>
      <div>Intake table</div>
      {rows.map((row) => (
        <div key={row.intakeId} data-testid={`intake-row-${row.intakeId}`}>{row.customerLabel}</div>
      ))}
    </div>
  ),
}));

vi.mock('./automations/exception-table', () => ({
  AutomationExceptionTable: () => <div>Exception table</div>,
}));

vi.mock('./automations/intake-drawer', () => ({
  AutomationIntakeDrawer: ({
    intake,
    open,
    onClose,
  }: {
    intake: AutomationOrderIntake | null;
    open: boolean;
    onClose: () => void;
  }) => open && intake ? (
    <div aria-label={`${intake.customerDisplayName ?? intake.intakeId} intake drawer`} role="dialog">
      <p>Intake drawer for {intake.intakeId}</p>
      <button type="button" onClick={onClose}>Close intake drawer</button>
    </div>
  ) : null,
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

function renderForcedIntake(initialEntry = '/work/intake') {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <AutomationsRoute forcedSection="intake" />
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
    readIntakeThread: vi.fn(),
    sendIntakeThreadMessage: vi.fn(),
    listIntakes: vi.fn(),
    readIntake: vi.fn(),
    resolveIntake: vi.fn(),
    promoteIntake: vi.fn(),
    testTelegramConnection: vi.fn(),
    ...overrides,
  };
}

function makeIntake(overrides: Partial<AutomationOrderIntake> = {}): AutomationOrderIntake {
  return {
    intakeId: 'intake-1',
    conversationId: 'conv-1',
    channel: 'telegram',
    status: 'new',
    parseConfidence: 'high',
    customerDisplayName: 'Ada',
    customerHandle: '@ada',
    phone: '+85512345678',
    notes: null,
    quotedSubtotal: 12,
    currencyCode: 'USD',
    deliveryFee: null,
    quotedTotal: 12,
    createdAt: '2026-04-21T00:00:00.000Z',
    updatedAt: '2026-04-21T00:00:00.000Z',
    promotedTicketId: null,
    lines: [
      {
        lineId: 'line-1',
        entityType: 'sku',
        entityId: 'sku-1',
        requestedLabel: 'scarf',
        resolvedLabel: 'SKU 1',
        quantity: 1,
        unitPrice: 12,
        lineTotal: 12,
        availabilityStatus: 'available',
        ambiguityReason: null,
      },
    ],
    ...overrides,
  };
}

function makeThreadFixture(
  intake: AutomationOrderIntake,
  overrides: Partial<AutomationThreadFixture> = {},
): AutomationThreadFixture {
  return {
    conversation: {
      conversationId: 'conv-1',
      channel: 'telegram',
      externalConversationKey: 'telegram-chat-1',
      customerDisplayName: 'Ada',
      customerHandle: '@ada',
      phone: '+85512345678',
      lastMessageAt: '2026-04-21T00:00:00.000Z',
      messageCount: 1,
      latestIntakeStatus: intake.status,
      latestTicketId: null,
    },
    intake,
    messages: [
      {
        messageId: 'msg-in',
        conversationId: 'conv-1',
        intakeId: 'intake-1',
        externalMessageKey: '1',
        direction: 'inbound',
        sentAt: '2026-04-21T00:00:00.000Z',
        rawText: '1 scarf',
        normalizedText: '1 scarf',
        parseConfidence: 'high',
      },
    ],
    ...overrides,
  };
}

describe('AutomationsRoute', () => {
  beforeEach(() => {
    vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined);
    Element.prototype.scrollIntoView = vi.fn();
    Object.defineProperty(window, 'kaurKhorDesktop', {
      configurable: true,
      value: {
        system: {
          getAppContext: vi.fn().mockResolvedValue({ appVersion: 'test', platform: 'darwin' }),
          openExternalUrl: vi.fn(),
        },
      },
    });
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

  it('redirects without a hook-order crash when automation availability changes after render', async () => {
    automationHook.mockReturnValue(makeAutomationState(true));

    const routeTree = () => (
      <MemoryRouter initialEntries={['/automations']}>
        <Routes>
          <Route element={<div>Overview screen</div>} path="/" />
          <Route element={<AutomationsRoute />} path="/automations" />
        </Routes>
      </MemoryRouter>
    );
    const { rerender } = render(routeTree());

    expect(screen.getByRole('tab', { name: /Overview/i })).toBeInTheDocument();

    preferencesHook.mockReturnValue({
      currency: 'USD',
      language: 'en',
      showAutomationsPage: false,
      usdToKhrExchangeRate: 4000,
      t: (key: string) => (key === 'navAutomations' ? 'Automations' : key),
    });

    expect(() => rerender(routeTree())).not.toThrow();
    expect(await screen.findByText('Overview screen')).toBeInTheDocument();
  });

  it('shows hero actions, tabs, and ribbon after telegram bot settings are saved', () => {
    automationHook.mockReturnValue(makeAutomationState(true));

    renderRoute();

    expect(screen.getByRole('button', { name: 'Disconnect bot' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Overview/i })).toBeInTheDocument();
    expect(screen.getByText('Connection')).toBeInTheDocument();
  });

  it('opens the matching intake drawer from automation route params', async () => {
    automationHook.mockReturnValue(makeAutomationState(true, {
      intakes: [makeIntake()],
    }));

    renderRoute('/automations?section=intake&conversation=conv-1&intake=intake-1');

    expect(await screen.findByRole('dialog', { name: 'Ada intake drawer' })).toBeInTheDocument();
    expect(screen.getByText('Intake drawer for intake-1')).toBeInTheDocument();
  });

  it('excludes canceled intake rows from the default all filter while keeping the canceled filter explicit', () => {
    const activeIntake = makeIntake({
      intakeId: 'intake-active',
      conversationId: 'conv-active',
      customerDisplayName: 'Active customer',
      status: 'quoted',
    });
    const canceledIntake = makeIntake({
      intakeId: 'intake-canceled',
      conversationId: 'conv-canceled',
      customerDisplayName: 'Canceled customer',
      status: 'canceled',
    });
    automationHook.mockReturnValue(makeAutomationState(true, {
      intakes: [activeIntake, canceledIntake],
    }));
    deriveAutomationViewModel.mockReturnValue({
      ribbon: [],
      today: [],
      recentActivity: [],
      coverage: [],
      intakeRows: [
        {
          intakeId: 'intake-active',
          conversationId: 'conv-active',
          customerLabel: 'Active customer',
          customerMeta: null,
          requestLabel: '1 scarf',
          quoteLabel: '$12.00',
          statusLabel: 'Quoted',
          statusTone: 'info',
          createdLabel: 'Created now',
          actionLabel: 'Open intake',
          href: '#',
          ticketHref: null,
          overviewHref: '#',
        },
        {
          intakeId: 'intake-canceled',
          conversationId: 'conv-canceled',
          customerLabel: 'Canceled customer',
          customerMeta: null,
          requestLabel: '1 scarf',
          quoteLabel: '$12.00',
          statusLabel: 'Canceled',
          statusTone: 'neutral',
          createdLabel: 'Created now',
          actionLabel: 'Open intake',
          href: '#',
          ticketHref: null,
          overviewHref: '#',
        },
      ],
      exceptionRows: [],
    });

    const renderedAll = renderForcedIntake('/work/intake?section=intake');

    expect(screen.getByTestId('intake-row-intake-active')).toBeInTheDocument();
    expect(screen.queryByTestId('intake-row-intake-canceled')).not.toBeInTheDocument();

    renderedAll.unmount();
    renderForcedIntake('/work/intake?section=intake&filter=canceled');

    expect(screen.queryByTestId('intake-row-intake-active')).not.toBeInTheDocument();
    expect(screen.getByTestId('intake-row-intake-canceled')).toBeInTheDocument();
  });

  it('renders the Work intake chat tab for one selected intake thread', async () => {
    const intake = makeIntake();
    const readIntakeThread = vi.fn(async () => makeThreadFixture(intake, {
      conversation: {
        ...makeThreadFixture(intake).conversation,
        messageCount: 2,
      },
      messages: [
        makeThreadFixture(intake).messages[0],
        {
          messageId: 'msg-out',
          conversationId: 'conv-1',
          intakeId: 'intake-1',
          externalMessageKey: '2',
          direction: 'outbound',
          sentAt: '2026-04-21T00:01:00.000Z',
          rawText: 'Your order has been approved.',
          normalizedText: null,
          parseConfidence: null,
        },
      ],
    }));
    automationHook.mockReturnValue(makeAutomationState(true, {
      intakes: [intake],
      readIntakeThread,
    }));

    renderForcedIntake('/work/intake?section=chat&intake=intake-1');

    expect(await screen.findByRole('tab', { name: /Chat/i })).toBeInTheDocument();
    expect(await screen.findByText('1 scarf')).toBeInTheDocument();
    expect(screen.getByText('Your order has been approved.')).toBeInTheDocument();
    expect(readIntakeThread).toHaveBeenCalledWith({ intakeId: 'intake-1' });
    expect(Element.prototype.scrollIntoView).toHaveBeenCalledWith({ block: 'end' });
    expect(screen.queryByRole('dialog', { name: 'Ada intake drawer' })).not.toBeInTheDocument();
  });

  it('refreshes an open Work intake chat thread when the selected intake updates', async () => {
    const intake = makeIntake();
    const updatedIntake = makeIntake({
      parseConfidence: 'low',
      status: 'needs_review',
      updatedAt: '2026-04-21T00:02:00.000Z',
    });
    const readIntakeThread = vi
      .fn()
      .mockResolvedValueOnce(makeThreadFixture(intake))
      .mockResolvedValueOnce(makeThreadFixture(updatedIntake, {
        conversation: {
          ...makeThreadFixture(updatedIntake).conversation,
          lastMessageAt: '2026-04-21T00:02:00.000Z',
          messageCount: 2,
        },
        messages: [
          makeThreadFixture(updatedIntake).messages[0],
          {
            messageId: 'msg-follow-up',
            conversationId: 'conv-1',
            intakeId: 'intake-1',
            externalMessageKey: '2',
            direction: 'inbound',
            sentAt: '2026-04-21T00:02:00.000Z',
            rawText: 'Hi?',
            normalizedText: 'hi?',
            parseConfidence: 'low',
          },
        ],
      }));
    automationHook.mockReturnValue(makeAutomationState(true, {
      intakes: [intake],
      readIntakeThread,
    }));

    const rendered = renderForcedIntake('/work/intake?section=chat&intake=intake-1');

    expect(await screen.findByText('1 scarf')).toBeInTheDocument();
    await waitFor(() => expect(readIntakeThread).toHaveBeenCalledTimes(1));

    automationHook.mockReturnValue(makeAutomationState(true, {
      intakes: [updatedIntake],
      readIntakeThread,
    }));
    rendered.rerender(
      <MemoryRouter initialEntries={['/work/intake?section=chat&intake=intake-1']}>
        <AutomationsRoute forcedSection="intake" />
      </MemoryRouter>,
    );

    await waitFor(() => expect(readIntakeThread).toHaveBeenCalledTimes(2));
    expect(await screen.findByText('Hi?')).toBeInTheDocument();
  });

  it('sends a customer message from the Work intake chat thread and renders the refreshed history', async () => {
    const intake = makeIntake();
    const readIntakeThread = vi.fn(async () => makeThreadFixture(intake));
    const sendIntakeThreadMessage = vi.fn(async () => makeThreadFixture(intake, {
      conversation: {
        ...makeThreadFixture(intake).conversation,
        lastMessageAt: '2026-04-21T00:01:00.000Z',
        messageCount: 2,
      },
      messages: [
        makeThreadFixture(intake).messages[0],
        {
          messageId: 'msg-out',
          conversationId: 'conv-1',
          intakeId: 'intake-1',
          externalMessageKey: '2',
          direction: 'outbound',
          sentAt: '2026-04-21T00:01:00.000Z',
          rawText: 'We can deliver tomorrow.',
          normalizedText: null,
          parseConfidence: null,
        },
      ],
    }));
    automationHook.mockReturnValue(makeAutomationState(true, {
      intakes: [intake],
      readIntakeThread,
      sendIntakeThreadMessage,
    }));

    renderForcedIntake('/work/intake?section=chat&intake=intake-1');
    fireEvent.change(await screen.findByLabelText('Message customer'), {
      target: { value: 'We can deliver tomorrow.' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Send message' }));

    await waitFor(() => expect(sendIntakeThreadMessage).toHaveBeenCalledWith({
      intakeId: 'intake-1',
      text: 'We can deliver tomorrow.',
    }));
    expect(await screen.findByText('We can deliver tomorrow.')).toBeInTheDocument();
    expect(screen.getByLabelText('Message customer')).toHaveValue('');
  });

  it('selects a Work intake chat list item without opening the intake drawer', async () => {
    const intake = makeIntake();
    const readIntakeThread = vi.fn(async () => makeThreadFixture(intake));
    automationHook.mockReturnValue(makeAutomationState(true, {
      intakes: [intake],
      readIntakeThread,
    }));

    renderForcedIntake('/work/intake?section=chat');
    fireEvent.click(await screen.findByRole('button', { name: /Ada/i }));

    await waitFor(() => expect(readIntakeThread).toHaveBeenCalledWith({ intakeId: 'intake-1' }));
    expect(await screen.findByText('1 scarf')).toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: 'Ada intake drawer' })).not.toBeInTheDocument();
  });

  it('leaves Work intake chat for live intake without opening the selected chat intake drawer', async () => {
    const intake = makeIntake();
    const readIntakeThread = vi.fn(async () => makeThreadFixture(intake));
    automationHook.mockReturnValue(makeAutomationState(true, {
      intakes: [intake],
      readIntakeThread,
    }));

    renderForcedIntake('/work/intake?section=chat&intake=intake-1');
    expect(await screen.findByText('1 scarf')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: /Live intake/i }));

    expect(screen.queryByRole('dialog', { name: 'Ada intake drawer' })).not.toBeInTheDocument();
  });

  it('shows browser while-tab-open messaging and polling action in browser mode', async () => {
    Object.defineProperty(window, 'kaurKhorDesktop', {
      configurable: true,
      value: {
        system: {
          getAppContext: vi.fn().mockResolvedValue({ appVersion: 'browser-test', platform: 'web' }),
          openExternalUrl: vi.fn(),
        },
      },
    });
    automationHook.mockReturnValue(makeAutomationState(true));

    renderRoute();

    expect(await screen.findByText('Browser automation runs only while this tab is open.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Poll Telegram now' })).toBeInTheDocument();
  });

  it('shows browser-blocked state when direct Telegram polling fails in browser mode', async () => {
    Object.defineProperty(window, 'kaurKhorDesktop', {
      configurable: true,
      value: {
        system: {
          getAppContext: vi.fn().mockResolvedValue({ appVersion: 'browser-test', platform: 'web' }),
          openExternalUrl: vi.fn(),
        },
      },
    });
    const testTelegramConnection = vi.fn().mockRejectedValue(new Error('Telegram browser fetch was blocked.'));
    automationHook.mockReturnValue(makeAutomationState(true, { testTelegramConnection }));

    renderRoute();
    fireEvent.click(await screen.findByRole('button', { name: 'Poll Telegram now' }));

    await waitFor(() => expect(screen.getByText('Telegram browser fetch blocked')).toBeInTheDocument());
    expect(screen.getByText('Telegram browser fetch was blocked.')).toBeInTheDocument();
  });

  it('uses the Work intake window height frame with bottom breathing room', () => {
    automationHook.mockReturnValue(makeAutomationState(true));

    const { container } = renderForcedIntake();

    expect(screen.getByRole('tab', { name: /Live intake/i })).toBeInTheDocument();
    expect(screen.getByText('Advanced experimental automation settings')).toBeInTheDocument();
    expect(screen.getByText('This tab is a work in progress. Telegram automation is experimental, subject to change, and might be unstable.')).toBeInTheDocument();
    expect(container.querySelector('[data-work-window-root="intake"]')?.className).toContain('flex-1');
    expect(container.querySelector('[data-work-window="intake"]')?.className).toContain('shrink-0');
    expect(container.querySelector('[data-work-bottom-breathing-room="intake"]')?.className).toContain('h-32');
  });

  it('shows new and quoted filters in live intake', () => {
    automationHook.mockReturnValue(makeAutomationState(true));

    renderForcedIntake('/work/intake?section=intake');

    expect(screen.getByRole('radio', { name: 'New' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Quoted' })).toBeInTheDocument();
  });

  it('localizes automation route chrome and filters when Khmer is active', () => {
    preferencesHook.mockReturnValue({
      currency: 'USD',
      language: 'km',
      showAutomationsPage: true,
      usdToKhrExchangeRate: 4000,
      t: (key: string) => (key === 'navAutomations' ? 'ស្វ័យប្រវត្តិកម្ម' : key),
    });
    automationHook.mockReturnValue(makeAutomationState(true));

    renderRoute('/automations?section=intake');

    expect(screen.getByRole('searchbox', { name: 'ស្វែងរកស្វ័យប្រវត្តិកម្ម' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /សំណើផ្ទាល់/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'ត្រូវពិនិត្យ' })).toBeInTheDocument();
    expect(screen.queryByText('Search automations')).not.toBeInTheDocument();
    expect(screen.queryByText('No Telegram intake')).not.toBeInTheDocument();
  });

  it('localizes the automation route descriptor in Khmer', () => {
    preferencesHook.mockReturnValue({
      currency: 'USD',
      language: 'km',
      showAutomationsPage: true,
      usdToKhrExchangeRate: 4000,
      t: (key: string) => (key === 'navAutomations' ? 'ស្វ័យប្រវត្តិកម្ម' : key),
    });
    automationHook.mockReturnValue(makeAutomationState(true));

    renderRoute();

    expect(screen.getByText('បង្ហាញធាតុដែលអនុម័តទៅតេលេក្រាម បំលែងសារទៅជាសំបុត្រការងារអតិថិជន ហើយរក្សាកខជាប្រភពពិតសម្រាប់តម្លៃ និងការបំពេញការបញ្ជាទិញ។')).toBeInTheDocument();
    expect(screen.queryByText(/Expose approved sellables/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/turn messages into customer tickets/i)).not.toBeInTheDocument();
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
    window.kaurKhorDesktop.system.openExternalUrl = openExternalUrl;
    automationHook.mockReturnValue(makeAutomationState(true));

    renderRoute();
    fireEvent.click(screen.getByRole('button', { name: 'Open bot' }));

    expect(openExternalUrl).toHaveBeenCalledWith('tg://resolve?domain=configured_bot');
  });

  it('links from Telegram bot settings to Work intake', () => {
    automationHook.mockReturnValue(makeAutomationState(true));

    renderRoute();

    expect(screen.getByRole('link', { name: 'Open intake' })).toHaveAttribute('href', '/work/intake');
  });

  it('links from Work intake to Telegram automation settings', () => {
    automationHook.mockReturnValue(makeAutomationState(true));

    renderForcedIntake();

    expect(screen.getByRole('link', { name: 'Open settings' })).toHaveAttribute('href', '/settings/automation');
  });

  it('hides the Work intake link while already embedded in Work intake', () => {
    automationHook.mockReturnValue(makeAutomationState(true));

    renderForcedIntake();

    expect(screen.queryByRole('link', { name: 'Open intake' })).not.toBeInTheDocument();
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

  it('shows a failure popup when saving saved telegram settings without providing the token again', async () => {
    const saveConnection = vi.fn();
    automationHook.mockReturnValue(makeAutomationState(true, { saveConnection }));

    renderRoute('/automations?section=settings');
    fireEvent.click(screen.getByRole('button', { name: 'Save Telegram settings' }));

    await waitFor(() => expect(screen.getByText('Telegram settings not saved')).toBeInTheDocument());
    expect(saveConnection).not.toHaveBeenCalled();
  });
});
