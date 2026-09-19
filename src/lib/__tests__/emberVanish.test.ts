import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { emberVanish, blinkDoomed, damageFlash } from '../emberVanish'

function card(width = 260, height = 200) {
  const el = document.createElement('div')
  el.getBoundingClientRect = () => ({
    width, height, left: 40, top: 80, right: 40 + width, bottom: 80 + height, x: 40, y: 80, toJSON() {},
  }) as DOMRect
  document.body.append(el)
  return el
}

function setReducedMotion(reduce: boolean) {
  vi.stubGlobal('matchMedia', vi.fn((q: string) => ({
    matches: reduce && q.includes('prefers-reduced-motion'),
    media: q, addEventListener: vi.fn(), removeEventListener: vi.fn(),
  })))
}

const field = () => document.querySelector('div[aria-hidden="true"]')

describe('emberVanish', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
    setReducedMotion(false)
    // jsdom has no WAAPI
    Element.prototype.animate = vi.fn(() => ({}) as Animation)
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
    document.body.innerHTML = ''
  })

  it('scatters specks over the element it was given', () => {
    emberVanish(card())

    const specks = field()!.querySelectorAll('i')
    // one speck per 420px2 of card, capped at 240
    expect(specks.length).toBe(Math.round((260 * 200) / 420))
    expect(Element.prototype.animate).toHaveBeenCalledTimes(specks.length)
  })

  it('caps the speck count on a huge element', () => {
    emberVanish(card(4000, 3000))
    expect(field()!.querySelectorAll('i').length).toBe(240)
  })

  it('pins the field over the element and cleans itself up', () => {
    const ms = emberVanish(card())
    const style = (field() as HTMLElement).style

    expect(style.left).toBe('40px')
    expect(style.top).toBe('80px')
    expect(style.pointerEvents).toBe('none')

    vi.advanceTimersByTime(ms)
    expect(field()).toBeNull()
  })

  it('throws every speck up and outward', () => {
    emberVanish(card())
    const frames = vi.mocked(Element.prototype.animate).mock.calls.map(c => c[0] as Keyframe[])

    for (const kf of frames) {
      const end = kf[kf.length - 1].transform as string
      const [, dx, dy] = /translate\((-?[\d.]+)px, (-?[\d.]+)px\)/.exec(end)!.map(Number)
      expect(Math.abs(dx)).toBeLessThanOrEqual(190)
      expect(dy).toBeLessThanOrEqual(-30) // always upward
      expect(dy).toBeGreaterThanOrEqual(-290)
    }
  })

  it('leaves some specks as embers that never cool to white', () => {
    emberVanish(card(4000, 3000)) // 240 specks - enough for both kinds to show up
    const frames = vi.mocked(Element.prototype.animate).mock.calls.map(c => c[0] as Keyframe[])
    const cooled = frames.filter(kf => kf[kf.length - 1].background === '#fff')
    const embers = frames.filter(kf => kf[kf.length - 1].background === '#ff7a63')

    expect(cooled.length).toBeGreaterThan(0)
    expect(embers.length).toBeGreaterThan(0)
    expect(cooled.length + embers.length).toBe(frames.length)
  })

  it('does nothing for a viewer who asked for less motion', () => {
    setReducedMotion(true)
    expect(emberVanish(card())).toBe(0)
    expect(field()).toBeNull()
  })

  it('does nothing without an element or a box', () => {
    expect(emberVanish(null)).toBe(0)
    expect(emberVanish(card(0, 0))).toBe(0)
    expect(field()).toBeNull()
  })
})

describe('blinkDoomed', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
    setReducedMotion(false)
    Element.prototype.animate = vi.fn(() => ({}) as Animation)
  })
  afterEach(() => vi.unstubAllGlobals())

  it('blinks red twice and says how long to wait', () => {
    const el = card()
    expect(blinkDoomed(el)).toBe(620)

    const [frames, opts] = vi.mocked(Element.prototype.animate).mock.calls[0]
    const kf = frames as Keyframe[]
    expect((opts as KeyframeAnimationOptions).iterations).toBe(2)
    expect((opts as KeyframeAnimationOptions).duration).toBe(300)
    // hard on/off, never a fade: red holds to the halfway point, then base does
    expect(kf[0].borderColor).toBe('#ef4444')
    expect(kf[1].offset).toBe(0.499)
    expect(kf[2].offset).toBe(0.5)
    expect(kf[3].borderColor).toBe(kf[2].borderColor)
  })

  it('leaves the element alone under reduced motion, or with no element', () => {
    setReducedMotion(true)
    expect(blinkDoomed(card())).toBe(0)
    setReducedMotion(false)
    expect(blinkDoomed(null)).toBe(0)
    expect(Element.prototype.animate).not.toHaveBeenCalled()
  })
})

describe('damageFlash', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
    setReducedMotion(false)
    Element.prototype.animate = vi.fn(() => ({}) as Animation)
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
    document.body.innerHTML = ''
  })

  it('puts a red vignette over the whole screen and clears it', () => {
    expect(damageFlash()).toBe(300)

    const skin = field() as HTMLElement
    expect(skin.style.position).toBe('fixed')
    expect(skin.style.background).toContain('radial-gradient')
    expect(skin.style.pointerEvents).toBe('none')
    // clear in the middle, red at the edges - a hit, not a red screen
    // (the browser normalises the gradient string, so match on its parts)
    expect(skin.style.background.replace(/\s/g, '')).toContain('rgba(239,68,68,0)38%')

    const kf = vi.mocked(Element.prototype.animate).mock.calls[0][0] as Keyframe[]
    const peaks = kf.filter(f => Number(f.opacity) > 0.8)
    expect(peaks.length).toBe(2) // punches twice
    expect(kf[kf.length - 1].opacity).toBe(0)

    vi.advanceTimersByTime(600)
    expect(field()).toBeNull()
  })

  it('does nothing under reduced motion', () => {
    setReducedMotion(true)
    expect(damageFlash()).toBe(0)
    expect(field()).toBeNull()
  })
})
