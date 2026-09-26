import type { MindmapNode } from '../types/index.js'
import { hexToRgb, LABEL_TEXT } from './color.js'
import { wrapText } from './layout/mindmap.js'
import { estimateTextWidth } from './nodeMetrics.js'
import { displayTitle } from './links.js'

// Shared hexagon geometry for the Honeycomb diagram type. Cells are pointy-top
// hexagons (a vertex at top and bottom, flat sides left and right) so both the
// canvas (Node.tsx) and the server renderer (render-svg.ts) draw the same shape
// from the same numbers.

/** Circumradius of a cell by depth: a spider web, the root smallest and each ring outward bigger, since the outer cells carry the longest text. */
export type CombSize = 'outward' | 'inward'
const HEX_RADIUS_OUT: Readonly<Record<number, number>> = { 0: 62, 1: 72, 2: 84, 3: 96 }
const HEX_RADIUS_IN: Readonly<Record<number, number>> = { 0: 96, 1: 84, 2: 72, 3: 62 }
export const HEX_RADIUS = HEX_RADIUS_OUT

export type CombStyle = 'mesh' | 'web'

/** The map's honeycomb style, kept on the root node (Settings > Cells): a tiled mesh unless the map says web. */
export function combStyleOf(nodes: readonly MindmapNode[]): CombStyle {
  return nodes.find(n => n.parentId === null)?.combStyle ?? 'mesh'
}

/** Pointy-top lattice directions in axial (q, r) coordinates; each is a cell sharing a full edge. */
export const HEX_DIRS: readonly (readonly [number, number])[] = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]]

/** Centre of the lattice cell (q, r) for circumradius R; neighbours sit exactly sqrt(3) R apart, so their edges touch. */
export function axialToCenter(q: number, r: number, R: number): { x: number; y: number } {
  return { x: R * Math.sqrt(3) * (q + r / 2), y: R * 1.5 * r }
}

/** Lattice distance in cells between two axial coordinates. */
export function hexDistance(q1: number, r1: number, q2: number, r2: number): number {
  const dq = q1 - q2, dr = r1 - r2
  return (Math.abs(dq) + Math.abs(dr) + Math.abs(dq + dr)) / 2
}

/** The map's comb sizing, kept on the root node (Settings > Cells); outward unless the map says otherwise. */
export function combSizeOf(nodes: readonly MindmapNode[]): CombSize {
  return nodes.find(n => n.parentId === null)?.combSize ?? 'outward'
}

/** Circumradius of a hex cell at a given depth; depth 3 and deeper share the smallest ring. */
export function hexRadius(depth: number, size: CombSize = 'outward'): number {
  const table = size === 'inward' ? HEX_RADIUS_IN : HEX_RADIUS_OUT
  return table[depth] ?? table[3]
}

/** Pointy-top hexagon points around (cx, cy), as an SVG points string "x,y x,y ...". */
export function hexPoints(cx: number, cy: number, r: number): string {
  const pts: string[] = []
  for (let k = 0; k < 6; k++) {
    const angle = (-90 + 60 * k) * (Math.PI / 180)
    const x = Math.round((cx + r * Math.cos(angle)) * 100) / 100
    const y = Math.round((cy + r * Math.sin(angle)) * 100) / 100
    pts.push(`${x},${y}`)
  }
  return pts.join(' ')
}

/** Font size inside a cell by depth: 22 / 15 / 12 / 11. */
const HEX_FONT_OUT: Readonly<Record<number, number>> = { 0: 18, 1: 15, 2: 13, 3: 13 }
const HEX_FONT_IN: Readonly<Record<number, number>> = { 0: 19, 1: 15, 2: 13, 3: 12 }

/** Font size inside a cell by depth; depth 3 and deeper share the smallest size. */
export function hexFontSize(depth: number, size: CombSize = 'outward'): number {
  const table = size === 'inward' ? HEX_FONT_IN : HEX_FONT_OUT
  return table[depth] ?? table[3]
}

/** Comfortable characters per label line by depth; the cell then grows to fit the lines. */
const WRAP_CHARS: Readonly<Record<number, number>> = { 0: 16, 1: 18, 2: 20, 3: 22 }
export function hexLabelMaxChars(depth: number, _size: CombSize = 'outward'): number {
  return WRAP_CHARS[depth] ?? WRAP_CHARS[3]
}

/**
 * Strength of the branch colour per ring, so each layer reads lighter than the one
 * inside it: depth 1 solid, then 50 / 30 / 18 percent, and 12 percent past that.
 */
export const HEX_STRENGTH: Readonly<Record<number, number>> = { 1: 1, 2: 0.5, 3: 0.3, 4: 0.18 }
export const HEX_STRENGTH_FLOOR = 0.12
export function hexStrength(depth: number): number {
  return HEX_STRENGTH[depth] ?? HEX_STRENGTH_FLOOR
}

