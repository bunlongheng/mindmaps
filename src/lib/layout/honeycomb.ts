import type { MindmapNode } from '../../types/index.js'
import { sectorSpans, MIN_SECTOR } from './mindmap.js'
import { computeSubtreeCounts } from '../nodeCounts.js'
import { hexRadius, hexCellRadius, combSizeOf, combStyleOf, meshCellRadius, axialToCenter, hexDistance, HEX_DIRS } from '../hex.js'

// Honeycomb layout: every node is a hexagon cell, the root sits at the centre, its
// depth-1 topics fan out around it by angular sector (weighted by subtree size, same
// idea as the mind map), and every subtree owns a slice of its parent's sector. Each
// depth sits on its own ring around the root, and a ring is pushed out until the
// narrowest slice on it still fits a cell, so branches never cross or pile up and the
// connectors fan outward evenly.
//
// Every node keeps x, y, width and height, with width === height === 2 * hexCellRadius(node)
// and x, y the TOP-LEFT of that square (centre = x + width / 2), exactly like every
// other layout in this app. Manually positioned nodes keep their own x, y, width and
// height untouched, same as computeMindmapLayout.

const TAU = Math.PI * 2
const START_ANGLE = -Math.PI / 2
/** Narrowest slice a deeper node may get; its ring grows instead of squeezing cells together. */
const CHILD_MIN_SECTOR = 0.12
/** Radial breathing room: root to the first ring, then between rings, and between neighbours on a ring. */
const RING_GAP_1 = 36
const RING_GAP = 26
const CELL_GAP = 8

export function computeHoneycombLayout(nodes: MindmapNode[]): MindmapNode[] {
  return combStyleOf(nodes) === 'mesh' ? computeMeshLayout(nodes) : computeWebLayout(nodes)
}

/**
 * Mesh: every node is an equal cell on a pointy-top lattice, tiled edge to edge with no
 * connector lines. The root sits at the origin, each depth-1 topic takes the free cell
 * beside the root nearest its own compass angle, and every deeper node takes a free cell
 * touching its parent (or, once the parent is boxed in, touching its own branch) that
 * leans toward that branch's angle, so each branch grows outward as 1 contiguous patch
 * and the hierarchy is read from adjacency and colour alone.
 */
