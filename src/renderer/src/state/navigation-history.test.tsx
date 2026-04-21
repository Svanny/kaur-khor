import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Link, MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { describe, expect, test, vi } from 'vitest';
import { RouteBackButton } from '@/components/system/page-navigation';
import { buildBanjiNavigationState, NavigationHistoryProvider } from './navigation-history';

vi.mock('@/state/preferences', () => ({
  usePreferences: () => ({
    t: () => 'Back',
  }),
}));

function CurrentPath() {
  const location = useLocation();
  return <div data-testid="path">{location.pathname}</div>;
}

function OverviewPage() {
  const location = useLocation();
  return (
    <div>
      <CurrentPath />
      <Link state={buildBanjiNavigationState(location, '/catalog')} to="/catalog/skus/sku-1">
        Open SKU
      </Link>
    </div>
  );
}

function FinancialsPage() {
  const location = useLocation();
  return (
    <div>
      <CurrentPath />
      <Link state={buildBanjiNavigationState(location, '/catalog')} to="/catalog/skus/sku-1">
        Open financial SKU
      </Link>
    </div>
  );
}

function ServiceDetailPage() {
  const location = useLocation();
  return (
    <div>
      <CurrentPath />
      <Link state={buildBanjiNavigationState(location, '/catalog')} to="/catalog/skus/sku-1">
        Open linked SKU
      </Link>
    </div>
  );
}

function NestedDetailPage() {
  return (
    <div>
      <CurrentPath />
      <RouteBackButton />
    </div>
  );
}

function renderHistoryApp(initialEntries: Array<string | { pathname: string; state?: unknown }>) {
  return render(
    <MemoryRouter initialEntries={initialEntries}>
      <NavigationHistoryProvider>
        <Routes>
          <Route element={<OverviewPage />} path="/" />
          <Route element={<FinancialsPage />} path="/financials" />
          <Route element={<ServiceDetailPage />} path="/catalog/services/:serviceId" />
          <Route element={<div data-testid="path">/catalog</div>} path="/catalog" />
          <Route element={<NestedDetailPage />} path="/catalog/skus/:skuId" />
        </Routes>
      </NavigationHistoryProvider>
    </MemoryRouter>,
  );
}

describe('NavigationHistoryProvider', () => {
  test('returns to overview when sku detail was opened from overview', async () => {
    const user = userEvent.setup();
    renderHistoryApp(['/']);

    await user.click(screen.getByRole('link', { name: 'Open SKU' }));
    expect(screen.getByTestId('path')).toHaveTextContent('/catalog/skus/sku-1');

    await user.click(screen.getByRole('button', { name: 'Back' }));
    expect(screen.getByTestId('path')).toHaveTextContent('/');
  });

  test('returns to service detail when sku detail was opened from a linked service view', async () => {
    const user = userEvent.setup();
    renderHistoryApp(['/catalog/services/service-1']);

    await user.click(screen.getByRole('link', { name: 'Open linked SKU' }));
    expect(screen.getByTestId('path')).toHaveTextContent('/catalog/skus/sku-1');

    await user.click(screen.getByRole('button', { name: 'Back' }));
    expect(screen.getByTestId('path')).toHaveTextContent('/catalog/services/service-1');
  });

  test('returns to financials when sku detail was opened from financials', async () => {
    const user = userEvent.setup();
    renderHistoryApp(['/financials']);

    await user.click(screen.getByRole('link', { name: 'Open financial SKU' }));
    expect(screen.getByTestId('path')).toHaveTextContent('/catalog/skus/sku-1');

    await user.click(screen.getByRole('button', { name: 'Back' }));
    expect(screen.getByTestId('path')).toHaveTextContent('/financials');
  });

  test('falls back to catalog when a nested page is opened directly', async () => {
    const user = userEvent.setup();
    renderHistoryApp([{ pathname: '/catalog/skus/sku-1' }]);

    await user.click(screen.getByRole('button', { name: 'Back' }));
    expect(screen.getByTestId('path')).toHaveTextContent('/catalog');
  });
});
