import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useDiagram, lsDeleteDiagram } from '../useDiagram'
import { useMindmapStore } from '../../store/mindmapStore'
import type { Diagram, MindmapNode } from '../../types'

// DOM-based toast + Web Audio sounds → mock
vi.mock('../../components/CuteToast', () => ({ showToast: vi.fn() }))
vi.mock('../../lib/sounds', () => ({
  soundCreate: vi.fn(), soundDelete: vi.fn(), soundSave: vi.fn(),
  soundPaste: vi.fn(), soundClick: vi.fn(), soundHover: vi.fn(), soundIncoming: vi.fn(),
}))

import { showToast } from '../../components/CuteToast'
import { soundSave, soundCreate, soundPaste, soundDelete } from '../../lib/sounds'

// ── helpers ───────────────────────────────────────────────────────────────────
function makeRow(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'd1', name: 'Remote Map', type: 'logic-chart', line_style: 'orthogonal',
    created_at: '2024-01-01T00:00:00Z', updated_at: '2024-06-01T00:00:00Z',
    sharing_enabled: false, theme_id: 'default', tags: ['a'],
    nodes: [
      { id: 'root', title: 'Root', color: '#000', parentId: null, depth: 0, x: 0, y: 0, width: 180, height: 180, sortOrder: 0 },
      { id: 'c1', title: 'C1', color: '#f00', parentId: 'root', depth: 1, x: 0, y: 0, width: 160, height: 40, sortOrder: 0, manuallyPositioned: true, fontSize: 18, bold: true, italic: true, textAlign: 'left', borderColor: '#111', borderWidth: 2, icon: 'star', emoji: '⭐' },
    ],
    ...over,
  }
}

function makeNodes(): MindmapNode[] {
  return [
    { id: 'root', title: 'Pasted', color: '#000', parentId: null, depth: 0, x: 0, y: 0, width: 180, height: 180, sortOrder: 0 },
    { id: 'c1', title: 'C1', color: '#f00', parentId: 'root', depth: 1, x: 0, y: 0, width: 160, height: 40, sortOrder: 0 },
  ]
}

function jsonResponse(body: unknown, ok = true, status = 200) {
  return { ok, status, json: async () => body } as unknown as Response
}

let fetchMock: ReturnType<typeof vi.fn>

