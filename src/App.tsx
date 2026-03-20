import { useEffect, useRef, useState, useCallback } from 'react'
import type { User } from '@supabase/supabase-js'
import { CuteToast, showToast } from './components/CuteToast'
import { DiagramCanvas } from './components/canvas/DiagramCanvas'
import { SidePanel } from './components/panels/SidePanel'
import { ImportModal } from './components/modals/ImportModal'
import { HomePage } from './components/home/HomePage'
import { LoginPage } from './components/auth/LoginPage'
import { useDiagram } from './hooks/useDiagram'
import { useMindmapStore } from './store/mindmapStore'
import { decodeShareURL } from './lib/export/share'
import { supabase, hasSupabase } from './lib/supabase'
import { ArrowLeft, SlidersHorizontal } from 'lucide-react'

const LS_FAVS = 'mindmaps:favorites'
function loadFavs(): Set<string> {
  try { return new Set(JSON.parse(localStorage.getItem(LS_FAVS) ?? '[]')) } catch { return new Set() }
}
function saveFavs(favs: Set<string>) {
  localStorage.setItem(LS_FAVS, JSON.stringify([...favs]))
}

type View = 'home' | 'editor' | 'viewer'

// Accept both ?map= and ?id= as the diagram param
function getMapParam(search = window.location.search) {
  const p = new URLSearchParams(search)
  return p.get('map') ?? p.get('id') ?? null
}

// Skip auth gate when running locally (dev server or local IP)
const isLocal = import.meta.env.DEV ||
  ['localhost', '127.0.0.1'].includes(window.location.hostname) ||
  /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(window.location.hostname)

