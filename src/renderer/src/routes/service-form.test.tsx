import type { ReactNode } from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { Link, MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { RouteBackButton } from '@/components/system/page-navigation';
import * as senaCatalog from '@/lib/sena-catalog';
import { getTranslation } from '@/lib/translations';
import { NavigationHistoryProvider } from '@/state/navigation-history';
import { ServiceFormRoute } from './service-form';
import { deriveMeasuredGridColumnCount } from './service-form-layout';

const inventoryHook = vi.fn();
const preferencesHook = vi.fn();

vi.mock('../state/inventory', () => ({
  useInventory: () => inventoryHook(),
}));

vi.mock('../state/preferences', () => ({
  usePreferences: () => preferencesHook(),
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
    {
      archived: true,
      costPerUnit: 8,
      description: 'Silk scarf',
      leadTimeMeanDaysHint: 6,
      leadTimeStdDaysHint: 2,
      name: 'SKU 2',
      productPrice: 15,
      skuId: 'sku-2',
      soldAsProduct: true,
    },
  ],
  services: [
    {
      archived: false,
      bundle: false,
      description: 'Style and fit',
      name: 'Service 1',
      price: 24,
      serviceId: 'service-1',
    },
  ],
  bundles: [],
  sharingMask: [
    {
      enabled: true,
      serviceId: 'service-1',
      skuId: 'sku-1',
      usageProbability: null,
    },
  ],
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
                <div>Service detail destination</div>
                <RouteBackButton />
              </>
            }
            path="/catalog/services/:serviceId"
          />
        </Routes>
      </NavigationHistoryProvider>
    </MemoryRouter>,
  );
}

function findButtonByText(text: string) {
  return screen.getAllByRole('button').find((button) => button.textContent?.includes(text)) as HTMLButtonElement;
}

function fillNewServiceRequiredFields(name: string) {
  const [serviceNameInput] = screen.getAllByRole('textbox');
  const pricingPanel = screen.getByRole('heading', { level: 2, name: 'Commercial setup' }).closest('[data-slot="card"]');
  const [priceInput] = within((pricingPanel ?? document.body) as HTMLElement).getAllByRole('textbox');

  fireEvent.change(serviceNameInput, { target: { value: name } });
  fireEvent.change(priceInput, { target: { value: '12' } });
}