beforeEach(() => {
  useMindmapStore.getState().clearDiagram()
  useMindmapStore.getState().setDiagrams([])
  localStorage.clear()
  fetchMock = vi.fn()
  vi.stubGlobal('fetch', fetchMock)
  vi.clearAllMocks()
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

// ── loadDiagramList ─────────────────────────────────────────────────────────
describe('loadDiagramList', () => {
  it('sets empty list when no userId', async () => {
    const { result } = renderHook(() => useDiagram(null))
    await act(async () => { await result.current.loadDiagramList() })
    expect(useMindmapStore.getState().diagrams).toEqual([])
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('maps rows into diagram metas, normalizing legacy types', async () => {
    fetchMock.mockResolvedValue(jsonResponse([
      { id: 'd1', name: 'One', type: 'logic', updated_at: '2024-06-01', sharing_enabled: true, tags: ['x'] },
      { id: 'd2', name: 'Two', type: 'mindmap', updated_at: '2024-06-02' },
    ]))
    const { result } = renderHook(() => useDiagram('u1'))
    await act(async () => { await result.current.loadDiagramList() })
    const list = useMindmapStore.getState().diagrams
    expect(list).toHaveLength(2)
    const d1 = list.find(d => d.id === 'd1')!
    expect(d1.type).toBe('logic-chart') // 'logic' normalized
    expect(d1.isPublic).toBe(true)
    expect(d1.tags).toEqual(['x'])
    const d2 = list.find(d => d.id === 'd2')!
    expect(d2.type).toBe('mindmap')
    expect(d2.tags).toEqual([]) // missing tags → []
  })

  it('handles null/empty response body (?? [] fallback)', async () => {
    fetchMock.mockResolvedValue(jsonResponse(null))
    const { result } = renderHook(() => useDiagram('u1'))
    await act(async () => { await result.current.loadDiagramList() })
    expect(useMindmapStore.getState().diagrams).toEqual([])
  })

  it('sets empty list on a non-ok response', async () => {
    fetchMock.mockResolvedValue(jsonResponse([], false, 500))
    useMindmapStore.getState().setDiagrams([{ id: 'old', name: 'Old', type: 'logic-chart', updatedAt: '2024-01-01' }])
    const { result } = renderHook(() => useDiagram('u1'))
    await act(async () => { await result.current.loadDiagramList() })
    expect(useMindmapStore.getState().diagrams).toEqual([])
  })

  it('sets empty list when fetch throws', async () => {
    fetchMock.mockRejectedValue(new Error('network down'))
    const { result } = renderHook(() => useDiagram('u1'))
    await act(async () => { await result.current.loadDiagramList() })
    expect(useMindmapStore.getState().diagrams).toEqual([])
  })
})

// ── loadDiagram ─────────────────────────────────────────────────────────────
describe('loadDiagram', () => {
  it('fetches a fresh diagram, sets it active, and caches it (200)', async () => {
    fetchMock.mockResolvedValue(jsonResponse(makeRow()))
    const { result } = renderHook(() => useDiagram('u1'))
    let returned: Diagram | null = null
    await act(async () => { returned = await result.current.loadDiagram('d1') })
    expect(returned!.id).toBe('d1')
    expect(useMindmapStore.getState().activeMindmap!.id).toBe('d1')
    expect(localStorage.getItem('activeMindmapId')).toBe('d1')
    expect(localStorage.getItem('mindmaps:diagram:d1')).toBeTruthy()
    // user_id appended when present
    expect(fetchMock.mock.calls[0][0]).toContain('user_id=u1')
  })

  it('queries without user_id when none is provided (shared links)', async () => {
    fetchMock.mockResolvedValue(jsonResponse(makeRow()))
    const { result } = renderHook(() => useDiagram(null))
    await act(async () => { await result.current.loadDiagram('d1') })
    expect(fetchMock.mock.calls[0][0]).not.toContain('user_id')
    expect(fetchMock.mock.calls[0][0]).toContain('id=d1')
  })

  it('shows the cached copy first when one exists', async () => {
    // seed cache
    const cached: Diagram = { id: 'd1', name: 'Cached', type: 'logic-chart', lineStyle: 'orthogonal', createdAt: '2024-01-01', updatedAt: '2024-05-01', nodes: makeNodes() }
    localStorage.setItem('mindmaps:diagram:d1', JSON.stringify(cached))
    // remote is OLDER → cache should win (localTime > remoteTime)
    fetchMock.mockResolvedValue(jsonResponse(makeRow({ updated_at: '2024-01-15T00:00:00Z' })))
    const { result } = renderHook(() => useDiagram('u1'))
    let returned: Diagram | null = null
    await act(async () => { returned = await result.current.loadDiagram('d1') })
    expect(returned!.name).toBe('Cached')
    // active map was set from cache instantly
    expect(useMindmapStore.getState().activeMindmap!.name).toBe('Cached')
  })

  it('replaces the cache when the remote copy is newer', async () => {
    const cached: Diagram = { id: 'd1', name: 'Cached', type: 'logic-chart', lineStyle: 'orthogonal', createdAt: '2024-01-01', updatedAt: '2024-01-01', nodes: makeNodes() }
    localStorage.setItem('mindmaps:diagram:d1', JSON.stringify(cached))
    fetchMock.mockResolvedValue(jsonResponse(makeRow({ updated_at: '2024-12-01T00:00:00Z', name: 'Remote Newer' })))
    const { result } = renderHook(() => useDiagram('u1'))
    let returned: Diagram | null = null
    await act(async () => { returned = await result.current.loadDiagram('d1') })
    expect(returned!.name).toBe('Remote Newer')
  })

  it('normalizes a legacy "logic" type via rowToDiagram', async () => {
    fetchMock.mockResolvedValue(jsonResponse(makeRow({ type: 'logic' })))
    const { result } = renderHook(() => useDiagram('u1'))
    let returned: Diagram | null = null
    await act(async () => { returned = await result.current.loadDiagram('d1') })
    expect(returned!.type).toBe('logic-chart')
  })

  it('defaults a depth>0 node manuallyPositioned to false when missing', async () => {
    const row = makeRow({
      nodes: [
        { id: 'root', title: 'R', color: '#000', parentId: null, depth: 0, x: 0, y: 0, width: 180, height: 180, sortOrder: 0 },
        // depth 1, NO manuallyPositioned key → ?? false fallback
        { id: 'c1', title: 'C1', color: '#f00', parentId: 'root', depth: 1, x: 0, y: 0, width: 160, height: 40, sortOrder: 0 },
      ],
    })
    fetchMock.mockResolvedValue(jsonResponse(row))
    const { result } = renderHook(() => useDiagram('u1'))
    let returned: Diagram | null = null
    await act(async () => { returned = await result.current.loadDiagram('d1') })
    expect(returned!.nodes.find(n => n.id === 'c1')!.manuallyPositioned).toBe(false)
  })

  it('treats a cache/remote pair with no updatedAt via the ?? 0 fallbacks', async () => {
    // cached has no updatedAt → localTime 0; remote also has no updated_at → remoteTime 0
    const cached = { id: 'd1', name: 'Cached NoDate', type: 'logic-chart', lineStyle: 'orthogonal', createdAt: '2024-01-01', nodes: makeNodes() }
    localStorage.setItem('mindmaps:diagram:d1', JSON.stringify(cached))
    fetchMock.mockResolvedValue(jsonResponse({ id: 'd1', name: 'Remote NoDate', type: 'logic-chart', nodes: [] }))
    const { result } = renderHook(() => useDiagram('u1'))
    let returned: Diagram | null = null
    await act(async () => { returned = await result.current.loadDiagram('d1') })
    // 0 > 0 is false → remote wins
    expect(returned!.name).toBe('Remote NoDate')
  })

  it('applies row defaults when optional columns are missing', async () => {
    const sparse = {
      id: 'd1', name: 'Sparse', type: 'mindmap',
      nodes: [{ id: 'root', title: 'R', color: '#000', parentId: null, depth: 0, x: 0, y: 0, width: 180, height: 180, sortOrder: 0, fontSize: 13 }],
    }
    fetchMock.mockResolvedValue(jsonResponse(sparse))
    const { result } = renderHook(() => useDiagram('u1'))
    let returned: Diagram | null = null
    await act(async () => { returned = await result.current.loadDiagram('d1') })
    expect(returned!.lineStyle).toBe('orthogonal')
    expect(returned!.themeId).toBe('default')
    expect(returned!.sharingEnabled).toBe(false)
    expect(returned!.tags).toEqual([])
    // fontSize === 13 is dropped to undefined
    expect(returned!.nodes[0].fontSize).toBeUndefined()
    // createdAt/updatedAt default to an ISO string
    expect(typeof returned!.createdAt).toBe('string')
  })

  it('handles rows with no nodes array (?? [] fallback)', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ id: 'd1', name: 'Empty', type: 'logic-chart' }))
    const { result } = renderHook(() => useDiagram('u1'))
    let returned: Diagram | null = null
    await act(async () => { returned = await result.current.loadDiagram('d1') })
    expect(returned!.nodes).toEqual([])
  })

  it('returns cached (null here) on a 404/403 without retry', async () => {
    fetchMock.mockResolvedValue(jsonResponse({}, false, 404))
    const { result } = renderHook(() => useDiagram('u1'))
    let returned: Diagram | null = 'x' as unknown as Diagram
    await act(async () => { returned = await result.current.loadDiagram('missing') })
    expect(returned).toBeNull()
    expect(fetchMock).toHaveBeenCalledTimes(1) // 4xx is final, no retry
  })

  it('returns the cached copy on a 4xx when a cache exists', async () => {
    const cached: Diagram = { id: 'd1', name: 'Cached', type: 'logic-chart', lineStyle: 'orthogonal', createdAt: '2024-01-01', updatedAt: '2024-05-01', nodes: makeNodes() }
    localStorage.setItem('mindmaps:diagram:d1', JSON.stringify(cached))
    fetchMock.mockResolvedValue(jsonResponse({}, false, 403))
    const { result } = renderHook(() => useDiagram('u1'))
    let returned: Diagram | null = null
    await act(async () => { returned = await result.current.loadDiagram('d1') })
    expect(returned!.name).toBe('Cached')
  })

  it('retries once on a 5xx then succeeds on the second attempt', async () => {
    vi.useFakeTimers()
    try {
      fetchMock
        .mockResolvedValueOnce(jsonResponse({}, false, 500))
        .mockResolvedValueOnce(jsonResponse(makeRow()))
      const { result } = renderHook(() => useDiagram('u1'))
      let returned: Diagram | null = null
      const p = result.current.loadDiagram('d1').then(r => { returned = r })
      await vi.advanceTimersByTimeAsync(500)
      await p
      expect(fetchMock).toHaveBeenCalledTimes(2)
      expect(returned!.id).toBe('d1')
    } finally {
      vi.useRealTimers()
    }
  })

  it('returns cached (null) after a 5xx retry also fails', async () => {
    vi.useFakeTimers()
    try {
      fetchMock.mockResolvedValue(jsonResponse({}, false, 500))
      const { result } = renderHook(() => useDiagram('u1'))
      let returned: Diagram | null = 'x' as unknown as Diagram
      const p = result.current.loadDiagram('d1').then(r => { returned = r })
      await vi.advanceTimersByTimeAsync(500)
      await p
      expect(fetchMock).toHaveBeenCalledTimes(2)
      expect(returned).toBeNull()
    } finally {
      vi.useRealTimers()
    }
  })

  it('returns cached when the response body carries an { error }', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ error: 'not shared' }))
    const { result } = renderHook(() => useDiagram('u1'))
    let returned: Diagram | null = 'x' as unknown as Diagram
    await act(async () => { returned = await result.current.loadDiagram('d1') })
    expect(returned).toBeNull()
  })

  it('retries once on a network throw, then falls back to cache', async () => {
    vi.useFakeTimers()
    try {
      fetchMock.mockRejectedValue(new Error('blip'))
      const { result } = renderHook(() => useDiagram('u1'))
      let returned: Diagram | null = 'x' as unknown as Diagram
      const p = result.current.loadDiagram('d1').then(r => { returned = r })
      await vi.advanceTimersByTimeAsync(500)
      await p
      expect(fetchMock).toHaveBeenCalledTimes(2)
      expect(returned).toBeNull()
    } finally {
      vi.useRealTimers()
    }
  })

  it('recovers when the first network throw is followed by success', async () => {
    vi.useFakeTimers()
    try {
      fetchMock
        .mockRejectedValueOnce(new Error('blip'))
        .mockResolvedValueOnce(jsonResponse(makeRow()))
      const { result } = renderHook(() => useDiagram('u1'))
      let returned: Diagram | null = null
      const p = result.current.loadDiagram('d1').then(r => { returned = r })
      await vi.advanceTimersByTimeAsync(500)
      await p
      expect(returned!.id).toBe('d1')
    } finally {
      vi.useRealTimers()
    }
  })
})

