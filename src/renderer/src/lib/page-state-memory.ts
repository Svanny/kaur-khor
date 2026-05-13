import { useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import {
  buildAnalysisHref,
  buildAnalysisSearchParams,
  buildAutomationHref,
  buildAutomationSearchParams,
  buildCatalogHref,
  buildCatalogSearchParams,
  buildFinancialsHref,
  buildFinancialsSearchParams,
  buildHistoryHref,
  buildHistorySearchParams,
  buildInboxHref,
  buildInboxSearchParams,
  buildInsightsHref,
  buildInsightsSearchParams,
  buildInventoryHref,
  buildInventorySearchParams,
  buildOverviewHref,
  buildOverviewSearchParams,
  buildPerformanceHref,
  buildPerformanceSearchParams,
  readAnalysisRouteState,
  readArchiveRouteState,
  readAutomationRouteState,
  readCatalogView,
  readFinancialsRouteState,
  readHistoryRouteState,
  readInboxRouteState,
  readInsightsRouteState,
  readInventoryRouteState,
  readOverviewRouteState,
  readPerformanceRouteState,
  type AnalysisRouteState,
  type ArchiveRouteState,
  type AutomationRouteState,
  type CatalogViewValue,
  type HistoryRouteState,
  type InboxRouteState,
  type InsightsRouteState,
  type FinancialsRouteState,
  type InventoryRouteState,
  type OverviewRouteState,
  type PerformanceRouteState,
} from '@/lib/navigation-state';
import { resolveSettingsSection } from '@/lib/settings-navigation';

export const PAGE_STATE_MEMORY_STORAGE_KEY = 'kaur-khor:page-state-memory:v1';
const PAGE_STATE_MEMORY_CHANGE_EVENT = 'kaur-khor:page-state-memory:change';

export type PageStateMemoryId =
  | 'analysis'
  | 'archive'
  | 'automations'
  | 'catalog'
  | 'financials'
  | 'history'
  | 'inbox'
  | 'insights'
  | 'inventory'
  | 'overview'
  | 'performance'
  | 'settings';

type PageStateMemoryEntry = string | {
  route?: string;
  values?: Record<string, unknown>;
};
type PageStateMemoryRecord = Partial<Record<PageStateMemoryId, PageStateMemoryEntry>>;

export type PageStateMemoryValueValidator<T> = (value: unknown) => T | null;

function pageStateStorage() {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    return window.localStorage ?? null;
  } catch {
    return null;
  }
}

function readMemoryRecord(storage = pageStateStorage()): PageStateMemoryRecord {
  if (!storage) {
    return {};
  }

  try {
    const rawValue = storage.getItem(PAGE_STATE_MEMORY_STORAGE_KEY);
    if (!rawValue) {
      return {};
    }

    const parsed = JSON.parse(rawValue);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return {};
    }

    return Object.fromEntries(
      Object.entries(parsed).filter((entry): entry is [PageStateMemoryId, PageStateMemoryEntry] => {
        if (typeof entry[1] === 'string') {
          return true;
        }
        return Boolean(entry[1]) && typeof entry[1] === 'object' && !Array.isArray(entry[1]);
      }),
    ) as PageStateMemoryRecord;
  } catch {
    return {};
  }
}

function writeMemoryRecord(record: PageStateMemoryRecord, storage = pageStateStorage()) {
  if (!storage) {
    return;
  }

  const entries = Object.entries(record).filter(([, value]) => {
    if (!value) {
      return false;
    }
    if (typeof value === 'string') {
      return Boolean(value);
    }
    return Boolean(value.route) || Object.keys(value.values ?? {}).length > 0;
  });
  if (entries.length === 0) {
    try {
      storage.removeItem(PAGE_STATE_MEMORY_STORAGE_KEY);
    } catch {}
    return;
  }

  try {
    storage.setItem(PAGE_STATE_MEMORY_STORAGE_KEY, JSON.stringify(Object.fromEntries(entries)));
  } catch {}
}

