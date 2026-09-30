import { describe, it, expect } from 'vitest'
import { computeTimelineLayout } from '../timeline'
import { nodeHeight, nodeMinWidth } from '../../nodeMetrics'
import { rootCircleDiameter, rootPillWidth } from '../../rootPill'
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

  it('draws a lone root as a pill, not a circle (only mindmap keeps a round root)', () => {
    const out = computeTimelineLayout([node({ id: 'root', depth: 0 })])
    expect(out).toHaveLength(1)
    const root = byId(out, 'root')
    const h = nodeHeight(0)
    expect(root.x).toBe(80)
    expect(root.width).toBe(rootPillWidth('Node'))
    expect(root.height).toBe(h)
    expect(root.y).toBe(SPINE_Y - h / 2)
    expect(root.manuallyPositioned).toBe(false)
  })

  it('pills a long title too, instead of growing a circle around it', () => {
    const title = 'First 90 Days'
    const out = computeTimelineLayout([node({ id: 'root', depth: 0, title, width: 180, height: 180 })])
    const root = byId(out, 'root')
    expect(root.width).toBe(rootPillWidth(title))
    expect(root.height).toBe(nodeHeight(0))
  })

  it('sizes an explicit circle root to fit its own title, not a flat default', () => {
    const out = computeTimelineLayout([node({ id: 'root', depth: 0, shape: 'circle' })])
    const root = byId(out, 'root')
    const d = rootCircleDiameter('Node')
    expect(d).toBeGreaterThan(180)
    expect(root.width).toBe(d)
    expect(root.height).toBe(d)
    expect(root.y).toBe(SPINE_Y - d / 2)
  })

  it('keeps a stored size on a circle root only where it is bigger than the fitting circle', () => {
    const out = computeTimelineLayout([node({ id: 'root', depth: 0, shape: 'circle', width: 260, height: 120 })])
    const root = byId(out, 'root')
    const d = rootCircleDiameter('Node')
    expect(root.width).toBe(260)   // stored, wider than the circle that fits 'Node'
    expect(root.height).toBe(d)    // stored 120 would have clipped the title
    expect(root.y).toBe(SPINE_Y - d / 2)
  })

  it('never lets a long title overflow an explicit root circle', () => {
    const title = 'First 90 Days'
    const out = computeTimelineLayout([node({ id: 'root', depth: 0, shape: 'circle', title, width: 180, height: 180 })])
    expect(byId(out, 'root').width).toBe(rootCircleDiameter(title))
    expect(rootCircleDiameter(title)).toBeGreaterThan(180)
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

  it('keeps every child of one topic on that topic\'s own side of the spine', () => {
    const out = computeTimelineLayout([
      node({ id: 'root', depth: 0 }),
      node({ id: 'l1', parentId: 'root', depth: 1, sortOrder: 0 }),
      node({ id: 'l2a', parentId: 'l1', depth: 2, sortOrder: 0 }),
      node({ id: 'l2b', parentId: 'l1', depth: 2, sortOrder: 1 }),
      node({ id: 'l2c', parentId: 'l1', depth: 2, sortOrder: 2 }),
    ])
    const a = byId(out, 'l2a')
    const b = byId(out, 'l2b')
    const c = byId(out, 'l2c')
    const SPINE_Y = 400
    // sortOrder 0 is an even topic, so the whole block sits above the spine - and reads
    // top to bottom in sort order there, same as it would below (Xmind)
    for (const n of [a, b, c]) expect(n.y + n.height / 2).toBeLessThan(SPINE_Y)
    expect(a.y).toBeLessThan(b.y)
    expect(b.y).toBeLessThan(c.y)
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
    // L3s chain to the RIGHT of their L2 and stack in sort order, whichever side of
    // the spine the topic is on
    expect(a3a.x).toBe(a2.x + a2.width + 40)
    expect(a3b.x).toBe(a3a.x)
    expect(a3b.y).toBeGreaterThan(a3a.y)

    const b2 = byId(out, 'b2')
    const b3a = byId(out, 'b3a')
    const b3b = byId(out, 'b3b')
    expect(b3a.x).toBe(b2.x + b2.width + 40)
    expect(b3b.y).toBeGreaterThan(b3a.y)
    // the stack is centred on its L2, so it straddles the L2's own centre line
    const a2cy = a2.y + a2.height / 2
    expect(a3a.y).toBeLessThan(a2cy)
    expect(a3b.y + a3b.height).toBeGreaterThan(a2cy)
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
    expect(byId(out, 'l2-default').height).toBe(nodeHeight(2))
    expect(byId(out, 'l2-stored').height).toBe(50)
    expect(byId(out, 'l3-default').height).toBe(nodeHeight(3))
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
    // short hits the table's L1 min width floor
    expect(short.width).toBe(nodeMinWidth(1))
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