// ── saveDiagram ─────────────────────────────────────────────────────────────
describe('saveDiagram', () => {
  const d: Diagram = { id: 'd1', name: 'Save Me', type: 'logic-chart', lineStyle: 'orthogonal', createdAt: '2024-01-01', updatedAt: '2024-01-01', sharingEnabled: true, themeId: 'retro', tags: ['t'], nodes: makeNodes() }

  it('saves to localStorage and clears dirty without a userId (no fetch)', async () => {
    useMindmapStore.getState().setIsDirty(true)
    const { result } = renderHook(() => useDiagram(null))
    await act(async () => { await result.current.saveDiagram(d) })
    expect(localStorage.getItem('mindmaps:diagram:d1')).toBeTruthy()
    expect(useMindmapStore.getState().isDirty).toBe(false)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('POSTs to the API, clears dirty, and plays the save sound (with userId)', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ ok: true }))
    useMindmapStore.getState().setIsDirty(true)
    const { result } = renderHook(() => useDiagram('u1'))
    await act(async () => { await result.current.saveDiagram(d) })
    expect(fetchMock).toHaveBeenCalledWith('/api/mindmaps', expect.objectContaining({ method: 'POST' }))
    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string)
    expect(body).toMatchObject({ id: 'd1', user_id: 'u1', theme_id: 'retro', sharing_enabled: true })
    expect(useMindmapStore.getState().isDirty).toBe(false)
    expect(soundSave).toHaveBeenCalled()
  })

  it('still clears dirty + plays sound when the POST throws', async () => {
    fetchMock.mockRejectedValue(new Error('offline'))
    useMindmapStore.getState().setIsDirty(true)
    const { result } = renderHook(() => useDiagram('u1'))
    await act(async () => { await result.current.saveDiagram(d) })
    expect(useMindmapStore.getState().isDirty).toBe(false)
    expect(soundSave).toHaveBeenCalled()
  })

  it('defaults sharing_enabled/theme_id when the diagram omits them', async () => {
    fetchMock.mockResolvedValue(jsonResponse({}))
    const bare: Diagram = { id: 'd2', name: 'Bare', type: 'logic-chart', lineStyle: 'orthogonal', createdAt: '2024-01-01', updatedAt: '2024-01-01', nodes: makeNodes() }
    const { result } = renderHook(() => useDiagram('u1'))
    await act(async () => { await result.current.saveDiagram(bare) })
    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string)
    expect(body.sharing_enabled).toBe(false)
    expect(body.theme_id).toBe('default')
  })
})

