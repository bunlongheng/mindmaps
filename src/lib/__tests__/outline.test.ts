import { describe, it, expect } from 'vitest'
import {
  parseIndentedOutline, normalizeOutlineRoots, assembleOutlineTree, flattenJsonOutline,
  computeNodeWidth, computeImportNodeWidth, computeGeneratedNodeWidth, OUTLINE_META_KEYS,
} from '../outline'

describe('parseIndentedOutline', () => {
  it('returns an empty array for empty text', () => {
    expect(parseIndentedOutline('')).toEqual([])
    expect(parseIndentedOutline('   \n  \n')).toEqual([])
  })

  it('parses a flat list with no indentation', () => {
    const result = parseIndentedOutline('A\nB\nC')
    expect(result).toEqual([
      { title: 'A', indent: 0 },
      { title: 'B', indent: 0 },
      { title: 'C', indent: 0 },
    ])
  })

  it('auto-detects a 2-space indent unit', () => {
    const result = parseIndentedOutline('Root\n  Child A\n  Child B\n    Grandchild')
    expect(result).toEqual([
      { title: 'Root', indent: 0 },
      { title: 'Child A', indent: 1 },
      { title: 'Child B', indent: 1 },
      { title: 'Grandchild', indent: 2 },
    ])
  })

  it('auto-detects a 4-space indent unit', () => {
    const result = parseIndentedOutline('Root\n    Child A\n    Child B\n        Grandchild')
    expect(result).toEqual([
      { title: 'Root', indent: 0 },
      { title: 'Child A', indent: 1 },
      { title: 'Child B', indent: 1 },
      { title: 'Grandchild', indent: 2 },
    ])
  })

  it('counts tabs directly as one level each, ignoring space-unit detection', () => {
    const result = parseIndentedOutline('Root\n\tChild A\n\t\tGrandchild')
    expect(result).toEqual([
      { title: 'Root', indent: 0 },
      { title: 'Child A', indent: 1 },
      { title: 'Grandchild', indent: 2 },
    ])
  })

  it('2-space and 4-space outlines with the same shape produce the same tree', () => {
    const twoSpace = parseIndentedOutline('Root\n  Child\n    Leaf')
    const fourSpace = parseIndentedOutline('Root\n    Child\n        Leaf')
    expect(twoSpace).toEqual(fourSpace)
  })

  it('ignores blank lines', () => {
    const result = parseIndentedOutline('Root\n\n  Child\n\n')
    expect(result).toEqual([
      { title: 'Root', indent: 0 },
      { title: 'Child', indent: 1 },
    ])
  })

  it('trims each title', () => {
    const result = parseIndentedOutline('  Root  \n    Child  ')
    expect(result.map(r => r.title)).toEqual(['Root', 'Child'])
  })
})

describe('normalizeOutlineRoots', () => {
  it('shifts indents so the minimum is 0', () => {
    const items = [{ title: 'Root', indent: 1 }, { title: 'Child', indent: 2 }]
    expect(normalizeOutlineRoots(items)).toEqual([
      { title: 'Root', indent: 0 },
      { title: 'Child', indent: 1 },
    ])
  })

  it('wraps multiple roots under a synthetic root titled after the first item', () => {
    const items = [{ title: 'A', indent: 0 }, { title: 'B', indent: 0 }, { title: 'C', indent: 0 }]
    expect(normalizeOutlineRoots(items)).toEqual([
      { title: 'A', indent: 0 },
      { title: 'A', indent: 1 },
      { title: 'B', indent: 1 },
      { title: 'C', indent: 1 },
    ])
  })

  it('leaves a single-root outline unchanged and preserves extra fields', () => {
    const items = [{ title: 'Root', indent: 0, icon: 'zap' }, { title: 'Child', indent: 1 }]
    expect(normalizeOutlineRoots(items)).toEqual(items)
    expect(items[0].icon).toBe('zap')
  })

  it('returns an empty array untouched', () => {
    expect(normalizeOutlineRoots([])).toEqual([])
  })
})

describe('assembleOutlineTree', () => {
  it('builds parent indices, depths, and per-sibling sort orders', () => {
    const { parentIndex, depths, sortOrders } = assembleOutlineTree([
      { title: 'Root', indent: 0 },
      { title: 'A', indent: 1 },
      { title: 'A1', indent: 2 },
      { title: 'B', indent: 1 },
    ])
    expect(parentIndex).toEqual([null, 0, 1, 0])
    expect(depths).toEqual([0, 1, 2, 1])
    expect(sortOrders).toEqual([0, 0, 0, 1])
  })

  it('reports sibling totals per parent index', () => {
    const { siblingTotals } = assembleOutlineTree([
      { title: 'Root', indent: 0 },
      { title: 'A', indent: 1 },
      { title: 'B', indent: 1 },
    ])
    expect(siblingTotals.get(null)).toBe(1)
    expect(siblingTotals.get(0)).toBe(2)
  })

  it('reattaches a sibling after a deep branch to the correct parent', () => {
    const { parentIndex } = assembleOutlineTree([
      { title: 'Root', indent: 0 },
      { title: 'A', indent: 1 },
      { title: 'A1', indent: 2 },
      { title: 'A1a', indent: 3 },
      { title: 'A2', indent: 2 },
    ])
    expect(parentIndex).toEqual([null, 0, 1, 2, 1])
  })
})

