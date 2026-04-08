import { DEFAULT_SENA_ENGINE_PARAMETERS } from '@shared/ipc';
import type {
  DesktopAppContext,
  DesktopBridge,
  DesktopLocalDataInfo,
  DesktopPreferences,
  SenaRunLookupPayload,
  SenaServiceLookupPayload,
  SenaSkuLookupPayload,
  SenaTriggerRunPayload,
} from '@shared/ipc';
import type {
  InventorySnapshot,
  StockReport,
  StockReportSubmission,
} from '@shared/inventory';
import {
  SENA_SCHEMA_VERSION,
  type SenaAnalysisRunRecord,
  type SenaCatalog,
  type SenaDiagnostics,
  type SenaObservationInput,
  type SenaObservationRecord,
  type SenaServiceDetail,
  type SenaSkuDetail,
  type SenaWorkspaceSummary,
} from '@shared/sena';

const MOCK_OWNER_SUB = 'browser-owner';
const MOCK_RUN_ID = 'browser-run-1';

function clone<T>(value: T): T {
  return structuredClone(value);
}

function nowIso() {
  return new Date().toISOString();
}

const mockCatalog: SenaCatalog = {
  schemaVersion: SENA_SCHEMA_VERSION,
  skus: [
    {
      skuId: 'sku-1',
      name: 'Rattan Market Tote',
      description: 'Woven tote for market edits and family promos.',
      costPerUnit: 18,
      soldAsProduct: true,
      productPrice: 42,
      leadTimeMeanDaysHint: 5,
      leadTimeStdDaysHint: 1,
    },
    {
      skuId: 'sku-2',
      name: "Children's Krama Set",
      description: 'Giftable woven set for tourist pairings.',
      costPerUnit: 12,
      soldAsProduct: true,
      productPrice: 28,
      leadTimeMeanDaysHint: 6,
      leadTimeStdDaysHint: 2,
    },
    {
      skuId: 'sku-3',
      name: 'Krama Cotton Scarf',
      description: 'Soft scarf used across Khmer New Year edits.',
      costPerUnit: 10,
      soldAsProduct: true,
      productPrice: 24,
      leadTimeMeanDaysHint: 4,
      leadTimeStdDaysHint: 1,
    },
    {
      skuId: 'sku-4',
      name: 'Handwoven Belt',
      description: 'Fast-turn belt tied to blouse styling offers.',
      costPerUnit: 9,
      soldAsProduct: true,
      productPrice: 22,
      leadTimeMeanDaysHint: 3,
      leadTimeStdDaysHint: 1,
    },
    {
      skuId: 'sku-5',
      name: 'Premium Wedding Sampot',
      description: 'Ceremony fabric with a tight supply window.',
      costPerUnit: 26,
      soldAsProduct: true,
      productPrice: 58,
      leadTimeMeanDaysHint: 8,
      leadTimeStdDaysHint: 3,
    },
  ],
  services: [
    {
      serviceId: 'service-1',
      name: 'Market Tote Add-On',
      description: 'Upsell set for woven accessories.',
      price: 18,
      bundle: false,
    },
    {
      serviceId: 'service-2',
      name: 'Back-to-School Family Promo',
      description: 'Multi-item family capsule.',
      price: 35,
      bundle: false,
    },
    {
      serviceId: 'service-3',
      name: 'Tourist Gift Pairing',
      description: 'Giftable souvenir pairing.',
      price: 16,
      bundle: false,
    },
    {
      serviceId: 'service-4',
      name: 'Khmer New Year Capsule',
      description: 'Seasonal editorial assortment.',
      price: 40,
      bundle: false,
    },
    {
      serviceId: 'service-5',
      name: 'Office Blouse Styling',
      description: 'Styling service dependent on matching accessories.',
      price: 14,
      bundle: false,
    },
    {
      serviceId: 'service-6',
      name: 'Wedding Premium Bundle',
      description: 'High-value ceremony package.',
      price: 72,
      bundle: false,
    },
    {
      serviceId: 'service-7',
      name: 'Pchum Ben Ceremony Set',
      description: 'Ceremonial packaged set.',
      price: 61,
      bundle: false,
    },
  ],
  bundles: [],
  sharingMask: [
    { serviceId: 'service-1', skuId: 'sku-1', enabled: true, usageProbability: 1 },
    { serviceId: 'service-2', skuId: 'sku-1', enabled: true, usageProbability: 1 },
    { serviceId: 'service-3', skuId: 'sku-2', enabled: true, usageProbability: 1 },
    { serviceId: 'service-2', skuId: 'sku-2', enabled: true, usageProbability: 1 },
    { serviceId: 'service-3', skuId: 'sku-3', enabled: true, usageProbability: 1 },
    { serviceId: 'service-4', skuId: 'sku-3', enabled: true, usageProbability: 1 },
    { serviceId: 'service-5', skuId: 'sku-4', enabled: true, usageProbability: 1 },
    { serviceId: 'service-1', skuId: 'sku-4', enabled: true, usageProbability: 1 },
    { serviceId: 'service-6', skuId: 'sku-5', enabled: true, usageProbability: 1 },
    { serviceId: 'service-7', skuId: 'sku-5', enabled: true, usageProbability: 1 },
  ],
};

