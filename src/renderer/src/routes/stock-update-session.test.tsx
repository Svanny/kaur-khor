import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { Link, MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRecordUpdateEditSession } from '@/lib/observation-edit-session';
import { getTranslation } from '@/lib/translations';
import { StockUpdateSessionRoute } from './stock-update-session';

const inventoryHook = vi.fn();
const ingestSenaObservation = vi.fn();
const runWorkspacePreparation = vi.fn();
const updateSenaObservation = vi.fn();
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
    runWorkspacePreparation,
    triggerSenaRun,
    updateSenaObservation,
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

function deferredPromise<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((nextResolve, nextReject) => {
    resolve = nextResolve;
    reject = nextReject;
  });
  return { promise, resolve, reject };
}

function localDateTimeValue(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

function renderRouteWithCatalog(nextCatalog: typeof catalog, nextObservations = observations) {
  inventoryHook.mockReturnValue({
    catalog: nextCatalog,
    ingestSenaObservation,
    isLoading: false,
    isSaving: false,
    latestRun: null,
    observations: nextObservations,
    runWorkspacePreparation,
    triggerSenaRun,
    updateSenaObservation,
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
    runWorkspacePreparation,
    triggerSenaRun,
    updateSenaObservation,
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
        <Route element={<div>Overview destination</div>} path="/" />
        <Route element={<div>Catalog destination</div>} path="/catalog" />
      </Routes>
    </MemoryRouter>,
  );
}

function renderEditRoute(observation = observations[0]!, nextObservations = observations) {
  inventoryHook.mockReturnValue({
    catalog,
    ingestSenaObservation,
    isLoading: false,
    isSaving: false,
    latestRun: null,
    observations: nextObservations,
    runWorkspacePreparation,
    triggerSenaRun,
    updateSenaObservation,
    workspaceSummary: {
      highRiskSkuIds: ['sku-1'],
    },
  });

  return render(
    <MemoryRouter
      initialEntries={[
        {
          pathname: '/record-update',
          state: {
            editSession: createRecordUpdateEditSession(observation),
          },
        },
      ]}
    >
      <StockUpdateSessionRoute />
    </MemoryRouter>,
  );
}

function renderRouteWithInlineEditLink(observation = observations[0]!, nextObservations = observations) {
  inventoryHook.mockReturnValue({
    catalog,
    ingestSenaObservation,
    isLoading: false,
    isSaving: false,
    latestRun: null,
    observations: nextObservations,
    triggerSenaRun,
    updateSenaObservation,
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
              <Link
                state={{
                  editSession: createRecordUpdateEditSession(observation),
                }}
                to="/record-update"
              >
                Edit saved report
              </Link>
              <StockUpdateSessionRoute />
            </>
          }
          path="/record-update"
        />
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
    updateSenaObservation.mockResolvedValue({ observationId: 'obs-1' });
    triggerSenaRun.mockResolvedValue({ runId: 'run-1' });
    runWorkspacePreparation.mockImplementation(async (task: () => Promise<unknown>) => task());
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
  }, 20_000);

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

  it('defaults observed at to the current local system date and time', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-09T16:44:00+07:00'));

    try {
      renderRoute();

      goNext(3);

      expect(screen.getByDisplayValue(localDateTimeValue(new Date()))).toBeInTheDocument();
      expect(
        screen.getByText(
          'Banji starts with this device’s current date and time here. Adjust it only if the update was observed earlier.',
        ),
      ).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
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
  }, 10_000);

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

  it('shows a helper in the service step when the catalog has no services', async () => {
    renderRouteWithCatalog({
      ...catalog,
      services: [],
      sharingMask: [],
    });

    goNext();
    expect(screen.getByRole('button', { name: /Add service updates/i })).toHaveAttribute('aria-current', 'step');

    expect(
      screen.getByText(
        'No services are in the catalog yet. Skip this section, or add a service first if you need to record a service update.',
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText('Latest price')).not.toBeInTheDocument();
    expect(screen.queryByText('Add flags')).not.toBeInTheDocument();
  });

  it('shows a helper in the stock step when the catalog has no skus', async () => {
    renderRouteWithCatalog({
      ...catalog,
      skus: [],
      services: [],
      sharingMask: [],
    });

    expect(
      screen.getByText(
        'No SKUs are in the catalog yet. Skip this section, or add a SKU first if you need to record stock updates.',
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText('SKU / latest update')).not.toBeInTheDocument();
    expect(screen.queryByText('Units in stock')).not.toBeInTheDocument();
    expect(screen.queryByText('Add flags')).not.toBeInTheDocument();
  });

  it('shows helpers and hides ranking tables when nothing is eligible to rank', async () => {
    renderRouteWithCatalog({
      ...catalog,
      services: [],
      skus: catalog.skus.map((sku) => ({
        ...sku,
        soldAsProduct: false,
        productPrice: null,
      })),
      sharingMask: [],
    });

    goNext(2);
    expect(screen.getByRole('button', { name: /Rank recent selling order/i })).toHaveAttribute('aria-current', 'step');

    expect(
      screen.getByText(
        'No services are in the catalog yet. Skip this section, or add a service first if you need to rank service demand.',
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        'No sellable SKUs are ready for ranking yet. Skip this section, or mark a SKU sellable with a selling price first.',
      ),
    ).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
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

  it('hydrates edit mode from a saved observation and saves through update', async () => {
    const editableObservation = {
      ...observations[0]!,
      input: {
        ...observations[0]!.input,
        notes: 'Saved note',
        stockSnapshot: [
          { skuId: 'sku-1', unitsInStock: 11, costPerUnit: 4, productPrice: 9 },
          { skuId: 'sku-2', unitsInStock: 6, costPerUnit: 2, productPrice: null },
        ],
        orderSignals: [
          {
            skuId: 'sku-1',
            orderPlaced: true,
            receiptArrived: false,
            approximateOrderQuantity: 14,
            approximateReceiptQuantity: null,
          },
        ],
        servicePrices: [{ serviceId: 'service-1', price: 15 }],
        regimeHint: 'promo' as const,
      },
    };

    renderEditRoute(editableObservation);

    fireEvent.change(screen.getAllByLabelText('Units in stock')[0]!, { target: { value: '9' } });
    expect(screen.getByLabelText('Ordered quantity for Razor refill')).toHaveValue(14);

    goNext();
    expect(screen.getByLabelText('Price if changed for Haircut')).toHaveValue(15);

    goNext(2);
    expect(screen.getByDisplayValue('Saved note')).toBeInTheDocument();

    goNext();
    fireEvent.click(screen.getByRole('button', { name: 'Save update' }));

    await waitFor(() => expect(updateSenaObservation).toHaveBeenCalledTimes(1));
    expect(updateSenaObservation).toHaveBeenCalledWith({
      observationId: 'obs-1',
      input: expect.objectContaining({
        notes: 'Saved note',
        regimeHint: 'promo',
        servicePrices: [{ serviceId: 'service-1', price: 15 }],
        orderSignals: [
          {
            skuId: 'sku-1',
            orderPlaced: true,
            receiptArrived: false,
            approximateOrderQuantity: 14,
            approximateReceiptQuantity: null,
          },
        ],
      }),
    });
    expect(updateSenaObservation.mock.calls[0]![0].input.stockSnapshot).toEqual([
      { skuId: 'sku-1', unitsInStock: 9, costPerUnit: 4, productPrice: 9 },
      { skuId: 'sku-2', unitsInStock: 6, costPerUnit: 2, productPrice: null },
    ]);
    expect(ingestSenaObservation).not.toHaveBeenCalled();
  }, 10_000);

  it('resets the session immediately after saving and starts the rerun in the background', async () => {
    const rerun = deferredPromise<void>();
    triggerSenaRun.mockReturnValueOnce(rerun.promise);
    runWorkspacePreparation.mockImplementationOnce(async (task: () => Promise<unknown>) => task());

    renderRoutedSession();

    fireEvent.change(screen.getAllByLabelText('Units in stock')[0]!, { target: { value: '7' } });
    goNext(4);
    fireEvent.click(screen.getByRole('button', { name: 'Save update' }));

    await waitFor(() => expect(ingestSenaObservation).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(runWorkspacePreparation).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(triggerSenaRun).toHaveBeenCalledWith({ algorithmVersion: 'sena-analysis-v3' }));

    await waitFor(() => expect(screen.getByText('Overview destination')).toBeInTheDocument());
    expect(window.localStorage.getItem(STOCK_UPDATE_DRAFT_STORAGE_KEY)).toBeNull();

    rerun.resolve(undefined);
  });

  it('keeps a partial historical stock snapshot when saving an edit', async () => {
    const editableObservation = {
      ...observations[0]!,
      input: {
        ...observations[0]!.input,
        notes: 'Saved note',
        stockSnapshot: [
          { skuId: 'sku-1', unitsInStock: 11, costPerUnit: 4, productPrice: 9 },
        ],
      },
    };

    renderEditRoute(editableObservation);

    fireEvent.change(screen.getAllByLabelText('Units in stock')[0]!, { target: { value: '9' } });

    goNext(4);
    fireEvent.click(screen.getByRole('button', { name: 'Save update' }));

    await waitFor(() => expect(updateSenaObservation).toHaveBeenCalledTimes(1));
    expect(updateSenaObservation.mock.calls[0]![0].input.stockSnapshot).toEqual([
      { skuId: 'sku-1', unitsInStock: 9, costPerUnit: 4, productPrice: 9 },
    ]);
  });

  it('keeps archived entities available when editing a saved observation', async () => {
    const archivedCatalog = {
      ...catalog,
      skus: catalog.skus.map((sku) =>
        sku.skuId === 'sku-2' ? { ...sku, archived: true } : { ...sku, archived: false },
      ),
      services: catalog.services.map((service) => ({ ...service, archived: false })),
    };
    const archivedObservation = {
      ...observations[0]!,
      input: {
        ...observations[0]!.input,
        stockSnapshot: [
          { skuId: 'sku-2', unitsInStock: 6, costPerUnit: 2, productPrice: null },
        ],
        notes: 'Archived note',
      },
    };

    inventoryHook.mockReturnValue({
      catalog: archivedCatalog,
      ingestSenaObservation,
      isLoading: false,
      isSaving: false,
      latestRun: null,
      observations,
      runWorkspacePreparation,
      triggerSenaRun,
      updateSenaObservation,
      workspaceSummary: {
        highRiskSkuIds: ['sku-1'],
      },
    });

    render(
      <MemoryRouter
        initialEntries={[
          {
            pathname: '/record-update',
            state: {
              editSession: createRecordUpdateEditSession(archivedObservation),
            },
          },
        ]}
      >
        <StockUpdateSessionRoute />
      </MemoryRouter>,
    );

    expect(screen.getByText('Towel')).toBeInTheDocument();

    goNext(4);
    fireEvent.click(screen.getByRole('button', { name: 'Save update' }));

    await waitFor(() => expect(updateSenaObservation).toHaveBeenCalledTimes(1));
    expect(updateSenaObservation.mock.calls[0]![0].input.stockSnapshot).toEqual([
      { skuId: 'sku-2', unitsInStock: 6, costPerUnit: 2, productPrice: null },
    ]);
  });

  it('asks before replacing a saved local draft with an edit session', async () => {
    window.localStorage.setItem(
      STOCK_UPDATE_DRAFT_STORAGE_KEY,
      JSON.stringify({
        version: 1,
        savedAt: '2026-04-04T00:00:00.000Z',
        currentStepId: 'context',
        unlockedStepCount: 4,
        observedAt: '2026-04-04T00:00',
        notes: 'Existing draft',
        stockView: 'priority',
        rows: [],
        skuSignalDrafts: {},
        serviceSignalDrafts: {},
        regimeHint: '',
        serviceRankings: [],
        retailRankings: [],
      }),
    );

    renderEditRoute();

    expect(screen.getByRole('dialog')).toHaveTextContent('Replace saved draft?');
    expect(screen.getByRole('dialog')).toHaveTextContent(
      'You already have an in-progress logs update on this device. Replace it with the saved report you chose to edit?',
    );

    fireEvent.click(screen.getByRole('button', { name: 'Replace draft' }));

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
    expect(screen.queryByDisplayValue('Existing draft')).not.toBeInTheDocument();
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
  }, 10_000);

  it('asks before replacing a live in-memory draft with an edit session', async () => {
    renderRouteWithInlineEditLink();

    fireEvent.change(screen.getAllByLabelText('Units in stock')[0]!, { target: { value: '7' } });
    fireEvent.click(screen.getByRole('link', { name: 'Edit saved report' }));

    expect(screen.getByRole('dialog')).toHaveTextContent('Replace saved draft?');
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(screen.getAllByLabelText('Units in stock')[0]).toHaveValue(7);
  });

  it('asks before discarding changes and resets only after confirmation', async () => {
    renderRoute();

    fireEvent.change(screen.getAllByLabelText('Units in stock')[0]!, { target: { value: '7' } });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Discard changes' })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: 'Discard changes' }));

    await waitFor(() => expect(screen.getByRole('dialog')).toHaveTextContent('Discard changes?'));
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

  it('saves the draft before navigating away from a record update session', async () => {
    renderRoutedSession();

    fireEvent.change(screen.getAllByLabelText('Units in stock')[0]!, { target: { value: '7' } });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Discard changes' })).toBeEnabled());
    fireEvent.click(screen.getByRole('link', { name: 'Catalog' }));

    await waitFor(() => expect(screen.getByRole('dialog')).toHaveTextContent('Leave record update?'));
    fireEvent.click(screen.getByRole('button', { name: 'Keep editing' }));
    expect(screen.queryByText('Catalog destination')).not.toBeInTheDocument();
    expect(screen.getAllByLabelText('Units in stock')[0]).toHaveValue(7);

    fireEvent.click(screen.getByRole('link', { name: 'Catalog' }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Save draft and leave' }));

    await waitFor(() => {
      expect(screen.getByText('Catalog destination')).toBeInTheDocument();
    });
    expect(JSON.parse(window.localStorage.getItem(STOCK_UPDATE_DRAFT_STORAGE_KEY) ?? '{}')).toEqual(
      expect.objectContaining({
        rows: expect.arrayContaining([expect.objectContaining({ skuId: 'sku-1', unitsInStock: 7 })]),
      }),
    );
  });

  it('ignores corrupt saved drafts without crashing', () => {
    window.localStorage.setItem(STOCK_UPDATE_DRAFT_STORAGE_KEY, '{not valid json');

    renderRoute();

    expect(screen.getByRole('button', { name: /Count SKU stock/i })).toHaveAttribute('aria-current', 'step');
    expect(window.localStorage.getItem(STOCK_UPDATE_DRAFT_STORAGE_KEY)).toBeNull();
  });
});
