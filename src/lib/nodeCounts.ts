import { displayTitle } from './links'

export interface SubtreeCounts {
  childCounts: Map<string, number>
  descendantCounts: Map<string, number>
}

// Direct-child and total-descendant counts for every node in one O(n) pass, so callers
// don't run an O(n)/O(n^2) walk of their own.
export function computeSubtreeCounts(nodes: { id: string; parentId: string | null }[]): SubtreeCounts {
  const children = new Map<string, string[]>()
  for (const n of nodes) {
    if (n.parentId) {
      const arr = children.get(n.parentId)
      if (arr) arr.push(n.id); else children.set(n.parentId, [n.id])
    }
  }
  const childCounts = new Map<string, number>()
  const descendantCounts = new Map<string, number>()
  const descOf = (id: string): number => {
    const cached = descendantCounts.get(id)
    if (cached !== undefined) return cached
    const kids = children.get(id) ?? []
    let total = kids.length
    for (const k of kids) total += descOf(k)
    descendantCounts.set(id, total)
    return total
  }
  for (const n of nodes) {
    childCounts.set(n.id, (children.get(n.id) ?? []).length)
    descOf(n.id)
  }
  return { childCounts, descendantCounts }
}

export interface LevelCounts {
  byDepth: number[]
  total: number
  deepest: number
  largestBranch: { title: string; count: number } | null
}

// Per-depth node counts, the deepest level present, and the L1 node with the most
// descendants (the "largest branch"). Depths are assumed contiguous from the root (0).
export function levelCounts(nodes: { id: string; parentId: string | null; depth: number; title: string }[]): LevelCounts {
  if (nodes.length === 0) return { byDepth: [], total: 0, deepest: -1, largestBranch: null }

  const byDepth: number[] = []
  for (const n of nodes) byDepth[n.depth] = (byDepth[n.depth] ?? 0) + 1
  for (let i = 0; i < byDepth.length; i++) byDepth[i] = byDepth[i] ?? 0

  const { descendantCounts } = computeSubtreeCounts(nodes)
  let largestBranch: { title: string; count: number } | null = null
  for (const n of nodes) {
    if (n.depth !== 1) continue
    const count = descendantCounts.get(n.id) ?? 0
    if (!largestBranch || count > largestBranch.count) largestBranch = { title: displayTitle(n.title), count }
  }

  return { byDepth, total: nodes.length, deepest: byDepth.length - 1, largestBranch }
}
