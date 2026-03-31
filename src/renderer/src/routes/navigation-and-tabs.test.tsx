import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Link, MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import type { InventorySnapshot, StockReport } from '@shared/inventory';
import { InventoryRoute } from './inventory';
import { ServiceDetailRoute } from './service-detail';
import { SkuDetailRoute } from './sku-detail';
import {
  NavigationHistoryProvider,
  SIDEBAR_NAVIGATION_SOURCE,
} from '../state/navigation-history';
import { RouteBackButton } from '../components/system/page-navigation';

const inventoryHook = vi.fn();
const preferencesHook = vi.fn();
const loadSistSkuDetail = vi.fn();
const listStockReports = vi.fn();

vi.mock('../state/inventory', () => ({
  useInventory: () => inventoryHook(),
}));

vi.mock('../state/preferences', () => ({
  usePreferences: () => preferencesHook(),
}));

function LocationProbe() {
  const location = useLocation();
  return (
    <>
      <div data-testid="location-pathname">{location.pathname}</div>
      <div data-testid="location-search">{location.search}</div>
    </>
  );
}

const snapshot: InventorySnapshot = {
  services: [
    {
      serviceId: 'service-1',
      name: 'Market Day Outfit Set',
      description: 'Front-rack outfit bundle',
      price: 1200,
      skuIds: ['sku-1', 'sku-2'],
    },
  ],
  skus: [
    {
      skuId: 'sku-1',
      name: 'Bangkok Market Tee',
      description: 'Bestselling imported cotton tee',
      unitsInStock: 12,
      costPerUnit: 5,
      soldAsProduct: true,
      productPrice: 9,
      leadTimeMeanDays: 5,
      leadTimeStdDays: 1.5,
    },
    {
      skuId: 'sku-2',
      name: 'Osaka Pleat Midi',
      description: 'Imported pleated midi skirt',
      unitsInStock: 20,
      costPerUnit: 7,
      soldAsProduct: false,
      productPrice: null,
      leadTimeMeanDays: null,
      leadTimeStdDays: null,
    },
  ],
  ranking: [],
  sist: {
    status: {
      state: 'ready',
      updatedAt: '2026-03-27T09:00:00Z',
      reportCount: 4,
      confidence: 'medium',
      reason: null,
    },
    settings: {
      targetServiceLevel: 0.95,
      forecastHorizonDays: 14,
      particleCount: 512,
      smoothingWindowReports: 90,
    },
    asOf: '2026-03-27T09:00:00Z',
    topRegime: 'spike',
    pendingReorderCount: 1,
    highRiskSkuIds: ['sku-1'],
    skuInsights: [
      {
        skuId: 'sku-1',
        latestPosteriorUnits: 11,
        credibleIntervalLow: 8,
        credibleIntervalHigh: 14,
        daysOfCover: 4.2,
        stockoutRisk: 0.47,
        reorderPoint: 15,
        safetyStock: 5,
        reorderTriggerProbability: 0.72,
        expectedDemandPerDay: 2.6,
        demandIntervalLow: 1.8,
        demandIntervalHigh: 3.3,
        leadTime: {
          meanDays: 5,
          stdDays: 1.5,
          source: 'manual',
        },
        regimeProbabilities: {
          normal: 0.3,
          spike: 0.5,
          lull: 0.05,
          stockout_constrained: 0.1,
          correction: 0.05,
        },
        confidence: 'medium',
      },
      {
        skuId: 'sku-2',
        latestPosteriorUnits: 20,
        credibleIntervalLow: 17,
        credibleIntervalHigh: 23,
        daysOfCover: 11,
        stockoutRisk: 0.08,
        reorderPoint: 6,
        safetyStock: 2,
        reorderTriggerProbability: 0.1,
        expectedDemandPerDay: 1.1,
        demandIntervalLow: 0.8,
        demandIntervalHigh: 1.5,
        leadTime: {
          meanDays: 7,
          stdDays: 3,
          source: 'fallback',
        },
        regimeProbabilities: {
          normal: 0.7,
          spike: 0.1,
          lull: 0.1,
          stockout_constrained: 0.05,
          correction: 0.05,
        },
        confidence: 'low',
      },
    ],
  },
};

