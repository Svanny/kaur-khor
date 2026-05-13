import type { AppLanguage } from '@shared/inventory';
import { EntityServiceIcon, EntitySkuIcon } from '@icons/entities';
import { HelpTooltip } from '@/components/system/help-tooltip';
import { CompactSparkline, type CompactSparklineTone } from '@/components/ui/compact-sparkline';
import { translateUiLiteral } from '@/lib/translations';
import type { ProjectionCell, ProjectionMatrixRow } from './view-model';

const sparklineKeys = ['today', '7d', '14d', '30d'] as const;
const projectionHeaderHelp = {
  item: 'Inventory item included in the projection comparison. The icon shows whether the row is a SKU or service.',
  trend: 'Sparkline of projected units from today through the future horizons. It shows the direction of stock change at a glance.',
  values: 'Projected stock at each horizon. Toggle 95CI on to show the credible interval as [lower, higher].',
} as const;

function cellValue(cell: ProjectionCell) {
  return Math.max(0, cell.mean ?? cell.low ?? cell.high ?? 0);
}

function ProjectionSparkline({
  language,
  row,
}: {
  language: AppLanguage;
  row: ProjectionMatrixRow;
}) {
  const points = sparklineKeys.map((key) => cellValue(row.horizonCells[key]));
  const finalValue = cellValue(row.horizonCells['30d']);
  const initialValue = cellValue(row.horizonCells.today);
  const tone: CompactSparklineTone = finalValue <= 0 || finalValue < initialValue * 0.35
    ? 'down'
    : finalValue > initialValue
      ? 'up'
      : 'flat';

  return (
    <div className="min-w-0">
      <CompactSparkline
        className="h-9 w-full min-w-[8rem] overflow-visible"
        height={32}
        points={points}
        preserveAspectRatio="none"
        tone={tone}
        width={180}
      />
      <div className="mt-1 grid grid-cols-4 text-[0.62rem] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
        {sparklineKeys.map((key) => (
          <span key={key} className="text-center">
            {translateUiLiteral(language, key === 'today' ? 'Today' : key.toUpperCase())}
          </span>
        ))}
      </div>
    </div>
  );
}

function ProjectionHeaderHelp({
  label,
  content,
  language,
}: {
  label: string;
  content: string;
  language: AppLanguage;
}) {
  return (
    <span className="inline-flex min-w-0 items-center gap-1.5">
      <span className="truncate">{label}</span>
      <HelpTooltip
        className="inline-flex items-center justify-center text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
        content={translateUiLiteral(language, content)}
        helpHref="/settings/help#inventory-projection-matrix"
        label={label}
      />
    </span>
  );
}

function projectionCellLabel(cell: ProjectionCell, language: AppLanguage, showConfidenceInterval: boolean) {
  if (cell.mean == null) {
    return { intervalLabel: null, meanLabel: '-' };
  }
  const meanLabel = translateUiLiteral(language, String(Math.round(cell.mean)));
  if (!showConfidenceInterval) {
    return { intervalLabel: null, meanLabel };
  }
  const lowLabel = translateUiLiteral(language, String(Math.round(cell.low ?? cell.mean)));
  const highLabel = translateUiLiteral(language, String(Math.round(cell.high ?? cell.mean)));
  return { intervalLabel: `[${lowLabel}, ${highLabel}]`, meanLabel };
}

export function ProjectionMatrix({
  language,
  rows,
  showConfidenceInterval,
}: {
  language: AppLanguage;
  rows: ProjectionMatrixRow[];
  showConfidenceInterval: boolean;
}) {
  if (rows.length === 0) {
    return null;
  }

  return (
    <div className="divide-y divide-border/60 bg-white">
      <div className="hidden border-b border-border/70 px-5 py-3 sm:grid sm:grid-cols-[minmax(12rem,1fr)_minmax(14rem,1.1fr)_minmax(12rem,0.9fr)] sm:items-center sm:px-6">
        <p className="text-[0.68rem] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
          <ProjectionHeaderHelp
            content={projectionHeaderHelp.item}
            label={translateUiLiteral(language, 'Item')}
            language={language}
          />
        </p>
        <p className="text-center text-[0.68rem] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
          <ProjectionHeaderHelp
            content={projectionHeaderHelp.trend}
            label={translateUiLiteral(language, 'Projected trend')}
            language={language}
          />
        </p>
        <p className="text-center text-[0.68rem] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
          <ProjectionHeaderHelp
            content={projectionHeaderHelp.values}
            label={translateUiLiteral(language, 'Projected units')}
            language={language}
          />
        </p>
      </div>
      {rows.map((row) => {
        const TypeIcon = row.type === 'sku' ? EntitySkuIcon : EntityServiceIcon;
        return (
          <div key={`${row.type}:${row.id}`} className="grid gap-4 px-5 py-3 sm:grid-cols-[minmax(12rem,1fr)_minmax(14rem,1.1fr)_minmax(12rem,0.9fr)] sm:items-center sm:px-6">
            <div className="min-w-0">
              <p className="flex min-w-0 items-center gap-2 text-sm font-semibold text-foreground">
                <TypeIcon className="size-4 shrink-0 text-muted-foreground" />
                <span className="truncate">{row.name}</span>
              </p>
            </div>
            <div className="min-w-0">
              <ProjectionSparkline language={language} row={row} />
            </div>
            <div className="grid grid-cols-4 gap-2 text-xs text-muted-foreground">
              {sparklineKeys.map((key) => (
                <div key={key} className="min-w-0 px-1 py-1 text-center">
                  <p className="mb-1 truncate text-[0.62rem] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                    {translateUiLiteral(language, key === 'today' ? 'Today' : key.toUpperCase())}
                  </p>
                  {(() => {
                    const cellLabel = projectionCellLabel(row.horizonCells[key], language, showConfidenceInterval);
                    return (
                      <div className="grid min-w-0 gap-0.5 font-semibold text-foreground">
                        <span className="truncate">{cellLabel.meanLabel}</span>
                        {cellLabel.intervalLabel ? (
                          <span className="truncate text-[0.58rem] text-muted-foreground">{cellLabel.intervalLabel}</span>
                        ) : null}
                      </div>
                    );
                  })()}
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
