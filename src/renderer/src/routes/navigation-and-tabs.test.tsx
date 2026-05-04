import type { ReactNode } from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { INTERVAL_PAGE_SIZE } from '@/components/system/interval-strip';
import { getTranslation } from '@/lib/translations';
import { InventoryRoute } from './inventory';
import { ServiceDetailRoute } from './service-detail';
import { SkuDetailRoute } from './sku-detail';
import { NavigationHistoryProvider } from '@/state/navigation-history';

const inventoryHook = vi.fn();
const preferenceState = {
  currency: 'USD',
  language: 'en',
  showRightRailCards: true,
};

function mockResponsiveToggleWidths({ availableWidth, contentWidth }: { availableWidth: number; contentWidth: number }) {
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', {
    configurable: true,
    get() {
      if (this instanceof HTMLElement && this.dataset.slot === 'responsive-toggle-filter-measure') {
        return contentWidth;
      }
      return availableWidth;
    },
  });
  Object.defineProperty(HTMLElement.prototype, 'scrollWidth', {
    configurable: true,
    get() {
      if (this instanceof HTMLElement && this.dataset.slot === 'responsive-toggle-filter-measure') {
        return contentWidth;
      }
      return availableWidth;
    },
  });
}

vi.mock('../state/inventory', () => ({
  useInventory: () => inventoryHook(),
  useInventoryActions: () => inventoryHook(),
  useInventoryState: () => inventoryHook(),
}));

vi.mock('../state/preferences', () => ({
  usePreferences: () => ({
    currency: preferenceState.currency,
    language: preferenceState.language,
    showRightRailCards: preferenceState.showRightRailCards,
    t: (key: string, variables?: Record<string, string | number | null | undefined>) =>
      getTranslation('en', key as never, variables),
  }),
}));

const sampleCatalog = {
  schemaVersion: 1,
  skus: [
    {
      costPerUnit: 4,
      description: 'Cotton tee',
      leadTimeMeanDaysHint: 5,
      leadTimeStdDaysHint: 1,
      name: 'SKU 1',
      productPrice: 9,
      skuId: 'sku-1',
      soldAsProduct: true,
    },
  ],
  services: [
    {
      bundle: false,
      description: 'Service',
      name: 'Service 1',
      price: 15,
      serviceId: 'service-1',
    },
  ],
  bundles: [],
  sharingMask: [{ enabled: true, serviceId: 'service-1', skuId: 'sku-1', usageProbability: null }],
};

