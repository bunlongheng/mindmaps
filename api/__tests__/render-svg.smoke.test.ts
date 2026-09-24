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

  it('emits the matching primitive for every box shape', () => {
    // Shape every non-root node so the default radius can't mask the result.
    const shaped = (shape: 'rect' | 'rounded' | 'pill' | 'circle') => {
      const nodes = mkNodes().map(n => (n.depth > 0 ? { ...n, shape } : n))
      return renderMindmapSvg({ id: 'x', name: 'M', type: 'logic-chart', line_style: 'orthogonal', theme_id: 'default', nodes: nodes as never })
    }
    const radii = (svg: string) => [...svg.matchAll(/rx="([\d.]+)"/g)].map(m => Number(m[1]))

    // rect squares every non-root corner; the default radius 3 is gone
    expect(radii(shaped('rect'))).not.toContain(3)
    // rounded is today's look, radius 3
    expect(radii(shaped('rounded'))).toContain(3)
    // pill fully rounds the ends: radius is half the box height, never 3
    const pillRadii = radii(shaped('pill'))
    expect(pillRadii).not.toContain(3)
    expect(pillRadii.some(v => v >= 15)).toBe(true)
    // circle draws real <circle> elements, wide enough for the label
    const circleSvg = shaped('circle')
    const circleR = [...circleSvg.matchAll(/<circle [^>]*r="([\d.]+)"/g)].map(m => Number(m[1]))
    expect(circleR.filter(v => v > 40).length).toBeGreaterThanOrEqual(3)
    expect(radii(circleSvg)).not.toContain(3)
  })

  it('steps connector thickness down by depth (root->L1 5px, L1->L2 3px, L2->L3 2px)', () => {
    // mkNodes() is a 3-level tree: root -> a/b (depth 1) -> a1/a2/b1 (depth 2) -> b2 (depth 3)
    const svg = renderMindmapSvg({ id: 'x', name: 'M', type: 'logic-chart', line_style: 'orthogonal', theme_id: 'default', nodes: mkNodes() as never })
    const connectors = [...svg.matchAll(/<(?:path|line)\b[^>]*stroke-width="([\d.]+)"[^>]*\/>/g)].map(m => m[1])
    expect(connectors).toContain('5')
    expect(connectors).toContain('3')
    expect(connectors).toContain('2')
  })

  it('renders curved logic-chart + JSON-string nodes + empty map', () => {
    const svg = renderMindmapSvg({ id: 'x', name: 'T', type: 'logic-chart', line_style: 'curved', theme_id: 'retro', nodes: JSON.stringify(mkNodes()) })
    expect(svg).toContain('<path')
    const empty = renderMindmapSvg({ id: 'y', name: 'Empty <Map> & "quotes"', type: 'logic-chart', line_style: null, theme_id: null, nodes: null })
    expect(empty).toContain('Empty &lt;Map&gt; &amp; &quot;quotes&quot;')
  })
})
