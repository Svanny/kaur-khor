import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from 'react';
import { createContext, useContext } from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import type { SenaSkuDetail } from '@shared/sena';
import { DescriptionTextVisibilityProvider } from '@/components/system/description-text';
import { rowHoverClassName } from '@/lib/interactive-surface';
import { DashboardRoute } from './dashboard';

const realDate = Date;

const sheetContext = createContext<{ onOpenChange?: (open: boolean) => void } | null>(null);
const toggleGroupContext = createContext<{
  onValueChange?: (value: string) => void;
  value?: string;
} | null>(null);

vi.mock('@/components/ui/sheet', () => ({
  Sheet: ({
    children,
    onOpenChange,
    open,
  }: {
    children: ReactNode;
    onOpenChange?: (open: boolean) => void;
    open?: boolean;
  }) =>
    open ? <sheetContext.Provider value={{ onOpenChange }}>{children}</sheetContext.Provider> : null,
  SheetContent: ({
    children,
    showCloseButton: _showCloseButton,
    ...props
  }: HTMLAttributes<HTMLDivElement> & { showCloseButton?: boolean }) => (
    <div data-slot="sheet-content" {...props}>
      {children}
    </div>
  ),
  SheetHeader: ({ children, ...props }: HTMLAttributes<HTMLDivElement>) => <div {...props}>{children}</div>,
  SheetFooter: ({ children, ...props }: HTMLAttributes<HTMLDivElement>) => <div {...props}>{children}</div>,
  SheetTitle: ({ children, ...props }: HTMLAttributes<HTMLHeadingElement>) => <h2 {...props}>{children}</h2>,
  SheetDescription: ({ children, ...props }: HTMLAttributes<HTMLParagraphElement>) => <p {...props}>{children}</p>,
  SheetClose: ({
    children,
    onClick,
    ...props
  }: ButtonHTMLAttributes<HTMLButtonElement>) => {
    const context = useContext(sheetContext);
    return (
      <button
        type="button"
        {...props}
        onClick={(event) => {
          onClick?.(event);
          context?.onOpenChange?.(false);
        }}
      >
        {children}
      </button>
    );
  },
}));

vi.mock('@/components/system/measured-tile-grid', () => ({
  MeasuredTileGrid: ({
    minColumns = 1,
    renderGrid,
  }: {
    minColumns?: number;
    renderGrid: (args: { columnCount: number; gridRef: { current: HTMLDivElement | null } }) => ReactNode;
  }) => renderGrid({ columnCount: minColumns, gridRef: { current: null } }),
}));

vi.mock('@/components/ui/toggle-group', () => ({
  ToggleGroup: ({
    children,
    onValueChange,
    value,
    ...props
  }: {
    children: ReactNode;
    onValueChange?: (value: string) => void;
    value?: string;
  } & HTMLAttributes<HTMLDivElement>) => (
    <toggleGroupContext.Provider value={{ onValueChange, value }}>
      <div role="group" {...props}>
        {children}
      </div>
    </toggleGroupContext.Provider>
  ),
  ToggleGroupItem: ({
    children,
    disableHoverSurface: _disableHoverSurface,
    disableSelectedShadow: _disableSelectedShadow,
    value,
    ...props
  }: {
    children: ReactNode;
    disableHoverSurface?: boolean;
    disableSelectedShadow?: boolean;
    value: string;
  } & ButtonHTMLAttributes<HTMLButtonElement>) => {
    const context = useContext(toggleGroupContext);
    const checked = context?.value === value;
    return (
      <button
        role="radio"
        type="button"
        aria-checked={checked}
        data-state={checked ? 'on' : 'off'}
        {...props}
        onClick={(event) => {
          props.onClick?.(event);
          context?.onValueChange?.(value);
        }}
      >
        {children}
      </button>
    );
  },
}));

vi.mock('@/components/ui/select', () => ({
  Select: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  SelectTrigger: ({ children, ...props }: HTMLAttributes<HTMLButtonElement>) => (
    <button type="button" {...props}>
      {children}
    </button>
  ),
  SelectValue: ({ placeholder }: { placeholder?: string }) => <span>{placeholder ?? null}</span>,
  SelectContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  SelectItem: ({ children, ...props }: HTMLAttributes<HTMLDivElement>) => <div {...props}>{children}</div>,
}));

function freezeDate(isoString: string) {
  const fixedDate = new realDate(isoString);

  class MockDate extends realDate {
    constructor(...args: any[]) {
      super(...(args.length === 0 ? [fixedDate.toISOString()] : args));
    }

    static now() {
      return fixedDate.getTime();
    }

    static parse = realDate.parse;
    static UTC = realDate.UTC;
  }

  vi.stubGlobal('Date', MockDate as unknown as DateConstructor);
}

