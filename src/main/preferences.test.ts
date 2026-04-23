// @vitest-environment node

import { writeFile as realWriteFile } from 'node:fs/promises';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it, vi } from 'vitest';

async function loadPreferencesModule() {
  return import('./preferences');
}

const defaultSenaEngineParameters = {
  algorithmVersion: 'sena-analysis-v3',
  particleCount: 256,
  targetServiceLevel: 0.95,
  recommendationQuantile: 0.7,
  intervalLowQuantile: 0.1,
  intervalHighQuantile: 0.9,
  needProbabilityGate: 0.5,
  reviewDelayDays: 0,
  smoothingEnabled: false,
};

describe('desktop preferences store', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.doUnmock('node:fs/promises');
    vi.resetModules();
  });

  it('returns defaults when no file exists', async () => {
    const userDataPath = await mkdtemp(join(tmpdir(), 'banji-preferences-'));
    const { loadDesktopPreferences } = await loadPreferencesModule();

    await expect(loadDesktopPreferences(userDataPath)).resolves.toEqual({
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
      senaEngineParameters: defaultSenaEngineParameters,
      overviewStaleUpdateReminderSnoozeUntil: null,
      onboardingCompletedAt: null,
      seenUnlockedNavItems: {
        catalog: false,
        operations: false,
        performance: false,
        financials: false,
        automations: false,
      },
      workbenchTileOrderByLane: {},
    });
  });

  it('persists and merges preference updates', async () => {
    const userDataPath = await mkdtemp(join(tmpdir(), 'banji-preferences-'));
    const { loadDesktopPreferences, saveDesktopPreferences } = await loadPreferencesModule();

    await expect(
      saveDesktopPreferences(userDataPath, {
        language: 'km',
      }),
    ).resolves.toEqual({
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
      senaEngineParameters: defaultSenaEngineParameters,
      overviewStaleUpdateReminderSnoozeUntil: null,
      onboardingCompletedAt: null,
      seenUnlockedNavItems: {
        catalog: false,
        operations: false,
        performance: false,
        financials: false,
        automations: false,
      },
      workbenchTileOrderByLane: {},
    });

    await expect(
      saveDesktopPreferences(userDataPath, {
        currency: 'KHR',
        usdToKhrExchangeRate: 4100,
        showExplanatoryTooltips: false,
        showRightRailCards: false,
        overviewStaleUpdateReminderSnoozeUntil: '2026-04-05T17:00:00.000Z',
      }),
    ).resolves.toEqual({
      language: 'km',
      currency: 'KHR',
      usdToKhrExchangeRate: 4100,
      displayViewMode: 'custom',
      itemImageMode: 'small',
      dimChartsWhileLoading: false,
      showExplanatoryTooltips: false,
      showFloatingTitleActions: true,
      showRightRailCards: false,
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
      senaEngineParameters: defaultSenaEngineParameters,
      overviewStaleUpdateReminderSnoozeUntil: '2026-04-05T17:00:00.000Z',
      onboardingCompletedAt: null,
      seenUnlockedNavItems: {
        catalog: false,
        operations: false,
        performance: false,
        financials: false,
        automations: false,
      },
      workbenchTileOrderByLane: {},
    });

    await expect(loadDesktopPreferences(userDataPath)).resolves.toEqual({
      language: 'km',
      currency: 'KHR',
      usdToKhrExchangeRate: 4100,
      displayViewMode: 'custom',
      itemImageMode: 'small',
      dimChartsWhileLoading: false,
      showExplanatoryTooltips: false,
      showFloatingTitleActions: true,
      showRightRailCards: false,
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
      senaEngineParameters: defaultSenaEngineParameters,
      overviewStaleUpdateReminderSnoozeUntil: '2026-04-05T17:00:00.000Z',
      onboardingCompletedAt: null,
      seenUnlockedNavItems: {
        catalog: false,
        operations: false,
        performance: false,
        financials: false,
        automations: false,
      },
      workbenchTileOrderByLane: {},
    });

    const raw = await readFile(join(userDataPath, 'desktop-preferences.json'), 'utf8');
    expect(JSON.parse(raw)).toEqual({
      language: 'km',
      currency: 'KHR',
      usdToKhrExchangeRate: 4100,
      displayViewMode: 'custom',
      itemImageMode: 'small',
      dimChartsWhileLoading: false,
      showExplanatoryTooltips: false,
      showFloatingTitleActions: true,
      showRightRailCards: false,
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
      senaEngineParameters: defaultSenaEngineParameters,
      overviewStaleUpdateReminderSnoozeUntil: '2026-04-05T17:00:00.000Z',
      onboardingCompletedAt: null,
      seenUnlockedNavItems: {
        catalog: false,
        operations: false,
        performance: false,
        financials: false,
        automations: false,
      },
      workbenchTileOrderByLane: {},
    });
  });

  it('serializes concurrent preference writes so later updates merge correctly', async () => {
    const userDataPath = await mkdtemp(join(tmpdir(), 'banji-preferences-'));
    let releaseFirstWrite: (() => void) | null = null;
    const firstWriteBlocked = new Promise<void>((resolve) => {
      releaseFirstWrite = resolve;
    });
    let shouldBlockFirstWrite = true;
    const mockedWriteFile = vi.fn(
      async (...args: Parameters<typeof realWriteFile>) => {
        if (shouldBlockFirstWrite) {
          shouldBlockFirstWrite = false;
          await firstWriteBlocked;
        }
        return realWriteFile(...args);
      },
    );

    vi.doMock('node:fs/promises', async () => {
      const actual = await vi.importActual<typeof import('node:fs/promises')>(
        'node:fs/promises',
      );
      return {
        ...actual,
        writeFile: mockedWriteFile,
      };
    });
    const { loadDesktopPreferences, saveDesktopPreferences } = await loadPreferencesModule();

    const firstSave = saveDesktopPreferences(userDataPath, {
      language: 'km',
    });
    await vi.waitFor(() => {
      expect(mockedWriteFile).toHaveBeenCalledTimes(1);
    });

    const secondSave = saveDesktopPreferences(userDataPath, {
      currency: 'KHR',
    });

    await Promise.resolve();
    expect(mockedWriteFile).toHaveBeenCalledTimes(1);

    releaseFirstWrite?.();

    await expect(firstSave).resolves.toEqual({
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
      senaEngineParameters: defaultSenaEngineParameters,
      overviewStaleUpdateReminderSnoozeUntil: null,
      onboardingCompletedAt: null,
      seenUnlockedNavItems: {
        catalog: false,
        operations: false,
        performance: false,
        financials: false,
        automations: false,
      },
      workbenchTileOrderByLane: {},
    });
    await expect(secondSave).resolves.toEqual({
      language: 'km',
      currency: 'KHR',
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
      senaEngineParameters: defaultSenaEngineParameters,
      overviewStaleUpdateReminderSnoozeUntil: null,
      onboardingCompletedAt: null,
      seenUnlockedNavItems: {
        catalog: false,
        operations: false,
        performance: false,
        financials: false,
        automations: false,
      },
      workbenchTileOrderByLane: {},
    });
    await expect(loadDesktopPreferences(userDataPath)).resolves.toEqual({
      language: 'km',
      currency: 'KHR',
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
      senaEngineParameters: defaultSenaEngineParameters,
      overviewStaleUpdateReminderSnoozeUntil: null,
      onboardingCompletedAt: null,
      seenUnlockedNavItems: {
        catalog: false,
        operations: false,
        performance: false,
        financials: false,
        automations: false,
      },
      workbenchTileOrderByLane: {},
    });
  });

  it('normalizes invalid exchange rates back to the default', async () => {
    const userDataPath = await mkdtemp(join(tmpdir(), 'banji-preferences-'));
    const { loadDesktopPreferences, saveDesktopPreferences } = await loadPreferencesModule();

    await writeFile(
      join(userDataPath, 'desktop-preferences.json'),
      JSON.stringify({ language: 'km', currency: 'KHR', usdToKhrExchangeRate: -1 }),
      'utf8',
    );

    await expect(loadDesktopPreferences(userDataPath)).resolves.toEqual(expect.objectContaining({
      language: 'km',
      currency: 'KHR',
      usdToKhrExchangeRate: 4000,
    }));

    await expect(saveDesktopPreferences(userDataPath, { usdToKhrExchangeRate: Number.NaN })).resolves.toEqual(
      expect.objectContaining({ usdToKhrExchangeRate: 4000 }),
    );
  });

  it('round-trips and normalizes workbench tile order by lane', async () => {
    const userDataPath = await mkdtemp(join(tmpdir(), 'banji-preferences-'));
    const { loadDesktopPreferences, saveDesktopPreferences } = await loadPreferencesModule();

    await expect(
      saveDesktopPreferences(userDataPath, {
        workbenchTileOrderByLane: {
          'stock-count': ['stock:sku-2', 'stock:sku-1'],
          'supplier-order-pending': ['supplier-order:sku-2', 'supplier-order:sku-1'],
          'customer-order-pending': ['retail:sku-1', '', 'retail:sku-1', 'service:service-1'],
          'customer-order-completed': ['retail:sku-2'],
        },
      }),
    ).resolves.toEqual(
      expect.objectContaining({
        workbenchTileOrderByLane: {
          'stock-count': ['stock:sku-2', 'stock:sku-1'],
          'supplier-order-pending': ['supplier-order:sku-2', 'supplier-order:sku-1'],
          'customer-order-pending': ['retail:sku-1', 'service:service-1'],
          'customer-order-completed': ['retail:sku-2'],
        },
      }),
    );

    await writeFile(
      join(userDataPath, 'desktop-preferences.json'),
      JSON.stringify({
        language: 'en',
        currency: 'USD',
        workbenchTileOrderByLane: {
          'stock-count': ['stock:sku-3', 'stock:sku-3', null],
          'supplier-order-pending': ['supplier-order:sku-3', 'supplier-order:sku-3', null],
          'customer-order-pending': ['retail:sku-2'],
          invalid: ['bad'],
        },
      }),
      'utf8',
    );

    await expect(loadDesktopPreferences(userDataPath)).resolves.toEqual(
      expect.objectContaining({
        workbenchTileOrderByLane: {
          'stock-count': ['stock:sku-3'],
          'supplier-order-pending': ['supplier-order:sku-3'],
          'customer-order-pending': ['retail:sku-2'],
        },
      }),
    );
  });

  it('treats existing preference files without onboarding metadata as already onboarded', async () => {
    const userDataPath = await mkdtemp(join(tmpdir(), 'banji-preferences-'));
    await writeFile(
      join(userDataPath, 'desktop-preferences.json'),
      JSON.stringify({
        language: 'en',
        currency: 'USD',
      }),
      'utf8',
    );

    const { loadDesktopPreferences } = await loadPreferencesModule();
    const preferences = await loadDesktopPreferences(userDataPath);

    expect(preferences.onboardingCompletedAt).not.toBeNull();
    expect(preferences.seenUnlockedNavItems).toEqual({
      catalog: true,
      operations: true,
      performance: true,
      financials: true,
      automations: true,
    });
  });
});
