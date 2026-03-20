import { useState, useEffect, useRef } from 'react'
import { useMindmapStore } from '../../store/mindmapStore'
import { useDiagram } from '../../hooks/useDiagram'
import type { DiagramMeta, MindmapNode } from '../../types'
import { Plus, Search, Clock, Trash2, Star, Network, Workflow, Fish, Milestone, GitMerge, GitFork } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { MindmapsLogo } from '../MindmapsLogo'
import { getTheme } from '../../lib/themes'

const LS_FAVS = 'mindmaps:favorites'
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
  const { diagrams } = useMindmapStore()
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
    const fresh = useMindmapStore.getState().diagrams[0]
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
    if (live) { localStorage.setItem('mindmaps:avatar', live); return live }
    return localStorage.getItem('mindmaps:avatar') ?? undefined
  })()
  const displayName = (() => {
    const live = (user?.user_metadata?.full_name ?? user?.email ?? '') as string
    if (live) { localStorage.setItem('mindmaps:displayName', live); return live }
    return localStorage.getItem('mindmaps:displayName') ?? ''
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
          <MindmapsLogo size={28} />
          <span style={{ fontSize: 15, fontWeight: 700, color: '#1e293b' }}>Mindmaps</span>
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
                border: showUserMenu ? '2px solid #6366f1' : '1px solid #e2e8f0',
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

      <main style={{ maxWidth: '100%', padding: '32px 24px' }}>

        {filtered.length === 0 && (
          <div style={{
            position: 'fixed', inset: 0, top: 56,
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            pointerEvents: 'none',
          }}>
            <div style={{ opacity: 0.25, marginBottom: 16 }}><MindmapsLogo size={40} color="#64748b" /></div>
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
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 12 }}>
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
    const rootCX = 22, rootCY = H / 2, rootR = 16
    const barX = 52, l1X = 60, l1W = 100

    return (
      <svg viewBox={VB} style={{ width: '100%', height: '100%' }} overflow="hidden">
        <rect x={-P} y={-P} width={W + P * 2} height={H + P * 2} fill={canvasBg} />
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

    return (
      <svg viewBox={VB} style={{ width: '100%', height: '100%' }} overflow="hidden">
        <rect x={-P} y={-P} width={W + P * 2} height={H + P * 2} fill={canvasBg} />
        <line x1={14} y1={spineY} x2={W - 24} y2={spineY} stroke={spineFill} strokeWidth={2.5} strokeLinecap="round" />
        <rect x={W - 26} y={spineY - 13} width={26} height={26} rx={5} fill={rootFill} />
        {l1s.map((l1, i) => {
          const above = i % 2 === 0
          const x = W - 48 - Math.floor(i / 2) * 38
          if (x < 30) return null
          const tipX = x - 26, tipY = above ? spineY - 28 : spineY + 28
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
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: '100%' }} overflow="hidden">
      <rect x={0} y={0} width={W} height={H} fill={canvasBg} />
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

const TYPE_ICON: Record<string, LucideIcon> = {
  'logic-chart': Workflow,
  'mindmap': Network,
  'fishbone': Fish,
  'timeline': Milestone,
  'tree-vertical': GitMerge,
  'tree-horizontal': GitFork,
}

function DiagramCard({ diagram, timeAgo, onOpen, onDelete, isFav, onToggleFav }: {
  diagram: DiagramMeta; timeAgo: string; onOpen: () => void; onDelete: () => void
  isFav: boolean; onToggleFav: () => void
}) {
  const [hovered, setHovered] = useState(false)
  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: '#fff',
        border: `1px solid ${hovered ? '#6366f1' : '#e2e8f0'}`,
        borderRadius: 16, overflow: 'hidden', cursor: 'pointer',
        transition: 'border-color 0.15s, box-shadow 0.15s, transform 0.15s',
        boxShadow: hovered ? '0 8px 24px rgba(99,102,241,0.15)' : '0 1px 4px rgba(0,0,0,0.05)',
        transform: hovered ? 'translateY(-2px)' : 'translateY(0)',
      }}
      onClick={onOpen}
    >
      {/* Header — name + count pill (left) + time (right) */}
      <div style={{ padding: '12px 14px 10px', display: 'flex', alignItems: 'center', gap: 6 }}>
        {(() => { const Icon = TYPE_ICON[diagram.type]; return Icon ? (
          <span style={{
            width: 20, height: 20, borderRadius: '50%',
            background: '#ede9fe', flexShrink: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Icon size={11} color="#6366f1" strokeWidth={2.2} />
          </span>
        ) : null })()}
        <div style={{ fontSize: 13, fontWeight: 600, color: '#1e293b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
          {diagram.name}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 11, color: '#94a3b8', flexShrink: 0 }}>
          <Clock size={11} /> {timeAgo}
        </div>
      </div>

      {/* Thumbnail */}
      <div style={{ height: 110, background: '#f8fafc', position: 'relative' }}>
        <DiagramMinimap id={diagram.id} type={diagram.type} />
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
