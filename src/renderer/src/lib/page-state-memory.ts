import { useEffect, useState } from 'react';
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
  buildOperationsArchiveHref,
  buildOperationsHref,
  buildOperationsSearchParams,
  buildOverviewHref,
  buildOverviewSearchParams,
  buildPerformanceHref,
  buildPerformanceSearchParams,
  readAnalysisRouteState,
  readArchiveRouteState,
  readAutomationRouteState,
  readCatalogView,
  readFinancialsRouteState,
  readOperationsRouteState,
  readOverviewRouteState,
  readPerformanceRouteState,
  type AnalysisRouteState,
  type ArchiveRouteState,
  type AutomationRouteState,
  type CatalogViewValue,
  type FinancialsRouteState,
  type OperationsRouteState,
  type OverviewRouteState,
  type PerformanceRouteState,
} from '@/lib/navigation-state';
import { resolveSettingsSection } from '@/lib/settings-navigation';

export const PAGE_STATE_MEMORY_STORAGE_KEY = 'banji:page-state-memory:v1';
const PAGE_STATE_MEMORY_CHANGE_EVENT = 'banji:page-state-memory:change';

export type PageStateMemoryId =
  | 'analysis'
  | 'archive'
  | 'automations'
  | 'catalog'
  | 'financials'
  | 'operations'
  | 'overview'
  | 'performance'
  | 'settings';

type PageStateMemoryRecord = Partial<Record<PageStateMemoryId, string>>;

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
      Object.entries(parsed).filter((entry): entry is [PageStateMemoryId, string] => typeof entry[1] === 'string'),
    ) as PageStateMemoryRecord;
  } catch {
    return {};
  }
}

function writeMemoryRecord(record: PageStateMemoryRecord, storage = pageStateStorage()) {
  if (!storage) {
    return;
  }

  const entries = Object.entries(record).filter(([, value]) => value);
  if (entries.length === 0) {
    storage.removeItem(PAGE_STATE_MEMORY_STORAGE_KEY);
    return;
  }

  storage.setItem(PAGE_STATE_MEMORY_STORAGE_KEY, JSON.stringify(Object.fromEntries(entries)));
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
  return value?.startsWith('?') ? value : '';
}

function rememberedSanitizedSearch(pageId: Exclude<PageStateMemoryId, 'settings'>) {
  const search = rememberedSearch(pageId);
  return search ? sanitizedSearchForPage(pageId, new URLSearchParams(search)) : '';
}

function updateRememberedSearch(pageId: PageStateMemoryId, search: string, storage = pageStateStorage()) {
  const record = readMemoryRecord(storage);
  if (search) {
    record[pageId] = search;
  } else {
    delete record[pageId];
  }
  writeMemoryRecord(record, storage);
  notifyPageStateMemoryChange();
}

function sanitizeOverviewSearch(searchParams: URLSearchParams) {
  const state = readOverviewRouteState(searchParams);
  return canonicalSearch(buildOverviewSearchParams(null, {
    customerFilter: state.customerFilter,
    customerTaskId: null,
    filter: state.filter,
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
  return canonicalSearch(buildPerformanceSearchParams(null, readPerformanceRouteState(searchParams)));
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

function sanitizeOperationsSearch(searchParams: URLSearchParams) {
  return canonicalSearch(buildOperationsSearchParams(null, readOperationsRouteState(searchParams)));
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
    view: readCatalogView(searchParams),
  }));
}

function pageMemoryForLocation(pathname: string): PageStateMemoryId | null {
  if (pathname === '/') {
    return 'overview';
  }
  if (pathname === '/analysis') {
    return 'analysis';
  }
  if (pathname === '/automations') {
    return 'automations';
  }
  if (pathname === '/catalog') {
    return 'catalog';
  }
  if (pathname === '/financials') {
    return 'financials';
  }
  if (pathname === '/operations') {
    return 'operations';
  }
  if (pathname === '/operations/archive') {
    return 'archive';
  }
  if (pathname === '/performance') {
    return 'performance';
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
    case 'operations':
      return sanitizeOperationsSearch(searchParams);
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

export function buildRememberedOverviewHref(nextState?: Partial<OverviewRouteState>) {
  return buildOverviewHref(nextState, new URLSearchParams(rememberedSanitizedSearch('overview')));
}

export function buildRememberedAnalysisHref(nextState?: Partial<AnalysisRouteState>) {
  return buildAnalysisHref(nextState, new URLSearchParams(rememberedSanitizedSearch('analysis')));
}

export function buildRememberedPerformanceHref(nextState?: Partial<PerformanceRouteState>) {
  return buildPerformanceHref(nextState, new URLSearchParams(rememberedSanitizedSearch('performance')));
}

export function buildRememberedFinancialsHref(nextState?: Partial<FinancialsRouteState>) {
  return buildFinancialsHref(nextState, new URLSearchParams(rememberedSanitizedSearch('financials')));
}

export function buildRememberedAutomationHref(nextState?: Partial<AutomationRouteState>) {
  return buildAutomationHref(nextState, new URLSearchParams(rememberedSanitizedSearch('automations')));
}

export function buildRememberedOperationsHref(nextState?: Partial<OperationsRouteState>) {
  return buildOperationsHref(nextState, new URLSearchParams(rememberedSanitizedSearch('operations')));
}

export function buildRememberedArchiveHref(nextState?: Partial<ArchiveRouteState>) {
  return buildOperationsArchiveHref(nextState, new URLSearchParams(rememberedSanitizedSearch('archive')));
}

export function buildRememberedCatalogHref(nextState?: Partial<{
  q: string | null;
  supplier: string | null;
  view: CatalogViewValue;
}>) {
  return buildCatalogHref(nextState, new URLSearchParams(rememberedSanitizedSearch('catalog')));
}

export function buildRememberedSettingsHref() {
  const section = resolveSettingsSection(readMemoryRecord().settings ?? '/settings');
  return section.path === '/settings/workspace' ? '/settings' : section.path;
}

export function buildRememberedPageHref(destination: string) {
  switch (destination) {
    case '/':
      return buildRememberedOverviewHref();
    case '/analysis':
      return buildRememberedAnalysisHref();
    case '/automations':
      return buildRememberedAutomationHref();
    case '/catalog':
      return buildRememberedCatalogHref();
    case '/financials':
      return buildRememberedFinancialsHref();
    case '/operations':
      return buildRememberedOperationsHref();
    case '/operations/archive':
      return buildRememberedArchiveHref();
    case '/performance':
      return buildRememberedPerformanceHref();
    case '/settings':
      return buildRememberedSettingsHref();
    default:
      return destination;
  }
}
