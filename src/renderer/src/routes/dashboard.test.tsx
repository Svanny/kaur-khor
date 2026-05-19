import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from 'react';
import { createContext, useContext } from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import type { DesktopTaskBatchUpdatePreferences } from '@shared/ipc';
import type {
  SenaObservationRecord,
  SenaRecordUpdateContext,
  SenaSkuDetail,
  SenaTicketSummary,
  SenaWorkspaceSummary,
} from '@shared/sena';
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
    value,
    ...props
  }: {
    children: ReactNode;
    value: string;
  } & Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'value'> & {
    disableHoverSurface?: boolean;
    disableSelectedShadow?: boolean;
  }) => {
    const {
      disableHoverSurface: _disableHoverSurface,
      disableSelectedShadow: _disableSelectedShadow,
      ...buttonProps
    } = props;
    const context = useContext(toggleGroupContext);
    const checked = context?.value === value;
    return (
      <button
        role="radio"
        type="button"
        aria-checked={checked}
        data-state={checked ? 'on' : 'off'}
        {...buttonProps}
        onClick={(event) => {
          buttonProps.onClick?.(event);
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
    constructor(...args: [] | [string | number | Date]) {
      super(args.length === 0 ? fixedDate.toISOString() : args[0]);
    }

    static now() {
      return fixedDate.getTime();
    }

    static parse = realDate.parse;
    static UTC = realDate.UTC;
  }

  vi.stubGlobal('Date', MockDate as unknown as DateConstructor);
}

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((nextResolve) => {
    resolve = nextResolve;
  });
  return { promise, resolve };
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
  } as DesktopTaskBatchUpdatePreferences,
  overviewStaleUpdateReminderSnoozeUntil: null as string | null,
};

