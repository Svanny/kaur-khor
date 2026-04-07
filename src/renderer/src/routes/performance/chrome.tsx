import type { ReactNode } from 'react';
import { DescriptionText, hasDescriptionText, useDescriptionTextVisible } from '@/components/system/description-text';
import { cardFrameClassName, cardSurfaceClassName } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { SectionLabel, SectionTitle } from '@/routes/sku-detail/section-heading';

export const PERFORMANCE_HEADER_SURFACE_CLASS_NAME = `${cardFrameClassName} ${cardSurfaceClassName} rounded-[2rem]`;
export const PERFORMANCE_RAIL_BLOCK_CLASS_NAME = `${cardFrameClassName} ${cardSurfaceClassName} rounded-[1.4rem]`;

export function PerformanceSectionShell({
  title,
  tooltip,
  descriptor,
  description,
  headerActions,
  children,
  className,
  contentClassName,
}: {
  title: string;
  tooltip: string;
  descriptor?: string;
  description?: string;
  headerActions?: ReactNode;
  children: ReactNode;
  className?: string;
  contentClassName?: string;
}) {
  const descriptionVisible = useDescriptionTextVisible();
  const resolvedDescriptor = descriptor ?? description;
  const showDescription = hasDescriptionText(resolvedDescriptor, descriptionVisible);

  return (
    <section className={cn(PERFORMANCE_HEADER_SURFACE_CLASS_NAME, 'flex h-full flex-col', className)}>
      <div className="border-b border-border/60 px-6 py-4">
        <div className="flex items-start justify-between gap-4">
          <div className={cn('flex flex-col gap-2', !showDescription && 'gap-0')}>
            <SectionTitle title={title} tooltip={tooltip} />
            {showDescription ? (
              <DescriptionText className="max-w-3xl text-sm leading-6 text-muted-foreground">
                {resolvedDescriptor}
              </DescriptionText>
            ) : null}
          </div>
          {headerActions ? <div className="shrink-0">{headerActions}</div> : null}
        </div>
      </div>
      <div className={cn('min-h-0 flex-1 px-6 py-5', contentClassName)}>{children}</div>
    </section>
  );
}

export function PerformanceRightRailBlock({
  title,
  tooltip,
  children,
}: {
  title: string;
  tooltip: string;
  children: ReactNode;
}) {
  return (
    <section className={PERFORMANCE_RAIL_BLOCK_CLASS_NAME}>
      <div className="border-b border-border/60 px-4 py-3">
        <h3 className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          <SectionLabel tooltip={tooltip}>{title}</SectionLabel>
        </h3>
      </div>
      <div className="px-4 py-4">{children}</div>
    </section>
  );
}
