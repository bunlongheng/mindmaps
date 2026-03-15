import type { MindNode } from '../../types'

const NODE_W = 160
const NODE_H = 40
const H_GAP = 60
const V_GAP = 24

interface TreeNode {
  node: MindNode
  children: TreeNode[]
  width: number
  x: number
  y: number
}

function buildTree(nodes: MindNode[], parentId: string | null): TreeNode[] {
  return nodes
    .filter(n => n.parentId === parentId)
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
    .map(n => {
      const children = buildTree(nodes, n.id)
      return { node: n, children, width: 0, x: 0, y: 0 }
    })
}

function computeWidth(t: TreeNode): number {
  if (t.children.length === 0) {
    t.width = NODE_W
  } else {
    const total = t.children.reduce((s, c) => s + computeWidth(c) + V_GAP, -V_GAP)
    t.width = Math.max(NODE_W, total)
  }
  return t.width
}

function assignPositions(t: TreeNode, x: number, y: number) {
  t.x = x + (t.width - NODE_W) / 2
  t.y = y
  let cx = x
  for (const child of t.children) {
    assignPositions(child, cx, y + NODE_H + H_GAP)
    cx += child.width + V_GAP
  }
}

function flattenTree(t: TreeNode, result: MindNode[]) {
  if (!t.node.manuallyPositioned) {
    result.push({ ...t.node, x: t.x, y: t.y, width: t.node.width > 0 ? t.node.width : NODE_W, height: t.node.height > 0 ? t.node.height : NODE_H })
  } else {
    result.push(t.node)
  }
  for (const c of t.children) flattenTree(c, result)
}

export function computeTreeLayout(nodes: MindNode[], _direction: 'vertical' | 'horizontal' = 'vertical'): MindNode[] {
  const root = nodes.find(n => n.parentId === null)
  if (!root) return nodes
  const tree = buildTree(nodes, null)
  if (tree.length === 0) return nodes
  const rootTree = tree[0]
  computeWidth(rootTree)
  const startX = 400 - rootTree.width / 2
  assignPositions(rootTree, startX, 60)
  const result: MindNode[] = []
  flattenTree(rootTree, result)
  if (_direction === 'horizontal') {
    return result.map(n => ({ ...n, x: n.y, y: n.x }))
  }
  return result
}