function notifyPageStateMemoryChange() {
  if (typeof window === 'undefined') {
    return;
  }

  window.dispatchEvent(new Event(PAGE_STATE_MEMORY_CHANGE_EVENT));
}

function canonicalSearch(searchParams: URLSearchParams) {
  const search = searchParams.toString();
  return search ? `?${search}` : '';
}

function rememberedSearch(pageId: PageStateMemoryId) {
  const value = readMemoryRecord()[pageId];
  const route = typeof value === 'string' ? value : value?.route;
  return route?.startsWith('?') ? route : '';
}

function rememberedSanitizedSearch(pageId: Exclude<PageStateMemoryId, 'settings'>) {
  const search = rememberedSearch(pageId);
  return search ? sanitizedSearchForPage(pageId, new URLSearchParams(search)) : '';
}

function rememberedSanitizedSearchFrom(pageIds: Array<Exclude<PageStateMemoryId, 'settings'>>) {
  for (const pageId of pageIds) {
    const search = rememberedSanitizedSearch(pageId);
    if (search) {
      return search;
    }
  }
  return '';
}

function updateRememberedSearch(pageId: PageStateMemoryId, search: string, storage = pageStateStorage()) {
  const record = readMemoryRecord(storage);
  const current = record[pageId];
  const values = typeof current === 'string' ? undefined : current?.values;
  if (search) {
    record[pageId] = values && Object.keys(values).length > 0 ? { route: search, values } : search;
  } else if (values && Object.keys(values).length > 0) {
    record[pageId] = { values };
  } else {
    delete record[pageId];
  }
  writeMemoryRecord(record, storage);
  notifyPageStateMemoryChange();
}

function scopedMemoryKey(scope: string, key: string) {
  return scope ? `${scope}:${key}` : key;
}

export function readRememberedPageValue<T>(
  pageId: PageStateMemoryId,
  key: string,
  defaultValue: T,
  validator: PageStateMemoryValueValidator<T>,
  options: { scope?: string; storage?: Storage | null } = {},
) {
  const record = readMemoryRecord(options.storage ?? pageStateStorage());
  const value = record[pageId];
  const values = typeof value === 'string' ? undefined : value?.values;
  const nextValue = validator(values?.[scopedMemoryKey(options.scope ?? '', key)]);
  return nextValue ?? defaultValue;
}

export function writeRememberedPageValue<T>(
  pageId: PageStateMemoryId,
  key: string,
  value: T,
  validator: PageStateMemoryValueValidator<T>,
  options: { defaultValue?: T; isDefaultValue?: (value: T) => boolean; scope?: string; storage?: Storage | null } = {},
) {
  const storage = options.storage ?? pageStateStorage();
  if (!storage) {
    return;
  }
  const normalizedValue = validator(value);
  if (normalizedValue == null) {
    return;
  }

  const record = readMemoryRecord(storage);
  const current = record[pageId];
  const route = typeof current === 'string' ? current : current?.route;
  const values = { ...(typeof current === 'string' ? {} : current?.values ?? {}) };
  const valueKey = scopedMemoryKey(options.scope ?? '', key);
  const isDefaultValue =
    options.isDefaultValue?.(normalizedValue) ??
    (Object.prototype.hasOwnProperty.call(options, 'defaultValue') && Object.is(normalizedValue, options.defaultValue));

  if (isDefaultValue) {
    delete values[valueKey];
  } else {
    values[valueKey] = normalizedValue;
  }

  if (route && Object.keys(values).length > 0) {
    record[pageId] = { route, values };
  } else if (route) {
    record[pageId] = route;
  } else if (Object.keys(values).length > 0) {
    record[pageId] = { values };
  } else {
    delete record[pageId];
  }
  writeMemoryRecord(record, storage);
  notifyPageStateMemoryChange();
}

