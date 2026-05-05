import { type PointerEvent as ReactPointerEvent, type ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import type { SenaLeadTimeVariabilityClass, SenaRecordUpdateContext, SenaTicketEvent, SenaTicketEventType, SenaTicketStage, SenaTicketSummary } from '@shared/sena';
import {
  deriveLeadTimeFromStdDays,
  deriveLeadTimeFromVariabilityClass,
} from '@shared/sena-lead-time';
import {
  ActionCloseIcon,
  ActionConfirmIcon,
  ActionReceiveInventoryIcon,
  ActionSaveIcon,
} from '@icons/actions';
import { overviewDrawerBandIcons } from '@icons/domain';
import { ItemAvatar } from '@/components/system/item-identity';
import {
  derivedStdDaysDraft,
  LeadTimeVariabilityField,
  type LeadTimeVariabilityDraftMode,
} from '@/components/system/lead-time-variability-field';
import { MeasuredTileGrid } from '@/components/system/measured-tile-grid';
import { SaveErrorFlash } from '@/components/system/save-error-flash';
import { SupplierBadge } from '@/components/system/supplier';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { CurrencyNumberInput } from '@/components/ui/currency-number-input';
import { Input } from '@/components/ui/input';
import { NumberStepperInput } from '@/components/ui/number-stepper-input';
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Textarea } from '@/components/ui/textarea';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { useDiscardChangesConfirm } from '@/hooks/use-route-leave-confirm';
import { formatEditableMoneyFromUsd, reformatMoneyDraftValue, usdMoneyFromDisplay } from '@/lib/format';
import { rowHoverClassName } from '@/lib/interactive-surface';
import { translateUiLiteral } from '@/lib/translations';
import { statusPillClassName } from '@/lib/state-tones';
import { makeTicketId } from '@/lib/ticketing';
import { cn } from '@/lib/utils';
import {
  ActionSheetField,
  actionSheetInputClassName,
  actionSheetSelectTriggerClassName,
  actionSheetTextareaClassName,
} from '@/routes/detail-action-sheet';
import { createEmptyObservationInput, hasStructuredObservationSignal } from '@/routes/observation-payload';
import { useInventory } from '@/state/inventory';
import { usePreferences } from '@/state/preferences';
import type { TranslationKey, TranslationVariables } from '@/lib/translations';
import type { OverviewDrawerBandId, OverviewSkuTask, OverviewTaskDrawerMode } from './view-model';

type DrawerTranslate = (key: TranslationKey, variables?: TranslationVariables) => string;

function initialObservedAt(value: string | null) {
  if (value) {
    return new Date(value).toISOString().slice(0, 16);
  }
  return new Date().toISOString().slice(0, 16);
}

function initialExpectedArrivalDate(value: string | null) {
  if (value) {
    return new Date(value).toISOString().slice(0, 10);
  }
  const nextWeek = new Date();
  nextWeek.setDate(nextWeek.getDate() + 7);
  return nextWeek.toISOString().slice(0, 10);
}

function daysBetween(start: string, endDate: string) {
  const startTime = new Date(start).getTime();
  const endTime = new Date(`${endDate}T12:00:00`).getTime();
  if (Number.isNaN(startTime) || Number.isNaN(endTime)) {
    return null;
  }
  return Math.max(0, Math.round((endTime - startTime) / 86_400_000));
}

function leadTimeHintFromTaskInputs({
  observedAt,
  skuId,
  uncertaintyDays,
  useLeadTimeEstimate,
  variabilityClass,
  expectedArrivalDate,
}: {
  observedAt: string;
  skuId: string;
  uncertaintyDays: string;
  useLeadTimeEstimate: boolean;
  variabilityClass: SenaLeadTimeVariabilityClass | '';
  expectedArrivalDate: string;
}) {
  if (!useLeadTimeEstimate) {
    return [];
  }

  const typicalDays = daysBetween(observedAt, expectedArrivalDate);
  if (typicalDays == null) {
    return [];
  }

  const uncertainty = uncertaintyDays ? Number(uncertaintyDays) : 0;
  const derivedLeadTime = uncertaintyDays.trim()
    ? deriveLeadTimeFromStdDays(typicalDays, uncertainty)
    : deriveLeadTimeFromVariabilityClass(typicalDays, variabilityClass || null);

  return [
    {
      skuId,
      typicalDays,
      lowDays: derivedLeadTime.lowDays,
      highDays: derivedLeadTime.highDays,
      variabilityClass: derivedLeadTime.variabilityClass,
    },
  ];
}

function supplierTicketEventFromDrawer({
  eventType,
  expectedArrivalDate,
  lifecycle,
  mode,
  note,
  observedAt,
  quantity,
  receivedCost,
  skuId,
  supplierName,
  ticketId,
  revision,
}: {
  eventType: SenaTicketEventType;
  expectedArrivalDate: string;
  lifecycle: SenaTicketEvent['lifecycle'];
  mode: OverviewTaskDrawerMode;
  note: string | null;
  observedAt: string;
  quantity: number | null;
  receivedCost: number | null;
  skuId: string;
  supplierName: string | null;
  ticketId: string;
  revision: number;
}): SenaTicketEvent {
  const stage: SenaTicketStage =
    mode === 'goods_received'
      ? 'received'
      : 'ordered_waiting';
  return {
    ticketId,
    ticketFamily: 'supplier',
    lifecycle,
    stage,
    revision,
    eventType,
    occurredAt: observedAt,
    nextTouchAt: mode === 'goods_received' ? null : dateInputToIsoDate(expectedArrivalDate),
    party: {
      role: 'supplier',
      supplierName,
    },
    lines: [{
      entityType: 'sku',
      entityId: skuId,
      orderedQuantity: mode === 'goods_received' ? null : quantity,
      receivedQuantity: mode === 'goods_received' ? quantity : null,
      expectedArrivalAt: mode === 'goods_received' ? null : dateInputToIsoDate(expectedArrivalDate),
      unitCost: receivedCost,
      note,
    }],
    note,
  };
}

