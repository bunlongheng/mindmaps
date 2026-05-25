import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useMindmapStore } from '../mindmapStore'
import type { Diagram, MindmapNode } from '../../types'

// Mock showToast (DOM-dependent)
vi.mock('../../components/CuteToast', () => ({
  showToast: vi.fn(),
}))

function makeRoot(): MindmapNode {
  return {
    id: 'root', title: 'Root', color: '#6366f1', parentId: null,
    depth: 0, x: 0, y: 0, width: 180, height: 180,
  }
}

function makeChild(id: string, title: string, parentId: string, depth: number, sortOrder = 0): MindmapNode {
  return {
    id, title, color: '#ef4444', parentId, depth,
    x: 300, y: sortOrder * 60, width: 200, height: 40, sortOrder,
  }
}

function makeDiagram(nodes?: MindmapNode[]): Diagram {
  return {
    id: 'test-diagram',
    name: 'Test',
    type: 'logic-chart',
    lineStyle: 'orthogonal',
    nodes: nodes ?? [makeRoot(), makeChild('c1', 'Child 1', 'root', 1, 0), makeChild('c2', 'Child 2', 'root', 1, 1)],
    createdAt: '2024-01-01',
    updatedAt: '2024-01-01',
  }
}

function resetStore() {
  const store = useMindmapStore.getState()
  store.clearDiagram()
}

function loadDiagram(d?: Diagram) {
  useMindmapStore.getState().setActiveMindmap(d ?? makeDiagram())
}

