import { useEffect, useState } from 'react'
import { Bot, Braces, Download } from 'lucide-react'
import type { Diagram } from '../../types'
import { DiagramCanvas } from '../canvas/DiagramCanvas'
import { MapNotes } from '../canvas/MapNotes'
import { downloadJSON } from '../../lib/export/json'
import { toOutline } from '../../lib/export/outline'
import { UnlockReveal } from './UnlockReveal'

// The one lockup, mirroring Sequences' Wordmark.tsx (app/Wordmark.tsx): the app's
// own icon plus its name at the same size / weight rules, so the header reads as
// the same app across products.
export function Wordmark({ size = 28 }: { size?: number }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <img src="/icons/android-chrome-192x192.png" alt="Mindmaps" width={size} height={size}
        style={{ display: 'block', borderRadius: size * 0.25 }} />
      <span style={{ fontSize: Math.round(size * 0.53), fontWeight: 800, letterSpacing: '-0.01em', color: '#111827' }}>
        Mindmaps
      </span>
    </div>
  )
}


export function ViewerPage({ diagram, id }: { diagram: Diagram | null; id: string | null }) {
  const name = diagram?.name || 'Diagram'

  // Document title mirrors the Sequences share page's "<title> · Sequences" format.
  useEffect(() => {
    const prev = document.title
    document.title = `${name} · Mindmaps`
    return () => { document.title = prev }
  }, [name])
  const [copied, setCopied] = useState(false)

  // The spinner covers loading, so no diagram here means the load failed: the map
  // is not shared (403) or no longer exists. Say so instead of a blank page.
  if (!diagram) return (
    <main style={{ minHeight: '100dvh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, padding: 20, background: '#eceef2', fontFamily: 'Inter, system-ui, -apple-system, sans-serif', textAlign: 'center' }}>
      <Wordmark size={36} />
      <div style={{ fontSize: 18, fontWeight: 700, color: '#111827' }}>This map isn't available</div>
      <div style={{ fontSize: 14, color: '#64748b', maxWidth: 360 }}>
        It isn't shared, or it no longer exists. Ask the owner to turn sharing on.
      </div>
      <a href="/" style={{ marginTop: 4, fontSize: 14, fontWeight: 600, color: '#6366f1', textDecoration: 'none' }}>Go to Mindmaps</a>
    </main>
  )

  const copyForAI = () => {
    navigator.clipboard?.writeText(toOutline(diagram)).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    }).catch(() => {})
  }
  return (
    <main style={{ height: '100dvh', display: 'flex', flexDirection: 'column', background: '#eceef2', fontFamily: 'Inter, system-ui, -apple-system, sans-serif' }}>
      {/* Slim top bar - logo, map name and the reader's exports, no editing chrome. */}
      <header style={{
        height: 56, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
        padding: '0 20px', background: '#fff', borderBottom: '1px solid #e5e7eb', zIndex: 10,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, minWidth: 0 }}>
          <a href="/" style={{ display: 'flex', alignItems: 'center', textDecoration: 'none', flexShrink: 0 }}>
            <Wordmark size={28} />
          </a>
          <h1 style={{ margin: 0, fontSize: 15, fontWeight: 600, color: '#475569', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{name}</h1>
        </div>
        {/* The reader's actions sit in the same floating pill Flows puts at the
            right of a shared diagram. */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 2, flexShrink: 0, background: '#ffffff', border: '1px solid #e4e6e8', borderRadius: 14, boxShadow: '0 4px 24px rgba(0,0,0,0.08)', padding: '4px 6px' }}>
          <style>{`.mm-act{display:flex;align-items:center;gap:6px;height:30px;padding:0 10px;border:0;background:transparent;border-radius:8px;color:#64748b;font:inherit;font-size:13px;text-decoration:none;cursor:pointer;transition:background .1s}.mm-act:hover{background:#f1f5f9}@media (max-width:640px){.mm-act span{display:none}}`}</style>
          <button className="mm-act" onClick={copyForAI} title="Copy the map as a Markdown outline to paste into an AI agent">
            <Bot size={14} /><span>{copied ? 'Copied' : 'Copy for AI'}</span>
          </button>
          <button className="mm-act" onClick={() => downloadJSON(diagram)} title="Download this map as JSON">
            <Braces size={14} /><span>JSON</span>
          </button>
          {id && (
            <a className="mm-act" href={`/api/mindmaps?id=${id}&format=svg`} title="Download this map as an SVG">
              <Download size={14} /><span>Download SVG</span>
            </a>
          )}
        </div>
      </header>
      {/* The same canvas the owner edits on, look-only: pan, zoom (wheel, pinch,
          Cmd +/-/0) and node links work; nothing can be moved, edited or saved. */}
      <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
        <DiagramCanvas onNodeSelect={() => {}} readOnly />
        <MapNotes top={16} />
      </div>
      <UnlockReveal />
    </main>
  )
}

