import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { Link, MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getTranslation } from '@/lib/translations';
import { StockUpdateSessionRoute } from './stock-update-session';

const inventoryHook = vi.fn();
const ingestSenaObservation = vi.fn();
const triggerSenaRun = vi.fn();
const preferenceState = {
  currency: 'USD' as const,
  language: 'en' as const,
  usdToKhrExchangeRate: 4000,
  showFloatingTitleActions: false,
};
const STOCK_UPDATE_DRAFT_STORAGE_KEY = 'banji:record-update:draft:v1';

if (!Element.prototype.hasPointerCapture) {
  Element.prototype.hasPointerCapture = () => false;
}

if (!Element.prototype.setPointerCapture) {
  Element.prototype.setPointerCapture = () => {};
}

if (!Element.prototype.releasePointerCapture) {
  Element.prototype.releasePointerCapture = () => {};
}

if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => {};
}

vi.mock('../state/inventory', () => ({
  useInventory: () => inventoryHook(),
}));

vi.mock('../state/preferences', () => ({
  usePreferences: () => ({
    ...preferenceState,
    t: (key: string, variables?: Record<string, string | number | null | undefined>) =>
      getTranslation('en', key as never, variables),
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

function renderRoutedSession(nextObservations = observations) {
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
    <MemoryRouter initialEntries={['/record-update']}>
      <Routes>
        <Route
          element={
            <>
              <Link to="/catalog">Catalog</Link>
              <StockUpdateSessionRoute />
            </>
          }
          path="/record-update"
        />
        <Route element={<div>Catalog destination</div>} path="/catalog" />
      </Routes>
    </MemoryRouter>,
  );
}

function goNext(times = 1) {
  for (let index = 0; index < times; index += 1) {
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
  }
}

function installMemoryLocalStorage() {
  const storage = new Map<string, string>();
  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    value: {
      clear: () => storage.clear(),
      getItem: (key: string) => storage.get(key) ?? null,
      key: (index: number) => Array.from(storage.keys())[index] ?? null,
      removeItem: (key: string) => storage.delete(key),
      setItem: (key: string, value: string) => storage.set(key, value),
      get length() {
        return storage.size;
      },
    },
  });
}

describe('StockUpdateSessionRoute', () => {
  beforeEach(() => {
    preferenceState.currency = 'USD';
    preferenceState.language = 'en';
    preferenceState.usdToKhrExchangeRate = 4000;
    preferenceState.showFloatingTitleActions = false;
    installMemoryLocalStorage();
    ingestSenaObservation.mockResolvedValue({ observationId: 'obs-new' });
    triggerSenaRun.mockResolvedValue({ runId: 'run-1' });
  });

  afterEach(() => {
    cleanup();
    window.localStorage.clear();
    vi.clearAllMocks();
  });

  it('shows the 5-step wizard, preserves state, and keeps future steps locked', () => {
    renderRoute();

    expect(screen.getByRole('button', { name: /Count SKU stock/i })).toHaveAttribute('aria-current', 'step');
    expect(screen.getByRole('progressbar', { name: 'Wizard progress' })).toHaveAttribute('aria-valuenow', '20');
    expect(screen.getByRole('button', { name: /Add service updates/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /Review update/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Discard changes' })).toBeDisabled();

    goNext(3);

    expect(screen.getByRole('button', { name: /Record update details/i })).toHaveAttribute('aria-current', 'step');
    expect(screen.getByRole('progressbar', { name: 'Wizard progress' })).toHaveAttribute('aria-valuenow', '80');
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Busy Friday shift' } });

    fireEvent.click(screen.getByRole('button', { name: /Count SKU stock/i }));
    goNext(3);
    expect(screen.getByRole('textbox')).toHaveValue('Busy Friday shift');

    fireEvent.click(screen.getByRole('button', { name: /Rank recent selling order/i }));
    expect(screen.queryByRole('button', { name: 'Start ranking' })).not.toBeInTheDocument();
  }, 10_000);

  it('blocks the first observation until at least one SKU stock row changes', () => {
    renderRoute([]);

    expect(screen.getByRole('button', { name: /Count SKU stock/i })).toHaveAttribute('aria-current', 'step');
    expect(
      screen.getByText('Count at least one SKU before continuing so Banji can anchor the first update.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();

    fireEvent.change(screen.getAllByLabelText('Units in stock')[0]!, { target: { value: '7' } });
    expect(screen.getByRole('button', { name: 'Next' })).toBeEnabled();
  });

  it('reveals the flags column for SKU rows and saves ordered quantities as order signals', async () => {
    renderRoute();

    expect(screen.queryByRole('button', { name: 'Cell boundaries' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Add flags for Razor refill/i }));
    fireEvent.click(screen.getAllByRole('menuitem', { name: 'Add order' })[0]!);

    expect(screen.getAllByText('Flags').length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: 'Remove order flag for Razor refill' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Remove order flag for Razor refill' }));
    expect(screen.queryByLabelText('Ordered quantity for Razor refill')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Add flags for Razor refill/i }));
    fireEvent.click(screen.getAllByRole('menuitem', { name: 'Add order' })[0]!);

    fireEvent.change(screen.getByLabelText('Ordered quantity for Razor refill'), { target: { value: '14' } });

    goNext(4);

    expect(screen.getByRole('button', { name: /Review update/i })).toHaveAttribute('aria-current', 'step');
    fireEvent.click(screen.getByRole('button', { name: 'Save update' }));

    await waitFor(() => expect(ingestSenaObservation).toHaveBeenCalledTimes(1));
    expect(ingestSenaObservation).toHaveBeenCalledWith(
      expect.objectContaining({
        stockSnapshot: [],
        orderSignals: [
          expect.objectContaining({
            skuId: 'sku-1',
            orderPlaced: true,
            approximateOrderQuantity: 14,
          }),
        ],
      }),
    );
  });

  it('allows a later service price-only update and saves regime from the merged interval step', async () => {
    renderRoute();

    goNext();

    expect(screen.getByRole('button', { name: /Add service updates/i })).toHaveAttribute('aria-current', 'step');
    fireEvent.click(screen.getByRole('button', { name: /Add flags for Haircut/i }));
    fireEvent.click(screen.getAllByRole('menuitem', { name: 'Add price change' })[0]!);
    fireEvent.change(screen.getByLabelText('Price if changed for Haircut'), { target: { value: '15' } });

    goNext(2);

    expect(screen.getByRole('button', { name: /Record update details/i })).toHaveAttribute('aria-current', 'step');
    expect(screen.queryByText(/Regime guide/i)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Overall sales pattern help' })).toBeInTheDocument();
    expect(screen.queryByText('This sales pattern applies to the full update, not just one SKU.')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('combobox', { name: /overall sales pattern/i }));
    fireEvent.click(screen.getByRole('option', { name: 'Promotion pattern' }));
    expect(screen.getByText('A promotion or campaign shaped this period.')).toBeInTheDocument();

    goNext();
    fireEvent.click(screen.getByRole('button', { name: 'Save update' }));

    await waitFor(() => expect(ingestSenaObservation).toHaveBeenCalledTimes(1));
    expect(ingestSenaObservation).toHaveBeenCalledWith(
      expect.objectContaining({
        stockSnapshot: [],
        servicePrices: [{ serviceId: 'service-1', price: 15 }],
        regimeHint: 'promo',
      }),
    );
  });

  it('reformats service price drafts when currency preferences change', async () => {
    const rendered = renderRoute();

    goNext();

    fireEvent.click(screen.getByRole('button', { name: /Add flags for Haircut/i }));
    fireEvent.click(screen.getAllByRole('menuitem', { name: 'Add price change' })[0]!);
    const priceInput = screen.getByLabelText('Price if changed for Haircut');
    fireEvent.change(priceInput, { target: { value: '15' } });
    expect(priceInput).toHaveValue(15);

    preferenceState.currency = 'KHR';
    preferenceState.usdToKhrExchangeRate = 4000;
    rendered.rerender(
      <MemoryRouter>
        <StockUpdateSessionRoute />
      </MemoryRouter>,
    );

    expect(screen.getByLabelText('Price if changed for Haircut')).toHaveValue(60000);

    goNext(2);
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save update' }));

    await waitFor(() => expect(ingestSenaObservation).toHaveBeenCalledTimes(1));
    expect(ingestSenaObservation).toHaveBeenCalledWith(
      expect.objectContaining({
        servicePrices: [{ serviceId: 'service-1', price: 15 }],
      }),
    );
  });

  it('submits only changed stock rows and still triggers the SENA run', async () => {
    renderRoute();

    fireEvent.change(screen.getAllByLabelText('Units in stock')[0]!, { target: { value: '7' } });
    window.localStorage.setItem(STOCK_UPDATE_DRAFT_STORAGE_KEY, 'stale draft');

    goNext(4);

    expect(screen.getByRole('button', { name: /Review update/i })).toHaveAttribute('aria-current', 'step');
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
    expect(window.localStorage.getItem(STOCK_UPDATE_DRAFT_STORAGE_KEY)).toBeNull();
  });

  it('auto-saves a meaningful draft on unmount and resumes it on the next mount', async () => {
    const { unmount } = renderRoute();

    fireEvent.click(screen.getByRole('button', { name: /Add flags for Razor refill/i }));
    fireEvent.click(screen.getAllByRole('menuitem', { name: 'Add order' })[0]!);
    fireEvent.change(screen.getByLabelText('Ordered quantity for Razor refill'), { target: { value: '14' } });
    goNext(3);
    fireEvent.change(screen.getAllByRole('textbox').at(-1)!, { target: { value: 'Draft note' } });

    unmount();

    expect(JSON.parse(window.localStorage.getItem(STOCK_UPDATE_DRAFT_STORAGE_KEY) ?? '{}')).toEqual(
      expect.objectContaining({
        currentStepId: 'context',
        notes: 'Draft note',
        skuSignalDrafts: expect.objectContaining({
          'sku-1': expect.objectContaining({
            orderEnabled: true,
            orderedQuantity: '14',
          }),
        }),
      }),
    );

    renderRoute();

    await waitFor(() =>
      expect(screen.getByRole('button', { name: /Record update details/i })).toHaveAttribute(
        'aria-current',
        'step',
      ),
    );
    expect(screen.getByDisplayValue('Draft note')).toBeInTheDocument();
    expect(screen.getByText('Draft resumed')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Discard changes' })).toBeEnabled();

    fireEvent.click(screen.getByRole('button', { name: /Count SKU stock/i }));
    expect(screen.getByLabelText('Ordered quantity for Razor refill')).toHaveValue(14);
  });

  it('asks before discarding changes and resets only after confirmation', async () => {
    renderRoute();

    fireEvent.change(screen.getAllByLabelText('Units in stock')[0]!, { target: { value: '7' } });
    fireEvent.click(screen.getByRole('button', { name: 'Discard changes' }));

    expect(screen.getByRole('dialog')).toHaveTextContent('Discard changes?');
    fireEvent.click(screen.getByRole('button', { name: 'Keep editing' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getAllByLabelText('Units in stock')[0]).toHaveValue(7);

    fireEvent.click(screen.getByRole('button', { name: 'Discard changes' }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Discard changes' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(screen.getAllByLabelText('Units in stock')[0]).toHaveValue(12);
    expect(screen.getByRole('button', { name: 'Discard changes' })).toBeDisabled();
    expect(window.localStorage.getItem(STOCK_UPDATE_DRAFT_STORAGE_KEY)).toBeNull();
  });

  it('asks before navigating away with a record update draft', async () => {
    renderRoutedSession();

    fireEvent.change(screen.getAllByLabelText('Units in stock')[0]!, { target: { value: '7' } });
    fireEvent.click(screen.getByRole('link', { name: 'Catalog' }));

    expect(screen.getByRole('dialog')).toHaveTextContent('Discard changes?');
    fireEvent.click(screen.getByRole('button', { name: 'Keep editing' }));
    expect(screen.queryByText('Catalog destination')).not.toBeInTheDocument();
    expect(screen.getAllByLabelText('Units in stock')[0]).toHaveValue(7);

    fireEvent.click(screen.getByRole('link', { name: 'Catalog' }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Discard changes' }));

    await waitFor(() => {
      expect(screen.getByText('Catalog destination')).toBeInTheDocument();
    });
    expect(window.localStorage.getItem(STOCK_UPDATE_DRAFT_STORAGE_KEY)).toBeNull();
  });

  it('ignores corrupt saved drafts without crashing', () => {
    window.localStorage.setItem(STOCK_UPDATE_DRAFT_STORAGE_KEY, '{not valid json');

    renderRoute();

    expect(screen.getByRole('button', { name: /Count SKU stock/i })).toHaveAttribute('aria-current', 'step');
    expect(window.localStorage.getItem(STOCK_UPDATE_DRAFT_STORAGE_KEY)).toBeNull();
  });
});
