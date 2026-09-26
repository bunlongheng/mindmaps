import type { MindmapNode } from '../../types/index.js'
import { shapedNodeSize } from '../nodeShape.js'
import { nodeFontSize, nodeHeight, nodeWidth, estimateTextWidth } from '../nodeMetrics.js'

const SPINE_Y = 400
const ROOT_X = 80
const V_GAP = 14      // vertical gap between stacked L2/L3 nodes
const BRANCH_GAP = 24 // vertical gap between L1 edge and nearest L2
const L1_SEG = 64     // horizontal gap between L1 nodes
const BRANCH_INDENT = 48 // horizontal offset from branch line to node left edge

/** Estimate rendered width from title text and the shared box table (src/lib/nodeMetrics) */
function autoWidth(title: string, depth: number, hasIconOrEmoji: boolean): number {
  return nodeWidth(estimateTextWidth(title, nodeFontSize(depth)), depth, {
    hasIcon: hasIconOrEmoji,
    height: nodeHeight(depth),
  })
}

/** A manual node keeps the width the user dragged; everyone else auto-sizes from title. */
function boxWidth(node: MindmapNode, depth: number, hasIconOrEmoji: boolean): number {
  if (node.widthMode === 'manual' && node.width > 0) return node.width
  return autoWidth(node.title, depth, hasIconOrEmoji)
}

/**
 * An L2 and its L3 children run as one continuous block away from the spine (L2 box,
 * then its L3s stacked past it). Reserving the whole block's height, not just the L2's
 * own height, is what keeps the next L2 on the branch from landing on top of these L3s.
 */
function l2Block(l2: MindmapNode, nodes: MindmapNode[]) {
  const { w: l2w, h: l2h } = shapedNodeSize(l2, nodeFontSize(2), boxWidth(l2, 2, !!(l2.icon || l2.emoji)), l2.height > 0 ? l2.height : nodeHeight(2))
  const l3s = nodes.filter(n => n.parentId === l2.id)
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
  const l3Sizes = l3s.map(l3 => shapedNodeSize(l3, nodeFontSize(3), boxWidth(l3, 3, !!(l3.icon || l3.emoji)), l3.height > 0 ? l3.height : nodeHeight(3)))
  const l3Total = l3Sizes.reduce((sum, sz) => sum + sz.h, 0) + Math.max(0, l3s.length - 1) * V_GAP
  const blockH = l2h + (l3s.length > 0 ? V_GAP + l3Total : 0)
  return { l2w, l2h, l3s, l3Sizes, blockH }
}

export function computeTimelineLayout(nodes: MindmapNode[]): MindmapNode[] {
  const root = nodes.find(n => n.parentId === null)
  if (!root) return nodes

  const l1s = nodes.filter(n => n.parentId === root.id)
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))

  const result: MindmapNode[] = []
  const rootW = root.width > 0 ? root.width : 180
  const rootH = root.height > 0 ? root.height : 180
  result.push({ ...root, x: ROOT_X, y: SPINE_Y - rootH / 2, width: rootW, height: rootH, manuallyPositioned: false })

  let curX = ROOT_X + rootW + 48

  l1s.forEach((l1, i) => {
    const above = i % 2 === 0
    // Auto-size L1 from title unless manual — a leftover stored width from mindmap
    // layout (320px) is too wide and must not survive an unrelated type switch
    const { w: l1w, h: l1h } = shapedNodeSize(l1, nodeFontSize(1), boxWidth(l1, 1, !!(l1.icon || l1.emoji)), nodeHeight(1))
    const l1X = curX

    result.push({ ...l1, x: l1X, y: SPINE_Y - l1h / 2, width: l1w, height: l1h, manuallyPositioned: false })

    const l2s = nodes.filter(n => n.parentId === l1.id)
      .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
    const blocks = l2s.map(l2 => l2Block(l2, nodes))

    // Track widest node in this column for spacing
    let maxW = l1w

    // Stack each L2's block (its own box, then its L3 run) one after another away from
    // the spine, so an L2 with several L3 children never collides with the next L2.
    // A topic with 2 or more blocks puts the first half above the spine and the rest
    // below, so a deep map spreads across the spine instead of towering over it.
    const twoSided = blocks.length >= 2
    const aboveCount = Math.ceil(blocks.length / 2)
    let offsetAbove = 0
    let offsetBelow = 0
    l2s.forEach((l2, j) => {
      const { l2w, l2h, l3s, l3Sizes, blockH } = blocks[j]
      const blockAbove = twoSided ? j < aboveCount : above
      const offset = blockAbove ? offsetAbove : offsetBelow
      // Offset L2 right from the branch line
      const l2X = l1X + BRANCH_INDENT
      const l2Y = blockAbove
        ? SPINE_Y - l1h / 2 - BRANCH_GAP - offset - l2h
        : SPINE_Y + l1h / 2 + BRANCH_GAP + offset

      maxW = Math.max(maxW, l2w)
      result.push({ ...l2, x: l2X, y: l2Y, width: l2w, height: l2h, manuallyPositioned: false })

      let l3Cursor = blockAbove ? l2Y - V_GAP : l2Y + l2h + V_GAP
      l3s.forEach((l3, k) => {
        const { w: l3w, h: l3h } = l3Sizes[k]
        // L3s step in once more than their L2, so a branch reads as an outline, not 1 flat column.
        const l3X = l1X + BRANCH_INDENT * 2
        const l3Y = blockAbove ? l3Cursor - l3h : l3Cursor
        maxW = Math.max(maxW, BRANCH_INDENT + l3w)
        result.push({ ...l3, x: l3X, y: l3Y, width: l3w, height: l3h, manuallyPositioned: false })
        l3Cursor = blockAbove ? l3Y - V_GAP : l3Cursor + l3h + V_GAP
      })

      if (blockAbove) offsetAbove += blockH + V_GAP
      else offsetBelow += blockH + V_GAP
    })

    curX += maxW + L1_SEG
  })

  return result
}
