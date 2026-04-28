import { lazy, Suspense, useEffect, useLayoutEffect, useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { NavigationDashboardIcon, NavigationTaskListIcon } from '@icons/navigation';
import { CreateFirstSkuButton } from '@/components/system/create-first-sku-button';
import { RouteBackButton } from '@/components/system/page-navigation';
import { WorkspaceActionRow, WorkspaceEmpty, WorkspacePage } from '@/components/system/workspace';
import { scrollWorkspaceViewportToTop } from '@/components/system/workspace-scroll';
import { Button } from '@/components/ui/button';
import { cardFrameClassName, cardSurfaceClassName } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useTradingChartController } from '@/components/system/trading-chart';
import { useInventory } from '@/state/inventory';
import { usePreferences } from '@/state/preferences';
import {
  buildAnalysisSearchParams,
  readAnalysisRouteState,
} from '@/lib/navigation-state';
import { useBenchmarkRouteReady } from '@/lib/benchmark-route-ready';
import { activeSenaCatalog, filterCatalogBySupplier } from '@/lib/sena-catalog';
import { supplierFilterQueryValue, supplierFilterValueForQuery } from '@/components/system/supplier';
import { WireframeRightRailLayout, WireframeRows, WorkspaceTitleCardWireframe } from './loading-wireframes';
import {
  type AnalysisScope,
  type AnalysisSection,
} from './performance/analysis-view-model';
import { type AnalysisTimeframe } from './performance/analysis-timeframe';
import { useSenaDetailHydration } from './performance/use-sena-detail-hydration';

let analysisContentModulePromise: Promise<typeof import('./performance/analysis-content')> | null = null;

function loadAnalysisContentModule() {
  if (!analysisContentModulePromise) {
    analysisContentModulePromise = import('./performance/analysis-content');
  }
  return analysisContentModulePromise;
}

const AnalysisContent = lazy(async () => {
  const module = await loadAnalysisContentModule();
  return { default: module.AnalysisContent };
});

function AnalysisLoadingState({ showRightRailCards }: { showRightRailCards: boolean }) {
  const { t } = usePreferences();

  return (
    <div className="grid gap-6">
      <WorkspaceTitleCardWireframe
        actions={
          <div className="grid grid-cols-3 gap-2 lg:w-[22rem]">
            {Array.from({ length: 3 }, (_, index) => (
              <Skeleton key={`analysis-loading-scope-${index}`} className="h-10 rounded-full" />
            ))}
          </div>
        }
        descriptor={t('analysisRouteDescriptor')}
        title={
          <span className="flex min-w-0 items-center gap-3">
            <RouteBackButton className="shrink-0" />
            <span className="truncate">{t('analysisRouteTitle')}</span>
          </span>
        }
      >
        <div className="mt-1 flex flex-wrap gap-3">
          <Skeleton className="h-5 w-32 rounded-full" />
          <Skeleton className="h-5 w-36 rounded-full" />
          <Skeleton className="h-5 w-44 rounded-full" />
        </div>
      </WorkspaceTitleCardWireframe>

      <section className={`${cardFrameClassName} ${cardSurfaceClassName} rounded-[2rem] px-5 py-5`}>
        <div className="hidden-scrollbar overflow-x-auto pb-2">
          <div className="flex min-w-max gap-2">
            {Array.from({ length: 5 }, (_, index) => (
              <Skeleton key={`analysis-loading-tab-${index}`} className="h-10 w-32 rounded-full" />
            ))}
          </div>
        </div>

        <WireframeRightRailLayout railCount={4} showRightRailCards={showRightRailCards}>
            <section className="rounded-[1.7rem] border border-border/60 bg-white/95 px-6 py-5 shadow-[0_18px_38px_rgba(48,31,20,0.08)]">
              <div className="flex items-end justify-between gap-4 border-b border-border/60 pb-4">
                <div className="grid gap-2">
                  <Skeleton className="h-4 w-24 rounded-full" />
                  <Skeleton className="h-8 w-56 rounded-full" />
                </div>
                <Skeleton className="h-5 w-32 rounded-full" />
              </div>
              <div className="mt-4 flex gap-2">
                {Array.from({ length: 8 }, (_, index) => (
                  <Skeleton key={`analysis-loading-interval-${index}`} className="h-10 w-16 rounded-full" />
                ))}
              </div>
              <div className="mt-6 space-y-6">
                {WireframeRows({ rowCount: 4 })}
              </div>
            </section>

            <div className="grid gap-6 xl:grid-cols-2">
              {Array.from({ length: 2 }, (_, index) => (
                <section
                  key={`analysis-loading-lower-${index}`}
                  className="rounded-[1.7rem] border border-border/60 bg-white/95 px-6 py-5 shadow-[0_18px_38px_rgba(48,31,20,0.08)]"
                >
                  <Skeleton className="h-4 w-24 rounded-full" />
                  <Skeleton className="mt-3 h-8 w-44 rounded-full" />
                  <div className="mt-5 space-y-4">
                    {WireframeRows({ rowCount: 3 })}
                  </div>
                </section>
              ))}
            </div>
        </WireframeRightRailLayout>
      </section>
    </div>
  );
}

