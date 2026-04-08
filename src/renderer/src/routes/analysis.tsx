import { lazy, Suspense, useEffect, useLayoutEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { WorkspaceActionRow, WorkspaceEmpty, WorkspacePage } from '@/components/system/workspace';
import { scrollWorkspaceViewportToTop } from '@/components/system/workspace-scroll';
import { Button } from '@/components/ui/button';
import { cardFrameClassName, cardSurfaceClassName } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useInventory } from '@/state/inventory';
import { usePreferences } from '@/state/preferences';
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
        descriptor="Inspect how SENA reconstructed demand, order flow, receipts, lead-time drift, and price effects from sparse observations."
        eyebrow="Analysis"
        title="Deep Review"
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
                <Link to="/record-update">Start update</Link>
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
