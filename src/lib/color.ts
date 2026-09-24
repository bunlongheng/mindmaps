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
 * full colour, every level below it steps down by a step big enough to read at a
 * glance, and depth 5 and deeper share a floor so very deep maps stay legible.
 *
 *   depth 1 -> 100%   depth 2 -> 80%   depth 3 -> 60%   depth 4 -> 50%   depth 5+ -> 40%
 *
 * Exported so the canvas (Node.tsx), the server renderer (render-svg.ts) and the
 * tests all read the same numbers.
 */
export const DEPTH_STRENGTH: Readonly<Record<number, number>> = { 1: 1, 2: 0.8, 3: 0.6, 4: 0.5 }

/** Strength used at depth 5 and deeper. */
export const DEPTH_STRENGTH_FLOOR = 0.4

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
 * Node fill for a branch colour at a given depth: the colour mixed toward white by
 * (1 - strength). Depth 0 (the root) is returned untouched. Returns hex so callers
 * can run the same isLight() readability check on the result.
 */
export function depthFill(baseHex: string, depth: number): string {
  if (depth <= 0) return baseHex
  const mix = 1 - depthStrength(depth)
  const [r, g, b] = hexToRgb(baseHex)
  const ch = (v: number) => Math.round(v + (255 - v) * mix).toString(16).padStart(2, '0')
  return `#${ch(r)}${ch(g)}${ch(b)}`
}

export function darken(hex: string, amount = 0.3): string {
  const [r, g, b] = hexToRgb(hex)
  const nr = Math.round(r * (1 - amount))
  const ng = Math.round(g * (1 - amount))
  const nb = Math.round(b * (1 - amount))
  return `rgb(${nr},${ng},${nb})`
}

// 12 distinct colours sampled from the artist's colour wheel, applied to the top-12
// L1 categories in order (top -> bottom). Children inherit their L1's colour.
export const L1_PALETTE = [
  '#ED1C24', // red
  '#F26522', // red-orange
  '#F7941E', // orange
  '#FAA61A', // amber
  '#FFD500', // yellow
  '#8DC63F', // yellow-green
  '#39B54A', // green
  '#0072BC', // blue
  '#2E3192', // blue-violet
  '#662D91', // violet
  '#92278F', // purple
  '#EC008C', // magenta
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
  if (cur && cur.depth === 1) return L1_PALETTE[(((cur.sortOrder ?? 0) % 12) + 12) % 12]
  return null
}

export const ROOT_COLORS = [
  '#ef4444', '#f97316', '#f59e0b', '#eab308',
  '#22c55e', '#14b8a6', '#06b6d4', '#3b82f6',
  '#6366f1', '#8b5cf6', '#ec4899', '#f43f5e',
  '#ffffff', '#f1f5f9', '#94a3b8', '#475569',
  '#1e293b', '#1a1d2e', '#000000', '#fde68a',
]