const mockWorkspaceSummary: SenaWorkspaceSummary = {
  ownerSub: MOCK_OWNER_SUB,
  runId: MOCK_RUN_ID,
  latestObservedAt: '2025-03-30T15:00:00.000Z',
  skuCount: 5,
  serviceCount: 7,
  intervalCount: 4,
  pendingReorderCount: 1,
  topRegime: 'normal',
  highRiskSkuIds: ['sku-1', 'sku-2', 'sku-3'],
  skuSummaries: [
    {
      skuId: 'sku-1',
      latestPosteriorUnits: 8,
      credibleIntervalLow: 0,
      credibleIntervalHigh: 41,
      demandPerDayMean: 4,
      stockoutRisk: 0.83,
      daysOfCover: 2,
      expectedLeadTimeDemand: 14,
      safetyStock: 6,
      reorderPoint: 18,
      reorderTriggerProbability: 1,
      leadTimeMeanDays: 5,
      leadTimeStdDays: 1,
      regimeProbabilities: { normal: 0.6, promo: 0.4 },
    },
    {
      skuId: 'sku-2',
      latestPosteriorUnits: 11,
      credibleIntervalLow: 8,
      credibleIntervalHigh: 14,
      demandPerDayMean: 3,
      stockoutRisk: 0.74,
      daysOfCover: 3,
      expectedLeadTimeDemand: 12,
      safetyStock: 4,
      reorderPoint: 15,
      reorderTriggerProbability: 0.66,
      leadTimeMeanDays: 6,
      leadTimeStdDays: 2,
      regimeProbabilities: { normal: 0.55, spike: 0.45 },
    },
    {
      skuId: 'sku-3',
      latestPosteriorUnits: 12,
      credibleIntervalLow: 9,
      credibleIntervalHigh: 16,
      demandPerDayMean: 3,
      stockoutRisk: 0.69,
      daysOfCover: 2.8,
      expectedLeadTimeDemand: 9,
      safetyStock: 3,
      reorderPoint: 13,
      reorderTriggerProbability: 0.61,
      leadTimeMeanDays: 4,
      leadTimeStdDays: 1,
      regimeProbabilities: { normal: 0.7, promo: 0.3 },
    },
    {
      skuId: 'sku-4',
      latestPosteriorUnits: 15,
      credibleIntervalLow: 12,
      credibleIntervalHigh: 18,
      demandPerDayMean: 1,
      stockoutRisk: 0.22,
      daysOfCover: 7,
      expectedLeadTimeDemand: 5,
      safetyStock: 2,
      reorderPoint: 10,
      reorderTriggerProbability: 0.2,
      leadTimeMeanDays: 3,
      leadTimeStdDays: 1,
      regimeProbabilities: { normal: 1 },
    },
    {
      skuId: 'sku-5',
      latestPosteriorUnits: 19,
      credibleIntervalLow: 16,
      credibleIntervalHigh: 23,
      demandPerDayMean: 2,
      stockoutRisk: 0.31,
      daysOfCover: 6,
      expectedLeadTimeDemand: 10,
      safetyStock: 4,
      reorderPoint: 14,
      reorderTriggerProbability: 0.28,
      leadTimeMeanDays: 8,
      leadTimeStdDays: 3,
      regimeProbabilities: { normal: 0.65, correction: 0.35 },
    },
  ],
};

