import { MeasuredPagedDetailPanel } from '@/routes/detail-panels';
import { ItemIdentityBlock } from '@/components/system/item-identity';
import { translateUiLiteral } from '@/lib/translations';
import { usePreferences } from '@/state/preferences';
import type { SenaSkuDetailViewModel } from './view-model';

export function SkuDetailExposure({ rows }: { rows: SenaSkuDetailViewModel['dependencyImpact'] }) {
  const { language, t } = usePreferences();

  function severityLabel(value: SenaSkuDetailViewModel['dependencyImpact'][number]['severity']) {
    switch (value) {
      case 'limiting_now':
        return translateUiLiteral(language, 'main blocker');
      case 'at_risk':
        return translateUiLiteral(language, 'at risk');
      default:
        return translateUiLiteral(language, 'linked');
    }
  }

  return (
    <MeasuredPagedDetailPanel
      items={rows}
      listTestId="dependency-impact-list"
      title={t('catalogSenaSkuDependencyImpact')}
      tooltip={t('catalogSenaSkuDependencyImpactTooltip')}
      renderItem={(row) => (
        <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-4 py-4">
          <ItemIdentityBlock
            align="center"
            description={severityLabel(row.severity)}
            imagePath={row.imagePath}
            name={row.name}
            size="compact"
            type="service"
          />
          <div className="text-right text-sm text-muted-foreground">
            <p>{translateUiLiteral(language, 'Usage {value}', { value: row.usageProbability })}</p>
            <p>{translateUiLiteral(language, 'Blocker {value}', { value: row.bottleneckProbability })}</p>
          </div>
        </div>
      )}
    />
  );
}
