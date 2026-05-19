import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import userEvent from '@testing-library/user-event';
import { Link, MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRecordUpdateEditSession } from '@/lib/observation-edit-session';
import {
  RECORD_UPDATE_CUSTOMER_PENDING_PATH,
  RECORD_UPDATE_HUB_PATH,
  RECORD_UPDATE_CUSTOMER_COMPLETED_PATH,
  RECORD_UPDATE_CUSTOM_PATH,
  RECORD_UPDATE_STOCK_COUNT_PATH,
  RECORD_UPDATE_SUPPLIER_PENDING_PATH,
  RECORD_UPDATE_SUPPLIER_RECEIPT_PATH,
} from '@/lib/record-update-routes';
import { recordUpdateSessionViewStorageKey, writeRecordUpdateSessionViewMode } from '@/lib/record-update-session-view';
import type { SenaObservationRecord } from '@shared/sena';
import { NavigationHistoryProvider } from '@/state/navigation-history';
import { buildDeliveryFeeMetadata } from '@/lib/ticketing';
import { getTranslation } from '@/lib/translations';
import { buildStockRowOrderStorageKey } from './stock-row-order';
import {
  dateInputToIso,
  dateInputValue,
  customerTicketLineDraftQuantity,
  parseOptionalNonNegativeFiniteNumberDraft,
  parseServicePriceDraft,
  parseStockMoneyDraft,
  parseStockUnitsDraft,
  randomReportNotePlaceholderKeyForLane,
  supplierTicketOrderedDraftQuantity,
  supplierTicketReceiptDraftQuantity,
  StockUpdateSessionRoute,
} from './stock-update-session';

const inventoryHook = vi.fn();
const createSenaOrderBatch = vi.fn();
const ingestSenaObservation = vi.fn();
const runWorkspacePreparation = vi.fn();
const runSavingTask = vi.fn();
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
const STOCK_UPDATE_DRAFT_STORAGE_KEY = 'kaur-khor:record-update:draft:stock-count:v1';
const CUSTOMER_PENDING_DRAFT_STORAGE_KEY = 'kaur-khor:record-update:draft:customer-order-pending:v1';
const SUPPLIER_PENDING_DRAFT_STORAGE_KEY = 'kaur-khor:record-update:draft:supplier-order-pending:v1';
const SUPPLIER_RECEIPT_DRAFT_STORAGE_KEY = 'kaur-khor:record-update:draft:supplier-receipt:v1';
const CUSTOM_DRAFT_STORAGE_KEY = 'kaur-khor:record-update:draft:custom:v1';
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

const observations: SenaObservationRecord[] = [
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
    loadWorkSupportData: vi.fn(async () => null),
    observations,
    orderBatches: [],
    runSavingTask,
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

function supplierTicketRecord(ticketId = 'supplier-ticket-real') {
  return {
    ticketId,
    ticketFamily: 'supplier' as const,
    lifecycle: 'open' as const,
    stage: 'ordered_waiting' as const,
    revision: 3,
    eventType: 'created' as const,
    occurredAt: '2026-04-03T12:00:00.000Z',
    nextTouchAt: '2026-04-10T12:00:00.000Z',
    party: {
      role: 'supplier' as const,
      supplierName: 'Mekong Looms',
    },
    lines: [
      {
        entityType: 'sku' as const,
        entityId: 'sku-1',
        quantityDelta: 8,
        orderedQuantity: null,
        receivedQuantity: null,
        expectedArrivalAt: '2026-04-10T12:00:00.000Z',
      },
      {
        entityType: 'sku' as const,
        entityId: 'sku-2',
        quantityDelta: 3,
        orderedQuantity: null,
        receivedQuantity: null,
        expectedArrivalAt: '2026-04-11T12:00:00.000Z',
      },
    ],
    note: 'Supplier confirmed split arrival.',
  };
}

function customerTicketRecord(ticketId = 'customer-ticket-real') {
  return {
    ticketId,
    ticketFamily: 'customer' as const,
    lifecycle: 'open' as const,
    stage: 'pending' as const,
    revision: 2,
    eventType: 'created' as const,
    occurredAt: '2026-04-03T12:00:00.000Z',
    nextTouchAt: '2026-04-09T12:00:00.000Z',
    party: {
      role: 'customer' as const,
      channelLabel: 'Telegram',
      customerName: 'Dara',
      phone: '+85512345678',
      location: 'Phnom Penh',
    },
    lines: [
      {
        entityType: 'service' as const,
        entityId: 'service-1',
        quantityDelta: 2,
        expectedArrivalAt: '2026-04-09T12:00:00.000Z',
      },
      {
        entityType: 'sku' as const,
        entityId: 'sku-1',
        quantityDelta: 1,
        expectedArrivalAt: '2026-04-10T12:00:00.000Z',
      },
    ],
    note: 'Prefers evening pickup.',
  };
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

  function ProductsDestination() {
    const location = useLocation();
    const state = location.state as { preservedOrigin?: string } | null;
    return (
      <div>
        <div>Products destination</div>
        <div data-testid="products-origin">{state?.preservedOrigin ?? 'missing'}</div>
      </div>
    );
  }

  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route
          element={
            <>
              <Link state={{ preservedOrigin: 'record-update' }} to="/catalog">Products</Link>
              <StockUpdateSessionRoute />
            </>
          }
          path={routePath}
        />
        <Route element={<div>Overview destination</div>} path="/" />
        <Route element={<ProductsDestination />} path="/catalog" />
        <Route element={<div>Help destination</div>} path="/settings/help" />
      </Routes>
    </MemoryRouter>,
  );
}

function renderRoutedSessionWithHistory(nextObservations = observations, initialPath = RECORD_UPDATE_STOCK_COUNT_PATH) {
  inventoryHook.mockReturnValue(inventoryState({ observations: nextObservations }));
  const routePath = initialPath.split('?')[0] ?? initialPath;

  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <NavigationHistoryProvider>
        <Routes>
          <Route element={<StockUpdateSessionRoute />} path={routePath} />
          <Route element={<div>Products destination</div>} path="/catalog" />
        </Routes>
      </NavigationHistoryProvider>
    </MemoryRouter>,
  );
}

