import { useEffect } from 'react'
import { useMindmapStore } from '../store/mindmapStore'
import { showToast } from '../components/CuteToast'
import { exportToJSON } from '../lib/export/json'

export function useKeyboard() {
  useEffect(() => {
    function tryLoad(text: string) {
      const trimmed = text.trim()
      if (!trimmed) return
      const isJson = trimmed.startsWith('{') || trimmed.startsWith('[')
      const lines = text.split('\n').filter(l => l.trim())
      const hasIndent = lines.some(l => /^(\s{4}|\t)/.test(l))
      if (isJson || (lines.length >= 2 && hasIndent)) {
        useMindmapStore.getState().loadFromOutline(text)
        showToast('Loaded diagram', { color: '#22c55e', confetti: true })
      } else {
        showToast('Incompatible format — paste JSON or indented outline', { color: '#ef4444', duration: 3000 })
      }
    }

    function onKeyDown(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement).tagName.toLowerCase()
      if (tag === 'input' || tag === 'textarea') return

      const { deleteSelectedNodes, dissolveNode, dissolveSelectedNodes, setSelectedNodeIds, undo, redo, activeMindmap, selectedNodeIds } = useMindmapStore.getState()

      if ((e.metaKey || e.ctrlKey) && !e.shiftKey && e.key === 'v') {
        navigator.clipboard?.readText().then(tryLoad).catch(() => {})
        return
      }

      if ((e.metaKey || e.ctrlKey) && e.key === 'a') {
        e.preventDefault()
        if (activeMindmap) setSelectedNodeIds(activeMindmap.nodes.map(n => n.id))
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
    function onCopy(e: ClipboardEvent) {
      const tag = (e.target as HTMLElement).tagName.toLowerCase()
      if (tag === 'input' || tag === 'textarea') return
      const { activeMindmap, selectedNodeIds } = useMindmapStore.getState()
      if (!activeMindmap) return
      e.preventDefault()
      const rootId = activeMindmap.nodes.find(n => n.parentId === null)?.id
      const startId = selectedNodeIds.length > 0 ? selectedNodeIds[0] : rootId
      if (!startId) return
      if (startId === rootId) {
        e.clipboardData!.setData('text/plain', exportToJSON(activeMindmap))
        showToast('Copied JSON', { color: '#6366f1' })
        return
      }
      function buildText(nodeId: string, indent: number): string {
        const node = activeMindmap!.nodes.find(n => n.id === nodeId)
        if (!node) return ''
        const children = activeMindmap!.nodes
          .filter(n => n.parentId === nodeId)
          .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
        return ['    '.repeat(indent) + node.title, ...children.map(c => buildText(c.id, indent + 1))].join('\n')
      }
      e.clipboardData!.setData('text/plain', buildText(startId, 0))
    }

    function onPaste(e: ClipboardEvent) {
      const tag = (e.target as HTMLElement).tagName.toLowerCase()
      if (tag === 'input' || tag === 'textarea') return
      const text = e.clipboardData?.getData('text/plain') ?? ''
      if (text.trim()) { e.preventDefault(); tryLoad(text) }
    }

    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('copy', onCopy)
    window.addEventListener('paste', onPaste)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('copy', onCopy)
      window.removeEventListener('paste', onPaste)
    }
  }, [])
}
