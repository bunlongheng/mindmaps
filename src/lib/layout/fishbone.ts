import type { IdeaNode } from '../../types'

export const FISHBONE_SLANT = 90  // horizontal offset from attachment to L1 tip

const SPINE_Y = 380
const ROOT_X = 120
const ROOT_W = 200, ROOT_H = 54
const L1_W = 160, L1_H = 44
const L2_W = 110, L2_H = 32
const L3_W = 100, L3_H = 30
const SPINE_SEG = 280
const BONE_HEIGHT = 200

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
    const l1CX = attachX + FISHBONE_SLANT
    const l1CY = above ? SPINE_Y - BONE_HEIGHT : SPINE_Y + BONE_HEIGHT

    result.push({
      ...l1,
      x: l1CX - L1_W / 2, y: l1CY - L1_H / 2,
      width: L1_W, height: L1_H, manuallyPositioned: false,
    })

    const l2s = nodes.filter(n => n.parentId === l1.id)
      .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
    const n2 = l2s.length

    l2s.forEach((l2, j) => {
      // j=0 closest to L1 (high t), j=n-1 closest to spine (low t)
      const t = (n2 - j) / (n2 + 1)
      const diagX = attachX + FISHBONE_SLANT * t
      const diagY = SPINE_Y + (above ? -1 : 1) * BONE_HEIGHT * t
      // Place L2 slightly to the right of the diagonal so stub is visible
      const l2X = diagX + 18
      const l2Y = diagY - L2_H / 2

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
