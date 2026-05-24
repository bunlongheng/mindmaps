import { describe, it, expect, afterEach } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import { Edge } from '../Edge'
import type { MindmapNode, LineStyle } from '../../../types'

afterEach(cleanup)

const makeNode = (overrides: Partial<MindmapNode> = {}): MindmapNode => ({
  id: 'n', title: 'N', color: '#3b82f6', parentId: null,
  depth: 0, x: 0, y: 0, width: 100, height: 40,
  ...overrides,
})

function renderEdge(parent: MindmapNode, child: MindmapNode, lineStyle: LineStyle, diagramType: string) {
  return render(
    <svg>
      <Edge parent={parent} child={child} lineStyle={lineStyle} diagramType={diagramType} />
    </svg>
  )
}

describe('Edge', () => {
  it('renders a path with curved style (default branch) for mindmap, child to the right', () => {
    const parent = makeNode({ id: 'p', x: 0, y: 0 })
    const child = makeNode({ id: 'c', x: 300, y: 0, depth: 1, color: '#ef4444' })
    const { container } = renderEdge(parent, child, 'curved', 'mindmap')
    const path = container.querySelector('path')
    expect(path).toBeTruthy()
    // curved path uses cubic bezier "C"
    expect(path?.getAttribute('d')).toContain('C')
    expect(path?.getAttribute('stroke-width')).toBe('1.5')
    expect(path?.getAttribute('fill')).toBe('none')
    expect(path?.getAttribute('stroke-linecap')).toBe('round')
  })

  it('renders a straight path', () => {
    const parent = makeNode({ id: 'p', x: 0, y: 0 })
    const child = makeNode({ id: 'c', x: 300, y: 0 })
    const { container } = renderEdge(parent, child, 'straight', 'mindmap')
    const d = container.querySelector('path')?.getAttribute('d') ?? ''
    expect(d).toContain('L')
    expect(d).not.toContain('C')
  })

  it('renders an orthogonal path', () => {
    const parent = makeNode({ id: 'p', x: 0, y: 0 })
    const child = makeNode({ id: 'c', x: 300, y: 0 })
    const { container } = renderEdge(parent, child, 'orthogonal', 'mindmap')
    const d = container.querySelector('path')?.getAttribute('d') ?? ''
    expect(d).toContain('H')
    expect(d).toContain('V')
  })

  it('handles a child positioned to the LEFT of the parent (else branch)', () => {
    const parent = makeNode({ id: 'p', x: 300, y: 0 })
    const child = makeNode({ id: 'c', x: 0, y: 0 })
    const { container } = renderEdge(parent, child, 'curved', 'mindmap')
    expect(container.querySelector('path')).toBeTruthy()
  })

  it('uses node centers for the fishbone diagram type', () => {
    const parent = makeNode({ id: 'p', x: 0, y: 0 })
    const child = makeNode({ id: 'c', x: 200, y: 100 })
    const { container } = renderEdge(parent, child, 'straight', 'fishbone')
    const d = container.querySelector('path')?.getAttribute('d') ?? ''
    // fishbone uses nodeCenter for both ends: parent center (50,20) -> child center (250,120)
    expect(d).toBe('M 50 20 L 250 120')
  })

  it('applies depth-based transparency to the stroke color', () => {
    const parent = makeNode({ id: 'p', x: 0, y: 0 })
    const child = makeNode({ id: 'c', x: 300, y: 0, depth: 2, color: '#ff0000' })
    const { container } = renderEdge(parent, child, 'curved', 'mindmap')
    const stroke = container.querySelector('path')?.getAttribute('stroke') ?? ''
    // depth 2 => alpha = 0.8^2 (float) -> matches applyDepthTransparency output
    expect(stroke).toMatch(/^rgba\(255,0,0,0\.64/)
  })
})
