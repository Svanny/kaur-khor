import { Link, useLocation } from 'react-router-dom';
import { ItemIdentityBlock } from '@/components/system/item-identity';
import { MeasuredPagedDetailPanel } from '@/routes/detail-panels';
import { buildBanjiNavigationState } from '@/state/navigation-history';
import { usePreferences } from '@/state/preferences';
import type { ServiceDetailViewModel } from './view-model';

export function ServiceDependencyImpact({
  rows,
}: {
  rows: ServiceDetailViewModel['dependencyImpact'];
}) {
  const location = useLocation();
  const { t } = usePreferences();

  return (
    <MeasuredPagedDetailPanel
      helpHref="/settings/help#catalog-service-dependency-impact"
      items={rows}
      title={t('catalogServiceDependencyImpactTitle')}
      tooltip={t('catalogServiceDependencyImpactTooltip')}
      renderItem={(row) => (
        <div className="grid gap-3 py-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <ItemIdentityBlock
              align="center"
              description={row.role}
              imagePath={row.imagePath}
              name={
                <Link
                  className="font-medium text-foreground underline-offset-4 hover:underline"
                  state={buildBanjiNavigationState(location, '/catalog')}
                  to={row.openSkuHref}
                >
                  {row.name}
                </Link>
              }
              size="compact"
              type="sku"
            />
            <div className="text-right text-sm text-muted-foreground">
              <p>{row.daysOfCover}</p>
              <p>{row.limitingProbability}</p>
            </div>
          </div>
          <div className="grid gap-1 text-sm text-muted-foreground">
            <p>{row.status}</p>
            <p>{row.blockedOpenOrders}</p>
            <p>{row.inboundRecoveryNote}</p>
            <p>{row.pendingSupplyRelief}</p>
            {row.restockGuidance ? <p>{row.restockGuidance}</p> : null}
          </div>
        </div>
      )}
    />
  );
}
