import { render, screen, waitFor } from '@testing-library/react';
import { StrictMode } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { BanjiShell } from '@/components/banji-shell';
import { INTERVAL_PAGE_SIZE } from '@/components/system/interval-strip';
import { defaultChartLayoutPreferences, writeEntityChartLayoutPreferences } from '@/lib/chart-layout-preferences';
import { getTranslation } from '@/lib/translations';
import { NavigationHistoryProvider } from '@/state/navigation-history';
import { ServiceDetailRoute } from './service-detail';

const inventoryHook = vi.fn();
const markUnlockedNavItemSeen = vi.fn(async () => {});

vi.mock('@/state/inventory', () => ({
  useInventory: () => inventoryHook(),
  useInventoryActions: () => inventoryHook(),
  useInventoryState: () => inventoryHook(),
}));

vi.mock('@/state/preferences', () => ({
  usePreferences: () => ({
    applyDisplayViewMode: vi.fn(),
    currency: 'USD',
    displayViewMode: 'custom',
    isHydrated: true,
    language: 'en',
    markUnlockedNavItemSeen,
    seenUnlockedNavItems: {
      catalog: true,
      insights: true,
      work: true,
    },
    showAnalysisPage: true,
    showAutomationsPage: true,
    showExplanatoryTooltips: true,
    showFloatingTitleActions: true,
    showRightRailCards: true,
    t: (key: string, variables?: Record<string, string | number | null | undefined>) =>
      getTranslation('en', key as never, variables),
    usdToKhrExchangeRate: 4100,
  }),
}));

const sampleCatalog = {
  schemaVersion: 1,
  skus: [
    {
      costPerUnit: 4,
      description: 'Cotton tee',
      leadTimeMeanDaysHint: 5,
      leadTimeStdDaysHint: 1,
      name: 'SKU 1',
      productPrice: 9,
      skuId: 'sku-1',
      soldAsProduct: true,
    },
  ],
  services: [
    {
      bundle: false,
      description: 'Service',
      name: 'Service 1',
      price: 15,
      serviceId: 'service-1',
    },
  ],
  bundles: [],
  sharingMask: [{ enabled: true, serviceId: 'service-1', skuId: 'sku-1', usageProbability: null }],
};

function setDesktopViewport() {
  Object.defineProperty(window, 'innerWidth', {
    configurable: true,
    writable: true,
    value: 1440,
  });
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
}

