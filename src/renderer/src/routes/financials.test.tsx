import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { getTranslation } from '@/lib/translations';
import { FinancialsRoute } from './financials';

const inventoryHook = vi.fn();
const preferenceState = {
  currency: 'USD',
  language: 'en',
  showHeartbeatRibbons: true,
  showPerformanceCompareToggle: true,
  showRightRailCards: true,
  t: (
    key: Parameters<typeof getTranslation>[1],
    variables?: Parameters<typeof getTranslation>[2],
  ) => getTranslation('en', key, variables),
};

vi.mock('@/state/inventory', () => ({
  useInventory: () => inventoryHook(),
}));

vi.mock('@/state/preferences', () => ({
  usePreferences: () => preferenceState,
}));

vi.mock('./performance/use-sena-detail-hydration', () => ({
  useSenaDetailHydration: () => ({
    isHydratingDetails: false,
    serviceDetailsById: {
      'service-color': {
        activityIntervalHigh: 6,
        activityIntervalLow: 4,
        activityMean: 5,
        bottleneckProbability: 0.2,
        contributors: [{ bottleneckProbability: 0.2, skuId: 'sku-shampoo', usageProbability: 1 }],
        regimeTimeline: [],
        serviceId: 'service-color',
      },
    },
    skuDetailsById: {
      'sku-shampoo': {
        demandPosterior: [],
        inventoryPosterior: [],
        leadTimePosterior: [],
        pipelinePosterior: [
          {
            ageDaysMean: 2,
            inTransitMean: 5,
            intervalIndex: 1,
            orderProbability: 0.8,
            orderQuantityMean: 5,
            receiptQuantityMean: 0,
          },
        ],
        summary: {
          credibleIntervalHigh: 18,
          credibleIntervalLow: 12,
          daysOfCover: 8,
          demandPerDayMean: 2,
          expectedLeadTimeDemand: 8,
          latestPosteriorUnits: 16,
          leadTimeMeanDays: 4,
          leadTimeStdDays: 1,
          reorderPoint: 6,
          reorderTriggerProbability: 0.2,
          regimeProbabilities: { normal: 1 },
          safetyStock: 3,
          skuId: 'sku-shampoo',
          stockoutRisk: 0.12,
        },
      },
    },
  }),
}));

const catalog = {
  bundles: [],
  schemaVersion: 1,
  services: [
    {
      archived: false,
      bundle: false,
      description: 'Color service',
      imagePath: null,
      name: 'Hair Coloring',
      price: 42,
      serviceId: 'service-color',
    },
  ],
  sharingMask: [
    { enabled: true, serviceId: 'service-color', skuId: 'sku-shampoo', usageProbability: 1 },
  ],
  skus: [
    {
      archived: false,
      costPerUnit: 5,
      description: 'Retail and service support shampoo',
      imagePath: null,
      leadTimeMeanDaysHint: 4,
      leadTimeStdDaysHint: 1,
      name: 'Shampoo Classic',
      productPrice: 20,
      skuId: 'sku-shampoo',
      soldAsProduct: true,
      supplierName: 'Mekong Looms',
    },
  ],
};

const workspaceSummary = {
  highRiskSkuIds: [],
  intervalCount: 2,
  latestObservedAt: '2026-04-16T08:00:00.000Z',
  ownerSub: 'desktop-owner',
  pendingReorderCount: 0,
  runId: 'run-1',
  serviceCount: 1,
  skuCount: 1,
  skuSummaries: [
    {
      credibleIntervalHigh: 18,
      credibleIntervalLow: 12,
      daysOfCover: 8,
      demandPerDayMean: 2,
      expectedLeadTimeDemand: 8,
      latestPosteriorUnits: 16,
      leadTimeMeanDays: 4,
      leadTimeStdDays: 1,
      reorderPoint: 6,
      reorderTriggerProbability: 0.2,
      regimeProbabilities: { normal: 1 },
      safetyStock: 3,
      skuId: 'sku-shampoo',
      stockoutRisk: 0.12,
    },
  ],
  topRegime: 'normal',
};

const observations = [
  {
    input: {
      adjustmentSignals: [{ quantityDelta: -1, reason: 'shrinkage', skuId: 'sku-shampoo' }],
      leadTimeHints: [],
      notes: null,
      observedAt: '2026-04-16T08:00:00.000Z',
      orderSignals: [],
      recipeUsageHints: [],
      retailPrices: [{ price: 18, skuId: 'sku-shampoo' }],
      retailRankings: ['sku-shampoo'],
      retailSalesSnapshot: [{ skuId: 'sku-shampoo', unitsSold: 3 }],
      retailStockouts: [],
      servicePrices: [],
      serviceRankings: ['service-color'],
      serviceSalesSnapshot: [{ serviceId: 'service-color', unitsSold: 2 }],
      serviceStockouts: [],
      stockSnapshot: [{ costPerUnit: 6, productPrice: 18, skuId: 'sku-shampoo', unitsInStock: 16 }],
    },
    observationId: 'obs-1',
    ownerSub: 'desktop-owner',
  },
];

