// Smoke test: the server SVG renderer and the store must compute the exact same
// per-node widths for the same fixture, since both now share normalizeWidthsPerDepth
// (src/lib/widthNormalize.ts) instead of carrying their own copy of the rule.
import { describe, it, expect, beforeEach } from 'vitest'
import { useMindmapStore } from '../../store/mindmapStore'
import { renderMindmapSvg } from '../render-svg'
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
