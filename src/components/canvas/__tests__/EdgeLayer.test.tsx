import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import { EdgeLayer } from '../EdgeLayer'
import { useMindmapStore } from '../../../store/mindmapStore'
import type { DiagramType, LineStyle, MindmapNode } from '../../../types'

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
  useMindmapStore.setState({ showOrderNumbers: true })
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
describe('EdgeLayer — mindmap', () => {
  const root = n({ id: 'root', depth: 0, x: 400, y: 400, width: 180, height: 180 })
  const l1 = n({ id: 'l1', depth: 1, parentId: 'root', x: 700, y: 400, color: '#3b82f6' })
  const l2 = n({ id: 'l2', depth: 2, parentId: 'l1', x: 900, y: 400 })
  const l3 = n({ id: 'l3', depth: 3, parentId: 'l2', x: 1100, y: 400 })

  it('renders radial edges with straight line style', () => {
    const { container } = renderLayer([root, l1, l2, l3], 'straight', 'mindmap')
    expect(container.querySelectorAll('path').length).toBeGreaterThanOrEqual(3)
  })

  it('renders quadratic curve edges with curved line style', () => {
    const { container } = renderLayer([root, l1, l2], 'curved', 'mindmap')
    const d = container.querySelector('path')!.getAttribute('d')!
    expect(d).toContain('Q')
  })

  it('renders L1 order-number badges in mindmap mode', () => {
    const { container } = renderLayer([root, l1], 'straight', 'mindmap')
    expect(container.querySelector('circle')).toBeTruthy()
  })

  it('mindmap L1 badge uses sortOrder ?? 0 fallback', () => {
    const l1nb = n({ id: 'l1', depth: 1, parentId: 'root', x: 700, y: 400, color: '#3b82f6' })
    delete (l1nb as Partial<MindmapNode>).sortOrder
    const { container } = renderLayer([root, l1nb], 'straight', 'mindmap')
    expect(container.querySelector('text')?.textContent).toBe('1')
  })

  it('hides order numbers when disabled', () => {
    useMindmapStore.setState({ showOrderNumbers: false })
    const { container } = renderLayer([root, l1], 'straight', 'mindmap')
    expect(container.querySelector('circle')).toBeFalsy()
  })

  it('handles a node whose center coincides with parent (zero-length edge)', () => {
    const overlap = n({ id: 'ov', depth: 1, parentId: 'root', x: 400, y: 400, width: 180, height: 180 })
    const { container } = renderLayer([root, overlap], 'straight', 'mindmap')
    expect(container.querySelector('path')).toBeTruthy()
  })

  it('ignores edges whose parent is missing from the node map', () => {
    const orphan = n({ id: 'orphan', depth: 2, parentId: 'ghost', x: 900, y: 400 })
    const { container } = renderLayer([root, l1, orphan], 'straight', 'mindmap')
    // only the valid edge renders
    expect(container.querySelectorAll('path').length).toBe(1)
  })
})

// ── Fishbone ─────────────────────────────────────────────────────────────────
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
