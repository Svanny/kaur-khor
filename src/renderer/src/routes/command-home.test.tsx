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

    const grid = document.querySelector('.grid.min-h-0.flex-1.place-items-center');
    expect(grid).not.toBeNull();
    expect(grid).toHaveStyle({ '--centered-tile-columns': '1' });
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
    const grid = document.querySelector('.grid.min-h-0.flex-1.place-items-center');
    expect(grid).not.toBeNull();
    expect(grid).toHaveStyle({ '--centered-tile-columns': '3' });
  });
});
