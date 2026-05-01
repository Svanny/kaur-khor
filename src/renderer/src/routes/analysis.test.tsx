import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { AnalysisRoute } from './analysis';

const inventoryHook = vi.fn();
const listSenaObservationPage = vi.fn(async () => ({
  latestObservedAt: '2026-04-02T00:00:00.000Z',
  nextCursor: null,
  observations: [],
  totalCount: 2,
}));

vi.mock('@/components/system/trading-chart', () => ({
  useTradingChartController: () => ({
    handleCustomTimeframeChange: vi.fn(),
    handleResetCharts: vi.fn(),
    olderLoadProgress: null,
    pendingCustomTimeframeRange: null,
    pendingTimeframe: null,
    settlePendingTimeframe: vi.fn(),
    timeframe: 'Recent',
    timeframeBoundaryOverride: null,
    timeframeCacheKey: 'Recent',
  }),
}));

vi.mock('@/lib/benchmark-route-ready', () => ({
  useBenchmarkRouteReady: vi.fn(),
}));

vi.mock('@/state/inventory', () => ({
  useInventory: () => inventoryHook(),
}));

vi.mock('@/state/preferences', () => ({
  usePreferences: () => ({
    currency: 'USD',
    language: 'en',
    showAnalysisPage: true,
    showRightRailCards: false,
    t: (key: string) => key,
  }),
}));

vi.mock('./performance/use-sena-detail-hydration', () => ({
  useSenaDetailHydration: () => ({
    hasOlderIntervals: false,
    isHydratingDetails: false,
    isLoadingOlderIntervals: false,
    loadOlderIntervals: vi.fn(async () => 0),
    resetHydratedDetails: vi.fn(async () => {}),
    resolvedTimeframeCacheKey: 'Recent',
    serviceDetailsById: {},
    skuDetailsById: { 'sku-1': null },
    timeframeHydrationProgress: null,
  }),
}));

vi.mock('./performance/analysis-content', () => ({
  AnalysisContent: () => <div>Analysis content</div>,
}));

describe('AnalysisRoute', () => {
  beforeEach(() => {
    listSenaObservationPage.mockClear();
    inventoryHook.mockReturnValue({
      catalog: {
        schemaVersion: 1,
        bundles: [],
        services: [],
        sharingMask: [],
        skus: [
          {
            archived: false,
            costPerUnit: 4,
            description: 'SKU',
            leadTimeMeanDaysHint: 5,
            leadTimeStdDaysHint: 1,
            name: 'SKU 1',
            productPrice: 9,
            skuId: 'sku-1',
            soldAsProduct: true,
          },
        ],
      },
      diagnostics: null,
      isLoading: false,
      latestRun: {
        observationCount: 2,
        runId: 'run-1',
      },
      listSenaObservationPage,
      observationFingerprint: {
        count: 2,
        latestObservedAt: '2026-04-02T00:00:00.000Z',
        latestObservationId: 'obs-2',
      },
      observations: [],
      workspaceSummary: {
        highRiskSkuIds: [],
        intervalCount: 2,
        latestObservedAt: '2026-04-02T00:00:00.000Z',
        ownerSub: 'desktop-owner',
        pendingReorderCount: 0,
        runId: 'run-1',
        serviceCount: 0,
        skuCount: 1,
        skuSummaries: [],
        topRegime: 'normal',
      },
    });
  });

  test('hydrates a bounded observation page after metadata-only startup', async () => {
    render(
      <MemoryRouter initialEntries={['/insights/explain']}>
        <AnalysisRoute />
      </MemoryRouter>,
    );

    expect(await screen.findByText('Analysis content')).toBeInTheDocument();
    await waitFor(() => {
      expect(listSenaObservationPage).toHaveBeenCalledWith({ limit: 20 });
    });
  });
});
