import { Link } from 'react-router-dom';
import { MeasuredPagedDetailPanel } from '@/routes/detail-panels';
import type { ServiceDetailViewModel } from './view-model';

export function ServiceDependencyImpact({
  rows,
}: {
  rows: ServiceDetailViewModel['dependencyImpact'];
}) {
  return (
    <MeasuredPagedDetailPanel
      items={rows}
      title="Dependency impact"
      tooltip="Linked SKUs ranked by service role, cover, and recovery impact."
      renderItem={(row) => (
        <div className="grid gap-3 py-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <Link className="font-medium text-foreground underline-offset-4 hover:underline" to={row.openSkuHref}>
                {row.name}
              </Link>
              <p className="mt-1 text-sm text-muted-foreground">{row.role}</p>
            </div>
            <div className="text-right text-sm text-muted-foreground">
              <p>{row.daysOfCover}</p>
              <p>{row.limitingProbability}</p>
            </div>
          </div>
          <div className="grid gap-1 text-sm text-muted-foreground">
            <p>{row.status}</p>
            <p>{row.inboundRecoveryNote}</p>
            {row.restockGuidance ? <p>{row.restockGuidance}</p> : null}
          </div>
        </div>
      )}
    />
  );
}
