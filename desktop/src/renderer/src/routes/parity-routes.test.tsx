import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import type { InventorySnapshot, RankingEntry, StockReport } from '@shared/inventory';
import { DashboardRoute } from './dashboard';
import { InventoryRoute } from './inventory';
import { RankingRoute } from './ranking';
import { ServiceFormRoute } from './service-form';
import { SettingsRoute } from './settings';
import { SkuFormRoute } from './sku-form';
import { StockUpdateRoute } from './stock-update';

let rankingEntries: RankingEntry[] = [
  { entryType: 'service', entryId: 'service-1', position: 0 },
  { entryType: 'service', entryId: 'service-2', position: 1 },
  { entryType: 'sku', entryId: 'sku-1', position: 2 },
];

const snapshot: InventorySnapshot = {
  services: [
    {
      serviceId: 'service-1',
      name: 'Service #001',
      description: 'Main service',
      price: 1200,
      skuIds: ['sku-1'],
    },
    {
      serviceId: 'service-2',
      name: 'Service #002',
      description: 'Secondary service',
      price: 800,
      skuIds: ['sku-2'],
    },
  ],
  skus: [
    {
      skuId: 'sku-1',
      name: 'SKU #001',
      description: 'First sku',
      unitsInStock: 12,
      costPerUnit: 5,
      soldAsProduct: true,
      productPrice: 9,
      leadTimeMeanDays: 5,
      leadTimeStdDays: 1.5,
    },
    {
      skuId: 'sku-2',
      name: 'SKU #002',
      description: 'Second sku',
      unitsInStock: 20,
      costPerUnit: 7,
      soldAsProduct: false,
      productPrice: null,
      leadTimeMeanDays: null,
      leadTimeStdDays: null,
    },
  ],
  ranking: rankingEntries,
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

const inventoryHook = vi.fn();
const preferencesHook = vi.fn();
const saveSistSettings = vi.fn();
const listStockReports = vi.fn();
const submitReport = vi.fn();

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
    topServiceRanking: ['service-1', 'service-2'],
    topRetailRanking: ['sku-1'],
    notes: 'Morning floor update.',
  },
  {
    reportId: 'report-0008',
    reportSource: 'legacy-baseline',
    reportedAt: '2026-03-26T11:00:00Z',
    skuObservations: [],
    serviceSignals: [],
    topServiceRanking: [],
    topRetailRanking: [],
    notes: null,
  },
];

function renderInventory(path = '/inventory') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route
          element={
            <>
              <InventoryRoute />
              <LocationProbe />
            </>
          }
          path="/inventory"
        />
      </Routes>
    </MemoryRouter>,
  );
}

