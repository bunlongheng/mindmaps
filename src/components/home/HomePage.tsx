import { useState, useEffect, useRef, useMemo } from 'react'
import { useMindmapStore } from '../../store/mindmapStore'
import { useDiagram } from '../../hooks/useDiagram'
import type { DiagramMeta, MindmapNode } from '../../types'
import { Plus, Search, Clock, Trash2, Star, LayoutGrid, Globe, Sparkles, Loader2, Tag, X, Bot, Briefcase, User, BookOpen, Zap, GraduationCap, FlaskConical, Beaker, type LucideIcon } from 'lucide-react'
import { MindmapsLogo } from '../MindmapsLogo'
import { getTheme } from '../../lib/themes'
import { AIThinkingOverlay } from '../AIThinkingOverlay'

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
  const { loadDiagramList, createDiagram, deleteDiagram, toggleFavorite, updateTags } = useDiagram(user?.id ?? null)

  // Compute a unique color per tag (sorted alphabetically → palette index)
  const tagColorMap = useMemo(() => {
    const allTags = [...new Set([...PRESET_TAGS, ...diagrams.flatMap(d => d.tags ?? [])])]
    return buildTagColorMap(allTags)
  }, [diagrams])
  const [search, setSearch] = useState('')
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [aiPrompt, setAiPrompt] = useState('')
  const [aiLoading, setAiLoading] = useState(false)
  const [aiError, setAiError] = useState('')
  const [activeTag, setActiveTag] = useState<string | null>(null) // null=All, '__no_tag__'=untagged, else tag name
  const [tagModalId, setTagModalId] = useState<string | null>(null)
  const [tagModalInput, setTagModalInput] = useState('')
  const [bgLevel, setBgLevel] = useState<0|1|2>(() => {
    const saved = localStorage.getItem('mindmaps:bgLevel')
    return (saved === '1' ? 1 : saved === '2' ? 2 : 0) as 0|1|2
  })
  const [showUserMenu, setShowUserMenu] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const favScrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => { loadDiagramList() }, [])

  // Capture horizontal trackpad scroll on favorites row — prevent browser back/forward
  useEffect(() => {
    const el = favScrollRef.current
    if (!el) return
    function onWheel(e: WheelEvent) {
      if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
        e.preventDefault()
        el!.scrollLeft += e.deltaX
      }
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [])

  // Close user menu on outside click
  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setShowUserMenu(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
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

  const favDiagrams = filtered.filter(d => d.isFav)
  const recentDiagrams = filtered.filter(d => !d.isFav)

  async function handleCreate() {
    const name = newName.trim() || 'Untitled'
    setCreating(true)
    await createDiagram(name)
    setNewName('')
    setShowCreate(false)
    setCreating(false)
    const fresh = useMindmapStore.getState().diagrams[0]
    if (fresh) onOpen(fresh.id)
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
      const data = await res.json() as { id?: string; error?: string }
      if (!res.ok || !data.id) throw new Error(data.error ?? 'Generation failed')
      // Skip home — go straight to the new diagram with confetti flag
      window.location.href = `/?id=${data.id}&imported=1`
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
  const avatarUrl = (() => {
    const live = user?.user_metadata?.avatar_url as string | undefined
    if (live) { localStorage.setItem('mindmaps:avatar', live); return live }
    return localStorage.getItem('mindmaps:avatar') ?? undefined
  })()
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

        {user && (
          <div ref={menuRef} style={{ position: 'relative' }}>
            <button
              onClick={() => setShowUserMenu(p => !p)}
              style={{
                width: 34, height: 34, borderRadius: '50%', overflow: 'hidden',
                border: showUserMenu ? '2px solid #6366f1' : `1px solid ${BORDER}`,
                cursor: 'pointer', padding: 0, background: '#e0e7ff',
                transition: 'border-color 0.15s', flexShrink: 0,
                position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
              title={displayName}
            >
              <span style={{ fontSize: 13, fontWeight: 700, color: '#6366f1', userSelect: 'none', lineHeight: 1 }}>
                {displayName[0]?.toUpperCase() ?? '?'}
              </span>
              {avatarUrl && (
                <img src={avatarUrl} alt=""
                  referrerPolicy="no-referrer"
                  style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
                  onError={e => { (e.target as HTMLImageElement).style.display = 'none' }}
                />
              )}
            </button>

            {showUserMenu && (
              <div style={{
                position: 'absolute', top: 42, right: 0, width: 200,
                background: '#fff', borderRadius: 12,
                boxShadow: '0 8px 32px rgba(0,0,0,0.12), 0 0 0 1px #e2e8f0',
                overflow: 'hidden', zIndex: 50,
              }}>
                <div style={{ padding: '12px 14px 10px', borderBottom: `1px solid ${BORDER}` }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: TEXT_PRIMARY, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {displayName}
                  </div>
                  <div style={{ fontSize: 11, color: TEXT_MUTED, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: 2 }}>
                    {user.email}
                  </div>
                </div>
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
              All
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
              {tag}
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
              No Tag
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

        {/* Favorites row */}
        {favDiagrams.length > 0 && (
          <section style={{ marginBottom: 36 }}>
            <h2 style={{ fontSize: 11, fontWeight: 600, color: TEXT_MUTED, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 6 }}>
              <Star size={11} fill="#eab308" color="#eab308" /> Favorites
              <span style={{ fontSize: 13, fontWeight: 800, color: '#eab308' }}>{favDiagrams.length}</span>
            </h2>
            <div style={{ position: 'relative' }}>
              <div ref={favScrollRef} style={{ display: 'flex', gap: 16, overflowX: 'auto', overflowY: 'visible', paddingBottom: 12, paddingTop: 4, scrollbarWidth: 'none' }}>
                {favDiagrams.map(d => (
                  <div key={d.id} style={{ flexShrink: 0, width: 'min(220px, 72vw)' }}>
                    <DiagramCard
                      diagram={d} timeAgo={timeAgo(d.updatedAt)}
                      onOpen={() => onOpen(d.id)} onDelete={() => deleteDiagram(d.id, d.name)}
                      isFav={true} onToggleFav={() => toggleFavorite(d.id)} isPublic={d.isPublic}
                      tags={d.tags} tagColorMap={tagColorMap}
                      onTagEdit={() => { setTagModalId(d.id); setTagModalInput('') }}
                      flash={flashId === d.id}
                    />
                  </div>
                ))}
              </div>
              {favDiagrams.length > 4 && (
                <div style={{ position: 'absolute', right: 0, top: 0, bottom: 12, width: 80, background: `linear-gradient(to right, transparent, ${BG})`, pointerEvents: 'none' }} />
              )}
            </div>
          </section>
        )}

        {/* All / Recent */}
        {recentDiagrams.length > 0 && (
          <section>
            <h2 style={{ fontSize: 11, fontWeight: 600, color: TEXT_MUTED, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 6 }}>
              {favDiagrams.length > 0
                ? <><Clock size={11} color={TEXT_MUTED} /> Recent</>
                : <><LayoutGrid size={11} color={TEXT_MUTED} /> All Maps</>}
              <span style={{ fontSize: 13, fontWeight: 800, color: '#6366f1' }}>{recentDiagrams.length}</span>
            </h2>
            <div className="home-grid">
              {recentDiagrams.map(d => (
                <DiagramCard
                  key={d.id} diagram={d} timeAgo={timeAgo(d.updatedAt)}
                  onOpen={() => onOpen(d.id)} onDelete={() => deleteDiagram(d.id, d.name)}
                  isFav={false} onToggleFav={() => toggleFavorite(d.id)} isPublic={d.isPublic}
                  tags={d.tags} tagColorMap={tagColorMap}
                  onTagEdit={() => { setTagModalId(d.id); setTagModalInput('') }}
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

                {/* Divider */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '18px 0 14px' }}>
                  <div style={{ flex: 1, height: 1, background: BORDER }} />
                  <span style={{ fontSize: 11, color: TEXT_MUTED, fontWeight: 500 }}>or create blank</span>
                  <div style={{ flex: 1, height: 1, background: BORDER }} />
                </div>

                {/* Blank create */}
                <div style={{ display: 'flex', gap: 8 }}>
                  <input
                    value={newName}
                    onChange={e => setNewName(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleCreate()}
                    placeholder="Map name…"
                    style={{
                      flex: 1, padding: '9px 13px', fontSize: 13,
                      border: `1px solid ${BORDER}`, borderRadius: 10, outline: 'none',
                      fontFamily: 'inherit', background: '#f8fafc', color: TEXT_PRIMARY,
                      boxSizing: 'border-box',
                    }}
                  />
                  <button onClick={handleCreate} disabled={creating}
                    style={{
                      padding: '9px 16px', background: '#f1f5f9', color: TEXT_PRIMARY,
                      border: `1px solid ${BORDER}`, borderRadius: 10, cursor: 'pointer',
                      fontSize: 13, fontWeight: 500, fontFamily: 'inherit', whiteSpace: 'nowrap',
                    }}>
                    {creating ? 'Creating…' : 'Create'}
                  </button>
                </div>
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
          setTagModalInput('')
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
              <div style={{ fontSize: 11, fontWeight: 600, color: TEXT_MUTED, marginBottom: 8 }}>Custom tag</div>
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  autoFocus
                  value={tagModalInput}
                  onChange={e => setTagModalInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') addTag(tagModalInput) }}
                  placeholder="Type and press Enter…"
                  style={{
                    flex: 1, fontSize: 13, padding: '9px 13px', border: `1px solid ${BORDER}`,
                    borderRadius: 10, outline: 'none', fontFamily: 'inherit', color: TEXT_PRIMARY,
                  }}
                />
                <button onClick={() => addTag(tagModalInput)}
                  style={{ padding: '9px 16px', background: '#6366f1', color: '#fff', border: 'none', borderRadius: 10, cursor: 'pointer', fontSize: 13, fontWeight: 600, fontFamily: 'inherit' }}>
                  Add
                </button>
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
  const storeThemeId = useMindmapStore(s => s.themeId) // re-read when theme changes
  const [nodes, setNodes] = useState<MindmapNode[]>([])
  const [diagramThemeId, setDiagramThemeId] = useState<string>('default')

  useEffect(() => {
    try {
      const data = JSON.parse(localStorage.getItem(`mindmaps:diagram:${id}`) ?? 'null')
      if (data?.nodes?.length) {
        setNodes(data.nodes)
        setDiagramThemeId(data.themeId ?? 'default')
      }
    } catch {}
  }, [id, storeThemeId]) // re-read when active theme changes

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

  // Diagram content area — padding is baked into the viewBox so canvasBg fills edge-to-edge
  const P = 14  // internal padding
  const W = 200, H = 110
  const VB = `${-P} ${-P} ${W + P * 2} ${H + P * 2}`  // expanded viewBox

  // ── Logic Chart ──────────────────────────────────────────────────
  if (type === 'logic-chart' || !type) {
    const n = l1s.length
    const rowH = (H - 14) / n
    const l1H = Math.max(7, Math.min(18, Math.round(rowH * 0.65)))
    const totalH = n * l1H + (n - 1) * (rowH - l1H)
    const startY = (H - totalH) / 2
    const rootCX = 22, rootCY = H / 2, rootR = 10
    const barX = 52, l1X = 60, l1W = 100

    return (
      <svg viewBox={VB} style={{ width: '100%', height: '100%' }} overflow="hidden">
        <rect x={-P} y={-P} width={W + P * 2} height={H + P * 2} fill={canvasBg} />
        <g transform={`translate(${W / 2} ${H / 2}) scale(0.8) translate(${-W / 2} ${-H / 2})`}>
          <circle cx={rootCX} cy={rootCY} r={rootR} fill={rootFill} />
          <line x1={rootCX + rootR} y1={rootCY} x2={barX} y2={rootCY} stroke={rootFill} strokeWidth={2.5} strokeLinecap="round" />
          {n > 1 && <line x1={barX} y1={startY + l1H / 2} x2={barX} y2={startY + totalH - l1H / 2} stroke={l1s[Math.floor(n / 2)].color} strokeWidth={2.5} />}
          {l1s.map((l1, i) => {
            const cy = startY + i * rowH + l1H / 2
            return (
              <g key={l1.id}>
                <line x1={barX} y1={cy} x2={l1X} y2={cy} stroke={l1.color} strokeWidth={1.8} strokeLinecap="round" />
                <rect x={l1X} y={cy - l1H / 2} width={l1W} height={l1H} rx={l1H / 2} fill={l1.color} />
              </g>
            )
          })}
        </g>
      </svg>
    )
  }

  // ── Mindmap ──────────────────────────────────────────────────────
  if (type === 'mindmap') {
    const cx = W / 2, cy = H / 2, rootR = 16
    const stemLen = 36
    const n = l1s.length

    return (
      <svg viewBox={VB} style={{ width: '100%', height: '100%' }} overflow="hidden">
        <rect x={-P} y={-P} width={W + P * 2} height={H + P * 2} fill={canvasBg} />
        {l1s.map((l1, i) => {
          const angle = (i / n) * Math.PI * 2 - Math.PI / 2
          const l1cx = cx + stemLen * Math.cos(angle)
          const l1cy = cy + stemLen * Math.sin(angle)
          return (
            <g key={l1.id}>
              <line x1={cx} y1={cy} x2={l1cx} y2={l1cy} stroke={l1.color} strokeWidth={2} strokeLinecap="round" />
              <circle cx={l1cx} cy={l1cy} r={10} fill={l1.color} />
            </g>
          )
        })}
        <circle cx={cx} cy={cy} r={rootR} fill={rootFill} />
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
        <rect x={4} y={spineY - 13} width={26} height={26} rx={5} fill={rootFill} />
        {/* Spine from root rightward */}
        <line x1={rootEndX} y1={spineY} x2={W - 14} y2={spineY} stroke={spineFill} strokeWidth={2.5} strokeLinecap="round" />
        {l1s.map((l1, i) => {
          const above = i % 2 === 0
          const x = rootEndX + 26 + Math.floor(i / 2) * 38
          if (x > W - 24) return null
          const tipX = x + 22, tipY = above ? spineY - 28 : spineY + 28
          return (
            <g key={l1.id}>
              <line x1={x} y1={spineY} x2={tipX} y2={tipY} stroke={l1.color} strokeWidth={1.8} strokeLinecap="round" />
              <rect x={tipX - 14} y={tipY - 7} width={28} height={14} rx={3} fill={l1.color} />
            </g>
          )
        })}
      </svg>
    )
  }

  // ── Timeline ─────────────────────────────────────────────────────
  if (type === 'timeline') {
    const spineY = H / 2, n = l1s.length
    const step = (W - 28) / Math.max(n, 1)

    return (
      <svg viewBox={VB} style={{ width: '100%', height: '100%' }} overflow="hidden">
        <rect x={-P} y={-P} width={W + P * 2} height={H + P * 2} fill={canvasBg} />
        <line x1={14} y1={spineY} x2={W - 14} y2={spineY} stroke={spineFill} strokeWidth={2} strokeLinecap="round" />
        {l1s.map((l1, i) => {
          const x = 18 + i * step + step / 2
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

  // ── Tree vertical ────────────────────────────────────────────────
  if (type === 'tree-vertical') {
    const n = l1s.length, step = (W - 20) / Math.max(n, 1)
    return (
      <svg viewBox={VB} style={{ width: '100%', height: '100%' }} overflow="hidden">
        <rect x={-P} y={-P} width={W + P * 2} height={H + P * 2} fill={canvasBg} />
        <rect x={W / 2 - 24} y={8} width={48} height={20} rx={5} fill={rootFill} />
        {l1s.map((l1, i) => {
          const x = 10 + i * step + step / 2
          return (
            <g key={l1.id}>
              <line x1={W / 2} y1={28} x2={x} y2={72} stroke={l1.color} strokeWidth={1.5} />
              <rect x={x - 16} y={72} width={32} height={16} rx={4} fill={l1.color} />
            </g>
          )
        })}
      </svg>
    )
  }

  // ── Tree horizontal (default fallback) ───────────────────────────
  const n2 = l1s.length, step2 = (H - 16) / Math.max(n2, 1)
  return (
    <svg viewBox={VB} style={{ width: '100%', height: '100%' }} overflow="hidden">
      <rect x={-P} y={-P} width={W + P * 2} height={H + P * 2} fill={canvasBg} />
      <rect x={12} y={H / 2 - 16} width={24} height={32} rx={5} fill={rootFill} />
      {l1s.map((l1, i) => {
        const y = 8 + i * step2 + step2 / 2
        return (
          <g key={l1.id}>
            <line x1={36} y1={H / 2} x2={64} y2={y} stroke={l1.color} strokeWidth={1.5} />
            <rect x={64} y={y - 8} width={56} height={16} rx={4} fill={l1.color} />
          </g>
        )
      })}
    </svg>
  )
}

// ── DiagramCard ────────────────────────────────────────────────────────────

function DiagramCard({ diagram, timeAgo, onOpen, onDelete, isFav, onToggleFav, isPublic, tags, tagColorMap, onTagEdit, flash }: {
  diagram: DiagramMeta; timeAgo: string; onOpen: () => void; onDelete: () => void
  isFav: boolean; onToggleFav: () => void; isPublic?: boolean; tags?: string[]
  tagColorMap: Map<string, string>; onTagEdit: () => void; flash?: boolean
}) {
  const [hovered, setHovered] = useState(false)
  const currentTags = tags ?? []

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
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
      onClick={onOpen}
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
            <button onClick={e => { e.stopPropagation(); onToggleFav() }} title={isFav ? 'Unfavorite' : 'Favorite'}
              style={{ position: 'absolute', top: 8, left: 8, width: 28, height: 28, borderRadius: 8, border: isFav ? '1px solid #fde68a' : '1px solid #e2e8f0', background: 'rgba(255,255,255,0.92)', cursor: 'pointer', color: isFav ? '#eab308' : '#94a3b8', display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(8px)' }}>
              <Star size={13} fill={isFav ? '#eab308' : 'none'} />
            </button>
            <button onClick={e => { e.stopPropagation(); onTagEdit() }} title="Edit tags"
              style={{ position: 'absolute', top: 8, left: 44, width: 28, height: 28, borderRadius: 8, border: '1px solid #e2e8f0', background: 'rgba(255,255,255,0.92)', cursor: 'pointer', color: '#94a3b8', display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(8px)' }}>
              <Tag size={13} />
            </button>
            <button onClick={e => { e.stopPropagation(); onDelete() }}
              style={{ position: 'absolute', top: 8, right: 8, width: 28, height: 28, borderRadius: 8, border: '1px solid #fecaca', background: 'rgba(255,255,255,0.92)', cursor: 'pointer', color: '#ef4444', display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(8px)' }}>
              <Trash2 size={13} />
            </button>
          </>
        )}
      </div>
    </div>
  )
}
