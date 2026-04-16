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
      archived: false,
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
      archived: false,
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
  algorithmVersion: 'sena-analysis-v3',
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
        revealPath: vi.fn(),
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
        listOrderBatches: vi.fn(async () => []),
        upsertCatalog: vi.fn(async (payload: SenaCatalog) => payload),
        ingestObservation: vi.fn(async () => sampleObservation),
        updateObservation: vi.fn(async ({ input }) => ({ ...sampleObservation, input })),
        deleteObservation: vi.fn(async () => undefined),
        createOrderBatch: vi.fn(async () => ({
          batchOrderId: 'orders/2026/04/15/000000/test/0001',
          ownerSub: 'desktop-owner',
          supplierName: 'Test supplier',
          status: 'open',
          createdAt: '2026-04-15T00:00:00Z',
          updatedAt: '2026-04-15T00:00:00Z',
          shared: {
            supplierName: 'Test supplier',
            supplierNote: null,
            orderedQuantity: null,
            receivedQuantity: null,
            costPerUnit: null,
            expectedArrivalAt: null,
            placementTimestamp: null,
            receiptTimestamp: null,
            leadTimeDaysHint: null,
            leadTimeVariability: null,
          },
          children: [],
        })),
        updateOrderBatch: vi.fn(async () => ({
          batchOrderId: 'orders/2026/04/15/000000/test/0001',
          ownerSub: 'desktop-owner',
          supplierName: 'Test supplier',
          status: 'open',
          createdAt: '2026-04-15T00:00:00Z',
          updatedAt: '2026-04-15T00:00:00Z',
          shared: {
            supplierName: 'Test supplier',
            supplierNote: null,
            orderedQuantity: null,
            receivedQuantity: null,
            costPerUnit: null,
            expectedArrivalAt: null,
            placementTimestamp: null,
            receiptTimestamp: null,
            leadTimeDaysHint: null,
            leadTimeVariability: null,
          },
          children: [],
        })),
        updateOrderChild: vi.fn(async () => ({
          batchOrderId: 'orders/2026/04/15/000000/test/0001',
          ownerSub: 'desktop-owner',
          supplierName: 'Test supplier',
          status: 'open',
          createdAt: '2026-04-15T00:00:00Z',
          updatedAt: '2026-04-15T00:00:00Z',
          shared: {
            supplierName: 'Test supplier',
            supplierNote: null,
            orderedQuantity: null,
            receivedQuantity: null,
            costPerUnit: null,
            expectedArrivalAt: null,
            placementTimestamp: null,
            receiptTimestamp: null,
            leadTimeDaysHint: null,
            leadTimeVariability: null,
          },
          children: [],
        })),
        splitOrderChild: vi.fn(async () => ({
          batchOrderId: 'orders/2026/04/15/000000/test/0002',
          ownerSub: 'desktop-owner',
          supplierName: 'Test supplier',
          status: 'open',
          createdAt: '2026-04-15T00:00:00Z',
          updatedAt: '2026-04-15T00:00:00Z',
          shared: {
            supplierName: 'Test supplier',
            supplierNote: null,
            orderedQuantity: null,
            receivedQuantity: null,
            costPerUnit: null,
            expectedArrivalAt: null,
            placementTimestamp: null,
            receiptTimestamp: null,
            leadTimeDaysHint: null,
            leadTimeVariability: null,
          },
          children: [],
        })),
        triggerRun: vi.fn(async () => sampleRun),
        retryRun: vi.fn(async () => sampleRun),
        getWorkspaceSummary: vi.fn(async () => sampleWorkspace),
        getSkuDetail: vi.fn(async () => sampleSkuDetail),
        getDiagnostics: vi.fn(async () => sampleDiagnostics),
        getServiceDetail: vi.fn(async () => sampleServiceDetail),
        clearDetailCache: vi.fn(async () => undefined),
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
    expect(window.banjiDesktop.inventory.loadSnapshot).not.toHaveBeenCalled();
    expect(window.banjiDesktop.inventory.listReports).not.toHaveBeenCalled();
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

  it('updates and deletes observations through the bridge and refreshes cached observations', async () => {
    function ObservationHarness() {
      const inventory = useInventory();
      return (
        <div>
          <div data-testid="observation-count">{inventory.observations.length}</div>
          <div data-testid="workspace-run">{inventory.workspaceSummary?.runId ?? 'none'}</div>
          <div data-testid="latest-run">{inventory.latestRun?.runId ?? 'none'}</div>
          <button
            type="button"
            onClick={() =>
              void inventory.updateSenaObservation({
                observationId: 'obs-1',
                input: {
                  ...sampleObservation.input,
                  notes: 'Edited',
                },
              })
            }
          >
            update observation
          </button>
          <button
            type="button"
            onClick={() =>
              void inventory.deleteSenaObservation({
                observationId: 'obs-1',
              })
            }
          >
            delete observation
          </button>
        </div>
      );
    }

    const listObservations = vi
      .fn()
      .mockResolvedValueOnce([sampleObservation])
      .mockResolvedValueOnce([{ ...sampleObservation, input: { ...sampleObservation.input, notes: 'Edited' } }])
      .mockResolvedValueOnce([]);
    window.banjiDesktop.sena.listObservations = listObservations;

    render(
      <InventoryProvider>
        <ObservationHarness />
      </InventoryProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('observation-count').textContent).toBe('1');
      expect(screen.getByTestId('workspace-run').textContent).toBe('run-1');
      expect(screen.getByTestId('latest-run').textContent).toBe('run-1');
    });

    fireEvent.click(screen.getByText('update observation'));

    await waitFor(() => {
      expect(window.banjiDesktop.sena.updateObservation).toHaveBeenCalledWith({
        observationId: 'obs-1',
        input: {
          ...sampleObservation.input,
          notes: 'Edited',
        },
      });
    });

    fireEvent.click(screen.getByText('delete observation'));

    await waitFor(() => {
      expect(window.banjiDesktop.sena.deleteObservation).toHaveBeenCalledWith({ observationId: 'obs-1' });
    });
    await waitFor(() => {
      expect(screen.getByTestId('observation-count').textContent).toBe('0');
      expect(screen.getByTestId('workspace-run').textContent).toBe('none');
      expect(screen.getByTestId('latest-run').textContent).toBe('none');
    });
  });

  it('normalizes missing archive flags on load and persists archive mutations', async () => {
    function ArchiveHarness() {
      const inventory = useInventory();
      return (
        <div>
          <div data-testid="sku-archived">{String(inventory.catalog?.skus[0]?.archived ?? null)}</div>
          <button type="button" onClick={() => void inventory.archiveCatalogEntity({ entityId: 'sku-1', entityType: 'sku' })}>
            archive sku
          </button>
          <button type="button" onClick={() => void inventory.unarchiveCatalogEntity({ entityId: 'sku-1', entityType: 'sku' })}>
            unarchive sku
          </button>
        </div>
      );
    }

    const legacyCatalog = {
      ...sampleCatalog,
      skus: sampleCatalog.skus.map(({ archived: _archived, ...sku }) => sku),
      services: sampleCatalog.services.map(({ archived: _archived, ...service }) => service),
    };
    const upsertCatalog = vi.fn(async (payload: SenaCatalog) => payload);
    window.banjiDesktop.sena.getCatalog = vi.fn(async () => legacyCatalog as SenaCatalog);
    window.banjiDesktop.sena.upsertCatalog = upsertCatalog;

    render(
      <InventoryProvider>
        <ArchiveHarness />
      </InventoryProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('sku-archived').textContent).toBe('false');
    });

    fireEvent.click(screen.getByText('archive sku'));

    await waitFor(() => {
      expect(upsertCatalog).toHaveBeenCalledWith(expect.objectContaining({
        skus: [expect.objectContaining({ skuId: 'sku-1', archived: true })],
      }));
    });
    await waitFor(() => {
      expect(screen.getByTestId('sku-archived').textContent).toBe('true');
    });

    fireEvent.click(screen.getByText('unarchive sku'));

    await waitFor(() => {
      expect(upsertCatalog).toHaveBeenLastCalledWith(expect.objectContaining({
        skus: [expect.objectContaining({ skuId: 'sku-1', archived: false })],
      }));
    });
    await waitFor(() => {
      expect(screen.getByTestId('sku-archived').textContent).toBe('false');
    });
  });

  it('renames a sku, rewrites observation references, clears old and new detail caches, and refreshes the run', async () => {
    const richObservation: SenaObservationRecord = {
      ...sampleObservation,
      input: {
        ...sampleObservation.input,
        retailRankings: ['sku-1'],
        retailStockouts: ['sku-1'],
        orderSignals: [
          {
            skuId: 'sku-1',
            orderPlaced: true,
            receiptArrived: false,
            approximateOrderQuantity: 4,
            approximateReceiptQuantity: null,
          },
        ],
        retailPrices: [{ skuId: 'sku-1', price: 9 }],
        leadTimeHints: [{ skuId: 'sku-1', typicalDays: 5, lowDays: null, highDays: null, variabilityClass: null }],
        adjustmentSignals: [{ skuId: 'sku-1', quantityDelta: -1, reason: 'write_off' }],
        recipeUsageHints: [
          {
            serviceId: 'service-1',
            skuId: 'sku-1',
            usageProbability: 0.5,
            typicalUnitsPerInstance: 1,
            variability: 0.2,
          },
        ],
      },
    };
    const renamedObservation: SenaObservationRecord = {
      ...richObservation,
      input: {
        ...richObservation.input,
        stockSnapshot: [{ skuId: 'sku-renamed', unitsInStock: 10, costPerUnit: 4, productPrice: 9 }],
        retailSalesSnapshot: [],
        serviceSalesSnapshot: [],
        retailRankings: ['sku-renamed'],
        retailStockouts: ['sku-renamed'],
        orderSignals: [
          {
            skuId: 'sku-renamed',
            orderPlaced: true,
            receiptArrived: false,
            approximateOrderQuantity: 4,
            approximateReceiptQuantity: null,
          },
        ],
        retailPrices: [{ skuId: 'sku-renamed', price: 9 }],
        leadTimeHints: [{ skuId: 'sku-renamed', typicalDays: 5, lowDays: null, highDays: null, variabilityClass: null }],
        adjustmentSignals: [{ skuId: 'sku-renamed', quantityDelta: -1, reason: 'write_off' }],
        recipeUsageHints: [
          {
            serviceId: 'service-1',
            skuId: 'sku-renamed',
            usageProbability: 0.5,
            typicalUnitsPerInstance: 1,
            variability: 0.2,
          },
        ],
      },
    };
    const renamedRun: SenaAnalysisRunRecord = {
      ...sampleRun,
      runId: 'run-2',
    };
    const renamedWorkspace: SenaWorkspaceSummary = {
      ...sampleWorkspace,
      runId: 'run-2',
      highRiskSkuIds: ['sku-renamed'],
    };
    const listObservations = vi
      .fn()
      .mockResolvedValueOnce([richObservation])
      .mockResolvedValueOnce([richObservation])
      .mockResolvedValueOnce([renamedObservation]);
    const updateObservation = vi.fn(async ({ input }) => ({ ...sampleObservation, input }));

    window.banjiDesktop.sena.listObservations = listObservations;
    window.banjiDesktop.sena.updateObservation = updateObservation;
    window.banjiDesktop.sena.triggerRun = vi.fn(async () => renamedRun);
    window.banjiDesktop.sena.getWorkspaceSummary = vi
      .fn()
      .mockResolvedValueOnce(sampleWorkspace)
      .mockResolvedValueOnce(renamedWorkspace);

    function RenameHarness() {
      const inventory = useInventory();
      return (
        <div>
          <div data-testid="sku-id">{inventory.catalog?.skus[0]?.skuId ?? 'none'}</div>
          <div data-testid="observation-sku">{inventory.observations[0]?.input.stockSnapshot[0]?.skuId ?? 'none'}</div>
          <div data-testid="latest-run-id">{inventory.latestRun?.runId ?? 'none'}</div>
          <button
            type="button"
            onClick={() =>
              void inventory.renameCatalogEntity({
                entityType: 'sku',
                previousId: 'sku-1',
                nextSku: {
                  ...sampleCatalog.skus[0],
                  skuId: 'sku-renamed',
                },
              })
            }
          >
            rename sku
          </button>
        </div>
      );
    }

    render(
      <InventoryProvider>
        <RenameHarness />
      </InventoryProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('sku-id').textContent).toBe('sku-1');
    });

    fireEvent.click(screen.getByText('rename sku'));

    await waitFor(() => {
      expect(window.banjiDesktop.sena.upsertCatalog).toHaveBeenCalledWith(
        expect.objectContaining({
          skus: [expect.objectContaining({ skuId: 'sku-renamed' })],
        }),
      );
    });
    await waitFor(() => {
      expect(updateObservation).toHaveBeenCalledWith(
        expect.objectContaining({
          observationId: 'obs-1',
          input: expect.objectContaining({
            stockSnapshot: renamedObservation.input.stockSnapshot,
            retailRankings: renamedObservation.input.retailRankings,
            retailStockouts: renamedObservation.input.retailStockouts,
            orderSignals: renamedObservation.input.orderSignals,
            retailPrices: renamedObservation.input.retailPrices,
            leadTimeHints: renamedObservation.input.leadTimeHints,
            adjustmentSignals: renamedObservation.input.adjustmentSignals,
            recipeUsageHints: renamedObservation.input.recipeUsageHints,
            retailSalesSnapshot: renamedObservation.input.retailSalesSnapshot,
          }),
        }),
      );
    });
    expect(window.banjiDesktop.sena.clearDetailCache).toHaveBeenCalledWith({ entityId: 'sku-1', entityType: 'sku' });
    expect(window.banjiDesktop.sena.clearDetailCache).toHaveBeenCalledWith({
      entityId: 'sku-renamed',
      entityType: 'sku',
    });
    await waitFor(() => {
      expect(window.banjiDesktop.sena.triggerRun).toHaveBeenCalledWith({ algorithmVersion: 'sena-analysis-v3' });
    });
    await waitFor(() => {
      expect(screen.getByTestId('sku-id').textContent).toBe('sku-renamed');
      expect(screen.getByTestId('observation-sku').textContent).toBe('sku-renamed');
      expect(screen.getByTestId('latest-run-id').textContent).toBe('run-2');
    });
  });
});
