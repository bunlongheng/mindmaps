import { describe, it, expect } from 'vitest'
import {
  computeMindmapLayout, wrapText, sectorSpans, radialDiameter, diameterBand,
  relaxRadial, radialLabelFor, radialLabelSide, radialNodeExtent, truncateLabel,
  labelMaxChars, MIN_SECTOR, ROOT_MIN_DIAMETER,
} from '../mindmap'
import type { MindmapNode } from '../../../types'

function node(overrides: Partial<MindmapNode> & { id: string }): MindmapNode {
  return {
    title: 'Node',
    color: '#6366f1',
    parentId: null,
    depth: 0,
    x: 0,
    y: 0,
    width: 0,
    height: 0,
    ...overrides,
  }
}

function byId(nodes: MindmapNode[], id: string) {
  return nodes.find(n => n.id === id)!
}

function center(n: MindmapNode) {
  return { cx: n.x + n.width / 2, cy: n.y + n.height / 2 }
}

function dist(a: MindmapNode, b: MindmapNode) {
  const ca = center(a)
  const cb = center(b)
  return Math.hypot(ca.cx - cb.cx, ca.cy - cb.cy)
}

function angleFromRoot(n: MindmapNode, root: MindmapNode) {
  const c = center(n), r = center(root)
  return Math.atan2(c.cy - r.cy, c.cx - r.cx)
}

/** Every pair of circles in the map, with how far they overlap (negative = clear). */
function worstOverlap(nodes: MindmapNode[]): { overlap: number; pair: string } {
  let worst = -Infinity
  let pair = ''
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const a = nodes[i], b = nodes[j]
      const overlap = (a.width / 2 + b.width / 2) - dist(a, b)
      if (overlap > worst) { worst = overlap; pair = `${a.id}/${b.id}` }
    }
  }
  return { overlap: worst, pair }
}

/** root + 6 topics with very uneven subtrees, 44 nodes in total. */
function unevenFixture(): MindmapNode[] {
  const out: MindmapNode[] = [node({ id: 'root', depth: 0, title: 'Everything' })]
  const shape = [12, 8, 5, 3, 2, 1]  // depth-2 children per topic
  shape.forEach((kids, t) => {
    out.push(node({ id: `t${t}`, parentId: 'root', depth: 1, sortOrder: t, title: `Topic ${t}` }))
    for (let k = 0; k < kids; k++) {
      out.push(node({ id: `t${t}c${k}`, parentId: `t${t}`, depth: 2, sortOrder: k, title: `Sub ${t}.${k}` }))
      if (k < 2) {
        out.push(node({ id: `t${t}c${k}d`, parentId: `t${t}c${k}`, depth: 3, sortOrder: 0, title: `Leaf ${t}.${k}` }))
      }
    }
  })
  return out
}

describe('wrapText', () => {
  it('returns the whole text as one line when it fits', () => {
    expect(wrapText('hello world', 100)).toEqual(['hello world'])
  })

  it('breaks onto new lines when the running line would overflow', () => {
    const lines = wrapText('aaaa bbbb cccc', 8)
    expect(lines.length).toBeGreaterThan(1)
    // each line should respect the cap reasonably (single words can exceed)
    expect(lines[0]).toBe('aaaa')
  })

  it('keeps an over-long single word on its own line', () => {
    const lines = wrapText('supercalifragilistic word', 5)
    expect(lines[0]).toBe('supercalifragilistic')
  })

  it('returns the original text for an empty string (no lines collected)', () => {
    expect(wrapText('', 10)).toEqual([''])
  })

  it('splits on arbitrary whitespace runs', () => {
    expect(wrapText('a   b', 100)).toEqual(['a b'])
  })
})

