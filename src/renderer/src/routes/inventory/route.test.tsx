import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { getTranslation } from '@/lib/translations';
import { InsightsInventoryRoute } from './index';

const inventoryHook = vi.fn();
const preferencesHook = vi.fn();

vi.mock('@/state/inventory', () => ({
  useInventory: () => inventoryHook(),
  useInventoryActions: () => inventoryHook(),
  useInventoryState: () => inventoryHook(),
}));

vi.mock('@/state/preferences', () => ({
  usePreferences: () => preferencesHook(),
}));

vi.mock('@/routes/performance/use-sena-detail-hydration', () => ({
  useSenaDetailHydration: () => ({
    isHydratingDetails: false,
    serviceDetailsById: {},
    skuDetailsById: {},
  }),
}));

function mockPreferences() {
  preferencesHook.mockReturnValue({
    language: 'en',
    showAnalysisPage: true,
    showHeartbeatRibbons: true,
    showRightRailCards: true,
    t: (
      key: Parameters<typeof getTranslation>[1],
      variables?: Parameters<typeof getTranslation>[2],
    ) => getTranslation('en', key, variables),
  });
}

const catalog = {
  bundles: [],
  schemaVersion: 1,
  services: [
    {
      archived: false,
      bundle: false,
      description: 'Haircut',
      imagePath: null,
      name: 'Haircut',
      price: 20,
      serviceId: 'service-haircut',
    },
  ],
  sharingMask: [{ enabled: true, serviceId: 'service-haircut', skuId: 'sku-razor', usageProbability: 1 }],
  skus: [
    {
      archived: false,
      costPerUnit: 4,
      description: 'Refill cartridge',
      imagePath: null,
      leadTimeMeanDaysHint: 5,
      leadTimeStdDaysHint: 1,
      name: 'Razor Refill',
      productPrice: 10,
      skuId: 'sku-razor',
      soldAsProduct: true,
      supplierName: 'Salon Tools',
    },
    {
      archived: false,
      costPerUnit: 3,
      description: 'Retail shampoo',
      imagePath: null,
      leadTimeMeanDaysHint: 4,
      leadTimeStdDaysHint: 1,
      name: 'Shampoo Classic',
      productPrice: 12,
      skuId: 'sku-shampoo',
      soldAsProduct: true,
      supplierName: 'Mekong Looms',
    },
  ],
};

const workspaceSummary = {
  highRiskSkuIds: ['sku-razor'],
  intervalCount: 3,
  latestObservedAt: '2026-04-03T08:00:00.000Z',
  ownerSub: 'desktop-owner',
  pendingReorderCount: 1,
  runId: 'run-1',
  serviceCount: 1,
  skuCount: 2,
  skuSummaries: [
    {
      credibleIntervalHigh: 8,
      credibleIntervalLow: 1,
      daysOfCover: 1,
      demandPerDayMean: 3,
      expectedLeadTimeDemand: 12,
      latestPosteriorUnits: 4,
      leadTimeMeanDays: 5,
      leadTimeStdDays: 1,
      reorderPoint: 10,
      reorderTriggerProbability: 0.82,
      regimeProbabilities: { normal: 1 },
      safetyStock: 3,
      skuId: 'sku-razor',
      stockoutRisk: 0.76,
    },
    {
      credibleIntervalHigh: 35,
      credibleIntervalLow: 25,
      daysOfCover: 30,
      demandPerDayMean: 1,
      expectedLeadTimeDemand: 4,
      latestPosteriorUnits: 30,
      leadTimeMeanDays: 4,
      leadTimeStdDays: 1,
      reorderPoint: 8,
      reorderTriggerProbability: 0.1,
      regimeProbabilities: { normal: 1 },
      safetyStock: 2,
      skuId: 'sku-shampoo',
      stockoutRisk: 0.05,
    },
  ],
  topRegime: 'normal',
};

function createInventoryState(overrides: Record<string, unknown> = {}) {
  return {
    catalog,
    isLoading: false,
    observations: [],
    recordUpdateContext: {
      latestObservedAt: '2026-04-03T08:00:00.000Z',
      latestStockBySku: {
        'sku-razor': {
          observationId: 'obs-1',
          observedAt: '2026-04-02T08:00:00.000Z',
          value: { costPerUnit: 4, productPrice: 10, skuId: 'sku-razor', unitsInStock: 4 },
        },
      },
      observationFingerprint: { count: 1, latestObservationId: 'obs-1', latestObservedAt: '2026-04-03T08:00:00.000Z' },
      latestRetailSaleBySku: {},
      latestServiceSaleByService: {},
      latestOrderBySku: {},
      latestReceiptBySku: {},
      openTicketsByFamily: { customer: [], supplier: [] },
      latestTicketsById: {},
      latestDeliveryFeeByBucket: {},
      recentActivity: [],
    },
    workspaceSummary,
    ...overrides,
  };
}

function renderRoute(initialEntry = '/insights/inventory') {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Routes>
        <Route element={<InsightsInventoryRoute />} path="/insights/inventory" />
      </Routes>
    </MemoryRouter>,
  );
}

describe('InsightsInventoryRoute', () => {
  beforeEach(() => {
    mockPreferences();
    inventoryHook.mockReturnValue(createInventoryState());
  });

  test('renders the SKU-first inventory health grid by default', () => {
    renderRoute();

    expect(screen.getAllByText('Inventory')[0]).toBeInTheDocument();
    expect(screen.getByText('Stock on hand, in/out flow, cover, inbound pipeline, and projections.')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Inventory health grid' })).toBeInTheDocument();
    expect(screen.getAllByText('Razor Refill').length).toBeGreaterThan(0);
    expect(screen.queryByText('Haircut')).not.toBeInTheDocument();
    expect(screen.getAllByText('On hand').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Cover').length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole('button', { name: 'Next column page' }));
    expect(screen.getAllByText('Pipeline').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Freshness').length).toBeGreaterThan(0);
  });

  test('shows all SKU rows when row set is all', () => {
    renderRoute('/insights/inventory?rows=all');

    expect(screen.getAllByText('Razor Refill').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Shampoo Classic').length).toBeGreaterThan(0);
  });

  test('switches view presets through the URL-backed controls', () => {
    renderRoute('/insights/inventory?rows=all');

    fireEvent.click(screen.getByRole('combobox', { name: 'Select inventory view preset' }));
    fireEvent.click(screen.getByRole('option', { name: 'Flow' }));

    expect(screen.getAllByText('Units in').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Units out').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Adjustments').length).toBeGreaterThan(0);
  });

  test('renders service sellability rows without treating them as stock rows', () => {
    renderRoute('/insights/inventory?scope=services&rows=all');

    expect(screen.getAllByText('Haircut').length).toBeGreaterThan(0);
    expect(screen.getAllByText('1 contributor').length).toBeGreaterThan(0);
  });

  test('renders required empty states', () => {
    inventoryHook.mockReturnValue(createInventoryState({
      catalog: { bundles: [], schemaVersion: 1, services: [], sharingMask: [], skus: [] },
      workspaceSummary: null,
    }));

    renderRoute();

    expect(screen.getByText('No inventory items yet.')).toBeInTheDocument();
    expect(screen.getByText('Create your first SKU to start tracking inventory health.')).toBeInTheDocument();
  });
});
