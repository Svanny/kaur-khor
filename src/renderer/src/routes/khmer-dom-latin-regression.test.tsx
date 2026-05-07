import { useEffect, type ReactNode } from 'react';
import { cleanup, render } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import type { AutomationOrderIntake } from '@shared/automation';
import { DEFAULT_SENA_ENGINE_PARAMETERS } from '@shared/ipc';
import { InterfaceViewModeCards } from '@/components/system/interface-view-cards';
import { TypedConfirmDialog } from '@/components/system/typed-confirm-dialog';
import { useDiscardChangesConfirm } from '@/hooks/use-route-leave-confirm';
import { getTranslation, translateUiLiteral } from '@/lib/translations';
import { CommandHomeRoute } from './command-home';
import { AutomationConnectionCard } from './automations/connection-card';
import { AutomationIntakeDrawer } from './automations/intake-drawer';
import { FinancialsRoute } from './financials';
import { InsightsRoute } from './insights';
import { PerformanceRoute } from './performance';
import { SettingsRoute } from './settings';
import { WorkRoute } from './work';

const inventoryHook = vi.fn();
const automationHook = vi.fn();
const preferencesHook = vi.fn();

vi.mock('@/state/inventory', () => ({
  useInventory: () => inventoryHook(),
  useInventoryActions: () => ({
    loadSenaOrderBatches: inventoryHook().loadSenaOrderBatches,
    loadSenaSkuDetail: inventoryHook().loadSenaSkuDetail,
  }),
  useInventoryState: () => inventoryHook(),
}));

vi.mock('@/state/automation', () => ({
  useAutomation: () => automationHook(),
  useOptionalAutomation: () => automationHook(),
}));

vi.mock('@/state/preferences', () => ({
  PreferencesProvider: ({ children }: { children: ReactNode }) => children,
  usePreferences: () => preferencesHook(),
}));

vi.mock('@/lib/page-state-memory', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/page-state-memory')>();
  return {
    ...actual,
    buildRememberedAnalysisHref: () => '/insights/explain',
    buildRememberedFinancialsHref: () => '/insights/money',
    buildRememberedInboxHref: () => '/work/queue',
    buildRememberedInsightsHref: () => '/insights',
    buildRememberedPerformanceHref: () => '/insights/pressure',
    usePageStateMemoryVersion: () => undefined,
  };
});

const allowedLatinTokens = [
  'Telegram',
  'SKU',
  'SKUs',
  'SENA',
  'USD',
  'KHR',
  '1D',
  '7D',
  '30D',
  '90D',
  'YTD',
  '1Y',
  'MAX',
];
const scannedAttributeNames = ['aria-label', 'placeholder', 'title', 'alt'];
const latinPattern = /[A-Za-z]/;

function stripAllowedLatinTokens(value: string) {
  return allowedLatinTokens.reduce(
    (nextValue, token) => nextValue.replace(new RegExp(`\\b${token}\\b`, 'g'), ''),
    value,
  );
}

function collectLatinDomLeaks(root: ParentNode): string[] {
  const leaks: string[] = [];
  const textWalker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);

  while (textWalker.nextNode()) {
    const text = textWalker.currentNode.textContent?.replace(/\s+/g, ' ').trim() ?? '';
    if (text && latinPattern.test(stripAllowedLatinTokens(text))) {
      leaks.push(`text:${text}`);
    }
  }

  for (const element of Array.from(root.querySelectorAll<HTMLElement>('*'))) {
    for (const attributeName of scannedAttributeNames) {
      const value = element.getAttribute(attributeName)?.replace(/\s+/g, ' ').trim();
      if (value && latinPattern.test(stripAllowedLatinTokens(value))) {
        leaks.push(`${attributeName}:${value}`);
      }
    }
  }

  return leaks;
}

function expectKhmerDomHasNoLatin(root: ParentNode) {
  expect(collectLatinDomLeaks(root)).toEqual([]);
}

