import * as React from "react"

const MOBILE_BREAKPOINT = 768
const EMBEDDED_VIEWPORT_CHANGE_EVENT = 'banji:embedded-viewport-change'

function readEffectiveViewportWidth() {
  const embeddedWidth = Number.parseFloat(document.documentElement.dataset.banjiEffectiveViewportWidth ?? '')
  return Number.isFinite(embeddedWidth) && embeddedWidth > 0 ? embeddedWidth : window.innerWidth
}

export function useIsMobile() {
  const [isMobile, setIsMobile] = React.useState<boolean | undefined>(undefined)

  React.useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`)
    const onChange = () => {
      setIsMobile(readEffectiveViewportWidth() < MOBILE_BREAKPOINT)
    }
    mql.addEventListener("change", onChange)
    window.addEventListener("resize", onChange)
    document.documentElement.addEventListener(EMBEDDED_VIEWPORT_CHANGE_EVENT, onChange)
    setIsMobile(readEffectiveViewportWidth() < MOBILE_BREAKPOINT)
    return () => {
      mql.removeEventListener("change", onChange)
      window.removeEventListener("resize", onChange)
      document.documentElement.removeEventListener(EMBEDDED_VIEWPORT_CHANGE_EVENT, onChange)
    }
  }, [])

  return !!isMobile
}