function computeMeshLayout(nodes: MindmapNode[]): MindmapNode[] {
  const root = nodes.find(n => n.parentId === null)
  if (!root) return nodes
  const size = combSizeOf(nodes)
  const R = meshCellRadius(nodes, size)
  const byId = new Map(nodes.map(n => [n.id, n]))
  const childrenOf = new Map<string, MindmapNode[]>()
  for (const n of nodes) {
    if (!n.parentId) continue
    const arr = childrenOf.get(n.parentId)
    if (arr) arr.push(n); else childrenOf.set(n.parentId, [n])
  }
  for (const arr of childrenOf.values()) arr.sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))

  const occupied = new Set<string>()
  const cellOf = new Map<string, readonly [number, number]>()
  const key = (q: number, r: number) => `${q},${r}`
  const take = (id: string, q: number, r: number) => { occupied.add(key(q, r)); cellOf.set(id, [q, r]) }
  take(root.id, 0, 0)

  // Each depth-1 topic owns a compass angle; its whole branch leans that way.
  const l1s = childrenOf.get(root.id) ?? []
  const angleOf = new Map<string, number>()
  l1s.forEach((l1, i) => angleOf.set(l1.id, START_ANGLE + (i / Math.max(1, l1s.length)) * TAU))
  const branchOf = new Map<string, string>()
  const stamp = (n: MindmapNode, l1: string) => { branchOf.set(n.id, l1); for (const c of childrenOf.get(n.id) ?? []) stamp(c, l1) }
  for (const l1 of l1s) stamp(l1, l1.id)

  const angleDiff = (a: number, b: number) => { const d = Math.abs(((a - b) % TAU + TAU) % TAU); return Math.min(d, TAU - d) }
  const cellAngle = (q: number, r: number) => { const c = axialToCenter(q, r, 1); return Math.atan2(c.y, c.x) }
  const freeNeighbours = (q: number, r: number) => HEX_DIRS.map(([dq, dr]) => [q + dq, r + dr] as const).filter(([a, b]) => !occupied.has(key(a, b)))

  const place = (n: MindmapNode) => {
    const parent = n.parentId ? byId.get(n.parentId) : undefined
    const pc = parent ? cellOf.get(parent.id) : undefined
    if (!pc) return
    const angle = angleOf.get(branchOf.get(n.id) ?? '') ?? 0
    const parentRing = hexDistance(0, 0, pc[0], pc[1])
    // Behind the parent first: free cells touching it that sit 1 ring further out, so a
    // node's children line up on its far side and the wedge behind it is its subtree.
    let candidates = freeNeighbours(pc[0], pc[1]).filter(([a, b]) => hexDistance(0, 0, a, b) > parentRing)
    // Its far side is full: any free wall of the parent still keeps the child touching it.
    if (!candidates.length) candidates = freeNeighbours(pc[0], pc[1]).filter(([a, b]) => hexDistance(0, 0, a, b) >= parentRing)
    if (!candidates.length) {
      // Every wall of the parent is taken: beside a sibling already placed behind it, still outward.
      const seen = new Set<string>()
      for (const sib of childrenOf.get(parent!.id) ?? []) {
        const sc = cellOf.get(sib.id)
        if (!sc) continue
        for (const f of freeNeighbours(sc[0], sc[1])) {
          if (hexDistance(0, 0, f[0], f[1]) <= parentRing) continue
          const k = key(f[0], f[1]); if (!seen.has(k)) { seen.add(k); candidates.push(f) }
        }
      }
    }
    if (!candidates.length) candidates = freeNeighbours(pc[0], pc[1])
    if (!candidates.length) {
      // Parent boxed in: grow from any cell of the same branch, nearest the parent first.
      const branch = branchOf.get(n.id)
      const seen = new Set<string>()
      for (const [id, c] of cellOf) {
        if (branchOf.get(id) !== branch) continue
        for (const f of freeNeighbours(c[0], c[1])) { const k = key(f[0], f[1]); if (!seen.has(k)) { seen.add(k); candidates.push(f) } }
      }
    }
    if (!candidates.length) {
      // Nothing free touches the branch (only when the branch is walled in by others):
      // the closest free cell to the parent, searching ring by ring.
      for (let ring = 1; ring < 64 && !candidates.length; ring++) {
        for (let q = -ring; q <= ring; q++) for (let r = -ring; r <= ring; r++) {
          if (hexDistance(0, 0, q, r) !== ring) continue
          const a = pc[0] + q, b = pc[1] + r
          if (!occupied.has(key(a, b))) candidates.push([a, b] as const)
        }
      }
    }
    if (!candidates.length) return
    let best = candidates[0], bestScore = Infinity
    for (const c of candidates) {
      // Nearest the parent first, then straight behind it (the branch angle), then outward.
      const score = hexDistance(c[0], c[1], pc[0], pc[1]) * 1000 + angleDiff(cellAngle(c[0], c[1]), angle) * 100 - hexDistance(0, 0, c[0], c[1]) * 10
      if (score < bestScore) { bestScore = score; best = c }
    }
    take(n.id, best[0], best[1])
  }

  // Depth by depth, so every topic has its first cell before any branch starts to sprawl.
  const maxDepth = nodes.reduce((m, n) => Math.max(m, n.depth), 0)
  for (let d = 1; d <= maxDepth; d++) {
    const level = nodes.filter(n => n.depth === d)
    // Siblings in sortOrder, branches in topic order, so growth interleaves fairly.
    level.sort((a, b) => (l1s.findIndex(l => l.id === branchOf.get(a.id)) - l1s.findIndex(l => l.id === branchOf.get(b.id))) || ((a.sortOrder ?? 0) - (b.sortOrder ?? 0)))
    for (const n of level) place(n)
  }

  return nodes.map(n => {
    const c = cellOf.get(n.id)
    if (!c) return n
    const { x, y } = axialToCenter(c[0], c[1], R)
    return { ...n, x: x - R, y: y - R, width: R * 2, height: R * 2, manuallyPositioned: false }
  })
}

