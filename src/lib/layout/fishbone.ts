import type { MindmapNode } from '../../types/index.js'
import { displayTitle } from '../links.js'
import { shapedNodeSize } from '../nodeShape.js'
import { nodeFontSize, nodeHeight, nodeMinWidth, nodeWidth, CHAR_W_RATIO } from '../nodeMetrics.js'

export const FISHBONE_SLANT = 90

const SPINE_Y = 400
const ROOT_X = 120
// The root keeps its own bone-anchor height; every other depth comes from the shared
// box table (src/lib/nodeMetrics).
const ROOT_H = 80

// Fishbone L1/L2/L3 boxes render as slanted parallelograms (Node.tsx: sk = height * 0.35).
// Raised from the old 500px clamp so a long title grows the box instead of getting clipped.
const MAX_AUTO_W = 1200

let measureCtx: CanvasRenderingContext2D | null | undefined
function getMeasureCtx(): CanvasRenderingContext2D | null {
  if (measureCtx !== undefined) return measureCtx
  if (typeof document === 'undefined') { measureCtx = null; return measureCtx }
  try {
    measureCtx = document.createElement('canvas').getContext('2d')
  } catch {
    measureCtx = null
  }
  return measureCtx
}

const measureCache = new Map<string, number>()

// Font-loading race: the canvas may measure with fallback system-ui metrics before the
// Inter webfont finishes loading, caching a too-narrow width for the life of the page.
// Smallest correct fix: clear the cache once the font is confirmed ready, so the next
// layout re-measures with the real Inter metrics. Guarded because jsdom has no
// `document.fonts`, and because `document` itself is absent outside the browser.
if (typeof document !== 'undefined' && document.fonts && typeof document.fonts.ready?.then === 'function') {
  document.fonts.ready.then(() => { measureCache.clear() }).catch(() => {})
}

/** Mirrors Node.tsx's `fontWeight` expression exactly, so measurement can't drift from render. */
export function fontWeightFor(depth: number, bold: boolean): string {
  return bold ? '700' : (depth === 0 ? '500' : depth === 1 ? '500' : '400')
}

/**
 * Real glyph width via a cached canvas 2d context, matching the font Node.tsx renders.
 * Falls back to the old per-char estimate when no canvas 2d context is available
 * (e.g. jsdom in tests), so this never throws.
 */
function measureTitleWidth(title: string, fontSize: number, fontWeight: string): number {
  const key = `${fontWeight}|${fontSize}|${title}`
  const cached = measureCache.get(key)
  if (cached !== undefined) return cached
  const ctx = getMeasureCtx()
  let width: number
  if (ctx) {
    ctx.font = `${fontWeight} ${fontSize}px Inter, system-ui, sans-serif`
    width = ctx.measureText(title).width
  } else {
    width = title.length * fontSize * CHAR_W_RATIO
  }
  measureCache.set(key, width)
  return width
}

/** Auto-size node width from the title's real measured width */
/** Box height at a depth: the root anchors the spine, the rest read the shared table. */
export function boxH(depth: number): number {
  return depth === 0 ? ROOT_H : nodeHeight(depth)
}

export function autoW(title: string, depth: number, hasIcon: boolean, bold = false): number {
  const fontSize = nodeFontSize(depth)
  const height = boxH(depth)
  const fontWeight = fontWeightFor(depth, bold)
  // Measure what the user sees: a title carrying a markdown link renders as the label
  // alone, so measuring the raw text would size the box to invisible characters.
  const measured = measureTitleWidth(displayTitle(title), fontSize, fontWeight)
  // Root isn't slanted (Node.tsx: isFishboneNode = depth >= 1); L1/L2/L3 are, so reserve
  // the same skew amount as extra width to keep the last glyph clear of the diagonal edge.
  const slant = depth === 0 ? 0 : height * 0.35
  const w = nodeWidth(measured, depth, { hasIcon, height, extra: slant })
  return Math.max(nodeMinWidth(depth), Math.min(MAX_AUTO_W, w))
}
const SPINE_SEG = 340         // horizontal gap between L1 attachment points
const BONE_HEIGHT_BASE = 260  // minimum vertical distance from spine to L1 tip
const L2_MIN_SPACING = 56     // minimum vertical gap between L2 nodes on the diagonal

export function computeFishboneLayout(nodes: MindmapNode[]): MindmapNode[] {
  const root = nodes.find(n => n.parentId === null)
  if (!root) return nodes

  const l1s = nodes.filter(n => n.parentId === root.id)
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))

  const result: MindmapNode[] = []
  const rootW = autoW(root.title, 0, !!(root.icon || root.emoji), !!root.bold)
  result.push({ ...root, x: ROOT_X, y: SPINE_Y - ROOT_H / 2, width: rootW, height: ROOT_H, manuallyPositioned: false })

  const spineOriginX = ROOT_X + rootW

  l1s.forEach((l1, i) => {
    const above = i % 2 === 0
    const attachX = spineOriginX + (i + 1) * SPINE_SEG

    const l2s = nodes.filter(n => n.parentId === l1.id)
      .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
    const n2 = l2s.length

    // Grow bone height so L2 nodes never overlap — need n2 * L2_MIN_SPACING minimum
    const boneHeight = Math.max(BONE_HEIGHT_BASE, n2 * L2_MIN_SPACING + 40)

    const l1CX = attachX + FISHBONE_SLANT
    const l1CY = above ? SPINE_Y - boneHeight : SPINE_Y + boneHeight
    const { w: l1w, h: l1h } = shapedNodeSize(l1, nodeFontSize(1), autoW(l1.title, 1, !!(l1.icon || l1.emoji), !!l1.bold), boxH(1))

    result.push({
      ...l1,
      x: l1CX - l1w / 2, y: l1CY - l1h / 2,
      width: l1w, height: l1h, manuallyPositioned: false,
    })

    // Effective bone length is from spine to the NEAR EDGE of L1 box
    // (this must match what EdgeLayer draws, so stubs land on the line)
    const boneEdgeH = boneHeight - boxH(1) / 2

    l2s.forEach((l2, j) => {
      // Space evenly along diagonal, furthest from spine first
      const t = (n2 - j) / (n2 + 1)
      const diagX = attachX + FISHBONE_SLANT * t
      const diagY = SPINE_Y + (above ? -1 : 1) * boneEdgeH * t

      const { w: l2w, h: l2h } = shapedNodeSize(l2, nodeFontSize(2), autoW(l2.title, 2, !!(l2.icon || l2.emoji), !!l2.bold), boxH(2))
      const l2X = diagX + 28
      const l2Y = diagY - l2h / 2

      result.push({ ...l2, x: l2X, y: l2Y, width: l2w, height: l2h, manuallyPositioned: false })

      // L3 nodes stack vertically away from the spine (not horizontally)
      const l3s = nodes.filter(n => n.parentId === l2.id)
        .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
      const l3dir = above ? -1 : 1  // stack further from spine
      l3s.forEach((l3, k) => {
        const { w: l3w, h: l3h } = shapedNodeSize(l3, nodeFontSize(3), autoW(l3.title, 3, !!(l3.icon || l3.emoji), !!l3.bold), boxH(3))
        result.push({
          ...l3,
          x: l2X + l2w + 16,
          y: l2Y + l3dir * k * (l3h + 12),
          width: l3w, height: l3h, manuallyPositioned: false,
        })
      })
    })
  })

  return result
}