function renderRoutedSessionFromCapture(nextObservations = observations, initialPath = RECORD_UPDATE_STOCK_COUNT_PATH) {
  inventoryHook.mockReturnValue(inventoryState({ observations: nextObservations }));

  return render(
    <MemoryRouter initialEntries={[RECORD_UPDATE_HUB_PATH, initialPath]} initialIndex={1}>
      <NavigationHistoryProvider>
        <Routes>
          <Route element={<StockUpdateSessionRoute />} path={`${RECORD_UPDATE_HUB_PATH}/*`} />
          <Route element={<div>Capture destination</div>} path={RECORD_UPDATE_HUB_PATH} />
          <Route element={<div>Overview destination</div>} path="/" />
        </Routes>
      </NavigationHistoryProvider>
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

function renderEditRouteWithSearch(
  search: string,
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
          search,
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
  (window as typeof window & { __KAUR_KHOR_TEST_ALLOW_DEAD_FORM_VIEW__?: boolean }).__KAUR_KHOR_TEST_ALLOW_DEAD_FORM_VIEW__ = mode === 'form';
  window.localStorage.setItem(recordUpdateSessionViewStorageKey(), mode);
  if (mode === 'pos') {
    writeRecordUpdateSessionViewMode(mode);
  }
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

async function fillPendingPosTiming(expectedArrivalDate = '2026-04-18') {
  openPosMetadataPopup(/^Timing/i);
  fireEvent.change(within(posMetadataDialog()).getByLabelText('Observed at'), {
    target: { value: '2026-04-12T09:00' },
  });
  fireEvent.change(within(posMetadataDialog()).getByLabelText('Expected date of arrival'), {
    target: { value: expectedArrivalDate },
  });
  const variabilitySelect = within(posMetadataDialog()).getByRole('combobox', { name: 'ETA variation' });
  fireEvent.click(variabilitySelect);
  fireEvent.click(screen.getByRole('option', { name: /^Tight\b/i }));
  closePosMetadataPopup();
  await waitFor(() => expect(findPosMetadataDialog()).toBeNull());
}

function captureDoneButton() {
  const button = screen
    .getAllByRole('button', { name: 'Done' })
    .find((entry) => entry.getAttribute('form') === 'stock-update-session-form');
  if (!button) {
    throw new Error('Capture Done button not found');
  }
  return button;
}

function expectSavedStockSnapshot(expected: Array<{ skuId: string; unitsInStock: number }>) {
  const payload = ingestSenaObservation.mock.calls[0]?.[0];
  expect(payload).toBeTruthy();
  expect(payload.stockSnapshot).toEqual(
    expected.map((entry) => expect.objectContaining(entry)),
  );
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

async function withSuppressedConsoleError(
  assertion: (consoleErrorSpy: ReturnType<typeof vi.spyOn>) => Promise<void>,
) {
  const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  try {
    await assertion(consoleErrorSpy);
  } finally {
    consoleErrorSpy.mockRestore();
  }
}

describe('StockUpdateSessionRoute', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-05-09T08:59:00+07:00'));
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
    runSavingTask.mockImplementation(async (task: () => Promise<unknown>) => task());
    runWorkspacePreparation.mockImplementation(async (task: () => Promise<unknown>) => task());
	  });

  afterEach(() => {
    cleanup();
    window.localStorage.clear();
    delete (window as typeof window & { __KAUR_KHOR_TEST_ALLOW_DEAD_FORM_VIEW__?: boolean }).__KAUR_KHOR_TEST_ALLOW_DEAD_FORM_VIEW__;
    delete document.documentElement.dataset.kaurKhorEmbeddedPhonePortrait;
    vi.useRealTimers();
	    vi.clearAllMocks();
	  });

  it('uses lane-specific report notes placeholder examples', () => {
    const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0);
    const placeholder = (laneId: Parameters<typeof randomReportNotePlaceholderKeyForLane>[0], selectedLaneIds: Parameters<typeof randomReportNotePlaceholderKeyForLane>[1] = []) =>
      getTranslation('en', randomReportNotePlaceholderKeyForLane(laneId, selectedLaneIds));

    expect(placeholder('stock-count')).toBe('Example: found two units in back storage during the count.');
    expect(placeholder('supplier-order-pending')).toBe('Example: supplier confirmed a smaller case size for this order.');
    expect(placeholder('supplier-receipt')).toBe('Example: one carton arrived damaged and was counted separately.');
    expect(placeholder('customer-order-pending')).toBe('Example: customer requested pickup after work.');
    expect(placeholder('customer-order-completed')).toBe('Example: customer picked up the order in person.');
    expect(placeholder('custom', ['stock-count', 'supplier-order-pending'])).toBe('Example: found two units in back storage during the count.');
    expect(placeholder('custom')).toBe('Example: routine update, no unusual context to add.');

    randomSpy.mockReturnValue(0.999);
    expect(placeholder('stock-count')).toBe('Example: routine count, no unusual stock movement.');
    expect(placeholder('supplier-order-pending')).toBe('Example: order was grouped with another supplier shipment.');
    expect(placeholder('supplier-receipt')).toBe('Example: receipt matched the ticket and was shelved immediately.');
    expect(placeholder('customer-order-pending')).toBe('Example: customer request is pending until payment is confirmed.');
    expect(placeholder('customer-order-completed')).toBe('Example: customer collected the item but asked for follow-up later.');
    expect(placeholder('custom', ['stock-count', 'supplier-order-pending'])).toBe('Example: order was grouped with another supplier shipment.');
    expect(placeholder('custom')).toBe('Example: update was entered from a handwritten shift note.');
  });

  it('shows the 8-step stock-count wizard, preserves state, and keeps future steps locked', () => {
    setStoredSessionViewMode('form');
    renderRoute();

    expect(screen.getAllByRole('button', { name: /Observed at/i })[0]).toHaveAttribute('aria-current', 'step');
    expect(screen.getByRole('progressbar', { name: 'Wizard progress' })).toHaveAttribute('aria-valuenow', '13');
    expect(screen.queryByRole('button', { name: /Add service updates/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Rank recent selling order/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/% unlocked/i)).not.toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /Review update/i }).some((button) => button.hasAttribute('disabled'))).toBe(true);
    expect(screen.getByRole('button', { name: 'Discard changes and leave' })).toBeDisabled();

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

  it('keeps standard and custom capture sessions in POS', () => {
    renderRoute();

    expect(screen.getByText('Changed items')).toBeInTheDocument();
    expect(screen.queryByText('Receipt')).not.toBeInTheDocument();

    cleanup();
    renderRoute(observations, `${RECORD_UPDATE_CUSTOM_PATH}?lanes=stock-count,supplier-order-pending`);

    expect(screen.queryByRole('button', { name: 'Point of Sale View' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Form View' })).not.toBeInTheDocument();
    expect(screen.getByText('Main workbench')).toBeInTheDocument();

    cleanup();
    setStoredSessionViewMode('pos');
    renderRoute(observations, `${RECORD_UPDATE_CUSTOMER_PENDING_PATH}?ticketMode=new`);

    expect(screen.queryByRole('button', { name: 'Point of Sale View' })).not.toBeInTheDocument();
    expect(screen.getByText('Main workbench')).toBeInTheDocument();

    cleanup();
    writeRecordUpdateSessionViewMode('form');
    renderRoute(observations, `${RECORD_UPDATE_CUSTOMER_PENDING_PATH}?ticketMode=new`);

    expect(screen.queryByRole('button', { name: 'Point of Sale View' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Form View' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Report notes/i })).not.toBeInTheDocument();
    expect(screen.getByText('Main workbench')).toBeInTheDocument();
  });

  it('renders the POS receipt as a normal stacked card instead of a right rail landmark', () => {
    setStoredSessionViewMode('pos');

    renderRoute(observations, `${RECORD_UPDATE_CUSTOMER_PENDING_PATH}?ticketMode=new`);

    expect(screen.queryByRole('complementary')).not.toBeInTheDocument();

    const workbenchTitle = screen.getByText('Main workbench');
    const receiptTitle = screen.getAllByText('Receipt')[0]!;

    expect(workbenchTitle.compareDocumentPosition(receiptTitle) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('does not render form step guidance in the POS workbench header', () => {
    setStoredSessionViewMode('pos');

    renderRoute(observations, `${RECORD_UPDATE_CUSTOMER_PENDING_PATH}?ticketMode=new`);

    const workbench = screen.getByText('Main workbench').closest('section');
    expect(workbench).not.toBeNull();
    expect(within(workbench!).queryByText('Choose Yes or No before continuing.')).not.toBeInTheDocument();
  });

  it('renders POS workbench item cards as square tiles', () => {
    setStoredSessionViewMode('pos');

    renderRoute(observations, `${RECORD_UPDATE_CUSTOMER_PENDING_PATH}?ticketMode=new`);

    const razorTile = getPosWorkbenchTile('Razor refill');

    expect(razorTile).toHaveClass('w-full');
    expect(razorTile).toHaveClass('aspect-square');
    expect(razorTile).toHaveAttribute('data-workbench-tile-key', 'retail:sku-1');
  });

  it('shows plural-aware stock subtitles on POS SKU item cards', () => {
    setStoredSessionViewMode('pos');

    renderRoute(observations, `${RECORD_UPDATE_CUSTOMER_PENDING_PATH}?ticketMode=new`);

    const razorTile = getPosWorkbenchTile('Razor refill');
    const razorSubtitle = within(razorTile).getByText('(12 units left in stock)');

    expect(razorSubtitle).toHaveAttribute('data-slot', 'workbench-stock-subtitle');
    expect(razorSubtitle).toHaveClass('font-normal');
    expect(razorSubtitle).not.toHaveClass('font-semibold');
    expect(getPosWorkbenchTile('Haircut').querySelector('[data-slot="workbench-stock-subtitle"]')).toBeNull();
  });

  it('uses singular unit wording for POS SKU item card stock subtitles', () => {
    setStoredSessionViewMode('pos');

    renderRoute([
      {
        ...observations[0]!,
        input: {
          ...observations[0]!.input,
          stockSnapshot: [
            { skuId: 'sku-1', unitsInStock: 1, costPerUnit: 4, productPrice: 9 },
            { skuId: 'sku-2', unitsInStock: 4, costPerUnit: 2, productPrice: null },
          ],
        },
      },
    ], `${RECORD_UPDATE_CUSTOMER_PENDING_PATH}?ticketMode=new`);

    expect(within(getPosWorkbenchTile('Razor refill')).getByText('(1 unit left in stock)')).toBeInTheDocument();
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

  it('abbreviates large POS quantity pill values and keeps the full value available', async () => {
    setStoredSessionViewMode('pos');

    renderRoute(observations, `${RECORD_UPDATE_CUSTOMER_PENDING_PATH}?ticketMode=new`);

    fireEvent.click(getPosWorkbenchTile('Razor refill'));
    fireEvent.change(within(screen.getByRole('dialog', { name: 'Razor refill' })).getByLabelText('Quantity for Razor refill'), {
      target: { value: '6376.7223' },
    });
    fireEvent.click(within(screen.getByRole('dialog', { name: 'Razor refill' })).getByRole('button', { name: 'Add line' }));

    await waitFor(() => expect(screen.getByRole('button', { name: 'Edit Razor refill receipt line' })).toBeInTheDocument());

    const quantityLabel = getPosWorkbenchTile('Razor refill').querySelector('[data-slot="workbench-quantity-pill"]')?.firstElementChild;

    expect(quantityLabel).toHaveTextContent('6.4k');
    expect(quantityLabel).toHaveAttribute('title', '6,376');
    expect(quantityLabel).toHaveAttribute('aria-label', '6,376');
  });

  it('saves customer ticket completions with inventory count deltas', async () => {
    renderRoute(observations, `${RECORD_UPDATE_CUSTOMER_COMPLETED_PATH}?ticketMode=new`);

    fireEvent.click(getPosWorkbenchTile('Razor refill'));
    const dialog = screen.getByRole('dialog', { name: 'Razor refill' });
    fireEvent.change(within(dialog).getByLabelText('Quantity for Razor refill'), { target: { value: '2' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Add line' }));
    fireEvent.click(captureDoneButton());

    fireEvent.click(within(await screen.findByRole('dialog', { name: 'Confirm receipt' })).getByRole('button', { name: 'Confirm save' }));

    await waitFor(() => expect(ingestSenaObservation).toHaveBeenCalledTimes(1));
    expect(ingestSenaObservation).toHaveBeenCalledWith(expect.objectContaining({
      retailSalesSnapshot: [{ skuId: 'sku-1', unitsSold: 2 }],
      ticketEvents: [
        expect.objectContaining({
          eventType: 'fulfilled_immediate',
          ticketFamily: 'customer',
        }),
      ],
    }));
    expectSavedStockSnapshot([{ skuId: 'sku-1', unitsInStock: 10 }]);
  });

  it('renders Products Update POS with SKU and service update popups', () => {
    renderRoute();

    expect(screen.getByText('Changed items')).toBeInTheDocument();
    expect(screen.queryByText('Receipt')).not.toBeInTheDocument();
    expect(screen.getByText('Razor refill')).toBeInTheDocument();
    expect(screen.getByText('Towel')).toBeInTheDocument();
    expect(screen.getByText('Haircut')).toBeInTheDocument();
    expect(screen.getByText('Towel wrap')).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Services' })).toBeInTheDocument();

    fireEvent.click(getPosWorkbenchTile('Razor refill'));

    const dialog = screen.getByRole('dialog', { name: 'Razor refill' });
    expect(within(dialog).getByLabelText('Units in stock')).toHaveValue('12');
    expect(within(dialog).getByLabelText('Supplier cost per unit')).toHaveValue('4');
    expect(within(dialog).getByLabelText('Customer selling price')).toHaveValue('9');
    expect(within(dialog).getByRole('combobox', { name: 'Flags' })).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('combobox', { name: 'Flags' }));
    expect(screen.getByRole('listbox')).toHaveClass('z-[110]');
    fireEvent.click(screen.getByRole('option', { name: 'No event' }));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Done' }));

    fireEvent.click(getPosWorkbenchTile('Haircut'));
    const serviceDialog = screen.getByRole('dialog', { name: 'Haircut' });
    expect(within(serviceDialog).getByLabelText('Service price')).toHaveValue('12');
    expect(within(serviceDialog).getAllByText(/Linked SKUs/).length).toBeGreaterThan(0);
    expect(within(serviceDialog).getByText('Razor refill')).toBeInTheDocument();
    expect(within(serviceDialog).queryByText('Towel')).not.toBeInTheDocument();
    expect(within(serviceDialog).getByRole('combobox', { name: 'Flags' })).toBeInTheDocument();
  });

  it('saves comma-formatted Products Update POS SKU money values as numbers', async () => {
    renderRoute();

    fireEvent.click(getPosWorkbenchTile('Razor refill'));

    const dialog = screen.getByRole('dialog', { name: 'Razor refill' });
    fireEvent.change(within(dialog).getByLabelText('Supplier cost per unit'), { target: { value: '1,234.50' } });
    fireEvent.change(within(dialog).getByLabelText('Customer selling price'), { target: { value: '2,345.75' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Done' }));

    await waitFor(() => expect(screen.getByRole('button', { name: 'Clear session' })).toBeEnabled());

    fireEvent.click(captureDoneButton());
    const reviewDialog = await screen.findByRole('dialog', { name: 'Review update' });
    fireEvent.click(within(reviewDialog).getByRole('button', { name: 'Confirm save' }));

    await waitFor(() => expect(ingestSenaObservation).toHaveBeenCalledTimes(1));
    expect(ingestSenaObservation).toHaveBeenCalledWith(
      expect.objectContaining({
        stockSnapshot: [
          { skuId: 'sku-1', unitsInStock: 12, costPerUnit: 1234.5, productPrice: 2345.75 },
        ],
      }),
    );
  });

  it('keeps all stock-count workbench SKUs available when editing a scoped saved update', () => {
    const editableObservation = {
      ...observations[0]!,
      input: {
        ...observations[0]!.input,
        stockSnapshot: [
          { skuId: 'sku-1', unitsInStock: 11, costPerUnit: 4, productPrice: 9 },
        ],
      },
    };

    renderEditRouteWithSearch('?skus=sku-1', editableObservation);

    expect(visibleWorkbenchTileTitles()).toEqual(['Razor refill', 'Towel']);
    expect(screen.getByRole('button', { name: 'Edit Razor refill changed item' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Edit Towel changed item' })).not.toBeInTheDocument();
  });

  it('marks saved Products Update edit rows as changed when the saved update is the latest baseline', () => {
    const editableObservation = {
      ...observations[0]!,
      input: {
        ...observations[0]!.input,
        stockSnapshot: [
          { skuId: 'sku-1', unitsInStock: 11, costPerUnit: 4, productPrice: 9 },
        ],
      },
    };

    renderEditRoute(editableObservation, [editableObservation]);

    const razorTileVisual = getPosWorkbenchTile('Razor refill').querySelector('[data-slot="workbench-tile-visual"]');
    expect(razorTileVisual).toHaveClass('bg-foreground');
    expect(screen.getByRole('button', { name: 'Edit Razor refill changed item' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Edit Towel changed item' })).not.toBeInTheDocument();
  });

  it('marks restored Products Update draft rows as changed when touched keys match the latest baseline', async () => {
    window.localStorage.setItem(
      STOCK_UPDATE_DRAFT_STORAGE_KEY,
      JSON.stringify({
        version: 1,
        savedAt: '2026-04-03T12:01:00.000Z',
        customSelectedLaneIds: [],
        touchedPosMetadataPopupIds: [],
        posTouchedLineKeys: ['stock:sku-1'],
        currentStepId: 'stock',
        unlockedStepCount: 1,
        observedAt: '2026-04-03T12:01',
        notes: '',
        stockView: 'priority',
        rows: [
          { skuId: 'sku-1', unitsInStock: 12, costPerUnit: 4, productPrice: 9 },
        ],
      }),
    );

    renderRoute(observations);

    await waitFor(() => expect(screen.getByText('Draft resumed')).toBeInTheDocument());
    const razorTileVisual = getPosWorkbenchTile('Razor refill').querySelector('[data-slot="workbench-tile-visual"]');
    expect(razorTileVisual).toHaveClass('bg-foreground');
    expect(screen.getByRole('button', { name: 'Edit Razor refill changed item' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Edit Towel changed item' })).not.toBeInTheDocument();
  });

  it('keeps historical Products Update draft rows untouched when legacy drafts contain every row', async () => {
    window.localStorage.setItem(
      STOCK_UPDATE_DRAFT_STORAGE_KEY,
      JSON.stringify({
        version: 1,
        savedAt: '2026-04-03T12:01:00.000Z',
        customSelectedLaneIds: [],
        touchedPosMetadataPopupIds: [],
        currentStepId: 'stock',
        unlockedStepCount: 1,
        observedAt: '2026-04-03T12:01',
        notes: '',
        stockView: 'priority',
        rows: [
          { skuId: 'sku-1', unitsInStock: 12, costPerUnit: 4, productPrice: 9 },
          { skuId: 'sku-2', unitsInStock: 4, costPerUnit: 2, productPrice: null },
        ],
      }),
    );

    renderRoute(observations);

    await waitFor(() => expect(screen.getByText('Draft resumed')).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: 'Edit Razor refill changed item' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Edit Towel changed item' })).not.toBeInTheDocument();
  });

  it('marks restored Products Update draft rows for generated SKUs with no history as changed', async () => {
    const generatedCatalog = {
      ...catalog,
      skus: [
        {
          ...catalog.skus[0]!,
          skuId: 'generated:sku-1',
          name: 'Generated hotdog',
          supplierName: 'Mekong Looms',
          costPerUnit: 1.25,
          productPrice: 3,
        },
      ],
      services: [],
      sharingMask: [],
    };
    window.localStorage.setItem(
      STOCK_UPDATE_DRAFT_STORAGE_KEY,
      JSON.stringify({
        version: 1,
        savedAt: '2026-04-03T12:01:00.000Z',
        customSelectedLaneIds: [],
        touchedPosMetadataPopupIds: [],
        posTouchedLineKeys: ['stock:generated:sku-1'],
        currentStepId: 'stock',
        unlockedStepCount: 1,
        observedAt: '2026-04-03T12:01',
        notes: '',
        stockView: 'priority',
        rows: [
          { skuId: 'generated:sku-1', unitsInStock: 10, costPerUnit: 1.25, productPrice: 3 },
        ],
      }),
    );

    renderRouteWithCatalog(generatedCatalog, []);

    await waitFor(() => expect(screen.getByText('Draft resumed')).toBeInTheDocument());
    const generatedTileVisual = getPosWorkbenchTile('Generated hotdog').querySelector('[data-slot="workbench-tile-visual"]');
    expect(generatedTileVisual).toHaveClass('bg-foreground');
    expect(screen.getByRole('button', { name: 'Edit Generated hotdog changed item' })).toBeInTheDocument();
    expect(screen.getByText('Units')).toBeInTheDocument();
    expect(screen.getByText('10')).toBeInTheDocument();
  });

  it('keeps non-edit stock-count SKU deep links scoped to the target SKU', () => {
    renderRoute(observations, `${RECORD_UPDATE_STOCK_COUNT_PATH}?skus=sku-1`);

    expect(visibleWorkbenchTileTitles()).toEqual(['Razor refill']);
  });

  it('keeps the targeted stock tile flashing until tapped from a capture-session deep link', async () => {
    renderRoute(observations, `${RECORD_UPDATE_STOCK_COUNT_PATH}?targetAction=stock&targetType=sku&targetId=sku-1`);

    const razorTile = getPosWorkbenchTile('Razor refill');
    const tileVisual = razorTile.querySelector('[data-slot="workbench-tile-visual"]');

    expect(await screen.findByText('Main workbench')).toBeInTheDocument();
    expect(tileVisual).toHaveClass('ring-2');
    expect(tileVisual).toHaveClass('kaur-khor-capture-target-flash');
    expect(screen.queryByRole('dialog', { name: 'Razor refill' })).not.toBeInTheDocument();

    fireEvent.click(razorTile);

    const dialog = screen.getByRole('dialog', { name: 'Razor refill' });
    expect(within(dialog).getByLabelText('Units in stock')).toHaveValue('12');
    expect(tileVisual).not.toHaveClass('ring-2');
  });

  it('keeps the targeted supplier order tile flashing until tapped from a capture-session deep link', async () => {
    renderRoute(observations, `${RECORD_UPDATE_SUPPLIER_PENDING_PATH}?targetAction=supplier-order&targetType=sku&targetId=sku-1&ticketMode=new`);

    const razorTile = getPosWorkbenchTile('Razor refill');
    const tileVisual = razorTile.querySelector('[data-slot="workbench-tile-visual"]');

    expect(await screen.findByText('Main workbench')).toBeInTheDocument();
    expect(tileVisual).toHaveClass('ring-2');
    expect(tileVisual).toHaveClass('kaur-khor-capture-target-flash');
    expect(screen.queryByRole('dialog', { name: 'Razor refill' })).not.toBeInTheDocument();

    fireEvent.click(razorTile);

    const dialog = screen.getByRole('dialog', { name: 'Razor refill' });
    expect(within(dialog).getByText('Recommended order')).toBeInTheDocument();
    expect(within(dialog).getByText('8 units')).toBeInTheDocument();
    expect(within(dialog).getByText('Recommended range 6-10 units')).toBeInTheDocument();
    expect(within(dialog).getByLabelText('Quantity for Razor refill')).toBeInTheDocument();
    expect(tileVisual).not.toHaveClass('ring-2');
  });

  it('keeps customer order and immediate sale target tiles flashing until tapped from capture-session deep links', async () => {
    const { unmount } = renderRoute(observations, `${RECORD_UPDATE_CUSTOMER_PENDING_PATH}?targetAction=customer-order&targetType=service&targetId=service-1&ticketMode=new`);

    const serviceTile = getPosWorkbenchTile('Haircut');
    const serviceTileVisual = serviceTile.querySelector('[data-slot="workbench-tile-visual"]');

    expect(await screen.findByText('Main workbench')).toBeInTheDocument();
    expect(serviceTileVisual).toHaveClass('ring-2');
    expect(within(serviceTile).getByText('Haircut').closest('p')).not.toHaveClass('kaur-khor-capture-target-flash-text');
    expect(screen.queryByRole('dialog', { name: 'Haircut' })).not.toBeInTheDocument();

    fireEvent.click(serviceTile);

    expect(screen.getByRole('dialog', { name: 'Haircut' })).toBeInTheDocument();
    expect(serviceTileVisual).not.toHaveClass('ring-2');

    unmount();
    renderRoute(observations, `${RECORD_UPDATE_CUSTOMER_COMPLETED_PATH}?targetAction=immediate-sale&targetType=sku&targetId=sku-1&ticketMode=new`);

    const skuTile = getPosWorkbenchTile('Razor refill');
    const skuTileVisual = skuTile.querySelector('[data-slot="workbench-tile-visual"]');

    expect(await screen.findByText('Main workbench')).toBeInTheDocument();
    expect(skuTileVisual).toHaveClass('ring-2');
    expect(screen.queryByRole('dialog', { name: 'Razor refill' })).not.toBeInTheDocument();

    fireEvent.click(skuTile);

    expect(screen.getByRole('dialog', { name: 'Razor refill' })).toBeInTheDocument();
    expect(skuTileVisual).not.toHaveClass('ring-2');
  });

  it('opens SKU price targets in the stock-count POS workbench from capture-session deep links', async () => {
    renderRoute(observations, `${RECORD_UPDATE_STOCK_COUNT_PATH}?targetAction=sku-price&targetType=sku&targetId=sku-1`);

    const priceTile = getPosWorkbenchTile('Razor refill');
    const priceTileVisual = priceTile.querySelector('[data-slot="workbench-tile-visual"]');

    expect(await screen.findByText('Main workbench')).toBeInTheDocument();
    expect(priceTileVisual).toHaveClass('ring-2');
    expect(screen.queryByRole('dialog', { name: 'Razor refill' })).not.toBeInTheDocument();

    fireEvent.click(priceTile);

    const skuDialog = screen.getByRole('dialog', { name: 'Razor refill' });
    expect(within(skuDialog).getByLabelText('Customer selling price')).toHaveClass('ring-2');
    expect(priceTileVisual).not.toHaveClass('ring-2');
  });

  it('opens service price targets in Products Update and saves service price plus stockout flags', async () => {
    renderRoute(observations, `${RECORD_UPDATE_STOCK_COUNT_PATH}?targetAction=service-price&targetType=service&targetId=service-1`);

    const serviceTile = getPosWorkbenchTile('Haircut');
    const serviceTileVisual = serviceTile.querySelector('[data-slot="workbench-tile-visual"]');

    expect(await screen.findByText('Main workbench')).toBeInTheDocument();
    expect(serviceTileVisual).toHaveClass('ring-2');
    expect(screen.queryByRole('dialog', { name: 'Haircut' })).not.toBeInTheDocument();

    fireEvent.click(serviceTile);

    const serviceDialog = screen.getByRole('dialog', { name: 'Haircut' });
    expect(within(serviceDialog).getByLabelText('Service price')).toHaveClass('ring-2');
    fireEvent.change(within(serviceDialog).getByLabelText('Service price'), { target: { value: '15' } });
    fireEvent.click(within(serviceDialog).getByRole('combobox', { name: 'Flags' }));
    fireEvent.click(screen.getByRole('option', { name: 'Stockout' }));
    fireEvent.click(within(serviceDialog).getByRole('button', { name: 'Done' }));

    expect(screen.getByRole('button', { name: 'Edit Haircut changed item' })).toBeInTheDocument();
    expect(screen.getByText('$12.00 → $15.00')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Clear session' })).toBeEnabled());

    fireEvent.click(captureDoneButton());
    const reviewDialog = await screen.findByRole('dialog', { name: 'Review update' });
    fireEvent.click(within(reviewDialog).getByRole('button', { name: 'Confirm save' }));

    await waitFor(() => expect(ingestSenaObservation).toHaveBeenCalledTimes(1));
    expect(ingestSenaObservation).toHaveBeenCalledWith(
      expect.objectContaining({
        servicePrices: [{ serviceId: 'service-1', price: 15 }],
        serviceStockouts: ['service-1'],
      }),
    );
  });

  it('does not save unchanged service prices from Products Update flags', async () => {
    renderRoute(observations, `${RECORD_UPDATE_STOCK_COUNT_PATH}?targetAction=service-price&targetType=service&targetId=service-1`);

    fireEvent.click(getPosWorkbenchTile('Haircut'));

    const serviceDialog = screen.getByRole('dialog', { name: 'Haircut' });
    fireEvent.change(within(serviceDialog).getByLabelText('Service price'), { target: { value: '12' } });
    fireEvent.click(within(serviceDialog).getByRole('combobox', { name: 'Flags' }));
    fireEvent.click(screen.getByRole('option', { name: 'Stockout' }));
    fireEvent.click(within(serviceDialog).getByRole('button', { name: 'Done' }));

    await waitFor(() => expect(screen.getByRole('button', { name: 'Clear session' })).toBeEnabled());

    fireEvent.click(captureDoneButton());
    const reviewDialog = await screen.findByRole('dialog', { name: 'Review update' });
    fireEvent.click(within(reviewDialog).getByRole('button', { name: 'Confirm save' }));

    await waitFor(() => expect(ingestSenaObservation).toHaveBeenCalledTimes(1));
    expect(ingestSenaObservation).toHaveBeenCalledWith(
      expect.objectContaining({
        servicePrices: [],
        serviceStockouts: ['service-1'],
      }),
    );
  });

  it('keeps embedded phone target row content steady while the card glow flashes', async () => {
    document.documentElement.dataset.kaurKhorEmbeddedPhonePortrait = 'true';

    renderRoute(observations, `${RECORD_UPDATE_CUSTOMER_COMPLETED_PATH}?targetAction=immediate-sale&targetType=service&targetId=service-1&ticketMode=new`);

    const serviceTile = getPosWorkbenchTile('Haircut');
    const tileVisual = serviceTile.querySelector('[data-slot="workbench-tile-visual"]');

    expect(await screen.findByText('Main workbench')).toBeInTheDocument();
    expect(tileVisual).toHaveClass('ring-2');
    expect(tileVisual).toHaveClass('kaur-khor-capture-target-flash');
    expect(within(serviceTile).getByText('Haircut').closest('p')).not.toHaveClass('kaur-khor-capture-target-flash-text');
    expect(serviceTile.querySelector('[data-slot="workbench-tile-visual"] [class*="kaur-khor-capture-target-flash-media"]')).not.toBeInTheDocument();
    expect(within(serviceTile).getByText('Price $12.00')).not.toHaveClass('kaur-khor-capture-target-flash-text');
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

      expect(screen.getAllByRole('button', { name: 'Done' }).length).toBeGreaterThan(0);
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

    expect(visibleWorkbenchTileTitles()).toEqual(['Towel', 'Razor refill', 'Haircut', 'Towel wrap']);
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

      expect(screen.getAllByRole('button', { name: 'Done' }).length).toBeGreaterThan(0);
      fireEvent.click(screen.getByRole('button', { name: 'Save ordering first' }));

      expect(screen.getByText('Save ordering first?')).toBeInTheDocument();
      expect(
        screen.getByText('Finish and save this card ordering before doing anything else in POS view.'),
      ).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it('opens the save-ordering prompt when clicking outside the workbench during reorder mode', () => {
    vi.useFakeTimers();

    try {
      renderRoute(observations, `${RECORD_UPDATE_CUSTOMER_PENDING_PATH}?ticketMode=new`);

      fireEvent.pointerDown(getPosWorkbenchTile('Razor refill'));
      act(() => {
        vi.advanceTimersByTime(350);
      });
      fireEvent.pointerUp(getPosWorkbenchTile('Razor refill'));

      expect(screen.getByRole('button', { name: 'Save ordering first' })).toBeInTheDocument();
      expect(screen.queryByText('Save ordering first?')).not.toBeInTheDocument();

      fireEvent.pointerDown(screen.getByText('Receipt'));

      expect(screen.getByText('Save ordering first?')).toBeInTheDocument();
      expect(
        screen.getByText('Finish and save this card ordering before doing anything else in POS view.'),
      ).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it('keeps embedded phone workbench row cards draggable in reorder mode', () => {
    vi.useFakeTimers();
    document.documentElement.dataset.kaurKhorEmbeddedPhonePortrait = 'true';

    try {
      renderRoute();

      const razorTile = getPosWorkbenchTile('Razor refill');
      expect(razorTile).not.toHaveClass('touch-none');

      fireEvent.pointerDown(razorTile);
      act(() => {
        vi.advanceTimersByTime(350);
      });
      expect(razorTile).not.toHaveClass('touch-none');
      expect(screen.queryByRole('button', { name: 'Save ordering first' })).not.toBeInTheDocument();

      act(() => {
        vi.advanceTimersByTime(650);
      });
      fireEvent.pointerUp(razorTile);

      expect(razorTile).toHaveClass('touch-none');
      expect(razorTile).toHaveClass('select-none');
      expect(razorTile).toHaveClass('cursor-grab');
    } finally {
      vi.useRealTimers();
    }
  });

  it('does not enter embedded phone reorder mode while scrolling workbench rows', () => {
    vi.useFakeTimers();
    document.documentElement.dataset.kaurKhorEmbeddedPhonePortrait = 'true';

    try {
      renderRoute();

      const razorTile = getPosWorkbenchTile('Razor refill');
      fireEvent.pointerDown(razorTile, { clientX: 20, clientY: 20, pointerId: 1 });
      fireEvent.pointerMove(razorTile, { clientX: 20, clientY: 48, pointerId: 1 });
      act(() => {
        vi.advanceTimersByTime(1000);
      });
      fireEvent.pointerUp(razorTile, { clientX: 20, clientY: 48, pointerId: 1 });

      expect(razorTile).not.toHaveClass('touch-none');
      expect(screen.queryByRole('button', { name: 'Save ordering first' })).not.toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it('puts embedded phone draft status beside the capture title', () => {
    document.documentElement.dataset.kaurKhorEmbeddedPhonePortrait = 'true';
    const header = document.createElement('header');
    header.innerHTML = `
      <h1 data-slot="embedded-phone-header-title">Products Update <span data-slot="embedded-phone-capture-header-title-meta"></span></h1>
      <div data-slot="embedded-phone-capture-header-actions"></div>
      <div data-slot="embedded-phone-capture-header-meta"></div>
    `;
    document.body.appendChild(header);

    try {
      renderRoute();
      fireEvent.click(getPosWorkbenchTile('Razor refill'));
      const dialog = screen.getByRole('dialog', { name: 'Razor refill' });
      fireEvent.change(within(dialog).getByLabelText('Units in stock'), { target: { value: '15' } });
      fireEvent.click(within(dialog).getByRole('button', { name: 'Done' }));

      expect(header.querySelector('[data-slot="embedded-phone-capture-header-title-meta"]')).toHaveTextContent('(Draft will save on exit)');
      expect(header.querySelector('[data-slot="embedded-phone-capture-header-meta"]')).not.toHaveTextContent('Draft will save on exit');
    } finally {
      header.remove();
    }
  });

  it('shows only changed stock-count fields in the POS summary and reopens the popup from the changed row', async () => {
    const { container } = renderRoute();

    fireEvent.click(getPosWorkbenchTile('Razor refill'));

    const dialog = screen.getByRole('dialog', { name: 'Razor refill' });
    fireEvent.change(within(dialog).getByLabelText('Units in stock'), { target: { value: '15' } });
    fireEvent.change(within(dialog).getByLabelText('Supplier cost per unit'), { target: { value: '6' } });
    fireEvent.click(within(dialog).getByRole('combobox', { name: 'Flags' }));
    fireEvent.click(screen.getByRole('option', { name: 'Stockout' }));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Done' }));

    expect(screen.getByRole('button', { name: 'Edit Razor refill changed item' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Edit Towel changed item' })).not.toBeInTheDocument();
    expect(screen.getByText('12 → 15')).toBeInTheDocument();
    expect(screen.getByText('$4.00 → $6.00')).toBeInTheDocument();
    expect(screen.getByText('Stockout')).toBeInTheDocument();
    expect(screen.queryByText('Retail')).not.toBeInTheDocument();
    expect(container.querySelector('[data-slot="headered-table"]')).toHaveAttribute('data-overflow-x', 'auto');

    fireEvent.click(screen.getByRole('button', { name: 'Edit Razor refill changed item' }));
    await screen.findByRole('dialog', { name: 'Razor refill' });
  });

  it('keeps Products Update changed items visible when workbench filtering excludes the tile', () => {
    renderRoute();

    fireEvent.click(getPosWorkbenchTile('Towel'));

    const dialog = screen.getByRole('dialog', { name: 'Towel' });
    fireEvent.change(within(dialog).getByLabelText('Units in stock'), { target: { value: '9' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Done' }));

    const workbench = screen.getByText('Main workbench').closest('section');
    expect(workbench).not.toBeNull();
    fireEvent.change(within(workbench!).getByRole('searchbox', { name: 'Search workbench items' }), { target: { value: 'Razor' } });

    expect(within(workbench!).queryByText('Towel')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Edit Towel changed item' })).toBeInTheDocument();
    expect(screen.getByText('4 → 9')).toBeInTheDocument();
  });

  it('uses a stacked changed-item summary on embedded phone capture sessions', () => {
    document.documentElement.dataset.kaurKhorEmbeddedPhonePortrait = 'true';

    renderRoute();

    fireEvent.click(getPosWorkbenchTile('Razor refill'));
    const dialog = screen.getByRole('dialog', { name: 'Razor refill' });
    fireEvent.change(within(dialog).getByLabelText('Units in stock'), { target: { value: '15' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Done' }));

    const changedItem = screen.getByRole('button', { name: 'Edit Razor refill changed item' });
    expect(changedItem).toHaveClass('rounded-[1.2rem]', 'px-4', 'py-4');
    expect(changedItem.querySelector('[data-slot="headered-table-mobile-label"]')).toBeNull();
    expect(document.querySelector('[data-slot="headered-table"]')).toBeNull();
    expect(within(changedItem).getByText('Changed')).toBeInTheDocument();
    expect(within(changedItem).getByText('Details')).toBeInTheDocument();
  });

  it('uses a stock-count review dialog without clipboard actions and saves the shared stock payload', async () => {
    renderRoute();

    fireEvent.click(getPosWorkbenchTile('Razor refill'));
    const razorDialog = screen.getByRole('dialog', { name: 'Razor refill' });
    fireEvent.change(within(razorDialog).getByLabelText('Units in stock'), { target: { value: '15' } });
    fireEvent.click(within(razorDialog).getByRole('button', { name: 'Done' }));

    fireEvent.click(getPosWorkbenchTile('Towel'));
    const towelDialog = screen.getByRole('dialog', { name: 'Towel' });
    expect(within(towelDialog).queryByLabelText('Customer selling price')).not.toBeInTheDocument();
    fireEvent.click(within(towelDialog).getByRole('combobox', { name: 'Flags' }));
    fireEvent.click(screen.getByRole('option', { name: 'Blocked' }));
    fireEvent.click(within(towelDialog).getByRole('button', { name: 'Done' }));

    fireEvent.click(captureDoneButton());

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
    expect(getPosWorkbenchTile('Razor refill')).toHaveAttribute('data-workbench-tile-key', 'supplier-order:sku-1');
    expect(getPosWorkbenchTile('Razor refill')).toHaveClass('aspect-square');
    expect(
      screen.getByText('Tap a tile to set quantity. Drag a card to rearrange this bucket.'),
    ).toBeInTheDocument();
  });

  it('activates batch capture targets and keeps their POS card flashing until clicked', async () => {
    renderRoute(
      observations,
      `${RECORD_UPDATE_SUPPLIER_PENDING_PATH}?ticketMode=new&skus=sku-1&flashTargets=supplier-order%3Asku-1`,
    );

    const razorTile = getPosWorkbenchTile('Razor refill');
    const tileVisual = razorTile.querySelector('[data-slot="workbench-tile-visual"]');

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Edit Razor refill receipt line' })).toBeInTheDocument();
    });
    expect(tileVisual).toHaveClass('ring-2');
    expect(tileVisual).toHaveClass('kaur-khor-capture-target-flash');
    expect(tileVisual).not.toHaveClass('bg-foreground');
    expect(getPosWorkbenchTile('Towel')).toBeInTheDocument();

    fireEvent.click(razorTile);

    expect(screen.getByRole('dialog', { name: 'Razor refill' })).toBeInTheDocument();
    expect(tileVisual).not.toHaveClass('ring-2');
  });

  it('keeps all POS cards visible while flashing existing ticket batch targets', async () => {
    renderRoute(
      observations,
      `${RECORD_UPDATE_SUPPLIER_PENDING_PATH}?ticketMode=edit&ticketId=ticket-supplier-1&skus=sku-1&flashTargets=supplier-order%3Asku-1`,
    );

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Edit Razor refill receipt line' })).toBeInTheDocument();
    });
    expect(getPosWorkbenchTile('Razor refill')).toBeInTheDocument();
    expect(getPosWorkbenchTile('Towel')).toBeInTheDocument();
  });

  it('shows the supplier filter and supplier pills in the supplier order POS workbench', () => {
    renderRoute(observations, RECORD_UPDATE_SUPPLIER_PENDING_PATH);

    const workbench = screen.getByText('Main workbench').closest('section');
    expect(workbench).not.toBeNull();
    const scopedWorkbench = within(workbench!);

    expect(scopedWorkbench.getByRole('combobox', { name: 'Filter by supplier' })).toBeInTheDocument();
    expect(getPosWorkbenchTile('Razor refill')).toHaveTextContent('Mekong Looms');
    expect(getPosWorkbenchTile('Towel')).toHaveTextContent('No supplier');

    fireEvent.click(scopedWorkbench.getByRole('combobox', { name: 'Filter by supplier' }));
    fireEvent.click(screen.getByRole('option', { name: 'Mekong Looms' }));

    expect(getPosWorkbenchTile('Razor refill')).toBeInTheDocument();
    expect(scopedWorkbench.queryByText('Towel')).not.toBeInTheDocument();
  });

  it('keeps supplier ticket POS item cards visible when the supplier filter excludes them', async () => {
    setStoredSessionViewMode('pos');
    const editObservation: SenaObservationRecord = {
      ...observations[0]!,
      observationId: 'obs-supplier-ticket-filtered-edit',
      input: {
        ...observations[0]!.input,
        ticketEvents: [{
          ...supplierTicketRecord('supplier-ticket-filtered-edit'),
          lines: supplierTicketRecord('supplier-ticket-filtered-edit').lines.filter((line) => line.entityId === 'sku-2'),
        }],
      },
    };

    renderEditRoute(editObservation, [editObservation], RECORD_UPDATE_SUPPLIER_PENDING_PATH);

    const workbench = await screen.findByText('Main workbench');
    const scopedWorkbench = within(workbench.closest('section')!);
    fireEvent.click(scopedWorkbench.getByRole('combobox', { name: 'Filter by supplier' }));
    fireEvent.click(screen.getByRole('option', { name: 'Mekong Looms' }));

    await waitFor(() => {
      expect(document.querySelector('[data-workbench-tile-key="supplier-order:sku-2"] [data-slot="workbench-quantity-pill"]')).toHaveTextContent('3');
    });
    expect(getPosWorkbenchTile('Towel')).toBeInTheDocument();
  });

  it('shows the supplier filter in the supplier receipt POS workbench', () => {
    renderRoute(observations, RECORD_UPDATE_SUPPLIER_RECEIPT_PATH);

    const workbench = screen.getByText('Main workbench').closest('section');
    expect(workbench).not.toBeNull();
    const scopedWorkbench = within(workbench!);

    expect(scopedWorkbench.getByRole('combobox', { name: 'Filter by supplier' })).toBeInTheDocument();
    expect(getPosWorkbenchTile('Razor refill')).toBeInTheDocument();
    expect(getPosWorkbenchTile('Towel')).toBeInTheDocument();

    fireEvent.click(scopedWorkbench.getByRole('combobox', { name: 'Filter by supplier' }));
    fireEvent.click(screen.getByRole('option', { name: 'Mekong Looms' }));

    expect(getPosWorkbenchTile('Razor refill')).toBeInTheDocument();
    expect(scopedWorkbench.queryByText('Towel')).not.toBeInTheDocument();
  });

  it('sizes the POS workbench drag overlay from the active tile instead of the viewport', () => {
    const source = readFileSync(resolve(process.cwd(), 'src/renderer/src/routes/stock-update-session.tsx'), 'utf8');

    expect(source).not.toContain("w-[min(20rem,32vw)]");
    expect(source).toContain('data-workbench-tile-key={tile.key}');
    expect(source).toContain('getBoundingClientRect()');
    expect(source).toContain('style={activeWorkbenchDragSize ?? undefined}');
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

      expect(screen.getAllByRole('button', { name: 'Done' }).length).toBeGreaterThan(0);
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
      screen.getByText('Count at least one SKU before continuing so Kaur Khor can anchor the first update.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Done' }).parentElement as HTMLElement);
    expect(screen.getByText('Count at least one SKU before continuing so Kaur Khor can anchor the first update.')).toHaveAttribute('data-error-flash-key', '1');
    expect(screen.getByText('Count at least one SKU before continuing so Kaur Khor can anchor the first update.')).toHaveClass('motion-safe:animate-[kaur-khor-save-error-flash_1800ms_ease-in-out_1]');

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
    expect(screen.getByLabelText('Current order for Razor refill')).toHaveAttribute('placeholder', 'Kaur Khor recommends 8 units.');
    expect(screen.getByLabelText('Expected time of arrival')).toHaveAttribute('placeholder', '6');
    expect(screen.queryByText('Kaur Khor recommends 8 units.')).not.toBeInTheDocument();
    const variabilitySelect = screen.getByRole('combobox', { name: 'ETA variation' });
    fireEvent.click(variabilitySelect);
    expect(screen.getByRole('option', { name: /Very tight/i })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('option', { name: 'Custom' }));
    expect(variabilitySelect).toHaveTextContent('Custom');
    expect(screen.getByLabelText('Custom ETA variation days')).toBeInTheDocument();
    expect(screen.getByLabelText('Custom ETA variation hours')).toBeInTheDocument();
    expect(screen.getByText('d')).toBeInTheDocument();
    expect(screen.getByText('hr')).toBeInTheDocument();
    fireEvent.click(variabilitySelect);
    fireEvent.click(screen.getByRole('option', { name: /^Tight\b/i }));
    expect(variabilitySelect).toHaveTextContent(/Tight/i);

    fireEvent.change(screen.getByLabelText('Current order for Razor refill'), { target: { value: '1,000' } });
    const expectedArrivalInput = screen.getByLabelText('Expected date of arrival');
    const initialExpectedArrival = (expectedArrivalInput as HTMLInputElement).value;
    fireEvent.change(screen.getByLabelText('Expected time of arrival'), { target: { value: '1,000.5' } });
    await waitFor(() => expect(expectedArrivalInput).not.toHaveValue(initialExpectedArrival));
    fireEvent.change(expectedArrivalInput, { target: { value: '2026-04-18' } });

    goNext();
    goNext();
    chooseOptionalStepNo();
    goNext();

    expect(screen.getAllByRole('button', { name: /Review update/i }).find((button) => button.getAttribute('aria-current') === 'step')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Save update' }));

    await waitFor(() => expect(ingestSenaObservation).toHaveBeenCalledTimes(1));
    expect(ingestSenaObservation).toHaveBeenCalledWith(
      expect.objectContaining({
        orderSignals: [
          expect.objectContaining({
            approximateOrderQuantity: 1000,
            leadTimeDaysHint: 1000.5,
            orderPlaced: true,
            receiptArrived: false,
            receiptTimestamp: expect.any(String),
            skuId: 'sku-1',
          }),
        ],
        leadTimeHints: [
          expect.objectContaining({
            skuId: 'sku-1',
            typicalDays: 1000.5,
            variabilityClass: 'tight',
          }),
        ],
      }),
    );
  }, 10000);

  it('drops invalid supplier ETA number drafts before building lead-time data', () => {
    expect(parseOptionalNonNegativeFiniteNumberDraft('7')).toBe(7);
    expect(parseOptionalNonNegativeFiniteNumberDraft('1,000.5')).toBe(1000.5);
    expect(parseOptionalNonNegativeFiniteNumberDraft('')).toBeNull();
    expect(parseOptionalNonNegativeFiniteNumberDraft('-2')).toBeNull();
    expect(parseOptionalNonNegativeFiniteNumberDraft('Infinity')).toBeNull();
  });

  it('does not turn invalid stock unit drafts into NaN row values', () => {
    expect(parseStockUnitsDraft('', 12)).toBe(12);
    expect(parseStockUnitsDraft('1,000', 12)).toBe(1000);
    expect(parseStockUnitsDraft('Infinity', 12)).toBeNull();
    expect(parseStockUnitsDraft('not a number', 12)).toBeNull();
  });

  it('does not turn invalid stock money drafts into NaN row values', () => {
    expect(parseStockMoneyDraft('', 4, 'USD', 4000)).toBe(4);
    expect(parseStockMoneyDraft('1,000.50', 4, 'USD', 4000)).toBe(1000.5);
    expect(parseStockMoneyDraft('Infinity', 4, 'USD', 4000)).toBeNull();
    expect(parseStockMoneyDraft('not a number', 4, 'USD', 4000)).toBeNull();
  });

  it('does not turn invalid service price drafts into NaN service prices', () => {
    expect(parseServicePriceDraft('1,000.50', 'USD', 4000)).toBe(1000.5);
    expect(parseServicePriceDraft('', 'USD', 4000)).toBeNull();
    expect(parseServicePriceDraft('Infinity', 'USD', 4000)).toBeNull();
    expect(parseServicePriceDraft('not a number', 'USD', 4000)).toBeNull();
  });

  it('does not prefill POS ticket drafts from non-finite ticket line quantities', () => {
    expect(customerTicketLineDraftQuantity({ entityType: 'sku', entityId: 'sku-1', quantityDelta: Number.NaN })).toBeNull();
    expect(customerTicketLineDraftQuantity({ entityType: 'sku', entityId: 'sku-1', orderedQuantity: 2 })).toBe(2);
    expect(supplierTicketOrderedDraftQuantity({ entityType: 'sku', entityId: 'sku-1', orderedQuantity: Infinity })).toBeNull();
    expect(supplierTicketOrderedDraftQuantity({ entityType: 'sku', entityId: 'sku-1', quantityDelta: 4 })).toBe(4);
    expect(supplierTicketReceiptDraftQuantity({ entityType: 'sku', entityId: 'sku-1', receivedQuantity: Number.NaN, orderedQuantity: 5 })).toBe(5);
  });

  it('uses the hub-selected customer ticket mode without re-showing the entry chooser', () => {
    renderRoute(observations, `${RECORD_UPDATE_CUSTOMER_PENDING_PATH}?ticketMode=new`);

    expect(screen.queryByRole('button', { name: 'New' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Edit/Update' })).not.toBeInTheDocument();
    expect(screen.getByText('Main workbench')).toBeInTheDocument();
  });

  it('shows customer data and notes in separate POS popups', () => {
    renderRoute(observations, `${RECORD_UPDATE_CUSTOMER_PENDING_PATH}?ticketMode=new`);

    openPosMetadataPopup(/^Customer/i);
    const customerDialog = posMetadataDialog();
    expect(within(customerDialog).getByRole('heading', { name: 'Customer metadata' })).toBeInTheDocument();
    expect(within(customerDialog).queryByLabelText('Report notes')).not.toBeInTheDocument();
    fireEvent.click(within(customerDialog).getByLabelText('Communication channel'));
    fireEvent.click(screen.getByRole('option', { name: 'Instagram' }));
    expect(within(customerDialog).getByLabelText('Communication channel')).toHaveTextContent('Instagram');
    expect(within(customerDialog).getByLabelText('Location')).toHaveAttribute(
      'placeholder',
      'Google Maps link or manual address',
    );
    fireEvent.change(within(customerDialog).getByLabelText('Location'), {
      target: { value: '123 Riverside Lane' },
    });
    expect(within(customerDialog).getByLabelText('Location')).toHaveValue('123 Riverside Lane');

    openPosMetadataPopup(/^Notes/i);
    expect(within(posMetadataDialog()).getByRole('heading', { name: 'Report notes' })).toBeInTheDocument();
    expect(within(posMetadataDialog()).getByLabelText('Report notes')).toBeInTheDocument();
    expect(within(posMetadataDialog()).queryByLabelText('Communication channel')).not.toBeInTheDocument();
  });

  it('shows date-based ETA controls in POS Timing for pending supplier and customer orders only', () => {
    const supplierView = renderRoute(observations, `${RECORD_UPDATE_SUPPLIER_PENDING_PATH}?ticketMode=new`);

    openPosMetadataPopup(/^Timing/i);
    expect(within(posMetadataDialog()).getByLabelText('Observed at')).toBeInTheDocument();
    expect(within(posMetadataDialog()).getByLabelText('Expected date of arrival')).toBeInTheDocument();
    expect(within(posMetadataDialog()).getByRole('combobox', { name: 'ETA variation' })).toBeInTheDocument();
    expect(within(posMetadataDialog()).queryByLabelText('Expected time of arrival')).not.toBeInTheDocument();
    expect(
      within(posMetadataDialog()).getByLabelText('Expected date of arrival').compareDocumentPosition(
        within(posMetadataDialog()).getByRole('combobox', { name: 'ETA variation' }),
      ) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    supplierView.unmount();

    const customerPendingView = renderRoute(observations, `${RECORD_UPDATE_CUSTOMER_PENDING_PATH}?ticketMode=new`);

    openPosMetadataPopup(/^Timing/i);
    expect(within(posMetadataDialog()).getByLabelText('Observed at')).toBeInTheDocument();
    expect(within(posMetadataDialog()).getByLabelText('Expected date of arrival')).toBeInTheDocument();
    expect(within(posMetadataDialog()).getByRole('combobox', { name: 'ETA variation' })).toBeInTheDocument();
    expect(within(posMetadataDialog()).queryByLabelText('Expected time of arrival')).not.toBeInTheDocument();
    customerPendingView.unmount();

    renderRoute(observations, RECORD_UPDATE_CUSTOMER_COMPLETED_PATH);

    openPosMetadataPopup(/^Timing/i);
    expect(within(posMetadataDialog()).getByLabelText('Observed at')).toBeInTheDocument();
    expect(within(posMetadataDialog()).queryByLabelText('Expected date of arrival')).not.toBeInTheDocument();
    expect(within(posMetadataDialog()).queryByRole('combobox', { name: 'ETA variation' })).not.toBeInTheDocument();
  });

  it('clamps supplier POS expected arrival to the observed local date', () => {
    renderRoute(observations, `${RECORD_UPDATE_SUPPLIER_PENDING_PATH}?ticketMode=new`);

    openPosMetadataPopup(/^Timing/i);
    const dialog = posMetadataDialog();
    fireEvent.change(within(dialog).getByLabelText('Observed at'), {
      target: { value: '2026-05-09T08:59' },
    });
    const expectedArrivalInput = within(dialog).getByLabelText('Expected date of arrival');

    expect(expectedArrivalInput).toHaveAttribute('min', '2026-05-09');

    fireEvent.change(expectedArrivalInput, { target: { value: '2026-05-01' } });

    expect(expectedArrivalInput).toHaveValue('2026-05-09');
  });

  it('clamps customer POS expected arrival to the observed local date', () => {
    renderRoute(observations, `${RECORD_UPDATE_CUSTOMER_PENDING_PATH}?ticketMode=new`);

    openPosMetadataPopup(/^Timing/i);
    const dialog = posMetadataDialog();
    fireEvent.change(within(dialog).getByLabelText('Observed at'), {
      target: { value: '2026-05-09T08:59' },
    });
    const expectedArrivalInput = within(dialog).getByLabelText('Expected date of arrival');

    expect(expectedArrivalInput).toHaveAttribute('min', '2026-05-09');

    fireEvent.change(expectedArrivalInput, { target: { value: '2026-05-01' } });

    expect(expectedArrivalInput).toHaveValue('2026-05-09');
  });

  it('shows expected arrivals for every selected supplier order item in POS Timing', async () => {
    renderRoute(
      observations,
      `${RECORD_UPDATE_SUPPLIER_PENDING_PATH}?ticketMode=new&skus=sku-1%2Csku-2&flashTargets=supplier-order%3Asku-1%2Csupplier-order%3Asku-2`,
    );

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Edit Razor refill receipt line' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Edit Towel receipt line' })).toBeInTheDocument();
    });

    openPosMetadataPopup(/^Timing/i);

    const dialog = posMetadataDialog();
    expect(within(dialog).getByText('Suggested Expected Arrivals')).toBeInTheDocument();
    expect(within(dialog).getByText("Calculated from each item's settings.")).toBeInTheDocument();
    expect(within(dialog).getByText('Razor refill')).toBeInTheDocument();
    expect(within(dialog).getByText('Towel')).toBeInTheDocument();
    expect(within(dialog).getAllByText(/ETA:/)).toHaveLength(2);
    expect(within(dialog).getAllByText(/Variation:/)).toHaveLength(2);
    expect(within(dialog).queryByText(/ETA variation:/)).not.toBeInTheDocument();
    expect(within(dialog).getByText('Razor refill')).toHaveClass('whitespace-normal');
    expect(within(dialog).getByText('Razor refill')).toHaveClass('break-words');

    fireEvent.click(within(dialog).getByRole('button', { name: 'Apply suggested expected arrival for Towel' }));

    expect(within(dialog).getByLabelText('Expected date of arrival')).toHaveValue('2026-05-13');
    expect(within(dialog).getByRole('combobox', { name: 'ETA variation' })).toHaveTextContent('Custom');
  });

  it('does not apply suggested supplier POS arrivals before the observed local date', async () => {
    renderRoute(
      observations,
      `${RECORD_UPDATE_SUPPLIER_PENDING_PATH}?ticketMode=new&skus=sku-1%2Csku-2&flashTargets=supplier-order%3Asku-1%2Csupplier-order%3Asku-2`,
    );

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Edit Razor refill receipt line' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Edit Towel receipt line' })).toBeInTheDocument();
    });

    openPosMetadataPopup(/^Timing/i);
    const dialog = posMetadataDialog();
    fireEvent.change(within(dialog).getByLabelText('Observed at'), {
      target: { value: '2026-05-30T08:59' },
    });

    fireEvent.click(within(dialog).getByRole('button', { name: 'Apply suggested expected arrival for Towel' }));

    expect(within(dialog).getByLabelText('Expected date of arrival')).toHaveValue('2026-06-03');
  });

  it('routes supplier and customer POS orders to Timing until EDA and ETA variation are filled', async () => {
    const supplierView = renderRoute(observations, `${RECORD_UPDATE_SUPPLIER_PENDING_PATH}?ticketMode=new`);

    fireEvent.click(getPosWorkbenchTile('Razor refill'));
    fireEvent.click(within(screen.getByRole('dialog', { name: 'Razor refill' })).getByRole('button', { name: 'Add line' }));
    fireEvent.click(captureDoneButton());

    let dialog = posMetadataDialog();
    const supplierWarning = within(dialog).getByText('Fill out Expected Date of Arrival and ETA Variation first.');
    expect(within(dialog).getByRole('heading', { name: 'Observed at' })).toBeInTheDocument();
    expect(
      supplierWarning.compareDocumentPosition(within(dialog).getByText('Date and time')) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(screen.queryByRole('dialog', { name: 'Confirm receipt' })).not.toBeInTheDocument();

    fireEvent.change(within(dialog).getByLabelText('Expected date of arrival'), {
      target: { value: '2026-04-18' },
    });
    await waitFor(() => {
      expect(within(dialog).queryByText('Fill out Expected Date of Arrival and ETA Variation first.')).not.toBeInTheDocument();
    });
    supplierView.unmount();

    renderRoute(observations, `${RECORD_UPDATE_CUSTOMER_PENDING_PATH}?ticketMode=new`);

    fireEvent.click(getPosWorkbenchTile('Razor refill'));
    fireEvent.click(within(screen.getByRole('dialog', { name: 'Razor refill' })).getByRole('button', { name: 'Add line' }));
    fireEvent.click(captureDoneButton());

    dialog = posMetadataDialog();
    expect(within(dialog).getByText('Fill out Expected Date of Arrival and ETA Variation first.')).toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: 'Confirm receipt' })).not.toBeInTheDocument();

    fireEvent.change(within(dialog).getByLabelText('Expected date of arrival'), {
      target: { value: '2026-04-18' },
    });
    await waitFor(() => {
      expect(within(dialog).queryByText('Fill out Expected Date of Arrival and ETA Variation first.')).not.toBeInTheDocument();
    });
  });

  it('uses dark metadata card headers and lighter summaries in POS capture headers', () => {
    const observationsWithCustomers = [{
      ...observations[0]!,
      input: {
        ...observations[0]!.input,
        ticketEvents: [
          {
            ticketId: 'customer-ticket-dara-1',
            ticketFamily: 'customer',
            lifecycle: 'open',
            stage: 'pending',
            revision: 1,
            eventType: 'created',
            occurredAt: '2026-04-05T09:00:00.000Z',
            party: {
              role: 'customer',
              customerName: 'Dara Sok',
              customerNameKey: 'dara sok',
              phone: '+855 11111111',
              phoneKey: '+85511111111',
            },
            lines: [],
          },
          {
            ticketId: 'customer-ticket-dara-2',
            ticketFamily: 'customer',
            lifecycle: 'open',
            stage: 'pending',
            revision: 1,
            eventType: 'created',
            occurredAt: '2026-04-06T09:00:00.000Z',
            party: {
              role: 'customer',
              customerName: 'Dara Sok',
              customerNameKey: 'dara sok',
              phone: '+855 22222222',
              phoneKey: '+85522222222',
            },
            lines: [],
          },
        ],
      },
    }] as unknown as typeof observations;
    renderRoute(observationsWithCustomers, `${RECORD_UPDATE_CUSTOMER_PENDING_PATH}?ticketMode=new`);

    const metadataCards = screen.getAllByRole('button', { name: /^(Timing|Customer|Notes|Context|Delivery|Discount)/i });
    expect(metadataCards.slice(-4).map((card) => card.textContent)).toEqual([
      expect.stringMatching(/^Delivery/),
      expect.stringMatching(/^Discount/),
      expect.stringMatching(/^Notes/),
      expect.stringMatching(/^Context/),
    ]);

    const timingCard = screen.getByRole('button', { name: /^Timing/i });
    expect(timingCard).toHaveClass('bg-primary');
    expect(timingCard).not.toHaveClass('motion-safe:animate-[kaur-khor-pos-metadata-glow_3400ms_ease-in-out_infinite]');
    expect(timingCard.className).not.toContain('shadow-[');
    expect(timingCard.querySelector('[data-slot="capture-metadata-card-icon"]')).toHaveClass('text-background');
    expect(timingCard.querySelector('[data-slot="capture-metadata-card-title"]')).toHaveClass('text-background');
    expect(timingCard.querySelector('[data-slot="capture-metadata-card-summary"]')).toHaveClass('text-background/80');

    const customerCard = screen.getByRole('button', { name: /^Customer/i });
    expect(customerCard).toHaveClass('bg-primary');
    expect(customerCard).toHaveClass('whitespace-normal');
    expect(customerCard.querySelector('[data-slot="capture-metadata-card-icon"]')).toHaveClass('lucide-user');
    fireEvent.click(customerCard);
    const customerDialog = posMetadataDialog();
    fireEvent.click(within(customerDialog).getByLabelText('Communication channel'));
    fireEvent.click(screen.getByRole('option', { name: 'Facebook' }));
    const customerNameInput = within(customerDialog).getByLabelText('Customer name');
    fireEvent.focus(customerNameInput);
    const option1 = screen.getByRole('option', { name: 'Dara Sok+855 11111111' });
    const option2 = screen.getByRole('option', { name: 'Dara Sok+855 22222222' });
    expect(option1).toBeInTheDocument();
    expect(option2).toBeInTheDocument();
    fireEvent.change(customerNameInput, { target: { value: 'Dara Sok' } });
    expect(within(customerDialog).getByLabelText('Phone number')).toHaveValue('');
    fireEvent.click(option2);
    expect(customerNameInput).toHaveValue('Dara Sok');
    expect(within(customerDialog).getByLabelText('Phone number')).toHaveValue('+855 22222222');
    fireEvent.change(within(customerDialog).getByLabelText('Location'), { target: { value: 'maps.google.com/free-money-town' } });
    const updatedCustomerCard = customerCard;
    expect(updatedCustomerCard.querySelector('[data-slot="capture-metadata-card-summary"]')).toHaveClass('flex-wrap');
    expect(Array.from(updatedCustomerCard.querySelectorAll('[data-slot="capture-metadata-card-summary-part"]')).map((part) => part.textContent)).toEqual([
      'Facebook ·',
      'Dara Sok ·',
      '+855 22222222 ·',
      'Location added',
    ]);
    expect(updatedCustomerCard.textContent).not.toContain('maps.google.com/free-money-town');
    fireEvent.click(within(customerDialog).getByRole('button', { name: 'Close' }));
    const notesCard = screen.getByRole('button', { name: /^Notes/i });
    expect(notesCard).toHaveClass('bg-primary');
    expect(notesCard.querySelector('[data-slot="capture-metadata-card-title"]')).toHaveClass('text-background');
    expect(notesCard.querySelector('[data-slot="capture-metadata-card-summary"]')).toHaveClass('text-background/80');
    const contextCard = screen.getByRole('button', { name: /^Context/i });
    expect(contextCard).toHaveClass('bg-primary');
    expect(screen.getByRole('button', { name: /^Discount/i })).toHaveClass('bg-primary');

    fireEvent.click(notesCard);

    expect(notesCard).not.toHaveClass('motion-safe:animate-[kaur-khor-pos-metadata-glow_3400ms_ease-in-out_infinite]');
    expect(timingCard).toHaveClass('bg-primary');
    expect(notesCard.querySelector('[data-slot="capture-metadata-card-icon"]')).toHaveClass('text-background');
    expect(notesCard.querySelector('[data-slot="capture-metadata-card-title"]')).toHaveClass('text-background');
    expect(notesCard.querySelector('[data-slot="capture-metadata-card-summary"]')).toHaveClass('text-background/80');
  });

  it('resumes touched POS metadata card state from a saved draft', async () => {
    const { unmount } = renderRoute(observations, `${RECORD_UPDATE_SUPPLIER_PENDING_PATH}?ticketMode=new`);

    openPosMetadataPopup(/^Timing/i);
    fireEvent.change(within(posMetadataDialog()).getByLabelText('Expected date of arrival'), {
      target: { value: '2026-04-18' },
    });
    const variabilitySelect = within(posMetadataDialog()).getByRole('combobox', { name: 'ETA variation' });
    fireEvent.click(variabilitySelect);
    fireEvent.click(screen.getByRole('option', { name: /^Tight\b/i }));
    closePosMetadataPopup();
    await waitFor(() => expect(findPosMetadataDialog()).toBeNull());

    unmount();

    expect(JSON.parse(window.localStorage.getItem(SUPPLIER_PENDING_DRAFT_STORAGE_KEY) ?? '{}')).toEqual(
      expect.objectContaining({
        touchedPosMetadataPopupIds: expect.arrayContaining(['timing']),
      }),
    );

    renderRoute(observations, `${RECORD_UPDATE_SUPPLIER_PENDING_PATH}?ticketMode=new`);

    await waitFor(() => expect(screen.getByText('Draft resumed')).toBeInTheDocument());
    expect(screen.getByRole('button', { name: /^Timing/i })).not.toHaveClass('bg-primary');
    expect(screen.getByRole('button', { name: /^Notes/i })).toHaveClass('bg-primary');
  });

  it('saves touched Products Update POS lines into a draft', async () => {
    const { unmount } = renderRoute();

    fireEvent.click(getPosWorkbenchTile('Razor refill'));
    const dialog = screen.getByRole('dialog', { name: 'Razor refill' });
    fireEvent.change(within(dialog).getByLabelText('Units in stock'), { target: { value: '13' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Done' }));

    await waitFor(() => expect(screen.getByRole('button', { name: 'Edit Razor refill changed item' })).toBeInTheDocument());
    unmount();

    expect(JSON.parse(window.localStorage.getItem(STOCK_UPDATE_DRAFT_STORAGE_KEY) ?? '{}')).toEqual(
      expect.objectContaining({
        posTouchedLineKeys: expect.arrayContaining(['stock:sku-1']),
      }),
    );
  });

  it('derives touched POS metadata cards when editing an existing update', async () => {
    renderEditRoute(
      {
        ...observations[0]!,
        input: {
          ...observations[0]!.input,
          notes: 'Existing note',
          regimeHint: 'promo',
        },
      },
      observations,
      RECORD_UPDATE_STOCK_COUNT_PATH,
    );

    await waitFor(() => expect(screen.getByRole('button', { name: /^Timing/i })).toBeInTheDocument());
    expect(screen.getByRole('button', { name: /^Timing/i })).not.toHaveClass('bg-primary');
    expect(screen.getByRole('button', { name: /^Notes/i })).not.toHaveClass('bg-primary');
    expect(screen.getByRole('button', { name: /^Context/i })).not.toHaveClass('bg-primary');
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
    fireEvent.click(within(confirmLeaveDialog as HTMLElement).getByRole('button', { name: 'Save draft' }));

    await waitFor(() => {
      expect(screen.getByText('Help destination')).toBeInTheDocument();
    });
    expect(JSON.parse(window.localStorage.getItem(CUSTOMER_PENDING_DRAFT_STORAGE_KEY) ?? '{}')).toEqual(
      expect.objectContaining({
        deliveryFeeAmount: '3',
      }),
    );
  });

  it('saves POS metadata fields into a draft when leaving a capture session', async () => {
    renderRoutedSession(observations, `${RECORD_UPDATE_CUSTOMER_PENDING_PATH}?ticketMode=new`);

    await fillPendingPosTiming('2026-05-20');
    openPosMetadataPopup(/^Customer/i);
    fireEvent.click(within(posMetadataDialog()).getByLabelText('Communication channel'));
    fireEvent.click(screen.getByRole('option', { name: 'Telegram' }));
    fireEvent.change(within(posMetadataDialog()).getByLabelText('Customer name'), { target: { value: 'Dara' } });
    fireEvent.change(within(posMetadataDialog()).getByLabelText('Phone number'), { target: { value: '+85512000000' } });
    fireEvent.change(within(posMetadataDialog()).getByLabelText('Location'), { target: { value: '123 Riverside Lane' } });
    closePosMetadataPopup();
    openPosMetadataPopup(/^Notes/i);
    fireEvent.change(within(posMetadataDialog()).getByLabelText('Report notes'), { target: { value: 'Customer asked for evening pickup.' } });
    closePosMetadataPopup();

    fireEvent.click(screen.getByRole('link', { name: 'Products' }));
    await waitFor(() => expect(screen.getByRole('dialog')).toHaveTextContent('Leave record update?'));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Save draft' }));

    await waitFor(() => {
      expect(screen.getByText('Products destination')).toBeInTheDocument();
    });
    expect(JSON.parse(window.localStorage.getItem(CUSTOMER_PENDING_DRAFT_STORAGE_KEY) ?? '{}')).toEqual(
      expect.objectContaining({
        customerOrderExpectedArrivalDate: '2026-05-20',
        customerIdentity: {
          channel: 'Telegram',
          customChannel: '',
          customerName: 'Dara',
          phone: '+85512000000',
          location: '123 Riverside Lane',
        },
        notes: 'Customer asked for evening pickup.',
        touchedPosMetadataPopupIds: expect.arrayContaining(['timing', 'customer', 'notes']),
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
          ticketFamily: 'customer' as const,
          lifecycle: 'resolved' as const,
          stage: 'fulfilled_immediate' as const,
          revision: 1,
          eventType: 'fulfilled_immediate' as const,
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

  it('shows linked SKUs above the quantity field in service POS popups', () => {
    renderRoute(observations, `${RECORD_UPDATE_CUSTOMER_PENDING_PATH}?ticketMode=new`);

    fireEvent.click(getPosWorkbenchTile('Towel wrap'));

    const dialog = screen.getByRole('dialog', { name: 'Towel wrap' });
    const linkedSkuLabel = within(dialog).getByText('Linked SKUs:');
    const linkedSku = within(dialog).getByText('Towel');
    const quantityInput = within(dialog).getByLabelText('Quantity for Towel wrap');

    expect(linkedSku).toBeInTheDocument();
    expect(linkedSkuLabel.parentElement?.className).toContain('rounded-[1.35rem]');
    expect(linkedSkuLabel.parentElement?.className).toContain('flex-wrap');
    expect(linkedSku.parentElement?.className).not.toContain('border');
    expect(linkedSkuLabel.compareDocumentPosition(quantityInput) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('shows a POS receipt confirmation dialog before saving and copies the plain text receipt', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });

    renderRoute(observations, `${RECORD_UPDATE_CUSTOMER_PENDING_PATH}?ticketMode=new`);

    await fillPendingPosTiming('2026-05-20');
    openPosMetadataPopup(/^Customer/i);
    fireEvent.click(within(posMetadataDialog()).getByLabelText('Communication channel'));
    fireEvent.click(screen.getByRole('option', { name: 'Telegram' }));
    fireEvent.change(within(posMetadataDialog()).getByLabelText('Customer name'), { target: { value: 'Dara' } });
    fireEvent.change(within(posMetadataDialog()).getByLabelText('Phone number'), { target: { value: '+85512000000' } });
    fireEvent.change(within(posMetadataDialog()).getByLabelText('Location'), { target: { value: '123 Riverside Lane' } });
    closePosMetadataPopup();
    openPosMetadataPopup(/^Notes/i);
    fireEvent.change(within(posMetadataDialog()).getByLabelText('Report notes'), { target: { value: 'Customer asked for evening pickup.' } });
    closePosMetadataPopup();
    fireEvent.click(getPosWorkbenchTile('Razor refill'));
    fireEvent.click(within(screen.getByRole('dialog', { name: 'Razor refill' })).getByRole('button', { name: 'Add line' }));

    fireEvent.click(captureDoneButton());

    const dialog = await screen.findByRole('dialog', { name: 'Confirm receipt' });
    expect(ingestSenaObservation).not.toHaveBeenCalled();
    expect(within(dialog).queryByText('Plain text receipt')).not.toBeInTheDocument();
    expect(within(dialog).queryByText('Final confirmation: save this receipt as the current record update.')).not.toBeInTheDocument();
    expect(within(dialog).getByText('Date and time')).toBeInTheDocument();
    expect(within(dialog).getByText('Expected date of arrival')).toBeInTheDocument();
    expect(within(dialog).queryByText('Expected time of arrival')).not.toBeInTheDocument();
    expect(within(dialog).queryByText('ETA variation')).not.toBeInTheDocument();
    expect(within(dialog).getByText('Communication channel')).toBeInTheDocument();
    expect(within(dialog).getByText('Telegram')).toBeInTheDocument();
    expect(within(dialog).getByText('Dara')).toBeInTheDocument();
    expect(within(dialog).getByText('+855 12000000')).toBeInTheDocument();
    expect(within(dialog).getByText('123 Riverside Lane')).toBeInTheDocument();
    const notesSummaryValue = within(dialog).getByText('Customer asked for evening pickup.');
    expect(within(dialog).getByText('Notes')).toBeInTheDocument();
    expect(within(dialog).queryByText('Report notes')).not.toBeInTheDocument();
    expect(notesSummaryValue).toBeInTheDocument();
    expect(notesSummaryValue.parentElement?.className).toContain('sm:col-span-2');
    expect(within(dialog).queryByText('Context')).not.toBeInTheDocument();
    expect(within(dialog).getByText('Razor refill')).toBeInTheDocument();
    expect(within(dialog).getAllByText('$9.00').length).toBeGreaterThan(0);

    fireEvent.click(within(dialog).getByRole('button', { name: 'Copy receipt' }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(expect.stringContaining('Expected date of arrival: May 20, 2026')));
    const copiedReceipt = writeText.mock.calls[0]?.[0] ?? '';
    expect(copiedReceipt).toContain('Customer name: Dara');
    expect(copiedReceipt).toContain('Phone number: +855 12000000');
    expect(copiedReceipt).toContain('Location: 123 Riverside Lane');
    expect(copiedReceipt).toContain('Notes: Customer asked for evening pickup.');
    expect(copiedReceipt).toContain('Razor refill (1)\n\nSubtotal: $9.00\nDelivery: $0.00\nTotal: $9.00');
    expect(copiedReceipt).not.toContain('Communication channel');
    expect(copiedReceipt).not.toContain('Expected time of arrival');
    expect(copiedReceipt).not.toContain('ETA variation');
    expect(copiedReceipt).not.toContain('Context');
    expect(within(dialog).getByText('Copied receipt to clipboard.')).toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole('button', { name: 'Confirm save' }));
    await waitFor(() => expect(ingestSenaObservation).toHaveBeenCalledTimes(1));
    expect(ingestSenaObservation).toHaveBeenCalledWith(expect.objectContaining({
      ticketEvents: expect.arrayContaining([
        expect.objectContaining({
          party: expect.objectContaining({
            customerName: 'Dara',
            phone: '+855 12000000',
          }),
        }),
      ]),
    }));
  }, 10_000);

  it('adds supplier timing metadata to POS receipt review and omits ETA metadata from copied receipt', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });

    renderRoute(observations, `${RECORD_UPDATE_SUPPLIER_PENDING_PATH}?ticketMode=new`);

    await fillPendingPosTiming('2026-05-20');
    fireEvent.click(getPosWorkbenchTile('Razor refill'));
    fireEvent.click(within(screen.getByRole('dialog', { name: 'Razor refill' })).getByRole('button', { name: 'Add line' }));
    fireEvent.click(captureDoneButton());

    const dialog = await screen.findByRole('dialog', { name: 'Confirm receipt' });
    expect(within(dialog).getByText('Expected date of arrival')).toBeInTheDocument();
    expect(within(dialog).getByText('May 20, 2026')).toBeInTheDocument();
    expect(within(dialog).queryByText('Expected time of arrival')).not.toBeInTheDocument();
    expect(within(dialog).queryByText('ETA variation')).not.toBeInTheDocument();
    expect(within(dialog).queryByText('Context')).not.toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole('button', { name: 'Copy receipt' }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(expect.stringContaining('Expected date of arrival: May 20, 2026')));
    const copiedReceipt = writeText.mock.calls[0]?.[0] ?? '';
    expect(copiedReceipt).toContain('Razor refill');
    expect(copiedReceipt).not.toContain('Expected time of arrival');
    expect(copiedReceipt).not.toContain('ETA variation');
    expect(copiedReceipt).not.toContain('Communication channel');
    expect(copiedReceipt).not.toContain('Context');
  }, 10_000);

  it('does not create legacy supplier order batches when observation persistence fails', async () => {
    await withSuppressedConsoleError(async (consoleErrorSpy) => {
      ingestSenaObservation.mockRejectedValueOnce(new Error('ticket event validation failed'));
      renderRoute(observations, `${RECORD_UPDATE_SUPPLIER_PENDING_PATH}?ticketMode=new`);

      await fillPendingPosTiming('2026-05-20');
      fireEvent.click(getPosWorkbenchTile('Razor refill'));
      fireEvent.click(within(screen.getByRole('dialog', { name: 'Razor refill' })).getByRole('button', { name: 'Add line' }));
      fireEvent.click(captureDoneButton());

      const dialog = await screen.findByRole('dialog', { name: 'Confirm receipt' });
      fireEvent.click(within(dialog).getByRole('button', { name: 'Confirm save' }));

      await waitFor(() => expect(ingestSenaObservation).toHaveBeenCalledTimes(1));
      expect(createSenaOrderBatch).not.toHaveBeenCalled();
      expect(updateSenaOrderBatch).not.toHaveBeenCalled();
      expect(updateSenaOrderChild).not.toHaveBeenCalled();
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '[record-update] failed to save capture session in background',
        expect.any(Error),
      );
    });
  }, 10_000);

  it('persists the saved observation id for retry when a background legacy order write fails', async () => {
    await withSuppressedConsoleError(async (consoleErrorSpy) => {
      createSenaOrderBatch.mockRejectedValueOnce(new Error('legacy order write failed'));
      renderRoute(observations, `${RECORD_UPDATE_SUPPLIER_PENDING_PATH}?ticketMode=new`);

      await fillPendingPosTiming('2026-05-20');
      fireEvent.click(getPosWorkbenchTile('Razor refill'));
      fireEvent.click(within(screen.getByRole('dialog', { name: 'Razor refill' })).getByRole('button', { name: 'Add line' }));
      fireEvent.click(captureDoneButton());

      const dialog = await screen.findByRole('dialog', { name: 'Confirm receipt' });
      fireEvent.click(within(dialog).getByRole('button', { name: 'Confirm save' }));

      await waitFor(() => expect(createSenaOrderBatch).toHaveBeenCalledTimes(1));
      expect(ingestSenaObservation).toHaveBeenCalledTimes(1);
      expect(updateSenaObservation).not.toHaveBeenCalled();
      await waitFor(() => {
        const savedDraft = JSON.parse(window.localStorage.getItem(SUPPLIER_PENDING_DRAFT_STORAGE_KEY) ?? '{}');
        expect(savedDraft.savedObservationRetryId).toBe('obs-new');
      });
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '[record-update] failed to save capture session in background',
        expect.any(Error),
      );
    });
  }, 10_000);

  it('applies a percentage discount before delivery and saves discount metadata', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });

    renderRoute(observations, `${RECORD_UPDATE_CUSTOMER_PENDING_PATH}?ticketMode=new`);

    await fillPendingPosTiming();
    openPosMetadataPopup(/^Delivery/i);
    fireEvent.change(within(posMetadataDialog()).getByRole('textbox', { name: 'Fee amount' }), { target: { value: '2' } });
    closePosMetadataPopup();

    openPosMetadataPopup(/^Discount/i);
    fireEvent.click(within(posMetadataDialog()).getByRole('radio', { name: 'Percent' }));
    const discountPercentInput = within(posMetadataDialog()).getByLabelText('Discount Percent (%)');
    expect(discountPercentInput).toHaveAttribute('step', '0.1');
    fireEvent.change(discountPercentInput, { target: { value: '5.5' } });
    closePosMetadataPopup();

    fireEvent.click(getPosWorkbenchTile('Razor refill'));
    fireEvent.click(within(screen.getByRole('dialog', { name: 'Razor refill' })).getByRole('button', { name: 'Add line' }));
    fireEvent.click(captureDoneButton());

    const dialog = await screen.findByRole('dialog', { name: 'Confirm receipt' });
    expect(within(dialog).getAllByText('Discount (5.5%)')).toHaveLength(1);
    expect(within(dialog).getAllByText('-$0.50').length).toBeGreaterThan(0);
    expect(within(dialog).getByText('$10.51')).toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole('button', { name: 'Copy receipt' }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(expect.stringContaining('Discount (5.5%): -$0.50')));
    expect(writeText.mock.calls[0]?.[0]).toContain('Razor refill (1)\n\nSubtotal: $9.00\nDiscount (5.5%): -$0.50\nDelivery: $2.00\nTotal: $10.51');

    fireEvent.click(within(dialog).getByRole('button', { name: 'Confirm save' }));
    await waitFor(() => expect(ingestSenaObservation).toHaveBeenCalledTimes(1));
    expect(ingestSenaObservation).toHaveBeenCalledWith(expect.objectContaining({
      discount: expect.objectContaining({
        mode: 'percent',
        percent: 5.5,
        subtotalUsd: 9,
        displayDiscountUsd: 0.495,
        discountedSubtotalUsd: 8.505,
      }),
      deliveryFee: expect.objectContaining({
        subtotalUsd: 8.505,
        displayTotalUsd: 10.505,
      }),
      ticketEvents: [
        expect.objectContaining({
          discount: expect.objectContaining({
            mode: 'percent',
            percent: 5.5,
          }),
        }),
      ],
    }));
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

    await fillPendingPosTiming();
    openPosMetadataPopup(/^Delivery/i);
    const metadataDialog = posMetadataDialog();
    fireEvent.change(within(metadataDialog).getByRole('textbox', { name: 'Fee amount' }), { target: { value: '3' } });
    fireEvent.click(within(metadataDialog).getByRole('radio', { name: 'Merchant' }));
    closePosMetadataPopup();

    fireEvent.click(getPosWorkbenchTile('Razor refill'));
    fireEvent.click(within(screen.getByRole('dialog', { name: 'Razor refill' })).getByRole('button', { name: 'Add line' }));
    fireEvent.click(screen.getAllByRole('button', { name: 'Done' })[0]!);

    const dialog = await screen.findByRole('dialog', { name: 'Confirm receipt' });
    expect(within(dialog).getByText('Subtotal')).toBeInTheDocument();
    expect(within(dialog).getAllByText('Delivery')).toHaveLength(1);
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

  it('saves comma-formatted POS delivery and discount amounts as numeric metadata', async () => {
    renderRoute(observations, `${RECORD_UPDATE_CUSTOMER_PENDING_PATH}?ticketMode=new`);

    await fillPendingPosTiming();
    openPosMetadataPopup(/^Delivery/i);
    fireEvent.change(within(posMetadataDialog()).getByRole('textbox', { name: 'Fee amount' }), { target: { value: '1,234.50' } });
    closePosMetadataPopup();

    openPosMetadataPopup(/^Discount/i);
    fireEvent.change(within(posMetadataDialog()).getByRole('textbox', { name: 'Discount amount' }), { target: { value: '1,000.25' } });
    closePosMetadataPopup();

    fireEvent.click(getPosWorkbenchTile('Razor refill'));
    fireEvent.click(within(screen.getByRole('dialog', { name: 'Razor refill' })).getByRole('button', { name: 'Add line' }));
    fireEvent.click(screen.getAllByRole('button', { name: 'Done' })[0]!);

    const dialog = await screen.findByRole('dialog', { name: 'Confirm receipt' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Confirm save' }));

    await waitFor(() => expect(ingestSenaObservation).toHaveBeenCalledTimes(1));
    expect(ingestSenaObservation).toHaveBeenCalledWith(expect.objectContaining({
      deliveryFee: expect.objectContaining({
        feeUsd: 1234.5,
      }),
      discount: expect.objectContaining({
        amountUsd: 1000.25,
        mode: 'amount',
      }),
    }));
  }, 10_000);

  it('saves the POS Timing ETA date onto pending customer ticket timing', async () => {
    renderRoute(observations, `${RECORD_UPDATE_CUSTOMER_PENDING_PATH}?ticketMode=new`);

    openPosMetadataPopup(/^Timing/i);
    fireEvent.change(within(posMetadataDialog()).getByLabelText('Observed at'), {
      target: { value: '2026-04-12T09:00' },
    });
    fireEvent.change(within(posMetadataDialog()).getByLabelText('Expected date of arrival'), {
      target: { value: '2026-04-18' },
    });
    closePosMetadataPopup();

    fireEvent.click(getPosWorkbenchTile('Razor refill'));
    fireEvent.click(within(screen.getByRole('dialog', { name: 'Razor refill' })).getByRole('button', { name: 'Add line' }));
    fireEvent.click(screen.getAllByRole('button', { name: 'Done' })[0]!);

    const dialog = await screen.findByRole('dialog', { name: 'Confirm receipt' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Confirm save' }));

    await waitFor(() => expect(ingestSenaObservation).toHaveBeenCalledTimes(1));
    const expectedArrivalAt = new Date(2026, 3, 18).toISOString();
    expect(ingestSenaObservation).toHaveBeenCalledWith(expect.objectContaining({
      ticketEvents: [
        expect.objectContaining({
          nextTouchAt: expectedArrivalAt,
          lines: [
            expect.objectContaining({
              entityType: 'sku',
              entityId: 'sku-1',
              expectedArrivalAt,
            }),
          ],
        }),
      ],
    }));
  }, 10_000);

  it('shows tile pictures in POS view when item pictures are enabled', () => {
    renderRoute(observations, `${RECORD_UPDATE_CUSTOMER_PENDING_PATH}?ticketMode=new`);

    const razorTile = getPosWorkbenchTile('Razor refill');
    const razorImage = razorTile.querySelector('img');
    expect(razorImage).not.toBeNull();
    expect(razorImage).toHaveAttribute('src', 'kaur-khor-asset://local/razor-refill.png');
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

  it('applies persisted supplier receipt workbench tile order from desktop preferences', () => {
    preferenceState.workbenchTileOrderByLane = {
      'supplier-receipt': ['supplier-receipt:sku-2', 'supplier-receipt:sku-1'],
    };

    renderRoute(observations, RECORD_UPDATE_SUPPLIER_RECEIPT_PATH);

    expect(visibleWorkbenchTileTitles()).toEqual(['Towel', 'Razor refill']);
  });

  it('keeps all supplier-order workbench SKUs available when editing a child order', () => {
    inventoryHook.mockReturnValue(
      inventoryState({
        observations,
        orderBatches: [
          {
            batchOrderId: 'batch-1',
            ownerSub: 'desktop-owner',
            supplierName: 'Mekong Looms',
            status: 'open',
            createdAt: '2026-04-03T12:00:00.000Z',
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

    render(
      <MemoryRouter initialEntries={[`${RECORD_UPDATE_SUPPLIER_PENDING_PATH}?ticketMode=edit&childOrderId=child-1`]}>
        <StockUpdateSessionRoute />
      </MemoryRouter>,
    );

    expect(visibleWorkbenchTileTitles()).toEqual(['Razor refill', 'Towel']);
    expect(screen.getByText('Supplier Order')).toBeInTheDocument();
  });

  it('merges legacy supplier batch item cards when a restored edit draft has only metadata', async () => {
    window.localStorage.setItem(
      SUPPLIER_PENDING_DRAFT_STORAGE_KEY,
      JSON.stringify({
        version: 1,
        savedAt: '2026-04-03T12:05:00.000Z',
        supplierTicketMode: 'edit',
        selectedSupplierTicketId: 'batch-1',
        touchedPosMetadataPopupIds: ['timing', 'delivery', 'discount'],
        recordOrderExpectedArrivalDate: '2026-04-10',
        deliveryFeeAmount: '1',
        deliveryFeePayer: 'merchant',
        discountMode: 'percent',
        discountPercent: '1',
        skuSignalDrafts: {
          'sku-1': {
            orderEnabled: false,
            orderedQuantity: '',
            leadTimeMeanDays: '6',
            leadTimeVariability: 'tight',
            expectedArrivalDate: '2026-04-10',
            receiptEnabled: false,
            receiptQuantity: '',
            blockedEnabled: false,
            blockedState: 'blocked',
          },
        },
      }),
    );
    inventoryHook.mockReturnValue(
      inventoryState({
        observations,
        orderBatches: [
          {
            batchOrderId: 'batch-1',
            ownerSub: 'desktop-owner',
            supplierName: 'Mekong Looms',
            status: 'awaiting_receipt',
            createdAt: '2026-04-03T12:00:00.000Z',
            updatedAt: '2026-04-03T12:00:00.000Z',
            shared: {
              supplierName: 'Mekong Looms',
              expectedArrivalAt: '2026-04-10T12:00:00.000Z',
              supplierNote: 'Existing supplier note',
            },
            children: [
              {
                childOrderId: 'child-1',
                skuId: 'sku-1',
                status: 'awaiting_receipt',
                updatedAt: '2026-04-03T12:00:00.000Z',
                effective: {
                  orderedQuantity: 8,
                  receivedQuantity: null,
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

    render(
      <MemoryRouter initialEntries={[`${RECORD_UPDATE_SUPPLIER_PENDING_PATH}?ticketMode=edit&batchOrderId=batch-1&flashTargets=supplier-order%3Asku-1`]}>
        <StockUpdateSessionRoute />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(document.querySelector('[data-workbench-tile-key="supplier-order:sku-1"] [data-slot="workbench-quantity-pill"]')).toHaveTextContent('8');
      expect(screen.getByRole('button', { name: 'Edit Razor refill receipt line' })).toBeInTheDocument();
    });
  });

  it('injects ordered quantities as receipt item cards for legacy supplier batch receipt edits', async () => {
    window.localStorage.setItem(
      SUPPLIER_RECEIPT_DRAFT_STORAGE_KEY,
      JSON.stringify({
        version: 1,
        savedAt: '2026-04-03T12:05:00.000Z',
        supplierTicketMode: 'edit',
        selectedSupplierTicketId: 'batch-1',
        touchedPosMetadataPopupIds: ['notes'],
        notes: 'Only metadata was restored.',
        skuSignalDrafts: {},
      }),
    );
    inventoryHook.mockReturnValue(
      inventoryState({
        observations,
        orderBatches: [
          {
            batchOrderId: 'batch-1',
            ownerSub: 'desktop-owner',
            supplierName: 'Mekong Looms',
            status: 'awaiting_receipt',
            createdAt: '2026-04-03T12:00:00.000Z',
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
                status: 'awaiting_receipt',
                updatedAt: '2026-04-03T12:00:00.000Z',
                effective: {
                  orderedQuantity: 8,
                  receivedQuantity: null,
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

    render(
      <MemoryRouter initialEntries={[`${RECORD_UPDATE_SUPPLIER_RECEIPT_PATH}?ticketMode=edit&batchOrderId=batch-1&flashTargets=supplier-receipt%3Asku-1`]}>
        <StockUpdateSessionRoute />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(document.querySelector('[data-workbench-tile-key="supplier-receipt:sku-1"] [data-slot="workbench-quantity-pill"]')).toHaveTextContent('8');
      expect(screen.getByRole('button', { name: 'Edit Razor refill receipt line' })).toBeInTheDocument();
    });
  });

  it('injects an existing supplier ticket into the POS order state when editing by ticket id', async () => {
    const supplierTicket = supplierTicketRecord();
    inventoryHook.mockReturnValue(
      inventoryState({
        observations,
        recordUpdateContext: {
          observationFingerprint: { count: 1, latestObservedAt: '2026-04-03T12:00:00.000Z', latestObservationId: 'obs-ticket' },
          latestObservedAt: '2026-04-03T12:00:00.000Z',
          latestStockBySku: {},
          latestRetailSaleBySku: {},
          latestServiceSaleByService: {},
          latestOrderBySku: {},
          latestReceiptBySku: {},
          openTicketsByFamily: {
            customer: [],
            supplier: [supplierTicket],
          },
          latestTicketsById: {
            'supplier-ticket-real': {
              observationId: 'obs-ticket',
              observedAt: '2026-04-03T12:00:00.000Z',
              value: supplierTicket,
            },
          },
          latestDeliveryFeeByBucket: {},
          recentActivity: [],
        },
      }),
    );

    render(
      <MemoryRouter initialEntries={[`${RECORD_UPDATE_SUPPLIER_PENDING_PATH}?ticketMode=edit&ticketId=supplier-ticket-real`]}>
        <StockUpdateSessionRoute />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Edit Razor refill receipt line' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Edit Towel receipt line' })).toBeInTheDocument();
    });
    expect(document.querySelector('[data-workbench-tile-key="supplier-order:sku-1"] [data-slot="workbench-quantity-pill"]')).toHaveTextContent('8');
    expect(document.querySelector('[data-workbench-tile-key="supplier-order:sku-2"] [data-slot="workbench-quantity-pill"]')).toHaveTextContent('3');
    expect(screen.getAllByText('$38.00').length).toBeGreaterThan(0);

    openPosMetadataPopup(/^Timing/i);
    expect(within(posMetadataDialog()).getByLabelText('Expected date of arrival')).toHaveValue('2026-05-09');
  });

  it('injects an existing supplier ticket into the POS receipt state when editing by ticket id', async () => {
    const supplierTicket = supplierTicketRecord();
    inventoryHook.mockReturnValue(
      inventoryState({
        observations,
        recordUpdateContext: {
          observationFingerprint: { count: 1, latestObservedAt: '2026-04-03T12:00:00.000Z', latestObservationId: 'obs-ticket' },
          latestObservedAt: '2026-04-03T12:00:00.000Z',
          latestStockBySku: {},
          latestRetailSaleBySku: {},
          latestServiceSaleByService: {},
          latestOrderBySku: {},
          latestReceiptBySku: {},
          openTicketsByFamily: {
            customer: [],
            supplier: [supplierTicket],
          },
          latestTicketsById: {
            'supplier-ticket-real': {
              observationId: 'obs-ticket',
              observedAt: '2026-04-03T12:00:00.000Z',
              value: supplierTicket,
            },
          },
          latestDeliveryFeeByBucket: {},
          recentActivity: [],
        },
      }),
    );

    render(
      <MemoryRouter initialEntries={[`${RECORD_UPDATE_SUPPLIER_RECEIPT_PATH}?ticketMode=edit&ticketId=supplier-ticket-real&flashTargets=supplier-receipt%3Asku-1%2Csupplier-receipt%3Asku-2`]}>
        <StockUpdateSessionRoute />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(document.querySelector('[data-workbench-tile-key="supplier-receipt:sku-1"] [data-slot="workbench-quantity-pill"]')).toHaveTextContent('8');
      expect(document.querySelector('[data-workbench-tile-key="supplier-receipt:sku-2"] [data-slot="workbench-quantity-pill"]')).toHaveTextContent('3');
    });
  });

  it('resolves the supplier ticket when a receipt edit receives every ordered line', async () => {
    const supplierTicket = supplierTicketRecord();
    inventoryHook.mockReturnValue(
      inventoryState({
        observations,
        recordUpdateContext: {
          observationFingerprint: { count: 1, latestObservedAt: '2026-04-03T12:00:00.000Z', latestObservationId: 'obs-ticket' },
          latestObservedAt: '2026-04-03T12:00:00.000Z',
          latestStockBySku: {},
          latestRetailSaleBySku: {},
          latestServiceSaleByService: {},
          latestOrderBySku: {},
          latestReceiptBySku: {},
          openTicketsByFamily: {
            customer: [],
            supplier: [supplierTicket],
          },
          latestTicketsById: {
            'supplier-ticket-real': {
              observationId: 'obs-ticket',
              observedAt: '2026-04-03T12:00:00.000Z',
              value: supplierTicket,
            },
          },
          latestDeliveryFeeByBucket: {},
          recentActivity: [],
        },
      }),
    );

    render(
      <MemoryRouter initialEntries={[`${RECORD_UPDATE_SUPPLIER_RECEIPT_PATH}?ticketMode=edit&ticketId=supplier-ticket-real&flashTargets=supplier-receipt%3Asku-1%2Csupplier-receipt%3Asku-2`]}>
        <StockUpdateSessionRoute />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(document.querySelector('[data-workbench-tile-key="supplier-receipt:sku-1"] [data-slot="workbench-quantity-pill"]')).toHaveTextContent('8');
      expect(document.querySelector('[data-workbench-tile-key="supplier-receipt:sku-2"] [data-slot="workbench-quantity-pill"]')).toHaveTextContent('3');
    });

    fireEvent.click(captureDoneButton());
    fireEvent.click(within(await screen.findByRole('dialog', { name: 'Confirm receipt' })).getByRole('button', { name: 'Confirm save' }));

    await waitFor(() => expect(ingestSenaObservation).toHaveBeenCalledTimes(1));
    expect(ingestSenaObservation).toHaveBeenCalledWith(
      expect.objectContaining({
        stockSnapshot: [
          expect.objectContaining({ skuId: 'sku-1', unitsInStock: 20 }),
          expect.objectContaining({ skuId: 'sku-2', unitsInStock: 7 }),
        ],
        ticketEvents: [
          expect.objectContaining({
            eventType: 'fully_received',
            lifecycle: 'resolved',
            stage: 'received',
            ticketFamily: 'supplier',
            ticketId: 'supplier-ticket-real',
          }),
        ],
      }),
    );
  });

  it('saves partial supplier receipts with only the received inventory deltas', async () => {
    const supplierTicket = supplierTicketRecord();
    inventoryHook.mockReturnValue(
      inventoryState({
        observations,
        recordUpdateContext: {
          observationFingerprint: { count: 1, latestObservedAt: '2026-04-03T12:00:00.000Z', latestObservationId: 'obs-ticket' },
          latestObservedAt: '2026-04-03T12:00:00.000Z',
          latestStockBySku: {},
          latestRetailSaleBySku: {},
          latestServiceSaleByService: {},
          latestOrderBySku: {},
          latestReceiptBySku: {},
          openTicketsByFamily: {
            customer: [],
            supplier: [supplierTicket],
          },
          latestTicketsById: {
            'supplier-ticket-real': {
              observationId: 'obs-ticket',
              observedAt: '2026-04-03T12:00:00.000Z',
              value: supplierTicket,
            },
          },
          latestDeliveryFeeByBucket: {},
          recentActivity: [],
        },
      }),
    );

    render(
      <MemoryRouter initialEntries={[`${RECORD_UPDATE_SUPPLIER_RECEIPT_PATH}?ticketMode=edit&ticketId=supplier-ticket-real&flashTargets=supplier-receipt%3Asku-1%2Csupplier-receipt%3Asku-2`]}>
        <StockUpdateSessionRoute />
      </MemoryRouter>,
    );

    await waitFor(() => expect(screen.getByRole('button', { name: 'Edit Towel receipt line' })).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'Edit Towel receipt line' }));
    const towelDialog = screen.getByRole('dialog', { name: 'Towel' });
    fireEvent.change(within(towelDialog).getByLabelText('Quantity for Towel'), { target: { value: '1' } });
    fireEvent.click(within(towelDialog).getByRole('button', { name: 'Update line' }));

    fireEvent.click(captureDoneButton());
    fireEvent.click(within(await screen.findByRole('dialog', { name: 'Confirm receipt' })).getByRole('button', { name: 'Confirm save' }));

    await waitFor(() => expect(ingestSenaObservation).toHaveBeenCalledTimes(1));
    expect(ingestSenaObservation).toHaveBeenCalledWith(
      expect.objectContaining({
        stockSnapshot: [
          expect.objectContaining({ skuId: 'sku-1', unitsInStock: 20 }),
          expect.objectContaining({ skuId: 'sku-2', unitsInStock: 5 }),
        ],
        ticketEvents: [
          expect.objectContaining({
            eventType: 'partial_received',
            lifecycle: 'open',
            stage: 'partial_received',
            ticketFamily: 'supplier',
            ticketId: 'supplier-ticket-real',
          }),
        ],
      }),
    );
  });

  it('does not change inventory counts for supplier orders before receipt', async () => {
    renderRoute(observations, `${RECORD_UPDATE_SUPPLIER_PENDING_PATH}?ticketMode=new`);

    await fillPendingPosTiming('2026-05-20');
    fireEvent.click(getPosWorkbenchTile('Razor refill'));
    fireEvent.click(within(screen.getByRole('dialog', { name: 'Razor refill' })).getByRole('button', { name: 'Add line' }));
    fireEvent.click(captureDoneButton());
    fireEvent.click(within(await screen.findByRole('dialog', { name: 'Confirm receipt' })).getByRole('button', { name: 'Confirm save' }));

    await waitFor(() => expect(ingestSenaObservation).toHaveBeenCalledTimes(1));
    expect(ingestSenaObservation).toHaveBeenCalledWith(expect.objectContaining({
      stockSnapshot: [],
      ticketEvents: [
        expect.objectContaining({
          eventType: 'created',
          ticketFamily: 'supplier',
        }),
      ],
    }));
  });

  it('hydrates supplier ticket item cards from queue edit-session observations', async () => {
    setStoredSessionViewMode('pos');
    const editObservation: SenaObservationRecord = {
      ...observations[0]!,
      observationId: 'obs-supplier-ticket-edit',
      input: {
        ...observations[0]!.input,
        notes: 'Supplier metadata already restored.',
        ticketEvents: [supplierTicketRecord('supplier-ticket-edit-session')],
      },
    };

    renderEditRoute(editObservation, [editObservation], RECORD_UPDATE_SUPPLIER_RECEIPT_PATH);

    await waitFor(() => {
      expect(document.querySelector('[data-workbench-tile-key="supplier-receipt:sku-1"] [data-slot="workbench-quantity-pill"]')).toHaveTextContent('8');
      expect(document.querySelector('[data-workbench-tile-key="supplier-receipt:sku-2"] [data-slot="workbench-quantity-pill"]')).toHaveTextContent('3');
    });
  });

  it('reroutes supplier ticket edit sessions from the stock-count path before hydrating POS item cards', async () => {
    const editObservation: SenaObservationRecord = {
      ...observations[0]!,
      observationId: 'obs-supplier-ticket-wrong-lane',
      input: {
        ...observations[0]!.input,
        notes: 'Supplier metadata from a generic edit link.',
        ticketEvents: [{
          ...supplierTicketRecord('supplier-ticket-wrong-lane'),
          lifecycle: 'resolved',
          stage: 'received',
          eventType: 'fully_received',
          lines: supplierTicketRecord('supplier-ticket-wrong-lane').lines.map((line) => ({
            ...line,
            receivedQuantity: line.quantityDelta,
          })),
        }],
      },
    };

    renderEditRoute(editObservation, [editObservation], RECORD_UPDATE_STOCK_COUNT_PATH);

    await waitFor(() => {
      expect(screen.getByText('Main workbench')).toBeInTheDocument();
      expect(document.querySelector('[data-workbench-tile-key="supplier-receipt:sku-1"] [data-slot="workbench-quantity-pill"]')).toHaveTextContent('8');
      expect(document.querySelector('[data-workbench-tile-key="supplier-receipt:sku-2"] [data-slot="workbench-quantity-pill"]')).toHaveTextContent('3');
    });
  });

  it('hydrates customer ticket item cards from queue edit-session observations', async () => {
    setStoredSessionViewMode('pos');
    const editObservation: SenaObservationRecord = {
      ...observations[0]!,
      observationId: 'obs-customer-ticket-edit',
      input: {
        ...observations[0]!.input,
        ticketEvents: [customerTicketRecord('customer-ticket-edit-session')],
      },
    };

    renderEditRoute(editObservation, [editObservation], RECORD_UPDATE_CUSTOMER_PENDING_PATH);

    await waitFor(() => {
      expect(document.querySelector('[data-workbench-tile-key="service:service-1"] [data-slot="workbench-quantity-pill"]')).toHaveTextContent('2');
      expect(document.querySelector('[data-workbench-tile-key="retail:sku-1"] [data-slot="workbench-quantity-pill"]')).toHaveTextContent('1');
    });
  });

  it('merges supplier ticket item cards when a restored edit draft has only ticket metadata', async () => {
    const supplierTicket = supplierTicketRecord();
    window.localStorage.setItem(
      SUPPLIER_PENDING_DRAFT_STORAGE_KEY,
      JSON.stringify({
        version: 1,
        savedAt: '2026-04-03T12:05:00.000Z',
        supplierTicketMode: 'edit',
        selectedSupplierTicketId: 'supplier-ticket-real',
        touchedPosMetadataPopupIds: ['notes'],
        notes: 'Existing metadata draft.',
        skuSignalDrafts: {},
      }),
    );
    inventoryHook.mockReturnValue(
      inventoryState({
        observations,
        recordUpdateContext: {
          observationFingerprint: { count: 1, latestObservedAt: '2026-04-03T12:00:00.000Z', latestObservationId: 'obs-ticket' },
          latestObservedAt: '2026-04-03T12:00:00.000Z',
          latestStockBySku: {},
          latestRetailSaleBySku: {},
          latestServiceSaleByService: {},
          latestOrderBySku: {},
          latestReceiptBySku: {},
          openTicketsByFamily: {
            customer: [],
            supplier: [supplierTicket],
          },
          latestTicketsById: {
            'supplier-ticket-real': {
              observationId: 'obs-ticket',
              observedAt: '2026-04-03T12:00:00.000Z',
              value: supplierTicket,
            },
          },
          latestDeliveryFeeByBucket: {},
          recentActivity: [],
        },
      }),
    );

    render(
      <MemoryRouter initialEntries={[`${RECORD_UPDATE_SUPPLIER_PENDING_PATH}?ticketMode=edit&ticketId=supplier-ticket-real`]}>
        <StockUpdateSessionRoute />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(document.querySelector('[data-workbench-tile-key="supplier-order:sku-1"] [data-slot="workbench-quantity-pill"]')).toHaveTextContent('8');
      expect(document.querySelector('[data-workbench-tile-key="supplier-order:sku-2"] [data-slot="workbench-quantity-pill"]')).toHaveTextContent('3');
    });
  });

  it('merges supplier ticket item cards when a restored edit draft has empty supplier line shells', async () => {
    const supplierTicket = supplierTicketRecord();
    window.localStorage.setItem(
      SUPPLIER_PENDING_DRAFT_STORAGE_KEY,
      JSON.stringify({
        version: 1,
        savedAt: '2026-04-03T12:05:00.000Z',
        supplierTicketMode: 'edit',
        selectedSupplierTicketId: 'supplier-ticket-real',
        touchedPosMetadataPopupIds: ['timing', 'delivery', 'discount'],
        recordOrderExpectedArrivalDate: '2026-05-09',
        deliveryFeeAmount: '38',
        deliveryFeePayer: 'merchant',
        discountMode: 'percent',
        discountPercent: '1',
        skuSignalDrafts: {
          'sku-1': {
            orderEnabled: false,
            orderedQuantity: '',
            leadTimeMeanDays: '8',
            leadTimeVariability: '',
            expectedArrivalDate: '2026-05-09',
            receiptEnabled: false,
            receiptQuantity: '',
            blockedEnabled: false,
            blockedState: 'blocked',
          },
          'sku-2': {
            orderEnabled: true,
            orderedQuantity: '',
            leadTimeMeanDays: '8',
            leadTimeVariability: '',
            expectedArrivalDate: '2026-05-09',
            receiptEnabled: false,
            receiptQuantity: '',
            blockedEnabled: false,
            blockedState: 'blocked',
          },
        },
      }),
    );
    inventoryHook.mockReturnValue(
      inventoryState({
        observations,
        recordUpdateContext: {
          observationFingerprint: { count: 1, latestObservedAt: '2026-04-03T12:00:00.000Z', latestObservationId: 'obs-ticket' },
          latestObservedAt: '2026-04-03T12:00:00.000Z',
          latestStockBySku: {},
          latestRetailSaleBySku: {},
          latestServiceSaleByService: {},
          latestOrderBySku: {},
          latestReceiptBySku: {},
          openTicketsByFamily: {
            customer: [],
            supplier: [supplierTicket],
          },
          latestTicketsById: {
            'supplier-ticket-real': {
              observationId: 'obs-ticket',
              observedAt: '2026-04-03T12:00:00.000Z',
              value: supplierTicket,
            },
          },
          latestDeliveryFeeByBucket: {},
          recentActivity: [],
        },
      }),
    );

    render(
      <MemoryRouter initialEntries={[`${RECORD_UPDATE_SUPPLIER_PENDING_PATH}?ticketMode=edit&ticketId=supplier-ticket-real`]}>
        <StockUpdateSessionRoute />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(document.querySelector('[data-workbench-tile-key="supplier-order:sku-1"] [data-slot="workbench-quantity-pill"]')).toHaveTextContent('8');
      expect(document.querySelector('[data-workbench-tile-key="supplier-order:sku-2"] [data-slot="workbench-quantity-pill"]')).toHaveTextContent('3');
    });
  });

  it('injects an existing customer ticket into the POS order state when editing by ticket id', async () => {
    const customerTicket = {
      ticketId: 'customer-ticket-real',
      ticketFamily: 'customer' as const,
      lifecycle: 'open' as const,
      stage: 'pending' as const,
      revision: 2,
      eventType: 'created' as const,
      occurredAt: '2026-04-03T12:00:00.000Z',
      nextTouchAt: '2026-04-09T12:00:00.000Z',
      party: {
        role: 'customer' as const,
        channelLabel: 'Telegram',
        customerName: 'Dara',
        phone: '+85512345678',
        location: 'Phnom Penh',
      },
      lines: [
        {
          entityType: 'service' as const,
          entityId: 'service-1',
          quantityDelta: 2,
          expectedArrivalAt: '2026-04-09T12:00:00.000Z',
        },
        {
          entityType: 'sku' as const,
          entityId: 'sku-1',
          quantityDelta: 1,
          expectedArrivalAt: '2026-04-10T12:00:00.000Z',
        },
      ],
      note: 'Prefers evening pickup.',
    };
    inventoryHook.mockReturnValue(
      inventoryState({
        observations,
        recordUpdateContext: {
          observationFingerprint: { count: 1, latestObservedAt: '2026-04-03T12:00:00.000Z', latestObservationId: 'obs-ticket' },
          latestObservedAt: '2026-04-03T12:00:00.000Z',
          latestStockBySku: {},
          latestRetailSaleBySku: {},
          latestServiceSaleByService: {},
          latestOrderBySku: {},
          latestReceiptBySku: {},
          openTicketsByFamily: {
            customer: [customerTicket],
            supplier: [],
          },
          latestTicketsById: {
            'customer-ticket-real': {
              observationId: 'obs-ticket',
              observedAt: '2026-04-03T12:00:00.000Z',
              value: customerTicket,
            },
          },
          latestDeliveryFeeByBucket: {},
          recentActivity: [],
        },
      }),
    );

    render(
      <MemoryRouter initialEntries={[`${RECORD_UPDATE_CUSTOMER_PENDING_PATH}?ticketMode=edit&ticketId=customer-ticket-real`]}>
        <StockUpdateSessionRoute />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(document.querySelector('[data-workbench-tile-key="service:service-1"] [data-slot="workbench-quantity-pill"]')).toHaveTextContent('2');
      expect(document.querySelector('[data-workbench-tile-key="retail:sku-1"] [data-slot="workbench-quantity-pill"]')).toHaveTextContent('1');
    });
    expect(screen.getAllByText('$33.00').length).toBeGreaterThan(0);

    openPosMetadataPopup(/^Timing/i);
    expect(within(posMetadataDialog()).getByLabelText('Expected date of arrival')).toHaveValue('2026-05-09');
    closePosMetadataPopup();

    openPosMetadataPopup(/^Customer/i);
    expect(within(posMetadataDialog()).getByLabelText('Customer name')).toHaveValue('Dara');
    expect(within(posMetadataDialog()).getByLabelText('Phone number')).toHaveValue('+85512345678');
    closePosMetadataPopup();

    openPosMetadataPopup(/^Notes/i);
    expect(within(posMetadataDialog()).getByLabelText('Report notes')).toHaveValue('Prefers evening pickup.');
  });

  it('merges customer ticket item cards when a restored edit draft has only ticket metadata', async () => {
    const customerTicket = customerTicketRecord();
    window.localStorage.setItem(
      CUSTOMER_PENDING_DRAFT_STORAGE_KEY,
      JSON.stringify({
        version: 1,
        savedAt: '2026-04-03T12:05:00.000Z',
        customerTicketMode: 'edit',
        selectedCustomerTicketId: 'customer-ticket-real',
        touchedPosMetadataPopupIds: ['customer'],
        customerIdentity: {
          channel: 'Telegram',
          customChannel: '',
          customerName: 'Dara',
          phone: '+85512345678',
          location: 'Phnom Penh',
        },
        retailSalesDrafts: {},
        serviceSalesDrafts: {},
      }),
    );
    inventoryHook.mockReturnValue(
      inventoryState({
        observations,
        recordUpdateContext: {
          observationFingerprint: { count: 1, latestObservedAt: '2026-04-03T12:00:00.000Z', latestObservationId: 'obs-ticket' },
          latestObservedAt: '2026-04-03T12:00:00.000Z',
          latestStockBySku: {},
          latestRetailSaleBySku: {},
          latestServiceSaleByService: {},
          latestOrderBySku: {},
          latestReceiptBySku: {},
          openTicketsByFamily: {
            customer: [customerTicket],
            supplier: [],
          },
          latestTicketsById: {
            'customer-ticket-real': {
              observationId: 'obs-ticket',
              observedAt: '2026-04-03T12:00:00.000Z',
              value: customerTicket,
            },
          },
          latestDeliveryFeeByBucket: {},
          recentActivity: [],
        },
      }),
    );

    render(
      <MemoryRouter initialEntries={[`${RECORD_UPDATE_CUSTOMER_PENDING_PATH}?ticketMode=edit&ticketId=customer-ticket-real`]}>
        <StockUpdateSessionRoute />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(document.querySelector('[data-workbench-tile-key="service:service-1"] [data-slot="workbench-quantity-pill"]')).toHaveTextContent('2');
      expect(document.querySelector('[data-workbench-tile-key="retail:sku-1"] [data-slot="workbench-quantity-pill"]')).toHaveTextContent('1');
    });
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

  it('keeps all five POS workbench orders scoped to their own persisted lane', () => {
    preferenceState.workbenchTileOrderByLane = {
      'stock-count': ['stock:sku-2', 'stock:sku-1'],
      'supplier-order-pending': ['supplier-order:sku-2', 'supplier-order:sku-1'],
      'supplier-receipt': ['supplier-receipt:sku-2', 'supplier-receipt:sku-1'],
      'customer-order-pending': ['service:service-1', 'retail:sku-1', 'service:service-2'],
      'customer-order-completed': ['service:service-1', 'retail:sku-1', 'service:service-2'],
    };

    const stockCountView = renderRoute(observations, RECORD_UPDATE_STOCK_COUNT_PATH);
    expect(visibleWorkbenchTileTitles()).toEqual(['Towel', 'Razor refill', 'Haircut', 'Towel wrap']);
    stockCountView.unmount();

    const supplierView = renderRoute(observations, RECORD_UPDATE_SUPPLIER_PENDING_PATH);
    expect(visibleWorkbenchTileTitles()).toEqual(['Towel', 'Razor refill']);
    supplierView.unmount();

    const supplierReceiptView = renderRoute(observations, RECORD_UPDATE_SUPPLIER_RECEIPT_PATH);
    expect(visibleWorkbenchTileTitles()).toEqual(['Towel', 'Razor refill']);
    supplierReceiptView.unmount();

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

    render(
      <MemoryRouter initialEntries={[`${RECORD_UPDATE_SUPPLIER_PENDING_PATH}?ticketMode=edit`]}>
        <StockUpdateSessionRoute />
      </MemoryRouter>,
    );

    expect(screen.queryByText('What do you want to do?')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'New' })).not.toBeInTheDocument();
    expect(screen.getByText('Edit / update existing supplier order')).toBeInTheDocument();
    expect(screen.getByText('Select the existing ticket you want to update.')).toBeInTheDocument();
    expect(screen.getByText('Razor refill · 8u')).toBeInTheDocument();
    expect(screen.getByRole('dialog')).not.toHaveTextContent('sku-');
    expect(screen.getByRole('dialog')).not.toHaveTextContent('service-');
  });

  it('shows catalog names instead of internal ids in the in-session supplier ticket picker', () => {
    inventoryHook.mockReturnValue(
      inventoryState({
        observations,
        recordUpdateContext: {
          observationFingerprint: { count: 1, latestObservedAt: '2026-04-03T12:00:00.000Z', latestObservationId: 'obs-ticket' },
          latestObservedAt: '2026-04-03T12:00:00.000Z',
          latestStockBySku: {},
          latestRetailSaleBySku: {},
          latestServiceSaleByService: {},
          latestOrderBySku: {},
          latestReceiptBySku: {},
          openTicketsByFamily: {
            customer: [],
            supplier: [{
              ticketId: 'supplier-ticket-real',
              ticketFamily: 'supplier',
              lifecycle: 'open',
              stage: 'ordered_waiting',
              revision: 3,
              eventType: 'created',
              occurredAt: '2026-04-03T12:00:00.000Z',
              party: {
                role: 'supplier',
                supplierName: 'Mekong Looms',
              },
              lines: [
                { entityType: 'sku', entityId: 'sku-1', orderedQuantity: 8 },
                { entityType: 'sku', entityId: 'sku-2', orderedQuantity: 3 },
              ],
              note: null,
            }],
          },
          latestTicketsById: {},
          latestDeliveryFeeByBucket: {},
          recentActivity: [],
        },
      }),
    );

    render(
      <MemoryRouter initialEntries={[`${RECORD_UPDATE_SUPPLIER_PENDING_PATH}?ticketMode=edit`]}>
        <StockUpdateSessionRoute />
      </MemoryRouter>,
    );

    const picker = screen.getByRole('dialog');
    expect(picker).toHaveTextContent('Mekong Looms');
    expect(picker).toHaveTextContent('Razor refill · 8u, Towel · 3u');
    expect(picker).not.toHaveTextContent('sku-');
    expect(picker).not.toHaveTextContent('service-');
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

  it('resolves child-order routes to the real supplier ticket identity when saving ticket events', async () => {
    setStoredSessionViewMode('form');
    inventoryHook.mockReturnValue(
      inventoryState({
        observations,
        recordUpdateContext: {
          observationFingerprint: { count: 1, latestObservedAt: '2026-04-03T12:00:00.000Z', latestObservationId: 'obs-ticket' },
          latestObservedAt: '2026-04-03T12:00:00.000Z',
          latestStockBySku: {},
          latestRetailSaleBySku: {},
          latestServiceSaleByService: {},
          latestOrderBySku: {},
          latestReceiptBySku: {},
          openTicketsByFamily: {
            customer: [],
            supplier: [{
              ticketId: 'supplier-ticket-real',
              ticketFamily: 'supplier',
              lifecycle: 'open',
              stage: 'ordered_waiting',
              revision: 3,
              eventType: 'created',
              occurredAt: '2026-04-03T12:00:00.000Z',
              nextTouchAt: '2026-04-10T12:00:00.000Z',
              party: {
                role: 'supplier',
                supplierName: 'Mekong Looms',
              },
              lines: [{
                entityType: 'sku',
                entityId: 'sku-1',
                orderedQuantity: 8,
                receivedQuantity: null,
                expectedArrivalAt: '2026-04-10T12:00:00.000Z',
              }],
              note: null,
            }],
          },
          latestTicketsById: {
            'supplier-ticket-real': {
              observationId: 'obs-ticket',
              observedAt: '2026-04-03T12:00:00.000Z',
              value: {
                ticketId: 'supplier-ticket-real',
                ticketFamily: 'supplier',
                lifecycle: 'open',
                stage: 'ordered_waiting',
                revision: 3,
                eventType: 'created',
                occurredAt: '2026-04-03T12:00:00.000Z',
                nextTouchAt: '2026-04-10T12:00:00.000Z',
                party: {
                  role: 'supplier',
                  supplierName: 'Mekong Looms',
                },
                lines: [{
                  entityType: 'sku',
                  entityId: 'sku-1',
                  orderedQuantity: 8,
                  receivedQuantity: null,
                  expectedArrivalAt: '2026-04-10T12:00:00.000Z',
                }],
                note: null,
              },
            },
          },
          latestDeliveryFeeByBucket: {},
          recentActivity: [],
        },
        orderBatches: [
          {
            batchOrderId: 'batch-1',
            ownerSub: 'desktop-owner',
            supplierName: 'Mekong Looms',
            status: 'open',
            createdAt: '2026-04-03T12:00:00.000Z',
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

    render(
      <MemoryRouter initialEntries={[`${RECORD_UPDATE_SUPPLIER_PENDING_PATH}?ticketMode=edit&childOrderId=child-1`]}>
        <StockUpdateSessionRoute />
      </MemoryRouter>,
    );

    goNext(2);
    fireEvent.change(screen.getByLabelText('Current order for Razor refill'), { target: { value: '9' } });
    goNext();
    goNext();
    chooseOptionalStepNo();
    goNext();
    fireEvent.click(screen.getByRole('button', { name: 'Save update' }));

    await waitFor(() => expect(ingestSenaObservation).toHaveBeenCalledTimes(1));
    expect(ingestSenaObservation).toHaveBeenCalledWith(expect.objectContaining({
      ticketEvents: [
        expect.objectContaining({
          revision: 4,
          ticketId: 'supplier-ticket-real',
        }),
      ],
    }));
  }, 10_000);

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
          'Kaur Khor starts with this device’s current date and time here. Adjust it only if the update was observed earlier.',
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

    expect(screen.getAllByRole('button', { name: /Review update/i }).find((button) => button.getAttribute('aria-current') === 'step')).toBeTruthy();
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

    expect(screen.getAllByRole('button', { name: /Review update/i }).find((button) => button.getAttribute('aria-current') === 'step')).toBeTruthy();
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
    setStoredSessionViewMode('form');
    renderRoute(observations, `${RECORD_UPDATE_CUSTOM_PATH}?lanes=stock-count,supplier-order-pending`);

    expect(screen.getByRole('button', { name: /Count SKU stock/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Supplier orders/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Supplier ticket receipt/i })).toBeInTheDocument();
  });

  it('lets a custom single-lane supplier order wizard include the receipt branch', () => {
    setStoredSessionViewMode('form');
    renderRoute(observations, `${RECORD_UPDATE_CUSTOM_PATH}?lanes=supplier-order-pending`);

    goNext(3);

    expect(screen.getByRole('button', { name: /Supplier ticket receipt/i })).toHaveAttribute('aria-current', 'step');
    expect(screen.getByRole('columnheader', { name: 'Last receipt' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Current receipt' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Count SKU stock/i })).not.toBeInTheDocument();
  });

  it('preserves the selected custom lanes in a saved draft', async () => {
    setStoredSessionViewMode('form');
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
    setStoredSessionViewMode('form');
    renderRoute(observations, `${RECORD_UPDATE_CUSTOM_PATH}?lanes=stock-count,supplier-order-pending`);

    goToStockStep();
    fireEvent.change(screen.getAllByLabelText('Current Units')[0]!, { target: { value: '7' } });
    goNext();
    chooseOptionalStepNo(3);

    goNext();
    expect(screen.getByRole('button', { name: /Supplier ticket receipt/i })).toHaveAttribute('aria-current', 'step');
    fireEvent.change(screen.getByLabelText('Current receipt for Razor refill'), { target: { value: '6' } });
    goNext(2);

    expect(screen.getAllByRole('button', { name: /Review update/i }).find((button) => button.getAttribute('aria-current') === 'step')).toBeTruthy();
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
        'No SKUs are in products yet. Skip this section, or add a SKU first if you need to record stock updates.',
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText('SKU / latest update')).not.toBeInTheDocument();
    expect(screen.queryByText('Current Units')).not.toBeInTheDocument();
  });

  it('ignores malformed observation dates when hydrating latest stock', () => {
    renderRoute([
      {
        ...observations[0]!,
        observationId: 'obs-dirty',
        input: {
          ...observations[0]!.input,
          observedAt: 'not-a-date',
          stockSnapshot: [
            { skuId: 'sku-1', unitsInStock: 99, costPerUnit: 4, productPrice: 9 },
          ],
        },
      },
      {
        ...observations[0]!,
        observationId: 'obs-valid',
        input: {
          ...observations[0]!.input,
          observedAt: '2026-04-04T12:00:00.000Z',
          stockSnapshot: [
            { skuId: 'sku-1', unitsInStock: 15, costPerUnit: 4, productPrice: 9 },
          ],
        },
      },
    ]);

    fireEvent.click(getPosWorkbenchTile('Razor refill'));

    expect(within(screen.getByRole('dialog', { name: 'Razor refill' })).getByLabelText('Units in stock')).toHaveValue('15');
  });

  it('submits only changed stock rows and reruns SENA before leaving', async () => {
    setStoredSessionViewMode('form');
    renderRoute();

    goToStockStep();
    fireEvent.change(screen.getAllByLabelText('Current Units')[0]!, { target: { value: '7' } });
    window.localStorage.setItem(STOCK_UPDATE_DRAFT_STORAGE_KEY, 'stale draft');

    goNext();
    chooseOptionalStepNo(3);
    goNext();

    expect(screen.getAllByRole('button', { name: /Review update/i }).find((button) => button.getAttribute('aria-current') === 'step')).toBeTruthy();
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

  it('skips the post-save rerun after the first observation', async () => {
    setStoredSessionViewMode('form');
    const setTimeoutSpy = vi.spyOn(window, 'setTimeout');

    renderRoutedSession([]);

    goToStockStep();
    fireEvent.change(screen.getAllByLabelText('Current Units')[0]!, { target: { value: '7' } });
    goNext();
    chooseOptionalStepNo(3);
    goNext();
    fireEvent.click(screen.getByRole('button', { name: 'Save update' }));

    await waitFor(() => expect(ingestSenaObservation).toHaveBeenCalledTimes(1));
    expect(setTimeoutSpy).not.toHaveBeenCalledWith(expect.any(Function), 5_000);
    expect(triggerSenaRun).not.toHaveBeenCalled();
    expect(runWorkspacePreparation).not.toHaveBeenCalled();

    await waitFor(() => expect(screen.getByText('Overview destination')).toBeInTheDocument());
    expect(window.localStorage.getItem(STOCK_UPDATE_DRAFT_STORAGE_KEY)).toBeNull();

    setTimeoutSpy.mockRestore();
  });

  it('leaves the capture route while the post-save SENA rerun continues in the background', async () => {
    setStoredSessionViewMode('form');
    const rerun = deferredPromise<void>();
    triggerSenaRun.mockReturnValueOnce(rerun.promise);

    renderRoutedSession();

    goToStockStep();
    fireEvent.change(screen.getAllByLabelText('Current Units')[0]!, { target: { value: '7' } });
    goNext();
    chooseOptionalStepNo(3);
    goNext();
    fireEvent.click(screen.getByRole('button', { name: 'Save update' }));

    await waitFor(() => expect(ingestSenaObservation).toHaveBeenCalledTimes(1));
    expect(triggerSenaRun).toHaveBeenCalledWith({ algorithmVersion: 'sena-analysis-v3' });
    expect(runWorkspacePreparation).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.getByText('Overview destination')).toBeInTheDocument());
    expect(window.localStorage.getItem(STOCK_UPDATE_DRAFT_STORAGE_KEY)).toBeNull();

    rerun.resolve(undefined);

    await waitFor(() => expect(window.localStorage.getItem(STOCK_UPDATE_DRAFT_STORAGE_KEY)).toBeNull());
  });

  it('closes capture immediately after validation while observation persistence is still running', async () => {
    setStoredSessionViewMode('form');
    const observationSave = deferredPromise<{ observationId: string }>();
    ingestSenaObservation.mockReturnValueOnce(observationSave.promise);

    renderRoutedSessionFromCapture([], RECORD_UPDATE_STOCK_COUNT_PATH);

    goToStockStep();
    fireEvent.change(screen.getAllByLabelText('Current Units')[0]!, { target: { value: '7' } });
    goNext();
    chooseOptionalStepNo(3);
    goNext();
    fireEvent.click(screen.getByRole('button', { name: 'Save update' }));

    await waitFor(() => expect(ingestSenaObservation).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getByText('Capture destination')).toBeInTheDocument());
    expect(triggerSenaRun).not.toHaveBeenCalled();
    expect(window.localStorage.getItem(STOCK_UPDATE_DRAFT_STORAGE_KEY)).toBeNull();

    observationSave.resolve({ observationId: 'obs-background' });

    await waitFor(() => expect(window.localStorage.getItem(STOCK_UPDATE_DRAFT_STORAGE_KEY)).toBeNull());
  });

  it('returns to the capture hub after saving a session launched from capture', async () => {
    setStoredSessionViewMode('form');

    renderRoutedSessionFromCapture();

    goToStockStep();
    fireEvent.change(screen.getAllByLabelText('Current Units')[0]!, { target: { value: '7' } });
    goNext();
    chooseOptionalStepNo(3);
    goNext();
    fireEvent.click(screen.getByRole('button', { name: 'Save update' }));

    await waitFor(() => expect(ingestSenaObservation).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getByText('Capture destination')).toBeInTheDocument());
    expect(screen.queryByText('Overview destination')).not.toBeInTheDocument();
    expect(window.localStorage.getItem(STOCK_UPDATE_DRAFT_STORAGE_KEY)).toBeNull();
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

  it('round-trips date-only inputs as local calendar dates', () => {
    const isoValue = dateInputToIso('2026-04-10');

    expect(isoValue).not.toBeNull();
    expect(dateInputValue(isoValue)).toBe('2026-04-10');
    expect(dateInputValue('2026-02-31')).toBe('');
    expect(dateInputToIso('2026-02-31')).toBeNull();
  });

  it('updates a legacy supplier batch selected from the edit picker instead of creating a new batch', async () => {
    setStoredSessionViewMode('form');
    inventoryHook.mockReturnValue(
      inventoryState({
        observations,
        orderBatches: [
          {
            batchOrderId: 'batch-1',
            ownerSub: 'desktop-owner',
            supplierName: 'Mekong Looms',
            status: 'open',
            createdAt: '2026-04-03T12:00:00.000Z',
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

    render(
      <MemoryRouter initialEntries={[`${RECORD_UPDATE_SUPPLIER_PENDING_PATH}?ticketMode=edit`]}>
        <StockUpdateSessionRoute />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole('button', { name: /Mekong Looms/i }));
    goNext(2);
    fireEvent.change(screen.getByLabelText('Current order for Razor refill'), { target: { value: '9' } });
    goNext();
    goNext();
    chooseOptionalStepNo();
    goNext();
    fireEvent.click(screen.getByRole('button', { name: 'Save update' }));

    await waitFor(() => expect(updateSenaOrderBatch).toHaveBeenCalledTimes(1));
    expect(updateSenaOrderBatch).toHaveBeenCalledWith(expect.objectContaining({ batchOrderId: 'batch-1' }));
    expect(updateSenaOrderChild).toHaveBeenCalledWith({
      childOrderId: 'child-1',
      overrides: {
        orderedQuantity: 9,
      },
    });
    expect(createSenaOrderBatch).not.toHaveBeenCalled();
  }, 10_000);

  it('ignores unavailable draft storage without crashing the session', () => {
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      get() {
        throw new Error('storage blocked');
      },
    });

    try {
      renderRoute();
      expect(screen.getByText('Main workbench')).toBeInTheDocument();
    } finally {
      installMemoryLocalStorage();
    }
  });

  it('ignores draft storage getItem and setItem failures', () => {
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      value: {
        clear: vi.fn(),
        getItem: () => {
          throw new Error('read blocked');
        },
        removeItem: vi.fn(),
        setItem: () => {
          throw new Error('write blocked');
        },
      },
    });

    const { unmount } = renderRoute();
    fireEvent.click(getPosWorkbenchTile('Razor refill'));
    fireEvent.change(within(screen.getByRole('dialog', { name: 'Razor refill' })).getByLabelText('Units in stock'), {
      target: { value: '7' },
    });
    fireEvent.click(within(screen.getByRole('dialog', { name: 'Razor refill' })).getByRole('button', { name: 'Done' }));

    expect(() => unmount()).not.toThrow();
    installMemoryLocalStorage();
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
    expect(screen.getByRole('button', { name: 'Discard changes and leave' })).toBeEnabled();

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

  it('does not save an empty customer ticket draft after choosing new ticket mode', () => {
    const { unmount } = renderRoute(observations, `${RECORD_UPDATE_CUSTOMER_PENDING_PATH}?ticketMode=new`);

    unmount();

    expect(window.localStorage.getItem(CUSTOMER_PENDING_DRAFT_STORAGE_KEY)).toBeNull();
  });

  it('does not save an empty supplier ticket draft after choosing new ticket mode', () => {
    const { unmount } = renderRoute(observations, `${RECORD_UPDATE_SUPPLIER_PENDING_PATH}?ticketMode=new`);

    unmount();

    expect(window.localStorage.getItem(SUPPLIER_PENDING_DRAFT_STORAGE_KEY)).toBeNull();
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
    await waitFor(() => expect(screen.getByRole('button', { name: 'Discard changes and leave' })).toBeEnabled());
    expect(screen.getByRole('button', { name: 'Discard changes and leave' })).toHaveAttribute('data-variant', 'destructive-outline');
    fireEvent.click(screen.getByRole('button', { name: 'Discard changes and leave' }));

    await waitFor(() => expect(screen.getByRole('dialog')).toHaveTextContent('Discard changes?'));
    expect(within(screen.getByRole('dialog')).getByRole('button', { name: 'Save changes' })).toHaveAttribute('data-variant', 'default');
    fireEvent.click(screen.getByRole('button', { name: 'Keep editing' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getAllByLabelText('Current Units')[0]).toHaveValue('7');

    fireEvent.click(screen.getByRole('button', { name: 'Discard changes and leave' }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Discard changes and leave' }));

    await waitFor(() => expect(screen.getByText('Record update hub destination')).toBeInTheDocument());
    expect(window.localStorage.getItem(STOCK_UPDATE_DRAFT_STORAGE_KEY)).toBeNull();
  });

  it('renders destructive treatment for stock-session actions and POS remove-line actions', async () => {
    setStoredSessionViewMode('form');
    renderRoute();

    goToStockStep();
    fireEvent.change(screen.getAllByLabelText('Current Units')[0]!, { target: { value: '7' } });
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Discard changes and leave' })).toBeEnabled();
    });
    expect(screen.getByRole('button', { name: 'Discard changes and leave' })).toHaveAttribute(
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

  it('accepts comma-formatted POS popup quantities', async () => {
    renderRoute(observations, `${RECORD_UPDATE_CUSTOMER_PENDING_PATH}?ticketMode=new`);

    fireEvent.click(getPosWorkbenchTile('Razor refill'));

    const dialog = screen.getByRole('dialog', { name: 'Razor refill' });
    fireEvent.change(within(dialog).getByLabelText('Quantity for Razor refill'), { target: { value: '1,000' } });
    expect(within(dialog).getByText('$9,000.00')).toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole('button', { name: 'Add line' }));

    const receiptRow = await screen.findByRole('button', { name: 'Edit Razor refill receipt line' });
    expect(within(receiptRow).getByText('1000')).toBeInTheDocument();
    expect(within(receiptRow).getByText('$9,000.00')).toBeInTheDocument();
  });

  it('saves comma-formatted immediate sale POS quantities into customer item payloads', async () => {
    renderRoute(observations, `${RECORD_UPDATE_CUSTOMER_COMPLETED_PATH}?ticketMode=new`);

    fireEvent.click(getPosWorkbenchTile('Razor refill'));
    const skuDialog = screen.getByRole('dialog', { name: 'Razor refill' });
    fireEvent.change(within(skuDialog).getByLabelText('Quantity for Razor refill'), { target: { value: '1,000' } });
    expect(within(skuDialog).getByText('$9,000.00')).toBeInTheDocument();
    fireEvent.click(within(skuDialog).getByRole('button', { name: 'Add line' }));

    const skuReceiptRow = await screen.findByRole('button', { name: 'Edit Razor refill receipt line' });
    expect(within(skuReceiptRow).getByText('1000')).toBeInTheDocument();
    expect(within(skuReceiptRow).getByText('$9,000.00')).toBeInTheDocument();

    fireEvent.click(getPosWorkbenchTile('Haircut'));
    const serviceDialog = screen.getByRole('dialog', { name: 'Haircut' });
    fireEvent.change(within(serviceDialog).getByLabelText('Quantity for Haircut'), { target: { value: '2,500' } });
    expect(within(serviceDialog).getByText('$30,000.00')).toBeInTheDocument();
    fireEvent.click(within(serviceDialog).getByRole('button', { name: 'Add line' }));

    const serviceReceiptRow = await screen.findByRole('button', { name: 'Edit Haircut receipt line' });
    expect(within(serviceReceiptRow).getByText('2500')).toBeInTheDocument();
    expect(within(serviceReceiptRow).getByText('$30,000.00')).toBeInTheDocument();

    fireEvent.click(captureDoneButton());
    const reviewDialog = await screen.findByRole('dialog', { name: 'Confirm receipt' });
    fireEvent.click(within(reviewDialog).getByRole('button', { name: 'Confirm save' }));

    await waitFor(() => expect(ingestSenaObservation).toHaveBeenCalledTimes(1));
    expect(ingestSenaObservation).toHaveBeenCalledWith(
      expect.objectContaining({
        retailSalesSnapshot: [{ skuId: 'sku-1', unitsSold: 1000 }],
        serviceSalesSnapshot: [{ serviceId: 'service-1', unitsSold: 2500 }],
        commercialEvents: [
          expect.objectContaining({
            entityType: 'sku',
            entityId: 'sku-1',
            quantityDelta: 1000,
          }),
          expect.objectContaining({
            entityType: 'service',
            entityId: 'service-1',
            quantityDelta: 2500,
          }),
        ],
        ticketEvents: [
          expect.objectContaining({
            lines: [
              expect.objectContaining({
                entityType: 'sku',
                entityId: 'sku-1',
                quantityDelta: 1000,
              }),
              expect.objectContaining({
                entityType: 'service',
                entityId: 'service-1',
                quantityDelta: 2500,
              }),
            ],
          }),
        ],
      }),
    );
  });

  it('saves the draft before navigating away from a record update session', async () => {
    setStoredSessionViewMode('form');
    renderRoutedSession();

    goToStockStep();
    fireEvent.change(screen.getAllByLabelText('Current Units')[0]!, { target: { value: '7' } });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Discard changes and leave' })).toBeEnabled());
    fireEvent.click(screen.getByRole('link', { name: 'Products' }));

    await waitFor(() => expect(screen.getByRole('dialog')).toHaveTextContent('Leave record update?'));
    expect(within(screen.getByRole('dialog')).getByRole('button', { name: 'Discard changes' })).toHaveAttribute('data-variant', 'destructive-outline');
    fireEvent.click(screen.getByRole('button', { name: 'Keep editing' }));
    expect(screen.queryByText('Products destination')).not.toBeInTheDocument();
    expect(screen.getAllByLabelText('Current Units')[0]).toHaveValue('7');

    fireEvent.click(screen.getByRole('link', { name: 'Products' }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Save draft' }));

    await waitFor(() => {
      expect(screen.getByText('Products destination')).toBeInTheDocument();
    });
    expect(JSON.parse(window.localStorage.getItem(STOCK_UPDATE_DRAFT_STORAGE_KEY) ?? '{}')).toEqual(
      expect.objectContaining({
        rows: expect.arrayContaining([expect.objectContaining({ skuId: 'sku-1', unitsInStock: 7 })]),
      }),
    );
    expect(screen.getByTestId('products-origin')).toHaveTextContent('record-update');
  });

  it('asks before using the route back button with a dirty record update session', async () => {
    window.sessionStorage.setItem(
      'kaur-khor.navigation-history',
      JSON.stringify([
        { key: 'catalog', to: '/catalog' },
        { key: 'stock-session', to: RECORD_UPDATE_STOCK_COUNT_PATH },
      ]),
    );
    setStoredSessionViewMode('form');
    renderRoutedSessionWithHistory();

    goToStockStep();
    fireEvent.change(screen.getAllByLabelText('Current Units')[0]!, { target: { value: '7' } });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Discard changes and leave' })).toBeEnabled());

    fireEvent.click(screen.getAllByRole('button', { name: 'Back' })[0]!);

    await waitFor(() => expect(screen.getByRole('dialog')).toHaveTextContent('Leave record update?'));
    fireEvent.click(screen.getByRole('button', { name: 'Keep editing' }));
    expect(screen.queryByText('Products destination')).not.toBeInTheDocument();
    expect(screen.getAllByLabelText('Current Units')[0]).toHaveValue('7');

    fireEvent.click(screen.getAllByRole('button', { name: 'Back' })[0]!);
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Save draft' }));

    await waitFor(() => {
      expect(screen.getByText('Products destination')).toBeInTheDocument();
    });
  });

  it('ignores corrupt saved drafts without crashing', () => {
    window.localStorage.setItem(STOCK_UPDATE_DRAFT_STORAGE_KEY, '{not valid json');

    renderRoute();

    expect(screen.getByText('Main workbench')).toBeInTheDocument();
    expect(window.localStorage.getItem(STOCK_UPDATE_DRAFT_STORAGE_KEY)).toBeNull();
  });
});