describe('ServiceFormRoute', () => {
  const pickAndStoreImage = vi.fn();
  const storeDroppedImage = vi.fn();

  beforeEach(() => {
    window.sessionStorage.clear();
    pickAndStoreImage.mockReset();
    pickAndStoreImage.mockResolvedValue('/tmp/service-image.png');
    storeDroppedImage.mockReset();
    storeDroppedImage.mockResolvedValue('/tmp/dropped-service.png');
    window.banjiDesktop = {
      ...(window.banjiDesktop ?? {}),
      system: {
        ...(window.banjiDesktop?.system ?? {}),
        pickAndStoreImage,
        storeDroppedImage,
      },
    };
    preferencesHook.mockReturnValue({
      currency: 'USD',
      language: 'en',
      usdToKhrExchangeRate: 4000,
      showExplanatoryTooltips: true,
      showFloatingTitleActions: false,
      showRightRailCards: true,
      t: (key: string) => getTranslation('en', key as never),
    });
    inventoryHook.mockReturnValue({
      catalog: sampleCatalog,
      isLoading: false,
      isSaving: false,
      renameCatalogEntity: vi.fn(async () => sampleCatalog),
      upsertSenaCatalog: vi.fn(async (payload) => payload),
    });
  });

  test('renders a loading wireframe while the service editor catalog is still loading', () => {
    inventoryHook.mockReturnValue({
      catalog: null,
      isLoading: true,
      isSaving: false,
      upsertSenaCatalog: vi.fn(async (payload) => payload),
    });

    renderWithProviders('/catalog/services/service-1/edit', <ServiceFormRoute />, '/catalog/services/:serviceId/edit');

    expect(screen.getByRole('heading', { level: 1, name: 'Edit service' })).toBeInTheDocument();
    expect(document.querySelectorAll('.animate-pulse').length).toBeGreaterThan(0);
  });

  test('renders the edit page with SKU-style hero chrome and stacked panels', () => {
    renderWithProviders('/catalog/services/service-1/edit', <ServiceFormRoute />, '/catalog/services/:serviceId/edit');

    expect(screen.getByRole('heading', { level: 1, name: 'Edit service' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeDisabled();
    expect(screen.getByRole('heading', { level: 2, name: 'Core details' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'Commercial setup' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'Linked SKUs' })).toBeInTheDocument();
    expect(screen.getByText('Name the service the way staff will recognize it.')).toBeInTheDocument();
    expect(screen.getByText('Choose every SKU normally consumed when this service is sold.')).toBeInTheDocument();
    expect(screen.queryByDisplayValue('service-1')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Search linked SKUs by name or description…')).toBeInTheDocument();
    expect(screen.getByText('1 linked SKUs selected')).toBeInTheDocument();
    expect(screen.getByTestId('linked-sku-grid')).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'SKU 1' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'SKU 2' })).not.toBeChecked();
    expect(screen.queryByText('sku-1')).not.toBeInTheDocument();
  });

  test('filters linked SKUs from the search input', () => {
    renderWithProviders('/catalog/services/service-1/edit', <ServiceFormRoute />, '/catalog/services/:serviceId/edit');

    fireEvent.change(screen.getByPlaceholderText('Search linked SKUs by name or description…'), {
      target: { value: 'Silk scarf' },
    });

    expect(screen.getByText('1 linked SKUs selected')).toBeInTheDocument();
    expect(screen.queryByRole('checkbox', { name: 'SKU 1' })).not.toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'SKU 2' })).toBeInTheDocument();
  });

  test('toggles a linked SKU when clicking the tile body', () => {
    renderWithProviders('/catalog/services/service-1/edit', <ServiceFormRoute />, '/catalog/services/:serviceId/edit');

    const linkedSkuGrid = screen.getByTestId('linked-sku-grid');
    fireEvent.click(within(linkedSkuGrid).getByText('SKU 2').closest('[data-sku-tile="true"]') as HTMLElement);

    expect(screen.getByRole('checkbox', { name: 'SKU 2' })).toBeChecked();
    expect(screen.getByText('2 linked SKUs selected')).toBeInTheDocument();
  });

  test('saves edit-mode changes and navigates to the service detail route', async () => {
    const upsertSenaCatalog = vi.fn(async (payload) => payload);
    inventoryHook.mockReturnValue({
      catalog: sampleCatalog,
      isLoading: false,
      isSaving: false,
      renameCatalogEntity: vi.fn(async () => sampleCatalog),
      upsertSenaCatalog,
    });

    renderWithProviders('/catalog/services/service-1/edit', <ServiceFormRoute />, '/catalog/services/:serviceId/edit');

    fireEvent.change(screen.getByDisplayValue('Service 1'), { target: { value: 'Service 1 Updated' } });
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeEnabled();
    fireEvent.change(screen.getByDisplayValue('24'), { target: { value: '29' } });
    fireEvent.click(screen.getByRole('checkbox', { name: 'SKU 2' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() => {
      expect(upsertSenaCatalog).toHaveBeenCalledTimes(1);
    });

    const savedCatalog = upsertSenaCatalog.mock.calls[0]?.[0];
    expect(savedCatalog.schemaVersion).toBe(1);
    expect(savedCatalog.bundles).toEqual([]);
    expect(savedCatalog.skus).toEqual(sampleCatalog.skus);
    expect(savedCatalog.services[0]).toMatchObject({
      bundle: false,
      description: 'Style and fit',
      name: 'Service 1 Updated',
      price: 29,
      serviceId: 'service-1',
    });
    expect(savedCatalog.sharingMask).toEqual([
      { enabled: true, serviceId: 'service-1', skuId: 'sku-1', usageProbability: null },
      { enabled: true, serviceId: 'service-1', skuId: 'sku-2', usageProbability: null },
    ]);

    await waitFor(() => {
      expect(screen.getByText('Service detail destination')).toBeInTheDocument();
    });
  });

  test('adds a service picture in edit mode', async () => {
    const upsertSenaCatalog = vi.fn(async (payload) => payload);
    inventoryHook.mockReturnValue({
      catalog: sampleCatalog,
      isLoading: false,
      isSaving: false,
      renameCatalogEntity: vi.fn(async () => sampleCatalog),
      upsertSenaCatalog,
    });

    renderWithProviders('/catalog/services/service-1/edit', <ServiceFormRoute />, '/catalog/services/:serviceId/edit');

    fireEvent.click(findButtonByText('Choose image'));

    await waitFor(() => {
      expect(pickAndStoreImage).toHaveBeenCalledTimes(1);
      expect(findButtonByText('Replace image')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() => {
      expect(upsertSenaCatalog).toHaveBeenCalledTimes(1);
    });

    expect(upsertSenaCatalog.mock.calls[0]?.[0].services[0].imagePath).toBe('/tmp/service-image.png');
  });

  test('adds a service picture via drag and drop', async () => {
    const upsertSenaCatalog = vi.fn(async (payload) => payload);
    inventoryHook.mockReturnValue({
      catalog: sampleCatalog,
      isLoading: false,
      isSaving: false,
      renameCatalogEntity: vi.fn(async () => sampleCatalog),
      upsertSenaCatalog,
    });

    renderWithProviders('/catalog/services/service-1/edit', <ServiceFormRoute />, '/catalog/services/:serviceId/edit');

    const dropzone = screen.getByTestId('catalog-image-dropzone');
    const file = new File(['fake-image'], 'dropped.png', { type: 'image/png' });
    const dataTransfer = new DataTransfer();
    dataTransfer.items.add(file);
    fireEvent.dragOver(dropzone);
    const dropEvent = new MouseEvent('drop', { bubbles: true, cancelable: true });
    Object.defineProperty(dropEvent, 'dataTransfer', { value: dataTransfer });
    fireEvent(dropzone, dropEvent);

    await waitFor(() => {
      expect(storeDroppedImage).toHaveBeenCalledTimes(1);
      expect(findButtonByText('Replace image')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() => {
      expect(upsertSenaCatalog).toHaveBeenCalledTimes(1);
    });

    expect(upsertSenaCatalog.mock.calls[0]?.[0].services[0].imagePath).toBe('/tmp/dropped-service.png');
  });

  test('adds a service picture via clipboard paste', async () => {
    const upsertSenaCatalog = vi.fn(async (payload) => payload);
    inventoryHook.mockReturnValue({
      catalog: sampleCatalog,
      isLoading: false,
      isSaving: false,
      renameCatalogEntity: vi.fn(async () => sampleCatalog),
      upsertSenaCatalog,
    });

    renderWithProviders('/catalog/services/service-1/edit', <ServiceFormRoute />, '/catalog/services/:serviceId/edit');

    const dropzone = screen.getByTestId('catalog-image-dropzone');
    const file = new File(['fake-image'], 'pasted.png', { type: 'image/png' });
    const clipboardData = new DataTransfer();
    clipboardData.items.add(file);
    const pasteEvent = new Event('paste', { bubbles: true, cancelable: true });
    Object.defineProperty(pasteEvent, 'clipboardData', { value: clipboardData });
    fireEvent(dropzone, pasteEvent);

    await waitFor(() => {
      expect(storeDroppedImage).toHaveBeenCalledTimes(1);
      expect(findButtonByText('Replace image')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() => {
      expect(upsertSenaCatalog).toHaveBeenCalledTimes(1);
    });

    expect(upsertSenaCatalog.mock.calls[0]?.[0].services[0].imagePath).toBe('/tmp/dropped-service.png');
  });

  test('replaces the new service route so back from the created detail page returns to catalog', async () => {
    const upsertSenaCatalog = vi.fn(async (payload) => payload);
    inventoryHook.mockReturnValue({
      catalog: sampleCatalog,
      isLoading: false,
      isSaving: false,
      renameCatalogEntity: vi.fn(async () => sampleCatalog),
      upsertSenaCatalog,
    });
    window.sessionStorage.setItem(
      'banji.navigation-history',
      JSON.stringify([
        { key: 'catalog', to: '/catalog' },
        { key: 'service-new', to: '/catalog/services/new' },
      ]),
    );

    renderWithProviders('/catalog/services/new', <ServiceFormRoute />, '/catalog/services/new');

    fillNewServiceRequiredFields('Service New');
    fireEvent.click(screen.getByRole('button', { name: 'Create entry' }));

    await waitFor(() => {
      expect(upsertSenaCatalog).toHaveBeenCalledTimes(1);
      expect(screen.getByText('Service detail destination')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Back' }));

    await waitFor(() => {
      expect(screen.getByText('Catalog destination')).toBeInTheDocument();
    });
  });

  test('generates a unique service id when creating a new service', async () => {
    const createUniqueServiceId = vi.spyOn(senaCatalog, 'createUniqueServiceId').mockReturnValue('service-generated');
    const upsertSenaCatalog = vi.fn(async (payload) => payload);
    inventoryHook.mockReturnValue({
      catalog: sampleCatalog,
      isLoading: false,
      isSaving: false,
      renameCatalogEntity: vi.fn(async () => sampleCatalog),
      upsertSenaCatalog,
    });

    renderWithProviders('/catalog/services/new', <ServiceFormRoute />, '/catalog/services/new');

    fillNewServiceRequiredFields('Generated Service');
    fireEvent.click(screen.getByRole('button', { name: 'Create entry' }));

    await waitFor(() => {
      expect(createUniqueServiceId).toHaveBeenCalledWith(sampleCatalog);
      expect(upsertSenaCatalog).toHaveBeenCalledTimes(1);
    });

    expect(upsertSenaCatalog.mock.calls[0]?.[0].services.at(-1)).toMatchObject({
      serviceId: 'service-generated',
      name: 'Generated Service',
    });
    createUniqueServiceId.mockRestore();
  });

  test('keeps new service price blank and explains missing required fields on create', async () => {
    const upsertSenaCatalog = vi.fn(async (payload) => payload);
    inventoryHook.mockReturnValue({
      catalog: sampleCatalog,
      isLoading: false,
      isSaving: false,
      upsertSenaCatalog,
    });

    renderWithProviders('/catalog/services/new', <ServiceFormRoute />, '/catalog/services/new');

    const pricingPanel = screen.getByRole('heading', { level: 2, name: 'Commercial setup' }).closest('[data-slot="card"]');
    const [priceInput] = within((pricingPanel ?? document.body) as HTMLElement).getAllByRole('textbox');
    expect(priceInput).toHaveValue('');

    fireEvent.click(screen.getByRole('button', { name: 'Create entry' }));

    expect(upsertSenaCatalog).not.toHaveBeenCalled();
    expect(screen.getByText('Enter a service name before saving.')).toBeInTheDocument();
    expect(screen.getByText('Enter a service price before saving.')).toBeInTheDocument();
  });

  test('blocks edit save when service price is cleared', async () => {
    const upsertSenaCatalog = vi.fn(async (payload) => payload);
    inventoryHook.mockReturnValue({
      catalog: sampleCatalog,
      isLoading: false,
      isSaving: false,
      upsertSenaCatalog,
    });

    renderWithProviders('/catalog/services/service-1/edit', <ServiceFormRoute />, '/catalog/services/:serviceId/edit');

    const pricingPanel = screen.getByRole('heading', { level: 2, name: 'Commercial setup' }).closest('[data-slot="card"]');
    const [priceInput] = within((pricingPanel ?? document.body) as HTMLElement).getAllByRole('textbox');
    fireEvent.change(priceInput, { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    expect(upsertSenaCatalog).not.toHaveBeenCalled();
    expect(screen.getByText('Enter a service price before saving.')).toBeInTheDocument();
  });

  test('accepts KHR price input while saving USD internally', async () => {
    const upsertSenaCatalog = vi.fn(async (payload) => payload);
    preferencesHook.mockReturnValue({
      currency: 'KHR',
      language: 'en',
      usdToKhrExchangeRate: 4000,
      showExplanatoryTooltips: true,
      showFloatingTitleActions: false,
      showRightRailCards: true,
      t: (key: string) => getTranslation('en', key as never),
    });
    inventoryHook.mockReturnValue({
      catalog: sampleCatalog,
      isLoading: false,
      isSaving: false,
      upsertSenaCatalog,
    });

    renderWithProviders('/catalog/services/service-1/edit', <ServiceFormRoute />, '/catalog/services/:serviceId/edit');

    fireEvent.change(screen.getByDisplayValue('96,000'), { target: { value: '8000' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() => {
      expect(upsertSenaCatalog).toHaveBeenCalledTimes(1);
    });

    expect(upsertSenaCatalog.mock.calls[0]?.[0].services[0].price).toBe(2);
  });

  test('asks before leaving with unsaved service changes', async () => {
    renderWithProviders(
      '/catalog/services/service-1/edit',
      <>
        <Link to="/catalog">Catalog</Link>
        <ServiceFormRoute />
      </>,
      '/catalog/services/:serviceId/edit',
    );

    fireEvent.change(screen.getByDisplayValue('Service 1'), { target: { value: 'Service 1 Updated' } });
    fireEvent.click(screen.getByRole('link', { name: 'Catalog' }));

    expect(screen.getByRole('dialog')).toHaveTextContent('Discard changes?');
    expect(within(screen.getByRole('dialog')).getByRole('button', { name: 'Save changes' })).toHaveAttribute('data-variant', 'default');
    fireEvent.click(screen.getByRole('button', { name: 'Keep editing' }));
    expect(screen.getByDisplayValue('Service 1 Updated')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('link', { name: 'Catalog' }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Discard changes' }));

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
  });

  test('saves unsaved service changes before following navigation', async () => {
    const upsertSenaCatalog = vi.fn(async (payload) => payload);
    inventoryHook.mockReturnValue({
      catalog: sampleCatalog,
      isLoading: false,
      isSaving: false,
      renameCatalogEntity: vi.fn(async () => sampleCatalog),
      upsertSenaCatalog,
    });

    renderWithProviders(
      '/catalog/services/service-1/edit',
      <>
        <Link to="/catalog">Catalog</Link>
        <ServiceFormRoute />
      </>,
      '/catalog/services/:serviceId/edit',
    );

    fireEvent.change(screen.getByDisplayValue('Service 1'), { target: { value: 'Service 1 Updated' } });
    fireEvent.click(screen.getByRole('link', { name: 'Catalog' }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Save changes' }));

    await waitFor(() => {
      expect(upsertSenaCatalog).toHaveBeenCalledTimes(1);
      expect(screen.getByText('Catalog destination')).toBeInTheDocument();
    });
    expect(upsertSenaCatalog.mock.calls[0]?.[0].services[0]).toMatchObject({
      name: 'Service 1 Updated',
    });
  });

  test('disables prompt save when unsaved service changes are invalid', async () => {
    const upsertSenaCatalog = vi.fn(async (payload) => payload);
    inventoryHook.mockReturnValue({
      catalog: sampleCatalog,
      isLoading: false,
      isSaving: false,
      renameCatalogEntity: vi.fn(async () => sampleCatalog),
      upsertSenaCatalog,
    });

    renderWithProviders(
      '/catalog/services/service-1/edit',
      <>
        <Link to="/catalog">Catalog</Link>
        <ServiceFormRoute />
      </>,
      '/catalog/services/:serviceId/edit',
    );

    fireEvent.change(screen.getByDisplayValue('Service 1'), { target: { value: '' } });
    fireEvent.click(screen.getByRole('link', { name: 'Catalog' }));

    const saveButton = within(screen.getByRole('dialog')).getByRole('button', { name: 'Save changes' });
    expect(saveButton).toBeDisabled();
    fireEvent.click(saveButton);
    expect(upsertSenaCatalog).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog')).toHaveTextContent('Discard changes?');
  });

  test('asks before using the edit page back button with unsaved service changes', async () => {
    window.sessionStorage.setItem(
      'banji.navigation-history',
      JSON.stringify([
        { key: 'catalog', to: '/catalog' },
        { key: 'service-edit', to: '/catalog/services/service-1/edit' },
      ]),
    );

    renderWithProviders('/catalog/services/service-1/edit', <ServiceFormRoute />, '/catalog/services/:serviceId/edit');

    fireEvent.change(screen.getByDisplayValue('Service 1'), { target: { value: 'Service 1 Updated' } });
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));

    expect(screen.getByRole('dialog')).toHaveTextContent('Discard changes?');
    fireEvent.click(screen.getByRole('button', { name: 'Keep editing' }));
    expect(screen.getByDisplayValue('Service 1 Updated')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Discard changes' }));

    await waitFor(() => {
      expect(screen.getByText('Catalog destination')).toBeInTheDocument();
    });
  });
});

describe('deriveMeasuredGridColumnCount', () => {
  test('falls back to one column when dimensions are missing', () => {
    expect(deriveMeasuredGridColumnCount({ containerWidth: 0, maxItemWidth: 240 })).toBe(1);
    expect(deriveMeasuredGridColumnCount({ containerWidth: 900, maxItemWidth: 0 })).toBe(1);
  });

  test('computes the maximum number of columns that fit without overflow', () => {
    expect(deriveMeasuredGridColumnCount({ containerWidth: 900, gap: 12, maxItemWidth: 240 })).toBe(3);
    expect(deriveMeasuredGridColumnCount({ containerWidth: 760, gap: 12, maxItemWidth: 240 })).toBe(3);
    expect(deriveMeasuredGridColumnCount({ containerWidth: 500, gap: 12, maxItemWidth: 240 })).toBe(2);
    expect(deriveMeasuredGridColumnCount({ containerWidth: 220, gap: 12, maxItemWidth: 240 })).toBe(1);
  });
});
