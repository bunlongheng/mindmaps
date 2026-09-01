// Server-side SVG renderer: turns a stored mindmap row into a self-contained SVG
// string so a remote agent can POST a map and get back an image to embed in docs -
// no browser needed. Mirrors the client pipeline (store load -> layout -> canvas):
// layout via the SAME pure functions in src/lib/layout/*, node/edge drawing ported
// from src/components/canvas/{Node,EdgeLayer,Edge}.tsx (static visuals only - no
// animations, selection rings, or interactivity).
//
// HARD RULES (Vercel serverless safety): pure TS only. NO fs, NO sharp, NO native
// deps, NO external fetches, NO <image href>, NO foreignObject, NO <script>.
// Fonts fall back to system faces; emoji render as plain text glyphs; lucide icons
// render as a tiny neutral placeholder instead of pulling the icon library.
import type { MindmapNode, DiagramType, LineStyle } from '../../src/types/index.js'
import { computeMindmapsLayout } from '../../src/lib/layout/mindmaps-layout.js'
import { computeMindmapLayout, wrapText } from '../../src/lib/layout/mindmap.js'
import { computeFishboneLayout, FISHBONE_SLANT } from '../../src/lib/layout/fishbone.js'
import { computeTimelineLayout } from '../../src/lib/layout/timeline.js'
import { getTheme } from '../../src/lib/themes.js'
import { L1_PALETTE, hexToRgb, darken, applyDepthTransparency } from '../../src/lib/color.js'
import { rootPillWidth, rootPillFontSize, rootTitleNeedsPill } from '../../src/lib/rootPill.js'
import { nodeCenter, nodeCenterLeft, nodeCenterRight, buildStraightPath, buildCurvedPath, buildOrthogonalPath } from '../../src/lib/geometry.js'

// The stored DB row shape (SELECT in api/mindmaps.ts / INSERT in api/ai/mindmaps.ts).
export interface MindmapRow {
  id: string
  name: string
  type: string
  line_style?: string | null
  theme_id?: string | null
  nodes: MindmapNode[] | string | null
}

const FONT = 'Inter, system-ui, -apple-system, sans-serif'
const VALID_TYPES = new Set<string>(['logic-chart', 'mindmap', 'fishbone', 'timeline'])
const VALID_LINE_STYLES = new Set<string>(['straight', 'curved', 'orthogonal'])

const esc = (s: unknown): string => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const r2 = (v: number): number => Math.round(v * 100) / 100

// ── Ported helpers (Node.tsx / mindmapStore.ts - not exported there) ─────────

/** True if the color is light enough that dark text is readable (Node.tsx isLight). */
function isLight(hex: string): boolean {
  if (!hex.startsWith('#')) return true
  const [r, g, b] = hexToRgb(hex)
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 140
}

/** Mix a hex color toward white (Node.tsx lighten). */
function lighten(hex: string, amount = 0.85): string {
  const [r, g, b] = hexToRgb(hex)
  const nr = Math.round(r + (255 - r) * amount)
  const ng = Math.round(g + (255 - g) * amount)
  const nb = Math.round(b + (255 - b) * amount)
  return `rgb(${nr},${ng},${nb})`
}

/** Make all nodes at a depth share the widest width (mindmapStore normalizeWidthsPerDepth). */
function normalizeWidthsPerDepth(nodes: MindmapNode[], type: DiagramType): MindmapNode[] {
  const maxByDepth = new Map<number, number>()
  for (const n of nodes) {
    if (n.depth > 0 && !(type === 'mindmap' && n.depth >= 2)) {
      maxByDepth.set(n.depth, Math.max(maxByDepth.get(n.depth) ?? 0, n.width))
    }
  }
  return nodes.map(n => {
    if (n.depth <= 0) return n
    if (type === 'mindmap' && n.depth >= 2) return n
    return { ...n, width: maxByDepth.get(n.depth) ?? n.width }
  })
}

/** Layout dispatch (mindmapStore runLayout). */
function runLayout(nodes: MindmapNode[], type: DiagramType): MindmapNode[] {
  switch (type) {
    case 'mindmap':  return computeMindmapLayout(nodes)
    case 'fishbone': return computeFishboneLayout(nodes)
    case 'timeline': return computeTimelineLayout(nodes)
    default:         return computeMindmapsLayout(nodes)
  }
}