describe('Service detail render loop regression', () => {
  beforeEach(() => {
    setDesktopViewport();
    markUnlockedNavItemSeen.mockClear();
    inventoryHook.mockReturnValue({
      catalog: sampleCatalog,
      error: null,
      isLoading: false,
      isPreparingWorkspace: false,
      isSaving: false,
      latestRun: null,
      observations: [],
      reports: [],
      snapshot: {
        skus: [
          {
            skuId: 'sku-1',
            name: 'SKU 1',
            description: 'Cotton tee',
            unitsInStock: 12,
            costPerUnit: 4,
            soldAsProduct: true,
            productPrice: 9,
            leadTimeMeanDays: 5,
            leadTimeStdDays: 1,
          },
        ],
        services: [
          {
            serviceId: 'service-1',
            name: 'Service 1',
            description: 'Service',
            price: 15,
            skuIds: ['sku-1'],
          },
        ],
        ranking: [],
        sist: {
          status: { state: 'ready', updatedAt: '2026-04-02T00:00:00Z', reportCount: 1, confidence: 'medium', reason: null },
          settings: { targetServiceLevel: 0.95, forecastHorizonDays: 14, particleCount: 512, smoothingWindowReports: 90 },
          asOf: '2026-04-02T00:00:00Z',
          topRegime: 'normal',
          pendingReorderCount: 1,
          highRiskSkuIds: ['sku-1'],
          skuInsights: [],
        },
      },
      workspaceSummary: {
        ownerSub: 'desktop-owner',
        runId: 'run-1',
        latestObservedAt: '2026-04-02T00:00:00Z',
        skuCount: 1,
        serviceCount: 1,
        intervalCount: 1,
        pendingReorderCount: 1,
        topRegime: 'normal',
        highRiskSkuIds: ['sku-1'],
        skuSummaries: [],
      },
      clearSenaServiceDetailCache: vi.fn(),
      listStockReports: vi.fn(async () => []),
      loadInventorySnapshot: vi.fn(async () => inventoryHook().snapshot),
      loadSenaServiceDetail: vi.fn(async () => ({
        serviceId: 'service-1',
        activityMean: 3,
        activityIntervalLow: 2,
        activityIntervalHigh: 4,
        bottleneckProbability: 0.3,
        contributors: [
          {
            skuId: 'sku-1',
            usageProbability: 0.85,
            bottleneckProbability: 0.3,
          },
        ],
        regimeTimeline: [
          {
            intervalIndex: 0,
            startAt: '2026-04-01T00:00:00Z',
            endAt: '2026-04-01T23:59:00Z',
            dominantRegime: 'normal',
            regimeProbabilities: { normal: 1 },
          },
        ],
      })),
      reload: vi.fn(),
    });
  });

  test('renders the full shell service detail without a maximum update depth loop', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    writeEntityChartLayoutPreferences('service', 'service-1', {
      ...defaultChartLayoutPreferences(),
      customTimeframeRange: {
        startAt: '2026-03-01T00:00:00.000Z',
        endAt: '2026-04-01T00:00:00.000Z',
      },
      visibleDateRange: null,
    });

    try {
      render(
        <StrictMode>
          <MemoryRouter initialEntries={['/catalog/services/service-1']}>
            <NavigationHistoryProvider>
              <BanjiShell>
                <Routes>
                  <Route element={<ServiceDetailRoute />} path="/catalog/services/:serviceId" />
                </Routes>
              </BanjiShell>
            </NavigationHistoryProvider>
          </MemoryRouter>
        </StrictMode>,
      );

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: /Ledger for Service 1/ })).toBeInTheDocument();
      });

      expect(inventoryHook().loadSenaServiceDetail).toHaveBeenCalledWith('service-1', expect.objectContaining({ limit: INTERVAL_PAGE_SIZE }));
      expect(consoleError).not.toHaveBeenCalledWith(expect.stringContaining('Maximum update depth exceeded'), expect.anything());
      expect(consoleError.mock.calls.flat().join('\n')).not.toContain('Maximum update depth exceeded');
    } finally {
      consoleError.mockRestore();
    }
  });

  test('does not restart service loading when inventory state references are recreated', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const loadSenaServiceDetail = vi.fn(async () => ({
      serviceId: 'service-1',
      activityMean: 3,
      activityIntervalLow: 2,
      activityIntervalHigh: 4,
      bottleneckProbability: 0.3,
      contributors: [
        {
          skuId: 'sku-1',
          usageProbability: 0.85,
          bottleneckProbability: 0.3,
        },
      ],
      regimeTimeline: [
        {
          intervalIndex: 0,
          startAt: '2026-04-01T00:00:00Z',
          endAt: '2026-04-01T23:59:00Z',
          dominantRegime: 'normal',
          regimeProbabilities: { normal: 1 },
        },
      ],
    }));
    const listStockReports = vi.fn(async () => []);
    const loadInventorySnapshot = vi.fn(async () => inventoryHook().snapshot);

    inventoryHook.mockImplementation(() => ({
      catalog: {
        ...sampleCatalog,
        skus: [...sampleCatalog.skus],
        services: [...sampleCatalog.services],
        sharingMask: [...sampleCatalog.sharingMask],
      },
      error: null,
      isLoading: false,
      isPreparingWorkspace: false,
      isSaving: false,
      latestRun: null,
      observations: [],
      reports: [],
      snapshot: {
        skus: [
          {
            skuId: 'sku-1',
            name: 'SKU 1',
            description: 'Cotton tee',
            unitsInStock: 12,
            costPerUnit: 4,
            soldAsProduct: true,
            productPrice: 9,
            leadTimeMeanDays: 5,
            leadTimeStdDays: 1,
          },
        ],
        services: [
          {
            serviceId: 'service-1',
            name: 'Service 1',
            description: 'Service',
            price: 15,
            skuIds: ['sku-1'],
          },
        ],
        ranking: [],
        sist: {
          status: { state: 'ready', updatedAt: '2026-04-02T00:00:00Z', reportCount: 1, confidence: 'medium', reason: null },
          settings: { targetServiceLevel: 0.95, forecastHorizonDays: 14, particleCount: 512, smoothingWindowReports: 90 },
          asOf: '2026-04-02T00:00:00Z',
          topRegime: 'normal',
          pendingReorderCount: 1,
          highRiskSkuIds: ['sku-1'],
          skuInsights: [],
        },
      },
      workspaceSummary: {
        ownerSub: 'desktop-owner',
        runId: 'run-1',
        latestObservedAt: '2026-04-02T00:00:00Z',
        skuCount: 1,
        serviceCount: 1,
        intervalCount: 1,
        pendingReorderCount: 1,
        topRegime: 'normal',
        highRiskSkuIds: ['sku-1'],
        skuSummaries: [],
      },
      clearSenaServiceDetailCache: vi.fn(),
      listStockReports,
      loadInventorySnapshot,
      loadSenaServiceDetail,
      reload: vi.fn(),
    }));

    try {
      render(
        <StrictMode>
          <MemoryRouter initialEntries={['/catalog/services/service-1']}>
            <NavigationHistoryProvider>
              <BanjiShell>
                <Routes>
                  <Route element={<ServiceDetailRoute />} path="/catalog/services/:serviceId" />
                </Routes>
              </BanjiShell>
            </NavigationHistoryProvider>
          </MemoryRouter>
        </StrictMode>,
      );

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: /Ledger for Service 1/ })).toBeInTheDocument();
      });
      await new Promise((resolve) => window.setTimeout(resolve, 50));

      expect(loadSenaServiceDetail.mock.calls.length).toBeLessThanOrEqual(4);
      expect(consoleError.mock.calls.flat().join('\n')).not.toContain('Maximum update depth exceeded');
    } finally {
      consoleError.mockRestore();
    }
  });
});
