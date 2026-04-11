import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { Link, MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_SENA_ENGINE_PARAMETERS } from '@shared/ipc';
import { SettingsRoute } from './settings';
import { PreferencesProvider } from '@/state/preferences';

if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => {};
}

function firstSavePreferencesButton() {
  return screen.getAllByRole('button').find((button) =>
    ['Save preferences', 'រក្សាទុកចំណូលចិត្ត'].includes(button.textContent?.trim() ?? ''),
  ) as HTMLButtonElement;
}

function renderSettingsRoute(initialEntry = '/settings/workspace') {
  render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <PreferencesProvider>
        <Routes>
          <Route element={<SettingsRoute />} path="/settings/*" />
        </Routes>
      </PreferencesProvider>
    </MemoryRouter>,
  );
}

describe('SettingsRoute', () => {
  const getPreferences = vi.fn();
  const savePreferences = vi.fn();
  const getLocalDataInfo = vi.fn();
  const createBackupSnapshot = vi.fn();
  const restoreBackupSnapshot = vi.fn();
  const clearCurrentData = vi.fn();
  const revealPath = vi.fn();
  const triggerRun = vi.fn();
  const reloadLocation = vi.fn();

  beforeEach(() => {
    getPreferences.mockReset();
    savePreferences.mockReset();
    getLocalDataInfo.mockReset();
    createBackupSnapshot.mockReset();
    restoreBackupSnapshot.mockReset();
    clearCurrentData.mockReset();
    revealPath.mockReset();
    triggerRun.mockReset();
    reloadLocation.mockReset();
    getPreferences.mockResolvedValue({
      language: 'en',
      currency: 'USD',
      usdToKhrExchangeRate: 4000,
      displayViewMode: 'custom',
      showExplanatoryTooltips: true,
      showFloatingTitleActions: true,
      showRightRailCards: true,
      showOverviewTaskTabs: true,
      showAnalysisPage: true,
      showPerformanceCompareToggle: true,
      showPerformanceTimelineCard: true,
      showLogsViewToggle: true,
      showHeartbeatRibbons: true,
      customShowExplanatoryTooltips: true,
      customShowFloatingTitleActions: true,
      customShowRightRailCards: true,
      customShowOverviewTaskTabs: true,
      customShowAnalysisPage: true,
      customShowPerformanceCompareToggle: true,
      customShowPerformanceTimelineCard: true,
      customShowLogsViewToggle: true,
      customShowHeartbeatRibbons: true,
      senaEngineParameters: DEFAULT_SENA_ENGINE_PARAMETERS,
    });
    savePreferences.mockResolvedValue({
      language: 'en',
      currency: 'USD',
      usdToKhrExchangeRate: 4000,
      displayViewMode: 'custom',
      showExplanatoryTooltips: false,
      showFloatingTitleActions: false,
      showRightRailCards: false,
      showOverviewTaskTabs: false,
      showAnalysisPage: false,
      showPerformanceCompareToggle: false,
      showPerformanceTimelineCard: false,
      showLogsViewToggle: false,
      showHeartbeatRibbons: false,
      customShowExplanatoryTooltips: false,
      customShowFloatingTitleActions: false,
      customShowRightRailCards: false,
      customShowOverviewTaskTabs: false,
      customShowAnalysisPage: false,
      customShowPerformanceCompareToggle: false,
      customShowPerformanceTimelineCard: false,
      customShowLogsViewToggle: false,
      customShowHeartbeatRibbons: false,
      senaEngineParameters: DEFAULT_SENA_ENGINE_PARAMETERS,
    });
    triggerRun.mockResolvedValue({ runId: 'run-parameters' });
    getLocalDataInfo.mockResolvedValue({
      dataDirectoryPath: '/tmp/banji',
      workspaceStorePath: '/tmp/banji/workspace.sqlite',
      preferencesPath: '/tmp/banji/desktop-preferences.json',
      backupDirectoryPath: '/tmp/banji/backup-snapshots',
      storageFormat: 'sqlite',
    });
    createBackupSnapshot.mockResolvedValue({
      createdAt: '2026-04-10T10:00:00.000Z',
      fileCount: 3,
      snapshotPath: '/tmp/banji/backup-snapshots/manual-snapshot',
      trigger: 'manual',
    });
    restoreBackupSnapshot.mockResolvedValue({
      restoredSnapshotPath: '/tmp/banji/backup-snapshots/manual-snapshot',
      safetySnapshot: {
        createdAt: '2026-04-10T10:05:00.000Z',
        fileCount: 3,
        snapshotPath: '/tmp/banji/backup-snapshots/before-restore',
        trigger: 'manual',
      },
    });
    clearCurrentData.mockResolvedValue({
      safetySnapshot: {
        createdAt: '2026-04-10T10:10:00.000Z',
        fileCount: 3,
        snapshotPath: '/tmp/banji/backup-snapshots/before-clear',
        trigger: 'manual',
      },
    });
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: {
        ...window.location,
        reload: reloadLocation,
      },
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
        createBackupSnapshot,
        restoreBackupSnapshot,
        clearCurrentData,
        revealPath,
      },
    };
  });

  it('renders and saves the optional help preference', async () => {
    renderSettingsRoute('/settings/interface');

    expect(await screen.findAllByText('Interface')).not.toHaveLength(0);
    expect(
      screen.queryByText('These switches control how much guidance and side context the desktop shows.'),
    ).not.toBeInTheDocument();
    expect(screen.getAllByRole('radio', { name: /compact view/i })[0]).toBeInTheDocument();
    expect(screen.getAllByRole('radio', { name: /custom view/i })[0]).toBeInTheDocument();

    const checkbox = await screen.findByRole('checkbox', { name: /show extra guidance/i });
    expect(checkbox).toBeChecked();

    fireEvent.click(checkbox);
    fireEvent.click(firstSavePreferencesButton());

    await waitFor(() => {
      expect(savePreferences).toHaveBeenCalledWith(expect.objectContaining({
        language: 'en',
        currency: 'USD',
        usdToKhrExchangeRate: 4000,
        showExplanatoryTooltips: false,
        showFloatingTitleActions: true,
        showRightRailCards: true,
        showOverviewTaskTabs: true,
        senaEngineParameters: DEFAULT_SENA_ENGINE_PARAMETERS,
      }));
    });
  });

  it('renders and saves language and currency through the shared select controls', async () => {
    savePreferences.mockImplementation(async (payload) => ({
      language: payload.language ?? 'en',
      currency: payload.currency ?? 'USD',
      usdToKhrExchangeRate: payload.usdToKhrExchangeRate ?? 4000,
      displayViewMode: payload.displayViewMode ?? 'custom',
      showExplanatoryTooltips: true,
      showFloatingTitleActions: true,
      showRightRailCards: true,
      showOverviewTaskTabs: true,
      showAnalysisPage: true,
      showPerformanceCompareToggle: true,
      showPerformanceTimelineCard: true,
      showLogsViewToggle: true,
      showHeartbeatRibbons: true,
      customShowExplanatoryTooltips: true,
      customShowFloatingTitleActions: true,
      customShowRightRailCards: true,
      customShowOverviewTaskTabs: true,
      customShowAnalysisPage: true,
      customShowPerformanceCompareToggle: true,
      customShowPerformanceTimelineCard: true,
      customShowLogsViewToggle: true,
      customShowHeartbeatRibbons: true,
      senaEngineParameters: DEFAULT_SENA_ENGINE_PARAMETERS,
    }));

    renderSettingsRoute();

    const [languageSelect, currencySelect] = await screen.findAllByRole('combobox');
    expect(languageSelect).toHaveTextContent('abc');
    expect(languageSelect).toHaveTextContent('English');
    fireEvent.click(languageSelect);
    fireEvent.click(screen.getByRole('option', { name: 'កខគKhmer' }));

    expect(currencySelect).toHaveTextContent('USD');
    fireEvent.click(currencySelect);
    fireEvent.click(screen.getByRole('option', { name: 'KHR' }));

    fireEvent.click(firstSavePreferencesButton());

    await waitFor(() => {
      expect(savePreferences).toHaveBeenCalledWith(expect.objectContaining({
        language: 'km',
        currency: 'KHR',
        usdToKhrExchangeRate: 4000,
        showExplanatoryTooltips: true,
        showFloatingTitleActions: true,
        showRightRailCards: true,
        showOverviewTaskTabs: true,
        senaEngineParameters: DEFAULT_SENA_ENGINE_PARAMETERS,
      }));
    });
  });

  it('renders and validates the KHR exchange rate preference', async () => {
    savePreferences.mockImplementation(async (payload) => ({
      language: 'en',
      currency: payload.currency ?? 'USD',
      usdToKhrExchangeRate: payload.usdToKhrExchangeRate ?? 4000,
      displayViewMode: payload.displayViewMode ?? 'custom',
      showExplanatoryTooltips: true,
      showFloatingTitleActions: true,
      showRightRailCards: true,
      showOverviewTaskTabs: true,
      showAnalysisPage: true,
      showPerformanceCompareToggle: true,
      showPerformanceTimelineCard: true,
      showLogsViewToggle: true,
      showHeartbeatRibbons: true,
      customShowExplanatoryTooltips: true,
      customShowFloatingTitleActions: true,
      customShowRightRailCards: true,
      customShowOverviewTaskTabs: true,
      customShowAnalysisPage: true,
      customShowPerformanceCompareToggle: true,
      customShowPerformanceTimelineCard: true,
      customShowLogsViewToggle: true,
      customShowHeartbeatRibbons: true,
      senaEngineParameters: DEFAULT_SENA_ENGINE_PARAMETERS,
    }));
    renderSettingsRoute();

    const exchangeRateInput = await screen.findByLabelText(/exchange rate for 1 usd in khr/i);
    expect(exchangeRateInput).toHaveDisplayValue('4000');

    fireEvent.change(exchangeRateInput, { target: { value: '4100' } });
    fireEvent.click(firstSavePreferencesButton());

    await waitFor(() => {
      expect(savePreferences).toHaveBeenCalledWith(expect.objectContaining({
        usdToKhrExchangeRate: 4100,
      }));
    });

    fireEvent.change(exchangeRateInput, { target: { value: '0' } });
    expect(await screen.findByText('Exchange rate must be greater than 0.')).toBeInTheDocument();
    expect(firstSavePreferencesButton()).toBeDisabled();
  });

  it('renders and saves the right rail visibility preference', async () => {
    renderSettingsRoute('/settings/interface');

    const checkbox = await screen.findByRole('checkbox', { name: /show right rail cards/i });
    expect(checkbox).toBeChecked();

    fireEvent.click(checkbox);
    fireEvent.click(firstSavePreferencesButton());

    await waitFor(() => {
      expect(savePreferences).toHaveBeenCalledWith(expect.objectContaining({
        language: 'en',
        currency: 'USD',
        usdToKhrExchangeRate: 4000,
        showExplanatoryTooltips: true,
        showFloatingTitleActions: true,
        showRightRailCards: false,
        showOverviewTaskTabs: true,
        senaEngineParameters: DEFAULT_SENA_ENGINE_PARAMETERS,
      }));
    });
  });

  it('renders and saves the overview task tabs preference', async () => {
    renderSettingsRoute('/settings/interface');

    const checkbox = await screen.findByRole('checkbox', { name: /show overview task tabs/i });
    expect(checkbox).toBeChecked();

    fireEvent.click(checkbox);
    fireEvent.click(firstSavePreferencesButton());

    await waitFor(() => {
      expect(savePreferences).toHaveBeenCalledWith(expect.objectContaining({
        showExplanatoryTooltips: true,
        showFloatingTitleActions: true,
        showRightRailCards: true,
        showOverviewTaskTabs: false,
      }));
    });
  });

  it('renders and saves the analysis page visibility preference', async () => {
    renderSettingsRoute('/settings/interface');

    const checkbox = await screen.findByRole('checkbox', { name: /show analysis page/i });
    expect(checkbox).toBeChecked();

    fireEvent.click(checkbox);
    fireEvent.click(firstSavePreferencesButton());

    await waitFor(() => {
      expect(savePreferences).toHaveBeenCalledWith(expect.objectContaining({
        showAnalysisPage: false,
      }));
    });
  });

  it('renders and saves the performance compare toggle preference', async () => {
    renderSettingsRoute('/settings/interface');

    const checkbox = await screen.findByRole('checkbox', { name: /show performance compare toggle/i });
    expect(checkbox).toBeChecked();

    fireEvent.click(checkbox);
    fireEvent.click(firstSavePreferencesButton());

    await waitFor(() => {
      expect(savePreferences).toHaveBeenCalledWith(expect.objectContaining({
        showPerformanceCompareToggle: false,
      }));
    });
  });

  it('renders and saves the business timeline card preference', async () => {
    renderSettingsRoute('/settings/interface');

    const checkbox = await screen.findByRole('checkbox', { name: /show business timeline card/i });
    expect(checkbox).toBeChecked();

    fireEvent.click(checkbox);
    fireEvent.click(firstSavePreferencesButton());

    await waitFor(() => {
      expect(savePreferences).toHaveBeenCalledWith(expect.objectContaining({
        showPerformanceTimelineCard: false,
      }));
    });
  });

  it('renders and saves the logs view button preference', async () => {
    renderSettingsRoute('/settings/interface');

    const checkbox = await screen.findByRole('checkbox', { name: /show logs view button/i });
    expect(checkbox).toBeChecked();

    fireEvent.click(checkbox);
    fireEvent.click(firstSavePreferencesButton());

    await waitFor(() => {
      expect(savePreferences).toHaveBeenCalledWith(expect.objectContaining({
        showLogsViewToggle: false,
      }));
    });
  });

  it('renders and saves the heartbeat and ribbons preference', async () => {
    renderSettingsRoute('/settings/interface');

    const checkbox = await screen.findByRole('checkbox', { name: /show heartbeats and ribbons/i });
    expect(checkbox).toBeChecked();

    fireEvent.click(checkbox);
    fireEvent.click(firstSavePreferencesButton());

    await waitFor(() => {
      expect(savePreferences).toHaveBeenCalledWith(expect.objectContaining({
        showHeartbeatRibbons: false,
      }));
    });
  });

  it('switches between compact and custom view modes from interface visibility', async () => {
    renderSettingsRoute('/settings/interface');

    const compactButton = (await screen.findAllByRole('radio', { name: 'Compact View' }))[0] as HTMLButtonElement;
    const customButton = screen.getAllByRole('radio', { name: 'Custom View' })[0] as HTMLButtonElement;
    const extraGuidanceCheckbox = screen.getByRole('checkbox', { name: /show extra guidance/i });

    expect(extraGuidanceCheckbox).not.toBeDisabled();

    fireEvent.click(compactButton);

    await waitFor(() => {
      expect(savePreferences).toHaveBeenCalledWith(expect.objectContaining({
        displayViewMode: 'compact',
        showExplanatoryTooltips: false,
        showFloatingTitleActions: false,
        showRightRailCards: false,
        showOverviewTaskTabs: false,
        showAnalysisPage: false,
        showPerformanceCompareToggle: false,
        showPerformanceTimelineCard: false,
        showLogsViewToggle: false,
        showHeartbeatRibbons: false,
        customShowExplanatoryTooltips: true,
        customShowFloatingTitleActions: true,
        customShowRightRailCards: true,
        customShowOverviewTaskTabs: true,
        customShowAnalysisPage: true,
        customShowPerformanceCompareToggle: true,
        customShowPerformanceTimelineCard: true,
        customShowLogsViewToggle: true,
        customShowHeartbeatRibbons: true,
      }));
    });
    expect(customButton).toBeInTheDocument();
  });

  it('restores remembered custom visibility preferences when switching back from compact', async () => {
    getPreferences.mockResolvedValue({
      language: 'en',
      currency: 'USD',
      usdToKhrExchangeRate: 4000,
      displayViewMode: 'compact',
      showExplanatoryTooltips: false,
      showFloatingTitleActions: false,
      showRightRailCards: false,
      showOverviewTaskTabs: false,
      showAnalysisPage: false,
      showPerformanceCompareToggle: false,
      showPerformanceTimelineCard: false,
      showLogsViewToggle: false,
      customShowExplanatoryTooltips: true,
      customShowFloatingTitleActions: false,
      customShowRightRailCards: true,
      customShowOverviewTaskTabs: false,
      customShowAnalysisPage: true,
      customShowPerformanceCompareToggle: true,
      customShowPerformanceTimelineCard: false,
      customShowLogsViewToggle: true,
      customShowHeartbeatRibbons: false,
      senaEngineParameters: DEFAULT_SENA_ENGINE_PARAMETERS,
    });
    savePreferences.mockImplementation(async (payload) => ({
      language: 'en',
      currency: 'USD',
      usdToKhrExchangeRate: 4000,
      displayViewMode: payload.displayViewMode ?? 'custom',
      showExplanatoryTooltips: payload.showExplanatoryTooltips ?? false,
      showFloatingTitleActions: payload.showFloatingTitleActions ?? false,
      showRightRailCards: payload.showRightRailCards ?? false,
      showOverviewTaskTabs: payload.showOverviewTaskTabs ?? false,
      showAnalysisPage: payload.showAnalysisPage ?? false,
      showPerformanceCompareToggle: payload.showPerformanceCompareToggle ?? false,
      showPerformanceTimelineCard: payload.showPerformanceTimelineCard ?? false,
      showLogsViewToggle: payload.showLogsViewToggle ?? false,
      showHeartbeatRibbons: payload.showHeartbeatRibbons ?? false,
      customShowExplanatoryTooltips: payload.customShowExplanatoryTooltips ?? true,
      customShowFloatingTitleActions: payload.customShowFloatingTitleActions ?? false,
      customShowRightRailCards: payload.customShowRightRailCards ?? true,
      customShowOverviewTaskTabs: payload.customShowOverviewTaskTabs ?? false,
      customShowAnalysisPage: payload.customShowAnalysisPage ?? true,
      customShowPerformanceCompareToggle: payload.customShowPerformanceCompareToggle ?? true,
      customShowPerformanceTimelineCard: payload.customShowPerformanceTimelineCard ?? false,
      customShowLogsViewToggle: payload.customShowLogsViewToggle ?? true,
      customShowHeartbeatRibbons: payload.customShowHeartbeatRibbons ?? false,
      senaEngineParameters: DEFAULT_SENA_ENGINE_PARAMETERS,
    }));

    renderSettingsRoute('/settings/interface');

    const customButton = (await screen.findAllByRole('radio', { name: 'Custom View' }))[0] as HTMLButtonElement;
    const extraGuidanceCheckbox = screen.getByRole('checkbox', { name: /show extra guidance/i });

    expect(extraGuidanceCheckbox).toBeDisabled();

    fireEvent.click(customButton);

    await waitFor(() => {
      expect(savePreferences).toHaveBeenCalledWith(expect.objectContaining({
        displayViewMode: 'custom',
        showExplanatoryTooltips: true,
        showFloatingTitleActions: false,
        showRightRailCards: true,
        showOverviewTaskTabs: false,
        showAnalysisPage: true,
        showPerformanceCompareToggle: true,
        showPerformanceTimelineCard: false,
        showLogsViewToggle: true,
        showHeartbeatRibbons: false,
        customShowExplanatoryTooltips: true,
        customShowFloatingTitleActions: false,
        customShowRightRailCards: true,
        customShowOverviewTaskTabs: false,
        customShowAnalysisPage: true,
        customShowPerformanceCompareToggle: true,
        customShowPerformanceTimelineCard: false,
        customShowLogsViewToggle: true,
        customShowHeartbeatRibbons: false,
      }));
    });
  });

  it('renders planning settings and reruns planning changes on save', async () => {
    savePreferences.mockImplementation(async (payload) => ({
      language: 'en',
      currency: 'USD',
      usdToKhrExchangeRate: payload.usdToKhrExchangeRate ?? 4000,
      displayViewMode: payload.displayViewMode ?? 'custom',
      showExplanatoryTooltips: true,
      showFloatingTitleActions: true,
      showRightRailCards: true,
      showOverviewTaskTabs: true,
      customShowExplanatoryTooltips: true,
      customShowFloatingTitleActions: true,
      customShowRightRailCards: true,
      customShowOverviewTaskTabs: true,
      senaEngineParameters: payload.senaEngineParameters,
    }));
    renderSettingsRoute('/settings/planning');

    expect(await screen.findAllByText('Advanced')).not.toHaveLength(0);
    expect(screen.queryByLabelText(/analysis profile/i)).not.toBeInTheDocument();
    const resetDefaultsButton = screen.getAllByRole('button', { name: /reset to defaults/i })[0];
    const savePreferencesButton = firstSavePreferencesButton();
    const planningButtons = screen.getAllByRole('button');
    expect(planningButtons.indexOf(resetDefaultsButton)).toBeLessThan(planningButtons.indexOf(savePreferencesButton));
    expect(resetDefaultsButton).toBeDisabled();
    const particleInput = screen.getByLabelText(/evidence detail level/i);
    expect(particleInput).toHaveDisplayValue('256');

    fireEvent.change(particleInput, { target: { value: '384' } });
    expect(particleInput).toHaveDisplayValue('384');
    expect(resetDefaultsButton).not.toBeDisabled();
    fireEvent.click(savePreferencesButton);

    await waitFor(() => {
      expect(savePreferences).toHaveBeenCalledWith(expect.objectContaining({
        language: 'en',
        currency: 'USD',
        usdToKhrExchangeRate: 4000,
        showExplanatoryTooltips: true,
        showFloatingTitleActions: true,
        showRightRailCards: true,
        showOverviewTaskTabs: true,
        senaEngineParameters: {
          ...DEFAULT_SENA_ENGINE_PARAMETERS,
          particleCount: 384,
        },
      }));
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

    expect(screen.queryByRole('link', { name: 'Local data' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Credits' })).not.toBeInTheDocument();
  });

  it('reveals each local workspace path from the inline links', async () => {
    renderSettingsRoute('/settings/local-data');

    fireEvent.click(await screen.findByRole('button', { name: /^\/tmp\/banji$/i }));
    fireEvent.click(screen.getByRole('button', { name: /^\/tmp\/banji\/workspace\.sqlite$/i }));
    fireEvent.click(screen.getByRole('button', { name: /^\/tmp\/banji\/desktop-preferences\.json$/i }));
    fireEvent.click(screen.getByRole('button', { name: /^\/tmp\/banji\/backup-snapshots$/i }));

    expect(revealPath).toHaveBeenNthCalledWith(1, '/tmp/banji');
    expect(revealPath).toHaveBeenNthCalledWith(2, '/tmp/banji/workspace.sqlite');
    expect(revealPath).toHaveBeenNthCalledWith(3, '/tmp/banji/desktop-preferences.json');
    expect(revealPath).toHaveBeenNthCalledWith(4, '/tmp/banji/backup-snapshots');
  });

  it('creates a manual backup snapshot from local workspace data settings', async () => {
    renderSettingsRoute('/settings/local-data');

    fireEvent.click(await screen.findByRole('button', { name: /create backup snapshot/i }));

    await waitFor(() => {
      expect(createBackupSnapshot).toHaveBeenCalledTimes(1);
    });
    expect(
      await screen.findByText(
        'Created a local backup snapshot at /tmp/banji/backup-snapshots/manual-snapshot.',
      ),
    ).toBeInTheDocument();
  });

  it('restores a saved snapshot from local workspace data settings', async () => {
    renderSettingsRoute('/settings/local-data');

    fireEvent.click(await screen.findByRole('button', { name: /restore saved snapshot/i }));

    await waitFor(() => {
      expect(restoreBackupSnapshot).toHaveBeenCalledTimes(1);
    });
    expect(reloadLocation).toHaveBeenCalledTimes(1);
  });

  it('renders credits as static text without a disclosure toggle', async () => {
    renderSettingsRoute('/settings/credits');

    expect(await screen.findByText('Made with')).toBeInTheDocument();
    expect(screen.getByText('by Monysovann Ly.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /credits/i })).not.toBeInTheDocument();
  });

  it('redirects to overview after clearing current data', async () => {
    render(
      <MemoryRouter initialEntries={['/settings/danger-zone']}>
        <PreferencesProvider>
          <Routes>
            <Route element={<SettingsRoute />} path="/settings/*" />
            <Route element={<div>Overview destination</div>} path="/" />
          </Routes>
        </PreferencesProvider>
      </MemoryRouter>,
    );

    fireEvent.click(await screen.findByRole('button', { name: /delete current/i }));
    fireEvent.change(
      screen.getByLabelText(/deletion confirmation token/i),
      { target: { value: 'DELETE CURRENT DATA' } },
    );
    fireEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: /delete current data/i }),
    );

    await waitFor(() => {
      expect(clearCurrentData).toHaveBeenCalledTimes(1);
    });
    await waitFor(() => {
      expect(screen.getByText('Overview destination')).toBeInTheDocument();
    });
    expect(reloadLocation).toHaveBeenCalledTimes(1);
  });

  it('keeps SENA number fields directly editable while typing partial numeric values', async () => {
    savePreferences.mockImplementation(async (payload) => ({
      language: 'en',
      currency: 'USD',
      usdToKhrExchangeRate: payload.usdToKhrExchangeRate ?? 4000,
      showExplanatoryTooltips: true,
      showFloatingTitleActions: true,
      showRightRailCards: true,
      senaEngineParameters: payload.senaEngineParameters,
    }));
    renderSettingsRoute('/settings/planning');

    const recommendationQuantileInput = await screen.findByLabelText(/order suggestion level/i);
    expect(recommendationQuantileInput).toHaveDisplayValue('0.7');

    fireEvent.change(recommendationQuantileInput, { target: { value: '0.' } });
    expect(recommendationQuantileInput).toHaveDisplayValue('0.');

    fireEvent.change(recommendationQuantileInput, { target: { value: '0.85' } });
    expect(recommendationQuantileInput).toHaveDisplayValue('0.85');

    fireEvent.click(firstSavePreferencesButton());

    await waitFor(() => {
      expect(savePreferences).toHaveBeenCalledWith(expect.objectContaining({
        language: 'en',
        currency: 'USD',
        usdToKhrExchangeRate: 4000,
        showExplanatoryTooltips: true,
        showFloatingTitleActions: true,
        showRightRailCards: true,
        senaEngineParameters: {
          ...DEFAULT_SENA_ENGINE_PARAMETERS,
          recommendationQuantile: 0.85,
        },
      }));
    });
  });

  it('shows a valid range error and blocks save for out-of-bounds SENA values', async () => {
    renderSettingsRoute('/settings/planning');

    const particleInput = await screen.findByLabelText(/evidence detail level/i);
    fireEvent.change(particleInput, { target: { value: '5000' } });

    expect(particleInput).toHaveDisplayValue('5000');
    expect(await screen.findByText('Valid range: 32 to 2048.')).toBeInTheDocument();
    expect(firstSavePreferencesButton()).toBeDisabled();

    fireEvent.click(firstSavePreferencesButton());
    expect(savePreferences).not.toHaveBeenCalled();

    fireEvent.change(particleInput, { target: { value: '32' } });

    await waitFor(() => {
      expect(screen.queryByText('Valid range: 32 to 2048.')).not.toBeInTheDocument();
    });
    expect(firstSavePreferencesButton()).not.toBeDisabled();
  });

  it('blocks saving when range low quantile is higher than range high quantile', async () => {
    renderSettingsRoute('/settings/planning');

    const rangeLowInput = await screen.findByLabelText(/suggested range start/i);
    const rangeHighInput = screen.getByLabelText(/suggested range end/i);
    const recommendationInput = screen.getByLabelText(/order suggestion level/i);

    fireEvent.change(rangeLowInput, { target: { value: '0.95' } });
    fireEvent.change(rangeHighInput, { target: { value: '0.9' } });

    expect(await screen.findByText('Suggested range start cannot be above the range end.')).toBeInTheDocument();
    expect(screen.getByText('Suggested range end cannot be below the range start.')).toBeInTheDocument();
    expect(firstSavePreferencesButton()).toBeDisabled();

    fireEvent.click(firstSavePreferencesButton());
    expect(savePreferences).not.toHaveBeenCalled();

    fireEvent.change(rangeHighInput, { target: { value: '0.97' } });
    fireEvent.change(recommendationInput, { target: { value: '0.96' } });

    await waitFor(() => {
      expect(screen.queryByText('Suggested range start cannot be above the range end.')).not.toBeInTheDocument();
    });
    expect(firstSavePreferencesButton()).not.toBeDisabled();
  });

  it('blocks saving when recommendation quantile falls outside the low-high band', async () => {
    renderSettingsRoute('/settings/planning');

    const recommendationInput = await screen.findByLabelText(/order suggestion level/i);
    const rangeLowInput = screen.getByLabelText(/suggested range start/i);
    const rangeHighInput = screen.getByLabelText(/suggested range end/i);

    fireEvent.change(rangeLowInput, { target: { value: '0.8' } });
    fireEvent.change(rangeHighInput, { target: { value: '0.9' } });
    fireEvent.change(recommendationInput, { target: { value: '0.7' } });

    expect(
      await screen.findByText(
        'Order suggestion level must stay between the range start and range end.',
      ),
    ).toBeInTheDocument();
    expect(firstSavePreferencesButton()).toBeDisabled();

    fireEvent.change(recommendationInput, { target: { value: '0.85' } });

    await waitFor(() => {
      expect(
        screen.queryByText(
          'Order suggestion level must stay between the range start and range end.',
        ),
      ).not.toBeInTheDocument();
    });
    expect(firstSavePreferencesButton()).not.toBeDisabled();
  });

  it('asks before leaving with unsaved preference changes', async () => {
    render(
      <MemoryRouter initialEntries={['/settings/interface']}>
        <PreferencesProvider>
          <Link to="/catalog">Catalog</Link>
          <Routes>
            <Route element={<SettingsRoute />} path="/settings/*" />
            <Route element={<div>Catalog destination</div>} path="/catalog" />
          </Routes>
        </PreferencesProvider>
      </MemoryRouter>,
    );

    const checkbox = await screen.findByRole('checkbox', { name: /show extra guidance/i });
    fireEvent.click(checkbox);
    fireEvent.click(screen.getByRole('link', { name: 'Catalog' }));

    expect(screen.getByRole('dialog')).toHaveTextContent('Discard changes?');
    fireEvent.click(screen.getByRole('button', { name: 'Keep editing' }));
    expect(screen.queryByText('Catalog destination')).not.toBeInTheDocument();
    expect(checkbox).not.toBeChecked();

    fireEvent.click(screen.getByRole('link', { name: 'Catalog' }));
    fireEvent.click(screen.getByRole('button', { name: 'Discard changes' }));

    await waitFor(() => {
      expect(screen.getByText('Catalog destination')).toBeInTheDocument();
    });
  });
});
