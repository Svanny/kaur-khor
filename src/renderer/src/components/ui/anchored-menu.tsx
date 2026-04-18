import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

type HorizontalAlign = 'left' | 'right';

export function AnchoredMenu({
  children,
  className,
  label,
  triggerIcon,
  triggerClassName,
  triggerSize = 'icon-sm',
  align = 'right',
}: {
  children: (closeMenu: () => void) => ReactNode;
  className?: string;
  label?: string;
  triggerIcon: ReactNode;
  triggerClassName?: string;
  triggerSize?: React.ComponentProps<typeof Button>['size'];
  align?: HorizontalAlign;
}) {
  const [open, setOpen] = useState(false);
  const [anchorRect, setAnchorRect] = useState<DOMRect | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) {
      return;
    }

    function updatePosition() {
      if (triggerRef.current) {
        setAnchorRect(triggerRef.current.getBoundingClientRect());
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
              top: anchorRect.bottom + 8,
              left: align === 'right' ? anchorRect.right : anchorRect.left,
              transform: align === 'right' ? 'translateX(-100%)' : undefined,
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