vi.mock('../state/inventory', () => ({
  useInventory: () => inventoryHook(),
  useInventoryActions: () => ({
    ingestSenaObservation: inventoryHook().ingestSenaObservation,
    loadSenaOrderBatches: inventoryHook().loadSenaOrderBatches,
    loadSenaSkuDetail: inventoryHook().loadSenaSkuDetail,
    loadWorkSupportData: inventoryHook().loadWorkSupportData,
    runWorkspacePreparation: inventoryHook().runWorkspacePreparation,
    triggerSenaRun: inventoryHook().triggerSenaRun,
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

const sampleWorkspaceSummary: SenaWorkspaceSummary = {
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

function recordUpdateContextWithCustomerTickets(tickets: SenaTicketSummary[]): SenaRecordUpdateContext {
  const latestObservedAt = tickets[0]?.occurredAt ?? null;
  return {
    observationFingerprint: {
      count: tickets.length,
      latestObservedAt,
      latestObservationId: tickets.length > 0 ? 'obs-ticket' : null,
    },
    latestObservedAt,
    latestStockBySku: {},
    latestRetailSaleBySku: {},
    latestServiceSaleByService: {},
    latestOrderBySku: {},
    latestReceiptBySku: {},
    openTicketsByFamily: { customer: tickets.filter((ticket) => ticket.lifecycle === 'open'), supplier: [] },
    latestTicketsById: Object.fromEntries(
      tickets.map((ticket) => [
        ticket.ticketId,
        {
          observationId: `obs-${ticket.ticketId}`,
          observedAt: ticket.occurredAt,
          value: ticket,
        },
      ]),
    ),
    latestDeliveryFeeByBucket: {},
    recentActivity: [],
  };
}

function recordUpdateContextWithSupplierTickets(tickets: SenaTicketSummary[]): SenaRecordUpdateContext {
  const latestObservedAt = tickets[0]?.occurredAt ?? null;
  return {
    observationFingerprint: {
      count: tickets.length,
      latestObservedAt,
      latestObservationId: tickets.length > 0 ? 'obs-ticket' : null,
    },
    latestObservedAt,
    latestStockBySku: {},
    latestRetailSaleBySku: {},
    latestServiceSaleByService: {},
    latestOrderBySku: {},
    latestReceiptBySku: {},
    openTicketsByFamily: { customer: [], supplier: tickets.filter((ticket) => ticket.lifecycle === 'open') },
    latestTicketsById: Object.fromEntries(
      tickets.map((ticket) => [
        ticket.ticketId,
        {
          observationId: `obs-${ticket.ticketId}`,
          observedAt: ticket.occurredAt,
          value: ticket,
        },
      ]),
    ),
    latestDeliveryFeeByBucket: {},
    recentActivity: [],
  };
}

function supplierTicketForSku({
  expectedArrivalAt = '2026-04-03T12:00:00.000Z',
  lifecycle = 'open',
  skuId,
  stage = 'ordered_waiting',
  ticketId,
}: {
  expectedArrivalAt?: string | null;
  lifecycle?: SenaTicketSummary['lifecycle'];
  skuId: string;
  stage?: SenaTicketSummary['stage'];
  ticketId: string;
}): SenaTicketSummary {
  return {
    ticketId,
    ticketFamily: 'supplier',
    lifecycle,
    stage,
    revision: 2,
    eventType: lifecycle === 'canceled' ? 'canceled' : 'created',
    occurredAt: '2026-04-01T09:00:00.000Z',
    nextTouchAt: expectedArrivalAt,
    party: {
      role: 'supplier',
      supplierName: null,
    },
    lines: [
      {
        entityType: 'sku',
        entityId: skuId,
        orderedQuantity: lifecycle === 'canceled' ? null : 8,
        receivedQuantity: null,
        expectedArrivalAt,
      },
    ],
    note: null,
  };
}

function customerTicketFixture(overrides: Partial<SenaTicketSummary> = {}): SenaTicketSummary {
  return {
    ticketId: 'ticket-customer-1',
    ticketFamily: 'customer',
    lifecycle: 'open',
    stage: 'pending',
    revision: 2,
    eventType: 'created',
    occurredAt: '2026-04-01T09:00:00.000Z',
    nextTouchAt: '2026-04-04T09:00:00.000Z',
    party: {
      role: 'customer',
      channelKey: 'instagram',
      channelLabel: 'Instagram',
      customerName: 'Dara',
      phone: '+85512345678',
      location: 'Phnom Penh',
    },
    lines: [
      {
        entityType: 'service',
        entityId: 'service-1',
        quantityDelta: 1,
        expectedArrivalAt: '2026-04-05T09:00:00.000Z',
      },
    ],
    deliveryFee: {
      feeUsd: 1,
      payer: 'customer',
      bucket: 'customer_order',
      subtotalUsd: 12,
      displayDeliveryUsd: 1,
      displayTotalUsd: 13,
      netSettlementUsd: 13,
    },
    discount: {
      mode: 'percent',
      amountUsd: null,
      percent: 10,
      subtotalUsd: 12,
      displayDiscountUsd: 1.2,
      discountedSubtotalUsd: 10.8,
    },
    note: 'Prefers evening pickup',
    ...overrides,
  };
}

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
      runWorkspacePreparation: vi.fn(async (task) => task()),
      triggerSenaRun: vi.fn(async () => ({ runId: 'run-2' })),
      isSaving: false,
    });
    automationHook.mockReturnValue({
      intakes: [],
    });
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  test('renders the task queue and lets the user filter it', async () => {
    const user = userEvent.setup();
    const { container } = renderRoute();

    expect(screen.getAllByText('Queue').length).toBeGreaterThan(0);
    expect(screen.getAllByPlaceholderText('Search name or description…')[0]!).toBeInTheDocument();
    expect(container.querySelector('[data-slot="filter-control-row"]')).not.toBeNull();
    const scopeToggle = screen.getByRole('group', { name: 'Select overview ticket family' });
    expect(within(scopeToggle).getByRole('radio', { name: 'Customer' })).toBeInTheDocument();
    expect(within(scopeToggle).getByRole('radio', { name: 'Supplier' })).toBeInTheDocument();
    expect(within(scopeToggle).queryByRole('radio', { name: 'All' })).toBeNull();
    expect(within(scopeToggle).getByRole('radio', { name: 'Supplier' })).toHaveAttribute('data-state', 'on');
    expect(screen.getByRole('heading', { level: 2, name: 'Task queue' })).toBeInTheDocument();

    await user.click(within(scopeToggle).getByRole('radio', { name: 'Supplier' }));

    expect(screen.getByRole('heading', { level: 2, name: 'Task queue' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Awaiting receipt' }).querySelector('.lucide-clipboard-clock')).not.toBeNull();
    expect(screen.getAllByRole('button', { name: 'Record Supplier order' }).length).toBeGreaterThan(0);
    expect(screen.getByText('Rec. 15u · likely 78%')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Update ETA' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Update ETA' }).querySelector('.lucide-calendar-clock')).not.toBeNull();
    expect(screen.getByText(/^Ordered Apr 1/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Receive' })).toBeInTheDocument();
    expect(screen.getByText('Cotton pads')).toBeInTheDocument();
    await waitFor(() => {
      expect(container.querySelector('[data-slot="overview-task-row"]')).not.toBeNull();
    });
    expect(container.querySelector('[data-slot="overview-task-row"]')?.className).toContain(rowHoverClassName);
    expect(container.querySelector('[data-slot="overview-rail-row"]')?.className).toContain(rowHoverClassName);
    expect(container.querySelector('[data-slot="overview-board"]')?.className).toContain('flex-1');
    expect(container.querySelector('[data-slot="overview-board"]')?.className).toContain('min-h-0');
    expect(container.querySelector('[data-slot="overview-right-rail"]')?.className).toContain('h-full');
    expect(container.querySelector('[data-slot="overview-right-rail"]')?.className).toContain('min-h-0');
    expect(container.querySelector('[data-work-window-root="queue"]')?.className).toContain('flex-1');
    expect(container.querySelector('[data-work-window="queue"]')?.className).toContain('shrink-0');
    expect(container.querySelector('[data-work-bottom-breathing-room="queue"]')?.className).toContain('h-32');

    await user.click(screen.getByRole('tab', { name: 'Ready to receive' }));

    await waitFor(() => {
      expect(screen.queryAllByRole('button', { name: 'Record Supplier order' })).toHaveLength(0);
      expect(screen.queryAllByRole('button', { name: 'Update ETA' })).toHaveLength(0);
      expect(screen.getByRole('button', { name: 'Receive' })).toBeInTheDocument();
    });
  });

  test('shows canceled supplier tickets instead of the never-ordered state', async () => {
    const canceledTicket: SenaTicketSummary = {
      ticketId: 'ticket-supplier-canceled',
      ticketFamily: 'supplier',
      lifecycle: 'canceled',
      stage: 'to_order',
      revision: 2,
      eventType: 'canceled',
      occurredAt: '2026-04-03T09:00:00.000Z',
      nextTouchAt: null,
      party: {
        role: 'supplier',
        supplierName: null,
      },
      lines: [
        {
          entityType: 'sku',
          entityId: 'sku-1',
          orderedQuantity: null,
          receivedQuantity: null,
          expectedArrivalAt: null,
        },
      ],
      note: 'Supplier canceled the order.',
    };
    inventoryHook.mockReturnValue({
      catalog: sampleCatalog,
      observations: sampleObservations,
      recordUpdateContext: recordUpdateContextWithSupplierTickets([canceledTicket]),
      workspaceSummary: sampleWorkspaceSummary,
      loadSenaSkuDetail: vi.fn(async (skuId: string) => detailBySkuId[skuId] ?? null),
      loadWorkSupportData: vi.fn(async () => null),
      ingestSenaObservation: vi.fn(async (payload) => payload),
      runWorkspacePreparation: vi.fn(async (task) => task()),
      triggerSenaRun: vi.fn(async () => ({ runId: 'run-2' })),
      isSaving: false,
    });

    renderRouteWithLocation('/?workflow=supplier');

    expect(await screen.findByText('Supplier Ticket ID: 2026-04-03-#1')).toBeInTheDocument();
    const canceledRow = Array.from(document.querySelectorAll('[data-slot="overview-task-row"]'))
      .find((row) => row.textContent?.includes('Supplier Ticket ID: 2026-04-03-#1'));
    expect(canceledRow).toHaveTextContent('Order canceled');
    expect(canceledRow).not.toHaveTextContent('Not ordered yet');

    expect(within(canceledRow as HTMLElement).getByRole('button', { name: 'Review ticket' })).toBeInTheDocument();
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

  test('shows a loading board instead of a partial queue while cold support data loads', async () => {
    const supportData = deferred<null>();
    const loadWorkSupportData = vi.fn(() => supportData.promise);
    inventoryHook.mockReturnValue({
      catalog: sampleCatalog,
      latestRun: { observationCount: 2 },
      observations: [],
      observationFingerprint: {
        count: 2,
        latestObservedAt: '2026-04-03T12:00:00.000Z',
        latestObservationId: 'obs-2',
      },
      orderBatches: [],
      recordUpdateContext: null,
      workspaceSummary: {
        ...sampleWorkspaceSummary,
        intervalCount: 2,
      },
      loadSenaSkuDetail: vi.fn(async (skuId: string) => detailBySkuId[skuId] ?? null),
      loadWorkSupportData,
      ingestSenaObservation: vi.fn(async (payload) => payload),
      triggerSenaRun: vi.fn(async () => ({ runId: 'run-2' })),
      isLoading: false,
      isSaving: false,
    });

    const { container } = renderRouteWithLocation('/work/queue');

    expect(container.querySelector('[data-slot="overview-support-loading"]')).not.toBeNull();
    expect(screen.queryByRole('heading', { level: 2, name: 'Task queue' })).not.toBeInTheDocument();
    await waitFor(() => {
      expect(loadWorkSupportData).toHaveBeenCalledWith({ includeObservations: true });
    });
  });

  test('asks before closing a dirty overview task drawer', async () => {
    renderRouteWithLocation('/?workflow=supplier');

    fireEvent.click(screen.getAllByRole('button', { name: 'Record Supplier order' })[0]!);

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Supplier order' })).toBeInTheDocument();
    });

    await act(async () => {
      await new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()));
    });

    await waitFor(() => {
      expect(screen.getByLabelText('overviewDrawerSupplierNoteTitle')).toBeInTheDocument();
    });
    fireEvent.change(screen.getByLabelText('overviewDrawerSupplierNoteTitle'), { target: { value: 'Asked supplier for a delivery date.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));

    expect(screen.getByText('Discard changes?')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Keep editing' }));
    expect(screen.getByLabelText('overviewDrawerSupplierNoteTitle')).toHaveValue('Asked supplier for a delivery date.');

    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    fireEvent.click(screen.getByRole('button', { name: 'Discard changes' }));

    await waitFor(() => {
      expect(screen.queryByRole('heading', { name: 'Supplier order' })).not.toBeInTheDocument();
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

    renderRouteWithLocation('/?workflow=supplier');

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

    const { container } = renderRouteWithLocation('/?workflow=supplier');

    await user.click(screen.getByRole('tab', { name: 'To order' }));

    const taskRows = Array.from(container.querySelectorAll('[data-slot="overview-task-row"]'));
    expect(taskRows.some((row) => row.textContent?.includes('Hair dye black'))).toBe(false);
  });

  test('switches between customer and supplier ticket families', async () => {
    renderRoute();

    expect(screen.getByRole('radio', { name: 'Supplier' })).toHaveAttribute('data-state', 'on');
    expect(screen.getByRole('heading', { level: 2, name: 'Task queue' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Filter by supplier' })).toBeInTheDocument();
    expect(screen.getByText('Cotton pads')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('radio', { name: 'Customer' }));
    await waitFor(() => {
      expect(inventoryHook().loadSenaSkuDetail).toHaveBeenCalled();
    });

    expect(screen.getByRole('heading', { level: 2, name: 'Customer queue' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Filter by supplier' })).not.toBeInTheDocument();
    expect(screen.queryByText('Cotton pads')).not.toBeInTheDocument();
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

    renderRouteWithLocation('/?workflow=supplier');

    await user.click(screen.getByRole('radio', { name: 'Customer' }));
    await user.type(screen.getByPlaceholderText('Search name or description…'), 'dara');

    await waitFor(() => {
      expect(screen.getAllByText('Dara').length).toBeGreaterThan(0);
      expect(screen.queryByText('Malis')).not.toBeInTheDocument();
    });
  });

  test('opens customer completion rows in the queue drawer instead of the capture prompt', async () => {
    const user = userEvent.setup();
    freezeDate(new realDate(2026, 3, 9, 16, 44).toISOString());
    const triggerRun = deferred<{ runId: string }>();
    const runWorkspacePreparation = vi.fn(async (task) => task());
    const initialObservations: SenaObservationRecord[] = [
      ...sampleObservations,
      {
        observationId: 'obs-customer-pending',
        ownerSub: 'desktop-owner',
        input: {
          observedAt: '2026-04-03T09:00:00.000Z',
          stockSnapshot: [
            {
              skuId: 'sku-1',
              unitsInStock: 10,
              costPerUnit: 4,
              productPrice: 9,
            },
          ],
          serviceRankings: [],
          retailRankings: [],
          serviceStockouts: [],
          retailStockouts: [],
          orderSignals: [],
          servicePrices: [],
          retailPrices: [],
          leadTimeHints: [],
          commercialEvents: [
            {
              party: 'customer',
              entityType: 'service',
              entityId: 'service-1',
              stage: 'pending',
              quantityDelta: 1,
              flow: 'scheduled',
              reason: 'new_pending',
              note: null,
            },
          ],
          notes: null,
        },
      },
    ];
    let completionObservation: (typeof initialObservations)[number] | null = null;
    let currentInventory = {
      catalog: sampleCatalog,
      observations: initialObservations,
      workspaceSummary: sampleWorkspaceSummary,
      loadSenaSkuDetail: vi.fn(async (skuId: string) => detailBySkuId[skuId] ?? null),
      loadWorkSupportData: vi.fn(async () => null),
      ingestSenaObservation: vi.fn(async (payload) => {
        completionObservation = {
          observationId: 'obs-customer-completed',
          ownerSub: 'desktop-owner',
          input: payload,
        };
        return completionObservation;
      }),
      runWorkspacePreparation,
      triggerSenaRun: vi.fn(() =>
        triggerRun.promise.then((run) => {
          currentInventory = {
            ...currentInventory,
            observations: completionObservation ? [completionObservation, ...initialObservations] : initialObservations,
          };
          return run;
        }),
      ),
      isSaving: false,
    };
    inventoryHook.mockImplementation(() => currentInventory);

    renderRouteWithLocation('/?workflow=customer');

    expect((await screen.findAllByText('Haircut')).length).toBeGreaterThan(0);
    expect(document.querySelector('[data-customer-task-id="customer:service:service-1"]')).not.toBeNull();
    await user.click(screen.getByRole('button', { name: 'Mark completed' }));

    expect(await screen.findByRole('heading', { name: 'Haircut' })).toBeInTheDocument();
    const dialog = document.querySelector<HTMLElement>('[data-slot="sheet-content"]')!;
    expect(within(dialog).getByLabelText('Completed date and time')).toHaveValue('2026-04-09T16:44');
    fireEvent.change(within(dialog).getByLabelText('Quantity completed'), { target: { value: '1,000' } });
    expect(screen.getByTestId('route-location')).not.toHaveTextContent('/work/capture');
    expect(screen.getByTestId('route-location')).toHaveTextContent('/?workflow=customer&customerTask=customer%3Aservice%3Aservice-1');

    await user.click(within(dialog).getByRole('button', { name: 'Mark completed' }));

    await waitFor(() => {
      expect(currentInventory.ingestSenaObservation).toHaveBeenCalled();
    });
    expect(document.querySelector('[data-slot="loading-more-intervals"]')).not.toBeNull();
    expect(screen.getByText('Saving...')).toBeInTheDocument();
    expect(screen.queryByTestId('workspace-computing-screen')).not.toBeInTheDocument();
    expect(runWorkspacePreparation).not.toHaveBeenCalled();
    expect(currentInventory.ingestSenaObservation.mock.calls[0]![0]).toMatchObject({
      commercialEvents: [
        {
          party: 'customer',
          entityType: 'service',
          entityId: 'service-1',
          stage: 'pending',
          quantityDelta: -1,
          flow: 'scheduled',
          reason: 'from_pending',
        },
        {
          party: 'customer',
          entityType: 'service',
          entityId: 'service-1',
          stage: 'realized',
          quantityDelta: 1000,
          flow: 'scheduled',
          reason: 'from_pending',
        },
      ],
      serviceSalesSnapshot: [{ serviceId: 'service-1', unitsSold: 1000 }],
    });
    expect(currentInventory.triggerSenaRun).toHaveBeenCalledWith({ algorithmVersion: 'sena-analysis-v3' });

    act(() => {
      triggerRun.resolve({ runId: 'run-2' });
    });

    await waitFor(() => {
      expect(document.querySelector('[data-slot="loading-more-intervals"]')).toBeNull();
      expect(document.querySelector('[data-customer-task-id="customer:service:service-1"]')).toBeNull();
    });
  });

  test('opens customer ticket identity in the quick drawer and fulfills the selected ticket', async () => {
    const user = userEvent.setup();
    const triggerRun = deferred<{ runId: string }>();
    const runWorkspacePreparation = vi.fn(async (task) => task());
    const ticket = customerTicketFixture();
    let currentInventory = {
      catalog: sampleCatalog,
      observations: sampleObservations,
      recordUpdateContext: recordUpdateContextWithCustomerTickets([ticket]),
      workspaceSummary: sampleWorkspaceSummary,
      loadSenaSkuDetail: vi.fn(async (skuId: string) => detailBySkuId[skuId] ?? null),
      loadWorkSupportData: vi.fn(async () => null),
      ingestSenaObservation: vi.fn(async (payload) => payload),
      runWorkspacePreparation,
      triggerSenaRun: vi.fn(() =>
        triggerRun.promise.then((run) => {
          currentInventory = {
            ...currentInventory,
            recordUpdateContext: recordUpdateContextWithCustomerTickets([{
              ...ticket,
              lifecycle: 'resolved',
              stage: 'fulfilled_immediate',
              eventType: 'fulfilled_immediate',
              occurredAt: '2026-04-03T12:00:00.000Z',
              revision: 3,
            }]),
          };
          return run;
        }),
      ),
      isSaving: false,
    };
    inventoryHook.mockImplementation(() => currentInventory);

    renderRouteWithLocation('/?workflow=customer');

    expect(await screen.findByText('Customer work')).toBeInTheDocument();
    expect(screen.getAllByText('Contact').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Request').length).toBeGreaterThan(0);
    expect(screen.queryByText('Why now')).not.toBeInTheDocument();
    expect(screen.queryByText('Open / today')).not.toBeInTheDocument();
    expect(screen.getAllByText('Dara').length).toBeGreaterThan(0);
    expect(screen.getByText(/Instagram/)).toBeInTheDocument();
    expect(screen.getByText(/Phnom Penh/)).toBeInTheDocument();
    expect(screen.getAllByText(/1 x Haircut/).length).toBeGreaterThan(0);

    await user.click(screen.getByRole('button', { name: 'Customer Ticket ID: 2026-04-01-#1' }));

    const dialog = document.querySelector<HTMLElement>('[data-slot="sheet-content"]')!;
    expect(await within(dialog).findByRole('heading', { name: 'Customer Ticket ID: 2026-04-01-#1' })).toBeInTheDocument();
    expect(within(dialog).getByText('Prefers evening pickup')).toBeInTheDocument();
    expect(within(dialog).queryByLabelText('Quantity completed')).toBeNull();
    expect(screen.getByTestId('route-location')).toHaveTextContent('/?workflow=customer');
    expect(within(dialog).getByRole('link', { name: 'Edit in Capture' })).toHaveAttribute(
      'href',
      '/work/capture/customer-order?ticketMode=edit&ticketId=ticket-customer-1',
    );

    await user.click(within(dialog).getByRole('button', { name: 'Mark fulfilled' }));
    await user.click(within(dialog).getByRole('button', { name: 'Save quick update' }));

    await waitFor(() => {
      expect(currentInventory.ingestSenaObservation).toHaveBeenCalled();
    });
    expect(document.querySelector('[data-slot="loading-more-intervals"]')).not.toBeNull();
    expect(screen.getByText('Saving...')).toBeInTheDocument();
    expect(screen.queryByTestId('workspace-computing-screen')).not.toBeInTheDocument();
    expect(runWorkspacePreparation).not.toHaveBeenCalled();
    expect(currentInventory.ingestSenaObservation.mock.calls[0]![0]).toMatchObject({
      commercialEvents: [
        {
          party: 'customer',
          entityType: 'service',
          entityId: 'service-1',
          stage: 'pending',
          quantityDelta: -1,
          flow: 'scheduled',
          reason: 'from_pending',
        },
        {
          party: 'customer',
          entityType: 'service',
          entityId: 'service-1',
          stage: 'realized',
          quantityDelta: 1,
          flow: 'scheduled',
          reason: 'from_pending',
        },
      ],
      serviceSalesSnapshot: [{ serviceId: 'service-1', unitsSold: 1 }],
      ticketEvents: [
        {
          ticketId: 'ticket-customer-1',
          ticketFamily: 'customer',
          lifecycle: 'resolved',
          stage: 'fulfilled_immediate',
          revision: 3,
          eventType: 'fulfilled_immediate',
          party: ticket.party,
          lines: ticket.lines,
          deliveryFee: ticket.deliveryFee,
          discount: ticket.discount,
        },
      ],
    });
    expect(currentInventory.triggerSenaRun).toHaveBeenCalledWith({ algorithmVersion: 'sena-analysis-v3' });

    act(() => {
      triggerRun.resolve({ runId: 'run-2' });
    });

    await waitFor(() => {
      expect(document.querySelector('[data-slot="loading-more-intervals"]')).toBeNull();
      expect(document.querySelector('[data-customer-task-id="customer:ticket:ticket-customer-1"]')).toBeNull();
    });
  });

  test('skips dirty customer ticket line quantities when fulfilling from the quick drawer', async () => {
    const user = userEvent.setup();
    const triggerRun = deferred<{ runId: string }>();
    const ticket = customerTicketFixture({
      lines: [
        { entityType: 'service', entityId: 'service-1', quantityDelta: Number.NaN },
        { entityType: 'service', entityId: 'service-2', quantityDelta: 2 },
      ],
    });
    let currentInventory = {
      catalog: sampleCatalog,
      observations: sampleObservations,
      recordUpdateContext: recordUpdateContextWithCustomerTickets([ticket]),
      workspaceSummary: sampleWorkspaceSummary,
      loadSenaSkuDetail: vi.fn(async (skuId: string) => detailBySkuId[skuId] ?? null),
      loadWorkSupportData: vi.fn(async () => null),
      ingestSenaObservation: vi.fn(async (payload) => payload),
      runWorkspacePreparation: vi.fn(async (task) => task()),
      triggerSenaRun: vi.fn(() => triggerRun.promise),
      isSaving: false,
    };
    inventoryHook.mockImplementation(() => currentInventory);

    renderRouteWithLocation('/?workflow=customer');

    await user.click(await screen.findByRole('button', { name: 'Customer Ticket ID: 2026-04-01-#1' }));
    const dialog = document.querySelector<HTMLElement>('[data-slot="sheet-content"]')!;
    await user.click(within(dialog).getByRole('button', { name: 'Mark fulfilled' }));
    await user.click(within(dialog).getByRole('button', { name: 'Save quick update' }));

    await waitFor(() => {
      expect(currentInventory.ingestSenaObservation).toHaveBeenCalled();
    });
    expect(currentInventory.ingestSenaObservation.mock.calls[0]![0].commercialEvents).toEqual([
      {
        party: 'customer',
        entityType: 'service',
        entityId: 'service-2',
        stage: 'pending',
        quantityDelta: -2,
        flow: 'scheduled',
        reason: 'from_pending',
        note: null,
      },
      {
        party: 'customer',
        entityType: 'service',
        entityId: 'service-2',
        stage: 'realized',
        quantityDelta: 2,
        flow: 'scheduled',
        reason: 'from_pending',
        note: null,
      },
    ]);
    expect(JSON.stringify(currentInventory.ingestSenaObservation.mock.calls[0]![0].commercialEvents)).not.toContain('NaN');
  });

  test('opens customer ticket review actions in the queue drawer', async () => {
    const user = userEvent.setup();
    const ticket = customerTicketFixture({
      lines: [
        { entityType: 'service', entityId: 'service-1', quantityDelta: 1 },
        { entityType: 'service', entityId: 'service-2', quantityDelta: 1 },
        { entityType: 'sku', entityId: 'sku-4', quantityDelta: 1 },
      ],
    });
    inventoryHook.mockReturnValue({
      catalog: sampleCatalog,
      observations: sampleObservations,
      recordUpdateContext: recordUpdateContextWithCustomerTickets([ticket]),
      workspaceSummary: sampleWorkspaceSummary,
      loadSenaSkuDetail: vi.fn(async (skuId: string) => detailBySkuId[skuId] ?? null),
      loadWorkSupportData: vi.fn(async () => null),
      ingestSenaObservation: vi.fn(async (payload) => payload),
      runWorkspacePreparation: vi.fn(async (task) => task()),
      triggerSenaRun: vi.fn(async () => ({ runId: 'run-2' })),
      isSaving: false,
    });

    renderRouteWithLocation('/?workflow=customer');

    const ticketButton = await screen.findByRole('button', { name: 'Customer Ticket ID: 2026-04-01-#1' });
    const ticketRow = ticketButton.closest('[data-customer-task-id]') as HTMLElement;
    const reviewButton = within(ticketRow).getByRole('button', { name: 'Review' });
    expect(reviewButton.querySelector('circle[cx="11"][cy="11"][r="8"]')).not.toBeNull();
    expect(reviewButton.querySelector('path[d="M11 7v4"]')).not.toBeNull();
    await user.click(reviewButton);

    const dialog = document.querySelector<HTMLElement>('[data-slot="sheet-content"]')!;
    expect(await within(dialog).findByRole('heading', { name: 'Customer Ticket ID: 2026-04-01-#1' })).toBeInTheDocument();
    expect(within(dialog).getByText('1 x Haircut, 1 x Coloring +1 more')).toBeInTheDocument();
    expect(within(dialog).getByText('ETA')).toBeInTheDocument();
    expect(within(dialog).getByText('Next touch 4/4/2026')).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Follow up' }).querySelector('.lucide-clipboard-clock')).not.toBeNull();
    expect(within(dialog).getByRole('button', { name: 'Cancel ticket' }).querySelector('.lucide-x')).not.toBeNull();
    expect(within(dialog).getByRole('button', { name: 'Mark fulfilled' }).querySelector('.lucide-check')).not.toBeNull();
    expect(dialog).toHaveClass('overflow-hidden');
    expect(dialog.querySelector<HTMLElement>('[data-slot="customer-queue-drawer-scroll"]')).toHaveClass('overflow-y-auto');
    expect(dialog.querySelector<HTMLElement>('[data-slot="customer-queue-drawer-footer"]')).toHaveClass('shrink-0');
    expect(screen.getByTestId('route-location')).toHaveTextContent('/?workflow=customer');
    expect(screen.getByTestId('route-location')).not.toHaveTextContent('/work/capture');
  });

  test('clamps customer follow-up next touch date to the update date', async () => {
    const user = userEvent.setup();
    const ticket = customerTicketFixture();
    inventoryHook.mockReturnValue({
      catalog: sampleCatalog,
      observations: sampleObservations,
      recordUpdateContext: recordUpdateContextWithCustomerTickets([ticket]),
      workspaceSummary: sampleWorkspaceSummary,
      loadSenaSkuDetail: vi.fn(async (skuId: string) => detailBySkuId[skuId] ?? null),
      loadWorkSupportData: vi.fn(async () => null),
      ingestSenaObservation: vi.fn(async (payload) => payload),
      runWorkspacePreparation: vi.fn(async (task) => task()),
      triggerSenaRun: vi.fn(async () => ({ runId: 'run-2' })),
      isSaving: false,
    });

    renderRouteWithLocation('/?workflow=customer');

    const ticketButton = await screen.findByRole('button', { name: 'Customer Ticket ID: 2026-04-01-#1' });
    const ticketRow = ticketButton.closest('[data-customer-task-id]') as HTMLElement;
    await user.click(within(ticketRow).getByRole('button', { name: 'Review' }));

    const dialog = document.querySelector<HTMLElement>('[data-slot="sheet-content"]')!;
    const observedInput = await within(dialog).findByLabelText('Update date and time');
    fireEvent.change(observedInput, { target: { value: '2026-04-10T09:15' } });
    const nextTouchInput = within(dialog).getByLabelText('Next touch date');

    expect(nextTouchInput).toHaveAttribute('min', '2026-04-10');

    fireEvent.change(nextTouchInput, { target: { value: '2026-04-01' } });

    expect(nextTouchInput).toHaveValue('2026-04-10');
  });

  test('shows an inline error when customer quick update date is missing', async () => {
    const user = userEvent.setup();
    const ticket = customerTicketFixture();
    const ingestSenaObservation = vi.fn(async (payload) => payload);
    inventoryHook.mockReturnValue({
      catalog: sampleCatalog,
      observations: sampleObservations,
      recordUpdateContext: recordUpdateContextWithCustomerTickets([ticket]),
      workspaceSummary: sampleWorkspaceSummary,
      loadSenaSkuDetail: vi.fn(async (skuId: string) => detailBySkuId[skuId] ?? null),
      loadWorkSupportData: vi.fn(async () => null),
      ingestSenaObservation,
      runWorkspacePreparation: vi.fn(async (task) => task()),
      triggerSenaRun: vi.fn(async () => ({ runId: 'run-2' })),
      isSaving: false,
    });

    renderRouteWithLocation('/?workflow=customer');

    const ticketButton = await screen.findByRole('button', { name: 'Customer Ticket ID: 2026-04-01-#1' });
    const ticketRow = ticketButton.closest('[data-customer-task-id]') as HTMLElement;
    await user.click(within(ticketRow).getByRole('button', { name: 'Review' }));

    const dialog = document.querySelector<HTMLElement>('[data-slot="sheet-content"]')!;
    const observedInput = await within(dialog).findByLabelText('Update date and time');
    fireEvent.change(observedInput, { target: { value: '' } });
    await user.click(within(dialog).getByRole('button', { name: 'Save quick update' }));

    expect(await within(dialog).findByText('Update date and time is required.')).toBeInTheDocument();
    expect(ingestSenaObservation).not.toHaveBeenCalled();
  });

  test('requires a next touch date before saving a customer follow-up', async () => {
    const user = userEvent.setup();
    const ticket = customerTicketFixture();
    const ingestSenaObservation = vi.fn(async (payload) => payload);
    inventoryHook.mockReturnValue({
      catalog: sampleCatalog,
      observations: sampleObservations,
      recordUpdateContext: recordUpdateContextWithCustomerTickets([ticket]),
      workspaceSummary: sampleWorkspaceSummary,
      loadSenaSkuDetail: vi.fn(async (skuId: string) => detailBySkuId[skuId] ?? null),
      loadWorkSupportData: vi.fn(async () => null),
      ingestSenaObservation,
      runWorkspacePreparation: vi.fn(async (task) => task()),
      triggerSenaRun: vi.fn(async () => ({ runId: 'run-2' })),
      isSaving: false,
    });

    renderRouteWithLocation('/?workflow=customer');

    const ticketButton = await screen.findByRole('button', { name: 'Customer Ticket ID: 2026-04-01-#1' });
    const ticketRow = ticketButton.closest('[data-customer-task-id]') as HTMLElement;
    await user.click(within(ticketRow).getByRole('button', { name: 'Review' }));

    const dialog = document.querySelector<HTMLElement>('[data-slot="sheet-content"]')!;
    const nextTouchInput = await within(dialog).findByLabelText('Next touch date');
    fireEvent.change(nextTouchInput, { target: { value: '' } });
    await user.click(within(dialog).getByRole('button', { name: 'Save quick update' }));

    expect(await within(dialog).findByText('Next touch date is required.')).toBeInTheDocument();
    expect(ingestSenaObservation).not.toHaveBeenCalled();
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
      expect(screen.getAllByText('Dara').length).toBeGreaterThan(0);
    });

    const highlightedRow = document.querySelector('[data-customer-task-id="automation:intake:intake-1"]');
    expect(highlightedRow?.className).not.toContain('ring-emerald-300');
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
      expect(screen.getAllByText('Dara').length).toBeGreaterThan(0);
    });

    await user.click(screen.getByRole('button', { name: 'Open intake' }));

    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 2, name: 'Telegram intake' })).toBeInTheDocument();
    });
    expect(readConversation).not.toHaveBeenCalled();
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

    renderRouteWithLocation('/?workflow=supplier');

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

  test('opens supplier SKU actions in the quick-update drawer instead of the batch prompt', async () => {
    const { container } = renderRouteWithLocation('/?workflow=supplier');

    await act(async () => {
      fireEvent.click(screen.getAllByRole('button', { name: 'Record Supplier order' })[0]!);
    });

    await waitFor(() => {
      expect(container.querySelector('[data-slot="sheet-content"]')).not.toBeNull();
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      expect(screen.getByTestId('route-location')).toHaveTextContent('/');
    });
    expect(screen.getByRole('heading', { name: 'Supplier order' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'overviewDrawerSubmitDefault' })).toBeInTheDocument();
    expect(savePreferencesMock).not.toHaveBeenCalled();
  });

  test('navigates to the SKU detail page when clicking an overview item', async () => {
    const user = userEvent.setup();
    renderRouteWithLocation('/?workflow=supplier');

    await user.click(screen.getByRole('link', { name: /Razor refill/i }));

    await waitFor(() => {
      expect(screen.getByTestId('route-location')).toHaveTextContent('/catalog/skus/sku-1');
    });
  });

  test('opens task drawers without writing pre-submit popup state to the route', async () => {
    inventoryHook.mockReturnValue({
      catalog: sampleCatalog,
      observations: sampleObservations,
      recordUpdateContext: recordUpdateContextWithSupplierTickets([
        supplierTicketForSku({ skuId: 'sku-3', ticketId: 'ticket-supplier-ready', stage: 'ordered_waiting' }),
      ]),
      workspaceSummary: sampleWorkspaceSummary,
      loadSenaSkuDetail: vi.fn(async (skuId: string) => detailBySkuId[skuId] ?? null),
      isSaving: false,
    });

    const { container } = renderRouteWithLocation('/?workflow=supplier');

    fireEvent.click(screen.getByRole('button', { name: /Supplier Ticket ID:/ }));

    await waitFor(() => {
      expect(container.querySelector('[data-slot="sheet-content"]')).not.toBeNull();
      expect(screen.getByTestId('route-location')).toHaveTextContent('/');
    });
  });

  test('opens supplier ticket action buttons in the quick-update drawer', async () => {
    inventoryHook.mockReturnValue({
      catalog: sampleCatalog,
      observations: sampleObservations,
      recordUpdateContext: recordUpdateContextWithSupplierTickets([
        supplierTicketForSku({ skuId: 'sku-3', ticketId: 'ticket-supplier-ready', stage: 'ordered_waiting' }),
      ]),
      workspaceSummary: sampleWorkspaceSummary,
      loadSenaSkuDetail: vi.fn(async (skuId: string) => detailBySkuId[skuId] ?? null),
      isSaving: false,
    });

    const { container } = renderRouteWithLocation('/?workflow=supplier');

    fireEvent.click(screen.getByRole('button', { name: 'Receive' }));

    await waitFor(() => {
      expect(container.querySelector('[data-slot="sheet-content"]')).not.toBeNull();
      expect(screen.getByTestId('route-location')).toHaveTextContent('/');
    });
    expect(screen.getByRole('heading', { name: 'Supplier Ticket ID: 2026-04-01-#1' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Edit in Capture' })).toHaveAttribute(
      'href',
      '/work/capture/supplier-receipt?ticketMode=edit&ticketId=ticket-supplier-ready&skus=sku-3&flashTargets=supplier-receipt%3Asku-3',
    );
    expect(screen.getByRole('button', { name: 'overviewDrawerSubmitGoodsReceived' })).toBeInTheDocument();
  });

  test('opens observation-backed supplier ticket actions without the batch prompt', async () => {
    const ticket = supplierTicketForSku({ skuId: 'sku-3', ticketId: 'ticket-supplier-observation', stage: 'ordered_waiting' });
    inventoryHook.mockReturnValue({
      catalog: sampleCatalog,
      observations: [{
        observationId: 'obs-ticket-supplier-observation',
        ownerSub: 'desktop-owner',
        input: {
          observedAt: '2026-04-01T09:00:00.000Z',
          stockSnapshot: [],
          serviceRankings: [],
          retailRankings: [],
          serviceStockouts: [],
          retailStockouts: [],
          orderSignals: [{
            skuId: 'sku-3',
            orderPlaced: true,
            receiptArrived: false,
            approximateOrderQuantity: 8,
            approximateReceiptQuantity: null,
          }],
          servicePrices: [],
          retailPrices: [],
          leadTimeHints: [],
          ticketEvents: [ticket],
          notes: null,
        },
      }],
      recordUpdateContext: null,
      workspaceSummary: sampleWorkspaceSummary,
      loadSenaSkuDetail: vi.fn(async (skuId: string) => detailBySkuId[skuId] ?? null),
      isSaving: false,
    });

    const { container } = renderRouteWithLocation('/?workflow=supplier');

    fireEvent.click(screen.getByRole('button', { name: 'Update ETA' }));

    await waitFor(() => {
      expect(container.querySelector('[data-slot="sheet-content"]')).not.toBeNull();
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      expect(screen.getByTestId('route-location')).toHaveTextContent('/?workflow=supplier');
    });
    expect(screen.getByRole('heading', { name: 'Supplier Ticket ID: 2026-04-01-#1' })).toBeInTheDocument();
  });

  test('renders shared supplier ticket SKU rows as one queue row', async () => {
    const ticket: SenaTicketSummary = {
      ...supplierTicketForSku({ skuId: 'sku-2', ticketId: 'ticket-supplier-shared', stage: 'ordered_waiting' }),
      lines: [
        { entityType: 'sku', entityId: 'sku-2', orderedQuantity: 18, receivedQuantity: null, expectedArrivalAt: '2026-04-03T12:00:00.000Z' },
        { entityType: 'sku', entityId: 'sku-3', orderedQuantity: 24, receivedQuantity: null, expectedArrivalAt: '2026-04-03T12:00:00.000Z' },
      ],
    };
    inventoryHook.mockReturnValue({
      catalog: sampleCatalog,
      observations: sampleObservations,
      recordUpdateContext: recordUpdateContextWithSupplierTickets([ticket]),
      workspaceSummary: sampleWorkspaceSummary,
      loadSenaSkuDetail: vi.fn(async (skuId: string) => detailBySkuId[skuId] ?? null),
      isSaving: false,
    });

    renderRouteWithLocation('/?workflow=supplier');

    expect(await screen.findByRole('button', { name: /Supplier Ticket ID: 2026-04-01-#1/i })).toBeInTheDocument();
    const rows = Array.from(document.querySelectorAll('[data-slot="overview-task-row"]'));
    const ticketRows = rows.filter((row) => row.textContent?.includes('Supplier Ticket ID: 2026-04-01-#1'));
    expect(ticketRows).toHaveLength(1);
    expect(ticketRows[0]).toHaveTextContent('2 SKUs');
  });

  test('opens grouped supplier ticket row actions in the quick-update drawer', async () => {
    const ticket: SenaTicketSummary = {
      ...supplierTicketForSku({ skuId: 'sku-2', ticketId: 'ticket-supplier-shared', stage: 'ordered_waiting' }),
      lines: [
        { entityType: 'sku', entityId: 'sku-2', orderedQuantity: 18, receivedQuantity: null, expectedArrivalAt: '2026-04-03T12:00:00.000Z' },
        { entityType: 'sku', entityId: 'sku-3', orderedQuantity: 24, receivedQuantity: null, expectedArrivalAt: '2026-04-03T12:00:00.000Z' },
      ],
    };
    inventoryHook.mockReturnValue({
      catalog: sampleCatalog,
      observations: sampleObservations,
      recordUpdateContext: recordUpdateContextWithSupplierTickets([ticket]),
      workspaceSummary: sampleWorkspaceSummary,
      loadSenaSkuDetail: vi.fn(async (skuId: string) => detailBySkuId[skuId] ?? null),
      isSaving: false,
    });

    const { container } = renderRouteWithLocation('/?workflow=supplier');

    fireEvent.click(await screen.findByRole('button', { name: 'Receive' }));

    await waitFor(() => {
      expect(container.querySelector('[data-slot="sheet-content"]')).not.toBeNull();
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      expect(screen.getByTestId('route-location')).toHaveTextContent('/?workflow=supplier');
      expect(screen.getByTestId('route-location')).not.toHaveTextContent('/work/capture');
    });
    expect(screen.getByRole('heading', { name: 'Supplier Ticket ID: 2026-04-01-#1' })).toBeInTheDocument();
  });

  test('opens supplier task deep-links before clearing task route state', async () => {
    inventoryHook.mockReturnValue({
      catalog: sampleCatalog,
      observations: sampleObservations,
      recordUpdateContext: recordUpdateContextWithSupplierTickets([
        supplierTicketForSku({ skuId: 'sku-3', ticketId: 'ticket-supplier-ready', stage: 'ordered_waiting' }),
      ]),
      workspaceSummary: sampleWorkspaceSummary,
      loadSenaSkuDetail: vi.fn(async (skuId: string) => detailBySkuId[skuId] ?? null),
      isSaving: false,
    });
    const { container } = renderRouteWithLocation('/?workflow=supplier&task=supplier-ticket%3Aticket-supplier-ready&taskMode=goods_received');

    await waitFor(() => {
      expect(container.querySelector('[data-slot="sheet-content"]')).not.toBeNull();
    });

    expect(screen.getByTestId('route-location')).toHaveTextContent('/?workflow=supplier&task=supplier-ticket%3Aticket-supplier-ready&taskMode=goods_received');

    fireEvent.click(screen.getByRole('button', { name: 'Close' }));

    await waitFor(() => {
      expect(container.querySelector('[data-slot="sheet-content"]')).toBeNull();
      expect(screen.getByTestId('route-location')).toHaveTextContent('/');
    });
  });

  test('opens supplier queue actions in the drawer despite a saved batch preference', async () => {
    preferenceState.taskBatchUpdatePreferences = {
      ...preferenceState.taskBatchUpdatePreferences,
      logOrder: 'always_batch',
    };

    const { container } = renderRouteWithLocation('/?workflow=supplier');

    fireEvent.click((await screen.findAllByRole('button', { name: 'Record Supplier order' }))[0]!);

    await waitFor(() => {
      expect(container.querySelector('[data-slot="sheet-content"]')).not.toBeNull();
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      expect(screen.getByTestId('route-location')).toHaveTextContent('/?workflow=supplier');
      expect(screen.getByTestId('route-location')).not.toHaveTextContent('/work/capture');
    });
    expect(screen.getByRole('heading', { name: 'Supplier order' })).toBeInTheDocument();
    expect(savePreferencesMock).not.toHaveBeenCalled();
  });

  test('shows the shared saving island while supplier queue saves refresh', async () => {
    const user = userEvent.setup();
    const triggerRun = deferred<{ runId: string }>();
    const runWorkspacePreparation = vi.fn(async (task) => task());
    const ticket = supplierTicketForSku({ skuId: 'sku-3', ticketId: 'ticket-supplier-ready', stage: 'ordered_waiting' });
    const currentInventory = {
      catalog: sampleCatalog,
      observations: sampleObservations,
      recordUpdateContext: recordUpdateContextWithSupplierTickets([ticket]),
      workspaceSummary: sampleWorkspaceSummary,
      loadSenaSkuDetail: vi.fn(async (skuId: string) => detailBySkuId[skuId] ?? null),
      loadWorkSupportData: vi.fn(async () => null),
      ingestSenaObservation: vi.fn(async (payload) => payload),
      runWorkspacePreparation,
      triggerSenaRun: vi.fn(() => triggerRun.promise),
      isSaving: false,
    };
    inventoryHook.mockReturnValue(currentInventory);

    const { container } = renderRouteWithLocation('/?workflow=supplier&filter=ready_to_receive');

    await user.click(await screen.findByRole('button', { name: 'Receive' }));
    await waitFor(() => {
      expect(container.querySelector('[data-slot="sheet-content"]')).not.toBeNull();
    });

    await user.click(await screen.findByRole('button', { name: 'overviewDrawerSubmitGoodsReceived' }));

    await waitFor(() => {
      expect(currentInventory.ingestSenaObservation).toHaveBeenCalled();
    });
    expect(currentInventory.triggerSenaRun).toHaveBeenCalledWith({ algorithmVersion: 'sena-analysis-v3' });
    expect(document.querySelector('[data-slot="loading-more-intervals"]')).not.toBeNull();
    expect(screen.getByText('Saving...')).toBeInTheDocument();
    expect(screen.queryByTestId('workspace-computing-screen')).not.toBeInTheDocument();
    expect(runWorkspacePreparation).not.toHaveBeenCalled();

    act(() => {
      triggerRun.resolve({ runId: 'run-2' });
    });

    await waitFor(() => {
      expect(document.querySelector('[data-slot="loading-more-intervals"]')).toBeNull();
    });
  });

  test('hides the overview right rail when the global toggle is off', async () => {
    preferenceState.showRightRailCards = false;

    renderRouteWithLocation('/?workflow=supplier');

    expect(await screen.findByRole('heading', { level: 2, name: 'Task queue' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { level: 2, name: 'Today' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { level: 2, name: 'In transit' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { level: 2, name: 'Recent receipts' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { level: 2, name: 'Business signals' })).not.toBeInTheDocument();
  });

  test('hides the overview tabs and keeps explicit supplier queue when tab view is disabled', async () => {
    preferenceState.showOverviewTaskTabs = false;

    renderRouteWithLocation('/?workflow=supplier&filter=ready_to_receive');

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

    expect(await screen.findByText('Work needs products first')).toBeInTheDocument();
    expect(screen.queryByText('Create the first SKU or service so Kaur Khor can build an action list from real products work.')).not.toBeInTheDocument();
  });

  test('hides overview task queue helper copy when optional help is disabled', async () => {
    preferenceState.showExplanatoryTooltips = false;

    renderRouteWithLocation('/?workflow=supplier');

    expect(await screen.findByText('Razor refill')).toBeInTheDocument();
    expect(screen.getAllByText('Order now').length).toBeGreaterThan(0);
    expect(screen.queryByText('Haircut')).not.toBeInTheDocument();
    expect(screen.queryByText('Rec. 15u · likely 78%')).not.toBeInTheDocument();
  });

});