// ── createDiagram ─────────────────────────────────────────────────────────────
describe('createDiagram', () => {
  it('builds a 6-node starter map, activates it, and toasts (no userId → no sync fetch)', async () => {
    const { result } = renderHook(() => useDiagram(null))
    let id = ''
    await act(async () => { id = await result.current.createDiagram('Fresh') })
    expect(id).toBeTruthy()
    const map = useMindmapStore.getState().activeMindmap!
    expect(map.name).toBe('Fresh')
    expect(map.nodes.filter(n => n.depth === 1)).toHaveLength(5)
    expect(localStorage.getItem('activeMindmapId')).toBe(id)
    expect(soundCreate).toHaveBeenCalled()
    expect(showToast).toHaveBeenCalledWith(expect.stringContaining('Fresh'), expect.objectContaining({ confetti: true }))
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('syncs to the server in the background when a userId is set', async () => {
    fetchMock.mockResolvedValue(jsonResponse({}))
    const { result } = renderHook(() => useDiagram('u1'))
    await act(async () => { await result.current.createDiagram('Synced') })
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/mindmaps', expect.objectContaining({ method: 'POST' })))
    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string)
    expect(body.name).toBe('Synced')
    expect(body.user_id).toBe('u1')
  })

  it('swallows a background sync failure', async () => {
    fetchMock.mockRejectedValue(new Error('sync failed'))
    const { result } = renderHook(() => useDiagram('u1'))
    let id = ''
    await act(async () => { id = await result.current.createDiagram('Resilient') })
    expect(id).toBeTruthy()
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalled())
  })
})

