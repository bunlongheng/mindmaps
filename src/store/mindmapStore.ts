// Polyfill crypto.randomUUID for non-secure contexts (HTTP on LAN)
function uuid(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID()
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16)
  })
}

import { create } from 'zustand'
import { subscribeWithSelector } from 'zustand/middleware'
import type { Diagram, DiagramMeta, DiagramType, LineStyle, MindmapNode } from '../types'
import { computeTreeLayout } from '../lib/layout/tree'
import { computeMindmapsLayout } from '../lib/layout/mindmaps-layout'
import { computeMindmapLayout } from '../lib/layout/mindmap'
import { computeFishboneLayout } from '../lib/layout/fishbone'
import { computeTimelineLayout } from '../lib/layout/timeline'
import { getTheme } from '../lib/themes'
import { guessIcon } from '../lib/autoIcon'
import { ICON_MAP } from '../lib/icons'
import { showToast } from '../components/CuteToast'

/** Compute a node width that fits its title text — font sizes must match Node.tsx */
function computeNodeWidth(title: string, depth: number, hasIcon: boolean): number {
  const fontSize = depth === 1 ? 22 : depth === 2 ? 16 : depth === 3 ? 13 : 11
  const charW = fontSize * 0.64
  const textPad = 24
  const textW = Math.ceil(title.length * charW) + textPad
  // icon zone takes ~20% of node width, so text zone = 80% of total
  const total = hasIcon ? Math.ceil(textW / 0.8) : textW
  return Math.max(140, Math.min(400, total))
}

/** Make all nodes at the same depth share the width of the widest node at that depth */
function normalizeWidthsPerDepth(nodes: MindmapNode[]): MindmapNode[] {
  const maxByDepth = new Map<number, number>()
  for (const n of nodes) {
    if (n.depth > 0) maxByDepth.set(n.depth, Math.max(maxByDepth.get(n.depth) ?? 0, n.width))
  }
  return nodes.map(n => n.depth > 0 ? { ...n, width: maxByDepth.get(n.depth) ?? n.width } : n)
}

/** Re-index sortOrder per parent group so numbers are always 0,1,2,... with no gaps */
function reindexSortOrders(nodes: MindmapNode[]): MindmapNode[] {
  const groups = new Map<string | null, MindmapNode[]>()
  for (const n of nodes) {
    const key = n.parentId ?? null
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key)!.push(n)
  }
  const updated = new Map<string, number>()
  for (const siblings of groups.values()) {
    siblings.sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
    siblings.forEach((n, i) => updated.set(n.id, i))
  }
  return nodes.map(n => ({ ...n, sortOrder: updated.get(n.id) ?? n.sortOrder }))
}

/** Return true if a hex color is too light to use as a node background */
function isTooLight(hex: string): boolean {
  const h = hex.replace('#', '')
  if (h.length !== 6) return false
  const r = parseInt(h.slice(0, 2), 16)
  const g = parseInt(h.slice(2, 4), 16)
  const b = parseInt(h.slice(4, 6), 16)
  return (r + g + b) / 3 > 220
}

/** Spread L1 colors evenly across the 12-color palette, propagate to descendants */
function rebalanceColors(nodes: MindmapNode[], palette: string[]): MindmapNode[] {
  // Only use first 12 — the vibrant wheel colors; the rest are utility (darks, grays, whites)
  const vibrant = palette.slice(0, 12).filter(c => !isTooLight(c))
  const effectivePalette = vibrant.length >= 2 ? vibrant : palette.slice(0, 12)
  const l1 = nodes.filter(n => n.depth === 1).sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
  if (l1.length === 0) return nodes

  // Preserve existing L1 colors — only assign palette colors to nodes that have none
  const usedColors = new Set(l1.filter(n => n.color && effectivePalette.includes(n.color)).map(n => n.color))
  const colorMap = new Map<string, string>()
  let nextIdx = 0
  for (const n of l1) {
    if (n.color && effectivePalette.includes(n.color)) {
      colorMap.set(n.id, n.color)
    } else {
      // Find next unused palette color
      while (nextIdx < effectivePalette.length && usedColors.has(effectivePalette[nextIdx])) nextIdx++
      const color = effectivePalette[nextIdx % effectivePalette.length]
      colorMap.set(n.id, color)
      usedColors.add(color)
      nextIdx++
    }
  }

  function inheritedColor(node: MindmapNode): string {
    if (node.depth === 1) return colorMap.get(node.id) ?? node.color
    const parent = nodes.find(p => p.id === node.parentId)
    return parent ? inheritedColor(parent) : node.color
  }
  return nodes.map(n => {
    if (n.depth === 1) return { ...n, color: colorMap.get(n.id)! }
    if (n.depth > 1) return { ...n, color: inheritedColor(n) }
    return n
  })
}

