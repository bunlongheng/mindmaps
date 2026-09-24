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
import type { MindmapNode, DiagramType, LineStyle } from '../types/index.js'
import { computeMindmapsLayout } from './layout/mindmaps-layout.js'
import { computeMindmapLayout, wrapText, initialFontSize, nodeInitial, radialLabelFor, radialNodeExtent, LABEL_FONT, RADIAL_ROOT_FONT } from './layout/mindmap.js'
import { computeFishboneLayout, FISHBONE_SLANT } from './layout/fishbone.js'
import { computeTimelineLayout } from './layout/timeline.js'
import { getTheme } from './themes.js'
import { L1_PALETTE, hexToRgb, darken, depthFill, applyDepthTransparency, edgeWidthForDepth, radialEdgeWidth, RADIAL_EDGE_OPACITY } from './color.js'
import { rootPillWidth, rootPillFontSize, rootTitleNeedsPill, ROOT_FONT } from './rootPill.js'
import { nodeMetrics, ICON_GAP } from './nodeMetrics.js'
import { shapeRx } from './nodeShape.js'
import { parseLinkedTitle, sliceSegments, lineRanges, type LinkSegment } from './links.js'
import { nodeCenter, nodeCenterLeft, nodeCenterRight, buildStraightPath, buildCurvedPath, buildOrthogonalPath, buildRadialBranchPath } from './geometry.js'
import { computeSubtreeCounts } from './nodeCounts.js'

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

