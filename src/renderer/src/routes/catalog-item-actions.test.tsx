import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { useState } from 'react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { headerActionSurfaceClassName } from '@/components/system/floating-title-actions';
import type { SenaSkuDetailViewModel } from './sku-detail/view-model';
import {
  buildLeadTimeHintFromInputs,
  formatDatetimeLocalValue,
  parseDatetimeLocalIso,
  ServiceMutationActions,
  SkuMutationActions,
} from './catalog-item-actions';
import { ServiceDetailActions } from './service-detail/actions';
import { SkuPageHero } from './sku-page-hero';

const inventoryHook = vi.fn();
const preferencesHook = vi.fn();

vi.mock('@/state/inventory', () => ({
  useInventory: () => inventoryHook(),
}));

vi.mock('@/state/preferences', () => ({
  usePreferences: () => preferencesHook(),
}));

if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => {};
}

describe('catalog item action sheets', () => {
  const skuActionContext: SenaSkuDetailViewModel['actionContext'] = {
    currentStock: 12,
    costPerUnit: 4,
    leadTimeVariability: null,
    latestObservationAt: '2026-04-02T00:00:00Z',
    productPrice: 9,
    recommendedOrderQuantity: 6,
    reorderRecommendation: {
      compactLabel: 'Order 6',
      hasBackendRecommendation: true,
      likelyRangeLabel: 'Likely range 5-7',
      likelyRangeValueLabel: '5-7',
      needProbabilityLabel: '91% need probability',
      needProbabilityValueLabel: '91%',
      optionalOrderLabel: null,
      policyBasisLabel: 'Policy basis forecast',
      protectionHorizonLabel: 'Protection horizon 30 days',
      quietLabel: 'Quiet',
      recommendationIssued: true,
      recommendedOrderLabel: 'Order 6',
      recommendedUnits: 6,
      recommendedUnitsLabel: '6 units',
    },
    soldAsProduct: true,
    supplierName: null,
  };

  beforeEach(() => {
    window.localStorage.clear();
    inventoryHook.mockReturnValue({
      ingestSenaObservation: vi.fn(),
      isSaving: false,
      runWorkspacePreparation: vi.fn(async (task: () => Promise<unknown>) => task()),
      triggerSenaRun: vi.fn(),
    });
    preferencesHook.mockReturnValue({
      currency: 'USD',
      t: (key: string) =>
        ({
          catalogSenaSkuDialogDescription: 'Capture the signal.',
          catalogSenaSkuLeadTimeVariability: 'ETA variation',
          catalogSenaSkuLeadTimeVariabilityHint: 'Choose variability.',
          catalogSenaSkuLogOrder: 'Record Supplier order',
          catalogSenaSkuLogReceipt: 'Record Customer order',
          catalogSenaSkuMutationFailed: 'Failed',
          catalogSenaSkuNotes: 'Notes',
          catalogSenaSkuObservedAt: 'Observed at',
          catalogSenaSkuProductPrice: 'Product price',
          catalogSenaSkuRecordStock: 'Record stock',
          catalogSenaSkuSaveAndRefresh: 'Save and refresh',
          catalogSenaSkuSaving: 'Saving',
          catalogSenaSkuApproximateOrderQuantity: 'Approximate order quantity',
          catalogSenaSkuApproximateReceiptQuantity: 'Approximate receipt quantity',
          catalogSenaSkuTypicalLeadTimeDays: 'Typical ETA days',
          catalogSenaSkuUnitsInStock: 'Units in stock',
          catalogSenaSkuCostPerUnit: 'Cost per unit',
          catalogSkuEditAction: 'Edit SKU',
          catalogSkuLeadTimeVariabilityPlaceholder: 'Choose variability',
          sheetUnsavedLeavePrompt: 'Unsaved changes',
        }[key] ?? key),
      usdToKhrExchangeRate: 4100,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  test('builds preset ETA hints from the jittered std-days value', () => {
    expect(
      buildLeadTimeHintFromInputs({
        skuId: 'sku-1',
        typicalLeadTimeDays: '1',
        variabilityClass: 'tight',
      }),
    ).toEqual({
      skuId: 'sku-1',
      typicalDays: 1,
      lowDays: 0.8,
      highDays: 1.2,
      variabilityClass: 'tight',
    });
  });

  test('builds custom ETA hints from typed ETA variation days', () => {
    expect(
      buildLeadTimeHintFromInputs({
        skuId: 'sku-1',
        stdDays: '3',
        typicalLeadTimeDays: '1',
        variabilityClass: 'tight',
      }),
    ).toEqual({
      skuId: 'sku-1',
      typicalDays: 1,
      lowDays: 0,
      highDays: 4,
      variabilityClass: 'very_wide',
    });
  });

  test('drops invalid ETA hint numbers before building order hints', () => {
    expect(
      buildLeadTimeHintFromInputs({
        skuId: 'sku-1',
        stdDays: 'Infinity',
        typicalLeadTimeDays: '-2',
        variabilityClass: '',
      }),
    ).toBeNull();
  });

  test('round-trips observed timestamps through datetime-local values', () => {
    const sourceIso = '2026-04-02T09:30:00+07:00';
    const localValue = formatDatetimeLocalValue(sourceIso);

    expect(parseDatetimeLocalIso(localValue)).toBe(new Date(sourceIso).toISOString());
    expect(parseDatetimeLocalIso('')).toBeNull();
    expect(parseDatetimeLocalIso('2026-02-31T08:30')).toBeNull();
  });

  test('defaults new SKU and service action timestamps to the current system time', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 3, 9, 16, 44));

    const { rerender } = render(
      <MemoryRouter>
        <SkuMutationActions
          actionContext={skuActionContext}
          mode="stock"
          onComplete={vi.fn(async () => {})}
          onModeChange={vi.fn()}
          skuId="sku-1"
        />
      </MemoryRouter>,
    );

    expect(screen.getByLabelText('Observed at')).toHaveValue('2026-04-09T16:44');

    rerender(
      <MemoryRouter>
        <ServiceMutationActions
          actions={{
            bottleneckSku: {
              costPerUnit: 4,
              name: 'SKU 1',
              productPrice: 9,
              skuId: 'sku-1',
              soldAsProduct: true,
              unitsInStock: 12,
            },
            editServiceHref: '/catalog/services/service-1/edit',
            latestObservedAt: '2026-04-02T00:00:00Z',
            noBottleneckHint: 'No bottleneck',
            primarySkuHref: '/catalog/skus/sku-1',
            servicePrice: {
              currentPrice: 18,
              serviceId: 'service-1',
              serviceName: 'Service 1',
            },
          }}
          mode="price"
          onComplete={vi.fn(async () => {})}
          onModeChange={vi.fn()}
        />
      </MemoryRouter>,
    );

    expect(screen.getByLabelText('Observed at')).toHaveValue('2026-04-09T16:44');
  });

  test('opens the controlled SKU sheet and clears mode on close', async () => {
    const handleModeChange = vi.fn();

    render(
      <MemoryRouter>
        <SkuMutationActions
          actionContext={skuActionContext}
          mode="stock"
          onComplete={vi.fn(async () => {})}
          onModeChange={handleModeChange}
          skuId="sku-1"
        />
      </MemoryRouter>,
    );

    expect(screen.getByRole('dialog')).toHaveTextContent('Record stock');
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));

    await waitFor(() => {
      expect(handleModeChange).toHaveBeenCalledWith(null);
    });
  });

  test('blocks invalid SKU stock quantities and prices before submit', () => {
    const ingestSenaObservation = vi.fn();
    inventoryHook.mockReturnValue({
      ingestSenaObservation,
      isSaving: false,
      runWorkspacePreparation: vi.fn(async (task: () => Promise<unknown>) => task()),
      triggerSenaRun: vi.fn(),
    });

    render(
      <MemoryRouter>
        <SkuMutationActions
          actionContext={skuActionContext}
          mode="stock"
          onComplete={vi.fn(async () => {})}
          onModeChange={vi.fn()}
          skuId="sku-1"
        />
      </MemoryRouter>,
    );

    fireEvent.change(screen.getByRole('textbox', { name: 'Units in stock' }), { target: { value: '.' } });

    const saveButton = screen.getByRole('button', { name: 'Save and refresh' });
    expect(saveButton).toBeDisabled();
    fireEvent.click(saveButton);
    expect(ingestSenaObservation).not.toHaveBeenCalled();
  });

  test('blocks invalid SKU order quantities before submit', () => {
    const ingestSenaObservation = vi.fn();
    inventoryHook.mockReturnValue({
      ingestSenaObservation,
      isSaving: false,
      runWorkspacePreparation: vi.fn(async (task: () => Promise<unknown>) => task()),
      triggerSenaRun: vi.fn(),
    });

    render(
      <MemoryRouter>
        <SkuMutationActions
          actionContext={skuActionContext}
          mode="order"
          onComplete={vi.fn(async () => {})}
          onModeChange={vi.fn()}
          skuId="sku-1"
        />
      </MemoryRouter>,
    );

    fireEvent.change(screen.getByRole('textbox', { name: 'Approximate order quantity' }), { target: { value: '.' } });

    const saveButton = screen.getByRole('button', { name: 'Save and refresh' });
    expect(saveButton).toBeDisabled();
    fireEvent.click(saveButton);
    expect(ingestSenaObservation).not.toHaveBeenCalled();
  });

  test('blocks invalid SKU receipt quantities before submit', () => {
    const ingestSenaObservation = vi.fn();
    inventoryHook.mockReturnValue({
      ingestSenaObservation,
      isSaving: false,
      runWorkspacePreparation: vi.fn(async (task: () => Promise<unknown>) => task()),
      triggerSenaRun: vi.fn(),
    });

    render(
      <MemoryRouter>
        <SkuMutationActions
          actionContext={skuActionContext}
          mode="receipt"
          onComplete={vi.fn(async () => {})}
          onModeChange={vi.fn()}
          skuId="sku-1"
        />
      </MemoryRouter>,
    );

    fireEvent.change(screen.getByRole('textbox', { name: 'Approximate receipt quantity' }), { target: { value: '.' } });

    const saveButton = screen.getByRole('button', { name: 'Save and refresh' });
    expect(saveButton).toBeDisabled();
    fireEvent.click(saveButton);
    expect(ingestSenaObservation).not.toHaveBeenCalled();
  });

  test('blocks invalid SKU price updates before submit', () => {
    const ingestSenaObservation = vi.fn();
    inventoryHook.mockReturnValue({
      ingestSenaObservation,
      isSaving: false,
      runWorkspacePreparation: vi.fn(async (task: () => Promise<unknown>) => task()),
      triggerSenaRun: vi.fn(),
    });

    render(
      <MemoryRouter>
        <SkuMutationActions
          actionContext={skuActionContext}
          mode="price"
          onComplete={vi.fn(async () => {})}
          onModeChange={vi.fn()}
          skuId="sku-1"
        />
      </MemoryRouter>,
    );

    fireEvent.change(screen.getByRole('textbox', { name: 'Product price' }), { target: { value: '.' } });

    const saveButton = screen.getByRole('button', { name: 'Save and refresh' });
    expect(saveButton).toBeDisabled();
    fireEvent.click(saveButton);
    expect(ingestSenaObservation).not.toHaveBeenCalled();
  });

  test('saves comma-formatted SKU price updates as numeric prices', async () => {
    const ingestSenaObservation = vi.fn(async () => {});
    inventoryHook.mockReturnValue({
      ingestSenaObservation,
      isSaving: false,
      runWorkspacePreparation: vi.fn(async (task: () => Promise<unknown>) => task()),
      triggerSenaRun: vi.fn(),
    });

    render(
      <MemoryRouter>
        <SkuMutationActions
          actionContext={skuActionContext}
          mode="price"
          onComplete={vi.fn(async () => {})}
          onModeChange={vi.fn()}
          skuId="sku-1"
        />
      </MemoryRouter>,
    );

    fireEvent.change(screen.getByRole('textbox', { name: 'Product price' }), { target: { value: '1,234.50' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save and refresh' }));

    await waitFor(() => expect(ingestSenaObservation).toHaveBeenCalledTimes(1));
    expect(ingestSenaObservation).toHaveBeenCalledWith(
      expect.objectContaining({
        retailPrices: [{ skuId: 'sku-1', price: 1234.5 }],
      }),
    );
  });

  test('opens the controlled service sheet and clears mode on close', async () => {
    const handleModeChange = vi.fn();

    render(
      <MemoryRouter>
        <ServiceMutationActions
          actions={{
            bottleneckSku: {
              costPerUnit: 4,
              name: 'SKU 1',
              productPrice: 9,
              skuId: 'sku-1',
              soldAsProduct: true,
              unitsInStock: 12,
            },
            editServiceHref: '/catalog/services/service-1/edit',
            latestObservedAt: '2026-04-02T00:00:00Z',
            noBottleneckHint: 'No bottleneck',
            primarySkuHref: '/catalog/skus/sku-1',
            servicePrice: {
              currentPrice: 18,
              serviceId: 'service-1',
              serviceName: 'Service 1',
            },
          }}
          mode="price"
          onComplete={vi.fn(async () => {})}
          onModeChange={handleModeChange}
        />
      </MemoryRouter>,
    );

    expect(screen.getByRole('dialog')).toHaveTextContent('Update price');
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));

    await waitFor(() => {
      expect(handleModeChange).toHaveBeenCalledWith(null);
    });
  });

  test('labels service receipt mode as a receipt action', () => {
    render(
      <MemoryRouter>
        <ServiceMutationActions
          actions={{
            bottleneckSku: {
              costPerUnit: 4,
              name: 'SKU 1',
              productPrice: 9,
              skuId: 'sku-1',
              soldAsProduct: true,
              unitsInStock: 12,
            },
            editServiceHref: '/catalog/services/service-1/edit',
            latestObservedAt: '2026-04-02T00:00:00Z',
            noBottleneckHint: 'No bottleneck',
            primarySkuHref: '/catalog/skus/sku-1',
            servicePrice: {
              currentPrice: 18,
              serviceId: 'service-1',
              serviceName: 'Service 1',
            },
          }}
          mode="receipt"
          onComplete={vi.fn(async () => {})}
          onModeChange={vi.fn()}
        />
      </MemoryRouter>,
    );

    expect(screen.getByRole('dialog')).toHaveTextContent('Record receipt');
    expect(screen.getByRole('dialog')).not.toHaveTextContent('Record Customer order');
  });

  test('saves comma-formatted service price updates as numeric prices', async () => {
    const ingestSenaObservation = vi.fn(async () => {});
    inventoryHook.mockReturnValue({
      ingestSenaObservation,
      isSaving: false,
      runWorkspacePreparation: vi.fn(async (task: () => Promise<unknown>) => task()),
      triggerSenaRun: vi.fn(),
    });

    render(
      <MemoryRouter>
        <ServiceMutationActions
          actions={{
            bottleneckSku: {
              costPerUnit: 4,
              name: 'SKU 1',
              productPrice: 9,
              skuId: 'sku-1',
              soldAsProduct: true,
              unitsInStock: 12,
            },
            editServiceHref: '/catalog/services/service-1/edit',
            latestObservedAt: '2026-04-02T00:00:00Z',
            noBottleneckHint: 'No bottleneck',
            primarySkuHref: '/catalog/skus/sku-1',
            servicePrice: {
              currentPrice: 18,
              serviceId: 'service-1',
              serviceName: 'Service 1',
            },
          }}
          mode="price"
          onComplete={vi.fn(async () => {})}
          onModeChange={vi.fn()}
        />
      </MemoryRouter>,
    );

    fireEvent.change(screen.getByRole('textbox', { name: 'Service price' }), { target: { value: '1,234.50' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save and refresh' }));

    await waitFor(() => expect(ingestSenaObservation).toHaveBeenCalledTimes(1));
    expect(ingestSenaObservation).toHaveBeenCalledWith(
      expect.objectContaining({
        servicePrices: [{ serviceId: 'service-1', price: 1234.5 }],
      }),
    );
  });

  test('keeps service detail action buttons on the same height as SKU detail actions', () => {
    function findActionSurface(anchor: HTMLElement | null) {
      let actions = anchor;
      while (actions && !actions.className.includes(headerActionSurfaceClassName)) {
        actions = actions.parentElement;
      }
      return actions;
    }

    const { rerender } = render(
      <MemoryRouter>
        <SkuPageHero
          actions={(
            <SkuMutationActions
              actionContext={skuActionContext}
              onComplete={vi.fn(async () => {})}
              skuId="sku-1"
            />
          )}
          title="SKU 1"
        />
      </MemoryRouter>,
    );

    const skuActions = findActionSurface(screen.getByRole('button', { name: 'Record' }).parentElement);

    rerender(
      <MemoryRouter>
        <SkuPageHero
          actions={(
            <ServiceDetailActions
              actions={{
                bottleneckSku: {
                  costPerUnit: 4,
                  name: 'SKU 1',
                  productPrice: 9,
                  skuId: 'sku-1',
                  soldAsProduct: true,
                  unitsInStock: 12,
                },
                editServiceHref: '/catalog/services/service-1/edit',
                latestObservedAt: '2026-04-02T00:00:00Z',
                noBottleneckHint: 'No bottleneck',
                primarySkuHref: '/catalog/skus/sku-1',
                servicePrice: {
                  currentPrice: 18,
                  serviceId: 'service-1',
                  serviceName: 'Service 1',
                },
              }}
              onComplete={vi.fn(async () => {})}
            />
          )}
          title="Service 1"
        />
      </MemoryRouter>,
    );

    const serviceActions = findActionSurface(screen.getByRole('link', { name: 'Open bottleneck SKU' }).parentElement);

    expect(serviceActions?.className).toBe(skuActions?.className);
    expect(serviceActions?.className).toContain('[&_[data-slot=button]]:!h-9');
    expect(serviceActions?.className).toContain('[&_[data-slot=button]]:!min-h-9');
    expect(serviceActions?.className).toContain('[&_[data-slot=button]]:!rounded-full');
    expect(screen.getByRole('link', { name: 'Open bottleneck SKU' }).className).toContain('!h-9');
    expect(screen.getByRole('button', { name: 'Record' }).className).toContain('!h-9');
    expect(screen.getByRole('link', { name: 'Edit service' }).className).toContain('!h-9');
    expect(screen.getByRole('link', { name: 'Open bottleneck SKU' })).toHaveAttribute('data-slot', 'button');
    expect(screen.getByRole('button', { name: 'Record' })).toHaveAttribute('data-slot', 'button');
    expect(screen.getByRole('link', { name: 'Edit service' })).toHaveAttribute('data-slot', 'button');
  });

  function LocationProbe() {
    const location = useLocation();
    return <div data-testid="location">{`${location.pathname}${location.search}`}</div>;
  }

  test('routes SKU observation buttons into targeted capture sessions', () => {
    render(
      <MemoryRouter initialEntries={['/catalog/skus/sku-1']}>
        <Routes>
          <Route
            element={
              <>
                <SkuMutationActions
                  actionContext={skuActionContext}
                  onComplete={vi.fn(async () => {})}
                  skuId="sku-1"
                />
                <LocationProbe />
              </>
            }
            path="*"
          />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByRole('button', { name: 'Record' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Record Supplier order' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Log receipt' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Record' }));
    expect(screen.getByRole('menuitem', { name: 'Products Update' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Supplier Order' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Customer Order' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Immediate Sale' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Updated Price' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('menuitem', { name: 'Supplier Order' }));
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveTextContent('Leave detail page?');
    expect(dialog).toHaveTextContent('This will leave the detail page and open a targeted capture session.');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(within(dialog).queryByRole('button', { name: 'Delete draft and start new' })).not.toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Continue to capture' })).toHaveAttribute(
      'data-variant',
      'default',
    );
    expect(screen.getByTestId('location')).toHaveTextContent('/catalog/skus/sku-1');

    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByTestId('location')).toHaveTextContent('/catalog/skus/sku-1');

    fireEvent.click(screen.getByRole('button', { name: 'Record' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Supplier Order' }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Continue to capture' }));
    expect(screen.getByTestId('location')).toHaveTextContent(
      '/work/capture/supplier-order?targetAction=supplier-order&targetType=sku&targetId=sku-1&ticketMode=new',
    );
  });

  test('prompts before deleting a saved draft for direct capture actions', () => {
    window.localStorage.setItem('kaur-khor:record-update:draft:supplier-order-pending:v1', '{"version":1}');
    render(
      <MemoryRouter initialEntries={['/catalog/skus/sku-1']}>
        <Routes>
          <Route
            element={
              <>
                <SkuMutationActions
                  actionContext={skuActionContext}
                  onComplete={vi.fn(async () => {})}
                  skuId="sku-1"
                />
                <LocationProbe />
              </>
            }
            path="*"
          />
        </Routes>
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Record' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Supplier Order' }));
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveTextContent('Delete saved draft?');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Delete draft and start new' })).toHaveAttribute(
      'data-variant',
      'destructive-outline',
    );
    expect(within(dialog).getByRole('button', { name: 'Resume draft' })).toHaveAttribute('data-variant', 'default');
    expect(within(dialog).getAllByRole('button').map((button) => button.textContent)).toEqual([
      'Delete draft and start new',
      'Cancel',
      'Resume draft',
    ]);

    fireEvent.click(within(dialog).getByRole('button', { name: 'Resume draft' }));
    expect(window.localStorage.getItem('kaur-khor:record-update:draft:supplier-order-pending:v1')).toBe('{"version":1}');
    expect(screen.getByTestId('location')).toHaveTextContent('/work/capture/supplier-order');
  });

  test('falls back to the leave-page prompt when draft storage is blocked', () => {
    const localStorageDescriptor = Object.getOwnPropertyDescriptor(window, 'localStorage');
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      get() {
        throw new Error('storage blocked');
      },
    });

    try {
      render(
        <MemoryRouter initialEntries={['/catalog/skus/sku-1']}>
          <Routes>
            <Route
              element={
                <>
                  <SkuMutationActions
                    actionContext={skuActionContext}
                    onComplete={vi.fn(async () => {})}
                    skuId="sku-1"
                  />
                  <LocationProbe />
                </>
              }
              path="*"
            />
          </Routes>
        </MemoryRouter>,
      );

      fireEvent.click(screen.getByRole('button', { name: 'Record' }));
      fireEvent.click(screen.getByRole('menuitem', { name: 'Supplier Order' }));
      const dialog = screen.getByRole('dialog');
      expect(dialog).toHaveTextContent('Leave detail page?');
      expect(within(dialog).queryByRole('button', { name: 'Delete draft and start new' })).not.toBeInTheDocument();
    } finally {
      if (localStorageDescriptor) {
        Object.defineProperty(window, 'localStorage', localStorageDescriptor);
      }
    }
  });

  test('falls back to the leave-page prompt when draft reads fail', () => {
    const localStorageDescriptor = Object.getOwnPropertyDescriptor(window, 'localStorage');
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      value: {
        getItem: () => {
          throw new Error('read blocked');
        },
        removeItem: vi.fn(),
      },
    });

    try {
      render(
        <MemoryRouter initialEntries={['/catalog/skus/sku-1']}>
          <Routes>
            <Route
              element={
                <>
                  <SkuMutationActions
                    actionContext={skuActionContext}
                    onComplete={vi.fn(async () => {})}
                    skuId="sku-1"
                  />
                  <LocationProbe />
                </>
              }
              path="*"
            />
          </Routes>
        </MemoryRouter>,
      );

      fireEvent.click(screen.getByRole('button', { name: 'Record' }));
      fireEvent.click(screen.getByRole('menuitem', { name: 'Supplier Order' }));
      expect(screen.getByRole('dialog')).toHaveTextContent('Leave detail page?');
    } finally {
      if (localStorageDescriptor) {
        Object.defineProperty(window, 'localStorage', localStorageDescriptor);
      }
    }
  });

  test('continues capture navigation when draft deletion fails', () => {
    const localStorageDescriptor = Object.getOwnPropertyDescriptor(window, 'localStorage');
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      value: {
        getItem: () => '{"version":1}',
        removeItem: () => {
          throw new Error('delete blocked');
        },
      },
    });

    try {
      render(
        <MemoryRouter initialEntries={['/catalog/skus/sku-1']}>
          <Routes>
            <Route
              element={
                <>
                  <SkuMutationActions
                    actionContext={skuActionContext}
                    onComplete={vi.fn(async () => {})}
                    skuId="sku-1"
                  />
                  <LocationProbe />
                </>
              }
              path="*"
            />
          </Routes>
        </MemoryRouter>,
      );

      fireEvent.click(screen.getByRole('button', { name: 'Record' }));
      fireEvent.click(screen.getByRole('menuitem', { name: 'Supplier Order' }));
      fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Delete draft and start new' }));

      expect(screen.getByTestId('location')).toHaveTextContent(
        '/work/capture/supplier-order?targetAction=supplier-order&targetType=sku&targetId=sku-1&ticketMode=new',
      );
    } finally {
      if (localStorageDescriptor) {
        Object.defineProperty(window, 'localStorage', localStorageDescriptor);
      }
    }
  });
});