describe('mindmapStore', () => {
  beforeEach(() => {
    resetStore()
  })

  describe('setActiveMindmap', () => {
    it('sets active diagram', () => {
      loadDiagram()
      const state = useMindmapStore.getState()
      expect(state.activeMindmap).not.toBeNull()
      expect(state.activeMindmap!.id).toBe('test-diagram')
    })

    it('resets history on load', () => {
      loadDiagram()
      const state = useMindmapStore.getState()
      expect(state.past).toHaveLength(0)
      expect(state.future).toHaveLength(0)
    })

    it('runs layout on all nodes', () => {
      loadDiagram()
      const nodes = useMindmapStore.getState().activeMindmap!.nodes
      // Layout should assign real positions (not all zero)
      const nonRoot = nodes.filter(n => n.depth > 0)
      expect(nonRoot.length).toBeGreaterThan(0)
    })

    // Regression: legacy/AI rows were saved with type 'logic' (not a valid
    // DiagramType). runLayout had no default case → returned undefined →
    // "nodes is not iterable" threw → the map silently failed to open.
    it('opens a map with a legacy/unknown type without crashing', () => {
      const legacy = { ...makeDiagram(), type: 'logic' as unknown as Diagram['type'] }
      expect(() => useMindmapStore.getState().setActiveMindmap(legacy)).not.toThrow()
      const nodes = useMindmapStore.getState().activeMindmap!.nodes
      expect(nodes.length).toBe(legacy.nodes.length)
      expect(nodes.filter(n => n.depth > 0).length).toBeGreaterThan(0)
    })

    // Regression: a long root title overflowed the pill (render width was hard-
    // capped at 500). The layout must now reserve a bounded pill width that matches
    // the canvas (≤720) so the title fits and children don't overlap it.
    it('reserves a bounded pill width for a long root title', () => {
      const longRoot = { ...makeRoot(), title: 'It’s Happening... Anthropic MYTHOS 1 Is Here!' }
      loadDiagram(makeDiagram([longRoot, makeChild('c1', 'Child 1', 'root', 1, 0)]))
      const root = useMindmapStore.getState().activeMindmap!.nodes.find(n => n.parentId === null)!
      expect(root.width).toBeLessThanOrEqual(720)  // capped — never unbounded
      expect(root.width).toBeGreaterThan(400)      // grew well past the short-circle size
      expect(root.width).not.toBe(root.height)     // a pill, not a circle
    })

    it('keeps a short root title as a circle (width === height)', () => {
      const shortRoot = { ...makeRoot(), title: 'Hi' }
      loadDiagram(makeDiagram([shortRoot, makeChild('c1', 'Child 1', 'root', 1, 0)]))
      const root = useMindmapStore.getState().activeMindmap!.nodes.find(n => n.parentId === null)!
      expect(root.width).toBe(root.height)
    })
  })

  describe('addNode', () => {
    it('adds a child node to root', () => {
      loadDiagram(makeDiagram([makeRoot()]))
      const newNode = useMindmapStore.getState().addNode('root', 'New Child')
      const nodes = useMindmapStore.getState().activeMindmap!.nodes
      expect(nodes.find(n => n.id === newNode.id)).toBeDefined()
      expect(newNode.parentId).toBe('root')
      expect(newNode.depth).toBe(1)
    })

    it('increments sortOrder for siblings', () => {
      loadDiagram()
      const before = useMindmapStore.getState().activeMindmap!.nodes.filter(n => n.depth === 1).length
      useMindmapStore.getState().addNode('root', 'Child 3')
      const after = useMindmapStore.getState().activeMindmap!.nodes.filter(n => n.depth === 1).length
      expect(after).toBe(before + 1)
    })

    it('creates history snapshot', () => {
      loadDiagram()
      useMindmapStore.getState().addNode('root', 'With History')
      expect(useMindmapStore.getState().past.length).toBeGreaterThan(0)
    })

    it('marks diagram as dirty', () => {
      loadDiagram()
      expect(useMindmapStore.getState().isDirty).toBe(false)
      useMindmapStore.getState().addNode('root', 'Dirty')
      expect(useMindmapStore.getState().isDirty).toBe(true)
    })

    it('throws without active diagram', () => {
      expect(() => useMindmapStore.getState().addNode('root')).toThrow()
    })
  })

  describe('updateNode', () => {
    it('updates title', () => {
      loadDiagram()
      useMindmapStore.getState().updateNode('c1', { title: 'Updated' })
      const node = useMindmapStore.getState().activeMindmap!.nodes.find(n => n.id === 'c1')!
      expect(node.title).toBe('Updated')
    })

    it('syncs root title with diagram name', () => {
      loadDiagram()
      useMindmapStore.getState().updateNode('root', { title: 'New Name' })
      expect(useMindmapStore.getState().activeMindmap!.name).toBe('New Name')
    })

    it('auto-resizes width on title change for non-root', () => {
      loadDiagram()
      const before = useMindmapStore.getState().activeMindmap!.nodes.find(n => n.id === 'c1')!.width
      useMindmapStore.getState().updateNode('c1', { title: 'A much longer title that should be wider' })
      const after = useMindmapStore.getState().activeMindmap!.nodes.find(n => n.id === 'c1')!.width
      expect(after).toBeGreaterThan(before)
    })

    it('does nothing without active diagram', () => {
      useMindmapStore.getState().updateNode('c1', { title: 'No crash' })
      // Should not throw
    })
  })

  describe('batchUpdateNodes', () => {
    it('updates multiple nodes at once', () => {
      loadDiagram()
      useMindmapStore.getState().batchUpdateNodes(['c1', 'c2'], { bold: true })
      const nodes = useMindmapStore.getState().activeMindmap!.nodes
      expect(nodes.find(n => n.id === 'c1')!.bold).toBe(true)
      expect(nodes.find(n => n.id === 'c2')!.bold).toBe(true)
    })

    it('does nothing with empty ids', () => {
      loadDiagram()
      const before = useMindmapStore.getState().activeMindmap!
      useMindmapStore.getState().batchUpdateNodes([], { bold: true })
      // activeMindmap reference shouldn't change
      expect(useMindmapStore.getState().activeMindmap).toBe(before)
    })
  })

  describe('deleteNode', () => {
    it('removes node and descendants', () => {
      const grandchild = makeChild('gc1', 'Grandchild', 'c1', 2)
      loadDiagram(makeDiagram([makeRoot(), makeChild('c1', 'C1', 'root', 1, 0), makeChild('c2', 'C2', 'root', 1, 1), grandchild]))
      useMindmapStore.getState().deleteNode('c1')
      const nodes = useMindmapStore.getState().activeMindmap!.nodes
      expect(nodes.find(n => n.id === 'c1')).toBeUndefined()
      expect(nodes.find(n => n.id === 'gc1')).toBeUndefined()
      expect(nodes.find(n => n.id === 'c2')).toBeDefined()
    })

    it('clears deleted nodes from selection', () => {
      loadDiagram()
      useMindmapStore.getState().setSelectedNodeIds(['c1'])
      useMindmapStore.getState().deleteNode('c1')
      expect(useMindmapStore.getState().selectedNodeIds).not.toContain('c1')
    })

    it('creates history snapshot', () => {
      loadDiagram()
      useMindmapStore.getState().deleteNode('c1')
      expect(useMindmapStore.getState().past.length).toBeGreaterThan(0)
    })
  })

  describe('deleteSelectedNodes', () => {
    it('never deletes root', () => {
      loadDiagram()
      useMindmapStore.getState().setSelectedNodeIds(['root'])
      useMindmapStore.getState().deleteSelectedNodes()
      const root = useMindmapStore.getState().activeMindmap!.nodes.find(n => n.parentId === null)
      expect(root).toBeDefined()
    })

    it('deletes selected non-root nodes', () => {
      loadDiagram()
      useMindmapStore.getState().setSelectedNodeIds(['c1', 'c2'])
      useMindmapStore.getState().deleteSelectedNodes()
      const nodes = useMindmapStore.getState().activeMindmap!.nodes
      expect(nodes.find(n => n.id === 'c1')).toBeUndefined()
      expect(nodes.find(n => n.id === 'c2')).toBeUndefined()
    })

    it('clears selection after delete', () => {
      loadDiagram()
      useMindmapStore.getState().setSelectedNodeIds(['c1'])
      useMindmapStore.getState().deleteSelectedNodes()
      expect(useMindmapStore.getState().selectedNodeIds).toEqual([])
    })
  })

  describe('dissolveNode', () => {
    it('re-parents children to parent', () => {
      const gc1 = makeChild('gc1', 'GC1', 'c1', 2, 0)
      const gc2 = makeChild('gc2', 'GC2', 'c1', 2, 1)
      loadDiagram(makeDiagram([makeRoot(), makeChild('c1', 'C1', 'root', 1, 0), makeChild('c2', 'C2', 'root', 1, 1), gc1, gc2]))
      useMindmapStore.getState().dissolveNode('c1')
      const nodes = useMindmapStore.getState().activeMindmap!.nodes
      expect(nodes.find(n => n.id === 'c1')).toBeUndefined()
      expect(nodes.find(n => n.id === 'gc1')!.parentId).toBe('root')
      expect(nodes.find(n => n.id === 'gc2')!.parentId).toBe('root')
    })

    it('never dissolves root', () => {
      loadDiagram()
      useMindmapStore.getState().dissolveNode('root')
      expect(useMindmapStore.getState().activeMindmap!.nodes.find(n => n.id === 'root')).toBeDefined()
    })
  })

  describe('undo / redo', () => {
    it('undo restores previous state', () => {
      loadDiagram()
      const before = useMindmapStore.getState().activeMindmap!.nodes.length
      useMindmapStore.getState().addNode('root', 'Extra')
      expect(useMindmapStore.getState().activeMindmap!.nodes.length).toBe(before + 1)
      useMindmapStore.getState().undo()
      expect(useMindmapStore.getState().activeMindmap!.nodes.length).toBe(before)
    })

    it('redo restores undone state', () => {
      loadDiagram()
      useMindmapStore.getState().addNode('root', 'Extra')
      const afterAdd = useMindmapStore.getState().activeMindmap!.nodes.length
      useMindmapStore.getState().undo()
      useMindmapStore.getState().redo()
      expect(useMindmapStore.getState().activeMindmap!.nodes.length).toBe(afterAdd)
    })

    it('undo does nothing with empty history', () => {
      loadDiagram()
      const nodes = useMindmapStore.getState().activeMindmap!.nodes
      useMindmapStore.getState().undo()
      expect(useMindmapStore.getState().activeMindmap!.nodes).toBe(nodes)
    })

    it('redo does nothing with empty future', () => {
      loadDiagram()
      const nodes = useMindmapStore.getState().activeMindmap!.nodes
      useMindmapStore.getState().redo()
      expect(useMindmapStore.getState().activeMindmap!.nodes).toBe(nodes)
    })
  })

  describe('reorderNode', () => {
    it('changes sort order', () => {
      loadDiagram()
      useMindmapStore.getState().reorderNode('c2', 'c1') // move c2 before c1
      const nodes = useMindmapStore.getState().activeMindmap!.nodes
      const c1 = nodes.find(n => n.id === 'c1')!
      const c2 = nodes.find(n => n.id === 'c2')!
      expect(c2.sortOrder).toBeLessThan(c1.sortOrder!)
    })
  })

  describe('resizeNodeDepth', () => {
    it('clamps width to 100-500', () => {
      loadDiagram()
      useMindmapStore.getState().resizeNodeDepth(1, 50)
      const l1 = useMindmapStore.getState().activeMindmap!.nodes.filter(n => n.depth === 1)
      for (const n of l1) {
        expect(n.width).toBeGreaterThanOrEqual(100)
      }
    })

    it('sets all nodes at depth to same width', () => {
      loadDiagram()
      useMindmapStore.getState().resizeNodeDepth(1, 250)
      const l1 = useMindmapStore.getState().activeMindmap!.nodes.filter(n => n.depth === 1)
      const widths = new Set(l1.map(n => n.width))
      expect(widths.size).toBe(1)
    })
  })

  describe('setTheme', () => {
    it('updates theme id', () => {
      loadDiagram()
      useMindmapStore.getState().setTheme('cyberpunk')
      expect(useMindmapStore.getState().themeId).toBe('cyberpunk')
    })

    it('recolors L1 nodes with new palette', () => {
      loadDiagram()
      const beforeColors = useMindmapStore.getState().activeMindmap!.nodes
        .filter(n => n.depth === 1).map(n => n.color)
      useMindmapStore.getState().setTheme('retro')
      const afterColors = useMindmapStore.getState().activeMindmap!.nodes
        .filter(n => n.depth === 1).map(n => n.color)
      expect(afterColors).not.toEqual(beforeColors)
    })
  })

  describe('clearDiagram', () => {
    it('clears all state', () => {
      loadDiagram()
      useMindmapStore.getState().setSelectedNodeIds(['c1'])
      useMindmapStore.getState().clearDiagram()
      const state = useMindmapStore.getState()
      expect(state.activeMindmap).toBeNull()
      expect(state.selectedNodeIds).toEqual([])
      expect(state.past).toEqual([])
      expect(state.future).toEqual([])
    })
  })

  describe('loadFromOutline', () => {
    it('loads indented text outline', () => {
      loadDiagram(makeDiagram([makeRoot()]))
      useMindmapStore.getState().loadFromOutline('Root\n\tChild A\n\tChild B\n\t\tGrandchild')
      const nodes = useMindmapStore.getState().activeMindmap!.nodes
      expect(nodes.length).toBeGreaterThanOrEqual(4)
    })

    it('loads JSON outline', () => {
      loadDiagram(makeDiagram([makeRoot()]))
      useMindmapStore.getState().loadFromOutline('{"My Map": ["Topic A", "Topic B"]}')
      const nodes = useMindmapStore.getState().activeMindmap!.nodes
      expect(nodes.length).toBeGreaterThanOrEqual(3)
    })

    it('does nothing with empty text', () => {
      loadDiagram()
      const before = useMindmapStore.getState().activeMindmap!.nodes.length
      useMindmapStore.getState().loadFromOutline('')
      expect(useMindmapStore.getState().activeMindmap!.nodes.length).toBe(before)
    })
  })

  describe('setDiagramType', () => {
    it('changes diagram type', () => {
      loadDiagram()
      useMindmapStore.getState().setDiagramType('mindmap')
      expect(useMindmapStore.getState().diagramType).toBe('mindmap')
    })

    it('re-lays out all nodes', () => {
      loadDiagram()
      const before = useMindmapStore.getState().activeMindmap!.nodes.map(n => ({ x: n.x, y: n.y }))
      useMindmapStore.getState().setDiagramType('fishbone')
      const after = useMindmapStore.getState().activeMindmap!.nodes.map(n => ({ x: n.x, y: n.y }))
      expect(after).not.toEqual(before)
    })

    it('does nothing without active diagram', () => {
      const before = useMindmapStore.getState().diagramType
      useMindmapStore.getState().setDiagramType('mindmap')
      // no active map → guard returns early, type unchanged
      expect(useMindmapStore.getState().diagramType).toBe(before)
      expect(useMindmapStore.getState().activeMindmap).toBeNull()
    })

    it('marks diagram dirty after switching type', () => {
      loadDiagram()
      useMindmapStore.getState().setDiagramType('timeline')
      expect(useMindmapStore.getState().isDirty).toBe(true)
    })

    it('falls back to raw label for an unknown type key', () => {
      loadDiagram()
      // Unknown type key still works (labels lookup falls back to t)
      useMindmapStore.getState().setDiagramType('logic' as never)
      expect(useMindmapStore.getState().diagramType).toBe('logic')
    })
  })

  describe('setLineStyle', () => {
    it('updates line style and marks dirty', () => {
      loadDiagram()
      useMindmapStore.getState().setLineStyle('curved')
      expect(useMindmapStore.getState().lineStyle).toBe('curved')
      expect(useMindmapStore.getState().activeMindmap!.lineStyle).toBe('curved')
      expect(useMindmapStore.getState().isDirty).toBe(true)
    })

    it('does nothing without active diagram', () => {
      const before = useMindmapStore.getState().lineStyle
      useMindmapStore.getState().setLineStyle('curved')
      // no active map → guard returns early, store lineStyle unchanged
      expect(useMindmapStore.getState().lineStyle).toBe(before)
      expect(useMindmapStore.getState().activeMindmap).toBeNull()
    })
  })

  describe('setIsDirty', () => {
    it('sets the dirty flag', () => {
      useMindmapStore.getState().setIsDirty(true)
      expect(useMindmapStore.getState().isDirty).toBe(true)
      useMindmapStore.getState().setIsDirty(false)
      expect(useMindmapStore.getState().isDirty).toBe(false)
    })
  })

  describe('setTheme', () => {
    it('updates theme id', () => {
      loadDiagram()
      useMindmapStore.getState().setTheme('cyberpunk')
      expect(useMindmapStore.getState().themeId).toBe('cyberpunk')
    })

    it('recolors L1 nodes with new palette', () => {
      loadDiagram()
      const beforeColors = useMindmapStore.getState().activeMindmap!.nodes
        .filter(n => n.depth === 1).map(n => n.color)
      useMindmapStore.getState().setTheme('retro')
      const afterColors = useMindmapStore.getState().activeMindmap!.nodes
        .filter(n => n.depth === 1).map(n => n.color)
      expect(afterColors).not.toEqual(beforeColors)
    })

    it('propagates L1 color to descendants', () => {
      const gc = makeChild('gc1', 'GC', 'c1', 2, 0)
      loadDiagram(makeDiagram([makeRoot(), makeChild('c1', 'C1', 'root', 1, 0), gc]))
      useMindmapStore.getState().setTheme('monokai')
      const nodes = useMindmapStore.getState().activeMindmap!.nodes
      const c1 = nodes.find(n => n.id === 'c1')!
      const gc1 = nodes.find(n => n.id === 'gc1')!
      expect(gc1.color).toBe(c1.color)
    })

    it('writes the recolored diagram to the localStorage cache', () => {
      loadDiagram()
      useMindmapStore.getState().setTheme('cyberpunk')
      const cached = JSON.parse(localStorage.getItem('mindmaps:diagram:test-diagram')!)
      expect(cached.themeId).toBe('cyberpunk')
    })

    it('sets themeId only when there is no active diagram', () => {
      // no active map → the else branch just stores themeId
      useMindmapStore.getState().setTheme('retro')
      expect(useMindmapStore.getState().themeId).toBe('retro')
      expect(useMindmapStore.getState().activeMindmap).toBeNull()
      expect(localStorage.getItem('mindmaps:themeId')).toBe('retro')
    })

    it('keeps a descendant color when its parent is missing (orphan branch)', () => {
      // child references a non-existent parent → getInheritedColor returns node.color
      const orphan = makeChild('orphan', 'Orphan', 'ghost', 2, 0)
      loadDiagram(makeDiagram([makeRoot(), makeChild('c1', 'C1', 'root', 1, 0), orphan]))
      const beforeOrphanColor = useMindmapStore.getState().activeMindmap!.nodes.find(n => n.id === 'orphan')!.color
      useMindmapStore.getState().setTheme('monokai')
      const after = useMindmapStore.getState().activeMindmap!.nodes.find(n => n.id === 'orphan')!
      expect(after.color).toBe(beforeOrphanColor)
    })
  })

  describe('reorderNode', () => {
    it('changes sort order', () => {
      loadDiagram()
      useMindmapStore.getState().reorderNode('c2', 'c1') // move c2 before c1
      const nodes = useMindmapStore.getState().activeMindmap!.nodes
      const c1 = nodes.find(n => n.id === 'c1')!
      const c2 = nodes.find(n => n.id === 'c2')!
      expect(c2.sortOrder).toBeLessThan(c1.sortOrder!)
    })

    it('appends to the end when insertBeforeId is null', () => {
      loadDiagram()
      useMindmapStore.getState().reorderNode('c1', null) // move c1 to end
      const nodes = useMindmapStore.getState().activeMindmap!.nodes
      const c1 = nodes.find(n => n.id === 'c1')!
      const c2 = nodes.find(n => n.id === 'c2')!
      expect(c1.sortOrder).toBeGreaterThan(c2.sortOrder!)
    })

    it('does nothing without active diagram', () => {
      useMindmapStore.getState().reorderNode('c1', null)
      expect(useMindmapStore.getState().activeMindmap).toBeNull()
    })

    it('does nothing for an unknown nodeId', () => {
      loadDiagram()
      const before = useMindmapStore.getState().activeMindmap!
      useMindmapStore.getState().reorderNode('nope', null)
      expect(useMindmapStore.getState().activeMindmap).toBe(before)
    })
  })

  describe('rerunLayout', () => {
    it('re-lays out the active diagram', () => {
      loadDiagram()
      useMindmapStore.getState().reorderNode('c2', 'c1') // mark some nodes manuallyPositioned=false anyway
      useMindmapStore.getState().rerunLayout()
      expect(useMindmapStore.getState().isDirty).toBe(true)
      expect(useMindmapStore.getState().activeMindmap!.nodes.length).toBeGreaterThan(0)
    })

    it('does nothing without active diagram', () => {
      useMindmapStore.getState().rerunLayout()
      expect(useMindmapStore.getState().activeMindmap).toBeNull()
    })
  })

  describe('setShareEnabled', () => {
    it('toggles sharing flag and marks dirty', () => {
      loadDiagram()
      useMindmapStore.getState().setShareEnabled(true)
      expect(useMindmapStore.getState().activeMindmap!.sharingEnabled).toBe(true)
      expect(useMindmapStore.getState().isDirty).toBe(true)
    })

    it('does nothing without active diagram', () => {
      useMindmapStore.getState().setShareEnabled(true)
      expect(useMindmapStore.getState().activeMindmap).toBeNull()
    })
  })

  describe('toggle flags', () => {
    it('setShowOrderNumbers updates store + diagram', () => {
      loadDiagram()
      useMindmapStore.getState().setShowOrderNumbers(false)
      expect(useMindmapStore.getState().showOrderNumbers).toBe(false)
      expect(useMindmapStore.getState().activeMindmap!.showOrderNumbers).toBe(false)
      expect(useMindmapStore.getState().isDirty).toBe(true)
    })

    it('setShowOrderNumbers does nothing without active diagram', () => {
      const before = useMindmapStore.getState().showOrderNumbers
      useMindmapStore.getState().setShowOrderNumbers(!before)
      // no active map → guard returns early, store value unchanged
      expect(useMindmapStore.getState().showOrderNumbers).toBe(before)
      expect(useMindmapStore.getState().activeMindmap).toBeNull()
    })

    it('setShowChildCount toggles the flag', () => {
      useMindmapStore.getState().setShowChildCount(true)
      expect(useMindmapStore.getState().showChildCount).toBe(true)
    })

    it('setHideDetails toggles the flag', () => {
      useMindmapStore.getState().setHideDetails(true)
      expect(useMindmapStore.getState().hideDetails).toBe(true)
    })

    it('setIsImporting toggles the flag', () => {
      useMindmapStore.getState().setIsImporting(true)
      expect(useMindmapStore.getState().isImporting).toBe(true)
    })

    it('setResizePreview sets and clears the preview', () => {
      useMindmapStore.getState().setResizePreview({ depth: 1, width: 200 })
      expect(useMindmapStore.getState().resizePreview).toEqual({ depth: 1, width: 200 })
      useMindmapStore.getState().setResizePreview(null)
      expect(useMindmapStore.getState().resizePreview).toBeNull()
    })

    it('setSelectedNodeIds replaces the selection', () => {
      useMindmapStore.getState().setSelectedNodeIds(['a', 'b'])
      expect(useMindmapStore.getState().selectedNodeIds).toEqual(['a', 'b'])
    })

    it('setDiagrams replaces the diagram list', () => {
      const metas = [{ id: 'x', name: 'X', type: 'logic-chart' as const, updatedAt: '2024-01-01' }]
      useMindmapStore.getState().setDiagrams(metas)
      expect(useMindmapStore.getState().diagrams).toEqual(metas)
    })
  })

  describe('snapshotHistory', () => {
    it('pushes the current nodes onto past and clears future', () => {
      loadDiagram()
      // seed a future entry via undo/redo then snapshot to confirm future cleared
      useMindmapStore.getState().addNode('root', 'A')
      useMindmapStore.getState().undo()
      expect(useMindmapStore.getState().future.length).toBeGreaterThan(0)
      useMindmapStore.getState().snapshotHistory()
      expect(useMindmapStore.getState().future).toEqual([])
      expect(useMindmapStore.getState().past.length).toBeGreaterThan(0)
    })

    it('caps history at 31 entries (slice -30 + new)', () => {
      loadDiagram()
      for (let i = 0; i < 40; i++) useMindmapStore.getState().snapshotHistory()
      expect(useMindmapStore.getState().past.length).toBeLessThanOrEqual(31)
    })
  })

  describe('autoAssignIcons', () => {
    it('assigns guessed icons to non-root nodes lacking one', () => {
      loadDiagram(makeDiagram([makeRoot(), makeChild('c1', 'Family time', 'root', 1, 0)]))
      useMindmapStore.getState().autoAssignIcons()
      const c1 = useMindmapStore.getState().activeMindmap!.nodes.find(n => n.id === 'c1')!
      expect(c1.icon).toBeTruthy()
      expect(useMindmapStore.getState().isDirty).toBe(true)
    })

    it('keeps an existing icon (?? short-circuit)', () => {
      const node = { ...makeChild('c1', 'School', 'root', 1, 0), icon: 'custom-icon' }
      loadDiagram(makeDiagram([makeRoot(), node]))
      useMindmapStore.getState().autoAssignIcons()
      const c1 = useMindmapStore.getState().activeMindmap!.nodes.find(n => n.id === 'c1')!
      expect(c1.icon).toBe('custom-icon')
    })

    it('does nothing without active diagram', () => {
      useMindmapStore.getState().autoAssignIcons()
      expect(useMindmapStore.getState().activeMindmap).toBeNull()
    })
  })

  describe('dissolveNode (edge cases)', () => {
    it('does nothing without active diagram', () => {
      useMindmapStore.getState().dissolveNode('c1')
      expect(useMindmapStore.getState().activeMindmap).toBeNull()
    })

    it('does nothing for an unknown node id', () => {
      loadDiagram()
      const before = useMindmapStore.getState().activeMindmap!
      useMindmapStore.getState().dissolveNode('nope')
      expect(useMindmapStore.getState().activeMindmap).toBe(before)
    })

    it('slots children where the dissolved middle node was', () => {
      // root → [c1(0), c2(1), c3(2)]; dissolve c2 which has children gc1,gc2
      const c1 = makeChild('c1', 'C1', 'root', 1, 0)
      const c2 = makeChild('c2', 'C2', 'root', 1, 1)
      const c3 = makeChild('c3', 'C3', 'root', 1, 2)
      const gc1 = makeChild('gc1', 'GC1', 'c2', 2, 0)
      const gc2 = makeChild('gc2', 'GC2', 'c2', 2, 1)
      loadDiagram(makeDiagram([makeRoot(), c1, c2, c3, gc1, gc2]))
      useMindmapStore.getState().dissolveNode('c2')
      const nodes = useMindmapStore.getState().activeMindmap!.nodes
      expect(nodes.find(n => n.id === 'c2')).toBeUndefined()
      expect(nodes.find(n => n.id === 'gc1')!.parentId).toBe('root')
      expect(nodes.find(n => n.id === 'gc2')!.parentId).toBe('root')
      // c1 stays before, c3 after the re-parented children
      const c1after = nodes.find(n => n.id === 'c1')!
      const c3after = nodes.find(n => n.id === 'c3')!
      expect(c1after.sortOrder).toBeLessThan(c3after.sortOrder!)
    })
  })

  describe('dissolveSelectedNodes', () => {
    it('does nothing without active diagram', () => {
      useMindmapStore.getState().dissolveSelectedNodes()
      expect(useMindmapStore.getState().activeMindmap).toBeNull()
    })

    it('does nothing with empty selection', () => {
      loadDiagram()
      const before = useMindmapStore.getState().activeMindmap!
      useMindmapStore.getState().dissolveSelectedNodes()
      expect(useMindmapStore.getState().activeMindmap).toBe(before)
    })

    it('skips when only the root is selected', () => {
      loadDiagram()
      useMindmapStore.getState().setSelectedNodeIds(['root'])
      const before = useMindmapStore.getState().activeMindmap!
      useMindmapStore.getState().dissolveSelectedNodes()
      // root filtered out → toDissolve empty → early return, no change
      expect(useMindmapStore.getState().activeMindmap).toBe(before)
    })

    it('dissolves multiple nodes, re-parenting their children shallowest-first', () => {
      const c1 = makeChild('c1', 'C1', 'root', 1, 0)
      const c2 = makeChild('c2', 'C2', 'root', 1, 1)
      const gc1 = makeChild('gc1', 'GC1', 'c1', 2, 0)
      const ggc1 = makeChild('ggc1', 'GGC1', 'gc1', 3, 0)
      loadDiagram(makeDiagram([makeRoot(), c1, c2, gc1, ggc1]))
      useMindmapStore.getState().setSelectedNodeIds(['gc1', 'c1'])
      useMindmapStore.getState().dissolveSelectedNodes()
      const nodes = useMindmapStore.getState().activeMindmap!.nodes
      expect(nodes.find(n => n.id === 'c1')).toBeUndefined()
      expect(nodes.find(n => n.id === 'gc1')).toBeUndefined()
      // ggc1 should be re-parented all the way up to root
      expect(nodes.find(n => n.id === 'ggc1')!.parentId).toBe('root')
      expect(useMindmapStore.getState().selectedNodeIds).toEqual([])
    })

    it('continues past a selected parentId-null node that is not the root', () => {
      // Two parentId-null nodes: rootId = first; the second one hits
      // `node.parentId === null` inside the loop → continue branch.
      const root = makeRoot()
      const floating: MindmapNode = {
        id: 'floating', title: 'Floating', color: '#000', parentId: null,
        depth: 0, x: 0, y: 0, width: 180, height: 180, sortOrder: 1,
      }
      const c1 = makeChild('c1', 'C1', 'root', 1, 0)
      loadDiagram(makeDiagram([root, floating, c1]))
      useMindmapStore.getState().setSelectedNodeIds(['floating', 'c1'])
      expect(() => useMindmapStore.getState().dissolveSelectedNodes()).not.toThrow()
      const nodes = useMindmapStore.getState().activeMindmap!.nodes
      // floating (parentId null, not root) was skipped; c1 dissolved
      expect(nodes.find(n => n.id === 'floating')).toBeDefined()
      expect(nodes.find(n => n.id === 'c1')).toBeUndefined()
    })

    it('sorts remaining siblings when a dissolved node has 2+ siblings', () => {
      // c2 has siblings c1 and c3 → siblings.sort comparator (L494) runs
      const c1 = makeChild('c1', 'C1', 'root', 1, 0)
      const c2 = makeChild('c2', 'C2', 'root', 1, 1)
      const c3 = makeChild('c3', 'C3', 'root', 1, 2)
      const gc = makeChild('gc', 'GC', 'c2', 2, 0)
      loadDiagram(makeDiagram([makeRoot(), c1, c2, c3, gc]))
      useMindmapStore.getState().setSelectedNodeIds(['c2'])
      useMindmapStore.getState().dissolveSelectedNodes()
      const nodes = useMindmapStore.getState().activeMindmap!.nodes
      expect(nodes.find(n => n.id === 'c2')).toBeUndefined()
      expect(nodes.find(n => n.id === 'gc')!.parentId).toBe('root')
    })

    it('skips a selected node whose parent is already gone (continue branch)', () => {
      // select a child and its parent; once parent dissolves, re-resolving the
      // child still finds it re-parented (covered) — also include the root id
      const c1 = makeChild('c1', 'C1', 'root', 1, 0)
      const gc1 = makeChild('gc1', 'GC1', 'c1', 2, 0)
      loadDiagram(makeDiagram([makeRoot(), c1, gc1]))
      // include 'root' so the rootId filter runs and the depth-sort keeps c1 first
      useMindmapStore.getState().setSelectedNodeIds(['root', 'c1', 'gc1'])
      useMindmapStore.getState().dissolveSelectedNodes()
      const nodes = useMindmapStore.getState().activeMindmap!.nodes
      expect(nodes.find(n => n.id === 'root')).toBeDefined()
      expect(nodes.find(n => n.id === 'c1')).toBeUndefined()
    })
  })

  describe('resizeNodeDepth (edge cases)', () => {
    it('clamps width up to max 500', () => {
      loadDiagram()
      useMindmapStore.getState().resizeNodeDepth(1, 9999)
      const l1 = useMindmapStore.getState().activeMindmap!.nodes.filter(n => n.depth === 1)
      for (const n of l1) expect(n.width).toBeLessThanOrEqual(500)
    })

    it('does nothing without active diagram', () => {
      useMindmapStore.getState().resizeNodeDepth(1, 200)
      expect(useMindmapStore.getState().activeMindmap).toBeNull()
    })
  })

  describe('addNode (color branches)', () => {
    it('assigns a unique palette color to depth-1 children of root', () => {
      loadDiagram(makeDiagram([makeRoot()]))
      const a = useMindmapStore.getState().addNode('root', 'A')
      const b = useMindmapStore.getState().addNode('root', 'B')
      expect(a.color).not.toBe(b.color)
    })

    it('inherits parent color for deeper nodes', () => {
      loadDiagram(makeDiagram([makeRoot(), makeChild('c1', 'C1', 'root', 1, 0)]))
      const parentColor = useMindmapStore.getState().activeMindmap!.nodes.find(n => n.id === 'c1')!.color
      const gc = useMindmapStore.getState().addNode('c1', 'Grandchild')
      expect(gc.color).toBe(parentColor)
      expect(gc.depth).toBe(2)
    })

    it('adds a root-level node when parentId is null', () => {
      loadDiagram(makeDiagram([makeRoot()]))
      const n = useMindmapStore.getState().addNode(null, 'Floating Root')
      expect(n.parentId).toBeNull()
      expect(n.depth).toBe(0)
    })
  })

  describe('loadFromOutline (branches)', () => {
    it('does nothing when no active map and no pasteImportFn', () => {
      // resetStore already cleared; pasteImportFn defaults null
      useMindmapStore.getState().loadFromOutline('Root\n\tChild')
      expect(useMindmapStore.getState().activeMindmap).toBeNull()
    })

    it('routes to pasteImportFn when one is registered', () => {
      const fn = vi.fn()
      useMindmapStore.getState().setPasteImportFn(fn)
      useMindmapStore.getState().loadFromOutline('My Map\n\tTopic A\n\tTopic B')
      expect(fn).toHaveBeenCalledTimes(1)
      expect(fn.mock.calls[0][0]).toBe('My Map')
      expect(Array.isArray(fn.mock.calls[0][1])).toBe(true)
      useMindmapStore.getState().setPasteImportFn(null)
    })

    it('wraps multiple indent-0 items under a single root', () => {
      loadDiagram(makeDiagram([makeRoot()]))
      useMindmapStore.getState().loadFromOutline('Topic A\nTopic B\nTopic C')
      const nodes = useMindmapStore.getState().activeMindmap!.nodes
      const root = nodes.find(n => n.parentId === null)!
      // First item becomes the wrapping root title
      expect(root.title).toBe('Topic A')
    })

    it('parses 4-space indentation', () => {
      loadDiagram(makeDiagram([makeRoot()]))
      useMindmapStore.getState().loadFromOutline('Root\n    Child A\n    Child B')
      const nodes = useMindmapStore.getState().activeMindmap!.nodes
      expect(nodes.length).toBeGreaterThanOrEqual(3)
    })

    it('shifts indents so the minimum becomes 0', () => {
      loadDiagram(makeDiagram([makeRoot()]))
      // every line indented by one tab → minIndent 1 → shifted to 0
      useMindmapStore.getState().loadFromOutline('\tRoot\n\t\tChild')
      const nodes = useMindmapStore.getState().activeMindmap!.nodes
      const root = nodes.find(n => n.parentId === null)!
      expect(root.depth).toBe(0)
    })

    it('parses JSON with icon + emoji + nested children', () => {
      loadDiagram(makeDiagram([makeRoot()]))
      useMindmapStore.getState().loadFromOutline(JSON.stringify({
        'Root': [
          { 'Branch': ['Leaf'], icon: 'FireIcon', emoji: '🔥' },
        ],
      }))
      const nodes = useMindmapStore.getState().activeMindmap!.nodes
      const branch = nodes.find(n => n.title === 'Branch')!
      // FireIcon → kebab 'fire' → alias 'flame'
      expect(branch.icon).toBe('flame')
      expect(branch.emoji).toBe('🔥')
    })

    it('parses legacy JSON format with title/name + children', () => {
      loadDiagram(makeDiagram([makeRoot()]))
      useMindmapStore.getState().loadFromOutline(JSON.stringify({
        title: 'Legacy Root',
        children: [{ name: 'Child One', children: [] }, 'String Child'],
      }))
      const nodes = useMindmapStore.getState().activeMindmap!.nodes
      expect(nodes.find(n => n.title === 'Child One')).toBeDefined()
      expect(nodes.find(n => n.title === 'String Child')).toBeDefined()
    })

    it('uses explicit colors from JSON and inherits them to children', () => {
      loadDiagram(makeDiagram([makeRoot()]))
      useMindmapStore.getState().loadFromOutline(JSON.stringify({
        'Root': [{ 'Colored': ['Kid'], color: '#123456' }],
      }))
      const nodes = useMindmapStore.getState().activeMindmap!.nodes
      const colored = nodes.find(n => n.title === 'Colored')!
      const kid = nodes.find(n => n.title === 'Kid')!
      expect(colored.color).toBe('#123456')
      expect(kid.color).toBe('#123456')
    })

    it('skips legacy nodes with no title', () => {
      loadDiagram(makeDiagram([makeRoot()]))
      // a legacy-shaped object with empty title → flattenJson returns early
      useMindmapStore.getState().loadFromOutline(JSON.stringify({
        title: 'Root',
        children: [{ title: '', children: [] }, { name: 'Valid' }],
      }))
      const nodes = useMindmapStore.getState().activeMindmap!.nodes
      expect(nodes.find(n => n.title === 'Valid')).toBeDefined()
    })

    it('falls back to text parsing for invalid JSON starting with {', () => {
      loadDiagram(makeDiagram([makeRoot()]))
      // starts with { but is not valid JSON → catch → text path
      useMindmapStore.getState().loadFromOutline('{ not json\n\tStill parsed as text')
      const nodes = useMindmapStore.getState().activeMindmap!.nodes
      expect(nodes.length).toBeGreaterThanOrEqual(2)
    })

    it('returns when text has only blank lines', () => {
      loadDiagram(makeDiagram([makeRoot()]))
      const before = useMindmapStore.getState().activeMindmap!.nodes.length
      useMindmapStore.getState().loadFromOutline('   \n  \n')
      expect(useMindmapStore.getState().activeMindmap!.nodes.length).toBe(before)
    })

    it('drops icons/emoji below depth 2', () => {
      loadDiagram(makeDiagram([makeRoot()]))
      useMindmapStore.getState().loadFromOutline(JSON.stringify({
        'Root': [{ 'L1': [{ 'L2': [{ 'L3deep': [], icon: 'star' }] }] }],
      }))
      const nodes = useMindmapStore.getState().activeMindmap!.nodes
      const deep = nodes.find(n => n.title === 'L3deep')
      // depth 3 → icon stripped
      expect(deep?.icon).toBeUndefined()
    })
  })

  describe('uuid polyfill fallback', () => {
    it('uses the manual generator when crypto.randomUUID is absent', async () => {
      const original = globalThis.crypto.randomUUID
      // Remove randomUUID to hit the polyfill branch on next addNode
      // @ts-expect-error intentionally deleting for test
      globalThis.crypto.randomUUID = undefined
      loadDiagram(makeDiagram([makeRoot()]))
      const node = useMindmapStore.getState().addNode('root', 'Fallback')
      expect(node.id).toMatch(/^[0-9a-f-]+$/)
      globalThis.crypto.randomUUID = original
    })
  })

  describe('setActiveMindmap (extra branches)', () => {
    it('converts a long-titled circular root into a pill', () => {
      const longRoot: MindmapNode = {
        id: 'root', title: 'A Really Long Title Here', color: '#6366f1',
        parentId: null, depth: 0, x: 0, y: 0, width: 180, height: 180,
      }
      useMindmapStore.getState().setActiveMindmap(makeDiagram([longRoot, makeChild('c1', 'C', 'root', 1, 0)]))
      const root = useMindmapStore.getState().activeMindmap!.nodes.find(n => n.parentId === null)!
      // pill conversion branch ran → root is a wide rectangle (width >> height), not a circle
      expect(root.width).not.toBe(root.height)
      expect(root.width).toBeGreaterThan(root.height)
    })

    it('honors a themeId stored on the diagram', () => {
      const d = { ...makeDiagram(), themeId: 'cyberpunk' }
      useMindmapStore.getState().setActiveMindmap(d)
      expect(useMindmapStore.getState().themeId).toBe('cyberpunk')
    })

    it('defaults showOrderNumbers to true when undefined', () => {
      const d = makeDiagram()
      delete (d as { showOrderNumbers?: boolean }).showOrderNumbers
      useMindmapStore.getState().setActiveMindmap(d)
      expect(useMindmapStore.getState().showOrderNumbers).toBe(true)
    })
  })

  describe('localStorage auto-persist subscription', () => {
    it('writes the active map + list entry when dirty flips on', () => {
      loadDiagram()
      // Trigger a dirty mutation
      useMindmapStore.getState().updateNode('c1', { title: 'Persisted' })
      const cached = localStorage.getItem('mindmaps:diagram:test-diagram')
      expect(cached).toBeTruthy()
      const list = JSON.parse(localStorage.getItem('mindmaps:list')!)
      expect(list.find((m: { id: string }) => m.id === 'test-diagram')).toBeDefined()
    })

    it('updates an existing list entry in place on a second save', () => {
      loadDiagram()
      useMindmapStore.getState().updateNode('c1', { title: 'First' })
      useMindmapStore.getState().updateNode('c1', { title: 'Second' })
      const list = JSON.parse(localStorage.getItem('mindmaps:list')!)
      const entries = list.filter((m: { id: string }) => m.id === 'test-diagram')
      expect(entries).toHaveLength(1)
    })
  })

  // ── Remaining helper / callback branches ──────────────────────────────────
  describe('helper branch coverage', () => {
    it('mindmap-type layout keeps individual L2 circle widths (normalizeWidthsPerDepth)', () => {
      const c1 = makeChild('c1', 'C1', 'root', 1, 0)
      const gc1 = makeChild('gc1', 'GC1', 'c1', 2, 0)
      const gc2 = makeChild('gc2', 'A much longer grandchild title', 'c1', 2, 1)
      const d = { ...makeDiagram([makeRoot(), c1, gc1, gc2]), type: 'mindmap' as const }
      useMindmapStore.getState().setActiveMindmap(d)
      const nodes = useMindmapStore.getState().activeMindmap!.nodes
      // L2 nodes are circles sized individually for mindmap → widths may differ
      const l2 = nodes.filter(n => n.depth === 2)
      expect(l2.length).toBe(2)
    })

    it('treats a non-6-char hex L1 color as not-too-light (isTooLight length guard)', () => {
      const c1 = { ...makeChild('c1', 'C1', 'root', 1, 0), color: '#fff' }
      loadDiagram(makeDiagram([makeRoot(), c1, makeChild('c2', 'C2', 'root', 1, 1)]))
      // rebalanceColors runs through addNode → exercises isTooLight on the 3-char hex
      expect(() => useMindmapStore.getState().addNode('root', 'C3')).not.toThrow()
    })

    it('skips palette colors already used by existing L1 nodes (rebalance while-loop)', () => {
      // c1/c2 already hold default-palette colors. Under the default theme,
      // adding a node makes the color-assignment loop skip those used indices
      // → L92 nextIdx++ fires.
      const c1 = { ...makeChild('c1', 'C1', 'root', 1, 0), color: '#ef4444' }   // palette[0]
      const c2 = { ...makeChild('c2', 'C2', 'root', 1, 1), color: '#f97316' }   // palette[1]
      loadDiagram(makeDiagram([makeRoot(), c1, c2]))
      useMindmapStore.getState().setTheme('default')
      const added = useMindmapStore.getState().addNode('root', 'C3')
      const nodes = useMindmapStore.getState().activeMindmap!.nodes
      const colors = nodes.filter(n => n.depth === 1).map(n => n.color)
      // every L1 color is distinct → the used-color skip ran
      expect(new Set(colors).size).toBe(colors.length)
      expect(colors).toContain(added.color)
    })

    it('cycles palette colors when there are more L1 nodes than vibrant colors', () => {
      // 14 L1 nodes forces nextIdx past the 12 vibrant entries → wrap + used-color skip
      const kids = Array.from({ length: 14 }, (_, i) => makeChild(`k${i}`, `K${i}`, 'root', 1, i))
      loadDiagram(makeDiagram([makeRoot(), ...kids]))
      const added = useMindmapStore.getState().addNode('root', 'OneMore')
      expect(added.color).toBeTruthy()
      const l1 = useMindmapStore.getState().activeMindmap!.nodes.filter(n => n.depth === 1)
      expect(l1.length).toBe(15)
    })
  })

  describe('reorderNode (multi-sibling sort)', () => {
    it('sorts the remaining siblings when there are 3+ children', () => {
      const c1 = makeChild('c1', 'C1', 'root', 1, 0)
      const c2 = makeChild('c2', 'C2', 'root', 1, 1)
      const c3 = makeChild('c3', 'C3', 'root', 1, 2)
      loadDiagram(makeDiagram([makeRoot(), c1, c2, c3]))
      useMindmapStore.getState().reorderNode('c3', 'c1') // move c3 before c1
      const nodes = useMindmapStore.getState().activeMindmap!.nodes
      const order = ['c1', 'c2', 'c3'].map(id => nodes.find(n => n.id === id)!.sortOrder!)
      // c3 is now first
      expect(nodes.find(n => n.id === 'c3')!.sortOrder).toBe(0)
      expect(Math.max(...order)).toBeGreaterThan(0)
    })
  })

  describe('deleteNode / deleteSelectedNodes (nested descendants)', () => {
    it('deletes a multi-level subtree via deleteNode (flatMap recursion)', () => {
      const c1 = makeChild('c1', 'C1', 'root', 1, 0)
      const gc1 = makeChild('gc1', 'GC1', 'c1', 2, 0)
      const gc2 = makeChild('gc2', 'GC2', 'c1', 2, 1)
      const ggc1 = makeChild('ggc1', 'GGC1', 'gc1', 3, 0)
      loadDiagram(makeDiagram([makeRoot(), c1, makeChild('c2', 'C2', 'root', 1, 1), gc1, gc2, ggc1]))
      useMindmapStore.getState().deleteNode('c1')
      const ids = useMindmapStore.getState().activeMindmap!.nodes.map(n => n.id)
      expect(ids).not.toContain('gc1')
      expect(ids).not.toContain('ggc1')
      expect(ids).toContain('c2')
    })

    it('deletes multiple selected subtrees via deleteSelectedNodes', () => {
      const c1 = makeChild('c1', 'C1', 'root', 1, 0)
      const c2 = makeChild('c2', 'C2', 'root', 1, 1)
      const gc1 = makeChild('gc1', 'GC1', 'c1', 2, 0)
      const gc2 = makeChild('gc2', 'GC2', 'c2', 2, 0)
      loadDiagram(makeDiagram([makeRoot(), c1, c2, gc1, gc2]))
      useMindmapStore.getState().setSelectedNodeIds(['c1', 'c2'])
      useMindmapStore.getState().deleteSelectedNodes()
      const ids = useMindmapStore.getState().activeMindmap!.nodes.map(n => n.id)
      expect(ids).toEqual(['root'])
    })

    it('does nothing in deleteSelectedNodes when only root is selected', () => {
      loadDiagram()
      useMindmapStore.getState().setSelectedNodeIds(['root'])
      const before = useMindmapStore.getState().activeMindmap!
      useMindmapStore.getState().deleteSelectedNodes()
      // idsToDelete empty → early return, reference unchanged
      expect(useMindmapStore.getState().activeMindmap).toBe(before)
    })

    it('does nothing in deleteSelectedNodes without active diagram', () => {
      useMindmapStore.getState().deleteSelectedNodes()
      expect(useMindmapStore.getState().activeMindmap).toBeNull()
    })

    it('does nothing in deleteNode without active diagram', () => {
      useMindmapStore.getState().deleteNode('c1')
      expect(useMindmapStore.getState().activeMindmap).toBeNull()
    })
  })

  describe('normalizeIcon fallback', () => {
    it('falls back to sparkles for an unrecognized icon name', () => {
      loadDiagram(makeDiagram([makeRoot()]))
      useMindmapStore.getState().loadFromOutline(JSON.stringify({
        'Root': [{ 'Node': [], icon: 'ZzqfooWidget' }],
      }))
      const node = useMindmapStore.getState().activeMindmap!.nodes.find(n => n.title === 'Node')!
      expect(node.icon).toBe('sparkles')
    })
  })

  describe('loadFromOutline isImporting timer', () => {
    it('flips isImporting false after the 900ms timeout', () => {
      vi.useFakeTimers()
      try {
        loadDiagram(makeDiagram([makeRoot()]))
        useMindmapStore.getState().loadFromOutline('Root\n\tChild A\n\tChild B')
        expect(useMindmapStore.getState().isImporting).toBe(true)
        vi.advanceTimersByTime(901)
        expect(useMindmapStore.getState().isImporting).toBe(false)
      } finally {
        vi.useRealTimers()
      }
    })
  })
})
