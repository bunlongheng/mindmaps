import { useEffect } from 'react'
import { useMindmapStore } from '../store/mindmapStore'
import { showToast } from '../components/CuteToast'
import { exportToJSON, exportBranchesToJSON } from '../lib/export/json'

// Clipboard type for a copied branch, read back on paste so emoji and icons survive.
const BRANCH_MIME = 'application/x-mindmaps-branch'

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
    // Selected nodes whose ancestors are not also selected, so a branch copies once.
    function topSelected(): string[] {
      const { activeMindmap, selectedNodeIds } = useMindmapStore.getState()
      if (!activeMindmap) return []
      const byId = new Map(activeMindmap.nodes.map(n => [n.id, n]))
      const picked = new Set(selectedNodeIds)
      return selectedNodeIds.filter(id => {
        let p = byId.get(id)?.parentId
        while (p) { if (picked.has(p)) return false; p = byId.get(p)?.parentId }
        return byId.has(id)
      })
    }

    // Copy (and cut) a branch: JSON in our own type keeps emoji and icons for a paste
    // into any map; plain text gets the indented outline for other apps.
    function copyBranches(e: ClipboardEvent, cut: boolean) {
      if (isTextEntry(e.target)) return
      const { activeMindmap, deleteSelectedNodes } = useMindmapStore.getState()
      if (!activeMindmap) return
      e.preventDefault()
      const rootId = activeMindmap.nodes.find(n => n.parentId === null)?.id
      const ids = topSelected()
      if (!rootId && ids.length === 0) return
      if (ids.length === 0 || ids.includes(rootId!)) {
        if (cut) { showToast('The root cannot be cut', { color: '#ef4444' }); return }
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
      e.clipboardData!.setData('text/plain', ids.map(id => buildText(id, 0)).join('\n'))
      e.clipboardData!.setData(BRANCH_MIME, exportBranchesToJSON(activeMindmap.nodes, ids))
      if (cut) {
        useMindmapStore.getState().setSelectedNodeIds(ids)
        deleteSelectedNodes()
        showToast(ids.length === 1 ? 'Cut 1 branch' : `Cut ${ids.length} branches`, { color: '#1a1d2e' })
      }
    }
    const onCopy = (e: ClipboardEvent) => copyBranches(e, false)
    const onCut = (e: ClipboardEvent) => copyBranches(e, true)

    // In an open map, paste adds under the selected node (the root when none is), as
    // one undo step. Only with no map open does a paste load a whole new diagram.
    function onPaste(e: ClipboardEvent) {
      if (isTextEntry(e.target)) return
      const branch = e.clipboardData?.getData(BRANCH_MIME) ?? ''
      const text = branch || (e.clipboardData?.getData('text/plain') ?? '')
      if (!text.trim()) return
      e.preventDefault()
      const { activeMindmap, selectedNodeIds, loadFromOutline } = useMindmapStore.getState()
      if (!activeMindmap) { tryLoad(text); return }
      const targetId = selectedNodeIds[0] ?? activeMindmap.nodes.find(n => n.parentId === null)?.id
      if (!targetId) return
      const before = activeMindmap.nodes.length
      loadFromOutline(text, targetId)
      const added = (useMindmapStore.getState().activeMindmap?.nodes.length ?? before) - before
      if (added > 0) showToast(`Pasted ${added} node${added === 1 ? '' : 's'}`, { color: '#22c55e' })
    }

    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('copy', onCopy)
    window.addEventListener('cut', onCut)
    window.addEventListener('paste', onPaste)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('copy', onCopy)
      window.removeEventListener('cut', onCut)
      window.removeEventListener('paste', onPaste)
    }
  }, [])
}
