import { forwardRef, type CSSProperties, type HTMLAttributes, type KeyboardEvent, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

type HeaderedTableVariant = 'overview' | 'framed';
type HeaderedTableLayoutBreakpoint = 'lg' | 'xl' | '2xl';
type HeaderedTableLayoutGap = 4 | 5;
type HeaderedTableOverflow = 'hidden' | 'auto';

export type HeaderedTableLayout = {
  containerClassName: string;
  headerClassName: string;
  bodyClassName: string;
  rowClassName: string;
  mobileLabelClassName: string;
  style: CSSProperties;
  overflowX: HeaderedTableOverflow;
};

export function hasRenderableRows<T>(rows: readonly T[] | null | undefined): rows is readonly T[] {
  return Boolean(rows?.length);
}

export function createHeaderedTableLayout({
  breakpoint,
  columns,
  gap,
  overflowX = 'hidden',
}: {
  breakpoint: HeaderedTableLayoutBreakpoint;
  columns: string;
  gap: HeaderedTableLayoutGap;
  overflowX?: HeaderedTableOverflow;
}): HeaderedTableLayout {
  const responsiveClasses =
    breakpoint === 'lg'
      ? {
          container: 'min-h-full flex-1 bg-white lg:grid lg:auto-rows-max lg:content-start lg:[grid-template-columns:var(--headered-table-columns)]',
          header: 'lg:grid lg:grid-cols-subgrid lg:col-span-full',
          body: 'lg:grid lg:grid-cols-subgrid lg:col-span-full',
          row: 'lg:grid-cols-subgrid lg:col-span-full',
          mobileLabel: 'lg:hidden',
        }
      : breakpoint === 'xl'
        ? {
          container: 'min-h-full flex-1 bg-white xl:grid xl:auto-rows-max xl:content-start xl:[grid-template-columns:var(--headered-table-columns)]',
          header: 'xl:grid xl:grid-cols-subgrid xl:col-span-full',
          body: 'xl:grid xl:grid-cols-subgrid xl:col-span-full',
          row: 'xl:grid-cols-subgrid xl:col-span-full',
          mobileLabel: 'xl:hidden',
        }
        : {
          container: 'min-h-full flex-1 bg-white 2xl:grid 2xl:auto-rows-max 2xl:content-start 2xl:[grid-template-columns:var(--headered-table-columns)]',
          header: '2xl:grid 2xl:grid-cols-subgrid 2xl:col-span-full',
          body: '2xl:grid 2xl:grid-cols-subgrid 2xl:col-span-full',
          row: '2xl:grid-cols-subgrid 2xl:col-span-full',
          mobileLabel: '2xl:hidden',
        };

  const gapClasses =
    breakpoint === 'lg'
      ? gap === 4
        ? {
            header: 'lg:gap-0 lg:[&>*]:px-3',
            body: '',
            row: 'lg:gap-0 lg:[&>*]:px-3',
          }
        : {
            header: 'lg:gap-0 lg:[&>*]:px-3.5',
            body: '',
            row: 'lg:gap-0 lg:[&>*]:px-3.5',
          }
      : breakpoint === 'xl'
        ? gap === 4
          ? {
            header: 'xl:gap-0 xl:[&>*]:px-3',
            body: '',
            row: 'xl:gap-0 xl:[&>*]:px-3',
          }
          : {
            header: 'xl:gap-0 xl:[&>*]:px-3.5',
            body: '',
            row: 'xl:gap-0 xl:[&>*]:px-3.5',
          }
        : gap === 4
          ? {
            header: '2xl:gap-0 2xl:[&>*]:px-3',
            body: '',
            row: '2xl:gap-0 2xl:[&>*]:px-3',
          }
          : {
            header: '2xl:gap-0 2xl:[&>*]:px-3.5',
            body: '',
            row: '2xl:gap-0 2xl:[&>*]:px-3.5',
          };

  return {
    containerClassName: responsiveClasses.container,
    headerClassName: `${responsiveClasses.header} ${gapClasses.header}`,
    bodyClassName: responsiveClasses.body,
    rowClassName: `${responsiveClasses.row} ${gapClasses.row}`,
    mobileLabelClassName: responsiveClasses.mobileLabel,
    style: { '--headered-table-columns': columns } as CSSProperties,
    overflowX,
  };
}

export const HeaderedTable = forwardRef<HTMLDivElement, {
  children: ReactNode;
  className?: string;
  empty?: boolean;
  hideWhenEmpty?: boolean;
  overflowX?: HeaderedTableOverflow;
  variant?: HeaderedTableVariant;
}>(function HeaderedTable({
  children,
  className,
  empty = false,
  hideWhenEmpty = false,
  overflowX = 'hidden',
  variant = 'overview',
}, ref) {
  if (hideWhenEmpty && empty) {
    return null;
  }

  return (
    <div
      className={cn(
        variant === 'overview' && 'flex min-h-full flex-1 flex-col rounded-none border-0 bg-white',
        variant === 'framed' && 'flex min-h-full flex-1 flex-col rounded-[1.4rem] border border-border/60 bg-white',
        overflowX === 'hidden' && 'overflow-hidden',
        overflowX === 'auto' && 'overflow-x-auto overscroll-x-contain',
        className,
      )}
      data-slot="headered-table"
      data-overflow-x={overflowX}
      data-variant={variant}
      ref={ref}
    >
      {children}
    </div>
  );
});

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
  helperExemptReason,
}: {
  align?: 'left' | 'center' | 'right';
  children: ReactNode;
  className?: string;
  helperExemptReason?: string;
}) {
  return (
    <p
      className={cn(
        'text-[0.72rem] font-semibold uppercase tracking-[0.18em] text-muted-foreground',
        align === 'center' && 'text-center',
        align === 'right' && 'text-right',
        className,
      )}
      data-helper-exempt={helperExemptReason ?? undefined}
      data-slot="headered-table-header-cell"
    >
      {children}
    </p>
  );
}

export const HeaderedTableBody = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(function HeaderedTableBody(
  {
    children,
    className,
    style,
    ...props
  },
  ref,
) {
  return (
    <div
      {...props}
      className={cn('divide-y divide-border/60 bg-white', className)}
      data-slot="headered-table-body"
      ref={ref}
      style={style}
    >
      {children}
    </div>
  );
});

export const HeaderedTableRow = forwardRef<
  HTMLDivElement,
  HTMLAttributes<HTMLDivElement> & {
    'data-slot'?: string;
    dataSlot?: string;
  }
>(function HeaderedTableRow(
  {
    children,
    className,
    dataSlot,
    'data-slot': dataSlotAttr,
    onClick,
    onKeyDown,
    role,
    style,
    tabIndex,
    ...props
  },
  ref,
) {
  const interactive = typeof onClick === 'function';
  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    onKeyDown?.(event);
    if (event.defaultPrevented) {
      return;
    }
    if (!interactive) {
      return;
    }
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      event.currentTarget.click();
    }
  };

  return (
    <div
      {...props}
      className={cn('grid gap-4 px-5 py-5 transition-colors sm:px-6', interactive && 'cursor-pointer', className)}
      data-slot={dataSlotAttr ?? dataSlot ?? 'headered-table-row'}
      onClick={onClick}
      onKeyDown={handleKeyDown}
      ref={ref}
      role={interactive ? 'button' : role}
      style={style}
      tabIndex={interactive ? 0 : tabIndex}
    >
      {children}
    </div>
  );
});

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
