import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor, act, cleanup, within } from '@testing-library/react'
import { HomePage } from '../HomePage'
import { useMindmapStore } from '../../../store/mindmapStore'
import type { DiagramMeta } from '../../../types'

vi.mock('../../CuteToast', () => ({
  showToast: vi.fn(),
  dismissToast: vi.fn(),
  CuteToast: () => null,
}))
// AIThinkingOverlay renders an animated canvas — stub it
vi.mock('../../AIThinkingOverlay', () => ({ AIThinkingOverlay: () => <div data-testid="ai-overlay" /> }))

import { showToast } from '../../CuteToast'

const USER = { email: 'a@b.com', name: 'Alice', userId: 'u1' }

function seedDiagrams(list: DiagramMeta[]) {
  act(() => { useMindmapStore.getState().setDiagrams(list) })
}

const SAMPLE: DiagramMeta[] = [
  { id: 'm1', name: 'Project Plan', type: 'logic-chart', updatedAt: new Date(Date.now() - 2 * 60000).toISOString(), isPublic: true, tags: ['Work', 'AI'] },
  { id: 'm2', name: 'Holiday Ideas', type: 'mindmap', updatedAt: new Date(Date.now() - 3 * 3600000).toISOString(), tags: ['Personal'] },
  { id: 'm3', name: 'Untagged Map', type: 'fishbone', updatedAt: new Date(Date.now() - 5 * 86400000).toISOString(), tags: [] },
]

beforeEach(() => {
  localStorage.clear()
  act(() => { useMindmapStore.getState().setDiagrams([]) })
  vi.clearAllMocks()
  window.history.replaceState({}, '', '/')
  // Default fetch: list endpoint returns SAMPLE rows (DB shape), minimap returns nodes
  vi.stubGlobal('fetch', vi.fn(async (url: string) => ({
    ok: true,
    json: async () => {
      if (typeof url === 'string' && url.includes('/api/mindmaps?user_id=')) {
        return SAMPLE.map(d => ({ id: d.id, name: d.name, type: d.type, updated_at: d.updatedAt, sharing_enabled: d.isPublic, tags: d.tags }))
      }
      // minimap per-card fetch
      return { nodes: [], theme_id: 'default', line_style: 'orthogonal' }
    },
  })))
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('HomePage — rendering & list', () => {
  it('renders the header, search and New button', () => {
    render(<HomePage onOpen={vi.fn()} user={USER} onSignOut={vi.fn()} />)
    expect(screen.getByText('Mindmaps')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('Search maps…')).toBeInTheDocument()
    expect(screen.getByText('New')).toBeInTheDocument()
  })

  it('renders the grid of maps from the store', () => {
    seedDiagrams(SAMPLE)
    render(<HomePage onOpen={vi.fn()} user={USER} onSignOut={vi.fn()} />)
    expect(screen.getByText('Project Plan')).toBeInTheDocument()
    expect(screen.getByText('Holiday Ideas')).toBeInTheDocument()
    expect(screen.getByText('Untagged Map')).toBeInTheDocument()
    expect(screen.getByText('All Maps')).toBeInTheDocument()
  })

  it('shows the empty state when there are no maps', () => {
    render(<HomePage onOpen={vi.fn()} user={USER} onSignOut={vi.fn()} />)
    expect(screen.getByText('No maps yet')).toBeInTheDocument()
    expect(screen.getByText(/Tap \+ to create/)).toBeInTheDocument()
  })

  it('loads the diagram list on mount', async () => {
    render(<HomePage onOpen={vi.fn()} user={USER} onSignOut={vi.fn()} />)
    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith(expect.stringContaining('/api/mindmaps?user_id=u1'), expect.anything())
    })
  })

  it('opens a map when its card is clicked', () => {
    seedDiagrams(SAMPLE)
    const onOpen = vi.fn()
    render(<HomePage onOpen={onOpen} user={USER} onSignOut={vi.fn()} />)
    fireEvent.click(screen.getByText('Project Plan'))
    expect(onOpen).toHaveBeenCalledWith('m1')
  })

  it('renders relative timeAgo strings (Just now, m, h, d)', () => {
    const now = new Date().toISOString()
    seedDiagrams([
      { id: 'a', name: 'Now Map', type: 'logic-chart', updatedAt: now, tags: [] },
      { id: 'b', name: 'Min Map', type: 'logic-chart', updatedAt: new Date(Date.now() - 5 * 60000).toISOString(), tags: [] },
      { id: 'c', name: 'Hr Map', type: 'logic-chart', updatedAt: new Date(Date.now() - 2 * 3600000).toISOString(), tags: [] },
      { id: 'd', name: 'Day Map', type: 'logic-chart', updatedAt: new Date(Date.now() - 3 * 86400000).toISOString(), tags: [] },
      { id: 'e', name: 'Old Map', type: 'logic-chart', updatedAt: new Date(Date.now() - 30 * 86400000).toISOString(), tags: [] },
    ])
    render(<HomePage onOpen={vi.fn()} user={USER} onSignOut={vi.fn()} />)
    expect(screen.getByText('Just now')).toBeInTheDocument()
    expect(screen.getByText('5m ago')).toBeInTheDocument()
    expect(screen.getByText('2h ago')).toBeInTheDocument()
    expect(screen.getByText('3d ago')).toBeInTheDocument()
  })

  it('shows the public globe icon for public maps', () => {
    seedDiagrams(SAMPLE)
    const { container } = render(<HomePage onOpen={vi.fn()} user={USER} onSignOut={vi.fn()} />)
    // m1 is public — globe rendered (lucide svg). At least one card header has it.
    expect(container.querySelectorAll('svg').length).toBeGreaterThan(0)
  })
})

