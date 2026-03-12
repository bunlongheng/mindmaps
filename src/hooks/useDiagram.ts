import { useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useDiagramStore } from '../store/diagramStore'
import type { Diagram } from '../types'

export function useDiagram() {
  const { setActiveDiagram, setDiagrams, setIsDirty } = useDiagramStore()

  const loadDiagramList = useCallback(async () => {
    const { data, error } = await supabase
      .from('mindmap_diagrams')
      .select('id, name, type, updated_at')
      .order('updated_at', { ascending: false })
    if (error) { console.error(error); return }
    setDiagrams((data ?? []).map(d => ({
      id: d.id, name: d.name, type: d.type, updatedAt: d.updated_at
    })))
  }, [setDiagrams])

  const loadDiagram = useCallback(async (id: string) => {
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

    // Delete removed nodes then upsert current ones
    const { data: existing } = await supabase
      .from('mindmap_nodes').select('id').eq('diagram_id', diagram.id)
    const existingIds = new Set((existing ?? []).map(r => r.id))
    const currentIds = new Set(diagram.nodes.map(n => n.id))
    const toDelete = [...existingIds].filter(id => !currentIds.has(id))
    if (toDelete.length > 0) {
      await supabase.from('mindmap_nodes').delete().in('id', toDelete)
    }
    if (nodeRows.length > 0) {
      await supabase.from('mindmap_nodes').upsert(nodeRows)
    }
    setIsDirty(false)
  }, [setIsDirty])

  const createDiagram = useCallback(async (name: string) => {
    const id = crypto.randomUUID()
    const rootId = crypto.randomUUID()
    const { error } = await supabase.from('mindmap_diagrams').insert({
      id, name, type: 'mindmap', line_style: 'curved',
    })
    if (error) { console.error(error); return }
    const rootNode = {
      id: rootId, diagram_id: id, parent_id: null,
      title: name, color: '#6366f1', depth: 0,
      x: 420, y: 310, width: 160, height: 40, sort_order: 0,
    }
    await supabase.from('mindmap_nodes').insert(rootNode)
    await loadDiagram(id)
    await loadDiagramList()
  }, [loadDiagram, loadDiagramList])

  const deleteDiagram = useCallback(async (id: string) => {
    await supabase.from('mindmap_diagrams').delete().eq('id', id)
    await loadDiagramList()
  }, [loadDiagramList])

  return { loadDiagramList, loadDiagram, saveDiagram, createDiagram, deleteDiagram }
}