/** Cell fill: root dark navy, depth 1 the branch colour, deeper rings mixed toward white by hexStrength. */
export function hexFill(col: string, depth: number): string {
  if (depth <= 0) return '#1a1d2e'
  if (depth === 1 || !col.startsWith('#')) return col
  const mix = 1 - hexStrength(depth)
  const [r, g, b] = hexToRgb(col)
  const ch = (v: number) => Math.round(v + (255 - v) * mix).toString(16).padStart(2, '0')
  return `#${ch(r)}${ch(g)}${ch(b)}`
}

/** Most lines a cell carries before the title is cut; the cell grows to hold them all. */
const MAX_LINES: Readonly<Record<number, number>> = { 0: 3, 1: 4 }
function maxLinesFor(depth: number): number { return MAX_LINES[depth] ?? 5 }

/**
 * Title lines for a cell: wrapped at a comfortable width for the depth, and only cut
 * (with an ellipsis) past the line cap. The cell is sized from these lines, so text is
 * never clipped by the hexagon.
 */
export function hexLabelLines(label: string, depth: number, _size: CombSize = 'outward'): string[] {
  const maxChars = hexLabelMaxChars(depth)
  const maxLines = maxLinesFor(depth)
  const wrapped = wrapText(label, maxChars)
  const lines = wrapped.slice(0, maxLines)
  if (wrapped.length > maxLines) {
    const last = lines.length - 1
    lines[last] = (lines[last].length > 1 ? lines[last].slice(0, -1) : lines[last]) + '\u2026'
  }
  return lines
}

/** Everything a renderer needs to draw the inside of a cell, and the radius that holds it. */
export interface HexCell {
  r: number
  lines: string[]
  font: number
  lineH: number
  glyph: number        // emoji / icon size, 0 when the cell has none
  glyphDy: number      // glyph centre, relative to the cell centre
  firstLineDy: number  // first title baseline, relative to the cell centre
  countDy: number      // subtree count baseline, relative to the cell centre (depth 1)
}

/** True when the renderers draw an emoji or icon inside this cell. */
export function hexHasVisual(node: MindmapNode): boolean {
  return !!node.emoji || (node.depth > 0 && !!node.icon)
}

/**
 * Size a cell from its own text: wrap the title, measure the widest line with the
 * Inter glyph table, stack the glyph, the lines and (depth 1) the count, then solve
 * the smallest pointy-top hexagon whose inside holds that block with padding. The
 * depth ladder (hexRadius) is only a floor, so a short label still gets a proper cell
 * and a long one grows as far as it must - double or triple if it has to.
 */
export function hexCellLayout(node: MindmapNode, size: CombSize = 'outward'): HexCell {
  const depth = node.depth
  const font = hexFontSize(depth, size)
  const lines = hexLabelLines(displayTitle(node.title), depth, size)
  const lineH = font * 1.15
  const weightScale = depth === 0 ? 1.08 : depth === 1 ? 1.05 : 1.02
  const textW = Math.max(...lines.map(l => estimateTextWidth(l, font))) * weightScale
  const glyph = hexHasVisual(node) ? Math.round(font * 2.1) : 0
  const glyphGap = glyph ? font * 0.45 : 0
  const countH = depth === 1 ? font * 1.3 : 0
  const blockH = glyph + glyphGap + lines.length * lineH + countH
  const pad = Math.max(8, font * 0.6)
  const hw = textW / 2 + pad
  const hh = blockH / 2 + pad
  // Pointy-top hexagon: the inside is 0.866 r wide up to |y| = r / 2, then narrows
  // linearly to a point at |y| = r. Both bounds together always hold the block.
  const needed = Math.max(hw / 0.866, hh + hw / 1.732, hh * 1.15)
  const r = Math.ceil(Math.max(hexRadius(depth, size), needed))
  const top = -blockH / 2
  const glyphDy = top + glyph / 2
  const firstLineDy = top + glyph + glyphGap + font * 0.85
  const countDy = firstLineDy + (lines.length - 1) * lineH + font * 1.3
  return { r, lines, font, lineH, glyph, glyphDy, firstLineDy, countDy }
}

/** Cell radius alone, for the layout. */
export function hexCellRadius(node: MindmapNode, size: CombSize = 'outward'): number {
  return hexCellLayout(node, size).r
}

/**
 * The 1 radius every cell of a mesh shares: a honeycomb only tiles when its cells are
 * equal, so the mesh takes the largest text-fit radius in the map and every label fits.
 */
export function meshCellRadius(nodes: readonly MindmapNode[], size: CombSize = 'outward'): number {
  let r = hexRadius(1, size)
  for (const n of nodes) r = Math.max(r, hexCellRadius(n, size))
  return r
}

