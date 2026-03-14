import { useState, useEffect } from 'react'
import { useDiagramStore } from '../../store/diagramStore'
import { useDiagram } from '../../hooks/useDiagram'
import type { DiagramMeta } from '../../types'
import { Plus, Search, Clock, Trash2 } from 'lucide-react'
import { ThinkLogo } from '../ThinkLogo'

interface HomePageProps {
  onOpen: (id: string) => void
}

export function HomePage({ onOpen }: HomePageProps) {
  const { diagrams } = useDiagramStore()
  const { loadDiagramList, createDiagram, deleteDiagram } = useDiagram()
  const [search, setSearch] = useState('')
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [showCreate, setShowCreate] = useState(false)

  useEffect(() => { loadDiagramList() }, [])

  const filtered = diagrams.filter(d =>
    d.name.toLowerCase().includes(search.toLowerCase())
  )

  async function handleCreate() {
    const name = newName.trim() || 'Untitled'
    setCreating(true)
    await createDiagram(name)
    setNewName('')
    setShowCreate(false)
    setCreating(false)
    const fresh = useDiagramStore.getState().diagrams[0]
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

  return (
    <div style={{ minHeight: '100vh', background: '#f8fafc', fontFamily: 'Inter, system-ui, sans-serif' }}>

      {/* Top nav */}
      <header style={{
        background: '#fff', borderBottom: '1px solid #f1f5f9',
        padding: '0 32px', height: 56,
        display: 'flex', alignItems: 'center', gap: 16,
        position: 'sticky', top: 0, zIndex: 10,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 32, height: 32, borderRadius: 9,
            background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 2px 8px rgba(99,102,241,0.3)',
          }}>
            <ThinkLogo size={18} />
          </div>
          <span style={{ fontSize: 15, fontWeight: 700, color: '#1e293b' }}>Think</span>
        </div>

        <div style={{ flex: 1 }} />

        {/* Search */}
        <div style={{ position: 'relative', width: 220 }}>
          <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search maps…"
            style={{
              width: '100%', padding: '7px 12px 7px 32px',
              border: '1px solid #e2e8f0', borderRadius: 9, fontSize: 13,
              outline: 'none', fontFamily: 'inherit', color: '#334155',
              background: '#f8fafc',
            }}
          />
        </div>

        {/* Create */}
        <button
          onClick={() => setShowCreate(true)}
          style={{
            display: 'flex', alignItems: 'center', gap: 7,
            padding: '8px 16px', background: '#6366f1', color: '#fff',
            border: 'none', borderRadius: 9, fontSize: 13, fontWeight: 600,
            cursor: 'pointer', fontFamily: 'inherit',
            boxShadow: '0 2px 8px rgba(99,102,241,0.3)',
          }}>
          <Plus size={15} /> New Map
        </button>
      </header>

      <main style={{ maxWidth: 1100, margin: '0 auto', padding: '32px 24px' }}>

        <h2 style={{ fontSize: 13, fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 20 }}>
          All Maps · {filtered.length}
        </h2>

        {filtered.length === 0 && (
          <div style={{
            position: 'fixed', inset: 0, top: 56,
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            pointerEvents: 'none',
          }}>
            <div style={{ opacity: 0.25, marginBottom: 16 }}><ThinkLogo size={40} color="#64748b" /></div>
            <p style={{ fontSize: 15, color: '#94a3b8', fontWeight: 600, margin: 0 }}>No maps yet</p>
            <p style={{ fontSize: 13, color: '#cbd5e1', marginTop: 6 }}>Click "New Map" to get started</p>
          </div>
        )}

        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
          gap: 16,
        }}>
          {filtered.map(d => (
            <DiagramCard
              key={d.id}
              diagram={d}
              timeAgo={timeAgo(d.updatedAt)}
              onOpen={() => onOpen(d.id)}
              onDelete={() => deleteDiagram(d.id, d.name)}
            />
          ))}
        </div>
      </main>

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

function DiagramCard({ diagram, timeAgo, onOpen, onDelete }: {
  diagram: DiagramMeta; timeAgo: string; onOpen: () => void; onDelete: () => void
}) {
  const [hovered, setHovered] = useState(false)

  const previewColors = ['#6366f1', '#ec4899', '#f97316', '#eab308', '#22c55e']

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: '#fff',
        border: `${hovered ? '2.5px' : '1px'} solid ${hovered ? '#6366f1' : '#e2e8f0'}`,
        borderRadius: 14, overflow: 'hidden', cursor: 'pointer',
        transition: 'all 0.15s',
        boxShadow: hovered ? '0 4px 20px rgba(99,102,241,0.12)' : '0 1px 4px rgba(0,0,0,0.04)',
        transform: hovered ? 'translateY(-2px)' : 'none',
      }}
      onClick={onOpen}
    >
      {/* Thumbnail */}
      <div style={{ height: 130, background: '#fafbff', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', borderBottom: '1px solid #f1f5f9' }}>
        <svg width="160" height="90" viewBox="0 0 160 90">
          {/* Root node preview */}
          <rect x="10" y="32" width="55" height="24" rx="6" fill="#1a1d2e" />
          <text x="37" y="48" textAnchor="middle" fontSize="8" fontWeight="700" fill="white" fontFamily="Inter, sans-serif">{diagram.name.slice(0,8)}</text>
          {/* Brace line */}
          <line x1="65" y1="44" x2="78" y2="44" stroke="#94a3b8" strokeWidth="1.5" strokeLinecap="round" />
          <line x1="78" y1="16" x2="78" y2="72" stroke="#94a3b8" strokeWidth="1.5" strokeLinecap="round" />
          {/* Topic previews */}
          {[0,1,2,3,4].map((i) => {
            const y = 12 + i * 14
            return (
              <g key={i}>
                <line x1="78" y1={y + 5} x2="84" y2={y + 5} stroke={previewColors[i % 5]} strokeWidth="1.5" strokeLinecap="round" />
                <rect x="84" y={y} width="62" height="11" rx="3" fill={previewColors[i % 5]} />
              </g>
            )
          })}
        </svg>

        {/* Delete button */}
        {hovered && (
          <button
            onClick={e => { e.stopPropagation(); onDelete() }}
            style={{
              position: 'absolute', top: 8, right: 8,
              width: 26, height: 26, borderRadius: 7, border: '1px solid #fee2e2',
              background: '#fff', cursor: 'pointer', color: '#ef4444',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
            <Trash2 size={12} />
          </button>
        )}
      </div>

      {/* Info */}
      <div style={{ padding: '10px 14px 12px' }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: '#1e293b', marginBottom: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {diagram.name}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: '#94a3b8' }}>
          <Clock size={11} />
          {timeAgo}
        </div>
      </div>
    </div>
  )
}
