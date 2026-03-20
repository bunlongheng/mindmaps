import { useCallback } from 'react'
import { showToast } from '../components/CuteToast'
import { supabase, hasSupabase } from '../lib/supabase'
import { useMindmapStore } from '../store/mindmapStore'
import { ROOT_COLORS } from '../lib/color'
import type { Diagram, DiagramMeta, MindmapNode } from '../types'

// ── localStorage helpers ────────────────────────────────────────────────────

const LS_LIST = 'mindmaps:list'
const lsKey = (id: string) => `mindmaps:diagram:${id}`

function lsGetList(): DiagramMeta[] {
  try {
    const list = JSON.parse(localStorage.getItem(LS_LIST) ?? '[]')
    return list.map((m: DiagramMeta) => m.type === 'mindmap' ? { ...m, type: 'logic-chart' } : m)
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
  localStorage.setItem(lsKey(d.id), JSON.stringify(d))
  const list = lsGetList()
  const idx = list.findIndex(m => m.id === d.id)
  const meta: DiagramMeta = { id: d.id, name: d.name, type: d.type, updatedAt: new Date().toISOString() }
  if (idx >= 0) list[idx] = meta; else list.unshift(meta)
  lsSaveList(list)
}
function lsDeleteDiagram(id: string) {
  localStorage.removeItem(lsKey(id))
  lsSaveList(lsGetList().filter(m => m.id !== id))
}

// ── DB row → Diagram ─────────────────────────────────────────────────────────

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
  }))
  return {
    id:             row.id as string,
    name:           row.name as string,
    type:           row.type as Diagram['type'],
    lineStyle:      row.line_style as Diagram['lineStyle'],
    createdAt:      row.created_at as string,
    updatedAt:      row.updated_at as string,
    sharingEnabled: (row.sharing_enabled ?? false) as boolean,
    themeId: (row.theme_id as string | undefined) ?? 'default',
    nodes,
  }
}

// ── hook ────────────────────────────────────────────────────────────────────

