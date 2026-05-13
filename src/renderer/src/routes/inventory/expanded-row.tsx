import type { AppLanguage } from '@shared/inventory';
import { HeaderedTableCellStack } from '@/components/system/headered-table';
import { translateUiLiteral } from '@/lib/translations';
import { formatSenaDays, formatSenaPercent, formatSenaUnits } from '@/routes/sku-detail/format';
import type { InventoryGridRow } from './view-model';

function DetailBlock({
  details,
  title,
}: {
  details: string[];
  title: string;
}) {
  return (
    <div className="min-w-0 rounded-lg border border-border/60 bg-muted/20 px-4 py-3">
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">{title}</p>
      <div className="mt-2 grid gap-1 text-sm leading-6 text-foreground">
        {details.map((detail) => (
          <p key={detail}>{detail}</p>
        ))}
      </div>
    </div>
  );
}

export function InventoryExpandedRow({
  language,
  row,
}: {
  language: AppLanguage;
  row: InventoryGridRow;
}) {
  if (row.type === 'service') {
    return (
      <div className="col-span-full grid gap-3 bg-muted/10 px-5 py-4 sm:px-6 lg:grid-cols-2">
        <DetailBlock
          title={translateUiLiteral(language, 'Sellable capacity')}
          details={[
            `${formatSenaUnits(row.sellableUnitsMean, language)} ${translateUiLiteral(language, 'likely')}`,
            `${formatSenaUnits(row.sellableUnitsLow, language)}-${formatSenaUnits(row.sellableUnitsHigh, language)} ${translateUiLiteral(language, 'band')}`,
            `${formatSenaPercent(row.bottleneckProbability, language)} ${translateUiLiteral(language, 'bottleneck probability')}`,
          ]}
        />
        <DetailBlock
          title={translateUiLiteral(language, 'Contributor table')}
          details={[
            row.bottleneckSkuName ?? translateUiLiteral(language, 'No bottleneck SKU'),
            row.contributorHealthLabel,
            row.recoveryPipelineLabel ?? translateUiLiteral(language, 'No inbound recovery'),
          ]}
        />
      </div>
    );
  }

  return (
    <div className="col-span-full grid gap-3 bg-muted/10 px-5 py-4 sm:px-6 lg:grid-cols-2 2xl:grid-cols-4">
      <DetailBlock
        title={translateUiLiteral(language, 'Inventory posterior')}
        details={[
          `${formatSenaUnits(row.onHandMean, language)} ${translateUiLiteral(language, 'mean')}`,
          `${formatSenaUnits(row.onHandLow, language)}-${formatSenaUnits(row.onHandHigh, language)} ${translateUiLiteral(language, 'credible band')}`,
          `${formatSenaPercent(row.stockoutRisk, language)} ${translateUiLiteral(language, 'stockout risk')}`,
        ]}
      />
      <DetailBlock
        title={translateUiLiteral(language, 'Flow decomposition')}
        details={[
          `${translateUiLiteral(language, 'Receipts')} ${formatSenaUnits(row.receipts, language)}`,
          `${translateUiLiteral(language, 'Units out')} ${formatSenaUnits(row.flowOut, language)}`,
          `${translateUiLiteral(language, 'Adjustments')} ${formatSenaUnits(row.adjustments, language)}`,
        ]}
      />
      <DetailBlock
        title={translateUiLiteral(language, 'Pipeline')}
        details={[
          `${formatSenaUnits(row.inTransitMean, language)} ${translateUiLiteral(language, 'in transit')}`,
          `${formatSenaPercent(row.orderProbability, language)} ${translateUiLiteral(language, 'order probability')}`,
          row.nextReceiptLabel ?? translateUiLiteral(language, 'No receipt window'),
        ]}
      />
      <HeaderedTableCellStack
        primary={translateUiLiteral(language, 'Linked service capacity')}
        secondary={(
          <span className="grid gap-1">
            <span>{row.linkedServiceSummary}</span>
            <span>{translateUiLiteral(language, 'Cover')} {formatSenaDays(row.daysOfCover, language)}</span>
          </span>
        )}
        className="min-w-0 rounded-lg border border-border/60 bg-muted/20 px-4 py-3"
      />
    </div>
  );
}
