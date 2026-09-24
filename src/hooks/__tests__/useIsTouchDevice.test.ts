import { describe, it, expect, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useIsTouchDevice } from '../useIsTouchDevice'

type Listener = () => void

// Mocks window.matchMedia so '(pointer: coarse)' and '(hover: none)' can be controlled
// independently, the way a real touch device (both match) vs. mouse/trackpad (neither match)
// vs. an iPad with matchMedia false-negatives (falls back to the UA/platform check) differ.
function mockMatchMedia(coarse: boolean, hoverNone: boolean) {
  const listeners = new Map<string, Listener[]>()
  window.matchMedia = ((query: string) => {
    const matches = query.includes('coarse') ? coarse : hoverNone
    return {
      matches,
      media: query,
      addEventListener: (_: string, cb: Listener) => {
        const arr = listeners.get(query) ?? []
        arr.push(cb)
        listeners.set(query, arr)
      },
      removeEventListener: (_: string, cb: Listener) => {
        const arr = listeners.get(query) ?? []
        const i = arr.indexOf(cb)
        if (i >= 0) arr.splice(i, 1)
      },
    }
  }) as unknown as typeof window.matchMedia
}

function mockNavigator(over: { userAgent?: string; platform?: string; maxTouchPoints?: number }) {
  Object.defineProperty(window.navigator, 'userAgent', { value: over.userAgent ?? '', configurable: true })
  Object.defineProperty(window.navigator, 'platform', { value: over.platform ?? '', configurable: true })
  Object.defineProperty(window.navigator, 'maxTouchPoints', { value: over.maxTouchPoints ?? 0, configurable: true })
}

const originalMatchMedia = window.matchMedia
const originalUA = window.navigator.userAgent
const originalPlatform = window.navigator.platform
const originalMaxTouchPoints = window.navigator.maxTouchPoints

afterEach(() => {
  window.matchMedia = originalMatchMedia
  mockNavigator({ userAgent: originalUA, platform: originalPlatform, maxTouchPoints: originalMaxTouchPoints })
})

describe('useIsTouchDevice', () => {
  it('returns true for a coarse pointer with no hover (real touch device)', () => {
    mockMatchMedia(true, true)
    mockNavigator({ userAgent: 'Mozilla/5.0 (Linux; Android 10)' })
    const { result } = renderHook(() => useIsTouchDevice())
    expect(result.current).toBe(true)
  })

  it('returns false for a fine pointer with hover (mouse/trackpad device)', () => {
    mockMatchMedia(false, false)
    mockNavigator({ userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) AppleWebKit' })
    const { result } = renderHook(() => useIsTouchDevice())
    expect(result.current).toBe(false)
  })

  it('returns true for an iPhone/iPad UA even when the media queries do not match', () => {
    mockMatchMedia(false, false)
    mockNavigator({ userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)' })
    const { result } = renderHook(() => useIsTouchDevice())
    expect(result.current).toBe(true)
  })

  it('returns true for the iPadOS 13+ MacIntel + multi-touch signature', () => {
    mockMatchMedia(false, false)
    // iPadOS 13+ reports as a Mac in the UA string, so it's detected via platform + touch points.
    mockNavigator({ userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) AppleWebKit', platform: 'MacIntel', maxTouchPoints: 5 })
    const { result } = renderHook(() => useIsTouchDevice())
    expect(result.current).toBe(true)
  })

  it('removes its listeners on unmount without throwing', () => {
    mockMatchMedia(true, true)
    mockNavigator({ userAgent: 'Mozilla/5.0 (Linux; Android 10)' })
    const { unmount } = renderHook(() => useIsTouchDevice())
    expect(() => unmount()).not.toThrow()
  })

  it('re-detects and flips the result when the media query changes at runtime', () => {
    // A mutable matchMedia mock: `state` can be flipped after mount, and firing a
    // captured listener re-reads it live (mirrors a real MediaQueryList).
    const state = { coarse: false, hoverNone: false }
    const changeListeners: Listener[] = []
    window.matchMedia = ((query: string) => ({
      get matches() { return query.includes('coarse') ? state.coarse : state.hoverNone },
      media: query,
      addEventListener: (_: string, cb: Listener) => { changeListeners.push(cb) },
      removeEventListener: (_: string, cb: Listener) => {
        const i = changeListeners.indexOf(cb)
        if (i >= 0) changeListeners.splice(i, 1)
      },
    })) as unknown as typeof window.matchMedia
    mockNavigator({ userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) AppleWebKit' })

    const { result } = renderHook(() => useIsTouchDevice())
    expect(result.current).toBe(false) // mouse/trackpad at mount

    // A mouse gets detached: the device now matches coarse pointer + no hover.
    state.coarse = true
    state.hoverNone = true
    act(() => { changeListeners.forEach(cb => cb()) })
    expect(result.current).toBe(true)
  })
})
