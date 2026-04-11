import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { StockUpdateRoute } from './stock-update';

const realDate = Date;

function freezeDate(isoString: string) {
  const fixedDate = new realDate(isoString);

  class MockDate extends realDate {
    constructor(...args: any[]) {
      super(...(args.length === 0 ? [fixedDate.toISOString()] : args));
    }

    static now() {
      return fixedDate.getTime();
    }

    static parse = realDate.parse;
    static UTC = realDate.UTC;
  }

  vi.stubGlobal('Date', MockDate as unknown as DateConstructor);
}

const inventoryHook = vi.fn();
const deleteSenaObservation = vi.fn();
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
    language: 'en',
    t: (key: string) => {
      if (key === 'searchPlaceholder') {
        return 'Search name or description…';
      }
      if (key === 'searchItems') {
        return 'Search and segment';
      }
      if (key === 'operationsFilterEverything') {
        return 'All';
      }
      if (key === 'filterSku') {
        return 'SKUs';
      }
      if (key === 'filterService') {
        return 'Services';
      }
      return key;
    },
  }),
}));

const sampleCatalog = {
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
  sharingMask: [{ serviceId: 'service-1', skuId: 'sku-1', enabled: true, usageProbability: 1 }],
};

const sampleObservations = [
  {
    observationId: 'obs-sku-newest',
    ownerSub: 'desktop-owner',
    input: {
      observedAt: '2026-04-03T12:00:00.000Z',
      stockSnapshot: [{ skuId: 'sku-1', unitsInStock: 12, costPerUnit: 4, productPrice: 9 }],
      serviceRankings: [],
      retailRankings: [],
      serviceStockouts: [],
      retailStockouts: [],
      orderSignals: [],
      servicePrices: [],
      retailPrices: [],
      leadTimeHints: [],
      notes: 'Razor refill checked',
    },
  },
  {
    observationId: 'obs-sku-same-day',
    ownerSub: 'desktop-owner',
    input: {
      observedAt: '2026-04-03T12:30:00.000Z',
      stockSnapshot: [{ skuId: 'sku-1', unitsInStock: 10, costPerUnit: 4, productPrice: 9 }],
      serviceRankings: [],
      retailRankings: [],
      serviceStockouts: [],
      retailStockouts: [],
      orderSignals: [{ skuId: 'sku-1', orderPlaced: true, receiptArrived: false, approximateOrderQuantity: 20, approximateReceiptQuantity: null }],
      servicePrices: [],
      retailPrices: [],
      leadTimeHints: [],
      notes: 'Supplier order logged',
    },
  },
  {
    observationId: 'obs-service',
    ownerSub: 'desktop-owner',
    input: {
      observedAt: '2026-04-02T12:00:00.000Z',
      stockSnapshot: [],
      serviceRankings: ['Haircut'],
      retailRankings: [],
      serviceStockouts: [],
      retailStockouts: [],
      orderSignals: [],
      servicePrices: [{ serviceId: 'service-1', price: 14 }],
      retailPrices: [],
      leadTimeHints: [],
      notes: 'Haircut price updated',
    },
  },
  {
    observationId: 'obs-old',
    ownerSub: 'desktop-owner',
    input: {
      observedAt: '2025-03-01T12:00:00.000Z',
      stockSnapshot: [{ skuId: 'sku-1', unitsInStock: 8, costPerUnit: 4, productPrice: 9 }],
      serviceRankings: [],
      retailRankings: [],
      serviceStockouts: [],
      retailStockouts: [],
      orderSignals: [],
      servicePrices: [],
      retailPrices: [],
      leadTimeHints: [],
      notes: 'Older snapshot',
    },
  },
];

function makeObservation(observationId: string, observedAt: string, notes: string) {
  return {
    observationId,
    ownerSub: 'desktop-owner',
    input: {
      observedAt,
      stockSnapshot: [{ skuId: 'sku-1', unitsInStock: 12, costPerUnit: 4, productPrice: 9 }],
      serviceRankings: [],
      retailRankings: [],
      serviceStockouts: [],
      retailStockouts: [],
      orderSignals: [],
      servicePrices: [],
      retailPrices: [],
      leadTimeHints: [],
      notes,
    },
  };
}

