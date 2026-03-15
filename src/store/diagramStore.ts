import { create } from 'zustand'
import { subscribeWithSelector } from 'zustand/middleware'
import type { Diagram, DiagramMeta, DiagramType, LineStyle, MindNode } from '../types'
import { computeTreeLayout } from '../lib/layout/tree'
import { computeMindmapLayout } from '../lib/layout/mindmap'
import { computeFishboneLayout } from '../lib/layout/fishbone'
import { computeTimelineLayout } from '../lib/layout/timeline'
import { getTheme } from '../lib/themes'
import { guessIcon } from '../lib/autoIcon'

/** Compute a node width that fits its title text — font sizes must match Node.tsx */
function computeNodeWidth(title: string, depth: number, hasIcon: boolean): number {
  const fontSize = depth === 1 ? 22 : depth === 2 ? 16 : depth === 3 ? 13 : 11
  const charW = fontSize * 0.58
  const textPad = 24
  const textW = Math.ceil(title.length * charW) + textPad
  // icon zone takes ~20% of node width, so text zone = 80% of total
  const total = hasIcon ? Math.ceil(textW / 0.8) : textW
  return Math.max(140, Math.min(400, total))
}

/** Make all nodes at the same depth share the width of the widest node at that depth */
function normalizeWidthsPerDepth(nodes: MindNode[]): MindNode[] {
  const maxByDepth = new Map<number, number>()
  for (const n of nodes) {
    if (n.depth > 0) maxByDepth.set(n.depth, Math.max(maxByDepth.get(n.depth) ?? 0, n.width))
  }
  return nodes.map(n => n.depth > 0 ? { ...n, width: maxByDepth.get(n.depth) ?? n.width } : n)
}