describe('radialDiameter', () => {
  it('grows with the descendant count and never leaves the depth band', () => {
    const [min, max] = diameterBand(1)
    const sizes = [0, 1, 4, 9, 25, 100].map(d => radialDiameter(1, d, 100))
    for (let i = 1; i < sizes.length; i++) expect(sizes[i]).toBeGreaterThanOrEqual(sizes[i - 1])
    for (const s of sizes) {
      expect(s).toBeGreaterThanOrEqual(min)
      expect(s).toBeLessThanOrEqual(max)
    }
    expect(sizes[0]).toBe(min)
    expect(sizes[sizes.length - 1]).toBe(max)
  })

  it('clamps a count past the scale to the top of the band', () => {
    expect(radialDiameter(2, 500, 10)).toBe(diameterBand(2)[1])
  })

  it('falls back to the band minimum when nothing in the depth has descendants', () => {
    expect(radialDiameter(1, 0, 0)).toBe(diameterBand(1)[0])
  })

  it('bands step down by depth: topics, sub-topics, then dots', () => {
    expect(diameterBand(1)).toEqual([44, 96])
    expect(diameterBand(2)).toEqual([22, 36])
    expect(diameterBand(3)).toEqual([5, 8])
    expect(diameterBand(7)).toEqual(diameterBand(3))  // deeper levels share the dot band
  })
})

describe('sectorSpans', () => {
  it('splits the circle in proportion to the weights', () => {
    const spans = sectorSpans([30, 10, 20], Math.PI * 2, 0)
    expect(spans[0] / spans[1]).toBeCloseTo(3, 5)
    expect(spans[2] / spans[1]).toBeCloseTo(2, 5)
    expect(spans.reduce((s, v) => s + v, 0)).toBeCloseTo(Math.PI * 2, 5)
  })

  it('gives a one-leaf branch at least the minimum sector', () => {
    const spans = sectorSpans([200, 1], Math.PI * 2, MIN_SECTOR)
    expect(spans[1]).toBeGreaterThanOrEqual(MIN_SECTOR * 0.9)
    expect(spans[0]).toBeGreaterThan(spans[1])
  })

  it('never hands out more than an even split as a floor', () => {
    const spans = sectorSpans([1, 1, 1, 1], 0.4, MIN_SECTOR)
    expect(spans.reduce((s, v) => s + v, 0)).toBeCloseTo(0.4, 5)
  })

  it('returns nothing for no children', () => {
    expect(sectorSpans([], Math.PI, MIN_SECTOR)).toEqual([])
  })

  it('splits evenly when every weight is zero', () => {
    const spans = sectorSpans([0, 0, 0], Math.PI * 2, 0)
    for (const s of spans) expect(s).toBeCloseTo((Math.PI * 2) / 3, 5)
  })
})

