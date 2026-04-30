import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from 'react';
import { createContext, useContext, useState } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { getTranslation } from '@/lib/translations';
import { OverviewTaskDrawer } from './task-drawer';
import type { OverviewSkuTask } from './view-model';

const inventoryHook = vi.fn();

const sheetContext = createContext<{ onOpenChange?: (open: boolean) => void } | null>(null);
const toggleGroupContext = createContext<{
  onValueChange?: (value: string) => void;
  value?: string;
} | null>(null);
const selectContext = createContext<{
  onValueChange?: (value: string) => void;
  value?: string;
} | null>(null);

vi.mock('@/state/inventory', () => ({
  useInventory: () => inventoryHook(),
}));

vi.mock('@/state/preferences', () => ({
  usePreferences: () => ({
    currency: 'USD',
    language: 'en',
    usdToKhrExchangeRate: 4000,
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
    ...props
  }: HTMLAttributes<HTMLDivElement> & { showCloseButton?: boolean }) => <div {...props}>{children}</div>,
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
  Select: ({
    children,
    onValueChange,
    value,
  }: {
    children: ReactNode;
    onValueChange?: (value: string) => void;
    value?: string;
  }) => <selectContext.Provider value={{ onValueChange, value }}>{children}</selectContext.Provider>,
  SelectTrigger: ({ children, ...props }: HTMLAttributes<HTMLButtonElement>) => (
    <button type="button" {...props}>
      {children}
    </button>
  ),
  SelectValue: ({ placeholder }: { placeholder?: string }) => <span>{placeholder ?? null}</span>,
  SelectContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  SelectItem: ({ children, value, ...props }: HTMLAttributes<HTMLDivElement> & { value: string }) => {
    const context = useContext(selectContext);
    return (
      <div
        role="option"
        aria-selected={context?.value === value}
        {...props}
        onClick={(event) => {
          props.onClick?.(event);
          context?.onValueChange?.(value);
        }}
      >
        {children}
      </div>
    );
  },
}));

const sampleTask: OverviewSkuTask = {
  id: 'task-sku-3',
  kind: 'sku',
  skuId: 'sku-3',
  skuName: 'Coke',
  state: 'ready_to_receive',
  stateLabel: 'Received today',
  statusTone: 'success',
  action: 'receive',
  actionLabel: 'Receive',
  defaultDrawerMode: 'goods_received',
  serviceImpact: 'Could restore comboo',
  whyNow: 'Receipt logged today',
  whyDetail: 'Receipt is ready to log.',
  etaLabel: 'Received today',
  etaDetail: 'Received today',
  confidenceCue: 'High confidence',
  heartbeat: ['Likely on hand 25-42', '53D cover'],
  nextSteps: ['banji will log the receipt and update stock.'],
  linkedServiceNames: ['Comboo'],
  currentStock: 36,
  costPerUnit: 3,
  productPrice: 8,
  soldAsProduct: true,
  expectedArrivalDate: '2026-04-10',
  arrivalWindowStart: '2026-04-09T00:00:00.000Z',
  arrivalWindowEnd: '2026-04-10T23:59:00.000Z',
  leadTimeMeanDays: 4,
  leadTimeStdDays: 1,
  variabilityClass: 'tight',
  suggestedOrderQuantity: 0,
  recentOrderQuantity: null,
  recentReceiptQuantity: 100,
  latestObservationAt: '2026-04-09T09:59:00.000Z',
  latestOrderAt: null,
  latestReceiptAt: '2026-04-09T09:59:00.000Z',
  hasRecentPriceSignal: false,
  regimeKey: 'normal',
  regimeLabel: 'Adjustment pattern',
  stockoutRisk: 0.05,
  reorderTriggerProbability: 0,
  reorderRecommendation: {
    recommendationIssued: false,
    recommendedUnits: 0,
    recommendedUnitsLabel: 'Keep watching',
    recommendedOrderLabel: 'Recommended range 0-0 units',
    quietLabel: 'Keep watching',
    likelyRangeLow: 0,
    likelyRangeHigh: 0,
    likelyRangeLabel: 'Recommended range 0-0 units',
    needProbability: 0,
    needProbabilityValueLabel: '0%',
    needProbabilityLabel: 'order likelihood 0%',
    optionalOrderLabel: false,
  },
  daysOfCover: 53,
};

const orderWaitingTask: OverviewSkuTask = {
  ...sampleTask,
  defaultDrawerMode: 'ordered_waiting',
  expectedArrivalDate: '2026-04-14',
  suggestedOrderQuantity: 12,
};

