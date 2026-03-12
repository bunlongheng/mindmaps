import { useState } from 'react'
import { useDiagramStore } from '../../store/diagramStore'
import { ROOT_COLORS } from '../../lib/color'
import { X, Plus, Trash2 } from 'lucide-react'

interface NodeStylePanelProps {
  nodeId: string
  onClose: () => void
}

export function NodeStylePanel({ nodeId, onClose }: NodeStylePanelProps) {
  const { activeDiagram, updateNode, addNode, deleteNode, setSelectedNodeIds } = useDiagramStore()
  const node = activeDiagram?.nodes.find(n => n.id === nodeId)
  const [title, setTitle] = useState(node?.title ?? '')

  if (!node) return null

  const isRoot = node.depth === 0

  function save(updates: Parameters<typeof updateNode>[1]) {
    updateNode(nodeId, updates)
  }

  function handleDelete() {
    if (isRoot) return
    deleteNode(nodeId)
    setSelectedNodeIds([])
    onClose()
  }

  return (
    <div style={{
      position: 'absolute', top: 0, right: 0, bottom: 0, width: 260,
      background: '#fff', borderLeft: '1px solid #f1f5f9',
      display: 'flex', flexDirection: 'column',
      boxShadow: '-4px 0 24px rgba(0,0,0,0.06)',
      zIndex: 30,
      animation: 'slideInRight 0.2s ease',
    }}>
      <style>{`
        @keyframes slideInRight {
          from { transform: translateX(100%); opacity: 0; }
          to { transform: translateX(0); opacity: 1; }
        }
      `}</style>

      {/* Header */}
      <div style={{ padding: '14px 16px 12px', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: '#1e293b' }}>Style</span>
        <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', padding: 4, borderRadius: 6 }}>
          <X size={15} />
        </button>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '14px 16px' }}>

        {/* Title */}
        <section style={{ marginBottom: 20 }}>
          <label style={labelStyle}>Title</label>
          <div style={{ display: 'flex', gap: 6 }}>
            <input
              value={title}
              onChange={e => setTitle(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { save({ title }); (e.target as HTMLInputElement).blur() } }}
              onBlur={() => save({ title })}
              style={{
                flex: 1, fontSize: 13, border: '1px solid #e2e8f0', borderRadius: 8,
                padding: '7px 10px', outline: 'none', fontFamily: 'inherit', color: '#1e293b',
              }}
              onFocus={e => (e.target.style.borderColor = '#6366f1')}
            />
          </div>
        </section>

        {/* Fill color */}
        <section style={{ marginBottom: 20 }}>
          <label style={labelStyle}>Fill Color</label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {ROOT_COLORS.map(c => (
              <button key={c} onClick={() => save({ color: c })}
                style={{
                  width: 24, height: 24, borderRadius: '50%', border: 'none', cursor: 'pointer',
                  background: c, flexShrink: 0,
                  boxShadow: node.color === c ? `0 0 0 2px #fff, 0 0 0 3.5px ${c}` : '0 1px 3px rgba(0,0,0,0.2)',
                  transform: node.color === c ? 'scale(1.15)' : 'scale(1)',
                  transition: 'all 0.15s',
                }}
              />
            ))}
            <input type="color" value={node.color}
              onChange={e => save({ color: e.target.value })}
              style={{ width: 24, height: 24, borderRadius: '50%', border: '1px solid #e2e8f0', cursor: 'pointer', padding: 0 }}
            />
          </div>
        </section>

        <div style={{ height: 1, background: '#f1f5f9', margin: '0 0 18px' }} />

        {/* Text size */}
        <section style={{ marginBottom: 20 }}>
          <label style={labelStyle}>Font Size</label>
          <div style={{ display: 'flex', gap: 6 }}>
            {[11, 12, 13, 14, 16].map(size => {
              const active = (node.fontSize ?? (node.depth === 0 ? 15 : node.depth === 1 ? 13 : 12)) === size
              return (
                <button key={size} onClick={() => save({ fontSize: size })}
                  style={{
                    flex: 1, padding: '5px 0', borderRadius: 7,
                    border: `1px solid ${active ? '#6366f1' : '#e2e8f0'}`,
                    background: active ? '#eef2ff' : 'transparent',
                    cursor: 'pointer', fontSize: 11, fontWeight: active ? 700 : 500,
                    color: active ? '#6366f1' : '#64748b', fontFamily: 'inherit',
                  }}>
                  {size}
                </button>
              )
            })}
          </div>
        </section>

        <div style={{ height: 1, background: '#f1f5f9', margin: '0 0 18px' }} />

        {/* Actions */}
        <section style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <button onClick={() => addNode(nodeId)}
            style={{
              display: 'flex', alignItems: 'center', gap: 8, padding: '9px 12px',
              borderRadius: 9, border: '1px solid #e2e8f0', background: '#fff',
              cursor: 'pointer', fontSize: 13, fontWeight: 500, color: '#475569', fontFamily: 'inherit',
            }}>
            <Plus size={14} /> Add child topic
          </button>

          {!isRoot && (
            <button onClick={handleDelete}
              style={{
                display: 'flex', alignItems: 'center', gap: 8, padding: '9px 12px',
                borderRadius: 9, border: '1px solid #fee2e2', background: '#fff',
                cursor: 'pointer', fontSize: 13, fontWeight: 500, color: '#ef4444', fontFamily: 'inherit',
              }}>
              <Trash2 size={14} /> Delete node
            </button>
          )}
        </section>
      </div>
    </div>
  )
}

const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: 11, fontWeight: 600, color: '#94a3b8',
  textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8,
}
