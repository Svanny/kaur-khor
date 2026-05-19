import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from '@/lib/utils';

export function AttentionFlash({
  active,
  children,
  className,
  overlayClassName,
  overlayTestId,
  ...props
}: {
  active: boolean;
  children: ReactNode;
  overlayClassName?: string;
  overlayTestId?: string;
} & HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn('relative isolate', className)} {...props}>
      {active ? (
        <span
          aria-hidden="true"
          className={cn(
            'pointer-events-none absolute -inset-x-4 -inset-y-3 -z-10 rounded-2xl bg-primary/10 [opacity:var(--kaur-khor-attention-progress,0)] ring-1 ring-primary/20 [will-change:opacity] motion-safe:animate-[kaur-khor-attention-flash_1800ms_ease-in-out_1] motion-reduce:opacity-100',
            overlayClassName,
          )}
          data-testid={overlayTestId}
        />
      ) : null}
      {children}
    </div>
  );
}