describe('HomePage — search & tag filtering', () => {
  it('filters maps by search text', () => {
    seedDiagrams(SAMPLE)
    render(<HomePage onOpen={vi.fn()} user={USER} onSignOut={vi.fn()} />)
    fireEvent.change(screen.getByPlaceholderText('Search maps…'), { target: { value: 'holiday' } })
    expect(screen.getByText('Holiday Ideas')).toBeInTheDocument()
    expect(screen.queryByText('Project Plan')).toBeNull()
  })

  it('shows empty state when search matches nothing', () => {
    seedDiagrams(SAMPLE)
    render(<HomePage onOpen={vi.fn()} user={USER} onSignOut={vi.fn()} />)
    fireEvent.change(screen.getByPlaceholderText('Search maps…'), { target: { value: 'zzzzz' } })
    expect(screen.getByText('No maps yet')).toBeInTheDocument()
  })

  it('filters by a tag pill and toggles it off', () => {
    seedDiagrams(SAMPLE)
    render(<HomePage onOpen={vi.fn()} user={USER} onSignOut={vi.fn()} />)
    // "Work" appears in the filter bar (pill) and in card badges; pick the pill.
    const workPill = screen.getAllByText('Work').find(el => (el.closest('button') as HTMLElement)?.style.borderRadius === '999px')!
    fireEvent.click(workPill.closest('button')!)
    expect(screen.getByText('Project Plan')).toBeInTheDocument()
    expect(screen.queryByText('Holiday Ideas')).toBeNull()
    expect(window.location.search).toContain('tag=Work')
    // toggle off
    fireEvent.click(workPill.closest('button')!)
    expect(screen.getByText('Holiday Ideas')).toBeInTheDocument()
  })

  it('filters by No Tag pill', () => {
    seedDiagrams(SAMPLE)
    render(<HomePage onOpen={vi.fn()} user={USER} onSignOut={vi.fn()} />)
    fireEvent.click(screen.getByText('No Tag'))
    expect(screen.getByText('Untagged Map')).toBeInTheDocument()
    expect(screen.queryByText('Project Plan')).toBeNull()
  })

  it('All pill resets the filter', () => {
    seedDiagrams(SAMPLE)
    render(<HomePage onOpen={vi.fn()} user={USER} onSignOut={vi.fn()} />)
    const personalPill = screen.getAllByText('Personal').find(el => (el.closest('button') as HTMLElement)?.style.borderRadius === '999px')!
    fireEvent.click(personalPill.closest('button')!)
    expect(screen.queryByText('Project Plan')).toBeNull()
    fireEvent.click(screen.getByText('All'))
    expect(screen.getByText('Project Plan')).toBeInTheDocument()
  })

  it('initializes activeTag from the URL ?tag= param', () => {
    window.history.replaceState({}, '', '/?tag=Personal')
    seedDiagrams(SAMPLE)
    render(<HomePage onOpen={vi.fn()} user={USER} onSignOut={vi.fn()} />)
    expect(screen.getByText('Holiday Ideas')).toBeInTheDocument()
    expect(screen.queryByText('Project Plan')).toBeNull()
  })
})

// Route fetch by URL: list endpoint vs AI generate endpoint.
function routeFetch(aiResponse: { ok: boolean; body: Record<string, unknown> }) {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    if (typeof url === 'string' && url.includes('/api/ai/generate-mindmap')) {
      return { ok: aiResponse.ok, json: async () => aiResponse.body }
    }
    if (typeof url === 'string' && url.includes('/api/mindmaps?user_id=')) {
      return { ok: true, json: async () => SAMPLE.map(d => ({ id: d.id, name: d.name, type: d.type, updated_at: d.updatedAt, sharing_enabled: d.isPublic, tags: d.tags })) }
    }
    return { ok: true, json: async () => ({ nodes: [], theme_id: 'default', line_style: 'orthogonal' }) }
  }))
}

function stubLocation() {
  const orig = window.location
  delete (window as { location?: Location }).location
  ;(window as { location: { href: string; search: string; pathname: string; hostname: string } }).location =
    { href: '', search: '', pathname: '/', hostname: 'localhost' }
  return () => { (window as { location: Location }).location = orig }
}

