import type { MindmapNode } from '../../types'

export const FISHBONE_SLANT = 90

const SPINE_Y = 400
const ROOT_X = 120
const ROOT_H = 54
const L1_H = 44
const L2_H = 36
const L3_H = 30

/** Auto-size node width from title length */
function autoW(title: string, depth: number, hasIcon: boolean): number {
  const fontSize = depth === 0 ? 28 : depth === 1 ? 22 : depth === 2 ? 16 : 13
  const charW = fontSize * 0.64
  const pad = 24
  const iconZone = hasIcon ? 44 : 0
  const textW = Math.ceil(title.length * charW) + pad + iconZone
  const min = depth === 0 ? 200 : depth === 1 ? 160 : depth === 2 ? 130 : 110
  return Math.max(min, Math.min(500, textW))
}
const SPINE_SEG = 340         // horizontal gap between L1 attachment points
const BONE_HEIGHT_BASE = 260  // minimum vertical distance from spine to L1 tip
const L2_MIN_SPACING = 56     // minimum vertical gap between L2 nodes on the diagonal

export function computeFishboneLayout(nodes: MindmapNode[]): MindmapNode[] {
  const root = nodes.find(n => n.parentId === null)
  if (!root) return nodes

  const l1s = nodes.filter(n => n.parentId === root.id)
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))

  const result: MindmapNode[] = []
  const rootW = autoW(root.title, 0, !!(root.icon || root.emoji))
  result.push({ ...root, x: ROOT_X, y: SPINE_Y - ROOT_H / 2, width: rootW, height: ROOT_H, manuallyPositioned: false })

  const spineOriginX = ROOT_X + rootW

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
    const l1w = autoW(l1.title, 1, !!(l1.icon || l1.emoji))

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

      const l2w = autoW(l2.title, 2, !!(l2.icon || l2.emoji))
      const l2h = L2_H
      const l2X = diagX + 28
      const l2Y = diagY - l2h / 2

      result.push({ ...l2, x: l2X, y: l2Y, width: l2w, height: l2h, manuallyPositioned: false })

      // L3 nodes stack vertically away from the spine (not horizontally)
      const l3s = nodes.filter(n => n.parentId === l2.id)
        .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
      const l3dir = above ? -1 : 1  // stack further from spine
      l3s.forEach((l3, k) => {
        const l3w = autoW(l3.title, 3, !!(l3.icon || l3.emoji))
        const l3h = L3_H
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