function OpenDiscardChangesPopup() {
  const { discardConfirmDialog, requestDiscard } = useDiscardChangesConfirm({
    enabled: true,
    description: getTranslation('km', 'skuEditorUnsavedLeavePrompt' as never),
    onDiscard: vi.fn(),
    onSave: () => false,
  });

  useEffect(() => {
    requestDiscard(vi.fn());
  }, [requestDiscard]);

  return discardConfirmDialog;
}

function makePreferences() {
  return {
    currency: 'KHR',
    dimChartsWhileLoading: false,
    displayViewMode: 'maximal',
    hasPendingChanges: false,
    isHydrated: true,
    itemImageMode: 'small',
    language: 'km',
    persistedSenaEngineParameters: DEFAULT_SENA_ENGINE_PARAMETERS,
    senaEngineParameters: DEFAULT_SENA_ENGINE_PARAMETERS,
    showAnalysisPage: true,
    showAutomationsPage: true,
    showExplanatoryTooltips: true,
    showFloatingTitleActions: true,
    showHeartbeatRibbons: true,
    showLogsViewToggle: true,
    showOverviewTaskTabs: true,
    showPerformanceCompareToggle: true,
    showPerformanceTimelineCard: true,
    showRightRailCards: true,
    usdToKhrExchangeRate: 4000,
    applySenaEngineParameters: vi.fn(),
    resetPreferences: vi.fn(),
    savePreferences: vi.fn(),
    setCurrency: vi.fn(),
    setDimChartsWhileLoading: vi.fn(),
    setDisplayViewMode: vi.fn(),
    setItemImageMode: vi.fn(),
    setLanguage: vi.fn(),
    setSenaEngineParameters: vi.fn(),
    setShowAnalysisPage: vi.fn(),
    setShowAutomationsPage: vi.fn(),
    setShowExplanatoryTooltips: vi.fn(),
    setShowFloatingTitleActions: vi.fn(),
    setShowHeartbeatRibbons: vi.fn(),
    setShowLogsViewToggle: vi.fn(),
    setShowOverviewTaskTabs: vi.fn(),
    setShowPerformanceCompareToggle: vi.fn(),
    setShowPerformanceTimelineCard: vi.fn(),
    setShowRightRailCards: vi.fn(),
    setTaskBatchUpdatePreference: vi.fn(),
    setUsdToKhrExchangeRate: vi.fn(),
    t: (
      key: Parameters<typeof getTranslation>[1],
      variables?: Parameters<typeof getTranslation>[2],
    ) => getTranslation('km', key, variables),
    taskBatchUpdatePreferences: {
      batchUpdate: 'ask',
      followUp: 'ask',
      logOrder: 'ask',
      receive: 'ask',
      review: 'ask',
      updateEta: 'ask',
    },
  };
}

