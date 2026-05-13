import type { AppLanguage } from '@shared/inventory';
import { PerformanceRightRailBlock } from '@/routes/performance/chrome';
import { translateUiLiteral } from '@/lib/translations';
import { formatSenaDays, formatSenaPercent, formatSenaUnits } from '@/routes/sku-detail/format';
import type { InventoryGridRow, InventoryViewModel } from './view-model';

function RailList({ rows }: { rows: Array<{ label: string; value: string | number }> }) {
  return (
    <div className="space-y-3">
      {rows.map((row) => (
        <div key={row.label} className="flex items-start justify-between gap-3 text-sm">
          <span className="text-muted-foreground">{row.label}</span>
          <span className="font-medium text-foreground">{row.value}</span>
        </div>
      ))}
    </div>
  );
}

export function InventoryInspector({
  language,
  model,
  selectedRow,
}: {
  language: AppLanguage;
  model: InventoryViewModel;
  selectedRow: InventoryGridRow | null;
}) {
  if (!selectedRow) {
    return (
      <>
        <PerformanceRightRailBlock
          helpHref="/settings/help#inventory-cover-distribution"
          title={translateUiLiteral(language, 'Cover distribution')}
          tooltip={translateUiLiteral(language, 'Distribution of SKU days of cover.')}
        >
          <RailList rows={model.coverDistribution.map((row) => ({ label: row.label, value: row.value }))} />
        </PerformanceRightRailBlock>
        <PerformanceRightRailBlock
          helpHref="/settings/help#inventory-inbound-schedule"
          title={translateUiLiteral(language, 'Inbound schedule')}
          tooltip={translateUiLiteral(language, 'Inbound inventory grouped by receipt window.')}
        >
          <RailList rows={model.inboundSchedule.map((row) => ({ label: row.label, value: row.value }))} />
        </PerformanceRightRailBlock>
        <PerformanceRightRailBlock
          helpHref="/settings/help#inventory-freshness"
          title={translateUiLiteral(language, 'Freshness')}
          tooltip={translateUiLiteral(language, 'Stock-count freshness across SKUs.')}
        >
          <RailList rows={model.freshnessSummary.map((row) => ({ label: row.label, value: row.value }))} />
        </PerformanceRightRailBlock>
        <PerformanceRightRailBlock
          helpHref="/settings/help#inventory-column-view"
          title={translateUiLiteral(language, 'Column view')}
          tooltip={translateUiLiteral(language, 'Current inventory column preset.')}
        >
          <p className="text-sm leading-6 text-muted-foreground">
            {translateUiLiteral(language, 'Current preset, reset, and customize controls live above the grid.')}
          </p>
        </PerformanceRightRailBlock>
      </>
    );
  }

  if (selectedRow.type === 'service') {
    return (
      <PerformanceRightRailBlock
        helpHref="/settings/help#inventory-selected-service"
        title={translateUiLiteral(language, 'Selected service')}
        tooltip={translateUiLiteral(language, 'Sellability and bottleneck data for the selected service.')}
      >
        <RailList
          rows={[
            { label: translateUiLiteral(language, 'Sellable units'), value: formatSenaUnits(selectedRow.sellableUnitsMean, language) },
            { label: translateUiLiteral(language, 'Bottleneck probability'), value: formatSenaPercent(selectedRow.bottleneckProbability, language) },
            { label: translateUiLiteral(language, 'Bottleneck SKU'), value: selectedRow.bottleneckSkuName ?? '-' },
            { label: translateUiLiteral(language, 'Contributor stack'), value: selectedRow.contributorHealthLabel },
            { label: translateUiLiteral(language, 'Recovery pipeline'), value: selectedRow.recoveryPipelineLabel ?? '-' },
          ]}
        />
      </PerformanceRightRailBlock>
    );
  }

  return (
    <PerformanceRightRailBlock
      helpHref="/settings/help#inventory-selected-sku"
      title={translateUiLiteral(language, 'Selected SKU')}
      tooltip={translateUiLiteral(language, 'Inventory and flow data for the selected SKU.')}
    >
      <RailList
        rows={[
          { label: translateUiLiteral(language, 'Posterior stock'), value: formatSenaUnits(selectedRow.onHandMean, language) },
          { label: translateUiLiteral(language, 'Credible band'), value: `${formatSenaUnits(selectedRow.onHandLow, language)}-${formatSenaUnits(selectedRow.onHandHigh, language)}` },
          { label: translateUiLiteral(language, 'Stockout risk'), value: formatSenaPercent(selectedRow.stockoutRisk, language) },
          { label: translateUiLiteral(language, 'Days cover'), value: formatSenaDays(selectedRow.daysOfCover, language) },
          { label: translateUiLiteral(language, 'Latest stock count'), value: selectedRow.freshnessLabel },
          { label: translateUiLiteral(language, 'Flow totals'), value: `${formatSenaUnits(selectedRow.flowIn, language)} / ${formatSenaUnits(selectedRow.flowOut, language)}` },
          { label: translateUiLiteral(language, 'Pipeline state'), value: formatSenaUnits(selectedRow.inTransitMean, language) },
          { label: translateUiLiteral(language, 'Lead time'), value: formatSenaDays(selectedRow.leadTimeMeanDays, language) },
          { label: translateUiLiteral(language, 'Linked services'), value: selectedRow.linkedServiceSummary },
        ]}
      />
    </PerformanceRightRailBlock>
  );
}
