import type { MindNode } from '../../types'

const NODE_W = 160
const NODE_H = 40
const SPINE_Y = 300
const SPINE_START_X = 100
const BONE_SPACING = 200
const BONE_LENGTH = 140

export function computeFishboneLayout(nodes: MindNode[]): MindNode[] {
  const root = nodes.find(n => n.parentId === null)
  if (!root) return nodes

  const children = nodes
    .filter(n => n.parentId === root.id)
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))

  const result: MindNode[] = []
  const spineEndX = SPINE_START_X + (children.length + 1) * BONE_SPACING

  // Root (head) at right end of spine
  result.push({ ...root, x: spineEndX, y: SPINE_Y - NODE_H / 2, width: NODE_W, height: NODE_H, manuallyPositioned: false })

  children.forEach((child, i) => {
    const boneX = SPINE_START_X + (i + 1) * BONE_SPACING
    const above = i % 2 === 0
    const boneEndY = above
      ? SPINE_Y - BONE_LENGTH
      : SPINE_Y + BONE_LENGTH

    const cx = boneX - NODE_W / 2
    const cy = boneEndY + (above ? -NODE_H : 0)

    if (!child.manuallyPositioned) {
      result.push({ ...child, x: cx, y: cy, width: NODE_W, height: NODE_H })
    } else {
      result.push(child)
    }

    // Level-2 nodes
    const grandchildren = nodes
      .filter(n => n.parentId === child.id)
      .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))

    grandchildren.forEach((gc, j) => {
      const gcX = boneX - (j + 1) * 90 - NODE_W / 2
      const gcY = above
        ? boneEndY - BONE_LENGTH / 2 * (j + 1) / (grandchildren.length + 1) - NODE_H / 2
        : boneEndY + BONE_LENGTH / 2 * (j + 1) / (grandchildren.length + 1) - NODE_H / 2

      if (!gc.manuallyPositioned) {
        result.push({ ...gc, x: gcX, y: gcY, width: NODE_W, height: NODE_H })
      } else {
        result.push(gc)
      }

      // Deeper nodes fall back to inline
      const deeper = nodes.filter(n => n.parentId === gc.id)
      deeper.forEach((d, k) => {
        result.push({ ...d, x: gcX, y: gcY + (k + 1) * (NODE_H + 10), width: NODE_W, height: NODE_H })
      })
    })
  })

  return result
}
