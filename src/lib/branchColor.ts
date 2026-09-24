// Shared branch-colour resolver: the ONE place DiagramCanvas.tsx (client) and
// render-svg.ts (server) resolve a node's base colour, so a colour picked in the
// Style panel draws identically on the canvas, the home cards, and the share image.
//
// Rule: walking from the root, a node's base colour is its own `color` when
// `colorMode === 'manual'`, else its parent's base colour, else - for a depth-1
// node with no manual ancestor - the 12-colour wheel by sortOrder. A node with no
// manual ancestor anywhere above it (and not depth 1 itself) resolves to null, same
// as the old l1PaletteColor contract: callers fall back to the node's stored colour.
import { L1_PALETTE } from './color.js'

export type BranchColorNode = {
  id: string
  parentId: string | null
  depth: number
  sortOrder?: number
  color: string
  colorMode?: 'auto' | 'manual'
}

/** Resolve every node's branch colour in one O(n) pass (each ancestor visited once). */
export function computeBranchColors(nodes: BranchColorNode[]): Map<string, string | null> {
  const byId = new Map(nodes.map(n => [n.id, n]))
  const colors = new Map<string, string | null>()
  const resolve = (n: BranchColorNode): string | null => {
    const cached = colors.get(n.id)
    if (cached !== undefined) return cached
    let c: string | null = null
    if (n.colorMode === 'manual') {
      c = n.color
    } else if (n.depth > 0) {
      const parent = n.parentId ? byId.get(n.parentId) : undefined
      const parentBase = parent ? resolve(parent) : null
      c = parentBase ?? (n.depth === 1 ? L1_PALETTE[(((n.sortOrder ?? 0) % 12) + 12) % 12] : null)
    }
    colors.set(n.id, c)
    return c
  }
  for (const n of nodes) resolve(n)
  return colors
}
