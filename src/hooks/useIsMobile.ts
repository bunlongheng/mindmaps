import { useEffect, useState } from 'react'

const QUERY = '(max-width: 768px)'

// Was a one-shot window.innerWidth snapshot taken once at mount - rotating a phone/tablet
// or resizing the window left stale sizing/layout until the component remounted.
export function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState(() => window.matchMedia(QUERY).matches)

  useEffect(() => {
    const mql = window.matchMedia(QUERY)
    const onChange = () => setIsMobile(mql.matches)
    mql.addEventListener('change', onChange)
    return () => mql.removeEventListener('change', onChange)
  }, [])

  return isMobile
}
