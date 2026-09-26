import { Lock } from 'lucide-react'

// Shown at the top of the editor/canvas when the open map is locked (embedded outside
// the app - README, Confluence, the demo wall). Editing itself is disabled elsewhere
// (DiagramCanvas's effectiveReadOnly) - this banner is what makes that visible.
export function LockedBanner() {
  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, zIndex: 30,
      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
      padding: '8px 16px', background: '#fef3c7', borderBottom: '1px solid #f59e0b',
      color: '#92400e', fontSize: 13, fontWeight: 600,
    }}>
      <Lock size={14} />
      Locked. This diagram is embedded elsewhere. Unlock to edit.
    </div>
  )
}
