import { useState } from 'react'
import { useIdeaStore } from '../../store/ideaStore'
import { useDiagram } from '../../hooks/useDiagram'
import { Plus, Trash2, GitBranch } from 'lucide-react'
import type { DiagramMeta } from '../../types'

interface DiagramSidebarProps {
  onSave: () => void
}

export function DiagramSidebar({ onSave }: DiagramSidebarProps) {
  const { diagrams, activeIdea, isDirty } = useIdeaStore()
  const { loadDiagram, createDiagram, deleteDiagram } = useDiagram()
  const [newName, setNewName] = useState('')
  const [creating, setCreating] = useState(false)

  async function handleCreate() {
    const name = newName.trim() || 'Untitled'
    setCreating(true)
    await createDiagram(name)
    setNewName('')
    setCreating(false)
  }

  return (
    <aside style={{
      width: 220, background: '#fff', borderRight: '1px solid #f1f5f9',
      display: 'flex', flexDirection: 'column', height: '100%', flexShrink: 0,
    }}>

      {/* Brand header */}
      <div style={{
        padding: '16px 14px 12px',
        borderBottom: '1px solid #f1f5f9',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
          <div style={{
            width: 32, height: 32, borderRadius: 9,
            background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 2px 8px rgba(99,102,241,0.35)',
            flexShrink: 0,
          }}>
            <GitBranch size={15} color="#fff" />
          </div>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#1e293b', lineHeight: 1.2 }}>Ideas</div>
            <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 1 }}>Visual diagrams</div>
          </div>
        </div>

        {/* New diagram input */}
        <div style={{ display: 'flex', gap: 6 }}>
          <input
            value={newName}
            onChange={e => setNewName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleCreate()}
            placeholder="New diagram…"
            style={{
              flex: 1, fontSize: 12, border: '1px solid #e2e8f0', borderRadius: 8,
              padding: '7px 10px', outline: 'none', color: '#334155',
              background: '#f8fafc', fontFamily: 'inherit',
              transition: 'border-color 0.15s',
            }}
            onFocus={e => (e.target.style.borderColor = '#6366f1')}
            onBlur={e => (e.target.style.borderColor = '#e2e8f0')}
          />
          <button onClick={handleCreate} disabled={creating}
            style={{
              width: 32, height: 32, borderRadius: 8, border: 'none',
              background: creating ? '#a5b4fc' : '#6366f1',
              color: '#fff', cursor: creating ? 'not-allowed' : 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0, transition: 'background 0.15s',
            }}>
            <Plus size={15} />
          </button>
        </div>
      </div>

      {/* Diagram list */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '8px 8px 0' }}>
        {diagrams.length === 0 && (
          <div style={{ textAlign: 'center', padding: '32px 16px', color: '#cbd5e1' }}>
            <GitBranch size={28} style={{ margin: '0 auto 8px', display: 'block', opacity: 0.4 }} />
            <p style={{ fontSize: 12 }}>No diagrams yet</p>
            <p style={{ fontSize: 11, marginTop: 4, color: '#e2e8f0' }}>Type a name above and press Enter</p>
          </div>
        )}
        {diagrams.map(d => (
          <DiagramItem
            key={d.id} diagram={d}
            isActive={activeIdea?.id === d.id}
            isDirty={isDirty && activeIdea?.id === d.id}
            onLoad={() => { if (isDirty) onSave(); loadDiagram(d.id) }}
            onDelete={() => deleteDiagram(d.id)}
          />
        ))}
      </div>

      {/* Save indicator */}
      {isDirty && (
        <div style={{ padding: '8px 10px 10px', borderTop: '1px solid #f1f5f9' }}>
          <button onClick={onSave} style={{
            width: '100%', padding: '8px', background: '#6366f1', color: '#fff',
            border: 'none', borderRadius: 8, fontSize: 12, fontWeight: 600,
            cursor: 'pointer', fontFamily: 'inherit', transition: 'background 0.15s',
          }}
            onMouseEnter={e => (e.currentTarget.style.background = '#4f46e5')}
            onMouseLeave={e => (e.currentTarget.style.background = '#6366f1')}
          >
            Save changes
          </button>
        </div>
      )}
    </aside>
  )
}

function DiagramItem({ diagram, isActive, isDirty, onLoad, onDelete }: {
  diagram: DiagramMeta; isActive: boolean; isDirty: boolean
  onLoad: () => void; onDelete: () => void
}) {
  const [hovered, setHovered] = useState(false)

  return (
    <div
      onClick={onLoad}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '8px 8px', borderRadius: 8, cursor: 'pointer',
        marginBottom: 2, transition: 'background 0.12s',
        background: isActive ? '#eef2ff' : hovered ? '#f8fafc' : 'transparent',
      }}
    >
      <div style={{
        width: 6, height: 6, borderRadius: '50%', flexShrink: 0,
        background: isActive ? '#6366f1' : '#cbd5e1',
        transition: 'background 0.15s',
      }} />
      <span style={{
        flex: 1, fontSize: 13, fontWeight: isActive ? 600 : 400,
        color: isActive ? '#4338ca' : '#475569',
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
      }}>
        {diagram.name}{isDirty ? ' ●' : ''}
      </span>
      <button
        onClick={e => { e.stopPropagation(); onDelete() }}
        style={{
          opacity: hovered ? 1 : 0, padding: 3, borderRadius: 5, border: 'none',
          background: 'transparent', cursor: 'pointer', color: '#94a3b8',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          transition: 'all 0.12s',
        }}
        onMouseEnter={e => { e.currentTarget.style.background = '#fee2e2'; e.currentTarget.style.color = '#ef4444' }}
        onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#94a3b8' }}
      >
        <Trash2 size={12} />
      </button>
    </div>
  )
}