// ── createDiagramFromNodes ───────────────────────────────────────────────────
describe('createDiagramFromNodes', () => {
  it('creates a diagram from supplied nodes and plays the paste sound', async () => {
    const { result } = renderHook(() => useDiagram(null))
    let id: string | null = null
    await act(async () => { id = await result.current.createDiagramFromNodes('Imported', makeNodes()) })
    expect(id).toBeTruthy()
    expect(useMindmapStore.getState().activeMindmap!.name).toBe('Imported')
    expect(soundPaste).toHaveBeenCalled()
    expect(showToast).toHaveBeenCalledWith(expect.stringContaining('Imported'), expect.objectContaining({ color: '#22c55e' }))
  })

  it('disambiguates the name against existing diagrams', async () => {
    useMindmapStore.getState().setDiagrams([
      { id: 'a', name: 'Notes', type: 'logic-chart', updatedAt: '2024-01-01' },
      { id: 'b', name: 'Notes 2', type: 'logic-chart', updatedAt: '2024-01-01' },
    ])
    const { result } = renderHook(() => useDiagram(null))
    await act(async () => { await result.current.createDiagramFromNodes('Notes', makeNodes()) })
    // 'Notes' and 'Notes 2' taken → becomes 'Notes 3'
    expect(useMindmapStore.getState().activeMindmap!.name).toBe('Notes 3')
  })

  it('syncs to the server when a userId is set', async () => {
    fetchMock.mockResolvedValue(jsonResponse({}))
    const { result } = renderHook(() => useDiagram('u1'))
    await act(async () => { await result.current.createDiagramFromNodes('FromNodes', makeNodes()) })
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/mindmaps', expect.objectContaining({ method: 'POST' })))
  })

  it('swallows a background sync failure', async () => {
    fetchMock.mockRejectedValue(new Error('nope'))
    const { result } = renderHook(() => useDiagram('u1'))
    let id: string | null = null
    await act(async () => { id = await result.current.createDiagramFromNodes('Resilient2', makeNodes()) })
    expect(id).toBeTruthy()
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalled())
  })
})

