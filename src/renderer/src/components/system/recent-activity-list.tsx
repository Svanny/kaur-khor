import type { ReactNode } from 'react';
import type { StockReport } from '@shared/inventory';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

export function RecentActivityList({
  items,
  renderDateLabel,
  renderSourceLabel,
  renderSummary,
  renderNotes,
  className,
}: {
  items: StockReport[];
  renderDateLabel: (report: StockReport) => string;
  renderSourceLabel: (report: StockReport) => string;
  renderSummary: (report: StockReport) => ReactNode;
  renderNotes: (report: StockReport) => ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('divide-y divide-border/60', className)}>
      {items.map((report) => (
        <div className="py-4 first:pt-0 last:pb-0" key={report.reportId}>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline">{renderDateLabel(report)}</Badge>
            <Badge variant="secondary">{renderSourceLabel(report)}</Badge>
          </div>
          <p className="mt-3 text-sm leading-6 text-foreground">{renderSummary(report)}</p>
          <p className="mt-2 text-sm text-muted-foreground">{renderNotes(report)}</p>
        </div>
      ))}
    </div>
  );
}
