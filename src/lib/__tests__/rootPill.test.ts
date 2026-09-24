import { describe, it, expect } from 'vitest'
import { rootPillWidth, rootPillFontSize, ROOT_PILL_MAX, rootCircleDiameter, rootTitleNeedsPill, ROOT_CIRCLE_MAX, rootDrawnWidth, ROOT_FONT } from '../rootPill'

describe('rootPillFontSize', () => {
  it('keeps the base font when the title fits within the max width', () => {
    expect(rootPillFontSize('Short title', 28)).toBe(28)
  })

  it('shrinks the font for titles too long for the max width', () => {
    const fs = rootPillFontSize('It’s Happening... Anthropic MYTHOS 1 Is Here!', 28)
    expect(fs).toBeLessThan(28)
    expect(fs).toBeGreaterThanOrEqual(15)
  })

  it('never shrinks below the 15px floor', () => {
    expect(rootPillFontSize('x'.repeat(500), 28)).toBe(15)
  })
})

describe('rootPillWidth', () => {
  it('grows with the title but never exceeds the max', () => {
    const w = rootPillWidth('It’s Happening... Anthropic MYTHOS 1 Is Here!', 28)
    expect(w).toBeGreaterThan(400)
    expect(w).toBeLessThanOrEqual(ROOT_PILL_MAX)
  })

  it('caps an extremely long title at the max width', () => {
    expect(rootPillWidth('x'.repeat(500), 28)).toBe(ROOT_PILL_MAX)
  })

  it('clamps to the 180px minimum for very short titles', () => {
    expect(rootPillWidth('Hi', 28)).toBe(180)
  })

  it('is deterministic for the same input (layout, render, and store agree)', () => {
    const title = 'A medium length root title here'
    expect(rootPillWidth(title, 28)).toBe(rootPillWidth(title, 28))
  })
})

describe('rootCircleDiameter', () => {
  it('clamps very short titles to the 180px minimum', () => {
    expect(rootCircleDiameter('Hi', 28)).toBe(180)
  })

  it('grows to fit a medium title without exceeding the max', () => {
    const d = rootCircleDiameter('Deploy Captain', 28)
    expect(d).toBeGreaterThan(180)
    expect(d).toBeLessThanOrEqual(ROOT_CIRCLE_MAX)
  })

  it('never exceeds ROOT_CIRCLE_MAX', () => {
    expect(rootCircleDiameter('x'.repeat(100), 28)).toBe(ROOT_CIRCLE_MAX)
  })
})

describe('rootTitleNeedsPill', () => {
  it('keeps a circle for titles that fit', () => {
    expect(rootTitleNeedsPill('Deploy Captain', 28)).toBe(false)
  })

  it('switches to a pill once a fitting circle would exceed the max', () => {
    expect(rootTitleNeedsPill('This title is far too long for a circle', 28)).toBe(true)
  })
})

describe('rootDrawnWidth', () => {
  // A stored width that no longer matches what the pill draws at ROOT_FONT.
  const STALE_W = 300
  const pillRoot = { depth: 0, title: 'Ping Network Utility', width: STALE_W }

  it('returns the stored width for non-root nodes', () => {
    expect(rootDrawnWidth({ depth: 1, title: 'Child', width: 160 }, 'logic-chart')).toBe(160)
  })

  it('ignores a stale stored width on a pill root', () => {
    // The trunk used to start at the stored 488 while the pill was drawn wider,
    // so the line ran inside the translucent pill.
    const drawn = rootDrawnWidth(pillRoot, 'logic-chart')
    expect(drawn).toBe(rootPillWidth(pillRoot.title, ROOT_FONT))
    expect(drawn).toBeGreaterThan(pillRoot.width)
  })

  it('honours an explicit shape over the title heuristic', () => {
    expect(rootDrawnWidth({ ...pillRoot, shape: 'circle' }, 'logic-chart')).toBe(STALE_W)
    expect(rootDrawnWidth({ depth: 0, title: 'Short', width: 200, shape: 'pill' }, 'logic-chart'))
      .toBe(rootPillWidth('Short', ROOT_FONT))
  })

  it('never pills the root in mindmap mode', () => {
    expect(rootDrawnWidth(pillRoot, 'mindmap')).toBe(STALE_W)
  })

  it('respects a node font size override', () => {
    expect(rootDrawnWidth({ ...pillRoot, fontSize: 30 }, 'logic-chart')).toBe(rootPillWidth(pillRoot.title, 30))
    // A small enough font lets the title fit a circle, so it stops being a pill.
    expect(rootDrawnWidth({ ...pillRoot, fontSize: 20 }, 'logic-chart')).toBe(STALE_W)
  })
})

describe('ROOT_FONT is the one default for every root helper', () => {
  const title = 'Ping Network Utility'

  it('rootPillFontSize defaults to ROOT_FONT', () => {
    expect(rootPillFontSize(title)).toBe(rootPillFontSize(title, ROOT_FONT))
  })

  it('rootPillWidth defaults to ROOT_FONT', () => {
    expect(rootPillWidth(title)).toBe(rootPillWidth(title, ROOT_FONT))
  })

  it('rootCircleDiameter defaults to ROOT_FONT', () => {
    expect(rootCircleDiameter(title)).toBe(rootCircleDiameter(title, ROOT_FONT))
  })

  it('rootTitleNeedsPill defaults to ROOT_FONT', () => {
    expect(rootTitleNeedsPill(title)).toBe(rootTitleNeedsPill(title, ROOT_FONT))
  })

  it('rootDrawnWidth with no explicit fontSize measures at ROOT_FONT', () => {
    const node = { depth: 0, title, width: 300, shape: 'pill' }
    expect(rootDrawnWidth(node, 'logic-chart')).toBe(rootPillWidth(title, ROOT_FONT))
  })
})
