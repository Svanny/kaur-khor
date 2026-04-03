import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SettingsRoute } from './settings';
import { PreferencesProvider } from '@/state/preferences';

describe('SettingsRoute', () => {
  const getPreferences = vi.fn();
  const savePreferences = vi.fn();
  const getLocalDataInfo = vi.fn();

  beforeEach(() => {
    getPreferences.mockReset();
    savePreferences.mockReset();
    getLocalDataInfo.mockReset();
    getPreferences.mockResolvedValue({
      language: 'en',
      currency: 'USD',
      showExplanatoryTooltips: true,
    });
    savePreferences.mockResolvedValue({
      language: 'en',
      currency: 'USD',
      showExplanatoryTooltips: false,
    });
    getLocalDataInfo.mockResolvedValue({
      dataDirectoryPath: '/tmp/banji',
      workspaceStorePath: '/tmp/banji/workspace.sqlite',
      preferencesPath: '/tmp/banji/desktop-preferences.json',
      storageFormat: 'sqlite',
    });

    window.banjiDesktop = {
      ...(window.banjiDesktop ?? {}),
      preferences: {
        get: getPreferences,
        save: savePreferences,
      },
      system: {
        ...(window.banjiDesktop?.system ?? {}),
        getLocalDataInfo,
        openLocalDataFolder: vi.fn(),
      },
    };
  });

  it('renders and saves the explanatory tooltip preference', async () => {
    render(
      <MemoryRouter>
        <PreferencesProvider>
          <SettingsRoute />
        </PreferencesProvider>
      </MemoryRouter>,
    );

    const checkbox = await screen.findByRole('checkbox', { name: /show explanatory tooltips/i });
    expect(checkbox).toBeChecked();

    fireEvent.click(checkbox);
    fireEvent.click(screen.getByRole('button', { name: /save preferences/i }));

    await waitFor(() => {
      expect(savePreferences).toHaveBeenCalledWith({
        language: 'en',
        currency: 'USD',
        showExplanatoryTooltips: false,
      });
    });
  });
});
