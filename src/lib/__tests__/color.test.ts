import { describe, it, expect } from 'vitest'
import { hexToRgb, applyDepthTransparency, applyDepthBackground, darken, l1PaletteColor, L1_PALETTE, depthFill, depthStrength, timelineSubFill, timelineSubText, TIMELINE_SUB_TINT, tint, DEPTH_STRENGTH, DEPTH_STRENGTH_FLOOR, edgeWidthForDepth, EDGE_WIDTH_BY_DEPTH, isDarkBg, lighten, neonBlur, neonFilterId, neonFilterSpecs, neonRootColor, NEON_ROOT_FALLBACK } from '../color'
import { THEMES } from '../themes'

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

  it('wraps sortOrder past the palette length around to the start', () => {
    const l1far = { id: 'e', parentId: 'root', depth: 1, sortOrder: L1_PALETTE.length + 1 }
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
    expect(DEPTH_STRENGTH).toEqual({ 1: 1, 2: 0.15, 3: 0.07, 4: 0.04 })
    expect(DEPTH_STRENGTH_FLOOR).toBe(0.03)
    expect(depthStrength(1)).toBe(1)
    expect(depthStrength(2)).toBe(0.15)
    expect(depthStrength(3)).toBe(0.07)
    expect(depthStrength(4)).toBe(0.04)
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
    // Green channel is the one with room to move on red. Below depth 1 every level is
    // a pale wash, so the steps are small but each one still moves toward white.
    // Depth 3 has to be the one that reads: a leaf sitting next to its own parent
    // used to be ~7 levels apart, close enough to look like the same fill.
    expect(d3[1] - d2[1]).toBeGreaterThanOrEqual(14)
    expect(d4[1] - d3[1]).toBeGreaterThanOrEqual(5)
    expect(d3[2] - d2[2]).toBeGreaterThan(0)
  })

  it('mixes exactly (1 - strength) toward white', () => {
    // #000000 at 7% strength -> 93% of the way to white -> 237
    expect(depthFill('#000000', 3)).toBe('#ededed')
    expect(depthFill('#ffffff', 5)).toBe('#ffffff')
  })
})

describe('timelineSubFill', () => {
  it('is a pale chip, never louder than the depth ladder at L2', () => {
    const [, g] = hexToRgb(timelineSubFill('#ef4444'))
    const [, gLadder] = hexToRgb(depthFill('#ef4444', 2))
    // The ladder keeps 15% of the colour at depth 2, the chip 13%, so the chip is
    // never the louder of the 2 and both sit close to white.
    expect(g).toBeGreaterThanOrEqual(gLadder)
    expect(g).toBeGreaterThan(215)
  })

  it('keeps the branch hue rather than going grey', () => {
    const [r, g, b] = hexToRgb(timelineSubFill('#22c55e'))
    expect(g).toBeGreaterThan(r)
    expect(g).toBeGreaterThan(b)
  })

  it('is exactly tint() at TIMELINE_SUB_TINT, for every palette colour', () => {
    for (const c of L1_PALETTE) expect(timelineSubFill(c)).toBe(tint(c, TIMELINE_SUB_TINT))
  })

  it('clears 4.5:1 against timelineSubText for every palette colour', () => {
    const lum = ([r, g, b]: number[]) => {
      const ch = (v: number) => { const x = v / 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4 }
      return 0.2126 * ch(r) + 0.7152 * ch(g) + 0.0722 * ch(b)
    }
    const rgb = (c: string) => c.startsWith('#') ? hexToRgb(c) : c.match(/\d+/g)!.map(Number)
    for (const c of L1_PALETTE) {
      const a = lum(rgb(timelineSubFill(c)))
      const b = lum(rgb(timelineSubText(c)))
      const ratio = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)
      expect(ratio, `${c} chip`).toBeGreaterThanOrEqual(4.5)
    }
  })
})