describe('computeMindmapLayout', () => {
  it('returns input unchanged when there is no root', () => {
    const input = [node({ id: 'a', parentId: 'x', depth: 1 })]
    expect(computeMindmapLayout(input)).toBe(input)
  })

  it('places a lone root centered at the origin as a circle', () => {
    const out = computeMindmapLayout([node({ id: 'root', depth: 0, title: 'Center' })])
    expect(out).toHaveLength(1)
    const root = byId(out, 'root')
    expect(root.width).toBe(root.height) // circle: square box
    expect(root.width).toBeGreaterThanOrEqual(ROOT_MIN_DIAMETER)
    // centered on origin
    expect(root.x).toBeCloseTo(-root.width / 2, 5)
    expect(root.y).toBeCloseTo(-root.height / 2, 5)
  })

  it('keeps a manually-positioned root untouched', () => {
    const root = node({ id: 'root', depth: 0, manuallyPositioned: true, x: 999, y: 888, width: 123, height: 124 })
    const out = computeMindmapLayout([root])
    const r = byId(out, 'root')
    expect(r.x).toBe(999)
    expect(r.y).toBe(888)
    expect(r).toBe(root) // pushed as-is
  })

  it('sizes every node as a circle in its own depth band', () => {
    const out = computeMindmapLayout(unevenFixture())
    for (const n of out) {
      expect(n.width).toBe(n.height)
      if (n.depth === 0) continue
      const [min, max] = diameterBand(n.depth)
      expect(n.width).toBeGreaterThanOrEqual(min)
      expect(n.width).toBeLessThanOrEqual(max)
    }
  })

  it('scales a topic circle by how much hangs off it', () => {
    const out = computeMindmapLayout(unevenFixture())
    const heaviest = byId(out, 't0')   // 12 children + 2 leaves
    const middle = byId(out, 't2')     // 5 children + 2 leaves
    const lightest = byId(out, 't5')   // 1 child
    expect(heaviest.width).toBeGreaterThan(middle.width)
    expect(middle.width).toBeGreaterThan(lightest.width)
    expect(heaviest.width).toBe(diameterBand(1)[1])   // the heaviest tops the band
    expect(lightest.width).toBeGreaterThanOrEqual(diameterBand(1)[0])
  })

  it('gives a heavy topic a wider angular berth than a one-leaf topic', () => {
    const out = computeMindmapLayout(unevenFixture())
    const root = byId(out, 'root')
    const topics = out.filter(n => n.depth === 1)
      .map(n => ({ id: n.id, a: angleFromRoot(n, root) }))
      .sort((p, q) => p.a - q.a)
    const gapAround = (id: string) => {
      const i = topics.findIndex(t => t.id === id)
      const prev = topics[(i - 1 + topics.length) % topics.length]
      const next = topics[(i + 1) % topics.length]
      const wrap = (v: number) => ((v % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2)
      return wrap(next.a - topics[i].a) + wrap(topics[i].a - prev.a)
    }
    expect(gapAround('t0')).toBeGreaterThan(gapAround('t5'))
  })

  it('pushes every ring further out than the one inside it', () => {
    const out = computeMindmapLayout(unevenFixture())
    const root = byId(out, 'root')
    const meanR = (depth: number) => {
      const at = out.filter(n => n.depth === depth)
      return at.reduce((s, n) => s + dist(n, root), 0) / at.length
    }
    expect(meanR(1)).toBeGreaterThan(root.width / 2)
    expect(meanR(2)).toBeGreaterThan(meanR(1))
    expect(meanR(3)).toBeGreaterThan(meanR(2))
  })

  it('leaves no two circles overlapping after the relaxation pass', () => {
    const out = computeMindmapLayout(unevenFixture())
    const { overlap, pair } = worstOverlap(out)
    expect(`${pair}:${overlap <= 0}`).toBe(`${pair}:true`)
  })

  it('leaves no two circles overlapping on a wide flat map', () => {
    const nodes: MindmapNode[] = [node({ id: 'root', depth: 0 })]
    for (let i = 0; i < 24; i++) {
      nodes.push(node({ id: `l1_${i}`, parentId: 'root', depth: 1, sortOrder: i, title: `Topic ${i}` }))
      for (let k = 0; k < 3; k++) {
        nodes.push(node({ id: `l2_${i}_${k}`, parentId: `l1_${i}`, depth: 2, sortOrder: k }))
      }
    }
    const out = computeMindmapLayout(nodes)
    expect(worstOverlap(out).overlap).toBeLessThanOrEqual(0)
  })

  it('leaves the node data alone apart from the box: no font size is written in', () => {
    const out = computeMindmapLayout([
      node({ id: 'root', depth: 0 }),
      node({ id: 'l1', parentId: 'root', depth: 1, sortOrder: 0 }),
      node({ id: 'l2', parentId: 'l1', depth: 2, sortOrder: 0, fontSize: 19 }),
    ])
    expect(byId(out, 'l1').fontSize).toBeUndefined()
    expect(byId(out, 'l2').fontSize).toBe(19)   // an explicit size is never overwritten
  })

  it('honours an explicit shape instead of the depth band', () => {
    const out = computeMindmapLayout([
      node({ id: 'root', depth: 0 }),
      node({ id: 'l1', parentId: 'root', depth: 1, sortOrder: 0 }),
      node({ id: 'circ', parentId: 'l1', depth: 2, sortOrder: 0, title: 'A big round one', shape: 'circle' }),
      node({ id: 'pill', parentId: 'l1', depth: 2, sortOrder: 1, title: 'A pill shaped one', shape: 'pill' }),
    ])
    const circ = byId(out, 'circ')
    expect(circ.width).toBe(circ.height)
    expect(circ.width).toBeGreaterThan(diameterBand(2)[1])   // sized to its own label
    const pill = byId(out, 'pill')
    expect(pill.width).toBeGreaterThan(pill.height)
  })

  it('keeps manually-positioned non-root nodes in place', () => {
    const out = computeMindmapLayout([
      node({ id: 'root', depth: 0 }),
      node({ id: 'fixed', parentId: 'root', depth: 1, sortOrder: 0, manuallyPositioned: true, x: 1234, y: 5678, width: 50, height: 50 }),
      node({ id: 'free', parentId: 'root', depth: 1, sortOrder: 1 }),
    ])
    const fixed = byId(out, 'fixed')
    expect(fixed.x).toBe(1234)
    expect(fixed.y).toBe(5678)
  })

  it('appends nodes that are not reachable from the root (orphans)', () => {
    const out = computeMindmapLayout([
      node({ id: 'root', depth: 0 }),
      node({ id: 'l1', parentId: 'root', depth: 1, sortOrder: 0 }),
      node({ id: 'orphan', parentId: 'ghost', depth: 1, sortOrder: 0 }),
    ])
    expect(byId(out, 'orphan')).toBeDefined()
    expect(out).toHaveLength(3)
  })

  it('handles two nodes sharing the exact same center (zero distance fallback)', () => {
    // Identical centres carry no push direction; both are pinned, so they stay put
    // and nothing in the map goes NaN.
    const out = computeMindmapLayout([
      node({ id: 'root', depth: 0 }),
      node({ id: 'l1', parentId: 'root', depth: 1, sortOrder: 0 }),
      node({ id: 'p', parentId: 'l1', depth: 2, sortOrder: 0, manuallyPositioned: true, x: 200, y: 200, width: 60, height: 60 }),
      node({ id: 'q', parentId: 'p', depth: 3, sortOrder: 0, manuallyPositioned: true, x: 200, y: 200, width: 60, height: 60 }),
    ])
    for (const n of out) {
      expect(Number.isFinite(n.x)).toBe(true)
      expect(Number.isFinite(n.y)).toBe(true)
    }
    const p = byId(out, 'p')
    const q = byId(out, 'q')
    expect(p.x).toBe(q.x)
    expect(p.y).toBe(q.y)
  })

  it('handles deep (depth 4+) subtrees through the default bands', () => {
    const out = computeMindmapLayout([
      node({ id: 'root', depth: 0 }),
      node({ id: 'l1', parentId: 'root', depth: 1, sortOrder: 0 }),
      node({ id: 'l2', parentId: 'l1', depth: 2, sortOrder: 0 }),
      node({ id: 'l3', parentId: 'l2', depth: 3, sortOrder: 0 }),
      node({ id: 'l4', parentId: 'l3', depth: 4, sortOrder: 0 }),
      node({ id: 'l5', parentId: 'l4', depth: 5, sortOrder: 0 }),
    ])
    for (const n of out) {
      expect(Number.isFinite(n.x)).toBe(true)
      expect(Number.isFinite(n.y)).toBe(true)
      expect(n.width).toBeGreaterThan(0)
      expect(n.height).toBeGreaterThan(0)
    }
  })

  it('sorts siblings with no sortOrder via the fallback (treated as 0)', () => {
    const out = computeMindmapLayout([
      node({ id: 'root', depth: 0 }),
      node({ id: 'a', parentId: 'root', depth: 1 }),
      node({ id: 'b', parentId: 'root', depth: 1 }),
      node({ id: 'a1', parentId: 'a', depth: 2 }),
      node({ id: 'a2', parentId: 'a', depth: 2 }),
    ])
    expect(out).toHaveLength(5)
    for (const n of out) {
      expect(Number.isFinite(n.x)).toBe(true)
      expect(Number.isFinite(n.y)).toBe(true)
    }
  })

  it('lays the same map out identically twice (no randomness anywhere)', () => {
    const a = computeMindmapLayout(unevenFixture()).map(n => `${n.id}:${n.x}:${n.y}:${n.width}`)
    const b = computeMindmapLayout(unevenFixture()).map(n => `${n.id}:${n.x}:${n.y}:${n.width}`)
    expect(a).toEqual(b)
  })
})

describe('relaxRadial', () => {
  it('separates two overlapping circles and pins the ones it must not move', () => {
    const fixed = node({ id: 'fixed', parentId: 'root', depth: 1, manuallyPositioned: true, x: 0, y: 0, width: 60, height: 60 })
    const free = node({ id: 'free', parentId: 'root', depth: 1, x: 10, y: 0, width: 60, height: 60 })
    relaxRadial([fixed, free])
    expect(fixed.x).toBe(0)                       // manual placement is never touched
    expect(free.x).toBeGreaterThan(60)            // pushed clear of the pinned circle
  })

  it('never moves the root', () => {
    const root = node({ id: 'root', depth: 0, x: 0, y: 0, width: 180, height: 180 })
    const kid = node({ id: 'k', parentId: 'root', depth: 1, x: 40, y: 40, width: 44, height: 44 })
    relaxRadial([root, kid])
    expect(root.x).toBe(0)
    expect(root.y).toBe(0)
    expect(Math.hypot((kid.x + 22) - 90, (kid.y + 22) - 90)).toBeGreaterThan(90 + 22)
  })
})


// ── Labels ───────────────────────────────────────────────────────────────────
// A label hangs outside its circle, so it is part of the node's footprint: nothing
// the layout does may leave one lying across another label or a foreign circle.

interface Rect { id: string; x: number; y: number; w: number; h: number }

function rootCentre(out: MindmapNode[]) {
  const r = out.find(n => n.depth === 0)!
  return { x: r.x + r.width / 2, y: r.y + r.height / 2 }
}

/** Every drawn label box in world coordinates. */
function labelRects(out: MindmapNode[]): Rect[] {
  const c = rootCentre(out)
  const rects: Rect[] = []
  for (const n of out) {
    const l = radialLabelFor(n, c.x, c.y)
    if (l) rects.push({ id: n.id, x: n.x + l.box.x, y: n.y + l.box.y, w: l.box.w, h: l.box.h })
  }
  return rects
}

function rectsOverlap(a: Rect, b: Rect) {
  return Math.min(a.x + a.w, b.x + b.w) > Math.max(a.x, b.x)
    && Math.min(a.y + a.h, b.y + b.h) > Math.max(a.y, b.y)
}

/** True when a circle's disc reaches into a rectangle. */
function circleHitsRect(n: MindmapNode, r: Rect) {
  const cx = n.x + n.width / 2, cy = n.y + n.height / 2, rad = n.width / 2
  const nx = Math.max(r.x, Math.min(cx, r.x + r.w))
  const ny = Math.max(r.y, Math.min(cy, r.y + r.h))
  return Math.hypot(cx - nx, cy - ny) < rad
}

/** One crowded wedge: 12 depth-2 nodes carrying sentence-long titles. */
function crowdedWedgeFixture(): MindmapNode[] {
  const long = (i: number) => `Hook reads the file on each prompt - flips on next message ${i}`
  const out: MindmapNode[] = [node({ id: 'root', depth: 0, title: 'Jev Router' })]
  out.push(node({ id: 'dense', parentId: 'root', depth: 1, sortOrder: 0, title: 'Switch (current: ON, Jev decides)' }))
  for (let k = 0; k < 12; k++) {
    out.push(node({ id: `d${k}`, parentId: 'dense', depth: 2, sortOrder: k, title: long(k) }))
  }
  // Five more topics, each heavy with leaves, so 'dense' is squeezed into a narrow wedge
  for (let t = 1; t <= 5; t++) {
    out.push(node({ id: `t${t}`, parentId: 'root', depth: 1, sortOrder: t, title: `Topic ${t}` }))
    for (let k = 0; k < 8; k++) out.push(node({ id: `t${t}c${k}`, parentId: `t${t}`, depth: 2, sortOrder: k, title: `Sub ${t}.${k}` }))
  }
  return out
}

describe('truncateLabel', () => {
  it('leaves a short title alone', () => {
    expect(truncateLabel('Supervised', 32)).toBe('Supervised')
  })

  it('cuts a long one to the limit, ellipsis included in the count', () => {
    const long = 'Hook reads the file on each prompt - flips on next message, no restart'
    const cut = truncateLabel(long, 32)
    expect(cut.length).toBeLessThanOrEqual(32)
    expect(cut.endsWith('\u2026')).toBe(true)
    expect(long.startsWith(cut.slice(0, -1).trimEnd())).toBe(true)
  })

  it('never cuts at a depth that carries no label', () => {
    expect(labelMaxChars(3)).toBe(0)
    expect(truncateLabel('anything', labelMaxChars(3))).toBe('anything')
  })

  it('draws depth 1 longer than depth 2', () => {
    expect(labelMaxChars(1)).toBe(40)
    expect(labelMaxChars(2)).toBe(32)
  })
})

describe('radialLabelSide', () => {
  it('points outward: left half left, right half right', () => {
    expect(radialLabelSide(-300, 10)).toBe('left')
    expect(radialLabelSide(300, 10)).toBe('right')
  })

  it('clears the branch in the top and bottom bands', () => {
    expect(radialLabelSide(0, -300)).toBe('above')
    expect(radialLabelSide(0, 300)).toBe('below')
    expect(radialLabelSide(-20, -300)).toBe('above')   // still inside the 20 degree band
  })
})

describe('radial labels on a laid-out map', () => {
  it('cuts what is drawn and leaves the whole title in the node data', () => {
    const out = computeMindmapLayout(crowdedWedgeFixture())
    const c = rootCentre(out)
    const n = byId(out, 'd0')
    expect(n.title).toBe('Hook reads the file on each prompt - flips on next message 0')  // untouched
    const drawn = radialLabelFor(n, c.x, c.y)!
    expect(drawn.text.length).toBeLessThanOrEqual(32)
    expect(drawn.text.endsWith('\u2026')).toBe(true)
    // selecting the node puts the whole thing back
    expect(radialLabelFor(n, c.x, c.y, true)!.text).toBe(n.title)
  })

  it('leaves no two label boxes overlapping, even in the crowded wedge', () => {
    const rects = labelRects(computeMindmapLayout(crowdedWedgeFixture()))
    expect(rects.length).toBeGreaterThanOrEqual(18)
    const clashes: string[] = []
    for (let i = 0; i < rects.length; i++) {
      for (let j = i + 1; j < rects.length; j++) {
        if (rectsOverlap(rects[i], rects[j])) clashes.push(`${rects[i].id}/${rects[j].id}`)
      }
    }
    expect(clashes).toEqual([])
  })

  it('never lets a label box reach a circle it does not belong to', () => {
    const out = computeMindmapLayout(crowdedWedgeFixture())
    const rects = labelRects(out)
    const clashes: string[] = []
    for (const r of rects) {
      for (const n of out) {
        if (n.id === r.id) continue
        if (circleHitsRect(n, r)) clashes.push(`${r.id} label / ${n.id} circle`)
      }
    }
    expect(clashes).toEqual([])
  })

  it('extends a left-half label left of its circle and a right-half one right', () => {
    const out = computeMindmapLayout(crowdedWedgeFixture())
    const c = rootCentre(out)
    let sawLeft = false, sawRight = false
    for (const n of out.filter(d => d.depth === 2)) {
      const l = radialLabelFor(n, c.x, c.y)!
      if (l.side === 'left') { sawLeft = true; expect(n.x + l.box.x + l.box.w).toBeLessThanOrEqual(n.x) }
      if (l.side === 'right') { sawRight = true; expect(n.x + l.box.x).toBeGreaterThanOrEqual(n.x + n.width) }
    }
    expect(sawLeft).toBe(true)
    expect(sawRight).toBe(true)
  })

  it('folds the label box into the extent the fit and the previews measure', () => {
    const out = computeMindmapLayout(crowdedWedgeFixture())
    const c = rootCentre(out)
    const n = out.filter(d => d.depth === 2).find(d => radialLabelFor(d, c.x, c.y)!.side === 'left')!
    const e = radialNodeExtent(n, c.x, c.y)
    expect(e.left).toBeLessThan(n.x)                     // room kept for the label
    expect(e.right).toBe(n.x + n.width)
    const topic = out.find(d => d.depth === 1)!
    expect(radialNodeExtent(topic, c.x, c.y).bottom).toBeGreaterThan(topic.y + topic.height)
  })

  it('carries no label for the root or the dots', () => {
    const out = computeMindmapLayout(crowdedWedgeFixture())
    const c = rootCentre(out)
    expect(radialLabelFor(byId(out, 'root'), c.x, c.y)).toBeNull()
    const dot = node({ id: 'x', parentId: 'd0', depth: 3, x: 10, y: 10, width: 6, height: 6 })
    expect(radialLabelFor(dot, c.x, c.y)).toBeNull()
  })

  it('leaves an explicitly shaped node its own box and inside label', () => {
    const shaped = node({ id: 's', parentId: 'root', depth: 2, shape: 'rect', x: 100, y: 0, width: 120, height: 40 })
    expect(radialLabelFor(shaped, 0, 0)).toBeNull()
    expect(radialNodeExtent(shaped, 0, 0)).toEqual({ left: 100, top: 0, right: 220, bottom: 40 })
  })
})
