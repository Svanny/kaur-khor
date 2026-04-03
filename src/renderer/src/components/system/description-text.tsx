import { createContext, useContext, type ElementType, type HTMLAttributes, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

const DescriptionTextVisibilityContext = createContext(true);

type DescriptionTextProps = HTMLAttributes<HTMLElement> & {
  as?: ElementType;
  children?: ReactNode;
};

export function DescriptionTextVisibilityProvider({
  children,
  visible,
}: {
  children: ReactNode;
  visible: boolean;
}) {
  return (
    <DescriptionTextVisibilityContext.Provider value={visible}>
      {children}
    </DescriptionTextVisibilityContext.Provider>
  );
}

export function useDescriptionTextVisible() {
  return useContext(DescriptionTextVisibilityContext);
}

export function hasDescriptionText(content: ReactNode, visible = true) {
  if (!visible) {
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
  const visible = useDescriptionTextVisible();

  if (!hasDescriptionText(children, visible)) {
    return null;
  }

  return (
    <Component className={cn(className)} {...props}>
      {children}
    </Component>
  );
}
