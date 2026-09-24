// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { renderMindmapSvg } from '../_lib/render-svg.js'
import { depthFill, L1_PALETTE } from '../../src/lib/color.js'

const mkNodes = () => {
  const root = { id: 'r', title: 'Machine Learning', parentId: null, depth: 0, x: 0, y: 0, width: 180, height: 180, color: '#6366f1', sortOrder: 0, manuallyPositioned: false }
  const a = { id: 'a', title: 'Supervised', parentId: 'r', depth: 1, x: 0, y: 0, width: 120, height: 40, color: '#8b5cf6', sortOrder: 0, manuallyPositioned: false, icon: 'chart' }
  const b = { id: 'b', title: 'Unsupervised', parentId: 'r', depth: 1, x: 0, y: 0, width: 130, height: 40, color: '#ec4899', sortOrder: 1, manuallyPositioned: false, emoji: '🔀' }
  const a1 = { id: 'a1', title: 'Regression', parentId: 'a', depth: 2, x: 0, y: 0, width: 110, height: 40, color: '#8b5cf6', sortOrder: 0, manuallyPositioned: false }
  const a2 = { id: 'a2', title: 'Classification with a long label', parentId: 'a', depth: 2, x: 0, y: 0, width: 110, height: 40, color: '#8b5cf6', sortOrder: 1, manuallyPositioned: false }
  const b1 = { id: 'b1', title: 'Clustering', parentId: 'b', depth: 2, x: 0, y: 0, width: 110, height: 40, color: '#ec4899', sortOrder: 0, manuallyPositioned: false }
  const b2 = { id: 'b2', title: 'K-Means', parentId: 'b1', depth: 3, x: 0, y: 0, width: 100, height: 40, color: '#ec4899', sortOrder: 0, manuallyPositioned: false }
  return [root, a, b, a1, a2, b1, b2]
}

describe('renderMindmapSvg smoke', () => {
  for (const type of ['logic-chart', 'mindmap', 'fishbone', 'timeline'] as const) {
    it(`renders ${type}`, () => {
      const svg = renderMindmapSvg({ id: 'x', name: 'Machine Learning', type, line_style: 'orthogonal', theme_id: 'default', nodes: mkNodes() as never })
      expect(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg"')).toBe(true)
      expect(svg).toContain('Machine Learning')
      expect(svg).toContain('Regression')
      expect(svg).not.toContain('<image')
      expect(svg).not.toContain('foreignObject')
      expect(svg).not.toContain('<script')
      expect(svg).not.toContain('href=')
      expect(svg).not.toContain('NaN')
    })
  }
  it('paints depth fills from the shared ladder, so cards match the canvas', () => {
    // 'a1' (depth 2) and 'b2' (depth 3) inherit their L1 ancestor's wheel colour;
    // the emitted fill must be exactly depthFill(), the same helper Node.tsx uses.
    const svg = renderMindmapSvg({ id: 'x', name: 'M', type: 'logic-chart', line_style: 'orthogonal', theme_id: 'default', nodes: mkNodes() as never })
    const d2 = depthFill(L1_PALETTE[0], 2)   // 'a' has sortOrder 0
    const d3 = depthFill(L1_PALETTE[1], 3)   // 'b' has sortOrder 1
    expect(svg).toContain(`fill="${d2}"`)
    expect(svg).toContain(`fill="${d3}"`)
    expect(d2).not.toBe(depthFill(L1_PALETTE[0], 3))
  })

  it('renders curved logic-chart + JSON-string nodes + empty map', () => {
    const svg = renderMindmapSvg({ id: 'x', name: 'T', type: 'logic-chart', line_style: 'curved', theme_id: 'retro', nodes: JSON.stringify(mkNodes()) })
    expect(svg).toContain('<path')
    const empty = renderMindmapSvg({ id: 'y', name: 'Empty <Map> & "quotes"', type: 'logic-chart', line_style: null, theme_id: null, nodes: null })
    expect(empty).toContain('Empty &lt;Map&gt; &amp; &quot;quotes&quot;')
  })
})
