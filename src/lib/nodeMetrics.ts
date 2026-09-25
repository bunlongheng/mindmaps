// One box-sizing table for every depth.
//
// Before this file the canvas, the server renderer and each layout carried their own
// per-depth font table (26/19/16/13 on the canvas, 22/16/13/11 in the layouts, 18/13/11
// in the radial mindmap). The boxes and the text they had to hold were sized from
// different numbers, so nothing lined up and depth 3 and 4 came out tiny.
//
// Tuned against Xmind at 100 percent zoom: a top-level topic is a comfortable 44px box
// with 20px text and 14px of clear space on each side, and every level below steps down
// gently so the deepest label is still readable at 14px.
//
//   depth | font      | height       | padX
//   ------+-----------+--------------+------------------
//     0   | ROOT_FONT | ROOT_PILL_H  | ROOT_PILL_PAD / 2   (the root, sized in src/lib/rootPill)
//     1   | 20        | 44           | 14
//     2   | 18        | 40           | 12
//     3   | 16        | 36           | 12
//    4+   | 14        | 32           | 10
//
// A node carrying an explicit `fontSize` keeps it; only the default comes from here.
// Callers must never re-declare a size: read fontSize/height/padX from `nodeMetrics`,
// build widths with `nodeWidth`, and take a floor from `nodeMinWidth`.

import { ROOT_FONT, ROOT_PILL_H, ROOT_PILL_PAD } from './rootPill.js'
import { displayTitle } from './links.js'

export interface NodeMetric {
  /** Default font size in px when the node has no explicit `fontSize`. */
  readonly fontSize: number
  /** Default box height in px when the layout has no stored height. */
  readonly height: number
  /** Clear space in px between the box edge and the label, each side. */
  readonly padX: number
}

/** Index is depth; the last row covers every deeper level. */
const TABLE: readonly NodeMetric[] = [
  { fontSize: ROOT_FONT, height: ROOT_PILL_H, padX: ROOT_PILL_PAD / 2 },
  { fontSize: 20, height: 44, padX: 14 },
  { fontSize: 18, height: 40, padX: 12 },
  { fontSize: 16, height: 36, padX: 12 },
  { fontSize: 14, height: 32, padX: 10 },
]

/** Deepest row in the table; every depth past it shares this metric. */
export const MAX_METRIC_DEPTH = TABLE.length - 1

/** Average glyph width as a fraction of the font size, for estimate-only measurement. */
export const CHAR_W_RATIO = 0.64

/** Gap between an icon or emoji badge and the label that follows it. */
export const ICON_GAP = 14

/** A box never narrows below this many characters of its own text. */
export const MIN_WIDTH_CHARS = 8

/** Sizing for a node at `depth`. Depths past the table clamp to the deepest row. */
export function nodeMetrics(depth: number): NodeMetric {
  const d = Number.isFinite(depth) ? Math.max(0, Math.floor(depth)) : 0
  return TABLE[Math.min(d, MAX_METRIC_DEPTH)]
}

/** Default font size at `depth`. */
export function nodeFontSize(depth: number): number {
  return nodeMetrics(depth).fontSize
}

/** Default box height at `depth`. */
export function nodeHeight(depth: number): number {
  return nodeMetrics(depth).height
}

/** Horizontal padding at `depth`, per side. */
export function nodePadX(depth: number): number {
  return nodeMetrics(depth).padX
}

// Inter Regular advance widths in em for ASCII 32..126, measured from the bundled
// api/_fonts/Inter-Regular.ttf (the face the server renderer draws with). Both the
// canvas and the server size a box from this same table, so a card preview, a share
// image and the opened map agree to the pixel. Anything outside ASCII falls back to
// CHAR_W_RATIO, and CJK / emoji ranges to a full em.
const INTER_ADVANCE = [
  0.281, 0.288, 0.466, 0.633, 0.642, 0.982, 0.644, 0.300, 0.365, 0.365, 0.501, 0.662,
  0.288, 0.460, 0.288, 0.360, 0.631, 0.407, 0.610, 0.618, 0.646, 0.593, 0.620, 0.566,
  0.619, 0.620, 0.288, 0.302, 0.662, 0.662, 0.662, 0.511, 0.966, 0.690, 0.654, 0.730,
  0.722, 0.601, 0.590, 0.746, 0.743, 0.269, 0.571, 0.672, 0.565, 0.903, 0.753, 0.765,
  0.639, 0.765, 0.644, 0.642, 0.646, 0.744, 0.690, 0.985, 0.682, 0.679, 0.629, 0.365,
  0.360, 0.365, 0.471, 0.456, 0.323, 0.562, 0.612, 0.571, 0.612, 0.583, 0.370, 0.613,
  0.591, 0.242, 0.242, 0.549, 0.242, 0.876, 0.591, 0.600, 0.612, 0.612, 0.376, 0.528,
  0.327, 0.591, 0.562, 0.818, 0.546, 0.562, 0.552, 0.426, 0.333, 0.426, 0.662,
]

/** Rendered width of a title in Inter Regular, from the glyph table (no canvas needed). */
export function estimateTextWidth(title: string, fontSize: number): number {
  let em = 0
  for (const ch of displayTitle(title)) {
    const code = ch.codePointAt(0) ?? 0
    if (code >= 32 && code < 127) em += INTER_ADVANCE[code - 32]
    else if (code >= 0x2e80) em += 1        // CJK, emoji and other full-width glyphs
    else em += CHAR_W_RATIO
  }
  return em * fontSize
}

/** Width an icon or emoji badge reserves: a box-height square plus the gap. */
export function iconZoneWidth(depth: number, height?: number): number {
  return (height ?? nodeHeight(depth)) + ICON_GAP
}

/** Narrowest box at `depth`: `chars` of its own text plus both paddings. */
export function nodeMinWidth(depth: number, chars = MIN_WIDTH_CHARS): number {
  const m = nodeMetrics(depth)
  return Math.ceil(chars * m.fontSize * CHAR_W_RATIO) + 2 * m.padX
}

/**
 * Box width for a measured label: the text, both paddings, and the icon zone when a
 * badge is drawn. `extra` covers geometry a layout adds on top (the fishbone slant).
 */
export function nodeWidth(
  measuredTextW: number,
  depth: number,
  opts: { hasIcon?: boolean; height?: number; extra?: number } = {},
): number {
  const m = nodeMetrics(depth)
  const icon = opts.hasIcon ? iconZoneWidth(depth, opts.height) : 0
  const total = measuredTextW + 2 * m.padX + icon + (opts.extra ?? 0)
  return Math.max(nodeMinWidth(depth), Math.ceil(total))
}
