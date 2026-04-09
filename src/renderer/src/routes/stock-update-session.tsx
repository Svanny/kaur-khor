import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { Ban, ChevronLeft, ChevronRight, Flag, PackagePlus, RotateCcw, Save, Trash2, Truck } from 'lucide-react';
import type { SenaCatalog, SenaObservationRegimeHint, SenaStockSnapshot } from '@shared/sena';
import type { InventorySnapshot, RankingEntry, RankingEntryType, SistOverview } from '@shared/inventory';
import {
  createHeaderedTableLayout,
  HeaderedTable,
  HeaderedTableBody,
  HeaderedTableCellStack,
  HeaderedTableHeader,
  HeaderedTableHeaderCell,
  HeaderedTableMobileLabel,
  HeaderedTableRow,
} from '@/components/system/headered-table';
import { HelpTooltip } from '@/components/system/help-tooltip';
import { MerchandisingEditor } from '@/components/system/merchandising-editor';
import { StepWizard } from '@/components/system/step-wizard';
import { MetricRibbon } from '@/components/system/metric-ribbon';
import { WorkspaceActionRow, WorkspacePage, WorkspacePanel, WorkspaceTitleCard } from '@/components/system/workspace';
import { useDiscardChangesConfirm, useRouteLeaveConfirm } from '@/hooks/use-route-leave-confirm';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { displayMoneyFromUsd, formatCurrency, moneyInputStep, reformatMoneyDraftValue, usdMoneyFromDisplay } from '@/lib/format';
import { regimeIconFor } from '@/lib/icon-mappings';
import { rowHoverClassName } from '@/lib/interactive-surface';
import { cn } from '@/lib/utils';
import { useInventory } from '@/state/inventory';
import { usePreferences } from '@/state/preferences';
import { buildRankChangeByEntryKey } from './ranking-order';
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
type StockUpdateStepId = 'stock' | 'service' | 'rankings' | 'context' | 'review';
type SkuFlagId = 'ordered' | 'received' | 'blocked';
type ServiceFlagId = 'price' | 'blocked';

type StockRow = SenaStockSnapshot;

