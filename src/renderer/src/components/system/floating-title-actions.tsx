import { useCallback, useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import { compactActionSurfaceClassName } from '@/components/system/compact-controls';
import { cn } from '@/lib/utils';

export const headerActionSurfaceClassName = compactActionSurfaceClassName;

function cancelScheduledFrame(frameId: number | null) {
  if (frameId != null) {
    window.cancelAnimationFrame(frameId);
  }
}

export function useFloatingTitleActions(enabled: boolean) {
  const [anchorElement, setAnchorElement] = useState<HTMLElement | null>(null);
  const [visible, setVisible] = useState(false);

  const anchorRef = useCallback((node: HTMLElement | null) => {
    setAnchorElement((current) => (current === node ? current : node));
  }, []);

  useEffect(() => {
    if (!enabled || !anchorElement) {
      setVisible(false);
      return;
    }

    let frameId: number | null = null;

    const updateVisibility = () => {
      frameId = null;
      const nextVisible = anchorElement.getBoundingClientRect().bottom <= 0;
      setVisible((current) => (current === nextVisible ? current : nextVisible));
    };

    const scheduleVisibilityUpdate = () => {
      if (frameId != null) {
        return;
      }
      frameId = window.requestAnimationFrame(updateVisibility);
    };

    updateVisibility();
    window.addEventListener('scroll', scheduleVisibilityUpdate, { passive: true });
    window.addEventListener('resize', scheduleVisibilityUpdate);
    document.addEventListener('scroll', scheduleVisibilityUpdate, { capture: true, passive: true });

    return () => {
      cancelScheduledFrame(frameId);
      window.removeEventListener('scroll', scheduleVisibilityUpdate);
      window.removeEventListener('resize', scheduleVisibilityUpdate);
      document.removeEventListener('scroll', scheduleVisibilityUpdate, true);
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
    let frameId: number | null = null;

    const updateWidth = () => {
      frameId = null;
      const nextElement = document.querySelector<HTMLElement>(selector);
      if (nextElement !== observedElement) {
        resizeObserver?.disconnect();
        observedElement = nextElement;
        if (observedElement && typeof ResizeObserver !== 'undefined') {
          resizeObserver = new ResizeObserver(scheduleWidthUpdate);
          resizeObserver.observe(observedElement);
        } else {
          resizeObserver = null;
        }
      }
      setWidth(observedElement?.getBoundingClientRect().width ?? 0);
    };

    const scheduleWidthUpdate = () => {
      if (frameId != null) {
        return;
      }
      frameId = window.requestAnimationFrame(updateWidth);
    };

    updateWidth();
    window.addEventListener('resize', scheduleWidthUpdate);
    window.addEventListener('scroll', scheduleWidthUpdate, { passive: true });

    return () => {
      cancelScheduledFrame(frameId);
      window.removeEventListener('resize', scheduleWidthUpdate);
      window.removeEventListener('scroll', scheduleWidthUpdate);
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
