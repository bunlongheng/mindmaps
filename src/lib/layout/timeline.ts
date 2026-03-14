import type { MindNode } from '../../types'

const SPINE_Y = 380
const ROOT_X = 120
const ROOT_W = 180, ROOT_H = 52
const L1_W = 160, L1_H = 44
const L2_W = 110, L2_H = 32
const L3_W = 100, L3_H = 30
const L1_SEG = 60   // horizontal gap between consecutive L1 nodes
const L2_GAP = 10   // vertical gap between L2 siblings

export function computeTimelineLayout(nodes: MindNode[]): MindNode[] {
  const root = nodes.find(n => n.parentId === null)
  if (!root) return nodes

  const l1s = nodes.filter(n => n.parentId === root.id)
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))

  const result: MindNode[] = []
  result.push({ ...root, x: ROOT_X, y: SPINE_Y - ROOT_H / 2, width: ROOT_W, height: ROOT_H, manuallyPositioned: false })

  l1s.forEach((l1, i) => {
    const l1X = ROOT_X + ROOT_W + 40 + i * (L1_W + L1_SEG)
    result.push({ ...l1, x: l1X, y: SPINE_Y - L1_H / 2, width: L1_W, height: L1_H, manuallyPositioned: false })

    const l2s = nodes.filter(n => n.parentId === l1.id)
      .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
    const above = i % 2 === 0
    const n2 = l2s.length
    const totalH = n2 * L2_H + (n2 - 1) * L2_GAP
    const l2X = l1X + L1_W + 30

    l2s.forEach((l2, j) => {
      const l2Y = above
        ? SPINE_Y - L1_H / 2 - 20 - totalH + j * (L2_H + L2_GAP)
        : SPINE_Y + L1_H / 2 + 20 + j * (L2_H + L2_GAP)

      result.push({ ...l2, x: l2X, y: l2Y, width: L2_W, height: L2_H, manuallyPositioned: false })

      const l3s = nodes.filter(n => n.parentId === l2.id)
        .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
      l3s.forEach((l3, k) => {
        result.push({
          ...l3,
          x: l2X + L2_W + 14 + k * (L3_W + 12),
          y: l2Y + (L2_H - L3_H) / 2,
          width: L3_W, height: L3_H, manuallyPositioned: false,
        })
      })
    })
  })

  return result
}
