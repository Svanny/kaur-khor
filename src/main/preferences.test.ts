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
    const userDataPath = await mkdtemp(join(tmpdir(), 'kaur-khor-preferences-'));
    const { loadDesktopPreferences } = await loadPreferencesModule();

    await expect(loadDesktopPreferences(userDataPath)).resolves.toEqual({
      language: 'en',
      currency: 'USD',
      usdToKhrExchangeRate: 4000,
      displayViewMode: 'default',
      itemImageMode: 'small',
      dimChartsWhileLoading: false,
      showExplanatoryTooltips: true,
      showFloatingTitleActions: true,
      showRightRailCards: false,
      showOverviewTaskTabs: true,
      showAutomationsPage: false,
      showAnalysisPage: true,
      showPerformanceCompareToggle: false,
      showPerformanceTimelineCard: false,
      showLogsViewToggle: false,
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
      customShowRightRailCards: false,
      customShowOverviewTaskTabs: true,
      customShowAutomationsPage: false,
      customShowAnalysisPage: true,
      customShowPerformanceCompareToggle: false,
      customShowPerformanceTimelineCard: false,
      customShowLogsViewToggle: false,
      customShowHeartbeatRibbons: true,
      senaEngineParameters: defaultSenaEngineParameters,
      overviewStaleUpdateReminderSnoozeUntil: null,
      onboardingCompletedAt: null,
      seenUnlockedNavItems: {
        catalog: false,
        insights: false,
        work: false,
      },
      workbenchTileOrderByLane: {},
    });
  });

  it('throws and preserves the preferences file when stored JSON is malformed', async () => {
    const userDataPath = await mkdtemp(join(tmpdir(), 'kaur-khor-preferences-'));
    const preferencesPath = join(userDataPath, 'desktop-preferences.json');
    const malformedJson = '{ "language": "km",';
    await writeFile(preferencesPath, malformedJson, 'utf8');
    const { loadDesktopPreferences } = await loadPreferencesModule();

    await expect(loadDesktopPreferences(userDataPath)).rejects.toThrow(SyntaxError);
    await expect(readFile(preferencesPath, 'utf8')).resolves.toBe(malformedJson);
  });

  it('persists and merges preference updates', async () => {
    const userDataPath = await mkdtemp(join(tmpdir(), 'kaur-khor-preferences-'));
    const { loadDesktopPreferences, saveDesktopPreferences } = await loadPreferencesModule();

    await expect(
      saveDesktopPreferences(userDataPath, {
        language: 'km',
      }),
    ).resolves.toEqual({
      language: 'km',
      currency: 'USD',
      usdToKhrExchangeRate: 4000,
      displayViewMode: 'default',
      itemImageMode: 'small',
      dimChartsWhileLoading: false,
      showExplanatoryTooltips: true,
      showFloatingTitleActions: true,
      showRightRailCards: false,
      showOverviewTaskTabs: true,
      showAutomationsPage: false,
      showAnalysisPage: true,
      showPerformanceCompareToggle: false,
      showPerformanceTimelineCard: false,
      showLogsViewToggle: false,
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
      customShowRightRailCards: false,
      customShowOverviewTaskTabs: true,
      customShowAutomationsPage: false,
      customShowAnalysisPage: true,
      customShowPerformanceCompareToggle: false,
      customShowPerformanceTimelineCard: false,
      customShowLogsViewToggle: false,
      customShowHeartbeatRibbons: true,
      senaEngineParameters: defaultSenaEngineParameters,
      overviewStaleUpdateReminderSnoozeUntil: null,
      onboardingCompletedAt: null,
      seenUnlockedNavItems: {
        catalog: false,
        insights: false,
        work: false,
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
      showAutomationsPage: false,
      showAnalysisPage: true,
      showPerformanceCompareToggle: false,
      showPerformanceTimelineCard: false,
      showLogsViewToggle: false,
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
      customShowRightRailCards: false,
      customShowOverviewTaskTabs: true,
      customShowAutomationsPage: false,
      customShowAnalysisPage: true,
      customShowPerformanceCompareToggle: false,
      customShowPerformanceTimelineCard: false,
      customShowLogsViewToggle: false,
      customShowHeartbeatRibbons: true,
      senaEngineParameters: defaultSenaEngineParameters,
      overviewStaleUpdateReminderSnoozeUntil: '2026-04-05T17:00:00.000Z',
      onboardingCompletedAt: null,
      seenUnlockedNavItems: {
        catalog: false,
        insights: false,
        work: false,
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
      showAutomationsPage: false,
      showAnalysisPage: true,
      showPerformanceCompareToggle: false,
      showPerformanceTimelineCard: false,
      showLogsViewToggle: false,
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
      customShowRightRailCards: false,
      customShowOverviewTaskTabs: true,
      customShowAutomationsPage: false,
      customShowAnalysisPage: true,
      customShowPerformanceCompareToggle: false,
      customShowPerformanceTimelineCard: false,
      customShowLogsViewToggle: false,
      customShowHeartbeatRibbons: true,
      senaEngineParameters: defaultSenaEngineParameters,
      overviewStaleUpdateReminderSnoozeUntil: '2026-04-05T17:00:00.000Z',
      onboardingCompletedAt: null,
      seenUnlockedNavItems: {
        catalog: false,
        insights: false,
        work: false,
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
      showAutomationsPage: false,
      showAnalysisPage: true,
      showPerformanceCompareToggle: false,
      showPerformanceTimelineCard: false,
      showLogsViewToggle: false,
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
      customShowRightRailCards: false,
      customShowOverviewTaskTabs: true,
      customShowAutomationsPage: false,
      customShowAnalysisPage: true,
      customShowPerformanceCompareToggle: false,
      customShowPerformanceTimelineCard: false,
      customShowLogsViewToggle: false,
      customShowHeartbeatRibbons: true,
      senaEngineParameters: defaultSenaEngineParameters,
      overviewStaleUpdateReminderSnoozeUntil: '2026-04-05T17:00:00.000Z',
      onboardingCompletedAt: null,
      seenUnlockedNavItems: {
        catalog: false,
        insights: false,
        work: false,
      },
      workbenchTileOrderByLane: {},
    });
  });

  it('ignores undefined preference patch values instead of resetting stored preferences', async () => {
    const userDataPath = await mkdtemp(join(tmpdir(), 'kaur-khor-preferences-'));
    const { loadDesktopPreferences, saveDesktopPreferences } = await loadPreferencesModule();

    await saveDesktopPreferences(userDataPath, {
      currency: 'KHR',
      language: 'km',
      showAutomationsPage: true,
      usdToKhrExchangeRate: 4100,
    });

    await expect(saveDesktopPreferences(userDataPath, {
      currency: undefined,
      language: undefined,
      showAutomationsPage: undefined,
      usdToKhrExchangeRate: undefined,
    } as Partial<Parameters<typeof saveDesktopPreferences>[1]>)).resolves.toMatchObject({
      currency: 'KHR',
      language: 'km',
      showAutomationsPage: true,
      usdToKhrExchangeRate: 4100,
    });

    await expect(loadDesktopPreferences(userDataPath)).resolves.toMatchObject({
      currency: 'KHR',
      language: 'km',
      showAutomationsPage: true,
      usdToKhrExchangeRate: 4100,
    });
  });

  it('ignores malformed preference save payloads instead of throwing', async () => {
    const userDataPath = await mkdtemp(join(tmpdir(), 'kaur-khor-preferences-'));
    const { loadDesktopPreferences, saveDesktopPreferences } = await loadPreferencesModule();

    await saveDesktopPreferences(userDataPath, {
      currency: 'KHR',
      language: 'km',
      usdToKhrExchangeRate: 4100,
    });

    await expect(saveDesktopPreferences(userDataPath, null as never)).resolves.toMatchObject({
      currency: 'KHR',
      language: 'km',
      usdToKhrExchangeRate: 4100,
    });
    await expect(saveDesktopPreferences(userDataPath, ['dirty'] as never)).resolves.toMatchObject({
      currency: 'KHR',
      language: 'km',
      usdToKhrExchangeRate: 4100,
    });

    await expect(loadDesktopPreferences(userDataPath)).resolves.toMatchObject({
      currency: 'KHR',
      language: 'km',
      usdToKhrExchangeRate: 4100,
    });
  });

  it('derives interface view presets from stored visibility combinations', async () => {
    const userDataPath = await mkdtemp(join(tmpdir(), 'kaur-khor-preferences-'));
    const preferencesPath = join(userDataPath, 'desktop-preferences.json');
    const { loadDesktopPreferences } = await loadPreferencesModule();

    await writeFile(preferencesPath, JSON.stringify({
      displayViewMode: 'compact',
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
    }));
    await expect(loadDesktopPreferences(userDataPath)).resolves.toMatchObject({
      displayViewMode: 'minimal',
    });

    await writeFile(preferencesPath, JSON.stringify({
      displayViewMode: 'custom',
      showExplanatoryTooltips: true,
      showFloatingTitleActions: true,
      showRightRailCards: false,
      showOverviewTaskTabs: true,
      showAutomationsPage: false,
      showAnalysisPage: false,
      showPerformanceCompareToggle: false,
      showPerformanceTimelineCard: false,
      showLogsViewToggle: false,
      showHeartbeatRibbons: true,
    }));
    await expect(loadDesktopPreferences(userDataPath)).resolves.toMatchObject({
      displayViewMode: 'custom',
    });

    await writeFile(preferencesPath, JSON.stringify({
      displayViewMode: 'custom',
      showExplanatoryTooltips: true,
      showFloatingTitleActions: false,
      showRightRailCards: false,
      showOverviewTaskTabs: false,
      showAutomationsPage: false,
      showAnalysisPage: false,
      showPerformanceCompareToggle: false,
      showPerformanceTimelineCard: false,
      showLogsViewToggle: false,
      showHeartbeatRibbons: false,
    }));
    await expect(loadDesktopPreferences(userDataPath)).resolves.toMatchObject({
      displayViewMode: 'custom',
    });
  });

  it('serializes concurrent preference writes so later updates merge correctly', async () => {
    const userDataPath = await mkdtemp(join(tmpdir(), 'kaur-khor-preferences-'));
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

    expect(releaseFirstWrite).not.toBeNull();
    releaseFirstWrite!();

    await expect(firstSave).resolves.toEqual({
      language: 'km',
      currency: 'USD',
      usdToKhrExchangeRate: 4000,
      displayViewMode: 'default',
      itemImageMode: 'small',
      dimChartsWhileLoading: false,
      showExplanatoryTooltips: true,
      showFloatingTitleActions: true,
      showRightRailCards: false,
      showOverviewTaskTabs: true,
      showAutomationsPage: false,
      showAnalysisPage: true,
      showPerformanceCompareToggle: false,
      showPerformanceTimelineCard: false,
      showLogsViewToggle: false,
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
      customShowRightRailCards: false,
      customShowOverviewTaskTabs: true,
      customShowAutomationsPage: false,
      customShowAnalysisPage: true,
      customShowPerformanceCompareToggle: false,
      customShowPerformanceTimelineCard: false,
      customShowLogsViewToggle: false,
      customShowHeartbeatRibbons: true,
      senaEngineParameters: defaultSenaEngineParameters,
      overviewStaleUpdateReminderSnoozeUntil: null,
      onboardingCompletedAt: null,
      seenUnlockedNavItems: {
        catalog: false,
        insights: false,
        work: false,
      },
      workbenchTileOrderByLane: {},
    });
    await expect(secondSave).resolves.toEqual({
      language: 'km',
      currency: 'KHR',
      usdToKhrExchangeRate: 4000,
      displayViewMode: 'default',
      itemImageMode: 'small',
      dimChartsWhileLoading: false,
      showExplanatoryTooltips: true,
      showFloatingTitleActions: true,
      showRightRailCards: false,
      showOverviewTaskTabs: true,
      showAutomationsPage: false,
      showAnalysisPage: true,
      showPerformanceCompareToggle: false,
      showPerformanceTimelineCard: false,
      showLogsViewToggle: false,
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
      customShowRightRailCards: false,
      customShowOverviewTaskTabs: true,
      customShowAutomationsPage: false,
      customShowAnalysisPage: true,
      customShowPerformanceCompareToggle: false,
      customShowPerformanceTimelineCard: false,
      customShowLogsViewToggle: false,
      customShowHeartbeatRibbons: true,
      senaEngineParameters: defaultSenaEngineParameters,
      overviewStaleUpdateReminderSnoozeUntil: null,
      onboardingCompletedAt: null,
      seenUnlockedNavItems: {
        catalog: false,
        insights: false,
        work: false,
      },
      workbenchTileOrderByLane: {},
    });
    await expect(loadDesktopPreferences(userDataPath)).resolves.toEqual({
      language: 'km',
      currency: 'KHR',
      usdToKhrExchangeRate: 4000,
      displayViewMode: 'default',
      itemImageMode: 'small',
      dimChartsWhileLoading: false,
      showExplanatoryTooltips: true,
      showFloatingTitleActions: true,
      showRightRailCards: false,
      showOverviewTaskTabs: true,
      showAutomationsPage: false,
      showAnalysisPage: true,
      showPerformanceCompareToggle: false,
      showPerformanceTimelineCard: false,
      showLogsViewToggle: false,
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
      customShowRightRailCards: false,
      customShowOverviewTaskTabs: true,
      customShowAutomationsPage: false,
      customShowAnalysisPage: true,
      customShowPerformanceCompareToggle: false,
      customShowPerformanceTimelineCard: false,
      customShowLogsViewToggle: false,
      customShowHeartbeatRibbons: true,
      senaEngineParameters: defaultSenaEngineParameters,
      overviewStaleUpdateReminderSnoozeUntil: null,
      onboardingCompletedAt: null,
      seenUnlockedNavItems: {
        catalog: false,
        insights: false,
        work: false,
      },
      workbenchTileOrderByLane: {},
    });
  });

  it('normalizes invalid exchange rates back to the default', async () => {
    const userDataPath = await mkdtemp(join(tmpdir(), 'kaur-khor-preferences-'));
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

  it('rejects impossible stored preference timestamps', async () => {
    const userDataPath = await mkdtemp(join(tmpdir(), 'kaur-khor-preferences-'));
    const { loadDesktopPreferences } = await loadPreferencesModule();

    await writeFile(
      join(userDataPath, 'desktop-preferences.json'),
      JSON.stringify({
        overviewStaleUpdateReminderSnoozeUntil: '2026-02-30T00:00:00.000Z',
        onboardingCompletedAt: '2026-04-31T00:00:00.000Z',
      }),
      'utf8',
    );

    await expect(loadDesktopPreferences(userDataPath)).resolves.toEqual(expect.objectContaining({
      overviewStaleUpdateReminderSnoozeUntil: null,
      onboardingCompletedAt: null,
    }));
  });

  it('normalizes dirty boolean preference values back to booleans', async () => {
    const userDataPath = await mkdtemp(join(tmpdir(), 'kaur-khor-preferences-'));
    const { loadDesktopPreferences, saveDesktopPreferences } = await loadPreferencesModule();

    await writeFile(
      join(userDataPath, 'desktop-preferences.json'),
      JSON.stringify({
        dimChartsWhileLoading: 'yes',
        showExplanatoryTooltips: 'false',
        showFloatingTitleActions: 0,
        showRightRailCards: false,
        customShowRightRailCards: 'true',
        seenUnlockedNavItems: {
          catalog: 'yes',
          insights: true,
          work: 1,
        },
        senaEngineParameters: {
          ...defaultSenaEngineParameters,
          smoothingEnabled: 'yes',
        },
      }),
      'utf8',
    );

    await expect(loadDesktopPreferences(userDataPath)).resolves.toEqual(expect.objectContaining({
      dimChartsWhileLoading: false,
      showExplanatoryTooltips: true,
      showFloatingTitleActions: true,
      showRightRailCards: false,
      customShowRightRailCards: false,
      seenUnlockedNavItems: {
        catalog: false,
        insights: true,
        work: false,
      },
      senaEngineParameters: defaultSenaEngineParameters,
    }));

    await expect(saveDesktopPreferences(userDataPath, { dimChartsWhileLoading: 'yes' as never })).resolves.toEqual(
      expect.objectContaining({ dimChartsWhileLoading: false }),
    );
  });

  it('round-trips and normalizes workbench tile order by lane', async () => {
    const userDataPath = await mkdtemp(join(tmpdir(), 'kaur-khor-preferences-'));
    const { loadDesktopPreferences, saveDesktopPreferences } = await loadPreferencesModule();
    const oversizedOrder = Array.from({ length: 525 }, (_, index) => `supplier-order:sku-${index}`);
    const expectedCappedSupplierOrder = [
      'supplier-order:sku-2',
      'supplier-order:sku-1',
      'supplier-order:sku-0',
      ...Array.from({ length: 497 }, (_, index) => `supplier-order:sku-${index + 3}`),
    ];

    await expect(
      saveDesktopPreferences(userDataPath, {
        workbenchTileOrderByLane: {
          'stock-count': ['stock:sku-2', 'stock:sku-1'],
          'supplier-order-pending': ['supplier-order:sku-2', 'supplier-order:sku-1', ...oversizedOrder],
          'supplier-receipt': ['supplier-receipt:sku-2', 'supplier-receipt:sku-1'],
          'customer-order-pending': ['retail:sku-1', '', 'retail:sku-1', 'service:service-1'],
          'customer-order-completed': ['retail:sku-2'],
        },
      }),
    ).resolves.toEqual(
      expect.objectContaining({
        workbenchTileOrderByLane: {
          'stock-count': ['stock:sku-2', 'stock:sku-1'],
          'supplier-order-pending': expectedCappedSupplierOrder,
          'supplier-receipt': ['supplier-receipt:sku-2', 'supplier-receipt:sku-1'],
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
          'supplier-receipt': ['supplier-receipt:sku-3', '', 'supplier-receipt:sku-3'],
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
          'supplier-receipt': ['supplier-receipt:sku-3'],
          'customer-order-pending': ['retail:sku-2'],
        },
      }),
    );
  });

  it('treats existing preference files without onboarding metadata as already onboarded', async () => {
    const userDataPath = await mkdtemp(join(tmpdir(), 'kaur-khor-preferences-'));
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
      insights: true,
      work: true,
    });
  });
});
