import { useEffect } from 'react'
import { useDiagramStore } from '../store/diagramStore'
import { showToast } from '../components/CuteToast'

export function useKeyboard() {
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement).tagName.toLowerCase()
      if (tag === 'input' || tag === 'textarea') return

      const { deleteSelectedNodes, setSelectedNodeIds, undo, redo, activeDiagram, selectedNodeIds } = useDiagramStore.getState()

      if ((e.metaKey || e.ctrlKey) && e.key === 'v') {
        navigator.clipboard.readText().then(text => {
          const lines = text.split('\n').filter(l => l.trim())
          const hasIndent = lines.some(l => /^(\s{4}|\t)/.test(l))
          if (lines.length >= 2 && hasIndent) {
            useDiagramStore.getState().loadFromOutline(text)
            showToast(`Loaded ${lines.length} nodes`, { color: '#22c55e', confetti: true })
          }
        })
        return
      }

      if ((e.metaKey || e.ctrlKey) && e.key === 'c') {
        if (!activeDiagram) return
        const startId = selectedNodeIds.length > 0 ? selectedNodeIds[0] : activeDiagram.nodes.find(n => n.parentId === null)?.id
        if (!startId) return
        function buildText(nodeId: string, indent: number): string {
          const node = activeDiagram!.nodes.find(n => n.id === nodeId)
          if (!node) return ''
          const children = activeDiagram!.nodes
            .filter(n => n.parentId === nodeId)
            .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
          return ['    '.repeat(indent) + node.title, ...children.map(c => buildText(c.id, indent + 1))].join('\n')
        }
        navigator.clipboard.writeText(buildText(startId, 0))
        return
      }

      if ((e.metaKey || e.ctrlKey) && e.key === 'a') {
        e.preventDefault()
        if (activeDiagram) setSelectedNodeIds(activeDiagram.nodes.map(n => n.id))
        return
      }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        deleteSelectedNodes()
      }
      if (e.key === 'Escape') setSelectedNodeIds([])
      if ((e.metaKey || e.ctrlKey) && e.key === 'z' && !e.shiftKey) { e.preventDefault(); undo() }
      if ((e.metaKey || e.ctrlKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) { e.preventDefault(); redo() }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])
}
