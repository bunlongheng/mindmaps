import { useState } from 'react'
import { X, Copy, Check } from 'lucide-react'

const API_KEY = import.meta.env.VITE_MINDMAP_API_KEY ?? '<API_KEY>'

interface ImportModalProps { onClose: () => void; userId?: string | null }

function Badge({ label, color }: { label: string; color?: string }) {
  const c = color ?? '#6366f1'
  return (
    <span style={{
      fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 20,
      background: `${c}15`, color: c, border: `1px solid ${c}30`,
    }}>{label}</span>
  )
}

function CodeBlock({ code, copyable }: { code: string; copyable?: boolean }) {
  const [copied, setCopied] = useState(false)
  function copy() {
    navigator.clipboard?.writeText(code).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    })
  }
  return (
    <div style={{ position: 'relative' }}>
      <pre style={{
        background: '#f8fafc', border: '1px solid #e8edf3', borderRadius: 10,
        padding: copyable ? '12px 44px 12px 14px' : '12px 14px',
        fontSize: 11.5, lineHeight: 1.65, overflowX: 'auto',
        color: '#334155', fontFamily: '"JetBrains Mono", monospace',
        margin: 0, whiteSpace: 'pre',
      }}>{code}</pre>
      {copyable && (
        <button onClick={copy} title="Copy" style={{
          position: 'absolute', top: 8, right: 8,
          width: 26, height: 26, borderRadius: 6,
          border: '1px solid #e2e8f0', background: '#fff',
          cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: copied ? '#22c55e' : '#94a3b8',
        }}>
          {copied ? <Check size={12} /> : <Copy size={12} />}
        </button>
      )}
    </div>
  )
}

function Row({ title, badge, badgeColor, children }: {
  title: string; badge?: string; badgeColor?: string; children: React.ReactNode
}) {
  return (
    <div style={{ marginBottom: 22 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: '#1e293b' }}>{title}</span>
        {badge && <Badge label={badge} color={badgeColor} />}
      </div>
      {children}
    </div>
  )
}

export function ImportModal({ onClose, userId }: ImportModalProps) {
  const uid = userId ?? '<your-user-id>'

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.25)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200,
      backdropFilter: 'blur(4px)',
    }} onClick={onClose}>
      <div style={{
        background: '#fff', borderRadius: 16, width: 'min(580px, 95vw)',
        maxHeight: '90vh', display: 'flex', flexDirection: 'column',
        boxShadow: '0 20px 60px rgba(0,0,0,0.15)',
      }} onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 20px 12px' }}>
          <div>
            <h3 style={{ fontSize: 16, fontWeight: 700, color: '#1e293b', margin: 0 }}>Import Formats</h3>
            <p style={{ fontSize: 12, color: '#94a3b8', margin: '3px 0 0' }}>
              Paste any JSON on the canvas to auto-import. Use <kbd style={{ background: '#f1f5f9', border: '1px solid #e2e8f0', borderRadius: 4, padding: '1px 5px', fontSize: 10 }}>⌘S</kbd> to save edits.
            </p>
          </div>
          <button onClick={onClose} style={{
            width: 28, height: 28, borderRadius: 8, border: '1px solid #e2e8f0',
            background: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748b',
          }}><X size={14} /></button>
        </div>

        <div style={{ height: 1, background: '#f1f5f9' }} />

        {/* Body */}
        <div style={{ overflowY: 'auto', padding: '20px 20px' }}>

          <Row title="Paste JSON" badge="Auto-saves on paste" badgeColor="#22c55e">
            <CodeBlock code={`# Press ⌘V / Ctrl+V anywhere on the canvas
# Paste exported JSON → auto-creates a new map`} />
          </Row>

          <Row title="Supported diagram types" badge="type field">
            <CodeBlock code={`logic-chart  |  mindmap  |  tree-vertical
tree-horizontal  |  fishbone  |  timeline`} />
          </Row>

          <Row title="API — Outline import" badge="POST /api/ai/mindmaps" badgeColor="#f97316">
            <CodeBlock copyable code={`curl -X POST https://mindmaps-bheng.vercel.app/api/ai/mindmaps \\
  -H "Authorization: Bearer ${API_KEY}" \\
  -H "Content-Type: application/json" \\
  -d '{
    "title": "My Map",
    "outline": "Root\\n  Branch 1\\n    Item A\\n  Branch 2\\n    Item B",
    "type": "logic-chart",
    "userId": "${uid}"
  }'`} />
          </Row>

          <Row title="API — AI Generate" badge="POST /api/ai/generate-mindmap" badgeColor="#8b5cf6">
            <CodeBlock copyable code={`curl -X POST https://mindmaps-bheng.vercel.app/api/ai/generate-mindmap \\
  -H "Authorization: Bearer ${API_KEY}" \\
  -H "Content-Type: application/json" \\
  -d '{
    "prompt": "Machine learning fundamentals",
    "userId": "${uid}"
  }'`} />
          </Row>

        </div>
      </div>
    </div>
  )
}
