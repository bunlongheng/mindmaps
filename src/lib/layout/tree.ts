import type { MindmapNode } from '../../types'

const H_GAP = 60   // vertical gap between parent row and child row
const V_GAP = 16   // horizontal gap between sibling subtrees

const TREE_H: Record<number, number> = { 0: 180, 1: 42,  2: 36,  3: 32  }

/** Auto-size width from title */
function tw(node: MindmapNode): number {
  if (node.depth === 0) return 180
  const fontSize = node.depth === 1 ? 22 : node.depth === 2 ? 16 : 13
  const charW = fontSize * 0.64
  const pad = 24
  const iconW = (node.icon || node.emoji) ? 44 : 0
  const textW = Math.ceil(node.title.length * charW) + pad + iconW
  const min = node.depth === 1 ? 140 : node.depth === 2 ? 120 : 100
  return Math.max(min, Math.min(400, textW))
}
function th(node: MindmapNode) { return TREE_H[Math.min(node.depth, 3)] ?? 28 }

interface TreeNode {
  node: MindmapNode
  children: TreeNode[]
  subtreeW: number
  x: number
  y: number
}

function buildTree(nodes: MindmapNode[], parentId: string | null): TreeNode[] {
  return nodes
    .filter(n => n.parentId === parentId)
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
    .map(n => ({ node: n, children: buildTree(nodes, n.id), subtreeW: 0, x: 0, y: 0 }))
}

function computeSubtreeW(t: TreeNode): number {
  const w = tw(t.node)
  if (t.children.length === 0) {
    t.subtreeW = w
  } else {
    const total = t.children.reduce((s, c) => s + computeSubtreeW(c) + V_GAP, -V_GAP)
    t.subtreeW = Math.max(w, total)
  }
  return t.subtreeW
}

function assignPositions(t: TreeNode, x: number, y: number) {
  const w = tw(t.node)
  const h = th(t.node)
  t.x = x + (t.subtreeW - w) / 2
  t.y = y
  let cx = x
  for (const child of t.children) {
    assignPositions(child, cx, y + h + H_GAP)
    cx += child.subtreeW + V_GAP
  }
}

function flatten(t: TreeNode, out: MindmapNode[]) {
  if (!t.node.manuallyPositioned) {
    out.push({ ...t.node, x: t.x, y: t.y, width: tw(t.node), height: th(t.node) })
  } else {
    out.push(t.node)
  }
  for (const c of t.children) flatten(c, out)
}

export function computeTreeLayout(nodes: MindmapNode[], direction: 'vertical' | 'horizontal' = 'vertical'): MindmapNode[] {
  const tree = buildTree(nodes, null)
  if (tree.length === 0) return nodes
  const root = tree[0]
  computeSubtreeW(root)
  assignPositions(root, 400 - root.subtreeW / 2, 60)
  const result: MindmapNode[] = []
  flatten(root, result)
  if (direction === 'horizontal') {
    return result.map(n => ({ ...n, x: n.y, y: n.x }))
  }
  return result
}
