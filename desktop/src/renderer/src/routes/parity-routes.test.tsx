import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
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

function renderRoute(path: string, element: React.ReactNode) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route element={element} path={path} />
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

describe('renderer parity routes', () => {
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
          homeKeyMetrics: 'Key Metrics',
          homePerformance: 'Performance',
          homeRecentActivity: 'Recent Activity',
          dashboardTotalValue: 'Inventory value',
          dashboardSaleReady: 'Sale-ready SKUs',
          dashboardServices: 'Services',
          dashboardRanked: 'Ranked products',
          serviceLabel: 'Service',
          skuLabel: 'SKU',
          stockFlow: 'Stock update',
          rankingFlow: 'Ranking',
          allItemsTitle: 'All Items',
          searchItems: 'Search items by name',
          filterSku: 'SKUs',
          filterService: 'Services',
          servicesHeading: 'Services',
          skusHeading: 'SKUs',
          noResults: 'No results',
          addItem: 'Add item',
          settingsTitle: 'Settings',
          settingsLanguage: 'Language',
          settingsCurrency: 'Currency',
          languageEnglish: 'English',
          languageKhmer: 'Khmer',
          manualBackup: 'Manual Backup',
          logout: 'Logout',
          settingsDisclaimer: 'Your data stays on this device.',
          stockChangesTitle: "SKUs' Stock Update",
          cancel: 'Cancel',
          stockDone: 'Save stock',
          stockConfirm: 'Review changes',
          stockPrevious: 'Back',
          stockNext: 'Next',
          fieldUnitsInStock: 'Units in stock',
          fieldCostPerUnit: 'Cost per unit',
          validationStockChanges: 'Change at least one SKU before saving.',
          stockNoChanges: 'No stock changes yet',
          stockUpdateHint: 'Only changed rows will be submitted.',
          unsavedChanges: 'Unsaved changes',
          productRankingTitle: 'Sales Ranking Update',
          resetAction: 'Reset',
          saveRankingAction: 'Save ranking',
          rankHeaderName: 'Name',
          rankHeaderPrice: 'Price',
          moveUp: 'Up',
          moveDown: 'Down',
          skuEditorTitle: 'SKU editor',
          saveDraft: 'Save changes',
          fieldId: 'Identifier',
          fieldName: 'Name',
          fieldDescription: 'Description',
          fieldSoldAsProduct: 'Sell as product',
          fieldProductPrice: 'Product price',
          createEntry: 'Create entry',
        };
        return translations[key] ?? key;
      },
    });
    window.confirm = vi.fn(() => true);
  });

  test('dashboard restores the old section structure and stock action', () => {
    renderRoute('/', <DashboardRoute />);

    expect(screen.getByText('Key Metrics')).toBeInTheDocument();
    expect(screen.getByText('Performance')).toBeInTheDocument();
    expect(screen.getByText('Recent Activity')).toBeInTheDocument();
    expect(screen.getByLabelText('Stock update')).toBeInTheDocument();
  });

  test('inventory shows grouped services and skus with add action', () => {
    renderRoute('/inventory', <InventoryRoute />);

    expect(screen.getByText('All Items')).toBeInTheDocument();
    expect(screen.getAllByText('Services')[0]).toBeInTheDocument();
    expect(screen.getAllByText('SKUs')[0]).toBeInTheDocument();
    expect(screen.getByText('Service #001')).toBeInTheDocument();
    expect(screen.getByText('SKU #001')).toBeInTheDocument();
    expect(screen.getByLabelText('Add item')).toBeInTheDocument();
  });

  test('inventory service availability is limited by the scarcest linked sku', () => {
    inventoryHook.mockReturnValue({
      snapshot: {
        ...snapshot,
        services: [
          {
            ...snapshot.services[0],
            skuIds: ['sku-1', 'sku-2'],
          },
          snapshot.services[1],
        ],
      },
      error: null,
      isLoading: false,
      isSaving: false,
      saveSku: vi.fn(),
      saveService: vi.fn(),
      saveStock: vi.fn(),
      persistRanking: vi.fn(),
    });

    renderRoute('/inventory', <InventoryRoute />);

    expect(screen.getByText('$14,400.00')).toBeInTheDocument();
  });

  test('settings renders language and currency controls', () => {
    renderRoute('/settings', <SettingsRoute />);

    expect(screen.getByText('Settings')).toBeInTheDocument();
    expect(screen.getByText('Language')).toBeInTheDocument();
    expect(screen.getByText('Currency')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Logout' })).not.toBeInTheDocument();
  });

  test('sku editor uses save-change header and reveals product price toggle', () => {
    renderRoute('/inventory/skus/new', <SkuFormRoute />);

    expect(screen.getAllByText('SKU editor')[0]).toBeInTheDocument();
    expect(screen.getByText('Identifier')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('checkbox'));
    expect(screen.getByText('Product price')).toBeInTheDocument();
  });

  test('sku editor cancel returns to inventory', () => {
    renderSkuEditor();

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.getByText('Inventory screen')).toBeInTheDocument();
  });

  test('stock update follows card flow to review state', () => {
    renderRoute('/inventory/stock', <StockUpdateRoute />);

    expect(screen.getByText("SKUs' Stock Update")).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    fireEvent.click(screen.getByRole('button', { name: 'Review changes' }));
    expect(screen.getByText('No stock changes yet')).toBeInTheDocument();
  });

  test('ranking supports reorder controls in the restored table layout', () => {
    renderRoute('/inventory/ranking', <RankingRoute />);

    expect(screen.getByText('Sales Ranking Update')).toBeInTheDocument();
    const upButtons = screen.getAllByRole('button', { name: 'Down' });
    fireEvent.click(upButtons[0]);
    const labels = screen.getAllByText(/Service|SKU/);
    expect(labels.length).toBeGreaterThan(0);
    expect(screen.getByText('Price')).toBeInTheDocument();
  });
});
