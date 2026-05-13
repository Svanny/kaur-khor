import type { ComponentPropsWithRef, ComponentPropsWithoutRef, ReactNode } from 'react';
import { cn } from '@/lib/utils';

type SaveErrorFlashElement = 'div' | 'p' | 'span';
type SaveErrorFlashProps<TElement extends SaveErrorFlashElement = 'span'> = {
  as?: TElement;
  children: ReactNode;
  flashKey?: number;
  ref?: ComponentPropsWithRef<TElement>['ref'];
} & Omit<ComponentPropsWithoutRef<TElement>, 'children'>;

export function SaveErrorFlash<TElement extends SaveErrorFlashElement = 'span'>({
  as,
  children,
  className,
  flashKey = 0,
  ref,
  ...props
}: SaveErrorFlashProps<TElement>) {
  const Component = as ?? 'span';
  const active = flashKey > 0;
  const flashClassName = cn(
    active && 'motion-safe:animate-[kaur-khor-save-error-flash_1800ms_ease-in-out_1]',
    className,
  );
  const flashKeyValue = active ? String(flashKey) : undefined;

  if (Component === 'div') {
    return (
      <div
        key={active ? flashKey : 'idle'}
        ref={ref as ComponentPropsWithRef<'div'>['ref']}
        className={flashClassName}
        data-error-flash-key={flashKeyValue}
        {...(props as ComponentPropsWithoutRef<'div'>)}
      >
        {children}
      </div>
    );
  }

  if (Component === 'p') {
    return (
      <p
        key={active ? flashKey : 'idle'}
        ref={ref as ComponentPropsWithRef<'p'>['ref']}
        className={flashClassName}
        data-error-flash-key={flashKeyValue}
        {...(props as ComponentPropsWithoutRef<'p'>)}
      >
        {children}
      </p>
    );
  }

  return (
    <span
      key={active ? flashKey : 'idle'}
      ref={ref as ComponentPropsWithRef<'span'>['ref']}
      className={flashClassName}
      data-error-flash-key={flashKeyValue}
      {...(props as ComponentPropsWithoutRef<'span'>)}
    >
      {children}
    </span>
  );
}