function renderRoute(path: string, element: React.ReactNode) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route element={element} path={path.includes(':') ? path : '*'} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('renderer workspaces', () => {
  beforeEach(() => {
    rankingEntries = [
      { entryType: 'service', entryId: 'service-1', position: 0 },
      { entryType: 'service', entryId: 'service-2', position: 1 },
      { entryType: 'sku', entryId: 'sku-1', position: 2 },
    ];
    saveSistSettings.mockReset();
    listStockReports.mockReset();
    submitReport.mockReset();
    listStockReports.mockResolvedValue(stockReports);
    inventoryHook.mockReturnValue({
      snapshot: { ...snapshot, ranking: rankingEntries },
      error: null,
      isLoading: false,
      isSaving: false,
      saveSku: vi.fn(),
      saveService: vi.fn(),
      saveStock: vi.fn(),
      submitReport,
      persistRanking: vi.fn(),
      saveSistSettings,
      loadSistSkuDetail: vi.fn(),
      listStockReports,
    });
    preferencesHook.mockReturnValue({
      currency: 'USD',
      language: 'en',
      setLanguage: vi.fn(),
      setCurrency: vi.fn(),
      currencyLabel: (value: string) => value,
      t: (key: string) => {
        const translations: Record<string, string> = {
          navDashboard: 'Overview',
          navInventory: 'Catalog',
          navStock: 'Update Sheet',
          navRanking: 'Merchandising',
          navSettings: 'Preferences',
          backToCatalog: 'Back to catalog',
          dashboardEyebrow: 'Warm, local-first retail operations',
          dashboardHeading: 'Daily control for inventory, stock moves, and storefront priorities',
          dashboardBody: 'Desktop inventory overview',
          dashboardTotalValue: 'Inventory value',
          dashboardSaleReady: 'Sale-ready SKUs',
          dashboardServices: 'Service bundles',
          dashboardRanked: 'Merchandising slots',
          dashboardInventoryDepth: 'Units on hand',
          dashboardMarginMix: 'Catalog coverage',
          dashboardHealthTitle: 'Local runtime',
          dashboardHealthDescription: 'Local runtime copy',
          dashboardHealthReady: 'Connected and ready for edits',
          dashboardHealthStarting: 'Booting the local API',
          dashboardHealthFailed: 'The local API needs attention',
          dashboardRecent: 'Current featured order',
          dashboardRecentDescription: 'Recent featured copy',
          dashboardQuickCreateTitle: 'Quick capture',
          dashboardQuickCreateDescription: 'Quick capture copy',
          dashboardRiskTitle: 'SIST planning pulse',
          dashboardRiskDescription: 'Risk copy',
          dashboardReorderCount: 'Reorders likely',
          dashboardTopRegime: 'Dominant regime',
          dashboardReportFreshness: 'Analysis freshness',
          dashboardHighRisk: 'High-risk SKUs',
          dashboardNoRisk: 'No urgent reorder signals yet.',
          regimeSpike: 'Spike',
          regimeNormal: 'Normal',
          inventoryBody: 'Catalog overview copy',
          allItemsTitle: 'Catalog',
          searchItems: 'Search and segment',
          searchPlaceholder: 'Search name, description, or id…',
          filterAll: 'Everything',
          filterSku: 'SKUs',
          filterService: 'Services',
          servicesHeading: 'Services',
          skusHeading: 'SKUs',
          stockFlow: 'Open update sheet',
          productRankingTitle: 'Merchandising',
          merchandisingPriorityNote:
            'Drag by handle to set storefront priority. Keyboard reordering stays available when the handle is focused.',
          createSkuAction: 'New SKU',
          createServiceAction: 'New Service',
          rankHeaderRank: 'Rank',
          rankHeaderName: 'Name',
          rankHeaderPrice: 'Price',
          saveRankingAction: 'Save order',
          resetAction: 'Reset',
          inventoryColumnItem: 'Item',
          inventoryColumnSellable: 'Sellable units',
          inventoryColumnLinkedSkus: 'Linked SKUs',
          inventoryColumnValue: 'Stock value',
          inventoryPotentialRevenue: 'Potential revenue',
          inventorySoldAsProduct: 'Sellable',
          inventoryNotSoldAsProduct: 'Internal only',
          inventoryNoResultsDescription: 'Try another query or add a new SKU.',
          catalogServicesDescription: 'Service bundle copy',
          catalogSkusDescription: 'SKU copy',
          catalogDaysOfCover: 'Days of cover',
          catalogStockoutRisk: 'Stockout risk',
          catalogLeadTime: 'Lead time',
          catalogConfidence: 'Confidence',
          settingsTitle: 'Preferences',
          preferencesRegionalTitle: 'Regional formatting',
          preferencesRegionalDescription: 'Regional formatting copy',
          settingsLanguage: 'Language',
          settingsCurrency: 'Currency',
          languageEnglish: 'English',
          languageKhmer: 'Khmer',
          settingsStorage: 'Stored locally',
          settingsStorageTitle: 'Local-only storage',
          settingsDisclaimer: 'This workstation remains the source of truth.',
          preferencesSistTitle: 'SIST defaults',
          preferencesSistDescription: 'SIST defaults copy',
          settingsTargetServiceLevel: 'Target service level',
          settingsForecastHorizon: 'Forecast horizon (days)',
          settingsParticleCount: 'Particle count',
          settingsSmoothingWindow: 'Smoothing window (reports)',
          saveDraft: 'Save changes',
          stockChangesTitle: 'Update Sheet',
          stockUpdateBody: 'Capture timestamped stock reports.',
          stockUpdateHint: 'Only rows you edit become part of the report.',
          stockTableTitle: 'Report observations',
          stockHistoryTitle: 'Update history',
          stockHistoryDescription: 'Saved update history.',
          stockHistoryEmptyTitle: 'No saved updates yet',
          stockHistoryEmptyDescription: 'Start the first update.',
          stockHistoryViewDetails: 'View details',
          stockHistoryHideDetails: 'Hide details',
          stockHistorySourceManual: 'Manual update',
          stockHistorySourceCompat: 'Imported update',
          stockHistorySourceLegacy: 'Baseline import',
          stockHistoryChangedRowSingular: 'changed row',
          stockHistoryChangedRowPlural: 'changed rows',
          stockHistoryServiceFlagSingular: 'service flag',
          stockHistoryServiceFlagPlural: 'service flags',
          stockHistoryMerchandisingSignalSingular: 'merchandising signal',
          stockHistoryMerchandisingSignalPlural: 'merchandising signals',
          stockHistoryNoNotes: 'No report notes were captured for this update.',
          stockHistoryNoMerchandising: 'No merchandising order was captured in this report.',
          stockAddUpdate: 'Add update',
          stockComposerTitle: 'New update',
          stockComposerDescription: 'Composer copy',
          stockComposerCancel: 'Cancel update',
          stockMerchandisingTitle: 'Merchandising order',
          stockMerchandisingDescription: 'Merchandising copy',
          stockSummaryTitle: 'Pending change set',
          stockReviewTitle: 'Review report before save',
          stockReviewDescription: 'Confirm the report.',
          stockUpdatesReady: 'Rows ready to report',
          stockPresetSmall: 'Fine',
          stockPresetMedium: 'Standard',
          stockPresetBig: 'Bulk',
          stockConfirm: 'Review changes',
          stockDone: 'Save update',
          stockPhaseEditing: 'Editing',
          stockPhaseReview: 'Review',
          validationStockChanges: 'Change at least one SKU before saving.',
          validationTimestamp: 'Enter a valid report timestamp.',
          stockReportedAt: 'Reported at',
          stockReportNotes: 'Report notes',
          stockRestockIncluded: 'Restock included',
          stockRetailStockout: 'Retail stockout',
          stockServiceSignalsTitle: 'Service stockout flags',
          stockTopServiceRanking: 'Observed top services',
          stockTopRetailRanking: 'Observed top retail SKUs',
          stockRankingHint: 'Comma separated ids.',
          stockSignalsHint: 'Signals hint',
          stockNoServiceSignals: 'No service flags selected for this report.',
          cancel: 'Cancel',
          apiUnavailable: 'API unavailable',
          fieldUnitsInStock: 'Units in stock',
          fieldCostPerUnit: 'Cost per unit',
          fieldProductPrice: 'Product price',
          serviceLabel: 'Service',
          skuLabel: 'SKU',
        };
        return translations[key] ?? key;
      },
    });
  });

  test('overview surfaces SIST risk and reorder summaries', () => {
    renderRoute('/', <DashboardRoute />);

    expect(screen.getByText('SIST planning pulse')).toBeInTheDocument();
    expect(screen.getAllByText('Reorders likely').length).toBeGreaterThan(0);
    expect(screen.getByText('High-risk SKUs')).toBeInTheDocument();
    expect(screen.getByText('Spike')).toBeInTheDocument();
  });

  test('overview metric tooltips reopen after being dismissed with a click', async () => {
    renderRoute('/', <DashboardRoute />);

    const metricTrigger = screen.getByText('Merchandising slots').closest('button');
    expect(metricTrigger).not.toBeNull();

    fireEvent.pointerEnter(metricTrigger!);
    expect(
      await screen.findByRole('tooltip', { name: '2 SKUs / 2 services' }),
    ).toBeInTheDocument();

    fireEvent.click(metricTrigger!);
    await waitFor(() => {
      expect(screen.queryByRole('tooltip', { name: '2 SKUs / 2 services' })).not.toBeInTheDocument();
    });

    fireEvent.click(metricTrigger!);
    expect(
      await screen.findByRole('tooltip', { name: '2 SKUs / 2 services' }),
    ).toBeInTheDocument();
  });

  test('catalog keeps search and filter state in the URL', () => {
    renderInventory('/inventory?q=sku&type=sku');

    expect(screen.getByTestId('location-search').textContent).toBe('?q=sku&type=sku');
    expect(screen.getByText('Days of cover')).toBeInTheDocument();
    expect(screen.getByText('Stockout risk')).toBeInTheDocument();
  });

  test('merchandising route redirects into the update-sheet composer', () => {
    render(
      <MemoryRouter initialEntries={['/inventory/ranking']}>
        <Routes>
          <Route element={<RankingRoute />} path="/inventory/ranking" />
          <Route
            element={
              <>
                <div>Update sheet screen</div>
                <LocationProbe />
              </>
            }
            path="/inventory/stock"
          />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByText('Update sheet screen')).toBeInTheDocument();
    expect(screen.getByTestId('location-pathname').textContent).toBe('/inventory/stock');
    expect(screen.getByTestId('location-search').textContent).toBe('?compose=1&section=merchandising');
  });

  test('sku and service detail editors show a back-to-catalog icon control', () => {
    render(
      <MemoryRouter initialEntries={['/inventory/skus/sku-1']}>
        <Routes>
          <Route element={<SkuFormRoute />} path="/inventory/skus/:skuId" />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByRole('button', { name: 'Back to catalog' })).toBeInTheDocument();

    render(
      <MemoryRouter initialEntries={['/inventory/services/service-1']}>
        <Routes>
          <Route element={<ServiceFormRoute />} path="/inventory/services/:serviceId" />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getAllByRole('button', { name: 'Back to catalog' }).length).toBeGreaterThan(1);
  });

  test('update sheet defaults to history and keeps the composer hidden', async () => {
    renderRoute('/inventory/stock', <StockUpdateRoute />);

    expect(await screen.findByText('Update history')).toBeInTheDocument();
    expect(await screen.findByText('Manual update')).toBeInTheDocument();
    expect(screen.getByText('Morning floor update.')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Add update' })[0]).toBeInTheDocument();
    expect(screen.queryByText('New update')).not.toBeInTheDocument();
  });

  test('update sheet expands saved-report details with merchandising data', async () => {
    renderRoute('/inventory/stock', <StockUpdateRoute />);

    fireEvent.click((await screen.findAllByRole('button', { name: 'View details' }))[0]);

    expect(await screen.findByText('Merchandising')).toBeInTheDocument();
    expect(screen.getByText('Front shelf was restocked.')).toBeInTheDocument();
    expect(screen.getAllByText('Service #001').length).toBeGreaterThan(0);
    expect(screen.getAllByText('SKU #001').length).toBeGreaterThan(0);
  });

  test('update sheet submits a structured stock report and refreshes history', async () => {
    renderRoute('/inventory/stock', <StockUpdateRoute />);

    fireEvent.click((await screen.findAllByRole('button', { name: 'Add update' }))[0]);
    expect(screen.getByText('New update')).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole('button', { name: '+' })[0]);
    fireEvent.click(screen.getByRole('button', { name: 'Save update' }));

    await waitFor(() => {
      expect(submitReport).toHaveBeenCalledTimes(1);
    });
    expect(submitReport.mock.calls[0][0]).toMatchObject({
      skuObservations: expect.any(Array),
      serviceSignals: expect.any(Array),
    });
    expect(submitReport.mock.calls[0][0]).not.toHaveProperty('topServiceRanking');
    expect(submitReport.mock.calls[0][0]).not.toHaveProperty('topRetailRanking');
    await waitFor(() => {
      expect(listStockReports).toHaveBeenCalledTimes(2);
    });
    expect(screen.getByRole('button', { name: 'Add update' })).toBeInTheDocument();
    expect(screen.queryByText('New update')).not.toBeInTheDocument();
  });

  test('update sheet blocks empty updates', async () => {
    renderRoute('/inventory/stock', <StockUpdateRoute />);

    fireEvent.click((await screen.findAllByRole('button', { name: 'Add update' }))[0]);
    fireEvent.click(screen.getByRole('button', { name: 'Save update' }));

    expect(submitReport).not.toHaveBeenCalled();
    expect(screen.getByText('Change at least one SKU before saving.')).toBeInTheDocument();
  });

  test('update sheet validates timestamp before submission', async () => {
    renderRoute('/inventory/stock', <StockUpdateRoute />);

    fireEvent.click((await screen.findAllByRole('button', { name: 'Add update' }))[0]);
    fireEvent.click(screen.getAllByRole('button', { name: '+' })[0]);
    fireEvent.change(screen.getByLabelText('Reported at'), {
      target: { value: '' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save update' }));

    expect(submitReport).not.toHaveBeenCalled();
    expect(screen.getByText('Enter a valid report timestamp.')).toBeInTheDocument();
  });

  test('settings renders SIST defaults and saves them', async () => {
    renderRoute('/settings', <SettingsRoute />);

    fireEvent.change(screen.getByLabelText('Particle count'), {
      target: { value: '768' },
    });
    fireEvent.click(screen.getByText('Save changes'));

    await waitFor(() => {
      expect(saveSistSettings).toHaveBeenCalledWith({
        targetServiceLevel: 0.95,
        forecastHorizonDays: 14,
        particleCount: 768,
        smoothingWindowReports: 90,
      });
    });
  });
});
