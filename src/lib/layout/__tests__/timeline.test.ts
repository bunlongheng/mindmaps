import { describe, it, expect } from 'vitest'
import { computeTimelineLayout } from '../timeline'
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

describe('computeTimelineLayout', () => {
  it('returns input unchanged when there is no root', () => {
    const input = [node({ id: 'a', parentId: 'x', depth: 1 })]
    expect(computeTimelineLayout(input)).toBe(input)
  })

  it('places a lone root with default size at the spine', () => {
    const out = computeTimelineLayout([node({ id: 'root', depth: 0 })])
    expect(out).toHaveLength(1)
    const root = byId(out, 'root')
    expect(root.x).toBe(80)
    expect(root.width).toBe(180) // default
    expect(root.height).toBe(180) // default
    expect(root.y).toBe(SPINE_Y - 180 / 2)
    expect(root.manuallyPositioned).toBe(false)
  })

  it('uses stored root width/height when greater than zero', () => {
    const out = computeTimelineLayout([node({ id: 'root', depth: 0, width: 260, height: 120 })])
    const root = byId(out, 'root')
    expect(root.width).toBe(260)
    expect(root.height).toBe(120)
    expect(root.y).toBe(SPINE_Y - 120 / 2)
  })

  it('alternates L1 nodes above and below the spine (even=above, odd=below)', () => {
    const out = computeTimelineLayout([
      node({ id: 'root', depth: 0 }),
      node({ id: 'l1a', parentId: 'root', depth: 1, sortOrder: 0 }),
      node({ id: 'l1b', parentId: 'root', depth: 1, sortOrder: 1 }),
      // L2s to make above/below visible
      node({ id: 'a-c', parentId: 'l1a', depth: 2, sortOrder: 0 }),
      node({ id: 'b-c', parentId: 'l1b', depth: 2, sortOrder: 0 }),
    ])
    const ac = byId(out, 'a-c') // under l1a (above the spine)
    const bc = byId(out, 'b-c') // under l1b (below the spine)
    // above means L2 sits above spine center
    expect(ac.y + ac.height / 2).toBeLessThan(SPINE_Y)
    expect(bc.y).toBeGreaterThan(SPINE_Y)
  })

  it('L1 nodes advance horizontally to the right', () => {
    const out = computeTimelineLayout([
      node({ id: 'root', depth: 0 }),
      node({ id: 'l1a', parentId: 'root', depth: 1, sortOrder: 0 }),
      node({ id: 'l1b', parentId: 'root', depth: 1, sortOrder: 1 }),
      node({ id: 'l1c', parentId: 'root', depth: 1, sortOrder: 2 }),
    ])
    const a = byId(out, 'l1a')
    const b = byId(out, 'l1b')
    const c = byId(out, 'l1c')
    expect(b.x).toBeGreaterThan(a.x)
    expect(c.x).toBeGreaterThan(b.x)
  })

  it('stacks L2 nodes away from the spine (above column goes up)', () => {
    const out = computeTimelineLayout([
      node({ id: 'root', depth: 0 }),
      node({ id: 'l1', parentId: 'root', depth: 1, sortOrder: 0 }), // even -> above
      node({ id: 'l2a', parentId: 'l1', depth: 2, sortOrder: 0 }),
      node({ id: 'l2b', parentId: 'l1', depth: 2, sortOrder: 1 }),
    ])
    const a = byId(out, 'l2a')
    const b = byId(out, 'l2b')
    // farther stacked node (j=1) is higher up (smaller y) when above
    expect(b.y).toBeLessThan(a.y)
  })

  it('stacks L2 nodes downward when below the spine', () => {
    const out = computeTimelineLayout([
      node({ id: 'root', depth: 0 }),
      node({ id: 'l1x', parentId: 'root', depth: 1, sortOrder: 0 }), // even, above
      node({ id: 'l1y', parentId: 'root', depth: 1, sortOrder: 1 }), // odd, below
      node({ id: 'y-a', parentId: 'l1y', depth: 2, sortOrder: 0 }),
      node({ id: 'y-b', parentId: 'l1y', depth: 2, sortOrder: 1 }),
    ])
    const a = byId(out, 'y-a')
    const b = byId(out, 'y-b')
    // below the spine, farther node (j=1) is lower down (larger y)
    expect(b.y).toBeGreaterThan(a.y)
  })

  it('places L3 nodes relative to their L2 parent (above and below cases)', () => {
    const out = computeTimelineLayout([
      node({ id: 'root', depth: 0 }),
      node({ id: 'above', parentId: 'root', depth: 1, sortOrder: 0 }), // above
      node({ id: 'below', parentId: 'root', depth: 1, sortOrder: 1 }), // below
      node({ id: 'a2', parentId: 'above', depth: 2, sortOrder: 0 }),
      node({ id: 'a3a', parentId: 'a2', depth: 3, sortOrder: 0 }),
      node({ id: 'a3b', parentId: 'a2', depth: 3, sortOrder: 1 }),
      node({ id: 'b2', parentId: 'below', depth: 2, sortOrder: 0 }),
      node({ id: 'b3a', parentId: 'b2', depth: 3, sortOrder: 0 }),
      node({ id: 'b3b', parentId: 'b2', depth: 3, sortOrder: 1 }),
    ])
    const a2 = byId(out, 'a2')
    const a3a = byId(out, 'a3a')
    const a3b = byId(out, 'a3b')
    // above: L3 goes further up than its L2
    expect(a3a.y).toBeLessThan(a2.y)
    expect(a3b.y).toBeLessThan(a3a.y)
    // share the same x column as their L2 sibling chain
    expect(a3a.x).toBe(a2.x)

    const b2 = byId(out, 'b2')
    const b3a = byId(out, 'b3a')
    const b3b = byId(out, 'b3b')
    // below: L3 goes further down than its L2
    expect(b3a.y).toBeGreaterThan(b2.y)
    expect(b3b.y).toBeGreaterThan(b3a.y)
  })

  it('uses stored L2/L3 heights when greater than zero, defaults otherwise', () => {
    const out = computeTimelineLayout([
      node({ id: 'root', depth: 0 }),
      node({ id: 'l1', parentId: 'root', depth: 1, sortOrder: 0 }),
      node({ id: 'l2-default', parentId: 'l1', depth: 2, sortOrder: 0 }),
      node({ id: 'l2-stored', parentId: 'l1', depth: 2, sortOrder: 1, height: 50 }),
      node({ id: 'l3-default', parentId: 'l2-default', depth: 3, sortOrder: 0 }),
      node({ id: 'l3-stored', parentId: 'l2-default', depth: 3, sortOrder: 1, height: 48 }),
    ])
    expect(byId(out, 'l2-default').height).toBe(36)
    expect(byId(out, 'l2-stored').height).toBe(50)
    expect(byId(out, 'l3-default').height).toBe(30)
    expect(byId(out, 'l3-stored').height).toBe(48)
  })

  it('auto-widens nodes with long titles and accounts for icon/emoji zones', () => {
    const out = computeTimelineLayout([
      node({ id: 'root', depth: 0 }),
      node({ id: 'short', parentId: 'root', depth: 1, sortOrder: 0, title: 'Hi' }),
      node({
        id: 'long',
        parentId: 'root',
        depth: 1,
        sortOrder: 1,
        title: 'A very very long timeline label that needs more width',
      }),
      node({ id: 'plainmed', parentId: 'root', depth: 1, sortOrder: 2, title: 'Medium length label' }),
      node({ id: 'icon', parentId: 'root', depth: 1, sortOrder: 3, title: 'Medium length label', icon: 'star' }),
      node({ id: 'emoji-l2', parentId: 'long', depth: 2, sortOrder: 0, title: 'X', emoji: '🚀' }),
      node({ id: 'icon-l3', parentId: 'emoji-l2', depth: 3, sortOrder: 0, title: 'Y', icon: 'bolt' }),
    ])
    const short = byId(out, 'short')
    const long = byId(out, 'long')
    expect(long.width).toBeGreaterThan(short.width)
    // short hits the min width floor (120 for L1)
    expect(short.width).toBe(120)
    // icon zone makes a same-title node wider than the plain equivalent
    expect(byId(out, 'icon').width).toBeGreaterThan(byId(out, 'plainmed').width)
    // emoji L2 and icon L3 placed without error
    expect(byId(out, 'emoji-l2')).toBeDefined()
    expect(byId(out, 'icon-l3')).toBeDefined()
  })

  it('sorts siblings with no sortOrder via the fallback (treated as 0)', () => {
    // No sortOrder -> exercises the (sortOrder ?? 0) fallback at L1/L2/L3
    const out = computeTimelineLayout([
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
    const out = computeTimelineLayout([
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
