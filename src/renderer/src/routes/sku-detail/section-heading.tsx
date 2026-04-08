import type { ReactNode } from 'react';
import { HelpTooltip } from '@/components/system/help-tooltip';

export function SectionLabel({
  tooltip,
  tooltipLabel,
  children,
}: {
  tooltip: string;
  tooltipLabel?: string;
  children: ReactNode;
}) {
  const label = tooltipLabel ?? (typeof children === 'string' ? children : 'Section');

  return (
    <span className="inline-flex items-center gap-2 align-middle">
      <span>{children}</span>
      <HelpTooltip content={tooltip} label={label} />
    </span>
  );
}

export function SectionTitle({
  tooltip,
  title,
}: {
  tooltip: string;
  title: string;
}) {
  return (
    <div className="flex items-center gap-3">
      <h2 className="text-2xl font-semibold tracking-[-0.03em] text-foreground">{title}</h2>
      <HelpTooltip content={tooltip} label={title} />
    </div>
  );
}