describe('SENA routes', () => {
  beforeEach(() => {
    preferenceState.showRightRailCards = true;
    mockResponsiveToggleWidths({ availableWidth: 1024, contentWidth: 240 });
    inventoryHook.mockReturnValue({
      snapshot: {
        skus: [
          {
            skuId: 'sku-1',
            name: 'SKU 1',
            description: 'Cotton tee',
            unitsInStock: 12,
            costPerUnit: 4,
            soldAsProduct: true,
            productPrice: 9,
            leadTimeMeanDays: 5,
            leadTimeStdDays: 1,
          },
        ],
        services: [
          {
            serviceId: 'service-1',
            name: 'Service 1',
            description: 'Service',
            price: 15,
            skuIds: ['sku-1'],
          },
        ],
        ranking: [],
        sist: {
          status: { state: 'ready', updatedAt: '2026-04-02T00:00:00Z', reportCount: 1, confidence: 'medium', reason: null },
          settings: { targetServiceLevel: 0.95, forecastHorizonDays: 14, particleCount: 512, smoothingWindowReports: 90 },
          asOf: '2026-04-02T00:00:00Z',
          topRegime: 'normal',
          pendingReorderCount: 1,
          highRiskSkuIds: ['sku-1'],
          skuInsights: [],
        },
      },
      reports: [],
      catalog: sampleCatalog,
      error: null,
      isLoading: false,
      isSaving: false,
      latestRun: null,
      observations: [],
      senaMeta: { catalogHash: null, lastBootstrapSkuId: null, lastCompletedRunId: null },
      workspaceSummary: {
        ownerSub: 'desktop-owner',
        runId: 'run-1',
        latestObservedAt: '2026-04-02T00:00:00Z',
        skuCount: 1,
        serviceCount: 1,
        intervalCount: 1,
        pendingReorderCount: 1,
        topRegime: 'normal',
        highRiskSkuIds: ['sku-1'],
        skuSummaries: [],
      },
      reload: vi.fn(),
      loadInventorySnapshot: vi.fn(async () => ({
        skus: [
          {
            skuId: 'sku-1',
            name: 'SKU 1',
            description: 'Cotton tee',
            unitsInStock: 12,
            costPerUnit: 4,
            soldAsProduct: true,
            productPrice: 9,
            leadTimeMeanDays: 5,
            leadTimeStdDays: 1,
          },
        ],
        services: [
          {
            serviceId: 'service-1',
            name: 'Service 1',
            description: 'Service',
            price: 15,
            skuIds: ['sku-1'],
          },
        ],
        ranking: [],
        sist: {
          status: { state: 'ready', updatedAt: '2026-04-02T00:00:00Z', reportCount: 1, confidence: 'medium', reason: null },
          settings: { targetServiceLevel: 0.95, forecastHorizonDays: 14, particleCount: 512, smoothingWindowReports: 90 },
          asOf: '2026-04-02T00:00:00Z',
          topRegime: 'normal',
          pendingReorderCount: 1,
          highRiskSkuIds: ['sku-1'],
          skuInsights: [],
        },
      })),
      listStockReports: vi.fn(async () => []),
      runWorkspacePreparation: vi.fn(async (task: () => Promise<unknown>) => task()),
      loadSenaCatalog: vi.fn(async () => sampleCatalog),
      loadSenaObservations: vi.fn(async () => []),
      listSenaObservations: vi.fn(async () => []),
      upsertSenaCatalog: vi.fn(async (payload) => payload),
      ingestSenaObservation: vi.fn(),
      triggerSenaRun: vi.fn(async () => ({ runId: 'run-1' })),
      retrySenaRun: vi.fn(async () => ({ runId: 'run-1' })),
      loadSenaWorkspaceSummary: vi.fn(async () => ({
        ownerSub: 'desktop-owner',
        runId: 'run-1',
        latestObservedAt: '2026-04-02T00:00:00Z',
        skuCount: 1,
        serviceCount: 1,
        intervalCount: 1,
        pendingReorderCount: 1,
        topRegime: 'normal',
        highRiskSkuIds: ['sku-1'],
        skuSummaries: [],
      })),
      loadSenaSkuDetail: vi.fn(async () => ({
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
          leadTimeMeanDays: 5,
          leadTimeStdDays: 1,
          regimeProbabilities: { normal: 1 },
        },
        inventoryPosterior: [],
        demandPosterior: [],
        pipelinePosterior: [],
        leadTimePosterior: [],
      })),
      loadSenaDiagnostics: vi.fn(async () => ({
        effectiveSampleSizeMean: 0.81,
        resamplingCount: 3,
        smoothingEnabled: false,
        changePointProbability: 0.2,
        seasonalityActive: false,
        posteriorPredictiveErrorMean: 0.1,
        coverageEstimate: 0.88,
        regimeHistory: [],
      })),
      loadSenaServiceDetail: vi.fn(async () => ({
        serviceId: 'service-1',
        activityMean: 3,
        activityIntervalLow: 2,
        activityIntervalHigh: 4,
        bottleneckProbability: 0.3,
        contributors: [
          {
            skuId: 'sku-1',
            usageProbability: 0.85,
            bottleneckProbability: 0.3,
          },
        ],
        regimeTimeline: [
          {
            intervalIndex: 0,
            startAt: '2026-04-01T00:00:00Z',
            endAt: '2026-04-01T23:59:00Z',
            dominantRegime: 'normal',
            regimeProbabilities: { normal: 1 },
          },
        ],
      })),
      loadSenaRunStatus: vi.fn(async () => ({
        runId: 'run-1',
        ownerSub: 'desktop-owner',
        algorithmVersion: 'sena-analysis-v3',
        status: 'succeeded',
        observationCount: 0,
        createdAt: '2026-04-02T00:00:00Z',
        completedAt: '2026-04-02T00:01:00Z',
        summary: null,
        diagnostics: null,
        primaryArtifactKey: null,
        error: null,
      })),
      updateSenaMeta: vi.fn(),
    });
  });

  function renderWithProviders(route: string, element: ReactNode, path: string) {
    return render(
      <MemoryRouter initialEntries={[route]}>
        <NavigationHistoryProvider>
          <Routes>
            <Route element={element} path={path} />
            <Route element={<div>Capture route</div>} path="/work/capture/*" />
          </Routes>
        </NavigationHistoryProvider>
      </MemoryRouter>,
    );
  }

  function continueToCapture() {
    fireEvent.click(screen.getByRole('button', { name: 'Continue to capture' }));
  }

  async function renderWithProvidersSettled(route: string, element: ReactNode, path: string) {
    let view!: ReturnType<typeof renderWithProviders>;
    await act(async () => {
      view = renderWithProviders(route, element, path);
      await Promise.resolve();
    });
    return view;
  }

  test('renders the catalog route', async () => {
    renderWithProviders('/catalog', <InventoryRoute />, '/catalog');
    await waitFor(() => {
      expect(screen.getByText('Offered Selections')).toBeInTheDocument();
    });

    expect(screen.getByText('Offered Selections')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Search name or description…')).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'All' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'SKUs' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Services' })).toBeInTheDocument();
    expect(screen.getByText('SKU 1')).toBeInTheDocument();
    expect(screen.getByText('Service 1')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'SKU 1' })).toHaveAttribute('href', '/catalog/skus/sku-1');
    expect(screen.getByRole('link', { name: 'Service 1' })).toHaveAttribute('href', '/catalog/services/service-1');
    expect(screen.getByText('1 linked services · sellable · price $9.00 · cost $4.00')).toBeInTheDocument();
    expect(screen.getByText('1 linked SKUs · price $15.00')).toBeInTheDocument();
  });

  test('turns the catalog filter pills into a dropdown when they would scroll', async () => {
    mockResponsiveToggleWidths({ availableWidth: 160, contentWidth: 320 });

    renderWithProviders('/catalog', <InventoryRoute />, '/catalog');
    await waitFor(() => {
      expect(screen.getByText('Offered Selections')).toBeInTheDocument();
    });

    const filter = screen.getByRole('combobox', { name: 'Search and segment' });
    expect(filter).toHaveTextContent('Filter:');
    expect(filter).toHaveTextContent('All');
    expect(filter.querySelector('svg')).not.toBeNull();
    expect(screen.queryByRole('radio', { name: 'All' })).not.toBeInTheDocument();
  });

  test('hides raw catalog entity ids from visible catalog rows', async () => {
    const baseState = inventoryHook();
    inventoryHook.mockReturnValue({
      ...baseState,
      catalog: {
        ...sampleCatalog,
        skus: [
          {
            ...sampleCatalog.skus[0],
            name: 'Market tote',
            skuId: 'SKU-001',
          },
        ],
        services: [
          {
            ...sampleCatalog.services[0],
            name: 'Market Tote Add-On',
            serviceId: 'SERVICE-001',
          },
        ],
        sharingMask: [{ enabled: true, serviceId: 'SERVICE-001', skuId: 'SKU-001', usageProbability: null }],
      },
    });

    renderWithProviders('/catalog', <InventoryRoute />, '/catalog');
    await waitFor(() => {
      expect(screen.getByRole('link', { name: 'Market Tote Add-On' })).toBeInTheDocument();
    });

    expect(screen.getByText('Market tote')).toBeInTheDocument();
    expect(screen.queryByText('SKU-001')).not.toBeInTheDocument();
    expect(screen.queryByText('SERVICE-001')).not.toBeInTheDocument();
  });

  test('renders the catalog wireframe while the catalog is still loading', () => {
    const baseState = inventoryHook();
    inventoryHook.mockReturnValue({
      ...baseState,
      catalog: null,
      isLoading: true,
      workspaceSummary: null,
    });

    renderWithProviders('/catalog', <InventoryRoute />, '/catalog');

    expect(screen.getByText('Offered Selections')).toBeInTheDocument();
    expect(screen.getByText('SKUs')).toBeInTheDocument();
    expect(screen.getByText('Services')).toBeInTheDocument();
    expect(screen.queryByText('No catalog loaded yet')).not.toBeInTheDocument();
  });

  test('renders inline catalog actions for SKU and service rows', async () => {
    renderWithProviders('/catalog', <InventoryRoute />, '/catalog');
    await waitFor(() => {
      expect(screen.getByRole('link', { name: 'SKU 1' })).toBeInTheDocument();
    });

    const skuRow = screen.getByRole('link', { name: 'SKU 1' }).closest('div.group');
    expect(skuRow).not.toBeNull();
    fireEvent.click(within(skuRow!).getByRole('button', { name: 'More actions for SKU 1' }));

    expect(screen.getByRole('button', { name: 'Record' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Record' }));
    expect(screen.getByRole('menuitem', { name: 'Stock Count' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Supplier Order' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Customer Order' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Immediate Sale' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Log receipt' })).not.toBeInTheDocument();
  });

  test('does not preload service detail while rendering the catalog route', async () => {
    renderWithProviders('/catalog', <InventoryRoute />, '/catalog');
    await waitFor(() => {
      expect(screen.getByRole('link', { name: 'Service 1' })).toBeInTheDocument();
    });
    expect(inventoryHook().loadSenaServiceDetail).not.toHaveBeenCalled();
  });

  test('opens the SKU action flow in catalog without showing the inline detail rail', async () => {
    renderWithProviders('/catalog', <InventoryRoute />, '/catalog');

    const skuRow = screen.getByRole('link', { name: 'SKU 1' }).closest('div.group');
    expect(skuRow).not.toBeNull();
    fireEvent.click(within(skuRow!).getByRole('button', { name: 'More actions for SKU 1' }));
    fireEvent.click(screen.getByRole('button', { name: 'Record' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Supplier Order' }));
    continueToCapture();

    await waitFor(() => {
      expect(screen.getByText('Capture route')).toBeInTheDocument();
    });

    expect(screen.queryByText('Incoming stock')).not.toBeInTheDocument();
    expect(screen.queryByText('Next check')).not.toBeInTheDocument();

    expect(screen.queryByRole('heading', { name: /Ledger for SKU 1/ })).not.toBeInTheDocument();
  });

  test('asks before replacing a saved supplier capture draft', async () => {
    window.localStorage.setItem('banji:record-update:draft:supplier-order-pending:v1', '{"version":1}');
    renderWithProviders('/catalog', <InventoryRoute />, '/catalog');

    const skuRow = screen.getByRole('link', { name: 'SKU 1' }).closest('div.group');
    expect(skuRow).not.toBeNull();
    fireEvent.click(within(skuRow!).getByRole('button', { name: 'More actions for SKU 1' }));
    fireEvent.click(screen.getByRole('button', { name: 'Record' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Supplier Order' }));

    expect(screen.getByText('Delete saved draft?')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByText('Capture route')).not.toBeInTheDocument();

    fireEvent.mouseDown(document.body);
    fireEvent.click(within(skuRow!).getByRole('button', { name: 'More actions for SKU 1' }));
    fireEvent.click(screen.getByRole('button', { name: 'Record' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Supplier Order' }));
    fireEvent.click(screen.getByRole('button', { name: 'Delete draft and start new' }));

    await waitFor(() => {
      expect(screen.getByText('Capture route')).toBeInTheDocument();
    });
    expect(window.localStorage.getItem('banji:record-update:draft:supplier-order-pending:v1')).toBeNull();
  });

  test('opens the service action flow in catalog without showing the inline detail rail', async () => {
    renderWithProviders('/catalog', <InventoryRoute />, '/catalog');

    const serviceRow = screen.getByRole('link', { name: 'Service 1' }).closest('div.group');
    expect(serviceRow).not.toBeNull();

    await waitFor(() => {
      fireEvent.click(within(serviceRow!).getByRole('button', { name: 'More actions for Service 1' }));
      expect(screen.getByRole('button', { name: 'Record' })).toBeEnabled();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Record' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Updated Price' }));
    continueToCapture();

    await waitFor(() => {
      expect(screen.getByText('Capture route')).toBeInTheDocument();
    });

    expect(screen.queryByText('What could restore service')).not.toBeInTheDocument();
    expect(screen.queryByText('Main blockers')).not.toBeInTheDocument();

    expect(screen.queryByRole('heading', { name: /Ledger for Service 1/ })).not.toBeInTheDocument();
  });

  test('routes service customer actions into capture', async () => {
    renderWithProviders('/catalog', <InventoryRoute />, '/catalog');

    const serviceRow = screen.getByRole('link', { name: 'Service 1' }).closest('div.group');
    expect(serviceRow).not.toBeNull();

    await waitFor(() => {
      fireEvent.click(within(serviceRow!).getByRole('button', { name: 'More actions for Service 1' }));
      expect(screen.getByRole('button', { name: 'Record' })).toBeEnabled();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Record' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Customer Order' }));
    continueToCapture();

    await waitFor(() => {
      expect(screen.getByText('Capture route')).toBeInTheDocument();
    });
  });

  test('omits the SKU price action for non-sellable catalog rows', async () => {
    const baseState = inventoryHook();
    inventoryHook.mockReturnValue({
      ...baseState,
      catalog: {
        ...sampleCatalog,
        skus: [
          ...sampleCatalog.skus,
          {
            costPerUnit: 3,
            description: 'Backroom supply',
            leadTimeMeanDaysHint: 7,
            leadTimeStdDaysHint: 2,
            name: 'SKU 2',
            productPrice: null,
            skuId: 'sku-2',
            soldAsProduct: false,
          },
        ],
      },
      snapshot: {
        ...baseState.snapshot,
        skus: [
          ...baseState.snapshot.skus,
          {
            skuId: 'sku-2',
            name: 'SKU 2',
            description: 'Backroom supply',
            unitsInStock: 5,
            costPerUnit: 3,
            soldAsProduct: false,
            productPrice: null,
            leadTimeMeanDays: 7,
            leadTimeStdDays: 2,
          },
        ],
      },
      workspaceSummary: {
        ...baseState.workspaceSummary,
        skuCount: 2,
      },
      loadSenaSkuDetail: vi.fn(async (skuId: string) => ({
        summary: {
          skuId,
          latestPosteriorUnits: skuId === 'sku-2' ? 5 : 9,
          credibleIntervalLow: 4,
          credibleIntervalHigh: 12,
          demandPerDayMean: 2,
          stockoutRisk: 0.4,
          daysOfCover: 4,
          expectedLeadTimeDemand: 8,
          safetyStock: 3,
          reorderPoint: 7,
          reorderTriggerProbability: 0.55,
          leadTimeMeanDays: 5,
          leadTimeStdDays: 1,
          regimeProbabilities: { normal: 1 },
        },
        inventoryPosterior: [],
        demandPosterior: [],
        pipelinePosterior: [],
        leadTimePosterior: [],
      })),
    });

    renderWithProviders('/catalog', <InventoryRoute />, '/catalog');
    await waitFor(() => {
      expect(screen.getByRole('link', { name: 'SKU 2' })).toBeInTheDocument();
    });

    const unsellableRow = screen.getByRole('link', { name: 'SKU 2' }).closest('div.group');
    expect(unsellableRow).not.toBeNull();
    fireEvent.click(within(unsellableRow!).getByRole('button', { name: 'More actions for SKU 2' }));
    fireEvent.click(screen.getByRole('button', { name: 'Record' }));
    expect(screen.queryByRole('menuitem', { name: 'Updated Price' })).not.toBeInTheDocument();
  });

  test('disables catalog service stock mutations when no active bottleneck exists', async () => {
    const baseState = inventoryHook();
    inventoryHook.mockReturnValue({
      ...baseState,
      snapshot: {
        ...baseState.snapshot,
        sist: {
          ...baseState.snapshot.sist,
          highRiskSkuIds: [],
        },
      },
      loadInventorySnapshot: vi.fn(async () => ({
        ...baseState.snapshot,
        sist: {
          ...baseState.snapshot.sist,
          highRiskSkuIds: [],
        },
      })),
      loadSenaServiceDetail: vi.fn(async () => ({
        serviceId: 'service-1',
        activityMean: 3,
        activityIntervalLow: 2,
        activityIntervalHigh: 4,
        bottleneckProbability: 0,
        contributors: [
          {
            skuId: 'sku-1',
            usageProbability: 0.2,
            bottleneckProbability: 0,
          },
        ],
        regimeTimeline: [
          {
            intervalIndex: 0,
            startAt: '2026-04-01T00:00:00Z',
            endAt: '2026-04-01T23:59:00Z',
            dominantRegime: 'normal',
            regimeProbabilities: { normal: 1 },
          },
        ],
      })),
    });

    renderWithProviders('/catalog', <InventoryRoute />, '/catalog');

    const serviceRow = screen.getByRole('link', { name: 'Service 1' }).closest('div.group');
    expect(serviceRow).not.toBeNull();
    fireEvent.click(within(serviceRow!).getByRole('button', { name: 'More actions for Service 1' }));

    await waitFor(() => {
      fireEvent.click(screen.getByRole('button', { name: 'Record' }));
      const serviceCustomerOrderButton = screen.getByText('Customer Order').closest('button,[role="button"]');
      const serviceRecordStockButton = screen.getByText('Stock Count').closest('button,[role="button"]');
      expect(serviceCustomerOrderButton).not.toHaveAttribute('aria-disabled', 'true');
      expect(serviceRecordStockButton).toHaveAttribute('aria-disabled', 'true');
    });

    await waitFor(() => {
      expect(inventoryHook().loadSenaServiceDetail).toHaveBeenCalledWith('service-1');
    });

    expect(screen.getByText('Stock Count').closest('button,[role="button"]')).toHaveAttribute(
      'title',
      'No linked SKU is limiting this service right now.',
    );
  });

  test('loads service detail actions lazily when the catalog menu opens', async () => {
    renderWithProviders('/catalog', <InventoryRoute />, '/catalog');
    await waitFor(() => {
      expect(screen.getByRole('link', { name: 'Service 1' })).toBeInTheDocument();
    });
    expect(inventoryHook().loadSenaServiceDetail).not.toHaveBeenCalled();

    const serviceRow = screen.getByRole('link', { name: 'Service 1' }).closest('div.group');
    expect(serviceRow).not.toBeNull();
    fireEvent.click(within(serviceRow!).getByRole('button', { name: 'More actions for Service 1' }));

    await waitFor(() => {
      expect(inventoryHook().loadSenaServiceDetail).toHaveBeenCalledWith('service-1');
    });
  });

  test('filters the catalog route from the title-card search and toggle pill', async () => {
    const user = userEvent.setup();
    await renderWithProvidersSettled('/catalog', <InventoryRoute />, '/catalog');

    await user.type(screen.getByPlaceholderText('Search name or description…'), 'service-1');

    await waitFor(() => {
      expect(screen.queryByText('SKU 1')).not.toBeInTheDocument();
      expect(screen.getByText('Service 1')).toBeInTheDocument();
    });

    await user.click(screen.getByRole('radio', { name: 'SKUs' }));

    await waitFor(() => {
      expect(screen.queryByText('Service 1')).not.toBeInTheDocument();
      expect(screen.getByText('No matching catalog items')).toBeInTheDocument();
    });
  });

  test('loads SKU detail without snapshot bootstrap', async () => {
    renderWithProviders('/catalog/skus/sku-1', <SkuDetailRoute />, '/catalog/skus/:skuId');

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /Ledger for SKU 1/ })).toBeInTheDocument();
    });

    expect(screen.getByText('banji needs at least two saved updates for this view')).toBeInTheDocument();

    expect(inventoryHook().loadSenaSkuDetail).toHaveBeenCalledWith('sku-1', expect.objectContaining({ limit: 5 }));
    expect(inventoryHook().loadInventorySnapshot).not.toHaveBeenCalled();
    expect(screen.getAllByText('Service impact').length).toBeGreaterThan(0);
  });

  test('renders SKU detail even when the legacy snapshot is stale', async () => {
    inventoryHook.mockReturnValue({
      ...inventoryHook(),
      loadInventorySnapshot: vi.fn(async () => ({
        skus: [],
        services: [],
        ranking: [],
        sist: {
          status: { state: 'empty', updatedAt: null, reportCount: 0, confidence: 'low', reason: null },
          settings: { targetServiceLevel: 0.95, forecastHorizonDays: 14, particleCount: 512, smoothingWindowReports: 90 },
          asOf: null,
          topRegime: null,
          pendingReorderCount: 0,
          highRiskSkuIds: [],
          skuInsights: [],
        },
      })),
    });

    renderWithProviders('/catalog/skus/sku-1', <SkuDetailRoute />, '/catalog/skus/:skuId');

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /Ledger for SKU 1/ })).toBeInTheDocument();
    });

    expect(screen.getByText('banji needs at least two saved updates for this view')).toBeInTheDocument();

    expect(screen.queryByText('SKU not found')).not.toBeInTheDocument();
  });

  test('renders service detail', async () => {
    renderWithProviders('/catalog/services/service-1', <ServiceDetailRoute />, '/catalog/services/:serviceId');

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /Ledger for Service 1/ })).toBeInTheDocument();
    });

    expect(inventoryHook().loadSenaServiceDetail).toHaveBeenCalledWith('service-1', expect.objectContaining({ limit: INTERVAL_PAGE_SIZE }));
    expect(screen.getByText('Linked SKU impact')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Record' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Record' }));
    expect(screen.getByText('Customer Order')).toBeInTheDocument();
    expect(screen.getByText('Immediate Sale')).toBeInTheDocument();
    expect(screen.getByText('Stock Count')).toBeInTheDocument();
    expect(screen.getByText('Updated Price')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Edit service' })).toHaveAttribute('href', '/catalog/services/service-1/edit');
  });

  test('renders missing service detail without resetting selection in a loop', async () => {
    renderWithProviders('/catalog/services/service-missing', <ServiceDetailRoute />, '/catalog/services/:serviceId');

    await waitFor(() => {
      expect(screen.getByText('Service not found')).toBeInTheDocument();
    });
  });

  test('shows the shared service chart controls on the detail ledger', async () => {
    renderWithProviders('/catalog/services/service-1', <ServiceDetailRoute />, '/catalog/services/:serviceId');

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /Ledger for Service 1/ })).toBeInTheDocument();
    });

    expect(screen.getByRole('button', { name: 'Settings' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Indicators' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Layout' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Recent' })).toBeInTheDocument();
  });

  test('uses semantic status tones for service detail pills', async () => {
    renderWithProviders('/catalog/services/service-1', <ServiceDetailRoute />, '/catalog/services/:serviceId');

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /Ledger for Service 1/ })).toBeInTheDocument();
    });

    expect(screen.getAllByText('Main blocker now').length).toBeGreaterThan(0);
  });

  test('hides the sku detail right rail when the global toggle is off', async () => {
    preferenceState.showRightRailCards = false;

    renderWithProviders('/catalog/skus/sku-1', <SkuDetailRoute />, '/catalog/skus/:skuId');

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /Ledger for SKU 1/ })).toBeInTheDocument();
    });

    expect(screen.queryByText('Selected period')).not.toBeInTheDocument();
    expect(screen.queryByText('Next step')).not.toBeInTheDocument();
  });

  test('hides the service detail right rail when the global toggle is off', async () => {
    preferenceState.showRightRailCards = false;

    renderWithProviders('/catalog/services/service-1', <ServiceDetailRoute />, '/catalog/services/:serviceId');

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /Ledger for Service 1/ })).toBeInTheDocument();
    });

    expect(screen.queryByText('Next step')).not.toBeInTheDocument();
    expect(screen.queryByText('What could restore service')).not.toBeInTheDocument();
    expect(screen.queryByText('Next check')).not.toBeInTheDocument();
  });

  test('routes service immediate sale to capture', async () => {
    renderWithProviders('/catalog/services/service-1', <ServiceDetailRoute />, '/catalog/services/:serviceId');

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Record' })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Record' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Immediate Sale' }));
    continueToCapture();

    await waitFor(() => {
      expect(screen.getByText('Capture route')).toBeInTheDocument();
    });
  });

  test('routes service price updates through capture', async () => {
    renderWithProviders('/catalog/services/service-1', <ServiceDetailRoute />, '/catalog/services/:serviceId');

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Record' })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Record' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Updated Price' }));
    continueToCapture();

    await waitFor(() => {
      expect(screen.getByText('Capture route')).toBeInTheDocument();
    });
  });

  test('disables bottleneck SKU mutation buttons when no active bottleneck exists', async () => {
    inventoryHook.mockReturnValue({
      ...inventoryHook(),
      snapshot: {
        ...inventoryHook().snapshot,
        sist: {
          ...inventoryHook().snapshot.sist,
          highRiskSkuIds: [],
        },
      },
      loadInventorySnapshot: vi.fn(async () => ({
        ...inventoryHook().snapshot,
        sist: {
          ...inventoryHook().snapshot.sist,
          highRiskSkuIds: [],
        },
      })),
    });

    renderWithProviders('/catalog/services/service-1', <ServiceDetailRoute />, '/catalog/services/:serviceId');

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Record' })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Record' }));
    expect(screen.getByRole('menuitem', { name: 'Customer Order' })).not.toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByRole('menuitem', { name: 'Stock Count' })).toHaveAttribute('aria-disabled', 'true');
  });
});
