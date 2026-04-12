import { useDeferredValue, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ActionClipboardAddIcon, ActionDeleteIcon, ActionEditIcon } from '@icons/actions';
import {
  EntityLayersIcon,
  EntityServiceIcon,
  EntitySkuIcon,
} from '@icons/entities';
import { NavigationGridIcon, NavigationListIcon, NavigationNextIcon, NavigationPreviousIcon } from '@icons/navigation';
import type { IconComponent } from '@icons';
import type { AppLanguage } from '@shared/inventory';
import type { SenaCatalog, SenaObservationRecord } from '@shared/sena';
import { SearchInput } from '@/components/system/search-input';
import { TypedConfirmDialog } from '@/components/system/typed-confirm-dialog';
import { WorkspaceActionRow, WorkspacePage, WorkspacePanel, WorkspaceTitleCard } from '@/components/system/workspace';
import { Button } from '@/components/ui/button';
import { createRecordUpdateEditSession } from '@/lib/observation-edit-session';
import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { cn } from '@/lib/utils';
import {
  buildOperationsSearchParams,
  readOperationsRouteState,
} from '@/lib/navigation-state';
import { translateUiLiteral } from '@/lib/translations';
import { RECORD_UPDATE_HUB_PATH, RECORD_UPDATE_STOCK_COUNT_PATH } from '@/lib/record-update-routes';
import { useInventory } from '@/state/inventory';
import { usePreferences } from '@/state/preferences';
import { PagedPanelNavigation } from './detail-panels';
import { intervalDaysBetween, observationCompositionLabel } from './observation-payload';
import { formatSenaDateTime, formatSenaLongDate, formatSenaWeekdayShort } from './sku-detail/format';

type ObservationScope = 'all' | 'skus' | 'services';
type ObservationView = 'heatmap' | 'all';
type HeatLevel = 0 | 1 | 2 | 3 | 4;

interface DayBucket {
  date: Date;
  key: string;
  isoValue: string;
  count: number;
  observations: SenaObservationRecord[];
  level: HeatLevel;
  inWindow: boolean;
}

interface WeekColumn {
  key: string;
  days: DayBucket[];
}

interface MonthLabel {
  key: string;
  label: string;
  column: number;
}

interface VisibleHeatmapWindow {
  alignedStart: Date;
  alignedEnd: Date;
  start: Date;
  end: Date;
  weeks: WeekColumn[];
  monthLabels: MonthLabel[];
  totalContributions: number;
  buckets: HeatmapBuckets;
}

interface StockUpdatePresentation {
  heatmapWindow: VisibleHeatmapWindow;
  selectedDay: DayBucket | null;
  selectedDayObservations: SenaObservationRecord[];
}

interface HeatmapRange {
  start: Date;
  end: Date;
}

interface HeatmapBuckets {
  threshold75: number | null;
  threshold95: number | null;
  activeLevels: HeatLevel[];
}

const DAYS_IN_WINDOW = 365;
const REPORTS_PER_PAGE = 5;
const VIEW_OPTIONS = {
  heatmap: {
    icon: NavigationGridIcon,
    label: 'Heatmap',
  },
  all: {
    icon: NavigationListIcon,
    label: 'All',
  },
} satisfies Record<ObservationView, { icon: IconComponent; label: string }>;

function hasSkuObservation(observation: SenaObservationRecord) {
  return (
    observation.input.stockSnapshot.length > 0 ||
    observation.input.orderSignals.length > 0 ||
    observation.input.retailRankings.length > 0 ||
    observation.input.retailStockouts.length > 0 ||
    observation.input.retailPrices.length > 0 ||
    observation.input.leadTimeHints.length > 0
  );
}

function hasServiceObservation(observation: SenaObservationRecord) {
  return (
    observation.input.serviceRankings.length > 0 ||
    observation.input.serviceStockouts.length > 0 ||
    observation.input.servicePrices.length > 0
  );
}

function linkedServiceSkuIds(catalog: SenaCatalog | null) {
  return new Set(
    (catalog?.sharingMask ?? [])
      .filter((entry) => entry.enabled)
      .map((entry) => entry.skuId),
  );
}

