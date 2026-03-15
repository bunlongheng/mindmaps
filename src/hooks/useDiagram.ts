import { useCallback } from 'react'
import { showToast } from '../components/CuteToast'
import { supabase, hasSupabase } from '../lib/supabase'
import { useDiagramStore } from '../store/diagramStore'
import { ROOT_COLORS } from '../lib/color'
import type { Diagram, DiagramMeta, MindNode } from '../types'

// ── localStorage helpers ────────────────────────────────────────────────────

const LS_LIST = 'ideas:list'
const lsKey = (id: string) => `ideas:diagram:${id}`

function lsGetList(): DiagramMeta[] {
  try { return JSON.parse(localStorage.getItem(LS_LIST) ?? '[]') } catch { return [] }
}
function lsSaveList(list: DiagramMeta[]) {
  localStorage.setItem(LS_LIST, JSON.stringify(list))
}
function lsGetDiagram(id: string): Diagram | null {
  try { return JSON.parse(localStorage.getItem(lsKey(id)) ?? 'null') } catch { return null }
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
  const nodes: MindNode[] = rawNodes.map(n => ({
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
    manuallyPositioned: (n.manuallyPositioned ?? false) as boolean,
    fontSize:           (n.fontSize && n.fontSize !== 13) ? n.fontSize as number : undefined,
    bold:               (n.bold ?? undefined) as boolean | undefined,
    italic:             (n.italic ?? undefined) as boolean | undefined,
    textAlign:          (n.textAlign ?? undefined) as string | undefined,
    borderColor:        (n.borderColor ?? undefined) as string | undefined,
    borderWidth:        (n.borderWidth ?? undefined) as number | undefined,
    icon:               (n.icon ?? undefined) as string | undefined,
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

export function useDiagram() {
  const { setActiveDiagram, setDiagrams, setIsDirty } = useDiagramStore()

  const loadDiagramList = useCallback(async () => {
    if (!hasSupabase || !supabase) {
      setDiagrams(lsGetList())
      return
    }
    const { data, error } = await supabase
      .from('ideas')
      .select('id, name, type, updated_at')
      .order('updated_at', { ascending: false })
    if (error) { console.error(error); setDiagrams(lsGetList()); return }
    setDiagrams((data ?? []).map(d => ({
      id: d.id, name: d.name, type: d.type, updatedAt: d.updated_at,
    })))
  }, [setDiagrams])

  const loadDiagram = useCallback(async (id: string) => {
    if (!hasSupabase || !supabase) {
      const d = lsGetDiagram(id)
      if (d) { setActiveDiagram(d); localStorage.setItem('activeDiagramId', id) }
      return
    }
    const { data, error } = await supabase
      .from('ideas')
      .select('*')
      .eq('id', id)
      .single()
    if (error) { console.error(error); return }
    setActiveDiagram(rowToDiagram(data))
    localStorage.setItem('activeDiagramId', id)
  }, [setActiveDiagram])

  const saveDiagram = useCallback(async (diagram: Diagram) => {
    if (!hasSupabase || !supabase) {
      lsSaveDiagram(diagram)
      setIsDirty(false)
      return
    }
    const { error } = await supabase.from('ideas').upsert({
      id:              diagram.id,
      name:            diagram.name,
      type:            diagram.type,
      line_style:      diagram.lineStyle,
      sharing_enabled: diagram.sharingEnabled ?? false,
      nodes:           diagram.nodes,
    })
    if (error) { console.error('save error:', error); showToast('Failed to save', { color: '#ef4444' }); return }
    setIsDirty(false)
  }, [setIsDirty])

  const createDiagram = useCallback(async (name: string) => {
    const id = crypto.randomUUID()
    const rootId = crypto.randomUUID()
    const now = new Date().toISOString()
    const TOPIC_LABELS = ['Main Topic 1', 'Main Topic 2', 'Main Topic 3', 'Main Topic 4', 'Main Topic 5']
    const topicNodes: MindNode[] = TOPIC_LABELS.map((title, i) => ({
      id: crypto.randomUUID(), title,
      color: ROOT_COLORS[i % ROOT_COLORS.length],
      parentId: rootId, depth: 1,
      x: 0, y: 0, width: 160, height: 40, sortOrder: i,
    }))
    const allNodes: MindNode[] = [
      { id: rootId, title: name, color: '#6366f1', parentId: null, depth: 0, x: 0, y: 0, width: 140, height: 140, sortOrder: 0 },
      ...topicNodes,
    ]
    const { computeMindmapLayout } = await import('../lib/layout/mindmap')
    const laid = computeMindmapLayout(allNodes)
    const diagram: Diagram = { id, name, type: 'mindmap', lineStyle: 'orthogonal', createdAt: now, updatedAt: now, nodes: laid }

    if (!hasSupabase || !supabase) {
      lsSaveDiagram(diagram)
      setActiveDiagram(diagram)
      localStorage.setItem('activeDiagramId', id)
      setDiagrams(lsGetList())
      showToast(`✦ "${name}" created`, { color: '#6366f1', confetti: true })
      return
    }
    const { error } = await supabase.from('ideas').insert({
      id, name, type: 'mindmap', line_style: 'orthogonal',
      sharing_enabled: false, nodes: laid,
    })
    if (error) { console.error(error); showToast('Failed to create map', { color: '#ef4444' }); return }
    await loadDiagram(id)
    await loadDiagramList()
    showToast(`✦ "${name}" created`, { color: '#6366f1', confetti: true })
  }, [loadDiagram, loadDiagramList, setActiveDiagram, setDiagrams])

  const deleteDiagram = useCallback(async (id: string, name?: string) => {
    if (!hasSupabase || !supabase) {
      lsDeleteDiagram(id)
      setDiagrams(lsGetList())
      showToast(`"${name ?? 'Map'}" deleted`, { color: '#1a1d2e' })
      return
    }
    await supabase.from('ideas').delete().eq('id', id)
    await loadDiagramList()
    showToast(`"${name ?? 'Map'}" deleted`, { color: '#1a1d2e' })
  }, [loadDiagramList, setDiagrams])

  return { loadDiagramList, loadDiagram, saveDiagram, createDiagram, deleteDiagram }
}
