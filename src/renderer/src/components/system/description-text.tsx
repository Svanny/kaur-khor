import { createContext, useContext, type ElementType, type HTMLAttributes, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

const OptionalHelpVisibilityContext = createContext(true);

type DescriptionTextProps = HTMLAttributes<HTMLElement> & {
  as?: ElementType;
  children?: ReactNode;
  optional?: boolean;
};

export function DescriptionTextVisibilityProvider({
  children,
  visible,
}: {
  children: ReactNode;
  visible: boolean;
}) {
  return (
    <OptionalHelpVisibilityContext.Provider value={visible}>
      {children}
    </OptionalHelpVisibilityContext.Provider>
  );
}

export function useDescriptionTextVisible() {
  return useContext(OptionalHelpVisibilityContext);
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
  optional = true,
  ...props
}: DescriptionTextProps) {
  const visible = useDescriptionTextVisible();

  if (!hasDescriptionText(children, optional ? visible : true)) {
    return null;
  }

  return (
    <Component className={cn(className)} {...props}>
      {children}
    </Component>
  );
}

export const OptionalHelpVisibilityProvider = DescriptionTextVisibilityProvider;
export const OptionalHelpText = DescriptionText;
export const hasOptionalHelpText = hasDescriptionText;
export const useOptionalHelpVisible = useDescriptionTextVisible;
