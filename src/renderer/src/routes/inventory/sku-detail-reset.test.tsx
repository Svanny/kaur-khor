import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, test, vi } from 'vitest';
import { SkuDetailRoute } from '../inventory/sku-detail';

const inventoryHook = vi.fn();
const resetHydratedDetailsMock = vi.fn(async () => {});

vi.mock('@/state/inventory', () => ({
  useInventory: () => inventoryHook(),
}));

vi.mock('@/state/preferences', () => ({
  usePreferences: () => ({
    currency: 'USD',
    language: 'en',
    showRightRailCards: true,
    t: (key: string) => key,
  }),
}));

vi.mock('./sku-detail/hero', () => ({
  SkuDetailHero: () => <div>Hero</div>,
}));

vi.mock('./sku-detail/actions', () => ({
  SkuDetailActions: () => null,
}));

vi.mock('./sku-detail/evidence', () => ({
  SkuDetailEvidence: () => null,
}));

vi.mock('./sku-detail/exposure', () => ({
  SkuDetailExposure: () => null,
}));

vi.mock('./sku-detail/right-rail', () => ({
  SkuDetailRightRail: () => null,
}));

vi.mock('./sku-detail/view-model', () => ({
  deriveSenaSkuDetailViewModel: () => ({
    actionContext: {},
    dependencyImpact: [],
    evidence: [],
    identity: { title: 'SKU 1' },
  }),
}));

vi.mock('./sku-detail/bootstrap', () => ({
  buildSkuDetailBootstrapPreview: vi.fn(() => ({
    snapshot: {
      skus: [
        {
          skuId: 'sku-1',
          name: 'SKU 1',
          description: 'Cotton tee',
          unitsInStock: 10,
          costPerUnit: 4,
          soldAsProduct: true,
          productPrice: 9,
          leadTimeMeanDays: 5,
          leadTimeStdDays: 1,
        },
      ],
      services: [],
      ranking: [],
      sist: null,
    },
    detail: null,
    detailPage: null,
    diagnostics: null,
    observations: [],
    linkedServiceDetails: [],
    uiState: 'ready',
    workspaceSummary: {
      ownerSub: 'desktop-owner',
      runId: 'run-1',
      latestObservedAt: '2026-04-02T00:00:00Z',
      skuCount: 1,
      serviceCount: 0,
      intervalCount: 0,
      pendingReorderCount: 0,
      topRegime: 'normal',
      highRiskSkuIds: [],
      skuSummaries: [],
    },
  })),
  bootstrapSkuDetail: vi.fn(async () => ({
    snapshot: {
      skus: [
        {
          skuId: 'sku-1',
          name: 'SKU 1',
          description: 'Cotton tee',
          unitsInStock: 10,
          costPerUnit: 4,
          soldAsProduct: true,
          productPrice: 9,
          leadTimeMeanDays: 5,
          leadTimeStdDays: 1,
        },
      ],
      services: [],
      ranking: [],
      sist: null,
    },
    detail: null,
    detailPage: {
      detail: {
        summary: {
          skuId: 'sku-1',
          latestPosteriorUnits: 9,
          credibleIntervalLow: 7,
          credibleIntervalHigh: 11,
          demandPerDayMean: 2,
          stockoutRisk: 0.4,
          daysOfCover: 4,
          expectedLeadTimeDemand: 8,
          safetyStock: 3,
          reorderPoint: 7,
          reorderTriggerProbability: 0.55,
          leadTimeMeanDays: 5,
          leadTimeStdDays: 1,
          regimeProbabilities: { normal: 1 },
        },
        inventoryPosterior: [],
        demandPosterior: [],
        pipelinePosterior: [],
        leadTimePosterior: [],
      },
      hasOlder: false,
      latestIntervalIndex: 0,
      nextBeforeIntervalIndex: null,
      pageLimit: 20,
    },
    diagnostics: null,
    observations: [],
    linkedServiceDetails: [],
    uiState: 'ready',
    workspaceSummary: {
      ownerSub: 'desktop-owner',
      runId: 'run-1',
      latestObservedAt: '2026-04-02T00:00:00Z',
      skuCount: 1,
      serviceCount: 0,
      intervalCount: 0,
      pendingReorderCount: 0,
      topRegime: 'normal',
      highRiskSkuIds: [],
      skuSummaries: [],
    },
  })),
}));

vi.mock('@/components/system/timeframed-interval-history', () => ({
  useTimeframedIntervalHistory: () => ({
    detail: {
      summary: {
        skuId: 'sku-1',
        latestPosteriorUnits: 9,
        credibleIntervalLow: 7,
        credibleIntervalHigh: 11,
        demandPerDayMean: 2,
        stockoutRisk: 0.4,
        daysOfCover: 4,
        expectedLeadTimeDemand: 8,
        safetyStock: 3,
        reorderPoint: 7,
        reorderTriggerProbability: 0.55,
        leadTimeMeanDays: 5,
        leadTimeStdDays: 1,
        regimeProbabilities: { normal: 1 },
      },
      inventoryPosterior: [],
      demandPosterior: [],
      pipelinePosterior: [],
      leadTimePosterior: [],
    },
    isHydratingDetails: false,
    hasOlder: false,
    isLoadingOlder: false,
    loadOlder: vi.fn(async () => null),
    resolvedTimeframe: 'Recent',
    resetHydratedDetails: resetHydratedDetailsMock,
    timeframeHydrationProgress: null,
  }),
}));

vi.mock('./sku-detail/ledger', () => ({
  SkuDetailLedger: (props: Record<string, unknown>) => (
    <div>
      <div data-testid="chart-zoom-reset-token">{String(props.chartZoomResetToken)}</div>
      <button type="button" onClick={() => void (props.onResetCharts as () => Promise<void> | void)()}>
        Reset charts
      </button>
    </div>
  ),
}));

describe('SkuDetailRoute reset wiring', () => {
  test('increments the chart zoom reset token after resetting hydrated details', async () => {
    const user = userEvent.setup();
    inventoryHook.mockReturnValue({
      isLoading: false,
      clearSenaSkuDetailCache: vi.fn(async () => {}),
      loadSenaSkuDetail: vi.fn(async () => null),
    });

    render(
      <MemoryRouter initialEntries={['/catalog/skus/sku-1']}>
        <Routes>
          <Route path="/catalog/skus/:skuId" element={<SkuDetailRoute />} />
        </Routes>
      </MemoryRouter>,
    );

    await waitFor(() => expect(screen.getByTestId('chart-zoom-reset-token')).toHaveTextContent('0'));

    await user.click(screen.getByRole('button', { name: 'Reset charts' }));

    await waitFor(() => expect(resetHydratedDetailsMock).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getByTestId('chart-zoom-reset-token')).toHaveTextContent('1'));
  });
});
