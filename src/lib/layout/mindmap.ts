import type { MindNode } from '../../types'

const NODE_W = 160
const NODE_H = 40
const LEVEL_RADIUS = 220
const MIN_ANGULAR_GAP = Math.PI / 12

interface PolarNode {
  node: MindNode
  children: PolarNode[]
  span: number
  angle: number
}

function buildPolar(nodes: MindNode[], parentId: string | null): PolarNode[] {
  return nodes
    .filter(n => n.parentId === parentId)
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
    .map(n => {
      const children = buildPolar(nodes, n.id)
      return { node: n, children, span: 0, angle: 0 }
    })
}

function computeSpan(p: PolarNode): number {
  if (p.children.length === 0) {
    p.span = MIN_ANGULAR_GAP
  } else {
    p.span = p.children.reduce((s, c) => s + computeSpan(c), 0)
  }
  return p.span
}

function assignAngles(p: PolarNode, startAngle: number, cx: number, cy: number) {
  p.angle = startAngle + p.span / 2
  let cur = startAngle
  for (const child of p.children) {
    assignAngles(child, cur, cx, cy)
    cur += child.span
  }
}

function polarToCartesian(angle: number, depth: number, cx: number, cy: number) {
  const r = depth * LEVEL_RADIUS
  return { x: cx + r * Math.cos(angle) - NODE_W / 2, y: cy + r * Math.sin(angle) - NODE_H / 2 }
}

function flattenPolar(p: PolarNode, cx: number, cy: number, result: MindNode[]) {
  if (!p.node.manuallyPositioned) {
    const pos = polarToCartesian(p.angle, p.node.depth, cx, cy)
    result.push({ ...p.node, x: pos.x, y: pos.y, width: NODE_W, height: NODE_H })
  } else {
    result.push(p.node)
  }
  for (const c of p.children) flattenPolar(c, cx, cy, result)
}

export function computeMindmapLayout(nodes: MindNode[]): MindNode[] {
  const root = nodes.find(n => n.parentId === null)
  if (!root) return nodes
  const cx = 500, cy = 350
  const polars = buildPolar(nodes, null)
  if (polars.length === 0) return nodes
  const rootPolar = polars[0]
  computeSpan(rootPolar)
  assignAngles(rootPolar, 0, cx, cy)
  const result: MindNode[] = []
  result.push({ ...root, x: cx - NODE_W / 2, y: cy - NODE_H / 2, width: NODE_W, height: NODE_H })
  for (const c of rootPolar.children) flattenPolar(c, cx, cy, result)
  return result
}