function dateKey(value: string | null | undefined) {
  if (!value) {
    return null;
  }
  const time = new Date(value).getTime();
  if (Number.isNaN(time)) {
    return value.slice(0, 10) || null;
  }
  return new Date(time).toISOString().slice(0, 10);
}

function supplierTicketMatchesDrawerContext(ticket: SenaTicketSummary, task: OverviewSkuTask) {
  if (!ticket.lines.some((line) => line.entityType === 'sku' && line.entityId === task.skuId)) {
    return false;
  }
  if (task.supplierName && ticket.party?.supplierName && ticket.party.supplierName !== task.supplierName) {
    return false;
  }

  const taskExpectedDate = dateKey(task.expectedArrivalDate);
  if (!taskExpectedDate) {
    return true;
  }

  return ticket.lines.some((line) => dateKey(line.expectedArrivalAt) === taskExpectedDate)
    || dateKey(ticket.nextTouchAt) === taskExpectedDate;
}

function supplierTicketIdentityForDrawer({
  eventType,
  observedAt,
  recordUpdateContext,
  task,
}: {
  eventType: SenaTicketEventType;
  observedAt: string;
  recordUpdateContext: SenaRecordUpdateContext | null | undefined;
  task: OverviewSkuTask;
}) {
  if (task.supplierTicketId) {
    const latestTicket = recordUpdateContext?.latestTicketsById[task.supplierTicketId]?.value;
    return {
      ticketId: task.supplierTicketId,
      revision: (latestTicket?.revision ?? 0) + 1,
    };
  }

  const existingTicket = recordUpdateContext?.openTicketsByFamily.supplier.find((ticket) =>
    supplierTicketMatchesDrawerContext(ticket, task),
  ) ?? null;
  if (existingTicket) {
    const latestRevision = recordUpdateContext?.latestTicketsById[existingTicket.ticketId]?.value.revision ?? existingTicket.revision;
    return {
      ticketId: existingTicket.ticketId,
      revision: latestRevision + 1,
    };
  }

  return {
    ticketId: makeTicketId({
      eventType,
      family: 'supplier',
      lines: [{ entityType: 'sku', entityId: task.skuId }],
      observedAt,
    }),
    revision: 1,
  };
}

function dateInputToIsoDate(value: string) {
  if (!value) {
    return null;
  }
  const time = new Date(`${value}T12:00:00`).getTime();
  return Number.isNaN(time) ? null : new Date(time).toISOString();
}

function useControllableDrawerMode(
  controlledMode: OverviewTaskDrawerMode | null | undefined,
  onModeChange: ((mode: OverviewTaskDrawerMode) => void) | undefined,
) {
  const [uncontrolledMode, setUncontrolledMode] = useState<OverviewTaskDrawerMode>('not_ordered');
  const isControlled = controlledMode !== undefined;
  const mode = isControlled ? controlledMode ?? 'not_ordered' : uncontrolledMode;

  const setMode = useCallback((nextMode: OverviewTaskDrawerMode) => {
    if (!isControlled) {
      setUncontrolledMode(nextMode);
    }
    onModeChange?.(nextMode);
  }, [isControlled, onModeChange]);

  return [mode, setMode] as const;
}

function drawerModeOptions(
  t: DrawerTranslate,
) {
  return [
    {
      value: 'not_ordered' as const,
      title: t('overviewDrawerModeNotOrderedTitle'),
      description: t('overviewDrawerModeNotOrderedDescription'),
    },
    {
      value: 'ordered_waiting' as const,
      title: t('overviewDrawerModeOrderedWaitingTitle'),
      description: t('overviewDrawerModeOrderedWaitingDescription'),
    },
    {
      value: 'eta_changed' as const,
      title: t('overviewDrawerModeEtaChangedTitle'),
      description: t('overviewDrawerModeEtaChangedDescription'),
    },
    {
      value: 'goods_received' as const,
      title: t('overviewDrawerModeGoodsReceivedTitle'),
      description: t('overviewDrawerModeGoodsReceivedDescription'),
    },
  ];
}

const DRAWER_MIN_WIDTH = 640;
const DRAWER_MAX_WIDTH = 1040;
const DRAWER_DEFAULT_WIDTH = 672;
const DRAWER_VIEWPORT_GUTTER = 16;

function clampDrawerWidth(nextWidth: number) {
  if (typeof window === 'undefined') {
    return Math.min(DRAWER_MAX_WIDTH, Math.max(DRAWER_MIN_WIDTH, nextWidth));
  }

  const viewportMaxWidth = Math.max(360, window.innerWidth - DRAWER_VIEWPORT_GUTTER);
  return Math.max(
    Math.min(DRAWER_MIN_WIDTH, viewportMaxWidth),
    Math.min(Math.max(nextWidth, DRAWER_MIN_WIDTH), Math.min(DRAWER_MAX_WIDTH, viewportMaxWidth)),
  );
}

function drawerCanvasClassName() {
  return 'rounded-[1.8rem] border border-border/70 bg-white/84 px-6 py-6 shadow-[0_1px_0_rgba(255,255,255,0.9)]';
}

function drawerBandClassName() {
  return 'border-t border-border/50 py-5';
}

function drawerModeLabel(
  t: DrawerTranslate,
  mode: OverviewTaskDrawerMode,
) {
  return drawerModeOptions(t).find((option) => option.value === mode)?.title ?? t('overviewTaskActionReview');
}

function drawerModeSummary(
  t: DrawerTranslate,
  mode: OverviewTaskDrawerMode,
) {
  switch (mode) {
    case 'goods_received':
      return t('overviewDrawerModeSummaryGoodsReceived');
    case 'ordered_waiting':
      return t('overviewDrawerModeSummaryOrderedWaiting');
    case 'eta_changed':
      return t('overviewDrawerModeSummaryEtaChanged');
    case 'not_ordered':
      return t('overviewDrawerModeSummaryNotOrdered');
  }
}

