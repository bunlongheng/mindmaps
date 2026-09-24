import type { MindmapNode } from '../types/index.js'

export interface Point { x: number; y: number }
export interface Rect { x: number; y: number; w: number; h: number }

export function nodeRect(n: MindmapNode): Rect {
  return { x: n.x, y: n.y, w: n.width, h: n.height }
}

export function nodeCenterRight(n: MindmapNode): Point {
  return { x: n.x + n.width, y: n.y + n.height / 2 }
}
export function nodeCenterLeft(n: MindmapNode): Point {
  return { x: n.x, y: n.y + n.height / 2 }
}
export function nodeCenterBottom(n: MindmapNode): Point {
  return { x: n.x + n.width / 2, y: n.y + n.height }
}
export function nodeCenterTop(n: MindmapNode): Point {
  return { x: n.x + n.width / 2, y: n.y }
}
export function nodeCenter(n: MindmapNode): Point {
  return { x: n.x + n.width / 2, y: n.y + n.height / 2 }
}

export function buildStraightPath(src: Point, tgt: Point): string {
  return `M ${src.x} ${src.y} L ${tgt.x} ${tgt.y}`
}

export function buildCurvedPath(src: Point, tgt: Point): string {
  const dx = tgt.x - src.x
  const cp1x = src.x + dx * 0.5
  const cp2x = tgt.x - dx * 0.5
  return `M ${src.x} ${src.y} C ${cp1x} ${src.y} ${cp2x} ${tgt.y} ${tgt.x} ${tgt.y}`
}

export function buildOrthogonalPath(src: Point, tgt: Point): string {
  const midX = (src.x + tgt.x) / 2
  return `M ${src.x} ${src.y} H ${midX} V ${tgt.y} H ${tgt.x}`
}

/** Bend on a radial mind map branch, as a fraction of the branch's own length. */
const RADIAL_BEND = 0.12

const rr = (v: number): number => Math.round(v * 100) / 100

export interface BranchPoints { sx: number; sy: number; ex: number; ey: number; ux: number; uy: number; pr: number }

/**
 * Where a radial mind map branch starts and ends: on the parent's edge and on the
 * child's edge, along the line between their centres. `parentW` overrides the
 * parent's stored width for the root, whose drawn circle auto-sizes from its title.
 */
export function radialBranchPoints(parent: MindmapNode, child: MindmapNode, parentW?: number): BranchPoints {
  const pw = parentW ?? parent.width
  const px = parent.x + pw / 2, py = parent.y + parent.height / 2
  const cx = child.x + child.width / 2, cy = child.y + child.height / 2
  const len = Math.hypot(cx - px, cy - py) || 1
  const ux = (cx - px) / len, uy = (cy - py) / len
  // Ellipse perimeter intersection, so an explicitly shaped (non-circle) node is met
  // on its own outline: r = 1/sqrt((ux/a)^2 + (uy/b)^2)
  const edgeR = (w: number, h: number) => {
    const a = w / 2, b = h / 2
    const d = Math.sqrt((ux / a) ** 2 + (uy / b) ** 2)
    return d === 0 ? a : 1 / d
  }
  const pr = edgeR(pw, parent.height)
  const cr = edgeR(child.width, child.height)
  return { sx: px + ux * pr, sy: py + uy * pr, ex: cx - ux * cr, ey: cy - uy * cr, ux, uy, pr }
}

/**
 * Radial mind map branch: a quadratic curve from the parent's edge to the child's
 * edge with a mild, always same-handed bend, so a fan of siblings reads as one
 * organism instead of straight spokes through the centre. Shared by the canvas and
 * the server renderer so a card preview draws the same branch as the opened map.
 */
export function buildRadialBranchPath(parent: MindmapNode, child: MindmapNode, parentW?: number): string {
  const { sx, sy, ex, ey } = radialBranchPoints(parent, child, parentW)
  const qx = (sx + ex) / 2 - (ey - sy) * RADIAL_BEND
  const qy = (sy + ey) / 2 + (ex - sx) * RADIAL_BEND
  return `M ${rr(sx)} ${rr(sy)} Q ${rr(qx)} ${rr(qy)} ${rr(ex)} ${rr(ey)}`
}
