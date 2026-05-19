export const inboxSectionValues = ['queue', 'intake'] as const;
export type InboxSectionValue = typeof inboxSectionValues[number];

export const captureLaneValues = [
  'stock-count',
  'customer-order',
  'immediate-sale',
  'supplier-order',
  'supplier-receipt',
  'custom',
] as const;
export type CaptureLaneValue = typeof captureLaneValues[number];

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

export const overviewWorkflowValues = ['supplier', 'customer'] as const;
export type OverviewWorkflowValue = typeof overviewWorkflowValues[number];

export const overviewCustomerFilterValues = [
  'all',
  'review',
  'quoted',
  'open',
  'closed',
] as const;
export type OverviewCustomerFilterValue = typeof overviewCustomerFilterValues[number];

export const catalogViewValues = ['all', 'skus', 'services'] as const;
export type CatalogViewValue = typeof catalogViewValues[number];

export const catalogStatusValues = ['active', 'archived'] as const;
export type CatalogStatusValue = typeof catalogStatusValues[number];

export const catalogSectionValues = ['items', 'automation'] as const;
export type CatalogSectionValue = typeof catalogSectionValues[number];

export const performanceScopeValues = ['all', 'services', 'skus'] as const;
export type PerformanceScopeValue = typeof performanceScopeValues[number];

export const inventoryScopeValues = ['all', 'skus', 'services'] as const;
export type InventoryScopeValue = typeof inventoryScopeValues[number];

export const inventoryRangeValues = ['7d', '30d', '90d', 'custom'] as const;
export type InventoryRangeValue = typeof inventoryRangeValues[number];

export const inventoryProjectionHorizonValues = ['7d', '14d', '30d', '60d'] as const;
export type InventoryProjectionHorizonValue = typeof inventoryProjectionHorizonValues[number];

export const inventoryRowSetValues = ['focus', 'all'] as const;
export type InventoryRowSetValue = typeof inventoryRowSetValues[number];

export const inventoryViewPresetValues = ['health', 'flow', 'forecast', 'pipeline', 'custom'] as const;
export type InventoryViewPresetValue = typeof inventoryViewPresetValues[number];

export const insightsModeValues = ['inventory', 'financials', 'analysis', 'performance'] as const;
export type InsightsModeValue = typeof insightsModeValues[number];
export const insightsModePathByValue: Record<InsightsModeValue, string> = {
  analysis: 'explain',
  financials: 'money',
  inventory: 'inventory',
  performance: 'pressure',
};

export const performanceRangeValues = ['7d', '30d', '90d', 'custom'] as const;
export type PerformanceRangeValue = typeof performanceRangeValues[number];

export const financialsScopeValues = ['all', 'services', 'skus'] as const;
export type FinancialsScopeValue = typeof financialsScopeValues[number];

export const financialsRangeValues = ['1d', '7d', '30d', '90d', 'custom'] as const;
export type FinancialsRangeValue = typeof financialsRangeValues[number];

export const automationChannelValues = ['telegram'] as const;
export type AutomationChannelValue = typeof automationChannelValues[number];

export const automationSectionValues = [
  'overview',
  'catalog',
  'intake',
  'chat',
  'exceptions',
  'settings',
] as const;
export type AutomationSectionValue = typeof automationSectionValues[number];

export const automationExposureValues = ['all', 'exposed', 'hidden'] as const;
export type AutomationExposureValue = typeof automationExposureValues[number];

export const automationIntakeFilterValues = [
  'all',
  'new',
  'needs_review',
  'quoted',
  'ticketed',
  'completed',
  'canceled',
] as const;
export type AutomationIntakeFilterValue = typeof automationIntakeFilterValues[number];

export const automationHealthValues = ['all', 'connected', 'paused', 'error'] as const;
export type AutomationHealthValue = typeof automationHealthValues[number];

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
  section: InboxSectionValue;
  filter: OverviewTaskFilterValue;
  scope: OverviewSearchScope;
  supplier: string | null;
  taskId: string | null;
  taskMode: OverviewTaskModeValue | null;
  workflow: OverviewWorkflowValue;
  customerFilter: OverviewCustomerFilterValue;
  customerTaskId: string | null;
};

