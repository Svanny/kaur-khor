import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Link, MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { describe, expect, test, vi } from 'vitest';
import { resolveInternalNavigationPath, useRouteLeaveConfirm } from './use-route-leave-confirm';

vi.mock('@/state/preferences', () => ({
  usePreferences: () => ({
    language: 'en',
  }),
}));

function makeAnchor(href: string, attributes: Record<string, string> = {}) {
  const anchor = document.createElement('a');
  anchor.href = href;
  for (const [name, value] of Object.entries(attributes)) {
    anchor.setAttribute(name, value);
  }
  return anchor;
}

describe('resolveInternalNavigationPath', () => {
  test('resolves same-origin app links', () => {
    expect(resolveInternalNavigationPath(makeAnchor('/inventory?filter=open#top'))).toBe('/inventory?filter=open#top');
    expect(resolveInternalNavigationPath(makeAnchor(`${window.location.origin}/#/work/queue`))).toBe('/work/queue');
  });

  test('ignores external links and browser-owned link intents', () => {
    expect(resolveInternalNavigationPath(makeAnchor('https://example.com/inventory'))).toBeNull();
    expect(resolveInternalNavigationPath(makeAnchor('#availability'))).toBeNull();
    expect(resolveInternalNavigationPath(makeAnchor('/exports/report.json', { download: 'report.json' }))).toBeNull();
    expect(resolveInternalNavigationPath(makeAnchor('/settings', { target: '_blank' }))).toBeNull();
    expect(resolveInternalNavigationPath(makeAnchor('/settings', { target: 'reports' }))).toBeNull();
  });
});

function DirtySourcePage() {
  const { discardConfirmDialog } = useRouteLeaveConfirm({ enabled: true });
  return (
    <div>
      <Link state={{ preservedOrigin: '/source' }} to="/target">
        Open target
      </Link>
      {discardConfirmDialog}
    </div>
  );
}

function TargetPage() {
  const location = useLocation();
  const state = location.state as { preservedOrigin?: string } | null;
  return <div data-testid="preserved-origin">{state?.preservedOrigin ?? 'missing'}</div>;
}

describe('useRouteLeaveConfirm', () => {
  test('preserves React Router link state after confirming a guarded link navigation', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={['/source']}>
        <Routes>
          <Route element={<DirtySourcePage />} path="/source" />
          <Route element={<TargetPage />} path="/target" />
        </Routes>
      </MemoryRouter>,
    );

    await user.click(screen.getByRole('link', { name: 'Open target' }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Discard changes' }));

    expect(screen.getByTestId('preserved-origin')).toHaveTextContent('/source');
  });
});
