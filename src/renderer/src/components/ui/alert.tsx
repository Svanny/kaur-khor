import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const alertVariants = cva(
  'group/alert relative grid w-full gap-0.5 rounded-2xl border px-4 py-3 text-left text-sm has-data-[slot=alert-action]:pr-18 has-[>svg]:grid-cols-[auto_1fr] has-[>svg]:gap-x-2.5 *:[svg]:row-span-2 *:[svg]:translate-y-0.5 *:[svg]:text-current *:[svg:not([class*=size-])]:size-4',
  {
    variants: {
      variant: {
        default: 'bg-card text-card-foreground',
        destructive:
          'border-destructive/20 bg-destructive/8 text-destructive *:data-[slot=alert-description]:text-destructive/90',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  },
);

function Alert({
  className,
  variant,
  ...props
}: React.ComponentProps<'div'> & VariantProps<typeof alertVariants>) {
  return (
    <div
      className={cn(alertVariants({ variant }), className)}
      data-slot="alert"
      role="alert"
      {...props}
    />
  );
}

function AlertTitle({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      className={cn(
        'font-heading font-medium group-has-[>svg]/alert:col-start-2 [&_a]:underline [&_a]:underline-offset-3',
        className,
      )}
      data-slot="alert-title"
      {...props}
    />
  );
}

function AlertDescription({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      className={cn(
        'text-sm text-balance text-muted-foreground [&_a]:underline [&_a]:underline-offset-3 [&_p:not(:last-child)]:mb-4',
        className,
      )}
      data-slot="alert-description"
      {...props}
    />
  );
}

function AlertAction({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      className={cn('absolute top-2.5 right-3', className)}
      data-slot="alert-action"
      {...props}
    />
  );
}

export { Alert, AlertAction, AlertDescription, AlertTitle };
