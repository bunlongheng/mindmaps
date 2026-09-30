import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import { TIMELINE_ELBOW_R } from '../../../lib/layout/timeline'
import { EdgeLayer } from '../EdgeLayer'
import { useMindmapStore } from '../../../store/mindmapStore'
import type { DiagramType, LineStyle, MindmapNode } from '../../../types'
import { lighten, NEON_EDGE_LIGHTEN, RADIAL_EDGE_OPACITY } from '../../../lib/color'
import { computeHoneycombLayout } from '../../../lib/layout/honeycomb'
import { MESH_WALL_WIDTH } from '../../../lib/hex'

vi.mock('../../../components/CuteToast', () => ({ showToast: vi.fn() }))

function n(over: Partial<MindmapNode> & { id: string; depth: number }): MindmapNode {
  return {
    title: over.id, color: '#ef4444', parentId: null, x: 0, y: 0, width: 100, height: 40,
    sortOrder: 0, ...over,
  } as MindmapNode
}

function renderLayer(nodes: MindmapNode[], lineStyle: LineStyle, diagramType: DiagramType) {
  return render(
    <svg>
      <EdgeLayer nodes={nodes} lineStyle={lineStyle} diagramType={diagramType} />
    </svg>
  )
}

beforeEach(() => {
  useMindmapStore.setState({ showOrderNumbers: true, themeId: 'default' })
})
afterEach(() => cleanup())

