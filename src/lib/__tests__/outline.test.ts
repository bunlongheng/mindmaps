import { describe, it, expect } from 'vitest'
import { parseIndentedOutline } from '../outline'

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
