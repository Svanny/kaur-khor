import type { ReactNode } from 'react';
import { CircleHelp } from 'lucide-react';
import { useDescriptionTextVisible } from '@/components/system/description-text';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

function SectionTooltip({
  content,
  label,
}: {
  content: string;
  label: string;
}) {
  const tooltipVisible = useDescriptionTextVisible();

  if (!tooltipVisible) {
    return null;
  }

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            aria-label={`${label} help`}
            className="inline-flex items-center justify-center text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
            type="button"
          >
            <CircleHelp className="size-3.5" />
          </button>
        </TooltipTrigger>
        <TooltipContent className="max-w-sm text-sm leading-6" side="top" sideOffset={8}>
          {content}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

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
      <SectionTooltip content={tooltip} label={label} />
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
      <SectionTooltip content={tooltip} label={title} />
    </div>
  );
}
