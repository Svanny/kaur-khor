import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import type { SenaSkuDetail } from '@shared/sena';
import { DescriptionTextVisibilityProvider } from '@/components/system/description-text';
import { rowHoverClassName } from '@/lib/interactive-surface';
import { DashboardRoute } from './dashboard';

const inventoryHook = vi.fn();
const preferenceState = {
  currency: 'USD',
  language: 'en',
  showExplanatoryTooltips: true,
  showFloatingTitleActions: true,
  showRightRailCards: true,
};

vi.mock('../state/inventory', () => ({
  useInventory: () => inventoryHook(),
}));

vi.mock('../state/preferences', () => ({
  usePreferences: () => ({
    currency: preferenceState.currency,
    language: preferenceState.language,
    showExplanatoryTooltips: preferenceState.showExplanatoryTooltips,
    showFloatingTitleActions: preferenceState.showFloatingTitleActions,
    showRightRailCards: preferenceState.showRightRailCards,
    t: (key: string) => {
      if (key === 'searchPlaceholder') {
        return 'Search name, description, or id…';
      }
      if (key === 'searchItems') {
        return 'Search and segment';
      }
      if (key === 'filterAll') {
        return 'Everything';
      }
      if (key === 'filterSku') {
        return 'SKUs';
      }
      if (key === 'filterService') {
        return 'Services';
      }
      return key;
    },
  }),
}));

const sampleCatalog = {
  schemaVersion: 1,
  skus: [
    {
      skuId: 'sku-1',
      name: 'Razor refill',
      description: 'Refill pack',
      costPerUnit: 4,
      soldAsProduct: true,
      productPrice: 9,
      leadTimeMeanDaysHint: 5,
      leadTimeStdDaysHint: 1,
    },
    {
      skuId: 'sku-2',
      name: 'Hair dye black',
      description: 'Color refresh',
      costPerUnit: 6,
      soldAsProduct: true,
      productPrice: 14,
      leadTimeMeanDaysHint: 7,
      leadTimeStdDaysHint: 2,
    },
  {
    skuId: 'sku-3',
    name: 'Styling gel',
    description: 'Styling support',
      costPerUnit: 3,
      soldAsProduct: true,
      productPrice: 8,
      leadTimeMeanDaysHint: 4,
      leadTimeStdDaysHint: 1,
    },
    {
      skuId: 'sku-4',
      name: 'Cotton pads',
      description: 'Retail only',
      costPerUnit: 2,
      soldAsProduct: true,
      productPrice: 5,
      leadTimeMeanDaysHint: 3,
      leadTimeStdDaysHint: 1,
    },
  ],
  services: [
    {
      serviceId: 'service-1',
      name: 'Haircut',
      description: '',
      price: 12,
      bundle: false,
    },
    {
      serviceId: 'service-2',
      name: 'Coloring',
      description: '',
      price: 30,
      bundle: false,
    },
  ],
  bundles: [],
  sharingMask: [
    { serviceId: 'service-1', skuId: 'sku-1', enabled: true, usageProbability: 1 },
    { serviceId: 'service-2', skuId: 'sku-2', enabled: true, usageProbability: 1 },
    { serviceId: 'service-2', skuId: 'sku-3', enabled: true, usageProbability: 1 },
  ],
};

