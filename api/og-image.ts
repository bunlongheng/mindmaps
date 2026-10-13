import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { Resvg } from '@resvg/resvg-js'
import { pool } from './_lib/db.js'
import { renderMindmapSvg, type MindmapRow } from './_lib/render-svg.js'
import { getTheme } from '../src/lib/themes.js'
import type { VercelRequest, VercelResponse } from '@vercel/node'

// 1200x630 is the size every unfurler (Slack, X, iMessage, LinkedIn) crops to.
const W = 1200
const H = 630
const PAD = 32
const STRIP_H = 104

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function esc(s: unknown): string {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] || c))
}

// resvg takes real font files (no system fonts on Vercel), which is what keeps
// every glyph from rasterizing as a tofu box. api/_fonts is underscore-prefixed
// so Vercel never mistakes the TTFs for serverless functions.
const FONT_FILES = ['Inter-Regular.ttf', 'Inter-SemiBold.ttf']
  .map(f => fileURLToPath(new URL(`./_fonts/${f}`, import.meta.url)))
  .filter(existsSync)
// If the bundle ever ships without the TTFs, fall back to whatever the host has
// rather than rendering every label blank.
const LOAD_SYSTEM_FONTS = FONT_FILES.length === 0

const TYPE_LABEL: Record<string, string> = {
  'logic-chart': 'Logic Chart',
  'mindmap': 'Mind Map',
  'graph': 'Graph',
  'fishbone': 'Fishbone',
  'timeline': 'Timeline',
  'honeycomb': 'Honeycomb',
}

interface ShareRow extends MindmapRow {
  tags: string[] | null
  updated_at: Date | string | null
  locked?: boolean
}

/** Strip the renderer's own <svg> wrapper so it can be nested at a fixed box. */
function inlineDiagram(svg: string, x: number, y: number, w: number, h: number): string {
  const viewBox = /viewBox="([^"]*)"/.exec(svg)?.[1] ?? `0 0 ${w} ${h}`
  const body = svg.replace(/^<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '')
  return `<svg x="${x}" y="${y}" width="${w}" height="${h}" viewBox="${esc(viewBox)}" preserveAspectRatio="xMidYMid meet">${body}</svg>`
}

/** The card shown for a private map, a missing map, or a DB hiccup - no content. */
function genericCard(): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="Inter">
  <defs><linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
    <stop offset="0%" stop-color="#1e1b4b"/><stop offset="40%" stop-color="#312e81"/><stop offset="100%" stop-color="#4338ca"/>
  </linearGradient></defs>
  <rect width="${W}" height="${H}" fill="url(#bg)"/>
  <rect x="540" y="230" width="120" height="120" rx="28" fill="#6366f1"/>
  <text x="600" y="315" text-anchor="middle" fill="#ffffff" font-size="64" font-weight="600">M</text>
  <text x="600" y="412" text-anchor="middle" fill="#ffffff" font-size="40" font-weight="600">Mindmaps</text>
  <text x="600" y="452" text-anchor="middle" fill="rgba(255,255,255,0.65)" font-size="20">Visual mind map and diagram tool</text>
  <text x="600" y="594" text-anchor="middle" fill="rgba(255,255,255,0.3)" font-size="16">mindmaps-bheng.vercel.app</text>
</svg>`
}

/** Title strip + the real diagram, on the map's own canvas background. */
function diagramCard(row: ShareRow): string {
  const name = String(row.name || 'Untitled')
  const display = name.length > 58 ? name.slice(0, 55) + '...' : name
  const nodes = Array.isArray(row.nodes) ? row.nodes.length : 0
  const label = TYPE_LABEL[row.type] || row.type || 'Logic Chart'
  // A passcode-locked map still previews, but says so: no counts, and the
  // diagram blurred past reading under a big lock.
  const locked = Boolean(row.locked)
  const meta = locked ? 'Passcode protected. Type the passcode to open it.' : `${nodes} node${nodes === 1 ? '' : 's'}, ${label}`
  const canvasBg = getTheme(row.theme_id ?? 'default').canvasBg

  let diagram = inlineDiagram(
    renderMindmapSvg(row),
    PAD, STRIP_H + PAD, W - PAD * 2, H - STRIP_H - PAD * 2,
  )
  if (locked) {
    const cx = W / 2, cy = STRIP_H + (H - STRIP_H) / 2
    diagram = `<defs><filter id="lockblur" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="16"/></filter></defs>`
      + `<g filter="url(#lockblur)">${diagram}</g>`
      + `<rect x="0" y="${STRIP_H}" width="${W}" height="${H - STRIP_H}" fill="#ffffff" fill-opacity="0.35"/>`
      + `<circle cx="${cx}" cy="${cy}" r="96" fill="#16191d"/>`
      + `<g transform="translate(${cx - 52} ${cy - 56}) scale(4.33)" fill="none" stroke="#ffffff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></g>`
      + `<rect x="${W - PAD - 92}" y="64" width="92" height="28" rx="14" fill="#ffffff"/>`
      + `<text x="${W - PAD - 46}" y="83" text-anchor="middle" fill="#16191d" font-size="15" font-weight="600">Locked</text>`
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="Inter">
  <rect width="${W}" height="${H}" fill="${esc(canvasBg)}"/>
  <rect width="${W}" height="${STRIP_H}" fill="#1a1d2e"/>
  <text x="${PAD}" y="50" fill="#ffffff" font-size="34" font-weight="600">${esc(display)}</text>
  <text x="${PAD}" y="80" fill="rgba(255,255,255,0.6)" font-size="18">${esc(meta)}</text>
  <text x="${W - PAD}" y="50" text-anchor="end" fill="rgba(255,255,255,0.5)" font-size="18" font-weight="600">Mindmaps</text>
  ${diagram}
</svg>`
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const id = (req.query.id ?? '') as string

  let row: ShareRow | null = null
  // The id is interpolated into a SQL parameter and nothing else, but guard the
  // shape anyway so a crafted value never reaches the query or the composed SVG.
  if (UUID_RE.test(id)) {
    try {
      const r = await pool.query(
        'SELECT name, type, line_style, theme_id, nodes, tags, updated_at, passcode_hash IS NOT NULL AS locked FROM mindmaps WHERE id=$1 AND sharing_enabled=true',
        [id],
      )
      if (r.rows.length) row = { id, ...r.rows[0] } as ShareRow
    } catch (e: unknown) {
      console.error('og-image: load failed', e)
    }
  }

  let svg: string
  try {
    svg = row ? diagramCard(row) : genericCard()
  } catch (e: unknown) {
    // A render hiccup must never serve a broken image - fall back to the brand card.
    console.error('og-image: render failed', e)
    svg = genericCard()
  }

  try {
    const png = new Resvg(svg, {
      font: { fontFiles: FONT_FILES, loadSystemFonts: LOAD_SYSTEM_FONTS, defaultFontFamily: 'Inter' },
      fitTo: { mode: 'width', value: W },
    }).render().asPng()

    const stamp = row?.updated_at ? new Date(row.updated_at).getTime() : 0
    res.setHeader('Content-Type', 'image/png')
    res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400')
    res.setHeader('ETag', `"og-${row ? id : 'generic'}-${stamp}${row?.locked ? '-l' : ''}"`)
    res.send(png)
  } catch (e: unknown) {
    console.error('og-image: rasterize failed', e)
    res.status(500).json({ error: 'Failed to render image' })
  }
}
