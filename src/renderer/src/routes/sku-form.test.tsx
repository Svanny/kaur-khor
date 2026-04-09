import type { ReactNode } from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { Link, MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { RouteBackButton } from '@/components/system/page-navigation';
import { leadTimeVariabilityLabel } from '@shared/sena-lead-time';
import { getTranslation } from '@/lib/translations';
import { NavigationHistoryProvider } from '@/state/navigation-history';
import { SkuFormRoute } from './sku-form';

const inventoryHook = vi.fn();

if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => {};
}

vi.mock('../state/inventory', () => ({
  useInventory: () => inventoryHook(),
}));

vi.mock('../state/preferences', () => ({
  usePreferences: () => ({
    currency: 'USD',
    language: 'en',
    usdToKhrExchangeRate: 4000,
    showExplanatoryTooltips: true,
    showFloatingTitleActions: false,
    showRightRailCards: true,
    t: (key: string) => getTranslation('en', key as never),
  }),
}));

const sampleCatalog = {
  schemaVersion: 1,
  skus: [
    {
      archived: false,
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
      archived: false,
      bundle: false,
      description: 'Service duplicate guard',
      name: 'Service 1',
      price: 24,
      serviceId: 'service-1',
    },
    {
      archived: true,
      bundle: false,
      description: 'Archived service duplicate guard',
      name: 'Archived service',
      price: 18,
      serviceId: 'service-archived',
    },
  ],
  bundles: [],
  sharingMask: [],
};

function renderWithProviders(
  route: string,
  element: ReactNode,
  path: string,
  options?: { initialEntries?: string[]; initialIndex?: number },
) {
  const initialEntries = options?.initialEntries ?? [route];
  return render(
    <MemoryRouter initialEntries={initialEntries} initialIndex={options?.initialIndex}>
      <NavigationHistoryProvider>
        <Routes>
          <Route element={element} path={path} />
          <Route element={<div>Catalog destination</div>} path="/catalog" />
          <Route
            element={
              <>
                <div>SKU detail destination</div>
                <RouteBackButton />
              </>
            }
            path="/catalog/skus/:skuId"
          />
        </Routes>
      </NavigationHistoryProvider>
    </MemoryRouter>,
  );
}

