import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import type { InventorySnapshot, RankingEntry } from '@shared/inventory';
import { DashboardRoute } from './dashboard';
import { InventoryRoute } from './inventory';
import { RankingRoute } from './ranking';
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
    },
    {
      skuId: 'sku-2',
      name: 'SKU #002',
      description: 'Second sku',
      unitsInStock: 20,
      costPerUnit: 7,
      soldAsProduct: false,
      productPrice: null,
    },
  ],
  ranking: rankingEntries,
};

const inventoryHook = vi.fn();
const preferencesHook = vi.fn();

vi.mock('../state/inventory', () => ({
  useInventory: () => inventoryHook(),
}));

vi.mock('../state/preferences', () => ({
  usePreferences: () => preferencesHook(),
}));

function LocationProbe() {
  const location = useLocation();
  return <div data-testid="location-search">{location.search}</div>;
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

function renderSkuEditor(path = '/inventory/skus/new') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route element={<div>Inventory screen</div>} path="/inventory" />
        <Route element={<SkuFormRoute />} path="/inventory/skus/new" />
        <Route element={<SkuFormRoute />} path="/inventory/skus/:skuId" />
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
    inventoryHook.mockReturnValue({
      snapshot: { ...snapshot, ranking: rankingEntries },
      error: null,
      isLoading: false,
      isSaving: false,
      backendStatus: 'ready',
      saveSku: vi.fn(),
      saveService: vi.fn(),
      saveStock: vi.fn(),
      persistRanking: vi.fn(),
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
          navStock: 'Stock Room',
          navRanking: 'Merchandising',
          navSettings: 'Preferences',
          dashboardEyebrow: 'Warm, local-first retail operations',
          dashboardHeading:
            'Daily control for inventory, stock moves, and storefront priorities',
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
          inventoryBody: 'Catalog overview copy',
          allItemsTitle: 'Catalog',
          searchItems: 'Search and segment',
          searchPlaceholder: 'Search name, description, or id…',
          filterAll: 'Everything',
          filterSku: 'SKUs',
          filterService: 'Services',
          servicesHeading: 'Services',
          skusHeading: 'SKUs',
          stockFlow: 'Open stock room',
          rankingFlow: 'Open merchandising',
          createSkuAction: 'New SKU',
          createServiceAction: 'New Service',
          inventoryColumnItem: 'Item',
          inventoryColumnSellable: 'Sellable units',
          inventoryColumnLinkedSkus: 'Linked SKUs',
          inventoryColumnValue: 'Stock value',
          inventoryPotentialRevenue: 'Potential revenue',
          inventorySoldAsProduct: 'Sellable',
          inventoryNotSoldAsProduct: 'Internal only',
          inventoryNoResultsTitle: 'No catalog matches',
          inventoryNoResultsDescription: 'Try another query or add a new SKU.',
          catalogServicesDescription: 'Service bundle copy',
          catalogSkusDescription: 'SKU copy',
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
          stockChangesTitle: 'Stock Room',
          stockUpdateBody: 'Adjust counts or cost for one or many SKUs.',
          stockUpdateHint: 'Only changed rows will be submitted.',
          stockTableTitle: 'Editable stock ledger',
          stockSummaryTitle: 'Pending change set',
          stockReviewTitle: 'Review before save',
          stockReviewDescription: 'Confirm the changed rows before saving them locally.',
          stockUpdatesReady: 'Rows ready to save',
          stockEditAction: 'Return to editing',
          stockPresetSmall: 'Fine',
          stockPresetMedium: 'Standard',
          stockPresetBig: 'Bulk',
          stockConfirm: 'Review changes',
          stockDone: 'Save stock room',
          stockPhaseEditing: 'Editing',
          stockPhaseReview: 'Review',
          validationStockChanges: 'Change at least one SKU before saving.',
          cancel: 'Cancel',
          skuEditorTitle: 'SKU editor',
          serviceEditorTitle: 'Service editor',
          editorSkuHelper: 'Maintain stock, cost, and sell-through settings for this SKU.',
          editorDetailsTitle: 'Core details',
          editorInventoryTitle: 'Inventory profile',
          editorPricingTitle: 'Commercial setup',
          fieldName: 'Name',
          fieldDescription: 'Description',
          fieldUnitsInStock: 'Units in stock',
          fieldCostPerUnit: 'Cost per unit',
          fieldSoldAsProduct: 'Sell as product',
          fieldProductPrice: 'Product price',
          createEntry: 'Create entry',
          saveDraft: 'Save changes',
          unsavedChanges: 'Unsaved changes',
          savedState: 'Saved',
          validationRequired: 'This field is required.',
          validationNonNegative: 'Enter a non-negative number.',
          validationProductPrice: 'Product price is required.',
          fieldPrice: 'Service price',
          editorServiceHelper: 'Describe the service, set its price, and link the SKUs it consumes.',
          editorSelectionTitle: 'Linked SKUs',
          editorSelectionCount: 'selected',
          fieldLinkedSkus: 'Linked SKUs',
          fieldSkuSelectionHint: 'Select the SKUs included in this service.',
          validationSelection: 'Select at least one linked SKU.',
          productRankingTitle: 'Merchandising',
          rankingBody: 'Rank services and sellable SKUs.',
          merchandisingTopThreeTitle: 'Lead spotlight',
          merchandisingTopThreeDescription: 'Top three copy',
          merchandisingPriorityNote: 'Use the move controls for keyboard-first ordering.',
          saveRankingAction: 'Save order',
          resetAction: 'Reset',
          rankHeaderName: 'Name',
          rankHeaderPrice: 'Price',
          moveUp: 'Move up',
          moveDown: 'Move down',
          serviceLabel: 'Service',
          skuLabel: 'SKU',
          backendReady: 'Local API ready',
          backendStarting: 'Starting local Rust API…',
          backendError: 'Local API unavailable',
          apiUnavailable: 'The desktop shell is running, but the local Rust API is not ready yet.',
          retry: 'Restart local API',
          skipToContent: 'Skip to content',
          openNavigation: 'Open navigation',
          collapseNavigation: 'Collapse navigation',
        };
        return translations[key] ?? key;
      },
    });
    window.confirm = vi.fn(() => true);
  });

  test('overview surfaces the primary workspace actions', () => {
    renderRoute('/', <DashboardRoute />);

    expect(
      screen.getByText('Daily control for inventory, stock moves, and storefront priorities'),
    ).toBeInTheDocument();
    expect(screen.getByText('Inventory value')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Catalog' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Stock Room' })).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: 'Merchandising' })[0]).toBeInTheDocument();
  });

  test('catalog keeps search and filter state in the URL', () => {
    renderInventory('/inventory?q=Service&type=service');

    expect(screen.getByDisplayValue('Service')).toBeInTheDocument();
    expect(screen.getByTestId('location-search')).toHaveTextContent('?q=Service&type=service');
    expect(screen.getByText('Service #001')).toBeInTheDocument();
    expect(screen.queryByText('SKU #001')).not.toBeInTheDocument();
    expect(screen.queryByText('Try another query or add a new SKU.')).not.toBeInTheDocument();

    fireEvent.change(screen.getByDisplayValue('Service'), {
      target: { value: 'SKU' },
    });

    expect(screen.getByTestId('location-search')).toHaveTextContent('q=SKU');

    fireEvent.click(screen.getByRole('radio', { name: 'SKUs' }));
    expect(screen.getByTestId('location-search')).toHaveTextContent('type=sku');
  });

  test('overview reflects startup health without a false ready indicator', () => {
    inventoryHook.mockReturnValue({
      snapshot: { ...snapshot, ranking: rankingEntries },
      error: null,
      isLoading: true,
      isSaving: false,
      backendStatus: 'starting',
      saveSku: vi.fn(),
      saveService: vi.fn(),
      saveStock: vi.fn(),
      persistRanking: vi.fn(),
    });

    renderRoute('/', <DashboardRoute />);

    expect(screen.getAllByText('Booting the local API')[0]).toBeInTheDocument();
    expect(screen.queryByText('Local API ready')).not.toBeInTheDocument();
  });

  test('settings renders locale and currency controls', () => {
    renderRoute('/settings', <SettingsRoute />);

    expect(screen.getAllByText('Preferences')[0]).toBeInTheDocument();
    expect(screen.getByText('Regional formatting')).toBeInTheDocument();
    expect(screen.getByText('Language')).toBeInTheDocument();
    expect(screen.getByText('Currency')).toBeInTheDocument();
  });

  test('sku editor focuses the first invalid field and reveals product price when enabled', () => {
    renderSkuEditor();

    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: 'Create entry' }));

    expect(screen.getByLabelText('Name')).toHaveFocus();
    expect(screen.getByText('Product price')).toBeInTheDocument();
  });

  test('stock room moves from editing into review after a change', () => {
    renderRoute('/inventory/stock', <StockUpdateRoute />);

    expect(screen.getByRole('button', { name: 'Review changes' })).toBeDisabled();

    fireEvent.click(screen.getAllByRole('button', { name: '+' })[0]);
    fireEvent.click(screen.getByRole('button', { name: 'Review changes' }));

    expect(screen.getByText('Review before save')).toBeInTheDocument();
    expect(screen.getByText('Rows ready to save')).toBeInTheDocument();
  });

  test('merchandising reorders entries with the move controls', () => {
    renderRoute('/inventory/ranking', <RankingRoute />);

    const tbody = screen.getByTestId('ranking-list');
    expect(within(tbody).getAllByRole('row')[0]).toHaveTextContent('Service #001');
    expect(screen.getByRole('button', { name: 'Save order' })).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: 'Move down Service #001' }));

    expect(within(tbody).getAllByRole('row')[0]).toHaveTextContent('Service #002');
    expect(screen.getByRole('button', { name: 'Save order' })).toBeEnabled();
  });
});
