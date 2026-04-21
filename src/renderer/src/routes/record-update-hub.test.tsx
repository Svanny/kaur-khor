import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  RECORD_UPDATE_CUSTOMER_COMPLETED_PATH,
  RECORD_UPDATE_CUSTOM_PATH,
  RECORD_UPDATE_LANES,
  RECORD_UPDATE_RECORD_ORDER_PATH,
  RECORD_UPDATE_SALES_UPDATE_PATH,
  RECORD_UPDATE_STOCK_COUNT_PATH,
} from '@/lib/record-update-routes';
import { RecordUpdateHubRoute } from './record-update-hub';

vi.mock('../state/preferences', () => ({
  usePreferences: () => ({
    language: 'en',
    showFloatingTitleActions: false,
  }),
}));

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

describe('RecordUpdateHubRoute', () => {
  beforeEach(() => {
    installLocalStorageStub();
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

    expect(screen.getByText('Choose an update lane')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Stock Count' })).toHaveAttribute('href', RECORD_UPDATE_STOCK_COUNT_PATH);
    expect(screen.getByRole('button', { name: 'Customer Order' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Immediate Sale' })).toHaveAttribute('href', RECORD_UPDATE_CUSTOMER_COMPLETED_PATH);
    expect(screen.getByRole('button', { name: 'Supplier Order' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Supplier Receipts' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Custom' })).toBeInTheDocument();
    expect(screen.queryByText('Coming soon')).not.toBeInTheDocument();
    expect(screen.queryByText('Available now')).not.toBeInTheDocument();
  });

  it('opens the customer order chooser on the hub and navigates with explicit ticket mode', () => {
    render(
      <MemoryRouter initialEntries={['/record-update']}>
        <Routes>
          <Route element={<RecordUpdateHubRoute />} path="/record-update" />
          <Route element={<LocationPreview />} path={RECORD_UPDATE_SALES_UPDATE_PATH} />
        </Routes>
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Customer Order' }));

    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveTextContent('What do you want to do?');
    expect(within(dialog).getByRole('button', { name: 'New customer order' })).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Edit / update existing customer order' })).toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole('button', { name: 'Edit / update existing customer order' }));

    expect(screen.getByText('/record-update/customer-orders-pending?ticketMode=edit')).toBeInTheDocument();
  });

  it('opens the supplier order chooser on the hub and navigates with explicit ticket mode', () => {
    render(
      <MemoryRouter initialEntries={['/record-update']}>
        <Routes>
          <Route element={<RecordUpdateHubRoute />} path="/record-update" />
          <Route element={<LocationPreview />} path={RECORD_UPDATE_RECORD_ORDER_PATH} />
        </Routes>
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Supplier Order' }));

    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveTextContent('What do you want to do?');
    fireEvent.click(within(dialog).getByRole('button', { name: 'New supplier order' }));

    expect(screen.getByText('/record-update/supplier-orders-pending?ticketMode=new')).toBeInTheDocument();
  });

  it('opens a custom wizard popup and navigates with selected lanes', () => {
    render(
      <MemoryRouter initialEntries={['/record-update']}>
        <Routes>
          <Route element={<RecordUpdateHubRoute />} path="/record-update" />
          <Route element={<LocationPreview />} path={RECORD_UPDATE_CUSTOM_PATH} />
        </Routes>
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Custom' }));

    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveTextContent('Build a custom update');
    expect(within(dialog).getByRole('button', { name: 'Start custom update' })).toBeDisabled();

    fireEvent.click(within(dialog).getByLabelText('Stock Count'));
    fireEvent.click(within(dialog).getByLabelText('Supplier Order'));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Start custom update' }));

    expect(screen.getByText('/record-update/custom?lanes=stock-count%2Csupplier-order-pending')).toBeInTheDocument();
  });

  it('shows Draft saved only on cards with a saved draft for that update lane', () => {
    const stockCountLane = RECORD_UPDATE_LANES.find((lane) => lane.id === 'stock-count')!;
    const customerPendingLane = RECORD_UPDATE_LANES.find((lane) => lane.id === 'customer-order-pending')!;
    const customLane = RECORD_UPDATE_LANES.find((lane) => lane.id === 'custom')!;
    window.localStorage.setItem(stockCountLane.draftStorageKey, '{"version":1}');
    window.localStorage.setItem(customerPendingLane.draftStorageKey, '{"version":1}');
    window.localStorage.setItem(customLane.draftStorageKey, '{"version":1}');

    render(
      <MemoryRouter>
        <RecordUpdateHubRoute />
      </MemoryRouter>,
    );

    expect(screen.getByRole('link', { name: 'Stock Count' })).toHaveTextContent('Draft saved');
    expect(screen.getByRole('button', { name: 'Customer Order' })).toHaveTextContent('Draft saved');
    expect(screen.getByRole('link', { name: 'Immediate Sale' })).not.toHaveTextContent('Draft saved');
    expect(screen.getByRole('button', { name: 'Supplier Order' })).not.toHaveTextContent('Draft saved');
    expect(screen.getByRole('button', { name: 'Custom' })).toHaveTextContent('Draft saved');
  });

  it('keeps a hidden draft pill placeholder on cards without a saved draft', () => {
    render(
      <MemoryRouter>
        <RecordUpdateHubRoute />
      </MemoryRouter>,
    );

    const customCard = screen.getByRole('button', { name: 'Custom' });
    const draftPlaceholder = customCard.querySelector('p[aria-hidden="true"]');

    expect(draftPlaceholder).toBeInTheDocument();
    expect(draftPlaceholder).toHaveClass('invisible');
  });
});
