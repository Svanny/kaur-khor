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

export const financialsScopeValues = ['all', 'services', 'skus'] as const;
export type FinancialsScopeValue = typeof financialsScopeValues[number];

export const financialsRangeValues = ['1d', '7d', '30d', '90d'] as const;
export type FinancialsRangeValue = typeof financialsRangeValues[number];

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

export const archiveViewValues = ['all', 'skus', 'services'] as const;
export type ArchiveViewValue = typeof archiveViewValues[number];

export const skuActionValues = ['stock', 'order', 'receipt', 'price'] as const;
export type SkuActionValue = typeof skuActionValues[number];

export const serviceActionValues = ['stock', 'receipt', 'price'] as const;
export type ServiceActionValue = typeof serviceActionValues[number];

export type OverviewRouteState = {
  filter: OverviewTaskFilterValue;
  scope: OverviewSearchScope;
  supplier: string | null;
  taskId: string | null;
  taskMode: OverviewTaskModeValue | null;
};

export type AnalysisRouteState = {
  chart: 'expanded' | null;
  scope: AnalysisScopeValue;
  section: AnalysisSectionValue;
  supplier: string | null;
  timeframe: AnalysisTimeframeValue;
};

export type PerformanceRouteState = {
  compare: boolean;
  range: PerformanceRangeValue;
  scope: PerformanceScopeValue;
  supplier: string | null;
};

export type FinancialsRouteState = {
  compare: boolean;
  range: FinancialsRangeValue;
  scope: FinancialsScopeValue;
  supplier: string | null;
};

export type OperationsRouteState = {
  scope: OperationsScopeValue;
  supplier: string | null;
  view: OperationsViewValue;
};

export type ArchiveRouteState = {
  q: string | null;
  supplier: string | null;
  view: ArchiveViewValue;
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
    supplier: searchParams.get('supplier')?.trim() ? searchParams.get('supplier')!.trim() : null,
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
  writeOptionalValue(searchParams, 'supplier', resolvedState.supplier?.trim() ? resolvedState.supplier.trim() : null);
  writeOptionalValue(searchParams, 'task', resolvedState.taskId);
  writeOptionalValue(searchParams, 'taskMode', resolvedState.taskId ? resolvedState.taskMode : null);
  return searchParams;
}

export function buildOverviewHref(nextState?: Partial<OverviewRouteState>, currentSearchParams?: URLSearchParams | null) {
  return createHref('/', buildOverviewSearchParams(currentSearchParams, nextState));
}

