import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { ServiceMutationActions, SkuMutationActions } from './catalog-item-actions';

const inventoryHook = vi.fn();
const preferencesHook = vi.fn();

vi.mock('@/state/inventory', () => ({
  useInventory: () => inventoryHook(),
}));

vi.mock('@/state/preferences', () => ({
  usePreferences: () => preferencesHook(),
}));

describe('catalog item action sheets', () => {
  beforeEach(() => {
    inventoryHook.mockReturnValue({
      ingestSenaObservation: vi.fn(),
      isSaving: false,
      submitLegacyReport: vi.fn(),
      triggerSenaRun: vi.fn(),
    });
    preferencesHook.mockReturnValue({
      currency: 'USD',
      t: (key: string) =>
        ({
          catalogSenaSkuDialogDescription: 'Capture the signal.',
          catalogSenaSkuLeadTimeVariability: 'Lead time variability',
          catalogSenaSkuLeadTimeVariabilityHint: 'Choose variability.',
          catalogSenaSkuLogOrder: 'Log order',
          catalogSenaSkuLogReceipt: 'Log receipt',
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
});
