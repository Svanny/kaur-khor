import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { getTranslation } from '@/lib/localization/translations';
import type { InventoryContextValue } from '@/state/inventory';
import type { SenaAnalysisRunRecord } from '@shared/sena';
import { AnalysisContent } from './analysis-content';

const analysisWorkbenchMock = vi.fn();
const analysisTradingChartLedgerMock = vi.fn();

vi.mock('./analysis-workbench', () => ({
  AnalysisWorkbench: (props: Record<string, unknown>) => {
    analysisWorkbenchMock(props);
    return (
      <div>
        <div data-testid="chart-zoom-reset-token">{String(props.chartZoomResetToken)}</div>
        <button type="button" onClick={() => (props.setTimeframe as (value: string) => void)('YTD')}>
          Choose timeframe
        </button>
        <button
          type="button"
          onClick={() => (props.onCustomTimeframeChange as ((value: { startAt: string; endAt: string } | null) => void) | undefined)?.({
            startAt: '2026-03-01T00:00:00.000Z',
            endAt: '2026-03-31T23:59:59.999Z',
          })}
        >
          Choose custom timeframe
        </button>
        <button type="button" onClick={() => (props.onToggleExpand as (() => void) | undefined)?.()}>
          Expand ledger
        </button>
      </div>
    );
  },
}));

vi.mock('./trading-chart-ledger', () => ({
  AnalysisTradingChartLedger: (props: Record<string, unknown>) => {
    analysisTradingChartLedgerMock(props);
    return (
      <div data-testid="expanded-analysis-ledger">
        <div data-testid="expanded-chart-zoom-reset-token">{String(props.chartZoomResetToken)}</div>
        <button type="button" onClick={() => (props.onToggleExpand as (() => void) | undefined)?.()}>
          Close expanded ledger
        </button>
      </div>
    );
  },
}));

vi.mock('./analysis-view-model', () => ({
  deriveAnalysisViewModel: () => ({
    internalNavSummary: '3 observations · 2 intervals',
    lastUpdatedLabel: 'Updated Apr 3, 2026',
  }),
}));

vi.mock('@/state/preferences', () => ({
  usePreferences: () => ({
    showFloatingTitleActions: false,
    t: (key: string, variables?: Record<string, string | number | null | undefined>) =>
      getTranslation('en', key as never, variables),
  }),
}));

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((nextResolve, nextReject) => {
    resolve = nextResolve;
    reject = nextReject;
  });
  return { promise, reject, resolve };
}

function makeRun(runId: string): SenaAnalysisRunRecord {
  return {
    algorithmVersion: 'sena-analysis-v3',
    completedAt: '2026-04-03T08:00:00.000Z',
    createdAt: '2026-04-03T08:00:00.000Z',
    diagnostics: null,
    error: null,
    observationCount: 0,
    ownerSub: 'desktop-owner',
    primaryArtifactKey: null,
    runId,
    status: 'succeeded',
    summary: null,
  };
}

