import { fireEvent, render, screen, waitFor } from '@testing-library/react';
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
    Object.defineProperty(window, 'innerWidth', {
      configurable: true,
      writable: true,
      value: 375,
    });
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      writable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: query.includes('max-width'),
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    });

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
      expect(screen.queryByText('New Service')).not.toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Open navigation' }));
    expect(screen.getByText('New Service')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('link', { name: 'Inventory' }));

    await waitFor(() => {
      expect(screen.getByText('Inventory screen')).toBeInTheDocument();
      expect(screen.queryByText('New Service')).not.toBeInTheDocument();
    });
  });
});
