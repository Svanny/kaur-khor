import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { BanjiShell } from './banji-shell';

const inventoryHook = vi.fn();
const preferencesHook = vi.fn();
const applyDisplayViewMode = vi.fn();

vi.mock('@/state/inventory', () => ({
  useInventory: () => inventoryHook(),
}));

vi.mock('@/state/preferences', () => ({
  usePreferences: () => preferencesHook(),
}));

describe('BanjiShell', () => {
  beforeEach(() => {
    setViewport({ width: 375, isMobile: true });

    inventoryHook.mockReturnValue({
      error: null,
      isLoading: false,
      reload: vi.fn(),
    });
    preferencesHook.mockReturnValue({
      applyDisplayViewMode,
      displayViewMode: 'maximal',
      showExplanatoryTooltips: true,
      showFloatingTitleActions: true,
      showRightRailCards: true,
      t: (key: string) => {
        const translations: Record<string, string> = {
          appBrand: 'Banji',
          navOverview: 'Overview',
          navRecordUpdate: 'Record update',
          navPerformance: 'Performance',
          navAnalysis: 'Analysis',
          navCatalog: 'Catalog',
          navOperations: 'Logs',
          sidebarSectionMain: 'Main',
          sidebarSectionOther: 'Other',
          navSettings: 'Settings',
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
        };
        return translations[key] ?? key;
      },
    });
    applyDisplayViewMode.mockReset();
  });

  test('closes the mobile sidebar after following a navigation link', async () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <BanjiShell>
          <Routes>
            <Route element={<div>Overview screen</div>} path="/" />
            <Route element={<div>Catalog screen</div>} path="/catalog" />
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

    render(
      <MemoryRouter initialEntries={['/settings']}>
        <BanjiShell>
          <Routes>
            <Route element={<div>Settings screen</div>} path="/settings" />
          </Routes>
        </BanjiShell>
      </MemoryRouter>,
    );

    expect(screen.getByRole('link', { name: 'Overview' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Record update' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Performance' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Catalog' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Analysis' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Logs' })).toBeInTheDocument();
    expect(screen.getByText('Main')).toBeInTheDocument();
    expect(screen.getByText('Other')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'SIST' })).not.toBeInTheDocument();
    const navLinks = screen.getAllByRole('link').map((link) => link.getAttribute('aria-label'));
    expect(navLinks.indexOf('Overview')).toBeLessThan(navLinks.indexOf('Record update'));
    expect(navLinks.indexOf('Record update')).toBeLessThan(navLinks.indexOf('Performance'));
    expect(navLinks.indexOf('Catalog')).toBeLessThan(navLinks.indexOf('Analysis'));
    expect(navLinks.indexOf('Analysis')).toBeLessThan(navLinks.indexOf('Logs'));

    const brandToggle = screen.getByTestId('sidebar-collapse-toggle');
    expect(within(brandToggle).getByText('Banji')).toBeInTheDocument();
    const viewModeToggle = screen.getByRole('button', { name: 'Maximal View' });
    expect(viewModeToggle).toBeInTheDocument();
    expect(viewModeToggle.closest('li')).not.toBeNull();
  });

  test('toggles the sidebar view mode pill between maximal and minimal presets', () => {
    setViewport({ width: 1440, isMobile: false });
    preferencesHook.mockReturnValue({
      applyDisplayViewMode,
      displayViewMode: 'maximal',
      showExplanatoryTooltips: true,
      showFloatingTitleActions: true,
      showRightRailCards: true,
      t: (key: string) =>
        ({
          appBrand: 'Banji',
          navOverview: 'Overview',
          navRecordUpdate: 'Record update',
          navPerformance: 'Performance',
          navAnalysis: 'Analysis',
          navCatalog: 'Catalog',
          navOperations: 'Logs',
          sidebarSectionMain: 'Main',
          sidebarSectionOther: 'Other',
          navSettings: 'Settings',
          skipToContent: 'Skip to content',
          openNavigation: 'Open navigation',
          collapseNavigation: 'Collapse navigation',
        }[key] ?? key),
    });

    render(
      <MemoryRouter initialEntries={['/settings']}>
        <BanjiShell>
          <Routes>
            <Route element={<div>Settings screen</div>} path="/settings" />
          </Routes>
        </BanjiShell>
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByTestId('sidebar-view-mode-toggle'));
    expect(applyDisplayViewMode).toHaveBeenCalledWith('minimal');
  });

  test('offers a retry action when workspace loading fails', () => {
    const reload = vi.fn();
    inventoryHook.mockReturnValue({
      error: 'Workspace failed to load',
      isLoading: false,
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
    expect(screen.getByText('Computing hint')).toBeInTheDocument();
    expect(screen.queryByText('Overview screen')).not.toBeInTheDocument();
  });

  test('renders catalog route content while inventory is still loading', () => {
    inventoryHook.mockReturnValue({
      error: null,
      isLoading: true,
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

    expect(screen.getByText('Catalog screen')).toBeInTheDocument();
    expect(screen.queryByTestId('workspace-computing-screen')).not.toBeInTheDocument();
  });

  test('keeps the full-screen computing state when a SENA run is active', () => {
    inventoryHook.mockReturnValue({
      error: null,
      isLoading: true,
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

    expect(screen.getByTestId('workspace-computing-screen')).toBeInTheDocument();
    expect(screen.queryByText('Catalog screen')).not.toBeInTheDocument();
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
