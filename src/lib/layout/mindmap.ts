import type { MindmapNode } from '../../types/index.js'
import { displayTitle } from '../links.js'
import { computeSubtreeCounts } from '../nodeCounts.js'
import { nodeFontSize, nodeHeight, nodePadX, estimateTextWidth, CHAR_W_RATIO } from '../nodeMetrics.js'

// Radial constellation layout for the Mind Map diagram type.
//
// The whole map reads as one organism instead of a starburst of boxes: the root is a
// big circle in the middle, every depth-1 topic is a circle whose diameter carries the
// weight of its own subtree, depth 2 is a smaller circle and depth 3 and deeper are
// dots. Each topic owns an angular sector sized by how many leaves hang off it, its
// children are spread inside that sector one ring further out, and a short
// deterministic relaxation pass pushes apart anything that still touches.
//
// Nothing here is random and no physics library is involved, so the canvas
// (Node/EdgeLayer) and the server renderer (render-svg) lay a map out identically.
//
// Every node still keeps x, y, width and height, with width === height === diameter,
// so the store and the data model are untouched.

const TAU = Math.PI * 2

/** First topic starts at the top of the ring. */
const START_ANGLE = -Math.PI / 2

/** Smallest sector (radians) a depth-1 topic gets, so a one-node branch still has room. */
export const MIN_SECTOR = 0.3

/** A child never gets less than this fraction of an even split of its parent's sector. */
const CHILD_SECTOR_FLOOR = 0.4

/** Diameter band per depth: [min, max]. Depth 3 and deeper share the dot band. */
export const DIAMETER_BANDS: Readonly<Record<number, readonly [number, number]>> = {
  1: [44, 96],
  2: [22, 36],
  3: [5, 8],
}

/** Smallest root circle, before it grows to fit the title. */
export const ROOT_MIN_DIAMETER = 150

/**
 * Root title size for this type only. The shared box table's root row (ROOT_FONT, 42)
 * is built for a pill that runs across a logic chart; inside a centre circle it would
 * blow the circle up until it dwarfed the topics around it and the weight stopped
 * reading. Both renderers take the root's size from here when the type is 'mindmap'.
 */
export const RADIAL_ROOT_FONT = 26

/** Radius added per ring past depth 1; deeper rings step in tighter. */
const RADIUS_STEP: Readonly<Record<number, number>> = { 2: 130, 3: 84, 4: 66 }
const DEFAULT_RADIUS_STEP = 54

/** Clear space kept around a circle at this depth, used by the rings and the relaxation. */
const CLEARANCE: Readonly<Record<number, number>> = { 0: 40, 1: 50, 2: 22 }
const DEFAULT_CLEARANCE = 8

/** Relaxation passes run after placement. Fixed count, so the result is deterministic. */
export const RELAX_ITERATIONS = 90

// ── Labels ───────────────────────────────────────────────────────────────────
// A radial node's label lives OUTSIDE its circle, so it is part of the node's
// footprint: the relaxation, the viewport fit, the home cards and the share images
// all have to reserve the same box for it. Everything about a label - how long it is
// drawn, which way it points, where the box sits - is decided here once and read by
// the canvas (Node.tsx) and the server renderer (render-svg.ts) alike.

/** Text sizes, in px, for the drawn labels. */
export const LABEL_FONT = { title1: 13, count1: 11, title2: 11 } as const

/**
 * Longest a label is DRAWN before it is cut with an ellipsis. The node keeps its
 * whole title: the full text stays in the data, in the SVG <title> for hover, and
 * is drawn in full while the node is selected.
 */
export const LABEL_MAX_CHARS: Readonly<Record<number, number>> = { 1: 40, 2: 32 }

/** How many characters a depth's label is drawn at; 0 means it carries no label. */
export function labelMaxChars(depth: number): number {
  return LABEL_MAX_CHARS[depth] ?? 0
}

