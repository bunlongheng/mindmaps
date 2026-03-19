import type { IdeaNode } from '../../types'

export const FISHBONE_SLANT = 90

const SPINE_Y = 400
const ROOT_X = 120
const ROOT_W = 200, ROOT_H = 54
const L1_W = 160, L1_H = 44
const L2_W = 130, L2_H = 36
const L3_W = 110, L3_H = 30
const SPINE_SEG = 340         // horizontal gap between L1 attachment points
const BONE_HEIGHT_BASE = 260  // minimum vertical distance from spine to L1 tip
const L2_MIN_SPACING = 56     // minimum vertical gap between L2 nodes on the diagonal

export function computeFishboneLayout(nodes: IdeaNode[]): IdeaNode[] {
  const root = nodes.find(n => n.parentId === null)
  if (!root) return nodes

  const l1s = nodes.filter(n => n.parentId === root.id)
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))

  const result: IdeaNode[] = []
  result.push({ ...root, x: ROOT_X, y: SPINE_Y - ROOT_H / 2, width: ROOT_W, height: ROOT_H, manuallyPositioned: false })

  const spineOriginX = ROOT_X + ROOT_W

  l1s.forEach((l1, i) => {
    const above = i % 2 === 0
    const attachX = spineOriginX + (i + 1) * SPINE_SEG

    const l2s = nodes.filter(n => n.parentId === l1.id)
      .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
    const n2 = l2s.length

    // Grow bone height so L2 nodes never overlap — need n2 * L2_MIN_SPACING minimum
    const boneHeight = Math.max(BONE_HEIGHT_BASE, n2 * L2_MIN_SPACING + 40)

    const l1CX = attachX + FISHBONE_SLANT
    const l1CY = above ? SPINE_Y - boneHeight : SPINE_Y + boneHeight
    const l1w = l1.width > 0 ? l1.width : L1_W

    result.push({
      ...l1,
      x: l1CX - l1w / 2, y: l1CY - L1_H / 2,
      width: l1w, height: L1_H, manuallyPositioned: false,
    })

    // Effective bone length is from spine to the NEAR EDGE of L1 box
    // (this must match what EdgeLayer draws, so stubs land on the line)
    const boneEdgeH = boneHeight - L1_H / 2

    l2s.forEach((l2, j) => {
      // Space evenly along diagonal, furthest from spine first
      const t = (n2 - j) / (n2 + 1)
      const diagX = attachX + FISHBONE_SLANT * t
      const diagY = SPINE_Y + (above ? -1 : 1) * boneEdgeH * t

      const l2w = l2.width > 0 ? l2.width : L2_W
      const l2h = l2.height > 0 ? l2.height : L2_H
      const l2X = diagX + 28
      const l2Y = diagY - l2h / 2

      result.push({ ...l2, x: l2X, y: l2Y, width: l2w, height: l2h, manuallyPositioned: false })

      // L3 nodes stack vertically away from the spine (not horizontally)
      const l3s = nodes.filter(n => n.parentId === l2.id)
        .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
      const l3dir = above ? -1 : 1  // stack further from spine
      l3s.forEach((l3, k) => {
        const l3w = l3.width > 0 ? l3.width : L3_W
        const l3h = l3.height > 0 ? l3.height : L3_H
        result.push({
          ...l3,
          x: l2X + l2w + 16,
          y: l2Y + l3dir * k * (l3h + 12),
          width: l3w, height: l3h, manuallyPositioned: false,
        })
      })
    })
  })

  return result
}
