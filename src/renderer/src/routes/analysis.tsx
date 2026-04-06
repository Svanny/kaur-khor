import { useMemo, useState } from 'react';
import { Layers3, Package, Store } from 'lucide-react';
import { Link } from 'react-router-dom';
import { WorkspaceActionRow, WorkspaceEmpty, WorkspacePage, WorkspaceTitleCard } from '@/components/system/workspace';
import { Button } from '@/components/ui/button';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { useInventory } from '@/state/inventory';
import { usePreferences } from '@/state/preferences';
import { AnalysisWorkbench } from './performance/analysis-workbench';
import {
  type AnalysisScope,
  type AnalysisSection,
  deriveAnalysisViewModel,
} from './performance/analysis-view-model';
import { useSenaDetailHydration } from './performance/use-sena-detail-hydration';

export function AnalysisRoute() {
  const inventory = useInventory();
  const { currency, language, showRightRailCards } = usePreferences();
  const [scope, setScope] = useState<AnalysisScope>('all');
  const [section, setSection] = useState<AnalysisSection>('workbench');
  const { hasOlderIntervals, isHydratingDetails, isLoadingOlderIntervals, loadOlderIntervals, serviceDetailsById, skuDetailsById } = useSenaDetailHydration();

  const model = useMemo(() => {
    if (!inventory.catalog || !inventory.workspaceSummary) {
      return null;
    }

    return deriveAnalysisViewModel({
      catalog: inventory.catalog,
      currency,
      diagnostics: inventory.diagnostics,
      language,
      observations: inventory.observations,
      scope,
      serviceDetailsById,
      skuDetailsById,
      workspaceSummary: inventory.workspaceSummary,
    });
  }, [
    currency,
    inventory.catalog,
    inventory.diagnostics,
    inventory.observations,
    inventory.workspaceSummary,
    language,
    scope,
    serviceDetailsById,
    skuDetailsById,
  ]);

  if (!inventory.catalog) {
    return (
      <WorkspacePage>
        <WorkspaceEmpty
          title="Analysis needs the catalog first"
          description="Build the SENA catalog so Banji can reconstruct the operational ledger across demand, pipeline, and lead time."
          action={
            <Button asChild>
              <Link to="/catalog/skus/new">Create first SKU</Link>
            </Button>
          }
        />
      </WorkspacePage>
    );
  }

  if (!inventory.workspaceSummary || !model) {
    return (
      <WorkspacePage>
        <WorkspaceEmpty
          title="Analysis needs the first SENA run"
          description="Capture a live observation or trigger a fresh run so Banji can expose how sparse observations became the current system story."
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
    <WorkspacePage className="gap-5">
      <WorkspaceTitleCard
        eyebrow="Analysis"
        title="Deep Review"
        description="Inspect how SENA reconstructed demand, order flow, receipts, lead-time drift, and price effects from sparse observations."
        actions={section === 'fragility' ? undefined : (
          <div className="flex flex-wrap items-center justify-end gap-2">
            <ToggleGroup
              aria-label="Select analysis scope"
              className="rounded-full"
              spacing={1}
              type="single"
              value={scope}
              onValueChange={(nextValue) => {
                if (nextValue) {
                  setScope(nextValue as AnalysisScope);
                }
              }}
            >
              <ToggleGroupItem value="all">
                <Layers3 data-icon="inline-start" />
                All
              </ToggleGroupItem>
              <ToggleGroupItem value="services">
                <Store data-icon="inline-start" />
                Services
              </ToggleGroupItem>
              <ToggleGroupItem value="skus">
                <Package data-icon="inline-start" />
                SKUs
              </ToggleGroupItem>
            </ToggleGroup>
          </div>
        )}
      >
        <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
          <span>{model.lastUpdatedLabel}</span>
          {isHydratingDetails ? <span>Hydrating entity posteriors…</span> : null}
          <span>{model.internalNavSummary}</span>
        </div>
      </WorkspaceTitleCard>

      <AnalysisWorkbench
        hasOlderIntervals={hasOlderIntervals}
        isLoadingOlderIntervals={isLoadingOlderIntervals}
        loadOlderIntervals={loadOlderIntervals}
        model={model}
        section={section}
        setSection={setSection}
        showRightRailCards={showRightRailCards}
      />
    </WorkspacePage>
  );
}