/** Cut `text` to `maxChars`, ellipsis included in the count. */
export function truncateLabel(text: string, maxChars: number): string {
  if (maxChars <= 0 || text.length <= maxChars) return text
  return text.slice(0, Math.max(1, maxChars - 1)).trimEnd() + '\u2026'
}

/** Semibold runs a touch wider than the estimator's regular-weight ratio. */
const BOLD_WIDTH = 1.06

/** Drawn width of a label line. */
export function labelTextWidth(text: string, fontSize: number, bold = false): number {
  return estimateTextWidth(text, fontSize) * (bold ? BOLD_WIDTH : 1)
}

export type LabelSide = 'left' | 'right' | 'above' | 'below'

/** Half-width of the top and bottom bands, where a side label would sit on the branch. */
const VERTICAL_BAND = (20 * Math.PI) / 180

/**
 * Which way a depth-2 label points: always OUTWARD, away from the root. A label on
 * the left half of the map reads right-to-left off its circle instead of pointing
 * back across the branch and over the topic it hangs from. Straight up and straight
 * down keep the label to the right but nudge it clear of the branch line.
 */
export function radialLabelSide(dx: number, dy: number): LabelSide {
  const angle = Math.atan2(dy, dx)          // 0 = right, -PI/2 = straight up
  if (Math.abs(angle + Math.PI / 2) < VERTICAL_BAND) return 'above'
  if (Math.abs(angle - Math.PI / 2) < VERTICAL_BAND) return 'below'
  return dx < 0 ? 'left' : 'right'
}

export interface RadialLabel {
  /** The text actually drawn (already cut to the depth's limit). */
  text: string
  /** Title baseline, in the node's own coordinates (origin at node.x, node.y). */
  tx: number
  ty: number
  anchor: 'start' | 'middle' | 'end'
  /** Baseline of the subtree-count line under a depth-1 name, or null. */
  countY: number | null
  side: LabelSide
  /** Box the label occupies, in the node's own coordinates. */
  box: { x: number; y: number; w: number; h: number }
}

const LINE_H = 14        // one drawn text line, for box purposes
const GAP = 8            // clear space between a circle and a side label

/**
 * The label for one radial node, or null when it carries none (the root, the dots,
 * and any node with an explicit shape, which keeps its own box and inside label).
 * `rcx`/`rcy` are the root's centre - the only thing "outward" can be measured from.
 */
export function radialLabelFor(
  node: MindmapNode,
  rcx: number,
  rcy: number,
  full = false,
): RadialLabel | null {
  if (node.shape) return null
  const max = labelMaxChars(node.depth)
  if (max <= 0) return null
  const raw = displayTitle(node.title)
  const text = full ? raw : truncateLabel(raw, max)
  const d = node.width

  if (node.depth === 1) {
    // The map's own headings stay centred under their circle, name over count.
    const w = labelTextWidth(text, LABEL_FONT.title1, true)
    return {
      text, tx: d / 2, ty: d + 16, anchor: 'middle', countY: d + 31, side: 'below',
      box: { x: d / 2 - w / 2, y: d + 4, w, h: 2 * LINE_H },
    }
  }

  const w = labelTextWidth(text, LABEL_FONT.title2)
  const side = radialLabelSide(node.x + d / 2 - rcx, node.y + node.height / 2 - rcy)
  const midY = node.height / 2
  if (side === 'left') {
    return { text, tx: -GAP, ty: midY + 4, anchor: 'end', countY: null, side,
      box: { x: -GAP - w, y: midY - LINE_H / 2, w, h: LINE_H } }
  }
  if (side === 'above') {
    return { text, tx: d / 2 + 6, ty: -6, anchor: 'start', countY: null, side,
      box: { x: d / 2 + 6, y: -6 - LINE_H + 3, w, h: LINE_H } }
  }
  if (side === 'below') {
    return { text, tx: d / 2 + 6, ty: node.height + 14, anchor: 'start', countY: null, side,
      box: { x: d / 2 + 6, y: node.height + 3, w, h: LINE_H } }
  }
  return { text, tx: d + GAP, ty: midY + 4, anchor: 'start', countY: null, side: 'right',
    box: { x: d + GAP, y: midY - LINE_H / 2, w, h: LINE_H } }
}

