import { Link } from 'react-router-dom';
import type { ReactNode } from 'react';
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
import { EntityCustomerIcon } from '@icons/entities';
import { SectionLabel } from '@/routes/sku-detail/section-heading';

const automationActionButtonClassName = 'min-w-[152px] justify-center';

const layout = createHeaderedTableLayout({
  breakpoint: 'xl',
  columns: 'minmax(14rem,0.95fr) minmax(14rem,1.15fr) minmax(8rem,0.5fr) minmax(8rem,0.52fr) minmax(12rem,0.9fr) minmax(8rem,0.5fr)',
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

export function AutomationIntakeTable({
  rows,
  onOpenIntake,
}: {
  rows: AutomationIntakeTableRow[];
  onOpenIntake: (row: AutomationIntakeTableRow) => void;
}) {
  if (rows.length === 0) {
    return null;
  }

  return (
    <HeaderedTable>
      <div className={layout.containerClassName} style={layout.style}>
        <HeaderedTableHeader className={layout.headerClassName}>
          <HeaderedTableHeaderCell>
            <HeaderTooltipLabel helpHref="/settings/help#automation-intake-customer" tooltip="Customer identity inferred from the intake conversation.">Customer</HeaderTooltipLabel>
          </HeaderedTableHeaderCell>
          <HeaderedTableHeaderCell>
            <HeaderTooltipLabel helpHref="/settings/help#automation-intake-request" tooltip="The parsed customer request before it is attached to a ticket.">Request</HeaderTooltipLabel>
          </HeaderedTableHeaderCell>
          <HeaderedTableHeaderCell>
            <HeaderTooltipLabel helpHref="/settings/help#automation-intake-quoted-total" tooltip="Estimated customer-facing total when banji has enough matched catalog data.">Quoted total</HeaderTooltipLabel>
          </HeaderedTableHeaderCell>
          <HeaderedTableHeaderCell>
            <HeaderTooltipLabel helpHref="/settings/help#automation-intake-state" tooltip="Current intake state, including whether operator review is still needed.">State</HeaderTooltipLabel>
          </HeaderedTableHeaderCell>
          <HeaderedTableHeaderCell>
            <HeaderTooltipLabel helpHref="/settings/help#automation-intake-created-updated" tooltip="When the intake was created and most recently changed.">Created / updated</HeaderTooltipLabel>
          </HeaderedTableHeaderCell>
          <HeaderedTableHeaderCell align="center">Action</HeaderedTableHeaderCell>
        </HeaderedTableHeader>
        <HeaderedTableBody className={layout.bodyClassName}>
          {rows.map((row) => (
            <HeaderedTableRow key={row.intakeId} className={`${layout.rowClassName} ${rowHoverClassName}`}>
              <div className="min-w-0">
                <button className="group min-w-0 text-left" type="button" onClick={() => onOpenIntake(row)}>
                  <p className="flex items-center gap-2 font-semibold text-foreground transition-colors group-hover:text-primary">
                    <EntityCustomerIcon data-icon="inline-start" className="size-4 shrink-0" />
                    <span className="truncate">{row.customerLabel}</span>
                  </p>
                  {row.customerMeta ? <p className="mt-1 text-sm leading-6 text-muted-foreground">{row.customerMeta}</p> : null}
                </button>
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
                {row.ticketHref ? (
                  <Button asChild className={automationActionButtonClassName} size="sm" variant="outline">
                    <Link to={row.ticketHref}>
                      <ActionOpenExternalIcon className="size-4" />
                      {row.actionLabel}
                    </Link>
                  </Button>
                ) : (
                  <Button className={automationActionButtonClassName} size="sm" type="button" variant="outline" onClick={() => onOpenIntake(row)}>
                    {row.actionLabel === 'Open intake' ? <ActionEditIcon className="size-4" /> : <ActionClipboardAddIcon className="size-4" />}
                    {row.actionLabel}
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
