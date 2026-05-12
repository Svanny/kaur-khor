import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  DesktopBridge,
  DesktopPreferences,
} from '@shared/ipc';
import type {
  SenaAnalysisRunRecord,
  SenaCatalog,
  SenaDiagnostics,
  SenaObservationFingerprint,
  SenaOrderBatchRecord,
  SenaRecordUpdateContext,
  SenaObservationRecord,
  SenaSkuDetailPage,
  SenaServiceDetail,
  SenaSkuDetail,
  SenaWorkspaceSummary,
} from '@shared/sena';
import {
  deriveSenaDetailCacheFreshnessFingerprint,
  readPersistedSenaDetailPage,
  writePersistedSenaDetailPage,
} from '@/lib/sena-detail-page-cache';
import { InventoryProvider, useInventory } from './inventory';

function createStorageMock(): Storage {
  const values = new Map<string, string>();
  return {
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => Array.from(values.keys())[index] ?? null,
    get length() {
      return values.size;
    },
    removeItem: (key) => {
      values.delete(key);
    },
    setItem: (key, value) => {
      values.set(key, value);
    },
  };
}

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

const sampleObservationFingerprint: SenaObservationFingerprint = {
  count: 1,
  latestObservedAt: sampleObservation.input.observedAt,
  latestObservationId: sampleObservation.observationId,
};

const emptyObservationFingerprint: SenaObservationFingerprint = {
  count: 0,
  latestObservedAt: null,
  latestObservationId: null,
};

const sampleRecordUpdateContext: SenaRecordUpdateContext = {
  observationFingerprint: sampleObservationFingerprint,
  latestObservedAt: sampleObservation.input.observedAt,
  latestStockBySku: {
    'sku-1': {
      observationId: sampleObservation.observationId,
      observedAt: sampleObservation.input.observedAt,
      value: sampleObservation.input.stockSnapshot[0]!,
    },
  },
  latestRetailSaleBySku: {},
  latestServiceSaleByService: {},
  latestOrderBySku: {},
  latestReceiptBySku: {},
  openTicketsByFamily: { customer: [], supplier: [] },
  latestTicketsById: {},
  latestDeliveryFeeByBucket: {},
  recentActivity: [],
};

const emptyRecordUpdateContext: SenaRecordUpdateContext = {
  observationFingerprint: emptyObservationFingerprint,
  latestObservedAt: null,
  latestStockBySku: {},
  latestRetailSaleBySku: {},
  latestServiceSaleByService: {},
  latestOrderBySku: {},
  latestReceiptBySku: {},
  openTicketsByFamily: { customer: [], supplier: [] },
  latestTicketsById: {},
  latestDeliveryFeeByBucket: {},
  recentActivity: [],
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

function makeSkuDetailPage(latestIntervalIndex: number): SenaSkuDetailPage {
  return {
    detail: {
      ...sampleSkuDetail,
      demandPosterior: [
        {
          adjustmentsMean: 0,
          deltaDays: 1,
          endAt: '2026-04-02T00:00:00Z',
          intervalIndex: latestIntervalIndex,
          realizedConsumptionMean: 1,
          receiptsMean: 0,
          retailDemandMean: 1,
          serviceDemandMean: 0,
          startAt: '2026-04-01T00:00:00Z',
          unconstrainedDemandMean: 1,
        },
      ],
    },
    hasOlder: false,
    latestIntervalIndex,
    nextBeforeIntervalIndex: null,
    pageLimit: 20,
  };
}

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((nextResolve) => {
    resolve = nextResolve;
  });
  return { promise, resolve };
}

function TestHarness() {
  const inventory = useInventory();

  return (
    <div>
      <div data-testid="loading">{String(inventory.isLoading)}</div>
      <div data-testid="catalog-count">{inventory.catalog?.skus.length ?? 0}</div>
      <div data-testid="workspace-run">{inventory.workspaceSummary?.runId ?? 'none'}</div>
      <div data-testid="latest-run">{inventory.latestRun?.runId ?? 'none'}</div>
      <div data-testid="diagnostics-loaded">{String(inventory.diagnostics != null)}</div>
      <div data-testid="observation-count">{inventory.observations.length}</div>
      <div data-testid="order-batch-count">{inventory.orderBatches.length}</div>
      <button type="button" onClick={() => void inventory.loadSenaSkuDetail('sku-1')}>
        load sku
      </button>
      <button type="button" onClick={() => void inventory.triggerSenaRun()}>
        trigger run
      </button>
      <button type="button" onClick={() => void inventory.loadWorkSupportData({ includeObservations: true })}>
        load work support
      </button>
    </div>
  );
}