// ── Logic chart ─────────────────────────────────────────────────────────────
describe('EdgeLayer — logic-chart', () => {
  const root = n({ id: 'root', depth: 0, x: 0, y: 200, width: 180, height: 180 })
  const l1a = n({ id: 'a', depth: 1, parentId: 'root', x: 400, y: 100, sortOrder: 0, color: '#3b82f6' })
  const l1b = n({ id: 'b', depth: 1, parentId: 'root', x: 400, y: 300, sortOrder: 1, color: '#22c55e' })
  const l2 = n({ id: 'c', depth: 2, parentId: 'a', x: 700, y: 100 })

  it('returns null when there is no root', () => {
    const { container } = renderLayer([n({ id: 'orphan', depth: 1, parentId: 'x' })], 'orthogonal', 'logic-chart')
    expect(container.querySelector('g')).toBeFalsy()
  })

  it('renders the trunk + vertical bars + stubs for multiple L1 nodes', () => {
    const { container } = renderLayer([root, l1a, l1b, l2], 'orthogonal', 'logic-chart')
    // trunk line + per-L1 stub lines + vertical bar between L1s
    expect(container.querySelectorAll('line').length).toBeGreaterThan(2)
  })

  it('renders order-number badges on the trunk when showOrderNumbers', () => {
    const { container } = renderLayer([root, l1a, l1b], 'orthogonal', 'logic-chart')
    expect(container.querySelectorAll('circle').length).toBeGreaterThan(0)
    expect(container.querySelector('text')).toBeTruthy()
  })

  it('hides order-number badges when showOrderNumbers is off', () => {
    useMindmapStore.setState({ showOrderNumbers: false })
    const { container } = renderLayer([root, l1a, l1b], 'orthogonal', 'logic-chart')
    expect(container.querySelector('circle')).toBeFalsy()
  })

  it('renders deeper Edge components for L2+ in orthogonal mode', () => {
    const { container } = renderLayer([root, l1a, l2], 'orthogonal', 'logic-chart')
    expect(container.querySelector('path')).toBeTruthy()
  })

  it('handles a single L1 node (no vertical bars)', () => {
    const { container } = renderLayer([root, l1a], 'orthogonal', 'logic-chart')
    expect(container.querySelectorAll('line').length).toBeGreaterThan(0)
  })

  it('handles a root with no L1 children (no trunk)', () => {
    const { container } = renderLayer([root], 'orthogonal', 'logic-chart')
    expect(container.querySelector('line')).toBeFalsy()
  })

  it('renders BracketConnector fan for curved line style', () => {
    const { container } = renderLayer([root, l1a, l1b, l2], 'curved', 'logic-chart')
    // Bracket connector uses bezier paths
    expect(container.querySelectorAll('path').length).toBeGreaterThan(0)
  })

  it('curved style with a single child uses a simple CurvedEdge', () => {
    const { container } = renderLayer([root, l1a, l2], 'curved', 'logic-chart')
    expect(container.querySelector('path')).toBeTruthy()
  })

  it('curved BracketConnector with order numbers on depth-0 parent', () => {
    const { container } = renderLayer([root, l1a, l1b], 'curved', 'logic-chart')
    // showOrderNumbers true + parent.depth === 0 => numbered circles
    expect(container.querySelectorAll('circle').length).toBeGreaterThan(0)
  })

  it('curved BracketConnector renders order badge using sortOrder ?? 0 fallback', () => {
    const a2 = n({ id: 'a', depth: 1, parentId: 'root', x: 400, y: 100, color: '#3b82f6' })
    const b2 = n({ id: 'b', depth: 1, parentId: 'root', x: 400, y: 300, color: '#22c55e' })
    delete (a2 as Partial<MindmapNode>).sortOrder
    const { container } = renderLayer([root, a2, b2], 'curved', 'logic-chart')
    expect(container.querySelector('text')?.textContent).toBe('1')
  })

  it('CurvedEdge goes left when child is left of parent (goRight detection via bracket)', () => {
    // Deeper level: parent a has two children that fan out
    const ca = n({ id: 'ca', depth: 2, parentId: 'a', x: 700, y: 50 })
    const cb = n({ id: 'cb', depth: 2, parentId: 'a', x: 700, y: 150 })
    const { container } = renderLayer([root, l1a, ca, cb], 'curved', 'logic-chart')
    expect(container.querySelectorAll('path').length).toBeGreaterThan(0)
  })

  it('logic-chart trunk uses sortOrder ?? 0 fallback on a stub badge', () => {
    const a3 = n({ id: 'a', depth: 1, parentId: 'root', x: 400, y: 100, color: '#3b82f6' })
    delete (a3 as Partial<MindmapNode>).sortOrder
    const { container } = renderLayer([root, a3], 'orthogonal', 'logic-chart')
    expect(container.querySelector('text')?.textContent).toBe('1')
  })

  it('connector thickness steps down by child depth (5, 3, 1 for depth 1, 2, 4)', () => {
    const a = n({ id: 'a', depth: 1, parentId: 'root', x: 300, y: 200, color: '#111111' })
    const b = n({ id: 'b', depth: 2, parentId: 'a', x: 600, y: 200, color: '#222222' })
    const c = n({ id: 'c', depth: 3, parentId: 'b', x: 900, y: 200, color: '#333333' })
    const d = n({ id: 'd', depth: 4, parentId: 'c', x: 1200, y: 200, color: '#444444' })
    const { container } = renderLayer([root, a, b, c, d], 'curved', 'logic-chart')
    const byStroke = (stroke: string) => container.querySelector(`path[stroke="${stroke}"]`)
    expect(byStroke('#111111')?.getAttribute('stroke-width')).toBe('5')
    expect(byStroke('#222222')?.getAttribute('stroke-width')).toBe('3')
    expect(byStroke('#444444')?.getAttribute('stroke-width')).toBe('1')
  })

  it('logic-chart sorts L1 with sortOrder ?? 0 fallback when both lack sortOrder', () => {
    const a4 = n({ id: 'a', depth: 1, parentId: 'root', x: 400, y: 100, color: '#3b82f6' })
    const b4 = n({ id: 'b', depth: 1, parentId: 'root', x: 400, y: 300, color: '#22c55e' })
    delete (a4 as Partial<MindmapNode>).sortOrder
    delete (b4 as Partial<MindmapNode>).sortOrder
    const { container } = renderLayer([root, a4, b4], 'orthogonal', 'logic-chart')
    expect(container.querySelectorAll('line').length).toBeGreaterThan(1)
  })
})