const mockObservations: SenaObservationRecord[] = [
  {
    observationId: 'obs-order-rattan',
    ownerSub: MOCK_OWNER_SUB,
    input: {
      observedAt: '2025-03-28T08:00:00.000Z',
      stockSnapshot: [],
      serviceRankings: [],
      retailRankings: [],
      serviceStockouts: [],
      retailStockouts: [],
      orderSignals: [
        {
          skuId: 'sku-1',
          orderPlaced: false,
          receiptArrived: false,
          approximateOrderQuantity: null,
          approximateReceiptQuantity: null,
        },
      ],
      servicePrices: [],
      retailPrices: [
        {
          skuId: 'sku-1',
          price: 38,
        },
      ],
      leadTimeHints: [],
      notes: 'Demand rose after a recent price move on Rattan Market Tote.',
    },
  },
  {
    observationId: 'obs-order-children',
    ownerSub: MOCK_OWNER_SUB,
    input: {
      observedAt: '2025-03-29T08:00:00.000Z',
      stockSnapshot: [],
      serviceRankings: [],
      retailRankings: [],
      serviceStockouts: [],
      retailStockouts: [],
      orderSignals: [
        {
          skuId: 'sku-2',
          orderPlaced: false,
          receiptArrived: false,
          approximateOrderQuantity: null,
          approximateReceiptQuantity: null,
        },
      ],
      servicePrices: [],
      retailPrices: [],
      leadTimeHints: [],
      notes: 'Expected window passed without a confirmed receipt.',
    },
  },
  {
    observationId: 'obs-order-scarf',
    ownerSub: MOCK_OWNER_SUB,
    input: {
      observedAt: '2025-03-30T08:00:00.000Z',
      stockSnapshot: [],
      serviceRankings: [],
      retailRankings: [],
      serviceStockouts: [],
      retailStockouts: [],
      orderSignals: [
        {
          skuId: 'sku-3',
          orderPlaced: false,
          receiptArrived: false,
          approximateOrderQuantity: null,
          approximateReceiptQuantity: null,
        },
      ],
      servicePrices: [],
      retailPrices: [],
      leadTimeHints: [],
      notes: 'Expected window passed without a confirmed receipt.',
    },
  },
  {
    observationId: 'obs-receive-belt',
    ownerSub: MOCK_OWNER_SUB,
    input: {
      observedAt: '2025-03-30T12:00:00.000Z',
      stockSnapshot: [],
      serviceRankings: [],
      retailRankings: [],
      serviceStockouts: [],
      retailStockouts: [],
      orderSignals: [
        {
          skuId: 'sku-4',
          orderPlaced: true,
          receiptArrived: false,
          approximateOrderQuantity: 24,
          approximateReceiptQuantity: null,
        },
      ],
      servicePrices: [],
      retailPrices: [],
      leadTimeHints: [],
      notes: 'Receipt window is open right now.',
    },
  },
  {
    observationId: 'obs-receipt-sampot',
    ownerSub: MOCK_OWNER_SUB,
    input: {
      observedAt: '2025-03-30T15:00:00.000Z',
      stockSnapshot: [
        {
          skuId: 'sku-5',
          unitsInStock: 19,
          costPerUnit: 26,
          productPrice: 58,
        },
      ],
      serviceRankings: [],
      retailRankings: [],
      serviceStockouts: [],
      retailStockouts: [],
      orderSignals: [
        {
          skuId: 'sku-5',
          orderPlaced: true,
          receiptArrived: false,
          approximateOrderQuantity: 44,
          approximateReceiptQuantity: null,
        },
      ],
      servicePrices: [],
      retailPrices: [],
      leadTimeHints: [
        {
          skuId: 'sku-5',
          typicalDays: 18,
          lowDays: 15,
          highDays: 21,
          variabilityClass: 'wide',
        },
      ],
      notes: 'Recent price signal Mar 30.',
    },
  },
];