describe('InventoryProvider', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  beforeEach(() => {
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      value: createStorageMock(),
    });
    const bridge: DesktopBridge = {
      system: {
        getAppContext: vi.fn(),
        getLocalDataInfo: vi.fn(),
        revealPath: vi.fn(),
      },
      preferences: {
        get: vi.fn<() => Promise<DesktopPreferences>>(),
        save: vi.fn<() => Promise<DesktopPreferences>>(),
      },
      sena: {
        getCatalog: vi.fn(async () => sampleCatalog),
        getObservationFingerprint: vi.fn(async () => sampleObservationFingerprint),
        getRecordUpdateContext: vi.fn(async () => sampleRecordUpdateContext),
        getStartupWorkspace: vi.fn(async () => ({
          catalog: sampleCatalog,
          workspaceSummary: sampleWorkspace,
          latestRun: sampleRun,
          observationFingerprint: sampleObservationFingerprint,
        })),
        listObservationPage: vi.fn(async () => ({
          observations: [sampleObservation],
          nextCursor: null,
          hasOlder: false,
          totalCount: 1,
          latestObservedAt: sampleObservation.input.observedAt,
        })),
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
    window.kaurKhorDesktop = bridge;
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
    expect(window.kaurKhorDesktop.sena.getStartupWorkspace).toHaveBeenCalledTimes(1);
    expect(window.kaurKhorDesktop.sena.getCatalog).not.toHaveBeenCalled();
    expect(window.kaurKhorDesktop.sena.getWorkspaceSummary).not.toHaveBeenCalled();
    expect(window.kaurKhorDesktop.sena.getRunStatus).not.toHaveBeenCalled();
  });

  it('marks startup ready before route or idle support reads finish', async () => {
    const diagnostics = deferred<SenaDiagnostics | null>();
    window.kaurKhorDesktop.sena.getDiagnostics = vi.fn(async () => diagnostics.promise);
    window.kaurKhorDesktop.sena.getRecordUpdateContext = vi.fn(async () => sampleRecordUpdateContext);
    window.kaurKhorDesktop.sena.listOrderBatches = vi.fn(async () => []);

    render(
      <InventoryProvider>
        <TestHarness />
      </InventoryProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('loading').textContent).toBe('false');
    });
    expect(screen.getByTestId('workspace-run').textContent).toBe('run-1');
    expect(screen.getByTestId('diagnostics-loaded').textContent).toBe('false');
    expect(screen.getByTestId('observation-count').textContent).toBe('0');
    expect(window.kaurKhorDesktop.sena.getDiagnostics).not.toHaveBeenCalled();
    expect(window.kaurKhorDesktop.sena.getRecordUpdateContext).not.toHaveBeenCalled();
    expect(window.kaurKhorDesktop.sena.listOrderBatches).not.toHaveBeenCalled();
    expect(window.kaurKhorDesktop.sena.listObservations).not.toHaveBeenCalled();
  });

  it('loads route-driven Work support data without full startup hydration', async () => {
    render(
      <InventoryProvider>
        <TestHarness />
      </InventoryProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('loading').textContent).toBe('false');
    });
    expect(screen.getByTestId('observation-count').textContent).toBe('0');

    fireEvent.click(screen.getByText('load work support'));

    await waitFor(() => {
      expect(screen.getByTestId('observation-count').textContent).toBe('1');
      expect(window.kaurKhorDesktop.sena.getRecordUpdateContext).toHaveBeenCalledTimes(1);
      expect(window.kaurKhorDesktop.sena.listOrderBatches).toHaveBeenCalledTimes(1);
      expect(window.kaurKhorDesktop.sena.listObservationPage).toHaveBeenCalledWith({ limit: 20 });
    });
    expect(window.kaurKhorDesktop.sena.listObservations).not.toHaveBeenCalled();
  });

  it('keeps the startup workspace visible when deferred hydration fails', async () => {
    window.kaurKhorDesktop.sena.getDiagnostics = vi.fn(async () => {
      throw new Error('diagnostics unavailable');
    });
    window.kaurKhorDesktop.sena.getRecordUpdateContext = vi.fn(async () => {
      throw new Error('record context unavailable');
    });
    window.kaurKhorDesktop.sena.listOrderBatches = vi.fn(async () => {
      throw new Error('orders unavailable');
    });

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
    expect(screen.getByTestId('diagnostics-loaded').textContent).toBe('false');
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
      expect(window.kaurKhorDesktop.sena.getSkuDetail).toHaveBeenCalledTimes(1);
    });

    fireEvent.click(screen.getByText('trigger run'));

    await waitFor(() => {
      expect(window.kaurKhorDesktop.sena.triggerRun).toHaveBeenCalledTimes(1);
    });
    expect(window.kaurKhorDesktop.sena.getWorkspaceSummary).toHaveBeenCalledTimes(1);
  });

  it('returns a persisted detail page immediately and refreshes local storage in the background', async () => {
    function CacheHarness() {
      const inventory = useInventory();
      const [latestIntervalIndex, setLatestIntervalIndex] = useState<string>('none');

      return (
        <div>
          <div data-testid="cache-workspace-run">{inventory.workspaceSummary?.runId ?? 'none'}</div>
          <div data-testid="latest-interval-index">{latestIntervalIndex}</div>
          <button
            type="button"
            onClick={() =>
              void inventory.loadSenaSkuDetail('sku-1').then((page) => {
                setLatestIntervalIndex(String(page?.latestIntervalIndex ?? 'none'));
              })
            }
          >
            load cached sku
          </button>
        </div>
      );
    }

    const freshnessFingerprint = deriveSenaDetailCacheFreshnessFingerprint(sampleWorkspace);
    const livePage = deferred<SenaSkuDetailPage>();
    writePersistedSenaDetailPage({
      beforeIntervalIndex: null,
      entityId: 'sku-1',
      entityType: 'sku',
      freshnessFingerprint,
      limit: 20,
      page: makeSkuDetailPage(20),
      storage: window.localStorage,
    });
    window.kaurKhorDesktop.sena.getSkuDetail = vi.fn(async () => livePage.promise);

    render(
      <InventoryProvider>
        <CacheHarness />
      </InventoryProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('cache-workspace-run').textContent).toBe('run-1');
    });

    fireEvent.click(screen.getByText('load cached sku'));

    await waitFor(() => {
      expect(screen.getByTestId('latest-interval-index').textContent).toBe('20');
    });

    await act(async () => {
      livePage.resolve(makeSkuDetailPage(40));
      await livePage.promise;
    });

    await waitFor(() => {
      expect(window.kaurKhorDesktop.sena.getSkuDetail).toHaveBeenCalledTimes(1);
    });
    expect(readPersistedSenaDetailPage<SenaSkuDetailPage>({
      beforeIntervalIndex: null,
      entityId: 'sku-1',
      entityType: 'sku',
      freshnessFingerprint,
      limit: 20,
      storage: window.localStorage,
    })?.latestIntervalIndex).toBe(40);
  });

  it('updates and deletes observations through the bridge and refreshes cached observations', async () => {
    function ObservationHarness() {
      const inventory = useInventory();
      return (
        <div>
          <div data-testid="observation-count">{inventory.observations.length}</div>
          <div data-testid="workspace-run">{inventory.workspaceSummary?.runId ?? 'none'}</div>
          <div data-testid="latest-run">{inventory.latestRun?.runId ?? 'none'}</div>
          <button type="button" onClick={() => void inventory.listSenaObservationPage()}>
            load observation page
          </button>
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

    window.kaurKhorDesktop.sena.getRecordUpdateContext = vi
      .fn()
      .mockResolvedValueOnce(sampleRecordUpdateContext)
      .mockResolvedValueOnce(emptyRecordUpdateContext);

    render(
      <InventoryProvider>
        <ObservationHarness />
      </InventoryProvider>,
    );

    fireEvent.click(screen.getByText('load observation page'));

    await waitFor(() => {
      expect(screen.getByTestId('observation-count').textContent).toBe('1');
      expect(screen.getByTestId('workspace-run').textContent).toBe('run-1');
      expect(screen.getByTestId('latest-run').textContent).toBe('run-1');
    });
    expect(window.kaurKhorDesktop.sena.listObservations).not.toHaveBeenCalled();

    fireEvent.click(screen.getByText('update observation'));

    await waitFor(() => {
      expect(window.kaurKhorDesktop.sena.updateObservation).toHaveBeenCalledWith({
        observationId: 'obs-1',
        input: {
          ...sampleObservation.input,
          notes: 'Edited',
        },
      });
    });

    fireEvent.click(screen.getByText('delete observation'));

    await waitFor(() => {
      expect(window.kaurKhorDesktop.sena.deleteObservation).toHaveBeenCalledWith({ observationId: 'obs-1' });
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
    window.kaurKhorDesktop.sena.getCatalog = vi.fn(async () => legacyCatalog as SenaCatalog);
    window.kaurKhorDesktop.sena.upsertCatalog = upsertCatalog;

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
        ticketEvents: [
          {
            ticketId: 'customer-ticket-1',
            ticketFamily: 'customer',
            lifecycle: 'open',
            stage: 'pending',
            revision: 1,
            eventType: 'created',
            occurredAt: '2026-04-02T00:00:00Z',
            lines: [
              { entityType: 'sku', entityId: 'sku-1', quantityDelta: -2 },
              { entityType: 'service', entityId: 'service-1', quantityDelta: -1 },
            ],
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
        ticketEvents: [
          {
            ticketId: 'customer-ticket-1',
            ticketFamily: 'customer',
            lifecycle: 'open',
            stage: 'pending',
            revision: 1,
            eventType: 'created',
            occurredAt: '2026-04-02T00:00:00Z',
            lines: [
              { entityType: 'sku', entityId: 'sku-renamed', quantityDelta: -2 },
              { entityType: 'service', entityId: 'service-1', quantityDelta: -1 },
            ],
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
      .mockResolvedValueOnce([renamedObservation]);
    const updateObservation = vi.fn(async ({ input }) => ({ ...sampleObservation, input }));

    window.kaurKhorDesktop.sena.listObservations = listObservations;
    window.kaurKhorDesktop.sena.updateObservation = updateObservation;
    window.kaurKhorDesktop.sena.triggerRun = vi.fn(async () => renamedRun);
    window.kaurKhorDesktop.sena.getWorkspaceSummary = vi
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
      expect(window.kaurKhorDesktop.sena.upsertCatalog).toHaveBeenCalledWith(
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
            ticketEvents: renamedObservation.input.ticketEvents,
            retailSalesSnapshot: renamedObservation.input.retailSalesSnapshot,
          }),
        }),
      );
    });
    expect(window.kaurKhorDesktop.sena.clearDetailCache).toHaveBeenCalledWith({ entityId: 'sku-1', entityType: 'sku' });
    expect(window.kaurKhorDesktop.sena.clearDetailCache).toHaveBeenCalledWith({
      entityId: 'sku-renamed',
      entityType: 'sku',
    });
    await waitFor(() => {
      expect(window.kaurKhorDesktop.sena.triggerRun).toHaveBeenCalledWith({ algorithmVersion: 'sena-analysis-v3' });
    });
    await waitFor(() => {
      expect(screen.getByTestId('sku-id').textContent).toBe('sku-renamed');
      expect(screen.getByTestId('observation-sku').textContent).toBe('sku-renamed');
      expect(screen.getByTestId('latest-run-id').textContent).toBe('run-2');
    });
  });

  it('rolls back historical observation rewrites if catalog rename order-child rewrites fail', async () => {
    const richObservation: SenaObservationRecord = {
      ...sampleObservation,
      input: {
        ...sampleObservation.input,
        stockSnapshot: [{ skuId: 'sku-1', unitsInStock: 10, costPerUnit: 4, productPrice: 9 }],
      },
    };
    const renamedInput = {
      ...richObservation.input,
      stockSnapshot: [{ skuId: 'sku-renamed', unitsInStock: 10, costPerUnit: 4, productPrice: 9 }],
    };
    const orderBatch: SenaOrderBatchRecord = {
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
      children: [{
        childOrderId: 'orders/2026/04/15/000000/test/0001/items/sku-1/0001',
        skuId: 'sku-1',
        status: 'open',
        createdAt: '2026-04-15T00:00:00Z',
        updatedAt: '2026-04-15T00:00:00Z',
        inheritedFromBatch: true,
        effective: {
          supplierName: 'Test supplier',
          supplierNote: null,
          orderedQuantity: 4,
          receivedQuantity: 0,
          costPerUnit: 4,
          expectedArrivalAt: null,
          placementTimestamp: null,
          receiptTimestamp: null,
          leadTimeDaysHint: null,
          leadTimeVariability: null,
        },
        overrides: {},
      }],
    };
    const updateObservation = vi.fn(async ({ input }) => ({ ...sampleObservation, input }));
    const updateOrderChild = vi.fn(async () => {
      throw new Error('order child rewrite failed');
    });

    window.kaurKhorDesktop.sena.listObservations = vi.fn(async () => [richObservation]);
    window.kaurKhorDesktop.sena.listOrderBatches = vi.fn(async () => [orderBatch]);
    window.kaurKhorDesktop.sena.updateObservation = updateObservation;
    window.kaurKhorDesktop.sena.updateOrderChild = updateOrderChild;
    window.kaurKhorDesktop.sena.upsertCatalog = vi.fn(async (payload: SenaCatalog) => payload);

    function RenameFailureHarness() {
      const inventory = useInventory();
      return (
        <div>
          <div data-testid="sku-id">{inventory.catalog?.skus[0]?.skuId ?? 'none'}</div>
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
              }).catch(() => undefined)
            }
          >
            rename sku
          </button>
        </div>
      );
    }

    render(
      <InventoryProvider>
        <RenameFailureHarness />
      </InventoryProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('sku-id').textContent).toBe('sku-1');
    });

    fireEvent.click(screen.getByText('rename sku'));

    await waitFor(() => {
      expect(updateOrderChild).toHaveBeenCalledWith({
        childOrderId: 'orders/2026/04/15/000000/test/0001/items/sku-1/0001',
        skuId: 'sku-renamed',
      });
    });
    expect(window.kaurKhorDesktop.sena.upsertCatalog).not.toHaveBeenCalled();
    expect(updateObservation).toHaveBeenNthCalledWith(1, expect.objectContaining({
      observationId: 'obs-1',
      input: expect.objectContaining({
        stockSnapshot: renamedInput.stockSnapshot,
      }),
    }));
    expect(updateObservation).toHaveBeenNthCalledWith(2, expect.objectContaining({
      observationId: 'obs-1',
      input: expect.objectContaining({
        stockSnapshot: richObservation.input.stockSnapshot,
      }),
    }));
  });

  it('renames a service and rewrites matching ticket event lines', async () => {
    const serviceObservation: SenaObservationRecord = {
      ...sampleObservation,
      input: {
        ...sampleObservation.input,
        serviceSalesSnapshot: [{ serviceId: 'service-1', unitsSold: 3 }],
        ticketEvents: [
          {
            ticketId: 'supplier-ticket-1',
            ticketFamily: 'supplier',
            lifecycle: 'open',
            stage: 'ordered_waiting',
            revision: 1,
            eventType: 'created',
            occurredAt: '2026-04-02T00:00:00Z',
            lines: [
              { entityType: 'service', entityId: 'service-1', orderedQuantity: 2 },
              { entityType: 'sku', entityId: 'sku-1', orderedQuantity: 5 },
            ],
          },
        ],
      },
    };
    const updateObservation = vi.fn(async ({ input }) => ({ ...sampleObservation, input }));

    window.kaurKhorDesktop.sena.listObservations = vi.fn(async () => [serviceObservation]);
    window.kaurKhorDesktop.sena.updateObservation = updateObservation;

    function RenameServiceHarness() {
      const inventory = useInventory();
      return (
        <div>
          <div data-testid="service-id">{inventory.catalog?.services[0]?.serviceId ?? 'none'}</div>
          <button
            type="button"
            onClick={() =>
              void inventory.renameCatalogEntity({
                entityType: 'service',
                previousId: 'service-1',
                nextService: {
                  ...sampleCatalog.services[0],
                  serviceId: 'service-renamed',
                },
                skuIds: ['sku-1'],
              })
            }
          >
            rename service
          </button>
        </div>
      );
    }

    render(
      <InventoryProvider>
        <RenameServiceHarness />
      </InventoryProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('service-id').textContent).toBe('service-1');
    });

    fireEvent.click(screen.getByText('rename service'));

    await waitFor(() => {
      expect(updateObservation).toHaveBeenCalledWith(
        expect.objectContaining({
          observationId: 'obs-1',
          input: expect.objectContaining({
            ticketEvents: [
              {
                ticketId: 'supplier-ticket-1',
                ticketFamily: 'supplier',
                lifecycle: 'open',
                stage: 'ordered_waiting',
                revision: 1,
                eventType: 'created',
                occurredAt: '2026-04-02T00:00:00Z',
                lines: [
                  { entityType: 'service', entityId: 'service-renamed', orderedQuantity: 2 },
                  { entityType: 'sku', entityId: 'sku-1', orderedQuantity: 5 },
                ],
              },
            ],
          }),
        }),
      );
    });
  });
});
