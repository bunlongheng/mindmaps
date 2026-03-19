import { useState, useEffect, useRef } from 'react'
import { useIdeaStore } from '../../store/ideaStore'
import { ROOT_COLORS } from '../../lib/color'
import { X, ChevronDown, AlignLeft, AlignCenter, AlignRight } from 'lucide-react'
import type { LineStyle } from '../../types'

interface NodeStylePanelProps {
  nodeId: string | null
  onClose: () => void
}

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '')
  return [parseInt(h.slice(0,2),16), parseInt(h.slice(2,4),16), parseInt(h.slice(4,6),16)]
}

export function NodeStylePanel({ nodeId, onClose }: NodeStylePanelProps) {
  const { activeIdea, updateNode, batchUpdateNodes, lineStyle, setLineStyle, selectedNodeIds, diagramType } = useIdeaStore()

  const node = nodeId ? activeIdea?.nodes.find(n => n.id === nodeId) : null
  const [title, setTitle] = useState(node?.title ?? '')

  useEffect(() => { setTitle(node?.title ?? '') }, [nodeId, node?.title])

  if (!node) return null

  function save(updates: Parameters<typeof updateNode>[1]) {
    const ids = selectedNodeIds.length > 1 ? selectedNodeIds : (nodeId ? [nodeId] : [])
    if (ids.length === 0) return
    batchUpdateNodes(ids, updates)
  }

  const defaultFontSize = node.depth === 0 ? 28 : node.depth === 1 ? 22 : node.depth === 2 ? 16 : node.depth === 3 ? 13 : 11
  const curFontSize = node.fontSize ?? defaultFontSize

  const [r, g, b] = node.color.startsWith('#') ? hexToRgb(node.color) : [100, 100, 100]
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255
  const previewText = lum > 0.55 ? '#1a1d2e' : '#ffffff'

  return (
    <div style={{
      position: 'fixed', top: 0, right: 0, bottom: 0, width: 256,
      background: '#f8f9fb', borderLeft: '1px solid #e8eaed',
      display: 'flex', flexDirection: 'column',
      boxShadow: '-2px 0 16px rgba(0,0,0,0.07)', zIndex: 30,
      fontFamily: 'Inter, system-ui, sans-serif',
    }}>

      {/* ── Header ── */}
      <div style={{
        height: 44, padding: '0 14px', borderBottom: '1px solid #e8eaed',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        background: '#fff', flexShrink: 0,
      }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: '#111827', letterSpacing: '-0.01em' }}>Style</span>
        <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', padding: 4, borderRadius: 6, display: 'flex', alignItems: 'center' }}>
          <X size={14} />
        </button>
      </div>

      {/* ── Node preview ── */}
      <div style={{ padding: '12px 14px 10px', background: '#fff', borderBottom: '1px solid #e8eaed', flexShrink: 0 }}>
        <div style={{
          background: node.color, borderRadius: node.depth === 0 ? 10 : 8,
          padding: '8px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          border: node.borderColor ? `${node.borderWidth ?? 1.5}px solid ${node.borderColor}` : 'none',
        }}>
          <span style={{
            fontSize: curFontSize, fontWeight: node.bold ? 700 : (node.depth <= 1 ? 600 : 500),
            fontStyle: node.italic ? 'italic' : 'normal',
            color: previewText, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            textAlign: node.textAlign ?? 'center', flex: 1,
          }}>{node.title || 'Node'}</span>
          <ChevronDown size={12} color={previewText} style={{ opacity: 0.5, flexShrink: 0, marginLeft: 6 }} />
        </div>
      </div>

      {/* ── Scrollable content ── */}
      <div style={{ flex: 1, overflowY: 'auto' }}>

        {/* ── Shape ── */}
        <SBlock title="Shape">
          <PRow label="Fill">
            <ColorField color={node.color} onChange={c => save({ color: c })} />
          </PRow>
          <PRow label="Border">
            <ColorField
              color={node.borderColor ?? 'none'}
              onChange={c => c === 'none'
                ? save({ borderColor: undefined, borderWidth: undefined })
                : save({ borderColor: c, borderWidth: node.borderWidth ?? 1.5 })}
              allowNone
            />
          </PRow>
          {node.borderColor && (
            <PRow label="Width">
              <div style={{ display: 'flex', gap: 5 }}>
                {(['Thin', 'Med', 'Thick', 'Bold'] as const).map((lbl, i) => {
                  const ws = [1, 1.5, 2.5, 4]
                  const active = node.borderWidth === ws[i] || (!node.borderWidth && i === 1)
                  return (
                    <button key={lbl} onClick={() => save({ borderWidth: ws[i] })} style={chip(active)}>
                      {lbl}
                    </button>
                  )
                })}
              </div>
            </PRow>
          )}
        </SBlock>

        <HR />

        {/* ── Text ── */}
        <SBlock title="Text">
          <PRow label="Label">
            <input
              value={title}
              onChange={e => setTitle(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { save({ title }); (e.target as HTMLInputElement).blur() } }}
              onBlur={() => { if (title !== node.title) save({ title }) }}
              style={{
                width: '100%', boxSizing: 'border-box', fontSize: 12,
                border: '1px solid #e0e2e7', borderRadius: 7, padding: '6px 9px',
                outline: 'none', fontFamily: 'inherit', color: '#111827', background: '#fff',
              }}
              onFocus={e => (e.target.style.borderColor = '#3b82f6')}
              onBlurCapture={e => (e.target.style.borderColor = '#e0e2e7')}
            />
          </PRow>
          <PRow label="Format">
            <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
              <button onClick={() => save({ bold: !node.bold })}
                style={{ ...chip(!!node.bold), width: 30, height: 28, padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 13 }}>
                B
              </button>
              <button onClick={() => save({ italic: !node.italic })}
                style={{ ...chip(!!node.italic), width: 30, height: 28, padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontStyle: 'italic', fontSize: 13 }}>
                I
              </button>
              <div style={{ width: 1, height: 18, background: '#e0e2e7', margin: '0 2px' }} />
              {([
                { v: 'left' as const,   icon: <AlignLeft size={12}/>   },
                { v: 'center' as const, icon: <AlignCenter size={12}/> },
                { v: 'right' as const,  icon: <AlignRight size={12}/>  },
              ] as const).map(({ v, icon }) => (
                <button key={v} onClick={() => save({ textAlign: v })}
                  style={{ ...chip((node.textAlign ?? 'center') === v), flex: 1, height: 28, padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {icon}
                </button>
              ))}
            </div>
          </PRow>
        </SBlock>

        <HR />

        {/* ── Branch ── */}
        {(diagramType === 'mindmap' || diagramType === 'tree-vertical' || diagramType === 'tree-horizontal') && <SBlock title="Branch">
          <PRow label="Line">
            <div style={{ display: 'flex', gap: 6 }}>
              {([
                { value: 'curved'      as LineStyle, label: 'Curved',   d: 'M1,8 C5,8 11,2 15,2' },
                { value: 'straight'    as LineStyle, label: 'Straight', d: 'M1,8 L15,2' },
                { value: 'orthogonal'  as LineStyle, label: 'Square',   d: 'M1,8 L8,8 L8,2 L15,2' },
              ]).map(({ value, label, d }) => {
                const active = lineStyle === value
                return (
                  <button key={value} onClick={() => setLineStyle(value)}
                    style={{
                      flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center',
                      gap: 5, padding: '8px 4px', borderRadius: 8, cursor: 'pointer',
                      border: `1.5px solid ${active ? '#3b82f6' : '#e0e2e7'}`,
                      background: active ? '#eff6ff' : '#fff',
                      fontFamily: 'inherit',
                    }}>
                    <svg width="16" height="10" viewBox="0 0 16 10" fill="none">
                      <path d={d} stroke={active ? '#3b82f6' : '#64748b'} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    <span style={{ fontSize: 9, fontWeight: active ? 600 : 500, color: active ? '#3b82f6' : '#64748b', letterSpacing: '0.01em' }}>
                      {label}
                    </span>
                  </button>
                )
              })}
            </div>
          </PRow>
        </SBlock>}


      </div>
    </div>
  )
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function SBlock({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ padding: '12px 14px 8px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 10 }}>
        <span style={{ fontSize: 9, color: '#6b7280' }}>▼</span>
        <span style={{ fontSize: 11, fontWeight: 700, color: '#374151', letterSpacing: '0.04em', textTransform: 'uppercase' }}>{title}</span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>{children}</div>
    </div>
  )
}

function PRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
      <span style={{ fontSize: 11, color: '#9ca3af', width: 38, paddingTop: 7, flexShrink: 0 }}>{label}</span>
      <div style={{ flex: 1 }}>{children}</div>
    </div>
  )
}