function sanitizeOverviewSearch(searchParams: URLSearchParams) {
  const state = readInboxRouteState(searchParams);
  return canonicalSearch(buildInboxSearchParams(null, {
    customerFilter: state.customerFilter,
    customerTaskId: null,
    filter: state.filter,
    section: state.section,
    scope: state.scope,
    supplier: state.supplier,
    taskId: null,
    taskMode: null,
    workflow: state.workflow,
  }));
}

function sanitizeAnalysisSearch(searchParams: URLSearchParams) {
  return canonicalSearch(buildAnalysisSearchParams(null, readAnalysisRouteState(searchParams)));
}

function sanitizePerformanceSearch(searchParams: URLSearchParams) {
  return sanitizeInventorySearch(searchParams);
}

function sanitizeInventorySearch(searchParams: URLSearchParams) {
  return canonicalSearch(buildInventorySearchParams(null, readInventoryRouteState(searchParams)));
}

function sanitizeFinancialsSearch(searchParams: URLSearchParams) {
  return canonicalSearch(buildFinancialsSearchParams(null, readFinancialsRouteState(searchParams)));
}

function sanitizeAutomationSearch(searchParams: URLSearchParams) {
  const state = readAutomationRouteState(searchParams);
  return canonicalSearch(buildAutomationSearchParams(null, {
    channel: state.channel,
    conversationId: null,
    exposure: state.exposure,
    health: state.health,
    intakeFilter: state.intakeFilter,
    intakeId: null,
    q: state.q,
    section: state.section,
    ticketId: null,
  }));
}

function sanitizeHistorySearch(searchParams: URLSearchParams) {
  return canonicalSearch(buildHistorySearchParams(null, readHistoryRouteState(searchParams)));
}

function sanitizeInsightsSearch(searchParams: URLSearchParams) {
  return canonicalSearch(buildInsightsSearchParams(null, readInsightsRouteState(searchParams)));
}

function sanitizeArchiveSearch(searchParams: URLSearchParams) {
  const state = readArchiveRouteState(searchParams);
  const nextSearchParams = new URLSearchParams();
  if (state.q) {
    nextSearchParams.set('q', state.q);
  }
  if (state.supplier) {
    nextSearchParams.set('supplier', state.supplier);
  }
  if (state.view !== 'all') {
    nextSearchParams.set('view', state.view);
  }
  return canonicalSearch(nextSearchParams);
}

function sanitizeCatalogSearch(searchParams: URLSearchParams) {
  return canonicalSearch(buildCatalogSearchParams(null, {
    q: searchParams.get('q')?.trim() ? searchParams.get('q')!.trim() : null,
    supplier: searchParams.get('supplier')?.trim() ? searchParams.get('supplier')!.trim() : null,
    section: 'items',
    status: searchParams.get('status') === 'archived' ? 'archived' : 'active',
    view: readCatalogView(searchParams),
  }));
}

function pageMemoryForLocation(pathname: string): PageStateMemoryId | null {
  if (pathname === '/') {
    return null;
  }
  if (pathname === '/work' || pathname === '/work/queue') {
    return 'inbox';
  }
  if (pathname === '/catalog') {
    return 'catalog';
  }
  if (pathname === '/settings/history') {
    return 'history';
  }
  if (pathname === '/insights') {
    return 'insights';
  }
  if (pathname === '/insights/inventory' || pathname === '/insights/pressure') {
    return 'inventory';
  }
  if (pathname === '/insights/money') {
    return 'financials';
  }
  if (pathname === '/insights/explain') {
    return 'analysis';
  }
  if (pathname.startsWith('/settings')) {
    return 'settings';
  }
  return null;
}

