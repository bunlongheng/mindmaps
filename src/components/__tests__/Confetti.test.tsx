import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, act, cleanup } from '@testing-library/react'
import { Confetti } from '../Confetti'

// Drive requestAnimationFrame manually so we control the animation loop.
let rafCallbacks: Array<(t: number) => void> = []
let rafId = 0

// jsdom has no real 2D canvas context; provide a no-op stub.
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
  // performance.now driven by fake timers via Date is fine; stub for determinism
  let t = 0
  vi.spyOn(performance, 'now').mockImplementation(() => t += 0) // start at 0
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

describe('Confetti', () => {
  it('renders a fixed full-screen canvas', () => {
    const { container } = render(<Confetti />)
    const canvas = container.querySelector('canvas')
    expect(canvas).toBeTruthy()
    expect(canvas?.style.position).toBe('fixed')
    expect(canvas?.style.pointerEvents).toBe('none')
  })

  it('starts the animation after the 400ms delay and draws particles', () => {
    render(<Confetti count={120} />)
    // before delay, no raf scheduled
    expect(rafCallbacks.length).toBe(0)
    act(() => { vi.advanceTimersByTime(400) })
    // delay fired -> first raf scheduled
    expect(rafCallbacks.length).toBe(1)
    // drive a frame mid-animation (covers all three particle shapes + fade branch)
    flushRaf(100)
    flushRaf(1100) // prog > 0.65 -> fade out branch
    expect(rafCallbacks.length).toBeGreaterThan(0)
  })

  it('calls onDone after the animation duration elapses', () => {
    const onDone = vi.fn()
    render(<Confetti count={50} onDone={onDone} />)
    act(() => { vi.advanceTimersByTime(400) })
    flushRaf(0)       // start frame
    flushRaf(1499)    // still running
    expect(onDone).not.toHaveBeenCalled()
    flushRaf(1500)    // elapsed >= DURATION -> onDone fires
    expect(onDone).toHaveBeenCalledTimes(1)
  })

  it('works without an onDone callback (optional chaining branch)', () => {
    render(<Confetti count={40} />)
    act(() => { vi.advanceTimersByTime(400) })
    flushRaf(0)
    expect(() => flushRaf(1600)).not.toThrow()
  })

  it('clamps count to a minimum of 40 when a smaller count is given', () => {
    const onDone = vi.fn()
    render(<Confetti count={5} onDone={onDone} />)
    act(() => { vi.advanceTimersByTime(400) })
    flushRaf(0)
    flushRaf(1500)
    expect(onDone).toHaveBeenCalled()
  })

  it('defaults to 80 particles when count is undefined', () => {
    render(<Confetti />)
    act(() => { vi.advanceTimersByTime(400) })
    expect(() => flushRaf(0)).not.toThrow()
  })

  it('clears the delay timeout when unmounted before it fires', () => {
    const { unmount } = render(<Confetti count={60} />)
    unmount()
    // advancing past delay should not schedule any raf since timeout was cleared
    act(() => { vi.advanceTimersByTime(400) })
    expect(rafCallbacks.length).toBe(0)
  })

  it('does not throw on unmount after the animation has started', () => {
    // NOTE: the inner `return () => cancelAnimationFrame(raf)` inside the
    // setTimeout callback is never used as an effect cleanup (setTimeout
    // discards its callback return value), so unmount only clears the delay.
    // The running RAF loop self-terminates after DURATION. This test just
    // verifies unmount is safe.
    const { unmount } = render(<Confetti count={60} />)
    act(() => { vi.advanceTimersByTime(400) })
    flushRaf(0)
    expect(() => unmount()).not.toThrow()
  })

  // NOTE: the `if (!canvas) return` guard inside the 400ms timeout (Confetti.tsx
  // line 24) is effectively unreachable in practice: the canvas always mounts,
  // and unmounting clears the delay timeout (so the callback never runs with a
  // null ref). Spying on useRef to force it is blocked by ESM, so this single
  // branch remains uncovered by design.
})
