import { describe, it, expect } from 'vitest'
import { computeMindmapLayout, wrapText } from '../mindmap'
import type { MindmapNode } from '../../../types'

function node(overrides: Partial<MindmapNode> & { id: string }): MindmapNode {
  return {
    title: 'Node',
    color: '#6366f1',
    parentId: null,
    depth: 0,
    x: 0,
    y: 0,
    width: 0,
    height: 0,
    ...overrides,
  }
}

function byId(nodes: MindmapNode[], id: string) {
  return nodes.find(n => n.id === id)!
}

function center(n: MindmapNode) {
  return { cx: n.x + n.width / 2, cy: n.y + n.height / 2 }
}

function dist(a: MindmapNode, b: MindmapNode) {
  const ca = center(a)
  const cb = center(b)
  return Math.hypot(ca.cx - cb.cx, ca.cy - cb.cy)
}

describe('wrapText', () => {
  it('returns the whole text as one line when it fits', () => {
    expect(wrapText('hello world', 100)).toEqual(['hello world'])
  })

  it('breaks onto new lines when the running line would overflow', () => {
    const lines = wrapText('aaaa bbbb cccc', 8)
    expect(lines.length).toBeGreaterThan(1)
    // each line should respect the cap reasonably (single words can exceed)
    expect(lines[0]).toBe('aaaa')
  })

  it('keeps an over-long single word on its own line', () => {
    const lines = wrapText('supercalifragilistic word', 5)
    expect(lines[0]).toBe('supercalifragilistic')
  })

  it('returns the original text for an empty string (no lines collected)', () => {
    expect(wrapText('', 10)).toEqual([''])
  })

  it('splits on arbitrary whitespace runs', () => {
    expect(wrapText('a   b', 100)).toEqual(['a b'])
  })
})