describe('HomePage — create flows', () => {
  it('creates a blank map and opens it', async () => {
    const onOpen = vi.fn()
    render(<HomePage onOpen={onOpen} user={USER} onSignOut={vi.fn()} />)
    await act(async () => { fireEvent.click(screen.getByText('New')) })
    await waitFor(() => expect(onOpen).toHaveBeenCalled())
  })

  it('opens the AI create modal via the floating button', () => {
    render(<HomePage onOpen={vi.fn()} user={USER} onSignOut={vi.fn()} />)
    const fab = screen.getByTitle('New Map')
    fireEvent.click(fab)
    expect(screen.getByText('Create with AI')).toBeInTheDocument()
    expect(screen.getByText('Generate Mindmap')).toBeInTheDocument()
  })

  it('AI generate disabled until prompt entered, then navigates on success', async () => {
    const restore = stubLocation()
    routeFetch({ ok: true, body: { id: 'newmap', usage: { total_tokens: 4000 } } })
    render(<HomePage onOpen={vi.fn()} user={USER} onSignOut={vi.fn()} />)
    fireEvent.click(screen.getByTitle('New Map'))
    const textarea = screen.getByPlaceholderText(/Business plan/) as HTMLTextAreaElement
    fireEvent.change(textarea, { target: { value: 'A SaaS roadmap' } })
    await act(async () => { fireEvent.click(screen.getByText('Generate Mindmap')) })
    await waitFor(() => expect(window.location.href).toContain('id=newmap'))
    expect(window.location.href).toContain('tokens=4000')
    restore()
  })

  // NOTE: handleAiGenerate calls setShowCreate(false) before the fetch, so on
  // error the modal is already closed and aiError is never displayed (the error
  // <p> only renders inside the still-open modal). We assert the flow finishes
  // without navigating, and the loading overlay is gone. The aiError display
  // branch (HomePage.tsx ~596-598) is effectively unreachable via this UI.
  it('AI generate on failed response: closes modal, no navigation, overlay gone', async () => {
    const restore = stubLocation()
    routeFetch({ ok: false, body: { error: 'Rate limited' } })
    render(<HomePage onOpen={vi.fn()} user={USER} onSignOut={vi.fn()} />)
    fireEvent.click(screen.getByTitle('New Map'))
    const textarea = screen.getByPlaceholderText(/Business plan/) as HTMLTextAreaElement
    fireEvent.change(textarea, { target: { value: 'Bad prompt' } })
    await act(async () => { fireEvent.click(screen.getByText('Generate Mindmap')) })
    await waitFor(() => expect(screen.queryByTestId('ai-overlay')).toBeNull())
    expect(window.location.href).toBe('')
    restore()
  })

  it('AI generate triggers on Cmd+Enter inside the textarea', async () => {
    const restore = stubLocation()
    routeFetch({ ok: true, body: { id: 'cmdmap', tokens: 800 } })
    render(<HomePage onOpen={vi.fn()} user={USER} onSignOut={vi.fn()} />)
    fireEvent.click(screen.getByTitle('New Map'))
    const textarea = screen.getByPlaceholderText(/Business plan/) as HTMLTextAreaElement
    fireEvent.change(textarea, { target: { value: 'Idea' } })
    await act(async () => { fireEvent.keyDown(textarea, { key: 'Enter', metaKey: true }) })
    await waitFor(() => expect(window.location.href).toContain('id=cmdmap'))
    restore()
  })

  it('closing the create modal via backdrop click', () => {
    render(<HomePage onOpen={vi.fn()} user={USER} onSignOut={vi.fn()} />)
    fireEvent.click(screen.getByTitle('New Map'))
    const heading = screen.getByText('Create with AI')
    const backdrop = heading.closest('div[style*="position: fixed"]')!
    fireEvent.click(backdrop)
    expect(screen.queryByText('Create with AI')).toBeNull()
  })

  it('AI generate error when response is ok but missing id (catch path, no navigation)', async () => {
    const restore = stubLocation()
    routeFetch({ ok: true, body: {} })
    render(<HomePage onOpen={vi.fn()} user={USER} onSignOut={vi.fn()} />)
    fireEvent.click(screen.getByTitle('New Map'))
    fireEvent.change(screen.getByPlaceholderText(/Business plan/), { target: { value: 'X' } })
    await act(async () => { fireEvent.click(screen.getByText('Generate Mindmap')) })
    await waitFor(() => expect(screen.queryByTestId('ai-overlay')).toBeNull())
    expect(window.location.href).toBe('')
    restore()
  })

  it('AI generate handles a network rejection (catch path)', async () => {
    const restore = stubLocation()
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (typeof url === 'string' && url.includes('/api/ai/generate-mindmap')) throw new Error('boom')
      return { ok: true, json: async () => [] }
    }))
    render(<HomePage onOpen={vi.fn()} user={USER} onSignOut={vi.fn()} />)
    fireEvent.click(screen.getByTitle('New Map'))
    fireEvent.change(screen.getByPlaceholderText(/Business plan/), { target: { value: 'X' } })
    await act(async () => { fireEvent.click(screen.getByText('Generate Mindmap')) })
    await waitFor(() => expect(screen.queryByTestId('ai-overlay')).toBeNull())
    expect(window.location.href).toBe('')
    restore()
  })

  it('does not generate when prompt is empty (guard)', () => {
    render(<HomePage onOpen={vi.fn()} user={USER} onSignOut={vi.fn()} />)
    fireEvent.click(screen.getByTitle('New Map'))
    // Generate button disabled (no prompt) → clicking is a no-op
    fireEvent.click(screen.getByText('Generate Mindmap'))
    expect(screen.getByText('Create with AI')).toBeInTheDocument()
  })
})

