import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { AnalysisContent } from './analysis-content';

const analysisWorkbenchMock = vi.fn();

vi.mock('./analysis-workbench', () => ({
  AnalysisWorkbench: (props: Record<string, unknown>) => {
    analysisWorkbenchMock(props);
    return (
      <div>
        <div data-testid="chart-zoom-reset-token">{String(props.chartZoomResetToken)}</div>
        <button type="button" onClick={() => (props.setTimeframe as (value: string) => void)('YTD')}>
          Choose timeframe
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

  it('shows timeframe hydration progress when a timeframe load spans multiple batches', () => {
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
    expect(screen.getByText('[3/31]')).toBeInTheDocument();
  });

  it('shows timeframe hydration progress for MAX loads too', () => {
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
    expect(screen.getByText('[1/8]')).toBeInTheDocument();
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
        setScope={vi.fn()}
        setSection={vi.fn()}
        setTimeframe={vi.fn()}
        showRightRailCards={false}
        skuDetailsById={{}}
        timeframe="Recent"
        timeframeHydrationProgress={null}
      />,
    );

    const button = screen.getByRole('button', { name: 'Re-run analysis' });
    await user.click(button);

    expect(retrySenaRun).toHaveBeenCalledWith({ runId: 'run-1' });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('aria-busy', 'true');
    expect(button.querySelector('.animate-spin')).not.toBeNull();

    run.resolve({ runId: 'run-1' });
  });
});
