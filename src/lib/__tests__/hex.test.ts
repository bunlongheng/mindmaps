import { describe, it, expect } from 'vitest'
import { HEX_RADIUS, hexRadius, hexPoints, hexFontSize, hexLabelMaxChars, hexFill, hexTextColor, combSizeOf, hexLabelLines, hexCellLayout, combStyleOf, meshCellRadius, meshGroupOutlines, axialToCenter } from '../hex'
import { hexToRgb } from '../color'

// Same perceived-luminance heuristic used elsewhere in this repo to compare two
// fills for lightness (see color.test.ts).
function luminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex)
  return 0.299 * r + 0.587 * g + 0.114 * b
}

describe('hexRadius', () => {
  it('returns the table value for known depths', () => {
    expect(hexRadius(0)).toBe(HEX_RADIUS[0])
    expect(hexRadius(1)).toBe(HEX_RADIUS[1])
    expect(hexRadius(2)).toBe(HEX_RADIUS[2])
  })
  it('grows outward like a web and holds the depth-3 size for anything deeper', () => {
    expect(hexRadius(0)).toBeLessThan(hexRadius(1))
    expect(hexRadius(1)).toBeLessThan(hexRadius(2))
    expect(hexRadius(2)).toBeLessThan(hexRadius(3))
    expect(hexRadius(9)).toBe(hexRadius(3))
  })
})

describe('hexPoints', () => {
  it('returns 6 points', () => {
    const pts = hexPoints(0, 0, 10).split(' ')
    expect(pts).toHaveLength(6)
  })
  it('has its first point directly above the centre (pointy-top)', () => {
    const pts = hexPoints(50, 50, 20).split(' ').map(p => p.split(',').map(Number))
    const [x, y] = pts[0]
    expect(x).toBeCloseTo(50, 1)
    expect(y).toBeCloseTo(30, 1) // cy - r
  })
  it('keeps every vertex within r of the centre', () => {
    const cx = 12, cy = -7, r = 33
    const pts = hexPoints(cx, cy, r).split(' ').map(p => p.split(',').map(Number))
    for (const [x, y] of pts) {
      const dist = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2)
      expect(dist).toBeCloseTo(r, 1)
    }
  })
})

describe('hexFontSize / hexLabelMaxChars', () => {
  it('steps down font size with depth', () => {
    expect(hexFontSize(0)).toBe(18)
    expect(hexFontSize(1)).toBe(15)
    expect(hexFontSize(2)).toBe(13)
    expect(hexFontSize(3)).toBe(13)
    expect(hexFontSize(9)).toBe(13)
  })
  it('never returns fewer than 6 characters', () => {
    expect(hexLabelMaxChars(0)).toBeGreaterThanOrEqual(6)
    expect(hexLabelMaxChars(3)).toBeGreaterThanOrEqual(6)
  })
})

describe('hexFill', () => {
  it('roots always get the dark navy fill', () => {
    expect(hexFill('#D94F3A', 0)).toBe('#1a1d2e')
  })
  it('depth 1 keeps the full branch colour', () => {
    expect(hexFill('#D94F3A', 1)).toBe('#D94F3A')
  })
  it('depth 2 is a lighter tint than depth 1', () => {
    const d1 = hexFill('#D94F3A', 1)
    const d2 = hexFill('#D94F3A', 2)
    expect(luminance(d2)).toBeGreaterThan(luminance(d1))
  })
})

describe('hexTextColor', () => {
  it('is white for the root and depth 1', () => {
    expect(hexTextColor(0)).toBe('#ffffff')
    expect(hexTextColor(1)).toBe('#ffffff')
  })
  it('is black for depth 2 and deeper', () => {
    expect(hexTextColor(2)).toBe('#000000')
    expect(hexTextColor(5)).toBe('#000000')
  })
})

describe('comb size switch', () => {
  it('inward mirrors the ladder: root biggest, every ring outward smaller', () => {
    expect(hexRadius(0, 'inward')).toBeGreaterThan(hexRadius(1, 'inward'))
    expect(hexRadius(1, 'inward')).toBeGreaterThan(hexRadius(2, 'inward'))
    expect(hexRadius(2, 'inward')).toBeGreaterThan(hexRadius(3, 'inward'))
    expect(hexRadius(9, 'inward')).toBe(hexRadius(3, 'inward'))
  })
  it('reads the mode off the root node and defaults to outward', () => {
    const root = { id: 'r', title: 'R', color: '#000', parentId: null, depth: 0, x: 0, y: 0, width: 1, height: 1 }
    expect(combSizeOf([root])).toBe('outward')
    expect(combSizeOf([{ ...root, combSize: 'inward' as const }])).toBe('inward')
  })
  it('keeps every line of a long title and grows the cell to hold it', () => {
    const long = 'authorize redirectUrl = origin/embedded/integrations?connected= and then some more words'
    const lines = hexLabelLines(long, 3)
    expect(lines.length).toBeGreaterThanOrEqual(3)
    expect(lines.some(l => l.endsWith('\u2026'))).toBe(false)
    const node = { id: 'n', title: long, color: '#000', parentId: 'p', depth: 3, x: 0, y: 0, width: 0, height: 0 }
    const cell = hexCellLayout(node)
    expect(cell.r).toBeGreaterThan(hexRadius(3))
    const short = hexCellLayout({ ...node, title: 'Kiwi' })
    expect(short.r).toBe(hexRadius(3))
    // A cell with an emoji reserves room for it above the title.
    expect(hexCellLayout({ ...node, emoji: '\u{1F426}' }).r).toBeGreaterThanOrEqual(cell.r)
  })
})

describe('comb style', () => {
  it('defaults to a mesh and reads the root node', () => {
    const root = { id: 'r', title: 'R', color: '#000', parentId: null, depth: 0, x: 0, y: 0, width: 1, height: 1 }
    expect(combStyleOf([root])).toBe('mesh')
    expect(combStyleOf([{ ...root, combStyle: 'web' as const }])).toBe('web')
  })
  it('a mesh radius holds the longest label in the map', () => {
    const root = { id: 'r', title: 'R', color: '#000', parentId: null, depth: 0, x: 0, y: 0, width: 1, height: 1 }
    const long = { ...root, id: 'l', parentId: 'r', depth: 2, title: 'authorize redirectUrl = origin/embedded/integrations?connected= and more' }
    expect(meshCellRadius([root, long])).toBe(Math.max(hexCellLayout(root).r, hexCellLayout(long).r))
  })
})

describe('meshGroupOutlines', () => {
  it('outlines a parent with its 2 touching children as 1 ring of 14 edges', () => {
    const R = 50
    const cell = (id: string, parentId: string | null, depth: number, q: number, r: number) => {
      const c = axialToCenter(q, r, R)
      return { id, title: id, color: '#D94F3A', parentId, depth, x: c.x - R, y: c.y - R, width: 2 * R, height: 2 * R }
    }
    // parent at (0,0), children across edge 1 (1,0) and edge 2 (0,1): those 2 also touch each other.
    const nodes = [cell('p', null, 0, 0, 0), cell('a', 'p', 1, 1, 0), cell('b', 'p', 1, 0, 1)]
    const groups = meshGroupOutlines(nodes, R)
    expect(groups).toHaveLength(1)
    expect(groups[0].parentId).toBe('p')
    // 3 cells x 6 edges = 18, minus 2 per shared wall x 3 shared walls = 12 boundary edges.
    expect((groups[0].d.match(/M /g) ?? []).length).toBe(12)
  })
})