function observationSearchText(observation: SenaObservationRecord, catalog: SenaCatalog | null) {
  const skuNameById = new Map((catalog?.skus ?? []).map((sku) => [sku.skuId, sku.name]));
  const serviceNameById = new Map((catalog?.services ?? []).map((service) => [service.serviceId, service.name]));
  const linkedServiceNamesBySkuId = new Map<string, string[]>();

  for (const entry of catalog?.sharingMask ?? []) {
    if (!entry.enabled) {
      continue;
    }
    const names = linkedServiceNamesBySkuId.get(entry.skuId) ?? [];
    const serviceName = serviceNameById.get(entry.serviceId);
    if (serviceName) {
      names.push(serviceName);
      linkedServiceNamesBySkuId.set(entry.skuId, names);
    }
  }

  const skuTokens = [
    ...observation.input.stockSnapshot.flatMap((entry) => [entry.skuId, skuNameById.get(entry.skuId) ?? '']),
    ...observation.input.orderSignals.flatMap((entry) => [entry.skuId, skuNameById.get(entry.skuId) ?? '']),
    ...observation.input.retailPrices.flatMap((entry) => [entry.skuId, skuNameById.get(entry.skuId) ?? '']),
    ...observation.input.leadTimeHints.flatMap((entry) => [entry.skuId, skuNameById.get(entry.skuId) ?? '']),
    ...observation.input.stockSnapshot.flatMap((entry) => linkedServiceNamesBySkuId.get(entry.skuId) ?? []),
    ...observation.input.orderSignals.flatMap((entry) => linkedServiceNamesBySkuId.get(entry.skuId) ?? []),
    ...observation.input.retailPrices.flatMap((entry) => linkedServiceNamesBySkuId.get(entry.skuId) ?? []),
    ...observation.input.leadTimeHints.flatMap((entry) => linkedServiceNamesBySkuId.get(entry.skuId) ?? []),
  ];
  const serviceTokens = [
    ...observation.input.servicePrices.flatMap((entry) => [entry.serviceId, serviceNameById.get(entry.serviceId) ?? '']),
    ...observation.input.serviceRankings,
    ...observation.input.serviceStockouts,
  ];

  return [
    observation.input.observedAt,
    observation.input.notes ?? '',
    ...skuTokens,
    ...serviceTokens,
    ...observation.input.retailRankings,
    ...observation.input.retailStockouts,
  ]
    .join(' ')
    .toLowerCase();
}

function hasServiceLinkedSkuObservation(
  observation: SenaObservationRecord,
  serviceLinkedSkuIds: Set<string>,
) {
  return (
    observation.input.stockSnapshot.some((entry) => serviceLinkedSkuIds.has(entry.skuId)) ||
    observation.input.orderSignals.some((entry) => serviceLinkedSkuIds.has(entry.skuId)) ||
    observation.input.retailPrices.some((entry) => serviceLinkedSkuIds.has(entry.skuId)) ||
    observation.input.leadTimeHints.some((entry) => serviceLinkedSkuIds.has(entry.skuId))
  );
}

function matchesObservationScope(
  observation: SenaObservationRecord,
  scope: ObservationScope,
  serviceLinkedSkuIds: Set<string>,
) {
  if (scope === 'all') {
    return true;
  }

  if (scope === 'skus') {
    return hasSkuObservation(observation);
  }

  return hasServiceObservation(observation) || hasServiceLinkedSkuObservation(observation, serviceLinkedSkuIds);
}

function matchesObservationQuery(
  observation: SenaObservationRecord,
  query: string,
  catalog: SenaCatalog | null,
) {
  const normalized = query.trim().toLowerCase();
  if (!normalized) {
    return true;
  }
  return observationSearchText(observation, catalog).includes(normalized);
}

function startOfLocalDay(value: Date | string) {
  const date = new Date(value);
  date.setHours(0, 0, 0, 0);
  return date;
}

function addDays(value: Date, days: number) {
  const next = new Date(value);
  next.setDate(next.getDate() + days);
  return next;
}

function startOfWeek(value: Date) {
  return addDays(value, -value.getDay());
}

function endOfWeek(value: Date) {
  return addDays(value, 6 - value.getDay());
}

function dayKey(value: Date | string) {
  const date = startOfLocalDay(value);
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

function formatDayCellLabel(day: DayBucket, language: AppLanguage) {
  const dateLabel = formatSenaLongDate(day.isoValue, language);
  const suffix =
    day.count === 1
      ? translateUiLiteral(language, '1 observation')
      : translateUiLiteral(language, '{count} observations', { count: day.count });
  return `${dateLabel}, ${suffix}`;
}

interface HeatmapThresholds {
  maxCount: number;
  p75: number;
  p90: number;
}

function quantile(values: number[], percentile: number) {
  if (values.length === 0) {
    return 0;
  }
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * percentile) - 1));
  return sorted[index] ?? 0;
}