export function AnalysisRoute() {
  const inventory = useInventory();
  const { currency, language, showRightRailCards, t } = usePreferences();
  const [searchParams, setSearchParams] = useSearchParams();
  const routeState = readAnalysisRouteState(searchParams);
  const scope = routeState.scope as AnalysisScope;
  const section = routeState.section as AnalysisSection;
  const timeframe = routeState.timeframe as AnalysisTimeframe;
  const isLedgerExpanded = routeState.chart === 'expanded';
  const supplierFilter = supplierFilterValueForQuery(routeState.supplier);
  const baseCatalog = useMemo(() => activeSenaCatalog(inventory.catalog), [inventory.catalog]);
  const visibleCatalog = useMemo(
    () => filterCatalogBySupplier(baseCatalog, supplierFilter),
    [baseCatalog, supplierFilter],
  );
  const targetSkuIds = useMemo(
    () => (scope === 'services' ? [] : visibleCatalog?.skus.map((sku) => sku.skuId) ?? []),
    [scope, visibleCatalog?.skus],
  );
  const targetServiceIds = useMemo(
    () => (scope === 'skus' ? [] : visibleCatalog?.services.map((service) => service.serviceId) ?? []),
    [scope, visibleCatalog?.services],
  );
  const priorityServiceIds = useMemo(
    () => targetServiceIds.slice(0, 8),
    [targetServiceIds],
  );
  const prioritySkuIds = useMemo(
    () => targetSkuIds
      .filter((skuId) => inventory.workspaceSummary?.highRiskSkuIds.includes(skuId))
      .slice(0, 8),
    [inventory.workspaceSummary?.highRiskSkuIds, targetSkuIds],
  );
  const chartController = useTradingChartController({
    initialTimeframe: timeframe,
    onTimeframeChange: (nextTimeframe) => updateRouteState({ timeframe: nextTimeframe as typeof timeframe }),
    subjectId: 'workbench',
    subtype: 'analysis',
  });
  const {
    hasOlderIntervals,
    isHydratingDetails,
    isLoadingOlderIntervals,
    loadOlderIntervals,
    resetHydratedDetails,
    resolvedTimeframeCacheKey,
    serviceDetailsById,
    skuDetailsById,
    timeframeHydrationProgress,
  } = useSenaDetailHydration(chartController.timeframe as AnalysisTimeframe, {
    priorityServiceIds,
    prioritySkuIds,
    serviceIds: targetServiceIds,
    skuIds: targetSkuIds,
    timeframeBoundaryOverride: chartController.timeframeBoundaryOverride,
    timeframeCacheKey: chartController.timeframeCacheKey,
  });
  const hasCatalog = Boolean(visibleCatalog && (visibleCatalog.skus.length > 0 || visibleCatalog.services.length > 0));
  const hasWorkspaceSummary = Boolean(inventory.workspaceSummary);
  const expectedHydratedEntityCount =
    (visibleCatalog?.services.length ?? 0) +
    (visibleCatalog?.skus.length ?? 0);
  const hydratedEntityCount =
    Object.keys(serviceDetailsById).length +
    Object.keys(skuDetailsById).length;
  const isPreparingInitialAnalysis =
    (!hasCatalog && inventory.isLoading) ||
    (hasCatalog && hasWorkspaceSummary && expectedHydratedEntityCount > 0 && hydratedEntityCount === 0);

  function updateRouteState(nextState: Parameters<typeof buildAnalysisSearchParams>[1], replace = false) {
    setSearchParams(buildAnalysisSearchParams(searchParams, nextState), { replace });
  }

  function setLedgerExpanded(nextExpanded: boolean, replace = false) {
    updateRouteState({ chart: nextExpanded ? 'expanded' : null }, replace);
  }

  useLayoutEffect(() => {
    scrollWorkspaceViewportToTop();
  }, []);

  useEffect(() => {
    if (hasCatalog && hasWorkspaceSummary) {
      void loadAnalysisContentModule();
    }
  }, [hasCatalog, hasWorkspaceSummary]);

  useBenchmarkRouteReady('insights.explain', !inventory.isLoading && !isPreparingInitialAnalysis, {
    hasCatalog,
    hasWorkspaceSummary,
    scope,
    section,
  });

  if (isPreparingInitialAnalysis) {
    return (
      <WorkspacePage>
        <AnalysisLoadingState showRightRailCards={showRightRailCards} />
      </WorkspacePage>
    );
  }

  if (!hasCatalog) {
    return (
      <WorkspacePage>
        <WorkspaceEmpty
          title={t('analysisRouteNeedCatalogTitle')}
          hint={t('analysisRouteNeedCatalogHint')}
          action={<CreateFirstSkuButton />}
        />
      </WorkspacePage>
    );
  }

  if (!inventory.workspaceSummary) {
    return (
      <WorkspacePage>
        <WorkspaceEmpty
          title={t('analysisRouteNeedRunTitle')}
          hint={t('analysisRouteNeedRunHint')}
          action={
            <WorkspaceActionRow>
              <Button asChild>
                <Link to="/work/capture">
                  <NavigationTaskListIcon data-icon="inline-start" />
                  {t('overviewStaleReminderAction')}
                </Link>
              </Button>
              <Button asChild variant="outline">
                <Link to="/">
                  <NavigationDashboardIcon data-icon="inline-start" />
                  {t('analysisRouteOpenOverview')}
                </Link>
              </Button>
            </WorkspaceActionRow>
          }
        />
      </WorkspacePage>
    );
  }

  return (
    <Suspense fallback={<WorkspacePage><AnalysisLoadingState showRightRailCards={showRightRailCards} /></WorkspacePage>}>
      <AnalysisContent
        currency={currency}
        hasOlderIntervals={hasOlderIntervals}
        inventory={inventory}
        isHydratingDetails={isHydratingDetails}
        isLoadingOlderIntervals={isLoadingOlderIntervals}
        language={language}
        loadOlderIntervals={loadOlderIntervals}
        resetHydratedDetails={resetHydratedDetails}
        resolvedTimeframeCacheKey={resolvedTimeframeCacheKey}
        scope={scope}
        section={section}
        chartController={chartController}
        isLedgerExpanded={isLedgerExpanded}
        serviceDetailsById={serviceDetailsById}
        setLedgerExpanded={setLedgerExpanded}
        setScope={(nextScope) => updateRouteState({ scope: nextScope as typeof scope })}
        setSection={(nextSection) => updateRouteState({ section: nextSection as typeof section })}
        setSupplierFilter={(nextSupplierFilter) => updateRouteState({ supplier: supplierFilterQueryValue(nextSupplierFilter) })}
        showRightRailCards={showRightRailCards}
        skuDetailsById={skuDetailsById}
        supplierFilter={supplierFilter}
        timeframeHydrationProgress={timeframeHydrationProgress}
      />
    </Suspense>
  );
}
