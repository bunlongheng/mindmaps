import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useKeyboard } from '../useKeyboard'
import { useMindmapStore } from '../../store/mindmapStore'
import type { Diagram, MindmapNode } from '../../types'

// showToast is DOM-based — mock it
vi.mock('../../components/CuteToast', () => ({ showToast: vi.fn() }))
// exportToJSON is exercised in the copy path — keep the real impl but guard sounds
vi.mock('../../lib/sounds', () => ({
  soundCreate: vi.fn(), soundDelete: vi.fn(), soundSave: vi.fn(),
  soundPaste: vi.fn(), soundClick: vi.fn(), soundHover: vi.fn(),
}))

import { showToast } from '../../components/CuteToast'

function makeRoot(): MindmapNode {
  return { id: 'root', title: 'Root', color: '#6366f1', parentId: null, depth: 0, x: 0, y: 0, width: 180, height: 180, sortOrder: 0 }
}
function makeChild(id: string, title: string, parentId: string, depth: number, sortOrder = 0): MindmapNode {
  return { id, title, color: '#ef4444', parentId, depth, x: 300, y: sortOrder * 60, width: 200, height: 40, sortOrder }
}
function makeDiagram(nodes?: MindmapNode[]): Diagram {
  return {
    id: 'kb-diagram', name: 'KB', type: 'logic-chart', lineStyle: 'orthogonal',
    nodes: nodes ?? [makeRoot(), makeChild('c1', 'C1', 'root', 1, 0), makeChild('c2', 'C2', 'root', 1, 1)],
    createdAt: '2024-01-01', updatedAt: '2024-01-01',
  }
}

function loadDiagram(d?: Diagram) {
  useMindmapStore.getState().setActiveMindmap(d ?? makeDiagram())
}

/** Dispatch a keydown with a target that is not an input/textarea (defaults to a div). */
function key(opts: Partial<KeyboardEvent> & { key: string; target?: HTMLElement }) {
  const target = opts.target ?? document.createElement('div')
  const e = new KeyboardEvent('keydown', {
    key: opts.key,
    metaKey: opts.metaKey ?? false,
    ctrlKey: opts.ctrlKey ?? false,
    shiftKey: opts.shiftKey ?? false,
    bubbles: true,
    cancelable: true,
  })
  Object.defineProperty(e, 'target', { value: target })
  window.dispatchEvent(e)
  return e
}

