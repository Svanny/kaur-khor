import { MeasuredPagedDetailPanel } from '@/routes/detail-panels';
import { usePreferences } from '@/state/preferences';
import type { SenaSkuDetailViewModel } from './view-model';

export function SkuDetailExposure({ rows }: { rows: SenaSkuDetailViewModel['dependencyImpact'] }) {
  const { t } = usePreferences();

  return (
    <MeasuredPagedDetailPanel
      items={rows}
      listTestId="dependency-impact-list"
      title={t('catalogSenaSkuDependencyImpact')}
      tooltip={t('catalogSenaSkuDependencyImpactTooltip')}
      renderItem={(row) => (
        <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-4 py-4">
          <div>
            <p className="font-medium text-foreground">{row.name}</p>
            <p className="mt-1 text-sm text-muted-foreground">{row.severity}</p>
          </div>
          <div className="text-right text-sm text-muted-foreground">
            <p>Usage {row.usageProbability}</p>
            <p>Bottleneck {row.bottleneckProbability}</p>
          </div>
        </div>
      )}
    />
  );
}
