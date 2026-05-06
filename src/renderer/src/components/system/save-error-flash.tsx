import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from '@/lib/utils';

type SaveErrorFlashElement = 'div' | 'p' | 'span';

export function SaveErrorFlash({
  as,
  children,
  className,
  flashKey = 0,
  ...props
}: {
  as?: SaveErrorFlashElement;
  children: ReactNode;
  flashKey?: number;
} & HTMLAttributes<HTMLElement>) {
  const Component = as ?? 'span';
  const active = flashKey > 0;

  return (
    <Component
      key={active ? flashKey : 'idle'}
      className={cn(
        active && 'motion-safe:animate-[kaur-khor-save-error-flash_1800ms_ease-in-out_1]',
        className,
      )}
      data-error-flash-key={active ? String(flashKey) : undefined}
      {...props}
    >
      {children}
    </Component>
  );
}
