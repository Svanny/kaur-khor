export const overviewScopeValues = ['all', 'skus', 'services'] as const;
export type OverviewSearchScope = typeof overviewScopeValues[number];

export const overviewTaskFilterValues = [
  'all',
  'to_order',
  'awaiting_receipt',
  'follow_up_today',
  'ready_to_receive',
  'received_today',
] as const;
export type OverviewTaskFilterValue = typeof overviewTaskFilterValues[number];

export const overviewTaskModeValues = [
  'not_ordered',
  'ordered_waiting',
  'eta_changed',
  'goods_received',
] as const;
export type OverviewTaskModeValue = typeof overviewTaskModeValues[number];

export const catalogViewValues = ['all', 'skus', 'services'] as const;
export type CatalogViewValue = typeof catalogViewValues[number];

export const performanceScopeValues = ['all', 'services', 'skus'] as const;
export type PerformanceScopeValue = typeof performanceScopeValues[number];

export const performanceRangeValues = ['7d', '30d', '90d'] as const;
export type PerformanceRangeValue = typeof performanceRangeValues[number];

export const analysisScopeValues = ['all', 'services', 'skus'] as const;
export type AnalysisScopeValue = typeof analysisScopeValues[number];

export const analysisSectionValues = ['workbench', 'pressure', 'observations', 'fragility', 'settings'] as const;
export type AnalysisSectionValue = typeof analysisSectionValues[number];

export const analysisTimeframeValues = ['Recent', '1M', '3M', 'YTD', '1Y', 'MAX'] as const;
export type AnalysisTimeframeValue = typeof analysisTimeframeValues[number];

export const operationsScopeValues = ['all', 'skus', 'services'] as const;
export type OperationsScopeValue = typeof operationsScopeValues[number];

export const operationsViewValues = ['heatmap', 'all'] as const;
export type OperationsViewValue = typeof operationsViewValues[number];

export const skuActionValues = ['stock', 'order', 'receipt', 'price'] as const;
export type SkuActionValue = typeof skuActionValues[number];

export const serviceActionValues = ['stock', 'receipt', 'price'] as const;
export type ServiceActionValue = typeof serviceActionValues[number];

export type OverviewRouteState = {
  filter: OverviewTaskFilterValue;
  scope: OverviewSearchScope;
  taskId: string | null;
  taskMode: OverviewTaskModeValue | null;
};

export type AnalysisRouteState = {
  scope: AnalysisScopeValue;
  section: AnalysisSectionValue;
  timeframe: AnalysisTimeframeValue;
};

export type PerformanceRouteState = {
  compare: boolean;
  range: PerformanceRangeValue;
  scope: PerformanceScopeValue;
};

export type OperationsRouteState = {
  scope: OperationsScopeValue;
  view: OperationsViewValue;
};

function readEnumValue<const T extends readonly string[]>(
  searchParams: URLSearchParams,
  key: string,
  allowedValues: T,
  fallback: T[number],
): T[number] {
  const rawValue = searchParams.get(key);
  if (!rawValue) {
    return fallback;
  }

  return allowedValues.includes(rawValue) ? rawValue : fallback;
}

function writeEnumValue(
  searchParams: URLSearchParams,
  key: string,
  value: string | null | undefined,
  fallback: string,
) {
  if (!value || value === fallback) {
    searchParams.delete(key);
    return;
  }

  searchParams.set(key, value);
}

function readBooleanValue(
  searchParams: URLSearchParams,
  key: string,
  fallback: boolean,
) {
  const rawValue = searchParams.get(key);
  if (rawValue == null) {
    return fallback;
  }
  if (rawValue === '1' || rawValue === 'true') {
    return true;
  }
  if (rawValue === '0' || rawValue === 'false') {
    return false;
  }
  return fallback;
}

