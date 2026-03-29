import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { Link, MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import type { InventorySnapshot, RankingEntry, StockReport } from '@shared/inventory';
import { AppRoutes } from '../App';
import { DashboardRoute } from './dashboard';
import { InventoryRoute } from './inventory';
import { PlanningRoute } from './planning';
import { ServiceDetailRoute } from './service-detail';
import { ServiceFormRoute } from './service-form';
import { SettingsRoute } from './settings';
import { SkuDetailRoute } from './sku-detail';
import { SkuFormRoute } from './sku-form';
import { StockUpdateRoute } from './stock-update';
import { StockUpdateSessionRoute } from './stock-update-session';
import { OperationsSessionProvider } from '../state/operations-session';

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
const saveSku = vi.fn();
const saveService = vi.fn();
const loadSistSkuDetail = vi.fn();
const savePreferences = vi.fn();
const resetPreferences = vi.fn();
const persistRanking = vi.fn();
const getLocalDataInfo = vi.fn();
const openLocalDataFolder = vi.fn();
const exportSkusCsv = vi.fn();
const exportServicesCsv = vi.fn();
const exportStockReportsCsv = vi.fn();

if (!HTMLElement.prototype.scrollIntoView) {
  HTMLElement.prototype.scrollIntoView = vi.fn();
}

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
      helperText,
      titleLabel,
    }: {
      entries: RankingEntry[];
      onChange: (entries: RankingEntry[]) => void;
      helperText?: string;
      titleLabel?: string;
    }) => (
      <div>
        <p>{titleLabel ?? 'Ranking of Items Sold'}</p>
        {helperText ? <p>{helperText}</p> : null}
        <div>
          <span>Rank</span>
          <span>Name</span>
          <span>Type</span>
          <span>Price</span>
        </div>
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

function createSnapshot(overrides: Partial<InventorySnapshot> = {}): InventorySnapshot {
  return {
    ...snapshot,
    skus: overrides.skus ?? snapshot.skus,
    services: overrides.services ?? snapshot.services,
    ranking: overrides.ranking ?? rankingEntries,
    sist: overrides.sist ?? snapshot.sist,
  };
}

function setInventoryState(nextSnapshot: InventorySnapshot | null) {
  inventoryHook.mockReturnValue({
    snapshot: nextSnapshot,
    error: null,
    isLoading: false,
    isSaving: false,
    saveSku,
    saveService,
    saveStock: vi.fn(),
    submitReport,
    persistRanking,
    saveSistSettings,
    loadSistSkuDetail,
    listStockReports,
  });
}

function renderInventory(path = '/catalog') {
  return render(
    <OperationsSessionProvider>
      <MemoryRouter initialEntries={[path]}>
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
        </Routes>
      </MemoryRouter>
    </OperationsSessionProvider>,
  );
}

function renderAppRoutes(path: string) {
  return render(
    <OperationsSessionProvider>
      <MemoryRouter initialEntries={[path]}>
        <AppRoutes />
        <LocationProbe />
      </MemoryRouter>
    </OperationsSessionProvider>,
  );
}

function renderRoute(path: string, element: React.ReactNode) {
  return render(
    <OperationsSessionProvider>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route element={element} path={path.includes(':') ? path : '*'} />
        </Routes>
      </MemoryRouter>
    </OperationsSessionProvider>,
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
    saveSku.mockReset();
    saveService.mockReset();
    loadSistSkuDetail.mockReset();
    savePreferences.mockReset();
    resetPreferences.mockReset();
    persistRanking.mockReset();
    getLocalDataInfo.mockReset();
    openLocalDataFolder.mockReset();
    exportSkusCsv.mockReset();
    exportServicesCsv.mockReset();
    exportStockReportsCsv.mockReset();
    listStockReports.mockResolvedValue(stockReports);
    saveSku.mockResolvedValue(undefined);
    saveService.mockResolvedValue(undefined);
    loadSistSkuDetail.mockResolvedValue({
      insight: snapshot.sist.skuInsights[0],
      reports: stockReports,
    });
    setInventoryState(createSnapshot());
    preferencesHook.mockReturnValue({
      currency: 'USD',
      language: 'en',
      persistedCurrency: 'USD',
      persistedLanguage: 'en',
      hasPendingChanges: false,
      setLanguage: vi.fn(),
      setCurrency: vi.fn(),
      savePreferences,
      resetPreferences,
      currencyLabel: (value: string) => value,
      t: (key: string) => {
        const translations: Record<string, string> = {
          navOverview: 'Overview',
          navCatalog: 'Catalog',
          navOperations: 'Operations',
          navPlanning: 'Planning',
          shellGroupWorkflows: 'Workflows',
          navDashboard: 'Overview',
          navInventory: 'Catalog',
          navStock: 'Update Sheet',
          navRanking: 'Merchandising',
          navSettings: 'Settings',
          backToCatalog: 'Back to catalog',
          catalogEditAction: 'Edit',
          catalogSkuEditAction: 'Edit SKU',
          catalogSkuStockAction: 'Record stock update',
          catalogSkuDetailNotFoundTitle: 'SKU not found',
          catalogSkuDetailNotFoundDescription:
            'This SKU is no longer in the current snapshot. Return to the catalog to choose another record.',
          catalogSkuOverviewIdentityDescription:
            'Use this as the product record for identity, stock context, and the next operational handoff.',
          catalogSkuDirectSellStatus: 'Direct sell status',
          catalogSkuLeadTimeSummary: 'Lead-time summary',
          catalogSkuSnapshotFallback:
            'Using snapshot planning data while richer detail is unavailable.',
          catalogSkuOperationalStatusTitle: 'Operational status',
          catalogSkuOperationalHealthy: 'Healthy',
          catalogSkuOperationalAtRisk: 'At risk',
          catalogSkuOperationalReorderSoon: 'Reorder soon',
          catalogSkuOperationalOverstocked: 'Overstocked',
          catalogSkuOperationalNoPlanning: 'Planning status unavailable.',
          catalogSkuOperationalLinkedServiceSingular: 'linked service depends on this SKU',
          catalogSkuOperationalLinkedServicePlural: 'linked services depend on this SKU',
          catalogSkuPlanningSignalsFallback:
            'Detailed planning context could not be loaded. Showing the latest snapshot values instead.',
          catalogSkuRecentReportsTitle: 'Recent reports',
          catalogSkuRecentReportsDescription:
            'Review the latest report evidence tied to this SKU before making stock or pricing changes.',
          catalogSkuRecentReportsEmpty: 'No recent report history is available for this SKU yet.',
          catalogSkuRecentReportsFallback:
            'Recent report history could not be loaded right now. The rest of the SKU page is still available.',
          catalogSkuRecentReportsStockAdjusted: 'Stock adjusted',
          catalogSkuRecentReportsCostUpdated: 'Cost updated',
          catalogSkuRecentReportsRetailStockout: 'Marked retail stockout',
          catalogSkuRecentReportsRestockIncluded: 'Restock included',
          catalogSkuRecentReportsNoSkuChanges: 'No SKU-specific changes recorded',
          catalogSkuEditorTitleNew: 'New SKU',
          catalogSkuEditorTitleEdit: 'Edit SKU',
          catalogSkuEditorDescriptionNew:
            'Create a new SKU record, then land on its detail page for follow-up planning and stock work.',
          catalogSkuEditorDescriptionEdit:
            'Update the editable fields for this SKU without changing its identifier or route.',
          catalogSkuEditorIdentifierDescription:
            'The SKU identifier is read-only in this phase and remains the stable record reference.',
          catalogSkuPlanningInputsTitle: 'Planning inputs',
          catalogSkuPlanningInputsDescription:
            'Optional lead-time calibration. Update it when planning assumptions need a refresh.',
          catalogSkuPlanningInputsShow: 'Show inputs',
          catalogSkuPlanningInputsHide: 'Hide inputs',
          createEntry: 'Create entry',
          fieldName: 'Name',
          fieldDescription: 'Description',
          fieldId: 'Identifier',
          fieldLinkedSkus: 'Linked SKUs',
          editorDetailsTitle: 'Core details',
          serviceEditorDetailsTitle: 'Service details',
          skuEditorDetailsTitle: 'SKU details',
          skuEditorStockSellingTitle: 'Stock and selling',
          editorSkuHelper: 'SKU helper',
          editorServiceHelper: 'Service helper',
          editorInventoryTitle: 'Inventory profile',
          editorPricingTitle: 'Commercial setup',
          editorSelectionTitle: 'Linked SKUs',
          editorSelectionCount: 'selected',
          serviceEditorLinkedSkusSelected: 'linked SKUs selected',
          serviceEditorCoverageTitle: 'Current sellable coverage',
          serviceEditorCoverageEmpty: 'No linked SKU coverage yet',
          serviceEditorLimitingSkuTitle: 'Limiting SKU',
          serviceEditorLimitingSkuNone: 'None',
          editorNoChangesYet: 'No changes yet',
          editorUnsavedChanges: 'Unsaved changes',
          skuEditorDetailsChanged: 'Details updated',
          skuEditorInventoryChanged: 'Inventory updated',
          skuEditorPricingChanged: 'Pricing updated',
          skuEditorPlanningChanged: 'Planning inputs updated',
          serviceEditorDetailsChanged: 'Service details updated',
          serviceEditorLinkedSkusChanged: 'Linked SKUs updated',
          overviewHeading: 'Overview',
          overviewBody: 'See what needs attention now, what changed recently, and what to do next.',
          overviewLoading: 'Loading the latest overview context…',
          overviewPrimaryCardLabel: 'Recommended next move',
          overviewDecisionSupportLabel: 'Why this action now',
          overviewLatestChangeLabel: 'Latest change',
          overviewSupportPromptLabel: 'What this page is for',
          overviewSupportPromptBody:
            'Overview stays focused on the next operational decision.',
          overviewDecisionSupportCatalogTitle: 'Planning starts after the catalog exists',
          overviewDecisionSupportCatalogBody:
            'Add the first SKU so stock sessions, services, and merchandising order have something real to work with.',
          overviewDecisionSupportRiskTitle: 'Current risk summary',
          overviewDecisionSupportRiskBody:
            'Planning is the next move because high-risk SKUs and reorder pressure are already building together.',
          overviewDecisionSupportReorderTitle: 'Pressure is building before risk peaks',
          overviewDecisionSupportReorderBody:
            'Reorder pressure is rising even without a top-risk SKU, so Planning should confirm priorities before urgency spreads.',
          overviewDecisionSupportFirstReportTitle: 'The catalog needs its first live update',
          overviewDecisionSupportFirstReportBody:
            'Catalog structure is in place, but operations still needs a captured stock session before recent changes can be trusted.',
          overviewDecisionSupportSteadyTitle: 'The latest picture looks steady',
          overviewDecisionSupportSteadyBody:
            'Nothing urgent is crowding the queue, so the next guided update session is the best way to keep Overview current.',
          overviewPrimaryAddFirstSku: 'Add first SKU',
          overviewPrimaryAddFirstSkuDescription: 'Start the catalog with the first SKU.',
          overviewPrimaryStartFirstUpdate: 'Start first update session',
          overviewPrimaryStartFirstUpdateDescription: 'Capture the first stock report.',
          overviewPrimaryReviewReorderPriorities: 'Review reorder priorities',
          overviewPrimaryReviewReorderPrioritiesDescription:
            'High-risk SKUs need planning attention.',
          overviewPrimaryStartUpdateSession: 'Start update session',
          overviewPrimaryStartUpdateSessionDescription: 'Open the guided stock session.',
          overviewOpenCatalog: 'Open catalog',
          overviewOpenCatalogDescription: 'Browse the current SKU and service structure.',
          overviewOpenOperations: 'Open operations',
          overviewOpenOperationsDescription: 'Review saved stock reports.',
          overviewOpenPlanning: 'Open planning',
          overviewOpenPlanningDescription: 'Review merchandising and reorder priorities.',
          overviewReviewRecentActivity: 'Review recent activity',
          overviewReviewRecentActivityDescription:
            'Open operations to inspect saved reports.',
          overviewNeedsAttentionTitle: 'Needs attention',
          overviewNeedsAttentionDescription: 'Surface the strongest reorder and stockout signals.',
          overviewReorderPressure: 'Reorder pressure',
          overviewHighRiskSkuCount: 'High-risk SKUs',
          overviewUrgentBadge: 'Urgent',
          overviewDaysOfCoverSuffix: 'days of cover',
          overviewHealthyStateTitle: 'No urgent planning signals',
          overviewHealthyStateDescription:
            'Reorder pressure is calm right now. Keep operations moving or continue shaping the catalog.',
          overviewReorderPressureOnlyTitle: 'Reorder pressure is rising',
          overviewReorderPressureOnlyDescription:
            'Reorder pressure is rising even though no SKU is in the current top risk list.',
          overviewRecentActivityTitle: 'Recent activity',
          overviewRecentActivityDescription: 'The latest stock reports and recent operational changes.',
          overviewRecentActivityLoading: 'Loading recent activity…',
          overviewRecentActivityFallback:
            'Recent activity could not be loaded right now. The rest of Overview is still available.',
          overviewRecentActivityEmpty: 'No stock reports have been captured yet.',
          overviewQuickActionsTitle: 'Quick actions',
          overviewQuickActionsDescription:
            'Keep this list short so Overview stays action-first.',
          overviewQuickActionOperationsDescription:
            'Capture the next stock update through the guided operations session.',
          overviewQuickActionCatalogDescription:
            'Review catalog structure, item details, and create new SKU records.',
          overviewQuickActionPlanningDescription:
            'Check ranking and reorder context on the planning surface.',
          overviewSupportMetricsTitle: 'Support metrics',
          overviewSupportMetricsDescription:
            'Use these as passive context after the action sections.',
          overviewSupportMetricsValueDetail: 'Estimated value of units currently on hand.',
          overviewSupportMetricsSaleReadyDetail:
            'Sellable SKUs currently available to the storefront.',
          overviewSupportMetricsServicesDetail: 'Service bundles currently defined in the catalog.',
          overviewRankingCoverage: 'Latest ranking coverage',
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
          catalogViewAllSkusAction: 'View all SKUs',
          catalogViewAllServicesAction: 'View all services',
          catalogResultSkuSingular: 'SKU',
          catalogResultSkuPlural: 'SKUs',
          catalogResultServiceSingular: 'service',
          catalogResultServicePlural: 'services',
          catalogResultsJoiner: 'and',
          catalogResultsMatchingFor: 'matching for',
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
          rankHeaderType: 'Type',
          rankHeaderPrice: 'Price',
          saveRankingAction: 'Save order',
          resetAction: 'Reset',
          planningBody:
            'Set the sales priority order your team uses on the floor, then review the supporting signals before saving.',
          planningOperationsSource:
            'You opened Planning from operations review. Finalize the order here, then return to review.',
          planningReturnToOperationsReview: 'Return to operations review',
          planningRankingEntries: 'Ranking entries',
          planningLeadSpotlight: 'Top of list preview',
          planningLeadSpotlightEmpty: 'No ranked entries yet.',
          planningCoverageTitle: 'Ranking coverage',
          planningCoverageDescription: 'Entries currently in scope for merchandising decisions.',
          planningCoverageBadge: 'entries in scope',
          planningContextTitle: 'Decision context',
          planningContextDescription: 'Use these signals to pressure-test the order above.',
          planningRankingWorkspaceTitle: 'Set sales priority order',
          planningRankingWorkspaceDescription:
            'Rank the services and sellable SKUs by how strongly they tend to sell or how strongly your team pushes them. Highest priority means first to push, first to assume demand for when evidence is thin.',
          planningUnsavedBadge: 'You have unsaved changes',
          planningExplainerTitle: 'Why this order matters',
          planningExplainerTeamLabel: 'For your team',
          planningExplainerTeamBody: 'Shows what should be pushed or is most likely to sell first.',
          planningExplainerSistLabel: 'For SIST',
          planningExplainerSistBody:
            'Helps Banji estimate hidden demand patterns when direct stock signals are incomplete.',
          planningExplainerFooter: 'Treat this as a business signal, not a strict sales report.',
          planningDemandPressureTitle: 'Demand pressure',
          planningDemandPressureLabel: 'Reorder pressure',
          planningDemandPressureEmpty: 'No high-risk SKUs right now.',
          planningEmptyTitle: 'Planning needs rankable items',
          planningEmptyDescription:
            'Add a service or a sellable SKU before setting the sales priority order.',
          planningEmptyAction: 'Open catalog',
          inventoryColumnItem: 'Item',
          inventoryColumnStatus: 'Status',
          inventoryColumnSellable: 'Sellable units',
          inventoryColumnLinkedSkus: 'Linked SKUs',
          inventoryColumnValue: 'Stock value',
          inventoryPotentialRevenue: 'Potential revenue',
          inventorySoldAsProduct: 'Sellable',
          inventoryNotSoldAsProduct: 'Internal only',
          inventoryNoResultsDescription: 'Try another query or add a new SKU.',
          catalogNoResultsTitle: 'No matching catalog items',
          catalogNoResultsDescription: 'Try clearing the current filters or create a new item that fits this search.',
          catalogNoResultsClearAction: 'Clear filters',
          catalogNoResultsCreateAction: 'Create new SKU',
          catalogEmptyTitle: 'Start the catalog',
          catalogEmptyDescription: 'Create the first SKU or service so the desktop catalog has something to browse and compare.',
          catalogEmptyPrimaryAction: 'Create first SKU',
          catalogAllSkusDescription:
            'Preview the first SKU matches here, then switch into the dedicated SKU comparison table.',
          catalogAllServicesDescription:
            'Preview the first service matches here, then switch into the dedicated service comparison table.',
          catalogServicesDescription: 'Service bundle copy',
          catalogSkusDescription: 'SKU copy',
          catalogDaysOfCover: 'Days of cover',
          catalogStockoutRisk: 'Stockout risk',
          catalogLeadTime: 'Lead time',
          catalogConfidence: 'Confidence',
          catalogSkuDetailTitle: 'SKU detail',
          catalogServiceDetailTitle: 'Service detail',
          catalogServiceDetailNotFoundTitle: 'Service not found',
          catalogServiceDetailNotFoundDescription:
            'This service is no longer in the current snapshot. Return to the catalog to choose another record.',
          catalogSkuDetailOverviewTitle: 'SKU overview',
          catalogSkuDetailOverviewDescription:
            'See the stock, cost, and sellability profile for this SKU before editing it.',
          catalogServiceDetailOverviewTitle: 'Service overview',
          catalogServiceDetailOverviewDescription:
            'Review price, sellable coverage, and current availability for this service.',
          catalogServiceDetailIdentityDescription:
            'Use this record to review service setup, fulfillment coverage, and the latest relevant operations activity.',
          catalogServiceEditAction: 'Edit service',
          catalogServiceOperationsAction: 'Review this service in session',
          catalogServiceCommercialSetupTitle: 'Commercial setup',
          catalogServiceCommercialSetupDescription:
            'Keep the selling price and linked SKU footprint clear before opening the editor.',
          catalogServiceFulfillmentTitle: 'Fulfillment coverage',
          catalogServiceFulfillmentDescription:
            'Derived coverage combines linked SKU stock and planning risk to show whether this service is blocked or at risk.',
          catalogServiceFulfillmentStatusTitle: 'Fulfillment status',
          catalogServiceFulfillmentReady: 'Fulfillable',
          catalogServiceSellableUnits: 'Sellable units',
          catalogServiceConstraintHealthy: 'All linked SKUs currently healthy.',
          catalogServiceConstraintUnlinked: 'No linked SKUs are attached to this service yet.',
          catalogServiceConstraintBlockedPrefix: 'Limited by',
          catalogServiceConstraintRiskPrefix: 'Risk signaled on',
          catalogServiceViabilityTitle: 'Service viability',
          catalogServiceCurrentStatusTitle: 'Current status',
          catalogServiceLimitingSkuTitle: 'Limiting SKU',
          catalogServiceLimitingSkuHealthy: 'None',
          catalogServiceBlockedState: 'Blocked',
          catalogServiceAtRiskState: 'At risk',
          catalogServiceCoverageStateTitle: 'Coverage state',
          catalogServiceCoverageStateAvailable: 'Ready to sell from current linked stock.',
          catalogServiceCoverageStateBlocked: 'Blocked because at least one linked SKU is out of stock.',
          catalogServiceCoverageStateAtRisk:
            'At risk because a linked SKU has a current high-risk planning signal.',
          catalogLinkedServicesTitle: 'Service impact',
          catalogLinkedServicesDescription:
            'These services currently depend on this SKU, so changes here affect their fulfillability.',
          catalogLinkedServicesEmpty: 'No services currently depend on this SKU.',
          catalogLinkedServicesAffectedSingular: 'affected service',
          catalogLinkedServicesAffectedPlural: 'affected services',
          catalogLinkedServicesLimiting: 'Limiting component',
          catalogLinkedServicesSellableUnits: 'Service sellable units',
          catalogSkuPlanningSignalsTitle: 'Planning signals',
          catalogSkuPlanningSignalsDescription:
            'Use the current planning snapshot to understand reorder pressure before editing.',
          catalogSkuPlanningActionTitle: 'Recommended action',
          catalogSkuPlanningActionSteady: 'No immediate action needed',
          catalogSkuPlanningActionPressure: 'Reorder pressure is rising',
          catalogSkuPlanningActionLowConfidence: 'Coverage is strong, but confidence is low',
          catalogSkuPlanningActionRisk: 'Coverage is at risk',
          catalogSkuPlanningMetricsTitle: 'Supporting metrics',
          catalogSkuPlanningSignalsEmpty: 'No planning signals are available for this SKU yet.',
          catalogSkuDetailLoaderTitle: 'SIST detail',
          catalogSkuDetailLoaderDescription:
            'Load the richer SIST detail when it is available without making it a requirement for this page.',
          catalogSkuDetailLoaderLoading: 'Loading richer SIST detail…',
          catalogSkuDetailLoaderFallback: 'Richer SIST detail is not available right now.',
          catalogSkuDetailReports: 'Supporting reports',
          catalogSkuDetailPosteriorUnits: 'Posterior units',
          catalogSkuDetailDemandPerDay: 'Expected demand/day',
          catalogServiceLinkedSkusTitle: 'Linked SKUs',
          catalogServiceLinkedSkusDescription:
            'These SKUs determine how many units of this service can be sold.',
          catalogServiceLinkedSkusEmpty: 'No SKUs are linked to this service yet.',
          catalogServiceLinkedSkuStatusLabel: 'Status',
          catalogServiceLinkedSkuHealthyBadge: 'Healthy',
          catalogServiceLinkedSkuRiskBadge: 'High risk',
          catalogServiceLinkedSkuBlockedBadge: 'Blocked',
          catalogServiceLinkedSkuBottleneckBadge: 'Bottleneck',
          catalogServiceAvailabilityTitle: 'Availability',
          catalogServiceAvailabilityAvailable: 'Available',
          catalogServiceAvailabilityStockout: 'Stockout',
          catalogServiceAvailabilityUnlinked: 'Unlinked',
          catalogServiceRecentActivityTitle: 'Recent activity',
          catalogServiceRecentActivityDescription:
            'Recent stock reports that mention this service help explain price changes, service stockouts, or ranking movement.',
          catalogServiceRecentActivityEmpty: 'No recent service-related updates were found.',
          catalogServiceRecentActivityFallback:
            'Recent service activity could not be loaded right now. The rest of the service page is still available.',
          catalogServiceRecentActivityFlaggedUnavailable: 'Service flagged unavailable',
          catalogServiceRecentActivityPriceOverride: 'Price override recorded',
          catalogServiceRecentActivityLinkedSkuChange: 'Linked SKU change affecting coverage',
          catalogServiceRecentActivityRanking: 'Priority ranking updated',
          catalogServiceEditorTitleNew: 'New service',
          catalogServiceEditorTitleEdit: 'Edit service',
          catalogServiceEditorDescriptionNew:
            'Create a new service record, then land on its detail page for follow-up fulfillment and operations review.',
          catalogServiceEditorDescriptionEdit:
            'Update the service name, price, description, and linked SKUs.',
          catalogServiceEditorIdentifierDescription:
            'The identifier is fixed for this service.',
          settingsTitle: 'Settings',
          settingsBody: 'Settings body',
          settingsWorkspacePreferencesTitle: 'Workspace preferences',
          settingsWorkspacePreferencesDescription: 'Workspace preferences copy',
          settingsAdvancedTitle: 'Advanced settings',
          settingsAdvancedDescription: 'Advanced model copy',
          settingsAdvancedShow: 'Show advanced settings',
          settingsAdvancedHide: 'Hide advanced settings',
          settingsAdvancedUnsaved: 'Unsaved',
          settingsAdvancedNeedsAttention: 'Needs attention',
          settingsDirtySummaryPreferences: 'Workspace preferences changed.',
          settingsDirtySummaryAdvanced: 'Advanced model settings changed.',
          settingsDirtySummaryBoth: 'Workspace preferences and advanced model settings changed.',
          settingsResetAction: 'Reset changes',
          settingsPreferencesSaved: 'Workspace preferences saved.',
          settingsAdvancedSaved: 'Advanced model settings saved.',
          settingsSaveSuccess: 'Changes saved.',
          settingsLocalDataTitle: 'Local data',
          settingsLocalDataDescription:
            'Banji stores its raw working data on this device in JSON files. Use CSV export when you want to inspect the data in Excel or Numbers.',
          settingsLocalDataFolderLabel: 'Data folder',
          settingsLocalDataRawFiles: 'Raw files',
          settingsLocalDataRawFormatNote:
            'Raw files use Banji’s internal JSON format. CSV exports are for spreadsheet review.',
          settingsOpenDataFolder: 'Open data folder',
          settingsCopyDataPath: 'Copy data path',
          settingsExportData: 'Export data',
          settingsExportSkusCsv: 'Export SKUs CSV',
          settingsExportServicesCsv: 'Export services CSV',
          settingsExportStockReportsCsv: 'Export stock reports CSV',
          settingsLocalDataCopied: 'Data folder path copied.',
          settingsLocalDataExportSuccessPrefix: 'Exported',
          settingsUnsavedLeavePrompt:
            'You have unsaved settings changes. Leave this page and discard the current draft?',
          planningUnsavedLeavePrompt:
            'You have unsaved ranking changes. Leave this page and discard the current draft?',
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
          settingsTargetServiceLevelTooltip:
            'Sets the reorder-point service target SIST should protect. Higher values reduce stockout risk but usually recommend more stock.',
          settingsForecastHorizonTooltip:
            'Controls how far ahead SIST projects demand and stock risk from the latest report.',
          settingsParticleCountTooltip:
            'Sets how many particle samples SIST uses during inference. Higher counts are steadier but take longer to compute.',
          settingsSmoothingWindowTooltip:
            'Controls how many recent reports SIST emphasizes when smoothing sparse observations and drift.',
          saveDraft: 'Save changes',
          stockChangesTitle: 'Operations',
          stockUpdateBody: 'Capture timestamped stock reports.',
          operationsTitle: 'Operations',
          operationsBody: 'Operations body',
          operationsStartSession: 'Start update session',
          operationsResumeSession: 'Resume update session',
          operationsResumeDetails: 'Resume details',
          operationsResumeObservations: 'Resume SKU observations',
          operationsResumeServices: 'Resume service updates',
          operationsResumeReview: 'Resume review',
          operationsResumeServiceChangeSingular: 'service change',
          operationsResumeServiceChangePlural: 'service changes',
          operationsResumeSummaryQueued: 'queued',
          operationsResumeSummaryEmpty: 'Draft saved on this device',
          operationsSummaryLatestReport: 'Latest report',
          operationsSummarySavedUpdates: 'Saved updates',
          operationsSummaryLatestChangeCount: 'Latest changed rows',
          operationsSummaryNone: 'No saved updates yet',
          operationsHistoryTitle: 'Recent activity',
          operationsHistoryDescription: 'Recent operations activity.',
          operationsHistoryIncludes: 'Includes',
          operationsResultsShowing: 'Showing',
          operationsResultsNoneMatch: 'No reports match',
          operationsReportSingular: 'report',
          operationsReportPlural: 'reports',
          operationsHistorySourceColumn: 'Source',
          operationsHistoryLoading: 'Loading recent activity…',
          operationsHistoryEmptyTitle: 'No saved updates yet',
          operationsHistoryEmptyDescription: 'Start the first update session.',
          operationsHistoryNoResultsTitle: 'No matching updates',
          operationsHistoryNoResultsDescription: 'Try clearing the current search or source filter.',
          operationsSearchLabel: 'Search history',
          operationsSearchPlaceholder: 'Search notes, SKU ids, service names, or item ids…',
          operationsSearchClear: 'Clear filters',
          operationsFilterAll: 'All',
          operationsFilterManual: 'Manual',
          operationsFilterImported: 'Imported',
          operationsFilterBaseline: 'Baseline',
          operationsInspectAction: 'Inspect',
          operationsInspectHide: 'Hide',
          stockUpdateHint: 'Only rows you edit become part of the report.',
          stockTableTitle: 'Report observations',
          stockHistoryTitle: 'Recent activity',
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
          stockAddUpdate: 'Start update session',
          stockComposerTitle: 'New update session',
          stockComposerDescription: 'Composer copy',
          stockComposerCancel: 'Cancel session',
          stockMerchandisingTitle: 'Ranking of Items Sold',
          stockMerchandisingDescription: 'Ranking copy',
          stockSessionEyebrow: 'Operations session',
          stockSessionTitle: 'Review and submit one operations update',
          stockSessionDescription:
            'Timestamp the update, capture at least one SKU observation, optionally add service changes, and submit from the final review.',
          stockSessionProgress: 'sections ready',
          stockSessionIncomplete: 'Session incomplete',
          stockSessionReady: 'Ready to submit',
          stockSessionStepLabel: 'Step',
          stockSessionStepDetails: 'Details',
          stockSessionStepDetailsDescription:
            'Set the report timestamp and any context your team should keep.',
          stockSessionStepObservations: 'SKU observations',
          stockSessionStepObservationsDescription:
            'Capture the SKU changes that belong in this update.',
          stockSessionStepServices: 'Service updates',
          stockSessionStepServicesDescription:
            'Mark service stockouts and any price changes for the session.',
          stockSessionStepReview: 'Review & submit',
          stockSessionStepReviewDescription:
            'Confirm the required details and submit from here.',
          stockSessionStepRequired:
            'Complete the required sections before submitting this update.',
          stockSessionBack: 'Back',
          stockSessionNext: 'Next',
          stockSessionSubmit: 'Submit update',
          stockSessionDiscardPrompt:
            'You have an in-progress operations update. Leave this page and discard the current draft?',
          stockOptionalBadge: 'Optional',
          stockStepStatusRequired: 'Required',
          stockStepStatusOptional: 'Optional',
          stockStepStatusComplete: 'Complete',
          stockStepStatusSkipped: 'Skipped',
          stockStepStatusNeedsAttention: 'Needs attention',
          stockSessionNotesOptional: 'Notes are optional and only saved when they are non-empty.',
          stockSessionServicesOptionalDescription:
            'Skip this section when there are no service stockouts or service price changes to capture.',
          stockServiceSummaryEmpty:
            'No service stockouts or override prices are queued right now. Skip this section unless something needs review.',
          stockServiceSummaryChangedPreview:
            'Service changes are queued. Review them if you need to confirm the affected services before submit.',
          stockServiceReviewAction: 'Review service updates',
          stockServiceClearAction: 'Clear service changes',
          stockServiceDoneAction: 'Done reviewing',
          stockServiceFilterChanged: 'Changed only',
          stockServiceFilterAll: 'All services',
          stockServiceCurrentPriceColumn: 'Current price',
          stockServiceStockoutColumn: 'Stockout',
          stockServiceOverridePriceColumn: 'Override price',
          stockObservationsChangedSummaryReady: 'Changed rows are ready for review and submit.',
          stockObservationsChangedSummaryEmpty: 'Edit at least one row to create a valid report.',
          stockObservationsFilterAll: 'All rows',
          stockObservationsFilterChanged: 'Changed rows',
          stockObservationsFilterEmpty: 'No rows have changed yet.',
          stockObservationsSearchLabel: 'Search SKU rows',
          stockObservationsSearchPlaceholder: 'Search SKU name or id…',
          stockObservationsSearchResultSingular: 'matching row',
          stockObservationsSearchResultPlural: 'matching rows',
          stockObservationsSearchEmpty: 'No SKU rows match the current search.',
          stockObservationsChangedBadge: 'Changed',
          stockFocusedBadge: 'Focused',
          stockFocusSkuHint: 'Opened from SKU detail',
          stockFocusServiceHint: 'Opened from service detail',
          stockSummaryTitle: 'Pending change set',
          stockReviewTitle: 'Review & submit',
          stockReviewDescription:
            'Confirm the timestamp, changed SKU rows, optional service updates, planning context, and notes before saving.',
          stockReviewMissingTimestamp: 'Add a valid timestamp before submitting.',
          stockReviewNoNotes: 'No notes will be included with this update.',
          stockReviewNoServiceChanges: 'No optional service updates will be sent with this report.',
          stockReviewServiceSummaryDetailed: 'service review summary',
          stockReviewServiceSummarySingular: 'service change ready to submit',
          stockReviewServiceSummaryPlural: 'service changes ready to submit',
          stockReviewPlanningTitle: 'Planning context',
          stockReviewPlanningDescription:
            'Ranking changes now live in Planning. Review the current ordering there if this operations update changes merchandising priorities.',
          stockReviewOpenPlanning: 'Open planning',
          stockReviewPlanningEntrySingular: 'ranking entry in the current planning order',
          stockReviewPlanningEntryPlural: 'ranking entries in the current planning order',
          stockUpdatesReady: 'Rows ready to report',
          stockEditAction: 'Return to editing',
          stockPresetSmall: 'Fine',
          stockPresetMedium: 'Standard',
          stockPresetBig: 'Bulk',
          stockIncrementSize: 'Increment size',
          stockConfirm: 'Review changes',
          stockDone: 'Save update',
          stockPhaseEditing: 'Editing',
          stockPhaseReview: 'Review',
          validationStockChanges: 'Change at least one SKU before saving.',
          validationTimestamp: 'Enter a valid report timestamp.',
          stockReportedAt: 'Reported at',
          stockReportNotes: 'Report notes',
          stockObservationRowNotesLabel: 'SKU notes',
          stockObservationRowNotesPlaceholder: 'Capture any row-specific exception or context.',
          stockRestockIncluded: 'Restock included',
          stockRetailStockout: 'Retail stockout',
          stockServiceSignalsTitle: 'Service stockout flags',
          stockServiceStockoutToggle: 'Flag stockout',
          stockServicePriceHint: 'Current price',
          stockServiceSummaryFlagSingular: 'service flag',
          stockServiceSummaryFlagPlural: 'service flags',
          stockServiceSummaryPriceSingular: 'price edit',
          stockServiceSummaryPricePlural: 'price edits',
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
    getLocalDataInfo.mockResolvedValue({
      dataDirectoryPath: '/tmp/banji-data',
      inventoryStorePath: '/tmp/banji-data/desktop-inventory-store.json',
      preferencesPath: '/tmp/banji-data/desktop-preferences.json',
      storageFormat: 'json',
    });
    openLocalDataFolder.mockResolvedValue(undefined);
    exportSkusCsv.mockResolvedValue({ path: '/tmp/banji-skus.csv' });
    exportServicesCsv.mockResolvedValue({ path: '/tmp/banji-services.csv' });
    exportStockReportsCsv.mockResolvedValue({ path: '/tmp/banji-stock-reports.csv' });
    window.banjiDesktop = {
      ...window.banjiDesktop,
      system: {
        ...window.banjiDesktop?.system,
        getAppContext: vi.fn(),
        getLocalDataInfo,
        openLocalDataFolder,
        exportSkusCsv,
        exportServicesCsv,
        exportStockReportsCsv,
      },
    };
    Object.assign(navigator, {
      clipboard: {
        writeText: vi.fn().mockResolvedValue(undefined),
      },
    });
  });

  test.each([
    ['/inventory', '/catalog'],
    ['/inventory/skus/new', '/catalog/skus/new'],
    ['/inventory/skus/sku-1', '/catalog/skus/sku-1/edit'],
    ['/inventory/services/new', '/catalog/services/new'],
    ['/inventory/services/service-1', '/catalog/services/service-1/edit'],
    ['/inventory/stock', '/operations'],
    ['/inventory/stock/session', '/operations/session'],
    ['/inventory/ranking', '/planning'],
  ])('redirects legacy workspace route %s to %s', (legacyPath, expectedPath) => {
    renderAppRoutes(legacyPath);
    expect(screen.getByTestId('location-pathname').textContent).toBe(expectedPath);
  });

  test('overview renders the new action-first structure without dashboard-only chrome', async () => {
    renderRoute('/', <DashboardRoute />);

    expect(screen.getByText('Overview')).toBeInTheDocument();
    expect(screen.getByText('Needs attention')).toBeInTheDocument();
    expect(screen.getByText('Recent activity')).toBeInTheDocument();
    expect(screen.getByText('Support metrics')).toBeInTheDocument();
    expect(screen.queryByText('Quick actions')).not.toBeInTheDocument();
    expect(screen.queryByText('Local runtime')).not.toBeInTheDocument();
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
    expect(await screen.findByText('Morning floor update.')).toBeInTheDocument();
  });

  test('overview uses add first SKU as the primary action when the catalog is empty', async () => {
    setInventoryState(
      createSnapshot({
        services: [],
        skus: [],
        ranking: [],
        sist: {
          ...snapshot.sist,
          pendingReorderCount: 0,
          highRiskSkuIds: [],
          skuInsights: [],
        },
      }),
    );
    listStockReports.mockResolvedValue([]);

    renderRoute('/', <DashboardRoute />);

    expect(await screen.findAllByRole('link', { name: 'Add first SKU' })).not.toHaveLength(0);
    expect(screen.getAllByRole('link', { name: 'Open catalog' })[0]).toHaveAttribute(
      'href',
      '/catalog',
    );
    expect(screen.queryByRole('link', { name: 'Open planning' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Start update session' })).not.toBeInTheDocument();
  });

  test('overview sends risk-driven snapshots toward planning and shows urgent SKUs', async () => {
    renderRoute('/', <DashboardRoute />);

    expect(screen.getByRole('link', { name: 'Review reorder priorities' })).toHaveAttribute(
      'href',
      '/planning',
    );
    expect(screen.getByText('Current risk summary')).toBeInTheDocument();
    expect(
      screen.getByText((content) => {
        return content.includes('High-risk SKUs') && content.includes('Reorder pressure');
      }),
    ).toBeInTheDocument();
    expect(screen.getByText('SKU #001')).toBeInTheDocument();
    expect(screen.getByText(/Stockout risk: 47%/)).toBeInTheDocument();
    expect(screen.getByText('Urgent')).toBeInTheDocument();
  });

  test('overview shows reorder-pressure urgency even without high-risk sku rows', async () => {
    setInventoryState(
      createSnapshot({
        sist: {
          ...snapshot.sist,
          pendingReorderCount: 2,
          highRiskSkuIds: [],
          skuInsights: snapshot.sist.skuInsights,
        },
      }),
    );

    renderRoute('/', <DashboardRoute />);

    expect(screen.getByRole('link', { name: 'Review reorder priorities' })).toHaveAttribute(
      'href',
      '/planning',
    );
    expect(screen.getByText('Reorder pressure is rising')).toBeInTheDocument();
    expect(
      screen.queryByText('Reorder pressure is rising even though no SKU is in the current top risk list.'),
    ).not.toBeInTheDocument();
    expect(screen.queryByText('No urgent planning signals')).not.toBeInTheDocument();
  });

  test('overview prompts for the first update session when reports have not been captured yet', async () => {
    setInventoryState(
      createSnapshot({
        sist: {
          ...snapshot.sist,
          pendingReorderCount: 0,
          highRiskSkuIds: [],
          skuInsights: [],
        },
      }),
    );
    listStockReports.mockResolvedValue([]);

    renderRoute('/', <DashboardRoute />);

    expect(await screen.findByRole('link', { name: 'Start first update session' })).toHaveAttribute(
      'href',
      '/operations/session',
    );
    expect(screen.getAllByRole('link', { name: 'Open operations' })[0]).toHaveAttribute(
      'href',
      '/operations',
    );
  });

  test('overview keeps the hero as the only primary CTA and removes competing quick actions', async () => {
    renderRoute('/', <DashboardRoute />);

    expect(await screen.findByRole('link', { name: 'Review reorder priorities' })).toHaveAttribute(
      'href',
      '/planning',
    );
    expect(screen.getAllByRole('link', { name: 'Open planning' }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('link', { name: 'Review reorder priorities' })).toHaveLength(1);
    expect(screen.queryByRole('link', { name: 'Start update session' })).not.toBeInTheDocument();
    expect(screen.queryByText('Quick actions')).not.toBeInTheDocument();
  });

  test('overview recent activity renders lightweight report summaries and notes snippets', async () => {
    renderRoute('/', <DashboardRoute />);

    expect(await screen.findByText('Manual update')).toBeInTheDocument();
    expect(
      screen.getByText('1 changed row · 1 service flag · 1 price edit · 3 ranking signals'),
    ).toBeInTheDocument();
    expect(screen.getByText('Morning floor update.')).toBeInTheDocument();
  });

  test('overview recent activity failure is non-blocking and keeps the rest of the page usable', async () => {
    listStockReports.mockRejectedValueOnce(new Error('boom'));

    renderRoute('/', <DashboardRoute />);

    expect(
      await screen.findByText(
        'Recent activity could not be loaded right now. The rest of Overview is still available.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByText('Needs attention')).toBeInTheDocument();
    expect(screen.getByText('Support metrics')).toBeInTheDocument();
  });

  test('overview keeps support metrics as passive summary content below the action sections', async () => {
    renderRoute('/', <DashboardRoute />);

    expect(screen.getByText('Inventory value')).toBeInTheDocument();
    expect(screen.getByText('Sale-ready SKUs')).toBeInTheDocument();
    expect(screen.getByText('Service bundles')).toBeInTheDocument();
    expect(screen.getByText('Latest ranking coverage')).toBeInTheDocument();
    expect(screen.getByText('1 SKUs + 2 services')).toBeInTheDocument();
  });

  test('overview ranking coverage uses the planning baseline when saved ranking is empty', async () => {
    setInventoryState(createSnapshot({ ranking: [] }));

    renderRoute('/', <DashboardRoute />);

    expect(screen.getByText('Latest ranking coverage')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.queryByText(/^0$/)).not.toBeInTheDocument();
  });

  test('catalog keeps q and view in the URL', () => {
    renderInventory('/catalog?q=sku&view=skus');

    expect(screen.getByTestId('location-search').textContent).toBe('?q=sku&view=skus');
    expect(screen.queryByText('SKU copy')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('radio', { name: 'Services' }));

    expect(screen.getByTestId('location-search').textContent).toBe('?q=sku&view=services');
  });

  test('catalog all view shows preview sections without expand or collapse controls', () => {
    renderRoute('/catalog', <InventoryRoute />);

    expect(screen.getByText('2 SKUs and 2 services')).toBeInTheDocument();
    expect(screen.queryByText('Preview the first SKU matches here, then switch into the dedicated SKU comparison table.')).not.toBeInTheDocument();
    expect(screen.queryByText('Preview the first service matches here, then switch into the dedicated service comparison table.')).not.toBeInTheDocument();
    expect(screen.getByText('Direct sell status')).toBeInTheDocument();
    expect(screen.getByText('Status')).toBeInTheDocument();
    expect(screen.queryByText('Days of cover')).not.toBeInTheDocument();
    expect(screen.queryByText('Potential revenue')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Expand' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Collapse' })).not.toBeInTheDocument();
  });

  test('catalog controls show live result context for the current query and view', () => {
    renderInventory('/catalog?q=sku&view=skus');

    expect(screen.getByText('2 SKUs matching for "sku"')).toBeInTheDocument();
  });

  test('catalog dedicated SKU and service views render the correct comparison tables', () => {
    renderInventory('/catalog?view=skus');
    expect(screen.queryByText('SKU copy')).not.toBeInTheDocument();
    expect(screen.getByText('Status')).toBeInTheDocument();
    expect(screen.getByText('Cost per unit')).toBeInTheDocument();
    expect(screen.getByText('Product price')).toBeInTheDocument();
    expect(screen.queryByText('Days of cover')).not.toBeInTheDocument();
    expect(screen.queryByText('Stockout risk')).not.toBeInTheDocument();
    expect(screen.queryByText('Lead time')).not.toBeInTheDocument();
    expect(screen.queryByText('Confidence')).not.toBeInTheDocument();
    expect(screen.queryByText('Service bundle copy')).not.toBeInTheDocument();

    renderInventory('/catalog?view=services');
    expect(screen.queryByText('Service bundle copy')).not.toBeInTheDocument();
    expect(screen.getAllByText('Status').length).toBeGreaterThan(0);
    expect(screen.getAllByText('At risk').length).toBeGreaterThan(0);
    expect(screen.getByText('Potential revenue')).toBeInTheDocument();
  });

  test('planning stays on its own route, shows operations-review context, and saves ranking changes', async () => {
    renderRoute('/planning?source=operations-review', <PlanningRoute />);

    expect(screen.getByTestId('planning-route')).toBeInTheDocument();
    expect(
      screen.getByText(
        'You opened Planning from operations review. Finalize the order here, then return to review.',
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: 'Return to operations review' }),
    ).not.toBeInTheDocument();
    expect(screen.getAllByText('Set sales priority order').length).toBeGreaterThan(0);
    expect(screen.getByText('Decision context')).toBeInTheDocument();
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Set sales priority order help' }));
    expect(screen.getByRole('tooltip')).toHaveTextContent('Why this order matters');
    expect(screen.getByRole('tooltip')).toHaveTextContent('For your team');
    expect(screen.getByRole('tooltip')).toHaveTextContent('For SIST');
    expect(screen.queryByText('Ranking entries')).not.toBeInTheDocument();
    expect(screen.getByText('3 entries in scope')).toBeInTheDocument();
    expect(screen.getByText('Type')).toBeInTheDocument();
    expect(screen.getByText('SKU #001')).toBeInTheDocument();
    expect(screen.getByText('47% stockout risk')).toBeInTheDocument();
    expect(screen.getByText('#1 Service #001')).toBeInTheDocument();
    const actionRail = screen.getByTestId('planning-action-rail');
    expect(screen.queryByRole('link', { name: 'Open catalog' })).not.toBeInTheDocument();
    expect(actionRail).toContainElement(screen.getByRole('button', { name: 'Reset' }));
    expect(actionRail).toContainElement(screen.getByRole('button', { name: 'Save order' }));

    fireEvent.click(screen.getByRole('button', { name: 'Apply ranking change' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save order' }));

    await waitFor(() => {
      expect(persistRanking).toHaveBeenCalledTimes(1);
    });
    expect(persistRanking.mock.calls[0][0]).toMatchObject([
      { entryType: 'service', entryId: 'service-2', position: 0 },
      { entryType: 'service', entryId: 'service-1', position: 1 },
      { entryType: 'sku', entryId: 'sku-1', position: 2 },
    ]);
  });

  test('planning uses baseline rankable entries for scope counts even when saved ranking is empty', () => {
    setInventoryState(createSnapshot({ ranking: [] }));

    renderRoute('/planning', <PlanningRoute />);

    expect(screen.getByText('3 entries in scope')).toBeInTheDocument();
    expect(screen.getByText('Ranking of Items Sold')).toBeInTheDocument();
    expect(screen.queryByText('0 entries in scope')).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Return to operations review' })).not.toBeInTheDocument();
  });

  test('planning shows an empty state with catalog CTA when nothing is rankable', () => {
    setInventoryState(
      createSnapshot({
        services: [],
        skus: snapshot.skus.map((sku) => ({ ...sku, soldAsProduct: false })),
        ranking: [],
      }),
    );

    renderRoute('/planning', <PlanningRoute />);

    expect(screen.getByText('Planning needs rankable items')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open catalog' })).toHaveAttribute('href', '/catalog');
    expect(screen.queryByText('Ranking of Items Sold')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Save order' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Reset' })).not.toBeInTheDocument();
  });

  test('planning returns to operations review only when an operations draft exists', async () => {
    render(
      <OperationsSessionProvider>
        <MemoryRouter initialEntries={['/operations/session?step=review']}>
          <Routes>
            <Route element={<StockUpdateSessionRoute />} path="/operations/session" />
            <Route
              element={
                <>
                  <PlanningRoute />
                  <LocationProbe />
                </>
              }
              path="/planning"
            />
          </Routes>
        </MemoryRouter>
      </OperationsSessionProvider>,
    );

    expect(await screen.findByRole('link', { name: 'Open planning' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('link', { name: 'Open planning' }));

    expect(await screen.findByRole('link', { name: 'Return to operations review' })).toHaveAttribute(
      'href',
      '/operations/session?step=review',
    );
    const actionRail = screen.getByTestId('planning-action-rail');
    expect(actionRail).toContainElement(screen.getByRole('link', { name: 'Return to operations review' }));
    expect(actionRail).toContainElement(screen.getByRole('button', { name: 'Reset' }));
    expect(actionRail).toContainElement(screen.getByRole('button', { name: 'Save order' }));
    expect(screen.getByTestId('location-pathname').textContent).toBe('/planning');
    expect(screen.getByTestId('location-search').textContent).toBe('?source=operations-review');
  });

  test('planning confirms before discarding dirty ranking changes when returning to operations review', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm');
    confirmSpy.mockReturnValueOnce(false).mockReturnValueOnce(true);

    render(
      <OperationsSessionProvider>
        <MemoryRouter initialEntries={['/operations/session?step=review']}>
          <Routes>
            <Route
              element={
                <>
                  <StockUpdateSessionRoute />
                  <LocationProbe />
                </>
              }
              path="/operations/session"
            />
            <Route
              element={
                <>
                  <PlanningRoute />
                  <LocationProbe />
                </>
              }
              path="/planning"
            />
          </Routes>
        </MemoryRouter>
      </OperationsSessionProvider>,
    );

    fireEvent.click(await screen.findByRole('link', { name: 'Open planning' }));
    expect(await screen.findByTestId('planning-route')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Apply ranking change' }));
    fireEvent.click(screen.getByRole('link', { name: 'Return to operations review' }));

    expect(confirmSpy).toHaveBeenCalledWith(
      'You have unsaved ranking changes. Leave this page and discard the current draft?',
    );
    expect(screen.getByTestId('location-pathname').textContent).toBe('/planning');

    fireEvent.click(screen.getByRole('link', { name: 'Return to operations review' }));
    expect(await screen.findByText('Review and submit one operations update')).toBeInTheDocument();
    expect(screen.getByTestId('location-pathname').textContent).toBe('/operations/session');
    expect(screen.getByTestId('location-search').textContent).toBe('?step=review');

    confirmSpy.mockRestore();
  });

  test('unknown routes fall back to the canonical overview entrypoint', async () => {
    renderAppRoutes('/does-not-exist');

    await waitFor(() => {
      expect(screen.getByText('Overview')).toBeInTheDocument();
    });
    expect(screen.getByTestId('location-pathname').textContent).toBe('/');
  });

  test('clicking a SKU catalog row opens the detail route instead of an editor', async () => {
    render(
      <MemoryRouter initialEntries={['/catalog?view=skus']}>
        <Routes>
          <Route element={<InventoryRoute />} path="/catalog" />
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
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole('link', { name: /SKU #001/ }));
    await waitFor(() => {
      expect(screen.getByTestId('location-pathname').textContent).toBe('/catalog/skus/sku-1');
    });
  });

  test('clicking a service catalog row opens the detail route instead of an editor', async () => {
    render(
      <MemoryRouter initialEntries={['/catalog?view=services']}>
        <Routes>
          <Route element={<InventoryRoute />} path="/catalog" />
          <Route
            element={
              <>
                <ServiceDetailRoute />
                <LocationProbe />
              </>
            }
            path="/catalog/services/:serviceId"
          />
        </Routes>
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole('link', { name: /Service #001/ }));
    await waitFor(() => {
      expect(screen.getByTestId('location-pathname').textContent).toBe('/catalog/services/service-1');
    });
  });

  test('sku detail shows linked services and planning data', async () => {
    render(
      <MemoryRouter initialEntries={['/catalog/skus/sku-1']}>
        <Routes>
          <Route element={<SkuDetailRoute />} path="/catalog/skus/:skuId" />
        </Routes>
      </MemoryRouter>,
    );

    expect(loadSistSkuDetail).toHaveBeenCalledTimes(1);
    expect(loadSistSkuDetail).toHaveBeenCalledWith('sku-1');
    expect(screen.getByText('Identifier: sku-1')).toBeInTheDocument();
    expect(screen.getByText('Likely stockout in 4.2 days')).toBeInTheDocument();
    expect(screen.getAllByText('At risk').length).toBeGreaterThan(0);
    expect(
      screen.getByText('12 on hand · 47% stockout risk · Medium confidence · 1 affected service'),
    ).toBeInTheDocument();
    expect(screen.queryByText('SKU overview')).not.toBeInTheDocument();
    expect(screen.getByText('Stock rail')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Overview' })).toHaveAttribute('data-state', 'active');
    expect(screen.getByRole('tab', { name: 'Forecast' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Parameters' })).toBeInTheDocument();
    expect(screen.getByLabelText('SKU forecast chart')).toBeInTheDocument();
    expect(screen.getByText('Affected services')).toBeInTheDocument();
    expect(screen.getAllByText('Service #001').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Limiting component').length).toBeGreaterThan(0);
    const impactedServiceRow = screen.getByRole('link', { name: /Service #001/ });
    expect(impactedServiceRow).toHaveTextContent('Sellable units: 12');
    expect(screen.queryByText('Recommended action')).not.toBeInTheDocument();
    expect(screen.getByText('Next move')).toBeInTheDocument();
    expect(screen.getByText('Order now')).toBeInTheDocument();
    expect(screen.queryByText('Supporting metrics')).not.toBeInTheDocument();
    expect(await screen.findByText('Recent changes')).toBeInTheDocument();
    expect(screen.getAllByText(/What changed/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Restock included/).length).toBeGreaterThan(0);
    expect(screen.getByText('Morning floor update.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Record stock update' })).toHaveAttribute(
      'href',
      '/operations/session?step=observations&focusSku=sku-1',
    );
    expect(screen.getByRole('link', { name: 'Back to catalog' })).toHaveAttribute(
      'data-variant',
      'ghost',
    );
    expect(screen.getByRole('link', { name: 'Record stock update' })).toHaveAttribute(
      'data-variant',
      'default',
    );
    expect(screen.getByRole('link', { name: 'Edit SKU' })).toHaveAttribute(
      'data-variant',
      'outline',
    );
  });

  test('sku detail keeps the page usable when detail loading fails', async () => {
    loadSistSkuDetail.mockRejectedValueOnce(new Error('boom'));

    render(
      <MemoryRouter initialEntries={['/catalog/skus/sku-1']}>
        <Routes>
          <Route element={<SkuDetailRoute />} path="/catalog/skus/:skuId" />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByText('Detailed planning context could not be loaded. Showing the latest snapshot values instead.')).toBeInTheDocument();
    expect(screen.getByText('Recent report history could not be loaded right now. The rest of the SKU page is still available.')).toBeInTheDocument();
    expect(screen.getByText('Likely stockout in 4.2 days')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Overview' })).toBeInTheDocument();
    expect(screen.getAllByText('SKU #001').length).toBeGreaterThan(0);
  });

  test('unknown SKU id shows a not-found state with a catalog CTA', () => {
    render(
      <MemoryRouter initialEntries={['/catalog/skus/missing-sku']}>
        <Routes>
          <Route element={<SkuDetailRoute />} path="/catalog/skus/:skuId" />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByText('SKU not found')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to catalog' })).toHaveAttribute('href', '/catalog');
  });

  test('service detail shows identifier, linked SKU coverage, and relevant recent activity', async () => {
    render(
      <MemoryRouter initialEntries={['/catalog/services/service-1']}>
        <Routes>
          <Route element={<ServiceDetailRoute />} path="/catalog/services/:serviceId" />
        </Routes>
      </MemoryRouter>,
    );

    expect(listStockReports).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Identifier: service-1')).toBeInTheDocument();
    expect(screen.queryByText('Commercial setup')).not.toBeInTheDocument();
    expect(screen.getByText('Fulfillment status')).toBeInTheDocument();
    expect(screen.queryByText('Availability')).not.toBeInTheDocument();
    expect(screen.queryByText('Coverage state')).not.toBeInTheDocument();
    expect(screen.queryByText('Stockout risk')).not.toBeInTheDocument();
    expect(screen.getByText('Service viability')).toBeInTheDocument();
    expect(screen.getByText('Risk signaled on sku-1.')).toBeInTheDocument();
    const viabilityBlock = screen.getByText('Service viability').closest('div');
    expect(viabilityBlock).not.toBeNull();
    expect(viabilityBlock).toHaveTextContent('Limiting SKU');
    expect(viabilityBlock).toHaveTextContent('sku-1');
    expect(screen.getAllByText('Linked SKUs').length).toBeGreaterThan(0);
    expect(screen.getAllByText('SKU #001').length).toBeGreaterThan(0);
    const linkedSkuRow = screen.getByRole('link', { name: /SKU #001/ });
    expect(linkedSkuRow).toHaveTextContent('Units in stock: 12');
    expect(linkedSkuRow).toHaveAttribute(
      'href',
      '/catalog/skus/sku-1',
    );
    expect(screen.getAllByText('At risk').length).toBeGreaterThan(0);
    expect(screen.getAllByText('12').length).toBeGreaterThan(0);
    expect(await screen.findByText('Recent activity')).toBeInTheDocument();
    expect(
      screen.getByText(
        'Service flagged unavailable · Linked SKU change affecting coverage (sku-1) · Priority ranking updated',
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Review this service in session' })).toHaveAttribute(
      'href',
      '/operations/session?step=services&focusService=service-1',
    );
    expect(screen.getByRole('link', { name: 'Back to catalog' })).toHaveAttribute(
      'data-variant',
      'ghost',
    );
    expect(screen.getByRole('link', { name: 'Review this service in session' })).toHaveAttribute(
      'data-variant',
      'default',
    );
    expect(screen.getByRole('link', { name: 'Edit service' })).toHaveAttribute(
      'data-variant',
      'outline',
    );
  });

  test('service detail computes blocked and at-risk fulfillment states from linked SKUs', async () => {
    setInventoryState(
      createSnapshot({
        skus: [
          {
            ...snapshot.skus[0],
            unitsInStock: 0,
          },
          snapshot.skus[1],
        ],
      }),
    );

    render(
      <MemoryRouter initialEntries={['/catalog/services/service-1']}>
        <Routes>
          <Route element={<ServiceDetailRoute />} path="/catalog/services/:serviceId" />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getAllByText('Blocked').length).toBeGreaterThan(0);
    expect(screen.getByText('Limited by sku-1.')).toBeInTheDocument();
    expect(screen.getByText('Bottleneck')).toBeInTheDocument();

    setInventoryState(
      createSnapshot({
        sist: {
          ...snapshot.sist,
          highRiskSkuIds: ['sku-1'],
        },
      }),
    );

    render(
      <MemoryRouter initialEntries={['/catalog/services/service-1']}>
        <Routes>
          <Route element={<ServiceDetailRoute />} path="/catalog/services/:serviceId" />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getAllByText('At risk').length).toBeGreaterThan(0);
    expect(screen.getByText('Risk signaled on sku-1.')).toBeInTheDocument();
  });

  test('service detail makes edit primary when service setup is incomplete', async () => {
    setInventoryState(
      createSnapshot({
        services: [
          {
            ...snapshot.services[0],
            skuIds: [],
          },
          snapshot.services[1],
        ],
      }),
    );

    render(
      <MemoryRouter initialEntries={['/catalog/services/service-1']}>
        <Routes>
          <Route element={<ServiceDetailRoute />} path="/catalog/services/:serviceId" />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByRole('link', { name: 'Edit service' })).toHaveAttribute(
      'data-variant',
      'default',
    );
    expect(screen.getByRole('link', { name: 'Review this service in session' })).toHaveAttribute(
      'data-variant',
      'outline',
    );
    expect(
      screen.getAllByText('No linked SKUs are attached to this service yet.').length,
    ).toBeGreaterThan(0);
  });

  test('service detail recent activity failure stays scoped to the recent activity section', async () => {
    listStockReports.mockRejectedValueOnce(new Error('boom'));

    render(
      <MemoryRouter initialEntries={['/catalog/services/service-1']}>
        <Routes>
          <Route element={<ServiceDetailRoute />} path="/catalog/services/:serviceId" />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByText('Recent service activity could not be loaded right now. The rest of the service page is still available.')).toBeInTheDocument();
    expect(screen.getAllByText('Service #001').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Linked SKUs').length).toBeGreaterThan(0);
  });

  test('unknown service id shows a not-found state with a catalog CTA', () => {
    render(
      <MemoryRouter initialEntries={['/catalog/services/missing-service']}>
        <Routes>
          <Route element={<ServiceDetailRoute />} path="/catalog/services/:serviceId" />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByText('Service not found')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to catalog' })).toHaveAttribute('href', '/catalog');
  });

  test('detail edit actions open the correct edit routes', () => {
    const skuView = render(
      <MemoryRouter initialEntries={['/catalog/skus/sku-1']}>
        <Routes>
          <Route element={<SkuDetailRoute />} path="/catalog/skus/:skuId" />
          <Route
            element={
              <>
                <SkuFormRoute />
                <LocationProbe />
              </>
            }
            path="/catalog/skus/:skuId/edit"
          />
        </Routes>
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole('link', { name: 'Edit SKU' }));
    expect(screen.getByTestId('location-pathname').textContent).toBe('/catalog/skus/sku-1/edit');
    skuView.unmount();

    render(
      <MemoryRouter initialEntries={['/catalog/services/service-1']}>
        <Routes>
          <Route element={<ServiceDetailRoute />} path="/catalog/services/:serviceId" />
          <Route
            element={
              <>
                <ServiceFormRoute />
                <LocationProbe />
              </>
            }
            path="/catalog/services/:serviceId/edit"
          />
        </Routes>
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole('link', { name: 'Edit service' }));
    expect(screen.getByTestId('location-pathname').textContent).toBe('/catalog/services/service-1/edit');
  });

  test('saving an existing SKU returns to its detail page', async () => {
    render(
      <MemoryRouter initialEntries={['/catalog/skus/sku-1/edit']}>
        <Routes>
          <Route
            element={
              <>
                <SkuFormRoute />
                <LocationProbe />
              </>
            }
            path="/catalog/skus/:skuId/edit"
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
      </MemoryRouter>,
    );

    expect(screen.getByRole('button', { name: 'Save changes' })).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'SKU #001 updated' } });
    fireEvent.click(screen.getByText('Save changes'));

    await waitFor(() => {
      expect(saveSku).toHaveBeenCalledTimes(1);
      expect(screen.getAllByTestId('location-pathname')[0].textContent).toBe('/catalog/skus/sku-1');
    });
    expect(screen.getAllByText('SKU #001').length).toBeGreaterThan(0);
  });

  test('sku edit route pre-fills current values and keeps the identifier read-only', () => {
    render(
      <MemoryRouter initialEntries={['/catalog/skus/sku-1/edit']}>
        <Routes>
          <Route element={<SkuFormRoute />} path="/catalog/skus/:skuId/edit" />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByDisplayValue('SKU #001')).toBeInTheDocument();
    expect(screen.getByDisplayValue('First sku')).toBeInTheDocument();
    expect(screen.getByText('SKU details')).toBeInTheDocument();
    expect(screen.getByText('Stock and selling')).toBeInTheDocument();
    expect(screen.queryByText('Commercial setup')).not.toBeInTheDocument();
    expect(screen.getByText('Identifier')).toBeInTheDocument();
    expect(screen.getByText('sku-1')).toBeInTheDocument();
    expect(screen.getByText('Planning inputs')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Show inputs' })).toBeInTheDocument();
    expect(screen.queryByLabelText('Lead time mean (days)')).not.toBeInTheDocument();
  });

  test('saving a new SKU lands on the new detail page and cancel returns to catalog', async () => {
    const createView = render(
      <MemoryRouter initialEntries={['/catalog/skus/new']}>
        <Routes>
          <Route
            element={
              <>
                <SkuFormRoute />
                <LocationProbe />
              </>
            }
            path="/catalog/skus/new"
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
          <Route
            element={
              <>
                <InventoryRoute />
                <LocationProbe />
              </>
            }
            path="/catalog"
          />
        </Routes>
      </MemoryRouter>,
    );

    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Fresh SKU' } });
    fireEvent.change(screen.getByLabelText('Description'), { target: { value: 'New item' } });
    fireEvent.click(screen.getByText('Create entry'));

    await waitFor(() => {
      expect(saveSku).toHaveBeenCalledTimes(1);
    });
    expect(screen.getByTestId('location-pathname').textContent).toMatch(/^\/catalog\/skus\/sku-/);
    createView.unmount();

    render(
      <MemoryRouter initialEntries={['/catalog/skus/new']}>
        <Routes>
          <Route
            element={
              <>
                <SkuFormRoute />
                <LocationProbe />
              </>
            }
            path="/catalog/skus/new"
          />
          <Route
            element={
              <>
                <InventoryRoute />
                <LocationProbe />
              </>
            }
            path="/catalog"
          />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByText('Cancel')).toBeDisabled();
    expect(screen.getByText('Create entry')).toBeDisabled();
    expect(screen.getByTestId('location-pathname').textContent).toBe('/catalog/skus/new');
  });

  test('cancel from existing SKU edit returns to detail and respects the unsaved-change guard', () => {
    const confirmSpy = vi.spyOn(window, 'confirm');
    confirmSpy.mockReturnValueOnce(false).mockReturnValueOnce(true);

    render(
      <MemoryRouter initialEntries={['/catalog/skus/sku-1/edit']}>
        <Routes>
          <Route
            element={
              <>
                <SkuFormRoute />
                <LocationProbe />
              </>
            }
            path="/catalog/skus/:skuId/edit"
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
      </MemoryRouter>,
    );

    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Changed name' } });
    fireEvent.click(screen.getByText('Cancel'));
    expect(screen.getByTestId('location-pathname').textContent).toBe('/catalog/skus/sku-1/edit');

    fireEvent.click(screen.getByText('Cancel'));
    expect(screen.getAllByTestId('location-pathname')[0].textContent).toBe('/catalog/skus/sku-1');

    confirmSpy.mockRestore();
  });

  test('saving an existing service returns to its detail page and new cancel returns to catalog', async () => {
    const editView = render(
      <MemoryRouter initialEntries={['/catalog/services/service-1/edit']}>
        <Routes>
          <Route
            element={
              <>
                <ServiceFormRoute />
                <LocationProbe />
              </>
            }
            path="/catalog/services/:serviceId/edit"
          />
          <Route
            element={
              <>
                <ServiceDetailRoute />
                <LocationProbe />
              </>
            }
            path="/catalog/services/:serviceId"
          />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByRole('button', { name: 'Save changes' })).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Service #001 updated' } });
    fireEvent.click(screen.getByText('Save changes'));

    await waitFor(() => {
      expect(saveService).toHaveBeenCalledTimes(1);
      expect(screen.getByTestId('location-pathname').textContent).toBe('/catalog/services/service-1');
    });
    editView.unmount();

    render(
      <MemoryRouter initialEntries={['/catalog/services/new']}>
        <Routes>
          <Route
            element={
              <>
                <ServiceFormRoute />
                <LocationProbe />
              </>
            }
            path="/catalog/services/new"
          />
          <Route
            element={
              <>
                <InventoryRoute />
                <LocationProbe />
              </>
            }
            path="/catalog"
          />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByText('Cancel')).toBeDisabled();
    expect(screen.getByText('Create entry')).toBeDisabled();
    expect(screen.getByTestId('location-pathname').textContent).toBe('/catalog/services/new');
  });

  test('service edit route pre-fills values, keeps identifier compact and read-only, and sorts selected SKUs first', () => {
    render(
      <MemoryRouter initialEntries={['/catalog/services/service-1/edit']}>
        <Routes>
          <Route element={<ServiceFormRoute />} path="/catalog/services/:serviceId/edit" />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByDisplayValue('Service #001')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Main service')).toBeInTheDocument();
    expect(screen.getByText('Service details')).toBeInTheDocument();
    expect(screen.queryByText('Commercial setup')).not.toBeInTheDocument();
    expect(screen.getByText('Identifier: service-1')).toBeInTheDocument();
    expect(screen.queryByText('The identifier is fixed for this service.')).not.toBeInTheDocument();
    expect(screen.queryByText('No changes yet')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeDisabled();
    expect(screen.getByText('1 linked SKUs selected')).toBeInTheDocument();
    expect(screen.getByText('Current sellable coverage')).toBeInTheDocument();
    expect(screen.getByText('12 units')).toBeInTheDocument();
    expect(screen.getByText('Limiting SKU')).toBeInTheDocument();

    expect(screen.getAllByText('SKU #001').length).toBeGreaterThan(0);

    const skuRows = screen.getAllByText(/SKU #00[12]/).map((node) => node.closest('label')).filter(Boolean);
    const sku1Row = skuRows.find((row) => row?.textContent?.includes('SKU #001')) ?? null;
    const sku2Row = skuRows.find((row) => row?.textContent?.includes('SKU #002')) ?? null;
    expect(sku1Row).not.toBeNull();
    expect(sku2Row).not.toBeNull();
    expect(sku1Row?.compareDocumentPosition(sku2Row as Node) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    fireEvent.change(screen.getByLabelText('Search SKU rows'), { target: { value: 'sku-2' } });
    const filteredRows = screen.getAllByText('SKU #002').map((node) => node.closest('label')).filter(Boolean);
    expect(filteredRows.length).toBeGreaterThan(0);
    expect(
      screen
        .getAllByText(/SKU #00[12]/)
        .map((node) => node.closest('label'))
        .filter((row) => row?.textContent?.includes('SKU #001')).length,
    ).toBe(0);

    fireEvent.change(screen.getByLabelText('Search SKU rows'), { target: { value: 'second sku' } });
    const descriptionFilteredRows = screen
      .getAllByText('SKU #002')
      .map((node) => node.closest('label'))
      .filter(Boolean);
    expect(descriptionFilteredRows.length).toBeGreaterThan(0);
    expect(
      screen
        .getAllByText(/SKU #00[12]/)
        .map((node) => node.closest('label'))
        .filter((row) => row?.textContent?.includes('SKU #001')).length,
    ).toBe(0);
  });

  test('service editor keeps validation and unsaved-change guard behavior', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm');
    confirmSpy.mockReturnValueOnce(false).mockReturnValueOnce(true);

    render(
      <MemoryRouter initialEntries={['/catalog/services/service-1/edit']}>
        <Routes>
          <Route
            element={
              <>
                <ServiceFormRoute />
                <LocationProbe />
              </>
            }
            path="/catalog/services/:serviceId/edit"
          />
          <Route
            element={
              <>
                <ServiceDetailRoute />
                <LocationProbe />
              </>
            }
            path="/catalog/services/:serviceId"
          />
        </Routes>
      </MemoryRouter>,
    );

    fireEvent.change(screen.getByLabelText('Service price'), { target: { value: '' } });
    expect(screen.getByText('Cancel')).toBeEnabled();
    expect(screen.getByText('Save changes')).toBeEnabled();
    fireEvent.click(screen.getByText('Save changes'));
    expect(
      screen.getByText((content) =>
        content === 'Enter a non-negative number.' || content === 'validationNonNegative',
      ),
    ).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Changed service' } });
    fireEvent.click(screen.getByText('Cancel'));
    expect(screen.getByTestId('location-pathname').textContent).toBe('/catalog/services/service-1/edit');

    fireEvent.click(screen.getByText('Cancel'));
    expect(screen.getAllByTestId('location-pathname')[0].textContent).toBe('/catalog/services/service-1');

    confirmSpy.mockRestore();
  });

  test('operations defaults to history and keeps the session route separate', async () => {
    renderRoute('/operations', <StockUpdateRoute />);

    expect(await screen.findByText('Operations')).toBeInTheDocument();
    expect(screen.getByText('Recent activity')).toBeInTheDocument();
    expect(screen.getByTestId('operations-history-ledger')).toBeInTheDocument();
    expect(await screen.findByText('Manual update')).toBeInTheDocument();
    expect(screen.getByText('Morning floor update.')).toBeInTheDocument();
    expect(screen.getAllByText('1 changed row').length).toBeGreaterThan(0);
    expect(screen.getByText('Includes SKU #001')).toBeInTheDocument();
    expect(screen.getByText('1 service flag')).toBeInTheDocument();
    expect(screen.getByText('Includes Service #001')).toBeInTheDocument();
    expect(screen.getByText('1 price edit')).toBeInTheDocument();
    expect(screen.getByText('Includes Service #002')).toBeInTheDocument();
    expect(screen.getByText('3 ranking signals')).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: 'Start update session' })[0]).toBeInTheDocument();
    expect(screen.queryByText('Review and submit one operations update')).not.toBeInTheDocument();
  });

  test('operations history uses title case headers and keeps the action header blank', async () => {
    renderRoute('/operations', <StockUpdateRoute />);

    const headerRow = (await screen.findByText('Reported At')).closest('tr');
    expect(headerRow).not.toBeNull();
    expect(within(headerRow as HTMLElement).getByText('Source')).toBeInTheDocument();
    expect(within(headerRow as HTMLElement).getByText('Changed Rows')).toBeInTheDocument();
    expect(within(headerRow as HTMLElement).getByText('Service Flags')).toBeInTheDocument();
    expect(within(headerRow as HTMLElement).getByText('Price Edits')).toBeInTheDocument();
    expect(within(headerRow as HTMLElement).getByText('Ranking Signals')).toBeInTheDocument();
    expect(within(headerRow as HTMLElement).getByText('Report Notes')).toBeInTheDocument();
    expect(within(headerRow as HTMLElement).queryByText('Inspect')).not.toBeInTheDocument();
  });

  test('operations history expands one inspected report at a time', async () => {
    renderRoute('/operations', <StockUpdateRoute />);

    fireEvent.click((await screen.findAllByRole('button', { name: 'Inspect' }))[0]);

    expect(await screen.findByText('Ranking of Items Sold')).toBeInTheDocument();
    expect(screen.getByText('Service price changes')).toBeInTheDocument();
    expect(screen.getByText('Front shelf was restocked.')).toBeInTheDocument();
    expect(screen.getAllByText('Service #001').length).toBeGreaterThan(0);
    expect(screen.getAllByText('SKU #001').length).toBeGreaterThan(0);
    expect(screen.getAllByTestId('operations-history-detail')).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'Hide' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Inspect' }));
    expect(screen.queryByText('Front shelf was restocked.')).not.toBeInTheDocument();
  });

  test('operations history stays newest-first in the ledger', async () => {
    renderRoute('/operations', <StockUpdateRoute />);

    const sourceCells = await screen.findAllByText(/update$|import$/);
    expect(sourceCells[0]).toHaveTextContent('Manual update');
    expect(sourceCells[1]).toHaveTextContent('Baseline import');
  });

  test('operations history search and source filter narrow visible rows', async () => {
    renderRoute('/operations', <StockUpdateRoute />);

    expect(await screen.findByText('Morning floor update.')).toBeInTheDocument();
    expect(screen.getByTestId('operations-history-results-summary')).toHaveTextContent(
      'Showing 2 reports',
    );
    fireEvent.change(screen.getByLabelText('Search history'), { target: { value: 'service-2' } });
    expect(screen.getByText('Morning floor update.')).toBeInTheDocument();
    expect(screen.getByTestId('operations-history-results-summary')).toHaveTextContent(
      'Showing 1 report',
    );

    fireEvent.change(screen.getByLabelText('Search history'), { target: { value: 'does-not-match' } });
    expect(screen.getByText('No matching updates')).toBeInTheDocument();
    expect(screen.getByTestId('operations-history-results-summary')).toHaveTextContent(
      'No reports match "does-not-match"',
    );

    fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }));
    fireEvent.click(screen.getByRole('button', { name: 'Baseline' }));
    expect(screen.queryByText('Morning floor update.')).not.toBeInTheDocument();
    expect(screen.getByTestId('operations-history-results-summary')).toHaveTextContent(
      'Showing 1 baseline report',
    );
  });

  test('start update session navigates from operations into the guided session route', async () => {
    render(
      <OperationsSessionProvider>
        <MemoryRouter initialEntries={['/operations']}>
          <Routes>
            <Route element={<StockUpdateRoute />} path="/operations" />
            <Route
              element={
                <>
                  <StockUpdateSessionRoute />
                  <LocationProbe />
                </>
              }
              path="/operations/session"
            />
          </Routes>
        </MemoryRouter>
      </OperationsSessionProvider>,
    );

    fireEvent.click((await screen.findAllByRole('link', { name: 'Start update session' }))[0]);

    expect(await screen.findByText('Review and submit one operations update')).toBeInTheDocument();
    expect(screen.getByTestId('location-pathname').textContent).toBe('/operations/session');
  });

  test('operations draft survives planning handoff and resume restores the last session step', async () => {
    render(
      <OperationsSessionProvider>
        <MemoryRouter initialEntries={['/operations/session?step=review']}>
          <Link to="/operations">Go to operations</Link>
          <Routes>
            <Route
              element={
                <>
                  <StockUpdateSessionRoute />
                  <LocationProbe />
                </>
              }
              path="/operations/session"
            />
            <Route
              element={
                <>
                  <StockUpdateRoute />
                  <LocationProbe />
                </>
              }
              path="/operations"
            />
            <Route
              element={
                <>
                  <PlanningRoute />
                  <LocationProbe />
                </>
              }
              path="/planning"
            />
          </Routes>
        </MemoryRouter>
      </OperationsSessionProvider>,
    );

    expect(await screen.findByText('Review and submit one operations update')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Step 1.*Details/i }));
    fireEvent.change(screen.getByLabelText('Reported at'), {
      target: { value: '2026-03-28T10:30' },
    });
    fireEvent.change(screen.getByLabelText('Report notes'), {
      target: { value: 'Shelf check and counter recount.' },
    });

    fireEvent.click(screen.getByRole('button', { name: /Step 2.*SKU observations/i }));
    fireEvent.click(screen.getAllByRole('button', { name: '+' })[0]);
    fireEvent.change(screen.getByLabelText('SKU notes', { selector: '#sku-note-sku-1' }), {
      target: { value: 'Front shelf was restocked.' },
    });
    fireEvent.click(screen.getByRole('radio', { name: 'Changed rows' }));

    fireEvent.click(screen.getByRole('button', { name: /Step 3.*Service updates/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Review service updates' }));
    fireEvent.click(screen.getAllByRole('checkbox')[0]);
    fireEvent.change(screen.getAllByLabelText('Service price')[0], {
      target: { value: '1400' },
    });

    fireEvent.click(screen.getByRole('button', { name: /Step 4.*Review & submit/i }));
    fireEvent.click(screen.getByRole('link', { name: 'Open planning' }));

    expect(await screen.findByRole('link', { name: 'Return to operations review' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('link', { name: 'Return to operations review' }));

    expect(await screen.findByText('Review and submit one operations update')).toBeInTheDocument();
    expect(screen.getByTestId('location-search').textContent).toBe('?step=review');

    fireEvent.click(screen.getByRole('button', { name: /Step 1.*Details/i }));
    expect(screen.getByLabelText('Reported at')).toHaveValue('2026-03-28T10:30');
    expect(screen.getByLabelText('Report notes')).toHaveValue('Shelf check and counter recount.');

    fireEvent.click(screen.getByRole('button', { name: /Step 2.*SKU observations/i }));
    expect(screen.getByRole('radio', { name: 'Changed rows' })).toHaveAttribute('data-state', 'on');
    expect(screen.getByDisplayValue('13')).toBeInTheDocument();
    expect(screen.getByLabelText('SKU notes', { selector: '#sku-note-sku-1' })).toHaveValue(
      'Front shelf was restocked.',
    );

    fireEvent.click(screen.getByRole('button', { name: /Step 3.*Service updates/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Review service updates' }));
    expect(screen.getAllByRole('checkbox')[0]).toBeChecked();
    expect(screen.getAllByLabelText('Service price')[0]).toHaveValue('1400');

    fireEvent.click(screen.getByRole('link', { name: 'Go to operations' }));
    expect(await screen.findByRole('link', { name: 'Resume update session' })).toHaveAttribute(
      'href',
      '/operations/session',
    );
    expect(screen.getByTestId('operations-draft-status')).toHaveTextContent(
      'Resume service updates. 1 changed row • 1 service change queued',
    );

    fireEvent.click(screen.getByRole('link', { name: 'Resume update session' }));
    expect(await screen.findByText('Service #001')).toBeInTheDocument();
    expect(screen.getByTestId('location-search').textContent).toBe('');
  });

  test('operations session shows details, observations, optional services, and review', async () => {
    renderRoute('/operations/session', <StockUpdateSessionRoute />);

    expect(await screen.findByRole('button', { name: /Step 1.*Details/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Step 2.*SKU observations/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Step 3.*Service updates/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Step 4.*Review & submit/i })).toBeInTheDocument();
    expect(screen.getAllByText('Needs attention').length).toBeGreaterThan(0);
    expect(screen.getByText('Required')).toBeInTheDocument();
    expect(screen.getByText('Skipped')).toBeInTheDocument();
    expect(screen.getByText('1 / 4 sections ready')).toBeInTheDocument();
    expect(screen.getByTestId('stock-session-step-icon-services')).toHaveAttribute(
      'data-status',
      'skipped',
    );
    expect(screen.getByRole('button', { name: 'Next' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Back' })).not.toBeInTheDocument();
  });

  test('operations session requires at least one SKU observation before review can progress', async () => {
    renderRoute('/operations/session', <StockUpdateSessionRoute />);

    expect(await screen.findByText('Review and submit one operations update')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Submit update' })).not.toBeInTheDocument();
  });

  test('operations session shows timestamp validation in context', async () => {
    renderRoute('/operations/session', <StockUpdateSessionRoute />);

    fireEvent.change(screen.getByLabelText('Reported at'), { target: { value: '' } });
    fireEvent.blur(screen.getByLabelText('Reported at'));
    expect(await screen.findByText('Enter a valid report timestamp.')).toBeInTheDocument();
  });

  test('observations filter shows only changed rows without losing edits', async () => {
    renderRoute('/operations/session?step=observations', <StockUpdateSessionRoute />);

    expect(await screen.findByText('Edit at least one row to create a valid report.')).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole('button', { name: '+' })[0]);

    expect(screen.getByText('Changed rows are ready for review and submit.')).toBeInTheDocument();
    expect(screen.getByText('Changed')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('radio', { name: 'Changed rows' }));
    expect(screen.getByText('SKU #001')).toBeInTheDocument();
    expect(screen.queryByText('SKU #002')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('radio', { name: 'All rows' }));
    expect(screen.getByDisplayValue('13')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Search SKU rows'), { target: { value: 'sku-2' } });
    expect(screen.getByText('1 matching row')).toBeInTheDocument();
    expect(screen.getByText('SKU #002')).toBeInTheDocument();
    expect(screen.queryByText('SKU #001')).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Search SKU rows'), { target: { value: 'missing' } });
    expect(screen.getByText('No SKU rows match the current search.')).toBeInTheDocument();
  });

  test('observations preset dropdown shows increment sizes and changes button step sizes', async () => {
    renderRoute('/operations/session?step=observations', <StockUpdateSessionRoute />);

    const incrementSize = await screen.findByRole('combobox', { name: /Increment size/ });
    expect(incrementSize).toHaveTextContent('Fine');
    expect(incrementSize).not.toHaveTextContent('Units in stock ±1 • Cost per unit ±0.25');

    const sku1Row = screen.getByText('SKU #001').closest('tr');
    expect(sku1Row).not.toBeNull();
    expect(within(sku1Row as HTMLTableRowElement).getByDisplayValue('5.00')).toBeInTheDocument();

    fireEvent.keyDown(incrementSize, { key: 'ArrowDown' });
    const bulkOption = await screen.findByRole('option', { name: /Bulk/i });
    expect(bulkOption).toHaveTextContent('Units in stock ±20 • Cost per unit ±1.00');
    fireEvent.click(bulkOption);

    expect(await screen.findByRole('combobox', { name: /Increment size/ })).toHaveTextContent('Bulk');
    expect(await screen.findByRole('combobox', { name: /Increment size/ })).not.toHaveTextContent(
      'Units in stock ±20 • Cost per unit ±1.00',
    );

    fireEvent.click(within(sku1Row as HTMLTableRowElement).getAllByRole('button', { name: '+' })[0]);
    fireEvent.click(within(sku1Row as HTMLTableRowElement).getAllByRole('button', { name: '+' })[1]);

    expect(within(sku1Row as HTMLTableRowElement).getByDisplayValue('32')).toBeInTheDocument();
    expect(within(sku1Row as HTMLTableRowElement).getByDisplayValue('6.00')).toBeInTheDocument();
  });

  test('observations cost per unit display follows currency rounding without changing submitted precision', async () => {
    preferencesHook.mockReturnValue({
      ...preferencesHook.mock.results.at(-1)?.value,
      currency: 'KHR',
      persistedCurrency: 'KHR',
    });

    renderRoute('/operations/session?step=observations', <StockUpdateSessionRoute />);

    const sku1Row = (await screen.findByText('SKU #001')).closest('tr');
    expect(sku1Row).not.toBeNull();

    const costInput = within(sku1Row as HTMLTableRowElement).getByDisplayValue('5');
    fireEvent.focus(costInput);
    fireEvent.change(costInput, { target: { value: '5.6789' } });
    expect(costInput).toHaveValue('5.6789');

    fireEvent.blur(costInput);
    expect(within(sku1Row as HTMLTableRowElement).getByDisplayValue('6')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Step 4.*Review & submit/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Submit update' }));

    await waitFor(() => {
      expect(submitReport).toHaveBeenCalledWith(
        expect.objectContaining({
          skuObservations: expect.arrayContaining([
            expect.objectContaining({
              skuId: 'sku-1',
              costPerUnit: 5.6789,
            }),
          ]),
        }),
      );
    });
  });

  test('focused sku handoff lands on observations and highlights the requested sku without creating changes', async () => {
    renderRoute('/operations/session?step=observations&focusSku=sku-2', <StockUpdateSessionRoute />);

    expect(await screen.findByText('Opened from SKU detail')).toBeInTheDocument();
    expect(screen.getAllByText('Focused').length).toBeGreaterThan(0);
    expect(screen.getAllByText('SKU #002').length).toBeGreaterThan(0);
    fireEvent.change(screen.getByLabelText('Search SKU rows'), { target: { value: 'sku-1' } });
    expect(screen.getAllByText('SKU #002').length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();
    expect(screen.queryByText('Changed rows are ready for review and submit.')).not.toBeInTheDocument();
  });

  test('invalid focused sku falls back to normal observations rendering', async () => {
    renderRoute('/operations/session?step=observations&focusSku=missing-sku', <StockUpdateSessionRoute />);

    expect(await screen.findByText('Edit at least one row to create a valid report.')).toBeInTheDocument();
    expect(screen.queryByText('Opened from SKU detail')).not.toBeInTheDocument();
    expect(screen.queryByText('Focused')).not.toBeInTheDocument();
  });

  test('service updates stay optional while summarizing stockout and price changes', async () => {
    renderRoute('/operations/session?step=services', <StockUpdateSessionRoute />);

    expect(screen.queryByText('Skip this section when there are no service stockouts or service price changes to capture.')).not.toBeInTheDocument();
    expect(screen.getByText('0 service flags')).toBeInTheDocument();
    expect(screen.getByText('0 price edits')).toBeInTheDocument();
    expect(screen.queryByText('No service stockouts or override prices are queued right now. Skip this section unless something needs review.')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Service price')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Review service updates' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Review service updates' }));
    fireEvent.click(screen.getAllByRole('checkbox')[0]);
    fireEvent.change(screen.getAllByLabelText('Service price')[0], {
      target: { value: '1400' },
    });

    expect(screen.getByText('1 service flag')).toBeInTheDocument();
    expect(screen.getByText('1 price edit')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Changed only' })).toBeInTheDocument();
  });

  test('focused service handoff opens editing mode and highlights the requested service without creating changes', async () => {
    renderRoute('/operations/session?step=services&focusService=service-2', <StockUpdateSessionRoute />);

    expect(await screen.findByText('Opened from service detail')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Done reviewing' })).toBeInTheDocument();
    expect(screen.getAllByText('Focused').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Service #002').length).toBeGreaterThan(0);
    expect(screen.getByText('0 service flags')).toBeInTheDocument();
    expect(screen.getByText('0 price edits')).toBeInTheDocument();
  });

  test('invalid focused service falls back to normal service summary rendering', async () => {
    renderRoute('/operations/session?step=services&focusService=missing-service', <StockUpdateSessionRoute />);

    expect(await screen.findByRole('button', { name: 'Review service updates' })).toBeInTheDocument();
    expect(screen.queryByText('Opened from service detail')).not.toBeInTheDocument();
    expect(screen.queryByText('Focused')).not.toBeInTheDocument();
  });

  test('operations session submits a structured report with changed SKU rows and optional service data only', async () => {
    render(
      <OperationsSessionProvider>
        <MemoryRouter initialEntries={['/operations/session']}>
          <Routes>
            <Route element={<StockUpdateSessionRoute />} path="/operations/session" />
            <Route
              element={
                <>
                  <StockUpdateRoute />
                  <LocationProbe />
                </>
              }
              path="/operations"
            />
          </Routes>
        </MemoryRouter>
      </OperationsSessionProvider>,
    );

    expect(await screen.findByText('Review and submit one operations update')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Step 2.*SKU observations/i }));
    fireEvent.click(screen.getAllByRole('button', { name: '+' })[0]);
    fireEvent.change(screen.getByLabelText('SKU notes', { selector: '#sku-note-sku-1' }), {
      target: { value: 'Front shelf was restocked.' },
    });

    fireEvent.click(screen.getByRole('button', { name: /Step 3.*Service updates/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Review service updates' }));
    fireEvent.change(screen.getAllByLabelText('Service price')[0], {
      target: { value: '1400' },
    });

    fireEvent.click(screen.getByRole('button', { name: /Step 4.*Review & submit/i }));
    expect(screen.getByRole('link', { name: 'Open planning' })).toHaveAttribute(
      'href',
      '/planning?source=operations-review',
    );

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
          notes: 'Front shelf was restocked.',
        }),
      ]),
      servicePriceAdjustments: [{ serviceId: 'service-1', price: 1400 }],
    });
    expect(submitReport.mock.calls[0][0]).not.toHaveProperty('serviceSignals');
    expect(submitReport.mock.calls[0][0]).not.toHaveProperty('topServiceRanking');
    expect(submitReport.mock.calls[0][0]).not.toHaveProperty('topRetailRanking');

    await waitFor(() => {
      expect(screen.getByText('Recent activity')).toBeInTheDocument();
    });
    expect(screen.getByTestId('location-pathname').textContent).toBe('/operations');
    expect(screen.getByRole('link', { name: 'Start update session' })).toHaveAttribute(
      'href',
      '/operations/session',
    );
  });

  test('operations review uses baseline planning scope when saved ranking is empty', async () => {
    setInventoryState(createSnapshot({ ranking: [] }));

    renderRoute('/operations/session?step=review', <StockUpdateSessionRoute />);

    expect(await screen.findByRole('button', { name: /Step 4.*Review & submit/i })).toBeInTheDocument();
    expect(screen.getByText('3 ranking entries in the current planning order')).toBeInTheDocument();
    expect(screen.queryByText('0 ranking entries in the current planning order')).not.toBeInTheDocument();
  });

  test('operations session omits optional service arrays when optional sections are unchanged', async () => {
    renderRoute('/operations/session', <StockUpdateSessionRoute />);

    expect(await screen.findByText('Review and submit one operations update')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    fireEvent.click(screen.getAllByRole('button', { name: '+' })[0]);
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Submit update' })).toBeEnabled();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Submit update' }));

    await waitFor(() => {
      expect(submitReport).toHaveBeenCalledTimes(1);
    });
    expect(submitReport.mock.calls[0][0]).not.toHaveProperty('serviceSignals');
    expect(submitReport.mock.calls[0][0]).not.toHaveProperty('servicePriceAdjustments');
  });

  test('operations session supports canonical review only', async () => {
    const reviewRoute = renderRoute('/operations/session?step=review', <StockUpdateSessionRoute />);

    expect(await screen.findByRole('button', { name: /Step 4.*Review & submit/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open planning' })).toBeInTheDocument();

    reviewRoute.unmount();
    renderRoute('/operations/session?step=details', <StockUpdateSessionRoute />);
    expect(await screen.findByRole('button', { name: /Step 1.*Details/i })).toBeInTheDocument();
  });

  test('cancel update exits immediately when the session draft is still pristine', async () => {
    render(
      <OperationsSessionProvider>
        <MemoryRouter initialEntries={['/operations/session']}>
          <Routes>
            <Route element={<StockUpdateSessionRoute />} path="/operations/session" />
            <Route
              element={
                <>
                  <StockUpdateRoute />
                  <LocationProbe />
                </>
              }
              path="/operations"
            />
          </Routes>
        </MemoryRouter>
      </OperationsSessionProvider>,
    );

    expect(await screen.findByText('Review and submit one operations update')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel session' }));

    expect(await screen.findByText('Recent activity')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Start update session' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Resume update session' })).not.toBeInTheDocument();
    expect(screen.getByTestId('location-pathname').textContent).toBe('/operations');
  });

  test('cancel update confirms before discarding a changed operations draft', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm');
    confirmSpy.mockReturnValueOnce(false).mockReturnValueOnce(true);

    try {
      render(
        <OperationsSessionProvider>
          <MemoryRouter initialEntries={['/operations/session']}>
            <Routes>
              <Route element={<StockUpdateSessionRoute />} path="/operations/session" />
              <Route
                element={
                  <>
                    <StockUpdateRoute />
                    <LocationProbe />
                  </>
                }
                path="/operations"
              />
            </Routes>
          </MemoryRouter>
        </OperationsSessionProvider>,
      );

      expect(await screen.findByText('Review and submit one operations update')).toBeInTheDocument();
      fireEvent.change(screen.getByLabelText('Report notes'), {
        target: { value: 'Hold for recount.' },
      });

      fireEvent.click(screen.getByRole('button', { name: 'Cancel session' }));
      expect(confirmSpy).toHaveBeenCalledWith(
        'You have an in-progress operations update. Leave this page and discard the current draft?',
      );
      expect(screen.getByText('Review and submit one operations update')).toBeInTheDocument();
      expect(screen.queryByText('Recent activity')).not.toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: 'Cancel session' }));
      expect(await screen.findByText('Recent activity')).toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'Start update session' })).toBeInTheDocument();
      expect(screen.queryByRole('link', { name: 'Resume update session' })).not.toBeInTheDocument();
      expect(screen.getByTestId('location-pathname').textContent).toBe('/operations');
    } finally {
      confirmSpy.mockRestore();
    }
  });

  test('review return-to-editing actions jump to the matching section', async () => {
    renderRoute('/operations/session', <StockUpdateSessionRoute />);

    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    fireEvent.click(screen.getAllByRole('button', { name: '+' })[0]);
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));

    expect(await screen.findByRole('button', { name: 'Submit update' })).toBeInTheDocument();

    fireEvent.click(screen.getAllByRole('button', { name: 'Return to editing' })[1]);
    expect(await screen.findByText('Changed rows are ready for review and submit.')).toBeInTheDocument();
  });

  test('review return-to-editing for service updates opens editing mode directly', async () => {
    renderRoute('/operations/session?step=services', <StockUpdateSessionRoute />);

    expect(await screen.findByRole('button', { name: 'Review service updates' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Review service updates' }));
    fireEvent.click(screen.getAllByRole('checkbox')[0]);
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));

    expect((await screen.findAllByRole('button', { name: 'Return to editing' })).length).toBeGreaterThan(1);
    fireEvent.click(screen.getAllByRole('button', { name: 'Return to editing' })[2]);

    expect(await screen.findByRole('button', { name: 'Done reviewing' })).toBeInTheDocument();
    expect(screen.getAllByRole('checkbox')[0]).toBeChecked();
  });

  test('operations page keeps the start-session CTA available when history loading fails', async () => {
    listStockReports.mockRejectedValueOnce(new Error('load failed'));

    renderRoute('/operations', <StockUpdateRoute />);

    expect(await screen.findByText('load failed')).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: 'Start update session' })[0]).toHaveAttribute(
      'href',
      '/operations/session',
    );
  });

  test('settings keeps workspace preferences open and advanced settings collapsed by default', async () => {
    renderRoute('/settings', <SettingsRoute />);

    expect(await screen.findByText('Workspace preferences')).toBeInTheDocument();
    expect(screen.getByText('Advanced settings')).toBeInTheDocument();
    expect(screen.queryByText('Local data')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Show advanced settings' })).toBeInTheDocument();
    expect(screen.queryByLabelText('Particle count')).not.toBeInTheDocument();
  });

  test('settings local data section loads raw file paths and copies the data directory', async () => {
    renderRoute('/settings', <SettingsRoute />);

    fireEvent.click(screen.getByRole('button', { name: 'Show advanced settings' }));
    expect(await screen.findByText('Local data')).toBeInTheDocument();
    expect(await screen.findByText('/tmp/banji-data')).toBeInTheDocument();
    expect(screen.getByText('/tmp/banji-data/desktop-inventory-store.json')).toBeInTheDocument();
    expect(screen.getByText('/tmp/banji-data/desktop-preferences.json')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Copy data path' }));

    await waitFor(() => {
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith('/tmp/banji-data');
    });
    expect(await screen.findByTestId('settings-local-data-status')).toHaveTextContent(
      'Data folder path copied.',
    );
  });

  test('settings local data actions open the folder and show export success', async () => {
    renderRoute('/settings', <SettingsRoute />);

    fireEvent.click(screen.getByRole('button', { name: 'Show advanced settings' }));
    await screen.findByText('Local data');
    fireEvent.click(screen.getByRole('button', { name: 'Open data folder' }));
    await waitFor(() => {
      expect(openLocalDataFolder).toHaveBeenCalledTimes(1);
    });

    fireEvent.click(screen.getByRole('button', { name: 'Export data' }));
    expect(screen.getByRole('menu', { name: 'Export data' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('menuitem', { name: 'Export SKUs CSV' }));
    await waitFor(() => {
      expect(exportSkusCsv).toHaveBeenCalledTimes(1);
    });
    expect(await screen.findByTestId('settings-local-data-status')).toHaveTextContent(
      'Exported SKUs: /tmp/banji-skus.csv',
    );
  });

  test('settings action row summarizes which sections are dirty', async () => {
    preferencesHook.mockReturnValue({
      ...preferencesHook.mock.results.at(-1)?.value,
      hasPendingChanges: true,
      savePreferences,
      resetPreferences,
    });

    renderRoute('/settings', <SettingsRoute />);

    expect(await screen.findByTestId('settings-dirty-summary')).toHaveTextContent('(changed)');

    fireEvent.click(screen.getByRole('button', { name: 'Show advanced settings' }));
    fireEvent.change(screen.getByLabelText('Particle count'), {
      target: { value: '768' },
    });

    expect(screen.getByTestId('settings-dirty-summary')).toHaveTextContent('(changed)');
  });

  test('settings expands advanced settings and preserves SIST tooltip behavior', async () => {
    renderRoute('/settings', <SettingsRoute />);

    fireEvent.click(screen.getByRole('button', { name: 'Show advanced settings' }));
    expect(screen.queryByTestId('settings-advanced-summary')).not.toBeInTheDocument();

    const helpButton = screen.getByRole('button', { name: 'Particle count help' });
    const tooltipText =
      'Sets how many particle samples SIST uses during inference. Higher counts are steadier but take longer to compute.';

    fireEvent.pointerEnter(helpButton);
    await waitFor(() => {
      expect(helpButton).toHaveAttribute('aria-expanded', 'true');
    });
    expect(
      await screen.findByRole('tooltip', { name: tooltipText }),
    ).toBeInTheDocument();

    fireEvent.click(helpButton);
    await waitFor(() => {
      expect(helpButton).toHaveAttribute('aria-expanded', 'false');
    });

    fireEvent.pointerLeave(helpButton);
    fireEvent.click(helpButton);
    await waitFor(() => {
      expect(helpButton).toHaveAttribute('aria-expanded', 'true');
    });
  });

  test('settings save flow persists dirty advanced settings before preferences', async () => {
    preferencesHook.mockReturnValue({
      ...preferencesHook.mock.results.at(-1)?.value,
      currency: 'KHR',
      persistedCurrency: 'USD',
      hasPendingChanges: true,
      savePreferences,
      resetPreferences,
    });

    renderRoute('/settings', <SettingsRoute />);

    fireEvent.click(screen.getByRole('button', { name: 'Show advanced settings' }));
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
    await waitFor(() => {
      expect(savePreferences).toHaveBeenCalledTimes(1);
    });
    expect(await screen.findByTestId('settings-save-status')).toHaveTextContent('Changes saved.');
  });

  test('settings reset restores draft state back to baseline', async () => {
    preferencesHook.mockReturnValue({
      ...preferencesHook.mock.results.at(-1)?.value,
      hasPendingChanges: true,
      savePreferences,
      resetPreferences,
    });

    renderRoute('/settings', <SettingsRoute />);

    fireEvent.click(screen.getByRole('button', { name: 'Show advanced settings' }));
    fireEvent.change(screen.getByLabelText('Particle count'), {
      target: { value: '768' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Reset changes' }));

    expect(resetPreferences).toHaveBeenCalledTimes(1);
    expect(screen.queryByLabelText('Particle count')).not.toBeInTheDocument();
  });

  test('settings validation blocks save and focuses the first invalid advanced field', async () => {
    renderRoute('/settings', <SettingsRoute />);

    fireEvent.click(screen.getByRole('button', { name: 'Show advanced settings' }));
    fireEvent.change(screen.getByLabelText('Target service level'), {
      target: { value: '' },
    });
    fireEvent.click(screen.getByText('Save changes'));

    expect(
      await screen.findByText((content) =>
        content === 'Enter a non-negative number.' || content === 'validationNonNegative',
      ),
    ).toBeInTheDocument();
    expect(document.activeElement).toBe(screen.getByLabelText('Target service level'));
    expect(saveSistSettings).not.toHaveBeenCalled();
  });

  test('dirty advanced settings can collapse while keeping an unsaved badge in the header', async () => {
    renderRoute('/settings', <SettingsRoute />);

    fireEvent.click(screen.getByRole('button', { name: 'Show advanced settings' }));
    fireEvent.change(screen.getByLabelText('Particle count'), {
      target: { value: '768' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Hide advanced settings' }));

    expect(screen.getByRole('button', { name: 'Show advanced settings' })).toBeInTheDocument();
    expect(screen.queryByLabelText('Particle count')).not.toBeInTheDocument();
    expect(screen.getByTestId('settings-advanced-status-badge')).toHaveTextContent('Unsaved');
    expect(screen.getByTestId('settings-dirty-summary')).toHaveTextContent('(changed)');
  });

  test('settings blocks route navigation with unsaved changes and discards drafts on confirmed leave', async () => {
    preferencesHook.mockReturnValue({
      ...preferencesHook.mock.results.at(-1)?.value,
      hasPendingChanges: true,
      savePreferences,
      resetPreferences,
    });

    const confirmSpy = vi.spyOn(window, 'confirm');
    confirmSpy.mockReturnValueOnce(false).mockReturnValueOnce(true);

    render(
      <MemoryRouter initialEntries={['/settings']}>
        <Routes>
          <Route
            element={
              <>
                <Link to="/catalog">Catalog</Link>
                <SettingsRoute />
                <LocationProbe />
              </>
            }
            path="/settings"
          />
          <Route element={<LocationProbe />} path="/catalog" />
        </Routes>
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole('link', { name: 'Catalog' }));
    expect(confirmSpy).toHaveBeenCalledWith(
      'You have unsaved settings changes. Leave this page and discard the current draft?',
    );
    expect(screen.getByTestId('location-pathname').textContent).toBe('/settings');

    fireEvent.click(screen.getByRole('link', { name: 'Catalog' }));
    expect(resetPreferences).toHaveBeenCalledTimes(1);

    confirmSpy.mockRestore();
  });

  test('settings keeps failed preference saves dirty while preserving successful advanced saves', async () => {
    savePreferences.mockRejectedValueOnce(new Error('preferences failed'));
    preferencesHook.mockReturnValue({
      ...preferencesHook.mock.results.at(-1)?.value,
      hasPendingChanges: true,
      savePreferences,
      resetPreferences,
    });

    renderRoute('/settings', <SettingsRoute />);

    fireEvent.click(screen.getByRole('button', { name: 'Show advanced settings' }));
    fireEvent.change(screen.getByLabelText('Particle count'), {
      target: { value: '768' },
    });
    fireEvent.click(screen.getByText('Save changes'));

    await waitFor(() => {
      expect(saveSistSettings).toHaveBeenCalledTimes(1);
    });
    await waitFor(() => {
      expect(savePreferences).toHaveBeenCalledTimes(1);
    });
    expect(await screen.findByTestId('settings-save-status')).toHaveTextContent('preferences failed');
  });
});
