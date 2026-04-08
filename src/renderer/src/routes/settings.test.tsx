import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_SENA_ENGINE_PARAMETERS } from '@shared/ipc';
import { SettingsRoute } from './settings';
import { PreferencesProvider } from '@/state/preferences';

function firstSavePreferencesButton() {
  return screen.getAllByRole('button', { name: /save preferences/i })[0];
}

describe('SettingsRoute', () => {
  const getPreferences = vi.fn();
  const savePreferences = vi.fn();
  const getLocalDataInfo = vi.fn();
  const triggerRun = vi.fn();

  beforeEach(() => {
    getPreferences.mockReset();
    savePreferences.mockReset();
    getLocalDataInfo.mockReset();
    triggerRun.mockReset();
    getPreferences.mockResolvedValue({
      language: 'en',
      currency: 'USD',
      showExplanatoryTooltips: true,
      showFloatingTitleActions: true,
      showRightRailCards: true,
      senaEngineParameters: DEFAULT_SENA_ENGINE_PARAMETERS,
    });
    savePreferences.mockResolvedValue({
      language: 'en',
      currency: 'USD',
      showExplanatoryTooltips: false,
      showFloatingTitleActions: false,
      showRightRailCards: false,
      senaEngineParameters: DEFAULT_SENA_ENGINE_PARAMETERS,
    });
    triggerRun.mockResolvedValue({ runId: 'run-parameters' });
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
      sena: {
        ...(window.banjiDesktop?.sena ?? {}),
        triggerRun,
      },
      system: {
        ...(window.banjiDesktop?.system ?? {}),
        getLocalDataInfo,
        openLocalDataFolder: vi.fn(),
      },
    };
  });

  it('renders and saves the optional help preference', async () => {
    render(
      <MemoryRouter>
        <PreferencesProvider>
          <SettingsRoute />
        </PreferencesProvider>
      </MemoryRouter>,
    );

    expect(await screen.findByText('Settings')).toBeInTheDocument();
    expect(screen.getByText('Desktop preferences')).toBeInTheDocument();

    const checkbox = await screen.findByRole('checkbox', { name: /show optional help/i });
    expect(checkbox).toBeChecked();

    fireEvent.click(checkbox);
    fireEvent.click(firstSavePreferencesButton());

    await waitFor(() => {
      expect(savePreferences).toHaveBeenCalledWith({
        language: 'en',
        currency: 'USD',
        showExplanatoryTooltips: false,
        showFloatingTitleActions: true,
        showRightRailCards: true,
        senaEngineParameters: DEFAULT_SENA_ENGINE_PARAMETERS,
      });
    });
  });

  it('renders and saves the right rail visibility preference', async () => {
    render(
      <MemoryRouter>
        <PreferencesProvider>
          <SettingsRoute />
        </PreferencesProvider>
      </MemoryRouter>,
    );

    const checkbox = await screen.findByRole('checkbox', { name: /show right rail cards/i });
    expect(checkbox).toBeChecked();

    fireEvent.click(checkbox);
    fireEvent.click(firstSavePreferencesButton());

    await waitFor(() => {
      expect(savePreferences).toHaveBeenCalledWith({
        language: 'en',
        currency: 'USD',
        showExplanatoryTooltips: true,
        showFloatingTitleActions: true,
        showRightRailCards: false,
        senaEngineParameters: DEFAULT_SENA_ENGINE_PARAMETERS,
      });
    });
  });

  it('places editable SENA engine parameters before local workspace storage and reruns on save', async () => {
    savePreferences.mockImplementation(async (payload) => ({
      language: 'en',
      currency: 'USD',
      showExplanatoryTooltips: true,
      showFloatingTitleActions: true,
      showRightRailCards: true,
      senaEngineParameters: payload.senaEngineParameters,
    }));
    render(
      <MemoryRouter>
        <PreferencesProvider>
          <SettingsRoute />
        </PreferencesProvider>
      </MemoryRouter>,
    );

    expect(await screen.findByText('Preferences controls')).toBeInTheDocument();
    expect(screen.getByText('SENA engine parameters')).toBeInTheDocument();
    expect(screen.getByText('Local workspace storage')).toBeInTheDocument();
    expect(screen.getByText('Credits')).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: /export logs: csv/i })).toHaveTextContent(
      'Export Logs: CSV',
    );
    expect(screen.getByRole('combobox', { name: /export logs format/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /export sena data: csv/i })).toHaveTextContent(
      'Export SENA data: CSV',
    );
    expect(screen.getByRole('combobox', { name: /export sena data format/i })).toBeInTheDocument();
    expect(screen.queryByLabelText(/analysis profile/i)).not.toBeInTheDocument();
    const particleInput = screen.getByLabelText(/particle count/i);
    expect(particleInput).toHaveValue(256);

    fireEvent.change(particleInput, { target: { value: '384' } });
    fireEvent.click(firstSavePreferencesButton());

    await waitFor(() => {
      expect(savePreferences).toHaveBeenCalledWith({
        language: 'en',
        currency: 'USD',
        showExplanatoryTooltips: true,
        showFloatingTitleActions: true,
        showRightRailCards: true,
        senaEngineParameters: {
          ...DEFAULT_SENA_ENGINE_PARAMETERS,
          particleCount: 384,
        },
      });
    });
    await waitFor(() => {
      expect(triggerRun).toHaveBeenCalledWith({
        algorithmVersion: 'sena-analysis-v3',
        parameters: {
          ...DEFAULT_SENA_ENGINE_PARAMETERS,
          particleCount: 384,
        },
      });
    });

    const pageText = document.body.textContent ?? '';
    expect(pageText.indexOf('Preferences controls')).toBeLessThan(
      pageText.indexOf('SENA engine parameters'),
    );
    expect(pageText.indexOf('SENA engine parameters')).toBeLessThan(
      pageText.indexOf('Local workspace storage'),
    );

    fireEvent.click(screen.getByRole('button', { name: /expand credits/i }));
    expect(screen.getByText('Made with')).toBeInTheDocument();
    expect(screen.getByText('by Monysovann Ly.')).toBeInTheDocument();
  });
});
