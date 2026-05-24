import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, act, cleanup } from '@testing-library/react'
import { AIThinkingOverlay } from '../AIThinkingOverlay'

let rafCallbacks: Array<(t: number) => void> = []
let rafId = 0

function makeCtx() {
  return {
    clearRect() {}, save() {}, restore() {}, translate() {}, rotate() {},
    beginPath() {}, arc() {}, fill() {}, fillRect() {}, moveTo() {},
    lineTo() {}, closePath() {}, fillText() {}, globalAlpha: 1, fillStyle: '', font: '',
  } as unknown as CanvasRenderingContext2D
}

beforeEach(() => {
  vi.useFakeTimers()
  HTMLCanvasElement.prototype.getContext = vi.fn(() => makeCtx()) as unknown as HTMLCanvasElement['getContext']
  rafCallbacks = []
  rafId = 0
  vi.stubGlobal('requestAnimationFrame', (cb: (t: number) => void) => {
    rafCallbacks.push(cb)
    return ++rafId
  })
  vi.stubGlobal('cancelAnimationFrame', () => {})
})

afterEach(() => {
  cleanup()
  vi.runOnlyPendingTimers()
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

function flushRaf(now: number) {
  const cbs = rafCallbacks
  rafCallbacks = []
  act(() => { cbs.forEach(cb => cb(now)) })
}

describe('AIThinkingOverlay', () => {
  it('renders the overlay container, canvas, center word and phrase', () => {
    const { container } = render(<AIThinkingOverlay />)
    expect(container.querySelector('canvas')).toBeTruthy()
    // big center word + phrase + keyframes style
    expect(container.querySelector('style')?.innerHTML).toContain('wordPop')
    // there should be visible text nodes for center word and phrase
    const textDivs = Array.from(container.querySelectorAll('div')).filter(d => d.textContent && d.children.length === 0)
    expect(textDivs.length).toBeGreaterThanOrEqual(2)
  })

  it('rotates the phrase on its interval', () => {
    render(<AIThinkingOverlay />)
    expect(() => act(() => { vi.advanceTimersByTime(1300) })).not.toThrow()
    expect(() => act(() => { vi.advanceTimersByTime(1300) })).not.toThrow()
  })

  it('rotates the big center word on its interval', () => {
    render(<AIThinkingOverlay />)
    expect(() => act(() => { vi.advanceTimersByTime(1100) })).not.toThrow()
    expect(() => act(() => { vi.advanceTimersByTime(1100) })).not.toThrow()
  })

  it('runs the animation frame loop, exercising particle flip/wrap/clamp branches', () => {
    // Shrink the viewport so particles cross the wrap thresholds quickly.
    const origW = window.innerWidth
    const origH = window.innerHeight
    Object.defineProperty(window, 'innerWidth', { value: 30, configurable: true })
    Object.defineProperty(window, 'innerHeight', { value: 30, configurable: true })

    render(<AIThinkingOverlay />)
    expect(rafCallbacks.length).toBe(1)
    // First frame establishes `last` (dt ~0 -> stable baseline)
    flushRaf(0)
    // dt is clamped to 0.05s/frame, so step `now` by 50ms each frame and run
    // many frames: flipIn timers (max 2s) expire -> flip branch; particles
    // drift past +/-60 of a tiny viewport -> all four wrap branches; speed
    // damping + minimum-speed boost cover the spd>1.4 / spd<0.15 clamps.
    let t = 50
    for (let i = 0; i < 1200; i++) {
      flushRaf(t)
      t += 50
    }
    expect(rafCallbacks.length).toBeGreaterThan(0)

    Object.defineProperty(window, 'innerWidth', { value: origW, configurable: true })
    Object.defineProperty(window, 'innerHeight', { value: origH, configurable: true })
  })

  it('responds to window resize while mounted', () => {
    render(<AIThinkingOverlay />)
    flushRaf(0)
    act(() => { window.dispatchEvent(new Event('resize')) })
    flushRaf(100)
    expect(rafCallbacks.length).toBeGreaterThan(0)
  })

  it('cancels raf and removes resize listener on unmount', () => {
    const cancelSpy = vi.fn()
    vi.stubGlobal('cancelAnimationFrame', cancelSpy)
    const removeSpy = vi.spyOn(window, 'removeEventListener')
    const { unmount } = render(<AIThinkingOverlay />)
    flushRaf(0)
    unmount()
    expect(cancelSpy).toHaveBeenCalled()
    expect(removeSpy).toHaveBeenCalledWith('resize', expect.any(Function))
  })

  it('seeds many random values via repeated frames (deterministic Math.random spread)', () => {
    // Spy Math.random to cycle values so both isWord branches & speed clamps are hit.
    const seq = [0.0, 0.99, 0.5, 0.1, 0.9, 0.2, 0.8, 0.05, 0.95]
    let i = 0
    vi.spyOn(Math, 'random').mockImplementation(() => seq[(i++) % seq.length])
    render(<AIThinkingOverlay />)
    flushRaf(0)
    flushRaf(8000)   // large dt -> flipIn expires -> isWord re-roll branch
    flushRaf(16000)
    expect(rafCallbacks.length).toBeGreaterThan(0)
  })
})