/** Web: text-fit cells on rings around the root, joined by connector lines. */
function computeWebLayout(nodes: MindmapNode[]): MindmapNode[] {
  const root = nodes.find(n => n.parentId === null)
  if (!root) return nodes

  const { descendantCounts } = computeSubtreeCounts(nodes)
  const weight = (id: string) => descendantCounts.get(id) ?? 0

  const childrenOf = new Map<string, MindmapNode[]>()
  for (const n of nodes) {
    if (!n.parentId) continue
    const arr = childrenOf.get(n.parentId)
    if (arr) arr.push(n)
    else childrenOf.set(n.parentId, [n])
  }
  for (const arr of childrenOf.values()) arr.sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))

  const result: MindmapNode[] = []
  const size = combSizeOf(nodes)
  const cellR = new Map(nodes.map(n => [n.id, hexCellRadius(n, size)]))
  const rootR = cellR.get(root.id) ?? hexRadius(0, size)
  result.push(root.manuallyPositioned
    ? root
    : { ...root, x: -rootR, y: -rootR, width: rootR * 2, height: rootR * 2 })

  // 1. Every node gets an angular slice: the root's children split the full circle,
  //    and each child splits its own slice among its children, weighted by subtree size.
  const mid = new Map<string, number>()
  const span = new Map<string, number>()
  const assign = (kids: MindmapNode[], start: number, total: number, minSpan: number) => {
    if (!kids.length) return
    const spans = sectorSpans(kids.map(k => weight(k.id)), total, Math.min(minSpan, total / kids.length))
    let a = start
    kids.forEach((kid, i) => {
      mid.set(kid.id, a + spans[i] / 2)
      span.set(kid.id, spans[i])
      assign(childrenOf.get(kid.id) ?? [], a, spans[i], CHILD_MIN_SECTOR)
      a += spans[i]
    })
  }
  assign(childrenOf.get(root.id) ?? [], START_ANGLE, TAU, MIN_SECTOR)

  // 2. One ring per depth: far enough out to clear the ring inside it, and wide enough
  //    that the narrowest slice on it still holds a cell plus a gap.
  const maxDepth = nodes.reduce((m, n) => Math.max(m, n.depth), 0)
  const maxR: number[] = []
  for (let d = 0; d <= maxDepth; d++) {
    maxR.push(nodes.reduce((m, n) => n.depth === d ? Math.max(m, cellR.get(n.id) ?? 0) : m, hexRadius(d, size)))
  }
  const ring: number[] = [0]
  for (let d = 1; d <= maxDepth; d++) {
    let r = ring[d - 1] + maxR[d - 1] + maxR[d] + (d === 1 ? RING_GAP_1 : RING_GAP)
    for (const n of nodes) {
      if (n.depth !== d) continue
      const s = span.get(n.id)
      if (s && s > 0) r = Math.max(r, (2 * (cellR.get(n.id) ?? 0) + CELL_GAP) / s)
    }
    ring.push(r)
  }

  // 3. Place: centre of each cell at its slice's middle angle on its depth's ring.
  //    Manually positioned nodes keep their own box, like every other layout here.
  for (const n of nodes) {
    if (n.id === root.id) continue
    const angle = mid.get(n.id)
    if (angle === undefined || n.manuallyPositioned) { result.push(n); continue }
    const r = cellR.get(n.id) ?? hexRadius(n.depth, size)
    const cx = Math.cos(angle) * ring[n.depth]
    const cy = Math.sin(angle) * ring[n.depth]
    result.push({ ...n, x: cx - r, y: cy - r, width: r * 2, height: r * 2 })
  }

  // Sectors and rings already keep cells apart; 1 relax pass is a safety net for a
  // dragged cell, and the outward fix-up keeps a child beyond its parent afterwards.
  relaxHexCircles(result)
  enforceOutwardOrder(result)
  return result
}

