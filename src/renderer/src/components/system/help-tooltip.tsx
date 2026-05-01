import { Link } from 'react-router-dom';
import { ActionOpenExternalIcon } from '@icons/actions';
import { StatusHelpIcon } from '@icons/status';
import { useDescriptionTextVisible } from '@/components/system/description-text';
import { HoverTooltip } from '@/components/system/hover-tooltip';
import { translateUiLiteral } from '@/lib/translations';
import { usePreferences } from '@/state/preferences';

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
  const { language } = usePreferences();
  const triggerLabel = translateUiLiteral(language, '{label} help', { label });
  const moreLabel = translateUiLiteral(language, 'More');
  const moreAriaLabel = translateUiLiteral(language, 'More help for {label}', { label });

  if (!tooltipVisible) {
    return null;
  }

  return (
    <HoverTooltip
      ariaLabel={triggerLabel}
      className={
        className ??
        'inline-flex items-center justify-center text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60'
      }
      content={(
        <span>
          {content}{' '}
          <Link
            aria-label={moreAriaLabel}
            className="inline-flex w-fit items-center gap-1 bg-[radial-gradient(circle,currentColor_1px,transparent_1.5px)] bg-[length:5px_2px] bg-repeat-x bg-[position:0_calc(100%-1px)] pb-1 font-medium text-background no-underline outline-none focus-visible:ring-2 focus-visible:ring-background/70"
            to={helpHref}
          >
            <span>{moreLabel}</span>
            <ActionOpenExternalIcon aria-hidden="true" className="size-3" />
          </Link>
        </span>
      )}
      side="top"
      sideOffset={8}
      tooltipClassName="pointer-events-auto pb-2.5"
    >
      <StatusHelpIcon className="size-3.5" />
    </HoverTooltip>
  );
}
