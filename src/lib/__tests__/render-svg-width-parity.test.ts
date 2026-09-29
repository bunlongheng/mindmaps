// Smoke test: the server SVG renderer and the store must compute the exact same
// per-node widths for the same fixture, since both now share normalizeWidthsPerDepth
// (src/lib/widthNormalize.ts) instead of carrying their own copy of the rule.
import { describe, it, expect, beforeEach } from 'vitest'
import { useMindmapStore } from '../../store/mindmapStore'
import { renderMindmapSvg } from '../render-svg'
import { L1_PALETTE } from '../color'
import type { Diagram, MindmapNode } from '../../types'

const r2 = (v: number) => Math.round(v * 100) / 100

function fixture(): MindmapNode[] {
  const root: MindmapNode = {
    id: 'root', title: 'Root', color: '#6366f1', parentId: null,
    depth: 0, x: 0, y: 0, width: 180, height: 180,
  }
  const shortAuto: MindmapNode = {
    id: 'c1', title: 'Ops', color: '#ef4444', parentId: 'root', depth: 1,
    x: 0, y: 0, width: 0, height: 0, sortOrder: 0,
  }
  const longAuto: MindmapNode = {
    id: 'c2', title: 'A significantly longer child topic label', color: '#22c55e', parentId: 'root', depth: 1,
    x: 0, y: 0, width: 0, height: 0, sortOrder: 1,
  }
  const manual: MindmapNode = {
    id: 'c3', title: 'Fixed', color: '#3b82f6', parentId: 'root', depth: 1,
    x: 0, y: 0, width: 260, height: 0, sortOrder: 2, widthMode: 'manual',
  }
  return [root, shortAuto, longAuto, manual]
}

/** Pull the node's own <rect width="…"> out of its `<g transform="translate(x,y)">` block. */
function widthAt(svg: string, x: number, y: number): number {
  const key = `translate(${r2(x)},${r2(y)})">`
  const start = svg.indexOf(key)
  expect(start).toBeGreaterThanOrEqual(0)
  const block = svg.slice(start, svg.indexOf('</g>', start))
  const m = block.match(/width="([\d.]+)"/)
  expect(m).not.toBeNull()
  return Number(m![1])
}

describe('render-svg / store width parity', () => {
  beforeEach(() => {
    useMindmapStore.getState().clearDiagram()
  })

  it('server output uses the same per-node widths the store computes', () => {
    const raw = fixture()
    const diagram: Diagram = {
      id: 'x', name: 'Root', type: 'logic-chart', lineStyle: 'orthogonal',
      nodes: raw, createdAt: '2024-01-01', updatedAt: '2024-01-01',
    }
    useMindmapStore.getState().setActiveMindmap(diagram)
    const storeNodes = useMindmapStore.getState().activeMindmap!.nodes

    const svg = renderMindmapSvg({
      id: 'x', name: 'Root', type: 'logic-chart', line_style: 'orthogonal', theme_id: 'default',
      nodes: raw,
    })

    for (const n of storeNodes.filter(n => n.depth === 1)) {
      expect(widthAt(svg, n.x, n.y)).toBe(r2(n.width))
    }

    // The two auto children equalise to the longest label; the manual one keeps 260.
    const c1 = storeNodes.find(n => n.id === 'c1')!
    const c2 = storeNodes.find(n => n.id === 'c2')!
    const c3 = storeNodes.find(n => n.id === 'c3')!
    expect(c1.width).toBe(c2.width)
    expect(c3.width).toBe(260)
  })
})

describe('render-svg - edge colour parity with the canvas', () => {
  // The canvas colours a connector from the resolved branch colour (EdgeLayer colorOf),
  // so an auto L1 whose stored colour is stale still draws in its palette hue. The share
  // renderer must read the same resolver, or a share image shows a cyan edge into a red box.
  const nodes = [
    { id: 'root', title: 'Root', color: '#6366f1', parentId: null, depth: 0, x: 0, y: 0, width: 200, height: 64 },
    { id: 'a', title: 'Alpha', color: '#3AAAD9', parentId: 'root', depth: 1, sortOrder: 0, x: 300, y: 0, width: 160, height: 44 },
    { id: 'a1', title: 'Alpha child', color: '#3AAAD9', parentId: 'a', depth: 2, sortOrder: 0, x: 520, y: 0, width: 160, height: 40 },
  ]
  for (const line_style of ['curved', 'orthogonal', 'straight'] as const) {
    it(`${line_style}: every edge is stroked with the branch colour, never the stale stored colour`, () => {
      const svg = renderMindmapSvg({ id: 'x', name: 'Edges', type: 'logic-chart', line_style, theme_id: 'default', nodes: nodes as never })
      const strokes = [...svg.matchAll(/<(?:path|line)[^>]*stroke="([^"]+)"/g)].map(m => m[1].toLowerCase())
      expect(strokes.length).toBeGreaterThanOrEqual(2)
      expect(strokes.some(s => s.startsWith(L1_PALETTE[0].toLowerCase()))).toBe(true)
      expect(strokes.some(s => s.startsWith('#3aaad9'))).toBe(false)
    })
  }
})