function ColorField({ color, onChange, allowNone }: {
  color: string; onChange: (c: string) => void; allowNone?: boolean
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const isNone = color === 'none'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
      {/* Top row: main swatch + optional None */}
      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        {/* Current color swatch — click opens native picker */}
        <label title="Pick custom color" style={{
          width: 32, height: 24, borderRadius: 6, cursor: 'pointer', flexShrink: 0,
          background: isNone ? '#fff' : color,
          border: isNone ? '1.5px dashed #d1d5db' : '1px solid rgba(0,0,0,0.12)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          position: 'relative', overflow: 'hidden',
        }}>
          {isNone && <span style={{ fontSize: 10, color: '#9ca3af' }}>—</span>}
          <input ref={inputRef} type="color"
            value={isNone ? '#6366f1' : (color.startsWith('#') ? color : '#6366f1')}
            onChange={e => onChange(e.target.value)}
            style={{ opacity: 0, position: 'absolute', width: '100%', height: '100%', cursor: 'pointer', padding: 0, border: 'none' }}
          />
        </label>
        {/* None button */}
        {allowNone && (
          <button onClick={() => onChange('none')}
            title="No color"
            style={{
              width: 32, height: 24, borderRadius: 6, cursor: 'pointer', flexShrink: 0,
              background: 'transparent', border: isNone ? '1.5px solid #3b82f6' : '1.5px dashed #d1d5db',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 10, color: isNone ? '#3b82f6' : '#9ca3af',
            }}>
            ✕
          </button>
        )}
      </div>
      {/* Preset palette */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 5 }}>
        {ROOT_COLORS.map(c => (
          <button key={c} onClick={() => onChange(c)}
            style={{
              width: 20, height: 20, borderRadius: 5, border: 'none',
              background: c, cursor: 'pointer', padding: 0, flexShrink: 0,
              outline: color === c ? `2.5px solid ${c}` : 'none',
              outlineOffset: 1.5,
              boxShadow: color === c ? `0 0 0 1.5px #fff inset` : '0 1px 2px rgba(0,0,0,0.15)',
              transform: color === c ? 'scale(1.1)' : 'scale(1)',
              transition: 'all 0.1s',
            }} />
        ))}
      </div>
    </div>
  )
}

function HR() {
  return <div style={{ height: 1, background: '#e8eaed', margin: '2px 0' }} />
}

function chip(active: boolean): React.CSSProperties {
  return {
    padding: '4px 8px', borderRadius: 6,
    border: `1px solid ${active ? '#3b82f6' : '#e0e2e7'}`,
    background: active ? '#eff6ff' : '#fff',
    cursor: 'pointer', fontSize: 11,
    fontWeight: active ? 600 : 500,
    color: active ? '#3b82f6' : '#4b5563',
    fontFamily: 'inherit',
  }
}
