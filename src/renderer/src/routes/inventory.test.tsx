import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { getTranslation } from '@/lib/translations';
import { InventoryRoute } from './inventory';

const inventoryHook = vi.fn();
const preferencesHook = vi.fn();

vi.mock('@/state/inventory', () => ({
  useInventory: () => inventoryHook(),
}));

vi.mock('@/state/preferences', () => ({
  usePreferences: () => preferencesHook(),
}));

vi.mock('./automations', () => ({
  AutomationsRoute: () => <div>Embedded automations</div>,
}));

function mockEnglishPreferences() {
  preferencesHook.mockReturnValue({
    currency: 'USD',
    language: 'en',
    showAutomationsPage: false,
    t: (
      key: Parameters<typeof getTranslation>[1],
      variables?: Parameters<typeof getTranslation>[2],
    ) => getTranslation('en', key, variables),
    usdToKhrExchangeRate: 4000,
  });
}

function makeProductsInventory(overrides: Record<string, unknown> = {}) {
  const catalog = {
    bundles: [],
    schemaVersion: 1,
    services: [
      {
        archived: false,
        bundle: false,
        description: 'Service',
        imagePath: null,
        name: 'Service 1',
        price: 15,
        serviceId: 'service-1',
      },
    ],
    sharingMask: [{ enabled: true, serviceId: 'service-1', skuId: 'sku-1', usageProbability: null }],
    skus: [
      {
        archived: false,
        costPerUnit: 4,
        description: 'Cotton tee',
        imagePath: null,
        leadTimeMeanDaysHint: 5,
        leadTimeStdDaysHint: 1,
        name: 'SKU 1',
        productPrice: 9,
        skuId: 'sku-1',
        soldAsProduct: true,
        supplierName: 'Mekong Looms',
      },
      {
        archived: false,
        costPerUnit: 2,
        description: 'Thread',
        imagePath: null,
        leadTimeMeanDaysHint: 3,
        leadTimeStdDaysHint: 0.5,
        name: 'SKU 2',
        productPrice: 5,
        skuId: 'sku-2',
        soldAsProduct: true,
        supplierName: null,
      },
    ],
  };

  return {
    catalog,
    diagnostics: null,
    isLoading: false,
    isSaving: false,
    listSenaObservationPage: vi.fn(async () => ({
      hasOlder: false,
      nextCursor: null,
      observations: [],
    })),
    listSenaOrderBatches: vi.fn(async () => []),
    loadSenaServiceDetail: vi.fn(async () => null),
    loadSenaSkuDetail: vi.fn(async () => null),
    observations: [],
    orderBatches: [],
    reports: [],
    snapshot: null,
    upsertSenaCatalog: vi.fn(async (payload) => payload),
    deleteCatalogEntity: vi.fn(async () => catalog),
    workspaceSummary: null,
    ...overrides,
  };
}