describe('useKeyboard', () => {
  beforeEach(() => {
    useMindmapStore.getState().clearDiagram()
    vi.clearAllMocks()
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('adds and removes window listeners on mount/unmount', () => {
    const addSpy = vi.spyOn(window, 'addEventListener')
    const removeSpy = vi.spyOn(window, 'removeEventListener')
    const { unmount } = renderHook(() => useKeyboard())
    const added = addSpy.mock.calls.map(c => c[0])
    expect(added).toEqual(expect.arrayContaining(['keydown', 'copy', 'paste']))
    unmount()
    const removed = removeSpy.mock.calls.map(c => c[0])
    expect(removed).toEqual(expect.arrayContaining(['keydown', 'copy', 'paste']))
  })

  it('ignores keystrokes originating from an <input>', () => {
    loadDiagram()
    useMindmapStore.getState().setSelectedNodeIds(['c1'])
    const spy = vi.spyOn(useMindmapStore.getState(), 'deleteSelectedNodes')
    renderHook(() => useKeyboard())
    const input = document.createElement('input')
    key({ key: 'Delete', target: input })
    expect(spy).not.toHaveBeenCalled()
  })

  it('ignores keystrokes originating from a <textarea>', () => {
    loadDiagram()
    renderHook(() => useKeyboard())
    const ta = document.createElement('textarea')
    const before = useMindmapStore.getState().selectedNodeIds
    useMindmapStore.getState().setSelectedNodeIds(['c1'])
    key({ key: 'Escape', target: ta })
    // Escape ignored → selection unchanged from what we just set
    expect(useMindmapStore.getState().selectedNodeIds).toEqual(['c1'])
    void before
  })

  it('Delete deletes selected nodes', () => {
    loadDiagram()
    useMindmapStore.getState().setSelectedNodeIds(['c1'])
    renderHook(() => useKeyboard())
    key({ key: 'Delete' })
    expect(useMindmapStore.getState().activeMindmap!.nodes.find(n => n.id === 'c1')).toBeUndefined()
  })

  it('Backspace deletes selected nodes', () => {
    loadDiagram()
    useMindmapStore.getState().setSelectedNodeIds(['c2'])
    renderHook(() => useKeyboard())
    key({ key: 'Backspace' })
    expect(useMindmapStore.getState().activeMindmap!.nodes.find(n => n.id === 'c2')).toBeUndefined()
  })

  it('Escape clears the selection', () => {
    loadDiagram()
    useMindmapStore.getState().setSelectedNodeIds(['c1', 'c2'])
    renderHook(() => useKeyboard())
    key({ key: 'Escape' })
    expect(useMindmapStore.getState().selectedNodeIds).toEqual([])
  })

  it('Cmd+A selects every node', () => {
    loadDiagram()
    renderHook(() => useKeyboard())
    const e = key({ key: 'a', metaKey: true })
    expect(e.defaultPrevented).toBe(true)
    const all = useMindmapStore.getState().activeMindmap!.nodes.map(n => n.id)
    expect(useMindmapStore.getState().selectedNodeIds).toEqual(all)
  })

  it('Ctrl+A with no active diagram still preventDefaults but selects nothing', () => {
    renderHook(() => useKeyboard())
    const e = key({ key: 'a', ctrlKey: true })
    expect(e.defaultPrevented).toBe(true)
    expect(useMindmapStore.getState().selectedNodeIds).toEqual([])
  })

  it('Cmd+Delete dissolves a single selected node', () => {
    loadDiagram(makeDiagram([makeRoot(), makeChild('c1', 'C1', 'root', 1, 0), makeChild('gc1', 'GC1', 'c1', 2, 0)]))
    useMindmapStore.getState().setSelectedNodeIds(['c1'])
    renderHook(() => useKeyboard())
    key({ key: 'Delete', metaKey: true })
    const nodes = useMindmapStore.getState().activeMindmap!.nodes
    expect(nodes.find(n => n.id === 'c1')).toBeUndefined()
    // dissolve re-parents the grandchild rather than removing it
    expect(nodes.find(n => n.id === 'gc1')!.parentId).toBe('root')
  })

  it('Ctrl+Backspace dissolves multiple selected nodes', () => {
    loadDiagram()
    useMindmapStore.getState().setSelectedNodeIds(['c1', 'c2'])
    renderHook(() => useKeyboard())
    key({ key: 'Backspace', ctrlKey: true })
    const nodes = useMindmapStore.getState().activeMindmap!.nodes
    expect(nodes.find(n => n.id === 'c1')).toBeUndefined()
    expect(nodes.find(n => n.id === 'c2')).toBeUndefined()
  })

  it('Cmd+Delete with empty selection does nothing', () => {
    loadDiagram()
    useMindmapStore.getState().setSelectedNodeIds([])
    renderHook(() => useKeyboard())
    const before = useMindmapStore.getState().activeMindmap!
    key({ key: 'Delete', metaKey: true })
    expect(useMindmapStore.getState().activeMindmap).toBe(before)
  })

  it('Cmd+Z triggers undo', () => {
    loadDiagram()
    useMindmapStore.getState().addNode('root', 'Extra')
    const afterAdd = useMindmapStore.getState().activeMindmap!.nodes.length
    renderHook(() => useKeyboard())
    const e = key({ key: 'z', metaKey: true })
    expect(e.defaultPrevented).toBe(true)
    expect(useMindmapStore.getState().activeMindmap!.nodes.length).toBeLessThan(afterAdd)
  })

  it('Cmd+Y triggers redo', () => {
    loadDiagram()
    useMindmapStore.getState().addNode('root', 'Extra')
    const afterAdd = useMindmapStore.getState().activeMindmap!.nodes.length
    useMindmapStore.getState().undo()
    renderHook(() => useKeyboard())
    const e = key({ key: 'y', metaKey: true })
    expect(e.defaultPrevented).toBe(true)
    expect(useMindmapStore.getState().activeMindmap!.nodes.length).toBe(afterAdd)
  })

  it('Cmd+Shift+Z triggers redo', () => {
    loadDiagram()
    useMindmapStore.getState().addNode('root', 'Extra')
    const afterAdd = useMindmapStore.getState().activeMindmap!.nodes.length
    useMindmapStore.getState().undo()
    renderHook(() => useKeyboard())
    const e = key({ key: 'z', metaKey: true, shiftKey: true })
    expect(e.defaultPrevented).toBe(true)
    expect(useMindmapStore.getState().activeMindmap!.nodes.length).toBe(afterAdd)
  })

  // ── Cmd+V (clipboard read → tryLoad) ───────────────────────────────────────
  describe('Cmd+V paste-from-clipboard', () => {
    it('loads a valid indented outline from the clipboard', async () => {
      loadDiagram(makeDiagram([makeRoot()]))
      const readText = vi.fn().mockResolvedValue('Root\n\tChild A\n\tChild B')
      Object.defineProperty(navigator, 'clipboard', { value: { readText }, configurable: true })
      renderHook(() => useKeyboard())
      key({ key: 'v', metaKey: true })
      await vi.waitFor(() => expect(readText).toHaveBeenCalled())
      await vi.waitFor(() =>
        expect(useMindmapStore.getState().activeMindmap!.nodes.length).toBeGreaterThanOrEqual(3))
      expect(showToast).toHaveBeenCalledWith('Loaded diagram', expect.objectContaining({ confetti: true }))
    })

    it('shows an error toast for incompatible clipboard text', async () => {
      loadDiagram(makeDiagram([makeRoot()]))
      const readText = vi.fn().mockResolvedValue('just one plain line')
      Object.defineProperty(navigator, 'clipboard', { value: { readText }, configurable: true })
      renderHook(() => useKeyboard())
      key({ key: 'v', metaKey: true })
      await vi.waitFor(() => expect(readText).toHaveBeenCalled())
      await vi.waitFor(() =>
        expect(showToast).toHaveBeenCalledWith(
          expect.stringContaining('Incompatible'), expect.objectContaining({ color: '#ef4444' })))
    })

    it('ignores empty clipboard text (tryLoad early return)', async () => {
      loadDiagram(makeDiagram([makeRoot()]))
      const readText = vi.fn().mockResolvedValue('   ')
      Object.defineProperty(navigator, 'clipboard', { value: { readText }, configurable: true })
      renderHook(() => useKeyboard())
      key({ key: 'v', metaKey: true })
      await vi.waitFor(() => expect(readText).toHaveBeenCalled())
      expect(showToast).not.toHaveBeenCalled()
    })

    it('swallows a clipboard read rejection', async () => {
      loadDiagram(makeDiagram([makeRoot()]))
      const readText = vi.fn().mockRejectedValue(new Error('denied'))
      Object.defineProperty(navigator, 'clipboard', { value: { readText }, configurable: true })
      renderHook(() => useKeyboard())
      expect(() => key({ key: 'v', metaKey: true })).not.toThrow()
      await vi.waitFor(() => expect(readText).toHaveBeenCalled())
    })

    it('does nothing when navigator.clipboard is undefined (optional chaining)', () => {
      loadDiagram(makeDiagram([makeRoot()]))
      Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true })
      renderHook(() => useKeyboard())
      expect(() => key({ key: 'v', metaKey: true })).not.toThrow()
    })

    it('loads JSON from the clipboard', async () => {
      loadDiagram(makeDiagram([makeRoot()]))
      const readText = vi.fn().mockResolvedValue('{"My Map": ["A", "B"]}')
      Object.defineProperty(navigator, 'clipboard', { value: { readText }, configurable: true })
      renderHook(() => useKeyboard())
      key({ key: 'v', metaKey: true })
      await vi.waitFor(() => expect(readText).toHaveBeenCalled())
      await vi.waitFor(() => expect(showToast).toHaveBeenCalledWith('Loaded diagram', expect.anything()))
    })
  })

  // ── copy event ─────────────────────────────────────────────────────────────
  describe('copy', () => {
    function dispatchCopy(target?: HTMLElement) {
      const setData = vi.fn()
      const e = new Event('copy', { bubbles: true, cancelable: true }) as ClipboardEvent
      Object.defineProperty(e, 'clipboardData', { value: { setData }, configurable: true })
      Object.defineProperty(e, 'target', { value: target ?? document.createElement('div') })
      window.dispatchEvent(e)
      return { e, setData }
    }

    it('copies full-diagram JSON when the root (or nothing) is selected', () => {
      loadDiagram()
      useMindmapStore.getState().setSelectedNodeIds([]) // → defaults to root
      renderHook(() => useKeyboard())
      const { e, setData } = dispatchCopy()
      expect(e.defaultPrevented).toBe(true)
      expect(setData).toHaveBeenCalledWith('text/plain', expect.stringContaining('KB'))
      expect(showToast).toHaveBeenCalledWith('Copied JSON', expect.anything())
    })

    it('copies the root subtree JSON when the root id is selected', () => {
      loadDiagram()
      useMindmapStore.getState().setSelectedNodeIds(['root'])
      renderHook(() => useKeyboard())
      const { setData } = dispatchCopy()
      expect(setData).toHaveBeenCalledWith('text/plain', expect.stringContaining('"KB"'))
    })

    it('copies an indented outline when a non-root node is selected', () => {
      loadDiagram(makeDiagram([makeRoot(), makeChild('c1', 'C1', 'root', 1, 0), makeChild('gc1', 'GC1', 'c1', 2, 0)]))
      useMindmapStore.getState().setSelectedNodeIds(['c1'])
      renderHook(() => useKeyboard())
      const { setData } = dispatchCopy()
      const text = setData.mock.calls[0][1] as string
      // c1 at indent 0, gc1 indented under it
      expect(text).toContain('C1')
      expect(text).toContain('    GC1')
    })

    it('sorts multiple children when building the outline (buildText sort)', () => {
      loadDiagram(makeDiagram([
        makeRoot(),
        makeChild('c1', 'C1', 'root', 1, 0),
        makeChild('gc2', 'GC2', 'c1', 2, 1),
        makeChild('gc1', 'GC1', 'c1', 2, 0),
      ]))
      useMindmapStore.getState().setSelectedNodeIds(['c1'])
      renderHook(() => useKeyboard())
      const { setData } = dispatchCopy()
      const text = setData.mock.calls[0][1] as string
      // children emitted in sortOrder: GC1 (0) before GC2 (1)
      expect(text.indexOf('GC1')).toBeLessThan(text.indexOf('GC2'))
    })

    it('ignores copy from an input element', () => {
      loadDiagram()
      renderHook(() => useKeyboard())
      const { e, setData } = dispatchCopy(document.createElement('input'))
      expect(e.defaultPrevented).toBe(false)
      expect(setData).not.toHaveBeenCalled()
    })

    it('does nothing on copy without an active diagram', () => {
      renderHook(() => useKeyboard())
      const { e, setData } = dispatchCopy()
      expect(e.defaultPrevented).toBe(false)
      expect(setData).not.toHaveBeenCalled()
    })

    it('does nothing when the selected node id no longer exists (no rootId fallback path)', () => {
      // build a diagram with NO root (parentId null) so rootId is undefined and
      // selection points at a missing node → startId undefined → early return
      const orphan = makeChild('orphan', 'Orphan', 'ghost', 1, 0)
      const d: Diagram = { ...makeDiagram([orphan]) }
      // setActiveMindmap requires layout; orphan has no root → layout returns nodes as-is
      useMindmapStore.getState().setActiveMindmap(d)
      useMindmapStore.getState().setSelectedNodeIds([])
      renderHook(() => useKeyboard())
      const { e, setData } = dispatchCopy()
      expect(e.defaultPrevented).toBe(true)
      // startId resolves to undefined (no rootId, empty selection) → returns before setData
      expect(setData).not.toHaveBeenCalled()
    })
  })

  // ── paste event ──────────────────────────────────────────────────────────────
  describe('paste', () => {
    function dispatchPaste(text: string, target?: HTMLElement) {
      const getData = vi.fn().mockReturnValue(text)
      const e = new Event('paste', { bubbles: true, cancelable: true }) as ClipboardEvent
      Object.defineProperty(e, 'clipboardData', { value: { getData }, configurable: true })
      Object.defineProperty(e, 'target', { value: target ?? document.createElement('div') })
      window.dispatchEvent(e)
      return e
    }

    it('loads an outline from a paste event', () => {
      loadDiagram(makeDiagram([makeRoot()]))
      renderHook(() => useKeyboard())
      const e = dispatchPaste('Root\n\tChild A\n\tChild B')
      expect(e.defaultPrevented).toBe(true)
      expect(useMindmapStore.getState().activeMindmap!.nodes.length).toBeGreaterThanOrEqual(3)
    })

    it('ignores paste from a textarea', () => {
      loadDiagram(makeDiagram([makeRoot()]))
      renderHook(() => useKeyboard())
      const e = dispatchPaste('Root\n\tChild', document.createElement('textarea'))
      expect(e.defaultPrevented).toBe(false)
    })

    it('ignores an empty paste', () => {
      loadDiagram(makeDiagram([makeRoot()]))
      renderHook(() => useKeyboard())
      const e = dispatchPaste('   ')
      expect(e.defaultPrevented).toBe(false)
    })

    it('handles a paste with no clipboardData (?? fallback)', () => {
      loadDiagram(makeDiagram([makeRoot()]))
      renderHook(() => useKeyboard())
      const e = new Event('paste', { bubbles: true, cancelable: true }) as ClipboardEvent
      Object.defineProperty(e, 'clipboardData', { value: null, configurable: true })
      Object.defineProperty(e, 'target', { value: document.createElement('div') })
      expect(() => window.dispatchEvent(e)).not.toThrow()
      expect(e.defaultPrevented).toBe(false)
    })
  })
})