const stockReports: StockReport[] = [
  {
    reportId: 'report-0009',
    reportSource: 'manual',
    reportedAt: '2026-03-27T09:15:00Z',
    skuObservations: [
      {
        skuId: 'sku-1',
        unitsInStock: 10,
        costPerUnit: 5.5,
        restockIncluded: true,
        retailStockout: false,
        notes: 'Front shelf was restocked.',
      },
    ],
    serviceSignals: [{ serviceId: 'service-1', stockout: true }],
    servicePriceAdjustments: [{ serviceId: 'service-1', price: 950 }],
    topServiceRanking: ['service-1'],
    topRetailRanking: ['sku-1'],
    notes: 'Morning floor update.',
  },
];

describe('navigation and detail tabs', () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    loadSistSkuDetail.mockReset();
    listStockReports.mockReset();

    loadSistSkuDetail.mockResolvedValue({
      insight: snapshot.sist.skuInsights[0],
      reports: stockReports,
      posteriorInventoryTrajectory: [
        { at: '2026-03-26T09:00:00Z', mean: 12, low: 9, high: 14 },
        { at: '2026-03-27T09:00:00Z', mean: 11, low: 8, high: 14 },
      ],
      forecastTrajectory: [
        { at: '2026-03-28T09:00:00Z', mean: 9, low: 6, high: 12 },
        { at: '2026-03-29T09:00:00Z', mean: 7, low: 4, high: 10 },
      ],
      intervalDemand: [
        {
          intervalIndex: 0,
          startAt: '2026-02-01T09:00:00Z',
          endAt: '2026-02-08T09:00:00Z',
          durationDays: 7,
          serviceDemandMean: 1.1,
          retailDemandMean: 1.2,
          totalDemandMean: 2.3,
          restockMean: 0,
          correctionMean: 0,
          observedUnits: 12,
          posteriorUnitsMean: 12.2,
        },
      ],
      reorderPolicy: {
        targetServiceLevel: 0.95,
        leadTimeDaysMean: 5,
        leadTimeDaysStd: 1.5,
        expectedLeadTimeDemand: 13,
        reorderPoint: 15,
        safetyStock: 5,
        reorderTriggerProbability: 0.72,
      },
      evidenceSummary: [],
    });

    listStockReports.mockResolvedValue(stockReports);

    inventoryHook.mockReturnValue({
      snapshot,
      error: null,
      isLoading: false,
      isSaving: false,
      loadSistSkuDetail,
      listStockReports,
    });

    preferencesHook.mockReturnValue({
      currency: 'USD',
      language: 'en',
      persistedCurrency: 'USD',
      persistedLanguage: 'en',
      hasPendingChanges: false,
      setLanguage: vi.fn(),
      setCurrency: vi.fn(),
      savePreferences: vi.fn(),
      resetPreferences: vi.fn(),
      currencyLabel: (value: string) => value,
      t: (key: string) => {
        const translations: Record<string, string> = {
          allItemsTitle: 'Catalog',
          inventoryBody: 'Catalog body',
          createSkuAction: 'Create SKU',
          createServiceAction: 'Create Service',
          searchItems: 'Search items',
          searchPlaceholder: 'Search items',
          filterAll: 'All',
          filterSku: 'SKUs',
          filterService: 'Services',
          catalogViewAllSkusAction: 'View all SKUs',
          catalogViewAllServicesAction: 'View all Services',
          catalogAllSkusDescription: 'SKUs',
          catalogAllServicesDescription: 'Services',
          skusHeading: 'SKUs',
          servicesHeading: 'Services',
          catalogSkuMetricToggle: 'SKU metric',
          catalogSkuMetricRevenue: 'Revenue',
          catalogSkuMetricGrossMargin: 'Gross margin',
          stockSessionBack: 'Back',
          fieldId: 'Identifier',
          backToCatalog: 'Back to catalog',
          catalogSkuDetailTitle: 'SKU detail',
          catalogSkuDetailNotFoundTitle: 'SKU not found',
          catalogSkuDetailNotFoundDescription: 'SKU missing',
          catalogSkuOverviewIdentityDescription: 'SKU overview',
          catalogSkuStockAction: 'Record stock update',
          catalogSkuEditAction: 'Edit SKU',
          catalogSkuOperationalHealthy: 'Healthy',
          catalogSkuOperationalAtRisk: 'At risk',
          catalogSkuOperationalReorderSoon: 'Reorder soon',
          catalogSkuOperationalOverstocked: 'Overstocked',
          catalogSkuOperationalNoPlanning: 'Planning status unavailable.',
          catalogLinkedServicesAffectedSingular: 'affected service',
          catalogLinkedServicesAffectedPlural: 'affected services',
          catalogSkuPlanningSignalsFallback: 'Planning fallback',
          catalogStockoutRisk: 'Stockout risk',
          catalogSkuParametersNoInventoryRemaining: 'No inventory remaining',
          catalogSkuParametersCriticalCoverRemaining: 'Critical cover remaining',
          catalogSkuParametersCoverageThin: 'Coverage thin',
          catalogSkuParametersCoverageStable: 'Coverage is stable',
          apiUnavailable: 'API unavailable',
          catalogServiceDetailTitle: 'Service detail',
          catalogServiceDetailNotFoundTitle: 'Service not found',
          catalogServiceDetailNotFoundDescription: 'Service missing',
          catalogServiceOperationsAction: 'Review this service in session',
          catalogServiceEditAction: 'Edit service',
          catalogServiceSellableUnits: 'Sellable units',
          fieldPrice: 'Price',
        };

        return translations[key] ?? key;
      },
    });
  });

  test('back navigation returns to the actual previous catalog location and sku tabs stay selectable', async () => {
    const user = userEvent.setup();

    render(
      <MemoryRouter initialEntries={['/catalog?view=skus']}>
        <NavigationHistoryProvider>
          <Routes>
            <Route
              element={
                <>
                  <InventoryRoute />
                  <LocationProbe />
                </>
              }
              path="/catalog"
            />
            <Route
              element={
                <>
                  <SkuDetailRoute />
                  <LocationProbe />
                </>
              }
              path="/catalog/skus/:skuId"
            />
          </Routes>
        </NavigationHistoryProvider>
      </MemoryRouter>,
    );

    await user.click(screen.getByRole('link', { name: /Bangkok Market Tee/i }));

    await waitFor(() => {
      expect(screen.getByTestId('location-pathname').textContent).toBe('/catalog/skus/sku-1');
    });

    const statisticsTab = screen.getByRole('tab', { name: 'Statistics' });
    await user.click(statisticsTab);

    await waitFor(() => {
      expect(statisticsTab).toHaveAttribute('data-state', 'active');
    });

    const backButton = screen.getByRole('button', { name: 'Back' });
    expect(backButton).not.toBeDisabled();
    await user.click(backButton);

    await waitFor(() => {
      expect(screen.getByTestId('location-pathname').textContent).toBe('/catalog');
      expect(screen.getByTestId('location-search').textContent).toBe('?view=skus');
    });
  });

  test('service detail tabs switch through the shared radix control without custom trigger handlers', async () => {
    const user = userEvent.setup();

    render(
      <MemoryRouter initialEntries={['/catalog/services/service-1']}>
        <NavigationHistoryProvider>
          <Routes>
            <Route element={<ServiceDetailRoute />} path="/catalog/services/:serviceId" />
          </Routes>
        </NavigationHistoryProvider>
      </MemoryRouter>,
    );

    const dependenciesTab = await screen.findByRole('tab', { name: 'Dependencies' });
    await user.click(dependenciesTab);

    await waitFor(() => {
      expect(dependenciesTab).toHaveAttribute('data-state', 'active');
    });
    expect(await screen.findByText('Dependency map')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Osaka Pleat Midi/i })).toBeInTheDocument();
  });

  test('sidebar-style navigation resets back history while internal navigation preserves it', async () => {
    const user = userEvent.setup();

    function NavHarness() {
      return (
        <>
          <RouteBackButton />
          <Link to="/">Internal overview</Link>
          <Link state={{ banjiNavigationSource: SIDEBAR_NAVIGATION_SOURCE }} to="/catalog">
            Sidebar catalog
          </Link>
          <LocationProbe />
        </>
      );
    }

    render(
      <MemoryRouter initialEntries={['/']}>
        <NavigationHistoryProvider>
          <Routes>
            <Route element={<NavHarness />} path="/" />
            <Route element={<NavHarness />} path="/catalog" />
          </Routes>
        </NavigationHistoryProvider>
      </MemoryRouter>,
    );

    expect(screen.queryByRole('button', { name: 'Back' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('link', { name: 'Sidebar catalog' }));
    await waitFor(() => {
      expect(screen.getByTestId('location-pathname').textContent).toBe('/catalog');
    });
    expect(screen.queryByRole('button', { name: 'Back' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('link', { name: 'Internal overview' }));
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Back' })).toBeInTheDocument();
    });
  });

});
