import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { Link, MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRecordUpdateEditSession } from '@/lib/observation-edit-session';
import {
  RECORD_UPDATE_RECORD_ORDER_PATH,
  RECORD_UPDATE_RECORD_RECEIPT_PATH,
  RECORD_UPDATE_SALES_UPDATE_PATH,
  RECORD_UPDATE_STOCK_COUNT_PATH,
} from '@/lib/record-update-routes';
import { getTranslation } from '@/lib/translations';
import { buildStockRowOrderStorageKey } from './stock-row-order';
import { StockUpdateSessionRoute } from './stock-update-session';

const inventoryHook = vi.fn();
const createSenaOrderBatch = vi.fn();
const ingestSenaObservation = vi.fn();
const runWorkspacePreparation = vi.fn();
const updateSenaOrderBatch = vi.fn();
const updateSenaOrderChild = vi.fn();
const updateSenaObservation = vi.fn();
const triggerSenaRun = vi.fn();
const preferenceState = {
  currency: 'USD' as const,
  language: 'en' as const,
  usdToKhrExchangeRate: 4000,
  showHeartbeatRibbons: true,
  showFloatingTitleActions: false,
};
const STOCK_UPDATE_DRAFT_STORAGE_KEY = 'banji:record-update:draft:stock-count:v1';
const SALES_UPDATE_DRAFT_STORAGE_KEY = 'banji:record-update:draft:sales-update:v1';
const STOCK_ROW_ORDER_STORAGE_KEY = buildStockRowOrderStorageKey('stock-count');

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
      supplierName: 'Mekong Looms',
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
      supplierName: null,
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
    {
      serviceId: 'service-2',
      name: 'Towel wrap',
      description: '',
      price: 8,
      bundle: false,
    },
  ],
  bundles: [],
  sharingMask: [
    { serviceId: 'service-1', skuId: 'sku-1', enabled: true, usageProbability: 1 },
    { serviceId: 'service-1', skuId: 'sku-2', enabled: false, usageProbability: 1 },
    { serviceId: 'service-2', skuId: 'sku-2', enabled: true, usageProbability: 1 },
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

function inventoryState(overrides: Record<string, unknown> = {}) {
  return {
    catalog,
    createSenaOrderBatch,
    ingestSenaObservation,
    isLoading: false,
    isSaving: false,
    latestRun: null,
    observations,
    orderBatches: [],
    runWorkspacePreparation,
    triggerSenaRun,
    updateSenaObservation,
    updateSenaOrderBatch,
    updateSenaOrderChild,
    workspaceSummary,
    ...overrides,
  };
}

const workspaceSummary = {
  highRiskSkuIds: ['sku-1'],
  skuSummaries: [
    {
      skuId: 'sku-1',
      latestPosteriorUnits: 12,
      credibleIntervalLow: 10,
      credibleIntervalHigh: 14,
      demandPerDayMean: 2,
      stockoutRisk: 0.4,
      daysOfCover: 6,
      expectedLeadTimeDemand: 10,
      safetyStock: 3,
      reorderPoint: 13,
      reorderTriggerProbability: 0.8,
      reorderQuantity: {
        recommendedUnits: 8,
        ungatedRecommendedUnits: 8,
        likelyRangeLow: 6,
        likelyRangeHigh: 10,
        needProbability: 0.9,
        recommendationIssued: true,
        recommendationQuantile: 0.8,
        intervalLowQuantile: 0.2,
        intervalHighQuantile: 0.9,
        needProbabilityGate: 0.5,
        reviewDelayDays: 2,
      },
      leadTimeMeanDays: 6,
      leadTimeStdDays: 1,
      regimeProbabilities: {},
    },
  ],
};

function renderRoute(nextObservations = observations, initialPath = RECORD_UPDATE_STOCK_COUNT_PATH) {
  inventoryHook.mockReturnValue(inventoryState({ observations: nextObservations }));

  return render(
    <MemoryRouter initialEntries={[initialPath]}>
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

function renderRouteWithCatalog(
  nextCatalog: typeof catalog,
  nextObservations = observations,
  initialPath = RECORD_UPDATE_STOCK_COUNT_PATH,
) {
  inventoryHook.mockReturnValue(inventoryState({ catalog: nextCatalog, observations: nextObservations }));

  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <StockUpdateSessionRoute />
    </MemoryRouter>,
  );
}

function renderRoutedSession(nextObservations = observations) {
  inventoryHook.mockReturnValue(inventoryState({ observations: nextObservations }));

  return render(
    <MemoryRouter initialEntries={[RECORD_UPDATE_STOCK_COUNT_PATH]}>
      <Routes>
        <Route
          element={
            <>
              <Link to="/catalog">Catalog</Link>
              <StockUpdateSessionRoute />
            </>
          }
          path={RECORD_UPDATE_STOCK_COUNT_PATH}
        />
        <Route element={<div>Overview destination</div>} path="/" />
        <Route element={<div>Catalog destination</div>} path="/catalog" />
      </Routes>
    </MemoryRouter>,
  );
}

function renderEditRoute(
  observation = observations[0]!,
  nextObservations = observations,
  pathname = RECORD_UPDATE_STOCK_COUNT_PATH,
) {
  inventoryHook.mockReturnValue(inventoryState({ observations: nextObservations }));

  return render(
    <MemoryRouter
      initialEntries={[
        {
          pathname,
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

function renderRouteWithInlineEditLink(
  observation = observations[0]!,
  nextObservations = observations,
  pathname = RECORD_UPDATE_STOCK_COUNT_PATH,
) {
  inventoryHook.mockReturnValue(inventoryState({ observations: nextObservations }));

  return render(
    <MemoryRouter initialEntries={[pathname]}>
      <Routes>
        <Route
          element={
            <>
              <Link
                state={{
                  editSession: createRecordUpdateEditSession(observation),
                }}
                to={pathname}
              >
                Edit saved report
              </Link>
              <StockUpdateSessionRoute />
            </>
          }
          path={pathname}
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

function chooseOptionalStepNo(times = 1) {
  for (let index = 0; index < times; index += 1) {
    fireEvent.click(screen.getByRole('button', { name: 'No' }));
  }
}

function chooseOptionalStepYes() {
  fireEvent.click(screen.getByRole('button', { name: 'Yes' }));
}

function goToStockStep() {
  goNext(2);
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
    preferenceState.showHeartbeatRibbons = true;
    preferenceState.showFloatingTitleActions = false;
    installMemoryLocalStorage();
    createSenaOrderBatch.mockResolvedValue({ batchOrderId: 'orders/2026/04/12/120000/test/child' });
    ingestSenaObservation.mockResolvedValue({ observationId: 'obs-new' });
    updateSenaObservation.mockResolvedValue({ observationId: 'obs-1' });
    updateSenaOrderBatch.mockResolvedValue({ batchOrderId: 'orders/2026/04/12/120000/test/child' });
    updateSenaOrderChild.mockResolvedValue({ batchOrderId: 'orders/2026/04/12/120000/test/child' });
    triggerSenaRun.mockResolvedValue({ runId: 'run-1' });
    runWorkspacePreparation.mockImplementation(async (task: () => Promise<unknown>) => task());
  });

  afterEach(() => {
    cleanup();
    window.localStorage.clear();
    vi.clearAllMocks();
  });

  it('shows the 8-step stock-count wizard, preserves state, and keeps future steps locked', () => {
    renderRoute();

    expect(screen.getAllByRole('button', { name: /Observed at/i })[0]).toHaveAttribute('aria-current', 'step');
    expect(screen.getByRole('progressbar', { name: 'Wizard progress' })).toHaveAttribute('aria-valuenow', '13');
    expect(screen.queryByRole('button', { name: /Add service updates/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Rank recent selling order/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/% unlocked/i)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Review update/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Discard changes' })).toBeDisabled();

    goNext();
    expect(screen.getAllByRole('button', { name: /Report notes/i })[0]).toHaveAttribute('aria-current', 'step');
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Busy Friday shift' } });
    goNext();
    expect(screen.getByRole('button', { name: /Count SKU stock/i })).toHaveAttribute('aria-current', 'step');
    goNext();
    chooseOptionalStepNo(3);

    expect(screen.getByRole('button', { name: /Record update details/i })).toHaveAttribute('aria-current', 'step');
    expect(screen.getByRole('progressbar', { name: 'Wizard progress' })).toHaveAttribute('aria-valuenow', '88');

    fireEvent.click(screen.getAllByRole('button', { name: /Report notes/i })[0]!);
    expect(screen.getByRole('textbox')).toHaveValue('Busy Friday shift');
    goNext();
  }, 20_000);

  it('hides the summary ribbon when heartbeat ribbons are disabled', () => {
    preferenceState.showHeartbeatRibbons = false;

    renderRoute();

    expect(screen.getAllByRole('button', { name: /Observed at/i })[0]).toHaveAttribute('aria-current', 'step');
    expect(screen.queryByText('Last confirmed update')).not.toBeInTheDocument();
    expect(screen.queryByText('Untouched SKUs stay unchanged')).not.toBeInTheDocument();
  });

  it('blocks the first observation until at least one SKU stock row changes', () => {
    renderRoute([]);

    goToStockStep();
    expect(screen.getByRole('button', { name: /Count SKU stock/i })).toHaveAttribute('aria-current', 'step');
    expect(
      screen.getByText('Count at least one SKU before continuing so Banji can anchor the first update.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();

    fireEvent.change(screen.getAllByLabelText('Current Units')[0]!, { target: { value: '7' } });
    expect(screen.getByRole('button', { name: 'Next' })).toBeEnabled();
  });

  it('shows the stock-row reorder hint and restores the saved sku order', () => {
    window.localStorage.setItem(STOCK_ROW_ORDER_STORAGE_KEY, JSON.stringify(['sku-2', 'sku-1']));

    renderRoute();

    goToStockStep();
    expect(
      screen.getByText(
        'Tip: hover a SKU row and drag anywhere outside the input area to keep your preferred order for future stock counts.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reorder Towel' })).toBeInTheDocument();
    expect(screen.queryByText(/SKU rows included in this update/i)).not.toBeInTheDocument();
    expect(screen.getByTestId('stock-count-list').closest('[data-slot="card"]')).toHaveStyle({
      background: 'white',
    });

    const rowNames = within(screen.getByTestId('stock-count-list'))
      .getAllByText(/Razor refill|Towel/)
      .map((element) => element.textContent);
    expect(rowNames).toEqual(['Towel', 'Razor refill']);
  });

  it('uses the stock-count wizard shell for record orders and submits reorder details', async () => {
    renderRoute(observations, RECORD_UPDATE_RECORD_ORDER_PATH);

    expect(screen.queryByRole('button', { name: /Add service updates/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Rank recent selling order/i })).not.toBeInTheDocument();

    goNext(2);

    expect(screen.getByRole('button', { name: /Reorder table/i })).toHaveAttribute('aria-current', 'step');
    expect(screen.getByRole('columnheader', { name: 'Last order' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Current order' })).toBeInTheDocument();
    expect(screen.getByLabelText('Current order for Razor refill')).toHaveAttribute('placeholder', 'Banji recommends 8 units.');
    expect(screen.getByLabelText('Lead time mean')).toHaveAttribute('placeholder', '6');
    expect(screen.queryByText('Banji recommends 8 units.')).not.toBeInTheDocument();
    const variabilitySelect = screen.getByRole('combobox', { name: 'Lead time variability' });
    fireEvent.click(variabilitySelect);
    expect(screen.getByRole('option', { name: /Very tight/i })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('option', { name: /^Tight\b/i }));
    expect(variabilitySelect).toHaveTextContent(/Tight/i);

    fireEvent.change(screen.getByLabelText('Current order for Razor refill'), { target: { value: '9' } });
    const expectedArrivalInput = screen.getByLabelText('Expected date of arrival');
    const initialExpectedArrival = (expectedArrivalInput as HTMLInputElement).value;
    fireEvent.change(screen.getByLabelText('Lead time mean'), { target: { value: '7' } });
    await waitFor(() => expect(expectedArrivalInput).not.toHaveValue(initialExpectedArrival));
    fireEvent.change(expectedArrivalInput, { target: { value: '2026-04-18' } });

    goNext();
    chooseOptionalStepNo();
    goNext();

    expect(screen.getByRole('button', { name: /Review update/i })).toHaveAttribute('aria-current', 'step');
    fireEvent.click(screen.getByRole('button', { name: 'Save update' }));

    await waitFor(() => expect(ingestSenaObservation).toHaveBeenCalledTimes(1));
    expect(ingestSenaObservation).toHaveBeenCalledWith(
      expect.objectContaining({
        orderSignals: [
          expect.objectContaining({
            approximateOrderQuantity: 9,
            leadTimeDaysHint: 7,
            orderPlaced: true,
            receiptArrived: false,
            receiptTimestamp: expect.any(String),
            skuId: 'sku-1',
          }),
        ],
        leadTimeHints: [
          expect.objectContaining({
            skuId: 'sku-1',
            typicalDays: 7,
            variabilityClass: 'tight',
          }),
        ],
      }),
    );
  });

  it('stays on an optional stock step when changing an existing Yes choice to No', () => {
    renderRoute();

    goToStockStep();
    goNext();
    expect(screen.getAllByRole('button', { name: /Cost if changed/i })[0]).toHaveAttribute('aria-current', 'step');

    chooseOptionalStepYes();
    expect(screen.getByText('Tip: hover a SKU row and drag anywhere outside the input area to keep your preferred order for future stock counts.')).toBeInTheDocument();

    chooseOptionalStepNo();

    expect(screen.getAllByRole('button', { name: /Cost if changed/i })[0]).toHaveAttribute('aria-current', 'step');
    expect(screen.getByRole('button', { name: /Retail price if changed/i })).not.toHaveAttribute('aria-current');
    expect(screen.queryByText('Tip: hover a SKU row and drag anywhere outside the input area to keep your preferred order for future stock counts.')).not.toBeInTheDocument();
  });

  it('defaults observed at to the current local system date and time', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-09T16:44:00+07:00'));

    try {
      renderRoute();

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

  it('reveals the event column for SKU rows and saves stockout events', async () => {
    renderRoute();

    expect(screen.queryByRole('button', { name: 'Cell boundaries' })).not.toBeInTheDocument();

    goToStockStep();
    goNext();
    chooseOptionalStepNo(2);
    chooseOptionalStepYes();

    expect(screen.getByText(/No event leaves the time period unchanged/i)).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Event' })).toBeInTheDocument();
    expect(screen.queryByRole('columnheader', { name: 'Add flags' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Add flags for Razor refill/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Remove/i })).not.toBeInTheDocument();

    const razorEventSelect = screen.getByRole('combobox', { name: 'Event for Razor refill' });
    expect(razorEventSelect).toHaveTextContent('No event for this interval');

    fireEvent.click(razorEventSelect);
    fireEvent.click(screen.getByRole('option', { name: 'Stockout event' }));

    goNext(2);

    expect(screen.getByRole('button', { name: /Review update/i })).toHaveAttribute('aria-current', 'step');
    fireEvent.click(screen.getByRole('button', { name: 'Save update' }));

    await waitFor(() => expect(ingestSenaObservation).toHaveBeenCalledTimes(1));
    expect(ingestSenaObservation).toHaveBeenCalledWith(
      expect.objectContaining({
        stockSnapshot: [],
        orderSignals: [],
        retailStockouts: ['sku-1'],
      }),
    );
  }, 10_000);

  it('uses the stock-count wizard shell for record receipts and submits receipt details', async () => {
    renderRoute(observations, RECORD_UPDATE_RECORD_RECEIPT_PATH);

    expect(screen.queryByRole('button', { name: /Add service updates/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Rank recent selling order/i })).not.toBeInTheDocument();

    goNext(2);

    expect(screen.getByRole('button', { name: /Record receipt/i })).toHaveAttribute('aria-current', 'step');
    expect(screen.getByRole('columnheader', { name: 'Last receipt' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Current receipt' })).toBeInTheDocument();
    expect(screen.getAllByText('No prior receipt')).toHaveLength(2);
    expect(screen.getByTestId('record-receipt-list')).toHaveTextContent('Razor refill');
    expect(screen.getByTestId('record-receipt-list')).toHaveTextContent('Towel');

    const receiptInput = screen.getByLabelText('Current receipt for Razor refill');
    expect(receiptInput).not.toHaveAttribute('placeholder');
    fireEvent.change(screen.getByLabelText('Received date'), { target: { value: '2026-04-11' } });
    fireEvent.change(receiptInput, { target: { value: '6' } });

    goNext();
    chooseOptionalStepNo();
    goNext();

    expect(screen.getByRole('button', { name: /Review update/i })).toHaveAttribute('aria-current', 'step');
    fireEvent.click(screen.getByRole('button', { name: 'Save update' }));

    await waitFor(() => expect(ingestSenaObservation).toHaveBeenCalledTimes(1));
    expect(ingestSenaObservation).toHaveBeenCalledWith(
      expect.objectContaining({
        orderSignals: [
          expect.objectContaining({
            approximateOrderQuantity: null,
            approximateReceiptQuantity: 6,
            orderPlaced: false,
            receiptArrived: true,
            receiptTimestamp: expect.any(String),
            skuId: 'sku-1',
          }),
        ],
      }),
    );
  });

  it('shows a helper in the stock step when the catalog has no skus', async () => {
    renderRouteWithCatalog({
      ...catalog,
      skus: [],
      services: [],
      sharingMask: [],
    });

    goToStockStep();
    expect(
      screen.getByText(
        'No SKUs are in the catalog yet. Skip this section, or add a SKU first if you need to record stock updates.',
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText('SKU / latest update')).not.toBeInTheDocument();
    expect(screen.queryByText('Current Units')).not.toBeInTheDocument();
  });

  it('submits only changed stock rows and still triggers the SENA run', async () => {
    renderRoute();

    goToStockStep();
    fireEvent.change(screen.getAllByLabelText('Current Units')[0]!, { target: { value: '7' } });
    window.localStorage.setItem(STOCK_UPDATE_DRAFT_STORAGE_KEY, 'stale draft');

    goNext();
    chooseOptionalStepNo(3);
    goNext();

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
        stockSnapshot: [],
        retailSalesSnapshot: [{ skuId: 'sku-1', unitsSold: 4 }],
        serviceSalesSnapshot: [{ serviceId: 'service-1', unitsSold: 2 }],
        regimeHint: 'promo' as const,
      },
    };

    renderEditRoute(editableObservation, observations, RECORD_UPDATE_SALES_UPDATE_PATH);

    fireEvent.change(screen.getByLabelText('Current interval sales for Razor refill'), { target: { value: '9' } });

    goNext();
    expect(screen.getByLabelText('Current interval sales for Haircut')).toHaveValue(2);
    fireEvent.change(screen.getByLabelText('Current interval sales for Haircut'), { target: { value: '5' } });

    goNext(2);
    fireEvent.click(screen.getAllByRole('button', { name: /Report notes/i })[0]!);
    expect(screen.getByDisplayValue('Saved note')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Record update details/i }));

    goNext();
    fireEvent.click(screen.getByRole('button', { name: 'Save update' }));

    await waitFor(() => expect(updateSenaObservation).toHaveBeenCalledTimes(1));
    expect(updateSenaObservation).toHaveBeenCalledWith({
      observationId: 'obs-1',
      input: expect.objectContaining({
        notes: 'Saved note',
        regimeHint: 'promo',
        retailSalesSnapshot: [{ skuId: 'sku-1', unitsSold: 9 }],
        serviceSalesSnapshot: [{ serviceId: 'service-1', unitsSold: 5 }],
        retailRankings: ['sku-1'],
        serviceRankings: ['service-1'],
      }),
    });
    expect(updateSenaObservation.mock.calls[0]![0].input.stockSnapshot).toEqual([]);
    expect(ingestSenaObservation).not.toHaveBeenCalled();
  }, 10_000);

  it('filters service sales step by linked sku supplier', async () => {
    renderRoute(observations, RECORD_UPDATE_SALES_UPDATE_PATH);

    goNext(2);
    chooseOptionalStepYes();
    goNext();
    chooseOptionalStepYes();

    fireEvent.click(screen.getByRole('combobox', { name: 'Filter by supplier' }));
    fireEvent.click(screen.getByRole('option', { name: 'Mekong Looms' }));

    expect(screen.getByLabelText('Current interval sales for Haircut')).toBeInTheDocument();
    expect(screen.queryByLabelText('Current interval sales for Towel wrap')).not.toBeInTheDocument();
  });

  it('resets the session immediately after saving and starts the rerun in the background', async () => {
    const rerun = deferredPromise<void>();
    triggerSenaRun.mockReturnValueOnce(rerun.promise);
    runWorkspacePreparation.mockImplementationOnce(async (task: () => Promise<unknown>) => task());

    renderRoutedSession();

    goToStockStep();
    fireEvent.change(screen.getAllByLabelText('Current Units')[0]!, { target: { value: '7' } });
    goNext();
    chooseOptionalStepNo(3);
    goNext();
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

    fireEvent.change(screen.getAllByLabelText('Current Units')[0]!, { target: { value: '9' } });

    goNext();
    chooseOptionalStepNo(3);
    goNext();
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

    inventoryHook.mockReturnValue(inventoryState({ catalog: archivedCatalog }));

    render(
      <MemoryRouter
        initialEntries={[
          {
            pathname: RECORD_UPDATE_STOCK_COUNT_PATH,
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

    goNext();
    chooseOptionalStepNo(3);
    goNext();
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

    goNext();
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Draft note' } });
    goNext();
    goNext();
    chooseOptionalStepNo(2);
    chooseOptionalStepYes();

    fireEvent.click(screen.getByRole('combobox', { name: 'Event for Razor refill' }));
    fireEvent.click(screen.getByRole('option', { name: 'Blocked event' }));

    unmount();

    expect(JSON.parse(window.localStorage.getItem(STOCK_UPDATE_DRAFT_STORAGE_KEY) ?? '{}')).toEqual(
      expect.objectContaining({
        currentStepId: 'stock-flags',
        notes: 'Draft note',
        skuSignalDrafts: expect.objectContaining({
          'sku-1': expect.objectContaining({
            blockedEnabled: true,
            blockedState: 'blocked',
          }),
        }),
      }),
    );

    renderRoute();

    await waitFor(() =>
      expect(screen.getByRole('button', { name: /Add flags/i })).toHaveAttribute(
        'aria-current',
        'step',
      ),
    );
    expect(screen.getByText('Draft resumed')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Discard changes' })).toBeEnabled();

    fireEvent.click(screen.getAllByRole('button', { name: /Report notes/i })[0]!);
    expect(screen.getByDisplayValue('Draft note')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Add flags/i }));
    expect(screen.getByRole('combobox', { name: 'Event for Razor refill' })).toHaveTextContent('Blocked event');
  }, 10_000);

  it('uses a separate draft key for the sales-update lane', () => {
    const { unmount } = renderRoute(observations, RECORD_UPDATE_SALES_UPDATE_PATH);

    goNext(2);
    chooseOptionalStepYes();
    fireEvent.change(screen.getByLabelText('Current interval sales for Razor refill'), { target: { value: '3' } });

    unmount();

    expect(window.localStorage.getItem(SALES_UPDATE_DRAFT_STORAGE_KEY)).not.toBeNull();
    expect(window.localStorage.getItem(STOCK_UPDATE_DRAFT_STORAGE_KEY)).toBeNull();
  });

  it('asks before replacing a live in-memory draft with an edit session', async () => {
    renderRouteWithInlineEditLink();

    goToStockStep();
    fireEvent.change(screen.getAllByLabelText('Current Units')[0]!, { target: { value: '7' } });
    fireEvent.click(screen.getByRole('link', { name: 'Edit saved report' }));

    expect(screen.getByRole('dialog')).toHaveTextContent('Replace saved draft?');
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(screen.getAllByLabelText('Current Units')[0]).toHaveValue(7);
  });

  it('asks before discarding changes and resets only after confirmation', async () => {
    renderRoute();

    goToStockStep();
    fireEvent.change(screen.getAllByLabelText('Current Units')[0]!, { target: { value: '7' } });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Discard changes' })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: 'Discard changes' }));

    await waitFor(() => expect(screen.getByRole('dialog')).toHaveTextContent('Discard changes?'));
    fireEvent.click(screen.getByRole('button', { name: 'Keep editing' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getAllByLabelText('Current Units')[0]).toHaveValue(7);

    fireEvent.click(screen.getByRole('button', { name: 'Discard changes' }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Discard changes' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(screen.getAllByRole('button', { name: /Observed at/i })[0]).toHaveAttribute('aria-current', 'step');
    goToStockStep();
    expect(screen.getAllByLabelText('Current Units')[0]).toHaveValue(null);
    expect(screen.getAllByLabelText('Current Units')[0]).toHaveAttribute('placeholder', '12');
    expect(screen.getByRole('button', { name: 'Discard changes' })).toBeDisabled();
    expect(window.localStorage.getItem(STOCK_UPDATE_DRAFT_STORAGE_KEY)).toBeNull();
  });

  it('saves the draft before navigating away from a record update session', async () => {
    renderRoutedSession();

    goToStockStep();
    fireEvent.change(screen.getAllByLabelText('Current Units')[0]!, { target: { value: '7' } });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Discard changes' })).toBeEnabled());
    fireEvent.click(screen.getByRole('link', { name: 'Catalog' }));

    await waitFor(() => expect(screen.getByRole('dialog')).toHaveTextContent('Leave record update?'));
    fireEvent.click(screen.getByRole('button', { name: 'Keep editing' }));
    expect(screen.queryByText('Catalog destination')).not.toBeInTheDocument();
    expect(screen.getAllByLabelText('Current Units')[0]).toHaveValue(7);

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

    expect(screen.getAllByRole('button', { name: /Observed at/i })[0]).toHaveAttribute('aria-current', 'step');
    expect(window.localStorage.getItem(STOCK_UPDATE_DRAFT_STORAGE_KEY)).toBeNull();
  });
});
