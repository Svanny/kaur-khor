import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { DescriptionTextVisibilityProvider } from '@/components/system/description-text';
import { PerformanceRoute } from './performance';

const inventoryHook = vi.fn();
const preferenceState = {
  currency: 'USD',
  language: 'en',
  showRightRailCards: true,
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

describe('PerformanceRoute', () => {
  beforeEach(() => {
    preferenceState.showRightRailCards = true;
    inventoryHook.mockReturnValue({
      catalog,
      diagnostics: {
        changePointProbability: 0.22,
        coverageEstimate: 0.89,
        effectiveSampleSizeMean: 84,
        posteriorPredictiveErrorMean: 0.18,
        regimeHistory: [],
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
              demandPosterior: [],
              inventoryPosterior: [],
              leadTimePosterior: [],
              pipelinePosterior: [
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
              demandPosterior: [],
              inventoryPosterior: [],
              leadTimePosterior: [],
              pipelinePosterior: [],
              summary: workspaceSummary.skuSummaries[1],
            },
      ),
      observations: [
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
      ],
      workspaceSummary,
    });
  });

  function renderRoute() {
    return render(
      <MemoryRouter initialEntries={['/performance']}>
        <PerformanceRoute />
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
