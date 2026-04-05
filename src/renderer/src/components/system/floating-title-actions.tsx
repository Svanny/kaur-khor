import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

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

export function FloatingTitleActionsIsland({
  actions,
  className,
  visible,
}: {
  actions?: ReactNode;
  className?: string;
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
      data-slot="floating-title-actions"
    >
      <div className="editorial-panel rounded-[1.5rem] border-white/70 bg-background/92 p-2 shadow-[var(--shadow-float)] backdrop-blur-[10px]">
        <div className="flex max-w-full flex-wrap items-center justify-end gap-2">
          {actions}
        </div>
      </div>
    </div>
  );
}
