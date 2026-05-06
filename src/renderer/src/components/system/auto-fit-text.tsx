import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type HTMLAttributes, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

function isTextClipped(element: HTMLElement) {
  const widthOverflow = element.scrollWidth - element.clientWidth;
  const heightOverflow = element.scrollHeight - element.clientHeight;
  if (widthOverflow > 1 || heightOverflow > 1) {
    return true;
  }

  const parent = element.parentElement;
  if (!parent) {
    return false;
  }

  const elementRect = element.getBoundingClientRect();
  const parentRect = parent.getBoundingClientRect();
  return (
    elementRect.left < parentRect.left - 1 ||
    elementRect.top < parentRect.top - 1 ||
    elementRect.right > parentRect.right + 1 ||
    elementRect.bottom > parentRect.bottom + 1
  );
}

function useAutoFitElementFontSize<T extends HTMLElement>({
  maxFontSizePx,
  minFontSizePx,
  stepPx = 1,
}: {
  maxFontSizePx?: number;
  minFontSizePx: number;
  stepPx?: number;
}) {
  const ref = useRef<T | null>(null);
  const baseFontSizeRef = useRef<number | null>(maxFontSizePx ?? null);
  const mountedRef = useRef(false);
  const [fontSizePx, setFontSizePx] = useState<number | null>(maxFontSizePx ?? null);
  const [measureVersion, setMeasureVersion] = useState(0);

  useEffect(() => {
    if (!mountedRef.current) {
      mountedRef.current = true;
      return;
    }
    baseFontSizeRef.current = maxFontSizePx ?? null;
    setFontSizePx(maxFontSizePx ?? null);
  }, [maxFontSizePx, measureVersion]);

  useEffect(() => {
    const element = ref.current;
    const parent = element?.parentElement;
    if (!parent || typeof ResizeObserver === 'undefined') {
      return;
    }

    let frame = 0;
    const handleResize = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        setMeasureVersion((current) => current + 1);
      });
    };

    const observer = new ResizeObserver(handleResize);
    observer.observe(parent);

    const fontSet = document.fonts;
    const handleWindowResize = () => handleResize();
    window.addEventListener('resize', handleWindowResize);
    fontSet?.ready.then(handleResize).catch(() => {});
    fontSet?.addEventListener?.('loadingdone', handleResize);

    return () => {
      window.cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener('resize', handleWindowResize);
      fontSet?.removeEventListener?.('loadingdone', handleResize);
    };
  }, []);

  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) {
      return;
    }

    const baseFontSize =
      maxFontSizePx ?? baseFontSizeRef.current ?? Number.parseFloat(window.getComputedStyle(element).fontSize);
    if (!Number.isFinite(baseFontSize)) {
      return;
    }
    baseFontSizeRef.current = baseFontSize;

    let low = minFontSizePx;
    let high = Math.max(minFontSizePx, Math.floor(baseFontSize));
    let best = low;

    while (low <= high) {
      const middle = low + Math.floor((high - low) / 2);
      element.style.fontSize = `${middle}px`;

      if (isTextClipped(element)) {
        high = middle - stepPx;
      } else {
        best = middle;
        low = middle + stepPx;
      }
    }

    if (fontSizePx !== best) {
      setFontSizePx(best);
    }
  }, [fontSizePx, maxFontSizePx, measureVersion, minFontSizePx, stepPx]);

  return { fontSizePx, ref, setMeasureVersion } as const;
}

export function AutoFitText({
  as: Component = 'span',
  children,
  className,
  maxFontSizePx,
  minFontSizePx,
  stepPx = 1,
  style,
}: {
  as?: 'div' | 'p' | 'span';
  children: ReactNode;
  className?: string;
  maxFontSizePx?: number;
  minFontSizePx: number;
  stepPx?: number;
  style?: CSSProperties;
}) {
  const { fontSizePx, ref, setMeasureVersion } = useAutoFitElementFontSize<HTMLElement>({
    maxFontSizePx,
    minFontSizePx,
    stepPx,
  });

  useEffect(() => {
    setMeasureVersion((current) => current + 1);
  }, [children, maxFontSizePx, setMeasureVersion]);

  return (
    <Component
      ref={ref as never}
      className={cn('block min-w-0 max-w-full overflow-hidden', className)}
      data-slot="auto-fit-text"
      style={{
        ...style,
        ...(fontSizePx == null ? null : { fontSize: `${fontSizePx}px` }),
      }}
    >
      {children}
    </Component>
  );
}

export function AutoFitContainer({
  children,
  className,
  maxFontSizePx,
  minFontSizePx,
  stepPx = 1,
  style,
  ...props
}: {
  children: ReactNode;
  className?: string;
  maxFontSizePx?: number;
  minFontSizePx: number;
  stepPx?: number;
  style?: CSSProperties;
} & HTMLAttributes<HTMLDivElement>) {
  const { fontSizePx, ref, setMeasureVersion } = useAutoFitElementFontSize<HTMLDivElement>({
    maxFontSizePx,
    minFontSizePx,
    stepPx,
  });

  useEffect(() => {
    setMeasureVersion((current) => current + 1);
  }, [children, maxFontSizePx, setMeasureVersion]);

  return (
    <div
      ref={ref}
      className={cn('block min-w-0 max-w-full', className)}
      data-slot="auto-fit-container"
      {...props}
      style={{
        ...style,
        ...(fontSizePx == null ? null : { fontSize: `${fontSizePx}px` }),
      }}
    >
      {children}
    </div>
  );
}
