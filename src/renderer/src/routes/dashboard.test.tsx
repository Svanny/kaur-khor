import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import type { SenaSkuDetail } from '@shared/sena';
import { DashboardRoute } from './dashboard';

const inventoryHook = vi.fn();

vi.mock('../state/inventory', () => ({
  useInventory: () => inventoryHook(),
}));

vi.mock('../state/preferences', () => ({
  usePreferences: () => ({
    currency: 'USD',
    language: 'en',
    showExplanatoryTooltips: true,
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
  skuCount: 3,
  serviceCount: 2,
  intervalCount: 3,
  pendingReorderCount: 1,
  topRegime: 'normal',
  highRiskSkuIds: ['sku-1'],
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
};

function renderRoute() {
  return render(
    <MemoryRouter>
      <DashboardRoute />
    </MemoryRouter>,
  );
}

describe('DashboardRoute', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date('2026-04-03T12:00:00.000Z'));

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
  });

  test('renders the SENA task queue and lets the user filter it', async () => {
    renderRoute();

    expect(screen.getByRole('heading', { level: 1, name: 'Overview' })).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Search name, description, or id…')).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Everything' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'SKUs' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Services' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'Task queue' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Log order' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Update ETA' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Receive' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('radio', { name: 'Ready to receive' }));

    expect(screen.queryByRole('button', { name: 'Log order' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Update ETA' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Receive' })).toBeInTheDocument();
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
});
