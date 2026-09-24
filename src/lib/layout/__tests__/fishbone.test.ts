import { describe, it, expect } from 'vitest'
import { computeFishboneLayout, FISHBONE_SLANT, autoW, fontWeightFor, boxH } from '../fishbone'
import { nodeFontSize, nodeMinWidth, nodePadX, iconZoneWidth, CHAR_W_RATIO } from '../../nodeMetrics'
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

const SPINE_Y = 400

describe('computeFishboneLayout', () => {
  it('returns input unchanged when there is no root', () => {
    const input = [node({ id: 'a', parentId: 'x', depth: 1 })]
    expect(computeFishboneLayout(input)).toBe(input)
  })

  it('places a lone root on the spine and auto-sizes its width', () => {
    const out = computeFishboneLayout([node({ id: 'root', depth: 0, title: 'Problem' })])
    expect(out).toHaveLength(1)
    const root = byId(out, 'root')
    expect(root.x).toBe(120)
    expect(root.height).toBe(boxH(0))
    expect(root.y).toBe(SPINE_Y - boxH(0) / 2)
    expect(root.width).toBeGreaterThanOrEqual(nodeMinWidth(0)) // depth-0 min
    expect(root.manuallyPositioned).toBe(false)
  })

  it('auto-sizes root wider for a long title and respects icon/emoji on root', () => {
    const plain = computeFishboneLayout([node({ id: 'root', depth: 0, title: 'X' })])
    const long = computeFishboneLayout([
      node({
        id: 'root',
        depth: 0,
        title: 'A very long root cause analysis problem statement title',
      }),
    ])
    expect(byId(long, 'root').width).toBeGreaterThan(byId(plain, 'root').width)
    const iconRoot = computeFishboneLayout([node({ id: 'root', depth: 0, title: 'X', emoji: '🐟' })])
    expect(byId(iconRoot, 'root').width).toBeGreaterThanOrEqual(byId(plain, 'root').width)
  })

  it('caps auto width at 1200 for very long titles', () => {
    const out = computeFishboneLayout([
      node({ id: 'root', depth: 0, title: 'x'.repeat(400) }),
    ])
    expect(byId(out, 'root').width).toBe(1200)
  })

  it('alternates L1 bones above and below the spine', () => {
    const out = computeFishboneLayout([
      node({ id: 'root', depth: 0 }),
      node({ id: 'l1a', parentId: 'root', depth: 1, sortOrder: 0 }), // even -> above
      node({ id: 'l1b', parentId: 'root', depth: 1, sortOrder: 1 }), // odd -> below
    ])
    const a = byId(out, 'l1a')
    const b = byId(out, 'l1b')
    // above bone center is well above spine; below bone center well below
    expect(a.y + a.height / 2).toBeLessThan(SPINE_Y)
    expect(b.y + b.height / 2).toBeGreaterThan(SPINE_Y)
    // bones march to the right
    expect(b.x).toBeGreaterThan(a.x)
  })

  it('grows bone height when an L1 has many L2 children', () => {
    const few = computeFishboneLayout([
      node({ id: 'root', depth: 0 }),
      node({ id: 'l1', parentId: 'root', depth: 1, sortOrder: 0 }),
      node({ id: 'c1', parentId: 'l1', depth: 2, sortOrder: 0 }),
    ])
    const many = computeFishboneLayout([
      node({ id: 'root', depth: 0 }),
      node({ id: 'l1', parentId: 'root', depth: 1, sortOrder: 0 }),
      ...Array.from({ length: 8 }, (_, k) =>
        node({ id: `c${k}`, parentId: 'l1', depth: 2, sortOrder: k }),
      ),
    ])
    // L1 tip farther from spine (smaller y, since above) when many children force a taller bone
    expect(byId(many, 'l1').y).toBeLessThan(byId(few, 'l1').y)
  })

  it('positions L2 nodes along the diagonal, near edge of L1 box', () => {
    const out = computeFishboneLayout([
      node({ id: 'root', depth: 0 }),
      node({ id: 'l1', parentId: 'root', depth: 1, sortOrder: 0 }), // above
      node({ id: 'l2a', parentId: 'l1', depth: 2, sortOrder: 0 }),
      node({ id: 'l2b', parentId: 'l1', depth: 2, sortOrder: 1 }),
    ])
    const l1 = byId(out, 'l1')
    const a = byId(out, 'l2a')
    const b = byId(out, 'l2b')
    // L2 nodes sit between the spine and the L1 tip vertically (above case)
    expect(a.y).toBeGreaterThan(l1.y)
    expect(a.y).toBeLessThan(SPINE_Y)
    // j=0 is furthest from the spine first (higher up / smaller y) than j=1
    expect(a.y).toBeLessThan(b.y)
    // L2 x offset to the right of the diagonal point
    expect(a.x).toBeGreaterThan(l1.x - l1.width)
  })

  it('positions L2 nodes downward for a below-spine bone', () => {
    const out = computeFishboneLayout([
      node({ id: 'root', depth: 0 }),
      node({ id: 'top', parentId: 'root', depth: 1, sortOrder: 0 }), // above
      node({ id: 'bot', parentId: 'root', depth: 1, sortOrder: 1 }), // below
      node({ id: 'b1', parentId: 'bot', depth: 2, sortOrder: 0 }),
      node({ id: 'b2', parentId: 'bot', depth: 2, sortOrder: 1 }),
    ])
    const b1 = byId(out, 'b1')
    const b2 = byId(out, 'b2')
    // below the spine, L2 nodes are below spine center
    expect(b1.y).toBeGreaterThan(SPINE_Y)
    // j=0 is furthest from the spine first (lower / larger y) than j=1
    expect(b1.y).toBeGreaterThan(b2.y)
  })

  it('stacks L3 nodes away from the spine (above stacks up, below stacks down)', () => {
    const out = computeFishboneLayout([
      node({ id: 'root', depth: 0 }),
      node({ id: 'top', parentId: 'root', depth: 1, sortOrder: 0 }), // above
      node({ id: 'bot', parentId: 'root', depth: 1, sortOrder: 1 }), // below
      node({ id: 't2', parentId: 'top', depth: 2, sortOrder: 0 }),
      node({ id: 't3a', parentId: 't2', depth: 3, sortOrder: 0 }),
      node({ id: 't3b', parentId: 't2', depth: 3, sortOrder: 1 }),
      node({ id: 'b2', parentId: 'bot', depth: 2, sortOrder: 0 }),
      node({ id: 'b3a', parentId: 'b2', depth: 3, sortOrder: 0 }),
      node({ id: 'b3b', parentId: 'b2', depth: 3, sortOrder: 1 }),
    ])
    const t2 = byId(out, 't2')
    const t3a = byId(out, 't3a')
    const t3b = byId(out, 't3b')
    // The L3 stack is centred on L2's own diagonal anchor, so k=0 (t3a) still sits
    // nearer the spine side of the block and k=1 (t3b) stacks further away (smaller y).
    expect(t3b.y).toBeLessThan(t3a.y)
    // L3 x sits to the right of its L2
    expect(t3a.x).toBe(t2.x + t2.width + 16)

    const b3a = byId(out, 'b3a')
    const b3b = byId(out, 'b3b')
    expect(b3b.y).toBeGreaterThan(b3a.y) // below stacks downward
  })

  it('FISHBONE_SLANT constant is exported and used as the diagonal offset', () => {
    expect(FISHBONE_SLANT).toBe(90)
    const out = computeFishboneLayout([
      node({ id: 'root', depth: 0, title: 'R' }),
      node({ id: 'l1', parentId: 'root', depth: 1, sortOrder: 0 }),
    ])
    const root = byId(out, 'root')
    const l1 = byId(out, 'l1')
    // L1 center x = spineOriginX + SPINE_SEG + SLANT; spineOriginX = ROOT_X + rootW
    const spineOriginX = root.x + root.width
    const expectedL1CX = spineOriginX + 340 + FISHBONE_SLANT
    expect(l1.x + l1.width / 2).toBeCloseTo(expectedL1CX, 5)
  })

  it('respects icon/emoji on L1, L2 and L3 (wider than plain equivalents)', () => {
    const out = computeFishboneLayout([
      node({ id: 'root', depth: 0 }),
      node({ id: 'l1', parentId: 'root', depth: 1, sortOrder: 0, title: 'Cat', icon: 'tag' }),
      node({ id: 'l2', parentId: 'l1', depth: 2, sortOrder: 0, title: 'Sub', emoji: '⭐' }),
      node({ id: 'l3', parentId: 'l2', depth: 3, sortOrder: 0, title: 'Leaf', icon: 'dot' }),
    ])
    const plain = computeFishboneLayout([
      node({ id: 'root', depth: 0 }),
      node({ id: 'l1', parentId: 'root', depth: 1, sortOrder: 0, title: 'Cat' }),
      node({ id: 'l2', parentId: 'l1', depth: 2, sortOrder: 0, title: 'Sub' }),
      node({ id: 'l3', parentId: 'l2', depth: 3, sortOrder: 0, title: 'Leaf' }),
    ])
    expect(byId(out, 'l1').width).toBeGreaterThanOrEqual(byId(plain, 'l1').width)
    expect(byId(out, 'l2').width).toBeGreaterThanOrEqual(byId(plain, 'l2').width)
    expect(byId(out, 'l3').width).toBeGreaterThanOrEqual(byId(plain, 'l3').width)
  })

  it('sorts siblings with no sortOrder via the fallback (treated as 0)', () => {
    // No sortOrder anywhere -> exercises the (sortOrder ?? 0) fallback at L1/L2/L3
    const out = computeFishboneLayout([
      node({ id: 'root', depth: 0 }),
      node({ id: 'l1a', parentId: 'root', depth: 1 }),
      node({ id: 'l1b', parentId: 'root', depth: 1 }),
      node({ id: 'l2a', parentId: 'l1a', depth: 2 }),
      node({ id: 'l2b', parentId: 'l1a', depth: 2 }),
      node({ id: 'l3a', parentId: 'l2a', depth: 3 }),
      node({ id: 'l3b', parentId: 'l2a', depth: 3 }),
    ])
    expect(out).toHaveLength(7)
    for (const n of out) {
      expect(Number.isFinite(n.x)).toBe(true)
      expect(Number.isFinite(n.y)).toBe(true)
    }
  })

  it('does not clip "Appliances" with an icon at depth 1', () => {
    // jsdom has no canvas 2d context, so autoW falls back to the same per-char estimate here.
    const title = 'Appliances'
    const fallbackMeasured = title.length * nodeFontSize(1) * CHAR_W_RATIO
    const pad = 2 * nodePadX(1) // clear space on each side of the text
    const iconZone = iconZoneWidth(1, boxH(1)) // L1 icon badge (box height) + gap
    const w = autoW(title, 1, true)
    expect(w).toBeGreaterThanOrEqual(fallbackMeasured + pad + iconZone)
  })

  it('does not clip a 60-character title - grows past the old 500px clamp instead', () => {
    const title = 'x'.repeat(60)
    const fallbackMeasured = title.length * nodeFontSize(1) * CHAR_W_RATIO // jsdom fallback
    const w = autoW(title, 1, false)
    expect(w).toBeGreaterThanOrEqual(fallbackMeasured) // fits the measured text - not silently cut
    expect(w).toBeLessThanOrEqual(1200) // documented max clamp
  })

  it('applies the same measured-width + padding + icon-zone treatment at every fishbone depth', () => {
    for (const depth of [0, 1, 2, 3] as const) {
      const title = 'Cookware'
      const fallbackMeasured = title.length * nodeFontSize(depth) * CHAR_W_RATIO
      const iconZone = iconZoneWidth(depth, boxH(depth))
      const w = autoW(title, depth, true)
      expect(w).toBeGreaterThanOrEqual(fallbackMeasured + 2 * nodePadX(depth) + iconZone)
    }
  })

  it('falls back to the per-char estimate without throwing when no canvas 2d context exists (jsdom)', () => {
    expect(() => autoW('Cookware', 1, true)).not.toThrow()
    const w = autoW('Cookware', 1, true)
    expect(w).toBeGreaterThanOrEqual(nodeMinWidth(1)) // depth-1 min floor
  })

  it('mirrors Node.tsx fontWeight: bold is always 700, else depth 0/1 -> 500, depth 2/3 -> 400', () => {
    expect(fontWeightFor(0, true)).toBe('700')
    expect(fontWeightFor(1, true)).toBe('700')
    expect(fontWeightFor(2, true)).toBe('700')
    expect(fontWeightFor(3, true)).toBe('700')
    expect(fontWeightFor(0, false)).toBe('500')
    expect(fontWeightFor(1, false)).toBe('500')
    expect(fontWeightFor(2, false)).toBe('400')
    expect(fontWeightFor(3, false)).toBe('400')
  })

  it('does not clip a bold title - measures at weight 700, not 600', () => {
    // jsdom has no canvas 2d context, so autoW falls back to the same per-char estimate here
    // (the fallback doesn't vary by weight, but this locks in that the bold flag threads through
    // without narrowing the box, and pairs with the fontWeightFor test that checks the real weight).
    const title = 'Appliances'
    const fallbackMeasured = title.length * nodeFontSize(1) * CHAR_W_RATIO
    const pad = 2 * nodePadX(1)
    const iconZone = iconZoneWidth(1, boxH(1))
    const w = autoW(title, 1, true, true) // bold: true
    expect(w).toBeGreaterThanOrEqual(fallbackMeasured + pad + iconZone)
    expect(w).toBeGreaterThanOrEqual(autoW(title, 1, true, false)) // bold never narrower than plain
  })

  it('produces finite numeric positions and positive sizes for every node', () => {
    const out = computeFishboneLayout([
      node({ id: 'root', depth: 0 }),
      node({ id: 'l1a', parentId: 'root', depth: 1, sortOrder: 0 }),
      node({ id: 'l1b', parentId: 'root', depth: 1, sortOrder: 1 }),
      node({ id: 'l2', parentId: 'l1a', depth: 2, sortOrder: 0 }),
      node({ id: 'l3', parentId: 'l2', depth: 3, sortOrder: 0 }),
    ])
    for (const n of out) {
      expect(Number.isFinite(n.x)).toBe(true)
      expect(Number.isFinite(n.y)).toBe(true)
      expect(n.width).toBeGreaterThan(0)
      expect(n.height).toBeGreaterThan(0)
      expect(n.manuallyPositioned).toBe(false)
    }
  })
})
