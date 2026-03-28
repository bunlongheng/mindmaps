import { useState, useRef } from 'react'
import { importFromJSON } from '../../lib/export/json'
import { useMindmapStore } from '../../store/mindmapStore'
import { X, Upload, FileJson, Clipboard, Zap, Bot } from 'lucide-react'

interface ImportModalProps { onClose: () => void }

const CODE = {
  json: `{
  "id": "uuid",
  "name": "My Map",
  "type": "logic-chart",
  "nodes": [ ... ]
}`,
  paste: `# Paste JSON (Cmd/Ctrl + V)
# Auto-creates a new map instantly`,
  outline: `Root Topic
  Branch One
    Item A
    Item B
  Branch Two
    Item C`,
  api: `curl -X POST https://mindmaps-bheng.vercel.app/api/ai/mindmaps \\
  -H "Authorization: Bearer <API_KEY>" \\
  -H "Content-Type: application/json" \\
  -d '{
    "title": "My Map",
    "outline": "Root\\n  Branch 1\\n    Item A",
    "type": "logic-chart",
    "userId": "<your-user-id>"
  }'`,
  aiApi: `curl -X POST https://mindmaps-bheng.vercel.app/api/ai/generate-mindmap \\
  -H "Authorization: Bearer <API_KEY>" \\
  -H "Content-Type: application/json" \\
  -d '{
    "prompt": "Machine learning fundamentals",
    "userId": "<your-user-id>"
  }'`,
}

const TYPES = [
  { value: 'logic-chart',     label: 'Logic Chart' },
  { value: 'mindmap',         label: 'Mind Map' },
  { value: 'tree-vertical',   label: 'Tree ↓' },
  { value: 'tree-horizontal', label: 'Tree →' },
  { value: 'fishbone',        label: 'Fishbone' },
  { value: 'timeline',        label: 'Timeline' },
]

function CodeBlock({ code }: { code: string }) {
  return (
    <pre style={{
      background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8,
      padding: '10px 12px', fontSize: 11, lineHeight: 1.6, overflowX: 'auto',
      color: '#334155', fontFamily: '"JetBrains Mono", "Fira Code", monospace',
      margin: 0, whiteSpace: 'pre',
    }}>{code}</pre>
  )
}

function Section({ icon, title, badge, badgeColor, children }: {
  icon: React.ReactNode; title: string; badge?: string; badgeColor?: string; children: React.ReactNode
}) {
  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
        <span style={{ color: '#6366f1' }}>{icon}</span>
        <span style={{ fontSize: 13, fontWeight: 700, color: '#1e293b' }}>{title}</span>
        {badge && (
          <span style={{
            fontSize: 10, fontWeight: 600, padding: '2px 7px', borderRadius: 20,
            background: badgeColor ? `${badgeColor}18` : '#6366f118',
            color: badgeColor ?? '#6366f1', border: `1px solid ${badgeColor ?? '#6366f1'}33`,
          }}>{badge}</span>
        )}
      </div>
      {children}
    </div>
  )
}

