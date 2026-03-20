import type { MindmapNode } from '../../types'

const ROOT_X = 120
export const BRACE_GAP = 50  // horizontal space per level (includes the brace connector)
const V_GAP = 14

const WIDTHS  = [180, 160, 130, 110]
const HEIGHTS = [52,  44,  36,  32]
function nW(d: number) { return WIDTHS[Math.min(d, 3)] }
function nH(d: number) { return HEIGHTS[Math.min(d, 3)] }

export function computeBraceLayout(nodes: MindmapNode[]): MindmapNode[] {
  const root = nodes.find(n => n.parentId === null)
  if (!root) return nodes

  const result: MindmapNode[] = []

  function subtreeH(id: string, depth: number): number {
    const node = nodes.find(n => n.id === id)
    const selfH = (node?.height ?? 0) > 0 ? node!.height : nH(depth)
    const children = nodes.filter(n => n.parentId === id)
    if (children.length === 0) return selfH
    const childrenH = children.reduce((s, c) => s + subtreeH(c.id, depth + 1), 0) + (children.length - 1) * V_GAP
    return Math.max(selfH, childrenH)
  }

  function place(id: string, x: number, cy: number, depth: number) {
    const node = nodes.find(n => n.id === id)!
    const h = node.height > 0 ? node.height : nH(depth)
    const w = node.width > 0 ? node.width : nW(depth)
    result.push({ ...node, x, y: cy - h / 2, width: w, height: h, manuallyPositioned: false })

    const children = nodes.filter(n => n.parentId === id)
      .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
    if (children.length === 0) return

    const childX = x + w + BRACE_GAP
    const totalH = children.reduce((s, c) => s + subtreeH(c.id, depth + 1), 0) + (children.length - 1) * V_GAP
    let yOff = cy - totalH / 2

    children.forEach(child => {
      const cH = subtreeH(child.id, depth + 1)
      place(child.id, childX, yOff + cH / 2, depth + 1)
      yOff += cH + V_GAP
    })
  }

  place(root.id, ROOT_X, 400, 0)
  return result
}
