import { StrictMode, useState } from 'react';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Link, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, expect, test, vi } from 'vitest';
import { useRouteLeaveConfirm } from '@/hooks/use-route-leave-confirm';
import { AppHashRouter } from './app-hash-router';

vi.mock('@/state/preferences', () => ({ usePreferences: () => ({ language: 'en' }) }));

afterEach(() => window.history.replaceState(null, '', '/'));

function Editor({ save }: { save?: () => Promise<boolean> }) {
  const [draft, setDraft] = useState('');
  const { discardConfirmDialog } = useRouteLeaveConfirm({ enabled: Boolean(draft), onSave: save });
  return <>
    <input aria-label="Draft" value={draft} onChange={(event) => setDraft(event.target.value)} />
    <Link to="/later">Later page</Link>
    {discardConfirmDialog}
  </>;
}

function Home({ label }: { label: string }) {
  const location = useLocation();
  return <>
    <h1>{label}</h1>
    <output>{location.key}</output>
    <Link to="/editor">Edit</Link>
  </>;
}

function Fixture({ label = 'Home', save }: { label?: string; save?: () => Promise<boolean> }) {
  return <StrictMode><AppHashRouter basename="/workspace">
    <Routes>
      <Route path="/" element={<Home label={label} />} />
      <Route path="/editor" element={<Editor save={save} />} />
      <Route path="/later" element={<Home label="Later" />} />
    </Routes>
  </AppHashRouter></StrictMode>;
}

test('owns one live router in StrictMode and preserves children updates and indexed history', async () => {
  window.history.replaceState(null, '', '/#/workspace/');
  const user = userEvent.setup();
  const view = render(<Fixture />);
  expect(screen.getByRole('heading', { name: 'Home' })).toBeInTheDocument();
  const homeKey = screen.getByRole('status').textContent;
  view.rerender(<Fixture label="Updated home" />);
  expect(screen.getByRole('heading', { name: 'Updated home' })).toBeInTheDocument();
  await user.click(screen.getByRole('link', { name: 'Edit' }));
  await user.type(screen.getByRole('textbox', { name: 'Draft' }), 'Keep exactly');
  const editor = screen.getByRole('textbox', { name: 'Draft' });
  const editorState = window.history.state;
  const length = window.history.length;

  act(() => window.history.back());
  await screen.findByRole('dialog');
  await waitFor(() => expect(window.location.hash).toBe('#/workspace/editor'));
  await user.keyboard('{Escape}');
  expect(screen.getByRole('textbox', { name: 'Draft' })).toBe(editor);
  expect(editor).toHaveValue('Keep exactly');
  expect(window.history.state).toEqual(editorState);
  expect(window.history.length).toBe(length);

  act(() => window.history.back());
  await screen.findByRole('dialog');
  await user.click(screen.getByRole('button', { name: 'Discard changes' }));
  await screen.findByRole('heading', { name: 'Updated home' });
  expect(screen.getByRole('status')).toHaveTextContent(homeKey!);
  expect(window.history.length).toBe(length);
  act(() => window.history.forward());
  await screen.findByRole('textbox', { name: 'Draft' });
  expect(window.history.state).toEqual(editorState);
  expect(screen.getByRole('textbox', { name: 'Draft' })).toHaveValue('');
  view.unmount();
});

test('pending save keeps its native history destination through a later Forward attempt', async () => {
  window.history.replaceState(null, '', '/#/workspace/');
  const user = userEvent.setup();
  let finish!: (value: boolean) => void;
  const save = vi.fn(() => new Promise<boolean>((resolve) => { finish = resolve; }));
  const view = render(<Fixture save={save} />);
  const homeState = window.history.state;
  await user.click(screen.getByRole('link', { name: 'Edit' }));
  const editorState = window.history.state;
  await user.click(screen.getByRole('link', { name: 'Later page' }));
  const laterState = window.history.state;
  act(() => window.history.back());
  await screen.findByRole('textbox', { name: 'Draft' });
  await user.type(screen.getByRole('textbox', { name: 'Draft' }), 'Save once');
  act(() => window.history.back());
  await screen.findByRole('dialog');
  await waitFor(() => expect(window.history.state).toEqual(editorState));
  await user.click(screen.getByRole('button', { name: 'Save changes' }));
  const forwardEvents = vi.fn();
  window.addEventListener('popstate', forwardEvents);
  act(() => window.history.forward());
  await waitFor(() => expect(forwardEvents).toHaveBeenCalledTimes(2));
  window.removeEventListener('popstate', forwardEvents);
  await waitFor(() => expect(window.history.state).toEqual(editorState));
  await user.keyboard('{Escape}');
  expect(screen.getByRole('dialog')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Keep editing' })).toBeDisabled();
  await act(async () => finish(true));
  await screen.findByRole('heading', { name: 'Home' });
  expect(window.history.state).toEqual(homeState);
  expect(save).toHaveBeenCalledTimes(1);
  act(() => window.history.go(2));
  await screen.findByRole('heading', { name: 'Later' });
  expect(window.history.state).toEqual(laterState);
  view.unmount();
});

test('removes history listeners on unmount', () => {
  window.history.replaceState(null, '', '/#/workspace/');
  const add = vi.spyOn(window, 'addEventListener');
  const remove = vi.spyOn(window, 'removeEventListener');
  const view = render(<Fixture />);
  const historyListeners = add.mock.calls.filter(([type]) => type === 'popstate');
  expect(historyListeners.length).toBeGreaterThan(0);
  view.unmount();
  for (const [, listener] of historyListeners) {
    expect(remove).toHaveBeenCalledWith('popstate', listener);
  }
  add.mockRestore();
  remove.mockRestore();
});
