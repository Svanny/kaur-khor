import { Link } from 'react-router-dom';
import type { ReactNode } from 'react';
import type { AppLanguage } from '@shared/inventory';
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
import { ActionEditIcon, ActionOpenExternalIcon } from '@icons/actions';
import { EntityCustomerIcon } from '@icons/entities';
import { SectionLabel } from '@/routes/sku-detail/section-heading';
import { translateUiLiteral } from '@/lib/translations';

const automationActionButtonClassName = 'min-w-[152px] justify-center';

const layout = createHeaderedTableLayout({
  breakpoint: 'xl',
  columns: 'minmax(14rem,0.95fr) minmax(10rem,0.75fr) minmax(16rem,1.1fr) minmax(8rem,0.5fr) minmax(8rem,0.45fr)',
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

export function AutomationExceptionTable({
  rows,
  language = 'en',
  onOpenIntake,
}: {
  rows: AutomationExceptionRow[];
  language?: AppLanguage;
  onOpenIntake: (row: AutomationExceptionRow) => void;
}) {
  if (rows.length === 0) {
    return null;
  }
  const literal = (englishTemplate: string) => translateUiLiteral(language, englishTemplate);

  return (
    <HeaderedTable>
      <div className={layout.containerClassName} style={layout.style}>
        <HeaderedTableHeader className={layout.headerClassName}>
          <HeaderedTableHeaderCell>
            <HeaderTooltipLabel helpHref="/settings/help#automation-exception-customer-conversation" tooltip={literal('Customer label and conversation identity tied to this exception.')}>{literal('Customer / conversation')}</HeaderTooltipLabel>
          </HeaderedTableHeaderCell>
          <HeaderedTableHeaderCell>
            <HeaderTooltipLabel helpHref="/settings/help#automation-exception-issue" tooltip={literal('Why the intake needs operator review before becoming normal work.')}>{literal('Issue')}</HeaderTooltipLabel>
          </HeaderedTableHeaderCell>
          <HeaderedTableHeaderCell>
            <HeaderTooltipLabel helpHref="/settings/help#automation-exception-last-message" tooltip={literal('Most recent customer message that contributed to the exception.')}>{literal('Last message')}</HeaderTooltipLabel>
          </HeaderedTableHeaderCell>
          <HeaderedTableHeaderCell>
            <HeaderTooltipLabel helpHref="/settings/help#automation-exception-confidence" tooltip={literal('How sure Kaur Khor is about the inferred customer request or match.')}>{literal('Confidence')}</HeaderTooltipLabel>
          </HeaderedTableHeaderCell>
          <HeaderedTableHeaderCell align="center">{literal('Action')}</HeaderedTableHeaderCell>
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
                  <p className="mt-1 text-sm leading-6 text-muted-foreground">{row.conversationId}</p>
                </button>
              </div>
              <div>
                <HeaderedTableMobileLabel className={layout.mobileLabelClassName}>{literal('Issue')}</HeaderedTableMobileLabel>
                <p className="text-sm font-medium text-foreground">{row.issueLabel}</p>
              </div>
              <div className="min-w-0">
                <HeaderedTableMobileLabel className={layout.mobileLabelClassName}>{literal('Last message')}</HeaderedTableMobileLabel>
                <p className="truncate text-sm leading-6 text-muted-foreground">{row.messageSnippet}</p>
              </div>
              <div>
                <HeaderedTableMobileLabel className={layout.mobileLabelClassName}>{literal('Confidence')}</HeaderedTableMobileLabel>
                <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[0.72rem] font-medium ${statusPillClassName(row.confidenceTone)}`}>
                  {row.confidenceLabel}
                </span>
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
                    <ActionEditIcon className="size-4" />
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
