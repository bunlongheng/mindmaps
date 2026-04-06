import { describe, it, expect } from 'vitest'
import { hexToRgb, applyDepthTransparency, applyDepthBackground, darken } from '../color'

describe('hexToRgb', () => {
  it('parses standard hex', () => {
    expect(hexToRgb('#ff0000')).toEqual([255, 0, 0])
    expect(hexToRgb('#00ff00')).toEqual([0, 255, 0])
    expect(hexToRgb('#0000ff')).toEqual([0, 0, 255])
  })

  it('parses without hash', () => {
    expect(hexToRgb('ff8800')).toEqual([255, 136, 0])
  })

  it('handles black and white', () => {
    expect(hexToRgb('#000000')).toEqual([0, 0, 0])
    expect(hexToRgb('#ffffff')).toEqual([255, 255, 255])
  })
})

describe('applyDepthTransparency', () => {
  it('returns full opacity at depth 0', () => {
    const result = applyDepthTransparency('#ff0000', 0)
    expect(result).toBe('rgba(255,0,0,1)')
  })

  it('decreases alpha with depth', () => {
    const d1 = applyDepthTransparency('#ff0000', 1)
    const d3 = applyDepthTransparency('#ff0000', 3)
    const alpha1 = parseFloat(d1.match(/[\d.]+(?=\))/)![0])
    const alpha3 = parseFloat(d3.match(/[\d.]+(?=\))/)![0])
    expect(alpha1).toBeGreaterThan(alpha3)
  })

  it('never drops below 0.15', () => {
    const deep = applyDepthTransparency('#ff0000', 100)
    const alpha = parseFloat(deep.match(/[\d.]+(?=\))/)![0])
    expect(alpha).toBeGreaterThanOrEqual(0.15)
  })
})

describe('applyDepthBackground', () => {
  it('returns original color at depth 0', () => {
    expect(applyDepthBackground('#ff0000', 0)).toBe('#ff0000')
  })

  it('lightens toward white at deeper depths', () => {
    const result = applyDepthBackground('#ff0000', 2)
    // Should contain rgb values lighter than original red
    const match = result.match(/rgb\((\d+),(\d+),(\d+)\)/)
    expect(match).not.toBeNull()
    const [, r, g, b] = match!.map(Number)
    expect(r).toBeGreaterThanOrEqual(255) // red stays 255
    expect(g).toBeGreaterThan(0)          // green moves toward 255
    expect(b).toBeGreaterThan(0)          // blue moves toward 255
  })
})

describe('darken', () => {
  it('darkens white', () => {
    const result = darken('#ffffff', 0.3)
    const match = result.match(/rgb\((\d+),(\d+),(\d+)\)/)!
    const [, r, g, b] = match.map(Number)
    expect(r).toBe(179) // 255 * 0.7 rounded
    expect(g).toBe(179)
    expect(b).toBe(179)
  })

  it('black stays black', () => {
    expect(darken('#000000', 0.5)).toBe('rgb(0,0,0)')
  })

  it('uses default amount 0.3', () => {
    const result = darken('#ffffff')
    expect(result).toContain('179')
  })
})
