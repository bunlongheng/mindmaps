import { useState, useRef, useEffect } from 'react'
import { useIdeaStore } from '../../store/ideaStore'
import { Share2, Download, Upload, RefreshCw, Plus, Menu, Undo2, Redo2, MoreHorizontal, Trash2 } from 'lucide-react'
import { downloadJSON } from '../../lib/export/json'
import { encodeShareURL } from '../../lib/export/share'
import type { DiagramType, LineStyle } from '../../types'

interface ControlPanelProps {
  onAddNode: () => void
  onImport: () => void
  onShare: (url: string) => void
  onBack: () => void
  onDelete?: () => void
}

const DIAGRAM_TYPES: { value: DiagramType; label: string }[] = [
  { value: 'logic-chart',     label: 'Logic' },
  { value: 'mindmap',         label: 'Mind' },
  { value: 'tree-vertical',   label: 'Tree ↓' },
  { value: 'tree-horizontal', label: 'Tree →' },
  { value: 'fishbone',        label: 'Fishbone' },
]

const LINE_STYLES: { value: LineStyle; symbol: string; title: string }[] = [
  { value: 'curved',     symbol: '⌒', title: 'Curved' },
  { value: 'straight',   symbol: '—', title: 'Straight' },
  { value: 'orthogonal', symbol: '⌐', title: 'Orthogonal' },
]

const Sep = () => <div style={{ width: 1, height: 20, background: '#e2e8f0', flexShrink: 0 }} />