// ── deleteDiagram ─────────────────────────────────────────────────────────────
describe('deleteDiagram', () => {
  it('removes a non-active diagram from localStorage + store and plays the delete sound (no userId)', async () => {
    // delete a map that is NOT the active one → skips the buggy setActiveMindmap(null) path
    useMindmapStore.getState().setActiveMindmap({ id: 'active', name: 'Active', type: 'logic-chart', lineStyle: 'orthogonal', createdAt: '2024-01-01', updatedAt: '2024-01-01', nodes: makeNodes() })
    useMindmapStore.getState().setDiagrams([
      { id: 'd1', name: 'Del', type: 'logic-chart', updatedAt: '2024-01-01' },
      { id: 'd2', name: 'Keep', type: 'logic-chart', updatedAt: '2024-01-01' },
    ])
    localStorage.setItem('mindmaps:diagram:d1', '{}')
    const { result } = renderHook(() => useDiagram(null))
    await act(async () => { await result.current.deleteDiagram('d1', 'Del') })
    expect(useMindmapStore.getState().diagrams.map(d => d.id)).toEqual(['d2'])
    expect(localStorage.getItem('mindmaps:diagram:d1')).toBeNull()
    expect(soundDelete).toHaveBeenCalled()
    expect(showToast).toHaveBeenCalledWith(expect.stringContaining('Del'), expect.anything())
    expect(fetchMock).not.toHaveBeenCalled()
  })

  // BUG: deleting the *active* map calls store.setActiveMindmap(null), but the
  // store action dereferences d.nodes with no null guard and throws. Documented
  // here so the regression is captured; see report.
  it('clears the active map and completes when deleting the currently-active map', async () => {
    useMindmapStore.getState().setActiveMindmap({ id: 'd1', name: 'Del', type: 'logic-chart', lineStyle: 'orthogonal', createdAt: '2024-01-01', updatedAt: '2024-01-01', nodes: makeNodes() })
    useMindmapStore.getState().setDiagrams([{ id: 'd1', name: 'Del', type: 'logic-chart', updatedAt: '2024-01-01' }])
    const { result } = renderHook(() => useDiagram(null))
    // Regression: previously threw "Cannot read properties of null (reading 'nodes')"
    // and skipped the rest of the delete. Now it clears cleanly and finishes.
    await act(async () => { await result.current.deleteDiagram('d1', 'Del') })
    expect(useMindmapStore.getState().activeMindmap).toBeNull()
    expect(useMindmapStore.getState().diagrams.find(d => d.id === 'd1')).toBeUndefined()
    expect(showToast).toHaveBeenCalledWith(expect.stringContaining('Del'), expect.anything())
  })

  it('uses the default "Map" label when no name is given', async () => {
    useMindmapStore.getState().setDiagrams([{ id: 'd1', name: 'X', type: 'logic-chart', updatedAt: '2024-01-01' }])
    const { result } = renderHook(() => useDiagram(null))
    await act(async () => { await result.current.deleteDiagram('d1') })
    expect(showToast).toHaveBeenCalledWith(expect.stringContaining('Map'), expect.anything())
  })

  it('leaves the active map untouched when a different id is deleted', async () => {
    useMindmapStore.getState().setActiveMindmap({ id: 'keep', name: 'Keep', type: 'logic-chart', lineStyle: 'orthogonal', createdAt: '2024-01-01', updatedAt: '2024-01-01', nodes: makeNodes() })
    const { result } = renderHook(() => useDiagram(null))
    await act(async () => { await result.current.deleteDiagram('other') })
    expect(useMindmapStore.getState().activeMindmap!.id).toBe('keep')
  })

  it('fires a background DELETE request when a userId is set', async () => {
    fetchMock.mockResolvedValue(jsonResponse({}))
    const { result } = renderHook(() => useDiagram('u1'))
    await act(async () => { await result.current.deleteDiagram('d1', 'Del') })
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('id=d1'), expect.objectContaining({ method: 'DELETE' })))
  })

  it('swallows a background DELETE failure', async () => {
    fetchMock.mockRejectedValue(new Error('delete failed'))
    const { result } = renderHook(() => useDiagram('u1'))
    await act(async () => { await result.current.deleteDiagram('d1', 'Del') })
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalled())
  })
})

