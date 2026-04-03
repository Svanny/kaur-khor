import { Link } from 'react-router-dom';
import {
  MetricCard,
  MetricGrid,
  WorkspaceActionRow,
  WorkspacePage,
  WorkspacePanel,
  WorkspaceTitleCard,
} from '@/components/system/workspace';
import { Button } from '@/components/ui/button';
import { formatNumber } from '@/lib/format';
import { useInventory } from '@/state/inventory';

export function DashboardRoute() {
  const { catalog, diagnostics, latestRun, observations, workspaceSummary } = useInventory();

  const skuCount = catalog?.skus.length ?? 0;
  const serviceCount = catalog?.services.length ?? 0;
  const observationCount = observations.length;
  const highRiskCount = workspaceSummary?.highRiskSkuIds.length ?? 0;

  return (
    <WorkspacePage>
      <WorkspaceTitleCard
        eyebrow="SENA workspace"
        title="Local decision surface"
        description="Banji now boots directly into the local SENA workspace. Catalog structure, interval evidence, and analysis runs all come from the same local core."
        actions={
          <WorkspaceActionRow>
            <Button asChild>
              <Link to="/operations/session">New observation</Link>
            </Button>
            <Button asChild variant="outline">
              <Link to="/catalog">Open catalog</Link>
            </Button>
          </WorkspaceActionRow>
        }
      />

      <MetricGrid>
        <MetricCard label="SKUs" value={formatNumber(skuCount, 'en')} detail="Tracked in the local catalog." />
        <MetricCard label="Services" value={formatNumber(serviceCount, 'en')} detail="Demand-facing entities linked through SENA masks." />
        <MetricCard label="Observations" value={formatNumber(observationCount, 'en')} detail="Interval evidence packages captured locally." />
        <MetricCard
          label="High-risk SKUs"
          value={formatNumber(highRiskCount, 'en')}
          detail={workspaceSummary ? `${workspaceSummary.pendingReorderCount} pending reorder candidates.` : 'No completed analysis run yet.'}
        />
      </MetricGrid>

      <WorkspacePanel
        title="Current run"
        description="The latest completed SENA analysis run, if one exists."
      >
        {latestRun ? (
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <p className="text-sm font-medium text-foreground">Algorithm</p>
              <p className="text-sm text-muted-foreground">{latestRun.algorithmVersion}</p>
            </div>
            <div>
              <p className="text-sm font-medium text-foreground">Status</p>
              <p className="text-sm text-muted-foreground">{latestRun.status}</p>
            </div>
            <div>
              <p className="text-sm font-medium text-foreground">Observed intervals</p>
              <p className="text-sm text-muted-foreground">{workspaceSummary?.intervalCount ?? 0}</p>
            </div>
            <div>
              <p className="text-sm font-medium text-foreground">Top regime</p>
              <p className="text-sm text-muted-foreground">{workspaceSummary?.topRegime ?? 'Not available yet'}</p>
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            No analysis run has completed yet. Add observations and trigger a SENA run from Operations.
          </p>
        )}
      </WorkspacePanel>

      <WorkspacePanel
        title="Diagnostics"
        description="Posterior diagnostics from the latest run."
      >
        {diagnostics ? (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <div>
              <p className="text-sm font-medium text-foreground">ESS mean</p>
              <p className="text-sm text-muted-foreground">{diagnostics.effectiveSampleSizeMean.toFixed(2)}</p>
            </div>
            <div>
              <p className="text-sm font-medium text-foreground">Resampling count</p>
              <p className="text-sm text-muted-foreground">{diagnostics.resamplingCount}</p>
            </div>
            <div>
              <p className="text-sm font-medium text-foreground">Change-point probability</p>
              <p className="text-sm text-muted-foreground">{diagnostics.changePointProbability.toFixed(2)}</p>
            </div>
            <div>
              <p className="text-sm font-medium text-foreground">Coverage estimate</p>
              <p className="text-sm text-muted-foreground">{diagnostics.coverageEstimate.toFixed(2)}</p>
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            Diagnostics appear after the first successful SENA run.
          </p>
        )}
      </WorkspacePanel>
    </WorkspacePage>
  );
}