describe('L1_PALETTE spacing and legibility', () => {
  // Same conversion the rest of the app uses (hexToRgb above), turned into HSL just
  // for this check.
  function hexToHsl(hex: string): [number, number, number] {
    const [r, g, b] = hexToRgb(hex).map(v => v / 255)
    const max = Math.max(r, g, b)
    const min = Math.min(r, g, b)
    const l = (max + min) / 2
    if (max === min) return [0, 0, l * 100]
    const d = max - min
    const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
    let h: number
    if (max === r) h = (g - b) / d + (g < b ? 6 : 0)
    else if (max === g) h = (b - r) / d + 2
    else h = (r - g) / d + 4
    return [h * 60, s * 100, l * 100]
  }

  function hueDistance(a: number, b: number): number {
    const diff = Math.abs(a - b) % 360
    return diff > 180 ? 360 - diff : diff
  }

  // WCAG relative luminance / contrast ratio, gamma-corrected (not the app's fast
  // perceived-luminance isLight() heuristic, which only picks text colour).
  function relLuminance(hex: string): number {
    const [r, g, b] = hexToRgb(hex).map(v => {
      const c = v / 255
      return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
    })
    return 0.2126 * r + 0.7152 * g + 0.0722 * b
  }

  function contrastRatio(hexA: string, hexB: string): number {
    const lA = relLuminance(hexA)
    const lB = relLuminance(hexB)
    const lighter = Math.max(lA, lB)
    const darker = Math.min(lA, lB)
    return (lighter + 0.05) / (darker + 0.05)
  }

  // Same threshold Node.tsx / render-svg.ts isLight() use to choose text colour.
  function isLight(hex: string): boolean {
    const [r, g, b] = hexToRgb(hex)
    return 0.2126 * r + 0.7152 * g + 0.0722 * b > 130
  }

  // The palette is now inherited verbatim from the Sequences participant palette
  // (its lib/svg-renderer.ts PAL), so a branch here reads like a lane there. That
  // order walks the colour wheel, which replaced the old "every neighbour >= 60
  // degrees apart" rule - adjacent entries are deliberately close in hue now.
  it('matches the Sequences participant palette, in order', () => {
    expect(L1_PALETTE).toEqual([
      '#ef4444', '#f97316', '#eab308', '#22c55e',
      '#14b8a6', '#06b6d4', '#3b82f6', '#8b5cf6',
      '#ec4899', '#f43f5e', '#84cc16', '#0891b2',
    ])
  })

  it('has no duplicate entries', () => {
    expect(new Set(L1_PALETTE).size).toBe(L1_PALETTE.length)
  })

  // The first 8 are what Sequences' own editor exposes and what a normal map uses;
  // they must stay tellable apart at a glance. (The 12-colour tail repeats cyan's
  // hue at a darker lightness, which is why the bound only covers the head.)
  it('keeps the first 8 at least 15 degrees apart in hue from their neighbour', () => {
    for (let i = 0; i < 7; i++) {
      const [hA] = hexToHsl(L1_PALETTE[i])
      const [hB] = hexToHsl(L1_PALETTE[i + 1])
      expect(hueDistance(hA, hB)).toBeGreaterThanOrEqual(15)
    }
  })

  it('is legible: each colour has >= 3:1 contrast against the text colour the app picks for it', () => {
    for (const hex of L1_PALETTE) {
      const textColor = isLight(hex) ? '#1a1d2e' : '#ffffff'
      expect(contrastRatio(hex, textColor)).toBeGreaterThanOrEqual(3)
    }
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

describe('isDarkBg', () => {
  it('calls the two dark themes dark and the two light ones light', () => {
    const dark = ['cyberpunk', 'monokai']
    for (const t of THEMES) {
      expect(isDarkBg(t.canvasBg)).toBe(dark.includes(t.id))
    }
  })

  it('handles the extremes', () => {
    expect(isDarkBg('#000000')).toBe(true)
    expect(isDarkBg('#ffffff')).toBe(false)
  })

  it('returns false for anything that is not a 6-digit hex', () => {
    expect(isDarkBg('#000')).toBe(false)
    expect(isDarkBg('rgb(0,0,0)')).toBe(false)
    expect(isDarkBg('')).toBe(false)
  })
})

describe('lighten', () => {
  it('mixes toward white and is monotonic', () => {
    expect(lighten('#000000', 1)).toBe('#ffffff')
    expect(lighten('#000000', 0)).toBe('#000000')
    expect(lighten('#808080', 0.5)).toBe('#c0c0c0')
  })
})

describe('neon glow filters', () => {
  it('scales the halo with the circle, with a floor so a dot still glows', () => {
    expect(neonBlur(96)).toBe(18)
    expect(neonBlur(6)).toBe(2)
    expect(neonBlur(150)).toBeGreaterThan(neonBlur(96))
  })

  it('buckets sizes so a 200-node map shares a handful of filters', () => {
    const widths = Array.from({ length: 200 }, (_, i) => 5 + (i % 92))
    expect(neonFilterSpecs(widths).length).toBeLessThan(12)
    expect(neonFilterId(96)).toBe('mm-neon-18')
  })

  it('pairs every halo with a tight core a third of its width', () => {
    const [spec] = neonFilterSpecs([96])
    expect(spec.core).toBeCloseTo(6, 5)
  })
})

describe('neonRootColor', () => {
  it('keeps a root colour that can glow', () => {
    expect(neonRootColor('#06b6d4')).toBe('#06b6d4')
    expect(neonRootColor('#6366f1')).toBe('#6366f1')
  })

  it('falls back to the violet when the root is near-black', () => {
    expect(neonRootColor('#1a1d2e')).toBe(NEON_ROOT_FALLBACK)
    expect(neonRootColor('rgb(1,2,3)')).toBe(NEON_ROOT_FALLBACK)
  })
})