/** 12-colour-wheel colour per node id (DiagramCanvas computePaletteColors). */
function computePaletteColors(nodes: MindmapNode[]): Map<string, string | null> {
  const byId = new Map(nodes.map(n => [n.id, n]))
  const colors = new Map<string, string | null>()
  const resolve = (n: MindmapNode): string | null => {
    const cached = colors.get(n.id)
    if (cached !== undefined) return cached
    let c: string | null = null
    if (n.depth === 1) c = L1_PALETTE[(((n.sortOrder ?? 0) % 12) + 12) % 12]
    else if (n.depth > 1) {
      const parent = n.parentId ? byId.get(n.parentId) : undefined
      c = parent ? resolve(parent) : null
    }
    colors.set(n.id, c)
    return c
  }
  for (const n of nodes) resolve(n)
  return colors
}

/** Load pipeline (mindmapStore setActiveMindmap): reset sizes -> layout -> normalize -> layout. */
function layoutForRender(raw: MindmapNode[], type: DiagramType): MindmapNode[] {
  const fresh = raw.map(n => {
    if (n.depth !== 0) return { ...n, width: 0, height: 0, manuallyPositioned: false }
    const isPill = n.title.length >= 15 || n.width !== n.height
    if (isPill) return { ...n, width: rootPillWidth(n.title, n.fontSize ?? 28), height: 90, manuallyPositioned: false }
    return { ...n, manuallyPositioned: false }
  })
  const withWidths = runLayout(fresh, type)
  return runLayout(normalizeWidthsPerDepth(withWidths, type), type)
}

// ── Edges (ported from EdgeLayer.tsx / Edge.tsx) ─────────────────────────────

/** Depth-transparent stroke, guarded for non-hex colors. */
function edgeStroke(color: string, depth: number): string {
  return color.startsWith('#') ? applyDepthTransparency(color, depth) : color
}

/** Curved bezier parent right-edge -> child left-edge (EdgeLayer CurvedEdge). */
function curvedEdge(parent: MindmapNode, child: MindmapNode): string {
  const x1 = parent.x + parent.width
  const y1 = parent.y + parent.height / 2
  const x2 = child.x
  const y2 = child.y + child.height / 2
  const cx = (x1 + x2) / 2
  return `<path d="M ${r2(x1)} ${r2(y1)} C ${r2(cx)} ${r2(y1)} ${r2(cx)} ${r2(y2)} ${r2(x2)} ${r2(y2)}" stroke="${esc(child.color)}" stroke-width="2" fill="none" stroke-linecap="round"/>`
}

/** Fan of beziers from a parent to its children (EdgeLayer BracketConnector). */
function bracketConnector(parent: MindmapNode, children: MindmapNode[]): string {
  if (children.length === 0) return ''
  const sorted = [...children].sort((a, b) => a.y - b.y)
  if (children.length === 1) return curvedEdge(parent, sorted[0])
  const px = parent.x + parent.width
  const py = parent.y + parent.height / 2
  return sorted.map(child => {
    const cy = child.y + child.height / 2
    const cx2 = child.x
    const gap = Math.abs(cx2 - px)
    const c1x = px + gap * 0.5
    return `<path d="M ${r2(px)} ${r2(py)} C ${r2(c1x)} ${r2(py)}, ${r2(c1x)} ${r2(cy)}, ${r2(cx2)} ${r2(cy)}" stroke="${esc(child.color)}" stroke-width="2" fill="none" stroke-linecap="round"/>`
  }).join('')
}

/** Deeper logic-chart edge path (Edge.tsx, side-aware). */
function deepEdge(parent: MindmapNode, child: MindmapNode, lineStyle: LineStyle): string {
  const pc = nodeCenter(parent)
  const cc = nodeCenter(child)
  const src = cc.x > pc.x ? nodeCenterRight(parent) : nodeCenterLeft(parent)
  const tgt = cc.x > pc.x ? nodeCenterLeft(child) : nodeCenterRight(child)
  const d = lineStyle === 'straight' ? buildStraightPath(src, tgt)
    : lineStyle === 'orthogonal' ? buildOrthogonalPath(src, tgt)
    : buildCurvedPath(src, tgt)
  return `<path d="${d}" stroke="${esc(edgeStroke(child.color, child.depth))}" stroke-width="1.5" fill="none" stroke-linecap="round"/>`
}