interface SkuSignalDraft {
  orderEnabled: boolean;
  orderedQuantity: string;
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
  skuSignalDrafts: Record<string, SkuSignalDraft>;
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
  retailRankings: string[];
  rows: StockRow[];
  serviceRankings: string[];
  serviceSignalDrafts: Record<string, ServiceSignalDraft>;
  skuSignalDrafts: Record<string, SkuSignalDraft>;
  stockBySku: Map<string, SenaStockSnapshot>;
  stockView: StockView;
  unlockedStepCount: number;
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

const STOCK_VIEW_OPTIONS: Array<{ value: StockView; labelKey: 'stockUpdateViewPriority' | 'stockUpdateViewCounted' | 'stockUpdateViewAllSkus' }> = [
  { value: 'priority', labelKey: 'stockUpdateViewPriority' },
  { value: 'counted', labelKey: 'stockUpdateViewCounted' },
  { value: 'all', labelKey: 'stockUpdateViewAllSkus' },
];

const STOCK_UPDATE_DRAFT_STORAGE_KEY = 'banji:record-update:draft:v1';
const STOCK_UPDATE_STEP_ORDER: StockUpdateStepId[] = ['stock', 'service', 'rankings', 'context', 'review'];
const stockCountTableLayout = createHeaderedTableLayout({
  breakpoint: 'xl',
  columns: 'minmax(0,1.35fr) minmax(0,1fr) minmax(0,1fr) minmax(0,1fr) max-content',
  gap: 5,
});
const stockCountTableLayoutWithFlags = createHeaderedTableLayout({
  breakpoint: 'xl',
  columns: 'minmax(0,1.15fr) minmax(0,0.92fr) minmax(0,0.92fr) minmax(0,0.92fr) minmax(0,1.1fr) max-content',
  gap: 5,
});
const serviceSignalsTableLayout = createHeaderedTableLayout({
  breakpoint: 'xl',
  columns: 'minmax(0,1fr) minmax(0,0.72fr) max-content',
  gap: 5,
});
const serviceSignalsTableLayoutWithFlags = createHeaderedTableLayout({
  breakpoint: 'xl',
  columns: 'minmax(0,0.9fr) minmax(0,0.72fr) minmax(0,1fr) max-content',
  gap: 5,
});

const STOCK_UPDATE_STEP_COPY: Record<
  StockUpdateStepId,
  {
    descriptionKey:
      | 'stockUpdateStepContextDescription'
      | 'stockUpdateStepStockDescription'
      | 'stockUpdateStepServiceDescription'
      | 'stockUpdateStepRankingsDescription'
      | 'stockUpdateStepReviewDescription';
    titleKey:
      | 'stockUpdateStepContextTitle'
      | 'stockUpdateStepStockTitle'
      | 'stockUpdateStepServiceTitle'
      | 'stockUpdateStepRankingsTitle'
      | 'stockUpdateStepReviewTitle';
  }
> = {
  context: {
    titleKey: 'stockUpdateStepContextTitle',
    descriptionKey: 'stockUpdateStepContextDescription',
  },
  stock: {
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

function FieldHelpLabel({
  children,
  tooltip,
  label,
}: {
  children: ReactNode;
  tooltip: string;
  label: string;
}) {
  return (
    <span className="inline-flex items-center gap-2">
      <span>{children}</span>
      <HelpTooltip content={tooltip} label={label} />
    </span>
  );
}

function localDateTimeInputValue(value: string | null) {
  if (!value) {
    return new Date().toISOString().slice(0, 16);
  }
  return new Date(value).toISOString().slice(0, 16);
}

function dateTimeInputToIso(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return date.toISOString();
}

function createEmptySkuSignalDraft(): SkuSignalDraft {
  return {
    orderEnabled: false,
    orderedQuantity: '',
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
  return typeof value === 'string' && STOCK_UPDATE_STEP_ORDER.includes(value as StockUpdateStepId);
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

function readStockUpdateDraft() {
  if (!canUseBrowserStorage()) {
    return null;
  }

  const rawDraft = window.localStorage.getItem(STOCK_UPDATE_DRAFT_STORAGE_KEY);
  if (!rawDraft) {
    return null;
  }

  try {
    const parsed = JSON.parse(rawDraft) as unknown;
    if (!isObjectRecord(parsed) || parsed.version !== 1) {
      window.localStorage.removeItem(STOCK_UPDATE_DRAFT_STORAGE_KEY);
      return null;
    }
    return parsed;
  } catch {
    window.localStorage.removeItem(STOCK_UPDATE_DRAFT_STORAGE_KEY);
    return null;
  }
}

function hasStoredStockUpdateDraft() {
  return readStockUpdateDraft() !== null;
}

function removeStockUpdateDraft() {
  if (canUseBrowserStorage()) {
    window.localStorage.removeItem(STOCK_UPDATE_DRAFT_STORAGE_KEY);
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

function hydrateStockUpdateDraft({
  baselineRows,
  catalog,
  draft,
}: {
  baselineRows: StockRow[];
  catalog: SenaCatalog;
  draft: unknown;
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

  return {
    version: 1,
    savedAt: typeof draft.savedAt === 'string' ? draft.savedAt : new Date().toISOString(),
    currentStepId: isStockUpdateStepId(draft.currentStepId) ? draft.currentStepId : 'stock',
    unlockedStepCount:
      typeof draft.unlockedStepCount === 'number'
        ? Math.min(STOCK_UPDATE_STEP_ORDER.length, Math.max(1, Math.floor(draft.unlockedStepCount)))
        : 1,
    observedAt: typeof draft.observedAt === 'string' ? draft.observedAt : localDateTimeInputValue(null),
    notes: typeof draft.notes === 'string' ? draft.notes : '',
    stockView: isStockView(draft.stockView) ? draft.stockView : 'priority',
    rows: baselineRows.map((row) => sanitizeStockRow(draftRowsBySku.get(row.skuId), row)),
    skuSignalDrafts: sanitizeDraftSignalRecord(draft.skuSignalDrafts, allowedSkuIds, sanitizeSkuSignalDraft),
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
  retailRankings,
  rows,
  serviceRankings,
  serviceSignalDrafts,
  skuSignalDrafts,
  stockBySku,
}: StockUpdateDraftState) {
  return (
    rows.some((row) => stockRowChanged(catalog, stockBySku, row)) ||
    anySkuFlags(skuSignalDrafts) ||
    anyServiceFlags(serviceSignalDrafts) ||
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
    skuSignalDrafts: state.skuSignalDrafts,
    serviceSignalDrafts: state.serviceSignalDrafts,
    regimeHint: state.regimeHint,
    serviceRankings: state.serviceRankings,
    retailRankings: state.retailRankings,
  };
}

function writeStockUpdateDraft(state: StockUpdateDraftState) {
  if (!canUseBrowserStorage() || !state.catalog) {
    return false;
  }
  if (!hasMeaningfulStockUpdateChanges(state)) {
    removeStockUpdateDraft();
    return false;
  }
  window.localStorage.setItem(STOCK_UPDATE_DRAFT_STORAGE_KEY, JSON.stringify(buildStockUpdateDraft(state)));
  return true;
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
        </div>
        {values.length > 0 ? (
          <Button type="button" variant="ghost" onClick={() => onChange([])}>
            <RotateCcw className="size-4" />
            {t('stockUpdateClearRanking')}
          </Button>
        ) : null}
      </div>
      <MerchandisingEditor
        entries={entries}
        rankChangeByEntryKey={rankChangeByEntryKey}
        snapshot={snapshot}
        titleLabel={label}
        onChange={(nextEntries) => onChange(reorderIdsFromEntries(nextEntries))}
      />
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
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) {
      return;
    }

    function handlePointerDown(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setOpen(false);
      }
    }

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [open]);

  return (
    <div ref={containerRef} className="relative flex justify-end">
      <Button
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={label}
        size="icon-sm"
        type="button"
        variant="outline"
        onClick={() => setOpen((current) => !current)}
      >
        <Flag className="size-4" />
      </Button>
      <div
        className={cn(
          'absolute right-0 top-full z-20 mt-2 min-w-48 rounded-xl border border-border/70 bg-background p-1 shadow-[0_18px_40px_rgba(48,31,20,0.16)]',
          open ? 'block' : 'hidden',
        )}
        role="menu"
      >
        {actions.map((action) => (
          <button
            key={action.key}
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-foreground transition-colors hover:bg-accent"
            role="menuitem"
            type="button"
            onClick={() => {
              action.onSelect();
              setOpen(false);
            }}
          >
            <span className="text-muted-foreground">{action.icon}</span>
            {action.label}
          </button>
        ))}
      </div>
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
        className="text-muted-foreground hover:text-destructive"
        size="icon-sm"
        type="button"
        variant="ghost"
        onClick={onRemove}
      >
        <Trash2 className="size-4" />
      </Button>
    </div>
  );
}

const recordUpdateInputClassName = 'bg-input/30 text-left shadow-none';
const recordUpdateSelectTriggerClassName = 'bg-input/30 shadow-none';
const flagControlClassName = `min-w-0 w-full max-w-[12rem] ${recordUpdateInputClassName}`;

function StockCountStep({
  catalog,
  countedAtBySku,
  debugCellBoundaries,
  currency,
  rows,
  guidance,
  skuSignalDrafts,
  stockBySku,
  stockView,
  usdToKhrExchangeRate,
  updateRow,
  updateSkuSignalDraft,
  visibleRows,
  onStockViewChange,
  onToggleDebugCellBoundaries,
}: {
  catalog: SenaCatalog | null;
  countedAtBySku: Map<string, string>;
  debugCellBoundaries: boolean;
  currency: 'USD' | 'KHR';
  guidance?: string | null;
  rows: StockRow[];
  skuSignalDrafts: Record<string, SkuSignalDraft>;
  stockBySku: Map<string, SenaStockSnapshot>;
  stockView: StockView;
  usdToKhrExchangeRate: number;
  updateRow: (skuId: string, patch: Partial<StockRow>) => void;
  updateSkuSignalDraft: (skuId: string, updater: (draft: SkuSignalDraft) => SkuSignalDraft) => void;
  visibleRows: StockRow[];
  onStockViewChange: (value: StockView) => void;
  onToggleDebugCellBoundaries: () => void;
}) {
  const { t } = usePreferences();
  const showFlagColumn = anySkuFlags(skuSignalDrafts);
  const layout = showFlagColumn ? stockCountTableLayoutWithFlags : stockCountTableLayout;
  const includedRows = rows.filter((row) => stockRowChanged(catalog, stockBySku, row) || hasSkuFlags(skuSignalDrafts[row.skuId]));
  const debugTrackClassName = debugCellBoundaries ? tableDebugTrackClassName : '';
  const debugFlushClassName = debugCellBoundaries ? tableDebugFlushClassName : '';

  return (
    <WorkspacePanel
      action={
        <WorkspaceActionRow>
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
          <div className="flex items-center gap-2">
            <FieldHelpLabel
              label={t('stockUpdateStockViewAria')}
              tooltip={t('stockUpdateStockViewTooltip')}
            >
              {t('stockUpdateStockViewLabel')}
            </FieldHelpLabel>
            <ToggleGroup
              aria-label={t('stockUpdateStockViewAria')}
              className="rounded-2xl"
              spacing={1}
              type="single"
              value={stockView}
              onValueChange={(value) => {
                if (value) {
                  onStockViewChange(value as StockView);
                }
              }}
            >
              {STOCK_VIEW_OPTIONS.map((option) => (
                <ToggleGroupItem key={option.value} value={option.value}>
                  {t(option.labelKey)}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </div>
        </WorkspaceActionRow>
      }
      descriptor={t(STOCK_UPDATE_STEP_COPY.stock.descriptionKey)}
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
        <HeaderedTable variant="framed">
          <div className={layout.containerClassName} style={layout.style}>
            <HeaderedTableHeader className={cn(layout.headerClassName, debugTrackClassName, debugFlushClassName)}>
              <HeaderedTableHeaderCell>{t('stockUpdateSkuLatestObservation')}</HeaderedTableHeaderCell>
              <HeaderedTableHeaderCell>{t('stockUpdateUnitsInStock')}</HeaderedTableHeaderCell>
              <HeaderedTableHeaderCell>{t('stockUpdateCostIfChanged')}</HeaderedTableHeaderCell>
              <HeaderedTableHeaderCell>{t('stockUpdateRetailPriceIfChanged')}</HeaderedTableHeaderCell>
              {showFlagColumn ? <HeaderedTableHeaderCell>{t('stockUpdateFlags')}</HeaderedTableHeaderCell> : null}
              <HeaderedTableHeaderCell align="right" className="pr-2 whitespace-nowrap">
                <SectionLabel
                  tooltip={t('stockUpdateSkuFlagsTooltip')}
                  tooltipLabel={t('stockUpdateSkuFlagsTooltipLabel')}
                >
                  {t('stockUpdateAddFlags')}
                </SectionLabel>
              </HeaderedTableHeaderCell>
            </HeaderedTableHeader>
            <HeaderedTableBody className={layout.bodyClassName}>
              {visibleRows.map((row) => {
                const sku = catalog?.skus.find((entry) => entry.skuId === row.skuId);
                const latestCountedAt = countedAtBySku.get(row.skuId);
                const latestStock = stockBySku.get(row.skuId);
                const draft = skuSignalDrafts[row.skuId];
                const flagIds = activeSkuFlagIds(draft);

                return (
                  <HeaderedTableRow
                    key={row.skuId}
                    className={cn(
                      rowHoverClassName,
                      debugTrackClassName,
                      debugFlushClassName,
                      layout.rowClassName,
                      (stockRowChanged(catalog, stockBySku, row) || flagIds.length > 0) && 'bg-primary/[0.04]',
                    )}
                  >
                    <div className="min-w-0">
                      <HeaderedTableCellStack
                        primary={
                          <span className="min-w-0">
                            <span className="block font-medium text-foreground">{sku?.name ?? row.skuId}</span>
                            <span className="mt-1 block text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground/75">
                              {row.skuId}
                            </span>
                            <span className="mt-1 block text-sm text-muted-foreground">
                              {t('stockUpdateLatestUnits', { count: latestStock?.unitsInStock ?? 0 })}
                              {latestCountedAt
                                ? ` · ${t('stockUpdateCountedOn', { date: formatSenaLongDate(latestCountedAt, 'en') })}`
                                : ` · ${t('stockUpdateNeverCounted')}`}
                            </span>
                          </span>
                        }
                      />
                    </div>

                    <div className="min-w-0">
                      <HeaderedTableMobileLabel className={layout.mobileLabelClassName}>{t('stockUpdateUnitsInStock')}</HeaderedTableMobileLabel>
                      <div className="flex justify-start pr-3">
                        <Input
                          aria-label={t('stockUpdateUnitsInStock')}
                          className={`w-full max-w-[18rem] ${recordUpdateInputClassName}`}
                          min="0"
                          step="1"
                          type="number"
                          value={row.unitsInStock}
                          onChange={(event) => updateRow(row.skuId, { unitsInStock: Number(event.target.value) })}
                        />
                      </div>
                    </div>

                    <div className="min-w-0">
                      <HeaderedTableMobileLabel className={layout.mobileLabelClassName}>{t('stockUpdateCostIfChanged')}</HeaderedTableMobileLabel>
                      <div className="flex justify-start pr-3">
                        <Input
                          aria-label={t('stockUpdateCostIfChanged')}
                          className={`w-full max-w-[18rem] ${recordUpdateInputClassName}`}
                          min="0"
                          step={moneyInputStep(currency)}
                          type="number"
                          value={row.costPerUnit == null ? '' : displayMoneyFromUsd(row.costPerUnit, currency, usdToKhrExchangeRate)}
                          onChange={(event) =>
                            updateRow(row.skuId, {
                              costPerUnit: event.target.value
                                ? usdMoneyFromDisplay(Number(event.target.value), currency, usdToKhrExchangeRate)
                                : null,
                            })
                          }
                        />
                      </div>
                    </div>

                    <div className="min-w-0">
                      <HeaderedTableMobileLabel className={layout.mobileLabelClassName}>
                        {t('stockUpdateRetailPriceIfChanged')}
                      </HeaderedTableMobileLabel>
                      <div className="flex justify-start pr-3">
                        <Input
                          aria-label={t('stockUpdateRetailPriceIfChanged')}
                          className={`w-full max-w-[18rem] ${recordUpdateInputClassName}`}
                          disabled={!sku?.soldAsProduct}
                          min="0"
                          step={moneyInputStep(currency)}
                          type="number"
                          value={row.productPrice == null ? '' : displayMoneyFromUsd(row.productPrice, currency, usdToKhrExchangeRate)}
                          onChange={(event) =>
                            updateRow(row.skuId, {
                              productPrice: event.target.value
                                ? usdMoneyFromDisplay(Number(event.target.value), currency, usdToKhrExchangeRate)
                                : null,
                            })
                          }
                        />
                      </div>
                    </div>

                    {showFlagColumn ? (
                      <div className="min-w-0">
                        <HeaderedTableMobileLabel className={layout.mobileLabelClassName}>{t('stockUpdateFlags')}</HeaderedTableMobileLabel>
                        {flagIds.length > 0 ? (
                          <div className="grid">
                            {draft.orderEnabled ? (
                              <FlagSection
                                label={t('stockUpdateOrderFlag')}
                                removeLabel={t('stockUpdateRemoveOrderFlagFor', { name: sku?.name ?? row.skuId })}
                                onRemove={() =>
                                  updateSkuSignalDraft(row.skuId, (current) => ({
                                    ...current,
                                    orderEnabled: false,
                                    orderedQuantity: '',
                                  }))
                                }
                              >
                                <Input
                                  aria-label={t('stockUpdateOrderedQuantityAria', { name: sku?.name ?? row.skuId })}
                                  className={flagControlClassName}
                                  min="0"
                                  placeholder={t('stockUpdateOrderedQuantity')}
                                  step="1"
                                  type="number"
                                  value={draft.orderedQuantity}
                                  onChange={(event) =>
                                    updateSkuSignalDraft(row.skuId, (current) => ({
                                      ...current,
                                      orderEnabled: true,
                                      orderedQuantity: event.target.value,
                                    }))
                                  }
                                />
                              </FlagSection>
                            ) : null}
                            {draft.receiptEnabled ? (
                              <FlagSection
                                label={t('stockUpdateReceiptFlag')}
                                removeLabel={t('stockUpdateRemoveReceiptFlagFor', { name: sku?.name ?? row.skuId })}
                                onRemove={() =>
                                  updateSkuSignalDraft(row.skuId, (current) => ({
                                    ...current,
                                    receiptEnabled: false,
                                    receiptQuantity: '',
                                  }))
                                }
                              >
                                <Input
                                  aria-label={t('stockUpdateReceiptQuantityAria', { name: sku?.name ?? row.skuId })}
                                  className={flagControlClassName}
                                  min="0"
                                  placeholder={t('stockUpdateReceivedQuantity')}
                                  step="1"
                                  type="number"
                                  value={draft.receiptQuantity}
                                  onChange={(event) =>
                                    updateSkuSignalDraft(row.skuId, (current) => ({
                                      ...current,
                                      receiptEnabled: true,
                                      receiptQuantity: event.target.value,
                                    }))
                                  }
                                />
                              </FlagSection>
                            ) : null}
                            {draft.blockedEnabled ? (
                              <FlagSection
                                label={t('stockUpdateEventFlag')}
                                removeLabel={t('stockUpdateRemoveEventFlagFor', { name: sku?.name ?? row.skuId })}
                                onRemove={() =>
                                  updateSkuSignalDraft(row.skuId, (current) => ({
                                    ...current,
                                    blockedEnabled: false,
                                    blockedState: 'blocked',
                                  }))
                                }
                              >
                                <Select
                                  value={draft.blockedState}
                                  onValueChange={(value) =>
                                    updateSkuSignalDraft(row.skuId, (current) => ({
                                      ...current,
                                      blockedEnabled: true,
                                      blockedState: value as StockoutFlagValue,
                                    }))
                                  }
                                >
                                  <SelectTrigger
                                    aria-label={t('stockUpdateBlockedStateAria', { name: sku?.name ?? row.skuId })}
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
                    ) : null}

                      <div className="min-w-0">
                        <HeaderedTableMobileLabel className={layout.mobileLabelClassName}>{t('stockUpdateAddFlags')}</HeaderedTableMobileLabel>
                      <FlagActionMenu
                        actions={[
                          {
                            key: 'ordered',
                            label: draft?.orderEnabled ? t('stockUpdateRemoveOrder') : t('stockUpdateAddOrder'),
                            icon: <PackagePlus className="size-4" />,
                            onSelect: () =>
                              updateSkuSignalDraft(row.skuId, (current) => ({
                                ...current,
                                orderEnabled: !current.orderEnabled,
                                orderedQuantity: current.orderEnabled ? '' : current.orderedQuantity,
                              })),
                          },
                          {
                            key: 'received',
                            label: draft?.receiptEnabled ? t('stockUpdateRemoveReceipt') : t('stockUpdateAddReceipt'),
                            icon: <Truck className="size-4" />,
                            onSelect: () =>
                              updateSkuSignalDraft(row.skuId, (current) => ({
                                ...current,
                                receiptEnabled: !current.receiptEnabled,
                                receiptQuantity: current.receiptEnabled ? '' : current.receiptQuantity,
                              })),
                          },
                          {
                            key: 'blocked',
                            label: draft?.blockedEnabled ? t('stockUpdateRemoveEvent') : t('stockUpdateAddEvent'),
                            icon: <Ban className="size-4" />,
                            onSelect: () =>
                              updateSkuSignalDraft(row.skuId, (current) => ({
                                ...current,
                                blockedEnabled: !current.blockedEnabled,
                                blockedState: current.blockedEnabled ? 'blocked' : current.blockedState,
                              })),
                          },
                        ]}
                        label={t('stockUpdateAddFlagsFor', { name: sku?.name ?? row.skuId })}
                      />
                    </div>
                  </HeaderedTableRow>
                );
              })}
            </HeaderedTableBody>
          </div>
        </HeaderedTable>
        {visibleRows.length === 0 ? (
          <p className="rounded-[1.25rem] border border-dashed border-border/70 px-4 py-5 text-sm text-muted-foreground">
            {t('stockUpdateNoSkuMatches')}
          </p>
        ) : null}
        <p className="text-sm text-muted-foreground">
          {t('stockUpdateSkuRowsIncluded', { count: includedRows.length, suffix: includedRows.length === 1 ? '' : 's' })}
        </p>
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
  const layout = showFlagColumn ? serviceSignalsTableLayoutWithFlags : serviceSignalsTableLayout;
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
      descriptor={t(STOCK_UPDATE_STEP_COPY.service.descriptionKey)}
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
      <HeaderedTable variant="framed">
        <div className={layout.containerClassName} style={layout.style}>
          <HeaderedTableHeader className={cn(layout.headerClassName, debugTrackClassName, debugFlushClassName)}>
            <HeaderedTableHeaderCell>{t('stockUpdateServiceHeader')}</HeaderedTableHeaderCell>
            <HeaderedTableHeaderCell align="center">{t('stockUpdateLatestPrice')}</HeaderedTableHeaderCell>
            {showFlagColumn ? <HeaderedTableHeaderCell>{t('stockUpdateFlags')}</HeaderedTableHeaderCell> : null}
            <HeaderedTableHeaderCell align="right" className="pr-2 whitespace-nowrap">
              <SectionLabel
                tooltip={t('stockUpdateServiceFlagsTooltip')}
                tooltipLabel={t('stockUpdateServiceFlagsTooltipLabel')}
              >
                {t('stockUpdateAddFlags')}
              </SectionLabel>
            </HeaderedTableHeaderCell>
          </HeaderedTableHeader>
          <HeaderedTableBody className={layout.bodyClassName}>
            {(catalog?.services ?? []).map((service) => {
              const draft = serviceSignalDrafts[service.serviceId];
              const flagIds = activeServiceFlagIds(draft);
              const linkedSkuCount = (catalog?.sharingMask ?? []).filter(
                (entry) => entry.enabled && entry.serviceId === service.serviceId,
              ).length;

              return (
                <HeaderedTableRow
                  key={service.serviceId}
                  className={cn(
                    rowHoverClassName,
                    debugTrackClassName,
                    debugFlushClassName,
                    layout.rowClassName,
                    flagIds.length > 0 && 'bg-primary/[0.04]',
                  )}
                >
                  <div className="min-w-0">
                    <HeaderedTableCellStack
                      primary={
                        <span className="min-w-0">
                          <span className="block font-medium text-foreground">{service.name}</span>
                          <span className="mt-1 block text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground/75">
                            {service.serviceId}
                          </span>
                          <span className="mt-1 block text-sm text-muted-foreground">
                            {t('stockUpdateLinkedSkuCount', { count: linkedSkuCount, suffix: linkedSkuCount === 1 ? '' : 's' })}
                          </span>
                        </span>
                      }
                    />
                  </div>

                  <div className="min-w-0">
                    <HeaderedTableMobileLabel className={layout.mobileLabelClassName}>{t('stockUpdateLatestPrice')}</HeaderedTableMobileLabel>
                    <p className="text-center text-sm font-medium text-foreground">
                      {formatCurrency(service.price, currency, language, usdToKhrExchangeRate)}
                    </p>
                  </div>

                  {showFlagColumn ? (
                    <div className="min-w-0">
                      <HeaderedTableMobileLabel className={layout.mobileLabelClassName}>{t('stockUpdateFlags')}</HeaderedTableMobileLabel>
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
                  ) : null}

                  <div className="min-w-0">
                    <HeaderedTableMobileLabel className={layout.mobileLabelClassName}>{t('stockUpdateAddFlags')}</HeaderedTableMobileLabel>
                    <FlagActionMenu
                      actions={[
                        {
                          key: 'price',
                          label: draft?.priceEnabled ? t('stockUpdateRemovePriceChange') : t('stockUpdateAddPriceChange'),
                          icon: <PackagePlus className="size-4" />,
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
                          icon: <Ban className="size-4" />,
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
                </HeaderedTableRow>
              );
            })}
          </HeaderedTableBody>
        </div>
      </HeaderedTable>
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
  const SelectedIcon = regimeIconFor(selectedRegime?.value ?? 'normal');
  const regimeDescription = selectedRegime?.detail ?? t('stockUpdateRegimeDescriptionEmpty');

  return (
    <div className="grid gap-2">
      <label className="grid gap-1 text-sm font-medium text-foreground">
        <span className="inline-flex items-baseline gap-1.5">
          <span>{t('stockUpdateOverallRegime')}</span>
          <span className="font-normal text-muted-foreground">{t('stockUpdateOptional')}</span>
          <HelpTooltip content={t('stockUpdateRegimeHelp')} label={t('stockUpdateOverallRegime')} className="self-center" />
        </span>
        <Select value={regimeHint || 'none'} onValueChange={(value) => setRegimeHint(value === 'none' ? '' : (value as SenaObservationRegimeHint))}>
          <SelectTrigger
            aria-label={`${t('stockUpdateOverallRegime')} ${t('stockUpdateOptional')}`}
            className={cn('w-full', recordUpdateSelectTriggerClassName)}
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">{t('stockUpdateNoRegimeSignal')}</SelectItem>
            {regimeOptions.map((option) => {
              const Icon = regimeIconFor(option.value);
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
      </label>
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
      descriptor={t(STOCK_UPDATE_STEP_COPY.review.descriptionKey)}
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
  const { catalog, ingestSenaObservation, isSaving, observations, triggerSenaRun, workspaceSummary } = useInventory();
  const { currency, language, t, usdToKhrExchangeRate } = usePreferences();
  const latestAt = latestObservationAt(observations);
  const initialObservedAtRef = useRef(localDateTimeInputValue(null));
  const draftHydrationCheckedRef = useRef(false);
  const latestDraftStateRef = useRef<StockUpdateDraftState | null>(null);
  const skipNextDraftPersistRef = useRef(false);
  const previousMoneyPreferencesRef = useRef({ currency, usdToKhrExchangeRate });
  const [currentStepId, setCurrentStepId] = useState<StockUpdateStepId>('stock');
  const [unlockedStepCount, setUnlockedStepCount] = useState(1);
  const [observedAt, setObservedAt] = useState(() => initialObservedAtRef.current);
  const [notes, setNotes] = useState('');
  const [stockView, setStockView] = useState<StockView>('priority');
  const [rows, setRows] = useState(() => buildInitialRows(catalog, observations));
  const [skuSignalDrafts, setSkuSignalDrafts] = useState<Record<string, SkuSignalDraft>>({});
  const [serviceSignalDrafts, setServiceSignalDrafts] = useState<Record<string, ServiceSignalDraft>>({});
  const [regimeHint, setRegimeHint] = useState<SenaObservationRegimeHint | ''>('');
  const [serviceRankings, setServiceRankings] = useState<string[]>([]);
  const [retailRankings, setRetailRankings] = useState<string[]>([]);
  const [debugCellBoundaries, setDebugCellBoundaries] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasSavedDraft, setHasSavedDraft] = useState(() => hasStoredStockUpdateDraft());
  const [draftWasRestored, setDraftWasRestored] = useState(false);

  const stockBySku = useMemo(() => latestStockBySku(catalog, observations), [catalog, observations]);
  const countedAtBySku = useMemo(() => latestCountedAtBySku(observations), [observations]);
  const highRiskIds = new Set(workspaceSummary?.highRiskSkuIds ?? []);
  const serviceLinkedSkuIds = useMemo(
    () => new Set((catalog?.sharingMask ?? []).filter((entry) => entry.enabled).map((entry) => entry.skuId)),
    [catalog],
  );
  const prioritySkuIds = useMemo(() => {
    const scored = (catalog?.skus ?? []).map((sku, index) => ({
      skuId: sku.skuId,
      score:
        (highRiskIds.has(sku.skuId) ? 100 : 0) +
        (serviceLinkedSkuIds.has(sku.skuId) ? 20 : 0) +
        (countedAtBySku.has(sku.skuId) ? 0 : 10) -
        index / 100,
    }));
    return new Set(scored.sort((left, right) => right.score - left.score).slice(0, 8).map((entry) => entry.skuId));
  }, [catalog?.skus, countedAtBySku, highRiskIds, serviceLinkedSkuIds]);

  const visibleRows = rows.filter((row) => {
    if (stockView === 'counted') {
      return stockRowChanged(catalog, stockBySku, row) || hasSkuFlags(skuSignalDrafts[row.skuId]);
    }
    if (stockView === 'priority') {
      return prioritySkuIds.has(row.skuId);
    }
    return true;
  });

  const observedAtIso = dateTimeInputToIso(observedAt);
  const intervalDays = intervalDaysBetween(latestAt, observedAtIso);
  const isFirstObservation = observations.length === 0;
  const countedSkuCount = rows.filter((row) => stockRowChanged(catalog, stockBySku, row)).length;
  const fullUpdate = rows.length > 0 && rows.every((row) => stockRowChanged(catalog, stockBySku, row));
  const defaultServiceRankingIds = (catalog?.services ?? []).map((service) => service.serviceId);
  const defaultRetailRankingIds = (catalog?.skus ?? []).filter((sku) => sku.soldAsProduct).map((sku) => sku.skuId);
  const currentStepIndex = STOCK_UPDATE_STEP_ORDER.indexOf(currentStepId);
  const isLastStep = currentStepIndex === STOCK_UPDATE_STEP_ORDER.length - 1;
  const skuFlagCount = Object.values(skuSignalDrafts).reduce((count, draft) => count + activeSkuFlagIds(draft).length, 0);
  const serviceFlagCount = Object.values(serviceSignalDrafts).reduce((count, draft) => count + activeServiceFlagIds(draft).length, 0);
  const rankingSignalCount = serviceRankings.length + retailRankings.length;
  const stockStepSatisfied = !isFirstObservation || countedSkuCount > 0;
  const skuFlagsValid = !skuFlagsHaveEmptyRequiredValues(skuSignalDrafts);
  const serviceFlagsValid = !serviceFlagsHaveEmptyRequiredValues(serviceSignalDrafts);
  const draftState = useMemo<StockUpdateDraftState>(
    () => ({
      catalog,
      currentStepId,
      initialObservedAt: initialObservedAtRef.current,
      notes,
      observedAt,
      regimeHint,
      retailRankings,
      rows,
      serviceRankings,
      serviceSignalDrafts,
      skuSignalDrafts,
      stockBySku,
      stockView,
      unlockedStepCount,
    }),
    [
      catalog,
      currentStepId,
      notes,
      observedAt,
      regimeHint,
      retailRankings,
      rows,
      serviceRankings,
      serviceSignalDrafts,
      skuSignalDrafts,
      stockBySku,
      stockView,
      unlockedStepCount,
    ],
  );
  const hasMeaningfulChanges = useMemo(() => hasMeaningfulStockUpdateChanges(draftState), [draftState]);

  useEffect(() => {
    if (!catalog) {
      setRows(buildInitialRows(catalog, observations));
      return;
    }

    const baselineRows = buildInitialRows(catalog, observations);
    if (!draftHydrationCheckedRef.current) {
      draftHydrationCheckedRef.current = true;
      const hydratedDraft = hydrateStockUpdateDraft({
        baselineRows,
        catalog,
        draft: readStockUpdateDraft(),
      });

      if (hydratedDraft) {
        setCurrentStepId(hydratedDraft.currentStepId);
        setUnlockedStepCount(hydratedDraft.unlockedStepCount);
        setObservedAt(hydratedDraft.observedAt);
        setNotes(hydratedDraft.notes);
        setStockView(hydratedDraft.stockView);
        setRows(hydratedDraft.rows);
        setSkuSignalDrafts(hydratedDraft.skuSignalDrafts);
        setServiceSignalDrafts(hydratedDraft.serviceSignalDrafts);
        setRegimeHint(hydratedDraft.regimeHint);
        setServiceRankings(hydratedDraft.serviceRankings);
        setRetailRankings(hydratedDraft.retailRankings);
        setHasSavedDraft(true);
        setDraftWasRestored(true);
        return;
      }

      removeStockUpdateDraft();
      setHasSavedDraft(false);
      setDraftWasRestored(false);
    }

    setRows(baselineRows);
  }, [catalog, observations]);

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
        return;
      }
      const latestState = latestDraftStateRef.current;
      if (latestState) {
        writeStockUpdateDraft(latestState);
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
  }, []);

  function updateRow(skuId: string, patch: Partial<StockRow>) {
    setRows((current) => current.map((row) => (row.skuId === skuId ? { ...row, ...patch } : row)));
  }

  function updateSkuSignalDraft(skuId: string, updater: (draft: SkuSignalDraft) => SkuSignalDraft) {
    setSkuSignalDrafts((current) => ({
      ...current,
      [skuId]: updater(current[skuId] ?? createEmptySkuSignalDraft()),
    }));
  }

  function updateServiceSignalDraft(serviceId: string, updater: (draft: ServiceSignalDraft) => ServiceSignalDraft) {
    setServiceSignalDrafts((current) => ({
      ...current,
      [serviceId]: updater(current[serviceId] ?? createEmptyServiceSignalDraft()),
    }));
  }

  function buildPayload() {
    const payload = createEmptyObservationInput({
      observedAt: observedAtIso ?? new Date().toISOString(),
      notes: notes.trim() || null,
    });
    payload.stockSnapshot = rows.filter((row) => stockRowChanged(catalog, stockBySku, row));
    payload.serviceRankings = serviceRankings;
    payload.retailRankings = retailRankings;
    payload.orderSignals = Object.entries(skuSignalDrafts).flatMap(([skuId, draft]) => {
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
    payload.retailStockouts = Object.entries(skuSignalDrafts)
      .filter(([skuId, draft]) => draft.blockedEnabled && Boolean(draft.blockedState) && Boolean(catalog?.skus.find((sku) => sku.skuId === skuId)?.soldAsProduct))
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
  const submitDisabled =
    isSaving ||
    !skuFlagsValid ||
    !serviceFlagsValid ||
    !hasStructuredObservationSignal(previewPayload) ||
    (isFirstObservation && previewPayload.stockSnapshot.length === 0);

  const stepStates = [
    {
      id: 'stock',
      title: t(STOCK_UPDATE_STEP_COPY.stock.titleKey),
      description:
        skuFlagCount > 0
          ? t('stockUpdateStepSignalsAdded', { count: skuFlagCount, suffix: skuFlagCount === 1 ? '' : 's' })
          : isFirstObservation
            ? t('stockUpdateStepCountAtLeastOneSku')
            : t('stockUpdateStepOptionalLater'),
      complete: stockStepSatisfied && skuFlagsValid,
    },
    {
      id: 'service',
      title: t(STOCK_UPDATE_STEP_COPY.service.titleKey),
      description: serviceFlagCount > 0 ? t('stockUpdateStepSignalsAdded', { count: serviceFlagCount, suffix: serviceFlagCount === 1 ? '' : 's' }) : t('stockUpdateStepOptional'),
      complete: (serviceFlagCount > 0 && serviceFlagsValid) || currentStepIndex > 1,
    },
    {
      id: 'rankings',
      title: t(STOCK_UPDATE_STEP_COPY.rankings.titleKey),
      description: rankingSignalCount > 0 ? t('stockUpdateStepSignalsAdded', { count: rankingSignalCount, suffix: rankingSignalCount === 1 ? '' : 's' }) : t('stockUpdateStepOptional'),
      complete: rankingSignalCount > 0 || currentStepIndex > 2,
    },
    {
      id: 'context',
      title: t(STOCK_UPDATE_STEP_COPY.context.titleKey),
      description: regimeHint ? t('stockUpdateStepRegimeSummary', { value: regimeHint.replaceAll('_', ' ') }) : t('stockUpdateStepContextSummary'),
      complete: Boolean(observedAtIso),
    },
    {
      id: 'review',
      title: t(STOCK_UPDATE_STEP_COPY.review.titleKey),
      description: submitDisabled ? t('stockUpdateStepNotReady') : t('stockUpdateStepReadyToSave'),
      complete: !submitDisabled,
    },
  ] satisfies Array<{ id: StockUpdateStepId; title: string; description: string; complete: boolean }>;

  const canContinueCurrentStep =
    currentStepId === 'context'
      ? Boolean(observedAtIso)
      : currentStepId === 'stock'
        ? stockStepSatisfied && skuFlagsValid
        : currentStepId === 'service'
          ? serviceFlagsValid
          : true;

  const stepGuidance =
    currentStepId === 'context' && !observedAtIso
      ? t('stockUpdateGuidanceChooseObservedAt')
      : currentStepId === 'stock' && !stockStepSatisfied
        ? t('stockUpdateGuidanceCountOneSku')
        : currentStepId === 'stock' && !skuFlagsValid
          ? t('stockUpdateGuidanceFillSkuFlags')
          : currentStepId === 'service' && !serviceFlagsValid
            ? t('stockUpdateGuidanceFillServiceFlags')
        : currentStepId === 'review' && !skuFlagsValid
            ? t('stockUpdateGuidanceFillSkuFlagsSave')
            : currentStepId === 'review' && !serviceFlagsValid
              ? t('stockUpdateGuidanceFillServiceFlagsSave')
              : currentStepId === 'review' && !hasStructuredObservationSignal(previewPayload)
                ? t('stockUpdateGuidanceAddSignal')
          : currentStepId === 'review' && isFirstObservation && previewPayload.stockSnapshot.length === 0
            ? t('stockUpdateGuidanceFirstUpdateNeedsCount')
            : null;

  const reviewBlockers = [
    ...(!skuFlagsValid ? [t('stockUpdateGuidanceFillSkuFlagsSave')] : []),
    ...(!serviceFlagsValid ? [t('stockUpdateGuidanceFillServiceFlagsSave')] : []),
    ...(!hasStructuredObservationSignal(previewPayload)
      ? [t('stockUpdateGuidanceAddSignal')]
      : []),
    ...(isFirstObservation && previewPayload.stockSnapshot.length === 0
      ? [t('stockUpdateGuidanceFirstUpdateNeedsCount')]
      : []),
  ];

  function selectStep(stepId: StockUpdateStepId) {
    const targetIndex = STOCK_UPDATE_STEP_ORDER.indexOf(stepId);
    if (targetIndex >= 0 && targetIndex < unlockedStepCount) {
      setCurrentStepId(stepId);
    }
  }

  function goToNextStep() {
    if (!canContinueCurrentStep || isLastStep) {
      return;
    }
    const nextIndex = currentStepIndex + 1;
    setUnlockedStepCount((current) => Math.max(current, nextIndex + 1));
    setCurrentStepId(STOCK_UPDATE_STEP_ORDER[nextIndex]!);
  }

  function goToPreviousStep() {
    if (currentStepIndex === 0) {
      return;
    }
    setCurrentStepId(STOCK_UPDATE_STEP_ORDER[currentStepIndex - 1]!);
  }

  function resetRecordUpdateState() {
    const nextObservedAt = localDateTimeInputValue(null);
    initialObservedAtRef.current = nextObservedAt;
    setCurrentStepId('stock');
    setUnlockedStepCount(1);
    setObservedAt(nextObservedAt);
    setNotes('');
    setStockView('priority');
    setRows(buildInitialRows(catalog, observations));
    setSkuSignalDrafts({});
    setServiceSignalDrafts({});
    setRegimeHint('');
    setServiceRankings([]);
    setRetailRankings([]);
    setError(null);
  }

  function handleDiscardChanges() {
    skipNextDraftPersistRef.current = true;
    removeStockUpdateDraft();
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
    if (!skuFlagsValid) {
      setError(t('stockUpdateGuidanceFillSkuFlagsSave'));
      return;
    }
    if (!serviceFlagsValid) {
      setError(t('stockUpdateGuidanceFillServiceFlagsSave'));
      return;
    }
    if (!hasStructuredObservationSignal(payload)) {
      setError(t('stockUpdateGuidanceAddSignal'));
      return;
    }
    if (isFirstObservation && payload.stockSnapshot.length === 0) {
      setError(t('stockUpdateGuidanceFirstUpdateNeedsCount'));
      return;
    }
    try {
      await ingestSenaObservation(payload);
      await triggerSenaRun({ algorithmVersion: 'sena-analysis-v3' });
      skipNextDraftPersistRef.current = true;
      removeStockUpdateDraft();
      setHasSavedDraft(false);
      setDraftWasRestored(false);
      resetRecordUpdateState();
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : t('stockUpdateSaveFailed'));
    }
  }

  const canDiscardChanges = hasMeaningfulChanges || hasSavedDraft || draftWasRestored;
  const discardChangesDescription =
    t('stockSessionDiscardDescription');
  const { discardConfirmDialog, requestDiscard } = useDiscardChangesConfirm({
    enabled: canDiscardChanges,
    description: discardChangesDescription,
    onDiscard: handleDiscardChanges,
  });
  const { discardConfirmDialog: routeDiscardConfirmDialog } = useRouteLeaveConfirm({
    enabled: canDiscardChanges,
    description: discardChangesDescription,
    onDiscard: handleDiscardChanges,
  });
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
          <ChevronLeft className="size-4" />
          {t('stockSessionBack')}
        </Button>
      ) : null}
      {isLastStep ? (
        <Button disabled={submitDisabled} form="stock-update-session-form" type="submit">
          <Save className="size-4" />
          {isSaving ? t('catalogSenaSkuSaving') : t('stockDone')}
        </Button>
      ) : (
        <Button disabled={!canContinueCurrentStep} type="button" onClick={goToNextStep}>
          {t('stockSessionNext')}
          <ChevronRight className="size-4" />
        </Button>
      )}
    </>
  );

  const titleActions = (
    <WorkspaceActionRow>
      {draftStatusLabel ? <span className="px-1 text-sm text-muted-foreground">{draftStatusLabel}</span> : null}
      <Button
        disabled={!canDiscardChanges}
        title={canDiscardChanges ? undefined : t('stockSessionNoChangesToDiscard')}
        type="button"
        variant="ghost"
        onClick={() => requestDiscard()}
      >
        <Trash2 className="size-4" />
        {t('stockUpdateDiscardChanges')}
      </Button>
      {navigationActions}
    </WorkspaceActionRow>
  );

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
    <WorkspacePage>
      {discardConfirmDialog}
      {routeDiscardConfirmDialog}
      <WorkspaceTitleCard
        actions={titleActions}
        floatingActions={<WorkspaceActionRow>{navigationActions}</WorkspaceActionRow>}
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
        eyebrow={t('stockUpdateEyebrow')}
        title={t('stockUpdateTitle')}
      >
        <div className="grid gap-5">
          <StepWizard
            currentStepId={currentStepId}
            percentComplete={(unlockedStepCount / STOCK_UPDATE_STEP_ORDER.length) * 100}
            steps={stepStates}
            unlockedStepCount={unlockedStepCount}
            onStepSelect={(stepId) => selectStep(stepId as StockUpdateStepId)}
          />

          <MetricRibbon items={summaryRibbonItems} />
        </div>
      </WorkspaceTitleCard>

      <form id="stock-update-session-form" className="grid gap-6" onSubmit={(event) => void handleSubmit(event)}>
        {currentStepId === 'context' ? (
          <WorkspacePanel
            descriptor={t(STOCK_UPDATE_STEP_COPY.context.descriptionKey)}
            footer={
              stepGuidance ? (
                <p className="text-sm text-muted-foreground">{stepGuidance}</p>
              ) : (
                <p className="text-sm text-muted-foreground">
                  {t('stockUpdateContextFooterEmpty')}
                </p>
              )
            }
            title={
              <SectionLabel
                tooltip={t('stockUpdateContextTooltip')}
                tooltipLabel={t('stockUpdateContextTooltipLabel')}
              >
                {t(STOCK_UPDATE_STEP_COPY.context.titleKey)}
              </SectionLabel>
            }
          >
            <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,24rem)]">
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-1">
                <label className="grid gap-2 text-sm font-medium text-foreground">
                  <FieldHelpLabel
                    label={t('stockUpdateObservedAt')}
                    tooltip={t('stockUpdateObservedAtTooltip')}
                  >
                    {t('stockUpdateObservedAt')}
                  </FieldHelpLabel>
                  <Input
                    required
                    type="datetime-local"
                    value={observedAt}
                    onChange={(event) => setObservedAt(event.target.value)}
                  />
                  <span className="text-xs font-normal leading-5 text-muted-foreground">
                    {t('stockUpdateObservedAtHelp')}
                  </span>
                </label>
                <label className="grid gap-2 text-sm font-medium text-foreground">
                  <FieldHelpLabel
                    label={t('stockReportNotes')}
                    tooltip={t('stockUpdateNotesTooltip')}
                  >
                    {t('stockReportNotes')}
                  </FieldHelpLabel>
                  <Textarea className="min-h-24" value={notes} onChange={(event) => setNotes(event.target.value)} />
                  <span className="text-xs font-normal leading-5 text-muted-foreground">
                    {t('stockUpdateNotesHelp')}
                  </span>
                </label>
              </div>
              <RegimeFields regimeHint={regimeHint} setRegimeHint={setRegimeHint} />
            </div>
          </WorkspacePanel>
        ) : null}

        {currentStepId === 'stock' ? (
          <StockCountStep
            catalog={catalog}
            countedAtBySku={countedAtBySku}
            currency={currency}
            debugCellBoundaries={debugCellBoundaries}
            guidance={currentStepId === 'stock' ? stepGuidance : null}
            rows={rows}
            skuSignalDrafts={skuSignalDrafts}
            stockBySku={stockBySku}
            stockView={stockView}
            usdToKhrExchangeRate={usdToKhrExchangeRate}
            updateRow={updateRow}
            updateSkuSignalDraft={updateSkuSignalDraft}
            visibleRows={visibleRows}
            onStockViewChange={setStockView}
            onToggleDebugCellBoundaries={() => setDebugCellBoundaries((current) => !current)}
          />
        ) : null}

        {currentStepId === 'service' ? (
          <ServiceSignalsStep
            catalog={catalog}
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
            descriptor={t(STOCK_UPDATE_STEP_COPY.rankings.descriptionKey)}
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
                catalog={catalog}
                entryType="service"
                label={t('stockUpdateTopServicesLabel')}
                seedValues={defaultServiceRankingIds}
                values={serviceRankings}
                onChange={setServiceRankings}
              />
              <RankingSignalEditor
                catalog={catalog}
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
            catalog={catalog}
            error={error}
            payload={previewPayload}
            previewParts={previewParts}
            serviceSignalDrafts={serviceSignalDrafts}
            skuSignalDrafts={skuSignalDrafts}
          />
        ) : null}
      </form>
    </WorkspacePage>
  );
}
