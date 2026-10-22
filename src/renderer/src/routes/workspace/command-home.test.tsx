import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { CommandHomeRoute } from './command-home';

const inventoryHook = vi.fn();
const preferencesHook = vi.fn();
const buildOverviewModel = vi.fn();
const firstCatalog = {
  bundles: [],
  schemaVersion: 1,
  services: [],
  sharingMask: [],
  skus: [{
    archived: false,
    costPerUnit: 4,
    description: 'SKU',
    leadTimeMeanDaysHint: 5,
    leadTimeStdDaysHint: 1,
    name: 'SKU 1',
    productPrice: 9,
    skuId: 'sku-1',
    soldAsProduct: true,
  }],
};

vi.mock('@/state/inventory', () => ({
  useInventory: () => inventoryHook(),
}));

vi.mock('@/state/preferences', () => ({
  usePreferences: () => preferencesHook(),
}));

vi.mock('../overview/view-model', () => ({
  buildOverviewModel: (...args: unknown[]) => buildOverviewModel(...args),
}));

vi.mock('@/lib/settings/page-state-memory', () => ({
  buildRememberedCatalogHref: () => '/catalog',
  buildRememberedInboxHref: () => '/work/queue',
  buildRememberedInventoryHref: () => '/insights/inventory',
  usePageStateMemoryVersion: () => undefined,
}));

