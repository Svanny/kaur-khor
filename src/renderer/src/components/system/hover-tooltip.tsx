import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

type TooltipInteractionMode = 'pointer' | 'focus' | 'click' | null;

interface HoverTooltipProps {
  ariaLabel?: string;
  children: ReactNode | ((state: { open: boolean }) => ReactNode);
  className?: string;
  content: ReactNode;
  side?: React.ComponentProps<typeof TooltipContent>['side'];
  sideOffset?: number;
  tooltipClassName?: string;
}

export function HoverTooltip({
  ariaLabel,
  children,
  className,
  content,
  side = 'top',
  sideOffset = 8,
  tooltipClassName,
}: HoverTooltipProps) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<TooltipInteractionMode>(null);
  const [suppressed, setSuppressed] = useState(false);
  const closeTimerRef = useRef<number | null>(null);
  const openRef = useRef(open);
  const modeRef = useRef(mode);
  const suppressedRef = useRef(suppressed);

  const triggerContent = typeof children === 'function' ? children({ open }) : children;

  function syncState(nextOpen: boolean, nextMode: TooltipInteractionMode) {
    openRef.current = nextOpen;
    modeRef.current = nextMode;
    setOpen(nextOpen);
    setMode(nextMode);
  }

  function syncSuppressed(nextSuppressed: boolean) {
    suppressedRef.current = nextSuppressed;
    setSuppressed(nextSuppressed);
  }

  function clearCloseTimer() {
    if (closeTimerRef.current !== null) {
      window.clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  }

  function schedulePointerClose() {
    clearCloseTimer();
    closeTimerRef.current = window.setTimeout(() => {
      if (modeRef.current === 'pointer' && openRef.current) {
        syncState(false, null);
      }
    }, 120);
  }

  useEffect(() => () => clearCloseTimer(), []);

  return (
    <TooltipProvider>
      <Tooltip open={open}>
        <TooltipTrigger asChild>
          <button
            aria-expanded={open}
            aria-label={ariaLabel}
            className={cn('focus-visible:outline-none', className)}
            onBlur={() => {
              clearCloseTimer();
              if (suppressedRef.current) {
                syncSuppressed(false);
              }
              if (modeRef.current === 'focus' && openRef.current) {
                syncState(false, null);
              }
            }}
            onClick={() => {
              clearCloseTimer();
              if (openRef.current) {
                syncState(false, null);
                syncSuppressed(true);
                return;
              }

              syncSuppressed(false);
              syncState(true, 'click');
            }}
            onFocus={() => {
              clearCloseTimer();
              if (suppressedRef.current || modeRef.current === 'click') {
                return;
              }

              syncState(true, 'focus');
            }}
            onKeyDown={(event) => {
              if (event.key === 'Escape' && openRef.current) {
                clearCloseTimer();
                syncState(false, null);
                syncSuppressed(false);
                event.currentTarget.blur();
              }
            }}
            onPointerEnter={() => {
              clearCloseTimer();
              if (suppressedRef.current || modeRef.current === 'click') {
                return;
              }

              syncState(true, 'pointer');
            }}
            onPointerLeave={() => {
              if (suppressedRef.current) {
                syncSuppressed(false);
                return;
              }
              if (modeRef.current === 'pointer' && openRef.current) {
                schedulePointerClose();
              }
            }}
            type="button"
          >
            {triggerContent}
          </button>
        </TooltipTrigger>
        <TooltipContent
          className={cn('max-w-56 leading-5', tooltipClassName)}
          onPointerEnter={() => {
            if (modeRef.current === 'pointer') {
              clearCloseTimer();
            }
          }}
          onPointerLeave={() => {
            if (modeRef.current === 'pointer' && openRef.current) {
              schedulePointerClose();
            }
          }}
          side={side}
          sideOffset={sideOffset}
        >
          {content}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
