import { describe, it, expect } from 'vitest'
import { computeMindmapLayout } from '../mindmap'
import { computeMindmapsLayout, nodeSize, place, subtreeH, autoWidth } from '../mindmaps-layout'
import { computeHoneycombLayout } from '../honeycomb'
import type { MindmapNode } from '../../../types'

function node(over: Partial<MindmapNode> & { id: string }): MindmapNode {
  return { title: 'Node', color: '#6366f1', parentId: null, depth: 0, x: 0, y: 0, width: 0, height: 0, ...over }
}

/** Root + `topics` topics, each with `kids` leaves. */
function tree(topics: number, kids: number, rootOver: Partial<MindmapNode> = {}): MindmapNode[] {
  const out = [node({ id: 'root', title: 'Root', ...rootOver })]
  for (let i = 0; i < topics; i++) {
    out.push(node({ id: `t${i}`, title: `Topic ${i}`, parentId: 'root', depth: 1, sortOrder: i }))
    for (let k = 0; k < kids; k++) out.push(node({ id: `t${i}k${k}`, title: `Leaf ${i}-${k}`, parentId: `t${i}`, depth: 2, sortOrder: k }))
  }
  return out
}

describe('computeMindmapLayout spread', () => {
  it('pushes boxes of a big tall map sideways, away from the root, without moving the root', () => {
    // 1 topic per side with many leaves makes a tall, narrow map of 40+ nodes
    const input = tree(2, 24)
    expect(input.length).toBeGreaterThanOrEqual(40)
    const out = computeMindmapLayout(input)
    const root = out.find(n => n.id === 'root')!
    const rcx = root.x + root.width / 2
    const rightTopic = out.find(n => n.id === 't0')!
    const leftTopic = out.find(n => n.id === 't1')!
    // Unspread, the right topic starts at rootRight + gap (100)
    expect(rightTopic.x).toBeGreaterThan(root.x + root.width + 100)
    expect(leftTopic.x + leftTopic.width).toBeLessThan(root.x - 100)
    expect(root.x + root.width / 2).toBe(rcx)
  })

  it('leaves a big map alone when it is already wide enough', () => {
    // 2 long chains: far wider than tall, so the spread scale stays under 1.02
    const input = [node({ id: 'root', title: 'Root' })]
    for (const side of ['a', 'b']) {
      let parent = 'root'
      for (let d = 1; d <= 22; d++) {
        const id = `${side}${d}`
        input.push(node({ id, title: `Chain ${side} ${d}`, parentId: parent, depth: d }))
        parent = id
      }
    }
    expect(input.length).toBeGreaterThanOrEqual(40)
    const out = computeMindmapLayout(input)
    const root = out.find(n => n.id === 'root')!
    const a1 = out.find(n => n.id === 'a1')!
    expect(a1.x).toBeCloseTo(root.x + root.width + 100, 0)
  })

  it('returns a small map untouched by the spread', () => {
    const out = computeMindmapLayout(tree(2, 2))
    const root = out.find(n => n.id === 'root')!
    expect(out.find(n => n.id === 't0')!.x).toBeCloseTo(root.x + root.width + 100, 0)
  })

  it('lays out a root with no topics at the default spot', () => {
    const out = computeMindmapLayout([node({ id: 'root', title: 'Alone' })])
    expect(out).toHaveLength(1)
    expect(out[0].width).toBeGreaterThan(0)
  })

  it('keeps a manually positioned root where it is and appends unreachable nodes', () => {
    const input = [...tree(2, 1, { manuallyPositioned: true, x: 10, y: 20 }), node({ id: 'orphan', parentId: 'ghost', depth: 1 })]
    const out = computeMindmapLayout(input)
    expect(out.find(n => n.id === 'root')!.x).toBe(10)
    expect(out.find(n => n.id === 'orphan')).toBeDefined()
  })
})

