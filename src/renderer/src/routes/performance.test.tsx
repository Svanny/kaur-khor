import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { DescriptionTextVisibilityProvider } from '@/components/system/description-text';
import { getTranslation } from '@/lib/translations';
import { AnalysisRoute } from './analysis';
import { PerformanceRoute } from './performance';

const inventoryHook = vi.fn();
const preferenceState = {
  currency: 'USD',
  language: 'en',
  showRightRailCards: true,
  t: (key: Parameters<typeof getTranslation>[1]) => getTranslation('en', key),
};

vi.mock('@/state/inventory', () => ({
  useInventory: () => inventoryHook(),
}));

vi.mock('@/state/preferences', () => ({
  usePreferences: () => preferenceState,
}));

const catalog = {
  schemaVersion: 1,
  bundles: [],
  services: [
    {
      bundle: false,
      description: 'High-demand color package',
      name: 'Hair Coloring',
      price: 42,
      serviceId: 'service-color',
    },
    {
      bundle: false,
      description: 'Core haircut service',
      name: 'Haircut',
      price: 18,
      serviceId: 'service-haircut',
    },
  ],
  sharingMask: [
    { enabled: true, serviceId: 'service-color', skuId: 'sku-shampoo', usageProbability: 1 },
    { enabled: true, serviceId: 'service-haircut', skuId: 'sku-razor', usageProbability: 1 },
  ],
  skus: [
    {
      costPerUnit: 6,
      description: 'Refill cartridge for haircut service',
      leadTimeMeanDaysHint: 5,
      leadTimeStdDaysHint: 1,
      name: 'Razor Refill',
      productPrice: 18,
      skuId: 'sku-razor',
      soldAsProduct: true,
    },
    {
      costPerUnit: 5,
      description: 'Retail and color support shampoo',
      leadTimeMeanDaysHint: 4,
      leadTimeStdDaysHint: 1,
      name: 'Shampoo Classic',
      productPrice: 20,
      skuId: 'sku-shampoo',
      soldAsProduct: true,
    },
  ],
};

const workspaceSummary = {
  highRiskSkuIds: ['sku-razor'],
  intervalCount: 4,
  latestObservedAt: '2026-04-03T08:00:00.000Z',
  ownerSub: 'desktop-owner',
  pendingReorderCount: 1,
  runId: 'run-1',
  serviceCount: 2,
  skuCount: 2,
  skuSummaries: [
    {
      credibleIntervalHigh: 10,
      credibleIntervalLow: 3,
      daysOfCover: 2,
      demandPerDayMean: 4,
      expectedLeadTimeDemand: 12,
      latestPosteriorUnits: 5,
      leadTimeMeanDays: 5,
      leadTimeStdDays: 1,
      reorderPoint: 14,
      reorderTriggerProbability: 0.88,
      regimeProbabilities: { normal: 0.4, promo: 0.6 },
      safetyStock: 4,
      skuId: 'sku-razor',
      stockoutRisk: 0.82,
    },
    {
      credibleIntervalHigh: 28,
      credibleIntervalLow: 18,
      daysOfCover: 9,
      demandPerDayMean: 1,
      expectedLeadTimeDemand: 6,
      latestPosteriorUnits: 24,
      leadTimeMeanDays: 4,
      leadTimeStdDays: 1,
      reorderPoint: 8,
      reorderTriggerProbability: 0.18,
      regimeProbabilities: { correction: 0.3, normal: 0.7 },
      safetyStock: 2,
      skuId: 'sku-shampoo',
      stockoutRisk: 0.24,
    },
  ],
  topRegime: 'normal',
};

const regimeHistory = [
  {
    dominantRegime: 'normal',
    endAt: '2026-02-10T08:00:00.000Z',
    intervalIndex: 0,
    regimeProbabilities: { normal: 0.7, promo: 0.3 },
    startAt: '2026-02-01T08:00:00.000Z',
  },
  {
    dominantRegime: 'promo',
    endAt: '2026-03-05T08:00:00.000Z',
    intervalIndex: 1,
    regimeProbabilities: { normal: 0.25, promo: 0.75 },
    startAt: '2026-02-11T08:00:00.000Z',
  },
  {
    dominantRegime: 'correction',
    endAt: '2026-04-03T08:00:00.000Z',
    intervalIndex: 2,
    regimeProbabilities: { correction: 0.6, normal: 0.4 },
    startAt: '2026-03-06T08:00:00.000Z',
  },
];