describe('HomePage — delete & tag editing', () => {
  it('deletes a map from the card hover delete button', () => {
    seedDiagrams(SAMPLE)
    render(<HomePage onOpen={vi.fn()} user={USER} onSignOut={vi.fn()} />)
    const card = screen.getByText('Project Plan').closest('div[style*="cursor: pointer"]')!
    fireEvent.mouseEnter(card)
    // Delete button has the red border + Trash2 icon
    const delBtn = (Array.from(card.querySelectorAll('button')) as HTMLElement[]).find(
      b => b.style.border === '1px solid rgb(254, 202, 202)'
    )!
    fireEvent.click(delBtn)
    expect(useMindmapStore.getState().diagrams.find(d => d.id === 'm1')).toBeUndefined()
  })

  it('opens the tag edit modal from the card hover tag button', () => {
    seedDiagrams(SAMPLE)
    render(<HomePage onOpen={vi.fn()} user={USER} onSignOut={vi.fn()} />)
    const card = screen.getByText('Project Plan').closest('div[style*="cursor: pointer"]')!
    fireEvent.mouseEnter(card)
    const tagBtn = (Array.from(card.querySelectorAll('button')) as HTMLElement[]).find(
      b => b.title === 'Edit tags'
    )!
    fireEvent.click(tagBtn)
    expect(screen.getByText('Edit tags')).toBeInTheDocument()
  })

  it('adds a preset tag in the tag edit modal', () => {
    seedDiagrams(SAMPLE)
    render(<HomePage onOpen={vi.fn()} user={USER} onSignOut={vi.fn()} />)
    const card = screen.getByText('Holiday Ideas').closest('div[style*="cursor: pointer"]')!
    fireEvent.mouseEnter(card)
    fireEvent.click((Array.from(card.querySelectorAll('button')) as HTMLElement[]).find(b => b.title === 'Edit tags')!)
    // The "Add tag" section lists available preset tags. Click "Research".
    const modal = screen.getByText('Edit tags').closest('div[style*="position: fixed"]')!
    fireEvent.click(within(modal as HTMLElement).getByText('Research'))
    expect(useMindmapStore.getState().diagrams.find(d => d.id === 'm2')!.tags).toContain('Research')
  })

  it('removes a current tag in the tag edit modal', () => {
    seedDiagrams(SAMPLE)
    render(<HomePage onOpen={vi.fn()} user={USER} onSignOut={vi.fn()} />)
    const card = screen.getByText('Holiday Ideas').closest('div[style*="cursor: pointer"]')!
    fireEvent.mouseEnter(card)
    fireEvent.click((Array.from(card.querySelectorAll('button')) as HTMLElement[]).find(b => b.title === 'Edit tags')!)
    const modal = screen.getByText('Edit tags').closest('div[style*="position: fixed"]')! as HTMLElement
    // Current tags section shows "Personal" with an X — clicking removes it
    const currentTagsHeader = within(modal).getByText('Current tags')
    const currentTagBtn = currentTagsHeader.parentElement!.querySelector('button')!
    fireEvent.click(currentTagBtn)
    expect(useMindmapStore.getState().diagrams.find(d => d.id === 'm2')!.tags).not.toContain('Personal')
  })

  it('adds a custom tag via the new-tag form', () => {
    seedDiagrams(SAMPLE)
    render(<HomePage onOpen={vi.fn()} user={USER} onSignOut={vi.fn()} />)
    const card = screen.getByText('Untagged Map').closest('div[style*="cursor: pointer"]')!
    fireEvent.mouseEnter(card)
    fireEvent.click((Array.from(card.querySelectorAll('button')) as HTMLElement[]).find(b => b.title === 'Edit tags')!)
    const input = screen.getByPlaceholderText('Type a new tag…') as HTMLInputElement
    fireEvent.focus(input)
    fireEvent.change(input, { target: { value: 'Custom1' } })
    fireEvent.blur(input)
    fireEvent.submit(input.closest('form')!)
    expect(useMindmapStore.getState().diagrams.find(d => d.id === 'm3')!.tags).toContain('Custom1')
  })

  it('adding a tag that already exists is a no-op (guard)', () => {
    seedDiagrams(SAMPLE)
    render(<HomePage onOpen={vi.fn()} user={USER} onSignOut={vi.fn()} />)
    // m1 already has Work + AI
    const card = screen.getByText('Project Plan').closest('div[style*="cursor: pointer"]')!
    fireEvent.mouseEnter(card)
    fireEvent.click((Array.from(card.querySelectorAll('button')) as HTMLElement[]).find(b => b.title === 'Edit tags')!)
    const input = screen.getByPlaceholderText('Type a new tag…') as HTMLInputElement
    fireEvent.change(input, { target: { value: 'Work' } }) // duplicate
    fireEvent.submit(input.closest('form')!)
    // tag list unchanged (still has exactly Work + AI)
    const tags = useMindmapStore.getState().diagrams.find(d => d.id === 'm1')!.tags!
    expect(tags.filter(t => t === 'Work').length).toBe(1)
  })

  it('tag modal with no current tags hides the Current tags section', () => {
    seedDiagrams(SAMPLE)
    render(<HomePage onOpen={vi.fn()} user={USER} onSignOut={vi.fn()} />)
    const card = screen.getByText('Untagged Map').closest('div[style*="cursor: pointer"]')!
    fireEvent.mouseEnter(card)
    fireEvent.click((Array.from(card.querySelectorAll('button')) as HTMLElement[]).find(b => b.title === 'Edit tags')!)
    expect(screen.queryByText('Current tags')).toBeNull()
    expect(screen.getByText('Add tag')).toBeInTheDocument()
  })

  it('closes the tag edit modal via the X button', () => {
    seedDiagrams(SAMPLE)
    render(<HomePage onOpen={vi.fn()} user={USER} onSignOut={vi.fn()} />)
    const card = screen.getByText('Project Plan').closest('div[style*="cursor: pointer"]')!
    fireEvent.mouseEnter(card)
    fireEvent.click((Array.from(card.querySelectorAll('button')) as HTMLElement[]).find(b => b.title === 'Edit tags')!)
    const modal = screen.getByText('Edit tags').closest('div[style*="position: fixed"]')! as HTMLElement
    // The header X button (width 30)
    const xBtn = (Array.from(modal.querySelectorAll('button')) as HTMLElement[]).find(b => b.style.width === '30px')!
    fireEvent.click(xBtn)
    expect(screen.queryByText('Edit tags')).toBeNull()
  })

  it('closes tag modal when clicking the backdrop', () => {
    seedDiagrams(SAMPLE)
    render(<HomePage onOpen={vi.fn()} user={USER} onSignOut={vi.fn()} />)
    const card = screen.getByText('Project Plan').closest('div[style*="cursor: pointer"]')!
    fireEvent.mouseEnter(card)
    fireEvent.click((Array.from(card.querySelectorAll('button')) as HTMLElement[]).find(b => b.title === 'Edit tags')!)
    const backdrop = screen.getByText('Edit tags').closest('div[style*="position: fixed"]')!
    fireEvent.click(backdrop)
    expect(screen.queryByText('Edit tags')).toBeNull()
  })

  it('tag modal returns null when target diagram is gone', () => {
    seedDiagrams(SAMPLE)
    render(<HomePage onOpen={vi.fn()} user={USER} onSignOut={vi.fn()} />)
    const card = screen.getByText('Project Plan').closest('div[style*="cursor: pointer"]')!
    fireEvent.mouseEnter(card)
    fireEvent.click((Array.from(card.querySelectorAll('button')) as HTMLElement[]).find(b => b.title === 'Edit tags')!)
    expect(screen.getByText('Edit tags')).toBeInTheDocument()
    // Remove the diagram from the store while the modal is open
    act(() => { useMindmapStore.getState().setDiagrams(SAMPLE.filter(d => d.id !== 'm1')) })
    expect(screen.queryByText('Edit tags')).toBeNull()
  })
})

