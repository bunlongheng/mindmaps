import { useState, useEffect, useRef, useMemo } from 'react'
import { useMindmapStore } from '../../store/mindmapStore'
import { useDiagram } from '../../hooks/useDiagram'
import { showToast } from '../CuteToast'
import type { DiagramMeta, MindmapNode } from '../../types'
import { Plus, Search, Trash2, LayoutGrid, Globe, Sparkles, Loader2, Tag, X, Bot, Briefcase, User, BookOpen, Zap, GraduationCap, FlaskConical, Beaker, FileInput, type LucideIcon } from 'lucide-react'
import { ImportModal } from '../modals/ImportModal'
import { MindmapsLogo } from '../MindmapsLogo'
import { getTheme } from '../../lib/themes'
import { AIThinkingOverlay } from '../AIThinkingOverlay'
import { soundHover, soundClick, soundPaste } from '../../lib/sounds'

const MINDMAP_API_KEY = 'REDACTED_ROTATED_KEY'
const MINDMAP_API_BASE = 'https://mindmaps-bheng.vercel.app'

const PRESET_TAGS = ['AI', 'Work', 'Personal', 'Research']

// 8 cohesive colors — all Tailwind-500 level, same saturation family
const TAG_PALETTE = [
  '#6366f1', // indigo
  '#14b8a6', // teal
  '#ec4899', // rose
  '#f59e0b', // amber
  '#22c55e', // emerald
  '#3b82f6', // blue
  '#f97316', // orange
  '#8b5cf6', // violet
]

function buildTagColorMap(allTags: string[]): Map<string, string> {
  const sorted = [...new Set(allTags)].sort()
  const map = new Map<string, string>()
  sorted.forEach((tag, i) => map.set(tag, TAG_PALETTE[i % TAG_PALETTE.length]))
  return map
}

function tagBg(tag: string, colorMap: Map<string, string>): string {
  return colorMap.get(tag) ?? '#64748b'
}

const TAG_ICONS: Record<string, LucideIcon> = {
  AI: Bot, Work: Briefcase, Personal: User, Research: FlaskConical,
  Learning: GraduationCap, API: Zap, Science: Beaker, Study: BookOpen,
}
function TagIcon({ tag, size = 11 }: { tag: string; size?: number }) {
  const Icon = TAG_ICONS[tag] ?? Tag
  return <Icon size={size} />
}

interface HomePageProps {
  onOpen: (id: string) => void
  user?: import('@supabase/supabase-js').User | null
  onSignOut?: () => void
  flashId?: string | null
}

