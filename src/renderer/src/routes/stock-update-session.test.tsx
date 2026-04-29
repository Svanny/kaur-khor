import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Link, MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRecordUpdateEditSession } from '@/lib/observation-edit-session';
import {
  RECORD_UPDATE_CUSTOMER_PENDING_PATH,
  RECORD_UPDATE_HUB_PATH,
  RECORD_UPDATE_CUSTOMER_COMPLETED_PATH,
  RECORD_UPDATE_CUSTOM_PATH,
  RECORD_UPDATE_STOCK_COUNT_PATH,
  RECORD_UPDATE_SUPPLIER_PENDING_PATH,
} from '@/lib/record-update-routes';
import { writeRecordUpdateSessionViewMode } from '@/lib/record-update-session-view';
import { buildDeliveryFeeMetadata } from '@/lib/ticketing';
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
const saveDesktopPreferences = vi.fn();
const preferenceState = {
  currency: 'USD' as const,
  language: 'en' as const,
  itemImageMode: 'small' as const,
  usdToKhrExchangeRate: 4000,
  showHeartbeatRibbons: true,
  showFloatingTitleActions: false,
  workbenchTileOrderByLane: {} as Record<string, string[]>,
};
const STOCK_UPDATE_DRAFT_STORAGE_KEY = 'banji:record-update:draft:stock-count:v1';
const CUSTOMER_PENDING_DRAFT_STORAGE_KEY = 'banji:record-update:draft:customer-order-pending:v1';
const CUSTOM_DRAFT_STORAGE_KEY = 'banji:record-update:draft:custom:v1';
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
    savePreferences: saveDesktopPreferences,
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
      imagePath: '/tmp/razor-refill.png',
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
      imagePath: '/tmp/towel.png',
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
      imagePath: '/tmp/haircut.png',
      bundle: false,
    },
    {
      serviceId: 'service-2',
      name: 'Towel wrap',
      description: '',
      price: 8,
      imagePath: '/tmp/towel-wrap.png',
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

function visibleWorkbenchTileTitles() {
  const workbench = screen.getByText('Main workbench').closest('section');
  if (!workbench) {
    return [];
  }

  return within(workbench)
    .getAllByRole('button')
    .map((button) => button.textContent?.replace(/\s+/g, ' ').trim() ?? '')
    .filter((label) => ['Razor refill', 'Towel', 'Haircut', 'Towel wrap'].some((name) => label.includes(name)))
    .map((label) => {
      if (label.includes('Razor refill')) {
        return 'Razor refill';
      }
      if (label.includes('Towel wrap')) {
        return 'Towel wrap';
      }
      if (label.includes('Haircut')) {
        return 'Haircut';
      }
      return 'Towel';
    });
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

function renderRoutedSession(nextObservations = observations, initialPath = RECORD_UPDATE_STOCK_COUNT_PATH) {
  inventoryHook.mockReturnValue(inventoryState({ observations: nextObservations }));
  const routePath = initialPath.split('?')[0] ?? initialPath;

  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route
          element={
            <>
              <Link to="/catalog">Catalog</Link>
              <StockUpdateSessionRoute />
            </>
          }
          path={routePath}
        />
        <Route element={<div>Overview destination</div>} path="/" />
        <Route element={<div>Catalog destination</div>} path="/catalog" />
        <Route element={<div>Help destination</div>} path="/settings/help" />
      </Routes>
    </MemoryRouter>,
  );
}

function renderRouteWithHub(nextObservations = observations, initialPath = RECORD_UPDATE_STOCK_COUNT_PATH) {
  inventoryHook.mockReturnValue(inventoryState({ observations: nextObservations }));

  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route element={<StockUpdateSessionRoute />} path={`${RECORD_UPDATE_HUB_PATH}/*`} />
        <Route element={<div>Record update hub destination</div>} path={RECORD_UPDATE_HUB_PATH} />
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
    const formViewButton = screen.queryByRole('button', { name: 'Form View' });
    if (formViewButton && formViewButton.getAttribute('aria-pressed') !== 'true') {
      fireEvent.click(formViewButton);
    }
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
  }
}

function chooseOptionalStepNo(times = 1) {
  for (let index = 0; index < times; index += 1) {
    const formViewButton = screen.queryByRole('button', { name: 'Form View' });
    if (formViewButton && formViewButton.getAttribute('aria-pressed') !== 'true') {
      fireEvent.click(formViewButton);
    }
    fireEvent.click(screen.getByRole('button', { name: 'No' }));
  }
}

function chooseOptionalStepYes() {
  const formViewButton = screen.queryByRole('button', { name: 'Form View' });
  if (formViewButton && formViewButton.getAttribute('aria-pressed') !== 'true') {
    fireEvent.click(formViewButton);
  }
  fireEvent.click(screen.getByRole('button', { name: 'Yes' }));
}

function setStoredSessionViewMode(mode: 'pos' | 'form') {
  writeRecordUpdateSessionViewMode(mode);
}

function goToStockStep() {
  goNext(2);
}

function openPosMetadataPopup(name: string | RegExp) {
  if (findPosMetadataDialog()) {
    closePosMetadataPopup();
  }
  fireEvent.click(screen.getByRole('button', { name }));
}

function findPosMetadataDialog() {
  return screen
    .queryAllByRole('dialog')
    .find((dialog) => within(dialog).queryByRole('button', { name: 'Close' }) != null) ?? null;
}

function posMetadataDialog() {
  const dialog = findPosMetadataDialog();
  if (!dialog) {
    throw new Error('POS metadata dialog is not open');
  }
  return dialog;
}

function closePosMetadataPopup() {
  fireEvent.click(within(posMetadataDialog()).getByRole('button', { name: 'Close' }));
}

function posWorkbenchTileNames() {
  return screen
    .getAllByRole('button')
    .filter((button) => !button.getAttribute('aria-label') && /Razor refill|Haircut|Towel wrap/.test(button.textContent ?? ''))
    .map((button) => {
      if ((button.textContent ?? '').includes('Razor refill')) {
        return 'Razor refill';
      }
      if ((button.textContent ?? '').includes('Haircut')) {
        return 'Haircut';
      }
      return 'Towel wrap';
    });
}

