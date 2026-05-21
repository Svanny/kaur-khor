import type { ReactNode } from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const inventoryHook = vi.fn();
const preferencesHook = vi.fn();

vi.mock('@/state/inventory', () => ({
  InventoryProvider: ({ children }: { children: ReactNode }) => children,
  useInventory: () => inventoryHook(),
  useInventoryState: () => inventoryHook(),
}));

vi.mock('@/state/preferences', () => ({
  PreferencesProvider: ({ children }: { children: ReactNode }) => children,
  usePreferences: () => preferencesHook(),
}));

vi.mock('@/state/automation', () => ({
  AutomationProvider: ({ children }: { children: ReactNode }) => children,
}));

vi.mock('@/components/kaur-khor-shell', () => ({
  KaurKhorShell: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

vi.mock('@/components/command-palette', () => ({
  CommandPaletteProvider: ({ children }: { children: ReactNode }) => children,
}));

vi.mock('@/state/navigation-history', () => ({
  NavigationHistoryProvider: ({ children }: { children: ReactNode }) => children,
}));

vi.mock('@/routes/workspace/dashboard', () => ({
  DashboardRoute: () => <div>Inbox screen</div>,
}));
vi.mock('@/routes/workspace/work', () => ({
  WorkRoute: () => <div>Work screen</div>,
}));
vi.mock('@/routes/workspace/command-home', () => ({
  CommandHomeRoute: () => <div>Home screen</div>,
}));
vi.mock('@/routes/insights/insights', () => ({
  InsightsRoute: () => <div>Insights screen</div>,
}));
vi.mock('@/routes/insights/analysis', () => ({
  AnalysisRoute: () => <div>Analysis screen</div>,
}));
vi.mock('@/routes/records/record-update-hub', () => ({
  RecordUpdateHubRoute: () => <div>Record update screen</div>,
}));
vi.mock('@/routes/insights/performance', () => ({
  PerformanceRoute: () => <div>Performance screen</div>,
}));
vi.mock('@/routes/insights/financials', () => ({
  FinancialsRoute: () => <div>Financials screen</div>,
}));
vi.mock('@/routes/automations', () => ({
  AutomationsRoute: () => <div>Automations screen</div>,
}));
vi.mock('@/routes/inventory', () => ({
  InventoryRoute: () => <div>Products screen</div>,
}));
vi.mock('@/routes/help/help', () => ({
  HelpRoute: () => <div>Help screen</div>,
}));
vi.mock('@/routes/inventory/sku-form', () => ({
  SkuFormRoute: () => <div>SKU form screen</div>,
}));
vi.mock('@/routes/inventory/sku-detail', () => ({
  SkuDetailRoute: () => <div>SKU detail screen</div>,
  SkuDetailLedgerRoute: () => <div>SKU ledger screen</div>,
}));
vi.mock('@/routes/inventory/service-form', () => ({
  ServiceFormRoute: () => <div>Service form screen</div>,
}));
vi.mock('@/routes/inventory/service-detail', () => ({
  ServiceDetailRoute: () => <div>Service detail screen</div>,
}));
vi.mock('@/routes/records/stock-update', () => ({
  StockUpdateRoute: () => <div>Logs screen</div>,
}));
vi.mock('@/routes/workspace/archive', () => ({
  ArchiveRoute: () => <div>Archive screen</div>,
}));
vi.mock('@/routes/settings/settings', () => ({
  SettingsRoute: () => <div>Settings screen</div>,
}));
vi.mock('@/routes/records/stock-update-session', () => ({
  StockUpdateSessionRoute: () => <div>Stock update session screen</div>,
}));
vi.mock('@/routes/workspace/onboarding', () => ({
  OnboardingRoute: ({ allowCompleted = false }: { allowCompleted?: boolean }) => (
    <div>{allowCompleted ? 'Onboarding screen reopened' : 'Onboarding screen'}</div>
  ),
}));

import { AppRoutes, LoadedApp, routeBenchmarkName } from './App';

describe('AppRoutes', () => {
  beforeEach(() => {
    preferencesHook.mockReturnValue({
      isHydrated: true,
      language: 'en',
      onboardingCompletedAt: '2026-04-10T00:00:00.000Z',
    });
    inventoryHook.mockReturnValue({
      catalog: {
        schemaVersion: 1,
        bundles: [],
        services: [],
        sharingMask: [],
        skus: [],
      },
      isLoading: false,
      observations: [{ observationId: 'obs-1' }],
    });
  });

  function renderRoutes(initialEntry: string) {
    render(
      <MemoryRouter initialEntries={[initialEntry]}>
        <AppRoutes />
      </MemoryRouter>,
    );
  }

  it('redirects the locked catalog landing page to create the first SKU', async () => {
    renderRoutes('/catalog');

    expect(await screen.findByText('SKU form screen')).toBeInTheDocument();
  });

  it('keeps direct catalog creation routes accessible before the catalog tab unlocks', () => {
    renderRoutes('/catalog/skus/new');

    expect(screen.getByText('SKU form screen')).toBeInTheDocument();
  });

  it('sends removed operations routes to home', () => {
    renderRoutes('/operations');

    expect(screen.getByText('Home screen')).toBeInTheDocument();
  });

  it('redirects deprecated custom capture links to the POS stock-count session', async () => {
    inventoryHook.mockReturnValue({
      catalog: {
        schemaVersion: 1,
        bundles: [],
        services: [],
        sharingMask: [],
        skus: [{ archived: false, costPerUnit: 4, description: 'SKU', name: 'SKU 1', skuId: 'sku-1' }],
      },
      isLoading: false,
      observations: [{ observationId: 'obs-1' }],
    });

    renderRoutes('/work/capture/custom?lanes=stock-count,supplier-order-pending');

    expect(await screen.findByText('Stock update session screen')).toBeInTheDocument();
  });

  it('opens history from settings after the catalog has a SKU or service', async () => {
    inventoryHook.mockReturnValue({
      catalog: {
        schemaVersion: 1,
        bundles: [],
        services: [{ archived: false, bundle: false, description: 'Service', price: 12, serviceId: 'service-1', name: 'Service 1' }],
        sharingMask: [],
        skus: [],
      },
      isLoading: false,
      observations: [{ observationId: 'obs-1' }],
    });

    renderRoutes('/settings/history');

    expect(await screen.findByText('Logs screen')).toBeInTheDocument();
  });

  it('sends removed record update routes to home', () => {
    renderRoutes('/record-update');

    expect(screen.getByText('Home screen')).toBeInTheDocument();
  });

  it('sends removed performance pages to home', () => {
    renderRoutes('/performance');
    expect(screen.getByText('Home screen')).toBeInTheDocument();
  });

  it('sends removed financials pages to home', () => {
    renderRoutes('/financials');
    expect(screen.getByText('Home screen')).toBeInTheDocument();
  });

  it('sends removed automations pages to home', async () => {
    renderRoutes('/automations');
    expect(await screen.findByText('Home screen')).toBeInTheDocument();
  });

  it('sends removed automations query-state routes to home', async () => {
    renderRoutes('/automations?section=intake&filter=needs_review');
    expect(await screen.findByText('Home screen')).toBeInTheDocument();
  });

  it.each([
    '/planning',
    '/sist',
    '/inventory',
    '/record-update/sales-update',
    '/record-update/record-order',
    '/record-update/record-receipt',
    '/record-update/supplier-receipts',
  ])('does not preserve deprecated route alias %s', (pathname) => {
    renderRoutes(pathname);

    expect(screen.getByText('Home screen')).toBeInTheDocument();
  });
});

describe('routeBenchmarkName', () => {
  it.each([
    ['/', 'home'],
    ['/work/queue', 'work.queue'],
    ['/work/capture', 'work.capture'],
    ['/work/intake', 'work.intake'],
    ['/insights', 'insights'],
    ['/insights/pressure', 'insights.pressure'],
    ['/insights/money', 'insights.money'],
    ['/insights/explain', 'insights.explain'],
    ['/catalog/skus/sku-1', 'sku-detail'],
    ['/catalog/services/service-1', 'service-detail'],
    ['/settings/history', 'history'],
    ['/catalog', 'catalog'],
    ['/settings/local-data', 'settings-local-data'],
  ])('maps %s to %s', (pathname, expected) => {
    expect(routeBenchmarkName(pathname)).toBe(expected);
  });
});

describe('LoadedApp', () => {
  beforeEach(() => {
    preferencesHook.mockReturnValue({
      isHydrated: true,
      language: 'en',
      onboardingCompletedAt: '2026-04-10T00:00:00.000Z',
    });
    inventoryHook.mockReturnValue({
      catalog: {
        schemaVersion: 1,
        bundles: [],
        services: [],
        sharingMask: [],
        skus: [],
      },
      isLoading: false,
      observations: [{ observationId: 'obs-1' }],
    });
  });

  it('renders the work route through the provider stack', async () => {
    render(
      <MemoryRouter initialEntries={['/work/queue']}>
        <LoadedApp />
      </MemoryRouter>,
    );

    expect(await screen.findByText('Work screen')).toBeInTheDocument();
  });

  it('keeps incomplete onboarding inside the onboarding route', async () => {
    preferencesHook.mockReturnValue({
      isHydrated: true,
      language: 'en',
      onboardingCompletedAt: null,
    });

    render(
      <MemoryRouter initialEntries={['/work/queue']}>
        <LoadedApp />
      </MemoryRouter>,
    );

    expect(await screen.findByText('Onboarding screen')).toBeInTheDocument();
    expect(screen.queryByText('Work screen')).not.toBeInTheDocument();
  });

  it('redirects completed users away from stale onboarding routes', async () => {
    render(
      <MemoryRouter initialEntries={['/onboarding']}>
        <LoadedApp />
      </MemoryRouter>,
    );

    expect(await screen.findByText('Home screen')).toBeInTheDocument();
    expect(screen.queryByText('Onboarding screen')).not.toBeInTheDocument();
  });

  it('lets completed users explicitly reopen onboarding', async () => {
    render(
      <MemoryRouter
        initialEntries={[{
          pathname: '/onboarding',
          state: { kaurKhorAllowCompletedOnboarding: true },
        }]}
      >
        <LoadedApp />
      </MemoryRouter>,
    );

    expect(await screen.findByText('Onboarding screen reopened')).toBeInTheDocument();
    expect(screen.queryByText('Home screen')).not.toBeInTheDocument();
  });

  it('marks the hydrated app shell with the active Khmer language', async () => {
    preferencesHook.mockReturnValue({
      isHydrated: true,
      language: 'km',
      onboardingCompletedAt: '2026-04-10T00:00:00.000Z',
    });

    const { container } = render(
      <MemoryRouter initialEntries={['/']}>
        <LoadedApp />
      </MemoryRouter>,
    );

    expect(await screen.findByText('Home screen')).toBeInTheDocument();
    const languageRoot = container.querySelector('[data-language="km"]');
    expect(languageRoot).not.toBeNull();
    expect(languageRoot).toHaveAttribute('lang', 'km');
  });
});
