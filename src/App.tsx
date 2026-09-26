import { useEffect, useRef, useState, useCallback } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { CuteToast, showToast } from './components/CuteToast'
import { DiagramCanvas } from './components/canvas/DiagramCanvas'
import { SidePanel } from './components/panels/SidePanel'
import { ImportModal } from './components/modals/ImportModal'
import { HomePage } from './components/home/HomePage'
import { useDiagram } from './hooks/useDiagram'
import { useIsMobile } from './hooks/useIsMobile'
import { useIsTouchDevice } from './hooks/useIsTouchDevice'
import { useMindmapStore } from './store/mindmapStore'
import { decodeShareURL } from './lib/export/share'
import { hasGoogleAuth, renderGoogleButton } from './lib/googleAuth'
import { readSession, saveSession, clearSession, SESSION_EXPIRED } from './lib/session'
import { emberVanish, damageFlash } from './lib/emberVanish'
import { ArrowLeft, SlidersHorizontal, Tag, FileDown, Network, Share2, Sparkles, GitBranch, Lightbulb, Workflow, ListTree, Waypoints, Image as ImageIcon } from 'lucide-react'
import { Confetti } from './components/Confetti'
import { LockedBanner } from './components/LockedBanner'
import { MindmapsLogo } from './components/MindmapsLogo'
import { ViewerPage } from './components/viewer/ViewerPage'

// Faint feature icons that float behind the login card (mind maps, AI, sharing,
// branching, tags, export, import, outlines) - purely decorative.
const LOGIN_ICONS = [
  { Icon: Network,   top: '13%', left: '11%', size: 44, dur: 6.0, delay: 0.0 },
  { Icon: Waypoints, top: '9%',  left: '53%', size: 34, dur: 6.8, delay: 1.5 },
  { Icon: Share2,    top: '20%', left: '82%', size: 34, dur: 7.0, delay: 1.2 },
  { Icon: Tag,       top: '34%', left: '22%', size: 26, dur: 5.2, delay: 0.4 },
  { Icon: Lightbulb, top: '44%', left: '6%',  size: 30, dur: 5.0, delay: 0.3 },
  { Icon: Workflow,  top: '50%', left: '88%', size: 36, dur: 7.5, delay: 0.9 },
  { Icon: Sparkles,  top: '66%', left: '14%', size: 38, dur: 5.5, delay: 0.6 },
  { Icon: FileDown,  top: '62%', left: '72%', size: 28, dur: 6.2, delay: 1.1 },
  { Icon: ListTree,  top: '84%', left: '44%', size: 32, dur: 6.0, delay: 2.1 },
  { Icon: GitBranch, top: '80%', left: '82%', size: 40, dur: 6.5, delay: 1.8 },
  { Icon: ImageIcon, top: '18%', left: '70%', size: 30, dur: 5.8, delay: 0.8 },
]

type View = 'home' | 'editor' | 'viewer'

// Accept both ?map= and ?id= as the diagram param
function getMapParam(search = window.location.search) {
  const p = new URLSearchParams(search)
  return p.get('map') ?? p.get('id') ?? null
}
function getShareParam(search = window.location.search) {
  return new URLSearchParams(search).get('share') ?? null
}