export function HomePage({ onOpen, user, onSignOut, flashId }: HomePageProps) {
  const { diagrams } = useMindmapStore()
  const { loadDiagramList, createDiagram, createDiagramFromNodes, deleteDiagram, updateTags } = useDiagram(user?.id ?? null)
  const isMobile = window.innerWidth <= 768

  // Compute a unique color per tag (sorted alphabetically → palette index)
  const tagColorMap = useMemo(() => {
    const allTags = [...new Set([...PRESET_TAGS, ...diagrams.flatMap(d => d.tags ?? [])])]
    return buildTagColorMap(allTags)
  }, [diagrams])
  const [search, setSearch] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [aiPrompt, setAiPrompt] = useState('')
  const [aiLoading, setAiLoading] = useState(false)
  const [aiError, setAiError] = useState('')
  const [activeTag, _setActiveTag] = useState<string | null>(() => {
    const p = new URLSearchParams(window.location.search)
    return p.get('tag') ?? null
  })
  const setActiveTag = (tag: string | null) => {
    _setActiveTag(tag)
    const p = new URLSearchParams(window.location.search)
    if (tag) p.set('tag', tag); else p.delete('tag')
    const next = p.toString() ? `?${p}` : window.location.pathname
    window.history.replaceState({}, '', next)
  }
  const [tagModalId, setTagModalId] = useState<string | null>(null)
  const [bgLevel, _setBgLevel] = useState<0|1|2>(() => {
    const saved = localStorage.getItem('mindmaps:bgLevel')
    return (saved === '1' ? 1 : saved === '2' ? 2 : 0) as 0|1|2
  })
  const [showUserMenu, setShowUserMenu] = useState(false)
  const [showImport, setShowImport] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  useEffect(() => { loadDiagramList() }, [])


  // Close user menu on outside click
  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setShowUserMenu(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [])

  // Paste on home page — create new diagram from JSON or indented outline
  useEffect(() => {
    const { setPasteImportFn } = useMindmapStore.getState()
    setPasteImportFn(async (name: string, nodes: MindmapNode[]) => {
      const id = await createDiagramFromNodes(name, nodes)
      if (id) onOpen(id)
    })
    return () => useMindmapStore.getState().setPasteImportFn(null)
  }, [createDiagramFromNodes, onOpen])

  function tryImport(text: string) {
    const trimmed = text.trim()
    if (!trimmed) return
    const isJson = trimmed.startsWith('{') || trimmed.startsWith('[')
    const lines = trimmed.split('\n').filter(l => l.trim())
    const hasIndent = lines.some(l => /^(\s{4}|\t)/.test(l))
    if (isJson || (lines.length >= 2 && hasIndent)) {
      soundPaste()
      useMindmapStore.getState().loadFromOutline(trimmed)
    } else {
      showToast('Incompatible format — paste JSON or indented outline', { color: '#ef4444', duration: 3000 })
    }
  }

  // Capture paste anywhere on the page (no focus dependency)
  useEffect(() => {
    function onDocPaste(e: ClipboardEvent) {
      const active = document.activeElement
      // Ignore if user is typing in a real input/textarea
      if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA')) return
      const text = e.clipboardData?.getData('text/plain') ?? ''
      if (text.trim()) { e.preventDefault(); tryImport(text) }
    }
    document.addEventListener('paste', onDocPaste)
    return () => document.removeEventListener('paste', onDocPaste)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // All unique tags for filter bar (preset + any used in diagrams)
  const allTags = Array.from(new Set([...PRESET_TAGS, ...diagrams.flatMap(d => d.tags ?? [])]))

  const filtered = diagrams.filter(d => {
    const matchSearch = d.name.toLowerCase().includes(search.toLowerCase())
    const tags = d.tags ?? []
    const matchTag =
      activeTag === null ? true :
      activeTag === '__no_tag__' ? tags.length === 0 :
      tags.includes(activeTag)
    return matchSearch && matchTag
  })


  const [newMapBusy, setNewMapBusy] = useState(false)
  async function handleNewBlank() {
    if (newMapBusy) return
    setNewMapBusy(true)
    try {
      const id = await createDiagram('Untitled')
      if (id) onOpen(id)
    } finally {
      setNewMapBusy(false)
    }
  }

  async function handleAiGenerate() {
    if (!aiPrompt.trim() || aiLoading) return
    setAiLoading(true)
    setAiError('')
    setShowCreate(false)
    try {
      // Use the live Supabase session JWT if available, fall back to static key
      const { supabase } = await import('../../lib/supabase')
      const sessionToken = supabase
        ? (await supabase.auth.getSession()).data.session?.access_token
        : null

      const res = await fetch(`${MINDMAP_API_BASE}/api/ai/generate-mindmap`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${sessionToken ?? MINDMAP_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          prompt: aiPrompt.trim(),
          userId: user?.id ?? null,
        }),
      })
      const data = await res.json() as { id?: string; error?: string; usage?: { total_tokens?: number }; tokens?: number }
      if (!res.ok || !data.id) throw new Error(data.error ?? 'Generation failed')
      const tokens = data.usage?.total_tokens ?? data.tokens ?? 500
      // Skip home — go straight to the new diagram with confetti flag
      window.location.href = `/?id=${data.id}&imported=1&tokens=${tokens}`
    } catch (e) {
      setAiError(e instanceof Error ? e.message : 'Something went wrong')
    } finally {
      setAiLoading(false)
    }
  }

  function timeAgo(iso: string) {
    const diff = Date.now() - new Date(iso).getTime()
    const m = Math.floor(diff / 60000)
    if (m < 1) return 'Just now'
    if (m < 60) return `${m}m ago`
    const h = Math.floor(m / 60)
    if (h < 24) return `${h}h ago`
    const d = Math.floor(h / 24)
    if (d < 7) return `${d}d ago`
    return new Date(iso).toLocaleDateString()
  }

  // Cache user profile in localStorage so it's available instantly on next load
  const [avatarUrl, setAvatarUrl] = useState<string | undefined>(() =>
    localStorage.getItem('mindmaps:avatarB64') ?? localStorage.getItem('mindmaps:avatar') ?? undefined
  )
  // Cache avatar as base64 on first load so it never needs network again
  useEffect(() => {
    const liveUrl = user?.user_metadata?.avatar_url as string | undefined
    if (!liveUrl) return
    const cached = localStorage.getItem('mindmaps:avatarB64')
    if (cached) { setAvatarUrl(cached); return }
    // Fetch and convert to base64
    fetch(liveUrl, { referrerPolicy: 'no-referrer' })
      .then(r => r.blob())
      .then(blob => {
        const reader = new FileReader()
        reader.onloadend = () => {
          const b64 = reader.result as string
          localStorage.setItem('mindmaps:avatarB64', b64)
          localStorage.setItem('mindmaps:avatar', liveUrl)
          setAvatarUrl(b64)
        }
        reader.readAsDataURL(blob)
      })
      .catch(() => {
        localStorage.setItem('mindmaps:avatar', liveUrl)
        setAvatarUrl(liveUrl)
      })
  }, [user])
  const displayName = (() => {
    const live = (user?.user_metadata?.full_name ?? user?.email ?? '') as string
    if (live) { localStorage.setItem('mindmaps:displayName', live); return live }
    return localStorage.getItem('mindmaps:displayName') ?? ''
  })()

  const BG_LEVELS = ['#eef0f5', '#e0e3ec', '#d0d4e0'] as const
  const BG = BG_LEVELS[bgLevel]
  const SURFACE = bgLevel === 0 ? '#ffffff' : bgLevel === 1 ? '#f4f5fb' : '#e8ebf5'
  const BORDER = bgLevel === 0 ? '#dde2ec' : bgLevel === 1 ? '#ced4e4' : '#bec5d8'
  const BORDER_HOVER = '#a5b4fc'
  const TEXT_PRIMARY = '#1e293b'
  const TEXT_MUTED = '#94a3b8'

  return (
    <div style={{ minHeight: '100vh', background: BG, fontFamily: 'Inter, system-ui, sans-serif' }}>
      {showImport && <ImportModal onClose={() => setShowImport(false)} userId={user?.id} />}

      {/* AI thinking canvas overlay */}
      {aiLoading && <AIThinkingOverlay />}

      {/* Top nav */}
      <header style={{
        background: '#fff',
        borderBottom: `1px solid ${BORDER}`,
        height: 56,
        position: 'sticky', top: 0, zIndex: 10,
      }}>
      <div style={{ maxWidth: 1600, margin: '0 auto', height: '100%', display: 'flex', alignItems: 'center', gap: 16 }} className="home-header">
        {/* Logo + name */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
          <MindmapsLogo size={28} />
          <span style={{ fontSize: 15, fontWeight: 700, color: TEXT_PRIMARY }}>Mindmaps</span>
        </div>

        {/* Search */}
        <div style={{ position: 'relative' }} className="home-search">
          <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search maps…"
            style={{
              width: '100%', padding: '7px 12px 7px 32px', boxSizing: 'border-box',
              border: `1px solid ${BORDER}`, borderRadius: 9, fontSize: 13,
              outline: 'none', fontFamily: 'inherit', color: TEXT_PRIMARY,
              background: '#fff',
            }}
          />
        </div>

        <div style={{ flex: 1 }} />

        {/* Quick blank map */}
        <button
          onClick={handleNewBlank}
          disabled={newMapBusy}
          title="New blank map"
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '6px 14px', borderRadius: 9,
            border: `1px solid ${BORDER}`, background: '#fff',
            cursor: newMapBusy ? 'wait' : 'pointer', fontSize: 13, fontWeight: 500,
            color: TEXT_PRIMARY, fontFamily: 'inherit', flexShrink: 0,
            opacity: newMapBusy ? 0.6 : 1,
          }}
        >
          {newMapBusy ? <Loader2 size={14} style={{ animation: 'spin 0.7s linear infinite' }} /> : <Plus size={14} strokeWidth={2.5} />} New
        </button>

        {!user && !avatarUrl && !displayName && (
          <button
            onClick={async () => {
              const { supabase } = await import('../../lib/supabase')
              if (!supabase) return
              supabase.auth.signInWithOAuth({
                provider: 'google',
                options: { redirectTo: window.location.origin },
              })
            }}
            style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '7px 16px', borderRadius: 999, border: `1px solid ${BORDER}`,
              background: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 500,
              color: TEXT_PRIMARY, fontFamily: 'inherit', flexShrink: 0,
            }}
          >
            <svg width="16" height="16" viewBox="0 0 48 48"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59a14.5 14.5 0 0 1 0-9.18l-7.98-6.19a24.01 24.01 0 0 0 0 21.56l7.98-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>
            Sign in
          </button>
        )}
        {(user || avatarUrl || displayName) && (
          <div ref={menuRef} style={{ position: 'relative' }}>
            <button
              onClick={() => setShowUserMenu(p => !p)}
              style={{
                width: 34, height: 34, borderRadius: '50%', overflow: 'hidden',
                border: showUserMenu ? '2px solid #1c1e21' : `1px solid #e4e6e8`,
                cursor: 'pointer', padding: 0, background: '#e4e6e8',
                transition: 'border-color 0.15s', flexShrink: 0,
                position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
              title={displayName}
            >
              {avatarUrl ? (
                <img src={avatarUrl} alt=""
                  referrerPolicy="no-referrer"
                  style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
                  onError={e => { (e.target as HTMLImageElement).style.display = 'none' }}
                />
              ) : (
                <span style={{ fontSize: 13, fontWeight: 700, color: '#1c1e21', userSelect: 'none', lineHeight: 1 }}>
                  {displayName[0]?.toUpperCase() || ''}
                </span>
              )}
            </button>

            {showUserMenu && (
              <div style={{
                position: 'absolute', top: 42, right: 0, width: 210,
                background: '#fff', borderRadius: 12,
                boxShadow: '0 8px 32px rgba(0,0,0,0.12), 0 0 0 1px #e2e8f0',
                overflow: 'hidden', zIndex: 50,
              }}>
                <div style={{ padding: '12px 14px 10px', borderBottom: `1px solid ${BORDER}` }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: TEXT_PRIMARY, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {displayName}
                  </div>
                  <div style={{ fontSize: 11, color: TEXT_MUTED, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: 2 }}>
                    {user?.email ?? 'Local'}
                  </div>
                </div>
                <button
                  onClick={() => { setShowUserMenu(false); setShowImport(true) }}
                  style={{
                    width: '100%', padding: '10px 14px', textAlign: 'left',
                    background: 'none', border: 'none', cursor: 'pointer',
                    fontSize: 13, color: TEXT_PRIMARY, fontFamily: 'inherit', fontWeight: 500,
                    display: 'flex', alignItems: 'center', gap: 8,
                    borderBottom: `1px solid ${BORDER}`,
                  }}
                  onMouseEnter={e => (e.currentTarget.style.background = '#f8fafc')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'none')}
                >
                  <FileInput size={14} color="#64748b" /> Import formats
                </button>
                <button
                  onClick={() => { setShowUserMenu(false); onSignOut?.() }}
                  style={{
                    width: '100%', padding: '10px 14px', textAlign: 'left',
                    background: 'none', border: 'none', cursor: 'pointer',
                    fontSize: 13, color: '#ef4444', fontFamily: 'inherit', fontWeight: 500,
                  }}
                  onMouseEnter={e => (e.currentTarget.style.background = '#fef2f2')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'none')}
                >
                  Sign out
                </button>
              </div>
            )}
          </div>
        )}
        </div>{/* end home-inner */}
      </header>

      {/* Tag filter bar */}
      <div style={{ borderBottom: '1px solid #b0b8cc', background: SURFACE }}>
      <div style={{
        display: 'flex', gap: 6, overflowX: 'auto', padding: '8px 16px',
        scrollbarWidth: 'none', alignItems: 'center',
        maxWidth: 1600, margin: '0 auto',
      }}>
        {/* All */}
        {(() => {
          const isActive = activeTag === null
          return (
            <button onClick={() => setActiveTag(null)} style={{
              display: 'flex', alignItems: 'center', gap: 5,
              padding: '5px 13px', borderRadius: 999, fontSize: 12, fontWeight: 600,
              fontFamily: 'inherit', cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0,
              border: isActive ? '1.5px solid #1e293b' : `1.5px solid ${BORDER}`,
              background: isActive ? '#1e293b' : '#fff',
              color: isActive ? '#fff' : TEXT_MUTED,
              transition: 'all 0.15s',
            }}>
              {!isMobile && 'All'}
              {isMobile && <LayoutGrid size={11} />}
              <span style={{ fontSize: 11, fontWeight: 700, opacity: 0.7 }}>{diagrams.length}</span>
            </button>
          )
        })()}

        {/* Tag pills */}
        {allTags.map(tag => {
          const bg = tagBg(tag, tagColorMap)
          const isActive = activeTag === tag
          const count = diagrams.filter(d => (d.tags ?? []).includes(tag)).length
          return (
            <button key={tag} onClick={() => setActiveTag(isActive ? null : tag)}
              style={{
                display: 'flex', alignItems: 'center', gap: 5,
                padding: '5px 13px', borderRadius: 999, fontSize: 12, fontWeight: 600,
                fontFamily: 'inherit', cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0,
                border: isActive ? `1.5px solid ${bg}` : `1.5px solid ${bg}55`,
                background: isActive ? bg : `${bg}12`,
                color: isActive ? '#fff' : bg,
                transition: 'all 0.15s',
              }}>
              <TagIcon tag={tag} size={11} />
              {!isMobile && tag}
              <span style={{ fontSize: 11, fontWeight: 700, opacity: isActive ? 0.85 : 0.6 }}>{count}</span>
            </button>
          )
        })}

        {/* No Tag */}
        {(() => {
          const isActive = activeTag === '__no_tag__'
          const count = diagrams.filter(d => (d.tags ?? []).length === 0).length
          return (
            <button onClick={() => setActiveTag(isActive ? null : '__no_tag__')} style={{
              display: 'flex', alignItems: 'center', gap: 5,
              padding: '5px 13px', borderRadius: 999, fontSize: 12, fontWeight: 600,
              fontFamily: 'inherit', cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0,
              border: isActive ? '1.5px solid #64748b' : `1.5px solid ${BORDER}`,
              background: isActive ? '#64748b' : '#fff',
              color: isActive ? '#fff' : TEXT_MUTED,
              transition: 'all 0.15s',
            }}>
              <Tag size={11} />
              {!isMobile && 'No Tag'}
              <span style={{ fontSize: 11, fontWeight: 700, opacity: 0.7 }}>{count}</span>
            </button>
          )
        })()}
      </div>{/* inner */}
      </div>{/* tag bar outer */}

      <main style={{ maxWidth: '100%' }} className="home-main">

        {filtered.length === 0 && (
          <div style={{
            position: 'fixed', inset: 0, top: 56,
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            pointerEvents: 'none',
          }}>
            <div style={{ opacity: 0.25, marginBottom: 16 }}><MindmapsLogo size={40} /></div>
            <p style={{ fontSize: 15, color: '#94a3b8', fontWeight: 600, margin: 0 }}>No maps yet</p>
            <p style={{ fontSize: 13, color: '#cbd5e1', marginTop: 6 }}>Tap + to create your first map</p>
          </div>
        )}

        {/* All Maps */}
        {filtered.length > 0 && (
          <section>
            <h2 style={{ fontSize: 11, fontWeight: 600, color: TEXT_MUTED, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 6 }}>
              <LayoutGrid size={11} color={TEXT_MUTED} /> All Maps
              <span style={{ fontSize: 13, fontWeight: 800, color: '#6366f1' }}>{filtered.length}</span>
            </h2>
            <div className="home-grid">
              {filtered.map(d => (
                <DiagramCard
                  key={d.id} diagram={d} timeAgo={timeAgo(d.updatedAt)}
                  onOpen={() => onOpen(d.id)} onDelete={() => deleteDiagram(d.id, d.name)}
                  isPublic={d.isPublic} tags={d.tags} tagColorMap={tagColorMap}
                  onTagEdit={() => { setTagModalId(d.id) }}
                  flash={flashId === d.id}
                />
              ))}
            </div>
          </section>
        )}
      </main>

      {/* Floating New Map button */}
      <button
        onClick={() => setShowCreate(true)}
        title="New Map"
        style={{
          position: 'fixed', bottom: 28, right: 28,
          width: 56, height: 56, borderRadius: '50%',
          background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
          border: 'none', cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 4px 24px rgba(99,102,241,0.5)',
          animation: 'fabPulse 2.5s ease-in-out infinite',
          zIndex: 20,
        }}
      >
        <Plus size={24} color="#fff" strokeWidth={2.5} />
      </button>
      <style>{`
        @keyframes fabPulse {
          0%, 100% { box-shadow: 0 4px 24px rgba(99,102,241,0.5); transform: scale(1); }
          50%       { box-shadow: 0 4px 40px rgba(99,102,241,0.75); transform: scale(1.06); }
        }
        @keyframes cardFlash {
          0%   { box-shadow: 0 0 0 2px #6366f1, 0 0 24px rgba(99,102,241,0.6); border-color: #6366f1; }
          40%  { box-shadow: 0 0 0 4px #6366f1, 0 0 40px rgba(99,102,241,0.8); border-color: #6366f1; }
          70%  { box-shadow: 0 0 0 2px #6366f1, 0 0 20px rgba(99,102,241,0.5); border-color: #6366f1; }
          100% { box-shadow: 0 1px 4px rgba(0,0,0,0.06); border-color: var(--card-border); }
        }
        input::placeholder { color: #94a3b8 !important; }
        .home-grid {
          display: grid;
          gap: 12px;
          grid-template-columns: repeat(2, 1fr);
        }
        @media (min-width: 480px)  { .home-grid { grid-template-columns: repeat(3, 1fr); } }
        @media (min-width: 768px)  { .home-grid { grid-template-columns: repeat(4, 1fr); } }
        @media (min-width: 1024px) { .home-grid { grid-template-columns: repeat(5, 1fr); } }
        @media (min-width: 1280px) { .home-grid { grid-template-columns: repeat(6, 1fr); } }
        @media (min-width: 1600px) { .home-grid { grid-template-columns: repeat(7, 1fr); } }
        .home-header { padding: 0 16px !important; }
        @media (min-width: 640px) { .home-header { padding: 0 24px !important; } }
        .home-search { width: 160px !important; }
        @media (min-width: 640px) { .home-search { width: 220px !important; } }
        .home-main { padding: 24px 16px !important; max-width: 1600px !important; margin: 0 auto !important; }
        @media (min-width: 640px) { .home-main { padding: 32px 24px !important; } }
        .home-inner { max-width: 1600px; margin: 0 auto; padding: 0 16px; }
        @media (min-width: 640px) { .home-inner { padding: 0 24px; } }
      `}</style>

      {/* Create modal */}
      {showCreate && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.32)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50,
          backdropFilter: 'blur(6px)',
        }} onClick={() => { if (!aiLoading) { setShowCreate(false); setAiError('') } }}>
          <div style={{
            background: SURFACE, borderRadius: 20, padding: 28, width: 'min(420px, 92vw)',
            boxShadow: '0 24px 64px rgba(0,0,0,0.18), 0 0 0 1px rgba(99,102,241,0.1)',
          }} onClick={e => e.stopPropagation()}>

            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
              <div style={{
                width: 32, height: 32, borderRadius: 10,
                background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
              }}>
                <Sparkles size={16} color="#fff" />
              </div>
              <h3 style={{ fontSize: 16, fontWeight: 700, color: TEXT_PRIMARY, margin: 0 }}>Create with AI</h3>
            </div>

            {/* AI prompt area */}
            {aiLoading ? (
              <div style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                gap: 12, padding: '32px 0',
              }}>
                <div style={{ animation: 'spin 1s linear infinite', display: 'flex' }}>
                  <Loader2 size={28} color="#6366f1" />
                </div>
                <p style={{ fontSize: 13, color: TEXT_MUTED, margin: 0 }}>Generating your mindmap…</p>
              </div>
            ) : (
              <>
                <label style={{ fontSize: 12, fontWeight: 600, color: TEXT_MUTED, display: 'block', marginBottom: 8 }}>
                  Describe what you want to map
                </label>
                <textarea
                  autoFocus
                  value={aiPrompt}
                  onChange={e => { setAiPrompt(e.target.value); setAiError('') }}
                  onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleAiGenerate() }}
                  placeholder={'e.g. "Business plan for a SaaS startup"\n"Software architecture layers"\n"Marketing strategy for a mobile app"'}
                  rows={4}
                  style={{
                    width: '100%', padding: '12px 14px', fontSize: 13,
                    border: `1.5px solid ${aiError ? '#fca5a5' : BORDER}`,
                    borderRadius: 12, outline: 'none', resize: 'none',
                    fontFamily: 'inherit', boxSizing: 'border-box',
                    background: '#f8fafc', color: TEXT_PRIMARY, lineHeight: 1.6,
                    transition: 'border-color 0.15s',
                  }}
                  onFocus={e => { e.currentTarget.style.borderColor = '#a5b4fc' }}
                  onBlur={e => { e.currentTarget.style.borderColor = aiError ? '#fca5a5' : BORDER }}
                />
                {aiError && (
                  <p style={{ fontSize: 12, color: '#ef4444', margin: '6px 0 0', lineHeight: 1.4 }}>{aiError}</p>
                )}

                {/* Generate button */}
                <button
                  onClick={handleAiGenerate}
                  disabled={!aiPrompt.trim()}
                  style={{
                    width: '100%', marginTop: 12, padding: '11px 0',
                    background: aiPrompt.trim()
                      ? 'linear-gradient(135deg, #6366f1, #8b5cf6)'
                      : '#e2e8f0',
                    color: aiPrompt.trim() ? '#fff' : '#94a3b8',
                    border: 'none', borderRadius: 11, cursor: aiPrompt.trim() ? 'pointer' : 'not-allowed',
                    fontSize: 14, fontWeight: 600, fontFamily: 'inherit',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
                    transition: 'opacity 0.15s',
                  }}
                >
                  <Sparkles size={15} />
                  Generate Mindmap
                </button>

              </>
            )}
          </div>
        </div>
      )}
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>

      {/* Dark mode vars */}
      <style>{`
        :root { --card-bg: ${SURFACE}; --card-border: ${BORDER}; --card-border-hover: ${BORDER_HOVER}; }
      `}</style>

      {/* Tag edit modal */}
      {tagModalId && (() => {
        const d = diagrams.find(x => x.id === tagModalId)
        if (!d) return null
        const currentTags = d.tags ?? []
        const available = allTags.filter(t => !currentTags.includes(t))
        function addTag(tag: string) {
          const t = tag.trim()
          if (!t || currentTags.includes(t)) return
          updateTags(tagModalId!, [...currentTags, t])
        }
        function removeTag(tag: string) {
          updateTags(tagModalId!, currentTags.filter(t => t !== tag))
        }
        return (
          <div style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200,
            backdropFilter: 'blur(6px)',
          }} onClick={() => setTagModalId(null)}>
            <div style={{
              background: '#fff', borderRadius: 20, padding: 24, width: 'min(380px, 92vw)',
              boxShadow: '0 24px 64px rgba(0,0,0,0.2)',
            }} onClick={e => e.stopPropagation()}>

              {/* Header */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: TEXT_PRIMARY }}>{d.name}</div>
                  <div style={{ fontSize: 12, color: TEXT_MUTED, marginTop: 2 }}>Edit tags</div>
                </div>
                <button onClick={() => setTagModalId(null)}
                  style={{ width: 30, height: 30, borderRadius: 8, border: `1px solid ${BORDER}`, background: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: TEXT_MUTED }}>
                  <X size={14} />
                </button>
              </div>

              {/* Current tags */}
              {currentTags.length > 0 && (
                <div style={{ marginBottom: 14 }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: TEXT_MUTED, marginBottom: 8 }}>Current tags</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {currentTags.map(t => (
                      <button key={t} onClick={() => { removeTag(t); setTagModalId(null) }}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 5,
                          fontSize: 12, fontWeight: 700, padding: '5px 12px', borderRadius: 999,
                          background: tagBg(t, tagColorMap), color: '#fff',
                          border: 'none', cursor: 'pointer', fontFamily: 'inherit',
                        }}>
                        {t} <X size={10} strokeWidth={3} />
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Add tags */}
              {available.length > 0 && (
                <div style={{ marginBottom: 14 }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: TEXT_MUTED, marginBottom: 8 }}>Add tag</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {available.map(t => (
                      <button key={t} onClick={() => { addTag(t); setTagModalId(null) }}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 5,
                          fontSize: 12, fontWeight: 600, padding: '5px 12px', borderRadius: 999,
                          background: `${tagBg(t, tagColorMap)}15`, color: tagBg(t, tagColorMap),
                          border: `1.5px solid ${tagBg(t, tagColorMap)}55`,
                          cursor: 'pointer', fontFamily: 'inherit',
                        }}>
                        <TagIcon tag={t} size={11} /> {t}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Custom tag input */}
              <div>
                <div style={{ fontSize: 11, fontWeight: 600, color: TEXT_MUTED, marginBottom: 8 }}>New tag</div>
                <form onSubmit={e => {
                  e.preventDefault()
                  const input = (e.currentTarget.elements.namedItem('newTag') as HTMLInputElement)
                  const val = input.value.trim()
                  if (val) { addTag(val); setTagModalId(null) }
                }} style={{ display: 'flex', gap: 6 }}>
                  <input name="newTag" placeholder="Type a new tag…" autoFocus
                    style={{
                      flex: 1, fontSize: 13, padding: '7px 12px', borderRadius: 10,
                      border: `1.5px solid ${BORDER}`, outline: 'none', fontFamily: 'inherit',
                      color: TEXT_PRIMARY, background: '#f8fafc',
                    }}
                    onFocus={e => e.currentTarget.style.borderColor = '#6366f1'}
                    onBlur={e => e.currentTarget.style.borderColor = BORDER}
                  />
                  <button type="submit" style={{
                    padding: '7px 14px', borderRadius: 10, border: 'none',
                    background: '#6366f1', color: '#fff', fontSize: 12, fontWeight: 600,
                    cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap',
                  }}>Add</button>
                </form>
              </div>

            </div>
          </div>
        )
      })()}
    </div>
  )
}

