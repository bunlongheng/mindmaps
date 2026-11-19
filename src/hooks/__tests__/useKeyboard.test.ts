import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useKeyboard } from '../useKeyboard'
import { useMindmapStore } from '../../store/mindmapStore'
import type { Diagram, MindmapNode } from '../../types'

// showToast is DOM-based — mock it
vi.mock('../../components/CuteToast', () => ({ showToast: vi.fn() }))

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

  it('Cmd+Z fires undo while a range input (a Settings slider) has focus', () => {
    loadDiagram()
    useMindmapStore.getState().addNode('root', 'Extra')
    const afterAdd = useMindmapStore.getState().activeMindmap!.nodes.length
    renderHook(() => useKeyboard())
    const slider = document.createElement('input')
    slider.type = 'range'
    const e = key({ key: 'z', metaKey: true, target: slider })
    expect(e.defaultPrevented).toBe(true)
    expect(useMindmapStore.getState().activeMindmap!.nodes.length).toBeLessThan(afterAdd)
  })

  it('Cmd+Z is left to the browser while a text input has focus', () => {
    loadDiagram()
    useMindmapStore.getState().addNode('root', 'Extra')
    const afterAdd = useMindmapStore.getState().activeMindmap!.nodes.length
    renderHook(() => useKeyboard())
    const text = document.createElement('input')
    text.type = 'text'
    const e = key({ key: 'z', metaKey: true, target: text })
    expect(e.defaultPrevented).toBe(false)
    expect(useMindmapStore.getState().activeMindmap!.nodes.length).toBe(afterAdd)
  })

  it('Cmd+Z is left to the browser inside a contenteditable', () => {
    loadDiagram()
    useMindmapStore.getState().addNode('root', 'Extra')
    const afterAdd = useMindmapStore.getState().activeMindmap!.nodes.length
    renderHook(() => useKeyboard())
    const editable = document.createElement('div')
    Object.defineProperty(editable, 'isContentEditable', { value: true })
    const e = key({ key: 'z', metaKey: true, target: editable })
    expect(e.defaultPrevented).toBe(false)
    expect(useMindmapStore.getState().activeMindmap!.nodes.length).toBe(afterAdd)
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

  // ── Cmd+V keydown leaves the work to the paste event ──────────────────────
  it('Cmd+V keydown does not read the clipboard (the paste event handles it, once)', () => {
    loadDiagram(makeDiagram([makeRoot()]))
    const readText = vi.fn().mockResolvedValue('Root\n\tChild')
    Object.defineProperty(navigator, 'clipboard', { value: { readText }, configurable: true })
    renderHook(() => useKeyboard())
    key({ key: 'v', metaKey: true })
    expect(readText).not.toHaveBeenCalled()
    expect(useMindmapStore.getState().activeMindmap!.nodes).toHaveLength(1)
  })

  // ── cut, then paste into another map ──────────────────────────────────────
  describe('cut and paste between maps', () => {
    function clip(type: 'cut' | 'paste', data: Record<string, string>) {
      const store: Record<string, string> = { ...data }
      const e = new Event(type, { bubbles: true, cancelable: true }) as ClipboardEvent
      Object.defineProperty(e, 'clipboardData', {
        value: { setData: (t: string, v: string) => { store[t] = v }, getData: (t: string) => store[t] ?? '' },
        configurable: true,
      })
      Object.defineProperty(e, 'target', { value: document.createElement('div') })
      window.dispatchEvent(e)
      return { e, store }
    }

    it('cuts a branch from 1 map and pastes it, emoji kept, under the selected node of another', () => {
      const gc = { ...makeChild('gc1', 'GC1', 'c1', 2, 0), emoji: '🔴' }
      loadDiagram(makeDiagram([makeRoot(), makeChild('c1', 'C1', 'root', 1, 0), gc, makeChild('c2', 'C2', 'root', 1, 1)]))
      useMindmapStore.getState().setSelectedNodeIds(['c1'])
      renderHook(() => useKeyboard())
      const { e, store } = clip('cut', {})
      expect(e.defaultPrevented).toBe(true)
      expect(store['text/plain']).toContain('    GC1')
      const left = useMindmapStore.getState().activeMindmap!.nodes.map(n => n.id)
      expect(left).toEqual(expect.arrayContaining(['root', 'c2']))
      expect(left).not.toContain('c1')
      expect(left).not.toContain('gc1')

      loadDiagram({ ...makeDiagram([makeRoot(), makeChild('t1', 'Target', 'root', 1, 0)]), id: 'other' })
      useMindmapStore.getState().setSelectedNodeIds(['t1'])
      clip('paste', store)
      const nodes = useMindmapStore.getState().activeMindmap!.nodes
      const c1 = nodes.find(n => n.title === 'C1')!
      expect(c1.parentId).toBe('t1')
      expect(c1.depth).toBe(2)
      const g = nodes.find(n => n.title === 'GC1')!
      expect(g.parentId).toBe(c1.id)
      expect(nodes.find(n => n.id === 't1')!.title).toBe('Target')
      expect(nodes).toHaveLength(4)
    })

    it('refuses to cut the root', () => {
      loadDiagram()
      useMindmapStore.getState().setSelectedNodeIds(['root'])
      renderHook(() => useKeyboard())
      clip('cut', {})
      expect(useMindmapStore.getState().activeMindmap!.nodes).toHaveLength(3)
      expect(showToast).toHaveBeenCalledWith('The root cannot be cut', expect.anything())
    })

    it('paste adds to the map instead of replacing it, and Cmd+Z takes it back', () => {
      loadDiagram()
      useMindmapStore.getState().setSelectedNodeIds(['c2'])
      renderHook(() => useKeyboard())
      clip('paste', { 'text/plain': 'New A\n    New B' })
      const nodes = useMindmapStore.getState().activeMindmap!.nodes
      expect(nodes).toHaveLength(5)
      expect(nodes.find(n => n.title === 'New A')!.parentId).toBe('c2')
      expect(nodes.find(n => n.title === 'C1')).toBeDefined()
      key({ key: 'z', metaKey: true })
      expect(useMindmapStore.getState().activeMindmap!.nodes.map(n => n.title).sort()).toEqual(['C1', 'C2', 'Root'])
    })

    it('a single plain line pastes as a child of the root when nothing is selected', () => {
      loadDiagram()
      useMindmapStore.getState().setSelectedNodeIds([])
      renderHook(() => useKeyboard())
      clip('paste', { 'text/plain': 'just one plain line' })
      const added = useMindmapStore.getState().activeMindmap!.nodes.find(n => n.title === 'just one plain line')!
      expect(added.parentId).toBe('root')
      expect(added.depth).toBe(1)
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
