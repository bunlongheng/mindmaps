import { describe, it, expect } from 'vitest'
import { computeMindmapsLayout } from '../mindmaps-layout'
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

describe('computeMindmapsLayout', () => {
  it('returns input unchanged when there is no root', () => {
    const input = [node({ id: 'a', parentId: 'x', depth: 1 })]
    expect(computeMindmapsLayout(input)).toBe(input)
  })

  it('places a lone short-title root as a default circle', () => {
    const out = computeMindmapsLayout([node({ id: 'root', depth: 0, title: 'Hi' })])
    expect(out).toHaveLength(1)
    const root = byId(out, 'root')
    // short title (<15 chars), no shape -> circle, default 200x200
    expect(root.width).toBe(200)
    expect(root.height).toBe(200)
  })

  it('uses a stored square size for circle roots when width > 0', () => {
    const out = computeMindmapsLayout([node({ id: 'root', depth: 0, title: 'Hi', width: 260 })])
    const root = byId(out, 'root')
    expect(root.width).toBe(260)
    expect(root.height).toBe(260) // square
  })

  it('renders a long-title root as a pill (clamped width, height 64)', () => {
    const out = computeMindmapsLayout([
      node({ id: 'root', depth: 0, title: 'This title is definitely longer than fifteen chars' }),
    ])
    const root = byId(out, 'root')
    expect(root.height).toBe(64) // pill
    expect(root.width).toBeGreaterThanOrEqual(180)
    expect(root.width).toBeLessThanOrEqual(500)
  })

  it('clamps pill width to the 180px minimum for short-but-pill-shaped roots', () => {
    const out = computeMindmapsLayout([
      node({ id: 'root', depth: 0, title: 'Hi', shape: 'pill' }),
    ])
    const root = byId(out, 'root')
    expect(root.height).toBe(64)
    expect(root.width).toBe(180) // min clamp
  })

  it('clamps very long pill titles to the 500px maximum', () => {
    const out = computeMindmapsLayout([
      node({ id: 'root', depth: 0, title: 'x'.repeat(200), shape: 'pill' }),
    ])
    expect(byId(out, 'root').width).toBe(500)
  })

  it('places L1 children to the right of the root', () => {
    const out = computeMindmapsLayout([
      node({ id: 'root', depth: 0, title: 'R' }),
      node({ id: 'a', parentId: 'root', depth: 1, sortOrder: 0 }),
      node({ id: 'b', parentId: 'root', depth: 1, sortOrder: 1 }),
    ])
    const root = byId(out, 'root')
    const a = byId(out, 'a')
    const b = byId(out, 'b')
    expect(a.x).toBeGreaterThan(root.x)
    // L1 column shares an x
    expect(a.x).toBe(b.x)
    // a above b
    expect(a.y).toBeLessThan(b.y)
    // uniform L1 width
    expect(a.width).toBe(b.width)
  })

  it('roots y to the vertical midpoint of the L1 nodes', () => {
    const out = computeMindmapsLayout([
      node({ id: 'root', depth: 0, title: 'R' }),
      node({ id: 'a', parentId: 'root', depth: 1, sortOrder: 0 }),
      node({ id: 'b', parentId: 'root', depth: 1, sortOrder: 1 }),
      node({ id: 'c', parentId: 'root', depth: 1, sortOrder: 2 }),
    ])
    const root = byId(out, 'root')
    const l1s = ['a', 'b', 'c'].map(id => byId(out, id))
    const mids = l1s.map(n => n.y + n.height / 2)
    const expectedMid = (Math.min(...mids) + Math.max(...mids)) / 2
    expect(root.y + root.height / 2).toBeCloseTo(expectedMid, 5)
  })

  it('lays out a deep tree with increasing x at each depth', () => {
    const out = computeMindmapsLayout([
      node({ id: 'root', depth: 0, title: 'R' }),
      node({ id: 'l1', parentId: 'root', depth: 1, sortOrder: 0 }),
      node({ id: 'l2', parentId: 'l1', depth: 2, sortOrder: 0 }),
      node({ id: 'l3', parentId: 'l2', depth: 3, sortOrder: 0 }),
      node({ id: 'l4', parentId: 'l3', depth: 4, sortOrder: 0 }),
    ])
    const l1 = byId(out, 'l1')
    const l2 = byId(out, 'l2')
    const l3 = byId(out, 'l3')
    const l4 = byId(out, 'l4')
    expect(l2.x).toBeGreaterThan(l1.x)
    expect(l3.x).toBeGreaterThan(l2.x)
    expect(l4.x).toBeGreaterThan(l3.x)
    // depth 4 falls back to DEFAULT_HEIGHT (30)
    expect(l4.height).toBe(30)
  })

  it('uses stored width/height for non-root nodes when greater than zero', () => {
    const out = computeMindmapsLayout([
      node({ id: 'root', depth: 0, title: 'R' }),
      node({ id: 'a', parentId: 'root', depth: 1, sortOrder: 0, height: 90 }),
      node({ id: 'gc', parentId: 'a', depth: 2, sortOrder: 0, width: 150, height: 70 }),
    ])
    // L1 width is overridden by uniform width, but height is preserved
    expect(byId(out, 'a').height).toBe(90)
    const gc = byId(out, 'gc')
    expect(gc.width).toBe(150)
    expect(gc.height).toBe(70)
  })

  it('keeps a manually-positioned root at its stored x', () => {
    const out = computeMindmapsLayout([
      node({ id: 'root', depth: 0, title: 'R', manuallyPositioned: true, x: 777 }),
      node({ id: 'a', parentId: 'root', depth: 1, sortOrder: 0 }),
    ])
    expect(byId(out, 'root').x).toBe(777)
  })

  it('keeps manually-positioned descendants in place (pushed as-is)', () => {
    const out = computeMindmapsLayout([
      node({ id: 'root', depth: 0, title: 'R' }),
      node({ id: 'fixed', parentId: 'root', depth: 1, sortOrder: 0, manuallyPositioned: true, x: 4321, y: 99, width: 80, height: 30 }),
    ])
    const fixed = byId(out, 'fixed')
    expect(fixed.x).toBe(4321)
    expect(fixed.y).toBe(99)
  })

  it('honors a custom root.branchGap for the L1 column offset', () => {
    const tight = computeMindmapsLayout([
      node({ id: 'root', depth: 0, title: 'R', branchGap: 0 }),
      node({ id: 'a', parentId: 'root', depth: 1, sortOrder: 0 }),
    ])
    const wide = computeMindmapsLayout([
      node({ id: 'root', depth: 0, title: 'R', branchGap: 300 }),
      node({ id: 'a', parentId: 'root', depth: 1, sortOrder: 0 }),
    ])
    expect(byId(wide, 'a').x).toBeGreaterThan(byId(tight, 'a').x)
  })

  it('widens L1 nodes with icon/emoji and uses the widest for the uniform width', () => {
    const out = computeMindmapsLayout([
      node({ id: 'root', depth: 0, title: 'R' }),
      node({ id: 'plain', parentId: 'root', depth: 1, sortOrder: 0, title: 'Short' }),
      node({ id: 'icon', parentId: 'root', depth: 1, sortOrder: 1, title: 'Short', icon: 'star' }),
    ])
    // uniform width => both equal, and >= the icon-driven width
    const plain = byId(out, 'plain')
    const icon = byId(out, 'icon')
    expect(plain.width).toBe(icon.width)
    expect(plain.width).toBeGreaterThanOrEqual(160)
  })

  it('appends nodes unreachable from the root (orphans) at the end', () => {
    const out = computeMindmapsLayout([
      node({ id: 'root', depth: 0, title: 'R' }),
      node({ id: 'a', parentId: 'root', depth: 1, sortOrder: 0 }),
      node({ id: 'orphan', parentId: 'ghost', depth: 2, sortOrder: 0 }),
    ])
    expect(byId(out, 'orphan')).toBeDefined()
    expect(out).toHaveLength(3)
  })

  it('sorts siblings with no sortOrder via the fallback (treated as 0)', () => {
    // No sortOrder -> exercises the (sortOrder ?? 0) fallback for root-children and deeper sorts
    const out = computeMindmapsLayout([
      node({ id: 'root', depth: 0, title: 'R' }),
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

  it('produces finite numeric positions and positive sizes for every node', () => {
    const out = computeMindmapsLayout([
      node({ id: 'root', depth: 0, title: 'R' }),
      node({ id: 'a', parentId: 'root', depth: 1, sortOrder: 0 }),
      node({ id: 'b', parentId: 'root', depth: 1, sortOrder: 1 }),
      node({ id: 'a1', parentId: 'a', depth: 2, sortOrder: 0 }),
      node({ id: 'a2', parentId: 'a', depth: 2, sortOrder: 1 }),
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