// ── DiagramMinimap ─────────────────────────────────────────────────────────


function DiagramMinimap({ id, type }: { id: string; type: string }) {
  const storeThemeId = useMindmapStore(s => s.themeId)
  const [nodes, setNodes] = useState<MindmapNode[]>([])
  const [diagramThemeId, setDiagramThemeId] = useState<string>('default')
  const [lineStyle, setLineStyle] = useState<string>('orthogonal')

  useEffect(() => {
    try {
      const data = JSON.parse(localStorage.getItem(`mindmaps:diagram:${id}`) ?? 'null')
      if (data?.nodes?.length) {
        setNodes(data.nodes)
        setDiagramThemeId(data.themeId ?? 'default')
        setLineStyle(data.lineStyle ?? 'orthogonal')
      }
    } catch {}
  }, [id, storeThemeId])

  const theme = getTheme(diagramThemeId)
  const canvasBg = theme.canvasBg
  // Root node fill: contrasting color for the theme's canvas
  const isDarkCanvas = (() => {
    const hex = canvasBg.replace('#', '')
    const r = parseInt(hex.slice(0, 2), 16)
    const g = parseInt(hex.slice(2, 4), 16)
    const b = parseInt(hex.slice(4, 6), 16)
    return (r * 299 + g * 587 + b * 114) / 1000 < 128
  })()
  const rootFill = isDarkCanvas ? theme.colors[0] : '#1e293b'
  const spineFill = isDarkCanvas ? 'rgba(255,255,255,0.3)' : '#94a3b8'

  const root = nodes.find(n => n.parentId === null)
  const l1s = root
    ? nodes.filter(n => n.parentId === root.id).sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
    : []

  if (l1s.length === 0) {
    return (
      <div style={{ width: '100%', height: '100%', background: canvasBg, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '0 0 14px 14px' }}>
        <div style={{ fontSize: 11, color: isDarkCanvas ? 'rgba(255,255,255,0.3)' : '#cbd5e1', fontWeight: 500 }}>Open to preview</div>
      </div>
    )
  }

  // Thumbnail root: show actual shape but fixed size for consistency
  const isRootPill = root?.shape === 'pill' || (!root?.shape && (root?.title?.length ?? 0) >= 15)
  const THUMB_ROOT_R = 10
  const THUMB_PILL_W = 28, THUMB_PILL_H = 14
  const rootShape = (cx2: number, cy2: number) => isRootPill
    ? <rect x={cx2 - THUMB_PILL_W / 2} y={cy2 - THUMB_PILL_H / 2} width={THUMB_PILL_W} height={THUMB_PILL_H} rx={THUMB_PILL_H / 2} fill={rootFill} />
    : <circle cx={cx2} cy={cy2} r={THUMB_ROOT_R} fill={rootFill} />

  // Diagram content area — padding is baked into the viewBox so canvasBg fills edge-to-edge
  const P = 14  // internal padding
  const W = 200, H = 110
  const VB = `${-P} ${-P} ${W + P * 2} ${H + P * 2}`  // expanded viewBox

  // Fixed 6 vibrant colors for thumbnail L1 nodes — quick visual identification
  const THUMB_COLORS = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#3b82f6', '#8b5cf6']
  const thumbL1s = l1s.slice(0, 6).map((l1, i) => ({ ...l1, color: THUMB_COLORS[i % THUMB_COLORS.length] }))

  // ── Logic Chart ──────────────────────────────────────────────────
  if (type === 'logic-chart' || !type) {
    const n = thumbL1s.length
    const rowH = (H - 14) / n
    const l1H = Math.max(7, Math.min(18, Math.round(rowH * 0.65)))
    const totalH = n * l1H + (n - 1) * (rowH - l1H)
    const startY = (H - totalH) / 2
    const rootCY = H / 2
    const rootRight = 22 + THUMB_ROOT_R
    const barX = rootRight + 10, l1X = barX + 8, l1W = 100

    return (
      <svg viewBox={VB} style={{ width: '100%', height: '100%' }} overflow="hidden">
        <rect x={-P} y={-P} width={W + P * 2} height={H + P * 2} fill={canvasBg} />
        <g transform={`translate(${W / 2} ${H / 2}) scale(0.8) translate(${-W / 2} ${-H / 2})`}>
          {rootShape(22, rootCY)}
          {lineStyle === 'straight' ? (
            /* Straight: diagonal lines from root to each L1 */
            thumbL1s.map((l1, i) => {
              const cy = startY + i * rowH + l1H / 2
              return (
                <g key={l1.id}>
                  <line x1={rootRight} y1={rootCY} x2={l1X} y2={cy} stroke={l1.color} strokeWidth={1.8} strokeLinecap="round" />
                  <rect x={l1X} y={cy - l1H / 2} width={l1W} height={l1H} rx={l1H / 2} fill={l1.color} />
                </g>
              )
            })
          ) : lineStyle === 'curved' ? (
            /* Brace/curved: curly bracket from root to each L1 */
            <>
              <line x1={rootRight} y1={rootCY} x2={rootRight + 6} y2={rootCY} stroke={rootFill} strokeWidth={2.5} strokeLinecap="round" />
              {thumbL1s.map((l1, i) => {
                const cy = startY + i * rowH + l1H / 2
                const midX = rootRight + 8
                const curveR = Math.min(8, Math.abs(cy - rootCY) / 2)
                const dir = cy > rootCY ? 1 : cy < rootCY ? -1 : 0
                return (
                  <g key={l1.id}>
                    <path
                      d={dir === 0
                        ? `M${midX},${rootCY} L${l1X},${cy}`
                        : `M${midX},${rootCY} L${midX},${cy - dir * curveR} Q${midX},${cy} ${midX + curveR},${cy} L${l1X},${cy}`
                      }
                      fill="none" stroke={l1.color} strokeWidth={1.8} strokeLinecap="round" />
                    <rect x={l1X} y={cy - l1H / 2} width={l1W} height={l1H} rx={l1H / 2} fill={l1.color} />
                  </g>
                )
              })}
            </>
          ) : (
            /* Orthogonal (default): vertical bar + horizontal stubs */
            <>
              <line x1={rootRight} y1={rootCY} x2={barX} y2={rootCY} stroke={rootFill} strokeWidth={2.5} strokeLinecap="round" />
              {n > 1 && <line x1={barX} y1={startY + l1H / 2} x2={barX} y2={startY + totalH - l1H / 2} stroke={thumbL1s[Math.floor(n / 2)].color} strokeWidth={2.5} />}
              {thumbL1s.map((l1, i) => {
                const cy = startY + i * rowH + l1H / 2
                return (
                  <g key={l1.id}>
                    <line x1={barX} y1={cy} x2={l1X} y2={cy} stroke={l1.color} strokeWidth={1.8} strokeLinecap="round" />
                    <rect x={l1X} y={cy - l1H / 2} width={l1W} height={l1H} rx={l1H / 2} fill={l1.color} />
                  </g>
                )
              })}
            </>
          )}
        </g>
      </svg>
    )
  }

  // ── Mindmap (radial) ─────────────────────────────────────────────
  if (type === 'mindmap') {
    const cx = W / 2, cy = H / 2
    const visible = thumbL1s
    const vn = visible.length
    const angleStep = (2 * Math.PI) / Math.max(vn, 1)
    const startAngle = -Math.PI / 2
    const armLen = 42, dotR = 6

    return (
      <svg viewBox={VB} style={{ width: '100%', height: '100%' }} overflow="hidden">
        <rect x={-P} y={-P} width={W + P * 2} height={H + P * 2} fill={canvasBg} />
        {visible.map((l1, i) => {
          const angle = startAngle + i * angleStep
          const x2 = cx + armLen * Math.cos(angle)
          const y2 = cy + armLen * Math.sin(angle)
          return (
            <g key={l1.id}>
              <line x1={cx} y1={cy} x2={x2} y2={y2} stroke={l1.color} strokeWidth={1.8} strokeLinecap="round" />
              <circle cx={x2} cy={y2} r={dotR} fill={l1.color} />
            </g>
          )
        })}
        {/* Root shape on top */}
        {rootShape(cx, cy)}
      </svg>
    )
  }

  // ── Fishbone ─────────────────────────────────────────────────────
  if (type === 'fishbone') {
    const spineY = H / 2
    const rootEndX = 30

    return (
      <svg viewBox={VB} style={{ width: '100%', height: '100%' }} overflow="hidden">
        <rect x={-P} y={-P} width={W + P * 2} height={H + P * 2} fill={canvasBg} />
        {/* Root on the LEFT */}
        {rootShape(17, spineY)}
        {/* Spine from root rightward */}
        <line x1={rootEndX} y1={spineY} x2={W - 14} y2={spineY} stroke={spineFill} strokeWidth={2.5} strokeLinecap="round" />
        {thumbL1s.map((l1, i) => {
          const above = i % 2 === 0
          const nPairs = Math.ceil(thumbL1s.length / 2)
          const pairGap = (W - rootEndX - 40) / Math.max(nPairs, 1)
          const x = rootEndX + 16 + Math.floor(i / 2) * pairGap
          const tipX = x + 18, tipY = above ? spineY - 26 : spineY + 26
          return (
            <g key={l1.id}>
              <line x1={x} y1={spineY} x2={tipX} y2={tipY} stroke={l1.color} strokeWidth={1.8} strokeLinecap="round" />
              <rect x={tipX - 12} y={tipY - 6} width={24} height={12} rx={2} fill={l1.color} />
            </g>
          )
        })}
      </svg>
    )
  }

  // ── Timeline ─────────────────────────────────────────────────────
  if (type === 'timeline') {
    const spineY = H / 2, n = thumbL1s.length
    const rootEndX = 8 + THUMB_ROOT_R * 2 + 4
    const step = (W - rootEndX - 14) / Math.max(n, 1)

    return (
      <svg viewBox={VB} style={{ width: '100%', height: '100%' }} overflow="hidden">
        <rect x={-P} y={-P} width={W + P * 2} height={H + P * 2} fill={canvasBg} />
        {rootShape(8 + THUMB_ROOT_R, spineY)}
        <line x1={rootEndX} y1={spineY} x2={W - 14} y2={spineY} stroke={spineFill} strokeWidth={2} strokeLinecap="round" />
        {thumbL1s.map((l1, i) => {
          const x = rootEndX + i * step + step / 2
          const above = i % 2 === 0
          const boxY = above ? spineY - 34 : spineY + 12
          return (
            <g key={l1.id}>
              <circle cx={x} cy={spineY} r={4} fill={l1.color} />
              <line x1={x} y1={above ? spineY - 4 : spineY + 4} x2={x} y2={above ? boxY + 14 : boxY} stroke={l1.color} strokeWidth={1.5} />
              <rect x={x - 16} y={boxY} width={32} height={14} rx={3} fill={l1.color} opacity={0.9} />
            </g>
          )
        })}
      </svg>
    )
  }

  // ── Default fallback (render as logic chart) ──────────────────────
  const n2 = thumbL1s.length, rowH2 = (H - 14) / Math.max(n2, 1)
  const l1H2 = Math.max(7, Math.min(18, Math.round(rowH2 * 0.65)))
  const totalH2 = n2 * l1H2 + (n2 - 1) * (rowH2 - l1H2)
  const startY2 = (H - totalH2) / 2
  return (
    <svg viewBox={VB} style={{ width: '100%', height: '100%' }} overflow="hidden">
      <rect x={-P} y={-P} width={W + P * 2} height={H + P * 2} fill={canvasBg} />
      <g transform={`translate(${W / 2} ${H / 2}) scale(0.8) translate(${-W / 2} ${-H / 2})`}>
      {rootShape(22, H / 2)}
      <line x1={32} y1={H / 2} x2={42} y2={H / 2} stroke={rootFill} strokeWidth={2.5} strokeLinecap="round" />
      {n2 > 1 && <line x1={42} y1={startY2 + l1H2 / 2} x2={42} y2={startY2 + totalH2 - l1H2 / 2} stroke={thumbL1s[Math.floor(n2 / 2)]?.color ?? '#94a3b8'} strokeWidth={2.5} />}
      {thumbL1s.map((l1, i) => {
        const cy2 = startY2 + i * rowH2 + l1H2 / 2
        return (
          <g key={l1.id}>
            <line x1={42} y1={cy2} x2={50} y2={cy2} stroke={l1.color} strokeWidth={1.8} strokeLinecap="round" />
            <rect x={50} y={cy2 - l1H2 / 2} width={100} height={l1H2} rx={l1H2 / 2} fill={l1.color} />
          </g>
        )
      })}
      </g>
    </svg>
  )
}

