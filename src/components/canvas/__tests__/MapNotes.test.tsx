import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react'
import { MapNotes } from '../MapNotes'
import { useMindmapStore } from '../../../store/mindmapStore'
import type { Diagram, MindmapNode } from '../../../types'

afterEach(() => { cleanup(); act(() => { useMindmapStore.getState().clearDiagram() }) })

function load(root: Partial<MindmapNode>) {
  const d: Diagram = {
    id: 'm1', name: 'Map', type: 'mindmap', lineStyle: 'curved', themeId: 'default', tags: [],
    createdAt: 'x', updatedAt: 'x',
    nodes: [{ id: 'root', title: 'Root', color: '#6366f1', parentId: null, depth: 0, x: 0, y: 0, width: 140, height: 140, ...root }],
  }
  act(() => { useMindmapStore.getState().setActiveMindmap(d) })
}

describe('MapNotes', () => {
  it('renders nothing when the root has no note or legend', () => {
    load({})
    const { container } = render(<MapNotes />)
    expect(container).toBeEmptyDOMElement()
  })

  it('shows the note title and body and collapses the body', () => {
    load({ note: { title: 'What it shows', body: 'The goal' } })
    render(<MapNotes top={16} />)
    expect(screen.getByTestId('map-note')).toHaveStyle({ top: '16px' })
    expect(screen.getByText('The goal')).toBeInTheDocument()
    fireEvent.click(screen.getByText('What it shows'))
    expect(screen.queryByText('The goal')).not.toBeInTheDocument()
    fireEvent.click(screen.getByText('What it shows'))
    expect(screen.getByText('The goal')).toBeInTheDocument()
  })

  it('falls back to "Note" when only a body is set', () => {
    load({ note: { body: 'Only body' } })
    render(<MapNotes />)
    expect(screen.getByText('Note')).toBeInTheDocument()
  })

  it('hides the legend when showLegend is false', () => {
    load({ legend: [{ emoji: '🔴', label: 'Deep' }], showLegend: false })
    render(<MapNotes />)
    expect(screen.queryByTestId('map-legend')).not.toBeInTheDocument()
  })

  it('lists legend rows with an emoji dot or a colour swatch', () => {
    load({ legend: [{ emoji: '🔴', label: 'Deep testing' }, { color: '#22c55e', label: 'Light testing' }, { label: 'Other' }] })
    render(<MapNotes />)
    const legend = screen.getByTestId('map-legend')
    expect(legend).toHaveTextContent('🔴Deep testing')
    expect(legend).toHaveTextContent('Light testing')
    expect(legend.querySelectorAll('li')).toHaveLength(3)
    fireEvent.click(screen.getByText('Legend'))
    expect(legend.querySelectorAll('li')).toHaveLength(0)
    expect(screen.queryByTestId('map-note')).not.toBeInTheDocument()
  })

  it('focuses legend rows on click and clears them with Show all', () => {
    load({ legend: [{ emoji: '🔴', label: 'Deep' }, { emoji: '🟢', label: 'Light' }] })
    render(<MapNotes />)
    const deep = screen.getByRole('button', { name: /Deep/ })
    fireEvent.click(deep)
    expect(useMindmapStore.getState().legendFocus).toEqual([0])
    expect(deep).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(screen.getByRole('button', { name: /Light/ }))
    expect(useMindmapStore.getState().legendFocus).toEqual([0, 1])
    fireEvent.click(deep)
    expect(useMindmapStore.getState().legendFocus).toEqual([1])
    fireEvent.click(screen.getByText('Show all'))
    expect(useMindmapStore.getState().legendFocus).toEqual([])
    expect(screen.queryByText('Show all')).not.toBeInTheDocument()
  })

  it('drops the focus when another map opens', () => {
    load({ legend: [{ emoji: '🔴', label: 'Deep' }] })
    act(() => { useMindmapStore.getState().setLegendFocus([0]) })
    act(() => { useMindmapStore.getState().setActiveMindmap({ ...useMindmapStore.getState().activeMindmap!, id: 'm2' }) })
    expect(useMindmapStore.getState().legendFocus).toEqual([])
  })
})
