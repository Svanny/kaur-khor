import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { StockUpdateRoute } from './stock-update';

const inventoryHook = vi.fn();

vi.mock('../state/inventory', () => ({
  useInventory: () => inventoryHook(),
}));

vi.mock('../state/preferences', () => ({
  usePreferences: () => ({
    t: (key: string) => {
      if (key === 'searchPlaceholder') {
        return 'Search name, description, or id…';
      }
      if (key === 'searchItems') {
        return 'Search and segment';
      }
      if (key === 'operationsFilterEverything') {
        return 'All';
      }
      if (key === 'filterSku') {
        return 'SKUs';
      }
      if (key === 'filterService') {
        return 'Services';
      }
      if (key === 'catalogSenaSkuEvidencePrevious') {
        return 'Previous evidence page';
      }
      if (key === 'catalogSenaSkuEvidenceNext') {
        return 'Next evidence page';
      }
      if (key === 'catalogSenaSkuEvidenceFirst') {
        return 'First';
      }
      if (key === 'catalogSenaSkuEvidenceLast') {
        return 'Last';
      }
      if (key === 'catalogSenaSkuEvidencePageLabel') {
        return 'Page {current} of {total}';
      }
      return key;
    },
  }),
}));

const sampleCatalog = {
  schemaVersion: 1,
  skus: [
    {
      skuId: 'sku-1',
      name: 'Razor refill',
      description: 'Refill pack',
      costPerUnit: 4,
      soldAsProduct: true,
      productPrice: 9,
      leadTimeMeanDaysHint: 5,
      leadTimeStdDaysHint: 1,
    },
  ],
  services: [
    {
      serviceId: 'service-1',
      name: 'Haircut',
      description: '',
      price: 12,
      bundle: false,
    },
  ],
  bundles: [],
  sharingMask: [{ serviceId: 'service-1', skuId: 'sku-1', enabled: true, usageProbability: 1 }],
};

const sampleObservations = [
  {
    observationId: 'obs-sku',
    ownerSub: 'desktop-owner',
    input: {
      observedAt: '2026-04-03T08:00:00.000Z',
      stockSnapshot: [{ skuId: 'sku-1', unitsInStock: 12, costPerUnit: 4, productPrice: 9 }],
      serviceRankings: [],
      retailRankings: [],
      serviceStockouts: [],
      retailStockouts: [],
      orderSignals: [],
      servicePrices: [],
      retailPrices: [],
      leadTimeHints: [],
      notes: 'Razor refill checked',
    },
  },
  {
    observationId: 'obs-service',
    ownerSub: 'desktop-owner',
    input: {
      observedAt: '2026-04-02T08:00:00.000Z',
      stockSnapshot: [],
      serviceRankings: ['Haircut'],
      retailRankings: [],
      serviceStockouts: [],
      retailStockouts: [],
      orderSignals: [],
      servicePrices: [{ serviceId: 'service-1', price: 14 }],
      retailPrices: [],
      leadTimeHints: [],
      notes: 'Haircut price updated',
    },
  },
];