// ── DiagramCard ────────────────────────────────────────────────────────────

function DiagramCard({ diagram, timeAgo, onOpen, onDelete, isPublic, tags, tagColorMap, onTagEdit, flash }: {
  diagram: DiagramMeta; timeAgo: string; onOpen: () => void; onDelete: () => void
  isPublic?: boolean; tags?: string[]
  tagColorMap: Map<string, string>; onTagEdit: () => void; flash?: boolean
}) {
  const [hovered, setHovered] = useState(false)
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const currentTags = tags ?? []

  return (
    <div
      onMouseEnter={() => { setHovered(true); soundHover() }}
      onMouseLeave={() => setHovered(false)}
      onTouchStart={() => { longPressTimer.current = setTimeout(() => setHovered(true), 500) }}
      onTouchEnd={() => { if (longPressTimer.current) clearTimeout(longPressTimer.current) }}
      onTouchMove={() => { if (longPressTimer.current) clearTimeout(longPressTimer.current) }}
      style={{
        background: 'var(--card-bg)',
        border: `1px solid ${flash ? '#6366f1' : hovered ? 'var(--card-border-hover)' : 'var(--card-border)'}`,
        borderRadius: 16, overflow: 'hidden', cursor: 'pointer', position: 'relative',
        transition: flash ? 'none' : 'border-color 0.2s, box-shadow 0.2s, transform 0.2s',
        animation: flash ? 'cardFlash 3s ease-out forwards' : undefined,
        boxShadow: hovered && !flash
          ? '0 0 0 3px rgba(99,102,241,0.08), 0 0 20px rgba(99,102,241,0.14), 0 4px 16px rgba(0,0,0,0.07)'
          : '0 1px 4px rgba(0,0,0,0.06)',
        transform: hovered ? 'translateY(-2px)' : 'translateY(0)',
      }}
      onClick={() => { soundClick(); onOpen() }}
    >
      {/* Header */}
      <div style={{ padding: '10px 13px 8px', background: '#f8fafc', borderBottom: '1px solid #eef0f5' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: '#475569', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
            {diagram.name}
          </div>
          {isPublic && <Globe size={11} color="#6366f1" style={{ flexShrink: 0 }} />}
          <div style={{ fontSize: 10, color: '#94a3b8', flexShrink: 0 }}>{timeAgo}</div>
        </div>
        {currentTags.length > 0 && (
          <div style={{ display: 'flex', gap: 4, marginTop: 5, flexWrap: 'wrap' }}>
            {currentTags.slice(0, 4).map(t => (
              <span key={t} style={{
                fontSize: 7, fontWeight: 700, padding: '1px 5px', borderRadius: 6,
                background: tagBg(t, tagColorMap), color: '#fff', letterSpacing: '0.03em',
              }}>{t}</span>
            ))}
          </div>
        )}
      </div>

      {/* Thumbnail */}
      <div style={{ height: 110, background: 'transparent', position: 'relative' }}>
        <DiagramMinimap id={diagram.id} type={diagram.type} />
        {hovered && (
          <>
            <button onClick={e => { e.stopPropagation(); onTagEdit() }} title="Edit tags"
              style={{ position: 'absolute', top: 8, left: 8, width: 28, height: 28, borderRadius: 8, border: '1px solid #e2e8f0', background: 'rgba(255,255,255,0.92)', cursor: 'pointer', color: '#94a3b8', display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(8px)' }}>
              <Tag size={13} />
            </button>
            <button onClick={e => { e.stopPropagation(); setHovered(false); onDelete() }}
              style={{ position: 'absolute', top: 8, right: 8, width: 28, height: 28, borderRadius: 8, border: '1px solid #fecaca', background: 'rgba(255,255,255,0.92)', cursor: 'pointer', color: '#ef4444', display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(8px)' }}>
              <Trash2 size={13} />
            </button>
          </>
        )}
      </div>
    </div>
  )
}
