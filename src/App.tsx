import { useEffect, useRef, useState, useCallback } from 'react'
import { DiagramCanvas } from './components/canvas/DiagramCanvas'
import { DiagramSidebar } from './components/sidebar/DiagramSidebar'
import { ControlPanel } from './components/controls/ControlPanel'
import { NodeEditModal } from './components/modals/NodeEditModal'
import { ImportModal } from './components/modals/ImportModal'
import { ShareModal } from './components/modals/ShareModal'
import { useDiagram } from './hooks/useDiagram'
import { useDiagramStore } from './store/diagramStore'
import { decodeShareURL } from './lib/export/share'

export default function App() {
  const { loadDiagramList, loadDiagram, saveDiagram } = useDiagram()
  const { activeDiagram, isDirty, setActiveDiagram, addNode, selectedNodeIds } = useDiagramStore()
  const [editingNodeId, setEditingNodeId] = useState<string | null>(null)
  const [showImport, setShowImport] = useState(false)
  const [shareUrl, setShareUrl] = useState<string | null>(null)
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Load from URL ?d= param or localStorage
  useEffect(() => {
    const shared = decodeShareURL()
    if (shared) { setActiveDiagram(shared); return }
    loadDiagramList().then(() => {
      const lastId = localStorage.getItem('activeDiagramId')
      if (lastId) loadDiagram(lastId)
    })
  }, [])

  // Auto-save on isDirty
  useEffect(() => {
    if (!isDirty || !activeDiagram) return
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(() => {
      saveDiagram(activeDiagram)
    }, 1500)
    return () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current) }
  }, [isDirty, activeDiagram])

  // Tab key adds child to selected node
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement).tagName.toLowerCase()
      if (tag === 'input' || tag === 'textarea') return
      if (e.key === 'Tab') {
        e.preventDefault()
        const parentId = selectedNodeIds[0] ?? activeDiagram?.nodes.find(n => n.parentId === null)?.id ?? null
        if (parentId || activeDiagram?.nodes.length === 0) addNode(parentId)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [selectedNodeIds, activeDiagram, addNode])

  const handleSave = useCallback(() => {
    if (activeDiagram) saveDiagram(activeDiagram)
  }, [activeDiagram, saveDiagram])

  return (
    <div className="flex h-screen w-screen overflow-hidden">
      <DiagramSidebar onSave={handleSave} />

      <div className="flex-1 relative overflow-hidden">
        <ControlPanel
          onAddNode={() => {
            const parentId = selectedNodeIds[0] ?? activeDiagram?.nodes.find(n => n.parentId === null)?.id ?? null
            addNode(parentId)
          }}
          onImport={() => setShowImport(true)}
          onShare={url => setShareUrl(url)}
        />
        <DiagramCanvas onEditNode={setEditingNodeId} />
      </div>

      {editingNodeId && <NodeEditModal nodeId={editingNodeId} onClose={() => setEditingNodeId(null)} />}
      {showImport && <ImportModal onClose={() => setShowImport(false)} />}
      {shareUrl && <ShareModal url={shareUrl} onClose={() => setShareUrl(null)} />}
    </div>
  )
}
