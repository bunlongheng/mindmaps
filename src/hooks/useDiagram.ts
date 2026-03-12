import { useCallback } from 'react'
import { supabase, hasSupabase } from '../lib/supabase'
import { useDiagramStore } from '../store/diagramStore'
import type { Diagram, DiagramMeta } from '../types'

// ── localStorage helpers ────────────────────────────────────────────────────

const LS_LIST = 'mindmap:list'
const lsKey = (id: string) => `mindmap:diagram:${id}`

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

// ── hook ────────────────────────────────────────────────────────────────────

export function useDiagram() {
  const { setActiveDiagram, setDiagrams, setIsDirty } = useDiagramStore()

  const loadDiagramList = useCallback(async () => {
    if (!hasSupabase || !supabase) {
      setDiagrams(lsGetList())
      return
    }
    const { data, error } = await supabase
      .from('mindmap_diagrams')
      .select('id, name, type, updated_at')
      .order('updated_at', { ascending: false })
    if (error) { console.error(error); setDiagrams(lsGetList()); return }
    setDiagrams((data ?? []).map(d => ({
      id: d.id, name: d.name, type: d.type, updatedAt: d.updated_at
    })))
  }, [setDiagrams])

  const loadDiagram = useCallback(async (id: string) => {
    if (!hasSupabase || !supabase) {
      const d = lsGetDiagram(id)
      if (d) { setActiveDiagram(d); localStorage.setItem('activeDiagramId', id) }
      return
    }
    const [{ data: diag, error: e1 }, { data: nodesData, error: e2 }] = await Promise.all([
      supabase.from('mindmap_diagrams').select('*').eq('id', id).single(),
      supabase.from('mindmap_nodes').select('*').eq('diagram_id', id).order('sort_order'),
    ])
    if (e1 || e2) { console.error(e1 || e2); return }
    const diagram: Diagram = {
      id: diag.id, name: diag.name, type: diag.type, lineStyle: diag.line_style,
      createdAt: diag.created_at, updatedAt: diag.updated_at,
      nodes: (nodesData ?? []).map(n => ({
        id: n.id, title: n.title, color: n.color,
        parentId: n.parent_id, depth: n.depth,
        x: n.x, y: n.y, width: n.width, height: n.height,
        sortOrder: n.sort_order,
      }))
    }
    setActiveDiagram(diagram)
    localStorage.setItem('activeDiagramId', id)
  }, [setActiveDiagram])

  const saveDiagram = useCallback(async (diagram: Diagram) => {
    if (!hasSupabase || !supabase) {
      lsSaveDiagram(diagram)
      setIsDirty(false)
      return
    }
    const { error: e1 } = await supabase.from('mindmap_diagrams').upsert({
      id: diagram.id, name: diagram.name, type: diagram.type, line_style: diagram.lineStyle,
    })
    if (e1) { console.error(e1); return }
    const nodeRows = diagram.nodes.map(n => ({
      id: n.id, diagram_id: diagram.id,
      parent_id: n.parentId, title: n.title, color: n.color,
      depth: n.depth, x: n.x, y: n.y, width: n.width, height: n.height,
      sort_order: n.sortOrder ?? 0,
    }))
    const { data: existing } = await supabase
      .from('mindmap_nodes').select('id').eq('diagram_id', diagram.id)
    const existingIds = new Set((existing ?? []).map((r: { id: string }) => r.id))
    const currentIds = new Set(diagram.nodes.map(n => n.id))
    const toDelete = [...existingIds].filter(id => !currentIds.has(id))
    if (toDelete.length > 0) await supabase.from('mindmap_nodes').delete().in('id', toDelete)
    if (nodeRows.length > 0) await supabase.from('mindmap_nodes').upsert(nodeRows)
    setIsDirty(false)
  }, [setIsDirty])

  const createDiagram = useCallback(async (name: string) => {
    const id = crypto.randomUUID()
    const rootId = crypto.randomUUID()
    const now = new Date().toISOString()
    const diagram: Diagram = {
      id, name, type: 'mindmap', lineStyle: 'curved',
      createdAt: now, updatedAt: now,
      nodes: [{
        id: rootId, title: name, color: '#6366f1',
        parentId: null, depth: 0,
        x: 420, y: 310, width: 160, height: 40, sortOrder: 0,
      }]
    }
    if (!hasSupabase || !supabase) {
      lsSaveDiagram(diagram)
      setActiveDiagram(diagram)
      localStorage.setItem('activeDiagramId', id)
      setDiagrams(lsGetList())
      return
    }
    const { error } = await supabase.from('mindmap_diagrams').insert({
      id, name, type: 'mindmap', line_style: 'curved',
    })
    if (error) { console.error(error); return }
    await supabase.from('mindmap_nodes').insert({
      id: rootId, diagram_id: id, parent_id: null,
      title: name, color: '#6366f1', depth: 0,
      x: 420, y: 310, width: 160, height: 40, sort_order: 0,
    })
    await loadDiagram(id)
    await loadDiagramList()
  }, [loadDiagram, loadDiagramList, setActiveDiagram, setDiagrams])

  const deleteDiagram = useCallback(async (id: string) => {
    if (!hasSupabase || !supabase) {
      lsDeleteDiagram(id)
      setDiagrams(lsGetList())
      return
    }
    await supabase.from('mindmap_diagrams').delete().eq('id', id)
    await loadDiagramList()
  }, [loadDiagramList, setDiagrams])

  return { loadDiagramList, loadDiagram, saveDiagram, createDiagram, deleteDiagram }
}
