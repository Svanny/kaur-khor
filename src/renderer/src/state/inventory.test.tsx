import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  InventorySnapshot,
  SistServiceDetail,
  SistSkuDetail,
  SistSystemDetail,
  StockReport,
} from '@shared/inventory';
import type {
  SenaAnalysisRunRecord,
  SenaCatalog,
  SenaDiagnostics,
  SenaObservationRecord,
  SenaServiceDetail,
  SenaSkuDetail as SenaSkuDetailModel,
  SenaWorkspaceSummary,
} from '@shared/sena';
import { InventoryProvider, useInventory } from './inventory';

function createSnapshot(): InventorySnapshot {
  return {
    skus: [
      {
        skuId: 'sku-1',
        name: 'Bangkok Market Tee',
        description: 'Test sku',
        unitsInStock: 12,
        costPerUnit: 5,
        soldAsProduct: true,
        productPrice: 12,
        leadTimeMeanDays: 5,
        leadTimeStdDays: 1.5,
      },
    ],
    services: [
      {
        serviceId: 'service-1',
        name: 'Market Day Outfit Set',
        description: 'Test service',
        price: 22,
        skuIds: ['sku-1'],
      },
    ],
    ranking: [{ entryType: 'sku', entryId: 'sku-1', position: 0 }],
    sist: {
      status: {
        state: 'ready',
        confidence: 'medium',
        reportCount: 1,
        updatedAt: '2026-03-27T09:00:00Z',
        reason: null,
      },
      settings: {
        targetServiceLevel: 0.95,
        forecastHorizonDays: 14,
        particleCount: 512,
        smoothingWindowReports: 90,
      },
      asOf: '2026-03-27T09:00:00Z',
      topRegime: 'spike',
      highRiskSkuIds: ['sku-1'],
      pendingReorderCount: 1,
      skuInsights: [
        {
          skuId: 'sku-1',
          latestPosteriorUnits: 11,
          credibleIntervalLow: 9,
          credibleIntervalHigh: 13,
          expectedDemandPerDay: 2.4,
          demandIntervalLow: 1.4,
          demandIntervalHigh: 3.1,
          stockoutRisk: 0.47,
          reorderTriggerProbability: 0.51,
          daysOfCover: 4.2,
          confidence: 'medium',
          reorderPoint: 8,
          safetyStock: 4,
          leadTime: {
            meanDays: 5,
            stdDays: 1.5,
            source: 'manual',
          },
          regimeProbabilities: {
            normal: 0.3,
            spike: 0.5,
            lull: 0.2,
            stockout_constrained: 0,
            promo: 0,
            correction: 0,
          },
        },
      ],
    },
  };
}

const stockReports: StockReport[] = [
  {
    reportId: 'report-1',
    reportSource: 'manual',
    reportedAt: '2026-03-27T09:00:00Z',
    skuObservations: [],
    serviceSignals: [],
    servicePriceAdjustments: [],
    topServiceRanking: [],
    topRetailRanking: [],
    notes: 'Morning floor update.',
  },
];

const systemDetail: SistSystemDetail = {
  intervalTimeline: [],
  regimePosteriorHistory: [],
  signalIntake: {
    rankingObservations: 1,
    restockFlags: 0,
    stockoutFlags: 0,
    priceAdjustments: 0,
    correctionSignals: 0,
  },
  modelHealth: {
    particleCountUsed: 128,
    intervalCount: 1,
    effectiveSampleSizeMean: 0.85,
    confidence: 'medium',
  },
  topRiskyEntities: [{ entityType: 'sku', entityId: 'sku-1', riskScore: 0.47 }],
  driftDiagnostics: {
    seasonalityActive: false,
    changePointActive: false,
    recentChangePointProbability: 0.2,
    serviceDriftScale: 0.2,
    retailDriftScale: 0.3,
  },
  metadata: {
    reportCountUsed: 1,
    effectiveSmoothingWindowUsed: 1,
    analysisTimestamp: '2026-03-27T09:00:00Z',
    seasonalityActive: false,
    changePointActive: false,
  },
};

