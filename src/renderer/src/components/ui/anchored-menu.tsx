import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

type HorizontalAlign = 'left' | 'right';
type MenuPosition = {
  left: number;
  maxHeight: number;
  top: number;
};

export function AnchoredMenu({
  children,
  className,
  label,
  triggerIcon,
  triggerClassName,
  triggerSize = 'icon-sm',
  align = 'right',
  onOpenChange,
}: {
  children: (closeMenu: () => void) => ReactNode;
  className?: string;
  label?: string;
  triggerIcon: ReactNode;
  triggerClassName?: string;
  triggerSize?: React.ComponentProps<typeof Button>['size'];
  align?: HorizontalAlign;
  onOpenChange?: (open: boolean) => void;
}) {
  const [open, setOpen] = useState(false);
  const [anchorRect, setAnchorRect] = useState<DOMRect | null>(null);
  const [menuPosition, setMenuPosition] = useState<MenuPosition | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    onOpenChange?.(open);
  }, [onOpenChange, open]);

  useEffect(() => {
    if (!open) {
      return;
    }

    function updatePosition() {
      if (triggerRef.current) {
        setAnchorRect(triggerRef.current.getBoundingClientRect());
        setMenuPosition(null);
      }
    }

    function handlePointerDown(event: MouseEvent) {
      const target = event.target as Node;
      if (triggerRef.current?.contains(target) || menuRef.current?.contains(target)) {
        return;
      }
      setOpen(false);
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setOpen(false);
      }
    }

    updatePosition();
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleEscape);

    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [open]);

  useLayoutEffect(() => {
    if (!open || !anchorRect || !menuRef.current) {
      return;
    }

    const viewportMargin = 8;
    const triggerGap = 8;
    const menuRect = menuRef.current.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const rightmostLeft = Math.max(viewportMargin, viewportWidth - menuRect.width - viewportMargin);
    const preferredLeft = align === 'right' ? anchorRect.right - menuRect.width : anchorRect.left;
    const left = Math.min(Math.max(preferredLeft, viewportMargin), rightmostLeft);
    const spaceBelow = Math.max(0, viewportHeight - anchorRect.bottom - triggerGap - viewportMargin);
    const spaceAbove = Math.max(0, anchorRect.top - triggerGap - viewportMargin);
    const openAbove = spaceBelow < menuRect.height && spaceAbove > spaceBelow;
    const maxHeight = Math.max(96, openAbove ? spaceAbove : spaceBelow);
    const top = openAbove
      ? Math.max(viewportMargin, anchorRect.top - triggerGap - Math.min(menuRect.height, maxHeight))
      : Math.min(anchorRect.bottom + triggerGap, viewportHeight - viewportMargin - Math.min(menuRect.height, maxHeight));

    setMenuPosition((current) => {
      const next = { left, maxHeight, top };
      return current &&
        Math.abs(current.left - next.left) < 0.5 &&
        Math.abs(current.maxHeight - next.maxHeight) < 0.5 &&
        Math.abs(current.top - next.top) < 0.5
        ? current
        : next;
    });
  }, [align, anchorRect, className, open]);

  const menu =
    open && anchorRect
      ? createPortal(
          <div
            ref={menuRef}
            className={cn(
              'fixed z-[80] min-w-48 rounded-xl border border-border/70 bg-background p-1 shadow-[0_18px_40px_rgba(48,31,20,0.16)]',
              className,
            )}
            role="menu"
            style={{
              left: menuPosition?.left ?? (align === 'right' ? anchorRect.right : anchorRect.left),
              maxHeight: menuPosition?.maxHeight,
              maxWidth: 'calc(100vw - 16px)',
              opacity: menuPosition ? undefined : 0,
              overflowX: 'hidden',
              overflowY: menuPosition ? 'auto' : undefined,
              top: menuPosition?.top ?? anchorRect.bottom + 8,
            }}
          >
            {children(() => setOpen(false))}
          </div>,
          document.body,
        )
      : null;

  return (
    <>
      <Button
        ref={triggerRef}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={label}
        className={triggerClassName}
        size={triggerSize}
        type="button"
        variant="outline"
        onClick={() => setOpen((current) => !current)}
      >
        {triggerIcon}
      </Button>
      {menu}
    </>
  );
}
