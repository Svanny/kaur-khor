import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { CommandPaletteProvider } from './command-palette';

const inventoryHook = vi.fn();
const preferencesHook = vi.fn();

vi.mock('@/state/inventory', () => ({
  useInventory: () => inventoryHook(),
}));

vi.mock('@/state/preferences', () => ({
  usePreferences: () => preferencesHook(),
}));

describe('CommandPaletteProvider', () => {
  beforeEach(() => {
    Object.defineProperty(window.navigator, 'platform', {
      configurable: true,
      value: 'Win32',
    });

    inventoryHook.mockReturnValue({
      catalog: null,
      diagnostics: null,
      error: null,
      isLoading: false,
      isSaving: false,
      latestRun: null,
      observations: [],
      reload: vi.fn(),
      reports: [],
      senaMeta: { catalogHash: null, lastBootstrapSkuId: null, lastCompletedRunId: null },
      snapshot: null,
      workspaceSummary: null,
    });
    preferencesHook.mockReturnValue({
      language: 'en',
      t: (key: string) =>
        ({
          navAnalysis: 'Analysis',
          navCatalog: 'Catalog',
          navOperations: 'Logs',
          navOverview: 'Overview',
          navPerformance: 'Performance',
          navRecordUpdate: 'Record update',
          navSettings: 'Settings',
        }[key] ?? key),
    });
  });

  test('opens from the global shortcut and navigates on selection', async () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <CommandPaletteProvider>
          <Routes>
            <Route element={<div>Overview screen</div>} path="/" />
            <Route element={<div>Catalog screen</div>} path="/catalog" />
          </Routes>
        </CommandPaletteProvider>
      </MemoryRouter>,
    );

    fireEvent.keyDown(window, { ctrlKey: true, key: 'k' });

    expect(screen.getByRole('searchbox', { name: 'Search commands' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('option', { name: /^CatalogPage/ }));

    await waitFor(() => {
      expect(screen.getByText('Catalog screen')).toBeInTheDocument();
    });
    expect(screen.queryByRole('searchbox', { name: 'Search commands' })).not.toBeInTheDocument();
  });

  test('opens even when a text input is focused', () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <CommandPaletteProvider>
          <Routes>
            <Route
              element={<input aria-label="Plain input" />}
              path="/"
            />
          </Routes>
        </CommandPaletteProvider>
      </MemoryRouter>,
    );

    const input = screen.getByRole('textbox', { name: 'Plain input' });
    input.focus();
    fireEvent.keyDown(window, { ctrlKey: true, key: 'k' });

    expect(screen.getByRole('searchbox', { name: 'Search commands' })).toBeInTheDocument();
  });
});
