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
import { computeMindmapLayout } from './layout/mindmap.js'
import { computeGraphLayout, wrapText, initialFontSize, nodeInitial, radialLabelFor, radialNodeExtent, LABEL_FONT, RADIAL_ROOT_FONT } from './layout/graph.js'
import { computeFishboneLayout, FISHBONE_SLANT, fishboneSlant } from './layout/fishbone.js'
import { computeTimelineLayout, TIMELINE_ELBOW_R } from './layout/timeline.js'
import { computeHoneycombLayout } from './layout/honeycomb.js'
import { getTheme } from './themes.js'
import { LABEL_TEXT, timelineSubFill, timelineSubText,
  hexToRgb, darken, depthFill, applyDepthTransparency, edgeWidthForDepth,
  radialEdgeWidth, RADIAL_EDGE_OPACITY, isDarkBg, lighten, neonFilterId, neonFilterSpecs,
  neonRootColor, NEON_CORE_OPACITY, NEON_EDGE_CORE_OPACITY, NEON_EDGE_FILTER,
  NEON_EDGE_GLOW_BLUR, NEON_EDGE_GLOW_OPACITY, NEON_EDGE_GLOW_WIDTH, NEON_EDGE_LIGHTEN,
  NEON_HALO_OPACITY, NEON_ROOT_GRADIENT, NEON_ROOT_LIGHTEN, NEON_TEXT, NEON_TEXT_BLUR,
  NEON_TEXT_FILTER, NEON_TEXT_MUTED, NEON_TEXT_MUTED_OPACITY,
} from './color.js'
import { computeBranchColors } from './branchColor.js'
import { rootPillWidth, rootPillFontSize, rootIsPill, ROOT_FONT } from './rootPill.js'
import { nodeMetrics, ICON_GAP } from './nodeMetrics.js'
import { normalizeWidthsPerDepth } from './widthNormalize.js'
import { shapeRx } from './nodeShape.js'
import { parseLinkedTitle, sliceSegments, lineRanges, type LinkSegment } from './links.js'
import { nodeCenter, nodeCenterLeft, nodeCenterRight, buildStraightPath, buildCurvedPath, buildOrthogonalPath, buildRadialBranchPath } from './geometry.js'
import { computeSubtreeCounts } from './nodeCounts.js'
import { GLOSS_LINEAR_ID, GLOSS_RADIAL_ID, glossApplies, glossOpacity, glossDefsSvg } from './gloss.js'
import { hexCellLayout, hexPoints, hexFontSize, hexFill, hexTextColor, combSizeOf, combStyleOf, drawnCellRadius, hexDoorEdge, meshFillerCells, meshGroupOutlines, meshCellRadius, meshTopicLinks, meshWallColor, MESH_WALL_WIDTH } from './hex.js'
import type { CombSize, CombStyle } from './hex.js'

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
const VALID_TYPES = new Set<string>(['logic-chart', 'mindmap', 'graph', 'fishbone', 'timeline', 'honeycomb'])
const VALID_LINE_STYLES = new Set<string>(['straight', 'curved', 'orthogonal'])

const esc = (s: unknown): string => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const r2 = (v: number): number => Math.round(v * 100) / 100

// ── Ported helpers (Node.tsx / mindmapStore.ts - not exported there) ─────────

/** True if the color is light enough that dark text is readable (Node.tsx isLight). */
function isLight(hex: string): boolean {
  if (!hex.startsWith('#')) return true
  const [r, g, b] = hexToRgb(hex)
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 130
}

/** Layout dispatch (mindmapStore runLayout). */
function runLayout(nodes: MindmapNode[], type: DiagramType): MindmapNode[] {
  switch (type) {
    case 'mindmap':   return computeMindmapLayout(nodes)
    case 'graph':   return computeGraphLayout(nodes)
    case 'fishbone':  return computeFishboneLayout(nodes)
    case 'timeline':  return computeTimelineLayout(nodes)
    case 'honeycomb': return computeHoneycombLayout(nodes)
    default:          return computeMindmapsLayout(nodes)
  }
}

