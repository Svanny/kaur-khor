import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
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

if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => {};
}

describe('catalog item action sheets', () => {
  beforeEach(() => {
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

  test('removes the lead time variability placeholder after a real choice in the order sheet', async () => {
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
          mode="order"
          onComplete={vi.fn(async () => {})}
          onModeChange={vi.fn()}
          skuId="sku-1"
        />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole('combobox', { name: 'Lead time variability' }));
    expect(screen.getByRole('option', { name: 'Choose variability' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('option', { name: 'Wide' }));

    fireEvent.click(screen.getByRole('combobox', { name: 'Lead time variability' }));
    expect(screen.queryByRole('option', { name: 'Choose variability' })).not.toBeInTheDocument();
  });

  test('closes the SKU receipt sheet after save even while refresh work is still pending', async () => {
    let resolveTriggerRun: ((value: { runId: string }) => void) | null = null;
    let resolveOnComplete: (() => void) | null = null;
    inventoryHook.mockReturnValue({
      ingestSenaObservation: vi.fn(async (payload: unknown) => payload),
      isSaving: false,
      runWorkspacePreparation: vi.fn(async (task: () => Promise<unknown>) => task()),
      triggerSenaRun: vi.fn(
        () =>
          new Promise<{ runId: string }>((resolve) => {
            resolveTriggerRun = resolve;
          }),
      ),
    });

    function ControlledSkuSheetHarness() {
      const [mode, setMode] = useState<'receipt' | null>('receipt');

      return mode ? (
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
          mode={mode}
          onComplete={() =>
            new Promise<void>((resolve) => {
              resolveOnComplete = resolve;
            })}
          onModeChange={setMode}
          skuId="sku-1"
        />
      ) : (
        <div>Sheet closed</div>
      );
    }

    render(
      <MemoryRouter>
        <ControlledSkuSheetHarness />
      </MemoryRouter>,
    );

    fireEvent.change(screen.getByLabelText('Approximate receipt quantity'), { target: { value: '24' } });
    fireEvent.change(screen.getByLabelText('Units in stock'), { target: { value: '36' } });
    fireEvent.change(screen.getByLabelText('Cost per unit'), { target: { value: '4' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save and refresh' }));

    await waitFor(() => {
      expect(inventoryHook().ingestSenaObservation).toHaveBeenCalledTimes(1);
      expect(inventoryHook().runWorkspacePreparation).toHaveBeenCalledTimes(1);
      expect(screen.getByText('Sheet closed')).toBeInTheDocument();
    });

    resolveOnComplete?.();
    resolveTriggerRun?.({ runId: 'run-2' });
  });
});
