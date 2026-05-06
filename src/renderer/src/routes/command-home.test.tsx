import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { CommandHomeRoute } from './command-home';

const inventoryHook = vi.fn();
const preferencesHook = vi.fn();
const buildOverviewModel = vi.fn();

vi.mock('@/state/inventory', () => ({
  useInventory: () => inventoryHook(),
}));

vi.mock('@/state/preferences', () => ({
  usePreferences: () => preferencesHook(),
}));

vi.mock('./overview/view-model', () => ({
  buildOverviewModel: (...args: unknown[]) => buildOverviewModel(...args),
}));

vi.mock('@/lib/page-state-memory', () => ({
  buildRememberedCatalogHref: () => '/catalog',
  buildRememberedInboxHref: () => '/work/queue',
  buildRememberedInsightsHref: () => '/insights',
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

  test('shows only Start Work during the first empty-workspace onboarding state', () => {
    renderRoute();

    expect(screen.getByRole('link', { name: /Start Work/i })).toHaveAttribute('href', '/work/queue');
    expect(screen.queryByRole('link', { name: /Capture Update/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Open Catalog/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Open Insights/i })).not.toBeInTheDocument();
    expect(screen.queryByText('Open Catalog')).not.toBeInTheDocument();
    expect(screen.queryByText('Capture Update')).not.toBeInTheDocument();
    expect(screen.queryByText('Open Insights')).not.toBeInTheDocument();
  });

  test('uses a single column for the tile grid when only one action is visible', () => {
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
    expect(screen.getByRole('link', { name: /Open Catalog/i })).toHaveAttribute('href', '/catalog');
    expect(screen.getByRole('link', { name: /Open Insights/i })).toHaveAttribute('href', '/insights');
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

  test('hides insights when the analysis page is disabled', () => {
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

    expect(screen.queryByRole('link', { name: /Open Insights/i })).not.toBeInTheDocument();
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
    expect(screen.getByRole('link', { name: /Open Catalog/i })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Open Insights/i })).not.toBeInTheDocument();
    const grid = document.querySelector('[data-slot="centered-tile-grid"]');
    expect(grid).not.toBeNull();
    expect(grid).toHaveStyle({ '--centered-tile-columns': '3' });
  });
});