// ── Mindmap ──────────────────────────────────────────────────────────────────
describe('EdgeLayer — graph', () => {
  const root = n({ id: 'root', depth: 0, x: 400, y: 400, width: 180, height: 180 })
  const l1 = n({ id: 'l1', depth: 1, parentId: 'root', x: 700, y: 400, color: '#3b82f6' })
  const l2 = n({ id: 'l2', depth: 2, parentId: 'l1', x: 900, y: 400 })
  const l3 = n({ id: 'l3', depth: 3, parentId: 'l2', x: 1100, y: 400 })

  it('renders radial edges with straight line style', () => {
    const { container } = renderLayer([root, l1, l2, l3], 'straight', 'graph')
    expect(container.querySelectorAll('path').length).toBeGreaterThanOrEqual(3)
  })

  it('renders quadratic curve edges with curved line style', () => {
    const { container } = renderLayer([root, l1, l2], 'curved', 'graph')
    const d = container.querySelector('path')!.getAttribute('d')!
    expect(d).toContain('Q')
  })

  it('renders L1 order-number badges in mindmap mode', () => {
    const { container } = renderLayer([root, l1], 'straight', 'graph')
    expect(container.querySelector('circle')).toBeTruthy()
  })

  it('mindmap L1 badge uses sortOrder ?? 0 fallback', () => {
    const l1nb = n({ id: 'l1', depth: 1, parentId: 'root', x: 700, y: 400, color: '#3b82f6' })
    delete (l1nb as Partial<MindmapNode>).sortOrder
    const { container } = renderLayer([root, l1nb], 'straight', 'graph')
    expect(container.querySelector('text')?.textContent).toBe('1')
  })

  it('hides order numbers when disabled', () => {
    useMindmapStore.setState({ showOrderNumbers: false })
    const { container } = renderLayer([root, l1], 'straight', 'graph')
    expect(container.querySelector('circle')).toBeFalsy()
  })

  it('handles a node whose center coincides with parent (zero-length edge)', () => {
    const overlap = n({ id: 'ov', depth: 1, parentId: 'root', x: 400, y: 400, width: 180, height: 180 })
    const { container } = renderLayer([root, overlap], 'straight', 'graph')
    expect(container.querySelector('path')).toBeTruthy()
  })

  it('ignores edges whose parent is missing from the node map', () => {
    const orphan = n({ id: 'orphan', depth: 2, parentId: 'ghost', x: 900, y: 400 })
    const { container } = renderLayer([root, l1, orphan], 'straight', 'graph')
    // only the valid edge renders
    expect(container.querySelectorAll('path').length).toBe(1)
  })

  // ── Neon branches on a dark canvas ────────────────────────────────────────
  // Each branch becomes a luminous tube: a blurred glow line under a crisp core.
  it('draws 2 paths per branch on a dark theme and 1 on a light one', () => {
    const nodes = [root, l1, l2, l3]   // 3 branches
    useMindmapStore.setState({ themeId: 'cyberpunk' })
    expect(renderLayer(nodes, 'straight', 'graph').container.querySelectorAll('path').length).toBe(6)
    cleanup()
    useMindmapStore.setState({ themeId: 'default' })
    expect(renderLayer(nodes, 'straight', 'graph').container.querySelectorAll('path').length).toBe(3)
  })

  it('defines the branch blur once and lightens the core line', () => {
    useMindmapStore.setState({ themeId: 'cyberpunk' })
    const { container } = renderLayer([root, l1, l2, l3], 'straight', 'graph')
    expect(container.querySelectorAll('filter#mm-neon-edge').length).toBe(1)
    const strokes = [...container.querySelectorAll('path')].map(p => p.getAttribute('stroke'))
    expect(strokes).toContain(l1.color)                              // the glow line
    expect(strokes).toContain(lighten(l1.color, NEON_EDGE_LIGHTEN))  // the crisp core
  })

  it('leaves a light theme on the single thin branch it draws today', () => {
    useMindmapStore.setState({ themeId: 'default' })
    const { container } = renderLayer([root, l1], 'straight', 'graph')
    expect(container.querySelector('filter#mm-neon-edge')).toBeFalsy()
    expect(container.querySelector('path')!.getAttribute('stroke-opacity')).toBe(String(RADIAL_EDGE_OPACITY))
  })
})