function runLayout(nodes: MindmapNode[], type: DiagramType): MindmapNode[] {
  switch (type) {
    case 'logic-chart': return computeMindmapsLayout(nodes)
    case 'mindmap':     return computeMindmapLayout(nodes)
    case 'fishbone':    return computeFishboneLayout(nodes)
    case 'tree-vertical':   return computeTreeLayout(nodes, 'vertical')
    case 'tree-horizontal': return computeTreeLayout(nodes, 'horizontal')
    case 'timeline':    return computeTimelineLayout(nodes)
  }
}

interface HistoryState { nodes: MindmapNode[] }

interface MindmapStore {
  // Data
  activeMindmap: Diagram | null
  diagrams: DiagramMeta[]
  selectedNodeIds: string[]
  isDirty: boolean
  // UI
  diagramType: DiagramType
  lineStyle: LineStyle
  themeId: string
  showOrderNumbers: boolean
  hideDetails: boolean
  isImporting: boolean
  resizePreview: { depth: number; width: number } | null
  // History
  past: HistoryState[]
  future: HistoryState[]
  // Actions
  setActiveMindmap: (d: Diagram) => void
  setDiagrams: (ds: DiagramMeta[]) => void
  setSelectedNodeIds: (ids: string[]) => void
  setDiagramType: (t: DiagramType) => void
  setLineStyle: (s: LineStyle) => void
  setTheme: (id: string) => void
  setIsDirty: (v: boolean) => void
  addNode: (parentId: string | null, title?: string) => MindmapNode
  updateNode: (id: string, updates: Partial<MindmapNode>) => void
  batchUpdateNodes: (ids: string[], updates: Partial<MindmapNode>) => void
  reorderNode: (nodeId: string, insertBeforeId: string | null) => void
  deleteNode: (id: string) => void
  deleteSelectedNodes: () => void
  dissolveNode: (id: string) => void
  dissolveSelectedNodes: () => void
  resizeNodeDepth: (depth: number, width: number) => void
  rerunLayout: () => void
  setShareEnabled: (enabled: boolean) => void
  setShowOrderNumbers: (v: boolean) => void
  setHideDetails: (v: boolean) => void
  setIsImporting: (v: boolean) => void
  setResizePreview: (v: { depth: number; width: number } | null) => void
  undo: () => void
  redo: () => void
  snapshotHistory: () => void
  clearDiagram: () => void
  loadFromOutline: (text: string) => void
  autoAssignIcons: () => void
  pasteImportFn: ((name: string, nodes: MindmapNode[]) => void) | null
  setPasteImportFn: (fn: ((name: string, nodes: MindmapNode[]) => void) | null) => void
}

function pushHistory(state: MindmapStore): Pick<MindmapStore, 'past' | 'future'> {
  const current = state.activeMindmap?.nodes ?? []
  return {
    past: [...state.past.slice(-30), { nodes: current }],
    future: [],
  }
}

