import * as React from "react"

const MOBILE_BREAKPOINT = 768
const EMBEDDED_VIEWPORT_CHANGE_EVENT = 'kaur-khor:embedded-viewport-change'

function readEffectiveViewportWidth() {
  const embeddedWidth = Number.parseFloat(document.documentElement.dataset.kaurKhorEffectiveViewportWidth ?? '')
  return Number.isFinite(embeddedWidth) && embeddedWidth > 0 ? embeddedWidth : window.innerWidth
}

export function useIsMobile() {
  const [isMobile, setIsMobile] = React.useState<boolean | undefined>(undefined)

  React.useEffect(() => {
    const mql = typeof window.matchMedia === 'function'
      ? window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`)
      : null
    const onChange = () => {
      setIsMobile(readEffectiveViewportWidth() < MOBILE_BREAKPOINT)
    }
    if (mql?.addEventListener) {
      mql.addEventListener("change", onChange)
    } else {
      mql?.addListener(onChange)
    }
    window.addEventListener("resize", onChange)
    document.documentElement.addEventListener(EMBEDDED_VIEWPORT_CHANGE_EVENT, onChange)
    setIsMobile(readEffectiveViewportWidth() < MOBILE_BREAKPOINT)
    return () => {
      if (mql?.removeEventListener) {
        mql.removeEventListener("change", onChange)
      } else {
        mql?.removeListener(onChange)
      }
      window.removeEventListener("resize", onChange)
      document.documentElement.removeEventListener(EMBEDDED_VIEWPORT_CHANGE_EVENT, onChange)
    }
  }, [])

  return !!isMobile
}