function createInventory(overrides: Partial<InventoryContextValue> = {}): InventoryContextValue {
  return {
    snapshot: null,
    reports: [],
    catalog: {
      schemaVersion: 1,
      skus: [],
      services: [],
      bundles: [],
      sharingMask: [],
    },
    diagnostics: null,
    error: null,
    isLoading: false,
    isPreparingWorkspace: false,
    isSaving: false,
    latestRun: makeRun('run-1'),
    observationFingerprint: null,
    observations: [],
    orderBatches: [],
    recordUpdateContext: null,
    senaMeta: {
      catalogHash: null,
      lastBootstrapSkuId: null,
      lastCompletedRunId: null,
    },
    retrySenaRun: vi.fn(async () => makeRun('run-1')),
    triggerSenaRun: vi.fn(async () => makeRun('run-2')),
    workspaceSummary: {
      ownerSub: 'desktop-owner',
      runId: 'run-1',
      latestObservedAt: '2026-04-03T08:00:00.000Z',
      skuCount: 0,
      serviceCount: 0,
      intervalCount: 0,
      pendingReorderCount: 0,
      topRegime: 'normal',
      highRiskSkuIds: [],
      skuSummaries: [],
    },
    reload: vi.fn(async () => {}),
    loadInventorySnapshot: vi.fn(async () => {
      throw new Error('loadInventorySnapshot is not implemented in this test fixture');
    }),
    listStockReports: vi.fn(async () => []),
    upsertSenaCatalog: vi.fn(async (payload) => payload),
    renameCatalogEntity: vi.fn(async () => {
      throw new Error('renameCatalogEntity is not implemented in this test fixture');
    }),
    archiveCatalogEntity: vi.fn(async () => {
      throw new Error('archiveCatalogEntity is not implemented in this test fixture');
    }),
    deleteCatalogEntity: vi.fn(async () => {
      throw new Error('deleteCatalogEntity is not implemented in this test fixture');
    }),
    unarchiveCatalogEntity: vi.fn(async () => {
      throw new Error('unarchiveCatalogEntity is not implemented in this test fixture');
    }),
    loadSenaCatalog: vi.fn(async () => null),
    ingestSenaObservation: vi.fn(async (payload) => ({ input: payload, observationId: 'obs-test', ownerSub: 'desktop-owner' })),
    updateSenaObservation: vi.fn(async (payload) => ({
      input: payload.input,
      observationId: payload.observationId,
      ownerSub: 'desktop-owner',
    })),
    deleteSenaObservation: vi.fn(async () => {}),
    listSenaObservations: vi.fn(async () => []),
    loadSenaObservations: vi.fn(async () => []),
    listSenaObservationPage: vi.fn(async () => ({
      hasOlder: false,
      latestObservedAt: null,
      nextCursor: null,
      observations: [],
      totalCount: 0,
    })),
    loadWorkSupportData: vi.fn(async () => ({
      observationPage: null,
      orderBatches: [],
      recordUpdateContext: {
        latestDeliveryFeeByBucket: {},
        latestObservedAt: null,
        latestOrderBySku: {},
        latestReceiptBySku: {},
        latestRetailSaleBySku: {},
        latestServiceSaleByService: {},
        latestStockBySku: {},
        latestTicketsById: {},
        observationFingerprint: { count: 0, latestObservationId: null, latestObservedAt: null },
        openTicketsByFamily: { customer: [], supplier: [] },
        recentActivity: [],
      },
    })),
    loadSenaRecordUpdateContext: vi.fn(async () => ({
      latestDeliveryFeeByBucket: {},
      latestObservedAt: null,
      latestOrderBySku: {},
      latestReceiptBySku: {},
      latestRetailSaleBySku: {},
      latestServiceSaleByService: {},
      latestStockBySku: {},
      latestTicketsById: {},
      observationFingerprint: { count: 0, latestObservationId: null, latestObservedAt: null },
      openTicketsByFamily: { customer: [], supplier: [] },
      recentActivity: [],
    })),
    listSenaOrderBatches: vi.fn(async () => []),
    loadSenaOrderBatches: vi.fn(async () => []),
    createSenaOrderBatch: vi.fn(async () => {
      throw new Error('createSenaOrderBatch is not implemented in this test fixture');
    }),
    updateSenaOrderBatch: vi.fn(async () => {
      throw new Error('updateSenaOrderBatch is not implemented in this test fixture');
    }),
    updateSenaOrderChild: vi.fn(async () => {
      throw new Error('updateSenaOrderChild is not implemented in this test fixture');
    }),
    splitSenaOrderChild: vi.fn(async () => {
      throw new Error('splitSenaOrderChild is not implemented in this test fixture');
    }),
    runSavingTask: vi.fn(async (task) => task()),
    runWorkspacePreparation: vi.fn(async (task) => task()),
    loadSenaWorkspaceSummary: vi.fn(async () => null),
    loadSenaSkuDetail: vi.fn(async () => null),
    loadSenaServiceDetail: vi.fn(async () => null),
    clearSenaSkuDetailCache: vi.fn(async () => {}),
    clearSenaServiceDetailCache: vi.fn(async () => {}),
    loadSenaDiagnostics: vi.fn(async () => null),
    loadSenaRunStatus: vi.fn(async () => null),
    loadSenaAnalysisArtifact: vi.fn(async () => null),
    updateSenaMeta: vi.fn(),
    ...overrides,
  };
}

