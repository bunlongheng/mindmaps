import { useEffect, useRef, useState, useCallback } from 'react'
import { CuteToast } from './components/CuteToast'
import { DiagramCanvas } from './components/canvas/DiagramCanvas'
import { SidePanel } from './components/panels/SidePanel'
import { ImportModal } from './components/modals/ImportModal'
import { HomePage } from './components/home/HomePage'
import { useDiagram } from './hooks/useDiagram'
import { useIdeaStore } from './store/ideaStore'
import { decodeShareURL } from './lib/export/share'
import { ArrowLeft, SlidersHorizontal } from 'lucide-react'

type View = 'home' | 'editor' | 'viewer'

export default function App() {
  const { loadDiagramList, loadDiagram, saveDiagram, createDiagramFromNodes } = useDiagram()
  const { activeIdea, isDirty, setActiveIdea, addNode, selectedNodeIds, setSelectedNodeIds, setPasteImportFn } = useIdeaStore()
  const [view, setView] = useState<View>(() => {
    if (decodeShareURL()) return 'viewer'
    const params = new URLSearchParams(window.location.search)
    if (params.get('map') || localStorage.getItem('activeIdeaId')) return 'editor'
    return 'home'
  })
  const [selectedPanelNodeId, setSelectedPanelNodeId] = useState<string | null>(null)
  const [showPanel, setShowPanel] = useState(false)
  const [showImport, setShowImport] = useState(false)
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    const shared = decodeShareURL()
    if (shared) { setActiveIdea(shared); return }
    const params = new URLSearchParams(window.location.search)
    const mapId = params.get('map') || localStorage.getItem('activeIdeaId')
    if (mapId) {
      loadDiagram(mapId)
    } else {
      loadDiagramList()
    }
  }, [])

  useEffect(() => {
    setPasteImportFn(async (name, nodes) => {
      const id = await createDiagramFromNodes(name, nodes)
      if (id) {
        setView('editor')
        window.history.pushState({}, '', `?map=${id}`)
      }
    })
    return () => setPasteImportFn(null)
  }, [createDiagramFromNodes, setPasteImportFn])

  useEffect(() => {
    if (!isDirty || !activeIdea) return
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(() => saveDiagram(activeIdea), 1500)
    return () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current) }
  }, [isDirty, activeIdea])

  // Block macOS swipe-back/forward gesture in editor
  useEffect(() => {
    if (view !== 'editor') return
    function onWheel(e: WheelEvent) { e.preventDefault() }
    document.addEventListener('wheel', onWheel, { passive: false })
    return () => document.removeEventListener('wheel', onWheel)
  }, [view])

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement).tagName.toLowerCase()
      if (tag === 'input' || tag === 'textarea') return
      if (e.key === 'Tab' && view === 'editor') {
        e.preventDefault()
        const parentId = selectedNodeIds[0] ?? activeIdea?.nodes.find(n => n.parentId === null)?.id ?? null
        if (parentId) {
          const newNode = addNode(parentId)
          setSelectedNodeIds([newNode.id])
          setSelectedPanelNodeId(newNode.id)
        }
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [selectedNodeIds, activeIdea, addNode, view])

  const handleOpenDiagram = useCallback(async (id: string) => {
    setShowPanel(false); setSelectedPanelNodeId(null)
    await loadDiagram(id)
    setView('editor')
    window.history.pushState({}, '', `?map=${id}`)
  }, [loadDiagram])

  const handleBack = useCallback(() => {
    setShowPanel(false); setSelectedPanelNodeId(null); setSelectedNodeIds([])
    loadDiagramList()
    setView('home')
    window.history.pushState({}, '', window.location.pathname)
  }, [setSelectedNodeIds, loadDiagramList])

  const handleNodeSelect = useCallback((nodeId: string | null) => {
    if (nodeId) setSelectedPanelNodeId(nodeId)
  }, [])

  if (view === 'home') return (
    <>
      <CuteToast />
      <HomePage onOpen={handleOpenDiagram} />
    </>
  )

  if (view === 'viewer') return (
    <div style={{ display: 'flex', height: '100vh', width: '100vw', overflow: 'hidden', fontFamily: 'Inter, system-ui, sans-serif' }}>
      <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
        <DiagramCanvas onNodeSelect={() => {}} readOnly />
        <div style={{
          position: 'fixed', top: 14, left: '50%', transform: 'translateX(-50%)',
          background: '#1a1d2e', color: '#fff', fontSize: 11, fontWeight: 600,
          padding: '5px 12px', borderRadius: 20, letterSpacing: '0.04em', zIndex: 20,
          pointerEvents: 'none',
        }}>
          VIEW ONLY
        </div>
      </div>
    </div>
  )

  return (
    <div style={{ display: 'flex', height: '100vh', width: '100vw', overflow: 'hidden', fontFamily: 'Inter, system-ui, sans-serif' }}>
      <CuteToast />
      {/* Canvas */}
      <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
        <DiagramCanvas onNodeSelect={handleNodeSelect} />

        {/* Floating back button — top left */}
        <button
          onClick={handleBack}
          title="All maps"
          style={{
            position: 'fixed', top: 14, left: 14, zIndex: 20,
            width: 36, height: 36, borderRadius: 10,
            background: '#fff', border: '1px solid #e2e8f0',
            boxShadow: '0 2px 10px rgba(0,0,0,0.07)',
            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#475569',
          }}
          onMouseEnter={e => (e.currentTarget.style.background = '#f8fafc')}
          onMouseLeave={e => (e.currentTarget.style.background = '#fff')}
        >
          <ArrowLeft size={16} />
        </button>


        {/* Format toggle button — top right, only when a diagram is loaded */}
        {activeIdea && <button
          onClick={() => setShowPanel(p => !p)}
          title="Format"
          style={{
            position: 'fixed', top: 14, right: 14, zIndex: 20,
            height: 36, padding: '0 14px', borderRadius: 10,
            background: showPanel ? '#1a1d2e' : '#fff',
            border: '1px solid #e2e8f0',
            boxShadow: '0 2px 10px rgba(0,0,0,0.07)',
            cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 7,
            color: showPanel ? '#fff' : '#475569',
            fontSize: 13, fontWeight: 500, fontFamily: 'inherit',
          }}
          onMouseEnter={e => { if (!showPanel) e.currentTarget.style.background = '#f8fafc' }}
          onMouseLeave={e => { if (!showPanel) e.currentTarget.style.background = '#fff' }}
        >
          <SlidersHorizontal size={15} />
          Format
        </button>}
      </div>

      {/* Right side panel — shown when a node is selected */}
      {showPanel && (
        <SidePanel
          nodeId={selectedPanelNodeId}
          onClose={() => { setSelectedPanelNodeId(null); setSelectedNodeIds([]); setShowPanel(false) }}
          onImport={() => setShowImport(true)}
        />
      )}

      {showImport && <ImportModal onClose={() => setShowImport(false)} />}
    </div>
  )
}
