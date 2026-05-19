import { Link } from 'react-router-dom';
import type { ReactNode } from 'react';
import type { AutomationExposureRow } from '@shared/automation';
import type { AppLanguage } from '@shared/inventory';
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
import { SectionLabel } from '@/routes/sku-detail/section-heading';
import { translateUiLiteral } from '@/lib/translations';

const layout = createHeaderedTableLayout({
  breakpoint: 'xl',
  columns: 'minmax(16rem,1.2fr) minmax(7rem,0.5fr) minmax(8rem,0.55fr) minmax(9rem,0.6fr) minmax(6rem,0.45fr) minmax(12rem,0.8fr)',
  gap: 4,
});

function HeaderTooltipLabel({
  children,
  helpHref,
  tooltip,
}: {
  children: ReactNode;
  helpHref: string;
  tooltip: string;
}) {
  return <SectionLabel helpHref={helpHref} tooltip={tooltip}>{children}</SectionLabel>;
}

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

function priceLabel(row: AutomationExposureRow, language: AppLanguage) {
  return row.price == null || !Number.isFinite(row.price) || row.price < 0
    ? translateUiLiteral(language, 'No price')
    : `$${row.price.toFixed(2)}`;
}

export function AutomationExposureTable({
  rows,
  language = 'en',
  onAliasCommit,
  onToggle,
}: {
  rows: AutomationExposureRow[];
  language?: AppLanguage;
  onAliasCommit: (row: AutomationExposureRow, nextAlias: string) => void;
  onToggle: (row: AutomationExposureRow, checked: boolean) => void;
}) {
  if (rows.length === 0) {
    return null;
  }
  const literal = (englishTemplate: string, variables?: Record<string, string | number | null | undefined>) =>
    translateUiLiteral(language, englishTemplate, variables);

  return (
    <HeaderedTable>
      <div className={layout.containerClassName} style={layout.style}>
        <HeaderedTableHeader className={layout.headerClassName}>
          <HeaderedTableHeaderCell>
            <HeaderTooltipLabel helpHref="/settings/help#automation-exposure-entity" tooltip={literal('The internal SKU or service record that can be shown to customers.')}>{literal('Entity')}</HeaderTooltipLabel>
          </HeaderedTableHeaderCell>
          <HeaderedTableHeaderCell>
            <HeaderTooltipLabel helpHref="/settings/help#automation-exposure-type" tooltip={literal('Whether the exposed product record is a stock-carrying SKU or a linked service.')}>{literal('Type')}</HeaderTooltipLabel>
          </HeaderedTableHeaderCell>
          <HeaderedTableHeaderCell>
            <HeaderTooltipLabel helpHref="/settings/help#automation-exposure-price" tooltip={literal('Customer-facing price currently available for automation replies.')}>{literal('Price')}</HeaderTooltipLabel>
          </HeaderedTableHeaderCell>
          <HeaderedTableHeaderCell>
            <HeaderTooltipLabel helpHref="/settings/help#automation-exposure-availability" tooltip={literal('Whether the item can be offered from current products and availability data.')}>{literal('Availability')}</HeaderTooltipLabel>
          </HeaderedTableHeaderCell>
          <HeaderedTableHeaderCell align="center">
            <HeaderTooltipLabel helpHref="/settings/help#automation-exposure-exposed" tooltip={literal('Controls whether this product record is visible to customer-facing automation.')}>{literal('Exposed')}</HeaderTooltipLabel>
          </HeaderedTableHeaderCell>
          <HeaderedTableHeaderCell>
            <HeaderTooltipLabel helpHref="/settings/help#automation-exposure-alias" tooltip={literal('Optional customer-facing name used by the automation instead of the internal product name.')}>{literal('Alias')}</HeaderTooltipLabel>
          </HeaderedTableHeaderCell>
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
                <HeaderedTableMobileLabel className={layout.mobileLabelClassName}>{literal('Type')}</HeaderedTableMobileLabel>
                <span className="text-sm font-medium text-foreground">{row.entityType === 'sku' ? literal('SKU') : literal('Service')}</span>
              </div>
              <div>
                <HeaderedTableMobileLabel className={layout.mobileLabelClassName}>{literal('Price')}</HeaderedTableMobileLabel>
                <span className="text-sm font-medium text-foreground">{priceLabel(row, language)}</span>
              </div>
              <div>
                <HeaderedTableMobileLabel className={layout.mobileLabelClassName}>{literal('Availability')}</HeaderedTableMobileLabel>
                <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[0.72rem] font-medium ${statusPillClassName(availabilityTone(row.availabilityStatus))}`}>
                  {row.availabilityLabel}
                </span>
              </div>
              <div className="flex items-start lg:justify-center">
                <Switch
                  aria-label={literal(row.exposed ? 'Hide {name} from automation' : 'Expose {name} to automation', {
                    name: row.label,
                  })}
                  checked={row.exposed}
                  disabled={row.archived || row.availabilityStatus === 'hidden'}
                  onCheckedChange={(checked) => onToggle(row, checked)}
                />
              </div>
              <div>
                <HeaderedTableMobileLabel className={layout.mobileLabelClassName}>{literal('Alias')}</HeaderedTableMobileLabel>
                <Input
                  aria-label={literal('Customer-facing alias for {name}', {
                    name: row.label,
                  })}
                  defaultValue={row.alias ?? ''}
                  disabled={row.archived}
                  placeholder={literal('Customer-facing alias')}
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