function makeInventoryState() {
  const catalog = {
    bundles: [],
    schemaVersion: 1,
    services: [
      {
        archived: false,
        bundle: false,
        description: 'សេវាពណ៌សក់',
        imagePath: null,
        name: 'លាបពណ៌សក់',
        price: 42,
        serviceId: 'service-color',
      },
    ],
    sharingMask: [
      { enabled: true, serviceId: 'service-color', skuId: 'sku-shampoo', usageProbability: 1 },
    ],
    skus: [
      {
        archived: false,
        costPerUnit: 5,
        description: 'សាប៊ូសម្រាប់លក់ និងសេវា',
        imagePath: null,
        leadTimeMeanDaysHint: 4,
        leadTimeStdDaysHint: 1,
        name: 'សាប៊ូ',
        productPrice: 20,
        skuId: 'sku-shampoo',
        soldAsProduct: true,
        supplierName: 'អ្នកផ្គត់ផ្គង់',
      },
      {
        archived: false,
        costPerUnit: 4,
        description: 'ទំនិញយឺត',
        imagePath: null,
        leadTimeMeanDaysHint: 3,
        leadTimeStdDaysHint: 1,
        name: 'ប្រេងក្រអូប',
        productPrice: 12,
        skuId: 'sku-dormant',
        soldAsProduct: true,
        supplierName: 'អ្នកផ្គត់ផ្គង់',
      },
    ],
  };
  const workspaceSummary = {
    highRiskSkuIds: [],
    intervalCount: 2,
    latestObservedAt: '2026-04-16T08:00:00.000Z',
    ownerSub: 'desktop-owner',
    pendingReorderCount: 0,
    runId: 'run-1',
    serviceCount: 1,
    skuCount: 1,
    skuSummaries: [
      {
        credibleIntervalHigh: 18,
        credibleIntervalLow: 12,
        daysOfCover: 8,
        demandPerDayMean: 2,
        expectedLeadTimeDemand: 8,
        latestPosteriorUnits: 16,
        leadTimeMeanDays: 4,
        leadTimeStdDays: 1,
        reorderPoint: 6,
        reorderTriggerProbability: 0.2,
        regimeProbabilities: { normal: 1 },
        safetyStock: 3,
        skuId: 'sku-shampoo',
        stockoutRisk: 0.12,
      },
      {
        credibleIntervalHigh: 25,
        credibleIntervalLow: 15,
        daysOfCover: 90,
        demandPerDayMean: 0,
        expectedLeadTimeDemand: 0,
        latestPosteriorUnits: 20,
        leadTimeMeanDays: 3,
        leadTimeStdDays: 1,
        reorderPoint: 4,
        reorderTriggerProbability: 0,
        regimeProbabilities: { normal: 1 },
        safetyStock: 2,
        skuId: 'sku-dormant',
        stockoutRisk: 0,
      },
    ],
    topRegime: 'normal',
  };
  const observations = [
    {
      input: {
        adjustmentSignals: [{ quantityDelta: -1, reason: 'ខូចខាត', skuId: 'sku-shampoo' }],
        leadTimeHints: [],
        notes: null,
        observedAt: '2026-04-16T08:00:00.000Z',
        orderSignals: [],
        recipeUsageHints: [],
        retailPrices: [{ price: 18, skuId: 'sku-shampoo' }],
        retailRankings: ['sku-shampoo'],
        retailSalesSnapshot: [{ skuId: 'sku-shampoo', unitsSold: 3 }],
        retailStockouts: [],
        servicePrices: [],
        serviceRankings: ['service-color'],
        serviceSalesSnapshot: [{ serviceId: 'service-color', unitsSold: 2 }],
        serviceStockouts: [],
        stockSnapshot: [{ costPerUnit: 6, productPrice: 18, skuId: 'sku-shampoo', unitsInStock: 16 }],
      },
      observationId: 'obs-1',
      ownerSub: 'desktop-owner',
    },
  ];

  return {
    catalog,
    diagnostics: {
      changePointProbability: 0.1,
      coverageEstimate: 0.9,
      effectiveSampleSizeMean: 40,
      posteriorPredictiveErrorMean: 0.1,
      regimeHistory: [],
      resamplingCount: 2,
      seasonalityActive: false,
      smoothingEnabled: true,
    },
    isLoading: false,
    isPreparingWorkspace: false,
    latestRun: { observationCount: 1 },
    loadSenaOrderBatches: vi.fn(),
    loadSenaServiceDetail: vi.fn(),
    loadSenaSkuDetail: vi.fn(),
    observations,
    orderBatches: [
      {
        batchOrderId: 'batch-1',
        children: [
          {
            childOrderId: 'child-1',
            createdAt: '2026-04-15T08:00:00.000Z',
            effective: {
              costPerUnit: 5,
              expectedArrivalAt: '2026-04-18T08:00:00.000Z',
              leadTimeDaysHint: null,
              leadTimeVariability: null,
              orderedQuantity: 10,
              placementTimestamp: '2026-04-15T08:00:00.000Z',
              receivedQuantity: 0,
              receiptTimestamp: null,
              supplierName: 'អ្នកផ្គត់ផ្គង់',
              supplierNote: null,
            },
            inheritedFromBatch: true,
            overrides: {},
            skuId: 'sku-shampoo',
            status: 'awaiting_receipt',
            updatedAt: '2026-04-15T08:00:00.000Z',
          },
        ],
        createdAt: '2026-04-15T08:00:00.000Z',
        ownerSub: 'desktop-owner',
        shared: {
          costPerUnit: 5,
          expectedArrivalAt: '2026-04-18T08:00:00.000Z',
          leadTimeDaysHint: null,
          leadTimeVariability: null,
          orderedQuantity: 10,
          placementTimestamp: '2026-04-15T08:00:00.000Z',
          receivedQuantity: 0,
          receiptTimestamp: null,
          supplierName: 'អ្នកផ្គត់ផ្គង់',
          supplierNote: null,
        },
        status: 'awaiting_receipt',
        supplierName: 'អ្នកផ្គត់ផ្គង់',
        updatedAt: '2026-04-15T08:00:00.000Z',
      },
    ],
    reload: vi.fn(),
    retrySenaRun: vi.fn(),
    workspaceSummary,
  };
}

