import type { MindmapNode } from '../types'

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