function buildHeatmapThresholds(observationsByDay: Map<string, SenaObservationRecord[]>) {
  const counts = Array.from(observationsByDay.values())
    .map((entries) => entries.length)
    .filter((count) => count > 0);

  return {
    maxCount: counts.reduce((max, count) => Math.max(max, count), 0),
    p75: quantile(counts, 0.75),
    p90: quantile(counts, 0.9),
  } satisfies HeatmapThresholds;
}

function buildHeatmapBuckets(thresholds: HeatmapThresholds): HeatmapBuckets {
  const threshold75 = Math.max(3, thresholds.p75);
  const threshold95 = Math.max(threshold75 + 1, thresholds.p90);
  const activeLevels: HeatLevel[] = [0];

  if (thresholds.maxCount >= 1) {
    activeLevels.push(1);
  }
  if (thresholds.maxCount >= 2) {
    activeLevels.push(2);
  }

  if (threshold75 > 2 && thresholds.maxCount >= threshold75) {
    activeLevels.push(3);
  }
  if (threshold95 > 2 && threshold95 !== threshold75 && thresholds.maxCount >= threshold95) {
    activeLevels.push(4);
  }

  return {
    threshold75: threshold75 > 2 && thresholds.maxCount >= threshold75 ? threshold75 : null,
    threshold95:
      threshold95 > 2 && threshold95 !== threshold75 && thresholds.maxCount >= threshold95 ? threshold95 : null,
    activeLevels,
  };
}

function heatLevelForCount(count: number, buckets: HeatmapBuckets): HeatLevel {
  if (count <= 0) {
    return 0;
  }
  if (buckets.threshold95 != null && count >= buckets.threshold95) {
    return 4;
  }
  if (buckets.threshold75 != null && count >= buckets.threshold75) {
    return 3;
  }
  if (count === 2) {
    return 2;
  }
  return 1;
}

function monthLabel(value: Date, language: AppLanguage) {
  return new Intl.DateTimeFormat(language === 'km' ? 'km-KH' : 'en-US', { month: 'short' }).format(value);
}

function heatmapTitle(window: VisibleHeatmapWindow, language: AppLanguage) {
  if (window.start.getFullYear() === window.end.getFullYear()) {
    return translateUiLiteral(language, '{count} contributions in {year}', {
      count: window.totalContributions,
      year: window.end.getFullYear(),
    });
  }
  return translateUiLiteral(language, '{count} contributions in {startYear}-{endYear}', {
    count: window.totalContributions,
    startYear: window.start.getFullYear(),
    endYear: window.end.getFullYear(),
  });
}

function buildHeatmapRange(baseAnchorDay: Date, yearOffset: number): HeatmapRange {
  if (yearOffset === 0) {
    const end = startOfLocalDay(baseAnchorDay);
    return {
      start: addDays(end, -(DAYS_IN_WINDOW - 1)),
      end,
    };
  }

  const targetYear = baseAnchorDay.getFullYear() - yearOffset;
  return {
    start: startOfLocalDay(new Date(targetYear, 0, 1)),
    end: startOfLocalDay(new Date(targetYear, 11, 31)),
  };
}

function buildHeatmapWindow(
  observations: SenaObservationRecord[],
  range: HeatmapRange,
  language: AppLanguage,
): VisibleHeatmapWindow {
  const start = startOfLocalDay(range.start);
  const end = startOfLocalDay(range.end);
  const alignedStart = startOfWeek(start);
  const alignedEnd = endOfWeek(end);
  const observationsByDay = new Map<string, SenaObservationRecord[]>();

  for (const observation of observations) {
    const key = dayKey(observation.input.observedAt);
    const entries = observationsByDay.get(key) ?? [];
    entries.push(observation);
    observationsByDay.set(key, entries);
  }

  const buckets = buildHeatmapBuckets(buildHeatmapThresholds(observationsByDay));

  const weeks: WeekColumn[] = [];
  const monthLabels: MonthLabel[] = [];
  const monthKeys = new Set<string>();
  let totalContributions = 0;
  let cursor = new Date(alignedStart);

  while (cursor <= alignedEnd) {
    const weekStart = new Date(cursor);
    const days: DayBucket[] = [];

    for (let index = 0; index < 7; index += 1) {
      const date = addDays(weekStart, index);
      const key = dayKey(date);
      const entries = observationsByDay.get(key) ?? [];
      const inWindow = date >= start && date <= end;
      if (inWindow) {
        totalContributions += entries.length;
      }
      days.push({
        date,
        key,
        isoValue: date.toISOString(),
        count: entries.length,
        observations: [...entries].sort(
          (left, right) => new Date(right.input.observedAt).getTime() - new Date(left.input.observedAt).getTime(),
        ),
        level: inWindow ? heatLevelForCount(entries.length, buckets) : 0,
        inWindow,
      });
    }

    const firstInWindowDay = days.find((day) => day.inWindow && day.date.getDate() <= 7);
    if (firstInWindowDay) {
      const key = `${firstInWindowDay.date.getFullYear()}-${firstInWindowDay.date.getMonth()}`;
      if (!monthKeys.has(key)) {
        monthKeys.add(key);
        monthLabels.push({
          key,
          label: monthLabel(firstInWindowDay.date, language),
          column: weeks.length,
        });
      }
    }

    weeks.push({
      key: weekStart.toISOString(),
      days,
    });
    cursor = addDays(weekStart, 7);
  }

  return {
    alignedStart,
    alignedEnd,
    start,
    end,
    weeks,
    monthLabels,
    totalContributions,
    buckets,
  };
}

