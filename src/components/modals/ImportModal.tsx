import { useState } from 'react'
import { X, Copy, Check } from 'lucide-react'

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
    const done = () => { setCopied(true); setTimeout(() => setCopied(false), 1800) }
    if (navigator.clipboard) {
      navigator.clipboard.writeText(code).then(done).catch(() => fallback())
    } else {
      fallback()
    }
    function fallback() {
      const el = document.createElement('textarea')
      el.value = code
      el.style.cssText = 'position:fixed;opacity:0'
      document.body.appendChild(el)
      el.select()
      document.execCommand('copy')
      document.body.removeChild(el)
      done()
    }
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

const ALL_INSTRUCTIONS = `# Mindmaps — Import Guide for AI Agents

Three ways to create a mindmap:

## 1. Generate with AI (built-in UI)
Click the ✦ button on the index page and describe the mindmap in plain English.

## 2. Paste (⌘V) anywhere on canvas
JSON object with optional icon/emoji/color per node. Children inherit parent color.
{
  "Root Title": [
    { "icon": "brain", "color": "#6366f1", "Category": [
        { "icon": "zap", "Sub Item": ["detail 1", "detail 2"] },
        { "emoji": "🚀", "Another Sub": ["detail 3"] },
        "plain text leaf"
    ]}
  ]
}
Indented outlines also work. Icons: kebab-case names from lucide.dev/icons.
Diagram types: logic-chart | mindmap | tree-vertical | tree-horizontal | fishbone | timeline

## 3. POST via API
Bearer token is auto-loaded into every shell on this Mac via ~/.zshenv:
  echo $MINDMAP_AI_API_KEY

curl -X POST https://mindmaps-bheng.vercel.app/api/ai/mindmaps \\
  -H "Authorization: Bearer $MINDMAP_AI_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{ "title": "My Map", "outline": "Root\\n  Branch 1\\n    Item A", "type": "logic-chart", "userId": "<user-id>" }'

Required: title. Optional: outline, type, userId, isFavorite, colors, lineStyle, themeId.
Calling with no body returns a JSON sample. Search stickies for "Mindmaps Import API" for the full reference.
`

