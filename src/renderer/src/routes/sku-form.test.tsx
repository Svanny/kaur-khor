import type { ReactNode } from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Link, MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import * as senaCatalog from '@/lib/sena-catalog';
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
    </MemoryRouter>,
  );
}

function findButtonByText(text: string) {
  return screen.getAllByRole('button').find((button) => button.textContent?.includes(text)) as HTMLButtonElement;
}

describe('SkuFormRoute', () => {
  const pickAndStoreImage = vi.fn();
  const storeDroppedImage = vi.fn();

  beforeEach(() => {
    window.sessionStorage.clear();
    pickAndStoreImage.mockReset();
    pickAndStoreImage.mockResolvedValue('/tmp/sku-image.png');
    storeDroppedImage.mockReset();
    storeDroppedImage.mockResolvedValue('/tmp/dropped-sku.png');
    window.banjiDesktop = {
      ...(window.banjiDesktop ?? {}),
      system: {
        ...(window.banjiDesktop?.system ?? {}),
        pickAndStoreImage,
        storeDroppedImage,
      },
    };
    inventoryHook.mockReturnValue({
      catalog: sampleCatalog,
      isSaving: false,
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
    expect(screen.getByRole('combobox', { name: 'Supplier' })).toHaveTextContent('Mekong Looms');
    expect(screen.getByText('Keep the current landed or replacement unit cost here.')).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: /sell as product/i })).toBeChecked();
    expect(screen.queryByDisplayValue('sku-1')).not.toBeInTheDocument();
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
      supplierName: 'Mekong Looms',
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

  test('adds a sku picture in edit mode', async () => {
    const upsertSenaCatalog = vi.fn(async (payload) => payload);
    inventoryHook.mockReturnValue({
      catalog: sampleCatalog,
      isSaving: false,
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
      'banji.navigation-history',
      JSON.stringify([
        { key: 'catalog', to: '/catalog' },
        { key: 'sku-new', to: '/catalog/skus/new' },
      ]),
    );

    renderWithProviders('/catalog/skus/new', <SkuFormRoute />, '/catalog/skus/new');

    const [skuNameInput] = screen.getAllByRole('textbox');
    const [costPerUnitInput] = screen.getAllByRole('spinbutton');
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

  test('generates a unique sku id when creating a new sku', async () => {
    const createUniqueSkuId = vi.spyOn(senaCatalog, 'createUniqueSkuId').mockReturnValue('sku-generated');
    const upsertSenaCatalog = vi.fn(async (payload) => payload);
    inventoryHook.mockReturnValue({
      catalog: sampleCatalog,
      isSaving: false,
      upsertSenaCatalog,
    });

    renderWithProviders('/catalog/skus/new', <SkuFormRoute />, '/catalog/skus/new');

    const [skuNameInput] = screen.getAllByRole('textbox');
    const [costPerUnitInput] = screen.getAllByRole('spinbutton');
    fireEvent.change(skuNameInput, { target: { value: 'Generated SKU' } });
    fireEvent.change(costPerUnitInput, { target: { value: '12' } });
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
      upsertSenaCatalog: vi.fn(async (payload) => payload),
    });

    renderWithProviders('/catalog/skus/sku-1/edit', <SkuFormRoute />, '/catalog/skus/:skuId/edit');

    const pricingPanel = screen.getByRole('heading', { level: 2, name: 'Commercial setup' }).closest('[data-slot="card"]');
    const [, priceInput] = within(pricingPanel ?? document.body).getAllByRole('spinbutton');
    const enableHint = screen.getByText('To enter a selling price, click the Sell as product box below first.');
    const sellAsProductCheckbox = screen.getByRole('checkbox', { name: /sell as product/i });
    const sellAsProductRow = sellAsProductCheckbox.closest('[data-slot="checkbox-row"]');
    expect(priceInput).toHaveAttribute('aria-disabled', 'true');
    expect(priceInput).toHaveAttribute('readonly');
    expect(enableHint).toBeInTheDocument();
    expect(enableHint).not.toHaveClass('text-destructive');
    expect(sellAsProductRow).not.toHaveClass('border-destructive/60');

    fireEvent.click(priceInput);

    expect(screen.getByText('To enter a selling price, click the Sell as product box below first.')).toHaveClass('text-destructive');
    expect(sellAsProductRow).toHaveClass('border-destructive/60');

    fireEvent.click(sellAsProductCheckbox);

    expect(priceInput).toBeEnabled();
    expect(priceInput).not.toHaveAttribute('readonly');
    expect(sellAsProductRow).not.toHaveClass('border-destructive/60');
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

  test('updates lead time variability when uncertainty changes', async () => {
    renderWithProviders('/catalog/skus/sku-1/edit', <SkuFormRoute />, '/catalog/skus/:skuId/edit');

    fireEvent.change(screen.getByDisplayValue('1'), { target: { value: '2.5' } });

    await waitFor(() => {
      expect(screen.getByRole('combobox', { name: 'Lead time variability' })).toHaveTextContent(
        leadTimeVariabilityLabel('wide'),
      );
    });
  });

  test('updates uncertainty when variability and mean days change', async () => {
    renderWithProviders('/catalog/skus/sku-1/edit', <SkuFormRoute />, '/catalog/skus/:skuId/edit');

    fireEvent.click(screen.getByRole('combobox', { name: 'Lead time variability' }));
    fireEvent.click(screen.getByRole('option', { name: leadTimeVariabilityLabel('wide') }));

    await waitFor(() => {
      expect(screen.getByDisplayValue('2.25')).toBeInTheDocument();
    });

    fireEvent.change(screen.getByDisplayValue('5'), { target: { value: '8' } });

    await waitFor(() => {
      expect(screen.getByDisplayValue('3.6')).toBeInTheDocument();
    });
  });
});
