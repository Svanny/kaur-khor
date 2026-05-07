import type { ReactNode } from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Link, MemoryRouter, Route, Routes, useNavigate } from 'react-router-dom';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import * as senaCatalog from '@/lib/sena-catalog';
import { RouteBackButton } from '@/components/system/page-navigation';
import { leadTimeVariabilityLabel } from '@shared/sena-lead-time';
import { getTranslation, translateUiLiteral } from '@/lib/translations';
import { NavigationHistoryProvider } from '@/state/navigation-history';
import { SkuFormRoute } from './sku-form';

const inventoryHook = vi.fn();
const preferencesHook = vi.fn();

if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => {};
}

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
      supplierName: 'Mekong Looms',
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

const sampleSnapshot = {
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
  services: [],
  ranking: [],
  sist: {
    status: {
      state: 'ready',
      updatedAt: null,
      reportCount: 0,
      confidence: 'low',
      reason: null,
    },
    settings: {
      targetServiceLevel: 0.95,
      forecastHorizonDays: 14,
      particleCount: 512,
      smoothingWindowReports: 90,
    },
    asOf: null,
    topRegime: null,
    pendingReorderCount: 0,
    highRiskSkuIds: [],
    skuInsights: [],
  },
};

function renderWithProviders(
  route: string,
  element: ReactNode,
  path: string,
  options?: { initialEntries?: string[]; initialIndex?: number },
) {
  const initialEntries = options?.initialEntries ?? [route];
  return render(
    skuRouteTree(element, path, {
      initialEntries,
      initialIndex: options?.initialIndex,
    }),
  );
}

function skuRouteTree(
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
          <Route element={<div>Help destination</div>} path="/settings/help" />
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
    </MemoryRouter>
  );
}

function ImperativeCatalogLink() {
  const navigate = useNavigate();

  return (
    <Link to="/catalog" onClick={() => navigate('/catalog')}>
      Products
    </Link>
  );
}

function findButtonByText(text: string) {
  return screen.getAllByRole('button').find((button) => button.textContent?.includes(text)) as HTMLButtonElement;
}

function fillNewSkuRequiredFields(name: string) {
  const [skuNameInput] = screen.getAllByRole('textbox');
  const pricingPanel = screen.getByRole('heading', { level: 2, name: 'Commercial setup' }).closest('[data-slot="card"]');
  const [costPerUnitInput] = within((pricingPanel ?? document.body) as HTMLElement).getAllByRole('textbox');
  const planningPanel = screen.getByRole('heading', { level: 2, name: 'Planning inputs' }).closest('[data-slot="card"]');
  const [leadTimeMeanInput] = within((planningPanel ?? document.body) as HTMLElement).getAllByRole('textbox');

  fireEvent.change(skuNameInput, { target: { value: name } });
  fireEvent.click(screen.getByRole('combobox', { name: 'Supplier' }));
  fireEvent.click(screen.getByRole('option', { name: 'Mekong Looms' }));
  fireEvent.change(costPerUnitInput, { target: { value: '12' } });
  fireEvent.change(leadTimeMeanInput, { target: { value: '5' } });
  fireEvent.click(screen.getByRole('combobox', { name: 'ETA variation' }));
  fireEvent.click(screen.getByRole('option', { name: new RegExp(`^${leadTimeVariabilityLabel('normal')}\\b`) }));
}

function chooseAttributePreset(name: string) {
  fireEvent.click(screen.getByRole('combobox', { name: /Attribute preset/i }));
  fireEvent.click(screen.getByRole('option', { name: new RegExp(`^${name}\\b`) }));
}