// ── updateTags ────────────────────────────────────────────────────────────────
describe('updateTags', () => {
  it('updates tags across store list, active map, ls list, and ls cache (no userId)', async () => {
    useMindmapStore.getState().setActiveMindmap({ id: 'd1', name: 'Tagged', type: 'logic-chart', lineStyle: 'orthogonal', createdAt: '2024-01-01', updatedAt: '2024-01-01', nodes: makeNodes(), tags: ['old'] })
    useMindmapStore.getState().setDiagrams([{ id: 'd1', name: 'Tagged', type: 'logic-chart', updatedAt: '2024-01-01', tags: ['old'] }])
    // second entry intentionally has NO updatedAt → exercises lsGetList's ?? 0 sort fallback
    localStorage.setItem('mindmaps:list', JSON.stringify([
      { id: 'd1', name: 'Tagged', type: 'logic-chart', updatedAt: '2024-01-01', tags: ['old'] },
      { id: 'nodate', name: 'NoDate', type: 'logic-chart', tags: [] },
    ]))
    localStorage.setItem('mindmaps:diagram:d1', JSON.stringify({ id: 'd1', name: 'Tagged', type: 'logic-chart', lineStyle: 'orthogonal', createdAt: '2024-01-01', updatedAt: '2024-01-01', nodes: makeNodes(), tags: ['old'] }))
    const { result } = renderHook(() => useDiagram(null))
    await act(async () => { await result.current.updateTags('d1', ['new', 'fresh']) })
    expect(useMindmapStore.getState().diagrams[0].tags).toEqual(['new', 'fresh'])
    expect(useMindmapStore.getState().activeMindmap!.tags).toEqual(['new', 'fresh'])
    const lsList = JSON.parse(localStorage.getItem('mindmaps:list')!)
    expect(lsList[0].tags).toEqual(['new', 'fresh'])
    const cached = JSON.parse(localStorage.getItem('mindmaps:diagram:d1')!)
    expect(cached.tags).toEqual(['new', 'fresh'])
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('does not touch the active map or unrelated list rows when a different id is tagged', async () => {
    useMindmapStore.getState().setActiveMindmap({ id: 'other', name: 'Other', type: 'logic-chart', lineStyle: 'orthogonal', createdAt: '2024-01-01', updatedAt: '2024-01-01', nodes: makeNodes(), tags: [] })
    // include a second list row that does NOT match → exercises the `: d` false branch
    useMindmapStore.getState().setDiagrams([
      { id: 'd1', name: 'D1', type: 'logic-chart', updatedAt: '2024-01-01' },
      { id: 'untouched', name: 'U', type: 'logic-chart', updatedAt: '2024-01-01', tags: ['keep'] },
    ])
    const { result } = renderHook(() => useDiagram(null))
    await act(async () => { await result.current.updateTags('d1', ['z']) })
    expect(useMindmapStore.getState().activeMindmap!.tags).toEqual([])
    const list = useMindmapStore.getState().diagrams
    expect(list.find(d => d.id === 'd1')!.tags).toEqual(['z'])
    expect(list.find(d => d.id === 'untouched')!.tags).toEqual(['keep'])
  })

  it('skips the ls cache update when no cached diagram exists', async () => {
    useMindmapStore.getState().setDiagrams([{ id: 'd1', name: 'D1', type: 'logic-chart', updatedAt: '2024-01-01' }])
    const { result } = renderHook(() => useDiagram(null))
    await act(async () => { await result.current.updateTags('d1', ['solo']) })
    // no cache entry was created
    expect(localStorage.getItem('mindmaps:diagram:d1')).toBeNull()
  })

  it('fires a background PUT when a userId is set', async () => {
    fetchMock.mockResolvedValue(jsonResponse({}))
    useMindmapStore.getState().setDiagrams([{ id: 'd1', name: 'D1', type: 'logic-chart', updatedAt: '2024-01-01' }])
    const { result } = renderHook(() => useDiagram('u1'))
    await act(async () => { await result.current.updateTags('d1', ['put']) })
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/mindmaps', expect.objectContaining({ method: 'PUT' })))
    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string)
    expect(body).toMatchObject({ id: 'd1', user_id: 'u1', tags: ['put'] })
  })

  it('swallows a background PUT failure', async () => {
    fetchMock.mockRejectedValue(new Error('put failed'))
    useMindmapStore.getState().setDiagrams([{ id: 'd1', name: 'D1', type: 'logic-chart', updatedAt: '2024-01-01' }])
    const { result } = renderHook(() => useDiagram('u1'))
    await act(async () => { await result.current.updateTags('d1', ['x']) })
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalled())
  })
})