const sampleWorkspaceSummary = {
  ownerSub: 'desktop-owner',
  runId: 'run-1',
  latestObservedAt: '2026-04-03T08:00:00.000Z',
  skuCount: 4,
  serviceCount: 2,
  intervalCount: 4,
  pendingReorderCount: 2,
  topRegime: 'normal',
  highRiskSkuIds: ['sku-1', 'sku-4'],
  skuSummaries: [
    {
      skuId: 'sku-1',
      latestPosteriorUnits: 12,
      credibleIntervalLow: 8,
      credibleIntervalHigh: 14,
      demandPerDayMean: 4,
      stockoutRisk: 0.81,
      daysOfCover: 1.9,
      expectedLeadTimeDemand: 10,
      safetyStock: 5,
      reorderPoint: 18,
      reorderTriggerProbability: 0.67,
      leadTimeMeanDays: 5,
      leadTimeStdDays: 1,
      regimeProbabilities: { normal: 1 },
    },
    {
      skuId: 'sku-2',
      latestPosteriorUnits: 19,
      credibleIntervalLow: 15,
      credibleIntervalHigh: 22,
      demandPerDayMean: 2,
      stockoutRisk: 0.28,
      daysOfCover: 6.4,
      expectedLeadTimeDemand: 8,
      safetyStock: 3,
      reorderPoint: 12,
      reorderTriggerProbability: 0.2,
      leadTimeMeanDays: 7,
      leadTimeStdDays: 2,
      regimeProbabilities: { promo: 0.7, normal: 0.3 },
    },
    {
      skuId: 'sku-3',
      latestPosteriorUnits: 15,
      credibleIntervalLow: 12,
      credibleIntervalHigh: 18,
      demandPerDayMean: 1,
      stockoutRisk: 0.31,
      daysOfCover: 7,
      expectedLeadTimeDemand: 5,
      safetyStock: 2,
      reorderPoint: 11,
      reorderTriggerProbability: 0.22,
      leadTimeMeanDays: 4,
      leadTimeStdDays: 1,
      regimeProbabilities: { normal: 1 },
    },
    {
      skuId: 'sku-4',
      latestPosteriorUnits: 6,
      credibleIntervalLow: 4,
      credibleIntervalHigh: 7,
      demandPerDayMean: 3,
      stockoutRisk: 0.74,
      daysOfCover: 1.8,
      expectedLeadTimeDemand: 9,
      safetyStock: 3,
      reorderPoint: 11,
      reorderTriggerProbability: 0.64,
      leadTimeMeanDays: 3,
      leadTimeStdDays: 1,
      regimeProbabilities: { normal: 1 },
    },
  ],
};

const sampleObservations = [
  {
    observationId: 'obs-order',
    ownerSub: 'desktop-owner',
    input: {
      observedAt: '2026-04-01T09:00:00.000Z',
      stockSnapshot: [],
      serviceRankings: [],
      retailRankings: [],
      serviceStockouts: [],
      retailStockouts: [],
      orderSignals: [
        {
          skuId: 'sku-2',
          orderPlaced: true,
          receiptArrived: false,
          approximateOrderQuantity: 18,
          approximateReceiptQuantity: null,
        },
      ],
      servicePrices: [],
      retailPrices: [],
      leadTimeHints: [],
      notes: null,
    },
  },
  {
    observationId: 'obs-ready',
    ownerSub: 'desktop-owner',
    input: {
      observedAt: '2026-03-30T09:00:00.000Z',
      stockSnapshot: [],
      serviceRankings: [],
      retailRankings: [],
      serviceStockouts: [],
      retailStockouts: [],
      orderSignals: [
        {
          skuId: 'sku-3',
          orderPlaced: true,
          receiptArrived: false,
          approximateOrderQuantity: 24,
          approximateReceiptQuantity: null,
        },
      ],
      servicePrices: [],
      retailPrices: [],
      leadTimeHints: [],
      notes: null,
    },
  },
];

const detailBySkuId: Record<string, SenaSkuDetail> = {
  'sku-1': {
    summary: sampleWorkspaceSummary.skuSummaries[0],
    inventoryPosterior: [],
    demandPosterior: [],
    pipelinePosterior: [],
    leadTimePosterior: [],
  },
  'sku-2': {
    summary: sampleWorkspaceSummary.skuSummaries[1],
    inventoryPosterior: [],
    demandPosterior: [],
    pipelinePosterior: [
      {
        intervalIndex: 2,
        inTransitMean: 18,
        orderProbability: 0.9,
        orderQuantityMean: 18,
        receiptQuantityMean: 0,
        ageDaysMean: 2,
      },
    ],
    leadTimePosterior: [
      {
        intervalIndex: 2,
        logMeanDays: 0,
        logStdDays: 0,
        meanDays: 7,
        stdDays: 2,
        observedVariabilityClass: 'wide',
        observedRelativeWidth: 0.6,
      },
    ],
  },
  'sku-3': {
    summary: sampleWorkspaceSummary.skuSummaries[2],
    inventoryPosterior: [],
    demandPosterior: [],
    pipelinePosterior: [
      {
        intervalIndex: 2,
        inTransitMean: 24,
        orderProbability: 0.92,
        orderQuantityMean: 24,
        receiptQuantityMean: 24,
        ageDaysMean: 4,
      },
    ],
    leadTimePosterior: [
      {
        intervalIndex: 2,
        logMeanDays: 0,
        logStdDays: 0,
        meanDays: 4,
        stdDays: 1,
        observedVariabilityClass: 'tight',
        observedRelativeWidth: 0.25,
      },
    ],
  },
  'sku-4': {
    summary: sampleWorkspaceSummary.skuSummaries[3],
    inventoryPosterior: [],
    demandPosterior: [],
    pipelinePosterior: [],
    leadTimePosterior: [],
  },
};