describe('SkuFormRoute', () => {
  const pickAndStoreImage = vi.fn();
  const storeDroppedImage = vi.fn();
  const ingestSenaObservation = vi.fn();

  beforeEach(() => {
    window.sessionStorage.clear();
    window.localStorage.clear();
    ingestSenaObservation.mockReset();
    ingestSenaObservation.mockResolvedValue({ observationId: 'obs-catalog-edit' });
    preferencesHook.mockReturnValue({
      currency: 'USD',
      language: 'en',
      usdToKhrExchangeRate: 4000,
      showExplanatoryTooltips: true,
      showFloatingTitleActions: false,
      showRightRailCards: true,
      t: (key: string) => getTranslation('en', key as never),
    });
    pickAndStoreImage.mockReset();
    pickAndStoreImage.mockResolvedValue('/tmp/sku-image.png');
    storeDroppedImage.mockReset();
    storeDroppedImage.mockResolvedValue('/tmp/dropped-sku.png');
    window.kaurKhorDesktop = {
      ...(window.kaurKhorDesktop ?? {}),
      system: {
        ...(window.kaurKhorDesktop?.system ?? {}),
        pickAndStoreImage,
        storeDroppedImage,
      },
    };
    inventoryHook.mockReturnValue({
      catalog: sampleCatalog,
      ingestSenaObservation,
      isSaving: false,
      snapshot: sampleSnapshot,
      upsertSenaCatalog: vi.fn(async (payload) => payload),
    });
  });

  test('renders the edit page with detail-style hero chrome and planning inputs', async () => {
    const view = renderWithProviders('/catalog/skus/sku-1/edit', <SkuFormRoute />, '/catalog/skus/:skuId/edit');

    expect(screen.getByRole('heading', { level: 1, name: 'Edit SKU' })).toBeInTheDocument();
    expect(view.container.firstElementChild).toHaveClass('pb-32', 'md:pb-36');
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Save changes' })).toBeDisabled();
    });
    expect(screen.getByRole('button', { name: 'Details' })).toBeInTheDocument();
    const heroActions = screen.getByRole('button', { name: 'Save changes' }).parentElement;
    expect(within(heroActions as HTMLElement).getAllByRole('button').map((button) => button.textContent)).toEqual([
      'Details',
      'Save changes',
    ]);
    expect(screen.getByRole('heading', { level: 2, name: 'Core details' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'Attributes' })).toBeInTheDocument();
    expect(screen.getByText('Name the SKU the way staff will search for it.')).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Supplier' })).toHaveTextContent('Mekong Looms');
    expect(screen.getByText('Keep the current landed or replacement unit cost here.')).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: /sell as product/i })).toBeChecked();
    expect(screen.queryByDisplayValue('sku-1')).not.toBeInTheDocument();
    expect(screen.getByDisplayValue('5')).toHaveValue('5');
    expect(screen.getByDisplayValue('1')).toHaveValue('1');
    await waitFor(() => {
      expect(screen.getByRole('combobox', { name: 'ETA variation' })).toHaveTextContent('Custom');
    });
  });

  test('creates attribute variants while keeping the base SKU', async () => {
    const upsertSenaCatalog = vi.fn(async (payload) => payload);
    inventoryHook.mockReturnValue({
      catalog: sampleCatalog,
      isSaving: false,
      snapshot: sampleSnapshot,
      upsertSenaCatalog,
    });

    renderWithProviders('/catalog/skus/new', <SkuFormRoute />, '/catalog/skus/new');

    fillNewSkuRequiredFields('Hotdog Shirt');
    fireEvent.click(screen.getByRole('checkbox', { name: /Enable attributes/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Add selected attribute' }));
    fireEvent.click(screen.getByRole('checkbox', { name: /Select option XXL/i }));
    chooseAttributePreset('Color');
    fireEvent.click(screen.getByRole('button', { name: 'Add selected attribute' }));
    fireEvent.click(screen.getByRole('checkbox', { name: /Select option Blue/i }));

    expect(screen.getByText('1 variant will be created')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Create entry' }));

    await waitFor(() => {
      expect(upsertSenaCatalog).toHaveBeenCalledTimes(1);
    });

    const savedCatalog = upsertSenaCatalog.mock.calls[0]?.[0];
    expect(savedCatalog.skus.map((entry: { name: string }) => entry.name)).toEqual(
      expect.arrayContaining(['Hotdog Shirt', 'Hotdog Shirt (Size: XXL, Color: Blue)']),
    );
    const variant = savedCatalog.skus.find(
      (entry: { name: string }) => entry.name === 'Hotdog Shirt (Size: XXL, Color: Blue)',
    );
    expect(variant).toMatchObject({
      costPerUnit: 12,
      leadTimeMeanDaysHint: 5,
      soldAsProduct: false,
      supplierName: 'Mekong Looms',
    });
    expect(ingestSenaObservation).not.toHaveBeenCalled();
  });

  test('creates every selected SKU attribute combination', async () => {
    const upsertSenaCatalog = vi.fn(async (payload) => payload);
    inventoryHook.mockReturnValue({
      catalog: sampleCatalog,
      isSaving: false,
      snapshot: sampleSnapshot,
      upsertSenaCatalog,
    });

    renderWithProviders('/catalog/skus/new', <SkuFormRoute />, '/catalog/skus/new');

    fillNewSkuRequiredFields('Bottle');
    fireEvent.click(screen.getByRole('checkbox', { name: /Enable attributes/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Add selected attribute' }));
    fireEvent.click(screen.getByRole('checkbox', { name: /Select option S/i }));
    fireEvent.click(screen.getByRole('checkbox', { name: /Select option M/i }));

    expect(screen.getByText('2 variants will be created')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Create entry' }));

    await waitFor(() => {
      expect(upsertSenaCatalog).toHaveBeenCalledTimes(1);
    });

    expect(upsertSenaCatalog.mock.calls[0]?.[0].skus.map((entry: { name: string }) => entry.name)).toEqual(
      expect.arrayContaining(['Bottle', 'Bottle (Size: S)', 'Bottle (Size: M)']),
    );
  });

  test('adds a new option while another option is being renamed', async () => {
    const user = userEvent.setup();

    renderWithProviders('/catalog/skus/new', <SkuFormRoute />, '/catalog/skus/new');

    fillNewSkuRequiredFields('Bottle');
    fireEvent.click(screen.getByRole('checkbox', { name: /Enable attributes/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Add selected attribute' }));

    await user.click(screen.getByRole('button', { name: 'XS' }));
    expect(screen.getByRole('textbox', { name: 'Option name' })).toHaveValue('XS');

    await user.click(screen.getByRole('button', { name: 'Add option' }));

    expect(screen.getByRole('textbox', { name: 'Option name' })).toHaveValue('');
    expect(screen.getByRole('button', { name: 'XS' })).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Enter option name')).toBeInTheDocument();
  });

  test('saves edit-mode changes without navigating away from the editor', async () => {
    const upsertSenaCatalog = vi.fn(async (payload) => payload);
    inventoryHook.mockReturnValue({
      catalog: sampleCatalog,
      ingestSenaObservation,
      isSaving: false,
      snapshot: sampleSnapshot,
      upsertSenaCatalog,
    });

    renderWithProviders('/catalog/skus/sku-1/edit', <SkuFormRoute />, '/catalog/skus/:skuId/edit');

    fireEvent.change(screen.getByDisplayValue('SKU 1'), { target: { value: 'SKU 1 Updated' } });
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() => {
      expect(upsertSenaCatalog).toHaveBeenCalledTimes(1);
      expect(screen.getByRole('button', { name: 'Save changes' })).toBeDisabled();
    });

    const savedCatalog = upsertSenaCatalog.mock.calls[0]?.[0];
    expect(savedCatalog.schemaVersion).toBe(1);
    expect(savedCatalog.services).toEqual(sampleCatalog.services);
    expect(savedCatalog.bundles).toEqual([]);
    expect(savedCatalog.sharingMask).toEqual([]);
    expect(savedCatalog.skus[0]).toMatchObject({
      costPerUnit: 4,
      description: 'Cotton tee',
      supplierName: 'Mekong Looms',
      name: 'SKU 1 Updated',
      leadTimeMeanDaysHint: 5,
      productPrice: 9,
      skuId: 'sku-1',
      soldAsProduct: true,
    });
    expect(savedCatalog.skus[0].leadTimeStdDaysHint).toBeCloseTo(1);

    expect(screen.queryByText('SKU detail destination')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: 'Edit SKU' })).toBeInTheDocument();
    expect(ingestSenaObservation).not.toHaveBeenCalled();
  });

  test('appends stock history when editing SKU cost', async () => {
    const upsertSenaCatalog = vi.fn(async (payload) => payload);
    inventoryHook.mockReturnValue({
      catalog: sampleCatalog,
      ingestSenaObservation,
      isSaving: false,
      snapshot: sampleSnapshot,
      upsertSenaCatalog,
    });

    renderWithProviders('/catalog/skus/sku-1/edit', <SkuFormRoute />, '/catalog/skus/:skuId/edit');

    const pricingPanel = screen.getByRole('heading', { level: 2, name: 'Commercial setup' }).closest('[data-slot="card"]');
    const [costInput] = within((pricingPanel ?? document.body) as HTMLElement).getAllByRole('textbox');
    fireEvent.change(costInput, { target: { value: '6' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() => {
      expect(upsertSenaCatalog).toHaveBeenCalledTimes(1);
      expect(ingestSenaObservation).toHaveBeenCalledTimes(1);
    });

    expect(ingestSenaObservation).toHaveBeenCalledWith(
      expect.objectContaining({
        stockSnapshot: [{ skuId: 'sku-1', unitsInStock: 12, costPerUnit: 6, productPrice: 9 }],
        retailPrices: [],
        leadTimeHints: [],
      }),
    );
  });

  test('appends retail price history when editing SKU product price', async () => {
    const upsertSenaCatalog = vi.fn(async (payload) => payload);
    inventoryHook.mockReturnValue({
      catalog: sampleCatalog,
      ingestSenaObservation,
      isSaving: false,
      snapshot: sampleSnapshot,
      upsertSenaCatalog,
    });

    renderWithProviders('/catalog/skus/sku-1/edit', <SkuFormRoute />, '/catalog/skus/:skuId/edit');

    const pricingPanel = screen.getByRole('heading', { level: 2, name: 'Commercial setup' }).closest('[data-slot="card"]');
    const [, priceInput] = within((pricingPanel ?? document.body) as HTMLElement).getAllByRole('textbox');
    fireEvent.change(priceInput, { target: { value: '11' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() => {
      expect(upsertSenaCatalog).toHaveBeenCalledTimes(1);
      expect(ingestSenaObservation).toHaveBeenCalledTimes(1);
    });

    expect(ingestSenaObservation).toHaveBeenCalledWith(
      expect.objectContaining({
        stockSnapshot: [],
        retailPrices: [{ skuId: 'sku-1', price: 11 }],
        leadTimeHints: [],
      }),
    );
  });

  test('opens SKU details from the edit page details action', async () => {
    renderWithProviders('/catalog/skus/sku-1/edit', <SkuFormRoute />, '/catalog/skus/:skuId/edit');

    fireEvent.click(screen.getByRole('button', { name: 'Details' }));

    await waitFor(() => {
      expect(screen.getByText('SKU detail destination')).toBeInTheDocument();
    });
  });

  test('adds a sku picture in edit mode', async () => {
    const upsertSenaCatalog = vi.fn(async (payload) => payload);
    inventoryHook.mockReturnValue({
      catalog: sampleCatalog,
      ingestSenaObservation,
      isSaving: false,
      snapshot: sampleSnapshot,
      upsertSenaCatalog,
    });

    renderWithProviders('/catalog/skus/sku-1/edit', <SkuFormRoute />, '/catalog/skus/:skuId/edit');

    fireEvent.click(findButtonByText('Choose image'));

    await waitFor(() => {
      expect(pickAndStoreImage).toHaveBeenCalledTimes(1);
      expect(findButtonByText('Replace image')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() => {
      expect(upsertSenaCatalog).toHaveBeenCalledTimes(1);
    });

    expect(upsertSenaCatalog.mock.calls[0]?.[0].skus[0].imagePath).toBe('/tmp/sku-image.png');
    expect(ingestSenaObservation).not.toHaveBeenCalled();
  });

  test('shows a field error when choosing a sku picture fails', async () => {
    pickAndStoreImage.mockRejectedValueOnce(new Error('Image storage failed'));
    inventoryHook.mockReturnValue({
      catalog: sampleCatalog,
      isSaving: false,
      upsertSenaCatalog: vi.fn(async (payload) => payload),
    });

    renderWithProviders('/catalog/skus/sku-1/edit', <SkuFormRoute />, '/catalog/skus/:skuId/edit');

    fireEvent.click(findButtonByText('Choose image'));

    await waitFor(() => {
      expect(screen.getByText('Image storage failed')).toBeInTheDocument();
    });
    expect(findButtonByText('Choose image')).toBeInTheDocument();
  });

  test('adds a sku picture via drag and drop', async () => {
    const upsertSenaCatalog = vi.fn(async (payload) => payload);
    inventoryHook.mockReturnValue({
      catalog: sampleCatalog,
      isSaving: false,
      upsertSenaCatalog,
    });

    renderWithProviders('/catalog/skus/sku-1/edit', <SkuFormRoute />, '/catalog/skus/:skuId/edit');

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

    expect(upsertSenaCatalog.mock.calls[0]?.[0].skus[0].imagePath).toBe('/tmp/dropped-sku.png');
  });

  test('shows a field error when dropping a sku picture fails', async () => {
    storeDroppedImage.mockRejectedValueOnce(new Error('Dropped image failed'));
    inventoryHook.mockReturnValue({
      catalog: sampleCatalog,
      isSaving: false,
      upsertSenaCatalog: vi.fn(async (payload) => payload),
    });

    renderWithProviders('/catalog/skus/sku-1/edit', <SkuFormRoute />, '/catalog/skus/:skuId/edit');

    const dropzone = screen.getByTestId('catalog-image-dropzone');
    const file = new File(['fake-image'], 'dropped.png', { type: 'image/png' });
    const dataTransfer = new DataTransfer();
    dataTransfer.items.add(file);
    fireEvent.dragOver(dropzone);
    const dropEvent = new MouseEvent('drop', { bubbles: true, cancelable: true });
    Object.defineProperty(dropEvent, 'dataTransfer', { value: dataTransfer });
    fireEvent(dropzone, dropEvent);

    await waitFor(() => {
      expect(screen.getByText('Dropped image failed')).toBeInTheDocument();
    });
    expect(findButtonByText('Choose image')).toBeInTheDocument();
  });

  test('adds a sku picture via clipboard paste', async () => {
    const upsertSenaCatalog = vi.fn(async (payload) => payload);
    inventoryHook.mockReturnValue({
      catalog: sampleCatalog,
      isSaving: false,
      upsertSenaCatalog,
    });

    renderWithProviders('/catalog/skus/sku-1/edit', <SkuFormRoute />, '/catalog/skus/:skuId/edit');

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

    expect(upsertSenaCatalog.mock.calls[0]?.[0].skus[0].imagePath).toBe('/tmp/dropped-sku.png');
  });

  test('sends MIME type for extensionless pasted image files', async () => {
    const upsertSenaCatalog = vi.fn(async (payload) => payload);
    inventoryHook.mockReturnValue({
      catalog: sampleCatalog,
      isSaving: false,
      upsertSenaCatalog,
    });

    renderWithProviders('/catalog/skus/sku-1/edit', <SkuFormRoute />, '/catalog/skus/:skuId/edit');

    const dropzone = screen.getByTestId('catalog-image-dropzone');
    const file = new File(['fake-image'], 'clipboard-image', { type: 'image/png' });
    const clipboardData = new DataTransfer();
    clipboardData.items.add(file);
    const pasteEvent = new Event('paste', { bubbles: true, cancelable: true });
    Object.defineProperty(pasteEvent, 'clipboardData', { value: clipboardData });
    fireEvent(dropzone, pasteEvent);

    await waitFor(() => {
      expect(storeDroppedImage).toHaveBeenCalledTimes(1);
    });

    expect(storeDroppedImage.mock.calls[0]?.[0]).toMatchObject({
      name: 'clipboard-image',
      type: 'image/png',
    });
  });

  test('does not hijack page-level clipboard image paste outside the image field', async () => {
    const upsertSenaCatalog = vi.fn(async (payload) => payload);
    inventoryHook.mockReturnValue({
      catalog: sampleCatalog,
      isSaving: false,
      upsertSenaCatalog,
    });

    renderWithProviders('/catalog/skus/sku-1/edit', <SkuFormRoute />, '/catalog/skus/:skuId/edit');

    const file = new File(['fake-image'], 'page-pasted.png', { type: 'image/png' });
    const clipboardData = new DataTransfer();
    clipboardData.items.add(file);
    const pasteEvent = new Event('paste', { bubbles: true, cancelable: true });
    Object.defineProperty(pasteEvent, 'clipboardData', { value: clipboardData });
    fireEvent(document, pasteEvent);

    expect(storeDroppedImage).not.toHaveBeenCalled();
    expect(pasteEvent.defaultPrevented).toBe(false);
    expect(findButtonByText('Choose image')).toBeInTheDocument();
  });

  test('adds a sku picture via clipboard paste using items fallback', async () => {
    const upsertSenaCatalog = vi.fn(async (payload) => payload);
    inventoryHook.mockReturnValue({
      catalog: sampleCatalog,
      isSaving: false,
      upsertSenaCatalog,
    });

    renderWithProviders('/catalog/skus/sku-1/edit', <SkuFormRoute />, '/catalog/skus/:skuId/edit');

    const dropzone = screen.getByTestId('catalog-image-dropzone');
    const file = new File(['fake-image'], 'pasted-items.png', { type: 'image/png' });
    const clipboardData = {
      files: [] as File[],
      items: [
        {
          kind: 'file',
          type: 'image/png',
          getAsFile: () => file,
        },
      ],
    };
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

    expect(upsertSenaCatalog.mock.calls[0]?.[0].skus[0].imagePath).toBe('/tmp/dropped-sku.png');
  });

  test('accepts WebP images during drag and drop', async () => {
    const upsertSenaCatalog = vi.fn(async (payload) => payload);
    inventoryHook.mockReturnValue({
      catalog: sampleCatalog,
      isSaving: false,
      upsertSenaCatalog,
    });

    renderWithProviders('/catalog/skus/sku-1/edit', <SkuFormRoute />, '/catalog/skus/:skuId/edit');

    const dropzone = screen.getByTestId('catalog-image-dropzone');
    const file = new File(['fake-image'], 'dropped.webp', { type: 'image/webp' });
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

    expect(upsertSenaCatalog.mock.calls[0]?.[0].skus[0].imagePath).toBe('/tmp/dropped-sku.png');
  });

  test('accepts supported image extensions during drag and drop when file type is empty', async () => {
    const upsertSenaCatalog = vi.fn(async (payload) => payload);
    inventoryHook.mockReturnValue({
      catalog: sampleCatalog,
      isSaving: false,
      upsertSenaCatalog,
    });

    renderWithProviders('/catalog/skus/sku-1/edit', <SkuFormRoute />, '/catalog/skus/:skuId/edit');

    const dropzone = screen.getByTestId('catalog-image-dropzone');
    const file = new File(['fake-image'], 'dropped.webp', { type: '' });
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

    expect(upsertSenaCatalog.mock.calls[0]?.[0].skus[0].imagePath).toBe('/tmp/dropped-sku.png');
  });

  test('ignores unsupported image types during clipboard paste', async () => {
    const upsertSenaCatalog = vi.fn(async (payload) => payload);
    inventoryHook.mockReturnValue({
      catalog: sampleCatalog,
      isSaving: false,
      upsertSenaCatalog,
    });

    renderWithProviders('/catalog/skus/sku-1/edit', <SkuFormRoute />, '/catalog/skus/:skuId/edit');

    const dropzone = screen.getByTestId('catalog-image-dropzone');
    const file = new File(['fake-image'], 'pasted.gif', { type: 'image/gif' });
    const clipboardData = new DataTransfer();
    clipboardData.items.add(file);
    const pasteEvent = new Event('paste', { bubbles: true, cancelable: true });
    Object.defineProperty(pasteEvent, 'clipboardData', { value: clipboardData });
    fireEvent(dropzone, pasteEvent);

    await waitFor(() => {
      expect(storeDroppedImage).not.toHaveBeenCalled();
    });
    expect(findButtonByText('Replace image')).toBeUndefined();
  });

  test('accepts WebP images during clipboard paste using items fallback', async () => {
    const upsertSenaCatalog = vi.fn(async (payload) => payload);
    inventoryHook.mockReturnValue({
      catalog: sampleCatalog,
      isSaving: false,
      upsertSenaCatalog,
    });

    renderWithProviders('/catalog/skus/sku-1/edit', <SkuFormRoute />, '/catalog/skus/:skuId/edit');

    const dropzone = screen.getByTestId('catalog-image-dropzone');
    const file = new File(['fake-image'], 'pasted-items.webp', { type: 'image/webp' });
    const clipboardData = {
      files: [] as File[],
      items: [
        {
          kind: 'file',
          type: 'image/webp',
          getAsFile: () => file,
        },
      ],
    };
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

    expect(upsertSenaCatalog.mock.calls[0]?.[0].skus[0].imagePath).toBe('/tmp/dropped-sku.png');
  });

  test('accepts supported image extensions during clipboard paste when file type is empty', async () => {
    const upsertSenaCatalog = vi.fn(async (payload) => payload);
    inventoryHook.mockReturnValue({
      catalog: sampleCatalog,
      isSaving: false,
      upsertSenaCatalog,
    });

    renderWithProviders('/catalog/skus/sku-1/edit', <SkuFormRoute />, '/catalog/skus/:skuId/edit');

    const dropzone = screen.getByTestId('catalog-image-dropzone');
    const file = new File(['fake-image'], 'pasted-items.png', { type: '' });
    const clipboardData = {
      files: [] as File[],
      items: [
        {
          kind: 'file',
          type: '',
          getAsFile: () => file,
        },
      ],
    };
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

    expect(upsertSenaCatalog.mock.calls[0]?.[0].skus[0].imagePath).toBe('/tmp/dropped-sku.png');
  });

  test('does not swallow non-image clipboard paste', async () => {
    inventoryHook.mockReturnValue({
      catalog: sampleCatalog,
      isSaving: false,
      upsertSenaCatalog: vi.fn(async (payload) => payload),
    });

    renderWithProviders('/catalog/skus/sku-1/edit', <SkuFormRoute />, '/catalog/skus/:skuId/edit');

    const dropzone = screen.getByTestId('catalog-image-dropzone');
    const file = new File(['plain-text'], 'notes.txt', { type: 'text/plain' });
    const clipboardData = new DataTransfer();
    clipboardData.items.add(file);
    const pasteEvent = new Event('paste', { bubbles: true, cancelable: true });
    Object.defineProperty(pasteEvent, 'clipboardData', { value: clipboardData });
    fireEvent(dropzone, pasteEvent);

    await waitFor(() => {
      expect(storeDroppedImage).not.toHaveBeenCalled();
    });
    expect(pasteEvent.defaultPrevented).toBe(false);
  });

  test('replaces the new SKU route so back from the created detail page returns to catalog', async () => {
    const upsertSenaCatalog = vi.fn(async (payload) => payload);
    inventoryHook.mockReturnValue({
      catalog: sampleCatalog,
      isSaving: false,
      upsertSenaCatalog,
    });
    window.sessionStorage.setItem(
      'kaur-khor.navigation-history',
      JSON.stringify([
        { key: 'catalog', to: '/catalog' },
        { key: 'sku-new', to: '/catalog/skus/new' },
      ]),
    );

    renderWithProviders('/catalog/skus/new', <SkuFormRoute />, '/catalog/skus/new');

    fillNewSkuRequiredFields('SKU New');
    fireEvent.click(screen.getByRole('button', { name: 'Create entry' }));

    await waitFor(() => {
      expect(upsertSenaCatalog).toHaveBeenCalledTimes(1);
      expect(screen.getByText('SKU detail destination')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Back' }));

    await waitFor(() => {
      expect(screen.getByText('Products destination')).toBeInTheDocument();
    });
  });

  test('generates a unique sku id when creating a new sku', async () => {
    const createUniqueSkuId = vi.spyOn(senaCatalog, 'createUniqueSkuId').mockReturnValue('sku-generated');
    const upsertSenaCatalog = vi.fn(async (payload) => payload);
    inventoryHook.mockReturnValue({
      catalog: sampleCatalog,
      isSaving: false,
      upsertSenaCatalog,
    });

    renderWithProviders('/catalog/skus/new', <SkuFormRoute />, '/catalog/skus/new');

    fillNewSkuRequiredFields('Generated SKU');
    fireEvent.click(screen.getByRole('button', { name: 'Create entry' }));

    await waitFor(() => {
      expect(createUniqueSkuId).toHaveBeenCalledWith(sampleCatalog);
      expect(upsertSenaCatalog).toHaveBeenCalledTimes(1);
    });

    expect(upsertSenaCatalog.mock.calls[0]?.[0].skus.at(-1)).toMatchObject({
      skuId: 'sku-generated',
      name: 'Generated SKU',
    });
    createUniqueSkuId.mockRestore();
  });

  test('keeps new SKU cost blank and explains missing required fields on create', async () => {
    const upsertSenaCatalog = vi.fn(async (payload) => payload);
    inventoryHook.mockReturnValue({
      catalog: sampleCatalog,
      isSaving: false,
      upsertSenaCatalog,
    });

    renderWithProviders('/catalog/skus/new', <SkuFormRoute />, '/catalog/skus/new');

    const pricingPanel = screen.getByRole('heading', { level: 2, name: 'Commercial setup' }).closest('[data-slot="card"]');
    const [costPerUnitInput] = within((pricingPanel ?? document.body) as HTMLElement).getAllByRole('textbox');
    expect(costPerUnitInput).toHaveValue('');

    fireEvent.click(screen.getByRole('button', { name: 'Create entry' }));

    expect(upsertSenaCatalog).not.toHaveBeenCalled();
    const nameError = screen.getByText('Enter a SKU name before saving.');
    expect(nameError).toBeInTheDocument();
    expect(nameError).toHaveAttribute('data-error-flash-key', '1');
    expect(nameError).toHaveClass('motion-safe:animate-[kaur-khor-save-error-flash_1800ms_ease-in-out_1]');
    expect(screen.getByText('Enter a cost per unit before saving.')).toBeInTheDocument();
    expect(screen.getByText('Enter the expected time of arrival days before saving.')).toBeInTheDocument();
    expect(screen.getAllByText('Enter ETA variation days and hours or choose an ETA variation before saving.')).toHaveLength(1);

    fireEvent.click(screen.getByRole('button', { name: 'Create entry' }));
    expect(screen.getByText('Enter a SKU name before saving.')).toHaveAttribute('data-error-flash-key', '2');
  });

  test('blocks edit save when required SKU fields are cleared', async () => {
    const upsertSenaCatalog = vi.fn(async (payload) => payload);
    inventoryHook.mockReturnValue({
      catalog: sampleCatalog,
      isSaving: false,
      upsertSenaCatalog,
    });

    renderWithProviders('/catalog/skus/sku-1/edit', <SkuFormRoute />, '/catalog/skus/:skuId/edit');

    const pricingPanel = screen.getByRole('heading', { level: 2, name: 'Commercial setup' }).closest('[data-slot="card"]');
    const [costPerUnitInput] = within((pricingPanel ?? document.body) as HTMLElement).getAllByRole('textbox');
    const planningPanel = screen.getByRole('heading', { level: 2, name: 'Planning inputs' }).closest('[data-slot="card"]');
    const [leadTimeMeanInput] = within((planningPanel ?? document.body) as HTMLElement).getAllByRole('textbox');
    fireEvent.change(screen.getByDisplayValue('SKU 1'), { target: { value: '' } });
    fireEvent.change(costPerUnitInput, { target: { value: '' } });
    fireEvent.change(leadTimeMeanInput, { target: { value: '' } });
    fireEvent.change(screen.getByLabelText('Custom ETA variation days'), { target: { value: '' } });
    fireEvent.change(screen.getByLabelText('Custom ETA variation hours'), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    expect(upsertSenaCatalog).not.toHaveBeenCalled();
    expect(screen.getByText('Enter a SKU name before saving.')).toBeInTheDocument();
    expect(screen.getByText('Enter a cost per unit before saving.')).toBeInTheDocument();
    expect(screen.getByText('Enter the expected time of arrival days before saving.')).toBeInTheDocument();
    expect(screen.getAllByText('Enter ETA variation days and hours or choose an ETA variation before saving.')).toHaveLength(1);
  });

  test('blocks edit save when SKU cost draft is negative', async () => {
    const upsertSenaCatalog = vi.fn(async (payload) => payload);
    inventoryHook.mockReturnValue({
      catalog: {
        ...sampleCatalog,
        skus: [{ ...sampleCatalog.skus[0], costPerUnit: -4 }],
      },
      isSaving: false,
      upsertSenaCatalog,
    });

    renderWithProviders('/catalog/skus/sku-1/edit', <SkuFormRoute />, '/catalog/skus/:skuId/edit');

    fireEvent.change(screen.getByDisplayValue('SKU 1'), { target: { value: 'SKU 1 Updated' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    expect(upsertSenaCatalog).not.toHaveBeenCalled();
  });

  test('localizes invalid SKU money validation in Khmer mode', async () => {
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
        skus: [{ ...sampleCatalog.skus[0], costPerUnit: -4, productPrice: -9 }],
      },
      isSaving: false,
      upsertSenaCatalog,
    });

    renderWithProviders('/catalog/skus/sku-1/edit', <SkuFormRoute />, '/catalog/skus/:skuId/edit');

    fireEvent.change(screen.getByDisplayValue('SKU 1'), { target: { value: 'SKU 1 Updated' } });
    fireEvent.click(screen.getByRole('button', { name: translateUiLiteral('km', 'Save changes') }));

    const costError = translateUiLiteral('km', 'Enter a non-negative finite cost before saving.');
    const priceError = translateUiLiteral('km', 'Enter a non-negative finite selling price before saving.');
    expect(screen.getByText(costError)).toBeInTheDocument();
    expect(screen.getByText(priceError)).toBeInTheDocument();
    expect(/[A-Za-z]/.test(`${costError} ${priceError}`)).toBe(false);
    expect(upsertSenaCatalog).not.toHaveBeenCalled();
  });

  test('blocks edit save when SKU product price draft is negative', async () => {
    const upsertSenaCatalog = vi.fn(async (payload) => payload);
    inventoryHook.mockReturnValue({
      catalog: {
        ...sampleCatalog,
        skus: [{ ...sampleCatalog.skus[0], productPrice: -9 }],
      },
      isSaving: false,
      upsertSenaCatalog,
    });

    renderWithProviders('/catalog/skus/sku-1/edit', <SkuFormRoute />, '/catalog/skus/:skuId/edit');

    fireEvent.change(screen.getByDisplayValue('SKU 1'), { target: { value: 'SKU 1 Updated' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    expect(upsertSenaCatalog).not.toHaveBeenCalled();
  });

  test('localizes catalog image controls in Khmer mode', () => {
    preferencesHook.mockReturnValue({
      currency: 'USD',
      language: 'km',
      usdToKhrExchangeRate: 4000,
      showExplanatoryTooltips: true,
      showFloatingTitleActions: false,
      showRightRailCards: true,
      t: (key: string) => getTranslation('km', key as never),
    });

    renderWithProviders('/catalog/skus/sku-1/edit', <SkuFormRoute />, '/catalog/skus/:skuId/edit');

    const details = translateUiLiteral('km', 'Details');
    const picture = translateUiLiteral('km', 'Picture');
    const helper = translateUiLiteral(
      'km',
      'Choose, drop, or paste one PNG, JPEG, or WebP picture for this SKU. Kaur Khor will show it on supported item surfaces.',
    );
    const noPicture = translateUiLiteral('km', 'No picture selected.');
    const chooseImage = translateUiLiteral('km', 'Choose image');
    expect(screen.getByRole('button', { name: details })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Details' })).not.toBeInTheDocument();
    expect(screen.getByText(picture)).toBeInTheDocument();
    expect(screen.getByText(helper)).toBeInTheDocument();
    expect(screen.getByText(noPicture)).toBeInTheDocument();
    expect(findButtonByText(chooseImage)).toBeInTheDocument();
    expect(screen.queryByText('Picture')).not.toBeInTheDocument();
    expect(
      screen.queryByText(
        'Choose, drop, or paste one PNG, JPEG, or WebP picture for this SKU. Kaur Khor will show it on supported item surfaces.',
      ),
    ).not.toBeInTheDocument();
    expect(screen.queryByText('No picture selected.')).not.toBeInTheDocument();
    expect(findButtonByText('Choose image')).toBeUndefined();
    expect(/[A-Za-z]/.test(`${details} ${picture} ${helper} ${noPicture} ${chooseImage}`)).toBe(false);
  });

  test('formats commercial number drafts with commas while saving numeric values', async () => {
    const upsertSenaCatalog = vi.fn(async (payload) => payload);
    inventoryHook.mockReturnValue({
      catalog: sampleCatalog,
      ingestSenaObservation,
      isSaving: false,
      snapshot: sampleSnapshot,
      upsertSenaCatalog,
    });

    renderWithProviders('/catalog/skus/sku-1/edit', <SkuFormRoute />, '/catalog/skus/:skuId/edit');

    const pricingPanel = screen.getByRole('heading', { level: 2, name: 'Commercial setup' }).closest('[data-slot="card"]');
    const pricingScope = (pricingPanel ?? document.body) as HTMLElement;
    const [costInput, priceInput] = within(pricingScope).getAllByRole('textbox');
    expect(within(pricingScope).getAllByText('$')).toHaveLength(2);
    fireEvent.change(costInput, { target: { value: '7960000.12345' } });
    fireEvent.change(priceInput, { target: { value: '8000000.98765' } });

    expect(costInput).toHaveValue('7,960,000.12345');
    expect(priceInput).toHaveValue('8,000,000.98765');

    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() => {
      expect(upsertSenaCatalog).toHaveBeenCalledTimes(1);
    });
    expect(upsertSenaCatalog.mock.calls[0]?.[0].skus[0]).toMatchObject({
      costPerUnit: 7960000.12345,
      productPrice: 8000000.98765,
    });
    expect(ingestSenaObservation).toHaveBeenCalledWith(
      expect.objectContaining({
        stockSnapshot: [{ skuId: 'sku-1', unitsInStock: 12, costPerUnit: 7960000.12345, productPrice: 8000000.98765 }],
        retailPrices: [{ skuId: 'sku-1', price: 8000000.98765 }],
      }),
    );
  });

  test('shows riel symbols for commercial inputs in KHR mode', () => {
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
      upsertSenaCatalog: vi.fn(async (payload) => payload),
    });

    renderWithProviders('/catalog/skus/sku-1/edit', <SkuFormRoute />, '/catalog/skus/:skuId/edit');

    const pricingPanel = screen.getByRole('heading', { level: 2, name: 'Commercial setup' }).closest('[data-slot="card"]');
    const pricingScope = (pricingPanel ?? document.body) as HTMLElement;
    const [costInput] = within(pricingScope).getAllByRole('textbox');
    expect(within(pricingScope).getAllByText('៛')).toHaveLength(1);
    expect(costInput).toHaveValue('16,000');
    expect(within(pricingScope).queryByText('Customer Selling Price')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('checkbox', { name: /sell as product/i }));

    const [, priceInput] = within(pricingScope).getAllByRole('textbox');
    expect(within(pricingScope).getAllByText('៛')).toHaveLength(2);
    expect(priceInput).toHaveValue('');
  });

  test('preserves dirty SKU text across currency preference rerenders', async () => {
    const view = renderWithProviders('/catalog/skus/sku-1/edit', <SkuFormRoute />, '/catalog/skus/:skuId/edit');

    fireEvent.change(screen.getByDisplayValue('SKU 1'), { target: { value: 'SKU 1 Dirty' } });
    preferencesHook.mockReturnValue({
      currency: 'KHR',
      language: 'en',
      usdToKhrExchangeRate: 4000,
      showExplanatoryTooltips: true,
      showFloatingTitleActions: false,
      showRightRailCards: true,
      t: (key: string) => getTranslation('en', key as never),
    });

    view.rerender(
      skuRouteTree(<SkuFormRoute />, '/catalog/skus/:skuId/edit', {
        initialEntries: ['/catalog/skus/sku-1/edit'],
      }),
    );

    expect(screen.getByDisplayValue('SKU 1 Dirty')).toBeInTheDocument();
    const pricingPanel = screen.getByRole('heading', { level: 2, name: 'Commercial setup' }).closest('[data-slot="card"]');
    const [costInput, priceInput] = within((pricingPanel ?? document.body) as HTMLElement).getAllByRole('textbox');
    await waitFor(() => {
      expect(costInput).toHaveValue('16,000');
      expect(priceInput).toHaveValue('36,000');
    });
  });

  test('shows selling price immediately for SKUs already sold as products', () => {
    renderWithProviders('/catalog/skus/sku-1/edit', <SkuFormRoute />, '/catalog/skus/:skuId/edit');

    const pricingPanel = screen.getByRole('heading', { level: 2, name: 'Commercial setup' }).closest('[data-slot="card"]');
    const pricingScope = (pricingPanel ?? document.body) as HTMLElement;
    const [costInput, priceInput] = within(pricingScope).getAllByRole('textbox');
    expect(within(pricingScope).getByText('Customer Selling Price')).toBeInTheDocument();
    expect(costInput).toHaveValue('4');
    expect(priceInput).toHaveValue('9');
  });

  test('saves a typed supplier name as normalized SKU metadata', async () => {
    const upsertSenaCatalog = vi.fn(async (payload) => payload);
    inventoryHook.mockReturnValue({
      catalog: sampleCatalog,
      isSaving: false,
      upsertSenaCatalog,
    });

    renderWithProviders('/catalog/skus/sku-1/edit', <SkuFormRoute />, '/catalog/skus/:skuId/edit');

    fireEvent.click(screen.getByRole('combobox', { name: 'Supplier' }));
    fireEvent.click(screen.getByRole('option', { name: 'Custom supplier' }));
    fireEvent.change(await screen.findByRole('textbox', { name: 'Custom supplier' }), { target: { value: '  Tonle Linen Works  ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() => {
      expect(upsertSenaCatalog).toHaveBeenCalledTimes(1);
    });
    expect(upsertSenaCatalog.mock.calls[0]?.[0].skus[0]).toMatchObject({
      supplierName: 'Tonle Linen Works',
    });
  });

  test('allows saving a SKU with no supplier selected', async () => {
    const upsertSenaCatalog = vi.fn(async (payload) => payload);
    inventoryHook.mockReturnValue({
      catalog: sampleCatalog,
      isSaving: false,
      upsertSenaCatalog,
    });

    renderWithProviders('/catalog/skus/new', <SkuFormRoute />, '/catalog/skus/new');

    const [skuNameInput] = screen.getAllByRole('textbox');
    const pricingPanel = screen.getByRole('heading', { level: 2, name: 'Commercial setup' }).closest('[data-slot="card"]');
    const [costPerUnitInput] = within((pricingPanel ?? document.body) as HTMLElement).getAllByRole('textbox');
    const planningPanel = screen.getByRole('heading', { level: 2, name: 'Planning inputs' }).closest('[data-slot="card"]');
    const [leadTimeMeanInput] = within((planningPanel ?? document.body) as HTMLElement).getAllByRole('textbox');

    expect(screen.getByRole('combobox', { name: 'Supplier' })).toHaveTextContent('No supplier');
    fireEvent.change(skuNameInput, { target: { value: 'No supplier SKU' } });
    fireEvent.change(costPerUnitInput, { target: { value: '12' } });
    fireEvent.change(leadTimeMeanInput, { target: { value: '5' } });
    fireEvent.click(screen.getByRole('combobox', { name: 'ETA variation' }));
    fireEvent.click(screen.getByRole('option', { name: new RegExp(`^${leadTimeVariabilityLabel('normal')}\\b`) }));
    fireEvent.click(screen.getByRole('button', { name: 'Create entry' }));

    await waitFor(() => {
      expect(upsertSenaCatalog).toHaveBeenCalledTimes(1);
    });
    expect(upsertSenaCatalog.mock.calls[0]?.[0].skus.at(-1)).toMatchObject({
      name: 'No supplier SKU',
      supplierName: null,
    });
  });

  test('marks edit form dirty when switching supplier field to custom mode', async () => {
    renderWithProviders('/catalog/skus/sku-1/edit', <SkuFormRoute />, '/catalog/skus/:skuId/edit');

    const saveButton = screen.getByRole('button', { name: 'Save changes' });
    await waitFor(() => {
      expect(saveButton).toBeDisabled();
    });

    fireEvent.click(screen.getByRole('combobox', { name: 'Supplier' }));
    fireEvent.click(screen.getByRole('option', { name: 'Custom supplier' }));

    await waitFor(() => {
      expect(screen.getByRole('textbox', { name: 'Custom supplier' })).toBeInTheDocument();
      expect(saveButton).toBeEnabled();
    });
  });

  test('asks before leaving with unsaved SKU changes', async () => {
    renderWithProviders(
      '/catalog/skus/sku-1/edit',
      <>
        <Link to="/catalog">Products</Link>
        <SkuFormRoute />
      </>,
      '/catalog/skus/:skuId/edit',
    );

    fireEvent.change(screen.getByDisplayValue('SKU 1'), { target: { value: 'SKU 1 Updated' } });
    fireEvent.click(screen.getByRole('link', { name: 'Products' }));

    expect(screen.getByRole('dialog')).toHaveTextContent('Discard changes?');
    expect(within(screen.getByRole('dialog')).getByRole('button', { name: 'Save changes' })).toHaveAttribute('data-variant', 'default');
    fireEvent.click(screen.getByRole('button', { name: 'Keep editing' }));
    expect(screen.getByDisplayValue('SKU 1 Updated')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('link', { name: 'Products' }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Discard changes' }));

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
  });

  test('blocks custom link handlers while asking before leaving with unsaved SKU changes', async () => {
    renderWithProviders(
      '/catalog/skus/sku-1/edit',
      <>
        <ImperativeCatalogLink />
        <SkuFormRoute />
      </>,
      '/catalog/skus/:skuId/edit',
    );

    fireEvent.change(screen.getByDisplayValue('SKU 1'), { target: { value: 'SKU 1 Updated' } });
    fireEvent.click(screen.getByRole('link', { name: 'Products' }));

    expect(screen.getByRole('dialog')).toHaveTextContent('Discard changes?');
    fireEvent.click(screen.getByRole('button', { name: 'Keep editing' }));
    expect(screen.queryByText('Products destination')).not.toBeInTheDocument();
    expect(screen.getByDisplayValue('SKU 1 Updated')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('link', { name: 'Products' }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Discard changes' }));

    await waitFor(() => {
      expect(screen.getByText('Products destination')).toBeInTheDocument();
    });
  });

  test('saves unsaved SKU changes before following navigation', async () => {
    const upsertSenaCatalog = vi.fn(async (payload) => payload);
    inventoryHook.mockReturnValue({
      catalog: sampleCatalog,
      isSaving: false,
      upsertSenaCatalog,
    });

    renderWithProviders(
      '/catalog/skus/sku-1/edit',
      <>
        <Link to="/catalog">Products</Link>
        <SkuFormRoute />
      </>,
      '/catalog/skus/:skuId/edit',
    );

    fireEvent.change(screen.getByDisplayValue('SKU 1'), { target: { value: 'SKU 1 Updated' } });
    fireEvent.click(screen.getByRole('link', { name: 'Products' }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Save changes' }));

    await waitFor(() => {
      expect(upsertSenaCatalog).toHaveBeenCalledTimes(1);
      expect(screen.getByText('Products destination')).toBeInTheDocument();
    });
    expect(upsertSenaCatalog.mock.calls[0]?.[0].skus[0]).toMatchObject({
      name: 'SKU 1 Updated',
    });
  });

  test('disables prompt save when unsaved SKU changes are invalid', async () => {
    const upsertSenaCatalog = vi.fn(async (payload) => payload);
    inventoryHook.mockReturnValue({
      catalog: sampleCatalog,
      isSaving: false,
      upsertSenaCatalog,
    });

    renderWithProviders(
      '/catalog/skus/sku-1/edit',
      <>
        <Link to="/catalog">Products</Link>
        <SkuFormRoute />
      </>,
      '/catalog/skus/:skuId/edit',
    );

    fireEvent.change(screen.getByDisplayValue('SKU 1'), { target: { value: '' } });
    fireEvent.click(screen.getByRole('link', { name: 'Products' }));

    const saveButton = within(screen.getByRole('dialog')).getByRole('button', { name: 'Save changes' });
    expect(saveButton).toBeDisabled();
    fireEvent.click(saveButton);
    expect(upsertSenaCatalog).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog')).toHaveTextContent('Discard changes?');
  });

  test('asks before following a More help tooltip link with unsaved SKU changes', async () => {
    const user = userEvent.setup();
    renderWithProviders('/catalog/skus/sku-1/edit', <SkuFormRoute />, '/catalog/skus/:skuId/edit');

    fireEvent.change(screen.getByDisplayValue('SKU 1'), { target: { value: 'SKU 1 Updated' } });
    await user.hover(screen.getByRole('button', { name: 'Commercial setup help' }));
    await user.click((await screen.findAllByRole('link', { name: 'More help for Commercial setup' }, { timeout: 3_000 }))[0]!);

    expect(screen.getByRole('dialog')).toHaveTextContent('Discard changes?');
    fireEvent.click(screen.getByRole('button', { name: 'Keep editing' }));
    expect(screen.getByDisplayValue('SKU 1 Updated')).toBeInTheDocument();
    expect(screen.queryByText('Help destination')).not.toBeInTheDocument();

    await user.hover(screen.getByRole('button', { name: 'Commercial setup help' }));
    await user.click((await screen.findAllByRole('link', { name: 'More help for Commercial setup' }, { timeout: 3_000 }))[0]!);
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Discard changes' }));

    await waitFor(() => {
      expect(screen.getByText('Help destination')).toBeInTheDocument();
    });
  });

  test('asks before using the edit page back button with unsaved SKU changes', async () => {
    window.sessionStorage.setItem(
      'kaur-khor.navigation-history',
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
      expect(screen.getByText('Products destination')).toBeInTheDocument();
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
      upsertSenaCatalog: vi.fn(async (payload) => payload),
    });

    renderWithProviders('/catalog/skus/sku-1/edit', <SkuFormRoute />, '/catalog/skus/:skuId/edit');

    const pricingPanel = screen.getByRole('heading', { level: 2, name: 'Commercial setup' }).closest('[data-slot="card"]');
    const [costInput] = within((pricingPanel ?? document.body) as HTMLElement).getAllByRole('textbox');
    fireEvent.change(costInput, { target: { value: '' } });
    expect(costInput).toHaveValue('');
    expect(costInput).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByText('Enter a cost per unit before saving.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeEnabled();

    fireEvent.change(costInput, { target: { value: '12' } });
    expect(costInput).toHaveValue('12');
    expect(costInput).toHaveAttribute('aria-invalid', 'false');
    expect(screen.queryByText('Enter a cost per unit before saving.')).not.toBeInTheDocument();
  });

  test('collapses selling price entry until sell as product is checked', async () => {
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
      upsertSenaCatalog: vi.fn(async (payload) => payload),
    });

    renderWithProviders('/catalog/skus/sku-1/edit', <SkuFormRoute />, '/catalog/skus/:skuId/edit');

    const pricingPanel = screen.getByRole('heading', { level: 2, name: 'Commercial setup' }).closest('[data-slot="card"]');
    const pricingScope = (pricingPanel ?? document.body) as HTMLElement;
    const [costInput] = within(pricingScope).getAllByRole('textbox');
    const sellAsProductCheckbox = screen.getByRole('checkbox', { name: /sell as product/i });
    expect(costInput).toHaveValue('4');
    expect(within(pricingScope).queryByText('Customer Selling Price')).not.toBeInTheDocument();
    expect(within(pricingScope).getAllByRole('textbox')).toHaveLength(1);

    fireEvent.click(sellAsProductCheckbox);

    const [, priceInput] = within(pricingScope).getAllByRole('textbox');
    expect(priceInput).toBeEnabled();
    fireEvent.change(priceInput, { target: { value: '25' } });
    expect(priceInput).toHaveValue('25');
  });

  test('removes the select variability placeholder after a real ETA variation is chosen', async () => {
    renderWithProviders('/catalog/skus/new', <SkuFormRoute />, '/catalog/skus/new');

    const variabilitySelect = screen.getByRole('combobox', { name: 'ETA variation' });
    fireEvent.click(variabilitySelect);
    expect(screen.getByRole('option', { name: 'Custom' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('option', { name: /Wide/ }));

    fireEvent.click(screen.getByRole('combobox', { name: 'ETA variation' }));
    expect(screen.queryByRole('option', { name: 'Select variability' })).not.toBeInTheDocument();
  });

  test('shows unique jittered variability values for short expected time of arrival values', async () => {
    renderWithProviders('/catalog/skus/new', <SkuFormRoute />, '/catalog/skus/new');

    const planningPanel = screen.getByRole('heading', { level: 2, name: 'Planning inputs' }).closest('[data-slot="card"]');
    const [leadTimeMeanInput] = within((planningPanel ?? document.body) as HTMLElement).getAllByRole('textbox');
    fireEvent.change(leadTimeMeanInput, { target: { value: '1' } });

    fireEvent.click(screen.getByRole('combobox', { name: 'ETA variation' }));

    expect(screen.getByRole('option', { name: 'Very tight' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Tight' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Normal' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Wide' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Very wide' })).toBeInTheDocument();
    expect(screen.getByText('± 2.4 hr')).toBeInTheDocument();
    expect(screen.getByText('± 4.8 hr')).toBeInTheDocument();
    expect(screen.getByText('± 7.2 hr')).toBeInTheDocument();
    expect(screen.getByText('± 12.0 hr')).toBeInTheDocument();
    expect(screen.getByText('± 16.8 hr')).toBeInTheDocument();
  });

  test('saves the same jittered std-days value shown for a selected preset', async () => {
    const upsertSenaCatalog = vi.fn(async (payload) => payload);
    inventoryHook.mockReturnValue({
      catalog: sampleCatalog,
      isSaving: false,
      upsertSenaCatalog,
    });
    renderWithProviders('/catalog/skus/new', <SkuFormRoute />, '/catalog/skus/new');

    const [skuNameInput] = screen.getAllByRole('textbox');
    const pricingPanel = screen.getByRole('heading', { level: 2, name: 'Commercial setup' }).closest('[data-slot="card"]');
    const [costPerUnitInput] = within((pricingPanel ?? document.body) as HTMLElement).getAllByRole('textbox');
    const planningPanel = screen.getByRole('heading', { level: 2, name: 'Planning inputs' }).closest('[data-slot="card"]');
    const [leadTimeMeanInput] = within((planningPanel ?? document.body) as HTMLElement).getAllByRole('textbox');

    fireEvent.change(skuNameInput, { target: { value: 'Short lead SKU' } });
    fireEvent.click(screen.getByRole('combobox', { name: 'Supplier' }));
    fireEvent.click(screen.getByRole('option', { name: 'Mekong Looms' }));
    fireEvent.change(costPerUnitInput, { target: { value: '12' } });
    fireEvent.change(leadTimeMeanInput, { target: { value: '1' } });
    fireEvent.click(screen.getByRole('combobox', { name: 'ETA variation' }));
    expect(screen.getByText('± 4.8 hr')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('option', { name: 'Tight' }));
    expect(screen.getByRole('combobox', { name: 'ETA variation' })).toHaveTextContent('± 4.8 hr');

    fireEvent.click(screen.getByRole('button', { name: 'Create entry' }));

    await waitFor(() => {
      expect(upsertSenaCatalog).toHaveBeenCalledTimes(1);
    });
    expect(upsertSenaCatalog.mock.calls[0]?.[0].skus.at(-1)?.leadTimeStdDaysHint).toBeCloseTo(0.2);
  });

  test('saves a manually entered uncertainty plus-minus days value', async () => {
    const upsertSenaCatalog = vi.fn(async (payload) => payload);
    inventoryHook.mockReturnValue({
      catalog: sampleCatalog,
      ingestSenaObservation,
      isSaving: false,
      snapshot: sampleSnapshot,
      upsertSenaCatalog,
    });

    renderWithProviders('/catalog/skus/sku-1/edit', <SkuFormRoute />, '/catalog/skus/:skuId/edit');

    fireEvent.change(screen.getByLabelText('Custom ETA variation days'), { target: { value: '1' } });
    fireEvent.change(screen.getByLabelText('Custom ETA variation hours'), { target: { value: '19.2' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() => {
      expect(upsertSenaCatalog).toHaveBeenCalledTimes(1);
    });

    expect(upsertSenaCatalog.mock.calls[0]?.[0].skus[0].leadTimeStdDaysHint).toBeCloseTo(1.8);
    expect(ingestSenaObservation).toHaveBeenCalledWith(
      expect.objectContaining({
        stockSnapshot: [],
        retailPrices: [],
        leadTimeHints: [
          expect.objectContaining({
            skuId: 'sku-1',
            typicalDays: 5,
            lowDays: 3.2,
            highDays: 6.8,
            variabilityClass: 'wide',
          }),
        ],
      }),
    );
  });

  test('keeps custom selected when custom uncertainty changes', async () => {
    renderWithProviders('/catalog/skus/sku-1/edit', <SkuFormRoute />, '/catalog/skus/:skuId/edit');

    fireEvent.change(screen.getByLabelText('Custom ETA variation hours'), { target: { value: '12' } });

    await waitFor(() => {
      expect(screen.getByRole('combobox', { name: 'ETA variation' })).toHaveTextContent('Custom');
    });
  });

  test('lets edit flows switch preset ETA variation back to custom', async () => {
    renderWithProviders('/catalog/skus/sku-1/edit', <SkuFormRoute />, '/catalog/skus/:skuId/edit');

    fireEvent.click(screen.getByRole('combobox', { name: 'ETA variation' }));
    fireEvent.click(screen.getByRole('option', { name: 'Custom' }));

    await waitFor(() => {
      expect(screen.getByRole('combobox', { name: 'ETA variation' })).toHaveTextContent('Custom');
    });
    expect(screen.getByLabelText('Custom ETA variation days')).toBeInTheDocument();
    expect(screen.getByLabelText('Custom ETA variation hours')).toBeInTheDocument();
    expect(screen.getByText('d')).toBeInTheDocument();
    expect(screen.getByText('hr')).toBeInTheDocument();
  });

  test('shows the matching ETA variation preset instead of custom on edit', async () => {
    inventoryHook.mockReturnValue({
      catalog: {
        ...sampleCatalog,
        skus: sampleCatalog.skus.map((sku) =>
          sku.skuId === 'sku-1'
            ? {
                ...sku,
                leadTimeMeanDaysHint: 5,
                leadTimeStdDaysHint: 3.4,
              }
            : sku,
        ),
      },
      isSaving: false,
      snapshot: sampleSnapshot,
      upsertSenaCatalog: vi.fn(),
    });

    renderWithProviders('/catalog/skus/sku-1/edit', <SkuFormRoute />, '/catalog/skus/:skuId/edit');

    expect(screen.getByRole('combobox', { name: 'ETA variation' })).toHaveTextContent('Very wide');
    expect(screen.getByRole('combobox', { name: 'ETA variation' })).toHaveTextContent('± 3 d & 9.6 hr');
    expect(screen.queryByLabelText('Custom ETA variation days')).not.toBeInTheDocument();
  });

  test('shows the matching sub-day ETA variation preset instead of custom on edit', async () => {
    inventoryHook.mockReturnValue({
      catalog: {
        ...sampleCatalog,
        skus: sampleCatalog.skus.map((sku) =>
          sku.skuId === 'sku-1'
            ? {
                ...sku,
                leadTimeMeanDaysHint: 1,
                leadTimeStdDaysHint: 0.1,
              }
            : sku,
        ),
      },
      isSaving: false,
      snapshot: sampleSnapshot,
      upsertSenaCatalog: vi.fn(),
    });

    renderWithProviders('/catalog/skus/sku-1/edit', <SkuFormRoute />, '/catalog/skus/:skuId/edit');

    await waitFor(() => {
      expect(screen.getByRole('combobox', { name: 'ETA variation' })).toHaveTextContent('Very tight');
    });
    expect(screen.getByRole('combobox', { name: 'ETA variation' })).toHaveTextContent('± 2.4 hr');
    expect(screen.queryByLabelText('Custom ETA variation days')).not.toBeInTheDocument();
  });

  test('updates uncertainty when variability and mean days change', async () => {
    const upsertSenaCatalog = vi.fn(async (payload) => payload);
    inventoryHook.mockReturnValue({
      catalog: sampleCatalog,
      ingestSenaObservation,
      isSaving: false,
      snapshot: sampleSnapshot,
      upsertSenaCatalog,
    });
    renderWithProviders('/catalog/skus/sku-1/edit', <SkuFormRoute />, '/catalog/skus/:skuId/edit');

    fireEvent.click(screen.getByRole('combobox', { name: 'ETA variation' }));
    fireEvent.click(screen.getByRole('option', { name: new RegExp(`^${leadTimeVariabilityLabel('wide')}\\b`) }));

    await waitFor(() => {
      expect(screen.getByRole('combobox', { name: 'ETA variation' })).toHaveTextContent('± 2 d & 7.2 hr');
    });

    fireEvent.change(screen.getByDisplayValue('5'), { target: { value: '8' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() => {
      expect(upsertSenaCatalog).toHaveBeenCalledTimes(1);
    });
    expect(upsertSenaCatalog.mock.calls[0]?.[0].skus[0].leadTimeStdDaysHint).toBeCloseTo(3.6);
  });
});