function sanitizedSearchForPage(pageId: PageStateMemoryId, searchParams: URLSearchParams) {
  switch (pageId) {
    case 'analysis':
      return sanitizeAnalysisSearch(searchParams);
    case 'archive':
      return sanitizeArchiveSearch(searchParams);
    case 'automations':
      return sanitizeAutomationSearch(searchParams);
    case 'catalog':
      return sanitizeCatalogSearch(searchParams);
    case 'financials':
      return sanitizeFinancialsSearch(searchParams);
    case 'history':
      return sanitizeHistorySearch(searchParams);
    case 'inbox':
      return sanitizeOverviewSearch(searchParams);
    case 'insights':
      return sanitizeInsightsSearch(searchParams);
    case 'inventory':
      return sanitizeInventorySearch(searchParams);
    case 'overview':
      return sanitizeOverviewSearch(searchParams);
    case 'performance':
      return sanitizePerformanceSearch(searchParams);
    case 'settings':
      return '';
  }
}

export function rememberPageState(pathname: string, search: string, storage = pageStateStorage()) {
  const pageId = pageMemoryForLocation(pathname);
  if (!pageId || !storage) {
    return;
  }

  if (pageId === 'settings') {
    const section = resolveSettingsSection(pathname);
    updateRememberedSearch('settings', section.path === '/settings/workspace' ? '' : section.path, storage);
    return;
  }

  updateRememberedSearch(pageId, sanitizedSearchForPage(pageId, new URLSearchParams(search)), storage);
}

export function PageStateMemoryObserver() {
  const location = useLocation();

  useEffect(() => {
    rememberPageState(location.pathname, location.search);
  }, [location.pathname, location.search]);

  return null;
}

export function usePageStateMemoryVersion() {
  const [version, setVersion] = useState(0);

  useEffect(() => {
    function handleChange() {
      setVersion((currentVersion) => currentVersion + 1);
    }

    window.addEventListener(PAGE_STATE_MEMORY_CHANGE_EVENT, handleChange);
    return () => window.removeEventListener(PAGE_STATE_MEMORY_CHANGE_EVENT, handleChange);
  }, []);

  return version;
}

export function useRememberedPageValue<T>(
  pageId: PageStateMemoryId,
  key: string,
  defaultValue: T,
  validator: PageStateMemoryValueValidator<T>,
  options: { isDefaultValue?: (value: T) => boolean; scope?: string } = {},
) {
  const memoizedOptions = useMemo(
    () => ({ isDefaultValue: options.isDefaultValue, scope: options.scope }),
    [options.isDefaultValue, options.scope],
  );
  const [value, setValue] = useState(() =>
    readRememberedPageValue(pageId, key, defaultValue, validator, memoizedOptions),
  );

  useEffect(() => {
    setValue(readRememberedPageValue(pageId, key, defaultValue, validator, memoizedOptions));
  }, [defaultValue, key, memoizedOptions, pageId, validator]);

  const setRememberedValue = useMemo(
    () => (nextValue: T | ((currentValue: T) => T)) => {
      setValue((currentValue) => {
        const resolvedValue = typeof nextValue === 'function'
          ? (nextValue as (currentValue: T) => T)(currentValue)
          : nextValue;
        writeRememberedPageValue(pageId, key, resolvedValue, validator, {
          defaultValue,
          isDefaultValue: memoizedOptions.isDefaultValue,
          scope: memoizedOptions.scope,
        });
        return resolvedValue;
      });
    },
    [defaultValue, key, memoizedOptions.isDefaultValue, memoizedOptions.scope, pageId, validator],
  );

  return [value, setRememberedValue] as const;
}

export function buildRememberedOverviewHref(nextState?: Partial<OverviewRouteState>) {
  return buildInboxHref(nextState, new URLSearchParams(rememberedSanitizedSearchFrom(['inbox', 'overview'])));
}

export function buildRememberedInboxHref(nextState?: Partial<InboxRouteState>) {
  return buildInboxHref(nextState, new URLSearchParams(rememberedSanitizedSearchFrom(['inbox', 'overview'])));
}

