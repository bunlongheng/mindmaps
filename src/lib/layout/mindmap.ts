import type { MindmapNode } from '../../types/index.js'
import { autoWidth, nodeSize, place, subtreeH, V_GAP, H_GAPS } from './mindmaps-layout.js'
import { nodeMinWidth } from '../nodeMetrics.js'

// The Mind Map: the classic balanced tree. The central topic sits in the middle and
// its topics spread BOTH ways - the first half to the right, the rest to the left -
// with every subtree continuing outward on the side its topic started on.
//
// It is the logic chart's tree twice over: src/lib/layout/mindmaps-layout already
// places a subtree in either direction (`place(..., goRight)`), so this file only
// decides which topic goes on which side and where the 2 sides meet.

/** Where the root's centre sits, so a map opens with both sides on screen. */
const ROOT_CX = 900
const CENTER_Y = 340

/** Right side first: topics 1..ceil(n/2) to the right, the rest to the left. */
export function splitSides<T>(items: T[]): { right: T[]; left: T[] } {
  const half = Math.ceil(items.length / 2)
  return { right: items.slice(0, half), left: items.slice(half) }
}

/** Stack a side's subtrees vertically, centred on `centerY`. */
function placeSide(
  side: MindmapNode[],
  anchorX: number,
  centerY: number,
  nodes: MindmapNode[],
  result: MindmapNode[],
  goRight: boolean,
) {
  const totalH = side.reduce((s, l) => s + subtreeH(l.id, 1, nodes), 0)
    + Math.max(0, side.length - 1) * V_GAP
  let curY = centerY - totalH / 2
  for (const l1 of side) {
    const h = subtreeH(l1.id, 1, nodes)
    place(l1.id, 1, anchorX, curY + h / 2, nodes, result, goRight)
    curY += h + V_GAP
  }
}

export function computeMindmapLayout(nodes: MindmapNode[]): MindmapNode[] {
  const root = nodes.find(n => n.parentId === null)
  if (!root) return nodes

  const l1s = nodes.filter(n => n.parentId === root.id)
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))

  // Every auto-width topic shares the widest topic's width, so both columns line up.
  const autoL1s = l1s.filter(n => n.widthMode !== 'manual')
  const l1UniformW = autoL1s.length > 0 ? Math.max(...autoL1s.map(n => autoWidth(n, 1))) : nodeMinWidth(1)
  const nodesForLayout = nodes.map(n =>
    (l1s.some(l => l.id === n.id) && n.widthMode !== 'manual') ? { ...n, width: l1UniformW } : n
  )

  const { w: rw, h: rh } = nodeSize(root, 0)
  const rootX = root.manuallyPositioned ? root.x : ROOT_CX - rw / 2
  const gap = root.branchGap ?? H_GAPS[0]

  const { right, left } = splitSides(l1s)
  const result: MindmapNode[] = []
  placeSide(right, rootX + rw + gap, CENTER_Y, nodesForLayout, result, true)
  placeSide(left, rootX - gap, CENTER_Y, nodesForLayout, result, false)

  // The root sits at the vertical middle of everything hanging off it, so the
  // connectors leave it level instead of all sweeping one way.
  const l1Results = result.filter(n => n.depth === 1)
  const midY = l1Results.length > 0
    ? (Math.min(...l1Results.map(n => n.y + n.height / 2)) + Math.max(...l1Results.map(n => n.y + n.height / 2))) / 2
    : CENTER_Y
  result.push({ ...root, x: rootX, y: midY - rh / 2, width: rw, height: rh })

  const placed = new Set(result.map(n => n.id))
  for (const n of nodes) if (!placed.has(n.id)) result.push(n)
  return result
}
