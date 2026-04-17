import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { getTranslation } from '@/lib/translations';
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
  const promise = new Promise<T>((nextResolve) => {
    resolve = nextResolve;
  });
  return { promise, resolve };
}

function createInventory(overrides: Record<string, unknown> = {}) {
  return {
    catalog: {
      schemaVersion: 1,
      skus: [],
      services: [],
      bundles: [],
      sharingMask: [],
    },
    diagnostics: null,
    isLoading: false,
    isSaving: false,
    latestRun: { runId: 'run-1' },
    observations: [],
    retrySenaRun: vi.fn(async () => ({ runId: 'run-1' })),
    triggerSenaRun: vi.fn(async () => ({ runId: 'run-2' })),
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
    ...overrides,
  };
}

describe('AnalysisContent', () => {
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
    const run = deferred<{ runId: string }>();
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

    const button = screen.getByRole('button', { name: 'Refresh analysis' });
    await user.click(button);

    expect(retrySenaRun).toHaveBeenCalledWith({ runId: 'run-1' });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('aria-busy', 'true');
    expect(button.querySelector('.animate-spin')).not.toBeNull();

    run.resolve({ runId: 'run-1' });
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