describe('mindmaps-layout', () => {
  it('sizes a circle root from its title and honours a stored width, and a pill for long titles', () => {
    const circle = nodeSize(node({ id: 'r', title: 'Hi', width: 400, shape: 'circle' }), 0)
    expect(circle.w).toBe(400)
    expect(circle.h).toBe(400)
    const small = nodeSize(node({ id: 'r', title: 'Hi', shape: 'circle' }), 0)
    expect(small.w).toBe(small.h)
    const pill = nodeSize(node({ id: 'r', title: 'A very long root title that cannot fit inside any circle at all, no matter what' }), 0)
    expect(pill.w).toBeGreaterThan(pill.h)
  })

  it('reserves room for an icon on depth 1 only', () => {
    const plain = autoWidth(node({ id: 'a', title: 'Some longer title' }), 1)
    expect(autoWidth(node({ id: 'a', title: 'Some longer title', emoji: '🔴' }), 1)).toBeGreaterThan(plain)
    expect(autoWidth(node({ id: 'a', title: 'Some longer title', icon: 'star' }), 2)).toBe(autoWidth(node({ id: 'a', title: 'Some longer title' }), 2))
  })

  it('wraps a run of 5+ leaves into 2 columns when cols is 2, to the right', () => {
    const nodes = tree(1, 6)
    const single = subtreeH('t0', 1, nodes, 1)
    const wrapped = subtreeH('t0', 1, nodes, 2)
    expect(wrapped).toBeLessThan(single)
    const result: MindmapNode[] = []
    place('t0', 1, 100, 200, nodes, result, true, 2)
    const leaves = result.filter(n => n.depth === 2)
    expect(leaves).toHaveLength(6)
    const xs = new Set(leaves.map(l => Math.round(l.x)))
    expect(xs.size).toBe(2)
    const topic = result.find(n => n.id === 't0')!
    expect(Math.min(...xs)).toBeGreaterThan(topic.x + topic.width)
  })

  it('wraps to the left mirrored', () => {
    const nodes = tree(1, 5)
    const result: MindmapNode[] = []
    place('t0', 1, 900, 200, nodes, result, false, 2)
    const topic = result.find(n => n.id === 't0')!
    const leaves = result.filter(n => n.depth === 2)
    expect(new Set(leaves.map(l => Math.round(l.x))).size).toBe(2)
    expect(Math.max(...leaves.map(l => l.x + l.width))).toBeLessThan(topic.x)
  })

  it('does not wrap when a child has its own children, or with 4 or fewer leaves', () => {
    const nested = tree(1, 5)
    nested.push(node({ id: 'deep', parentId: 't0k0', depth: 3 }))
    expect(subtreeH('t0', 1, nested, 2)).toBe(subtreeH('t0', 1, nested, 1))
    const few = tree(1, 4)
    expect(subtreeH('t0', 1, few, 2)).toBe(subtreeH('t0', 1, few, 1))
  })

  it('skips an unknown node id and keeps manually positioned nodes as they are', () => {
    const result: MindmapNode[] = []
    place('nope', 1, 0, 0, [], result)
    expect(result).toEqual([])
    const nodes = tree(1, 1)
    nodes[1] = { ...nodes[1], manuallyPositioned: true, x: 7, y: 9 }
    place('t0', 1, 0, 0, nodes, result)
    expect(result[0]).toBe(nodes[1])
    expect(subtreeH('missing', 1, [])).toBeGreaterThan(0)
  })

  it('lays out the logic chart with a manual-width topic and a manually positioned root', () => {
    const nodes = tree(2, 1, { manuallyPositioned: true, x: 33, y: 44 })
    nodes[1] = { ...nodes[1], widthMode: 'manual', width: 333 }
    const out = computeMindmapsLayout(nodes)
    expect(out.find(n => n.id === 'root')!.x).toBe(33)
    expect(out.find(n => n.id === 't0')!.width).toBe(333)
    const auto = out.find(n => n.id === 't1')!
    expect(auto.width).not.toBe(333)
  })

  it('returns the input when there is no root and handles all-manual topics', () => {
    const none = [node({ id: 'a', parentId: 'x', depth: 1 })]
    expect(computeMindmapsLayout(none)).toBe(none)
    const nodes = tree(1, 0)
    nodes[1] = { ...nodes[1], widthMode: 'manual', width: 250 }
    expect(computeMindmapsLayout(nodes).find(n => n.id === 't0')!.width).toBe(250)
    const lone = computeMindmapsLayout([node({ id: 'root' }), node({ id: 'orphan', parentId: 'ghost', depth: 1 })])
    expect(lone.map(n => n.id)).toContain('orphan')
  })
})

// A tiny seeded RNG so the generated trees are the same every run.
function rng(seed: number) { return () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296 } }

function randomTree(seed: number, count: number, style: 'web' | 'mesh', extra: Partial<MindmapNode> = {}): MindmapNode[] {
  const r = rng(seed)
  const out = [node({ id: 'root', title: 'Root', combStyle: style, ...extra })]
  for (let i = 1; i < count; i++) {
    // Bias to the first few nodes so some branches get deep and wide
    const parent = out[Math.floor(r() * r() * out.length)]
    out.push(node({ id: `n${i}`, title: `Cell ${i}`, parentId: parent.id, depth: parent.depth + 1, sortOrder: i }))
  }
  return out
}

