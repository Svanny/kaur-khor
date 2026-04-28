import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

const ribbonGridColumnsClassNames = {
  1: 'xl:grid-cols-1',
  2: 'xl:grid-cols-2',
  3: 'xl:grid-cols-3',
  4: 'xl:grid-cols-4',
  5: 'xl:grid-cols-5',
  6: 'xl:grid-cols-6',
  7: 'xl:grid-cols-7',
  8: 'xl:grid-cols-8',
} as const;

export function ribbonGridClassName(metricCount: number) {
  return ribbonGridColumnsClassNames[Math.min(Math.max(metricCount, 1), 8) as keyof typeof ribbonGridColumnsClassNames];
}

export type MetricRibbonItem = {
  key: string;
  label: string;
  value: ReactNode;
  detail?: ReactNode;
  href?: string;
  className?: string;
  valueClassName?: string;
  'aria-label'?: string;
};

export function MetricRibbon({
  className,
  columns,
  items,
  shadow = false,
  title,
}: {
  className?: string;
  columns?: number;
  items: MetricRibbonItem[];
  shadow?: boolean;
  title?: ReactNode;
}) {
  const gridClassName = columns != null
    ? `xl:grid-cols-${Math.min(Math.max(columns, 1), 8)}`
    : ribbonGridClassName(items.length);

  return (
    <div
      className={cn(
        'overflow-hidden rounded-[1rem] border border-border/70 bg-white',
        shadow && 'shadow-[0_10px_24px_rgba(48,31,20,0.06)]',
        className,
      )}
    >
      {title ? (
        <div className="border-b border-border/60 px-4 py-3">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">{title}</p>
        </div>
      ) : null}
      <div className={`grid divide-y divide-border/60 bg-border/40 sm:grid-cols-2 sm:divide-x sm:divide-y-0 ${gridClassName}`}>
        {items.map((item) => {
          const content = (
            <>
              <p className="truncate text-sm text-muted-foreground">{item.label}</p>
              <div className={cn('mt-1 text-[1.2rem] font-semibold tracking-[-0.03em] text-foreground', item.valueClassName)}>
                {item.value}
              </div>
              {item.detail ? (
                <div className="mt-2 text-sm leading-5 text-muted-foreground">
                  {item.detail}
                </div>
              ) : null}
            </>
          );

          const cellClassName = cn(
            'min-w-0 bg-white px-4 py-3',
            item.className,
          );

          if (item.href) {
            return (
              <a
                key={item.key}
                aria-label={item['aria-label']}
                href={item.href}
                className={cn(
                  cellClassName,
                  'block transition-colors hover:bg-white/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60',
                )}
              >
                {content}
              </a>
            );
          }

          return (
            <div key={item.key} className={cellClassName}>
              {content}
            </div>
          );
        })}
      </div>
    </div>
  );
}
