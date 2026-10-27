import { useState } from 'react';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, Link, MemoryRouter, Route, RouterProvider, Routes, useLocation } from 'react-router-dom';
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

function HistoryEditor({ save }: { save?: () => Promise<boolean> }) {
  const [draft, setDraft] = useState('');
  const { discardConfirmDialog } = useRouteLeaveConfirm({
    enabled: Boolean(draft),
    onSave: save,
    onDiscard: () => setDraft(''),
  });
  return <>
    <input aria-label="Draft" value={draft} onChange={(event) => setDraft(event.target.value)} />
    <Link to="/target" state={{ preservedOrigin: '/source' }}>Open target</Link>
    {discardConfirmDialog}
  </>;
}

function renderHistoryEditor(save?: () => Promise<boolean>) {
  const router = createMemoryRouter([
    { path: '/source', element: <HistoryEditor save={save} /> },
    { path: '/target', element: <TargetPage /> },
  ], {
    initialEntries: [
      { pathname: '/target', state: { preservedOrigin: 'back entry' }, key: 'back-key' },
      { pathname: '/source', key: 'editor-key' },
      { pathname: '/target', state: { preservedOrigin: 'forward entry' }, key: 'forward-key' },
    ],
    initialIndex: 1,
  });
  const view = render(<RouterProvider router={router} />);
  return { router, dispose: () => { view.unmount(); router.dispose(); } };
}

describe('useRouteLeaveConfirm', () => {
  test.each([-1, 1])('preserves draft and history state after repeated cancelled navigation (%s)', async (direction) => {
    const user = userEvent.setup();
    const { router, dispose } = renderHistoryEditor();
    await user.type(screen.getByRole('textbox', { name: 'Draft' }), 'Exact unsaved draft');
    const editor = screen.getByRole('textbox', { name: 'Draft' });

    for (let attempt = 0; attempt < 2; attempt += 1) {
      await act(() => router.navigate(direction));
      expect(screen.getByRole('dialog')).toBeInTheDocument();
      await user.keyboard('{Escape}');
      expect(router.state.location.key).toBe('editor-key');
      expect(screen.getByRole('textbox', { name: 'Draft' })).toBe(editor);
      expect(editor).toHaveValue('Exact unsaved draft');
    }
    await act(() => router.navigate(direction));
    await user.click(screen.getByRole('button', { name: 'Discard changes' }));
    await waitFor(() => expect(router.state.location.key).toBe(direction < 0 ? 'back-key' : 'forward-key'));
    expect(screen.getByTestId('preserved-origin')).toHaveTextContent(direction < 0 ? 'back entry' : 'forward entry');
    await act(() => router.navigate(-direction));
    expect(router.state.location.key).toBe('editor-key');
    expect(screen.getByRole('textbox', { name: 'Draft' })).toHaveValue('');
    dispose();
  });

  test('keeps a failed save editable and retries the original history destination only once', async () => {
    const user = userEvent.setup();
    const save = vi.fn<() => Promise<boolean>>().mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    const { router, dispose } = renderHistoryEditor(save);
    await user.type(screen.getByRole('textbox', { name: 'Draft' }), 'Retry draft');
    await act(() => router.navigate(-1));
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Keep editing' }));
    expect(screen.getByRole('textbox', { name: 'Draft' })).toHaveValue('Retry draft');
    await act(() => router.navigate(-1));
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(router.state.location.key).toBe('back-key'));
    expect(save).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    dispose();
  });

  test('does not replace a pending save destination on repeated history navigation', async () => {
    const user = userEvent.setup();
    let finish!: (value: boolean) => void;
    const save = vi.fn(() => new Promise<boolean>((resolve) => { finish = resolve; }));
    const { router, dispose } = renderHistoryEditor(save);
    await user.type(screen.getByRole('textbox', { name: 'Draft' }), 'Pending draft');
    await act(() => router.navigate(-1));
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    await act(() => router.navigate(1));
    await user.keyboard('{Escape}');
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Keep editing' })).toBeDisabled();
    await act(async () => { finish(true); });
    await waitFor(() => expect(router.state.location.key).toBe('back-key'));
    expect(save).toHaveBeenCalledTimes(1);
    dispose();
  });

  test('lets clean history navigation pass without a warning', async () => {
    const { router, dispose } = renderHistoryEditor();
    await act(() => router.navigate(1));
    expect(router.state.location.key).toBe('forward-key');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    dispose();
  });

  test('keeps a dirty editor mounted when history Back is cancelled', async () => {
    const user = userEvent.setup();
    const router = createMemoryRouter([
      { path: '/source', element: <DirtySourcePage /> },
      { path: '/target', element: <TargetPage /> },
    ], { initialEntries: ['/target', '/source'] });
    render(<RouterProvider router={router} />);

    await act(() => router.navigate(-1));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Keep editing' }));
    expect(router.state.location.pathname).toBe('/source');
    expect(screen.getByRole('link', { name: 'Open target' })).toBeInTheDocument();
    router.dispose();
  });

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