export default function App() {
  // Simple auth — check localStorage for session
  const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
  const [user, setUser] = useState<{ email: string; name: string; userId: string } | null>(() => {
    // import.meta.env.DEV is a compile-time constant, so Vite strips this whole branch -
    // including the owner literals below - from the production bundle.
    if (import.meta.env.DEV && isLocal) {
      // Owner identity for local dev, read from env so no personal literal ships in public source.
      // Set VITE_DEV_USER_* in .env.local to match your owner row; the fallbacks are placeholders.
      const DEV_USER = {
        email: import.meta.env.VITE_DEV_USER_EMAIL ?? 'dev@example.com',
        name: import.meta.env.VITE_DEV_USER_NAME ?? 'Dev User',
        userId: import.meta.env.VITE_DEV_USER_ID ?? '00000000-0000-4000-8000-000000000000',
      }
      localStorage.setItem('mindmaps:user', JSON.stringify(DEV_USER))
      return DEV_USER
    }
    // A cached user with a dead token is not a session - show the login screen.
    return readSession()
  })
  const [authLoading, setAuthLoading] = useState(false)
  const [loginError, setLoginError] = useState('')

  const googleBtnRef = useRef<HTMLDivElement>(null)
  const googleRendered = useRef(false)

  // Exchange the Google ID token (from the GIS button) for a Mindmaps session token.
  async function exchangeGoogleToken(idToken: string) {
    setAuthLoading(true)
    setLoginError('')
    try {
      const res = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken }),
      })
      const data = await res.json()
      if (data.ok) {
        // Clear any stale cache so the API is the source of truth for the new session.
        clearSession()
        saveSession(data.user, data.token)
        setUser(data.user)
        showToast("Welcome back, boss.", { color: '#1a1d2e', confetti: true })
      } else {
        setLoginError(data.error || 'Not authorized')
      }
    } catch { setLoginError('Network error') }
    finally { setAuthLoading(false) }
  }

  // Render the Google sign-in button once the login screen is on screen.
  useEffect(() => {
    if (user || googleRendered.current || !googleBtnRef.current || !hasGoogleAuth) return
    googleRendered.current = true
    renderGoogleButton(googleBtnRef.current, exchangeGoogleToken).catch(() => setLoginError('Could not load Google sign-in'))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user])

  // The server rejected our token (expired, revoked, secret rotated): drop straight
  // to the login screen instead of leaving a signed-in shell with no data in it.
  useEffect(() => {
    function onExpired() {
      setUser(null)
      showToast('Session expired - sign in again', { color: '#f59e0b' })
    }
    window.addEventListener(SESSION_EXPIRED, onExpired)
    return () => window.removeEventListener(SESSION_EXPIRED, onExpired)
  }, [])

  function handleSignOut() {
    clearSession()
    setUser(null)
    showToast('See ya!', { color: '#64748b' })
  }

  // Prevent iOS Safari viewport zoom (ignores user-scalable=no) so fixed UI stays put
  useEffect(() => {
    const prevent = (e: Event) => e.preventDefault()
    document.addEventListener('gesturestart', prevent, { passive: false })
    document.addEventListener('gesturechange', prevent, { passive: false })
    document.addEventListener('gestureend', prevent, { passive: false })
    return () => {
      document.removeEventListener('gesturestart', prevent)
      document.removeEventListener('gesturechange', prevent)
      document.removeEventListener('gestureend', prevent)
    }
  }, [])


  // Local dev: fall back to the hardcoded dev user ID so DB queries work without auth.
  // Triple-locked: only when (1) isLocal, (2) no real session, (3) env var is set.
  const effectiveUserId = user?.userId ?? null
  const { loadDiagramList, loadDiagram, saveDiagram, createDiagramFromNodes, deleteDiagram, updateTags } = useDiagram(effectiveUserId)

  // Realtime removed — data now on Linode PostgreSQL
  // Shallow-selected slice so App only re-renders when one of these actually changes,
  // not on every store write (resizePreview, HUD flags, etc.). Actions are stable refs.
  const { activeMindmap, isDirty, setActiveMindmap, addNode, selectedNodeIds, setSelectedNodeIds, setPasteImportFn } = useMindmapStore(
    useShallow(s => ({
      activeMindmap: s.activeMindmap, isDirty: s.isDirty, setActiveMindmap: s.setActiveMindmap, addNode: s.addNode,
      selectedNodeIds: s.selectedNodeIds, setSelectedNodeIds: s.setSelectedNodeIds, setPasteImportFn: s.setPasteImportFn,
    })),
  )
  const [flashDiagramId] = useState<string | null>(null)
  const [diagramLoading, setDiagramLoading] = useState(() => !!(getMapParam() || getShareParam()))
  const [view, setView] = useState<View>(() => {
    if (decodeShareURL()) return 'viewer'
    if (getShareParam()) return 'viewer'
    if (getMapParam()) return 'editor'
    return 'home'
  })
  const [selectedPanelNodeId, setSelectedPanelNodeId] = useState<string | null>(null)
  const [showPanel, setShowPanel] = useState(false)
  const isMobile = useIsMobile()
  const isTouch = useIsTouchDevice()
  const [showImport, setShowImport] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [showConfetti, setShowConfetti] = useState(() => new URLSearchParams(window.location.search).has('imported'))
  const confettiCount = (() => { const t = new URLSearchParams(window.location.search).get('tokens'); return t ? Math.min(280, Math.max(40, Math.round(parseInt(t) / 1000 * 60))) : 60 })()

  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // True when the editor was opened by pushing a new history entry from within the
  // app (so the Back button can pop that entry like the browser's own Back button).
  const pushedEditorEntry = useRef(false)

  // Load diagram or list once auth is ready
  const didLoad = useRef(false)
  useEffect(() => {
    if (authLoading) return
    if (didLoad.current) return
    didLoad.current = true
    const shared = decodeShareURL()
    if (shared) { setActiveMindmap(shared); return }
    const shareId = getShareParam()
    if (shareId) { setDiagramLoading(true); loadDiagram(shareId).finally(() => setDiagramLoading(false)); return }
    const mapId = getMapParam()
    if (mapId) {
      // Normalize ?id= → ?map= in the URL, preserving ?imported
      if (!new URLSearchParams(window.location.search).has('map')) {
        const isImported = new URLSearchParams(window.location.search).has('imported')
        window.history.replaceState({}, '', `?map=${mapId}${isImported ? '&imported=1' : ''}`)
      }
      setDiagramLoading(true)
      loadDiagram(mapId).then(loaded => {
        if (!loaded) {
          // Deep link / refresh to a map that failed to load: fall back to home.
          setView('home'); loadDiagramList()
          window.history.replaceState({}, '', window.location.pathname)
          setTimeout(() => showToast("Couldn't open that map - check your connection and try again", { color: '#ef4444' }), 200)
        }
      }).finally(() => setDiagramLoading(false))
    } else {
      loadDiagramList()
    }
  }, [authLoading])

  useEffect(() => {
    setPasteImportFn(async (name, nodes) => {
      const id = await createDiagramFromNodes(name, nodes)
      if (id) {
        setView('editor')
        window.history.pushState({}, '', `?map=${id}`)
        pushedEditorEntry.current = true
      }
    })
    return () => setPasteImportFn(null)
  }, [createDiagramFromNodes, setPasteImportFn])


  useEffect(() => {
    // Belt-and-suspenders: the canvas already disables editing when locked (see
    // DiagramCanvas's effectiveReadOnly), so isDirty shouldn't go true, but never
    // autosave a locked map's content regardless - the server would 423 it anyway.
    if (!isDirty || !activeMindmap || activeMindmap.locked) return
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(() => saveDiagram(activeMindmap), 1500)
    return () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current) }
  }, [isDirty, activeMindmap])

  // Save on tab close / refresh so no work is lost
  useEffect(() => {
    function onBeforeUnload() {
      const { activeMindmap: m, isDirty: d } = useMindmapStore.getState()
      if (d && m) saveDiagram(m)
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [saveDiagram])

  // Sync view with URL on browser back/forward
  useEffect(() => {
    function onPopState() {
      if (decodeShareURL()) return
      const mapId = getMapParam()
      if (mapId) {
        loadDiagram(mapId).then(loaded => {
          if (loaded) { setView('editor'); pushedEditorEntry.current = true }
          else { loadDiagramList(); setView('home'); pushedEditorEntry.current = false }
        })
      } else {
        loadDiagramList()
        setView('home')
        pushedEditorEntry.current = false
      }
    }
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [loadDiagram, loadDiagramList])

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement | null)?.tagName?.toLowerCase() ?? ''
      if (tag === 'input' || tag === 'textarea') return
      // Cmd+S / Ctrl+S — manual save
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault()
        const { activeMindmap: m } = useMindmapStore.getState()
        if (m && view === 'editor') {
          if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
          saveDiagram(m).then(() => {
            showToast(`"${m.name}" saved`, { color: '#1a1d2e' })
          })
        }
        return
      }
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
  }, [selectedNodeIds, activeMindmap, addNode, view, saveDiagram])

  // Track the last active tag so we can restore it on back navigation
  const lastTagRef = useRef<string | null>(new URLSearchParams(window.location.search).get('tag'))

  const handleOpenDiagram = useCallback(async (id: string) => {
    // Save the current tag before navigating away
    lastTagRef.current = new URLSearchParams(window.location.search).get('tag')
    setShowPanel(false); setSelectedPanelNodeId(null)
    setDiagramLoading(true)
    const loaded = await loadDiagram(id)
    setDiagramLoading(false)
    // Load failed (no cache + network/server error): stay on home with clear
    // feedback instead of silently bouncing to a blank editor. Defer the toast so
    // CuteToast (unmounted during the loading spinner) has remounted to receive it.
    if (!loaded) {
      setTimeout(() => showToast("Couldn't open that map - check your connection and try again", { color: '#ef4444' }), 200)
      return
    }
    setView('editor')
    window.history.pushState({}, '', `?map=${id}`)
    pushedEditorEntry.current = true
    if (loaded.name) setTimeout(() => showToast(loaded.name, { color: '#1a1d2e', confetti: false }), 150)
  }, [loadDiagram])

  const handleBack = useCallback(async () => {
    // Save immediately before leaving — don't rely on the 1.5s auto-save timer
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    const { activeMindmap: current, isDirty: dirty } = useMindmapStore.getState()
    if (dirty && current) await saveDiagram(current)
    setShowPanel(false); setSelectedPanelNodeId(null); setSelectedNodeIds([])

    // Behave like the browser Back button: if we opened the editor by pushing a
    // history entry, pop it so we return to the exact prior home state (and its
    // tag filter, preserved in that entry's URL). The popstate handler restores
    // the home view. Fall back to a fresh home nav for deep links / refreshes
    // where there's no in-app entry to pop.
    if (pushedEditorEntry.current) {
      pushedEditorEntry.current = false
      window.history.back()
      return
    }
    await loadDiagramList()
    setView('home')
    const tag = current?.tags?.[0] ?? lastTagRef.current
    window.history.replaceState({}, '', tag ? `?tag=${tag}` : window.location.pathname)
  }, [setSelectedNodeIds, loadDiagramList, saveDiagram])

  // You took the hit: the screen flashes red, then the map on screen comes apart
  // before we drop back to the library. Every delete path goes through here so the
  // Settings panel and the confirm modal behave the same.
  const animatedDelete = useCallback((id: string, name: string) => {
    const wait = damageFlash()
    const go = () => {
      emberVanish(document.querySelector('.diagram-canvas-root'))
      deleteDiagram(id, name).finally(() => handleBack())
    }
    if (wait) setTimeout(go, wait); else go()
  }, [deleteDiagram, handleBack])

  const handleNodeSelect = useCallback((nodeId: string | null) => {
    if (nodeId) setSelectedPanelNodeId(nodeId)
  }, [])



  // Show spinner while auth or diagram is loading
  if (authLoading || diagramLoading) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f8f9fb' }}>
      <div style={{ width: 32, height: 32, border: '3px solid #e2e8f0', borderTopColor: '#6366f1', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  )

  // Allow shared links to bypass login
  const isShareLink = !!getShareParam() || !!decodeShareURL()

  // Login screen when not authenticated (unless it's a share link)
  if (!user && !isShareLink && !activeMindmap) return (
    <>
      <CuteToast />
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, position: 'relative', overflow: 'hidden', background: 'linear-gradient(160deg, #f8f9fb 0%, #eef2ff 55%, #f5f3ff 100%)', fontFamily: 'Inter, system-ui, sans-serif' }}>
        {/* Floating feature icons (decorative) */}
        <div aria-hidden="true" style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none' }}>
          {LOGIN_ICONS.map(({ Icon, top, left, size, dur, delay }, i) => (
            <div key={i} style={{ position: 'absolute', top, left, color: '#cbd5e1', opacity: 0.5, animation: `mmFloat ${dur}s ease-in-out ${delay}s infinite` }}>
              <Icon size={size} strokeWidth={1.5} />
            </div>
          ))}
        </div>
        {/* Sign-in card */}
        <div style={{ position: 'relative', zIndex: 1, width: 'min(380px, 92vw)', boxSizing: 'border-box', background: '#fff', borderRadius: 20, padding: 'clamp(28px, 6vw, 40px)', boxShadow: '0 24px 60px rgba(80, 60, 180, 0.14)', animation: 'mmCardIn 0.6s cubic-bezier(0.16, 1, 0.3, 1)' }}>
          <div style={{ textAlign: 'center', marginBottom: 28 }}>
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 16 }}>
              <MindmapsLogo size={68} />
            </div>
            <div style={{ fontSize: 'clamp(24px, 5vw, 30px)', fontWeight: 700, color: '#1e293b' }}>Mindmaps</div>
            <div style={{ fontSize: 13.5, color: '#94a3b8', marginTop: 6 }}>Sign in to continue</div>
          </div>
          {hasGoogleAuth
            ? <div ref={googleBtnRef} style={{ display: 'flex', justifyContent: 'center', minHeight: 44 }} />
            : <div style={{ fontSize: 13, color: '#94a3b8', textAlign: 'center' }}>Sign-in is not configured</div>}
          {loginError && <div style={{ color: '#ef4444', fontSize: 12, marginTop: 12, textAlign: 'center' }}>{loginError}</div>}
        </div>
        <style>{`
          @keyframes mmFloat { 0%, 100% { transform: translateY(0) } 50% { transform: translateY(-14px) } }
          @keyframes mmCardIn { from { opacity: 0; transform: translateY(18px) scale(0.98) } to { opacity: 1; transform: translateY(0) scale(1) } }
          @media (prefers-reduced-motion: reduce) { .mm-noanim, [style*="mmFloat"], [style*="mmCardIn"] { animation: none !important } }
        `}</style>
      </div>
    </>
  )

  if (view === 'home') return (
    <>
      <CuteToast />
      <HomePage onOpen={handleOpenDiagram} user={user} onSignOut={handleSignOut} flashId={flashDiagramId} />
    </>
  )

  // Guard: if editor view but no diagram, show home instead of crashing
  if (view === 'editor' && !activeMindmap) return (
    <>
      <CuteToast />
      <HomePage onOpen={handleOpenDiagram} user={user} onSignOut={handleSignOut} flashId={flashDiagramId} />
    </>
  )

  if (view === 'viewer') return (
    <ViewerPage diagram={activeMindmap} id={getShareParam()} />
  )

  return (
    <div style={{ display: 'flex', height: '100vh', width: '100vw', overflow: 'hidden', fontFamily: 'Inter, system-ui, sans-serif', touchAction: 'pan-x pan-y' }}>
      <CuteToast />
      {activeMindmap?.locked && <LockedBanner />}
      {/* Confetti on first load after AI generation */}
      {showConfetti && (
        <Confetti count={confettiCount} onDone={() => {
          setShowConfetti(false)
          // Show map name toast after confetti finishes
          const name = useMindmapStore.getState().activeMindmap?.name
          if (name) showToast(name, { color: '#1a1d2e' })
          // Clean ?imported from URL without navigating
          const p = new URLSearchParams(window.location.search)
          p.delete('imported')
          p.delete('tokens')
          const next = p.toString() ? `?${p}` : window.location.pathname
          window.history.replaceState({}, '', next)
        }} />
      )}
      {/* Canvas */}
      <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
        <DiagramCanvas
          onNodeSelect={handleNodeSelect}
          onDelete={activeMindmap ? () => setShowDeleteConfirm(true) : undefined}
          readOnly={isTouch}
          noInteract={isTouch}
          rightInset={showPanel ? Math.round(256 * 1.2) : 0}
        />

        {/* Back button — top left */}
        <button onClick={handleBack} title="All maps" style={{
          position: 'fixed', top: activeMindmap?.locked ? 58 : 14, left: 14, zIndex: 20,
          width: isMobile ? 48 : 36, height: isMobile ? 48 : 36, borderRadius: isMobile ? 14 : 10,
          background: '#fff', border: '1px solid #e2e8f0',
          boxShadow: '0 2px 10px rgba(0,0,0,0.07)',
          cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#475569',
        }}
          onMouseEnter={e => (e.currentTarget.style.background = '#f8fafc')}
          onMouseLeave={e => (e.currentTarget.style.background = '#fff')}>
          <ArrowLeft size={isMobile ? 22 : 16} />
        </button>



        {/* Settings toggle button — top right, only when a diagram is loaded */}
        {activeMindmap && <button
          onClick={() => setShowPanel(p => !p)}
          title="Settings"
          style={{
            position: 'fixed', top: activeMindmap?.locked ? 58 : 14, right: 14, zIndex: 20,
            width: isMobile ? 48 : undefined,
            height: isMobile ? 48 : 36,
            padding: isMobile ? 0 : '0 14px',
            borderRadius: isMobile ? 14 : 10,
            background: showPanel ? '#1a1d2e' : '#fff',
            border: '1px solid #e2e8f0',
            boxShadow: '0 2px 10px rgba(0,0,0,0.07)',
            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: isMobile ? 0 : 7,
            color: showPanel ? '#fff' : '#475569',
            fontSize: 13, fontWeight: 500, fontFamily: 'inherit',
          }}
          onMouseEnter={e => { if (!showPanel) e.currentTarget.style.background = '#f8fafc' }}
          onMouseLeave={e => { if (!showPanel) e.currentTarget.style.background = '#fff' }}
        >
          <SlidersHorizontal size={isMobile ? 22 : 15} />
          {!isMobile && 'Settings'}
        </button>}
      </div>

      {/* Right side panel — shown when a node is selected */}
      {showPanel && (
        <SidePanel
          nodeId={selectedPanelNodeId}
          onClose={() => { setSelectedPanelNodeId(null); setSelectedNodeIds([]); setShowPanel(false) }}
          onDelete={activeMindmap ? () => animatedDelete(activeMindmap.id, activeMindmap.name) : undefined}
          onUpdateTags={updateTags}
        />
      )}

      {showImport && <ImportModal onClose={() => setShowImport(false)} />}

      {/* Delete confirm modal — at root level so it's never clipped */}
      {showDeleteConfirm && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.25)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 500,
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
                if (activeMindmap) animatedDelete(activeMindmap.id, activeMindmap.name)
              }} style={{
                padding: '8px 18px', background: '#ef4444', color: '#fff',
                border: 'none', borderRadius: 9, cursor: 'pointer', fontSize: 13, fontWeight: 600, fontFamily: 'inherit',
              }}>Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
