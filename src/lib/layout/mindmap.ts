import type { MindmapNode } from '../../types'

const ROOT_RADIUS = 275   // root center → L1 center (25% longer stems)
const L1_EXTRA   = 160   // L1 center → L2 center
const L2_EXTRA   = 120   // L2 center → L3 center
const MIN_ARC    = 0.52  // minimum arc (radians) reserved per child node

const FONT_SIZES: Record<number, number> = { 1: 18, 2: 13, 3: 11 }
const DEFAULT_FONT_SIZE = 11

function autoW(node: MindmapNode, depth: number): number {
  const fontSize = FONT_SIZES[depth] ?? DEFAULT_FONT_SIZE
  const hasVisual = !!(node.icon || node.emoji) && depth < 2
  const textW = node.title.length * fontSize * 0.64 + 24
  const total = hasVisual ? Math.ceil(textW / 0.78) : textW
  const min = depth === 3 ? 80 : 60
  return Math.max(min, Math.min(320, Math.ceil(total)))
}

const L1_CIRCLE_SIZE = 88
const L2_CIRCLE_SIZE = 60

/** Count total leaf+internal nodes in subtree (used to weight arc allocation) */
function subtreeWeight(nodeId: string, nodes: MindmapNode[]): number {
  const children = nodes.filter(n => n.parentId === nodeId)
  if (children.length === 0) return 1
  return children.reduce((s, c) => s + subtreeWeight(c.id, nodes), 0)
}

function placeSubtree(
  nodeId: string,
  depth: number,
  cx: number,
  cy: number,
  angle: number,
  arcSpread: number,
  nodes: MindmapNode[],
  result: MindmapNode[],
) {
  const node = nodes.find(n => n.id === nodeId)
  if (!node) return

  const fontSize = FONT_SIZES[depth] ?? DEFAULT_FONT_SIZE
  const isCircle = depth === 1 || depth === 2
  const w = isCircle ? (depth === 1 ? L1_CIRCLE_SIZE : L2_CIRCLE_SIZE) : (node.width > 0 ? node.width : autoW(node, depth))
  const h = isCircle ? (depth === 1 ? L1_CIRCLE_SIZE : L2_CIRCLE_SIZE) : (depth <= 3 ? 36 : 30)

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

  // Arc this subtree actually uses: at least MIN_ARC per child, at most what was allocated
  const minArc = children.length * MIN_ARC
  const totalArc = Math.max(arcSpread, minArc)

  // Distribute arc proportionally by subtree weight
  const weights = children.map(c => subtreeWeight(c.id, nodes))
  const totalWeight = weights.reduce((s, w) => s + w, 0)

  let cursor = angle - totalArc / 2
  children.forEach((child, i) => {
    const childArc = (weights[i] / totalWeight) * totalArc
    const childAngle = cursor + childArc / 2
    cursor += childArc
    const childCX = cx + childR * Math.cos(childAngle)
    const childCY = cy + childR * Math.sin(childAngle)
    placeSubtree(child.id, depth + 1, childCX, childCY, childAngle, childArc, nodes, result)
  })
}

export function computeMindmapLayout(nodes: MindmapNode[]): MindmapNode[] {
  const root = nodes.find(n => n.parentId === null)
  if (!root) return nodes

  const rw = root.width > 0 && root.width === root.height ? root.width : 160
  const cx = 0, cy = 0

  const result: MindmapNode[] = []
  if (!root.manuallyPositioned) {
    result.push({ ...root, x: cx - rw / 2, y: cy - rw / 2, width: rw, height: rw })
  } else {
    result.push(root)
  }

  const l1s = nodes
    .filter(n => n.parentId === root.id)
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
  if (l1s.length === 0) return result

  const l1PlacementR = rw / 2 + ROOT_RADIUS
  const angleStep = (2 * Math.PI) / l1s.length
  const startAngle = -Math.PI / 2

  l1s.forEach((l1, i) => {
    const angle = startAngle + i * angleStep
    const l1CX = cx + l1PlacementR * Math.cos(angle)
    const l1CY = cy + l1PlacementR * Math.sin(angle)
    placeSubtree(l1.id, 1, l1CX, l1CY, angle, angleStep * 0.88, nodes, result)
  })

  const placed = new Set(result.map(n => n.id))
  for (const n of nodes) {
    if (!placed.has(n.id)) result.push(n)
  }

  return result
}
