import { CircleHelp } from 'lucide-react';
import { useDescriptionTextVisible } from '@/components/system/description-text';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

export function HelpTooltip({
  content,
  label,
  className,
}: {
  content: string;
  label: string;
  className?: string;
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
            className={
              className ??
              'inline-flex items-center justify-center text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60'
            }
            type="button"
          >
            <CircleHelp className="size-3.5" />
          </button>
        </TooltipTrigger>
        <TooltipContent side="top" sideOffset={8}>
          {content}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