function writeBooleanValue(
  searchParams: URLSearchParams,
  key: string,
  value: boolean,
  fallback: boolean,
) {
  if (value === fallback) {
    searchParams.delete(key);
    return;
  }

  searchParams.set(key, value ? '1' : '0');
}

function writeOptionalValue(
  searchParams: URLSearchParams,
  key: string,
  value: string | null | undefined,
) {
  if (!value) {
    searchParams.delete(key);
    return;
  }

  searchParams.set(key, value);
}

function cloneSearchParams(searchParams?: URLSearchParams | null) {
  return new URLSearchParams(searchParams ?? undefined);
}

export function createHref(pathname: string, searchParams: URLSearchParams) {
  const search = searchParams.toString();
  return search ? `${pathname}?${search}` : pathname;
}

export function readOverviewRouteState(searchParams: URLSearchParams): OverviewRouteState {
  const taskMode = readEnumValue(searchParams, 'taskMode', overviewTaskModeValues, overviewTaskModeValues[0]);
  const taskId = searchParams.get('task');

  return {
    filter: readEnumValue(searchParams, 'filter', overviewTaskFilterValues, 'all'),
    scope: readEnumValue(searchParams, 'scope', overviewScopeValues, 'all'),
    taskId: taskId?.trim() ? taskId : null,
    taskMode: taskId?.trim() ? taskMode : null,
  };
}

export function buildOverviewSearchParams(
  currentSearchParams?: URLSearchParams | null,
  nextState?: Partial<OverviewRouteState>,
) {
  const currentState = readOverviewRouteState(cloneSearchParams(currentSearchParams));
  const searchParams = cloneSearchParams(currentSearchParams);
  const resolvedState = { ...currentState, ...nextState };

  writeEnumValue(searchParams, 'filter', resolvedState.filter, 'all');
  writeEnumValue(searchParams, 'scope', resolvedState.scope, 'all');
  writeOptionalValue(searchParams, 'task', resolvedState.taskId);
  writeOptionalValue(searchParams, 'taskMode', resolvedState.taskId ? resolvedState.taskMode : null);
  return searchParams;
}

export function buildOverviewHref(nextState?: Partial<OverviewRouteState>, currentSearchParams?: URLSearchParams | null) {
  return createHref('/', buildOverviewSearchParams(currentSearchParams, nextState));
}

export function readAnalysisRouteState(searchParams: URLSearchParams): AnalysisRouteState {
  return {
    scope: readEnumValue(searchParams, 'scope', analysisScopeValues, 'all'),
    section: readEnumValue(searchParams, 'section', analysisSectionValues, 'workbench'),
    timeframe: readEnumValue(searchParams, 'timeframe', analysisTimeframeValues, 'Recent'),
  };
}

export function buildAnalysisSearchParams(
  currentSearchParams?: URLSearchParams | null,
  nextState?: Partial<AnalysisRouteState>,
) {
  const currentState = readAnalysisRouteState(cloneSearchParams(currentSearchParams));
  const searchParams = cloneSearchParams(currentSearchParams);
  const resolvedState = { ...currentState, ...nextState };

  writeEnumValue(searchParams, 'scope', resolvedState.scope, 'all');
  writeEnumValue(searchParams, 'section', resolvedState.section, 'workbench');
  writeEnumValue(searchParams, 'timeframe', resolvedState.timeframe, 'Recent');
  return searchParams;
}

export function buildAnalysisHref(nextState?: Partial<AnalysisRouteState>, currentSearchParams?: URLSearchParams | null) {
  return createHref('/analysis', buildAnalysisSearchParams(currentSearchParams, nextState));
}

export function readPerformanceRouteState(searchParams: URLSearchParams): PerformanceRouteState {
  return {
    compare: readBooleanValue(searchParams, 'compare', true),
    range: readEnumValue(searchParams, 'range', performanceRangeValues, '30d'),
    scope: readEnumValue(searchParams, 'scope', performanceScopeValues, 'all'),
  };
}

