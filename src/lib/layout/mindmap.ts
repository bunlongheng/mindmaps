import type { IdeaNode } from '../../types'

const ROOT_RADIUS = 180  // distance from root center to L1 center
const L1_EXTRA = 200     // additional distance from L1 to L2
const L2_EXTRA = 160     // additional distance from L2 to L3
const V_SPREAD = 0.45    // minimum angular spread (radians) per sibling

/** Slightly reduced font sizes for mindmap to prevent branch overlap (~18% smaller) */
const FONT_SIZES: Record<number, number> = { 1: 18, 2: 13, 3: 11 }
const DEFAULT_FONT_SIZE = 11

function autoW(node: IdeaNode, depth: number): number {
  const fontSize = FONT_SIZES[depth] ?? DEFAULT_FONT_SIZE
  const hasVisual = !!(node.icon || node.emoji)
  const textW = node.title.length * fontSize * 0.64 + 24
  const total = hasVisual ? Math.ceil(textW / 0.78) : textW
  const min = depth === 1 ? 100 : depth === 2 ? 80 : 60
  return Math.max(min, Math.min(360, Math.ceil(total)))
}

function placeSubtree(
  nodeId: string,
  depth: number,
  cx: number,
  cy: number,
  angle: number,        // direction from parent
  arcSpread: number,    // total arc available to this subtree
  nodes: IdeaNode[],
  result: IdeaNode[],
) {
  const node = nodes.find(n => n.id === nodeId)
  if (!node) return

  const fontSize = FONT_SIZES[depth] ?? DEFAULT_FONT_SIZE
  const w = autoW(node, depth)
  const h = depth === 1 ? 40 : depth === 2 ? 32 : 28

  if (!node.manuallyPositioned) {
    result.push({ ...node, x: cx - w / 2, y: cy - h / 2, width: w, height: h, fontSize })
  } else {
    result.push(node)
  }

  const children = nodes
    .filter(n => n.parentId === nodeId)
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))

  if (children.length === 0) return

  const extra = depth === 1 ? L1_EXTRA : L2_EXTRA
  const childR = extra + Math.max(w, h) / 2
  const totalSpread = Math.max(arcSpread, children.length * V_SPREAD)
  const step = totalSpread / Math.max(children.length - 1, 1)
  const startAngle = children.length === 1 ? angle : angle - totalSpread / 2

  children.forEach((child, i) => {
    const childAngle = children.length === 1 ? angle : startAngle + i * step
    const childCX = cx + childR * Math.cos(childAngle)
    const childCY = cy + childR * Math.sin(childAngle)
    placeSubtree(child.id, depth + 1, childCX, childCY, childAngle, totalSpread / Math.max(children.length, 1), nodes, result)
  })
}

export function computeMindmapLayout(nodes: IdeaNode[]): IdeaNode[] {
  const root = nodes.find(n => n.parentId === null)
  if (!root) return nodes

  const rw = root.width > 0 && root.width === root.height ? root.width : 160
  const rh = rw
  const cx = 0
  const cy = 0

  const result: IdeaNode[] = []
  if (!root.manuallyPositioned) {
    result.push({ ...root, x: cx - rw / 2, y: cy - rh / 2, width: rw, height: rh })
  } else {
    result.push(root)
  }

  const l1s = nodes
    .filter(n => n.parentId === root.id)
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))

  if (l1s.length === 0) return result

  const angleStep = (2 * Math.PI) / l1s.length
  const startAngle = -Math.PI / 2  // start at top

  l1s.forEach((l1, i) => {
    const angle = startAngle + i * angleStep
    const l1CX = cx + (rw / 2 + ROOT_RADIUS) * Math.cos(angle)
    const l1CY = cy + (rh / 2 + ROOT_RADIUS) * Math.sin(angle)
    placeSubtree(l1.id, 1, l1CX, l1CY, angle, angleStep * 0.85, nodes, result)
  })

  const placed = new Set(result.map(n => n.id))
  for (const n of nodes) {
    if (!placed.has(n.id)) result.push(n)
  }

  return result
}