describe('StockUpdateRoute', () => {
  it('renders the reusable operations title card and actions', () => {
    inventoryHook.mockReturnValue({
      catalog: sampleCatalog,
      isSaving: false,
      latestRun: null,
      observations: sampleObservations,
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
    expect(screen.getByPlaceholderText('Search name, description, or id…')).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'All' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'SKUs' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Services' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'New observation' })).toHaveAttribute('href', '/operations/session');
    expect(screen.getByRole('button', { name: 'Run analysis' })).toBeInTheDocument();
    expect(screen.getByText('Captured observations (2)')).toBeInTheDocument();
    expect(screen.queryByText('Page 1 of 1')).not.toBeInTheDocument();
  });

  it('updates the captured observations title and list for scope and search filters', () => {
    inventoryHook.mockReturnValue({
      catalog: sampleCatalog,
      isSaving: false,
      latestRun: null,
      observations: sampleObservations,
      retrySenaRun: vi.fn(),
      triggerSenaRun: vi.fn(),
      workspaceSummary: null,
    });

    render(
      <MemoryRouter>
        <StockUpdateRoute />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole('radio', { name: 'SKUs' }));
    expect(screen.getByText('Captured observations for SKUs (1)')).toBeInTheDocument();
    expect(screen.getByText('Razor refill checked')).toBeInTheDocument();
    expect(screen.queryByText('Haircut price updated')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('radio', { name: 'Services' }));
    expect(screen.getByText('Captured observations for Services (2)')).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText('Search name, description, or id…'), {
      target: { value: 'Haircut' },
    });
    expect(screen.getByText('Captured observations for Services (2)')).toBeInTheDocument();
    expect(screen.getByText('Haircut price updated')).toBeInTheDocument();
    expect(screen.getByText('Razor refill checked')).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText('Search name, description, or id…'), {
      target: { value: 'price updated' },
    });
    expect(screen.getByText('Captured observations for Services (1)')).toBeInTheDocument();
    expect(screen.getByText('Haircut price updated')).toBeInTheDocument();
    expect(screen.queryByText('Razor refill checked')).not.toBeInTheDocument();
  });

  it('orders captured observations from newest to oldest', () => {
    inventoryHook.mockReturnValue({
      catalog: sampleCatalog,
      isSaving: false,
      latestRun: null,
      observations: [
        sampleObservations[1],
        sampleObservations[0],
      ],
      retrySenaRun: vi.fn(),
      triggerSenaRun: vi.fn(),
      workspaceSummary: null,
    });

    render(
      <MemoryRouter>
        <StockUpdateRoute />
      </MemoryRouter>,
    );

    const renderedTimestamps = screen
      .getAllByText(/2026-04-0[23]T08:00:00.000Z/)
      .map((element) => element.textContent);

    expect(renderedTimestamps).toEqual([
      '2026-04-03T08:00:00.000Z',
      '2026-04-02T08:00:00.000Z',
    ]);
  });

  it('reuses the evidence timeline pager only when report count exceeds one page', () => {
    const pagedObservations = Array.from({ length: 6 }, (_, index) => ({
      observationId: `obs-${index}`,
      ownerSub: 'desktop-owner',
      input: {
        observedAt: `2026-04-${String(6 - index).padStart(2, '0')}T08:00:00.000Z`,
        stockSnapshot: [{ skuId: 'sku-1', unitsInStock: 10 + index, costPerUnit: 4, productPrice: 9 }],
        serviceRankings: [],
        retailRankings: [],
        serviceStockouts: [],
        retailStockouts: [],
        orderSignals: [],
        servicePrices: [],
        retailPrices: [],
        leadTimeHints: [],
        notes: `Observation ${6 - index}`,
      },
    }));

    inventoryHook.mockReturnValue({
      catalog: sampleCatalog,
      isSaving: false,
      latestRun: null,
      observations: pagedObservations,
      retrySenaRun: vi.fn(),
      triggerSenaRun: vi.fn(),
      workspaceSummary: null,
    });

    render(
      <MemoryRouter>
        <StockUpdateRoute />
      </MemoryRouter>,
    );

    expect(screen.getByText('Page 1 of 2')).toBeInTheDocument();
    expect(screen.getByText('Observation 6')).toBeInTheDocument();
    expect(screen.getByText('Observation 2')).toBeInTheDocument();
    expect(screen.queryByText('Observation 1')).not.toBeInTheDocument();

    fireEvent.click(screen.getByLabelText('Next evidence page'));

    expect(screen.getByText('Page 2 of 2')).toBeInTheDocument();
    expect(screen.getByText('Observation 1')).toBeInTheDocument();

    fireEvent.click(screen.getByText('First'));

    expect(screen.getByText('Page 1 of 2')).toBeInTheDocument();
    expect(screen.getByText('Observation 6')).toBeInTheDocument();
  });
});
