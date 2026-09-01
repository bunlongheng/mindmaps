// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { renderMindmapSvg } from '../_lib/render-svg.js'

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
  it('renders curved logic-chart + JSON-string nodes + empty map', () => {
    const svg = renderMindmapSvg({ id: 'x', name: 'T', type: 'logic-chart', line_style: 'curved', theme_id: 'retro', nodes: JSON.stringify(mkNodes()) })
    expect(svg).toContain('<path')
    const empty = renderMindmapSvg({ id: 'y', name: 'Empty <Map> & "quotes"', type: 'logic-chart', line_style: null, theme_id: null, nodes: null })
    expect(empty).toContain('Empty &lt;Map&gt; &amp; &quot;quotes&quot;')
  })
})
