import { useEffect, useState } from 'react'

const COARSE_QUERY = '(pointer: coarse)'
const HOVER_NONE_QUERY = '(hover: none)'

// Detects a touch-primary device (iPhone/iPad, Android phones/tablets) as opposed to
// a mouse/trackpad device - a coarse pointer with no hover capability, or (for iPadOS 13+,
// which reports as a Mac in the UA string) the MacIntel + multi-touch signature.
function detectTouch(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false
  const coarseAndNoHover = window.matchMedia(COARSE_QUERY).matches && window.matchMedia(HOVER_NONE_QUERY).matches
  if (coarseAndNoHover) return true
  if (typeof navigator === 'undefined') return false
  const isIosUA = /iPad|iPhone|iPod/.test(navigator.userAgent ?? '')
  const isIpadOS13Plus = navigator.platform === 'MacIntel' && (navigator.maxTouchPoints ?? 0) > 1
  return isIosUA || isIpadOS13Plus
}

// Was no way to tell a touch-primary device (iPhone/iPad) from a mouse/trackpad device by
// viewport width alone - an iPad in landscape is wider than useIsMobile's 768px breakpoint,
// so it wouldn't match there. Rotating the device or attaching/removing a mouse can change
// pointer/hover capability at runtime, so this re-checks on media query change like useIsMobile.
export function useIsTouchDevice(): boolean {
  const [isTouch, setIsTouch] = useState(() => detectTouch())

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return
    const coarseMql = window.matchMedia(COARSE_QUERY)
    const hoverMql = window.matchMedia(HOVER_NONE_QUERY)
    const onChange = () => setIsTouch(detectTouch())
    coarseMql.addEventListener('change', onChange)
    hoverMql.addEventListener('change', onChange)
    return () => {
      coarseMql.removeEventListener('change', onChange)
      hoverMql.removeEventListener('change', onChange)
    }
  }, [])

  return isTouch
}