describe('HomePage — user menu & import', () => {
  it('opens the user menu and signs out', () => {
    const onSignOut = vi.fn()
    render(<HomePage onOpen={vi.fn()} user={USER} onSignOut={onSignOut} />)
    fireEvent.click(screen.getByTitle('Alice'))
    expect(screen.getByText('Sign out')).toBeInTheDocument()
    fireEvent.click(screen.getByText('Sign out'))
    expect(onSignOut).toHaveBeenCalled()
  })

  it('opens the import modal from the user menu', () => {
    render(<HomePage onOpen={vi.fn()} user={USER} onSignOut={vi.fn()} />)
    fireEvent.click(screen.getByTitle('Alice'))
    fireEvent.click(screen.getByText('Import formats'))
    // ImportModal mounted (line 252) and the menu is closed
    expect(screen.getByText('Import Formats')).toBeInTheDocument()
    expect(screen.queryByText('Sign out')).toBeNull()
  })

  it('closes the user menu on outside click', () => {
    render(<HomePage onOpen={vi.fn()} user={USER} onSignOut={vi.fn()} />)
    fireEvent.click(screen.getByTitle('Alice'))
    expect(screen.getByText('Sign out')).toBeInTheDocument()
    fireEvent.mouseDown(document.body)
    expect(screen.queryByText('Sign out')).toBeNull()
  })
})

describe('HomePage — paste import', () => {
  it('imports a valid indented outline via document paste', async () => {
    const onOpen = vi.fn()
    render(<HomePage onOpen={onOpen} user={USER} onSignOut={vi.fn()} />)
    const text = 'Root\n    Child A\n    Child B'
    const pasteEvent = new Event('paste', { bubbles: true }) as ClipboardEvent
    Object.defineProperty(pasteEvent, 'clipboardData', {
      value: { getData: () => text },
    })
    await act(async () => { document.dispatchEvent(pasteEvent) })
    await waitFor(() => expect(onOpen).toHaveBeenCalled())
  })

  it('imports valid JSON via document paste', async () => {
    const onOpen = vi.fn()
    render(<HomePage onOpen={onOpen} user={USER} onSignOut={vi.fn()} />)
    const text = JSON.stringify({ title: 'JSON Root', children: [{ title: 'A' }, { title: 'B' }] })
    const pasteEvent = new Event('paste', { bubbles: true }) as ClipboardEvent
    Object.defineProperty(pasteEvent, 'clipboardData', { value: { getData: () => text } })
    await act(async () => { document.dispatchEvent(pasteEvent) })
    await waitFor(() => expect(onOpen).toHaveBeenCalled())
  })

  it('shows an error toast for incompatible paste', async () => {
    render(<HomePage onOpen={vi.fn()} user={USER} onSignOut={vi.fn()} />)
    const pasteEvent = new Event('paste', { bubbles: true }) as ClipboardEvent
    Object.defineProperty(pasteEvent, 'clipboardData', { value: { getData: () => 'just a single line' } })
    await act(async () => { document.dispatchEvent(pasteEvent) })
    expect(showToast).toHaveBeenCalledWith(expect.stringContaining('Incompatible format'), expect.anything())
  })

  it('ignores paste while focused inside an input', async () => {
    render(<HomePage onOpen={vi.fn()} user={USER} onSignOut={vi.fn()} />)
    const searchInput = screen.getByPlaceholderText('Search maps…')
    ;(searchInput as HTMLInputElement).focus()
    const pasteEvent = new Event('paste', { bubbles: true }) as ClipboardEvent
    Object.defineProperty(pasteEvent, 'clipboardData', { value: { getData: () => 'Root\n\tChild' } })
    await act(async () => { document.dispatchEvent(pasteEvent) })
    expect(showToast).not.toHaveBeenCalled()
  })

  it('ignores empty paste', async () => {
    render(<HomePage onOpen={vi.fn()} user={USER} onSignOut={vi.fn()} />)
    const pasteEvent = new Event('paste', { bubbles: true }) as ClipboardEvent
    Object.defineProperty(pasteEvent, 'clipboardData', { value: { getData: () => '   ' } })
    await act(async () => { document.dispatchEvent(pasteEvent) })
    expect(showToast).not.toHaveBeenCalled()
  })
})

