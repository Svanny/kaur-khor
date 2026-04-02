import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  DesktopBridge,
  DesktopPreferences,
} from '@shared/ipc';
import type { InventorySnapshot, StockReport } from '@shared/inventory';
import type {
  SenaAnalysisRunRecord,
  SenaCatalog,
  SenaDiagnostics,
  SenaObservationRecord,
  SenaServiceDetail,
  SenaSkuDetail,
  SenaWorkspaceSummary,
} from '@shared/sena';
import { InventoryProvider, useInventory } from './inventory';

const sampleCatalog: SenaCatalog = {
  schemaVersion: 1,
  skus: [
    {
      costPerUnit: 4,
      description: 'Cotton tee',
      leadTimeMeanDaysHint: 5,
      leadTimeStdDaysHint: 1,
      name: 'SKU 1',
      productPrice: 9,
      skuId: 'sku-1',
      soldAsProduct: true,
    },
  ],
  services: [
    {
      bundle: false,
      description: 'Service',
      name: 'Service 1',
      price: 15,
      serviceId: 'service-1',
    },
  ],
  bundles: [],
  sharingMask: [{ enabled: true, serviceId: 'service-1', skuId: 'sku-1', usageProbability: null }],
};

const sampleWorkspace: SenaWorkspaceSummary = {
  ownerSub: 'desktop-owner',
  runId: 'run-1',
  latestObservedAt: '2026-04-02T00:00:00Z',
  skuCount: 1,
  serviceCount: 1,
  intervalCount: 1,
  pendingReorderCount: 1,
  topRegime: 'normal',
  highRiskSkuIds: ['sku-1'],
  skuSummaries: [],
};

const sampleDiagnostics: SenaDiagnostics = {
  effectiveSampleSizeMean: 0.81,
  resamplingCount: 3,
  smoothingEnabled: false,
  changePointProbability: 0.2,
  seasonalityActive: false,
  posteriorPredictiveErrorMean: 0.1,
  coverageEstimate: 0.88,
  regimeHistory: [],
};

const sampleObservation: SenaObservationRecord = {
  observationId: 'obs-1',
  ownerSub: 'desktop-owner',
  input: {
    observedAt: '2026-04-02T00:00:00Z',
    stockSnapshot: [{ skuId: 'sku-1', unitsInStock: 10, costPerUnit: 4, productPrice: 9 }],
    serviceRankings: [],
    retailRankings: [],
    serviceStockouts: [],
    retailStockouts: [],
    orderSignals: [],
    servicePrices: [],
    retailPrices: [],
    leadTimeHints: [],
    notes: null,
  },
};

const sampleSnapshot: InventorySnapshot = {
  skus: [
    {
      skuId: 'sku-1',
      name: 'SKU 1',
      description: 'Cotton tee',
      unitsInStock: 10,
      costPerUnit: 4,
      soldAsProduct: true,
      productPrice: 9,
      leadTimeMeanDays: 5,
      leadTimeStdDays: 1,
    },
  ],
  services: [
    {
      serviceId: 'service-1',
      name: 'Service 1',
      description: 'Service',
      price: 15,
      skuIds: ['sku-1'],
    },
  ],
  ranking: [],
  sist: {
    status: {
      state: 'ready',
      updatedAt: '2026-04-02T00:00:00Z',
      reportCount: 1,
      confidence: 'medium',
      reason: null,
    },
    settings: {
      targetServiceLevel: 0.95,
      forecastHorizonDays: 14,
      particleCount: 512,
      smoothingWindowReports: 90,
    },
    asOf: '2026-04-02T00:00:00Z',
    topRegime: 'normal',
    pendingReorderCount: 1,
    highRiskSkuIds: ['sku-1'],
    skuInsights: [],
  },
};

const sampleReport: StockReport = {
  reportId: 'report-1',
  reportSource: 'manual',
  reportedAt: '2026-04-02T00:00:00Z',
  skuObservations: [{ skuId: 'sku-1', unitsInStock: 10, costPerUnit: 4, productPrice: 9 }],
  serviceSignals: [],
  servicePriceAdjustments: [],
  topServiceRanking: [],
  topRetailRanking: [],
  notes: null,
};

const sampleRun: SenaAnalysisRunRecord = {
  runId: 'run-1',
  ownerSub: 'desktop-owner',
  algorithmVersion: 'sena-analysis-v1',
  status: 'succeeded',
  observationCount: 1,
  createdAt: '2026-04-02T00:00:00Z',
  completedAt: '2026-04-02T00:01:00Z',
  summary: sampleWorkspace,
  diagnostics: sampleDiagnostics,
  primaryArtifactKey: null,
  error: null,
};

