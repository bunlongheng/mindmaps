import { create } from 'zustand'
import { subscribeWithSelector } from 'zustand/middleware'
import type { Diagram, DiagramMeta, DiagramType, LineStyle, MindNode } from '../types'
import { computeTreeLayout } from '../lib/layout/tree'
import { computeMindmapLayout } from '../lib/layout/mindmap'
import { computeFishboneLayout } from '../lib/layout/fishbone'

function runLayout(nodes: MindNode[], type: DiagramType): MindNode[] {
  switch (type) {
    case 'mindmap': return computeMindmapLayout(nodes)
    case 'fishbone': return computeFishboneLayout(nodes)
    case 'tree-vertical': return computeTreeLayout(nodes, 'vertical')
    case 'tree-horizontal': return computeTreeLayout(nodes, 'horizontal')
  }
}

interface HistoryState { nodes: MindNode[] }

interface DiagramStore {
  // Data
  activeDiagram: Diagram | null
  diagrams: DiagramMeta[]
  selectedNodeIds: string[]
  isDirty: boolean
  // UI
  diagramType: DiagramType
  lineStyle: LineStyle
  // History
  past: HistoryState[]
  future: HistoryState[]
  // Actions
  setActiveDiagram: (d: Diagram) => void
  setDiagrams: (ds: DiagramMeta[]) => void
  setSelectedNodeIds: (ids: string[]) => void
  setDiagramType: (t: DiagramType) => void
  setLineStyle: (s: LineStyle) => void
  setIsDirty: (v: boolean) => void
  addNode: (parentId: string | null, title?: string) => MindNode
  updateNode: (id: string, updates: Partial<MindNode>) => void
  deleteNode: (id: string) => void
  rerunLayout: () => void
  undo: () => void
  redo: () => void
  snapshotHistory: () => void
  clearDiagram: () => void
}

function pushHistory(state: DiagramStore): Pick<DiagramStore, 'past' | 'future'> {
  const current = state.activeDiagram?.nodes ?? []
  return {
    past: [...state.past.slice(-30), { nodes: current }],
    future: [],
  }
}

export const useDiagramStore = create<DiagramStore>()(
  subscribeWithSelector((set, get) => ({
    activeDiagram: null,
    diagrams: [],
    selectedNodeIds: [],
    isDirty: false,
    diagramType: 'mindmap',
    lineStyle: 'curved',
    past: [],
    future: [],

    setActiveDiagram: (d) => set({
      activeDiagram: d,
      diagramType: d.type,
      lineStyle: d.lineStyle,
      past: [],
      future: [],
      isDirty: false,
    }),

    setDiagrams: (ds) => set({ diagrams: ds }),
    setSelectedNodeIds: (ids) => set({ selectedNodeIds: ids }),
    setDiagramType: (t) => {
      const state = get()
      if (!state.activeDiagram) return
      const newNodes = runLayout(state.activeDiagram.nodes, t)
      set({
        diagramType: t,
        activeDiagram: { ...state.activeDiagram, type: t, nodes: newNodes },
        isDirty: true,
      })
    },
    setLineStyle: (s) => {
      const state = get()
      if (!state.activeDiagram) return
      set({
        lineStyle: s,
        activeDiagram: { ...state.activeDiagram, lineStyle: s },
        isDirty: true,
      })
    },
    setIsDirty: (v) => set({ isDirty: v }),

    snapshotHistory: () => {
      const state = get()
      set(pushHistory(state))
    },

    addNode: (parentId, title = 'New Node') => {
      const state = get()
      if (!state.activeDiagram) throw new Error('No active diagram')
      state.snapshotHistory()

      const parent = parentId ? state.activeDiagram.nodes.find(n => n.id === parentId) : null
      const depth = parent ? parent.depth + 1 : 0
      const color = parent ? parent.color : '#6366f1'
      const siblings = state.activeDiagram.nodes.filter(n => n.parentId === parentId)
      const newNode: MindNode = {
        id: crypto.randomUUID(),
        title,
        color,
        parentId,
        depth,
        x: (parent?.x ?? 400) + 220,
        y: (parent?.y ?? 300) + siblings.length * 60,
        width: 160,
        height: 40,
        sortOrder: siblings.length,
      }
      const newNodes = runLayout([...state.activeDiagram.nodes, newNode], state.diagramType)
      set({
        activeDiagram: { ...state.activeDiagram, nodes: newNodes },
        isDirty: true,
      })
      return newNode
    },

    updateNode: (id, updates) => {
      const state = get()
      if (!state.activeDiagram) return
      const nodes = state.activeDiagram.nodes.map(n => n.id === id ? { ...n, ...updates } : n)
      set({
        activeDiagram: { ...state.activeDiagram, nodes },
        isDirty: true,
      })
    },

    deleteNode: (id) => {
      const state = get()
      if (!state.activeDiagram) return
      state.snapshotHistory()
      // Delete node and all descendants
      function getDescendants(nodeId: string): string[] {
        const children = state.activeDiagram!.nodes.filter(n => n.parentId === nodeId)
        return [nodeId, ...children.flatMap(c => getDescendants(c.id))]
      }
      const toDelete = new Set(getDescendants(id))
      const nodes = state.activeDiagram.nodes.filter(n => !toDelete.has(n.id))
      set({
        activeDiagram: { ...state.activeDiagram, nodes },
        selectedNodeIds: state.selectedNodeIds.filter(nid => !toDelete.has(nid)),
        isDirty: true,
      })
    },

    rerunLayout: () => {
      const state = get()
      if (!state.activeDiagram) return
      const nodes = state.activeDiagram.nodes.map(n => ({ ...n, manuallyPositioned: false }))
      const newNodes = runLayout(nodes, state.diagramType)
      set({ activeDiagram: { ...state.activeDiagram, nodes: newNodes }, isDirty: true })
    },

    undo: () => {
      const state = get()
      if (state.past.length === 0 || !state.activeDiagram) return
      const prev = state.past[state.past.length - 1]
      set({
        past: state.past.slice(0, -1),
        future: [{ nodes: state.activeDiagram.nodes }, ...state.future],
        activeDiagram: { ...state.activeDiagram, nodes: prev.nodes },
        isDirty: true,
      })
    },

    redo: () => {
      const state = get()
      if (state.future.length === 0 || !state.activeDiagram) return
      const next = state.future[0]
      set({
        past: [...state.past, { nodes: state.activeDiagram.nodes }],
        future: state.future.slice(1),
        activeDiagram: { ...state.activeDiagram, nodes: next.nodes },
        isDirty: true,
      })
    },

    clearDiagram: () => set({ activeDiagram: null, selectedNodeIds: [], past: [], future: [], isDirty: false }),
  }))
)