describe('computeMindmapLayout', () => {
  it('returns input unchanged when there is no root', () => {
    const input = [node({ id: 'a', parentId: 'x', depth: 1 })]
    expect(computeMindmapLayout(input)).toBe(input)
  })

  it('places a lone root centered at the origin as a square', () => {
    const out = computeMindmapLayout([node({ id: 'root', depth: 0, title: 'Center' })])
    expect(out).toHaveLength(1)
    const root = byId(out, 'root')
    expect(root.width).toBe(root.height) // circle: square box
    expect(root.width).toBeGreaterThanOrEqual(160) // min root size
    // centered on origin
    expect(root.x).toBeCloseTo(-root.width / 2, 5)
    expect(root.y).toBeCloseTo(-root.height / 2, 5)
  })

  it('returns just the root when it has no children (l1s empty early return)', () => {
    const out = computeMindmapLayout([node({ id: 'root', depth: 0 })])
    expect(out).toHaveLength(1)
    expect(out[0].id).toBe('root')
  })

  it('keeps a manually-positioned root untouched', () => {
    const root = node({ id: 'root', depth: 0, manuallyPositioned: true, x: 999, y: 888, width: 123, height: 124 })
    const out = computeMindmapLayout([root])
    const r = byId(out, 'root')
    expect(r.x).toBe(999)
    expect(r.y).toBe(888)
    expect(r).toBe(root) // pushed as-is
  })

  it('arranges L1 nodes radially around the root at a consistent radius', () => {
    const out = computeMindmapLayout([
      node({ id: 'root', depth: 0 }),
      node({ id: 'a', parentId: 'root', depth: 1, sortOrder: 0 }),
      node({ id: 'b', parentId: 'root', depth: 1, sortOrder: 1 }),
      node({ id: 'c', parentId: 'root', depth: 1, sortOrder: 2 }),
    ])
    const root = byId(out, 'root')
    const l1s = ['a', 'b', 'c'].map(id => byId(out, id))
    const radii = l1s.map(n => dist(n, root))
    // all roughly equidistant from root center
    for (const r of radii) expect(r).toBeCloseTo(radii[0], 0)
    // L1 nodes are pills of uniform width
    const widths = new Set(l1s.map(n => n.width))
    expect(widths.size).toBe(1)
    expect(l1s[0].height).toBe(44) // L1_H
  })

  it('renders L2 and L3 children as circles (width === height)', () => {
    const out = computeMindmapLayout([
      node({ id: 'root', depth: 0 }),
      node({ id: 'l1', parentId: 'root', depth: 1, sortOrder: 0 }),
      node({ id: 'l2', parentId: 'l1', depth: 2, sortOrder: 0 }),
      node({ id: 'l3', parentId: 'l2', depth: 3, sortOrder: 0 }),
    ])
    const l2 = byId(out, 'l2')
    const l3 = byId(out, 'l3')
    expect(l2.width).toBe(l2.height)
    expect(l2.width).toBeGreaterThanOrEqual(80) // L2_CIRCLE_SIZE min
    expect(l3.width).toBe(l3.height)
    expect(l3.width).toBeGreaterThanOrEqual(66) // L3 min
  })

  it('assigns per-depth font sizes', () => {
    const out = computeMindmapLayout([
      node({ id: 'root', depth: 0 }),
      node({ id: 'l1', parentId: 'root', depth: 1, sortOrder: 0 }),
      node({ id: 'l2', parentId: 'l1', depth: 2, sortOrder: 0 }),
      node({ id: 'l3', parentId: 'l2', depth: 3, sortOrder: 0 }),
      node({ id: 'l4', parentId: 'l3', depth: 4, sortOrder: 0 }),
    ])
    expect(byId(out, 'l1').fontSize).toBe(18)
    expect(byId(out, 'l2').fontSize).toBe(13)
    expect(byId(out, 'l3').fontSize).toBe(11)
    // depth 4 falls back to DEFAULT_FONT_SIZE
    expect(byId(out, 'l4').fontSize).toBe(11)
  })

  it('keeps manually-positioned non-root nodes in place', () => {
    const out = computeMindmapLayout([
      node({ id: 'root', depth: 0 }),
      node({ id: 'fixed', parentId: 'root', depth: 1, sortOrder: 0, manuallyPositioned: true, x: 1234, y: 5678, width: 50, height: 50 }),
    ])
    const fixed = byId(out, 'fixed')
    expect(fixed.x).toBe(1234)
    expect(fixed.y).toBe(5678)
  })

  it('widens L1 pills that have an icon/emoji versus plain ones', () => {
    const plain = computeMindmapLayout([
      node({ id: 'root', depth: 0 }),
      node({ id: 'l1', parentId: 'root', depth: 1, sortOrder: 0, title: 'Topic' }),
    ])
    const withIcon = computeMindmapLayout([
      node({ id: 'root', depth: 0 }),
      node({ id: 'l1', parentId: 'root', depth: 1, sortOrder: 0, title: 'Topic', icon: 'star' }),
    ])
    expect(byId(withIcon, 'l1').width).toBeGreaterThan(byId(plain, 'l1').width)
  })

  it('appends nodes that are not reachable from the root (orphans)', () => {
    const out = computeMindmapLayout([
      node({ id: 'root', depth: 0 }),
      node({ id: 'l1', parentId: 'root', depth: 1, sortOrder: 0 }),
      node({ id: 'orphan', parentId: 'ghost', depth: 1, sortOrder: 0 }),
    ])
    expect(byId(out, 'orphan')).toBeDefined()
    expect(out).toHaveLength(3)
  })

  it('resolves overlaps so deeper nodes are pushed apart (no two leaves overlap)', () => {
    // Many L2 leaves under one L1 forces tight packing → exercises resolveOverlaps
    const out = computeMindmapLayout([
      node({ id: 'root', depth: 0 }),
      node({ id: 'l1', parentId: 'root', depth: 1, sortOrder: 0 }),
      ...Array.from({ length: 10 }, (_, k) =>
        node({ id: `l2_${k}`, parentId: 'l1', depth: 2, sortOrder: k, title: `Child ${k}` }),
      ),
    ])
    const leaves = out.filter(n => n.depth === 2)
    const pad = 24
    for (let i = 0; i < leaves.length; i++) {
      for (let j = i + 1; j < leaves.length; j++) {
        const a = leaves[i]
        const b = leaves[j]
        const ox = Math.min(a.x + a.width + pad, b.x + b.width + pad) - Math.max(a.x, b.x)
        const oy = Math.min(a.y + a.height + pad, b.y + b.height + pad) - Math.max(a.y, b.y)
        // not fully overlapping in both axes after resolution
        expect(ox > 0 && oy > 0).toBe(false)
      }
    }
  })

  it('pushes apart overlapping nodes of different depths (asymmetric push)', () => {
    // Two manually-positioned nodes of different depths sitting on top of each other.
    // Deeper one should be pushed; both are non-root so resolveOverlaps engages.
    const out = computeMindmapLayout([
      node({ id: 'root', depth: 0 }),
      node({ id: 'shallow', parentId: 'root', depth: 1, sortOrder: 0, manuallyPositioned: true, x: 100, y: 100, width: 80, height: 80 }),
      node({ id: 'deep', parentId: 'shallow', depth: 2, sortOrder: 0, manuallyPositioned: true, x: 110, y: 110, width: 80, height: 80 }),
    ])
    const shallow = byId(out, 'shallow')
    const deep = byId(out, 'deep')
    // they no longer fully overlap: deeper node moved away
    const sepX = Math.abs((shallow.x + shallow.width / 2) - (deep.x + deep.width / 2))
    const sepY = Math.abs((shallow.y + shallow.height / 2) - (deep.y + deep.height / 2))
    expect(sepX + sepY).toBeGreaterThan(20)
  })

  it('handles two nodes sharing the exact same center (zero distance fallback)', () => {
    // Identical centers -> dist === 0 -> the "|| 1" fallback keeps math finite.
    // p/q are depth >= 2 so their widths are NOT overridden by the uniform L1 width,
    // letting their centers coincide exactly.
    const out = computeMindmapLayout([
      node({ id: 'root', depth: 0 }),
      node({ id: 'l1', parentId: 'root', depth: 1, sortOrder: 0 }),
      node({ id: 'p', parentId: 'l1', depth: 2, sortOrder: 0, manuallyPositioned: true, x: 200, y: 200, width: 60, height: 60 }),
      node({ id: 'q', parentId: 'p', depth: 3, sortOrder: 0, manuallyPositioned: true, x: 200, y: 200, width: 60, height: 60 }),
    ])
    // The "|| 1" fallback prevents a divide-by-zero: positions stay finite (not NaN).
    // With identical centers the normalized push direction is zero, so the
    // coincident nodes are left in place rather than producing NaN.
    for (const n of out) {
      expect(Number.isFinite(n.x)).toBe(true)
      expect(Number.isFinite(n.y)).toBe(true)
    }
    const p = byId(out, 'p')
    const q = byId(out, 'q')
    expect(p.x).toBe(q.x)
    expect(p.y).toBe(q.y)
  })

  it('distributes a minimum arc when there are more children than the allocated spread', () => {
    // A single L1 with many L2s: minArc (children*MIN_ARC) exceeds allocated arc,
    // exercising the Math.max(arcSpread, minArc) min-arc branch.
    const out = computeMindmapLayout([
      node({ id: 'root', depth: 0 }),
      node({ id: 'l1', parentId: 'root', depth: 1, sortOrder: 0 }),
      ...Array.from({ length: 12 }, (_, k) =>
        node({ id: `c${k}`, parentId: 'l1', depth: 2, sortOrder: k }),
      ),
    ])
    const kids = out.filter(n => n.depth === 2)
    expect(kids).toHaveLength(12)
    // all finite
    for (const k of kids) {
      expect(Number.isFinite(k.x)).toBe(true)
      expect(Number.isFinite(k.y)).toBe(true)
    }
  })

  it('handles deep (depth 4+) subtrees through the default branches', () => {
    const out = computeMindmapLayout([
      node({ id: 'root', depth: 0 }),
      node({ id: 'l1', parentId: 'root', depth: 1, sortOrder: 0 }),
      node({ id: 'l2', parentId: 'l1', depth: 2, sortOrder: 0 }),
      node({ id: 'l3', parentId: 'l2', depth: 3, sortOrder: 0 }),
      node({ id: 'l4', parentId: 'l3', depth: 4, sortOrder: 0 }),
      node({ id: 'l5', parentId: 'l4', depth: 5, sortOrder: 0 }),
    ])
    for (const n of out) {
      expect(Number.isFinite(n.x)).toBe(true)
      expect(Number.isFinite(n.y)).toBe(true)
      expect(n.width).toBeGreaterThan(0)
      expect(n.height).toBeGreaterThan(0)
    }
  })

  it('sorts siblings with no sortOrder via the fallback (treated as 0)', () => {
    // No sortOrder -> exercises the (sortOrder ?? 0) fallback for L1 and deeper sorts
    const out = computeMindmapLayout([
      node({ id: 'root', depth: 0 }),
      node({ id: 'a', parentId: 'root', depth: 1 }),
      node({ id: 'b', parentId: 'root', depth: 1 }),
      node({ id: 'a1', parentId: 'a', depth: 2 }),
      node({ id: 'a2', parentId: 'a', depth: 2 }),
    ])
    expect(out).toHaveLength(5)
    for (const n of out) {
      expect(Number.isFinite(n.x)).toBe(true)
      expect(Number.isFinite(n.y)).toBe(true)
    }
  })

  it('produces finite numeric positions and positive sizes for a broad tree', () => {
    const out = computeMindmapLayout([
      node({ id: 'root', depth: 0 }),
      node({ id: 'a', parentId: 'root', depth: 1, sortOrder: 0 }),
      node({ id: 'b', parentId: 'root', depth: 1, sortOrder: 1 }),
      node({ id: 'a1', parentId: 'a', depth: 2, sortOrder: 0 }),
      node({ id: 'a2', parentId: 'a', depth: 2, sortOrder: 1 }),
      node({ id: 'b1', parentId: 'b', depth: 2, sortOrder: 0 }),
      node({ id: 'a1x', parentId: 'a1', depth: 3, sortOrder: 0 }),
    ])
    for (const n of out) {
      expect(Number.isFinite(n.x)).toBe(true)
      expect(Number.isFinite(n.y)).toBe(true)
      expect(n.width).toBeGreaterThan(0)
      expect(n.height).toBeGreaterThan(0)
    }
  })
})