function latestSelectableDayKey(window: VisibleHeatmapWindow) {
  for (let weekIndex = window.weeks.length - 1; weekIndex >= 0; weekIndex -= 1) {
    const week = window.weeks[weekIndex];
    for (let dayIndex = week.days.length - 1; dayIndex >= 0; dayIndex -= 1) {
      const day = week.days[dayIndex];
      if (day.inWindow && day.count > 0) {
        return day.key;
      }
    }
  }
  return null;
}

function findDayByKey(window: VisibleHeatmapWindow, key: string | null) {
  if (!key) {
    return null;
  }
  for (const week of window.weeks) {
    const match = week.days.find((day) => day.key === key);
    if (match) {
      return match;
    }
  }
  return null;
}

function heatLevelClassName(level: HeatLevel, selected: boolean, inWindow: boolean) {
  if (!inWindow) {
    return 'bg-transparent ring-0';
  }

  const base =
    level === 4
      ? 'bg-emerald-500/95'
      : level === 3
        ? 'bg-emerald-500/75'
        : level === 2
          ? 'bg-emerald-500/55'
          : level === 1
            ? 'bg-emerald-500/35'
            : 'bg-muted/70';

  return cn(
    base,
    selected ? 'ring-2 ring-foreground/70 ring-offset-2 ring-offset-background' : 'ring-1 ring-black/5',
  );
}

function buildPresentation(window: VisibleHeatmapWindow, preferredDayKey: string | null): StockUpdatePresentation {
  const selectedDay = findDayByKey(window, preferredDayKey)?.inWindow
    ? findDayByKey(window, preferredDayKey)
    : findDayByKey(window, latestSelectableDayKey(window));

  return {
    heatmapWindow: window,
    selectedDay,
    selectedDayObservations: selectedDay?.observations ?? [],
  };
}

function paginatedObservationRange(page: number, totalCount: number) {
  if (totalCount === 0) {
    return { start: 0, end: 0 };
  }

  const start = (page - 1) * REPORTS_PER_PAGE + 1;
  return {
    start,
    end: Math.min(page * REPORTS_PER_PAGE, totalCount),
  };
}

function previousObservationAt(observation: SenaObservationRecord, observations: SenaObservationRecord[]) {
  const observedTime = new Date(observation.input.observedAt).getTime();
  return observations
    .map((entry) => entry.input.observedAt)
    .filter((observedAt) => {
      const candidateTime = new Date(observedAt).getTime();
      return !Number.isNaN(candidateTime) && candidateTime < observedTime;
    })
    .sort((left, right) => new Date(right).getTime() - new Date(left).getTime())[0] ?? null;
}

function observationIntervalLabel(
  observation: SenaObservationRecord,
  observations: SenaObservationRecord[],
  language: AppLanguage,
) {
  const previousAt = previousObservationAt(observation, observations);
  const intervalDays = intervalDaysBetween(previousAt, observation.input.observedAt);
  if (!previousAt || intervalDays == null) {
    return translateUiLiteral(language, 'first update');
  }
  return translateUiLiteral(language, '{days}-day interval', { days: intervalDays });
}

function weekdayLabels(language: AppLanguage) {
  const formatter = new Intl.DateTimeFormat(language === 'km' ? 'km-KH' : 'en-US', { weekday: 'short' });
  const start = new Date(Date.UTC(2024, 0, 7));
  return Array.from({ length: 7 }, (_, index) => formatter.format(new Date(start.getTime() + index * 24 * 60 * 60 * 1000)));
}

function observationDeleteToken(observation: SenaObservationRecord) {
  return `CONFIRM DELETE REPORT`;
}

