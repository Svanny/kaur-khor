import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import { deriveResponsiveViewportPolicy, isPhonePortraitViewport } from '@shared/responsive-zoom';
import { cn } from '@/lib/utils';

export const EMBEDDED_VIEWPORT_CHANGE_EVENT = 'kaur-khor:embedded-viewport-change';

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
  const [viewportSize, setViewportSize] = useState(readViewportSize);
  const [previousLevel, setPreviousLevel] = useState<number | null>(null);
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
    const update = () => {
      setViewportSize(readViewportSize());
    };
    window.addEventListener('resize', update);
    window.addEventListener('orientationchange', update);
    window.visualViewport?.addEventListener('resize', update);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('orientationchange', update);
      window.visualViewport?.removeEventListener('resize', update);
    };
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    root.dataset.kaurKhorEffectiveViewportWidth = String(Math.round(policy.effectiveWidth));
    root.dataset.kaurKhorEffectiveViewportHeight = String(Math.round(policy.effectiveHeight));
    root.style.setProperty('--kaur-khor-effective-viewport-width', `${policy.effectiveWidth}px`);
    root.style.setProperty('--kaur-khor-effective-viewport-height', `${policy.effectiveHeight}px`);
    root.dispatchEvent(new CustomEvent(EMBEDDED_VIEWPORT_CHANGE_EVENT));
    return () => {
      delete root.dataset.kaurKhorEffectiveViewportWidth;
      delete root.dataset.kaurKhorEffectiveViewportHeight;
      root.style.removeProperty('--kaur-khor-effective-viewport-width');
      root.style.removeProperty('--kaur-khor-effective-viewport-height');
      root.dispatchEvent(new CustomEvent(EMBEDDED_VIEWPORT_CHANGE_EVENT));
    };
  }, [policy.effectiveHeight, policy.effectiveWidth]);

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

  return (
    <div
      className={cn(
        'bg-background',
        policy.phoneLandscape ? 'relative h-svh w-screen overflow-hidden' : 'min-h-svh overflow-auto',
      )}
      data-phone-landscape={policy.phoneLandscape ? 'true' : 'false'}
      data-slot="embedded-auto-zoom-viewport"
      data-effective-height={Math.round(policy.effectiveHeight)}
      data-effective-width={Math.round(policy.effectiveWidth)}
      data-measured-area={Math.round(policy.measuredArea)}
      data-zoom-level={policy.zoomLevel}
      style={{
        '--kaur-khor-embedded-measured-height': `${policy.measuredHeight}px`,
        '--kaur-khor-embedded-measured-width': `${policy.measuredWidth}px`,
      } as CSSProperties}
    >
      {policy.phoneLandscape ? (
        <div
          data-slot="embedded-landscape-frame"
          style={{
            height: `${policy.measuredHeight}px`,
            transform: 'rotate(90deg) translateY(-100%)',
            transformOrigin: 'top left',
            width: `${policy.measuredWidth}px`,
          }}
        >
          <div data-slot="embedded-auto-zoom-surface" style={surfaceStyle}>
            {children}
          </div>
        </div>
      ) : (
        <div data-slot="embedded-auto-zoom-surface" style={surfaceStyle}>
          {children}
        </div>
      )}
    </div>
  );
}