/** The radius a renderer draws a given node with: shared in a mesh, its own in a web. */
export function drawnCellRadius(node: MindmapNode, nodes: readonly MindmapNode[], style: CombStyle, size: CombSize): number {
  return style === 'mesh' ? meshCellRadius(nodes, size) : hexCellRadius(node, size)
}

/** Label colour: white for root and depth 1, black for depth 2+. */
export function hexTextColor(depth: number): string {
  return depth <= 1 ? '#ffffff' : LABEL_TEXT
}

/**
 * The edge of a pointy-top cell that faces a neighbouring cell at (tx, ty): the 2
 * vertices of the wall they share, as an SVG points string. Null unless the neighbour
 * actually touches (centres about sqrt(3) R apart), so a doorway is only ever painted
 * on a real shared wall.
 */
export function hexDoorEdge(cx: number, cy: number, r: number, tx: number, ty: number): string | null {
  const d = Math.hypot(tx - cx, ty - cy)
  if (Math.abs(d - Math.sqrt(3) * r) > r * 0.15) return null
  const toward = Math.atan2(ty - cy, tx - cx)
  // Edge k runs from vertex k to k + 1; vertices sit at -90 + 60k degrees, so the
  // edge's outward normal is at -60 + 60k.
  let best = 0, bestDiff = Infinity
  for (let k = 0; k < 6; k++) {
    const normal = (-60 + 60 * k) * Math.PI / 180
    const diff = Math.abs(Math.atan2(Math.sin(toward - normal), Math.cos(toward - normal)))
    if (diff < bestDiff) { bestDiff = diff; best = k }
  }
  const v = (k: number) => { const a = (-90 + 60 * k) * Math.PI / 180; return `${Math.round((cx + r * Math.cos(a)) * 100) / 100},${Math.round((cy + r * Math.sin(a)) * 100) / 100}` }
  return `${v(best)} ${v((best + 1) % 6)}`
}

/** Which lattice neighbour lies across edge k of a pointy-top cell (edge k runs from vertex k to k + 1). */
const EDGE_NEIGHBOUR: readonly (readonly [number, number])[] = [[1, -1], [1, 0], [0, 1], [-1, 1], [-1, 0], [0, -1]]

export interface MeshGroupOutline { parentId: string; depth: number; d: string }

/**
 * Outlines for a mesh: every parent and its direct children form 1 group, and the
 * group's outer boundary is the set of cell edges whose far side is not in the group.
 * Returned as 1 SVG path per group, so a renderer can stroke topics thick and the
 * families inside them thinner, and the eye can tell where 1 comb group ends.
 */
export function meshGroupOutlines(nodes: readonly MindmapNode[], R: number): MeshGroupOutline[] {
  const key = (q: number, r: number) => `${q},${r}`
  const cellOf = new Map<string, readonly [number, number]>()
  for (const n of nodes) {
    const cx = n.x + n.width / 2, cy = n.y + n.height / 2
    const r = Math.round(cy / (1.5 * R))
    const q = Math.round(cx / (Math.sqrt(3) * R) - r / 2)
    cellOf.set(n.id, [q, r])
  }
  const childrenOf = new Map<string, MindmapNode[]>()
  for (const n of nodes) {
    if (!n.parentId) continue
    const arr = childrenOf.get(n.parentId)
    if (arr) arr.push(n); else childrenOf.set(n.parentId, [n])
  }
  const vertex = (cx: number, cy: number, k: number) => {
    const a = (-90 + 60 * k) * Math.PI / 180
    return `${Math.round((cx + R * Math.cos(a)) * 100) / 100} ${Math.round((cy + R * Math.sin(a)) * 100) / 100}`
  }
  const out: MeshGroupOutline[] = []
  for (const parent of nodes) {
    const kids = childrenOf.get(parent.id)
    if (!kids?.length) continue
    const members = new Set<string>()
    for (const m of [parent, ...kids]) { const c = cellOf.get(m.id); if (c) members.add(key(c[0], c[1])) }
    const segs: string[] = []
    for (const m of [parent, ...kids]) {
      const c = cellOf.get(m.id)
      if (!c) continue
      const { x: cx, y: cy } = axialToCenter(c[0], c[1], R)
      EDGE_NEIGHBOUR.forEach(([dq, dr], k) => {
        if (members.has(key(c[0] + dq, c[1] + dr))) return
        segs.push(`M ${vertex(cx, cy, k)} L ${vertex(cx, cy, (k + 1) % 6)}`)
      })
    }
    if (segs.length) out.push({ parentId: parent.id, depth: parent.depth, d: segs.join(' ') })
  }
  return out
}