function buildObservation(index: number) {
  const day = String(index + 1).padStart(2, '0');

  return {
    input: {
      leadTimeHints: [],
      notes: `Observation note ${index}`,
      observedAt: `2026-04-${day}T08:00:00.000Z`,
      orderSignals: index % 2 === 0
        ? [{ approximateOrderQuantity: 8 + index, approximateReceiptQuantity: null, orderPlaced: true, receiptArrived: false, skuId: 'sku-razor' }]
        : [],
      retailPrices: index % 3 === 0 ? [{ price: 18 + index, skuId: 'sku-shampoo' }] : [],
      retailRankings: index % 2 === 0 ? ['sku-shampoo'] : ['sku-razor'],
      servicePrices: index % 2 === 1 ? [{ price: 42 + index, serviceId: 'service-color' }] : [],
      serviceRankings: index % 2 === 0 ? ['service-haircut'] : ['service-color'],
      serviceStockouts: [],
      stockSnapshot: [],
      retailStockouts: [],
    },
    observationId: `obs-${index}`,
    ownerSub: 'desktop-owner',
  };
}

const defaultObservations = [
  {
    input: {
      leadTimeHints: [],
      notes: 'Demand softened after a recent shampoo price move.',
      observedAt: '2026-04-02T08:00:00.000Z',
      orderSignals: [],
      retailPrices: [{ price: 18, skuId: 'sku-shampoo' }],
      retailRankings: ['sku-shampoo'],
      servicePrices: [],
      serviceRankings: ['service-haircut'],
      serviceStockouts: [],
      stockSnapshot: [],
      retailStockouts: [],
    },
    observationId: 'obs-1',
    ownerSub: 'desktop-owner',
  },
  {
    input: {
      leadTimeHints: [],
      notes: 'Older demand pulse before the current window tightened.',
      observedAt: '2026-02-15T08:00:00.000Z',
      orderSignals: [{ approximateOrderQuantity: 12, approximateReceiptQuantity: null, orderPlaced: true, receiptArrived: false, skuId: 'sku-razor' }],
      retailPrices: [],
      retailRankings: ['sku-razor'],
      servicePrices: [{ price: 44, serviceId: 'service-color' }],
      serviceRankings: ['service-color'],
      serviceStockouts: [],
      stockSnapshot: [],
      retailStockouts: [],
    },
    observationId: 'obs-2',
    ownerSub: 'desktop-owner',
  },
];

