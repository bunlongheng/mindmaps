export function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace('#', '')
  const r = parseInt(clean.slice(0, 2), 16)
  const g = parseInt(clean.slice(2, 4), 16)
  const b = parseInt(clean.slice(4, 6), 16)
  return [r, g, b]
}

export function applyDepthTransparency(baseHex: string, depth: number): string {
  const [r, g, b] = hexToRgb(baseHex)
  const alpha = Math.max(0.15, Math.pow(0.8, depth))
  return `rgba(${r},${g},${b},${alpha})`
}

// Legacy soft ladder, still used by the HomePage fallback minimap. For node fills
// on the canvas and in the server renderer use depthFill() below - that is the one
// visible depth ladder both renderers share.
export function applyDepthBackground(baseHex: string, depth: number): string {
  if (depth === 0) return baseHex
  const [r, g, b] = hexToRgb(baseHex)
  // Mix toward white (255,255,255) based on depth
  const factor = Math.min(0.9, depth * 0.18)
  const nr = Math.round(r + (255 - r) * factor)
  const ng = Math.round(g + (255 - g) * factor)
  const nb = Math.round(b + (255 - b) * factor)
  return `rgb(${nr},${ng},${nb})`
}

/**
 * Visible colour ladder per depth. "Strength" is how much of the branch colour
 * survives; the remainder (1 - strength) is mixed toward white. Depth 1 keeps the
 * full colour and owns the loud layer; everything below it is a pale wash of the
 * same colour, getting lighter with depth, with the colour kept in the border. The
 * old 80% at depth 2 painted a topic and its children in nearly the same fill, so a
 * branch with 5 children read as 1 solid block on every diagram type.
 *
 *   depth 1 -> 100%   depth 2 -> 15%   depth 3 -> 7%   depth 4 -> 4%   depth 5+ -> 3%
 *
 * The old 11% at depth 3 was 4 points off depth 2, which on an already 85%-white
 * wash is a handful of channel levels - the leaf boxes read as the same colour as
 * the layer above them. Each step below depth 2 now roughly halves what is left, so
 * a leaf is visibly paler than its parent.
 *
 * Exported so the canvas (Node.tsx), the server renderer (render-svg.ts) and the
 * tests all read the same numbers.
 */
export const DEPTH_STRENGTH: Readonly<Record<number, number>> = { 1: 1, 2: 0.15, 3: 0.07, 4: 0.04 }

/** Strength used at depth 5 and deeper. */
export const DEPTH_STRENGTH_FLOOR = 0.03

/** Strength of the branch colour at a given depth (see DEPTH_STRENGTH). */
export function depthStrength(depth: number): number {
  return DEPTH_STRENGTH[depth] ?? DEPTH_STRENGTH_FLOOR
}

/**
 * Connector line thickness by layer, so the hierarchy reads at a glance instead of
 * flat. Root to L1 connectors are thickest, stepping down each layer down to a 1px
 * floor at L4 and deeper.
 *
 *   depth 1 -> 5px   depth 2 -> 3px   depth 3 -> 2px   depth 4+ -> 1px
 *
 * The key is the CHILD node's depth - the connector drawn INTO a node belongs to
 * that node's own layer (e.g. the line from the root into an L1 node is the L1
 * connector, width 5). Exported so the canvas (EdgeLayer.tsx, Edge.tsx), the server
 * renderer (render-svg.ts) and the tests all read the same numbers.
 */
export const EDGE_WIDTH_BY_DEPTH = [5, 3, 2, 1]

/** Connector width for a child at the given depth (see EDGE_WIDTH_BY_DEPTH). */
export function edgeWidthForDepth(childDepth: number): number {
  if (childDepth <= 1) return EDGE_WIDTH_BY_DEPTH[0]
  const idx = Math.min(childDepth - 1, EDGE_WIDTH_BY_DEPTH.length - 1)
  return EDGE_WIDTH_BY_DEPTH[idx]
}

/**
 * The radial mind map draws hair-thin branches, not the trunk-and-limb connectors the
 * other diagram types use, so it scales the SAME table down instead of carrying a
 * second one: 1.5px from the root into a depth-1 topic, tapering to a 1px floor for
 * the dots at depth 3 and deeper.
 */