export function buildRememberedAnalysisHref(nextState?: Partial<AnalysisRouteState>) {
  return buildAnalysisHref(nextState, new URLSearchParams(rememberedSanitizedSearch('analysis')));
}

export function buildRememberedPerformanceHref(nextState?: Partial<PerformanceRouteState>) {
  return buildRememberedInventoryHref(nextState);
}

export function buildRememberedInventoryHref(nextState?: Partial<InventoryRouteState | PerformanceRouteState>) {
  return buildInventoryHref(nextState, new URLSearchParams(rememberedSanitizedSearchFrom(['inventory', 'performance'])));
}

export function buildRememberedFinancialsHref(nextState?: Partial<FinancialsRouteState>) {
  return buildFinancialsHref(nextState, new URLSearchParams(rememberedSanitizedSearch('financials')));
}

export function buildRememberedAutomationHref(nextState?: Partial<AutomationRouteState>) {
  return buildAutomationHref(nextState, new URLSearchParams(rememberedSanitizedSearch('automations')));
}

export function buildRememberedHistoryHref(nextState?: Partial<HistoryRouteState>) {
  return buildHistoryHref(nextState, new URLSearchParams(rememberedSanitizedSearch('history')));
}

export function buildRememberedArchiveHref(nextState?: Partial<ArchiveRouteState>) {
  return buildCatalogHref({
    q: nextState?.q ?? null,
    status: 'archived',
    supplier: nextState?.supplier ?? null,
    view: nextState?.view as CatalogViewValue | undefined,
  }, new URLSearchParams(rememberedSanitizedSearch('archive')));
}

export function buildRememberedInsightsHref(nextState?: Partial<InsightsRouteState>) {
  if (!nextState) {
    return buildInsightsHref();
  }
  const rememberedInsights = rememberedSanitizedSearch('insights');
  if (rememberedInsights) {
    return buildInsightsHref(nextState, new URLSearchParams(rememberedInsights));
  }
  const rememberedInventory = rememberedSanitizedSearch('inventory');
  if (rememberedInventory) {
    return buildInsightsHref({ mode: 'inventory', ...nextState }, new URLSearchParams(rememberedInventory));
  }
  const rememberedFinancials = rememberedSanitizedSearch('financials');
  if (rememberedFinancials) {
    return buildInsightsHref({ mode: 'financials', ...nextState }, new URLSearchParams(rememberedFinancials));
  }
  const rememberedAnalysis = rememberedSanitizedSearch('analysis');
  if (rememberedAnalysis) {
    return buildInsightsHref({ mode: 'analysis', ...nextState }, new URLSearchParams(rememberedAnalysis));
  }
  return buildInsightsHref(nextState, new URLSearchParams(rememberedSanitizedSearchFrom(['inventory', 'performance'])));
}

export function buildRememberedCatalogHref(nextState?: Partial<{
  q: string | null;
  supplier: string | null;
  view: CatalogViewValue;
}>) {
  return buildCatalogHref(nextState, new URLSearchParams(rememberedSanitizedSearch('catalog')));
}

export function buildRememberedSettingsHref() {
  const rememberedSettings = readMemoryRecord().settings;
  const section = resolveSettingsSection(
    typeof rememberedSettings === 'string' ? rememberedSettings : rememberedSettings?.route ?? '/settings',
  );
  return section.path === '/settings/workspace' ? '/settings' : section.path;
}

export function buildRememberedPageHref(destination: string) {
  switch (destination) {
    case '/':
      return '/';
    case '/work':
      return '/work';
    case '/work/queue':
      return buildRememberedInboxHref();
    case '/catalog':
      return buildRememberedCatalogHref();
    case '/settings/history':
      return buildRememberedHistoryHref();
    case '/insights':
      return buildRememberedInsightsHref();
    case '/settings':
      return buildRememberedSettingsHref();
    default:
      return destination;
  }
}