function createInventoryState(overrides: Record<string, unknown> = {}) {
  return {
    catalog,
    diagnostics: {
      changePointProbability: 0.22,
      coverageEstimate: 0.89,
      effectiveSampleSizeMean: 84,
      posteriorPredictiveErrorMean: 0.18,
      regimeHistory,
      resamplingCount: 8,
      seasonalityActive: false,
      smoothingEnabled: true,
    },
    loadSenaServiceDetail: vi.fn(async (serviceId: string) =>
      serviceId === 'service-color'
        ? {
            activityIntervalHigh: 8,
            activityIntervalLow: 5,
            activityMean: 6,
            bottleneckProbability: 0.12,
            contributors: [{ bottleneckProbability: 0.12, skuId: 'sku-shampoo', usageProbability: 1 }],
            regimeTimeline: [],
            serviceId,
          }
        : {
            activityIntervalHigh: 8,
            activityIntervalLow: 6,
            activityMean: 7,
            bottleneckProbability: 0.65,
            contributors: [{ bottleneckProbability: 0.65, skuId: 'sku-razor', usageProbability: 1 }],
            regimeTimeline: [],
            serviceId,
          },
    ),
    loadSenaSkuDetail: vi.fn(async (skuId: string) =>
      skuId === 'sku-razor'
        ? {
            demandPosterior: [
              {
                adjustmentsMean: -1,
                deltaDays: 9,
                endAt: '2026-02-10T08:00:00.000Z',
                intervalIndex: 0,
                realizedConsumptionMean: 3,
                receiptsMean: 0,
                retailDemandMean: 1,
                serviceDemandMean: 2,
                startAt: '2026-02-01T08:00:00.000Z',
                unconstrainedDemandMean: 3,
              },
              {
                adjustmentsMean: 0,
                deltaDays: 22,
                endAt: '2026-03-05T08:00:00.000Z',
                intervalIndex: 1,
                realizedConsumptionMean: 5,
                receiptsMean: 4,
                retailDemandMean: 1,
                serviceDemandMean: 4,
                startAt: '2026-02-11T08:00:00.000Z',
                unconstrainedDemandMean: 5,
              },
              {
                adjustmentsMean: -2,
                deltaDays: 29,
                endAt: '2026-04-03T08:00:00.000Z',
                intervalIndex: 2,
                realizedConsumptionMean: 4,
                receiptsMean: 2,
                retailDemandMean: 1,
                serviceDemandMean: 3,
                startAt: '2026-03-06T08:00:00.000Z',
                unconstrainedDemandMean: 5,
              },
            ],
            inventoryPosterior: [],
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
                observedVariabilityClass: 'normal',
                stdDays: 2,
              },
              {
                intervalIndex: 2,
                logMeanDays: 1.7,
                logStdDays: 0.35,
                meanDays: 7,
                observedRelativeWidth: 0.35,
                observedVariabilityClass: 'wide',
                stdDays: 2.5,
              },
            ],
            pipelinePosterior: [
              {
                ageDaysMean: 2,
                inTransitMean: 0,
                intervalIndex: 0,
                orderProbability: 0.25,
                orderQuantityMean: 0,
                receiptQuantityMean: 0,
              },
              {
                ageDaysMean: 5,
                inTransitMean: 8,
                intervalIndex: 1,
                orderProbability: 0.75,
                orderQuantityMean: 10,
                receiptQuantityMean: 0,
              },
              {
                ageDaysMean: 6,
                inTransitMean: 16,
                intervalIndex: 2,
                orderProbability: 0.92,
                orderQuantityMean: 16,
                receiptQuantityMean: 16,
              },
            ],
            summary: workspaceSummary.skuSummaries[0],
          }
        : {
            demandPosterior: [
              {
                adjustmentsMean: 0,
                deltaDays: 9,
                endAt: '2026-02-10T08:00:00.000Z',
                intervalIndex: 0,
                realizedConsumptionMean: 1,
                receiptsMean: 0,
                retailDemandMean: 1,
                serviceDemandMean: 0,
                startAt: '2026-02-01T08:00:00.000Z',
                unconstrainedDemandMean: 1,
              },
              {
                adjustmentsMean: 1,
                deltaDays: 22,
                endAt: '2026-03-05T08:00:00.000Z',
                intervalIndex: 1,
                realizedConsumptionMean: 1,
                receiptsMean: 2,
                retailDemandMean: 1,
                serviceDemandMean: 0,
                startAt: '2026-02-11T08:00:00.000Z',
                unconstrainedDemandMean: 1,
              },
              {
                adjustmentsMean: 0,
                deltaDays: 29,
                endAt: '2026-04-03T08:00:00.000Z',
                intervalIndex: 2,
                realizedConsumptionMean: 1,
                receiptsMean: 0,
                retailDemandMean: 1,
                serviceDemandMean: 0,
                startAt: '2026-03-06T08:00:00.000Z',
                unconstrainedDemandMean: 1,
              },
            ],
            inventoryPosterior: [],
            leadTimePosterior: [
              {
                intervalIndex: 0,
                logMeanDays: 1.35,
                logStdDays: 0.15,
                meanDays: 4,
                observedRelativeWidth: 0.2,
                observedVariabilityClass: 'tight',
                stdDays: 1,
              },
              {
                intervalIndex: 1,
                logMeanDays: 1.4,
                logStdDays: 0.18,
                meanDays: 4,
                observedRelativeWidth: 0.2,
                observedVariabilityClass: 'tight',
                stdDays: 1,
              },
              {
                intervalIndex: 2,
                logMeanDays: 1.45,
                logStdDays: 0.22,
                meanDays: 5,
                observedRelativeWidth: 0.22,
                observedVariabilityClass: 'normal',
                stdDays: 1.2,
              },
            ],
            pipelinePosterior: [],
            summary: workspaceSummary.skuSummaries[1],
          },
    ),
    latestRun: { runId: 'run-1' },
    observations: defaultObservations,
    retrySenaRun: vi.fn(async () => ({ runId: 'run-1' })),
    triggerSenaRun: vi.fn(async () => ({ runId: 'run-2' })),
    workspaceSummary,
    ...overrides,
  };
}

