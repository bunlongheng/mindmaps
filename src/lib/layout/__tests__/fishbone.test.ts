import { describe, it, expect } from 'vitest'
import { computeFishboneLayout, FISHBONE_SLANT } from '../fishbone'
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
    expect(root.height).toBe(54)
    expect(root.y).toBe(SPINE_Y - 54 / 2)
    expect(root.width).toBeGreaterThanOrEqual(200) // depth-0 min
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

  it('caps auto width at 500 for very long titles', () => {
    const out = computeFishboneLayout([
      node({ id: 'root', depth: 0, title: 'x'.repeat(400) }),
    ])
    expect(byId(out, 'root').width).toBe(500)
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
    // above: k=0 aligns with l2 top, k=1 stacks upward (smaller y)
    expect(t3a.y).toBe(t2.y) // k=0 -> dir*0 offset
    expect(t3b.y).toBeLessThan(t3a.y)
    // L3 x sits to the right of its L2
    expect(t3a.x).toBe(t2.x + t2.width + 16)

    const b2 = byId(out, 'b2')
    const b3a = byId(out, 'b3a')
    const b3b = byId(out, 'b3b')
    expect(b3a.y).toBe(b2.y)
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
