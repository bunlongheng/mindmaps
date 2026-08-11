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