const inventoryHook = vi.fn();
const automationHook = vi.fn();
const savePreferencesMock = vi.fn(async () => undefined);
const applyOverviewStaleUpdateReminderSnoozeUntil = vi.fn(async (value: string | null) => {
  preferenceState.overviewStaleUpdateReminderSnoozeUntil = value;
});
const preferenceState = {
  currency: 'USD',
  language: 'en',
  showExplanatoryTooltips: true,
  showFloatingTitleActions: true,
  showRightRailCards: true,
  showOverviewTaskTabs: true,
  taskBatchUpdatePreferences: {
    logOrder: 'ask',
    updateEta: 'ask',
    followUp: 'ask',
    receive: 'ask',
    review: 'ask',
  } as const,
  overviewStaleUpdateReminderSnoozeUntil: null as string | null,
};

vi.mock('../state/inventory', () => ({
  useInventory: () => inventoryHook(),
  useInventoryActions: () => ({
    loadSenaOrderBatches: inventoryHook().loadSenaOrderBatches,
    loadSenaSkuDetail: inventoryHook().loadSenaSkuDetail,
    loadWorkSupportData: inventoryHook().loadWorkSupportData,
  }),
  useInventoryState: () => inventoryHook(),
}));

vi.mock('../state/automation', () => ({
  useAutomation: () => automationHook(),
}));

