import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from 'react';
import { createContext, useContext } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import type { SenaRecordUpdateContext, SenaTicketSummary } from '@shared/sena';
import { getTranslation } from '@/lib/translations';
import { OverviewTaskDrawer } from './task-drawer';
import type { OverviewSkuTask, OverviewSupplierTicketTask } from './view-model';

const realDate = Date;
const inventoryHook = vi.fn();
const sheetContext = createContext<{ onOpenChange?: (open: boolean) => void } | null>(null);
const toggleGroupContext = createContext<{
  onValueChange?: (value: string) => void;
  value?: string;
} | null>(null);

vi.mock('@/state/inventory', () => ({
  useInventory: () => inventoryHook(),
}));

vi.mock('@/state/preferences', () => ({
  usePreferences: () => ({
    language: 'en',
    t: (key: string, variables?: Record<string, string | number>) => getTranslation('en', key as never, variables),
  }),
}));

vi.mock('@/components/ui/sheet', () => ({
  Sheet: ({
    children,
    onOpenChange,
    open,
  }: {
    children: ReactNode;
    onOpenChange?: (open: boolean) => void;
    open?: boolean;
  }) => (open ? <sheetContext.Provider value={{ onOpenChange }}>{children}</sheetContext.Provider> : null),
  SheetContent: ({
    children,
    showCloseButton: _showCloseButton,
    side: _side,
    ...props
  }: HTMLAttributes<HTMLDivElement> & { showCloseButton?: boolean; side?: 'top' | 'right' | 'bottom' | 'left' }) => <div {...props}>{children}</div>,
  SheetHeader: ({ children, ...props }: HTMLAttributes<HTMLDivElement>) => <div {...props}>{children}</div>,
  SheetFooter: ({ children, ...props }: HTMLAttributes<HTMLDivElement>) => <div {...props}>{children}</div>,
  SheetTitle: ({ children, ...props }: HTMLAttributes<HTMLHeadingElement>) => <h2 {...props}>{children}</h2>,
  SheetDescription: ({ children, ...props }: HTMLAttributes<HTMLParagraphElement>) => <p {...props}>{children}</p>,
  SheetClose: ({ children, onClick, ...props }: ButtonHTMLAttributes<HTMLButtonElement>) => {
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

const supplierTicket: SenaTicketSummary = {
  ticketId: 'supplier-ticket-1',
  ticketFamily: 'supplier',
  lifecycle: 'open',
  stage: 'ordered_waiting',
  revision: 3,
  eventType: 'created',
  occurredAt: '2026-04-09T09:59:00.000Z',
  nextTouchAt: '2026-04-14T05:00:00.000Z',
  party: {
    role: 'supplier',
    supplierName: 'Mekong Looms',
  },
  lines: [{
    entityType: 'sku',
    entityId: 'sku-3',
    orderedQuantity: 8,
    receivedQuantity: null,
    expectedArrivalAt: '2026-04-14T05:00:00.000Z',
  }],
  note: null,
};

const childTask: OverviewSkuTask = {
  id: 'task-sku-3',
  kind: 'sku',
  skuId: 'sku-3',
  skuName: 'Coke',
  state: 'awaiting_receipt',
  stateLabel: 'Ordered',
  statusTone: 'info',
  action: 'update_eta',
  actionLabel: 'Update ETA',
  defaultDrawerMode: 'eta_changed',
  serviceImpact: 'Could restore combo',
  whyNow: 'Supplier timing changed',
  whyDetail: 'Ticket needs a quick timing update.',
  etaLabel: 'May 14',
  etaDetail: 'Normal supplier window.',
  confidenceCue: 'Normal timing',
  heartbeat: ['8 ordered'],
  nextSteps: ['Save a quick ticket update or edit in Capture.'],
  linkedServiceNames: ['Combo'],
  imagePath: null,
  supplierName: 'Mekong Looms',
  batchOrderId: null,
  childOrderId: null,
  supplierTicket,
  supplierTicketId: 'supplier-ticket-1',
  batchChildCount: 0,
  currentStock: 36,
  costPerUnit: 3,
  productPrice: 8,
  soldAsProduct: true,
  expectedArrivalDate: '2026-04-14',
  arrivalWindowStart: '2026-04-13T00:00:00.000Z',
  arrivalWindowEnd: '2026-04-15T00:00:00.000Z',
  leadTimeMeanDays: 4,
  leadTimeStdDays: 1,
  variabilityClass: 'tight',
  suggestedOrderQuantity: 0,
  recentOrderQuantity: 8,
  recentReceiptQuantity: null,
  latestObservationAt: '2026-04-09T09:59:00.000Z',
  latestOrderAt: '2026-04-09T09:59:00.000Z',
  latestReceiptAt: null,
  hasRecentPriceSignal: false,
  regimeKey: 'normal',
  regimeLabel: 'Adjustment pattern',
  stockoutRisk: 0.05,
  reorderTriggerProbability: 0,
  reorderRecommendation: {
    hasBackendRecommendation: true,
    recommendationIssued: true,
    recommendedUnits: 8,
    recommendedUnitsLabel: '8 units',
    recommendedOrderLabel: 'Recommended range 6-10 units',
    quietLabel: 'Keep watching',
    likelyRangeLabel: 'Recommended range 6-10 units',
    needProbabilityValueLabel: '75%',
    needProbabilityLabel: 'order likelihood 75%',
    optionalOrderLabel: null,
    compactLabel: '8 units',
    likelyRangeValueLabel: '6-10 units',
    protectionHorizonLabel: 'Covers the next supplier window',
    policyBasisLabel: 'Based on reorder policy',
  },
  daysOfCover: 2,
};

const ticketTask: OverviewSupplierTicketTask = {
  ...childTask,
  id: 'supplier-ticket:supplier-ticket-1',
  kind: 'supplier_ticket',
  ticketId: 'supplier-ticket-1',
  displayTicketId: '2026-04-09-#1',
  displayTicketLabel: 'Supplier Ticket ID: 2026-04-09-#1',
  ticket: supplierTicket,
  childTasks: [childTask],
  defaultDrawerMode: 'eta_changed',
  skuCount: 1,
  skuSummaryLabel: '1 SKU: Coke',
  skuNames: ['Coke'],
};

function recordUpdateContextWithSupplierTicket(ticket: SenaTicketSummary): SenaRecordUpdateContext {
  return {
    observationFingerprint: { count: 1, latestObservedAt: ticket.occurredAt, latestObservationId: 'obs-ticket' },
    latestObservedAt: ticket.occurredAt,
    latestStockBySku: {},
    latestRetailSaleBySku: {},
    latestServiceSaleByService: {},
    latestOrderBySku: {},
    latestReceiptBySku: {},
    openTicketsByFamily: { customer: [], supplier: [ticket] },
    latestTicketsById: {
      [ticket.ticketId]: {
        observationId: 'obs-ticket',
        observedAt: ticket.occurredAt,
        value: ticket,
      },
    },
    latestDeliveryFeeByBucket: {},
    recentActivity: [],
  };
}

function renderDrawer(
  task: OverviewSupplierTicketTask,
  mode = task.defaultDrawerMode,
  onOpenChange = vi.fn(),
  presentation: 'side' | 'bottom' = 'side',
) {
  render(
    <MemoryRouter>
      <OverviewTaskDrawer open mode={mode} presentation={presentation} task={task} onModeChange={vi.fn()} onOpenChange={onOpenChange} />
    </MemoryRouter>,
  );
  return { onOpenChange };
}

describe('OverviewTaskDrawer', () => {
  beforeEach(() => {
    inventoryHook.mockReturnValue({
      ingestSenaObservation: vi.fn(async (payload: unknown) => payload),
      recordUpdateContext: recordUpdateContextWithSupplierTicket(supplierTicket),
      runWorkspacePreparation: vi.fn(async (task: () => Promise<unknown>) => task()),
      triggerSenaRun: vi.fn(async () => ({ runId: 'run-2' })),
      isSaving: false,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  test('defaults supplier task timing fields from the current local system date', async () => {
    freezeDate(new realDate(2026, 3, 9, 16, 44).toISOString());

    renderDrawer({ ...ticketTask, expectedArrivalDate: null }, 'eta_changed');

    expect(await screen.findByLabelText('Observed at')).toHaveValue('2026-04-09T16:44');
    expect(screen.getByLabelText('Expected arrival date')).toHaveValue('2026-04-16');
  });

  test('clamps supplier ETA updates to the observed local date', async () => {
    freezeDate(new realDate(2026, 3, 9, 16, 44).toISOString());

    renderDrawer(ticketTask, 'eta_changed');

    const observedInput = await screen.findByLabelText('Observed at');
    fireEvent.change(observedInput, { target: { value: '2026-04-20T09:15' } });
    const expectedArrivalInput = screen.getByLabelText('Expected arrival date');

    expect(expectedArrivalInput).toHaveAttribute('min', '2026-04-20');
    expect(expectedArrivalInput).toHaveValue('2026-04-20');

    fireEvent.change(expectedArrivalInput, { target: { value: '2026-04-10' } });

    expect(expectedArrivalInput).toHaveValue('2026-04-20');
  });

  test('blocks supplier drawer saves when the observed timestamp is cleared', async () => {
    renderDrawer(ticketTask, 'goods_received');

    fireEvent.change(await screen.findByLabelText('Received date/time'), { target: { value: '' } });

    const saveButton = screen.getByRole('button', { name: 'Confirm inventory update' });
    expect(saveButton).toBeDisabled();
    fireEvent.click(saveButton);
    expect(inventoryHook().ingestSenaObservation).not.toHaveBeenCalled();
  });

  test('renders an existing ticket quick-update drawer without detailed quantity or cost editors', async () => {
    renderDrawer(ticketTask);

    expect(await screen.findByRole('heading', { name: 'Supplier Ticket ID: 2026-04-09-#1' })).toBeInTheDocument();
    const editLink = screen.getByRole('link', { name: 'Edit in Capture' });
    expect(editLink).toHaveAttribute(
      'href',
      '/work/capture/supplier-order?ticketMode=edit&ticketId=supplier-ticket-1',
    );
    expect(editLink.querySelector('svg')).not.toBeNull();
    expect(screen.queryByLabelText('Ordered quantity')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Received quantity')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Received cost')).not.toBeInTheDocument();
    expect(screen.queryByText('Recommended order')).not.toBeInTheDocument();
    expect(screen.queryByText(/next stock/i)).not.toBeInTheDocument();
  });

  test('routes draft supplier queue groups to the existing child ticket when editing in Capture', async () => {
    renderDrawer({
      ...ticketTask,
      id: 'draft-supplier-ticket:sku-3',
      ticketId: 'draft-supplier-ticket:sku-3',
      ticket: {
        ...supplierTicket,
        ticketId: 'draft-supplier-ticket:sku-3',
      },
      childTasks: [{
        ...childTask,
        supplierTicket: null,
        supplierTicketId: 'supplier-ticket-1',
      }],
    });

    expect(await screen.findByRole('heading', { name: 'Supplier Ticket ID: 2026-04-09-#1' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Edit in Capture' })).toHaveAttribute(
      'href',
      '/work/capture/supplier-order?ticketMode=edit&ticketId=supplier-ticket-1',
    );
  });

  test('uses the bottom sheet presentation for embedded phone drawers', async () => {
    renderDrawer(ticketTask, ticketTask.defaultDrawerMode, vi.fn(), 'bottom');

    await screen.findByRole('heading', { name: 'Supplier Ticket ID: 2026-04-09-#1' });
    const drawer = document.querySelector('[data-slot="phone-task-drawer"]');
    expect(drawer).not.toBeNull();
    expect(drawer).toHaveAttribute('data-slot', 'phone-task-drawer');
    expect(drawer).toHaveClass('h-[var(--kaur-khor-embedded-effective-height,100dvh)]', 'max-h-[var(--kaur-khor-embedded-effective-height,100dvh)]', 'rounded-t-[1.35rem]', 'border-t');
    expect(drawer).not.toHaveClass('sm:max-w-2xl', 'border-l');
    expect(screen.queryByText('8 ordered')).not.toBeInTheDocument();
    expect(screen.queryByText(/Mode:/)).not.toBeInTheDocument();
    expect(screen.queryByText('Kaur Khor will save the order signal and the current arrival window.')).not.toBeInTheDocument();
    await screen.findByText('Order canceled');
    expect(screen.getByRole('button', { name: 'Close' })).toHaveClass('absolute', 'top-4', 'right-4', 'z-30');
    expect(document.querySelector('[data-band-id="real_life"] [role="group"]')).toHaveStyle({ gridTemplateColumns: 'repeat(1, minmax(0, 1fr))' });
    expect(screen.getByText('Order canceled')).toHaveClass('whitespace-normal', 'break-words');
    expect(screen.getByText('Record the supplier cancellation')).toHaveClass('whitespace-normal', 'break-words');
    const editLink = screen.getByRole('link', { name: 'Edit in Capture' });
    const saveButton = screen.getByRole('button', { name: 'Save and refresh' });
    expect(editLink).toHaveClass('flex-1', 'min-w-0');
    expect(saveButton).toHaveClass('flex-1', 'min-w-0');
  });

  test('reuses the existing supplier ticket identity when saving an ETA update', async () => {
    renderDrawer(ticketTask, 'eta_changed');

    fireEvent.change(await screen.findByLabelText('Expected arrival date'), { target: { value: '2026-04-16' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save and refresh' }));

    await waitFor(() => {
      expect(inventoryHook().ingestSenaObservation).toHaveBeenCalledWith(expect.objectContaining({
        ticketEvents: [
          expect.objectContaining({
            eventType: 'eta_updated',
            revision: 4,
            ticketId: 'supplier-ticket-1',
            lines: [
              expect.objectContaining({
                entityId: 'sku-3',
                orderedQuantity: 8,
                expectedArrivalAt: expect.any(String),
              }),
            ],
          }),
        ],
      }));
    });
  });

  test('does not propagate dirty lead-time uncertainty from supplier tasks', async () => {
    renderDrawer({ ...ticketTask, leadTimeStdDays: Number.POSITIVE_INFINITY }, 'eta_changed');

    fireEvent.click(await screen.findByRole('button', { name: 'Save and refresh' }));

    await waitFor(() => {
      expect(inventoryHook().ingestSenaObservation).toHaveBeenCalledWith(expect.objectContaining({
        leadTimeHints: [
          expect.objectContaining({
            skuId: 'sku-3',
            typicalDays: expect.any(Number),
            lowDays: expect.any(Number),
            highDays: expect.any(Number),
          }),
        ],
      }));
    });
    const payload = inventoryHook().ingestSenaObservation.mock.calls[0]?.[0] as { leadTimeHints?: Array<Record<string, unknown>> };
    expect(JSON.stringify(payload.leadTimeHints)).not.toMatch(/Infinity|NaN|null/);
  });

  test('marks goods received with existing ticket line quantities', async () => {
    renderDrawer({ ...ticketTask, defaultDrawerMode: 'goods_received' }, 'goods_received');

    expect(await screen.findByRole('link', { name: 'Edit in Capture' })).toHaveAttribute(
      'href',
      '/work/capture/supplier-receipt?ticketMode=edit&ticketId=supplier-ticket-1&skus=sku-3&flashTargets=supplier-receipt%3Asku-3',
    );

    fireEvent.click(await screen.findByRole('button', { name: 'Confirm inventory update' }));

    await waitFor(() => {
      expect(inventoryHook().ingestSenaObservation).toHaveBeenCalledWith(expect.objectContaining({
        orderSignals: [
          expect.objectContaining({
            approximateReceiptQuantity: 8,
            receiptArrived: true,
            skuId: 'sku-3',
          }),
        ],
        ticketEvents: [
          expect.objectContaining({
            eventType: 'fully_received',
            lifecycle: 'resolved',
            lines: [
              expect.objectContaining({
                entityId: 'sku-3',
                receivedQuantity: 8,
              }),
            ],
          }),
        ],
      }));
    });
  });
});