function DrawerBand({
  bandId,
  children,
  className,
  title,
}: {
  bandId: OverviewDrawerBandId;
  children: ReactNode;
  className?: string;
  title: string;
}) {
  const Icon = overviewDrawerBandIcons[bandId];

  return (
    <section className={cn(drawerBandClassName(), className)} data-band-id={bandId}>
      <div className="mb-3 flex items-center gap-2.5">
        <Icon className="size-4 text-primary" />
        <p className="text-[0.72rem] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          {title}
        </p>
      </div>
      {children}
    </section>
  );
}

function DrawerBandField({
  children,
  description,
  error,
  label,
  showLabel = true,
}: {
  children: ReactNode;
  description?: ReactNode;
  error?: string | null;
  label: string;
  showLabel?: boolean;
}) {
  if (!showLabel) {
    return children;
  }

  return (
    <ActionSheetField description={description} error={error} label={label}>
      {children}
    </ActionSheetField>
  );
}

function DrawerModeTile({
  description,
  measure = false,
  selected,
  title,
}: {
  description: string;
  measure?: boolean;
  selected: boolean;
  title: string;
}) {
  return (
    <div
      data-mode-measure={measure ? 'true' : undefined}
      className={cn(
        'flex min-h-[4.15rem] items-start gap-3 rounded-[1.15rem] border px-4 py-3 text-left transition-all',
        measure ? 'w-max max-w-none min-w-[15rem]' : 'w-full min-w-0',
        selected
          ? 'border-primary/35 bg-transparent text-foreground shadow-none'
          : cn('border-border/70 bg-transparent text-foreground/95 shadow-none hover:shadow-none', rowHoverClassName),
      )}
    >
      <div
        aria-hidden="true"
        className={cn(
          'mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-[6px] border transition-[border-color,background-color,box-shadow]',
          selected
            ? 'border-primary bg-primary text-primary-foreground'
            : 'border-muted-foreground/45 bg-card text-transparent',
        )}
      >
        <ActionConfirmIcon className="size-3.5" />
      </div>
      <div className="min-w-0">
        <span className="block text-[0.92rem] font-semibold leading-5 tracking-[-0.02em]">{title}</span>
        <span className="mt-1 block text-[0.73rem] leading-4.5 text-muted-foreground">{description}</span>
      </div>
    </div>
  );
}

function RecommendedOrderPanel({
  task,
  t,
}: {
  task: OverviewSkuTask;
  t: DrawerTranslate;
}) {
  const recommendation = task.reorderRecommendation;

  return (
    <div className="mt-5 rounded-[1.35rem] border border-border/65 bg-background/75 px-4 py-4 shadow-[0_1px_0_rgba(255,255,255,0.85)]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            {t('overviewDrawerRecommendedOrderTitle')}
          </p>
          <p className="mt-2 text-2xl font-semibold tracking-[-0.04em] text-foreground">
            {recommendation.recommendationIssued || recommendation.optionalOrderLabel
              ? recommendation.recommendedUnitsLabel
              : recommendation.quietLabel}
          </p>
        </div>
        {recommendation.recommendationIssued ? (
          <span className="rounded-full border border-primary/25 bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
            {t('overviewDrawerRecommendedOrderLikely', { value: recommendation.needProbabilityValueLabel })}
          </span>
        ) : null}
      </div>
      <div className="mt-3 grid gap-1 text-sm leading-6 text-muted-foreground">
        <p>{recommendation.likelyRangeLabel}</p>
        {recommendation.recommendationIssued ? <p>{recommendation.needProbabilityLabel}</p> : null}
        <p>{t('overviewDrawerRecommendedOrderBasis')}</p>
      </div>
    </div>
  );
}

function finalizeSuccessfulDrawerSave({
  close,
  prepareWorkspace,
}: {
  close: () => void;
  prepareWorkspace: () => Promise<unknown>;
}) {
  close();
  void prepareWorkspace().catch((error) => {
    console.error('Failed to refresh overview after saving task drawer update.', error);
  });
}