export const useMindmapStore = create<MindmapStore>()(
  subscribeWithSelector((set, get) => ({
    activeMindmap: null,
    diagrams: [],
    selectedNodeIds: [],
    isDirty: false,
    diagramType: 'logic-chart',
    lineStyle: 'orthogonal',
    themeId: localStorage.getItem('mindmaps:themeId') ?? 'default',
    showOrderNumbers: true,
    hideDetails: false,
    isImporting: false,
    resizePreview: null,
    past: [],
    future: [],
    pasteImportFn: null,

    setPasteImportFn: (fn) => set({ pasteImportFn: fn }),

    setActiveMindmap: (d) => {
      // Re-run layout on load: reset widths → compute auto-widths → normalize per depth → final layout
      const freshNodes = d.nodes.map(n => {
        if (n.depth !== 0) return { ...n, width: 0, height: 0, manuallyPositioned: false }
        // Fix root: if title is long (≥15 chars) but stored as a circle, convert to pill
        if (n.title.length >= 15 && n.width === n.height) {
          const fontSize = 28
          const textW = n.title.length * fontSize * 0.55
          return { ...n, width: Math.max(240, Math.round(textW + 72)), height: 90 }
        }
        return n
      })
      const withWidths = runLayout(freshNodes, d.type)
      const nodes = runLayout(normalizeWidthsPerDepth(withWidths), d.type)
      const themeId = d.themeId ?? localStorage.getItem('mindmaps:themeId') ?? 'default'
      localStorage.setItem('mindmaps:themeId', themeId)
      set({
        activeMindmap: { ...d, nodes },
        diagramType: d.type,
        lineStyle: d.lineStyle,
        themeId,
        showOrderNumbers: d.showOrderNumbers ?? true,
        past: [],
        future: [],
        isDirty: false,
      })
    },

    setDiagrams: (ds) => set({ diagrams: ds }),
    setSelectedNodeIds: (ids) => set({ selectedNodeIds: ids }),
    setDiagramType: (t) => {
      const state = get()
      if (!state.activeMindmap) return
      // Clear manual positions AND reset dimensions so every layout starts fresh with correct sizes for the target type
      const resetNodes = state.activeMindmap.nodes.map(n =>
        n.depth === 0 ? { ...n, manuallyPositioned: false } : { ...n, manuallyPositioned: false, width: 0, height: 0 }
      )
      // Run layout once to get auto-computed widths, normalize per depth, then re-layout for correct positions
      const withWidths = runLayout(resetNodes, t)
      const newNodes = runLayout(normalizeWidthsPerDepth(withWidths), t)
      set({
        diagramType: t,
        activeMindmap: { ...state.activeMindmap, type: t, nodes: newNodes },
        isDirty: true,
      })
      const labels: Record<string, string> = {
        'logic-chart': 'Logic Chart', 'mindmap': 'Mind Map',
        'tree-vertical': 'Tree ↓', 'tree-horizontal': 'Tree →',
        'fishbone': 'Fishbone', 'timeline': 'Timeline',
      }
      showToast(`✦ Switched to ${labels[t] ?? t}`, { color: '#1a1d2e' })
    },
    setLineStyle: (s) => {
      const state = get()
      if (!state.activeMindmap) return
      set({
        lineStyle: s,
        activeMindmap: { ...state.activeMindmap, lineStyle: s },
        isDirty: true,
      })
    },
    setIsDirty: (v) => set({ isDirty: v }),

    setTheme: (id) => {
      localStorage.setItem('mindmaps:themeId', id)
      const state = get()
      const palette = getTheme(id).colors
      // Re-color all L1 nodes (depth === 1) using the new theme palette
      if (state.activeMindmap) {
        const l1s = state.activeMindmap.nodes.filter(n => n.depth === 1)
          .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
        const nodes = state.activeMindmap.nodes.map(n => {
          if (n.depth !== 1) return n
          const idx = l1s.findIndex(l => l.id === n.id)
          const newColor = palette[idx % palette.length]
          // Also propagate color to all descendants of this L1 node
          return { ...n, color: newColor }
        })
        // Propagate L1 color down to descendants
        const colorMap = new Map(nodes.filter(n => n.depth === 1).map(n => [n.id, n.color]))
        function getInheritedColor(node: MindmapNode): string {
          if (node.depth === 1) return colorMap.get(node.id) ?? node.color
          const parent = nodes.find(p => p.id === node.parentId)
          if (!parent) return node.color
          return getInheritedColor(parent)
        }
        const recolored = nodes.map(n => n.depth > 1 ? { ...n, color: getInheritedColor(n) } : n)
        const updatedDiagram = { ...state.activeMindmap, themeId: id, nodes: recolored }
        set({ themeId: id, activeMindmap: updatedDiagram, isDirty: true })
        // Immediately update localStorage cache so homepage minimap reflects new colors instantly
        try {
          localStorage.setItem(`mindmaps:diagram:${updatedDiagram.id}`, JSON.stringify(updatedDiagram))
        } catch { /* quota errors are non-fatal */ }
      } else {
        set({ themeId: id })
      }
    },

    snapshotHistory: () => {
      const state = get()
      set(pushHistory(state))
    },

    addNode: (parentId, title = 'New Node') => {
      const state = get()
      if (!state.activeMindmap) throw new Error('No active diagram')
      state.snapshotHistory()

      const parent = parentId ? state.activeMindmap.nodes.find(n => n.id === parentId) : null
      const depth = parent ? parent.depth + 1 : 0
      const siblings = state.activeMindmap.nodes.filter(n => n.parentId === parentId)
      // Depth-1 nodes (direct children of root) each get a unique palette color
      const palette = getTheme(get().themeId).colors
      const color = parent?.depth === 0
        ? palette[siblings.length % palette.length]
        : (parent ? parent.color : palette[8] ?? '#6366f1')
      const newNode: MindmapNode = {
        id: uuid(),
        title,
        color,
        parentId,
        depth,
        x: (parent?.x ?? 400) + 220,
        y: (parent?.y ?? 300) + siblings.length * 60,
        width: depth === 0 ? 180 : computeNodeWidth(title, depth, false),
        height: depth === 0 ? 180 : 40,
        sortOrder: siblings.length,
      }
      // Strip manuallyPositioned so the layout is always clean when adding nodes
      const reset = [...state.activeMindmap.nodes, newNode].map(n => ({ ...n, manuallyPositioned: false }))
      const laid = runLayout(normalizeWidthsPerDepth(reset), state.diagramType)
      const newNodes = rebalanceColors(laid, palette)
      set({
        activeMindmap: { ...state.activeMindmap, nodes: newNodes },
        isDirty: true,
      })
      return newNode
    },

    updateNode: (id, updates) => {
      const state = get()
      if (!state.activeMindmap) return
      const nodes = state.activeMindmap.nodes.map(n => {
        if (n.id !== id) return n
        const merged = { ...n, ...updates }
        // Auto-resize width when title changes (non-root nodes only)
        if (updates.title !== undefined && n.depth > 0) {
          const hasIcon = !!merged.icon
          merged.width = computeNodeWidth(updates.title, n.depth, hasIcon)
        }
        return merged
      })
      // Keep diagram name in sync with root node title
      const isRoot = state.activeMindmap.nodes.find(n => n.id === id)?.parentId === null
      const name = isRoot && updates.title ? updates.title : state.activeMindmap.name
      set({
        activeMindmap: { ...state.activeMindmap, name, nodes },
        isDirty: true,
      })
    },

    batchUpdateNodes: (ids, updates) => {
      const state = get()
      if (!state.activeMindmap || ids.length === 0) return
      const idSet = new Set(ids)
      const nodes = state.activeMindmap.nodes.map(n => idSet.has(n.id) ? { ...n, ...updates } : n)
      set({ activeMindmap: { ...state.activeMindmap, nodes }, isDirty: true })
    },

    reorderNode: (nodeId, insertBeforeId) => {
      const state = get()
      if (!state.activeMindmap) return
      const moving = state.activeMindmap.nodes.find(n => n.id === nodeId)
      if (!moving) return
      const siblings = state.activeMindmap.nodes
        .filter(n => n.parentId === moving.parentId && n.id !== nodeId)
        .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
      const insertIdx = insertBeforeId
        ? siblings.findIndex(n => n.id === insertBeforeId)
        : siblings.length
      const reordered = [
        ...siblings.slice(0, insertIdx),
        moving,
        ...siblings.slice(insertIdx),
      ]
      const idToOrder = new Map(reordered.map((n, i) => [n.id, i]))
      const nodes = state.activeMindmap.nodes
        .map(n => idToOrder.has(n.id) ? { ...n, sortOrder: idToOrder.get(n.id)!, manuallyPositioned: false } : n)
      const laid = runLayout(nodes, state.diagramType)

      const recolored = rebalanceColors(laid, getTheme(state.themeId).colors)
      set({ activeMindmap: { ...state.activeMindmap, nodes: recolored }, isDirty: true })
    },

    deleteNode: (id) => {
      const state = get()
      if (!state.activeMindmap) return
      state.snapshotHistory()
      // Delete node and all descendants
      function getDescendants(nodeId: string): string[] {
        const children = state.activeMindmap!.nodes.filter(n => n.parentId === nodeId)
        return [nodeId, ...children.flatMap(c => getDescendants(c.id))]
      }
      const toDelete = new Set(getDescendants(id))
      const remaining = state.activeMindmap.nodes.filter(n => !toDelete.has(n.id))
      const reindexed = reindexSortOrders(remaining)
      const laid = runLayout(reindexed.map(n => ({ ...n, manuallyPositioned: false })), state.diagramType)
      const nodes = rebalanceColors(laid, getTheme(state.themeId).colors)
      set({
        activeMindmap: { ...state.activeMindmap, nodes },
        selectedNodeIds: state.selectedNodeIds.filter(nid => !toDelete.has(nid)),
        isDirty: true,
      })
    },

    deleteSelectedNodes: () => {
      const state = get()
      if (!state.activeMindmap || state.selectedNodeIds.length === 0) return
      // Never delete the root node
      const rootId = state.activeMindmap.nodes.find(n => n.parentId === null)?.id
      const idsToDelete = state.selectedNodeIds.filter(id => id !== rootId)
      if (idsToDelete.length === 0) return
      state.snapshotHistory()
      function getDescendants(nodeId: string): string[] {
        const children = state.activeMindmap!.nodes.filter(n => n.parentId === nodeId)
        return [nodeId, ...children.flatMap(c => getDescendants(c.id))]
      }
      const toDelete = new Set(idsToDelete.flatMap(id => getDescendants(id)))
      const remaining = state.activeMindmap.nodes.filter(n => !toDelete.has(n.id))
      const reindexed = reindexSortOrders(remaining)
      const laid = runLayout(reindexed.map(n => ({ ...n, manuallyPositioned: false })), state.diagramType)
      const nodes = rebalanceColors(laid, getTheme(state.themeId).colors)
      set({ activeMindmap: { ...state.activeMindmap, nodes }, selectedNodeIds: [], isDirty: true })
    },

    dissolveNode: (id) => {
      const state = get()
      if (!state.activeMindmap) return
      const node = state.activeMindmap.nodes.find(n => n.id === id)
      if (!node || node.parentId === null) return // never dissolve root
      state.snapshotHistory()
      // Re-parent direct children to this node's parent, inheriting depth-1
      const children = state.activeMindmap.nodes.filter(n => n.parentId === id)
      const siblingsOfNode = state.activeMindmap.nodes
        .filter(n => n.parentId === node.parentId && n.id !== id)
        .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
      const insertAt = node.sortOrder ?? siblingsOfNode.length
      // Build updated nodes: remove dissolved node, re-parent its children
      const updated = state.activeMindmap.nodes
        .filter(n => n.id !== id)
        .map(n => {
          if (n.parentId === id) {
            return { ...n, parentId: node.parentId, depth: node.depth, manuallyPositioned: false }
          }
          return n
        })
      // Fix sortOrders: slot children in where the dissolved node was
      const newSiblings = [
        ...siblingsOfNode.filter(n => (n.sortOrder ?? 0) < insertAt),
        ...children.map((c, i) => ({ ...c, sortOrder: insertAt + i })),
        ...siblingsOfNode.filter(n => (n.sortOrder ?? 0) >= insertAt).map((n, i) => ({
          ...n, sortOrder: insertAt + children.length + i,
        })),
      ]
      const orderMap = new Map(newSiblings.map(n => [n.id, n.sortOrder]))
      const patched = updated.map(n => orderMap.has(n.id) ? { ...n, sortOrder: orderMap.get(n.id)! } : n)
      const reindexed = reindexSortOrders(patched)
      const laid = runLayout(reindexed.map(n => ({ ...n, manuallyPositioned: false })), state.diagramType)
      const nodes = rebalanceColors(laid, getTheme(state.themeId).colors)
      set({ activeMindmap: { ...state.activeMindmap, nodes }, selectedNodeIds: [], isDirty: true })
    },

    dissolveSelectedNodes: () => {
      const state = get()
      if (!state.activeMindmap || state.selectedNodeIds.length === 0) return
      const rootId = state.activeMindmap.nodes.find(n => n.parentId === null)?.id
      // Process shallowest first so re-parenting cascades correctly
      const toDissolve = state.selectedNodeIds
        .filter(id => id !== rootId)
        .map(id => state.activeMindmap!.nodes.find(n => n.id === id)!)
        .filter(Boolean)
        .sort((a, b) => a.depth - b.depth)
      if (toDissolve.length === 0) return
      state.snapshotHistory()
      let nodes = state.activeMindmap.nodes
      for (const target of toDissolve) {
        const node = nodes.find(n => n.id === target.id)
        if (!node || node.parentId === null) continue
        const children = nodes.filter(n => n.parentId === node.id)
        const siblings = nodes.filter(n => n.parentId === node.parentId && n.id !== node.id)
          .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
        const insertAt = node.sortOrder ?? siblings.length
        nodes = nodes
          .filter(n => n.id !== node.id)
          .map(n => n.parentId === node.id
            ? { ...n, parentId: node.parentId, depth: node.depth, manuallyPositioned: false }
            : n)
        const newSiblings = [
          ...siblings.filter(n => (n.sortOrder ?? 0) < insertAt),
          ...children.map((c, i) => ({ ...c, sortOrder: insertAt + i })),
          ...siblings.filter(n => (n.sortOrder ?? 0) >= insertAt).map((n, i) => ({
            ...n, sortOrder: insertAt + children.length + i,
          })),
        ]
        const orderMap = new Map(newSiblings.map(n => [n.id, n.sortOrder]))
        nodes = nodes.map(n => orderMap.has(n.id) ? { ...n, sortOrder: orderMap.get(n.id)! } : n)
      }
      const reindexed = reindexSortOrders(nodes)
      const laid = runLayout(reindexed.map(n => ({ ...n, manuallyPositioned: false })), state.diagramType)
      const result = rebalanceColors(laid, getTheme(state.themeId).colors)
      set({ activeMindmap: { ...state.activeMindmap, nodes: result }, selectedNodeIds: [], isDirty: true })
    },

    resizeNodeDepth: (depth, width) => {
      const state = get()
      if (!state.activeMindmap) return
      const clamped = Math.max(100, Math.min(500, width))
      const nodes = state.activeMindmap.nodes.map(n =>
        n.depth === depth ? { ...n, width: clamped, manuallyPositioned: false } : n
      )
      const laid = runLayout(nodes, state.diagramType)
      set({ activeMindmap: { ...state.activeMindmap, nodes: laid }, isDirty: true })
    },

    rerunLayout: () => {
      const state = get()
      if (!state.activeMindmap) return
      const nodes = normalizeWidthsPerDepth(state.activeMindmap.nodes.map(n => ({ ...n, manuallyPositioned: false })))
      const newNodes = runLayout(nodes, state.diagramType)
      set({ activeMindmap: { ...state.activeMindmap, nodes: newNodes }, isDirty: true })
    },

    setShareEnabled: (enabled) => {
      const state = get()
      if (!state.activeMindmap) return
      set({ activeMindmap: { ...state.activeMindmap, sharingEnabled: enabled }, isDirty: true })
    },

    setShowOrderNumbers: (v) => {
      const state = get()
      if (!state.activeMindmap) return
      set({ showOrderNumbers: v, activeMindmap: { ...state.activeMindmap, showOrderNumbers: v }, isDirty: true })
    },

    setHideDetails: (v) => set({ hideDetails: v }),

    setIsImporting: (v) => set({ isImporting: v }),
    setResizePreview: (v) => set({ resizePreview: v }),

    undo: () => {
      const state = get()
      if (state.past.length === 0 || !state.activeMindmap) return
      const prev = state.past[state.past.length - 1]
      set({
        past: state.past.slice(0, -1),
        future: [{ nodes: state.activeMindmap.nodes }, ...state.future],
        activeMindmap: { ...state.activeMindmap, nodes: prev.nodes },
        isDirty: true,
      })
    },

    redo: () => {
      const state = get()
      if (state.future.length === 0 || !state.activeMindmap) return
      const next = state.future[0]
      set({
        past: [...state.past, { nodes: state.activeMindmap.nodes }],
        future: state.future.slice(1),
        activeMindmap: { ...state.activeMindmap, nodes: next.nodes },
        isDirty: true,
      })
    },

    autoAssignIcons: () => {
      const state = get()
      if (!state.activeMindmap) return
      const nodes = state.activeMindmap.nodes.map(n =>
        n.depth > 0 ? { ...n, icon: n.icon ?? guessIcon(n.title) } : n
      )
      set({ activeMindmap: { ...state.activeMindmap, nodes }, isDirty: true })
    },

    clearDiagram: () => set({ activeMindmap: null, selectedNodeIds: [], past: [], future: [], isDirty: false }),

    loadFromOutline: (text: string) => {
      const state = get()
      if (!state.activeMindmap && !state.pasteImportFn) return

      // --- Flat item type used internally ---
      type FlatItem = { title: string; indent: number; icon?: string; emoji?: string; color?: string }
      let parsed: FlatItem[] = []

      // Normalize icon names from any source (HeroIcons, etc.) to our Lucide names
      const ICON_ALIASES: Record<string, string> = {
        fire: 'flame', 'fire-icon': 'flame',
        'globe-alt': 'globe', 'globe-americas': 'globe', 'globe-europe-africa': 'globe',
        'circle-stack': 'layers', stack: 'layers',
        cube: 'package', 'cube-transparent': 'package',
        'archive-box': 'folder', archive: 'folder',
        sun: 'star', moon: 'star',
        'academic-cap': 'graduate', 'graduation-cap': 'graduate',
        'chat-bubble': 'message', 'chat-bubble-left': 'message',
        'device-phone-mobile': 'phone', 'phone-arrow-up-right': 'phone',
        'beaker': 'flask',
        'arrow-trending-up': 'trending', 'chart-bar': 'chart', 'chart-pie': 'pie',
        'paint-brush': 'paint', 'swatch': 'paint',
        'face-smile': 'smile', 'emoji-happy': 'smile',
        'building-office': 'building', 'building-office-2': 'building',
        'banknotes': 'dollar', 'currency-dollar': 'dollar',
        'shopping-bag': 'cart', 'shopping-cart': 'cart',
        'credit-card': 'card',
        'magnifying-glass': 'search',
        'document-text': 'file', document: 'file',
        'clock': 'clock', 'calendar-days': 'calendar',
        'bell-alert': 'bell',
        'exclamation-circle': 'alert', 'exclamation-triangle': 'alert',
        'information-circle': 'info',
        'question-mark-circle': 'help',
        'arrow-path': 'refresh',
        'share': 'share', 'arrow-up-on-square': 'share',
        'arrow-down-tray': 'download', 'arrow-up-tray': 'upload',
        'photo': 'image', 'film': 'video',
        'microphone': 'mic',
        'computer-desktop': 'monitor', 'device-tablet': 'monitor',
        'signal': 'wifi', 'wifi': 'wifi',
        'map-pin': 'map-pin', 'location-marker': 'map-pin',
        'bookmark': 'bookmark', 'tag': 'tag',
        'hashtag': 'hash', 'at-symbol': 'at',
        'paper-airplane': 'send',
        'wrench-screwdriver': 'wrench', 'cog-6-tooth': 'settings', 'cog-8-tooth': 'cog',
        'server': 'server', 'circle-nodes': 'server',
        'cloud-arrow-up': 'cloud', 'cloud-arrow-down': 'cloud',
        'lock-closed': 'lock', 'lock-open': 'lock',
        'key': 'key', 'shield-check': 'shield', 'shield-exclamation': 'shield',
        'code-bracket': 'code', 'command-line': 'terminal',
        'cpu-chip': 'cpu', 'link': 'link', 'squares-2x2': 'layers',
        'rocket-launch': 'rocket', 'bolt': 'zap', 'lightning-bolt': 'zap',
        'light-bulb': 'lightbulb', 'sparkle': 'sparkles',
        'user-circle': 'user', 'user-group': 'user',
        'inbox': 'mail', 'envelope': 'mail',
        'heart': 'heart', 'hand-heart': 'heart',
        'trophy': 'trophy', 'star': 'star', 'flag': 'flag',
        'map': 'map', 'compass': 'compass',
        'crosshairs': 'crosshair', 'viewfinder-circle': 'crosshair',
        'target': 'target', 'cursor-arrow-rays': 'target',
        'activity': 'activity', 'pulse': 'activity',
      }
      function normalizeIcon(raw: string | undefined): string | undefined {
        if (!raw) return undefined
        // Strip "Icon" suffix, convert PascalCase/camelCase to kebab-case
        const kebab = raw
          .replace(/Icon$/, '')
          .replace(/([A-Z])/g, (_m, l, i) => (i === 0 ? l.toLowerCase() : '-' + l.toLowerCase()))
          .toLowerCase()
        if (ICON_MAP[kebab]) return kebab
        if (ICON_ALIASES[kebab]) return ICON_ALIASES[kebab]
        return raw ? 'sparkles' : undefined  // fallback — never leave empty if icon was provided
      }

      // Try JSON first
      const trimmed = text.trim()
      if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
        try {
          const json = JSON.parse(trimmed)
          // Flatten recursive { title, icon?, children? } tree into indent list
          const META_KEYS = new Set(['icon', 'emoji', 'bold', 'italic', 'fontSize', 'textAlign', 'title', 'name', 'children', 'type', 'lineStyle', 'color'])
          function flattenJson(node: Record<string, unknown> | string, depth: number, inheritColor?: string) {
            if (typeof node === 'string') { parsed.push({ title: node.trim(), indent: depth, color: inheritColor }); return }
            // New format: title is the non-metadata key, its value is children array
            const titleKey = Object.keys(node).find(k => !META_KEYS.has(k))
            const nodeColor = (typeof node.color === 'string' && node.color.trim()) ? node.color.trim() : inheritColor
            if (titleKey) {
              parsed.push({ title: titleKey, indent: depth, icon: normalizeIcon(node.icon as string | undefined), emoji: node.emoji as string | undefined, color: nodeColor })
              const kids = node[titleKey]
              if (Array.isArray(kids)) for (const child of kids) flattenJson(child as Record<string, unknown> | string, depth + 1, nodeColor)
              return
            }
            // Legacy format: { title/name, icon, emoji, children }
            const title = ((node.title ?? node.name) as string | undefined ?? '').trim()
            if (!title) return
            parsed.push({ title, indent: depth, icon: normalizeIcon(node.icon as string | undefined), emoji: node.emoji as string | undefined, color: nodeColor })
            if (Array.isArray(node.children)) {
              for (const child of node.children) flattenJson(child as Record<string, unknown> | string, depth + 1, nodeColor)
            }
          }
          const roots = Array.isArray(json) ? json : [json]
          for (const r of roots) flattenJson(r, 0)
        } catch {
          // not valid JSON, fall through to text parsing
        }
      }

      // Fall back to indented text
      if (parsed.length === 0) {
        const lines = text.split('\n').filter(l => l.trim())
        if (lines.length === 0) return
        parsed = lines.map(line => {
          const raw = line.match(/^(\s*)(.+)$/)
          if (!raw) return null
          const ws = raw[1]
          const indent = ws.includes('\t') ? (ws.match(/\t/g)?.length ?? 0) : Math.floor(ws.length / 4)
          return { title: raw[2].trim(), indent }
        }).filter(Boolean) as FlatItem[]
      }

      if (parsed.length === 0) return

      // Normalize: shift all indents so minimum is 0
      const minIndent = Math.min(...parsed.map(p => p.indent))
      if (minIndent > 0) parsed.forEach(p => { p.indent -= minIndent })

      // If multiple items at indent 0, wrap them under a single root
      const rootCount = parsed.filter(p => p.indent === 0).length
      if (rootCount > 1) {
        const rootTitle = parsed[0].title
        parsed.forEach(p => { p.indent += 1 })
        parsed.unshift({ title: rootTitle, indent: 0 })
      }

      const nodeIds = parsed.map(() => uuid())
      const parentIds: (string | null)[] = []
      const depths: number[] = []
      const sortOrders: number[] = []
      const siblingCount = new Map<string | null, number>()
      const parentStack: number[] = []

      for (let i = 0; i < parsed.length; i++) {
        const { indent } = parsed[i]
        while (parentStack.length > 0 && parsed[parentStack[parentStack.length - 1]].indent >= indent) {
          parentStack.pop()
        }
        const parentIdx = parentStack.length > 0 ? parentStack[parentStack.length - 1] : null
        const parentId = parentIdx !== null ? nodeIds[parentIdx] : null
        const order = siblingCount.get(parentId) ?? 0
        siblingCount.set(parentId, order + 1)
        sortOrders.push(order)
        parentIds.push(parentId)
        depths.push(indent)
        parentStack.push(i)
      }

      const palette = getTheme(state.themeId).colors
      const hasExplicitColors = parsed.some(p => p.color)
      const rawNodes: MindmapNode[] = parsed.map((p, i) => {
        const depth = depths[i]
        const icon = depth <= 2 ? p.icon : undefined
        const emoji = depth <= 2 ? p.emoji : undefined
        const hasVisualZone = !!(icon || emoji)
        return {
          id: nodeIds[i],
          title: p.title,
          parentId: parentIds[i],
          depth,
          sortOrder: sortOrders[i],
          color: p.color ?? palette[0],
          x: 0, y: 0,
          width: depth === 0 ? 180 : computeNodeWidth(p.title, depth, hasVisualZone),
          height: depth === 0 ? 180 : (emoji ? 48 : 40),
          manuallyPositioned: false,
          icon,
          emoji,
        }
      })

      set({ isImporting: true })
      const laid = runLayout(normalizeWidthsPerDepth(rawNodes), state.activeMindmap?.type ?? state.diagramType ?? 'logic-chart')
      const nodes = hasExplicitColors ? laid : rebalanceColors(laid, palette)
      const name = parsed[0].title

      const { pasteImportFn } = get()
      if (pasteImportFn) {
        pasteImportFn(name, nodes)
      } else {
        state.snapshotHistory()
        set({
          activeMindmap: { ...state.activeMindmap!, name, nodes },
          selectedNodeIds: [],
          isDirty: true,
        })
      }
      setTimeout(() => set({ isImporting: false }), 900)
    },
  }))
)
