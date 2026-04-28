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
import { RecordUpdateHubRoute } from './record-update-hub';

const inventoryHook = vi.fn();

vi.mock('../state/preferences', () => ({
  usePreferences: () => ({
    language: 'en',
    showFloatingTitleActions: false,
  }),
}));

vi.mock('@/state/inventory', () => ({
  useInventory: () => inventoryHook(),
}));

function inventoryState(overrides: Record<string, unknown> = {}) {
  return {
    observations: [],
    orderBatches: [],
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

  it('uses the semantic danger tint for the immediate sale card', () => {
    render(
      <MemoryRouter>
        <RecordUpdateHubRoute />
      </MemoryRouter>,
    );

    expect(screen.getByRole('button', { name: 'Immediate Sale' })).toHaveClass('border-[#0D9488]/35', 'bg-[#0D9488]/12');
  });

  it('opens the immediate sale prompt without an edit-update action', () => {
    render(
      <MemoryRouter initialEntries={['/work/capture']}>
        <HubRouteTestShell />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Immediate Sale' }));

    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveTextContent('What do you want to do?');
    expect(within(dialog).getByRole('button', { name: 'New' })).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Resume draft' })).toBeDisabled();
    expect(within(dialog).queryByRole('button', { name: 'Edit/Update' })).not.toBeInTheDocument();
    expect(screen.getAllByText('/work/capture')[0]).toBeInTheDocument();
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
    expect(dialog).toHaveTextContent('banj will create or update a durable ticket');
    expect(within(dialog).getByRole('button', { name: 'New' })).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Resume draft' })).toBeDisabled();
    expect(within(dialog).getByRole('button', { name: 'Edit/Update' })).toBeEnabled();
    expect(screen.getAllByText('/work/capture')[0]).toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole('button', { name: 'New' }));

    expect(screen.getAllByText('/work/capture/customer-order?ticketMode=new')[0]).toBeInTheDocument();
  });

  it('warns before starting a new ticket when that lane has a saved draft', () => {
    const customerPendingLane = RECORD_UPDATE_LANES.find((lane) => lane.id === 'customer-order-pending')!;
    window.localStorage.setItem(customerPendingLane.draftStorageKey, '{"version":1}');

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
    expect(window.localStorage.getItem(customerPendingLane.draftStorageKey)).toBe('{"version":1}');

    fireEvent.click(screen.getByRole('button', { name: 'Delete draft and start new' }));

    expect(window.localStorage.getItem(customerPendingLane.draftStorageKey)).toBeNull();
    expect(screen.queryByText('What do you want to do?')).not.toBeInTheDocument();
    expect(screen.getAllByText('/work/capture/customer-order?ticketMode=new')[0]).toBeInTheDocument();
  });

  it('resumes a saved customer order draft from the hub prompt without forcing ticket mode navigation', () => {
    const customerPendingLane = RECORD_UPDATE_LANES.find((lane) => lane.id === 'customer-order-pending')!;
    window.localStorage.setItem(customerPendingLane.draftStorageKey, '{"version":1}');

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
    expect(screen.getAllByText('/work/capture')[0]).toBeInTheDocument();

    fireEvent.click(within(picker).getByRole('button', { name: /Mekong Looms/i }));

    expect(screen.getAllByText('/work/capture/supplier-order?ticketMode=edit&batchOrderId=batch-1')[0]).toBeInTheDocument();
  });

  it('disables edit-update in the hub prompt when no editable supplier receipts or orders exist', () => {
    render(
      <MemoryRouter initialEntries={['/work/capture']}>
        <HubRouteTestShell />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Supplier Order' }));

    expect(within(screen.getByRole('dialog')).getByRole('button', { name: 'Resume draft' })).toBeDisabled();
    expect(within(screen.getByRole('dialog')).getByRole('button', { name: 'Edit/Update' })).toBeDisabled();
    expect(screen.getAllByText('/work/capture')[0]).toBeInTheDocument();
  });

  it('shows Draft saved only on cards with a saved draft for that update lane', () => {
    const stockCountLane = RECORD_UPDATE_LANES.find((lane) => lane.id === 'stock-count')!;
    const customerPendingLane = RECORD_UPDATE_LANES.find((lane) => lane.id === 'customer-order-pending')!;
    window.localStorage.setItem(stockCountLane.draftStorageKey, '{"version":1}');
    window.localStorage.setItem(customerPendingLane.draftStorageKey, '{"version":1}');

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
});
