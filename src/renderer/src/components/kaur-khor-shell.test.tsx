import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { PAGE_STATE_MEMORY_STORAGE_KEY } from '@/lib/settings/page-state-memory';
import { NavigationHistoryProvider } from '@/state/navigation-history';
import { KaurKhorShell } from './kaur-khor-shell';

const inventoryHook = vi.fn();
const preferencesHook = vi.fn();
const applyDisplayViewMode = vi.fn();
const markUnlockedNavItemSeen = vi.fn(async () => {});

function LocationProbe() {
  const location = useLocation();
  return <div data-testid="location">{`${location.pathname}${location.search}${location.hash}`}</div>;
}

vi.mock('@/state/inventory', () => ({
  useInventory: () => inventoryHook(),
}));

vi.mock('@/state/preferences', () => ({
  usePreferences: () => preferencesHook(),
}));

describe('KaurKhorShell', () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    window.localStorage.clear();
    setViewport({ width: 375, isMobile: true });
    Object.defineProperty(window.navigator, 'platform', {
      configurable: true,
      value: 'Win32',
    });

    inventoryHook.mockReturnValue({
      catalog: {
        schemaVersion: 1,
        bundles: [],
        services: [],
        sharingMask: [],
        skus: [{ archived: false, costPerUnit: 4, description: 'SKU', leadTimeMeanDaysHint: 5, leadTimeStdDaysHint: 1, name: 'SKU 1', productPrice: 9, skuId: 'sku-1', soldAsProduct: true }],
      },
      error: null,
      isLoading: false,
      isPreparingWorkspace: false,
      isSaving: false,
      latestRun: {
        runId: 'run-1',
        ownerSub: 'desktop-owner',
        algorithmVersion: 'sena-analysis-v3',
        status: 'succeeded',
        observationCount: 2,
        createdAt: '2026-04-02T00:00:00Z',
        completedAt: '2026-04-02T00:01:00Z',
        summary: null,
        diagnostics: null,
        primaryArtifactKey: null,
        error: null,
      },
      observations: [{ observationId: 'obs-1' }, { observationId: 'obs-2' }],
      reports: [{ reportId: 'report-1' }],
      reload: vi.fn(),
      workspaceSummary: {
        ownerSub: 'desktop-owner',
        runId: 'run-1',
        latestObservedAt: '2026-04-02T00:00:00Z',
        skuCount: 1,
        serviceCount: 0,
        intervalCount: 2,
        pendingReorderCount: 0,
        topRegime: 'normal',
        highRiskSkuIds: [],
        skuSummaries: [],
      },
    });
    preferencesHook.mockReturnValue({
      applyDisplayViewMode,
      isHydrated: true,
      displayViewMode: 'custom',
      language: 'en',
      markUnlockedNavItemSeen,
      seenUnlockedNavItems: {
        catalog: true,
        insights: true,
        work: true,
      },
      showExplanatoryTooltips: true,
      showFloatingTitleActions: true,
      showRightRailCards: true,
      showAutomationsPage: true,
      showAnalysisPage: true,
      t: (key: string) => {
        const translations: Record<string, string> = {
          appBrand: 'KAUR KHOR',
          navOverview: 'Inbox',
          navHome: 'Home',
          navInbox: 'Inbox',
          navWork: 'Work',
          navRecordUpdate: 'Capture',
          navCapture: 'Capture',
          navPerformance: 'Performance',
          navInsights: 'Insights',
          navFinancials: 'Financials',
          navAutomations: 'Automations',
          navAnalysis: 'Explain',
          navCatalog: 'Products',
          navOperations: 'History',
          navHistory: 'History',
          navArchive: 'Archive',
          navHelp: 'Help',
          sidebarSectionMain: 'Main',
          sidebarSectionOther: 'Other',
          navSettings: 'Settings',
          settingsTitle: 'Settings',
          settingsPreferencesControlsTitle: 'Preferences',
          settingsInterfaceVisibilityTitle: 'Interface',
          settingsSenaParametersPanelTitle: 'Advanced',
          settingsLocalWorkspaceStorageTitle: 'Local data',
          settingsBenchmarksTitle: 'Benchmarks',
          settingsCreditsTitle: 'Credits',
          settingsDangerZoneTitle: 'Danger',
          workspaceUnavailable: 'Workspace unavailable',
          workspaceLoadingTitle: 'Loading workspace',
          workspaceStarting: 'Starting workspace',
          workspaceComputingTitle: 'SENA is computing your workspace',
          workspaceComputingBody: 'Computing body',
          workspaceComputingHint: 'Computing hint',
          retry: 'Retry',
          openNavigation: 'Open navigation',
          collapseNavigation: 'Collapse navigation',
          skipToContent: 'Skip to content',
          shellViewModeMaximal: 'Custom View',
          shellViewModeMinimal: 'Compact View',
        };
        return translations[key] ?? key;
      },
    });
    applyDisplayViewMode.mockReset();
    markUnlockedNavItemSeen.mockReset();
  });

  test('closes the mobile sidebar after following a navigation link', async () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <KaurKhorShell>
          <Routes>
            <Route element={<div>Overview screen</div>} path="/" />
            <Route element={<div>Products screen</div>} path="/catalog" />
            <Route element={<div>Help screen</div>} path="/help" />
            <Route element={<div>Settings screen</div>} path="/settings" />
          </Routes>
        </KaurKhorShell>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.queryByRole('link', { name: 'Settings' })).not.toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Open navigation' }));
    fireEvent.click(screen.getByRole('link', { name: 'Products' }));

    await waitFor(() => {
      expect(screen.getByText('Products screen')).toBeInTheDocument();
      expect(screen.queryByRole('link', { name: 'Settings' })).not.toBeInTheDocument();
    });
  });

  test('keeps the desktop side panel visible in the embedded browser shell on narrow viewports', () => {
    document.documentElement.dataset.kaurKhorEmbeddedViewport = 'true';
    setViewport({ width: 742, isMobile: true });

    try {
      render(
        <MemoryRouter initialEntries={['/']}>
          <KaurKhorShell>
            <Routes>
              <Route element={<div>Overview screen</div>} path="/" />
              <Route element={<div>Settings screen</div>} path="/settings" />
            </Routes>
          </KaurKhorShell>
        </MemoryRouter>,
      );

      expect(screen.getByRole('button', { name: 'Collapse navigation' })).toBeInTheDocument();
      expect(document.querySelector('[data-mobile="true"]')).not.toBeInTheDocument();
      expect(document.querySelector('[data-slot="sidebar-container"]')).toHaveClass('embedded-desktop-sidebar-container');
      expect(document.querySelector('[data-slot="shell-viewport-frame"]')).toHaveStyle({
        height: 'var(--kaur-khor-shell-viewport-height, 100svh)',
      });
      expect(screen.getByText('Version Alpha')).toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'Home' })).toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'Settings' })).toBeInTheDocument();
    } finally {
      delete document.documentElement.dataset.kaurKhorEmbeddedViewport;
    }
  });

  test('renders the SENA-native primary navigation', () => {
    setViewport({ width: 1440, isMobile: false });
    Object.defineProperty(window.navigator, 'platform', {
      configurable: true,
      value: 'MacIntel',
    });

    render(
      <MemoryRouter initialEntries={['/']}>
        <KaurKhorShell>
          <Routes>
            <Route element={<div>Overview screen</div>} path="/" />
            <Route element={<div>Settings screen</div>} path="/settings" />
          </Routes>
        </KaurKhorShell>
      </MemoryRouter>,
    );

    expect(screen.getByRole('link', { name: 'Home' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Work' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Products' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Insights' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Settings' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Performance' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Financials' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Automations' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Explain' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'History' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Archive' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Help' })).not.toBeInTheDocument();
    expect(screen.getByText('Main')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'SIST' })).not.toBeInTheDocument();
    const navLinks = screen.getAllByRole('link').map((link) => link.getAttribute('aria-label'));
    expect(navLinks.indexOf('Home')).toBeLessThan(navLinks.indexOf('Work'));
    expect(navLinks.indexOf('Work')).toBeLessThan(navLinks.indexOf('Products'));
    expect(navLinks.indexOf('Products')).toBeLessThan(navLinks.indexOf('Insights'));
    expect(navLinks.indexOf('Insights')).toBeLessThan(navLinks.indexOf('Settings'));

    const brandToggle = screen.getByTestId('sidebar-collapse-toggle');
    const brandLabel = within(brandToggle).getByText('KAUR KHOR');
    expect(brandLabel).toBeInTheDocument();
    expect(brandLabel).not.toHaveClass('uppercase');
    const versionPill = screen.getByText('Version Alpha');
    expect(versionPill).toHaveAttribute('data-slot', 'sidebar-version-pill');
    expect(versionPill).toHaveAttribute('title', 'Expect some bugs!');
    expect(versionPill).toHaveClass('border-destructive/40');
    expect(versionPill).toHaveClass('bg-destructive/10');
    expect(versionPill).toHaveClass('w-full');
    expect(versionPill.querySelector('svg')).toBeInTheDocument();
    expect(versionPill.compareDocumentPosition(screen.getByText('Main')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByText('Search')).toBeInTheDocument();
    expect(screen.getByLabelText('Command')).toBeInTheDocument();
    expect(screen.getByText('K')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Custom View' })).not.toBeInTheDocument();
  });

  test('renders Work and Insights as expandable sidebar trees', () => {
    setViewport({ width: 1440, isMobile: false });

    render(
      <MemoryRouter initialEntries={['/']}>
        <KaurKhorShell>
          <Routes>
            <Route element={<div>Overview screen</div>} path="/" />
          </Routes>
        </KaurKhorShell>
      </MemoryRouter>,
    );

    expect(screen.getByRole('button', { name: 'Expand Work' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Expand Insights' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Queue' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Inventory' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Expand Work' }));
    expect(screen.getByRole('link', { name: 'Queue' })).toHaveAttribute('href', '/work/queue');
    expect(screen.getByRole('link', { name: 'Intake' })).toHaveAttribute('href', '/work/intake');
    expect(screen.getByRole('link', { name: 'Capture' })).toHaveAttribute('href', '/work/capture');
    const workChildLinks = ['Queue', 'Intake', 'Capture'].map((label) =>
      screen.getByRole('link', { name: label }).getAttribute('aria-label'),
    );
    expect(workChildLinks).toEqual(['Queue', 'Intake', 'Capture']);

    fireEvent.click(screen.getByRole('button', { name: 'Expand Capture' }));
    expect(screen.getByRole('link', { name: 'Products Update' })).toHaveAttribute('href', '/work/capture/stock-count');
    expect(screen.getByRole('link', { name: 'Customer Order' })).toHaveAttribute('href', '/work/capture/customer-order');
    expect(screen.getByRole('link', { name: 'Immediate Sale' })).toHaveAttribute('href', '/work/capture/immediate-sale');
    expect(screen.getByRole('link', { name: 'Supplier Order' })).toHaveAttribute('href', '/work/capture/supplier-order');
    expect(screen.queryByRole('link', { name: 'Custom' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Expand Insights' }));
    expect(screen.getByRole('link', { name: 'Inventory' })).toHaveAttribute('href', '/insights/inventory');
    expect(screen.getByRole('link', { name: 'Money' })).toHaveAttribute('href', '/insights/money');
    expect(screen.getByRole('link', { name: 'Explain' })).toHaveAttribute('href', '/insights/explain');

    const topLevelLinks = Array.from(document.querySelectorAll('[data-sidebar-tree-depth="0"]'))
      .map((link) => link.getAttribute('aria-label'));
    expect(topLevelLinks).toEqual(['Home', 'Work', 'Products', 'Insights', 'Settings']);
  });

  test('auto-expands active sidebar tree branches', () => {
    setViewport({ width: 1440, isMobile: false });

    render(
      <MemoryRouter initialEntries={['/work/capture/supplier-order']}>
        <KaurKhorShell>
          <Routes>
            <Route element={<div>Supplier order screen</div>} path="/work/capture/supplier-order" />
          </Routes>
        </KaurKhorShell>
      </MemoryRouter>,
    );

    expect(screen.getByRole('link', { name: 'Work' })).toHaveAttribute('data-active', 'false');
    expect(screen.getByRole('link', { name: 'Capture' })).toHaveAttribute('data-active', 'false');
    expect(screen.getByRole('link', { name: 'Supplier Order' })).toHaveAttribute('data-active', 'true');
  });

  test('hides nested sidebar tree rows in the collapsed desktop rail', async () => {
    setViewport({ width: 1440, isMobile: false });

    render(
      <MemoryRouter initialEntries={['/']}>
        <KaurKhorShell>
          <Routes>
            <Route element={<div>Overview screen</div>} path="/" />
          </Routes>
        </KaurKhorShell>
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Expand Work' }));
    fireEvent.click(screen.getByRole('button', { name: 'Expand Capture' }));
    fireEvent.click(screen.getByRole('button', { name: 'Expand Insights' }));
    expect(screen.getByRole('link', { name: 'Queue' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Inventory' })).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('sidebar-collapse-toggle'));

    await waitFor(() => {
      expect(screen.queryByText('Version Alpha')).not.toBeInTheDocument();
      expect(screen.queryByRole('link', { name: 'Queue' })).not.toBeInTheDocument();
      expect(screen.queryByRole('link', { name: 'Capture' })).not.toBeInTheDocument();
      expect(screen.queryByRole('link', { name: 'Inventory' })).not.toBeInTheDocument();
      const topLevelLinks = Array.from(document.querySelectorAll('[data-sidebar-tree-depth="0"]'))
        .map((link) => link.getAttribute('aria-label'));
      expect(topLevelLinks).toEqual(['Home', 'Work', 'Products', 'Insights', 'Settings']);
    });
  });

  test('does not render the alpha version pill in the mobile sidebar sheet', () => {
    setViewport({ width: 375, isMobile: true });

    render(
      <MemoryRouter initialEntries={['/']}>
        <KaurKhorShell>
          <Routes>
            <Route element={<div>Overview screen</div>} path="/" />
          </Routes>
        </KaurKhorShell>
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Open navigation' }));

    expect(screen.queryByText('Version Alpha')).not.toBeInTheDocument();
  });

  test('localizes the command shortcut glyph label in Khmer', () => {
    setViewport({ width: 1440, isMobile: false });
    Object.defineProperty(window.navigator, 'platform', {
      configurable: true,
      value: 'MacIntel',
    });
    preferencesHook.mockReturnValue({
      ...preferencesHook(),
      language: 'km',
    });

    render(
      <MemoryRouter initialEntries={['/']}>
        <KaurKhorShell>
          <Routes>
            <Route element={<div>Overview screen</div>} path="/" />
          </Routes>
        </KaurKhorShell>
      </MemoryRouter>,
    );

    expect(screen.getByLabelText('ពាក្យបញ្ជា')).toBeInTheDocument();
    expect(screen.queryByLabelText('Command')).not.toBeInTheDocument();
  });

  test('restores remembered page state from sidebar navigation links', () => {
    setViewport({ width: 1440, isMobile: false });
    window.localStorage.setItem(PAGE_STATE_MEMORY_STORAGE_KEY, JSON.stringify({
      catalog: '?q=scarf&view=skus',
      performance: '?compare=0&range=7d&scope=skus',
      settings: '/settings/interface',
    }));

    render(
      <MemoryRouter initialEntries={['/']}>
        <KaurKhorShell>
          <Routes>
            <Route element={<div>Overview screen</div>} path="/" />
            <Route element={<div>Settings screen</div>} path="/settings/*" />
          </Routes>
        </KaurKhorShell>
      </MemoryRouter>,
    );

    expect(screen.getByRole('link', { name: 'Products' })).toHaveAttribute('href', '/catalog?q=scarf&view=skus');
    expect(screen.getByRole('link', { name: 'Insights' })).toHaveAttribute('href', '/insights');
    expect(screen.getByRole('link', { name: 'Settings' })).toHaveAttribute('href', '/settings/interface');
  });

  test('renders settings navigation in the rail and returns to the app overview', async () => {
    setViewport({ width: 1440, isMobile: false });

    render(
      <MemoryRouter initialEntries={['/settings/interface']}>
        <KaurKhorShell>
          <Routes>
            <Route element={<div>Overview screen</div>} path="/" />
            <Route element={<div>Settings screen</div>} path="/settings/*" />
          </Routes>
        </KaurKhorShell>
      </MemoryRouter>,
    );

    expect(screen.getByRole('link', { name: 'Preferences' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Interface' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Advanced' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Local data' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Automations' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'History' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Benchmarks' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Help' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Credits' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Danger' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to app' })).toBeInTheDocument();
    expect(screen.getAllByText('Main')).toHaveLength(1);
    expect(screen.getAllByText('Other')).toHaveLength(1);
    expect(screen.queryByRole('link', { name: 'Work' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Settings' })).not.toBeInTheDocument();
    const settingsLinks = screen.getAllByRole('link').map((link) => link.getAttribute('aria-label'));
    expect(settingsLinks.indexOf('Back to app')).toBeLessThan(settingsLinks.indexOf('Preferences'));
    expect(settingsLinks.indexOf('Automations')).toBeLessThan(settingsLinks.indexOf('Benchmarks'));
    expect(settingsLinks.indexOf('Danger')).toBeLessThan(settingsLinks.indexOf('Help'));
    expect(settingsLinks.indexOf('Help')).toBeLessThan(settingsLinks.indexOf('Credits'));

    const brandToggle = screen.getByTestId('sidebar-collapse-toggle');
    expect(within(brandToggle).getByText('Settings')).toBeInTheDocument();
    expect(within(brandToggle).getByText('Settings')).not.toHaveClass('leading-none');
    expect(within(brandToggle).queryByText('KAUR KHOR')).not.toBeInTheDocument();
    expect(screen.queryByText('Search')).not.toBeInTheDocument();
    expect(screen.getAllByText('Settings')).toHaveLength(1);

    fireEvent.click(screen.getByRole('link', { name: 'Back to app' }));

    await waitFor(() => {
      expect(screen.getByText('Overview screen')).toBeInTheDocument();
    });
    expect(screen.getByRole('link', { name: 'Work' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Settings' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Back to app' })).not.toBeInTheDocument();
  });

  test('hides benchmark settings navigation outside dev builds', () => {
    vi.stubEnv('DEV', false);
    setViewport({ width: 1440, isMobile: false });

    render(
      <MemoryRouter initialEntries={['/settings/interface']}>
        <KaurKhorShell>
          <Routes>
            <Route element={<div>Settings screen</div>} path="/settings/*" />
          </Routes>
        </KaurKhorShell>
      </MemoryRouter>,
    );

    expect(screen.getByRole('link', { name: 'Preferences' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Interface' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Advanced' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Local data' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Automations' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'History' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Help' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Credits' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Danger' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Benchmarks' })).not.toBeInTheDocument();
  });

  test('returns from settings to the originating app route', async () => {
    setViewport({ width: 1440, isMobile: false });

    render(
      <MemoryRouter initialEntries={['/catalog?q=scarf&view=skus']}>
        <NavigationHistoryProvider>
          <KaurKhorShell>
            <Routes>
              <Route
                element={(
                  <div>
                    Products screen
                    <LocationProbe />
                  </div>
                )}
                path="/catalog"
              />
              <Route element={<div>Settings screen</div>} path="/settings/*" />
            </Routes>
          </KaurKhorShell>
        </NavigationHistoryProvider>
      </MemoryRouter>,
    );

    expect(screen.getByText('Products screen')).toBeInTheDocument();
    expect(screen.getByTestId('location')).toHaveTextContent('/catalog?q=scarf&view=skus');

    fireEvent.click(screen.getByRole('link', { name: 'Settings' }));

    await waitFor(() => {
      expect(screen.getByText('Settings screen')).toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'Back to app' })).toHaveAttribute('href', '/catalog?q=scarf&view=skus');
    });

    fireEvent.click(screen.getByRole('link', { name: 'Preferences' }));

    await waitFor(() => {
      expect(screen.getByRole('link', { name: 'Back to app' })).toHaveAttribute('href', '/catalog?q=scarf&view=skus');
    });

    fireEvent.click(screen.getByRole('link', { name: 'Back to app' }));

    await waitFor(() => {
      expect(screen.getByText('Products screen')).toBeInTheDocument();
      expect(screen.getByTestId('location')).toHaveTextContent('/catalog?q=scarf&view=skus');
    });
  });

  test('keeps archived catalog in the app rail', () => {
    setViewport({ width: 1440, isMobile: false });

    render(
      <MemoryRouter initialEntries={['/catalog?status=archived']}>
        <KaurKhorShell>
          <Routes>
            <Route element={<div>Overview screen</div>} path="/" />
            <Route element={<div>Archive screen</div>} path="/catalog" />
            <Route element={<div>Settings screen</div>} path="/settings/*" />
          </Routes>
        </KaurKhorShell>
      </MemoryRouter>,
    );

    expect(screen.getByText('Archive screen')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Back to app' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Products' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Work' })).toBeInTheDocument();
    const brandToggle = screen.getByTestId('sidebar-collapse-toggle');
    expect(within(brandToggle).getByText('KAUR KHOR')).toBeInTheDocument();
  });

  test('does not render the view mode control in the sidebar', () => {
    setViewport({ width: 1440, isMobile: false });
    preferencesHook.mockReturnValue({
      applyDisplayViewMode,
      isHydrated: true,
      displayViewMode: 'custom',
      language: 'en',
      markUnlockedNavItemSeen,
      seenUnlockedNavItems: {
        catalog: true,
        insights: true,
        work: true,
      },
      showExplanatoryTooltips: true,
      showFloatingTitleActions: true,
      showRightRailCards: true,
      showAutomationsPage: true,
      showAnalysisPage: true,
      t: (key: string) =>
        ({
          appBrand: 'KAUR KHOR',
          navOverview: 'Inbox',
          navHome: 'Home',
          navInbox: 'Inbox',
          navWork: 'Work',
          navRecordUpdate: 'Capture',
          navCapture: 'Capture',
          navPerformance: 'Performance',
          navInsights: 'Insights',
          navFinancials: 'Financials',
          navAnalysis: 'Explain',
          navCatalog: 'Products',
          navOperations: 'History',
          navHistory: 'History',
          navArchive: 'Archive',
          navHelp: 'Help',
          sidebarSectionMain: 'Main',
          sidebarSectionOther: 'Other',
          navSettings: 'Settings',
          skipToContent: 'Skip to content',
          openNavigation: 'Open navigation',
          collapseNavigation: 'Collapse navigation',
          shellViewModeMaximal: 'Custom View',
          shellViewModeMinimal: 'Compact View',
        }[key] ?? key),
    });

    render(
      <MemoryRouter initialEntries={['/']}>
        <KaurKhorShell>
          <Routes>
            <Route element={<div>Overview screen</div>} path="/" />
            <Route element={<div>Settings screen</div>} path="/settings" />
          </Routes>
        </KaurKhorShell>
      </MemoryRouter>,
    );

    expect(screen.queryByRole('button', { name: 'Custom View' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Compact View' })).not.toBeInTheDocument();
    expect(applyDisplayViewMode).not.toHaveBeenCalled();
  });

  test('hides gated tabs until enough data is available', () => {
    setViewport({ width: 1440, isMobile: false });
    inventoryHook.mockReturnValue({
      catalog: { schemaVersion: 1, bundles: [], services: [], sharingMask: [], skus: [] },
      error: null,
      isLoading: false,
      isPreparingWorkspace: false,
      isSaving: false,
      observations: [],
      reports: [],
      reload: vi.fn(),
    });

    render(
      <MemoryRouter initialEntries={['/']}>
        <KaurKhorShell>
          <Routes>
            <Route element={<div>Overview screen</div>} path="/" />
          </Routes>
        </KaurKhorShell>
      </MemoryRouter>,
    );

    expect(screen.getByRole('link', { name: 'Home' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Work' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Products' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Insights' })).not.toBeInTheDocument();
  });

  test('shows gated tabs from startup metadata before observations hydrate', () => {
    setViewport({ width: 1440, isMobile: false });
    inventoryHook.mockReturnValue({
      catalog: {
        schemaVersion: 1,
        bundles: [],
        services: [],
        sharingMask: [],
        skus: [{ archived: false, costPerUnit: 4, description: 'SKU', leadTimeMeanDaysHint: 5, leadTimeStdDaysHint: 1, name: 'SKU 1', productPrice: 9, skuId: 'sku-1', soldAsProduct: true }],
      },
      error: null,
      isLoading: false,
      isPreparingWorkspace: false,
      isSaving: false,
      latestRun: {
        runId: 'run-1',
        ownerSub: 'desktop-owner',
        algorithmVersion: 'sena-analysis-v3',
        status: 'succeeded',
        observationCount: 2,
        createdAt: '2026-04-02T00:00:00Z',
        completedAt: '2026-04-02T00:01:00Z',
        summary: null,
        diagnostics: null,
        primaryArtifactKey: null,
        error: null,
      },
      observations: [],
      reports: [],
      reload: vi.fn(),
      workspaceSummary: {
        ownerSub: 'desktop-owner',
        runId: 'run-1',
        latestObservedAt: '2026-04-02T00:00:00Z',
        skuCount: 1,
        serviceCount: 0,
        intervalCount: 2,
        pendingReorderCount: 0,
        topRegime: 'normal',
        highRiskSkuIds: [],
        skuSummaries: [],
      },
    });

    render(
      <MemoryRouter initialEntries={['/']}>
        <KaurKhorShell>
          <Routes>
            <Route element={<div>Overview screen</div>} path="/" />
          </Routes>
        </KaurKhorShell>
      </MemoryRouter>,
    );

    expect(screen.getByRole('link', { name: 'Products' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Insights' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Automations' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'History' })).not.toBeInTheDocument();
  });

  test('hides the history settings item when history is unavailable', () => {
    setViewport({ width: 1440, isMobile: false });
    inventoryHook.mockReturnValue({
      ...inventoryHook(),
      latestRun: null,
      observations: [],
      workspaceSummary: null,
    });

    render(
      <MemoryRouter initialEntries={['/settings/interface']}>
        <KaurKhorShell>
          <Routes>
            <Route element={<div>Settings screen</div>} path="/settings/*" />
          </Routes>
        </KaurKhorShell>
      </MemoryRouter>,
    );

    expect(screen.queryByRole('link', { name: 'History' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Preferences' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Interface' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Automations' })).toBeInTheDocument();
  });

  test('hides the automations navigation item when disabled', () => {
    setViewport({ width: 1440, isMobile: false });
    preferencesHook.mockReturnValue({
      applyDisplayViewMode,
      isHydrated: true,
      displayViewMode: 'custom',
      language: 'en',
      markUnlockedNavItemSeen,
      seenUnlockedNavItems: {
        catalog: true,
        insights: true,
        work: true,
      },
      showExplanatoryTooltips: true,
      showFloatingTitleActions: true,
      showRightRailCards: true,
      showAutomationsPage: false,
      showAnalysisPage: true,
      t: (key: string) =>
        ({
          appBrand: 'KAUR KHOR',
          navOverview: 'Inbox',
          navHome: 'Home',
          navInbox: 'Inbox',
          navWork: 'Work',
          navRecordUpdate: 'Capture',
          navCapture: 'Capture',
          navPerformance: 'Performance',
          navInsights: 'Insights',
          navFinancials: 'Financials',
          navAutomations: 'Automations',
          navAnalysis: 'Explain',
          navCatalog: 'Products',
          navOperations: 'History',
          navHistory: 'History',
          navArchive: 'Archive',
          navHelp: 'Help',
          sidebarSectionMain: 'Main',
          sidebarSectionOther: 'Other',
          navSettings: 'Settings',
          skipToContent: 'Skip to content',
          openNavigation: 'Open navigation',
          collapseNavigation: 'Collapse navigation',
        }[key] ?? key),
    });

    render(
      <MemoryRouter initialEntries={['/']}>
        <KaurKhorShell>
          <Routes>
            <Route element={<div>Overview screen</div>} path="/" />
          </Routes>
        </KaurKhorShell>
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Expand Work' }));
    expect(screen.queryByRole('link', { name: 'Intake' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Insights' })).toBeInTheDocument();
  });

  test('hides the automations navigation item before the first observation', () => {
    setViewport({ width: 1440, isMobile: false });
    inventoryHook.mockReturnValue({
      ...inventoryHook(),
      latestRun: null,
      observations: [],
      reports: [{ reportId: 'report-1' }],
      workspaceSummary: null,
    });

    render(
      <MemoryRouter initialEntries={['/']}>
        <KaurKhorShell>
          <Routes>
            <Route element={<div>Overview screen</div>} path="/" />
          </Routes>
        </KaurKhorShell>
      </MemoryRouter>,
    );

    expect(screen.getByRole('link', { name: 'Work' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Insights' })).not.toBeInTheDocument();
  });

  test('hides the automations navigation item when no automation-eligible sellable exists', () => {
    setViewport({ width: 1440, isMobile: false });
    inventoryHook.mockReturnValue({
      ...inventoryHook(),
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
          productPrice: null,
          skuId: 'sku-1',
          soldAsProduct: false,
        }],
      },
      reports: [{ reportId: 'report-1' }],
    });

    render(
      <MemoryRouter initialEntries={['/']}>
        <KaurKhorShell>
          <Routes>
            <Route element={<div>Overview screen</div>} path="/" />
          </Routes>
        </KaurKhorShell>
      </MemoryRouter>,
    );

    expect(screen.getByRole('link', { name: 'Insights' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Automations' })).not.toBeInTheDocument();
  });

  test('highlights newly unlocked tabs and marks them seen after navigation', async () => {
    setViewport({ width: 1440, isMobile: false });
    preferencesHook.mockReturnValue({
      applyDisplayViewMode,
      isHydrated: true,
      displayViewMode: 'custom',
      language: 'en',
      markUnlockedNavItemSeen,
      seenUnlockedNavItems: {
        catalog: false,
        insights: false,
        work: false,
      },
      showExplanatoryTooltips: true,
      showFloatingTitleActions: true,
      showRightRailCards: true,
      showAutomationsPage: true,
      showAnalysisPage: true,
      t: (key: string) =>
        ({
          appBrand: 'KAUR KHOR',
          navOverview: 'Inbox',
          navHome: 'Home',
          navInbox: 'Inbox',
          navRecordUpdate: 'Capture',
          navCapture: 'Capture',
          navPerformance: 'Performance',
          navInsights: 'Insights',
          navFinancials: 'Financials',
          navAnalysis: 'Explain',
          navCatalog: 'Products',
          navOperations: 'History',
          navHistory: 'History',
          navArchive: 'Archive',
          navHelp: 'Help',
          sidebarSectionMain: 'Main',
          sidebarSectionOther: 'Other',
          navSettings: 'Settings',
          skipToContent: 'Skip to content',
          openNavigation: 'Open navigation',
          collapseNavigation: 'Collapse navigation',
        }[key] ?? key),
    });

    render(
      <MemoryRouter initialEntries={['/insights']}>
        <KaurKhorShell>
          <Routes>
            <Route element={<div>Insights screen</div>} path="/insights" />
          </Routes>
        </KaurKhorShell>
      </MemoryRouter>,
    );

    const unlockedBadges = screen.getAllByText('New!');

    expect(unlockedBadges.length).toBeGreaterThan(0);
    expect(unlockedBadges.every((badge) => badge.className.includes('right-9'))).toBe(true);

    await waitFor(() => {
      expect(markUnlockedNavItemSeen).toHaveBeenCalledWith('insights');
    });
  });

  test('marks the Khmer unlocked badge as Khmer-safe typography', () => {
    setViewport({ width: 1440, isMobile: false });
    preferencesHook.mockReturnValue({
      applyDisplayViewMode,
      isHydrated: true,
      displayViewMode: 'custom',
      language: 'km',
      markUnlockedNavItemSeen,
      seenUnlockedNavItems: {
        catalog: false,
        insights: false,
        work: false,
      },
      showExplanatoryTooltips: true,
      showFloatingTitleActions: true,
      showRightRailCards: true,
      showAutomationsPage: true,
      showAnalysisPage: true,
      t: (key: string) =>
        ({
          appBrand: 'KAUR KHOR',
          navOverview: 'ទំព័រដើម',
          navHome: 'ទំព័រដើម',
          navInbox: 'ប្រអប់ការងារ',
          navRecordUpdate: 'កត់ត្រា',
          navCapture: 'កត់ត្រា',
          navPerformance: 'សមិទ្ធផល',
          navInsights: 'ការយល់ដឹង',
          navFinancials: 'ហិរញ្ញវត្ថុ',
          navAnalysis: 'ពន្យល់',
          navCatalog: 'ទំនិញ',
          navOperations: 'ប្រវត្តិ',
          navHistory: 'ប្រវត្តិ',
          navArchive: 'បណ្ណសារ',
          navHelp: 'ជំនួយ',
          sidebarSectionMain: 'មេ',
          sidebarSectionOther: 'ផ្សេងទៀត',
          navSettings: 'ការកំណត់',
          skipToContent: 'រំលងទៅមាតិកា',
          openNavigation: 'បើកការរុករក',
          collapseNavigation: 'បង្រួមការរុករក',
        }[key] ?? key),
    });

    render(
      <MemoryRouter initialEntries={['/']}>
        <KaurKhorShell>
          <Routes>
            <Route element={<div>Overview screen</div>} path="/" />
          </Routes>
        </KaurKhorShell>
      </MemoryRouter>,
    );

    expect(screen.getAllByText('ទើបបើក').every((badge) => badge.className.includes('khmer-safe-label'))).toBe(true);
  });

  test('keeps the unified insights navigation item when analysis mode is disabled', () => {
    setViewport({ width: 1440, isMobile: false });
    preferencesHook.mockReturnValue({
      applyDisplayViewMode,
      isHydrated: true,
      displayViewMode: 'custom',
      language: 'en',
      markUnlockedNavItemSeen,
      seenUnlockedNavItems: {
        catalog: true,
        insights: true,
        work: true,
      },
      showAutomationsPage: true,
      showAnalysisPage: false,
      showExplanatoryTooltips: true,
      showFloatingTitleActions: true,
      showRightRailCards: true,
      t: (key: string) =>
        ({
          appBrand: 'KAUR KHOR',
          navOverview: 'Inbox',
          navHome: 'Home',
          navInbox: 'Inbox',
          navRecordUpdate: 'Capture',
          navCapture: 'Capture',
          navPerformance: 'Performance',
          navInsights: 'Insights',
          navFinancials: 'Financials',
          navAnalysis: 'Explain',
          navCatalog: 'Products',
          navOperations: 'History',
          navHistory: 'History',
          navArchive: 'Archive',
          navHelp: 'Help',
          sidebarSectionMain: 'Main',
          sidebarSectionOther: 'Other',
          navSettings: 'Settings',
          skipToContent: 'Skip to content',
          openNavigation: 'Open navigation',
          collapseNavigation: 'Collapse navigation',
        }[key] ?? key),
    });

    render(
      <MemoryRouter initialEntries={['/']}>
        <KaurKhorShell>
          <Routes>
            <Route element={<div>Overview screen</div>} path="/" />
            <Route element={<div>Settings screen</div>} path="/settings" />
          </Routes>
        </KaurKhorShell>
      </MemoryRouter>,
    );

    expect(screen.getByRole('link', { name: 'Insights' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Expand Insights' }));
    expect(screen.queryByRole('link', { name: 'Explain' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Money' })).toBeInTheDocument();
  });

  test('renders the sidebar search hint in Khmer', () => {
    setViewport({ width: 1440, isMobile: false });
    preferencesHook.mockReturnValue({
      applyDisplayViewMode,
      isHydrated: true,
      displayViewMode: 'custom',
      language: 'km',
      markUnlockedNavItemSeen,
      seenUnlockedNavItems: {
        catalog: true,
        insights: true,
        work: true,
      },
      showExplanatoryTooltips: true,
      showFloatingTitleActions: true,
      showRightRailCards: true,
      showAutomationsPage: true,
      t: (key: string) =>
        ({
          appBrand: 'កខ',
          navOverview: 'ទិដ្ឋភាពទូទៅ',
          navRecordUpdate: 'កត់ត្រាការអាប់ដេត',
          navPerformance: 'សុខភាពអាជីវកម្ម',
          navFinancials: 'ហិរញ្ញវត្ថុ',
          navAnalysis: 'Explain',
          navCatalog: 'ទំនិញ',
          navOperations: 'កំណត់ហេតុ',
          navArchive: 'បណ្ណសារ',
          navHelp: 'ជំនួយ',
          sidebarSectionMain: 'មេ',
          sidebarSectionOther: 'ផ្សេងទៀត',
          navSettings: 'ការកំណត់',
          skipToContent: 'រំលងទៅមាតិកា',
          openNavigation: 'បើកម៉ឺនុយ',
          collapseNavigation: 'បង្រួមម៉ឺនុយ',
          shellViewModeMaximal: 'ទិដ្ឋភាពផ្ទាល់ខ្លួន',
          shellViewModeMinimal: 'ទិដ្ឋភាពបង្រួម',
        }[key] ?? key),
    });

    render(
      <MemoryRouter initialEntries={['/']}>
        <KaurKhorShell>
          <Routes>
            <Route element={<div>Overview screen</div>} path="/" />
          </Routes>
        </KaurKhorShell>
      </MemoryRouter>,
    );

    expect(screen.getByText('ស្វែងរក')).toBeInTheDocument();
  });

  test('hides the sidebar search hint when the desktop rail is collapsed', async () => {
    setViewport({ width: 1440, isMobile: false });

    render(
      <MemoryRouter initialEntries={['/']}>
        <KaurKhorShell>
          <Routes>
            <Route element={<div>Overview screen</div>} path="/" />
          </Routes>
        </KaurKhorShell>
      </MemoryRouter>,
    );

    expect(screen.getByText('Search')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('sidebar-collapse-toggle'));

    await waitFor(() => {
      const bannerSlot = document.querySelector('[data-slot="embedded-sidebar-banner-slot"]');
      expect(bannerSlot).not.toBeNull();
      expect(bannerSlot).toHaveClass('mb-3', 'min-h-[13.5rem]');
      expect(bannerSlot).not.toHaveClass('group-data-[collapsible=icon]:hidden');
      expect(screen.queryByText('Search')).not.toBeInTheDocument();
      expect(screen.queryByText('K')).not.toBeInTheDocument();
    });
  });

  test('hides search and keeps settings visible when the desktop rail is collapsed', async () => {
    setViewport({ width: 1440, isMobile: false });

    render(
      <MemoryRouter initialEntries={['/']}>
        <KaurKhorShell>
          <Routes>
            <Route element={<div>Overview screen</div>} path="/" />
          </Routes>
        </KaurKhorShell>
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByTestId('sidebar-collapse-toggle'));

    await waitFor(() => {
      expect(screen.queryByRole('button', { name: 'Search' })).not.toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'Settings' })).toBeInTheDocument();
    });
  });

  test('keeps the embedded sidebar banner slot above settings help links', () => {
    setViewport({ width: 1440, isMobile: false });

    render(
      <MemoryRouter initialEntries={['/settings/interface']}>
        <KaurKhorShell>
          <Routes>
            <Route element={<div>Settings screen</div>} path="/settings/interface" />
          </Routes>
        </KaurKhorShell>
      </MemoryRouter>,
    );

    const bannerSlot = document.querySelector('[data-slot="embedded-sidebar-banner-slot"]');
    expect(bannerSlot).not.toBeNull();
    expect(bannerSlot).toHaveClass('mb-2');
    expect(bannerSlot).not.toHaveClass('min-h-[13.5rem]');
    const helpLink = screen.getByRole('link', { name: 'Help' });
    expect(bannerSlot!.compareDocumentPosition(helpLink) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  test('shows the global workspace-preparing screen during a post-save preparation run', () => {
    inventoryHook.mockReturnValue({
      error: null,
      isLoading: false,
      isPreparingWorkspace: true,
      isSaving: false,
      latestRun: null,
      reload: vi.fn(),
    });

    render(
      <MemoryRouter initialEntries={['/catalog']}>
        <KaurKhorShell>
          <Routes>
            <Route element={<div>Products screen</div>} path="/catalog" />
          </Routes>
        </KaurKhorShell>
      </MemoryRouter>,
    );

    expect(screen.getByTestId('workspace-computing-screen')).toBeInTheDocument();
    expect(screen.queryByText('Products screen')).not.toBeInTheDocument();
  });

  test('offers a retry action when workspace loading fails', () => {
    const reload = vi.fn();
    inventoryHook.mockReturnValue({
      error: 'Workspace failed to load',
      isLoading: false,
      isPreparingWorkspace: false,
      isSaving: false,
      latestRun: null,
      reload,
    });

    render(
      <MemoryRouter initialEntries={['/']}>
        <KaurKhorShell>
          <Routes>
            <Route element={<div>Overview screen</div>} path="/" />
          </Routes>
        </KaurKhorShell>
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(reload).toHaveBeenCalledTimes(1);
  });

  test('shows a dedicated SENA computing screen while the workspace is loading', () => {
    inventoryHook.mockReturnValue({
      error: null,
      isLoading: true,
      isPreparingWorkspace: false,
      isSaving: false,
      latestRun: null,
      reload: vi.fn(),
    });

    render(
      <MemoryRouter initialEntries={['/']}>
        <KaurKhorShell>
          <Routes>
            <Route element={<div>Overview screen</div>} path="/" />
          </Routes>
        </KaurKhorShell>
      </MemoryRouter>,
    );

    expect(screen.getByTestId('workspace-computing-screen')).toBeInTheDocument();
    expect(screen.getByText('SENA is computing your workspace')).toBeInTheDocument();
    expect(screen.getByText('Computing body')).toBeInTheDocument();
    expect(screen.queryByText('Computing hint')).not.toBeInTheDocument();
    expect(screen.queryByText('Starting workspace')).not.toBeInTheDocument();
    expect(screen.queryByText('Overview screen')).not.toBeInTheDocument();
  });

  test('renders catalog route content while inventory is still loading', () => {
    inventoryHook.mockReturnValue({
      error: null,
      isLoading: true,
      isPreparingWorkspace: false,
      latestRun: null,
      isSaving: false,
      reload: vi.fn(),
    });

    render(
      <MemoryRouter initialEntries={['/catalog']}>
        <KaurKhorShell>
          <Routes>
            <Route element={<div>Products screen</div>} path="/catalog" />
          </Routes>
        </KaurKhorShell>
      </MemoryRouter>,
    );

    expect(screen.getByText('Products screen')).toBeInTheDocument();
    expect(screen.queryByTestId('workspace-computing-screen')).not.toBeInTheDocument();
  });

  test('keeps route content visible when a background SENA run is active', () => {
    inventoryHook.mockReturnValue({
      error: null,
      isLoading: true,
      isPreparingWorkspace: false,
      isSaving: false,
      latestRun: { status: 'running' },
      reload: vi.fn(),
    });

    render(
      <MemoryRouter initialEntries={['/catalog']}>
        <KaurKhorShell>
          <Routes>
            <Route element={<div>Products screen</div>} path="/catalog" />
          </Routes>
        </KaurKhorShell>
      </MemoryRouter>,
    );

    expect(screen.getByText('Products screen')).toBeInTheDocument();
    expect(screen.queryByTestId('workspace-computing-screen')).not.toBeInTheDocument();
  });

  test('keeps record update content visible while a save is in progress', () => {
    inventoryHook.mockReturnValue({
      error: null,
      isLoading: false,
      isPreparingWorkspace: false,
      isSaving: true,
      latestRun: null,
      reload: vi.fn(),
    });

    render(
      <MemoryRouter initialEntries={['/capture']}>
        <KaurKhorShell>
          <Routes>
            <Route element={<div>Record update screen</div>} path="/capture" />
          </Routes>
        </KaurKhorShell>
      </MemoryRouter>,
    );

    expect(screen.getByText('Record update screen')).toBeInTheDocument();
    expect(screen.getByText('Saving...')).toBeInTheDocument();
    expect(screen.queryByTestId('workspace-computing-screen')).not.toBeInTheDocument();
  });

  test('hides the global saving island when no save is active', () => {
    inventoryHook.mockReturnValue({
      error: null,
      isLoading: false,
      isPreparingWorkspace: false,
      isSaving: false,
      latestRun: null,
      reload: vi.fn(),
    });

    render(
      <MemoryRouter initialEntries={['/capture']}>
        <KaurKhorShell>
          <Routes>
            <Route element={<div>Record update screen</div>} path="/capture" />
          </Routes>
        </KaurKhorShell>
      </MemoryRouter>,
    );

    expect(screen.getByText('Record update screen')).toBeInTheDocument();
    expect(screen.queryByText('Saving...')).not.toBeInTheDocument();
  });
});

function setViewport({ width, isMobile }: { width: number; isMobile: boolean }) {
  Object.defineProperty(window, 'innerWidth', {
    configurable: true,
    writable: true,
    value: width,
  });
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: isMobile && query.includes('max-width'),
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
}