function renderRoute(overrides?: Record<string, unknown>) {
  inventoryHook.mockReturnValue({
    catalog: sampleCatalog,
    deleteSenaObservation,
    isLoading: false,
    isSaving: false,
    latestRun: null,
    observations: sampleObservations,
    retrySenaRun: vi.fn(),
    triggerSenaRun,
    workspaceSummary: null,
    ...overrides,
  });

  return render(
    <MemoryRouter>
      <StockUpdateRoute />
    </MemoryRouter>,
  );
}

function renderRouteWithDestination() {
  inventoryHook.mockReturnValue({
    catalog: sampleCatalog,
    deleteSenaObservation,
    isLoading: false,
    isSaving: false,
    latestRun: null,
    observations: sampleObservations,
    retrySenaRun: vi.fn(),
    triggerSenaRun,
    workspaceSummary: null,
  });

  function Destination() {
    const location = useLocation();
    const state = location.state as { editSession?: { observationId: string } } | null;
    return <div>edit target: {state?.editSession?.observationId ?? 'none'}</div>;
  }

  return render(
    <MemoryRouter initialEntries={['/operations']}>
      <Routes>
        <Route element={<StockUpdateRoute />} path="/operations" />
        <Route element={<Destination />} path="/record-update" />
      </Routes>
    </MemoryRouter>,
  );
}