export function OverviewTaskDrawer({
  open,
  mode: controlledMode,
  onModeChange,
  task,
  onOpenChange,
}: {
  open: boolean;
  mode?: OverviewTaskDrawerMode | null;
  onModeChange?: (mode: OverviewTaskDrawerMode) => void;
  task: OverviewSkuTask | null;
  onOpenChange: (open: boolean) => void;
}) {
  const { ingestSenaObservation, isSaving, recordUpdateContext, runWorkspacePreparation, triggerSenaRun, updateSenaOrderChild } = useInventory();
  const { currency, language, t, usdToKhrExchangeRate } = usePreferences();
  const [mode, setMode] = useControllableDrawerMode(controlledMode, onModeChange);
  const [observedAt, setObservedAt] = useState(initialObservedAt(null));
  const [notes, setNotes] = useState('');
  const [orderedQuantity, setOrderedQuantity] = useState('');
  const [expectedArrivalDate, setExpectedArrivalDate] = useState(initialExpectedArrivalDate(null));
  const [uncertaintyDays, setUncertaintyDays] = useState('');
  const [variabilityClass, setVariabilityClass] = useState<SenaLeadTimeVariabilityClass | ''>('');
  const [leadTimeDraftMode, setLeadTimeDraftMode] = useState<LeadTimeVariabilityDraftMode>('std');
  const [useLeadTimeEstimate, setUseLeadTimeEstimate] = useState(true);
  const [receivedQuantity, setReceivedQuantity] = useState('');
  const [receivedCost, setReceivedCost] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saveErrorFlashKey, setSaveErrorFlashKey] = useState(0);
  const [drawerWidth, setDrawerWidth] = useState(() => clampDrawerWidth(DRAWER_DEFAULT_WIDTH));
  const [dismissedAfterSave, setDismissedAfterSave] = useState(false);
  const [showDetailBody, setShowDetailBody] = useState(false);
  const [initializedTaskId, setInitializedTaskId] = useState<string | null>(null);
  const [hasUserEditedDraft, setHasUserEditedDraft] = useState(false);
  const previousMoneyPreferencesRef = useRef({ currency, usdToKhrExchangeRate });
  const modeInteractionRef = useRef(false);
  const markDraftEdited = useCallback(() => setHasUserEditedDraft(true), []);

  useEffect(() => {
    if (!task) {
      setShowDetailBody(false);
      setInitializedTaskId(null);
      setHasUserEditedDraft(false);
      return;
    }
    setInitializedTaskId(null);
    setHasUserEditedDraft(false);
    const frameId = window.requestAnimationFrame(() => {
      setShowDetailBody(true);
    });
    setMode(task.defaultDrawerMode);
    setObservedAt(initialObservedAt(task.defaultDrawerMode === 'goods_received' ? null : task.latestObservationAt));
    setNotes('');
    setOrderedQuantity(task.recentOrderQuantity != null ? String(Math.round(task.recentOrderQuantity)) : String(task.suggestedOrderQuantity || ''));
    setExpectedArrivalDate(initialExpectedArrivalDate(task.expectedArrivalDate));
    setUncertaintyDays(task.leadTimeStdDays != null ? String(Math.max(1, Math.round(task.leadTimeStdDays))) : '2');
    setVariabilityClass(task.variabilityClass ?? '');
    setLeadTimeDraftMode('std');
    setUseLeadTimeEstimate(true);
    setReceivedQuantity(task.recentReceiptQuantity != null ? String(Math.round(task.recentReceiptQuantity)) : '');
    setReceivedCost(task.costPerUnit ? formatEditableMoneyFromUsd(task.costPerUnit, currency, usdToKhrExchangeRate) : '');
    setError(null);
    setSaveErrorFlashKey(0);
    setInitializedTaskId(task.id);
    return () => window.cancelAnimationFrame(frameId);
  }, [task?.id]);

  useEffect(() => {
    setDismissedAfterSave(false);
  }, [task?.id]);

  useEffect(() => {
    const previous = previousMoneyPreferencesRef.current;
    if (previous.currency === currency && previous.usdToKhrExchangeRate === usdToKhrExchangeRate) {
      return;
    }

    setReceivedCost((current) =>
      reformatMoneyDraftValue({
        value: current,
        previousCurrency: previous.currency,
        previousUsdToKhrExchangeRate: previous.usdToKhrExchangeRate,
        nextCurrency: currency,
        nextUsdToKhrExchangeRate: usdToKhrExchangeRate,
      }),
    );
    previousMoneyPreferencesRef.current = { currency, usdToKhrExchangeRate };
  }, [currency, usdToKhrExchangeRate]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const handleResize = () => setDrawerWidth((currentWidth) => clampDrawerWidth(currentWidth));

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    if (!useLeadTimeEstimate) {
      return;
    }

    const typicalDays = daysBetween(observedAt, expectedArrivalDate);
    if (typicalDays == null) {
      return;
    }

    if (leadTimeDraftMode === 'class') {
      setUncertaintyDays(
        (() => {
          const stdDays = deriveLeadTimeFromVariabilityClass(typicalDays, variabilityClass || null).stdDays;
          return stdDays == null ? '' : String(stdDays);
        })(),
      );
      return;
    }

    const nextVariabilityClass = deriveLeadTimeFromStdDays(
      typicalDays,
      uncertaintyDays.trim() ? Number(uncertaintyDays) : null,
    ).variabilityClass;
    setVariabilityClass(nextVariabilityClass ?? '');
  }, [expectedArrivalDate, leadTimeDraftMode, observedAt, uncertaintyDays, useLeadTimeEstimate, variabilityClass]);

  function drawerDraftSnapshot() {
    const baseSnapshot = {
      mode,
      observedAt,
      notes,
    };

    if (mode === 'ordered_waiting' || mode === 'eta_changed') {
      return {
        ...baseSnapshot,
        orderedQuantity,
        expectedArrivalDate,
        uncertaintyDays,
        variabilityClass,
        useLeadTimeEstimate,
      };
    }

    if (mode === 'goods_received') {
      return {
        ...baseSnapshot,
        receivedQuantity,
        receivedCost,
      };
    }

    return baseSnapshot;
  }

  function drawerBaselineSnapshot(nextTask: OverviewSkuTask) {
    const nextMode = nextTask.defaultDrawerMode;
    const baseSnapshot = {
      mode: nextMode,
      observedAt: initialObservedAt(nextMode === 'goods_received' ? null : nextTask.latestObservationAt),
      notes: '',
    };

    if (nextMode === 'ordered_waiting' || nextMode === 'eta_changed') {
      return {
        ...baseSnapshot,
        orderedQuantity:
          nextTask.recentOrderQuantity != null
            ? String(Math.round(nextTask.recentOrderQuantity))
            : String(nextTask.suggestedOrderQuantity || ''),
        expectedArrivalDate: initialExpectedArrivalDate(nextTask.expectedArrivalDate),
        uncertaintyDays: nextTask.leadTimeStdDays != null ? String(Math.max(1, Math.round(nextTask.leadTimeStdDays))) : '2',
        variabilityClass: nextTask.variabilityClass ?? '',
        useLeadTimeEstimate: true,
      };
    }

    if (nextMode === 'goods_received') {
      return {
        ...baseSnapshot,
        receivedQuantity: nextTask.recentReceiptQuantity != null ? String(Math.round(nextTask.recentReceiptQuantity)) : '',
        receivedCost: nextTask.costPerUnit ? formatEditableMoneyFromUsd(nextTask.costPerUnit, currency, usdToKhrExchangeRate) : '',
      };
    }

    return baseSnapshot;
  }

  const hasUnsavedDrawerChanges =
    open
    && task != null
    && initializedTaskId === task.id
    && hasUserEditedDraft
    && JSON.stringify(drawerDraftSnapshot()) !== JSON.stringify(drawerBaselineSnapshot(task));
  const { discardConfirmDialog, requestDiscard } = useDiscardChangesConfirm({
    enabled: hasUnsavedDrawerChanges,
    description: t('taskDrawerUnsavedLeavePrompt'),
    onDiscard: () => setError(null),
    onSave: async (continueAfterSave) => {
      const saved = await submit();
      if (saved) {
        continueAfterSave();
      }
      return saved;
    },
  });

  function handleOpenChange(nextOpen: boolean) {
    if (nextOpen) {
      onOpenChange(true);
      return;
    }
    requestDiscard(() => onOpenChange(false));
  }

  if (!task) {
    return null;
  }

  const activeTask = task;
  const baselineSnapshot = {
    skuId: activeTask.skuId,
    unitsInStock: Math.max(0, Math.round(activeTask.currentStock)),
    costPerUnit: activeTask.costPerUnit,
    productPrice: activeTask.productPrice,
  };

  async function submit() {
    setError(null);
    if (
      (mode === 'ordered_waiting' && !orderedQuantity) ||
      ((mode === 'ordered_waiting' || mode === 'eta_changed') && !expectedArrivalDate) ||
      (mode === 'goods_received' && (!receivedQuantity || Number(receivedQuantity) <= 0))
    ) {
      return false;
    }
    const observedAtIso = new Date(observedAt).toISOString();
    const senaPayload = createEmptyObservationInput({
      observedAt: observedAtIso,
      notes: notes.trim() || null,
    });
    if (mode === 'ordered_waiting' || mode === 'eta_changed') {
      const quantity = orderedQuantity ? Number(orderedQuantity) : (activeTask.recentOrderQuantity ?? (activeTask.suggestedOrderQuantity || null));
      const eventType: SenaTicketEventType =
        mode === 'eta_changed'
          ? 'eta_updated'
          : activeTask.childOrderId
            ? 'revised'
            : 'created';
      const ticketIdentity = supplierTicketIdentityForDrawer({
        eventType,
        observedAt: observedAtIso,
        recordUpdateContext,
        task: activeTask,
      });
      senaPayload.orderSignals = [
        {
          skuId: activeTask.skuId,
          orderPlaced: true,
          receiptArrived: false,
          approximateOrderQuantity: quantity,
          approximateReceiptQuantity: null,
        },
      ];
      senaPayload.ticketEvents = [
        supplierTicketEventFromDrawer({
          eventType,
          expectedArrivalDate,
          lifecycle: 'open',
          mode,
          note: notes.trim() || null,
          observedAt: observedAtIso,
          quantity,
          receivedCost: null,
          skuId: activeTask.skuId,
          supplierName: activeTask.supplierName,
          ...ticketIdentity,
        }),
      ];
      senaPayload.leadTimeHints = leadTimeHintFromTaskInputs({
        observedAt,
        skuId: activeTask.skuId,
        uncertaintyDays,
        useLeadTimeEstimate,
        variabilityClass,
        expectedArrivalDate,
      });
    }

    if (mode === 'goods_received') {
      const receivedUnits = Number(receivedQuantity);
      const updatedUnitsInStock = Math.max(0, Math.round(activeTask.currentStock) + receivedUnits);
      const nextCost = receivedCost
        ? usdMoneyFromDisplay(Number(receivedCost), currency, usdToKhrExchangeRate)
        : activeTask.costPerUnit;
      const ticketIdentity = supplierTicketIdentityForDrawer({
        eventType: 'fully_received',
        observedAt: observedAtIso,
        recordUpdateContext,
        task: activeTask,
      });
      senaPayload.stockSnapshot = [
        {
          ...baselineSnapshot,
          unitsInStock: updatedUnitsInStock,
          costPerUnit: nextCost,
        },
      ];
      senaPayload.orderSignals = [
        {
          skuId: activeTask.skuId,
          orderPlaced: false,
          receiptArrived: true,
          approximateOrderQuantity: null,
          approximateReceiptQuantity: receivedUnits,
        },
      ];
      senaPayload.ticketEvents = [
        supplierTicketEventFromDrawer({
          eventType: 'fully_received',
          expectedArrivalDate: '',
          lifecycle: 'resolved',
          mode,
          note: notes.trim() || null,
          observedAt: observedAtIso,
          quantity: receivedUnits,
          receivedCost: nextCost,
          skuId: activeTask.skuId,
          supplierName: activeTask.supplierName,
          ...ticketIdentity,
        }),
      ];
    }

    try {
      if (!hasStructuredObservationSignal(senaPayload)) {
        onOpenChange(false);
        return true;
      }
      if (activeTask.childOrderId && (mode === 'ordered_waiting' || mode === 'eta_changed')) {
        const quantity = orderedQuantity ? Number(orderedQuantity) : (activeTask.recentOrderQuantity ?? (activeTask.suggestedOrderQuantity || null));
        await updateSenaOrderChild({
          childOrderId: activeTask.childOrderId,
          appendSupplierNote: notes.trim() || null,
          overrides: {
            expectedArrivalAt: dateInputToIsoDate(expectedArrivalDate),
            orderedQuantity: quantity,
            placementTimestamp: observedAtIso,
          },
          status: mode === 'eta_changed' ? 'follow_up' : 'awaiting_receipt',
        });
      }
      if (activeTask.childOrderId && mode === 'goods_received') {
        const receivedUnits = Number(receivedQuantity);
        const nextCost = receivedCost
          ? usdMoneyFromDisplay(Number(receivedCost), currency, usdToKhrExchangeRate)
          : activeTask.costPerUnit;
        await updateSenaOrderChild({
          childOrderId: activeTask.childOrderId,
          appendSupplierNote: notes.trim() || null,
          overrides: {
            costPerUnit: nextCost,
            receivedQuantity: receivedUnits,
            receiptTimestamp: observedAtIso,
          },
          status: 'received',
        });
      }
      await ingestSenaObservation(senaPayload);
      finalizeSuccessfulDrawerSave({
        close: () => {
          setDismissedAfterSave(true);
          onOpenChange(false);
        },
        prepareWorkspace: () =>
          runWorkspacePreparation(() => triggerSenaRun({ algorithmVersion: 'sena-analysis-v3' })),
      });
      return true;
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : t('overviewDrawerSaveFailed'));
      setSaveErrorFlashKey((current) => current + 1);
      return false;
    }
  }

  const receiptPreviewQuantity = receivedQuantity ? Number(receivedQuantity) : 0;
  const receiptPreviewNextStock = Math.max(0, Math.round(task.currentStock) + receiptPreviewQuantity);
  const submitLabel =
    mode === 'goods_received'
      ? t('overviewDrawerSubmitGoodsReceived')
      : mode === 'not_ordered'
        ? t('overviewDrawerSubmitNotOrdered')
        : t('overviewDrawerSubmitDefault');
  const RealLifeIcon = overviewDrawerBandIcons.real_life;
  const submitDisabled =
    isSaving ||
    (mode === 'ordered_waiting' && !orderedQuantity) ||
    ((mode === 'ordered_waiting' || mode === 'eta_changed') && !expectedArrivalDate) ||
    (mode === 'goods_received' && (!receivedQuantity || Number(receivedQuantity) <= 0));

  function startDrawerResize(event: ReactPointerEvent<HTMLDivElement>) {
    if (typeof window === 'undefined') {
      return;
    }

    event.preventDefault();

    const pointerId = event.pointerId;
    const startX = event.clientX;
    const startWidth = drawerWidth;
    const previousCursor = document.body.style.cursor;
    const previousUserSelect = document.body.style.userSelect;

    document.body.style.cursor = 'ew-resize';
    document.body.style.userSelect = 'none';

    const handlePointerMove = (moveEvent: PointerEvent) => {
      const delta = startX - moveEvent.clientX;
      setDrawerWidth(clampDrawerWidth(startWidth + delta));
    };

    const stopResize = () => {
      document.body.style.cursor = previousCursor;
      document.body.style.userSelect = previousUserSelect;
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      window.removeEventListener('pointercancel', handlePointerUp);
    };

    const handlePointerUp = () => {
      stopResize();
    };

    event.currentTarget.setPointerCapture(pointerId);
    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    window.addEventListener('pointercancel', handlePointerUp);
  }

  return (
    <>
    <Sheet open={open && !dismissedAfterSave} onOpenChange={handleOpenChange}>
      <SheetContent
        className="w-full max-w-none gap-0 overflow-hidden border-l border-border/70 bg-[#f8f4ef] px-0 shadow-[0_28px_72px_rgba(48,31,20,0.18)]"
        showCloseButton={false}
        style={{
          width: `${drawerWidth}px`,
          maxWidth: `calc(var(--kaur-khor-effective-viewport-width, 100vw) - ${DRAWER_VIEWPORT_GUTTER}px)`,
        }}
      >
        {discardConfirmDialog}
        <div
          aria-hidden="true"
          className="absolute inset-y-0 left-0 z-30 w-5 cursor-ew-resize touch-none"
          onPointerDown={startDrawerResize}
        />

        <SheetHeader className="sticky top-0 z-20 gap-4 border-b border-border/40 bg-[#f8f4ef]/96 px-8 py-7 backdrop-blur-sm">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <div className="flex items-start gap-4">
                <ItemAvatar imagePath={task.imagePath} name={task.skuName} size="hero" type="sku" />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-3">
                    <SheetTitle className="text-[2rem] leading-tight tracking-[-0.04em]">{task.skuName}</SheetTitle>
                    <SupplierBadge supplierName={task.supplierName} />
                    <span
                      className={cn(
                        'inline-flex items-center self-center rounded-full border px-2.5 py-1 text-[0.72rem] font-medium',
                        statusPillClassName(task.statusTone),
                      )}
                    >
                      {task.stateLabel}
                    </span>
                  </div>
                </div>
              </div>
              <SheetDescription className="mt-3 max-w-2xl text-[0.98rem] leading-7">
                {task.whyNow} · {task.serviceImpact} · {task.etaLabel}
              </SheetDescription>
              <div className="mt-4 flex flex-wrap gap-2.5">
                {task.heartbeat.map((line) => (
                  <div
                    key={line}
                    className="rounded-full border border-border/65 bg-white/72 px-3.5 py-2 text-sm text-foreground shadow-[0_1px_0_rgba(255,255,255,0.95)]"
                  >
                    {line}
                  </div>
                ))}
              </div>
            </div>

            <SheetClose className="mt-1 inline-flex size-9 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-secondary/65 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50">
              <ActionCloseIcon className="size-5" />
              <span className="sr-only">{translateUiLiteral(language, 'Close')}</span>
            </SheetClose>
          </div>
        </SheetHeader>

        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="px-8 py-6 pb-44">
            <section className={drawerCanvasClassName()} data-band-id="real_life">
              <div className="flex items-center gap-2">
                <RealLifeIcon className="size-4 text-primary" />
                <h2 className="text-sm font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                  {t('overviewDrawerRealLifeTitle')}
                </h2>
              </div>

              {showDetailBody ? (
                <>
              <div className="mt-5">
                <MeasuredTileGrid
                  items={drawerModeOptions(t)}
                  maxColumns={2}
                  minColumns={2}
                  renderGrid={({ columnCount, gridRef }) => (
                    <div ref={gridRef}>
                      <ToggleGroup
                        className="grid w-full gap-3 rounded-none bg-transparent p-0"
                        spacing={2}
                        style={{
                          gridTemplateColumns: `repeat(${columnCount}, minmax(0, 1fr))`,
                        }}
                        type="single"
                        value={mode}
                        onKeyDownCapture={() => {
                          modeInteractionRef.current = true;
                        }}
                        onPointerDownCapture={() => {
                          modeInteractionRef.current = true;
                        }}
                        onValueChange={(nextValue) => {
                          if (nextValue) {
                            if (modeInteractionRef.current && nextValue !== mode) {
                              markDraftEdited();
                            }
                            modeInteractionRef.current = false;
                            setMode(nextValue as OverviewTaskDrawerMode);
                          }
                        }}
                      >
                        {drawerModeOptions(t).map((option) => (
                          <ToggleGroupItem
                            key={option.value}
                            className="h-auto rounded-none border-none bg-transparent p-0 text-left shadow-none hover:bg-transparent data-[state=on]:bg-transparent data-[state=on]:shadow-none"
                            disableHoverSurface
                            disableSelectedShadow
                            value={option.value}
                          >
                            <DrawerModeTile
                              description={option.description}
                              selected={mode === option.value}
                              title={option.title}
                            />
                          </ToggleGroupItem>
                        ))}
                      </ToggleGroup>
                    </div>
                  )}
                  renderMeasureItem={(option) => (
                    <DrawerModeTile
                      key={`${option.value}-measure`}
                      description={option.description}
                      measure
                      selected={mode === option.value}
                      title={option.title}
                    />
                  )}
                />
              </div>

              {mode === 'not_ordered' ? <RecommendedOrderPanel task={task} t={t} /> : null}

              <DrawerBand
                bandId="timing"
                className="mt-6"
                title={mode === 'goods_received' ? t('overviewDrawerReceiptTimingTitle') : t('overviewDrawerTimingTitle')}
              >
                <div className={cn(mode === 'goods_received' || mode === 'not_ordered' ? 'grid gap-5' : 'grid gap-5 md:grid-cols-2')}>
                  <ActionSheetField
                    description={mode === 'goods_received' ? t('overviewDrawerReceiptConfirmedDescription') : t('overviewDrawerObservedAtDescription')}
                    label={mode === 'goods_received' ? t('overviewDrawerReceivedDateTimeLabel') : t('overviewDrawerObservedAtLabel')}
                  >
                    <Input
                      aria-label={mode === 'goods_received' ? t('overviewDrawerReceivedDateTimeLabel') : t('overviewDrawerObservedAtLabel')}
                      className={actionSheetInputClassName}
                      required
                      type="datetime-local"
                      value={observedAt}
                      onChange={(event) => {
                        markDraftEdited();
                        setObservedAt(event.target.value);
                      }}
                    />
                  </ActionSheetField>

                  {(mode === 'ordered_waiting' || mode === 'eta_changed') ? (
                    <ActionSheetField
                      description={t('overviewDrawerExpectedArrivalDateDescription')}
                      label={t('overviewDrawerExpectedArrivalDateLabel')}
                    >
                      <Input
                        aria-label={t('overviewDrawerExpectedArrivalDateLabel')}
                        className={actionSheetInputClassName}
                        type="date"
                        value={expectedArrivalDate}
                        onChange={(event) => {
                          markDraftEdited();
                          setExpectedArrivalDate(event.target.value);
                        }}
                      />
                    </ActionSheetField>
                  ) : null}
                </div>
              </DrawerBand>

              {(mode === 'ordered_waiting' || mode === 'eta_changed') ? (
                <>
                  <DrawerBand bandId="order_shape" title={t('overviewDrawerOrderShapeTitle')}>
                    <div className="grid gap-5 md:grid-cols-2">
                      <ActionSheetField
                        description={
                          task.reorderRecommendation.recommendationIssued
                            ? `${task.reorderRecommendation.recommendedOrderLabel}. Edit if the supplier batch differs.`
                            : task.reorderRecommendation.optionalOrderLabel
                              ? `${task.reorderRecommendation.quietLabel}. Edit if the supplier batch differs.`
                            : t('overviewDrawerOrderedQuantityFallback')
                        }
                        label={t('overviewDrawerOrderedQuantityLabel')}
                      >
                        <NumberStepperInput
                          aria-label={t('overviewDrawerOrderedQuantityLabel')}
                          className={actionSheetInputClassName}
                          min="0"
                          step="1"
                          variant="side-buttons"
                          value={orderedQuantity}
                          onChange={(event) => {
                            markDraftEdited();
                            setOrderedQuantity(event.target.value);
                          }}
                        />
                      </ActionSheetField>
                      <ActionSheetField
                        description={t('overviewDrawerVariabilityDescription')}
                        label={t('fieldLeadTimeVariability')}
                      >
                        <LeadTimeVariabilityField
                          customInputClassName={actionSheetInputClassName}
                          customStdDays={uncertaintyDays}
                          language={language}
                          meanDays={daysBetween(observedAt, expectedArrivalDate)}
                          mode={leadTimeDraftMode}
                          numberInputVariant="side-buttons"
                          placeholder={t('overviewDrawerVariabilityPlaceholder')}
                          selectTriggerClassName={actionSheetSelectTriggerClassName}
                          value={variabilityClass}
                          onCustomStdDaysChange={(value) => {
                            markDraftEdited();
                            setLeadTimeDraftMode('std');
                            setUncertaintyDays(value);
                          }}
                          onModeChange={(value) => {
                            markDraftEdited();
                            setLeadTimeDraftMode(value);
                          }}
                          onValueChange={(value) => {
                            markDraftEdited();
                            setVariabilityClass(value);
                            if (value) {
                              setUncertaintyDays(derivedStdDaysDraft(daysBetween(observedAt, expectedArrivalDate), value));
                            }
                          }}
                        />
                      </ActionSheetField>
                    </div>
                  </DrawerBand>

                  <DrawerBand bandId="optional_learning" title={t('overviewDrawerOptionalLearningTitle')}>
                    <label className="flex items-start gap-3 rounded-[1.2rem] border border-border/70 bg-background/70 px-4 py-3 text-sm text-foreground">
                      <Checkbox
                        checked={useLeadTimeEstimate}
                        className="mt-0.5"
                        onCheckedChange={(checked) => {
                          markDraftEdited();
                          setUseLeadTimeEstimate(checked === true);
                        }}
                      />
                      <span>{t('overviewDrawerOptionalLearningDescription')}</span>
                    </label>
                  </DrawerBand>
                </>
              ) : null}

              {mode === 'goods_received' ? (
                <>
                  <DrawerBand bandId="receipt_details" title={t('overviewDrawerReceiptDetailsTitle')}>
                    <div className="grid gap-5 md:grid-cols-2">
                      <ActionSheetField
                        description={t('overviewDrawerReceivedQuantityDescription')}
                        label={t('overviewDrawerReceivedQuantityLabel')}
                      >
                        <NumberStepperInput
                          aria-label={t('overviewDrawerReceivedQuantityLabel')}
                          className={actionSheetInputClassName}
                          min="0"
                          step="1"
                          variant="side-buttons"
                          value={receivedQuantity}
                          onChange={(event) => {
                            markDraftEdited();
                            setReceivedQuantity(event.target.value);
                          }}
                        />
                      </ActionSheetField>
                      <ActionSheetField
                        description={t('overviewDrawerReceivedCostDescription')}
                        label={t('overviewDrawerReceivedCostLabel')}
                      >
                        <CurrencyNumberInput
                          aria-label={t('overviewDrawerReceivedCostLabel')}
                          className={actionSheetInputClassName}
                          currency={currency}
                          min="0"
                          variant="side-buttons"
                          value={receivedCost}
                          onChange={(event) => {
                            markDraftEdited();
                            setReceivedCost(event.target.value);
                          }}
                        />
                      </ActionSheetField>
                    </div>
                  </DrawerBand>

                  <DrawerBand bandId="preview" title={t('overviewDrawerPreviewTitle')}>
                    <div className="rounded-[1.3rem] border border-emerald-200 bg-emerald-50/85 px-4 py-4 text-sm leading-6 text-emerald-900">
                      {t('overviewDrawerPreviewDescription', {
                        quantity: receiptPreviewQuantity || 0,
                        stock: receiptPreviewNextStock,
                      })}
                    </div>
                  </DrawerBand>
                </>
              ) : null}

              <DrawerBand
                bandId="note"
                title={mode === 'ordered_waiting' || mode === 'eta_changed' ? t('overviewDrawerSupplierNoteTitle') : t('overviewDrawerNoteTitle')}
              >
                <DrawerBandField
                  description={
                    mode === 'ordered_waiting' || mode === 'eta_changed'
                      ? t('overviewDrawerSupplierNoteDescription')
                      : t('overviewDrawerNoteDescription')
                  }
                  label={mode === 'ordered_waiting' || mode === 'eta_changed' ? t('overviewDrawerSupplierNoteTitle') : t('overviewDrawerNoteTitle')}
                  showLabel={false}
                >
                  <Textarea
                    aria-label={mode === 'ordered_waiting' || mode === 'eta_changed' ? t('overviewDrawerSupplierNoteTitle') : t('overviewDrawerNoteTitle')}
                    className={cn(
                      actionSheetTextareaClassName,
                      mode === 'not_ordered' ? 'min-h-24' : '',
                      mode === 'goods_received' ? 'min-h-28' : '',
                    )}
                    value={notes}
                    onChange={(event) => {
                      markDraftEdited();
                      setNotes(event.target.value);
                    }}
                  />
                </DrawerBandField>
              </DrawerBand>

              <DrawerBand bandId="next_steps" title={t('overviewDrawerNextStepsTitle')}>
                <div className="rounded-[1.35rem] border border-border/65 bg-secondary/35 px-4 py-4">
                  <div className="grid gap-3">
                    {task.nextSteps.map((line) => (
                      <div key={line} className="flex items-start gap-3 text-sm leading-6 text-foreground">
                        <span className="mt-2 size-1.5 shrink-0 rounded-full bg-primary/70" />
                        <span>{line}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </DrawerBand>

              {error ? (
                <SaveErrorFlash as="p" className="mt-5 rounded-[1.25rem] border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive" flashKey={saveErrorFlashKey}>
                  {error}
                </SaveErrorFlash>
              ) : null}
                </>
              ) : null}
            </section>
          </div>
        </div>

        <SheetFooter className="sticky bottom-0 z-20 border-t border-border/50 bg-[#f8f4ef]/96 px-8 py-5 shadow-[0_-10px_24px_rgba(48,31,20,0.06)] backdrop-blur-sm">
          <div className="flex w-full flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0 sm:max-w-[18rem]">
              <p className="text-sm font-medium text-foreground">{t('overviewDrawerModeLabel', { value: drawerModeLabel(t, mode) })}</p>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">{drawerModeSummary(t, mode)}</p>
            </div>
            <Button
              className="w-full sm:w-auto sm:min-w-[15rem]"
              disabled={submitDisabled}
              size="lg"
              type="button"
              onClick={() => void submit()}
            >
              {mode === 'goods_received' ? <ActionReceiveInventoryIcon className="size-4" /> : <ActionSaveIcon className="size-4" />}
              {isSaving ? translateUiLiteral(language, 'Saving…') : submitLabel}
            </Button>
          </div>
        </SheetFooter>
      </SheetContent>
    </Sheet>
    </>
  );
}
