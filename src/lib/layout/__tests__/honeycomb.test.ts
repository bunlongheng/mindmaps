import { describe, it, expect } from 'vitest'
import { computeHoneycombLayout } from '../honeycomb'
import { hexRadius, hexCellRadius, meshCellRadius, HEX_DIRS, axialToCenter } from '../../hex'
import type { MindmapNode } from '../../../types'

function node(overrides: Partial<MindmapNode> & { id: string }): MindmapNode {
  return {
    title: 'Node',
    color: '#6366f1',
    parentId: null,
    depth: 0, combStyle: 'web' as const,
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

/** root + 8 L1 topics, each with 3 to 6 L2 children. */
function fixture(): MindmapNode[] {
  const out: MindmapNode[] = [node({ id: 'root', depth: 0, title: 'Everything' })]
  const shape = [3, 4, 5, 6, 3, 4, 5, 6]
  shape.forEach((kids, t) => {
    const l1 = `l1-${t}`
    out.push(node({ id: l1, depth: 1, parentId: 'root', sortOrder: t, title: `Topic ${t}` }))
    for (let i = 0; i < kids; i++) {
      out.push(node({ id: `${l1}-${i}`, depth: 2, parentId: l1, sortOrder: i, title: `Item ${t}.${i}` }))
    }
  })
  return out
}

describe('computeHoneycombLayout', () => {
  it('sizes every node to width === height === 2 * its text-fit radius, never under the depth floor', () => {
    const placed = computeHoneycombLayout(fixture())
    for (const n of placed) {
      const r = hexCellRadius(n)
      expect(r).toBeGreaterThanOrEqual(hexRadius(n.depth))
      expect(n.width).toBe(2 * r)
      expect(n.height).toBe(2 * r)
    }
  })

  it('never overlaps two cells beyond their bounding circles', () => {
    const placed = computeHoneycombLayout(fixture())
    for (let i = 0; i < placed.length; i++) {
      for (let j = i + 1; j < placed.length; j++) {
        const a = placed[i], b = placed[j]
        const ra = a.width / 2, rb = b.width / 2
        expect(dist(a, b)).toBeGreaterThanOrEqual(ra + rb - 1)
      }
    }
  })

  it('places every L2 cell farther from the root than its parent', () => {
    const placed = computeHoneycombLayout(fixture())
    const root = byId(placed, 'root')
    for (const n of placed) {
      if (n.depth !== 2 || !n.parentId) continue
      const parent = byId(placed, n.parentId)
      expect(dist(n, root)).toBeGreaterThan(dist(parent, root))
    }
  })

  it('keeps manually positioned nodes at their own x, y', () => {
    const nodes = fixture()
    const idx = nodes.findIndex(n => n.id === 'l1-0')
    nodes[idx] = { ...nodes[idx], manuallyPositioned: true, x: 500, y: -300, width: 40, height: 40 }
    const placed = computeHoneycombLayout(nodes)
    const pinned = byId(placed, 'l1-0')
    expect(pinned.x).toBe(500)
    expect(pinned.y).toBe(-300)
    expect(pinned.width).toBe(40)
    expect(pinned.height).toBe(40)
  })
})

describe('computeHoneycombLayout - mesh (the default)', () => {
  const mk = (id: string, parentId: string | null, depth: number, sortOrder = 0, title = id) =>
    ({ id, title, color: '#D94F3A', parentId, depth, sortOrder, x: 0, y: 0, width: 0, height: 0 })
  const fixture = () => {
    const nodes = [mk('root', null, 0, 0, 'Root')]
    for (let i = 0; i < 8; i++) {
      nodes.push(mk(`l1-${i}`, 'root', 1, i, `Topic ${i}`))
      for (let j = 0; j < 3 + (i % 4); j++) {
        nodes.push(mk(`l2-${i}-${j}`, `l1-${i}`, 2, j, `Detail ${i}.${j} with a few words`))
        if (j % 2 === 0) nodes.push(mk(`l3-${i}-${j}`, `l2-${i}-${j}`, 3, 0, `Leaf ${i}.${j}`))
      }
    }
    return nodes
  }
  it('gives every cell the 1 shared radius and puts the root at the origin', () => {
    const nodes = fixture()
    const out = computeHoneycombLayout(nodes)
    const R = meshCellRadius(nodes)
    for (const n of out) { expect(n.width).toBe(2 * R); expect(n.height).toBe(2 * R) }
    const root = out.find(n => n.parentId === null)!
    expect(root.x + root.width / 2).toBeCloseTo(0, 5)
    expect(root.y + root.height / 2).toBeCloseTo(0, 5)
  })
  it('tiles: no 2 cells overlap, and every node touches a cell of its own branch', () => {
    const nodes = fixture()
    const out = computeHoneycombLayout(nodes)
    const R = out[0].width / 2
    const touch = Math.sqrt(3) * R
    const c = (n: { x: number; y: number; width: number; height: number }) => ({ x: n.x + n.width / 2, y: n.y + n.height / 2 })
    for (let i = 0; i < out.length; i++) for (let j = i + 1; j < out.length; j++) {
      const a = c(out[i]), b = c(out[j])
      expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThanOrEqual(touch - 0.01)
    }
    const byId = new Map(out.map(n => [n.id, n]))
    const branch = (n: { id: string; parentId: string | null }): string => {
      let cur = byId.get(n.id)!
      while (cur.parentId && byId.get(cur.parentId)!.parentId !== null) cur = byId.get(cur.parentId)!
      return cur.id
    }
    for (const n of out) {
      if (n.depth <= 1) continue
      const me = c(n)
      const touching = out.filter(o => o.id !== n.id && Math.abs(Math.hypot(c(o).x - me.x, c(o).y - me.y) - touch) < 0.01)
      expect(touching.some(o => branch(o) === branch(n))).toBe(true)
    }
  })
  it('seats every depth-1 topic against the root when there are 6 or fewer', () => {
    const nodes = [mk('root', null, 0, 0, 'Root'), ...[0, 1, 2, 3, 4, 5].map(i => mk(`t${i}`, 'root', 1, i, `T${i}`))]
    const out = computeHoneycombLayout(nodes)
    const R = out[0].width / 2
    const rc = { x: out[0].x + R, y: out[0].y + R }
    for (const n of out.filter(n => n.depth === 1)) {
      expect(Math.hypot(n.x + R - rc.x, n.y + R - rc.y)).toBeCloseTo(Math.sqrt(3) * R, 3)
    }
    expect(HEX_DIRS.length).toBe(6)
    expect(axialToCenter(1, 0, 10).x).toBeCloseTo(10 * Math.sqrt(3), 5)
  })
})
