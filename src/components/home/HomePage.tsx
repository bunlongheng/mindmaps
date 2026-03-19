import { useState, useEffect, useRef } from 'react'
import { useIdeaStore } from '../../store/ideaStore'
import { useDiagram } from '../../hooks/useDiagram'
import type { DiagramMeta, IdeaNode } from '../../types'
import { Plus, Search, Clock, Trash2, Star } from 'lucide-react'
import { IdeasLogo } from '../IdeasLogo'

const LS_FAVS = 'ideas:favorites'
function loadFavs(): Set<string> {
  try { return new Set(JSON.parse(localStorage.getItem(LS_FAVS) ?? '[]')) } catch { return new Set() }
}
function saveFavs(favs: Set<string>) {
  localStorage.setItem(LS_FAVS, JSON.stringify([...favs]))
}

interface HomePageProps {
  onOpen: (id: string) => void
  user?: import('@supabase/supabase-js').User | null
  onSignOut?: () => void
}

export function HomePage({ onOpen, user, onSignOut }: HomePageProps) {
  const { diagrams } = useIdeaStore()
  const { loadDiagramList, createDiagram, deleteDiagram } = useDiagram(user?.id ?? null)
  const [search, setSearch] = useState('')
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [favs, setFavs] = useState<Set<string>>(loadFavs)
  const [showUserMenu, setShowUserMenu] = useState(false)
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

  function toggleFav(id: string) {
    setFavs(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      saveFavs(next)
      return next
    })
  }

  const filtered = diagrams.filter(d =>
    d.name.toLowerCase().includes(search.toLowerCase())
  )

  const favDiagrams = filtered.filter(d => favs.has(d.id))
  const recentDiagrams = filtered.filter(d => !favs.has(d.id))

  async function handleCreate() {
    const name = newName.trim() || 'Untitled'
    setCreating(true)
    await createDiagram(name)
    setNewName('')
    setShowCreate(false)
    setCreating(false)
    const fresh = useIdeaStore.getState().diagrams[0]
    if (fresh) onOpen(fresh.id)
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
    if (live) { localStorage.setItem('ideas:avatar', live); return live }
    return localStorage.getItem('ideas:avatar') ?? undefined
  })()
  const displayName = (() => {
    const live = (user?.user_metadata?.full_name ?? user?.email ?? '') as string
    if (live) { localStorage.setItem('ideas:displayName', live); return live }
    return localStorage.getItem('ideas:displayName') ?? ''
  })()

  return (
    <div style={{ minHeight: '100vh', background: '#f8fafc', fontFamily: 'Inter, system-ui, sans-serif' }}>

      {/* Top nav */}
      <header style={{
        background: '#fff', borderBottom: '1px solid #f1f5f9',
        padding: '0 24px', height: 56,
        display: 'flex', alignItems: 'center', gap: 16,
        position: 'sticky', top: 0, zIndex: 10,
      }}>
        {/* Logo + name */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
          <div style={{
            width: 32, height: 32, borderRadius: 9,
            background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 2px 8px rgba(99,102,241,0.3)',
          }}>
            <IdeasLogo size={18} />
          </div>
          <span style={{ fontSize: 15, fontWeight: 700, color: '#1e293b' }}>Think</span>
        </div>

        {/* Search — next to app name */}
        <div style={{ position: 'relative', width: 220 }}>
          <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search maps…"
            style={{
              width: '100%', padding: '7px 12px 7px 32px', boxSizing: 'border-box',
              border: '1px solid #e2e8f0', borderRadius: 9, fontSize: 13,
              outline: 'none', fontFamily: 'inherit', color: '#334155',
              background: '#f8fafc',
            }}
          />
        </div>

        <div style={{ flex: 1 }} />

        {/* Avatar + dropdown */}
        {user && (
          <div ref={menuRef} style={{ position: 'relative' }}>
            <button
              onClick={() => setShowUserMenu(p => !p)}
              style={{
                width: 34, height: 34, borderRadius: '50%', overflow: 'hidden',
                border: showUserMenu ? '2px solid #6366f1' : '2px solid #e2e8f0',
                cursor: 'pointer', padding: 0, background: '#e0e7ff',
                transition: 'border-color 0.15s', flexShrink: 0,
                position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
              title={displayName}
            >
              {/* Initials — always centered, visible when image fails */}
              <span style={{ fontSize: 13, fontWeight: 700, color: '#6366f1', userSelect: 'none', lineHeight: 1 }}>
                {displayName[0]?.toUpperCase() ?? '?'}
              </span>
              {/* Avatar image — covers initials when it loads, disappears on error */}
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
                background: '#fff', borderRadius: 12, boxShadow: '0 8px 32px rgba(0,0,0,0.12)',
                border: '1px solid #f1f5f9', overflow: 'hidden', zIndex: 50,
              }}>
                {/* User info */}
                <div style={{ padding: '12px 14px 10px', borderBottom: '1px solid #f1f5f9' }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#1e293b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {displayName}
                  </div>
                  <div style={{ fontSize: 11, color: '#94a3b8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: 2 }}>
                    {user.email}
                  </div>
                </div>
                {/* Sign out */}
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
      </header>

      <main style={{ maxWidth: 1100, margin: '0 auto', padding: '32px 24px' }}>

        {filtered.length === 0 && (
          <div style={{
            position: 'fixed', inset: 0, top: 56,
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            pointerEvents: 'none',
          }}>
            <div style={{ opacity: 0.25, marginBottom: 16 }}><IdeasLogo size={40} color="#64748b" /></div>
            <p style={{ fontSize: 15, color: '#94a3b8', fontWeight: 600, margin: 0 }}>No maps yet</p>
            <p style={{ fontSize: 13, color: '#cbd5e1', marginTop: 6 }}>Tap + to create your first map</p>
          </div>
        )}

        {/* Favorites row */}
        {favDiagrams.length > 0 && (
          <section style={{ marginBottom: 36 }}>
            <h2 style={{ fontSize: 13, fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 6 }}>
              <Star size={12} fill="#eab308" color="#eab308" /> Favorites · {favDiagrams.length}
            </h2>
            <div style={{ display: 'flex', gap: 16, overflowX: 'auto', overflowY: 'visible', paddingBottom: 12, paddingTop: 4, scrollbarWidth: 'none' }}>
              {favDiagrams.map(d => (
                <div key={d.id} style={{ flexShrink: 0, width: 220 }}>
                  <DiagramCard
                    diagram={d} timeAgo={timeAgo(d.updatedAt)}
                    onOpen={() => onOpen(d.id)} onDelete={() => deleteDiagram(d.id, d.name)}
                    isFav={true} onToggleFav={() => toggleFav(d.id)}
                  />
                </div>
              ))}
            </div>
          </section>
        )}

        {/* All / Recent */}
        {recentDiagrams.length > 0 && (
          <section>
            <h2 style={{ fontSize: 13, fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 16 }}>
              {favDiagrams.length > 0 ? 'Recent' : 'All Maps'} · {recentDiagrams.length}
            </h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 12 }}>
              {recentDiagrams.map(d => (
                <DiagramCard
                  key={d.id} diagram={d} timeAgo={timeAgo(d.updatedAt)}
                  onOpen={() => onOpen(d.id)} onDelete={() => deleteDiagram(d.id, d.name)}
                  isFav={false} onToggleFav={() => toggleFav(d.id)}
                />
              ))}
            </div>
          </section>
        )}
      </main>

      {/* Floating New Map button — bottom right */}
      <button
        onClick={() => setShowCreate(true)}
        title="New Map"
        style={{
          position: 'fixed', bottom: 28, right: 28,
          width: 56, height: 56, borderRadius: '50%',
          background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
          border: 'none', cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 4px 20px rgba(99,102,241,0.45)',
          animation: 'fabPulse 2.5s ease-in-out infinite',
          zIndex: 20,
        }}
      >
        <Plus size={24} color="#fff" strokeWidth={2.5} />
      </button>
      <style>{`
        @keyframes fabPulse {
          0%, 100% { box-shadow: 0 4px 20px rgba(99,102,241,0.45); transform: scale(1); }
          50%       { box-shadow: 0 4px 32px rgba(99,102,241,0.7);  transform: scale(1.06); }
        }
      `}</style>

      {/* Create modal */}
      {showCreate && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.2)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50,
        }} onClick={() => setShowCreate(false)}>
          <div style={{
            background: '#fff', borderRadius: 16, padding: 24, width: 360,
            boxShadow: '0 20px 60px rgba(0,0,0,0.15)',
          }} onClick={e => e.stopPropagation()}>
            <h3 style={{ fontSize: 16, fontWeight: 700, color: '#1e293b', marginBottom: 16 }}>New Map</h3>
            <input
              autoFocus
              value={newName}
              onChange={e => setNewName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleCreate()}
              placeholder="Map name…"
              style={{
                width: '100%', padding: '10px 14px', fontSize: 14,
                border: '1px solid #e2e8f0', borderRadius: 10, outline: 'none',
                fontFamily: 'inherit', marginBottom: 16, boxSizing: 'border-box',
              }}
            />
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={() => setShowCreate(false)}
                style={{ padding: '8px 16px', border: '1px solid #e2e8f0', borderRadius: 9, background: '#fff', cursor: 'pointer', fontSize: 13, fontFamily: 'inherit', color: '#64748b' }}>
                Cancel
              </button>
              <button onClick={handleCreate} disabled={creating}
                style={{ padding: '8px 18px', background: '#6366f1', color: '#fff', border: 'none', borderRadius: 9, cursor: 'pointer', fontSize: 13, fontWeight: 600, fontFamily: 'inherit' }}>
                {creating ? 'Creating…' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── DiagramMinimap ─────────────────────────────────────────────────────────


function DiagramMinimap({ id }: { id: string }) {
  const [nodes, setNodes] = useState<IdeaNode[]>([])

  useEffect(() => {
    try {
      const data = JSON.parse(localStorage.getItem(`ideas:diagram:${id}`) ?? 'null')
      if (data?.nodes?.length) setNodes(data.nodes)
    } catch {}
  }, [id])

  const root = nodes.find(n => n.parentId === null)
  const l1s = root ? nodes.filter(n => n.parentId === root.id) : []

  // No data yet — show a lively gradient placeholder
  if (l1s.length === 0) {
    const placeholderColors = ['#6366f1','#ec4899','#f97316','#22c55e','#06b6d4']
    return (
      <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10, padding: '0 16px' }}>
        <div style={{ display: 'flex', gap: 0 }}>
          {placeholderColors.map((c, i) => (
            <div key={i} style={{
              width: 22, height: 22, borderRadius: '50%', background: c,
              border: '2px solid #fff', marginLeft: i === 0 ? 0 : -6,
              opacity: 0.3,
            }} />
          ))}
        </div>
        <div style={{ fontSize: 11, color: '#cbd5e1', fontWeight: 500 }}>Open to preview</div>
      </div>
    )
  }

  const MAX_ROWS = 3

  return (
    <div style={{ width: '100%', height: '100%', padding: '10px 14px', display: 'flex', flexDirection: 'column', gap: 6, boxSizing: 'border-box' }}>

      {/* Per-category breakdown */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: 1 }}>
        {l1s.slice(0, MAX_ROWS).map(l1 => {
          const childCount = nodes.filter(n => n.parentId === l1.id).length
          return (
            <div key={l1.id} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: l1.color, flexShrink: 0 }} />
              <span style={{ fontSize: 11, color: '#334155', fontWeight: 500, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {l1.title}
              </span>
              <span style={{ fontSize: 10, fontWeight: 700, color: l1.color, background: l1.color + '18', borderRadius: 4, padding: '1px 6px', flexShrink: 0 }}>
                {childCount} node{childCount !== 1 ? 's' : ''}
              </span>
            </div>
          )
        })}
        <div style={{ display: 'flex', gap: 0, paddingLeft: 2 }}>
          {l1s.map((l1, i) => {
            const childCount = nodes.filter(n => n.parentId === l1.id).length
            return (
              <div key={l1.id} title={l1.title} style={{
                width: 22, height: 22, borderRadius: '50%',
                background: l1.color, border: '2px solid #fff',
                marginLeft: i === 0 ? 0 : -6,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 8, fontWeight: 700, color: '#fff',
                flexShrink: 0, boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
                zIndex: l1s.length - i, position: 'relative',
              }}>
                {childCount}
              </div>
            )
          })}
        </div>
      </div>

    </div>
  )
}

// ── DiagramCard ────────────────────────────────────────────────────────────

function DiagramCard({ diagram, timeAgo, onOpen, onDelete, isFav, onToggleFav }: {
  diagram: DiagramMeta; timeAgo: string; onOpen: () => void; onDelete: () => void
  isFav: boolean; onToggleFav: () => void
}) {
  const [hovered, setHovered] = useState(false)
  const l1Count = (() => {
    try {
      const data = JSON.parse(localStorage.getItem(`ideas:diagram:${diagram.id}`) ?? 'null')
      if (!data?.nodes) return 0
      const root = data.nodes.find((n: { parentId: string | null }) => n.parentId === null)
      return root ? data.nodes.filter((n: { parentId: string }) => n.parentId === root.id).length : 0
    } catch { return 0 }
  })()

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: '#fff',
        border: `2px solid ${hovered ? '#6366f1' : '#e8edf5'}`,
        borderRadius: 16, overflow: 'hidden', cursor: 'pointer',
        transition: 'border-color 0.15s, box-shadow 0.15s, transform 0.15s',
        boxShadow: hovered ? '0 8px 24px rgba(99,102,241,0.15)' : '0 1px 4px rgba(0,0,0,0.05)',
        transform: hovered ? 'translateY(-2px)' : 'translateY(0)',
      }}
      onClick={onOpen}
    >
      {/* Header — name + count pill (left) + time (right) */}
      <div style={{ padding: '12px 14px 10px', borderBottom: '1px solid #eef2f8', display: 'flex', alignItems: 'center', gap: 6 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: '#1e293b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
          {diagram.name}
        </div>
        {l1Count > 0 && (
          <span style={{ fontSize: 10, fontWeight: 700, color: '#6366f1', background: '#6366f115', borderRadius: 20, padding: '2px 7px', flexShrink: 0 }}>
            {l1Count}
          </span>
        )}
        <div style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 11, color: '#94a3b8', flexShrink: 0 }}>
          <Clock size={11} /> {timeAgo}
        </div>
      </div>

      {/* Thumbnail */}
      <div style={{ height: 110, background: 'linear-gradient(145deg, #f8faff 0%, #f1f5ff 100%)', position: 'relative' }}>
        <DiagramMinimap id={diagram.id} />
        {hovered && (
          <>
            <button onClick={e => { e.stopPropagation(); onToggleFav() }} title={isFav ? 'Unfavorite' : 'Favorite'}
              style={{ position: 'absolute', top: 8, left: 8, width: 28, height: 28, borderRadius: 8, border: isFav ? '1px solid #fde68a' : '1px solid #e2e8f0', background: 'rgba(255,255,255,0.95)', cursor: 'pointer', color: isFav ? '#eab308' : '#94a3b8', display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(4px)' }}>
              <Star size={13} fill={isFav ? '#eab308' : 'none'} />
            </button>
            <button onClick={e => { e.stopPropagation(); onDelete() }}
              style={{ position: 'absolute', top: 8, right: 8, width: 28, height: 28, borderRadius: 8, border: '1px solid #fecaca', background: 'rgba(255,255,255,0.95)', cursor: 'pointer', color: '#ef4444', display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(4px)' }}>
              <Trash2 size={13} />
            </button>
          </>
        )}
      </div>
    </div>
  )
}