describe('SkuFormRoute', () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    inventoryHook.mockReturnValue({
      catalog: sampleCatalog,
      isSaving: false,
      renameCatalogEntity: vi.fn(async () => sampleCatalog),
      upsertSenaCatalog: vi.fn(async (payload) => payload),
    });
  });

  test('renders the edit page with detail-style hero chrome and planning inputs', async () => {
    renderWithProviders('/catalog/skus/sku-1/edit', <SkuFormRoute />, '/catalog/skus/:skuId/edit');

    expect(screen.getByRole('heading', { level: 1, name: 'Edit SKU' })).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Save changes' })).toBeDisabled();
    });
    expect(screen.getByRole('heading', { level: 2, name: 'Core details' })).toBeInTheDocument();
    expect(screen.getByText('Name the SKU the way staff will search for it.')).toBeInTheDocument();
    expect(screen.getByText('Keep the current landed or replacement unit cost here.')).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: /sell as product/i })).toBeChecked();
    expect(screen.getByDisplayValue('sku-1')).toBeEnabled();
    expect(screen.getByDisplayValue('5')).toHaveValue(5);
    expect(screen.getByDisplayValue('1')).toHaveValue(1);
    await waitFor(() => {
      expect(screen.getByRole('combobox', { name: 'Lead time variability' })).toHaveTextContent(
        leadTimeVariabilityLabel('normal'),
      );
    });
  });

  test('saves edit-mode changes and navigates to the SKU detail route', async () => {
    const upsertSenaCatalog = vi.fn(async (payload) => payload);
    inventoryHook.mockReturnValue({
      catalog: sampleCatalog,
      isSaving: false,
      renameCatalogEntity: vi.fn(async () => sampleCatalog),
      upsertSenaCatalog,
    });

    renderWithProviders('/catalog/skus/sku-1/edit', <SkuFormRoute />, '/catalog/skus/:skuId/edit');

    fireEvent.change(screen.getByDisplayValue('SKU 1'), { target: { value: 'SKU 1 Updated' } });
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() => {
      expect(upsertSenaCatalog).toHaveBeenCalledTimes(1);
    });

    const savedCatalog = upsertSenaCatalog.mock.calls[0]?.[0];
    expect(savedCatalog.schemaVersion).toBe(1);
    expect(savedCatalog.services).toEqual(sampleCatalog.services);
    expect(savedCatalog.bundles).toEqual([]);
    expect(savedCatalog.sharingMask).toEqual([]);
    expect(savedCatalog.skus[0]).toMatchObject({
      costPerUnit: 4,
      description: 'Cotton tee',
      name: 'SKU 1 Updated',
      leadTimeMeanDaysHint: 5,
      productPrice: 9,
      skuId: 'sku-1',
      soldAsProduct: true,
    });
    expect(savedCatalog.skus[0].leadTimeStdDaysHint).toBeCloseTo(1);

    await waitFor(() => {
      expect(screen.getByText('SKU detail destination')).toBeInTheDocument();
    });
  });

  test('replaces the new SKU route so back from the created detail page returns to catalog', async () => {
    const upsertSenaCatalog = vi.fn(async (payload) => payload);
    inventoryHook.mockReturnValue({
      catalog: sampleCatalog,
      isSaving: false,
      renameCatalogEntity: vi.fn(async () => sampleCatalog),
      upsertSenaCatalog,
    });
    window.sessionStorage.setItem(
      'banji.navigation-history',
      JSON.stringify([
        { key: 'catalog', to: '/catalog' },
        { key: 'sku-new', to: '/catalog/skus/new' },
      ]),
    );

    renderWithProviders('/catalog/skus/new', <SkuFormRoute />, '/catalog/skus/new');

    const [skuIdInput, skuNameInput] = screen.getAllByRole('textbox');
    const [costPerUnitInput] = screen.getAllByRole('spinbutton');
    fireEvent.change(skuIdInput, { target: { value: 'sku-new' } });
    fireEvent.change(skuNameInput, { target: { value: 'SKU New' } });
    fireEvent.change(costPerUnitInput, { target: { value: '12' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create entry' }));

    await waitFor(() => {
      expect(upsertSenaCatalog).toHaveBeenCalledTimes(1);
      expect(screen.getByText('SKU detail destination')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Back' }));

    await waitFor(() => {
      expect(screen.getByText('Catalog destination')).toBeInTheDocument();
    });
  });

  test('renames the sku id through the coordinated rename mutation', async () => {
    const renameCatalogEntity = vi.fn(async () => sampleCatalog);
    inventoryHook.mockReturnValue({
      catalog: sampleCatalog,
      isSaving: false,
      renameCatalogEntity,
      upsertSenaCatalog: vi.fn(async (payload) => payload),
    });

    renderWithProviders('/catalog/skus/sku-1/edit', <SkuFormRoute />, '/catalog/skus/:skuId/edit');

    fireEvent.change(screen.getByDisplayValue('sku-1'), { target: { value: 'sku-1-renamed' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() => {
      expect(renameCatalogEntity).toHaveBeenCalledWith({
        entityType: 'sku',
        previousId: 'sku-1',
        nextSku: expect.objectContaining({ skuId: 'sku-1-renamed' }),
      });
    });

    await waitFor(() => {
      expect(screen.getByText('SKU detail destination')).toBeInTheDocument();
    });
  });

  test('blocks duplicate active and archived ids while editing', async () => {
    renderWithProviders('/catalog/skus/sku-1/edit', <SkuFormRoute />, '/catalog/skus/:skuId/edit');

    fireEvent.change(screen.getByDisplayValue('sku-1'), { target: { value: 'service-1' } });
    expect(screen.getByText('This identifier is already used by another catalog item, including archived items.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeDisabled();

    fireEvent.change(screen.getByDisplayValue('service-1'), { target: { value: 'service-archived' } });
    expect(screen.getByText('This identifier is already used by another catalog item, including archived items.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeDisabled();

    fireEvent.change(screen.getByDisplayValue('service-archived'), { target: { value: 'sku-1' } });
    expect(screen.queryByText('This identifier is already used by another catalog item, including archived items.')).not.toBeInTheDocument();
  });

  test('asks before leaving with unsaved SKU changes', async () => {
    renderWithProviders(
      '/catalog/skus/sku-1/edit',
      <>
        <Link to="/catalog">Catalog</Link>
        <SkuFormRoute />
      </>,
      '/catalog/skus/:skuId/edit',
    );

    fireEvent.change(screen.getByDisplayValue('SKU 1'), { target: { value: 'SKU 1 Updated' } });
    fireEvent.click(screen.getByRole('link', { name: 'Catalog' }));

    expect(screen.getByRole('dialog')).toHaveTextContent('Discard changes?');
    fireEvent.click(screen.getByRole('button', { name: 'Keep editing' }));
    expect(screen.getByDisplayValue('SKU 1 Updated')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('link', { name: 'Catalog' }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Discard changes' }));

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
  });

  test('asks before using the edit page back button with unsaved SKU changes', async () => {
    window.sessionStorage.setItem(
      'banji.navigation-history',
      JSON.stringify([
        { key: 'catalog', to: '/catalog' },
        { key: 'sku-edit', to: '/catalog/skus/sku-1/edit' },
      ]),
    );

    renderWithProviders('/catalog/skus/sku-1/edit', <SkuFormRoute />, '/catalog/skus/:skuId/edit');

    fireEvent.change(screen.getByDisplayValue('SKU 1'), { target: { value: 'SKU 1 Updated' } });
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));

    expect(screen.getByRole('dialog')).toHaveTextContent('Discard changes?');
    fireEvent.click(screen.getByRole('button', { name: 'Keep editing' }));
    expect(screen.getByDisplayValue('SKU 1 Updated')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Discard changes' }));

    await waitFor(() => {
      expect(screen.getByText('Catalog destination')).toBeInTheDocument();
    });
  });

  test('lets users clear a zero-valued cost field before entering the next value', async () => {
    inventoryHook.mockReturnValue({
      catalog: {
        ...sampleCatalog,
        skus: [
          {
            ...sampleCatalog.skus[0],
            costPerUnit: 0,
            productPrice: null,
            soldAsProduct: false,
          },
        ],
      },
      isSaving: false,
      renameCatalogEntity: vi.fn(async () => sampleCatalog),
      upsertSenaCatalog: vi.fn(async (payload) => payload),
    });

    renderWithProviders('/catalog/skus/sku-1/edit', <SkuFormRoute />, '/catalog/skus/:skuId/edit');

    const pricingPanel = screen.getByRole('heading', { level: 2, name: 'Commercial setup' }).closest('[data-slot="card"]');
    const [costInput] = within(pricingPanel ?? document.body).getAllByRole('spinbutton');
    fireEvent.change(costInput, { target: { value: '' } });
    expect(costInput).toHaveValue(null);
    expect(costInput).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByText('Enter a cost per unit before saving.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeDisabled();

    fireEvent.change(costInput, { target: { value: '12' } });
    expect(costInput).toHaveValue(12);
    expect(costInput).toHaveAttribute('aria-invalid', 'false');
    expect(screen.queryByText('Enter a cost per unit before saving.')).not.toBeInTheDocument();
  });

  test('explains how to enable selling price entry and unlocks it when sell as product is checked', async () => {
    inventoryHook.mockReturnValue({
      catalog: {
        ...sampleCatalog,
        skus: [
          {
            ...sampleCatalog.skus[0],
            productPrice: null,
            soldAsProduct: false,
          },
        ],
      },
      isSaving: false,
      renameCatalogEntity: vi.fn(async () => sampleCatalog),
      upsertSenaCatalog: vi.fn(async (payload) => payload),
    });

    renderWithProviders('/catalog/skus/sku-1/edit', <SkuFormRoute />, '/catalog/skus/:skuId/edit');

    const pricingPanel = screen.getByRole('heading', { level: 2, name: 'Commercial setup' }).closest('[data-slot="card"]');
    const [, priceInput] = within(pricingPanel ?? document.body).getAllByRole('spinbutton');
    expect(priceInput).toBeDisabled();
    expect(screen.getByText('To enter a selling price, click the Sell as product box below first.')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('checkbox', { name: /sell as product/i }));

    expect(priceInput).toBeEnabled();
    fireEvent.change(priceInput, { target: { value: '25' } });
    expect(priceInput).toHaveValue(25);
  });

  test('removes the select variability placeholder after a real lead time variability is chosen', async () => {
    renderWithProviders('/catalog/skus/new', <SkuFormRoute />, '/catalog/skus/new');

    const variabilitySelect = screen.getByRole('combobox', { name: 'Lead time variability' });
    fireEvent.click(variabilitySelect);
    expect(screen.getByRole('option', { name: 'Select variability' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('option', { name: leadTimeVariabilityLabel('wide') }));

    fireEvent.click(screen.getByRole('combobox', { name: 'Lead time variability' }));
    expect(screen.queryByRole('option', { name: 'Select variability' })).not.toBeInTheDocument();
  });

  test('saves a manually entered uncertainty plus-minus days value', async () => {
    const upsertSenaCatalog = vi.fn(async (payload) => payload);
    inventoryHook.mockReturnValue({
      catalog: sampleCatalog,
      isSaving: false,
      renameCatalogEntity: vi.fn(async () => sampleCatalog),
      upsertSenaCatalog,
    });

    renderWithProviders('/catalog/skus/sku-1/edit', <SkuFormRoute />, '/catalog/skus/:skuId/edit');

    fireEvent.change(screen.getByDisplayValue('1'), { target: { value: '1.8' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() => {
      expect(upsertSenaCatalog).toHaveBeenCalledTimes(1);
    });

    expect(upsertSenaCatalog.mock.calls[0]?.[0].skus[0].leadTimeStdDaysHint).toBeCloseTo(1.8);
  });
});
