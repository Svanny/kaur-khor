import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeAll, describe, expect, test, vi } from 'vitest';
import type { SenaCatalog, SenaDiagnostics, SenaObservationRecord, SenaServiceDetail, SenaSkuDetail, SenaWorkspaceSummary } from '@shared/sena';
import { AnalysisWorkbench } from './analysis-workbench';
import { deriveAnalysisViewModel } from './analysis-view-model';

vi.mock('@/state/preferences', () => ({
  usePreferences: () => ({
    currency: 'USD',
    language: 'en',
    showRightRailCards: false,
    t: (value: string) => value,
  }),
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
});
