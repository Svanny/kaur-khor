import { Link } from 'react-router-dom';
import type { AutomationExceptionRow } from './view-model';
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
import { ActionEditIcon } from '@icons/actions';

const layout = createHeaderedTableLayout({
  breakpoint: 'xl',
  columns: 'minmax(14rem,0.95fr) minmax(10rem,0.75fr) minmax(16rem,1.1fr) minmax(8rem,0.5fr) minmax(8rem,0.45fr)',
  gap: 4,
});

export function AutomationExceptionTable({ rows }: { rows: AutomationExceptionRow[] }) {
  if (rows.length === 0) {
    return null;
  }

  return (
    <HeaderedTable>
      <div className={layout.containerClassName} style={layout.style}>
        <HeaderedTableHeader className={layout.headerClassName}>
          <HeaderedTableHeaderCell>Customer / conversation</HeaderedTableHeaderCell>
          <HeaderedTableHeaderCell>Issue</HeaderedTableHeaderCell>
          <HeaderedTableHeaderCell>Last message</HeaderedTableHeaderCell>
          <HeaderedTableHeaderCell>Confidence</HeaderedTableHeaderCell>
          <HeaderedTableHeaderCell align="center">Action</HeaderedTableHeaderCell>
        </HeaderedTableHeader>
        <HeaderedTableBody className={layout.bodyClassName}>
          {rows.map((row) => (
            <HeaderedTableRow key={row.intakeId} className={`${layout.rowClassName} ${rowHoverClassName}`}>
              <div className="min-w-0">
                <Link className="group min-w-0" to={row.href}>
                  <p className="font-semibold text-foreground transition-colors group-hover:text-primary">{row.customerLabel}</p>
                  <p className="mt-1 text-sm leading-6 text-muted-foreground">{row.conversationId}</p>
                </Link>
              </div>
              <div>
                <HeaderedTableMobileLabel className={layout.mobileLabelClassName}>Issue</HeaderedTableMobileLabel>
                <p className="text-sm font-medium text-foreground">{row.issueLabel}</p>
              </div>
              <div className="min-w-0">
                <HeaderedTableMobileLabel className={layout.mobileLabelClassName}>Last message</HeaderedTableMobileLabel>
                <p className="truncate text-sm leading-6 text-muted-foreground">{row.messageSnippet}</p>
              </div>
              <div>
                <HeaderedTableMobileLabel className={layout.mobileLabelClassName}>Confidence</HeaderedTableMobileLabel>
                <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[0.72rem] font-medium ${statusPillClassName(row.confidenceTone)}`}>
                  {row.confidenceLabel}
                </span>
              </div>
              <div className="flex items-start lg:justify-center">
                <Button asChild className="w-[132px] justify-center" size="sm" variant="outline">
                  <Link to={row.href}>
                    <ActionEditIcon className="size-4" />
                    Review
                  </Link>
                </Button>
              </div>
            </HeaderedTableRow>
          ))}
        </HeaderedTableBody>
      </div>
    </HeaderedTable>
  );
}
