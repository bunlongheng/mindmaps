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

/** A manual node keeps the width the user dragged; everyone else auto-sizes from title. */
function boxW(node: MindmapNode, depth: number, hasIcon: boolean, bold: boolean): number {
  if (node.widthMode === 'manual' && node.width > 0) return node.width
  return autoW(node.title, depth, hasIcon, bold)
}
const SPINE_SEG = 340         // horizontal gap between L1 attachment points
const BONE_HEIGHT_BASE = 260  // minimum vertical distance from spine to L1 tip
const L2_GAP = 24             // minimum vertical gap between reserved L2 slots on the diagonal
const L3_GAP = 12             // vertical gap between stacked L3 boxes

/**
 * Reserved vertical slot for an L2 and its L3 stack: at least the L2's own height, or
 * the L3 block's height when that is taller, so neighbouring L2 slots on the same bone
 * never collide (root cause of the old overlap: L2 pitch ignored how many L3 children
 * hung off each one).
 */
function l2Slot(l2: MindmapNode, nodes: MindmapNode[]) {
  const { w: l2w, h: l2h } = shapedNodeSize(l2, nodeFontSize(2), boxW(l2, 2, !!(l2.icon || l2.emoji), !!l2.bold), boxH(2))
  const l3s = nodes.filter(n => n.parentId === l2.id)
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
  const l3Sizes = l3s.map(l3 => shapedNodeSize(l3, nodeFontSize(3), boxW(l3, 3, !!(l3.icon || l3.emoji), !!l3.bold), boxH(3)))
  const l3Total = l3Sizes.reduce((sum, sz) => sum + sz.h, 0) + Math.max(0, l3s.length - 1) * L3_GAP
  return { l2w, l2h, l3s, l3Sizes, l3Total, slotH: Math.max(l2h, l3Total) }
}

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
    const slots = l2s.map(l2 => l2Slot(l2, nodes))

    // Bottom-up: the bone needs at least the sum of every L2's reserved slot (its own
    // box, or its taller L3 stack) plus a gap around and between each. If that exceeds
    // the old minimum, push the L1 head further out rather than let slots overlap.
    const boneEdgeHMin = BONE_HEIGHT_BASE - boxH(1) / 2
    const slotTotal = slots.reduce((sum, s) => sum + s.slotH, 0)
    const need = slotTotal + (n2 + 1) * L2_GAP
    const boneEdgeH = Math.max(boneEdgeHMin, need)
    const pad = n2 > 0 ? (boneEdgeH - slotTotal) / (n2 + 1) : boneEdgeH

    const boneHeight = boneEdgeH + boxH(1) / 2
    const l1CX = attachX + FISHBONE_SLANT
    const l1CY = above ? SPINE_Y - boneHeight : SPINE_Y + boneHeight
    const { w: l1w, h: l1h } = shapedNodeSize(l1, nodeFontSize(1), boxW(l1, 1, !!(l1.icon || l1.emoji), !!l1.bold), boxH(1))

    result.push({
      ...l1,
      x: l1CX - l1w / 2, y: l1CY - l1h / 2,
      width: l1w, height: l1h, manuallyPositioned: false,
    })

    // Offset of each L2's diagonal anchor measured from the L1 tip end of the bone,
    // stacked so reserved slots never touch.
    let cum = pad
    const centerFromTip: number[] = []
    for (let j = 0; j < n2; j++) {
      cum += slots[j].slotH / 2
      centerFromTip.push(cum)
      cum += slots[j].slotH / 2 + pad
    }

    l2s.forEach((l2, j) => {
      // Furthest from spine first, same order the diagonal always used.
      const t = (boneEdgeH - centerFromTip[j]) / boneEdgeH
      const diagX = attachX + FISHBONE_SLANT * t
      const diagY = SPINE_Y + (above ? -1 : 1) * boneEdgeH * t

      const { l2w, l2h, l3s, l3Sizes, l3Total } = slots[j]
      const l2X = diagX + 28
      const l2Y = diagY - l2h / 2

      result.push({ ...l2, x: l2X, y: l2Y, width: l2w, height: l2h, manuallyPositioned: false })

      // L3 nodes stack vertically to the right of L2, centred on its own diagonal
      // anchor so the block clears L2's own box and never lands in a neighbour's slot.
      // Placed furthest-from-spine first, same "away from spine" order as before.
      const stackOrder = above ? [...l3s].reverse().map((l3, idx) => ({ l3, size: l3Sizes[l3Sizes.length - 1 - idx] })) : l3s.map((l3, idx) => ({ l3, size: l3Sizes[idx] }))
      let l3Top = diagY - l3Total / 2
      for (const { l3, size } of stackOrder) {
        result.push({
          ...l3,
          x: l2X + l2w + 16,
          y: l3Top,
          width: size.w, height: size.h, manuallyPositioned: false,
        })
        l3Top += size.h + L3_GAP
      }
    })
  })

  return result
}