const sampleSkuDetail: SenaSkuDetail = {
  summary: {
    skuId: 'sku-1',
    latestPosteriorUnits: 9,
    credibleIntervalLow: 6,
    credibleIntervalHigh: 12,
    demandPerDayMean: 2,
    stockoutRisk: 0.4,
    daysOfCover: 4,
    expectedLeadTimeDemand: 8,
    safetyStock: 3,
    reorderPoint: 7,
    reorderTriggerProbability: 0.55,
    leadTimeMeanDays: 5,
    leadTimeStdDays: 1,
    regimeProbabilities: { normal: 1 },
  },
  inventoryPosterior: [],
  demandPosterior: [],
  pipelinePosterior: [],
  leadTimePosterior: [],
};

const sampleServiceDetail: SenaServiceDetail = {
  serviceId: 'service-1',
  activityMean: 3,
  activityIntervalLow: 2,
  activityIntervalHigh: 4,
  bottleneckProbability: 0.3,
  contributors: [],
  regimeTimeline: [],
};

function TestHarness() {
  const inventory = useInventory();

  return (
    <div>
      <div data-testid="loading">{String(inventory.isLoading)}</div>
      <div data-testid="catalog-count">{inventory.catalog?.skus.length ?? 0}</div>
      <div data-testid="workspace-run">{inventory.workspaceSummary?.runId ?? 'none'}</div>
      <div data-testid="latest-run">{inventory.latestRun?.runId ?? 'none'}</div>
      <button type="button" onClick={() => void inventory.loadSenaSkuDetail('sku-1')}>
        load sku
      </button>
      <button type="button" onClick={() => void inventory.triggerSenaRun()}>
        trigger run
      </button>
    </div>
  );
}

describe('InventoryProvider', () => {
  beforeEach(() => {
    const bridge: DesktopBridge = {
      system: {
        getAppContext: vi.fn(),
        getLocalDataInfo: vi.fn(),
        openLocalDataFolder: vi.fn(),
      },
      inventory: {
        loadSnapshot: vi.fn(async () => sampleSnapshot),
        listReports: vi.fn(async () => [sampleReport]),
        submitReport: vi.fn(async () => sampleReport),
      },
      preferences: {
        get: vi.fn<() => Promise<DesktopPreferences>>(),
        save: vi.fn<() => Promise<DesktopPreferences>>(),
      },
      sena: {
        getCatalog: vi.fn(async () => sampleCatalog),
        listObservations: vi.fn(async () => [sampleObservation]),
        upsertCatalog: vi.fn(async (payload: SenaCatalog) => payload),
        ingestObservation: vi.fn(async () => sampleObservation),
        triggerRun: vi.fn(async () => sampleRun),
        retryRun: vi.fn(async () => sampleRun),
        getWorkspaceSummary: vi.fn(async () => sampleWorkspace),
        getSkuDetail: vi.fn(async () => sampleSkuDetail),
        getDiagnostics: vi.fn(async () => sampleDiagnostics),
        getServiceDetail: vi.fn(async () => sampleServiceDetail),
        getRunStatus: vi.fn(async () => sampleRun),
      },
    };
    window.banjiDesktop = bridge;
  });

  it('bootstraps the SENA workspace on mount', async () => {
    render(
      <InventoryProvider>
        <TestHarness />
      </InventoryProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('loading').textContent).toBe('false');
    });

    expect(screen.getByTestId('catalog-count').textContent).toBe('1');
    expect(screen.getByTestId('workspace-run').textContent).toBe('run-1');
    expect(screen.getByTestId('latest-run').textContent).toBe('run-1');
    expect(window.banjiDesktop.sena.getCatalog).toHaveBeenCalledTimes(1);
    expect(window.banjiDesktop.inventory.loadSnapshot).toHaveBeenCalledTimes(1);
    expect(window.banjiDesktop.sena.getWorkspaceSummary).toHaveBeenCalledTimes(1);
    expect(window.banjiDesktop.sena.getRunStatus).toHaveBeenCalledWith({ runId: 'run-1' });
  });

  it('caches SENA detail lookups and reloads after triggering a run', async () => {
    render(
      <InventoryProvider>
        <TestHarness />
      </InventoryProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('loading').textContent).toBe('false');
    });

    fireEvent.click(screen.getByText('load sku'));
    fireEvent.click(screen.getByText('load sku'));

    await waitFor(() => {
      expect(window.banjiDesktop.sena.getSkuDetail).toHaveBeenCalledTimes(1);
    });

    fireEvent.click(screen.getByText('trigger run'));

    await waitFor(() => {
      expect(window.banjiDesktop.sena.triggerRun).toHaveBeenCalledTimes(1);
    });
    expect(window.banjiDesktop.sena.getWorkspaceSummary).toHaveBeenCalledTimes(2);
  });
});
