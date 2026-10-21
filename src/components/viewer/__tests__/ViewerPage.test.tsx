import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent, act } from '@testing-library/react'
import { ViewerPage } from '../ViewerPage'
import { toOutline } from '../../../lib/export/outline'
import type { Diagram, MindmapNode } from '../../../types'

afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.useRealTimers() })

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
    const link = screen.getByText('Download SVG').closest('a')!
    expect(link.getAttribute('href')).toBe('/api/mindmaps?id=m1&format=svg')
  })

  it('says the map is unavailable instead of a blank page when it failed to load', () => {
    render(<ViewerPage diagram={null} id="m1" />)
    expect(screen.getByText("This map isn't available")).toBeInTheDocument()
    expect(screen.getByText('Go to Mindmaps').getAttribute('href')).toBe('/')
    expect(screen.queryByText('Download SVG')).toBeNull()
  })

  it('hides Download SVG for a ?d= decoded share (no id)', () => {
    render(<ViewerPage diagram={makeDiagram()} id={null} />)
    expect(screen.queryByText('Download SVG')).toBeNull()
  })

  it('shows the map name in the header', () => {
    render(<ViewerPage diagram={makeDiagram({ name: 'My Map' })} id="m1" />)
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('My Map')
  })

  it('offers Copy for AI and JSON exports', () => {
    render(<ViewerPage diagram={makeDiagram()} id="m1" />)
    expect(screen.getByText('Copy for AI')).toBeInTheDocument()
    expect(screen.getByText('JSON')).toBeInTheDocument()
  })

  it('outlines the map as nested Markdown for an AI agent', () => {
    const d = makeDiagram()
    d.nodes.push({ id: 'g1', title: 'Grandchild', color: '#ef4444', parentId: 'c1', depth: 2, x: 0, y: 0, width: 100, height: 30, sortOrder: 0, url: 'https://x.dev' })
    expect(toOutline(d)).toBe('# My Map\n\n- Child\n  - Grandchild (https://x.dev)\n')
  })

  it('leads the outline with the note and legend and keeps each node dot', () => {
    const d = makeDiagram()
    d.nodes[0] = { ...d.nodes[0], note: { title: 'What it is', body: 'The goal' }, legend: [{ emoji: '🔴', label: 'Deep' }, { color: '#22c55e', label: 'Light' }, { label: 'Plain' }] }
    d.nodes[1] = { ...d.nodes[1], emoji: '🔴' }
    expect(toOutline(d)).toBe('# My Map\n\n**What it is**\n\nThe goal\n\nLegend:\n- 🔴 Deep\n- #22c55e Light\n- Plain\n\n- 🔴 Child\n')
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

  it('copies the outline and flips the label to Copied, then back', async () => {
    vi.useFakeTimers()
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    render(<ViewerPage diagram={makeDiagram()} id="m1" />)
    await act(async () => { fireEvent.click(screen.getByText('Copy for AI')) })
    expect(writeText).toHaveBeenCalledWith('# My Map\n\n- Child\n')
    expect(screen.getByText('Copied')).toBeInTheDocument()
    act(() => { vi.advanceTimersByTime(1600) })
    expect(screen.getByText('Copy for AI')).toBeInTheDocument()
  })

  it('swallows a clipboard rejection', async () => {
    const writeText = vi.fn().mockRejectedValue(new Error('denied'))
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    render(<ViewerPage diagram={makeDiagram()} id="m1" />)
    await act(async () => { fireEvent.click(screen.getByText('Copy for AI')) })
    expect(screen.getByText('Copy for AI')).toBeInTheDocument()
  })

  it('does nothing on Copy for AI when there is no clipboard', () => {
    Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true })
    render(<ViewerPage diagram={makeDiagram()} id="m1" />)
    fireEvent.click(screen.getByText('Copy for AI'))
    expect(screen.getByText('Copy for AI')).toBeInTheDocument()
  })

  it('downloads the map as JSON from the JSON button', () => {
    const url = vi.fn(() => 'blob:x')
    Object.assign(URL, { createObjectURL: url, revokeObjectURL: vi.fn() })
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    render(<ViewerPage diagram={makeDiagram()} id="m1" />)
    fireEvent.click(screen.getByText('JSON'))
    expect(url).toHaveBeenCalled()
    expect(click).toHaveBeenCalled()
  })

  it('falls back to "Diagram" as the title name when the diagram has no name', () => {
    render(<ViewerPage diagram={makeDiagram({ name: '' })} id="m1" />)
    expect(document.title).toBe('Diagram · Mindmaps')
  })
})