const skuDetail: SistSkuDetail = {
  insight: createSnapshot().sist.skuInsights[0],
  reports: stockReports,
};

const serviceDetail: SistServiceDetail = {
  serviceId: 'service-1',
  serviceName: 'Market Day Outfit Set',
  estimatedActivityPerInterval: 4.2,
  bottleneckProbability: 0.4,
  viabilityForecast: [{ at: '2026-03-28T09:00:00Z', mean: 8, low: 6, high: 10 }],
  contributors: [{ skuId: 'sku-1', pressureProbability: 0.4, expectedDaysOfCover: 4.2 }],
  disruptionWindow: {
    startAt: '2026-03-30T09:00:00Z',
    endAt: '2026-03-31T09:00:00Z',
    probability: 0.4,
  },
  evidenceTimeline: [],
  regimeTimeline: [],
  metadata: systemDetail.metadata,
};

const senaCatalog: SenaCatalog = {
  schemaVersion: 1,
  skus: [
    {
      skuId: 'sku-1',
      name: 'Bangkok Market Tee',
      description: 'Test sku',
      costPerUnit: 5,
      soldAsProduct: true,
      productPrice: 12,
      leadTimeMeanDaysHint: 5,
      leadTimeStdDaysHint: 1.5,
    },
  ],
  services: [
    {
      serviceId: 'service-1',
      name: 'Market Day Outfit Set',
      description: 'Test service',
      price: 22,
      bundle: false,
    },
  ],
  bundles: [],
  sharingMask: [{ serviceId: 'service-1', skuId: 'sku-1', enabled: true, usageProbability: null }],
};

const senaWorkspaceSummary: SenaWorkspaceSummary = {
  ownerSub: 'desktop-owner',
  runId: 'run-1',
  latestObservedAt: '2026-03-27T09:00:00Z',
  skuCount: 1,
  serviceCount: 1,
  intervalCount: 1,
  pendingReorderCount: 1,
  topRegime: 'spike',
  highRiskSkuIds: ['sku-1'],
  skuSummaries: [
    {
      skuId: 'sku-1',
      latestPosteriorUnits: 11,
      credibleIntervalLow: 9,
      credibleIntervalHigh: 13,
      demandPerDayMean: 2.4,
      stockoutRisk: 0.47,
      daysOfCover: 4.2,
      expectedLeadTimeDemand: 12,
      safetyStock: 4,
      reorderPoint: 8,
      reorderTriggerProbability: 0.51,
      leadTimeMeanDays: 5,
      leadTimeStdDays: 1.5,
      regimeProbabilities: { spike: 0.5, normal: 0.3, lull: 0.2 },
    },
  ],
};

const senaSkuDetail: SenaSkuDetailModel = {
  summary: senaWorkspaceSummary.skuSummaries[0],
  inventoryPosterior: [{ at: '2026-03-27T09:00:00Z', mean: 11, low: 9, high: 13 }],
  demandPosterior: [
    {
      intervalIndex: 0,
      startAt: '2026-03-26T09:00:00Z',
      endAt: '2026-03-27T09:00:00Z',
      deltaDays: 1,
      serviceDemandMean: 1.2,
      retailDemandMean: 1.2,
      unconstrainedDemandMean: 2.6,
      realizedConsumptionMean: 2.4,
      adjustmentsMean: 0.1,
      receiptsMean: 0.3,
    },
  ],
  pipelinePosterior: [
    {
      intervalIndex: 0,
      inTransitMean: 3,
      orderProbability: 0.6,
      orderQuantityMean: 5,
      receiptQuantityMean: 4,
      ageDaysMean: 2,
    },
  ],
  leadTimePosterior: [
    {
      intervalIndex: 0,
      logMeanDays: 1,
      logStdDays: 0.2,
      meanDays: 5,
      stdDays: 1.5,
    },
  ],
};

