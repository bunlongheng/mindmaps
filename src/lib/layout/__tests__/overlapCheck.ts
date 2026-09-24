import type { MindmapNode } from '../../../types/index.js'

export interface Overlap {
  a: MindmapNode
  b: MindmapNode
}

/**
 * Pairwise axis-aligned rectangle overlap check, with a small pixel tolerance so
 * boxes that merely touch or sit within rounding distance of each other don't count.
 */
export function findOverlaps(nodes: MindmapNode[], tolerance = 2): Overlap[] {
  const overlaps: Overlap[] = []
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const a = nodes[i]
      const b = nodes[j]
      const overlapX = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x)
      const overlapY = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y)
      if (overlapX > tolerance && overlapY > tolerance) {
        overlaps.push({ a, b })
      }
    }
  }
  return overlaps
}
