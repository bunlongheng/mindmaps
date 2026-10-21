import { useState } from 'react'
import { Check, ChevronDown, ChevronUp } from 'lucide-react'
import { useMindmapStore } from '../../store/mindmapStore'

const card: React.CSSProperties = {
  position: 'absolute', left: 16, zIndex: 15, maxWidth: 'min(360px, calc(100% - 32px))',
  background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10,
  boxShadow: '0 2px 12px rgba(0,0,0,0.06)', fontFamily: 'Inter, system-ui, sans-serif', color: '#111827',
}

const toggle: React.CSSProperties = {
  display: 'flex', alignItems: 'flex-start', gap: 10, width: '100%', padding: 0, border: 0,
  background: 'transparent', cursor: 'pointer', textAlign: 'left', font: 'inherit', color: 'inherit', outline: 'none',
}

// The map's note card (top left) and legend (bottom left), as Flows shows them. Both
// live on the root node, so a payload sets them and every load and share carries them.
export function MapNotes({ top = 64 }: { top?: number }) {
  const root = useMindmapStore(s => s.activeMindmap?.nodes.find(n => n.parentId === null))
  // Phones start with both cards folded so the map stays visible
  const wide = typeof window === 'undefined' || window.innerWidth >= 640
  const [open, setOpen] = useState(wide)
  const [keyOpen, setKeyOpen] = useState(wide)
  const note = root?.note
  const legend = root?.showLegend === false ? [] : root?.legend ?? []
  const focus = useMindmapStore(s => s.legendFocus)
  const setFocus = useMindmapStore(s => s.setLegendFocus)
  return (
    <>
      {note && (note.title || note.body) && (
        <section data-testid="map-note" style={{ ...card, top, padding: '12px 16px' }}>
          <button onClick={() => setOpen(o => !o)} aria-expanded={open} title={open ? 'Collapse' : 'Expand'} style={toggle}>
            <span style={{ flex: 1, fontSize: 15, fontWeight: 700, lineHeight: 1.4 }}>{note.title || 'Note'}</span>
            {open ? <ChevronUp size={16} color="#94a3b8" /> : <ChevronDown size={16} color="#94a3b8" />}
          </button>
          {open && note.body && (
            <p style={{ margin: '8px 0 0', fontSize: 14, lineHeight: 1.55, color: '#475569', whiteSpace: 'pre-wrap', maxHeight: '40vh', overflowY: 'auto' }}>
              {note.body}
            </p>
          )}
        </section>
      )}
      {legend.length > 0 && (
        <section data-testid="map-legend" style={{ ...card, bottom: 56, padding: '12px 16px' }}>
          <button onClick={() => setKeyOpen(o => !o)} aria-expanded={keyOpen} title={keyOpen ? 'Collapse' : 'Expand'} style={toggle}>
            <span style={{ flex: 1, fontSize: 13, fontWeight: 700 }}>Legend</span>
            {keyOpen ? <ChevronDown size={16} color="#94a3b8" /> : <ChevronUp size={16} color="#94a3b8" />}
          </button>
          {keyOpen && <ul style={{ listStyle: 'none', padding: 0, display: 'grid', gap: 2, margin: '8px -7px 0', maxHeight: '40vh', overflowY: 'auto', overflowX: 'hidden' }}>
            {legend.map((r, i) => {
              const on = focus.includes(i)
              return (
                <li key={i}>
                  {/* A row is a filter: click to show only its features, click more to add, again to drop */}
                  <button onClick={() => setFocus(on ? focus.filter(f => f !== i) : [...focus, i])} aria-pressed={on}
                    title={on ? 'Show all again' : `Show only: ${r.label}`} style={{
                      ...toggle, alignItems: 'center', fontSize: 12, color: on ? '#111827' : '#334155',
                      // The selected row gets an outline so it pops; off rows keep a clear border so nothing shifts
                      padding: '3px 6px', borderRadius: 6,
                      border: `1px solid ${on ? '#111827' : 'transparent'}`, background: on ? 'rgba(17,24,39,0.05)' : 'transparent',
                    }}>
                    {r.emoji
                      ? <span aria-hidden="true" style={{ width: 14, textAlign: 'center', fontSize: 11 }}>{r.emoji}</span>
                      : <span aria-hidden="true" style={{ width: 10, height: 10, margin: '0 2px', borderRadius: '50%', background: r.color ?? '#94a3b8' }} />}
                    <span style={{ flex: 1, fontWeight: on ? 600 : 400 }}>{r.label}</span>
                    {on && <Check size={13} color="#111827" strokeWidth={2.5} aria-hidden="true" />}
                  </button>
                </li>
              )
            })}
          </ul>}
        </section>
      )}
    </>
  )
}