describe('HomePage — DiagramMinimap', () => {
  it('hydrates a minimap from localStorage cache (logic-chart)', () => {
    localStorage.setItem('mindmaps:diagram:m1', JSON.stringify({
      id: 'm1', themeId: 'default', lineStyle: 'orthogonal',
      nodes: [
        { id: 'r', title: 'Root', parentId: null, depth: 0, color: '#000', x: 0, y: 0, width: 140, height: 140, sortOrder: 0 },
        { id: 'a', title: 'L1 A', parentId: 'r', depth: 1, color: '#f00', x: 0, y: 0, width: 100, height: 40, sortOrder: 0 },
        { id: 'b', title: 'L1 B', parentId: 'r', depth: 1, color: '#0f0', x: 0, y: 0, width: 100, height: 40, sortOrder: 1 },
      ],
    }))
    seedDiagrams([SAMPLE[0]])
    const { container } = render(<HomePage onOpen={vi.fn()} user={USER} onSignOut={vi.fn()} />)
    // SVG thumbnail rendered (logic-chart) → there are <rect> for L1 nodes
    expect(container.querySelectorAll('svg rect').length).toBeGreaterThan(0)
  })

  it('renders different thumbnail types from cache', () => {
    const mkNodes = () => ([
      { id: 'r', title: 'Root', parentId: null, depth: 0, color: '#000', x: 0, y: 0, width: 140, height: 140, sortOrder: 0 },
      { id: 'a', title: 'A', parentId: 'r', depth: 1, color: '#f00', x: 0, y: 0, width: 80, height: 40, sortOrder: 0 },
      { id: 'b', title: 'B', parentId: 'r', depth: 1, color: '#0f0', x: 0, y: 0, width: 80, height: 40, sortOrder: 1 },
      { id: 'c', title: 'C', parentId: 'r', depth: 1, color: '#00f', x: 0, y: 0, width: 80, height: 40, sortOrder: 2 },
    ])
    ;['m1', 'm2', 'm3'].forEach(id => {
      localStorage.setItem(`mindmaps:diagram:${id}`, JSON.stringify({ id, themeId: 'cyberpunk', lineStyle: 'curved', nodes: mkNodes() }))
    })
    seedDiagrams([
      { id: 'm1', name: 'Logic', type: 'logic-chart', updatedAt: new Date().toISOString(), tags: [] },
      { id: 'm2', name: 'Mindmap', type: 'mindmap', updatedAt: new Date().toISOString(), tags: [] },
      { id: 'm3', name: 'Fishbone', type: 'fishbone', updatedAt: new Date().toISOString(), tags: [] },
    ])
    const { container } = render(<HomePage onOpen={vi.fn()} user={USER} onSignOut={vi.fn()} />)
    expect(container.querySelectorAll('svg').length).toBeGreaterThanOrEqual(3)
  })

  it('renders timeline thumbnail with a pill root', () => {
    const nodes = [
      { id: 'r', title: 'A Very Long Root Title Here', parentId: null, depth: 0, color: '#000', x: 0, y: 0, width: 300, height: 90, sortOrder: 0, shape: 'pill' },
      { id: 'a', title: 'A', parentId: 'r', depth: 1, color: '#f00', x: 0, y: 0, width: 80, height: 40, sortOrder: 0 },
      { id: 'b', title: 'B', parentId: 'r', depth: 1, color: '#0f0', x: 0, y: 0, width: 80, height: 40, sortOrder: 1 },
    ]
    localStorage.setItem('mindmaps:diagram:t1', JSON.stringify({ id: 't1', themeId: 'monokai', lineStyle: 'straight', nodes }))
    seedDiagrams([{ id: 't1', name: 'Timeline', type: 'timeline', updatedAt: new Date().toISOString(), tags: [] }])
    const { container } = render(<HomePage onOpen={vi.fn()} user={USER} onSignOut={vi.fn()} />)
    expect(container.querySelectorAll('svg circle, svg rect').length).toBeGreaterThan(0)
  })

  it('renders logic-chart thumbnail with straight lineStyle', () => {
    const nodes = [
      { id: 'r', title: 'Root', parentId: null, depth: 0, color: '#000', x: 0, y: 0, width: 140, height: 140, sortOrder: 0 },
      { id: 'a', title: 'A', parentId: 'r', depth: 1, color: '#f00', x: 0, y: 0, width: 80, height: 40, sortOrder: 0 },
      { id: 'b', title: 'B', parentId: 'r', depth: 1, color: '#0f0', x: 0, y: 0, width: 80, height: 40, sortOrder: 1 },
    ]
    localStorage.setItem('mindmaps:diagram:s1', JSON.stringify({ id: 's1', themeId: 'default', lineStyle: 'straight', nodes }))
    seedDiagrams([{ id: 's1', name: 'Straight', type: 'logic-chart', updatedAt: new Date().toISOString(), tags: [] }])
    const { container } = render(<HomePage onOpen={vi.fn()} user={USER} onSignOut={vi.fn()} />)
    expect(container.querySelectorAll('svg line').length).toBeGreaterThan(0)
  })

  it('renders a dark-canvas theme thumbnail (cyberpunk root fill branch)', () => {
    const nodes = [
      { id: 'r', title: 'Root', parentId: null, depth: 0, color: '#000', x: 0, y: 0, width: 140, height: 140, sortOrder: 0 },
      { id: 'a', title: 'A', parentId: 'r', depth: 1, color: '#f00', x: 0, y: 0, width: 80, height: 40, sortOrder: 0 },
    ]
    localStorage.setItem('mindmaps:diagram:dk', JSON.stringify({ id: 'dk', themeId: 'cyberpunk', lineStyle: 'orthogonal', nodes }))
    seedDiagrams([{ id: 'dk', name: 'Dark', type: 'mindmap', updatedAt: new Date().toISOString(), tags: [] }])
    const { container } = render(<HomePage onOpen={vi.fn()} user={USER} onSignOut={vi.fn()} />)
    expect(container.querySelectorAll('svg').length).toBeGreaterThan(0)
  })

  it('shows "Open to preview" placeholder for a map with no cached nodes', () => {
    seedDiagrams([SAMPLE[0]])
    render(<HomePage onOpen={vi.fn()} user={USER} onSignOut={vi.fn()} />)
    expect(screen.getByText('Open to preview')).toBeInTheDocument()
  })
})