const mockSkuDetails: Record<string, SenaSkuDetail> = {
  'sku-1': {
    summary: mockWorkspaceSummary.skuSummaries[0],
    inventoryPosterior: [],
    demandPosterior: [],
    pipelinePosterior: [],
    leadTimePosterior: [],
  },
  'sku-2': {
    summary: mockWorkspaceSummary.skuSummaries[1],
    inventoryPosterior: [],
    demandPosterior: [],
    pipelinePosterior: [],
    leadTimePosterior: [
      {
        intervalIndex: 2,
        logMeanDays: 0,
        logStdDays: 0,
        meanDays: 6,
        stdDays: 2,
        observedVariabilityClass: 'wide',
        observedRelativeWidth: 0.6,
      },
    ],
  },
  'sku-3': {
    summary: mockWorkspaceSummary.skuSummaries[2],
    inventoryPosterior: [],
    demandPosterior: [],
    pipelinePosterior: [],
    leadTimePosterior: [
      {
        intervalIndex: 2,
        logMeanDays: 0,
        logStdDays: 0,
        meanDays: 4,
        stdDays: 1,
        observedVariabilityClass: 'normal',
        observedRelativeWidth: 0.35,
      },
    ],
  },
  'sku-4': {
    summary: mockWorkspaceSummary.skuSummaries[3],
    inventoryPosterior: [],
    demandPosterior: [],
    pipelinePosterior: [
      {
        intervalIndex: 2,
        inTransitMean: 24,
        orderProbability: 0.92,
        orderQuantityMean: 24,
        receiptQuantityMean: 24,
        ageDaysMean: 4,
      },
    ],
    leadTimePosterior: [
      {
        intervalIndex: 2,
        logMeanDays: 0,
        logStdDays: 0,
        meanDays: 3,
        stdDays: 1,
        observedVariabilityClass: 'tight',
        observedRelativeWidth: 0.25,
      },
    ],
  },
  'sku-5': {
    summary: mockWorkspaceSummary.skuSummaries[4],
    inventoryPosterior: [],
    demandPosterior: [],
    pipelinePosterior: [
      {
        intervalIndex: 2,
        inTransitMean: 44,
        orderProbability: 0.86,
        orderQuantityMean: 44,
        receiptQuantityMean: 0,
        ageDaysMean: 2,
      },
    ],
    leadTimePosterior: [
      {
        intervalIndex: 2,
        logMeanDays: 0,
        logStdDays: 0,
        meanDays: 8,
        stdDays: 3,
        observedVariabilityClass: 'wide',
        observedRelativeWidth: 0.55,
      },
    ],
  },
};

const mockDiagnostics: SenaDiagnostics = {
  effectiveSampleSizeMean: 84,
  resamplingCount: 12,
  smoothingEnabled: true,
  changePointProbability: 0.22,
  seasonalityActive: false,
  posteriorPredictiveErrorMean: 0.18,
  coverageEstimate: 0.91,
  regimeHistory: [],
};

const mockInventorySnapshot: InventorySnapshot = {
  items: mockCatalog.skus.map((sku) => {
    const summary = mockWorkspaceSummary.skuSummaries.find((entry) => entry.skuId === sku.skuId);
    return {
      skuId: sku.skuId,
      name: sku.name,
      description: sku.description,
      unitsInStock: Math.max(0, Math.round(summary?.latestPosteriorUnits ?? 0)),
      costPerUnit: sku.costPerUnit,
      soldAsProduct: sku.soldAsProduct,
      productPrice: sku.productPrice,
      leadTimeMeanDays: sku.leadTimeMeanDaysHint,
      leadTimeStdDays: sku.leadTimeStdDaysHint,
    };
  }),
  services: mockCatalog.services.map((service) => ({
    serviceId: service.serviceId,
    name: service.name,
    description: service.description,
    price: service.price,
    skuIds: mockCatalog.sharingMask
      .filter((entry) => entry.enabled && entry.serviceId === service.serviceId)
      .map((entry) => entry.skuId),
  })),
  rankings: {
    topServiceIds: [],
    topRetailSkuIds: [],
  },
  lastReportAt: '2025-03-30T15:00:00.000Z',
};