describe('StockUpdateRoute', () => {
  beforeEach(() => {
    freezeDate('2026-04-06T12:00:00.000Z');
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  beforeEach(() => {
    deleteSenaObservation.mockResolvedValue(undefined);
    triggerSenaRun.mockResolvedValue({ runId: 'run-1' });
  });

  it('renders the reusable logs title card, actions, and heatmap summary', () => {
    renderRoute();

    expect(screen.getByText('Logs')).toBeInTheDocument();
    expect(screen.getByText('Update history')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Search name or description…')).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'All' })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Select log view' })).toBeInTheDocument();
    expect(screen.getByText('View: Heatmap')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Start update' })).toHaveAttribute('href', '/record-update');
    expect(screen.queryByRole('button', { name: 'Run analysis' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Re-run analysis' })).not.toBeInTheDocument();
    expect(screen.getByText('3 contributions in 2025-2026')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Previous contribution year' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Next contribution year' })).toBeDisabled();
  }, 10_000);

  it('switches to the all view and paginates observations in groups of five', () => {
    const paginatedObservations = [
      makeObservation('obs-1', '2026-04-06T12:00:00.000Z', 'Observation 1'),
      makeObservation('obs-2', '2026-04-05T12:00:00.000Z', 'Observation 2'),
      makeObservation('obs-3', '2026-04-04T12:00:00.000Z', 'Observation 3'),
      makeObservation('obs-4', '2026-04-03T12:00:00.000Z', 'Observation 4'),
      makeObservation('obs-5', '2026-04-02T12:00:00.000Z', 'Observation 5'),
      makeObservation('obs-6', '2026-04-01T12:00:00.000Z', 'Observation 6'),
      makeObservation('obs-7', '2026-03-31T12:00:00.000Z', 'Observation 7'),
    ];

    renderRoute({ observations: paginatedObservations });

    const viewSelect = screen.getByRole('combobox', { name: 'Select log view' });
    viewSelect.focus();
    fireEvent.keyDown(viewSelect, { key: 'ArrowDown', code: 'ArrowDown' });
    const allLabels = screen.getAllByText('All');
    fireEvent.click(allLabels[allLabels.length - 1]!);

    expect(screen.getByRole('combobox', { name: 'Select log view' })).toHaveTextContent('View: All');
    expect(screen.queryByLabelText('Observation contribution heatmap')).not.toBeInTheDocument();
    expect(screen.getByText('All observations (7)')).toBeInTheDocument();
    expect(screen.getByText('Showing 1-5 of 7 filtered observations.')).toBeInTheDocument();
    expect(screen.getByText('Page 1 of 2')).toBeInTheDocument();
    expect(screen.getByText('First')).toBeInTheDocument();
    expect(screen.getByText('Last')).toBeInTheDocument();
    expect(screen.getByText('Observation 1')).toBeInTheDocument();
    expect(screen.getByText('Observation 5')).toBeInTheDocument();
    expect(screen.queryByText('Observation 6')).not.toBeInTheDocument();

    fireEvent.click(screen.getByLabelText('Next report page'));

    expect(screen.getByText('Showing 6-7 of 7 filtered observations.')).toBeInTheDocument();
    expect(screen.getByText('Page 2 of 2')).toBeInTheDocument();
    expect(screen.getByText('Observation 6')).toBeInTheDocument();
    expect(screen.getByText('Observation 7')).toBeInTheDocument();
    expect(screen.queryByText('Observation 1')).not.toBeInTheDocument();
  });

  it('selects the newest active day by default and shows that day detail list', () => {
    renderRoute();

    expect(screen.getByText('Supplier order logged')).toBeInTheDocument();
    expect(screen.getByText('Razor refill checked')).toBeInTheDocument();
    expect(screen.queryByText('Haircut price updated')).not.toBeInTheDocument();
  });

  it('renders edit and delete actions for observation cards and navigates edit with observation state', async () => {
    renderRouteWithDestination();

    fireEvent.click(screen.getAllByRole('button', { name: 'Edit report' })[0]!);

    await waitFor(() => {
      expect(screen.getByText('edit target: obs-sku-same-day')).toBeInTheDocument();
    });
  });

  it('renders observation delete actions with destructive styling', () => {
    renderRoute();

    expect(screen.getAllByRole('button', { name: 'Delete report' })[0]).toHaveAttribute('data-variant', 'destructive-outline');
  });

  it('requires typed confirmation before deleting an observation card', async () => {
    renderRoute();

    fireEvent.click(screen.getAllByRole('button', { name: 'Delete report' })[0]!);

    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveTextContent('Type this exactly to permanently delete the report:');
    fireEvent.change(within(dialog).getByLabelText('Deletion confirmation token'), { target: { value: 'CONFIRM DELETE REPORT' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete report' }));

    await act(async () => {
      await Promise.resolve();
    });
    expect(deleteSenaObservation).toHaveBeenCalledWith({ observationId: 'obs-sku-same-day' });
    expect(triggerSenaRun).toHaveBeenCalledWith({ algorithmVersion: 'sena-analysis-v3' });
  });

  it('aggregates multiple observations on one day and updates details when another day is selected', () => {
    const { container } = renderRoute();

    const intenseCell = container.querySelector<HTMLButtonElement>('button[data-count="2"]');
    expect(intenseCell).not.toBeNull();
    expect(intenseCell).toHaveAttribute('data-count', '2');

    fireEvent.click(screen.getByRole('button', { name: 'Apr 2, 2026, 1 observation' }));

    expect(screen.getByText('Haircut price updated')).toBeInTheDocument();
    expect(screen.queryByText('Supplier order logged')).not.toBeInTheDocument();
  });

  it('applies scope and search filters to both the heatmap and selected-day details', () => {
    const { container } = renderRoute();

    fireEvent.click(screen.getByRole('radio', { name: 'Services' }));
    fireEvent.click(container.querySelector<HTMLButtonElement>('button[data-count="1"]')!);

    expect(screen.getByText('Haircut price updated')).toBeInTheDocument();
    expect(screen.queryByText('Supplier order logged')).not.toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText('Search name or description…'), {
      target: { value: 'No such observation' },
    });

    expect(screen.getByText('0 contributions in 2025-2026')).toBeInTheDocument();
    expect(screen.queryByText('Haircut price updated')).not.toBeInTheDocument();
  });

  it('navigates to older year windows and disables forward navigation at the newest window', () => {
    renderRoute();

    const previousYearButton = screen.getByRole('button', { name: 'Previous contribution year' });
    const nextYearButton = screen.getByRole('button', { name: 'Next contribution year' });

    fireEvent.click(previousYearButton);

    expect(nextYearButton).not.toBeDisabled();
    expect(screen.getByText('Older snapshot')).toBeInTheDocument();
    expect(screen.getByText('1 contributions in 2025')).toBeInTheDocument();
    expect(screen.getByText('Jan 1, 2025 to Dec 31, 2025')).toBeInTheDocument();

    fireEvent.click(nextYearButton);

    expect(nextYearButton).toBeDisabled();
    expect(screen.getByText('Supplier order logged')).toBeInTheDocument();
    expect(screen.queryByText('Older snapshot')).not.toBeInTheDocument();
    expect(screen.getByText('3 contributions in 2025-2026')).toBeInTheDocument();
    expect(screen.getByText('Apr 4, 2025 to Apr 3, 2026')).toBeInTheDocument();
  });

  it('shows an empty selected-day state when no observations exist', () => {
    renderRoute({ observations: [] });

    expect(screen.getByText('0 contributions in 2025-2026')).toBeInTheDocument();
    expect(screen.getByText('No observations match the current filters in this visible year. Adjust the search, scope, or year window.')).toBeInTheDocument();

    const heatmap = screen.getByLabelText('Observation contribution heatmap');
    const cells = within(heatmap).getAllByRole('button', { hidden: true });
    expect(cells.length).toBeGreaterThan(300);
  });

  it('keeps the stale heatmap and detail panel visible while observations are still loading', () => {
    const loadingState = {
      catalog: sampleCatalog,
      isLoading: true,
      isSaving: false,
      latestRun: null,
      observations: [],
      retrySenaRun: vi.fn(),
      triggerSenaRun: vi.fn(),
      workspaceSummary: null,
    };

    inventoryHook.mockReturnValue({
      catalog: sampleCatalog,
      isLoading: false,
      isSaving: false,
      latestRun: null,
      observations: sampleObservations,
      retrySenaRun: vi.fn(),
      triggerSenaRun: vi.fn(),
      workspaceSummary: null,
    });

    const view = render(
      <MemoryRouter>
        <StockUpdateRoute />
      </MemoryRouter>,
    );

    expect(screen.getByText('Supplier order logged')).toBeInTheDocument();

    inventoryHook.mockReturnValue(loadingState);
    view.rerender(
      <MemoryRouter>
        <StockUpdateRoute />
      </MemoryRouter>,
    );

    expect(screen.getByText('Supplier order logged')).toBeInTheDocument();
    expect(screen.queryByText('Loading observations…')).not.toBeInTheDocument();
  });

  it('uses exact 1 and 2 buckets, then higher percentile buckets, and collapses unused legend levels', () => {
    const bucketObservations = [
      makeObservation('obs-a1', '2026-04-01T08:00:00.000Z', 'one input day'),
      makeObservation('obs-b1', '2026-04-02T08:00:00.000Z', 'two input day a'),
      makeObservation('obs-b2', '2026-04-02T09:00:00.000Z', 'two input day b'),
      makeObservation('obs-c1', '2026-04-03T08:00:00.000Z', 'three input day a'),
      makeObservation('obs-c2', '2026-04-03T09:00:00.000Z', 'three input day b'),
      makeObservation('obs-c3', '2026-04-03T10:00:00.000Z', 'three input day c'),
      makeObservation('obs-d1', '2026-04-04T08:00:00.000Z', 'five input day a'),
      makeObservation('obs-d2', '2026-04-04T09:00:00.000Z', 'five input day b'),
      makeObservation('obs-d3', '2026-04-04T10:00:00.000Z', 'five input day c'),
      makeObservation('obs-d4', '2026-04-04T11:00:00.000Z', 'five input day d'),
      makeObservation('obs-d5', '2026-04-04T12:00:00.000Z', 'five input day e'),
    ];

    const { container } = renderRoute({ observations: bucketObservations });

    expect(container.querySelector('button[data-count="1"]')).not.toBeNull();
    expect(container.querySelector('button[data-count="2"]')).not.toBeNull();
    expect(container.querySelector('button[data-count="3"]')).not.toBeNull();
    expect(container.querySelector('button[data-count="5"]')).not.toBeNull();

    const legend = screen.getByText('Less').parentElement;
    expect(legend).not.toBeNull();
    expect(legend?.querySelectorAll('span[aria-hidden="true"]').length).toBe(5);
  });

  it('collapses duplicate higher bands for sparse histories with only one-input days', () => {
    const sparseObservations = [
      makeObservation('obs-s1', '2026-04-01T08:00:00.000Z', 'day one'),
      makeObservation('obs-s2', '2026-04-02T08:00:00.000Z', 'day two'),
      makeObservation('obs-s3', '2026-04-03T08:00:00.000Z', 'day three'),
    ];

    renderRoute({ observations: sparseObservations });

    const legend = screen.getByText('Less').parentElement;
    expect(legend).not.toBeNull();
    expect(legend?.querySelectorAll('span[aria-hidden="true"]').length).toBe(5);
  });
});
