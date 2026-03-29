import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  InventorySnapshot,
  SistServiceDetail,
  SistSkuDetail,
  SistSystemDetail,
  StockReport,
} from '@shared/inventory';
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
          expectedDemandPerDay: 2.4,
          demandIntervalLow: 1.4,
          demandIntervalHigh: 3.1,
          stockoutRisk: 0.47,
          reorderTriggerProbability: 0.51,
          daysOfCover: 4.2,
          confidence: 'medium',
          reorderPoint: 8,
          safetyStock: 4,
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
  regimePosteriorHistory: [
    {
      intervalIndex: 1,
      startAt: '2026-03-26T09:00:00Z',
      endAt: '2026-03-27T09:00:00Z',
      dominantRegime: 'spike',
      changePointProbability: 0.2,
      regimeProbabilities: {
        spike: 0.5,
        normal: 0.3,
        lull: 0.2,
      },
    },
  ],
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
  posteriorInventoryTrajectory: [{ at: '2026-03-27T09:00:00Z', mean: 12, low: 10, high: 14 }],
  forecastTrajectory: [{ at: '2026-03-28T09:00:00Z', mean: 9, low: 7, high: 11 }],
  intervalDemand: [{ reportId: 'report-1', reportedAt: '2026-03-27T09:00:00Z', demandMean: 2.4, demandLow: 1.4, demandHigh: 3.1 }],
  evidenceSummary: [],
  reorderPolicy: { reorderPoint: 8, safetyStock: 4, targetServiceLevel: 0.95, leadTimeDemandMean: 5.1 },
  regimeTimeline: systemDetail.regimePosteriorHistory,
  metadata: systemDetail.metadata,
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
  regimeTimeline: systemDetail.regimePosteriorHistory,
  metadata: systemDetail.metadata,
};

function InventoryProbe() {
  const {
    isLoading,
    listStockReports,
    loadSistSkuDetail,
    loadSistSystemDetail,
    reload,
    saveSistSettings,
    snapshot,
  } = useInventory();

  return (
    <div>
      <div data-testid="snapshot-ready">{String(!isLoading && snapshot !== null)}</div>
      <div data-testid="snapshot-particle-count">{String(snapshot?.sist.settings.particleCount ?? 0)}</div>
      <button type="button" onClick={() => void Promise.all([listStockReports(), listStockReports()])}>
        load-reports-twice
      </button>
      <button
        type="button"
        onClick={() => void Promise.all([loadSistSystemDetail(), loadSistSystemDetail()])}
      >
        load-system-twice
      </button>
      <button
        type="button"
        onClick={() => void Promise.all([loadSistSkuDetail('sku-1'), loadSistSkuDetail('sku-1')])}
      >
        load-sku-twice
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
  const saveRanking = vi.fn();

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
    saveRanking.mockReset();

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

    window.banjiDesktop = {
      ...window.banjiDesktop,
      inventory: {
        getSnapshot,
        listStockReports,
        getSistSystemDetail,
        getSistSkuDetail,
        getSistServiceDetail,
        updateSistSettings,
        saveSku,
        saveService,
        applyStockUpdates,
        submitStockReport,
        saveRanking,
      },
    } as typeof window.banjiDesktop;
  });

  it('deduplicates repeated report, system, and sku detail reads', async () => {
    render(
      <InventoryProvider>
        <InventoryProbe />
      </InventoryProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('snapshot-ready').textContent).toBe('true');
    });

    fireEvent.click(screen.getByText('load-reports-twice'));
    fireEvent.click(screen.getByText('load-system-twice'));
    fireEvent.click(screen.getByText('load-sku-twice'));

    await waitFor(() => {
      expect(listStockReports).toHaveBeenCalledTimes(1);
      expect(getSistSystemDetail).toHaveBeenCalledTimes(1);
      expect(getSistSkuDetail).toHaveBeenCalledTimes(1);
    });
  });

  it('invalidates read caches after settings changes and reload', async () => {
    render(
      <InventoryProvider>
        <InventoryProbe />
      </InventoryProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('snapshot-ready').textContent).toBe('true');
    });

    fireEvent.click(screen.getByText('load-system-twice'));
    await waitFor(() => {
      expect(getSistSystemDetail).toHaveBeenCalledTimes(1);
    });

    fireEvent.click(screen.getByText('save-settings'));
    await waitFor(() => {
      expect(updateSistSettings).toHaveBeenCalledTimes(1);
    });
    expect(screen.getByTestId('snapshot-particle-count').textContent).toBe('640');

    fireEvent.click(screen.getByText('load-system-twice'));
    await waitFor(() => {
      expect(getSistSystemDetail).toHaveBeenCalledTimes(2);
    });

    fireEvent.click(screen.getByText('reload'));
    await waitFor(() => {
      expect(getSnapshot).toHaveBeenCalledTimes(2);
    });
  });
});