const senaDiagnostics: SenaDiagnostics = {
  effectiveSampleSizeMean: 82,
  resamplingCount: 2,
  smoothingEnabled: true,
  changePointProbability: 0.22,
  seasonalityActive: false,
  posteriorPredictiveErrorMean: 0.14,
  coverageEstimate: 0.93,
  regimeHistory: [
    {
      intervalIndex: 0,
      startAt: '2026-03-26T09:00:00Z',
      endAt: '2026-03-27T09:00:00Z',
      dominantRegime: 'spike',
      regimeProbabilities: { spike: 0.5, normal: 0.3, lull: 0.2 },
    },
  ],
};

const senaObservations: SenaObservationRecord[] = [
  {
    observationId: 'obs-1',
    ownerSub: 'desktop-owner',
    input: {
      observedAt: '2026-03-27T09:00:00Z',
      stockSnapshot: [{ skuId: 'sku-1', unitsInStock: 12, costPerUnit: 5, productPrice: 12 }],
      serviceRankings: [],
      retailRankings: ['sku-1'],
      serviceStockouts: [],
      retailStockouts: [],
      orderSignals: [],
      servicePrices: [],
      retailPrices: [{ skuId: 'sku-1', price: 13 }],
      leadTimeHints: [],
      notes: 'Observed in store.',
    },
  },
];

const senaServiceDetail: SenaServiceDetail = {
  serviceId: 'service-1',
  activityMean: 4.2,
  activityIntervalLow: 3.5,
  activityIntervalHigh: 5.1,
  bottleneckProbability: 0.4,
  contributors: [{ skuId: 'sku-1', usageProbability: 1, bottleneckProbability: 0.4 }],
  regimeTimeline: senaDiagnostics.regimeHistory,
};

const senaRunRecord: SenaAnalysisRunRecord = {
  runId: 'run-1',
  ownerSub: 'desktop-owner',
  algorithmVersion: 'sena-analysis-v1',
  status: 'succeeded',
  observationCount: 1,
  createdAt: '2026-03-27T09:00:00Z',
  completedAt: '2026-03-27T09:01:00Z',
  summary: senaWorkspaceSummary,
  diagnostics: senaDiagnostics,
  primaryArtifactKey: null,
  error: null,
};

function InventoryProbe() {
  const {
    isLoading,
    listStockReports,
    loadSenaCatalog,
    loadSenaDiagnostics,
    loadSenaObservations,
    loadSenaServiceDetail,
    loadSenaSkuDetail,
    loadSenaWorkspaceSummary,
    loadSistSkuDetail,
    loadSistSystemDetail,
    reload,
    saveSistSettings,
    snapshot,
    triggerSenaRun,
    upsertSenaCatalog,
  } = useInventory();

  return (
    <div>
      <div data-testid="snapshot-ready">{String(!isLoading && snapshot !== null)}</div>
      <div data-testid="snapshot-particle-count">{String(snapshot?.sist.settings.particleCount ?? 0)}</div>
      <button type="button" onClick={() => void Promise.all([listStockReports(), listStockReports()])}>
        load-reports-twice
      </button>
      <button type="button" onClick={() => void Promise.all([loadSistSystemDetail(), loadSistSystemDetail()])}>
        load-system-twice
      </button>
      <button type="button" onClick={() => void Promise.all([loadSistSkuDetail('sku-1'), loadSistSkuDetail('sku-1')])}>
        load-sku-twice
      </button>
      <button
        type="button"
        onClick={() =>
          void Promise.all([
            loadSenaCatalog(),
            loadSenaCatalog(),
            loadSenaWorkspaceSummary(),
            loadSenaWorkspaceSummary(),
            loadSenaSkuDetail('sku-1'),
            loadSenaSkuDetail('sku-1'),
            loadSenaDiagnostics(),
            loadSenaDiagnostics(),
            loadSenaObservations(),
            loadSenaObservations(),
            loadSenaServiceDetail('service-1'),
            loadSenaServiceDetail('service-1'),
          ])
        }
      >
        load-sena-twice
      </button>
      <button type="button" onClick={() => void upsertSenaCatalog(senaCatalog)}>
        upsert-sena-catalog
      </button>
      <button type="button" onClick={() => void triggerSenaRun({ algorithmVersion: 'sena-analysis-v1' })}>
        trigger-sena-run
      </button>
      <button
        type="button"
        onClick={() =>
          void saveSistSettings({
            targetServiceLevel: 0.97,
            forecastHorizonDays: 21,
            particleCount: 640,
            smoothingWindowReports: 60,
          })
        }
      >
        save-settings
      </button>
      <button type="button" onClick={() => void reload()}>
        reload
      </button>
    </div>
  );
}