describe('PerformanceRoute', () => {
  beforeEach(() => {
    preferenceState.showRightRailCards = true;
    inventoryHook.mockReturnValue(createInventoryState());
  });

  function renderRoute(initialEntry = '/performance') {
    return render(
      <MemoryRouter initialEntries={[initialEntry]}>
        <PerformanceRoute />
      </MemoryRouter>,
    );
  }

  function renderAnalysisRoute(initialEntry = '/analysis') {
    return render(
      <MemoryRouter initialEntries={[initialEntry]}>
        <AnalysisRoute />
      </MemoryRouter>,
    );
  }

  function renderRouteWithDescriptionVisibility(visible: boolean) {
    return render(
      <DescriptionTextVisibilityProvider visible={visible}>
        <MemoryRouter initialEntries={['/performance']}>
          <PerformanceRoute />
        </MemoryRouter>
      </DescriptionTextVisibilityProvider>,
    );
  }

  test('renders the performance steering surface', async () => {
    renderRoute();

    expect(screen.getByText('Performance')).toBeInTheDocument();
    expect(screen.getByText('Demand, capacity, pipeline, and pricing in one business view')).toBeInTheDocument();
    expect(await screen.findByRole('heading', { name: 'Move now' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Demand × capacity board' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Cash and profit efficiency' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Business timeline' })).toBeInTheDocument();
    expect(
      screen.getByText('A compact temporal read of what has been changing in the business posture.'),
    ).toBeInTheDocument();
    expect(screen.getByText('Demand momentum')).toBeInTheDocument();
    expect(screen.getByText('Revenue at risk')).toBeInTheDocument();
  });

  test('renders the dedicated analysis workbench route', async () => {
    renderAnalysisRoute();

    expect(screen.getByText('Analysis')).toBeInTheDocument();
    expect(
      screen.getByText('Inspect how SENA reconstructed demand, order flow, receipts, lead-time drift, and price effects from sparse observations.'),
    ).toBeInTheDocument();
    expect(await screen.findByRole('heading', { name: 'SENA system ledger' })).toBeInTheDocument();
    expect(screen.getByText('Regime + price lane')).toBeInTheDocument();
    expect(screen.getByText('Inventory + demand lane')).toBeInTheDocument();
    expect(screen.getByText('Pipeline lane')).toBeInTheDocument();
    expect(screen.getByText('Lead-time lane')).toBeInTheDocument();
    expect(screen.getByText('Price cues')).toBeInTheDocument();
    expect(screen.getByText('Inventory band')).toBeInTheDocument();
    expect(screen.getByText('In-transit window')).toBeInTheDocument();
    expect(screen.getByText('Spread band')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Re-run analysis' })).toBeInTheDocument();
    expect(screen.queryByText('Entity pressure explorer')).not.toBeInTheDocument();
    expect(screen.queryByText('Observation ledger')).not.toBeInTheDocument();
    expect(screen.queryByText('Supply fragility map')).not.toBeInTheDocument();
    expect(screen.queryByRole('group', { name: /Select analysis time range/i })).not.toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Workbench/i })).toHaveAttribute('data-state', 'active');
  });

  test('runs analysis from the analysis page header', async () => {
    const user = userEvent.setup();
    const retrySenaRun = vi.fn(async () => ({ runId: 'run-1' }));
    inventoryHook.mockReturnValue(createInventoryState({ retrySenaRun }));

    renderAnalysisRoute();

    await user.click(await screen.findByRole('button', { name: 'Re-run analysis' }));

    expect(retrySenaRun).toHaveBeenCalledWith({ runId: 'run-1' });
  });

  test('shows the analysis loading state during initial bootstrap instead of the empty state', () => {
    inventoryHook.mockReturnValue(createInventoryState({
      catalog: null,
      diagnostics: null,
      isLoading: true,
      observations: [],
      workspaceSummary: null,
    }));

    renderAnalysisRoute();

    expect(screen.getByText('Preparing analysis workbench')).toBeInTheDocument();
    expect(screen.queryByText('Analysis needs the catalog first')).not.toBeInTheDocument();
    expect(screen.queryByText('Analysis needs the first SENA run')).not.toBeInTheDocument();
  });

  test('shows the analysis loading state while entity detail hydration is still pending', () => {
    inventoryHook.mockReturnValue(createInventoryState({
      loadSenaServiceDetail: vi.fn(() => new Promise(() => {})),
      loadSenaSkuDetail: vi.fn(() => new Promise(() => {})),
    }));

    renderAnalysisRoute();

    expect(screen.getByText('Preparing analysis workbench')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'SENA system ledger' })).not.toBeInTheDocument();
    expect(screen.queryByText('Analysis needs the first SENA run')).not.toBeInTheDocument();
  });

  test('renders the analysis pressure tab as its own surface', async () => {
    const user = userEvent.setup();

    renderAnalysisRoute();

    expect(await screen.findByRole('heading', { name: 'SENA system ledger' })).toBeInTheDocument();
    await user.click(screen.getByRole('tab', { name: /Pressure/i }));

    expect(await screen.findByText('Entity pressure explorer')).toBeInTheDocument();
    expect(screen.queryByText('Observation ledger')).not.toBeInTheDocument();
    expect(screen.queryByText('Supply fragility map')).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'SENA system ledger' })).not.toBeInTheDocument();
  });

  test('renders the analysis observations tab as its own surface', async () => {
    const user = userEvent.setup();

    renderAnalysisRoute();

    await user.click(screen.getByRole('tab', { name: /Observations/i }));

    expect(await screen.findByText('Observation ledger')).toBeInTheDocument();
    expect(screen.queryByText('Entity pressure explorer')).not.toBeInTheDocument();
    expect(screen.queryByText('Supply fragility map')).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'SENA system ledger' })).not.toBeInTheDocument();
  });

  test('uses shared observation row spacing while preserving selection behavior', async () => {
    const user = userEvent.setup();

    const { container } = renderAnalysisRoute();

    await user.click(screen.getByRole('tab', { name: /Observations/i }));
    expect(await screen.findByText('Observation ledger')).toBeInTheDocument();

    const observationCells = Array.from(container.querySelectorAll('[data-observation-cell="true"]'));
    expect(observationCells.length).toBeGreaterThan(0);
    observationCells.forEach((cell) => {
      expect(cell.className).not.toContain('px-5');
      expect(cell.className).not.toContain('sm:px-6');
    });

    expect(screen.getAllByText('Older demand pulse before the current window tightened.')).toHaveLength(1);
    await user.click(screen.getByText('Observation 1'));
    expect(screen.getAllByText('Older demand pulse before the current window tightened.')).toHaveLength(2);
  });

  test('keeps observation pagination on the analysis observations tab', async () => {
    const user = userEvent.setup();

    inventoryHook.mockReturnValue(createInventoryState({ observations: Array.from({ length: 7 }, (_, index) => buildObservation(index + 1)) }));

    renderAnalysisRoute();

    await user.click(screen.getByRole('tab', { name: /Observations/i }));
    expect(await screen.findByText('Observation ledger')).toBeInTheDocument();

    expect(screen.getByText('Page 1 of 2')).toBeInTheDocument();
    expect(screen.getByText('Observation note 7')).toBeInTheDocument();
    expect(screen.getByText('Observation note 3')).toBeInTheDocument();
    expect(screen.queryByText('Observation note 2')).not.toBeInTheDocument();
    expect(screen.queryByText('Observation note 1')).not.toBeInTheDocument();

    await user.click(screen.getByLabelText('Next evidence page'));

    expect(screen.getByText('Page 2 of 2')).toBeInTheDocument();
    expect(screen.getByText('Observation note 2')).toBeInTheDocument();
    expect(screen.getByText('Observation note 1')).toBeInTheDocument();
    expect(screen.queryByText('Observation note 7')).not.toBeInTheDocument();
  });

  test('renders the analysis fragility tab as its own surface', async () => {
    const user = userEvent.setup();

    renderAnalysisRoute();

    await user.click(screen.getByRole('tab', { name: /Fragility/i }));

    expect(await screen.findByText('Supply fragility map')).toBeInTheDocument();
    expect(screen.queryByText('Entity pressure explorer')).not.toBeInTheDocument();
    expect(screen.queryByText('Observation ledger')).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'SENA system ledger' })).not.toBeInTheDocument();
  });

  test('uses the shared interval strip on analysis and updates the interval rail when a pill is selected', async () => {
    const resizeCallbacks: Array<() => void> = [];
    const originalResizeObserver = globalThis.ResizeObserver;

    class ResizeObserverMock {
      constructor(private readonly callback: ResizeObserverCallback) {}

      observe() {
        resizeCallbacks.push(() => this.callback([], this as unknown as ResizeObserver));
      }

      disconnect() {}
    }

    globalThis.ResizeObserver = ResizeObserverMock as unknown as typeof ResizeObserver;

    try {
      const { container } = renderAnalysisRoute();
      expect(await screen.findByRole('heading', { name: 'SENA system ledger' })).toBeInTheDocument();

      const intervalScroller = container.querySelector('.hidden-scrollbar.max-w-full.overflow-x-auto') as HTMLDivElement | null;
      expect(intervalScroller).not.toBeNull();

      Object.defineProperty(intervalScroller, 'clientWidth', {
        configurable: true,
        value: 120,
      });
      act(() => {
        resizeCallbacks.forEach((callback) => callback());
      });

      expect(screen.getByLabelText('Scroll intervals right')).toBeInTheDocument();
      const intervalButtons = Array.from(container.querySelectorAll('button[data-active]')) as HTMLButtonElement[];
      expect(intervalButtons.length).toBeGreaterThan(0);

      fireEvent.click(intervalButtons[0]!);

      expect(await screen.findByText('Interval explanation')).toBeInTheDocument();
      expect(screen.getByText('What happened')).toBeInTheDocument();
      expect(intervalButtons[0]).toHaveAttribute('data-active', 'true');
      expect(container.querySelectorAll('[data-selected-interval-column="true"]')).toHaveLength(4);
    } finally {
      globalThis.ResizeObserver = originalResizeObserver;
    }
  });

  test('lets lane marks drive the selected analysis interval', async () => {
    const resizeCallbacks: Array<() => void> = [];
    const originalResizeObserver = globalThis.ResizeObserver;

    class ResizeObserverMock {
      constructor(private readonly callback: ResizeObserverCallback) {}

      observe() {
        resizeCallbacks.push(() => this.callback([], this as unknown as ResizeObserver));
      }

      disconnect() {}
    }

    globalThis.ResizeObserver = ResizeObserverMock as unknown as typeof ResizeObserver;

    try {
      const { container } = renderAnalysisRoute();
      expect(await screen.findByRole('heading', { name: 'SENA system ledger' })).toBeInTheDocument();

      const intervalScroller = container.querySelector('.hidden-scrollbar.max-w-full.overflow-x-auto') as HTMLDivElement | null;
      expect(intervalScroller).not.toBeNull();

      Object.defineProperty(intervalScroller, 'clientWidth', {
        configurable: true,
        value: 240,
      });
      act(() => {
        resizeCallbacks.forEach((callback) => callback());
      });

      fireEvent.click(screen.getByLabelText('Inventory 29 units in interval 1'));

      expect(await screen.findByText('Interval explanation')).toBeInTheDocument();
      expect(screen.getByText('Feb 10')).toBeInTheDocument();
      expect(container.querySelectorAll('[data-selected-interval-column="true"]')).toHaveLength(4);
    } finally {
      globalThis.ResizeObserver = originalResizeObserver;
    }
  });


  test('hides section header descriptions when explanatory text is disabled', async () => {
    renderRouteWithDescriptionVisibility(false);

    expect(await screen.findByRole('heading', { name: 'Business timeline' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Business timeline help' })).not.toBeInTheDocument();
    expect(
      screen.queryByText('A compact temporal read of what has been changing in the business posture.'),
    ).not.toBeInTheDocument();
  });

  test('filters the board between services and skus', async () => {
    renderRoute();

    const boardHeading = await screen.findByRole('heading', { name: 'Demand × capacity board' });
    const board = boardHeading.closest('section');
    expect(board).not.toBeNull();
    const boardQueries = within(board!);

    expect(boardQueries.getByText('Hair Coloring')).toBeInTheDocument();
    expect(boardQueries.getByText('Razor Refill')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('radio', { name: 'Services' }));
    expect(boardQueries.getByText('Hair Coloring')).toBeInTheDocument();
    expect(boardQueries.queryByText('Razor Refill')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('radio', { name: 'SKUs' }));
    expect(boardQueries.getByText('Razor Refill')).toBeInTheDocument();
    expect(boardQueries.queryByText('Hair Coloring')).not.toBeInTheDocument();
  });

  test('hides the right rail and expands the main content when the global toggle is off', async () => {
    preferenceState.showRightRailCards = false;

    renderRoute();

    expect(await screen.findByRole('heading', { name: 'Move now' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Operational drag' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Recovery pipeline' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Price and margin watch' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Confidence / coverage' })).not.toBeInTheDocument();
  });

  test('updates the business window when the time-range toggle changes', async () => {
    renderRoute();

    expect(await screen.findByText('Showing last 30d posture vs prior 30d')).toBeInTheDocument();
    expect(screen.getByText(/price or margin drags in last 30d/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('radio', { name: '7d' }));
    expect(screen.getByText('Showing last 7d posture vs prior 7d')).toBeInTheDocument();
    expect(screen.getByText(/price or margin drags in last 7d/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('radio', { name: '90d' }));
    expect(screen.getByText('Showing last 90d posture vs prior 90d')).toBeInTheDocument();
    expect(screen.getByText(/price or margin drags in last 90d/i)).toBeInTheDocument();
  });

  test('turns the board into a comparison surface when compare is enabled', async () => {
    const { container } = renderRoute();

    expect(await screen.findByText('Showing last 30d posture vs prior 30d')).toBeInTheDocument();
    expect(
      screen.getAllByText((_, element) => {
        const text = element?.textContent ?? '';
        return (
          (text.includes('Soft') && text.includes('Steady')) ||
          (text.includes('Steady') && text.includes('Strong')) ||
          (text.includes('Soft') && text.includes('Strong'))
        );
      }).length,
    ).toBeGreaterThan(1);
    expect(screen.getAllByText(/cover up|cover down|from capacity holding|from partially coverable|Limited comparison/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Review price|Stable/i).length).toBeGreaterThan(0);
    expect(container.querySelectorAll('[data-tone]').length).toBeGreaterThan(1);
    expect(container.querySelectorAll('line[stroke-dasharray="4 3"]').length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole('button', { name: /compare/i }));
    expect(screen.getByText('Showing last 30d posture only')).toBeInTheDocument();
    expect(screen.queryByText(/Push from Stable|Unblock from Stable|Review price from Stable/i)).not.toBeInTheDocument();
    expect(container.querySelectorAll('[data-tone]').length).toBeGreaterThan(1);
  });

  test('renders sparklines for demand in normal mode only', async () => {
    const { container } = renderRoute();

    await screen.findByText('Showing last 30d posture vs prior 30d');
    fireEvent.click(screen.getByRole('button', { name: /compare/i }));

    const sparklineNodes = container.querySelectorAll('[data-tone]');
    expect(sparklineNodes.length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText('Rising').length).toBeGreaterThan(0);
  });

  test('suppresses hover styling after deactivation until the compare button is left', async () => {
    renderRoute();

    const compareButton = await screen.findByRole('button', { name: /compare/i });
    fireEvent.mouseEnter(compareButton);
    fireEvent.click(compareButton);

    expect(compareButton).toHaveAttribute('data-hover-suppressed', 'true');
    expect(compareButton.className).not.toContain('hover:bg-card');

    fireEvent.mouseLeave(compareButton);

    expect(compareButton).toHaveAttribute('data-hover-suppressed', 'false');
    expect(compareButton.className).toContain('hover:bg-card');
  });
});