describe('render-svg - honeycomb', () => {
  it('web: draws every cell as a hexagon polygon, one straight line per edge, and no selection rect', () => {
    const nodes = [
      { id: 'root', title: 'Root Topic', color: '#6366f1', parentId: null, depth: 0, x: 0, y: 0, width: 0, height: 0, combStyle: 'web' as const },
      { id: 'l1a', title: 'Branch A', color: '#ef4444', parentId: 'root', depth: 1, sortOrder: 0, x: 0, y: 0, width: 0, height: 0 },
      { id: 'l1b', title: 'Branch B', color: '#22c55e', parentId: 'root', depth: 1, sortOrder: 1, x: 0, y: 0, width: 0, height: 0 },
      { id: 'l2a', title: 'Leaf A', color: '#ef4444', parentId: 'l1a', depth: 2, sortOrder: 0, x: 0, y: 0, width: 0, height: 0 },
      { id: 'l2b', title: 'Leaf B', color: '#22c55e', parentId: 'l1b', depth: 2, sortOrder: 0, x: 0, y: 0, width: 0, height: 0 },
      { id: 'l2c', title: 'Leaf C', color: '#22c55e', parentId: 'l1b', depth: 2, sortOrder: 1, x: 0, y: 0, width: 0, height: 0 },
    ]
    const svg = renderMindmapSvg({ id: 'x', name: 'Honeycomb test', type: 'honeycomb', line_style: 'straight', theme_id: 'default', nodes: nodes as never })

    expect((svg.match(/<polygon/g) ?? []).length).toBe(6)
    expect((svg.match(/<line/g) ?? []).length).toBe(5)
    expect(svg).toContain('Root Topic')
    // The only <rect> in the whole document is the canvas background - no cell is
    // ever drawn as a rect, and no selection rect is emitted server-side.
    expect((svg.match(/<rect/g) ?? []).length).toBe(1)
  })

  it('mesh (the default): 1 connector per topic and nothing deeper, every polygon the same size', () => {
    const nodes = [
      { id: 'root', title: 'Root Topic', color: '#6366f1', parentId: null, depth: 0, x: 0, y: 0, width: 0, height: 0 },
      { id: 'a', title: 'Alpha', color: '#D94F3A', parentId: 'root', depth: 1, sortOrder: 0, x: 0, y: 0, width: 0, height: 0 },
      { id: 'b', title: 'Beta with a longer label here', color: '#3AD9BF', parentId: 'root', depth: 1, sortOrder: 1, x: 0, y: 0, width: 0, height: 0 },
      { id: 'a1', title: 'Alpha child', color: '#D94F3A', parentId: 'a', depth: 2, sortOrder: 0, x: 0, y: 0, width: 0, height: 0 },
    ]
    const svg = renderMindmapSvg({ id: 'x', name: 'Mesh', type: 'honeycomb', line_style: 'curved', theme_id: 'default', nodes: nodes as never })
    // 4 node cells, plus the empty filler ring that finishes the silhouette
    expect((svg.match(/<polygon points=/g) ?? []).length).toBe(4)
    expect((svg.match(/<polygon class="mesh-filler"/g) ?? []).length).toBeGreaterThan(0)
    // The root and both topics touch in the core, and an island's own cells touch each
    // other, so the only link is the 1 per topic out to its island - drawn along the
    // lattice, never as a straight diagonal. only 'a' has children, so only 'a' gets one.
    expect((svg.match(/<line/g) ?? []).length).toBe(0)
    expect((svg.match(/<polyline class="mesh-link"/g) ?? []).length).toBe(1)
    // every hexagon, cell or filler, is drawn at the same radius
    const widths = new Set([...svg.matchAll(/<polygon[^>]*points="([^"]+)"/g)].map(m => {
      const xs = m[1].split(' ').map(p => parseFloat(p.split(',')[0]))
      return Math.round(Math.max(...xs) - Math.min(...xs))
    }))
    expect(widths.size).toBe(1)
  })
})

