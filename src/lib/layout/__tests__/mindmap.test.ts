import { describe, it, expect } from 'vitest'
import { computeMindmapLayout, splitSides } from '../mindmap'
import type { MindmapNode } from '../../../types'

function node(over: Partial<MindmapNode> & { id: string }): MindmapNode {
  return {
    title: 'Node', color: '#6366f1', parentId: null, depth: 0,
    x: 0, y: 0, width: 0, height: 0, ...over,
  }
}
const byId = (nodes: MindmapNode[], id: string) => nodes.find(n => n.id === id)!
const cx = (n: MindmapNode) => n.x + n.width / 2

/** Root + n topics, each with 1 leaf. */
function tree(n: number): MindmapNode[] {
  const out = [node({ id: 'root', title: 'Central Topic' })]
  for (let i = 0; i < n; i++) {
    out.push(node({ id: `t${i}`, title: `Main Topic ${i + 1}`, parentId: 'root', depth: 1, sortOrder: i }))
    out.push(node({ id: `l${i}`, title: `Sub ${i}`, parentId: `t${i}`, depth: 2, sortOrder: 0 }))
  }
  return out
}

describe('splitSides', () => {
  it('sends the first half right and the rest left', () => {
    expect(splitSides([1, 2, 3, 4])).toEqual({ right: [1, 2], left: [3, 4] })
    // Odd counts give the extra topic to the right, which is the side that reads first.
    expect(splitSides([1, 2, 3])).toEqual({ right: [1, 2], left: [3] })
    expect(splitSides([1])).toEqual({ right: [1], left: [] })
    expect(splitSides([])).toEqual({ right: [], left: [] })
  })
})

describe('computeMindmapLayout', () => {
  it('returns the input untouched when there is no root', () => {
    const input = [node({ id: 'a', parentId: 'x', depth: 1 })]
    expect(computeMindmapLayout(input)).toBe(input)
  })

  it('spreads the topics both ways around the root', () => {
    const out = computeMindmapLayout(tree(4))
    const root = byId(out, 'root')
    expect(cx(byId(out, 't0'))).toBeGreaterThan(cx(root))
    expect(cx(byId(out, 't1'))).toBeGreaterThan(cx(root))
    expect(cx(byId(out, 't2'))).toBeLessThan(cx(root))
    expect(cx(byId(out, 't3'))).toBeLessThan(cx(root))
  })

  it('keeps a subtree on the side its own topic started on', () => {
    const out = computeMindmapLayout(tree(4))
    // A right topic's leaf is further right than the topic; a left topic's is further left.
    expect(byId(out, 'l0').x).toBeGreaterThan(byId(out, 't0').x)
    expect(byId(out, 'l3').x).toBeLessThan(byId(out, 't3').x)
  })

  it('centres the root on everything hanging off it', () => {
    const out = computeMindmapLayout(tree(4))
    const root = byId(out, 'root')
    const l1cy = out.filter(n => n.depth === 1).map(n => n.y + n.height / 2)
    const mid = (Math.min(...l1cy) + Math.max(...l1cy)) / 2
    expect(root.y + root.height / 2).toBeCloseTo(mid, 5)
  })

  it('gives every auto topic the same width, so both columns line up', () => {
    const nodes = tree(4)
    nodes.find(n => n.id === 't0')!.title = 'A much longer topic title than the rest'
    const out = computeMindmapLayout(nodes)
    const widths = new Set(out.filter(n => n.depth === 1).map(n => n.width))
    expect(widths.size).toBe(1)
  })

  it('leaves a manually positioned root where it was put', () => {
    const nodes = tree(2)
    nodes[0] = { ...nodes[0], x: 42, manuallyPositioned: true }
    expect(byId(computeMindmapLayout(nodes), 'root').x).toBe(42)
  })

  it('places a lone root and passes orphans through untouched', () => {
    const orphan = node({ id: 'orphan', parentId: 'ghost', depth: 1, x: 7, y: 9 })
    const out = computeMindmapLayout([node({ id: 'root' }), orphan])
    expect(out).toHaveLength(2)
    expect(byId(out, 'orphan')).toEqual(orphan)
  })
})
