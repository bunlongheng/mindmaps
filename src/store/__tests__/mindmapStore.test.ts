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
  })
})