function renderEdges(nodes: MindmapNode[], type: DiagramType, lineStyle: LineStyle, pc: (n: MindmapNode) => string): string {
  const nodeMap = new Map(nodes.map(n => [n.id, n]))

  if (type === 'mindmap') {
    return nodes.filter(n => n.parentId && nodeMap.has(n.parentId)).map(n => {
      const parent = nodeMap.get(n.parentId!)!
      const x1 = parent.x + parent.width / 2
      const y1 = parent.y + parent.height / 2
      const x2 = n.x + n.width / 2
      const y2 = n.y + n.height / 2
      const dx = x2 - x1, dy = y2 - y1
      const len = Math.hypot(dx, dy) || 1
      const ux = dx / len, uy = dy / len
      // Ellipse perimeter intersection: r = 1/sqrt((ux/a)^2 + (uy/b)^2)
      const edgeR = (w: number, h: number) => {
        const a = w / 2, b = h / 2
        const d = Math.sqrt((ux / a) ** 2 + (uy / b) ** 2)
        return d === 0 ? a : 1 / d
      }
      const parentR = edgeR(parent.width, parent.height)
      const childR = edgeR(n.width, n.height)
      const sx = x1 + ux * parentR, sy = y1 + uy * parentR
      const ex = x2 - ux * childR, ey = y2 - uy * childR
      const mx = (sx + ex) / 2, my = (sy + ey) / 2
      const d = lineStyle === 'straight'
        ? `M ${r2(sx)} ${r2(sy)} L ${r2(ex)} ${r2(ey)}`
        : `M ${r2(sx)} ${r2(sy)} Q ${r2(mx)} ${r2(my)} ${r2(ex)} ${r2(ey)}`
      const width = n.depth === 1 ? 3 : n.depth === 2 ? 2.5 : 2
      return `<path d="${d}" stroke="${esc(pc(n))}" stroke-width="${width}" fill="none" stroke-linecap="round"/>`
    }).join('')
  }

  if (type === 'fishbone') {
    const root = nodes.find(n => n.parentId === null)
    if (!root) return ''
    const spineY = root.y + root.height / 2
    const l1s = nodes.filter(n => n.depth === 1)
    const spineEndX = l1s.length > 0
      ? Math.max(...l1s.map(n => n.x + n.width / 2 - FISHBONE_SLANT)) + FISHBONE_SLANT * 1.3
      : root.x + root.width + 400
    const parts: string[] = []
    parts.push(`<line x1="${r2(root.x + root.width)}" y1="${r2(spineY)}" x2="${r2(spineEndX)}" y2="${r2(spineY)}" stroke="#64748b" stroke-width="3" stroke-linecap="round"/>`)
    for (const l1 of l1s) {
      const l1CX = l1.x + l1.width / 2
      const l1CY = l1.y + l1.height / 2
      const attachX = l1CX - FISHBONE_SLANT
      const above = l1CY < spineY
      const l1EdgeY = above ? l1.y + l1.height : l1.y
      parts.push(`<line x1="${r2(attachX)}" y1="${r2(spineY)}" x2="${r2(l1CX)}" y2="${r2(l1EdgeY)}" stroke="${esc(pc(l1))}" stroke-width="2.5" stroke-linecap="round"/>`)
    }
    for (const l2 of nodes.filter(n => n.depth === 2)) {
      const l1 = nodeMap.get(l2.parentId ?? '')
      if (!l1) continue
      const l1CX = l1.x + l1.width / 2
      const l1CY = l1.y + l1.height / 2
      const attachX = l1CX - FISHBONE_SLANT
      const above = l1CY < spineY
      const l1EdgeY = above ? l1.y + l1.height : l1.y
      const boneEdgeH = Math.abs(l1EdgeY - spineY)
      const l2CY = l2.y + l2.height / 2
      const t = above ? (spineY - l2CY) / boneEdgeH : (l2CY - spineY) / boneEdgeH
      const diagX = attachX + FISHBONE_SLANT * t
      const nodeEdgeX = l2.x + (l2.height * 0.35) / 2
      parts.push(`<line x1="${r2(diagX)}" y1="${r2(l2CY)}" x2="${r2(nodeEdgeX)}" y2="${r2(l2CY)}" stroke="${esc(pc(l2))}" stroke-width="1.5" stroke-linecap="round"/>`)
    }
    for (const n of nodes.filter(n => n.depth >= 3)) {
      const parent = nodeMap.get(n.parentId ?? '')
      if (!parent) continue
      parts.push(`<line x1="${r2(parent.x + parent.width)}" y1="${r2(parent.y + parent.height / 2)}" x2="${r2(n.x)}" y2="${r2(n.y + n.height / 2)}" stroke="${esc(pc(n))}" stroke-width="1.5" stroke-linecap="round"/>`)
    }
    return parts.join('')
  }

  if (type === 'timeline') {
    const root = nodes.find(n => n.parentId === null)
    if (!root) return ''
    const l1s = nodes.filter(n => n.depth === 1).sort((a, b) => a.x - b.x)
    const spineY = root.y + root.height / 2
    const spineEndX = l1s.length > 0
      ? l1s[l1s.length - 1].x + l1s[l1s.length - 1].width + 24
      : root.x + root.width + 400
    const parts: string[] = []
    parts.push(`<line x1="${r2(root.x + root.width)}" y1="${r2(spineY)}" x2="${r2(spineEndX)}" y2="${r2(spineY)}" stroke="#94a3b8" stroke-width="2.5" stroke-linecap="round"/>`)
    for (const l1 of l1s) {
      const branchX = l1.x
      const descendants = nodes.filter(n => {
        let cur = nodeMap.get(n.parentId ?? '')
        while (cur) {
          if (cur.id === l1.id) return true
          cur = nodeMap.get(cur.parentId ?? '')
        }
        return false
      })
      const above = descendants.length > 0 && descendants.some(n => n.y + n.height < spineY)
      const l1SpineEdge = above ? l1.y : l1.y + l1.height
      const farY = descendants.length > 0
        ? above
          ? Math.min(...descendants.map(n => n.y + n.height / 2))
          : Math.max(...descendants.map(n => n.y + n.height / 2))
        : l1SpineEdge
      if (descendants.length > 0) {
        parts.push(`<line x1="${r2(branchX)}" y1="${r2(l1SpineEdge)}" x2="${r2(branchX)}" y2="${r2(farY)}" stroke="${esc(pc(l1))}" stroke-width="1.8" stroke-linecap="round"/>`)
      }
      for (const n of descendants) {
        const nodeCY = n.y + n.height / 2
        parts.push(`<line x1="${r2(branchX)}" y1="${r2(nodeCY)}" x2="${r2(n.x)}" y2="${r2(nodeCY)}" stroke="${esc(pc(l1))}" stroke-width="1.5" stroke-linecap="round"/>`)
      }
    }
    return parts.join('')
  }

  // Logic chart (default)
  const root = nodes.find(n => n.parentId === null)
  if (!root) return ''

  if (lineStyle === 'curved') {
    // Brace look: bracket connectors from root down through every level
    return nodes
      .filter(n => nodes.some(c => c.parentId === n.id))
      .map(parent => bracketConnector(parent, nodes.filter(n => n.parentId === parent.id)))
      .join('')
  }

  const l1Nodes = nodes.filter(n => n.parentId === root.id)
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
  const parts: string[] = []
  if (l1Nodes.length > 0) {
    const rootRightX = root.x + root.width
    const l1LeftX = l1Nodes[0].x
    const barX = l1LeftX - 60
    const sortedL1 = [...l1Nodes].sort((a, b) => a.y - b.y)
    const l1MidY = ((sortedL1[0].y + sortedL1[0].height / 2) + (sortedL1[sortedL1.length - 1].y + sortedL1[sortedL1.length - 1].height / 2)) / 2
    parts.push(`<line x1="${r2(rootRightX)}" y1="${r2(l1MidY)}" x2="${r2(barX)}" y2="${r2(l1MidY)}" stroke="#1a1d2e" stroke-width="4" stroke-linecap="round"/>`)
    l1Nodes.forEach((l1, i) => {
      if (i === l1Nodes.length - 1) return
      const nextL1 = l1Nodes[i + 1]
      parts.push(`<line x1="${r2(barX)}" y1="${r2(l1.y + l1.height / 2)}" x2="${r2(barX)}" y2="${r2(nextL1.y + nextL1.height / 2)}" stroke="${esc(pc(l1))}" stroke-width="4" stroke-linecap="square"/>`)
    })
    for (const l1 of l1Nodes) {
      const stubY = l1.y + l1.height / 2
      parts.push(`<line x1="${r2(barX)}" y1="${r2(stubY)}" x2="${r2(l1.x)}" y2="${r2(stubY)}" stroke="${esc(pc(l1))}" stroke-width="4" stroke-linecap="round"/>`)
    }
  }
  for (const n of nodes) {
    if (!n.parentId || n.parentId === root.id) continue
    const parent = nodeMap.get(n.parentId)
    if (parent) parts.push(deepEdge(parent, n, lineStyle))
  }
  return parts.join('')
}