export interface Extent { left: number; top: number; right: number; bottom: number }

/** A radial node's drawn extent in world coordinates, its label box included. */
export function radialNodeExtent(node: MindmapNode, rcx: number, rcy: number): Extent {
  const e: Extent = { left: node.x, top: node.y, right: node.x + node.width, bottom: node.y + node.height }
  const label = radialLabelFor(node, rcx, rcy)
  if (!label) return e
  const { x, y, w, h } = label.box
  return {
    left: Math.min(e.left, node.x + x),
    top: Math.min(e.top, node.y + y),
    right: Math.max(e.right, node.x + x + w),
    bottom: Math.max(e.bottom, node.y + y + h),
  }
}

/** Diameter band for a depth (depth 3 and deeper are dots). */
export function diameterBand(depth: number): readonly [number, number] {
  return DIAMETER_BANDS[depth] ?? DIAMETER_BANDS[3]
}

function radiusStep(depth: number): number {
  return RADIUS_STEP[depth] ?? DEFAULT_RADIUS_STEP
}

function clearance(depth: number): number {
  return CLEARANCE[depth] ?? DEFAULT_CLEARANCE
}

/**
 * Circle diameter for a node: its depth picks the band, its descendant count picks
 * where in the band it lands. Square-root scaling so area, not radius, tracks the
 * weight. Monotonic in `descendants` and always inside [min, max].
 */
export function radialDiameter(depth: number, descendants: number, maxDescendants: number): number {
  const [min, max] = diameterBand(depth)
  if (maxDescendants <= 0) return min
  const t = Math.min(1, Math.sqrt(Math.max(0, descendants) / maxDescendants))
  return Math.round(min + (max - min) * t)
}

/**
 * Split `span` radians between siblings by weight, with `minSpan` as a floor so a
 * small subtree still gets room. The floor is capped at an even split (it can never
 * hand out more than there is), and the result is rescaled to fill `span` exactly,
 * which keeps every unfloored sector proportional to its own weight.
 */
export function sectorSpans(weights: number[], span: number, minSpan: number): number[] {
  const n = weights.length
  if (n === 0) return []
  const sum = weights.reduce((s, w) => s + w, 0)
  // All-zero weights carry no proportion, so fall back to an even split.
  const ws = sum > 0 ? weights : weights.map(() => 1)
  const total = sum > 0 ? sum : n
  const floor = Math.min(minSpan, span / n)
  const raw = ws.map(w => Math.max(floor, (w / total) * span))
  const spread = raw.reduce((s, v) => s + v, 0) || 1
  return raw.map(v => (v / spread) * span)
}

/** Glyph size for the single letter drawn inside a circle of this diameter. */
export function initialFontSize(depth: number, diameter: number): number {
  if (depth >= 3) return 0
  return Math.max(10, Math.round(diameter * (depth === 1 ? 0.42 : 0.46)))
}

/** First visible character of a title, for the letter drawn inside a circle. */
export function nodeInitial(rawTitle: string): string {
  const t = displayTitle(rawTitle).trim()
  return t ? t.slice(0, 1).toUpperCase() : ''
}

