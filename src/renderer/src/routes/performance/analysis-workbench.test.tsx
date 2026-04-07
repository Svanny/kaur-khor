import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeAll, describe, expect, test, vi } from 'vitest';
import type { SenaCatalog, SenaDiagnostics, SenaObservationRecord, SenaServiceDetail, SenaSkuDetail, SenaWorkspaceSummary } from '@shared/sena';
import { AnalysisWorkbench } from './analysis-workbench';
import { deriveAnalysisViewModel } from './analysis-view-model';

const preferenceState = {
  currency: 'USD',
  language: 'en',
  showFloatingTitleActions: false,
  showRightRailCards: false,
  t: (value: string) => value,
};

vi.mock('@/state/preferences', () => ({
  usePreferences: () => preferenceState,
}));

const catalog: SenaCatalog = {
  schemaVersion: 1,
  bundles: [],
  services: [
    {
      bundle: false,
      description: 'Signature haircut',
      name: 'Haircut',
      price: 18,
      serviceId: 'service-haircut',
    },
  ],
  sharingMask: [{ enabled: true, serviceId: 'service-haircut', skuId: 'sku-razor', usageProbability: 1 }],
  skus: [
    {
      costPerUnit: 6,
      description: 'Refill cartridge',
      leadTimeMeanDaysHint: 5,
      leadTimeStdDaysHint: 1,
      name: 'Razor Refill',
      productPrice: 18,
      skuId: 'sku-razor',
      soldAsProduct: true,
    },
  ],
};

const workspaceSummary: SenaWorkspaceSummary = {
  highRiskSkuIds: ['sku-razor'],
  intervalCount: 2,
  latestObservedAt: '2026-04-03T08:00:00.000Z',
  ownerSub: 'desktop-owner',
  pendingReorderCount: 1,
  runId: 'run-1',
  serviceCount: 1,
  skuCount: 1,
  skuSummaries: [
    {
      credibleIntervalHigh: 13,
      credibleIntervalLow: 9,
      daysOfCover: 3,
      demandPerDayMean: 4,
      expectedLeadTimeDemand: 12,
      latestPosteriorUnits: 11,
      leadTimeMeanDays: 5,
      leadTimeStdDays: 1.5,
      reorderPoint: 14,
      reorderTriggerProbability: 0.68,
      regimeProbabilities: { normal: 0.35, promo: 0.65 },
      safetyStock: 4,
      skuId: 'sku-razor',
      stockoutRisk: 0.54,
    },
  ],
  topRegime: 'promo',
};

const diagnostics: SenaDiagnostics = {
  changePointProbability: 0.22,
  coverageEstimate: 0.89,
  effectiveSampleSizeMean: 84,
  posteriorPredictiveErrorMean: 0.18,
  regimeHistory: [
    {
      dominantRegime: 'normal',
      endAt: '2026-03-05T08:00:00.000Z',
      intervalIndex: 0,
      regimeProbabilities: { normal: 0.7, promo: 0.3 },
      startAt: '2026-02-20T08:00:00.000Z',
    },
    {
      dominantRegime: 'promo',
      endAt: '2026-04-03T08:00:00.000Z',
      intervalIndex: 1,
      regimeProbabilities: { normal: 0.25, promo: 0.75 },
      startAt: '2026-03-06T08:00:00.000Z',
    },
  ],
  resamplingCount: 8,
  seasonalityActive: false,
  smoothingEnabled: true,
};

const observations: SenaObservationRecord[] = [
  {
    input: {
      leadTimeHints: [],
      notes: 'Demand softened after a price move.',
      observedAt: '2026-03-01T08:00:00.000Z',
      orderSignals: [{ approximateOrderQuantity: 10, approximateReceiptQuantity: null, orderPlaced: true, receiptArrived: false, skuId: 'sku-razor' }],
      retailPrices: [{ price: 17, skuId: 'sku-razor' }],
      retailRankings: ['sku-razor'],
      servicePrices: [],
      serviceRankings: ['service-haircut'],
      serviceStockouts: [],
      stockSnapshot: [],
      retailStockouts: [],
    },
    observationId: 'obs-1',
    ownerSub: 'desktop-owner',
  },
];

