import type { ReactNode } from 'react';
import { HelpTooltip } from '@/components/system/help-tooltip';

export function SectionLabel({
  tooltip,
  children,
}: {
  tooltip: string;
  children: ReactNode;
}) {
  const label = typeof children === 'string' ? children : 'Section';

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