// ── Fishbone ─────────────────────────────────────────────────────────────────
describe('EdgeLayer — mindmap (balanced left/right)', () => {
  const root = n({ id: 'root', depth: 0, x: 400, y: 400, width: 200, height: 130 })
  const right = n({ id: 'r1', depth: 1, parentId: 'root', x: 800, y: 380, color: '#3b82f6' })
  const right2 = n({ id: 'r2', depth: 1, parentId: 'root', x: 800, y: 460, color: '#22c55e', sortOrder: 1 })
  const left = n({ id: 'x1', depth: 1, parentId: 'root', x: 100, y: 380, color: '#ef4444', sortOrder: 2 })

  it('leaves the root from its right face for a topic on the right', () => {
    const { container } = renderLayer([root, right], 'curved', 'mindmap')
    const d = container.querySelector('path')!.getAttribute('d')!
    // starts at the root's RIGHT edge (x = 400 + 200) and lands on the child's left
    expect(d.startsWith('M 600 465')).toBe(true)
    expect(d.endsWith('800 400')).toBe(true)
  })

  it('leaves the root from its LEFT face for a topic on the left', () => {
    const { container } = renderLayer([root, left], 'curved', 'mindmap')
    const d = container.querySelector('path')!.getAttribute('d')!
    expect(d.startsWith('M 400 465')).toBe(true)
    // lands on the child's RIGHT edge (100 + 100)
    expect(d.endsWith('200 400')).toBe(true)
  })

  it('fans both sides at once and numbers the topics it fans', () => {
    const { container } = renderLayer([root, right, right2, left], 'curved', 'mindmap')
    expect(container.querySelectorAll('path').length).toBe(3)
    // A side holding a single topic draws the plain curve, which carries no badge -
    // the same as the brace style it shares its connector with.
    expect([...container.querySelectorAll('text')].map(t => t.textContent)).toEqual(['1', '2'])
  })

  it('draws nothing for a map with no children', () => {
    const { container } = renderLayer([root], 'curved', 'mindmap')
    expect(container.querySelectorAll('path').length).toBe(0)
  })
})

describe('EdgeLayer — fishbone', () => {
  const root = n({ id: 'root', depth: 0, x: 100, y: 380, width: 180, height: 54 })
  const l1above = n({ id: 'la', depth: 1, parentId: 'root', x: 500, y: 100, width: 160, height: 44, color: '#3b82f6' })
  const l1below = n({ id: 'lb', depth: 1, parentId: 'root', x: 800, y: 600, width: 160, height: 44, color: '#22c55e' })
  const l2above = n({ id: 'l2a', depth: 2, parentId: 'la', x: 450, y: 200, width: 130, height: 36 })
  const l2below = n({ id: 'l2b', depth: 2, parentId: 'lb', x: 750, y: 550, width: 130, height: 36 })
  const l3 = n({ id: 'l3', depth: 3, parentId: 'l2a', x: 300, y: 200, width: 110, height: 30 })

  it('returns null with no root', () => {
    const { container } = renderLayer([l1above], 'straight', 'fishbone')
    expect(container.querySelector('line')).toBeFalsy()
  })

  it('renders the spine + L1 diagonals (above and below)', () => {
    const { container } = renderLayer([root, l1above, l1below], 'straight', 'fishbone')
    // spine + 2 diagonals
    expect(container.querySelectorAll('line').length).toBeGreaterThanOrEqual(3)
  })

  it('renders L2 stubs for both above and below the spine', () => {
    const { container } = renderLayer([root, l1above, l1below, l2above, l2below], 'straight', 'fishbone')
    expect(container.querySelectorAll('line').length).toBeGreaterThanOrEqual(5)
  })

  it('skips an L2 whose parent L1 is missing', () => {
    const orphanL2 = n({ id: 'ol2', depth: 2, parentId: 'ghost', x: 450, y: 200 })
    const { container } = renderLayer([root, l1above, orphanL2], 'straight', 'fishbone')
    // spine + L1 diagonal only (orphan L2 skipped)
    expect(container.querySelectorAll('line').length).toBe(2)
  })

  it('renders L3+ horizontal connectors', () => {
    const { container } = renderLayer([root, l1above, l2above, l3], 'straight', 'fishbone')
    expect(container.querySelectorAll('line').length).toBeGreaterThanOrEqual(3)
  })

  it('skips an L3 whose parent is missing', () => {
    const orphanL3 = n({ id: 'ol3', depth: 3, parentId: 'ghost', x: 300, y: 200 })
    const { container } = renderLayer([root, l1above, orphanL3], 'straight', 'fishbone')
    expect(container.querySelectorAll('line').length).toBe(2)
  })

  it('extends the spine to a default when there are no L1 nodes', () => {
    const { container } = renderLayer([root], 'straight', 'fishbone')
    expect(container.querySelectorAll('line').length).toBe(1)
  })
})