export function ImportModal({ onClose, userId }: ImportModalProps) {
  const uid = userId ?? '<your-user-id>'
  const [copiedAll, setCopiedAll] = useState(false)

  function copyAll() {
    const done = () => { setCopiedAll(true); setTimeout(() => setCopiedAll(false), 1800) }
    if (navigator.clipboard) {
      navigator.clipboard.writeText(ALL_INSTRUCTIONS).then(done).catch(() => fallback())
    } else {
      fallback()
    }
    function fallback() {
      const el = document.createElement('textarea')
      el.value = ALL_INSTRUCTIONS
      el.style.cssText = 'position:fixed;opacity:0'
      document.body.appendChild(el)
      el.select()
      document.execCommand('copy')
      document.body.removeChild(el)
      done()
    }
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.25)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200,
      backdropFilter: 'blur(4px)',
    }} onClick={onClose}>
      <div style={{
        background: '#fff', borderRadius: 16, width: 'min(720px, 95vw)',
        maxHeight: '90vh', display: 'flex', flexDirection: 'column',
        boxShadow: '0 20px 60px rgba(0,0,0,0.15)',
      }} onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '22px 32px 16px' }}>
          <div>
            <h3 style={{ fontSize: 16, fontWeight: 700, color: '#1e293b', margin: 0 }}>Import Formats</h3>
            <p style={{ fontSize: 12, color: '#94a3b8', margin: '3px 0 0' }}>
              Paste any JSON on the canvas to auto-import. Use <kbd style={{ background: '#f1f5f9', border: '1px solid #e2e8f0', borderRadius: 4, padding: '1px 5px', fontSize: 10 }}>⌘S</kbd> to save edits.
            </p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button onClick={copyAll} title="Copy all instructions for AI" style={{
              display: 'flex', alignItems: 'center', gap: 5,
              padding: '5px 10px', borderRadius: 8, border: '1px solid #e2e8f0',
              background: copiedAll ? '#f0fdf4' : '#fff', cursor: 'pointer',
              fontSize: 11, fontWeight: 600, fontFamily: 'inherit',
              color: copiedAll ? '#22c55e' : '#64748b',
            }}>
              {copiedAll ? <Check size={11} /> : <Copy size={11} />}
              {copiedAll ? 'Copied!' : 'Copy for AI'}
            </button>
            <button onClick={onClose} style={{
              width: 28, height: 28, borderRadius: 8, border: '1px solid #e2e8f0',
              background: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748b',
            }}><X size={14} /></button>
          </div>
        </div>

        <div style={{ height: 1, background: '#f1f5f9' }} />

        {/* Body */}
        <div style={{ overflowY: 'auto', padding: '24px 32px' }}>

          <Row title="1. Generate with AI" badge="Built-in" badgeColor="#a855f7">
            <CodeBlock code={`Click the ✦ button on the index page and describe your mindmap
in plain English. Claude generates the JSON structure with icons
and saves it to your library automatically.

Example prompt: "top 10 productivity habits for software engineers"`} />
          </Row>

          <Row title="2. Paste (⌘V) anywhere" badge="Auto-detect" badgeColor="#22c55e">
            <CodeBlock copyable code={`{
  "Root Title": [
    { "icon": "brain", "color": "#6366f1", "Category": [
        { "icon": "zap", "Sub Item": ["detail 1", "detail 2"] },
        { "emoji": "🚀", "Another Sub": ["detail 3"] },
        "plain text leaf"
    ]},
    { "emoji": "🎯", "Another Branch": ["item 1", "item 2"] }
  ]
}`} />
            <p style={{ fontSize: 11, color: '#94a3b8', margin: '6px 0 0' }}>
              Indented outlines also work. Icons use kebab-case names from{' '}
              <a href="https://lucide.dev/icons" target="_blank" rel="noreferrer" style={{ color: '#6366f1', fontWeight: 600 }}>lucide.dev/icons</a>.
              Diagram types: <code style={{ fontSize: 10, background: '#f1f5f9', padding: '1px 5px', borderRadius: 3 }}>logic-chart</code>,{' '}
              <code style={{ fontSize: 10, background: '#f1f5f9', padding: '1px 5px', borderRadius: 3 }}>mindmap</code>,{' '}
              <code style={{ fontSize: 10, background: '#f1f5f9', padding: '1px 5px', borderRadius: 3 }}>tree-vertical</code>,{' '}
              <code style={{ fontSize: 10, background: '#f1f5f9', padding: '1px 5px', borderRadius: 3 }}>tree-horizontal</code>,{' '}
              <code style={{ fontSize: 10, background: '#f1f5f9', padding: '1px 5px', borderRadius: 3 }}>fishbone</code>,{' '}
              <code style={{ fontSize: 10, background: '#f1f5f9', padding: '1px 5px', borderRadius: 3 }}>timeline</code>.
            </p>
          </Row>

          <Row title="3. POST via API" badge="External agents" badgeColor="#6366f1">
            <CodeBlock copyable code={`curl -X POST https://mindmaps-bheng.vercel.app/api/ai/mindmaps \\
  -H "Authorization: Bearer $MINDMAP_AI_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "title": "My Map",
    "outline": "Root\\n  Branch 1\\n    Item A\\n  Branch 2\\n    Item B",
    "type": "logic-chart",
    "userId": "${uid}"
  }'`} />
          </Row>

          <Row title="AI agents — how to discover this API" badge="For Claude/LLM" badgeColor="#0ea5e9">
            <CodeBlock copyable code={`If you are an AI assistant, here is how to learn this endpoint:

1. The Bearer token is auto-loaded in every shell at this Mac
   (via ~/.zshenv — works in non-interactive shells too):
     echo $MINDMAP_AI_API_KEY

2. Search the user's stickies for the full reference:
     stickies search "Mindmaps Import API"

3. Or call the endpoint with no body — it returns a JSON
   sample you can copy verbatim:
     curl -X POST https://mindmaps-bheng.vercel.app/api/ai/mindmaps \\
       -H "Authorization: Bearer $MINDMAP_AI_API_KEY"

4. Project memory at:
   ~/.claude/projects/-Users-bheng-Sites-mindmaps/memory/
     reference_mindmaps_import_api.md`} />
          </Row>

</div>
      </div>
    </div>
  )
}