const serviceDetailsById: Record<string, SenaServiceDetail | null> = {
  'service-haircut': {
    activityIntervalHigh: 8,
    activityIntervalLow: 6,
    activityMean: 7,
    bottleneckProbability: 0.65,
    contributors: [{ bottleneckProbability: 0.65, skuId: 'sku-razor', usageProbability: 1 }],
    regimeTimeline: [],
    serviceId: 'service-haircut',
  },
};

const skuDetailsById: Record<string, SenaSkuDetail | null> = {
  'sku-razor': {
    demandPosterior: [
      {
        adjustmentsMean: -1,
        deltaDays: 14,
        endAt: '2026-03-05T08:00:00.000Z',
        intervalIndex: 0,
        realizedConsumptionMean: 3,
        receiptsMean: 0,
        retailDemandMean: 1,
        serviceDemandMean: 2,
        startAt: '2026-02-20T08:00:00.000Z',
        unconstrainedDemandMean: 3,
      },
      {
        adjustmentsMean: 1,
        deltaDays: 28,
        endAt: '2026-04-03T08:00:00.000Z',
        intervalIndex: 1,
        realizedConsumptionMean: 4,
        receiptsMean: 8,
        retailDemandMean: 1,
        serviceDemandMean: 3,
        startAt: '2026-03-06T08:00:00.000Z',
        unconstrainedDemandMean: 4,
      },
    ],
    inventoryPosterior: [
      { at: '2026-03-05T08:00:00.000Z', high: 14, low: 10, mean: 12 },
      { at: '2026-04-03T08:00:00.000Z', high: 13, low: 9, mean: 11 },
    ],
    leadTimePosterior: [
      {
        intervalIndex: 0,
        logMeanDays: 1.5,
        logStdDays: 0.2,
        meanDays: 5,
        observedRelativeWidth: 0.2,
        observedVariabilityClass: 'tight',
        stdDays: 1,
      },
      {
        intervalIndex: 1,
        logMeanDays: 1.6,
        logStdDays: 0.28,
        meanDays: 6,
        observedRelativeWidth: 0.3,
        observedVariabilityClass: 'wide',
        stdDays: 2,
      },
    ],
    pipelinePosterior: [
      {
        ageDaysMean: 3,
        inTransitMean: 6,
        intervalIndex: 0,
        orderProbability: 0.74,
        orderQuantityMean: 10,
        receiptQuantityMean: 0,
      },
      {
        ageDaysMean: 5,
        inTransitMean: 9,
        intervalIndex: 1,
        orderProbability: 0.86,
        orderQuantityMean: 9,
        receiptQuantityMean: 8,
      },
    ],
    summary: workspaceSummary.skuSummaries[0],
  },
};

beforeAll(() => {
  class ResizeObserverMock {
    observe() {}

    disconnect() {}
  }

  vi.stubGlobal('ResizeObserver', ResizeObserverMock);
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', {
    configurable: true,
    get() {
      return 720;
    },
  });
  Object.defineProperty(HTMLElement.prototype, 'clientHeight', {
    configurable: true,
    get() {
      return 320;
    },
  });
  HTMLElement.prototype.getBoundingClientRect = function getBoundingClientRect() {
    return {
      bottom: 320,
      height: 320,
      left: 0,
      right: 720,
      toJSON() {
        return {};
      },
      top: 0,
      width: 720,
      x: 0,
      y: 0,
    } as DOMRect;
  };
});

afterEach(() => {
  preferenceState.showFloatingTitleActions = false;
});

function buildModel() {
  return deriveAnalysisViewModel({
    catalog,
    currency: 'USD',
    diagnostics,
    language: 'en',
    observations,
    scope: 'all',
    serviceDetailsById,
    skuDetailsById,
    workspaceSummary,
  });
}