describe('node width formulas (divergence is intentional, see outline.ts)', () => {
  it('computeNodeWidth clamps to 140..400 and widens for icons', () => {
    expect(computeNodeWidth('ab', 1, false)).toBe(140)
    expect(computeNodeWidth('x'.repeat(80), 1, false)).toBe(400)
    const plain = computeNodeWidth('A medium title', 2, false)
    expect(computeNodeWidth('A medium title', 2, true)).toBe(Math.ceil(plain / 0.8))
  })

  it('computeImportNodeWidth matches the legacy import formula', () => {
    expect(computeImportNodeWidth('anything', 0)).toBe(180)
    expect(computeImportNodeWidth('Hello', 1)).toBe(Math.max(100, 5 * 7.5 + 32))
    expect(computeImportNodeWidth('x'.repeat(50), 2)).toBe(260)
  })

  it('computeGeneratedNodeWidth matches the legacy generate formula', () => {
    expect(computeGeneratedNodeWidth('anything', 0)).toBe(180)
    expect(computeGeneratedNodeWidth('Hello', 1)).toBe(Math.max(120, Math.ceil(5 * 10.24) + 32))
    expect(computeGeneratedNodeWidth('x'.repeat(60), 3)).toBe(300)
  })
})

describe('flattenJsonOutline', () => {
  const opts = {
    metaKeys: OUTLINE_META_KEYS,
    computeWidth: computeImportNodeWidth,
    rootColor: '#111111',
    branchColor: (i: number) => ['#aa0000', '#00aa00'][i % 2],
  }

  it('returns null for non-object or empty input', () => {
    expect(flattenJsonOutline('nope', opts)).toBeNull()
    expect(flattenJsonOutline(['nope'], opts)).toBeNull()
    expect(flattenJsonOutline({}, opts)).toBeNull()
  })

  it('flattens a root with branches and string leaves, inheriting branch colors', () => {
    const result = flattenJsonOutline({ Root: [{ icon: 'zap', A: ['a1', 'a2'] }, 'B'] }, opts)
    expect(result).not.toBeNull()
    const { title, nodes } = result!
    expect(title).toBe('Root')
    expect(nodes.map(n => n.title)).toEqual(['Root', 'A', 'a1', 'a2', 'B'])
    expect(nodes.map(n => n.depth)).toEqual([0, 1, 2, 2, 1])
    expect(nodes[0]).toMatchObject({ parentId: null, width: 180, height: 180, color: '#111111' })
    expect(nodes[1]).toMatchObject({ color: '#aa0000', icon: 'zap', height: 40 })
    expect(nodes[2].parentId).toBe(nodes[1].id)
    expect(nodes[2].color).toBe('#aa0000') // leaves inherit the branch color
    // string leaves directly under the root inherit the root color (legacy behavior)
    expect(nodes[4].color).toBe('#111111')
  })

  it('caps branches at 12 and children at 10', () => {
    const branches = Array.from({ length: 15 }, (_, i) => `b${i}`)
    const kids = Array.from({ length: 14 }, (_, i) => `k${i}`)
    const capped = flattenJsonOutline({ Root: branches }, opts)!
    expect(capped.nodes).toHaveLength(1 + 12)
    const deep = flattenJsonOutline({ Root: [{ A: kids }] }, opts)!
    expect(deep.nodes).toHaveLength(1 + 1 + 10)
  })

  it('honors explicit node colors only when useExplicitColor is set', () => {
    const json = { Root: [{ color: '#123456', A: [] }] }
    const withOverride = flattenJsonOutline(json, { ...opts, useExplicitColor: true })!
    expect(withOverride.nodes[1].color).toBe('#123456')
    const without = flattenJsonOutline(json, opts)!
    expect(without.nodes[1].color).toBe('#aa0000')
  })

  it('passes emoji through only when useEmoji is set', () => {
    const json = { Root: [{ emoji: '🔥', A: [] }] }
    expect(flattenJsonOutline(json, { ...opts, useEmoji: true })!.nodes[1].emoji).toBe('🔥')
    expect(flattenJsonOutline(json, opts)!.nodes[1].emoji).toBeUndefined()
  })
})
