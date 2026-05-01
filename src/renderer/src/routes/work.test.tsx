import type { ReactNode } from 'react';
import { act, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { WorkRoute } from './work';

const inventoryHook = vi.fn();
const automationHook = vi.fn();
const preferenceState = {
  currency: 'USD',
  language: 'en',
  showExplanatoryTooltips: false,
  showFloatingTitleActions: false,
  showRightRailCards: false,
  showOverviewTaskTabs: false,
  showAutomationsPage: true,
  taskBatchUpdatePreferences: {
    batchUpdate: 'ask',
    updateEta: 'ask',
    followUp: 'ask',
    receive: 'ask',
    review: 'ask',
  } as const,
  overviewStaleUpdateReminderSnoozeUntil: null as string | null,
};

vi.mock('../state/inventory', () => ({
  useInventory: () => inventoryHook(),
  useInventoryActions: () => ({
    loadSenaOrderBatches: inventoryHook().loadSenaOrderBatches,
    loadSenaSkuDetail: inventoryHook().loadSenaSkuDetail,
  }),
  useInventoryState: () => inventoryHook(),
}));

vi.mock('../state/automation', () => ({
  useAutomation: () => automationHook(),
}));

vi.mock('../state/preferences', () => ({
  usePreferences: () => ({
    currency: preferenceState.currency,
    language: preferenceState.language,
    showExplanatoryTooltips: preferenceState.showExplanatoryTooltips,
    showFloatingTitleActions: preferenceState.showFloatingTitleActions,
    showRightRailCards: preferenceState.showRightRailCards,
    showOverviewTaskTabs: preferenceState.showOverviewTaskTabs,
    showAutomationsPage: preferenceState.showAutomationsPage,
    taskBatchUpdatePreferences: preferenceState.taskBatchUpdatePreferences,
    overviewStaleUpdateReminderSnoozeUntil: preferenceState.overviewStaleUpdateReminderSnoozeUntil,
    t: (key: string) => {
      if (key === 'navWork') {
        return preferenceState.language === 'km' ? 'ការងារ' : 'Work';
      }
      if (key === 'searchPlaceholder') {
        return 'Search name or description…';
      }
      return key;
    },
  }),
}));

describe('WorkRoute', () => {
  beforeEach(() => {
    window.localStorage.clear();
    preferenceState.language = 'en';
    preferenceState.showAutomationsPage = true;
    inventoryHook.mockReturnValue({
      catalog: {
        schemaVersion: 1,
        skus: [
          {
            skuId: 'sku-1',
            name: 'Razor refill',
            description: 'A test SKU',
            unitsInStock: 10,
            costPerUnit: 5,
            soldAsProduct: true,
            productPrice: 12,
            leadTimeMeanDays: 5,
            leadTimeStdDays: 1,
          },
        ],
        services: [],
        bundles: [],
        sharingMask: [],
      },
      isLoading: false,
      observations: [],
      orderBatches: [],
      workspaceSummary: {
        skuSummaries: [],
        highRiskSkuIds: [],
      },
      loadSenaOrderBatches: vi.fn(),
      loadSenaSkuDetail: vi.fn(),
    });
    automationHook.mockReturnValue({
      intakes: [],
      exposures: [],
      connection: null,
      error: null,
      isLoading: false,
      isSaving: false,
      metrics: null,
    });
  });

  function renderWithProviders(route: string, element: ReactNode, path: string) {
    return render(
      <MemoryRouter initialEntries={[route]}>
        <Routes>
          <Route element={element} path={path} />
        </Routes>
      </MemoryRouter>,
    );
  }

  async function renderWithProvidersSettled(route: string, element: ReactNode, path: string) {
    let view!: ReturnType<typeof renderWithProviders>;
    await act(async () => {
      view = renderWithProviders(route, element, path);
      await Promise.resolve();
    });
    return view;
  }

  test('renders the hub landing page at /work', async () => {
    window.localStorage.setItem('banji:page-state-memory:v1', JSON.stringify({
      inbox: '?workflow=customer&customerFilter=review',
    }));

    await renderWithProvidersSettled('/work', <WorkRoute />, '/work/*');
    expect(screen.getByText('Daily operator work')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Queue/i })).toHaveAttribute(
      'href',
      '/work/queue?workflow=customer&customerFilter=review',
    );
    expect(screen.getByRole('link', { name: /Intake/i })).toBeInTheDocument();
  });

  test('uses the keyed Khmer Work label for the work page eyebrow', async () => {
    preferenceState.language = 'km';

    await renderWithProvidersSettled('/work', <WorkRoute />, '/work/*');

    expect(screen.getByText('ការងារ')).toBeInTheDocument();
  });

  test('hides the intake hub tile when automations are disabled', async () => {
    preferenceState.showAutomationsPage = false;

    await renderWithProvidersSettled('/work', <WorkRoute />, '/work/*');

    const queueLink = screen.getByRole('link', { name: /Queue/i });
    expect(queueLink).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Intake/i })).not.toBeInTheDocument();
    expect(queueLink.parentElement?.parentElement).toHaveStyle({ '--centered-tile-columns': '2' });
  });

  test('renders the full dashboard title card on /work/queue', async () => {
    await renderWithProvidersSettled('/work/queue', <WorkRoute />, '/work/*');
    // DashboardRoute (non-embedded) renders its own title card with "Queue" title
    expect(screen.getByText('Queue')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Search name or description…')).toBeInTheDocument();
  });

  test('renders the hero title card on /work/capture', async () => {
    await renderWithProvidersSettled('/work/capture', <WorkRoute />, '/work/*');
    expect(screen.getByText('Daily operator work')).toBeInTheDocument();
  });

  test('does not render the work title card on /work/intake', async () => {
    await renderWithProvidersSettled('/work/intake', <WorkRoute />, '/work/*');
    expect(screen.queryByText('Daily operator work')).not.toBeInTheDocument();
  });

  test('redirects /work/intake to queue when automations are disabled', async () => {
    preferenceState.showAutomationsPage = false;

    await renderWithProvidersSettled('/work/intake', <WorkRoute />, '/work/*');

    expect(screen.getByText('Queue')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Search name or description…')).toBeInTheDocument();
  });
});
