import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { StockUpdateSessionRoute } from './stock-update-session';

const inventoryHook = vi.fn();
const ingestSenaObservation = vi.fn();
const triggerSenaRun = vi.fn();

if (!Element.prototype.hasPointerCapture) {
  Element.prototype.hasPointerCapture = () => false;
}

if (!Element.prototype.setPointerCapture) {
  Element.prototype.setPointerCapture = () => {};
}

if (!Element.prototype.releasePointerCapture) {
  Element.prototype.releasePointerCapture = () => {};
}

vi.mock('../state/inventory', () => ({
  useInventory: () => inventoryHook(),
}));

vi.mock('../state/preferences', () => ({
  usePreferences: () => ({
    showFloatingTitleActions: false,
  }),
}));

const catalog = {
  schemaVersion: 1,
  skus: [
    {
      skuId: 'sku-1',
      name: 'Razor refill',
      description: 'Refill pack',
      costPerUnit: 4,
      soldAsProduct: true,
      productPrice: 9,
      leadTimeMeanDaysHint: 5,
      leadTimeStdDaysHint: 1,
    },
    {
      skuId: 'sku-2',
      name: 'Towel',
      description: 'Cotton towel',
      costPerUnit: 2,
      soldAsProduct: false,
      productPrice: null,
      leadTimeMeanDaysHint: 3,
      leadTimeStdDaysHint: 1,
    },
  ],
  services: [
    {
      serviceId: 'service-1',
      name: 'Haircut',
      description: '',
      price: 12,
      bundle: false,
    },
  ],
  bundles: [],
  sharingMask: [
    { serviceId: 'service-1', skuId: 'sku-1', enabled: true, usageProbability: 1 },
    { serviceId: 'service-1', skuId: 'sku-2', enabled: true, usageProbability: 1 },
  ],
};

const observations = [
  {
    observationId: 'obs-1',
    ownerSub: 'desktop-owner',
    input: {
      observedAt: '2026-04-03T12:00:00.000Z',
      stockSnapshot: [
        { skuId: 'sku-1', unitsInStock: 12, costPerUnit: 4, productPrice: 9 },
        { skuId: 'sku-2', unitsInStock: 4, costPerUnit: 2, productPrice: null },
      ],
      serviceRankings: [],
      retailRankings: [],
      serviceStockouts: [],
      retailStockouts: [],
      orderSignals: [],
      servicePrices: [],
      retailPrices: [],
      leadTimeHints: [],
      adjustmentSignals: [],
      recipeUsageHints: [],
      notes: null,
    },
  },
];

function renderRoute(nextObservations = observations) {
  inventoryHook.mockReturnValue({
    catalog,
    ingestSenaObservation,
    isLoading: false,
    isSaving: false,
    latestRun: null,
    observations: nextObservations,
    triggerSenaRun,
    workspaceSummary: {
      highRiskSkuIds: ['sku-1'],
    },
  });

  return render(
    <MemoryRouter>
      <StockUpdateSessionRoute />
    </MemoryRouter>,
  );
}

describe('StockUpdateSessionRoute', () => {
  beforeEach(() => {
    ingestSenaObservation.mockResolvedValue({ observationId: 'obs-new' });
    triggerSenaRun.mockResolvedValue({ runId: 'run-1' });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('shows step 1 with progress, preserves state, and blocks locked future steps', () => {
    renderRoute();

    expect(screen.getByRole('button', { name: /Interval and context/i })).toHaveAttribute('aria-current', 'step');
    expect(screen.getByRole('textbox')).toBeInTheDocument();
    expect(screen.getByRole('progressbar', { name: 'Wizard progress' })).toHaveAttribute('aria-valuenow', '20');
    expect(screen.getByRole('button', { name: /Review and save/i })).toBeDisabled();

    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Busy Friday shift' } });
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));

    expect(screen.getByRole('button', { name: /Stock count/i })).toHaveAttribute('aria-current', 'step');
    expect(screen.getAllByLabelText('Units in stock')).toHaveLength(2);
    expect(screen.getByRole('progressbar', { name: 'Wizard progress' })).toHaveAttribute('aria-valuenow', '40');

    fireEvent.click(screen.getByRole('button', { name: /Interval and context/i }));
    expect(screen.getByRole('textbox')).toHaveValue('Busy Friday shift');
  });

  it('keeps future steps locked until the user advances through the wizard', () => {
    renderRoute();

    expect(screen.getByRole('button', { name: /Real-world events/i })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByRole('button', { name: /Real-world events/i })).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByRole('button', { name: /Real-world events/i })).toHaveAttribute('aria-current', 'step');
    expect(screen.getByRole('button', { name: 'Price changed' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Review and save/i })).toBeDisabled();
  });

  it('blocks the first observation on stock count until at least one SKU is counted', () => {
    renderRoute([]);

    fireEvent.click(screen.getByRole('button', { name: 'Next' }));

    expect(screen.getByRole('button', { name: /Stock count/i })).toHaveAttribute('aria-current', 'step');
    expect(screen.getByText('Count at least one SKU before continuing so Banji can anchor the first update.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();

    fireEvent.click(screen.getAllByRole('checkbox')[0]!);
    expect(screen.getByRole('button', { name: 'Next' })).toBeEnabled();
  });

  it('allows a later price-only update without adding a fake stock snapshot', async () => {
    renderRoute();

    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByRole('button', { name: /Real-world events/i })).toHaveAttribute('aria-current', 'step');
    fireEvent.click(screen.getByRole('button', { name: 'Price changed' }));
    fireEvent.change(screen.getByPlaceholderText('New price'), { target: { value: '15' } });
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByRole('button', { name: /Review and save/i })).toHaveAttribute('aria-current', 'step');
    fireEvent.click(screen.getByRole('button', { name: 'Save update' }));

    await waitFor(() => expect(ingestSenaObservation).toHaveBeenCalledTimes(1));
    expect(ingestSenaObservation).toHaveBeenCalledWith(
      expect.objectContaining({
        stockSnapshot: [],
        servicePrices: [{ serviceId: 'service-1', price: 15 }],
      }),
    );
  });

  it('submits only SKUs marked as counted after progressing through the wizard', async () => {
    renderRoute();

    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    fireEvent.click(screen.getAllByRole('checkbox')[0]!);
    fireEvent.change(screen.getAllByLabelText('Units in stock')[0]!, { target: { value: '7' } });
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save update' }));

    await waitFor(() => expect(ingestSenaObservation).toHaveBeenCalledTimes(1));
    expect(ingestSenaObservation).toHaveBeenCalledWith(
      expect.objectContaining({
        stockSnapshot: [
          expect.objectContaining({
            skuId: 'sku-1',
            unitsInStock: 7,
          }),
        ],
      }),
    );
    expect(ingestSenaObservation.mock.calls[0]![0].stockSnapshot).toHaveLength(1);
    expect(ingestSenaObservation.mock.calls[0]![0].stockSnapshot).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ skuId: 'sku-2' })]),
    );
    expect(triggerSenaRun).toHaveBeenCalledWith({ algorithmVersion: 'sena-analysis-v3' });
  });
});
