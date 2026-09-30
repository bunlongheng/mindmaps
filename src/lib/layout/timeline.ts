import type { MindmapNode } from '../../types/index.js'
import { shapedNodeSize } from '../nodeShape.js'
import { nodeFontSize, nodeHeight, nodeWidth, estimateTextWidth } from '../nodeMetrics.js'
import { rootCircleDiameter, rootIsPill, rootPillWidth, ROOT_FONT } from '../rootPill.js'

const SPINE_Y = 400
const ROOT_X = 80
const V_GAP = 14      // vertical gap between stacked L2/L3 nodes
const BRANCH_GAP = 24 // vertical gap between L1 edge and nearest L2
const L1_SEG = 64     // horizontal gap between L1 nodes
const BRANCH_INDENT = 40 // horizontal offset from the trunk to a child's left edge
const L3_GAP = 40     // horizontal gap from an L2 box to its L3 chain

/** Corner radius of the rounded elbow that leaves the trunk for each child (Xmind).
 *  Shared by the canvas (EdgeLayer) and the server renderer so both draw one shape. */
export const TIMELINE_ELBOW_R = 10

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
 * An L2 and its L3 children form one block: the L2 box, and its L3 stack sitting to the
 * RIGHT of it and centred on it (Xmind). Reserving the taller of the two, not just the
 * L2's own height, is what keeps the next L2 on the branch off these L3s.
 */
function l2Block(l2: MindmapNode, nodes: MindmapNode[]) {
  const { w: l2w, h: l2h } = shapedNodeSize(l2, nodeFontSize(2), boxWidth(l2, 2, !!(l2.icon || l2.emoji)), l2.height > 0 ? l2.height : nodeHeight(2))
  const l3s = nodes.filter(n => n.parentId === l2.id)
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
  const l3Sizes = l3s.map(l3 => shapedNodeSize(l3, nodeFontSize(3), boxWidth(l3, 3, !!(l3.icon || l3.emoji)), l3.height > 0 ? l3.height : nodeHeight(3)))
  const l3Total = l3Sizes.reduce((sum, sz) => sum + sz.h, 0) + Math.max(0, l3s.length - 1) * V_GAP
  return { l2w, l2h, l3s, l3Sizes, l3Total, blockH: Math.max(l2h, l3Total) }
}

export function computeTimelineLayout(nodes: MindmapNode[]): MindmapNode[] {
  const root = nodes.find(n => n.parentId === null)
  if (!root) return nodes

  const l1s = nodes.filter(n => n.parentId === root.id)
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))

  const result: MindmapNode[] = []
  // The root sizes itself from its title, the same rule the logic-chart layout
  // (src/lib/layout/mindmaps-layout) uses: a pill by default, and a circle grown
  // to fit the title when the node explicitly asks for one. Every imported map
  // stores the root at a flat 180, so without this a title of more than about 5
  // characters spilled out of the shape on the canvas AND on the share image.
  const rootFs = root.fontSize ?? ROOT_FONT
  const pill = rootIsPill(root, 'timeline')
  const circle = pill ? 0 : rootCircleDiameter(root.title, rootFs)
  const rootW = pill ? rootPillWidth(root.title, rootFs) : Math.max(circle, root.width > 0 ? root.width : 180)
  const rootH = pill ? nodeHeight(0) : Math.max(circle, root.height > 0 ? root.height : 180)
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

    // A topic keeps ALL of its children on its own side of the spine and consecutive
    // topics alternate - 1st up, 2nd down, 3rd up. Whichever side it is on, the stack
    // reads top to bottom in sort order (Xmind), so an upward topic starts its block at
    // the far end and works back toward the spine rather than counting outward from it.
    const totalH = blocks.reduce((sum, b) => sum + b.blockH, 0) + Math.max(0, blocks.length - 1) * V_GAP
    // The trunk drops from the middle of the L1 box, so children clear that, not its edge.
    const l2X = l1X + l1w / 2 + BRANCH_INDENT
    let cursor = above
      ? SPINE_Y - l1h / 2 - BRANCH_GAP - totalH
      : SPINE_Y + l1h / 2 + BRANCH_GAP
    l2s.forEach((l2, j) => {
      const { l2w, l2h, l3s, l3Sizes, l3Total, blockH } = blocks[j]
      const blockCY = cursor + blockH / 2

      maxW = Math.max(maxW, l1w / 2 + BRANCH_INDENT + l2w)
      result.push({ ...l2, x: l2X, y: blockCY - l2h / 2, width: l2w, height: l2h, manuallyPositioned: false })

      // L3s run to the RIGHT of their L2, stacked and centred on it, so a chain reads
      // left to right the way Xmind draws it.
      const l3X = l2X + l2w + L3_GAP
      let l3Top = blockCY - l3Total / 2
      l3s.forEach((l3, k) => {
        const { w: l3w, h: l3h } = l3Sizes[k]
        maxW = Math.max(maxW, l1w / 2 + BRANCH_INDENT + l2w + L3_GAP + l3w)
        result.push({ ...l3, x: l3X, y: l3Top, width: l3w, height: l3h, manuallyPositioned: false })
        l3Top += l3h + V_GAP
      })

      cursor += blockH + V_GAP
    })

    curX += maxW + L1_SEG
  })

  return result
}
