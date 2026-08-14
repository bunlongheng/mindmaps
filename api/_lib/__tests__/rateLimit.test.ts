import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { checkRateLimit } from '../rateLimit'

const WINDOW_MS = 60_000

beforeEach(() => { vi.useFakeTimers() })
afterEach(() => { vi.useRealTimers() })

// Buckets are module-level state, so each test uses its own key.
describe('checkRateLimit', () => {
  it('allows the first request', () => {
    const r = checkRateLimit('ip-first', { max: 3, windowMs: WINDOW_MS })
    expect(r.allowed).toBe(true)
    expect(r.retryAfterSeconds).toBe(0)
  })

  it('blocks once the limit is reached within the window', () => {
    for (let i = 0; i < 3; i++) {
      expect(checkRateLimit('ip-limit', { max: 3, windowMs: WINDOW_MS }).allowed).toBe(true)
    }
    const blocked = checkRateLimit('ip-limit', { max: 3, windowMs: WINDOW_MS })
    expect(blocked.allowed).toBe(false)
    expect(blocked.retryAfterSeconds).toBeGreaterThan(0)
    expect(blocked.retryAfterSeconds).toBeLessThanOrEqual(WINDOW_MS / 1000)
  })

  it('allows again after the window expires', () => {
    expect(checkRateLimit('ip-expiry', { max: 1, windowMs: WINDOW_MS }).allowed).toBe(true)
    expect(checkRateLimit('ip-expiry', { max: 1, windowMs: WINDOW_MS }).allowed).toBe(false)
    vi.advanceTimersByTime(WINDOW_MS)
    const r = checkRateLimit('ip-expiry', { max: 1, windowMs: WINDOW_MS })
    expect(r.allowed).toBe(true)
    expect(r.retryAfterSeconds).toBe(0)
  })
})
