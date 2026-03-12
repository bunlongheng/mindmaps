import type { MindNode } from '../../types'

const ROOT_W = 200
const ROOT_H = 52
const CHILD_W = 160
const CHILD_H = 40
const GRAND_W = 140
const GRAND_H = 36
const H_GAP = 90
const V_GAP = 22

export function computeMindmapLayout(nodes: MindNode[]): MindNode[] {
  const root = nodes.find(n => n.parentId === null)
  if (!root) return nodes

  const children = nodes
    .filter(n => n.parentId === root.id)
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))

  const result: MindNode[] = []
  const centerY = 340
  const rootX = 280

  result.push({ ...root, x: rootX, y: centerY - ROOT_H / 2, width: ROOT_W, height: ROOT_H, manuallyPositioned: false })

  const childX = rootX + ROOT_W + H_GAP
  const totalH = children.length * CHILD_H + Math.max(0, children.length - 1) * V_GAP
  const childStartY = centerY - totalH / 2

  children.forEach((child, i) => {
    const cy = childStartY + i * (CHILD_H + V_GAP)
    if (!child.manuallyPositioned) {
      result.push({ ...child, x: childX, y: cy, width: CHILD_W, height: CHILD_H })
    } else {
      result.push(child)
    }

    const grandchildren = nodes
      .filter(n => n.parentId === child.id)
      .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))

    if (grandchildren.length > 0) {
      const gcX = childX + CHILD_W + 60
      const childCY = cy + CHILD_H / 2
      const gcTotalH = grandchildren.length * GRAND_H + Math.max(0, grandchildren.length - 1) * 12
      const gcStartY = childCY - gcTotalH / 2

      grandchildren.forEach((gc, j) => {
        if (!gc.manuallyPositioned) {
          result.push({ ...gc, x: gcX, y: gcStartY + j * (GRAND_H + 12), width: GRAND_W, height: GRAND_H })
        } else {
          result.push(gc)
        }
        const deeper = nodes.filter(n => n.parentId === gc.id)
        deeper.forEach((d, k) => {
          result.push({ ...d, x: gcX, y: gcStartY + j * (GRAND_H + 12) + (k + 1) * (GRAND_H + 8), width: GRAND_W, height: GRAND_H })
        })
      })
    }
  })

  return result
}