/** Make all nodes at a depth share the widest width (mindmapStore normalizeWidthsPerDepth). */
function normalizeWidthsPerDepth(nodes: MindmapNode[], type: DiagramType): MindmapNode[] {
  // The mind map is a radial constellation: every circle's diameter is its own
  // subtree's weight, so a shared per-depth width would erase the whole point.
  if (type === 'mindmap') return nodes
  const maxByDepth = new Map<number, number>()
  for (const n of nodes) {
    if (n.depth > 0 && n.shape !== 'circle') {
      maxByDepth.set(n.depth, Math.max(maxByDepth.get(n.depth) ?? 0, n.width))
    }
  }
  return nodes.map(n => {
    if (n.depth <= 0) return n
    if (n.shape === 'circle') return n   // circle-shaped nodes keep their own square
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
    const isPill = parseLinkedTitle(n.title).text.length >= 15 || n.width !== n.height
    if (isPill) return { ...n, width: rootPillWidth(n.title, n.fontSize ?? ROOT_FONT), height: nodeMetrics(0).height, manuallyPositioned: false }
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
  return `<path d="M ${r2(x1)} ${r2(y1)} C ${r2(cx)} ${r2(y1)} ${r2(cx)} ${r2(y2)} ${r2(x2)} ${r2(y2)}" stroke="${esc(child.color)}" stroke-width="${edgeWidthForDepth(child.depth)}" fill="none" stroke-linecap="round"/>`
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
    return `<path d="M ${r2(px)} ${r2(py)} C ${r2(c1x)} ${r2(py)}, ${r2(c1x)} ${r2(cy)}, ${r2(cx2)} ${r2(cy)}" stroke="${esc(child.color)}" stroke-width="${edgeWidthForDepth(child.depth)}" fill="none" stroke-linecap="round"/>`
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
  return `<path d="${d}" stroke="${esc(edgeStroke(child.color, child.depth))}" stroke-width="${edgeWidthForDepth(child.depth)}" fill="none" stroke-linecap="round"/>`
}

function renderEdges(nodes: MindmapNode[], type: DiagramType, lineStyle: LineStyle, pc: (n: MindmapNode) => string): string {
  const nodeMap = new Map(nodes.map(n => [n.id, n]))

  // Radial constellation: thin, same-handed curves from circle edge to circle edge,
  // identical to the canvas (EdgeLayer.tsx) so a card preview matches the opened map.
  if (type === 'mindmap') {
    return nodes.filter(n => n.parentId && nodeMap.has(n.parentId)).map(n => {
      const parent = nodeMap.get(n.parentId!)!
      const d = buildRadialBranchPath(parent, n)
      return `<path d="${d}" stroke="${esc(pc(n))}" stroke-opacity="${RADIAL_EDGE_OPACITY}" stroke-width="${radialEdgeWidth(n.depth)}" fill="none" stroke-linecap="round"/>`
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
      parts.push(`<line x1="${r2(attachX)}" y1="${r2(spineY)}" x2="${r2(l1CX)}" y2="${r2(l1EdgeY)}" stroke="${esc(pc(l1))}" stroke-width="${edgeWidthForDepth(1)}" stroke-linecap="round"/>`)
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
      parts.push(`<line x1="${r2(diagX)}" y1="${r2(l2CY)}" x2="${r2(nodeEdgeX)}" y2="${r2(l2CY)}" stroke="${esc(pc(l2))}" stroke-width="${edgeWidthForDepth(2)}" stroke-linecap="round"/>`)
    }
    for (const n of nodes.filter(n => n.depth >= 3)) {
      const parent = nodeMap.get(n.parentId ?? '')
      if (!parent) continue
      parts.push(`<line x1="${r2(parent.x + parent.width)}" y1="${r2(parent.y + parent.height / 2)}" x2="${r2(n.x)}" y2="${r2(n.y + n.height / 2)}" stroke="${esc(pc(n))}" stroke-width="${edgeWidthForDepth(n.depth)}" stroke-linecap="round"/>`)
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
        parts.push(`<line x1="${r2(branchX)}" y1="${r2(l1SpineEdge)}" x2="${r2(branchX)}" y2="${r2(farY)}" stroke="${esc(pc(l1))}" stroke-width="${edgeWidthForDepth(2)}" stroke-linecap="round"/>`)
      }
      for (const n of descendants) {
        const nodeCY = n.y + n.height / 2
        parts.push(`<line x1="${r2(branchX)}" y1="${r2(nodeCY)}" x2="${r2(n.x)}" y2="${r2(nodeCY)}" stroke="${esc(pc(l1))}" stroke-width="${edgeWidthForDepth(n.depth)}" stroke-linecap="round"/>`)
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
    parts.push(`<line x1="${r2(rootRightX)}" y1="${r2(l1MidY)}" x2="${r2(barX)}" y2="${r2(l1MidY)}" stroke="#1a1d2e" stroke-width="${edgeWidthForDepth(1)}" stroke-linecap="round"/>`)
    l1Nodes.forEach((l1, i) => {
      if (i === l1Nodes.length - 1) return
      const nextL1 = l1Nodes[i + 1]
      parts.push(`<line x1="${r2(barX)}" y1="${r2(l1.y + l1.height / 2)}" x2="${r2(barX)}" y2="${r2(nextL1.y + nextL1.height / 2)}" stroke="${esc(pc(l1))}" stroke-width="4" stroke-linecap="square"/>`)
    })
    for (const l1 of l1Nodes) {
      const stubY = l1.y + l1.height / 2
      parts.push(`<line x1="${r2(barX)}" y1="${r2(stubY)}" x2="${r2(l1.x)}" y2="${r2(stubY)}" stroke="${esc(pc(l1))}" stroke-width="${edgeWidthForDepth(1)}" stroke-linecap="round"/>`)
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

/** Title runs as <tspan>s; http(s) runs wrapped in an SVG <a> so the exported
 *  image carries real, clickable links. Only http(s) ever reaches here (see links.ts). */
function runTspans(segments: LinkSegment[]): string {
  return segments.map(seg => seg.url
    ? `<a href="${esc(seg.url)}" target="_blank" rel="noopener noreferrer"><tspan text-decoration="underline">${esc(seg.text)}</tspan></a>`
    : `<tspan>${esc(seg.text)}</tspan>`).join('')
}

/** Multi-line centered <text> (mindmap circles + mindmap root). */
function centeredWrappedText(label: string, segments: LinkSegment[], cx: number, cy: number, fontSize: number, fontWeight: string, fill: string): string {
  const maxChars = Math.max(8, Math.ceil(Math.sqrt(label.length * 1.8)))
  const lines = wrapText(label, maxChars)
  const ranges = lineRanges(label, lines)
  const hasLinks = segments.some(seg => !!seg.url)
  const lineH = fontSize * 1.3
  const startY = cy - ((lines.length - 1) * lineH) / 2 + fontSize * 0.38
  const tspans = lines.map((line, i) =>
    `<tspan x="${r2(cx)}" y="${r2(startY + i * lineH)}">${hasLinks ? runTspans(sliceSegments(segments, ranges[i][0], ranges[i][1])) : esc(line)}</tspan>`).join('')
  return `<text text-anchor="middle" font-size="${fontSize}" font-weight="${fontWeight}" fill="${esc(fill)}">${tspans}</text>`
}

function renderNode(node: MindmapNode, type: DiagramType, paletteColor: string | null, descendants = 0, rootCenter: { x: number; y: number } | null = null): string {
  const isRoot = node.depth === 0
  const isL2Plus = node.depth >= 2
  const isFishboneNode = type === 'fishbone' && node.depth >= 1
  // Radial constellation node, mirroring Node.tsx: a circle sized by its own subtree,
  // with the label drawn outside it. An explicit per-node shape opts out.
  const isRadial = type === 'mindmap' && !isRoot && !node.shape
  const isRadialDot = isRadial && node.depth >= 3
  const col = (isRoot ? null : paletteColor) ?? node.color
  const rx = isRoot ? 4 : 3
  // An explicit per-node shape overrides the diagram's own default geometry, exactly
  // as it does on the canvas (Node.tsx), so a card preview matches the opened map.
  const nodeShape = isRoot ? undefined : node.shape
  const drawCircle = nodeShape === 'circle'
  const effectiveRx = isRoot ? rx
    : nodeShape ? shapeRx(nodeShape, node.height, rx)
    : isFishboneNode ? 0 : rx

  const isRootPill = isRoot && type !== 'mindmap' && (
    node.shape === 'pill' ? true :
    node.shape === 'circle' ? false :
    rootTitleNeedsPill(node.title, node.fontSize ?? ROOT_FONT)
  )

  // Styling per depth (Node.tsx)
  let bg: string, textColor: string, strokeColor: string, strokeW: number
  if (isRoot) {
    bg = '#1a1d2e'; textColor = '#ffffff'; strokeColor = '#1a1d2e'; strokeW = 5
  } else if (isL2Plus) {
    // Same shared depth ladder as the canvas (src/lib/color depthFill).
    bg = col.startsWith('#') ? depthFill(col, node.depth) : '#f8fafc'
    textColor = isLight(bg) ? '#1a1d2e' : '#ffffff'
    strokeColor = col
    strokeW = isRadialDot ? 1 : 2
  } else {
    bg = col
    textColor = isLight(col) ? '#1a1d2e' : '#ffffff'
    strokeColor = col.startsWith('#') ? darken(col, 0.25) : col
    strokeW = 2
  }
  if (node.borderColor) { strokeColor = node.borderColor; strokeW = Math.max(strokeW, node.borderWidth ?? 1.5) }

  // Same shared box table the canvas reads (src/lib/nodeMetrics), so a card preview
  // and the opened map can never draw a label at a different size.
  const metric = nodeMetrics(node.depth)
  // Coerced: fontSize is typed number but arrives as unvalidated stored JSON, and it
  // lands in an SVG attribute that the home grid injects with dangerouslySetInnerHTML.
  const baseFontSize = Number(node.fontSize)
    || (isRoot && type === 'mindmap' ? RADIAL_ROOT_FONT : metric.fontSize)
  const fontSize = isRootPill ? rootPillFontSize(node.title, baseFontSize) : baseFontSize
  const fontWeight = node.bold ? '700' : (isRoot ? '500' : node.depth === 1 ? '500' : '400')

  const hasEmoji = !isRoot && !!node.emoji
  const hasIcon = !isRoot && !hasEmoji && !!node.icon
  const displayW = isRootPill ? rootPillWidth(node.title, baseFontSize)
    : (isRadial || drawCircle) ? Math.max(node.width, node.height)
    : node.width
  // Circle-shaped nodes draw in a square box; the layout already sizes them square.
  const h = (isRadial || drawCircle) ? Math.max(displayW, node.height) : node.height
  const cx = displayW / 2
  const cy = h / 2
  const parsedTitle = parseLinkedTitle(node.title)
  const label = parsedTitle.text
  const labelBody = parsedTitle.segments.some(seg => !!seg.url) ? runTspans(parsedTitle.segments) : esc(label)
  const align = isRoot ? 'center' : node.depth === 1 ? (node.textAlign ?? 'left') : 'left'

  const parts: string[] = []

  // ── Shape ──
  if (isRoot) {
    if (isRootPill) {
      parts.push(`<rect x="0" y="0" width="${r2(displayW)}" height="${r2(h)}" rx="${r2(h / 2)}" ry="${r2(h / 2)}" fill="${esc(bg)}" stroke="${esc(strokeColor)}" stroke-width="${strokeW}"/>`)
    } else {
      if (type === 'mindmap') {
        parts.push(`<circle cx="${r2(cx)}" cy="${r2(cy)}" r="${r2(displayW / 2 * 1.08)}" fill="${esc(bg)}" opacity="0.22" filter="url(#mm-glow)"/>`)
      }
      parts.push(`<circle cx="${r2(cx)}" cy="${r2(cy)}" r="${r2(displayW / 2)}" fill="${esc(bg)}" stroke="${esc(strokeColor)}" stroke-width="${strokeW}"/>`)
    }
  } else if (isRadial) {
    const cr = displayW / 2
    if (node.depth <= 2) {
      parts.push(`<circle cx="${r2(cx)}" cy="${r2(cy)}" r="${r2(cr * 1.1)}" fill="${esc(col)}" opacity="0.3" filter="url(#mm-glow)"/>`)
    }
    parts.push(`<circle cx="${r2(cx)}" cy="${r2(cy)}" r="${r2(cr)}" fill="${esc(bg)}"/>`)
    parts.push(`<circle cx="${r2(cx)}" cy="${r2(cy)}" r="${r2(cr)}" fill="none" stroke="${esc(strokeColor)}" stroke-width="${strokeW}"/>`)
  } else if (drawCircle) {
    const cr = displayW / 2
    parts.push(`<circle cx="${r2(cx)}" cy="${r2(cy)}" r="${r2(cr)}" fill="${esc(bg)}"/>`)
    parts.push(`<circle cx="${r2(cx)}" cy="${r2(cy)}" r="${r2(cr)}" fill="none" stroke="${esc(strokeColor)}" stroke-width="${strokeW}"/>`)
  } else if (isFishboneNode && !nodeShape) {
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
    if (hasEmoji || hasIcon) {
      parts.push(`<rect x="0" y="0" width="${r2(h + 1)}" height="${r2(h)}" fill="#ffffff"/>`)
    }
    parts.push(`<rect x="0" y="0" width="${r2(displayW)}" height="${r2(h)}" rx="${effectiveRx}" ry="${effectiveRx}" fill="none" stroke="${esc(strokeColor)}" stroke-width="${strokeW * 2}"/>`)
  }

  // ── Label + badge ──
  const skOff = isFishboneNode ? (h * 0.35) / 2 : 0
  if (isRadial) {
    // Same three bands the canvas draws, from the same helper the layout reserved
    // room with: the initial inside the circle, the name and subtree size under a
    // depth-1 circle, the name pointing OUTWARD from a depth-2 one, and nothing
    // beside a dot. The whole title always survives in <title> for hover.
    parts.push(`<title>${esc(label)}</title>`)
    if (!isRadialDot) {
      const glyph = Number(node.fontSize) || initialFontSize(node.depth, displayW)
      if (hasEmoji) {
        parts.push(`<text x="${r2(cx)}" y="${r2(cy + glyph * 0.36)}" text-anchor="middle" font-size="${glyph}">${esc(node.emoji)}</text>`)
      } else if (hasIcon) {
        // No icon library server-side: a neutral ring stands in for the lucide glyph.
        parts.push(`<circle cx="${r2(cx)}" cy="${r2(cy)}" r="${r2(glyph / 2.4)}" fill="none" stroke="${esc(textColor)}" stroke-width="2"/>`)
      } else {
        parts.push(`<text x="${r2(cx)}" y="${r2(cy + glyph * 0.36)}" text-anchor="middle" font-size="${glyph}" font-weight="600" fill="${esc(textColor)}">${esc(nodeInitial(node.title))}</text>`)
      }
    }
    const lbl = radialLabelFor(node, rootCenter?.x ?? 0, rootCenter?.y ?? 0)
    if (lbl) {
      const body = lbl.text === label ? labelBody : esc(lbl.text)
      const size = node.depth === 1 ? LABEL_FONT.title1 : LABEL_FONT.title2
      const weight = node.depth === 1 ? '600' : '400'
      const fill = node.depth === 1 ? '#1a1d2e' : '#475569'
      parts.push(`<text x="${r2(lbl.tx)}" y="${r2(lbl.ty)}" text-anchor="${lbl.anchor}" font-size="${size}" font-weight="${weight}" fill="${fill}">${body}</text>`)
      if (lbl.countY !== null && descendants > 0) {
        parts.push(`<text x="${r2(lbl.tx)}" y="${r2(lbl.countY)}" text-anchor="${lbl.anchor}" font-size="${LABEL_FONT.count1}" font-weight="600" fill="${esc(col)}">${descendants}</text>`)
      }
    }
  } else if (drawCircle || (isRoot && type === 'mindmap')) {
    parts.push(centeredWrappedText(label, parsedTitle.segments, cx, cy, fontSize, fontWeight, textColor))
  } else if (hasEmoji) {
    const emojiSize = Math.round(h * 0.52)
    parts.push(`<text x="${r2(h / 2 + skOff)}" y="${r2(h / 2 + emojiSize * 0.36)}" text-anchor="middle" font-size="${emojiSize}">${esc(node.emoji)}</text>`)
    parts.push(`<text x="${r2(h + ICON_GAP + skOff)}" y="${r2(h / 2 + fontSize * 0.38)}" text-anchor="start" font-size="${fontSize}" font-weight="${fontWeight}" fill="${esc(textColor)}">${labelBody}</text>`)
  } else if (hasIcon) {
    // Neutral placeholder for the lucide icon (no icon dep server-side)
    const iconSize = Math.round(h * 0.48)
    const ix = (h - iconSize) / 2 + skOff
    const iy = (h - iconSize) / 2
    parts.push(`<rect x="${r2(ix)}" y="${r2(iy)}" width="${iconSize}" height="${iconSize}" rx="${Math.round(iconSize / 4)}" fill="none" stroke="${esc(col)}" stroke-width="2"/>`)
    parts.push(`<circle cx="${r2(ix + iconSize / 2)}" cy="${r2(iy + iconSize / 2)}" r="${r2(iconSize / 6)}" fill="${esc(col)}"/>`)
    parts.push(`<text x="${r2(h + ICON_GAP + skOff)}" y="${r2(h / 2 + fontSize * 0.38)}" text-anchor="start" font-size="${fontSize}" font-weight="${fontWeight}" fill="${esc(textColor)}">${labelBody}</text>`)
  } else {
    const tx = isRoot ? cx : align === 'left' ? metric.padX + skOff : align === 'right' ? displayW - metric.padX : displayW / 2
    const anchor = isRoot || align === 'center' ? 'middle' : align === 'right' ? 'end' : 'start'
    parts.push(`<text x="${r2(tx)}" y="${r2(isRoot ? cy + fontSize * 0.38 : h / 2 + fontSize * 0.38)}" text-anchor="${anchor}" font-size="${fontSize}" font-weight="${fontWeight}" fill="${esc(textColor)}">${labelBody}</text>`)
  }

  return `<g transform="translate(${r2(node.x)},${r2(node.y)})">${parts.join('')}</g>`
}

/**
 * Drawn extent of a node, labels included. The radial mind map hangs its names
 * outside the circles, so the home card and the share image have to reserve room for
 * text that lives beyond the node's own box - otherwise the outermost labels are
 * cropped off the preview. The extent comes from the same helper the layout reserved
 * the space with (src/lib/layout/mindmap radialNodeExtent).
 */
function nodeBounds(n: MindmapNode, type: DiagramType, rootCenter: { x: number; y: number } | null): { left: number; right: number; top: number; bottom: number } {
  if (type === 'mindmap' && rootCenter) return radialNodeExtent(n, rootCenter.x, rootCenter.y)
  return { left: n.x, right: n.x + n.width, top: n.y, bottom: n.y + n.height }
}

// ── Entry point ──────────────────────────────────────────────────────────────

export function renderMindmapSvg(row: MindmapRow): string {
  const type: DiagramType = VALID_TYPES.has(row.type) ? row.type as DiagramType : 'logic-chart'
  const lineStyle: LineStyle = VALID_LINE_STYLES.has(row.line_style ?? '') ? row.line_style as LineStyle : 'curved'
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
  const { descendantCounts } = computeSubtreeCounts(nodes)

  // Draw order: edges under nodes (DiagramCanvas)
  const edges = renderEdges(nodes, type, lineStyle, pc)
  const rootNode = nodes.find(n => n.parentId === null)
  const rootCenter = rootNode ? { x: rootNode.x + rootNode.width / 2, y: rootNode.y + rootNode.height / 2 } : null
  const nodeMarkup = nodes.map(n =>
    renderNode(n, type, paletteColors.get(n.id) ?? null, descendantCounts.get(n.id) ?? 0, rootCenter)).join('')
  // One blur filter for every glow in the map: the radial mind map's soft coloured
  // halo. Defined once so a 200-node map carries one filter, not 200.
  const defs = type === 'mindmap'
    ? '<defs><filter id="mm-glow" x="-70%" y="-70%" width="240%" height="240%"><feGaussianBlur stdDeviation="6"/></filter></defs>'
    : ''

  // viewBox from laid-out bounds (+ slack for spines that extend past the nodes)
  const pad = 60
  const box = nodes.map(n => nodeBounds(n, type, rootCenter))
  const minX = Math.min(...box.map(b => b.left)) - pad
  const minY = Math.min(...box.map(b => b.top)) - pad
  const maxX = Math.max(...box.map(b => b.right)) + pad + (type === 'fishbone' || type === 'timeline' ? 120 : 0)
  const maxY = Math.max(...box.map(b => b.bottom)) + pad
  const w = Math.max(1, Math.ceil(maxX - minX))
  const hgt = Math.max(1, Math.ceil(maxY - minY))

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${r2(minX)} ${r2(minY)} ${w} ${hgt}" width="${w}" height="${hgt}" font-family="${FONT}">` +
    `<title>${esc(row.name)}</title>` +
    defs +
    `<rect x="${r2(minX)}" y="${r2(minY)}" width="${w}" height="${hgt}" fill="${theme.canvasBg}"/>` +
    `<g>${edges}</g><g>${nodeMarkup}</g></svg>`
}
