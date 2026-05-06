import type { ReactNode } from 'react';

export interface SelectedIntervalMetric {
  label: string;
  value: string;
  wide?: boolean;
}

export function SelectedIntervalBrief({
  headline,
  meta,
  metrics,
  notes,
}: {
  headline: string;
  meta: ReactNode[];
  metrics: SelectedIntervalMetric[];
  notes?: string[];
}) {
  return (
    <div className="grid gap-4">
      <div>
        <p className="text-2xl font-semibold leading-[1.15] tracking-[-0.03em] text-foreground">{headline}</p>
        <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm leading-6 text-muted-foreground">
          {meta.map((item, index) => (
            <span key={`${index}:${item}`} className="inline-flex items-center gap-2">
              {index > 0 ? <span aria-hidden="true" className="text-muted-foreground/60">·</span> : null}
              <span>{item}</span>
            </span>
          ))}
        </div>
      </div>

      <dl className="grid grid-cols-2 gap-x-4 gap-y-3 border-y border-border/60 py-3">
        {metrics.map((metric) => (
          <div key={metric.label} className={metric.wide ? 'col-span-2 min-w-0' : 'min-w-0'}>
            <dt className="text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-muted-foreground">{metric.label}</dt>
            <dd className="mt-1 break-words text-sm font-medium text-foreground">{metric.value}</dd>
          </div>
        ))}
      </dl>

      {notes?.length ? (
        <div className="grid gap-2">
          {notes.map((line, index) => (
            <p key={`${index}:${line}`} className="text-sm leading-6 text-muted-foreground">
              {line}
            </p>
          ))}
        </div>
      ) : null}
    </div>
  );
}
