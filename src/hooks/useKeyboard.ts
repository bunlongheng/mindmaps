import { useEffect } from 'react'
import { useMindmapStore } from '../store/mindmapStore'
import { showToast } from '../components/CuteToast'
import { exportToJSON } from '../lib/export/json'

// Input types that hold no text: the browser has no undo stack of its own for them,
// so map shortcuts (Cmd+Z included) must keep working while one has focus.
const NON_TEXT_INPUTS = new Set([
  'range', 'checkbox', 'radio', 'button', 'submit', 'reset', 'color', 'file', 'image',
])

/**
 * True only where the user is typing: a text input (the inline node editor included),
 * a textarea, or a contenteditable. There the browser's own undo wins.
 */
function isTextEntry(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null
  if (!el || !el.tagName) return false
  if (el.isContentEditable) return true
  const tag = el.tagName.toLowerCase()
  if (tag === 'textarea') return true
  if (tag === 'input') return !NON_TEXT_INPUTS.has(((el as HTMLInputElement).type || 'text').toLowerCase())
  return false
}

export function useKeyboard() {
  useEffect(() => {
    function tryLoad(text: string) {
      const trimmed = text.trim()
      if (!trimmed) return
      const isJson = trimmed.startsWith('{') || trimmed.startsWith('[')
      const lines = text.split('\n').filter(l => l.trim())
      const hasIndent = lines.some(l => /^[ \t]+/.test(l))
      if (isJson || (lines.length >= 2 && hasIndent)) {
        useMindmapStore.getState().loadFromOutline(text)
        showToast('Loaded diagram', { color: '#22c55e', confetti: true })
      } else {
        showToast('Incompatible format — paste JSON or indented outline', { color: '#ef4444', duration: 3000 })
      }
    }

    function onKeyDown(e: KeyboardEvent) {
      if (isTextEntry(e.target)) return

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
      if (isTextEntry(e.target)) return
      const { activeMindmap, selectedNodeIds } = useMindmapStore.getState()
      if (!activeMindmap) return
      e.preventDefault()
      const rootId = activeMindmap.nodes.find(n => n.parentId === null)?.id
      const startId = selectedNodeIds.length > 0 ? selectedNodeIds[0] : rootId
      if (!startId) return
      if (startId === rootId) {
        e.clipboardData!.setData('text/plain', exportToJSON(activeMindmap))
        showToast('Copied JSON', { color: '#1a1d2e' })
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
      if (isTextEntry(e.target)) return
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
