import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { getTranslation } from '@/lib/translations';
import { FinancialsRoute } from './financials';

const inventoryHook = vi.fn();
const optionalAutomationHook = vi.fn();
const preferenceState = {
  currency: 'USD',
  language: 'en',
  showAnalysisPage: true,
  showHeartbeatRibbons: true,
  showPerformanceCompareToggle: true,
  showRightRailCards: true,
  t: (
    key: Parameters<typeof getTranslation>[1],
    variables?: Parameters<typeof getTranslation>[2],
  ) => getTranslation(preferenceState.language, key, variables),
};

vi.mock('@/state/inventory', () => ({
  useInventory: () => inventoryHook(),
}));

vi.mock('@/state/preferences', () => ({
  usePreferences: () => preferenceState,
}));

vi.mock('@/state/automation', () => ({
  useOptionalAutomation: () => optionalAutomationHook(),
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
    preferenceState.showAnalysisPage = true;
    preferenceState.showHeartbeatRibbons = true;
    preferenceState.showPerformanceCompareToggle = true;
    preferenceState.showRightRailCards = true;
    inventoryHook.mockReturnValue(createInventoryState());
    optionalAutomationHook.mockReturnValue({
      connection: null,
      conversations: [],
      exposures: [],
      intakes: [
        {
          intakeId: 'intake-1',
          conversationId: 'conversation-1',
          channel: 'telegram',
          status: 'ticketed',
          parseConfidence: 'high',
          customerDisplayName: 'Telegram customer',
          customerHandle: '@telegram_customer',
          phone: null,
          notes: null,
          quotedSubtotal: 24,
          currencyCode: 'USD',
          deliveryFee: null,
          quotedTotal: 24,
          createdAt: '2026-04-16T07:30:00.000Z',
          updatedAt: '2026-04-16T07:30:00.000Z',
          promotedTicketId: 'ticket-1',
          lines: [],
        },
        {
          intakeId: 'intake-2',
          conversationId: 'conversation-2',
          channel: 'telegram',
          status: 'canceled',
          parseConfidence: 'medium',
          customerDisplayName: 'Canceled customer',
          customerHandle: '@canceled_customer',
          phone: null,
          notes: null,
          quotedSubtotal: 8,
          currencyCode: 'USD',
          deliveryFee: null,
          quotedTotal: 8,
          createdAt: '2026-04-16T07:40:00.000Z',
          updatedAt: '2026-04-16T07:40:00.000Z',
          promotedTicketId: null,
          lines: [],
        },
      ],
      metrics: null,
      error: null,
      isLoading: false,
      isSaving: false,
      reload: vi.fn(),
      loadWorkspace: vi.fn(),
      saveConnection: vi.fn(),
      patchExposureRow: vi.fn(),
      readConversation: vi.fn(),
      listIntakes: vi.fn(),
      readIntake: vi.fn(),
      resolveIntake: vi.fn(),
      promoteIntake: vi.fn(),
      testTelegramConnection: vi.fn(),
    });
  });

  function renderRoute(initialEntry = '/financials') {
    return render(
      <MemoryRouter initialEntries={[initialEntry]}>
        <FinancialsRoute />
      </MemoryRouter>,
    );
  }

  function renderRoutedFinancials(initialEntry = '/financials') {
    return render(
      <MemoryRouter initialEntries={[initialEntry]}>
        <Routes>
          <Route element={<div>Home fallback</div>} path="/" />
          <Route element={<FinancialsRoute />} path="/financials" />
        </Routes>
      </MemoryRouter>,
    );
  }

  test('renders a statement-first financial surface', () => {
    renderRoute();

    expect(screen.getAllByText('Money').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Money').length).toBeGreaterThan(0);
    expect(screen.getByRole('combobox', { name: /Select financials time range/i })).toHaveTextContent('1D');
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

  test('keeps Khmer Money terminology aligned between route title and title-adjacent labels', () => {
    preferenceState.language = 'km';

    renderRoute();

    expect(screen.getAllByText('ហិរញ្ញវត្ថុ').length).toBeGreaterThan(0);
    expect(screen.queryByText('លំហូរសាច់ប្រាក់')).not.toBeInTheDocument();
    expect(screen.queryByText('Money')).not.toBeInTheDocument();
  });

  test('redirects financials when insights are disabled', () => {
    preferenceState.showAnalysisPage = false;

    renderRoutedFinancials();

    expect(screen.getByText('Home fallback')).toBeInTheDocument();
  });

  test('links empty financial workspace recovery to the work queue', () => {
    inventoryHook.mockReturnValue(createInventoryState({
      workspaceSummary: null,
    }));

    renderRoute();

    expect(screen.getByRole('link', { name: /Open Work/i })).toHaveAttribute('href', '/work/queue');
  });

  test('renders icons inside financial toggle pills', () => {
    renderRoute();

    expect(screen.getByRole('radio', { name: 'All' }).querySelector('svg')).not.toBeNull();
    expect(screen.getByRole('radio', { name: /Services/i }).querySelector('svg')).not.toBeNull();
    expect(screen.getByRole('radio', { name: /SKUs/i }).querySelector('svg')).not.toBeNull();
  });

  test('applies shared semantic tones to money deltas and quality bands', () => {
    renderRoute('/financials?compare=1');

    expect(screen.getAllByText(/\+\$/)[0]).toHaveClass('bg-emerald-50');
    expect(screen.getByRole('heading', { name: 'Earners' }).closest('div')).toHaveClass('bg-emerald-50/70');
    expect(screen.queryByRole('heading', { name: 'Capital traps' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Margin leaks' })).not.toBeInTheDocument();
  });

  test('renders ribbon metrics without clickable links', () => {
    renderRoute();

    expect(screen.getAllByText('Net sales').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Open commitments').length).toBeGreaterThan(0);
    expect(screen.queryByRole('link', { name: /jump to net sales in the financial statement/i })).not.toBeInTheDocument();
    expect(document.getElementById('financials-statement-cost-consumed')).toBeInTheDocument();
  });

  test('hides the financial ribbon when heartbeat ribbons are disabled', () => {
    preferenceState.showHeartbeatRibbons = false;

    renderRoute();

    expect(screen.getAllByText('Money').length).toBeGreaterThan(0);
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

  test('shows custom timeframe option in the time-range dropdown', () => {
    renderRoute();

    const combobox = screen.getByRole('combobox', { name: /Select financials time range/i });
    fireEvent.click(combobox);
    expect(screen.getByRole('option', { name: 'Custom' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Open custom date range dialog' })).not.toBeInTheDocument();
  });

  test('shows custom timeframe edit button after a custom range is active', () => {
    renderRoute('/financials?range=custom&customStart=2026-01-01T00%3A00%3A00.000Z&customEnd=2026-01-15T23%3A59%3A59.999Z');

    fireEvent.click(screen.getByRole('combobox', { name: /Select financials time range/i }));

    expect(screen.getByRole('option', { name: 'Custom' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Open custom date range dialog' })).toBeInTheDocument();
  });

  test('opens custom timeframe dialog when custom is selected and clears back to 30d', async () => {
    renderRoute();

    fireEvent.click(screen.getByRole('combobox', { name: /Select financials time range/i }));
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

  test('shows custom timeframe label when range is custom', () => {
    renderRoute('/financials?range=custom&customStart=2026-01-01T00%3A00%3A00.000Z&customEnd=2026-01-15T23%3A59%3A59.999Z');

    expect(screen.getByText(/Timeframe: Custom/i)).toBeInTheDocument();
  });

  test('filters Telegram attribution by active custom date range', () => {
    optionalAutomationHook.mockReturnValue({
      connection: null,
      conversations: [],
      exposures: [],
      intakes: [
        {
          intakeId: 'inside-custom',
          conversationId: 'conversation-1',
          channel: 'telegram',
          status: 'ticketed',
          parseConfidence: 'high',
          customerDisplayName: 'Inside custom',
          customerHandle: '@inside',
          phone: null,
          notes: null,
          quotedSubtotal: 24,
          currencyCode: 'USD',
          deliveryFee: null,
          quotedTotal: 24,
          createdAt: '2026-04-16T07:30:00.000Z',
          updatedAt: '2026-04-16T07:30:00.000Z',
          promotedTicketId: 'ticket-1',
          lines: [],
        },
        {
          intakeId: 'outside-custom',
          conversationId: 'conversation-2',
          channel: 'telegram',
          status: 'ticketed',
          parseConfidence: 'high',
          customerDisplayName: 'Outside custom',
          customerHandle: '@outside',
          phone: null,
          notes: null,
          quotedSubtotal: 99,
          currencyCode: 'USD',
          deliveryFee: null,
          quotedTotal: 99,
          createdAt: '2026-04-01T07:30:00.000Z',
          updatedAt: '2026-04-01T07:30:00.000Z',
          promotedTicketId: 'ticket-2',
          lines: [],
        },
      ],
      metrics: null,
      error: null,
      isLoading: false,
      isSaving: false,
      reload: vi.fn(),
      loadWorkspace: vi.fn(),
      saveConnection: vi.fn(),
      patchExposureRow: vi.fn(),
      readConversation: vi.fn(),
      listIntakes: vi.fn(),
      readIntake: vi.fn(),
      resolveIntake: vi.fn(),
      promoteIntake: vi.fn(),
      testTelegramConnection: vi.fn(),
    });

    renderRoute('/financials?range=custom&customStart=2026-04-16T00%3A00%3A00.000Z&customEnd=2026-04-16T23%3A59%3A59.999Z');

    expect(screen.getByText(/Open quoted Telegram value/i)).toHaveTextContent('$24.00');
    expect(screen.getByText(/Ticketed Telegram intake/i)).toHaveTextContent('1');
    expect(screen.queryByText(/\$123.00/)).not.toBeInTheDocument();
  });

  test('summarizes Telegram attribution in the right rail', () => {
    renderRoute();

    expect(screen.getByRole('heading', { name: 'Telegram attribution' })).toBeInTheDocument();
    expect(screen.getByText(/Open quoted Telegram value/i)).toBeInTheDocument();
    expect(screen.getByText(/Realized Telegram value/i)).toBeInTheDocument();
    expect(screen.getByText(/Telegram-origin reversals \/ cancellations/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open Automations' })).toHaveAttribute(
      'href',
      '/work/intake',
    );
  });
});