function ObservationCard({
  language,
  observation,
  observations,
  onDelete,
  onEdit,
}: {
  language: AppLanguage;
  observation: SenaObservationRecord;
  observations: SenaObservationRecord[];
  onDelete: () => void;
  onEdit: () => void;
}) {
  return (
    <div className="rounded-[1.25rem] border border-border/70 bg-background/70 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="font-medium text-foreground">
            {formatSenaDateTime(observation.input.observedAt, language)}
          </p>
          <p className="text-sm text-muted-foreground">
            {formatSenaWeekdayShort(observation.input.observedAt, language)} · {observationIntervalLabel(observation, observations, language)} ·{' '}
            {observationCompositionLabel(observation.input, language)}
          </p>
          {observation.input.notes ? (
            <p className="mt-2 text-sm text-muted-foreground">{observation.input.notes}</p>
          ) : null}
        </div>
        <WorkspaceActionRow className="shrink-0 gap-2">
          <Button size="sm" type="button" variant="outline" onClick={onEdit}>
            <ActionEditIcon className="size-4" />
            {translateUiLiteral(language, 'Edit report')}
          </Button>
          <Button size="sm" type="button" variant="destructive-outline" onClick={onDelete}>
            <ActionDeleteIcon className="size-4" />
            {translateUiLiteral(language, 'Delete report')}
          </Button>
        </WorkspaceActionRow>
      </div>
    </div>
  );
}