describe('AnalysisContent', () => {
  it('loads SENA analysis artifacts only for the variables section', async () => {
    analysisWorkbenchMock.mockClear();
    const loadSenaAnalysisArtifact = vi.fn(async () => null);
    const variablesInventory = createInventory({ loadSenaAnalysisArtifact });

    render(
      <AnalysisContent
        currency="USD"
        hasOlderIntervals={false}
        inventory={variablesInventory}
        isHydratingDetails={false}
        isLoadingOlderIntervals={false}
        language="en"
        loadOlderIntervals={vi.fn(async () => 0)}
        resetHydratedDetails={vi.fn(async () => {})}
        scope="all"
        section="variables"
        serviceDetailsById={{}}
        setScope={vi.fn()}
        setSection={vi.fn()}
        showRightRailCards={false}
        skuDetailsById={{}}
        timeframeHydrationProgress={null}
      />,
    );

    await waitFor(() => {
      expect(loadSenaAnalysisArtifact).toHaveBeenCalledWith('run-1');
    });

    loadSenaAnalysisArtifact.mockClear();
    render(
      <AnalysisContent
        currency="USD"
        hasOlderIntervals={false}
        inventory={createInventory({ loadSenaAnalysisArtifact })}
        isHydratingDetails={false}
        isLoadingOlderIntervals={false}
        language="en"
        loadOlderIntervals={vi.fn(async () => 0)}
        resetHydratedDetails={vi.fn(async () => {})}
        scope="all"
        section="workbench"
        serviceDetailsById={{}}
        setScope={vi.fn()}
        setSection={vi.fn()}
        showRightRailCards={false}
        skuDetailsById={{}}
        timeframeHydrationProgress={null}
      />,
    );

    expect(loadSenaAnalysisArtifact).not.toHaveBeenCalled();
  });

  it('forwards SENA artifact loading and error state to the workbench', async () => {
    analysisWorkbenchMock.mockClear();
    const pendingArtifact = deferred<null>();
    const loadSenaAnalysisArtifact = vi.fn(() => pendingArtifact.promise);

    render(
      <AnalysisContent
        currency="USD"
        hasOlderIntervals={false}
        inventory={createInventory({ loadSenaAnalysisArtifact })}
        isHydratingDetails={false}
        isLoadingOlderIntervals={false}
        language="en"
        loadOlderIntervals={vi.fn(async () => 0)}
        resetHydratedDetails={vi.fn(async () => {})}
        scope="all"
        section="variables"
        serviceDetailsById={{}}
        setScope={vi.fn()}
        setSection={vi.fn()}
        showRightRailCards={false}
        skuDetailsById={{}}
        timeframeHydrationProgress={null}
      />,
    );

    await waitFor(() => {
      expect(analysisWorkbenchMock).toHaveBeenLastCalledWith(
        expect.objectContaining({ isAnalysisArtifactLoading: true }),
      );
    });

    pendingArtifact.reject(new Error('artifact failed'));

    await waitFor(() => {
      expect(analysisWorkbenchMock).toHaveBeenLastCalledWith(
        expect.objectContaining({
          analysisArtifact: null,
          analysisArtifactError: 'artifact failed',
          isAnalysisArtifactLoading: false,
        }),
      );
    });
  });

  it('prefers the latest run id when loading SENA analysis artifacts', async () => {
    const loadSenaAnalysisArtifact = vi.fn(async () => null);

    render(
      <AnalysisContent
        currency="USD"
        hasOlderIntervals={false}
        inventory={createInventory({
          latestRun: makeRun('latest-run'),
          loadSenaAnalysisArtifact,
          workspaceSummary: {
            ...createInventory().workspaceSummary!,
            runId: 'summary-run',
          },
        })}
        isHydratingDetails={false}
        isLoadingOlderIntervals={false}
        language="en"
        loadOlderIntervals={vi.fn(async () => 0)}
        resetHydratedDetails={vi.fn(async () => {})}
        scope="all"
        section="variables"
        serviceDetailsById={{}}
        setScope={vi.fn()}
        setSection={vi.fn()}
        showRightRailCards={false}
        skuDetailsById={{}}
        timeframeHydrationProgress={null}
      />,
    );

    await waitFor(() => {
      expect(loadSenaAnalysisArtifact).toHaveBeenCalledWith('latest-run');
    });
    expect(loadSenaAnalysisArtifact).not.toHaveBeenCalledWith('summary-run');
  });

  it('resets chart zoom fitting when the timeframe changes', async () => {
    const user = userEvent.setup();
    const setTimeframe = vi.fn();

    render(
      <AnalysisContent
        currency="USD"
        hasOlderIntervals={false}
        inventory={createInventory()}
        isHydratingDetails={false}
        isLoadingOlderIntervals={false}
        language="en"
        loadOlderIntervals={vi.fn(async () => 0)}
        resetHydratedDetails={vi.fn(async () => {})}
        scope="all"
        section="workbench"
        serviceDetailsById={{}}
        setCustomTimeframeRange={vi.fn()}
        setScope={vi.fn()}
        setSection={vi.fn()}
        setTimeframe={setTimeframe}
        showRightRailCards={false}
        skuDetailsById={{}}
        timeframe="Recent"
        timeframeHydrationProgress={null}
      />,
    );

    expect(screen.getByTestId('chart-zoom-reset-token')).toHaveTextContent('0');

    await user.click(screen.getByRole('button', { name: 'Choose timeframe' }));

    expect(setTimeframe).toHaveBeenCalledWith('YTD');
    expect(screen.getByTestId('chart-zoom-reset-token')).toHaveTextContent('1');
    expect(screen.getByText('Loading data')).toBeInTheDocument();
  });

  it('shows one loading label when a timeframe load spans multiple batches', () => {
    render(
      <AnalysisContent
        currency="USD"
        hasOlderIntervals={false}
        inventory={createInventory()}
        isHydratingDetails={true}
        isLoadingOlderIntervals={false}
        language="en"
        loadOlderIntervals={vi.fn(async () => 0)}
        resetHydratedDetails={vi.fn(async () => {})}
        scope="all"
        section="workbench"
        serviceDetailsById={{}}
        setCustomTimeframeRange={vi.fn()}
        setScope={vi.fn()}
        setSection={vi.fn()}
        setTimeframe={vi.fn()}
        showRightRailCards={false}
        skuDetailsById={{}}
        timeframe="Recent"
        timeframeHydrationProgress={{ current: 3, total: 31 }}
      />,
    );

    expect(screen.getByText('Loading data')).toBeInTheDocument();
    expect(screen.queryByText('[3/31]')).toBeNull();
  });

  it('uses the same loading label for MAX loads too', () => {
    render(
      <AnalysisContent
        currency="USD"
        hasOlderIntervals={false}
        inventory={createInventory()}
        isHydratingDetails={true}
        isLoadingOlderIntervals={false}
        language="en"
        loadOlderIntervals={vi.fn(async () => 0)}
        resetHydratedDetails={vi.fn(async () => {})}
        scope="all"
        section="workbench"
        serviceDetailsById={{}}
        setCustomTimeframeRange={vi.fn()}
        setScope={vi.fn()}
        setSection={vi.fn()}
        setTimeframe={vi.fn()}
        showRightRailCards={false}
        skuDetailsById={{}}
        timeframe="MAX"
        timeframeHydrationProgress={{ current: 1, total: 8 }}
      />,
    );

    expect(screen.getByText('Loading data')).toBeInTheDocument();
    expect(screen.queryByText('[1/8]')).toBeNull();
  });

  it('clears the loading island after timeframe hydration completes', async () => {
    const user = userEvent.setup();
    const setTimeframe = vi.fn();

    const { rerender } = render(
      <AnalysisContent
        currency="USD"
        hasOlderIntervals={false}
        inventory={createInventory()}
        isHydratingDetails={false}
        isLoadingOlderIntervals={false}
        language="en"
        loadOlderIntervals={vi.fn(async () => 0)}
        resetHydratedDetails={vi.fn(async () => {})}
        scope="all"
        section="workbench"
        serviceDetailsById={{}}
        setCustomTimeframeRange={vi.fn()}
        setScope={vi.fn()}
        setSection={vi.fn()}
        setTimeframe={setTimeframe}
        showRightRailCards={false}
        skuDetailsById={{}}
        timeframe="Recent"
        timeframeHydrationProgress={null}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Choose timeframe' }));
    expect(screen.getByText('Loading data')).toBeInTheDocument();

    rerender(
      <AnalysisContent
        currency="USD"
        hasOlderIntervals={false}
        inventory={createInventory()}
        isHydratingDetails={true}
        isLoadingOlderIntervals={false}
        language="en"
        loadOlderIntervals={vi.fn(async () => 0)}
        resetHydratedDetails={vi.fn(async () => {})}
        scope="all"
        section="workbench"
        serviceDetailsById={{}}
        setCustomTimeframeRange={vi.fn()}
        setScope={vi.fn()}
        setSection={vi.fn()}
        setTimeframe={setTimeframe}
        showRightRailCards={false}
        skuDetailsById={{}}
        timeframe="YTD"
        timeframeHydrationProgress={{ current: 1, total: 2 }}
      />,
    );

    expect(screen.queryByText('[1/2]')).toBeNull();
    expect(screen.getByText('Loading data')).toBeInTheDocument();

    rerender(
      <AnalysisContent
        currency="USD"
        hasOlderIntervals={false}
        inventory={createInventory()}
        isHydratingDetails={false}
        isLoadingOlderIntervals={false}
        language="en"
        loadOlderIntervals={vi.fn(async () => 0)}
        resetHydratedDetails={vi.fn(async () => {})}
        scope="all"
        section="workbench"
        serviceDetailsById={{}}
        setCustomTimeframeRange={vi.fn()}
        setScope={vi.fn()}
        setSection={vi.fn()}
        setTimeframe={setTimeframe}
        showRightRailCards={false}
        skuDetailsById={{}}
        timeframe="YTD"
        timeframeHydrationProgress={null}
      />,
    );

    await waitFor(() => {
      expect(screen.queryByText('Loading data')).toBeNull();
    }, { timeout: 2000 });
  });

  it('animates and disables the rerun button while analysis is running', async () => {
    const user = userEvent.setup();
    const run = deferred<SenaAnalysisRunRecord>();
    const retrySenaRun = vi.fn(() => run.promise);

    render(
      <AnalysisContent
        currency="USD"
        hasOlderIntervals={false}
        inventory={createInventory({ retrySenaRun })}
        isHydratingDetails={false}
        isLoadingOlderIntervals={false}
        language="en"
        loadOlderIntervals={vi.fn(async () => 0)}
        resetHydratedDetails={vi.fn(async () => {})}
        scope="all"
        section="workbench"
        serviceDetailsById={{}}
        setCustomTimeframeRange={vi.fn()}
        setScope={vi.fn()}
        setSection={vi.fn()}
        setTimeframe={vi.fn()}
        showRightRailCards={false}
        skuDetailsById={{}}
        timeframe="Recent"
        timeframeHydrationProgress={null}
      />,
    );

    const button = screen.getByRole('button', { name: 'Refresh explanation' });
    await user.click(button);

    expect(retrySenaRun).toHaveBeenCalledWith({ runId: 'run-1' });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('aria-busy', 'true');
    expect(button.querySelector('.animate-spin')).not.toBeNull();

    run.resolve(makeRun('run-1'));
    await waitFor(() => {
      expect(button).not.toBeDisabled();
    });
  });

  it('renders only the shared ledger card in expanded mode', async () => {
    const user = userEvent.setup();

    render(
      <AnalysisContent
        currency="USD"
        hasOlderIntervals={false}
        inventory={createInventory()}
        isHydratingDetails={false}
        isLoadingOlderIntervals={false}
        language="en"
        loadOlderIntervals={vi.fn(async () => 0)}
        resetHydratedDetails={vi.fn(async () => {})}
        scope="all"
        section="workbench"
        serviceDetailsById={{}}
        setCustomTimeframeRange={vi.fn()}
        setScope={vi.fn()}
        setSection={vi.fn()}
        setTimeframe={vi.fn()}
        showRightRailCards
        skuDetailsById={{}}
        supplierFilter="all"
        timeframe="Recent"
        timeframeHydrationProgress={null}
      />,
    );

    expect(screen.queryByTestId('expanded-analysis-ledger')).toBeNull();

    await user.click(screen.getByRole('button', { name: 'Expand ledger' }));

    expect(screen.getByRole('dialog', { name: 'Expanded system ledger' })).toBeInTheDocument();
    expect(screen.getByTestId('expanded-analysis-ledger')).toBeInTheDocument();
    expect(screen.queryByText('Main view')).toBeNull();
    expect(screen.queryByText('Current sales pattern')).toBeNull();
    expect(screen.queryByText('Current business picture')).toBeNull();

    await user.click(screen.getByRole('button', { name: 'Close expanded ledger' }));

    expect(screen.queryByRole('dialog', { name: 'Expanded system ledger' })).toBeNull();
  });

  it('hides the fixed loading island while expanded so the ledger footer owns the loading pill', async () => {
    const user = userEvent.setup();

    render(
      <AnalysisContent
        currency="USD"
        hasOlderIntervals={false}
        inventory={createInventory()}
        isHydratingDetails={false}
        isLoadingOlderIntervals={false}
        language="en"
        loadOlderIntervals={vi.fn(async () => 0)}
        resetHydratedDetails={vi.fn(async () => {})}
        scope="all"
        section="workbench"
        serviceDetailsById={{}}
        setCustomTimeframeRange={vi.fn()}
        setScope={vi.fn()}
        setSection={vi.fn()}
        setTimeframe={vi.fn()}
        showRightRailCards={false}
        skuDetailsById={{}}
        timeframe="Recent"
        timeframeHydrationProgress={null}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Choose timeframe' }));
    await user.click(screen.getByRole('button', { name: 'Expand ledger' }));

    expect(screen.queryByTestId('expanded-analysis-ledger')).toBeInTheDocument();
    expect(screen.queryByText('Loading data')).toBeNull();
  });

  it('applies the custom timeframe range after hydration completes while expanded', async () => {
    const user = userEvent.setup();

    const { rerender } = render(
      <AnalysisContent
        currency="USD"
        hasOlderIntervals={false}
        inventory={createInventory()}
        isHydratingDetails={false}
        isLoadingOlderIntervals={false}
        language="en"
        loadOlderIntervals={vi.fn(async () => 0)}
        resetHydratedDetails={vi.fn(async () => {})}
        scope="all"
        section="workbench"
        serviceDetailsById={{}}
        setCustomTimeframeRange={vi.fn()}
        setScope={vi.fn()}
        setSection={vi.fn()}
        setTimeframe={vi.fn()}
        showRightRailCards={false}
        skuDetailsById={{}}
        supplierFilter="all"
        timeframe="Recent"
        timeframeHydrationProgress={null}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Choose custom timeframe' }));
    await user.click(screen.getByRole('button', { name: 'Expand ledger' }));

    expect(analysisTradingChartLedgerMock).toHaveBeenLastCalledWith(expect.objectContaining({
      customTimeframeRange: null,
      isBusy: true,
    }));

    rerender(
      <AnalysisContent
        currency="USD"
        hasOlderIntervals={false}
        inventory={createInventory()}
        isHydratingDetails={true}
        isLoadingOlderIntervals={false}
        language="en"
        loadOlderIntervals={vi.fn(async () => 0)}
        resetHydratedDetails={vi.fn(async () => {})}
        scope="all"
        section="workbench"
        serviceDetailsById={{}}
        setCustomTimeframeRange={vi.fn()}
        setScope={vi.fn()}
        setSection={vi.fn()}
        setTimeframe={vi.fn()}
        showRightRailCards={false}
        skuDetailsById={{}}
        supplierFilter="all"
        timeframe="Recent"
        timeframeHydrationProgress={null}
      />,
    );

    rerender(
      <AnalysisContent
        currency="USD"
        hasOlderIntervals={false}
        inventory={createInventory()}
        isHydratingDetails={false}
        isLoadingOlderIntervals={false}
        language="en"
        loadOlderIntervals={vi.fn(async () => 0)}
        resetHydratedDetails={vi.fn(async () => {})}
        scope="all"
        section="workbench"
        serviceDetailsById={{}}
        setCustomTimeframeRange={vi.fn()}
        setScope={vi.fn()}
        setSection={vi.fn()}
        setTimeframe={vi.fn()}
        showRightRailCards={false}
        skuDetailsById={{}}
        supplierFilter="all"
        timeframe="Recent"
        timeframeHydrationProgress={null}
      />,
    );

    await waitFor(() => {
      expect(analysisTradingChartLedgerMock).toHaveBeenLastCalledWith(expect.objectContaining({
        customTimeframeRange: {
          startAt: '2026-03-01T00:00:00.000Z',
          endAt: '2026-03-31T23:59:59.999Z',
        },
      }));
    });
  });
});
