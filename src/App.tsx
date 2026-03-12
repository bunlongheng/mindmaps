import { useEffect, useRef, useState, useCallback } from 'react'
import { DiagramCanvas } from './components/canvas/DiagramCanvas'
import { ControlPanel } from './components/controls/ControlPanel'
import { NodeStylePanel } from './components/panels/NodeStylePanel'
import { ImportModal } from './components/modals/ImportModal'
import { ShareModal } from './components/modals/ShareModal'
import { HomePage } from './components/home/HomePage'
import { useDiagram } from './hooks/useDiagram'
import { useDiagramStore } from './store/diagramStore'
import { decodeShareURL } from './lib/export/share'

type View = 'home' | 'editor'

export default function App() {
  const { loadDiagramList, loadDiagram, saveDiagram } = useDiagram()
  const { activeDiagram, isDirty, setActiveDiagram, addNode, selectedNodeIds, setSelectedNodeIds } = useDiagramStore()
  const [view, setView] = useState<View>('home')
  const [selectedPanelNodeId, setSelectedPanelNodeId] = useState<string | null>(null)
  const [showImport, setShowImport] = useState(false)
  const [shareUrl, setShareUrl] = useState<string | null>(null)
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    const shared = decodeShareURL()
    if (shared) { setActiveDiagram(shared); setView('editor'); return }
    loadDiagramList()
    const lastId = localStorage.getItem('activeDiagramId')
    if (lastId) {
      loadDiagram(lastId).then(() => setView('editor'))
    }
  }, [])

  useEffect(() => {
    if (!isDirty || !activeDiagram) return
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(() => saveDiagram(activeDiagram), 1500)
    return () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current) }
  }, [isDirty, activeDiagram])

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement).tagName.toLowerCase()
      if (tag === 'input' || tag === 'textarea') return
      if (e.key === 'Tab' && view === 'editor') {
        e.preventDefault()
        const parentId = selectedNodeIds[0] ?? activeDiagram?.nodes.find(n => n.parentId === null)?.id ?? null
        if (parentId) addNode(parentId)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [selectedNodeIds, activeDiagram, addNode, view])

  const handleOpenDiagram = useCallback(async (id: string) => {
    await loadDiagram(id)
    setView('editor')
  }, [loadDiagram])

  const handleBack = useCallback(() => {
    setSelectedPanelNodeId(null)
    setSelectedNodeIds([])
    setView('home')
    loadDiagramList()
  }, [setSelectedNodeIds, loadDiagramList])

  const handleNodeSelect = useCallback((nodeId: string | null) => {
    setSelectedPanelNodeId(nodeId)
  }, [])

  if (view === 'home') {
    return <HomePage onOpen={handleOpenDiagram} />
  }

  return (
    <div style={{ display: 'flex', height: '100vh', width: '100vw', overflow: 'hidden', fontFamily: 'Inter, system-ui, sans-serif' }}>
      {/* Canvas area */}
      <div style={{ flex: 1, position: 'relative', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        <ControlPanel
          onAddNode={() => {
            const parentId = selectedNodeIds[0] ?? activeDiagram?.nodes.find(n => n.parentId === null)?.id ?? null
            addNode(parentId)
          }}
          onImport={() => setShowImport(true)}
          onShare={url => setShareUrl(url)}
          onBack={handleBack}
        />
        <DiagramCanvas onNodeSelect={handleNodeSelect} />
      </div>

      {/* Right style panel */}
      {selectedPanelNodeId && (
        <NodeStylePanel
          nodeId={selectedPanelNodeId}
          onClose={() => { setSelectedPanelNodeId(null); setSelectedNodeIds([]) }}
        />
      )}

      {showImport && <ImportModal onClose={() => setShowImport(false)} />}
      {shareUrl && <ShareModal url={shareUrl} onClose={() => setShareUrl(null)} />}
    </div>
  )
}
