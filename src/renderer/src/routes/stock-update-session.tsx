import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type FormEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  ActionCreatePackageIcon,
  ActionDragHandleIcon,
  ActionDeleteIcon,
  ActionSaveIcon,
  ActionUndoIcon,
} from '@icons/actions';
import { getRegimeIcon } from '@icons/domain';
import { EntityFlagIcon } from '@icons/entities';
import { NavigationBackIcon, NavigationNextIcon, NavigationPreviousIcon } from '@icons/navigation';
import {
  StatusGaugeIcon,
  StatusReadyIcon,
  StatusScheduleIcon,
  StatusTimingIcon,
  StatusUnavailableIcon,
  StatusWarningIcon,
} from '@icons/status';
import type { IconComponent } from '@icons';
import type { SenaCatalog, SenaLeadTimeVariabilityClass, SenaObservationRegimeHint, SenaStockSnapshot } from '@shared/sena';
import type { InventorySnapshot, RankingEntry, RankingEntryType, SistOverview } from '@shared/inventory';
import {
  classifyLeadTimeVariability,
  compatibilityRangeForClass,
  impliedLeadTimeRangeFromMeanStd,
  leadTimeVariabilityOptions,
} from '@shared/sena-lead-time';
import { HelpTooltip } from '@/components/system/help-tooltip';
import { MerchandisingEditor } from '@/components/system/merchandising-editor';
import { StepWizard } from '@/components/system/step-wizard';
import { ConfirmActionDialog } from '@/components/system/confirm-action-dialog';
import { MetricRibbon } from '@/components/system/metric-ribbon';
import { WorkspaceActionRow, WorkspacePage, WorkspacePanel, WorkspaceTitleCard } from '@/components/system/workspace';
import { useDiscardChangesConfirm } from '@/hooks/use-route-leave-confirm';
import { Button } from '@/components/ui/button';
import { AnchoredMenu } from '@/components/ui/anchored-menu';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { displayMoneyFromUsd, formatCurrency, moneyInputStep, reformatMoneyDraftValue, usdMoneyFromDisplay } from '@/lib/format';
import { leadTimeVariabilityPlaceholderValue } from '@/lib/lead-time-variability-select';
import { translateLeadTimeVariabilityDescription, translateLeadTimeVariabilityLabel } from '@/lib/localized-display';
import { readRecordUpdateEditSession } from '@/lib/observation-edit-session';
import { rowHoverClassName } from '@/lib/interactive-surface';
import { getRecordUpdateLane, RECORD_UPDATE_HUB_PATH } from '@/lib/record-update-routes';
import { activeSenaCatalog } from '@/lib/sena-catalog';
import { translateUiLiteral, type TranslationKey } from '@/lib/translations';
import { cn } from '@/lib/utils';
import { useInventory } from '@/state/inventory';
import { usePreferences } from '@/state/preferences';
import { buildRankChangeByEntryKey } from './ranking-order';
import {
  applyStockRowOrder,
  buildStockRowOrderStorageKey,
  readStockRowOrder,
  reorderStockRows,
  writeStockRowOrder,
} from './stock-row-order';
import { SectionLabel } from './sku-detail/section-heading';
import { formatSenaDateTime, formatSenaLongDate } from './sku-detail/format';
import {
  createEmptyObservationInput,
  hasStructuredObservationSignal,
  intervalDaysBetween,
  latestObservationAt,
  observationCompositionParts,
} from './observation-payload';

type StockView = 'priority' | 'counted' | 'all';
type StockoutFlagValue = 'blocked' | 'stockout';
type StockEventDropdownValue = 'none' | StockoutFlagValue;
type StockUpdateStepId =
  | 'observed-at'
  | 'report-notes'
  | 'stock'
  | 'reorder'
  | 'retail-sales'
  | 'service-sales'
  | 'stock-cost'
  | 'stock-price'
  | 'stock-flags'
  | 'service'
  | 'rankings'
  | 'context'
  | 'review';
type SkuFlagId = 'ordered' | 'received' | 'blocked';
type ServiceFlagId = 'price' | 'blocked';
type OptionalStockStepChoice = 'unset' | 'yes' | 'no';
type OptionalStockStepId = 'stock-cost' | 'stock-price' | 'stock-flags';

type StockRow = SenaStockSnapshot;
type SalesCountDrafts = Record<string, string>;

interface SkuSignalDraft {
  orderEnabled: boolean;
  orderedQuantity: string;
  leadTimeMeanDays: string;
  leadTimeVariability: SenaLeadTimeVariabilityClass | '';
  expectedArrivalDate: string;
  receiptEnabled: boolean;
  receiptQuantity: string;
  blockedEnabled: boolean;
  blockedState: StockoutFlagValue;
}

interface ServiceSignalDraft {
  priceEnabled: boolean;
  price: string;
  blockedEnabled: boolean;
  blockedState: StockoutFlagValue;
}

interface StockUpdateSessionDraft {
  version: 1;
  savedAt: string;
  currentStepId: StockUpdateStepId;
  unlockedStepCount: number;
  observedAt: string;
  notes: string;
  stockView: StockView;
  rows: StockRow[];
  recordOrderExpectedArrivalDate?: string;
  recordOrderLeadTimeMeanDays?: string;
  recordOrderLeadTimeVariability?: SenaLeadTimeVariabilityClass | '';
  retailSalesChoice?: OptionalStockStepChoice;
  serviceSalesChoice?: OptionalStockStepChoice;
  retailSalesDrafts?: SalesCountDrafts;
  serviceSalesDrafts?: SalesCountDrafts;
  skuSignalDrafts: Record<string, SkuSignalDraft>;
  stockStepChoices: Record<OptionalStockStepId, OptionalStockStepChoice>;
  serviceSignalDrafts: Record<string, ServiceSignalDraft>;
  regimeHint: SenaObservationRegimeHint | '';
  serviceRankings: string[];
  retailRankings: string[];
}

interface StockUpdateDraftState {
  catalog: SenaCatalog | null;
  currentStepId: StockUpdateStepId;
  initialObservedAt: string;
  notes: string;
  observedAt: string;
  regimeHint: SenaObservationRegimeHint | '';
  retailSalesChoice: OptionalStockStepChoice;
  retailSalesDrafts: SalesCountDrafts;
  retailRankings: string[];
  rows: StockRow[];
  recordOrderExpectedArrivalDate: string;
  recordOrderLeadTimeMeanDays: string;
  recordOrderLeadTimeVariability: SenaLeadTimeVariabilityClass | '';
  serviceSalesChoice: OptionalStockStepChoice;
  serviceSalesDrafts: SalesCountDrafts;
  serviceRankings: string[];
  serviceSignalDrafts: Record<string, ServiceSignalDraft>;
  skuSignalDrafts: Record<string, SkuSignalDraft>;
  stockStepChoices: Record<OptionalStockStepId, OptionalStockStepChoice>;
  stockBySku: Map<string, SenaStockSnapshot>;
  stockView: StockView;
  unlockedStepCount: number;
}

interface EditSessionState {
  observationId: string;
  input: ReturnType<typeof createEmptyObservationInput>;
}

interface PendingNavigationState {
  continueNavigation: () => void;
}

const EMPTY_SIST_OVERVIEW: SistOverview = {
  status: {
    state: 'empty',
    updatedAt: null,
    reportCount: 0,
    confidence: 'low',
    reason: null,
  },
  settings: {
    targetServiceLevel: 0.95,
    reviewPeriodDays: 7,
    maxLeadTimeDays: 30,
    changePointThreshold: 0.5,
    lowStockoutRiskThreshold: 0.1,
    highStockoutRiskThreshold: 0.5,
    lowCoverageDaysThreshold: 3,
    highCoverageDaysThreshold: 14,
    staleAfterHours: 48,
    forecastHorizonDays: 30,
    reportSmoothWindow: 8,
  },
  asOf: null,
  topRegime: null,
  pendingReorderCount: 0,
  highRiskSkuIds: [],
  skuInsights: [],
  metadata: null,
};

const STOCK_UPDATE_FULL_STEP_ORDER: StockUpdateStepId[] = ['observed-at', 'report-notes', 'stock', 'service', 'rankings', 'context', 'review'];
const STOCK_COUNT_STEP_ORDER: StockUpdateStepId[] = ['observed-at', 'report-notes', 'stock', 'stock-cost', 'stock-price', 'stock-flags', 'context', 'review'];
const SALES_UPDATE_STEP_ORDER: StockUpdateStepId[] = ['observed-at', 'report-notes', 'retail-sales', 'service-sales', 'stock-flags', 'context', 'review'];
const RECORD_ORDER_STEP_ORDER: StockUpdateStepId[] = ['observed-at', 'report-notes', 'reorder', 'stock-flags', 'context', 'review'];
const OPTIONAL_STOCK_STEP_IDS: OptionalStockStepId[] = ['stock-cost', 'stock-price', 'stock-flags'];
const REPORT_NOTE_PLACEHOLDER_KEYS = [
  'stockUpdateNotesPlaceholderShiftContext',
  'stockUpdateNotesPlaceholderSupplierDelay',
  'stockUpdateNotesPlaceholderDisplayChange',
  'stockUpdateNotesPlaceholderNothingSpecial',
] as const satisfies readonly TranslationKey[];

function randomReportNotePlaceholderKey(): TranslationKey {
  return REPORT_NOTE_PLACEHOLDER_KEYS[Math.floor(Math.random() * REPORT_NOTE_PLACEHOLDER_KEYS.length)]!;
}

const STOCK_UPDATE_STEP_COPY: Record<
  StockUpdateStepId,
  {
    descriptionKey:
      | 'stockUpdateStepObservedAtDescription'
      | 'stockUpdateStepReportNotesDescription'
      | 'stockUpdateStepContextDescription'
      | 'stockUpdateStepStockDescription'
      | 'stockUpdateStepServiceDescription'
      | 'stockUpdateStepRankingsDescription'
      | 'stockUpdateStepReviewDescription';
    titleKey:
      | 'stockUpdateStepObservedAtTitle'
      | 'stockUpdateStepReportNotesTitle'
      | 'stockUpdateStepContextTitle'
      | 'stockUpdateStepStockTitle'
      | 'stockUpdateStepServiceTitle'
      | 'stockUpdateStepRankingsTitle'
      | 'stockUpdateStepReviewTitle';
  }
> = {
  'observed-at': {
    titleKey: 'stockUpdateStepObservedAtTitle',
    descriptionKey: 'stockUpdateStepObservedAtDescription',
  },
  'report-notes': {
    titleKey: 'stockUpdateStepReportNotesTitle',
    descriptionKey: 'stockUpdateStepReportNotesDescription',
  },
  context: {
    titleKey: 'stockUpdateStepContextTitle',
    descriptionKey: 'stockUpdateStepContextDescription',
  },
  stock: {
    titleKey: 'stockUpdateStepStockTitle',
    descriptionKey: 'stockUpdateStepStockDescription',
  },
  reorder: {
    titleKey: 'stockUpdateStepStockTitle',
    descriptionKey: 'stockUpdateStepStockDescription',
  },
  service: {
    titleKey: 'stockUpdateStepServiceTitle',
    descriptionKey: 'stockUpdateStepServiceDescription',
  },
  rankings: {
    titleKey: 'stockUpdateStepRankingsTitle',
    descriptionKey: 'stockUpdateStepRankingsDescription',
  },
  review: {
    titleKey: 'stockUpdateStepReviewTitle',
    descriptionKey: 'stockUpdateStepReviewDescription',
  },
};

function localDateTimeInputValue(value: string | null) {
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) {
    return '';
  }

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

function dateTimeInputToIso(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return date.toISOString();
}

function dateInputValue(value: string | null) {
  if (!value) {
    return '';
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '';
  }
  return date.toISOString().slice(0, 10);
}

function dateInputToIso(value: string) {
  if (!value) {
    return null;
  }
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return date.toISOString();
}

function addDaysToDateInput(observedAtIso: string | null, days: number | null) {
  if (!observedAtIso || days == null || !Number.isFinite(days) || days < 0) {
    return '';
  }
  const date = new Date(observedAtIso);
  if (Number.isNaN(date.getTime())) {
    return '';
  }
  date.setUTCDate(date.getUTCDate() + Math.round(days));
  return date.toISOString().slice(0, 10);
}

function expectedArrivalDaysFromLeadTime(
  meanDays: number | null,
  variabilityClass: SenaLeadTimeVariabilityClass | null,
) {
  if (meanDays == null || !Number.isFinite(meanDays) || meanDays < 0) {
    return null;
  }
  return compatibilityRangeForClass(meanDays, variabilityClass)?.highDays ?? meanDays;
}

function createEmptySkuSignalDraft(): SkuSignalDraft {
  return {
    orderEnabled: false,
    orderedQuantity: '',
    leadTimeMeanDays: '',
    leadTimeVariability: '',
    expectedArrivalDate: '',
    receiptEnabled: false,
    receiptQuantity: '',
    blockedEnabled: false,
    blockedState: 'blocked',
  };
}

function createEmptyServiceSignalDraft(): ServiceSignalDraft {
  return {
    priceEnabled: false,
    price: '',
    blockedEnabled: false,
    blockedState: 'blocked',
  };
}

function skuEventOnlyDraft(draft: SkuSignalDraft): SkuSignalDraft {
  return {
    ...draft,
    orderEnabled: false,
    orderedQuantity: '',
    leadTimeMeanDays: '',
    leadTimeVariability: '',
    expectedArrivalDate: '',
    receiptEnabled: false,
    receiptQuantity: '',
  };
}

function skuEventOnlyDrafts(drafts: Record<string, SkuSignalDraft>) {
  return Object.fromEntries(
    Object.entries(drafts).map(([skuId, draft]) => [skuId, skuEventOnlyDraft(draft)]),
  );
}

function skuWithoutEventDraft(draft: SkuSignalDraft): SkuSignalDraft {
  return {
    ...draft,
    blockedEnabled: false,
    blockedState: 'blocked',
  };
}

function skuWithoutEventDrafts(drafts: Record<string, SkuSignalDraft>) {
  return Object.fromEntries(
    Object.entries(drafts).map(([skuId, draft]) => [skuId, skuWithoutEventDraft(draft)]),
  );
}

function activeSkuFlagIds(draft: SkuSignalDraft | undefined): SkuFlagId[] {
  if (!draft) {
    return [];
  }
  return [
    ...(draft.orderEnabled ? (['ordered'] as const) : []),
    ...(draft.receiptEnabled ? (['received'] as const) : []),
    ...(draft.blockedEnabled ? (['blocked'] as const) : []),
  ];
}

function activeServiceFlagIds(draft: ServiceSignalDraft | undefined): ServiceFlagId[] {
  if (!draft) {
    return [];
  }
  return [
    ...(draft.priceEnabled ? (['price'] as const) : []),
    ...(draft.blockedEnabled ? (['blocked'] as const) : []),
  ];
}

function hasSkuFlags(draft: SkuSignalDraft | undefined) {
  return activeSkuFlagIds(draft).length > 0;
}

function hasServiceFlags(draft: ServiceSignalDraft | undefined) {
  return activeServiceFlagIds(draft).length > 0;
}

function skuDraftHasEmptyRequiredValue(draft: SkuSignalDraft | undefined) {
  if (!draft) {
    return false;
  }
  return (draft.orderEnabled && draft.orderedQuantity.trim() === '') || (draft.receiptEnabled && draft.receiptQuantity.trim() === '');
}

function serviceDraftHasEmptyRequiredValue(draft: ServiceSignalDraft | undefined) {
  if (!draft) {
    return false;
  }
  return draft.priceEnabled && draft.price.trim() === '';
}

function anySkuFlags(drafts: Record<string, SkuSignalDraft>) {
  return Object.values(drafts).some((draft) => hasSkuFlags(draft));
}

function anyServiceFlags(drafts: Record<string, ServiceSignalDraft>) {
  return Object.values(drafts).some((draft) => hasServiceFlags(draft));
}

function skuFlagsHaveEmptyRequiredValues(drafts: Record<string, SkuSignalDraft>) {
  return Object.values(drafts).some((draft) => skuDraftHasEmptyRequiredValue(draft));
}

function serviceFlagsHaveEmptyRequiredValues(drafts: Record<string, ServiceSignalDraft>) {
  return Object.values(drafts).some((draft) => serviceDraftHasEmptyRequiredValue(draft));
}

function serviceDisplayPriceChanged(
  catalog: SenaCatalog | null,
  serviceId: string,
  draft: ServiceSignalDraft | undefined,
  currency: 'USD' | 'KHR',
  usdToKhrExchangeRate: number,
) {
  if (!draft?.priceEnabled || draft.price === '') {
    return false;
  }
  const baseline = catalog?.services.find((service) => service.serviceId === serviceId)?.price ?? null;
  const price = usdMoneyFromDisplay(Number(draft.price), currency, usdToKhrExchangeRate);
  return baseline == null || price !== baseline;
}