export const RADIAL_EDGE_SCALE = 0.3

/** Branch opacity in the radial mind map, so a dense fan stays readable on white. */
export const RADIAL_EDGE_OPACITY = 0.55

/** Branch width for a child at the given depth in the radial mind map. */
export function radialEdgeWidth(childDepth: number): number {
  return Math.max(1, edgeWidthForDepth(childDepth) * RADIAL_EDGE_SCALE)
}

/**
 * Box border width per layer, so the outline carries the hierarchy the way the fill
 * and the connectors already do. Every box below the root used to be a flat 2px, so
 * an L3 leaf was outlined exactly as heavily as the L2 it hangs off.
 *
 *   depth 1 -> 4px   depth 2 -> 3px   depth 3 -> 2px   depth 4+ -> 1px
 *
 * The root keeps its own 5px rim. Exported so the canvas (Node.tsx), the server
 * renderer (render-svg.ts) and the tests all read the same numbers.
 */
export const NODE_STROKE_BY_DEPTH = [4, 3, 2, 1]

/** Border width for a box at the given depth (see NODE_STROKE_BY_DEPTH). */
export function nodeStrokeWidth(depth: number): number {
  if (depth <= 1) return NODE_STROKE_BY_DEPTH[0]
  return NODE_STROKE_BY_DEPTH[Math.min(depth - 1, NODE_STROKE_BY_DEPTH.length - 1)]
}

/**
 * Box fill opacity per layer, so each layer sits back a little further into the
 * canvas than the one above it. Every box used to paint at a flat 1.0.
 *
 *   depth 0/1 -> 1     depth 2 -> 0.92   depth 3 -> 0.84   depth 4+ -> 0.76
 *
 * Gentle on purpose: the fill is already a pale wash below L1, so this is the last
 * nudge of recession, not the main signal. Text, borders and the emoji badge stay
 * fully opaque. Exported so both renderers read the same numbers.
 */
export const NODE_FILL_OPACITY_BY_DEPTH = [1, 0.92, 0.84, 0.76]

/** Fill opacity for a box at the given depth (see NODE_FILL_OPACITY_BY_DEPTH). */
export function nodeFillOpacity(depth: number): number {
  if (depth <= 1) return NODE_FILL_OPACITY_BY_DEPTH[0]
  return NODE_FILL_OPACITY_BY_DEPTH[Math.min(depth - 1, NODE_FILL_OPACITY_BY_DEPTH.length - 1)]
}

/**
 * Node fill for a branch colour at a given depth: the colour mixed toward white by
 * (1 - strength). Depth 0 (the root) is returned untouched. Returns hex so callers
 * can run the same isLight() readability check on the result.
 */
export function depthFill(baseHex: string, depth: number): string {
  if (depth <= 0) return baseHex
  return tint(baseHex, depthStrength(depth))
}

/** A branch colour mixed toward white, keeping `strength` of the original. */
export function tint(baseHex: string, strength: number): string {
  const mix = 1 - strength
  const [r, g, b] = hexToRgb(baseHex)
  const ch = (v: number) => Math.round(v + (255 - v) * mix).toString(16).padStart(2, '0')
  return `#${ch(r)}${ch(g)}${ch(b)}`
}

/**
 * Timeline sub-nodes. On a timeline the L1 boxes sit on the spine and are the layer
 * that has to read first; the depth ladder's 80% at depth 2 painted the sub-nodes
 * almost as loud as their own parent, so a branch with 5 children became a wall of
 * one colour. These are pale chips instead - a light tint of the branch colour with
 * the colour kept only in the border - so the spine stays the loud layer. Label stays
 * black (LABEL_TEXT), same as every other box below the root.
 */
export const TIMELINE_SUB_TINT = 0.13
export function timelineSubFill(baseHex: string): string {
  return tint(baseHex, TIMELINE_SUB_TINT)
}

