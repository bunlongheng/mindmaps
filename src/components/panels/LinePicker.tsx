import type { LineStyle } from '../../types'

const LINE_OPTIONS: { value: LineStyle; label: string }[] = [
  { value: 'curved',     label: 'Brace' },
  { value: 'straight',   label: 'Straight' },
  { value: 'orthogonal', label: 'Square' },
]

// Shared by the Map tab's "Line" block and the Style tab's Branch block, so the
// two can never draw different icons for the same 3 line styles again.
export function LinePicker({ value, onChange }: { value: LineStyle; onChange: (v: LineStyle) => void }) {
  return (
    <div style={{ display: 'flex', gap: 6 }}>
      {LINE_OPTIONS.map(({ value: v, label }) => {
        const active = value === v
        const c = active ? '#3b82f6' : '#64748b'
        return (
          <button key={v} onClick={() => onChange(v)}
            style={{
              flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center',
              gap: 5, padding: '8px 4px', borderRadius: 8, cursor: 'pointer',
              border: `1.5px solid ${active ? '#3b82f6' : '#e0e2e7'}`,
              background: active ? '#eff6ff' : '#fff', fontFamily: 'inherit',
            }}>
            {label === 'Brace' ? (
              <svg width="20" height="18" viewBox="0 0 22 20" fill="none" style={{ color: c }}>
                {/* a right-facing brace: the trunk enters at the cusp, 3 leaders fan out to the right */}
                <path d="M9 1.5 C6.5 1.5 6 3 6 5 L6 7.5 C6 9 5 10 3.5 10 C5 10 6 11 6 12.5 L6 15 C6 17 6.5 18.5 9 18.5" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
                <line x1="12" y1="3.5" x2="19" y2="3.5" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
                <line x1="12" y1="10" x2="19" y2="10" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
                <line x1="12" y1="16.5" x2="19" y2="16.5" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
              </svg>
            ) : (
              <svg width="16" height="10" viewBox="0 0 16 10" fill="none">
                <path d={label === 'Straight' ? 'M1,8 L15,2' : 'M1,8 L8,8 L8,2 L15,2'} stroke={c} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            )}
            <span style={{ fontSize: 9, fontWeight: active ? 600 : 500, color: c }}>{label}</span>
          </button>
        )
      })}
    </div>
  )
}