export type InboxRouteState = OverviewRouteState;

export type CaptureRouteState = {
  lane: CaptureLaneValue | null;
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
  customRangeStart: string | null;
  customRangeEnd: string | null;
};

export type InventoryRouteState = {
  customColumns: string[];
  customRangeEnd: string | null;
  customRangeStart: string | null;
  projectionHorizon: InventoryProjectionHorizonValue;
  range: InventoryRangeValue;
  rowSet: InventoryRowSetValue;
  scope: InventoryScopeValue;
  supplier: string | null;
  viewPreset: InventoryViewPresetValue;
};

export type FinancialsRouteState = {
  compare: boolean;
  range: FinancialsRangeValue;
  scope: FinancialsScopeValue;
  supplier: string | null;
  customRangeStart: string | null;
  customRangeEnd: string | null;
};

export type AutomationRouteState = {
  channel: AutomationChannelValue;
  section: AutomationSectionValue;
  exposure: AutomationExposureValue;
  intakeFilter: AutomationIntakeFilterValue;
  health: AutomationHealthValue;
  q: string | null;
  conversationId: string | null;
  intakeId: string | null;
  ticketId: string | null;
};

export type OperationsRouteState = {
  scope: OperationsScopeValue;
  supplier: string | null;
  view: OperationsViewValue;
};

export type HistoryRouteState = OperationsRouteState;

export type ArchiveRouteState = {
  q: string | null;
  supplier: string | null;
  view: ArchiveViewValue;
};

export type CatalogRouteState = {
  q: string | null;
  section: CatalogSectionValue;
  status: CatalogStatusValue;
  supplier: string | null;
  view: CatalogViewValue;
};

