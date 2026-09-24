// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { renderMindmapSvg } from '../_lib/render-svg.js'
import { depthFill, L1_PALETTE } from '../../src/lib/color.js'
import { computeMindmapLayout, radialLabelSide } from '../../src/lib/layout/mindmap.js'

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

const r2 = (v: number) => Math.round(v * 100) / 100

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

  it('draws a manual branch colour instead of the wheel colour, and carries it to descendants', () => {
    // 'a' would default to the wheel's sortOrder-0 colour; force it manual and confirm
    // the chosen colour - not L1_PALETTE[0] - reaches the server-rendered fill, and that
    // 'a1' (a's child) inherits it through the same depth ladder as the wheel case.
    const manualColor = '#123456'
    const nodes = mkNodes().map(n => (n.id === 'a' ? { ...n, color: manualColor, colorMode: 'manual' as const } : n))
    const svg = renderMindmapSvg({ id: 'x', name: 'M', type: 'logic-chart', line_style: 'orthogonal', theme_id: 'default', nodes: nodes as never })
    expect(svg).toContain(`fill="${manualColor}"`)
    expect(svg).toContain(`fill="${depthFill(manualColor, 2)}"`)
    expect(svg).not.toContain(`fill="${L1_PALETTE[0]}"`)
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

  it('falls back to curved for a missing or unrecognized line_style', () => {
    const curvedSvg = renderMindmapSvg({ id: 'x', name: 'M', type: 'logic-chart', line_style: 'curved', theme_id: 'default', nodes: mkNodes() as never })
    const missingSvg = renderMindmapSvg({ id: 'x', name: 'M', type: 'logic-chart', line_style: null, theme_id: 'default', nodes: mkNodes() as never })
    const bogusSvg = renderMindmapSvg({ id: 'x', name: 'M', type: 'logic-chart', line_style: 'bogus', theme_id: 'default', nodes: mkNodes() as never })
    expect(missingSvg).toBe(curvedSvg)
    expect(bogusSvg).toBe(curvedSvg)
  })

  // ── Mind map: the radial constellation ─────────────────────────────────────
  // The home cards and the share images are drawn by this renderer while the opened
  // map is drawn by the canvas, so the two must agree node for node.
  describe('mindmap radial graph', () => {
    const svgOf = () => renderMindmapSvg({ id: 'x', name: 'Machine Learning', type: 'mindmap', line_style: 'curved', theme_id: 'default', nodes: mkNodes() as never })

    it('puts every node exactly where the shared layout puts it', () => {
      const laid = computeMindmapLayout(mkNodes().map(n => ({ ...n, width: 0, height: 0 })) as never)
      const drawn = new Map<string, string>()
      const svg = svgOf()
      for (const m of svg.matchAll(/<g transform="translate\(([-\d.]+),([-\d.]+)\)">/g)) {
        drawn.set(`${m[1]},${m[2]}`, m[0])
      }
      expect(drawn.size).toBe(laid.length)
      const r2 = (v: number) => Math.round(v * 100) / 100
      for (const n of laid) {
        expect(drawn.has(`${r2(n.x)},${r2(n.y)}`)).toBe(true)
      }
    })

    it('draws circles, not boxes, and one shared glow filter', () => {
      const svg = svgOf()
      expect(svg).toContain('<filter id="mm-glow"')
      expect((svg.match(/<filter /g) ?? []).length).toBe(1)
      // The only <rect> is the canvas background; every node is a <circle>.
      expect((svg.match(/<rect /g) ?? []).length).toBe(1)
      expect((svg.match(/<circle /g) ?? []).length).toBeGreaterThan(5)
    })

    it('labels a depth-1 topic with its name and its subtree size', () => {
      const svg = svgOf()
      // 'a' (Supervised) carries 2 children, 'b' (Unsupervised) carries 2 descendants
      expect(svg).toMatch(/font-size="13" font-weight="600" fill="#1a1d2e">Supervised</)
      expect(svg).toMatch(/font-size="11" font-weight="600" fill="#[0-9A-Fa-f]{6}">2</)
    })

    it('leaves the deepest nodes as bare dots with a hover title', () => {
      const svg = svgOf()
      expect(svg).toContain('<title>K-Means</title>')
      // no side label for the depth-3 dot
      expect(svg).not.toMatch(/font-weight="400" fill="#475569">K-Means</)
      // ... while depth 2 does get one
      expect(svg).toMatch(/font-weight="400" fill="#475569">Regression</)
    })

    it('cuts a long depth-2 label but keeps the whole title on hover', () => {
      const long = 'Hook reads the file on each prompt - flips on next message, no restart'
      const nodes = mkNodes().map(n => (n.id === 'a1' ? { ...n, title: long } : n))
      const svg = renderMindmapSvg({ id: 'x', name: 'M', type: 'mindmap', line_style: 'curved', theme_id: 'default', nodes: nodes as never })
      expect(svg).toContain(`<title>${long}</title>`)
      expect(svg).not.toContain(`fill="#475569">${long}<`)
      const drawn = svg.match(/font-weight="400" fill="#475569">([^<]+)</)![1]
      expect(drawn.length).toBeLessThanOrEqual(32)
      expect(drawn.endsWith('\u2026')).toBe(true)
    })

    it('points every depth-2 label outward, away from the root', () => {
      const svg = svgOf()
      const laid = computeMindmapLayout(mkNodes().map(n => ({ ...n, width: 0, height: 0 })) as never)
      const root = laid.find(n => n.depth === 0)!
      const rcx = root.x + root.width / 2
      const rcy = root.y + root.height / 2
      let seen = 0
      for (const n of laid.filter(d => d.depth === 2)) {
        const side = radialLabelSide(n.x + n.width / 2 - rcx, n.y + n.height / 2 - rcy)
        const block = svg.slice(svg.indexOf(`translate(${r2(n.x)},${r2(n.y)})`))
        if (side === 'left') { expect(block).toContain('text-anchor="end"'); seen++ }
        if (side === 'right') { expect(block).toContain('text-anchor="start"'); seen++ }
      }
      expect(seen).toBeGreaterThan(0)
    })

    it('reserves room for the labels that hang outside the circles', () => {
      const svg = svgOf()
      const vb = svg.match(/viewBox="([-\d.]+) ([-\d.]+) (\d+) (\d+)"/)!
      const minY = Number(vb[2]), h = Number(vb[4])
      const laid = computeMindmapLayout(mkNodes().map(n => ({ ...n, width: 0, height: 0 })) as never)
      const lowestL1 = Math.max(...laid.filter(n => n.depth === 1).map(n => n.y + n.height))
      // the name + count under the lowest topic still fit inside the viewBox
      expect(minY + h).toBeGreaterThan(lowestL1 + 31)
    })

    it('draws hair-thin branch curves, never a straight spoke', () => {
      const svg = svgOf()
      const branches = [...svg.matchAll(/<path d="M [^"]*" stroke="[^"]*" stroke-opacity="0.55" stroke-width="([\d.]+)"/g)]
      expect(branches.length).toBe(mkNodes().length - 1)
      for (const b of branches) expect(Number(b[1])).toBeLessThanOrEqual(1.5)
      expect(svg).not.toContain(' L ')   // every branch is a quadratic curve
    })
  })

  // ── Neon on a dark canvas ──────────────────────────────────────────────────
  // The cards and the share images draw with this renderer, so a dark-theme mind map
  // has to glow exactly the way the canvas does - and a light one must not change.
  describe('neon (dark themes)', () => {
    const svgOfTheme = (theme: string) => renderMindmapSvg({
      id: 'x', name: 'Machine Learning', type: 'mindmap', line_style: 'curved',
      theme_id: theme, nodes: mkNodes() as never,
    })

    it('draws 2 paths per branch on a dark theme and 1 on a light one', () => {
      const branches = mkNodes().length - 1
      expect([...svgOfTheme('cyberpunk').matchAll(/<path /g)].length).toBe(branches * 2)
      expect([...svgOfTheme('default').matchAll(/<path /g)].length).toBe(branches)
    })

    it('carries a filter and a radialGradient only on the dark themes', () => {
      for (const t of ['cyberpunk', 'monokai']) {
        const svg = svgOfTheme(t)
        expect(svg).toContain('<filter')
        expect(svg).toContain('<radialGradient')
        expect(svg).toContain('mm-neon-')
      }
      for (const t of ['default', 'retro']) {
        const svg = svgOfTheme(t)
        expect(svg).not.toContain('<radialGradient')
        expect(svg).not.toContain('mm-neon-')
        expect(svg).toContain('mm-glow')   // today's subtle halo, untouched
      }
    })

    it('uses SVG filter primitives only, so resvg can rasterize the share image', () => {
      const svg = svgOfTheme('cyberpunk')
      expect(svg).toContain('<feGaussianBlur')
      expect(svg).toContain('<feMerge>')
      expect(svg).toContain('<feComponentTransfer')
      expect(svg).not.toContain('style=')      // no CSS filters anywhere
      expect(svg).not.toContain('filter: ')
      expect(svg).not.toContain('NaN')
    })

    it('whitens the depth-1 names and greys the counts, light greys the depth-2 labels', () => {
      const svg = svgOfTheme('cyberpunk')
      expect(svg).toMatch(/<text[^>]*fill="#ffffff"[^>]*>Supervised<\/text>/)
      expect(svg).toMatch(/<text[^>]*fill="#cbd5e1" fill-opacity="0.8"[^>]*>Regression<\/text>/)
      expect(svg).not.toContain('fill="#1a1d2e">Supervised')
    })

    it('shares one bucketed glow filter per circle size, not one per node', () => {
      const filters = [...svgOfTheme('cyberpunk').matchAll(/<filter id="(mm-neon-\d+)"/g)]
      expect(filters.length).toBeGreaterThan(0)
      expect(filters.length).toBeLessThan(mkNodes().length)
      expect(new Set(filters.map(f => f[1])).size).toBe(filters.length)
    })
  })

  it('renders curved logic-chart + JSON-string nodes + empty map', () => {
    const svg = renderMindmapSvg({ id: 'x', name: 'T', type: 'logic-chart', line_style: 'curved', theme_id: 'retro', nodes: JSON.stringify(mkNodes()) })
    expect(svg).toContain('<path')
    const empty = renderMindmapSvg({ id: 'y', name: 'Empty <Map> & "quotes"', type: 'logic-chart', line_style: null, theme_id: null, nodes: null })
    expect(empty).toContain('Empty &lt;Map&gt; &amp; &quot;quotes&quot;')
  })
})