const mockLocalDataInfo: DesktopLocalDataInfo = {
  dataDirectoryPath: '/tmp/banji-browser-mock',
  workspaceStorePath: '/tmp/banji-browser-mock/sena.sqlite',
  preferencesPath: '/tmp/banji-browser-mock/preferences.json',
  storageFormat: 'sqlite',
};

type BrowserMockState = {
  appContext: DesktopAppContext;
  catalog: SenaCatalog;
  diagnostics: SenaDiagnostics;
  inventorySnapshot: InventorySnapshot;
  latestRun: SenaAnalysisRunRecord;
  localDataInfo: DesktopLocalDataInfo;
  observations: SenaObservationRecord[];
  preferences: DesktopPreferences;
  reports: StockReport[];
  serviceDetails: Record<string, SenaServiceDetail>;
  skuDetails: Record<string, SenaSkuDetail>;
  workspaceSummary: SenaWorkspaceSummary;
};

function createMockState(): BrowserMockState {
  const serviceDetails = Object.fromEntries(
    mockCatalog.services.map((service) => [
      service.serviceId,
      {
        serviceId: service.serviceId,
        activityMean: 10,
        activityIntervalLow: 6,
        activityIntervalHigh: 14,
        bottleneckProbability: 0.2,
        contributors: mockCatalog.sharingMask
          .filter((entry) => entry.enabled && entry.serviceId === service.serviceId)
          .map((entry) => ({
            skuId: entry.skuId,
            usageProbability: entry.usageProbability ?? 1,
            bottleneckProbability: 0.25,
          })),
        regimeTimeline: [],
      },
    ]),
  ) as Record<string, SenaServiceDetail>;

  const latestRun: SenaAnalysisRunRecord = {
    runId: MOCK_RUN_ID,
    ownerSub: MOCK_OWNER_SUB,
    algorithmVersion: 'sena-analysis-v3',
    status: 'succeeded',
    observationCount: mockObservations.length,
    createdAt: '2025-03-30T15:05:00.000Z',
    completedAt: '2025-03-30T15:05:03.000Z',
    summary: clone(mockWorkspaceSummary),
    diagnostics: clone(mockDiagnostics),
    primaryArtifactKey: null,
    error: null,
  };

  return {
    appContext: {
      appVersion: 'browser-mock',
      platform: 'browser',
    },
    catalog: clone(mockCatalog),
    diagnostics: clone(mockDiagnostics),
    inventorySnapshot: clone(mockInventorySnapshot),
    latestRun,
    localDataInfo: clone(mockLocalDataInfo),
    observations: clone(mockObservations),
    preferences: {
      language: 'en',
      currency: 'USD',
      usdToKhrExchangeRate: 4000,
      showExplanatoryTooltips: true,
      showFloatingTitleActions: true,
      showRightRailCards: true,
      senaEngineParameters: DEFAULT_SENA_ENGINE_PARAMETERS,
      overviewStaleUpdateReminderSnoozeUntil: null,
    },
    reports: [],
    serviceDetails,
    skuDetails: clone(mockSkuDetails),
    workspaceSummary: clone(mockWorkspaceSummary),
  };
}

let browserMockState = createMockState();
let observationCounter = browserMockState.observations.length + 1;
let reportCounter = 1;
let runCounter = 2;

function findInventoryItem(skuId: string) {
  return browserMockState.inventorySnapshot.items.find((item) => item.skuId === skuId) ?? null;
}

function syncSummaryFromSnapshot(skuId: string) {
  const item = findInventoryItem(skuId);
  const summary = browserMockState.workspaceSummary.skuSummaries.find((entry) => entry.skuId === skuId);
  if (!item || !summary) {
    return;
  }
  summary.latestPosteriorUnits = item.unitsInStock;
  summary.credibleIntervalLow = Math.max(0, item.unitsInStock - 3);
  summary.credibleIntervalHigh = item.unitsInStock + 4;
}

