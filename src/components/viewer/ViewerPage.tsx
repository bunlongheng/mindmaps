import { useEffect } from 'react'
import { renderMindmapSvg } from '../../lib/render-svg'
import type { Diagram } from '../../types'
import { SocialFooter } from './SocialFooter'

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

const TYPE_LABEL: Record<string, string> = {
  'logic-chart': 'Logic Chart', mindmap: 'Mind Map', graph: 'Graph', fishbone: 'Fishbone', timeline: 'Timeline', honeycomb: 'Honeycomb',
}

export function ViewerPage({ diagram, id }: { diagram: Diagram | null; id: string | null }) {
  const name = diagram?.name || 'Diagram'

  // Document title mirrors the Sequences share page's "<title> · Sequences" format.
  useEffect(() => {
    const prev = document.title
    document.title = `${name} · Mindmaps`
    return () => { document.title = prev }
  }, [name])

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

  const svg = renderMindmapSvg({
    id: diagram.id,
    name: diagram.name,
    type: diagram.type,
    line_style: diagram.lineStyle,
    theme_id: diagram.themeId,
    nodes: diagram.nodes,
  })

  return (
    <main style={{ minHeight: '100dvh', background: '#eceef2', fontFamily: 'Inter, system-ui, -apple-system, sans-serif' }}>
      {/* Slim top bar - logo + download, no editing chrome. Same 56px sticky
          header as the Sequences share page. */}
      <header style={{
        height: 56, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0 20px', background: '#fff', borderBottom: '1px solid #e5e7eb',
        position: 'sticky', top: 0, zIndex: 10,
      }}>
        <a href="/" style={{ display: 'flex', alignItems: 'center', textDecoration: 'none' }}>
          <Wordmark size={28} />
        </a>
        {/* The reader's 1 action sits in the same floating pill Flows puts at the
            right of a shared diagram, and the pill's tiles are the squares the
            footer ends with: a shared link reads the same at the top and at the
            bottom, in every app in the family. */}
        {id && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 2, flexShrink: 0, background: '#ffffff', border: '1px solid #e4e6e8', borderRadius: 14, boxShadow: '0 4px 24px rgba(0,0,0,0.08)', padding: '4px 6px' }}>
            <style>{`.mm-act{display:flex;align-items:center;gap:6px;height:30px;padding:0 10px;border-radius:8px;color:#64748b;font-size:13px;text-decoration:none;transition:background .1s}.mm-act:hover{background:#f1f5f9}`}</style>
            <a className="mm-act" href={`/api/mindmaps?id=${id}&format=svg`} title="Download this map as an SVG">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 3v12" /><path d="m7 11 5 5 5-5" /><path d="M5 21h14" />
              </svg>
              <span>Download SVG</span>
            </a>
          </div>
        )}
      </header>

      {/* Clean, light, full-width diagram - the whole point of the page. */}
      <div className="mm-viewer-container" style={{ maxWidth: 1240, margin: '0 auto', padding: '28px 20px 64px' }}>
        {/* Glossy hero, the landing a Flows share opens with: the map's name large
            over a soft indigo wash, its size and kind underneath. */}
        <div style={{
          position: 'relative', overflow: 'hidden', marginBottom: 16, padding: '28px 28px 24px', borderRadius: 16,
          background: 'linear-gradient(135deg,#1e1b4b 0%,#312e81 55%,#4338ca 100%)',
          boxShadow: '0 10px 30px rgba(49,46,129,0.25), inset 0 1px 0 rgba(255,255,255,0.18)',
        }}>
          <div aria-hidden="true" style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg,rgba(255,255,255,0.14) 0%,rgba(255,255,255,0) 48%)', pointerEvents: 'none' }} />
          <h1 style={{ position: 'relative', margin: 0, fontSize: 'clamp(22px,4vw,34px)', fontWeight: 800, letterSpacing: '-0.02em', color: '#fff', lineHeight: 1.15 }}>{name}</h1>
          <div style={{ position: 'relative', marginTop: 8, fontSize: 14, color: 'rgba(255,255,255,0.7)' }}>
            {`${diagram.nodes.length} node${diagram.nodes.length === 1 ? '' : 's'}, ${TYPE_LABEL[diagram.type] ?? 'Mind Map'}`}
          </div>
        </div>
        {/* auto-fit: the SVG has a viewBox, so max-width:100% + height:auto scales
            the whole diagram to fit the card on load - nothing chopped off. The
            page itself scrolls vertically like any document; no canvas, no wheel
            capture, pinch zoom works natively. */}
        <style>{`
          .mm-viewer-card svg { max-width: 100%; height: auto; display: block; margin: 0 auto; }
          @media (max-width: 640px) { .mm-viewer-card { padding: 16px !important; } }
        `}</style>
        <div
          className="mm-viewer-card"
          style={{ background: '#fff', border: '1px solid #e5e7eb', padding: 24, boxShadow: '0 1px 3px rgba(15,23,42,0.06)', overflow: 'hidden' }}
          dangerouslySetInnerHTML={{ __html: svg }}
        />
        {/* Every shared map ends with the signature and tiles, as Flows and Stickies do. */}
        <SocialFooter />
      </div>
    </main>
  )
}
