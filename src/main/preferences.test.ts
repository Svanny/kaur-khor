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
      senaEngineParameters: defaultSenaEngineParameters,
      overviewStaleUpdateReminderSnoozeUntil: null,
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
      senaEngineParameters: defaultSenaEngineParameters,
      overviewStaleUpdateReminderSnoozeUntil: null,
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
      senaEngineParameters: defaultSenaEngineParameters,
      overviewStaleUpdateReminderSnoozeUntil: '2026-04-05T17:00:00.000Z',
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
      senaEngineParameters: defaultSenaEngineParameters,
      overviewStaleUpdateReminderSnoozeUntil: '2026-04-05T17:00:00.000Z',
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
      senaEngineParameters: defaultSenaEngineParameters,
      overviewStaleUpdateReminderSnoozeUntil: '2026-04-05T17:00:00.000Z',
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
      senaEngineParameters: defaultSenaEngineParameters,
      overviewStaleUpdateReminderSnoozeUntil: null,
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
      senaEngineParameters: defaultSenaEngineParameters,
      overviewStaleUpdateReminderSnoozeUntil: null,
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
      senaEngineParameters: defaultSenaEngineParameters,
      overviewStaleUpdateReminderSnoozeUntil: null,
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
});
