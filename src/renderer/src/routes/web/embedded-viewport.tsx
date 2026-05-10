import { createContext, useContext, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { deriveResponsiveViewportPolicy, isPhonePortraitViewport } from '@shared/responsive-zoom';
import { cn } from '@/lib/utils';

export const EMBEDDED_VIEWPORT_CHANGE_EVENT = 'kaur-khor:embedded-viewport-change';

const EmbeddedPhonePortraitViewportContext = createContext<boolean | null>(null);

type ScrollAreaSize = {
  minHeight: number;
  surfaceHeight: number;
  surfaceWidth: number;
  width: number;
};

function readViewportSize() {
  const visualViewport = window.visualViewport;
  const documentElement = document.documentElement;
  const visibleWidth = visualViewport?.width ?? Number.POSITIVE_INFINITY;
  const visibleHeight = visualViewport?.height ?? Number.POSITIVE_INFINITY;
  const innerWidth = window.innerWidth || Number.POSITIVE_INFINITY;
  const innerHeight = window.innerHeight || Number.POSITIVE_INFINITY;
  const clientWidth = documentElement?.clientWidth || Number.POSITIVE_INFINITY;
  const clientHeight = documentElement?.clientHeight || Number.POSITIVE_INFINITY;

  return {
    height: Math.max(0, Math.round(Math.min(visibleHeight, innerHeight, clientHeight))),
    width: Math.max(0, Math.round(Math.min(visibleWidth, innerWidth, clientWidth))),
  };
}

function supportsCssZoom() {
  return typeof CSS !== 'undefined' && CSS.supports?.('zoom', '1') === true;
}

export function useEmbeddedPhonePortraitViewport() {
  const contextValue = useContext(EmbeddedPhonePortraitViewportContext);
  const [isPhonePortrait, setIsPhonePortrait] = useState(() => {
    if (typeof document === 'undefined') {
      return false;
    }
    return document.documentElement.dataset.kaurKhorEmbeddedPhonePortrait === 'true';
  });

  useEffect(() => {
    const readPhonePortraitState = () => {
      setIsPhonePortrait(document.documentElement.dataset.kaurKhorEmbeddedPhonePortrait === 'true');
    };

    readPhonePortraitState();
    document.documentElement.addEventListener(EMBEDDED_VIEWPORT_CHANGE_EVENT, readPhonePortraitState);
    return () => {
      document.documentElement.removeEventListener(EMBEDDED_VIEWPORT_CHANGE_EVENT, readPhonePortraitState);
    };
  }, []);

  return contextValue ?? isPhonePortrait;
}

export function EmbeddedAutoZoomViewport({
  children,
  enablePhoneLandscapeWorkaround = false,
  phoneLandscapeOverlay,
}: {
  children: ReactNode;
  enablePhoneLandscapeWorkaround?: boolean;
  phoneLandscapeOverlay?: ReactNode;
}) {
  const scrollRootRef = useRef<HTMLDivElement | null>(null);
  const landscapeSpacerRef = useRef<HTMLDivElement | null>(null);
  const landscapeSurfaceRef = useRef<HTMLDivElement | null>(null);
  const [viewportSize, setViewportSize] = useState(readViewportSize);
  const [previousLevel, setPreviousLevel] = useState<number | null>(null);
  const [landscapeScrollArea, setLandscapeScrollArea] = useState<ScrollAreaSize | null>(null);
  const cssZoomSupported = supportsCssZoom();
  const phonePortrait = isPhonePortraitViewport(viewportSize.width, viewportSize.height);
  const phoneLandscape = enablePhoneLandscapeWorkaround && phonePortrait;
  const phonePortraitNative = phonePortrait && !enablePhoneLandscapeWorkaround;
  const policyViewportSize = phonePortrait && !enablePhoneLandscapeWorkaround
    ? viewportSize
    : viewportSize;
  const policy = useMemo(
    () => {
      if (phonePortraitNative) {
        return {
          constraintLevels: {
            areaLevel: 0,
            heightLevel: 0,
            widthLevel: 0,
          },
          effectiveHeight: policyViewportSize.height,
          effectiveWidth: policyViewportSize.width,
          measuredArea: policyViewportSize.width * policyViewportSize.height,
          measuredHeight: policyViewportSize.height,
          measuredWidth: policyViewportSize.width,
          phoneLandscape: false,
          phoneLandscapeSidePadding: 0,
          phoneViewport: true,
          scale: 1,
          zoomLevel: 0,
        } as const;
      }

      return deriveResponsiveViewportPolicy({
        height: policyViewportSize.height,
        previousLevel,
        width: policyViewportSize.width,
      });
    },
    [phonePortraitNative, policyViewportSize.height, policyViewportSize.width, previousLevel],
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
    root.dataset.kaurKhorEmbeddedPhoneLandscape = policy.phoneViewport && !phonePortraitNative ? 'true' : 'false';
    root.dataset.kaurKhorEmbeddedPhonePortrait = phonePortraitNative ? 'true' : 'false';
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
      delete root.dataset.kaurKhorEmbeddedPhonePortrait;
      delete root.dataset.kaurKhorEffectiveViewportWidth;
      delete root.dataset.kaurKhorEffectiveViewportHeight;
      root.style.removeProperty('--kaur-khor-embedded-scale');
      root.style.removeProperty('--kaur-khor-embedded-measured-width');
      root.style.removeProperty('--kaur-khor-embedded-measured-height');
      root.style.removeProperty('--kaur-khor-effective-viewport-width');
      root.style.removeProperty('--kaur-khor-effective-viewport-height');
      root.dispatchEvent(new CustomEvent(EMBEDDED_VIEWPORT_CHANGE_EVENT));
    };
  }, [
    policy.effectiveHeight,
    policy.effectiveWidth,
    policy.measuredHeight,
    policy.measuredWidth,
    policy.phoneViewport,
    policy.scale,
    phonePortraitNative,
  ]);

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
        const nextArea = {
          minHeight: baseArea.minHeight,
          surfaceHeight: baseArea.surfaceHeight,
          surfaceWidth: baseArea.surfaceWidth,
          width: baseArea.width,
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
  }, [policy.effectiveHeight, policy.effectiveWidth, policy.measuredHeight, policy.measuredWidth, policy.phoneLandscape, policy.phoneLandscapeSidePadding]);

  const useTransformScale = policy.phoneViewport || !cssZoomSupported;
  const surfaceStyle = {
    '--kaur-khor-embedded-effective-height': `${policy.effectiveHeight}px`,
    '--kaur-khor-embedded-effective-width': `${policy.effectiveWidth}px`,
    '--kaur-khor-embedded-scale': String(policy.scale),
    minHeight: `${policy.effectiveHeight}px`,
    transform: useTransformScale ? `scale(${policy.scale})` : undefined,
    transformOrigin: 'top left',
    width: `${policy.effectiveWidth}px`,
    zoom: useTransformScale ? undefined : policy.scale,
  } as CSSProperties;
  const measuredViewportStyle = {
    height: `${policy.measuredHeight}px`,
    width: `${policy.measuredWidth}px`,
  } as CSSProperties;
  const nativePhoneFrameStyle = policy.phoneViewport && !policy.phoneLandscape && policy.phoneLandscapeSidePadding > 0
    ? {
        height: `${policy.measuredHeight}px`,
        width: `${policy.measuredWidth + policy.phoneLandscapeSidePadding * 2}px`,
      } as CSSProperties
    : null;
  const nativePhoneWindowStyle = nativePhoneFrameStyle
    ? {
        ...measuredViewportStyle,
        left: `${policy.phoneLandscapeSidePadding}px`,
        position: 'absolute',
        top: 0,
      } as CSSProperties
    : measuredViewportStyle;
  const embeddedShellContentHeight = policy.phoneLandscape
    ? (landscapeScrollArea?.width ?? policy.measuredHeight) / policy.scale
    : policy.effectiveHeight;
  const embeddedShellContentWidth = policy.phoneLandscape
    ? (landscapeScrollArea?.surfaceWidth ?? policy.effectiveWidth)
    : policy.effectiveWidth;
  const rotatedViewportStyle = {
    minHeight: `${landscapeScrollArea?.minHeight ?? policy.measuredWidth}px`,
    width: `${landscapeScrollArea?.width ?? policy.measuredHeight}px`,
  } as CSSProperties;
  const content = (
    <EmbeddedPhonePortraitViewportContext.Provider value={phonePortraitNative}>
      {children}
    </EmbeddedPhonePortraitViewportContext.Provider>
  );

  return (
    <div
      ref={scrollRootRef}
      className={cn(
        'bg-background',
        phonePortraitNative
          ? 'relative min-h-svh w-screen overflow-auto'
          : policy.phoneViewport
          ? policy.phoneLandscape
            ? 'relative h-svh w-screen overflow-hidden'
            : 'relative h-svh overflow-hidden'
          : 'h-svh overflow-auto',
      )}
      data-phone-landscape={policy.phoneViewport && !phonePortraitNative ? 'true' : 'false'}
      data-phone-portrait={phonePortraitNative ? 'true' : 'false'}
      data-slot="embedded-auto-zoom-viewport"
      data-effective-height={Math.round(policy.effectiveHeight)}
      data-effective-width={Math.round(policy.effectiveWidth)}
      data-measured-area={Math.round(policy.measuredArea)}
      data-zoom-level={policy.zoomLevel}
      style={{
        '--kaur-khor-embedded-measured-height': `${policy.measuredHeight}px`,
        '--kaur-khor-embedded-measured-width': `${policy.measuredWidth}px`,
        '--kaur-khor-embedded-phone-side-padding': `${policy.phoneLandscapeSidePadding}px`,
        '--kaur-khor-embedded-shell-content-height': `${embeddedShellContentHeight}px`,
        '--kaur-khor-embedded-shell-content-width': `${embeddedShellContentWidth}px`,
        touchAction: policy.phoneViewport ? 'pan-y' : undefined,
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
              {content}
            </div>
          </div>
        </div>
      ) : (
        nativePhoneFrameStyle ? (
          <div data-slot="embedded-phone-landscape-frame" style={nativePhoneFrameStyle}>
            <div data-slot="embedded-auto-zoom-layout-spacer" style={nativePhoneWindowStyle}>
              <div data-slot="embedded-auto-zoom-surface" style={surfaceStyle}>
                {content}
              </div>
            </div>
          </div>
        ) : (
          <div data-slot="embedded-auto-zoom-layout-spacer" style={measuredViewportStyle}>
            <div data-slot="embedded-auto-zoom-surface" style={surfaceStyle}>
              {content}
            </div>
          </div>
        )
      )}
      {policy.phoneLandscape && phoneLandscapeOverlay ? (
        <div data-slot="embedded-phone-landscape-overlay" className="pointer-events-none fixed inset-0 z-[70]">
          {phoneLandscapeOverlay}
        </div>
      ) : null}
    </div>
  );
}