export function StockUpdateRoute() {
  const {
    catalog,
    deleteSenaObservation,
    isLoading,
    isSaving,
    observations,
    triggerSenaRun,
  } = useInventory();
  const { t, language, showLogsViewToggle } = usePreferences();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [query, setQuery] = useState('');
  const deferredQuery = useDeferredValue(query);
  const routeState = readOperationsRouteState(searchParams);
  const scope = routeState.scope as ObservationScope;
  const routeView = routeState.view as ObservationView;
  const view = showLogsViewToggle ? routeView : 'all';
  const [yearOffset, setYearOffset] = useState(0);
  const [selectedDayKey, setSelectedDayKey] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [deleteTarget, setDeleteTarget] = useState<SenaObservationRecord | null>(null);
  const [deleteTokenValue, setDeleteTokenValue] = useState('');

  function updateRouteState(nextState: Parameters<typeof buildOperationsSearchParams>[1], replace = false) {
    setSearchParams(buildOperationsSearchParams(searchParams, nextState), { replace });
  }

  const serviceLinkedSkuIdSet = useMemo(() => linkedServiceSkuIds(catalog), [catalog]);
  const filteredObservations = useMemo(
    () =>
      observations
        .filter(
          (observation) =>
            matchesObservationScope(observation, scope, serviceLinkedSkuIdSet) &&
            matchesObservationQuery(observation, deferredQuery, catalog),
        )
        .sort(
          (left, right) =>
            new Date(right.input.observedAt).getTime() - new Date(left.input.observedAt).getTime(),
        ),
    [catalog, deferredQuery, observations, scope, serviceLinkedSkuIdSet],
  );
  const latestFilteredObservedAt = filteredObservations[0]?.input.observedAt ?? null;

  useEffect(() => {
    setYearOffset(0);
  }, [deferredQuery, scope]);

  useEffect(() => {
    setPage(1);
  }, [deferredQuery, scope, view]);

  const baseAnchorDay = useMemo(
    () => startOfLocalDay(latestFilteredObservedAt ?? new Date().toISOString()),
    [latestFilteredObservedAt],
  );
  const maxYearOffset = useMemo(() => {
    if (filteredObservations.length === 0) {
      return 0;
    }
    const oldest = startOfLocalDay(filteredObservations[filteredObservations.length - 1].input.observedAt);
    return Math.max(0, baseAnchorDay.getFullYear() - oldest.getFullYear());
  }, [baseAnchorDay, filteredObservations]);

  useEffect(() => {
    setYearOffset((current) => Math.min(current, maxYearOffset));
  }, [maxYearOffset]);

  const heatmapRange = useMemo(
    () => buildHeatmapRange(baseAnchorDay, yearOffset),
    [baseAnchorDay, yearOffset],
  );
  const heatmapWindow = useMemo(
    () => buildHeatmapWindow(filteredObservations, heatmapRange, language),
    [filteredObservations, heatmapRange, language],
  );
  const currentPresentation = useMemo(
    () => buildPresentation(heatmapWindow, selectedDayKey),
    [heatmapWindow, selectedDayKey],
  );
  const [settledPresentation, setSettledPresentation] = useState<StockUpdatePresentation | null>(null);

  useEffect(() => {
    if (!isLoading) {
      setSettledPresentation(currentPresentation);
    }
  }, [currentPresentation, isLoading]);

  const presentation = isLoading && settledPresentation ? settledPresentation : currentPresentation;
  const selectedDay = presentation.selectedDay;
  const selectedDayObservations = presentation.selectedDayObservations;
  const visibleHeatmapWindow = presentation.heatmapWindow;
  const totalPages = Math.max(1, Math.ceil(filteredObservations.length / REPORTS_PER_PAGE));
  const clampedPage = Math.min(page, totalPages);
  const paginatedRange = paginatedObservationRange(clampedPage, filteredObservations.length);
  const paginatedObservations = filteredObservations.slice(
    (clampedPage - 1) * REPORTS_PER_PAGE,
    clampedPage * REPORTS_PER_PAGE,
  );
  const selectedDayTitle = selectedDay
    ? `${formatSenaLongDate(selectedDay.isoValue, language)} (${selectedDayObservations.length})`
    : translateUiLiteral(language, 'Selected day');
  const selectedDayDescription = selectedDay
    ? translateUiLiteral(language, 'Filtered observations captured on {date}.', {
        date: formatSenaLongDate(selectedDay.isoValue, language),
      })
    : translateUiLiteral(language, 'Choose a day in the heatmap to inspect the filtered observations captured on that date.');
  const selectedView = VIEW_OPTIONS[view];
  const SelectedViewIcon = selectedView.icon;
  const localizedWeekdayLabels = weekdayLabels(language);

  useEffect(() => {
    if (page !== clampedPage) {
      setPage(clampedPage);
    }
  }, [clampedPage, page]);

  async function handleConfirmDelete() {
    if (!deleteTarget) {
      return;
    }
    const remainingObservationCount = observations.filter(
      (observation) => observation.observationId !== deleteTarget.observationId,
    ).length;
    await deleteSenaObservation({ observationId: deleteTarget.observationId });
    if (remainingObservationCount > 0) {
      await triggerSenaRun({ algorithmVersion: 'sena-analysis-v3' });
    }
    setDeleteTarget(null);
    setDeleteTokenValue('');
  }

  function handleEditObservation(observation: SenaObservationRecord) {
    navigate(RECORD_UPDATE_STOCK_COUNT_PATH, {
      state: {
        editSession: createRecordUpdateEditSession(observation),
      },
    });
  }

  return (
    <WorkspacePage>
      <TypedConfirmDialog
        cancelLabel={translateUiLiteral(language, 'Cancel')}
        confirmLabel={translateUiLiteral(language, 'Delete report')}
        confirmationToken={deleteTarget ? observationDeleteToken(deleteTarget) : ''}
        description={
          deleteTarget ? (
            <>
              <p>{translateUiLiteral(language, 'Type this exactly to permanently delete the report:')}</p>
              <p className="mt-2 font-mono text-xs text-foreground">{observationDeleteToken(deleteTarget)}</p>
            </>
          ) : undefined
        }
        isConfirmDisabled={
          !deleteTarget ||
          deleteTokenValue.trim() !== observationDeleteToken(deleteTarget) ||
          isSaving
        }
        isSubmitting={isSaving}
        open={deleteTarget != null}
        title={translateUiLiteral(language, 'Delete report')}
        value={deleteTokenValue}
        onCancel={() => {
          setDeleteTarget(null);
          setDeleteTokenValue('');
        }}
        onConfirm={() => void handleConfirmDelete()}
        onValueChange={setDeleteTokenValue}
      />
      <WorkspaceTitleCard
        eyebrow={translateUiLiteral(language, 'Logs')}
        title={translateUiLiteral(language, 'Update history')}
        descriptor={translateUiLiteral(language, 'Search saved updates, see when real-world activity was captured, and inspect the signal package behind each interval.')}
        actions={
          <WorkspaceActionRow>
            <Button asChild>
              <Link to={RECORD_UPDATE_HUB_PATH}>
                <ActionClipboardAddIcon aria-hidden="true" className="size-4" />
                {translateUiLiteral(language, 'Start update')}
              </Link>
            </Button>
          </WorkspaceActionRow>
        }
      >
        <div className="flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-center lg:justify-start lg:gap-4">
          <div className="w-full max-w-xl">
            <SearchInput
              ariaLabel={translateUiLiteral(language, 'Search observations')}
              placeholder={t('searchPlaceholder')}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>
          <ToggleGroup
            aria-label={t('searchItems')}
            className="inline-flex max-w-full justify-start overflow-x-auto rounded-2xl"
            spacing={1}
            type="single"
            value={scope}
            onValueChange={(nextValue) => {
              if (nextValue) {
                updateRouteState({ scope: nextValue as ObservationScope });
              }
            }}
          >
            <ToggleGroupItem value="all">
              <EntityLayersIcon data-icon="inline-start" />
              {t('operationsFilterEverything')}
            </ToggleGroupItem>
            <ToggleGroupItem value="skus">
              <EntitySkuIcon data-icon="inline-start" />
              {t('filterSku')}
            </ToggleGroupItem>
            <ToggleGroupItem value="services">
              <EntityServiceIcon data-icon="inline-start" />
              {t('filterService')}
            </ToggleGroupItem>
          </ToggleGroup>
          {showLogsViewToggle ? (
            <Select value={view} onValueChange={(nextValue) => updateRouteState({ view: nextValue as ObservationView })}>
              <SelectTrigger
                aria-label={translateUiLiteral(language, 'Select log view')}
                className="h-11 rounded-2xl border border-border/70 bg-background/80 px-4 text-sm font-medium text-foreground shadow-xs data-[size=default]:h-11 [&_svg]:opacity-100"
              >
                <span className="inline-flex items-center gap-2 text-foreground">
                  <SelectedViewIcon className="size-4" />
                  <span>{translateUiLiteral(language, 'View: {value}', { value: translateUiLiteral(language, selectedView.label) })}</span>
                </span>
              </SelectTrigger>
              <SelectContent align="start" position="popper">
                {(Object.entries(VIEW_OPTIONS) as [ObservationView, (typeof VIEW_OPTIONS)[ObservationView]][]).map(
                  ([value, option]) => {
                    const OptionIcon = option.icon;
                    return (
                      <SelectItem key={value} value={value}>
                        <OptionIcon className="size-4" />
                        {translateUiLiteral(language, option.label)}
                      </SelectItem>
                    );
                  },
                )}
              </SelectContent>
            </Select>
          ) : null}
        </div>
      </WorkspaceTitleCard>
      {view === 'heatmap' ? (
        <>
          <WorkspacePanel
            title={
              isLoading && !settledPresentation
                ? translateUiLiteral(language, 'Loading contributions…')
                : heatmapTitle(visibleHeatmapWindow, language)
            }
            descriptor={translateUiLiteral(language, 'Review the activity footprint across the last 365 days, then pick a day to inspect.')}
            action={
              <WorkspaceActionRow className="gap-2">
                <Button
                  aria-label={translateUiLiteral(language, 'Previous contribution year')}
                  size="sm"
                  type="button"
                  variant="outline"
                  onClick={() => setYearOffset((current) => Math.min(current + 1, maxYearOffset))}
                >
                  <NavigationPreviousIcon aria-hidden="true" className="size-4" />
                  {translateUiLiteral(language, 'Previous year')}
                </Button>
                <Button
                  aria-label={translateUiLiteral(language, 'Next contribution year')}
                  disabled={yearOffset === 0}
                  size="sm"
                  type="button"
                  variant="outline"
                  onClick={() => setYearOffset((current) => Math.max(current - 1, 0))}
                >
                  {translateUiLiteral(language, 'Next year')}
                  <NavigationNextIcon aria-hidden="true" className="size-4" />
                </Button>
              </WorkspaceActionRow>
            }
          >
            <div className="overflow-x-auto">
              <div className="min-w-[760px] rounded-[1.5rem] border border-border/60 bg-background/35 p-4 sm:p-5">
                <div className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-3">
                  <div />
                  <div
                    className="grid text-sm font-medium text-muted-foreground"
                    style={{ gridTemplateColumns: `repeat(${visibleHeatmapWindow.weeks.length}, minmax(0, 1fr))` }}
                  >
                    {visibleHeatmapWindow.monthLabels.map((month) => (
                      <span
                        key={month.key}
                        className="truncate"
                        style={{ gridColumnStart: month.column + 1 }}
                      >
                        {month.label}
                      </span>
                    ))}
                  </div>
                  <div className="grid grid-rows-7 gap-1 pt-1 text-xs text-muted-foreground">
                    {localizedWeekdayLabels.map((label, index) => (
                      <span key={label} className="h-3 leading-3">
                        {index % 2 === 1 ? label : ''}
                      </span>
                    ))}
                  </div>
                  <div
                    aria-label={translateUiLiteral(language, 'Observation contribution heatmap')}
                    className="grid gap-1"
                    style={{ gridTemplateColumns: `repeat(${visibleHeatmapWindow.weeks.length}, minmax(0, 1fr))` }}
                  >
                    {visibleHeatmapWindow.weeks.map((week) => (
                      <div key={week.key} className="grid grid-rows-7 gap-1">
                        {week.days.map((day) => {
                          const selected = day.key === selectedDay?.key;
                          return (
                            <button
                              key={day.key}
                              aria-label={formatDayCellLabel(day, language)}
                              className={cn(
                                'size-3 rounded-[3px] transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/70',
                                !day.inWindow && 'pointer-events-none opacity-0',
                                heatLevelClassName(day.level, selected, day.inWindow),
                              )}
                              data-count={day.count}
                              data-selected={selected}
                              disabled={!day.inWindow}
                              type="button"
                              onClick={() => setSelectedDayKey(day.key)}
                            />
                          );
                        })}
                      </div>
                    ))}
                  </div>
                </div>
                <div className="mt-4 flex items-center justify-between gap-4 border-t border-border/60 pt-4 text-sm text-muted-foreground">
                  <p>
                    {translateUiLiteral(language, '{start} to {end}', {
                      start: formatSenaLongDate(visibleHeatmapWindow.start.toISOString(), language),
                      end: formatSenaLongDate(visibleHeatmapWindow.end.toISOString(), language),
                    })}
                  </p>
                  <div className="flex items-center gap-2">
                    <span>{translateUiLiteral(language, 'Less')}</span>
                    {[0, 1, 2, 3, 4].map((level) => (
                      <span
                        key={level}
                        aria-hidden="true"
                        className={cn('size-3 rounded-[3px]', heatLevelClassName(level as HeatLevel, false, true))}
                      />
                    ))}
                    <span>{translateUiLiteral(language, 'More')}</span>
                  </div>
                </div>
              </div>
            </div>
          </WorkspacePanel>
          <WorkspacePanel title={selectedDayTitle} descriptor={selectedDayDescription}>
            {selectedDay ? (
              selectedDayObservations.length > 0 ? (
                <div className="grid gap-3">
                  {selectedDayObservations.map((observation) => (
                    <ObservationCard
                      key={observation.observationId}
                      language={language}
                      observation={observation}
                      observations={filteredObservations}
                      onDelete={() => {
                        setDeleteTarget(observation);
                        setDeleteTokenValue('');
                      }}
                      onEdit={() => handleEditObservation(observation)}
                    />
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  {translateUiLiteral(language, 'No filtered observations were captured on this day.')}
                </p>
              )
            ) : (
              <p className="text-sm text-muted-foreground">
                {isLoading && !settledPresentation
                  ? translateUiLiteral(language, 'Loading observations…')
                  : translateUiLiteral(language, 'No observations match the current filters in this visible year. Adjust the search, scope, or year window.')}
              </p>
            )}
          </WorkspacePanel>
        </>
      ) : (
        <WorkspacePanel
          title={translateUiLiteral(language, 'All observations ({count})', { count: filteredObservations.length })}
          descriptor={
            filteredObservations.length > 0
              ? translateUiLiteral(language, 'Showing {start}-{end} of {count} filtered observations.', {
                  start: paginatedRange.start,
                  end: paginatedRange.end,
                  count: filteredObservations.length,
                })
              : translateUiLiteral(language, 'No observations match the current filters.')
          }
        >
          {paginatedObservations.length > 0 ? (
            <>
              <div className="grid gap-3">
                {paginatedObservations.map((observation) => (
                  <ObservationCard
                    key={observation.observationId}
                    language={language}
                    observation={observation}
                    observations={filteredObservations}
                    onDelete={() => {
                      setDeleteTarget(observation);
                      setDeleteTokenValue('');
                    }}
                    onEdit={() => handleEditObservation(observation)}
                  />
                ))}
              </div>
              {totalPages > 1 ? (
                <PagedPanelNavigation
                  className="-mx-6 -mb-6 mt-3 rounded-b-[1.5rem]"
                  firstLabel={translateUiLiteral(language, 'First')}
                  lastLabel={translateUiLiteral(language, 'Last')}
                  nextAriaLabel={translateUiLiteral(language, 'Next report page')}
                  pageCount={totalPages}
                  pageIndex={clampedPage - 1}
                  pageLabel={translateUiLiteral(language, 'Page {current} of {total}', {
                    current: clampedPage,
                    total: totalPages,
                  })}
                  previousAriaLabel={translateUiLiteral(language, 'Previous report page')}
                  setPageIndex={(value) => {
                    if (typeof value === 'function') {
                      setPage((current) => value(current - 1) + 1);
                      return;
                    }
                    setPage(value + 1);
                  }}
                />
              ) : null}
            </>
          ) : (
            <p className="text-sm text-muted-foreground">
              {isLoading && !settledPresentation
                ? translateUiLiteral(language, 'Loading observations…')
                : translateUiLiteral(language, 'No observations match the current filters. Adjust the search or scope to broaden the list.')}
            </p>
          )}
        </WorkspacePanel>
      )}
    </WorkspacePage>
  );
}
