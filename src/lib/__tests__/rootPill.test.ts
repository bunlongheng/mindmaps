import { describe, it, expect } from 'vitest'
import { rootPillWidth, rootPillFontSize, ROOT_PILL_MAX } from '../rootPill'

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
