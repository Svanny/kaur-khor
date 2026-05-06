import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
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

async function checkboxInRow(label: string) {
  const labelElement = await screen.findByText(label);
  const row = labelElement.closest('[data-slot="checkbox-row"]');
  expect(row).not.toBeNull();
  return within(row as HTMLElement).getByRole('checkbox') as HTMLButtonElement;
}

function mockIntersectionObserver() {
  let trigger: IntersectionObserverCallback | null = null;
  const observe = vi.fn();
  const disconnect = vi.fn();
  const OriginalIntersectionObserver = window.IntersectionObserver;

  Object.defineProperty(window, 'IntersectionObserver', {
    configurable: true,
    value: vi.fn(function MockIntersectionObserver(callback: IntersectionObserverCallback) {
      trigger = callback;
      return {
        disconnect,
        observe,
        takeRecords: () => [],
        unobserve: vi.fn(),
      };
    }),
  });

  return {
    disconnect,
    observe,
    restore: () => {
      Object.defineProperty(window, 'IntersectionObserver', {
        configurable: true,
        value: OriginalIntersectionObserver,
      });
    },
    triggerVisible: () => {
      if (!trigger) {
        throw new Error('IntersectionObserver was not created');
      }
      trigger([{ isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver);
    },
  };
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
  distribution?: {
    count: number;
    iqr: number | null;
    max: number | null;
    mean: number | null;
    median: number | null;
    min: number | null;
    q1: number | null;
    q3: number | null;
  };
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
    outputDirectory: '/tmp/kaur-khor/bench-results/gui-run',
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
  const getAppContext = vi.fn();
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
    vi.useRealTimers();
    vi.unstubAllEnvs();
    getPreferences.mockReset();
    savePreferences.mockReset();
    getAppContext.mockReset();
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
      showAutomationsPage: true,
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
      customShowAutomationsPage: true,
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
        automations: true,
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
      showAutomationsPage: false,
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
      customShowAutomationsPage: false,
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
        automations: true,
      },
    });
    triggerRun.mockResolvedValue({ runId: 'run-parameters' });
    getLocalDataInfo.mockResolvedValue({
      dataDirectoryPath: '/tmp/kaur-khor',
      workspaceStorePath: '/tmp/kaur-khor/workspace.sqlite',
      preferencesPath: '/tmp/kaur-khor/desktop-preferences.json',
      backupDirectoryPath: '/tmp/kaur-khor/backup-snapshots',
      assetDirectoryPath: '/tmp/kaur-khor/assets',
      storageFormat: 'sqlite',
    });
    getAppContext.mockResolvedValue({ appVersion: 'test', platform: 'darwin' });
    createBackupSnapshot.mockResolvedValue({
      createdAt: '2026-04-10T10:00:00.000Z',
      fileCount: 3,
      snapshotPath: '/tmp/kaur-khor/backup-snapshots/manual-snapshot',
      trigger: 'manual',
    });
    restoreBackupSnapshot.mockResolvedValue({
      restoredSnapshotPath: '/tmp/kaur-khor/backup-snapshots/manual-snapshot',
      safetySnapshot: {
        createdAt: '2026-04-10T10:05:00.000Z',
        fileCount: 3,
        snapshotPath: '/tmp/kaur-khor/backup-snapshots/before-restore',
        trigger: 'manual',
      },
    });
    clearCurrentData.mockResolvedValue({
      safetySnapshot: {
        createdAt: '2026-04-10T10:10:00.000Z',
        fileCount: 3,
        snapshotPath: '/tmp/kaur-khor/backup-snapshots/before-clear',
        trigger: 'manual',
      },
    });
    benchmarkAvailability.mockResolvedValue({
      available: true,
      reason: null,
      projectRoot: '/tmp/kaur-khor',
      resultsDirectory: '/tmp/kaur-khor/bench-results',
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
      outputDirectory: '/tmp/kaur-khor/bench-results/gui-run',
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
      outputDirectory: `/tmp/kaur-khor/bench-results/${runId}`,
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

    window.kaurKhorDesktop = {
      ...(window.kaurKhorDesktop ?? {}),
      preferences: {
        get: getPreferences,
        save: savePreferences,
      },
      sena: {
        ...(window.kaurKhorDesktop?.sena ?? {}),
        triggerRun,
      },
      system: {
        ...(window.kaurKhorDesktop?.system ?? {}),
        getAppContext,
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
      screen.getByText('Choose a view preset or fine-tune the individual interface visibility toggles below.'),
    ).toBeInTheDocument();
    expect(screen.getAllByRole('radio', { name: /minimal view/i })[0]).toBeInTheDocument();
    expect(screen.getAllByRole('radio', { name: /default view/i })[0]).toBeInTheDocument();
    expect(screen.getAllByRole('radio', { name: /maximal view/i })[0]).toBeInTheDocument();
    expect(screen.getAllByRole('radio', { name: /custom view/i })[0]).toBeInTheDocument();

    const checkbox = await checkboxInRow('Optional guidance');
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

  it('renders the interface visibility page in Khmer without English card or toggle copy', async () => {
    getPreferences.mockResolvedValue({
      language: 'km',
      currency: 'USD',
      usdToKhrExchangeRate: 4000,
      displayViewMode: 'custom',
      itemImageMode: 'small',
      dimChartsWhileLoading: false,
      showExplanatoryTooltips: true,
      showFloatingTitleActions: true,
      showRightRailCards: true,
      showOverviewTaskTabs: true,
      showAutomationsPage: true,
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
      customShowAutomationsPage: true,
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
        automations: true,
      },
    });

    renderSettingsRoute('/settings/interface');

    expect(await screen.findByRole('radiogroup', { name: 'របៀបទិដ្ឋភាពបង្ហាញ' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'ទិដ្ឋភាពលំនាំដើម' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'ទិដ្ឋភាពសាមញ្ញ' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'ទិដ្ឋភាពពេញលេញ' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'ទិដ្ឋភាពផ្ទាល់ខ្លួន' })).toBeInTheDocument();
    expect(screen.getByText('ការណែនាំស្រេចចិត្ត')).toBeInTheDocument();
    expect(screen.getByText('សកម្មភាពទំព័រអណ្តែត')).toBeInTheDocument();
    expect(screen.getByText('ផ្ទាំងបរិបទខាងស្តាំ')).toBeInTheDocument();
    expect(screen.getByText('ផ្ទាំងតម្រងជួរការងារ')).toBeInTheDocument();
    expect(screen.getByText('បង្ហាញស្លាកពន្យល់ស្រេចចិត្ត អត្ថបទជំនួយ និងគន្លឹះជំនួយ។ ការណែនាំវាលចាំបាច់នៅតែមើលឃើញ។')).toBeInTheDocument();

    expect(screen.queryByRole('radiogroup', { name: 'Display view mode' })).not.toBeInTheDocument();
    expect(screen.queryByText('Default View')).not.toBeInTheDocument();
    expect(screen.queryByText('Minimal View')).not.toBeInTheDocument();
    expect(screen.queryByText('Maximal View')).not.toBeInTheDocument();
    expect(screen.queryByText('Custom View')).not.toBeInTheDocument();
    expect(screen.queryByText('Optional guidance')).not.toBeInTheDocument();
    expect(screen.queryByText('Floating page actions')).not.toBeInTheDocument();
    expect(screen.queryByText('Right-side context panels')).not.toBeInTheDocument();
    expect(screen.queryByText('Work queue filter tabs')).not.toBeInTheDocument();
  });

  it('renders Khmer currency option names with currency codes as secondary text', async () => {
    getPreferences.mockResolvedValue({
      language: 'km',
      currency: 'USD',
      usdToKhrExchangeRate: 4000,
      displayViewMode: 'custom',
      itemImageMode: 'small',
      dimChartsWhileLoading: false,
      showExplanatoryTooltips: true,
      showFloatingTitleActions: true,
      showRightRailCards: true,
      showOverviewTaskTabs: true,
      showAutomationsPage: true,
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
      customShowAutomationsPage: true,
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
        automations: true,
      },
    });

    renderSettingsRoute('/settings/workspace');

    const currencySelect = await screen.findByRole('combobox', { name: 'រូបិយប័ណ្ណ' });
    expect(currencySelect).toHaveTextContent('ដុល្លារអាមេរិក');
    expect(currencySelect).toHaveTextContent('USD');

    fireEvent.click(currencySelect);

    expect(await screen.findByRole('option', { name: /USD.*ដុល្លារអាមេរិក/ })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: /KHR.*រៀលខ្មែរ/ })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'USD' })).not.toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'KHR' })).not.toBeInTheDocument();
  });

  it('keeps the onboarding injector hidden by default', async () => {
    renderSettingsRoute('/settings/workspace');

    await screen.findByText('Regional preferences');
    expect(screen.queryByRole('button', { name: 'Inject onboarding stage' })).not.toBeInTheDocument();
  });

  it('keeps the onboarding injector hidden even when the dev flag is enabled', async () => {
    vi.stubEnv('VITE_KAUR_KHOR_SHOW_DEV_ONBOARDING_INJECTOR', '1');

    renderSettingsRoute('/settings/workspace');

    await screen.findByText('Regional preferences');
    expect(screen.queryByRole('button', { name: 'Inject onboarding stage' })).not.toBeInTheDocument();
  });

  it('keeps benchmark runner diagnostics desktop-only in browser mode', async () => {
    getAppContext.mockResolvedValue({ appVersion: 'browser-test', platform: 'web' });

    renderSettingsRoute('/settings/benchmarks');

    await waitFor(() => expect(getAppContext).toHaveBeenCalled());
    expect(await screen.findByText('Benchmark runner is desktop-only', {}, { timeout: 5000 })).toBeInTheDocument();
    expect(screen.getByText(/GUI benchmark runs, Playwright traces, flame graphs/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Run selected' })).not.toBeInTheDocument();
  });

  it('redirects the benchmark settings route outside dev builds', async () => {
    vi.stubEnv('DEV', false);

    renderSettingsRoute('/settings/benchmarks');

    expect(await screen.findByText('Regional preferences')).toBeInTheDocument();
    expect(screen.queryByText('Benchmark runner is desktop-only')).not.toBeInTheDocument();
    expect(benchmarkAvailability).not.toHaveBeenCalled();
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

  it('shows a status message instead of throwing when benchmark cancellation fails', async () => {
    benchmarkAvailability.mockResolvedValue({
      available: true,
      reason: null,
      projectRoot: '/tmp/kaur-khor',
      resultsDirectory: '/tmp/kaur-khor/bench-results',
      activeRunId: 'gui-run',
    });
    benchmarkListRuns.mockResolvedValue([
      {
        ...benchmarkRunWithTargets([]),
        status: 'running',
        completedAt: null,
        exitCode: null,
      },
    ]);
    benchmarkCancelRun.mockRejectedValue(new Error('Benchmark run not found.'));

    renderSettingsRoute('/settings/benchmarks');

    const cancelButton = await screen.findByRole('button', { name: 'Cancel' });
    expect(cancelButton).toBeEnabled();
    fireEvent.click(cancelButton);

    await waitFor(() => {
      expect(benchmarkCancelRun).toHaveBeenCalled();
    });
    expect(await screen.findByText('Benchmark run not found.')).toBeInTheDocument();
  });

  it('shows all targets by default and can filter to a selected scenario summary', async () => {
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
                metricName: 'startup.app_to_workspace_ready_ms',
                label: 'App to usable workspace',
                value: 2200,
                unit: 'ms',
                status: 'pass',
                nonNegotiable: 2500,
                acceptable: 5000,
                source: 'Windows startup, Android startup, Core Web Vitals LCP',
                rationale: 'Startup ends when the workspace can be used, not when the first frame appears.',
              },
            ],
          },
          {
            scenario: 'stability',
            runId: 'gui-run',
            generatedAt: '2026-04-18T16:32:11.000Z',
            metrics: {},
            slowestIpc: [],
            slowestCore: [],
            targets: [
              {
                metricName: 'memory.renderer_stability_growth_pct',
                label: 'Renderer memory growth',
                value: 11.5,
                unit: 'percent',
                status: 'watch',
                nonNegotiable: 10,
                acceptable: 15,
                source: 'Chromium memory benchmarks',
                rationale: 'Repeated navigation should not produce a steady heap ratchet.',
              },
            ],
          },
        ],
      },
    ]);

    renderSettingsRoute('/settings/benchmarks');

    expect(await screen.findByText('Target status')).toBeInTheDocument();
    expect(await screen.findByRole('combobox', { name: 'Selected benchmark summary' })).toHaveTextContent('All');
    expect(screen.getByText('App to usable workspace')).toBeInTheDocument();
    expect(screen.getByText('Renderer memory growth')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('combobox', { name: 'Selected benchmark summary' }));
    fireEvent.click(screen.getByRole('option', { name: 'Startup' }));

    await waitFor(() => {
      expect(screen.getByText('App to usable workspace')).toBeInTheDocument();
    });
    expect(screen.queryByText('Renderer memory growth')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('combobox', { name: 'Selected benchmark summary' }));
    fireEvent.click(screen.getByRole('option', { name: 'Stability' }));

    await waitFor(() => {
      expect(screen.getByText('Renderer memory growth')).toBeInTheDocument();
    });
    expect(screen.queryByText('App to usable workspace')).not.toBeInTheDocument();
  });

  it('renders repeat distribution details for aggregated benchmark targets', async () => {
    benchmarkListRuns.mockResolvedValue([
      benchmarkRunWithTargets([
        {
          metricName: 'startup.app_to_workspace_ready_ms',
          label: 'App to usable workspace',
          value: 2600,
          distribution: {
            count: 3,
            iqr: 4600,
            max: 7000,
            mean: 4000,
            median: 2600,
            min: 2400,
            q1: 2400,
            q3: 7000,
          },
          status: 'watch',
          nonNegotiable: 2500,
          acceptable: 5000,
          source: 'Windows startup, Android startup, Core Web Vitals LCP',
          rationale: 'Startup ends when the workspace can be used, not when the first frame appears.',
        },
      ]),
    ]);

    renderSettingsRoute('/settings/benchmarks');

    expect(await screen.findByText('Target status')).toBeInTheDocument();
    expect(screen.getByText('App to usable workspace')).toBeInTheDocument();
    expect(screen.getByText('Median 2600 ms')).toBeInTheDocument();
    expect(screen.getByText('Mean 4000 ms')).toBeInTheDocument();
    expect(screen.getByText('IQR 4600 ms')).toBeInTheDocument();
    expect(screen.getByText('Min 2400 ms · Max 7000 ms')).toBeInTheDocument();
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
      showAutomationsPage: true,
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
      customShowAutomationsPage: true,
      customShowAnalysisPage: true,
      customShowPerformanceCompareToggle: true,
      customShowPerformanceTimelineCard: true,
      customShowLogsViewToggle: true,
      customShowHeartbeatRibbons: true,
      senaEngineParameters: DEFAULT_SENA_ENGINE_PARAMETERS,
    }));

    renderSettingsRoute('/settings/workspace');

    const logOrderSelect = await screen.findByRole('combobox', { name: 'Record Supplier order' });
    expect(logOrderSelect).toHaveClass('h-9', 'rounded-full', 'bg-card');
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

  it('localizes workspace preference labels in Khmer', async () => {
    renderSettingsRoute();

    const [languageSelect] = await screen.findAllByRole('combobox');
    fireEvent.click(languageSelect);
    fireEvent.click(screen.getByRole('option', { name: 'កខគKhmer' }));

    expect(await screen.findByText('ចំណូលចិត្តតំបន់')).toBeInTheDocument();
    expect(screen.getByText('រូបភាពធាតុ')).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'ទំហំរូបភាពធាតុ' })).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'បន្ថយពន្លឺក្រាហ្វពេលកំពុងផ្ទុក' })).toBeInTheDocument();
    expect(screen.getByText('លំនាំដើមសកម្មភាពជួរការងារ')).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'កត់ត្រាការបញ្ជាទិញពីអ្នកផ្គត់ផ្គង់' })).toBeInTheDocument();
    expect(screen.getByText('ខ្មែរ')).toBeInTheDocument();
    expect(screen.queryByText('Regional preferences')).not.toBeInTheDocument();
    expect(screen.queryByText('Item pictures')).not.toBeInTheDocument();
    expect(screen.queryByText('Chart loading')).not.toBeInTheDocument();
    expect(screen.queryByText('Dim charts while loading')).not.toBeInTheDocument();
    expect(screen.queryByText('Work queue action defaults')).not.toBeInTheDocument();
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
      showAutomationsPage: true,
      showAnalysisPage: true,
      showPerformanceCompareToggle: true,
      showPerformanceTimelineCard: true,
      showLogsViewToggle: true,
      showHeartbeatRibbons: true,
      customShowExplanatoryTooltips: true,
      customShowFloatingTitleActions: true,
      customShowRightRailCards: true,
      customShowOverviewTaskTabs: true,
      customShowAutomationsPage: true,
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
    fireEvent.click(screen.getByRole('option', { name: /KHR.*រៀលខ្មែរ/ }));

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
      showAutomationsPage: true,
      showAnalysisPage: true,
      showPerformanceCompareToggle: true,
      showPerformanceTimelineCard: true,
      showLogsViewToggle: true,
      showHeartbeatRibbons: true,
      customShowExplanatoryTooltips: true,
      customShowFloatingTitleActions: true,
      customShowRightRailCards: true,
      customShowOverviewTaskTabs: true,
      customShowAutomationsPage: true,
      customShowAnalysisPage: true,
      customShowPerformanceCompareToggle: true,
      customShowPerformanceTimelineCard: true,
      customShowLogsViewToggle: true,
      customShowHeartbeatRibbons: true,
      senaEngineParameters: DEFAULT_SENA_ENGINE_PARAMETERS,
    }));
    renderSettingsRoute();

    const exchangeRateInput = await screen.findByRole('textbox', { name: /exchange rate for 1 usd in khr/i });
    expect(exchangeRateInput).toHaveDisplayValue('4,000');

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

    const checkbox = await checkboxInRow('Right-side context panels');
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

    const checkbox = await checkboxInRow('Work queue filter tabs');
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

  it('does not render retired intake visibility preferences', async () => {
    renderSettingsRoute('/settings/interface');

    await checkboxInRow('Work queue filter tabs');

    expect(screen.queryByRole('checkbox', { name: /show intake tools/i })).not.toBeInTheDocument();
  });

  it('renders and saves the automations and intake preference', async () => {
    renderSettingsRoute('/settings/interface');

    const checkbox = await checkboxInRow('Automations and intake');
    expect(checkbox).toBeChecked();

    fireEvent.click(checkbox);
    fireEvent.click(firstSavePreferencesButton());

    await waitFor(() => {
      expect(savePreferences).toHaveBeenCalledWith(expect.objectContaining({
        showAutomationsPage: false,
      }));
    });
  });

  it('redirects disabled automation settings to the highlighted interface row', async () => {
    const intersectionObserver = mockIntersectionObserver();
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
      showAutomationsPage: false,
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
      customShowAutomationsPage: false,
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
        automations: true,
      },
    });

    renderSettingsRoute('/settings/automation');

    await checkboxInRow('Automations and intake');
    const highlightedRow = document.querySelector('[data-settings-interface-row="automations"]');
    expect(highlightedRow).not.toHaveAttribute('data-highlighted', 'true');
    expect(screen.queryByTestId('settings-automations-highlight')).not.toBeInTheDocument();
    expect(intersectionObserver.observe).toHaveBeenCalled();

    act(() => {
      intersectionObserver.triggerVisible();
    });

    expect(highlightedRow).toHaveAttribute('data-highlighted', 'true');
    expect(highlightedRow).not.toHaveClass('px-2');
    expect(highlightedRow).not.toHaveClass('bg-primary/10');
    const highlight = screen.getByTestId('settings-automations-highlight');
    expect(highlight).toHaveClass('inset-0');
    expect(highlight).toHaveClass('motion-safe:animate-[kaur-khor-attention-flash_1800ms_ease-in-out_1]');
    expect(intersectionObserver.disconnect).toHaveBeenCalled();
    intersectionObserver.restore();
  });

  it('renders and saves the performance compare toggle preference', async () => {
    renderSettingsRoute('/settings/interface');

    const checkbox = await checkboxInRow('Comparison view switch');
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

    const checkbox = await checkboxInRow('Pressure timeline card');
    expect(checkbox).toBeChecked();

    fireEvent.click(checkbox);
    fireEvent.click(firstSavePreferencesButton());

    await waitFor(() => {
      expect(savePreferences).toHaveBeenCalledWith(expect.objectContaining({
        showPerformanceTimelineCard: false,
      }));
    });
  });

  it('renders and saves the history log-style toggle preference', async () => {
    renderSettingsRoute('/settings/interface');

    const checkbox = await checkboxInRow('History view selector');
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

    const checkbox = await checkboxInRow('Heartbeat and signal ribbons');
    expect(checkbox).toBeChecked();

    fireEvent.click(checkbox);
    fireEvent.click(firstSavePreferencesButton());

    await waitFor(() => {
      expect(savePreferences).toHaveBeenCalledWith(expect.objectContaining({
        showHeartbeatRibbons: false,
      }));
    });
  });

  it('switches between preset view modes from interface visibility', async () => {
    renderSettingsRoute('/settings/interface');

    const minimalButton = (await screen.findAllByRole('radio', { name: 'Minimal View' }))[0] as HTMLButtonElement;
    expect(screen.getByRole('radio', { name: 'Default View' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Maximal View' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Custom View' })).toBeInTheDocument();
    const optionalGuidanceCheckbox = within(screen.getByText('Optional guidance').closest('[data-slot="checkbox-row"]') as HTMLElement).getByRole('checkbox');
    const saveButton = firstSavePreferencesButton();

    expect(optionalGuidanceCheckbox).not.toBeDisabled();
    expect(saveButton).toBeDisabled();

    fireEvent.click(minimalButton);

    expect(savePreferences).not.toHaveBeenCalled();
    expect(saveButton).not.toBeDisabled();
    expect(optionalGuidanceCheckbox).not.toBeDisabled();
    expect(optionalGuidanceCheckbox).not.toBeChecked();

    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(savePreferences).toHaveBeenCalledWith(expect.objectContaining({
        displayViewMode: 'minimal',
        showExplanatoryTooltips: false,
        showFloatingTitleActions: false,
        showRightRailCards: false,
        showOverviewTaskTabs: false,
        showAutomationsPage: false,
        showAnalysisPage: true,
        showPerformanceCompareToggle: false,
        showPerformanceTimelineCard: false,
        showLogsViewToggle: false,
        showHeartbeatRibbons: false,
        customShowExplanatoryTooltips: true,
        customShowFloatingTitleActions: true,
        customShowRightRailCards: true,
        customShowOverviewTaskTabs: true,
        customShowAutomationsPage: true,
        customShowAnalysisPage: true,
        customShowPerformanceCompareToggle: true,
        customShowPerformanceTimelineCard: true,
        customShowLogsViewToggle: true,
        customShowHeartbeatRibbons: true,
      }));
    });
  });

  it('shows a custom card for non-preset toggle combinations', async () => {
    getPreferences.mockResolvedValue({
      language: 'en',
      currency: 'USD',
      usdToKhrExchangeRate: 4000,
      displayViewMode: 'minimal',
      itemImageMode: 'small',
      dimChartsWhileLoading: false,
      showExplanatoryTooltips: false,
      showFloatingTitleActions: false,
      showRightRailCards: false,
      showOverviewTaskTabs: false,
      showAutomationsPage: false,
      showAnalysisPage: true,
      showPerformanceCompareToggle: false,
      showPerformanceTimelineCard: false,
      showLogsViewToggle: false,
      showHeartbeatRibbons: false,
      customShowExplanatoryTooltips: false,
      customShowFloatingTitleActions: false,
      customShowRightRailCards: false,
      customShowOverviewTaskTabs: false,
      customShowAutomationsPage: false,
      customShowAnalysisPage: true,
      customShowPerformanceCompareToggle: false,
      customShowPerformanceTimelineCard: false,
      customShowLogsViewToggle: false,
      customShowHeartbeatRibbons: false,
      senaEngineParameters: DEFAULT_SENA_ENGINE_PARAMETERS,
    });

    renderSettingsRoute('/settings/interface');

    expect(await screen.findByRole('radio', { name: 'Minimal View' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('radio', { name: 'Custom View' })).toHaveAttribute('aria-checked', 'false');

    const optionalGuidanceCheckbox = await checkboxInRow('Optional guidance');
    fireEvent.click(optionalGuidanceCheckbox);

    expect(screen.getByRole('radio', { name: 'Custom View' })).toHaveAttribute('aria-checked', 'true');
  });

  it('keeps custom selected when its visibility matches a preset', async () => {
    getPreferences.mockResolvedValue({
      language: 'en',
      currency: 'USD',
      usdToKhrExchangeRate: 4000,
      displayViewMode: 'custom',
      itemImageMode: 'small',
      dimChartsWhileLoading: false,
      showExplanatoryTooltips: true,
      showFloatingTitleActions: true,
      showRightRailCards: false,
      showOverviewTaskTabs: false,
      showAutomationsPage: false,
      showAnalysisPage: true,
      showPerformanceCompareToggle: false,
      showPerformanceTimelineCard: false,
      showLogsViewToggle: false,
      showHeartbeatRibbons: true,
      customShowExplanatoryTooltips: true,
      customShowFloatingTitleActions: true,
      customShowRightRailCards: false,
      customShowOverviewTaskTabs: false,
      customShowAutomationsPage: false,
      customShowAnalysisPage: true,
      customShowPerformanceCompareToggle: false,
      customShowPerformanceTimelineCard: false,
      customShowLogsViewToggle: false,
      customShowHeartbeatRibbons: true,
      senaEngineParameters: DEFAULT_SENA_ENGINE_PARAMETERS,
    });

    renderSettingsRoute('/settings/interface');

    expect(await screen.findByRole('radio', { name: 'Custom View' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('radio', { name: 'Default View' })).toHaveAttribute('aria-checked', 'false');
  });

  it('clicking custom restores remembered custom visibility', async () => {
    getPreferences.mockResolvedValue({
      language: 'en',
      currency: 'USD',
      usdToKhrExchangeRate: 4000,
      displayViewMode: 'default',
      itemImageMode: 'small',
      dimChartsWhileLoading: false,
      showExplanatoryTooltips: true,
      showFloatingTitleActions: true,
      showRightRailCards: false,
      showOverviewTaskTabs: false,
      showAutomationsPage: false,
      showAnalysisPage: true,
      showPerformanceCompareToggle: false,
      showPerformanceTimelineCard: false,
      showLogsViewToggle: false,
      showHeartbeatRibbons: true,
      customShowExplanatoryTooltips: true,
      customShowFloatingTitleActions: true,
      customShowRightRailCards: true,
      customShowOverviewTaskTabs: true,
      customShowAutomationsPage: true,
      customShowAnalysisPage: true,
      customShowPerformanceCompareToggle: true,
      customShowPerformanceTimelineCard: true,
      customShowLogsViewToggle: true,
      customShowHeartbeatRibbons: true,
      senaEngineParameters: DEFAULT_SENA_ENGINE_PARAMETERS,
    });

    renderSettingsRoute('/settings/interface');

    expect(await checkboxInRow('Right-side context panels')).not.toBeChecked();

    fireEvent.click(screen.getByRole('radio', { name: 'Custom View' }));

    expect(screen.getByRole('radio', { name: 'Custom View' })).toHaveAttribute('aria-checked', 'true');
    expect(await checkboxInRow('Right-side context panels')).toBeChecked();
    expect(await checkboxInRow('Work queue filter tabs')).toBeChecked();
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
    expect(screen.queryByLabelText(/planning profile/i)).not.toBeInTheDocument();
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

    fireEvent.click(await screen.findByRole('button', { name: /^\/tmp\/kaur-khor$/i }));
    fireEvent.click(screen.getByRole('button', { name: /^\/tmp\/kaur-khor\/workspace\.sqlite$/i }));
    fireEvent.click(screen.getByRole('button', { name: /^\/tmp\/kaur-khor\/desktop-preferences\.json$/i }));
    fireEvent.click(screen.getByRole('button', { name: /^\/tmp\/kaur-khor\/backup-snapshots$/i }));

    expect(revealPath).toHaveBeenNthCalledWith(1, '/tmp/kaur-khor');
    expect(revealPath).toHaveBeenNthCalledWith(2, '/tmp/kaur-khor/workspace.sqlite');
    expect(revealPath).toHaveBeenNthCalledWith(3, '/tmp/kaur-khor/desktop-preferences.json');
    expect(revealPath).toHaveBeenNthCalledWith(4, '/tmp/kaur-khor/backup-snapshots');
  });

  it('shows browser local data guidance without native reveal or snapshot actions', async () => {
    getAppContext.mockResolvedValue({ appVersion: 'browser-test', platform: 'web' });
    getLocalDataInfo.mockResolvedValue({
      dataDirectoryPath: 'OPFS / Kaur Khor browser workspace',
      workspaceStorePath: 'kaur_khor_browser_app_v1.sqlite3',
      preferencesPath: 'SQLite preferences table',
      backupDirectoryPath: 'downloaded backups',
      assetDirectoryPath: 'Browser image storage unavailable in this release',
      storageFormat: 'sqlite',
    });

    renderSettingsRoute('/settings/local-data');

    expect(await screen.findByText('Browser data lives in this browser profile.')).toBeInTheDocument();
    expect(screen.getByText('OPFS / Kaur Khor browser workspace')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /OPFS \/ Kaur Khor browser workspace/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /create backup snapshot/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Export logs/i })).not.toBeInTheDocument();
    expect(revealPath).not.toHaveBeenCalled();
  });

  it('creates a manual backup snapshot from local workspace data settings', async () => {
    renderSettingsRoute('/settings/local-data');

    fireEvent.click(await screen.findByRole('button', { name: /create backup snapshot/i }));

    await waitFor(() => {
      expect(createBackupSnapshot).toHaveBeenCalledTimes(1);
    });
    expect(
      await screen.findByText(
        'Created a local backup snapshot at /tmp/kaur-khor/backup-snapshots/manual-snapshot.',
      ),
    ).toBeInTheDocument();
  });

  it('blocks overlapping local backup and restore operations', async () => {
    let finishBackup!: (value: Awaited<ReturnType<typeof createBackupSnapshot>>) => void;
    createBackupSnapshot.mockReturnValueOnce(new Promise((resolve) => {
      finishBackup = resolve;
    }));
    renderSettingsRoute('/settings/local-data');

    fireEvent.click(await screen.findByRole('button', { name: /create backup snapshot/i }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /creating snapshot/i })).toBeDisabled();
      expect(screen.getByRole('button', { name: /restore saved snapshot/i })).toBeDisabled();
    });

    finishBackup({
      createdAt: '2026-04-10T10:00:00.000Z',
      fileCount: 3,
      snapshotPath: '/tmp/kaur-khor/backup-snapshots/manual-snapshot',
      trigger: 'manual',
    });
    await screen.findByText('Created a local backup snapshot at /tmp/kaur-khor/backup-snapshots/manual-snapshot.');
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
    expect(screen.getByText('Kaur Khor desktop')).toBeInTheDocument();
    expect(screen.getByText('Copyright © 2026 Svanny.')).toBeInTheDocument();
    expect(
      screen.getByText('License: GNU General Public License v2.0 only (GPL-2.0-only).'),
    ).toBeInTheDocument();
    expect(screen.getByText('Full license terms are included in LICENSE.')).toBeInTheDocument();
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

    const deleteCurrentButton = await screen.findByRole('button', { name: /delete current data/i });
    expect(deleteCurrentButton).toHaveAttribute('data-variant', 'destructive');
    fireEvent.click(deleteCurrentButton);
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

    await waitFor(() => expect(particleInput).toHaveDisplayValue('5000'));
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

    fireEvent.pointerDown(firstSavePreferencesButton().parentElement as HTMLElement);
    expect(savePreferences).not.toHaveBeenCalled();
    expect(screen.getByText('Suggested range start cannot be above the range end.')).toHaveAttribute('data-error-flash-key', '1');
    expect(screen.getByText('Suggested range start cannot be above the range end.')).toHaveClass('motion-safe:animate-[kaur-khor-save-error-flash_1800ms_ease-in-out_1]');

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

    const checkbox = await checkboxInRow('Optional guidance');
    fireEvent.click(checkbox);
    fireEvent.click(screen.getByRole('link', { name: 'Catalog' }));

    const leaveDialog = screen.getByRole('dialog');
    expect(leaveDialog).toHaveTextContent('Discard changes?');
    expect(screen.getByRole('button', { name: 'Discard changes' })).toHaveAttribute('data-variant', 'destructive-outline');
    expect(within(leaveDialog).getByRole('button', { name: 'Save preferences' })).toHaveAttribute('data-variant', 'default');
    fireEvent.click(screen.getByRole('button', { name: 'Keep editing' }));
    expect(screen.queryByText('Catalog destination')).not.toBeInTheDocument();
    expect(checkbox).not.toBeChecked();

    fireEvent.click(screen.getByRole('link', { name: 'Catalog' }));
    fireEvent.click(screen.getByRole('button', { name: 'Discard changes' }));

    await waitFor(() => {
      expect(screen.getByText('Catalog destination')).toBeInTheDocument();
    });
  });

  it('saves unsaved preference changes before leaving when requested', async () => {
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

    const checkbox = await checkboxInRow('Optional guidance');
    fireEvent.click(checkbox);
    fireEvent.click(screen.getByRole('link', { name: 'Catalog' }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Save preferences' }));

    await waitFor(() => {
      expect(savePreferences).toHaveBeenCalledWith(expect.objectContaining({
        showExplanatoryTooltips: false,
      }));
      expect(screen.getByText('Catalog destination')).toBeInTheDocument();
    });
  });
});
