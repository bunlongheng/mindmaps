import type { IdeaNode } from '../../types'

const SIZES: Record<number, { w: number; h: number }> = {
  0: { w: 180, h: 180 },  // circle: w === h
  1: { w: 320, h: 54 },
}
const DEFAULT_SIZE = { w: 170, h: 38 }
const H_GAPS: Record<number, number> = { 0: 120, 1: 60 }
const DEFAULT_H_GAP = 50
const V_GAP = 22

function getSize(depth: number) { return SIZES[depth] ?? DEFAULT_SIZE }
function getHGap(depth: number) { return H_GAPS[depth] ?? DEFAULT_H_GAP }

/** Effective size: always respect stored node dimensions if set */
function nodeSize(node: IdeaNode, depth: number) {
  const { w, h } = getSize(depth)
  if (depth === 0 && node.width > 0 && node.width === node.height) return { w: node.width, h: node.height }
  if (depth > 0 && node.width > 0) return { w: node.width, h: node.height > 0 ? node.height : h }
  return { w, h }
}

function subtreeH(nodeId: string, depth: number, nodes: IdeaNode[]): number {
  const node = nodes.find(n => n.id === nodeId)
  const children = nodes.filter(n => n.parentId === nodeId)
  const h = node ? nodeSize(node, depth).h : getSize(depth).h
  if (children.length === 0) return h
  const childDepth = depth + 1
  const childrenTotal = children.reduce((sum, c) => sum + subtreeH(c.id, childDepth, nodes), 0)
  return Math.max(h, childrenTotal + (children.length - 1) * V_GAP)
}

/**
 * Place a node and its subtree.
 * goRight=true:  x is the LEFT edge;  children go to the right.
 * goRight=false: x is the RIGHT edge; children go to the left.
 */
function place(
  nodeId: string,
  depth: number,
  x: number,
  centerY: number,
  nodes: IdeaNode[],
  result: IdeaNode[],
  goRight = true,
) {
  const node = nodes.find(n => n.id === nodeId)
  if (!node) return

  const { w, h } = nodeSize(node, depth)
  const nodeX = goRight ? x : x - w

  if (!node.manuallyPositioned) {
    result.push({ ...node, x: nodeX, y: centerY - h / 2, width: w, height: h })
  } else {
    result.push(node)
  }

  const children = nodes
    .filter(n => n.parentId === nodeId)
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
  if (children.length === 0) return

  // For goRight: childAnchorX is the left edge of the child column
  // For goLeft:  childAnchorX is the right edge of the child column
  const childAnchorX = goRight ? nodeX + w + getHGap(depth) : nodeX - getHGap(depth)
  const childDepth = depth + 1
  const totalH =
    children.reduce((sum, c) => sum + subtreeH(c.id, childDepth, nodes), 0) +
    (children.length - 1) * V_GAP

  let curY = centerY - totalH / 2
  for (const child of children) {
    const ch = subtreeH(child.id, childDepth, nodes)
    place(child.id, childDepth, childAnchorX, curY + ch / 2, nodes, result, goRight)
    curY += ch + V_GAP
  }
}

export function computeIdeasLayout(nodes: IdeaNode[]): IdeaNode[] {
  const root = nodes.find(n => n.parentId === null)
  if (!root) return nodes

  const l1s = nodes.filter(n => n.parentId === root.id)
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))

  const ROOT_X = 60
  const centerY = 340
  const { w: rw, h: rh } = nodeSize(root, 0)

  const result: IdeaNode[] = []
  const rootX = root.manuallyPositioned ? root.x : ROOT_X

  // anchorX stays at the original position so L1 column doesn't move
  const anchorX = 200 + rw + (root.branchGap ?? H_GAPS[0])
  const totalH = l1s.reduce((s, l) => s + subtreeH(l.id, 1, nodes), 0) + Math.max(0, l1s.length - 1) * V_GAP
  let curY = centerY - totalH / 2
  for (const l1 of l1s) {
    const h = subtreeH(l1.id, 1, nodes)
    place(l1.id, 1, anchorX, curY + h / 2, nodes, result)
    curY += h + V_GAP
  }

  // Root y always = vertical midpoint of L1 nodes so trunk connects cleanly
  const l1Results = result.filter(n => n.depth === 1)
  const l1MidY = l1Results.length > 0
    ? (Math.min(...l1Results.map(n => n.y + n.height / 2)) + Math.max(...l1Results.map(n => n.y + n.height / 2))) / 2
    : centerY
  result.push({ ...root, x: rootX, y: l1MidY - rh / 2, width: rw, height: rh })

  const placed = new Set(result.map(n => n.id))
  for (const n of nodes) {
    if (!placed.has(n.id)) result.push(n)
  }

  return result
}