// ── Timeline ─────────────────────────────────────────────────────────────────
describe('EdgeLayer — timeline', () => {
  const root = n({ id: 'root', depth: 0, x: 100, y: 380, width: 180, height: 54 })
  const l1 = n({ id: 'l1', depth: 1, parentId: 'root', x: 400, y: 300, width: 120, height: 40, color: '#3b82f6' })
  const l2above = n({ id: 'l2a', depth: 2, parentId: 'l1', x: 400, y: 100, width: 120, height: 40 })
  const l2below = n({ id: 'l2b', depth: 2, parentId: 'l1', x: 400, y: 600, width: 120, height: 40 })
  const l3 = n({ id: 'l3', depth: 3, parentId: 'l2a', x: 400, y: 50, width: 120, height: 40 })

  it('returns null with no root', () => {
    const { container } = renderLayer([l1], 'straight', 'timeline')
    expect(container.querySelector('line')).toBeFalsy()
  })

  it('renders the horizontal spine and per-L1 branches (above spine)', () => {
    const { container } = renderLayer([root, l1, l2above, l3], 'straight', 'timeline')
    expect(container.querySelectorAll('line').length).toBeGreaterThanOrEqual(3)
  })

  it('handles descendants below the spine', () => {
    const { container } = renderLayer([root, l1, l2below], 'straight', 'timeline')
    expect(container.querySelectorAll('line').length).toBeGreaterThanOrEqual(2)
  })

  it('renders an L1 with no descendants (no vertical branch)', () => {
    const { container } = renderLayer([root, l1], 'straight', 'timeline')
    // spine + (no branch line since no descendants)
    expect(container.querySelectorAll('line').length).toBeGreaterThanOrEqual(1)
  })

  it('extends spine to default with no L1 nodes', () => {
    const { container } = renderLayer([root], 'straight', 'timeline')
    expect(container.querySelectorAll('line').length).toBe(1)
  })

  it('drops the trunk from the box centre and stops it at the last elbow', () => {
    const trunk = (nodes: ReturnType<typeof n>[]) => {
      const { container } = renderLayer(nodes, 'straight', 'timeline')
      const l = [...container.querySelectorAll('line')]
        .find(e => e.getAttribute('x1') === e.getAttribute('x2'))!
      return { x: Number(l.getAttribute('x1')), y1: Number(l.getAttribute('y1')), y2: Number(l.getAttribute('y2')) }
    }
    const branchX = l1.x + l1.width / 2
    // above: leaves the box's top edge, stops ELBOW_R short of the last child's centre
    const a = trunk([root, l1, l2above])
    expect(a.x).toBe(branchX)
    expect(a.y1).toBe(l1.y)
    expect(a.y2).toBe(l2above.y + l2above.height / 2 + TIMELINE_ELBOW_R)
    // below: leaves the box's bottom edge, same rule mirrored
    const b = trunk([root, l1, l2below])
    expect(b.y1).toBe(l1.y + l1.height)
    expect(b.y2).toBe(l2below.y + l2below.height / 2 - TIMELINE_ELBOW_R)
  })

  it('draws a rounded elbow off the trunk into each child', () => {
    const { container } = renderLayer([root, l1, l2above], 'straight', 'timeline')
    const d = container.querySelector('path')!.getAttribute('d')!
    expect(d).toContain('Q')
    expect(container.querySelector('path')!.getAttribute('fill')).toBe('none')
  })

  it('paints each spine segment in the colour of the topic it leads into', () => {
    const l1b = n({ id: 'l1b', depth: 1, parentId: 'root', x: 700, y: 300, width: 120, height: 40, color: '#f59e0b' })
    const { container } = renderLayer([root, l1, l1b], 'straight', 'timeline')
    const horiz = [...container.querySelectorAll('line')]
      .filter(e => e.getAttribute('y1') === e.getAttribute('y2'))
    expect(horiz[0].getAttribute('stroke')).toBe(l1.color)
    expect(horiz[1].getAttribute('stroke')).toBe(l1b.color)
  })

  it('sorts multiple L1 nodes by x (sort comparator runs)', () => {
    const l1b = n({ id: 'l1b', depth: 1, parentId: 'root', x: 700, y: 300, width: 120, height: 40, color: '#f59e0b' })
    const { container } = renderLayer([root, l1, l1b, l2above], 'straight', 'timeline')
    expect(container.querySelectorAll('line').length).toBeGreaterThanOrEqual(2)
  })
})