function getPosWorkbenchTile(name: string) {
  const tile = screen
    .getAllByRole('button')
    .find((button) => button.textContent?.includes(name) && !button.getAttribute('aria-label'));
  if (!tile) {
    throw new Error(`POS workbench tile not found: ${name}`);
  }
  return tile;
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
    preferenceState.itemImageMode = 'small';
    preferenceState.usdToKhrExchangeRate = 4000;
    preferenceState.showHeartbeatRibbons = true;
    preferenceState.showFloatingTitleActions = false;
    preferenceState.workbenchTileOrderByLane = {};
    saveDesktopPreferences.mockImplementation(async (payload?: { workbenchTileOrderByLane?: Record<string, string[]> }) => ({
      ...(payload?.workbenchTileOrderByLane
        ? { workbenchTileOrderByLane: (preferenceState.workbenchTileOrderByLane = payload.workbenchTileOrderByLane) }
        : {}),
      ...preferenceState,
    }));
    setStoredSessionViewMode('pos');
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
    setStoredSessionViewMode('form');
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

    expect(screen.getByRole('button', { name: /Capture details/i })).toHaveAttribute('aria-current', 'step');
    expect(screen.getByRole('progressbar', { name: 'Wizard progress' })).toHaveAttribute('aria-valuenow', '88');

    fireEvent.click(screen.getAllByRole('button', { name: /Report notes/i })[0]);
    expect(screen.getByRole('textbox')).toHaveValue('Busy Friday shift');
    goNext();
  }, 20_000);

  it('hides the summary ribbon when heartbeat ribbons are disabled', () => {
    preferenceState.showHeartbeatRibbons = false;
    setStoredSessionViewMode('form');

    renderRoute();

    expect(screen.getAllByRole('button', { name: /Observed at/i })[0]).toHaveAttribute('aria-current', 'step');
    expect(screen.queryByText('Last confirmed update')).not.toBeInTheDocument();
    expect(screen.queryByText('Untouched SKUs stay unchanged')).not.toBeInTheDocument();
  });

  it('lets stock-count follow the stored session view mode while custom stays in form', () => {
    renderRoute();

    expect(screen.getByText('Changed items')).toBeInTheDocument();
    expect(screen.queryByText('Receipt')).not.toBeInTheDocument();

    cleanup();
    renderRoute(observations, `${RECORD_UPDATE_CUSTOM_PATH}?lanes=stock-count,supplier-order-pending`);

    expect(screen.queryByRole('button', { name: 'Point of Sale View' })).not.toBeInTheDocument();
    expect(screen.queryByText('Receipt')).not.toBeInTheDocument();

    cleanup();
    setStoredSessionViewMode('pos');
    renderRoute(observations, `${RECORD_UPDATE_CUSTOMER_PENDING_PATH}?ticketMode=new`);

    expect(screen.queryByRole('button', { name: 'Point of Sale View' })).not.toBeInTheDocument();
    expect(screen.getAllByText('Receipt').length).toBeGreaterThan(0);

    cleanup();
    setStoredSessionViewMode('form');
    renderRoute(observations, `${RECORD_UPDATE_CUSTOMER_PENDING_PATH}?ticketMode=new`);

    expect(screen.queryByText('Receipt')).not.toBeInTheDocument();
  });

  it('renders the POS receipt as a normal stacked card instead of a right rail landmark', () => {
    setStoredSessionViewMode('pos');

    renderRoute(observations, `${RECORD_UPDATE_CUSTOMER_PENDING_PATH}?ticketMode=new`);

    expect(screen.queryByRole('complementary')).not.toBeInTheDocument();

    const workbenchTitle = screen.getByText('Main workbench');
    const receiptTitle = screen.getAllByText('Receipt')[0]!;

    expect(workbenchTitle.compareDocumentPosition(receiptTitle) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('renders POS workbench item cards as square tiles', () => {
    setStoredSessionViewMode('pos');

    renderRoute(observations, `${RECORD_UPDATE_CUSTOMER_PENDING_PATH}?ticketMode=new`);

    const razorTile = getPosWorkbenchTile('Razor refill');

    expect(razorTile).toHaveClass('w-full');
    expect(razorTile).toHaveClass('aspect-square');
  });

  it('anchors the POS quantity pill to the outer item card corner', async () => {
    setStoredSessionViewMode('pos');

    renderRoute(observations, `${RECORD_UPDATE_CUSTOMER_PENDING_PATH}?ticketMode=new`);

    fireEvent.click(getPosWorkbenchTile('Razor refill'));
    fireEvent.click(within(screen.getByRole('dialog', { name: 'Razor refill' })).getByRole('button', { name: 'Add line' }));

    await waitFor(() => expect(screen.getByRole('button', { name: 'Edit Razor refill receipt line' })).toBeInTheDocument());

    const razorTile = getPosWorkbenchTile('Razor refill');
    const tileVisual = razorTile.querySelector('[data-slot="workbench-tile-visual"]');
    const quantityPill = razorTile.querySelector('[data-slot="workbench-quantity-pill"]');
    const tileInner = quantityPill?.parentElement;

    expect(tileVisual).toBeInTheDocument();
    expect(tileInner).toBeInTheDocument();
    expect(tileInner?.parentElement).toBe(tileVisual);
    expect(quantityPill).toHaveClass('right-2');
    expect(quantityPill).toHaveClass('top-2');
    expect(quantityPill).toHaveClass('translate-x-[28%]');
    expect(quantityPill).toHaveClass('-translate-y-[28%]');
    expect(razorTile).toHaveClass('overflow-visible');
    expect(quantityPill?.firstElementChild).toHaveClass('border-foreground/45');
    expect(tileVisual).toHaveClass('overflow-visible');
  });

  it('renders stock-count POS as a SKU-only workbench with a stock editor popup', () => {
    renderRoute();

    expect(screen.getByText('Changed items')).toBeInTheDocument();
    expect(screen.queryByText('Receipt')).not.toBeInTheDocument();
    expect(screen.getByText('Razor refill')).toBeInTheDocument();
    expect(screen.getByText('Towel')).toBeInTheDocument();
    expect(screen.queryByText('Haircut')).not.toBeInTheDocument();
    expect(screen.queryByText('Towel wrap')).not.toBeInTheDocument();
    expect(screen.queryByRole('radio', { name: 'SKUs' })).not.toBeInTheDocument();

    fireEvent.click(getPosWorkbenchTile('Razor refill'));

    const dialog = screen.getByRole('dialog', { name: 'Razor refill' });
    expect(within(dialog).getByLabelText('Units in stock')).toHaveValue('12');
    expect(within(dialog).getByLabelText('Cost per unit')).toHaveValue('4');
    expect(within(dialog).getByLabelText('Retail price')).toHaveValue('9');
    expect(within(dialog).getByRole('combobox', { name: 'Flags' })).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('combobox', { name: 'Flags' }));
    expect(screen.getByRole('listbox')).toHaveClass('z-[110]');
  });

  it('enables jiggle reorder mode on the stock-count POS workbench', () => {
    vi.useFakeTimers();

    try {
      renderRoute();

      expect(
        screen.getByText('Tap a tile to update this SKU. Drag a card to rearrange this bucket.'),
      ).toBeInTheDocument();

      fireEvent.pointerDown(getPosWorkbenchTile('Razor refill'));
      act(() => {
        vi.advanceTimersByTime(350);
      });
      fireEvent.pointerUp(getPosWorkbenchTile('Razor refill'));

      expect(screen.getByRole('button', { name: 'Done' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Save ordering first' })).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it('persists stock-count POS workbench order from desktop preferences', () => {
    preferenceState.workbenchTileOrderByLane = {
      'stock-count': ['stock:sku-2', 'stock:sku-1'],
    };

    renderRoute();

    expect(visibleWorkbenchTileTitles()).toEqual(['Towel', 'Razor refill']);
  });

  it('locks stock-count POS interactions behind the save-ordering prompt during reorder mode', () => {
    vi.useFakeTimers();

    try {
      renderRoute();

      fireEvent.pointerDown(getPosWorkbenchTile('Razor refill'));
      act(() => {
        vi.advanceTimersByTime(350);
      });
      fireEvent.pointerUp(getPosWorkbenchTile('Razor refill'));

      expect(screen.getByRole('button', { name: 'Done' })).toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: 'Save ordering first' }));

      expect(screen.getByText('Save ordering first?')).toBeInTheDocument();
      expect(
        screen.getByText('Finish and save this card ordering before doing anything else in POS view.'),
      ).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it('shows only changed stock-count fields in the POS summary and reopens the popup from the changed row', async () => {
    renderRoute();

    fireEvent.click(getPosWorkbenchTile('Razor refill'));

    const dialog = screen.getByRole('dialog', { name: 'Razor refill' });
    fireEvent.change(within(dialog).getByLabelText('Units in stock'), { target: { value: '15' } });
    fireEvent.change(within(dialog).getByLabelText('Cost per unit'), { target: { value: '6' } });
    fireEvent.click(within(dialog).getByRole('combobox', { name: 'Flags' }));
    fireEvent.click(screen.getByRole('option', { name: 'Stockout' }));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Done' }));

    expect(screen.getByRole('button', { name: 'Edit Razor refill changed item' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Edit Towel changed item' })).not.toBeInTheDocument();
    expect(screen.getByText('12 → 15')).toBeInTheDocument();
    expect(screen.getByText('$4.00 → $6.00')).toBeInTheDocument();
    expect(screen.getByText('Stockout')).toBeInTheDocument();
    expect(screen.queryByText('Retail')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Edit Razor refill changed item' }));
    await screen.findByRole('dialog', { name: 'Razor refill' });
  });

  it('uses a stock-count review dialog without clipboard actions and saves the shared stock payload', async () => {
    renderRoute();

    fireEvent.click(getPosWorkbenchTile('Razor refill'));
    const razorDialog = screen.getByRole('dialog', { name: 'Razor refill' });
    fireEvent.change(within(razorDialog).getByLabelText('Units in stock'), { target: { value: '15' } });
    fireEvent.click(within(razorDialog).getByRole('button', { name: 'Done' }));

    fireEvent.click(getPosWorkbenchTile('Towel'));
    const towelDialog = screen.getByRole('dialog', { name: 'Towel' });
    expect(within(towelDialog).queryByLabelText('Retail price')).not.toBeInTheDocument();
    fireEvent.click(within(towelDialog).getByRole('combobox', { name: 'Flags' }));
    fireEvent.click(screen.getByRole('option', { name: 'Blocked' }));
    fireEvent.click(within(towelDialog).getByRole('button', { name: 'Done' }));

    fireEvent.click(screen.getByRole('button', { name: 'Review update' }));

    const reviewDialog = await screen.findByRole('dialog', { name: 'Review update' });
    expect(within(reviewDialog).queryByRole('button', { name: 'Copy receipt' })).not.toBeInTheDocument();
    expect(within(reviewDialog).getByText('Razor refill')).toBeInTheDocument();
    expect(within(reviewDialog).getByText('Towel')).toBeInTheDocument();
    expect(within(reviewDialog).getByText('12 → 15')).toBeInTheDocument();
    expect(within(reviewDialog).getByText('Blocked')).toBeInTheDocument();

    fireEvent.click(within(reviewDialog).getByRole('button', { name: 'Confirm save' }));

    await waitFor(() => expect(ingestSenaObservation).toHaveBeenCalledTimes(1));
    expect(ingestSenaObservation).toHaveBeenCalledWith(
      expect.objectContaining({
        stockSnapshot: [
          expect.objectContaining({
            skuId: 'sku-1',
            unitsInStock: 15,
            costPerUnit: 4,
            productPrice: 9,
          }),
        ],
        retailStockouts: [],
      }),
    );
  });

  it('uses whole-card dragging for POS workbench reordering', () => {
    renderRoute(observations, RECORD_UPDATE_SUPPLIER_PENDING_PATH);

    expect(screen.queryByRole('button', { name: 'Reorder Razor refill' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Reorder Towel' })).not.toBeInTheDocument();
    expect(
      screen.getByText('Tap a tile to set quantity. Drag a card to rearrange this bucket.'),
    ).toBeInTheDocument();
  });

  it('locks all other POS surfaces behind the save-ordering prompt during workbench reorder mode', () => {
    vi.useFakeTimers();

    try {
      renderRoute(observations, RECORD_UPDATE_SUPPLIER_PENDING_PATH);

      fireEvent.pointerDown(getPosWorkbenchTile('Razor refill'));
      act(() => {
        vi.advanceTimersByTime(350);
      });
      fireEvent.pointerUp(getPosWorkbenchTile('Razor refill'));

      expect(screen.getByRole('button', { name: 'Done' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Save ordering first' })).toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: 'Save ordering first' }));

      expect(screen.getByText('Save ordering first?')).toBeInTheDocument();
      expect(
        screen.getByText('Finish and save this card ordering before doing anything else in POS view.'),
      ).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it('blocks the first observation until at least one SKU stock row changes', () => {
    setStoredSessionViewMode('form');
    renderRoute([]);

    goToStockStep();
    expect(screen.getByRole('button', { name: /Count SKU stock/i })).toHaveAttribute('aria-current', 'step');
    expect(
      screen.getByText('Count at least one SKU before continuing so banji can anchor the first update.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();

    fireEvent.change(screen.getAllByLabelText('Current Units')[0]!, { target: { value: '7' } });
    expect(screen.getByRole('button', { name: 'Next' })).toBeEnabled();
  });

  it('shows the stock-row reorder hint and restores the saved sku order', () => {
    window.localStorage.setItem(STOCK_ROW_ORDER_STORAGE_KEY, JSON.stringify(['sku-2', 'sku-1']));
    setStoredSessionViewMode('form');

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
    setStoredSessionViewMode('form');
    renderRoute(observations, RECORD_UPDATE_SUPPLIER_PENDING_PATH);
    fireEvent.click(screen.getByRole('button', { name: 'New' }));

    expect(screen.queryByRole('button', { name: /Add service updates/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Rank recent selling order/i })).not.toBeInTheDocument();

    goNext(2);

    expect(screen.getByRole('button', { name: /Supplier orders/i })).toHaveAttribute('aria-current', 'step');
    expect(screen.getByRole('columnheader', { name: 'Last order' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Current order' })).toBeInTheDocument();
    expect(screen.getByLabelText('Current order for Razor refill')).toHaveAttribute('placeholder', 'banji recommends 8 units.');
    expect(screen.getByLabelText('Lead time mean')).toHaveAttribute('placeholder', '6');
    expect(screen.queryByText('banji recommends 8 units.')).not.toBeInTheDocument();
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
  }, 10000);

  it('uses the hub-selected customer ticket mode without re-showing the entry chooser', () => {
    renderRoute(observations, `${RECORD_UPDATE_CUSTOMER_PENDING_PATH}?ticketMode=new`);

    expect(screen.queryByRole('button', { name: 'New' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Edit/Update' })).not.toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /Observed at/i })[0]).toBeInTheDocument();
  });

  it('shows customer data and notes in separate POS popups', () => {
    renderRoute(observations, `${RECORD_UPDATE_CUSTOMER_PENDING_PATH}?ticketMode=new`);

    openPosMetadataPopup(/^Customer/i);
    expect(within(posMetadataDialog()).getByRole('heading', { name: 'Customer metadata' })).toBeInTheDocument();
    expect(within(posMetadataDialog()).getByLabelText('Communication channel')).toBeInTheDocument();
    expect(within(posMetadataDialog()).queryByLabelText('Report notes')).not.toBeInTheDocument();

    openPosMetadataPopup(/^Notes/i);
    expect(within(posMetadataDialog()).getByRole('heading', { name: 'Report notes' })).toBeInTheDocument();
    expect(within(posMetadataDialog()).getByLabelText('Report notes')).toBeInTheDocument();
    expect(within(posMetadataDialog()).queryByLabelText('Communication channel')).not.toBeInTheDocument();
  });

  it('defaults customer delivery fee payer to customer without opening the helper tooltip', async () => {
    renderRoute(observations, `${RECORD_UPDATE_CUSTOMER_PENDING_PATH}?ticketMode=new`);

    openPosMetadataPopup(/^Delivery/i);
    const dialog = posMetadataDialog();
    expect(within(dialog).getByRole('heading', { name: 'Delivery' })).toBeInTheDocument();
    const feeAmountInput = within(dialog).getByRole('textbox', { name: 'Fee amount' });
    expect(feeAmountInput).toHaveValue('');
    await waitFor(() => expect(feeAmountInput).toHaveFocus());
    expect(within(dialog).getByRole('radio', { name: 'Customer' })).toHaveAttribute('data-state', 'on');
    expect(within(dialog).getByRole('radio', { name: 'Merchant' })).toHaveAttribute('data-state', 'off');
    expect(screen.queryByText(/If the customer pays, delivery is added/)).not.toBeInTheDocument();
    expect(within(dialog).queryByText('Subtotal')).not.toBeInTheDocument();
    expect(within(dialog).queryByText('Total')).not.toBeInTheDocument();
  });

  it('asks before following a More help tooltip link with an in-progress record update', async () => {
    const user = userEvent.setup();
    renderRoutedSession(observations, `${RECORD_UPDATE_CUSTOMER_PENDING_PATH}?ticketMode=new`);

    openPosMetadataPopup(/^Delivery/i);
    const dialog = posMetadataDialog();
    fireEvent.change(within(dialog).getByRole('textbox', { name: 'Fee amount' }), { target: { value: '3' } });
    await user.hover(within(dialog).getByRole('button', { name: 'Delivery fee help' }));
    await user.click((await screen.findAllByRole('link', { name: 'More help for Delivery fee' }))[0]!);

    const leaveDialog = screen.getByText('Leave record update?').closest('[role="dialog"]');
    expect(leaveDialog).toBeInTheDocument();
    fireEvent.click(within(leaveDialog as HTMLElement).getByRole('button', { name: 'Keep editing' }));
    expect(screen.queryByText('Help destination')).not.toBeInTheDocument();
    expect(within(dialog).getByRole('textbox', { name: 'Fee amount' })).toHaveValue('3');

    await user.hover(within(dialog).getByRole('button', { name: 'Delivery fee help' }));
    await user.click((await screen.findAllByRole('link', { name: 'More help for Delivery fee' }))[0]!);
    const confirmLeaveDialog = screen.getByText('Leave record update?').closest('[role="dialog"]');
    fireEvent.click(within(confirmLeaveDialog as HTMLElement).getByRole('button', { name: 'Save draft and leave' }));

    await waitFor(() => {
      expect(screen.getByText('Help destination')).toBeInTheDocument();
    });
    expect(JSON.parse(window.localStorage.getItem(CUSTOMER_PENDING_DRAFT_STORAGE_KEY) ?? '{}')).toEqual(
      expect.objectContaining({
        deliveryFeeAmount: '3',
      }),
    );
  });

  it('autofills the latest matching delivery fee config for immediate sales', () => {
    const observationsWithDelivery = [{
      ...observations[0]!,
      input: {
        ...observations[0]!.input,
        deliveryFee: buildDeliveryFeeMetadata({
          bucket: 'customer_order',
          feeUsd: 2,
          payer: 'merchant',
          subtotalUsd: 20,
        }),
        ticketEvents: [{
          ticketId: 'ticket-immediate',
          ticketFamily: 'customer',
          lifecycle: 'resolved',
          stage: 'fulfilled_immediate',
          revision: 1,
          eventType: 'fulfilled_immediate',
          occurredAt: '2026-04-22T00:00:00.000Z',
          lines: [],
          deliveryFee: buildDeliveryFeeMetadata({
            bucket: 'immediate_sale',
            feeUsd: 5,
            payer: 'customer',
            subtotalUsd: 25,
          }),
        }],
      },
    }];

    renderRoute(observationsWithDelivery, RECORD_UPDATE_CUSTOMER_COMPLETED_PATH);

    openPosMetadataPopup(/^Delivery/i);
    const dialog = posMetadataDialog();
    expect(within(dialog).getByRole('textbox', { name: 'Fee amount' })).toHaveValue('5');
    expect(within(dialog).getByRole('radio', { name: 'Customer' })).toHaveAttribute('data-state', 'on');
  });

  it('opens a POS item popup before adding the line into the receipt card', () => {
    renderRoute(observations, `${RECORD_UPDATE_CUSTOMER_PENDING_PATH}?ticketMode=new`);

    fireEvent.click(getPosWorkbenchTile('Razor refill'));

    const dialog = screen.getByRole('dialog', { name: 'Razor refill' });
    expect(within(dialog).getByLabelText('Quantity for Razor refill')).toHaveValue('1');
    expect(within(dialog).getAllByText('$9.00')).toHaveLength(2);
    expect(screen.queryByText('Ready for line tray')).not.toBeInTheDocument();
    expect(screen.queryByText(/^Open 0$/)).not.toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole('button', { name: 'Add line' }));

    expect(screen.queryByLabelText('Quantity for Razor refill')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Remove Razor refill')).not.toBeInTheDocument();
    const receiptRow = screen.getByRole('button', { name: 'Edit Razor refill receipt line' });
    expect(within(receiptRow).getByText('1')).toBeInTheDocument();
    expect(receiptRow.className).toContain('hover:bg-emerald-50');
    expect(screen.getAllByText('$9.00').length).toBeGreaterThan(0);

    fireEvent.click(receiptRow);
    expect(within(screen.getByRole('dialog', { name: 'Razor refill' })).getByLabelText('Quantity for Razor refill')).toHaveValue('1');
  });

  it('shows a POS receipt confirmation dialog before saving and copies the plain text receipt', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });

    renderRoute(observations, `${RECORD_UPDATE_CUSTOMER_PENDING_PATH}?ticketMode=new`);

    fireEvent.click(getPosWorkbenchTile('Razor refill'));
    fireEvent.click(within(screen.getByRole('dialog', { name: 'Razor refill' })).getByRole('button', { name: 'Add line' }));

    fireEvent.click(screen.getByRole('button', { name: 'Review receipt' }));

    const dialog = await screen.findByRole('dialog', { name: 'Confirm receipt' });
    expect(ingestSenaObservation).not.toHaveBeenCalled();
    expect(within(dialog).queryByText('Plain text receipt')).not.toBeInTheDocument();
    expect(within(dialog).queryByText('Final confirmation: save this receipt as the current record update.')).not.toBeInTheDocument();
    expect(within(dialog).getByText('Razor refill')).toBeInTheDocument();
    expect(within(dialog).getAllByText('$9.00').length).toBeGreaterThan(0);

    fireEvent.click(within(dialog).getByRole('button', { name: 'Copy receipt' }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith('Receipt\n\nRazor refill (1)\n\nSubtotal: $9.00\nDelivery: $0.00\nTotal: $9.00'));
    expect(within(dialog).getByText('Copied receipt to clipboard.')).toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole('button', { name: 'Confirm save' }));
    await waitFor(() => expect(ingestSenaObservation).toHaveBeenCalledTimes(1));
  }, 10_000);

  it('shows supplier delivery fee as merchant-paid and non-editable', () => {
    setStoredSessionViewMode('form');
    renderRoute(observations, RECORD_UPDATE_SUPPLIER_PENDING_PATH);

    goNext();
    expect(screen.getByRole('textbox', { name: 'Fee amount' })).toHaveValue('');
    expect(screen.getByText('Paid by')).toBeInTheDocument();
    expect(screen.getByText('Merchant')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Customer' })).not.toBeInTheDocument();
  });

  it('persists merchant-paid delivery math into the receipt review and saved payload', async () => {
    renderRoute(observations, `${RECORD_UPDATE_CUSTOMER_PENDING_PATH}?ticketMode=new`);

    openPosMetadataPopup(/^Delivery/i);
    const metadataDialog = posMetadataDialog();
    fireEvent.change(within(metadataDialog).getByRole('textbox', { name: 'Fee amount' }), { target: { value: '3' } });
    fireEvent.click(within(metadataDialog).getByRole('radio', { name: 'Merchant' }));
    closePosMetadataPopup();

    fireEvent.click(getPosWorkbenchTile('Razor refill'));
    fireEvent.click(within(screen.getByRole('dialog', { name: 'Razor refill' })).getByRole('button', { name: 'Add line' }));
    fireEvent.click(screen.getByRole('button', { name: 'Review receipt' }));

    const dialog = await screen.findByRole('dialog', { name: 'Confirm receipt' });
    expect(within(dialog).getByText('Subtotal')).toBeInTheDocument();
    expect(within(dialog).getByText('Delivery')).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Delivery fee help' })).toBeInTheDocument();
    await waitFor(() => expect(within(dialog).getByRole('button', { name: 'Cancel' })).toHaveFocus());
    expect(screen.queryByText(/If the customer pays, delivery is added/)).not.toBeInTheDocument();
    expect(within(dialog).getByText('Total')).toBeInTheDocument();
    expect(within(dialog).getByText('$0.00')).toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole('button', { name: 'Confirm save' }));

    await waitFor(() => expect(ingestSenaObservation).toHaveBeenCalledTimes(1));
    expect(ingestSenaObservation).toHaveBeenCalledWith(expect.objectContaining({
      deliveryFee: expect.objectContaining({
        bucket: 'customer_order',
        feeUsd: 3,
        payer: 'merchant',
        subtotalUsd: 9,
        displayDeliveryUsd: 0,
        displayTotalUsd: 9,
        netSettlementUsd: 6,
      }),
    }));
  }, 10_000);

  it('shows tile pictures in POS view when item pictures are enabled', () => {
    renderRoute(observations, `${RECORD_UPDATE_CUSTOMER_PENDING_PATH}?ticketMode=new`);

    const razorTile = getPosWorkbenchTile('Razor refill');
    const razorImage = razorTile.querySelector('img');
    expect(razorImage).not.toBeNull();
    expect(razorImage).toHaveAttribute('src', 'banji-asset://local/razor-refill.png');
  });

  it('keeps POS tile order stable when a line is added or removed, including within filters', async () => {
    renderRoute(observations, `${RECORD_UPDATE_CUSTOMER_PENDING_PATH}?ticketMode=new`);

    const initialAllOrder = posWorkbenchTileNames();
    expect(initialAllOrder).toEqual(['Razor refill', 'Haircut', 'Towel wrap']);

    fireEvent.click(getPosWorkbenchTile('Razor refill'));
    fireEvent.click(within(screen.getByRole('dialog', { name: 'Razor refill' })).getByRole('button', { name: 'Add line' }));

    await waitFor(() => expect(screen.getByRole('button', { name: 'Edit Razor refill receipt line' })).toBeInTheDocument());
    expect(posWorkbenchTileNames()).toEqual(initialAllOrder);

    fireEvent.click(screen.getByRole('radio', { name: 'Services' }));
    const serviceOrder = posWorkbenchTileNames();
    expect(serviceOrder).toEqual(initialAllOrder.filter((name) => name !== 'Razor refill'));

    fireEvent.click(getPosWorkbenchTile('Towel wrap'));
    fireEvent.click(within(screen.getByRole('dialog', { name: 'Towel wrap' })).getByRole('button', { name: 'Add line' }));

    await waitFor(() => expect(screen.getByRole('button', { name: 'Edit Towel wrap receipt line' })).toBeInTheDocument());
    expect(posWorkbenchTileNames()).toEqual(serviceOrder);

    fireEvent.click(getPosWorkbenchTile('Towel wrap'));
    fireEvent.click(within(screen.getByRole('dialog', { name: 'Towel wrap' })).getByRole('button', { name: 'Remove line' }));

    await waitFor(() => expect(screen.queryByRole('button', { name: 'Edit Towel wrap receipt line' })).not.toBeInTheDocument());
    expect(posWorkbenchTileNames()).toEqual(serviceOrder);

    fireEvent.click(screen.getByRole('radio', { name: 'All' }));
    expect(posWorkbenchTileNames()).toEqual(initialAllOrder);
  }, 10_000);

  it('applies persisted supplier workbench tile order from desktop preferences', () => {
    preferenceState.workbenchTileOrderByLane = {
      'supplier-order-pending': ['supplier-order:sku-2', 'supplier-order:sku-1'],
    };

    renderRoute(observations, RECORD_UPDATE_SUPPLIER_PENDING_PATH);

    expect(visibleWorkbenchTileTitles()).toEqual(['Towel', 'Razor refill']);
  });

  it('keeps supplier and immediate-sale workbench orders scoped to their own buckets', () => {
    preferenceState.workbenchTileOrderByLane = {
      'supplier-order-pending': ['supplier-order:sku-2', 'supplier-order:sku-1'],
      'customer-order-completed': ['service:service-1', 'retail:sku-2', 'retail:sku-1', 'service:service-2'],
    };

    const supplierView = renderRoute(observations, RECORD_UPDATE_SUPPLIER_PENDING_PATH);
    expect(visibleWorkbenchTileTitles()).toEqual(['Towel', 'Razor refill']);
    supplierView.unmount();

    renderRoute(observations, RECORD_UPDATE_CUSTOMER_COMPLETED_PATH);
    expect(visibleWorkbenchTileTitles()).toEqual(['Haircut', 'Razor refill', 'Towel wrap']);
  });

  it('keeps all four POS workbench orders scoped to their own persisted lane', () => {
    preferenceState.workbenchTileOrderByLane = {
      'stock-count': ['stock:sku-2', 'stock:sku-1'],
      'supplier-order-pending': ['supplier-order:sku-2', 'supplier-order:sku-1'],
      'customer-order-pending': ['service:service-1', 'retail:sku-1', 'service:service-2'],
      'customer-order-completed': ['service:service-1', 'retail:sku-1', 'service:service-2'],
    };

    const stockCountView = renderRoute(observations, RECORD_UPDATE_STOCK_COUNT_PATH);
    expect(visibleWorkbenchTileTitles()).toEqual(['Towel', 'Razor refill']);
    stockCountView.unmount();

    const supplierView = renderRoute(observations, RECORD_UPDATE_SUPPLIER_PENDING_PATH);
    expect(visibleWorkbenchTileTitles()).toEqual(['Towel', 'Razor refill']);
    supplierView.unmount();

    const customerPendingView = renderRoute(observations, `${RECORD_UPDATE_CUSTOMER_PENDING_PATH}?ticketMode=new`);
    expect(visibleWorkbenchTileTitles()).toEqual(['Haircut', 'Razor refill', 'Towel wrap']);
    customerPendingView.unmount();

    renderRoute(observations, RECORD_UPDATE_CUSTOMER_COMPLETED_PATH);
    expect(visibleWorkbenchTileTitles()).toEqual(['Haircut', 'Razor refill', 'Towel wrap']);
  });

  it('uses the hub-selected supplier ticket mode and only shows ticket selection in-page', () => {
    inventoryHook.mockReturnValue(
      inventoryState({
        observations,
        orderBatches: [
          {
            batchOrderId: 'batch-1',
            ownerSub: 'desktop-owner',
            supplierName: 'Mekong Looms',
            status: 'open',
            updatedAt: '2026-04-03T12:00:00.000Z',
            shared: {
              supplierName: 'Mekong Looms',
              expectedArrivalAt: '2026-04-10T12:00:00.000Z',
              supplierNote: '',
            },
            children: [
              {
                childOrderId: 'child-1',
                skuId: 'sku-1',
                status: 'open',
                updatedAt: '2026-04-03T12:00:00.000Z',
                effective: {
                  orderedQuantity: 8,
                  receivedQuantity: 0,
                  expectedArrivalAt: '2026-04-10T12:00:00.000Z',
                  leadTimeDaysHint: 6,
                  leadTimeVariability: 'tight',
                },
              },
            ],
          },
        ],
      }),
    );

    renderRoute(observations, `${RECORD_UPDATE_SUPPLIER_PENDING_PATH}?ticketMode=edit`);

    expect(screen.queryByText('What do you want to do?')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'New' })).not.toBeInTheDocument();
    expect(screen.getByText('Edit / update existing supplier order')).toBeInTheDocument();
    expect(screen.getByText('Select the existing ticket you want to update.')).toBeInTheDocument();
  });

  it('keeps the edit popup open when edit-update is chosen with a preloaded supplier ticket id', async () => {
    inventoryHook.mockReturnValue(
      inventoryState({
        observations,
        orderBatches: [
          {
            batchOrderId: 'batch-1',
            ownerSub: 'desktop-owner',
            supplierName: 'Mekong Looms',
            status: 'open',
            updatedAt: '2026-04-03T12:00:00.000Z',
            shared: {
              supplierName: 'Mekong Looms',
              expectedArrivalAt: '2026-04-10T12:00:00.000Z',
              supplierNote: '',
            },
            children: [],
          },
        ],
      }),
    );

    render(
      <MemoryRouter initialEntries={[`${RECORD_UPDATE_SUPPLIER_PENDING_PATH}?batchOrderId=batch-1`]}>
        <StockUpdateSessionRoute />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Edit/Update' }));

    await waitFor(() => {
      expect(screen.queryByText('What do you want to do?')).not.toBeInTheDocument();
      expect(screen.getByText('Edit / update existing supplier order')).toBeInTheDocument();
      expect(screen.getByText('Select the existing ticket you want to update.')).toBeInTheDocument();
    });
  });

  it('disables edit-update when no existing supplier tickets are available', () => {
    renderRoute(observations, RECORD_UPDATE_SUPPLIER_PENDING_PATH);

    expect(screen.getByRole('button', { name: 'Edit/Update' })).toBeDisabled();
    expect(screen.queryByText('Edit / update existing supplier order')).not.toBeInTheDocument();
  });

  it('dismisses the supplier ticket prompt to the record update hub when clicking the backdrop', async () => {
    renderRouteWithHub(observations, RECORD_UPDATE_SUPPLIER_PENDING_PATH);

    const prompt = screen.getByRole('dialog', { name: 'What do you want to do?' });
    fireEvent.click(prompt.parentElement as HTMLElement);

    await waitFor(() => expect(screen.getByText('Record update hub destination')).toBeInTheDocument());
  });

  it('stays on an optional stock step when changing an existing Yes choice to No', () => {
    setStoredSessionViewMode('form');
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
    setStoredSessionViewMode('form');
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-09T16:44:00+07:00'));

    try {
      renderRoute();

      expect(screen.getByDisplayValue(localDateTimeValue(new Date()))).toBeInTheDocument();
      expect(
        screen.getAllByText(
          'banji starts with this device’s current date and time here. Adjust it only if the update was observed earlier.',
        )[0],
      ).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it('reveals the event column for SKU rows and saves stockout events', async () => {
    setStoredSessionViewMode('form');
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

  it('uses the supplier order wizard for receipt updates and submits receipt details', async () => {
    setStoredSessionViewMode('form');
    renderRoute(observations, RECORD_UPDATE_SUPPLIER_PENDING_PATH);

    expect(screen.queryByRole('button', { name: /Add service updates/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Rank recent selling order/i })).not.toBeInTheDocument();

    goNext(3);

    expect(screen.getByRole('button', { name: /Supplier ticket receipt/i })).toHaveAttribute('aria-current', 'step');
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
  }, 10_000);

  it('uses selected custom lanes to build a combined wizard without duplicate shared steps', () => {
    renderRoute(observations, `${RECORD_UPDATE_CUSTOM_PATH}?lanes=stock-count,supplier-order-pending`);

    expect(screen.getByRole('button', { name: /Count SKU stock/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Supplier orders/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Supplier ticket receipt/i })).toBeInTheDocument();
  });

  it('lets a custom single-lane supplier order wizard include the receipt branch', () => {
    renderRoute(observations, `${RECORD_UPDATE_CUSTOM_PATH}?lanes=supplier-order-pending`);

    goNext(3);

    expect(screen.getByRole('button', { name: /Supplier ticket receipt/i })).toHaveAttribute('aria-current', 'step');
    expect(screen.getByRole('columnheader', { name: 'Last receipt' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Current receipt' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Count SKU stock/i })).not.toBeInTheDocument();
  });

  it('preserves the selected custom lanes in a saved draft', async () => {
    const { unmount } = renderRoute(observations, `${RECORD_UPDATE_CUSTOM_PATH}?lanes=stock-count,supplier-order-pending`);

    goNext();
    fireEvent.change(screen.getByLabelText('Report notes'), { target: { value: 'Custom draft note' } });

    unmount();

    expect(JSON.parse(window.localStorage.getItem(CUSTOM_DRAFT_STORAGE_KEY) ?? '{}')).toEqual(
      expect.objectContaining({
        customSelectedLaneIds: ['stock-count', 'supplier-order-pending'],
        notes: 'Custom draft note',
      }),
    );

    renderRoute(observations, RECORD_UPDATE_CUSTOM_PATH);

    await waitFor(() => expect(screen.getByText('Draft resumed')).toBeInTheDocument());
    expect(screen.getByRole('button', { name: /Supplier ticket receipt/i })).toBeInTheDocument();
    expect(screen.getByDisplayValue('Custom draft note')).toBeInTheDocument();
  });

  it('saves stock and supplier receipt signals from one custom update', async () => {
    renderRoute(observations, `${RECORD_UPDATE_CUSTOM_PATH}?lanes=stock-count,supplier-order-pending`);

    goToStockStep();
    fireEvent.change(screen.getAllByLabelText('Current Units')[0]!, { target: { value: '7' } });
    goNext();
    chooseOptionalStepNo(3);

    goNext();
    expect(screen.getByRole('button', { name: /Supplier ticket receipt/i })).toHaveAttribute('aria-current', 'step');
    fireEvent.change(screen.getByLabelText('Current receipt for Razor refill'), { target: { value: '6' } });
    goNext(2);

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
        orderSignals: [
          expect.objectContaining({
            approximateReceiptQuantity: 6,
            orderPlaced: false,
            receiptArrived: true,
            skuId: 'sku-1',
          }),
        ],
      }),
    );
  }, 10_000);

  it('shows a helper in the stock step when the catalog has no skus', async () => {
    setStoredSessionViewMode('form');
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

  it('submits only changed stock rows and still schedules the SENA run', async () => {
    setStoredSessionViewMode('form');
    const setTimeoutSpy = vi.spyOn(window, 'setTimeout');
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
    expect(setTimeoutSpy).toHaveBeenCalledWith(expect.any(Function), 5_000);
    for (const result of setTimeoutSpy.mock.results) {
      if (typeof result.value === 'number') {
        window.clearTimeout(result.value);
      }
    }
    expect(window.localStorage.getItem(STOCK_UPDATE_DRAFT_STORAGE_KEY)).toBeNull();
    setTimeoutSpy.mockRestore();
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

    setStoredSessionViewMode('form');
    renderEditRoute(editableObservation, observations, RECORD_UPDATE_CUSTOMER_COMPLETED_PATH);

    fireEvent.change(screen.getByLabelText('Current interval sales for Razor refill'), { target: { value: '9' } });

    goNext();
    expect(screen.getByLabelText('Current interval sales for Haircut')).toHaveValue('2');
    fireEvent.change(screen.getByLabelText('Current interval sales for Haircut'), { target: { value: '5' } });

    goNext(2);
    fireEvent.click(screen.getByRole('button', { name: /Report notes/i }));
    expect(screen.getByDisplayValue('Saved note')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Capture details/i }));

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
    setStoredSessionViewMode('form');
    renderRoute(observations, RECORD_UPDATE_CUSTOMER_COMPLETED_PATH);

    goNext(2);
    chooseOptionalStepYes();
    goNext();
    chooseOptionalStepYes();

    fireEvent.click(screen.getByRole('combobox', { name: 'Filter by supplier' }));
    fireEvent.click(screen.getByRole('option', { name: 'Mekong Looms' }));

    expect(screen.getByLabelText('Current interval sales for Haircut')).toBeInTheDocument();
    expect(screen.queryByLabelText('Current interval sales for Towel wrap')).not.toBeInTheDocument();
  });

  it('resets the session immediately after saving and schedules the rerun in the background', async () => {
    setStoredSessionViewMode('form');
    const rerun = deferredPromise<void>();
    triggerSenaRun.mockReturnValueOnce(rerun.promise);
    const setTimeoutSpy = vi.spyOn(window, 'setTimeout');

    renderRoutedSession();

    goToStockStep();
    fireEvent.change(screen.getAllByLabelText('Current Units')[0]!, { target: { value: '7' } });
    goNext();
    chooseOptionalStepNo(3);
    goNext();
    fireEvent.click(screen.getByRole('button', { name: 'Save update' }));

    await waitFor(() => expect(ingestSenaObservation).toHaveBeenCalledTimes(1));
    expect(setTimeoutSpy).toHaveBeenCalledWith(expect.any(Function), 5_000);
    window.clearTimeout(setTimeoutSpy.mock.results[0]?.value as number);
    expect(runWorkspacePreparation).not.toHaveBeenCalled();

    await waitFor(() => expect(screen.getByText('Overview destination')).toBeInTheDocument());
    expect(window.localStorage.getItem(STOCK_UPDATE_DRAFT_STORAGE_KEY)).toBeNull();

    rerun.resolve(undefined);
    setTimeoutSpy.mockRestore();
  });

  it('keeps a partial historical stock snapshot when saving an edit', async () => {
    setStoredSessionViewMode('form');
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
    setStoredSessionViewMode('form');
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
    setStoredSessionViewMode('form');
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

    fireEvent.click(screen.getAllByRole('button', { name: /Report notes/i })[0]);
    expect(screen.getByDisplayValue('Draft note')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Add flags/i }));
    expect(screen.getByRole('combobox', { name: 'Event for Razor refill' })).toHaveTextContent('Blocked event');
  }, 10_000);

  it('uses a separate draft key for the customer pending lane', () => {
    setStoredSessionViewMode('form');
    const { unmount } = renderRoute(observations, RECORD_UPDATE_CUSTOMER_PENDING_PATH);

    goNext(2);
    fireEvent.change(screen.getByLabelText('New pending quantity for Razor refill'), { target: { value: '3' } });

    unmount();

    expect(window.localStorage.getItem(CUSTOMER_PENDING_DRAFT_STORAGE_KEY)).not.toBeNull();
    expect(window.localStorage.getItem(STOCK_UPDATE_DRAFT_STORAGE_KEY)).toBeNull();
  });

  it('asks before replacing a live in-memory draft with an edit session', async () => {
    setStoredSessionViewMode('form');
    renderRouteWithInlineEditLink();

    goToStockStep();
    fireEvent.change(screen.getAllByLabelText('Current Units')[0]!, { target: { value: '7' } });
    fireEvent.click(screen.getByRole('link', { name: 'Edit saved report' }));

    expect(screen.getByRole('dialog')).toHaveTextContent('Replace saved draft?');
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(screen.getAllByLabelText('Current Units')[0]).toHaveValue('7');
  });

  it('asks before discarding changes and resets only after confirmation', async () => {
    setStoredSessionViewMode('form');
    renderRouteWithHub();

    goToStockStep();
    fireEvent.change(screen.getAllByLabelText('Current Units')[0]!, { target: { value: '7' } });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Discard changes' })).toBeEnabled());
    expect(screen.getByRole('button', { name: 'Discard changes' })).toHaveAttribute('data-variant', 'destructive-outline');
    fireEvent.click(screen.getByRole('button', { name: 'Discard changes' }));

    await waitFor(() => expect(screen.getByRole('dialog')).toHaveTextContent('Discard changes?'));
    fireEvent.click(screen.getByRole('button', { name: 'Keep editing' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getAllByLabelText('Current Units')[0]).toHaveValue('7');

    fireEvent.click(screen.getByRole('button', { name: 'Discard changes' }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Discard changes' }));

    await waitFor(() => expect(screen.getByText('Record update hub destination')).toBeInTheDocument());
    expect(window.localStorage.getItem(STOCK_UPDATE_DRAFT_STORAGE_KEY)).toBeNull();
  });

  it('renders destructive treatment for stock-session actions and POS remove-line actions', async () => {
    setStoredSessionViewMode('form');
    renderRoute();

    goToStockStep();
    fireEvent.change(screen.getAllByLabelText('Current Units')[0]!, { target: { value: '7' } });
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Discard changes' })).toBeEnabled();
    });
    expect(screen.getByRole('button', { name: 'Discard changes' })).toHaveAttribute(
      'data-variant',
      'destructive-outline',
    );

    cleanup();
    setStoredSessionViewMode('pos');
    renderRoute(observations, `${RECORD_UPDATE_CUSTOMER_PENDING_PATH}?ticketMode=new`);
    fireEvent.click(getPosWorkbenchTile('Razor refill'));
    expect(within(screen.getByRole('dialog', { name: 'Razor refill' })).queryByRole('button', { name: 'Remove line' }))
      .not.toBeInTheDocument();
    fireEvent.click(within(screen.getByRole('dialog', { name: 'Razor refill' })).getByRole('button', { name: 'Add line' }));
    fireEvent.click(screen.getByRole('button', { name: 'Edit Razor refill receipt line' }));
    expect(within(screen.getByRole('dialog', { name: 'Razor refill' })).getByRole('button', { name: 'Remove line' }))
      .toHaveAttribute('data-variant', 'destructive-outline');
  });

  it('clears a POS session immediately without reopening the ticket mode chooser', async () => {
    renderRoute(observations, `${RECORD_UPDATE_CUSTOMER_PENDING_PATH}?ticketMode=new`);

    fireEvent.click(getPosWorkbenchTile('Razor refill'));
    fireEvent.click(within(screen.getByRole('dialog', { name: 'Razor refill' })).getByRole('button', { name: 'Add line' }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Clear session' })).toBeEnabled();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Clear session' }));

    await waitFor(() => {
      expect(screen.getByText('No line items yet. Add counts, orders, receipts, or rankings to build the session receipt.')).toBeInTheDocument();
    });
    expect(screen.queryByText('Discard changes?')).not.toBeInTheDocument();
    expect(screen.queryByText('What do you want to do?')).not.toBeInTheDocument();
    expect(window.localStorage.getItem(CUSTOMER_PENDING_DRAFT_STORAGE_KEY)).toBeNull();
  });

  it('updates POS popup quantities from the stepper controls and closes on cancel', async () => {
    renderRoute(observations, `${RECORD_UPDATE_CUSTOMER_PENDING_PATH}?ticketMode=new`);

    fireEvent.click(getPosWorkbenchTile('Razor refill'));

    const dialog = screen.getByRole('dialog', { name: 'Razor refill' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Increase Razor refill' }));
    expect(within(dialog).getByLabelText('Quantity for Razor refill')).toHaveValue('2');

    fireEvent.click(within(dialog).getByRole('button', { name: 'Decrease Razor refill' }));
    expect(within(dialog).getByLabelText('Quantity for Razor refill')).toHaveValue('1');

    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Razor refill' })).not.toBeInTheDocument());

    fireEvent.click(getPosWorkbenchTile('Razor refill'));
    const reopenedDialog = screen.getByRole('dialog', { name: 'Razor refill' });
    fireEvent.click(within(reopenedDialog).getByRole('button', { name: 'Increase Razor refill' }));
    fireEvent.click(within(reopenedDialog).getByRole('button', { name: 'Add line' }));

    const receiptRow = await screen.findByRole('button', { name: 'Edit Razor refill receipt line' });
    expect(within(receiptRow).getByText('2')).toBeInTheDocument();
  });

  it('saves the draft before navigating away from a record update session', async () => {
    setStoredSessionViewMode('form');
    renderRoutedSession();

    goToStockStep();
    fireEvent.change(screen.getAllByLabelText('Current Units')[0]!, { target: { value: '7' } });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Discard changes' })).toBeEnabled());
    fireEvent.click(screen.getByRole('link', { name: 'Catalog' }));

    await waitFor(() => expect(screen.getByRole('dialog')).toHaveTextContent('Leave record update?'));
    fireEvent.click(screen.getByRole('button', { name: 'Keep editing' }));
    expect(screen.queryByText('Catalog destination')).not.toBeInTheDocument();
    expect(screen.getAllByLabelText('Current Units')[0]).toHaveValue('7');

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
