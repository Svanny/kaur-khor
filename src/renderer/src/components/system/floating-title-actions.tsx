import { useCallback, useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

export const headerActionSurfaceClassName =
  '[&_[data-slot=button]]:!h-12 [&_[data-slot=button]]:!rounded-full [&_[data-slot=button]]:!px-4 [&_[data-slot=button]]:[&_svg]:!size-4 [&_[data-slot=toggle-group-item]]:!h-12 [&_[data-slot=toggle-group-item]]:!min-w-12 [&_[data-slot=toggle-group-item]]:!rounded-full [&_[data-slot=toggle-group-item]]:!px-4 [&_[data-slot=toggle-group-item]]:[&_svg]:!size-4';

export function useFloatingTitleActions(enabled: boolean) {
  const [anchorElement, setAnchorElement] = useState<HTMLElement | null>(null);
  const [visible, setVisible] = useState(false);

  const anchorRef = useCallback((node: HTMLElement | null) => {
    setAnchorElement(node);
  }, []);

  useEffect(() => {
    if (!enabled || !anchorElement) {
      setVisible(false);
      return;
    }

    const updateVisibility = () => {
      setVisible(anchorElement.getBoundingClientRect().bottom <= 0);
    };

    updateVisibility();
    window.addEventListener('scroll', updateVisibility, { passive: true });
    window.addEventListener('resize', updateVisibility);

    const resizeObserver = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(updateVisibility) : null;
    resizeObserver?.observe(anchorElement);

    return () => {
      window.removeEventListener('scroll', updateVisibility);
      window.removeEventListener('resize', updateVisibility);
      resizeObserver?.disconnect();
    };
  }, [anchorElement, enabled]);

  return {
    anchorRef,
    visible,
  };
}

export function useObservedFloatingIslandWidth({
  enabled,
  selector,
}: {
  enabled: boolean;
  selector: string;
}) {
  const [width, setWidth] = useState(0);

  useEffect(() => {
    if (!enabled) {
      setWidth(0);
      return;
    }

    let observedElement: HTMLElement | null = null;
    let resizeObserver: ResizeObserver | null = null;

    const updateWidth = () => {
      const nextElement = document.querySelector<HTMLElement>(selector);
      if (nextElement !== observedElement) {
        resizeObserver?.disconnect();
        observedElement = nextElement;
        if (observedElement && typeof ResizeObserver !== 'undefined') {
          resizeObserver = new ResizeObserver(updateWidth);
          resizeObserver.observe(observedElement);
        } else {
          resizeObserver = null;
        }
      }
      setWidth(observedElement?.getBoundingClientRect().width ?? 0);
    };

    updateWidth();
    window.addEventListener('resize', updateWidth);
    window.addEventListener('scroll', updateWidth, { passive: true });

    return () => {
      window.removeEventListener('resize', updateWidth);
      window.removeEventListener('scroll', updateWidth);
      resizeObserver?.disconnect();
    };
  }, [enabled, selector]);

  return width;
}

export function FloatingActionsIsland({
  actions,
  className,
  slot = 'floating-title-actions',
  style,
  visible,
}: {
  actions?: ReactNode;
  className?: string;
  slot?: string;
  style?: CSSProperties;
  visible: boolean;
}) {
  if (!visible || !actions) {
    return null;
  }

  return (
    <div
      className={cn(
        'fixed right-4 bottom-4 z-40 max-w-[calc(100vw-2rem)] md:right-6 md:bottom-6',
        className,
      )}
      data-slot={slot}
      style={style}
    >
      <div className="editorial-panel rounded-[1.5rem] border-white/70 bg-background/92 p-2 shadow-[var(--shadow-float)] backdrop-blur-[10px]">
        <div className={cn('flex max-w-full flex-wrap items-center justify-end gap-2', headerActionSurfaceClassName)}>
          {actions}
        </div>
      </div>
    </div>
  );
}

export function FloatingTitleActionsIsland(props: {
  actions?: ReactNode;
  className?: string;
  visible: boolean;
}) {
  return <FloatingActionsIsland {...props} />;
}
