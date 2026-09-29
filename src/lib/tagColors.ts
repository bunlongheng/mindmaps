/** Tag colors - same 12 palettes and the same assignment rule as the Sequences
 *  app, so a tag reads identically across both. Each entry is a pastel bg, a
 *  saturated text color and a mid border; a tag keeps its color across renders
 *  because tags are sorted before the index is taken. */

export type TagColor = { bg: string; text: string; border: string }

export const TAG_PALETTE: TagColor[] = [
  { bg: '#fef2f2', text: '#b91c1c', border: '#fca5a5' }, // red
  { bg: '#fff7ed', text: '#c2410c', border: '#fdba74' }, // orange
  { bg: '#fefce8', text: '#a16207', border: '#fde047' }, // yellow
  { bg: '#f0fdf4', text: '#15803d', border: '#86efac' }, // green
  { bg: '#ecfdf5', text: '#047857', border: '#6ee7b7' }, // emerald
  { bg: '#f0fdfa', text: '#0f766e', border: '#5eead4' }, // teal
  { bg: '#eff6ff', text: '#1d4ed8', border: '#93c5fd' }, // blue
  { bg: '#eef2ff', text: '#4338ca', border: '#a5b4fc' }, // indigo
  { bg: '#faf5ff', text: '#7e22ce', border: '#d8b4fe' }, // violet
  { bg: '#fdf4ff', text: '#a21caf', border: '#f0abfc' }, // fuchsia
  { bg: '#fff1f2', text: '#be123c', border: '#fda4af' }, // rose
  { bg: '#f0f9ff', text: '#0369a1', border: '#7dd3fc' }, // sky
]

/** Tags pinned to a fixed color regardless of sort order (brand identity). */
export const TAG_FIXED_COLORS: Record<string, TagColor> = {
  YouTube: { bg: '#fef2f2', text: '#cc0000', border: '#fca5a5' },
}

const FALLBACK: TagColor = { bg: '#f1f5f9', text: '#475569', border: '#cbd5e1' }

export function buildTagColorMap(allTags: string[]): Map<string, TagColor> {
  const map = new Map<string, TagColor>()
  ;[...new Set(allTags)].sort().forEach((tag, i) => {
    map.set(tag, TAG_FIXED_COLORS[tag] ?? TAG_PALETTE[i % TAG_PALETTE.length])
  })
  return map
}

export function tagColor(tag: string, colorMap: Map<string, TagColor>): TagColor {
  return colorMap.get(tag) ?? FALLBACK
}
