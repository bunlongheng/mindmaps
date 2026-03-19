import { useCallback } from 'react'
import { showToast } from '../components/CuteToast'
import { supabase, hasSupabase } from '../lib/supabase'
import { useIdeaStore } from '../store/ideaStore'
import { ROOT_COLORS } from '../lib/color'
import type { Diagram, DiagramMeta, IdeaNode } from '../types'

// ── localStorage helpers ────────────────────────────────────────────────────

const LS_LIST = 'ideas:list'
const lsKey = (id: string) => `ideas:diagram:${id}`

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
  const nodes: IdeaNode[] = rawNodes.map(n => ({
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
    nodes,
  }
}

// ── hook ────────────────────────────────────────────────────────────────────

export function useDiagram(userId: string | null = null) {
  const { setActiveIdea, setDiagrams, setIsDirty } = useIdeaStore()

  const loadDiagramList = useCallback(async () => {
    if (!hasSupabase || !supabase || !userId) {
      setDiagrams(lsGetList())
      return
    }
    const { data, error } = await supabase
      .from('ideas')
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

    // ── One-time migration: if Supabase is empty, upload from localStorage ──
    if ((data ?? []).length === 0) {
      const localList = lsGetList()
      if (localList.length > 0) {
        const rows = localList
          .map(meta => lsGetDiagram(meta.id))
          .filter(Boolean) as Diagram[]
        if (rows.length > 0) {
          const { error: insertErr } = await supabase.from('ideas').insert(
            rows.map(d => ({
              id:              d.id,
              user_id:         userId,
              name:            d.name,
              type:            d.type,
              line_style:      d.lineStyle ?? 'orthogonal',
              sharing_enabled: d.sharingEnabled ?? false,
              nodes:           d.nodes,
            }))
          )
          if (insertErr) {
            console.error('Migration error:', insertErr)
            showToast(`Sync failed: ${insertErr.message}`, { color: '#ef4444' })
            // Still show local maps so user isn't blocked
            setDiagrams(localList)
            return
          }
          showToast(`✦ ${rows.length} map${rows.length > 1 ? 's' : ''} synced to cloud`, { color: '#22c55e', confetti: true })
          const { data: fresh } = await supabase
            .from('ideas')
            .select('id, name, type, updated_at')
            .eq('user_id', userId)
            .order('updated_at', { ascending: false })
          setDiagrams((fresh ?? []).map(d => ({ id: d.id, name: d.name, type: d.type, updatedAt: d.updated_at })))
          return
        } else {
          // localList has entries but no full diagram data — show them anyway
          setDiagrams(localList)
          return
        }
      }
    }

    setDiagrams((data ?? []).map(d => ({
      id: d.id, name: d.name, type: d.type, updatedAt: d.updated_at,
    })))
  }, [setDiagrams, userId])

  const loadDiagram = useCallback(async (id: string) => {
    if (!hasSupabase || !supabase || !userId) {
      const d = lsGetDiagram(id)
      if (d) { setActiveIdea(d); localStorage.setItem('activeIdeaId', id) }
      return
    }
    const { data, error } = await supabase
      .from('ideas')
      .select('*')
      .eq('id', id)
      .eq('user_id', userId)
      .single()
    if (error) { console.error(error); return }
    const diagram = rowToDiagram(data)
    setActiveIdea(diagram)
    localStorage.setItem('activeIdeaId', id)
    lsSaveDiagram(diagram) // cache for minimap
  }, [setActiveIdea, userId])

  const saveDiagram = useCallback(async (diagram: Diagram) => {
    if (!hasSupabase || !supabase || !userId) {
      lsSaveDiagram(diagram)
      setIsDirty(false)
      return
    }
    const { error } = await supabase.from('ideas').upsert({
      id:              diagram.id,
      user_id:         userId,
      name:            diagram.name,
      type:            diagram.type,
      line_style:      diagram.lineStyle,
      sharing_enabled: diagram.sharingEnabled ?? false,
      nodes:           diagram.nodes,
    })
    if (error) { console.error('save error:', error); showToast('Failed to save', { color: '#ef4444' }); return }
    lsSaveDiagram(diagram) // keep localStorage cache fresh for minimap
    setIsDirty(false)
  }, [setIsDirty, userId])

  const createDiagram = useCallback(async (name: string) => {
    const id = crypto.randomUUID()
    const rootId = crypto.randomUUID()
    const now = new Date().toISOString()
    const TOPIC_LABELS = ['Main Topic 1', 'Main Topic 2', 'Main Topic 3', 'Main Topic 4', 'Main Topic 5']
    const topicNodes: IdeaNode[] = TOPIC_LABELS.map((title, i) => ({
      id: crypto.randomUUID(), title,
      color: ROOT_COLORS[i % ROOT_COLORS.length],
      parentId: rootId, depth: 1,
      x: 0, y: 0, width: 160, height: 40, sortOrder: i,
    }))
    const allNodes: IdeaNode[] = [
      { id: rootId, title: name, color: '#6366f1', parentId: null, depth: 0, x: 0, y: 0, width: 140, height: 140, sortOrder: 0 },
      ...topicNodes,
    ]
    const { computeIdeasLayout } = await import('../lib/layout/ideas')
    const laid = computeIdeasLayout(allNodes)
    const diagram: Diagram = { id, name, type: 'logic-chart', lineStyle: 'orthogonal', createdAt: now, updatedAt: now, nodes: laid }

    if (!hasSupabase || !supabase || !userId) {
      lsSaveDiagram(diagram)
      setActiveIdea(diagram)
      localStorage.setItem('activeIdeaId', id)
      setDiagrams(lsGetList())
      showToast(`✦ "${name}" created`, { color: '#6366f1', confetti: true })
      return
    }
    const { error } = await supabase.from('ideas').insert({
      id, user_id: userId, name, type: 'logic-chart', line_style: 'orthogonal',
      sharing_enabled: false, nodes: laid,
    })
    if (error) { console.error(error); showToast('Failed to create map', { color: '#ef4444' }); return }
    await loadDiagram(id)
    await loadDiagramList()
    showToast(`✦ "${name}" created`, { color: '#6366f1', confetti: true })
  }, [loadDiagram, loadDiagramList, setActiveIdea, setDiagrams, userId])

  const createDiagramFromNodes = useCallback(async (name: string, nodes: IdeaNode[]): Promise<string | null> => {
    const existingNames = new Set(useIdeaStore.getState().diagrams.map(d => d.name))
    let finalName = name
    let n = 2
    while (existingNames.has(finalName)) finalName = `${name} ${n++}`

    const id = crypto.randomUUID()
    const now = new Date().toISOString()
    const diagram: Diagram = { id, name: finalName, type: 'logic-chart', lineStyle: 'orthogonal', createdAt: now, updatedAt: now, nodes }

    if (!hasSupabase || !supabase || !userId) {
      lsSaveDiagram(diagram)
      setActiveIdea(diagram)
      localStorage.setItem('activeIdeaId', id)
      setDiagrams(lsGetList())
      showToast(`✦ "${finalName}" created`, { color: '#22c55e', confetti: true })
      return id
    }
    const { error } = await supabase.from('ideas').insert({
      id, user_id: userId, name: finalName, type: 'logic-chart', line_style: 'orthogonal',
      sharing_enabled: false, nodes,
    })
    if (error) { console.error(error); showToast(`Failed: ${error.message}`, { color: '#ef4444' }); return null }
    await loadDiagram(id)
    await loadDiagramList()
    showToast(`✦ "${finalName}" created`, { color: '#22c55e', confetti: true })
    return id
  }, [loadDiagram, loadDiagramList, setActiveIdea, setDiagrams, userId])

  const deleteDiagram = useCallback(async (id: string, name?: string) => {
    if (!hasSupabase || !supabase || !userId) {
      lsDeleteDiagram(id)
      setDiagrams(lsGetList())
      showToast(`"${name ?? 'Map'}" deleted`, { color: '#1a1d2e' })
      return
    }
    await supabase.from('ideas').delete().eq('id', id).eq('user_id', userId)
    await loadDiagramList()
    showToast(`"${name ?? 'Map'}" deleted`, { color: '#1a1d2e' })
  }, [loadDiagramList, setDiagrams, userId])

  return { loadDiagramList, loadDiagram, saveDiagram, createDiagram, createDiagramFromNodes, deleteDiagram }
}