// ── Nodes (ported from Node.tsx, static visuals only) ────────────────────────

/** Multi-line centered <text> (mindmap circles + mindmap root). */
function centeredWrappedText(label: string, cx: number, cy: number, fontSize: number, fontWeight: string, fill: string): string {
  const maxChars = Math.max(8, Math.ceil(Math.sqrt(label.length * 1.8)))
  const lines = wrapText(label, maxChars)
  const lineH = fontSize * 1.3
  const startY = cy - ((lines.length - 1) * lineH) / 2 + fontSize * 0.38
  const tspans = lines.map((line, i) =>
    `<tspan x="${r2(cx)}" y="${r2(startY + i * lineH)}">${esc(line)}</tspan>`).join('')
  return `<text text-anchor="middle" font-size="${fontSize}" font-weight="${fontWeight}" fill="${esc(fill)}">${tspans}</text>`
}

function renderNode(node: MindmapNode, type: DiagramType, paletteColor: string | null): string {
  const isRoot = node.depth === 0
  const isL2Plus = node.depth >= 2
  const isMindmapL2Plus = type === 'mindmap' && node.depth >= 2
  const isFishboneNode = type === 'fishbone' && node.depth >= 1
  const col = (isRoot ? null : paletteColor) ?? node.color
  const rx = isRoot ? 4 : 3
  const effectiveRx = isFishboneNode ? 0 : rx

  const isRootPill = isRoot && type !== 'mindmap' && (
    node.shape === 'pill' ? true :
    node.shape === 'circle' ? false :
    rootTitleNeedsPill(node.title, node.fontSize ?? 28)
  )

  // Styling per depth (Node.tsx)
  let bg: string, textColor: string, strokeColor: string, strokeW: number
  if (isRoot) {
    bg = '#1a1d2e'; textColor = '#ffffff'; strokeColor = '#1a1d2e'; strokeW = 5
  } else if (isL2Plus) {
    const lightenAmt = node.depth === 2 ? 0.58 : node.depth === 3 ? 0.68 : 0.76
    bg = col.startsWith('#') ? lighten(col, lightenAmt) : '#f8fafc'
    textColor = col.startsWith('#') ? darken(col, 0.55) : col
    strokeColor = col
    strokeW = 2
  } else {
    bg = col
    textColor = isLight(col) ? '#1a1d2e' : '#ffffff'
    strokeColor = col.startsWith('#') ? darken(col, 0.25) : col
    strokeW = 2
  }
  if (node.borderColor) { strokeColor = node.borderColor; strokeW = Math.max(strokeW, node.borderWidth ?? 1.5) }

  const defaultFontSize = node.depth === 0 ? 34 : node.depth === 1 ? 26 : node.depth === 2 ? 19 : node.depth === 3 ? 16 : 13
  const baseFontSize = node.fontSize ?? defaultFontSize
  const fontSize = isRootPill ? rootPillFontSize(node.title, baseFontSize) : baseFontSize
  const fontWeight = node.bold ? '700' : (isRoot ? '500' : node.depth === 1 ? '500' : '400')

  const hasEmoji = !isRoot && !!node.emoji
  const hasIcon = !isRoot && !hasEmoji && !!node.icon
  const displayW = isRootPill ? rootPillWidth(node.title, baseFontSize)
    : isMindmapL2Plus ? Math.max(node.width, node.height)
    : node.width
  const h = node.height
  const cx = displayW / 2
  const cy = h / 2
  const label = node.title
  const align = isRoot ? 'center' : node.depth === 1 ? (node.textAlign ?? 'left') : 'left'

  const parts: string[] = []

  // ── Shape ──
  if (isRoot) {
    if (isRootPill) {
      parts.push(`<rect x="0" y="0" width="${r2(displayW)}" height="${r2(h)}" rx="${r2(h / 2)}" ry="${r2(h / 2)}" fill="${bg}" fill-opacity="0.8" stroke="${strokeColor}" stroke-width="${strokeW}"/>`)
    } else {
      parts.push(`<circle cx="${r2(cx)}" cy="${r2(cy)}" r="${r2(displayW / 2)}" fill="${bg}" fill-opacity="0.8" stroke="${strokeColor}" stroke-width="${strokeW}"/>`)
    }
  } else if (isFishboneNode) {
    // Parallelogram skewed toward the spine (SPINE_Y = 400 in the fishbone layout)
    const sk = h * 0.35
    const above = node.y + h / 2 < 400
    const pts = above
      ? `${r2(sk)},0 ${r2(displayW)},0 ${r2(displayW - sk)},${r2(h)} 0,${r2(h)}`
      : `0,0 ${r2(displayW - sk)},0 ${r2(displayW)},${r2(h)} ${r2(sk)},${r2(h)}`
    parts.push(`<polygon points="${pts}" fill="${esc(bg)}"/>`)
    if (hasEmoji || hasIcon) {
      const badgeW = h + 1
      const badgePts = above
        ? `${r2(sk)},0 ${r2(sk + badgeW)},0 ${r2(badgeW)},${r2(h)} 0,${r2(h)}`
        : `0,0 ${r2(badgeW)},0 ${r2(badgeW + sk)},${r2(h)} ${r2(sk)},${r2(h)}`
      parts.push(`<polygon points="${badgePts}" fill="#ffffff"/>`)
    }
    parts.push(`<polygon points="${pts}" fill="none" stroke="${esc(strokeColor)}" stroke-width="${strokeW}"/>`)
  } else {
    parts.push(`<rect x="0" y="0" width="${r2(displayW)}" height="${r2(h)}" rx="${effectiveRx}" ry="${effectiveRx}" fill="${esc(bg)}"/>`)
    if ((hasEmoji || hasIcon) && !isMindmapL2Plus) {
      parts.push(`<rect x="0" y="0" width="${r2(h + 1)}" height="${r2(h)}" fill="#ffffff"/>`)
    }
    parts.push(`<rect x="0" y="0" width="${r2(displayW)}" height="${r2(h)}" rx="${effectiveRx}" ry="${effectiveRx}" fill="none" stroke="${esc(strokeColor)}" stroke-width="${strokeW * 2}"/>`)
  }

  // ── Label + badge ──
  const skOff = isFishboneNode ? (h * 0.35) / 2 : 0
  if (isMindmapL2Plus || (isRoot && type === 'mindmap')) {
    parts.push(centeredWrappedText(label, cx, cy, fontSize, fontWeight, textColor))
  } else if (hasEmoji) {
    const emojiSize = Math.round(h * 0.52)
    parts.push(`<text x="${r2(h / 2 + skOff)}" y="${r2(h / 2 + emojiSize * 0.36)}" text-anchor="middle" font-size="${emojiSize}">${esc(node.emoji)}</text>`)
    parts.push(`<text x="${r2(h + 14 + skOff)}" y="${r2(h / 2 + fontSize * 0.38)}" text-anchor="start" font-size="${fontSize}" font-weight="${fontWeight}" fill="${esc(textColor)}">${esc(label)}</text>`)
  } else if (hasIcon) {
    // Neutral placeholder for the lucide icon (no icon dep server-side)
    const iconSize = Math.round(h * 0.48)
    const ix = (h - iconSize) / 2 + skOff
    const iy = (h - iconSize) / 2
    parts.push(`<rect x="${r2(ix)}" y="${r2(iy)}" width="${iconSize}" height="${iconSize}" rx="${Math.round(iconSize / 4)}" fill="none" stroke="${esc(col)}" stroke-width="2"/>`)
    parts.push(`<circle cx="${r2(ix + iconSize / 2)}" cy="${r2(iy + iconSize / 2)}" r="${r2(iconSize / 6)}" fill="${esc(col)}"/>`)
    parts.push(`<text x="${r2(h + 14 + skOff)}" y="${r2(h / 2 + fontSize * 0.38)}" text-anchor="start" font-size="${fontSize}" font-weight="${fontWeight}" fill="${esc(textColor)}">${esc(label)}</text>`)
  } else {
    const tx = isRoot ? cx : align === 'left' ? 12 + skOff : align === 'right' ? displayW - 12 : displayW / 2
    const anchor = isRoot || align === 'center' ? 'middle' : align === 'right' ? 'end' : 'start'
    parts.push(`<text x="${r2(tx)}" y="${r2(isRoot ? cy + fontSize * 0.38 : h / 2 + fontSize * 0.38)}" text-anchor="${anchor}" font-size="${fontSize}" font-weight="${fontWeight}" fill="${esc(textColor)}">${esc(label)}</text>`)
  }

  return `<g transform="translate(${r2(node.x)},${r2(node.y)})">${parts.join('')}</g>`
}

