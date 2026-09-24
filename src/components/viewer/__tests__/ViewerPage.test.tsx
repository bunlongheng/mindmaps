import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { ViewerPage } from '../ViewerPage'
import type { Diagram, MindmapNode } from '../../../types'

afterEach(() => cleanup())

function makeDiagram(overrides: Partial<Diagram> = {}): Diagram {
  const nodes: MindmapNode[] = [
    { id: 'root', title: 'Root Title', color: '#6366f1', parentId: null, depth: 0, x: 0, y: 0, width: 140, height: 140, sortOrder: 0 },
    { id: 'c1', title: 'Child', color: '#ef4444', parentId: 'root', depth: 1, x: 0, y: 0, width: 160, height: 40, sortOrder: 0 },
  ]
  return {
    id: 'm1', name: 'My Map', type: 'logic-chart', lineStyle: 'orthogonal',
    nodes, createdAt: 'x', updatedAt: 'x', themeId: 'default', tags: ['Work'],
    ...overrides,
  }
}

describe('ViewerPage', () => {
  it('renders the header wordmark', () => {
    render(<ViewerPage diagram={makeDiagram()} id="m1" />)
    expect(screen.getByText('Mindmaps')).toBeInTheDocument()
    expect(screen.getByAltText('Mindmaps')).toBeInTheDocument()
  })

  it('links Download SVG to the map id when the map came from the API by id', () => {
    render(<ViewerPage diagram={makeDiagram()} id="m1" />)
    const link = screen.getByText('Download SVG')
    expect(link.getAttribute('href')).toBe('/api/mindmaps?id=m1&format=svg')
  })

  it('hides Download SVG for a ?d= decoded share (no id)', () => {
    render(<ViewerPage diagram={makeDiagram()} id={null} />)
    expect(screen.queryByText('Download SVG')).toBeNull()
  })

  it('injects the rendered SVG carrying the map name as its title', () => {
    const { container } = render(<ViewerPage diagram={makeDiagram({ name: 'My Map' })} id="m1" />)
    const svg = container.querySelector('.mm-viewer-card svg')
    expect(svg).toBeTruthy()
    expect(svg!.querySelector('title')!.textContent).toBe('My Map')
  })

  it('renders all 5 footer links', () => {
    render(<ViewerPage diagram={makeDiagram()} id="m1" />)
    for (const label of ['Portfolio', 'GitHub', 'LinkedIn', 'Instagram', 'X']) {
      expect(screen.getByTitle(label)).toBeInTheDocument()
    }
  })

  it('sets document title to "<name> · Mindmaps" and restores it on unmount', () => {
    const prevTitle = document.title
    document.title = 'Untouched'
    const { unmount } = render(<ViewerPage diagram={makeDiagram({ name: 'My Map' })} id="m1" />)
    expect(document.title).toBe('My Map · Mindmaps')
    unmount()
    expect(document.title).toBe('Untouched')
    document.title = prevTitle
  })
})
