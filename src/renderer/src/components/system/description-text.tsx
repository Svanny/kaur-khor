import type { ElementType, HTMLAttributes, ReactNode } from 'react';
import { cn } from '@/lib/utils';

export const SHOW_DESCRIPTION_TEXT = false;

type DescriptionTextProps = HTMLAttributes<HTMLElement> & {
  as?: ElementType;
  children?: ReactNode;
};

export function hasDescriptionText(content: ReactNode) {
  if (!SHOW_DESCRIPTION_TEXT) {
    return false;
  }

  if (content == null || content === false) {
    return false;
  }

  if (typeof content === 'string') {
    return content.trim().length > 0;
  }

  return true;
}

export function DescriptionText({
  as: Component = 'p',
  children,
  className,
  ...props
}: DescriptionTextProps) {
  if (!hasDescriptionText(children)) {
    return null;
  }

  return (
    <Component className={cn(className)} {...props}>
      {children}
    </Component>
  );
}
