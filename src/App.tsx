import { useEffect, useRef, useState, useCallback, useMemo } from 'react'
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
import { ArrowLeft, SlidersHorizontal, Tag, X, FileDown, Star, Trash2 } from 'lucide-react'
import { exportDiagramAsPdf } from './lib/export/exportPdf'
import { Confetti } from './components/Confetti'

// 8 cohesive colors — all Tailwind-500 level, same saturation family
const TAG_PALETTE = [
  '#6366f1', '#14b8a6', '#ec4899', '#f59e0b',
  '#22c55e', '#3b82f6', '#f97316', '#8b5cf6',
]
const PRESET_TAGS = ['AI', 'Work', 'Personal', 'Research']

function buildTagColorMap(allTags: string[]): Map<string, string> {
  const sorted = [...new Set(allTags)].sort()
  return new Map(sorted.map((tag, i) => [tag, TAG_PALETTE[i % TAG_PALETTE.length]]))
}
function tagBg(tag: string, colorMap: Map<string, string>): string {
  return colorMap.get(tag) ?? '#64748b'
}

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

  // Subscribe to real-time push notifications (toast broadcasts from /api/notify)
  useEffect(() => {
    if (!hasSupabase || !supabase) return
    const ch = supabase
      .channel('app-notifications')
      .on('broadcast', { event: 'toast' }, ({ payload }) => {
        showToast(payload.message, { color: payload.color ?? '#6366f1', confetti: payload.confetti ?? false })
      })
      .on('broadcast', { event: 'diagram-created' }, ({ payload }) => {
        showToast(`✦ "${payload.title}" added`, { color: '#6366f1' })
        setFlashDiagramId(payload.id)
        loadDiagramList()
        setTimeout(() => setFlashDiagramId(null), 3500)
      })
      .subscribe()
    return () => { supabase!.removeChannel(ch) }
  }, [])

  // Local dev: fall back to the hardcoded dev user ID so Supabase queries work without auth.
  // Triple-locked: only when (1) isLocal, (2) no real session, (3) env var is set.
  const effectiveUserId = user?.id ?? (isLocal ? (import.meta.env.VITE_LOCAL_USER_ID ?? null) : null)
  const { loadDiagramList, loadDiagram, saveDiagram, createDiagramFromNodes, deleteDiagram, toggleFavorite, updateTags } = useDiagram(effectiveUserId)
  const { activeMindmap, isDirty, setActiveMindmap, addNode, selectedNodeIds, setSelectedNodeIds, setPasteImportFn, diagrams } = useMindmapStore()
  const [flashDiagramId, setFlashDiagramId] = useState<string | null>(null)
  const [showTagFooter, setShowTagFooter] = useState(false)
  const [tagInput, setTagInput] = useState('')
  const tagFooterRef = useRef<HTMLDivElement>(null)

  const tagColorMap = useMemo(() => {
    const all = [...new Set([...PRESET_TAGS, ...diagrams.flatMap(d => d.tags ?? [])])]
    return buildTagColorMap(all)
  }, [diagrams])

  // Close tag footer on outside click (capture phase to catch SVG canvas events)
  useEffect(() => {
    if (!showTagFooter) return
    function onDown(e: MouseEvent) {
      if (tagFooterRef.current && !tagFooterRef.current.contains(e.target as Node)) setShowTagFooter(false)
    }
    document.addEventListener('mousedown', onDown, true)
    return () => document.removeEventListener('mousedown', onDown, true)
  }, [showTagFooter])
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
  const importedToastFired = useRef(false)
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

  // Show map title toast after AI-generated redirect (?imported=1)
  useEffect(() => {
    if (!activeMindmap || importedToastFired.current) return
    if (!new URLSearchParams(window.location.search).has('imported')) return
    importedToastFired.current = true
    setTimeout(() => showToast(`🤖 ${activeMindmap.name}`, { color: '#1a1d2e' }), 400)
  }, [activeMindmap])

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
      <HomePage onOpen={handleOpenDiagram} user={user} onSignOut={handleSignOut} flashId={flashDiagramId} />
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

      {/* ── Tag footer bar ── */}
      {activeMindmap && (() => {
        const currentTags = activeMindmap.tags ?? []
        const allTagsList = [...new Set([...PRESET_TAGS, ...diagrams.flatMap(d => d.tags ?? [])])]
        const available = allTagsList.filter(t => !currentTags.includes(t))
        function addTag(tag: string) {
          const t = tag.trim()
          if (!t || currentTags.includes(t)) return
          updateTags(activeMindmap!.id, [...currentTags, t])
          setTagInput('')
        }
        function removeTag(tag: string) {
          updateTags(activeMindmap!.id, currentTags.filter(t => t !== tag))
        }
        return (
          <div ref={tagFooterRef} style={{
            position: 'fixed', bottom: 12, left: '50%', transform: 'translateX(-50%)',
            zIndex: 15, background: 'rgba(255,255,255,0.96)', backdropFilter: 'blur(12px)',
            border: '1px solid #e2e8f0',
            borderRadius: 14,
            boxShadow: '0 4px 20px rgba(0,0,0,0.08)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '6px 14px',
            minHeight: 38,
          }}>
            {/* Tag icon */}
            <Tag size={13} color="#94a3b8" style={{ flexShrink: 0 }} />

            {/* Current tags */}
            {currentTags.map(t => (
              <span key={t} style={{
                display: 'inline-flex', alignItems: 'center', gap: 4,
                fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 10,
                background: tagBg(t, tagColorMap), color: '#fff',
                cursor: 'pointer',
              }} onClick={() => removeTag(t)} title="Remove tag">
                {t} <X size={8} strokeWidth={3} />
              </span>
            ))}

            {/* Add tag toggle */}
            <button onClick={() => setShowTagFooter(p => !p)} style={{
              fontSize: 11, fontWeight: 600, padding: '3px 9px', borderRadius: 10,
              background: showTagFooter ? '#1e293b' : '#f1f5f9',
              color: showTagFooter ? '#fff' : '#64748b',
              border: 'none', cursor: 'pointer', fontFamily: 'inherit',
              display: 'flex', alignItems: 'center', gap: 4,
            }}>
              + Tag
            </button>

            {/* PDF / Star / Delete */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
              <button onClick={() => exportDiagramAsPdf(activeMindmap!.name)} title="Download PDF" style={{
                height: 22, padding: '0 8px', border: '1px solid #e2e8f0', borderRadius: 6,
                background: 'transparent', cursor: 'pointer', fontSize: 11, fontWeight: 500,
                color: '#64748b', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 4,
              }}>
                <FileDown size={11} /> PDF
              </button>
              <button onClick={() => toggleFavorite(activeMindmap!.id)} title={isFav ? 'Unfavorite' : 'Favorite'} style={{
                height: 22, padding: '0 8px', border: '1px solid #e2e8f0', borderRadius: 6,
                background: 'transparent', cursor: 'pointer', fontSize: 11, fontWeight: 500,
                color: isFav ? '#eab308' : '#94a3b8', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 4,
              }}>
                <Star size={11} fill={isFav ? '#eab308' : 'none'} /> Star
              </button>
              <button onClick={() => setShowDeleteConfirm(true)} title="Delete map" style={{
                height: 22, padding: '0 8px', border: '1px solid #fecaca', borderRadius: 6,
                background: 'transparent', cursor: 'pointer', fontSize: 11, fontWeight: 500,
                color: '#ef4444', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 4,
              }}>
                <Trash2 size={11} /> Delete
              </button>
            </div>

            {/* Tag picker popover */}
            {showTagFooter && (
              <div style={{
                position: 'absolute', bottom: '100%', left: 14, marginBottom: 6,
                background: '#fff', borderRadius: 12, padding: 12,
                boxShadow: '0 -4px 24px rgba(0,0,0,0.12), 0 0 0 1px #e2e8f0',
                display: 'flex', flexDirection: 'column', gap: 8, width: 240,
              }}>
                {available.length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                    {available.map(t => (
                      <button key={t} onClick={() => { addTag(t); setShowTagFooter(false) }}
                        style={{
                          fontSize: 11, fontWeight: 700, padding: '4px 10px', borderRadius: 10,
                          background: `${tagBg(t, tagColorMap)}22`, color: tagBg(t, tagColorMap),
                          border: `1px solid ${tagBg(t, tagColorMap)}55`,
                          cursor: 'pointer', fontFamily: 'inherit',
                        }}>{t}</button>
                    ))}
                  </div>
                )}
                <div style={{ display: 'flex', gap: 6 }}>
                  <input value={tagInput} onChange={e => setTagInput(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') { addTag(tagInput); setShowTagFooter(false); e.preventDefault() } }}
                    placeholder="Custom tag…"
                    style={{ flex: 1, fontSize: 12, padding: '6px 10px', border: '1px solid #e2e8f0', borderRadius: 8, outline: 'none', fontFamily: 'inherit', color: '#1e293b' }}
                    autoFocus
                  />
                  <button onClick={() => { addTag(tagInput); setShowTagFooter(false) }}
                    style={{ padding: '6px 12px', background: '#6366f1', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 12, fontFamily: 'inherit', fontWeight: 600 }}>
                    Add
                  </button>
                </div>
              </div>
            )}
          </div>
        )
      })()}
    </div>
  )
}
