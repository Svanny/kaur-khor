import { Link } from 'react-router-dom';
import type { AutomationIntakeTableRow } from './view-model';
import {
  createHeaderedTableLayout,
  HeaderedTable,
  HeaderedTableBody,
  HeaderedTableHeader,
  HeaderedTableHeaderCell,
  HeaderedTableMobileLabel,
  HeaderedTableRow,
} from '@/components/system/headered-table';
import { Button } from '@/components/ui/button';
import { statusPillClassName } from '@/lib/state-tones';
import { rowHoverClassName } from '@/lib/interactive-surface';
import { ActionClipboardAddIcon, ActionEditIcon, ActionOpenExternalIcon } from '@icons/actions';
import { EntityPreviewIcon } from '@icons/entities';

const layout = createHeaderedTableLayout({
  breakpoint: 'xl',
  columns: 'minmax(14rem,0.95fr) minmax(14rem,1.15fr) minmax(8rem,0.5fr) minmax(8rem,0.52fr) minmax(12rem,0.9fr) minmax(8rem,0.5fr)',
  gap: 4,
});

export function AutomationIntakeTable({ rows }: { rows: AutomationIntakeTableRow[] }) {
  if (rows.length === 0) {
    return null;
  }

  return (
    <HeaderedTable>
      <div className={layout.containerClassName} style={layout.style}>
        <HeaderedTableHeader className={layout.headerClassName}>
          <HeaderedTableHeaderCell>Customer</HeaderedTableHeaderCell>
          <HeaderedTableHeaderCell>Request</HeaderedTableHeaderCell>
          <HeaderedTableHeaderCell>Quoted total</HeaderedTableHeaderCell>
          <HeaderedTableHeaderCell>State</HeaderedTableHeaderCell>
          <HeaderedTableHeaderCell>Created / updated</HeaderedTableHeaderCell>
          <HeaderedTableHeaderCell align="center">Action</HeaderedTableHeaderCell>
        </HeaderedTableHeader>
        <HeaderedTableBody className={layout.bodyClassName}>
          {rows.map((row) => (
            <HeaderedTableRow key={row.intakeId} className={`${layout.rowClassName} ${rowHoverClassName}`}>
              <div className="min-w-0">
                <Link className="group min-w-0" to={row.href}>
                  <p className="font-semibold text-foreground transition-colors group-hover:text-primary">{row.customerLabel}</p>
                  {row.customerMeta ? <p className="mt-1 text-sm leading-6 text-muted-foreground">{row.customerMeta}</p> : null}
                </Link>
              </div>
              <div className="min-w-0">
                <HeaderedTableMobileLabel className={layout.mobileLabelClassName}>Request</HeaderedTableMobileLabel>
                <p className="text-sm leading-6 text-foreground">{row.requestLabel}</p>
              </div>
              <div>
                <HeaderedTableMobileLabel className={layout.mobileLabelClassName}>Quoted total</HeaderedTableMobileLabel>
                <span className="text-sm font-medium text-foreground">{row.quoteLabel ?? 'Pending quote'}</span>
              </div>
              <div>
                <HeaderedTableMobileLabel className={layout.mobileLabelClassName}>State</HeaderedTableMobileLabel>
                <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[0.72rem] font-medium ${statusPillClassName(row.statusTone)}`}>
                  {row.statusLabel}
                </span>
              </div>
              <div>
                <HeaderedTableMobileLabel className={layout.mobileLabelClassName}>Created / updated</HeaderedTableMobileLabel>
                <p className="text-sm leading-6 text-muted-foreground">{row.createdLabel}</p>
              </div>
              <div className="flex items-start lg:justify-center">
                {row.ticketHref && (row.actionLabel === 'Open ticket' || row.actionLabel === 'View') ? (
                  <Button asChild className="w-[132px] justify-center" size="sm" variant="outline">
                    <Link to={row.ticketHref}>
                      {row.actionLabel === 'Open ticket' ? <ActionOpenExternalIcon className="size-4" /> : <EntityPreviewIcon className="size-4" />}
                      {row.actionLabel}
                    </Link>
                  </Button>
                ) : (
                  <Button asChild className="w-[132px] justify-center" size="sm" variant={row.actionLabel === 'Create ticket' ? 'default' : 'outline'}>
                    <Link to={row.href}>
                      {row.actionLabel === 'Create ticket' ? <ActionClipboardAddIcon className="size-4" /> : <ActionEditIcon className="size-4" />}
                      {row.actionLabel}
                    </Link>
                  </Button>
                )}
              </div>
            </HeaderedTableRow>
          ))}
        </HeaderedTableBody>
      </div>
    </HeaderedTable>
  );
}
