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
import { Confetti } from './components/Confetti'

type View = 'home' | 'editor' | 'viewer'

// Accept both ?map= and ?id= as the diagram param
function getMapParam(search = window.location.search) {
  const p = new URLSearchParams(search)
  return p.get('map') ?? p.get('id') ?? null
}
function getShareParam(search = window.location.search) {
  return new URLSearchParams(search).get('share') ?? null
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
    // INITIAL_SESSION fires immediately with the stored session on every page load —
    // this is the earliest possible moment to know if the user is logged in,
    // so we never show a login flash for returning users.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'INITIAL_SESSION' || event === 'TOKEN_REFRESHED') {
        setUser(session?.user ?? null)
        setAuthLoading(false)
      } else if (event === 'SIGNED_IN') {
        setUser(session?.user ?? null)
        setAuthLoading(false)
        const greetings = ["Let's build something cool.", "Welcome back, boss.", "Let's do it. One diagram at a time.", "Good to see you.", "Ready when you are.", "Let's make it count.", "Diagrams standing by.", "Ready, set, go.", "All systems initiated.", "Let's make something great."]
        const greeting = greetings[Math.floor(Math.random() * greetings.length)]
        setTimeout(() => showToast(greeting, { color: '#6366f1', confetti: true }), 150)
      } else if (event === 'SIGNED_OUT') {
        const farewells = ["Later!", "See ya!", "Peace out!", "Catch you later!", "Adios!", "So long!", "Bye for now!", "Take care!", "Until next time!"]
        const farewell = farewells[Math.floor(Math.random() * farewells.length)]
        setUser(null)
        setTimeout(() => {
          showToast(farewell, { color: '#64748b' })
          setTimeout(() => window.location.reload(), 1800)
        }, 150)
      }
    })
    return () => subscription.unsubscribe()
  }, [])

  // Local dev: fall back to the hardcoded dev user ID so Supabase queries work without auth.
  // Triple-locked: only when (1) isLocal, (2) no real session, (3) env var is set.
  const effectiveUserId = user?.id ?? (isLocal ? (import.meta.env.VITE_LOCAL_USER_ID ?? null) : null)
  const { loadDiagramList, loadDiagram, saveDiagram, createDiagramFromNodes, deleteDiagram, toggleFavorite } = useDiagram(effectiveUserId)
  const { activeMindmap, isDirty, setActiveMindmap, addNode, selectedNodeIds, setSelectedNodeIds, setPasteImportFn, diagrams } = useMindmapStore()
  const [view, setView] = useState<View>(() => {
    if (decodeShareURL()) return 'viewer'
    if (getShareParam()) return 'viewer'
    if (getMapParam()) return 'editor'
    return 'home'
  })
  const [selectedPanelNodeId, setSelectedPanelNodeId] = useState<string | null>(null)
  const [showPanel, setShowPanel] = useState(false)
  const [showImport, setShowImport] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [showConfetti, setShowConfetti] = useState(() => new URLSearchParams(window.location.search).has('imported'))
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const isFav = activeMindmap ? (diagrams.find(d => d.id === activeMindmap.id)?.isFav ?? false) : false

  // Load diagram or list once auth is ready
  const didLoad = useRef(false)
  useEffect(() => {
    if (authLoading) return
    if (didLoad.current) return
    didLoad.current = true
    const shared = decodeShareURL()
    if (shared) { setActiveMindmap(shared); return }
    const shareId = getShareParam()
    if (shareId) { loadDiagram(shareId); return }
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
    const name = useMindmapStore.getState().activeMindmap?.name
    if (name) setTimeout(() => showToast(name, { color: '#6366f1', confetti: false }), 150)
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
  if (hasSupabase && !user && view !== 'viewer') return <><CuteToast /><LoginPage /></>

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
    <div style={{
      height: '100vh', width: '100vw', overflow: 'hidden',
      background: '#eef0f5', fontFamily: 'Inter, system-ui, sans-serif',
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      gap: 16, padding: 24, boxSizing: 'border-box',
    }}>
      {/* VIEW ONLY badge */}
      <div style={{
        background: '#1a1d2e', color: '#fff', fontSize: 11, fontWeight: 600,
        padding: '5px 14px', borderRadius: 20, letterSpacing: '0.06em',
        flexShrink: 0,
      }}>
        VIEW ONLY
      </div>

      {/* White paper */}
      <div style={{
        width: '100%', maxWidth: 1100, flex: 1,
        background: '#fff', borderRadius: 20,
        boxShadow: '0 8px 48px rgba(0,0,0,0.10), 0 1px 4px rgba(0,0,0,0.06)',
        position: 'relative', overflow: 'hidden',
      }}>
        <DiagramCanvas onNodeSelect={() => {}} readOnly />
      </div>
    </div>
  )

  return (
    <div style={{ display: 'flex', height: '100vh', width: '100vw', overflow: 'hidden', fontFamily: 'Inter, system-ui, sans-serif' }}>
      <CuteToast />
      {/* Confetti on first load after AI generation */}
      {showConfetti && (
        <Confetti onDone={() => {
          setShowConfetti(false)
          // Clean ?imported from URL without navigating
          const p = new URLSearchParams(window.location.search)
          p.delete('imported')
          const next = p.toString() ? `?${p}` : window.location.pathname
          window.history.replaceState({}, '', next)
        }} />
      )}
      {/* Canvas */}
      <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
        <DiagramCanvas
          onNodeSelect={handleNodeSelect}
          isFav={isFav}
          onToggleFav={activeMindmap ? () => toggleFavorite(activeMindmap.id) : undefined}
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
