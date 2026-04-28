import { Link } from 'react-router-dom';
import { ActionOpenExternalIcon } from '@icons/actions';
import { StatusHelpIcon } from '@icons/status';
import { useDescriptionTextVisible } from '@/components/system/description-text';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

export function HelpTooltip({
  content,
  helpHref,
  label,
  className,
}: {
  content: string;
  helpHref: string;
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
            <StatusHelpIcon className="size-3.5" />
          </button>
        </TooltipTrigger>
        <TooltipContent className="pointer-events-auto pb-2.5" side="top" sideOffset={8}>
          <span>
            {content}{' '}
            <Link
              aria-label={`More help for ${label}`}
              className="inline-flex w-fit items-center gap-1 bg-[radial-gradient(circle,currentColor_1px,transparent_1.5px)] bg-[length:5px_2px] bg-repeat-x bg-[position:0_calc(100%-1px)] pb-1 font-medium text-background no-underline outline-none focus-visible:ring-2 focus-visible:ring-background/70"
              to={helpHref}
            >
              <span>More</span>
              <ActionOpenExternalIcon aria-hidden="true" className="size-3" />
            </Link>
          </span>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
