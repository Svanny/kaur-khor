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

function benchmarkRunWithTargets(targets: Array<{
  metricName: string;
  label: string;
  value: number | null;
  status: 'pass' | 'watch' | 'fail' | 'missing';
  nonNegotiable: number;
  acceptable: number;
  source: string;
  rationale: string;
}>) {
  return {
    runId: 'gui-run',
    scenarios: ['startup'] as const,
    status: 'failed' as const,
    startedAt: '2026-04-18T16:31:38.000Z',
    completedAt: '2026-04-18T16:32:10.000Z',
    fixtureSize: 'medium' as const,
    traceEnabled: false,
    repeatCount: 1,
    buildBeforeRun: true,
    outputDirectory: '/tmp/banji/bench-results/gui-run',
    exitCode: 1,
    summaries: [
      {
        scenario: 'startup',
        runId: 'gui-run',
        generatedAt: '2026-04-18T16:32:10.000Z',
        metrics: {},
        slowestIpc: [],
        slowestCore: [],
        targets: targets.map((target) => ({
          ...target,
          unit: 'ms' as const,
        })),
      },
    ],
    stdoutTail: [],
    stderrTail: [],
    error: null,
  };
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
  const benchmarkAvailability = vi.fn();
  const benchmarkListRuns = vi.fn();
  const benchmarkReadRun = vi.fn();
  const benchmarkStartRun = vi.fn();
  const benchmarkCancelRun = vi.fn();
  const benchmarkCompareRuns = vi.fn();
  const benchmarkRevealRun = vi.fn();
  const benchmarkOnRunEvent = vi.fn();
  const reloadLocation = vi.fn();

  beforeEach(() => {
    vi.unstubAllEnvs();
    getPreferences.mockReset();
    savePreferences.mockReset();
    getLocalDataInfo.mockReset();
    createBackupSnapshot.mockReset();
    restoreBackupSnapshot.mockReset();
    clearCurrentData.mockReset();
    revealPath.mockReset();
    triggerRun.mockReset();
    benchmarkAvailability.mockReset();
    benchmarkListRuns.mockReset();
    benchmarkReadRun.mockReset();
    benchmarkStartRun.mockReset();
    benchmarkCancelRun.mockReset();
    benchmarkCompareRuns.mockReset();
    benchmarkRevealRun.mockReset();
    benchmarkOnRunEvent.mockReset();
    reloadLocation.mockReset();
    getPreferences.mockResolvedValue({
      language: 'en',
      currency: 'USD',
      usdToKhrExchangeRate: 4000,
      displayViewMode: 'custom',
      itemImageMode: 'small',
      dimChartsWhileLoading: false,
      showExplanatoryTooltips: true,
      showFloatingTitleActions: true,
      showRightRailCards: true,
      showOverviewTaskTabs: true,
      showAnalysisPage: true,
      showPerformanceCompareToggle: true,
      showPerformanceTimelineCard: true,
      showLogsViewToggle: true,
      showHeartbeatRibbons: true,
      taskBatchUpdatePreferences: {
        logOrder: 'ask',
        updateEta: 'ask',
        followUp: 'ask',
        receive: 'ask',
        review: 'ask',
      },
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
      overviewStaleUpdateReminderSnoozeUntil: null,
      onboardingCompletedAt: '2026-04-10T00:00:00.000Z',
      seenUnlockedNavItems: {
        catalog: true,
        operations: true,
        performance: true,
        financials: true,
      },
    });
    savePreferences.mockResolvedValue({
      language: 'en',
      currency: 'USD',
      usdToKhrExchangeRate: 4000,
      displayViewMode: 'custom',
      itemImageMode: 'small',
      dimChartsWhileLoading: false,
      showExplanatoryTooltips: false,
      showFloatingTitleActions: false,
      showRightRailCards: false,
      showOverviewTaskTabs: false,
      showAnalysisPage: false,
      showPerformanceCompareToggle: false,
      showPerformanceTimelineCard: false,
      showLogsViewToggle: false,
      showHeartbeatRibbons: false,
      taskBatchUpdatePreferences: {
        logOrder: 'ask',
        updateEta: 'ask',
        followUp: 'ask',
        receive: 'ask',
        review: 'ask',
      },
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
      overviewStaleUpdateReminderSnoozeUntil: null,
      onboardingCompletedAt: '2026-04-10T00:00:00.000Z',
      seenUnlockedNavItems: {
        catalog: true,
        operations: true,
        performance: true,
        financials: true,
      },
    });
    triggerRun.mockResolvedValue({ runId: 'run-parameters' });
    getLocalDataInfo.mockResolvedValue({
      dataDirectoryPath: '/tmp/banji',
      workspaceStorePath: '/tmp/banji/workspace.sqlite',
      preferencesPath: '/tmp/banji/desktop-preferences.json',
      backupDirectoryPath: '/tmp/banji/backup-snapshots',
      assetDirectoryPath: '/tmp/banji/assets',
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
    benchmarkAvailability.mockResolvedValue({
      available: true,
      reason: null,
      projectRoot: '/tmp/banji',
      resultsDirectory: '/tmp/banji/bench-results',
      activeRunId: null,
    });
    benchmarkListRuns.mockResolvedValue([]);
    benchmarkReadRun.mockResolvedValue(null);
    benchmarkStartRun.mockResolvedValue({
      runId: 'gui-run',
      scenarios: ['startup'],
      status: 'queued',
      startedAt: '2026-04-18T16:31:38.000Z',
      completedAt: null,
      fixtureSize: 'medium',
      traceEnabled: false,
      repeatCount: 1,
      buildBeforeRun: true,
      outputDirectory: '/tmp/banji/bench-results/gui-run',
      exitCode: null,
      summaries: [],
      stdoutTail: [],
      stderrTail: [],
      error: null,
    });
    benchmarkCancelRun.mockImplementation(async (runId: string) => ({
      runId,
      scenarios: ['startup'],
      status: 'cancelled',
      startedAt: '2026-04-18T16:31:38.000Z',
      completedAt: '2026-04-18T16:32:00.000Z',
      fixtureSize: 'medium',
      traceEnabled: false,
      repeatCount: 1,
      buildBeforeRun: true,
      outputDirectory: `/tmp/banji/bench-results/${runId}`,
      exitCode: null,
      summaries: [],
      stdoutTail: [],
      stderrTail: [],
      error: null,
    }));
    benchmarkCompareRuns.mockResolvedValue({
      baselineRunId: 'baseline',
      candidateRunId: 'candidate',
      metrics: [],
    });
    benchmarkRevealRun.mockResolvedValue(undefined);
    benchmarkOnRunEvent.mockReturnValue(() => {});
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
      benchmarkRunner: {
        getAvailability: benchmarkAvailability,
        listRuns: benchmarkListRuns,
        readRun: benchmarkReadRun,
        startRun: benchmarkStartRun,
        cancelRun: benchmarkCancelRun,
        compareRuns: benchmarkCompareRuns,
        revealRun: benchmarkRevealRun,
        onRunEvent: benchmarkOnRunEvent,
      },
    };
  });

  it('renders and saves the optional help preference', async () => {
    renderSettingsRoute('/settings/interface');

    expect(await screen.findAllByText('Interface')).not.toHaveLength(0);
    expect(
      screen.getByText('These switches control how much guidance and side context the desktop shows.'),
    ).toBeInTheDocument();
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

  it('keeps the onboarding injector hidden by default', async () => {
    renderSettingsRoute('/settings/workspace');

    await screen.findByText('Regional preferences');
    expect(screen.queryByRole('button', { name: 'Inject onboarding stage' })).not.toBeInTheDocument();
  });

  it('shows the onboarding injector when the dev flag is enabled', async () => {
    vi.stubEnv('VITE_BANJI_SHOW_DEV_ONBOARDING_INJECTOR', '1');

    renderSettingsRoute('/settings/workspace');

    const button = await screen.findByRole('button', { name: 'Inject onboarding stage' });
    fireEvent.click(button);

    await waitFor(() => {
      expect(savePreferences).toHaveBeenCalledWith(expect.objectContaining({
        onboardingCompletedAt: null,
        seenUnlockedNavItems: {
          catalog: false,
          operations: false,
          performance: false,
          financials: false,
        },
      }));
    });
  });

  it('filters benchmark targets by result status from the checklist menu', async () => {
    benchmarkListRuns.mockResolvedValue([
      benchmarkRunWithTargets([
        {
          metricName: 'startup.app_to_workspace_ready_ms',
          label: 'App to usable workspace',
          value: 2200,
          status: 'pass',
          nonNegotiable: 2500,
          acceptable: 5000,
          source: 'Windows startup, Android startup, Core Web Vitals LCP',
          rationale: 'Startup ends when the workspace can be used, not when the first frame appears.',
        },
        {
          metricName: 'startup.warm_workspace_ready_ms',
          label: 'Warm workspace ready',
          value: 2201,
          status: 'fail',
          nonNegotiable: 1500,
          acceptable: 2000,
          source: 'Android startup vitals',
          rationale: 'Warm launches should not feel like cold boots.',
        },
      ]),
    ]);

    renderSettingsRoute('/settings/benchmarks');

    expect(await screen.findByText('Target status')).toBeInTheDocument();
    expect(screen.getByText('App to usable workspace')).toBeInTheDocument();
    expect(screen.getByText('Warm workspace ready')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Filter result states' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Pass' }));

    await waitFor(() => {
      expect(screen.queryByText('App to usable workspace')).not.toBeInTheDocument();
    });
    expect(screen.getByText('Warm workspace ready')).toBeInTheDocument();
  });

  it('filters duplicate metric rows when result states change', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    benchmarkListRuns.mockResolvedValue([
      {
        ...benchmarkRunWithTargets([]),
        summaries: [
          {
            scenario: 'startup',
            runId: 'gui-run',
            generatedAt: '2026-04-18T16:32:10.000Z',
            metrics: {},
            slowestIpc: [],
            slowestCore: [],
            targets: [
              {
                metricName: 'ipc.system_get_app_context_ms',
                label: 'Get app context IPC',
                value: 0,
                unit: 'ms',
                status: 'pass',
                nonNegotiable: 100,
                acceptable: 200,
                source: 'RAIL response',
                rationale: 'Startup-critical IPC must not block the first usable state.',
              },
            ],
          },
          {
            scenario: 'navigation',
            runId: 'gui-run',
            generatedAt: '2026-04-18T16:32:11.000Z',
            metrics: {},
            slowestIpc: [],
            slowestCore: [],
            targets: [
              {
                metricName: 'ipc.system_get_app_context_ms',
                label: 'Get app context IPC',
                value: 0,
                unit: 'ms',
                status: 'pass',
                nonNegotiable: 100,
                acceptable: 200,
                source: 'RAIL response',
                rationale: 'Startup-critical IPC must not block the first usable state.',
              },
              {
                metricName: 'ipc.system_get_app_context_ms',
                label: 'Get app context IPC',
                value: 0,
                unit: 'ms',
                status: 'watch',
                nonNegotiable: 100,
                acceptable: 200,
                source: 'RAIL response',
                rationale: 'Startup-critical IPC must not block the first usable state.',
              },
            ],
          },
        ],
      },
    ]);

    renderSettingsRoute('/settings/benchmarks');

    expect(await screen.findByText('Target status')).toBeInTheDocument();
    expect(screen.getAllByText('Get app context IPC')).toHaveLength(3);

    fireEvent.click(screen.getByRole('button', { name: 'Filter result states' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Pass' }));

    await waitFor(() => {
      expect(screen.getAllByText('Get app context IPC')).toHaveLength(1);
    });
    expect(consoleError).not.toHaveBeenCalledWith(
      expect.stringContaining('Encountered two children with the same key'),
    );
    consoleError.mockRestore();
  });

  it('sorts the result column alphabetically by state only', async () => {
    benchmarkListRuns.mockResolvedValue([
      benchmarkRunWithTargets([
        {
          metricName: 'target.watch',
          label: 'Watch target',
          value: 1,
          status: 'watch',
          nonNegotiable: 100,
          acceptable: 200,
          source: 'RAIL response',
          rationale: 'Watch rationale.',
        },
        {
          metricName: 'target.pass',
          label: 'Pass target',
          value: 1,
          status: 'pass',
          nonNegotiable: 100,
          acceptable: 200,
          source: 'RAIL response',
          rationale: 'Pass rationale.',
        },
        {
          metricName: 'target.missing',
          label: 'Missing target',
          value: null,
          status: 'missing',
          nonNegotiable: 100,
          acceptable: 200,
          source: 'RAIL response',
          rationale: 'Missing rationale.',
        },
        {
          metricName: 'target.fail',
          label: 'Fail target',
          value: 1,
          status: 'fail',
          nonNegotiable: 100,
          acceptable: 200,
          source: 'RAIL response',
          rationale: 'Fail rationale.',
        },
      ]),
    ]);

    renderSettingsRoute('/settings/benchmarks');

    expect(await screen.findByText('Target status')).toBeInTheDocument();

    const targetRows = () =>
      within(screen.getAllByRole('table')[0])
        .getAllByRole('row')
        .slice(1)
        .map((row) => within(row).getAllByRole('cell')[0].textContent?.trim() ?? '');

    expect(targetRows()).toEqual([
      'Fail targettarget.fail',
      'Missing targettarget.missing',
      'Pass targettarget.pass',
      'Watch targettarget.watch',
    ]);

    fireEvent.click(within(screen.getAllByRole('table')[0]).getByRole('button', { name: /^result/i }));

    await waitFor(() => {
      expect(targetRows()).toEqual([
        'Watch targettarget.watch',
        'Pass targettarget.pass',
        'Missing targettarget.missing',
        'Fail targettarget.fail',
      ]);
    });
  });

  it('saves the item picture mode preference', async () => {
    renderSettingsRoute('/settings/workspace');
    const pictureModeSelect = await screen.findByRole('combobox', { name: 'Item picture size' });
    fireEvent.click(pictureModeSelect);
    fireEvent.click(screen.getByRole('option', { name: 'Off' }));
    fireEvent.click(firstSavePreferencesButton());

    await waitFor(() => {
      expect(savePreferences).toHaveBeenCalledWith(expect.objectContaining({
        itemImageMode: 'off',
      }));
    });
  });

  it('renders and saves the dim charts while loading preference in workspace preferences', async () => {
    renderSettingsRoute('/settings/workspace');

    const checkbox = await screen.findByRole('checkbox', { name: /dim charts while loading/i });
    expect(checkbox).not.toBeChecked();

    fireEvent.click(checkbox);
    fireEvent.click(firstSavePreferencesButton());

    await waitFor(() => {
      expect(savePreferences).toHaveBeenCalledWith(expect.objectContaining({
        dimChartsWhileLoading: true,
      }));
    });
  });

  it('renders and saves one overview batch-action default', async () => {
    savePreferences.mockImplementation(async (payload) => ({
      language: 'en',
      currency: 'USD',
      usdToKhrExchangeRate: 4000,
      displayViewMode: 'custom',
      itemImageMode: payload.itemImageMode ?? 'small',
      dimChartsWhileLoading: payload.dimChartsWhileLoading ?? false,
      showExplanatoryTooltips: true,
      showFloatingTitleActions: true,
      showRightRailCards: true,
      showOverviewTaskTabs: true,
      showAnalysisPage: true,
      showPerformanceCompareToggle: true,
      showPerformanceTimelineCard: true,
      showLogsViewToggle: true,
      showHeartbeatRibbons: true,
      taskBatchUpdatePreferences: payload.taskBatchUpdatePreferences,
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

    renderSettingsRoute('/settings/workspace');

    const logOrderSelect = await screen.findByRole('combobox', { name: 'Log order' });
    fireEvent.click(logOrderSelect);
    fireEvent.click(screen.getByRole('option', { name: 'Always batch update' }));
    fireEvent.click(firstSavePreferencesButton());

    await waitFor(() => {
      expect(savePreferences).toHaveBeenCalledWith(expect.objectContaining({
        taskBatchUpdatePreferences: {
          logOrder: 'always_batch',
          updateEta: 'ask',
          followUp: 'ask',
          receive: 'ask',
          review: 'ask',
        },
      }));
    });
  });

  it('renders and saves language and currency through the shared select controls', async () => {
    savePreferences.mockImplementation(async (payload) => ({
      language: payload.language ?? 'en',
      currency: payload.currency ?? 'USD',
      usdToKhrExchangeRate: payload.usdToKhrExchangeRate ?? 4000,
      displayViewMode: payload.displayViewMode ?? 'custom',
      itemImageMode: payload.itemImageMode ?? 'small',
      dimChartsWhileLoading: payload.dimChartsWhileLoading ?? false,
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
      itemImageMode: payload.itemImageMode ?? 'small',
      dimChartsWhileLoading: payload.dimChartsWhileLoading ?? false,
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
    const saveButton = firstSavePreferencesButton();

    expect(extraGuidanceCheckbox).not.toBeDisabled();
    expect(saveButton).toBeDisabled();

    fireEvent.click(compactButton);

    expect(savePreferences).not.toHaveBeenCalled();
    expect(saveButton).not.toBeDisabled();
    expect(extraGuidanceCheckbox).toBeDisabled();

    fireEvent.click(saveButton);

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
      itemImageMode: 'small',
      dimChartsWhileLoading: false,
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
      itemImageMode: payload.itemImageMode ?? 'small',
      dimChartsWhileLoading: payload.dimChartsWhileLoading ?? false,
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
    const saveButton = firstSavePreferencesButton();

    expect(extraGuidanceCheckbox).toBeDisabled();

    fireEvent.click(customButton);

    expect(savePreferences).not.toHaveBeenCalled();
    expect(saveButton).not.toBeDisabled();
    expect(extraGuidanceCheckbox).not.toBeDisabled();

    fireEvent.click(saveButton);

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
      itemImageMode: payload.itemImageMode ?? 'small',
      dimChartsWhileLoading: payload.dimChartsWhileLoading ?? false,
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

    expect(await screen.findAllByText('Planning settings')).not.toHaveLength(0);
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
      itemImageMode: payload.itemImageMode ?? 'small',
      dimChartsWhileLoading: payload.dimChartsWhileLoading ?? false,
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