/**
 * Label colour for those chips. Xmind writes a sub-topic in a deep shade of its own
 * branch colour rather than black, which is what ties a chip to the topic it hangs
 * off. This is the ONE exception to LABEL_TEXT below - it applies to timeline depth 2
 * and deeper only, and color.test.ts holds it to 4.5:1 on its own fill.
 */
export const TIMELINE_SUB_TEXT_DARKEN = 0.55
export function timelineSubText(baseHex: string): string {
  return darken(baseHex, TIMELINE_SUB_TEXT_DARKEN)
}

export function darken(hex: string, amount = 0.3): string {
  const [r, g, b] = hexToRgb(hex)
  const nr = Math.round(r * (1 - amount))
  const ng = Math.round(g * (1 - amount))
  const nb = Math.round(b * (1 - amount))
  return `rgb(${nr},${ng},${nb})`
}

// 12 distinct colours sampled from the colour wheel, applied to the top-12 L1
// categories in order (top -> bottom). Children inherit their L1's colour.
//
// The old palette walked the wheel in hue order (red, red-orange, orange, ...), so
// neighbouring branches landed within ~15-30 degrees of hue of each other and were
// hard to tell apart at a glance. This one keeps the same 12 hue families - softened
// a touch below pure saturation, Xmind-like - but visits them in an order where every
// pair of neighbours (including branch 12 wrapping back to branch 1) is at least 60
// degrees apart on the wheel, most well past 130. See color.test.ts for the check.
// The Sequences participant palette, same 12 colors in the same order, so a branch
// here reads like a lane there: the hue walks the wheel instead of jumping around.
export const L1_PALETTE = [
  '#ef4444', // red
  '#f97316', // orange
  '#eab308', // yellow
  '#22c55e', // green
  '#14b8a6', // teal
  '#06b6d4', // cyan
  '#3b82f6', // blue
  '#8b5cf6', // violet
  '#ec4899', // pink
  '#f43f5e', // rose
  '#84cc16', // lime
  '#0891b2', // deep cyan
]

type MinNode = { id: string; parentId: string | null; depth: number; sortOrder?: number }

// Resolve a node's colour from the 12-colour palette by walking up to its L1 ancestor
// and indexing by that ancestor's order. Returns null for the root (depth 0) or if no
// L1 ancestor is found (fall back to the node's stored colour).
export function l1PaletteColor(node: MinNode, allNodes: MinNode[]): string | null {
  if (node.depth === 0) return null
  let cur: MinNode | null = node
  let guard = 0
  while (cur && cur.depth > 1 && guard++ < 30) cur = allNodes.find(n => n.id === cur!.parentId) ?? null
  if (cur && cur.depth === 1) return L1_PALETTE[(((cur.sortOrder ?? 0) % L1_PALETTE.length) + L1_PALETTE.length) % L1_PALETTE.length]
  return null
}

export const ROOT_COLORS = [
  '#ef4444', '#f97316', '#f59e0b', '#eab308',
  '#22c55e', '#14b8a6', '#06b6d4', '#3b82f6',
  '#6366f1', '#8b5cf6', '#ec4899', '#f43f5e',
  '#ffffff', '#f1f5f9', '#94a3b8', '#475569',
  '#1e293b', '#1a1d2e', '#000000', '#fde68a',
]

/** True when a hex background is dark enough to need light paint on top of it. */
export function isDarkBg(hex: string): boolean {
  const h = hex.replace('#', '')
  if (h.length < 6) return false
  const [r, g, b] = hexToRgb(h)
  return 0.299 * r + 0.587 * g + 0.114 * b < 140
}

/** Mix a hex colour toward white by `amount` (0..1). Returns hex, so the result can
 *  be fed straight back into a gradient stop or another mix. */
export function lighten(hex: string, amount = 0.25): string {
  const [r, g, b] = hexToRgb(hex)
  const ch = (v: number) => Math.round(v + (255 - v) * amount).toString(16).padStart(2, '0')
  return `#${ch(r)}${ch(g)}${ch(b)}`
}

