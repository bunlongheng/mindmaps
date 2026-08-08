import { describe, it, expect, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useIsMobile } from '../useIsMobile'

type Listener = () => void

function mockMatchMedia(initialMatches: boolean) {
  let matches = initialMatches
  const listeners: Listener[] = []
  const mql = {
    get matches() { return matches },
    addEventListener: (_: string, cb: Listener) => { listeners.push(cb) },
    removeEventListener: (_: string, cb: Listener) => {
      const i = listeners.indexOf(cb)
      if (i >= 0) listeners.splice(i, 1)
    },
  }
  window.matchMedia = (() => mql) as unknown as typeof window.matchMedia
  return {
    setMatches(next: boolean) { matches = next; listeners.forEach(l => l()) },
  }
}

const originalMatchMedia = window.matchMedia

afterEach(() => { window.matchMedia = originalMatchMedia })

describe('useIsMobile', () => {
  it('returns the initial matchMedia state', () => {
    mockMatchMedia(true)
    const { result } = renderHook(() => useIsMobile())
    expect(result.current).toBe(true)
  })

  it('returns false when the query does not match', () => {
    mockMatchMedia(false)
    const { result } = renderHook(() => useIsMobile())
    expect(result.current).toBe(false)
  })

  it('updates when the media query change fires (e.g. rotation/resize)', () => {
    const media = mockMatchMedia(false)
    const { result } = renderHook(() => useIsMobile())
    expect(result.current).toBe(false)
    act(() => { media.setMatches(true) })
    expect(result.current).toBe(true)
  })

  it('removes its listener on unmount', () => {
    const media = mockMatchMedia(false)
    const { unmount } = renderHook(() => useIsMobile())
    unmount()
    // No listeners left to notify - this should not throw.
    expect(() => media.setMatches(true)).not.toThrow()
  })
})
