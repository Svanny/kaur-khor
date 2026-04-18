import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  RECORD_UPDATE_CUSTOMER_COMPLETED_PATH,
  RECORD_UPDATE_LANES,
  RECORD_UPDATE_RECORD_ORDER_PATH,
  RECORD_UPDATE_RECORD_RECEIPT_PATH,
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

describe('RecordUpdateHubRoute', () => {
  beforeEach(() => {
    installLocalStorageStub();
  });

  afterEach(() => {
    window.localStorage.clear();
  });

  it('renders five rounded workflow cards and routes each one into its own session copy', () => {
    render(
      <MemoryRouter>
        <RecordUpdateHubRoute />
      </MemoryRouter>,
    );

    expect(screen.getByText('Choose an update lane')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Stock Count' })).toHaveAttribute('href', RECORD_UPDATE_STOCK_COUNT_PATH);
    expect(screen.getByRole('link', { name: 'Customer Orders Pending' })).toHaveAttribute('href', RECORD_UPDATE_SALES_UPDATE_PATH);
    expect(screen.getByRole('link', { name: 'Customer Orders Fulfilled' })).toHaveAttribute('href', RECORD_UPDATE_CUSTOMER_COMPLETED_PATH);
    expect(screen.getByRole('link', { name: 'Supplier Orders Pending' })).toHaveAttribute('href', RECORD_UPDATE_RECORD_ORDER_PATH);
    expect(screen.getByRole('link', { name: 'Supplier Receipts' })).toHaveAttribute('href', RECORD_UPDATE_RECORD_RECEIPT_PATH);
    expect(screen.queryByText('Coming soon')).not.toBeInTheDocument();
    expect(screen.queryByText('Available now')).not.toBeInTheDocument();
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
    expect(screen.getByRole('link', { name: 'Customer Orders Pending' })).toHaveTextContent('Draft saved');
    expect(screen.getByRole('link', { name: 'Customer Orders Fulfilled' })).not.toHaveTextContent('Draft saved');
    expect(screen.getByRole('link', { name: 'Supplier Orders Pending' })).not.toHaveTextContent('Draft saved');
    expect(screen.getByRole('link', { name: 'Supplier Receipts' })).not.toHaveTextContent('Draft saved');
  });
});