describe('render-svg - fishbone edge parity with the canvas', () => {
  // The share image and the home card are this renderer. Its fishbone branch was a copy
  // of the timeline one, which paints the spine in segments BETWEEN the topic boxes - on
  // a fishbone the topics sit far off the spine, so it drew stubs and no bone at all and
  // every branch floated disconnected. These assert the shape the canvas draws
  // (EdgeLayer's fishbone branch): 1 grey spine, 1 coloured diagonal per topic.
  const nodes = [
    { id: 'root', title: 'Root', color: '#6366f1', parentId: null, depth: 0, x: 0, y: 0, width: 0, height: 0 },
    { id: 'up', title: 'Above the spine', color: '#ef4444', parentId: 'root', depth: 1, sortOrder: 0, x: 0, y: 0, width: 0, height: 0 },
    { id: 'down', title: 'Below the spine', color: '#f97316', parentId: 'root', depth: 1, sortOrder: 1, x: 0, y: 0, width: 0, height: 0 },
    { id: 'u1', title: 'Up child', color: '#ef4444', parentId: 'up', depth: 2, sortOrder: 0, x: 0, y: 0, width: 0, height: 0 },
    { id: 'd1', title: 'Down child', color: '#f97316', parentId: 'down', depth: 2, sortOrder: 0, x: 0, y: 0, width: 0, height: 0 },
    { id: 'u1a', title: 'Grandchild', color: '#ef4444', parentId: 'u1', depth: 3, sortOrder: 0, x: 0, y: 0, width: 0, height: 0 },
  ]
  const svg = renderMindmapSvg({ id: 'x', name: 'Fish', type: 'fishbone', line_style: 'straight', theme_id: 'default', nodes: nodes as never })
  const lines = [...svg.matchAll(/<line x1="([-\d.]+)" y1="([-\d.]+)" x2="([-\d.]+)" y2="([-\d.]+)"[^>]*stroke="([^"]+)"/g)]
    .map(m => ({ x1: +m[1], y1: +m[2], x2: +m[3], y2: +m[4], stroke: m[5].toLowerCase() }))

  it('draws exactly 1 grey spine, running horizontally out of the root', () => {
    const spine = lines.filter(l => l.stroke === '#64748b')
    expect(spine).toHaveLength(1)
    expect(spine[0].y1).toBe(spine[0].y2)
    expect(spine[0].x2).toBeGreaterThan(spine[0].x1)
  })

  it('draws a slanted coloured bone per topic, 1 above the spine and 1 below', () => {
    const spineY = lines.find(l => l.stroke === '#64748b')!.y1
    // A bone is the only edge that is diagonal: both x and y move.
    const bones = lines.filter(l => l.x1 !== l.x2 && l.y1 !== l.y2)
    expect(bones).toHaveLength(2)
    for (const b of bones) expect(b.y1).toBe(spineY)
    expect(bones.some(b => b.y2 < spineY)).toBe(true)
    expect(bones.some(b => b.y2 > spineY)).toBe(true)
    expect(new Set(bones.map(b => b.stroke)).size).toBe(2)
  })

  it('leaves no node disconnected: every L2 and L3 gets its own horizontal stub', () => {
    const flat = lines.filter(l => l.y1 === l.y2 && l.stroke !== '#64748b')
    // 2 L2 stubs off the bones, plus 1 L3 horizontal.
    expect(flat).toHaveLength(3)
    for (const l of flat) expect(l.x2).toBeGreaterThan(l.x1)
  })
})

describe('render-svg - timeline edge parity with the canvas', () => {
  // There was no timeline branch at all: its code sat under the 'fishbone' label, so a
  // timeline map fell through to the logic-chart edges on every share image and card.
  const nodes = [
    { id: 'root', title: 'Root', color: '#6366f1', parentId: null, depth: 0, x: 0, y: 0, width: 0, height: 0 },
    { id: 'a', title: 'Phase A', color: '#ef4444', parentId: 'root', depth: 1, sortOrder: 0, x: 0, y: 0, width: 0, height: 0 },
    { id: 'b', title: 'Phase B', color: '#f97316', parentId: 'root', depth: 1, sortOrder: 1, x: 0, y: 0, width: 0, height: 0 },
    { id: 'a1', title: 'Step one', color: '#ef4444', parentId: 'a', depth: 2, sortOrder: 0, x: 0, y: 0, width: 0, height: 0 },
    { id: 'a2', title: 'Step two', color: '#ef4444', parentId: 'a', depth: 2, sortOrder: 1, x: 0, y: 0, width: 0, height: 0 },
    { id: 'b1', title: 'Step three', color: '#f97316', parentId: 'b', depth: 2, sortOrder: 0, x: 0, y: 0, width: 0, height: 0 },
  ]
  const svg = renderMindmapSvg({ id: 'x', name: 'TL', type: 'timeline', line_style: 'straight', theme_id: 'default', nodes: nodes as never })

  it('paints the spine in coloured segments, never as 1 grey rail', () => {
    const horiz = [...svg.matchAll(/<line x1="([-\d.]+)" y1="([-\d.]+)" x2="([-\d.]+)" y2="([-\d.]+)"[^>]*stroke="([^"]+)"/g)]
      .map(m => ({ y1: +m[2], y2: +m[4], stroke: m[5].toLowerCase() }))
      .filter(l => l.y1 === l.y2)
    // 1 run into each topic plus the tail, all carrying a branch colour.
    expect(horiz.length).toBeGreaterThanOrEqual(3)
    expect(horiz.some(l => l.stroke === '#64748b')).toBe(false)
    expect(new Set(horiz.map(l => l.stroke)).size).toBeGreaterThanOrEqual(2)
  })

  it('drops an elbow into every child, which the logic-chart fallback never drew', () => {
    // 1 quadratic elbow per depth-2 node.
    expect((svg.match(/ Q /g) ?? []).length).toBe(3)
  })
})