describe('OverviewTaskDrawer', () => {
  beforeEach(() => {
    inventoryHook.mockReturnValue({
      ingestSenaObservation: vi.fn(async (payload: unknown) => payload),
      runWorkspacePreparation: vi.fn(async (task: () => Promise<unknown>) => task()),
      triggerSenaRun: vi.fn(async () => ({ runId: 'run-2' })),
      updateSenaOrderChild: vi.fn(async (payload: unknown) => payload),
      isSaving: false,
    });
  });

  test('closes the drawer after a successful received-goods save even while refresh is still pending', async () => {
    let resolveTriggerRun: ((value: { runId: string }) => void) | null = null;
    inventoryHook.mockReturnValue({
      ingestSenaObservation: vi.fn(async (payload: unknown) => payload),
      runWorkspacePreparation: vi.fn(async (task: () => Promise<unknown>) => task()),
      triggerSenaRun: vi.fn(
        () =>
          new Promise<{ runId: string }>((resolve) => {
            resolveTriggerRun = resolve;
          }),
      ),
      updateSenaOrderChild: vi.fn(async (payload: unknown) => payload),
      isSaving: false,
    });

    function ControlledDrawerHarness() {
      const [open, setOpen] = useState(true);

      return open ? (
        <OverviewTaskDrawer
          mode="goods_received"
          open={open}
          task={sampleTask}
          onModeChange={vi.fn()}
          onOpenChange={setOpen}
        />
      ) : (
        <div>Drawer closed</div>
      );
    }

    render(<ControlledDrawerHarness />);

    fireEvent.change(await screen.findByLabelText('Received quantity'), { target: { value: '24' } });
    fireEvent.click(screen.getByRole('button', { name: 'Confirm inventory update' }));

    await waitFor(() => {
      expect(inventoryHook().ingestSenaObservation).toHaveBeenCalledTimes(1);
      expect(inventoryHook().runWorkspacePreparation).toHaveBeenCalledTimes(1);
      expect(screen.getByText('Drawer closed')).toBeInTheDocument();
    });

    resolveTriggerRun?.({ runId: 'run-2' });
  });

  test('derives variability class from a typed uncertainty value when saving an order update', async () => {
    render(
      <OverviewTaskDrawer
        open
        task={orderWaitingTask}
        onModeChange={vi.fn()}
        onOpenChange={vi.fn()}
      />,
    );

    fireEvent.change(await screen.findByLabelText('Custom uncertainty ± days'), { target: { value: '3' } });
    fireEvent.change(screen.getByLabelText('Ordered quantity'), { target: { value: '12' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save and refresh' }));

    await waitFor(() => {
      expect(inventoryHook().ingestSenaObservation).toHaveBeenCalledWith(expect.objectContaining({
        leadTimeHints: [
          expect.objectContaining({
            variabilityClass: 'very_wide',
          }),
        ],
      }));
    });
  });

  test('updates the backing order child before saving a supplier receipt task', async () => {
    const updateSenaOrderChild = vi.fn(async (payload: unknown) => payload);
    const ingestSenaObservation = vi.fn(async (payload: unknown) => payload);
    inventoryHook.mockReturnValue({
      ingestSenaObservation,
      runWorkspacePreparation: vi.fn(async (task: () => Promise<unknown>) => task()),
      triggerSenaRun: vi.fn(async () => ({ runId: 'run-2' })),
      updateSenaOrderChild,
      isSaving: false,
    });

    render(
      <OverviewTaskDrawer
        mode="goods_received"
        open
        task={{ ...sampleTask, batchOrderId: 'batch-1', childOrderId: 'child-1' }}
        onModeChange={vi.fn()}
        onOpenChange={vi.fn()}
      />,
    );

    fireEvent.change(await screen.findByLabelText('Received quantity'), { target: { value: '24' } });
    fireEvent.click(screen.getByRole('button', { name: 'Confirm inventory update' }));

    await waitFor(() => {
      expect(updateSenaOrderChild).toHaveBeenCalledWith(expect.objectContaining({
        childOrderId: 'child-1',
        overrides: expect.objectContaining({
          receivedQuantity: 24,
        }),
        status: 'received',
      }));
      expect(ingestSenaObservation).toHaveBeenCalledTimes(1);
    });
    expect(updateSenaOrderChild.mock.invocationCallOrder[0]).toBeLessThan(
      ingestSenaObservation.mock.invocationCallOrder[0],
    );
  });

  test('derives uncertainty days from the selected variability class when saving an order update', async () => {
    render(
      <OverviewTaskDrawer
        open
        task={orderWaitingTask}
        onModeChange={vi.fn()}
        onOpenChange={vi.fn()}
      />,
    );

    fireEvent.click(await screen.findByRole('option', { name: /Wide/ }));
    fireEvent.change(screen.getByLabelText('Ordered quantity'), { target: { value: '12' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save and refresh' }));

    await waitFor(() => {
      expect(inventoryHook().ingestSenaObservation).toHaveBeenCalledWith(expect.objectContaining({
        leadTimeHints: [
          expect.objectContaining({
            highDays: 7.3,
            lowDays: 2.7,
            variabilityClass: 'wide',
          }),
        ],
      }));
    });
  });
});
