import { useEffect } from 'react'
import { renderMindmapSvg } from '../../lib/render-svg'
import type { Diagram } from '../../types'
import { SocialFooter } from './SocialFooter'

// The one lockup, mirroring Sequences' Wordmark.tsx (app/Wordmark.tsx): the app's
// own icon plus its name at the same size / weight rules, so the header reads as
// the same app across products.
function Wordmark({ size = 28 }: { size?: number }) {
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

  if (!diagram) return null

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
        {id && (
          <a href={`/api/mindmaps?id=${id}&format=svg`} style={{ fontSize: 13, fontWeight: 600, color: '#4b5563', textDecoration: 'none' }}>
            Download SVG
          </a>
        )}
      </header>

      {/* Clean, light, full-width diagram - the whole point of the page. */}
      <div className="mm-viewer-container" style={{ maxWidth: 1240, margin: '0 auto', padding: '28px 20px 64px' }}>
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
        <SocialFooter />
      </div>
    </main>
  )
}