export type InsightsRouteState = {
  mode: InsightsModeValue;
  analysis: AnalysisRouteState;
  financials: FinancialsRouteState;
  inventory: InventoryRouteState;
  performance: PerformanceRouteState;
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

function readCustomRangeValue(searchParams: URLSearchParams) {
  const start = searchParams.get('customStart')?.trim() || null;
  const end = searchParams.get('customEnd')?.trim() || null;
  if (!start || !end) {
    return { customRangeStart: null, customRangeEnd: null };
  }
  const startTime = Date.parse(start);
  const endTime = Date.parse(end);
  if (
    !Number.isFinite(startTime) ||
    !Number.isFinite(endTime) ||
    startTime > endTime ||
    new Date(startTime).toISOString() !== start ||
    new Date(endTime).toISOString() !== end
  ) {
    return { customRangeStart: null, customRangeEnd: null };
  }
  return {
    customRangeStart: start,
    customRangeEnd: end,
  };
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

function readOptionalTrimmedValue(searchParams: URLSearchParams, key: string) {
  const value = searchParams.get(key)?.trim();
  return value ? value : null;
}

function readCustomColumnsValue(searchParams: URLSearchParams) {
  const seen = new Set<string>();
  return searchParams.get('columns')?.split(',')
    .map((value) => value.trim())
    .filter((value) => {
      if (!value || value.length > 64 || seen.has(value)) {
        return false;
      }
      seen.add(value);
      return true;
    })
    .slice(0, 32) ?? [];
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
  const taskId = readOptionalTrimmedValue(searchParams, 'task');

  return {
    section: readEnumValue(searchParams, 'section', inboxSectionValues, 'queue'),
    filter: readEnumValue(searchParams, 'filter', overviewTaskFilterValues, 'all'),
    scope: readEnumValue(searchParams, 'scope', overviewScopeValues, 'all'),
    supplier: readOptionalTrimmedValue(searchParams, 'supplier'),
    taskId,
    taskMode: taskId ? taskMode : null,
    workflow: readEnumValue(searchParams, 'workflow', overviewWorkflowValues, 'supplier'),
    customerFilter: readEnumValue(searchParams, 'customerFilter', overviewCustomerFilterValues, 'all'),
    customerTaskId: readOptionalTrimmedValue(searchParams, 'customerTask'),
  };
}

export function buildOverviewSearchParams(
  currentSearchParams?: URLSearchParams | null,
  nextState?: Partial<OverviewRouteState>,
) {
  const currentState = readOverviewRouteState(cloneSearchParams(currentSearchParams));
  const searchParams = cloneSearchParams(currentSearchParams);
  const resolvedState = { ...currentState, ...nextState };
  const isSupplierWorkflow = resolvedState.workflow === 'supplier';
  const supplierTaskId = isSupplierWorkflow ? resolvedState.taskId : null;
  const customerTaskId = isSupplierWorkflow ? null : resolvedState.customerTaskId;
  const customerFilter = isSupplierWorkflow ? 'all' : resolvedState.customerFilter;

  writeEnumValue(searchParams, 'filter', resolvedState.filter, 'all');
  writeEnumValue(searchParams, 'section', resolvedState.section, 'queue');
  writeEnumValue(searchParams, 'scope', resolvedState.scope, 'all');
  writeOptionalValue(searchParams, 'supplier', resolvedState.supplier?.trim() ? resolvedState.supplier.trim() : null);
  writeOptionalValue(searchParams, 'task', supplierTaskId);
  writeOptionalValue(searchParams, 'taskMode', supplierTaskId ? resolvedState.taskMode : null);
  writeEnumValue(searchParams, 'workflow', resolvedState.workflow, 'supplier');
  writeEnumValue(searchParams, 'customerFilter', customerFilter, 'all');
  writeOptionalValue(searchParams, 'customerTask', customerTaskId);
  return searchParams;
}

export function buildOverviewHref(nextState?: Partial<OverviewRouteState>, currentSearchParams?: URLSearchParams | null) {
  return createHref('/work/queue', buildOverviewSearchParams(currentSearchParams, nextState));
}

export const readInboxRouteState = readOverviewRouteState;
export const readWorkRouteState = readOverviewRouteState;
export const buildInboxSearchParams = buildOverviewSearchParams;
export const buildWorkSearchParams = buildOverviewSearchParams;

export function buildInboxHref(nextState?: Partial<InboxRouteState>, currentSearchParams?: URLSearchParams | null) {
  return createHref('/work/queue', buildInboxSearchParams(currentSearchParams, nextState));
}

export function buildWorkHref(nextState?: Partial<InboxRouteState>, currentSearchParams?: URLSearchParams | null) {
  return createHref('/work/queue', buildWorkSearchParams(currentSearchParams, nextState));
}

export function buildCaptureHref(nextState?: Partial<CaptureRouteState>, currentSearchParams?: URLSearchParams | null) {
  const searchParams = cloneSearchParams(currentSearchParams);
  const lane = nextState?.lane ?? null;
  if (!lane) {
    return createHref('/work/capture', searchParams);
  }
  return createHref(`/work/capture/${lane}`, searchParams);
}

export function readAnalysisRouteState(searchParams: URLSearchParams): AnalysisRouteState {
  const chartValue = searchParams.get('chart');
  return {
    chart: chartValue === 'expanded' ? 'expanded' : null,
    scope: readEnumValue(searchParams, 'scope', analysisScopeValues, 'all'),
    section: readEnumValue(searchParams, 'section', analysisSectionValues, 'workbench'),
    supplier: readOptionalTrimmedValue(searchParams, 'supplier'),
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
  return buildInsightsHref({ analysis: nextState, mode: 'analysis' }, currentSearchParams);
}

export function readPerformanceRouteState(searchParams: URLSearchParams): PerformanceRouteState {
  const customRange = readCustomRangeValue(searchParams);
  const range = readEnumValue(searchParams, 'range', performanceRangeValues, '30d');
  return {
    compare: readBooleanValue(searchParams, 'compare', false),
    range: range === 'custom' && !customRange.customRangeStart ? '30d' : range,
    scope: readEnumValue(searchParams, 'scope', performanceScopeValues, 'all'),
    supplier: readOptionalTrimmedValue(searchParams, 'supplier'),
    customRangeStart: customRange.customRangeStart,
    customRangeEnd: customRange.customRangeEnd,
  };
}

export function buildPerformanceSearchParams(
  currentSearchParams?: URLSearchParams | null,
  nextState?: Partial<PerformanceRouteState>,
) {
  const currentState = readPerformanceRouteState(cloneSearchParams(currentSearchParams));
  const searchParams = cloneSearchParams(currentSearchParams);
  const resolvedState = { ...currentState, ...nextState };

  writeBooleanValue(searchParams, 'compare', resolvedState.compare, false);
  writeEnumValue(searchParams, 'range', resolvedState.range, '30d');
  writeEnumValue(searchParams, 'scope', resolvedState.scope, 'all');
  writeOptionalValue(searchParams, 'supplier', resolvedState.supplier?.trim() ? resolvedState.supplier.trim() : null);
  writeOptionalValue(searchParams, 'customStart', resolvedState.customRangeStart?.trim() ? resolvedState.customRangeStart.trim() : null);
  writeOptionalValue(searchParams, 'customEnd', resolvedState.customRangeEnd?.trim() ? resolvedState.customRangeEnd.trim() : null);
  return searchParams;
}

export function buildPerformanceHref(
  nextState?: Partial<PerformanceRouteState>,
  currentSearchParams?: URLSearchParams | null,
) {
  return buildInventoryHref(nextState, currentSearchParams);
}

export function readInventoryRouteState(searchParams: URLSearchParams): InventoryRouteState {
  const customColumns = readCustomColumnsValue(searchParams);
  const customRange = readCustomRangeValue(searchParams);
  const range = readEnumValue(searchParams, 'range', inventoryRangeValues, '30d');
  return {
    customColumns,
    customRangeStart: customRange.customRangeStart,
    customRangeEnd: customRange.customRangeEnd,
    projectionHorizon: readEnumValue(searchParams, 'projection', inventoryProjectionHorizonValues, '14d'),
    range: range === 'custom' && !customRange.customRangeStart ? '30d' : range,
    rowSet: readEnumValue(searchParams, 'rows', inventoryRowSetValues, 'focus'),
    scope: readEnumValue(searchParams, 'scope', inventoryScopeValues, 'skus'),
    supplier: readOptionalTrimmedValue(searchParams, 'supplier'),
    viewPreset: readEnumValue(searchParams, 'preset', inventoryViewPresetValues, 'health'),
  };
}

export function buildInventorySearchParams(
  currentSearchParams?: URLSearchParams | null,
  nextState?: Partial<InventoryRouteState | PerformanceRouteState>,
) {
  const currentState = readInventoryRouteState(cloneSearchParams(currentSearchParams));
  const normalizedPerformanceState =
    nextState && 'compare' in nextState
      ? {
          customRangeEnd: nextState.customRangeEnd,
          customRangeStart: nextState.customRangeStart,
          range: nextState.range as InventoryRangeValue,
          scope: nextState.scope as InventoryScopeValue,
          supplier: nextState.supplier,
        }
      : nextState;
  const searchParams = cloneSearchParams(currentSearchParams);
  const resolvedState = { ...currentState, ...normalizedPerformanceState } as InventoryRouteState;

  writeEnumValue(searchParams, 'range', resolvedState.range, '30d');
  writeEnumValue(searchParams, 'scope', resolvedState.scope, 'skus');
  writeOptionalValue(searchParams, 'supplier', resolvedState.supplier?.trim() ? resolvedState.supplier.trim() : null);
  writeOptionalValue(searchParams, 'customStart', resolvedState.customRangeStart?.trim() ? resolvedState.customRangeStart.trim() : null);
  writeOptionalValue(searchParams, 'customEnd', resolvedState.customRangeEnd?.trim() ? resolvedState.customRangeEnd.trim() : null);
  writeEnumValue(searchParams, 'projection', resolvedState.projectionHorizon, '14d');
  writeEnumValue(searchParams, 'rows', resolvedState.rowSet, 'focus');
  writeEnumValue(searchParams, 'preset', resolvedState.viewPreset, 'health');
  if (resolvedState.viewPreset === 'custom' && resolvedState.customColumns.length > 0) {
    searchParams.set('columns', resolvedState.customColumns.join(','));
  } else {
    searchParams.delete('columns');
  }
  searchParams.delete('compare');
  return searchParams;
}

export function buildInventoryHref(
  nextState?: Partial<InventoryRouteState | PerformanceRouteState>,
  currentSearchParams?: URLSearchParams | null,
) {
  return buildInsightsHref({ inventory: nextState as Partial<InventoryRouteState>, mode: 'inventory' }, currentSearchParams);
}

export function readFinancialsRouteState(searchParams: URLSearchParams): FinancialsRouteState {
  const customRange = readCustomRangeValue(searchParams);
  const range = readEnumValue(searchParams, 'range', financialsRangeValues, '1d');
  return {
    compare: readBooleanValue(searchParams, 'compare', false),
    range: range === 'custom' && !customRange.customRangeStart ? '1d' : range,
    scope: readEnumValue(searchParams, 'scope', financialsScopeValues, 'all'),
    supplier: readOptionalTrimmedValue(searchParams, 'supplier'),
    customRangeStart: customRange.customRangeStart,
    customRangeEnd: customRange.customRangeEnd,
  };
}

export function buildFinancialsSearchParams(
  currentSearchParams?: URLSearchParams | null,
  nextState?: Partial<FinancialsRouteState>,
) {
  const currentState = readFinancialsRouteState(cloneSearchParams(currentSearchParams));
  const searchParams = cloneSearchParams(currentSearchParams);
  const resolvedState = { ...currentState, ...nextState };

  writeBooleanValue(searchParams, 'compare', resolvedState.compare, false);
  writeEnumValue(searchParams, 'range', resolvedState.range, '1d');
  writeEnumValue(searchParams, 'scope', resolvedState.scope, 'all');
  writeOptionalValue(searchParams, 'supplier', resolvedState.supplier?.trim() ? resolvedState.supplier.trim() : null);
  writeOptionalValue(searchParams, 'customStart', resolvedState.customRangeStart?.trim() ? resolvedState.customRangeStart.trim() : null);
  writeOptionalValue(searchParams, 'customEnd', resolvedState.customRangeEnd?.trim() ? resolvedState.customRangeEnd.trim() : null);
  return searchParams;
}

export function buildFinancialsHref(
  nextState?: Partial<FinancialsRouteState>,
  currentSearchParams?: URLSearchParams | null,
) {
  return buildInsightsHref({ financials: nextState, mode: 'financials' }, currentSearchParams);
}

export function readAutomationRouteState(searchParams: URLSearchParams): AutomationRouteState {
  return {
    channel: readEnumValue(searchParams, 'channel', automationChannelValues, 'telegram'),
    section: readEnumValue(searchParams, 'section', automationSectionValues, 'overview'),
    exposure: readEnumValue(searchParams, 'exposure', automationExposureValues, 'all'),
    intakeFilter: readEnumValue(searchParams, 'filter', automationIntakeFilterValues, 'all'),
    health: readEnumValue(searchParams, 'health', automationHealthValues, 'all'),
    q: readOptionalTrimmedValue(searchParams, 'q'),
    conversationId: readOptionalTrimmedValue(searchParams, 'conversation'),
    intakeId: readOptionalTrimmedValue(searchParams, 'intake'),
    ticketId: readOptionalTrimmedValue(searchParams, 'ticket'),
  };
}

export function buildAutomationSearchParams(
  currentSearchParams?: URLSearchParams | null,
  nextState?: Partial<AutomationRouteState>,
) {
  const currentState = readAutomationRouteState(cloneSearchParams(currentSearchParams));
  const searchParams = cloneSearchParams(currentSearchParams);
  const resolvedState = { ...currentState, ...nextState };

  writeEnumValue(searchParams, 'channel', resolvedState.channel, 'telegram');
  writeEnumValue(searchParams, 'section', resolvedState.section, 'overview');
  writeEnumValue(searchParams, 'exposure', resolvedState.exposure, 'all');
  writeEnumValue(searchParams, 'filter', resolvedState.intakeFilter, 'all');
  writeEnumValue(searchParams, 'health', resolvedState.health, 'all');
  writeOptionalValue(searchParams, 'q', resolvedState.q?.trim() ? resolvedState.q.trim() : null);
  writeOptionalValue(searchParams, 'conversation', resolvedState.conversationId);
  writeOptionalValue(searchParams, 'intake', resolvedState.intakeId);
  writeOptionalValue(searchParams, 'ticket', resolvedState.ticketId);

  return searchParams;
}

export function buildAutomationHref(
  nextState?: Partial<AutomationRouteState>,
  currentSearchParams?: URLSearchParams | null,
) {
  const searchParams = buildAutomationSearchParams(currentSearchParams, nextState);
  const section = readAutomationRouteState(searchParams).section;
  if (section === 'catalog') {
    searchParams.set('section', 'automation');
    return createHref('/catalog', searchParams);
  }
  if (section === 'settings') {
    return '/settings/automation';
  }
  searchParams.set('section', 'intake');
  return createHref('/work/intake', searchParams);
}

export function readOperationsRouteState(searchParams: URLSearchParams): OperationsRouteState {
  return {
    scope: readEnumValue(searchParams, 'scope', operationsScopeValues, 'all'),
    supplier: readOptionalTrimmedValue(searchParams, 'supplier'),
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
  return buildHistoryHref(nextState, currentSearchParams);
}

export const readHistoryRouteState = readOperationsRouteState;
export const buildHistorySearchParams = buildOperationsSearchParams;

export function buildHistoryHref(
  nextState?: Partial<HistoryRouteState>,
  currentSearchParams?: URLSearchParams | null,
) {
  return createHref('/settings/history', buildHistorySearchParams(currentSearchParams, nextState));
}

export function readArchiveRouteState(searchParams: URLSearchParams): ArchiveRouteState {
  return {
    q: readOptionalTrimmedValue(searchParams, 'q'),
    supplier: readOptionalTrimmedValue(searchParams, 'supplier'),
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
  const archiveSearchParams = buildArchiveSearchParams(currentSearchParams, nextState);
  return buildCatalogHref({
    q: archiveSearchParams.get('q'),
    status: 'archived',
    supplier: archiveSearchParams.get('supplier'),
    view: readEnumValue(archiveSearchParams, 'view', archiveViewValues, 'all') as CatalogViewValue,
  });
}

export function readCatalogView(searchParams: URLSearchParams): CatalogViewValue {
  return readEnumValue(searchParams, 'view', catalogViewValues, 'all');
}

export function readCatalogRouteState(searchParams: URLSearchParams): CatalogRouteState {
  return {
    q: readOptionalTrimmedValue(searchParams, 'q'),
    section: readEnumValue(searchParams, 'section', catalogSectionValues, 'items'),
    status: readEnumValue(searchParams, 'status', catalogStatusValues, 'active'),
    supplier: readOptionalTrimmedValue(searchParams, 'supplier'),
    view: readCatalogView(searchParams),
  };
}

export function buildCatalogSearchParams(
  currentSearchParams?: URLSearchParams | null,
  nextState?: Partial<{
    q: string | null;
    section: CatalogSectionValue;
    status: CatalogStatusValue;
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
  if (nextState?.section !== undefined) {
    writeEnumValue(searchParams, 'section', nextState.section, 'items');
  }
  if (nextState?.status !== undefined) {
    writeEnumValue(searchParams, 'status', nextState.status, 'active');
  }
  if (nextState?.view !== undefined) {
    writeEnumValue(searchParams, 'view', nextState.view, 'all');
  }

  return searchParams;
}

export function buildCatalogHref(
  nextState?: Partial<{
    q: string | null;
    section: CatalogSectionValue;
    status: CatalogStatusValue;
    supplier: string | null;
    view: CatalogViewValue;
  }>,
  currentSearchParams?: URLSearchParams | null,
) {
  return createHref('/catalog', buildCatalogSearchParams(currentSearchParams, nextState));
}

export function readInsightsRouteState(searchParams: URLSearchParams): InsightsRouteState {
  return {
    mode: readEnumValue(searchParams, 'mode', insightsModeValues, 'inventory'),
    analysis: readAnalysisRouteState(searchParams),
    financials: readFinancialsRouteState(searchParams),
    inventory: readInventoryRouteState(searchParams),
    performance: readPerformanceRouteState(searchParams),
  };
}

export function buildInsightsSearchParams(
  currentSearchParams?: URLSearchParams | null,
  nextState?: Partial<{
    analysis: Partial<AnalysisRouteState>;
    financials: Partial<FinancialsRouteState>;
    inventory: Partial<InventoryRouteState>;
    mode: InsightsModeValue;
    performance: Partial<PerformanceRouteState>;
  }>,
) {
  const currentState = readInsightsRouteState(cloneSearchParams(currentSearchParams));
  const mode = nextState?.mode ?? currentState.mode;
  const baseSearchParams = new URLSearchParams();
  writeEnumValue(baseSearchParams, 'mode', mode, 'inventory');

  if (mode === 'analysis') {
    return buildAnalysisSearchParams(baseSearchParams, {
      ...currentState.analysis,
      ...nextState?.analysis,
    });
  }
  if (mode === 'financials') {
    return buildFinancialsSearchParams(baseSearchParams, {
      ...currentState.financials,
      ...nextState?.financials,
    });
  }
  if (mode === 'inventory') {
    return buildInventorySearchParams(baseSearchParams, {
      ...currentState.inventory,
      ...nextState?.inventory,
    });
  }
  return buildPerformanceSearchParams(baseSearchParams, {
    ...currentState.performance,
    ...nextState?.performance,
  });
}

export function buildInsightsHref(
  nextState?: Partial<{
    analysis: Partial<AnalysisRouteState>;
    financials: Partial<FinancialsRouteState>;
    inventory: Partial<InventoryRouteState>;
    mode: InsightsModeValue;
    performance: Partial<PerformanceRouteState>;
  }>,
  currentSearchParams?: URLSearchParams | null,
) {
  if (!nextState && !currentSearchParams) {
    return '/insights';
  }

  const mode =
    nextState?.mode ??
    (nextState?.analysis
      ? 'analysis'
      : nextState?.financials
        ? 'financials'
        : nextState?.inventory
          ? 'inventory'
          : nextState?.performance
            ? 'inventory'
            : readInsightsRouteState(cloneSearchParams(currentSearchParams)).mode);
  const searchParams = buildInsightsSearchParams(currentSearchParams, {
    ...nextState,
    mode,
  });
  searchParams.delete('mode');
  return createHref(`/insights/${insightsModePathByValue[mode]}`, searchParams);
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

export function buildSkuDetailHref(skuId: string) {
  return `/catalog/skus/${encodeURIComponent(skuId)}`;
}

export function buildSkuEditHref(skuId: string) {
  return `${buildSkuDetailHref(skuId)}/edit`;
}

export function buildServiceDetailHref(serviceId: string) {
  return `/catalog/services/${encodeURIComponent(serviceId)}`;
}

export function buildServiceEditHref(serviceId: string) {
  return `${buildServiceDetailHref(serviceId)}/edit`;
}
