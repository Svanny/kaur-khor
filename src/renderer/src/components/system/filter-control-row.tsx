import { type ReactNode } from 'react';
import { cn } from '@/lib/utils';

export function FilterControlRow({
  className,
  primaryFilter,
  search,
  secondaryFilter,
  trailing,
}: {
  className?: string;
  primaryFilter?: ReactNode;
  search: ReactNode;
  secondaryFilter?: ReactNode;
  trailing?: ReactNode;
}) {
  return (
    <div
      className={cn(
        'flex min-w-0 flex-wrap items-center gap-3',
        '[&_[data-slot=filter-control-row-search]]:min-w-[14rem] [&_[data-slot=filter-control-row-search]]:max-w-xl [&_[data-slot=filter-control-row-search]]:flex-[1_1_18rem]',
        '[&_[data-slot=filter-control-row-primary]]:min-w-0 [&_[data-slot=filter-control-row-primary]]:flex-[0_1_auto]',
        '[&_[data-slot=filter-control-row-secondary]]:min-w-0 [&_[data-slot=filter-control-row-secondary]]:flex-[0_1_auto]',
        '[&_[data-slot=filter-control-row-trailing]]:min-w-0 [&_[data-slot=filter-control-row-trailing]]:flex-[0_1_auto]',
        'max-[760px]:items-stretch max-[760px]:[&_[data-slot=filter-control-row-primary]]:flex-[1_1_100%] max-[760px]:[&_[data-slot=filter-control-row-search]]:flex-[1_1_100%] max-[760px]:[&_[data-slot=filter-control-row-secondary]]:flex-[1_1_100%] max-[760px]:[&_[data-slot=filter-control-row-trailing]]:flex-[1_1_100%]',
        className,
      )}
      data-slot="filter-control-row"
    >
      <div data-slot="filter-control-row-search">{search}</div>
      {primaryFilter ? <div data-slot="filter-control-row-primary">{primaryFilter}</div> : null}
      {secondaryFilter ? <div data-slot="filter-control-row-secondary">{secondaryFilter}</div> : null}
      {trailing ? <div data-slot="filter-control-row-trailing">{trailing}</div> : null}
    </div>
  );
}
