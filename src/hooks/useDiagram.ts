import { useCallback } from 'react'
import { showToast } from '../components/CuteToast'
import { useMindmapStore } from '../store/mindmapStore'
import { ROOT_COLORS } from '../lib/color'
import { soundCreate, soundDelete, soundSave, soundPaste } from '../lib/sounds'
import type { Diagram, DiagramMeta, MindmapNode } from '../types'

// ── API config ─────────────────────────────────────────────────────────────
const API_BASE = '/api/mindmaps'

// Attach the signed session token (set at login) to every API call.
function authHeaders(): Record<string, string> {
  const h: Record<string, string> = { 'Content-Type': 'application/json' }
  let token: string | null = null
  try { token = localStorage.getItem('mindmaps:token') } catch { /* no storage */ }
  if (token) h['Authorization'] = `Bearer ${token}`
  return h
}

// ── localStorage helpers ────────────────────────────────────────────────────

const LS_LIST = 'mindmaps:list'
const lsKey = (id: string) => `mindmaps:diagram:${id}`

function lsGetList(): DiagramMeta[] {
  try {
    const list: DiagramMeta[] = JSON.parse(localStorage.getItem(LS_LIST) ?? '[]')
    return list.sort((a, b) => new Date(b.updatedAt ?? 0).getTime() - new Date(a.updatedAt ?? 0).getTime())
  } catch { return [] }
}
function lsSaveList(list: DiagramMeta[]) {
  localStorage.setItem(LS_LIST, JSON.stringify(list))
}
function lsGetDiagram(id: string): Diagram | null {
  try {
    return JSON.parse(localStorage.getItem(lsKey(id)) ?? 'null')
  } catch { return null }
}
function lsSaveDiagram(d: Diagram) {
  const now = new Date().toISOString()
  const saved = { ...d, updatedAt: now }
  localStorage.setItem(lsKey(d.id), JSON.stringify(saved))
  const list = lsGetList()
  const idx = list.findIndex(m => m.id === d.id)
  const existingMeta = list.find(m => m.id === d.id)
  const meta: DiagramMeta = { id: d.id, name: d.name, type: d.type, updatedAt: now, tags: d.tags ?? existingMeta?.tags ?? [] }
  if (idx >= 0) list[idx] = meta; else list.unshift(meta)
  lsSaveList(list)
}
export function lsDeleteDiagram(id: string) {
  localStorage.removeItem(lsKey(id))
  lsSaveList(lsGetList().filter(m => m.id !== id))
}

// ── DB row → Diagram ─────────────────────────────────────────────────────────

// Some legacy/AI-generated rows were saved with type 'logic' (not a valid
// DiagramType). Map anything unrecognized to 'logic-chart' so layout + rendering
// never break. Resaving the map heals the stored value.
const VALID_TYPES: Diagram['type'][] = ['logic-chart', 'mindmap', 'fishbone', 'timeline']
function normalizeType(t: unknown): Diagram['type'] {
  return VALID_TYPES.includes(t as Diagram['type']) ? (t as Diagram['type']) : 'logic-chart'
}

function rowToDiagram(row: Record<string, unknown>): Diagram {
  const rawNodes = (row.nodes ?? []) as Record<string, unknown>[]
  const nodes: MindmapNode[] = rawNodes.map(n => ({
    id:                 n.id as string,
    title:              n.title as string,
    color:              n.color as string,
    parentId:           (n.parentId ?? null) as string | null,
    depth:              n.depth as number,
    x:                  n.x as number,
    y:                  n.y as number,
    width:              n.width as number,
    height:             n.height as number,
    sortOrder:          n.sortOrder as number,
    manuallyPositioned: n.depth === 0 ? false : (n.manuallyPositioned ?? false) as boolean,
    fontSize:           (n.fontSize && n.fontSize !== 13) ? n.fontSize as number : undefined,
    bold:               (n.bold ?? undefined) as boolean | undefined,
    italic:             (n.italic ?? undefined) as boolean | undefined,
    textAlign:          (n.textAlign ?? undefined) as 'left' | 'center' | 'right' | undefined,
    borderColor:        (n.borderColor ?? undefined) as string | undefined,
    borderWidth:        (n.borderWidth ?? undefined) as number | undefined,
    icon:               (n.icon ?? undefined) as string | undefined,
    emoji:              (n.emoji ?? undefined) as string | undefined,
    shape:              (n.shape ?? undefined) as 'circle' | 'pill' | undefined,
    url:                (n.url ?? undefined) as string | undefined,
  }))
  return {
    id:             row.id as string,
    name:           row.name as string,
    type:           normalizeType(row.type),
    lineStyle:      (row.line_style as Diagram['lineStyle']) ?? 'orthogonal',
    createdAt:      (row.created_at as string) ?? new Date().toISOString(),
    updatedAt:      (row.updated_at as string) ?? new Date().toISOString(),
    sharingEnabled: (row.sharing_enabled ?? false) as boolean,
    themeId:        (row.theme_id as string | undefined) ?? 'default',
    tags:           (row.tags as string[] | undefined) ?? [],
    nodes,
  }
}

