import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import type { DesktopAppContext } from '@shared/ipc';
import { BanjiShell } from './banji-shell';

const inventoryHook = vi.fn();
const preferencesHook = vi.fn();

vi.mock('@/state/inventory', () => ({
  useInventory: () => inventoryHook(),
}));

vi.mock('@/state/preferences', () => ({
  usePreferences: () => preferencesHook(),
}));

const desktopContext: DesktopAppContext = {
  apiBaseUrl: 'http://127.0.0.1:8787',
  backendError: null,
  backendStatus: 'ready',
};

describe('BanjiShell', () => {
  beforeEach(() => {
    setViewport({ width: 375, isMobile: true });

    inventoryHook.mockReturnValue({
      error: null,
      isLoading: false,
    });
    preferencesHook.mockReturnValue({
      t: (key: string) => {
        const translations: Record<string, string> = {
          appBrand: 'Banji',
          appTitle: 'Banji Desktop',
          navDashboard: 'Dashboard',
          navInventory: 'Inventory',
          navStock: 'Stock',
          navRanking: 'Ranking',
          navSettings: 'Settings',
          dashboardEyebrow: 'Local-first operations',
          settingsDisclaimer: 'Your data stays on this device.',
          backendReady: 'Local API ready',
          backendError: 'Local API failed',
          apiUnavailable: 'Local API unavailable',
          backendStarting: 'Starting local Rust API…',
          createSkuAction: 'New SKU',
          createServiceAction: 'New Service',
          openNavigation: 'Open navigation',
          collapseNavigation: 'Collapse navigation',
          dashboardBody: 'Desktop inventory overview',
          stockUpdateBody: 'Adjust counts or cost for one or many SKUs.',
          rankingBody: 'Rank services and sellable SKUs.',
          inventoryBody: 'Inventory workspace',
          settingsStorage: 'Inventory data is stored locally.',
          retry: 'Retry',
          skipToContent: 'Skip to content',
        };
        return translations[key] ?? key;
      },
    });
  });

  test('closes the mobile sidebar after following a navigation link', async () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <BanjiShell desktopContext={desktopContext}>
          <Routes>
            <Route element={<div>Dashboard screen</div>} path="/" />
            <Route element={<div>Inventory screen</div>} path="/inventory" />
            <Route element={<div>Settings screen</div>} path="/settings" />
          </Routes>
        </BanjiShell>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.queryByRole('link', { name: 'Settings' })).not.toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Open navigation' }));
    expect(screen.getByRole('link', { name: 'Settings' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('link', { name: 'Inventory' }));

    await waitFor(() => {
      expect(screen.getByText('Inventory screen')).toBeInTheDocument();
      expect(screen.queryByRole('link', { name: 'Settings' })).not.toBeInTheDocument();
    });
  });

  test('renders the simplified shell chrome without local runtime cards or ready pills', () => {
    render(
      <MemoryRouter initialEntries={['/settings']}>
        <BanjiShell desktopContext={desktopContext}>
          <Routes>
            <Route element={<div>Settings screen</div>} path="/settings" />
          </Routes>
        </BanjiShell>
      </MemoryRouter>,
    );

    expect(screen.getByRole('button', { name: 'Open navigation' })).toBeInTheDocument();
    expect(screen.queryByText('Banji Desktop')).not.toBeInTheDocument();
    expect(screen.queryByText('Local API ready')).not.toBeInTheDocument();
    expect(screen.queryByText('Runtime status')).not.toBeInTheDocument();
    expect(screen.queryByText('Desktop operations cockpit')).not.toBeInTheDocument();
  });

  test('keeps only the Banji logo text inside the sidebar brand pill', () => {
    setViewport({ width: 1440, isMobile: false });

    render(
      <MemoryRouter initialEntries={['/settings']}>
        <BanjiShell desktopContext={desktopContext}>
          <Routes>
            <Route element={<div>Settings screen</div>} path="/settings" />
          </Routes>
        </BanjiShell>
      </MemoryRouter>,
    );

    const brandToggle = screen.getByTestId('sidebar-brand-toggle');
    expect(within(brandToggle).getByText('Banji')).toBeInTheDocument();
    expect(within(brandToggle).queryByText('Settings')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Settings' })).toBeInTheDocument();
  });

  test('expands the shell content to full width when the desktop sidebar collapses', () => {
    setViewport({ width: 1440, isMobile: false });

    render(
      <MemoryRouter initialEntries={['/']}>
        <BanjiShell desktopContext={desktopContext}>
          <Routes>
            <Route element={<div>Dashboard screen</div>} path="/" />
          </Routes>
        </BanjiShell>
      </MemoryRouter>,
    );

    const mainFrame = screen.getByTestId('shell-main-frame');
    const brandToggle = screen.getByTestId('sidebar-brand-toggle');
    expect(mainFrame.className).toContain('max-w-[1500px]');
    expect(screen.getByText('Settings')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Collapse navigation' }));

    expect(mainFrame.className).toContain('max-w-none');
    expect(mainFrame.className).not.toContain('max-w-[1500px]');
    expect(brandToggle.className).toContain('group-data-[collapsible=icon]:size-10');
    expect(screen.queryByText('Settings')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Settings' })).toBeInTheDocument();
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