/** Load pipeline (mindmapStore setActiveMindmap): reset sizes -> layout -> normalize -> layout. */
function layoutForRender(raw: MindmapNode[], type: DiagramType): MindmapNode[] {
  const fresh = raw.map(n => {
    if (n.depth !== 0) {
      return n.widthMode === 'manual'
        ? { ...n, height: 0, manuallyPositioned: false }
        : { ...n, width: 0, height: 0, manuallyPositioned: false }
    }
    if (rootIsPill(n, type)) return { ...n, width: rootPillWidth(n.title, n.fontSize ?? ROOT_FONT), height: nodeMetrics(0).height, manuallyPositioned: false }
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

/** Curved bezier parent side-edge -> child facing edge (EdgeLayer CurvedEdge). */
function curvedEdge(parent: MindmapNode, child: MindmapNode, color: string, goRight = true): string {
  const x1 = goRight ? parent.x + parent.width : parent.x
  const y1 = parent.y + parent.height / 2
  const x2 = goRight ? child.x : child.x + child.width
  const y2 = child.y + child.height / 2
  const cx = (x1 + x2) / 2
  return `<path d="M ${r2(x1)} ${r2(y1)} C ${r2(cx)} ${r2(y1)} ${r2(cx)} ${r2(y2)} ${r2(x2)} ${r2(y2)}" stroke="${esc(color)}" stroke-width="${edgeWidthForDepth(child.depth)}" fill="none" stroke-linecap="round"/>`
}

/** Fan of beziers from a parent to its children (EdgeLayer BracketConnector). */
function bracketConnector(parent: MindmapNode, children: MindmapNode[], pc: (n: MindmapNode) => string, goRight = true): string {
  if (children.length === 0) return ''
  const sorted = [...children].sort((a, b) => a.y - b.y)
  if (children.length === 1) return curvedEdge(parent, sorted[0], pc(sorted[0]), goRight)
  const px = goRight ? parent.x + parent.width : parent.x
  const py = parent.y + parent.height / 2
  return sorted.map(child => {
    const cy = child.y + child.height / 2
    const cx2 = goRight ? child.x : child.x + child.width
    const gap = Math.abs(cx2 - px)
    const c1x = goRight ? px + gap * 0.5 : px - gap * 0.5
    return `<path d="M ${r2(px)} ${r2(py)} C ${r2(c1x)} ${r2(py)}, ${r2(c1x)} ${r2(cy)}, ${r2(cx2)} ${r2(cy)}" stroke="${esc(pc(child))}" stroke-width="${edgeWidthForDepth(child.depth)}" fill="none" stroke-linecap="round"/>`
  }).join('')
}

/** Deeper logic-chart edge path (Edge.tsx, side-aware). */
function deepEdge(parent: MindmapNode, child: MindmapNode, lineStyle: LineStyle, colorOf: (n: MindmapNode) => string): string {
  const pc = nodeCenter(parent)
  const cc = nodeCenter(child)
  const src = cc.x > pc.x ? nodeCenterRight(parent) : nodeCenterLeft(parent)
  const tgt = cc.x > pc.x ? nodeCenterLeft(child) : nodeCenterRight(child)
  const d = lineStyle === 'straight' ? buildStraightPath(src, tgt)
    : lineStyle === 'orthogonal' ? buildOrthogonalPath(src, tgt)
    : buildCurvedPath(src, tgt)
  return `<path d="${d}" stroke="${esc(edgeStroke(colorOf(child), child.depth))}" stroke-width="${edgeWidthForDepth(child.depth)}" fill="none" stroke-linecap="round"/>`
}

function renderEdges(nodes: MindmapNode[], type: DiagramType, lineStyle: LineStyle, pc: (n: MindmapNode) => string, neon = false): string {
  const nodeMap = new Map(nodes.map(n => [n.id, n]))

  // Honeycomb: a straight centre-to-centre line per parent/child pair, in the branch
  // colour, no order badges - identical to the canvas (EdgeLayer.tsx).
  if (type === 'honeycomb') {
    // In a mesh the root and every topic already touch, and so does everything inside
    // an island - the only link the empty comb broke is topic to its own cluster.
    if (combStyleOf(nodes) === 'mesh') {
      return meshTopicLinks(nodes).map(({ from, points }) =>
        `<polyline class="mesh-link" points="${points.map(p => `${r2(p.x)},${r2(p.y)}`).join(' ')}" fill="none" stroke="${esc(pc(from))}" stroke-width="${MESH_WALL_WIDTH}" stroke-linecap="round" stroke-linejoin="round" opacity="0.9"/>`
      ).join('')
    }
    const edges = nodes.filter(n => n.parentId && nodeMap.has(n.parentId))
    return edges.map(n => {
      const parent = nodeMap.get(n.parentId!)!
      const x1 = parent.x + parent.width / 2, y1 = parent.y + parent.height / 2
      const x2 = n.x + n.width / 2, y2 = n.y + n.height / 2
      const strokeWidth = n.depth === 1 ? 6 : n.depth === 2 ? 4 : 3
      return `<line x1="${r2(x1)}" y1="${r2(y1)}" x2="${r2(x2)}" y2="${r2(y2)}" stroke="${esc(pc(n))}" stroke-width="${strokeWidth}" stroke-linecap="round" opacity="0.9"/>`
    }).join('')
  }

  // Radial constellation: thin, same-handed curves from circle edge to circle edge,
  // identical to the canvas (EdgeLayer.tsx) so a card preview matches the opened map.
  // On a dark canvas each branch is drawn twice - a blurred glow line under a crisp
  // lightened core - so it reads as a luminous tube, exactly as the canvas draws it.
  if (type === 'graph') {
    const branches = nodes.filter(n => n.parentId && nodeMap.has(n.parentId))
      .map(n => ({ n, d: buildRadialBranchPath(nodeMap.get(n.parentId!)!, n) }))
    const core = branches.map(({ n, d }) => {
      const stroke = neon && pc(n).startsWith('#') ? lighten(pc(n), NEON_EDGE_LIGHTEN) : pc(n)
      const op = neon ? NEON_EDGE_CORE_OPACITY : RADIAL_EDGE_OPACITY
      return `<path d="${d}" stroke="${esc(stroke)}" stroke-opacity="${op}" stroke-width="${radialEdgeWidth(n.depth)}" fill="none" stroke-linecap="round"/>`
    }).join('')
    if (!neon) return core
    // One blur pass for every glow line in the map, not one filter per branch.
    const glow = branches.map(({ n, d }) =>
      `<path d="${d}" stroke="${esc(pc(n))}" stroke-width="${NEON_EDGE_GLOW_WIDTH}" fill="none" stroke-linecap="round"/>`).join('')
    return `<g filter="url(#${NEON_EDGE_FILTER})" opacity="${NEON_EDGE_GLOW_OPACITY}">${glow}</g>${core}`
  }

  // Mind Map: the balanced tree. The same fan of curves the brace style draws, run
  // once per side, so a topic sitting left of its parent leaves the parent's LEFT
  // face instead of reaching around it (src/lib/layout/mindmap).
  if (type === 'mindmap') {
    return nodes.filter(n => nodes.some(c => c.parentId === n.id)).map(parent => {
      const kids = nodes.filter(n => n.parentId === parent.id)
      const cx = parent.x + parent.width / 2
      return bracketConnector(parent, kids.filter(k => k.x + k.width / 2 >= cx), pc, true)
        + bracketConnector(parent, kids.filter(k => k.x + k.width / 2 < cx), pc, false)
    }).join('')
  }

  if (type === 'fishbone') {
    // Must match EdgeLayer's fishbone branch exactly: a grey spine out of the root, a
    // coloured diagonal bone from the spine up (or down) to each topic, L2 stubs off
    // that diagonal and plain horizontals below. This block used to be a copy of the
    // timeline renderer, which draws the spine in segments BETWEEN the topic boxes - on
    // a fishbone the topics sit far off the spine, so it drew stubs and no bone at all
    // and every branch floated disconnected on the share image and the home card.
    const root = nodes.find(n => n.parentId === null)
    if (!root) return ''
    const spineY = root.y + root.height / 2
    const l1s = nodes.filter(n => n.depth === 1)
    /** Where a topic's bone leaves the spine, and where it lands on the topic box. */
    const bone = (l1: MindmapNode) => {
      const cx = l1.x + l1.width / 2
      const above = l1.y + l1.height / 2 < spineY
      const edgeY = above ? l1.y + l1.height : l1.y
      // Every bone leaves the spine at the same angle, so its run follows its own drop.
      const run = fishboneSlant(Math.abs(edgeY - spineY))
      return { cx, attachX: cx - run, above, edgeY, run }
    }

    const spineEndX = l1s.length > 0
      ? Math.max(...l1s.map(n => n.x + n.width / 2 - bone(n).run)) + FISHBONE_SLANT * 1.3
      : root.x + root.width + 400
    const parts: string[] = [
      `<line x1="${r2(root.x + root.width)}" y1="${r2(spineY)}" x2="${r2(spineEndX)}" y2="${r2(spineY)}" stroke="#64748b" stroke-width="3" stroke-linecap="round"/>`,
    ]

    for (const l1 of l1s) {
      const { cx, attachX, edgeY } = bone(l1)
      parts.push(`<line x1="${r2(attachX)}" y1="${r2(spineY)}" x2="${r2(cx)}" y2="${r2(edgeY)}" stroke="${esc(pc(l1))}" stroke-width="${edgeWidthForDepth(1)}" stroke-linecap="round"/>`)
    }

    // L2 sits beside the bone, so its stub starts where the bone crosses its own row.
    for (const l2 of nodes.filter(n => n.depth === 2)) {
      const l1 = nodeMap.get(l2.parentId ?? '')
      if (!l1) continue
      const { attachX, edgeY, run } = bone(l1)
      const cy = l2.y + l2.height / 2
      const t = Math.abs(cy - spineY) / Math.abs(edgeY - spineY)
      const diagX = attachX + run * t
      // The node is drawn as a parallelogram, so meet its skewed edge, not its box.
      parts.push(`<line x1="${r2(diagX)}" y1="${r2(cy)}" x2="${r2(l2.x + l2.height * 0.35 / 2)}" y2="${r2(cy)}" stroke="${esc(pc(l2))}" stroke-width="${edgeWidthForDepth(2)}" stroke-linecap="round"/>`)
    }

    for (const n of nodes.filter(k => k.depth >= 3)) {
      const parent = nodeMap.get(n.parentId ?? '')
      if (!parent) continue
      parts.push(`<line x1="${r2(parent.x + parent.width)}" y1="${r2(parent.y + parent.height / 2)}" x2="${r2(n.x)}" y2="${r2(n.y + n.height / 2)}" stroke="${esc(pc(n))}" stroke-width="${edgeWidthForDepth(n.depth)}" stroke-linecap="round"/>`)
    }
    return parts.join('')
  }

  if (type === 'timeline') {
    // This block was sitting under the 'fishbone' label, so a timeline map had no branch
    // of its own and fell through to the logic-chart edges on every share image and home
    // card. It mirrors EdgeLayer's timeline branch: the spine painted in coloured
    // segments between the boxes, a trunk down the middle of each topic, elbows into the
    // children.
    const root = nodes.find(n => n.parentId === null)
    if (!root) return ''
    const spineY = root.y + root.height / 2
    const l1s = nodes.filter(n => n.depth === 1).sort((a, b) => a.x - b.x)
    const spineEndX = l1s.length > 0
      ? l1s[l1s.length - 1].x + l1s[l1s.length - 1].width + 24
      : root.x + root.width + 400
    const parts: string[] = []
    const w1 = edgeWidthForDepth(1)
    const w2 = edgeWidthForDepth(2)
    let cursorX = root.x + root.width
    for (const l1 of l1s) {
      parts.push(`<line x1="${r2(cursorX)}" y1="${r2(spineY)}" x2="${r2(l1.x)}" y2="${r2(spineY)}" stroke="${esc(pc(l1))}" stroke-width="${w1}" stroke-linecap="round"/>`)
      cursorX = l1.x + l1.width
    }
    const tailColor = l1s.length > 0 ? pc(l1s[l1s.length - 1]) : '#94a3b8'
    parts.push(`<line x1="${r2(cursorX)}" y1="${r2(spineY)}" x2="${r2(spineEndX)}" y2="${r2(spineY)}" stroke="${esc(tailColor)}" stroke-width="${w1}" stroke-linecap="round"/>`)

    for (const l1 of l1s) {
      const branchX = l1.x + l1.width / 2
      const descendants = nodes.filter(n => {
        let cur = nodeMap.get(n.parentId ?? '')
        while (cur) {
          if (cur.id === l1.id) return true
          cur = nodeMap.get(cur.parentId ?? '')
        }
        return false
      })
      const onTrunk = descendants.filter(n => n.parentId === l1.id)
      if (onTrunk.length === 0) continue
      const centres = onTrunk.map(n => n.y + n.height / 2)
      const above = centres[0] < spineY
      const dir = above ? -1 : 1
      const nearEdgeY = above ? l1.y : l1.y + l1.height
      const farCY = above ? Math.min(...centres) : Math.max(...centres)
      const col = esc(pc(l1))
      parts.push(`<line x1="${r2(branchX)}" y1="${r2(nearEdgeY)}" x2="${r2(branchX)}" y2="${r2(farCY - dir * TIMELINE_ELBOW_R)}" stroke="${col}" stroke-width="${w2}" stroke-linecap="round"/>`)
      for (const n of onTrunk) {
        const cy = n.y + n.height / 2
        parts.push(`<path d="M ${r2(branchX)} ${r2(cy - dir * TIMELINE_ELBOW_R)} Q ${r2(branchX)} ${r2(cy)} ${r2(branchX + TIMELINE_ELBOW_R)} ${r2(cy)} L ${r2(n.x)} ${r2(cy)}" fill="none" stroke="${col}" stroke-width="${w2}" stroke-linecap="round"/>`)
      }
      for (const n of descendants.filter(d => d.parentId !== l1.id)) {
        const parent = nodeMap.get(n.parentId!)
        if (!parent) continue
        parts.push(`<line x1="${r2(parent.x + parent.width)}" y1="${r2(parent.y + parent.height / 2)}" x2="${r2(n.x)}" y2="${r2(n.y + n.height / 2)}" stroke="${col}" stroke-width="${edgeWidthForDepth(n.depth)}" stroke-linecap="round"/>`)
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
      .map(parent => bracketConnector(parent, nodes.filter(n => n.parentId === parent.id), pc))
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
    // Same flush joinery as the canvas (EdgeLayer.tsx): one width, butt ends, the bar
    // overruns the first and last stub by half a width in that stub's colour.
    const w = edgeWidthForDepth(1)
    const half = w / 2
    const seg = (x1: number, y1: number, x2: number, y2: number, stroke: string) =>
      `<line x1="${r2(x1)}" y1="${r2(y1)}" x2="${r2(x2)}" y2="${r2(y2)}" stroke="${esc(stroke)}" stroke-width="${w}" stroke-linecap="butt"/>`
    parts.push(seg(rootRightX, l1MidY, barX - half, l1MidY, '#1a1d2e'))
    if (sortedL1.length > 1) {
      const firstL1 = sortedL1[0], lastL1 = sortedL1[sortedL1.length - 1]
      parts.push(seg(barX, firstL1.y + firstL1.height / 2 - half, barX, firstL1.y + firstL1.height / 2 + 0.5, pc(firstL1)))
      sortedL1.forEach((l1, i) => {
        if (i === sortedL1.length - 1) return
        const nextL1 = sortedL1[i + 1]
        parts.push(seg(barX, l1.y + l1.height / 2, barX, nextL1.y + nextL1.height / 2 + 0.5, pc(l1)))
      })
      parts.push(seg(barX, lastL1.y + lastL1.height / 2, barX, lastL1.y + lastL1.height / 2 + half, pc(lastL1)))
    }
    for (const l1 of l1Nodes) {
      const stubY = l1.y + l1.height / 2
      parts.push(seg(sortedL1.length > 1 ? barX + half - 0.5 : barX - half, stubY, l1.x, stubY, pc(l1)))
    }
  }
  for (const n of nodes) {
    if (!n.parentId || n.parentId === root.id) continue
    const parent = nodeMap.get(n.parentId)
    if (parent) parts.push(deepEdge(parent, n, lineStyle, pc))
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

function renderNode(node: MindmapNode, type: DiagramType, paletteColor: string | null, descendants = 0, rootCenter: { x: number; y: number } | null = null, neon = false, gloss = false, combSize: CombSize = 'outward', hex: { style: CombStyle; radius: number } | null = null): string {
  const isRoot = node.depth === 0
  const isL2Plus = node.depth >= 2
  const isFishboneNode = type === 'fishbone' && node.depth >= 1
  // Radial constellation node, mirroring Node.tsx: a circle sized by its own subtree,
  // with the label drawn outside it. An explicit per-node shape opts out.
  const isRadial = type === 'graph' && !isRoot && !node.shape
  const isRadialDot = isRadial && node.depth >= 3
  // Honeycomb: every node (root included) is a pointy-top hexagon, node.shape ignored.
  const isHex = type === 'honeycomb'
  const col = (isRoot ? null : paletteColor) ?? node.color
  const rx = isRoot ? 4 : 3
  // An explicit per-node shape overrides the diagram's own default geometry, exactly
  // as it does on the canvas (Node.tsx), so a card preview matches the opened map.
  const nodeShape = isRoot ? undefined : node.shape
  const drawCircle = !isHex && nodeShape === 'circle'
  const effectiveRx = isRoot ? rx
    : nodeShape ? shapeRx(nodeShape, node.height, rx)
    : isFishboneNode ? 0
    : type === 'timeline' ? 6 : rx

  const isRootPill = isRoot && rootIsPill(node, type)

  // Styling per depth (Node.tsx)
  let bg: string, textColor: string, strokeColor: string, strokeW: number
  if (isHex) {
    // Same shared depth ladder as the canvas (src/lib/hex), for every depth
    // including the root.
    bg = hexFill(col, node.depth)
    textColor = hexTextColor(node.depth)
    const isMesh = hex?.style === 'mesh'
    strokeColor = isMesh ? meshWallColor(col, node.depth) : isRoot ? '#1a1d2e' : darken(col, 0.25)
    strokeW = isMesh ? 3 : isRoot ? 4 : 2
  } else if (isRoot) {
    bg = '#1a1d2e'; textColor = '#ffffff'; strokeColor = '#1a1d2e'; strokeW = 5
  } else if (isL2Plus) {
    // Same shared depth ladder as the canvas (src/lib/color depthFill), and the
    // same timeline exception: pale chips so the spine's L1 boxes read first.
    const timelineSub = type === 'timeline' && col.startsWith('#')
    bg = col.startsWith('#')
      ? (timelineSub ? timelineSubFill(col) : depthFill(col, node.depth))
      : '#f8fafc'
    textColor = timelineSub ? timelineSubText(col) : LABEL_TEXT
    // Same as the canvas: every box below the root carries its branch colour in the
    // border, the timeline's pale chips included.
    strokeColor = col
    strokeW = isRadialDot ? 1 : 2
  } else {
    bg = col
    textColor = LABEL_TEXT
    strokeColor = col.startsWith('#') ? darken(col, 0.25) : col
    strokeW = 2
  }
  // Neon (dark canvas): white glyphs inside every orb, and a root orb painted with a
  // radial gradient of its own colour lightened at the centre. Paint only - the
  // geometry above is untouched, exactly as on the canvas (Node.tsx).
  const rootNeon = neon && isRoot && type === 'graph' ? neonRootColor(node.color) : null
  if (neon && (isRadial || rootNeon)) textColor = NEON_TEXT
  if (rootNeon) strokeColor = lighten(rootNeon, 0.4)
  if (node.borderColor) { strokeColor = node.borderColor; strokeW = Math.max(strokeW, node.borderWidth ?? 1.5) }

  // Gloss is opt-in per map (root node flag). When on, root, L1 and L2 boxes carry a
  // soft top-of-box gloss; L3+ are already pale, so it would be lost. Dark-background
  // boxes get the stronger gradient stops, light
  // ones the softer scaled-down version (mirrors Node.tsx).
  const showGloss = gloss && glossApplies(node.depth)
  const glossFillOpacity = glossOpacity(isLight(bg))

  // Same shared box table the canvas reads (src/lib/nodeMetrics), so a card preview
  // and the opened map can never draw a label at a different size.
  const metric = nodeMetrics(node.depth)
  // Coerced: fontSize is typed number but arrives as unvalidated stored JSON, and it
  // lands in an SVG attribute that the home grid injects with dangerouslySetInnerHTML.
  const baseFontSize = Number(node.fontSize)
    || (isRoot && type === 'graph' ? RADIAL_ROOT_FONT : metric.fontSize)
  const fontSize = isRootPill ? rootPillFontSize(node.title, baseFontSize) : baseFontSize
  const fontWeight = node.bold ? '700' : (isRoot ? '500' : node.depth === 1 ? '500' : '400')

  const hasEmoji = (!isRoot || isHex) && !!node.emoji
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
  if (isHex) {
    const hexR = hex?.radius ?? hexCellLayout(node, combSize).r
    const pts = hexPoints(cx, cy, hexR)
    parts.push(`<polygon points="${pts}" fill="${esc(bg)}" stroke="${esc(strokeColor)}" stroke-width="${strokeW}" stroke-linejoin="round"/>`)
  } else if (isRoot) {
    if (isRootPill) {
      parts.push(`<rect x="0" y="0" width="${r2(displayW)}" height="${r2(h)}" rx="${r2(h / 2)}" ry="${r2(h / 2)}" fill="${esc(bg)}" stroke="${esc(strokeColor)}" stroke-width="${strokeW}"/>`)
    } else {
      if (type === 'graph' && !rootNeon) {
        parts.push(`<circle cx="${r2(cx)}" cy="${r2(cy)}" r="${r2(displayW / 2 * 1.08)}" fill="${esc(bg)}" opacity="0.22" filter="url(#mm-glow)"/>`)
      }
      if (rootNeon) {
        parts.push(`<circle cx="${r2(cx)}" cy="${r2(cy)}" r="${r2(displayW / 2)}" fill="${esc(rootNeon)}" filter="url(#${neonFilterId(displayW)})"/>`)
      }
      const rootFill = rootNeon ? `url(#${NEON_ROOT_GRADIENT})` : esc(bg)
      parts.push(`<circle cx="${r2(cx)}" cy="${r2(cy)}" r="${r2(displayW / 2)}" fill="${rootFill}" stroke="${esc(strokeColor)}" stroke-width="${strokeW}"/>`)
    }
    if (showGloss) {
      if (isRootPill) {
        parts.push(`<rect x="0" y="0" width="${r2(displayW)}" height="${r2(h)}" rx="${r2(h / 2)}" ry="${r2(h / 2)}" fill="url(#${GLOSS_LINEAR_ID})" fill-opacity="${glossFillOpacity}"/>`)
      } else {
        parts.push(`<circle cx="${r2(cx)}" cy="${r2(cy)}" r="${r2(displayW / 2)}" fill="url(#${GLOSS_RADIAL_ID})" fill-opacity="${glossFillOpacity}"/>`)
      }
    }
  } else if (isRadial) {
    const cr = displayW / 2
    if (neon) {
      parts.push(`<circle cx="${r2(cx)}" cy="${r2(cy)}" r="${r2(cr)}" fill="${esc(col)}" filter="url(#${neonFilterId(displayW)})"/>`)
    } else if (node.depth <= 2) {
      parts.push(`<circle cx="${r2(cx)}" cy="${r2(cy)}" r="${r2(cr * 1.1)}" fill="${esc(col)}" opacity="0.3" filter="url(#mm-glow)"/>`)
    }
    parts.push(`<circle cx="${r2(cx)}" cy="${r2(cy)}" r="${r2(cr)}" fill="${esc(bg)}"/>`)
    parts.push(`<circle cx="${r2(cx)}" cy="${r2(cy)}" r="${r2(cr)}" fill="none" stroke="${esc(strokeColor)}" stroke-width="${strokeW}"/>`)
    if (showGloss) {
      parts.push(`<circle cx="${r2(cx)}" cy="${r2(cy)}" r="${r2(cr)}" fill="url(#${GLOSS_RADIAL_ID})" fill-opacity="${glossFillOpacity}"/>`)
    }
  } else if (drawCircle) {
    const cr = displayW / 2
    parts.push(`<circle cx="${r2(cx)}" cy="${r2(cy)}" r="${r2(cr)}" fill="${esc(bg)}"/>`)
    parts.push(`<circle cx="${r2(cx)}" cy="${r2(cy)}" r="${r2(cr)}" fill="none" stroke="${esc(strokeColor)}" stroke-width="${strokeW}"/>`)
    if (showGloss) {
      parts.push(`<circle cx="${r2(cx)}" cy="${r2(cy)}" r="${r2(cr)}" fill="url(#${GLOSS_RADIAL_ID})" fill-opacity="${glossFillOpacity}"/>`)
    }
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
    // Parallelogram has no rx, so the gloss overlay clips to the polygon instead.
    if (showGloss) {
      const clipId = `gloss-fb-${esc(node.id)}`
      parts.push(`<defs><clipPath id="${clipId}"><polygon points="${pts}"/></clipPath></defs>`)
      parts.push(`<rect x="0" y="0" width="${r2(displayW)}" height="${r2(h)}" clip-path="url(#${clipId})" fill="url(#${GLOSS_LINEAR_ID})" fill-opacity="${glossFillOpacity}"/>`)
    }
  } else {
    parts.push(`<rect x="0" y="0" width="${r2(displayW)}" height="${r2(h)}" rx="${effectiveRx}" ry="${effectiveRx}" fill="${esc(bg)}"/>`)
    if (showGloss) {
      parts.push(`<rect x="0" y="0" width="${r2(displayW)}" height="${r2(h)}" rx="${effectiveRx}" ry="${effectiveRx}" fill="url(#${GLOSS_LINEAR_ID})" fill-opacity="${glossFillOpacity}"/>`)
    }
    if (hasEmoji || hasIcon) {
      parts.push(`<rect x="0" y="0" width="${r2(h + 1)}" height="${r2(h)}" fill="#ffffff"/>`)
    }
    parts.push(`<rect x="0" y="0" width="${r2(displayW)}" height="${r2(h)}" rx="${effectiveRx}" ry="${effectiveRx}" fill="none" stroke="${esc(strokeColor)}" stroke-width="${strokeW * 2}"/>`)
  }

  // ── Label + badge ──
  const skOff = isFishboneNode ? (h * 0.35) / 2 : 0
  if (isHex) {
    // The label lives INSIDE the cell, same as the canvas (Node.tsx) - no external
    // label box, no markdown link anchors. The server always draws the subtree
    // count for depth 1 (it has no showChildCount toggle).
    parts.push(`<title>${esc(label)}</title>`)
    const cell = hexCellLayout(node, combSize)
    const iconSize = cell.glyph
    const iconCY = cy + cell.glyphDy
    const titleFontSize = cell.font
    const titleLines = cell.lines
    const titleWeight = isRoot ? '700' : node.depth === 1 ? '600' : '500'
    const lineH = cell.lineH
    const firstLineY = cy + cell.firstLineDy
    if (hasEmoji) {
      parts.push(`<text x="${r2(cx)}" y="${r2(iconCY + iconSize * 0.36)}" text-anchor="middle" font-size="${r2(iconSize)}">${esc(node.emoji)}</text>`)
    } else if (hasIcon) {
      // No icon library server-side: a neutral ring stands in for the lucide glyph.
      parts.push(`<circle cx="${r2(cx)}" cy="${r2(iconCY)}" r="${r2(iconSize / 2.4)}" fill="none" stroke="${esc(textColor)}" stroke-width="2"/>`)
    }
    const titleTspans = titleLines.map((line, i) =>
      `<tspan x="${r2(cx)}" y="${r2(firstLineY + i * lineH)}">${esc(line)}</tspan>`).join('')
    parts.push(`<text text-anchor="middle" font-size="${titleFontSize}" font-weight="${titleWeight}" fill="${esc(textColor)}">${titleTspans}</text>`)
    if (node.depth === 1 && descendants > 0) {
      const countFontSize = hexFontSize(1, combSize) - 2
      const countY = cy + cell.countDy
      parts.push(`<text x="${r2(cx)}" y="${r2(countY)}" text-anchor="middle" font-size="${countFontSize}" font-weight="600" fill="${esc(textColor)}">${descendants}</text>`)
    }
  } else if (isRadial) {
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
        if (neon) {
          parts.push(`<text x="${r2(cx)}" y="${r2(cy + glyph * 0.36)}" text-anchor="middle" font-size="${glyph}" font-weight="600" fill="${NEON_TEXT}" filter="url(#${NEON_TEXT_FILTER})">${esc(nodeInitial(node.title))}</text>`)
        }
        parts.push(`<text x="${r2(cx)}" y="${r2(cy + glyph * 0.36)}" text-anchor="middle" font-size="${glyph}" font-weight="600" fill="${esc(textColor)}">${esc(nodeInitial(node.title))}</text>`)
      }
    }
    const lbl = radialLabelFor(node, rootCenter?.x ?? 0, rootCenter?.y ?? 0)
    if (lbl) {
      const body = lbl.text === label ? labelBody : esc(lbl.text)
      const size = node.depth === 1 ? LABEL_FONT.title1 : LABEL_FONT.title2
      const weight = node.depth === 1 ? '600' : '400'
      const fill = neon
        ? (node.depth === 1 ? NEON_TEXT : NEON_TEXT_MUTED)
        : (node.depth === 1 ? '#1a1d2e' : '#475569')
      const fillOp = neon && node.depth !== 1 ? ` fill-opacity="${NEON_TEXT_MUTED_OPACITY}"` : ''
      parts.push(`<text x="${r2(lbl.tx)}" y="${r2(lbl.ty)}" text-anchor="${lbl.anchor}" font-size="${size}" font-weight="${weight}" fill="${fill}"${fillOp}>${body}</text>`)
      if (lbl.countY !== null && descendants > 0) {
        const countFill = neon ? `${NEON_TEXT_MUTED}" fill-opacity="${NEON_TEXT_MUTED_OPACITY}` : esc(col)
        parts.push(`<text x="${r2(lbl.tx)}" y="${r2(lbl.countY)}" text-anchor="${lbl.anchor}" font-size="${LABEL_FONT.count1}" font-weight="600" fill="${countFill}">${descendants}</text>`)
      }
    }
  } else if (drawCircle || (isRoot && type === 'graph')) {
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
 * the space with (src/lib/layout/graph radialNodeExtent).
 */
function nodeBounds(n: MindmapNode, type: DiagramType, rootCenter: { x: number; y: number } | null): { left: number; right: number; top: number; bottom: number } {
  if (type === 'graph' && rootCenter) return radialNodeExtent(n, rootCenter.x, rootCenter.y)
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
  const paletteColors = computeBranchColors(nodes)
  const pc = (n: MindmapNode) => paletteColors.get(n.id) ?? n.color
  const { descendantCounts } = computeSubtreeCounts(nodes)

  // The radial mind map glows on a dark canvas, exactly as it does on the canvas
  // renderer, so a home card and a share image match the opened map.
  const neon = type === 'graph' && isDarkBg(theme.canvasBg)

  // Draw order: edges under nodes (DiagramCanvas)
  const edges = renderEdges(nodes, type, lineStyle, pc, neon)
  const rootNode = nodes.find(n => n.parentId === null)
  const rootCenter = rootNode ? { x: rootNode.x + rootNode.width / 2, y: rootNode.y + rootNode.height / 2 } : null
  const gloss = rootNode?.gloss === true
  const combSize = combSizeOf(nodes)
  const combStyle = combStyleOf(nodes)
  const parentsById = new Map(nodes.map(n => [n.id, n]))
  const nodeMarkup = nodes.map(n =>
    renderNode(n, type, paletteColors.get(n.id) ?? null, descendantCounts.get(n.id) ?? 0, rootCenter, neon, gloss, combSize,
      type === 'honeycomb' ? { style: combStyle, radius: drawnCellRadius(n, nodes, combStyle, combSize) } : null)).join('')
  // One ring of empty comb behind the cells, exactly as DiagramCanvas draws it.
  const fillerMarkup = type === 'honeycomb' && combStyle === 'mesh'
    ? (() => {
        const R = meshCellRadius(nodes, combSize)
        const dark = isDarkBg(theme.canvasBg)
        const fill = dark ? 'rgba(255,255,255,0.045)' : 'rgba(15,23,42,0.035)'
        return meshFillerCells(nodes, R, 2)
          .map(c => `<polygon class="mesh-filler" points="${hexPoints(c.x, c.y, R)}" fill="${fill}" stroke="${theme.canvasBg}" stroke-width="${MESH_WALL_WIDTH}" stroke-linejoin="round"/>`)
          .join('')
      })()
    : ''
  // Mesh doorways above every cell, exactly as DiagramCanvas layers them.
  const doorMarkup = type === 'honeycomb' && combStyle === 'mesh' ? nodes.map(n => {
    const p = n.parentId ? parentsById.get(n.parentId) : undefined
    if (!p) return ''
    const r = drawnCellRadius(n, nodes, combStyle, combSize)
    const door = hexDoorEdge(n.x + n.width / 2, n.y + n.height / 2, r, p.x + p.width / 2, p.y + p.height / 2)
    const base = pc(n)
    const doorColor = base.startsWith('#') ? darken(base, 0.35) : base
    return door ? `<polyline points="${door}" fill="none" stroke="${esc(doorColor)}" stroke-width="5" stroke-linecap="butt"/>` : ''
  }).join('') : ''
  // Mesh group outlines above the doors, deeper groups first so the topic line stays on top.
  const groupMarkup = type === 'honeycomb' && combStyle === 'mesh'
    ? meshGroupOutlines(nodes, meshCellRadius(nodes, combSize)).sort((a, b) => b.depth - a.depth).map(g => {
        const parent = parentsById.get(g.parentId)
        const base = parent ? pc(parent) : '#1a1d2e'
        const color = g.depth === 0 ? '#1a1d2e' : base.startsWith('#') ? darken(base, 0.45) : base
        return `<path d="${g.d}" fill="none" stroke="${esc(color)}" stroke-width="${g.depth <= 1 ? 7 : 3.5}" stroke-linecap="round" stroke-linejoin="round"/>`
      }).join('')
    : ''
  // One blur filter for every glow in the map: the radial mind map's soft coloured
  // halo. Defined once so a 200-node map carries one filter, not 200. On a dark
  // canvas that becomes one two-layer neon filter per distinct circle size, plus the
  // branch and text blurs and the root orb's gradient - filter primitives only, so
  // the resvg rasterizer behind the share image draws what the browser draws.
  const mmDefs = type !== 'graph' ? ''
    : !neon
      ? '<filter id="mm-glow" x="-70%" y="-70%" width="240%" height="240%"><feGaussianBlur stdDeviation="6"/></filter>'
      : neonFilterSpecs(nodes.map(n => Math.max(n.width, n.height))).map(f =>
            `<filter id="${f.id}" x="-75%" y="-75%" width="250%" height="250%" color-interpolation-filters="sRGB">`
            + `<feGaussianBlur in="SourceGraphic" stdDeviation="${f.halo}" result="wide"/>`
            + `<feComponentTransfer in="wide" result="halo"><feFuncA type="linear" slope="${NEON_HALO_OPACITY}"/></feComponentTransfer>`
            + `<feGaussianBlur in="SourceGraphic" stdDeviation="${r2(f.core)}" result="tight"/>`
            + `<feComponentTransfer in="tight" result="core"><feFuncA type="linear" slope="${NEON_CORE_OPACITY}"/></feComponentTransfer>`
            + '<feMerge><feMergeNode in="halo"/><feMergeNode in="core"/></feMerge></filter>').join('')
        + `<filter id="${NEON_EDGE_FILTER}" x="-5%" y="-5%" width="110%" height="110%" color-interpolation-filters="sRGB"><feGaussianBlur stdDeviation="${NEON_EDGE_GLOW_BLUR}"/></filter>`
        + `<filter id="${NEON_TEXT_FILTER}" x="-60%" y="-60%" width="220%" height="220%" color-interpolation-filters="sRGB"><feGaussianBlur stdDeviation="${NEON_TEXT_BLUR}"/></filter>`
        + (rootNode
            ? `<radialGradient id="${NEON_ROOT_GRADIENT}"><stop offset="0%" stop-color="${lighten(neonRootColor(rootNode.color), NEON_ROOT_LIGHTEN)}"/><stop offset="100%" stop-color="${neonRootColor(rootNode.color)}"/></radialGradient>`
            : '')
  // Gloss gradients live in the same <defs>, referenced by every root/L1/L2 box below.
  const defs = `<defs>${gloss ? glossDefsSvg() : ''}${mmDefs}</defs>`

  // viewBox from laid-out bounds (+ slack for spines that extend past the nodes)
  // The empty filler ring sits 1 cell outside the outermost node, so the viewport has
  // to grow by that much or the share image clips it.
  const pad = 60 + (fillerMarkup ? meshCellRadius(nodes, combSize) * 2 : 0)
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
    `<g>${fillerMarkup}</g><g>${edges}</g><g>${nodeMarkup}</g><g>${doorMarkup}</g><g>${groupMarkup}</g></svg>`
}
