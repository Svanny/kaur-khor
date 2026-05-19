import { type PointerEvent as ReactPointerEvent, type ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import type { SenaLeadTimeVariabilityClass, SenaObservationInput, SenaRecordUpdateContext, SenaTicketEvent, SenaTicketEventType, SenaTicketStage, SenaTicketSummary } from '@shared/sena';
import { Link } from 'react-router-dom';
import {
  deriveLeadTimeFromStdDays,
  deriveLeadTimeFromVariabilityClass,
} from '@shared/sena-lead-time';
import {
  ActionCloseIcon,
  ActionClipboardClockIcon,
  ActionConfirmIcon,
  ActionDismissIcon,
  ActionOpenExternalIcon,
  ActionReceiveInventoryIcon,
  ActionSaveIcon,
  ActionWaitingIcon,
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
import { Input } from '@/components/ui/input';
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
import { rowHoverClassName } from '@/lib/interactive-surface';
import {
  calendarDaysBetweenObservedAndDateInput,
  clampDateInputToObservedDate,
  dateInputToIsoOnOrAfterObserved,
  formatLocalDateInputValue,
  formatLocalDateTimeInputValue,
  observedLocalDateInputValue,
  parseLocalDateTimeInputIso,
} from '@/lib/date-input-utils';
import { buildSupplierTicketCaptureHref } from '@/lib/record-update-routes';
import { translateUiLiteral } from '@/lib/translations';
import { statusPillClassName } from '@/lib/state-tones';
import { stockSnapshotForTicketInventoryDeltas } from '@/lib/ticket-inventory-reconciliation';
import { makeNewTicketId } from '@/lib/ticketing';
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
import type { IconComponent } from '@icons';
import { DRAFT_SUPPLIER_TICKET_ID_PREFIX, type OverviewDrawerBandId, type OverviewSupplierTicketTask, type OverviewTaskDrawerMode } from './view-model';

type DrawerTranslate = (key: TranslationKey, variables?: TranslationVariables) => string;
type OverviewTaskDrawerPresentation = 'side' | 'bottom';

function initialObservedAt(value: string | null) {
  return formatLocalDateTimeInputValue(value);
}

function initialExpectedArrivalDate(value: string | null) {
  if (value) {
    return formatLocalDateInputValue(value);
  }
  const nextWeek = new Date();
  nextWeek.setDate(nextWeek.getDate() + 7);
  return formatLocalDateInputValue(nextWeek);
}

function daysBetween(start: string, endDate: string) {
  return calendarDaysBetweenObservedAndDateInput(start, endDate);
}

function leadTimeStdDaysDraft(value: number | null | undefined) {
  return value != null && Number.isFinite(value) && value > 0
    ? String(Math.max(1, Math.round(value)))
    : '2';
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

  const uncertainty = uncertaintyDays.trim() ? Number(uncertaintyDays) : 0;
  if (!Number.isFinite(uncertainty) || uncertainty < 0) {
    return [];
  }
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
  lines,
  mode,
  note,
  observedAt,
  supplierName,
  ticketId,
  revision,
}: {
  eventType: SenaTicketEventType;
  expectedArrivalDate: string;
  lifecycle: SenaTicketEvent['lifecycle'];
  lines: SenaTicketEvent['lines'];
  mode: OverviewTaskDrawerMode;
  note: string | null;
  observedAt: string;
  supplierName: string | null;
  ticketId: string;
  revision: number;
}): SenaTicketEvent {
  const stage: SenaTicketStage =
    mode === 'goods_received'
      ? 'received'
      : mode === 'order_canceled'
        ? 'to_order'
      : 'ordered_waiting';
  return {
    ticketId,
    ticketFamily: 'supplier',
    lifecycle,
    stage,
    revision,
    eventType,
    occurredAt: observedAt,
    nextTouchAt: mode === 'goods_received' || mode === 'order_canceled' ? null : dateInputToIsoDate(expectedArrivalDate, observedAt),
    party: {
      role: 'supplier',
      supplierName,
    },
    lines,
    note,
  };
}

function supplierTicketIdentityForDrawer({
  recordUpdateContext,
  task,
  eventType,
  observedAt,
}: {
  recordUpdateContext: SenaRecordUpdateContext | null | undefined;
  task: OverviewSupplierTicketTask;
  eventType: SenaTicketEventType;
  observedAt: string;
}) {
  if (task.ticketId.startsWith(DRAFT_SUPPLIER_TICKET_ID_PREFIX)) {
    return {
      ticketId: makeNewTicketId({
        eventType,
        family: 'supplier',
        lines: task.ticket.lines.map((line) => ({
          entityId: line.entityId,
          entityType: line.entityType,
        })),
        observedAt,
      }),
      revision: 1,
    };
  }
  const latestTicket = recordUpdateContext?.latestTicketsById[task.ticketId]?.value;
  return {
    ticketId: task.ticketId,
    revision: (latestTicket?.revision ?? task.ticket.revision ?? 0) + 1,
  };
}

function supplierCaptureTicketIdForTask(task: OverviewSupplierTicketTask) {
  if (!task.ticketId.startsWith(DRAFT_SUPPLIER_TICKET_ID_PREFIX)) {
    return task.ticketId;
  }
  const childTicketIds = [
    ...new Set(
      task.childTasks
        .map((childTask) => childTask.supplierTicketId)
        .filter((ticketId): ticketId is string => Boolean(ticketId)),
    ),
  ];
  return childTicketIds.length === 1 ? childTicketIds[0]! : task.ticketId;
}

function supplierCaptureHrefForTask(task: OverviewSupplierTicketTask, mode: OverviewTaskDrawerMode) {
  const ticketId = supplierCaptureTicketIdForTask(task);
  if (mode !== 'goods_received') {
    return buildSupplierTicketCaptureHref({ mode: 'edit', ticketId });
  }

  const skuIds = task.childTasks.map((childTask) => childTask.skuId);
  return buildSupplierTicketCaptureHref({
    mode: 'edit',
    intent: 'receipt',
    ticketId,
    skuIds,
    flashTargets: skuIds.map((skuId) => ({
      action: 'supplier-receipt',
      targetId: skuId,
      targetType: 'sku',
    })),
  });
}

function ticketLinesForDrawer({
  expectedArrivalDate,
  mode,
  note,
  observedAt,
  task,
}: {
  expectedArrivalDate: string;
  mode: OverviewTaskDrawerMode;
  note: string | null;
  observedAt: string;
  task: OverviewSupplierTicketTask;
}): SenaTicketEvent['lines'] {
  const expectedArrivalAt = mode === 'goods_received' || mode === 'order_canceled' ? null : dateInputToIsoDate(expectedArrivalDate, observedAt);

  return task.ticket.lines.map((line) => {
    const orderedQuantity = line.orderedQuantity ?? null;
    const childTask = line.entityType === 'sku'
      ? task.childTasks.find((task) => task.skuId === line.entityId)
      : null;
    const receiptQuantity = line.orderedQuantity ?? line.receivedQuantity ?? childTask?.recentOrderQuantity ?? childTask?.suggestedOrderQuantity ?? null;
    return {
      ...line,
      orderedQuantity: mode === 'order_canceled' ? null : orderedQuantity,
      receivedQuantity: mode === 'goods_received' ? receiptQuantity : line.receivedQuantity ?? null,
      expectedArrivalAt,
      note,
    };
  });
}

function dateInputToIsoDate(value: string, observedAt?: string | null) {
  return dateInputToIsoOnOrAfterObserved(value, observedAt);
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
      icon: ActionDismissIcon,
      value: 'order_canceled' as const,
      title: t('overviewDrawerModeOrderCanceledTitle'),
      description: t('overviewDrawerModeOrderCanceledDescription'),
    },
    {
      icon: ActionWaitingIcon,
      value: 'ordered_waiting' as const,
      title: t('overviewDrawerModeOrderedWaitingTitle'),
      description: t('overviewDrawerModeOrderedWaitingDescription'),
    },
    {
      icon: ActionClipboardClockIcon,
      value: 'eta_changed' as const,
      title: t('overviewDrawerModeEtaChangedTitle'),
      description: t('overviewDrawerModeEtaChangedDescription'),
    },
    {
      icon: ActionReceiveInventoryIcon,
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
    case 'order_canceled':
      return t('overviewDrawerModeSummaryOrderCanceled');
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
  icon: Icon,
  measure = false,
  selected,
  title,
  wrapText = false,
}: {
  description: string;
  icon: IconComponent;
  measure?: boolean;
  selected: boolean;
  title: string;
  wrapText?: boolean;
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
        <span className="flex min-w-0 items-center gap-2 text-[0.92rem] font-semibold leading-5 tracking-[-0.02em]">
          <Icon aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
          <span className={cn('min-w-0', wrapText ? 'whitespace-normal break-words' : 'truncate')}>{title}</span>
        </span>
        <span className={cn('mt-1 block text-[0.73rem] leading-4.5 text-muted-foreground', wrapText ? 'whitespace-normal break-words' : null)}>{description}</span>
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
  onPrepareAfterSave,
  open,
  presentation = 'side',
  mode: controlledMode,
  onModeChange,
  task,
  onOpenChange,
}: {
  open: boolean;
  mode?: OverviewTaskDrawerMode | null;
  presentation?: OverviewTaskDrawerPresentation;
  onPrepareAfterSave?: () => Promise<unknown>;
  onModeChange?: (mode: OverviewTaskDrawerMode) => void;
  task: OverviewSupplierTicketTask | null;
  onOpenChange: (open: boolean) => void;
}) {
  const { catalog, ingestSenaObservation, isSaving, recordUpdateContext, runWorkspacePreparation, snapshot, triggerSenaRun } = useInventory();
  const { language, t } = usePreferences();
  const [mode, setMode] = useControllableDrawerMode(controlledMode, onModeChange);
  const [observedAt, setObservedAt] = useState(initialObservedAt(null));
  const [notes, setNotes] = useState('');
  const [expectedArrivalDate, setExpectedArrivalDate] = useState(initialExpectedArrivalDate(null));
  const [uncertaintyDays, setUncertaintyDays] = useState('');
  const [variabilityClass, setVariabilityClass] = useState<SenaLeadTimeVariabilityClass | ''>('');
  const [leadTimeDraftMode, setLeadTimeDraftMode] = useState<LeadTimeVariabilityDraftMode>('std');
  const [useLeadTimeEstimate, setUseLeadTimeEstimate] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saveErrorFlashKey, setSaveErrorFlashKey] = useState(0);
  const [drawerWidth, setDrawerWidth] = useState(() => clampDrawerWidth(DRAWER_DEFAULT_WIDTH));
  const [dismissedAfterSave, setDismissedAfterSave] = useState(false);
  const [showDetailBody, setShowDetailBody] = useState(false);
  const [initializedTaskId, setInitializedTaskId] = useState<string | null>(null);
  const [hasUserEditedDraft, setHasUserEditedDraft] = useState(false);
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
    setMode(controlledMode ?? task.defaultDrawerMode);
    const nextObservedAt = initialObservedAt(null);
    setObservedAt(nextObservedAt);
    setNotes('');
    setExpectedArrivalDate(clampDateInputToObservedDate(initialExpectedArrivalDate(task.expectedArrivalDate), nextObservedAt));
    setUncertaintyDays(leadTimeStdDaysDraft(task.leadTimeStdDays));
    setVariabilityClass(task.variabilityClass ?? '');
    setLeadTimeDraftMode('std');
    setUseLeadTimeEstimate(true);
    setError(null);
    setSaveErrorFlashKey(0);
    setInitializedTaskId(task.id);
    return () => window.cancelAnimationFrame(frameId);
  }, [task?.id]);

  useEffect(() => {
    setDismissedAfterSave(false);
  }, [task?.id]);

  useEffect(() => {
    setExpectedArrivalDate((current) => clampDateInputToObservedDate(current, observedAt));
  }, [observedAt]);

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
        expectedArrivalDate,
        uncertaintyDays,
        variabilityClass,
        useLeadTimeEstimate,
      };
    }

    return baseSnapshot;
  }

  function drawerBaselineSnapshot(nextTask: OverviewSupplierTicketTask) {
    const nextMode = nextTask.defaultDrawerMode;
    const nextObservedAt = initialObservedAt(null);
    const baseSnapshot = {
      mode: nextMode,
      observedAt: nextObservedAt,
      notes: '',
    };

    if (nextMode === 'ordered_waiting' || nextMode === 'eta_changed') {
      return {
        ...baseSnapshot,
        expectedArrivalDate: clampDateInputToObservedDate(initialExpectedArrivalDate(nextTask.expectedArrivalDate), nextObservedAt),
        uncertaintyDays: leadTimeStdDaysDraft(nextTask.leadTimeStdDays),
        variabilityClass: nextTask.variabilityClass ?? '',
        useLeadTimeEstimate: true,
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
  const observedDateInput = observedLocalDateInputValue(observedAt);

  async function submit() {
    setError(null);
    const observedAtIso = parseLocalDateTimeInputIso(observedAt);
    if (!observedAtIso) {
      setError(t('overviewDrawerObservedAtRequired'));
      setSaveErrorFlashKey((current) => current + 1);
      return false;
    }
    if (
      ((mode === 'ordered_waiting' || mode === 'eta_changed') && !expectedArrivalDate)
    ) {
      return false;
    }
    if ((mode === 'ordered_waiting' || mode === 'eta_changed') && clampDateInputToObservedDate(expectedArrivalDate, observedAt) !== expectedArrivalDate) {
      setError(translateUiLiteral(language, 'Expected date of arrival cannot be before the observed date.'));
      setSaveErrorFlashKey((current) => current + 1);
      return false;
    }
    const senaPayload = createEmptyObservationInput({
      observedAt: observedAtIso,
      notes: notes.trim() || null,
    });
    if (mode === 'ordered_waiting' || mode === 'eta_changed') {
      const eventType: SenaTicketEventType =
        mode === 'eta_changed'
          ? 'eta_updated'
          : activeTask.ticketId.startsWith(DRAFT_SUPPLIER_TICKET_ID_PREFIX)
            ? 'created'
            : 'revised';
      const ticketIdentity = supplierTicketIdentityForDrawer({
        eventType,
        observedAt: observedAtIso,
        recordUpdateContext,
        task: activeTask,
      });
      senaPayload.ticketEvents = [
        supplierTicketEventFromDrawer({
          eventType,
          expectedArrivalDate,
          lifecycle: 'open',
          lines: ticketLinesForDrawer({
            expectedArrivalDate,
            mode,
            note: notes.trim() || null,
            observedAt,
            task: activeTask,
          }),
          mode,
          note: notes.trim() || null,
          observedAt: observedAtIso,
          supplierName: activeTask.supplierName,
          ...ticketIdentity,
        }),
      ];
      senaPayload.leadTimeHints = activeTask.childTasks.flatMap((child) =>
        leadTimeHintFromTaskInputs({
          observedAt,
          skuId: child.skuId,
          uncertaintyDays,
          useLeadTimeEstimate,
          variabilityClass,
          expectedArrivalDate,
        }),
      );
    }

    if (mode === 'order_canceled') {
      const ticketIdentity = supplierTicketIdentityForDrawer({
        eventType: 'canceled',
        observedAt: observedAtIso,
        recordUpdateContext,
        task: activeTask,
      });
      senaPayload.ticketEvents = [
        supplierTicketEventFromDrawer({
          eventType: 'canceled',
          expectedArrivalDate: '',
          lifecycle: 'canceled',
          lines: ticketLinesForDrawer({
            expectedArrivalDate: '',
            mode,
            note: notes.trim() || null,
            observedAt,
            task: activeTask,
          }),
          mode,
          note: notes.trim() || null,
          observedAt: observedAtIso,
          supplierName: activeTask.supplierName,
          ...ticketIdentity,
        }),
      ];
    }

    if (mode === 'goods_received') {
      const ticketIdentity = supplierTicketIdentityForDrawer({
        eventType: 'fully_received',
        observedAt: observedAtIso,
        recordUpdateContext,
        task: activeTask,
      });
      senaPayload.orderSignals = activeTask.ticket.lines
        .filter((line) => line.entityType === 'sku')
        .map((line) => {
          const childTask = activeTask.childTasks.find((task) => task.skuId === line.entityId);
          return {
            skuId: line.entityId,
            orderPlaced: false,
            receiptArrived: true,
            approximateOrderQuantity: null,
            approximateReceiptQuantity: line.orderedQuantity ?? line.receivedQuantity ?? childTask?.recentOrderQuantity ?? childTask?.suggestedOrderQuantity ?? null,
          };
        });
      const receiptDeltas = new Map<string, number>();
      for (const signal of senaPayload.orderSignals) {
        if (signal.receiptArrived && signal.approximateReceiptQuantity != null) {
          receiptDeltas.set(signal.skuId, (receiptDeltas.get(signal.skuId) ?? 0) + signal.approximateReceiptQuantity);
        }
      }
      senaPayload.stockSnapshot = stockSnapshotForTicketInventoryDeltas({
        catalog,
        deltasBySkuId: receiptDeltas,
        fallbacksBySkuId: new Map(activeTask.childTasks.map((childTask) => [childTask.skuId, {
          costPerUnit: childTask.costPerUnit,
          productPrice: childTask.productPrice,
          unitsInStock: childTask.currentStock,
        }])),
        recordUpdateContext,
        snapshot,
      });
      senaPayload.ticketEvents = [
        supplierTicketEventFromDrawer({
          eventType: 'fully_received',
          expectedArrivalDate: '',
          lifecycle: 'resolved',
          lines: ticketLinesForDrawer({
            expectedArrivalDate: '',
            mode,
            note: notes.trim() || null,
            observedAt,
            task: activeTask,
          }),
          mode,
          note: notes.trim() || null,
          observedAt: observedAtIso,
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
      await ingestSenaObservation(senaPayload);
      finalizeSuccessfulDrawerSave({
        close: () => {
          setDismissedAfterSave(true);
          onOpenChange(false);
        },
        prepareWorkspace: onPrepareAfterSave ??
          (() => runWorkspacePreparation(() => triggerSenaRun({ algorithmVersion: 'sena-analysis-v3' }))),
      });
      return true;
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : t('overviewDrawerSaveFailed'));
      setSaveErrorFlashKey((current) => current + 1);
      return false;
    }
  }

  const submitLabel =
    mode === 'goods_received'
      ? t('overviewDrawerSubmitGoodsReceived')
      : mode === 'order_canceled'
        ? t('overviewDrawerSubmitOrderCanceled')
      : mode === 'not_ordered'
        ? t('overviewDrawerSubmitNotOrdered')
        : t('overviewDrawerSubmitDefault');
  const RealLifeIcon = overviewDrawerBandIcons.real_life;
  const submitDisabled =
    isSaving ||
    !parseLocalDateTimeInputIso(observedAt) ||
    ((mode === 'ordered_waiting' || mode === 'eta_changed') && !expectedArrivalDate);
  const bottomPresentation = presentation === 'bottom';
  const drawerContentStyle = bottomPresentation
    ? undefined
    : {
        width: `${drawerWidth}px`,
        maxWidth: `calc(var(--kaur-khor-effective-viewport-width, 100vw) - ${DRAWER_VIEWPORT_GUTTER}px)`,
      };

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
        {...(bottomPresentation ? { 'data-slot': 'phone-task-drawer' } : {})}
        className={cn(
          'w-full gap-0 overflow-hidden border-border/70 bg-[#f8f4ef] px-0 shadow-[0_28px_72px_rgba(48,31,20,0.18)]',
          bottomPresentation
            ? 'h-[var(--kaur-khor-embedded-effective-height,100dvh)] max-h-[var(--kaur-khor-embedded-effective-height,100dvh)] rounded-t-[1.35rem] border-t'
            : 'max-w-none border-l',
        )}
        showCloseButton={false}
        side={bottomPresentation ? 'bottom' : 'right'}
        style={drawerContentStyle}
      >
        {discardConfirmDialog}
        {!bottomPresentation ? (
          <div
            aria-hidden="true"
            className="absolute inset-y-0 left-0 z-30 w-5 cursor-ew-resize touch-none"
            onPointerDown={startDrawerResize}
          />
        ) : null}

        <SheetHeader className={cn(
          'sticky top-0 z-20 gap-4 border-b border-border/40 bg-[#f8f4ef]/96 backdrop-blur-sm',
          bottomPresentation ? 'relative px-4 py-4 pr-14' : 'px-8 py-7',
        )}>
          <div className={cn('flex justify-between gap-4', bottomPresentation ? 'items-center' : 'items-start')}>
            <div className="min-w-0 flex-1">
              <div className={cn('flex gap-4', bottomPresentation ? 'items-center' : 'items-start')}>
                <ItemAvatar imagePath={task.imagePath} name={task.displayTicketLabel} size="hero" type="sku" />
                <div className="min-w-0 flex-1">
                  <div className="flex min-h-14 flex-wrap items-center gap-3">
                    <SheetTitle className={cn('leading-tight tracking-[-0.04em]', bottomPresentation ? 'text-xl' : 'text-[2rem]')}>{task.displayTicketLabel}</SheetTitle>
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
                {task.whyNow} · {task.skuSummaryLabel} · {task.etaLabel}
              </SheetDescription>
            </div>

            <SheetClose className={cn(
              'inline-flex size-9 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-secondary/65 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50',
              bottomPresentation ? 'absolute top-4 right-4 z-30' : 'mt-1',
            )}>
              <ActionCloseIcon className="size-5" />
              <span className="sr-only">{translateUiLiteral(language, 'Close')}</span>
            </SheetClose>
          </div>
        </SheetHeader>

        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className={cn(bottomPresentation ? 'px-4 py-4 pb-40' : 'px-8 py-6 pb-44')}>
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
                  maxColumns={bottomPresentation ? 1 : 2}
                  minColumns={bottomPresentation ? 1 : 2}
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
                              icon={option.icon}
                              selected={mode === option.value}
                              title={option.title}
                              wrapText={bottomPresentation}
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
                      icon={option.icon}
                      measure
                      selected={mode === option.value}
                      title={option.title}
                      wrapText={bottomPresentation}
                    />
                  )}
                />
              </div>

              <DrawerBand
                bandId="timing"
                className="mt-6"
                title={mode === 'goods_received' ? t('overviewDrawerReceiptTimingTitle') : t('overviewDrawerTimingTitle')}
              >
                <div className={cn(mode === 'goods_received' || mode === 'not_ordered' || mode === 'order_canceled' ? 'grid gap-5' : 'grid gap-5 md:grid-cols-2')}>
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
                        min={observedDateInput}
                        type="date"
                        value={expectedArrivalDate}
                        onChange={(event) => {
                          markDraftEdited();
                          setExpectedArrivalDate(clampDateInputToObservedDate(event.target.value, observedAt));
                        }}
                      />
                    </ActionSheetField>
                  ) : null}
                </div>
              </DrawerBand>

              {(mode === 'ordered_waiting' || mode === 'eta_changed') ? (
                <>
                  <DrawerBand bandId="order_shape" title={t('fieldLeadTimeVariability')}>
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
                      mode === 'not_ordered' || mode === 'order_canceled' ? 'min-h-24' : '',
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

        <SheetFooter className={cn(
          'sticky bottom-0 z-20 border-t border-border/50 bg-[#f8f4ef]/96 shadow-[0_-10px_24px_rgba(48,31,20,0.06)] backdrop-blur-sm',
          bottomPresentation ? 'px-4 pt-4 pb-[max(env(safe-area-inset-bottom),1rem)]' : 'px-8 py-5',
        )}>
          <div className="flex w-full flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            {!bottomPresentation ? (
            <div className="min-w-0 sm:max-w-[18rem]">
              <p className="text-sm font-medium text-foreground">{t('overviewDrawerModeLabel', { value: drawerModeLabel(t, mode) })}</p>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">{drawerModeSummary(t, mode)}</p>
            </div>
            ) : null}
            <div className={cn('flex w-full gap-2', bottomPresentation ? 'flex-row' : 'flex-col sm:w-auto sm:flex-row')}>
              <Button asChild className={cn('w-full', bottomPresentation ? 'min-w-0 flex-1' : 'sm:w-auto sm:min-w-[11rem]')} size="lg" variant="outline">
                <Link to={supplierCaptureHrefForTask(task, mode)}>
                  <ActionOpenExternalIcon data-icon="inline-start" />
                  {translateUiLiteral(language, 'Edit in Capture')}
                </Link>
              </Button>
              <Button
                className={cn('w-full', bottomPresentation ? 'min-w-0 flex-1' : 'sm:w-auto sm:min-w-[15rem]')}
                disabled={submitDisabled}
                size="lg"
                type="button"
                onClick={() => void submit()}
              >
                {mode === 'goods_received' ? <ActionReceiveInventoryIcon className="size-4" /> : <ActionSaveIcon className="size-4" />}
                {isSaving ? translateUiLiteral(language, 'Saving…') : submitLabel}
              </Button>
            </div>
          </div>
        </SheetFooter>
      </SheetContent>
    </Sheet>
    </>
  );
}