describe('InventoryRoute', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  test('does not embed automations from catalog when automations are hidden', () => {
    inventoryHook.mockReturnValue({
      catalog: {
        bundles: [],
        schemaVersion: 1,
        services: [],
        sharingMask: [],
        skus: [],
      },
      observations: [],
      reports: [],
      snapshot: null,
      workspaceSummary: null,
      listSenaObservationPage: vi.fn(async () => ({
        hasOlder: false,
        nextCursor: null,
        observations: [],
      })),
      listSenaOrderBatches: vi.fn(async () => []),
    });
    mockEnglishPreferences();

    render(
      <MemoryRouter initialEntries={['/catalog?section=automation']}>
        <InventoryRoute />
      </MemoryRouter>,
    );

    expect(screen.queryByText('Embedded automations')).not.toBeInTheDocument();
    expect(screen.getByText('Offered Selections')).toBeInTheDocument();
  });

  test('lazy-loads SKU detail when catalog row actions open', async () => {
    const loadSenaSkuDetail = vi.fn(async () => ({
      summary: {
        skuId: 'sku-1',
        latestPosteriorUnits: 9,
        credibleIntervalLow: 6,
        credibleIntervalHigh: 12,
        demandPerDayMean: 2,
        stockoutRisk: 0.4,
        daysOfCover: 4,
        expectedLeadTimeDemand: 8,
        safetyStock: 3,
        reorderPoint: 7,
        reorderTriggerProbability: 0.55,
        reorderQuantity: {
          recommendedUnits: 6,
          ungatedRecommendedUnits: 6,
          likelyRangeLow: 5,
          likelyRangeHigh: 7,
          needProbability: 0.91,
          recommendationIssued: true,
          recommendationQuantile: 0.7,
          intervalLowQuantile: 0.1,
          intervalHighQuantile: 0.9,
          needProbabilityGate: 0.5,
          reviewDelayDays: 2,
        },
        leadTimeMeanDays: 5,
        leadTimeStdDays: 1,
        regimeProbabilities: { normal: 1 },
      },
      inventoryPosterior: [],
      demandPosterior: [],
      pipelinePosterior: [],
      leadTimePosterior: [],
    }));
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
            description: 'Cotton tee',
            imagePath: null,
            leadTimeMeanDaysHint: 5,
            leadTimeStdDaysHint: 1,
            name: 'SKU 1',
            productPrice: 9,
            skuId: 'sku-1',
            soldAsProduct: true,
            supplierName: 'Mekong Looms',
          },
        ],
      },
      diagnostics: null,
      isLoading: false,
      isSaving: false,
      loadSenaSkuDetail,
      listSenaObservationPage: vi.fn(async () => ({
        hasOlder: false,
        nextCursor: null,
        observations: [],
      })),
      listSenaOrderBatches: vi.fn(async () => []),
      observations: [
        {
          observationId: 'obs-1',
          ownerSub: 'desktop-owner',
          input: {
            observedAt: '2026-04-02T00:00:00Z',
            stockSnapshot: [],
            serviceRankings: [],
            retailRankings: [],
            serviceStockouts: [],
            retailStockouts: [],
            orderSignals: [],
            servicePrices: [],
            retailPrices: [],
            leadTimeHints: [],
            adjustmentSignals: [],
            commercialEvents: [],
            ticketEvents: [],
            recipeUsageHints: [],
          },
        },
      ],
      orderBatches: [],
      reports: [],
      snapshot: {
        ranking: [],
        services: [],
        sist: {
          asOf: '2026-04-02T00:00:00Z',
          highRiskSkuIds: ['sku-1'],
          pendingReorderCount: 1,
          settings: {
            forecastHorizonDays: 14,
            particleCount: 512,
            smoothingWindowReports: 90,
            targetServiceLevel: 0.95,
          },
          skuInsights: [],
          status: {
            confidence: 'medium',
            reason: null,
            reportCount: 1,
            state: 'ready',
            updatedAt: '2026-04-02T00:00:00Z',
          },
          topRegime: 'normal',
        },
        skus: [
          {
            costPerUnit: 4,
            description: 'Cotton tee',
            leadTimeMeanDays: 5,
            leadTimeStdDays: 1,
            name: 'SKU 1',
            productPrice: 9,
            skuId: 'sku-1',
            soldAsProduct: true,
            unitsInStock: 12,
          },
        ],
      },
      workspaceSummary: {
        highRiskSkuIds: ['sku-1'],
        intervalCount: 1,
        latestObservedAt: '2026-04-02T00:00:00Z',
        ownerSub: 'desktop-owner',
        pendingReorderCount: 1,
        runId: 'run-1',
        serviceCount: 0,
        skuCount: 1,
        skuSummaries: [],
        topRegime: 'normal',
      },
    });
    mockEnglishPreferences();

    render(
      <MemoryRouter initialEntries={['/catalog']}>
        <InventoryRoute />
      </MemoryRouter>,
    );

    const skuRow = screen.getByRole('link', { name: 'SKU 1' }).closest('div.group');
    expect(skuRow).not.toBeNull();
    expect(loadSenaSkuDetail).not.toHaveBeenCalled();

    fireEvent.click(within(skuRow!).getByRole('button', { name: 'More actions for SKU 1' }));

    await waitFor(() => {
      expect(loadSenaSkuDetail).toHaveBeenCalledWith('sku-1');
    });
    expect(loadSenaSkuDetail).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('button', { name: 'Record' })).not.toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Supplier Order' })).toBeInTheDocument();
  });

  test('shows Products row duplicate archive delete actions in order', async () => {
    const state = makeProductsInventory();
    inventoryHook.mockReturnValue(state);
    mockEnglishPreferences();

    render(
      <MemoryRouter initialEntries={['/catalog']}>
        <InventoryRoute />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(state.listSenaObservationPage).toHaveBeenCalled();
    });
    const skuRow = screen.getByRole('link', { name: 'SKU 1' }).closest('div.group');
    const serviceRow = screen.getByRole('link', { name: 'Service 1' }).closest('div.group');
    expect(skuRow).not.toBeNull();
    expect(serviceRow).not.toBeNull();

    expect(skuRow!.textContent).toMatch(/Detail.*Edit.*Duplicate.*Archive.*Delete/s);
    expect(serviceRow!.textContent).toMatch(/Detail.*Edit.*Duplicate.*Archive.*Delete/s);
  });

  test('duplicates a SKU from metadata without writing observations', async () => {
    const state = makeProductsInventory();
    inventoryHook.mockReturnValue(state);
    mockEnglishPreferences();

    render(
      <MemoryRouter initialEntries={['/catalog']}>
        <InventoryRoute />
      </MemoryRouter>,
    );

    const skuRow = screen.getByRole('link', { name: 'SKU 1' }).closest('div.group');
    expect(skuRow).not.toBeNull();
    fireEvent.click(within(skuRow!).getByRole('button', { name: 'Duplicate' }));

    await waitFor(() => {
      expect(state.upsertSenaCatalog).toHaveBeenCalledTimes(1);
    });
    const nextCatalog = vi.mocked(state.upsertSenaCatalog).mock.calls[0][0];
    expect(nextCatalog.skus.at(-1)).toMatchObject({
      costPerUnit: 4,
      description: 'Cotton tee',
      leadTimeMeanDaysHint: 5,
      leadTimeStdDaysHint: 1,
      name: 'SKU 1 (copy)',
      productPrice: 9,
      soldAsProduct: true,
      supplierName: 'Mekong Looms',
    });
    expect(nextCatalog.sharingMask.filter((entry) => entry.skuId === nextCatalog.skus.at(-1)?.skuId)).toHaveLength(0);
  });

  test('duplicates a service with linked SKU metadata only', async () => {
    const state = makeProductsInventory();
    inventoryHook.mockReturnValue(state);
    mockEnglishPreferences();

    render(
      <MemoryRouter initialEntries={['/catalog']}>
        <InventoryRoute />
      </MemoryRouter>,
    );

    const serviceRow = screen.getByRole('link', { name: 'Service 1' }).closest('div.group');
    expect(serviceRow).not.toBeNull();
    fireEvent.click(within(serviceRow!).getByRole('button', { name: 'Duplicate' }));

    await waitFor(() => {
      expect(state.upsertSenaCatalog).toHaveBeenCalledTimes(1);
    });
    const nextCatalog = vi.mocked(state.upsertSenaCatalog).mock.calls[0][0];
    const serviceCopy = nextCatalog.services.at(-1);
    expect(serviceCopy).toMatchObject({
      bundle: false,
      description: 'Service',
      name: 'Service 1 (copy)',
      price: 15,
    });
    expect(nextCatalog.sharingMask).toContainEqual({
      enabled: true,
      serviceId: serviceCopy?.serviceId,
      skuId: 'sku-1',
      usageProbability: null,
    });
  });

  test('deletes an eligible service after confirmation', async () => {
    const state = makeProductsInventory();
    inventoryHook.mockReturnValue(state);
    mockEnglishPreferences();

    render(
      <MemoryRouter initialEntries={['/catalog']}>
        <InventoryRoute />
      </MemoryRouter>,
    );

    const serviceRow = screen.getByRole('link', { name: 'Service 1' }).closest('div.group');
    expect(serviceRow).not.toBeNull();
    const deleteButton = within(serviceRow!).getByRole('button', { name: 'Delete' });
    await waitFor(() => {
      expect(deleteButton).not.toHaveAttribute('aria-disabled');
    });
    fireEvent.click(deleteButton);
    const dialog = screen.getByText('Delete Service 1?').closest('[role="dialog"]');
    expect(dialog).not.toBeNull();
    fireEvent.click(within(dialog!).getByRole('button', { name: 'Delete' }));

    await waitFor(() => {
      expect(state.deleteCatalogEntity).toHaveBeenCalledWith({
        entityId: 'service-1',
        entityType: 'service',
      });
    });
  });

  test('explains why an ineligible delete cannot run', async () => {
    const state = makeProductsInventory();
    inventoryHook.mockReturnValue(state);
    mockEnglishPreferences();

    render(
      <MemoryRouter initialEntries={['/catalog']}>
        <InventoryRoute />
      </MemoryRouter>,
    );

    const skuRow = screen.getByRole('link', { name: 'SKU 1' }).closest('div.group');
    expect(skuRow).not.toBeNull();
    const deleteButton = within(skuRow!).getByRole('button', { name: 'Delete' });
    await waitFor(() => {
      expect(deleteButton).toHaveAttribute('aria-disabled', 'true');
    });
    fireEvent.click(deleteButton);

    expect(screen.getByText('Cannot delete SKU 1')).toBeInTheDocument();
    expect(screen.getByText('This SKU is linked to a service. Unlink it from services before deleting it.')).toBeInTheDocument();
  });
});