/**
 * relaxHexCircles moves every cell independently by its own local overlaps, which
 * can occasionally tuck a wide-arc child back in past its own parent (the arc a
 * cluster sweeps can pass close to a crowded neighbour, and the push meant to clear
 * that neighbour can land the child closer to the root than the parent it hangs
 * off). This walks the tree shallowest-first and nudges any such child straight
 * outward, along its own angle from the root, just past its parent - so a branch
 * always reads as growing away from the centre, never doubling back over it.
 */
function enforceOutwardOrder(placed: MindmapNode[]): void {
  const byId = new Map(placed.map(n => [n.id, n]))
  const ordered = [...placed].sort((a, b) => a.depth - b.depth)
  for (const n of ordered) {
    if (!n.parentId || n.manuallyPositioned) continue
    const parent = byId.get(n.parentId)
    if (!parent) continue
    const pcx = parent.x + parent.width / 2, pcy = parent.y + parent.height / 2
    const cx = n.x + n.width / 2, cy = n.y + n.height / 2
    const pDist = Math.hypot(pcx, pcy)
    const cDist = Math.hypot(cx, cy)
    const minDist = pDist + n.width / 2
    if (cDist >= minDist) continue
    const angle = cDist > 0 ? Math.atan2(cy, cx) : Math.atan2(cy - pcy, cx - pcx)
    const r = n.width / 2
    n.x = Math.cos(angle) * minDist - r
    n.y = Math.sin(angle) * minDist - r
  }
}

/** Deterministic pass count for relaxHexCircles - fixed, so two runs on the same map agree. */
const RELAX_ITERATIONS = 60

/**
 * Push overlapping cells apart. A hex cell's footprint IS its bounding circle - the
 * label is drawn inside the cell, not beside it like the mind map's circles - so this
 * separates bounding circles directly along the line between their centres, instead
 * of reusing computeMindmapLayout's box-and-external-label relaxRadial (built for a
 * shape whose label lives outside it). The root and every manually-positioned node
 * are pinned; everything else shares the push evenly.
 */
function relaxHexCircles(placed: MindmapNode[]): void {
  const movable = placed.map(n => n.depth > 0 && !n.manuallyPositioned)
  if (!movable.some(Boolean)) return

  for (let pass = 0; pass < RELAX_ITERATIONS; pass++) {
    let moved = false
    for (let i = 0; i < placed.length; i++) {
      for (let j = i + 1; j < placed.length; j++) {
        if (!movable[i] && !movable[j]) continue
        const a = placed[i], b = placed[j]
        const acx = a.x + a.width / 2, acy = a.y + a.height / 2
        const bcx = b.x + b.width / 2, bcy = b.y + b.height / 2
        const minDist = a.width / 2 + b.width / 2
        const dx = bcx - acx, dy = bcy - acy
        const dist = Math.hypot(dx, dy)
        if (dist >= minDist) continue
        const overlap = minDist - dist
        // Two cells landing on the exact same point (should not happen in practice)
        // get pushed along a fixed axis so they don't divide by zero.
        const ux = dist > 0 ? dx / dist : 1
        const uy = dist > 0 ? dy / dist : 0
        const share = movable[i] && movable[j] ? 0.5 : 1
        if (movable[i]) { a.x -= ux * overlap * share; a.y -= uy * overlap * share }
        if (movable[j]) { b.x += ux * overlap * share; b.y += uy * overlap * share }
        moved = true
      }
    }
    if (!moved) return
  }
}

