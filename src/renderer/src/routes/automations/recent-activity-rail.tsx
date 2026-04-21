import { Link } from 'react-router-dom';
import { rowHoverClassName } from '@/lib/interactive-surface';
import type { AutomationRailRow } from './view-model';

export function RecentAutomationActivityRail({ rows }: { rows: AutomationRailRow[] }) {
  if (rows.length === 0) {
    return <p className="py-3 text-sm text-muted-foreground">Automation activity will appear here once Telegram intake starts moving.</p>;
  }

  return (
    <div className="divide-y divide-border/50">
      {rows.map((row) => (
        <Link
          key={row.id}
          className={`flex items-start justify-between gap-3 rounded-[1rem] px-3 py-3 text-left transition-colors ${rowHoverClassName}`}
          to={row.href}
        >
          <div className="min-w-0">
            <p className="text-sm font-medium text-foreground">{row.label}</p>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">{row.detail}</p>
          </div>
          {row.valueLabel ? (
            <span className="shrink-0 text-xs font-semibold text-foreground">{row.valueLabel}</span>
          ) : null}
        </Link>
      ))}
    </div>
  );
}
