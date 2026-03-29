import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { BanjiShell } from './banji-shell';

const inventoryHook = vi.fn();
const preferencesHook = vi.fn();

vi.mock('@/state/inventory', () => ({
  useInventory: () => inventoryHook(),
}));

vi.mock('@/state/preferences', () => ({
  usePreferences: () => preferencesHook(),
}));

describe('BanjiShell', () => {
  beforeEach(() => {
    setViewport({ width: 375, isMobile: true });

    const reload = vi.fn();
    inventoryHook.mockReturnValue({
      error: null,
      isLoading: false,
      reload,
    });
    preferencesHook.mockReturnValue({
      t: (key: string) => {
        const translations: Record<string, string> = {
          appBrand: 'Banji',
          appTitle: 'Banji Desktop',
          navOverview: 'Overview',
          navCatalog: 'Catalog',
          navOperations: 'Operations',
          navSist: 'SIST',
          navSettings: 'Settings',
          shellGroupWorkflows: 'Workflows',
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
        <BanjiShell>
          <Routes>
            <Route element={<div>Dashboard screen</div>} path="/" />
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
    expect(screen.getByRole('link', { name: 'Settings' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('link', { name: 'Catalog' }));

    await waitFor(() => {
      expect(screen.getByText('Catalog screen')).toBeInTheDocument();
      expect(screen.queryByRole('link', { name: 'Settings' })).not.toBeInTheDocument();
    });
  });

  test('renders the simplified shell chrome without local runtime cards or ready pills', () => {
    render(
      <MemoryRouter initialEntries={['/settings']}>
        <BanjiShell>
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

  test('renders the sidebar brand as plain logo and text', () => {
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

    const brandToggle = screen.getByTestId('sidebar-collapse-toggle');
    expect(within(brandToggle).getByText('Banji')).toBeInTheDocument();
    expect(within(brandToggle).queryByText('Settings')).not.toBeInTheDocument();
    expect(brandToggle).toHaveAttribute('aria-label', 'Collapse navigation');
    expect(screen.getByRole('link', { name: 'Settings' })).toBeInTheDocument();
  });

  test('anchors settings as a separate bottom sidebar destination', () => {
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

    const primaryLinks = ['Overview', 'Catalog', 'Operations', 'SIST'];
    for (const label of primaryLinks) {
      expect(screen.getByRole('link', { name: label })).toBeInTheDocument();
    }

    const workspaceGroup = screen
      .getByRole('link', { name: 'Overview' })
      .closest('[data-sidebar="group"]');
    const settingsLink = screen.getByRole('link', { name: 'Settings' });
    const settingsGroup = settingsLink.closest('[data-sidebar="group"]');

    expect(workspaceGroup).not.toBeNull();
    expect(settingsGroup).not.toBeNull();
    expect(settingsGroup).not.toBe(workspaceGroup);
    expect(within(workspaceGroup as HTMLElement).queryByRole('link', { name: 'Settings' })).not.toBeInTheDocument();
  });

  test('highlights canonical sections for descendant routes', () => {
    setViewport({ width: 1440, isMobile: false });

    render(
      <MemoryRouter initialEntries={['/catalog/skus/sku-1']}>
        <BanjiShell>
          <Routes>
            <Route element={<div>Catalog detail screen</div>} path="/catalog/skus/:skuId" />
          </Routes>
        </BanjiShell>
      </MemoryRouter>,
    );

    expectActiveSidebarLink('Catalog');
    expectInactiveSidebarLink('Overview');
    expectInactiveSidebarLink('Operations');
    expectInactiveSidebarLink('SIST');
  });

  test('highlights operations for the guided session route', () => {
    setViewport({ width: 1440, isMobile: false });

    render(
      <MemoryRouter initialEntries={['/operations/session?step=review']}>
        <BanjiShell>
          <Routes>
            <Route element={<div>Operations session screen</div>} path="/operations/session" />
          </Routes>
        </BanjiShell>
      </MemoryRouter>,
    );

    expectActiveSidebarLink('Operations');
    expectInactiveSidebarLink('Overview');
    expectInactiveSidebarLink('Catalog');
    expectInactiveSidebarLink('SIST');
  });

  test('expands the shell content to full width when the desktop sidebar collapses', () => {
    setViewport({ width: 1440, isMobile: false });

    render(
      <MemoryRouter initialEntries={['/']}>
        <BanjiShell>
          <Routes>
            <Route element={<div>Dashboard screen</div>} path="/" />
          </Routes>
        </BanjiShell>
      </MemoryRouter>,
    );

    const mainFrame = screen.getByTestId('shell-main-frame');
    const collapseToggle = screen.getByTestId('sidebar-collapse-toggle');
    expect(mainFrame.className).toContain('max-w-[1500px]');
    expect(screen.getByText('Settings')).toBeInTheDocument();
    expect(collapseToggle).toHaveAttribute('aria-label', 'Collapse navigation');

    fireEvent.click(collapseToggle);

    expect(mainFrame.className).toContain('max-w-none');
    expect(mainFrame.className).not.toContain('max-w-[1500px]');
    expect(screen.getByTestId('sidebar-collapse-toggle')).toHaveAttribute(
      'aria-label',
      'Open navigation',
    );
    expect(screen.queryByText('Settings')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Settings' })).toBeInTheDocument();
  });

  test('offers a retry action when inventory loading fails', () => {
    const reload = vi.fn();
    inventoryHook.mockReturnValue({
      error: 'Core failed to start',
      isLoading: false,
      reload,
    });

    render(
      <MemoryRouter initialEntries={['/']}>
        <BanjiShell>
          <Routes>
            <Route element={<div>Dashboard screen</div>} path="/" />
          </Routes>
        </BanjiShell>
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));

    expect(reload).toHaveBeenCalledTimes(1);
  });
});

function expectActiveSidebarLink(label: string) {
  const link = screen.getByRole('link', { name: label });
  expect(link.closest('[data-sidebar="menu-button"]')).toHaveAttribute('data-active', 'true');
}

function expectInactiveSidebarLink(label: string) {
  const link = screen.getByRole('link', { name: label });
  expect(link.closest('[data-sidebar="menu-button"]')).toHaveAttribute('data-active', 'false');
}

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
