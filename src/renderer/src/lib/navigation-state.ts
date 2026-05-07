export const inboxSectionValues = ['queue', 'intake'] as const;
export type InboxSectionValue = typeof inboxSectionValues[number];

export const captureLaneValues = [
  'stock-count',
  'customer-order',
  'immediate-sale',
  'supplier-order',
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

export const insightsModeValues = ['performance', 'financials', 'analysis'] as const;
export type InsightsModeValue = typeof insightsModeValues[number];
export const insightsModePathByValue: Record<InsightsModeValue, string> = {
  analysis: 'explain',
  financials: 'money',
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
    section: readEnumValue(searchParams, 'section', inboxSectionValues, 'queue'),
    filter: readEnumValue(searchParams, 'filter', overviewTaskFilterValues, 'all'),
    scope: readEnumValue(searchParams, 'scope', overviewScopeValues, 'all'),
    supplier: searchParams.get('supplier')?.trim() ? searchParams.get('supplier')!.trim() : null,
    taskId: taskId?.trim() ? taskId : null,
    taskMode: taskId?.trim() ? taskMode : null,
    workflow: readEnumValue(searchParams, 'workflow', overviewWorkflowValues, 'customer'),
    customerFilter: readEnumValue(searchParams, 'customerFilter', overviewCustomerFilterValues, 'all'),
    customerTaskId: searchParams.get('customerTask')?.trim() ? searchParams.get('customerTask')!.trim() : null,
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
  writeEnumValue(searchParams, 'section', resolvedState.section, 'queue');
  writeEnumValue(searchParams, 'scope', resolvedState.scope, 'all');
  writeOptionalValue(searchParams, 'supplier', resolvedState.supplier?.trim() ? resolvedState.supplier.trim() : null);
  writeOptionalValue(searchParams, 'task', resolvedState.taskId);
  writeOptionalValue(searchParams, 'taskMode', resolvedState.taskId ? resolvedState.taskMode : null);
  writeEnumValue(searchParams, 'workflow', resolvedState.workflow, 'customer');
  writeEnumValue(searchParams, 'customerFilter', resolvedState.customerFilter, 'all');
  writeOptionalValue(searchParams, 'customerTask', resolvedState.customerTaskId);
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
  return buildInsightsHref({ analysis: nextState, mode: 'analysis' }, currentSearchParams);
}

export function readPerformanceRouteState(searchParams: URLSearchParams): PerformanceRouteState {
  return {
    compare: readBooleanValue(searchParams, 'compare', false),
    range: readEnumValue(searchParams, 'range', performanceRangeValues, '30d'),
    scope: readEnumValue(searchParams, 'scope', performanceScopeValues, 'all'),
    supplier: searchParams.get('supplier')?.trim() ? searchParams.get('supplier')!.trim() : null,
    customRangeStart: searchParams.get('customStart')?.trim() || null,
    customRangeEnd: searchParams.get('customEnd')?.trim() || null,
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
  return buildInsightsHref({ mode: 'performance', performance: nextState }, currentSearchParams);
}

export function readFinancialsRouteState(searchParams: URLSearchParams): FinancialsRouteState {
  return {
    compare: readBooleanValue(searchParams, 'compare', false),
    range: readEnumValue(searchParams, 'range', financialsRangeValues, '1d'),
    scope: readEnumValue(searchParams, 'scope', financialsScopeValues, 'all'),
    supplier: searchParams.get('supplier')?.trim() ? searchParams.get('supplier')!.trim() : null,
    customRangeStart: searchParams.get('customStart')?.trim() || null,
    customRangeEnd: searchParams.get('customEnd')?.trim() || null,
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
    q: searchParams.get('q')?.trim() ? searchParams.get('q')!.trim() : null,
    conversationId: searchParams.get('conversation')?.trim() ? searchParams.get('conversation')!.trim() : null,
    intakeId: searchParams.get('intake')?.trim() ? searchParams.get('intake')!.trim() : null,
    ticketId: searchParams.get('ticket')?.trim() ? searchParams.get('ticket')!.trim() : null,
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
    q: searchParams.get('q')?.trim() ? searchParams.get('q')!.trim() : null,
    section: readEnumValue(searchParams, 'section', catalogSectionValues, 'items'),
    status: readEnumValue(searchParams, 'status', catalogStatusValues, 'active'),
    supplier: searchParams.get('supplier')?.trim() ? searchParams.get('supplier')!.trim() : null,
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
    mode: readEnumValue(searchParams, 'mode', insightsModeValues, 'performance'),
    analysis: readAnalysisRouteState(searchParams),
    financials: readFinancialsRouteState(searchParams),
    performance: readPerformanceRouteState(searchParams),
  };
}

export function buildInsightsSearchParams(
  currentSearchParams?: URLSearchParams | null,
  nextState?: Partial<{
    analysis: Partial<AnalysisRouteState>;
    financials: Partial<FinancialsRouteState>;
    mode: InsightsModeValue;
    performance: Partial<PerformanceRouteState>;
  }>,
) {
  const currentState = readInsightsRouteState(cloneSearchParams(currentSearchParams));
  const mode = nextState?.mode ?? currentState.mode;
  const baseSearchParams = new URLSearchParams();
  writeEnumValue(baseSearchParams, 'mode', mode, 'performance');

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
  return buildPerformanceSearchParams(baseSearchParams, {
    ...currentState.performance,
    ...nextState?.performance,
  });
}

export function buildInsightsHref(
  nextState?: Partial<{
    analysis: Partial<AnalysisRouteState>;
    financials: Partial<FinancialsRouteState>;
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
        : nextState?.performance
          ? 'performance'
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
  return `/catalog/skus/${skuId}`;
}

export function buildServiceDetailHref(serviceId: string) {
  return `/catalog/services/${serviceId}`;
}