export function readAnalysisRouteState(searchParams: URLSearchParams): AnalysisRouteState {
  const chartValue = searchParams.get('chart');
  return {
    chart: chartValue === 'expanded' ? 'expanded' : null,
    scope: readEnumValue(searchParams, 'scope', analysisScopeValues, 'all'),
    section: readEnumValue(searchParams, 'section', analysisSectionValues, 'workbench'),
    supplier: searchParams.get('supplier')?.trim() ? searchParams.get('supplier')!.trim() : null,
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
  writeOptionalValue(searchParams, 'supplier', resolvedState.supplier?.trim() ? resolvedState.supplier.trim() : null);
  writeEnumValue(searchParams, 'timeframe', resolvedState.timeframe, 'Recent');
  writeOptionalValue(searchParams, 'chart', resolvedState.chart === 'expanded' ? 'expanded' : null);
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
    supplier: searchParams.get('supplier')?.trim() ? searchParams.get('supplier')!.trim() : null,
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
  writeOptionalValue(searchParams, 'supplier', resolvedState.supplier?.trim() ? resolvedState.supplier.trim() : null);
  return searchParams;
}

export function buildPerformanceHref(
  nextState?: Partial<PerformanceRouteState>,
  currentSearchParams?: URLSearchParams | null,
) {
  return createHref('/performance', buildPerformanceSearchParams(currentSearchParams, nextState));
}

export function readFinancialsRouteState(searchParams: URLSearchParams): FinancialsRouteState {
  return {
    compare: readBooleanValue(searchParams, 'compare', true),
    range: readEnumValue(searchParams, 'range', financialsRangeValues, '1d'),
    scope: readEnumValue(searchParams, 'scope', financialsScopeValues, 'all'),
    supplier: searchParams.get('supplier')?.trim() ? searchParams.get('supplier')!.trim() : null,
  };
}

export function buildFinancialsSearchParams(
  currentSearchParams?: URLSearchParams | null,
  nextState?: Partial<FinancialsRouteState>,
) {
  const currentState = readFinancialsRouteState(cloneSearchParams(currentSearchParams));
  const searchParams = cloneSearchParams(currentSearchParams);
  const resolvedState = { ...currentState, ...nextState };

  writeBooleanValue(searchParams, 'compare', resolvedState.compare, true);
  writeEnumValue(searchParams, 'range', resolvedState.range, '1d');
  writeEnumValue(searchParams, 'scope', resolvedState.scope, 'all');
  writeOptionalValue(searchParams, 'supplier', resolvedState.supplier?.trim() ? resolvedState.supplier.trim() : null);
  return searchParams;
}

export function buildFinancialsHref(
  nextState?: Partial<FinancialsRouteState>,
  currentSearchParams?: URLSearchParams | null,
) {
  return createHref('/financials', buildFinancialsSearchParams(currentSearchParams, nextState));
}

export function readOperationsRouteState(searchParams: URLSearchParams): OperationsRouteState {
  return {
    scope: readEnumValue(searchParams, 'scope', operationsScopeValues, 'all'),
    supplier: searchParams.get('supplier')?.trim() ? searchParams.get('supplier')!.trim() : null,
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
  writeOptionalValue(searchParams, 'supplier', resolvedState.supplier?.trim() ? resolvedState.supplier.trim() : null);
  writeEnumValue(searchParams, 'view', resolvedState.view, 'heatmap');
  return searchParams;
}

export function buildOperationsHref(
  nextState?: Partial<OperationsRouteState>,
  currentSearchParams?: URLSearchParams | null,
) {
  return createHref('/operations', buildOperationsSearchParams(currentSearchParams, nextState));
}

export function readArchiveRouteState(searchParams: URLSearchParams): ArchiveRouteState {
  return {
    q: searchParams.get('q')?.trim() ? searchParams.get('q')!.trim() : null,
    supplier: searchParams.get('supplier')?.trim() ? searchParams.get('supplier')!.trim() : null,
    view: readEnumValue(searchParams, 'view', archiveViewValues, 'all'),
  };
}

export function buildArchiveSearchParams(
  currentSearchParams?: URLSearchParams | null,
  nextState?: Partial<ArchiveRouteState>,
) {
  const currentState = readArchiveRouteState(cloneSearchParams(currentSearchParams));
  const searchParams = cloneSearchParams(currentSearchParams);
  const resolvedState = { ...currentState, ...nextState };

  writeOptionalValue(searchParams, 'q', resolvedState.q?.trim() ? resolvedState.q.trim() : null);
  writeOptionalValue(searchParams, 'supplier', resolvedState.supplier?.trim() ? resolvedState.supplier.trim() : null);
  writeEnumValue(searchParams, 'view', resolvedState.view, 'all');
  return searchParams;
}

export function buildOperationsArchiveHref(
  nextState?: Partial<ArchiveRouteState>,
  currentSearchParams?: URLSearchParams | null,
) {
  return createHref('/operations/archive', buildArchiveSearchParams(currentSearchParams, nextState));
}

export function readCatalogView(searchParams: URLSearchParams): CatalogViewValue {
  return readEnumValue(searchParams, 'view', catalogViewValues, 'all');
}

export function buildCatalogSearchParams(
  currentSearchParams?: URLSearchParams | null,
  nextState?: Partial<{
    q: string | null;
    supplier: string | null;
    view: CatalogViewValue;
  }>,
) {
  const searchParams = cloneSearchParams(currentSearchParams);

  if (nextState?.q !== undefined) {
    writeOptionalValue(searchParams, 'q', nextState.q?.trim() ? nextState.q.trim() : null);
  }
  if (nextState?.supplier !== undefined) {
    writeOptionalValue(searchParams, 'supplier', nextState.supplier?.trim() ? nextState.supplier.trim() : null);
  }
  if (nextState?.view !== undefined) {
    writeEnumValue(searchParams, 'view', nextState.view, 'all');
  }

  return searchParams;
}

export function buildCatalogHref(
  nextState?: Partial<{
    q: string | null;
    supplier: string | null;
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
