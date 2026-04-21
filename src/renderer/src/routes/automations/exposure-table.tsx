import { Link } from 'react-router-dom';
import type { AutomationExposureRow } from '@shared/automation';
import { ItemIdentityBlock } from '@/components/system/item-identity';
import {
  createHeaderedTableLayout,
  HeaderedTable,
  HeaderedTableBody,
  HeaderedTableHeader,
  HeaderedTableHeaderCell,
  HeaderedTableMobileLabel,
  HeaderedTableRow,
} from '@/components/system/headered-table';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { statusPillClassName } from '@/lib/state-tones';
import { rowHoverClassName } from '@/lib/interactive-surface';

const layout = createHeaderedTableLayout({
  breakpoint: 'xl',
  columns: 'minmax(16rem,1.2fr) minmax(7rem,0.5fr) minmax(8rem,0.55fr) minmax(9rem,0.6fr) minmax(6rem,0.45fr) minmax(12rem,0.8fr)',
  gap: 4,
});

function availabilityTone(status: AutomationExposureRow['availabilityStatus']) {
  switch (status) {
    case 'available':
      return 'success';
    case 'limited':
      return 'warning';
    case 'unavailable':
      return 'danger';
    case 'hidden':
      return 'neutral';
    default:
      return 'info';
  }
}

function entityHref(row: AutomationExposureRow) {
  return row.entityType === 'sku'
    ? `/catalog/skus/${encodeURIComponent(row.entityId)}`
    : `/catalog/services/${encodeURIComponent(row.entityId)}`;
}

export function AutomationExposureTable({
  rows,
  onAliasCommit,
  onToggle,
}: {
  rows: AutomationExposureRow[];
  onAliasCommit: (row: AutomationExposureRow, nextAlias: string) => void;
  onToggle: (row: AutomationExposureRow, checked: boolean) => void;
}) {
  if (rows.length === 0) {
    return null;
  }

  return (
    <HeaderedTable>
      <div className={layout.containerClassName} style={layout.style}>
        <HeaderedTableHeader className={layout.headerClassName}>
          <HeaderedTableHeaderCell>Entity</HeaderedTableHeaderCell>
          <HeaderedTableHeaderCell>Type</HeaderedTableHeaderCell>
          <HeaderedTableHeaderCell>Price</HeaderedTableHeaderCell>
          <HeaderedTableHeaderCell>Availability</HeaderedTableHeaderCell>
          <HeaderedTableHeaderCell align="center">Exposed</HeaderedTableHeaderCell>
          <HeaderedTableHeaderCell>Alias</HeaderedTableHeaderCell>
        </HeaderedTableHeader>
        <HeaderedTableBody className={layout.bodyClassName}>
          {rows.map((row) => (
            <HeaderedTableRow
              key={`${row.entityType}:${row.entityId}`}
              className={`${layout.rowClassName} ${rowHoverClassName} ${row.archived ? 'opacity-60' : ''}`}
            >
              <div className="min-w-0">
                <Link className="group" to={entityHref(row)}>
                  <ItemIdentityBlock
                    align="center"
                    imagePath={row.imagePath}
                    metadata={row.supplierName ? <span className="text-xs text-muted-foreground">{row.supplierName}</span> : null}
                    name={<span className="font-semibold text-foreground transition-colors group-hover:text-primary">{row.label}</span>}
                    type={row.entityType}
                  />
                </Link>
              </div>
              <div>
                <HeaderedTableMobileLabel className={layout.mobileLabelClassName}>Type</HeaderedTableMobileLabel>
                <span className="text-sm font-medium text-foreground">{row.entityType === 'sku' ? 'SKU' : 'Service'}</span>
              </div>
              <div>
                <HeaderedTableMobileLabel className={layout.mobileLabelClassName}>Price</HeaderedTableMobileLabel>
                <span className="text-sm font-medium text-foreground">{row.price == null ? 'No price' : `$${row.price.toFixed(2)}`}</span>
              </div>
              <div>
                <HeaderedTableMobileLabel className={layout.mobileLabelClassName}>Availability</HeaderedTableMobileLabel>
                <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[0.72rem] font-medium ${statusPillClassName(availabilityTone(row.availabilityStatus))}`}>
                  {row.availabilityLabel}
                </span>
              </div>
              <div className="flex items-start lg:justify-center">
                <Switch
                  checked={row.exposed}
                  disabled={row.archived || row.availabilityStatus === 'hidden'}
                  onCheckedChange={(checked) => onToggle(row, checked)}
                />
              </div>
              <div>
                <HeaderedTableMobileLabel className={layout.mobileLabelClassName}>Alias</HeaderedTableMobileLabel>
                <Input
                  defaultValue={row.alias ?? ''}
                  disabled={row.archived}
                  placeholder="Customer-facing alias"
                  onBlur={(event) => onAliasCommit(row, event.target.value)}
                />
              </div>
            </HeaderedTableRow>
          ))}
        </HeaderedTableBody>
      </div>
    </HeaderedTable>
  );
}
