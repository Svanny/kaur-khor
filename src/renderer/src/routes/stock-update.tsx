import { Link } from 'react-router-dom';
import { PageTitleWithBack } from '@/components/system/page-navigation';
import { WorkspaceActionRow, WorkspacePage, WorkspacePanel } from '@/components/system/workspace';
import { Button } from '@/components/ui/button';
import { useInventory } from '@/state/inventory';

export function StockUpdateRoute() {
  const {
    isSaving,
    latestRun,
    observations,
    retrySenaRun,
    triggerSenaRun,
    workspaceSummary,
  } = useInventory();

  async function handleRun() {
    if (workspaceSummary?.runId) {
      await retrySenaRun({ runId: workspaceSummary.runId });
      return;
    }
    await triggerSenaRun({ algorithmVersion: 'sena-analysis-v1' });
  }

  return (
    <WorkspacePage>
      <PageTitleWithBack>Operations</PageTitleWithBack>
      <WorkspacePanel
        title="Interval evidence"
        description="Operations now records SENA observation packages instead of stock snapshot mutations."
        action={
          <WorkspaceActionRow>
            <Button asChild>
              <Link to="/operations/session">New observation</Link>
            </Button>
            <Button disabled={isSaving} type="button" variant="outline" onClick={() => void handleRun()}>
              {latestRun ? 'Re-run analysis' : 'Run analysis'}
            </Button>
          </WorkspaceActionRow>
        }
      >
        {observations.length > 0 ? (
          <div className="grid gap-3">
            {observations.map((observation) => (
              <div
                key={observation.observationId}
                className="rounded-[1.25rem] border border-border/70 bg-background/70 p-4"
              >
                <p className="font-medium text-foreground">{observation.input.observedAt}</p>
                <p className="text-sm text-muted-foreground">
                  {observation.input.stockSnapshot.length} stock rows · {observation.input.orderSignals.length} order signals
                </p>
                {observation.input.notes ? (
                  <p className="mt-2 text-sm text-muted-foreground">{observation.input.notes}</p>
                ) : null}
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            No observations have been captured yet. Add the first observation to begin local SENA inference.
          </p>
        )}
      </WorkspacePanel>
    </WorkspacePage>
  );
}
