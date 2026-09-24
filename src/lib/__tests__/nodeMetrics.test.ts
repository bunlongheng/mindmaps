import { describe, it, expect } from 'vitest'
import {
  nodeMetrics, nodeFontSize, nodeHeight, nodePadX, nodeMinWidth, nodeWidth,
  estimateTextWidth, iconZoneWidth, MAX_METRIC_DEPTH, MIN_WIDTH_CHARS, ICON_GAP,
  CHAR_W_RATIO,
} from '../nodeMetrics'
import { ROOT_FONT, ROOT_PILL_H, ROOT_PILL_PAD } from '../rootPill'

const DEPTHS = Array.from({ length: MAX_METRIC_DEPTH }, (_, i) => i + 1)

describe('the box table', () => {
  it('builds its root row from the root constants, so there is one source', () => {
    expect(nodeMetrics(0)).toEqual({
      fontSize: ROOT_FONT,
      height: ROOT_PILL_H,
      padX: ROOT_PILL_PAD / 2,
    })
  })

  it('steps font size down, never up, from depth 1 to the deepest row', () => {
    for (let d = 2; d <= MAX_METRIC_DEPTH; d++) {
      expect(nodeFontSize(d)).toBeLessThanOrEqual(nodeFontSize(d - 1))
    }
    // and it actually steps down somewhere, rather than being one flat size
    expect(nodeFontSize(MAX_METRIC_DEPTH)).toBeLessThan(nodeFontSize(1))
  })

  it('steps height down, never up, from depth 1 to the deepest row', () => {
    for (let d = 2; d <= MAX_METRIC_DEPTH; d++) {
      expect(nodeHeight(d)).toBeLessThanOrEqual(nodeHeight(d - 1))
    }
    expect(nodeHeight(MAX_METRIC_DEPTH)).toBeLessThan(nodeHeight(1))
  })

  it('steps horizontal padding down, never up', () => {
    for (let d = 2; d <= MAX_METRIC_DEPTH; d++) {
      expect(nodePadX(d)).toBeLessThanOrEqual(nodePadX(d - 1))
    }
  })

  it('keeps the deepest label readable', () => {
    expect(nodeFontSize(MAX_METRIC_DEPTH)).toBeGreaterThanOrEqual(14)
  })

  it('gives a top-level topic a comfortable Xmind-like box at 100 percent', () => {
    expect(nodeMetrics(1)).toEqual({ fontSize: 20, height: 44, padX: 14 })
  })

  it('clamps every depth past the table to the deepest row', () => {
    expect(nodeMetrics(9)).toEqual(nodeMetrics(MAX_METRIC_DEPTH))
    expect(nodeMetrics(200)).toEqual(nodeMetrics(MAX_METRIC_DEPTH))
  })

  it('clamps a negative, fractional or non-finite depth to a real row', () => {
    expect(nodeMetrics(-3)).toEqual(nodeMetrics(0))
    expect(nodeMetrics(2.7)).toEqual(nodeMetrics(2))
    expect(nodeMetrics(NaN)).toEqual(nodeMetrics(0))
  })

  it('leaves the box taller than its own text at every depth', () => {
    for (const d of [0, ...DEPTHS]) {
      expect(nodeHeight(d)).toBeGreaterThan(nodeFontSize(d))
    }
  })
})

describe('nodeMinWidth', () => {
  it('fits MIN_WIDTH_CHARS of the depth’s own text plus both paddings', () => {
    for (const d of DEPTHS) {
      const m = nodeMetrics(d)
      expect(nodeMinWidth(d)).toBe(
        Math.ceil(MIN_WIDTH_CHARS * m.fontSize * CHAR_W_RATIO) + 2 * m.padX,
      )
    }
  })

  it('narrows with depth, like the boxes it floors', () => {
    for (let d = 2; d <= MAX_METRIC_DEPTH; d++) {
      expect(nodeMinWidth(d)).toBeLessThanOrEqual(nodeMinWidth(d - 1))
    }
  })
})

describe('nodeWidth', () => {
  it('is measured text plus both paddings once past the floor', () => {
    const text = estimateTextWidth('A reasonably long topic label', nodeFontSize(1))
    expect(nodeWidth(text, 1)).toBe(Math.ceil(text + 2 * nodePadX(1)))
  })

  it('never returns less than the depth floor', () => {
    expect(nodeWidth(0, 3)).toBe(nodeMinWidth(3))
  })

  it('adds exactly one icon zone when a badge is drawn', () => {
    const text = estimateTextWidth('A reasonably long topic label', nodeFontSize(1))
    expect(nodeWidth(text, 1, { hasIcon: true }) - nodeWidth(text, 1)).toBe(iconZoneWidth(1))
  })

  it('reserves the badge against the box height the caller draws', () => {
    expect(iconZoneWidth(1, 60)).toBe(60 + ICON_GAP)
    expect(iconZoneWidth(1)).toBe(nodeHeight(1) + ICON_GAP)
  })

  it('adds the extra geometry a layout asks for (the fishbone slant)', () => {
    const text = estimateTextWidth('Cookware and utensils', nodeFontSize(2))
    expect(nodeWidth(text, 2, { extra: 12 }) - nodeWidth(text, 2)).toBe(12)
  })
})

describe('estimateTextWidth', () => {
  it('measures the displayed label, not a markdown link’s raw text', () => {
    expect(estimateTextWidth('[Docs](https://example.com/a/very/long/url)', 20))
      .toBe(estimateTextWidth('Docs', 20))
  })

  it('grows with the font size', () => {
    expect(estimateTextWidth('Topic', 20)).toBeGreaterThan(estimateTextWidth('Topic', 14))
  })
})