vi.mock('../state/preferences', () => ({
  usePreferences: () => ({
    currency: preferenceState.currency,
    language: preferenceState.language,
    showExplanatoryTooltips: preferenceState.showExplanatoryTooltips,
    showFloatingTitleActions: preferenceState.showFloatingTitleActions,
    showRightRailCards: preferenceState.showRightRailCards,
    showOverviewTaskTabs: preferenceState.showOverviewTaskTabs,
    taskBatchUpdatePreferences: preferenceState.taskBatchUpdatePreferences,
    overviewStaleUpdateReminderSnoozeUntil: preferenceState.overviewStaleUpdateReminderSnoozeUntil,
    applyOverviewStaleUpdateReminderSnoozeUntil,
    savePreferences: savePreferencesMock,
    t: (key: string) => {
      if (key === 'searchPlaceholder') {
        return 'Search name or description…';
      }
      if (key === 'searchItems') {
        return 'Search and segment';
      }
      if (key === 'filterAll') {
        return 'Everything';
      }
      if (key === 'filterSku') {
        return 'SKUs';
      }
      if (key === 'filterService') {
        return 'Services';
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
    {
      skuId: 'sku-2',
      name: 'Hair dye black',
      description: 'Color refresh',
      costPerUnit: 6,
      soldAsProduct: true,
      productPrice: 14,
      leadTimeMeanDaysHint: 7,
      leadTimeStdDaysHint: 2,
    },
  {
    skuId: 'sku-3',
    name: 'Styling gel',
    description: 'Styling support',
      costPerUnit: 3,
      soldAsProduct: true,
      productPrice: 8,
      leadTimeMeanDaysHint: 4,
      leadTimeStdDaysHint: 1,
    },
    {
      skuId: 'sku-4',
      name: 'Cotton pads',
      description: 'Retail only',
      costPerUnit: 2,
      soldAsProduct: true,
      productPrice: 5,
      leadTimeMeanDaysHint: 3,
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
    {
      serviceId: 'service-2',
      name: 'Coloring',
      description: '',
      price: 30,
      bundle: false,
    },
  ],
  bundles: [],
  sharingMask: [
    { serviceId: 'service-1', skuId: 'sku-1', enabled: true, usageProbability: 1 },
    { serviceId: 'service-2', skuId: 'sku-2', enabled: true, usageProbability: 1 },
    { serviceId: 'service-2', skuId: 'sku-3', enabled: true, usageProbability: 1 },
  ],
};

const sampleWorkspaceSummary = {
  ownerSub: 'desktop-owner',
  runId: 'run-1',
  latestObservedAt: '2026-04-03T08:00:00.000Z',
  skuCount: 4,
  serviceCount: 2,
  intervalCount: 4,
  pendingReorderCount: 2,
  topRegime: 'normal',
  highRiskSkuIds: ['sku-1', 'sku-4'],
  skuSummaries: [
    {
      skuId: 'sku-1',
      latestPosteriorUnits: 12,
      credibleIntervalLow: 8,
      credibleIntervalHigh: 14,
      demandPerDayMean: 4,
      stockoutRisk: 0.81,
      daysOfCover: 1.9,
      expectedLeadTimeDemand: 10,
      safetyStock: 5,
      reorderPoint: 18,
      reorderTriggerProbability: 0.67,
      reorderQuantity: {
        recommendedUnits: 14.2,
        ungatedRecommendedUnits: 14.2,
        likelyRangeLow: 10,
        likelyRangeHigh: 18,
        needProbability: 0.78,
        recommendationIssued: true,
        recommendationQuantile: 0.7,
        intervalLowQuantile: 0.1,
        intervalHighQuantile: 0.9,
        needProbabilityGate: 0.5,
        reviewDelayDays: 0,
      },
      leadTimeMeanDays: 5,
      leadTimeStdDays: 1,
      regimeProbabilities: { normal: 1 },
    },
    {
      skuId: 'sku-2',
      latestPosteriorUnits: 19,
      credibleIntervalLow: 15,
      credibleIntervalHigh: 22,
      demandPerDayMean: 2,
      stockoutRisk: 0.28,
      daysOfCover: 6.4,
      expectedLeadTimeDemand: 8,
      safetyStock: 3,
      reorderPoint: 12,
      reorderTriggerProbability: 0.2,
      leadTimeMeanDays: 7,
      leadTimeStdDays: 2,
      regimeProbabilities: { promo: 0.7, normal: 0.3 },
    },
    {
      skuId: 'sku-3',
      latestPosteriorUnits: 15,
      credibleIntervalLow: 12,
      credibleIntervalHigh: 18,
      demandPerDayMean: 1,
      stockoutRisk: 0.31,
      daysOfCover: 7,
      expectedLeadTimeDemand: 5,
      safetyStock: 2,
      reorderPoint: 11,
      reorderTriggerProbability: 0.22,
      leadTimeMeanDays: 4,
      leadTimeStdDays: 1,
      regimeProbabilities: { normal: 1 },
    },
    {
      skuId: 'sku-4',
      latestPosteriorUnits: 6,
      credibleIntervalLow: 4,
      credibleIntervalHigh: 7,
      demandPerDayMean: 3,
      stockoutRisk: 0.74,
      daysOfCover: 1.8,
      expectedLeadTimeDemand: 9,
      safetyStock: 3,
      reorderPoint: 11,
      reorderTriggerProbability: 0.64,
      leadTimeMeanDays: 3,
      leadTimeStdDays: 1,
      regimeProbabilities: { normal: 1 },
    },
  ],
};

const sampleObservations = [
  {
    observationId: 'obs-order',
    ownerSub: 'desktop-owner',
    input: {
      observedAt: '2026-04-01T09:00:00.000Z',
      stockSnapshot: [],
      serviceRankings: [],
      retailRankings: [],
      serviceStockouts: [],
      retailStockouts: [],
      orderSignals: [
        {
          skuId: 'sku-2',
          orderPlaced: true,
          receiptArrived: false,
          approximateOrderQuantity: 18,
          approximateReceiptQuantity: null,
        },
      ],
      servicePrices: [],
      retailPrices: [],
      leadTimeHints: [],
      notes: null,
    },
  },
  {
    observationId: 'obs-ready',
    ownerSub: 'desktop-owner',
    input: {
      observedAt: '2026-03-30T09:00:00.000Z',
      stockSnapshot: [],
      serviceRankings: [],
      retailRankings: [],
      serviceStockouts: [],
      retailStockouts: [],
      orderSignals: [
        {
          skuId: 'sku-3',
          orderPlaced: true,
          receiptArrived: false,
          approximateOrderQuantity: 24,
          approximateReceiptQuantity: null,
        },
      ],
      servicePrices: [],
      retailPrices: [],
      leadTimeHints: [],
      notes: null,
    },
  },
];

const detailBySkuId: Record<string, SenaSkuDetail> = {
  'sku-1': {
    summary: sampleWorkspaceSummary.skuSummaries[0],
    inventoryPosterior: [],
    demandPosterior: [],
    pipelinePosterior: [],
    leadTimePosterior: [],
  },
  'sku-2': {
    summary: sampleWorkspaceSummary.skuSummaries[1],
    inventoryPosterior: [],
    demandPosterior: [],
    pipelinePosterior: [
      {
        intervalIndex: 2,
        inTransitMean: 18,
        orderProbability: 0.9,
        orderQuantityMean: 18,
        receiptQuantityMean: 0,
        ageDaysMean: 2,
      },
    ],
    leadTimePosterior: [
      {
        intervalIndex: 2,
        logMeanDays: 0,
        logStdDays: 0,
        meanDays: 7,
        stdDays: 2,
        observedVariabilityClass: 'wide',
        observedRelativeWidth: 0.6,
      },
    ],
  },
  'sku-3': {
    summary: sampleWorkspaceSummary.skuSummaries[2],
    inventoryPosterior: [],
    demandPosterior: [],
    pipelinePosterior: [
      {
        intervalIndex: 2,
        inTransitMean: 24,
        orderProbability: 0.92,
        orderQuantityMean: 24,
        receiptQuantityMean: 24,
        ageDaysMean: 4,
      },
    ],
    leadTimePosterior: [
      {
        intervalIndex: 2,
        logMeanDays: 0,
        logStdDays: 0,
        meanDays: 4,
        stdDays: 1,
        observedVariabilityClass: 'tight',
        observedRelativeWidth: 0.25,
      },
    ],
  },
  'sku-4': {
    summary: sampleWorkspaceSummary.skuSummaries[3],
    inventoryPosterior: [],
    demandPosterior: [],
    pipelinePosterior: [],
    leadTimePosterior: [],
  },
};

function renderRoute() {
  return render(
    <MemoryRouter>
      <DashboardRoute />
    </MemoryRouter>,
  );
}

function RouteLocationProbe() {
  const location = useLocation();
  return <div data-testid="route-location">{`${location.pathname}${location.search}`}</div>;
}

function renderRouteWithLocation(initialEntry = '/') {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <DashboardRoute />
      <RouteLocationProbe />
    </MemoryRouter>,
  );
}

function renderRouteWithOptionalHelp(visible: boolean) {
  return render(
    <DescriptionTextVisibilityProvider visible={visible}>
      <MemoryRouter>
        <DashboardRoute />
      </MemoryRouter>
    </DescriptionTextVisibilityProvider>,
  );
}

describe('DashboardRoute', () => {
  beforeEach(() => {
    preferenceState.showRightRailCards = true;
    preferenceState.showOverviewTaskTabs = true;
    preferenceState.taskBatchUpdatePreferences = {
      logOrder: 'ask',
      updateEta: 'ask',
      followUp: 'ask',
      receive: 'ask',
      review: 'ask',
    };
    preferenceState.overviewStaleUpdateReminderSnoozeUntil = null;
    applyOverviewStaleUpdateReminderSnoozeUntil.mockClear();
    savePreferencesMock.mockClear();
    freezeDate('2026-04-03T12:00:00.000Z');
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
      bottom: 120,
      height: 120,
      left: 0,
      right: 800,
      top: 0,
      width: 800,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    } as DOMRect);
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
      configurable: true,
      value: vi.fn(),
    });

    inventoryHook.mockReturnValue({
      catalog: sampleCatalog,
      observations: sampleObservations,
      workspaceSummary: sampleWorkspaceSummary,
      loadSenaSkuDetail: vi.fn(async (skuId: string) => detailBySkuId[skuId] ?? null),
      loadWorkSupportData: vi.fn(async () => null),
      ingestSenaObservation: vi.fn(async (payload) => payload),
      triggerSenaRun: vi.fn(async () => ({ runId: 'run-2' })),
      isSaving: false,
    });
    automationHook.mockReturnValue({
      intakes: [],
    });
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  test('renders the task queue and lets the user filter it', async () => {
    const user = userEvent.setup();
    const { container } = renderRoute();

    expect(screen.getAllByText('Queue').length).toBeGreaterThan(0);
    expect(screen.getAllByPlaceholderText('Search name or description…')[0]!).toBeInTheDocument();
    const scopeToggle = screen.getByRole('group', { name: 'Select overview ticket family' });
    expect(within(scopeToggle).getByRole('radio', { name: 'Customer' })).toBeInTheDocument();
    expect(within(scopeToggle).getByRole('radio', { name: 'Supplier' })).toBeInTheDocument();
    expect(within(scopeToggle).queryByRole('radio', { name: 'All' })).toBeNull();
    expect(screen.getByRole('heading', { level: 2, name: 'Task queue' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Awaiting receipt' }).querySelector('.lucide-clipboard-clock')).not.toBeNull();
    expect(screen.getAllByRole('button', { name: 'Record Supplier order' }).length).toBeGreaterThan(0);
    expect(screen.getByText('Rec. 15u · likely 78%')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Update ETA' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Update ETA' }).querySelector('.lucide-calendar-clock')).not.toBeNull();
    expect(screen.getByRole('button', { name: 'Receive' })).toBeInTheDocument();
    expect(screen.getByText('Cotton pads')).toBeInTheDocument();
    await waitFor(() => {
      expect(container.querySelector('[data-slot="overview-task-row"]')).not.toBeNull();
    });
    expect(container.querySelector('[data-slot="overview-task-row"]')?.className).toContain(rowHoverClassName);
    expect(container.querySelector('[data-slot="overview-rail-row"]')?.className).toContain(rowHoverClassName);

    await user.click(screen.getByRole('tab', { name: 'Ready to receive' }));

    await waitFor(() => {
      expect(screen.queryAllByRole('button', { name: 'Record Supplier order' })).toHaveLength(0);
      expect(screen.queryAllByRole('button', { name: 'Update ETA' })).toHaveLength(0);
      expect(screen.getByRole('button', { name: 'Receive' })).toBeInTheDocument();
    });
  });

  test('requests Work support data on cold queue entry', async () => {
    const loadWorkSupportData = vi.fn(async () => null);
    inventoryHook.mockReturnValue({
      catalog: sampleCatalog,
      observations: [],
      orderBatches: [],
      recordUpdateContext: null,
      workspaceSummary: sampleWorkspaceSummary,
      loadSenaSkuDetail: vi.fn(async (skuId: string) => detailBySkuId[skuId] ?? null),
      loadWorkSupportData,
      ingestSenaObservation: vi.fn(async (payload) => payload),
      triggerSenaRun: vi.fn(async () => ({ runId: 'run-2' })),
      isSaving: false,
    });

    renderRouteWithLocation('/work/queue');

    await waitFor(() => {
      expect(loadWorkSupportData).toHaveBeenCalledWith({ includeObservations: true });
    });
  });

  test.skip('prefills the drawer order quantity from the reorder recommendation', async () => {
    renderRoute();

    fireEvent.click(screen.getAllByRole('button', { name: 'Record Supplier order' })[0]!);

    await waitFor(() => {
      expect(screen.getByText('Recommended order')).toBeInTheDocument();
    });

    expect(screen.getByText('15 units')).toBeInTheDocument();
    expect(screen.getByText('Recommended range 10-18 units')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('radio', { name: /Ordered, waiting/i }));

    expect(screen.getByLabelText('Ordered quantity')).toHaveValue(15);
  });

  test.skip('asks before closing a dirty overview task drawer', async () => {
    renderRoute();

    fireEvent.click(screen.getAllByRole('button', { name: 'Record Supplier order' })[0]!);

    await waitFor(() => {
      expect(screen.getByText('Recommended order')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('radio', { name: /Ordered, waiting/i }));
    fireEvent.change(screen.getByLabelText('Ordered quantity'), { target: { value: '22' } });
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));

    expect(screen.getByText('Discard changes?')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Keep editing' }));
    expect(screen.getByLabelText('Ordered quantity')).toHaveValue(22);

    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    fireEvent.click(screen.getByRole('button', { name: 'Discard changes' }));

    await waitFor(() => {
      expect(screen.queryByText('Recommended order')).not.toBeInTheDocument();
    });
  }, 10_000);

  test('keeps issued reorder recommendations in To order even when an order is already open', async () => {
    const user = userEvent.setup();
    const workspaceSummary = structuredClone(sampleWorkspaceSummary);
    const hairDyeSummary = workspaceSummary.skuSummaries.find((summary) => summary.skuId === 'sku-2');
    expect(hairDyeSummary).toBeTruthy();
    hairDyeSummary!.reorderQuantity = {
      recommendedUnits: 9.1,
      ungatedRecommendedUnits: 9.1,
      likelyRangeLow: 7,
      likelyRangeHigh: 12,
      needProbability: 1,
      recommendationIssued: true,
      recommendationQuantile: 0.7,
      intervalLowQuantile: 0.1,
      intervalHighQuantile: 0.9,
      needProbabilityGate: 0.5,
      reviewDelayDays: 0,
    };

    inventoryHook.mockReturnValue({
      catalog: sampleCatalog,
      observations: sampleObservations,
      workspaceSummary,
      loadSenaSkuDetail: vi.fn(async (skuId: string) => detailBySkuId[skuId] ?? null),
      ingestSenaObservation: vi.fn(async (payload) => payload),
      triggerSenaRun: vi.fn(async () => ({ runId: 'run-2' })),
      isSaving: false,
    });

    renderRoute();

    await user.click(screen.getByRole('tab', { name: 'To order' }));

    expect(screen.getByText('Hair dye black')).toBeInTheDocument();
    expect(screen.getByText('Rec. 10u · likely 100%')).toBeInTheDocument();
  });

  test('does not put high-need SKUs in To order when the Q70 order quantity is zero', async () => {
    const user = userEvent.setup();
    const workspaceSummary = structuredClone(sampleWorkspaceSummary);
    const hairDyeSummary = workspaceSummary.skuSummaries.find((summary) => summary.skuId === 'sku-2');
    expect(hairDyeSummary).toBeTruthy();
    hairDyeSummary!.reorderQuantity = {
      recommendedUnits: 0,
      ungatedRecommendedUnits: 0,
      likelyRangeLow: 0,
      likelyRangeHigh: 0,
      needProbability: 1,
      recommendationIssued: true,
      recommendationQuantile: 0.7,
      intervalLowQuantile: 0.1,
      intervalHighQuantile: 0.9,
      needProbabilityGate: 0.5,
      reviewDelayDays: 0,
    };

    inventoryHook.mockReturnValue({
      catalog: sampleCatalog,
      observations: sampleObservations,
      workspaceSummary,
      loadSenaSkuDetail: vi.fn(async (skuId: string) => detailBySkuId[skuId] ?? null),
      ingestSenaObservation: vi.fn(async (payload) => payload),
      triggerSenaRun: vi.fn(async () => ({ runId: 'run-2' })),
      isSaving: false,
    });

    const { container } = renderRoute();

    await user.click(screen.getByRole('tab', { name: 'To order' }));

    const taskRows = Array.from(container.querySelectorAll('[data-slot="overview-task-row"]'));
    expect(taskRows.some((row) => row.textContent?.includes('Hair dye black'))).toBe(false);
  });

  test('switches between customer and supplier ticket families', async () => {
    renderRoute();
    await waitFor(() => {
      expect(inventoryHook().loadSenaSkuDetail).toHaveBeenCalled();
    });

    expect(screen.getByText('Cotton pads')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('radio', { name: 'Customer' }));

    expect(screen.getByRole('heading', { level: 2, name: 'Customer queue' })).toBeInTheDocument();
    expect(screen.queryByText('Cotton pads')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('radio', { name: 'Supplier' }));

    expect(screen.getByRole('heading', { level: 2, name: 'Task queue' })).toBeInTheDocument();
    expect(screen.getByText('Cotton pads')).toBeInTheDocument();
  });

  test('filters customer queue rows with the shared search box', async () => {
    const user = userEvent.setup();
    automationHook.mockReturnValue({
      intakes: [
        {
          intakeId: 'intake-dara',
          conversationId: 'conv-dara',
          channel: 'telegram',
          status: 'quoted',
          parseConfidence: 'high',
          customerDisplayName: 'Dara',
          customerHandle: '@dara',
          phone: null,
          notes: null,
          quotedSubtotal: 12,
          currencyCode: 'USD',
          deliveryFee: null,
          quotedTotal: 12,
          createdAt: '2026-04-03T10:00:00.000Z',
          updatedAt: '2026-04-03T11:00:00.000Z',
          promotedTicketId: null,
          lines: [],
        },
        {
          intakeId: 'intake-malis',
          conversationId: 'conv-malis',
          channel: 'telegram',
          status: 'quoted',
          parseConfidence: 'high',
          customerDisplayName: 'Malis',
          customerHandle: '@malis',
          phone: null,
          notes: null,
          quotedSubtotal: 8,
          currencyCode: 'USD',
          deliveryFee: null,
          quotedTotal: 8,
          createdAt: '2026-04-03T10:00:00.000Z',
          updatedAt: '2026-04-03T11:00:00.000Z',
          promotedTicketId: null,
          lines: [],
        },
      ],
    });

    renderRoute();

    await user.click(screen.getByRole('radio', { name: 'Customer' }));
    await user.type(screen.getByPlaceholderText('Search name or description…'), 'dara');

    await waitFor(() => {
      expect(screen.getByText('Dara')).toBeInTheDocument();
      expect(screen.queryByText('Malis')).not.toBeInTheDocument();
    });
  });

  test('deep-links into customer workflow and highlights a Telegram intake task', async () => {
    automationHook.mockReturnValue({
      intakes: [
        {
          intakeId: 'intake-1',
          conversationId: 'conv-1',
          channel: 'telegram',
          status: 'quoted',
          parseConfidence: 'high',
          customerDisplayName: 'Dara',
          customerHandle: '@dara',
          phone: null,
          notes: 'Telegram quote',
          quotedSubtotal: 12,
          currencyCode: 'USD',
          deliveryFee: null,
          quotedTotal: 12,
          createdAt: '2026-04-03T10:00:00.000Z',
          updatedAt: '2026-04-03T11:00:00.000Z',
          promotedTicketId: null,
          lines: [
            {
              lineId: 'line-1',
              entityType: 'sku',
              entityId: 'sku-1',
              requestedLabel: 'Cotton pads',
              resolvedLabel: 'Cotton pads',
              quantity: 2,
              unitPrice: 6,
              lineTotal: 12,
              availabilityStatus: 'available',
              ambiguityReason: null,
            },
          ],
        },
      ],
    });

    renderRouteWithLocation('/?workflow=customer&customerFilter=quoted&customerTask=automation%3Aintake%3Aintake-1');

    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 2, name: 'Customer queue' })).toBeInTheDocument();
      expect(screen.getByRole('tab', { name: 'Quoted' })).toHaveAttribute('data-state', 'active');
      expect(screen.getByText('Dara')).toBeInTheDocument();
    });

    const highlightedRow = document.querySelector('[data-customer-task-id="automation:intake:intake-1"]');
    expect(highlightedRow?.className).toContain('ring-emerald-300');
    expect(screen.getByRole('radio', { name: 'Customer' })).toHaveAttribute('data-state', 'on');
    expect(screen.getByTestId('route-location')).toHaveTextContent(
      '/?workflow=customer&customerFilter=quoted&customerTask=automation%3Aintake%3Aintake-1',
    );
  });

  test('opens Telegram intake directly from the customer queue without leaving Overview', async () => {
    const user = userEvent.setup();
    const readConversation = vi.fn(async () => ({
      conversation: { conversationId: 'conv-1' },
      intakes: [],
      messages: [
        {
          messageId: 'message-1',
          conversationId: 'conv-1',
          externalMessageKey: '1',
          direction: 'inbound',
          sentAt: '2026-04-03T11:00:00.000Z',
          rawText: '/start',
          normalizedText: null,
          parseConfidence: 'medium',
        },
      ],
    }));

    automationHook.mockReturnValue({
      intakes: [
        {
          intakeId: 'intake-1',
          conversationId: 'conv-1',
          channel: 'telegram',
          status: 'quoted',
          parseConfidence: 'high',
          customerDisplayName: 'Dara',
          customerHandle: '@dara',
          phone: null,
          notes: 'Telegram quote',
          quotedSubtotal: 12,
          currencyCode: 'USD',
          deliveryFee: null,
          quotedTotal: 12,
          createdAt: '2026-04-03T10:00:00.000Z',
          updatedAt: '2026-04-03T11:00:00.000Z',
          promotedTicketId: null,
          lines: [
            {
              lineId: 'line-1',
              entityType: 'sku',
              entityId: 'sku-1',
              requestedLabel: 'Cotton pads',
              resolvedLabel: 'Cotton pads',
              quantity: 2,
              unitPrice: 6,
              lineTotal: 12,
              availabilityStatus: 'available',
              ambiguityReason: null,
            },
          ],
        },
      ],
      isSaving: false,
      promoteIntake: vi.fn(),
      readConversation,
      resolveIntake: vi.fn(),
    });

    renderRouteWithLocation('/?workflow=customer&customerFilter=quoted&customerTask=automation%3Aintake%3Aintake-1');

    await waitFor(() => {
      expect(screen.getByText('Dara')).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: 'Open intake' }));

    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 2, name: 'Telegram intake' })).toBeInTheDocument();
    });
    await waitFor(() => {
      expect(readConversation).toHaveBeenCalledWith({ conversationId: 'conv-1' });
    });
    expect(screen.getByTestId('route-location')).toHaveTextContent(
      '/?workflow=customer&customerFilter=quoted&customerTask=automation%3Aintake%3Aintake-1',
    );
  });

  test('hydrates dashboard SKU details with a small concurrency cap', async () => {
    const resolvers = new Map<string, () => void>();
    let activeLoads = 0;
    let maxActiveLoads = 0;
    const loadSenaSkuDetail = vi.fn((skuId: string) =>
      new Promise((resolve) => {
        activeLoads += 1;
        maxActiveLoads = Math.max(maxActiveLoads, activeLoads);
        resolvers.set(skuId, () => {
          activeLoads -= 1;
          resolve(detailBySkuId[skuId] ?? null);
        });
      }),
    );
    inventoryHook.mockReturnValue({
      catalog: sampleCatalog,
      observations: sampleObservations,
      workspaceSummary: sampleWorkspaceSummary,
      loadSenaSkuDetail,
      ingestSenaObservation: vi.fn(async (payload) => payload),
      triggerSenaRun: vi.fn(async () => ({ runId: 'run-2' })),
      isSaving: false,
    });

    renderRoute();

    await waitFor(() => {
      expect(loadSenaSkuDetail).toHaveBeenCalledTimes(2);
    });
    expect(loadSenaSkuDetail.mock.calls.map(([skuId]) => skuId)).toEqual(['sku-1', 'sku-4']);
    expect(maxActiveLoads).toBe(2);

    act(() => {
      resolvers.get('sku-1')?.();
    });

    await waitFor(() => {
      expect(loadSenaSkuDetail).toHaveBeenCalledTimes(3);
    });
    expect(maxActiveLoads).toBe(2);
  });

  test('scopes the overview search inside the supplier ticket family', async () => {
    renderRoute();

    fireEvent.click(screen.getByRole('radio', { name: 'Supplier' }));
    fireEvent.change(screen.getAllByPlaceholderText('Search name or description…')[0]!, {
      target: { value: 'Razor' },
    });

    await waitFor(() => {
      expect(screen.getByText('Razor refill')).toBeInTheDocument();
    });

    expect(screen.getByRole('button', { name: 'Record Supplier order' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Update ETA' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Receive' })).not.toBeInTheDocument();
  });

  test('opens overview task actions without the legacy batch prompt', async () => {
    renderRoute();

    await act(async () => {
      fireEvent.click(screen.getAllByRole('button', { name: 'Record Supplier order' })[0]!);
    });

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(savePreferencesMock).not.toHaveBeenCalled();
  });

  test('navigates to the SKU detail page when clicking an overview item', async () => {
    const user = userEvent.setup();
    renderRouteWithLocation();

    await user.click(screen.getByRole('link', { name: /Razor refill/i }));

    await waitFor(() => {
      expect(screen.getByTestId('route-location')).toHaveTextContent('/catalog/skus/sku-1');
    });
  });

  test('opens task drawers without writing pre-submit popup state to the route', async () => {
    inventoryHook.mockReturnValue({
      catalog: sampleCatalog,
      observations: sampleObservations,
      workspaceSummary: sampleWorkspaceSummary,
      loadSenaSkuDetail: vi.fn(async (skuId: string) => detailBySkuId[skuId] ?? null),
      isSaving: false,
    });

    const { container } = renderRouteWithLocation();

    fireEvent.click(screen.getByRole('button', { name: 'Receive' }));

    await waitFor(() => {
      expect(container.querySelector('[data-slot="sheet-content"]')).not.toBeNull();
      expect(screen.getByTestId('route-location')).toHaveTextContent('/');
    });
  });

  test('ignores legacy grouped batch preferences without writing popup state to the route', async () => {
    preferenceState.taskBatchUpdatePreferences = {
      ...preferenceState.taskBatchUpdatePreferences,
      logOrder: 'always_batch',
    };

    const { container } = renderRouteWithLocation();

    fireEvent.click(screen.getAllByRole('button', { name: 'Record Supplier order' })[0]!);

    await waitFor(() => {
      expect(container.querySelector('[data-slot="sheet-content"]')).not.toBeNull();
      expect(screen.getByTestId('route-location')).toHaveTextContent('/');
    });
  });

  test('hides the overview right rail when the global toggle is off', async () => {
    preferenceState.showRightRailCards = false;

    renderRoute();

    expect(await screen.findByRole('heading', { level: 2, name: 'Task queue' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { level: 2, name: 'Today' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { level: 2, name: 'In transit' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { level: 2, name: 'Recent receipts' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { level: 2, name: 'Business signals' })).not.toBeInTheDocument();
  });

  test('hides the overview tabs and defaults to the supplier queue when tab view is disabled', async () => {
    preferenceState.showOverviewTaskTabs = false;

    renderRouteWithLocation('/?filter=ready_to_receive');

    expect(await screen.findByRole('heading', { level: 2, name: 'Task queue' })).toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: 'Awaiting receipt' })).not.toBeInTheDocument();
    expect(screen.getByText('Razor refill')).toBeInTheDocument();
    expect(screen.getByText('Cotton pads')).toBeInTheDocument();
  });

  test('hides overview descriptors and empty-state hints when optional help is disabled', async () => {
    inventoryHook.mockReturnValue({
      catalog: null,
      observations: [],
      workspaceSummary: null,
      loadSenaSkuDetail: vi.fn(),
      ingestSenaObservation: vi.fn(),
      triggerSenaRun: vi.fn(),
      isSaving: false,
    });

    renderRouteWithOptionalHelp(false);

    expect(await screen.findByText('Work needs the catalog first')).toBeInTheDocument();
    expect(screen.queryByText('Create the first SKU or service so banji can build an action list from real catalog work.')).not.toBeInTheDocument();
  });

  test('hides overview task queue helper copy when optional help is disabled', async () => {
    preferenceState.showExplanatoryTooltips = false;

    renderRoute();

    expect(await screen.findByText('Razor refill')).toBeInTheDocument();
    expect(screen.getAllByText('Order now').length).toBeGreaterThan(0);
    expect(screen.queryByText('Haircut')).not.toBeInTheDocument();
    expect(screen.queryByText('Rec. 15u · likely 78%')).not.toBeInTheDocument();
  });

});