export function ImportModal({ onClose }: ImportModalProps) {
  const [error, setError] = useState('')
  const { setActiveMindmap } = useMindmapStore()
  const inputRef = useRef<HTMLInputElement>(null)

  function handleFile(file: File) {
    const reader = new FileReader()
    reader.onload = (e) => {
      const text = e.target?.result as string
      const diagram = importFromJSON(text)
      if (!diagram) { setError('Invalid diagram file'); return }
      setActiveMindmap(diagram)
      onClose()
    }
    reader.readAsText(file)
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    const file = e.dataTransfer.files[0]
    if (file) handleFile(file)
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.28)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50,
      backdropFilter: 'blur(4px)',
    }} onClick={onClose}>
      <div style={{
        background: '#fff', borderRadius: 20, width: 'min(560px, 95vw)',
        maxHeight: '88vh', display: 'flex', flexDirection: 'column',
        boxShadow: '0 24px 64px rgba(0,0,0,0.16)',
      }} onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '18px 20px 14px', borderBottom: '1px solid #f1f5f9',
        }}>
          <div>
            <h3 style={{ fontSize: 15, fontWeight: 700, color: '#1e293b', margin: 0 }}>Import a Map</h3>
            <p style={{ fontSize: 12, color: '#94a3b8', margin: '2px 0 0' }}>All supported import methods</p>
          </div>
          <button onClick={onClose} style={{
            width: 28, height: 28, borderRadius: 8, border: '1px solid #e2e8f0',
            background: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748b',
          }}><X size={14} /></button>
        </div>

        {/* Scrollable body */}
        <div style={{ overflowY: 'auto', padding: '18px 20px', flex: 1 }}>

          {/* 1. JSON File */}
          <Section icon={<FileJson size={14} />} title="JSON File" badge="Drag & drop">
            <div
              onDrop={handleDrop}
              onDragOver={e => e.preventDefault()}
              onClick={() => inputRef.current?.click()}
              style={{
                border: '2px dashed #c7d2fe', borderRadius: 10, padding: '16px',
                textAlign: 'center', cursor: 'pointer', background: '#fafbff',
                transition: 'border-color 0.15s',
              }}
              onMouseEnter={e => (e.currentTarget.style.borderColor = '#6366f1')}
              onMouseLeave={e => (e.currentTarget.style.borderColor = '#c7d2fe')}
            >
              <Upload size={18} color="#a5b4fc" style={{ marginBottom: 4 }} />
              <p style={{ fontSize: 12, color: '#64748b', margin: 0 }}>Drop a <strong>.json</strong> file here or <span style={{ color: '#6366f1', fontWeight: 600 }}>click to browse</span></p>
            </div>
            <input ref={inputRef} type="file" accept=".json" style={{ display: 'none' }}
              onChange={e => e.target.files?.[0] && handleFile(e.target.files[0])} />
            {error && <p style={{ color: '#ef4444', fontSize: 11, marginTop: 6 }}>{error}</p>}
            <p style={{ fontSize: 11, color: '#94a3b8', marginTop: 6 }}>Export any map first via <strong>Format → Export JSON</strong> to get this format.</p>
          </Section>

          {/* 2. Paste */}
          <Section icon={<Clipboard size={14} />} title="Paste JSON" badge="Cmd/Ctrl + V" badgeColor="#14b8a6">
            <p style={{ fontSize: 12, color: '#64748b', marginBottom: 6 }}>
              Copy a diagram JSON, then press <kbd style={{ background: '#f1f5f9', border: '1px solid #e2e8f0', borderRadius: 4, padding: '1px 5px', fontSize: 11 }}>⌘V</kbd> anywhere on the canvas — it auto-creates a new map instantly.
            </p>
            <CodeBlock code={CODE.paste} />
          </Section>

          {/* 3. Diagram types */}
          <Section icon={<Zap size={14} />} title="Supported Types" badge="type field">
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {TYPES.map(t => (
                <span key={t.value} style={{
                  fontSize: 11, fontWeight: 600, padding: '3px 9px', borderRadius: 20,
                  background: '#f1f5f9', color: '#475569', border: '1px solid #e2e8f0',
                  fontFamily: '"JetBrains Mono", monospace',
                }}>{t.value}</span>
              ))}
            </div>
            <p style={{ fontSize: 11, color: '#94a3b8', marginTop: 6 }}>Use any of these values in the <code style={{ background: '#f1f5f9', padding: '1px 4px', borderRadius: 3 }}>type</code> field of the API or JSON.</p>
          </Section>

          {/* 4. API — outline */}
          <Section icon={<Zap size={14} />} title="API — Outline import" badge="POST /api/ai/mindmaps" badgeColor="#f97316">
            <p style={{ fontSize: 12, color: '#64748b', marginBottom: 6 }}>
              POST an indented outline to create a map. Supports all <code style={{ background: '#f1f5f9', padding: '1px 4px', borderRadius: 3 }}>type</code> values above.
            </p>
            <CodeBlock code={CODE.api} />
            <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 3 }}>
              {[
                ['title', 'required', 'Map name'],
                ['outline', 'optional', 'Indented text — 2 spaces per level'],
                ['type', 'optional', 'Default: logic-chart'],
                ['userId', 'optional', 'Your Supabase user UUID'],
                ['isFavorite', 'optional', 'true / false'],
                ['themeId', 'optional', 'default, dark, etc.'],
              ].map(([field, req, desc]) => (
                <div key={field} style={{ display: 'flex', gap: 8, fontSize: 11 }}>
                  <code style={{ background: '#f1f5f9', padding: '1px 5px', borderRadius: 3, color: '#6366f1', flexShrink: 0 }}>{field}</code>
                  <span style={{ color: req === 'required' ? '#ef4444' : '#94a3b8', flexShrink: 0 }}>{req}</span>
                  <span style={{ color: '#64748b' }}>{desc}</span>
                </div>
              ))}
            </div>
          </Section>

          {/* 5. API — AI generate */}
          <Section icon={<Bot size={14} />} title="API — AI Generate" badge="POST /api/ai/generate-mindmap" badgeColor="#8b5cf6">
            <p style={{ fontSize: 12, color: '#64748b', marginBottom: 6 }}>
              Send a prompt — Claude generates the full map and saves it. Returns a URL you can open directly.
            </p>
            <CodeBlock code={CODE.aiApi} />
            <p style={{ fontSize: 11, color: '#94a3b8', marginTop: 6 }}>
              Returns <code style={{ background: '#f1f5f9', padding: '1px 4px', borderRadius: 3 }}>{'{ id, title, url, nodeCount }'}</code>. Tagged <strong>AI</strong> automatically.
            </p>
          </Section>

        </div>
      </div>
    </div>
  )
}
