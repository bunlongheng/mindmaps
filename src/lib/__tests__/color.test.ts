import { describe, it, expect } from 'vitest'
import { hexToRgb, applyDepthTransparency, applyDepthBackground, darken, l1PaletteColor, L1_PALETTE, depthFill, depthStrength, DEPTH_STRENGTH, DEPTH_STRENGTH_FLOOR, edgeWidthForDepth, EDGE_WIDTH_BY_DEPTH } from '../color'

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

describe('l1PaletteColor', () => {
  const root = { id: 'root', parentId: null, depth: 0, sortOrder: 0 }
  const l1a = { id: 'a', parentId: 'root', depth: 1, sortOrder: 0 }
  const l1b = { id: 'b', parentId: 'root', depth: 1, sortOrder: 3 }
  const l2 = { id: 'c', parentId: 'b', depth: 2, sortOrder: 0 }
  const l3 = { id: 'd', parentId: 'c', depth: 3, sortOrder: 0 }
  const all = [root, l1a, l1b, l2, l3]

  it('returns null for the root', () => {
    expect(l1PaletteColor(root, all)).toBeNull()
  })

  it('indexes L1 nodes into the palette by sortOrder', () => {
    expect(l1PaletteColor(l1a, all)).toBe(L1_PALETTE[0])
    expect(l1PaletteColor(l1b, all)).toBe(L1_PALETTE[3])
  })

  it('walks descendants up to their L1 ancestor colour', () => {
    expect(l1PaletteColor(l2, all)).toBe(L1_PALETTE[3])
    expect(l1PaletteColor(l3, all)).toBe(L1_PALETTE[3])
  })

  it('wraps sortOrder past 12 around the palette', () => {
    const l1far = { id: 'e', parentId: 'root', depth: 1, sortOrder: 13 }
    expect(l1PaletteColor(l1far, [root, l1far])).toBe(L1_PALETTE[1])
  })

  it('missing sortOrder falls back to index 0', () => {
    const l1none = { id: 'f', parentId: 'root', depth: 1 }
    expect(l1PaletteColor(l1none, [root, l1none])).toBe(L1_PALETTE[0])
  })

  it('returns null when no L1 ancestor exists (broken chain)', () => {
    const orphan = { id: 'g', parentId: 'ghost', depth: 2, sortOrder: 0 }
    expect(l1PaletteColor(orphan, [root, orphan])).toBeNull()
  })
})

describe('depth ladder (DEPTH_STRENGTH / depthStrength / depthFill)', () => {
  it('matches the documented table', () => {
    expect(DEPTH_STRENGTH).toEqual({ 1: 1, 2: 0.8, 3: 0.6, 4: 0.5 })
    expect(DEPTH_STRENGTH_FLOOR).toBe(0.4)
    expect(depthStrength(1)).toBe(1)
    expect(depthStrength(2)).toBe(0.8)
    expect(depthStrength(3)).toBe(0.6)
    expect(depthStrength(4)).toBe(0.5)
  })

  it('floors at depth 5 and deeper', () => {
    expect(depthStrength(5)).toBe(DEPTH_STRENGTH_FLOOR)
    expect(depthStrength(9)).toBe(DEPTH_STRENGTH_FLOOR)
  })

  it('is monotonically weaker with depth, never rising', () => {
    const strengths = [1, 2, 3, 4, 5, 6].map(depthStrength)
    for (let i = 1; i < strengths.length; i++) {
      expect(strengths[i]).toBeLessThanOrEqual(strengths[i - 1])
    }
    // Every named step is a real step, not a repeat
    expect(new Set([1, 2, 3, 4].map(depthStrength)).size).toBe(4)
  })

  it('leaves the root colour untouched', () => {
    expect(depthFill('#ED1C24', 0)).toBe('#ED1C24')
  })

  it('returns the full colour at depth 1', () => {
    expect(depthFill('#ed1c24', 1)).toBe('#ed1c24')
  })

  it('steps visibly toward white as depth grows', () => {
    const chan = (hex: string) => hexToRgb(hex)
    const d2 = chan(depthFill('#ed1c24', 2))
    const d3 = chan(depthFill('#ed1c24', 3))
    const d4 = chan(depthFill('#ed1c24', 4))
    // Green channel is the one with room to move on red; each step gains >= 20
    expect(d3[1] - d2[1]).toBeGreaterThanOrEqual(20)
    expect(d4[1] - d3[1]).toBeGreaterThanOrEqual(20)
    expect(d3[2] - d2[2]).toBeGreaterThan(0)
  })

  it('mixes exactly (1 - strength) toward white', () => {
    // #000000 at 60% strength -> 40% of the way to white -> 102
    expect(depthFill('#000000', 3)).toBe('#666666')
    expect(depthFill('#ffffff', 5)).toBe('#ffffff')
  })
})

describe('edge width ladder (EDGE_WIDTH_BY_DEPTH / edgeWidthForDepth)', () => {
  it('is strictly decreasing', () => {
    for (let i = 1; i < EDGE_WIDTH_BY_DEPTH.length; i++) {
      expect(EDGE_WIDTH_BY_DEPTH[i]).toBeLessThan(EDGE_WIDTH_BY_DEPTH[i - 1])
    }
  })

  it('returns 5, 3, 2, 1, 1, 1 for depths 1 through 6', () => {
    expect([1, 2, 3, 4, 5, 6].map(edgeWidthForDepth)).toEqual([5, 3, 2, 1, 1, 1])
  })

  it('defends against depth 0 or negative by returning the L1 width', () => {
    expect(edgeWidthForDepth(0)).toBe(5)
    expect(edgeWidthForDepth(-1)).toBe(5)
  })
})