/** Compute circle diameter that fits wrapped text */
export function circleForText(rawTitle: string, fontSize: number, minSize: number): number {
  const title = displayTitle(rawTitle)
  const charW = fontSize * CHAR_W_RATIO
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

/**
 * Box a node is laid out in. Every mind map node is a circle, so width === height;
 * an explicit `shape` on the node wins, exactly as it does in every other diagram
 * type - 'circle' keeps a square that fits the wrapped label, 'pill' keeps a text
 * box at the depth's own height.
 */
export function radialNodeSize(
  node: MindmapNode,
  descendants: number,
  maxDescendants: number,
): { w: number; h: number } {
  const depth = node.depth
  const fontSize = node.fontSize ?? nodeFontSize(depth)
  if (node.shape === 'circle') {
    const d = circleForText(node.title, fontSize, diameterBand(depth)[0])
    return { w: d, h: d }
  }
  if (node.shape === 'pill') {
    const h = nodeHeight(depth)
    const w = Math.max(h, Math.ceil(estimateTextWidth(node.title, fontSize) + 2 * nodePadX(depth) + h))
    return { w, h }
  }
  const d = radialDiameter(depth, descendants, maxDescendants)
  return { w: d, h: d }
}

/**
 * Push overlapping nodes apart. A radial node's footprint is its circle PLUS its
 * label box, so this separates the combined boxes, not just the circles - otherwise
 * two clear circles still have their sentences lying across each other.
 *
 * Boxes are pulled apart along whichever axis they overlap least, which for wide,
 * short label boxes means they stack vertically instead of fighting the ring. The
 * side a label points is re-read from live positions at the top of every pass, so
 * once the map stops moving the boxes and the drawn labels agree exactly.
 *
 * Fixed iteration count and fixed visit order: two runs on the same map agree. The
 * root and every manually-positioned node are pinned.
 */
export function relaxRadial(placed: MindmapNode[], iterations = RELAX_ITERATIONS): void {
  const root = placed.find(n => n.depth === 0)
  const rcx = root ? root.x + root.width / 2 : 0
  const rcy = root ? root.y + root.height / 2 : 0
  const movable = placed.map(n => n.depth > 0 && !n.manuallyPositioned)
  if (!movable.some(Boolean)) return

  const boxes = placed.map(() => ({ x: 0, y: 0, w: 0, h: 0 }))
  const remeasure = (i: number) => {
    const n = placed[i]
    const e = radialNodeExtent(n, rcx, rcy)
    const p = clearance(n.depth) / 2
    boxes[i].x = e.left - p
    boxes[i].y = e.top - p
    boxes[i].w = (e.right - e.left) + 2 * p
    boxes[i].h = (e.bottom - e.top) + 2 * p
  }

  for (let pass = 0; pass < iterations; pass++) {
    for (let i = 0; i < placed.length; i++) remeasure(i)
    let moved = false
    for (let i = 0; i < placed.length; i++) {
      for (let j = i + 1; j < placed.length; j++) {
        if (!movable[i] && !movable[j]) continue
        const a = boxes[i], b = boxes[j]
        const ox = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)
        if (ox <= 0) continue
        const oy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y)
        if (oy <= 0) continue
        // Separate along the shallower axis; ties break on Y, so stacked labels
        // slide apart vertically rather than drifting round the ring.
        let px = 0, py = 0
        if (ox < oy) px = (b.x + b.w / 2) >= (a.x + a.w / 2) ? ox : -ox
        else py = (b.y + b.h / 2) >= (a.y + a.h / 2) ? oy : -oy
        const share = movable[i] && movable[j] ? 0.5 : 1
        if (movable[i]) {
          placed[i].x -= px * share; placed[i].y -= py * share
          a.x -= px * share; a.y -= py * share
        }
        if (movable[j]) {
          placed[j].x += px * share; placed[j].y += py * share
          b.x += px * share; b.y += py * share
        }
        moved = true
      }
    }
    if (!moved) return
  }
}

