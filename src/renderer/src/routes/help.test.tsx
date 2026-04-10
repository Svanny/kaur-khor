import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { HelpRoute } from './help';

const preferencesHook = vi.fn();

vi.mock('@/state/preferences', () => ({
  usePreferences: () => preferencesHook(),
}));

describe('HelpRoute', () => {
  beforeEach(() => {
    preferencesHook.mockReturnValue({
      showFloatingTitleActions: false,
    });
    window.history.replaceState(null, '', '/');
  });

  test('filters help sections from the page search bar', () => {
    render(
      <MemoryRouter initialEntries={['/help']}>
        <HelpRoute />
      </MemoryRouter>,
    );

    expect(screen.getAllByText('Overview').length).toBeGreaterThan(0);
    expect(screen.getAllByText('FAQ').length).toBeGreaterThan(0);

    fireEvent.change(screen.getByRole('searchbox', { name: 'Search help' }), {
      target: { value: 'bak snap' },
    });

    expect(screen.getAllByText('Settings').length).toBeGreaterThan(0);
    expect(screen.queryAllByText('Overview')).toHaveLength(0);
    expect(screen.queryAllByText('Catalog')).toHaveLength(0);
    expect(screen.getByTestId('help-best-match-badge')).toBeInTheDocument();
  });

  test('highlights the best matched help section for fuzzy results', () => {
    render(
      <MemoryRouter initialEntries={['/help']}>
        <HelpRoute />
      </MemoryRouter>,
    );

    fireEvent.change(screen.getByRole('searchbox', { name: 'Search help' }), {
      target: { value: 'ovrview' },
    });

    expect(screen.getAllByText('Overview').length).toBeGreaterThan(0);
    expect(screen.getByTestId('help-best-match-badge').closest('[data-slot="card"]')).toHaveTextContent('Overview');
  });

  test('shows an empty state when no help section matches the query', () => {
    render(
      <MemoryRouter initialEntries={['/help']}>
        <HelpRoute />
      </MemoryRouter>,
    );

    fireEvent.change(screen.getByRole('searchbox', { name: 'Search help' }), {
      target: { value: 'zzzz-no-match' },
    });

    expect(screen.getByText('No matching help sections')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Clear search' })).toBeInTheDocument();
  });

  test('jumps to the matching guide card from the index', () => {
    const scrollIntoView = vi.fn();
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
      configurable: true,
      value: scrollIntoView,
    });

    render(
      <MemoryRouter initialEntries={['/help']}>
        <HelpRoute />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));

    expect(scrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth', block: 'start' });
    expect(window.location.hash).toBe('#settings');
  });
});