describe('inventory state', () => {
  const getSnapshot = vi.fn();
  const listStockReports = vi.fn();
  const getSistSystemDetail = vi.fn();
  const getSistSkuDetail = vi.fn();
  const getSistServiceDetail = vi.fn();
  const updateSistSettings = vi.fn();
  const saveSku = vi.fn();
  const saveService = vi.fn();
  const applyStockUpdates = vi.fn();
  const submitStockReport = vi.fn();
  const updateStockReport = vi.fn();
  const deleteStockReport = vi.fn();
  const saveRanking = vi.fn();
  const getSenaCatalog = vi.fn();
  const listSenaObservations = vi.fn();
  const upsertSenaCatalog = vi.fn();
  const triggerSenaRun = vi.fn();
  const getSenaWorkspaceSummary = vi.fn();
  const getSenaSkuDetail = vi.fn();
  const getSenaDiagnostics = vi.fn();
  const getSenaServiceDetail = vi.fn();

  beforeEach(() => {
    getSnapshot.mockReset();
    listStockReports.mockReset();
    getSistSystemDetail.mockReset();
    getSistSkuDetail.mockReset();
    getSistServiceDetail.mockReset();
    updateSistSettings.mockReset();
    saveSku.mockReset();
    saveService.mockReset();
    applyStockUpdates.mockReset();
    submitStockReport.mockReset();
    updateStockReport.mockReset();
    deleteStockReport.mockReset();
    saveRanking.mockReset();
    getSenaCatalog.mockReset();
    listSenaObservations.mockReset();
    upsertSenaCatalog.mockReset();
    triggerSenaRun.mockReset();
    getSenaWorkspaceSummary.mockReset();
    getSenaSkuDetail.mockReset();
    getSenaDiagnostics.mockReset();
    getSenaServiceDetail.mockReset();

    getSnapshot.mockResolvedValue(createSnapshot());
    listStockReports.mockResolvedValue(stockReports);
    getSistSystemDetail.mockResolvedValue(systemDetail);
    getSistSkuDetail.mockResolvedValue(skuDetail);
    getSistServiceDetail.mockResolvedValue(serviceDetail);
    updateSistSettings.mockResolvedValue({
      ...createSnapshot(),
      sist: {
        ...createSnapshot().sist,
        settings: {
          targetServiceLevel: 0.97,
          forecastHorizonDays: 21,
          particleCount: 640,
          smoothingWindowReports: 60,
        },
      },
    });
    getSenaCatalog.mockResolvedValue(senaCatalog);
    listSenaObservations.mockResolvedValue(senaObservations);
    upsertSenaCatalog.mockResolvedValue(senaCatalog);
    triggerSenaRun.mockResolvedValue(senaRunRecord);
    getSenaWorkspaceSummary.mockResolvedValue(senaWorkspaceSummary);
    getSenaSkuDetail.mockResolvedValue(senaSkuDetail);
    getSenaDiagnostics.mockResolvedValue(senaDiagnostics);
    getSenaServiceDetail.mockResolvedValue(senaServiceDetail);

    window.banjiDesktop = {
      ...window.banjiDesktop,
      inventory: {
        getSnapshot,
        listStockReports,
        saveSku,
        saveService,
        applyStockUpdates,
        submitStockReport,
        updateStockReport,
        deleteStockReport,
        saveRanking,
        getSistSystemDetail,
        getSistSkuDetail,
        getSistServiceDetail,
        updateSistSettings,
        getSenaCatalog,
        listSenaObservations,
        upsertSenaCatalog,
        triggerSenaRun,
        getSenaWorkspaceSummary,
        getSenaSkuDetail,
        getSenaDiagnostics,
        getSenaServiceDetail,
      },
    } as typeof window.banjiDesktop;
  });

  it('deduplicates repeated legacy and SENA reads', async () => {
    render(
      <InventoryProvider>
        <InventoryProbe />
      </InventoryProvider>,
    );

    await screen.findByText('true');

    fireEvent.click(screen.getByText('load-reports-twice'));
    fireEvent.click(screen.getByText('load-system-twice'));
    fireEvent.click(screen.getByText('load-sku-twice'));
    fireEvent.click(screen.getByText('load-sena-twice'));

    await waitFor(() => {
      expect(listStockReports).toHaveBeenCalledTimes(1);
      expect(getSistSystemDetail).toHaveBeenCalledTimes(1);
      expect(getSistSkuDetail).toHaveBeenCalledTimes(1);
      expect(getSenaCatalog).toHaveBeenCalledTimes(1);
      expect(getSenaWorkspaceSummary).toHaveBeenCalledTimes(1);
      expect(getSenaSkuDetail).toHaveBeenCalledTimes(1);
      expect(getSenaDiagnostics).toHaveBeenCalledTimes(1);
      expect(listSenaObservations).toHaveBeenCalledTimes(1);
      expect(getSenaServiceDetail).toHaveBeenCalledTimes(1);
    });
  });

  it('invalidates caches after legacy and SENA mutations', async () => {
    render(
      <InventoryProvider>
        <InventoryProbe />
      </InventoryProvider>,
    );

    await screen.findByText('true');

    fireEvent.click(screen.getByText('load-system-twice'));
    fireEvent.click(screen.getByText('load-sena-twice'));

    await waitFor(() => {
      expect(getSistSystemDetail).toHaveBeenCalledTimes(1);
      expect(getSenaCatalog).toHaveBeenCalledTimes(1);
    });

    fireEvent.click(screen.getByText('save-settings'));

    await waitFor(() => {
      expect(updateSistSettings).toHaveBeenCalledTimes(1);
      expect(screen.getByTestId('snapshot-particle-count').textContent).toBe('640');
    });

    fireEvent.click(screen.getByText('load-system-twice'));
    await waitFor(() => {
      expect(getSistSystemDetail).toHaveBeenCalledTimes(2);
    });

    fireEvent.click(screen.getByText('upsert-sena-catalog'));
    await waitFor(() => {
      expect(upsertSenaCatalog).toHaveBeenCalledTimes(1);
    });

    fireEvent.click(screen.getByText('load-sena-twice'));
    await waitFor(() => {
      expect(getSenaCatalog).toHaveBeenCalledTimes(1);
      expect(getSenaWorkspaceSummary).toHaveBeenCalledTimes(2);
    });

    fireEvent.click(screen.getByText('trigger-sena-run'));
    await waitFor(() => {
      expect(triggerSenaRun).toHaveBeenCalledTimes(1);
    });

    fireEvent.click(screen.getByText('load-sena-twice'));
    await waitFor(() => {
      expect(getSenaCatalog).toHaveBeenCalledTimes(2);
      expect(getSenaDiagnostics).toHaveBeenCalledTimes(3);
    });
  });

  it('reloads the snapshot after cache invalidation', async () => {
    render(
      <InventoryProvider>
        <InventoryProbe />
      </InventoryProvider>,
    );

    await screen.findByText('true');
    expect(getSnapshot).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByText('reload'));

    await waitFor(() => {
      expect(getSnapshot).toHaveBeenCalledTimes(2);
    });
  });
});
