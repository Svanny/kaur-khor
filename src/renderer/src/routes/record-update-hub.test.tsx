import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  RECORD_UPDATE_CUSTOMER_COMPLETED_PATH,
  RECORD_UPDATE_CUSTOMER_PENDING_PATH,
  RECORD_UPDATE_LANES,
  RECORD_UPDATE_STOCK_COUNT_PATH,
  RECORD_UPDATE_SUPPLIER_PENDING_PATH,
} from '@/lib/record-update-routes';
import { recordUpdateSessionViewStorageKey } from '@/lib/record-update-session-view';
import { translateUiLiteral } from '@/lib/translations';
import { RecordUpdateHubRoute } from './record-update-hub';
import type { SenaCatalog, SenaObservationRecord, SenaRecordUpdateContext } from '@shared/sena';

const inventoryHook = vi.fn();
const preferenceState = {
  language: 'en',
  showFloatingTitleActions: false,
};

vi.mock('../state/preferences', () => ({
  usePreferences: () => preferenceState,
}));

vi.mock('@/state/inventory', () => ({
  useInventory: () => inventoryHook(),
}));

const catalog: SenaCatalog = {
  schemaVersion: 1,
  skus: [
    {
      skuId: 'sku-1',
      name: 'Razor refill',
      description: 'Refill pack',
      supplierName: 'Mekong Looms',
      costPerUnit: 4,
      archived: false,
      soldAsProduct: true,
      productPrice: 9,
      leadTimeMeanDaysHint: null,
      leadTimeStdDaysHint: null,
    },
    {
      skuId: 'sku-2',
      name: 'Cotton towel',
      description: 'Towel',
      supplierName: 'Mekong Looms',
      costPerUnit: 2,
      archived: false,
      soldAsProduct: false,
      productPrice: null,
      leadTimeMeanDaysHint: null,
      leadTimeStdDaysHint: null,
    },
  ],
  services: [{
    serviceId: 'service-1',
    name: 'Haircut',
    description: '',
    price: 12,
    archived: false,
    bundle: false,
  }],
  bundles: [],
  sharingMask: [],
};

function recordUpdateContextFromObservations(observations: SenaObservationRecord[]): SenaRecordUpdateContext {
  const tickets = observations.flatMap((observation) =>
    (observation.input.ticketEvents ?? []).map((event) => ({
      observationId: observation.observationId,
      observedAt: event.occurredAt,
      value: {
        ...event,
        revision: event.revision ?? 1,
        lines: event.lines ?? [],
      },
    })),
  );
  return {
    observationFingerprint: {
      count: observations.length,
      latestObservedAt: observations[0]?.input.observedAt ?? null,
      latestObservationId: observations[0]?.observationId ?? null,
    },
    latestObservedAt: observations[0]?.input.observedAt ?? null,
    latestStockBySku: {},
    latestRetailSaleBySku: {},
    latestServiceSaleByService: {},
    latestOrderBySku: {},
    latestReceiptBySku: {},
    openTicketsByFamily: {
      customer: tickets.map((ticket) => ticket.value).filter((ticket) => ticket.ticketFamily === 'customer' && ticket.lifecycle === 'open'),
      supplier: tickets.map((ticket) => ticket.value).filter((ticket) => ticket.ticketFamily === 'supplier' && ticket.lifecycle === 'open'),
    },
    latestTicketsById: Object.fromEntries(tickets.map((ticket) => [ticket.value.ticketId, ticket])),
    latestDeliveryFeeByBucket: {},
    recentActivity: [],
  };
}

function inventoryState(overrides: Record<string, unknown> = {}) {
  const observations = (overrides.observations ?? []) as SenaObservationRecord[];
  return {
    catalog,
    loadWorkSupportData: vi.fn(async () => null),
    observations: [],
    orderBatches: [],
    recordUpdateContext: recordUpdateContextFromObservations(observations),
    ...overrides,
  };
}

function installLocalStorageStub() {
  const values = new Map<string, string>();
  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    value: {
      clear: () => values.clear(),
      getItem: (key: string) => values.get(key) ?? null,
      removeItem: (key: string) => values.delete(key),
      setItem: (key: string, value: string) => values.set(key, value),
    },
  });
}

function LocationPreview() {
  const location = useLocation();
  return <div>{`${location.pathname}${location.search}`}</div>;
}

