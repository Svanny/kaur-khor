import { lazy, Suspense, useEffect, useLayoutEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { WorkspaceActionRow, WorkspaceEmpty, WorkspacePage } from '@/components/system/workspace';
import { scrollWorkspaceViewportToTop } from '@/components/system/workspace-scroll';
import { Button } from '@/components/ui/button';
import { cardFrameClassName, cardSurfaceClassName } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { rightRailLayoutClassName } from '@/components/system/right-rail-layout';
import { useInventory } from '@/state/inventory';
import { usePreferences } from '@/state/preferences';
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

function AnalysisLoadingRailCards() {
  return Array.from({ length: 4 }, (_, index) => (
    <div
      key={`analysis-loading-rail-${index}`}
      className="rounded-[1.4rem] border border-border/60 bg-white px-4 py-4 shadow-[0_12px_28px_rgba(48,31,20,0.07)]"
    >
      <Skeleton className="h-4 w-28 rounded-full" />
      <Skeleton className="mt-4 h-6 w-40 rounded-full" />
      <Skeleton className="mt-2 h-4 w-full rounded-full" />
      <Skeleton className="mt-2 h-4 w-4/5 rounded-full" />
    </div>
  ));
}

function AnalysisLoadingPanelRows({ rowCount }: { rowCount: number }) {
  return Array.from({ length: rowCount }, (_, index) => (
    <div key={`analysis-loading-row-${index}`} className="space-y-3 border-t border-border/60 pt-5 first:border-t-0 first:pt-0">
      <div className="flex items-center justify-between gap-3">
        <Skeleton className="h-5 w-40 rounded-full" />
        <Skeleton className="h-4 w-24 rounded-full" />
      </div>
      <Skeleton className="h-28 w-full rounded-[1.4rem]" />
    </div>
  ));
}

function AnalysisLoadingState({ showRightRailCards }: { showRightRailCards: boolean }) {
  return (
    <div className="grid gap-6">
      <div className="rounded-[1.4rem] border border-border/60 bg-secondary/30 px-4 py-3 text-sm text-foreground">
        Preparing analysis workbench
      </div>

      <section className={`${cardFrameClassName} ${cardSurfaceClassName} rounded-[2rem] px-6 py-5`}>
        <div className="flex flex-col gap-4 border-b border-border/60 pb-5 lg:flex-row lg:items-start lg:justify-between">
          <div className="grid gap-4">
            <Skeleton className="h-4 w-20 rounded-full" />
            <Skeleton className="h-10 w-48 rounded-full" />
            <Skeleton className="h-5 w-[40rem] max-w-full rounded-full" />
          </div>
          <div className="grid grid-cols-3 gap-2 lg:w-[22rem]">
            {Array.from({ length: 3 }, (_, index) => (
              <Skeleton key={`analysis-loading-scope-${index}`} className="h-10 rounded-full" />
            ))}
          </div>
        </div>
        <div className="mt-5 flex flex-wrap gap-3">
          <Skeleton className="h-5 w-32 rounded-full" />
          <Skeleton className="h-5 w-36 rounded-full" />
          <Skeleton className="h-5 w-44 rounded-full" />
        </div>
      </section>

      <section className={`${cardFrameClassName} ${cardSurfaceClassName} rounded-[2rem] px-5 py-5`}>
        <div className="hidden-scrollbar overflow-x-auto pb-2">
          <div className="flex min-w-max gap-2">
            {Array.from({ length: 5 }, (_, index) => (
              <Skeleton key={`analysis-loading-tab-${index}`} className="h-10 w-32 rounded-full" />
            ))}
          </div>
        </div>

        <div className={rightRailLayoutClassName(showRightRailCards)}>
          <div className="grid min-w-0 gap-6">
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
                <AnalysisLoadingPanelRows rowCount={4} />
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
                    <AnalysisLoadingPanelRows rowCount={3} />
                  </div>
                </section>
              ))}
            </div>
          </div>

          {showRightRailCards ? (
            <section className={`${cardFrameClassName} ${cardSurfaceClassName} rounded-[2rem] p-4`}>
              <div className="space-y-4">
                <AnalysisLoadingRailCards />
              </div>
            </section>
          ) : null}
        </div>
      </section>
    </div>
  );
}

export function AnalysisRoute() {
  const inventory = useInventory();
  const { currency, language, showRightRailCards } = usePreferences();
  const [scope, setScope] = useState<AnalysisScope>('all');
  const [section, setSection] = useState<AnalysisSection>('workbench');
  const [timeframe, setTimeframe] = useState<AnalysisTimeframe>('Recent');
  const {
    hasOlderIntervals,
    isHydratingDetails,
    isLoadingOlderIntervals,
    loadOlderIntervals,
    resetHydratedDetails,
    serviceDetailsById,
    skuDetailsById,
    timeframeHydrationProgress,
  } = useSenaDetailHydration(timeframe);
  const hasCatalog = Boolean(inventory.catalog);
  const hasWorkspaceSummary = Boolean(inventory.workspaceSummary);
  const expectedHydratedEntityCount =
    (inventory.catalog?.services.length ?? 0) +
    (inventory.catalog?.skus.length ?? 0);
  const hydratedEntityCount =
    Object.keys(serviceDetailsById).length +
    Object.keys(skuDetailsById).length;
  const isPreparingInitialAnalysis =
    (!hasCatalog && inventory.isLoading) ||
    (hasCatalog && hasWorkspaceSummary && expectedHydratedEntityCount > 0 && hydratedEntityCount === 0);

  useLayoutEffect(() => {
    scrollWorkspaceViewportToTop();
  }, []);

  useEffect(() => {
    if (hasCatalog && hasWorkspaceSummary) {
      void loadAnalysisContentModule();
    }
  }, [hasCatalog, hasWorkspaceSummary]);

  if (isPreparingInitialAnalysis) {
    return (
      <WorkspacePage>
        <AnalysisLoadingState showRightRailCards={showRightRailCards} />
      </WorkspacePage>
    );
  }

  if (!inventory.catalog) {
    return (
      <WorkspacePage>
        <WorkspaceEmpty
          title="Analysis needs the catalog first"
          hint="Create the first SKU so Analysis has real entities to inspect."
          action={
            <Button asChild>
              <Link to="/catalog/skus/new">Create first SKU</Link>
            </Button>
          }
        />
      </WorkspacePage>
    );
  }

  if (!inventory.workspaceSummary) {
    return (
      <WorkspacePage>
        <WorkspaceEmpty
          title="Analysis needs the first SENA run"
          hint="Capture a live observation so Analysis can explain how sparse signals became the current system story."
          action={
            <WorkspaceActionRow>
              <Button asChild>
                <Link to="/operations/session">New observation</Link>
              </Button>
              <Button asChild variant="outline">
                <Link to="/">Open Overview</Link>
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
        scope={scope}
        section={section}
        serviceDetailsById={serviceDetailsById}
        setScope={setScope}
        setSection={setSection}
        setTimeframe={setTimeframe}
        showRightRailCards={showRightRailCards}
        skuDetailsById={skuDetailsById}
        timeframe={timeframe}
        timeframeHydrationProgress={timeframeHydrationProgress}
      />
    </Suspense>
  );
}
