import type { MindmapNode } from '../../types'

const ROOT_RADIUS = 240   // root center → L1 center
const L1_EXTRA   = 120   // L1 center → L2 center
const L2_EXTRA   = 90    // L2 center → L3 center
const MIN_ARC    = 0.52  // minimum arc (radians) reserved per child node

const FONT_SIZES: Record<number, number> = { 1: 18, 2: 13, 3: 11 }
const DEFAULT_FONT_SIZE = 11

function autoW(node: MindmapNode, depth: number): number {
  const fontSize = FONT_SIZES[depth] ?? DEFAULT_FONT_SIZE
  const hasVisual = !!(node.icon || node.emoji) && depth <= 1
  // For L1 with icon/emoji: white square takes full node height, add that + gap
  const iconSquareW = hasVisual && depth === 1 ? L1_H + 10 : 0
  const padding = depth === 1 ? 32 : 24
  const textW = node.title.length * fontSize * 0.64 + padding + iconSquareW
  const min = depth === 1 ? 100 : depth === 2 ? 80 : depth === 3 ? 80 : 70
  return Math.max(min, Math.ceil(textW))
}

const L1_H = 44
const L2_CIRCLE_SIZE = 80

/** Compute circle diameter that fits wrapped text */
function circleForText(title: string, fontSize: number, minSize: number): number {
  const charW = fontSize * 0.64
  const lineH = fontSize * 1.3
  // Target ~8-10 chars per line for compact circles
  const maxLineChars = Math.max(8, Math.ceil(Math.sqrt(title.length * 1.8)))
  const lines = wrapText(title, maxLineChars)
  const widestLine = Math.max(...lines.map(l => l.length * charW))
  const textBlockH = lines.length * lineH
  // Circle must contain the text block: diameter ≥ sqrt(w² + h²) + padding
  const needed = Math.sqrt(widestLine * widestLine + textBlockH * textBlockH) + 20
  return Math.max(minSize, Math.ceil(needed))
}

/** Wrap text into lines of roughly maxChars, breaking on spaces */
export function wrapText(text: string, maxChars: number): string[] {
  const words = text.split(/\s+/)
  const lines: string[] = []
  let cur = ''
  for (const w of words) {
    if (cur && (cur.length + 1 + w.length) > maxChars) {
      lines.push(cur)
      cur = w
    } else {
      cur = cur ? cur + ' ' + w : w
    }
  }
  if (cur) lines.push(cur)
  return lines.length ? lines : [text]
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
  const isCircle = depth >= 2
  const isL1Pill = depth === 1
  // Auto-size circle: wrap text into lines, then size circle to fit
  const minCircle = depth === 2 ? L2_CIRCLE_SIZE : depth === 3 ? 66 : 52
  const circleSize = isCircle ? circleForText(node.title, fontSize, minCircle) : 0
  const w = isL1Pill ? autoW(node, depth) : isCircle ? circleSize : (node.width > 0 ? node.width : autoW(node, depth))
  const h = isL1Pill ? L1_H : isCircle ? circleSize : 44

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
  // Account for the largest child circle size so they don't overlap
  const maxChildSize = Math.max(...children.map(c => {
    const cDepth = depth + 1
    const cFs = FONT_SIZES[cDepth] ?? DEFAULT_FONT_SIZE
    const cTextW = c.title.length * cFs * 0.64
    const cMin = cDepth === 2 ? L2_CIRCLE_SIZE : cDepth === 3 ? 66 : 52
    return cDepth >= 2 ? Math.max(cMin, Math.ceil(cTextW + 24)) : 44
  }))
  const childR = extra + Math.max(w, h) / 2 + maxChildSize / 2

  // Arc this subtree actually uses: at least MIN_ARC per child, at most what was allocated
  const minArc = children.length * MIN_ARC
  const totalArc = Math.max(arcSpread, minArc)

  // Distribute arc EVENLY — equal slice per child regardless of subtree size
  const childArc = totalArc / children.length
  children.forEach((child, i) => {
    const childAngle = (angle - totalArc / 2) + childArc * (i + 0.5)
    const childCX = cx + childR * Math.cos(childAngle)
    const childCY = cy + childR * Math.sin(childAngle)
    placeSubtree(child.id, depth + 1, childCX, childCY, childAngle, childArc, nodes, result)
  })
}

export function computeMindmapLayout(nodes: MindmapNode[]): MindmapNode[] {
  const root = nodes.find(n => n.parentId === null)
  if (!root) return nodes

  // Auto-size root circle to fit text
  const rootFs = 24
  const rootMinSize = 160
  const rw = Math.max(rootMinSize, circleForText(root.title, rootFs, rootMinSize))
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

  // Uniform L1 width: all L1 nodes share the width of the widest one
  const l1UniformW = Math.max(...l1s.map(n => autoW(n, 1)))
  const nodesForLayout = nodes.map(n =>
    l1s.some(l => l.id === n.id) ? { ...n, width: l1UniformW } : n
  )

  const l1PlacementR = rw / 2 + ROOT_RADIUS
  const angleStep = (2 * Math.PI) / l1s.length
  const startAngle = -Math.PI / 2

  l1s.forEach((l1, i) => {
    const angle = startAngle + i * angleStep
    const l1CX = cx + l1PlacementR * Math.cos(angle)
    const l1CY = cy + l1PlacementR * Math.sin(angle)
    placeSubtree(l1.id, 1, l1CX, l1CY, angle, angleStep * 0.88, nodesForLayout, result)
  })

  const placed = new Set(result.map(n => n.id))
  for (const n of nodes) {
    if (!placed.has(n.id)) result.push(n)
  }

  // Resolve overlaps — push apart any nodes that collide
  resolveOverlaps(result)

  return result
}

/** Push overlapping nodes apart iteratively */
function resolveOverlaps(nodes: MindmapNode[], maxPasses = 8) {
  const pad = 8 // minimum gap between nodes
  for (let pass = 0; pass < maxPasses; pass++) {
    let moved = false
    for (let i = 0; i < nodes.length; i++) {
      const a = nodes[i]
      if (a.depth === 0) continue // skip root
      for (let j = i + 1; j < nodes.length; j++) {
        const b = nodes[j]
        if (b.depth === 0) continue
        // Bounding-box overlap check
        const ax = a.x, ay = a.y, aw = a.width + pad, ah = a.height + pad
        const bx = b.x, by = b.y, bw = b.width + pad, bh = b.height + pad
        const overlapX = Math.min(ax + aw, bx + bw) - Math.max(ax, bx)
        const overlapY = Math.min(ay + ah, by + bh) - Math.max(ay, by)
        if (overlapX > 0 && overlapY > 0) {
          // Push apart along the axis of least overlap
          const acx = a.x + a.width / 2, acy = a.y + a.height / 2
          const bcx = b.x + b.width / 2, bcy = b.y + b.height / 2
          let dx = bcx - acx, dy = bcy - acy
          const dist = Math.sqrt(dx * dx + dy * dy) || 1
          dx /= dist; dy /= dist
          const push = Math.min(overlapX, overlapY) / 2 + 2
          // Only move the deeper node (or both if same depth)
          if (a.depth >= b.depth) { a.x -= dx * push; a.y -= dy * push }
          if (b.depth >= a.depth) { b.x += dx * push; b.y += dy * push }
          moved = true
        }
      }
    }
    if (!moved) break
  }
}