// ── Tree / default ───────────────────────────────────────────────────────────
describe('EdgeLayer — tree (default)', () => {
  const root = n({ id: 'root', depth: 0, x: 0, y: 0, width: 180, height: 60 })
  const a = n({ id: 'a', depth: 1, parentId: 'root', x: 300, y: 0 })
  const b = n({ id: 'b', depth: 2, parentId: 'a', x: 600, y: 0 })

  it('renders Edge components for every parent-child pair', () => {
    const { container } = renderLayer([root, a, b], 'orthogonal', 'tree' as DiagramType)
    expect(container.querySelectorAll('path').length).toBeGreaterThanOrEqual(2)
  })

  it('skips edges whose parent is missing', () => {
    const orphan = n({ id: 'orphan', depth: 1, parentId: 'ghost', x: 300, y: 0 })
    const { container } = renderLayer([root, a, orphan], 'orthogonal', 'tree' as DiagramType)
    expect(container.querySelectorAll('path').length).toBe(1)
  })
})

// ── Honeycomb ───────────────────────────────────────────────────────────────
describe('EdgeLayer — honeycomb', () => {
  // 3 topics, 1 of them with children: only that 1 is broken off from its own
  // island by the empty comb between them, so only that 1 gets a connector.
  const comb = (combStyle?: 'mesh' | 'web') => computeHoneycombLayout([
    n({ id: 'root', depth: 0, title: 'Root', ...(combStyle ? { combStyle } : {}) }),
    n({ id: 'a', depth: 1, parentId: 'root', sortOrder: 0 }),
    n({ id: 'b', depth: 1, parentId: 'root', sortOrder: 1 }),
    n({ id: 'c', depth: 1, parentId: 'root', sortOrder: 2 }),
    n({ id: 'a1', depth: 2, parentId: 'a', sortOrder: 0 }),
    n({ id: 'a2', depth: 2, parentId: 'a', sortOrder: 1 }),
  ] as MindmapNode[])

  it('mesh: 1 polyline per topic that has an island, and never a straight line', () => {
    const { container } = renderLayer(comb(), 'straight', 'honeycomb' as DiagramType)
    const links = container.querySelectorAll('polyline.mesh-link')
    // Only 'a' has children, so only 'a' is broken off from something.
    expect(links.length).toBe(1)
    expect(container.querySelectorAll('line').length).toBe(0)
    expect(links[0].getAttribute('stroke-width')).toBe(String(MESH_WALL_WIDTH))
    // It runs along the comb grid, so it bends: 3 points at the very least.
    expect(links[0].getAttribute('points')!.trim().split(/\s+/).length).toBeGreaterThanOrEqual(3)
  })

  it('web: a straight centre-to-centre line per parent/child pair, thickest at depth 1', () => {
    const { container } = renderLayer(comb('web'), 'straight', 'honeycomb' as DiagramType)
    const lines = container.querySelectorAll('line')
    expect(lines.length).toBe(5)
    expect(container.querySelectorAll('polyline.mesh-link').length).toBe(0)
    const widths = [...lines].map(l => Number(l.getAttribute('stroke-width')))
    expect(Math.max(...widths)).toBe(6)
    expect(widths.filter(w => w === 4).length).toBe(2)
  })
})
