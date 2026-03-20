import type { MindmapNode } from '../../types'

const SPINE_Y = 400
const ROOT_X = 80
const V_GAP = 12      // vertical gap between stacked L2/L3 nodes
const BRANCH_GAP = 20 // vertical gap between L1 edge and nearest L2
const L1_SEG = 64     // horizontal gap between L1 nodes

/** Estimate rendered width from title text and font size */
function autoWidth(title: string, fontSize: number, hasIconOrEmoji: boolean, minW: number): number {
  const textW = title.length * fontSize * 0.62
  const iconZone = hasIconOrEmoji ? fontSize * 2.2 : 0
  return Math.max(minW, Math.ceil(textW + iconZone + 28))
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
    // Always auto-size L1 from title — stored widths from mindmap layout (320px) are too wide
    const l1w = autoWidth(l1.title, 22, !!(l1.icon || l1.emoji), 120)
    const l1h = 44
    const l1X = curX
    const l1CX = l1X + l1w / 2

    result.push({ ...l1, x: l1X, y: SPINE_Y - l1h / 2, width: l1w, height: l1h, manuallyPositioned: false })

    const l2s = nodes.filter(n => n.parentId === l1.id)
      .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))

    // Track widest node in this column for spacing
    let maxW = l1w

    l2s.forEach((l2, j) => {
      const l2w = autoWidth(l2.title, 16, !!(l2.icon || l2.emoji), 90)
      const l2h = l2.height > 0 ? l2.height : 36
      // Center L2 under L1
      const l2X = l1CX - l2w / 2
      // Stack: j=0 is closest to spine, j increases away
      const l2Y = above
        ? SPINE_Y - l1h / 2 - BRANCH_GAP - l2h - j * (l2h + V_GAP)
        : SPINE_Y + l1h / 2 + BRANCH_GAP + j * (l2h + V_GAP)

      maxW = Math.max(maxW, l2w)
      result.push({ ...l2, x: l2X, y: l2Y, width: l2w, height: l2h, manuallyPositioned: false })

      const l3s = nodes.filter(n => n.parentId === l2.id)
        .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))

      l3s.forEach((l3, k) => {
        const l3w = autoWidth(l3.title, 13, !!(l3.icon || l3.emoji), 80)
        const l3h = l3.height > 0 ? l3.height : 30
        const l3X = l1CX - l3w / 2
        const l3Y = above
          ? l2Y - (k + 1) * (l3h + V_GAP)
          : l2Y + l2h + V_GAP + k * (l3h + V_GAP)
        maxW = Math.max(maxW, l3w)
        result.push({ ...l3, x: l3X, y: l3Y, width: l3w, height: l3h, manuallyPositioned: false })
      })
    })

    curX += maxW + L1_SEG
  })

  return result
}
