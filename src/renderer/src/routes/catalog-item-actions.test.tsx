import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { buildLeadTimeHintFromInputs, ServiceMutationActions, SkuMutationActions } from './catalog-item-actions';

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
          catalogSenaSkuLeadTimeVariability: 'Lead time variability',
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
          catalogSenaSkuTypicalLeadTimeDays: 'Typical lead time days',
          catalogSenaSkuUnitsInStock: 'Units in stock',
          catalogSenaSkuCostPerUnit: 'Cost per unit',
          catalogSkuEditAction: 'Edit SKU',
          catalogSkuLeadTimeVariabilityPlaceholder: 'Choose variability',
          sheetUnsavedLeavePrompt: 'Unsaved changes',
        }[key] ?? key),
      usdToKhrExchangeRate: 4100,
    });
  });

  test('builds preset lead-time hints from the jittered std-days value', () => {
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

  test('builds custom lead-time hints from typed uncertainty days', () => {
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

  test('opens the controlled SKU sheet and clears mode on close', async () => {
    const handleModeChange = vi.fn();

    render(
      <MemoryRouter>
        <SkuMutationActions
          actionContext={{
            currentStock: 12,
            costPerUnit: 4,
            leadTimeVariability: null,
            latestObservationAt: '2026-04-02T00:00:00Z',
            productPrice: 9,
            recommendedOrderQuantity: 6,
            reorderRecommendation: {
              compactLabel: 'Order 6',
              likelyRangeLabel: 'Likely range 5-7',
              needProbabilityLabel: '91% need probability',
              optionalOrderLabel: null,
              quietLabel: 'Quiet',
              recommendationIssued: true,
              recommendedOrderLabel: 'Order 6',
              recommendedUnits: 6,
            },
            soldAsProduct: true,
          }}
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
                  actionContext={{
                    currentStock: 12,
                    costPerUnit: 4,
                    leadTimeVariability: null,
                    latestObservationAt: '2026-04-02T00:00:00Z',
                    productPrice: 9,
                    recommendedOrderQuantity: 6,
                    reorderRecommendation: {
                      compactLabel: 'Order 6',
                      likelyRangeLabel: 'Likely range 5-7',
                      needProbabilityLabel: '91% need probability',
                      optionalOrderLabel: null,
                      quietLabel: 'Quiet',
                      recommendationIssued: true,
                      recommendedOrderLabel: 'Order 6',
                      recommendedUnits: 6,
                    },
                    soldAsProduct: true,
                  }}
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
    expect(screen.getByRole('menuitem', { name: 'Stock Count' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Supplier Order' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Customer Order' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Immediate Sale' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Updated Price' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('menuitem', { name: 'Supplier Order' }));
    expect(screen.getByTestId('location')).toHaveTextContent(
      '/work/capture/supplier-order?targetAction=supplier-order&targetType=sku&targetId=sku-1&ticketMode=new',
    );
  });

  test('prompts before deleting a saved draft for direct capture actions', () => {
    window.localStorage.setItem('banji:record-update:draft:supplier-order-pending:v1', '{"version":1}');
    render(
      <MemoryRouter initialEntries={['/catalog/skus/sku-1']}>
        <Routes>
          <Route
            element={
              <>
                <SkuMutationActions
                  actionContext={{
                    currentStock: 12,
                    costPerUnit: 4,
                    leadTimeVariability: null,
                    latestObservationAt: '2026-04-02T00:00:00Z',
                    productPrice: 9,
                    recommendedOrderQuantity: 6,
                    reorderRecommendation: {
                      compactLabel: 'Order 6',
                      likelyRangeLabel: 'Likely range 5-7',
                      needProbabilityLabel: '91% need probability',
                      optionalOrderLabel: null,
                      quietLabel: 'Quiet',
                      recommendationIssued: true,
                      recommendedOrderLabel: 'Order 6',
                      recommendedUnits: 6,
                    },
                    soldAsProduct: true,
                  }}
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
    expect(screen.getByRole('dialog')).toHaveTextContent('Delete saved draft?');

    fireEvent.click(screen.getByRole('button', { name: 'Resume draft' }));
    expect(window.localStorage.getItem('banji:record-update:draft:supplier-order-pending:v1')).toBe('{"version":1}');
    expect(screen.getByTestId('location')).toHaveTextContent('/work/capture/supplier-order');
  });
});