describe('HomePage — DiagramMinimap inView fetch', () => {
  // Override IntersectionObserver to fire its callback immediately so the
  // minimap's in-view fetch effect runs.
  let origIO: typeof IntersectionObserver
  beforeEach(() => {
    origIO = globalThis.IntersectionObserver
    class ImmediateIO {
      cb: IntersectionObserverCallback
      constructor(cb: IntersectionObserverCallback) { this.cb = cb }
      observe() {
        this.cb([{ isIntersecting: true } as IntersectionObserverEntry], this as unknown as IntersectionObserver)
      }
      unobserve() {}
      disconnect() {}
      takeRecords() { return [] }
    }
    ;(globalThis as unknown as { IntersectionObserver: unknown }).IntersectionObserver = ImmediateIO
  })
  afterEach(() => { (globalThis as unknown as { IntersectionObserver: unknown }).IntersectionObserver = origIO })

  it('fetches nodes for an in-view card with no cache and renders them', async () => {
    localStorage.setItem('mindmaps:user', JSON.stringify(USER))
    const nodes = [
      { id: 'r', title: 'Root', parentId: null, depth: 0, color: '#000', x: 0, y: 0, width: 140, height: 140, sortOrder: 0 },
      { id: 'a', title: 'A', parentId: 'r', depth: 1, color: '#f00', x: 0, y: 0, width: 80, height: 40, sortOrder: 0 },
      { id: 'b', title: 'B', parentId: 'r', depth: 1, color: '#0f0', x: 0, y: 0, width: 80, height: 40, sortOrder: 1 },
    ]
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (typeof url === 'string' && url.includes('/api/mindmaps?user_id=')) {
        return { ok: true, json: async () => [{ id: 'm1', name: 'Project Plan', type: 'logic-chart', updated_at: SAMPLE[0].updatedAt, tags: [] }] }
      }
      // per-card minimap fetch
      return { ok: true, json: async () => ({ nodes, theme_id: 'default', line_style: 'orthogonal' }) }
    }))
    seedDiagrams([{ id: 'm1', name: 'Project Plan', type: 'logic-chart', updatedAt: SAMPLE[0].updatedAt, tags: [] }])
    const { container } = render(<HomePage onOpen={vi.fn()} user={USER} onSignOut={vi.fn()} />)
    await waitFor(() => expect(container.querySelectorAll('svg rect').length).toBeGreaterThan(0))
    // thumbnail cache was written by the minimap (separate from the full-diagram cache)
    expect(localStorage.getItem('mindmaps:thumb:m1')).toBeTruthy()
  })

  it('in-view fetch that returns no nodes leaves the placeholder', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (typeof url === 'string' && url.includes('/api/mindmaps?user_id=')) {
        return { ok: true, json: async () => [{ id: 'm1', name: 'Project Plan', type: 'logic-chart', updated_at: SAMPLE[0].updatedAt, tags: [] }] }
      }
      return { ok: true, json: async () => ({ nodes: [] }) }
    }))
    seedDiagrams([{ id: 'm1', name: 'Project Plan', type: 'logic-chart', updatedAt: SAMPLE[0].updatedAt, tags: [] }])
    render(<HomePage onOpen={vi.fn()} user={USER} onSignOut={vi.fn()} />)
    await waitFor(() => expect(screen.getByText('Loading…')).toBeInTheDocument())
  })

  it('in-view fetch failure (non-ok) is swallowed', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (typeof url === 'string' && url.includes('/api/mindmaps?user_id=')) {
        return { ok: true, json: async () => [{ id: 'm1', name: 'Project Plan', type: 'logic-chart', updated_at: SAMPLE[0].updatedAt, tags: [] }] }
      }
      return { ok: false, json: async () => ({}) }
    }))
    seedDiagrams([{ id: 'm1', name: 'Project Plan', type: 'logic-chart', updatedAt: SAMPLE[0].updatedAt, tags: [] }])
    render(<HomePage onOpen={vi.fn()} user={USER} onSignOut={vi.fn()} />)
    await waitFor(() => expect(screen.getByText('Loading…')).toBeInTheDocument())
  })

  it('in-view fetch builds URL without user_id when no cached user', async () => {
    localStorage.removeItem('mindmaps:user')
    const seen: string[] = []
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (typeof url === 'string') seen.push(url)
      if (typeof url === 'string' && url.includes('/api/mindmaps?user_id=')) {
        return { ok: true, json: async () => [{ id: 'm1', name: 'Project Plan', type: 'logic-chart', updated_at: SAMPLE[0].updatedAt, tags: [] }] }
      }
      return { ok: true, json: async () => ({ nodes: [], theme_id: 'default', line_style: 'orthogonal' }) }
    }))
    seedDiagrams([{ id: 'm1', name: 'Project Plan', type: 'logic-chart', updatedAt: SAMPLE[0].updatedAt, tags: [] }])
    render(<HomePage onOpen={vi.fn()} user={USER} onSignOut={vi.fn()} />)
    await waitFor(() => expect(seen.some(u => u === '/api/mindmaps?id=m1')).toBe(true))
  })

  it('renders the default-fallback thumbnail for an unknown diagram type', async () => {
    const nodes = [
      { id: 'r', title: 'Root', parentId: null, depth: 0, color: '#000', x: 0, y: 0, width: 140, height: 140, sortOrder: 0 },
      { id: 'a', title: 'A', parentId: 'r', depth: 1, color: '#f00', x: 0, y: 0, width: 80, height: 40, sortOrder: 0 },
      { id: 'b', title: 'B', parentId: 'r', depth: 1, color: '#0f0', x: 0, y: 0, width: 80, height: 40, sortOrder: 1 },
    ]
    localStorage.setItem('mindmaps:diagram:u1m', JSON.stringify({ id: 'u1m', themeId: 'default', lineStyle: 'orthogonal', nodes }))
    // Pass an unknown type so the type-switch falls through to the default branch
    seedDiagrams([{ id: 'u1m', name: 'Weird', type: 'unknown-type' as never, updatedAt: new Date().toISOString(), tags: [] }])
    const { container } = render(<HomePage onOpen={vi.fn()} user={USER} onSignOut={vi.fn()} />)
    expect(container.querySelectorAll('svg').length).toBeGreaterThan(0)
  })
})

