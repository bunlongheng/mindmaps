import { useEffect } from 'react'
import { useDiagramStore } from '../store/diagramStore'

export function useKeyboard() {
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement).tagName.toLowerCase()
      if (tag === 'input' || tag === 'textarea') return

      const { deleteSelectedNodes, setSelectedNodeIds, undo, redo, activeDiagram } = useDiagramStore.getState()
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