export default function App() {
  const [user, setUser] = useState<User | null>(null)
  const [authLoading, setAuthLoading] = useState(hasSupabase)

  useEffect(() => {
    if (!hasSupabase || !supabase) { setAuthLoading(false); return }
    supabase.auth.getSession().then(({ data }) => {
      setUser(data.session?.user ?? null)
      setAuthLoading(false)
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
    })
    return () => subscription.unsubscribe()
  }, [])

  // Local dev: fall back to the hardcoded dev user ID so Supabase queries work without auth.
  // Triple-locked: only when (1) isLocal, (2) no real session, (3) env var is set.
  const effectiveUserId = user?.id ?? (isLocal ? (import.meta.env.VITE_LOCAL_USER_ID ?? null) : null)
  const { loadDiagramList, loadDiagram, saveDiagram, createDiagramFromNodes, deleteDiagram } = useDiagram(effectiveUserId)
  const { activeMindmap, isDirty, setActiveMindmap, addNode, selectedNodeIds, setSelectedNodeIds, setPasteImportFn } = useMindmapStore()
  const [view, setView] = useState<View>(() => {
    if (decodeShareURL()) return 'viewer'
    if (getMapParam()) return 'editor'
    return 'home'
  })
  const [selectedPanelNodeId, setSelectedPanelNodeId] = useState<string | null>(null)
  const [showPanel, setShowPanel] = useState(false)
  const [showImport, setShowImport] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [favs, setFavs] = useState<Set<string>>(loadFavs)
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  function toggleFav(id: string) {
    setFavs(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      saveFavs(next)
      return next
    })
  }

  // Load diagram or list once auth is ready
  const didLoad = useRef(false)
  useEffect(() => {
    if (authLoading) return
    if (didLoad.current) return
    didLoad.current = true
    const shared = decodeShareURL()
    if (shared) { setActiveMindmap(shared); return }
    const mapId = getMapParam()
    if (mapId) {
      // Normalize ?id= → ?map= in the URL
      if (!new URLSearchParams(window.location.search).has('map')) {
        window.history.replaceState({}, '', `?map=${mapId}`)
      }
      loadDiagram(mapId)
    } else {
      loadDiagramList()
    }
  }, [authLoading, user?.id])

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
    if (!isDirty || !activeMindmap) return
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(() => saveDiagram(activeMindmap), 1500)
    return () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current) }
  }, [isDirty, activeMindmap])

  // Sync view with URL on browser back/forward
  useEffect(() => {
    function onPopState() {
      if (decodeShareURL()) return
      const mapId = getMapParam()
      if (mapId) {
        loadDiagram(mapId)
        setView('editor')
      } else {
        loadDiagramList()
        setView('home')
      }
    }
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [loadDiagram, loadDiagramList])

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement).tagName.toLowerCase()
      if (tag === 'input' || tag === 'textarea') return
      if (e.key === 'Tab' && view === 'editor') {
        e.preventDefault()
        const parentId = selectedNodeIds[0] ?? activeMindmap?.nodes.find(n => n.parentId === null)?.id ?? null
        if (parentId) {
          const newNode = addNode(parentId)
          setSelectedNodeIds([newNode.id])
          setSelectedPanelNodeId(newNode.id)
        }
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [selectedNodeIds, activeMindmap, addNode, view])

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

  // Auth gate — shared viewer is always public
  if (authLoading) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f8f9fb' }}>
      <div style={{ width: 32, height: 32, border: '3px solid #e2e8f0', borderTopColor: '#6366f1', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  )
  if (hasSupabase && !user && view !== 'viewer' && !isLocal) return <LoginPage />

  // If editor has no diagram (e.g. bad URL), fall back to home
  if (view === 'editor' && !activeMindmap && !authLoading) {
    const mapId = getMapParam()
    if (!mapId) { handleBack(); return null }
  }

  async function handleSignOut() {
    if (supabase) await supabase.auth.signOut()
  }

  if (view === 'home') return (
    <>
      <CuteToast />
      <HomePage onOpen={handleOpenDiagram} user={user} onSignOut={handleSignOut} />
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
        <DiagramCanvas
          onNodeSelect={handleNodeSelect}
          isFav={activeMindmap ? favs.has(activeMindmap.id) : false}
          onToggleFav={activeMindmap ? () => toggleFav(activeMindmap.id) : undefined}
          onDelete={activeMindmap ? () => setShowDeleteConfirm(true) : undefined}
        />

        {/* Back button — top left */}
        <button onClick={handleBack} title="All maps" style={{
          position: 'fixed', top: 14, left: 14, zIndex: 20,
          width: 36, height: 36, borderRadius: 10,
          background: '#fff', border: '1px solid #e2e8f0',
          boxShadow: '0 2px 10px rgba(0,0,0,0.07)',
          cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#475569',
        }}
          onMouseEnter={e => (e.currentTarget.style.background = '#f8fafc')}
          onMouseLeave={e => (e.currentTarget.style.background = '#fff')}>
          <ArrowLeft size={16} />
        </button>

        {/* Delete confirm modal */}
        {showDeleteConfirm && (
          <div style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.25)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200,
          }} onClick={() => setShowDeleteConfirm(false)}>
            <div style={{
              background: '#fff', borderRadius: 16, padding: 24, width: 320,
              boxShadow: '0 20px 60px rgba(0,0,0,0.15)',
            }} onClick={e => e.stopPropagation()}>
              <h3 style={{ fontSize: 15, fontWeight: 700, color: '#1e293b', marginBottom: 8 }}>Delete map?</h3>
              <p style={{ fontSize: 13, color: '#64748b', marginBottom: 20 }}>
                "<strong>{activeMindmap?.name}</strong>" will be permanently deleted.
              </p>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button onClick={() => setShowDeleteConfirm(false)} style={{
                  padding: '8px 16px', border: '1px solid #e2e8f0', borderRadius: 9,
                  background: '#fff', cursor: 'pointer', fontSize: 13, fontFamily: 'inherit', color: '#64748b',
                }}>Cancel</button>
                <button onClick={() => {
                  setShowDeleteConfirm(false)
                  if (activeMindmap) {
                    const name = activeMindmap.name
                    deleteDiagram(activeMindmap.id, name).then(() => {
                      handleBack()
                      setTimeout(() => showToast(`"${name}" deleted`, { color: '#ef4444' }), 50)
                    })
                  }
                }} style={{
                  padding: '8px 18px', background: '#ef4444', color: '#fff',
                  border: 'none', borderRadius: 9, cursor: 'pointer', fontSize: 13, fontWeight: 600, fontFamily: 'inherit',
                }}>Delete</button>
              </div>
            </div>
          </div>
        )}


        {/* Format toggle button — top right, only when a diagram is loaded */}
        {activeMindmap && <button
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
          onDelete={activeMindmap ? () => {
            const name = activeMindmap.name
            deleteDiagram(activeMindmap.id, name).then(() => {
              handleBack()
              setTimeout(() => showToast(`"${name}" deleted`, { color: '#ef4444' }), 50)
            })
          } : undefined}
        />
      )}

      {showImport && <ImportModal onClose={() => setShowImport(false)} />}
    </div>
  )
}