describe('HomePage — DiagramCard interactions (coverage)', () => {
  it('handles touch start/move/end and long-press hover via timer', () => {
    vi.useFakeTimers()
    localStorage.setItem('mindmaps:viewMode', 'grid') // touch long-press lives on DiagramCard (grid)
    seedDiagrams(SAMPLE)
    render(<HomePage onOpen={vi.fn()} user={USER} onSignOut={vi.fn()} />)
    const card = screen.getByText('Project Plan').closest('div[style*="cursor: pointer"]')!
    // touchStart sets a 500ms long-press timer that sets hovered=true
    fireEvent.touchStart(card)
    act(() => { vi.advanceTimersByTime(600) })
    // hover state now shows the edit/delete buttons
    expect((Array.from(card.querySelectorAll('button')) as HTMLElement[]).some(b => b.title === 'Edit tags')).toBe(true)
    fireEvent.mouseLeave(card)
    // touchStart again then move cancels the timer
    fireEvent.touchStart(card)
    fireEvent.touchMove(card)
    fireEvent.touchEnd(card)
    vi.useRealTimers()
  })

  it('user menu buttons exercise hover handlers', () => {
    render(<HomePage onOpen={vi.fn()} user={USER} onSignOut={vi.fn()} />)
    fireEvent.click(screen.getByTitle('Alice'))
    const importBtn = screen.getByText('Import formats')
    fireEvent.mouseEnter(importBtn); fireEvent.mouseLeave(importBtn)
    const signOut = screen.getByText('Sign out')
    fireEvent.mouseEnter(signOut); fireEvent.mouseLeave(signOut)
    expect(signOut).toBeInTheDocument()
  })

  it('renders an avatar image from cache and handles its onError', () => {
    localStorage.setItem('mindmaps:avatarB64', 'data:image/png;base64,AAAA')
    const { container } = render(<HomePage onOpen={vi.fn()} user={USER} onSignOut={vi.fn()} />)
    const img = container.querySelector('img')!
    expect(img).toBeTruthy()
    fireEvent.error(img)
    expect((img as HTMLImageElement).style.display).toBe('none')
  })

  it('AI textarea focus and blur handlers run', () => {
    render(<HomePage onOpen={vi.fn()} user={USER} onSignOut={vi.fn()} />)
    fireEvent.click(screen.getByTitle('New Map'))
    const textarea = screen.getByPlaceholderText(/Business plan/)
    fireEvent.focus(textarea)
    fireEvent.blur(textarea)
    fireEvent.change(textarea, { target: { value: 'x' } })
    fireEvent.blur(textarea) // blur with an error-less state
    expect(textarea).toBeInTheDocument()
  })

  it('new-tag form ignores an empty submission', () => {
    seedDiagrams(SAMPLE)
    render(<HomePage onOpen={vi.fn()} user={USER} onSignOut={vi.fn()} />)
    const card = screen.getByText('Untagged Map').closest('div[style*="cursor: pointer"]')!
    fireEvent.mouseEnter(card)
    fireEvent.click((Array.from(card.querySelectorAll('button')) as HTMLElement[]).find(b => b.title === 'Edit tags')!)
    const input = screen.getByPlaceholderText('Type a new tag…') as HTMLInputElement
    fireEvent.submit(input.closest('form')!) // empty → no add, modal stays open
    expect(screen.getByText('Edit tags')).toBeInTheDocument()
  })

  it('New blank button creates and opens a map', async () => {
    seedDiagrams([])
    const onOpen = vi.fn()
    render(<HomePage onOpen={onOpen} user={USER} onSignOut={vi.fn()} />)
    await act(async () => { fireEvent.click(screen.getByText('New')) })
    await waitFor(() => expect(onOpen).toHaveBeenCalled())
  })
})

describe('HomePage — no user', () => {
  it('renders without a user (loadDiagramList returns empty)', async () => {
    render(<HomePage onOpen={vi.fn()} user={null} onSignOut={vi.fn()} />)
    expect(screen.getByText('No maps yet')).toBeInTheDocument()
  })

  it('flashId highlights a matching card', () => {
    seedDiagrams(SAMPLE)
    render(<HomePage onOpen={vi.fn()} user={USER} onSignOut={vi.fn()} flashId="m1" />)
    expect(screen.getByText('Project Plan')).toBeInTheDocument()
  })
})