/** Re-index sortOrder per parent group so numbers are always 0,1,2,... with no gaps */
function reindexSortOrders(nodes: MindNode[]): MindNode[] {
  const groups = new Map<string | null, MindNode[]>()
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
function rebalanceColors(nodes: MindNode[], palette: string[]): MindNode[] {
  // Only use first 12 — the vibrant wheel colors; the rest are utility (darks, grays, whites)
  const vibrant = palette.slice(0, 12).filter(c => !isTooLight(c))
  const effectivePalette = vibrant.length >= 2 ? vibrant : palette.slice(0, 12)
  const l1 = nodes.filter(n => n.depth === 1).sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
  const N = l1.length
  if (N === 0) return nodes
  const colorMap = new Map(l1.map((n, i) => [
    n.id,
    effectivePalette[Math.round(i * effectivePalette.length / N) % effectivePalette.length],
  ]))
  function inheritedColor(node: MindNode): string {
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

function runLayout(nodes: MindNode[], type: DiagramType): MindNode[] {
  switch (type) {
    case 'mindmap': return computeMindmapLayout(nodes)
    case 'fishbone': return computeFishboneLayout(nodes)
    case 'tree-vertical': return computeTreeLayout(nodes, 'vertical')
    case 'tree-horizontal': return computeTreeLayout(nodes, 'horizontal')
    case 'timeline': return computeTimelineLayout(nodes)
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
  themeId: string
  showOrderNumbers: boolean
  isImporting: boolean
  resizePreview: { depth: number; width: number } | null
  // History
  past: HistoryState[]
  future: HistoryState[]
  // Actions
  setActiveDiagram: (d: Diagram) => void
  setDiagrams: (ds: DiagramMeta[]) => void
  setSelectedNodeIds: (ids: string[]) => void
  setDiagramType: (t: DiagramType) => void
  setLineStyle: (s: LineStyle) => void
  setTheme: (id: string) => void
  setIsDirty: (v: boolean) => void
  addNode: (parentId: string | null, title?: string) => MindNode
  updateNode: (id: string, updates: Partial<MindNode>) => void
  batchUpdateNodes: (ids: string[], updates: Partial<MindNode>) => void
  reorderNode: (nodeId: string, insertBeforeId: string | null) => void
  deleteNode: (id: string) => void
  deleteSelectedNodes: () => void
  dissolveNode: (id: string) => void
  resizeNodeDepth: (depth: number, width: number) => void
  rerunLayout: () => void
  setShareEnabled: (enabled: boolean) => void
  setShowOrderNumbers: (v: boolean) => void
  setIsImporting: (v: boolean) => void
  setResizePreview: (v: { depth: number; width: number } | null) => void
  undo: () => void
  redo: () => void
  snapshotHistory: () => void
  clearDiagram: () => void
  loadFromOutline: (text: string) => void
  autoAssignIcons: () => void
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
    lineStyle: 'orthogonal',
    themeId: localStorage.getItem('mindmap:themeId') ?? 'default',
    showOrderNumbers: true,
    isImporting: false,
    resizePreview: null,
    past: [],
    future: [],

    setActiveDiagram: (d) => set({
      activeDiagram: d,
      diagramType: d.type,
      lineStyle: d.lineStyle,
      showOrderNumbers: d.showOrderNumbers ?? true,
      past: [],
      future: [],
      isDirty: false,
    }),

    setDiagrams: (ds) => set({ diagrams: ds }),
    setSelectedNodeIds: (ids) => set({ selectedNodeIds: ids }),
    setDiagramType: (t) => {
      const state = get()
      if (!state.activeDiagram) return
      // Clear manual positions so every layout starts fresh
      const resetNodes = state.activeDiagram.nodes.map(n => ({ ...n, manuallyPositioned: false }))
      const newNodes = runLayout(resetNodes, t)
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

    setTheme: (id) => {
      localStorage.setItem('mindmap:themeId', id)
      const state = get()
      const palette = getTheme(id).colors
      // Re-color all L1 nodes (depth === 1) using the new theme palette
      if (state.activeDiagram) {
        const l1s = state.activeDiagram.nodes.filter(n => n.depth === 1)
          .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
        const nodes = state.activeDiagram.nodes.map(n => {
          if (n.depth !== 1) return n
          const idx = l1s.findIndex(l => l.id === n.id)
          const newColor = palette[idx % palette.length]
          // Also propagate color to all descendants of this L1 node
          return { ...n, color: newColor }
        })
        // Propagate L1 color down to descendants
        const colorMap = new Map(nodes.filter(n => n.depth === 1).map(n => [n.id, n.color]))
        function getInheritedColor(node: MindNode): string {
          if (node.depth === 1) return colorMap.get(node.id) ?? node.color
          const parent = nodes.find(p => p.id === node.parentId)
          if (!parent) return node.color
          return getInheritedColor(parent)
        }
        const recolored = nodes.map(n => n.depth > 1 ? { ...n, color: getInheritedColor(n) } : n)
        set({ themeId: id, activeDiagram: { ...state.activeDiagram, nodes: recolored }, isDirty: true })
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
      if (!state.activeDiagram) throw new Error('No active diagram')
      state.snapshotHistory()

      const parent = parentId ? state.activeDiagram.nodes.find(n => n.id === parentId) : null
      const depth = parent ? parent.depth + 1 : 0
      const siblings = state.activeDiagram.nodes.filter(n => n.parentId === parentId)
      // Depth-1 nodes (direct children of root) each get a unique palette color
      const palette = getTheme(get().themeId).colors
      const color = parent?.depth === 0
        ? palette[siblings.length % palette.length]
        : (parent ? parent.color : palette[8] ?? '#6366f1')
      const newNode: MindNode = {
        id: crypto.randomUUID(),
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
      const reset = [...state.activeDiagram.nodes, newNode].map(n => ({ ...n, manuallyPositioned: false }))
      const laid = runLayout(reset, state.diagramType)
      const newNodes = rebalanceColors(laid, palette)
      set({
        activeDiagram: { ...state.activeDiagram, nodes: newNodes },
        isDirty: true,
      })
      return newNode
    },

    updateNode: (id, updates) => {
      const state = get()
      if (!state.activeDiagram) return
      const nodes = state.activeDiagram.nodes.map(n => {
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
      const isRoot = state.activeDiagram.nodes.find(n => n.id === id)?.parentId === null
      const name = isRoot && updates.title ? updates.title : state.activeDiagram.name
      set({
        activeDiagram: { ...state.activeDiagram, name, nodes },
        isDirty: true,
      })
    },

    batchUpdateNodes: (ids, updates) => {
      const state = get()
      if (!state.activeDiagram || ids.length === 0) return
      const idSet = new Set(ids)
      const nodes = state.activeDiagram.nodes.map(n => idSet.has(n.id) ? { ...n, ...updates } : n)
      set({ activeDiagram: { ...state.activeDiagram, nodes }, isDirty: true })
    },

    reorderNode: (nodeId, insertBeforeId) => {
      const state = get()
      if (!state.activeDiagram) return
      const moving = state.activeDiagram.nodes.find(n => n.id === nodeId)
      if (!moving) return
      const siblings = state.activeDiagram.nodes
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
      const nodes = state.activeDiagram.nodes
        .map(n => idToOrder.has(n.id) ? { ...n, sortOrder: idToOrder.get(n.id)!, manuallyPositioned: false } : n)
      const laid = runLayout(nodes, state.diagramType)

      const recolored = rebalanceColors(laid, getTheme(state.themeId).colors)
      set({ activeDiagram: { ...state.activeDiagram, nodes: recolored }, isDirty: true })
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
      const remaining = state.activeDiagram.nodes.filter(n => !toDelete.has(n.id))
      const reindexed = reindexSortOrders(remaining)
      const laid = runLayout(reindexed.map(n => ({ ...n, manuallyPositioned: false })), state.diagramType)
      const nodes = rebalanceColors(laid, getTheme(state.themeId).colors)
      set({
        activeDiagram: { ...state.activeDiagram, nodes },
        selectedNodeIds: state.selectedNodeIds.filter(nid => !toDelete.has(nid)),
        isDirty: true,
      })
    },

    deleteSelectedNodes: () => {
      const state = get()
      if (!state.activeDiagram || state.selectedNodeIds.length === 0) return
      // Never delete the root node
      const rootId = state.activeDiagram.nodes.find(n => n.parentId === null)?.id
      const idsToDelete = state.selectedNodeIds.filter(id => id !== rootId)
      if (idsToDelete.length === 0) return
      state.snapshotHistory()
      function getDescendants(nodeId: string): string[] {
        const children = state.activeDiagram!.nodes.filter(n => n.parentId === nodeId)
        return [nodeId, ...children.flatMap(c => getDescendants(c.id))]
      }
      const toDelete = new Set(idsToDelete.flatMap(id => getDescendants(id)))
      const remaining = state.activeDiagram.nodes.filter(n => !toDelete.has(n.id))
      const reindexed = reindexSortOrders(remaining)
      const laid = runLayout(reindexed.map(n => ({ ...n, manuallyPositioned: false })), state.diagramType)
      const nodes = rebalanceColors(laid, getTheme(state.themeId).colors)
      set({ activeDiagram: { ...state.activeDiagram, nodes }, selectedNodeIds: [], isDirty: true })
    },

    dissolveNode: (id) => {
      const state = get()
      if (!state.activeDiagram) return
      const node = state.activeDiagram.nodes.find(n => n.id === id)
      if (!node || node.parentId === null) return // never dissolve root
      state.snapshotHistory()
      // Re-parent direct children to this node's parent, inheriting depth-1
      const children = state.activeDiagram.nodes.filter(n => n.parentId === id)
      const siblingsOfNode = state.activeDiagram.nodes
        .filter(n => n.parentId === node.parentId && n.id !== id)
        .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
      const insertAt = node.sortOrder ?? siblingsOfNode.length
      // Build updated nodes: remove dissolved node, re-parent its children
      const updated = state.activeDiagram.nodes
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
      set({ activeDiagram: { ...state.activeDiagram, nodes }, selectedNodeIds: [], isDirty: true })
    },

    resizeNodeDepth: (depth, width) => {
      const state = get()
      if (!state.activeDiagram) return
      const clamped = Math.max(100, Math.min(500, width))
      const nodes = state.activeDiagram.nodes.map(n =>
        n.depth === depth ? { ...n, width: clamped, manuallyPositioned: false } : n
      )
      const laid = runLayout(nodes, state.diagramType)
      set({ activeDiagram: { ...state.activeDiagram, nodes: laid }, isDirty: true })
    },

    rerunLayout: () => {
      const state = get()
      if (!state.activeDiagram) return
      const nodes = normalizeWidthsPerDepth(state.activeDiagram.nodes.map(n => ({ ...n, manuallyPositioned: false })))
      const newNodes = runLayout(nodes, state.diagramType)
      set({ activeDiagram: { ...state.activeDiagram, nodes: newNodes }, isDirty: true })
    },

    setShareEnabled: (enabled) => {
      const state = get()
      if (!state.activeDiagram) return
      set({ activeDiagram: { ...state.activeDiagram, sharingEnabled: enabled }, isDirty: true })
    },

    setShowOrderNumbers: (v) => {
      const state = get()
      if (!state.activeDiagram) return
      set({ showOrderNumbers: v, activeDiagram: { ...state.activeDiagram, showOrderNumbers: v }, isDirty: true })
    },

    setIsImporting: (v) => set({ isImporting: v }),
    setResizePreview: (v) => set({ resizePreview: v }),

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

    autoAssignIcons: () => {
      const state = get()
      if (!state.activeDiagram) return
      const nodes = state.activeDiagram.nodes.map(n =>
        n.depth > 0 ? { ...n, icon: n.icon ?? guessIcon(n.title) } : n
      )
      set({ activeDiagram: { ...state.activeDiagram, nodes }, isDirty: true })
    },

    clearDiagram: () => set({ activeDiagram: null, selectedNodeIds: [], past: [], future: [], isDirty: false }),

    loadFromOutline: (text: string) => {
      const state = get()
      if (!state.activeDiagram) return
      state.snapshotHistory()

      // --- Flat item type used internally ---
      type FlatItem = { title: string; indent: number; icon?: string }
      let parsed: FlatItem[] = []

      // Try JSON first
      const trimmed = text.trim()
      if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
        try {
          const json = JSON.parse(trimmed)
          // Flatten recursive { title, icon?, children? } tree into indent list
          function flattenJson(node: { title?: string; name?: string; icon?: string; children?: unknown[] }, depth: number) {
            const title = (node.title ?? node.name ?? '').trim()
            if (!title) return
            parsed.push({ title, indent: depth, icon: node.icon })
            if (Array.isArray(node.children)) {
              for (const child of node.children) flattenJson(child as typeof node, depth + 1)
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

      const nodeIds = parsed.map(() => crypto.randomUUID())
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
      const rawNodes: MindNode[] = parsed.map((p, i) => {
        const depth = depths[i]
        // Use explicit icon from JSON as-is; fall back to auto-guess for text imports
        const icon = depth > 0 ? (p.icon ?? guessIcon(p.title)) : undefined
        return {
          id: nodeIds[i],
          title: p.title,
          parentId: parentIds[i],
          depth,
          sortOrder: sortOrders[i],
          color: palette[0],
          x: 0, y: 0,
          width: depth === 0 ? 180 : computeNodeWidth(p.title, depth, !!icon),
          height: depth === 0 ? 180 : 40,
          manuallyPositioned: false,
          icon,
        }
      })

      set({ isImporting: true })
      const laid = runLayout(normalizeWidthsPerDepth(rawNodes), state.diagramType)
      const nodes = rebalanceColors(laid, palette)
      const name = parsed[0].title

      set({
        activeDiagram: { ...state.activeDiagram, name, nodes },
        selectedNodeIds: [],
        isDirty: true,
      })
      setTimeout(() => set({ isImporting: false }), 900)
    },
  }))
)