describe('CommandHomeRoute', () => {
  beforeEach(() => {
    inventoryHook.mockReturnValue({
      catalog: null,
      latestRun: null,
      observations: [],
      orderBatches: [],
      workspaceSummary: null,
    });
    preferencesHook.mockReturnValue({
      language: 'en',
      showAnalysisPage: true,
    });
    buildOverviewModel.mockReturnValue({
      tasks: [],
    });
  });

  function renderRoute() {
    return render(
      <MemoryRouter>
        <CommandHomeRoute />
      </MemoryRouter>,
    );
  }

  test('takes an empty workspace directly to its required first stock item', () => {
    renderRoute();

    expect(screen.getByRole('link', { name: /Create first SKU/i })).toHaveAttribute('href', '/catalog/skus/new');
    expect(screen.queryByRole('link', { name: /Create first service/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Start Work/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Capture Update/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Open Products/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Open Inventory/i })).not.toBeInTheDocument();
    expect(screen.queryByText('Open Products')).not.toBeInTheDocument();
    expect(screen.queryByText('Capture Update')).not.toBeInTheDocument();
    expect(screen.queryByText('Open Inventory')).not.toBeInTheDocument();
  });

  test('uses one column for the first product action', () => {
    renderRoute();

    const page = document.querySelector('[data-slot="command-home-page"]');
    const summaryGrid = document.querySelector('[data-slot="command-home-summary-grid"]');
    const grid = document.querySelector('[data-slot="centered-tile-grid"]');
    expect(page).not.toBeNull();
    expect(summaryGrid).not.toBeNull();
    expect(grid).not.toBeNull();
    expect(page).toHaveAttribute('data-fit-viewport', 'true');
    expect(grid).toHaveClass('command-home-action-grid');
    expect(grid).toHaveStyle({ '--centered-tile-columns': '1' });
    expect(grid).toHaveStyle({
      '--centered-grid-max-inline-size': 'calc(1 * var(--centered-tile-max-size) + 0 * var(--centered-tile-gap))',
    });
  });

  test('offers the first products update directly after product creation', () => {
    inventoryHook.mockReturnValue({ catalog: firstCatalog, observations: [] });

    renderRoute();

    expect(screen.getByRole('link', { name: /Capture first update/i })).toHaveAttribute('href', '/work/capture/stock-count');
    expect(screen.getByRole('link', { name: /Open Products/i })).toHaveAttribute('href', '/catalog');
    expect(screen.queryByRole('link', { name: /Start Work/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Create first/i })).not.toBeInTheDocument();
  });

  test('keeps capture available for active services when stock items are archived', () => {
    inventoryHook.mockReturnValue({
      catalog: { ...firstCatalog, skus: [{ ...firstCatalog.skus[0], archived: true }], services: [{ serviceId: 'service-1', name: 'Service', description: '', price: 10, archived: false, bundle: false }] },
      observations: [],
    });

    renderRoute();

    expect(screen.getByText('1 items')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Capture first update/i })).toHaveAttribute('href', '/work/capture/stock-count');
    expect(screen.queryByRole('link', { name: /Create first/i })).not.toBeInTheDocument();
  });

  test('offers creation again when every product is archived', () => {
    inventoryHook.mockReturnValue({
      catalog: { ...firstCatalog, skus: [{ ...firstCatalog.skus[0], archived: true }] },
      observationFingerprint: { count: 3 },
    });

    renderRoute();

    expect(screen.getByRole('link', { name: /Create first SKU/i })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Capture/i })).not.toBeInTheDocument();
  });

  test.each([
    { observations: [{ observationId: 'obs-1' }] },
    { observationFingerprint: { count: 1 } },
    { latestRun: { observationCount: 1 } },
    { workspaceSummary: { intervalCount: 1 } },
  ])('keeps established work out of setup with compact evidence: %j', (evidence) => {
    inventoryHook.mockReturnValue({ catalog: firstCatalog, ...evidence });

    renderRoute();

    expect(screen.getByRole('link', { name: /Start Work/i })).toHaveAttribute('href', '/work/queue');
    expect(screen.getByRole('link', { name: /Capture Update/i })).toHaveAttribute('href', '/work/capture');
    expect(screen.queryByRole('link', { name: /Capture first update/i })).not.toBeInTheDocument();
    expect(screen.getByText('1 updates')).toBeInTheDocument();
  });

  test.each([null, firstCatalog])('localizes first-use guidance fully in Khmer', (catalog) => {
    inventoryHook.mockReturnValue({ catalog, observations: [] });
    preferencesHook.mockReturnValue({ language: 'km', showAnalysisPage: true });

    const { container } = renderRoute();

    expect(container.textContent).not.toMatch(/[A-Za-z]/);
    expect(screen.getAllByRole('link').length).toBeGreaterThan(0);
  });

  test('shows every actionable card once the workspace is unlocked', () => {
    inventoryHook.mockReturnValue({
      catalog: {
        bundles: [],
        schemaVersion: 1,
        services: [],
        sharingMask: [],
        skus: [
          {
            archived: false,
            costPerUnit: 4,
            description: 'SKU',
            leadTimeMeanDaysHint: 5,
            leadTimeStdDaysHint: 1,
            name: 'SKU 1',
            productPrice: 9,
            skuId: 'sku-1',
            soldAsProduct: true,
          },
        ],
      },
      latestRun: null,
      observations: [{ observationId: 'obs-1' }, { observationId: 'obs-2' }],
      orderBatches: [],
      workspaceSummary: null,
    });
    buildOverviewModel.mockReturnValue({
      tasks: [{ actionLabel: 'Review supplier queue' }],
    });

    renderRoute();

    expect(screen.getByText('Review supplier queue')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Start Work/i })).toHaveAttribute('href', '/work/queue');
    expect(screen.getByRole('link', { name: /Capture Update/i })).toHaveAttribute('href', '/work/capture');
    expect(screen.getByRole('link', { name: /Open Products/i })).toHaveAttribute('href', '/catalog');
    expect(screen.getByRole('link', { name: /Open Inventory/i })).toHaveAttribute('href', '/insights/inventory');
  });

  test('stretches the action link wrapper to the centered grid track', () => {
    inventoryHook.mockReturnValue({
      catalog: {
        bundles: [],
        schemaVersion: 1,
        services: [],
        sharingMask: [],
        skus: [
          {
            archived: false,
            costPerUnit: 4,
            description: 'SKU',
            leadTimeMeanDaysHint: 5,
            leadTimeStdDaysHint: 1,
            name: 'SKU 1',
            productPrice: 9,
            skuId: 'sku-1',
            soldAsProduct: true,
          },
        ],
      },
      latestRun: null,
      observations: [{ observationId: 'obs-1' }],
      orderBatches: [],
      workspaceSummary: null,
    });

    renderRoute();

    expect(screen.getByRole('link', { name: /Start Work/i })).toHaveClass('h-full');
  });

  test('marks action card labels and descriptions as Khmer-safe display text', () => {
    inventoryHook.mockReturnValue({
      catalog: {
        bundles: [],
        schemaVersion: 1,
        services: [],
        sharingMask: [],
        skus: [
          {
            archived: false,
            costPerUnit: 4,
            description: 'SKU',
            leadTimeMeanDaysHint: 5,
            leadTimeStdDaysHint: 1,
            name: 'SKU 1',
            productPrice: 9,
            skuId: 'sku-1',
            soldAsProduct: true,
          },
        ],
      },
      latestRun: null,
      observations: [{ observationId: 'obs-1' }],
      orderBatches: [],
      workspaceSummary: null,
    });
    preferencesHook.mockReturnValue({
      language: 'km',
      showAnalysisPage: true,
    });

    renderRoute();

    expect(screen.getAllByText('ចាប់ផ្តើមការងារ').some((node) => node.className.includes('khmer-safe-display'))).toBe(true);
    expect(screen.getByText('កត់ត្រាការអាប់ដេត').className).toContain('khmer-safe-display');
    expect(screen.getByText('បើកការងារអ្នកផ្គត់ផ្គង់ អតិថិជន និងការទទួលសំណើ ដែលត្រូវការសេចក្តីសម្រេច។').className).toContain('khmer-safe-display');
    expect(screen.getByText('រក្សាទុកការរាប់ស្តុក ការបញ្ជាទិញអតិថិជន ការលក់ ការបញ្ជាទិញអ្នកផ្គត់ផ្គង់ ឬព្រឹត្តិការណ៍ផ្ទាល់ខ្លួន។').className).toContain('khmer-safe-display');
  });

  test('hides inventory when the analysis page is disabled', () => {
    preferencesHook.mockReturnValue({
      language: 'en',
      showAnalysisPage: false,
    });
    inventoryHook.mockReturnValue({
      catalog: {
        bundles: [],
        schemaVersion: 1,
        services: [],
        sharingMask: [],
        skus: [
          {
            archived: false,
            costPerUnit: 4,
            description: 'SKU',
            leadTimeMeanDaysHint: 5,
            leadTimeStdDaysHint: 1,
            name: 'SKU 1',
            productPrice: 9,
            skuId: 'sku-1',
            soldAsProduct: true,
          },
        ],
      },
      latestRun: null,
      observations: [{ observationId: 'obs-1' }, { observationId: 'obs-2' }],
      orderBatches: [],
      workspaceSummary: null,
    });

    renderRoute();

    expect(screen.queryByRole('link', { name: /Open Inventory/i })).not.toBeInTheDocument();
  });

  test('uses three columns when exactly three action cards are visible', () => {
    inventoryHook.mockReturnValue({
      catalog: {
        bundles: [],
        schemaVersion: 1,
        services: [],
        sharingMask: [],
        skus: [
          {
            archived: false,
            costPerUnit: 4,
            description: 'SKU',
            leadTimeMeanDaysHint: 5,
            leadTimeStdDaysHint: 1,
            name: 'SKU 1',
            productPrice: 9,
            skuId: 'sku-1',
            soldAsProduct: true,
          },
        ],
      },
      latestRun: null,
      observations: [{ observationId: 'obs-1' }],
      orderBatches: [],
      workspaceSummary: null,
    });

    renderRoute();

    expect(screen.getByRole('link', { name: /Start Work/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Capture Update/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Open Products/i })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Open Inventory/i })).not.toBeInTheDocument();
    const grid = document.querySelector('[data-slot="centered-tile-grid"]');
    expect(grid).not.toBeNull();
    expect(grid).toHaveStyle({ '--centered-tile-columns': '3' });
  });
});
