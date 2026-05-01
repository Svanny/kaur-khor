import { Link } from 'react-router-dom';
import type { AppLanguage } from '@shared/inventory';
import { rowHoverClassName } from '@/lib/interactive-surface';
import type { AutomationRailRow } from './view-model';
import { StatusAutomationIcon } from '@icons/status';
import { translateUiLiteral } from '@/lib/translations';

export function RecentAutomationActivityRail({
  rows,
  language = 'en',
  onOpenIntake,
}: {
  rows: AutomationRailRow[];
  language?: AppLanguage;
  onOpenIntake: (row: AutomationRailRow) => void;
}) {
  if (rows.length === 0) {
    return <p className="py-3 text-sm text-muted-foreground">{translateUiLiteral(language, 'Automation activity will appear here once Telegram intake starts moving.')}</p>;
  }

  return (
    <div className="divide-y divide-border/50">
      {rows.map((row) => (
        row.overviewHref ? (
          <Link
            key={row.id}
            className={`flex w-full items-start justify-between gap-3 rounded-[1rem] px-3 py-3 text-left transition-colors ${rowHoverClassName}`}
            to={row.overviewHref}
          >
            <div className="flex min-w-0 items-start gap-2">
              <StatusAutomationIcon data-icon="inline-start" className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground">{row.label}</p>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">{row.detail}</p>
              </div>
            </div>
            {row.valueLabel ? (
              <span className="shrink-0 text-xs font-semibold text-foreground">{row.valueLabel}</span>
            ) : null}
          </Link>
        ) : (
          <button
            key={row.id}
            className={`flex w-full items-start justify-between gap-3 rounded-[1rem] px-3 py-3 text-left transition-colors ${rowHoverClassName}`}
            type="button"
            onClick={() => onOpenIntake(row)}
          >
            <div className="flex min-w-0 items-start gap-2">
              <StatusAutomationIcon data-icon="inline-start" className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground">{row.label}</p>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">{row.detail}</p>
              </div>
            </div>
            {row.valueLabel ? (
              <span className="shrink-0 text-xs font-semibold text-foreground">{row.valueLabel}</span>
            ) : null}
          </button>
        )
      ))}
    </div>
  );
}