export function computeMindmapLayout(nodes: MindmapNode[]): MindmapNode[] {
  const root = nodes.find(n => n.parentId === null)
  if (!root) return nodes

  const { descendantCounts } = computeSubtreeCounts(nodes)
  const desc = (id: string) => descendantCounts.get(id) ?? 0

  const childrenOf = new Map<string, MindmapNode[]>()
  for (const n of nodes) {
    if (!n.parentId) continue
    const arr = childrenOf.get(n.parentId)
    if (arr) arr.push(n)
    else childrenOf.set(n.parentId, [n])
  }
  for (const arr of childrenOf.values()) arr.sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))

  // Heaviest subtree at each depth sets that depth's diameter scale, so the biggest
  // topic reaches the top of its band and everything else reads against it.
  const maxDescByDepth = new Map<number, number>()
  for (const n of nodes) {
    if (n.depth <= 0) continue
    maxDescByDepth.set(n.depth, Math.max(maxDescByDepth.get(n.depth) ?? 0, desc(n.id)))
  }
  const sizeOf = (n: MindmapNode) => radialNodeSize(n, desc(n.id), maxDescByDepth.get(n.depth) ?? 0)

  // Leaves carried by a subtree - the weight an angular sector is shared out by.
  const leafCache = new Map<string, number>()
  const leaves = (id: string): number => {
    const hit = leafCache.get(id)
    if (hit !== undefined) return hit
    const kids = childrenOf.get(id) ?? []
    const v = kids.length === 0 ? 1 : kids.reduce((s, k) => s + leaves(k.id), 0)
    leafCache.set(id, v)
    return v
  }

  const result: MindmapNode[] = []
  const rootFs = root.fontSize ?? RADIAL_ROOT_FONT
  const rootD = Math.max(ROOT_MIN_DIAMETER, circleForText(root.title, rootFs, ROOT_MIN_DIAMETER))
  result.push(root.manuallyPositioned
    ? root
    : { ...root, x: -rootD / 2, y: -rootD / 2, width: rootD, height: rootD })

  const reachable = nodes.filter(n => n.depth > 0 && n.id !== root.id)
  if (childrenOf.get(root.id)?.length) {
    // ── Ring radius per depth ────────────────────────────────────────────────
    // Each ring is pushed out far enough that every circle on it fits round the
    // circumference, then at least one radius step past the ring inside it.
    const deepest = Math.max(...reachable.map(n => n.depth), 1)
    const ringR: number[] = [0]
    for (let d = 1; d <= deepest; d++) {
      const atDepth = nodes.filter(n => n.depth === d)
      const needed = atDepth.reduce((s, n) => s + sizeOf(n).w + clearance(d), 0) / TAU
      const base = d === 1
        ? rootD / 2 + clearance(0) + radiusStep(2) * 0.8
        : ringR[d - 1] + radiusStep(d)
      ringR[d] = Math.max(base, needed)
    }

    // ── Angular sector per node ──────────────────────────────────────────────
    const angleOf = new Map<string, number>()
    const assign = (parentId: string, depth: number, start: number, span: number) => {
      const kids = childrenOf.get(parentId) ?? []
      if (kids.length === 0) return
      const floor = depth === 0 ? MIN_SECTOR : (span / kids.length) * CHILD_SECTOR_FLOOR
      const spans = sectorSpans(kids.map(k => leaves(k.id)), span, floor)
      let a = start
      kids.forEach((kid, i) => {
        angleOf.set(kid.id, a + spans[i] / 2)
        assign(kid.id, depth + 1, a, spans[i])
        a += spans[i]
      })
    }
    assign(root.id, 0, START_ANGLE, TAU)

    for (const n of nodes) {
      const angle = angleOf.get(n.id)
      if (angle === undefined) continue
      if (n.manuallyPositioned) { result.push(n); continue }
      const { w, h } = sizeOf(n)
      const r = ringR[Math.min(n.depth, ringR.length - 1)] ?? 0
      result.push({
        ...n,
        x: Math.cos(angle) * r - w / 2,
        y: Math.sin(angle) * r - h / 2,
        width: w,
        height: h,
      })
    }

    relaxRadial(result)
  }

  const placed = new Set(result.map(n => n.id))
  for (const n of nodes) {
    if (!placed.has(n.id)) result.push(n)
  }

  return result
}
