import { useEffect } from 'react'
import { useIdeaStore } from '../store/ideaStore'
import { showToast } from '../components/CuteToast'

export function useKeyboard() {
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement).tagName.toLowerCase()
      if (tag === 'input' || tag === 'textarea') return

      const { deleteSelectedNodes, dissolveNode, dissolveSelectedNodes, setSelectedNodeIds, undo, redo, activeIdea, selectedNodeIds } = useIdeaStore.getState()

      if ((e.metaKey || e.ctrlKey) && !e.shiftKey && e.key === 'v') {
        navigator.clipboard.readText().then(text => {
          const trimmed = text.trim()
          const isJson = trimmed.startsWith('{') || trimmed.startsWith('[')
          const lines = text.split('\n').filter(l => l.trim())
          const hasIndent = lines.some(l => /^(\s{4}|\t)/.test(l))
          if (isJson || (lines.length >= 2 && hasIndent)) {
            useIdeaStore.getState().loadFromOutline(text)
            showToast(`Loaded diagram`, { color: '#22c55e', confetti: true })
          }
        })
        return
      }

      if ((e.metaKey || e.ctrlKey) && e.key === 'c') {
        if (!activeIdea) return
        const startId = selectedNodeIds.length > 0 ? selectedNodeIds[0] : activeIdea.nodes.find(n => n.parentId === null)?.id
        if (!startId) return
        function buildText(nodeId: string, indent: number): string {
          const node = activeIdea!.nodes.find(n => n.id === nodeId)
          if (!node) return ''
          const children = activeIdea!.nodes
            .filter(n => n.parentId === nodeId)
            .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
          return ['    '.repeat(indent) + node.title, ...children.map(c => buildText(c.id, indent + 1))].join('\n')
        }
        navigator.clipboard.writeText(buildText(startId, 0))
        return
      }

      if ((e.metaKey || e.ctrlKey) && e.key === 'a') {
        e.preventDefault()
        if (activeIdea) setSelectedNodeIds(activeIdea.nodes.map(n => n.id))
        return
      }
      if ((e.metaKey || e.ctrlKey) && (e.key === 'Delete' || e.key === 'Backspace')) {
        // Always dissolve: remove node(s) but keep children re-parented up
        if (selectedNodeIds.length === 1) dissolveNode(selectedNodeIds[0])
        else if (selectedNodeIds.length > 1) dissolveSelectedNodes()
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
