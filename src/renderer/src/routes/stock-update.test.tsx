import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { StockUpdateRoute } from './stock-update';

const inventoryHook = vi.fn();

vi.mock('../state/inventory', () => ({
  useInventory: () => inventoryHook(),
}));

describe('StockUpdateRoute', () => {
  it('renders the reusable operations title card and actions', () => {
    inventoryHook.mockReturnValue({
      isSaving: false,
      latestRun: null,
      observations: [],
      retrySenaRun: vi.fn(),
      triggerSenaRun: vi.fn(),
      workspaceSummary: null,
    });

    render(
      <MemoryRouter>
        <StockUpdateRoute />
      </MemoryRouter>,
    );

    expect(screen.getByText('Operations')).toBeInTheDocument();
    expect(screen.getByText('Interval evidence')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'New observation' })).toHaveAttribute('href', '/operations/session');
    expect(screen.getByRole('button', { name: 'Run analysis' })).toBeInTheDocument();
  });
});
