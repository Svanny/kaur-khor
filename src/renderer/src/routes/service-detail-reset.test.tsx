import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { ServiceDetailRoute } from './service-detail';

const inventoryHook = vi.fn();
const ledgerPropsSpy = vi.fn();
const resetHydratedDetailsMock = vi.fn(async () => {});

vi.mock('@/state/inventory', () => ({
  useInventory: () => inventoryHook(),
}));

vi.mock('@/state/preferences', () => ({
  usePreferences: () => ({
    currency: 'USD',
    language: 'en',
    showRightRailCards: true,
  }),
}));

vi.mock('./service-detail/hero', () => ({
  ServiceDetailHero: () => <div>Hero</div>,
}));

vi.mock('./service-detail/actions', () => ({
  ServiceDetailActions: () => null,
}));

vi.mock('./service-detail/right-rail', () => ({
  ServiceDetailRightRail: () => null,
}));

vi.mock('./service-detail/dependency-impact', () => ({
  ServiceDependencyImpact: () => null,
}));

vi.mock('./service-detail/evidence', () => ({
  ServiceEvidenceTimeline: () => null,
}));

vi.mock('./service-detail/view-model', () => ({
  deriveServiceDetailViewModel: () => ({
    actions: [],
    dependencyImpact: [],
    evidence: [],
  }),
}));

vi.mock('@/components/system/timeframed-interval-history', () => ({
  useTimeframedIntervalHistory: () => ({
    detail: {
      serviceId: 'service-1',
      activityMean: 3,
      activityIntervalLow: 2,
      activityIntervalHigh: 4,
      contributors: [],
      bottleneckProbability: 0.2,
      regimeTimeline: [],
    },
    hasOlder: false,
    isHydratingDetails: false,
    isLoadingOlder: false,
    loadOlder: vi.fn(async () => null),
    page: null,
    resolvedTimeframe: 'Recent',
    resetHydratedDetails: resetHydratedDetailsMock,
    timeframeHydrationProgress: null,
  }),
}));

vi.mock('./service-detail/trading-chart-ledger', () => ({
  ServiceTradingChartLedger: (props: Record<string, unknown>) => {
    ledgerPropsSpy(props);
    return (
      <div>
        <div data-testid="chart-zoom-reset-token">{String(props.chartZoomResetToken)}</div>
        <button type="button" onClick={() => void (props.onResetCharts as () => Promise<void> | void)()}>
          Reset charts
        </button>
      </div>
    );
  },
}));

