import type { CSSProperties, KeyboardEvent, ReactNode } from 'react';
import { cn } from '@/lib/utils';

type HeaderedTableVariant = 'overview' | 'framed';
type HeaderedTableLayoutBreakpoint = 'lg' | 'xl';
type HeaderedTableLayoutGap = 4 | 5;

export type HeaderedTableLayout = {
  containerClassName: string;
  headerClassName: string;
  bodyClassName: string;
  rowClassName: string;
  mobileLabelClassName: string;
  style: CSSProperties;
};

export function createHeaderedTableLayout({
  breakpoint,
  columns,
  gap,
}: {
  breakpoint: HeaderedTableLayoutBreakpoint;
  columns: string;
  gap: HeaderedTableLayoutGap;
}): HeaderedTableLayout {
  const responsiveClasses =
    breakpoint === 'lg'
      ? {
          container: 'lg:grid lg:[grid-template-columns:var(--headered-table-columns)]',
          header: 'lg:grid lg:grid-cols-subgrid lg:col-span-full',
          body: 'lg:grid lg:grid-cols-subgrid lg:col-span-full',
          row: 'lg:grid-cols-subgrid lg:col-span-full',
          mobileLabel: 'lg:hidden',
        }
      : {
          container: 'xl:grid xl:[grid-template-columns:var(--headered-table-columns)]',
          header: 'xl:grid xl:grid-cols-subgrid xl:col-span-full',
          body: 'xl:grid xl:grid-cols-subgrid xl:col-span-full',
          row: 'xl:grid-cols-subgrid xl:col-span-full',
          mobileLabel: 'xl:hidden',
        };

  const gapClasses =
    gap === 4
      ? {
          header: `${breakpoint}:gap-0 ${breakpoint}:[&>*]:px-3`,
          body: '',
          row: `${breakpoint}:gap-0 ${breakpoint}:[&>*]:px-3`,
        }
      : {
          header: `${breakpoint}:gap-0 ${breakpoint}:[&>*]:px-3.5`,
          body: '',
          row: `${breakpoint}:gap-0 ${breakpoint}:[&>*]:px-3.5`,
        };

  return {
    containerClassName: responsiveClasses.container,
    headerClassName: `${responsiveClasses.header} ${gapClasses.header}`,
    bodyClassName: responsiveClasses.body,
    rowClassName: `${responsiveClasses.row} ${gapClasses.row}`,
    mobileLabelClassName: responsiveClasses.mobileLabel,
    style: { '--headered-table-columns': columns } as CSSProperties,
  };
}

export function HeaderedTable({
  children,
  className,
  variant = 'overview',
}: {
  children: ReactNode;
  className?: string;
  variant?: HeaderedTableVariant;
}) {
  return (
    <div
      className={cn(
        variant === 'overview' && 'overflow-hidden rounded-none border-0 bg-transparent',
        variant === 'framed' && 'overflow-hidden rounded-[1.4rem] border border-border/60 bg-background/70',
        className,
      )}
      data-slot="headered-table"
      data-variant={variant}
    >
      {children}
    </div>
  );
}

export function HeaderedTableHeader({
  children,
  className,
  style,
}: {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <div
      className={cn('hidden border-b border-border/60 px-5 py-3 text-left sm:px-6', className)}
      data-slot="headered-table-header"
      style={style}
    >
      {children}
    </div>
  );
}

export function HeaderedTableHeaderCell({
  align = 'left',
  children,
  className,
}: {
  align?: 'left' | 'center' | 'right';
  children: ReactNode;
  className?: string;
}) {
  return (
    <p
      className={cn(
        'text-[0.72rem] font-semibold uppercase tracking-[0.18em] text-muted-foreground',
        align === 'center' && 'text-center',
        align === 'right' && 'text-right',
        className,
      )}
      data-slot="headered-table-header-cell"
    >
      {children}
    </p>
  );
}

export function HeaderedTableBody({
  children,
  className,
  style,
}: {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <div className={cn('divide-y divide-border/60', className)} data-slot="headered-table-body" style={style}>
      {children}
    </div>
  );
}

export function HeaderedTableRow({
  children,
  className,
  dataSlot,
  'data-slot': dataSlotAttr,
  onClick,
  style,
}: {
  children: ReactNode;
  className?: string;
  dataSlot?: string;
  'data-slot'?: string;
  onClick?: () => void;
  style?: CSSProperties;
}) {
  const interactive = typeof onClick === 'function';
  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!interactive) {
      return;
    }
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onClick();
    }
  };

  return (
    <div
      className={cn('grid gap-4 px-5 py-5 transition-colors sm:px-6', interactive && 'cursor-pointer', className)}
      data-slot={dataSlotAttr ?? dataSlot ?? 'headered-table-row'}
      onClick={onClick}
      onKeyDown={handleKeyDown}
      role={interactive ? 'button' : undefined}
      style={style}
      tabIndex={interactive ? 0 : undefined}
    >
      {children}
    </div>
  );
}

export function HeaderedTableMobileLabel({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <HeaderedTableHeaderCell className={cn('mb-1 lg:hidden', className)}>
      {children}
    </HeaderedTableHeaderCell>
  );
}

export function HeaderedTableCellStack({
  primary,
  secondary,
  className,
  primaryClassName,
  secondaryClassName,
}: {
  primary: ReactNode;
  secondary?: ReactNode;
  className?: string;
  primaryClassName?: string;
  secondaryClassName?: string;
}) {
  return (
    <div className={cn('min-w-0', className)} data-slot="headered-table-cell-stack">
      <div className={cn('font-medium text-foreground', primaryClassName)}>{primary}</div>
      {secondary ? (
        <div className={cn('mt-2 text-sm leading-6 text-muted-foreground', secondaryClassName)}>{secondary}</div>
      ) : null}
    </div>
  );
}