export function buildPerformanceSearchParams(
  currentSearchParams?: URLSearchParams | null,
  nextState?: Partial<PerformanceRouteState>,
) {
  const currentState = readPerformanceRouteState(cloneSearchParams(currentSearchParams));
  const searchParams = cloneSearchParams(currentSearchParams);
  const resolvedState = { ...currentState, ...nextState };

  writeBooleanValue(searchParams, 'compare', resolvedState.compare, true);
  writeEnumValue(searchParams, 'range', resolvedState.range, '30d');
  writeEnumValue(searchParams, 'scope', resolvedState.scope, 'all');
  return searchParams;
}

export function buildPerformanceHref(
  nextState?: Partial<PerformanceRouteState>,
  currentSearchParams?: URLSearchParams | null,
) {
  return createHref('/performance', buildPerformanceSearchParams(currentSearchParams, nextState));
}

export function readOperationsRouteState(searchParams: URLSearchParams): OperationsRouteState {
  return {
    scope: readEnumValue(searchParams, 'scope', operationsScopeValues, 'all'),
    view: readEnumValue(searchParams, 'view', operationsViewValues, 'heatmap'),
  };
}

export function buildOperationsSearchParams(
  currentSearchParams?: URLSearchParams | null,
  nextState?: Partial<OperationsRouteState>,
) {
  const currentState = readOperationsRouteState(cloneSearchParams(currentSearchParams));
  const searchParams = cloneSearchParams(currentSearchParams);
  const resolvedState = { ...currentState, ...nextState };

  writeEnumValue(searchParams, 'scope', resolvedState.scope, 'all');
  writeEnumValue(searchParams, 'view', resolvedState.view, 'heatmap');
  return searchParams;
}

export function buildOperationsHref(
  nextState?: Partial<OperationsRouteState>,
  currentSearchParams?: URLSearchParams | null,
) {
  return createHref('/operations', buildOperationsSearchParams(currentSearchParams, nextState));
}

export function readCatalogView(searchParams: URLSearchParams): CatalogViewValue {
  return readEnumValue(searchParams, 'view', catalogViewValues, 'all');
}

export function buildCatalogSearchParams(
  currentSearchParams?: URLSearchParams | null,
  nextState?: Partial<{
    q: string | null;
    view: CatalogViewValue;
  }>,
) {
  const searchParams = cloneSearchParams(currentSearchParams);

  if (nextState?.q !== undefined) {
    writeOptionalValue(searchParams, 'q', nextState.q?.trim() ? nextState.q.trim() : null);
  }
  if (nextState?.view !== undefined) {
    writeEnumValue(searchParams, 'view', nextState.view, 'all');
  }

  return searchParams;
}

export function buildCatalogHref(
  nextState?: Partial<{
    q: string | null;
    view: CatalogViewValue;
  }>,
  currentSearchParams?: URLSearchParams | null,
) {
  return createHref('/catalog', buildCatalogSearchParams(currentSearchParams, nextState));
}

export function readSkuAction(searchParams: URLSearchParams): SkuActionValue | null {
  const action = searchParams.get('action');
  return action && skuActionValues.includes(action as SkuActionValue) ? (action as SkuActionValue) : null;
}

export function readServiceAction(searchParams: URLSearchParams): ServiceActionValue | null {
  const action = searchParams.get('action');
  return action && serviceActionValues.includes(action as ServiceActionValue)
    ? (action as ServiceActionValue)
    : null;
}

export function buildSkuDetailHref(skuId: string, action?: SkuActionValue | null) {
  const searchParams = new URLSearchParams();
  writeOptionalValue(searchParams, 'action', action);
  return createHref(`/catalog/skus/${skuId}`, searchParams);
}

export function buildServiceDetailHref(serviceId: string, action?: ServiceActionValue | null) {
  const searchParams = new URLSearchParams();
  writeOptionalValue(searchParams, 'action', action);
  return createHref(`/catalog/services/${serviceId}`, searchParams);
}