// ── hook ────────────────────────────────────────────────────────────────────

export function useDiagram(userId: string | null = null) {
  const { setActiveMindmap, setDiagrams, setIsDirty } = useMindmapStore()

  const loadDiagramList = useCallback(async () => {
    if (!userId) { setDiagrams([]); return }

    try {
      const res = await fetch(`${API_BASE}?user_id=${userId}`, { headers: authHeaders() })
      if (!res.ok) { setDiagrams([]); return }
      const data = await res.json() as Record<string, unknown>[]

      const list = (data ?? []).map(d => ({
        id: d.id as string, name: d.name as string, type: normalizeType(d.type),
        updatedAt: d.updated_at as string,
        isPublic: (d.sharing_enabled ?? false) as boolean,
        tags: (d.tags as string[]) ?? [],
      }))
      setDiagrams(list)
    } catch {
      setDiagrams([])
    }
  }, [setDiagrams, userId])

  const loadDiagram = useCallback(async (id: string): Promise<Diagram | null> => {
    // 1. Try localStorage cache first (instant)
    const cached = lsGetDiagram(id)
    if (cached) {
      setActiveMindmap(cached)
      localStorage.setItem('activeMindmapId', id)
    }

    // 2. Query Linode API — retry once on transient failure (flaky mobile networks,
    //    serverless cold starts). Always try, even without userId (shared/direct links).
    const params = userId ? `id=${id}&user_id=${userId}` : `id=${id}`
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const res = await fetch(`${API_BASE}?${params}`, { headers: authHeaders() })
        if (!res.ok) {
          // Retry 5xx once; treat 4xx (not found / not shared) as final.
          if (res.status >= 500 && attempt === 0) { await new Promise(r => setTimeout(r, 500)); continue }
          return cached ?? null
        }
        const data = await res.json()
        if (data.error) return cached ?? null

        const diagram = rowToDiagram(data)
        // If local cache is newer, keep it
        if (cached) {
          const localTime = new Date(cached.updatedAt ?? 0).getTime()
          const remoteTime = new Date(diagram.updatedAt ?? 0).getTime()
          if (localTime > remoteTime) return cached
        }
        setActiveMindmap(diagram)
        localStorage.setItem('activeMindmapId', id)
        lsSaveDiagram(diagram)
        return diagram
      } catch {
        // Network blip — retry once, then fall back to cache (may be null)
        if (attempt === 0) { await new Promise(r => setTimeout(r, 500)); continue }
        return cached ?? null
      }
    }
    return cached ?? null
  }, [setActiveMindmap, userId])

  const saveDiagram = useCallback(async (diagram: Diagram) => {
    // Always save to localStorage first
    lsSaveDiagram(diagram)

    if (!userId) {
      setIsDirty(false)
      return
    }

    try {
      await fetch(API_BASE, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({
          id:              diagram.id,
          user_id:         userId,
          name:            diagram.name,
          type:            diagram.type,
          line_style:      diagram.lineStyle,
          sharing_enabled: diagram.sharingEnabled ?? false,
          theme_id:        diagram.themeId ?? 'default',
          nodes:           diagram.nodes,
          tags:            diagram.tags,
        }),
      })
    } catch {
      // Network error — localStorage saved above
    }
    setIsDirty(false)
    soundSave()
  }, [setIsDirty, userId])

  const createDiagram = useCallback(async (name: string): Promise<string> => {
    const id = crypto.randomUUID()
    const rootId = crypto.randomUUID()
    const now = new Date().toISOString()
    const TOPIC_LABELS = ['Main Topic 1', 'Main Topic 2', 'Main Topic 3', 'Main Topic 4', 'Main Topic 5']
    const topicNodes: MindmapNode[] = TOPIC_LABELS.map((title, i) => ({
      id: crypto.randomUUID(), title,
      color: ROOT_COLORS[i % ROOT_COLORS.length],
      parentId: rootId, depth: 1,
      x: 0, y: 0, width: 160, height: 40, sortOrder: i,
    }))
    const allNodes: MindmapNode[] = [
      { id: rootId, title: name, color: '#6366f1', parentId: null, depth: 0, x: 0, y: 0, width: 140, height: 140, sortOrder: 0 },
      ...topicNodes,
    ]
    const { computeMindmapsLayout } = await import('../lib/layout/mindmaps-layout')
    const laid = computeMindmapsLayout(allNodes)
    const diagram: Diagram = { id, name, type: 'logic-chart', lineStyle: 'orthogonal', createdAt: now, updatedAt: now, nodes: laid }

    lsSaveDiagram(diagram)
    setActiveMindmap(diagram)
    localStorage.setItem('activeMindmapId', id)
    setDiagrams(lsGetList())
    soundCreate()
    showToast(`✦ "${name}" created`, { color: '#1a1d2e', confetti: true })

    // Sync to server in background
    if (userId) {
      fetch(API_BASE, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({
          id, user_id: userId, name, type: 'logic-chart', line_style: 'orthogonal',
          sharing_enabled: false, nodes: laid,
        }),
      }).catch(() => {})
    }
    return id
  }, [setActiveMindmap, setDiagrams, userId])

  const createDiagramFromNodes = useCallback(async (name: string, nodes: MindmapNode[]): Promise<string | null> => {
    const existingNames = new Set(useMindmapStore.getState().diagrams.map(d => d.name))
    let finalName = name
    let n = 2
    while (existingNames.has(finalName)) finalName = `${name} ${n++}`

    const id = crypto.randomUUID()
    const now = new Date().toISOString()
    const diagram: Diagram = { id, name: finalName, type: 'logic-chart', lineStyle: 'orthogonal', createdAt: now, updatedAt: now, nodes }

    lsSaveDiagram(diagram)
    setActiveMindmap(diagram)
    localStorage.setItem('activeMindmapId', id)
    setDiagrams(lsGetList())
    soundPaste()
    showToast(`✦ "${finalName}" created`, { color: '#22c55e', confetti: true })

    if (userId) {
      fetch(API_BASE, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({
          id, user_id: userId, name: finalName, type: 'logic-chart', line_style: 'orthogonal',
          sharing_enabled: false, nodes,
        }),
      }).catch(() => {})
    }
    return id
  }, [setActiveMindmap, setDiagrams, userId])

  const deleteDiagram = useCallback(async (id: string, name?: string) => {
    const store = useMindmapStore.getState()
    if (store.activeMindmap?.id === id) {
      store.setActiveMindmap(null)
      store.setIsDirty(false)
    }
    lsDeleteDiagram(id)
    const { diagrams } = useMindmapStore.getState()
    setDiagrams(diagrams.filter(d => d.id !== id))
    soundDelete()
    showToast(`"${name ?? 'Map'}" deleted`, { color: '#1a1d2e' })

    if (userId) {
      fetch(`${API_BASE}?id=${id}&user_id=${userId}`, { method: 'DELETE', headers: authHeaders() }).catch(() => {})
    }
  }, [setDiagrams, userId])

  const updateTags = useCallback(async (id: string, tags: string[]) => {
    const { diagrams, activeMindmap, setActiveMindmap } = useMindmapStore.getState()
    setDiagrams(diagrams.map(d => d.id === id ? { ...d, tags } : d))
    if (activeMindmap?.id === id) setActiveMindmap({ ...activeMindmap, tags })
    lsSaveList(lsGetList().map(m => m.id === id ? { ...m, tags } : m))
    const cached = lsGetDiagram(id)
    if (cached) lsSaveDiagram({ ...cached, tags })

    if (userId) {
      fetch(API_BASE, {
        method: 'PUT',
        headers: authHeaders(),
        body: JSON.stringify({ id, user_id: userId, tags }),
      }).catch(() => {})
    }
  }, [setDiagrams, userId])

  return { loadDiagramList, loadDiagram, saveDiagram, createDiagram, createDiagramFromNodes, deleteDiagram, updateTags }
}