export function useDiagram(userId: string | null = null) {
  const { setActiveMindmap, setDiagrams, setIsDirty } = useMindmapStore()

  const loadDiagramList = useCallback(async () => {
    if (!hasSupabase || !supabase || !userId) {
      setDiagrams(lsGetList())
      return
    }
    const { data, error } = await supabase
      .from('mindmaps')
      .select('id, name, type, updated_at, nodes')
      .eq('user_id', userId)
      .order('updated_at', { ascending: false })
    if (error) { console.error(error); setDiagrams(lsGetList()); return }

    // Cache all diagrams locally so minimap thumbnails are populated for every card
    if (data && data.length > 0) {
      for (const row of data) {
        if (row.nodes) lsSaveDiagram(rowToDiagram(row as Record<string, unknown>))
      }
    }

    // ── Sync: upload any local diagrams missing from Supabase ──
    const remoteIds = new Set((data ?? []).map((d: { id: string }) => d.id))
    const localList = lsGetList()
    const missing = localList
      .filter(meta => !remoteIds.has(meta.id))
      .map(meta => lsGetDiagram(meta.id))
      .filter(Boolean) as Diagram[]
    if (missing.length > 0) {
      const { error: insertErr } = await supabase.from('mindmaps').upsert(
        missing.map(d => ({
          id:              d.id,
          user_id:         userId,
          name:            d.name,
          type:            d.type,
          line_style:      d.lineStyle ?? 'orthogonal',
          sharing_enabled: d.sharingEnabled ?? false,
          theme_id:        d.themeId ?? 'default',
          nodes:           d.nodes,
        }))
      )
      if (insertErr) {
        console.error('Sync error:', insertErr)
        showToast(`Sync failed: ${insertErr.message}`, { color: '#ef4444' })
        setDiagrams(localList)
        return
      }
      showToast(`✦ ${missing.length} map${missing.length > 1 ? 's' : ''} restored`, { color: '#22c55e', confetti: true })
      const { data: fresh } = await supabase
        .from('mindmaps')
        .select('id, name, type, updated_at')
        .eq('user_id', userId)
        .order('updated_at', { ascending: false })
      setDiagrams((fresh ?? []).map((d: { id: string; name: string; type: string; updated_at: string }) => ({ id: d.id, name: d.name, type: d.type as DiagramMeta['type'], updatedAt: d.updated_at })))
      return
    }

    setDiagrams((data ?? []).map(d => ({
      id: d.id, name: d.name, type: d.type, updatedAt: d.updated_at,
    })))
  }, [setDiagrams, userId])

  const loadDiagram = useCallback(async (id: string) => {
    // 1. Try localStorage cache first (instant)
    const cached = lsGetDiagram(id)
    if (cached) {
      setActiveMindmap(cached)
      localStorage.setItem('activeMindmapId', id)
      // Still refresh from Supabase in the background if possible
    }

    if (!hasSupabase || !supabase) return

    // 2. Query Supabase — with user_id filter if authenticated, without if local/anonymous
    const query = supabase.from('mindmaps').select('*').eq('id', id)
    const { data, error } = await (userId ? query.eq('user_id', userId) : query).single()

    if (error || !data) {
      // Already loaded from cache above; if nothing found anywhere, nothing to do
      if (!cached && userId) {
        // Re-upload cache to Supabase if it got wiped
        const recached = lsGetDiagram(id)
        if (recached) {
          setActiveMindmap(recached)
          localStorage.setItem('activeMindmapId', id)
          await supabase.from('mindmaps').upsert({
            id: recached.id, user_id: userId, name: recached.name,
            type: recached.type, line_style: recached.lineStyle,
            sharing_enabled: recached.sharingEnabled ?? false,
            theme_id: recached.themeId ?? 'default', nodes: recached.nodes,
          })
        }
      }
      return
    }

    const diagram = rowToDiagram(data)
    setActiveMindmap(diagram)
    localStorage.setItem('activeMindmapId', id)
    lsSaveDiagram(diagram)
  }, [setActiveMindmap, userId])

  const saveDiagram = useCallback(async (diagram: Diagram) => {
    if (!hasSupabase || !supabase || !userId) {
      lsSaveDiagram(diagram)
      setIsDirty(false)
      return
    }
    const { error } = await supabase.from('mindmaps').upsert({
      id:              diagram.id,
      user_id:         userId,
      name:            diagram.name,
      type:            diagram.type,
      line_style:      diagram.lineStyle,
      sharing_enabled: diagram.sharingEnabled ?? false,
      theme_id:        diagram.themeId ?? 'default',
      nodes:           diagram.nodes,
    })
    if (error) {
      // On local dev without real auth, Supabase write is blocked by RLS — fall back to localStorage silently
      if (error.code === '42501') { lsSaveDiagram(diagram); setIsDirty(false); return }
      console.error('save error:', error); showToast('Failed to save', { color: '#ef4444' }); return
    }
    lsSaveDiagram(diagram) // keep localStorage cache fresh for minimap
    setIsDirty(false)
  }, [setIsDirty, userId])

  const createDiagram = useCallback(async (name: string) => {
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

    if (!hasSupabase || !supabase || !userId) {
      lsSaveDiagram(diagram)
      setActiveMindmap(diagram)
      localStorage.setItem('activeMindmapId', id)
      setDiagrams(lsGetList())
      showToast(`✦ "${name}" created`, { color: '#6366f1', confetti: true })
      return
    }
    const { error } = await supabase.from('mindmaps').insert({
      id, user_id: userId, name, type: 'logic-chart', line_style: 'orthogonal',
      sharing_enabled: false, nodes: laid,
    })
    if (error) { console.error(error); showToast('Failed to create map', { color: '#ef4444' }); return }
    await loadDiagram(id)
    await loadDiagramList()
    showToast(`✦ "${name}" created`, { color: '#6366f1', confetti: true })
  }, [loadDiagram, loadDiagramList, setActiveMindmap, setDiagrams, userId])

  const createDiagramFromNodes = useCallback(async (name: string, nodes: MindmapNode[]): Promise<string | null> => {
    const existingNames = new Set(useMindmapStore.getState().diagrams.map(d => d.name))
    let finalName = name
    let n = 2
    while (existingNames.has(finalName)) finalName = `${name} ${n++}`

    const id = crypto.randomUUID()
    const now = new Date().toISOString()
    const diagram: Diagram = { id, name: finalName, type: 'logic-chart', lineStyle: 'orthogonal', createdAt: now, updatedAt: now, nodes }

    if (!hasSupabase || !supabase || !userId) {
      lsSaveDiagram(diagram)
      setActiveMindmap(diagram)
      localStorage.setItem('activeMindmapId', id)
      setDiagrams(lsGetList())
      showToast(`✦ "${finalName}" created`, { color: '#22c55e', confetti: true })
      return id
    }
    const { error } = await supabase.from('mindmaps').insert({
      id, user_id: userId, name: finalName, type: 'logic-chart', line_style: 'orthogonal',
      sharing_enabled: false, nodes,
    })
    if (error) { console.error(error); showToast(`Failed: ${error.message}`, { color: '#ef4444' }); return null }
    await loadDiagram(id)
    await loadDiagramList()
    showToast(`✦ "${finalName}" created`, { color: '#22c55e', confetti: true })
    return id
  }, [loadDiagram, loadDiagramList, setActiveMindmap, setDiagrams, userId])

  const deleteDiagram = useCallback(async (id: string, name?: string) => {
    if (!hasSupabase || !supabase || !userId) {
      lsDeleteDiagram(id)
      setDiagrams(lsGetList())
      showToast(`"${name ?? 'Map'}" deleted`, { color: '#1a1d2e' })
      return
    }
    await supabase.from('mindmaps').delete().eq('id', id).eq('user_id', userId)
    await loadDiagramList()
    showToast(`"${name ?? 'Map'}" deleted`, { color: '#1a1d2e' })
  }, [loadDiagramList, setDiagrams, userId])

  return { loadDiagramList, loadDiagram, saveDiagram, createDiagram, createDiagramFromNodes, deleteDiagram }
}