// ── lsDeleteDiagram (exported helper) ────────────────────────────────────────
describe('lsDeleteDiagram', () => {
  it('removes the cached diagram and its list entry', () => {
    localStorage.setItem('mindmaps:diagram:d1', '{}')
    localStorage.setItem('mindmaps:list', JSON.stringify([
      { id: 'd1', name: 'A', type: 'logic-chart', updatedAt: '2024-01-01' },
      { id: 'd2', name: 'B', type: 'logic-chart', updatedAt: '2024-01-02' },
    ]))
    lsDeleteDiagram('d1')
    expect(localStorage.getItem('mindmaps:diagram:d1')).toBeNull()
    const list = JSON.parse(localStorage.getItem('mindmaps:list')!)
    expect(list.map((m: { id: string }) => m.id)).toEqual(['d2'])
  })
})

// ── localStorage helper edge cases (lsGetList / lsGetDiagram sort + catch) ────
describe('localStorage helpers via the hook', () => {
  it('sorts the diagram list by updatedAt desc after createDiagram', async () => {
    localStorage.setItem('mindmaps:list', JSON.stringify([
      { id: 'old', name: 'Old', type: 'logic-chart', updatedAt: '2020-01-01' },
    ]))
    const { result } = renderHook(() => useDiagram(null))
    await act(async () => { await result.current.createDiagram('Newest') })
    const list = useMindmapStore.getState().diagrams
    // newest first
    expect(new Date(list[0].updatedAt).getTime()).toBeGreaterThan(new Date(list[1].updatedAt).getTime())
  })

  it('sorts list entries that are missing updatedAt to the bottom (?? 0 on both sides)', async () => {
    // Pre-seed entries with and without updatedAt so the comparator exercises
    // the ?? 0 fallback for both `a` and `b` operands during the sort.
    localStorage.setItem('mindmaps:list', JSON.stringify([
      { id: 'nodate1', name: 'NoDate1', type: 'logic-chart' },
      { id: 'dated', name: 'Dated', type: 'logic-chart', updatedAt: '2024-06-01' },
      { id: 'nodate2', name: 'NoDate2', type: 'logic-chart' },
    ]))
    const { result } = renderHook(() => useDiagram(null))
    // createDiagram → setDiagrams(lsGetList()) sorts the seeded list
    await act(async () => { await result.current.createDiagram('Sortable') })
    const ids = useMindmapStore.getState().diagrams.map(d => d.id)
    // dated entries sort above the no-date ones
    expect(ids.indexOf('dated')).toBeLessThan(ids.indexOf('nodate1'))
    expect(ids.indexOf('dated')).toBeLessThan(ids.indexOf('nodate2'))
  })

  it('falls back to an empty list when stored JSON is corrupt', async () => {
    localStorage.setItem('mindmaps:list', '{not json')
    const { result } = renderHook(() => useDiagram(null))
    // createDiagram → setDiagrams(lsGetList()) → lsGetList catches the parse error
    await act(async () => { await result.current.createDiagram('Recover') })
    // list still produced (the new map), corruption did not throw
    expect(useMindmapStore.getState().diagrams.length).toBeGreaterThanOrEqual(1)
  })

  it('treats a corrupt cached diagram as no cache (lsGetDiagram catch)', async () => {
    localStorage.setItem('mindmaps:diagram:d1', '{bad json')
    fetchMock.mockResolvedValue(jsonResponse(makeRow()))
    const { result } = renderHook(() => useDiagram('u1'))
    let returned: Diagram | null = null
    await act(async () => { returned = await result.current.loadDiagram('d1') })
    // corrupt cache ignored → remote diagram returned
    expect(returned!.id).toBe('d1')
  })
})