describe('honeycomb layout edge cases', () => {
  it.each([1, 2, 3, 4, 5, 6, 7, 8])('mesh gives every node its own cell on a random tree (seed %i)', seed => {
    const nodes = randomTree(seed, 60, 'mesh', seed % 2 ? { combSize: 'inward' } : {})
    const out = computeHoneycombLayout(nodes)
    expect(out).toHaveLength(nodes.length)
    const keys = new Set(out.map(n => `${Math.round(n.x)},${Math.round(n.y)}`))
    expect(keys.size).toBe(nodes.length)
  })

  it('mesh crowds a single topic with a big subtree and still places every node', () => {
    const nodes = [node({ id: 'root', combStyle: 'mesh' }), node({ id: 'a', parentId: 'root', depth: 1 })]
    for (let i = 0; i < 40; i++) nodes.push(node({ id: `c${i}`, parentId: i < 10 ? 'a' : `c${i % 10}`, depth: i < 10 ? 2 : 3, sortOrder: i }))
    const out = computeHoneycombLayout(nodes)
    expect(new Set(out.map(n => `${Math.round(n.x)},${Math.round(n.y)}`)).size).toBe(nodes.length)
  })

  it('mesh with many topics and several seeds exercises the fallback rings', () => {
    for (let seed = 20; seed < 30; seed++) {
      const nodes = randomTree(seed, 120, 'mesh')
      const out = computeHoneycombLayout(nodes)
      expect(out).toHaveLength(nodes.length)
    }
  })

  it('mesh returns the input when there is no root, and keeps a root with no topics', () => {
    const none = [node({ id: 'a', parentId: 'x', depth: 1, combStyle: 'mesh' })]
    expect(computeHoneycombLayout(none)).toBe(none)
    // no root combStyle falls back to mesh
    const lone = computeHoneycombLayout([{ ...node({ id: 'root' }), combStyle: undefined }])
    expect(lone).toHaveLength(1)
    expect(lone[0].width).toBeGreaterThan(0)
  })

  it('mesh skips a node whose branch has no seed (orphan depth)', () => {
    const nodes = [node({ id: 'root', combStyle: 'mesh' }), node({ id: 'o', parentId: 'ghost', depth: 2 })]
    const out = computeHoneycombLayout(nodes)
    expect(out.find(n => n.id === 'o')).toBe(nodes[1])
  })

  it.each([11, 12, 13, 14, 15, 16])('web keeps every child beyond its parent on a random tree (seed %i)', seed => {
    const nodes = randomTree(seed, 70, 'web')
    const out = computeHoneycombLayout(nodes)
    const byId = new Map(out.map(n => [n.id, n]))
    for (const n of out) {
      if (!n.parentId) continue
      const p = byId.get(n.parentId)!
      const d = (m: MindmapNode) => Math.hypot(m.x + m.width / 2, m.y + m.height / 2)
      expect(d(n) + 1e-6).toBeGreaterThanOrEqual(d(p))
    }
  })

  it('web keeps manually positioned nodes and returns the input when there is no root', () => {
    const none = [node({ id: 'a', parentId: 'x', depth: 1, combStyle: 'web' })]
    expect(computeHoneycombLayout(none)).toBe(none)
    const nodes = randomTree(3, 12, 'web')
    nodes[0] = { ...nodes[0], manuallyPositioned: true, x: 5, y: 6, width: 100, height: 100 }
    nodes[1] = { ...nodes[1], manuallyPositioned: true, x: 500, y: 600, width: 80, height: 80 }
    const out = computeHoneycombLayout(nodes)
    expect(out[0]).toBe(nodes[0])
    expect(out.find(n => n.id === nodes[1].id)).toBe(nodes[1])
  })

  it('web pulls a tucked-in child back out past its parent, and handles a child dropped on the root centre', () => {
    // Many leaves on 1 narrow topic crowd the rings so relaxation can tuck cells inward
    const nodes = [node({ id: 'root', combStyle: 'web' })]
    for (let i = 0; i < 6; i++) nodes.push(node({ id: `t${i}`, parentId: 'root', depth: 1, sortOrder: i, title: 'T'.repeat(30) }))
    for (let i = 0; i < 50; i++) nodes.push(node({ id: `k${i}`, parentId: `t${i % 6}`, depth: 2, sortOrder: i, title: 'K'.repeat(25) }))
    const out = computeHoneycombLayout(nodes)
    const byId = new Map(out.map(n => [n.id, n]))
    for (const n of out) {
      if (n.depth < 2) continue
      const p = byId.get(n.parentId!)!
      expect(Math.hypot(n.x + n.width / 2, n.y + n.height / 2)).toBeGreaterThanOrEqual(Math.hypot(p.x + p.width / 2, p.y + p.height / 2) - 1e-6)
    }
  })
})