describe('AnalysisWorkbench', () => {
  test('keeps the analysis nav horizontally scrollable so fragility stays reachable', async () => {
    const user = userEvent.setup();
    const model = buildModel();

    const setSection = vi.fn();
    render(<AnalysisWorkbench model={model} section="workbench" setSection={setSection} showRightRailCards={false} />);

    expect(screen.getByRole('tab', { name: 'Fragility' })).toBeInTheDocument();

    const tabList = screen.getByRole('tablist', { name: 'Select analysis surface' });
    expect(tabList.parentElement).toHaveClass('overflow-x-auto');
    expect(tabList.parentElement).not.toHaveClass('overflow-hidden');

    await user.click(screen.getByRole('tab', { name: 'Fragility' }));

    expect(setSection).toHaveBeenCalledWith('fragility');
  });

  test('does not mount the inspector rail on the observations tab', () => {
    render(<AnalysisWorkbench model={buildModel()} section="observations" setSection={vi.fn()} showRightRailCards />);

    expect(screen.getByText('Observation ledger')).toBeInTheDocument();
    expect(document.querySelector('[data-analysis-inspector="true"]')).toBeNull();
  });

  test('renders observation rows as non-interactive records', () => {
    render(<AnalysisWorkbench model={buildModel()} section="observations" setSection={vi.fn()} showRightRailCards={false} />);

    expect(screen.queryByRole('button', { name: /latest observation/i })).toBeNull();
  });

  test('does not mount the inspector rail on the fragility tab', () => {
    render(<AnalysisWorkbench model={buildModel()} section="fragility" setSection={vi.fn()} showRightRailCards />);

    expect(screen.getByText('Supply fragility map')).toBeInTheDocument();
    expect(document.querySelector('[data-analysis-inspector="true"]')).toBeNull();
  });

  test('shows help tooltips for each analysis setting field', () => {
    render(<AnalysisWorkbench model={buildModel()} section="settings" setSection={vi.fn()} showRightRailCards={false} />);

    expect(screen.getByRole('button', { name: 'Run ID help' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Latest observed help' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Observations used help' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Intervals in view help' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Smoothing help' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Effective sample size help' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Predictive error help' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Coverage estimate help' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Scope help' })).toBeInTheDocument();
  });

  test('pinch zoom shrinks the workbench slot width across the synchronized lanes', async () => {
    const { container } = render(
      <AnalysisWorkbench
        hasOlderIntervals={false}
        isLoadingOlderIntervals={false}
        loadOlderIntervals={vi.fn(async () => 0)}
        model={buildModel()}
        section="workbench"
        setSection={vi.fn()}
        showRightRailCards={false}
      />,
    );

    const regimePoint = screen.getByRole('button', { name: /normal regime/i });
    const regimeScroller = regimePoint.closest('.hidden-scrollbar') as HTMLDivElement | null;
    expect(regimeScroller).not.toBeNull();
    if (!regimeScroller?.firstElementChild) {
      return;
    }

    const content = regimeScroller.firstElementChild as HTMLElement;
    const beforeWidth = Number.parseFloat(content.style.width);

    fireEvent.wheel(regimeScroller, { clientX: 360, ctrlKey: true, deltaX: 0, deltaY: 500 });

    await waitFor(() => {
      expect(Number.parseFloat(content.style.width)).toBeLessThan(beforeWidth);
    });

    expect(container.querySelectorAll('[data-analysis-datalabel="true"]').length).toBeGreaterThan(0);
  });

  test('horizontal trackpad wheel scrolling moves the synchronized chart lanes', async () => {
    const originalClientWidth = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientWidth');
    Object.defineProperty(HTMLElement.prototype, 'clientWidth', {
      configurable: true,
      get() {
        return (this as HTMLElement).classList.contains('hidden-scrollbar') ? 120 : 720;
      },
    });

    try {
      render(
        <AnalysisWorkbench
          hasOlderIntervals={false}
          isLoadingOlderIntervals={false}
          loadOlderIntervals={vi.fn(async () => 0)}
          model={buildModel()}
          section="workbench"
          setSection={vi.fn()}
          showRightRailCards={false}
        />,
      );

      const regimePoint = screen.getByRole('button', { name: /normal regime/i });
      const regimeScroller = regimePoint.closest('.hidden-scrollbar') as HTMLDivElement | null;
      expect(regimeScroller).not.toBeNull();
      if (!regimeScroller?.firstElementChild) {
        return;
      }

      const content = regimeScroller.firstElementChild as HTMLElement;
      const beforeWidth = Number.parseFloat(content.style.width);

      fireEvent.wheel(regimeScroller, { clientX: 60, ctrlKey: true, deltaX: 0, deltaY: -500 });

      await waitFor(() => {
        expect(Number.parseFloat(content.style.width)).toBeGreaterThan(beforeWidth);
      });

      fireEvent.wheel(regimeScroller!, { clientX: 60, ctrlKey: false, deltaX: 80, deltaY: 0 });

      await waitFor(() => {
        expect(regimeScroller!.scrollLeft).toBeGreaterThan(0);
      });
    } finally {
      if (originalClientWidth) {
        Object.defineProperty(HTMLElement.prototype, 'clientWidth', originalClientWidth);
      }
    }
  });

  test('moves chart controls into a separate floating island left of the title actions island when the header scrolls away', async () => {
    preferenceState.showFloatingTitleActions = true;

    const titleActionsIsland = document.createElement('div');
    titleActionsIsland.dataset.slot = 'floating-title-actions';
    document.body.appendChild(titleActionsIsland);

    const defaultGetBoundingClientRect = HTMLElement.prototype.getBoundingClientRect;
    Object.defineProperty(HTMLElement.prototype, 'getBoundingClientRect', {
      configurable: true,
      value: function getBoundingClientRect() {
        if ((this as HTMLElement).dataset.analysisChartControlsAnchor === 'true') {
          return {
            bottom: -8,
            height: 36,
            left: 0,
            right: 120,
            toJSON() {
              return {};
            },
            top: -44,
            width: 120,
            x: 0,
            y: -44,
          } as DOMRect;
        }
        if ((this as HTMLElement).dataset.slot === 'floating-title-actions') {
          return {
            bottom: 300,
            height: 64,
            left: 320,
            right: 680,
            toJSON() {
              return {};
            },
            top: 236,
            width: 360,
            x: 320,
            y: 236,
          } as DOMRect;
        }
        return defaultGetBoundingClientRect.call(this);
      },
    });

    try {
      render(
        <AnalysisWorkbench
          hasOlderIntervals={false}
          isLoadingOlderIntervals={false}
          loadOlderIntervals={vi.fn(async () => 0)}
          model={buildModel()}
          section="workbench"
          setSection={vi.fn()}
          showRightRailCards={false}
        />,
      );

      await waitFor(() => {
        const floatingTimeframeIsland = document.querySelector('[data-slot="floating-timeframe-actions"]') as HTMLElement | null;
        const floatingChartIsland = document.querySelector('[data-slot="floating-chart-actions"]') as HTMLElement | null;
        expect(floatingTimeframeIsland).not.toBeNull();
        expect(floatingChartIsland).not.toBeNull();
        expect(Number.parseFloat(floatingChartIsland?.style.right ?? '0')).toBeGreaterThan(
          Number.parseFloat(floatingTimeframeIsland?.style.right ?? '0'),
        );
      });
    } finally {
      Object.defineProperty(HTMLElement.prototype, 'getBoundingClientRect', {
        configurable: true,
        value: defaultGetBoundingClientRect,
      });
      titleActionsIsland.remove();
    }
  });

  test('floating chart controls keep the zoom and reset handlers wired', async () => {
    preferenceState.showFloatingTitleActions = true;
    const user = userEvent.setup();
    const onResetCharts = vi.fn(async () => {});

    const defaultGetBoundingClientRect = HTMLElement.prototype.getBoundingClientRect;
    Object.defineProperty(HTMLElement.prototype, 'getBoundingClientRect', {
      configurable: true,
      value: function getBoundingClientRect() {
        if ((this as HTMLElement).dataset.analysisChartControlsAnchor === 'true') {
          return {
            bottom: -8,
            height: 36,
            left: 0,
            right: 120,
            toJSON() {
              return {};
            },
            top: -44,
            width: 120,
            x: 0,
            y: -44,
          } as DOMRect;
        }
        return defaultGetBoundingClientRect.call(this);
      },
    });

    try {
      render(
        <AnalysisWorkbench
          hasOlderIntervals={false}
          isLoadingOlderIntervals={false}
          loadOlderIntervals={vi.fn(async () => 0)}
          model={buildModel()}
          onResetCharts={onResetCharts}
          section="workbench"
          setSection={vi.fn()}
          showRightRailCards={false}
        />,
      );

      await waitFor(() => {
        expect(document.querySelector('[data-slot="floating-chart-actions"]')).not.toBeNull();
      });
      const floatingChartIsland = document.querySelector('[data-slot="floating-chart-actions"]') as HTMLElement | null;
      expect(floatingChartIsland).not.toBeNull();

      const regimePoint = screen.getByRole('button', { name: /normal regime/i });
      const regimeScroller = regimePoint.closest('.hidden-scrollbar') as HTMLDivElement | null;
      expect(regimeScroller?.firstElementChild).not.toBeNull();
      const content = regimeScroller?.firstElementChild as HTMLElement;
      const beforeWidth = Number.parseFloat(content.style.width);

      const floatingChartScope = within(floatingChartIsland as HTMLElement);

      await user.click(floatingChartScope.getByRole('button', { name: 'Zoom out chart' }));

      await waitFor(() => {
        expect(Number.parseFloat(content.style.width)).toBeLessThan(beforeWidth);
      });

      await user.click(floatingChartScope.getByRole('button', { name: 'Zoom in chart' }));

      await user.click(floatingChartScope.getByRole('button', { name: 'Reset chart zoom' }));

      expect(onResetCharts).toHaveBeenCalledTimes(1);
    } finally {
      Object.defineProperty(HTMLElement.prototype, 'getBoundingClientRect', {
        configurable: true,
        value: defaultGetBoundingClientRect,
      });
    }
  });

  test('expands one lane into single-lane mode until minimized', async () => {
    const user = userEvent.setup();
    const { container } = render(
      <AnalysisWorkbench
        hasOlderIntervals={false}
        isLoadingOlderIntervals={false}
        loadOlderIntervals={vi.fn(async () => 0)}
        model={buildModel()}
        section="workbench"
        setSection={vi.fn()}
        showRightRailCards={false}
      />,
    );

    expect(container.querySelectorAll('[data-lane]').length).toBe(4);
    expect(screen.getByText('Inventory band')).toBeInTheDocument();
    expect(screen.getByText('Spread band')).toBeInTheDocument();
    expect(screen.getByText('In-transit window')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Expand Pipeline lane' }));

    expect(container.querySelectorAll('[data-lane]').length).toBe(1);
    expect(screen.queryByText('Inventory band')).toBeNull();
    expect(screen.queryByText('Spread band')).toBeNull();
    expect(screen.getByText('In-transit window')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Minimize Pipeline lane' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Minimize Pipeline lane' }));

    expect(container.querySelectorAll('[data-lane]').length).toBe(4);
    expect(screen.getByText('Inventory band')).toBeInTheDocument();
    expect(screen.getByText('Spread band')).toBeInTheDocument();
  });

  test('grows the focused chart surface when a lane is expanded', async () => {
    const user = userEvent.setup();
    const { container } = render(
      <AnalysisWorkbench
        hasOlderIntervals={false}
        isLoadingOlderIntervals={false}
        loadOlderIntervals={vi.fn(async () => 0)}
        model={buildModel()}
        section="workbench"
        setSection={vi.fn()}
        showRightRailCards={false}
      />,
    );

    const inventoryChart = container.querySelector('[data-analysis-chart="inventory"]') as HTMLElement | null;
    expect(inventoryChart).not.toBeNull();
    const initialHeight = inventoryChart?.style.height;

    await user.click(screen.getByRole('button', { name: 'Expand Inventory + demand lane' }));

    const expandedInventoryChart = container.querySelector('[data-analysis-chart="inventory"]') as HTMLElement | null;
    expect(expandedInventoryChart).not.toBeNull();
    expect(expandedInventoryChart?.style.height).not.toBe(initialHeight);
    expect(Number.parseFloat(expandedInventoryChart?.style.height ?? '0')).toBeGreaterThan(Number.parseFloat(initialHeight ?? '0'));
  });

  test('keeps the section height class stable when expanding a lane', async () => {
    const user = userEvent.setup();
    const { container } = render(
      <AnalysisWorkbench
        hasOlderIntervals={false}
        isLoadingOlderIntervals={false}
        loadOlderIntervals={vi.fn(async () => 0)}
        model={buildModel()}
        section="workbench"
        setSection={vi.fn()}
        showRightRailCards={false}
      />,
    );

    const section = container.querySelector('section');
    const beforeClassName = section?.className;

    await user.click(screen.getByRole('button', { name: 'Expand Inventory + demand lane' }));

    expect(section?.className).toBe(beforeClassName);
  });

  test('expanded inventory lane increases bar area while capping line weight', async () => {
    const user = userEvent.setup();
    const { container } = render(
      <AnalysisWorkbench
        hasOlderIntervals={false}
        isLoadingOlderIntervals={false}
        loadOlderIntervals={vi.fn(async () => 0)}
        model={buildModel()}
        section="workbench"
        setSection={vi.fn()}
        showRightRailCards={false}
      />,
    );

    const initialFlowCell = container.querySelector('[data-analysis-flow-cell="inventory"]') as HTMLElement | null;
    expect(initialFlowCell).not.toBeNull();
    const initialFlowHeight = Number.parseFloat(initialFlowCell?.style.height ?? '0');

    await user.click(screen.getByRole('button', { name: 'Expand Inventory + demand lane' }));

    const expandedFlowCell = container.querySelector('[data-analysis-flow-cell="inventory"]') as HTMLElement | null;
    const expandedInventoryLine = container.querySelector('[data-analysis-line="inventory"]') as SVGPolylineElement | null;
    expect(expandedFlowCell).not.toBeNull();
    expect(expandedInventoryLine).not.toBeNull();
    expect(Number.parseFloat(expandedFlowCell?.style.height ?? '0')).toBeGreaterThan(initialFlowHeight);
    expect(Number.parseFloat(expandedInventoryLine?.getAttribute('stroke-width') ?? '0')).toBeLessThanOrEqual(2.6);
  });

  test('expanded lead-time line keeps a capped stroke width', async () => {
    const user = userEvent.setup();
    const { container } = render(
      <AnalysisWorkbench
        hasOlderIntervals={false}
        isLoadingOlderIntervals={false}
        loadOlderIntervals={vi.fn(async () => 0)}
        model={buildModel()}
        section="workbench"
        setSection={vi.fn()}
        showRightRailCards={false}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Expand Lead-time lane' }));

    const expandedLeadTimeLine = container.querySelector('[data-analysis-line="lead-time"]') as SVGPolylineElement | null;
    expect(expandedLeadTimeLine).not.toBeNull();
    expect(Number.parseFloat(expandedLeadTimeLine?.getAttribute('stroke-width') ?? '0')).toBeLessThanOrEqual(2.6);
  });

  test('expanded pipeline pills grow in height', async () => {
    const user = userEvent.setup();
    const { container } = render(
      <AnalysisWorkbench
        hasOlderIntervals={false}
        isLoadingOlderIntervals={false}
        loadOlderIntervals={vi.fn(async () => 0)}
        model={buildModel()}
        section="workbench"
        setSection={vi.fn()}
        showRightRailCards={false}
      />,
    );

    const initialPipelinePill = container.querySelector('[data-analysis-pipeline-pill="true"]') as HTMLElement | null;
    expect(initialPipelinePill).not.toBeNull();
    const initialPillHeight = Number.parseFloat(initialPipelinePill?.style.height ?? '0');

    await user.click(screen.getByRole('button', { name: 'Expand Pipeline lane' }));

    const expandedPipelinePill = container.querySelector('[data-analysis-pipeline-pill="true"]') as HTMLElement | null;
    expect(expandedPipelinePill).not.toBeNull();
    expect(Number.parseFloat(expandedPipelinePill?.style.height ?? '0')).toBeGreaterThan(initialPillHeight);
  });

  test('expanded regime lane increases tile height without overflowing the section', async () => {
    const user = userEvent.setup();
    const { container } = render(
      <AnalysisWorkbench
        hasOlderIntervals={false}
        isLoadingOlderIntervals={false}
        loadOlderIntervals={vi.fn(async () => 0)}
        model={buildModel()}
        section="workbench"
        setSection={vi.fn()}
        showRightRailCards={false}
      />,
    );

    const initialRegimeTile = screen.getByRole('button', { name: /normal regime/i });
    const initialTileHeight = Number.parseFloat(initialRegimeTile.style.height || '0');

    await user.click(screen.getByRole('button', { name: 'Expand Regime + price lane' }));

    const expandedRegimeTile = screen.getByRole('button', { name: /normal regime/i });
    const section = container.querySelector('section');
    expect(Number.parseFloat(expandedRegimeTile.style.height || '0')).toBeGreaterThan(initialTileHeight);
    expect(Number.parseFloat(expandedRegimeTile.style.height || '0')).toBeLessThanOrEqual(section?.clientHeight ?? Number.POSITIVE_INFINITY);
  });
});
