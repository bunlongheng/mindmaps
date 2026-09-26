import type { CSSProperties } from 'react'
import { Lock, LockOpen } from 'lucide-react'

// The padlock toggle on a library card: filled/amber when locked, outline/neutral
// when not. Locking blocks every write except this toggle itself (see api/mindmaps.ts).
// Defaults to absolute positioning (grid card, over the thumbnail); the list row passes
// `style={{ position: 'static' }}` to sit inline with the other row action buttons.
export function LockToggle({ locked, onToggle, name, style }: { locked?: boolean; onToggle: () => void; name: string; style?: CSSProperties }) {
  return (
    <button
      onClick={e => { e.stopPropagation(); onToggle() }}
      title={locked ? 'Locked: linked from a README. Unlock to edit or delete.' : 'Lock this map'}
      aria-label={locked ? `Unlock ${name}` : `Lock ${name}`}
      aria-pressed={!!locked}
      style={{
        position: 'absolute', bottom: 8, left: 8, width: 28, height: 28, borderRadius: 8,
        border: locked ? '1px solid #f59e0b' : '1px solid #e2e8f0',
        background: locked ? '#fef3c7' : 'rgba(255,255,255,0.92)',
        cursor: 'pointer', color: locked ? '#b45309' : '#94a3b8',
        display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(8px)',
        ...style,
      }}
    >
      {locked ? <Lock size={13} /> : <LockOpen size={13} />}
    </button>
  )
}
