import type { ReactNode } from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { Link, MemoryRouter, Route, Routes, useParams } from 'react-router-dom';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { RouteBackButton } from '@/components/system/page-navigation';
import * as senaCatalog from '@/lib/catalog/sena-catalog';
import { getTranslation, translateUiLiteral } from '@/lib/localization/translations';
import { NavigationHistoryProvider } from '@/state/navigation-history';
import { ServiceFormRoute } from './service-form';
import { deriveMeasuredGridColumnCount } from './service-form-layout';

const inventoryHook = vi.fn();
const preferencesHook = vi.fn();

vi.mock('@/state/inventory', () => ({
  useInventory: () => inventoryHook(),
}));

vi.mock('@/state/preferences', () => ({
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
    serviceRouteTree(element, path, {
      initialEntries,
      initialIndex: options?.initialIndex,
    }),
  );
}

function serviceRouteTree(
  element: ReactNode,
  path: string,
  options: { initialEntries: string[]; initialIndex?: number },
) {
  return (
    <MemoryRouter initialEntries={options.initialEntries} initialIndex={options.initialIndex}>
      <NavigationHistoryProvider>
        <Routes>
          <Route element={element} path={path} />
          <Route element={<div>Products destination</div>} path="/catalog" />
          <Route
            element={
              <>
                <ServiceDetailDestination />
                <RouteBackButton />
              </>
            }
            path="/catalog/services/:serviceId"
          />
        </Routes>
      </NavigationHistoryProvider>
    </MemoryRouter>
  );
}

function ServiceDetailDestination() {
  const { serviceId } = useParams();
  return <div>Service detail destination: {serviceId}</div>;
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

function chooseAttributePreset(name: string) {
  fireEvent.click(screen.getByRole('combobox', { name: /Attribute preset/i }));
  fireEvent.click(screen.getByRole('option', { name: new RegExp(`^${name}\\b`) }));
}

describe('ServiceFormRoute', () => {
  const pickAndStoreImage = vi.fn();
  const storeDroppedImage = vi.fn();
  const ingestSenaObservation = vi.fn();

  beforeEach(() => {
    window.sessionStorage.clear();
    window.localStorage.clear();
    ingestSenaObservation.mockReset();
    ingestSenaObservation.mockResolvedValue({ observationId: 'obs-catalog-edit' });
    pickAndStoreImage.mockReset();
    pickAndStoreImage.mockResolvedValue('/tmp/service-image.png');
    storeDroppedImage.mockReset();
    storeDroppedImage.mockResolvedValue('/tmp/dropped-service.png');
    window.kaurKhorDesktop = {
      ...(window.kaurKhorDesktop ?? {}),
      system: {
        ...(window.kaurKhorDesktop?.system ?? {}),
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
      ingestSenaObservation,
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
    const view = renderWithProviders('/catalog/services/service-1/edit', <ServiceFormRoute />, '/catalog/services/:serviceId/edit');

    expect(screen.getByRole('heading', { level: 1, name: 'Edit service' })).toBeInTheDocument();
    expect(screen.getByDisplayValue('Service 1')).toHaveFocus();
    expect(view.container.firstElementChild).toHaveClass('pb-32', 'md:pb-36');
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeDisabled();
    expect(screen.getByRole('heading', { level: 2, name: 'Core details' })).toBeInTheDocument();
    const attributesHeading = screen.getByRole('heading', { level: 2, name: 'Attributes' });
    const linkedSkusHeading = screen.getByRole('heading', { level: 2, name: 'Linked SKUs' });
    const commercialSetupHeading = screen.getByRole('heading', { level: 2, name: 'Commercial setup' });
    expect(attributesHeading).toBeInTheDocument();
    expect(linkedSkusHeading).toBeInTheDocument();
    expect(commercialSetupHeading).toBeInTheDocument();
    expect(attributesHeading.compareDocumentPosition(linkedSkusHeading) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(linkedSkusHeading.compareDocumentPosition(commercialSetupHeading) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByText('Name the service the way staff will recognize it.')).toBeInTheDocument();
    expect(screen.getByText('Choose every SKU normally consumed when this service is sold.')).toBeInTheDocument();
    expect(screen.queryByDisplayValue('service-1')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Search linked SKUs by name or description…')).toBeInTheDocument();
    expect(screen.getByText('1 linked SKUs selected')).toBeInTheDocument();
    expect(screen.getByTestId('linked-sku-grid')).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'SKU 1' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'SKU 2' })).not.toBeChecked();
    expect(screen.getAllByText('Supplier cost per unit: $4.00 · Customer selling price: $9.00').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Supplier cost per unit: $8.00 · Customer selling price: $15.00').length).toBeGreaterThan(0);
    expect(screen.queryByText('sku-1')).not.toBeInTheDocument();
  });

  test('focuses the name field on the new service page', () => {
    renderWithProviders('/catalog/services/new', <ServiceFormRoute />, '/catalog/services/new');

    expect(screen.getAllByRole('textbox')[0]).toHaveFocus();
  });

  test('creates service attribute variants with linked SKUs and service price', async () => {
    const upsertSenaCatalog = vi.fn(async (payload) => payload);
    inventoryHook.mockReturnValue({
      catalog: sampleCatalog,
      ingestSenaObservation,
      isLoading: false,
      isSaving: false,
      upsertSenaCatalog,
    });

    renderWithProviders('/catalog/services/new', <ServiceFormRoute />, '/catalog/services/new');

    fillNewServiceRequiredFields('Repair Visit');
    fireEvent.click(screen.getByRole('checkbox', { name: 'SKU 1' }));
    fireEvent.click(screen.getByRole('checkbox', { name: /Enable attributes/i }));
    chooseAttributePreset('Quality');
    fireEvent.click(screen.getByRole('button', { name: 'Add selected attribute' }));
    fireEvent.click(screen.getByRole('checkbox', { name: /Select option Premium/i }));

    fireEvent.click(screen.getByRole('button', { name: 'Create entry' }));

    await waitFor(() => {
      expect(upsertSenaCatalog).toHaveBeenCalledTimes(1);
    });

    const savedCatalog = upsertSenaCatalog.mock.calls[0]?.[0];
    const serviceNames = savedCatalog.services.map((entry: { name: string }) => entry.name);
    expect(serviceNames).toEqual(
      expect.arrayContaining(['Repair Visit', 'Repair Visit (Quality: Premium)']),
    );
    const variant = savedCatalog.services.find(
      (entry: { name: string }) => entry.name === 'Repair Visit (Quality: Premium)',
    );
    expect(variant).toMatchObject({
      price: 12,
      archived: false,
    });
    expect(savedCatalog.sharingMask).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ serviceId: variant.serviceId, skuId: 'sku-1', enabled: true }),
      ]),
    );
    expect(ingestSenaObservation).not.toHaveBeenCalled();
  });

  test('blocks oversized service attribute variant sets before saving', async () => {
    const upsertSenaCatalog = vi.fn(async (payload) => payload);
    inventoryHook.mockReturnValue({
      catalog: sampleCatalog,
      ingestSenaObservation,
      isLoading: false,
      isSaving: false,
      upsertSenaCatalog,
    });

    renderWithProviders('/catalog/services/new', <ServiceFormRoute />, '/catalog/services/new');

    fillNewServiceRequiredFields('Variant Service');
    fireEvent.click(screen.getByRole('checkbox', { name: /Enable attributes/i }));
    for (const preset of ['Size', 'Color', 'Quality']) {
      chooseAttributePreset(preset);
      fireEvent.click(screen.getByRole('button', { name: 'Add selected attribute' }));
    }
    for (const option of ['XS', 'S', 'M', 'L', 'XL', 'XXL', 'Black', 'White', 'Red', 'Blue', 'Green', 'Yellow', 'Pink', 'Purple', 'Gray', 'Brown', 'Standard', 'Premium', 'Economy', 'Limited']) {
      fireEvent.click(screen.getByRole('checkbox', { name: `Select option ${option}` }));
    }

    expect(screen.getByText('Choose 100 or fewer variants before saving.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Create entry' }));

    await waitFor(() => {
      expect(upsertSenaCatalog).not.toHaveBeenCalled();
    });
  });

  test('preserves dirty service text across catalog object refreshes', () => {
    const view = renderWithProviders('/catalog/services/service-1/edit', <ServiceFormRoute />, '/catalog/services/:serviceId/edit');

    fireEvent.change(screen.getByDisplayValue('Service 1'), { target: { value: 'Service 1 Dirty' } });
    inventoryHook.mockReturnValue({
      catalog: {
        ...sampleCatalog,
        services: [
          {
            ...sampleCatalog.services[0],
            name: 'Service 1 Refreshed',
          },
        ],
      },
      ingestSenaObservation,
      isLoading: false,
      isSaving: false,
      renameCatalogEntity: vi.fn(async () => sampleCatalog),
      upsertSenaCatalog: vi.fn(async (payload) => payload),
    });

    view.rerender(
      serviceRouteTree(<ServiceFormRoute />, '/catalog/services/:serviceId/edit', {
        initialEntries: ['/catalog/services/service-1/edit'],
      }),
    );

    expect(screen.getByDisplayValue('Service 1 Dirty')).toBeInTheDocument();
    expect(screen.queryByDisplayValue('Service 1 Refreshed')).not.toBeInTheDocument();
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
      ingestSenaObservation,
      isLoading: false,
      isSaving: false,
      renameCatalogEntity: vi.fn(async () => sampleCatalog),
      upsertSenaCatalog,
    });

    renderWithProviders('/catalog/services/service-1/edit', <ServiceFormRoute />, '/catalog/services/:serviceId/edit');

    fireEvent.change(screen.getByDisplayValue('Service 1'), { target: { value: 'Service 1 Updated' } });
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeEnabled();
    fireEvent.change(screen.getByDisplayValue('24'), { target: { value: '29' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() => {
      expect(upsertSenaCatalog).toHaveBeenCalledTimes(1);
      expect(ingestSenaObservation).toHaveBeenCalledTimes(1);
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
    ]);
    expect(ingestSenaObservation).toHaveBeenCalledWith(
      expect.objectContaining({
        servicePrices: [{ serviceId: 'service-1', price: 29 }],
        stockSnapshot: [],
        retailPrices: [],
        leadTimeHints: [],
      }),
    );

    await waitFor(() => {
      expect(screen.getByText(/Service detail destination/)).toBeInTheDocument();
    });
  });

  test('adds a service picture in edit mode', async () => {
    const upsertSenaCatalog = vi.fn(async (payload) => payload);
    inventoryHook.mockReturnValue({
      catalog: sampleCatalog,
      ingestSenaObservation,
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
    expect(ingestSenaObservation).not.toHaveBeenCalled();
  });

  test('forks a new service when linked SKUs change and keeps the current service active by default', async () => {
    const upsertSenaCatalog = vi.fn(async (payload) => payload);
    inventoryHook.mockReturnValue({
      catalog: sampleCatalog,
      ingestSenaObservation,
      isLoading: false,
      isSaving: false,
      renameCatalogEntity: vi.fn(async () => sampleCatalog),
      upsertSenaCatalog,
    });

    renderWithProviders('/catalog/services/service-1/edit', <ServiceFormRoute />, '/catalog/services/:serviceId/edit');

    fireEvent.click(screen.getByRole('checkbox', { name: 'SKU 2' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    const dialog = await screen.findByRole('dialog', { name: 'Create a new service for linked SKU changes' });
    expect(within(dialog).getByLabelText('New service name')).toHaveValue('Service 1 (copy)');
    expect(within(dialog).getByRole('checkbox', { name: 'Archive Service 1' })).not.toBeChecked();
    expect(within(dialog).getByText('Leave unchecked to keep Service 1 active alongside the new service.')).toBeInTheDocument();
    expect(upsertSenaCatalog).not.toHaveBeenCalled();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Create new service' }));

    await waitFor(() => {
      expect(upsertSenaCatalog).toHaveBeenCalledTimes(1);
    });

    const nextCatalog = upsertSenaCatalog.mock.calls[0]?.[0];
    const newService = nextCatalog.services.find((service: { serviceId: string }) => service.serviceId !== 'service-1');
    expect(newService).toBeDefined();
    expect(nextCatalog.services.find((service: { serviceId: string }) => service.serviceId === 'service-1')?.archived).toBe(false);
    expect(newService).toMatchObject({ archived: false, description: 'Style and fit', name: 'Service 1 (copy)', price: 24 });
    expect(nextCatalog.sharingMask).toEqual([
      { enabled: true, serviceId: 'service-1', skuId: 'sku-1', usageProbability: null },
      { enabled: true, serviceId: newService!.serviceId, skuId: 'sku-1', usageProbability: null },
      { enabled: true, serviceId: newService!.serviceId, skuId: 'sku-2', usageProbability: null },
    ]);
    expect(ingestSenaObservation).not.toHaveBeenCalled();
    await screen.findByText(`Service detail destination: ${newService!.serviceId}`);
  });

  test('archives the current service when requested from the linked SKU fork dialog', async () => {
    const upsertSenaCatalog = vi.fn(async (payload) => payload);
    inventoryHook.mockReturnValue({
      catalog: sampleCatalog,
      ingestSenaObservation,
      isLoading: false,
      isSaving: false,
      renameCatalogEntity: vi.fn(async () => sampleCatalog),
      upsertSenaCatalog,
    });

    renderWithProviders('/catalog/services/service-1/edit', <ServiceFormRoute />, '/catalog/services/:serviceId/edit');

    fireEvent.click(screen.getByRole('checkbox', { name: 'SKU 2' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    const dialog = await screen.findByRole('dialog', { name: 'Create a new service for linked SKU changes' });
    fireEvent.click(within(dialog).getByRole('checkbox', { name: 'Archive Service 1' }));
    fireEvent.change(within(dialog).getByLabelText('New service name'), { target: { value: 'Service 1 new recipe' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Create new service' }));

    await waitFor(() => {
      expect(upsertSenaCatalog).toHaveBeenCalledTimes(1);
    });

    const nextCatalog = upsertSenaCatalog.mock.calls[0]?.[0];
    const currentService = nextCatalog.services.find((service: { serviceId: string }) => service.serviceId === 'service-1');
    const newService = nextCatalog.services.find((service: { serviceId: string }) => service.serviceId !== 'service-1');
    expect(currentService?.archived).toBe(true);
    expect(newService).toMatchObject({ archived: false, name: 'Service 1 new recipe' });
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

  test('adds a service picture from page-level clipboard image paste', async () => {
    const upsertSenaCatalog = vi.fn(async (payload) => payload);
    inventoryHook.mockReturnValue({
      catalog: sampleCatalog,
      isLoading: false,
      isSaving: false,
      renameCatalogEntity: vi.fn(async () => sampleCatalog),
      upsertSenaCatalog,
    });

    renderWithProviders('/catalog/services/service-1/edit', <ServiceFormRoute />, '/catalog/services/:serviceId/edit');

    const file = new File(['fake-image'], 'page-pasted.png', { type: 'image/png' });
    const clipboardData = new DataTransfer();
    clipboardData.items.add(file);
    const pasteEvent = new Event('paste', { bubbles: true, cancelable: true });
    Object.defineProperty(pasteEvent, 'clipboardData', { value: clipboardData });
    fireEvent(document, pasteEvent);

    await waitFor(() => {
      expect(storeDroppedImage).toHaveBeenCalledTimes(1);
      expect(findButtonByText('Replace image')).toBeInTheDocument();
    });

    expect(pasteEvent.defaultPrevented).toBe(true);

    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() => {
      expect(upsertSenaCatalog).toHaveBeenCalledTimes(1);
    });

    expect(upsertSenaCatalog.mock.calls[0]?.[0].services[0].imagePath).toBe('/tmp/dropped-service.png');
  });

  test('adds a new service picture from page-level clipboard image paste', async () => {
    const upsertSenaCatalog = vi.fn(async (payload) => payload);
    inventoryHook.mockReturnValue({
      catalog: sampleCatalog,
      isLoading: false,
      isSaving: false,
      renameCatalogEntity: vi.fn(async () => sampleCatalog),
      upsertSenaCatalog,
    });

    renderWithProviders('/catalog/services/new', <ServiceFormRoute />, '/catalog/services/new');

    fillNewServiceRequiredFields('Page Pasted Service');
    const file = new File(['fake-image'], 'new-page-pasted.png', { type: 'image/png' });
    const clipboardData = new DataTransfer();
    clipboardData.items.add(file);
    const pasteEvent = new Event('paste', { bubbles: true, cancelable: true });
    Object.defineProperty(pasteEvent, 'clipboardData', { value: clipboardData });
    fireEvent(document, pasteEvent);

    await waitFor(() => {
      expect(storeDroppedImage).toHaveBeenCalledTimes(1);
      expect(findButtonByText('Replace image')).toBeInTheDocument();
    });

    expect(pasteEvent.defaultPrevented).toBe(true);

    fireEvent.click(screen.getByRole('button', { name: 'Create entry' }));

    await waitFor(() => {
      expect(upsertSenaCatalog).toHaveBeenCalledTimes(1);
    });

    const savedService = upsertSenaCatalog.mock.calls[0]?.[0].services.find(
      (service: { name: string }) => service.name === 'Page Pasted Service',
    );
    expect(savedService?.imagePath).toBe('/tmp/dropped-service.png');
  });

  test('localizes catalog image labels in Khmer mode', () => {
    preferencesHook.mockReturnValue({
      currency: 'USD',
      language: 'km',
      usdToKhrExchangeRate: 4000,
      showExplanatoryTooltips: true,
      showFloatingTitleActions: false,
      showRightRailCards: true,
      t: (key: string) => getTranslation('km', key as never),
    });

    renderWithProviders('/catalog/services/service-1/edit', <ServiceFormRoute />, '/catalog/services/:serviceId/edit');

    const picture = translateUiLiteral('km', 'Picture');
    const helper = translateUiLiteral(
      'km',
      'Choose, drop, or paste one PNG, JPEG, or WebP picture for this service. Kaur Khor will show it on supported item surfaces.',
    );
    const noPicture = translateUiLiteral('km', 'No picture selected.');
    const chooseImage = translateUiLiteral('km', 'Choose image');
    expect(screen.getByText(picture)).toBeInTheDocument();
    expect(screen.getByText(helper)).toBeInTheDocument();
    expect(screen.getByText(noPicture)).toBeInTheDocument();
    expect(findButtonByText(chooseImage)).toBeInTheDocument();
    expect(screen.queryByText('Picture')).not.toBeInTheDocument();
    expect(
      screen.queryByText(
        'Choose, drop, or paste one PNG, JPEG, or WebP picture for this service. Kaur Khor will show it on supported item surfaces.',
      ),
    ).not.toBeInTheDocument();
    expect(/[A-Za-z]/.test(`${picture} ${helper} ${noPicture} ${chooseImage}`)).toBe(false);
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
      'kaur-khor.navigation-history',
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
      expect(screen.getByText(/Service detail destination/)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Back' }));

    await waitFor(() => {
      expect(screen.getByText('Products destination')).toBeInTheDocument();
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
    const nameError = screen.getByText('Enter a service name before saving.');
    expect(nameError).toBeInTheDocument();
    expect(nameError).toHaveAttribute('data-error-flash-key', '1');
    expect(nameError).toHaveClass('motion-safe:animate-[kaur-khor-save-error-flash_1800ms_ease-in-out_1]');
    expect(screen.getByText('Enter a service price before saving.')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Create entry' }));
    expect(screen.getByText('Enter a service name before saving.')).toHaveAttribute('data-error-flash-key', '2');
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

  test('blocks edit save when service price draft is negative', async () => {
    const upsertSenaCatalog = vi.fn(async (payload) => payload);
    inventoryHook.mockReturnValue({
      catalog: {
        ...sampleCatalog,
        services: [{ ...sampleCatalog.services[0], price: -24 }],
      },
      isLoading: false,
      isSaving: false,
      upsertSenaCatalog,
    });

    renderWithProviders('/catalog/services/service-1/edit', <ServiceFormRoute />, '/catalog/services/:serviceId/edit');

    fireEvent.change(screen.getByDisplayValue('Service 1'), { target: { value: 'Service 1 Updated' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    expect(upsertSenaCatalog).not.toHaveBeenCalled();
  });

  test('localizes invalid service money validation in Khmer mode', async () => {
    preferencesHook.mockReturnValue({
      currency: 'USD',
      language: 'km',
      usdToKhrExchangeRate: 4000,
      showExplanatoryTooltips: true,
      showFloatingTitleActions: false,
      showRightRailCards: true,
      t: (key: string) => getTranslation('km', key as never),
    });
    const upsertSenaCatalog = vi.fn(async (payload) => payload);
    inventoryHook.mockReturnValue({
      catalog: {
        ...sampleCatalog,
        services: [{ ...sampleCatalog.services[0], price: -24 }],
      },
      isLoading: false,
      isSaving: false,
      upsertSenaCatalog,
    });

    renderWithProviders('/catalog/services/service-1/edit', <ServiceFormRoute />, '/catalog/services/:serviceId/edit');

    fireEvent.change(screen.getByDisplayValue('Service 1'), { target: { value: 'Service 1 Updated' } });
    fireEvent.click(screen.getByRole('button', { name: translateUiLiteral('km', 'Save changes') }));

    const priceError = translateUiLiteral('km', 'Enter a non-negative finite service price before saving.');
    expect(screen.getByText(priceError)).toBeInTheDocument();
    expect(/[A-Za-z]/.test(priceError)).toBe(false);
    expect(upsertSenaCatalog).not.toHaveBeenCalled();
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
      ingestSenaObservation,
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
    expect(ingestSenaObservation).toHaveBeenCalledWith(
      expect.objectContaining({
        servicePrices: [{ serviceId: 'service-1', price: 2 }],
      }),
    );
  });

  test('does not write invalid service money drafts into saved catalog payloads', async () => {
    const upsertSenaCatalog = vi.fn(async (payload) => payload);
    inventoryHook.mockReturnValue({
      catalog: sampleCatalog,
      ingestSenaObservation,
      isLoading: false,
      isSaving: false,
      upsertSenaCatalog,
    });

    renderWithProviders('/catalog/services/service-1/edit', <ServiceFormRoute />, '/catalog/services/:serviceId/edit');

    const pricingPanel = screen.getByRole('heading', { level: 2, name: 'Commercial setup' }).closest('[data-slot="card"]');
    const [priceInput] = within((pricingPanel ?? document.body) as HTMLElement).getAllByRole('textbox');

    fireEvent.change(priceInput, { target: { value: 'not money' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(upsertSenaCatalog).not.toHaveBeenCalled();

    fireEvent.change(priceInput, { target: { value: '27.50' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() => expect(upsertSenaCatalog).toHaveBeenCalledTimes(1));
    expect(upsertSenaCatalog.mock.calls[0]?.[0].services[0].price).toBe(27.5);
    expect(Number.isFinite(upsertSenaCatalog.mock.calls[0]?.[0].services[0].price)).toBe(true);
  });

  test('asks before leaving with unsaved service changes', async () => {
    renderWithProviders(
      '/catalog/services/service-1/edit',
      <>
        <Link to="/catalog">Products</Link>
        <ServiceFormRoute />
      </>,
      '/catalog/services/:serviceId/edit',
    );

    fireEvent.change(screen.getByDisplayValue('Service 1'), { target: { value: 'Service 1 Updated' } });
    fireEvent.click(screen.getByRole('link', { name: 'Products' }));

    expect(screen.getByRole('dialog')).toHaveTextContent('Discard changes?');
    expect(within(screen.getByRole('dialog')).getByRole('button', { name: 'Save changes' })).toHaveAttribute('data-variant', 'default');
    fireEvent.click(screen.getByRole('button', { name: 'Keep editing' }));
    expect(screen.getByDisplayValue('Service 1 Updated')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('link', { name: 'Products' }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Discard changes' }));

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
  });

  test('saves unsaved service changes before following navigation', async () => {
    const upsertSenaCatalog = vi.fn(async (payload) => payload);
    inventoryHook.mockReturnValue({
      catalog: sampleCatalog,
      ingestSenaObservation,
      isLoading: false,
      isSaving: false,
      renameCatalogEntity: vi.fn(async () => sampleCatalog),
      upsertSenaCatalog,
    });

    renderWithProviders(
      '/catalog/services/service-1/edit',
      <>
        <Link to="/catalog">Products</Link>
        <ServiceFormRoute />
      </>,
      '/catalog/services/:serviceId/edit',
    );

    fireEvent.change(screen.getByDisplayValue('Service 1'), { target: { value: 'Service 1 Updated' } });
    fireEvent.click(screen.getByRole('link', { name: 'Products' }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Save changes' }));

    await waitFor(() => {
      expect(upsertSenaCatalog).toHaveBeenCalledTimes(1);
      expect(screen.getByText('Products destination')).toBeInTheDocument();
    });
    expect(upsertSenaCatalog.mock.calls[0]?.[0].services[0]).toMatchObject({
      name: 'Service 1 Updated',
    });
    expect(ingestSenaObservation).not.toHaveBeenCalled();
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
        <Link to="/catalog">Products</Link>
        <ServiceFormRoute />
      </>,
      '/catalog/services/:serviceId/edit',
    );

    fireEvent.change(screen.getByDisplayValue('Service 1'), { target: { value: '' } });
    fireEvent.click(screen.getByRole('link', { name: 'Products' }));

    const saveButton = within(screen.getByRole('dialog')).getByRole('button', { name: 'Save changes' });
    expect(saveButton).toBeDisabled();
    fireEvent.click(saveButton);
    expect(upsertSenaCatalog).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog')).toHaveTextContent('Discard changes?');
  });

  test('asks before using the edit page back button with unsaved service changes', async () => {
    window.sessionStorage.setItem(
      'kaur-khor.navigation-history',
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
      expect(screen.getByText('Products destination')).toBeInTheDocument();
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