function makeIntake(): AutomationOrderIntake {
  return {
    channel: 'telegram',
    conversationId: 'conversation-1',
    createdAt: '2026-04-21T00:00:00.000Z',
    customerDisplayName: 'ដារ៉ា',
    customerHandle: null,
    intakeId: 'intake-1',
    lines: [
      {
        ambiguityReason: null,
        entityId: 'sku-1',
        entityType: 'sku',
        lineId: 'line-1',
        lineTotal: 12,
        quantity: 2,
        requestedLabel: 'សាប៊ូ',
        resolvedLabel: 'សាប៊ូ',
        unitPrice: 6,
      },
    ],
    notes: null,
    parseConfidence: 'high',
    phone: null,
    promotedTicketId: null,
    quotedSubtotal: 12,
    quotedTotal: 12,
    rawText: 'សាប៊ូ ២',
    status: 'quoted',
    updatedAt: '2026-04-21T00:00:00.000Z',
  };
}

describe('Khmer DOM Latin guardrail', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'kaurKhorDesktop', {
      configurable: true,
      value: {
        benchmark: {
          availability: vi.fn().mockResolvedValue({ available: false, reason: 'test' }),
          cancelRun: vi.fn(),
          compareRuns: vi.fn(),
          listRuns: vi.fn().mockResolvedValue([]),
          onRunEvent: vi.fn(() => vi.fn()),
          readRun: vi.fn(),
          revealRun: vi.fn(),
          startRun: vi.fn(),
        },
        sena: {
          triggerRun: vi.fn(),
        },
        system: {
          clearCurrentData: vi.fn(),
          createBackupSnapshot: vi.fn(),
          getLocalDataInfo: vi.fn().mockResolvedValue({
            backupDirectoryPath: '/tmp/kaur-khor/backups',
            dataDirectoryPath: '/tmp/kaur-khor',
            preferencesPath: '/tmp/kaur-khor/preferences.json',
            workspaceStorePath: '/tmp/kaur-khor/workspace.json',
          }),
          revealPath: vi.fn(),
          restoreBackupSnapshot: vi.fn(),
        },
      },
    });
    preferencesHook.mockReturnValue(makePreferences());
    inventoryHook.mockReturnValue(makeInventoryState());
    automationHook.mockReturnValue({
      connection: null,
      conversations: [],
      error: null,
      exposures: [],
      intakes: [],
      isLoading: false,
      isSaving: false,
      listIntakes: vi.fn(),
      loadWorkspace: vi.fn(),
      metrics: null,
      patchExposureRow: vi.fn(),
      readConversation: vi.fn(),
      reload: vi.fn(),
      saveConnection: vi.fn(),
    });
  });

  afterEach(() => {
    cleanup();
  });

  test('keeps representative Khmer DOM surfaces free of Latin text and labels', () => {
    const surfaces: Array<{ name: string; renderSurface: () => ParentNode }> = [
      {
        name: 'command home',
        renderSurface: () => render(
          <MemoryRouter initialEntries={['/']}>
            <CommandHomeRoute />
          </MemoryRouter>,
        ).baseElement,
      },
      {
        name: 'interface view cards',
        renderSurface: () => render(
          <InterfaceViewModeCards
            displayViewMode="default"
            language="km"
            modes={['default', 'minimal', 'maximal', 'custom']}
            onDisplayViewModeChange={vi.fn()}
          />,
        ).baseElement,
      },
      {
        name: 'work hub',
        renderSurface: () => render(
          <MemoryRouter initialEntries={['/work']}>
            <Routes>
              <Route element={<WorkRoute />} path="/work/*" />
            </Routes>
          </MemoryRouter>,
        ).baseElement,
      },
      {
        name: 'insights hub',
        renderSurface: () => render(
          <MemoryRouter initialEntries={['/insights']}>
            <Routes>
              <Route element={<InsightsRoute />} path="/insights/*" />
            </Routes>
          </MemoryRouter>,
        ).baseElement,
      },
      {
        name: 'financials route',
        renderSurface: () => render(
          <MemoryRouter initialEntries={['/insights/money']}>
            <Routes>
              <Route element={<div>ទំព័រដើម</div>} path="/" />
              <Route element={<FinancialsRoute />} path="/insights/money" />
            </Routes>
          </MemoryRouter>,
        ).baseElement,
      },
      {
        name: 'performance route',
        renderSurface: () => render(
          <MemoryRouter initialEntries={['/insights/pressure']}>
            <Routes>
              <Route element={<div>ទំព័រដើម</div>} path="/" />
              <Route element={<PerformanceRoute />} path="/insights/pressure" />
            </Routes>
          </MemoryRouter>,
        ).baseElement,
      },
      {
        name: 'settings interface page',
        renderSurface: () => render(
          <MemoryRouter initialEntries={['/settings/interface']}>
            <Routes>
              <Route element={<SettingsRoute />} path="/settings/*" />
            </Routes>
          </MemoryRouter>,
        ).baseElement,
      },
      {
        name: 'automation connection card',
        renderSurface: () => render(
          <AutomationConnectionCard
            botDisplayName=""
            botToken=""
            botUsername=""
            connection={null}
            externalLink=""
            isSaving={false}
            language="km"
            onBotDisplayNameChange={vi.fn()}
            onBotTokenChange={vi.fn()}
            onBotUsernameChange={vi.fn()}
            onExternalLinkChange={vi.fn()}
            onSave={vi.fn()}
          />,
        ).baseElement,
      },
      {
        name: 'automation intake drawer',
        renderSurface: () => render(
          <AutomationIntakeDrawer
            intake={makeIntake()}
            isSaving={false}
            language="km"
            open
            onClose={vi.fn()}
            onPromote={vi.fn()}
            onResolve={vi.fn()}
          />,
        ).baseElement,
      },
      {
        name: 'unsaved changes popup',
        renderSurface: () => render(<OpenDiscardChangesPopup />).baseElement,
      },
      {
        name: 'typed confirmation popup',
        renderSurface: () => render(
          <TypedConfirmDialog
            cancelLabel={getTranslation('km', 'settingsClearCurrentDataCancel' as never)}
            confirmLabel={getTranslation('km', 'settingsClearCurrentDataAction' as never)}
            confirmationToken="លុបទិន្នន័យ"
            inputLabel={translateUiLiteral('km', 'Deletion confirmation token')}
            open
            title={getTranslation('km', 'settingsClearCurrentDataTitle' as never)}
            value=""
            onCancel={vi.fn()}
            onConfirm={vi.fn()}
            onValueChange={vi.fn()}
          />,
        ).baseElement,
      },
    ];

    for (const surface of surfaces) {
      cleanup();
      const root = surface.renderSurface();
      try {
        expectKhmerDomHasNoLatin(root);
      } catch (error) {
        throw new Error(`${surface.name} leaked Latin text:\n${collectLatinDomLeaks(root).join('\n')}`, {
          cause: error,
        });
      }
    }
  });
});