// ── Entry point ──────────────────────────────────────────────────────────────

export function renderMindmapSvg(row: MindmapRow): string {
  const type: DiagramType = VALID_TYPES.has(row.type) ? row.type as DiagramType : 'logic-chart'
  const lineStyle: LineStyle = VALID_LINE_STYLES.has(row.line_style ?? '') ? row.line_style as LineStyle : 'orthogonal'
  const theme = getTheme(row.theme_id ?? 'default')

  const raw: MindmapNode[] = Array.isArray(row.nodes)
    ? row.nodes
    : row.nodes ? JSON.parse(String(row.nodes)) : []

  if (!raw.length) {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 120" width="400" height="120" font-family="${FONT}"><title>${esc(row.name)}</title><rect x="0" y="0" width="400" height="120" fill="${theme.canvasBg}"/><text x="200" y="66" text-anchor="middle" font-size="18" fill="#64748b">${esc(row.name)} (empty)</text></svg>`
  }

  const nodes = layoutForRender(raw, type)
  const paletteColors = computePaletteColors(nodes)
  const pc = (n: MindmapNode) => paletteColors.get(n.id) ?? n.color

  // Draw order: edges under nodes (DiagramCanvas)
  const edges = renderEdges(nodes, type, lineStyle, pc)
  const nodeMarkup = nodes.map(n => renderNode(n, type, paletteColors.get(n.id) ?? null)).join('')

  // viewBox from laid-out bounds (+ slack for spines that extend past the nodes)
  const pad = 60
  const minX = Math.min(...nodes.map(n => n.x)) - pad
  const minY = Math.min(...nodes.map(n => n.y)) - pad
  const maxX = Math.max(...nodes.map(n => n.x + n.width)) + pad + (type === 'fishbone' || type === 'timeline' ? 120 : 0)
  const maxY = Math.max(...nodes.map(n => n.y + n.height)) + pad
  const w = Math.max(1, Math.ceil(maxX - minX))
  const hgt = Math.max(1, Math.ceil(maxY - minY))

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${r2(minX)} ${r2(minY)} ${w} ${hgt}" width="${w}" height="${hgt}" font-family="${FONT}">` +
    `<title>${esc(row.name)}</title>` +
    `<rect x="${r2(minX)}" y="${r2(minY)}" width="${w}" height="${hgt}" fill="${theme.canvasBg}"/>` +
    `<g>${edges}</g><g>${nodeMarkup}</g></svg>`
}