function HubRouteTestShell() {
  return (
    <>
      <LocationPreview />
      <Routes>
        <Route element={<RecordUpdateHubRoute />} path="/work/capture" />
        <Route element={<LocationPreview />} path={RECORD_UPDATE_CUSTOMER_PENDING_PATH} />
        <Route element={<LocationPreview />} path={RECORD_UPDATE_CUSTOMER_COMPLETED_PATH} />
        <Route element={<LocationPreview />} path={RECORD_UPDATE_SUPPLIER_PENDING_PATH} />
      </Routes>
    </>
  );
}

describe('RecordUpdateHubRoute', () => {
  beforeEach(() => {
    installLocalStorageStub();
    preferenceState.language = 'en';
    inventoryHook.mockReturnValue(inventoryState());
  });

  afterEach(() => {
    window.localStorage.clear();
  });

  it('renders ticket-first workflow cards and does not expose a standalone supplier receipt card', () => {
    render(
      <MemoryRouter>
        <RecordUpdateHubRoute />
      </MemoryRouter>,
    );

    expect(screen.getByText('Capture')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Stock Count' })).toHaveAttribute('href', RECORD_UPDATE_STOCK_COUNT_PATH);
    expect(screen.getByRole('button', { name: 'Customer Order' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Immediate Sale' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Supplier Order' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Supplier Receipts' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Custom' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Point of Sale View' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Form View' })).not.toBeInTheDocument();
    expect(window.localStorage.getItem(recordUpdateSessionViewStorageKey())).toBe('pos');
    expect(screen.getByText(/Choose the physical, customer, or supplier ticket flow/i)).toBeInTheDocument();
    expect(screen.queryByText('Coming soon')).not.toBeInTheDocument();
    expect(screen.queryByText('Available now')).not.toBeInTheDocument();
  });

  it('requests Work support data when the capture hub is opened cold', async () => {
    const loadWorkSupportData = vi.fn(async () => null);
    inventoryHook.mockReturnValue(inventoryState({ loadWorkSupportData }));

    render(
      <MemoryRouter initialEntries={['/work/capture']}>
        <HubRouteTestShell />
      </MemoryRouter>,
    );

    expect(loadWorkSupportData).toHaveBeenCalledWith();
  });

  it('uses the semantic danger tint for the immediate sale card', () => {
    render(
      <MemoryRouter>
        <RecordUpdateHubRoute />
      </MemoryRouter>,
    );

    expect(screen.getByRole('button', { name: 'Immediate Sale' })).toHaveClass('border-[#0D9488]/35', 'bg-[#0D9488]/12');
  });

  it('opens a new immediate sale directly when no draft exists', () => {
    render(
      <MemoryRouter initialEntries={['/work/capture']}>
        <HubRouteTestShell />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Immediate Sale' }));

    expect(screen.queryByText('What do you want to do?')).not.toBeInTheDocument();
    expect(screen.getAllByText('/work/capture/immediate-sale?ticketMode=new')[0]).toBeInTheDocument();
  });

  it('opens direct capture actions when draft storage is blocked', () => {
    const localStorageDescriptor = Object.getOwnPropertyDescriptor(window, 'localStorage');
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      get() {
        throw new Error('storage blocked');
      },
    });

    try {
      render(
        <MemoryRouter initialEntries={['/work/capture']}>
          <HubRouteTestShell />
        </MemoryRouter>,
      );

      fireEvent.click(screen.getByRole('button', { name: 'Immediate Sale' }));

      expect(screen.queryByText('What do you want to do?')).not.toBeInTheDocument();
      expect(screen.getAllByText('/work/capture/immediate-sale?ticketMode=new')[0]).toBeInTheDocument();
    } finally {
      if (localStorageDescriptor) {
        Object.defineProperty(window, 'localStorage', localStorageDescriptor);
      }
    }
  });

  it('resumes a saved immediate sale draft from the hub prompt', () => {
    const completedLane = RECORD_UPDATE_LANES.find((lane) => lane.id === 'customer-order-completed')!;
    window.localStorage.setItem(completedLane.draftStorageKey, '{"version":1}');

    render(
      <MemoryRouter initialEntries={['/work/capture']}>
        <HubRouteTestShell />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Immediate Sale' }));

    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByRole('button', { name: 'Resume draft' })).toBeEnabled();
    expect(within(dialog).queryByRole('button', { name: 'Edit/Update' })).not.toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole('button', { name: 'Resume draft' }));

    expect(screen.getAllByText('/work/capture/immediate-sale')[0]).toBeInTheDocument();
  });

  it('opens the customer order chooser on the hub and navigates with explicit new ticket mode', () => {
    inventoryHook.mockReturnValue(
      inventoryState({
        observations: [
          {
            observationId: 'obs-1',
            ownerSub: 'desktop-owner',
            input: {
              observedAt: '2026-04-03T12:00:00.000Z',
              stockSnapshot: [],
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
              ticketEvents: [
                {
                  ticketId: 'ticket-1',
                  ticketFamily: 'customer',
                  eventType: 'customer_order_pending',
                  lifecycle: 'open',
                  stage: 'open',
                  occurredAt: '2026-04-03T12:00:00.000Z',
                  lines: [],
                },
              ],
            },
          },
        ],
      }),
    );
    render(
      <MemoryRouter initialEntries={['/work/capture']}>
        <HubRouteTestShell />
      </MemoryRouter>,
    );

    expect(screen.getAllByText('/work/capture')[0]).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Customer Order' }));

    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveTextContent('What do you want to do?');
    expect(dialog).toHaveTextContent('Kaur Khor will create or update a durable ticket');
    expect(within(dialog).getByRole('button', { name: 'New' })).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Resume draft' })).toBeDisabled();
    expect(within(dialog).getByRole('button', { name: 'Edit/Update' })).toBeEnabled();
    expect(screen.getAllByText('/work/capture')[0]).toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole('button', { name: 'New' }));

    expect(screen.getAllByText('/work/capture/customer-order?ticketMode=new')[0]).toBeInTheDocument();
  });

  it('opens a new customer order directly when no draft or editable ticket exists', () => {
    render(
      <MemoryRouter initialEntries={['/work/capture']}>
        <HubRouteTestShell />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Customer Order' }));

    expect(screen.queryByText('What do you want to do?')).not.toBeInTheDocument();
    expect(screen.getAllByText('/work/capture/customer-order?ticketMode=new')[0]).toBeInTheDocument();
  });

  it('warns before starting a new ticket when that lane has a saved draft', () => {
    const customerPendingLane = RECORD_UPDATE_LANES.find((lane) => lane.id === 'customer-order-pending')!;
    window.localStorage.setItem(customerPendingLane.draftStorageKey, '{"version":1,"notes":"customer called"}');

    render(
      <MemoryRouter initialEntries={['/work/capture']}>
        <HubRouteTestShell />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Customer Order' }));

    const dialog = screen.getByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'New' }));

    expect(screen.getByText('Delete saved draft?')).toBeInTheDocument();
    expect(screen.queryByText('What do you want to do?')).not.toBeInTheDocument();
    expect(screen.getAllByText('/work/capture')[0]).toBeInTheDocument();
    expect(window.localStorage.getItem(customerPendingLane.draftStorageKey)).toBe('{"version":1,"notes":"customer called"}');

    fireEvent.click(screen.getByRole('button', { name: 'Delete draft and start new' }));

    expect(window.localStorage.getItem(customerPendingLane.draftStorageKey)).toBeNull();
    expect(screen.queryByText('What do you want to do?')).not.toBeInTheDocument();
    expect(screen.getAllByText('/work/capture/customer-order?ticketMode=new')[0]).toBeInTheDocument();
  });

  it('resumes a saved customer order draft from the hub prompt without forcing ticket mode navigation', () => {
    const customerPendingLane = RECORD_UPDATE_LANES.find((lane) => lane.id === 'customer-order-pending')!;
    window.localStorage.setItem(customerPendingLane.draftStorageKey, '{"version":1,"notes":"customer called"}');

    render(
      <MemoryRouter initialEntries={['/work/capture']}>
        <HubRouteTestShell />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Customer Order' }));

    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByRole('button', { name: 'Resume draft' })).toBeEnabled();
    expect(screen.getAllByText('/work/capture')[0]).toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole('button', { name: 'Resume draft' }));

    expect(screen.getAllByText('/work/capture/customer-order')[0]).toBeInTheDocument();
  });

  it('keeps supplier edit on the hub until a specific ticket is chosen', () => {
    inventoryHook.mockReturnValue(
      inventoryState({
        orderBatches: [
          {
            batchOrderId: 'batch-1',
            ownerSub: 'desktop-owner',
            supplierName: 'Mekong Looms',
            status: 'open',
            updatedAt: '2026-04-03T12:00:00.000Z',
            shared: {
              supplierName: 'Mekong Looms',
              expectedArrivalAt: null,
              supplierNote: '',
            },
            children: [],
          },
        ],
      }),
    );
    render(
      <MemoryRouter initialEntries={['/work/capture']}>
        <HubRouteTestShell />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Supplier Order' }));

    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveTextContent('What do you want to do?');
    expect(within(dialog).getByRole('button', { name: 'Edit/Update' })).toBeEnabled();
    expect(screen.getAllByText('/work/capture')[0]).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Edit/Update' }));

    const picker = screen.getByRole('dialog');
    expect(picker).toHaveTextContent('Edit / update existing supplier order');
    expect(picker).toHaveTextContent('0 SKUs · open');
    expect(screen.getAllByText('/work/capture')[0]).toBeInTheDocument();

    fireEvent.click(within(picker).getByRole('button', { name: /Mekong Looms/i }));

    expect(screen.getAllByText('/work/capture/supplier-order?ticketMode=edit&batchOrderId=batch-1')[0]).toBeInTheDocument();
  });

  it('shows catalog names instead of internal ids in the supplier ticket picker', () => {
    inventoryHook.mockReturnValue(
      inventoryState({
        observations: [
          {
            observationId: 'obs-supplier-ticket',
            ownerSub: 'desktop-owner',
            input: {
              observedAt: '2026-04-03T12:00:00.000Z',
              stockSnapshot: [],
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
              ticketEvents: [
                {
                  ticketId: 'supplier-ticket-1',
                  ticketFamily: 'supplier',
                  eventType: 'created',
                  lifecycle: 'open',
                  stage: 'ordered_waiting',
                  revision: 1,
                  occurredAt: '2026-04-03T12:00:00.000Z',
                  party: {
                    role: 'supplier',
                    supplierName: 'Mekong Looms',
                  },
                  lines: [
                    { entityType: 'sku', entityId: 'sku-1', orderedQuantity: 8 },
                    { entityType: 'sku', entityId: 'sku-2', orderedQuantity: 3 },
                  ],
                },
              ],
            },
          },
        ],
      }),
    );
    render(
      <MemoryRouter initialEntries={['/work/capture']}>
        <HubRouteTestShell />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Supplier Order' }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Edit/Update' }));

    const picker = screen.getByRole('dialog');
    expect(picker).toHaveTextContent('Mekong Looms');
    expect(picker).toHaveTextContent('Razor refill · 8u, Cotton towel · 3u');
    expect(picker).not.toHaveTextContent('sku-');
    expect(picker).not.toHaveTextContent('service-');
  });

  it('localizes legacy supplier batch option descriptions in Khmer mode', () => {
    preferenceState.language = 'km';
    inventoryHook.mockReturnValue(
      inventoryState({
        orderBatches: [
          {
            batchOrderId: 'batch-1',
            ownerSub: 'desktop-owner',
            supplierName: 'Mekong Looms',
            status: 'open',
            updatedAt: '2026-04-03T12:00:00.000Z',
            shared: {
              supplierName: 'Mekong Looms',
              expectedArrivalAt: null,
              supplierNote: '',
            },
            children: [{ skuId: 'sku-1' }, { skuId: 'sku-2' }],
          },
        ],
      }),
    );
    render(
      <MemoryRouter initialEntries={['/work/capture']}>
        <HubRouteTestShell />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole('button', { name: translateUiLiteral('km', 'Supplier Order') }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: translateUiLiteral('km', 'Edit/Update') }));

    const picker = screen.getByRole('dialog');
    expect(picker).toHaveTextContent('2 ធាតុស្តុក · កំពុងបើក');
    expect(picker).not.toHaveTextContent('SKU');
    expect(picker).not.toHaveTextContent('open');
  });

  it('opens a new supplier order directly when no draft or editable order exists', () => {
    render(
      <MemoryRouter initialEntries={['/work/capture']}>
        <HubRouteTestShell />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Supplier Order' }));

    expect(screen.queryByText('What do you want to do?')).not.toBeInTheDocument();
    expect(screen.getAllByText('/work/capture/supplier-order?ticketMode=new')[0]).toBeInTheDocument();
  });

  it('shows Draft saved only on cards with a saved draft for that update lane', () => {
    const stockCountLane = RECORD_UPDATE_LANES.find((lane) => lane.id === 'stock-count')!;
    const customerPendingLane = RECORD_UPDATE_LANES.find((lane) => lane.id === 'customer-order-pending')!;
    window.localStorage.setItem(stockCountLane.draftStorageKey, '{"version":1,"notes":"counted shelf"}');
    window.localStorage.setItem(customerPendingLane.draftStorageKey, '{"version":1,"notes":"customer called"}');

    render(
      <MemoryRouter>
        <RecordUpdateHubRoute />
      </MemoryRouter>,
    );

    expect(screen.getByRole('link', { name: 'Stock Count' })).toHaveTextContent('Draft saved');
    expect(screen.getByRole('button', { name: 'Customer Order' })).toHaveTextContent('Draft saved');
    expect(screen.getByRole('button', { name: 'Immediate Sale' })).not.toHaveTextContent('Draft saved');
    expect(screen.getByRole('button', { name: 'Supplier Order' })).not.toHaveTextContent('Draft saved');
  });

  it('does not show Draft saved for mode-only ticket drafts left by a clean entry prompt', () => {
    const customerPendingLane = RECORD_UPDATE_LANES.find((lane) => lane.id === 'customer-order-pending')!;
    const supplierPendingLane = RECORD_UPDATE_LANES.find((lane) => lane.id === 'supplier-order-pending')!;
    window.localStorage.setItem(customerPendingLane.draftStorageKey, '{"version":1,"customerTicketMode":"new"}');
    window.localStorage.setItem(supplierPendingLane.draftStorageKey, '{"version":1,"supplierTicketMode":"new"}');

    render(
      <MemoryRouter>
        <RecordUpdateHubRoute />
      </MemoryRouter>,
    );

    expect(screen.getByRole('button', { name: 'Customer Order' })).not.toHaveTextContent('Draft saved');
    expect(screen.getByRole('button', { name: 'Supplier Order' })).not.toHaveTextContent('Draft saved');
    expect(window.localStorage.getItem(customerPendingLane.draftStorageKey)).toBeNull();
    expect(window.localStorage.getItem(supplierPendingLane.draftStorageKey)).toBeNull();
  });

  it('keeps a hidden draft pill placeholder on cards without a saved draft', () => {
    render(
      <MemoryRouter>
        <RecordUpdateHubRoute />
      </MemoryRouter>,
    );

    const supplierOrderCard = screen.getByRole('button', { name: 'Supplier Order' });
    const draftPlaceholder = supplierOrderCard.querySelector('p[aria-hidden="true"]');

    expect(draftPlaceholder).toBeInTheDocument();
    expect(draftPlaceholder).toHaveClass('invisible');
  });

  it('keeps every visible hub card square', () => {
    render(
      <MemoryRouter>
        <RecordUpdateHubRoute />
      </MemoryRouter>,
    );

    for (const name of ['Stock Count', 'Supplier Order', 'Immediate Sale', 'Customer Order'] as const) {
      expect(screen.getByRole(name === 'Stock Count' ? 'link' : 'button', { name })).toHaveClass('aspect-square');
    }
  });

  it('uses the shared centered tile phone sizing hooks on every visible hub card', () => {
    render(
      <MemoryRouter>
        <RecordUpdateHubRoute />
      </MemoryRouter>,
    );

    for (const name of ['Stock Count', 'Supplier Order', 'Immediate Sale', 'Customer Order'] as const) {
      const card = screen.getByRole(name === 'Stock Count' ? 'link' : 'button', { name });

      expect(card).toHaveClass('h-full', 'w-full', 'min-w-0');
      expect(card.querySelector('[data-slot="centered-tile-card-title"]')).toBeInTheDocument();
      expect(card.querySelector('[data-slot="centered-tile-card-summary"]')).toBeInTheDocument();
      expect(card.querySelector('[data-slot="centered-tile-card-draft"]')).toBeInTheDocument();
    }
  });

  it('omits the liquid card layer in embedded compact mode', () => {
    render(
      <MemoryRouter>
        <RecordUpdateHubRoute embedded />
      </MemoryRouter>,
    );

    expect(screen.getByRole('link', { name: 'Stock Count' }).querySelector('.liquid-grid-card-glass')).not.toBeInTheDocument();
  });
});
