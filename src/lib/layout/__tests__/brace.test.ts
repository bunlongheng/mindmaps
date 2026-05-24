import { describe, it, expect } from 'vitest'
import { computeBraceLayout, BRACE_GAP } from '../brace'
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

describe('computeBraceLayout', () => {
  it('returns input unchanged when there is no root', () => {
    const input = [node({ id: 'a', parentId: 'missing', depth: 1 })]
    const out = computeBraceLayout(input)
    expect(out).toBe(input)
  })

  it('returns input unchanged on empty array', () => {
    const input: MindmapNode[] = []
    expect(computeBraceLayout(input)).toBe(input)
  })

  it('places a lone root with default size at the fixed root position', () => {
    const out = computeBraceLayout([node({ id: 'root', depth: 0 })])
    expect(out).toHaveLength(1)
    const root = byId(out, 'root')
    expect(root.x).toBe(120)
    expect(root.width).toBe(180) // default depth-0 width
    expect(root.height).toBe(52) // default depth-0 height
    // y is centered around cy=400 with height 52
    expect(root.y).toBe(400 - 52 / 2)
    expect(root.manuallyPositioned).toBe(false)
  })

  it('uses stored width/height when greater than zero', () => {
    const out = computeBraceLayout([node({ id: 'root', depth: 0, width: 240, height: 80 })])
    const root = byId(out, 'root')
    expect(root.width).toBe(240)
    expect(root.height).toBe(80)
    expect(root.y).toBe(400 - 80 / 2)
  })

  it('places children to the right of the parent separated by BRACE_GAP', () => {
    const out = computeBraceLayout([
      node({ id: 'root', depth: 0 }),
      node({ id: 'c1', parentId: 'root', depth: 1, sortOrder: 0 }),
      node({ id: 'c2', parentId: 'root', depth: 1, sortOrder: 1 }),
    ])
    const root = byId(out, 'root')
    const c1 = byId(out, 'c1')
    const c2 = byId(out, 'c2')
    const expectedChildX = root.x + root.width + BRACE_GAP
    expect(c1.x).toBe(expectedChildX)
    expect(c2.x).toBe(expectedChildX)
    // c1 sorts above c2
    expect(c1.y).toBeLessThan(c2.y)
    // default depth-1 sizes
    expect(c1.width).toBe(160)
    expect(c1.height).toBe(44)
  })

  it('sorts children by sortOrder (out-of-order input still ordered)', () => {
    const out = computeBraceLayout([
      node({ id: 'root', depth: 0 }),
      node({ id: 'b', parentId: 'root', depth: 1, sortOrder: 5, title: 'B' }),
      node({ id: 'a', parentId: 'root', depth: 1, sortOrder: 1, title: 'A' }),
    ])
    const a = byId(out, 'a')
    const b = byId(out, 'b')
    expect(a.y).toBeLessThan(b.y)
  })

  it('treats missing sortOrder as 0', () => {
    const out = computeBraceLayout([
      node({ id: 'root', depth: 0 }),
      node({ id: 'c1', parentId: 'root', depth: 1 }),
      node({ id: 'c2', parentId: 'root', depth: 1 }),
    ])
    // both present, no crash, both placed
    expect(byId(out, 'c1')).toBeDefined()
    expect(byId(out, 'c2')).toBeDefined()
  })

  it('lays out a deep tree (3 levels) with growing depth sizes', () => {
    const out = computeBraceLayout([
      node({ id: 'root', depth: 0 }),
      node({ id: 'c1', parentId: 'root', depth: 1, sortOrder: 0 }),
      node({ id: 'gc1', parentId: 'c1', depth: 2, sortOrder: 0 }),
      node({ id: 'gc2', parentId: 'c1', depth: 2, sortOrder: 1 }),
      node({ id: 'ggc1', parentId: 'gc1', depth: 3, sortOrder: 0 }),
    ])
    const root = byId(out, 'root')
    const c1 = byId(out, 'c1')
    const gc1 = byId(out, 'gc1')
    const ggc1 = byId(out, 'ggc1')
    // increasing x at each depth
    expect(c1.x).toBeGreaterThan(root.x)
    expect(gc1.x).toBeGreaterThan(c1.x)
    expect(ggc1.x).toBeGreaterThan(gc1.x)
    // depth-3 default sizes
    expect(ggc1.width).toBe(110)
    expect(ggc1.height).toBe(32)
    // gc1 (with a child) and gc2 ordered
    expect(byId(out, 'gc1').y).toBeLessThan(byId(out, 'gc2').y)
  })

  it('caps depth-based sizing at depth 3 (deeper nodes reuse index 3)', () => {
    const out = computeBraceLayout([
      node({ id: 'root', depth: 0 }),
      node({ id: 'd1', parentId: 'root', depth: 1, sortOrder: 0 }),
      node({ id: 'd2', parentId: 'd1', depth: 2, sortOrder: 0 }),
      node({ id: 'd3', parentId: 'd2', depth: 3, sortOrder: 0 }),
      node({ id: 'd4', parentId: 'd3', depth: 4, sortOrder: 0 }),
    ])
    const d3 = byId(out, 'd3')
    const d4 = byId(out, 'd4')
    // depth 4 uses same default width/height as depth 3 (Math.min(d,3))
    expect(d4.width).toBe(d3.width)
    expect(d4.height).toBe(d3.height)
  })

  it('produces finite numeric positions for every node', () => {
    const out = computeBraceLayout([
      node({ id: 'root', depth: 0 }),
      node({ id: 'c1', parentId: 'root', depth: 1, sortOrder: 0 }),
      node({ id: 'c2', parentId: 'root', depth: 1, sortOrder: 1 }),
      node({ id: 'c3', parentId: 'root', depth: 1, sortOrder: 2 }),
      node({ id: 'gc', parentId: 'c2', depth: 2 }),
    ])
    for (const n of out) {
      expect(Number.isFinite(n.x)).toBe(true)
      expect(Number.isFinite(n.y)).toBe(true)
      expect(n.width).toBeGreaterThan(0)
      expect(n.height).toBeGreaterThan(0)
    }
  })

  it('uses a parent node stored height in subtree height calc when it has children', () => {
    // A tall parent with one tiny child: parent's own height dominates the subtree
    const out = computeBraceLayout([
      node({ id: 'root', depth: 0 }),
      node({ id: 'big', parentId: 'root', depth: 1, sortOrder: 0, height: 300 }),
      node({ id: 'tiny', parentId: 'big', depth: 2, sortOrder: 0, height: 10 }),
    ])
    const big = byId(out, 'big')
    expect(big.height).toBe(300)
    expect(Number.isFinite(big.y)).toBe(true)
  })

  it('falls back to default height when a child node omits its height', () => {
    // height undefined -> (node?.height ?? 0) hits the ?? fallback -> default depth height
    const out = computeBraceLayout([
      node({ id: 'root', depth: 0 }),
      node({ id: 'c1', parentId: 'root', depth: 1, sortOrder: 0 }),
      // child of c1 with height intentionally undefined
      { id: 'noh', title: 'No Height', color: '#000', parentId: 'c1', depth: 2, x: 0, y: 0, width: 0, height: undefined as unknown as number, sortOrder: 0 },
    ])
    const noh = byId(out, 'noh')
    // default depth-2 height applied
    expect(noh.height).toBe(36)
  })

  it('subtree height grows with many children (vertical spread)', () => {
    const single = computeBraceLayout([
      node({ id: 'root', depth: 0 }),
      node({ id: 'a', parentId: 'root', depth: 1, sortOrder: 0 }),
    ])
    const many = computeBraceLayout([
      node({ id: 'root', depth: 0 }),
      node({ id: 'a', parentId: 'root', depth: 1, sortOrder: 0 }),
      node({ id: 'b', parentId: 'root', depth: 1, sortOrder: 1 }),
      node({ id: 'c', parentId: 'root', depth: 1, sortOrder: 2 }),
      node({ id: 'd', parentId: 'root', depth: 1, sortOrder: 3 }),
    ])
    const spreadSingle = Math.max(...single.map(n => n.y)) - Math.min(...single.map(n => n.y))
    const spreadMany = Math.max(...many.map(n => n.y)) - Math.min(...many.map(n => n.y))
    expect(spreadMany).toBeGreaterThan(spreadSingle)
  })
})