function createInventoryState(overrides: Record<string, unknown> = {}) {
  return {
    catalog,
    diagnostics: {
      changePointProbability: 0.1,
      coverageEstimate: 0.9,
      effectiveSampleSizeMean: 40,
      posteriorPredictiveErrorMean: 0.1,
      regimeHistory: [],
      resamplingCount: 2,
      seasonalityActive: false,
      smoothingEnabled: true,
    },
    isLoading: false,
    loadSenaServiceDetail: vi.fn(),
    loadSenaSkuDetail: vi.fn(),
    observations,
    orderBatches: [
      {
        batchOrderId: 'batch-1',
        children: [
          {
            childOrderId: 'child-1',
            createdAt: '2026-04-15T08:00:00.000Z',
            effective: {
              costPerUnit: 5,
              expectedArrivalAt: '2026-04-18T08:00:00.000Z',
              leadTimeDaysHint: null,
              leadTimeVariability: null,
              orderedQuantity: 10,
              placementTimestamp: '2026-04-15T08:00:00.000Z',
              receivedQuantity: 0,
              receiptTimestamp: null,
              supplierName: 'Mekong Looms',
              supplierNote: null,
            },
            inheritedFromBatch: true,
            overrides: {},
            skuId: 'sku-shampoo',
            status: 'awaiting_receipt',
            updatedAt: '2026-04-15T08:00:00.000Z',
          },
        ],
        createdAt: '2026-04-15T08:00:00.000Z',
        ownerSub: 'desktop-owner',
        shared: {
          costPerUnit: 5,
          expectedArrivalAt: '2026-04-18T08:00:00.000Z',
          leadTimeDaysHint: null,
          leadTimeVariability: null,
          orderedQuantity: 10,
          placementTimestamp: '2026-04-15T08:00:00.000Z',
          receivedQuantity: 0,
          receiptTimestamp: null,
          supplierName: 'Mekong Looms',
          supplierNote: null,
        },
        status: 'awaiting_receipt',
        supplierName: 'Mekong Looms',
        updatedAt: '2026-04-15T08:00:00.000Z',
      },
    ],
    workspaceSummary,
    ...overrides,
  };
}

describe('FinancialsRoute', () => {
  beforeEach(() => {
    preferenceState.language = 'en';
    preferenceState.showHeartbeatRibbons = true;
    preferenceState.showPerformanceCompareToggle = true;
    preferenceState.showRightRailCards = true;
    inventoryHook.mockReturnValue(createInventoryState());
  });

  function renderRoute(initialEntry = '/financials') {
    return render(
      <MemoryRouter initialEntries={[initialEntry]}>
        <FinancialsRoute />
      </MemoryRouter>,
    );
  }

  test('renders a statement-first financial surface', () => {
    renderRoute();

    expect(screen.getAllByText('Financials').length).toBeGreaterThan(0);
    expect(screen.getByText('Cash Flow')).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: '1D' })).toHaveAttribute('data-state', 'on');
    expect(screen.getAllByText('Net sales').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Gross profit').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Inventory capital').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Open commitments').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Margin erosion').length).toBeGreaterThan(0);
    expect(screen.getByRole('heading', { name: 'Financial statement' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Economic contributors' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Money quality bands' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Move now' })).not.toBeInTheDocument();
  });

  test('applies shared semantic tones to money deltas and quality bands', () => {
    renderRoute();

    expect(screen.getAllByText(/\+\$/)[0]).toHaveClass('bg-emerald-50');
    expect(screen.getByRole('heading', { name: 'Earners' }).closest('div')).toHaveClass('bg-emerald-50/70');
    expect(screen.getByRole('heading', { name: 'Capital traps' }).closest('div')).toHaveClass('bg-amber-50/70');
    expect(screen.getByRole('heading', { name: 'Margin leaks' }).closest('div')).toHaveClass('bg-rose-50/70');
  });

  test('links ribbon metrics to the financial statement rows', () => {
    renderRoute();

    expect(screen.getByRole('link', { name: /jump to net sales in the financial statement/i })).toHaveAttribute(
      'href',
      '#financials-statement-net-sales',
    );
    expect(screen.getByRole('link', { name: /jump to open commitments in the financial statement/i })).toHaveAttribute(
      'href',
      '#financials-statement-open-orders',
    );
    expect(document.getElementById('financials-statement-cost-consumed')).toBeInTheDocument();
  });

  test('hides the financial ribbon when heartbeat ribbons are disabled', () => {
    preferenceState.showHeartbeatRibbons = false;

    renderRoute();

    expect(screen.getByText('Cash Flow')).toBeInTheDocument();
    expect(screen.queryByText('Inventory capital')).not.toBeInTheDocument();
    expect(screen.queryByText(/showing last 1d/i)).not.toBeInTheDocument();
  });

  test('colors capital trap items with the capital trap semantic tone', () => {
    inventoryHook.mockReturnValue(createInventoryState({
      observations: observations.map((observation) => ({
        ...observation,
        input: {
          ...observation.input,
          retailSalesSnapshot: [],
          serviceSalesSnapshot: [],
        },
      })),
    }));

    renderRoute();

    expect(screen.getByRole('link', { name: /Shampoo Classic .* tied up without window sales/i })).toHaveClass('bg-amber-50/70');
  });

  test('keeps supplier and scope query state in the page controls', () => {
    renderRoute('/financials?scope=services&supplier=Mekong+Looms&compare=0');

    expect(screen.getByRole('radio', { name: /Services/i })).toHaveAttribute('data-state', 'on');
    expect(screen.getByRole('button', { name: /Single view/i })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Filter by supplier' })).toHaveTextContent('Mekong Looms');
  });
});