describe('ServiceDetailRoute reset wiring', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.scrollTo = vi.fn();
  });

  test('increments the chart zoom reset token after resetting hydrated details', async () => {
    const user = userEvent.setup();
    inventoryHook.mockReturnValue({
      catalog: {
        schemaVersion: 1,
        skus: [],
        services: [{ serviceId: 'service-1', name: 'Service 1', description: 'Service', price: 15 }],
        bundles: [],
        sharingMask: [],
      },
      clearSenaServiceDetailCache: vi.fn(async () => {}),
      listStockReports: vi.fn(async () => []),
      loadInventorySnapshot: vi.fn(async () => ({
        skus: [],
        services: [{ serviceId: 'service-1', name: 'Service 1', description: 'Service', price: 15, skuIds: [] }],
        ranking: [],
        sist: null,
      })),
      loadSenaServiceDetail: vi.fn(async () => ({
        serviceId: 'service-1',
        activityMean: 3,
        activityIntervalLow: 2,
        activityIntervalHigh: 4,
        contributors: [],
        bottleneckProbability: 0.2,
        regimeTimeline: [],
      })),
      observations: [],
      reports: [],
      snapshot: {
        skus: [],
        services: [{ serviceId: 'service-1', name: 'Service 1', description: 'Service', price: 15, skuIds: [] }],
        ranking: [],
        sist: null,
      },
      workspaceSummary: {
        ownerSub: 'desktop-owner',
        runId: 'run-1',
        latestObservedAt: '2026-04-02T00:00:00Z',
        skuCount: 0,
        serviceCount: 1,
        intervalCount: 0,
        pendingReorderCount: 0,
        topRegime: 'normal',
        highRiskSkuIds: [],
        skuSummaries: [],
      },
    });

    render(
      <MemoryRouter initialEntries={['/catalog/services/service-1']}>
        <Routes>
          <Route path="/catalog/services/:serviceId" element={<ServiceDetailRoute />} />
        </Routes>
      </MemoryRouter>,
    );

    await waitFor(() => expect(screen.getByTestId('chart-zoom-reset-token')).toHaveTextContent('0'));

    await user.click(screen.getByRole('button', { name: 'Reset charts' }));

    await waitFor(() => expect(resetHydratedDetailsMock).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getByTestId('chart-zoom-reset-token')).toHaveTextContent('1'));
  });

  test('scrolls the workspace viewport to the top when entering a service detail page', async () => {
    inventoryHook.mockReturnValue({
      catalog: {
        schemaVersion: 1,
        skus: [],
        services: [{ serviceId: 'service-1', name: 'Service 1', description: 'Service', price: 15 }],
        bundles: [],
        sharingMask: [],
      },
      clearSenaServiceDetailCache: vi.fn(async () => {}),
      listStockReports: vi.fn(async () => []),
      loadInventorySnapshot: vi.fn(async () => ({
        skus: [],
        services: [{ serviceId: 'service-1', name: 'Service 1', description: 'Service', price: 15, skuIds: [] }],
        ranking: [],
        sist: null,
      })),
      loadSenaServiceDetail: vi.fn(async () => ({
        serviceId: 'service-1',
        activityMean: 3,
        activityIntervalLow: 2,
        activityIntervalHigh: 4,
        contributors: [],
        bottleneckProbability: 0.2,
        regimeTimeline: [],
      })),
      observations: [],
      reports: [],
      snapshot: {
        skus: [],
        services: [{ serviceId: 'service-1', name: 'Service 1', description: 'Service', price: 15, skuIds: [] }],
        ranking: [],
        sist: null,
      },
      workspaceSummary: {
        ownerSub: 'desktop-owner',
        runId: 'run-1',
        latestObservedAt: '2026-04-02T00:00:00Z',
        skuCount: 0,
        serviceCount: 1,
        intervalCount: 0,
        pendingReorderCount: 0,
        topRegime: 'normal',
        highRiskSkuIds: [],
        skuSummaries: [],
      },
    });

    render(
      <MemoryRouter initialEntries={['/catalog/services/service-1']}>
        <Routes>
          <Route path="/catalog/services/:serviceId" element={<ServiceDetailRoute />} />
        </Routes>
      </MemoryRouter>,
    );

    await waitFor(() =>
      expect(window.scrollTo).toHaveBeenCalledWith({ top: 0, left: 0, behavior: 'auto' }),
    );
  });

  test('renders service detail from SENA data without waiting for the legacy snapshot bridge', async () => {
    inventoryHook.mockReturnValue({
      catalog: {
        schemaVersion: 1,
        skus: [],
        services: [{ serviceId: 'service-1', name: 'Service 1', description: 'Service', price: 15 }],
        bundles: [],
        sharingMask: [],
      },
      clearSenaServiceDetailCache: vi.fn(async () => {}),
      listStockReports: vi.fn(async () => []),
      loadInventorySnapshot: vi.fn(() => new Promise(() => {})),
      loadSenaServiceDetail: vi.fn(async () => ({
        serviceId: 'service-1',
        activityMean: 3,
        activityIntervalLow: 2,
        activityIntervalHigh: 4,
        contributors: [],
        bottleneckProbability: 0.2,
        regimeTimeline: [],
      })),
      observations: [],
      reports: [],
      snapshot: null,
      workspaceSummary: {
        ownerSub: 'desktop-owner',
        runId: 'run-1',
        latestObservedAt: '2026-04-02T00:00:00Z',
        skuCount: 0,
        serviceCount: 1,
        intervalCount: 0,
        pendingReorderCount: 0,
        topRegime: 'normal',
        highRiskSkuIds: [],
        skuSummaries: [],
      },
    });

    render(
      <MemoryRouter initialEntries={['/catalog/services/service-1']}>
        <Routes>
          <Route path="/catalog/services/:serviceId" element={<ServiceDetailRoute />} />
        </Routes>
      </MemoryRouter>,
    );

    await waitFor(() => expect(screen.getByText('Hero')).toBeInTheDocument());
    expect(screen.queryByText('Preparing details')).not.toBeInTheDocument();
  });
});
