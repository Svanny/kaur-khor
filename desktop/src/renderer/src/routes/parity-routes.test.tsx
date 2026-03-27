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
import { StockUpdateSessionRoute } from './stock-update-session';

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

vi.mock('../components/system/merchandising-editor', async () => {
  const actual = await vi.importActual<typeof import('../components/system/merchandising-editor')>(
    '../components/system/merchandising-editor',
  );

  return {
    ...actual,
    MerchandisingEditor: ({
      entries,
      onChange,
      titleLabel,
    }: {
      entries: RankingEntry[];
      onChange: (entries: RankingEntry[]) => void;
      titleLabel?: string;
    }) => (
      <div>
        <p>{titleLabel ?? 'Ranking of Items Sold'}</p>
        <button
          type="button"
          onClick={() => {
            if (entries.length < 2) {
              return;
            }

            const reordered = [...entries];
            const first = reordered[0];
            reordered[0] = reordered[1];
            reordered[1] = first;
            onChange(reordered.map((entry, index) => ({ ...entry, position: index })));
          }}
        >
          Apply ranking change
        </button>
      </div>
    ),
  };
});

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
    servicePriceAdjustments: [{ serviceId: 'service-2', price: 950 }],
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
    servicePriceAdjustments: [],
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
          navSettings: 'Settings',
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
          catalogExpand: 'Expand',
          catalogCollapse: 'Collapse',
          filterAll: 'Everything',
          filterSku: 'SKUs',
          filterService: 'Services',
          servicesHeading: 'Services',
          skusHeading: 'SKUs',
          stockFlow: 'Open update sheet',
          productRankingTitle: 'Ranking of Items Sold',
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
          settingsTitle: 'Settings',
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
          stockHistoryPriceEditSingular: 'price edit',
          stockHistoryPriceEditPlural: 'price edits',
          stockHistoryRankingSignalSingular: 'ranking signal',
          stockHistoryRankingSignalPlural: 'ranking signals',
          stockHistoryNoNotes: 'No report notes were captured for this update.',
          stockHistoryNoRanking: 'No ranking order was captured in this report.',
          stockHistoryNoObservations: 'No SKU observations were captured in this update.',
          stockHistoryNoPriceEdits: 'No service price changes were captured in this update.',
          stockAddUpdate: 'Add update',
          stockComposerTitle: 'New update',
          stockComposerDescription: 'Composer copy',
          stockComposerCancel: 'Cancel update',
          stockMerchandisingTitle: 'Ranking of Items Sold',
          stockMerchandisingDescription: 'Ranking copy',
          stockSessionEyebrow: 'Guided update session',
          stockSessionTitle: 'Update Sheet mission',
          stockSessionDescription:
            'Complete all four steps to capture the latest inventory update.',
          stockSessionProgress: 'steps complete',
          stockSessionIncomplete: 'Session incomplete',
          stockSessionReady: 'Ready to submit',
          stockSessionStepLabel: 'Step',
          stockSessionStepDetails: 'Reported at + note',
          stockSessionStepDetailsDescription:
            'Set the report timestamp and any context your team should keep.',
          stockSessionStepObservations: 'Report observations',
          stockSessionStepObservationsDescription:
            'Capture the SKU changes that belong in this update.',
          stockSessionStepServices: 'Service stockouts + prices',
          stockSessionStepServicesDescription:
            'Mark service stockouts and any price changes for the session.',
          stockSessionStepRanking: 'Ranking of Items Sold',
          stockSessionStepRankingDescription:
            'Order the items sold so the storefront ranking lands with the update.',
          stockSessionStepRequired:
            'Complete every session step before submitting this update.',
          stockSessionBack: 'Back',
          stockSessionNext: 'Next',
          stockSessionSubmit: 'Submit update',
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
          stockServiceStockoutToggle: 'Flag stockout',
          stockServicePriceHint: 'Current price',
          stockServicePriceAdjustmentsTitle: 'Service price changes',
          stockTopServiceRanking: 'Observed top services',
          stockTopRetailRanking: 'Observed top retail SKUs',
          stockRankingTitle: 'Ranking of Items Sold',
          stockRankingDescription: 'Ranking copy',
          stockRankingHint: 'Comma separated ids.',
          stockSignalsHint: 'Signals hint',
          stockNoServiceSignals: 'No service flags selected for this report.',
          cancel: 'Cancel',
          apiUnavailable: 'API unavailable',
          fieldUnitsInStock: 'Units in stock',
          fieldCostPerUnit: 'Cost per unit',
          fieldProductPrice: 'Product price',
          fieldPrice: 'Service price',
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
    expect(screen.getAllByText('SKUs').length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: 'Expand' })).toBeInTheDocument();
    expect(screen.queryByText('Days of cover')).not.toBeInTheDocument();
  });

  test('catalog stacks sections and lets each visible card expand from its squished state', () => {
    renderRoute('/inventory', <InventoryRoute />);

    expect(screen.getAllByRole('button', { name: 'Expand' }).length).toBe(2);
    expect(screen.queryByText('Potential revenue')).not.toBeInTheDocument();

    fireEvent.click(screen.getAllByRole('button', { name: 'Expand' })[0]);

    expect(screen.getByRole('button', { name: 'Collapse' })).toBeInTheDocument();
    expect(screen.getByText('Potential revenue')).toBeInTheDocument();
    expect(screen.queryByText('Days of cover')).not.toBeInTheDocument();
  });

  test('merchandising route redirects into the update-sheet session ranking step', () => {
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
            path="/inventory/stock/session"
          />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByText('Update sheet screen')).toBeInTheDocument();
    expect(screen.getByTestId('location-pathname').textContent).toBe('/inventory/stock/session');
    expect(screen.getByTestId('location-search').textContent).toBe('?step=ranking');
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

  test('update sheet defaults to history and keeps the session route separate', async () => {
    renderRoute('/inventory/stock', <StockUpdateRoute />);

    expect(await screen.findByText('Update history')).toBeInTheDocument();
    expect(await screen.findByText('Manual update')).toBeInTheDocument();
    expect(screen.getByText('Morning floor update.')).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: 'Add update' })[0]).toBeInTheDocument();
    expect(screen.queryByText('Update Sheet mission')).not.toBeInTheDocument();
  });

  test('update sheet expands saved-report details with ranking and service price data', async () => {
    renderRoute('/inventory/stock', <StockUpdateRoute />);

    fireEvent.click((await screen.findAllByRole('button', { name: 'View details' }))[0]);

    expect(await screen.findByText('Ranking of Items Sold')).toBeInTheDocument();
    expect(screen.getByText('Service price changes')).toBeInTheDocument();
    expect(screen.getByText('Front shelf was restocked.')).toBeInTheDocument();
    expect(screen.getAllByText('Service #001').length).toBeGreaterThan(0);
    expect(screen.getAllByText('SKU #001').length).toBeGreaterThan(0);
  });

  test('add update navigates from history view into the guided session route', async () => {
    render(
      <MemoryRouter initialEntries={['/inventory/stock']}>
        <Routes>
          <Route element={<StockUpdateRoute />} path="/inventory/stock" />
          <Route
            element={
              <>
                <StockUpdateSessionRoute />
                <LocationProbe />
              </>
            }
            path="/inventory/stock/session"
          />
        </Routes>
      </MemoryRouter>,
    );

    fireEvent.click((await screen.findAllByRole('link', { name: 'Add update' }))[0]);

    expect(await screen.findByText('Update Sheet mission')).toBeInTheDocument();
    expect(screen.getByTestId('location-pathname').textContent).toBe('/inventory/stock/session');
  });

  test('update sheet session shows four required steps and blocks submit until complete', async () => {
    renderRoute('/inventory/stock/session', <StockUpdateSessionRoute />);

    expect(await screen.findByRole('button', { name: /Step 1.*Reported at \+ note/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Step 2.*Report observations/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Step 3.*Service stockouts \+ prices/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Step 4.*Ranking of Items Sold/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Next' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Back' })).not.toBeInTheDocument();
  });

  test('viewing empty steps counts them as edited and enables final submit', async () => {
    renderRoute('/inventory/stock/session', <StockUpdateSessionRoute />);

    expect(await screen.findByText('Update Sheet mission')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Submit update' })).toBeEnabled();
    });
  });

  test('update sheet session submits a structured report with service price and ranking data', async () => {
    render(
      <MemoryRouter initialEntries={['/inventory/stock/session']}>
        <Routes>
          <Route element={<StockUpdateSessionRoute />} path="/inventory/stock/session" />
          <Route
            element={
              <>
                <StockUpdateRoute />
                <LocationProbe />
              </>
            }
            path="/inventory/stock"
          />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByText('Update Sheet mission')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Step 2.*Report observations/i }));
    fireEvent.click(screen.getAllByRole('button', { name: '+' })[0]);

    fireEvent.click(screen.getByRole('button', { name: /Step 3.*Service stockouts \+ prices/i }));
    fireEvent.change(screen.getAllByLabelText('Service price')[0], {
      target: { value: '1400' },
    });

    fireEvent.click(screen.getByRole('button', { name: /Step 4.*Ranking of Items Sold/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Apply ranking change' }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Submit update' })).toBeEnabled();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Submit update' }));

    await waitFor(() => {
      expect(submitReport).toHaveBeenCalledTimes(1);
    });
    expect(submitReport.mock.calls[0][0]).toMatchObject({
      skuObservations: expect.arrayContaining([
        expect.objectContaining({
          skuId: 'sku-1',
        }),
      ]),
      serviceSignals: [],
      servicePriceAdjustments: [{ serviceId: 'service-1', price: 1400 }],
      topServiceRanking: ['service-2', 'service-1'],
      topRetailRanking: ['sku-1'],
    });

    await waitFor(() => {
      expect(screen.getByText('Update history')).toBeInTheDocument();
    });
    expect(screen.getByTestId('location-pathname').textContent).toBe('/inventory/stock');
  });

  test('update sheet session omits ranking arrays when the ranking is unchanged', async () => {
    renderRoute('/inventory/stock/session', <StockUpdateSessionRoute />);

    expect(await screen.findByText('Update Sheet mission')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    fireEvent.change(screen.getAllByLabelText('Service price')[0], {
      target: { value: '1400' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Submit update' })).toBeEnabled();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Submit update' }));

    await waitFor(() => {
      expect(submitReport).toHaveBeenCalledTimes(1);
    });
    expect(submitReport.mock.calls[0][0]).not.toHaveProperty('topServiceRanking');
    expect(submitReport.mock.calls[0][0]).not.toHaveProperty('topRetailRanking');
    expect(submitReport.mock.calls[0][0]).toMatchObject({
      servicePriceAdjustments: [{ serviceId: 'service-1', price: 1400 }],
    });
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