function renderRoute() {
  return render(
    <MemoryRouter>
      <DashboardRoute />
    </MemoryRouter>,
  );
}

function renderRouteWithOptionalHelp(visible: boolean) {
  return render(
    <DescriptionTextVisibilityProvider visible={visible}>
      <MemoryRouter>
        <DashboardRoute />
      </MemoryRouter>
    </DescriptionTextVisibilityProvider>,
  );
}

describe('DashboardRoute', () => {
  beforeEach(() => {
    preferenceState.showRightRailCards = true;
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date('2026-04-03T12:00:00.000Z'));
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
      bottom: 120,
      height: 120,
      left: 0,
      right: 800,
      top: 0,
      width: 800,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    } as DOMRect);

    inventoryHook.mockReturnValue({
      catalog: sampleCatalog,
      observations: sampleObservations,
      workspaceSummary: sampleWorkspaceSummary,
      loadSenaSkuDetail: vi.fn(async (skuId: string) => detailBySkuId[skuId] ?? null),
      submitLegacyReport: vi.fn(async (payload) => payload),
      ingestSenaObservation: vi.fn(async (payload) => payload),
      triggerSenaRun: vi.fn(async () => ({ runId: 'run-2' })),
      isSaving: false,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  test('renders the SENA task queue and lets the user filter it', async () => {
    const user = userEvent.setup();
    const { container } = renderRoute();

    expect(screen.getByText('Overview')).toBeInTheDocument();
    expect(screen.getByText('Mission Control')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Search name, description, or id…')).toBeInTheDocument();
    const scopeToggle = screen.getByRole('group', { name: 'Search and segment' });
    expect(within(scopeToggle).getByRole('radio', { name: 'All' })).toBeInTheDocument();
    expect(within(scopeToggle).getByRole('radio', { name: 'SKUs' })).toBeInTheDocument();
    expect(within(scopeToggle).getByRole('radio', { name: 'Services' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'Task queue' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Awaiting receipt' }).querySelector('.lucide-clipboard-clock')).not.toBeNull();
    expect(screen.getAllByRole('button', { name: 'Log order' }).length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: 'Update ETA' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Update ETA' }).querySelector('.lucide-calendar-clock')).not.toBeNull();
    expect(screen.getByRole('button', { name: 'Receive' })).toBeInTheDocument();
    expect(screen.getByText('Cotton pads')).toBeInTheDocument();
    await waitFor(() => {
      expect(container.querySelector('[data-slot="overview-task-row"]')).not.toBeNull();
    });
    expect(container.querySelector('[data-slot="overview-task-row"]')?.className).toContain(rowHoverClassName);
    expect(container.querySelector('[data-slot="overview-rail-row"]')?.className).toContain(rowHoverClassName);

    await user.click(screen.getByRole('tab', { name: 'Ready to receive' }));

    await waitFor(() => {
      expect(screen.queryAllByRole('button', { name: 'Log order' })).toHaveLength(0);
      expect(screen.queryAllByRole('button', { name: 'Update ETA' })).toHaveLength(0);
      expect(screen.getByRole('button', { name: 'Receive' })).toBeInTheDocument();
    });
  });

  test('filters overview tasks by services even without a search query', async () => {
    renderRoute();

    expect(screen.getByText('Cotton pads')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('radio', { name: 'Services' }));

    expect(screen.queryByText('Cotton pads')).not.toBeInTheDocument();
    expect(screen.getByText('Razor refill')).toBeInTheDocument();
    expect(screen.getAllByText('Hair dye black').length).toBeGreaterThan(0);
  });

  test('scopes the overview search by services from the title card control', async () => {
    renderRoute();

    fireEvent.click(screen.getByRole('radio', { name: 'Services' }));
    fireEvent.change(screen.getByPlaceholderText('Search name, description, or id…'), {
      target: { value: 'Haircut' },
    });

    await waitFor(() => {
      expect(screen.getByText('Razor refill')).toBeInTheDocument();
    });

    expect(screen.getByRole('button', { name: 'Log order' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Update ETA' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Receive' })).not.toBeInTheDocument();
  });

  test('submits a received-goods inventory update from the drawer', async () => {
    const submitLegacyReport = vi.fn(async (payload) => payload);
    const ingestSenaObservation = vi.fn(async (payload) => payload);
    const triggerSenaRun = vi.fn(async () => ({ runId: 'run-2' }));

    inventoryHook.mockReturnValue({
      catalog: sampleCatalog,
      observations: sampleObservations,
      workspaceSummary: sampleWorkspaceSummary,
      loadSenaSkuDetail: vi.fn(async (skuId: string) => detailBySkuId[skuId] ?? null),
      submitLegacyReport,
      ingestSenaObservation,
      triggerSenaRun,
      isSaving: false,
    });

    renderRoute();

    fireEvent.click(screen.getByRole('button', { name: 'Receive' }));

    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 2, name: 'What Happened In Real Life' })).toBeInTheDocument();
    });

    expect(screen.getByRole('radio', { name: /Goods received/i }).className).toContain('data-[state=on]:shadow-none');
    expect(document.querySelector('[data-band-id="real_life"] .lucide-scroll-text')).not.toBeNull();
    expect(document.querySelector('[data-band-id="timing"] .lucide-timer-reset')).not.toBeNull();
    expect(document.querySelector('[data-band-id="next_steps"] .lucide-bot')).not.toBeNull();

    fireEvent.change(screen.getByLabelText('Received quantity'), { target: { value: '24' } });
    fireEvent.click(screen.getByRole('button', { name: 'Confirm inventory update' }));

    await waitFor(() => {
      expect(submitLegacyReport).toHaveBeenCalledTimes(1);
    });

    expect(submitLegacyReport.mock.calls[0]?.[0]).toMatchObject({
      skuObservations: [
        expect.objectContaining({
          skuId: 'sku-3',
          unitsInStock: 39,
          restockIncluded: true,
        }),
      ],
    });
    expect(submitLegacyReport.mock.calls[0]?.[0].reportedAt).toContain('2026-04-03');
    expect(ingestSenaObservation).toHaveBeenCalledTimes(1);
    expect(triggerSenaRun).toHaveBeenCalledTimes(1);
  });

  test('hides the overview right rail when the global toggle is off', async () => {
    preferenceState.showRightRailCards = false;

    renderRoute();

    expect(await screen.findByRole('heading', { level: 2, name: 'Task queue' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { level: 2, name: 'Today' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { level: 2, name: 'In transit' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { level: 2, name: 'Recent receipts' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { level: 2, name: 'SENA signals' })).not.toBeInTheDocument();
  });

  test('hides overview descriptors and empty-state hints when optional help is disabled', async () => {
    inventoryHook.mockReturnValue({
      catalog: null,
      observations: [],
      workspaceSummary: null,
      loadSenaSkuDetail: vi.fn(),
      submitLegacyReport: vi.fn(),
      ingestSenaObservation: vi.fn(),
      triggerSenaRun: vi.fn(),
      isSaving: false,
    });

    renderRouteWithOptionalHelp(false);

    expect(await screen.findByText('Overview needs the catalog first')).toBeInTheDocument();
    expect(screen.queryByText('Create the first SKU so Banji can build an action list from real stock work.')).not.toBeInTheDocument();
  });
});