function installBrowserDesktopBridge() {
  if (typeof window === 'undefined' || window.banjiDesktop) {
    return;
  }

  const bridge: DesktopBridge = {
    system: {
      getAppContext: async () => clone(browserMockState.appContext),
      getLocalDataInfo: async () => clone(browserMockState.localDataInfo),
      openLocalDataFolder: async () => {},
    },
    preferences: {
      get: async () => clone(browserMockState.preferences),
      save: async (payload) => {
        browserMockState.preferences = {
          ...browserMockState.preferences,
          ...payload,
        };
        return clone(browserMockState.preferences);
      },
    },
    inventory: {
      loadSnapshot: async () => clone(browserMockState.inventorySnapshot),
      listReports: async () => clone(browserMockState.reports),
      submitReport: async (payload: StockReportSubmission) => {
        const report: StockReport = {
          reportId: `mock-report-${reportCounter++}`,
          reportSource: 'compat-stock-update',
          reportedAt: payload.reportedAt,
          skuObservations: payload.skuObservations,
          serviceSignals: payload.serviceSignals ?? [],
          servicePriceAdjustments: payload.servicePriceAdjustments ?? [],
          topServiceRanking: payload.topServiceRanking ?? [],
          topRetailRanking: payload.topRetailRanking ?? [],
          notes: payload.notes ?? null,
        };
        browserMockState.reports = [report, ...browserMockState.reports];
        browserMockState.inventorySnapshot.lastReportAt = payload.reportedAt;
        for (const observation of payload.skuObservations) {
          const item = findInventoryItem(observation.skuId);
          if (!item) {
            continue;
          }
          item.unitsInStock = observation.unitsInStock;
          item.costPerUnit = observation.costPerUnit;
          item.productPrice = observation.productPrice ?? item.productPrice;
          syncSummaryFromSnapshot(observation.skuId);
        }
        return clone(report);
      },
    },
    sena: {
      getCatalog: async () => clone(browserMockState.catalog),
      listObservations: async () => clone(browserMockState.observations),
      upsertCatalog: async (payload) => {
        browserMockState.catalog = clone(payload);
        return clone(browserMockState.catalog);
      },
      ingestObservation: async (payload: SenaObservationInput) => {
        const observation: SenaObservationRecord = {
          observationId: `mock-observation-${observationCounter++}`,
          ownerSub: MOCK_OWNER_SUB,
          input: payload,
        };
        browserMockState.observations = [observation, ...browserMockState.observations];
        browserMockState.workspaceSummary.latestObservedAt = payload.observedAt;
        return clone(observation);
      },
      triggerRun: async (payload?: SenaTriggerRunPayload) => {
        const runId = `browser-run-${runCounter++}`;
        browserMockState.workspaceSummary.runId = runId;
        browserMockState.latestRun = {
          runId,
          ownerSub: MOCK_OWNER_SUB,
          algorithmVersion: payload?.algorithmVersion ?? 'sena-analysis-v3',
          status: 'succeeded',
          observationCount: browserMockState.observations.length,
          createdAt: nowIso(),
          completedAt: nowIso(),
          summary: clone(browserMockState.workspaceSummary),
          diagnostics: clone(browserMockState.diagnostics),
          primaryArtifactKey: null,
          error: null,
        };
        return clone(browserMockState.latestRun);
      },
      retryRun: async ({ runId }: SenaRunLookupPayload) => {
        browserMockState.latestRun = {
          ...browserMockState.latestRun,
          runId,
          status: 'succeeded',
          completedAt: nowIso(),
        };
        return clone(browserMockState.latestRun);
      },
      getWorkspaceSummary: async () => clone(browserMockState.workspaceSummary),
      getSkuDetail: async ({ skuId }: SenaSkuLookupPayload) => clone(browserMockState.skuDetails[skuId] ?? null),
      getServiceDetail: async ({ serviceId }: SenaServiceLookupPayload) =>
        clone(browserMockState.serviceDetails[serviceId] ?? null),
      getDiagnostics: async () => clone(browserMockState.diagnostics),
      getRunStatus: async ({ runId }: SenaRunLookupPayload) =>
        clone(browserMockState.latestRun.runId === runId ? browserMockState.latestRun : null),
    },
  };

  window.banjiDesktop = bridge;
  console.info('[browser-mock] installed mock banjiDesktop bridge');
}

function resetBrowserDesktopBridgeMock() {
  browserMockState = createMockState();
  observationCounter = browserMockState.observations.length + 1;
  reportCounter = 1;
  runCounter = 2;
}

export { installBrowserDesktopBridge, resetBrowserDesktopBridgeMock };
