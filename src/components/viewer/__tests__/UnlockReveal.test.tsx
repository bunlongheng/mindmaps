import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { render, screen, cleanup, act } from '@testing-library/react'
import { UnlockReveal } from '../UnlockReveal'

let now = 0
let cbs: FrameRequestCallback[] = []
const ctx = { scale: vi.fn(), clearRect: vi.fn(), fillRect: vi.fn(), fillStyle: '' }

beforeEach(() => {
  now = 0; cbs = []
  vi.spyOn(performance, 'now').mockImplementation(() => now)
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => { cbs.push(cb); return cbs.length })
  vi.stubGlobal('cancelAnimationFrame', vi.fn())
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(ctx as unknown as CanvasRenderingContext2D)
  ctx.scale.mockClear(); ctx.fillRect.mockClear(); ctx.clearRect.mockClear()
})
afterEach(() => {
  cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals()
  window.history.replaceState(null, '', '/')
})

const runFrame = (t: number) => act(() => { now = t; const cb = cbs.shift(); cb?.(t) })

describe('UnlockReveal', () => {
  it('renders nothing without the reveal flag', () => {
    window.history.replaceState(null, '', '/?share=abc')
    const { container } = render(<UnlockReveal />)
    expect(container).toBeEmptyDOMElement()
    expect(window.location.search).toBe('?share=abc')
  })

  it('renders nothing and drops the flag under reduced motion', () => {
    window.history.replaceState(null, '', '/?share=abc&reveal=1')
    vi.stubGlobal('matchMedia', () => ({ matches: true }))
    const { container } = render(<UnlockReveal />)
    expect(container).toBeEmptyDOMElement()
    expect(window.location.search).toBe('?share=abc')
  })

  it('drops the flag at once, animates the frost and flies, then removes itself', () => {
    window.history.replaceState(null, '', '/?share=abc&reveal=1')
    vi.stubGlobal('matchMedia', () => ({ matches: false }))
    render(<UnlockReveal />)
    expect(screen.getByTestId('unlock-reveal')).toBeInTheDocument()
    expect(window.location.search).toBe('?share=abc')
    expect(ctx.scale).toHaveBeenCalled()
    // t < 0.5 branch
    runFrame(600)
    expect(ctx.clearRect).toHaveBeenCalled()
    expect(ctx.fillRect).toHaveBeenCalled()
    // t >= 0.5 and t > 0.85 fade branches
    runFrame(2000)
    ctx.fillRect.mockClear()
    runFrame(2800)
    // done
    runFrame(3500)
    expect(screen.queryByTestId('unlock-reveal')).not.toBeInTheDocument()
  })

  it('works when matchMedia is missing and cancels the frame on unmount', () => {
    window.history.replaceState(null, '', '/?reveal=1')
    vi.stubGlobal('matchMedia', undefined)
    const { unmount } = render(<UnlockReveal />)
    expect(screen.getByTestId('unlock-reveal')).toBeInTheDocument()
    unmount()
    expect(cancelAnimationFrame).toHaveBeenCalled()
  })

  it('skips drawing when the canvas has no 2d context', () => {
    window.history.replaceState(null, '', '/?reveal=1')
    vi.stubGlobal('matchMedia', () => ({ matches: false }))
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null)
    render(<UnlockReveal />)
    expect(cbs.length).toBe(0)
  })
})