export function ControlPanel({ onAddNode, onImport, onShare, onBack, onDelete }: ControlPanelProps) {
  const { activeIdea, rerunLayout, undo, redo, past, future, diagramType, lineStyle, setDiagramType, setLineStyle } = useIdeaStore()
  const [showMore, setShowMore] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const moreRef = useRef<HTMLDivElement>(null)

  const canUndo = past.length > 0
  const canRedo = future.length > 0

  // Close dropdown on outside click
  useEffect(() => {
    if (!showMore) return
    function handler(e: MouseEvent) {
      if (moreRef.current && !moreRef.current.contains(e.target as Node)) setShowMore(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [showMore])

  const btn: React.CSSProperties = {
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    width: 30, height: 30, borderRadius: 7, border: 'none', cursor: 'pointer',
    fontSize: 12, fontWeight: 500, fontFamily: 'inherit', transition: 'background 0.1s',
    background: 'transparent', color: '#64748b', flexShrink: 0,
  }
  const hov = (e: React.MouseEvent, on: boolean) =>
    (e.currentTarget as HTMLElement).style.background = on ? '#f1f5f9' : 'transparent'

  return (
    <div style={{
      position: 'fixed', top: 14, left: '50%', transform: 'translateX(-50%)',
      zIndex: 20, display: 'flex', alignItems: 'center', gap: 2,
      background: '#fff', border: '1px solid #e2e8f0',
      borderRadius: 14, boxShadow: '0 4px 24px rgba(0,0,0,0.08)',
      padding: '4px 8px', userSelect: 'none',
    }}>

      {/* Back */}
      <button onClick={onBack} title="All maps" style={btn}
        onMouseEnter={e => hov(e, true)} onMouseLeave={e => hov(e, false)}>
        <Menu size={16} />
      </button>

      <Sep />

      {/* Undo / Redo */}
      <button onClick={canUndo ? undo : undefined} title="Undo (⌘Z)"
        style={{ ...btn, opacity: canUndo ? 1 : 0.28, cursor: canUndo ? 'pointer' : 'default' }}
        onMouseEnter={e => { if (canUndo) hov(e, true) }} onMouseLeave={e => hov(e, false)}>
        <Undo2 size={14} />
      </button>
      <button onClick={canRedo ? redo : undefined} title="Redo (⌘⇧Z)"
        style={{ ...btn, opacity: canRedo ? 1 : 0.28, cursor: canRedo ? 'pointer' : 'default' }}
        onMouseEnter={e => { if (canRedo) hov(e, true) }} onMouseLeave={e => hov(e, false)}>
        <Redo2 size={14} />
      </button>

      <Sep />

      {/* Add node */}
      <button onClick={onAddNode} title="Add node (Tab)" style={btn}
        onMouseEnter={e => hov(e, true)} onMouseLeave={e => hov(e, false)}>
        <Plus size={15} />
      </button>

      <Sep />

      {/* Delete */}
      {onDelete && (
        <>
          <Sep />
          <button onClick={() => setShowDeleteConfirm(true)} title="Delete map"
            style={{ ...btn, color: '#ef4444' }}
            onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = '#fef2f2'}
            onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'transparent'}>
            <Trash2 size={14} />
          </button>
        </>
      )}

      <Sep />

      {/* More dropdown */}
      <div ref={moreRef} style={{ position: 'relative' }}>
        <button onClick={() => setShowMore(v => !v)} title="More options"
          style={{ ...btn, background: showMore ? '#f1f5f9' : 'transparent', color: showMore ? '#1e293b' : '#64748b' }}
          onMouseEnter={e => hov(e, true)} onMouseLeave={e => { if (!showMore) hov(e, false) }}>
          <MoreHorizontal size={15} />
        </button>

        {showMore && (
          <div style={{
            position: 'absolute', top: 'calc(100% + 8px)', right: 0,
            background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12,
            boxShadow: '0 8px 32px rgba(0,0,0,0.1)', padding: '8px',
            minWidth: 200, zIndex: 50,
          }}>
            {/* Diagram type */}
            <p style={{ fontSize: 10, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.07em', padding: '2px 6px 6px' }}>Diagram</p>
            <div style={{ display: 'flex', gap: 4, marginBottom: 10 }}>
              {DIAGRAM_TYPES.map(({ value, label }) => {
                const active = diagramType === value
                return (
                  <button key={value} onClick={() => { setDiagramType(value); setShowMore(false) }}
                    style={{
                      flex: 1, padding: '5px 4px', borderRadius: 7, border: `1px solid ${active ? '#6366f1' : '#e2e8f0'}`,
                      background: active ? '#eef2ff' : 'transparent', cursor: 'pointer',
                      fontSize: 11, fontWeight: active ? 700 : 500, color: active ? '#6366f1' : '#475569', fontFamily: 'inherit',
                    }}>
                    {label}
                  </button>
                )
              })}
            </div>

            {/* Line style */}
            <p style={{ fontSize: 10, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.07em', padding: '2px 6px 6px' }}>Line</p>
            <div style={{ display: 'flex', gap: 4, marginBottom: 10 }}>
              {LINE_STYLES.map(({ value, symbol, title }) => {
                const active = lineStyle === value
                return (
                  <button key={value} onClick={() => { setLineStyle(value); setShowMore(false) }}
                    style={{
                      flex: 1, padding: '5px 4px', borderRadius: 7, border: `1px solid ${active ? '#6366f1' : '#e2e8f0'}`,
                      background: active ? '#eef2ff' : 'transparent', cursor: 'pointer',
                      fontSize: 14, fontWeight: active ? 700 : 400, color: active ? '#6366f1' : '#64748b', fontFamily: 'inherit',
                    }}
                    title={title}>
                    {symbol}
                  </button>
                )
              })}
            </div>

            <div style={{ height: 1, background: '#f1f5f9', margin: '4px 0 8px' }} />

            {/* Actions */}
            {[
              { icon: <RefreshCw size={13}/>, label: 'Re-run layout', onClick: () => { rerunLayout(); setShowMore(false) } },
              { icon: <Download size={13}/>, label: 'Export JSON', onClick: () => { activeIdea && downloadJSON(activeIdea); setShowMore(false) } },
              { icon: <Upload size={13}/>, label: 'Import JSON', onClick: () => { onImport(); setShowMore(false) } },
              { icon: <Share2 size={13}/>, label: 'Share link', onClick: () => { activeIdea && onShare(encodeShareURL(activeIdea)); setShowMore(false) } },
            ].map(({ icon, label, onClick }) => (
              <button key={label} onClick={onClick}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8, width: '100%',
                  padding: '7px 8px', borderRadius: 8, border: 'none', background: 'transparent',
                  cursor: 'pointer', fontSize: 12, color: '#475569', fontFamily: 'inherit', textAlign: 'left',
                }}
                onMouseEnter={e => (e.currentTarget.style.background = '#f8fafc')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                {icon} {label}
              </button>
            ))}
          </div>
        )}
      </div>

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
              "<strong>{activeIdea?.name}</strong>" will be permanently deleted.
            </p>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={() => setShowDeleteConfirm(false)} style={{
                padding: '8px 16px', border: '1px solid #e2e8f0', borderRadius: 9,
                background: '#fff', cursor: 'pointer', fontSize: 13, fontFamily: 'inherit', color: '#64748b',
              }}>Cancel</button>
              <button onClick={() => { setShowDeleteConfirm(false); onDelete?.() }} style={{
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