function canUseBrowserStorage() {
  return (
    typeof window !== 'undefined' &&
    Boolean(window.localStorage) &&
    typeof window.localStorage.getItem === 'function' &&
    typeof window.localStorage.setItem === 'function' &&
    typeof window.localStorage.removeItem === 'function'
  );
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isStockUpdateStepId(value: unknown): value is StockUpdateStepId {
  return (
    typeof value === 'string' &&
    [...STOCK_UPDATE_FULL_STEP_ORDER, ...STOCK_COUNT_STEP_ORDER, ...SALES_UPDATE_STEP_ORDER, ...RECORD_ORDER_STEP_ORDER].includes(value as StockUpdateStepId)
  );
}

function stepOrderForLane(laneId: ReturnType<typeof getRecordUpdateLane>['id']) {
  if (laneId === 'stock-count') {
    return STOCK_COUNT_STEP_ORDER;
  }
  if (laneId === 'sales-update') {
    return SALES_UPDATE_STEP_ORDER;
  }
  if (laneId === 'record-order') {
    return RECORD_ORDER_STEP_ORDER;
  }
  return STOCK_UPDATE_FULL_STEP_ORDER;
}

function normalizeStepIdForOrder(currentStepId: StockUpdateStepId, stepOrder: StockUpdateStepId[]) {
  if (stepOrder.includes(currentStepId)) {
    return currentStepId;
  }
  if (stepOrder.includes('context')) {
    return 'context';
  }
  return stepOrder[0] ?? 'stock';
}

function isStockView(value: unknown): value is StockView {
  return value === 'priority' || value === 'counted' || value === 'all';
}

function isRegimeHint(value: unknown): value is SenaObservationRegimeHint | '' {
  return (
    value === '' ||
    value === 'normal' ||
    value === 'spike' ||
    value === 'lull' ||
    value === 'stockout_constrained' ||
    value === 'promo' ||
    value === 'correction'
  );
}

function isStockoutFlagValue(value: unknown): value is StockoutFlagValue {
  return value === 'blocked' || value === 'stockout';
}

function isOptionalStockStepChoice(value: unknown): value is OptionalStockStepChoice {
  return value === 'unset' || value === 'yes' || value === 'no';
}

function readStockUpdateDraft(draftStorageKey: string) {
  if (!canUseBrowserStorage()) {
    return null;
  }

  const rawDraft = window.localStorage.getItem(draftStorageKey);
  if (!rawDraft) {
    return null;
  }

  try {
    const parsed = JSON.parse(rawDraft) as unknown;
    if (!isObjectRecord(parsed) || parsed.version !== 1) {
      window.localStorage.removeItem(draftStorageKey);
      return null;
    }
    return parsed;
  } catch {
    window.localStorage.removeItem(draftStorageKey);
    return null;
  }
}

function hasStoredStockUpdateDraft(draftStorageKey: string) {
  return readStockUpdateDraft(draftStorageKey) !== null;
}

function removeStockUpdateDraft(draftStorageKey: string) {
  if (canUseBrowserStorage()) {
    window.localStorage.removeItem(draftStorageKey);
  }
}

function sanitizeStockRow(row: unknown, baseline: StockRow): StockRow {
  if (!isObjectRecord(row)) {
    return baseline;
  }
  return {
    skuId: baseline.skuId,
    unitsInStock: typeof row.unitsInStock === 'number' ? row.unitsInStock : baseline.unitsInStock,
    costPerUnit:
      typeof row.costPerUnit === 'number' || row.costPerUnit === null ? row.costPerUnit : baseline.costPerUnit,
    productPrice:
      typeof row.productPrice === 'number' || row.productPrice === null ? row.productPrice : baseline.productPrice,
  };
}

function sanitizeSkuSignalDraft(draft: unknown): SkuSignalDraft | null {
  if (!isObjectRecord(draft)) {
    return null;
  }
  return {
    orderEnabled: draft.orderEnabled === true,
    orderedQuantity: typeof draft.orderedQuantity === 'string' ? draft.orderedQuantity : '',
    leadTimeMeanDays: typeof draft.leadTimeMeanDays === 'string' ? draft.leadTimeMeanDays : '',
    leadTimeVariability:
      typeof draft.leadTimeVariability === 'string' &&
      ['very_tight', 'tight', 'normal', 'wide', 'very_wide'].includes(draft.leadTimeVariability)
        ? (draft.leadTimeVariability as SenaLeadTimeVariabilityClass)
        : '',
    expectedArrivalDate: typeof draft.expectedArrivalDate === 'string' ? draft.expectedArrivalDate : '',
    receiptEnabled: draft.receiptEnabled === true,
    receiptQuantity: typeof draft.receiptQuantity === 'string' ? draft.receiptQuantity : '',
    blockedEnabled: draft.blockedEnabled === true,
    blockedState: isStockoutFlagValue(draft.blockedState) ? draft.blockedState : 'blocked',
  };
}

function sanitizeServiceSignalDraft(draft: unknown): ServiceSignalDraft | null {
  if (!isObjectRecord(draft)) {
    return null;
  }
  return {
    priceEnabled: draft.priceEnabled === true,
    price: typeof draft.price === 'string' ? draft.price : '',
    blockedEnabled: draft.blockedEnabled === true,
    blockedState: isStockoutFlagValue(draft.blockedState) ? draft.blockedState : 'blocked',
  };
}

function sanitizeDraftSignalRecord<T>(
  value: unknown,
  allowedIds: Set<string>,
  sanitizer: (draft: unknown) => T | null,
) {
  if (!isObjectRecord(value)) {
    return {};
  }
  return Object.fromEntries(
    Object.entries(value).flatMap(([id, draft]) => {
      if (!allowedIds.has(id)) {
        return [];
      }
      const sanitizedDraft = sanitizer(draft);
      return sanitizedDraft ? [[id, sanitizedDraft]] : [];
    }),
  ) as Record<string, T>;
}

function sanitizeStockStepChoices(value: unknown) {
  if (!isObjectRecord(value)) {
    return {
      'stock-cost': 'unset',
      'stock-price': 'unset',
      'stock-flags': 'unset',
    } satisfies Record<OptionalStockStepId, OptionalStockStepChoice>;
  }

  return {
    'stock-cost': isOptionalStockStepChoice(value['stock-cost']) ? value['stock-cost'] : 'unset',
    'stock-price': isOptionalStockStepChoice(value['stock-price']) ? value['stock-price'] : 'unset',
    'stock-flags': isOptionalStockStepChoice(value['stock-flags']) ? value['stock-flags'] : 'unset',
  } satisfies Record<OptionalStockStepId, OptionalStockStepChoice>;
}

function sanitizeDraftRanking(value: unknown, allowedIds: Set<string>) {
  if (!Array.isArray(value)) {
    return [];
  }
  const seenIds = new Set<string>();
  return value.filter((id): id is string => {
    if (typeof id !== 'string' || !allowedIds.has(id) || seenIds.has(id)) {
      return false;
    }
    seenIds.add(id);
    return true;
  });
}

function sanitizeSalesCountDrafts(value: unknown, allowedIds: Set<string>) {
  if (!isObjectRecord(value)) {
    return {};
  }
  return Object.fromEntries(
    Object.entries(value).flatMap(([id, draft]) => {
      if (!allowedIds.has(id) || typeof draft !== 'string') {
        return [];
      }
      return [[id, draft]];
    }),
  ) as SalesCountDrafts;
}

function sanitizeLeadTimeVariability(value: unknown): SenaLeadTimeVariabilityClass | '' {
  return typeof value === 'string' && ['very_tight', 'tight', 'normal', 'wide', 'very_wide'].includes(value)
    ? (value as SenaLeadTimeVariabilityClass)
    : '';
}

function hydrateStockUpdateDraft({
  baselineRows,
  catalog,
  draft,
  stepOrder,
}: {
  baselineRows: StockRow[];
  catalog: SenaCatalog;
  draft: unknown;
  stepOrder: StockUpdateStepId[];
}): StockUpdateSessionDraft | null {
  if (!isObjectRecord(draft) || draft.version !== 1) {
    return null;
  }

  const allowedSkuIds = new Set(catalog.skus.map((sku) => sku.skuId));
  const allowedServiceIds = new Set(catalog.services.map((service) => service.serviceId));
  const retailSkuIds = new Set(catalog.skus.filter((sku) => sku.soldAsProduct).map((sku) => sku.skuId));
  const draftRowsBySku = new Map(
    (Array.isArray(draft.rows) ? draft.rows : [])
      .filter((row): row is Record<string, unknown> => isObjectRecord(row) && typeof row.skuId === 'string')
      .map((row) => [row.skuId as string, row]),
  );
  const stockStepChoices = sanitizeStockStepChoices(draft.stockStepChoices);
  const retailSalesChoice = isOptionalStockStepChoice(draft.retailSalesChoice) ? draft.retailSalesChoice : 'unset';
  const serviceSalesChoice = isOptionalStockStepChoice(draft.serviceSalesChoice) ? draft.serviceSalesChoice : 'unset';

  return {
    version: 1,
    savedAt: typeof draft.savedAt === 'string' ? draft.savedAt : new Date().toISOString(),
    currentStepId: normalizeStepIdForOrder(
      isStockUpdateStepId(draft.currentStepId) ? draft.currentStepId : 'stock',
      stepOrder,
    ),
    unlockedStepCount:
      typeof draft.unlockedStepCount === 'number'
        ? Math.min(stepOrder.length, Math.max(1, Math.floor(draft.unlockedStepCount)))
        : 1,
    observedAt: typeof draft.observedAt === 'string' ? draft.observedAt : localDateTimeInputValue(null),
    notes: typeof draft.notes === 'string' ? draft.notes : '',
    stockView: isStockView(draft.stockView) ? draft.stockView : 'priority',
    rows: baselineRows.map((row) => sanitizeStockRow(draftRowsBySku.get(row.skuId), row)),
    recordOrderExpectedArrivalDate: typeof draft.recordOrderExpectedArrivalDate === 'string' ? draft.recordOrderExpectedArrivalDate : '',
    recordOrderLeadTimeMeanDays: typeof draft.recordOrderLeadTimeMeanDays === 'string' ? draft.recordOrderLeadTimeMeanDays : '',
    recordOrderLeadTimeVariability: sanitizeLeadTimeVariability(draft.recordOrderLeadTimeVariability),
    retailSalesChoice,
    serviceSalesChoice,
    retailSalesDrafts: sanitizeSalesCountDrafts(draft.retailSalesDrafts, retailSkuIds),
    serviceSalesDrafts: sanitizeSalesCountDrafts(draft.serviceSalesDrafts, allowedServiceIds),
    skuSignalDrafts: sanitizeDraftSignalRecord(draft.skuSignalDrafts, allowedSkuIds, sanitizeSkuSignalDraft),
    stockStepChoices,
    serviceSignalDrafts: sanitizeDraftSignalRecord(
      draft.serviceSignalDrafts,
      allowedServiceIds,
      sanitizeServiceSignalDraft,
    ),
    regimeHint: isRegimeHint(draft.regimeHint) ? draft.regimeHint : '',
    serviceRankings: sanitizeDraftRanking(draft.serviceRankings, allowedServiceIds),
    retailRankings: sanitizeDraftRanking(draft.retailRankings, retailSkuIds),
  };
}

function hasMeaningfulStockUpdateChanges({
  catalog,
  initialObservedAt,
  notes,
  observedAt,
  regimeHint,
  retailSalesChoice,
  retailSalesDrafts,
  retailRankings,
  recordOrderExpectedArrivalDate,
  recordOrderLeadTimeMeanDays,
  recordOrderLeadTimeVariability,
  rows,
  serviceSalesChoice,
  serviceSalesDrafts,
  serviceRankings,
  serviceSignalDrafts,
  skuSignalDrafts,
  stockStepChoices,
  stockBySku,
}: StockUpdateDraftState) {
  return (
    rows.some((row) => stockRowChanged(catalog, stockBySku, row)) ||
    recordOrderExpectedArrivalDate.trim() !== '' ||
    recordOrderLeadTimeMeanDays.trim() !== '' ||
    recordOrderLeadTimeVariability !== '' ||
    Object.keys(retailSalesDrafts).length > 0 ||
    Object.keys(serviceSalesDrafts).length > 0 ||
    retailSalesChoice !== 'unset' ||
    serviceSalesChoice !== 'unset' ||
    anySkuFlags(skuSignalDrafts) ||
    anyServiceFlags(serviceSignalDrafts) ||
    Object.values(stockStepChoices).some((choice) => choice !== 'unset') ||
    regimeHint !== '' ||
    serviceRankings.length > 0 ||
    retailRankings.length > 0 ||
    notes.trim() !== '' ||
    observedAt !== initialObservedAt
  );
}

function buildStockUpdateDraft(state: StockUpdateDraftState): StockUpdateSessionDraft {
  return {
    version: 1,
    savedAt: new Date().toISOString(),
    currentStepId: state.currentStepId,
    unlockedStepCount: state.unlockedStepCount,
    observedAt: state.observedAt,
    notes: state.notes,
    stockView: state.stockView,
    rows: state.rows,
    recordOrderExpectedArrivalDate: state.recordOrderExpectedArrivalDate,
    recordOrderLeadTimeMeanDays: state.recordOrderLeadTimeMeanDays,
    recordOrderLeadTimeVariability: state.recordOrderLeadTimeVariability,
    retailSalesChoice: state.retailSalesChoice,
    serviceSalesChoice: state.serviceSalesChoice,
    retailSalesDrafts: state.retailSalesDrafts,
    serviceSalesDrafts: state.serviceSalesDrafts,
    skuSignalDrafts: state.skuSignalDrafts,
    stockStepChoices: state.stockStepChoices,
    serviceSignalDrafts: state.serviceSignalDrafts,
    regimeHint: state.regimeHint,
    serviceRankings: state.serviceRankings,
    retailRankings: state.retailRankings,
  };
}

function writeStockUpdateDraft(state: StockUpdateDraftState, draftStorageKey: string) {
  if (!canUseBrowserStorage() || !state.catalog) {
    return false;
  }
  if (!hasMeaningfulStockUpdateChanges(state)) {
    removeStockUpdateDraft(draftStorageKey);
    return false;
  }
  window.localStorage.setItem(draftStorageKey, JSON.stringify(buildStockUpdateDraft(state)));
  return true;
}

function buildFullObservationPayload({
  currency,
  editSession,
  notes,
  observedAtIso,
  regimeHint,
  retailRankings,
  rows,
  serviceRankings,
  serviceSignalDrafts,
  skuSignalDrafts,
  usdToKhrExchangeRate,
  catalog,
  stockBySku,
}: {
  currency: 'USD' | 'KHR';
  editSession: EditSessionState;
  notes: string;
  observedAtIso: string | null;
  regimeHint: SenaObservationRegimeHint | '';
  retailRankings: string[];
  rows: StockRow[];
  serviceRankings: string[];
  serviceSignalDrafts: Record<string, ServiceSignalDraft>;
  skuSignalDrafts: Record<string, SkuSignalDraft>;
  usdToKhrExchangeRate: number;
  catalog: SenaCatalog | null;
  stockBySku: Map<string, SenaStockSnapshot>;
}) {
  const payload = createEmptyObservationInput({
    observedAt: observedAtIso ?? new Date().toISOString(),
    notes: notes.trim() || null,
  });
  payload.stockSnapshot = rows
    .filter((row) => shouldIncludeStockRowInEditPayload({ editSession, row, stockBySku }))
    .map((row) => ({
      skuId: row.skuId,
      unitsInStock: row.unitsInStock,
      costPerUnit: row.costPerUnit,
      productPrice: row.productPrice,
    }));
  payload.serviceRankings = serviceRankings;
  payload.retailRankings = retailRankings;
  payload.orderSignals = Object.entries(skuSignalDrafts).flatMap(([skuId, draft]) => {
    const nextSignals = [];
    if (draft.orderEnabled) {
      nextSignals.push({
        skuId,
        orderPlaced: true,
        receiptArrived: false,
        approximateOrderQuantity: draft.orderedQuantity.trim() === '' ? null : Number(draft.orderedQuantity),
        approximateReceiptQuantity: null,
      });
    }
    if (draft.receiptEnabled) {
      nextSignals.push({
        skuId,
        orderPlaced: false,
        receiptArrived: true,
        approximateOrderQuantity: null,
        approximateReceiptQuantity: draft.receiptQuantity.trim() === '' ? null : Number(draft.receiptQuantity),
      });
    }
    return nextSignals;
  });
  payload.servicePrices = Object.entries(serviceSignalDrafts)
    .filter(([, draft]) => draft.priceEnabled)
    .map(([serviceId, draft]) => ({
      serviceId,
      price: usdMoneyFromDisplay(Number(draft.price), currency, usdToKhrExchangeRate),
    }));
  payload.retailPrices = [];
  payload.retailStockouts = Object.entries(skuSignalDrafts)
    .filter(([skuId, draft]) => draft.blockedEnabled && Boolean(catalog?.skus.find((sku) => sku.skuId === skuId)?.soldAsProduct))
    .map(([skuId]) => skuId);
  payload.serviceStockouts = Object.entries(serviceSignalDrafts)
    .filter(([, draft]) => draft.blockedEnabled)
    .map(([serviceId]) => serviceId);
  payload.adjustmentSignals = [];
  payload.regimeHint = regimeHint || null;
  return payload;
}

const tableDebugTrackClassName = '[&>*]:outline [&>*]:outline-1 [&>*]:outline-rose-500/50 [&>*]:outline-offset-[-1px]';
const tableDebugFlushClassName = 'outline outline-1 outline-amber-500/40 outline-offset-[-1px]';

function latestStockBySku(catalog: SenaCatalog | null, observations: ReturnType<typeof useInventory>['observations']) {
  const latest = [...observations].sort(
    (left, right) => new Date(right.input.observedAt).getTime() - new Date(left.input.observedAt).getTime(),
  );
  const stockBySku = new Map<string, SenaStockSnapshot>();
  for (const observation of latest) {
    for (const snapshot of observation.input.stockSnapshot) {
      if (!stockBySku.has(snapshot.skuId)) {
        stockBySku.set(snapshot.skuId, snapshot);
      }
    }
  }
  return new Map(
    (catalog?.skus ?? []).map((sku) => [
      sku.skuId,
      stockBySku.get(sku.skuId) ?? {
        skuId: sku.skuId,
        unitsInStock: 0,
        costPerUnit: sku.costPerUnit,
        productPrice: sku.productPrice,
      },
    ]),
  );
}

function latestCountedAtBySku(observations: ReturnType<typeof useInventory>['observations']) {
  const values = new Map<string, string>();
  const latest = [...observations].sort(
    (left, right) => new Date(right.input.observedAt).getTime() - new Date(left.input.observedAt).getTime(),
  );
  for (const observation of latest) {
    for (const snapshot of observation.input.stockSnapshot) {
      if (!values.has(snapshot.skuId)) {
        values.set(snapshot.skuId, observation.input.observedAt);
      }
    }
  }
  return values;
}

function latestRetailSalesBySku(catalog: SenaCatalog | null, observations: ReturnType<typeof useInventory>['observations']) {
  const values = new Map<string, number>();
  const latest = [...observations].sort(
    (left, right) => new Date(right.input.observedAt).getTime() - new Date(left.input.observedAt).getTime(),
  );
  for (const observation of latest) {
    for (const snapshot of observation.input.retailSalesSnapshot ?? []) {
      if (!values.has(snapshot.skuId)) {
        values.set(snapshot.skuId, snapshot.unitsSold);
      }
    }
  }
  return new Map((catalog?.skus ?? []).filter((sku) => sku.soldAsProduct).map((sku) => [sku.skuId, values.get(sku.skuId) ?? null]));
}

function latestRetailSalesAtBySku(observations: ReturnType<typeof useInventory>['observations']) {
  const values = new Map<string, string>();
  const latest = [...observations].sort(
    (left, right) => new Date(right.input.observedAt).getTime() - new Date(left.input.observedAt).getTime(),
  );
  for (const observation of latest) {
    for (const snapshot of observation.input.retailSalesSnapshot ?? []) {
      if (!values.has(snapshot.skuId)) {
        values.set(snapshot.skuId, observation.input.observedAt);
      }
    }
  }
  return values;
}

function latestServiceSalesByService(catalog: SenaCatalog | null, observations: ReturnType<typeof useInventory>['observations']) {
  const values = new Map<string, number>();
  const latest = [...observations].sort(
    (left, right) => new Date(right.input.observedAt).getTime() - new Date(left.input.observedAt).getTime(),
  );
  for (const observation of latest) {
    for (const snapshot of observation.input.serviceSalesSnapshot ?? []) {
      if (!values.has(snapshot.serviceId)) {
        values.set(snapshot.serviceId, snapshot.unitsSold);
      }
    }
  }
  return new Map((catalog?.services ?? []).map((service) => [service.serviceId, values.get(service.serviceId) ?? null]));
}

function latestServiceSalesAtByService(observations: ReturnType<typeof useInventory>['observations']) {
  const values = new Map<string, string>();
  const latest = [...observations].sort(
    (left, right) => new Date(right.input.observedAt).getTime() - new Date(left.input.observedAt).getTime(),
  );
  for (const observation of latest) {
    for (const snapshot of observation.input.serviceSalesSnapshot ?? []) {
      if (!values.has(snapshot.serviceId)) {
        values.set(snapshot.serviceId, observation.input.observedAt);
      }
    }
  }
  return values;
}

function latestOrderQuantityBySku(catalog: SenaCatalog | null, observations: ReturnType<typeof useInventory>['observations']) {
  const values = new Map<string, number>();
  const latest = [...observations].sort(
    (left, right) => new Date(right.input.observedAt).getTime() - new Date(left.input.observedAt).getTime(),
  );
  for (const observation of latest) {
    for (const signal of observation.input.orderSignals) {
      if (signal.orderPlaced && signal.approximateOrderQuantity != null && !values.has(signal.skuId)) {
        values.set(signal.skuId, signal.approximateOrderQuantity);
      }
    }
  }
  return new Map((catalog?.skus ?? []).map((sku) => [sku.skuId, values.get(sku.skuId) ?? null]));
}

function latestOrderAtBySku(observations: ReturnType<typeof useInventory>['observations']) {
  const values = new Map<string, string>();
  const latest = [...observations].sort(
    (left, right) => new Date(right.input.observedAt).getTime() - new Date(left.input.observedAt).getTime(),
  );
  for (const observation of latest) {
    for (const signal of observation.input.orderSignals) {
      if (signal.orderPlaced && signal.approximateOrderQuantity != null && !values.has(signal.skuId)) {
        values.set(signal.skuId, signal.placementTimestamp ?? observation.input.observedAt);
      }
    }
  }
  return values;
}

function reorderRecommendationBySku(workspaceSummary: ReturnType<typeof useInventory>['workspaceSummary']) {
  return new Map(
    (workspaceSummary?.skuSummaries ?? []).map((summary) => {
      const recommendation = summary.reorderQuantity?.recommendationIssued
        ? summary.reorderQuantity.recommendedUnits
        : summary.reorderQuantity?.ungatedRecommendedUnits ?? 0;
      return [summary.skuId, recommendation];
    }),
  );
}

function leadTimeMeanBySku(catalog: SenaCatalog | null, workspaceSummary: ReturnType<typeof useInventory>['workspaceSummary']) {
  const summaryMap = new Map((workspaceSummary?.skuSummaries ?? []).map((summary) => [summary.skuId, summary]));
  return new Map(
    (catalog?.skus ?? []).map((sku) => [sku.skuId, summaryMap.get(sku.skuId)?.leadTimeMeanDays ?? sku.leadTimeMeanDaysHint ?? null]),
  );
}

function leadTimeVariabilityBySku(catalog: SenaCatalog | null, workspaceSummary: ReturnType<typeof useInventory>['workspaceSummary']) {
  const summaryMap = new Map((workspaceSummary?.skuSummaries ?? []).map((summary) => [summary.skuId, summary]));
  return new Map(
    (catalog?.skus ?? []).map((sku) => {
      const mean = summaryMap.get(sku.skuId)?.leadTimeMeanDays ?? sku.leadTimeMeanDaysHint ?? null;
      const std = summaryMap.get(sku.skuId)?.leadTimeStdDays ?? sku.leadTimeStdDaysHint ?? null;
      const range = mean != null && std != null ? impliedLeadTimeRangeFromMeanStd(mean, std) : null;
      return [sku.skuId, classifyLeadTimeVariability(range ? (range.highDays - range.lowDays) / Math.max((range.highDays + range.lowDays) / 2, 0.5) : null)];
    }),
  );
}

function buildInitialRows(catalog: SenaCatalog | null, observations: ReturnType<typeof useInventory>['observations']) {
  const stockBySku = latestStockBySku(catalog, observations);
  return (catalog?.skus ?? []).map<StockRow>((sku) => ({
    ...(stockBySku.get(sku.skuId) ?? {
      skuId: sku.skuId,
      unitsInStock: 0,
      costPerUnit: sku.costPerUnit,
      productPrice: sku.productPrice,
    }),
  }));
}

function createDefaultStockStepChoices(): Record<OptionalStockStepId, OptionalStockStepChoice> {
  return {
    'stock-cost': 'unset',
    'stock-price': 'unset',
    'stock-flags': 'unset',
  };
}

function stockCostChanged(catalog: SenaCatalog | null, stockBySku: Map<string, SenaStockSnapshot>, row: StockRow) {
  const baseline = baselineStockRow(catalog, stockBySku, row.skuId);
  if (!baseline) {
    return false;
  }
  return baseline.costPerUnit !== row.costPerUnit;
}

function stockRetailPriceChanged(catalog: SenaCatalog | null, stockBySku: Map<string, SenaStockSnapshot>, row: StockRow) {
  const baseline = baselineStockRow(catalog, stockBySku, row.skuId);
  if (!baseline) {
    return false;
  }
  return baseline.productPrice !== row.productPrice;
}

function changedRowCount(
  rows: StockRow[],
  predicate: (row: StockRow) => boolean,
) {
  return rows.reduce((count, row) => count + (predicate(row) ? 1 : 0), 0);
}

function buildDraftsFromObservationInput({
  baselineRows,
  catalog,
  currency,
  input,
  stepOrder,
  usdToKhrExchangeRate,
}: {
  baselineRows: StockRow[];
  catalog: SenaCatalog;
  currency: 'USD' | 'KHR';
  input: ReturnType<typeof createEmptyObservationInput>;
  stepOrder: StockUpdateStepId[];
  usdToKhrExchangeRate: number;
}) {
  const rowsBySkuId = new Map(baselineRows.map((row) => [row.skuId, row]));
  const leadTimeHintsBySkuId = new Map(input.leadTimeHints.map((hint) => [hint.skuId, hint]));
  for (const snapshot of input.stockSnapshot) {
    rowsBySkuId.set(snapshot.skuId, {
      skuId: snapshot.skuId,
      unitsInStock: snapshot.unitsInStock,
      costPerUnit: snapshot.costPerUnit,
      productPrice: snapshot.productPrice,
    });
  }

  const skuSignalDrafts: Record<string, SkuSignalDraft> = {};
  for (const signal of input.orderSignals) {
    const existing = skuSignalDrafts[signal.skuId] ?? createEmptySkuSignalDraft();
    skuSignalDrafts[signal.skuId] = {
      ...existing,
      orderEnabled: existing.orderEnabled || signal.orderPlaced,
      orderedQuantity:
        signal.orderPlaced && signal.approximateOrderQuantity != null
          ? String(signal.approximateOrderQuantity)
          : existing.orderedQuantity,
      leadTimeMeanDays:
        signal.orderPlaced && signal.leadTimeDaysHint != null
          ? String(signal.leadTimeDaysHint)
          : existing.leadTimeMeanDays,
      expectedArrivalDate:
        signal.orderPlaced && signal.receiptTimestamp
          ? dateInputValue(signal.receiptTimestamp)
          : existing.expectedArrivalDate,
      receiptEnabled: existing.receiptEnabled || signal.receiptArrived,
      receiptQuantity:
        signal.receiptArrived && signal.approximateReceiptQuantity != null
          ? String(signal.approximateReceiptQuantity)
          : existing.receiptQuantity,
    };
  }
  for (const skuId of input.retailStockouts) {
    skuSignalDrafts[skuId] = {
      ...(skuSignalDrafts[skuId] ?? createEmptySkuSignalDraft()),
      blockedEnabled: true,
      blockedState: 'stockout',
    };
  }
  for (const [skuId, hint] of leadTimeHintsBySkuId) {
    const existing = skuSignalDrafts[skuId] ?? createEmptySkuSignalDraft();
    skuSignalDrafts[skuId] = {
      ...existing,
      leadTimeMeanDays:
        hint.typicalDays != null && existing.leadTimeMeanDays === ''
          ? String(hint.typicalDays)
          : existing.leadTimeMeanDays,
      leadTimeVariability: hint.variabilityClass ?? existing.leadTimeVariability,
    };
  }
  const firstOrderSignal = input.orderSignals.find((signal) => signal.orderPlaced) ?? null;
  const firstLeadTimeHint = input.leadTimeHints[0] ?? null;
  const recordOrderExpectedArrivalDate = firstOrderSignal?.receiptTimestamp
    ? dateInputValue(firstOrderSignal.receiptTimestamp)
    : '';
  const recordOrderLeadTimeMeanDays =
    firstOrderSignal?.leadTimeDaysHint != null
      ? String(firstOrderSignal.leadTimeDaysHint)
      : firstLeadTimeHint?.typicalDays != null
        ? String(firstLeadTimeHint.typicalDays)
        : '';
  const recordOrderLeadTimeVariability = firstLeadTimeHint?.variabilityClass ?? '';

  const serviceSignalDrafts: Record<string, ServiceSignalDraft> = {};
  for (const servicePrice of input.servicePrices) {
    serviceSignalDrafts[servicePrice.serviceId] = {
      ...(serviceSignalDrafts[servicePrice.serviceId] ?? createEmptyServiceSignalDraft()),
      priceEnabled: true,
      price: String(displayMoneyFromUsd(servicePrice.price, currency, usdToKhrExchangeRate)),
    };
  }
  for (const serviceId of input.serviceStockouts) {
    serviceSignalDrafts[serviceId] = {
      ...(serviceSignalDrafts[serviceId] ?? createEmptyServiceSignalDraft()),
      blockedEnabled: true,
      blockedState: 'stockout',
    };
  }

  const retailSkuIds = new Set(catalog.skus.filter((sku) => sku.soldAsProduct).map((sku) => sku.skuId));
  const retailSalesDrafts = Object.fromEntries(
    (input.retailSalesSnapshot ?? []).map((snapshot) => [snapshot.skuId, String(snapshot.unitsSold)]),
  ) as SalesCountDrafts;
  const serviceSalesDrafts = Object.fromEntries(
    (input.serviceSalesSnapshot ?? []).map((snapshot) => [snapshot.serviceId, String(snapshot.unitsSold)]),
  ) as SalesCountDrafts;
  const baselineRowIds = new Set(baselineRows.map((row) => row.skuId));
  const appendedRows = input.stockSnapshot
    .filter((snapshot) => !baselineRowIds.has(snapshot.skuId))
    .map<StockRow>((snapshot) => ({
      skuId: snapshot.skuId,
      unitsInStock: snapshot.unitsInStock,
      costPerUnit: snapshot.costPerUnit,
      productPrice: snapshot.productPrice,
    }));

  return {
    currentStepId: (
      stepOrder.includes('stock')
        ? 'stock'
        : stepOrder.includes('reorder')
          ? 'reorder'
          : stepOrder.includes('retail-sales')
            ? 'retail-sales'
            : 'observed-at'
    ) as StockUpdateStepId,
    unlockedStepCount: stepOrder.length,
    observedAt: localDateTimeInputValue(input.observedAt),
    notes: input.notes ?? '',
    stockView: 'counted' as const,
    rows: [...baselineRows.map((row) => rowsBySkuId.get(row.skuId) ?? row), ...appendedRows],
    recordOrderExpectedArrivalDate,
    recordOrderLeadTimeMeanDays,
    recordOrderLeadTimeVariability,
    retailSalesChoice:
      Object.keys(retailSalesDrafts).length > 0 ? 'yes' : input.retailRankings.length > 0 ? 'no' : 'unset',
    serviceSalesChoice:
      Object.keys(serviceSalesDrafts).length > 0 ? 'yes' : input.serviceRankings.length > 0 ? 'no' : 'unset',
    retailSalesDrafts,
    serviceSalesDrafts,
    skuSignalDrafts,
    stockStepChoices: {
      'stock-cost': appendedRows.length > 0 || baselineRows.some((row) => {
        const nextRow = rowsBySkuId.get(row.skuId) ?? row;
        return nextRow.costPerUnit !== row.costPerUnit;
      }) ? 'yes' : 'unset',
      'stock-price': appendedRows.some((row) => row.productPrice != null) || baselineRows.some((row) => {
        const nextRow = rowsBySkuId.get(row.skuId) ?? row;
        return nextRow.productPrice !== row.productPrice;
      }) ? 'yes' : 'unset',
      'stock-flags': anySkuFlags(skuSignalDrafts) ? 'yes' : 'unset',
    },
    serviceSignalDrafts,
    regimeHint: input.regimeHint ?? '',
    serviceRankings: input.serviceRankings.filter((serviceId) =>
      catalog.services.some((service) => service.serviceId === serviceId),
    ),
    retailRankings: input.retailRankings.filter((skuId) => retailSkuIds.has(skuId)),
  };
}

function shouldIncludeStockRowInEditPayload({
  editSession,
  row,
  stockBySku,
}: {
  editSession: EditSessionState;
  row: StockRow;
  stockBySku: Map<string, SenaStockSnapshot>;
}) {
  const originalRow = editSession.input.stockSnapshot.find((snapshot) => snapshot.skuId === row.skuId) ?? null;
  const liveBaseline = stockBySku.get(row.skuId) ?? null;
  if (originalRow) {
    return true;
  }

  return (
    liveBaseline == null ||
    row.unitsInStock !== liveBaseline.unitsInStock ||
    row.costPerUnit !== liveBaseline.costPerUnit ||
    row.productPrice !== liveBaseline.productPrice
  );
}

function baselineStockRow(
  catalog: SenaCatalog | null,
  stockBySku: Map<string, SenaStockSnapshot>,
  skuId: string,
) {
  const sku = catalog?.skus.find((entry) => entry.skuId === skuId);
  if (!sku) {
    return null;
  }
  return (
    stockBySku.get(skuId) ?? {
      skuId,
      unitsInStock: 0,
      costPerUnit: sku.costPerUnit,
      productPrice: sku.productPrice,
    }
  );
}

function stockRowChanged(
  catalog: SenaCatalog | null,
  stockBySku: Map<string, SenaStockSnapshot>,
  row: StockRow,
) {
  const baseline = baselineStockRow(catalog, stockBySku, row.skuId);
  if (!baseline) {
    return false;
  }
  return (
    row.unitsInStock !== baseline.unitsInStock ||
    row.costPerUnit !== baseline.costPerUnit ||
    row.productPrice !== baseline.productPrice
  );
}

function buildRankingEntries(ids: string[], entryType: RankingEntryType) {
  return ids.map<RankingEntry>((entryId, position) => ({
    entryType,
    entryId,
    position,
  }));
}

function reorderIdsFromEntries(entries: RankingEntry[]) {
  return [...entries].sort((left, right) => left.position - right.position).map((entry) => entry.entryId);
}

function reorderStringIds(ids: string[], activeId: string, overId: string) {
  if (activeId === overId) {
    return ids;
  }
  const oldIndex = ids.indexOf(activeId);
  const newIndex = ids.indexOf(overId);
  if (oldIndex === -1 || newIndex === -1 || oldIndex === newIndex) {
    return ids;
  }
  return arrayMove(ids, oldIndex, newIndex);
}

function buildRankingSnapshot({
  catalog,
  entryType,
  rankedIds,
}: {
  catalog: SenaCatalog | null;
  entryType: RankingEntryType;
  rankedIds: string[];
}): InventorySnapshot {
  const services = (catalog?.services ?? []).map((service) => ({
    serviceId: service.serviceId,
    name: service.name,
    description: service.description,
    price: service.price,
    skuIds: (catalog?.sharingMask ?? []).filter((entry) => entry.enabled && entry.serviceId === service.serviceId).map((entry) => entry.skuId),
  }));
  const skus = (catalog?.skus ?? []).map((sku) => ({
    skuId: sku.skuId,
    name: sku.name,
    description: sku.description,
    unitsInStock: 0,
    costPerUnit: sku.costPerUnit,
    soldAsProduct: sku.soldAsProduct,
    productPrice: sku.productPrice,
    leadTimeMeanDays: sku.leadTimeMeanDaysHint,
    leadTimeStdDays: sku.leadTimeStdDaysHint,
  }));

  return {
    services,
    skus,
    ranking: buildRankingEntries(rankedIds, entryType),
    sist: EMPTY_SIST_OVERVIEW,
  };
}

function RankingSignalEditor({
  catalog,
  entryType,
  label,
  onChange,
  seedValues,
  values,
}: {
  catalog: SenaCatalog | null;
  entryType: RankingEntryType;
  label: string;
  onChange: (values: string[]) => void;
  seedValues: string[];
  values: string[];
}) {
  const { t } = usePreferences();
  const displayedValues = values.length > 0 ? values : seedValues;
  const rankingTooltip =
    entryType === 'service'
      ? t('stockUpdateTopServicesLabel')
      : t('stockUpdateTopRetailItemsLabel');
  const snapshot = useMemo(
    () => buildRankingSnapshot({ catalog, entryType, rankedIds: displayedValues }),
    [catalog, displayedValues, entryType],
  );
  const eligibleItemCount = useMemo(
    () =>
      entryType === 'service'
        ? snapshot.services.length
        : snapshot.skus.filter((sku) => sku.soldAsProduct && sku.productPrice !== null).length,
    [entryType, snapshot.services.length, snapshot.skus],
  );
  const entries = useMemo(() => buildRankingEntries(displayedValues, entryType), [displayedValues, entryType]);
  const rankChangeByEntryKey = useMemo(
    () =>
      buildRankChangeByEntryKey({
        displayedIds: displayedValues,
        entryType,
        seedIds: seedValues,
        valuesActive: values.length > 0,
      }),
    [displayedValues, entryType, seedValues, values.length],
  );

  return (
    <div className="grid gap-5">
      <div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-foreground">
            <SectionLabel tooltip={rankingTooltip} tooltipLabel={`${label} details`}>{label}</SectionLabel>
          </p>
          <p className="mt-1 text-sm text-muted-foreground">{t('stockUpdateRankingOptional')}</p>
          {eligibleItemCount === 0 ? (
            <p className="mt-2 text-sm text-muted-foreground">
              {t(entryType === 'service' ? 'stockUpdateNoServicesRankingHelper' : 'stockUpdateNoRetailRankingHelper')}
            </p>
          ) : null}
        </div>
        {values.length > 0 ? (
          <Button type="button" variant="ghost" onClick={() => onChange([])}>
            <ActionUndoIcon className="size-4" />
            {t('stockUpdateClearRanking')}
          </Button>
        ) : null}
      </div>
      {eligibleItemCount > 0 ? (
        <MerchandisingEditor
          entries={entries}
          rankChangeByEntryKey={rankChangeByEntryKey}
          snapshot={snapshot}
          titleLabel={label}
          onChange={(nextEntries) => onChange(reorderIdsFromEntries(nextEntries))}
        />
      ) : null}
    </div>
  );
}

function FlagActionMenu({
  actions,
  label,
}: {
  actions: Array<{ key: string; label: string; icon: ReactNode; onSelect: () => void }>;
  label: string;
}) {
  return (
    <div className="flex justify-end">
      <AnchoredMenu
        label={label}
        triggerIcon={<EntityFlagIcon className="size-4" />}
      >
        {(closeMenu) =>
          actions.map((action) => (
            <button
              key={action.key}
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-foreground transition-colors hover:bg-accent"
              role="menuitem"
              type="button"
              onClick={() => {
                action.onSelect();
                closeMenu();
              }}
            >
              <span className="text-muted-foreground">{action.icon}</span>
              {action.label}
            </button>
          ))
        }
      </AnchoredMenu>
    </div>
  );
}

function FlagSection({
  children,
  label,
  removeLabel,
  onRemove,
}: {
  children: ReactNode;
  label: string;
  removeLabel: string;
  onRemove: () => void;
}) {
  return (
    <div className="grid min-w-0 grid-cols-[8.5rem_minmax(0,12rem)_auto] items-center gap-2 border-b border-border/60 py-3 last:border-b-0 last:pb-0 first:pt-0">
      <p className="shrink-0 whitespace-nowrap text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">{label}</p>
      {children}
      <Button
        aria-label={removeLabel}
        size="icon-sm"
        type="button"
        variant="destructive-outline"
        onClick={onRemove}
      >
        <ActionDeleteIcon className="size-4" />
      </Button>
    </div>
  );
}

const recordUpdateInputClassName = 'bg-input/30 text-left shadow-none';
const recordUpdateSelectTriggerClassName = 'bg-input/30 shadow-none';
const flagControlClassName = `min-w-0 w-full max-w-[12rem] ${recordUpdateInputClassName}`;
const discardChangesButtonClassName = 'hover:bg-destructive/12 hover:text-destructive focus-visible:ring-destructive/20';

function StockSkuSummaryCell({
  skuName,
}: {
  skuName: string;
}) {
  return (
    <div className="min-w-0">
      <span className="block font-medium text-foreground">{skuName}</span>
    </div>
  );
}

function StockLatestUnitsCell({
  countedAtBySku,
  row,
  stockBySku,
}: {
  countedAtBySku: Map<string, string>;
  row: StockRow;
  stockBySku: Map<string, SenaStockSnapshot>;
}) {
  const { t } = usePreferences();
  const latestCountedAt = countedAtBySku.get(row.skuId);
  const latestStock = stockBySku.get(row.skuId);

  return (
    <div className="min-w-0">
      <span className="block font-medium text-foreground">{t('stockUpdateLatestUnitsValue', { count: latestStock?.unitsInStock ?? 0 })}</span>
      <span className="mt-2 block text-sm leading-6 text-muted-foreground">
        {latestCountedAt
          ? t('stockUpdateAsOfDate', { date: formatSenaLongDate(latestCountedAt, 'en') })
          : t('stockUpdateNotCounted')}
      </span>
    </div>
  );
}

function StockLatestMoneyCell({
  countedAtBySku,
  latestValue,
  skuId,
}: {
  countedAtBySku: Map<string, string>;
  latestValue: number | null | undefined;
  skuId: string;
}) {
  const { currency, language, t, usdToKhrExchangeRate } = usePreferences();
  const latestCountedAt = countedAtBySku.get(skuId);

  return (
    <div className="min-w-0">
      <span className="block font-medium text-foreground">
        {latestValue == null ? t('stockUpdateNoMoneyValue') : formatCurrency(latestValue, currency, language, usdToKhrExchangeRate)}
      </span>
      <span className="mt-2 block text-sm leading-6 text-muted-foreground">
        {latestCountedAt
          ? t('stockUpdateAsOfDate', { date: formatSenaLongDate(latestCountedAt, 'en') })
          : t('stockUpdateNotCounted')}
      </span>
    </div>
  );
}

function ServiceSummaryCell({
  serviceName,
}: {
  serviceName: string;
}) {
  return (
    <div className="min-w-0">
      <span className="block font-medium text-foreground">{serviceName}</span>
    </div>
  );
}

function SalesLatestCountCell({
  countLabel,
  latestAt,
  latestValue,
}: {
  countLabel: string;
  latestAt: string | null | undefined;
  latestValue: number | null | undefined;
}) {
  const { t } = usePreferences();

  return (
    <div className="min-w-0">
      <span className="block font-medium text-foreground">
        {latestValue == null ? translateUiLiteral('en', 'No prior count') : `${latestValue} ${countLabel}`}
      </span>
      <span className="mt-2 block text-sm leading-6 text-muted-foreground">
        {latestAt
          ? t('stockUpdateAsOfDate', { date: formatSenaLongDate(latestAt, 'en') })
          : translateUiLiteral('en', 'not counted')}
      </span>
    </div>
  );
}

function orderDraftHasContent(draft: SkuSignalDraft | undefined) {
  return draft?.orderedQuantity.trim() !== '';
}

function LastOrderCell({
  latestAt,
  latestValue,
}: {
  latestAt: string | null | undefined;
  latestValue: number | null | undefined;
}) {
  const { t } = usePreferences();

  return (
    <div className="min-w-0">
      <span className="block font-medium text-foreground">
        {latestValue == null ? translateUiLiteral('en', 'No prior order') : translateUiLiteral('en', '{count} units', { count: latestValue })}
      </span>
      <span className="mt-2 block text-sm leading-6 text-muted-foreground">
        {latestAt
          ? t('stockUpdateAsOfDate', { date: formatSenaLongDate(latestAt, 'en') })
          : translateUiLiteral('en', 'not ordered')}
      </span>
    </div>
  );
}

const leadTimeVariabilityIcons: Record<SenaLeadTimeVariabilityClass, IconComponent> = {
  very_tight: StatusReadyIcon,
  tight: StatusTimingIcon,
  normal: StatusGaugeIcon,
  wide: StatusScheduleIcon,
  very_wide: StatusWarningIcon,
};

function RecordOrderTimingFields({
  expectedArrivalValue,
  expectedArrivalPlaceholder,
  leadTimeMeanValue,
  leadTimeMeanPlaceholder,
  onExpectedArrivalChange,
  onLeadTimeMeanChange,
  onVariabilityChange,
  variabilityPlaceholder,
  variabilityValue,
}: {
  expectedArrivalValue: string;
  expectedArrivalPlaceholder: string;
  leadTimeMeanValue: string;
  leadTimeMeanPlaceholder: string;
  onExpectedArrivalChange: (value: string) => void;
  onLeadTimeMeanChange: (value: string) => void;
  onVariabilityChange: (value: SenaLeadTimeVariabilityClass | '') => void;
  variabilityPlaceholder: SenaLeadTimeVariabilityClass | '';
  variabilityValue: SenaLeadTimeVariabilityClass | '';
}) {
  const { language } = usePreferences();
  const expectedArrivalId = 'record-order-expected-arrival';
  const leadTimeMeanId = 'record-order-lead-time-mean';
  const leadTimeVariabilityId = 'record-order-lead-time-variability';
  const selectedVariabilityValue = variabilityValue || variabilityPlaceholder || leadTimeVariabilityPlaceholderValue;

  return (
    <div className="grid gap-3">
      <div className="grid gap-3 xl:grid-cols-3">
        <div className="min-w-0">
          <RecordUpdateFieldLabel htmlFor={leadTimeMeanId}>
            {translateUiLiteral('en', 'Lead time mean')}
          </RecordUpdateFieldLabel>
          <Input
            aria-label={translateUiLiteral('en', 'Lead time mean')}
            className={`w-full ${recordUpdateInputClassName}`}
            id={leadTimeMeanId}
            min="0"
            placeholder={leadTimeMeanPlaceholder}
            step="1"
            type="number"
            value={leadTimeMeanValue}
            onChange={(event) => onLeadTimeMeanChange(event.target.value)}
          />
        </div>
        <div className="min-w-0">
          <RecordUpdateFieldLabel htmlFor={leadTimeVariabilityId}>
            {translateUiLiteral('en', 'Lead time variability')}
          </RecordUpdateFieldLabel>
          <Select
            value={selectedVariabilityValue}
            onValueChange={(value) =>
              onVariabilityChange(value === leadTimeVariabilityPlaceholderValue ? '' : (value as SenaLeadTimeVariabilityClass))
            }
          >
            <SelectTrigger
              aria-label={translateUiLiteral('en', 'Lead time variability')}
              className={cn(recordUpdateSelectTriggerClassName, 'w-full justify-between')}
              id={leadTimeVariabilityId}
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {selectedVariabilityValue === leadTimeVariabilityPlaceholderValue ? (
                <SelectItem value={leadTimeVariabilityPlaceholderValue}>
                  {translateUiLiteral(language, 'Select variability')}
                </SelectItem>
              ) : null}
              {leadTimeVariabilityOptions().map((option) => (
                <SelectItem
                  className="[&_[data-slot=lead-time-description]]:text-xs [&_[data-slot=lead-time-option-copy]]:grid [&_[data-slot=lead-time-option-copy]]:gap-0.5 [&_[data-slot=lead-time-separator]]:hidden"
                  key={option}
                  value={option}
                >
                  <span className="flex min-w-0 items-center gap-2" data-slot="lead-time-option">
                    {(() => {
                      const LeadTimeVariabilityIcon = leadTimeVariabilityIcons[option];

                      return (
                        <LeadTimeVariabilityIcon
                          aria-hidden="true"
                          className="size-4 shrink-0 text-muted-foreground"
                          strokeWidth={1.8}
                        />
                      );
                    })()}
                    <span className="min-w-0 truncate" data-slot="lead-time-option-copy">
                      <span>{translateLeadTimeVariabilityLabel(language, option)}</span>
                      <span data-slot="lead-time-separator">{': '}</span>
                      <span className="text-muted-foreground" data-slot="lead-time-description">
                        {translateLeadTimeVariabilityDescription(language, option)}
                      </span>
                    </span>
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="min-w-0">
          <RecordUpdateFieldLabel htmlFor={expectedArrivalId}>
            {translateUiLiteral('en', 'Expected date of arrival')}
          </RecordUpdateFieldLabel>
          <Input
            aria-label={translateUiLiteral('en', 'Expected date of arrival')}
            className={`w-full ${recordUpdateInputClassName}`}
            id={expectedArrivalId}
            placeholder={expectedArrivalPlaceholder}
            type="date"
            value={expectedArrivalValue}
            onChange={(event) => onExpectedArrivalChange(event.target.value)}
          />
        </div>
      </div>
    </div>
  );
}

function OrderQuantityField({
  orderQuantityPlaceholder,
  orderQuantityValue,
  rowName,
  setOrderQuantity,
}: {
  orderQuantityPlaceholder: string;
  orderQuantityValue: string;
  rowName: string;
  setOrderQuantity: (value: string) => void;
}) {
  return (
    <div className="min-w-0">
      <RecordUpdateMobileLabel>{translateUiLiteral('en', 'Current order')}</RecordUpdateMobileLabel>
      <Input
        aria-label={translateUiLiteral('en', 'Current order for {name}', { name: rowName })}
        className={`w-full max-w-[18rem] ${recordUpdateInputClassName}`}
        min="0"
        placeholder={orderQuantityPlaceholder}
        step="1"
        type="number"
        value={orderQuantityValue}
        onChange={(event) => setOrderQuantity(event.target.value)}
      />
    </div>
  );
}

type RecordUpdateTableColumn = {
  header: ReactNode;
  className?: string;
  headClassName?: string;
  width?: string;
};

const recordUpdateTableHeaderClassName =
  'text-[0.72rem] font-semibold uppercase tracking-[0.18em] text-muted-foreground';
const recordUpdateTableCellClassName = 'px-6 py-5 align-middle whitespace-normal';
const recordUpdateTableHeadClassName = 'px-6 py-3 align-middle whitespace-nowrap';
const recordUpdateWhiteCardClassName = '![background:white]';
const recordUpdateWhiteCardStyle = { background: 'white' } satisfies CSSProperties;

function RecordUpdateTable({
  children,
  columns,
  testId,
}: {
  children: ReactNode;
  columns: RecordUpdateTableColumn[];
  testId?: string;
}) {
  return (
    <div className="-mx-6 overflow-x-auto bg-white">
      <Table className="min-w-[760px] table-fixed bg-white">
        <colgroup>
          {columns.map((column, index) => (
            <col key={index} style={column.width ? { width: column.width } : undefined} />
          ))}
        </colgroup>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            {columns.map((column, index) => (
              <TableHead
                aria-hidden={column.header == null ? true : undefined}
                className={cn(recordUpdateTableHeadClassName, recordUpdateTableHeaderClassName, column.className, column.headClassName)}
                key={index}
              >
                {column.header}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody data-testid={testId}>
          {children}
        </TableBody>
      </Table>
    </div>
  );
}

function RecordUpdateMobileLabel({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <p className={cn(recordUpdateTableHeaderClassName, 'mb-1 xl:hidden')}>
      {children}
    </p>
  );
}

function RecordUpdateFieldLabel({
  children,
  htmlFor,
}: {
  children: ReactNode;
  htmlFor?: string;
}) {
  return (
    <label className={cn(recordUpdateTableHeaderClassName, 'mb-2 block')} htmlFor={htmlFor}>
      {children}
    </label>
  );
}

function OptionalStockDecisionCard({
  choice,
  helper,
  onNo,
  onYes,
  question,
}: {
  choice: OptionalStockStepChoice;
  helper: string;
  onNo: () => void;
  onYes: () => void;
  question: string;
}) {
  const { t } = usePreferences();

  return (
    <div className="grid justify-items-center gap-4 py-5 text-center">
      <div className="grid max-w-[34rem] gap-1">
        <p className="text-sm font-medium text-foreground">{question}</p>
        <p className="text-sm text-muted-foreground">{helper}</p>
      </div>
      <div className="flex items-center justify-center gap-2">
        <Button type="button" variant={choice === 'yes' ? 'default' : 'outline'} onClick={onYes}>
          {t('stockUpdateOptionalStepYes')}
        </Button>
        <Button type="button" variant={choice === 'no' ? 'secondary' : 'outline'} onClick={onNo}>
          {t('stockUpdateOptionalStepNo')}
        </Button>
      </div>
    </div>
  );
}

type SortableStockTableRowConfig = {
  cells: ReactNode[];
  dragLabel: string;
  highlight?: boolean;
  inputCellIndexes: number[];
};

function StockReorderHint() {
  const { t } = usePreferences();

  return (
    <p className="text-sm text-muted-foreground">
      {t('stockUpdateStockRowOrderHint')}
    </p>
  );
}

function SortableStockTable({
  bodyTestId,
  debugCellBoundaries,
  columns,
  renderRow,
  rows,
  onReorderRows,
}: {
  bodyTestId?: string;
  debugCellBoundaries: boolean;
  columns: RecordUpdateTableColumn[];
  renderRow: (row: StockRow) => SortableStockTableRowConfig;
  rows: StockRow[];
  onReorderRows: (activeSkuId: string, overSkuId: string) => void;
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 6,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );
  const debugTrackClassName = debugCellBoundaries ? tableDebugTrackClassName : '';
  const debugFlushClassName = debugCellBoundaries ? tableDebugFlushClassName : '';

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over) {
      return;
    }

    onReorderRows(String(active.id), String(over.id));
  }

  return (
    <DndContext collisionDetection={closestCenter} onDragEnd={handleDragEnd} sensors={sensors}>
      <RecordUpdateTable columns={columns} testId={bodyTestId}>
        <SortableContext items={rows.map((row) => row.skuId)} strategy={verticalListSortingStrategy}>
          {rows.map((row) => {
            const rowConfig = renderRow(row);

            return (
              <SortableStockTableRow
                cells={rowConfig.cells}
                className={cn(debugTrackClassName, debugFlushClassName)}
                dragLabel={rowConfig.dragLabel}
                highlight={rowConfig.highlight}
                id={row.skuId}
                inputCellIndexes={rowConfig.inputCellIndexes}
                key={row.skuId}
              />
            );
          })}
        </SortableContext>
      </RecordUpdateTable>
    </DndContext>
  );
}

function SortableIdTable({
  bodyTestId,
  debugCellBoundaries,
  columns,
  ids,
  onReorderRows,
  renderRow,
}: {
  bodyTestId?: string;
  debugCellBoundaries: boolean;
  columns: RecordUpdateTableColumn[];
  ids: string[];
  onReorderRows: (activeId: string, overId: string) => void;
  renderRow: (id: string) => SortableStockTableRowConfig;
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 6,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );
  const debugTrackClassName = debugCellBoundaries ? tableDebugTrackClassName : '';
  const debugFlushClassName = debugCellBoundaries ? tableDebugFlushClassName : '';

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over) {
      return;
    }

    onReorderRows(String(active.id), String(over.id));
  }

  return (
    <DndContext collisionDetection={closestCenter} onDragEnd={handleDragEnd} sensors={sensors}>
      <RecordUpdateTable columns={columns} testId={bodyTestId}>
        <SortableContext items={ids} strategy={verticalListSortingStrategy}>
          {ids.map((id) => {
            const rowConfig = renderRow(id);

            return (
              <SortableStockTableRow
                cells={rowConfig.cells}
                className={cn(debugTrackClassName, debugFlushClassName)}
                dragLabel={rowConfig.dragLabel}
                highlight={rowConfig.highlight}
                id={id}
                inputCellIndexes={rowConfig.inputCellIndexes}
                key={id}
              />
            );
          })}
        </SortableContext>
      </RecordUpdateTable>
    </DndContext>
  );
}

function SortableStockTableRow({
  cells,
  className,
  dragLabel,
  highlight = false,
  id,
  inputCellIndexes,
}: {
  cells: ReactNode[];
  className?: string;
  dragLabel: string;
  highlight?: boolean;
  id: string;
  inputCellIndexes: number[];
}) {
  const {
    attributes,
    isDragging,
    listeners,
    setActivatorNodeRef,
    setNodeRef,
    transform,
    transition,
  } = useSortable({ id });
  const inputIndexSet = new Set(inputCellIndexes);

  return (
    <TableRow
      className={cn(
        `group/row ${rowHoverClassName}`,
        className,
        highlight && 'shadow-[inset_0_0_0_1px_rgba(191,116,62,0.22)]',
        isDragging && 'relative z-10 bg-white shadow-[0_16px_40px_rgba(27,15,7,0.12)]',
      )}
      ref={setNodeRef}
      style={
        transform
          ? {
              transform: CSS.Transform.toString(transform),
              transition,
            }
          : { transition }
      }
    >
      <TableCell className={cn(recordUpdateTableCellClassName, 'w-12 px-3 text-center')}>
        <button
          {...attributes}
          {...listeners}
          aria-label={dragLabel}
          className="mx-auto flex size-8 shrink-0 touch-none items-center justify-center rounded-md text-muted-foreground transition-[background-color,color,transform,opacity] duration-150 ease-out group-hover/row:text-foreground hover:bg-accent/60 hover:text-foreground focus-visible:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 active:scale-95 active:cursor-grabbing motion-reduce:transition-none"
          ref={setActivatorNodeRef}
          type="button"
        >
          <ActionDragHandleIcon aria-hidden="true" className="size-4 shrink-0 cursor-grab" />
        </button>
      </TableCell>
      {cells.map((cell, index) => {
        const draggable = !inputIndexSet.has(index);

        return (
          <TableCell
            key={index}
            {...(draggable ? listeners : {})}
            className={cn(recordUpdateTableCellClassName, 'min-w-0', draggable && 'cursor-grab active:cursor-grabbing')}
          >
            {cell}
          </TableCell>
        );
      })}
    </TableRow>
  );
}

function StockCountStep({
  catalog,
  countedAtBySku,
  debugCellBoundaries,
  rows,
  guidance,
  onReorderRows,
  stockBySku,
  updateRow,
  visibleRows,
}: {
  catalog: SenaCatalog | null;
  countedAtBySku: Map<string, string>;
  debugCellBoundaries: boolean;
  guidance?: string | null;
  onReorderRows: (activeSkuId: string, overSkuId: string) => void;
  rows: StockRow[];
  stockBySku: Map<string, SenaStockSnapshot>;
  updateRow: (skuId: string, patch: Partial<StockRow>) => void;
  visibleRows: StockRow[];
}) {
  const { t } = usePreferences();

  return (
    <WorkspacePanel
      action={null}
      className={recordUpdateWhiteCardClassName}
      descriptor={t(STOCK_UPDATE_STEP_COPY.stock.descriptionKey)}
      style={recordUpdateWhiteCardStyle}
      title={
        <SectionLabel
          tooltip={t('stockUpdateStockStepTooltip')}
          tooltipLabel={t('stockUpdateStockStepTooltipLabel')}
        >
          {t(STOCK_UPDATE_STEP_COPY.stock.titleKey)}
        </SectionLabel>
      }
    >
      <div className="grid gap-3">
        {guidance ? <p className="text-sm text-destructive">{guidance}</p> : null}
        {(catalog?.skus ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('stockUpdateNoSkusHelper')}</p>
        ) : (
          <>
            <SortableStockTable
              bodyTestId="stock-count-list"
              debugCellBoundaries={debugCellBoundaries}
              columns={[
                {
                  header: null,
                  className: 'w-12 px-3 text-center',
                  width: '3.5rem',
                },
                { header: t('stockUpdateSkuLatestObservation'), width: '37%' },
                { header: t('stockUpdateLatestUnits'), width: '24%' },
                { header: t('stockUpdateCurrentUnits'), width: '31%' },
              ]}
              rows={visibleRows}
              onReorderRows={onReorderRows}
              renderRow={(row) => {
                const sku = catalog?.skus.find((entry) => entry.skuId === row.skuId);
                const latestUnits = stockBySku.get(row.skuId)?.unitsInStock ?? 0;
                const unitsChanged = stockRowChanged(catalog, stockBySku, row);

                return {
                  dragLabel: t('stockUpdateReorderSkuRow', { name: sku?.name ?? row.skuId }),
                  highlight: unitsChanged,
                  inputCellIndexes: [2],
                  cells: [
                    <StockSkuSummaryCell skuName={sku?.name ?? row.skuId} />,
                    <StockLatestUnitsCell countedAtBySku={countedAtBySku} row={row} stockBySku={stockBySku} />,
                    <>
                      <RecordUpdateMobileLabel>{t('stockUpdateCurrentUnits')}</RecordUpdateMobileLabel>
                      <div className="pr-3">
                        <Input
                          aria-label={t('stockUpdateCurrentUnits')}
                          className={`w-full max-w-[18rem] ${recordUpdateInputClassName}`}
                          min="0"
                          placeholder={String(latestUnits)}
                          step="1"
                          type="number"
                          value={unitsChanged ? String(row.unitsInStock) : ''}
                          onChange={(event) =>
                            updateRow(row.skuId, {
                              unitsInStock: event.target.value === '' ? latestUnits : Number(event.target.value),
                            })
                          }
                        />
                      </div>
                    </>,
                  ],
                };
              }}
            />
            <StockReorderHint />
          </>
        )}
        {(catalog?.skus ?? []).length > 0 && visibleRows.length === 0 ? (
          <p className="rounded-[1.25rem] border border-dashed border-border/70 px-4 py-5 text-sm text-muted-foreground">
            {t('stockUpdateNoSkuMatches')}
          </p>
        ) : null}
      </div>
    </WorkspacePanel>
  );
}

function StockCostStep(props: {
  catalog: SenaCatalog | null;
  choice: OptionalStockStepChoice;
  countedAtBySku: Map<string, string>;
  currency: 'USD' | 'KHR';
  debugCellBoundaries: boolean;
  guidance?: string | null;
  onReorderRows: (activeSkuId: string, overSkuId: string) => void;
  rows: StockRow[];
  stockBySku: Map<string, SenaStockSnapshot>;
  usdToKhrExchangeRate: number;
  updateRow: (skuId: string, patch: Partial<StockRow>) => void;
  visibleRows: StockRow[];
  onChooseNo: () => void;
  onChooseYes: () => void;
}) {
  const { t } = usePreferences();
  const { catalog, choice, countedAtBySku, currency, debugCellBoundaries, guidance, onReorderRows, stockBySku, usdToKhrExchangeRate, updateRow, visibleRows, onChooseNo, onChooseYes } = props;

  return (
    <WorkspacePanel
      action={null}
      className={recordUpdateWhiteCardClassName}
      descriptor={t('stockUpdateCostStepDescription')}
      style={recordUpdateWhiteCardStyle}
      title={<SectionLabel tooltip={t('stockUpdateCostStepTooltip')} tooltipLabel={t('stockUpdateCostIfChanged')}>{t('stockUpdateCostIfChanged')}</SectionLabel>}
    >
      <div className="grid gap-3">
        {guidance ? <p className="text-sm text-destructive">{guidance}</p> : null}
        <OptionalStockDecisionCard choice={choice} helper={t('stockUpdateCostStepHelper')} onNo={onChooseNo} onYes={onChooseYes} question={t('stockUpdateCostStepQuestion')} />
        {choice === 'yes' ? (
          (catalog?.skus ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">{t('stockUpdateNoSkusHelper')}</p>
          ) : (
            <>
              <SortableStockTable
                debugCellBoundaries={debugCellBoundaries}
                columns={[
                  {
                    header: null,
                    className: 'w-12 px-3 text-center',
                    width: '3.5rem',
                  },
                  { header: t('stockUpdateSkuLatestObservation'), width: '37%' },
                  { header: t('stockUpdateLatestCost'), width: '24%' },
                  { header: t('stockUpdateCurrentCost'), width: '31%' },
                ]}
                rows={visibleRows}
                onReorderRows={onReorderRows}
                renderRow={(row) => {
                  const sku = catalog?.skus.find((entry) => entry.skuId === row.skuId);
                  const latestCost = stockBySku.get(row.skuId)?.costPerUnit ?? null;
                  const costChanged = stockCostChanged(catalog, stockBySku, row);
                  const latestCostPlaceholder =
                    latestCost == null ? '' : String(displayMoneyFromUsd(latestCost, currency, usdToKhrExchangeRate));

                  return {
                    dragLabel: t('stockUpdateReorderSkuRow', { name: sku?.name ?? row.skuId }),
                    highlight: costChanged,
                    inputCellIndexes: [2],
                    cells: [
                      <StockSkuSummaryCell skuName={sku?.name ?? row.skuId} />,
                      <StockLatestMoneyCell countedAtBySku={countedAtBySku} latestValue={latestCost} skuId={row.skuId} />,
                      <>
                        <RecordUpdateMobileLabel>{t('stockUpdateCurrentCost')}</RecordUpdateMobileLabel>
                        <div className="flex justify-start pr-3">
                          <Input
                            aria-label={t('stockUpdateCurrentCost')}
                            className={`w-full max-w-[18rem] ${recordUpdateInputClassName}`}
                            min="0"
                            placeholder={latestCostPlaceholder}
                            step={moneyInputStep(currency)}
                            type="number"
                            value={costChanged && row.costPerUnit != null ? displayMoneyFromUsd(row.costPerUnit, currency, usdToKhrExchangeRate) : ''}
                            onChange={(event) =>
                              updateRow(row.skuId, {
                                costPerUnit: event.target.value ? usdMoneyFromDisplay(Number(event.target.value), currency, usdToKhrExchangeRate) : latestCost,
                              })
                            }
                          />
                        </div>
                      </>,
                    ],
                  };
                }}
              />
              <StockReorderHint />
            </>
          )
        ) : null}
      </div>
    </WorkspacePanel>
  );
}

function StockRetailPriceStep(props: {
  catalog: SenaCatalog | null;
  choice: OptionalStockStepChoice;
  countedAtBySku: Map<string, string>;
  currency: 'USD' | 'KHR';
  debugCellBoundaries: boolean;
  guidance?: string | null;
  onReorderRows: (activeSkuId: string, overSkuId: string) => void;
  stockBySku: Map<string, SenaStockSnapshot>;
  rows: StockRow[];
  usdToKhrExchangeRate: number;
  updateRow: (skuId: string, patch: Partial<StockRow>) => void;
  visibleRows: StockRow[];
  onChooseNo: () => void;
  onChooseYes: () => void;
}) {
  const { t } = usePreferences();
  const { catalog, choice, countedAtBySku, currency, debugCellBoundaries, guidance, onReorderRows, stockBySku, usdToKhrExchangeRate, updateRow, visibleRows, onChooseNo, onChooseYes } = props;

  return (
    <WorkspacePanel
      action={null}
      className={recordUpdateWhiteCardClassName}
      descriptor={t('stockUpdateRetailPriceStepDescription')}
      style={recordUpdateWhiteCardStyle}
      title={<SectionLabel tooltip={t('stockUpdateRetailPriceStepTooltip')} tooltipLabel={t('stockUpdateRetailPriceIfChanged')}>{t('stockUpdateRetailPriceIfChanged')}</SectionLabel>}
    >
      <div className="grid gap-3">
        {guidance ? <p className="text-sm text-destructive">{guidance}</p> : null}
        <OptionalStockDecisionCard choice={choice} helper={t('stockUpdateRetailPriceStepHelper')} onNo={onChooseNo} onYes={onChooseYes} question={t('stockUpdateRetailPriceStepQuestion')} />
        {choice === 'yes' ? (
          (catalog?.skus ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">{t('stockUpdateNoSkusHelper')}</p>
          ) : (
            <>
              <SortableStockTable
                debugCellBoundaries={debugCellBoundaries}
                columns={[
                  {
                    header: null,
                    className: 'w-12 px-3 text-center',
                    width: '3.5rem',
                  },
                  { header: t('stockUpdateSkuLatestObservation'), width: '37%' },
                  { header: t('stockUpdateLatestRetailPrice'), width: '24%' },
                  { header: t('stockUpdateCurrentRetailPrice'), width: '31%' },
                ]}
                rows={visibleRows}
                onReorderRows={onReorderRows}
                renderRow={(row) => {
                  const sku = catalog?.skus.find((entry) => entry.skuId === row.skuId);
                  const latestRetailPrice = stockBySku.get(row.skuId)?.productPrice ?? null;
                  const retailPriceChanged = stockRetailPriceChanged(catalog, stockBySku, row);
                  const latestRetailPricePlaceholder =
                    latestRetailPrice == null ? '' : String(displayMoneyFromUsd(latestRetailPrice, currency, usdToKhrExchangeRate));

                  return {
                    dragLabel: t('stockUpdateReorderSkuRow', { name: sku?.name ?? row.skuId }),
                    highlight: retailPriceChanged,
                    inputCellIndexes: [2],
                    cells: [
                      <StockSkuSummaryCell skuName={sku?.name ?? row.skuId} />,
                      <StockLatestMoneyCell countedAtBySku={countedAtBySku} latestValue={latestRetailPrice} skuId={row.skuId} />,
                      <>
                        <RecordUpdateMobileLabel>{t('stockUpdateCurrentRetailPrice')}</RecordUpdateMobileLabel>
                        <div className="flex justify-start pr-3">
                          <Input
                            aria-label={t('stockUpdateCurrentRetailPrice')}
                            className={`w-full max-w-[18rem] ${recordUpdateInputClassName}`}
                            disabled={!sku?.soldAsProduct}
                            min="0"
                            placeholder={latestRetailPricePlaceholder}
                            step={moneyInputStep(currency)}
                            type="number"
                            value={retailPriceChanged && row.productPrice != null ? displayMoneyFromUsd(row.productPrice, currency, usdToKhrExchangeRate) : ''}
                            onChange={(event) =>
                              updateRow(row.skuId, {
                                productPrice: event.target.value ? usdMoneyFromDisplay(Number(event.target.value), currency, usdToKhrExchangeRate) : latestRetailPrice,
                              })
                            }
                          />
                        </div>
                      </>,
                    ],
                  };
                }}
              />
              <StockReorderHint />
            </>
          )
        ) : null}
      </div>
    </WorkspacePanel>
  );
}

function StockFlagsStep(props: {
  catalog: SenaCatalog | null;
  choice: OptionalStockStepChoice;
  countedAtBySku: Map<string, string>;
  debugCellBoundaries: boolean;
  guidance?: string | null;
  onReorderRows: (activeSkuId: string, overSkuId: string) => void;
  skuSignalDrafts: Record<string, SkuSignalDraft>;
  stockBySku: Map<string, SenaStockSnapshot>;
  updateSkuSignalDraft: (skuId: string, updater: (draft: SkuSignalDraft) => SkuSignalDraft) => void;
  visibleRows: StockRow[];
  onChooseNo: () => void;
  onChooseYes: () => void;
}) {
  const { t } = usePreferences();
  const { catalog, choice, countedAtBySku, debugCellBoundaries, guidance, onReorderRows, skuSignalDrafts, stockBySku, updateSkuSignalDraft, visibleRows, onChooseNo, onChooseYes } = props;
  const stockEventOptions: Array<{
    value: StockEventDropdownValue;
    label: string;
    icon: ReactNode;
  }> = [
    {
      value: 'none',
      label: t('stockUpdateNoEventInterval'),
      icon: <StatusReadyIcon aria-hidden="true" className="size-4" />,
    },
    {
      value: 'blocked',
      label: t('stockUpdateBlockedEvent'),
      icon: <StatusWarningIcon aria-hidden="true" className="size-4" />,
    },
    {
      value: 'stockout',
      label: t('stockUpdateStockoutEvent'),
      icon: <EntityFlagIcon aria-hidden="true" className="size-4" />,
    },
  ];

  return (
    <WorkspacePanel
      action={null}
      className={recordUpdateWhiteCardClassName}
      descriptor={t('stockUpdateFlagsStepDescription')}
      style={recordUpdateWhiteCardStyle}
      title={<SectionLabel tooltip={t('stockUpdateSkuFlagsTooltip')} tooltipLabel={t('stockUpdateSkuFlagsTooltipLabel')}>{t('stockUpdateAddFlags')}</SectionLabel>}
    >
      <div className="grid gap-3">
        {guidance ? <p className="text-sm text-destructive">{guidance}</p> : null}
        <OptionalStockDecisionCard choice={choice} helper={t('stockUpdateFlagsStepHelper')} onNo={onChooseNo} onYes={onChooseYes} question={t('stockUpdateFlagsStepQuestion')} />
        {choice === 'yes' ? (
          (catalog?.skus ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">{t('stockUpdateNoSkusHelper')}</p>
          ) : (
            <>
              <SortableStockTable
                debugCellBoundaries={debugCellBoundaries}
                columns={[
                  {
                    header: null,
                    className: 'w-12 px-3 text-center',
                    width: '3.5rem',
                  },
                  { header: t('stockUpdateSkuLatestObservation'), width: '52%' },
                  { header: t('stockUpdateEventColumn'), width: '40%' },
                ]}
                rows={visibleRows}
                onReorderRows={onReorderRows}
                renderRow={(row) => {
                  const sku = catalog?.skus.find((entry) => entry.skuId === row.skuId);
                  const draft = skuSignalDrafts[row.skuId];
                  const eventValue = draft?.blockedEnabled ? draft.blockedState : 'none';

                  return {
                    dragLabel: t('stockUpdateReorderSkuRow', { name: sku?.name ?? row.skuId }),
                    highlight: Boolean(draft?.blockedEnabled),
                    inputCellIndexes: [1],
                    cells: [
                      <StockSkuSummaryCell skuName={sku?.name ?? row.skuId} />,
                      <div className="min-w-0">
                        <RecordUpdateMobileLabel>{t('stockUpdateEventColumn')}</RecordUpdateMobileLabel>
                        <Select
                          value={eventValue}
                          onValueChange={(value) =>
                            updateSkuSignalDraft(row.skuId, (current) => ({
                              ...skuEventOnlyDraft(current),
                              blockedEnabled: value !== 'none',
                              blockedState: value === 'stockout' ? 'stockout' : 'blocked',
                            }))
                          }
                        >
                          <SelectTrigger
                            aria-label={t('stockUpdateEventFor', { name: sku?.name ?? row.skuId })}
                            className={cn('min-w-0 w-full max-w-[18rem]', recordUpdateSelectTriggerClassName, 'justify-between')}
                          >
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {stockEventOptions.map((option) => (
                              <SelectItem key={option.value} value={option.value}>
                                <span className="flex items-center gap-2">
                                  {option.icon}
                                  <span>{option.label}</span>
                                </span>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>,
                    ],
                  };
                }}
              />
              <StockReorderHint />
            </>
          )
        ) : null}
      </div>
    </WorkspacePanel>
  );
}

function SalesRankingFallback({
  catalog,
  entryType,
  helper,
  label,
  seedValues,
  values,
  onChange,
}: {
  catalog: SenaCatalog | null;
  entryType: RankingEntryType;
  helper: string;
  label: string;
  seedValues: string[];
  values: string[];
  onChange: (values: string[]) => void;
}) {
  return (
    <div className="grid gap-4">
      <p className="text-sm text-muted-foreground">{helper}</p>
      <RankingSignalEditor
        catalog={catalog}
        entryType={entryType}
        label={label}
        seedValues={seedValues}
        values={values}
        onChange={onChange}
      />
    </div>
  );
}

function SalesRetailStep({
  catalog,
  choice,
  debugCellBoundaries,
  guidance,
  latestSalesAtBySku,
  latestSalesBySku,
  onChooseNo,
  onChooseYes,
  onReorderRows,
  retailRankingSeedValues,
  retailSalesDrafts,
  retailSkuIds,
  setRetailRankings,
  setRetailSalesDraft,
  retailRankings,
}: {
  catalog: SenaCatalog | null;
  choice: OptionalStockStepChoice;
  debugCellBoundaries: boolean;
  guidance?: string | null;
  latestSalesAtBySku: Map<string, string>;
  latestSalesBySku: Map<string, number | null>;
  onChooseNo: () => void;
  onChooseYes: () => void;
  onReorderRows: (activeId: string, overId: string) => void;
  retailRankingSeedValues: string[];
  retailSalesDrafts: SalesCountDrafts;
  retailSkuIds: string[];
  retailRankings: string[];
  setRetailRankings: (values: string[]) => void;
  setRetailSalesDraft: (skuId: string, value: string) => void;
}) {
  return (
    <WorkspacePanel
      className={recordUpdateWhiteCardClassName}
      descriptor={translateUiLiteral('en', 'Capture exact retail SKU sales when you know them. Otherwise, save an ordinal fallback for SENA.')}
      style={recordUpdateWhiteCardStyle}
      title="Retail / sellable SKU sales"
    >
      <div className="grid gap-3">
        {guidance ? <p className="text-sm text-destructive">{guidance}</p> : null}
        <OptionalStockDecisionCard
          choice={choice}
          helper={translateUiLiteral('en', 'Choose Yes when you know exact sellable SKU sales for this interval. Choose No to record only ordinal ranking for SENA.')}
          question={translateUiLiteral('en', 'Do you know the exact count of sellable SKUs sold this interval?')}
          onNo={onChooseNo}
          onYes={onChooseYes}
        />
        {choice === 'yes' ? (
          retailSkuIds.length === 0 ? (
            <p className="text-sm text-muted-foreground">{translateUiLiteral('en', 'No sellable SKUs available.')}</p>
          ) : (
            <>
              <SortableIdTable
                bodyTestId="sales-retail-list"
                columns={[
                  { header: null, className: 'w-12 px-3 text-center', width: '3.5rem' },
                  { header: 'SKU', width: '37%' },
                  { header: 'Sold last interval', width: '24%' },
                  { header: "Current interval's sales", width: '31%' },
                ]}
                debugCellBoundaries={debugCellBoundaries}
                ids={retailSkuIds}
                onReorderRows={onReorderRows}
                renderRow={(skuId) => {
                  const sku = catalog?.skus.find((entry) => entry.skuId === skuId);
                  const latestValue = latestSalesBySku.get(skuId) ?? null;
                  return {
                    dragLabel: translateUiLiteral('en', 'Reorder {name}', { name: sku?.name ?? skuId }),
                    highlight: (retailSalesDrafts[skuId]?.trim() ?? '') !== '',
                    inputCellIndexes: [2],
                    cells: [
                      <StockSkuSummaryCell skuName={sku?.name ?? skuId} />,
                      <SalesLatestCountCell countLabel="sold" latestAt={latestSalesAtBySku.get(skuId)} latestValue={latestValue} />,
                      <>
                        <RecordUpdateMobileLabel>{"Current interval's sales"}</RecordUpdateMobileLabel>
                        <div className="pr-3">
                          <Input
                            aria-label={translateUiLiteral('en', "Current interval sales for {name}", { name: sku?.name ?? skuId })}
                            className={`w-full max-w-[18rem] ${recordUpdateInputClassName}`}
                            min="0"
                            placeholder={latestValue == null ? '' : String(latestValue)}
                            step="1"
                            type="number"
                            value={retailSalesDrafts[skuId] ?? ''}
                            onChange={(event) => setRetailSalesDraft(skuId, event.target.value)}
                          />
                        </div>
                      </>,
                    ],
                  };
                }}
              />
              <StockReorderHint />
            </>
          )
        ) : null}
        {choice === 'no' ? (
          <SalesRankingFallback
            catalog={catalog}
            entryType="sku"
            helper={translateUiLiteral('en', 'Use ranking when exact sellable SKU sales are unknown. This remains linked to SENA ordinal ranking.')}
            label="Retail SKU ranking"
            seedValues={retailRankingSeedValues}
            values={retailRankings}
            onChange={setRetailRankings}
          />
        ) : null}
      </div>
    </WorkspacePanel>
  );
}

function SalesServiceStep({
  catalog,
  choice,
  debugCellBoundaries,
  guidance,
  latestSalesAtByService,
  latestSalesByService,
  onChooseNo,
  onChooseYes,
  onReorderRows,
  serviceIds,
  serviceRankingSeedValues,
  serviceSalesDrafts,
  serviceRankings,
  setServiceRankings,
  setServiceSalesDraft,
}: {
  catalog: SenaCatalog | null;
  choice: OptionalStockStepChoice;
  debugCellBoundaries: boolean;
  guidance?: string | null;
  latestSalesAtByService: Map<string, string>;
  latestSalesByService: Map<string, number | null>;
  onChooseNo: () => void;
  onChooseYes: () => void;
  onReorderRows: (activeId: string, overId: string) => void;
  serviceIds: string[];
  serviceRankingSeedValues: string[];
  serviceSalesDrafts: SalesCountDrafts;
  serviceRankings: string[];
  setServiceRankings: (values: string[]) => void;
  setServiceSalesDraft: (serviceId: string, value: string) => void;
}) {
  return (
    <WorkspacePanel
      className={recordUpdateWhiteCardClassName}
      descriptor={translateUiLiteral('en', 'Capture exact service sales when you know them. Otherwise, save an ordinal fallback for SENA.')}
      style={recordUpdateWhiteCardStyle}
      title="Sellable services"
    >
      <div className="grid gap-3">
        {guidance ? <p className="text-sm text-destructive">{guidance}</p> : null}
        <OptionalStockDecisionCard
          choice={choice}
          helper={translateUiLiteral('en', 'Choose Yes when you know exact service sales for this interval. Choose No to record only ordinal ranking for SENA.')}
          question={translateUiLiteral('en', 'Do you know the exact count of sellable services sold this interval?')}
          onNo={onChooseNo}
          onYes={onChooseYes}
        />
        {choice === 'yes' ? (
          serviceIds.length === 0 ? (
            <p className="text-sm text-muted-foreground">{translateUiLiteral('en', 'No services available.')}</p>
          ) : (
            <>
              <SortableIdTable
                bodyTestId="sales-service-list"
                columns={[
                  { header: null, className: 'w-12 px-3 text-center', width: '3.5rem' },
                  { header: 'Service', width: '37%' },
                  { header: 'Sold last interval', width: '24%' },
                  { header: "Current interval's sales", width: '31%' },
                ]}
                debugCellBoundaries={debugCellBoundaries}
                ids={serviceIds}
                onReorderRows={onReorderRows}
                renderRow={(serviceId) => {
                  const service = catalog?.services.find((entry) => entry.serviceId === serviceId);
                  const latestValue = latestSalesByService.get(serviceId) ?? null;
                  return {
                    dragLabel: translateUiLiteral('en', 'Reorder {name}', { name: service?.name ?? serviceId }),
                    highlight: (serviceSalesDrafts[serviceId]?.trim() ?? '') !== '',
                    inputCellIndexes: [2],
                    cells: [
                      <ServiceSummaryCell serviceName={service?.name ?? serviceId} />,
                      <SalesLatestCountCell countLabel="sold" latestAt={latestSalesAtByService.get(serviceId)} latestValue={latestValue} />,
                      <>
                        <RecordUpdateMobileLabel>{"Current interval's sales"}</RecordUpdateMobileLabel>
                        <div className="pr-3">
                          <Input
                            aria-label={translateUiLiteral('en', "Current interval sales for {name}", { name: service?.name ?? serviceId })}
                            className={`w-full max-w-[18rem] ${recordUpdateInputClassName}`}
                            min="0"
                            placeholder={latestValue == null ? '' : String(latestValue)}
                            step="1"
                            type="number"
                            value={serviceSalesDrafts[serviceId] ?? ''}
                            onChange={(event) => setServiceSalesDraft(serviceId, event.target.value)}
                          />
                        </div>
                      </>,
                    ],
                  };
                }}
              />
              <StockReorderHint />
            </>
          )
        ) : null}
        {choice === 'no' ? (
          <SalesRankingFallback
            catalog={catalog}
            entryType="service"
            helper={translateUiLiteral('en', 'Use ranking when exact service sales are unknown. This remains linked to SENA ordinal ranking.')}
            label="Service ranking"
            seedValues={serviceRankingSeedValues}
            values={serviceRankings}
            onChange={setServiceRankings}
          />
        ) : null}
      </div>
    </WorkspacePanel>
  );
}

function RecordOrderStep({
  catalog,
  debugCellBoundaries,
  guidance,
  latestOrderAtBySku,
  latestOrderQuantity,
  leadTimeMeanDefaults,
  leadTimeVariabilityDefaults,
  observedAtIso,
  onReorderRows,
  orderRecommendationBySku,
  recordOrderExpectedArrivalDate,
  recordOrderLeadTimeMeanDays,
  recordOrderLeadTimeVariability,
  rows,
  setRecordOrderExpectedArrivalDate,
  setRecordOrderLeadTimeMeanDays,
  setRecordOrderLeadTimeVariability,
  skuSignalDrafts,
  updateSkuSignalDraft,
}: {
  catalog: SenaCatalog | null;
  debugCellBoundaries: boolean;
  guidance?: string | null;
  latestOrderAtBySku: Map<string, string>;
  latestOrderQuantity: Map<string, number | null>;
  leadTimeMeanDefaults: Map<string, number | null>;
  leadTimeVariabilityDefaults: Map<string, SenaLeadTimeVariabilityClass | null>;
  observedAtIso: string | null;
  onReorderRows: (activeSkuId: string, overSkuId: string) => void;
  orderRecommendationBySku: Map<string, number>;
  recordOrderExpectedArrivalDate: string;
  recordOrderLeadTimeMeanDays: string;
  recordOrderLeadTimeVariability: SenaLeadTimeVariabilityClass | '';
  rows: StockRow[];
  setRecordOrderExpectedArrivalDate: (value: string) => void;
  setRecordOrderLeadTimeMeanDays: (value: string) => void;
  setRecordOrderLeadTimeVariability: (value: SenaLeadTimeVariabilityClass | '') => void;
  skuSignalDrafts: Record<string, SkuSignalDraft>;
  updateSkuSignalDraft: (skuId: string, updater: (draft: SkuSignalDraft) => SkuSignalDraft) => void;
}) {
  const leadTimeMeanPlaceholder = rows.map((row) => leadTimeMeanDefaults.get(row.skuId)).find((value) => value != null) ?? null;
  const leadTimeVariabilityPlaceholder = rows.map((row) => leadTimeVariabilityDefaults.get(row.skuId)).find((value) => value != null) ?? '';
  const effectiveLeadTimeMean =
    recordOrderLeadTimeMeanDays.trim() !== ''
      ? Number(recordOrderLeadTimeMeanDays)
      : leadTimeMeanPlaceholder;
  const effectiveLeadTimeVariability = recordOrderLeadTimeVariability || leadTimeVariabilityPlaceholder || null;
  const expectedArrivalEstimate = addDaysToDateInput(
    observedAtIso,
    expectedArrivalDaysFromLeadTime(effectiveLeadTimeMean, effectiveLeadTimeVariability),
  );
  useEffect(() => {
    if (!recordOrderLeadTimeVariability && leadTimeVariabilityPlaceholder) {
      setRecordOrderLeadTimeVariability(leadTimeVariabilityPlaceholder);
    }
  }, [leadTimeVariabilityPlaceholder, recordOrderLeadTimeVariability, setRecordOrderLeadTimeVariability]);
  useEffect(() => {
    if (expectedArrivalEstimate) {
      setRecordOrderExpectedArrivalDate(expectedArrivalEstimate);
    }
  }, [expectedArrivalEstimate, setRecordOrderExpectedArrivalDate]);

  return (
    <WorkspacePanel
      className={recordUpdateWhiteCardClassName}
      descriptor={translateUiLiteral('en', 'Log new orders, confirm expected arrival timing, and optionally adjust lead time assumptions before saving.')}
      style={recordUpdateWhiteCardStyle}
      title="Reorder table"
    >
      <div className="grid gap-3">
        {guidance ? <p className="text-sm text-destructive">{guidance}</p> : null}
        {(catalog?.skus ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">{translateUiLiteral('en', 'No SKUs are in the catalog yet. Add a SKU first if you need to record a reorder.')}</p>
        ) : (
          <>
            <RecordOrderTimingFields
              expectedArrivalPlaceholder={expectedArrivalEstimate}
              expectedArrivalValue={recordOrderExpectedArrivalDate}
              leadTimeMeanPlaceholder={leadTimeMeanPlaceholder == null ? '' : String(Math.round(leadTimeMeanPlaceholder * 10) / 10)}
              leadTimeMeanValue={recordOrderLeadTimeMeanDays}
              onExpectedArrivalChange={setRecordOrderExpectedArrivalDate}
              onLeadTimeMeanChange={setRecordOrderLeadTimeMeanDays}
              onVariabilityChange={setRecordOrderLeadTimeVariability}
              variabilityPlaceholder={leadTimeVariabilityPlaceholder}
              variabilityValue={recordOrderLeadTimeVariability}
            />
            <SortableStockTable
              bodyTestId="record-order-list"
              debugCellBoundaries={debugCellBoundaries}
              columns={[
                { header: null, className: 'w-12 px-3 text-center', width: '3.5rem' },
                { header: 'SKU', width: '34%' },
                { header: 'Last order', width: '26%' },
                { header: 'Current order', width: '40%' },
              ]}
              onReorderRows={onReorderRows}
              rows={rows}
              renderRow={(row) => {
                const sku = catalog?.skus.find((entry) => entry.skuId === row.skuId);
                const draft = skuSignalDrafts[row.skuId] ?? createEmptySkuSignalDraft();
                const recommendedUnits = orderRecommendationBySku.get(row.skuId);

                return {
                  dragLabel: translateUiLiteral('en', 'Reorder {name}', { name: sku?.name ?? row.skuId }),
                  highlight: orderDraftHasContent(draft),
                  inputCellIndexes: [2],
                  cells: [
                    <StockSkuSummaryCell skuName={sku?.name ?? row.skuId} />,
                    <LastOrderCell latestAt={latestOrderAtBySku.get(row.skuId)} latestValue={latestOrderQuantity.get(row.skuId) ?? null} />,
                    <OrderQuantityField
                      orderQuantityPlaceholder={recommendedUnits && recommendedUnits > 0
                        ? translateUiLiteral('en', 'Banji recommends {count} units.', { count: Math.round(recommendedUnits) })
                        : ''}
                      orderQuantityValue={draft.orderedQuantity}
                      rowName={sku?.name ?? row.skuId}
                      setOrderQuantity={(value) =>
                        updateSkuSignalDraft(row.skuId, (current) => ({
                          ...current,
                          orderEnabled: value.trim() !== '',
                          orderedQuantity: value,
                        }))
                      }
                    />,
                  ],
                };
              }}
            />
            <StockReorderHint />
          </>
        )}
      </div>
    </WorkspacePanel>
  );
}

function ServiceSignalsStep({
  catalog,
  currency,
  debugCellBoundaries,
  guidance,
  language,
  serviceSignalDrafts,
  usdToKhrExchangeRate,
  updateServiceSignalDraft,
  onToggleDebugCellBoundaries,
}: {
  catalog: SenaCatalog | null;
  currency: 'USD' | 'KHR';
  debugCellBoundaries: boolean;
  guidance?: string | null;
  language: 'en' | 'km';
  serviceSignalDrafts: Record<string, ServiceSignalDraft>;
  usdToKhrExchangeRate: number;
  updateServiceSignalDraft: (serviceId: string, updater: (draft: ServiceSignalDraft) => ServiceSignalDraft) => void;
  onToggleDebugCellBoundaries: () => void;
}) {
  const { t } = usePreferences();
  const showFlagColumn = anyServiceFlags(serviceSignalDrafts);
  const debugTrackClassName = debugCellBoundaries ? tableDebugTrackClassName : '';
  const debugFlushClassName = debugCellBoundaries ? tableDebugFlushClassName : '';

  return (
    <WorkspacePanel
      action={
        <Button
          aria-pressed={debugCellBoundaries}
          className="hidden"
          hidden
          type="button"
          variant={debugCellBoundaries ? 'secondary' : 'outline'}
          onClick={onToggleDebugCellBoundaries}
        >
          Cell boundaries
        </Button>
      }
      className={recordUpdateWhiteCardClassName}
      descriptor={t(STOCK_UPDATE_STEP_COPY.service.descriptionKey)}
      style={recordUpdateWhiteCardStyle}
      title={
        <SectionLabel
          tooltip={t('stockUpdateServiceStepTooltip')}
          tooltipLabel={t('stockUpdateServiceStepTooltipLabel')}
        >
          {t(STOCK_UPDATE_STEP_COPY.service.titleKey)}
        </SectionLabel>
      }
    >
      <div className="grid gap-3">
        {guidance ? <p className="text-sm text-destructive">{guidance}</p> : null}
        {(catalog?.services ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('stockUpdateNoServicesHelper')}</p>
        ) : (
          <RecordUpdateTable
            columns={[
              { header: t('stockUpdateServiceHeader'), width: showFlagColumn ? '30%' : '42%' },
              { header: t('stockUpdateLatestPrice'), className: 'text-center', width: '18%' },
              ...(showFlagColumn ? [{ header: t('stockUpdateFlags'), width: '34%' } satisfies RecordUpdateTableColumn] : []),
              {
                header: (
                  <SectionLabel
                    tooltip={t('stockUpdateServiceFlagsTooltip')}
                    tooltipLabel={t('stockUpdateServiceFlagsTooltipLabel')}
                  >
                    {t('stockUpdateAddFlags')}
                  </SectionLabel>
                ),
                className: 'text-right',
                width: showFlagColumn ? '18%' : '40%',
              },
            ]}
          >
            {(catalog?.services ?? []).map((service) => {
              const draft = serviceSignalDrafts[service.serviceId];
              const flagIds = activeServiceFlagIds(draft);
              const linkedSkuCount = (catalog?.sharingMask ?? []).filter(
                (entry) => entry.enabled && entry.serviceId === service.serviceId,
              ).length;

              return (
                <TableRow
                  key={service.serviceId}
                  className={cn(
                    rowHoverClassName,
                    debugTrackClassName,
                    debugFlushClassName,
                    flagIds.length > 0 && 'bg-primary/[0.04]',
                  )}
                >
                  <TableCell className={recordUpdateTableCellClassName}>
                    <div className="min-w-0">
                      <span className="block font-medium text-foreground">{service.name}</span>
                      <span className="mt-1 block text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground/75">
                        {service.serviceId}
                      </span>
                      <span className="mt-1 block text-sm text-muted-foreground">
                        {t('stockUpdateLinkedSkuCount', { count: linkedSkuCount, suffix: linkedSkuCount === 1 ? '' : 's' })}
                      </span>
                    </div>
                  </TableCell>

                  <TableCell className={cn(recordUpdateTableCellClassName, 'text-center')}>
                    <div className="min-w-0">
                      <RecordUpdateMobileLabel>{t('stockUpdateLatestPrice')}</RecordUpdateMobileLabel>
                      <p className="text-sm font-medium text-foreground">
                        {formatCurrency(service.price, currency, language, usdToKhrExchangeRate)}
                      </p>
                    </div>
                  </TableCell>

                  {showFlagColumn ? (
                    <TableCell className={recordUpdateTableCellClassName}>
                      <div className="min-w-0">
                        <RecordUpdateMobileLabel>{t('stockUpdateFlags')}</RecordUpdateMobileLabel>
                        {flagIds.length > 0 ? (
                          <div className="grid">
                            {draft.priceEnabled ? (
                              <FlagSection
                                label={t('stockUpdatePriceIfChanged')}
                                removeLabel={t('stockUpdateRemovePriceFlagFor', { name: service.name })}
                                onRemove={() =>
                                  updateServiceSignalDraft(service.serviceId, (current) => ({
                                    ...current,
                                    priceEnabled: false,
                                    price: '',
                                  }))
                                }
                              >
                                <Input
                                  aria-label={t('stockUpdatePriceChangedAria', { name: service.name })}
                                  className={flagControlClassName}
                                  min="0"
                                  placeholder={t('stockUpdateNewPrice')}
                                  step={moneyInputStep(currency)}
                                  type="number"
                                  value={draft.price}
                                  onChange={(event) =>
                                    updateServiceSignalDraft(service.serviceId, (current) => ({
                                      ...current,
                                      priceEnabled: true,
                                      price: event.target.value,
                                    }))
                                  }
                                />
                              </FlagSection>
                            ) : null}
                            {draft.blockedEnabled ? (
                              <FlagSection
                                label={t('stockUpdateEventFlag')}
                                removeLabel={t('stockUpdateRemoveEventFlagFor', { name: service.name })}
                                onRemove={() =>
                                  updateServiceSignalDraft(service.serviceId, (current) => ({
                                    ...current,
                                    blockedEnabled: false,
                                    blockedState: 'blocked',
                                  }))
                                }
                              >
                                <Select
                                  value={draft.blockedState}
                                  onValueChange={(value) =>
                                    updateServiceSignalDraft(service.serviceId, (current) => ({
                                      ...current,
                                      blockedEnabled: true,
                                      blockedState: value as StockoutFlagValue,
                                    }))
                                  }
                                >
                                  <SelectTrigger
                                    aria-label={t('stockUpdateBlockedStateAria', { name: service.name })}
                                    className={cn(flagControlClassName, recordUpdateSelectTriggerClassName, 'justify-between')}
                                  >
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="blocked">{t('stockUpdateBlocked')}</SelectItem>
                                    <SelectItem value="stockout">{t('stockUpdateStockout')}</SelectItem>
                                  </SelectContent>
                                </Select>
                              </FlagSection>
                            ) : null}
                          </div>
                        ) : (
                          <p className="text-sm text-muted-foreground">{t('stockUpdateNoRowFlags')}</p>
                        )}
                      </div>
                    </TableCell>
                  ) : null}

                  <TableCell className={cn(recordUpdateTableCellClassName, 'text-right')}>
                    <div className="min-w-0">
                      <RecordUpdateMobileLabel>{t('stockUpdateAddFlags')}</RecordUpdateMobileLabel>
                      <FlagActionMenu
                        actions={[
                          {
                            key: 'price',
                            label: draft?.priceEnabled ? t('stockUpdateRemovePriceChange') : t('stockUpdateAddPriceChange'),
                            icon: <ActionCreatePackageIcon className="size-4" />,
                            onSelect: () =>
                              updateServiceSignalDraft(service.serviceId, (current) => ({
                                ...current,
                                priceEnabled: !current.priceEnabled,
                                price: current.priceEnabled ? '' : current.price,
                              })),
                          },
                          {
                            key: 'blocked',
                            label: draft?.blockedEnabled ? t('stockUpdateRemoveEvent') : t('stockUpdateAddEvent'),
                            icon: <StatusUnavailableIcon className="size-4" />,
                            onSelect: () =>
                              updateServiceSignalDraft(service.serviceId, (current) => ({
                                ...current,
                                blockedEnabled: !current.blockedEnabled,
                                blockedState: current.blockedEnabled ? 'blocked' : current.blockedState,
                              })),
                          },
                        ]}
                        label={t('stockUpdateAddFlagsFor', { name: service.name })}
                      />
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </RecordUpdateTable>
        )}
      </div>
    </WorkspacePanel>
  );
}

function RegimeFields({
  regimeHint,
  setRegimeHint,
}: {
  regimeHint: SenaObservationRegimeHint | '';
  setRegimeHint: (value: SenaObservationRegimeHint | '') => void;
}) {
  const { t } = usePreferences();
  const regimeOptions: Array<{ value: SenaObservationRegimeHint; label: string; detail: string }> = [
    { value: 'normal', label: t('stockUpdateRegimeNormal'), detail: t('stockUpdateRegimeNormalDetail') },
    { value: 'spike', label: t('stockUpdateRegimeSpike'), detail: t('stockUpdateRegimeSpikeDetail') },
    { value: 'lull', label: t('stockUpdateRegimeLull'), detail: t('stockUpdateRegimeLullDetail') },
    { value: 'stockout_constrained', label: t('stockUpdateRegimeStockout'), detail: t('stockUpdateRegimeStockoutDetail') },
    { value: 'promo', label: t('stockUpdateRegimePromo'), detail: t('stockUpdateRegimePromoDetail') },
    { value: 'correction', label: t('stockUpdateRegimeCorrection'), detail: t('stockUpdateRegimeCorrectionDetail') },
  ];
  const selectedRegime = regimeOptions.find((option) => option.value === regimeHint) ?? null;
  const NoSignalIcon = getRegimeIcon('none');
  const SelectedIcon = getRegimeIcon(selectedRegime?.value ?? 'none');
  const regimeDescription = selectedRegime?.detail ?? t('stockUpdateRegimeDescriptionEmpty');

  return (
    <div className="grid gap-2">
      <div className="grid gap-1 text-sm font-medium text-foreground">
        <Select value={regimeHint || 'none'} onValueChange={(value) => setRegimeHint(value === 'none' ? '' : (value as SenaObservationRegimeHint))}>
          <SelectTrigger
            aria-label={`${t('stockUpdateOverallRegime')} ${t('stockUpdateOptional')}`}
            className={cn('w-full', recordUpdateSelectTriggerClassName)}
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">
              <span className="flex items-center gap-2">
                <NoSignalIcon className="size-4 text-muted-foreground" />
                <span>{t('stockUpdateNoRegimeSignal')}</span>
              </span>
            </SelectItem>
            {regimeOptions.map((option) => {
              const Icon = getRegimeIcon(option.value);
              return (
                <SelectItem key={option.value} value={option.value}>
                  <span className="flex items-center gap-2">
                    <Icon className="size-4 text-muted-foreground" />
                    <span>{option.label}</span>
                  </span>
                </SelectItem>
              );
            })}
          </SelectContent>
        </Select>
      </div>
      <div className="grid gap-1 text-sm leading-6 text-muted-foreground">
        <p className="flex items-start gap-2">
          <SelectedIcon className="mt-1 size-4 shrink-0 text-primary" />
          <span>{regimeDescription}</span>
        </p>
      </div>
    </div>
  );
}

function ReviewStep({
  blockers,
  catalog,
  error,
  previewParts,
  serviceSignalDrafts,
  skuSignalDrafts,
  payload,
}: {
  blockers: string[];
  catalog: SenaCatalog | null;
  error: string | null;
  previewParts: string[];
  serviceSignalDrafts: Record<string, ServiceSignalDraft>;
  skuSignalDrafts: Record<string, SkuSignalDraft>;
  payload: ReturnType<typeof createEmptyObservationInput>;
}) {
  const { t } = usePreferences();
  return (
    <WorkspacePanel
      className={recordUpdateWhiteCardClassName}
      descriptor={t(STOCK_UPDATE_STEP_COPY.review.descriptionKey)}
      style={recordUpdateWhiteCardStyle}
      title={
        <SectionLabel
          tooltip={t('stockUpdateReviewTooltip')}
          tooltipLabel={t('stockUpdateReviewTooltipLabel')}
        >
          {t(STOCK_UPDATE_STEP_COPY.review.titleKey)}
        </SectionLabel>
      }
    >
      <div className="grid gap-4">
        {blockers.length > 0 ? (
          <div className="grid gap-2">
            {blockers.map((blocker) => (
              <p key={blocker} className="text-sm text-destructive">
                {blocker}
              </p>
            ))}
          </div>
        ) : null}
        <div className="rounded-[1.25rem] border border-border/70 bg-secondary/25 px-4 py-4">
          <p className="font-medium text-foreground">
            {previewParts.length > 0 ? previewParts.join(' · ') : t('stockUpdateNoStructuredSignals')}
          </p>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            {t('stockUpdateReviewBody')}
          </p>
        </div>
        {payload.retailStockouts.length > 0 || payload.serviceStockouts.length > 0 || payload.servicePrices.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {[
              ...payload.servicePrices.map(
                (event) =>
                  t('stockUpdatePriceBadge', {
                    name: catalog?.services.find((service) => service.serviceId === event.serviceId)?.name ?? event.serviceId,
                  }),
              ),
              ...payload.retailStockouts.map(
                (skuId) =>
                  t('stockUpdateStockoutBadge', {
                    name: catalog?.skus.find((sku) => sku.skuId === skuId)?.name ?? skuId,
                  }),
              ),
              ...payload.serviceStockouts.map(
                (serviceId) =>
                  t('stockUpdateStockoutBadge', {
                    name: catalog?.services.find((service) => service.serviceId === serviceId)?.name ?? serviceId,
                  }),
              ),
            ].map((label) => (
              <span key={label} className="rounded-full border border-border/70 bg-background px-3 py-1 text-xs text-muted-foreground">
                {label}
              </span>
            ))}
          </div>
        ) : null}
        {Object.values(skuSignalDrafts).some((draft) => draft.orderEnabled || draft.receiptEnabled) ? (
          <p className="text-sm text-muted-foreground">{t('stockUpdateOrderSignalSaved')}</p>
        ) : null}
        {Object.values(serviceSignalDrafts).some((draft) => draft.priceEnabled) ? (
          <p className="text-sm text-muted-foreground">{t('stockUpdateServicePriceSaved')}</p>
        ) : null}
        {error ? (
          <p className="rounded-[1.25rem] border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {error}
          </p>
        ) : null}
      </div>
    </WorkspacePanel>
  );
}

export function StockUpdateSessionRoute() {
  const { catalog, ingestSenaObservation, isSaving, observations, runWorkspacePreparation, triggerSenaRun, updateSenaObservation, workspaceSummary } = useInventory();
  const { currency, language, showHeartbeatRibbons = true, t, usdToKhrExchangeRate } = usePreferences();
  const location = useLocation();
  const navigate = useNavigate();
  const lane = useMemo(() => getRecordUpdateLane(location.pathname), [location.pathname]);
  const draftStorageKey = lane.draftStorageKey;
  const stockRowOrderStorageKey = useMemo(() => buildStockRowOrderStorageKey(lane.id), [lane.id]);
  const retailSalesRowOrderStorageKey = useMemo(() => buildStockRowOrderStorageKey(`${lane.id}:retail-sales`), [lane.id]);
  const serviceSalesRowOrderStorageKey = useMemo(() => buildStockRowOrderStorageKey(`${lane.id}:service-sales`), [lane.id]);
  const activeStepOrder = useMemo(() => stepOrderForLane(lane.id), [lane.id]);
  const latestAt = latestObservationAt(observations);
  const incomingEditSession = useMemo(() => readRecordUpdateEditSession(location.state), [location.state]);
  const initialObservedAtRef = useRef(localDateTimeInputValue(null));
  const draftHydrationCheckedRef = useRef(false);
  const latestDraftStateRef = useRef<StockUpdateDraftState | null>(null);
  const skipNextDraftPersistRef = useRef(false);
  const previousMoneyPreferencesRef = useRef({ currency, usdToKhrExchangeRate });
  const [editSession, setEditSession] = useState<EditSessionState | null>(() =>
    incomingEditSession
      ? {
          observationId: incomingEditSession.observationId,
          input: incomingEditSession.input,
        }
      : null,
  );
  const [pendingEditSession, setPendingEditSession] = useState<EditSessionState | null>(null);
  const [replaceDraftDialogOpen, setReplaceDraftDialogOpen] = useState(false);
  const [currentStepId, setCurrentStepId] = useState<StockUpdateStepId>('observed-at');
  const [unlockedStepCount, setUnlockedStepCount] = useState(1);
  const [observedAt, setObservedAt] = useState(() => initialObservedAtRef.current);
  const [notes, setNotes] = useState('');
  const [notesPlaceholderKey, setNotesPlaceholderKey] = useState<TranslationKey>(() => randomReportNotePlaceholderKey());
  const [stockView, setStockView] = useState<StockView>('priority');
  const [persistedStockRowOrder, setPersistedStockRowOrder] = useState(() => readStockRowOrder(stockRowOrderStorageKey));
  const [persistedRetailSalesRowOrder, setPersistedRetailSalesRowOrder] = useState(() => readStockRowOrder(retailSalesRowOrderStorageKey));
  const [persistedServiceSalesRowOrder, setPersistedServiceSalesRowOrder] = useState(() => readStockRowOrder(serviceSalesRowOrderStorageKey));
  const [rows, setRows] = useState(() =>
    applyStockRowOrder(buildInitialRows(catalog, observations), readStockRowOrder(stockRowOrderStorageKey)),
  );
  const [retailSalesChoice, setRetailSalesChoice] = useState<OptionalStockStepChoice>('unset');
  const [serviceSalesChoice, setServiceSalesChoice] = useState<OptionalStockStepChoice>('unset');
  const [retailSalesDrafts, setRetailSalesDrafts] = useState<SalesCountDrafts>({});
  const [serviceSalesDrafts, setServiceSalesDrafts] = useState<SalesCountDrafts>({});
  const [skuSignalDrafts, setSkuSignalDrafts] = useState<Record<string, SkuSignalDraft>>({});
  const [recordOrderExpectedArrivalDate, setRecordOrderExpectedArrivalDate] = useState('');
  const [recordOrderLeadTimeMeanDays, setRecordOrderLeadTimeMeanDays] = useState('');
  const [recordOrderLeadTimeVariability, setRecordOrderLeadTimeVariability] = useState<SenaLeadTimeVariabilityClass | ''>('');
  const [stockStepChoices, setStockStepChoices] = useState<Record<OptionalStockStepId, OptionalStockStepChoice>>(
    () => createDefaultStockStepChoices(),
  );
  const [serviceSignalDrafts, setServiceSignalDrafts] = useState<Record<string, ServiceSignalDraft>>({});
  const [regimeHint, setRegimeHint] = useState<SenaObservationRegimeHint | ''>('');
  const [serviceRankings, setServiceRankings] = useState<string[]>([]);
  const [retailRankings, setRetailRankings] = useState<string[]>([]);
  const [debugCellBoundaries, setDebugCellBoundaries] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasSavedDraft, setHasSavedDraft] = useState(() => hasStoredStockUpdateDraft(draftStorageKey));
  const [draftWasRestored, setDraftWasRestored] = useState(false);
  const [leaveDraftDialogOpen, setLeaveDraftDialogOpen] = useState(false);
  const visibleCatalog = useMemo(() => activeSenaCatalog(catalog), [catalog]);
  const workingCatalog = editSession ? catalog : visibleCatalog;
  const buildOrderedInitialRows = useCallback(
    (nextCatalog: SenaCatalog | null) =>
      applyStockRowOrder(buildInitialRows(nextCatalog, observations), persistedStockRowOrder),
    [observations, persistedStockRowOrder],
  );

  const stockBySku = useMemo(() => latestStockBySku(workingCatalog, observations), [observations, workingCatalog]);
  const countedAtBySku = useMemo(() => latestCountedAtBySku(observations), [observations]);
  const latestOrderedQuantity = useMemo(() => latestOrderQuantityBySku(workingCatalog, observations), [observations, workingCatalog]);
  const latestOrderedAt = useMemo(() => latestOrderAtBySku(observations), [observations]);
  const latestRetailSales = useMemo(() => latestRetailSalesBySku(workingCatalog, observations), [observations, workingCatalog]);
  const latestRetailSalesAt = useMemo(() => latestRetailSalesAtBySku(observations), [observations]);
  const latestServiceSales = useMemo(() => latestServiceSalesByService(workingCatalog, observations), [observations, workingCatalog]);
  const latestServiceSalesAt = useMemo(() => latestServiceSalesAtByService(observations), [observations]);
  const recommendedOrderBySku = useMemo(() => reorderRecommendationBySku(workspaceSummary), [workspaceSummary]);
  const leadTimeMeanDefaults = useMemo(() => leadTimeMeanBySku(workingCatalog, workspaceSummary), [workingCatalog, workspaceSummary]);
  const leadTimeVariabilityDefaults = useMemo(() => leadTimeVariabilityBySku(workingCatalog, workspaceSummary), [workingCatalog, workspaceSummary]);
  const visibleSkuSignalDrafts = useMemo(
    () => (lane.id === 'stock-count' ? skuEventOnlyDrafts(skuSignalDrafts) : skuSignalDrafts),
    [lane.id, skuSignalDrafts],
  );
  const retailSkuIds = useMemo(
    () =>
      applyStockRowOrder(
        (workingCatalog?.skus ?? []).filter((sku) => sku.soldAsProduct).map((sku) => ({ skuId: sku.skuId })),
        persistedRetailSalesRowOrder,
      ).map((row) => row.skuId),
    [persistedRetailSalesRowOrder, workingCatalog],
  );
  const serviceIds = useMemo(
    () =>
      applyStockRowOrder(
        (workingCatalog?.services ?? []).map((service) => ({ skuId: service.serviceId })),
        persistedServiceSalesRowOrder,
      ).map((row) => row.skuId),
    [persistedServiceSalesRowOrder, workingCatalog],
  );
  const highRiskIds = new Set(workspaceSummary?.highRiskSkuIds ?? []);
  const serviceLinkedSkuIds = useMemo(
    () => new Set((workingCatalog?.sharingMask ?? []).filter((entry) => entry.enabled).map((entry) => entry.skuId)),
    [workingCatalog],
  );
  const prioritySkuIds = useMemo(() => {
    const scored = (workingCatalog?.skus ?? []).map((sku, index) => ({
      skuId: sku.skuId,
      score:
        (highRiskIds.has(sku.skuId) ? 100 : 0) +
        (serviceLinkedSkuIds.has(sku.skuId) ? 20 : 0) +
        (countedAtBySku.has(sku.skuId) ? 0 : 10) -
        index / 100,
    }));
    return new Set(scored.sort((left, right) => right.score - left.score).slice(0, 8).map((entry) => entry.skuId));
  }, [countedAtBySku, highRiskIds, serviceLinkedSkuIds, workingCatalog?.skus]);

  const visibleRows = lane.id === 'stock-count'
    ? rows
    : rows.filter((row) => {
        if (stockView === 'counted') {
          return stockRowChanged(workingCatalog, stockBySku, row) || hasSkuFlags(skuSignalDrafts[row.skuId]);
        }
        if (stockView === 'priority') {
          return prioritySkuIds.has(row.skuId);
        }
        return true;
      });
  const salesFlagRows = useMemo(
    () => rows.filter((row) => retailSkuIds.includes(row.skuId)),
    [retailSkuIds, rows],
  );

  const observedAtIso = dateTimeInputToIso(observedAt);
  const intervalDays = intervalDaysBetween(latestAt, observedAtIso);
  const isFirstObservation = observations.length === 0;
  const countedSkuCount = rows.filter((row) => stockRowChanged(workingCatalog, stockBySku, row)).length;
  const retailSalesCount = Object.values(retailSalesDrafts).filter((value) => value.trim() !== '').length;
  const serviceSalesCount = Object.values(serviceSalesDrafts).filter((value) => value.trim() !== '').length;
  const orderSignalCount = Object.values(skuSignalDrafts).filter((draft) => draft.orderedQuantity.trim() !== '').length;
  const fullUpdate = rows.length > 0 && rows.every((row) => stockRowChanged(workingCatalog, stockBySku, row));
  const defaultServiceRankingIds = (workingCatalog?.services ?? []).map((service) => service.serviceId);
  const defaultRetailRankingIds = (workingCatalog?.skus ?? []).filter((sku) => sku.soldAsProduct).map((sku) => sku.skuId);
  const currentStepIndex = activeStepOrder.indexOf(currentStepId);
  const normalizedCurrentStepIndex = currentStepIndex >= 0 ? currentStepIndex : 0;
  const isLastStep = normalizedCurrentStepIndex === activeStepOrder.length - 1;
  const skuFlagCount = Object.values(visibleSkuSignalDrafts).reduce((count, draft) => count + activeSkuFlagIds(draft).length, 0);
  const serviceFlagCount = Object.values(serviceSignalDrafts).reduce((count, draft) => count + activeServiceFlagIds(draft).length, 0);
  const rankingSignalCount = serviceRankings.length + retailRankings.length;
  const costChangedCount = changedRowCount(rows, (row) => stockCostChanged(workingCatalog, stockBySku, row));
  const retailPriceChangedCount = changedRowCount(rows, (row) => stockRetailPriceChanged(workingCatalog, stockBySku, row));
  const serviceStepIndex = activeStepOrder.indexOf('service');
  const rankingsStepIndex = activeStepOrder.indexOf('rankings');
  const retailSalesStepIndex = activeStepOrder.indexOf('retail-sales');
  const serviceSalesStepIndex = activeStepOrder.indexOf('service-sales');
  const stockStepSatisfied = !isFirstObservation || countedSkuCount > 0;
  const skuFlagsValid = !skuFlagsHaveEmptyRequiredValues(visibleSkuSignalDrafts);
  const serviceFlagsValid = !serviceFlagsHaveEmptyRequiredValues(serviceSignalDrafts);
  const draftState = useMemo<StockUpdateDraftState>(
    () => ({
      catalog: workingCatalog,
      currentStepId,
      initialObservedAt: initialObservedAtRef.current,
      notes,
      observedAt,
      regimeHint,
      retailSalesChoice,
      retailSalesDrafts,
      retailRankings,
      recordOrderExpectedArrivalDate,
      recordOrderLeadTimeMeanDays,
      recordOrderLeadTimeVariability,
      rows,
      serviceSalesChoice,
      serviceSalesDrafts,
      serviceRankings,
      serviceSignalDrafts,
      skuSignalDrafts: visibleSkuSignalDrafts,
      stockStepChoices,
      stockBySku,
      stockView,
      unlockedStepCount,
    }),
    [
      workingCatalog,
      currentStepId,
      notes,
      observedAt,
      regimeHint,
      retailSalesChoice,
      retailSalesDrafts,
      retailRankings,
      recordOrderExpectedArrivalDate,
      recordOrderLeadTimeMeanDays,
      recordOrderLeadTimeVariability,
      rows,
      serviceSalesChoice,
      serviceSalesDrafts,
      serviceRankings,
      serviceSignalDrafts,
      visibleSkuSignalDrafts,
      stockStepChoices,
      stockBySku,
      stockView,
      unlockedStepCount,
    ],
  );
  const hasMeaningfulChanges = useMemo(() => hasMeaningfulStockUpdateChanges(draftState), [draftState]);
  const canDiscardChanges = hasMeaningfulChanges || hasSavedDraft || draftWasRestored;
  const hasAnyLiveDraft = canDiscardChanges;

  function persistStockRowOrder(nextRows: StockRow[]) {
    const orderedSkuIds = nextRows.map((row) => row.skuId);
    setPersistedStockRowOrder(orderedSkuIds);
    writeStockRowOrder(stockRowOrderStorageKey, orderedSkuIds);
  }

  function handleStockRowReorder(activeSkuId: string, overSkuId: string) {
    setRows((currentRows) => {
      const nextRows = reorderStockRows(currentRows, activeSkuId, overSkuId);
      if (nextRows !== currentRows) {
        persistStockRowOrder(nextRows);
      }
      return nextRows;
    });
  }

  function handleRetailSalesRowReorder(activeId: string, overId: string) {
    const nextIds = reorderStringIds(retailSkuIds, activeId, overId);
    setPersistedRetailSalesRowOrder(nextIds);
    writeStockRowOrder(retailSalesRowOrderStorageKey, nextIds);
  }

  function handleServiceSalesRowReorder(activeId: string, overId: string) {
    const nextIds = reorderStringIds(serviceIds, activeId, overId);
    setPersistedServiceSalesRowOrder(nextIds);
    writeStockRowOrder(serviceSalesRowOrderStorageKey, nextIds);
  }

  function applyHydratedDraftState({
    hydratedState,
    nextEditSession,
  }: {
    hydratedState: ReturnType<typeof buildDraftsFromObservationInput>;
    nextEditSession: EditSessionState | null;
  }) {
    initialObservedAtRef.current = hydratedState.observedAt;
    setEditSession(nextEditSession);
    setCurrentStepId(hydratedState.currentStepId);
    setUnlockedStepCount(hydratedState.unlockedStepCount);
    setObservedAt(hydratedState.observedAt);
    setNotes(hydratedState.notes);
    setStockView(hydratedState.stockView);
    setRows(hydratedState.rows);
    setRetailSalesChoice(hydratedState.retailSalesChoice);
    setServiceSalesChoice(hydratedState.serviceSalesChoice);
    setRetailSalesDrafts(hydratedState.retailSalesDrafts);
    setServiceSalesDrafts(hydratedState.serviceSalesDrafts);
    setSkuSignalDrafts(hydratedState.skuSignalDrafts);
    setRecordOrderExpectedArrivalDate(hydratedState.recordOrderExpectedArrivalDate);
    setRecordOrderLeadTimeMeanDays(hydratedState.recordOrderLeadTimeMeanDays);
    setRecordOrderLeadTimeVariability(hydratedState.recordOrderLeadTimeVariability);
    setStockStepChoices(hydratedState.stockStepChoices);
    setServiceSignalDrafts(hydratedState.serviceSignalDrafts);
    setRegimeHint(hydratedState.regimeHint);
    setServiceRankings(hydratedState.serviceRankings);
    setRetailRankings(hydratedState.retailRankings);
  }

  function hydrateEditSession(nextEditSession: EditSessionState, baselineRows: StockRow[]) {
    const editCatalog = catalog ?? visibleCatalog;
    if (!editCatalog) {
      return;
    }
    const hydratedEditState = buildDraftsFromObservationInput({
      baselineRows,
      catalog: editCatalog,
      currency,
      input: nextEditSession.input,
      stepOrder: activeStepOrder,
      usdToKhrExchangeRate,
    });
    applyHydratedDraftState({
      hydratedState: hydratedEditState,
      nextEditSession,
    });
    setHasSavedDraft(false);
    setDraftWasRestored(false);
    setPendingEditSession(null);
    setReplaceDraftDialogOpen(false);
    navigate(location.pathname, { replace: true, state: null });
  }

  useEffect(() => {
    setPersistedStockRowOrder(readStockRowOrder(stockRowOrderStorageKey));
  }, [stockRowOrderStorageKey]);

  useEffect(() => {
    setPersistedRetailSalesRowOrder(readStockRowOrder(retailSalesRowOrderStorageKey));
  }, [retailSalesRowOrderStorageKey]);

  useEffect(() => {
    setPersistedServiceSalesRowOrder(readStockRowOrder(serviceSalesRowOrderStorageKey));
  }, [serviceSalesRowOrderStorageKey]);

  useEffect(() => {
    if (!workingCatalog) {
      setRows(buildOrderedInitialRows(workingCatalog));
      return;
    }

    const baselineRows = buildOrderedInitialRows(workingCatalog);
    const nextEditSession = incomingEditSession
      ? {
          observationId: incomingEditSession.observationId,
          input: incomingEditSession.input,
        }
      : null;
    if (!draftHydrationCheckedRef.current) {
      draftHydrationCheckedRef.current = true;
      if (nextEditSession) {
        if (hasAnyLiveDraft) {
          setPendingEditSession(nextEditSession);
          setReplaceDraftDialogOpen(true);
          return;
        }
        hydrateEditSession(nextEditSession, baselineRows);
        return;
      }

      const hydratedDraft = hydrateStockUpdateDraft({
        baselineRows,
        catalog: workingCatalog,
        draft: readStockUpdateDraft(draftStorageKey),
        stepOrder: activeStepOrder,
      });

      if (hydratedDraft) {
        setCurrentStepId(hydratedDraft.currentStepId);
        setUnlockedStepCount(hydratedDraft.unlockedStepCount);
        setObservedAt(hydratedDraft.observedAt);
        setNotes(hydratedDraft.notes);
        setStockView(hydratedDraft.stockView);
        setRows(hydratedDraft.rows);
        setRetailSalesChoice(hydratedDraft.retailSalesChoice);
        setServiceSalesChoice(hydratedDraft.serviceSalesChoice);
        setRetailSalesDrafts(hydratedDraft.retailSalesDrafts);
        setServiceSalesDrafts(hydratedDraft.serviceSalesDrafts);
        setSkuSignalDrafts(hydratedDraft.skuSignalDrafts);
        setRecordOrderExpectedArrivalDate(hydratedDraft.recordOrderExpectedArrivalDate);
        setRecordOrderLeadTimeMeanDays(hydratedDraft.recordOrderLeadTimeMeanDays);
        setRecordOrderLeadTimeVariability(hydratedDraft.recordOrderLeadTimeVariability);
        setStockStepChoices(hydratedDraft.stockStepChoices);
        setServiceSignalDrafts(hydratedDraft.serviceSignalDrafts);
        setRegimeHint(hydratedDraft.regimeHint);
        setServiceRankings(hydratedDraft.serviceRankings);
        setRetailRankings(hydratedDraft.retailRankings);
        setHasSavedDraft(true);
        setDraftWasRestored(true);
        return;
      }

      removeStockUpdateDraft(draftStorageKey);
      setHasSavedDraft(false);
      setDraftWasRestored(false);
    }

    if (!hasAnyLiveDraft && !editSession) {
      setRows(baselineRows);
    }
  }, [activeStepOrder, buildOrderedInitialRows, currency, draftStorageKey, editSession, hasAnyLiveDraft, incomingEditSession, location.pathname, navigate, observations, usdToKhrExchangeRate, workingCatalog]);

  useEffect(() => {
    if (!(catalog ?? visibleCatalog) || !draftHydrationCheckedRef.current || !incomingEditSession) {
      return;
    }

    const nextEditSession = {
      observationId: incomingEditSession.observationId,
      input: incomingEditSession.input,
    } satisfies EditSessionState;
    if (editSession?.observationId === nextEditSession.observationId) {
      navigate(location.pathname, { replace: true, state: null });
      return;
    }
    if (pendingEditSession?.observationId === nextEditSession.observationId) {
      return;
    }
    if (hasAnyLiveDraft) {
      setPendingEditSession(nextEditSession);
      setReplaceDraftDialogOpen(true);
      return;
    }

    hydrateEditSession(nextEditSession, buildOrderedInitialRows(catalog ?? visibleCatalog));
  }, [
    buildOrderedInitialRows,
    catalog,
    editSession?.observationId,
    hasAnyLiveDraft,
    incomingEditSession,
    location.pathname,
    navigate,
    observations,
    pendingEditSession?.observationId,
    visibleCatalog,
  ]);

  useEffect(() => {
    latestDraftStateRef.current = draftState;
    if (!hasMeaningfulChanges) {
      skipNextDraftPersistRef.current = false;
    }
  }, [draftState, hasMeaningfulChanges]);

  useEffect(() => {
    const previous = previousMoneyPreferencesRef.current;
    if (previous.currency === currency && previous.usdToKhrExchangeRate === usdToKhrExchangeRate) {
      return;
    }

    setServiceSignalDrafts((current) =>
      Object.fromEntries(
        Object.entries(current).map(([serviceId, draft]) => [
          serviceId,
          {
            ...draft,
            price: reformatMoneyDraftValue({
              value: draft.price,
              previousCurrency: previous.currency,
              previousUsdToKhrExchangeRate: previous.usdToKhrExchangeRate,
              nextCurrency: currency,
              nextUsdToKhrExchangeRate: usdToKhrExchangeRate,
            }),
          },
        ]),
      ),
    );
    previousMoneyPreferencesRef.current = { currency, usdToKhrExchangeRate };
  }, [currency, usdToKhrExchangeRate]);

  useEffect(() => {
    function persistLatestDraft() {
      if (skipNextDraftPersistRef.current) {
        skipNextDraftPersistRef.current = false;
        return;
      }
      const latestState = latestDraftStateRef.current;
      if (latestState) {
        writeStockUpdateDraft(latestState, draftStorageKey);
      }
    }

    function handleBeforeUnload() {
      persistLatestDraft();
    }

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      persistLatestDraft();
    };
  }, [draftStorageKey]);

  function updateRow(skuId: string, patch: Partial<StockRow>) {
    setRows((current) => current.map((row) => (row.skuId === skuId ? { ...row, ...patch } : row)));
  }

  function updateSkuSignalDraft(skuId: string, updater: (draft: SkuSignalDraft) => SkuSignalDraft) {
    setSkuSignalDrafts((current) => ({
      ...current,
      [skuId]: updater(current[skuId] ?? createEmptySkuSignalDraft()),
    }));
  }

  function updateRetailSalesDraft(skuId: string, value: string) {
    setRetailSalesDrafts((current) => {
      if (value === '') {
        const next = { ...current };
        delete next[skuId];
        return next;
      }
      return { ...current, [skuId]: value };
    });
  }

  function updateServiceSalesDraft(serviceId: string, value: string) {
    setServiceSalesDrafts((current) => {
      if (value === '') {
        const next = { ...current };
        delete next[serviceId];
        return next;
      }
      return { ...current, [serviceId]: value };
    });
  }

  function updateServiceSignalDraft(serviceId: string, updater: (draft: ServiceSignalDraft) => ServiceSignalDraft) {
    setServiceSignalDrafts((current) => ({
      ...current,
      [serviceId]: updater(current[serviceId] ?? createEmptyServiceSignalDraft()),
    }));
  }

  function updateStockStepChoice(stepId: OptionalStockStepId, choice: OptionalStockStepChoice) {
    setStockStepChoices((current) => ({
      ...current,
      [stepId]: choice,
    }));
  }

  function resetCostStepRows() {
    setRows((current) => current.map((row) => ({ ...row, costPerUnit: baselineStockRow(workingCatalog, stockBySku, row.skuId).costPerUnit })));
  }

  function resetRetailPriceStepRows() {
    setRows((current) => current.map((row) => ({ ...row, productPrice: baselineStockRow(workingCatalog, stockBySku, row.skuId).productPrice })));
  }

  function resetSkuFlagRows() {
    setSkuSignalDrafts((current) => (lane.id === 'record-order' ? skuWithoutEventDrafts(current) : {}));
  }

  function handleSkipOptionalStockStep(stepId: OptionalStockStepId) {
    const shouldAdvanceAfterSkip = stockStepChoices[stepId] === 'unset';
    updateStockStepChoice(stepId, 'no');
    if (stepId === 'stock-cost') {
      resetCostStepRows();
    }
    if (stepId === 'stock-price') {
      resetRetailPriceStepRows();
    }
    if (stepId === 'stock-flags') {
      resetSkuFlagRows();
    }
    if (!shouldAdvanceAfterSkip) {
      return;
    }
    const targetIndex = activeStepOrder.indexOf(stepId);
    if (targetIndex >= 0 && targetIndex < activeStepOrder.length - 1) {
      const nextIndex = targetIndex + 1;
      setUnlockedStepCount((current) => Math.max(current, nextIndex + 1));
      setCurrentStepId(activeStepOrder[nextIndex]!);
    }
  }

  function buildPayload() {
    if (lane.id === 'sales-update') {
      const payload = createEmptyObservationInput({
        observedAt: observedAtIso ?? new Date().toISOString(),
        notes: notes.trim() || null,
      });
      const retailSalesSnapshot = retailSkuIds.flatMap((skuId) => {
        const value = retailSalesDrafts[skuId]?.trim();
        if (!value) {
          return [];
        }
        return [{ skuId, unitsSold: Number(value) }];
      }).filter((entry) => Number.isFinite(entry.unitsSold) && entry.unitsSold >= 0);
      const serviceSalesSnapshot = serviceIds.flatMap((serviceId) => {
        const value = serviceSalesDrafts[serviceId]?.trim();
        if (!value) {
          return [];
        }
        return [{ serviceId, unitsSold: Number(value) }];
      }).filter((entry) => Number.isFinite(entry.unitsSold) && entry.unitsSold >= 0);
      const derivedRetailRankings = [...retailSalesSnapshot]
        .sort((left, right) => right.unitsSold - left.unitsSold || left.skuId.localeCompare(right.skuId))
        .map((entry) => entry.skuId);
      const derivedServiceRankings = [...serviceSalesSnapshot]
        .sort((left, right) => right.unitsSold - left.unitsSold || left.serviceId.localeCompare(right.serviceId))
        .map((entry) => entry.serviceId);
      payload.retailSalesSnapshot = retailSalesSnapshot;
      payload.serviceSalesSnapshot = serviceSalesSnapshot;
      payload.retailRankings = retailSalesChoice === 'yes' ? derivedRetailRankings : retailRankings;
      payload.serviceRankings = serviceSalesChoice === 'yes' ? derivedServiceRankings : serviceRankings;
      payload.retailStockouts = Object.entries(visibleSkuSignalDrafts)
        .filter(([skuId, draft]) => draft.blockedEnabled && Boolean(workingCatalog?.skus.find((sku) => sku.skuId === skuId)?.soldAsProduct))
        .map(([skuId]) => skuId);
      payload.serviceStockouts = [];
      payload.regimeHint = regimeHint || null;
      return payload;
    }
    if (lane.id === 'record-order') {
      const payload = createEmptyObservationInput({
        observedAt: observedAtIso ?? new Date().toISOString(),
        notes: notes.trim() || null,
      });
      const tableMeanDays =
        recordOrderLeadTimeMeanDays.trim() === ''
          ? null
          : Number(recordOrderLeadTimeMeanDays);
      const orderedEntries = Object.entries(visibleSkuSignalDrafts).filter(([, draft]) => {
        const quantity = draft.orderedQuantity.trim();
        return quantity !== '' && Number(quantity) > 0;
      });
      payload.orderSignals = Object.entries(visibleSkuSignalDrafts).flatMap(([skuId, draft]) => {
        const quantity = draft.orderedQuantity.trim();
        if (quantity === '' || Number(quantity) <= 0) {
          return [];
        }
        return [{
          skuId,
          orderPlaced: true,
          receiptArrived: false,
          approximateOrderQuantity: Number(quantity),
          approximateReceiptQuantity: null,
          placementTimestamp: observedAtIso ?? new Date().toISOString(),
          receiptTimestamp: dateInputToIso(recordOrderExpectedArrivalDate),
          leadTimeDaysHint: tableMeanDays,
        }];
      });
      payload.leadTimeHints = orderedEntries.flatMap(([skuId]) => {
        const variabilityClass =
          recordOrderLeadTimeVariability ||
          (tableMeanDays != null ? leadTimeVariabilityDefaults.get(skuId) : null) ||
          null;
        if ((tableMeanDays == null || !Number.isFinite(tableMeanDays) || tableMeanDays < 0) && variabilityClass == null) {
          return [];
        }
        const compatibilityRange = compatibilityRangeForClass(tableMeanDays, variabilityClass);
        return [{
          skuId,
          typicalDays: tableMeanDays,
          lowDays: compatibilityRange?.lowDays ?? null,
          highDays: compatibilityRange?.highDays ?? null,
          variabilityClass,
        }];
      });
      payload.retailStockouts = Object.entries(visibleSkuSignalDrafts)
        .filter(([skuId, draft]) => draft.blockedEnabled && Boolean(workingCatalog?.skus.find((sku) => sku.skuId === skuId)?.soldAsProduct))
        .map(([skuId]) => skuId);
      payload.regimeHint = regimeHint || null;
      return payload;
    }
    if (editSession) {
      return buildFullObservationPayload({
        currency,
        editSession,
        notes,
        observedAtIso,
        regimeHint,
        retailRankings,
        rows,
        serviceRankings,
        serviceSignalDrafts,
        skuSignalDrafts: visibleSkuSignalDrafts,
        usdToKhrExchangeRate,
        catalog: workingCatalog,
        stockBySku,
      });
    }
    const payload = createEmptyObservationInput({
      observedAt: observedAtIso ?? new Date().toISOString(),
      notes: notes.trim() || null,
    });
    payload.stockSnapshot = rows.filter((row) =>
      editSession
        ? shouldIncludeStockRowInEditPayload({ editSession, row, stockBySku })
        : stockRowChanged(catalog, stockBySku, row),
    );
    payload.serviceRankings = serviceRankings;
    payload.retailRankings = retailRankings;
    payload.orderSignals = Object.entries(visibleSkuSignalDrafts).flatMap(([skuId, draft]) => {
      const nextSignals = [];
      if (draft.orderEnabled && Number(draft.orderedQuantity) > 0) {
        nextSignals.push({
          skuId,
          orderPlaced: true,
          receiptArrived: false,
          approximateOrderQuantity: Number(draft.orderedQuantity),
          approximateReceiptQuantity: null,
        });
      }
      if (draft.receiptEnabled && Number(draft.receiptQuantity) > 0) {
        nextSignals.push({
          skuId,
          orderPlaced: false,
          receiptArrived: true,
          approximateOrderQuantity: null,
          approximateReceiptQuantity: Number(draft.receiptQuantity),
        });
      }
      return nextSignals;
    });
    payload.retailPrices = [];
    payload.servicePrices = Object.entries(serviceSignalDrafts)
      .filter(([serviceId, draft]) =>
        serviceDisplayPriceChanged(catalog, serviceId, draft, currency, usdToKhrExchangeRate),
      )
      .map(([serviceId, draft]) => ({
        serviceId,
        price: usdMoneyFromDisplay(Number(draft.price), currency, usdToKhrExchangeRate),
      }));
    payload.retailStockouts = Object.entries(visibleSkuSignalDrafts)
      .filter(([skuId, draft]) => draft.blockedEnabled && Boolean(draft.blockedState) && Boolean(workingCatalog?.skus.find((sku) => sku.skuId === skuId)?.soldAsProduct))
      .map(([skuId]) => skuId);
    payload.serviceStockouts = Object.entries(serviceSignalDrafts)
      .filter(([, draft]) => draft.blockedEnabled && Boolean(draft.blockedState))
      .map(([serviceId]) => serviceId);
    payload.adjustmentSignals = [];
    payload.regimeHint = regimeHint || null;
    return payload;
  }

  const previewPayload = buildPayload();
  const previewParts = observationCompositionParts(previewPayload);
  const requiresFirstStockSnapshot = isFirstObservation && previewPayload.stockSnapshot.length === 0;
  const submitDisabled =
    isSaving ||
    (stockStepChoices['stock-flags'] === 'yes' && !skuFlagsValid) ||
    (lane.id !== 'stock-count' && !serviceFlagsValid) ||
    !hasStructuredObservationSignal(previewPayload) ||
    (lane.id !== 'sales-update' && lane.id !== 'record-order' && requiresFirstStockSnapshot);

  const stepStates = [
    {
      id: 'observed-at',
      title: t(STOCK_UPDATE_STEP_COPY['observed-at'].titleKey),
      description: observedAtIso ? t('stockUpdateStepObservedAtReady') : t('stockUpdateStepObservedAtMissing'),
      complete: Boolean(observedAtIso),
    },
    {
      id: 'report-notes',
      title: t(STOCK_UPDATE_STEP_COPY['report-notes'].titleKey),
      description: notes.trim() ? t('stockUpdateStepNotesAdded') : t('stockUpdateStepNotesOptional'),
      complete: true,
    },
    ...(lane.id === 'record-order'
      ? [
          {
            id: 'reorder' as const,
            title: 'Reorder table',
            description:
              orderSignalCount > 0
                ? translateUiLiteral(language, '{count} current order row{suffix}', {
                    count: orderSignalCount,
                    suffix: orderSignalCount === 1 ? '' : 's',
                  })
                : translateUiLiteral(language, 'Optional reorder capture'),
            complete: true,
          },
        ]
      : []),
    ...(lane.id === 'sales-update'
      ? [
          {
            id: 'retail-sales' as const,
            title: 'Retail / sellable SKU sales',
            description:
              retailSalesChoice === 'yes'
                ? retailSalesCount > 0
                  ? translateUiLiteral(language, '{count} exact retail sales row{suffix}', { count: retailSalesCount, suffix: retailSalesCount === 1 ? '' : 's' })
                  : translateUiLiteral(language, 'Exact counts')
                : retailSalesChoice === 'no'
                  ? retailRankings.length > 0
                    ? translateUiLiteral(language, '{count} ranked retail item{suffix}', { count: retailRankings.length, suffix: retailRankings.length === 1 ? '' : 's' })
                    : translateUiLiteral(language, 'Ranking fallback')
                  : t('stockUpdateStepChooseYesNo'),
            complete:
              retailSalesChoice === 'yes'
                ? true
                : retailSalesChoice === 'no'
                  ? true
                  : false,
          },
          {
            id: 'service-sales' as const,
            title: 'Sellable services',
            description:
              serviceSalesChoice === 'yes'
                ? serviceSalesCount > 0
                  ? translateUiLiteral(language, '{count} exact service sales row{suffix}', { count: serviceSalesCount, suffix: serviceSalesCount === 1 ? '' : 's' })
                  : translateUiLiteral(language, 'Exact counts')
                : serviceSalesChoice === 'no'
                  ? serviceRankings.length > 0
                    ? translateUiLiteral(language, '{count} ranked service{suffix}', { count: serviceRankings.length, suffix: serviceRankings.length === 1 ? '' : 's' })
                    : translateUiLiteral(language, 'Ranking fallback')
                  : t('stockUpdateStepChooseYesNo'),
            complete:
              serviceSalesChoice === 'yes'
                ? true
                : serviceSalesChoice === 'no'
                  ? true
                  : false,
          },
        ]
      : lane.id === 'record-order'
        ? []
        : [{
            id: 'stock',
            title: t(STOCK_UPDATE_STEP_COPY.stock.titleKey),
            description:
              isFirstObservation
                ? t('stockUpdateStepCountAtLeastOneSku')
                : t('stockUpdateStepOptionalLater'),
            complete: stockStepSatisfied,
          }]),
    {
      id: 'stock-cost',
      title: t('stockUpdateCostIfChanged'),
      description:
        stockStepChoices['stock-cost'] === 'no'
          ? t('stockUpdateStepSkipped')
          : costChangedCount > 0
            ? t('stockUpdateStepRowsChanged', { count: costChangedCount, suffix: costChangedCount === 1 ? '' : 's' })
            : stockStepChoices['stock-cost'] === 'yes'
              ? t('stockUpdateStepOptional')
              : t('stockUpdateStepChooseYesNo'),
      complete: stockStepChoices['stock-cost'] !== 'unset',
    },
    {
      id: 'stock-price',
      title: t('stockUpdateRetailPriceIfChanged'),
      description:
        stockStepChoices['stock-price'] === 'no'
          ? t('stockUpdateStepSkipped')
          : retailPriceChangedCount > 0
            ? t('stockUpdateStepRowsChanged', { count: retailPriceChangedCount, suffix: retailPriceChangedCount === 1 ? '' : 's' })
            : stockStepChoices['stock-price'] === 'yes'
              ? t('stockUpdateStepOptional')
              : t('stockUpdateStepChooseYesNo'),
      complete: stockStepChoices['stock-price'] !== 'unset',
    },
    {
      id: 'stock-flags',
      title: t('stockUpdateAddFlags'),
      description:
        stockStepChoices['stock-flags'] === 'no'
          ? t('stockUpdateStepSkipped')
          : skuFlagCount > 0
            ? t('stockUpdateStepSignalsAdded', { count: skuFlagCount, suffix: skuFlagCount === 1 ? '' : 's' })
            : stockStepChoices['stock-flags'] === 'yes'
              ? t('stockUpdateStepOptional')
              : t('stockUpdateStepChooseYesNo'),
      complete: stockStepChoices['stock-flags'] !== 'unset' && (stockStepChoices['stock-flags'] !== 'yes' || skuFlagsValid),
    },
    {
      id: 'service',
      title: t(STOCK_UPDATE_STEP_COPY.service.titleKey),
      description: serviceFlagCount > 0 ? t('stockUpdateStepSignalsAdded', { count: serviceFlagCount, suffix: serviceFlagCount === 1 ? '' : 's' }) : t('stockUpdateStepOptional'),
      complete: (serviceFlagCount > 0 && serviceFlagsValid) || (serviceStepIndex >= 0 && normalizedCurrentStepIndex > serviceStepIndex),
    },
    {
      id: 'rankings',
      title: t(STOCK_UPDATE_STEP_COPY.rankings.titleKey),
      description: rankingSignalCount > 0 ? t('stockUpdateStepSignalsAdded', { count: rankingSignalCount, suffix: rankingSignalCount === 1 ? '' : 's' }) : t('stockUpdateStepOptional'),
      complete: rankingSignalCount > 0 || (rankingsStepIndex >= 0 && normalizedCurrentStepIndex > rankingsStepIndex),
    },
    {
      id: 'context',
      title: t(STOCK_UPDATE_STEP_COPY.context.titleKey),
      description: regimeHint ? t('stockUpdateStepRegimeSummary', { value: regimeHint.replaceAll('_', ' ') }) : t('stockUpdateStepRegimeOptional'),
      complete: true,
    },
    {
      id: 'review',
      title: t(STOCK_UPDATE_STEP_COPY.review.titleKey),
      description: submitDisabled ? t('stockUpdateStepNotReady') : t('stockUpdateStepReadyToSave'),
      complete: !submitDisabled,
    },
  ].filter((step) => activeStepOrder.includes(step.id)) satisfies Array<{ id: StockUpdateStepId; title: string; description: string; complete: boolean }>;

  const canContinueCurrentStep =
    currentStepId === 'observed-at'
      ? Boolean(observedAtIso)
      : currentStepId === 'context' || currentStepId === 'report-notes'
        ? true
        : currentStepId === 'retail-sales'
          ? retailSalesChoice !== 'unset'
        : currentStepId === 'service-sales'
          ? serviceSalesChoice !== 'unset'
        : currentStepId === 'reorder'
          ? true
        : currentStepId === 'stock'
          ? stockStepSatisfied
          : currentStepId === 'stock-cost'
            ? stockStepChoices['stock-cost'] !== 'unset'
            : currentStepId === 'stock-price'
              ? stockStepChoices['stock-price'] !== 'unset'
              : currentStepId === 'stock-flags'
                ? stockStepChoices['stock-flags'] !== 'unset' && (stockStepChoices['stock-flags'] !== 'yes' || skuFlagsValid)
        : currentStepId === 'service'
          ? serviceFlagsValid
          : true;

  const addSignalGuidanceText =
    lane.id === 'stock-count'
      ? t('stockUpdateGuidanceAddStockCountSignal')
      : lane.id === 'sales-update'
        ? translateUiLiteral(language, 'Add at least one retail sales count, service sales count, row event, retail ranking, service ranking, or sales pattern before saving.')
        : lane.id === 'record-order'
          ? translateUiLiteral(language, 'Add at least one current order, row event, or sales pattern before saving.')
        : t('stockUpdateGuidanceAddSignal');

  const stepGuidance =
    currentStepId === 'observed-at' && !observedAtIso
      ? t('stockUpdateGuidanceChooseObservedAt')
      : currentStepId === 'reorder'
        ? null
      : currentStepId === 'retail-sales' && retailSalesChoice === 'unset'
        ? t('stockUpdateGuidanceChooseOptionalStep')
        : currentStepId === 'service-sales' && serviceSalesChoice === 'unset'
          ? t('stockUpdateGuidanceChooseOptionalStep')
      : currentStepId === 'stock' && !stockStepSatisfied
        ? t('stockUpdateGuidanceCountOneSku')
        : currentStepId === 'stock-cost' && stockStepChoices['stock-cost'] === 'unset'
          ? t('stockUpdateGuidanceChooseOptionalStep')
          : currentStepId === 'stock-price' && stockStepChoices['stock-price'] === 'unset'
            ? t('stockUpdateGuidanceChooseOptionalStep')
            : currentStepId === 'stock-flags' && stockStepChoices['stock-flags'] === 'unset'
              ? t('stockUpdateGuidanceChooseOptionalStep')
              : currentStepId === 'stock-flags' && stockStepChoices['stock-flags'] === 'yes' && !skuFlagsValid
                ? t('stockUpdateGuidanceFillSkuFlags')
          : currentStepId === 'service' && lane.id !== 'stock-count' && !serviceFlagsValid
            ? t('stockUpdateGuidanceFillServiceFlags')
        : currentStepId === 'review' && stockStepChoices['stock-flags'] === 'yes' && !skuFlagsValid
            ? t('stockUpdateGuidanceFillSkuFlagsSave')
            : currentStepId === 'review' && lane.id !== 'stock-count' && !serviceFlagsValid
              ? t('stockUpdateGuidanceFillServiceFlagsSave')
          : currentStepId === 'review' && !hasStructuredObservationSignal(previewPayload)
                ? addSignalGuidanceText
          : currentStepId === 'review' && lane.id !== 'sales-update' && lane.id !== 'record-order' && isFirstObservation && previewPayload.stockSnapshot.length === 0
            ? t('stockUpdateGuidanceFirstUpdateNeedsCount')
            : null;

  const reviewBlockers = [
    ...(stockStepChoices['stock-flags'] === 'yes' && !skuFlagsValid ? [t('stockUpdateGuidanceFillSkuFlagsSave')] : []),
    ...(lane.id !== 'stock-count' && !serviceFlagsValid ? [t('stockUpdateGuidanceFillServiceFlagsSave')] : []),
    ...(!hasStructuredObservationSignal(previewPayload)
      ? [addSignalGuidanceText]
      : []),
    ...(lane.id !== 'sales-update' && lane.id !== 'record-order' && requiresFirstStockSnapshot
      ? [t('stockUpdateGuidanceFirstUpdateNeedsCount')]
      : []),
  ];

  function selectStep(stepId: StockUpdateStepId) {
    const targetIndex = activeStepOrder.indexOf(stepId);
    if (targetIndex >= 0 && targetIndex < unlockedStepCount) {
      setCurrentStepId(stepId);
    }
  }

  function goToNextStep() {
    if (!canContinueCurrentStep || isLastStep) {
      return;
    }
    const nextIndex = normalizedCurrentStepIndex + 1;
    setUnlockedStepCount((current) => Math.max(current, nextIndex + 1));
    setCurrentStepId(activeStepOrder[nextIndex]!);
  }

  function goToPreviousStep() {
    if (normalizedCurrentStepIndex === 0) {
      return;
    }
    setCurrentStepId(activeStepOrder[normalizedCurrentStepIndex - 1]!);
  }

  function resetRecordUpdateState() {
    const nextObservedAt = localDateTimeInputValue(null);
    initialObservedAtRef.current = nextObservedAt;
    setEditSession(null);
    setPendingEditSession(null);
    setReplaceDraftDialogOpen(false);
    setCurrentStepId('observed-at');
    setUnlockedStepCount(1);
    setObservedAt(nextObservedAt);
    setNotes('');
    setNotesPlaceholderKey(randomReportNotePlaceholderKey());
    setStockView('priority');
    setRows(buildOrderedInitialRows(catalog));
    setRetailSalesChoice('unset');
    setServiceSalesChoice('unset');
    setRetailSalesDrafts({});
    setServiceSalesDrafts({});
    setSkuSignalDrafts({});
    setRecordOrderExpectedArrivalDate('');
    setRecordOrderLeadTimeMeanDays('');
    setRecordOrderLeadTimeVariability('');
    setStockStepChoices(createDefaultStockStepChoices());
    setServiceSignalDrafts({});
    setRegimeHint('');
    setServiceRankings([]);
    setRetailRankings([]);
    setError(null);
  }

  function handleDiscardChanges() {
    skipNextDraftPersistRef.current = true;
    removeStockUpdateDraft(draftStorageKey);
    setHasSavedDraft(false);
    setDraftWasRestored(false);
    resetRecordUpdateState();
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if (!observedAtIso) {
      setError(t('stockUpdateSaveObservedAtError'));
      return;
    }
    const payload = buildPayload();
    if (stockStepChoices['stock-flags'] === 'yes' && !skuFlagsValid) {
      setError(t('stockUpdateGuidanceFillSkuFlagsSave'));
      return;
    }
    if (lane.id !== 'stock-count' && !serviceFlagsValid) {
      setError(t('stockUpdateGuidanceFillServiceFlagsSave'));
      return;
    }
    if (!hasStructuredObservationSignal(payload)) {
      setError(addSignalGuidanceText);
      return;
    }
    if (lane.id !== 'sales-update' && lane.id !== 'record-order' && isFirstObservation && payload.stockSnapshot.length === 0) {
      setError(t('stockUpdateGuidanceFirstUpdateNeedsCount'));
      return;
    }
    try {
      if (editSession) {
        await updateSenaObservation({
          observationId: editSession.observationId,
          input: payload,
        });
      } else {
        await ingestSenaObservation(payload);
      }
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : t('stockUpdateSaveFailed'));
      return;
    }

    skipNextDraftPersistRef.current = true;
    removeStockUpdateDraft(draftStorageKey);
    setHasSavedDraft(false);
    setDraftWasRestored(false);
    resetRecordUpdateState();
    navigate('/', { replace: true, state: null });
    void runWorkspacePreparation(() => triggerSenaRun({ algorithmVersion: 'sena-analysis-v3' }));
  }

  const discardChangesDescription =
    t('stockSessionDiscardDescription');
  const { discardConfirmDialog, requestDiscard } = useDiscardChangesConfirm({
    enabled: canDiscardChanges,
    description: discardChangesDescription,
    onDiscard: handleDiscardChanges,
  });
  const pendingNavigationRef = useRef<PendingNavigationState | null>(null);

  function persistDraftForLater() {
    const latestState = latestDraftStateRef.current;
    if (!latestState) {
      return;
    }
    const wroteDraft = writeStockUpdateDraft(latestState, draftStorageKey);
    setHasSavedDraft(wroteDraft);
    setDraftWasRestored(false);
  }

  useEffect(() => {
    function resolveTargetPath(anchor: HTMLAnchorElement) {
      const url = new URL(anchor.href, window.location.href);
      if (url.origin !== window.location.origin) {
        return null;
      }
      if (url.hash.startsWith('#/')) {
        return url.hash.slice(1);
      }
      return `${url.pathname}${url.search}${url.hash}`;
    }

    function currentBrowserPath() {
      if (window.location.hash.startsWith('#/')) {
        return window.location.hash.slice(1);
      }
      return `${window.location.pathname}${window.location.search}${window.location.hash}`;
    }

    function queueNavigation(continueNavigation: () => void) {
      pendingNavigationRef.current = { continueNavigation };
      setLeaveDraftDialogOpen(true);
    }

    function handleDocumentClick(event: MouseEvent) {
      if (!canDiscardChanges || event.defaultPrevented || event.button !== 0) {
        return;
      }
      if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) {
        return;
      }

      const target = event.target;
      if (!(target instanceof Element)) {
        return;
      }

      const anchor = target.closest('a[href]');
      if (!(anchor instanceof HTMLAnchorElement)) {
        return;
      }

      const currentPath = `${location.pathname}${location.search}${location.hash}`;
      const nextPath = resolveTargetPath(anchor);
      if (!nextPath || nextPath === currentPath) {
        return;
      }

      event.preventDefault();
      queueNavigation(() => navigate(nextPath));
    }

    function handleHistoryNavigation() {
      if (!canDiscardChanges) {
        return;
      }

      const previousPath = `${location.pathname}${location.search}${location.hash}`;
      const nextPath = currentBrowserPath();
      if (nextPath === previousPath) {
        return;
      }

      navigate(previousPath, { replace: true });
      queueNavigation(() => navigate(nextPath));
    }

    document.addEventListener('click', handleDocumentClick, true);
    window.addEventListener('popstate', handleHistoryNavigation);
    window.addEventListener('hashchange', handleHistoryNavigation);

    return () => {
      document.removeEventListener('click', handleDocumentClick, true);
      window.removeEventListener('popstate', handleHistoryNavigation);
      window.removeEventListener('hashchange', handleHistoryNavigation);
    };
  }, [canDiscardChanges, location.hash, location.pathname, location.search, navigate]);
  const draftStatusLabel = draftWasRestored
    ? t('stockSessionDraftResumed')
    : hasMeaningfulChanges
      ? t('stockSessionDraftWillSaveOnExit')
      : hasSavedDraft
        ? t('stockSessionDraftAvailable')
        : null;

  const navigationActions = (
    <>
      {currentStepIndex > 0 ? (
        <Button type="button" variant="outline" onClick={goToPreviousStep}>
          <NavigationPreviousIcon className="size-4" />
          {t('stockSessionBack')}
        </Button>
      ) : null}
      {isLastStep ? (
        <Button disabled={submitDisabled} form="stock-update-session-form" type="submit">
          <ActionSaveIcon className="size-4" />
          {isSaving ? t('catalogSenaSkuSaving') : t('stockDone')}
        </Button>
      ) : (
        <Button disabled={!canContinueCurrentStep} type="button" onClick={goToNextStep}>
          {t('stockSessionNext')}
          <NavigationNextIcon className="size-4" />
        </Button>
      )}
    </>
  );
  const [bottomNavigationIslandLeft, setBottomNavigationIslandLeft] = useState<number | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    let frameElement: HTMLElement | null = null;
    let resizeObserver: ResizeObserver | null = null;
    let animationFrame = 0;

    const updateIslandLeft = () => {
      window.cancelAnimationFrame(animationFrame);
      animationFrame = window.requestAnimationFrame(() => {
        frameElement =
          document.querySelector<HTMLElement>('[data-testid="shell-main-frame"]') ??
          document.getElementById('main-content');
        const rect = frameElement?.getBoundingClientRect();
        setBottomNavigationIslandLeft(rect ? rect.left + rect.width / 2 : null);
      });
    };

    updateIslandLeft();
    window.addEventListener('resize', updateIslandLeft);
    window.addEventListener('scroll', updateIslandLeft, { passive: true });

    frameElement =
      document.querySelector<HTMLElement>('[data-testid="shell-main-frame"]') ??
      document.getElementById('main-content');
    if (frameElement && typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(updateIslandLeft);
      resizeObserver.observe(frameElement);
    }

    return () => {
      window.cancelAnimationFrame(animationFrame);
      window.removeEventListener('resize', updateIslandLeft);
      window.removeEventListener('scroll', updateIslandLeft);
      resizeObserver?.disconnect();
    };
  }, []);

  const titleActions = (
    <WorkspaceActionRow>
      {draftStatusLabel ? <span className="px-1 text-sm text-muted-foreground">{draftStatusLabel}</span> : null}
      <Button
        className={discardChangesButtonClassName}
        disabled={!canDiscardChanges}
        title={canDiscardChanges ? undefined : t('stockSessionNoChangesToDiscard')}
        type="button"
        variant="ghost"
        onClick={() => requestDiscard()}
      >
        <ActionDeleteIcon className="size-4" />
        {t('stockUpdateDiscardChanges')}
      </Button>
    </WorkspaceActionRow>
  );

  const floatingTitleActions = (
    <WorkspaceActionRow>
      <Button
        className={discardChangesButtonClassName}
        disabled={!canDiscardChanges}
        title={canDiscardChanges ? undefined : t('stockSessionNoChangesToDiscard')}
        type="button"
        variant="ghost"
        onClick={() => requestDiscard()}
      >
        <ActionDeleteIcon className="size-4" />
        {t('stockUpdateDiscardChanges')}
      </Button>
    </WorkspaceActionRow>
  );

  const bottomNavigationIsland =
    typeof document !== 'undefined'
      ? createPortal(
          <div
            className="fixed bottom-4 z-40 max-w-[calc(100vw-2rem)] -translate-x-1/2 md:bottom-6"
            style={{ left: bottomNavigationIslandLeft == null ? '50vw' : `${bottomNavigationIslandLeft}px` }}
          >
            <div className="editorial-panel rounded-[1.5rem] border-white/70 bg-background/92 p-2 shadow-[var(--shadow-float)] backdrop-blur-[10px]">
              <WorkspaceActionRow className="justify-center [&_[data-slot=button]]:!h-12 [&_[data-slot=button]]:!rounded-full [&_[data-slot=button]]:!px-4 [&_[data-slot=button]]:[&_svg]:!size-4">
                {navigationActions}
              </WorkspaceActionRow>
            </div>
          </div>,
          document.body,
        )
      : null;

  const summaryRibbonItems = [
    {
      key: 'latest-update',
      label: t('stockUpdateSummaryLastConfirmed'),
      value: latestAt ? formatSenaLongDate(latestAt, 'en') : t('stockUpdateSummaryNoPriorUpdate'),
    },
    {
      key: 'interval-length',
      label: t('stockUpdateSummaryIntervalLength'),
      value: intervalDays == null ? t('stockUpdateSummaryFirstInterval') : t('stockUpdateSummaryIntervalDays', { days: intervalDays }),
    },
    {
      key: 'coverage',
      label: t('stockUpdateSummaryUntouchedSkus'),
      value: fullUpdate ? t('stockUpdateSummaryFullUpdate') : t('stockUpdateSummaryPartialUpdate'),
    },
  ];

  return (
    <WorkspacePage className="pb-32 md:pb-36">
      <ConfirmActionDialog
        cancelLabel={translateUiLiteral(language, 'Cancel')}
        confirmLabel={translateUiLiteral(language, 'Replace draft')}
        confirmVariant="default"
        description={translateUiLiteral(language, 'You already have an in-progress logs update on this device. Replace it with the saved report you chose to edit?')}
        open={replaceDraftDialogOpen}
        title={translateUiLiteral(language, 'Replace saved draft?')}
        onCancel={() => {
          draftHydrationCheckedRef.current = false;
          setPendingEditSession(null);
          setReplaceDraftDialogOpen(false);
          navigate(location.pathname, { replace: true, state: null });
        }}
        onConfirm={() => {
          if (!(catalog ?? visibleCatalog) || !pendingEditSession) {
            setReplaceDraftDialogOpen(false);
            return;
          }
          skipNextDraftPersistRef.current = true;
          removeStockUpdateDraft(draftStorageKey);
          hydrateEditSession(pendingEditSession, buildOrderedInitialRows(catalog ?? visibleCatalog));
        }}
      />
      {discardConfirmDialog}
      <ConfirmActionDialog
        cancelLabel={translateUiLiteral(language, 'Keep editing')}
        confirmLabel={translateUiLiteral(language, 'Save draft and leave')}
        confirmVariant="default"
        description={translateUiLiteral(language, 'Save this in-progress record update as a draft before leaving?')}
        open={leaveDraftDialogOpen}
        title={translateUiLiteral(language, 'Leave record update?')}
        onCancel={() => {
          pendingNavigationRef.current = null;
          setLeaveDraftDialogOpen(false);
        }}
        onConfirm={() => {
          const pendingNavigation = pendingNavigationRef.current;
          pendingNavigationRef.current = null;
          persistDraftForLater();
          setLeaveDraftDialogOpen(false);
          pendingNavigation?.continueNavigation();
        }}
      />
      <WorkspaceTitleCard
        actions={titleActions}
        floatingActions={floatingTitleActions}
        descriptor={
          latestAt
            ? t('stockUpdateDescriptorWithHistory', {
                date: formatSenaDateTime(latestAt, language),
                suffix:
                  intervalDays == null
                    ? ''
                    : t('stockUpdateDescriptorIntervalSuffix', { days: intervalDays }),
              })
            : t('stockUpdateDescriptorFirst')
        }
        title={
          <span className="flex min-w-0 items-center gap-4">
            <Link
              aria-label={t('stockSessionBack')}
              className="inline-flex size-10 shrink-0 items-center justify-center rounded-full text-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/70"
              to={RECORD_UPDATE_HUB_PATH}
            >
              <NavigationBackIcon className="size-5" />
            </Link>
            <span className="min-w-0">{lane.title}</span>
          </span>
        }
      >
        <div className="grid gap-5">
          <StepWizard
            currentStepId={currentStepId}
            percentComplete={(unlockedStepCount / activeStepOrder.length) * 100}
            steps={stepStates}
            unlockedStepCount={unlockedStepCount}
            onStepSelect={(stepId) => selectStep(stepId as StockUpdateStepId)}
          />

          {showHeartbeatRibbons ? <MetricRibbon items={summaryRibbonItems} /> : null}
        </div>
      </WorkspaceTitleCard>

      <form id="stock-update-session-form" className="grid gap-6" onSubmit={(event) => void handleSubmit(event)}>
        {currentStepId === 'observed-at' ? (
          <WorkspacePanel
            className={recordUpdateWhiteCardClassName}
            descriptor={t(STOCK_UPDATE_STEP_COPY['observed-at'].descriptionKey)}
            style={recordUpdateWhiteCardStyle}
            footer={
              stepGuidance ? (
                <p className="text-sm text-muted-foreground">{stepGuidance}</p>
              ) : (
                <p className="text-sm text-muted-foreground">{t('stockUpdateObservedAtHelp')}</p>
              )
            }
            title={
              <SectionLabel
                tooltip={t('stockUpdateObservedAtTooltip')}
                tooltipLabel={t('stockUpdateObservedAt')}
              >
                {t(STOCK_UPDATE_STEP_COPY['observed-at'].titleKey)}
              </SectionLabel>
            }
          >
            <div className="grid gap-2">
              <Input
                aria-label={t('stockUpdateObservedAt')}
                required
                type="datetime-local"
                value={observedAt}
                onChange={(event) => setObservedAt(event.target.value)}
              />
            </div>
          </WorkspacePanel>
        ) : null}

        {currentStepId === 'report-notes' ? (
          <WorkspacePanel
            className={recordUpdateWhiteCardClassName}
            descriptor={t(STOCK_UPDATE_STEP_COPY['report-notes'].descriptionKey)}
            style={recordUpdateWhiteCardStyle}
            footer={<p className="text-sm text-muted-foreground">{t('stockUpdateNotesHelp')}</p>}
            title={
              <SectionLabel
                tooltip={t('stockUpdateNotesTooltip')}
                tooltipLabel={t('stockReportNotes')}
              >
                {t(STOCK_UPDATE_STEP_COPY['report-notes'].titleKey)}
              </SectionLabel>
            }
          >
            <div className="grid gap-2">
              <Textarea
                aria-label={t('stockReportNotes')}
                className="min-h-32"
                placeholder={t(notesPlaceholderKey)}
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
              />
            </div>
          </WorkspacePanel>
        ) : null}

        {currentStepId === 'context' ? (
          <WorkspacePanel
            className={recordUpdateWhiteCardClassName}
            descriptor={t(STOCK_UPDATE_STEP_COPY.context.descriptionKey)}
            style={recordUpdateWhiteCardStyle}
            footer={<p className="text-sm text-muted-foreground">{t('stockUpdateContextFooterEmpty')}</p>}
            title={
              <SectionLabel
                tooltip={t('stockUpdateRegimeHelp')}
                tooltipLabel={t('stockUpdateOverallRegime')}
              >
                {t('stockUpdateOverallRegime')} <span className="font-normal text-muted-foreground">{t('stockUpdateOptional')}</span>
              </SectionLabel>
            }
          >
            <RegimeFields regimeHint={regimeHint} setRegimeHint={setRegimeHint} />
          </WorkspacePanel>
        ) : null}

        {currentStepId === 'stock' ? (
          <StockCountStep
            catalog={workingCatalog}
            countedAtBySku={countedAtBySku}
            debugCellBoundaries={debugCellBoundaries}
            guidance={currentStepId === 'stock' ? stepGuidance : null}
            onReorderRows={handleStockRowReorder}
            rows={rows}
            stockBySku={stockBySku}
            updateRow={updateRow}
            visibleRows={visibleRows}
          />
        ) : null}

        {currentStepId === 'reorder' ? (
          <RecordOrderStep
            catalog={workingCatalog}
            debugCellBoundaries={debugCellBoundaries}
            guidance={currentStepId === 'reorder' ? stepGuidance : null}
            latestOrderAtBySku={latestOrderedAt}
            latestOrderQuantity={latestOrderedQuantity}
            leadTimeMeanDefaults={leadTimeMeanDefaults}
            leadTimeVariabilityDefaults={leadTimeVariabilityDefaults}
            observedAtIso={observedAtIso}
            onReorderRows={handleStockRowReorder}
            orderRecommendationBySku={recommendedOrderBySku}
            recordOrderExpectedArrivalDate={recordOrderExpectedArrivalDate}
            recordOrderLeadTimeMeanDays={recordOrderLeadTimeMeanDays}
            recordOrderLeadTimeVariability={recordOrderLeadTimeVariability}
            rows={rows}
            setRecordOrderExpectedArrivalDate={setRecordOrderExpectedArrivalDate}
            setRecordOrderLeadTimeMeanDays={setRecordOrderLeadTimeMeanDays}
            setRecordOrderLeadTimeVariability={setRecordOrderLeadTimeVariability}
            skuSignalDrafts={skuSignalDrafts}
            updateSkuSignalDraft={updateSkuSignalDraft}
          />
        ) : null}

        {currentStepId === 'retail-sales' ? (
          <SalesRetailStep
            catalog={workingCatalog}
            choice={retailSalesChoice}
            debugCellBoundaries={debugCellBoundaries}
            guidance={currentStepId === 'retail-sales' ? stepGuidance : null}
            latestSalesAtBySku={latestRetailSalesAt}
            latestSalesBySku={latestRetailSales}
            onChooseNo={() => setRetailSalesChoice('no')}
            onChooseYes={() => setRetailSalesChoice('yes')}
            onReorderRows={handleRetailSalesRowReorder}
            retailRankingSeedValues={defaultRetailRankingIds}
            retailSalesDrafts={retailSalesDrafts}
            retailSkuIds={retailSkuIds}
            retailRankings={retailRankings}
            setRetailRankings={setRetailRankings}
            setRetailSalesDraft={updateRetailSalesDraft}
          />
        ) : null}

        {currentStepId === 'service-sales' ? (
          <SalesServiceStep
            catalog={workingCatalog}
            choice={serviceSalesChoice}
            debugCellBoundaries={debugCellBoundaries}
            guidance={currentStepId === 'service-sales' ? stepGuidance : null}
            latestSalesAtByService={latestServiceSalesAt}
            latestSalesByService={latestServiceSales}
            onChooseNo={() => setServiceSalesChoice('no')}
            onChooseYes={() => setServiceSalesChoice('yes')}
            onReorderRows={handleServiceSalesRowReorder}
            serviceIds={serviceIds}
            serviceRankingSeedValues={defaultServiceRankingIds}
            serviceSalesDrafts={serviceSalesDrafts}
            serviceRankings={serviceRankings}
            setServiceRankings={setServiceRankings}
            setServiceSalesDraft={updateServiceSalesDraft}
          />
        ) : null}

        {currentStepId === 'stock-cost' ? (
          <StockCostStep
            catalog={workingCatalog}
            choice={stockStepChoices['stock-cost']}
            countedAtBySku={countedAtBySku}
            currency={currency}
            debugCellBoundaries={debugCellBoundaries}
            guidance={currentStepId === 'stock-cost' ? stepGuidance : null}
            onReorderRows={handleStockRowReorder}
            rows={rows}
            stockBySku={stockBySku}
            usdToKhrExchangeRate={usdToKhrExchangeRate}
            updateRow={updateRow}
            visibleRows={visibleRows}
            onChooseNo={() => handleSkipOptionalStockStep('stock-cost')}
            onChooseYes={() => updateStockStepChoice('stock-cost', 'yes')}
          />
        ) : null}

        {currentStepId === 'stock-price' ? (
          <StockRetailPriceStep
            catalog={workingCatalog}
            choice={stockStepChoices['stock-price']}
            countedAtBySku={countedAtBySku}
            currency={currency}
            debugCellBoundaries={debugCellBoundaries}
            guidance={currentStepId === 'stock-price' ? stepGuidance : null}
            onReorderRows={handleStockRowReorder}
            rows={rows}
            stockBySku={stockBySku}
            usdToKhrExchangeRate={usdToKhrExchangeRate}
            updateRow={updateRow}
            visibleRows={visibleRows}
            onChooseNo={() => handleSkipOptionalStockStep('stock-price')}
            onChooseYes={() => updateStockStepChoice('stock-price', 'yes')}
          />
        ) : null}

        {currentStepId === 'stock-flags' ? (
          <StockFlagsStep
            catalog={workingCatalog}
            choice={stockStepChoices['stock-flags']}
            countedAtBySku={countedAtBySku}
            debugCellBoundaries={debugCellBoundaries}
            guidance={currentStepId === 'stock-flags' ? stepGuidance : null}
            onReorderRows={handleStockRowReorder}
            skuSignalDrafts={skuSignalDrafts}
            stockBySku={stockBySku}
            updateSkuSignalDraft={updateSkuSignalDraft}
            visibleRows={lane.id === 'sales-update' ? salesFlagRows : visibleRows}
            onChooseNo={() => handleSkipOptionalStockStep('stock-flags')}
            onChooseYes={() => updateStockStepChoice('stock-flags', 'yes')}
          />
        ) : null}

        {currentStepId === 'service' ? (
          <ServiceSignalsStep
            catalog={workingCatalog}
            currency={currency}
            debugCellBoundaries={debugCellBoundaries}
            guidance={currentStepId === 'service' ? stepGuidance : null}
            language={language}
            serviceSignalDrafts={serviceSignalDrafts}
            usdToKhrExchangeRate={usdToKhrExchangeRate}
            updateServiceSignalDraft={updateServiceSignalDraft}
            onToggleDebugCellBoundaries={() => setDebugCellBoundaries((current) => !current)}
          />
        ) : null}

        {currentStepId === 'rankings' ? (
          <WorkspacePanel
            className={recordUpdateWhiteCardClassName}
            descriptor={t(STOCK_UPDATE_STEP_COPY.rankings.descriptionKey)}
            style={recordUpdateWhiteCardStyle}
            title={
              <SectionLabel
                tooltip={t('stockUpdateRankingsTooltip')}
                tooltipLabel={t('stockUpdateRankingsTooltipLabel')}
              >
                {t(STOCK_UPDATE_STEP_COPY.rankings.titleKey)}
              </SectionLabel>
            }
          >
            <div className="grid items-start gap-6 lg:grid-cols-2">
              <RankingSignalEditor
                catalog={workingCatalog}
                entryType="service"
                label={t('stockUpdateTopServicesLabel')}
                seedValues={defaultServiceRankingIds}
                values={serviceRankings}
                onChange={setServiceRankings}
              />
              <RankingSignalEditor
                catalog={workingCatalog}
                entryType="sku"
                label={t('stockUpdateTopRetailItemsLabel')}
                seedValues={defaultRetailRankingIds}
                values={retailRankings}
                onChange={setRetailRankings}
              />
            </div>
          </WorkspacePanel>
        ) : null}

        {currentStepId === 'review' ? (
          <ReviewStep
            blockers={reviewBlockers}
            catalog={workingCatalog}
            error={error}
            payload={previewPayload}
            previewParts={previewParts}
            serviceSignalDrafts={serviceSignalDrafts}
            skuSignalDrafts={skuSignalDrafts}
          />
        ) : null}
      </form>
      {bottomNavigationIsland}
    </WorkspacePage>
  );
}
