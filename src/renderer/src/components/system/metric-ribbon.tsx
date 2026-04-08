import { cn } from '@/lib/utils';

const ribbonGridColumnsClassNames = {
  1: 'xl:grid-cols-1',
  2: 'xl:grid-cols-2',
  3: 'xl:grid-cols-3',
  4: 'xl:grid-cols-4',
  5: 'xl:grid-cols-5',
  6: 'xl:grid-cols-6',
} as const;

function ribbonGridClassName(metricCount: number) {
  return ribbonGridColumnsClassNames[Math.min(Math.max(metricCount, 1), 6) as keyof typeof ribbonGridColumnsClassNames];
}

export function MetricRibbon({
  className,
  items,
  title,
}: {
  className?: string;
  items: Array<{ key: string; label: string; value: string }>;
  title?: string;
}) {
  return (
    <div className={cn('overflow-hidden rounded-[1rem] border border-border/70 bg-white shadow-[0_10px_24px_rgba(48,31,20,0.06)]', className)}>
      {title ? (
        <div className="border-b border-border/60 px-4 py-3">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">{title}</p>
        </div>
      ) : null}
      <div className={`grid divide-y divide-border/60 bg-border/40 sm:grid-cols-2 sm:divide-x sm:divide-y-0 ${ribbonGridClassName(items.length)}`}>
        {items.map((item) => (
          <div key={item.key} className="bg-white px-4 py-3">
            <p className="text-sm text-muted-foreground">{item.label}</p>
            <p className="mt-1 text-[1.2rem] font-semibold tracking-[-0.03em] text-foreground">{item.value}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