// ── Neon (radial mind map on a dark canvas) ─────────────────────────────────
// On a dark theme the radial mind map is painted as a living circuit: every circle
// is an orb with a wide soft halo and a tight bright one, every branch is a
// luminous tube (a blurred glow line under a crisp lightened core), and the labels
// are white or light grey. Light themes keep the subtle look and read none of this.
// The numbers live here so the canvas (Node/EdgeLayer) and the server renderer
// (render-svg, whose output the home cards and share images use) cannot drift.

/** Wide halo blur, as a fraction of the circle's diameter (18px on a 96px circle). */
export const NEON_HALO_RATIO = 0.18
/** Tight core blur, as a fraction of the diameter (6px on a 96px circle). */
export const NEON_CORE_RATIO = 0.06
export const NEON_HALO_OPACITY = 0.35
export const NEON_CORE_OPACITY = 0.7
/** The blurred glow line drawn under every branch. */
export const NEON_EDGE_GLOW_WIDTH = 4
export const NEON_EDGE_GLOW_OPACITY = 0.5
export const NEON_EDGE_GLOW_BLUR = 3
/** The crisp core line on top of it, in the branch colour lightened by this much. */
export const NEON_EDGE_CORE_OPACITY = 0.95
export const NEON_EDGE_LIGHTEN = 0.25
/** Label paint: names white, counts and depth-2 labels light grey at 80%. */
export const NEON_TEXT = '#ffffff'

/** Label colour for every box below the root: always black, whatever the fill (owner rule 2026-09-24). */
export const LABEL_TEXT = '#000000'
export const NEON_TEXT_MUTED = '#cbd5e1'
export const NEON_TEXT_MUTED_OPACITY = 0.8
/** Blur under the white initial inside a circle. */
export const NEON_TEXT_BLUR = 2
/** Violet-blue stand-in when the root's own colour is itself too dark to glow. */
export const NEON_ROOT_FALLBACK = '#7c5cff'
/** How far the root orb's gradient is lightened at its centre. */
export const NEON_ROOT_LIGHTEN = 0.55

/** Shared ids, so both renderers reference the same defs. */
export const NEON_EDGE_FILTER = 'mm-neon-edge'
export const NEON_TEXT_FILTER = 'mm-neon-text'
export const NEON_ROOT_GRADIENT = 'mm-neon-root'

/**
 * Halo blur for a circle of this diameter, bucketed to 2px steps. A map shares a
 * handful of filters instead of carrying one per node, and the glow still scales
 * with the circle, so a 6px dot glows proportionally to a 96px topic.
 */
export function neonBlur(diameter: number): number {
  return Math.max(2, Math.round((diameter * NEON_HALO_RATIO) / 2) * 2)
}

/** Filter id for a circle of this diameter (see neonBlur). */
export function neonFilterId(diameter: number): string {
  return `mm-neon-${neonBlur(diameter)}`
}

export interface NeonFilterSpec { id: string; halo: number; core: number }

/** The distinct circle-glow filters a set of diameters needs, defined once per render. */
export function neonFilterSpecs(diameters: number[]): NeonFilterSpec[] {
  const out = new Map<string, NeonFilterSpec>()
  for (const d of diameters) {
    const halo = neonBlur(d)
    const id = `mm-neon-${halo}`
    if (!out.has(id)) out.set(id, { id, halo, core: Math.max(0.8, (halo * NEON_CORE_RATIO) / NEON_HALO_RATIO) })
  }
  return [...out.values()].sort((a, b) => a.halo - b.halo)
}

/**
 * Base colour of the root orb: its own colour, unless that colour is so dark it
 * cannot glow at all. The bar is far lower than isDarkBg's text-contrast one - a
 * saturated cyan or indigo root keeps its own colour and only a near-black one
 * (the stored default #1a1d2e) falls back to the violet.
 */
export const NEON_ROOT_MIN_LUMA = 60

export function neonRootColor(hex: string): string {
  if (!hex.startsWith('#') || hex.length < 7) return NEON_ROOT_FALLBACK
  const [r, g, b] = hexToRgb(hex)
  return 0.299 * r + 0.587 * g + 0.114 * b >= NEON_ROOT_MIN_LUMA ? hex : NEON_ROOT_FALLBACK
}
