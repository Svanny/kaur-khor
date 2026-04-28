import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
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
  showAnalysisPage: true,
  showHeartbeatRibbons: true,
  showPerformanceCompareToggle: true,
  showPerformanceTimelineCard: true,
  showRightRailCards: true,
  t: (
    key: Parameters<typeof getTranslation>[1],
    variables?: Parameters<typeof getTranslation>[2],
  ) => getTranslation('en', key, variables),
};

vi.mock('@/state/inventory', () => ({
  useInventory: () => inventoryHook(),
  useInventoryActions: () => inventoryHook(),
  useInventoryState: () => inventoryHook(),
}));

vi.mock('@/state/preferences', () => ({
  usePreferences: () => preferenceState,
}));

vi.mock('@/components/ui/compact-sparkline', () => ({
  CompactSparkline: ({ splitIndex, tone = 'flat' }: { splitIndex?: number; tone?: string }) => (
    <svg data-tone={tone}>{splitIndex ? <line strokeDasharray="4 3" /> : null}</svg>
  ),
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
      supplierName: 'Salon Tools',
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
      supplierName: 'Mekong Looms',
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
    preferenceState.language = 'en';
    preferenceState.showHeartbeatRibbons = true;
    preferenceState.showRightRailCards = true;
    preferenceState.showPerformanceCompareToggle = true;
    preferenceState.showPerformanceTimelineCard = true;
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

  function renderAnalysisRouteWithDescriptionVisibility(visible: boolean) {
    return render(
      <DescriptionTextVisibilityProvider visible={visible}>
        <MemoryRouter initialEntries={['/analysis']}>
          <AnalysisRoute />
        </MemoryRouter>
      </DescriptionTextVisibilityProvider>,
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

  async function renderPerformanceRouteSettled(initialEntry = '/performance') {
    let view!: ReturnType<typeof renderRoute>;
    await act(async () => {
      view = renderRoute(initialEntry);
      await Promise.resolve();
    });
    return view;
  }

  async function renderAnalysisRouteSettled(initialEntry = '/analysis') {
    let view!: ReturnType<typeof renderAnalysisRoute>;
    await act(async () => {
      view = renderAnalysisRoute(initialEntry);
      await Promise.resolve();
    });
    return view;
  }

  async function renderAnalysisRouteSettledWithDescriptionVisibility(visible: boolean) {
    let view!: ReturnType<typeof renderAnalysisRouteWithDescriptionVisibility>;
    await act(async () => {
      view = renderAnalysisRouteWithDescriptionVisibility(visible);
      await Promise.resolve();
    });
    return view;
  }

  test('renders the performance steering surface', async () => {
    await renderPerformanceRouteSettled();

    expect(screen.getAllByText('Pressure')[0]).toBeInTheDocument();
    expect(screen.getByText('Demand, available capacity, incoming stock, and pricing in one business view.')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Move now' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Demand × capacity board' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Cash and profit efficiency' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Business timeline' })).toBeInTheDocument();
    expect(screen.getByText('Demand momentum')).toBeInTheDocument();
    expect(screen.getByText('Revenue at risk')).toBeInTheDocument();
  });

  test('renders icons inside performance toggle pills', async () => {
    await renderPerformanceRouteSettled();

    expect(screen.getByRole('radio', { name: 'All' }).querySelector('svg')).not.toBeNull();
    expect(screen.getByRole('radio', { name: 'Services' }).querySelector('svg')).not.toBeNull();
    expect(screen.getByRole('radio', { name: 'SKUs' }).querySelector('svg')).not.toBeNull();
  });

  test('shows supplier filter on analysis page', async () => {
    await renderAnalysisRouteSettled();

    expect(await screen.findByRole('combobox', { name: 'Filter by supplier' })).toBeInTheDocument();
  });

  test('uses a taller status pill line box for translated board labels', async () => {
    preferenceState.language = 'km';

    const { container } = await renderPerformanceRouteSettled();

    const statusPills = Array.from(container.querySelectorAll('span')).filter((node) =>
      node.className.includes('min-h-8'),
    );

    expect(statusPills.length).toBeGreaterThan(0);
    expect(statusPills[0]?.className).toContain('leading-[1.35]');
  });

  test('renders the dedicated analysis workbench route', async () => {
    renderAnalysisRoute();

    expect(screen.getAllByText('Explain')[0]).toBeInTheDocument();
    expect(
      screen.getByText('Inspect how saved updates shaped banji’s current picture of demand, orders, deliveries, timing shifts, and price effects.'),
    ).toBeInTheDocument();
    expect(
      await screen.findByRole('heading', { name: 'System timeline' }, { timeout: 10_000 }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Settings' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Indicators' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Layout' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reset chart' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Recent' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '1D' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Refresh explanation' })).toBeInTheDocument();
    expect(screen.queryByText('Risk explorer')).not.toBeInTheDocument();
    expect(screen.queryByText('Saved updates')).not.toBeInTheDocument();
    expect(screen.queryByText('Service blocker map')).not.toBeInTheDocument();
    expect(screen.queryByRole('group', { name: /Select Explain time range/i })).not.toBeInTheDocument();
  }, 10_000);

  test('does not restart analysis detail hydration on an unchanged route rerender', async () => {
    const state = createInventoryState();
    inventoryHook.mockReturnValue(state);

    const { rerender } = render(
      <MemoryRouter initialEntries={['/analysis']}>
        <AnalysisRoute />
      </MemoryRouter>,
    );

    expect(await screen.findByRole('heading', { name: 'System timeline' })).toBeInTheDocument();
    const serviceLoadCount = state.loadSenaServiceDetail.mock.calls.length;
    const skuLoadCount = state.loadSenaSkuDetail.mock.calls.length;

    rerender(
      <MemoryRouter initialEntries={['/analysis']}>
        <AnalysisRoute />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(state.loadSenaServiceDetail).toHaveBeenCalledTimes(serviceLoadCount);
      expect(state.loadSenaSkuDetail).toHaveBeenCalledTimes(skuLoadCount);
    });
  });

  test('scrolls the analysis route back to the top on entry', async () => {
    window.scrollTo = vi.fn();

    renderAnalysisRoute();

    expect(window.scrollTo).toHaveBeenCalledWith({ top: 0, left: 0, behavior: 'auto' });
    expect(await screen.findByRole('heading', { name: 'System timeline' })).toBeInTheDocument();
  });

  test('runs analysis from the analysis page header', async () => {
    const user = userEvent.setup();
    const retrySenaRun = vi.fn(async () => ({ runId: 'run-1' }));
    inventoryHook.mockReturnValue(createInventoryState({ retrySenaRun }));

    renderAnalysisRoute();

    await user.click(await screen.findByRole('button', { name: 'Refresh explanation' }));

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

    expect(screen.getAllByText('Explain')[0]).toBeInTheDocument();
    expect(screen.queryByText('Explain needs a catalog first')).not.toBeInTheDocument();
    expect(screen.queryByText('Explain needs your first update')).not.toBeInTheDocument();
  });

  test('renders the analysis empty-state create first SKU CTA with an icon', () => {
    inventoryHook.mockReturnValue(createInventoryState({
      catalog: null,
      diagnostics: null,
      isLoading: false,
      observations: [],
      workspaceSummary: null,
    }));

    renderAnalysisRoute();

    const link = screen.getByRole('link', { name: 'Create first SKU' });
    expect(link).toHaveAttribute('href', '/catalog/skus/new');
    expect(link.querySelector('svg')).not.toBeNull();
  });

  test('shows the analysis loading state while entity detail hydration is still pending', () => {
    inventoryHook.mockReturnValue(createInventoryState({
      loadSenaServiceDetail: vi.fn(() => new Promise(() => {})),
      loadSenaSkuDetail: vi.fn(() => new Promise(() => {})),
    }));

    renderAnalysisRoute();

    expect(screen.getAllByText('Explain')[0]).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'System timeline' })).not.toBeInTheDocument();
    expect(screen.queryByText('Explain needs your first update')).not.toBeInTheDocument();
  });

  test('renders the analysis pressure tab as its own surface', async () => {
    const user = userEvent.setup();

    renderAnalysisRoute();

    expect(await screen.findByRole('heading', { name: 'System timeline' })).toBeInTheDocument();
    await user.click(screen.getByRole('tab', { name: /Risks/i }));

    expect(await screen.findByText('Risk explorer')).toBeInTheDocument();
    expect(screen.queryByText('Saved updates')).not.toBeInTheDocument();
    expect(screen.queryByText('Service blocker map')).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'System timeline' })).not.toBeInTheDocument();
  });

  test('renders the analysis observations tab as its own surface', async () => {
    const user = userEvent.setup();

    renderAnalysisRoute();

    expect(await screen.findByRole('heading', { name: 'System timeline' })).toBeInTheDocument();
    await user.click(screen.getByRole('tab', { name: /Observations/i }));

    expect(await screen.findByText('Saved updates')).toBeInTheDocument();
    expect(screen.queryByText('Risk explorer')).not.toBeInTheDocument();
    expect(screen.queryByText('Service blocker map')).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'System timeline' })).not.toBeInTheDocument();
  });

  test('uses shared observation row spacing on the analysis observations tab', async () => {
    const { container } = renderAnalysisRoute();

    expect(await screen.findByRole('heading', { name: 'System timeline' })).toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole('tab', { name: /Observations/i }));
    expect(await screen.findByText('Saved updates')).toBeInTheDocument();

    const observationCells = Array.from(container.querySelectorAll('[data-observation-cell="true"]'));
    expect(observationCells.length).toBeGreaterThan(0);
    observationCells.forEach((cell) => {
      expect(cell.className).not.toContain('px-5');
      expect(cell.className).not.toContain('sm:px-6');
    });
  });

  test('keeps observation pagination on the analysis observations tab', async () => {
    const user = userEvent.setup();

    inventoryHook.mockReturnValue(createInventoryState({ observations: Array.from({ length: 7 }, (_, index) => buildObservation(index + 1)) }));

    renderAnalysisRoute();

    expect(await screen.findByRole('heading', { name: 'System timeline' })).toBeInTheDocument();
    await user.click(screen.getByRole('tab', { name: /Observations/i }));
    expect(await screen.findByText('Saved updates')).toBeInTheDocument();

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

    expect(await screen.findByRole('heading', { name: 'System timeline' })).toBeInTheDocument();
    await user.click(screen.getByRole('tab', { name: /Blockers/i }));

    expect(await screen.findByText('Service blocker map')).toBeInTheDocument();
    expect(screen.queryByText('Risk explorer')).not.toBeInTheDocument();
    expect(screen.queryByText('Saved updates')).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'System timeline' })).not.toBeInTheDocument();
  });

  test('renders the shared trading chart controls on analysis', async () => {
    renderAnalysisRoute();

    expect(await screen.findByRole('heading', { name: 'System timeline' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Settings' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Indicators' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Layout' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Custom timeframe' })).toBeInTheDocument();
  });

  test('keeps the analysis chart on the workbench tab only', async () => {
    renderAnalysisRoute('/analysis?section=pressure');

    expect(screen.getAllByText('Explain')[0]).toBeInTheDocument();
    expect(await screen.findByRole('tab', { name: 'Risks' })).toHaveAttribute('data-state', 'active');
    expect(screen.queryByRole('heading', { name: 'System timeline' })).not.toBeInTheDocument();
  });


  test('hides section header descriptions when explanatory text is disabled', async () => {
    renderRouteWithDescriptionVisibility(false);

    expect(await screen.findByRole('heading', { name: 'Business timeline' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Business timeline help' })).not.toBeInTheDocument();
  });

  test('hides analysis page descriptors when explanatory text is disabled', async () => {
    await renderAnalysisRouteSettledWithDescriptionVisibility(false);

    expect(screen.getAllByText('Explain')[0]).toBeInTheDocument();
    expect(
      screen.queryByText('See how saved updates turned into banji’s current picture of demand, incoming stock, delivery timing, and price.'),
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

  test('filters services by linked sku supplier', async () => {
    renderRoute('/performance?scope=services&supplier=Mekong+Looms');

    const boardHeading = await screen.findByRole('heading', { name: 'Demand × capacity board' });
    const board = boardHeading.closest('section');
    expect(board).not.toBeNull();
    const boardQueries = within(board!);

    expect(boardQueries.getByText('Hair Coloring')).toBeInTheDocument();
    expect(boardQueries.queryByText('Haircut')).not.toBeInTheDocument();
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

  test('hides the compare toggle and stays in single view when disabled', async () => {
    preferenceState.showPerformanceCompareToggle = false;

    renderRoute('/performance?compare=1');

    expect(screen.queryByRole('button', { name: /compare/i })).not.toBeInTheDocument();
    expect(screen.queryByText('Compare view')).not.toBeInTheDocument();
  });

  test('hides the business timeline card when disabled', async () => {
    preferenceState.showPerformanceTimelineCard = false;

    renderRoute();

    expect(await screen.findByRole('heading', { name: 'Move now' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Business timeline' })).not.toBeInTheDocument();
  });

  test('hides the heartbeat and ribbon summary when disabled', async () => {
    preferenceState.showHeartbeatRibbons = false;

    renderRoute('/performance?compare=0');

    expect(await screen.findByRole('heading', { name: 'Move now' })).toBeInTheDocument();
    expect(screen.queryByText('Demand momentum')).not.toBeInTheDocument();
  });

  test('updates the business window when the time-range toggle changes', async () => {
    renderRoute('/performance?compare=1');

    expect(await screen.findByText('Compare view')).toBeInTheDocument();
    expect(screen.getByText(/price or margin drags in last 30d/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('combobox', { name: /Select performance time range/i }));
    fireEvent.click(screen.getByRole('option', { name: '7D' }));
    expect(screen.getByText('Compare view')).toBeInTheDocument();
    expect(screen.getByText(/price or margin drags in last 7d/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('combobox', { name: /Select performance time range/i }));
    fireEvent.click(screen.getByRole('option', { name: '90D' }));
    expect(screen.getByText('Compare view')).toBeInTheDocument();
    expect(screen.getByText(/price or margin drags in last 90d/i)).toBeInTheDocument();
  });

  test('shows custom timeframe option in the time-range dropdown', async () => {
    renderRoute();

    fireEvent.click(screen.getByRole('combobox', { name: /Select performance time range/i }));
    expect(screen.getByRole('option', { name: 'Custom' })).toBeInTheDocument();
  });

  test('opens custom timeframe dialog when custom is selected and clears back to 30d', async () => {
    renderRoute();

    fireEvent.click(screen.getByRole('combobox', { name: /Select performance time range/i }));
    fireEvent.click(screen.getByRole('option', { name: 'Custom' }));

    expect(await screen.findByRole('dialog', { name: 'Custom timeframe' })).toBeInTheDocument();
    expect(screen.getByLabelText(/Custom timeframe start date/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Custom timeframe end date/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Clear/i }));

    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'Custom timeframe' })).not.toBeInTheDocument();
    });

    expect(screen.getByText(/Timeframe: 30D/i)).toBeInTheDocument();
  });

  test('shows custom timeframe label when range is custom', async () => {
    renderRoute('/performance?range=custom&customStart=2026-01-01T00%3A00%3A00.000Z&customEnd=2026-01-15T23%3A59%3A59.999Z');

    expect(await screen.findByText(/Timeframe: Custom/i)).toBeInTheDocument();
  });

  test('turns the board into a comparison surface when compare is enabled', async () => {
    const { container } = renderRoute('/performance?compare=1');

    expect(await screen.findByText('Compare view')).toBeInTheDocument();
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
    expect(screen.getByText('Single view')).toBeInTheDocument();
    expect(screen.queryByText(/Push from Stable|Unblock from Stable|Review price from Stable/i)).not.toBeInTheDocument();
    expect(container.querySelectorAll('[data-tone]').length).toBeGreaterThan(1);
  });

  test('renders sparklines for demand in normal mode only', async () => {
    const { container } = renderRoute('/performance?compare=1');

    await screen.findByText('Compare view');
    fireEvent.click(screen.getByRole('button', { name: /compare/i }));

    const sparklineNodes = container.querySelectorAll('[data-tone]');
    expect(sparklineNodes.length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText('Rising').length).toBeGreaterThan(0);
  });

  test('suppresses hover styling after deactivation until the compare button is left', async () => {
    renderRoute('/performance?compare=1');

    const compareButton = await screen.findByRole('button', { name: /compare/i });
    fireEvent.mouseEnter(compareButton);
    fireEvent.click(compareButton);

    expect(compareButton).toHaveAttribute('data-hover-suppressed', 'false');

    fireEvent.mouseLeave(compareButton);

    expect(compareButton).toHaveAttribute('data-hover-suppressed', 'false');
  });
});
