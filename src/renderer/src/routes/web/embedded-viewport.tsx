import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode, type TouchEvent, type WheelEvent } from 'react';
import { deriveResponsiveViewportPolicy, isPhonePortraitViewport } from '@shared/responsive-zoom';
import { cn } from '@/lib/utils';

export const EMBEDDED_VIEWPORT_CHANGE_EVENT = 'kaur-khor:embedded-viewport-change';

type ScrollAreaSize = {
  minHeight: number;
  surfaceHeight: number;
  surfaceWidth: number;
  width: number;
};

export function landscapeScrollWidthForContent(baseWidth: number, contentRight: number) {
  const overflow = contentRight - baseWidth;
  return overflow > 2 ? Math.ceil(contentRight + 16) : baseWidth;
}

function readViewportSize() {
  const visualViewport = window.visualViewport;
  return {
    height: Math.max(0, Math.round(visualViewport?.height ?? window.innerHeight ?? 0)),
    width: Math.max(0, Math.round(visualViewport?.width ?? window.innerWidth ?? 0)),
  };
}

function supportsCssZoom() {
  return typeof CSS !== 'undefined' && CSS.supports?.('zoom', '1') === true;
}

export function EmbeddedAutoZoomViewport({ children }: { children: ReactNode }) {
  const scrollRootRef = useRef<HTMLDivElement | null>(null);
  const landscapeSpacerRef = useRef<HTMLDivElement | null>(null);
  const landscapeSurfaceRef = useRef<HTMLDivElement | null>(null);
  const lastTouchPointRef = useRef<{ x: number; y: number } | null>(null);
  const [viewportSize, setViewportSize] = useState(readViewportSize);
  const [previousLevel, setPreviousLevel] = useState<number | null>(null);
  const [landscapeScrollArea, setLandscapeScrollArea] = useState<ScrollAreaSize | null>(null);
  const cssZoomSupported = supportsCssZoom();
  const phoneLandscape = isPhonePortraitViewport(viewportSize.width, viewportSize.height);
  const policy = useMemo(
    () => deriveResponsiveViewportPolicy({
      height: viewportSize.height,
      previousLevel: phoneLandscape ? null : previousLevel,
      width: viewportSize.width,
    }),
    [phoneLandscape, previousLevel, viewportSize.height, viewportSize.width],
  );

  useEffect(() => {
    setPreviousLevel(policy.zoomLevel);
  }, [policy.zoomLevel]);

  useEffect(() => {
    let frameId: number | null = null;
    const update = () => {
      if (frameId != null) {
        window.cancelAnimationFrame(frameId);
      }
      frameId = window.requestAnimationFrame(() => {
        frameId = null;
        setViewportSize(readViewportSize());
      });
    };
    window.addEventListener('resize', update);
    window.addEventListener('orientationchange', update);
    window.visualViewport?.addEventListener('resize', update);
    return () => {
      if (frameId != null) {
        window.cancelAnimationFrame(frameId);
      }
      window.removeEventListener('resize', update);
      window.removeEventListener('orientationchange', update);
      window.visualViewport?.removeEventListener('resize', update);
    };
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    root.dataset.kaurKhorEmbeddedViewport = 'true';
    root.dataset.kaurKhorEmbeddedPhoneLandscape = policy.phoneLandscape ? 'true' : 'false';
    root.dataset.kaurKhorEffectiveViewportWidth = String(Math.round(policy.effectiveWidth));
    root.dataset.kaurKhorEffectiveViewportHeight = String(Math.round(policy.effectiveHeight));
    root.style.setProperty('--kaur-khor-embedded-scale', String(policy.scale));
    root.style.setProperty('--kaur-khor-embedded-measured-width', `${policy.measuredWidth}px`);
    root.style.setProperty('--kaur-khor-embedded-measured-height', `${policy.measuredHeight}px`);
    root.style.setProperty('--kaur-khor-effective-viewport-width', `${policy.effectiveWidth}px`);
    root.style.setProperty('--kaur-khor-effective-viewport-height', `${policy.effectiveHeight}px`);
    root.dispatchEvent(new CustomEvent(EMBEDDED_VIEWPORT_CHANGE_EVENT));
    return () => {
      delete root.dataset.kaurKhorEmbeddedViewport;
      delete root.dataset.kaurKhorEmbeddedPhoneLandscape;
      delete root.dataset.kaurKhorEffectiveViewportWidth;
      delete root.dataset.kaurKhorEffectiveViewportHeight;
      root.style.removeProperty('--kaur-khor-embedded-scale');
      root.style.removeProperty('--kaur-khor-embedded-measured-width');
      root.style.removeProperty('--kaur-khor-embedded-measured-height');
      root.style.removeProperty('--kaur-khor-effective-viewport-width');
      root.style.removeProperty('--kaur-khor-effective-viewport-height');
      root.dispatchEvent(new CustomEvent(EMBEDDED_VIEWPORT_CHANGE_EVENT));
    };
  }, [policy.effectiveHeight, policy.effectiveWidth]);

  useEffect(() => {
    if (!policy.phoneLandscape) {
      setLandscapeScrollArea(null);
      return;
    }

    const root = scrollRootRef.current;
    const surface = landscapeSurfaceRef.current;
    if (!root || !surface) {
      return;
    }

    let frameId: number | null = null;
    const baseArea = {
      minHeight: policy.measuredWidth,
      surfaceHeight: policy.effectiveHeight,
      surfaceWidth: policy.effectiveWidth,
      width: policy.measuredHeight,
    };
    const measure = () => {
      if (frameId != null) {
        window.cancelAnimationFrame(frameId);
      }
      frameId = window.requestAnimationFrame(() => {
        frameId = null;
        const rootRect = root.getBoundingClientRect();
        let contentRight = baseArea.width;
        const visibleElements = [surface, ...Array.from(surface.querySelectorAll<HTMLElement>('*'))];

        for (const element of visibleElements) {
          const rect = element.getBoundingClientRect();
          if (rect.width <= 0 || rect.height <= 0) {
            continue;
          }
          contentRight = Math.max(contentRight, rect.right - rootRect.left + root.scrollLeft);
        }

        const nextArea = {
          minHeight: baseArea.minHeight,
          surfaceHeight: baseArea.surfaceHeight,
          surfaceWidth: Math.ceil(Math.max(baseArea.surfaceWidth, surface.scrollWidth)),
          width: landscapeScrollWidthForContent(baseArea.width, contentRight),
        };
        setLandscapeScrollArea((current) => (
          current?.minHeight === nextArea.minHeight
            && current.surfaceHeight === nextArea.surfaceHeight
            && current.surfaceWidth === nextArea.surfaceWidth
            && current.width === nextArea.width
            ? current
            : nextArea
        ));
      });
    };

    measure();
    const resizeObserver = new ResizeObserver(measure);
    resizeObserver.observe(surface);
    const mutationObserver = new MutationObserver(measure);
    mutationObserver.observe(surface, {
      attributes: true,
      childList: true,
      subtree: true,
    });
    window.addEventListener('load', measure);
    window.addEventListener('resize', measure);
    document.documentElement.addEventListener(EMBEDDED_VIEWPORT_CHANGE_EVENT, measure);
    return () => {
      if (frameId != null) {
        window.cancelAnimationFrame(frameId);
      }
      resizeObserver.disconnect();
      mutationObserver.disconnect();
      window.removeEventListener('load', measure);
      window.removeEventListener('resize', measure);
      document.documentElement.removeEventListener(EMBEDDED_VIEWPORT_CHANGE_EVENT, measure);
    };
  }, [policy.effectiveHeight, policy.effectiveWidth, policy.measuredHeight, policy.measuredWidth, policy.phoneLandscape]);

  const surfaceStyle = {
    '--kaur-khor-embedded-effective-height': `${policy.effectiveHeight}px`,
    '--kaur-khor-embedded-effective-width': `${policy.effectiveWidth}px`,
    '--kaur-khor-embedded-scale': String(policy.scale),
    minHeight: `${policy.effectiveHeight}px`,
    transform: cssZoomSupported ? undefined : `scale(${policy.scale})`,
    transformOrigin: 'top left',
    width: `${policy.effectiveWidth}px`,
    zoom: cssZoomSupported ? policy.scale : undefined,
  } as CSSProperties;
  const measuredViewportStyle = {
    height: `${policy.measuredHeight}px`,
    width: `${policy.measuredWidth}px`,
  } as CSSProperties;
  const embeddedShellContentHeight = policy.phoneLandscape
    ? policy.effectiveHeight
    : policy.effectiveHeight;
  const embeddedShellContentWidth = policy.phoneLandscape
    ? (landscapeScrollArea?.surfaceWidth ?? policy.effectiveWidth)
    : policy.effectiveWidth;
  const rotatedViewportStyle = {
    minHeight: `${landscapeScrollArea?.minHeight ?? policy.measuredWidth}px`,
    width: `${landscapeScrollArea?.width ?? policy.measuredHeight}px`,
  } as CSSProperties;
  const handleWheel = (event: WheelEvent<HTMLDivElement>) => {
    if (!policy.phoneLandscape || event.ctrlKey) {
      return;
    }
    const dominantDelta = Math.abs(event.deltaY) >= Math.abs(event.deltaX) ? event.deltaY : event.deltaX;
    if (dominantDelta === 0) {
      return;
    }
    scrollRootRef.current?.scrollBy({ left: dominantDelta });
  };
  const handleTouchStart = (event: TouchEvent<HTMLDivElement>) => {
    if (!policy.phoneLandscape) {
      return;
    }
    const touch = event.touches[0];
    lastTouchPointRef.current = touch ? { x: touch.clientX, y: touch.clientY } : null;
  };
  const handleTouchMove = (event: TouchEvent<HTMLDivElement>) => {
    if (!policy.phoneLandscape) {
      return;
    }
    const previousTouch = lastTouchPointRef.current;
    const touch = event.touches[0];
    if (!previousTouch || !touch) {
      return;
    }
    const deltaX = previousTouch.x - touch.clientX;
    const deltaY = previousTouch.y - touch.clientY;
    const dominantDelta = Math.abs(deltaY) >= Math.abs(deltaX) ? deltaY : -deltaX;
    if (dominantDelta !== 0) {
      scrollRootRef.current?.scrollBy({ left: dominantDelta });
    }
    lastTouchPointRef.current = { x: touch.clientX, y: touch.clientY };
  };
  const handleTouchEnd = () => {
    lastTouchPointRef.current = null;
  };

  return (
    <div
      ref={scrollRootRef}
      className={cn(
        'bg-background',
        policy.phoneLandscape ? 'relative h-svh w-screen overflow-x-auto overflow-y-hidden' : 'h-svh overflow-auto',
      )}
      data-phone-landscape={policy.phoneLandscape ? 'true' : 'false'}
      data-slot="embedded-auto-zoom-viewport"
      data-effective-height={Math.round(policy.effectiveHeight)}
      data-effective-width={Math.round(policy.effectiveWidth)}
      data-measured-area={Math.round(policy.measuredArea)}
      data-zoom-level={policy.zoomLevel}
      onTouchCancel={handleTouchEnd}
      onTouchEnd={handleTouchEnd}
      onTouchMove={handleTouchMove}
      onTouchStart={handleTouchStart}
      onWheel={handleWheel}
      style={{
        '--kaur-khor-embedded-measured-height': `${policy.measuredHeight}px`,
        '--kaur-khor-embedded-measured-width': `${policy.measuredWidth}px`,
        '--kaur-khor-embedded-shell-content-height': `${embeddedShellContentHeight}px`,
        '--kaur-khor-embedded-shell-content-width': `${embeddedShellContentWidth}px`,
        touchAction: policy.phoneLandscape ? 'none' : undefined,
      } as CSSProperties}
    >
      {policy.phoneLandscape ? (
        <div ref={landscapeSpacerRef} data-slot="embedded-landscape-scroll-spacer" style={rotatedViewportStyle}>
          <div
            data-slot="embedded-landscape-frame"
            style={{
              ...measuredViewportStyle,
              left: 0,
              position: 'absolute',
              top: `${policy.measuredWidth}px`,
              transform: 'rotate(-90deg)',
              transformOrigin: 'top left',
            }}
          >
            <div ref={landscapeSurfaceRef} data-slot="embedded-auto-zoom-surface" style={surfaceStyle}>
              {children}
            </div>
          </div>
        </div>
      ) : (
        <div data-slot="embedded-auto-zoom-layout-spacer" style={measuredViewportStyle}>
          <div data-slot="embedded-auto-zoom-surface" style={surfaceStyle}>
            {children}
          </div>
        </div>
      )}
    </div>
  );
}
