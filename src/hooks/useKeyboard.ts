import { useEffect } from 'react'
import { useDiagramStore } from '../store/diagramStore'

export function useKeyboard() {
  const { selectedNodeIds, deleteNode, undo, redo, setSelectedNodeIds } = useDiagramStore()

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement).tagName.toLowerCase()
      if (tag === 'input' || tag === 'textarea') return

      if (e.key === 'Delete' || e.key === 'Backspace') {
        selectedNodeIds.forEach(id => deleteNode(id))
        setSelectedNodeIds([])
      }
      if (e.key === 'Escape') setSelectedNodeIds([])
      if ((e.metaKey || e.ctrlKey) && e.key === 'z' && !e.shiftKey) { e.preventDefault(); undo() }
      if ((e.metaKey || e.ctrlKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) { e.preventDefault(); redo() }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [selectedNodeIds, deleteNode, undo, redo, setSelectedNodeIds])
}
