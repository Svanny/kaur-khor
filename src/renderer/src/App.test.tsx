import type { ReactNode } from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const inventoryHook = vi.fn();

vi.mock('@/state/inventory', () => ({
  InventoryProvider: ({ children }: { children: ReactNode }) => children,
  useInventory: () => inventoryHook(),
  useInventoryState: () => inventoryHook(),
}));

vi.mock('@/state/preferences', () => ({
  PreferencesProvider: ({ children }: { children: ReactNode }) => children,
  usePreferences: () => ({
    isHydrated: true,
    onboardingCompletedAt: '2026-04-10T00:00:00.000Z',
  }),
}));

vi.mock('@/state/automation', () => ({
  AutomationProvider: ({ children }: { children: ReactNode }) => children,
}));

vi.mock('@/components/banji-shell', () => ({
  BanjiShell: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

vi.mock('@/components/command-palette', () => ({
  CommandPaletteProvider: ({ children }: { children: ReactNode }) => children,
}));

vi.mock('@/state/navigation-history', () => ({
  NavigationHistoryProvider: ({ children }: { children: ReactNode }) => children,
}));

vi.mock('@/routes/dashboard', () => ({
  DashboardRoute: () => <div>Overview screen</div>,
}));
vi.mock('@/routes/analysis', () => ({
  AnalysisRoute: () => <div>Analysis screen</div>,
}));
vi.mock('@/routes/record-update-hub', () => ({
  RecordUpdateHubRoute: () => <div>Record update screen</div>,
}));
vi.mock('@/routes/performance', () => ({
  PerformanceRoute: () => <div>Performance screen</div>,
}));
vi.mock('@/routes/financials', () => ({
  FinancialsRoute: () => <div>Financials screen</div>,
}));
vi.mock('@/routes/automations', () => ({
  AutomationsRoute: () => <div>Automations screen</div>,
}));
vi.mock('@/routes/inventory', () => ({
  InventoryRoute: () => <div>Catalog screen</div>,
}));
vi.mock('@/routes/help', () => ({
  HelpRoute: () => <div>Help screen</div>,
}));
vi.mock('@/routes/sku-form', () => ({
  SkuFormRoute: () => <div>SKU form screen</div>,
}));
vi.mock('@/routes/sku-detail', () => ({
  SkuDetailRoute: () => <div>SKU detail screen</div>,
  SkuDetailLedgerRoute: () => <div>SKU ledger screen</div>,
}));
vi.mock('@/routes/service-form', () => ({
  ServiceFormRoute: () => <div>Service form screen</div>,
}));
vi.mock('@/routes/service-detail', () => ({
  ServiceDetailRoute: () => <div>Service detail screen</div>,
}));
vi.mock('@/routes/stock-update', () => ({
  StockUpdateRoute: () => <div>Logs screen</div>,
}));
vi.mock('@/routes/archive', () => ({
  ArchiveRoute: () => <div>Archive screen</div>,
}));
vi.mock('@/routes/settings', () => ({
  SettingsRoute: () => <div>Settings screen</div>,
}));
vi.mock('@/routes/stock-update-session', () => ({
  StockUpdateSessionRoute: () => <div>Stock update session screen</div>,
}));
vi.mock('@/routes/onboarding', () => ({
  OnboardingRoute: () => <div>Onboarding screen</div>,
}));

import { AppRoutes, LoadedApp, routeBenchmarkName } from './App';

describe('AppRoutes', () => {
  beforeEach(() => {
    inventoryHook.mockReturnValue({
      catalog: {
        schemaVersion: 1,
        bundles: [],
        services: [],
        sharingMask: [],
        skus: [],
      },
      isLoading: false,
      observations: [],
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

  it('redirects locked logs to overview when record update is still locked', () => {
    renderRoutes('/operations');

    expect(screen.getByText('Overview screen')).toBeInTheDocument();
  });

  it('redirects locked logs to record update after the catalog has a SKU or service', async () => {
    inventoryHook.mockReturnValue({
      catalog: {
        schemaVersion: 1,
        bundles: [],
        services: [{ archived: false, bundle: false, description: 'Service', price: 12, serviceId: 'service-1', name: 'Service 1' }],
        sharingMask: [],
        skus: [],
      },
      isLoading: false,
      observations: [],
    });

    renderRoutes('/operations');

    expect(await screen.findByText('Record update screen')).toBeInTheDocument();
  });

  it('redirects record update to overview before the catalog has a SKU or service', () => {
    renderRoutes('/record-update');

    expect(screen.getByText('Overview screen')).toBeInTheDocument();
  });

  it('redirects locked performance pages to overview', () => {
    renderRoutes('/performance');
    expect(screen.getByText('Overview screen')).toBeInTheDocument();
  });

  it('redirects locked financials pages to overview', () => {
    renderRoutes('/financials');
    expect(screen.getByText('Overview screen')).toBeInTheDocument();
  });

  it('keeps automations pages reachable from the app shell', async () => {
    renderRoutes('/automations');
    expect(await screen.findByText('Automations screen')).toBeInTheDocument();
  });

  it('keeps automations query-state routes reachable from the app shell', async () => {
    renderRoutes('/automations?section=intake&filter=needs_review');
    expect(await screen.findByText('Automations screen')).toBeInTheDocument();
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

    expect(screen.getByText('Overview screen')).toBeInTheDocument();
  });
});

describe('routeBenchmarkName', () => {
  it.each([
    ['/', 'dashboard'],
    ['/record-update', 'record-update'],
    ['/performance', 'performance'],
    ['/financials', 'financials'],
    ['/automations', 'automations'],
    ['/analysis', 'analysis'],
    ['/catalog/skus/sku-1', 'sku-detail'],
    ['/catalog/services/service-1', 'service-detail'],
    ['/operations', 'operations'],
    ['/catalog', 'catalog'],
    ['/settings/local-data', 'settings-local-data'],
  ])('maps %s to %s', (pathname, expected) => {
    expect(routeBenchmarkName(pathname)).toBe(expected);
  });
});

describe('LoadedApp', () => {
  it('renders the automations route through the provider stack', async () => {
    render(
      <MemoryRouter initialEntries={['/automations']}>
        <LoadedApp />
      </MemoryRouter>,
    );

    expect(await screen.findByText('Automations screen')).toBeInTheDocument();
  });
});
