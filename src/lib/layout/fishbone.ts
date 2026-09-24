import type { MindmapNode } from '../../types/index.js'

export const FISHBONE_SLANT = 90

const SPINE_Y = 400
const ROOT_X = 120
const ROOT_H = 54
const L1_H = 44
const L2_H = 36
const L3_H = 30

// Horizontal padding around the measured text: 16px clear space on each side
// (comfortably over the 14px floor), so glyphs never touch the box edge.
const TEXT_PAD = 32
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
    width = title.length * fontSize * 0.64
  }
  measureCache.set(key, width)
  return width
}

/** Auto-size node width from the title's real measured width */
export function autoW(title: string, depth: number, hasIcon: boolean, bold = false): number {
  const fontSize = depth === 0 ? 28 : depth === 1 ? 22 : depth === 2 ? 16 : 13
  const height = depth === 0 ? ROOT_H : depth === 1 ? L1_H : depth === 2 ? L2_H : L3_H
  const fontWeight = fontWeightFor(depth, bold)
  const measured = measureTitleWidth(title, fontSize, fontWeight)
  // Root isn't slanted (Node.tsx: isFishboneNode = depth >= 1); L1/L2/L3 are, so reserve
  // the same skew amount as extra width to keep the last glyph clear of the diagonal edge.
  const slant = depth === 0 ? 0 : height * 0.35
  // Icon badge is a node.height square plus a 14px gap before the text (matches Node.tsx).
  const iconZone = hasIcon ? height + 14 : 0
  const textW = Math.ceil(measured) + TEXT_PAD + iconZone + slant
  const min = depth === 0 ? 200 : depth === 1 ? 160 : depth === 2 ? 130 : 110
  return Math.max(min, Math.min(MAX_AUTO_W, textW))
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
    const l1w = autoW(l1.title, 1, !!(l1.icon || l1.emoji), !!l1.bold)

    result.push({
      ...l1,
      x: l1CX - l1w / 2, y: l1CY - L1_H / 2,
      width: l1w, height: L1_H, manuallyPositioned: false,
    })

    // Effective bone length is from spine to the NEAR EDGE of L1 box
    // (this must match what EdgeLayer draws, so stubs land on the line)
    const boneEdgeH = boneHeight - L1_H / 2

    l2s.forEach((l2, j) => {
      // Space evenly along diagonal, furthest from spine first
      const t = (n2 - j) / (n2 + 1)
      const diagX = attachX + FISHBONE_SLANT * t
      const diagY = SPINE_Y + (above ? -1 : 1) * boneEdgeH * t

      const l2w = autoW(l2.title, 2, !!(l2.icon || l2.emoji), !!l2.bold)
      const l2h = L2_H
      const l2X = diagX + 28
      const l2Y = diagY - l2h / 2

      result.push({ ...l2, x: l2X, y: l2Y, width: l2w, height: l2h, manuallyPositioned: false })

      // L3 nodes stack vertically away from the spine (not horizontally)
      const l3s = nodes.filter(n => n.parentId === l2.id)
        .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
      const l3dir = above ? -1 : 1  // stack further from spine
      l3s.forEach((l3, k) => {
        const l3w = autoW(l3.title, 3, !!(l3.icon || l3.emoji), !!l3.bold)
        const l3h = L3_H
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
