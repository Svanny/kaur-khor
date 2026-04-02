import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import type { SenaServiceDetail } from '@shared/sena';
import { PageTitleWithBack } from '@/components/system/page-navigation';
import { MetricStrip, MetricStripItem, WorkspaceActionRow, WorkspaceEmpty, WorkspacePage, WorkspacePanel } from '@/components/system/workspace';
import { Button } from '@/components/ui/button';
import { linkedSkuIdsForService } from '@/lib/sena-catalog';
import { useInventory } from '@/state/inventory';

export function ServiceDetailRoute() {
  const { serviceId = '' } = useParams();
  const { catalog, loadSenaServiceDetail } = useInventory();
  const [detail, setDetail] = useState<SenaServiceDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  const service = catalog?.services.find((entry) => entry.serviceId === serviceId) ?? null;
  const linkedSkuIds = useMemo(
    () => (catalog ? linkedSkuIdsForService(catalog, serviceId) : []),
    [catalog, serviceId],
  );

  useEffect(() => {
    let cancelled = false;

    if (!serviceId) {
      return;
    }

    loadSenaServiceDetail(serviceId)
      .then((result) => {
        if (!cancelled) {
          setDetail(result);
          setError(null);
        }
      })
      .catch((nextError) => {
        if (!cancelled) {
          setError(nextError instanceof Error ? nextError.message : 'Failed to load service detail.');
        }
      });

    return () => {
      cancelled = true;
    };
  }, [loadSenaServiceDetail, serviceId]);

  if (!service) {
    return (
      <WorkspacePage>
        <WorkspaceEmpty
          title="Service not found"
          description="This service is not present in the current SENA catalog."
          action={
            <Button asChild variant="outline">
              <Link to="/catalog">Return to catalog</Link>
            </Button>
          }
        />
      </WorkspacePage>
    );
  }

  if (error) {
    return (
      <WorkspacePage>
        <WorkspaceEmpty
          title="SENA service detail unavailable"
          description={error}
        />
      </WorkspacePage>
    );
  }

  return (
    <WorkspacePage>
      <PageTitleWithBack>{service.name}</PageTitleWithBack>
      <WorkspacePanel
        description="Service detail is derived from SENA service posteriors and contributor masks."
        title="Service overview"
        action={
          <WorkspaceActionRow>
            <Button asChild variant="outline">
              <Link to={`/catalog/services/${service.serviceId}/edit`}>Edit service</Link>
            </Button>
          </WorkspaceActionRow>
        }
      >
        <MetricStrip>
          <MetricStripItem label="Activity mean" value={detail?.activityMean?.toFixed(2) ?? '—'} />
          <MetricStripItem label="Bottleneck probability" value={detail?.bottleneckProbability?.toFixed(2) ?? '—'} />
          <MetricStripItem label="Linked SKUs" value={linkedSkuIds.length} />
          <MetricStripItem label="Price" value={service.price} />
        </MetricStrip>
      </WorkspacePanel>

      <WorkspacePanel title="Contributors" description="SKU contributors from the SENA sharing mask and posterior bottleneck surface.">
        {detail?.contributors.length ? (
          <div className="grid gap-3">
            {detail.contributors.map((contributor) => (
              <div
                key={contributor.skuId}
                className="flex items-center justify-between rounded-[1.25rem] border border-border/70 bg-background/70 p-4"
              >
                <div>
                  <p className="font-medium text-foreground">{contributor.skuId}</p>
                  <p className="text-sm text-muted-foreground">
                    usage {contributor.usageProbability.toFixed(2)} · bottleneck {contributor.bottleneckProbability.toFixed(2)}
                  </p>
                </div>
                <Button asChild size="sm" variant="outline">
                  <Link to={`/catalog/skus/${contributor.skuId}`}>Open SKU</Link>
                </Button>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Contributor detail will appear after a successful SENA run.</p>
        )}
      </WorkspacePanel>
    </WorkspacePage>
  );
}
