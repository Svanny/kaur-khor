import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { PAGE_STATE_MEMORY_STORAGE_KEY } from '@/lib/page-state-memory';
import { BanjiShell } from './banji-shell';

const inventoryHook = vi.fn();
const preferencesHook = vi.fn();
const applyDisplayViewMode = vi.fn();
const markUnlockedNavItemSeen = vi.fn(async () => {});

vi.mock('@/state/inventory', () => ({
  useInventory: () => inventoryHook(),
}));

vi.mock('@/state/preferences', () => ({
  usePreferences: () => preferencesHook(),
}));

describe('BanjiShell', () => {
  beforeEach(() => {
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
          appBrand: 'banji',
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
          navCatalog: 'Catalog',
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
        <BanjiShell>
          <Routes>
            <Route element={<div>Overview screen</div>} path="/" />
            <Route element={<div>Catalog screen</div>} path="/catalog" />
            <Route element={<div>Help screen</div>} path="/help" />
            <Route element={<div>Settings screen</div>} path="/settings" />
          </Routes>
        </BanjiShell>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.queryByRole('link', { name: 'Settings' })).not.toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Open navigation' }));
    fireEvent.click(screen.getByRole('link', { name: 'Catalog' }));

    await waitFor(() => {
      expect(screen.getByText('Catalog screen')).toBeInTheDocument();
      expect(screen.queryByRole('link', { name: 'Settings' })).not.toBeInTheDocument();
    });
  });

  test('renders the SENA-native primary navigation', () => {
    setViewport({ width: 1440, isMobile: false });
    Object.defineProperty(window.navigator, 'platform', {
      configurable: true,
      value: 'MacIntel',
    });

    render(
      <MemoryRouter initialEntries={['/']}>
        <BanjiShell>
          <Routes>
            <Route element={<div>Overview screen</div>} path="/" />
            <Route element={<div>Settings screen</div>} path="/settings" />
          </Routes>
        </BanjiShell>
      </MemoryRouter>,
    );

    expect(screen.getByRole('link', { name: 'Home' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Work' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Catalog' })).toBeInTheDocument();
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
    expect(navLinks.indexOf('Work')).toBeLessThan(navLinks.indexOf('Catalog'));
    expect(navLinks.indexOf('Catalog')).toBeLessThan(navLinks.indexOf('Insights'));
    expect(navLinks.indexOf('Insights')).toBeLessThan(navLinks.indexOf('Settings'));

    const brandToggle = screen.getByTestId('sidebar-collapse-toggle');
    const brandLabel = within(brandToggle).getByText('banji');
    expect(brandLabel).toBeInTheDocument();
    expect(brandLabel).not.toHaveClass('uppercase');
    expect(screen.getByText('Search')).toBeInTheDocument();
    expect(screen.getByLabelText('Command')).toBeInTheDocument();
    expect(screen.getByText('K')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Custom View' })).not.toBeInTheDocument();
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
        <BanjiShell>
          <Routes>
            <Route element={<div>Overview screen</div>} path="/" />
            <Route element={<div>Settings screen</div>} path="/settings/*" />
          </Routes>
        </BanjiShell>
      </MemoryRouter>,
    );

    expect(screen.getByRole('link', { name: 'Catalog' })).toHaveAttribute('href', '/catalog?q=scarf&view=skus');
    expect(screen.getByRole('link', { name: 'Insights' })).toHaveAttribute('href', '/insights');
    expect(screen.getByRole('link', { name: 'Settings' })).toHaveAttribute('href', '/settings/interface');
  });

  test('renders settings navigation in the rail and returns to the app overview', async () => {
    setViewport({ width: 1440, isMobile: false });

    render(
      <MemoryRouter initialEntries={['/settings/interface']}>
        <BanjiShell>
          <Routes>
            <Route element={<div>Overview screen</div>} path="/" />
            <Route element={<div>Settings screen</div>} path="/settings/*" />
          </Routes>
        </BanjiShell>
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
    expect(within(brandToggle).queryByText('banji')).not.toBeInTheDocument();
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

  test('keeps archived catalog in the app rail', () => {
    setViewport({ width: 1440, isMobile: false });

    render(
      <MemoryRouter initialEntries={['/catalog?status=archived']}>
        <BanjiShell>
          <Routes>
            <Route element={<div>Overview screen</div>} path="/" />
            <Route element={<div>Archive screen</div>} path="/catalog" />
            <Route element={<div>Settings screen</div>} path="/settings/*" />
          </Routes>
        </BanjiShell>
      </MemoryRouter>,
    );

    expect(screen.getByText('Archive screen')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Back to app' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Catalog' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Work' })).toBeInTheDocument();
    const brandToggle = screen.getByTestId('sidebar-collapse-toggle');
    expect(within(brandToggle).getByText('banji')).toBeInTheDocument();
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
          appBrand: 'banji',
          navOverview: 'Inbox',
          navHome: 'Home',
          navInbox: 'Inbox',
          navRecordUpdate: 'Capture',
          navCapture: 'Capture',
          navPerformance: 'Performance',
          navInsights: 'Insights',
          navFinancials: 'Financials',
          navAnalysis: 'Explain',
          navCatalog: 'Catalog',
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
        <BanjiShell>
          <Routes>
            <Route element={<div>Overview screen</div>} path="/" />
            <Route element={<div>Settings screen</div>} path="/settings" />
          </Routes>
        </BanjiShell>
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
        <BanjiShell>
          <Routes>
            <Route element={<div>Overview screen</div>} path="/" />
          </Routes>
        </BanjiShell>
      </MemoryRouter>,
    );

    expect(screen.getByRole('link', { name: 'Home' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Work' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Catalog' })).not.toBeInTheDocument();
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
        <BanjiShell>
          <Routes>
            <Route element={<div>Overview screen</div>} path="/" />
          </Routes>
        </BanjiShell>
      </MemoryRouter>,
    );

    expect(screen.getByRole('link', { name: 'Catalog' })).toBeInTheDocument();
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
        <BanjiShell>
          <Routes>
            <Route element={<div>Settings screen</div>} path="/settings/*" />
          </Routes>
        </BanjiShell>
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
          appBrand: 'banji',
          navOverview: 'Inbox',
          navHome: 'Home',
          navInbox: 'Inbox',
          navRecordUpdate: 'Capture',
          navCapture: 'Capture',
          navPerformance: 'Performance',
          navInsights: 'Insights',
          navFinancials: 'Financials',
          navAutomations: 'Automations',
          navAnalysis: 'Explain',
          navCatalog: 'Catalog',
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
        <BanjiShell>
          <Routes>
            <Route element={<div>Overview screen</div>} path="/" />
          </Routes>
        </BanjiShell>
      </MemoryRouter>,
    );

    expect(screen.queryByRole('link', { name: 'Automations' })).not.toBeInTheDocument();
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
        <BanjiShell>
          <Routes>
            <Route element={<div>Overview screen</div>} path="/" />
          </Routes>
        </BanjiShell>
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
        <BanjiShell>
          <Routes>
            <Route element={<div>Overview screen</div>} path="/" />
          </Routes>
        </BanjiShell>
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
          appBrand: 'banji',
          navOverview: 'Inbox',
          navHome: 'Home',
          navInbox: 'Inbox',
          navRecordUpdate: 'Capture',
          navCapture: 'Capture',
          navPerformance: 'Performance',
          navInsights: 'Insights',
          navFinancials: 'Financials',
          navAnalysis: 'Explain',
          navCatalog: 'Catalog',
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
        <BanjiShell>
          <Routes>
            <Route element={<div>Insights screen</div>} path="/insights" />
          </Routes>
        </BanjiShell>
      </MemoryRouter>,
    );

    expect(screen.getAllByText('New!').length).toBeGreaterThan(0);

    await waitFor(() => {
      expect(markUnlockedNavItemSeen).toHaveBeenCalledWith('insights');
    });
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
          appBrand: 'banji',
          navOverview: 'Inbox',
          navHome: 'Home',
          navInbox: 'Inbox',
          navRecordUpdate: 'Capture',
          navCapture: 'Capture',
          navPerformance: 'Performance',
          navInsights: 'Insights',
          navFinancials: 'Financials',
          navAnalysis: 'Explain',
          navCatalog: 'Catalog',
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
        <BanjiShell>
          <Routes>
            <Route element={<div>Overview screen</div>} path="/" />
            <Route element={<div>Settings screen</div>} path="/settings" />
          </Routes>
        </BanjiShell>
      </MemoryRouter>,
    );

    expect(screen.getByRole('link', { name: 'Insights' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Explain' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Financials' })).not.toBeInTheDocument();
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
          appBrand: 'បញ្ជី',
          navOverview: 'ទិដ្ឋភាពទូទៅ',
          navRecordUpdate: 'កត់ត្រាការអាប់ដេត',
          navPerformance: 'សុខភាពអាជីវកម្ម',
          navFinancials: 'ហិរញ្ញវត្ថុ',
          navAnalysis: 'Explain',
          navCatalog: 'កាតាឡុក',
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
        <BanjiShell>
          <Routes>
            <Route element={<div>Overview screen</div>} path="/" />
          </Routes>
        </BanjiShell>
      </MemoryRouter>,
    );

    expect(screen.getByText('ស្វែងរក')).toBeInTheDocument();
  });

  test('hides the sidebar search hint when the desktop rail is collapsed', async () => {
    setViewport({ width: 1440, isMobile: false });

    render(
      <MemoryRouter initialEntries={['/']}>
        <BanjiShell>
          <Routes>
            <Route element={<div>Overview screen</div>} path="/" />
          </Routes>
        </BanjiShell>
      </MemoryRouter>,
    );

    expect(screen.getByText('Search')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('sidebar-collapse-toggle'));

    await waitFor(() => {
      expect(screen.queryByText('Search')).not.toBeInTheDocument();
      expect(screen.queryByText('K')).not.toBeInTheDocument();
    });
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
        <BanjiShell>
          <Routes>
            <Route element={<div>Catalog screen</div>} path="/catalog" />
          </Routes>
        </BanjiShell>
      </MemoryRouter>,
    );

    expect(screen.getByTestId('workspace-computing-screen')).toBeInTheDocument();
    expect(screen.queryByText('Catalog screen')).not.toBeInTheDocument();
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
        <BanjiShell>
          <Routes>
            <Route element={<div>Overview screen</div>} path="/" />
          </Routes>
        </BanjiShell>
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
        <BanjiShell>
          <Routes>
            <Route element={<div>Overview screen</div>} path="/" />
          </Routes>
        </BanjiShell>
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
        <BanjiShell>
          <Routes>
            <Route element={<div>Catalog screen</div>} path="/catalog" />
          </Routes>
        </BanjiShell>
      </MemoryRouter>,
    );

    expect(screen.getByText('Catalog screen')).toBeInTheDocument();
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
        <BanjiShell>
          <Routes>
            <Route element={<div>Catalog screen</div>} path="/catalog" />
          </Routes>
        </BanjiShell>
      </MemoryRouter>,
    );

    expect(screen.getByText('Catalog screen')).toBeInTheDocument();
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
        <BanjiShell>
          <Routes>
            <Route element={<div>Record update screen</div>} path="/capture" />
          </Routes>
        </BanjiShell>
      </MemoryRouter>,
    );

    expect(screen.getByText('Record update screen')).toBeInTheDocument();
    expect(screen.queryByTestId('workspace-computing-screen')).not.toBeInTheDocument();
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
